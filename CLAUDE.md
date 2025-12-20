# APM Agent - Repository Documentation

**Production music search system with intelligent 3-tier routing**

**Tech Stack:** Node.js + Express + Solr + SQLite + React + Vite + Anthropic API
**Database:** 1.4M tracks indexed in Solr, 406K unique songs, SQLite for metadata
**Performance:** Route 1 <100ms | Route 2 <100ms | Route 3 <4s

---

## Project Overview

APM Agent is a production-ready music search system that combines:
- **Solr search engine** with 1.4M tracks indexed (matching APM production)
- **Song-level deduplication** via song_id grouping (406K unique songs)
- **19 facet categories** (2,120 total facets) for precise filtering
- **Natural language taxonomy parser** with hybrid local/LLM approach (~1,955 term mappings)
- **Business rules engine** enabling PM-controlled ranking without code changes
- **3-tier intelligent routing** optimizing for speed and accuracy
- **Claude API integration** for complex, conversational queries

### Repository Structure

```
apm-agent/
├── client/                      # React + Vite frontend
│   ├── src/
│   │   ├── components/          # UI components (ChatContainer, TrackCard, etc.)
│   │   ├── hooks/               # Custom hooks (useChat)
│   │   └── App.jsx              # Main application
│   └── vite.config.js
│
├── server/                      # Express backend
│   ├── config/                  # Configuration files
│   │   ├── businessRules.json   # PM-controlled ranking rules (16 rules)
│   │   ├── fieldWeights.json    # Search field weights (Solr qf/pf2)
│   │   ├── solr.json            # Solr connection settings
│   │   └── chat-system-prompt.md # LLM behavior instructions
│   │
│   ├── routes/                  # API routes
│   │   ├── chat.js              # Main chat endpoint (3-tier routing)
│   │   ├── trackMetadata.js     # Track metadata endpoints
│   │   └── taxonomy.js          # Natural language → taxonomy parsing API
│   │
│   ├── services/                # Core business logic
│   │   ├── solrService.js       # Solr search client (Route 1 & 2)
│   │   ├── metadataSearch.js    # Unified search (Solr primary, FTS5 fallback)
│   │   ├── facetSearchService.js # SQLite facet filtering (fallback only)
│   │   ├── businessRulesEngine.js # Rule matching and scoring
│   │   ├── claude.js            # Anthropic API client (Route 3)
│   │   ├── genreMapper.js       # Genre ID → name mapping
│   │   ├── metadataEnhancer.js  # Genre name mapping and duration formatting
│   │   ├── filterParser.js      # @ syntax parser
│   │   ├── taxonomySearch.js    # Facet taxonomy search
│   │   └── queryToTaxonomy.js   # Natural language → taxonomy parser (QUICK_LOOKUP)
│   │
│   ├── scripts/                 # Utility scripts
│   │   ├── indexToSolr.js       # Index tracks to Solr (1.4M docs)
│   │   └── indexComposersToSolr.js # Index composers for autocomplete
│   │
│   ├── apm_music.db             # SQLite database (NOT in git, generate locally)
│   └── index.js                 # Express server entry point
│
├── solr/                        # Solr configuration (Docker volume)
│   ├── tracks/                  # Tracks core (1.4M docs)
│   ├── composers/               # Composer autocomplete (16K docs)
│   ├── sound_alikes/            # Sound-alike search (no data yet)
│   └── terms/                   # Taxonomy terms
│
├── docker-compose.yml           # Solr container configuration
│
├── data/                        # CSV data files
│   ├── tracks.csv               # Track catalog (source of truth)
│   ├── genre_taxonomy.csv       # Genre definitions
│   ├── projects.csv             # User projects
│   └── *.csv                    # Other data files
│
├── docs/                        # Documentation
│   ├── IMPLEMENTATION_STATUS.md # Progress tracking vs presentation (UPDATE ON MILESTONES)
│   ├── NATURAL_LANGUAGE_TAXONOMY.md # Natural language parser documentation
│   └── current/                 # Current version docs
│
└── CLAUDE.md                    # This file (repository docs)
```

---

## Architecture Deep Dive

### 3-Tier Intelligent Routing

APM Agent uses query classification to route requests to the optimal processing tier:

```
                    User Query
                        ↓
            ┌───────────────────────┐
            │ Query Classification  │
            │  (server/routes/      │
            │   chat.js:25-60)      │
            └───────────────────────┘
                ↓       ↓        ↓
         Route 1    Route 2   Route 3
         @ Filters  Simple    Complex
             ↓          ↓         ↓
      metadata     metadata   claude.js
      Search.js    Search.js  +Tools
         ↓          ↓         ↓
       Solr       Solr       Anthropic
      (fq)       (edismax)    API
         ↓          ↓         ↓
         ↓      Business   Business
         ↓       Rules      Rules
         ↓          ↓         ↓
      <100ms      <100ms     <4s
    (no rules)  (+ rules)  (+ rules)
```

#### Route 1: @ Filter Queries (Fastest - Power User)
**File:** `server/services/metadataSearch.js` → `solrService.js`
**Business Rules:** ❌ Bypassed (intentional for power users who want precise control)

