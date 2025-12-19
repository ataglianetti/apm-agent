import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '../apm_music.db');

console.log('Loading Track Facets...');
console.log('Database:', dbPath);

// Open database
const db = new Database(dbPath);

// Create track_facets table
console.log('\nCreating track_facets table...');
db.exec(`
  DROP TABLE IF EXISTS track_facets;

  CREATE TABLE track_facets (
    track_id TEXT NOT NULL,
    facet_id INTEGER NOT NULL,
    category_id INTEGER,
    PRIMARY KEY (track_id, facet_id)
  );

  CREATE INDEX idx_track_facets_track ON track_facets(track_id);
  CREATE INDEX idx_track_facets_facet ON track_facets(facet_id);
  CREATE INDEX idx_track_facets_category ON track_facets(category_id);
`);

// Get all tracks
console.log('\nFetching tracks from database...');
const tracks = db.prepare('SELECT id, genre, additional_genres FROM tracks').all();
console.log(`Found ${tracks.length} tracks`);

// Prepare insert statement
const insert = db.prepare(`
  INSERT OR IGNORE INTO track_facets (track_id, facet_id, category_id)
  VALUES (?, ?, ?)
`);

// Get category mapping from facet_taxonomy
const getCategoryId = db.prepare(`
  SELECT category_id FROM facet_taxonomy WHERE facet_id = ?
`);

// Process tracks
console.log('\nParsing track facets...');
let totalFacets = 0;
let tracksWithFacets = 0;

const transaction = db.transaction((tracks) => {
  for (const track of tracks) {
    const facetIds = new Set();

    // Add primary genre
    if (track.genre) {
      const genreId = parseInt(track.genre);
      if (!isNaN(genreId)) {
        facetIds.add(genreId);
      }
    }

    // Add additional genres
    if (track.additional_genres) {
      const additionalIds = track.additional_genres
        .split(';')
        .map(id => parseInt(id.trim()))
        .filter(id => !isNaN(id));

      additionalIds.forEach(id => facetIds.add(id));
    }

    // Insert all facets for this track
    if (facetIds.size > 0) {
      tracksWithFacets++;

      for (const facetId of facetIds) {
        // Look up category_id for this facet
        const result = getCategoryId.get(facetId);
        const categoryId = result ? result.category_id : null;

        insert.run(track.id, facetId, categoryId);
        totalFacets++;
      }
    }
  }
});

transaction(tracks);

console.log(`\n✅ Processed ${tracksWithFacets} tracks`);
console.log(`✅ Created ${totalFacets} track-facet relationships`);
console.log(`✅ Average facets per track: ${(totalFacets / tracksWithFacets).toFixed(2)}`);

// Verify data
const stats = db.prepare(`
  SELECT
    COUNT(DISTINCT track_id) as track_count,
    COUNT(*) as facet_count,
    COUNT(DISTINCT facet_id) as unique_facets,
    COUNT(DISTINCT category_id) as categories_used
  FROM track_facets
`).get();

console.log('\nStatistics:');
console.log(`  Tracks with facets: ${stats.track_count}`);
console.log(`  Total facet relationships: ${stats.facet_count}`);
console.log(`  Unique facets used: ${stats.unique_facets}`);
console.log(`  Categories represented: ${stats.categories_used}`);

// Show facet usage breakdown by category
console.log('\nFacet Usage by Category:');
const categoryStats = db.prepare(`
  SELECT
    ft.category_name,
    COUNT(DISTINCT tf.track_id) as track_count,
    COUNT(*) as facet_count
  FROM track_facets tf
  JOIN facet_taxonomy ft ON tf.facet_id = ft.facet_id
  WHERE ft.category_name IS NOT NULL
  GROUP BY ft.category_name
  ORDER BY track_count DESC
`).all();

for (const cat of categoryStats) {
  console.log(`  ${cat.category_name}: ${cat.track_count} tracks, ${cat.facet_count} facet assignments`);
}

// Sample some track facets
console.log('\nSample Track Facets:');
const samples = db.prepare(`
  SELECT
    tf.track_id,
    t.track_title,
    GROUP_CONCAT(ft.facet_name, '; ') as facets
  FROM track_facets tf
  JOIN tracks t ON tf.track_id = t.id
  JOIN facet_taxonomy ft ON tf.facet_id = ft.facet_id
  GROUP BY tf.track_id
  LIMIT 5
`).all();

for (const sample of samples) {
  console.log(`\n  Track: ${sample.track_title}`);
  console.log(`    Facets: ${sample.facets.substring(0, 150)}${sample.facets.length > 150 ? '...' : ''}`);
}

db.close();
console.log('\n✅ Done!');
