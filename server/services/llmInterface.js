/**
 * LLM Interface
 * Provides a swappable interface for different LLM providers
 * Supports Claude, OpenAI, and Mock implementations
 */

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Base LLM Interface
 */
class LLMInterface {
  constructor(provider = 'mock') {
    this.provider = provider.toLowerCase();
    this.initializeProvider();
  }

  initializeProvider() {
    switch(this.provider) {
      case 'claude':
        this.adapter = new ClaudeAdapter();
        break;
      case 'openai':
        this.adapter = new OpenAIAdapter();
        break;
      case 'mock':
      default:
        this.adapter = new MockAdapter();
        break;
    }
  }

  /**
   * Set the LLM provider
   */
  setProvider(provider) {
    this.provider = provider.toLowerCase();
    this.initializeProvider();
  }

  /**
   * Interpret user query to determine intent and extract parameters
   * @param {string} query - User's natural language query
   * @param {Array} messages - Conversation history
   * @returns {Object} Structured intent object
   */
  async interpretQuery(query, messages = []) {
    const startTime = Date.now();
    const result = await this.adapter.interpret(query, messages);
    result.timing = Date.now() - startTime;
    result.provider = this.provider;
    return result;
  }

  /**
   * Format search results into conversational response
   * @param {Array} results - Search results
   * @param {Object} interpretation - Original interpretation
   * @param {Object} searchMetadata - Search metadata
   * @returns {Object} Formatted response
   */
  async formatResponse(results, interpretation, searchMetadata) {
    const startTime = Date.now();
    const result = await this.adapter.format(results, { interpretation, searchMetadata });
    result.timing = Date.now() - startTime;
    result.provider = this.provider;
    return result;
  }

  /**
   * Get current provider name
   */
  getProvider() {
    return this.provider;
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      status: 'healthy',
      provider: this.provider,
      adapter: this.adapter ? this.adapter.constructor.name : 'none'
    };
  }
}

/**
 * Claude Adapter
 */
