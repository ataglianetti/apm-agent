import Database from 'better-sqlite3';
import { parse } from 'csv-parse';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '../apm_music.db');
const catalogCsvPath = path.join(__dirname, '../../data/AnthonyOutput_v2_20251218_095451_CLEANED.csv');

console.log('Loading Full APM Production Catalog...');
console.log('Database:', dbPath);
console.log('Catalog CSV:', catalogCsvPath);

// Open database
const db = new Database(dbPath);

// Drop and recreate tracks table with new schema
console.log('\nCreating new tracks table schema...');
db.exec(`
  DROP TABLE IF EXISTS tracks;

  CREATE TABLE tracks (
    -- Primary identifiers
    id TEXT PRIMARY KEY,                    -- aktrack
    parent_aktrack TEXT,                    -- parent_akTrack (new in v2)
    track_title TEXT NOT NULL,
    track_number TEXT,
    track_index INTEGER,

    -- Track metadata
    track_description TEXT,
    duration INTEGER,                        -- track_duration in seconds
    bpm INTEGER,                            -- track_bpm

    -- Dates
    internal_release_date TEXT,             -- track_internal_release_date
    apm_release_date TEXT,                  -- track_apm_release_date
    recording_date TEXT,                    -- track_recording_date

    -- Facets and genres (stored as semicolon-separated IDs)
    facet_ids TEXT,                         -- track_facet_ids
    facet_labels TEXT,                      -- track_facet_labels (new in v2 - human readable)
    master_genre_id INTEGER,                -- track_master_genre
    additional_genre_ids TEXT,              -- track_additional_genres

    -- Language and artists
    language_iso TEXT,                      -- track_language_iso
    artists TEXT,                           -- track_artists

    -- Identifiers
    isrc_main TEXT,
    isrc_all TEXT,

    -- Song information
    song_id TEXT,
    song_title TEXT,
    song_composers TEXT,
    song_lyricists TEXT,
    song_arrangers TEXT,

    -- Album information
    album_id TEXT,                          -- akcd
    album_title TEXT,
    album_description TEXT,
    album_release_date TEXT,
    album_artists TEXT,

    -- Library information
    library_id TEXT,
    library_name TEXT,

    -- Primary composer (comp1)
    composer_lastname TEXT,
    composer_firstname TEXT,
    composer_fullname TEXT,
    composer_affiliation TEXT,
    composer_cae_number TEXT
  );

  CREATE INDEX idx_tracks_title ON tracks(track_title);
  CREATE INDEX idx_tracks_library ON tracks(library_name);
  CREATE INDEX idx_tracks_album ON tracks(album_id);
  CREATE INDEX idx_tracks_master_genre ON tracks(master_genre_id);
  CREATE INDEX idx_tracks_composer ON tracks(composer_lastname);
  CREATE INDEX idx_tracks_release_date ON tracks(apm_release_date);
  CREATE INDEX idx_tracks_parent ON tracks(parent_aktrack);
`);

console.log('✅ Tracks table created');

// Prepare insert statement
const insertTrack = db.prepare(`
  INSERT INTO tracks (
    id, parent_aktrack, track_title, track_number, track_index,
    track_description, duration, bpm,
    internal_release_date, apm_release_date, recording_date,
    facet_ids, facet_labels, master_genre_id, additional_genre_ids,
    language_iso, artists,
    isrc_main, isrc_all,
    song_id, song_title, song_composers, song_lyricists, song_arrangers,
    album_id, album_title, album_description, album_release_date, album_artists,
    library_id, library_name,
    composer_lastname, composer_firstname, composer_fullname,
    composer_affiliation, composer_cae_number
  ) VALUES (
    ?, ?, ?, ?, ?,
    ?, ?, ?,
    ?, ?, ?,
    ?, ?, ?, ?,
    ?, ?,
    ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?,
    ?, ?, ?,
    ?, ?
  )
`);

// Stream and load tracks
console.log('\nLoading tracks (streaming)...');

let count = 0;
let skipped = 0;
let batch = [];
const BATCH_SIZE = 10000;

