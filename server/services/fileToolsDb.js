// Optimized file tools using SQLite database for fast performance
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { enhanceTracksMetadata, enhanceTrackMetadata } from './metadataEnhancer.js';
import { search as solrSearch } from './metadataSearch.js';
import { enrichTracksWithGenreNames } from './genreMapper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'apm_music.db');

// Security: Whitelist of allowed table names to prevent SQL injection
const ALLOWED_TABLES = new Set([
  'tracks', 'projects', 'project_tracks', 'download_history',
  'search_history', 'audition_history', 'users', 'facet_taxonomy',
  'track_facets', 'genre_taxonomy', 'sound_alikes'
]);

// Create a single database connection (reused for all queries)
let db = null;

function getDb() {
  if (!db) {
    db = new Database(dbPath, { readonly: false });
    // Enable performance optimizations
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('cache_size = 10000');
    db.pragma('temp_store = MEMORY');
  }
  return db;
}

// Prepared statements cache for better performance
const stmtCache = {};

function getStatement(key, sql) {
  if (!stmtCache[key]) {
    stmtCache[key] = getDb().prepare(sql);
  }
  return stmtCache[key];
}

export async function executeFileTool(toolName, params) {
  const startTime = Date.now();

  try {
    let result;

    switch (toolName) {
      case 'read_csv':
        result = await readCsv(params.filename, params.limit);
        break;
      case 'grep_tracks':
        result = await grepTracks(params.pattern, params.field, params.limit);
        break;
      case 'search_tracks':
        result = await searchTracks(params.query, params.limit);
        break;
      case 'get_track_by_id':
        result = await getTrackById(params.track_id);
        break;
      case 'get_tracks_by_ids':
        result = await getTracksByIds(params.track_ids, params.limit);
        break;
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }

    const elapsed = Date.now() - startTime;
    console.log(`⚡ ${toolName} completed in ${elapsed}ms`);
    return result;

  } catch (error) {
    console.error(`Error executing ${toolName}:`, error);
    throw error;
  }
}

// Read CSV equivalent - now reads from database tables
async function readCsv(filename, limit) {
  const tableName = filename.replace('.csv', '').replace(/-/g, '_');

  // Security: Validate table name against whitelist to prevent SQL injection
  if (!ALLOWED_TABLES.has(tableName)) {
    console.error(`Security: Rejected access to non-whitelisted table "${tableName}"`);
    throw new Error(`Access to table "${tableName}" is not allowed`);
  }

  // Security: Validate and sanitize limit parameter
  const safeLimit = Math.min(Math.max(1, parseInt(limit, 10) || 1000), 10000);

  try {
    // Table name is now validated against whitelist, safe to interpolate
    const sql = `SELECT * FROM ${tableName} LIMIT ?`;
    const stmt = getDb().prepare(sql);
    const rows = stmt.all(safeLimit);
    return rows;
  } catch (error) {
    console.error(`Error reading table ${tableName}:`, error);
    return [];
  }
}

