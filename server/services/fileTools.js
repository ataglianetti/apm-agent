import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'csv-parse/sync';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', '..', 'data');

// LRU Cache implementation with size limit
class LRUCache {
  constructor(maxSize = 10) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  get(key) {
    if (!this.cache.has(key)) {
      return undefined;
    }
    // Move to end (most recently used)
    const value = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key, value) {
    // Remove key if it exists (to update position)
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Evict least recently used (first item)
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
      console.log(`Cache evicted: ${firstKey}`);
    }
    this.cache.set(key, value);
  }

  has(key) {
    return this.cache.has(key);
  }

  clear() {
    this.cache.clear();
  }

  size() {
    return this.cache.size;
  }
}

// Cache for parsed CSV files (except tracks.csv which is too large)
// Limit to 10 files to prevent memory issues
const csvCache = new LRUCache(10);

// Parse a CSV file and return as array of objects
function parseCsvFile(filename) {
  const filePath = path.join(DATA_DIR, filename);

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filename}`);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  });
}

// Get cached CSV data (for small files)
function getCachedCsv(filename) {
  let data = csvCache.get(filename);
  if (!data) {
    data = parseCsvFile(filename);
    csvCache.set(filename, data);
  }
  return data;
}

// Read a CSV file
function readCsv(filename, limit) {
  // Don't allow reading tracks.csv directly (too large)
  if (filename === 'tracks.csv') {
    return { error: 'tracks.csv is too large to read directly. Use grep_tracks instead.' };
  }

  try {
    const data = getCachedCsv(filename);
    if (limit && limit > 0) {
      return data.slice(0, limit);
    }
    return data;
  } catch (error) {
    return { error: error.message };
  }
}

// Search tracks.csv by pattern (single filter)
function grepTracks(pattern, field = 'all', limit = 12) {
  // If pattern is an object with filters, use the multi-filter function
  if (typeof pattern === 'object' && pattern.filters) {
    return grepTracksMultiple(pattern.filters, limit);
  }

  try {
    const filePath = path.join(DATA_DIR, 'tracks.csv');
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const headers = lines[0].split(',');

    // Find field indices (expanded for new fields)
    const fieldIndices = {
      id: headers.indexOf('id'),
      track_title: headers.indexOf('track_title'),
      track_description: headers.indexOf('track_description'),
      composer: headers.indexOf('composer'),
      library_name: headers.indexOf('library_name'),
      album_title: headers.indexOf('album_title'),
      genre: headers.indexOf('genre'),
      additional_genres: headers.indexOf('additional_genres'),
      bpm: headers.indexOf('bpm'),
      duration: headers.indexOf('duration'),
      apm_release_date: headers.indexOf('apm_release_date'),
      has_stems: headers.indexOf('has_stems'),
      lyrics: headers.indexOf('lyrics'),
      inspired_by: headers.indexOf('inspired_by')
    };

    const results = [];
    const patternLower = pattern.toLowerCase();

    // Start from line 1 (skip header)
    for (let i = 1; i < lines.length && results.length < limit; i++) {
      const line = lines[i];
      if (!line.trim()) continue;

      // Parse the CSV line (handle quoted fields)
      const values = parseCSVLine(line);

      let matches = false;

      if (field === 'genre' || field === 'tags') {
        // Match genre or additional_genres fields
        const genre = values[fieldIndices.genre] || '';
        const additionalGenres = values[fieldIndices.additional_genres] || '';
        matches = genre.toLowerCase().includes(patternLower) ||
          additionalGenres.toLowerCase().includes(patternLower);
      } else if (field === 'has_stems') {
        // Match tracks with stems - optimize for this common case
        const hasStemsValue = values[fieldIndices.has_stems] || '';
        matches = hasStemsValue === pattern; // Direct match, no lowercase needed
      } else if (field === 'all') {
        // Search all text fields
        matches = values.some(v => v && v.toLowerCase().includes(patternLower));
      } else {
        // Search specific field
        const fieldIndex = fieldIndices[field];
        if (fieldIndex >= 0) {
          const value = values[fieldIndex] || '';
          matches = value.toLowerCase().includes(patternLower);
        }
      }

      if (matches) {
        results.push({
          id: values[fieldIndices.id],
          track_title: values[fieldIndices.track_title],
          track_description: values[fieldIndices.track_description],
          composer: values[fieldIndices.composer],
          album_title: values[fieldIndices.album_title],
          library_name: values[fieldIndices.library_name],
          genre: values[fieldIndices.genre],
          additional_genres: values[fieldIndices.additional_genres],
          bpm: values[fieldIndices.bpm],
          duration: values[fieldIndices.duration],
          apm_release_date: values[fieldIndices.apm_release_date],
          has_stems: values[fieldIndices.has_stems],
          lyrics: values[fieldIndices.lyrics],
          inspired_by: values[fieldIndices.inspired_by]
        });
      }
    }

    return results;
  } catch (error) {
    return { error: error.message };
  }
}

// Search tracks with multiple filters
function grepTracksMultiple(filters, limit = 12) {
  try {
    const filePath = path.join(DATA_DIR, 'tracks.csv');
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const headers = lines[0].split(',');

    // Find field indices
    const fieldIndices = {
      id: headers.indexOf('id'),
      track_title: headers.indexOf('track_title'),
      track_description: headers.indexOf('track_description'),
      composer: headers.indexOf('composer'),
      library_name: headers.indexOf('library_name'),
      album_title: headers.indexOf('album_title'),
      genre: headers.indexOf('genre'),
      additional_genres: headers.indexOf('additional_genres'),
      bpm: headers.indexOf('bpm'),
      duration: headers.indexOf('duration'),
      apm_release_date: headers.indexOf('apm_release_date'),
      has_stems: headers.indexOf('has_stems'),
      lyrics: headers.indexOf('lyrics'),
      inspired_by: headers.indexOf('inspired_by')
    };

    const results = [];

    // Start from line 1 (skip header)
    for (let i = 1; i < lines.length && results.length < limit; i++) {
      const line = lines[i];
      if (!line.trim()) continue;

      // Parse the CSV line
      const values = parseCSVLine(line);

      // Check if all filters match
      let allFiltersMatch = true;

      for (const filter of filters) {
        const fieldName = filter.field;
        const value = filter.value.toLowerCase();
        const operator = filter.operator || ':';
        const fieldIndex = fieldIndices[fieldName];

        if (fieldName === 'genre' || fieldName === 'tags') {
          // Check both genre and additional_genres
          const genre = values[fieldIndices.genre] || '';
          const additionalGenres = values[fieldIndices.additional_genres] || '';

          if (operator === '=') {
            // Exact match
            if (genre.toLowerCase() !== value && additionalGenres.toLowerCase() !== value) {
              allFiltersMatch = false;
              break;
            }
          } else {
            // Contains match
            if (!genre.toLowerCase().includes(value) && !additionalGenres.toLowerCase().includes(value)) {
              allFiltersMatch = false;
              break;
            }
          }
        } else if (fieldIndex >= 0) {
          const fieldValue = values[fieldIndex] || '';

          if (operator === '=') {
            // Exact match
            if (fieldValue.toLowerCase() !== value) {
              allFiltersMatch = false;
              break;
            }
          } else {
            // Contains match
            if (!fieldValue.toLowerCase().includes(value)) {
              allFiltersMatch = false;
              break;
            }
          }
        } else {
          // Unknown field, skip this track
          allFiltersMatch = false;
          break;
        }
      }

      if (allFiltersMatch) {
        results.push({
          id: values[fieldIndices.id],
          track_title: values[fieldIndices.track_title],
          track_description: values[fieldIndices.track_description],
          composer: values[fieldIndices.composer],
          album_title: values[fieldIndices.album_title],
          library_name: values[fieldIndices.library_name],
          genre: values[fieldIndices.genre],
          additional_genres: values[fieldIndices.additional_genres],
          bpm: values[fieldIndices.bpm],
          duration: values[fieldIndices.duration],
          apm_release_date: values[fieldIndices.apm_release_date],
          has_stems: values[fieldIndices.has_stems],
          lyrics: values[fieldIndices.lyrics],
          inspired_by: values[fieldIndices.inspired_by]
        });
      }
    }

    return results;
  } catch (error) {
    return { error: error.message };
  }
}

// Parse a single CSV line handling quoted fields
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);

  return result;
}

// Get a single track by ID
function getTrackById(trackId) {
  const tracks = grepTracks(trackId, 'all', 100);
  if (Array.isArray(tracks)) {
    const match = tracks.find(t => t.id === trackId);
    return match || { error: `Track not found: ${trackId}` };
  }
  return tracks;
}

// Get multiple tracks by IDs
function getTracksByIds(trackIds, limit = 12) {
  if (!Array.isArray(trackIds) || trackIds.length === 0) {
    return { error: 'trackIds must be a non-empty array' };
  }

  try {
    const filePath = path.join(DATA_DIR, 'tracks.csv');
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const headers = lines[0].split(',');

    const fieldIndices = {
      id: headers.indexOf('id'),
      track_title: headers.indexOf('track_title'),
      track_description: headers.indexOf('track_description'),
      composer: headers.indexOf('composer'),
      library_name: headers.indexOf('library_name'),
      album_title: headers.indexOf('album_title'),
      genre: headers.indexOf('genre'),
      additional_genres: headers.indexOf('additional_genres'),
      bpm: headers.indexOf('bpm'),
      duration: headers.indexOf('duration'),
      apm_release_date: headers.indexOf('apm_release_date'),
      has_stems: headers.indexOf('has_stems')
    };

    const trackIdSet = new Set(trackIds.slice(0, limit));
    const results = [];

    for (let i = 1; i < lines.length && results.length < limit; i++) {
      const line = lines[i];
      if (!line.trim()) continue;

      const values = parseCSVLine(line);
      const id = values[fieldIndices.id];

      if (trackIdSet.has(id)) {
        results.push({
          id: values[fieldIndices.id],
          track_title: values[fieldIndices.track_title],
          track_description: values[fieldIndices.track_description],
          composer: values[fieldIndices.composer],
          album_title: values[fieldIndices.album_title],
          library_name: values[fieldIndices.library_name],
          genre: values[fieldIndices.genre],
          additional_genres: values[fieldIndices.additional_genres],
          bpm: values[fieldIndices.bpm],
          duration: values[fieldIndices.duration],
          apm_release_date: values[fieldIndices.apm_release_date],
          has_stems: values[fieldIndices.has_stems]
        });
      }
    }

    return results;
  } catch (error) {
    return { error: error.message };
  }
}

// Main tool executor
export function executeFileTool(name, input) {
  switch (name) {
    case 'read_csv':
      return readCsv(input.filename, input.limit);

    case 'grep_tracks':
      return grepTracks(input.pattern, input.field || 'all', input.limit || 12);

    case 'get_track_by_id':
      return getTrackById(input.track_id);

    case 'get_tracks_by_ids':
      return getTracksByIds(input.track_ids, input.limit || 12);

    default:
      return { error: `Unknown tool: ${name}` };
  }
}
