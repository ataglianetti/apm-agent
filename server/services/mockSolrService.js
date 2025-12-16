/**
 * Mock Solr Service
 * Simulates Apache Solr for metadata-based search
 * Uses SQLite database with 10,000 tracks
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class MockSolrService {
  constructor() {
    this.db = new Database(path.join(__dirname, '..', 'apm_music.db'), {
      readonly: false,
      fileMustExist: true
    });

    // Enable performance optimizations
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('cache_size = 10000');
    this.db.pragma('temp_store = MEMORY');
  }

  /**
   * Main search method - handles all metadata queries
   * @param {Object} query - Search parameters
   * @returns {Object} Search results with timing
   */
  async search(query) {
    const startTime = Date.now();
    let results = [];
    let searchType = 'metadata';

    try {
      // Handle different query types
      if (query.genre) {
        results = await this.searchByGenre(query.genre, query.limit);
        searchType = 'genre';
      } else if (query.composer) {
        results = await this.searchByComposer(query.composer, query.limit);
        searchType = 'composer';
      } else if (query.library) {
        results = await this.searchByLibrary(query.library, query.limit);
        searchType = 'library';
      } else if (query.bpm) {
        results = await this.searchByBPM(query.bpm, query.limit);
        searchType = 'bpm';
      } else if (query.title) {
        results = await this.searchByTitle(query.title, query.limit);
        searchType = 'title';
      } else if (query.album) {
        results = await this.searchByAlbum(query.album, query.limit);
        searchType = 'album';
      } else if (query.stems !== undefined) {
        results = await this.searchByStemsAvailability(query.stems, query.limit);
        searchType = 'stems';
      } else if (query.duration) {
        results = await this.searchByDuration(query.duration, query.limit);
        searchType = 'duration';
      } else if (query.year) {
        results = await this.searchByYear(query.year, query.limit);
        searchType = 'year';
      } else if (query.multiField) {
        results = await this.multiFieldSearch(query.multiField, query.limit);
        searchType = 'multi-field';
      } else if (query.sql) {
        // Advanced mode - direct SQL (for power users)
        results = await this.executeSql(query.sql, query.limit);
        searchType = 'advanced-sql';
      }

      const elapsed = Date.now() - startTime;

      return {
        success: true,
        searchType,
        query,
        totalCount: results.length,
        tracks: results.slice(0, query.limit || 12),
        timing: {
          solr: elapsed,
          unit: 'ms'
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        timing: {
          solr: Date.now() - startTime,
          unit: 'ms'
        }
      };
    }
  }

  /**
   * Search by genre code
   */
  async searchByGenre(genre, limit = 12) {
    const stmt = this.db.prepare(`
      SELECT * FROM tracks
      WHERE genre = ? OR additional_genres LIKE ?
      LIMIT ?
    `);
    return stmt.all(genre, `%${genre}%`, limit);
  }

  /**
   * Search by composer name
   */
  async searchByComposer(composer, limit = 12) {
    const stmt = this.db.prepare(`
      SELECT * FROM tracks
      WHERE LOWER(composer) LIKE LOWER(?)
      LIMIT ?
    `);
    return stmt.all(`%${composer}%`, limit);
  }

  /**
   * Search by library name
   */
  async searchByLibrary(library, limit = 12) {
    const stmt = this.db.prepare(`
      SELECT * FROM tracks
      WHERE LOWER(library_name) LIKE LOWER(?)
      LIMIT ?
    `);
    return stmt.all(`%${library}%`, limit);
  }

  /**
   * Search by BPM (supports exact or range)
   */
  async searchByBPM(bpm, limit = 12) {
    if (typeof bpm === 'object' && bpm.min && bpm.max) {
      // Range search
      const stmt = this.db.prepare(`
        SELECT * FROM tracks
        WHERE CAST(bpm AS INTEGER) BETWEEN ? AND ?
        LIMIT ?
      `);
      return stmt.all(bpm.min, bpm.max, limit);
    } else {
      // Exact or near match
      const targetBPM = parseInt(bpm);
      const stmt = this.db.prepare(`
        SELECT * FROM tracks
        WHERE ABS(CAST(bpm AS INTEGER) - ?) <= 5
        ORDER BY ABS(CAST(bpm AS INTEGER) - ?)
        LIMIT ?
      `);
      return stmt.all(targetBPM, targetBPM, limit);
    }
  }

  /**
   * Search by track title
   */
  async searchByTitle(title, limit = 12) {
    const stmt = this.db.prepare(`
      SELECT * FROM tracks
      WHERE LOWER(track_title) LIKE LOWER(?)
      LIMIT ?
    `);
    return stmt.all(`%${title}%`, limit);
  }

  /**
   * Search by album title
   */
  async searchByAlbum(album, limit = 12) {
    const stmt = this.db.prepare(`
      SELECT * FROM tracks
      WHERE LOWER(album_title) LIKE LOWER(?)
      LIMIT ?
    `);
    return stmt.all(`%${album}%`, limit);
  }

  /**
   * Search by stems availability
   */
  async searchByStemsAvailability(hasStems, limit = 12) {
    const stmt = this.db.prepare(`
      SELECT * FROM tracks
      WHERE has_stems = ?
      LIMIT ?
    `);
    return stmt.all(hasStems ? 'true' : 'false', limit);
  }

  /**
   * Search by duration (supports operators)
   */
  async searchByDuration(duration, limit = 12) {
    let sql = 'SELECT * FROM tracks WHERE ';
    let params = [];

    if (typeof duration === 'object') {
      if (duration.min && duration.max) {
        sql += 'CAST(duration AS INTEGER) BETWEEN ? AND ?';
        params = [duration.min, duration.max];
      } else if (duration.operator && duration.value) {
        sql += `CAST(duration AS INTEGER) ${duration.operator} ?`;
        params = [duration.value];
      }
    } else {
      sql += 'CAST(duration AS INTEGER) = ?';
      params = [parseInt(duration)];
    }

    sql += ' LIMIT ?';
    params.push(limit);

    const stmt = this.db.prepare(sql);
    return stmt.all(...params);
  }

  /**
   * Search by release year
   */
  async searchByYear(year, limit = 12) {
    const stmt = this.db.prepare(`
      SELECT * FROM tracks
      WHERE apm_release_date LIKE ?
      LIMIT ?
    `);
    return stmt.all(`%${year}%`, limit);
  }

  /**
   * Multi-field search with AND/OR logic
   */
  async multiFieldSearch(fields, limit = 12) {
    let conditions = [];
    let params = [];

    Object.entries(fields).forEach(([field, value]) => {
      switch(field) {
        case 'genre':
          conditions.push('(genre = ? OR additional_genres LIKE ?)');
          params.push(value, `%${value}%`);
          break;
        case 'composer':
          conditions.push('LOWER(composer) LIKE LOWER(?)');
          params.push(`%${value}%`);
          break;
        case 'library':
          conditions.push('LOWER(library_name) LIKE LOWER(?)');
          params.push(`%${value}%`);
          break;
        case 'bpm':
          if (typeof value === 'object' && value.min && value.max) {
            conditions.push('CAST(bpm AS INTEGER) BETWEEN ? AND ?');
            params.push(value.min, value.max);
          } else {
            conditions.push('ABS(CAST(bpm AS INTEGER) - ?) <= 5');
            params.push(parseInt(value));
          }
          break;
        case 'title':
          conditions.push('LOWER(track_title) LIKE LOWER(?)');
          params.push(`%${value}%`);
          break;
        case 'album':
          conditions.push('LOWER(album_title) LIKE LOWER(?)');
          params.push(`%${value}%`);
          break;
        case 'stems':
          conditions.push('has_stems = ?');
          params.push(value ? 'true' : 'false');
          break;
        case 'description':
          conditions.push('LOWER(track_description) LIKE LOWER(?)');
          params.push(`%${value}%`);
          break;
      }
    });

    const sql = `SELECT * FROM tracks WHERE ${conditions.join(' AND ')} LIMIT ?`;
    params.push(limit);

    const stmt = this.db.prepare(sql);
    return stmt.all(...params);
  }

  /**
   * Execute raw SQL (for advanced users)
   */
  async executeSql(sql, limit = 12) {
    // Add safety checks
    if (!sql.toLowerCase().startsWith('select')) {
      throw new Error('Only SELECT queries allowed');
    }

    // Add limit if not present
    if (!sql.toLowerCase().includes('limit')) {
      sql += ` LIMIT ${limit}`;
    }

    const stmt = this.db.prepare(sql);
    return stmt.all();
  }

  /**
   * Get track by ID
   */
  async getTrackById(id) {
    const stmt = this.db.prepare('SELECT * FROM tracks WHERE id = ?');
    return stmt.get(id);
  }

  /**
   * Get multiple tracks by IDs
   */
  async getTracksByIds(ids) {
    const placeholders = ids.map(() => '?').join(',');
    const stmt = this.db.prepare(`SELECT * FROM tracks WHERE id IN (${placeholders})`);
    return stmt.all(...ids);
  }

  /**
   * Get genre taxonomy information
   */
  async getGenreTaxonomy() {
    const stmt = this.db.prepare('SELECT * FROM genre_taxonomy ORDER BY genre_name');
    return stmt.all();
  }

  /**
   * Parse @ field override syntax
   * Converts @field:value syntax to query object
   */
  parseFieldOverride(queryString) {
    const query = {};
    const fields = queryString.match(/@\w+[-\w]*:[^@]+/g) || [];

    fields.forEach(field => {
      const [key, ...valueParts] = field.substring(1).split(':');
      const value = valueParts.join(':').trim();

      switch(key) {
        case 'track-title':
        case 'title':
          query.title = value;
          break;
        case 'composer':
          query.composer = value;
          break;
        case 'library':
          query.library = value;
          break;
        case 'album':
          query.album = value;
          break;
        case 'genre':
        case 'tags':
          query.genre = value;
          break;
        case 'bpm':
          // Handle range (100-140) or comparison (>120)
          if (value.includes('-')) {
            const [min, max] = value.split('-').map(v => parseInt(v));
            query.bpm = { min, max };
          } else if (value.match(/^[<>]=?\d+$/)) {
            const operator = value.match(/^[<>]=?/)[0];
            const num = parseInt(value.replace(/^[<>]=?/, ''));
            query.bpm = { operator, value: num };
          } else {
            query.bpm = parseInt(value);
          }
          break;
        case 'duration':
          // Handle operators (>60, <120)
          if (value.match(/^[<>]=?\d+$/)) {
            const operator = value.match(/^[<>]=?/)[0];
            const num = parseInt(value.replace(/^[<>]=?/, ''));
            query.duration = { operator, value: num };
          } else {
            query.duration = parseInt(value);
          }
          break;
        case 'stems':
          query.stems = value.toLowerCase() === 'true';
          break;
        case 'year':
          query.year = value;
          break;
        case 'description':
          query.description = value;
          break;
      }
    });

    // If multiple fields, use multiField search
    if (Object.keys(query).length > 1) {
      return { multiField: query };
    }

    return query;
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      status: 'healthy',
      database: this.dbPath,
      tablesReady: this.tablesReady,
      trackCount: this.tablesReady ? this.db.prepare('SELECT COUNT(*) as count FROM tracks').get().count : 0
    };
  }

  /**
   * Close database connection
   */
  close() {
    this.db.close();
  }
}

export default MockSolrService;