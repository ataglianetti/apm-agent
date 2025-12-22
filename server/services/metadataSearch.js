/**
 * Metadata Search Service
 * Unified search combining facet filtering, text search, and field weighting
 *
 * This service:
 * 1. Routes to Solr (preferred) or FTS5 (fallback) based on SEARCH_ENGINE env var
 * 2. Queries track_facets for facet filtering
 * 3. Queries tracks_fts for full-text search (FTS5 mode)
 * 4. Applies field weights from fieldWeights.json
 * 5. Ranks results by weighted relevance score
 * 6. Returns enriched results with match explanations
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { enhanceTracksMetadata } from './metadataEnhancer.js';
import { searchByFacetCategory } from './facetSearchService.js';
import * as solrService from './solrService.js';

// Use Solr if available, fallback to FTS5
// Set SEARCH_ENGINE=fts5 to force FTS5 mode
const USE_SOLR = process.env.SEARCH_ENGINE !== 'fts5';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'apm_music.db');
const weightsPath = path.join(__dirname, '..', 'config', 'fieldWeights.json');

let db = null;
let fieldWeights = null;

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

function loadFieldWeights() {
  if (!fieldWeights) {
    const weightsJson = fs.readFileSync(weightsPath, 'utf8');
    fieldWeights = JSON.parse(weightsJson);
    console.log('Loaded field weights configuration');
  }
  return fieldWeights;
}

/**
 * Main unified search function
 * @param {object} options - Search options
 * @param {Array} options.facets - Array of facet filters [{category, value}]
 * @param {string} options.text - Text search query
 * @param {Array} options.filters - Additional metadata filters
 * @param {number} options.limit - Maximum results to return (default: 12)
 * @param {number} options.offset - Offset for pagination (default: 0)
 * @returns {Promise<object>} - { tracks, total, matchExplanations }
 */
export async function search(options) {
  const { facets = [], text = '', filters = [], limit = 12, offset = 0 } = options;

  console.log('Metadata search:', {
    facets,
    text,
    filters,
    limit,
    offset,
    engine: USE_SOLR ? 'solr' : 'fts5',
  });

  // Try Solr first if enabled
  if (USE_SOLR) {
    try {
      const solrResult = await searchWithSolr(options);
      if (solrResult) {
        return solrResult;
      }
    } catch (error) {
      console.warn('Solr search failed, falling back to FTS5:', error.message);
    }
  }

  // FTS5 fallback path
  return searchWithFTS5(options);
}

/**
 * Search using Solr backend
 */
async function searchWithSolr(options) {
  const {
    facets = [],
    text = '',
    filters = [],
    limit = 12,
    offset = 0,
    taxonomyFilters = null,
  } = options;

  // Map facets to facet IDs for Solr
  // Group by category for proper AND/OR logic:
  // - OR within same category (any of these moods)
  // - AND between categories (has this mood AND this instrument)
  const facetsByCategory = {};

  // Add taxonomy filters first (these are pre-parsed with exact IDs)
  if (taxonomyFilters) {
    for (const [category, facetIds] of Object.entries(taxonomyFilters)) {
      if (!facetsByCategory[category]) {
        facetsByCategory[category] = [];
      }
      // facetIds are already in "Category/ID" format
      facetsByCategory[category].push(...facetIds);
    }
    console.log(`Taxonomy filters applied: ${Object.keys(taxonomyFilters).length} categories`);
  }

  // Add traditional facets (these need ID lookup)
  for (const facet of facets) {
    const ids = await getFacetIds(facet.category, facet.value);
    if (!facetsByCategory[facet.category]) {
      facetsByCategory[facet.category] = [];
    }
    facetsByCategory[facet.category].push(...ids);
  }

  // Separate range filters from text field filters
  const ranges = {};
  const fieldFilters = [];

  for (const filter of filters) {
    if (filter.operator === 'range') {
      ranges[filter.field] = filter.value;
    } else if (filter.operator === 'greater') {
      ranges[filter.field] = { min: filter.value };
    } else if (filter.operator === 'less') {
      ranges[filter.field] = { max: filter.value };
    } else {
      // Text field filter (contains, exact) - pass to Solr fq
      fieldFilters.push({
        field: filter.field,
        value: filter.value,
        operator: filter.operator,
      });
    }
  }

  console.log(
    `Solr search: ${Object.keys(facetsByCategory).length} facet categories, ${fieldFilters.length} field filters, text="${text}"`
  );

  // Execute Solr search with facets grouped by category
  const result = await solrService.search({
    text: text || '*:*',
    facetsByCategory, // Grouped facet IDs for combined_ids
    fieldFilters, // Text field filters (composer, library, etc.)
    limit,
    offset,
    ranges,
  });

  console.log(
    `Solr search returned ${result.tracks.length} tracks (total: ${result.total}, qTime: ${result.qTime}ms)`
  );

  // Enhance metadata
  const enhancedTracks = enhanceTracksMetadata(result.tracks);

  // Build match explanations
  const matchExplanations = buildMatchExplanations(enhancedTracks, facets, text);

  return {
    tracks: enhancedTracks,
    total: result.total, // Unique songs (ngroups)
    totalVersions: result.matches, // Total track versions
    matchExplanations,
    _meta: {
      engine: 'solr',
      qTime: result.qTime,
    },
  };
}