**Triggers:** Query contains `@category:value` syntax
**Processing:**
1. Parse filters using `filterParser.js`
2. Map facet values to IDs via `facet_taxonomy` table
3. Build Solr `fq` (filter query) with `combined_ids` field
4. Execute Solr query with song_id grouping for deduplication
5. Return unique songs (one track per song) - **no business rule modifications**

**Performance:** <100ms via Solr

**Example:**
```
User: "@mood:uplifting @instruments:piano"
→ metadataSearch.search({ facets: [...] })
→ Solr: fq=combined_ids:("Mood/2223" OR "Mood/2224") AND combined_ids:("Instruments/2798")
→ Returns 12 unique songs in 45ms (47K total matches)
```

#### Route 2: Simple Queries (Fast)
**File:** `server/services/metadataSearch.js` → `solrService.js`
**Business Rules:** ✅ Applied (PM-controlled ranking adjustments)

**Triggers:**
- 1-4 words
- Descriptive (no questions)
- No @ syntax
- No history references

**Processing:**
1. Build Solr edismax query with field weights from `fieldWeights.json`
2. Apply `qf` (query fields) and `pf2` (phrase fields) weights
3. Execute Solr search with song_id grouping for deduplication
4. Match business rules from `config/businessRules.json`
5. Apply score adjustments (boosting, interleaving)
6. Return top 12 unique songs with transparency metadata

**Performance:** <100ms average (fallback to FTS5 if Solr unavailable)

**Example:**
```
User: "upbeat rock"
→ metadataSearch.search()
→ Solr: q=upbeat rock, qf=track_title^3 mood_search^2 genre_search^4...
→ businessRulesEngine.applyRules()
→ Returns 12 unique songs in 88ms (260K total matches)
```

#### Route 3: Complex Queries (Smart)
**File:** `server/services/claude.js`
**Business Rules:** ✅ Applied to track results (PM-controlled ranking adjustments)

**Triggers:**
- Questions (What/How/Why/When/Where/Who)
- Multi-step workflows
- History/project references
- Comparative queries

**Processing:**
1. Load system prompt from `config/chat-system-prompt.md`
2. Send to Anthropic API with tool definitions
3. Claude uses tools: `read_csv`, `grep_tracks`, `get_track_by_id`, `manage_project`
4. Multi-turn conversation until complete
5. If returning track results, apply business rules from `config/businessRules.json`
6. Return structured response with transparency metadata

**Performance:** <4s average (depends on tool usage)

**Example:**
```
User: "What did I download for my Super Bowl project?"
→ claude.js → Anthropic API
→ Tool: read_csv("download_history.csv")
→ Tool: read_csv("projects.csv")
→ Tool: get_tracks_by_ids([...])
→ Returns markdown summary in 2.3s
```

### Data Flow

```
1. Client sends POST /api/chat with message
2. chat.js classifies query (lines 25-60)
3. Routes to appropriate service:
   - Route 1: metadataSearch.search() → solrService.search() with fq filters
   - Route 2: metadataSearch.search() → solrService.search() with edismax
   - Route 3: claude.chat() with tools
4. Solr returns grouped results (one track per song_id)
5. Business rules applied (Route 2 & 3 only):
   - Route 1: Bypassed (power user feature for precise control)
   - Route 2 & 3: businessRulesEngine.applyRules() adjusts rankings
6. Results formatted and returned to client with _meta transparency data
7. Client renders TrackCard components or markdown
```

### Natural Language Taxonomy Parser

Converts natural language queries like `"uptempo solo jazz piano"` into structured Solr filter queries using APM's 2,120-facet taxonomy.

**Architecture:** Hybrid local + LLM approach

```
User query: "uptempo solo jazz piano"
                ↓
    ┌─────────────────────────┐
    │  QUICK_LOOKUP (~1,955)  │ ← 95%+ queries (<5ms)
    │  N-gram matching:       │
    │  3-word → 2-word → 1    │
    └─────────────────────────┘
                ↓
    (remaining text?)
                ↓
    ┌─────────────────────────┐
    │  LLM Fallback (Claude)  │ ← Complex terms (~1-2s)
    └─────────────────────────┘
                ↓
    Structured output:
    {
      "Tempo": ["Tempo/1880"],
      "is_a": ["is_a/2204"],
      "Master Genre": ["Master Genre/1248"],
      "Instruments": ["Instruments/2962"]
    }
```

**Performance:**
| Query Type | Example | Latency |
|------------|---------|---------|
| All local | "uptempo jazz piano" | 2-5ms |
| Mostly local | "experimental fusion" | 3-8ms |
| LLM fallback | "liminal backrooms aesthetic" | 1-2s |

**Coverage:** 19 categories, ~1,955 QUICK_LOOKUP entries, 100% category coverage

**API Endpoints:**
- `POST /api/taxonomy/parse` - Hybrid parsing (local + LLM)
- `POST /api/taxonomy/parse-local` - Local only (instant)
- `POST /api/taxonomy/parse-llm` - Force LLM
- `GET /api/taxonomy/stats` - Taxonomy statistics

