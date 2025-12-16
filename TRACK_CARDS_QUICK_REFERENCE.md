# APM Agent Track Cards: Quick Reference Guide

## Component Hierarchy

```
App
├── ThemeProvider
│   └── AppContent
│       ├── Header
│       ├── ChatContainer
│       │   └── MessageBubble (repeating for each message)
│       │       └── TrackResultsList (if JSON detected)
│       │           └── TrackCard (x12 for each result set)
│       │               ├── Header (title, play button, actions)
│       │               ├── Description + Metadata
│       │               ├── Waveform
│       │               └── Genre Tags
│       └── MessageInput
```

---

## JSON Response Format (Expected)

```json
{
  "type": "track_results",
  "message": "Optional message before results",
  "tracks": [
    {
      "id": "LIB_LIB_0000_00000",
      "track_title": "Track Name",
      "track_description": "Description of the track",
      "album_title": "Album Name",
      "library_name": "Library Name",
      "composer": "Composer Name",
      "genre": "Genre Name",
      "additional_genres": "Genre1, Genre2, Genre3",
      "bpm": "120",
      "duration": "2:30"
    },
    // ... 11 more tracks (MUST be exactly 12 total)
  ],
  "total_count": 48,
  "showing": "1-12"
}
```

**Critical Requirements:**
- ✅ `type` must be `"track_results"`
- ✅ `tracks` must be an array with exactly 12 objects
- ✅ Each track must have: id, track_title, track_description, album_title, library_name, composer, genre, additional_genres, bpm, duration
- ✅ `total_count` and `showing` enable pagination
- ✅ `message` is optional (use for disambiguation follow-up)

---

## Backend → Frontend Data Flow

### 1. Backend Returns (services/claude.js)
```
Claude says: "```json\n{...full JSON...}\n```"
```

### 2. API Wraps It (routes/chat.js)
```javascript
{
  reply: "```json\n{...full JSON...}\n```"
}
```

### 3. Frontend Stores (hooks/useChat.js)
```javascript
{
  role: 'assistant',
  content: "```json\n{...full JSON...}\n```"
}
```

### 4. MessageBubble Detects (components/MessageBubble.jsx)
```javascript
trackResults = parseTrackResults(message.content)
// Strips markdown, parses JSON, validates type
```

### 5. Renders Cards (components/TrackResultsList.jsx)
```javascript
{tracks.map((track) => <TrackCard track={track} />)}
```

---

## Parsing Logic Flow

```
Raw Content
    ↓
Trim whitespace
    ↓
Detect markdown code fences?
    ├─ YES → Strip ``` ...```
    └─ NO → Continue
    ↓
Starts with {?
    ├─ YES → Ready to parse
    └─ NO → Search for JSON block via regex
    ↓
Parse as JSON
    ↓
Has "type": "track_results"?
    ├─ YES → Valid! Return object
    └─ NO → Return null (show as text instead)
    ↓
Has "tracks" array?
    ├─ YES → Valid! Render cards
    └─ NO → Return null (show as text instead)
```

---

## Key File Locations

### Backend
- **API Route:** `/server/routes/chat.js` (line 7-93)
- **Claude Service:** `/server/services/claude.js` (line 169-229)
- **File Tools:** `/server/services/fileTools.js` (grep_tracks, get_tracks_by_ids)

### Frontend
- **Main App:** `/client/src/App.jsx` (line 1-39)
- **Chat Hook:** `/client/src/hooks/useChat.js` (line 1-71)
- **Chat Container:** `/client/src/components/ChatContainer.jsx` (line 1-43)
- **Message Bubble:** `/client/src/components/MessageBubble.jsx` (line 1-92) **← JSON Parsing**
- **Track Results:** `/client/src/components/TrackResultsList.jsx` (line 1-48) **← Track Mapping**
- **Track Card:** `/client/src/components/TrackCard.jsx` (line 1-213) **← Display Logic**
- **Theme Context:** `/client/src/context/ThemeContext.jsx` (dark/light mode)
- **Styles:** `/client/src/index.css` (global + markdown styling)

---

## Debugging Checklist

If cards don't appear:

1. **Check Backend Response**
   ```bash
   curl -X POST http://localhost:3001/api/chat \
     -H "Content-Type: application/json" \
     -d '{"messages":[{"role":"user","content":"rock"}]}'
   ```
   - Should return `{ "reply": "```json\n{...}\n```" }`
   - Verify JSON has `type: "track_results"` and `tracks` array

