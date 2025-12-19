# APM Agent

Production music search system with intelligent 3-tier routing.

## Overview

APM Agent is a music search application that combines:
- **Solr search engine** with 1.4M tracks indexed (matching APM production)
- **Song-level deduplication** via song_id grouping (406K unique songs)
- **18 facet categories** (2,120 total facets) for precise filtering
- **Business rules engine** for PM-controlled ranking without code changes
- **3-tier intelligent routing** optimizing for speed and accuracy
- **Claude API integration** for complex, conversational queries

## Tech Stack

- **Frontend:** React + Vite
- **Backend:** Node.js + Express
- **Search:** Apache Solr (primary), SQLite FTS5 (fallback)
- **Database:** SQLite (metadata source)
- **AI:** Anthropic Claude API

## Performance

| Route | Use Case | Target | Actual |
|-------|----------|--------|--------|
| Route 1 | @ filter queries | <100ms | ~45ms |
| Route 2 | Simple text queries | <100ms | ~90ms |
| Route 3 | Complex/conversational | <4s | ~2.3s |

## Project Structure

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
│   │   ├── businessRules.json   # PM-controlled ranking rules
│   │   ├── fieldWeights.json    # Search field weights (Solr qf/pf2)
│   │   ├── solr.json            # Solr connection settings
│   │   └── chat-system-prompt.md
│   │
│   ├── routes/                  # API routes
│   │   ├── chat.js              # Main chat endpoint (3-tier routing)
│   │   └── trackMetadata.js     # Track metadata endpoints
│   │
│   ├── services/                # Core business logic
│   │   ├── solrService.js       # Solr search client
│   │   ├── metadataSearch.js    # Unified search routing
│   │   ├── businessRulesEngine.js
│   │   └── claude.js            # Anthropic API client
│   │
│   ├── scripts/                 # Database setup scripts
│   └── apm_music.db             # SQLite database (NOT in git)
│
├── solr/                        # Solr configuration
│   ├── tracks/                  # 1.4M tracks
│   ├── composers/               # 16K composers (autocomplete)
│   └── ...
│
├── data/                        # CSV source files
│   └── tracks.csv               # Track catalog
│
├── docker-compose.yml           # Solr container
├── CLAUDE.md                    # Full documentation
└── README.md                    # This file
```

## Setup

### Prerequisites

- Node.js v18+
- Docker Desktop (for Solr)
- Anthropic API key

### 1. Clone and Install

```bash
git clone https://github.com/ataglianetti/apm-agent.git
cd apm-agent
npm install
```

### 2. Environment Setup

```bash
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY
```

### 3. Start Solr

```bash
docker compose up -d
# Wait for Solr to be ready at http://localhost:8983
```

### 4. Generate the SQLite Database

The database file (7GB) is not tracked in git. Generate it locally:

```bash
cd server
node scripts/loadFullCatalog.js      # Load 1.4M tracks from CSV
node scripts/loadFacetTaxonomy.js    # Load facet taxonomy
node scripts/loadTrackFacets.js      # Load track-facet mappings
node scripts/enableFTS5.js           # Enable full-text search fallback
cd ..
```

### 5. Index Tracks to Solr

```bash
node server/scripts/indexToSolr.js --delete-first
# Indexes 1.4M tracks (~10 minutes)

node server/scripts/indexComposersToSolr.js --delete-first
# Indexes 16K composers (~1 second)
```

### 6. Start the Application

```bash
npm run dev
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:3001

## Usage

### Search Examples

**@ Filter Queries (Route 1 - fastest):**
```
@mood:uplifting @instruments:piano
@genre:rock @energy:high
```

**Simple Text Queries (Route 2):**
```
upbeat rock
epic cinematic trailer
calm ambient piano
```

**Complex Queries (Route 3 - uses Claude):**
```
What tracks are in my project?
Find something similar to the last track I downloaded
What did I download last week?
```

## Configuration

### Business Rules

Edit `server/config/businessRules.json` to adjust search ranking:
- Genre simplification (expand rock to subgenres)
- Library boosting (prioritize specific catalogs)
- Recency interleaving (mix new and classic)

### Field Weights

Edit `server/config/fieldWeights.json` to adjust relevance scoring:
```json
{
  "qf": "track_title^3.0 combined_genre^4.0 composer^0.8 ...",
  "pf2": "track_title^2.0 combined_genre^2.0"
}
```

Changes take effect on server restart. No code deployment needed.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/chat` | POST | Main search endpoint (3-tier routing) |
| `/api/tracks/:id/metadata` | GET | Track metadata with facets |
| `/api/tracks/:id/similar` | GET | Similar tracks by shared facets |
| `/api/health` | GET | System health check |

## Documentation

See [CLAUDE.md](./CLAUDE.md) for comprehensive documentation including:
- Architecture deep dive
- Database schema
- Service layer details
- Development guides
- Testing strategy

## License

Proprietary - APM Music
