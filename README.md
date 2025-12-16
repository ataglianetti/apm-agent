# APM Agent Prototype

A demonstration of context engineering for music search, built with real APM catalog data and simulated user activity.

## What This Is

This prototype shows how **context engineering** transforms a basic LLM into an intelligent music search assistant. Instead of just answering questions, the agent understands:

- **User history** - What you've searched, auditioned, and downloaded
- **Project context** - What you're working on and recent activity
- **Behavioral signals** - Full listens vs. quick skips indicate preference
- **Patterns over time** - Recurring searches suggest ongoing needs

## The Context Engineering Approach

The instructions in `CLAUDE.md` follow a 6-layer framework:

| Layer | Purpose |
|-------|---------|
| **Intent** | Interpret what the user actually means |
| **User** | Build a portrait from behavioral data |
| **Domain** | Understand entities and relationships |
| **Rules** | Define hard constraints and soft guidelines |
| **Environment** | Track real-time session state |
| **Exposition** | Structure responses appropriately |

## Project Structure

```
apm-agent-prototype/
├── CLAUDE.md              # Agent instructions (the context layer)
├── README.md              # This file
├── DEMO.md                # Test cases and demo flow
├── scripts/
│   └── project_ops.py     # Create projects, add/remove tracks
└── data/
    ├── tracks.csv             # 10,000 tracks from APM catalog
    ├── projects.csv           # 12 projects (Jan-Dec 2025)
    ├── project_tracks.csv     # Track assignments to projects
    ├── search_history.csv     # 58 searches with results + actions
    ├── download_history.csv   # 82 downloads
    ├── audition_history.csv   # 212 auditions with duration signals
    ├── prompt_results.csv     # 30 pre-computed prompt search results
    ├── audio_similarities.csv # 70+ track-to-track similarity mappings
    └── mock_references.csv    # YouTube/Spotify/TikTok/file mappings
```

## Setup

### Option 1: Claude Code (Anthropic)

1. Install Claude Code CLI:
   ```bash
   npm install -g @anthropic-ai/claude-code
   ```

2. Navigate to the project directory:
   ```bash
   cd /path/to/apm-agent-prototype
   ```

3. Start Claude Code:
   ```bash
   claude
   ```

Claude Code automatically reads `CLAUDE.md` as system instructions and has access to all files in the directory.

### Option 1b: Web UI (React + Express)

1. Copy `.env.example` to `.env` and add your API key:
   ```bash
   cp .env.example .env
   # Edit .env with your ANTHROPIC_API_KEY
   ```

2. Install dependencies and start the dev server:
   ```bash
   npm install
   npm run dev
   ```

3. Open http://localhost:5173 in your browser

**Changing the model:**

The web UI defaults to `claude-sonnet-4-20250514`. To use a different model:

```bash
# Option 1: Set in .env file
CLAUDE_MODEL=claude-3-5-haiku-20241022

# Option 2: Set inline when starting
CLAUDE_MODEL=claude-opus-4-20250514 npm run dev
```

Available models:
- `claude-sonnet-4-20250514` (default, balanced)
- `claude-3-5-haiku-20241022` (faster, cheaper)
- `claude-opus-4-20250514` (most capable)

### Option 2: ChatGPT Codex / OpenAI CLI

1. Install the OpenAI Codex CLI:
   ```bash
   npm install -g @openai/codex
   ```

2. Navigate to the project directory:
   ```bash
   cd /path/to/apm-agent-prototype
   ```

3. Start Codex with the instructions file:
   ```bash
   codex --instructions CLAUDE.md
   ```

Alternatively, copy the contents of `CLAUDE.md` into your system prompt when using the OpenAI API directly.

### Option 3: Manual Setup (Any LLM)

1. Copy the contents of `CLAUDE.md`
2. Paste as the system prompt in your LLM interface
3. Ensure the LLM has access to read the CSV files in `./data/`

## Example Interactions

Once set up, try these prompts:

**Project queries:**
```
What's in my Year in Review project?
Show me the tracks in P011 sorted by position.
What have I been working on recently?
```

