# Plan: Set Up Local Solr Instance Matching Production

## Overview

Set up a local Solr instance via Docker using APM's production configuration, then integrate it with the apm-agent search API. This replaces the current SQLite FTS5 search with production-equivalent Solr search.

## Source Configuration

**Location:** `/Users/echowreck/Downloads/cores/`

**Available cores:**
- `tracks` - Main track search (primary focus)
- `composers` - Composer search
- `terms` - Taxonomy terms
- `sound_alikes` - Sound similarity

**Key schema features (`tracks` core):**
- `combined_ids` field - Aggregates ALL facet IDs for unified filtering
- Custom field types: `apm_text_flat_en`, `apm_text_flat_en_stopwords`
- `*_search` fields for text search (track_title_search, mood_search, etc.)
- `*_ids` fields for facet filtering (genre_ids, mood_ids, etc.)
- Synonyms for instruments, places, genres, explicit content

---

## Phase 0: Prerequisites

### Install Docker Desktop

**macOS:**
1. Download from https://www.docker.com/products/docker-desktop/
2. Install and launch Docker Desktop
3. Verify: `docker --version` and `docker compose version`

---

## Phase 1: Docker Infrastructure

### 1.1 Create Docker Setup

**New files:**
```
docker-compose.yml
solr/
├── tracks/
│   ├── conf/           # Copy from /Users/echowreck/Downloads/cores/tracks/conf
│   └── core.properties
└── terms/
    └── conf/           # Copy from /Users/echowreck/Downloads/cores/terms/conf
```

**docker-compose.yml:**
```yaml
version: '3.8'
services:
  solr:
    image: solr:8.11
    container_name: apm-solr
    ports:
      - "8983:8983"
    volumes:
      - ./solr:/var/solr/data
    environment:
      - SOLR_HEAP=1g
```

### 1.2 Copy Production Config

```bash
# Copy tracks core config
cp -r /Users/echowreck/Downloads/cores/tracks solr/

# Copy terms core (for taxonomy lookups)
cp -r /Users/echowreck/Downloads/cores/terms solr/
```

---

## Phase 2: Data Indexing

### 2.1 Create Indexing Script

**New file:** `server/scripts/indexToSolr.js`

Maps SQLite track data to Solr document format:

| SQLite Column | Solr Field |
|---------------|------------|
| `id` | `id` |
| `track_title` | `track_title`, `track_title_search` |
| `track_description` | `track_description`, `track_description_search` |
| `facet_ids` | Individual `*_ids` fields + `combined_ids` |
| `facet_labels` | Individual facet name fields (mood, genre, etc.) |
| `bpm` | `bpm` |
| `duration` | `duration` |
| `apm_release_date` | `apm_release_date` |
| `library_name` | `library_name`, `library_search` |
| `album_title` | `album_title`, `album_title_search` |

**Key transformation:** Parse `facet_ids` (semicolon-separated) and map to category-specific `*_ids` fields using facet_taxonomy table.

### 2.2 Facet ID Mapping

Need to map each facet_id to its category to populate:
- `genre_ids`, `mood_ids`, `instruments_ids`, etc.
- These all copy to `combined_ids` for unified filtering

---

## Phase 3: Solr Service Integration

### 3.1 Create Solr Client

**New file:** `server/services/solrService.js`

```javascript
// Core functions:
- search(query, options) - Execute edismax query
- buildQuery(text, facets, filters) - Build Solr query params
- mapResponse(solrDocs) - Convert Solr docs to app format
```

**Query parameters (matching production):**
- `defType: edismax`
- `q.op: AND`
- `mm: 100%`
- `qf`: Field weights from fieldWeights.json
- `pf2`: Phrase weights
- `fq`: Facet filters using `combined_ids:(full_id ...)`
- `group: true`, `group.field: song_number`
- `sort`: featured/explore/rdate/etc.

### 3.2 Update metadataSearch.js

**Modify:** `server/services/metadataSearch.js`

Replace `searchByText()` FTS5 implementation:

```javascript
// Before (FTS5):
const query = `SELECT ... FROM tracks_fts WHERE tracks_fts MATCH ?`;

// After (Solr):
const results = await solrService.search(text, { qf, pf2, fq, sort });
```

### 3.3 Files to Create/Modify

| File | Action |
|------|--------|
| `server/services/solrService.js` | Create - Solr client |
| `server/scripts/indexToSolr.js` | Create - Data indexer |
| `server/config/solr.json` | Create - Connection config |
| `server/services/metadataSearch.js` | Modify - Use Solr |
| `server/config/fieldWeights.json` | Modify - Add facet_labels weight |

---

## Phase 4: Leverage facet_labels

### 4.1 Add facet_labels to Solr Schema

In `solr/tracks/conf/schema.xml`, add:

```xml
<field name="facet_labels" type="apm_text_flat_en" indexed="true" stored="true" />
<field name="facet_labels_search" type="apm_text_flat_en" indexed="true" stored="false" />
<copyField source="facet_labels" dest="facet_labels_search" />
```

### 4.2 Update Field Weights

Add to `server/config/fieldWeights.json`:

```json
{
  "qf": {
    "facet_labels_search": 2.0,
    ...
  }
}
```

This enables searches like "uplifting piano" to match tracks with those facet labels.

---

## Implementation Steps

1. [ ] Create Docker Compose configuration
2. [ ] Copy Solr configs from Downloads to project
3. [ ] Add `facet_labels` field to schema.xml
4. [ ] Start Solr container, create cores
5. [ ] Create `solrService.js` client
6. [ ] Create `indexToSolr.js` indexing script
7. [ ] Index all 1.4M tracks to Solr
8. [ ] Update `metadataSearch.js` to use Solr
9. [ ] Test search queries
10. [ ] Update fieldWeights.json with facet_labels

---

## Solr Schema Key Fields Reference

**Track metadata:**
- `id`, `track_title`, `track_description`, `bpm`, `duration`
- `apm_release_date`, `original_recording_date`
- `album_title`, `album_code`, `library_name`

**Facet fields (indexed for filtering):**
- `genre`, `additional_genre`, `combined_genre`
- `mood`, `movement`, `character`, `musical_form`
- `music_for`, `instruments`, `vocals`
- `sound_effects`, `country_and_region`, `time_period`
- `lyric_subject`, `is_a`, `track_type`, `tempo`, `key`, `language`

**Facet ID fields (for combined_ids filtering):**
- `genre_ids`, `mood_ids`, `instruments_ids`, etc.
- All copy to `combined_ids` for unified fq filtering

**Search fields (text-analyzed):**
- `track_title_search`, `track_description_search`
- `mood_search`, `instruments_search`, etc.

---

## Environment Configuration

**New:** `server/config/solr.json`
```json
{
  "host": "localhost",
  "port": 8983,
  "core": "tracks",
  "protocol": "http"
}
```

**Toggle:** Add `SEARCH_ENGINE` env var for fallback:
```
SEARCH_ENGINE=solr  # or 'fts5' for SQLite fallback
```

---

## Testing Plan

1. **Verify Solr startup:** `curl http://localhost:8983/solr/tracks/admin/ping`
2. **Test indexing:** Index 100 tracks, verify in Solr admin UI
3. **Test text search:** `q=upbeat rock&qf=track_title_search^3 mood_search^2`
4. **Test facet filter:** `fq=combined_ids:(1234)` (mood ID)
5. **Test combined:** Text + facets + sort
6. **Compare results:** FTS5 vs Solr for same queries
