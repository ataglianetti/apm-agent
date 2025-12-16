# Track Cards: Complete Flow Diagrams

## 1. High-Level User Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│  USER SEARCHES: "upbeat acoustic guitar"                             │
└────────────────────────┬────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│  FRONTEND (React)                                                    │
│  - MessageInput captures text                                        │
│  - useChat hook: sendMessage("upbeat acoustic guitar")              │
│  - Stores: {role: 'user', content: "upbeat acoustic guitar"}        │
└────────────────────────┬────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│  API CALL: POST /api/chat                                           │
│  Request body:                                                       │
│  {                                                                   │
│    messages: [                                                       │
│      {role: 'user', content: 'upbeat acoustic guitar'}              │
│    ]                                                                 │
│  }                                                                   │
└────────────────────────┬────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│  BACKEND (Node.js/Express)                                          │
│  File: server/routes/chat.js (line 7)                              │
│  - Validates request format                                         │
│  - Checks for simple genre queries                                  │
│  - Routes to Claude via services/claude.js                          │
└────────────────────────┬────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│  CLAUDE API INTEGRATION                                             │
│  File: server/services/claude.js (line 176)                        │
│  - Uses CLAUDE.md as system prompt (37KB of instructions)          │
│  - Loads available tools: grep_tracks, get_tracks_by_ids, etc.     │
│  - Sends to Claude Haiku model                                      │
│                                                                      │
│  Claude's decision:                                                 │
│  "This is a prompt search for 'upbeat acoustic guitar'"           │
│  "I need to search prompt_results.csv for this exact phrase"      │
│  "Then get full track details with get_tracks_by_ids"             │
└────────────────────────┬────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│  CLAUDE EXECUTES TOOLS (Tool Use Loop)                              │
│                                                                      │
│  Step 1: Call read_csv("prompt_results.csv")                       │
│  ├─ Returns: rows where prompt contains "upbeat acoustic"          │
│  ├─ Finds: track_ids = "2FM_2FM_0067_00401;2FM_2FM_0067_01201;..." │
│  └─ Total: 36 matching results                                      │
│                                                                      │
│  Step 2: Call get_tracks_by_ids(track_ids, limit=12)               │
│  ├─ Takes first 12 track IDs from prompt results                   │
│  ├─ Fetches full track details from tracks.csv                     │
│  └─ Returns: 12 track objects with all metadata                    │
│                                                                      │
│  Step 3: Format response as JSON                                   │
│  └─ Creates: { type: "track_results", tracks: [...], ... }        │
└────────────────────────┬────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│  CLAUDE'S TEXT RESPONSE                                             │
│  (wrapped in markdown code fences)                                  │
│                                                                      │
│  ```json                                                            │
│  {                                                                   │
│    "type": "track_results",                                         │
│    "tracks": [                                                      │
│      {                                                              │
│        "id": "2FM_2FM_0067_00401",                                  │
│        "track_title": "Open Road",                                  │
│        "track_description": "Upbeat, positive Americana...",        │
│        "album_title": "Positive Indie Folk",                        │
│        "library_name": "2nd Foundation Music",                      │
│        "composer": "Richard Aikman",                                │
│        "genre": "Folk / Americana",                                 │
│        "additional_genres": "Indie",                                │
│        "bpm": "115",                                                │
│        "duration": "2:08"                                           │
│      },                                                             │
│      ... (11 more tracks) ...                                       │
│    ],                                                               │
│    "total_count": 36,                                               │
│    "showing": "1-12"                                                │
│  }                                                                   │
│  ```                                                                │
└────────────────────────┬────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│  API RESPONSE: routes/chat.js (line 66)                             │
│  {                                                                   │
│    "reply": "```json\n{...track_results...}\n```"                  │
│  }                                                                   │
└────────────────────────┬────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│  FRONTEND: useChat.js (line 40-43)                                  │
│  - Receives response: { reply: "```json\n{...}\n```" }             │
│  - Stores in messages array:                                        │
│    {role: 'assistant', content: "```json\n{...}\n```"}             │
└────────────────────────┬────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│  REACT RE-RENDER: ChatContainer.jsx (line 31-38)                    │
│  - Maps through messages array                                      │
│  - For each message, renders <MessageBubble>                        │
│  - Passes: message.content = "```json\n{...}\n```"                 │
└────────────────────────┬────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│  MESSAGE BUBBLE: MessageBubble.jsx (line 44-92)                     │
│  - Calls: parseTrackResults(message.content)                        │
│  - Returns: {type, tracks, message, total_count, showing}          │
│                                                                      │
│  IF trackResults is valid:                                          │
│    └─ Render: <TrackResultsList data={trackResults} />             │
│  ELSE:                                                              │
│    └─ Render: <ReactMarkdown>{message.content}</ReactMarkdown>    │
└────────────────────────┬────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│  PARSE JSON: parseTrackResults() (line 6-42)                        │
│                                                                      │
│  1. Trim whitespace                                                 │
│  2. Detect & strip markdown code fences (```json ... ```)          │
│  3. Parse extracted string as JSON                                  │
│  4. Validate: type === "track_results" && tracks is array          │
│  5. Return parsed object OR null                                    │
│                                                                      │
│  Success: Returns parsed JSON object                                │
└────────────────────────┬────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│  TRACK RESULTS LIST: TrackResultsList.jsx (line 1-48)              │
│  - Receives: data = {type, tracks, message, total_count, showing}  │
│  - Maps tracks array: {tracks.map((track) => ...)}                 │
│  - For each track, renders: <TrackCard track={track} ... />        │
│  - Handles pagination metadata                                      │
└────────────────────────┬────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│  RENDER 12 TRACK CARDS: TrackCard.jsx (line 1-213)                 │
│                                                                      │
│  For each of 12 tracks:                                             │
│  ├─ Header Row (line 74-136)                                        │
│  │  ├─ Track number badge                                           │
│  │  ├─ Play/pause button                                            │
│  │  ├─ Title & metadata (ID, library)                               │
│  │  └─ Action buttons (Sounds Like, Favorite, Download, Add)       │
│  │                                                                   │
│  ├─ Description + Metadata (line 139-149)                           │
│  │  ├─ Track description text                                       │
│  │  ├─ Genre                                                        │
│  │  ├─ Duration                                                     │
│  │  └─ BPM                                                          │
│  │                                                                   │
│  ├─ Waveform Visualization (line 152-189)                           │
│  │  ├─ 200 animated bars representing audio                         │
│  │  ├─ Click-to-seek functionality                                  │
│  │  └─ Playhead indicator during playback                           │
│  │                                                                   │
│  └─ Genre Tags (line 192-210)                                       │
│     ├─ Additional genres as clickable chips                         │
│     └─ "See More" button if overflow                                │
│                                                                      │
│  Styling:                                                           │
│  ├─ Dark/light mode via useTheme()                                  │
│  ├─ Tailwind CSS classes for responsive design                      │
│  ├─ Hover effects on interactive elements                           │
│  └─ Custom scrollbar in chat area                                   │
└────────────────────────┬────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│  USER SEES: Track Cards in Chat                                    │
│                                                                      │
│  [Chat Container]                                                   │
│  ├─ Assistant Message (12 Track Cards)                              │
│  │  ├─ [1] Open Road - 2:08                    [Play] [...Actions] │
│  │  │    "Upbeat, positive Americana..."  Folk/Americana 115 BPM   │
│  │  │    [Waveform visualization with seekbar]                     │
│  │  │    [Indie] [Positive] [Modern]                               │
│  │  │                                                               │
│  │  ├─ [2] Evening Peace - 2:57                [Play] [...Actions] │
│  │  │    ...                                                        │
│  │  │                                                               │
│  │  └─ [12] Western Nature - 2:10              [Play] [...Actions] │
│  │       ...                                                        │
│  │                                                                  │
│  │  Showing 1-12 of 36 results | [Show More]                        │
│  │                                                                  │
│  └─ (Ready for user to interact or search again)                   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. JSON Parsing State Machine

