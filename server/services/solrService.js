/**
 * Solr Service - Production-equivalent Solr search client
 *
 * Implements edismax queries matching APM's production Solr configuration.
 * Uses the tracks core with combined_ids facet filtering and field boosts.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load Solr config
const solrConfigPath = path.join(__dirname, '../config/solr.json');
let solrConfig = {
  host: 'localhost',
  port: 8983,
  core: 'tracks',
  protocol: 'http',
  timeout: 30000
};

try {
  solrConfig = JSON.parse(fs.readFileSync(solrConfigPath, 'utf8'));
} catch (error) {
  console.warn('Could not load solr.json, using defaults:', error.message);
}

// Load field weights from config
const fieldWeightsPath = path.join(__dirname, '../config/fieldWeights.json');
let fieldWeightsConfig = { qf: {}, pf2: {} };

try {
  fieldWeightsConfig = JSON.parse(fs.readFileSync(fieldWeightsPath, 'utf8'));
  console.log('Loaded field weights from fieldWeights.json');
} catch (error) {
  console.warn('Could not load fieldWeights.json, using defaults:', error.message);
}

// Map fieldWeights.json field names to Solr *_search field names
const FIELD_TO_SEARCH_FIELD = {
  'combined_genre': 'combined_genre_search',
  'mood': 'mood_search',
  'instruments': 'instruments_search',
  'track_title': 'track_title_search',
  'track_description': 'track_description_search',
  'album_title': 'album_title_search',
  'composer': 'composer_search',
  'library': 'library_search',
  'music_for': 'music_for_search',
  'character': 'character_search',
  'movement': 'movement_search',
  'vocals': 'vocals_search',
  'country_and_region': 'country_and_region_search',
  'time_period': 'time_period_search',
  'musical_form': 'musical_form_search',
  'sound_effects': 'sound_effects_search',
  'lyric_subject': 'lyric_subject_search',
  'key': 'key_search',
  'tempo': 'tempo_search',
  'track_type': 'track_type_search',
  'instrumental_and_vocal_groupings': 'instrumental_and_vocal_groupings_search',
  'is_a': 'is_a_search',
  'lyrics': 'lyrics_search',
  'sound_alikes': 'sound_alikes_search',
  'album_description': 'album_description_search',
  'language': 'language_search'
  // Note: track_id, album_id are not text-searchable fields
};

/**
 * Build Solr URL
 */
function getSolrUrl(handler = 'select') {
  return `${solrConfig.protocol}://${solrConfig.host}:${solrConfig.port}/solr/${solrConfig.core}/${handler}`;
}

/**
 * Build qf (query fields) string from fieldWeights.json
 * Maps field names to their *_search equivalents in Solr schema
 */
function buildQf() {
  const qfConfig = fieldWeightsConfig.qf || {};
  const fields = [];

  for (const [field, weight] of Object.entries(qfConfig)) {
    if (weight > 0) {
      const searchField = FIELD_TO_SEARCH_FIELD[field];
      if (searchField) {
        fields.push(`${searchField}^${weight}`);
      }
    }
  }

  // Always include facet_labels_search for human-readable facet searching
  if (!fields.some(f => f.startsWith('facet_labels_search'))) {
    fields.push('facet_labels_search^2.0');
  }

  return fields.join(' ');
}

/**
 * Build pf2 (phrase fields) string from fieldWeights.json
 * Maps field names to their *_search equivalents in Solr schema
 */
function buildPf2() {
  const pf2Config = fieldWeightsConfig.pf2 || {};
  const fields = [];

  for (const [field, weight] of Object.entries(pf2Config)) {
    if (weight > 0) {
      const searchField = FIELD_TO_SEARCH_FIELD[field];
      if (searchField) {
        fields.push(`${searchField}^${weight}`);
      }
    }
  }

  // Always include facet_labels_search for phrase matching
  if (!fields.some(f => f.startsWith('facet_labels_search'))) {
    fields.push('facet_labels_search^1.5');
  }

  return fields.join(' ');
}

/**
 * Build filter queries (fq) from facet selections
 * Uses combined_ids field for unified facet filtering
 *
 * @param {Array} facetIds - Array of facet IDs to filter by
 * @param {Array} excludeIds - Array of facet IDs to exclude
 */
function buildFacetFilters(facetIds = [], excludeIds = []) {
  const fq = [];

  if (facetIds.length > 0) {
    // Include: combined_ids:("Category/id1" OR "Category/id2")
    // IDs are in format "Category/facet_id" and need quoting due to slash
    const quotedIds = facetIds.map(id => `"${id}"`);
    fq.push(`combined_ids:(${quotedIds.join(' OR ')})`);
  }

  if (excludeIds.length > 0) {
    // Exclude: -combined_ids:("Category/id1" OR "Category/id2")
    const quotedExcludes = excludeIds.map(id => `"${id}"`);
    fq.push(`-combined_ids:(${quotedExcludes.join(' OR ')})`);
  }

  return fq;
}

