# How to Demo the APM Agent Business Rules Engine

This guide shows you how to run and demo the newly implemented features.

---

## Quick Start (3 Steps)

### 1. Start the Server

```bash
cd "/Users/echowreck/Projects/APM Music/apm-agent/server"
node index.js
```

Expected output:

```
Server running on http://localhost:3001
```

### 2. Start the Client

In a new terminal:

```bash
cd "/Users/echowreck/Projects/APM Music/apm-agent/client"
npm run dev
```

Expected output:

```
  VITE v5.x.x  ready in XXX ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

### 3. Open in Browser

Navigate to: **http://localhost:5173**

---

## Demo Script: Business Rules Engine

### Demo 1: Simple Query with Genre Simplification Rule

**What to show:** PM-controlled genre expansion without code changes

**Steps:**

1. Open the chat interface at http://localhost:5173
2. Type: `upbeat rock`
3. Press Enter

**What you'll see:**

- 12 track results appear in ~24ms
- Tracks include various rock subgenres (Classic Rock, Alternative Rock, Indie Rock, etc.)
- Each track card shows enhanced metadata (moods, energy, instruments)

**Behind the scenes (check server logs):**

```
Detected simple query, using metadata search + business rules
Matched 1 rules for query "upbeat rock": genre_simplification_rock (priority: 100)
Metadata search returned 12 tracks (total: 70)
Simple query completed in 24ms with 1 rules applied
```

**Key point:** The `genre_simplification_rock` rule automatically expanded "rock" to include:

- Classic Rock
- Alternative Rock
- Indie Rock
- Hard Rock
- Punk Rock
- Garage Rock
- Southern Rock
- Blues / Rock
- Modern Rock
- Surf

**PM Control demo:** Show how to edit the rule:

1. Open `server/config/businessRules.json`
2. Find `"id": "genre_simplification_rock"`
3. Show the `auto_apply_facets` array
4. Explain: "PMs can add/remove subgenres here, change priority, or disable the rule entirely"
5. **No code deployment needed** - just edit JSON and restart server

---

### Demo 2: Facet Filter (Direct SQL Bypass)

**What to show:** Power user @ filters for sub-100ms performance

**Steps:**

1. Type: `@mood:uplifting`
2. Press Enter

**What you'll see:**

- Results appear in <100ms
- All 12 tracks have "uplifting" in their moods
- Message: "Found tracks matching your filters"
- Shows "1-12 of 10000 results"

**Server logs:**

```
Detected @ filter query, handling directly
Filter query completed in XXms, found 10000 results
```

**Try multiple filters:**

```
@mood:uplifting @instruments:piano @energy:high
```

This combines:

- Mood: Uplifting
- Instruments: Piano
- Energy: High

All filters use AND logic - tracks must match all criteria.

---

### Demo 3: Track Metadata Modal (Transparency UI)

**What to show:** Complete visibility into facets, scoring, and business rules

**Steps:**

1. After any search, click the **"📊 View Metadata"** button on any track card
2. A modal opens with 3 tabs

**Tab 1: Facets & Taxonomy**

- Shows all 35 facets for this track
- Grouped by 13 categories:
  - Mood (Uplifting, Happy, Quirky)
  - Instruments (Piano, Strings)
  - Vocals (No Vocals)
  - Tempo (Moderate)
  - Genre (Pop, Corporate)
  - etc.
- Shows track details (BPM, duration, release date, stems availability)
- Shows genre names (mapped from numeric IDs)

**Tab 2: Score Breakdown**

- Shows relevance score (e.g., 3.98)
- Shows score components:
  - `track_title`: 3.0 (matched "upbeat")
  - `track_description`: 0.15 (matched "rock")
  - `fts_rank`: 0.83 (FTS5 ranking)
- Explains field weights from `fieldWeights.json`

**Tab 3: Business Rules**

- Shows which rules were applied to this track
- Shows score adjustments (original → new score)
- Shows rank changes (e.g., "Moved from #5 to #1, +4 ranks")
- Displays rule descriptions and types

**Key point:** This is the **CEO's hot button feature** - complete transparency into why tracks ranked where they did.

---

### Demo 4: Library Boosting Rule

**What to show:** Automatic library prioritization based on query patterns

**Steps:**

1. Type: `sports baseball stadium`
2. Press Enter

**What you'll see:**

- Tracks from "MLB Music" library appear higher in results
- The `library_boost_sports_mlb` rule fires
- MLB tracks get 1.5x score multiplier

**Server logs:**

```
Matched 1 rules for query "sports baseball stadium": library_boost_sports_mlb (priority: 90)
Applied rules: [
  {
    ruleId: 'library_boost_sports_mlb',
    type: 'library_boost',
    description: 'Boost MLB Music library for sports-related queries',
    affectedTracks: 8
  }
]
```

**To see score adjustments:**

1. Click "📊 View Metadata" on an MLB Music track
2. Go to "Business Rules" tab
3. See score adjustment: "Library boost: MLB Music (1.5x)"
4. See rank change: Shows how many positions it moved up

---

### Demo 5: Complex Query with Claude

**What to show:** LLM orchestration for multi-step queries

**Steps:**

1. Type: `What tracks are in my Super Bowl project?`
2. Press Enter

**What you'll see:**

- Claude analyzes the query
- Uses tools to search project data
- Returns structured results
- Slower (~2-4s) but more intelligent

**Key point:** The system intelligently routes:

- Simple queries → Fast metadata search (24ms)
- Complex queries → Claude with tools (2-4s)

---

## Advanced Demos

### Demo 6: Editing Business Rules (PM Control)

**What to show:** Change search behavior without code deployment

**Steps:**

1. **Open rules configuration:**

   ```bash
   open "server/config/businessRules.json"
   ```

2. **Find the library boost rule for sports:**

   ```json
   {
     "id": "library_boost_sports_mlb",
     "type": "library_boost",
     "enabled": true,
     "priority": 90,
     "pattern": "\\b(sports?|baseball|stadium|game|athletic)\\b",
     "description": "Boost MLB Music library for sports-related queries",
     "action": {
       "boost_libraries": [
         {
           "library_name": "MLB Music",
           "boost_factor": 1.5
         }
       ]
     }
   }
   ```

3. **Edit the boost factor:**
   - Change `"boost_factor": 1.5` to `"boost_factor": 3.0`
   - Save the file

4. **Restart the server:**
   - Stop server (Ctrl+C)
   - Start again: `node index.js`

5. **Test the change:**
   - Search: `sports baseball`
   - MLB Music tracks now get 3.0x boost (instead of 1.5x)
   - Much more aggressive library prioritization

6. **Check transparency:**
   - Open track metadata modal
   - Business Rules tab shows: "Library boost: MLB Music (3.0x)"

**Key point:** PMs can tune boost factors, change patterns, enable/disable rules - all without touching code.

---

### Demo 7: API Endpoints (Developer Feature)

**What to show:** RESTful APIs for track metadata and transparency

**Test in browser or curl:**

**1. Track Metadata:**

```bash
curl "http://localhost:3001/api/tracks/2FM_2FM_0046_05001/metadata?query=upbeat%20rock" | python3 -m json.tool
```

Returns:

- Track details
- 35 facets grouped by 13 categories
- Genre names (mapped from IDs)
- Text matches
- Score breakdown

**2. Similar Tracks:**

```bash
curl "http://localhost:3001/api/tracks/2FM_2FM_0046_05001/similar?limit=12" | python3 -m json.tool
```

Returns:

- 12 tracks with most shared facets
- Sorted by similarity

**3. Track Facets:**

```bash
curl "http://localhost:3001/api/tracks/2FM_2FM_0046_05001/facets" | python3 -m json.tool
```

Returns:

- All facets for this track
- Grouped by category
- Count statistics

---

## Performance Comparison Demo

### Before: All queries through Claude (~2-4s)

```
User: "upbeat rock"
→ Claude analyzes query
→ Claude calls tools
→ Claude formats response
→ Total: ~2-4 seconds
```

### After: Intelligent routing (~24ms for simple queries)

```
User: "upbeat rock"
→ Classified as "simple"
→ Metadata search (FTS5)
→ Business rules applied
→ Total: ~24ms
```

**Performance gain: 100x faster for simple queries**

---

## Troubleshooting

### Server won't start

```bash
# Check if port 3001 is already in use
lsof -i :3001