/**
 * Get facet IDs for a category/value pair
 * Returns IDs in the format "Category/facet_id" for Solr combined_ids matching
 */
async function getFacetIds(category, value) {
  const db = getDb();
  const query = `
    SELECT facet_id, category_name FROM facet_taxonomy
    WHERE category_name = ? AND (facet_label LIKE ? OR facet_name LIKE ?)
  `;
  const pattern = `%${value}%`;
  const rows = db.prepare(query).all(category, pattern, pattern);
  // Return in "Category/facet_id" format for Solr combined_ids matching
  const ids = rows.map(r => `${r.category_name}/${r.facet_id}`);
  console.log(
    `getFacetIds: ${category}="${value}" → ${ids.length} IDs: ${ids.slice(0, 5).join(', ')}${ids.length > 5 ? '...' : ''}`
  );
  return ids;
}

/**
 * Original FTS5 search implementation
 */
async function searchWithFTS5(options) {
  const { facets = [], text = '', filters = [], limit = 12, offset = 0 } = options;

  let candidateTracks = [];

  // Step 1: Facet filtering (if facets provided)
  if (facets.length > 0) {
    candidateTracks = await searchByFacets(facets);
    console.log(`Facet filtering returned ${candidateTracks.length} tracks`);
  }

  // Step 2: Text search (if text provided)
  if (text) {
    const textResults = await searchByText(text);
    console.log(`Text search returned ${textResults.length} tracks`);

    if (candidateTracks.length > 0) {
      // Intersect with facet results (AND logic)
      const candidateIds = new Set(candidateTracks.map(t => t.id));
      const intersected = textResults.filter(t => candidateIds.has(t.id));
      console.log(
        `Intersection: ${candidateTracks.length} facet results × ${textResults.length} text results = ${intersected.length} combined`
      );
      candidateTracks = intersected;
    } else {
      candidateTracks = textResults;
    }
  }

  // Step 3: Apply additional filters (if any)
  if (filters.length > 0) {
    candidateTracks = applyAdditionalFilters(candidateTracks, filters);
    console.log(`After additional filters: ${candidateTracks.length} tracks`);
  }

  // Step 4: Calculate relevance scores using field weights
  const scoredTracks = await calculateRelevanceScores(candidateTracks, facets, text);

  // Step 5: Sort by relevance score (descending)
  scoredTracks.sort((a, b) => b._relevance_score - a._relevance_score);

  // Step 6: Enhance metadata
  const enhancedTracks = enhanceTracksMetadata(scoredTracks);

  // Step 7: Build match explanations
  const matchExplanations = buildMatchExplanations(enhancedTracks, facets, text);

  // Step 8: Paginate results
  const total = enhancedTracks.length;
  const paginatedTracks = enhancedTracks.slice(offset, offset + limit);

  return {
    tracks: paginatedTracks,
    total,
    matchExplanations: matchExplanations.slice(offset, offset + limit),
    _meta: {
      engine: 'fts5',
    },
  };
}

