/**
 * Index tracks from SQLite to Solr
 *
 * Reads tracks from apm_music.db and indexes them to the Solr tracks core.
 * Transforms facet_ids to category-specific *_ids fields for combined_ids.
 *
 * Usage: node server/scripts/indexToSolr.js [--batch-size=1000] [--limit=1000]
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const DB_PATH = path.join(__dirname, '../apm_music.db');
const SOLR_CONFIG_PATH = path.join(__dirname, '../config/solr.json');

// Default Solr settings
let solrConfig = {
  host: 'localhost',
  port: 8983,
  core: 'tracks',
  protocol: 'http'
};

try {
  solrConfig = JSON.parse(fs.readFileSync(SOLR_CONFIG_PATH, 'utf8'));
} catch (error) {
  console.warn('Using default Solr config');
}

const SOLR_UPDATE_URL = `${solrConfig.protocol}://${solrConfig.host}:${solrConfig.port}/solr/${solrConfig.core}/update`;

// Parse command line arguments
const args = process.argv.slice(2);
let BATCH_SIZE = 1000;
let LIMIT = null;
let DELETE_FIRST = false;

for (const arg of args) {
  if (arg.startsWith('--batch-size=')) {
    BATCH_SIZE = parseInt(arg.split('=')[1], 10);
  } else if (arg.startsWith('--limit=')) {
    LIMIT = parseInt(arg.split('=')[1], 10);
  } else if (arg === '--delete-first') {
    DELETE_FIRST = true;
  }
}

console.log('='.repeat(60));
console.log('Index Tracks to Solr');
console.log('='.repeat(60));
console.log(`Database: ${DB_PATH}`);
console.log(`Solr URL: ${SOLR_UPDATE_URL}`);
console.log(`Batch size: ${BATCH_SIZE}`);
if (LIMIT) console.log(`Limit: ${LIMIT}`);
console.log('');

// Open database
const db = new Database(DB_PATH, { readonly: true });

// Get facet taxonomy for mapping facet IDs to categories
console.log('Loading facet taxonomy...');
const facetTaxonomy = {};
const categoryMapping = {};

const taxonomyRows = db.prepare(`
  SELECT facet_id, category_name, facet_name, facet_label
  FROM facet_taxonomy
`).all();

// Manual mapping from facet_taxonomy category names to Solr schema field names
const CATEGORY_TO_FIELD = {
  'Master Genre': 'genre_ids',
  'Additional Genre': 'additional_genre_ids',
  'Mood': 'mood_ids',
  'Movement': 'movement_ids',
  'Character': 'character_ids',
  'Music For': 'music_for_ids',
  'Musical Form': 'musical_form_ids',
  'Instruments': 'instruments_ids',
  'Vocals': 'vocals_ids',
  'Instrumental & Vocal Groupings': 'instrumental_and_vocal_groupings_ids',
  'Sound Effects': 'sound_effects_ids',
  'Country & Region': 'country_and_region_ids',
  'Time Period': 'time_period_ids',
  'Lyric Subject': 'lyric_subject_ids',
  'Track Type': 'track_type_ids',
  'Tempo': 'tempo_ids',
  'Key': 'key_ids',
  'Language': 'language_ids'
};

for (const row of taxonomyRows) {
  facetTaxonomy[row.facet_id] = {
    category: row.category_name,
    name: row.facet_name,
    label: row.facet_label
  };

  // Use manual mapping if available, otherwise generate field name
  if (!categoryMapping[row.category_name]) {
    categoryMapping[row.category_name] = CATEGORY_TO_FIELD[row.category_name] ||
      row.category_name.toLowerCase().replace(/\s+/g, '_').replace(/&/g, 'and') + '_ids';
  }
}

console.log(`Loaded ${Object.keys(facetTaxonomy).length} facets across ${Object.keys(categoryMapping).length} categories`);
console.log('Category mappings:', categoryMapping);
console.log('');

// Pre-compute versions map (song_id -> array of track info)
console.log('Building versions map...');
const versionsMap = new Map();
const versionRows = db.prepare(`
  SELECT id, song_id, track_title, duration, library_name
  FROM tracks
  WHERE song_id IS NOT NULL AND song_id != ''
`).all();

for (const row of versionRows) {
  if (!versionsMap.has(row.song_id)) {
    versionsMap.set(row.song_id, []);
  }
  versionsMap.get(row.song_id).push({
    id: row.id,
    track_title: row.track_title,
    duration: row.duration,
    library_name: row.library_name
  });
}
console.log(`Built versions map for ${versionsMap.size} unique songs`);
console.log('');

/**
 * Transform a SQLite track row to a Solr document
 */
