import Database from 'better-sqlite3';
import { parse } from 'csv-parse/sync';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '../apm_music.db');
const facetCsvPath = '/Users/echowreck/Downloads/APM Facet IDs and Labels(Sheet1).csv';

console.log('Loading APM Facet Taxonomy...');
console.log('Database:', dbPath);
console.log('CSV:', facetCsvPath);

// Read and parse CSV
const csvContent = fs.readFileSync(facetCsvPath, 'utf-8');
const records = parse(csvContent, {
  columns: true,
  skip_empty_lines: true,
  trim: true
});

console.log(`\nParsed ${records.length} facet entries from CSV`);

// Open database
const db = new Database(dbPath);

// Create facet_taxonomy table
console.log('\nCreating facet_taxonomy table...');
db.exec(`
  DROP TABLE IF EXISTS facet_taxonomy;

  CREATE TABLE facet_taxonomy (
    facet_id INTEGER PRIMARY KEY,
    facet_name TEXT NOT NULL,
    facet_label TEXT NOT NULL,
    category_id INTEGER,
    category_name TEXT,
    parent_id INTEGER,
    facet_level INTEGER NOT NULL,
    full_path TEXT NOT NULL
  );

  CREATE INDEX idx_facet_category ON facet_taxonomy(category_id);
  CREATE INDEX idx_facet_parent ON facet_taxonomy(parent_id);
  CREATE INDEX idx_facet_label ON facet_taxonomy(facet_label);
`);

// Category IDs (first 18 rows are categories)
const categoryIds = new Set([
  1000, 1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 1009,
  1019, 1020, 1021, 1022, 1023, 1024, 1025, 1028
]);

// Prepare insert statement
const insert = db.prepare(`
  INSERT INTO facet_taxonomy (
    facet_id, facet_name, facet_label, category_id, category_name,
    parent_id, facet_level, full_path
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

// Track categories for reference
const categories = {};

// Process records
const transaction = db.transaction((records) => {
  let categoryCount = 0;
  let facetCount = 0;

  for (const record of records) {
    const facetId = parseInt(record.ATTRIBUTE_ID);
    const fullName = record.ID;

    // Check if this is a category
    if (categoryIds.has(facetId)) {
      // This is a top-level category
      categories[facetId] = fullName;

      insert.run(
        facetId,           // facet_id
        fullName,          // facet_name
        fullName,          // facet_label (same as name for categories)
        facetId,           // category_id (self for categories)
        fullName,          // category_name
        null,              // parent_id (null for categories)
        0,                 // facet_level (0 for categories)
        fullName           // full_path
      );

      categoryCount++;
    } else {
      // This is a facet value - parse hierarchical structure
      const parts = fullName.split('|').map(p => p.trim());
      const categoryName = parts[0];
      const facetLabel = parts[parts.length - 1]; // Last part is the label
      const level = parts.length - 1; // 0 for category, 1 for first level, etc.

      // Find category ID by name
      let categoryId = null;
      for (const [catId, catName] of Object.entries(categories)) {
        if (catName === categoryName) {
          categoryId = parseInt(catId);
          break;
        }
      }

      // Determine parent_id (for hierarchical facets)
      // For now, we'll set parent_id to the category_id
      // More sophisticated parent tracking could be added later
      const parentId = level === 1 ? categoryId : null;

      insert.run(
        facetId,           // facet_id
        fullName,          // facet_name (full hierarchical name)
        facetLabel,        // facet_label (just the last part)
        categoryId,        // category_id
        categoryName,      // category_name
        parentId,          // parent_id
        level,             // facet_level
        fullName           // full_path
      );

      facetCount++;
    }
  }

  return { categoryCount, facetCount };
});

const { categoryCount, facetCount } = transaction(records);

console.log(`\n✅ Loaded ${categoryCount} categories`);
console.log(`✅ Loaded ${facetCount} facet values`);
console.log(`✅ Total: ${categoryCount + facetCount} entries`);

// Verify data
const totalCount = db.prepare('SELECT COUNT(*) as count FROM facet_taxonomy').get();
console.log(`\n✅ Verified: ${totalCount.count} rows in facet_taxonomy table`);

// Show category breakdown
console.log('\nCategory Breakdown:');
const categoryCounts = db.prepare(`
  SELECT category_name, COUNT(*) as count
  FROM facet_taxonomy
  WHERE category_id IS NOT NULL
  GROUP BY category_name
  ORDER BY count DESC
`).all();

for (const cat of categoryCounts) {
  console.log(`  ${cat.category_name}: ${cat.count} facets`);
}

// Sample some facets
console.log('\nSample Facets:');
const samples = db.prepare(`
  SELECT facet_id, facet_name, category_name, facet_level
  FROM facet_taxonomy
  WHERE facet_level > 0
  LIMIT 10
`).all();

for (const sample of samples) {
  console.log(`  [${sample.facet_id}] ${sample.facet_name} (${sample.category_name}, level ${sample.facet_level})`);
}

db.close();
console.log('\n✅ Done!');
