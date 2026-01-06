#!/usr/bin/env node
/**
 * Merge Content and Navigation Taxonomies
 *
 * Creates a unified taxonomy mapping that includes:
 * - contentLabel: The term stored in Solr (from content taxonomy)
 * - displayLabel: The user-facing name (from navigation taxonomy)
 *
 * Usage: node server/scripts/mergeTaxonomies.js <contentTaxonomy.json> <navigationTaxonomy.json>
 */

import fs from 'fs';
import path from 'path';

// Field name mapping from content taxonomy field to Solr field (kept for future use)
const _FIELD_MAPPING = {
  genre: 'combined_genre',
  instrumental_and_vocal_groupings: 'instrumental_and_vocal_groupings',
  sound_effects: 'sound_effects',
  country_and_region: 'country_and_region',
  time_period: 'time_period',
  lyric_subject: 'lyric_subject',
  track_type: 'track_type',
  tempo: 'tempo',
  key: 'key',
  mood: 'mood',
  movement: 'movement',
  character: 'character',
  instruments: 'instruments',
  music_for: 'music_for',
  vocals: 'vocals',
  is_a: 'is_a',
  library: 'library',
};

// Category name normalization (content taxonomy term → display category name)
const CATEGORY_NAMES = {
  genre: 'Genre',
  'Master Genre': 'Genre',
  'Additional Genre': 'Genre',
  instrumental_and_vocal_groupings: 'Instrumental & Vocal Groupings',
  sound_effects: 'Sound Effects',
  country_and_region: 'Country & Region',
  time_period: 'Time Period',
  lyric_subject: 'Lyric Subject',
  track_type: 'Track Type',
  tempo: 'Tempo',
  key: 'Key',
  mood: 'Mood',
  movement: 'Movement',
  character: 'Character',
  instruments: 'Instruments',
  music_for: 'Music For',
  vocals: 'Vocals',
  is_a: 'is_a',
  library: 'Library',
};

/**
 * Recursively extract all items from navigation taxonomy
 */
function extractNavigationItems(obj, items = {}) {
  if (typeof obj !== 'object' || obj === null) return items;

  if (obj.id !== undefined && obj.name !== undefined) {
    items[obj.id] = obj.name;
  }

  if (Array.isArray(obj.children)) {
    for (const child of obj.children) {
      extractNavigationItems(child, items);
    }
  }

  for (const value of Object.values(obj)) {
    if (typeof value === 'object') {
      extractNavigationItems(value, items);
    }
  }

  return items;
}

/**
 * Main merge function
 */
function mergeTaxonomies(contentPath, navigationPath) {
  console.log('Loading content taxonomy...');
  const contentTaxonomy = JSON.parse(fs.readFileSync(contentPath, 'utf-8'));

  console.log('Loading navigation taxonomy...');
  const navigationTaxonomy = JSON.parse(fs.readFileSync(navigationPath, 'utf-8'));

  // Extract navigation labels by ID
  console.log('Extracting navigation labels...');
  const navigationLabels = extractNavigationItems(navigationTaxonomy);
  console.log(`Found ${Object.keys(navigationLabels).length} navigation items`);

  // Build merged taxonomy
  const merged = {};
  let matchCount = 0;
  let mismatchCount = 0;
  const mismatches = [];

  for (const [id, entry] of Object.entries(contentTaxonomy)) {
    const numId = parseInt(id, 10);
    const contentLabel = entry.term;
    const navigationLabel = navigationLabels[numId];
    const field = entry.field;
    const category = CATEGORY_NAMES[entry.term] || CATEGORY_NAMES[field] || field;

    merged[numId] = {
      id: numId,
      field,
      category,
      contentLabel,
      displayLabel: navigationLabel || contentLabel, // Fall back to content label
      fullPath: entry.full_term,
      parentId: entry.parent_id,
    };

    if (navigationLabel && navigationLabel !== contentLabel) {
      mismatchCount++;
      mismatches.push({
        id: numId,
        contentLabel,
        displayLabel: navigationLabel,
        category,
      });
    } else if (navigationLabel) {
      matchCount++;
    }
  }

  console.log(`\nMerge complete:`);
  console.log(`  Total entries: ${Object.keys(merged).length}`);
  console.log(`  Matching labels: ${matchCount}`);
  console.log(`  Different labels: ${mismatchCount}`);

  // Show some example mismatches
  if (mismatches.length > 0) {
    console.log(`\nSample label differences (content → display):`);
    for (const m of mismatches.slice(0, 20)) {
      console.log(`  [${m.id}] ${m.category}: "${m.contentLabel}" → "${m.displayLabel}"`);
    }
    if (mismatches.length > 20) {
      console.log(`  ... and ${mismatches.length - 20} more`);
    }
  }

  return { merged, mismatches };
}

/**
 * Generate QUICK_LOOKUP entries with dual labels
 */
function generateQuickLookupUpdates(mismatches) {
  console.log('\n--- QUICK_LOOKUP updates needed ---\n');

  for (const m of mismatches) {
    const key = m.contentLabel.toLowerCase();
    const altKey = m.displayLabel.toLowerCase();

    console.log(`// ${m.contentLabel} → ${m.displayLabel}`);
    console.log(
      `'${key}': { category: '${m.category}', id: ${m.id}, label: '${m.displayLabel}', contentLabel: '${m.contentLabel}' },`
    );
    if (key !== altKey) {
      console.log(
        `'${altKey}': { category: '${m.category}', id: ${m.id}, label: '${m.displayLabel}', contentLabel: '${m.contentLabel}' },`
      );
    }
    console.log('');
  }
}

// Main execution
const args = process.argv.slice(2);

if (args.length < 2) {
  console.log('Usage: node mergeTaxonomies.js <contentTaxonomy.json> <navigationTaxonomy.json>');
  console.log('\nExample:');
  console.log(
    '  node server/scripts/mergeTaxonomies.js "/path/to/contentTaxonomy_Prod.json" "/path/to/navigationTaxonomy_Prod.json"'
  );
  process.exit(1);
}

const [contentPath, navigationPath] = args;

if (!fs.existsSync(contentPath)) {
  console.error(`Content taxonomy file not found: ${contentPath}`);
  process.exit(1);
}

if (!fs.existsSync(navigationPath)) {
  console.error(`Navigation taxonomy file not found: ${navigationPath}`);
  process.exit(1);
}

const { merged, mismatches } = mergeTaxonomies(contentPath, navigationPath);

// Save merged taxonomy
const outputPath = path.join(path.dirname(contentPath), 'mergedTaxonomy.json');
fs.writeFileSync(outputPath, JSON.stringify(merged, null, 2));
console.log(`\nMerged taxonomy saved to: ${outputPath}`);

// Generate QUICK_LOOKUP updates
generateQuickLookupUpdates(mismatches);