**Files:**
- `server/services/queryToTaxonomy.js` - Main parser with QUICK_LOOKUP
- `server/routes/taxonomy.js` - API endpoints
- `docs/NATURAL_LANGUAGE_TAXONOMY.md` - Full documentation

**See:** `docs/NATURAL_LANGUAGE_TAXONOMY.md` for complete documentation including tuning guidance and strategic comparison to AIMS Prompt Search.

---

## Database Schema & Design

### Solr Cores (Primary Search)

**Available cores:**

| Core | Documents | Purpose |
|------|-----------|---------|
| `tracks` | 1,403,568 | Main track search with song deduplication |
| `composers` | 16,784 | Composer autocomplete (predictive text) |
| `sound_alikes` | 0 | Sound-alike artist/song search (needs data) |
| `terms` | - | Taxonomy terms (from production) |

**tracks core features:**
- **song_id grouping:** 406,675 unique songs (deduplication)
- **combined_ids field:** All facet IDs in format `"Category/facet_id"` for unified filtering
- **Field weights:** Applied via `qf` and `pf2` from `fieldWeights.json`
- **Text analysis:** Synonyms for instruments, genres, places

**composers core features:**
- **predict_composer field:** EdgeNGram tokenization for autocomplete
- **Usage:** `q=predict_composer:greg` returns composers starting with "greg"

### SQLite Tables (Metadata Source)

#### tracks (1.4M rows)
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

#### track_facets (35,000+ rows)
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

#### facet_taxonomy (2,120 rows)
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

#### genre_taxonomy (91 rows)
Genre ID to human-readable name mapping.

```sql
CREATE TABLE genre_taxonomy (
  genre_id TEXT PRIMARY KEY,        -- e.g., "1103"
  genre_name TEXT NOT NULL,         -- e.g., "Classic Rock"
  parent_genre TEXT                 -- For genre hierarchy
);
```

#### tracks_fts (FTS5 virtual table)
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

### Design Decisions

**Why Solr over SQLite FTS5?**
- Production parity with APM's live system
- 1.4M tracks requires enterprise-grade search
- Field-level weighting via `qf` and `pf2` parameters
- Song-level grouping for deduplication
- Synonym expansion for instruments, genres, places
- FTS5 retained as fallback when Solr unavailable

**Why SQLite for metadata?**
- Single-file database (easy deployment)
- Source of truth for track data and facet taxonomy
- Used by indexToSolr.js to populate Solr
- Fast facet ID lookups via indexed tables

**Why combined_ids for facet filtering?**
- Unified field for all 18 facet categories
- Format: `"Category/facet_id"` (e.g., `"Mood/2223"`)
- Enables efficient `fq` queries with AND/OR logic
- Single field vs. 18 separate `*_ids` fields

---

## API Endpoints Reference

### POST /api/chat
Main search endpoint with 3-tier routing.

**Request:**
```json
{
  "messages": [
    {"role": "user", "content": "upbeat rock"}
  ]
}
```

**Response (Route 2 - Simple query):**
```json
{
  "type": "track_results",
  "message": "Found tracks matching 'upbeat rock'",
  "tracks": [
    {
      "id": "NFL_NFL_0036_01901",
      "track_title": "Gridiron Glory",
      "track_description": "Epic rock anthem...",
      "bpm": 128,
      "duration": "2:45",
      "library_name": "NFL Music",
      "composer_fullname": "John Smith",
      "album_title": "Sports Anthems Vol. 1",
      "facet_labels": "Powerful;Energetic;Electric Guitar;Drums;Sports",
      "master_genre_id": 1103,
      "genre_name": "Rock",
      "_relevance_score": 0.92
    }
    // ... 11 more tracks
  ],
  "total_count": 70,
  "showing": "1-12",
  "_meta": {
    "appliedRules": [
      {
        "ruleId": "genre_simplification_rock",
        "type": "genre_simplification",
        "description": "Auto-expand rock search to include subgenres"
      }
    ],
    "scoreAdjustments": []
  }
}
```

### GET /api/tracks/:id/metadata
Comprehensive track metadata with facets and scores.

**Response:**
```json
{
  "track": {
    "id": "NFL_NFL_0036_01901",
    "track_title": "Gridiron Glory",
    // ... all track fields
  },
  "facets": {
    "Mood": ["powerful", "energetic", "dramatic"],
    "Instruments": ["electric_guitar", "drums", "brass"],
    "Genre": ["Orchestral Rock", "Sports Anthem"],
    // ... all 13 categories
  },
  "facet_count": 35,
  "score_breakdown": {
    "track_title": 3.0,
    "combined_genre": 1.0,
    "fts_rank": 0.92
  }
}
```

### GET /api/tracks/:id/similar
Find tracks with most shared facets.

**Response:**
```json
{
  "track_id": "NFL_NFL_0036_01901",
  "similar_tracks": [
    {
      "id": "NFL_NFL_0042_02101",
      "track_title": "Victory March",
      "similarity_score": 0.85,
      "shared_facets": 28
    }
    // ... more similar tracks
  ]
}
```

### GET /api/tracks/:id/facets
Facets grouped by category.

