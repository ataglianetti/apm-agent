import express from 'express';
import { chat as claudeChat } from '../services/claude.js';
import { parseFilterQuery, hasFilters } from '../services/filterParser.js';
import { executeFileTool } from '../services/fileToolsDb.js';

const router = express.Router();

// Main chat endpoint
router.post('/chat', async (req, res) => {
  try {
    const { messages } = req.body;

    // Validate request
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({
        error: 'Invalid request format',
        details: 'Messages array is required'
      });
    }

    if (messages.length === 0) {
      return res.status(400).json({
        error: 'Invalid request',
        details: 'Messages array cannot be empty'
      });
    }

    // Get the last user message
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.role !== 'user') {
      return res.status(400).json({
        error: 'Invalid message format',
        details: 'Last message must be from user'
      });
    }

    console.log(`Processing query: ${lastMessage.content}`);

    // Check if this is an @ filter query (bypass Claude for performance)
    if (hasFilters(lastMessage.content)) {
      console.log('Detected @ filter query, handling directly');
      const startTime = Date.now();

      const parsed = parseFilterQuery(lastMessage.content);
      console.log('Parsed filters:', JSON.stringify(parsed, null, 2));

      let results = [];

      if (parsed.filters.length > 0) {
        // Execute search for each filter and intersect results
        for (const filter of parsed.filters) {
          let filterResults;

          // Special handling for genre/tags - need to convert genre name to ID
          if (filter.field === 'genre' || filter.originalField === 'tags') {
            // Load genre taxonomy to map genre names to IDs
            const genreTaxonomy = await executeFileTool('read_csv', {
              filename: 'genre_taxonomy.csv'
            });

            // Search for matching genres (case-insensitive, partial match)
            const searchLower = filter.value.toLowerCase();
            const matchingGenres = genreTaxonomy.filter(g =>
              g.genre_name?.toLowerCase().includes(searchLower)
            );

            console.log(`Found ${matchingGenres.length} matching genres for "${filter.value}":`,
              matchingGenres.map(g => `${g.genre_name} (${g.genre_id})`).join(', '));

            if (matchingGenres.length === 0) {
              // No matching genres, return empty results
              filterResults = [];
            } else {
              // Search for tracks with any of these genre IDs
              filterResults = [];
              for (const genre of matchingGenres) {
                const genreTracks = await executeFileTool('grep_tracks', {
                  pattern: genre.genre_id,
                  field: 'genre',
                  limit: 10000  // High limit to get all matching tracks
                });
                console.log(`Genre ${genre.genre_name} (${genre.genre_id}) returned ${genreTracks.length} tracks`);
                filterResults = filterResults.concat(genreTracks);
              }
              // Remove duplicates
              const seen = new Set();
              filterResults = filterResults.filter(track => {
                if (seen.has(track.id)) return false;
                seen.add(track.id);
                return true;
              });
              console.log(`Total unique tracks across all ${matchingGenres.length} genres: ${filterResults.length}`);
            }
          } else {
            // Regular field search
            filterResults = await executeFileTool('grep_tracks', {
              pattern: filter.value,
              field: filter.field,
              limit: 10000  // High limit to get all matches for intersection
            });
          }

          if (results.length === 0) {
            results = filterResults;
            console.log(`First filter returned ${results.length} results`);
          } else {
            // Intersect results (AND logic)
            const resultIds = new Set(filterResults.map(t => t.id));
            const beforeCount = results.length;
            results = results.filter(t => resultIds.has(t.id));
            console.log(`Intersection: ${beforeCount} results -> ${results.length} results (filter had ${filterResults.length} results)`);
          }
        }

        // If there's additional search text, filter by that too
        if (parsed.searchText) {
          const searchLower = parsed.searchText.toLowerCase();
          results = results.filter(track => {
            return track.track_title?.toLowerCase().includes(searchLower) ||
                   track.track_description?.toLowerCase().includes(searchLower);
          });
        }
      }

      const elapsed = Date.now() - startTime;
      console.log(`Filter query completed in ${elapsed}ms, found ${results.length} results`);

      // Return first 12 results
      const tracks = results.slice(0, 12);

      return res.json({
        type: 'track_results',
        message: `Found tracks matching your filters`,
        tracks: tracks,
        total_count: results.length,
        showing: `1-${tracks.length}`
      });
    }

    // Regular Claude chat
    const startTime = Date.now();
    let reply = await claudeChat(messages);
    const elapsed = Date.now() - startTime;

    console.log(`Response generated in ${elapsed}ms`);

    // Check if the reply has been double-encoded (common issue with JSON responses)
    // This happens when markdown text gets JSON.stringify'd multiple times
    if (typeof reply === 'string' && (reply.includes('\\n') || reply.includes('\\"'))) {
      try {
        // Try to parse as JSON string to unescape it
        const unescaped = JSON.parse(`"${reply}"`);
        reply = unescaped;
      } catch (e) {
        // If parsing fails, use the original reply
        // This is fine - it just means it wasn't double-encoded
      }
    }

    // Try to parse as track results JSON
    let trackResults = null;
    if (typeof reply === 'string') {
      try {
        let trimmed = reply.trim();

        // Strip markdown code fences if present
        if (trimmed.startsWith('```')) {
          trimmed = trimmed.replace(/^```(?:json)?\s*\n?/, '');
          trimmed = trimmed.replace(/\n?```\s*$/, '');
          trimmed = trimmed.trim();
        }

        // Try to find JSON object if it doesn't start with {
        if (!trimmed.startsWith('{')) {
          const jsonMatch = trimmed.match(/\{[\s\S]*"type"\s*:\s*"track_results"[\s\S]*\}/);
          if (jsonMatch) {
            trimmed = jsonMatch[0];
          }
        }

        // Only try to parse if it looks like JSON
        if (trimmed.startsWith('{')) {
          const parsed = JSON.parse(trimmed);
          if (parsed.type === 'track_results' && Array.isArray(parsed.tracks)) {
            trackResults = parsed;
          }
        }
      } catch (e) {
        // Not JSON or not track results, treat as regular text
        console.log('Not valid track results JSON, treating as text');
      }
    }

    // Return structured response if we found track results
    if (trackResults) {
      res.json({
        type: 'track_results',
        message: trackResults.message,
        tracks: trackResults.tracks,
        total_count: trackResults.total_count,
        showing: trackResults.showing
      });
    } else {
      // Return regular text response
      res.json({ reply });
    }

  } catch (error) {
    console.error('Chat error:', error);

    // Handle specific error cases
    if (error.message?.includes('API key')) {
      return res.status(500).json({
        error: 'Configuration error',
        details: 'API key not configured. Please check your .env file.'
      });
    }

    if (error.status === 401) {
      return res.status(500).json({
        error: 'Authentication error',
        details: 'Invalid API key. Please check your .env file.'
      });
    }

    // Generic error response
    res.status(500).json({
      error: 'Failed to process chat message',
      details: process.env.NODE_ENV === 'development' ? error.message : 'An internal error occurred'
    });
  }
});

// Health check endpoint
router.get('/chat/health', (req, res) => {
  res.json({
    status: 'healthy',
    model: process.env.CLAUDE_MODEL || 'claude-3-haiku-20240307',
    hasApiKey: !!process.env.ANTHROPIC_API_KEY
  });
});

export default router;