# APM Agent - Repository Documentation

**Production music search system with intelligent 3-tier routing**

**Tech Stack:** Node.js + Express + Solr + SQLite + React + Vite + Anthropic API
**Database:** 1.4M tracks indexed in Solr, 406K unique songs, SQLite for metadata
**Performance:** Route 1 <100ms | Route 2 <100ms | Route 3 <4s

---

## User Context

**Role:** Senior Product Manager for APM Music search engine
**Technical Proficiency:** Expert in PM/strategy, working knowledge of technical implementation
**Resource Constraint:** One search engineer, so TRDs that weigh technical pros/cons save engineering time

### Working with Claude Code on This Project

**Be Proactive About:**

- Search/IR improvements (user has less domain knowledge than for other work)
- Stakeholder management and storytelling for CEO
- UX and design quality over schedule pressure

**Communication Style:**

- Be direct and concise
- Lead with recommendations, then rationale
- Use tables for structured comparisons
- For coding: discuss approach before implementing
- Never use em-dashes (use commas, periods, or parentheses)

**Document Creation:**

- Claude generates full PRD drafts based on discussion, then iterate together
- Use TRD format for technical docs (see existing TRDs in docs/)

**When Building Cases for Stakeholders:**

- Frame around competitive positioning and user feedback, not revenue
- Diplomatically challenge pet projects by asking for intended outcome and measurable impact

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

### Key Directories

| Directory          | Purpose                                                     |
| ------------------ | ----------------------------------------------------------- |
| `client/`          | React + Vite frontend                                       |
| `server/config/`   | PM-controlled configuration (business rules, field weights) |
| `server/routes/`   | API routes (chat.js handles 3-tier routing)                 |
| `server/services/` | Core business logic                                         |
| `solr/`            | Solr configuration (Docker volume)                          |
| `docs/`            | Documentation                                               |

---

## Architecture Overview

### 3-Tier Intelligent Routing

```
                    User Query
                        |
            +-----------------------+
            |  Query Classification |
            +-----------------------+
                |       |        |
         Route 1    Route 2   Route 3
         @ Filters  Simple    Complex
             |          |         |
          Solr       Solr     Anthropic
          (fq)     (edismax)    API
             |          |         |
             |      Business   Business
             |       Rules      Rules
             |          |         |
          <100ms     <100ms     <4s
        (no rules)  (+ rules)  (+ rules)
```

| Route       | Trigger                  | Example                              | Performance |
| ----------- | ------------------------ | ------------------------------------ | ----------- |
| **Route 1** | `@category:value` syntax | `@mood:uplifting @instruments:piano` | <100ms      |
| **Route 2** | 1-4 words, descriptive   | `upbeat rock`                        | <100ms      |
| **Route 3** | Questions, history refs  | `What did I download last week?`     | <4s         |

**Detailed Documentation:**

- Services: `docs/SERVICES_ARCHITECTURE.md`
- Database: `docs/DATABASE_SCHEMA.md`
- API: `docs/API_REFERENCE.md`

---

## Configuration System

### businessRules.json (PM-Controlled)

**File:** `server/config/businessRules.json`
**Purpose:** Search ranking without code changes

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

```json
{
  "qf": "track_title^3.0 combined_genre^4.0 composer^0.8 album_title^0.6 track_description^0.15",
  "pf2": "track_title^2.0 combined_genre^2.0"
}
```

Higher weights = more important in ranking.

### chat-system-prompt.md

**File:** `server/config/chat-system-prompt.md`
**Purpose:** LLM behavior instructions for Route 3 queries

---

## Testing

### Manual Testing (All 3 Routes)

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

### Performance Targets

| Route   | Target | Typical |
| ------- | ------ | ------- |
| Route 1 | <100ms | ~45ms   |
| Route 2 | <100ms | ~24ms   |
| Route 3 | <4s    | ~2.3s   |

---

## Repository Etiquette

**Branching:**

- ALWAYS create a feature branch before starting major changes
- NEVER commit directly to `main`
- Branch naming: `feature/description` or `fix/description`

**Before pushing:**

1. Test all 3 routes (see Testing section)
2. Verify performance targets
3. Ensure Solr is running: `curl "http://localhost:8983/solr/tracks/admin/ping"`

---

## Claude Code Instructions

### General Guidelines

1. **Follow existing patterns** - Check services/ for similar code before creating new patterns
2. **Prefer editing over creating** - Edit existing files rather than creating new ones
3. **Update configs before code** - Modify businessRules.json or fieldWeights.json before changing code
4. **Test all 3 routes** - Changes may affect routing logic, test each tier
5. **Maintain performance** - Keep Route 1 <100ms, Route 2 <100ms, Route 3 <4s

### Implementation Status Tracking

**IMPORTANT:** When completing any milestone from `docs/IMPLEMENTATION_STATUS.md`, you MUST update that file:

1. Change status from `NOT IMPLEMENTED` or `PARTIAL` to `COMPLETE`
2. Update any relevant metrics or descriptions
3. Add an entry to the Changelog section

### Adding Features

1. **Check configuration first** - Can this be solved with businessRules.json?
2. **Use existing services** - Extend metadataSearch.js or businessRulesEngine.js
3. **Follow service layer** - Business logic in services/, routes/ just handle HTTP
4. **Update system prompt** - If adding tools or changing behavior, update chat-system-prompt.md

### Modifying Search Behavior

| What to Change | Where to Edit                      |
| -------------- | ---------------------------------- |
| Field weights  | `server/config/fieldWeights.json`  |
| Business rules | `server/config/businessRules.json` |
| Query routing  | `server/routes/chat.js`            |
| Solr queries   | `server/services/solrService.js`   |

---

## Quick Reference

### Key Files

| Purpose         | File                                                           |
| --------------- | -------------------------------------------------------------- |
| Routing         | `server/routes/chat.js`                                        |
| Route 1         | `server/services/facetSearchService.js`                        |
| Route 2         | `server/services/metadataSearch.js` + `businessRulesEngine.js` |
| Route 3         | `server/services/claude.js`                                    |
| Taxonomy Parser | `server/services/queryToTaxonomy.js`                           |
| Database        | `server/apm_music.db`                                          |

### PM-Controlled Config

- Business rules: `server/config/businessRules.json` (16 rules)
- Field weights: `server/config/fieldWeights.json` (Solr format)

### Common Commands

```bash
# Solr
docker compose up -d                    # Start Solr container
docker compose down                     # Stop Solr container

# Indexing
node server/scripts/indexToSolr.js --delete-first       # Index 1.4M tracks (~10 min)
node server/scripts/indexComposersToSolr.js --delete-first  # Index 16K composers (~1 sec)

# Development
npm run dev           # Start both server (3001) and client (5173)
npm run dev:server    # Server only
npm run dev:client    # Client only

# Verify Solr
curl "http://localhost:8983/solr/tracks/select?q=*:*&rows=0"  # Should show 1,403,568
```

### Extended Documentation

| Topic                   | File                                |
| ----------------------- | ----------------------------------- |
| Database Schema         | `docs/DATABASE_SCHEMA.md`           |
| API Reference           | `docs/API_REFERENCE.md`             |
| Services Architecture   | `docs/SERVICES_ARCHITECTURE.md`     |
| Development Guide       | `docs/DEVELOPMENT_GUIDE.md`         |
| Natural Language Parser | `docs/NATURAL_LANGUAGE_TAXONOMY.md` |
| Implementation Status   | `docs/IMPLEMENTATION_STATUS.md`     |

---

**Last Updated:** December 23, 2025
**Status:** Production-ready
**Version:** 3.0
