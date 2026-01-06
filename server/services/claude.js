import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { executeFileTool } from './fileToolsDb.js'; // Using SQLite version for speed
import { executeProjectTool } from './projectTools.js';
import { getLLMMode } from '../routes/settings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Lazy-initialize client to ensure env vars are loaded
let client = null;
function getClient() {
  if (!client) {
    client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
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

// Load chat system prompt based on LLM_MODE
function loadSystemPrompt() {
  const llmMode = getLLMMode();
  const promptFile =
    llmMode === 'primary' ? 'chat-system-prompt-conversational.md' : 'chat-system-prompt.md';
  const promptPath = path.join(__dirname, '..', 'config', promptFile);
  console.log(`Loading system prompt: ${promptFile} (LLM_MODE=${llmMode})`);
  return fs.readFileSync(promptPath, 'utf-8');
}

// Tool definitions for Claude
const tools = [
  {
    name: 'read_csv',
    description:
      'Read a CSV file from the data directory. Use for smaller files like projects.csv, genre_taxonomy.csv, prompt_results.csv, search_history.csv, download_history.csv, audition_history.csv, audio_similarities.csv, mock_references.csv. Returns file contents as JSON array.',
    input_schema: {
      type: 'object',
      properties: {
        filename: {
          type: 'string',
          description: "Name of the CSV file (e.g., 'projects.csv', 'genre_taxonomy.csv')",
        },
        limit: {
          type: 'number',
          description: 'Optional: limit number of rows returned (default: all rows)',
        },
      },
      required: ['filename'],
    },
  },
  {
    name: 'search_tracks',
    description:
      "Search the full APM catalog (1.4M tracks) using Solr with relevance ranking. This is the PRIMARY tool for music searches. Returns tracks sorted by relevance to the query. Use for any music search query like 'upbeat rock', 'sad piano', 'corporate motivational', etc.",
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            "Natural language search query (e.g., 'upbeat rock', 'sad piano music', 'energetic electronic')",
        },
        limit: {
          type: 'number',
          description: 'Max results to return (default: 12, max: 100)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'grep_tracks',
    description:
      'Search tracks by specific field for exact matches. Use search_tracks instead for general music searches. This tool is for precise field-specific queries like finding a specific composer or library.',
    input_schema: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: "Search pattern (e.g., genre ID '1103', keyword 'rock', composer name)",
        },
        field: {
          type: 'string',
          enum: [
            'genre',
            'track_title',
            'track_description',
            'composer',
            'library_name',
            'album_title',
            'has_stems',
            'all',
          ],
          description:
            "Which field to search in. Use 'genre' for genre ID searches, 'has_stems' for stems filtering, 'all' to search all text fields.",
        },
        limit: {
          type: 'number',
          description: 'Max results to return (default: 12)',
        },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'get_track_by_id',
    description: 'Get full details for a specific track by its track ID',
    input_schema: {
      type: 'object',
      properties: {
        track_id: {
          type: 'string',
          description: "The track ID (e.g., 'NFL_NFL_0036_01901')",
        },
      },
      required: ['track_id'],
    },
  },
  {
    name: 'get_tracks_by_ids',
    description:
      'Get full details for multiple tracks by their IDs. Use when you have a list of track IDs from prompt_results.csv or audio_similarities.csv.',
    input_schema: {
      type: 'object',
      properties: {
        track_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of track IDs',
        },
        limit: {
          type: 'number',
          description: 'Max results to return (default: 12)',
        },
      },
      required: ['track_ids'],
    },
  },
  {
    name: 'manage_project',
    description:
      'Add or remove tracks from projects, create new projects, or list tracks in a project. Use this tool to manage project track assignments.',
    input_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: [
            'add_track',
            'add_multiple_tracks',
            'remove_track',
            'list_tracks',
            'create_project',
          ],
          description: 'The action to perform',
        },
        project_id: {
          type: 'string',
          description: "The project ID (e.g., 'P012', 'P001')",
        },
        track_id: {
          type: 'string',
          description: 'Single track ID for add_track or remove_track',
        },
        track_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of track IDs for add_multiple_tracks',
        },
        notes: {
          type: 'string',
          description: 'Optional notes about why this track (for add_track)',
        },
        name: {
          type: 'string',
          description: 'Project name (for create_project)',
        },
        description: {
          type: 'string',
          description: 'Project description (for create_project)',
        },
        for_field: {
          type: 'string',
          description:
            "Project type like 'TV Commercial', 'Documentary', etc. (for create_project)",
        },
        keywords: {
          type: 'string',
          description: 'Semicolon-separated keywords (for create_project)',
        },
        deadline: {
          type: 'string',
          description: 'Project deadline in YYYY-MM-DD format (for create_project)',
        },
        collaborators: {
          type: 'string',
          description: 'Semicolon-separated list of collaborators (for create_project)',
        },
      },
      required: ['action'],
    },
  },
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
    messages: messages,
  });

  // Track search results for fallback use
  let lastSearchResults = null;

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

      // Capture search_tracks results for fallback
      if (toolUse.name === 'search_tracks' && result && typeof result === 'object') {
        lastSearchResults = {
          tracks: result.tracks || [],
          total: result.total_count || result.total || 0,
          query: toolUse.input.query,
        };
      }

      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: typeof result === 'string' ? result : JSON.stringify(result),
      });
    }

    // Add assistant message and tool results to conversation
    messages = [
      ...messages,
      { role: 'assistant', content: response.content },
      { role: 'user', content: toolResults },
    ];

    // Continue the conversation
    response = await getClient().messages.create({
      model: model,
      max_tokens: 4096,
      system: systemPrompt,
      tools: tools,
      messages: messages,
    });
  }

  // Extract text response
  const textContent = response.content.find(c => c.type === 'text');
  const reply = textContent?.text || 'No response generated.';

  // Return both reply and search results for fallback use
  return { reply, searchResults: lastSearchResults };
}
