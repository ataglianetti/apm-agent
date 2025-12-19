# APM Agent Documentation

This folder contains the current, up-to-date documentation for APM Agent v2.0.

## Core Documentation

- **CLAUDE.md** - System instructions for Claude (LLM agent)
- **README.md** - Project overview and quick start
- **IMPLEMENTATION_REPORT.md** - Detailed technical implementation (500+ lines)
- **HOW_TO_DEMO.md** - Step-by-step demo guide
- **BUSINESS_RULES_SUMMARY.md** - Executive summary (one-page)
- **CODE_REVIEW_AND_CLEANUP.md** - Code review and production readiness

## Architecture

**v2.0 Features:**
- SQLite database (10,001 tracks, 2,120 facets)
- Business rules engine (16 PM-controlled rules)
- 3-tier intelligent routing (<100ms, ~24ms, <4s)
- Facet-based search (18 categories)
- Metadata extraction (moods, energy, instruments)
- Complete transparency (score breakdown, rule application)

## Quick Links

- [How to Demo](./HOW_TO_DEMO.md) - Start here for demos
- [Implementation Report](./IMPLEMENTATION_REPORT.md) - Full technical details
- [Code Review](./CODE_REVIEW_AND_CLEANUP.md) - Production readiness checklist

**Last Updated:** December 18, 2025
**Architecture Status:** Production-ready
**Performance:** All targets met
