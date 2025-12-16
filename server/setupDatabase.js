import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'csv-parse/sync';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
const dbPath = path.join(__dirname, 'apm_music.db');

console.log('🚀 Setting up APM Music SQLite Database...');

// Delete existing database if it exists
if (fs.existsSync(dbPath)) {
  fs.unlinkSync(dbPath);
  console.log('Removed existing database');
}

// Create new database
const db = new Database(dbPath);
console.log('Created new database:', dbPath);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('cache_size = 10000');
db.pragma('temp_store = MEMORY');

// Create tables
console.log('\n📝 Creating tables...');

// Tracks table
db.exec(`
  CREATE TABLE IF NOT EXISTS tracks (
    id TEXT PRIMARY KEY,
    track_title TEXT,
    track_description TEXT,
    bpm TEXT,
    duration TEXT,
    album_title TEXT,
    library_name TEXT,
    composer TEXT,
    genre TEXT,
    additional_genres TEXT,
    apm_release_date TEXT,
    has_stems TEXT
  )
`);

// Genre taxonomy table
db.exec(`
  CREATE TABLE IF NOT EXISTS genre_taxonomy (
    genre_id TEXT PRIMARY KEY,
    genre_name TEXT,
    parent_id TEXT,
    track_count INTEGER
  )
`);

// Projects table
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    project_id TEXT PRIMARY KEY,
    name TEXT,
    description TEXT,
    for_field TEXT,
    keywords TEXT,
    created_on TEXT,
    modified_on TEXT,
    deadline TEXT,
    collaborators TEXT
  )
`);

// Project tracks table
db.exec(`
  CREATE TABLE IF NOT EXISTS project_tracks (
    project_id TEXT,
    track_id TEXT,
    added_date TEXT,
    position INTEGER,
    notes TEXT,
    PRIMARY KEY (project_id, track_id)
  )
`);

// Search history table
db.exec(`
  CREATE TABLE IF NOT EXISTS search_history (
    search_id TEXT PRIMARY KEY,
    user_id TEXT,
    timestamp TEXT,
    query TEXT,
    search_mode TEXT,
    result_track_ids TEXT,
    auditioned_track_ids TEXT,
    downloaded_track_ids TEXT
  )
`);

// Download history table
db.exec(`
  CREATE TABLE IF NOT EXISTS download_history (
    download_id TEXT PRIMARY KEY,
    user_id TEXT,
    track_id TEXT,
    timestamp TEXT,
    project_id TEXT
  )
`);

// Audition history table
db.exec(`
  CREATE TABLE IF NOT EXISTS audition_history (
    audition_id TEXT PRIMARY KEY,
    user_id TEXT,
    track_id TEXT,
    timestamp TEXT,
    duration_played REAL,
    full_listen TEXT,
    search_id TEXT
  )
`);

// Prompt results table
db.exec(`
  CREATE TABLE IF NOT EXISTS prompt_results (
    prompt TEXT PRIMARY KEY,
    result_track_ids TEXT,
    result_count INTEGER
  )
`);

// Audio similarities table
db.exec(`
  CREATE TABLE IF NOT EXISTS audio_similarities (
    source_track_id TEXT PRIMARY KEY,
    similar_track_ids TEXT,
    similarity_basis TEXT
  )
`);

// Mock references table
db.exec(`
  CREATE TABLE IF NOT EXISTS mock_references (
    reference_type TEXT,
    reference_input TEXT PRIMARY KEY,
    matched_track_id TEXT
  )
