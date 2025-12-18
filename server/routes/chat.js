import express from 'express';
import { chat as claudeChat } from '../services/claude.js';
import { parseFilterQuery, hasFilters } from '../services/filterParser.js';
import { search as metadataSearch } from '../services/metadataSearch.js';
import { matchRules, applyRules } from '../services/businessRulesEngine.js';
import { searchByTaxonomy, getTracksByFacetIds, searchFacets } from '../services/taxonomySearch.js';
import { enrichTracksWithGenreNames } from '../services/genreMapper.js';

const router = express.Router();

/**
 * Classify query complexity to determine routing
 * @param {string} query - User's search query
 * @returns {string} - 'simple' or 'complex'
 */
function classifyQueryComplexity(query) {
  const lowerQuery = query.toLowerCase();

  // Complex query indicators
  const complexIndicators = [
    // Questions and conversational
    /\?$/,  // Ends with question mark
    /^(what|how|why|when|where|who|can you|could you|would you|show me|tell me|find me)/,

    // Multi-step workflows
    /(and then|after that|also|plus)/,
    /(add to|remove from|create|delete)/,

    // Ambiguous or vague
    /^(something|anything|stuff|things)/,
    /(like that|similar|vibes)/,

    // History/context references
    /(my project|my searches|my downloads|what i|what we)/,
    /(last time|before|previously|history)/,

    // Comparative or analytical
    /(compare|difference|versus|vs|better than)/,
    /(best|top|most|least)/,
  ];

  // Check for complex indicators
  for (const pattern of complexIndicators) {
    if (pattern.test(lowerQuery)) {
      return 'complex';
    }
  }

  // Simple query indicators - straightforward descriptive terms
  const simplePatterns = [
    // Genre + mood combinations
    /^(rock|classical|jazz|electronic|pop|hip hop|country|blues)\s+(upbeat|dark|mellow|energetic|calm)/,

    // Pure descriptive (2-4 words)
    /^[\w\s]{5,30}$/,  // Short, simple text without special chars

    // Use case + mood
    /^(corporate|advertising|commercial|sports|film|trailer)\s+[\w\s]+$/,
  ];

  // Word count heuristic: very short queries (1-2 words) or simple descriptive (3-4 words) = simple
  const wordCount = lowerQuery.trim().split(/\s+/).length;
  if (wordCount >= 1 && wordCount <= 4) {
    // Check if it's purely descriptive (no special characters, no questions)
    if (!/[?!@#$%^&*()_+=\[\]{}|\\:;"'<>,]/.test(lowerQuery)) {
      return 'simple';
    }
  }

  // Default to complex (safe to use Claude)
  return 'complex';
}

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

    // Handle "show more" / pagination requests
    if (/^(show\s+more|more|next\s+page|load\s+more)$/i.test(lastMessage.content.trim())) {
      console.log('Detected pagination request');

      // Find the previous assistant response with track results
      let previousQuery = null;
      let previousOffset = 0;

      for (let i = messages.length - 2; i >= 0; i--) {
        const msg = messages[i];
        if (msg.role === 'assistant' && msg.type === 'track_results') {
          // Extract the showing range to determine next offset
          const showing = msg.showing || '1-12';
          const [, end] = showing.split('-').map(Number);
          previousOffset = end;

          // Find the user query that produced these results
          for (let j = i - 1; j >= 0; j--) {
            if (messages[j].role === 'user') {
              previousQuery = messages[j].content;
              break;
            }
          }
          break;
        }
      }

      if (!previousQuery) {
        return res.json({
          reply: "I don't have a previous search to show more results for. Please start a new search."
        });
      }

      console.log(`Continuing search for "${previousQuery}" from offset ${previousOffset}`);

      // Re-run the previous query with new offset
      const queryComplexity = classifyQueryComplexity(previousQuery);

      if (queryComplexity === 'simple') {
        const startTime = Date.now();
        const matchedRules = matchRules(previousQuery);

        // Extract expanded facets from genre_simplification rules
        const expandedFacets = [];
        for (const rule of matchedRules) {
          if (rule.type === 'genre_simplification' && rule.action?.auto_apply_facets) {
            expandedFacets.push(...rule.action.auto_apply_facets);
          }
        }

        let searchResults;

        // Use same HYBRID logic as main search
        if (expandedFacets.length > 0) {
          console.log(`Pagination: Using HYBRID search with expanded facets: ${expandedFacets.join(', ')}`);

          // Get all results, then paginate
          const allFacets = [];
          for (const facetName of expandedFacets) {
            const matchedFacets = searchFacets(facetName, ['Master Genre', 'Additional Genre']);
            allFacets.push(...matchedFacets);
          }

          const facetIds = allFacets.map(f => f.facet_id);
          const taxonomyResults = getTracksByFacetIds(facetIds, 1000, 0);
          const textResults = await metadataSearch({ text: previousQuery, limit: 1000, offset: 0 });

          // Combine and score using field weights
          const trackScores = new Map();
          const trackMap = new Map();

          for (const track of taxonomyResults.tracks) {
            trackScores.set(track.id, 4.0);
            trackMap.set(track.id, track);
          }

          for (const track of textResults.tracks) {
            const textScore = track._relevance_score || 0.2;
            const existingScore = trackScores.get(track.id) || 0;
            if (existingScore > 0) {
              trackScores.set(track.id, existingScore + textScore);
              const existing = trackMap.get(track.id);
              trackMap.set(track.id, { ...existing, _text_score: textScore });
            } else {
              trackScores.set(track.id, textScore);
              trackMap.set(track.id, track);
            }
          }

          const scoredTracks = Array.from(trackMap.values()).map(track => ({
            ...track,
            _relevance_score: trackScores.get(track.id)
          }));

          scoredTracks.sort((a, b) => b._relevance_score - a._relevance_score);
          const enrichedTracks = enrichTracksWithGenreNames(scoredTracks);

          searchResults = {
            tracks: enrichedTracks,
            total: scoredTracks.length
          };
        } else {
          // Try hybrid taxonomy + text search
          const taxonomyResults = searchByTaxonomy(previousQuery, 1000, 0);

          if (taxonomyResults.total > 0) {
            const textResults = await metadataSearch({ text: previousQuery, limit: 1000, offset: 0 });

            const trackScores = new Map();
            const trackMap = new Map();

            for (const track of taxonomyResults.tracks) {
              trackScores.set(track.id, 4.0);
              trackMap.set(track.id, track);
            }

            for (const track of textResults.tracks) {
              const textScore = track._relevance_score || 0.2;
              const existingScore = trackScores.get(track.id) || 0;
              if (existingScore > 0) {
                trackScores.set(track.id, existingScore + textScore);
                const existing = trackMap.get(track.id);
                trackMap.set(track.id, { ...existing, _text_score: textScore });
              } else {
                trackScores.set(track.id, textScore);
                trackMap.set(track.id, track);
              }
            }

            const scoredTracks = Array.from(trackMap.values()).map(track => ({
              ...track,
              _relevance_score: trackScores.get(track.id)
            }));

            scoredTracks.sort((a, b) => b._relevance_score - a._relevance_score);
            const enrichedTracks = enrichTracksWithGenreNames(scoredTracks);

            searchResults = {
              tracks: enrichedTracks,
              total: scoredTracks.length
            };
          } else {
            // Pure text search
            const searchOptions = {
              text: previousQuery,
              limit: 12,
              offset: previousOffset
            };
            searchResults = await metadataSearch(searchOptions);
          }
        }

        // Paginate the combined results
        const paginatedTracks = searchResults.tracks.slice(previousOffset, previousOffset + 12);

        const enhancedResults = await applyRules(
          paginatedTracks,
          matchedRules,
          previousQuery
        );

        const elapsed = Date.now() - startTime;
        console.log(`Pagination query completed in ${elapsed}ms`);

        return res.json({
          type: 'track_results',
          message: `Showing more results for "${previousQuery}"`,
          tracks: enhancedResults.results,
          total_count: searchResults.total,
          showing: `${previousOffset + 1}-${previousOffset + enhancedResults.results.length}`,
          _meta: {
            appliedRules: enhancedResults.appliedRules,
            scoreAdjustments: enhancedResults.scoreAdjustments
          }
        });
      }

      // For complex queries or @ filters, fall through to normal handling
      // by replacing lastMessage.content with the original query
      lastMessage.content = previousQuery;
    }

    // INTELLIGENT ROUTING:
    // 1. @ filters → Solr (bypass LLM, bypass rules) - fastest path
    // 2. Simple queries → Metadata Search + Business Rules (no LLM) - fast, PM-controlled
    // 3. Complex queries → Claude + Metadata Search + Business Rules - full capabilities

    // Route 1: @ filter queries → Solr via metadataSearch
    if (hasFilters(lastMessage.content)) {
      console.log('Detected @ filter query, routing to Solr');
      const startTime = Date.now();

      const parsed = parseFilterQuery(lastMessage.content);
      console.log('Parsed filters:', JSON.stringify(parsed, null, 2));

      // Convert parsed filters to metadataSearch format
      const facets = [];      // For facet category filters (go to combined_ids)
      const filters = [];     // For metadata field filters (bpm, duration, etc.)

      for (const filter of parsed.filters) {
        if (filter.field.startsWith('facet:')) {
          // Facet category filter → use Solr combined_ids
          const categoryName = filter.field.substring(6); // Remove 'facet:' prefix
          facets.push({ category: categoryName, value: filter.value });
          console.log(`Facet filter: ${categoryName}="${filter.value}"`);
        } else if (filter.field === 'bpm' && filter.parsed?.type === 'range') {
          // BPM range filter
          filters.push({
            field: 'bpm',
            operator: 'range',
            value: { min: filter.parsed.min, max: filter.parsed.max }
          });
        } else if (filter.field === 'bpm' && filter.parsed?.type === 'greater') {
          filters.push({ field: 'bpm', operator: 'greater', value: filter.parsed.value });
        } else if (filter.field === 'bpm' && filter.parsed?.type === 'less') {
          filters.push({ field: 'bpm', operator: 'less', value: filter.parsed.value });
        } else if (filter.field === 'duration' && typeof filter.parsed === 'object') {
          filters.push({
            field: 'duration',
            operator: filter.parsed.type,
            value: filter.parsed.value
          });
        } else {
          // Other metadata field filters
          filters.push({
            field: filter.field,
            operator: filter.operatorType || 'contains',
            value: filter.value
          });
        }
      }

      console.log(`Solr search: ${facets.length} facets, ${filters.length} filters, text="${parsed.searchText}"`);

      // Execute search via Solr
      const searchResults = await metadataSearch({
        facets,
        filters,
        text: parsed.searchText || '',
        limit: 12,
        offset: 0
      });

      // Enrich with genre names
      const enrichedTracks = enrichTracksWithGenreNames(searchResults.tracks);

      const elapsed = Date.now() - startTime;
      console.log(`Filter query completed in ${elapsed}ms via ${searchResults._meta?.engine || 'unknown'}`);

      return res.json({
        type: 'track_results',
        message: `Found tracks matching your filters`,
        tracks: enrichedTracks,
        total_count: searchResults.total,
        showing: `1-${enrichedTracks.length}`,
        _meta: searchResults._meta
      });
    }

    // Route 2: Simple queries (metadata search + business rules, no Claude)
    // Detect simple, unambiguous queries that can be handled directly
    const queryComplexity = classifyQueryComplexity(lastMessage.content);

    if (queryComplexity === 'simple') {
      console.log('Detected simple query, using metadata search + business rules');
      const startTime = Date.now();

      // Match applicable business rules
      const matchedRules = matchRules(lastMessage.content);
      console.log(`Matched ${matchedRules.length} business rules:`, matchedRules.map(r => r.id).join(', '));

      // Extract expanded facets from genre_simplification rules
      const expandedFacets = [];
      for (const rule of matchedRules) {
        if (rule.type === 'genre_simplification' && rule.action?.auto_apply_facets) {
          expandedFacets.push(...rule.action.auto_apply_facets);
        }
      }

      let searchResults;

      // HYBRID SEARCH: Combine taxonomy + text search for best results
      // Tracks matching both taxonomy AND text get highest relevance scores
      // Performance-optimized: Only load enough for scoring top results

      if (expandedFacets.length > 0) {
        // Query contains taxonomy terms from business rules - use hybrid search
        console.log(`Using HYBRID search: taxonomy (${expandedFacets.join(', ')}) + text ("${lastMessage.content}")`);

        // 1. Get taxonomy results (limit to top 1000 for performance)
        const allFacets = [];
        for (const facetName of expandedFacets) {
          const matchedFacets = searchFacets(facetName, ['Master Genre', 'Additional Genre']);
          allFacets.push(...matchedFacets);
        }

        const facetIds = allFacets.map(f => f.facet_id);
        console.log(`Found ${facetIds.length} facet IDs for taxonomy search`);

        // Get top 1000 taxonomy matches for scoring (much faster)
        const taxonomyResults = getTracksByFacetIds(facetIds, 1000, 0);
        console.log(`Taxonomy search: ${taxonomyResults.tracks.length} tracks loaded (${taxonomyResults.total} total)`);

        // 2. Get text search results (limit to top 1000)
        const textSearchOptions = {
          text: lastMessage.content,
          limit: 1000,
          offset: 0
        };
        const textResults = await metadataSearch(textSearchOptions);
        console.log(`Text search: ${textResults.tracks.length} tracks loaded (${textResults.total} total)`);

        // 3. Combine and score using field weights from metadataSearch
        const trackScores = new Map();
        const trackMap = new Map();
        const taxonomyIds = new Set(taxonomyResults.tracks.map(t => t.id));
        const textIds = new Set(textResults.tracks.map(t => t.id));

        // Add taxonomy matches (base score from genre facet weight = 4.0)
        for (const track of taxonomyResults.tracks) {
          // Use genre weight (4.0) as base score for taxonomy matches
          trackScores.set(track.id, 4.0);
          trackMap.set(track.id, track);
        }

        // Add text matches (use their pre-calculated relevance scores from metadataSearch)
        for (const track of textResults.tracks) {
          const textScore = track._relevance_score || 0.2; // Default to track_title weight if no score
          const existingScore = trackScores.get(track.id) || 0;

          if (existingScore > 0) {
            // Track matches BOTH taxonomy AND text - combine scores
            trackScores.set(track.id, existingScore + textScore);
            // Keep the track from taxonomy (it has genre info) but preserve text score
            const existing = trackMap.get(track.id);
            trackMap.set(track.id, {
              ...existing,
              _text_score: textScore
            });
          } else {
            // Text-only match - use its weighted score
            trackScores.set(track.id, textScore);
            trackMap.set(track.id, track);
          }
        }

        // 4. Convert to array and sort by score
        const scoredTracks = Array.from(trackMap.values()).map(track => ({
          ...track,
          _relevance_score: trackScores.get(track.id),
          _score_breakdown: {
            ...track._score_breakdown,
            taxonomy_match: taxonomyIds.has(track.id) ? 4.0 : 0,
            text_score: track._text_score || (textIds.has(track.id) ? track._relevance_score : 0),
            combined: taxonomyIds.has(track.id) && textIds.has(track.id)
          }
        }));

        scoredTracks.sort((a, b) => b._relevance_score - a._relevance_score);

        // 5. Enrich with genre names
        const enrichedTracks = enrichTracksWithGenreNames(scoredTracks);

        searchResults = {
          tracks: enrichedTracks,
          total: taxonomyResults.total // Use taxonomy total as best estimate
        };

        console.log(`Hybrid search: ${searchResults.tracks.length} scored tracks (estimated ${searchResults.total} total)`);
      } else {
        // No taxonomy expansion - try general taxonomy search + text search
        const taxonomyResults = searchByTaxonomy(lastMessage.content, 1000, 0);

        if (taxonomyResults.total > 0) {
          // Found taxonomy matches - combine with text search
          console.log(`Found ${taxonomyResults.total} tracks via taxonomy, combining with text search`);

          const textSearchOptions = {
            text: lastMessage.content,
            limit: 1000,
            offset: 0
          };
          const textResults = await metadataSearch(textSearchOptions);

          // Combine and score using field weights
          const trackScores = new Map();
          const trackMap = new Map();
          const taxonomyIds = new Set(taxonomyResults.tracks.map(t => t.id));
          const textIds = new Set(textResults.tracks.map(t => t.id));

          for (const track of taxonomyResults.tracks) {
            trackScores.set(track.id, 4.0); // Genre weight
            trackMap.set(track.id, track);
          }

          for (const track of textResults.tracks) {
            const textScore = track._relevance_score || 0.2;
            const existingScore = trackScores.get(track.id) || 0;

            if (existingScore > 0) {
              trackScores.set(track.id, existingScore + textScore);
              const existing = trackMap.get(track.id);
              trackMap.set(track.id, { ...existing, _text_score: textScore });
            } else {
              trackScores.set(track.id, textScore);
              trackMap.set(track.id, track);
            }
          }

          const scoredTracks = Array.from(trackMap.values()).map(track => ({
            ...track,
            _relevance_score: trackScores.get(track.id),
            _score_breakdown: {
              ...track._score_breakdown,
              taxonomy_match: taxonomyIds.has(track.id) ? 4.0 : 0,
              text_score: track._text_score || (textIds.has(track.id) ? track._relevance_score : 0),
              combined: taxonomyIds.has(track.id) && textIds.has(track.id)
            }
          }));

          scoredTracks.sort((a, b) => b._relevance_score - a._relevance_score);

          const enrichedTracks = enrichTracksWithGenreNames(scoredTracks);

          searchResults = {
            tracks: enrichedTracks,
            total: scoredTracks.length,
            matchedFacets: taxonomyResults.matchedFacets
          };
        } else {
          // No taxonomy matches - pure text search
          console.log('No taxonomy matches, using pure text search');
          const searchOptions = {
            text: lastMessage.content,
            limit: 12,
            offset: 0
          };

          searchResults = await metadataSearch(searchOptions);
        }
      }

      console.log(`Search returned ${searchResults.tracks.length} tracks (total: ${searchResults.total})`);

      // Apply business rules to results
      const enhancedResults = await applyRules(
        searchResults.tracks,
        matchedRules,
        lastMessage.content
      );

      const elapsed = Date.now() - startTime;
      console.log(`Simple query completed in ${elapsed}ms with ${enhancedResults.appliedRules.length} rules applied`);

      // Log transparency data (for potential UI display)
      if (enhancedResults.appliedRules.length > 0) {
        console.log('Applied rules:', enhancedResults.appliedRules);
        console.log('Score adjustments:', enhancedResults.scoreAdjustments);
      }

      return res.json({
        type: 'track_results',
        message: `Found tracks matching "${lastMessage.content}"`,
        tracks: enhancedResults.results.slice(0, 12),
        total_count: searchResults.total, // Use original total, not enhanced results length
        showing: `1-${Math.min(12, enhancedResults.results.length)}`,
        // Include transparency metadata (optional - for future UI enhancement)
        _meta: {
          appliedRules: enhancedResults.appliedRules,
          scoreAdjustments: enhancedResults.scoreAdjustments.slice(0, 12)
        }
      });
    }

    // Route 3: Complex queries (Claude + metadata search + business rules)
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