# API Endpoints Reference

This document details all API endpoints available in APM Agent.

## POST /api/chat

Main search endpoint with 3-tier routing.

### Request

```json
{
  "messages": [{ "role": "user", "content": "upbeat rock" }]
}
```

### Response (Route 2 - Simple Query)

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

---

## GET /api/tracks/:id/metadata

Comprehensive track metadata with facets and scores.

### Response

```json
{
  "track": {
    "id": "NFL_NFL_0036_01901",
    "track_title": "Gridiron Glory"
  },
  "facets": {
    "Mood": ["powerful", "energetic", "dramatic"],
    "Instruments": ["electric_guitar", "drums", "brass"],
    "Genre": ["Orchestral Rock", "Sports Anthem"]
  },
  "facet_count": 35,
  "score_breakdown": {
    "track_title": 3.0,
    "combined_genre": 1.0,
    "fts_rank": 0.92
  }
}
```

---

## GET /api/tracks/:id/similar

Find tracks with most shared facets.

### Response

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
  ]
}
```

---

## GET /api/tracks/:id/facets

Facets grouped by category.

### Response

```json
{
  "track_id": "NFL_NFL_0036_01901",
  "facets_by_category": {
    "Mood": [
      { "facet_id": 123, "facet_name": "powerful" },
      { "facet_id": 456, "facet_name": "energetic" }
    ],
    "Instruments": [{ "facet_id": 789, "facet_name": "electric_guitar" }]
  },
  "category_counts": {
    "Mood": 5,
    "Instruments": 4,
    "Genre": 2
  },
  "total_facets": 35
}
```

---

## Taxonomy Parser Endpoints

### POST /api/taxonomy/parse

Hybrid parsing (local first, LLM fallback).

**Request:**

```json
{
  "query": "uptempo jazz piano"
}
```

**Response:**

```json
{
  "filters": {
    "Tempo": ["Tempo/1880"],
    "Master Genre": ["Master Genre/1248"],
    "Instruments": ["Instruments/2962"]
  },
  "solrFilters": ["combined_ids:(\"Tempo/1880\")"],
  "source": "local",
  "latencyMs": 3
}
```

### POST /api/taxonomy/parse-local

Local-only parsing (instant, no LLM).

### POST /api/taxonomy/parse-llm

Force LLM parsing.

### GET /api/taxonomy/stats

Taxonomy coverage statistics.

### POST /api/settings/taxonomy-parser

Toggle taxonomy parser on/off for A/B testing.
