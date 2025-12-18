/**
 * Shared Database Connection Manager
 * Provides centralized connection pool for all services
 * Eliminates duplicate connections across fileToolsDb, metadataSearch, etc.
 */
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'apm_music.db');

// Singleton connections
let readonlyDb = null;
let readwriteDb = null;

// Prepared statement cache
const stmtCache = new Map();

/**
 * Get read-only database connection (for queries)
 * Use this for all SELECT operations
 */
export function getReadonlyDb() {
  if (!readonlyDb) {
    readonlyDb = new Database(dbPath, { readonly: true });
    // Performance optimizations for reads
    readonlyDb.pragma('journal_mode = WAL');
    readonlyDb.pragma('cache_size = 10000');
    readonlyDb.pragma('temp_store = MEMORY');
    readonlyDb.pragma('mmap_size = 268435456'); // 256MB memory-mapped I/O
    console.log('Database: Initialized read-only connection');
  }
  return readonlyDb;
}

/**
 * Get read-write database connection (for mutations)
 * Use this for INSERT, UPDATE, DELETE operations
 */
export function getReadWriteDb() {
  if (!readwriteDb) {
    readwriteDb = new Database(dbPath, { readonly: false });
    // Performance optimizations for writes
    readwriteDb.pragma('journal_mode = WAL');
    readwriteDb.pragma('synchronous = NORMAL');
    readwriteDb.pragma('cache_size = 10000');
    readwriteDb.pragma('temp_store = MEMORY');
    console.log('Database: Initialized read-write connection');
  }
  return readwriteDb;
}

/**
 * Get or create a prepared statement (cached for performance)
 * @param {string} key - Unique key for the statement
 * @param {string} sql - SQL query
 * @param {boolean} readonly - Whether to use readonly connection
 */
export function getStatement(key, sql, readonly = true) {
  const cacheKey = `${readonly ? 'ro' : 'rw'}:${key}`;

  if (!stmtCache.has(cacheKey)) {
    const db = readonly ? getReadonlyDb() : getReadWriteDb();
    stmtCache.set(cacheKey, db.prepare(sql));
  }

  return stmtCache.get(cacheKey);
}

/**
 * Clear the statement cache (use after schema changes)
 */
export function clearStatementCache() {
  stmtCache.clear();
}

/**
 * Close all database connections (for graceful shutdown)
 */
export function closeAllConnections() {
  if (readonlyDb) {
    readonlyDb.close();
    readonlyDb = null;
    console.log('Database: Closed read-only connection');
  }
  if (readwriteDb) {
    readwriteDb.close();
    readwriteDb = null;
    console.log('Database: Closed read-write connection');
  }
  stmtCache.clear();
}

/**
 * Get database stats for health checks
 */
export function getDatabaseStats() {
  try {
    const db = getReadonlyDb();
    const trackCount = db.prepare('SELECT COUNT(*) as count FROM tracks').get();
    const facetCount = db.prepare('SELECT COUNT(*) as count FROM facet_taxonomy').get();

    return {
      status: 'connected',
      path: dbPath,
      track_count: trackCount.count,
      facet_count: facetCount.count
    };
  } catch (error) {
    return {
      status: 'error',
      path: dbPath,
      error: error.message
    };
  }
}

// Handle process shutdown gracefully
process.on('SIGINT', closeAllConnections);
process.on('SIGTERM', closeAllConnections);

export default {
  getReadonlyDb,
  getReadWriteDb,
  getStatement,
  clearStatementCache,
  closeAllConnections,
  getDatabaseStats
};
