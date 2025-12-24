# Development Guide

This document covers development setup, common tasks, and patterns for APM Agent.

## Environment Setup

### Requirements

- Node.js v18+ (for native ESM support)
- Docker Desktop (for Solr)
- npm or yarn

### Environment Variables

Create a `.env` file:

```bash
ANTHROPIC_API_KEY=sk-ant-...          # Required for Route 3
CLAUDE_MODEL=claude-3-haiku-20240307  # Optional (default: Haiku)
PORT=3001                              # Optional (default: 3001)
NODE_ENV=development                   # development | production
SEARCH_ENGINE=solr                     # Optional: 'solr' (default) or 'fts5'
```

---

## Initial Setup

### 1. Start Solr

```bash
docker compose up -d        # Start Solr container
# Wait for Solr to be ready at http://localhost:8983
```

### 2. Generate SQLite Database

The database file is NOT tracked in git (7GB file). Generate it locally:

```bash
cd server

# Load the full track catalog from CSV
node scripts/loadFullCatalog.js

# Load facet taxonomy (for filtering)
node scripts/loadFacetTaxonomy.js

# Load track-facet mappings
node scripts/loadTrackFacets.js

# Enable FTS5 full-text search (optional fallback)
node scripts/enableFTS5.js
```

### 3. Index to Solr

```bash
# Index tracks (1.4M docs, ~10 minutes)
node server/scripts/indexToSolr.js --delete-first

# Index composers for autocomplete (16K docs, ~1 second)
node server/scripts/indexComposersToSolr.js --delete-first
```

### 4. Verify Setup

```bash
# Check Solr tracks
curl "http://localhost:8983/solr/tracks/select?q=*:*&rows=0"
# Should show numFound: 1403568

# Check Solr composers
curl "http://localhost:8983/solr/composers/select?q=*:*&rows=0"
# Should show numFound: 16784
```

---

## Running the Server

### Development

```bash
docker compose up -d   # Start Solr first
npm run dev            # Starts both server and client with hot reload
npm run dev:server     # Server only
npm run dev:client     # Client only
```

### Production

```bash
npm run build          # Build client
npm start              # Start server (serves built client)
```

---

## Common Development Tasks

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

2. **Restart server:** `npm run dev`

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
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "Epic Cinematic"}]}'
```

### Adding a New Facet Category

**Database changes:**

1. Add facets to `facet_taxonomy` table:

```sql
INSERT INTO facet_taxonomy (facet_id, category_name, facet_name)
VALUES (2121, 'Mood Types', 'contemplative');
```

2. Add track-to-facet mappings:

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

## Performance Monitoring

### Query Timing

Add timing logs:

```javascript
const start = Date.now();
const results = await metadataSearch.search(query);
const duration = Date.now() - start;
console.log(`Search completed in ${duration}ms`);
```

### Production Metrics (Future)

Track these metrics:

- Average query time per route
- p95, p99 latency
- Slow query log (>1s for Route 2)

---

## Solr Management

### Common Commands

```bash
# Start/stop
docker compose up -d
docker compose down

# View logs
docker compose logs -f solr

# Health check
curl "http://localhost:8983/solr/tracks/admin/ping"
```

### Reindexing

```bash
# Full reindex (deletes existing data first)
node server/scripts/indexToSolr.js --delete-first
node server/scripts/indexComposersToSolr.js --delete-first
```

### Schema Changes

1. Update `solr/tracks/conf/managed-schema`
2. Restart Solr: `docker compose restart solr`
3. Reindex: `node server/scripts/indexToSolr.js --delete-first`

---

## SQLite Management

### Common Queries

```bash
# Count tracks
sqlite3 server/apm_music.db "SELECT COUNT(*) FROM tracks;"

# View facets
sqlite3 server/apm_music.db "SELECT * FROM facet_taxonomy LIMIT 10;"

# Check schema
sqlite3 server/apm_music.db ".schema tracks"
```

### FTS5 Maintenance

```sql
-- Check FTS5 stats
SELECT * FROM tracks_fts WHERE tracks_fts MATCH 'rank';

-- Optimize FTS5 index
INSERT INTO tracks_fts(tracks_fts) VALUES('optimize');

-- Rebuild index
INSERT INTO tracks_fts(tracks_fts) VALUES('rebuild');
```

---

## Configuration Updates

After editing config files (`businessRules.json`, `fieldWeights.json`, `chat-system-prompt.md`):

1. Restart server: `npm run dev:server`
2. Test changes with sample queries
3. Monitor logs for errors

**No code deployment needed for config changes!**
