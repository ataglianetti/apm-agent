# APM Agent Demo Cases

This demo focuses on **conversational search** - showing how the agent handles different search modes, disambiguation, and context-aware interactions.

---

## 1. Metadata Search (Keywords/Tags)

Direct searches using genre terms, taxonomy keywords, or specific filters.

### 1.1 Single Keyword - Triggers Disambiguation
**Prompt:** "rock"

**Expected:** Agent recognizes broad genre term, offers subgenre options:
```
I found rock tracks across several styles. Which are you looking for?

• Rock (299 tracks) - broad rock selection
• Hard Rock / Metal (215 tracks)
• Alternative (60 tracks)
• Modern Rock (56 tracks)
• Metal (53 tracks)
• Blues / Rock (47 tracks)
• Something else? (Garage Rock, Southern Rock, Surf, etc.)
```

### 1.2 Disambiguation Follow-up
**Prompt:** (after rock disambiguation) "blues"

**Expected:** Agent matches "blues" to "Blues / Rock" from the options just shown, searches genre 1103, returns 12 tracks.

### 1.3 Specific Subgenre - No Disambiguation
**Prompt:** "garage rock"

**Expected:** Agent searches genre 1327 directly, returns 12 of 32 tracks. No disambiguation needed since it's already specific.

### 1.4 Classical Disambiguation (Adam's Example)
**Prompt:** "classical"

**Expected:** Agent offers nuanced options per Adam's requirements:
```
Classical covers a lot of ground. Are you looking for:

• Well-known classical pieces (Mozart, Beethoven, Bach, Vivaldi)
• Neo-Classical (97 tracks) - modern compositions in classical style
• Classical Styling (88 tracks) - contemporary tracks with classical elements
• Minimalist Style (86 tracks) - Philip Glass, Steve Reich type
• A specific era (Baroque, Romantic, 20th Century)
• Something else?
```

### 1.5 Classical - Famous Composers Selection
**Prompt:** (after classical disambiguation) "the famous stuff"

**Expected:** Agent searches for tracks by well-known composers (Mozart, Beethoven, Bach, Vivaldi, Chopin, Tchaikovsky, etc.), prioritizes these at top of results, excludes modern remixes/covers.

### 1.6 Multi-keyword Metadata Search
**Prompt:** "upbeat acoustic guitar"

**Expected:** Agent searches tracks.csv for keywords in tags/title/description, returns matching tracks.

---

## 2. Prompt Search (Natural Language / Abstract)

Descriptive, mood-based, or use-case searches that go beyond simple keywords.

### 2.1 Mood-based Search
**Prompt:** "dark tension suspense"

**Expected:** Agent uses prompt search, returns 12 tracks from prompt_results.csv matching dark/tense mood.

### 2.2 Use-case Search
**Prompt:** "uplifting inspiring corporate"

**Expected:** Returns tracks suitable for corporate videos - positive, professional, building energy.

### 2.3 Scene Description
**Prompt:** "music for a car chase scene"

**Expected:** Agent interprets as action/driving/tense, searches for matching tracks.

### 2.4 Abstract/Emotional
**Prompt:** "something that feels like a rainy Sunday morning"

**Expected:** Agent interprets mood (melancholy, reflective, peaceful) and searches accordingly.

### 2.5 Pagination
**Prompt:** "epic trailer drums"

**Expected:** Returns first 12 results.

**Follow-up:** "show more"

**Expected:** Returns results 13-24 with "Showing 13-24 of X results"

---

## 3. Audio Similarity Search

Finding tracks similar to a reference - URL, file upload, existing APM track, or via the "Sounds Like" button on track cards.

### 3.1 YouTube Reference
**Prompt:** "Find me something like this: https://youtube.com/watch?v=dQw4w9WgXcQ"

**Expected:**
1. Looks up URL in mock_references.csv
2. Gets matched APM track (CEZ_CEZ_4639_00201 - "80s pop hit with synth")
3. Finds similar tracks via audio_similarities.csv
4. Returns results with similarity basis (80s, synth, retro)

### 3.2 Spotify Reference
**Prompt:** "Here's a Spotify reference: https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b"

**Expected:** Maps to NFL_NFL_0036_01901 (emotional orchestral), returns similar orchestral/cinematic tracks.

### 3.3 Client File Upload
**Prompt:** "The client sent this reference: client_reference_track.wav"

**Expected:** Looks up filename in mock_references.csv, returns similar dark/ominous tracks.

### 3.4 APM Track Reference (typed)
**Prompt:** "Find me tracks similar to NFL_NFL_0036_01901"

**Expected:** Direct lookup in audio_similarities.csv, returns similar tracks.

### 3.5 "Sounds Like" Button (UI)
**Action:** Click "Sounds Like" link on any track card in search results

**Expected:**
1. Sends message: "Find tracks that sound like [Track Title] ([Track ID])"
2. Agent looks up track in audio_similarities.csv
3. Returns similar tracks

**Demo tip:** After any search returns results, click "Sounds Like" on one of the track cards to show the UI integration.

### 3.6 Conversational Track Reference
**Prompt:** "More like the last track I downloaded"

**Expected:**
1. Gets last download from download_history.csv
2. Looks up similar tracks
3. Returns results

---

## 4. Hybrid / Contextual Search

Searches that combine modes or use conversation context.

### 4.1 Genre + Mood
**Prompt:** "jazz but something dark and moody"