function transformTrack(row) {
  const doc = {
    id: row.id,
    track_title: row.track_title || '',
    track_description: row.track_description || '',
    track_number: row.track_number,
    bpm: row.bpm,
    duration: row.duration,
    random_boost: Math.floor(Math.random() * 1000),  // Random tiebreaker

    // Song ID for grouping/deduplication (e.g., "APM168051")
    song_id: row.song_id || row.id,  // Fallback to track id if no song_id

    // Album info
    album_title: row.album_title || '',
    album_code: row.album_id,
    akcd: row.album_id,

    // Library
    library_name: row.library_name || '',
    library_code: row.library_id,

    // Composer
    composer: row.composer_fullname ? [row.composer_fullname] : [],

    // Facet labels (new field)
    facet_labels: row.facet_labels || '',

    // Versions - other tracks with same song_id (stored as JSON)
    versions: (() => {
      if (!row.song_id) return '[]';
      const allVersions = versionsMap.get(row.song_id) || [];
      const otherVersions = allVersions.filter(v => v.id !== row.id);
      return JSON.stringify(otherVersions);
    })()
  };

  // Parse dates
  if (row.apm_release_date) {
    try {
      const date = new Date(row.apm_release_date);
      if (!isNaN(date.getTime())) {
        doc.apm_release_date = date.toISOString();
      }
    } catch (e) {}
  }

  if (row.internal_release_date) {
    try {
      const date = new Date(row.internal_release_date);
      if (!isNaN(date.getTime())) {
        doc.library_original_release_date = date.toISOString();
      }
    } catch (e) {}
  }

  // Parse facet IDs and distribute to category-specific fields
  if (row.facet_ids) {
    const facetIds = row.facet_ids.split(';').filter(id => id.trim());

    // Initialize category arrays
    const categoryFacets = {};
    const categoryNames = {};

    for (const facetIdStr of facetIds) {
      const facetId = parseInt(facetIdStr.trim(), 10);
      const facet = facetTaxonomy[facetId];

      if (facet) {
        const fieldName = categoryMapping[facet.category];
        if (fieldName) {
          if (!categoryFacets[fieldName]) {
            categoryFacets[fieldName] = [];
          }
          // Use full path format for combined_ids: category/id
          categoryFacets[fieldName].push(`${facet.category}/${facetId}`);

          // Also collect facet names for text search fields
          const nameFieldName = fieldName.replace('_ids', '');
          if (!categoryNames[nameFieldName]) {
            categoryNames[nameFieldName] = [];
          }
          categoryNames[nameFieldName].push(facet.label || facet.name);
        }
      }
    }

    // Add category-specific ID fields
    for (const [fieldName, ids] of Object.entries(categoryFacets)) {
      doc[fieldName] = ids;
    }

    // Add category-specific name fields
    for (const [fieldName, names] of Object.entries(categoryNames)) {
      doc[fieldName] = names;
    }
  }

  return doc;
}

/**
 * Send batch of documents to Solr
 */