/**
 * Build sort string
 * @param {string} sort - Sort mode: featured, explore, rdate, -rdate, duration, etc.
 */
function buildSort(sort = 'featured') {
  const sortModes = {
    'featured': 'score desc, apm_release_date desc, random_boost desc',
    'explore': 'score desc, random_boost desc',
    'rdate': 'apm_release_date asc, score desc',
    '-rdate': 'apm_release_date desc, score desc',
    'duration': 'duration asc, score desc',
    '-duration': 'duration desc, score desc',
    'track_title': 'track_title asc, score desc',
    '-track_title': 'track_title desc, score desc',
    'album_title': 'album_title asc, score desc',
    '-album_title': 'album_title desc, score desc'
  };

  // Handle random sorts
  if (sort.startsWith('random_')) {
    return `${sort} asc`;
  }

  return sortModes[sort] || sortModes['featured'];
}

/**
 * Execute Solr search
 *
 * @param {Object} options - Search options
 * @param {string} options.text - Text query
 * @param {Object} options.facetsByCategory - Facet IDs grouped by category for AND/OR logic
 * @param {Array} options.excludeFacetIds - Facet IDs to exclude
 * @param {string} options.sort - Sort mode
 * @param {number} options.limit - Max results (default 12)
 * @param {number} options.offset - Offset for pagination (default 0)
 * @param {Object} options.ranges - Range filters (bpm, duration, date)
 */
