#!/bin/bash

set -e

echo "============================================================"
echo "APM Agent - Automated Setup"
echo "============================================================"
echo ""

# Check prerequisites
echo "Checking prerequisites..."

if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js v18+"
    exit 1
fi

if ! command -v docker &> /dev/null; then
    echo "❌ Docker not found. Please install Docker Desktop"
    exit 1
fi

echo "✓ Node.js $(node --version)"
echo "✓ Docker installed"
echo ""

# Install dependencies
echo "Installing dependencies..."
npm install > /dev/null 2>&1
cd server && npm install > /dev/null 2>&1 && cd ..
cd client && npm install > /dev/null 2>&1 && cd ..
echo "✓ Dependencies installed"
echo ""

# Create .env if it doesn't exist
if [ ! -f .env ]; then
    echo "Creating .env file..."
    cp .env.example .env
    echo "✓ .env created (update with your ANTHROPIC_API_KEY if needed)"
    echo ""
fi

# Start Solr
echo "Starting Solr in Docker..."
docker compose up -d > /dev/null 2>&1
echo "⏳ Waiting for Solr to start (30 seconds)..."
sleep 30

# Verify Solr
if curl -s "http://localhost:8983/solr/" > /dev/null; then
    echo "✓ Solr is running"
else
    echo "❌ Solr failed to start"
    exit 1
fi
echo ""

# Check if database exists
if [ ! -f server/apm_music.db ]; then
    echo "Generating SQLite database..."
    cd server

    echo "  → Loading track catalog..."
    node scripts/loadFullCatalog.js > /dev/null 2>&1

    echo "  → Loading facet taxonomy..."
    node scripts/loadFacetTaxonomy.js > /dev/null 2>&1

    echo "  → Loading track-facet mappings..."
    node scripts/loadTrackFacets.js > /dev/null 2>&1

    echo "  → Enabling FTS5 search..."
    node scripts/enableFTS5.js > /dev/null 2>&1

    cd ..
    echo "✓ Database generated"
    echo ""
fi

# Index tracks to Solr
echo "Indexing 1.4M tracks to Solr..."
echo "(This takes ~20 minutes, please wait...)"
cd server
node scripts/indexToSolr.js --delete-first
cd ..
echo "✓ Tracks indexed"
echo ""

# Summary
echo "============================================================"
echo "✓ Setup Complete!"
echo "============================================================"
echo ""
echo "Start the development servers with:"
echo "  npm run dev"
echo ""
echo "Then access:"
echo "  Frontend:  http://localhost:5173"
echo "  Backend:   http://localhost:3001"
echo "  Solr Admin: http://localhost:8983/solr/"
echo ""
echo "Test a search:"
echo "  curl -X POST http://localhost:3001/api/chat \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"messages\": [{\"role\": \"user\", \"content\": \"upbeat rock\"}]}'"
echo ""