2. **Check Browser Console**
   - Look for errors in parseTrackResults
   - Check if JSON parsing throws errors
   - Verify theme context is available

3. **Verify Component Props**
   - TrackResultsList should receive data with tracks array
   - Each TrackCard should receive track object
   - onSoundsLike callback should be defined

4. **Check Styling**
   - Verify Tailwind CSS is compiled
   - Check if dark/light mode applies correctly
   - Look for CSS conflicts

5. **Test Parsing in Browser**
   ```javascript
   // Paste in console
   const content = 'YOUR_RESPONSE_HERE';
   // Run parseTrackResults logic manually
   ```

---

## Response Format Examples

### ✅ Correct Format
```json
{
  "type": "track_results",
  "message": "Here are some upbeat tracks:",
  "tracks": [
    {"id": "...", "track_title": "...", ...},
    // ... 11 more tracks
  ],
  "total_count": 36,
  "showing": "1-12"
}
```

### ❌ Wrong: Text description instead of JSON
```
I found 12 upbeat tracks for you...
```
**Problem:** Frontend won't parse as JSON, will show as text

### ❌ Wrong: JSON not in code fences
```
{"type": "track_results", ...}
```
**Problem:** Frontend still parses it, but doesn't match Claude's typical response format

### ❌ Wrong: Missing required fields
```json
{
  "type": "track_results",
  "tracks": [
    {"id": "...", "track_title": "..."}  // Missing most fields
  ]
}
```
**Problem:** TrackCard renders but looks empty/broken

### ❌ Wrong: Wrong type value
```json
{
  "type": "search_results",  // Should be "track_results"
  "tracks": [...]
}
```
**Problem:** Frontend won't recognize as track results, shows as text

---

## Performance Notes

- **Initial Load:** 12 tracks rendered
- **Pagination:** "Show More" triggers new search for tracks 13-24
- **Re-renders:** Each message addition causes ChatContainer re-render
- **Optimization:** Consider useMemo for track list if >100 tracks

---

## Tailwind Classes Used

- `flex`, `flex-1`, `justify-start`, `justify-between`, `items-center`
- `bg-apm-navy`, `bg-apm-dark`, `bg-apm-purple`
- `text-apm-light`, `text-gray-800`, `text-gray-600`
- `rounded-lg`, `rounded-full`, `rounded-2xl`
- `p-4`, `m-4`, `mb-4`, `mt-4`
- `space-y-3`, `gap-2`, `gap-3`, `gap-4`
- `hover:`, `transition-`, `duration-`
- `dark:` mode variants

---

## Theme Colors (from tailwind.config.js)

```javascript
colors: {
  'apm-dark': '#0f1419',      // Dark background
  'apm-navy': '#1a1f36',      // Navy (message bubbles)
  'apm-purple': '#7c3aed',    // Purple (primary action)
  'apm-light': '#e5e7eb',     // Light text
  'apm-gray': '#4b5563',      // Gray
  'apm-gray-light': '#9ca3af' // Light gray
}
```

---

## Testing Tips

**Test a simple prompt:**
```
User: "upbeat acoustic guitar"
Expected: 12 track cards with acoustic guitar tracks
```

**Test with empty results:**
```
User: "xyz123nonsense"
Expected: Either 12 best-effort tracks or empty list with message
```

**Test pagination:**
```
1. Search that returns >12 results
2. User clicks "Show More"
3. Next 12 tracks appear (showing: 13-24)
```

**Test dark mode:**
```
Click theme toggle → All cards should adapt colors
```

---

## Common Pitfalls

1. **Forgetting the markdown code fences** in Claude's response
   - Solution: Ensure Claude wraps JSON in ````json ... ```

2. **Not returning exactly 12 tracks**
   - Solution: Verify `get_tracks_by_ids` returns 12, not 8 or 15

3. **Missing track fields in response**
   - Solution: Ensure all tracks have: id, track_title, track_description, album_title, library_name, composer, genre, additional_genres, bpm, duration

4. **Theme context not available**
   - Solution: Verify `<ThemeProvider>` wraps entire app

5. **Pagination metadata incorrect**
   - Solution: Ensure `showing` format is "1-12", "13-24", etc. and `total_count` matches actual total