export async function search(options = {}) {
  const {
    text = '*:*',
    facetsByCategory = {},  // { "Mood": ["Mood/123", "Mood/456"], "Instruments": ["Instruments/789"] }
    excludeFacetIds = [],
    fieldFilters = [],      // [{field, value, operator}] for text field filtering
    sort = 'featured',
    limit = 12,
    offset = 0,
    ranges = {},
    groupBy = 'song_id'
  } = options;

  // Build query
  const q = text && text.trim() ? text.trim() : '*:*';
  const hasText = q !== '*:*';

  // Build params
  const params = new URLSearchParams();
  params.set('q', q);
  params.set('defType', 'edismax');
  params.set('q.op', 'AND');

  // Minimum match: sliding scale based on term count
  // - 1-2 terms: require all (100%)
  // - 3-4 terms: require 75%
  // - 5+ terms: require 50% (for descriptive queries like "high speed chase neon city")
  const termCount = q === '*:*' ? 0 : q.split(/\s+/).length;
  let mm = '100%';
  if (termCount >= 5) {
    mm = '50%';
  } else if (termCount >= 3) {
    mm = '75%';
  }
  params.set('mm', mm);
  console.log(`Solr mm=${mm} for ${termCount} terms`);

  params.set('tie', '0.01');

  // Field weights only apply when there's text
  if (hasText) {
    params.set('qf', buildQf());
    params.set('pf2', buildPf2());
  }

  // Build fq filters
  const fq = [];

  // Facet filters: separate fq per category (AND between categories, OR within)
  for (const [category, ids] of Object.entries(facetsByCategory)) {
    if (ids.length > 0) {
      const quotedIds = ids.map(id => `"${id}"`);
      fq.push(`combined_ids:(${quotedIds.join(' OR ')})`);
    }
  }

  // Exclude filters
  if (excludeFacetIds.length > 0) {
    const quotedExcludes = excludeFacetIds.map(id => `"${id}"`);
    fq.push(`-combined_ids:(${quotedExcludes.join(' OR ')})`);
  }

  // Range filters
  if (ranges.bpm) {
    fq.push(`bpm:[${ranges.bpm.min || '*'} TO ${ranges.bpm.max || '*'}]`);
  }
  if (ranges.duration) {
    fq.push(`duration:[${ranges.duration.min || '*'} TO ${ranges.duration.max || '*'}]`);
  }
  if (ranges.releaseDate) {
    fq.push(`apm_release_date:[${ranges.releaseDate.min || '*'} TO ${ranges.releaseDate.max || '*'}]`);
  }

  // Text field filters (composer, library, album, etc.)
  // For analyzed text fields (*_search), use phrase matching not wildcards
  for (const filter of fieldFilters) {
    const escapedValue = filter.value.replace(/"/g, '\\"');
    if (filter.operator === 'exact') {
      // Exact match - use quotes
      fq.push(`${filter.field}:"${escapedValue}"`);
    } else {
      // Contains/phrase match - use quotes for analyzed text fields
      // Wildcards (*value*) don't work with tokenized fields in Solr
      fq.push(`${filter.field}:"${escapedValue}"`);
    }
    console.log(`Added field filter: ${filter.field} ${filter.operator} "${filter.value}"`);
  }

  // Add all filter queries
  fq.forEach(filter => params.append('fq', filter));

  // Grouping (dedup by song) - enabled with song_id field
  params.set('group', 'true');
  params.set('group.field', groupBy);
  params.set('group.limit', '1');
  params.set('group.ngroups', 'true');

  // Sort
  params.set('sort', buildSort(sort));

  // Pagination
  params.set('start', offset.toString());
  params.set('rows', limit.toString());

  // Fields to return
  params.set('fl', [
    'id', 'track_title', 'track_description', 'bpm', 'duration',
    'apm_release_date', 'album_title', 'album_code', 'library_name',
    'composer', 'genre', 'mood', 'instruments', 'music_for',
    'facet_labels', 'versions', 'score'
  ].join(','));

  // Execute request
  const url = `${getSolrUrl()}?${params.toString()}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), solrConfig.timeout);

    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unable to read error response');
      console.error(`Solr HTTP error: ${response.status} ${response.statusText}`, errorText);
      throw new Error(`Solr error: ${response.status} ${response.statusText}`);
    }

    // Parse JSON response with error handling
    let data;
    try {
      data = await response.json();
    } catch (parseError) {
      console.error('Solr response parse error:', parseError.message);
      throw new Error('Solr returned invalid JSON response');
    }

    return mapResponse(data, options);

  } catch (error) {
    // Specific error handling for common network issues
    if (error.name === 'AbortError') {
      console.error('Solr request timed out after', solrConfig.timeout, 'ms');
      throw new Error(`Solr request timed out after ${solrConfig.timeout}ms`);
    }
    if (error.code === 'ECONNREFUSED') {
      console.error('Solr connection refused at', getSolrUrl());
      throw new Error(`Solr connection refused at ${solrConfig.host}:${solrConfig.port}. Is Solr running?`);
    }
    if (error.code === 'ENOTFOUND') {
      console.error('Solr host not found:', solrConfig.host);
      throw new Error(`Solr host not found: ${solrConfig.host}`);
    }
    // Re-throw with context for other errors
    if (!error.message.includes('Solr')) {
      console.error('Solr search error:', error.message);
      throw new Error(`Solr search failed: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Map Solr response to app format
 */
function mapResponse(solrData, options) {
  const grouped = solrData.grouped?.[options.groupBy || 'song_id'];

  if (!grouped) {
    // Non-grouped response
    return {
      tracks: (solrData.response?.docs || []).map(mapTrack),
      total: solrData.response?.numFound || 0,
      qTime: solrData.responseHeader?.QTime
    };
  }

  // Grouped response - extract first doc from each group
  const tracks = (grouped.groups || []).map(group => {
    const doc = group.doclist?.docs?.[0];
    return doc ? mapTrack(doc) : null;
  }).filter(Boolean);

  return {
    tracks,
    total: grouped.ngroups || 0,
    matches: grouped.matches || 0,
    qTime: solrData.responseHeader?.QTime
  };
}

/**
 * Map a single Solr document to track format
 */
function mapTrack(doc) {
  // Parse versions JSON if present
  // Note: Solr may return this as an array if multiValued=true in schema
  let versions = [];
  if (doc.versions) {
    try {
      const versionsStr = Array.isArray(doc.versions) ? doc.versions[0] : doc.versions;
      if (versionsStr) {
        versions = JSON.parse(versionsStr);
      }
    } catch (e) {
      // Invalid JSON, ignore
    }
  }

  return {
    id: doc.id,
    track_title: doc.track_title,
    track_description: doc.track_description,
    bpm: doc.bpm,
    duration: doc.duration,
    apm_release_date: doc.apm_release_date,
    album_title: doc.album_title,
    album_code: doc.album_code,
    library_name: doc.library_name,
    composer: Array.isArray(doc.composer) ? doc.composer.join(', ') : doc.composer,

    // Facet fields
    genre: doc.genre,
    mood: doc.mood,
    instruments: doc.instruments,
    music_for: doc.music_for,
    facet_labels: doc.facet_labels,

    // Versions - other tracks with same song_id
    versions: versions,

    // Score from Solr
    _relevance_score: doc.score
  };
}

/**
 * Check if Solr is available
 */
export async function ping() {
  try {
    const url = `${getSolrUrl('admin/ping')}?wt=json`;
    const response = await fetch(url);
    const data = await response.json();
    return data.status === 'OK';
  } catch (error) {
    return false;
  }
}

/**
 * Get Solr core status
 */
export async function getStatus() {
  try {
    const url = `${solrConfig.protocol}://${solrConfig.host}:${solrConfig.port}/solr/admin/cores?action=STATUS&core=${solrConfig.core}&wt=json`;
    const response = await fetch(url);
    return await response.json();
  } catch (error) {
    return { error: error.message };
  }
}

export default {
  search,
  ping,
  getStatus,
  getSolrUrl,
  buildQf,
  buildPf2,
  buildFacetFilters,
  buildSort
};