class ClaudeAdapter {
  constructor() {
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });

    // Load reduced system prompt (optimized version)
    this.systemPrompt = this.loadOptimizedPrompt();
  }

  loadOptimizedPrompt() {
    // Load a smaller, optimized version of CLAUDE.md
    // For now, we'll use a simplified prompt
    return `You are an AI music search assistant. Your role is to:
1. Interpret user queries to determine search intent
2. Format search results conversationally

When interpreting queries, identify:
- Search mode: metadata (genre/composer/etc.), prompt (descriptive), similarity (reference), or hybrid
- Specific parameters: genre codes, composer names, BPM ranges, mood descriptors, etc.
- @ field overrides: @composer:name, @bpm:120, @genre:rock, etc.

Return structured JSON for interpretation.
Be concise and helpful in formatting responses.`;
  }

  async interpret(query, messages = []) {
    try {
      // Check for @ field overrides first
      if (query.includes('@')) {
        return this.parseFieldOverrides(query);
      }

      const message = await this.client.messages.create({
        model: 'claude-3-haiku-20240307', // Fast model for interpretation
        max_tokens: 500,
        system: this.systemPrompt,
        messages: [
          {
            role: 'user',
            content: `Interpret this music search query and return a JSON object with the search intent:
Query: "${query}"

Return JSON with these fields:
- mode: "metadata" | "prompt" | "similarity" | "hybrid"
- genre: genre code if applicable
- composer: composer name if applicable
- library: library name if applicable
- bpm: BPM value or range if applicable
- mood: mood descriptors if applicable
- prompt: full descriptive prompt if mode is "prompt"
- reference: URL or track ID if mode is "similarity"
- filters: any additional filters

Example response:
{"mode": "hybrid", "genre": "rock", "mood": ["uplifting", "energetic"], "bpm": {"min": 120, "max": 140}}`
          }
        ]
      });

      // Parse Claude's response
      const content = message.content[0].text;
      try {
        return JSON.parse(content);
      } catch {
        // If not valid JSON, extract what we can
        return this.extractIntentFromText(content, query);
      }
    } catch (error) {
      console.error('Claude interpretation error:', error);
      // Fallback to simple parsing
      return this.simpleInterpret(query);
    }
  }

  async format(results, context) {
    try {
      const message = await this.client.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1000,
        system: this.systemPrompt,
        messages: [
          {
            role: 'user',
            content: `Format these search results conversationally for the user:

Results: ${JSON.stringify(results.slice(0, 3))} (showing first 3 of ${results.length})

User context:
- Previous downloads: ${context.downloadCount || 0}
- Active project: ${context.activeProject || 'None'}
- Preferences: ${JSON.stringify(context.preferences || {})}

Provide a brief, helpful response mentioning:
1. How many tracks were found
2. Key characteristics of top results
3. Any relevant user history (if tracks were downloaded before, etc.)

Keep response under 150 words.`
          }
        ]
      });

      return {
        text: message.content[0].text,
        formatted: true
      };
    } catch (error) {
      console.error('Claude formatting error:', error);
      return this.simpleFormat(results, context);
    }
  }

  parseFieldOverrides(query) {
    const intent = { mode: 'metadata', fields: {} };
    const fields = query.match(/@\w+[-\w]*:[^@]+/g) || [];

    fields.forEach(field => {
      const [key, ...valueParts] = field.substring(1).split(':');
      const value = valueParts.join(':').trim();

      switch(key) {
        case 'track-title':
        case 'title':
          intent.fields.title = value;
          break;
        case 'composer':
          intent.fields.composer = value;
          break;
        case 'genre':
        case 'tags':
          intent.fields.genre = value;
          break;
        case 'bpm':
          intent.fields.bpm = value;
          break;
        case 'library':
          intent.fields.library = value;
          break;
        // Add more fields as needed
      }
    });

    if (Object.keys(intent.fields).length > 1) {
      intent.mode = 'hybrid';
    }

    return intent;
  }

  extractIntentFromText(text, query) {
    // Simple extraction from text response
    const intent = { mode: 'prompt', prompt: query };

    if (text.includes('metadata') || text.includes('genre')) {
      intent.mode = 'metadata';
    } else if (text.includes('similarity') || text.includes('reference')) {
      intent.mode = 'similarity';
    } else if (text.includes('hybrid')) {
      intent.mode = 'hybrid';
    }

    return intent;
  }

  simpleInterpret(query) {
    // Fallback simple interpretation
    const lower = query.toLowerCase();
    const intent = { mode: 'prompt', prompt: query };

    // Check for URLs
    if (lower.includes('http') || lower.includes('www')) {
      intent.mode = 'similarity';
      intent.reference = query;
    }
    // Check for genre keywords
    else if (lower.match(/\b(rock|jazz|classical|hip hop|electronic|pop|country)\b/)) {
      intent.mode = 'metadata';
      intent.genre = lower.match(/\b(rock|jazz|classical|hip hop|electronic|pop|country)\b/)[0];
    }
    // Check for composer mentions
    else if (lower.includes('by ') || lower.includes('composer')) {
      intent.mode = 'metadata';
      const match = lower.match(/(?:by |composer[: ]+)([a-z ]+)/);
      if (match) intent.composer = match[1].trim();
    }

    return intent;
  }

  simpleFormat(results, context) {
    let text = `Found ${results.length} tracks`;

    if (results.length > 0) {
      const topTracks = results.slice(0, 3).map(t => t.track_title).join(', ');
      text += `. Top results: ${topTracks}`;
    }

    if (context.downloadCount > 0) {
      text += `. You've previously downloaded ${context.downloadCount} similar tracks.`;
    }

    return { text, formatted: true };
  }
}

/**
 * OpenAI Adapter
 */