async function indexBatch(docs) {
  const response = await fetch(`${SOLR_UPDATE_URL}?commit=false`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(docs)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Solr indexing failed: ${response.status} ${text}`);
  }

  return await response.json();
}

/**
 * Commit changes to Solr
 */
async function commit() {
  const response = await fetch(`${SOLR_UPDATE_URL}?commit=true`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({})
  });

  if (!response.ok) {
    throw new Error(`Solr commit failed: ${response.status}`);
  }
}

/**
 * Delete all documents from Solr
 */
async function deleteAll() {
  console.log('Deleting all existing documents...');
  const response = await fetch(`${SOLR_UPDATE_URL}?commit=true`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ delete: { query: '*:*' } })
  });

  if (!response.ok) {
    throw new Error(`Solr delete failed: ${response.status}`);
  }
  console.log('All documents deleted');
}

/**
 * Main indexing function
 */
async function main() {
  // Check Solr connection using select endpoint (more reliable than ping)
  console.log('Checking Solr connection...');
  try {
    const selectUrl = `${solrConfig.protocol}://${solrConfig.host}:${solrConfig.port}/solr/${solrConfig.core}/select?q=*:*&rows=0`;
    const response = await fetch(selectUrl);
    if (!response.ok) {
      throw new Error(`Solr not responding: ${response.status}`);
    }
    const data = await response.json();
    console.log(`✓ Solr connection OK (current docs: ${data.response?.numFound || 0})\n`);
  } catch (error) {
    console.error('✗ Cannot connect to Solr:', error.message);
    console.error('\nMake sure Solr is running:');
    console.error('  docker compose up -d');
    console.error('  Wait for Solr to start, then run this script again.\n');
    process.exit(1);
  }

  // Delete existing documents if requested
  if (DELETE_FIRST) {
    await deleteAll();
  }

  // Count tracks
  const countQuery = LIMIT
    ? `SELECT COUNT(*) as count FROM tracks LIMIT ${LIMIT}`
    : 'SELECT COUNT(*) as count FROM tracks';
  const { count: totalTracks } = db.prepare('SELECT COUNT(*) as count FROM tracks').get();
  const tracksToIndex = LIMIT ? Math.min(LIMIT, totalTracks) : totalTracks;

  console.log(`Total tracks in database: ${totalTracks.toLocaleString()}`);
  console.log(`Tracks to index: ${tracksToIndex.toLocaleString()}`);
  console.log('');

  // Query tracks
  let query = `
    SELECT
      id, song_id, track_title, track_description, track_number,
      bpm, duration, apm_release_date, internal_release_date,
      album_id, album_title, library_id, library_name,
      composer_fullname, facet_ids, facet_labels
    FROM tracks
  `;
  if (LIMIT) {
    query += ` LIMIT ${LIMIT}`;
  }

  const stmt = db.prepare(query);

  // Index in batches
  let batch = [];
  let indexed = 0;
  let errors = 0;
  const startTime = Date.now();

  console.log('Indexing tracks...');

  for (const row of stmt.iterate()) {
    try {
      const doc = transformTrack(row);
      batch.push(doc);

      if (batch.length >= BATCH_SIZE) {
        await indexBatch(batch);
        indexed += batch.length;
        batch = [];

        const elapsed = (Date.now() - startTime) / 1000;
        const rate = Math.round(indexed / elapsed);
        const pct = ((indexed / tracksToIndex) * 100).toFixed(1);
        process.stdout.write(`\r  Indexed ${indexed.toLocaleString()} tracks (${pct}%) - ${rate}/sec`);
      }
    } catch (error) {
      errors++;
      if (errors <= 5) {
        console.error(`\nError processing track ${row.id}:`, error.message);
      }
    }
  }

  // Index remaining batch
  if (batch.length > 0) {
    await indexBatch(batch);
    indexed += batch.length;
  }

  console.log(`\r  Indexed ${indexed.toLocaleString()} tracks                    `);

  // Commit
  console.log('\nCommitting to Solr...');
  await commit();

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n✓ Done! Indexed ${indexed.toLocaleString()} tracks in ${totalTime}s`);
  if (errors > 0) {
    console.log(`  (${errors} errors)`);
  }

  db.close();
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
