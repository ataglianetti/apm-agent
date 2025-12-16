import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { executeFileTool } from './fileToolsDb.js';  // Using SQLite version for speed
import { executeProjectTool } from './projectTools.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Lazy-initialize client to ensure env vars are loaded
let client = null;
function getClient() {
  if (!client) {
    client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });
  }
  return client;
}

// Get model from environment or use default
function getModel() {
  // Default to Haiku for faster responses and lower cost
  // Override with CLAUDE_MODEL env var for different models (see .env.example)
  return process.env.CLAUDE_MODEL || 'claude-3-haiku-20240307';
}

// Load CLAUDE.md as system prompt
function loadSystemPrompt() {
  // Use original CLAUDE.md - user explicitly doesn't want concise version
  const originalPath = path.join(__dirname, '..', '..', 'CLAUDE.md');
  return fs.readFileSync(originalPath, 'utf-8');
}

// Tool definitions for Claude
const tools = [
  {
    name: "read_csv",
    description: "Read a CSV file from the data directory. Use for smaller files like projects.csv, genre_taxonomy.csv, prompt_results.csv, search_history.csv, download_history.csv, audition_history.csv, audio_similarities.csv, mock_references.csv. Returns file contents as JSON array.",
    input_schema: {
      type: "object",
      properties: {
        filename: {
          type: "string",
          description: "Name of the CSV file (e.g., 'projects.csv', 'genre_taxonomy.csv')"
        },
        limit: {
          type: "number",
          description: "Optional: limit number of rows returned (default: all rows)"
        }
      },
      required: ["filename"]
    }
  },
  {
    name: "grep_tracks",
    description: "Search tracks.csv (10,000 tracks) for tracks matching a pattern. Use this for metadata searches by genre ID, keyword, composer, etc. Returns matching tracks as JSON array.",
    input_schema: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "Search pattern (e.g., genre ID '1103', keyword 'rock', composer name)"
        },
        field: {
          type: "string",
          enum: ["genre", "track_title", "track_description", "composer", "library_name", "album_title", "has_stems", "all"],
          description: "Which field to search in. Use 'genre' for genre ID searches, 'has_stems' for stems filtering, 'all' to search all text fields."
        },
        limit: {
          type: "number",
          description: "Max results to return (default: 12)"
        }
      },
      required: ["pattern"]
    }
  },
  {
    name: "get_track_by_id",
    description: "Get full details for a specific track by its track ID",
    input_schema: {
      type: "object",
      properties: {
        track_id: {
          type: "string",
          description: "The track ID (e.g., 'NFL_NFL_0036_01901')"
        }
      },
      required: ["track_id"]
    }
  },
  {
    name: "get_tracks_by_ids",
    description: "Get full details for multiple tracks by their IDs. Use when you have a list of track IDs from prompt_results.csv or audio_similarities.csv.",
    input_schema: {
      type: "object",
      properties: {
        track_ids: {
          type: "array",
          items: { type: "string" },
          description: "Array of track IDs"
        },
        limit: {
          type: "number",
          description: "Max results to return (default: 12)"
        }
      },
      required: ["track_ids"]
    }
  },
  {
    name: "manage_project",
    description: "Add or remove tracks from projects, create new projects, or list tracks in a project. Use this tool to manage project track assignments.",
    input_schema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["add_track", "add_multiple_tracks", "remove_track", "list_tracks", "create_project"],
          description: "The action to perform"
        },
        project_id: {
          type: "string",
          description: "The project ID (e.g., 'P012', 'P001')"
        },
        track_id: {
          type: "string",
          description: "Single track ID for add_track or remove_track"
        },
        track_ids: {
          type: "array",
          items: { type: "string" },
          description: "Array of track IDs for add_multiple_tracks"
        },
        notes: {
          type: "string",
          description: "Optional notes about why this track (for add_track)"
        },
        name: {
          type: "string",
          description: "Project name (for create_project)"
        },
        description: {
          type: "string",
          description: "Project description (for create_project)"
        },
        for_field: {
          type: "string",
          description: "Project type like 'TV Commercial', 'Documentary', etc. (for create_project)"
        },
        keywords: {
          type: "string",
          description: "Semicolon-separated keywords (for create_project)"
        },
        deadline: {
          type: "string",
          description: "Project deadline in YYYY-MM-DD format (for create_project)"
        },
        collaborators: {
          type: "string",
          description: "Semicolon-separated list of collaborators (for create_project)"
        }
      },
      required: ["action"]
    }
  }
];

export async function chat(messages) {
  const systemPrompt = loadSystemPrompt();

  // Initial request to Claude
  const model = getModel();
  console.log(`Using model: ${model}`);

  let response = await getClient().messages.create({
    model: model,
    max_tokens: 4096,
    system: systemPrompt,
    tools: tools,
    messages: messages
  });

  // Tool use loop - keep going until we get a text response
  while (response.stop_reason === 'tool_use') {
    // Find all tool use blocks
    const toolUses = response.content.filter(c => c.type === 'tool_use');

    // Execute all tools and collect results
    const toolResults = [];
    for (const toolUse of toolUses) {
      console.log(`Executing tool: ${toolUse.name}`, toolUse.input);
      let result;

      // Route to appropriate tool handler
      if (toolUse.name === 'manage_project') {
        result = await executeProjectTool(toolUse.input.action, toolUse.input);
      } else {
        result = await executeFileTool(toolUse.name, toolUse.input);
      }

      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: typeof result === 'string' ? result : JSON.stringify(result)
      });
    }

    // Add assistant message and tool results to conversation
    messages = [
      ...messages,
      { role: 'assistant', content: response.content },
      { role: 'user', content: toolResults }
    ];

    // Continue the conversation
    response = await getClient().messages.create({
      model: model,
      max_tokens: 4096,
      system: systemPrompt,
      tools: tools,
      messages: messages
    });
  }

  // Extract text response
  const textContent = response.content.find(c => c.type === 'text');
  return textContent?.text || 'No response generated.';
}