// Optimized grep for tracks - uses indexed database queries
async function grepTracks(pattern, field = 'all', limit = 12) {
  let sql;
  const params = {};

  // Handle enhanced metadata fields that search in descriptions
  const enhancedFields = ['mood', 'energy_level', 'use_case', 'use_cases', 'instruments', 'era'];
  if (enhancedFields.includes(field)) {
    // For enhanced fields, search in track descriptions where these are extracted from
    sql = `SELECT * FROM tracks WHERE track_description LIKE @pattern LIMIT @limit`;
    params.pattern = `%${pattern}%`;
    params.limit = limit * 3; // Get more results to filter through

    try {
      const stmt = getDb().prepare(sql);
      const rows = stmt.all(params);
      // Enhance tracks and filter by the specific field
      const enhancedTracks = enhanceTracksMetadata(rows);

      // Filter by the specific enhanced field
      const filtered = enhancedTracks.filter(track => {
        const fieldValue = track[field];
        if (Array.isArray(fieldValue)) {
          return fieldValue.some(v => v.toLowerCase().includes(pattern.toLowerCase()));
        } else if (typeof fieldValue === 'string') {
          return fieldValue.toLowerCase().includes(pattern.toLowerCase());
        }
        return false;
      });

      return filtered.slice(0, limit);
    } catch (error) {
      console.error('Error searching enhanced fields:', error);
      return [];
    }
  }

  switch (field) {
    case 'genre':
      // Search in facet_labels which contains human-readable genre names
      sql = `SELECT * FROM tracks WHERE facet_labels LIKE @pattern LIMIT @limit`;
      params.pattern = `%${pattern}%`;
      params.limit = limit;
      break;

    case 'track_title':
      sql = `SELECT * FROM tracks WHERE track_title LIKE @pattern LIMIT @limit`;
      params.pattern = `%${pattern}%`;
      params.limit = limit;
      break;

    case 'track_description':
      sql = `SELECT * FROM tracks WHERE track_description LIKE @pattern LIMIT @limit`;
      params.pattern = `%${pattern}%`;
      params.limit = limit;
      break;

    case 'composer':
      // Use composer_fullname column (actual schema)
      sql = `SELECT * FROM tracks WHERE composer_fullname LIKE @pattern LIMIT @limit`;
      params.pattern = `%${pattern}%`;
      params.limit = limit;
      break;

    case 'library_name':
      sql = `SELECT * FROM tracks WHERE library_name LIKE @pattern LIMIT @limit`;
      params.pattern = `%${pattern}%`;
      params.limit = limit;
      break;

    case 'album_title':
      sql = `SELECT * FROM tracks WHERE album_title LIKE @pattern LIMIT @limit`;
      params.pattern = `%${pattern}%`;
      params.limit = limit;
      break;

    case 'has_stems':
      // Search in facet_labels for "Stems" indicator
      sql = `SELECT * FROM tracks WHERE facet_labels LIKE @pattern LIMIT @limit`;
      params.pattern = pattern.toLowerCase() === 'yes' ? '%Stems%' : '%No Stems%';
      params.limit = limit;
      break;

    case 'all':
    default:
      // Search across all text fields
      sql = `
        SELECT * FROM tracks
        WHERE track_title LIKE @pattern
           OR track_description LIKE @pattern
           OR composer_fullname LIKE @pattern
           OR library_name LIKE @pattern
           OR album_title LIKE @pattern
           OR facet_labels LIKE @pattern
        LIMIT @limit
      `;
      params.pattern = `%${pattern}%`;
      params.limit = limit;
      break;
  }

  try {
    const stmt = getDb().prepare(sql);
    const rows = stmt.all(params);
    // Enhance tracks with metadata before returning
    return enhanceTracksMetadata(rows);
  } catch (error) {
    console.error('Error searching tracks:', error);
    return [];
  }
}

// Search tracks using Solr - full catalog search with relevance ranking
async function searchTracks(query, limit = 12) {
  try {
    const searchResults = await solrSearch({
      text: query,
      limit: limit,
      offset: 0
    });

    // Enrich with genre names
    const enrichedTracks = enrichTracksWithGenreNames(searchResults.tracks);

    // Return with explicit formatting instruction for Claude
    return {
      _format_instruction: "CRITICAL: Return this data as JSON with type='track_results'. Do NOT summarize or convert to markdown. Include ALL tracks in the response.",
      type: "track_results",
      message: `Found ${searchResults.total} tracks matching "${query}"`,
      tracks: enrichedTracks,
      total_count: searchResults.total,
      showing: `1-${enrichedTracks.length}`
    };
  } catch (error) {
    console.error('Error searching tracks via Solr:', error);
    // Fallback to SQLite grep if Solr fails
    const fallbackTracks = await grepTracks(query, 'all', limit);
    return {
      _format_instruction: "CRITICAL: Return this data as JSON with type='track_results'. Do NOT summarize or convert to markdown.",
      type: "track_results",
      message: `Found tracks matching "${query}"`,
      tracks: fallbackTracks,
      total_count: limit,
      showing: `1-${limit}`,
      _fallback: true
    };
  }
}

// Get single track by ID - optimized with index
async function getTrackById(trackId) {
  const stmt = getStatement('getTrackById', 'SELECT * FROM tracks WHERE id = ?');
  const row = stmt.get(trackId);
  return row ? enhanceTrackMetadata(row) : null;
}

// Get multiple tracks by IDs - optimized batch query
async function getTracksByIds(trackIds, limit = 12) {
  if (!Array.isArray(trackIds) || trackIds.length === 0) {
    return [];
  }

  // Security: Validate and sanitize limit parameter
  const safeLimit = Math.min(Math.max(1, parseInt(limit, 10) || 12), 1000);

  // Take only the first 'limit' track IDs
  const idsToFetch = trackIds.slice(0, safeLimit);

  // Create placeholders for the IN clause
  const placeholders = idsToFetch.map(() => '?').join(',');
  // Use parameterized limit for security
  const sql = `SELECT * FROM tracks WHERE id IN (${placeholders}) LIMIT ?`;

  try {
    const stmt = getDb().prepare(sql);
    const rows = stmt.all(...idsToFetch, safeLimit);

    // Sort results to match the order of input IDs
    const idToTrack = {};
    rows.forEach(row => {
      idToTrack[row.id] = row;
    });

    const orderedResults = idsToFetch
      .map(id => idToTrack[id])
      .filter(track => track !== undefined);

    // Enhance tracks with metadata before returning
    return enhanceTracksMetadata(orderedResults);
  } catch (error) {
    console.error('Error getting tracks by IDs:', error);
    return [];
  }
}

// Close database connection (for cleanup)
export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}