`);

console.log('Tables created successfully');

// Function to import CSV data
function importCsv(filename, tableName, columns) {
  const filepath = path.join(dataDir, filename);

  if (!fs.existsSync(filepath)) {
    console.log(`⚠️ Skipping ${filename} (file not found)`);
    return;
  }

  console.log(`\n📥 Importing ${filename}...`);
  const content = fs.readFileSync(filepath, 'utf-8');
  const records = parse(content, { columns: true });

  if (records.length === 0) {
    console.log(`No records found in ${filename}`);
    return;
  }

  // Prepare insert statement
  const placeholders = columns.map(() => '?').join(',');
  const stmt = db.prepare(`INSERT OR REPLACE INTO ${tableName} (${columns.join(',')}) VALUES (${placeholders})`);

  // Begin transaction for faster inserts
  const insertMany = db.transaction((records) => {
    for (const record of records) {
      const values = columns.map(col => record[col] || null);
      stmt.run(values);
    }
  });

  insertMany(records);
  console.log(`✅ Imported ${records.length} records into ${tableName}`);
}

// Import all CSV files
console.log('\n📦 Importing CSV data...');

// Import tracks (largest file)
importCsv('tracks.csv', 'tracks', [
  'id', 'track_title', 'track_description', 'bpm', 'duration',
  'album_title', 'library_name', 'composer', 'genre',
  'additional_genres', 'apm_release_date', 'has_stems'
]);

// Import other tables
importCsv('genre_taxonomy.csv', 'genre_taxonomy', ['genre_id', 'genre_name', 'parent_id', 'track_count']);
importCsv('projects.csv', 'projects', ['project_id', 'name', 'description', 'for_field', 'keywords', 'created_on', 'modified_on', 'deadline', 'collaborators']);
importCsv('project_tracks.csv', 'project_tracks', ['project_id', 'track_id', 'added_date', 'position', 'notes']);
importCsv('search_history.csv', 'search_history', ['search_id', 'user_id', 'timestamp', 'query', 'search_mode', 'result_track_ids', 'auditioned_track_ids', 'downloaded_track_ids']);
importCsv('download_history.csv', 'download_history', ['download_id', 'user_id', 'track_id', 'timestamp', 'project_id']);
importCsv('audition_history.csv', 'audition_history', ['audition_id', 'user_id', 'track_id', 'timestamp', 'duration_played', 'full_listen', 'search_id']);
importCsv('prompt_results.csv', 'prompt_results', ['prompt', 'result_track_ids', 'result_count']);
importCsv('audio_similarities.csv', 'audio_similarities', ['source_track_id', 'similar_track_ids', 'similarity_basis']);
importCsv('mock_references.csv', 'mock_references', ['reference_type', 'reference_input', 'matched_track_id']);

// Create indexes for performance
console.log('\n🔍 Creating indexes for performance...');

// Tracks indexes
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_tracks_genre ON tracks(genre);
  CREATE INDEX IF NOT EXISTS idx_tracks_title ON tracks(track_title);
  CREATE INDEX IF NOT EXISTS idx_tracks_composer ON tracks(composer);
  CREATE INDEX IF NOT EXISTS idx_tracks_library ON tracks(library_name);
  CREATE INDEX IF NOT EXISTS idx_tracks_album ON tracks(album_title);
  CREATE INDEX IF NOT EXISTS idx_tracks_bpm ON tracks(bpm);
  CREATE INDEX IF NOT EXISTS idx_tracks_stems ON tracks(has_stems);
`);

// Other indexes
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_genre_parent ON genre_taxonomy(parent_id);
  CREATE INDEX IF NOT EXISTS idx_project_tracks_project ON project_tracks(project_id);
  CREATE INDEX IF NOT EXISTS idx_project_tracks_track ON project_tracks(track_id);
  CREATE INDEX IF NOT EXISTS idx_download_user ON download_history(user_id);
  CREATE INDEX IF NOT EXISTS idx_download_track ON download_history(track_id);
  CREATE INDEX IF NOT EXISTS idx_audition_user ON audition_history(user_id);
  CREATE INDEX IF NOT EXISTS idx_audition_track ON audition_history(track_id);
  CREATE INDEX IF NOT EXISTS idx_search_user ON search_history(user_id);
`);

console.log('✅ Indexes created successfully');

// Analyze database for query optimization
db.exec('ANALYZE');

// Get database stats
const trackCount = db.prepare('SELECT COUNT(*) as count FROM tracks').get();
const genreCount = db.prepare('SELECT COUNT(*) as count FROM genre_taxonomy').get();
const projectCount = db.prepare('SELECT COUNT(*) as count FROM projects').get();

console.log('\n📊 Database Statistics:');
console.log(`- Tracks: ${trackCount.count}`);
console.log(`- Genres: ${genreCount.count}`);
console.log(`- Projects: ${projectCount.count}`);
console.log(`- Database size: ${(fs.statSync(dbPath).size / 1024 / 1024).toFixed(2)} MB`);

// Close database
db.close();

console.log('\n✨ Database setup complete!');
console.log('Database location:', dbPath);