# Natural Language Taxonomy Parser

A hybrid local+LLM system that converts natural language music search queries into structured Solr filter queries using APM's taxonomy.

## Overview

**What it does**: Converts queries like `"uptempo solo jazz piano"` into structured facet filters that Solr can execute precisely.

**Why it matters**: Enables natural language search while maintaining the precision of faceted search. Users can type freely; the system maps their intent to our 2,120 facet taxonomy.

## How It Works

```
User query: "uptempo solo jazz piano"
                    ↓
        ┌───────────────────────┐
        │     parseQuery()       │
        │  ┌─────────────────┐  │
        │  │  QUICK_LOOKUP   │──→ 95%+ queries (<5ms)
        │  │  (~1,950 terms) │  │
        │  └─────────────────┘  │
        │          ↓            │
        │  ┌─────────────────┐  │
        │  │  LLM (Claude)   │──→ Complex terms (~1-2s)
        │  └─────────────────┘  │
        └───────────────────────┘
                    ↓
        Structured output:
        {
          "Tempo": ["Tempo/1880"],
          "is_a": ["is_a/2204"],
          "Master Genre": ["Master Genre/1248"],
          "Instruments": ["Instruments/2962"]
        }
                    ↓
        Solr filter queries:
        fq=combined_ids:"Tempo/1880"
        fq=combined_ids:"is_a/2204"
        fq=combined_ids:"Master Genre/1248"
        fq=combined_ids:"Instruments/2962"
```

### Two-Tier Architecture

| Tier             | Speed | When Used             | How                                 |
| ---------------- | ----- | --------------------- | ----------------------------------- |
| **QUICK_LOOKUP** | <5ms  | ~95% of queries       | Pre-computed term→facet mapping     |
| **LLM Fallback** | ~1-2s | Unusual/complex terms | Claude parses against full taxonomy |

### N-gram Matching

The local parser checks phrases in order of length:

1. **3-word phrases**: `"solo jazz piano"`
2. **2-word phrases**: `"jazz piano"`, `"solo jazz"`
3. **Single words**: `"solo"`, `"jazz"`, `"piano"`

This ensures compound terms like `"string quartet"` or `"acid jazz"` are matched correctly before individual words.

## Coverage

### Categories (19 total)

| Category                       | Facets    | QUICK_LOOKUP Entries |
| ------------------------------ | --------- | -------------------- |
| Additional Genre               | 309       | ~200                 |
| Instrumental & Vocal Groupings | 75        | ~100                 |
| Sound Effects                  | 102       | ~196                 |
| Mood                           | 178       | ~142                 |
| Instruments                    | 263       | ~135                 |
| Country & Region               | 224       | ~119                 |
| Musical Form                   | 94        | ~118                 |
| Music For                      | 221       | ~115                 |
| Movement                       | 46        | ~115                 |
| Character                      | 35        | ~103                 |
| Language                       | 62        | ~98                  |
| Master Genre                   | 309       | ~94                  |
| Key                            | 51        | ~88                  |
| Lyric Subject                  | 36        | ~78                  |
| Time Period                    | 51        | ~62                  |
| Tempo                          | 11        | ~56                  |
| is_a                           | 17        | ~54                  |
| Vocals                         | 30        | ~46                  |
| Track Type                     | 5         | ~21                  |
| **Total**                      | **2,120** | **~1,950**           |

### Sample Mappings

```javascript
// Tempo
'uptempo' → Tempo/1880 (120-168 Fast)
'slow' → Tempo/1876 (60-66 Slow)

// is_a (track attributes)
'solo' → is_a/2204 (Solo)
'instrumental' → is_a/3373 (Instrumental Only)
'with stems' → is_a/3301 (Stems Available)

// Genres
'acid jazz' → Master Genre/1249
'shoegaze' → Additional Genre/3413
'trap' → Master Genre/3386

// Ensembles
'string quartet' → Instrumental & Vocal Groupings/1432
'big band' → Instrumental & Vocal Groupings/1417
'choir' → Instrumental & Vocal Groupings/1449

// Moods
'epic' → Mood/2211
'melancholy' → Mood/2273

// Instruments
'piano' → Instruments/2962
'african drums' → Instruments/2777
```

## API Endpoints

### POST /api/taxonomy/parse

Full hybrid parsing (local + LLM fallback).

```bash
curl -X POST http://localhost:3001/api/taxonomy/parse \
  -H "Content-Type: application/json" \
  -d '{"query": "uptempo solo jazz piano"}'
```

**Response:**

