#!/usr/bin/env node
/**
 * Generate QUICK_LOOKUP entries for all unmapped taxonomy items
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '../..');

// Load merged taxonomy
const mergedPath = path.join(rootDir, 'server/config/mergedTaxonomy.json');
const merged = JSON.parse(fs.readFileSync(mergedPath, 'utf-8'));

// Load queryToTaxonomy and extract QUICK_LOOKUP IDs
const qtPath = path.join(rootDir, 'server/services/queryToTaxonomy.js');
const qtContent = fs.readFileSync(qtPath, 'utf-8');

// Extract all IDs from QUICK_LOOKUP entries
const idMatches = qtContent.matchAll(/id:\s*(\d+)/g);
const mappedIds = new Set([...idMatches].map(m => parseInt(m[1])));

// Priority categories
const priorityCategories = ['Mood', 'Music For', 'Genre', 'Instruments', 'Character', 'Movement'];

// Check if entry is a category header
const isHeader = entry => entry.parentId === 0 || entry.parentId === null;

// Category to field mapping for Solr (kept for future use)
const _categoryToField = {
  Mood: 'mood',
  'Music For': 'music_for',
  Genre: 'combined_genre',
  Instruments: 'instruments',
  Character: 'character',
  Movement: 'movement',
};

// Find truly unmapped entries
const unmappedByCategory = {};

for (const [id, entry] of Object.entries(merged)) {
  const numId = parseInt(id);
  if (mappedIds.has(numId)) continue;

  const cat = entry.category || entry.field || 'Unknown';

  // Skip category headers
  if (isHeader(entry)) continue;

  // Skip if parent IS mapped (child covered by parent)
  const parentId = entry.parentId;
  if (parentId && mappedIds.has(parentId)) continue;

  // Only priority categories
  if (!priorityCategories.includes(cat)) continue;

  if (!unmappedByCategory[cat]) {
    unmappedByCategory[cat] = [];
  }

  unmappedByCategory[cat].push({
    id: numId,
    content: entry.contentLabel,
    display: entry.displayLabel,
    category: cat,
  });
}

// Generate JS code for each category
function generateMappings(entries) {
  const lines = [];

  for (const e of entries) {
    // Create the search key (lowercase)
    const searchKey = e.content.toLowerCase();

    // Determine if we need contentLabel (when display differs from content)
    const needsContentLabel = e.content !== e.display;

    // Escape single quotes in labels
    const displayLabel = e.display.replace(/'/g, "\\'");
    const contentLabel = e.content.replace(/'/g, "\\'");

    if (needsContentLabel) {
      lines.push(
        `  '${searchKey}': { category: '${e.category}', id: ${e.id}, label: '${displayLabel}', contentLabel: '${contentLabel}' },`
      );
    } else {
      lines.push(
        `  '${searchKey}': { category: '${e.category}', id: ${e.id}, label: '${displayLabel}' },`
      );
    }

    // Also add the display label as a search key if different
    if (needsContentLabel) {
      const displayKey = e.display.toLowerCase();
      if (displayKey !== searchKey) {
        lines.push(
          `  '${displayKey}': { category: '${e.category}', id: ${e.id}, label: '${displayLabel}', contentLabel: '${contentLabel}' },`
        );
      }
    }
  }

  return lines;
}

// Output
console.log('// ============================================================');
console.log('// AUTO-GENERATED TAXONOMY MAPPINGS');
console.log('// Generated: ' + new Date().toISOString());
console.log('// ============================================================');
console.log('');

const categoryOrder = ['Mood', 'Character', 'Movement', 'Genre', 'Music For', 'Instruments'];

for (const cat of categoryOrder) {
  const entries = unmappedByCategory[cat];
  if (!entries || entries.length === 0) continue;

  // Sort alphabetically
  entries.sort((a, b) => a.content.localeCompare(b.content));

  console.log(`  // === ${cat} (${entries.length} new entries) ===`);
  const mappings = generateMappings(entries);
  for (const line of mappings) {
    console.log(line);
  }
  console.log('');
}

// Summary
console.log('// ============================================================');
console.log('// SUMMARY:');
let total = 0;
for (const cat of categoryOrder) {
  const count = unmappedByCategory[cat]?.length || 0;
  if (count > 0) {
    console.log(`//   ${cat}: ${count} entries`);
    total += count;
  }
}
console.log(`//   TOTAL: ${total} entries`);
console.log('// ============================================================');
