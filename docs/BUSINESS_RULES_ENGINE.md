# Business Rules Engine Overview

## What It Does

The business rules engine lets **product managers control search ranking without engineering involvement**. It's a JSON configuration file that modifies how search results are ordered and filtered based on user queries.

## Where It Sits in the Architecture

```
┌─────────────┐     ┌────────────────┐     ┌─────────────────────┐     ┌──────────┐
│   React     │────▶│   /api/chat    │────▶│   Solr/AIMS Search  │────▶│  Results │
│  Frontend   │     │   (Express)    │     │   (raw relevance)   │     │          │
└─────────────┘     └───────┬────────┘     └──────────┬──────────┘     └────▲─────┘
                            │                         │                      │
                            │                         ▼                      │
                            │              ┌──────────────────────┐          │
                            └─────────────▶│  Business Rules      │──────────┘
                                           │  Engine              │
                                           │  (post-processing)   │
                                           └──────────────────────┘
                                                     ▲
                                                     │
                                           ┌─────────┴─────────┐
                                           │ businessRules.json │
                                           │ (PM-editable)      │
                                           └───────────────────┘
```

**Flow:**

1. User searches in the React frontend
2. API endpoint receives query and routes to search engine (Solr)
3. Raw results return with relevance scores
4. **Business Rules Engine post-processes results** based on matching rules
5. Modified results return to frontend

## Rule Types Available

| Rule Type                 | What It Does                            | Example Use Case                                                         |
| ------------------------- | --------------------------------------- | ------------------------------------------------------------------------ |
| **Library Boost**         | Multiply scores for specific libraries  | Boost MLB Music library 1.5x for "sports" queries                        |
| **Recency Interleaving**  | Mix recent + vintage tracks in patterns | "Pop" queries get pattern RRRR VRRR (4 recent, 1 vintage, 3 recent)      |
| **Recency Decay**         | Gently penalize older tracks            | Pop tracks at 2 years old = 90% score, never below 65%                   |
| **Subgenre Interleaving** | Ensure variety across subgenres         | "Rock" returns Classic Rock, Alt Rock, Indie Rock, Hard Rock interleaved |
| **Feature Boost**         | Boost tracks with specific attributes   | 2x boost for tracks with stems when "stems" is mentioned                 |
| **Filter Optimization**   | Auto-apply filters                      | "Instrumental" query auto-filters to "No Vocals"                         |

## Key Benefits

1. **Zero code deployments** for ranking changes
2. **Full transparency**: API returns which rules fired and how they affected results
3. **Priority system**: Rules have priorities (0-100), higher wins conflicts
4. **Global kill switch**: Can disable all rules instantly via API toggle
5. **Safe by default**: Regex patterns validated against ReDoS attacks

## How PMs Make Changes

Edit `server/config/businessRules.json`:

```json
{
  "id": "library_boost_sports_mlb",
  "enabled": true, // flip to false to disable
  "priority": 90,
  "pattern": "\\b(sports?|baseball)\\b", // query keywords that trigger
  "action": {
    "boost_libraries": [
      {
        "library_name": "MLB Music",
        "boost_factor": 1.5 // 50% score boost
      }
    ]
  }
}
```

Then restart the server. No code review or deployment pipeline required.