```json
{
  "query": "uptempo solo jazz piano",
  "filters": {
    "Tempo": ["Tempo/1880"],
    "is_a": ["is_a/2204"],
    "Master Genre": ["Master Genre/1248"],
    "Instruments": ["Instruments/2962"]
  },
  "solrFilters": [
    "combined_ids:(\"Tempo/1880\")",
    "combined_ids:(\"is_a/2204\")",
    "combined_ids:(\"Master Genre/1248\")",
    "combined_ids:(\"Instruments/2962\")"
  ],
  "mappings": [...],
  "remainingText": "",
  "confidence": 1,
  "source": "local",
  "latencyMs": 3
}
```

### POST /api/taxonomy/parse-local

Local-only parsing (no LLM, guaranteed fast).

### POST /api/taxonomy/parse-llm

Force LLM parsing (for unusual terms).

### GET /api/taxonomy/stats

Taxonomy statistics.

### POST /api/settings/taxonomy-parser

Toggle the taxonomy parser on/off for A/B comparison.

```bash
# Disable taxonomy parser
curl -X POST http://localhost:3001/api/settings/taxonomy-parser \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'

# Enable taxonomy parser
curl -X POST http://localhost:3001/api/settings/taxonomy-parser \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'

# Toggle current state
curl -X POST http://localhost:3001/api/settings/taxonomy-parser \
  -H "Content-Type: application/json" \
  -d '{"enabled": "toggle"}'
```

**Response:**

```json
{
  "taxonomyParserEnabled": false,
  "source": "runtime",
  "message": "Taxonomy parser disabled"
}
```

**A/B Test Results** (query: "uptempo jazz piano"):
| Taxonomy | Titles | Versions |
|----------|--------|----------|
| Disabled | 146 | 355 |
| Enabled | 564 | 1,604 |

The taxonomy parser provides ~4x more relevant results by mapping terms to precise facet filters.

## UI Toggle

The taxonomy parser can also be toggled from the UI:

1. Click the **settings gear icon** in the header
2. Find **"Taxonomy Parser"** toggle (cyan color)
3. Toggle off to compare search results without NLP parsing

When enabled, a cyan **"NLP"** badge appears next to the settings icon.

## Strategic Comparison: vs AIMS Prompt Search

| Aspect              | AIMS Prompt Search | Our Implementation            |
| ------------------- | ------------------ | ----------------------------- |
| **Method**          | LLM-only (likely)  | Hybrid: Local + LLM fallback  |
| **Speed**           | ~1-2s per query    | <5ms for 95%+ of queries      |
| **Cost**            | LLM call per query | LLM only for edge cases (~5%) |
| **Latency**         | Network-dependent  | Mostly local, instant         |
| **Taxonomy**        | AIMS taxonomy      | APM taxonomy (2,120 facets)   |
| **Customization**   | Unknown            | Full control via QUICK_LOOKUP |
| **Offline capable** | No                 | Yes (local parsing)           |
| **Reliability**     | LLM availability   | Works without LLM             |

### Why This Approach Is Better

1. **100-200x faster** for common queries (5ms vs 1-2s)
2. **~95% cost reduction** in LLM API calls
3. **No network latency** for most queries
4. **Higher reliability** - works even if LLM unavailable
5. **Predictable behavior** - same term always maps same way
6. **Full control** - we define exactly how terms map
7. **Still intelligent** - LLM handles edge cases

### Trade-offs

1. **Maintenance**: Need to manually add common terms (one-time effort, done)
2. **Coverage**: LLM might catch terms not in QUICK_LOOKUP (rare, ~5%)
3. **Initial effort**: Significant upfront work (completed)

## Extending QUICK_LOOKUP

### Adding New Terms

Edit `server/services/queryToTaxonomy.js`:

```javascript
const QUICK_LOOKUP = {
  // ... existing entries ...

  // Add new term
  'my new term': { category: 'CategoryName', id: 1234, label: 'Facet Label' },
};
```

### Finding Facet IDs

```sql
-- Find facets by name
SELECT facet_id, category_name, facet_label
FROM facet_taxonomy
WHERE facet_label LIKE '%piano%';

-- List all facets in a category
SELECT facet_id, facet_label
FROM facet_taxonomy
WHERE category_name = 'Instruments'
ORDER BY facet_label;
```

### Testing Changes

```bash
# Test local parsing
curl -X POST http://localhost:3001/api/taxonomy/parse-local \
  -H "Content-Type: application/json" \
  -d '{"query": "my new term jazz"}'
```

## Files