/**
 * Search tracks by multiple facet category filters (AND logic)
 * @param {Array} facets - Array of {category, value} objects
 * @returns {Promise<Array>} - Array of matching tracks
 */
async function searchByFacets(facets) {
  let results = [];

  for (let i = 0; i < facets.length; i++) {
    const { category, value } = facets[i];
    const facetResults = await searchByFacetCategory(category, value, 10000);

    if (i === 0) {
      results = facetResults;
    } else {
      // Intersect with previous results (AND logic)
      const resultIds = new Set(facetResults.map(t => t.id));
      results = results.filter(t => resultIds.has(t.id));
    }
  }

  return results;
}

/**
 * Search tracks by text using FTS5
 * @param {string} text - Search query text
 * @returns {Promise<Array>} - Array of matching tracks
 */
async function searchByText(text) {
  const db = getDb();

  // Use FTS5 full-text search
  const query = `
    SELECT
      t.*,
      fts.rank as fts_rank
    FROM tracks_fts fts
    INNER JOIN tracks t ON fts.rowid = t.rowid
    WHERE tracks_fts MATCH ?
    ORDER BY fts.rank
    LIMIT 1000
  `;

  try {
    const results = db.prepare(query).all(text);
    return results;
  } catch (error) {
    console.error('FTS5 search error:', error.message);

    // Fallback to simple LIKE search on title and description
    const fallbackQuery = `
      SELECT * FROM tracks
      WHERE track_title LIKE ? OR track_description LIKE ?
      LIMIT 1000
    `;
    const pattern = `%${text}%`;
    return db.prepare(fallbackQuery).all(pattern, pattern);
  }
}

/**
 * Apply additional metadata filters
 * @param {Array} tracks - Array of track objects
 * @param {Array} filters - Array of filter objects
 * @returns {Array} - Filtered tracks
 */
function applyAdditionalFilters(tracks, filters) {
  let filtered = tracks;

  for (const filter of filters) {
    const { field, value, operator } = filter;

    filtered = filtered.filter(track => {
      const fieldValue = String(track[field] || '').toLowerCase();
      const searchValue = String(value).toLowerCase();

      switch (operator) {
        case 'exact':
          return fieldValue === searchValue;
        case 'contains':
          return fieldValue.includes(searchValue);
        case 'greater':
          return parseFloat(track[field]) > parseFloat(value);
        case 'less':
          return parseFloat(track[field]) < parseFloat(value);
        case 'range':
          const numValue = parseFloat(track[field]);
          return numValue >= value.min && numValue <= value.max;
        default:
          return fieldValue.includes(searchValue);
      }
    });
  }

  return filtered;
}

/**
 * Calculate relevance scores using field weights
 * @param {Array} tracks - Array of track objects
 * @param {Array} facets - Facet filters used
 * @param {string} text - Text search query
 * @returns {Promise<Array>} - Tracks with _relevance_score added
 */
async function calculateRelevanceScores(tracks, facets, text) {
  const weights = loadFieldWeights();

  return tracks.map(track => {
    let score = 0;
    const scoreBreakdown = {};

    // Score facet matches
    for (const facet of facets) {
      const facetFieldName = categoryToFieldName(facet.category);
      const weight = weights.qf[facetFieldName] || 1.0;
      score += weight;
      scoreBreakdown[facetFieldName] = weight;
    }

    // Score text matches
    if (text) {
      const textLower = text.toLowerCase();

      // Check each weighted field
      const textFields = [
        { name: 'track_title', value: track.track_title },
        { name: 'track_description', value: track.track_description },
        { name: 'album_title', value: track.album_title },
        { name: 'composer', value: track.composer },
        { name: 'library', value: track.library_name },
      ];

      for (const field of textFields) {
        const fieldValue = String(field.value || '').toLowerCase();

        if (fieldValue.includes(textLower)) {
          // Single term match
          const weight = weights.qf[field.name] || 0.1;
          score += weight;
          scoreBreakdown[field.name] = (scoreBreakdown[field.name] || 0) + weight;

          // Phrase match bonus (pf2)
          if (textLower.split(/\s+/).length >= 2) {
            const phraseWeight = weights.pf2[field.name] || 0;
            score += phraseWeight;
            scoreBreakdown[`${field.name}_phrase`] = phraseWeight;
          }
        }
      }

      // Use FTS5 rank if available
      if (track.fts_rank) {
        // FTS5 rank is negative (better match = more negative)
        // Convert to positive score contribution
        const ftsScore = Math.abs(track.fts_rank) * 0.1;
        score += ftsScore;
        scoreBreakdown.fts_rank = ftsScore;
      }
    }

    // Base score (ensure no track has zero score)
    if (score === 0) {
      score = 0.1;
    }

    return {
      ...track,
      _relevance_score: score,
      _score_breakdown: scoreBreakdown,
    };
  });
}

