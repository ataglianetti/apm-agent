# Services Architecture

This document details the service layer implementation in APM Agent.

## Service Overview

| Service                  | Purpose                           | Route |
| ------------------------ | --------------------------------- | ----- |
| `solrService.js`         | Solr search client                | 1, 2  |
| `metadataSearch.js`      | Unified search routing            | 1, 2  |
| `businessRulesEngine.js` | Pattern matching and scoring      | 2, 3  |
| `claude.js`              | Anthropic API integration         | 3     |
| `facetSearchService.js`  | SQLite facet filtering (fallback) | -     |
| `genreMapper.js`         | Genre ID to name mapping          | All   |
| `queryToTaxonomy.js`     | Natural language parsing          | 2     |

---

## solrService.js

**Purpose:** Solr search client (Route 1 & 2)

### Key Functions

- `search(options)` - Execute Solr edismax query
- `buildQf()` - Build query fields from fieldWeights.json
- `buildPf2()` - Build phrase fields from fieldWeights.json
- `buildFacetFilters(facetsByCategory)` - Build fq for combined_ids
- `buildSort(mode)` - Build sort clause (featured, explore, rdate, etc.)
- `mapResponse(solrData)` - Convert grouped response to app format

### Key Features

- Song deduplication via `group.field=song_id`
- Field weight mapping: config names to `*_search` fields
- Facet filtering: `combined_ids:("Category/id")`

---

## metadataSearch.js

**Purpose:** Unified search routing (Solr primary, FTS5 fallback)

### Key Functions

- `search(options)` - Main search entry point
- `searchWithSolr(options)` - Route to Solr
- `searchWithFTS5(options)` - Fallback to SQLite FTS5
- `getFacetIds(category, value)` - Map facet values to `"Category/id"` format

### Routing Logic

- Uses `solrService.js` for Solr queries
- Uses `facet_taxonomy` table for facet ID lookups
- Falls back to FTS5 when `SEARCH_ENGINE=fts5` or Solr unavailable

---

## businessRulesEngine.js

**Purpose:** Pattern matching and score adjustment (Route 2 & 3)

### Key Functions

- `applyRules(query, results, allRules)` - Main rule application
- `matchRules(query, rules)` - Find rules matching query pattern
- `adjustScores(results, rule)` - Apply score boosts/adjustments
- `interleaveResults(results, pattern)` - Reorder by recency pattern

### Rule Types

| Type                 | Description                              |
| -------------------- | ---------------------------------------- |
| Genre Simplification | Expand genres to subgenres               |
| Library Boosting     | Multiply scores for specific libraries   |
| Recency Interleaving | Mix recent/vintage by pattern            |
| Feature Boost        | Boost tracks with features (stems, etc.) |
| Filter Optimization  | Auto-apply filters                       |

---

## claude.js

**Purpose:** Anthropic API integration (Route 3)

### Key Functions

- `chat(messages, conversationHistory)` - Main chat entry point
- `loadSystemPrompt()` - Load chat-system-prompt.md
- `getClient()` - Lazy-initialize Anthropic client
- `getModel()` - Get model from env (default: Haiku)

### Tool Definitions

| Tool                | Purpose                                  |
| ------------------- | ---------------------------------------- |
| `read_csv`          | Read CSV files (projects, history, etc.) |
| `grep_tracks`       | Search tracks by field                   |
| `get_track_by_id`   | Single track details                     |
| `get_tracks_by_ids` | Multiple track details                   |
| `manage_project`    | Project management                       |

### Model Selection

- Default: `claude-3-haiku-20240307` (fast, cheap)
- Override: Set `CLAUDE_MODEL` env var
- Options: `claude-3-sonnet-20240229`, `claude-3-opus-20240229`

---

## facetSearchService.js

**Purpose:** SQLite facet filtering (fallback only)

**Note:** This service is only used as a fallback when Solr is unavailable. Primary facet filtering goes through `metadataSearch.js` -> `solrService.js`.

### Key Functions

- `searchByFacetCategory(category, value)` - Search by single facet category
- `searchByFacets(facets)` - Intersect multiple facet filters (AND logic)

---

## genreMapper.js

**Purpose:** Map numeric genre IDs to human-readable names

### Key Functions

- `mapGenreIds(tracks)` - Map genre IDs for all tracks
- `getGenreName(genreId)` - Single genre ID lookup
- `loadGenreTaxonomy()` - Load genre_taxonomy.csv

**Example:**

```javascript
// Input: genre_id = "1103"
// Output: "Classic Rock"
```

---

## queryToTaxonomy.js

**Purpose:** Natural language to taxonomy parser with hybrid local/LLM approach

### Key Functions

- `parseQuery(query, options)` - Main entry point (local first, LLM fallback)
- `parseQueryLocal(query)` - Local-only parsing using QUICK_LOOKUP
- `parseQueryToTaxonomy(query)` - LLM-only parsing
- `buildSolrFilters(result)` - Convert parsed result to Solr fq queries
- `getTaxonomyStats()` - Return category coverage statistics

### Key Data

- `QUICK_LOOKUP` - ~1,955 entries mapping terms to facet IDs
- N-gram matching: 3-word -> 2-word -> single word phrases

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

**Full Documentation:** See `docs/NATURAL_LANGUAGE_TAXONOMY.md`

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
    details: process.env.NODE_ENV === 'development' ? error.message : 'Internal error',
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
  rules_applied: matchedRules.map(r => r.id),
});
```
