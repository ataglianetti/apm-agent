/**
 * Facet Search Service
 * Searches tracks by facet categories using the facet_taxonomy and track_facets tables
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { enhanceTracksMetadata } from './metadataEnhancer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'apm_music.db');

let db = null;

function getDb() {
  if (!db) {
    db = new Database(dbPath, { readonly: false });
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('cache_size = 10000');
    db.pragma('temp_store = MEMORY');
  }
  return db;
}

/**
 * Search tracks by facet category and search term
 * @param {string} categoryName - Category name (e.g., "Mood", "Instruments", "Vocals")
 * @param {string} searchTerm - Search term to match against facet labels
 * @param {number} limit - Maximum number of tracks to return
 * @returns {Promise<Array>} - Array of matching tracks
 */
export async function searchByFacetCategory(categoryName, searchTerm, limit = 10000) {
  const db = getDb();

  // Step 1: Find matching facets in this category
  const facetQuery = `
    SELECT facet_id, facet_label, facet_name
    FROM facet_taxonomy
    WHERE category_name = ?
      AND (facet_label LIKE ? OR facet_name LIKE ?)
  `;

  const searchPattern = `%${searchTerm}%`;
  const matchingFacets = db.prepare(facetQuery).all(categoryName, searchPattern, searchPattern);

  console.log(
    `Found ${matchingFacets.length} matching facets in "${categoryName}" for term "${searchTerm}"`
  );

  if (matchingFacets.length === 0) {
    return [];
  }

  // Step 2: Get tracks that have any of these facets
  const facetIds = matchingFacets.map(f => f.facet_id);
  const placeholders = facetIds.map(() => '?').join(',');

  const trackQuery = `
    SELECT DISTINCT t.*
    FROM tracks t
    INNER JOIN track_facets tf ON t.id = tf.track_id
    WHERE tf.facet_id IN (${placeholders})
    LIMIT ?
  `;

  const tracks = db.prepare(trackQuery).all(...facetIds, limit);

  console.log(`Found ${tracks.length} tracks with these facets`);

  return enhanceTracksMetadata(tracks);
}

/**
 * Get all facets for a specific category
 * @param {string} categoryName - Category name
 * @returns {Array} - Array of facets in this category
 */
export function getFacetsByCategory(categoryName) {
  const db = getDb();

  const query = `
    SELECT facet_id, facet_label, facet_name, facet_level
    FROM facet_taxonomy
    WHERE category_name = ?
    ORDER BY facet_label
  `;

  return db.prepare(query).all(categoryName);
}

/**
 * Get all available facet categories
 * @returns {Array} - Array of category names
 */
export function getFacetCategories() {
  const db = getDb();

  const query = `
    SELECT DISTINCT category_name
    FROM facet_taxonomy
    WHERE category_name IS NOT NULL
    ORDER BY category_name
  `;

  return db
    .prepare(query)
    .all()
    .map(row => row.category_name);
}

/**
 * Map user-friendly category names to database category names
 */
const CATEGORY_MAPPING = {
  mood: 'Mood',
  moods: 'Mood',
  instruments: 'Instruments',
  instrument: 'Instruments',
  vocals: 'Vocals',
  vocal: 'Vocals',
  tempo: 'Tempo',
  tempos: 'Tempo',
  genre: 'Master Genre',
  genres: 'Master Genre',
  'master-genre': 'Master Genre',
  'additional-genre': 'Additional Genre',
  'additional-genres': 'Additional Genre',
  'music-for': 'Music For',
  'use-case': 'Music For',
  'use-cases': 'Music For',
  character: 'Character',
  characters: 'Character',
  country: 'Country & Region',
  region: 'Country & Region',
  'country-region': 'Country & Region',
  'instrumental-vocal': 'Instrumental & Vocal Groupings',
  groupings: 'Instrumental & Vocal Groupings',
  key: 'Key',
  keys: 'Key',
  'musical-key': 'Key',
  language: 'Language',
  languages: 'Language',
  'lyric-subject': 'Lyric Subject',
  'lyrics-subject': 'Lyric Subject',
  movement: 'Movement',
  movements: 'Movement',
  'musical-form': 'Musical Form',
  form: 'Musical Form',
  'sound-effects': 'Sound Effects',
  sfx: 'Sound Effects',
  'time-period': 'Time Period',
  period: 'Time Period',
  era: 'Time Period',
  'track-type': 'Track Type',
  type: 'Track Type',
};

/**
 * Get database category name from user-friendly name
 * @param {string} userCategory - User-friendly category name
 * @returns {string|null} - Database category name or null if not found
 */
export function getCategoryName(userCategory) {
  const normalized = userCategory.toLowerCase().trim();
  return CATEGORY_MAPPING[normalized] || null;
}

/**
 * Check if a field is a facet category filter
 * @param {string} field - Field name
 * @returns {boolean}
 */
export function isFacetCategory(field) {
  const normalized = field.toLowerCase().trim();
  return Object.hasOwn(CATEGORY_MAPPING, normalized);
}

export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}