**Response:**
```json
{
  "track_id": "NFL_NFL_0036_01901",
  "facets_by_category": {
    "Mood": [
      {"facet_id": 123, "facet_name": "powerful"},
      {"facet_id": 456, "facet_name": "energetic"}
    ],
    "Instruments": [
      {"facet_id": 789, "facet_name": "electric_guitar"}
    ]
    // ... all categories
  },
  "category_counts": {
    "Mood": 5,
    "Instruments": 4,
    "Genre": 2
    // ...
  },
  "total_facets": 35
}
```

---

## Configuration System

### businessRules.json
**File:** `server/config/businessRules.json`
**Purpose:** PM-controlled search ranking without code changes

**Structure:**
```json
[
  {
    "id": "unique_rule_id",
    "type": "genre_simplification | library_boost | recency_interleaving | feature_boost | filter_optimization",
    "enabled": true,
    "priority": 90,
    "pattern": "\\b(keyword1|keyword2)\\b",
    "description": "Human-readable description",
    "action": {
      // Type-specific action config
    }
  }
]
```

**16 Active Rules:**
- 5 Genre Simplification: rock, classical, electronic, hip hop, jazz
- 4 Library Boosting: MLB Music, NFL Music, Corporate, Cinematic
- 4 Recency Interleaving: pop, electronic, hip hop, balanced
- 1 Feature Boost: stems preference
- 2 Filter Optimization: instrumental, vocal preference

**How to modify:**
1. Edit `server/config/businessRules.json`
2. Change `boost_factor`, `pattern`, `enabled`, or add new rule
3. Restart server (rules loaded at startup)
4. Test with sample queries

**No code deployment needed!**

### fieldWeights.json
**File:** `server/config/fieldWeights.json`
**Purpose:** Solr-style field weights for relevance scoring

**Format:**
```json
{
  "qf": "track_title^3.0 combined_genre^4.0 composer^0.8 album_title^0.6 track_description^0.15",
  "pf2": "track_title^2.0 combined_genre^2.0"
}
```

**Field Weights:**
- `track_title`: 3.0 (highest priority for exact matches)
- `combined_genre`: 4.0 (genre matches ranked very high)
- `composer`: 0.8 (medium-high)
- `album_title`: 0.6 (medium)
- `track_description`: 0.15 (low - catch-all)

**How to modify:**
1. Edit `server/config/fieldWeights.json`
2. Adjust weights (higher = more important)
3. Restart server
4. Test relevance with sample queries

### chat-system-prompt.md
**File:** `server/config/chat-system-prompt.md`
**Purpose:** LLM behavior instructions for Route 3 queries

**Loaded by:** `server/services/claude.js:loadSystemPrompt()`
**Used in:** Anthropic API calls for complex queries

**How to modify:**
1. Edit `server/config/chat-system-prompt.md`
2. Update instructions, examples, or tool guidance
3. Restart server
4. Test with complex queries

---

## Services Architecture

### solrService.js
**Purpose:** Solr search client (Route 1 & 2)

**Key Functions:**
- `search(options)` - Execute Solr edismax query
- `buildQf()` - Build query fields from fieldWeights.json
- `buildPf2()` - Build phrase fields from fieldWeights.json
- `buildFacetFilters(facetsByCategory)` - Build fq for combined_ids
- `buildSort(mode)` - Build sort clause (featured, explore, rdate, etc.)
- `mapResponse(solrData)` - Convert grouped response to app format

**Key Features:**
- Song deduplication via `group.field=song_id`
- Field weight mapping: config names → `*_search` fields
- Facet filtering: `combined_ids:("Category/id")`

### metadataSearch.js
**Purpose:** Unified search routing (Solr primary, FTS5 fallback)

**Key Functions:**
- `search(options)` - Main search entry point
- `searchWithSolr(options)` - Route to Solr
- `searchWithFTS5(options)` - Fallback to SQLite FTS5
- `getFacetIds(category, value)` - Map facet values to `"Category/id"` format

**Uses:**
- `solrService.js` for Solr queries
- `facet_taxonomy` table for facet ID lookups
- Falls back to FTS5 when `SEARCH_ENGINE=fts5` or Solr unavailable

### businessRulesEngine.js
**Purpose:** Pattern matching and score adjustment (Route 2)

**Key Functions:**
- `applyRules(query, results, allRules)` - Main rule application
- `matchRules(query, rules)` - Find rules matching query pattern
- `adjustScores(results, rule)` - Apply score boosts/adjustments
- `interleaveResults(results, pattern)` - Reorder by recency pattern

**Rule Types:**
- Genre Simplification: Expand genres to subgenres
- Library Boosting: Multiply scores for specific libraries
- Recency Interleaving: Mix recent/vintage by pattern
- Feature Boost: Boost tracks with features (stems, etc.)
- Filter Optimization: Auto-apply filters

### claude.js
**Purpose:** Anthropic API integration (Route 3)

**Key Functions:**
- `chat(messages, conversationHistory)` - Main chat entry point
- `loadSystemPrompt()` - Load chat-system-prompt.md
- `getClient()` - Lazy-initialize Anthropic client
- `getModel()` - Get model from env (default: Haiku)

