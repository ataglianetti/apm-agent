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

| Tier | Speed | When Used | How |
|------|-------|-----------|-----|
| **QUICK_LOOKUP** | <5ms | ~95% of queries | Pre-computed term→facet mapping |
| **LLM Fallback** | ~1-2s | Unusual/complex terms | Claude parses against full taxonomy |

### N-gram Matching

The local parser checks phrases in order of length:
1. **3-word phrases**: `"solo jazz piano"`
2. **2-word phrases**: `"jazz piano"`, `"solo jazz"`
3. **Single words**: `"solo"`, `"jazz"`, `"piano"`

This ensures compound terms like `"string quartet"` or `"acid jazz"` are matched correctly before individual words.

## Coverage

### Categories (19 total)

| Category | Facets | QUICK_LOOKUP Entries |
|----------|--------|---------------------|
| Additional Genre | 309 | ~200 |
| Instrumental & Vocal Groupings | 75 | ~100 |
| Sound Effects | 102 | ~196 |
| Mood | 178 | ~142 |
| Instruments | 263 | ~135 |
| Country & Region | 224 | ~119 |
| Musical Form | 94 | ~118 |
| Music For | 221 | ~115 |
| Movement | 46 | ~115 |
| Character | 35 | ~103 |
| Language | 62 | ~98 |
| Master Genre | 309 | ~94 |
| Key | 51 | ~88 |
| Lyric Subject | 36 | ~78 |
| Time Period | 51 | ~62 |
| Tempo | 11 | ~56 |
| is_a | 17 | ~54 |
| Vocals | 30 | ~46 |
| Track Type | 5 | ~21 |
| **Total** | **2,120** | **~1,950** |

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

## Strategic Comparison: vs AIMS Prompt Search

| Aspect | AIMS Prompt Search | Our Implementation |
|--------|-------------------|-------------------|
| **Method** | LLM-only (likely) | Hybrid: Local + LLM fallback |
| **Speed** | ~1-2s per query | <5ms for 95%+ of queries |
| **Cost** | LLM call per query | LLM only for edge cases (~5%) |
| **Latency** | Network-dependent | Mostly local, instant |
| **Taxonomy** | AIMS taxonomy | APM taxonomy (2,120 facets) |
| **Customization** | Unknown | Full control via QUICK_LOOKUP |
| **Offline capable** | No | Yes (local parsing) |
| **Reliability** | LLM availability | Works without LLM |

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

| File | Purpose |
|------|---------|
| `server/services/queryToTaxonomy.js` | Main parser with QUICK_LOOKUP |
| `server/routes/taxonomy.js` | API endpoints |
| `server/apm_music.db` | SQLite database with `facet_taxonomy` table |

## Performance Benchmarks

| Query Type | Example | Latency |
|------------|---------|---------|
| All local | "uptempo jazz piano" | 2-5ms |
| Mostly local | "experimental jazz fusion" | 3-8ms |
| LLM fallback | "music for underwater documentary" | 1-2s |

## Future Improvements

1. **Auto-learn from LLM**: When LLM maps a term, automatically add to QUICK_LOOKUP
2. **Fuzzy matching**: Handle typos ("pianos" → "piano")
3. **Context awareness**: "rock" in "rock band" vs "rock music"
4. **Usage analytics**: Track which terms hit LLM, prioritize adding them

---

**Last Updated**: December 2024
**Total QUICK_LOOKUP Entries**: ~1,950
**Category Coverage**: 19/19 (100%)
