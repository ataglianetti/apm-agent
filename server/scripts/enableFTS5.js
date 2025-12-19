import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '../apm_music.db');

console.log('Enabling FTS5 Full-Text Search...');
console.log('Database:', dbPath);

// Open database
const db = new Database(dbPath);

// First, check what text fields exist in tracks table
console.log('\nChecking tracks table schema...');
const columns = db.prepare("PRAGMA table_info(tracks)").all();
const columnNames = columns.map(col => col.name);

console.log(`Found ${columnNames.length} columns in tracks table`);

// Standard text fields we want to index
const textFields = [
  'track_title',
  'track_description',
  'album_title',
  'library_name',
  'composer'
];

// Optional fields that may or may not exist
const optionalFields = ['album_description', 'lyrics', 'lyric_subject'];

// Check which optional fields exist
const fieldsToIndex = [...textFields];
for (const field of optionalFields) {
  if (columnNames.includes(field)) {
    fieldsToIndex.push(field);
    console.log(`✓ Found optional field: ${field}`);
  }
}

console.log(`\nWill index ${fieldsToIndex.length} text fields: ${fieldsToIndex.join(', ')}`);

// Drop existing FTS table if it exists
console.log('\nDropping existing tracks_fts table (if exists)...');
db.exec('DROP TABLE IF EXISTS tracks_fts');

// Create FTS5 virtual table
console.log('\nCreating FTS5 virtual table...');
const ftsColumns = fieldsToIndex.join(', ');
db.exec(`
  CREATE VIRTUAL TABLE tracks_fts USING fts5(
    id UNINDEXED,
    ${ftsColumns},
    tokenize = 'porter unicode61'
  );
`);

console.log('✅ FTS5 table created with porter stemming and unicode support');

// Populate FTS table from tracks
console.log('\nPopulating FTS table...');
const selectFields = ['id', ...fieldsToIndex].join(', ');
const placeholders = ['?', ...fieldsToIndex.map(() => '?')].join(', ');

const selectStmt = db.prepare(`SELECT ${selectFields} FROM tracks`);
const insertStmt = db.prepare(`
  INSERT INTO tracks_fts VALUES (${placeholders})
`);

const tracks = selectStmt.all();
console.log(`Processing ${tracks.length} tracks...`);

const transaction = db.transaction((tracks) => {
  let count = 0;
  for (const track of tracks) {
    const values = [track.id, ...fieldsToIndex.map(field => track[field] || '')];
    insertStmt.run(...values);
    count++;

    if (count % 1000 === 0) {
      console.log(`  Indexed ${count} tracks...`);
    }
  }
  return count;
});

const indexed = transaction(tracks);
console.log(`✅ Indexed ${indexed} tracks`);

// Create triggers to keep FTS in sync (for future updates)
console.log('\nCreating triggers to keep FTS in sync...');
db.exec(`
  -- Trigger for INSERT
  CREATE TRIGGER IF NOT EXISTS tracks_ai AFTER INSERT ON tracks BEGIN
    INSERT INTO tracks_fts (id, ${ftsColumns})
    VALUES (new.id, ${fieldsToIndex.map(f => `new.${f}`).join(', ')});
  END;

  -- Trigger for DELETE
  CREATE TRIGGER IF NOT EXISTS tracks_ad AFTER DELETE ON tracks BEGIN
    DELETE FROM tracks_fts WHERE id = old.id;
  END;

  -- Trigger for UPDATE
  CREATE TRIGGER IF NOT EXISTS tracks_au AFTER UPDATE ON tracks BEGIN
    UPDATE tracks_fts
    SET ${fieldsToIndex.map(f => `${f} = new.${f}`).join(', ')}
    WHERE id = new.id;
  END;
`);

console.log('✅ Triggers created');

// Test FTS search
console.log('\nTesting FTS search...');
const testQueries = [
  'piano',
  'suspense',
  'rock',
  'hans zimmer',
  'uplifting'
];

for (const query of testQueries) {
  const result = db.prepare(`
    SELECT COUNT(*) as count
    FROM tracks_fts
    WHERE tracks_fts MATCH ?
  `).get(query);

  console.log(`  "${query}": ${result.count} matches`);
}

// Show sample FTS results
console.log('\nSample FTS Search for "piano":');
const samples = db.prepare(`
  SELECT
    t.track_title,
    t.track_description,
    snippet(tracks_fts, 1, '<b>', '</b>', '...', 32) as snippet
  FROM tracks_fts
  JOIN tracks t ON tracks_fts.id = t.id
  WHERE tracks_fts MATCH 'piano'
  LIMIT 5
`).all();

for (const sample of samples) {
  console.log(`\n  ${sample.track_title}`);
  console.log(`    ${sample.snippet.replace(/<b>/g, '→').replace(/<\/b>/g, '←')}`);
}

db.close();
console.log('\n✅ Done! FTS5 full-text search is enabled.');