**Tool Definitions:**
- `read_csv` - Read CSV files (projects, history, etc.)
- `grep_tracks` - Search tracks by field
- `get_track_by_id` - Single track details
- `get_tracks_by_ids` - Multiple track details
- `manage_project` - Project management

**Model Selection:**
- Default: `claude-3-haiku-20240307` (fast, cheap)
- Override: Set `CLAUDE_MODEL` env var
- Options: `claude-3-sonnet-20240229`, `claude-3-opus-20240229`

### facetSearchService.js
**Purpose:** SQLite facet filtering (fallback only)

**Note:** This service is now only used as a fallback when Solr is unavailable.
Primary facet filtering goes through `metadataSearch.js` → `solrService.js`.

**Key Functions:**
- `searchByFacetCategory(category, value)` - Search by single facet category
- `searchByFacets(facets)` - Intersect multiple facet filters (AND logic)

### genreMapper.js
**Purpose:** Map numeric genre IDs to human-readable names

**Key Functions:**
- `mapGenreIds(tracks)` - Map genre IDs for all tracks
- `getGenreName(genreId)` - Single genre ID lookup
- `loadGenreTaxonomy()` - Load genre_taxonomy.csv

**Example:**
```javascript
// Input: genre_id = "1103"
// Output: "Classic Rock"
```

### queryToTaxonomy.js
**Purpose:** Natural language → taxonomy parser with hybrid local/LLM approach

**Key Functions:**
- `parseQuery(query, options)` - Main entry point (local first, LLM fallback)
- `parseQueryLocal(query)` - Local-only parsing using QUICK_LOOKUP
- `parseQueryToTaxonomy(query)` - LLM-only parsing
- `buildSolrFilters(result)` - Convert parsed result to Solr fq queries
- `getTaxonomyStats()` - Return category coverage statistics

**Key Data:**
- `QUICK_LOOKUP` - ~1,955 entries mapping terms to facet IDs
- N-gram matching: 3-word → 2-word → single word phrases

**Example:**
```javascript
// Input: "uptempo solo jazz piano"
// Output: {
//   filters: { Tempo: ["Tempo/1880"], is_a: ["is_a/2204"], ... },
//   solrFilters: ["combined_ids:(\"Tempo/1880\")", ...],
//   source: "local",
//   latencyMs: 3
// }
```

**Documentation:** See `docs/NATURAL_LANGUAGE_TAXONOMY.md` for full details.

---

## Development Guides

### Adding a New Business Rule

1. **Edit businessRules.json:**
```json
{
  "id": "library_boost_holiday_music",
  "type": "library_boost",
  "enabled": true,
  "priority": 85,
  "pattern": "\\b(holiday|christmas|winter)\\b",
  "description": "Boost holiday music library for seasonal queries",
  "action": {
    "boost_libraries": [
      {
        "library_name": "Holiday Music",
        "boost_factor": 2.0
      }
    ]
  }
}
```

2. **Restart server:**
```bash
npm run dev
```

3. **Test:**
```bash
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "christmas music"}]}'
```

4. **Verify in logs:**
```
Matched 1 rules for query "christmas music": library_boost_holiday_music
```

### Modifying Search Field Weights

1. **Edit fieldWeights.json:**
```json
{
  "qf": "track_title^5.0 combined_genre^4.0 ...",
  "pf2": "track_title^3.0 combined_genre^2.0"
}
```

2. **Restart server**

3. **Test relevance:**
```bash
# Should rank exact title matches higher
curl ... -d '{"messages": [{"role": "user", "content": "Epic Cinematic"}]}'
```

### Adding a New Facet Category

**Database changes:**
1. Add facets to `facet_taxonomy` table:
```sql
INSERT INTO facet_taxonomy (facet_id, category_name, facet_name)
VALUES (2121, 'Mood Types', 'contemplative');
```

2. Add track-to-facet mappings to `track_facets`:
```sql
INSERT INTO track_facets (track_id, facet_id)
VALUES ('NFL_NFL_0036_01901', 2121);
```

**Code changes:**
1. Update `filterParser.js` to recognize new category syntax:
```javascript
const FACET_CATEGORIES = [
  'mood', 'instruments', ..., 'mood-types'  // Add new category
];
```

2. Update chat-system-prompt.md with new category documentation

3. Restart and test

### Adding a New API Endpoint

1. **Create route file:**
```javascript
// server/routes/trackAnalytics.js
import express from 'express';
const router = express.Router();

router.get('/tracks/:id/analytics', async (req, res) => {
  try {
    const { id } = req.params;
    // Fetch analytics...
    res.json({ track_id: id, analytics: {...} });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
```

2. **Register in server/index.js:**
```javascript
import trackAnalyticsRoutes from './routes/trackAnalytics.js';
app.use('/api', trackAnalyticsRoutes);
```

3. **Test:**
```bash
curl http://localhost:3001/api/tracks/NFL_NFL_0036_01901/analytics
```

---

## Testing Strategy

### Current Test Coverage
**Status:** Minimal (needs expansion)

### Manual Testing