/**
 * Build match explanations for each track
 * @param {Array} tracks - Array of track objects with scores
 * @param {Array} facets - Facet filters used
 * @param {string} text - Text search query
 * @returns {Array} - Array of match explanation objects
 */
function buildMatchExplanations(tracks, facets, text) {
  return tracks.map(track => {
    const explanation = {
      trackId: track.id,
      matchedFacets: [],
      matchedTextFields: [],
      scoreBreakdown: track._score_breakdown || {},
      totalScore: track._relevance_score || 0,
    };

    // Add facet matches
    for (const facet of facets) {
      const facetFieldName = categoryToFieldName(facet.category);
      const weight = explanation.scoreBreakdown[facetFieldName] || 0;
      explanation.matchedFacets.push(
        `${facet.category} | ${facet.value} (weight: ${weight.toFixed(2)})`
      );
    }

    // Add text field matches
    if (text) {
      const textLower = text.toLowerCase();

      if (track.track_title && String(track.track_title).toLowerCase().includes(textLower)) {
        const weight = explanation.scoreBreakdown.track_title || 0;
        explanation.matchedTextFields.push(
          `track_title contains "${text}" (weight: ${weight.toFixed(2)})`
        );
      }

      if (
        track.track_description &&
        String(track.track_description).toLowerCase().includes(textLower)
      ) {
        const weight = explanation.scoreBreakdown.track_description || 0;
        explanation.matchedTextFields.push(
          `track_description contains "${text}" (weight: ${weight.toFixed(2)})`
        );
      }

      if (track.album_title && String(track.album_title).toLowerCase().includes(textLower)) {
        const weight = explanation.scoreBreakdown.album_title || 0;
        explanation.matchedTextFields.push(
          `album_title contains "${text}" (weight: ${weight.toFixed(2)})`
        );
      }

      if (track.composer && String(track.composer).toLowerCase().includes(textLower)) {
        const weight = explanation.scoreBreakdown.composer || 0;
        explanation.matchedTextFields.push(
          `composer contains "${text}" (weight: ${weight.toFixed(2)})`
        );
      }
    }

    return explanation;
  });
}

/**
 * Map facet category name to field name in weights config
 * @param {string} category - Facet category name
 * @returns {string} - Field name for weights
 */
function categoryToFieldName(category) {
  const mapping = {
    Mood: 'mood',
    'Master Genre': 'combined_genre',
    'Additional Genre': 'combined_genre',
    Instruments: 'instruments',
    Vocals: 'vocals',
    Tempo: 'tempo',
    'Music For': 'music_for',
    Character: 'character',
    'Country & Region': 'country_and_region',
    Key: 'key',
    Language: 'language',
    'Lyric Subject': 'lyric_subject',
    Movement: 'movement',
    'Musical Form': 'musical_form',
    'Sound Effects': 'sound_effects',
    'Time Period': 'time_period',
    'Track Type': 'track_type',
    'Instrumental & Vocal Groupings': 'instrumental_and_vocal_groupings',
  };

  return mapping[category] || category.toLowerCase().replace(/\s+/g, '_');
}

/**
 * Close database connection
 */
export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}