**Expected:** Agent combines genre filter (jazz) with mood keywords, returns jazz tracks with darker character.

### 4.2 Exclude Previous Results
**Prompt:** "uplifting tracks I haven't downloaded yet"

**Expected:**
1. Searches for uplifting tracks
2. Filters out tracks in download_history.csv
3. Returns fresh recommendations

### 4.3 Project-Aware Search
**Prompt:** "Find tracks for my holiday campaign"

**Expected:**
1. Identifies P010 (Holiday Campaign - Retail)
2. Notes project keywords: holiday, christmas, festive, warm, family
3. Searches for matching tracks
4. Notes if any results are already in the project

### 4.4 Refining Results
**Prompt:** "rock"
**Follow-up:** "alternative"
**Follow-up:** "something more mellow"

**Expected:** Agent narrows from Rock → Alternative → filters for lower energy/tempo tracks.

---

## 5. Project & History Queries

Non-search queries that demonstrate context awareness.

### 5.1 Recent Projects
**Prompt:** "What are my recent projects?"

**Expected:** Lists projects sorted by modified_on date, no status labels.

### 5.2 Project Contents
**Prompt:** "What's in my Year in Review project?"

**Expected:** Lists tracks in P011 with track details.

### 5.3 Search History
**Prompt:** "What have I been searching for lately?"

**Expected:** Shows recent searches from search_history.csv with download counts.

### 5.4 Download History
**Prompt:** "What did I download for my holiday campaign?"

**Expected:** Filters download_history.csv for P010, shows track details.

---

## Demo Flow Recommendation

For a 15-minute conversational search demo:

### Opening (2 min)
- "What are my recent projects?" → Shows agent understands user context

### Metadata Search + Disambiguation (4 min)
1. "rock" → Shows disambiguation flow
2. "blues" → Shows response matching to Blues / Rock
3. "classical" → Shows Adam's classical disambiguation
4. "the famous stuff" → Shows classical search with famous composers prioritized

### Prompt Search (3 min)
1. "dark tension suspense" → Natural language search
2. "show more" → Pagination
3. "uplifting inspiring corporate" → Use-case search

### Audio Similarity (3 min)
1. YouTube URL: `https://youtube.com/watch?v=dQw4w9WgXcQ` → 80s synth results
2. Spotify URL: `https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b` → Orchestral results
3. Click "Sounds Like" on a track card → Shows UI-driven similarity search

### Hybrid/Contextual (3 min)
1. "jazz but something dark and moody" → Combined search
2. "Find tracks for my holiday campaign" → Project-aware search

---

## 6. Power User Field Override (@)

Direct field searches that bypass normal routing. Type `@` to see available fields.

**UI Features:**
- Type `@` to open autocomplete popup with field options
- Arrow keys to navigate, Enter/Tab to select, Escape to dismiss
- Selected field appears as a **styled chip/tag** in the input
- Backspace on empty input deletes the entire chip
- Click X on the chip to remove it

### 6.1 Title Search
**Action:** Type `@` → Select "Track Title" → Type search term
**Input:** `@title: moonlight`

**Expected:** Searches track_title field directly, returns tracks with "moonlight" in title.

### 6.2 Composer Search
**Input:** `@composer: tom hedden`

**Expected:** Searches composer field, returns tracks by Tom Hedden.

### 6.3 Album Search
**Input:** `@album: cinema score`

**Expected:** Searches album_title field for "cinema score".

### 6.4 BPM Search
**Input:** `@bpm: 120`

**Expected:** Searches for tracks with BPM containing "120".

**Demo tip:** Show the field chip appearing after selection - it's visually distinct (purple tag) and behaves as a unit.

---

## 7. Light/Dark Mode Toggle

The UI supports both dark and light themes.

**Action:** Click the sun/moon icon in the header to toggle between modes.

**Features:**
- Theme preference persists in localStorage
- All components adapt: header, chat bubbles, track cards, input field, waveforms
- Purple accent color remains consistent in both modes
- Light mode: white backgrounds, gray borders, better for bright environments
- Dark mode: navy/black backgrounds, matches APM branding

**Demo tip:** Toggle the theme during the demo to show adaptability.

---

## 8. Model Switching

The prototype supports switching between Claude models via environment variable.

**To change models:**

```bash
# Use Haiku for faster responses (good for quick demos)
CLAUDE_MODEL=claude-3-5-haiku-20241022 npm run dev

# Use Opus for best quality (good for complex queries)
CLAUDE_MODEL=claude-opus-4-20250514 npm run dev

# Default is Sonnet (balanced)
npm run dev
```

**Demo tip:** Show the same query with different models to demonstrate the "models are commodities" point. The context layer (CLAUDE.md + user data) stays the same; only the underlying model changes.

---

## Key Behaviors to Highlight

1. **Disambiguation** - Agent doesn't just dump results for broad terms; asks clarifying questions
2. **Response Matching** - "blues" after showing "Blues / Rock" option → matches to that option
3. **Pagination** - Always 12 results, "show more" for next page
4. **Context Awareness** - Knows user's projects, history, downloads
5. **No Over-explanation** - Shows results without justifying every match
6. **Friendly Tone** - Conversational but efficient, not robotic
7. **Power User Override** - `@field:` syntax with chip UI for direct field searches
8. **Light/Dark Mode** - Toggle between themes via header icon

---

*All test cases use real data from APM Music Track Metadata (10,000 tracks).*
