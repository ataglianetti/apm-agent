/**
 * Hybrid Search Service
 * Combines taxonomy search with text search for optimal relevance
 * Extracted from chat.js to eliminate ~300 lines of code duplication
 */
import { searchByTaxonomy, getTracksByFacetIds, searchFacets } from './taxonomySearch.js';
import { search as metadataSearch } from './metadataSearch.js';
import { enrichTracksWithGenreNames } from './genreMapper.js';

/**
 * Execute hybrid search combining taxonomy and text results
 * Tracks matching both taxonomy AND text get highest relevance scores
 *
 * @param {object} options - Search options
 * @param {string} options.query - Search query text
 * @param {string[]} [options.expandedFacets=[]] - Facet names to expand (from business rules)
 * @param {number} [options.limit=1000] - Max results to fetch for scoring
 * @returns {Promise<{tracks: Array, total: number}>}
 */
export async function hybridSearch({ query, expandedFacets = [], limit = 1000 }) {
  const trackScores = new Map();
  const trackMap = new Map();

  // 1. Get taxonomy results
  let taxonomyResults = { tracks: [], total: 0 };

  if (expandedFacets.length > 0) {
    // Use expanded facets from business rules
    console.log(`Hybrid search: Using expanded facets: ${expandedFacets.join(', ')}`);

    const allFacets = [];
    for (const facetName of expandedFacets) {
      const matchedFacets = searchFacets(facetName, ['Master Genre', 'Additional Genre']);
      allFacets.push(...matchedFacets);
    }

    const facetIds = allFacets.map(f => f.facet_id);
    console.log(`Hybrid search: Found ${facetIds.length} facet IDs`);

    taxonomyResults = getTracksByFacetIds(facetIds, limit, 0);
  } else {
    // General taxonomy search on the query
    taxonomyResults = searchByTaxonomy(query, limit, 0);
  }

  console.log(`Hybrid search: ${taxonomyResults.tracks.length} taxonomy tracks (${taxonomyResults.total} total)`);

  // 2. Get text search results
  const textResults = await metadataSearch({
    text: query,
    limit,
    offset: 0
  });

  console.log(`Hybrid search: ${textResults.tracks.length} text tracks (${textResults.total} total)`);

  // 3. Build ID sets for tracking match types
  const taxonomyIds = new Set(taxonomyResults.tracks.map(t => t.id));
  const textIds = new Set(textResults.tracks.map(t => t.id));

  // 4. Add taxonomy matches (base score from genre facet weight = 4.0)
  for (const track of taxonomyResults.tracks) {
    trackScores.set(track.id, 4.0);
    trackMap.set(track.id, track);
  }

  // 5. Add/combine text matches
  for (const track of textResults.tracks) {
    const textScore = track._relevance_score || 0.2;
    const existingScore = trackScores.get(track.id) || 0;

    if (existingScore > 0) {
      // Track matches BOTH taxonomy AND text - combine scores
      trackScores.set(track.id, existingScore + textScore);
      const existing = trackMap.get(track.id);
      trackMap.set(track.id, {
        ...existing,
        _text_score: textScore
      });
    } else {
      // Text-only match
      trackScores.set(track.id, textScore);
      trackMap.set(track.id, track);
    }
  }

  // 6. Build scored array with breakdown
  const scoredTracks = Array.from(trackMap.values()).map(track => ({
    ...track,
    _relevance_score: trackScores.get(track.id),
    _score_breakdown: {
      ...track._score_breakdown,
      taxonomy_match: taxonomyIds.has(track.id) ? 4.0 : 0,
      text_score: track._text_score || (textIds.has(track.id) ? track._relevance_score : 0),
      combined: taxonomyIds.has(track.id) && textIds.has(track.id)
    }
  }));

  // 7. Sort by relevance score
  scoredTracks.sort((a, b) => b._relevance_score - a._relevance_score);

  // 8. Enrich with genre names
  const enrichedTracks = enrichTracksWithGenreNames(scoredTracks);

  const total = taxonomyResults.total || textResults.total || scoredTracks.length;
  console.log(`Hybrid search: ${enrichedTracks.length} scored tracks (${total} total)`);

  return {
    tracks: enrichedTracks,
    total
  };
}

/**
 * Check if a query should use hybrid search
 * Returns expanded facets if business rules apply, empty array otherwise
 *
 * @param {string} query - Search query
 * @param {Array} matchedRules - Rules that matched the query
 * @returns {string[]} - Expanded facet names
 */
export function getExpandedFacets(matchedRules) {
  const expandedFacets = [];

  for (const rule of matchedRules) {
    if (rule.type === 'genre_simplification' && rule.action?.auto_apply_facets) {
      expandedFacets.push(...rule.action.auto_apply_facets);
    }
  }

  return expandedFacets;
}