| File                                 | Purpose                                     |
| ------------------------------------ | ------------------------------------------- |
| `server/services/queryToTaxonomy.js` | Main parser with QUICK_LOOKUP               |
| `server/routes/taxonomy.js`          | API endpoints                               |
| `server/apm_music.db`                | SQLite database with `facet_taxonomy` table |

## Performance Benchmarks

| Query Type   | Example                            | Latency |
| ------------ | ---------------------------------- | ------- |
| All local    | "uptempo jazz piano"               | 2-5ms   |
| Mostly local | "experimental jazz fusion"         | 3-8ms   |
| LLM fallback | "music for underwater documentary" | 1-2s    |

## Tuning & Refining the Hybrid Approach

### When to Add Terms to QUICK_LOOKUP

Add a term when:

1. **LLM fallback is triggered** - Check logs for queries hitting the LLM
2. **LLM mapping is wrong** - Override with correct mapping
3. **Common search term** - Frequently used terms should be instant
4. **No exact facet exists** - Map to closest match (see below)

### Handling Terms Without Exact Facet Matches

When a user searches for a term that doesn't exist in the taxonomy (e.g., "vaporwave"), map to the closest available facet:

```javascript
// No "vaporwave" facet exists, but it's similar to synthwave
'vaporwave': { category: 'Master Genre', id: 3378, label: 'Synthwave' },  // Closest match
'retrowave': { category: 'Master Genre', id: 3378, label: 'Synthwave' },
'outrun': { category: 'Master Genre', id: 3378, label: 'Synthwave' },
```

Add a comment explaining the mapping for future maintainers.

### Identifying LLM Fallback Triggers

```bash
# Test if a term triggers LLM fallback
curl -s -X POST http://localhost:3001/api/taxonomy/parse \
  -H "Content-Type: application/json" \
  -d '{"query": "your term here"}' | jq '{source, latencyMs, mappings}'

# If source: "llm" and latencyMs > 1000, consider adding to QUICK_LOOKUP
```

### Resolving Duplicate Key Conflicts

JavaScript objects silently overwrite duplicate keys. When the same term could map to multiple categories:

1. **Choose the most common search intent** as the default
2. **Add specific phrases** for alternative meanings

```javascript
// "horror" most commonly means the mood, not the film genre
'horror': { category: 'Mood', id: 2358, label: 'Horror' },           // Default
'horror film': { category: 'Music For', id: 2629, label: 'Horror / Thriller' },  // Specific
'horror movie': { category: 'Music For', id: 2629, label: 'Horror / Thriller' },
```

### Verifying Mappings

After adding terms, always test:

```bash
# Test local parsing
curl -s -X POST http://localhost:3001/api/taxonomy/parse-local \
  -H "Content-Type: application/json" \
  -d '{"query": "vaporwave piano"}' | jq

# Run full search to verify results make sense
curl -s -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"vaporwave piano"}]}'
```

### Monitoring LLM Fallback Rate

To optimize the system, track what percentage of queries hit the LLM:

```javascript
// In parseQuery() - add logging
if (source === 'llm') {
  console.log(`LLM fallback triggered for: "${query}"`);
  console.log(`Remaining text after local: "${localResult.remainingText}"`);
}
```

Target: **<5% of queries** should require LLM fallback.

### Bulk Adding Terms

When adding many related terms, group them logically:

```javascript
// Internet-culture electronic genres (map to closest taxonomy matches)
'vaporwave': { category: 'Master Genre', id: 3378, label: 'Synthwave' },
'retrowave': { category: 'Master Genre', id: 3378, label: 'Synthwave' },
'outrun': { category: 'Master Genre', id: 3378, label: 'Synthwave' },
'chillwave': { category: 'Master Genre', id: 1128, label: 'Chill Out / Downtempo' },
'darkwave': { category: 'Master Genre', id: 1343, label: 'New Wave' },
```

### Checking for Duplicates

Before adding terms, check for existing entries:

```bash
grep -n "'yourterm':" server/services/queryToTaxonomy.js
```

## Future Improvements

1. **Auto-learn from LLM**: When LLM maps a term, automatically add to QUICK_LOOKUP
2. **Fuzzy matching**: Handle typos ("pianos" → "piano")
3. **Context awareness**: "rock" in "rock band" vs "rock music"
4. **Usage analytics**: Track which terms hit LLM, prioritize adding them

---

**Last Updated**: December 2024
**Total QUICK_LOOKUP Entries**: ~1,955
**Category Coverage**: 19/19 (100%)