# Kill process if needed
kill -9 <PID>
```

### Client won't start

```bash
# Check if port 5173 is already in use
lsof -i :5173

# Kill process if needed
kill -9 <PID>
```

### Database errors

```bash
# Verify database exists
ls -lh "server/apm_music.db"

# Check database size (should be ~100MB)
```

### No results for @ filters

- Check spelling of facet categories
- Use quotes for multi-word values: `@library:"MLB Music"`
- Check server logs for error messages

---

## Key Demo Talking Points

### 1. PM Control (CEO Hot Button)

> "PMs can edit businessRules.json to change search ranking, boost specific libraries, or add new rules - **without any code deployment**. Just edit the JSON and restart the server."

### 2. Complete Transparency

> "Every track shows exactly **which facets matched**, **what the relevance score is**, and **which business rules affected its ranking**. Click 'View Metadata' on any track to see the full breakdown."

### 3. Performance Optimization

> "We built 3-tier intelligent routing. Simple queries bypass Claude entirely and complete in 24ms - that's **100x faster** than going through the LLM for every query."

### 4. Data Moat

> "We're leveraging APM's proprietary taxonomy - **2,120 facets across 18 categories**. This metadata intelligence is what competitors can't replicate."

### 5. Business Rules Types

> "We've implemented 5 rule types: genre simplification, library boosting, recency interleaving, feature boost, and filter optimization. Each rule is fully configurable."

---

## Sample Demo Queries

### Simple Queries (Route 2 - Fast)

- `upbeat rock`
- `dark suspenseful`
- `corporate motivational`
- `classical piano`
- `electronic dance`

### Facet Filters (Route 1 - Fastest)

- `@mood:uplifting`
- `@instruments:piano`
- `@library:MLB Music`
- `@mood:dark @energy:high`
- `@genre:rock @tempo:fast`

### Complex Queries (Route 3 - Smart)

- `What did I download for my Super Bowl project?`
- `Show me my recent search history`
- `Find tracks similar to what I fully listened to`

---

## Next Steps After Demo

1. **Show the code:**
   - `server/config/businessRules.json` - Rule configuration
   - `server/services/businessRulesEngine.js` - Rules engine
   - `server/routes/chat.js` - Intelligent routing

2. **Demonstrate PM workflow:**
   - Edit a rule in businessRules.json
   - Restart server
   - See immediate results

3. **Discuss metrics:**
   - 24ms average for simple queries
   - <100ms for @ filter queries
   - 100x performance improvement

4. **Review transparency:**
   - Open track metadata modal
   - Show all 3 tabs
   - Explain score breakdown

---

**You're ready to demo!** 🚀

Start the server, start the client, and try the sample queries above.
