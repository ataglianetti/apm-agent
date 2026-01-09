/**
 * AIMS Prompt Search Service
 *
 * Third-party AI-powered natural language search API.
 * This service handles complex/creative queries like:
 * - "music for a high speed chase through a neon city scape"
 * - "uplifting corporate video background music"
 *
 * STATUS: Not yet implemented. The service is disabled to avoid latency.
 *
 * To enable AIMS integration:
 * 1. Get AIMS API key and add to .env as AIMS_API_KEY
 * 2. Set AIMS_CONFIG.implemented = true below
 * 3. Uncomment and complete the search() implementation
 * 4. Update _mapAimsTrackToInternal() based on actual AIMS response format
 *
 * API Contract (expected):
 * - Input: { query: string, filters?: { genre?: string[], mood?: string[], ... }, limit?: number, offset?: number }
 * - Output: { tracks: Track[], total: number }
 */

import { createLogger } from './logger.js';

const logger = createLogger('AIMS');

// AIMS API configuration
const AIMS_CONFIG = {
  baseUrl: process.env.AIMS_API_URL || 'https://api.aims.example.com',
  apiKey: process.env.AIMS_API_KEY,
  // Set to true when AIMS integration is complete
  implemented: false,
};

/**
 * Check if AIMS is configured and available
 * Returns false until AIMS integration is complete to avoid latency
 * from failed API calls on every complex query.
 * @returns {boolean} True if AIMS is available and configured
 */
export function isAimsAvailable() {
  return AIMS_CONFIG.implemented && Boolean(AIMS_CONFIG.apiKey);
}

/**
 * Search AIMS with natural language query and optional pill constraints
 *
 * @param {string} query - Natural language search query
 * @param {object} constraints - Filter constraints from pills
 * @param {string[]} constraints.genre - Genre filter values
 * @param {string[]} constraints.mood - Mood filter values
 * @param {string[]} constraints.instruments - Instrument filter values
 * @param {string[]} constraints.tempo - Tempo filter values
 * @param {string[]} constraints.text - Text search terms (searches all fields)
 * @param {number} limit - Max results to return
 * @param {number} offset - Pagination offset
 * @returns {Promise<{tracks: object[], total: number, aimsQuery: string}>}
 */
export async function search(query, constraints = {}, limit = 12, offset = 0) {
  if (!isAimsAvailable()) {
    throw new Error('AIMS API not configured. Set AIMS_API_KEY in .env and enable integration.');
  }

  logger.debug('AIMS search request', { query, constraints, limit, offset });

  // Implementation placeholder - uncomment and complete when AIMS is ready:
  //
  // const response = await fetch(`${AIMS_CONFIG.baseUrl}/search`, {
  //   method: 'POST',
  //   headers: {
  //     'Authorization': `Bearer ${AIMS_CONFIG.apiKey}`,
  //     'Content-Type': 'application/json',
  //   },
  //   body: JSON.stringify({
  //     query,
  //     filters: constraints,
  //     limit,
  //     offset,
  //   }),
  // });
  //
  // if (!response.ok) {
  //   throw new Error(`AIMS API error: ${response.status}`);
  // }
  //
  // const data = await response.json();
  // const tracks = data.tracks.map(_mapAimsTrackToInternal);
  //
  // return {
  //   tracks,
  //   total: data.total,
  //   aimsQuery: query,
  // };

  throw new Error('AIMS integration not yet implemented.');
}

/**
 * Build constraints object from pills array
 *
 * @param {object[]} pills - Array of pill objects from client
 * @returns {object} Constraints object for AIMS API
 */
export function pillsToConstraints(pills) {
  if (!pills || !Array.isArray(pills)) {
    return {};
  }

  const constraints = {};

  for (const pill of pills) {
    if (pill.type === 'filter') {
      const field = pill.field?.toLowerCase() || pill.key;
      if (!constraints[field]) {
        constraints[field] = [];
      }
      constraints[field].push(pill.value);
    } else if (pill.type === 'text') {
      if (!constraints.text) {
        constraints.text = [];
      }
      constraints.text.push(pill.value);
    }
  }

  return constraints;
}

/**
 * Map AIMS track format to internal track format
 * Prefixed with underscore as it's not used until AIMS is implemented.
 * @param {object} aimsTrack - Track object from AIMS API
 * @returns {object} Track object in internal format
 */
function _mapAimsTrackToInternal(aimsTrack) {
  return {
    id: aimsTrack.id || aimsTrack.track_id,
    track_title: aimsTrack.title || aimsTrack.track_title,
    track_description: aimsTrack.description || aimsTrack.track_description,
    album_title: aimsTrack.album || aimsTrack.album_title,
    composer: aimsTrack.composer,
    library_name: aimsTrack.library || aimsTrack.library_name,
    bpm: aimsTrack.bpm,
    duration: aimsTrack.duration,
    genre: aimsTrack.genre || aimsTrack.genres,
    mood: aimsTrack.mood || aimsTrack.moods,
    instruments: aimsTrack.instruments,
  };
}

// Export for testing purposes (prefixed to indicate internal use)
export { _mapAimsTrackToInternal };