```
                        START
                          │
                          ▼
                   ┌──────────────┐
                   │ Trim content │
                   └──────┬───────┘
                          │
                          ▼
              ┌─────────────────────────┐
              │ Starts with markdown    │
              │ code fence (```)?       │
              └────┬────────────────┬──┐
                YES│               NO│  
                   │                │  
                   ▼                │  
          ┌────────────────────┐   │  
          │ Strip ``` ...``` │   │  
          │ from both ends     │   │  
          └────────┬───────────┘   │  
                   │                │  
                   ├────────────────┘  
                   │                   
                   ▼                   
         ┌─────────────────────┐
         │ Starts with { ?     │
         └────┬───────────┬───┘
             YES│        NO│
                │         │
                │         ▼
                │    ┌─────────────────────────────────┐
                │    │ Search for JSON block with     │
                │    │ regex pattern (track_results)   │
                │    └────┬─────────────────┬─────────┘
                │        YES│             NO│
                │         │               │
                │         ▼               ▼
                │    ┌─────────────┐   ┌──────────┐
                │    │ Use matched │   │ Return   │
                │    │ block       │   │ null     │
                │    └─────┬───────┘   └──────┬───┘
                │          │                   │
                └─────┬────┴───────────────────┘
                      │
                      ▼
             ┌─────────────────────┐
             │ Parse as JSON       │
             │ JSON.parse()        │
             └────┬────────┬──────┘
                 OK│      ERR│
                   │        │
                   ▼        ▼
         ┌────────────────┐ ┌──────────────────┐
         │ Check if       │ │ Log error,       │
         │ type ===       │ │ return null      │
         │ track_results  │ │ → show as text   │
         │ ?              │ └──────┬───────────┘
         └──┬──────────┬──┘        │
           YES│       NO│          │
             │        │          │
             ▼        ▼          │
        ┌────────┐ ┌──────────────────────┐
        │ Check  │ │ Return null          │
        │ if     │ │ → show as text       │
        │ tracks │ │   instead of cards   │
        │ array? │ └──────┬──────────────┘
        └──┬──┬──┘         │
          YES NO│          │
           │  │ │          │
           │  └─┴──────────┘
           │
           ▼
       ┌──────────────┐
       │ Return JSON  │
       │ object with  │
       │ tracks array │
       └──────┬───────┘
              │
              ▼
      ┌──────────────────────┐
      │ Render 12 TrackCards │
      │ (SUCCESS!)           │
      └──────────────────────┘
```

---

## 3. Component Render Tree

```
App
│
└─ ThemeProvider {isDark, toggleTheme}
   │
   └─ AppContent
      │
      ├─ Header
      │  ├─ Logo
      │  ├─ Title
      │  ├─ Theme Toggle Button
      │  └─ Clear Chat Button
      │
      ├─ ChatContainer (flex-1, overflow-y-auto)
      │  │  
      │  └─ MessageBubble (for each message)
      │     │
      │     ├─ IF User Message:
      │     │  └─ Purple bubble, right-aligned
      │     │
      │     ├─ IF Error Message:
      │     │  └─ Red bubble, left-aligned
      │     │
      │     ├─ IF Text Message (no JSON):
      │     │  └─ Navy/white bubble, left-aligned
      │     │     └─ ReactMarkdown
      │     │        ├─ Headings
      │     │        ├─ Lists
      │     │        ├─ Code blocks
      │     │        └─ Links
      │     │
      │     └─ IF Track Results (JSON detected):
      │        │
      │        └─ TrackResultsList {data, onShowMore, onSoundsLike}
      │           │
      │           ├─ Message display (if provided)
      │           │
      │           ├─ Track Cards Container (space-y-3)
      │           │  │
      │           │  └─ TrackCard (for each of 12 tracks)
      │           │     │
      │           │     ├─ Header Section (flex, justify-between)
      │           │     │  │
      │           │     │  ├─ Track Info Section (flex, items-center)
      │           │     │  │  ├─ Track Number Badge
      │           │     │  │  ├─ Play/Pause Button
      │           │     │  │  │  ├─ SVG play icon (or pause)
      │           │     │  │  │  └─ onClick: togglePlay()
      │           │     │  │  └─ Track Title & ID
      │           │     │  │     ├─ <h3> Track Title
      │           │     │  │     └─ <p> ID + Library
      │           │     │  │
      │           │     │  └─ Actions Section (flex, gap-2)
      │           │     │     ├─ "Sounds Like" button
      │           │     │     ├─ Favorite button (heart icon)
      │           │     │     ├─ Download button (down arrow icon)
      │           │     │     └─ Add to Project button (plus icon)
      │           │     │
      │           │     ├─ Description + Metadata Grid
      │           │     │  ├─ Description (col 1, flex-1)
      │           │     │  ├─ Genre (col 2)
      │           │     │  ├─ Duration (col 3)
      │           │     │  └─ BPM (col 4)
      │           │     │
      │           │     ├─ Waveform Container
      │           │     │  ├─ Bar elements (200 bars)
      │           │     │  │  └─ Each bar: height based on index position
      │           │     │  │     └─ Fills white if played, gray if not
      │           │     │  └─ Playhead line (progress%)
      │           │     │
      │           │     └─ Genre Tags (flex, flex-wrap, gap-2)
      │           │        ├─ Genre chip (for each additional_genre)
      │           │        └─ "See More" button (if overflow)
      │           │
      │           └─ Pagination Footer
      │              ├─ Results count (Showing 1-12 of 36)
      │              └─ [Show More] button (if hasMore)
      │
      └─ MessageInput
         ├─ Text input field
         ├─ Submit button
         └─ Character counter (optional)
```

---

## 4. Data Structure Flow

```
Backend Response:
┌─────────────────────────────────────────────┐
│ { reply: "```json\n{...}\n```" }            │
└────────────────┬────────────────────────────┘
                 │
    (Extract response.reply)
                 │
                 ▼
Frontend State:
┌─────────────────────────────────────────────┐
│ messages = [                                 │
│   { role: 'user', content: 'query' },       │
│   {                                          │
│     role: 'assistant',                       │
│     content: "```json\n{...}\n```"          │
│   }                                          │
│ ]                                            │
└────────────────┬────────────────────────────┘
                 │
    (Map, find assistant message, call parseTrackResults)
                 │
                 ▼
Parsed JSON:
┌─────────────────────────────────────────────┐
│ {                                            │
│   type: 'track_results',                     │
│   message: 'Optional intro message',         │
│   tracks: [                                  │
│     {                                        │
│       id: '2FM_2FM_0067_00401',              │
│       track_title: 'Open Road',              │
│       track_description: '...',              │
│       album_title: 'Positive Indie Folk',    │
│       library_name: '2nd Foundation Music',  │
│       composer: 'Richard Aikman',            │
│       genre: 'Folk / Americana',             │
│       additional_genres: 'Indie',            │
│       bpm: '115',                            │
│       duration: '2:08'                       │
│     },                                       │
│     // ... 11 more tracks                    │
│   ],                                         │
│   total_count: 36,                           │
│   showing: '1-12'                            │
│ }                                            │
└────────────────┬────────────────────────────┘
                 │
    (Pass to TrackResultsList)
                 │
                 ▼
Component Props:
┌─────────────────────────────────────────────┐
│ <TrackResultsList                            │
│   data={{                                    │
│     type: 'track_results',                   │
│     tracks: [...12 tracks...],               │
│     total_count: 36,                         │
│     showing: '1-12',                         │
│     message: '...'                           │
│   }}                                         │
│   onShowMore={handleShowMore}                │
│   onSoundsLike={handleSoundsLike}            │
│ />                                           │
└────────────────┬────────────────────────────┘
                 │
    (Map tracks array to TrackCard components)
                 │
                 ▼
Individual Track Props:
┌─────────────────────────────────────────────┐
│ <TrackCard                                   │
│   track={{                                   │
│     id: '2FM_2FM_0067_00401',                │
│     track_title: 'Open Road',                │
│     track_description: '...',                │
│     ...all other fields...                   │
│   }}                                         │
│   index={0}                                  │
│   onSoundsLike={handleSoundsLike}            │
│ />                                           │
└────────────────┬────────────────────────────┘
                 │
                 ▼
        (Render HTML)
```

---

## 5. Conditional Rendering Logic

```
MessageBubble receives assistant message with content:
"```json\n{...}\n```"
        │
        ▼
parseTrackResults(content)
        │
   ┌────┴────┐
   │          │
VALID      INVALID
   │          │
   ▼          ▼
Return   Return null
{type,     (null means
tracks,    not track
...}       results JSON)
   │          │
   ├─────┬────┘
   │     │
   ▼     ▼
if    if
track textResults
Results (no JSON)
   │     │
   ▼     ▼
Render  Render
Track   Markdown
Cards   (regular
(12     text chat
card     message)
layout)
```

---

## 6. Error Handling Flow

```
User Input
   │
   ▼
Send to Backend
   │
   ├─ Network Error?
   │  └─ Catch block: setError + show error message
   │
   ├─ API Error (4xx/5xx)?
   │  └─ response.ok check: throw Error
   │
   ├─ Invalid JSON?
   │  └─ Console error logged, return null from parseTrackResults
   │
   ├─ Missing "tracks" field?
   │  └─ Type check fails, return null
   │
   ├─ Wrong "type" value?
   │  └─ Type check fails, return null
   │
   └─ All checks pass?
      └─ Render track cards successfully
```

---

## 7. User Interaction Flow

```
┌─────────────────────────────────────────────┐
│  USER INTERACTION ON TRACK CARD             │
└─────────────────────────────────────────────┘

├─ Click Play/Pause Button
│  └─ togglePlay()
│     ├─ Start simulation: setProgress increases
│     ├─ Show 200-bar waveform with playback
│     └─ Auto-stop at 100% progress
│
├─ Click on Waveform
│  └─ Jump to that position
│     ├─ Calculate: clickX / containerWidth * 100
│     └─ setProgress() to that value
│
├─ Click "Sounds Like"
│  └─ onSoundsLike(track)
│     ├─ trigger: sendMessage(`Find tracks like "${track.track_title}"`)
│     └─ Trigger similarity search
│
├─ Click Favorite ❤️
│  └─ Future: Save to favorites (not yet implemented)
│
├─ Click Download ⬇️
│  └─ Future: Download track/stems (not yet implemented)
│
├─ Click Add to Project ➕
│  └─ Future: Show project selector modal (not yet implemented)
│
└─ See More (genre tags)
   └─ Future: Expand full genre list (not yet implemented)

┌─────────────────────────────────────────────┐
│  PAGINATION                                  │
└─────────────────────────────────────────────┘

First Search:
├─ User: "upbeat acoustic guitar"
├─ Response: showing "1-12" of 36 results
├─ Render: 12 track cards + [Show More] button
│
└─ User clicks [Show More]:
   ├─ sendMessage("show more")
   ├─ Backend interprets as continuation
   ├─ Response: showing "13-24" of 36 results
   ├─ Render: Next 12 track cards
   │
   └─ User clicks [Show More] again:
      ├─ sendMessage("show more")
      ├─ Response: showing "25-36" of 36 results
      ├─ Render: Final 12 track cards
      └─ No more [Show More] button (hasMore = false)
```

