/**
 * Taxonomy-based search service
 * Searches tracks by facet taxonomy (genres, moods, instruments, etc.)
 * using proper OR logic for facet matching
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'apm_music.db');

let db = null;

function getDb() {
  if (!db) {
    db = new Database(dbPath, { readonly: true });
    db.pragma('journal_mode = WAL');
  }
  return db;
}

/**
 * Search for facets by label/name across categories
 * @param {string} searchTerm - Search term to match against facet labels
 * @param {Array<string>} categories - Optional category filter
 * @returns {Array} - Matching facets with their IDs and categories
 */
export function searchFacets(searchTerm, categories = null) {
  const db = getDb();
  const term = searchTerm.toLowerCase();

  let query = `
    SELECT facet_id, facet_label, facet_name, category_name, category_id
    FROM facet_taxonomy
    WHERE LOWER(facet_label) LIKE ?
  `;

  const params = [`%${term}%`];

  if (categories && categories.length > 0) {
    const placeholders = categories.map(() => '?').join(',');
    query += ` AND category_name IN (${placeholders})`;
    params.push(...categories);
  }

  return db.prepare(query).all(...params);
}

/**
 * Get tracks by facet IDs using OR logic
 * @param {Array<number>} facetIds - Array of facet IDs to search for
 * @param {number} limit - Maximum number of tracks to return
 * @param {number} offset - Offset for pagination
 * @returns {Object} - {tracks, total}
 */
export function getTracksByFacetIds(facetIds, limit = 12, offset = 0) {
  if (!facetIds || facetIds.length === 0) {
    return { tracks: [], total: 0 };
  }

  const db = getDb();
  const placeholders = facetIds.map(() => '?').join(',');

  // Count total matching tracks
  const countQuery = `
    SELECT COUNT(DISTINCT t.id) as total
    FROM tracks t
    JOIN track_facets tf ON t.id = tf.track_id
    WHERE tf.facet_id IN (${placeholders})
  `;

  const { total } = db.prepare(countQuery).get(...facetIds);

  // Get paginated tracks
  const tracksQuery = `
    SELECT DISTINCT t.*
    FROM tracks t
    JOIN track_facets tf ON t.id = tf.track_id
    WHERE tf.facet_id IN (${placeholders})
    ORDER BY t.id
    LIMIT ? OFFSET ?
  `;

  const tracks = db.prepare(tracksQuery).all(...facetIds, limit, offset);

  return { tracks, total };
}

/**
 * Expand a genre search term to include subgenres
 * @param {string} genreTerm - Genre search term (e.g., "rock", "classical")
 * @returns {Array<number>} - Array of facet IDs for the genre and its subgenres
 */
export function expandGenreSearch(genreTerm) {
  const facets = searchFacets(genreTerm, ['Master Genre', 'Additional Genre']);
  return facets.map(f => f.facet_id);
}

/**
 * Search tracks by taxonomy term (genre, mood, instrument, etc.)
 * Automatically detects the facet category and uses OR logic
 * @param {string} searchTerm - The term to search for
 * @param {number} limit - Max results
 * @param {number} offset - Pagination offset
 * @returns {Object} - {tracks, total, matchedFacets}
 */
export function searchByTaxonomy(searchTerm, limit = 12, offset = 0) {
  // Search for matching facets across all categories
  const matchedFacets = searchFacets(searchTerm);

  if (matchedFacets.length === 0) {
    return { tracks: [], total: 0, matchedFacets: [] };
  }

  // Get facet IDs
  const facetIds = matchedFacets.map(f => f.facet_id);

  // Search tracks using OR logic
  const { tracks, total } = getTracksByFacetIds(facetIds, limit, offset);

  return {
    tracks,
    total,
    matchedFacets: matchedFacets.map(f => ({
      label: f.facet_label,
      category: f.category_name,
    })),
  };
}

export default {
  searchFacets,
  getTracksByFacetIds,
  expandGenreSearch,
  searchByTaxonomy,
};
