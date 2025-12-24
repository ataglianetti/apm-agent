# Database Schema & Design

This document details the database architecture for APM Agent, including Solr cores and SQLite tables.

## Solr Cores (Primary Search)

### Available Cores

| Core           | Documents | Purpose                                     |
| -------------- | --------- | ------------------------------------------- |
| `tracks`       | 1,403,568 | Main track search with song deduplication   |
| `composers`    | 16,784    | Composer autocomplete (predictive text)     |
| `sound_alikes` | 0         | Sound-alike artist/song search (needs data) |
| `terms`        | -         | Taxonomy terms (from production)            |

### tracks Core Features

- **song_id grouping:** 406,675 unique songs (deduplication)
- **combined_ids field:** All facet IDs in format `"Category/facet_id"` for unified filtering
- **Field weights:** Applied via `qf` and `pf2` from `fieldWeights.json`
- **Text analysis:** Synonyms for instruments, genres, places

### composers Core Features

- **predict_composer field:** EdgeNGram tokenization for autocomplete
- **Usage:** `q=predict_composer:greg` returns composers starting with "greg"

---

## SQLite Tables (Metadata Source)

### tracks (1.4M rows)

Primary catalog table with track metadata.

```sql
CREATE TABLE tracks (
  id TEXT PRIMARY KEY,              -- e.g., "NFL_NFL_0036_01901"
  parent_aktrack TEXT,              -- Parent track ID for alternates
  track_title TEXT NOT NULL,
  track_number TEXT,
  track_index INTEGER,
  track_description TEXT,
  duration INTEGER,                 -- Duration in seconds
  bpm INTEGER,
  internal_release_date TEXT,
  apm_release_date TEXT,
  recording_date TEXT,

  -- Facet data (real metadata from APM)
  facet_ids TEXT,                   -- Semicolon-separated facet IDs: "1011;1034;1224..."
  facet_labels TEXT,                -- Semicolon-separated labels: "Accelerating;Alarms & Sirens..."

  -- Genre IDs (reference genre_taxonomy)
  master_genre_id INTEGER,
  additional_genre_ids TEXT,        -- Semicolon-separated genre IDs

  -- Language and artist info
  language_iso TEXT,
  artists TEXT,
  isrc_main TEXT,
  isrc_all TEXT,

  -- Song-level grouping (for deduplication)
  song_id TEXT,
  song_title TEXT,
  song_composers TEXT,
  song_lyricists TEXT,
  song_arrangers TEXT,

  -- Album info
  album_id TEXT,
  album_title TEXT,
  album_description TEXT,
  album_release_date TEXT,
  album_artists TEXT,

  -- Library info
  library_id TEXT,
  library_name TEXT,

  -- Composer details
  composer_lastname TEXT,
  composer_firstname TEXT,
  composer_fullname TEXT,
  composer_affiliation TEXT,
  composer_cae_number TEXT
);

CREATE INDEX idx_tracks_library ON tracks(library_name);
CREATE INDEX idx_tracks_song_id ON tracks(song_id);
CREATE INDEX idx_tracks_master_genre ON tracks(master_genre_id);
```

### track_facets (35,000+ rows)

Many-to-many relationship between tracks and facets.

```sql
CREATE TABLE track_facets (
  track_id TEXT NOT NULL,
  facet_id INTEGER NOT NULL,
  PRIMARY KEY (track_id, facet_id),
  FOREIGN KEY (track_id) REFERENCES tracks(id),
  FOREIGN KEY (facet_id) REFERENCES facet_taxonomy(facet_id)
);

CREATE INDEX idx_track_facets_facet ON track_facets(facet_id);
CREATE INDEX idx_track_facets_track ON track_facets(track_id);
```

### facet_taxonomy (2,120 rows)

Facet definitions across 18 categories.

```sql
CREATE TABLE facet_taxonomy (
  facet_id INTEGER PRIMARY KEY,
  category_name TEXT NOT NULL,      -- e.g., "Mood", "Instruments"
  facet_name TEXT NOT NULL,         -- e.g., "uplifting", "piano"
  parent_id INTEGER                 -- For hierarchical facets
);

CREATE INDEX idx_facet_category ON facet_taxonomy(category_name);
CREATE INDEX idx_facet_name ON facet_taxonomy(facet_name);
```

### genre_taxonomy (91 rows)

Genre ID to human-readable name mapping.

```sql
CREATE TABLE genre_taxonomy (
  genre_id TEXT PRIMARY KEY,        -- e.g., "1103"
  genre_name TEXT NOT NULL,         -- e.g., "Classic Rock"
  parent_genre TEXT                 -- For genre hierarchy
);
```

### tracks_fts (FTS5 virtual table)

Full-text search index for fast text queries (fallback when Solr unavailable).

```sql
CREATE VIRTUAL TABLE tracks_fts USING fts5(
  id UNINDEXED,
  track_title,
  track_description,
  album_title,
  composer_fullname,
  facet_labels,
  content=tracks
);
```

---

## Design Decisions

### Why Solr over SQLite FTS5?

- Production parity with APM's live system
- 1.4M tracks requires enterprise-grade search
- Field-level weighting via `qf` and `pf2` parameters
- Song-level grouping for deduplication
- Synonym expansion for instruments, genres, places
- FTS5 retained as fallback when Solr unavailable

### Why SQLite for metadata?

- Single-file database (easy deployment)
- Source of truth for track data and facet taxonomy
- Used by indexToSolr.js to populate Solr
- Fast facet ID lookups via indexed tables

### Why combined_ids for facet filtering?

- Unified field for all 18 facet categories
- Format: `"Category/facet_id"` (e.g., `"Mood/2223"`)
- Enables efficient `fq` queries with AND/OR logic
- Single field vs. 18 separate `*_ids` fields

---

## Database Optimization

### Existing Indexes

```sql
CREATE INDEX idx_tracks_library ON tracks(library_name);
CREATE INDEX idx_tracks_song_id ON tracks(song_id);
CREATE INDEX idx_tracks_master_genre ON tracks(master_genre_id);
CREATE INDEX idx_track_facets_facet ON track_facets(facet_id);
CREATE INDEX idx_track_facets_track ON track_facets(track_id);
CREATE INDEX idx_facet_category ON facet_taxonomy(category_name);
CREATE INDEX idx_facet_name ON facet_taxonomy(facet_name);
```

### When to Add More Indexes

- Frequent filtering by new fields: Create index
- Slow queries in logs: EXPLAIN QUERY PLAN
- Example: If filtering by `bpm` frequently, add `CREATE INDEX idx_tracks_bpm ON tracks(bpm)`

### When NOT to Index

- Low cardinality fields
- Fields rarely queried
- Text fields (use FTS5 instead)

### FTS5 Maintenance

```sql
-- Check FTS5 stats
SELECT * FROM tracks_fts WHERE tracks_fts MATCH 'rank';

-- Optimize FTS5 index
INSERT INTO tracks_fts(tracks_fts) VALUES('optimize');

-- Rebuild index
INSERT INTO tracks_fts(tracks_fts) VALUES('rebuild');
```