**Route 1 (@ filters):**
```bash
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "@mood:uplifting @instruments:piano"}]}'
```
**Expected:** <100ms, 12 unique songs, 47K+ total matches

**Route 2 (simple queries):**
```bash
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "upbeat rock"}]}'
```
**Expected:** <100ms, 12 unique songs, business rules applied

**Route 3 (complex queries):**
```bash
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "What did I download last week?"}]}'
```
**Expected:** <4s, uses tools, markdown response

### Performance Benchmarks

**Maintain these targets (Solr):**
- Route 1: <100ms (average: 50ms)
- Route 2: <100ms (average: 90ms)
- Route 3: <4s (average: 2.3s)

**How to test:**
```bash
time curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "upbeat rock"}]}'
```

---

## Performance Metrics & Optimization

### Current Benchmarks

| Operation | Target | Actual | Status |
|-----------|--------|--------|--------|
| @ filter queries | <100ms | ~45ms | ✅ 2x better |
| Simple queries | <2s | ~24ms | ✅ 100x better |
| Complex queries | <4s | ~2.3s | ✅ 2x better |

### Database Optimization

**Indexes (already created):**
```sql
CREATE INDEX idx_tracks_library ON tracks(library_name);
CREATE INDEX idx_tracks_song_id ON tracks(song_id);
CREATE INDEX idx_tracks_master_genre ON tracks(master_genre_id);
CREATE INDEX idx_track_facets_facet ON track_facets(facet_id);
CREATE INDEX idx_track_facets_track ON track_facets(track_id);
CREATE INDEX idx_facet_category ON facet_taxonomy(category_name);
CREATE INDEX idx_facet_name ON facet_taxonomy(facet_name);
```

**When to add more indexes:**
- Frequent filtering by new fields → Create index
- Slow queries in logs → EXPLAIN QUERY PLAN
- Example: If filtering by `bpm` frequently, add `CREATE INDEX idx_tracks_bpm ON tracks(bpm)`

**When NOT to index:**
- Low cardinality fields
- Fields rarely queried
- Text fields (use FTS5 instead)

### FTS5 Optimization

**Current strategy:**
- Index 5 fields: title, description, album, composer, genre
- Exclude `id` from indexing (UNINDEXED)
- Rebuild index: `INSERT INTO tracks_fts(tracks_fts) VALUES('rebuild');`

**Maintenance:**
```sql
-- Check FTS5 stats
SELECT * FROM tracks_fts WHERE tracks_fts MATCH 'rank';

-- Optimize FTS5 index
INSERT INTO tracks_fts(tracks_fts) VALUES('optimize');
```

### Query Performance Monitoring

**Add timing logs:**
```javascript
const start = Date.now();
const results = await metadataSearch.search(query);
const duration = Date.now() - start;
console.log(`Search completed in ${duration}ms`);
```

**Track in production:**
- Average query time per route
- p95, p99 latency
- Slow query log (>1s for Route 2)

---

## Error Handling Patterns

### Graceful Degradation

**FTS5 Search Fails:**
```javascript
try {
  results = await db.all(`SELECT * FROM tracks_fts WHERE tracks_fts MATCH ?`, [query]);
} catch (error) {
  console.error('FTS5 search failed, falling back to LIKE:', error);
  results = await db.all(
    `SELECT * FROM tracks WHERE track_title LIKE ? OR track_description LIKE ?`,
    [`%${query}%`, `%${query}%`]
  );
}
```

**Business Rules Error:**
```javascript
try {
  appliedRules = await businessRulesEngine.applyRules(query, results, allRules);
} catch (error) {
  console.error('Business rule error, skipping rule:', error);
  // Continue with unadjusted results
}
```

**Database Connection Error:**
```javascript
try {
  const db = await openDatabase();
} catch (error) {
  console.error('Database connection failed:', error);
  res.status(500).json({
    error: 'Database unavailable',
    details: process.env.NODE_ENV === 'development' ? error.message : 'Internal error'
  });
  return;
}
```

### Logging Patterns

**Development:**
```javascript
console.log(`Detected simple query, using metadata search + business rules`);
console.log(`Matched ${matchedRules.length} rules for query "${query}"`);
console.log(`Metadata search returned ${results.length} tracks (total: ${totalCount})`);
```

**Production (future):**
```javascript
logger.info('query_processed', {
  route: 'Route 2',
  query_length: query.length,
  results_count: results.length,
  duration_ms: duration,
  rules_applied: matchedRules.map(r => r.id)
});
```

---

## Deployment & Operations

### Environment Setup

**Required:**
- Node.js v18+ (for native ESM support)
- Docker Desktop (for Solr)
- npm or yarn

**Environment Variables:**
```bash
# .env
ANTHROPIC_API_KEY=sk-ant-...          # Required for Route 3
CLAUDE_MODEL=claude-3-haiku-20240307  # Optional (default: Haiku)
PORT=3001                              # Optional (default: 3001)
NODE_ENV=development                   # development | production
SEARCH_ENGINE=solr                     # Optional: 'solr' (default) or 'fts5'
```

### Solr Setup