class OpenAIAdapter {
  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    this.systemPrompt = `You are a music search assistant. Interpret queries to identify search intent and format results conversationally.
For interpretation, return JSON with: mode, genre, composer, bpm, mood, prompt, reference, filters.
For formatting, be concise and helpful.`;
  }

  async interpret(query, messages = []) {
    try {
      // Check for @ field overrides first
      if (query.includes('@')) {
        return this.parseFieldOverrides(query);
      }

      const completion = await this.client.chat.completions.create({
        model: 'gpt-3.5-turbo', // Fast and cheap
        messages: [
          { role: 'system', content: this.systemPrompt },
          {
            role: 'user',
            content: `Interpret this music search query: "${query}"
Return JSON with search intent (mode: metadata/prompt/similarity/hybrid) and extracted parameters.`
          }
        ],
        max_tokens: 200,
        temperature: 0.3
      });

      const content = completion.choices[0].message.content;
      try {
        return JSON.parse(content);
      } catch {
        return this.simpleInterpret(query);
      }
    } catch (error) {
      console.error('OpenAI interpretation error:', error);
      return this.simpleInterpret(query);
    }
  }

  async format(results, context) {
    try {
      const completion = await this.client.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: this.systemPrompt },
          {
            role: 'user',
            content: `Format these ${results.length} music search results conversationally.
Top tracks: ${results.slice(0, 3).map(t => t.track_title).join(', ')}
User has downloaded ${context.downloadCount || 0} tracks before.
Keep response under 100 words.`
          }
        ],
        max_tokens: 150,
        temperature: 0.7
      });

      return {
        text: completion.choices[0].message.content,
        formatted: true
      };
    } catch (error) {
      console.error('OpenAI formatting error:', error);
      return this.simpleFormat(results, context);
    }
  }

  parseFieldOverrides(query) {
    // Same as Claude adapter
    const intent = { mode: 'metadata', fields: {} };
    const fields = query.match(/@\w+[-\w]*:[^@]+/g) || [];

    fields.forEach(field => {
      const [key, ...valueParts] = field.substring(1).split(':');
      const value = valueParts.join(':').trim();
      intent.fields[key] = value;
    });

    if (Object.keys(intent.fields).length > 1) {
      intent.mode = 'hybrid';
    }

    return intent;
  }

  simpleInterpret(query) {
    // Fallback - same as Claude
    const lower = query.toLowerCase();
    const intent = { mode: 'prompt', prompt: query };

    if (lower.includes('http') || lower.includes('www')) {
      intent.mode = 'similarity';
      intent.reference = query;
    } else if (lower.match(/\b(rock|jazz|classical|hip hop|electronic|pop|country)\b/)) {
      intent.mode = 'metadata';
      intent.genre = lower.match(/\b(rock|jazz|classical|hip hop|electronic|pop|country)\b/)[0];
    }

    return intent;
  }

  simpleFormat(results, context) {
    let text = `Found ${results.length} tracks`;

    if (results.length > 0) {
      text += `. Top results include "${results[0].track_title}"`;
    }

    return { text, formatted: true };
  }
}

/**
 * Mock Adapter - Instant responses for demos
 */
class MockAdapter {
  constructor() {
    // Load genre list for pattern matching
    this.genres = this.loadGenres();
  }

  loadGenres() {
    // Common genre patterns
    return [
      'rock', 'jazz', 'classical', 'hip hop', 'electronic', 'pop', 'country',
      'blues', 'folk', 'metal', 'punk', 'reggae', 'soul', 'funk', 'disco',
      'house', 'techno', 'dubstep', 'trap', 'ambient', 'orchestral'
    ];
  }

