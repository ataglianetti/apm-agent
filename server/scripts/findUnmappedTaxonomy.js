#!/usr/bin/env node
/**
 * Find taxonomy entries that aren't mapped in QUICK_LOOKUP
 *
 * Usage:
 *   node server/scripts/findUnmappedTaxonomy.js           # Show all unmapped
 *   node server/scripts/findUnmappedTaxonomy.js --priority # Show priority only
 *   node server/scripts/findUnmappedTaxonomy.js --truly    # Show only entries where parent is also unmapped
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '../..');

const priorityOnly = process.argv.includes('--priority');
const trulyUnmappedOnly = process.argv.includes('--truly');

// Load merged taxonomy
const mergedPath = path.join(rootDir, 'server/config/mergedTaxonomy.json');
const merged = JSON.parse(fs.readFileSync(mergedPath, 'utf-8'));

// Load queryToTaxonomy and extract QUICK_LOOKUP IDs
const qtPath = path.join(rootDir, 'server/services/queryToTaxonomy.js');
const qtContent = fs.readFileSync(qtPath, 'utf-8');

// Extract all IDs from QUICK_LOOKUP entries
const idMatches = qtContent.matchAll(/id:\s*(\d+)/g);
const mappedIds = new Set([...idMatches].map(m => parseInt(m[1])));

console.log('Mapped IDs in QUICK_LOOKUP:', mappedIds.size);
console.log('Total taxonomy entries:', Object.keys(merged).length);

// Priority categories
const priorityCategories = ['Mood', 'Music For', 'Genre', 'Instruments', 'Character', 'Movement'];

// Check if entry is a category header
const isHeader = entry => entry.parentId === 0 || entry.parentId === null;

// Find unmapped entries by category
const unmappedByCategory = {};
let unmappedCount = 0;

for (const [id, entry] of Object.entries(merged)) {
  const numId = parseInt(id);
  if (mappedIds.has(numId)) continue;

  const cat = entry.category || entry.field || 'Unknown';

  // Skip category headers
  if (isHeader(entry)) continue;

  // In --truly mode, skip if parent IS mapped (child covered by parent)
  if (trulyUnmappedOnly) {
    const parentId = entry.parentId;
    if (parentId && mappedIds.has(parentId)) continue;
    if (!priorityCategories.includes(cat)) continue;
  }

  // In priority mode, skip non-priority categories and long names
  if (priorityOnly) {
    if (!priorityCategories.includes(cat)) continue;
    if (entry.contentLabel && entry.contentLabel.length > 40) continue;
  }

  if (!unmappedByCategory[cat]) {
    unmappedByCategory[cat] = [];
  }
  unmappedByCategory[cat].push({
    id: numId,
    content: entry.contentLabel,
    display: entry.displayLabel,
    field: entry.field,
    parentId: entry.parentId,
  });
  unmappedCount++;
}

console.log('Unmapped entries:', unmappedCount);
if (trulyUnmappedOnly) {
  console.log('(--truly mode: only showing entries where parent is also unmapped)');
}
console.log('\n' + '='.repeat(70));

// Sort categories by count
const sortedCats = Object.entries(unmappedByCategory).sort((a, b) => b[1].length - a[1].length);

for (const [category, entries] of sortedCats) {
  // Sort entries alphabetically within category
  entries.sort((a, b) => (a.content || '').localeCompare(b.content || ''));

  console.log(`\n## ${category} (${entries.length} unmapped)\n`);
  const limit = trulyUnmappedOnly ? 100 : priorityOnly ? 50 : 20;
  for (const e of entries.slice(0, limit)) {
    const diff = e.content !== e.display ? ` → "${e.display}"` : '';
    console.log(`  [${e.id}] ${e.content}${diff}`);
  }
  if (entries.length > limit) {
    console.log(`  ... and ${entries.length - limit} more`);
  }
}

// Summary
console.log('\n' + '='.repeat(70));
console.log('\nSummary by category:');
for (const [category, entries] of sortedCats) {
  console.log(`  ${category}: ${entries.length} unmapped`);
}
