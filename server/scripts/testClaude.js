#!/usr/bin/env node
/**
 * Terminal script to test Claude directly with the chat-system-prompt.md
 *
 * Usage:
 *   node server/scripts/testClaude.js "your query here"
 *   node server/scripts/testClaude.js --interactive
 *
 * Environment:
 *   ANTHROPIC_API_KEY - Required
 *   CLAUDE_MODEL - Optional (default: claude-3-haiku-20240307)
 */

import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';
import { executeFileTool } from '../services/fileToolsDb.js';
import { executeProjectTool } from '../services/projectTools.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load environment variables
import dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '../../.env') });

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
};

function log(color, label, message) {
  console.log(`${color}${label}${colors.reset} ${message}`);
}

// Load the chat system prompt
function loadSystemPrompt() {
  const promptPath = path.join(__dirname, '../config/chat-system-prompt.md');
  return fs.readFileSync(promptPath, 'utf-8');
}

// Get model from environment
function getModel() {
  return process.env.CLAUDE_MODEL || 'claude-3-haiku-20240307';
}

// Tool definitions (same as claude.js)
const tools = [
  {
    name: 'read_csv',
    description: 'Read a CSV file from the data directory.',
    input_schema: {
      type: 'object',
      properties: {
        filename: { type: 'string', description: 'Name of the CSV file' },
        limit: { type: 'number', description: 'Optional: limit number of rows' },
      },
      required: ['filename'],
    },
  },
  {
    name: 'grep_tracks',
    description: 'Search tracks for matching patterns.',
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Search pattern' },
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
        },
        limit: { type: 'number', description: 'Max results (default: 12)' },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'get_track_by_id',
    description: 'Get full details for a specific track.',
    input_schema: {
      type: 'object',
      properties: {
        track_id: { type: 'string', description: 'The track ID' },
      },
      required: ['track_id'],
    },
  },
  {
    name: 'get_tracks_by_ids',
    description: 'Get details for multiple tracks by their IDs.',
    input_schema: {
      type: 'object',
      properties: {
        track_ids: { type: 'array', items: { type: 'string' } },
        limit: { type: 'number', description: 'Max results (default: 12)' },
      },
      required: ['track_ids'],
    },
  },
  {
    name: 'manage_project',
    description: 'Manage user projects and track assignments.',
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
        },
        project_id: { type: 'string' },
        track_id: { type: 'string' },
        track_ids: { type: 'array', items: { type: 'string' } },
        notes: { type: 'string' },
        name: { type: 'string' },
        description: { type: 'string' },
        for_field: { type: 'string' },
      },
      required: ['action'],
    },
  },
];

async function chat(client, messages, systemPrompt) {
  const model = getModel();
  log(colors.dim, '[model]', model);

  let response = await client.messages.create({
    model: model,
    max_tokens: 4096,
    system: systemPrompt,
    tools: tools,
    messages: messages,
  });

  // Tool use loop
  while (response.stop_reason === 'tool_use') {
    const toolUses = response.content.filter(c => c.type === 'tool_use');

    const toolResults = [];
    for (const toolUse of toolUses) {
      log(colors.yellow, '[tool]', `${toolUse.name}(${JSON.stringify(toolUse.input)})`);

      let result;
      if (toolUse.name === 'manage_project') {
        result = await executeProjectTool(toolUse.input.action, toolUse.input);
      } else {
        result = await executeFileTool(toolUse.name, toolUse.input);
      }

      const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
      log(
        colors.dim,
        '[result]',
        resultStr.substring(0, 200) + (resultStr.length > 200 ? '...' : '')
      );

      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: resultStr,
      });
    }

    messages = [
      ...messages,
      { role: 'assistant', content: response.content },
      { role: 'user', content: toolResults },
    ];

    response = await client.messages.create({
      model: model,
      max_tokens: 4096,
      system: systemPrompt,
      tools: tools,
      messages: messages,
    });
  }

  const textContent = response.content.find(c => c.type === 'text');
  return textContent?.text || 'No response generated.';
}

async function runInteractive(client, systemPrompt) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const conversationHistory = [];

  console.log(`\n${colors.bright}APM Music Search Assistant - Interactive Mode${colors.reset}`);
  console.log(`${colors.dim}Model: ${getModel()}${colors.reset}`);
  console.log(
    `${colors.dim}Type 'exit' or 'quit' to end, 'clear' to reset conversation${colors.reset}\n`
  );

  const prompt = () => {
    rl.question(`${colors.cyan}You:${colors.reset} `, async input => {
      const trimmed = input.trim();

      if (!trimmed) {
        prompt();
        return;
      }

      if (trimmed === 'exit' || trimmed === 'quit') {
        console.log('\nGoodbye!');
        rl.close();
        process.exit(0);
      }

      if (trimmed === 'clear') {
        conversationHistory.length = 0;
        console.log(`${colors.dim}Conversation cleared.${colors.reset}\n`);
        prompt();
        return;
      }

      conversationHistory.push({ role: 'user', content: trimmed });

      try {
        const startTime = Date.now();
        const response = await chat(client, conversationHistory, systemPrompt);
        const elapsed = Date.now() - startTime;

        conversationHistory.push({ role: 'assistant', content: response });

        console.log(`\n${colors.green}Assistant:${colors.reset} ${response}`);
        console.log(`${colors.dim}(${elapsed}ms)${colors.reset}\n`);
      } catch (error) {
        console.error(`${colors.yellow}Error:${colors.reset} ${error.message}\n`);
      }

      prompt();
    });
  };

  prompt();
}

async function runSingleQuery(client, systemPrompt, query) {
  console.log(`\n${colors.cyan}Query:${colors.reset} ${query}\n`);

  const messages = [{ role: 'user', content: query }];

  const startTime = Date.now();
  const response = await chat(client, messages, systemPrompt);
  const elapsed = Date.now() - startTime;

  console.log(`\n${colors.green}Response:${colors.reset}\n${response}`);
  console.log(`\n${colors.dim}(${elapsed}ms)${colors.reset}`);
}

async function main() {
  // Check for API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY environment variable is required');
    console.error('Set it in .env file or export ANTHROPIC_API_KEY=sk-ant-...');
    process.exit(1);
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const systemPrompt = loadSystemPrompt();

  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--interactive' || args[0] === '-i') {
    await runInteractive(client, systemPrompt);
  } else {
    const query = args.join(' ');
    await runSingleQuery(client, systemPrompt, query);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
