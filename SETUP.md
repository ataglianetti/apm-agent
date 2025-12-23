# APM Agent - Setup Guide

This guide walks you through setting up the APM Agent on your machine.

## Prerequisites

- **Node.js** v18+ (check with `node --version`)
- **Docker Desktop** (for running Solr)
- **npm** (comes with Node.js)
- **SQLite3** (optional, for manual database inspection)

## Quick Start (Automated)

If you're on macOS/Linux, run the automated setup script:

```bash
./setup.sh
```

This will:

1. Install all dependencies
2. Start Solr in Docker
3. Generate the SQLite database
4. Index tracks to Solr
5. Start the development servers

## Manual Setup

If the script doesn't work or you prefer manual steps:

### 1. Install Dependencies

```bash
# Install root dependencies
npm install

# Install server dependencies
cd server && npm install && cd ..

# Install client dependencies
cd client && npm install && cd ..
```

### 2. Set Up Environment

```bash
# Copy the example env file
cp .env.example .env

# Edit .env if needed (Anthropic API key for Route 3 queries)
nano .env
```

### 3. Start Solr

```bash
# Start Solr in Docker
docker compose up -d

# Wait ~30 seconds for Solr to fully start
sleep 30

# Verify Solr is running
curl "http://localhost:8983/solr/admin/cores?action=STATUS"
```

### 4. Generate Database

The SQLite database with 1.4M tracks is NOT in git (too large). Generate it:

```bash
cd server

# Load the full track catalog from CSV
node scripts/loadFullCatalog.js

# Load facet taxonomy
node scripts/loadFacetTaxonomy.js

# Load track-facet mappings
node scripts/loadTrackFacets.js

# Optional: Enable FTS5 for fallback search
node scripts/enableFTS5.js

cd ..
```

This will create `server/apm_music.db` (~7GB).

### 5. Index Tracks to Solr

```bash
cd server
node scripts/indexToSolr.js --delete-first
cd ..
```

This indexes all 1.4M tracks to Solr (~20 minutes).

### 6. Start Development Servers

```bash
npm run dev
```

This starts:

- **Frontend:** http://localhost:5173
- **Backend:** http://localhost:3001
- **Solr Admin:** http://localhost:8983/solr/

## Troubleshooting

### "Solr not responding"

```bash
# Check if Solr is running
curl "http://localhost:8983/solr/"

# If not, start it
docker compose up -d solr
```

### "Cannot find module 'better-sqlite3'"

```bash
cd server && npm install && cd ..
```

### "VITE: command not found"

```bash
cd client && npm install && cd ..
```

### Database corruption errors

```bash
# Remove corrupted database
rm server/apm_music.db*

# Regenerate from scratch
cd server
node scripts/loadFullCatalog.js
node scripts/loadFacetTaxonomy.js
node scripts/loadTrackFacets.js
cd ..
```

## Testing the System

Once running, test each routing tier:

```bash
# Route 1: @ Filter queries (fastest)
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "@mood:uplifting @instruments:piano"}]}'

# Route 2: Simple queries
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "upbeat rock"}]}'

# Route 3: Complex queries (requires ANTHROPIC_API_KEY in .env)
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "What tracks would work for a sports montage?"}]}'
```

## File Locations

| Component        | Location              |
| ---------------- | --------------------- |
| Frontend code    | `client/src/`         |
| Backend code     | `server/`             |
| Database         | `server/apm_music.db` |
| Solr data        | `solr/tracks/data/`   |
| Configuration    | `server/config/`      |
| Track data (CSV) | `data/tracks.csv`     |

## Configuration

Edit these files to customize behavior (no code restart needed):

- **Business Rules:** `server/config/businessRules.json`
- **Field Weights:** `server/config/fieldWeights.json`
- **Chat System Prompt:** `server/config/chat-system-prompt.md`

See `CLAUDE.md` for detailed documentation.

## Next Steps

- Read `CLAUDE.md` for architecture details
- Check `docs/IMPLEMENTATION_STATUS.md` for feature progress
- Review `docs/NATURAL_LANGUAGE_TAXONOMY.md` for NLP search
