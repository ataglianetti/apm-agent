/**
 * Index unique composers from SQLite to Solr
 *
 * Reads unique composer names from the tracks table and indexes them
 * to the Solr composers core for autocomplete/predictive search.
 *
 * Usage: node server/scripts/indexComposersToSolr.js [--delete-first]
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
  core: 'composers',
  protocol: 'http',
};

try {
  const baseConfig = JSON.parse(fs.readFileSync(SOLR_CONFIG_PATH, 'utf8'));
  solrConfig = { ...baseConfig, core: 'composers' };
} catch (_error) {
  console.warn('Using default Solr config');
}

const SOLR_UPDATE_URL = `${solrConfig.protocol}://${solrConfig.host}:${solrConfig.port}/solr/${solrConfig.core}/update`;

// Parse command line arguments
const args = process.argv.slice(2);
let DELETE_FIRST = false;

for (const arg of args) {
  if (arg === '--delete-first') {
    DELETE_FIRST = true;
  }
}

console.log('='.repeat(60));
console.log('Index Composers to Solr');
console.log('='.repeat(60));
console.log(`Database: ${DB_PATH}`);
console.log(`Solr URL: ${SOLR_UPDATE_URL}`);
console.log('');

// Open database
const db = new Database(DB_PATH, { readonly: true });

/**
 * Send batch of documents to Solr
 */
async function indexBatch(docs) {
  const response = await fetch(`${SOLR_UPDATE_URL}?commit=false`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(docs),
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
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
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
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ delete: { query: '*:*' } }),
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
  // Check Solr connection
  console.log('Checking Solr connection...');
  try {
    const selectUrl = `${solrConfig.protocol}://${solrConfig.host}:${solrConfig.port}/solr/${solrConfig.core}/select?q=*:*&rows=0`;
    const response = await fetch(selectUrl);
    if (!response.ok) {
      throw new Error(`Solr not responding: ${response.status}`);
    }
    const data = await response.json();
    console.log(`Solr connection OK (current docs: ${data.response?.numFound || 0})\n`);
  } catch (error) {
    console.error('Cannot connect to Solr:', error.message);
    console.error('\nMake sure Solr is running:');
    console.error('  docker compose up -d');
    console.error('  Wait for Solr to start, then run this script again.\n');
    process.exit(1);
  }

  // Delete existing documents if requested
  if (DELETE_FIRST) {
    await deleteAll();
  }

  // Query unique composers
  console.log('Querying unique composers...');
  const query = `
    SELECT DISTINCT composer_fullname
    FROM tracks
    WHERE composer_fullname IS NOT NULL AND composer_fullname != ''
    ORDER BY composer_fullname
  `;

  const composers = db.prepare(query).all();
  console.log(`Found ${composers.length.toLocaleString()} unique composers\n`);

  // Index in batches
  const BATCH_SIZE = 1000;
  let batch = [];
  let indexed = 0;
  const startTime = Date.now();

  console.log('Indexing composers...');

  for (const row of composers) {
    const doc = {
      id: row.composer_fullname,
    };
    batch.push(doc);

    if (batch.length >= BATCH_SIZE) {
      await indexBatch(batch);
      indexed += batch.length;
      batch = [];

      const elapsed = (Date.now() - startTime) / 1000;
      const rate = Math.round(indexed / elapsed);
      const pct = ((indexed / composers.length) * 100).toFixed(1);
      process.stdout.write(
        `\r  Indexed ${indexed.toLocaleString()} composers (${pct}%) - ${rate}/sec`
      );
    }
  }

  // Index remaining batch
  if (batch.length > 0) {
    await indexBatch(batch);
    indexed += batch.length;
  }

  console.log(`\r  Indexed ${indexed.toLocaleString()} composers                    `);

  // Commit
  console.log('\nCommitting to Solr...');
  await commit();

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nDone! Indexed ${indexed.toLocaleString()} composers in ${totalTime}s`);

  db.close();
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