**History queries:**
```
What have I been searching for lately?
Show me tracks I fully listened to but didn't download.
What did I download for my holiday campaign?
```

**Prompt search (simulated AIMS):**
```
Find me dark tension suspense music
I need uplifting inspiring corporate tracks
Search for tropical summer fun
```

**Audio similarity - URL reference:**
```
Find me something like this: https://youtube.com/watch?v=dQw4w9WgXcQ
Here's a Spotify reference: https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b
The client loves this TikTok: https://tiktok.com/@user/video/7123456789
```

**Audio similarity - File upload:**
```
The client sent this reference: client_reference_track.wav
Find tracks like agency_reference.wav
```

**Audio similarity - APM track:**
```
Find me tracks similar to NFL_NFL_0036_01901
More like the last track I downloaded
Show me tracks that sound like "Long Hard Look"
```

**Behavioral analysis:**
```
Which searches resulted in the most downloads?
What's my average audition duration before downloading?
Are there tracks I've auditioned multiple times without downloading?
```

**Project management (write operations):**
```
Create a new project called "Spring Launch" for a TV commercial
Add "Long Hard Look" to my Spring Launch project
Find uplifting tracks and add the top 3 to my project
Show me what's in the Spring Launch project
```

## Mock Data Overview

The data represents Anthony Taglianetti (Product Manager at APM Music) working on 12 projects throughout 2025:

| Project | Type | Last Modified |
|---------|------|---------------|
| P001 | Super Bowl Commercial | 2025-02-05 |
| P002 | Valentine's Day Promo | 2025-02-12 |
| P003 | Tech Conference Keynote | 2025-03-18 |
| P004 | Spring Fashion Campaign | 2025-04-22 |
| P005 | Documentary - Climate Change | 2025-05-30 |
| P006 | Summer Beverage Campaign | 2025-07-10 |
| P007 | Fitness App Update | 2025-08-05 |
| P008 | Back to School Campaign | 2025-08-28 |
| P009 | Halloween Special | 2025-10-25 |
| P010 | Holiday Campaign - Retail | 2025-12-01 |
| P011 | Year in Review - Corporate | 2025-12-05 |
| P012 | New Year's Eve Broadcast | 2025-12-08 |

## Search Mode Simulation

This prototype simulates all four APM search modes without requiring API connections:

| Mode | How It's Simulated |
|------|-------------------|
| **Metadata** | Grep search of `tracks.csv` (10K tracks) by genre, keywords, BPM |
| **Prompt** | Pre-computed results in `prompt_results.csv` (30 common prompts) |
| **Audio Similarity (URL/file)** | `mock_references.csv` maps URLs → tracks → `audio_similarities.csv` |
| **Audio Similarity (APM track)** | Direct lookup in `audio_similarities.csv` |

### Supported Mock References

- **YouTube:** 8 video URLs mapped to catalog tracks
- **Spotify:** 8 track URLs mapped to catalog tracks
- **TikTok:** 5 video URLs mapped to catalog tracks
- **File uploads:** 5 common filenames (client_reference_track.wav, etc.)
- **APM tracks:** All 70+ tracks have similarity mappings

## Key Concepts Demonstrated

### Behavioral Signals
- `full_listen=True` in audition_history indicates strong interest
- Short `duration_played` suggests rejection
- Downloads are the strongest positive signal

### Context-Aware Search
- Agent checks what you've already downloaded before recommending
- Project keywords inform relevance
- Search history reveals patterns

### Agentic Workflows
- Multi-step queries: "Find tracks similar to what I fully listened to"
- Cross-file joins: Project → Project Tracks → Tracks
- Temporal filtering: "What did I download last month?"

## Why This Matters

AI vendors (AIMS, Harmix) sell to all competitors. The **context layer is the moat**:

- Models are commodities (swap Claude for GPT anytime)
- Search AI is commoditized (everyone can buy AIMS)
- **User context is proprietary** (only APM has APM user data)

This prototype demonstrates that the intelligence comes from context, not the model.

---

*Built to demonstrate context engineering principles for APM Music's AI search initiative.*