function processBatch(batchRecords) {
  const loadBatch = db.transaction(() => {
    for (const row of batchRecords) {
      try {
        // Parse duration from seconds (remove any decimals)
        const duration = row.track_duration ? parseInt(row.track_duration) : null;

        // Parse BPM
        const bpm = row.track_bpm ? parseInt(row.track_bpm) : null;

        // Parse master genre ID
        const masterGenreId = row.track_master_genre ? parseInt(row.track_master_genre) : null;

        // Parse track index
        const trackIndex = row.track_index ? parseInt(row.track_index) : null;

        // Construct composer full name
        const composerFirstname = row.comp1_firstname || '';
        const composerMiddlename = row.comp1_middlename || '';
        const composerLastname = row.comp1_lastname || '';
        const composerFullname = [composerFirstname, composerMiddlename, composerLastname]
          .filter(n => n.trim())
          .join(' ') || null;

        insertTrack.run(
          row.aktrack,                          // id
          row.parent_akTrack,                   // parent_aktrack (new in v2)
          row.track_title,                      // track_title
          row.track_number,                     // track_number
          trackIndex,                           // track_index
          row.track_description,                // track_description
          duration,                             // duration
          bpm,                                  // bpm
          row.track_internal_release_date,      // internal_release_date
          row.track_apm_release_date,           // apm_release_date
          row.track_recording_date,             // recording_date
          row.track_facet_ids,                  // facet_ids
          row.track_facet_labels,               // facet_labels (new in v2)
          masterGenreId,                        // master_genre_id
          row.track_additional_genres,          // additional_genre_ids
          row.track_language_iso,               // language_iso
          row.track_artists,                    // artists
          row.ISRC_main,                        // isrc_main
          row.ISRC_all,                         // isrc_all
          row.song_id,                          // song_id
          row.song_title,                       // song_title
          row.song_composers,                   // song_composers
          row.song_lyricists,                   // song_lyricists
          row.song_arrangers,                   // song_arrangers
          row.akcd,                             // album_id
          row.album_title,                      // album_title
          row.album_description,                // album_description
          row.album_release_date,               // album_release_date
          row.album_artists,                    // album_artists
          row.library_id,                       // library_id
          row.library_name,                     // library_name
          composerLastname,                     // composer_lastname
          composerFirstname,                    // composer_firstname
          composerFullname,                     // composer_fullname
          row.comp1_affilid,                    // composer_affiliation
          row.comp1_caenum                      // composer_cae_number
        );
      } catch (error) {
        skipped++;
        if (skipped <= 10) {
          console.error(`  Error loading track ${row.aktrack}:`, error.message);
        }
      }
    }
  });

  loadBatch();
  count += batchRecords.length - skipped;
}

await new Promise((resolve, reject) => {
  const parser = fs
    .createReadStream(catalogCsvPath)
    .pipe(parse({
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true
    }));

  parser.on('readable', function() {
    let record;
    while ((record = parser.read()) !== null) {
      batch.push(record);

      if (batch.length >= BATCH_SIZE) {
        processBatch(batch);
        console.log(`  Loaded ${count.toLocaleString()} tracks...`);
        batch = [];
      }
    }
  });

  parser.on('end', function() {
    // Process remaining batch
    if (batch.length > 0) {
      processBatch(batch);
    }
    resolve();
  });

  parser.on('error', reject);
});

console.log(`✅ Loaded ${count.toLocaleString()} tracks`);
if (skipped > 0) {
  console.log(`⚠️  Skipped ${skipped} tracks due to errors`);
}

// Now rebuild track_facets table with complete facet data
console.log('\nRebuilding track_facets with complete facet data...');
db.exec(`
  DROP TABLE IF EXISTS track_facets;

  CREATE TABLE track_facets (
    track_id TEXT NOT NULL,
    facet_id INTEGER NOT NULL,
    category_id INTEGER,
    PRIMARY KEY (track_id, facet_id)
  );

  CREATE INDEX idx_track_facets_track ON track_facets(track_id);
  CREATE INDEX idx_track_facets_facet ON track_facets(facet_id);
  CREATE INDEX idx_track_facets_category ON track_facets(category_id);
`);