  async interpret(query, messages = []) {
    const lower = query.toLowerCase();

    // Check for conversational queries
    if (lower.match(/^(hi|hello|hey|thanks|thank you|bye|goodbye)$/)) {
      return {
        type: 'conversation',
        response: 'Hello! How can I help you find music today?'
      };
    }

    // Check for @ field overrides
    if (query.includes('@')) {
      const parsed = this.parseFieldOverrides(query);
      return {
        searchMode: parsed.mode,
        searchParams: {
          filters: Object.entries(parsed.fields).map(([field, value]) => ({
            field, value, operator: ':'
          }))
        }
      };
    }

    // Check for URLs (similarity search)
    if (lower.includes('http') || lower.includes('www') || lower.includes('.com')) {
      return {
        searchMode: 'similarity',
        searchParams: { reference: query }
      };
    }

    // Check for "similar to" or "like" phrases
    if (lower.includes('similar to') || lower.includes('like')) {
      const match = lower.match(/(?:similar to|like) (.+)/);
      return {
        searchMode: 'similarity',
        searchParams: { reference: match ? match[1].trim() : query }
      };
    }

    // Check for genre mentions
    const genreMatch = this.genres.find(g => lower.includes(g));
    if (genreMatch) {
      const searchParams = { filters: [] };

      // Map genre to a mock genre code
      const genreCodes = {
        'rock': '1322',
        'jazz': '1215',
        'classical': '1110',
        'hip hop': '1206',
        'electronic': '1154',
        'pop': '1301'
      };

      searchParams.filters.push({
        field: 'genre',
        value: genreCodes[genreMatch] || '1322',
        operator: '='
      });

      // Check for additional descriptors
      const moods = [];
      if (lower.includes('uplifting') || lower.includes('happy')) moods.push('uplifting');
      if (lower.includes('dark') || lower.includes('moody')) moods.push('dark');
      if (lower.includes('energetic') || lower.includes('high energy')) moods.push('energetic');
      if (lower.includes('calm') || lower.includes('peaceful')) moods.push('calm');

      if (moods.length > 0) {
        searchParams.prompt = moods.join(' ');
        return { searchMode: 'hybrid', searchParams };
      }

      return { searchMode: 'metadata', searchParams };
    }

    // Check for BPM mentions
    const bpmMatch = lower.match(/(\d+)\s*bpm/);
    if (bpmMatch) {
      return {
        searchMode: 'metadata',
        searchParams: {
          filters: [{
            field: 'bpm',
            value: parseInt(bpmMatch[1]),
            operator: '='
          }]
        }
      };
    }

    // Check for composer mentions
    if (lower.includes(' by ') || lower.includes('composer')) {
      const match = lower.match(/(?:by |composer[: ]+)([a-z ]+)/);
      if (match) {
        return {
          searchMode: 'metadata',
          searchParams: {
            filters: [{
              field: 'composer',
              value: match[1].trim(),
              operator: ':'
            }]
          }
        };
      }
    }

    // Default to prompt search
    return {
      searchMode: 'prompt',
      searchParams: { prompt: query }
    };
  }

  async format(results, context) {
    const count = results.length;
    let text = '';

    if (count === 0) {
      text = 'No tracks found matching your criteria.';
    } else if (count === 1) {
      text = `Found 1 track: "${results[0].track_title}"`;
    } else {
      text = `Found ${count} tracks. `;

      // Mention top results
      if (count <= 3) {
        const titles = results.map(t => `"${t.track_title}"`).join(', ');
        text += `Results: ${titles}`;
      } else {
        const topThree = results.slice(0, 3).map(t => `"${t.track_title}"`).join(', ');
        text += `Top results include: ${topThree}`;
      }
    }

    // Add context if available
    if (context.downloadCount > 0) {
      text += ` Note: You've previously downloaded ${context.downloadCount} track${context.downloadCount > 1 ? 's' : ''} from similar searches.`;
    }

    if (context.activeProject) {
      text += ` These tracks would work well for your "${context.activeProject}" project.`;
    }

    return {
      text,
      formatted: true
    };
  }

  parseFieldOverrides(query) {
    const intent = { mode: 'metadata', fields: {} };
    const fields = query.match(/@\w+[-\w]*:[^@]+/g) || [];

    fields.forEach(field => {
      const [key, ...valueParts] = field.substring(1).split(':');
      const value = valueParts.join(':').trim();

      switch(key) {
        case 'track-title':
        case 'title':
          intent.fields.title = value;
          break;
        case 'composer':
          intent.fields.composer = value;
          break;
        case 'library':
          intent.fields.library = value;
          break;
        case 'album':
          intent.fields.album = value;
          break;
        case 'genre':
        case 'tags':
          intent.fields.genre = value;
          break;
        case 'bpm':
          // Handle range
          if (value.includes('-')) {
            const [min, max] = value.split('-').map(v => parseInt(v));
            intent.fields.bpm = { min, max };
          } else {
            intent.fields.bpm = parseInt(value);
          }
          break;
        case 'duration':
          intent.fields.duration = value;
          break;
        case 'stems':
          intent.fields.stems = value.toLowerCase() === 'true';
          break;
        case 'year':
          intent.fields.year = value;
          break;
        case 'description':
          intent.fields.description = value;
          break;
      }
    });

    // If multiple fields, treat as hybrid
    if (Object.keys(intent.fields).length > 1) {
      intent.mode = 'hybrid';
    }

    return intent;
  }
}

export default LLMInterface;