**Start Solr:**
```bash
docker compose up -d        # Start Solr container
# Wait for Solr to be ready at http://localhost:8983
```

**Index tracks to Solr:**
```bash
node server/scripts/indexToSolr.js --delete-first
# Indexes 1.4M tracks in ~10 minutes
```

**Index composers for autocomplete:**
```bash
node server/scripts/indexComposersToSolr.js --delete-first
# Indexes 16,784 unique composers in ~1 second
```

**Verify Solr:**
```bash
curl "http://localhost:8983/solr/tracks/select?q=*:*&rows=0"
# Should show numFound: 1403568

curl "http://localhost:8983/solr/composers/select?q=*:*&rows=0"
# Should show numFound: 16784
```

### SQLite Database

**Location:** `server/apm_music.db` (1.4M tracks, metadata source for Solr)

**Note:** The database file is NOT tracked in git (7GB file exceeds GitHub's 100MB limit).
New developers must generate it locally using the scripts below.

**To generate the database:**
```bash
cd server

# 1. Load the full track catalog from CSV
node scripts/loadFullCatalog.js

# 2. Load facet taxonomy (for filtering)
node scripts/loadFacetTaxonomy.js

# 3. Load track-facet mappings
node scripts/loadTrackFacets.js

# 4. Enable FTS5 full-text search (optional, for fallback when Solr unavailable)
node scripts/enableFTS5.js
```

**Tables used:**
- `tracks` - Source data for Solr indexing
- `facet_taxonomy` - Facet ID lookups for search queries

### Server Startup

**Development:**
```bash
docker compose up -d   # Start Solr first
npm run dev            # Starts both server and client with hot reload
npm run dev:server     # Server only
npm run dev:client     # Client only
```

**Production:**
```bash
npm run build          # Build client
npm start              # Start server (serves built client)
```

### Health Checks

**Endpoint:** `GET /api/health` (future)

**Response:**
```json
{
  "status": "healthy",
  "solr": "connected",
  "solr_docs": 1403568,
  "solr_songs": 406675,
  "sqlite": "connected",
  "anthropic_api": "configured"
}
```

### Configuration Updates

**After editing config files:**
1. Edit `server/config/businessRules.json` or `fieldWeights.json`
2. Restart server: `npm run dev:server`
3. Test changes with sample queries
4. Monitor logs for errors

**No code deployment needed for config changes!**

---

## Repository Etiquette

**Branching:**
- ALWAYS create a feature branch before starting major changes
- NEVER commit directly to `main`
- Branch naming: `feature/description` or `fix/description`

**Git workflow for major changes:**
1. Create a new branch: `git checkout -b feature/your-feature-name`
2. Develop and commit on the feature branch
3. Test locally before pushing:
   - `docker compose up -d` - start Solr container
   - `npm run dev` - start dev server at localhost:3001 (server) and localhost:5173 (client)
   - Test all 3 routes with curl commands (see Testing After Changes)
4. Push the branch: `git push -u origin feature/your-feature-name`
5. Create a PR to merge into `main`

**Commits:**
- Write clear commit messages describing the change
- Keep commits focused on single changes
- Reference issue numbers if applicable

**Pull Requests:**
- Create PRs for all changes to `main`
- NEVER force push to `main`
- Include description of what changed and why
- Test all 3 routing tiers before requesting review

**Before pushing:**
1. Test Route 1 (@ filters): `curl -X POST http://localhost:3001/api/chat -H "Content-Type: application/json" -d '{"messages": [{"role": "user", "content": "@mood:uplifting"}]}'`
2. Test Route 2 (simple query): `curl -X POST http://localhost:3001/api/chat -H "Content-Type: application/json" -d '{"messages": [{"role": "user", "content": "upbeat rock"}]}'`
3. Test Route 3 (complex query): `curl -X POST http://localhost:3001/api/chat -H "Content-Type: application/json" -d '{"messages": [{"role": "user", "content": "What tracks are in my project?"}]}'`
4. Verify performance targets: Route 1 <100ms, Route 2 <100ms, Route 3 <4s
5. Ensure Solr is running: `curl "http://localhost:8983/solr/tracks/admin/ping"`

---

## Claude Code Instructions

When working on this codebase:

### General Guidelines
1. **Follow existing patterns** - Check services/ for similar code before creating new patterns
2. **Prefer editing over creating** - Edit existing files rather than creating new ones
3. **Update configs before code** - Modify businessRules.json or fieldWeights.json before changing code
4. **Test all 3 routes** - Changes may affect routing logic, test each tier
5. **Maintain performance** - Keep Route 1 <100ms, Route 2 <100ms, Route 3 <4s

### Implementation Status Tracking
**IMPORTANT:** When completing any milestone from `docs/IMPLEMENTATION_STATUS.md`, you MUST update that file:

1. **After implementing a feature:**
   - Change the status from `NOT IMPLEMENTED` or `PARTIAL` to `COMPLETE`
   - Update any relevant metrics or descriptions
   - Add an entry to the Changelog section at the bottom

2. **Milestones to track:**
   - Search backend integrations (AIMS, Audio Similarity, PSE)
   - Context layer components (Auth, Session, Preferences, Memory)
   - Infrastructure (Caching, Analytics, Rate Limiting)
   - Agent features (Disambiguation, Proactive Suggestions)

3. **Example changelog entry:**
   ```markdown
   | 2025-12-19 | Implemented user authentication with JWT |
   ```

4. **Keep the Executive Summary table updated** - Recalculate totals when statuses change

This ensures stakeholders can track progress against the December 16, 2025 presentation.

### Adding Features
1. **Check configuration first** - Can this be solved with businessRules.json?
2. **Use existing services** - Extend metadataSearch.js or businessRulesEngine.js
3. **Follow service layer** - Business logic in services/, routes/ just handle HTTP
4. **Update system prompt** - If adding tools or changing behavior, update chat-system-prompt.md
5. **Update implementation status** - Mark completed milestones in `docs/IMPLEMENTATION_STATUS.md`

### Modifying Search Behavior
1. **Field weights** - Edit fieldWeights.json (Solr qf/pf2 format, no code changes)
2. **Business rules** - Edit businessRules.json (no code changes)
3. **Query routing** - Edit server/routes/chat.js (lines 25-60)
4. **Solr queries** - Edit server/services/solrService.js
5. **FTS5 fallback** - Edit server/services/metadataSearch.js (used when Solr unavailable)

### Search Engine Changes
1. **Solr schema changes** - Update solr/tracks/conf/managed-schema, restart Solr
2. **Reindex tracks** - Run `node server/scripts/indexToSolr.js --delete-first`
3. **Reindex composers** - Run `node server/scripts/indexComposersToSolr.js --delete-first`
4. **SQLite schema** - Update CREATE TABLE and rebuild database (source for Solr)

### Testing After Changes
```bash
# Route 1: @ filters
curl -X POST http://localhost:3001/api/chat -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "@mood:uplifting"}]}'

# Route 2: Simple query
curl -X POST http://localhost:3001/api/chat -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "upbeat rock"}]}'

# Route 3: Complex query
curl -X POST http://localhost:3001/api/chat -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "What tracks are in my project?"}]}'
```

---

## Quick Reference

**Key Files:**
- Routing: `server/routes/chat.js`
- Route 1: `server/services/facetSearchService.js`
- Route 2: `server/services/metadataSearch.js` + `businessRulesEngine.js`
- Route 3: `server/services/claude.js`
- Taxonomy Parser: `server/services/queryToTaxonomy.js` (~1,955 QUICK_LOOKUP entries)
- Config: `server/config/` (businessRules.json, fieldWeights.json, chat-system-prompt.md)
- Database: `server/apm_music.db`

**Performance Targets:**
- Route 1: <100ms | Route 2: <2s | Route 3: <4s

**PM-Controlled Config:**
- Business rules: `server/config/businessRules.json` (16 rules)
- Field weights: `server/config/fieldWeights.json` (Solr format)

**Common Commands:**
```bash
# Solr (must be running for search)
docker compose up -d                              # Start Solr container
docker compose down                               # Stop Solr container
docker compose logs -f solr                       # View Solr logs

# Solr indexing (run from project root)
node server/scripts/indexToSolr.js --delete-first       # Index 1.4M tracks (~10 min)
node server/scripts/indexComposersToSolr.js --delete-first  # Index 16K composers (~1 sec)

# Solr verification
curl "http://localhost:8983/solr/tracks/select?q=*:*&rows=0"     # Count: 1,403,568
curl "http://localhost:8983/solr/composers/select?q=*:*&rows=0"  # Count: 16,784
curl "http://localhost:8983/solr/tracks/admin/ping"              # Health check

# Development
npm run dev           # Start both server (3001) and client (5173) with hot reload
npm run dev:server    # Start server only
npm run dev:client    # Start client only

# Production
npm run build         # Build client for production
npm start             # Start production server

# Testing endpoints
curl -X POST http://localhost:3001/api/chat -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "upbeat rock"}]}'

# SQLite queries (metadata source, run from /server)
sqlite3 apm_music.db "SELECT COUNT(*) FROM tracks;"           # Count tracks (1.4M)
sqlite3 apm_music.db "SELECT * FROM facet_taxonomy LIMIT 10;" # View facets

# Taxonomy parser testing
curl -X POST http://localhost:3001/api/taxonomy/parse \
  -H "Content-Type: application/json" \
  -d '{"query": "uptempo jazz piano"}'                        # Hybrid (local + LLM)
curl -X POST http://localhost:3001/api/taxonomy/parse-local \
  -H "Content-Type: application/json" \
  -d '{"query": "uptempo jazz piano"}'                        # Local only (<5ms)
curl http://localhost:3001/api/taxonomy/stats                  # Coverage stats

# Environment
export CLAUDE_MODEL=claude-3-haiku-20240307    # Set Claude model (default)
export CLAUDE_MODEL=claude-sonnet-4-20250514   # Use Sonnet for better quality
export SEARCH_ENGINE=fts5                       # Force FTS5 fallback (skip Solr)
```

---

**Last Updated:** December 18, 2025
**Status:** Production-ready
**Version:** 2.0