const insertFacet = db.prepare(`
  INSERT OR IGNORE INTO track_facets (track_id, facet_id, category_id)
  VALUES (?, ?, ?)
`);

const getCategoryId = db.prepare(`
  SELECT category_id FROM facet_taxonomy WHERE facet_id = ?
`);

console.log('Parsing facet assignments from tracks...');
const loadFacets = db.transaction(() => {
  const tracks = db.prepare('SELECT id, facet_ids FROM tracks WHERE facet_ids IS NOT NULL').all();

  let totalFacets = 0;
  let tracksWithFacets = 0;

  for (const track of tracks) {
    if (!track.facet_ids) continue;

    const facetIds = track.facet_ids.split(';')
      .map(id => parseInt(id.trim()))
      .filter(id => !isNaN(id));

    if (facetIds.length > 0) {
      tracksWithFacets++;

      for (const facetId of facetIds) {
        // Look up category_id for this facet
        const result = getCategoryId.get(facetId);
        const categoryId = result ? result.category_id : null;

        insertFacet.run(track.id, facetId, categoryId);
        totalFacets++;
      }
    }

    if (tracksWithFacets % 50000 === 0) {
      console.log(`  Processed ${tracksWithFacets.toLocaleString()} tracks...`);
    }
  }

  return { tracksWithFacets, totalFacets };
});

const { tracksWithFacets, totalFacets } = loadFacets();
console.log(`✅ Processed ${tracksWithFacets.toLocaleString()} tracks`);
console.log(`✅ Created ${totalFacets.toLocaleString()} track-facet relationships`);

// Verify data and show statistics
console.log('\nDatabase Statistics:');

const trackStats = db.prepare(`
  SELECT COUNT(*) as total_tracks FROM tracks
`).get();
console.log(`  Total tracks: ${trackStats.total_tracks.toLocaleString()}`);

const facetStats = db.prepare(`
  SELECT
    COUNT(DISTINCT track_id) as tracks_with_facets,
    COUNT(*) as total_assignments,
    COUNT(DISTINCT facet_id) as unique_facets,
    COUNT(DISTINCT category_id) as categories_used
  FROM track_facets
`).get();
console.log(`  Tracks with facets: ${facetStats.tracks_with_facets.toLocaleString()}`);
console.log(`  Total facet assignments: ${facetStats.total_assignments.toLocaleString()}`);
console.log(`  Unique facets used: ${facetStats.unique_facets.toLocaleString()}`);
console.log(`  Categories represented: ${facetStats.categories_used}`);

// Show facet usage by category
console.log('\nFacet Usage by Category:');
const categoryStats = db.prepare(`
  SELECT
    ft.category_name,
    COUNT(DISTINCT tf.facet_id) as unique_facets,
    COUNT(DISTINCT tf.track_id) as track_count,
    COUNT(*) as assignment_count
  FROM track_facets tf
  JOIN facet_taxonomy ft ON tf.facet_id = ft.facet_id
  WHERE ft.category_name IS NOT NULL
  GROUP BY ft.category_name
  ORDER BY track_count DESC
`).all();

for (const cat of categoryStats) {
  console.log(`  ${cat.category_name}: ${cat.track_count.toLocaleString()} tracks, ${cat.unique_facets} facets, ${cat.assignment_count.toLocaleString()} assignments`);
}

// Show library distribution
console.log('\nTop 10 Libraries:');
const libraryStats = db.prepare(`
  SELECT library_name, COUNT(*) as track_count
  FROM tracks
  WHERE library_name IS NOT NULL
  GROUP BY library_name
  ORDER BY track_count DESC
  LIMIT 10
`).all();

for (const lib of libraryStats) {
  console.log(`  ${lib.library_name}: ${lib.track_count.toLocaleString()} tracks`);
}

db.close();
console.log('\n✅ Done! Full production catalog loaded successfully.');
