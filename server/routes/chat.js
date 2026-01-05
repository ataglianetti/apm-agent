import express from 'express';
import { chat as claudeChat } from '../services/claude.js';
import { parseFilterQuery, hasFilters } from '../services/filterParser.js';
import { search as metadataSearch } from '../services/metadataSearch.js';
import { matchRules, applyRules } from '../services/businessRulesEngine.js';
// searchFacets available from '../services/taxonomySearch.js' if needed
import { enrichTracksWithGenreNames } from '../services/genreMapper.js';
import { getLLMMode, getTaxonomyParserEnabled } from './settings.js';
import {
  enhanceTracksMetadata,
  enrichTracksWithFullVersions,
} from '../services/metadataEnhancer.js';
import { parseQueryLocal } from '../services/queryToTaxonomy.js';

const router = express.Router();

/**
 * Format number with commas (e.g., 70306 → "70,306")
 */
function formatNumber(num) {
  return num?.toLocaleString() || '0';
}

/**
 * Build search results message with title and version counts
 * @param {string} query - The search query
 * @param {number} titles - Unique song count (ngroups)
 * @param {number} versions - Total track count (matches)
 */
function buildResultsMessage(query, titles, versions) {
  const titlesStr = formatNumber(titles);
  const versionsStr = formatNumber(versions);
  return `Found ${titlesStr} titles and ${versionsStr} versions matching "${query}"`;
}

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
    /\?$/, // Ends with question mark
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

  // Word count heuristic: very short queries (1-4 words) = simple
  // Longer descriptive queries (5+ words) go to Claude for interpretation
  // e.g., "high speed chase through a neon city scape" needs LLM to understand vibes
  const wordCount = lowerQuery.trim().split(/\s+/).length;
  if (wordCount >= 1 && wordCount <= 4) {
    // Check if it's purely descriptive (no special characters, no questions)
    if (!/[?!@#$%^&*()_+=[\]{}|\\:;"'<>,]/.test(lowerQuery)) {
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
        details: 'Messages array is required',
      });
    }

    if (messages.length === 0) {
      return res.status(400).json({
        error: 'Invalid request',
        details: 'Messages array cannot be empty',
      });
    }

    // Get the last user message
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.role !== 'user') {
      return res.status(400).json({
        error: 'Invalid message format',
        details: 'Last message must be from user',
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
          reply:
            "I don't have a previous search to show more results for. Please start a new search.",
        });
      }

      console.log(`Continuing search for "${previousQuery}" from offset ${previousOffset}`);

      // Re-run the previous query with new offset
      const queryComplexity = classifyQueryComplexity(previousQuery);

      if (queryComplexity === 'simple') {
        const startTime = Date.now();
        const matchedRules = matchRules(previousQuery);

        // Use unified Solr search with pagination
        console.log(
          `Pagination: Using Solr search for "${previousQuery}" offset ${previousOffset}`
        );

        const searchOptions = {
          text: previousQuery,
          limit: 12,
          offset: previousOffset,
        };

        const searchResults = await metadataSearch(searchOptions);
        const enrichedTracks = enrichTracksWithGenreNames(searchResults.tracks);

        const enhancedResults = await applyRules(enrichedTracks, matchedRules, previousQuery);

        const elapsed = Date.now() - startTime;
        console.log(`Pagination query completed in ${elapsed}ms`);

        // Enrich tracks with full version data
        const tracksWithVersions = enrichTracksWithFullVersions(enhancedResults.results);

        return res.json({
          type: 'track_results',
          message: buildResultsMessage(
            previousQuery,
            searchResults.total,
            searchResults.totalVersions
          ),
          tracks: tracksWithVersions,
          total_count: searchResults.total,
          total_versions: searchResults.totalVersions,
          showing: `${previousOffset + 1}-${previousOffset + enhancedResults.results.length}`,
          _meta: {
            appliedRules: enhancedResults.appliedRules,
            scoreAdjustments: enhancedResults.scoreAdjustments,
          },
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
      const facets = []; // For facet category filters (go to combined_ids)
      const filters = []; // For metadata field filters (bpm, duration, etc.)

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
            value: { min: filter.parsed.min, max: filter.parsed.max },
          });
        } else if (filter.field === 'bpm' && filter.parsed?.type === 'greater') {
          filters.push({ field: 'bpm', operator: 'greater', value: filter.parsed.value });
        } else if (filter.field === 'bpm' && filter.parsed?.type === 'less') {
          filters.push({ field: 'bpm', operator: 'less', value: filter.parsed.value });
        } else if (filter.field === 'duration' && typeof filter.parsed === 'object') {
          filters.push({
            field: 'duration',
            operator: filter.parsed.type,
            value: filter.parsed.value,
          });
        } else {
          // Other metadata field filters
          filters.push({
            field: filter.field,
            operator: filter.operatorType || 'contains',
            value: filter.value,
          });
        }
      }

      console.log(
        `Solr search: ${facets.length} facets, ${filters.length} filters, text="${parsed.searchText}"`
      );

      // Execute search via Solr
      const searchResults = await metadataSearch({
        facets,
        filters,
        text: parsed.searchText || '',
        limit: 12,
        offset: 0,
      });

      // Enrich with genre names
      const enrichedTracks = enrichTracksWithGenreNames(searchResults.tracks);

      // Enrich tracks with full version data
      const tracksWithVersions = enrichTracksWithFullVersions(enrichedTracks);

      const elapsed = Date.now() - startTime;
      console.log(
        `Filter query completed in ${elapsed}ms via ${searchResults._meta?.engine || 'unknown'}`
      );

      return res.json({
        type: 'track_results',
        message: buildResultsMessage(
          lastMessage.content,
          searchResults.total,
          searchResults.totalVersions
        ),
        tracks: tracksWithVersions,
        total_count: searchResults.total,
        total_versions: searchResults.totalVersions,
        showing: `1-${enrichedTracks.length}`,
        _meta: searchResults._meta,
      });
    }

    // Route 2: Simple queries (metadata search + business rules, no Claude)
    // Detect simple, unambiguous queries that can be handled directly
    const queryComplexity = classifyQueryComplexity(lastMessage.content);

    // LLM_MODE toggle: 'primary' sends ALL queries to Claude, 'fallback' (default) uses 3-tier routing
    const llmMode = getLLMMode();

    if (llmMode === 'primary') {
      console.log(
        `LLM_MODE=primary: Routing ALL queries to Claude (bypassing simple query optimization)`
      );
    }

    if (queryComplexity === 'simple' && llmMode !== 'primary') {
      console.log('Detected simple query, using metadata search + business rules');
      const startTime = Date.now();

      // TAXONOMY PARSING: Parse query into structured facet filters
      // This maps terms like "solo jazz piano" to actual facet IDs
      const taxonomyEnabled = getTaxonomyParserEnabled();
      let taxonomyResult = {
        mappings: [],
        filters: {},
        confidence: 0,
        remainingText: lastMessage.content,
      };

      if (taxonomyEnabled) {
        taxonomyResult = parseQueryLocal(lastMessage.content);
        console.log(
          `Taxonomy parsing: ${taxonomyResult.mappings.length} terms mapped, confidence: ${taxonomyResult.confidence}`
        );

        if (taxonomyResult.mappings.length > 0) {
          console.log(
            'Taxonomy mappings:',
            taxonomyResult.mappings.map(m => `${m.term}→${m.category}/${m.id}`).join(', ')
          );
        }
      } else {
        console.log('Taxonomy parser DISABLED - using raw text query only');
      }

      // Match applicable business rules
      const matchedRules = matchRules(lastMessage.content);
      console.log(
        `Matched ${matchedRules.length} business rules:`,
        matchedRules.map(r => r.id).join(', ')
      );

      // Extract expanded facets from genre_simplification rules
      const expandedFacets = [];
      for (const rule of matchedRules) {
        if (rule.type === 'genre_simplification' && rule.action?.auto_apply_facets) {
          expandedFacets.push(...rule.action.auto_apply_facets);
        }
      }

      let searchResults;

      // HYBRID SEARCH STRATEGY:
      // 1. Use taxonomy-parsed facets for precise filtering (is_a, Instruments, etc.)
      // 2. Use remaining text for Solr text search with field weights
      // 3. Combine for best results

      // Build facet filters from taxonomy parsing
      const taxonomyFacets = [];
      for (const [category, facetIds] of Object.entries(taxonomyResult.filters || {})) {
        for (const facetId of facetIds) {
          // facetId is in format "Category/ID" - extract the ID
          const parts = facetId.split('/');
          const id = parts[parts.length - 1];
          taxonomyFacets.push({ category, value: id, fullId: facetId });
        }
      }

      // If all terms were mapped to taxonomy, use empty text query (will match all)
      // Only fall back to full query if NO terms were mapped
      const textQuery =
        taxonomyResult.mappings.length > 0
          ? taxonomyResult.remainingText || ''
          : lastMessage.content;

      if (taxonomyFacets.length > 0) {
        console.log(`Using taxonomy filters: ${taxonomyFacets.map(f => f.fullId).join(', ')}`);
        console.log(`Text query: "${textQuery}"`);
      } else {
        console.log(`No taxonomy filters, using full text search for: "${lastMessage.content}"`);
      }

      if (expandedFacets.length > 0) {
        console.log(
          `Business rules would expand to: ${expandedFacets.join(', ')} (handled by Solr field weights)`
        );
      }

      // Execute Solr search with taxonomy facets + text search
      const searchOptions = {
        text: textQuery,
        taxonomyFilters: taxonomyFacets.length > 0 ? taxonomyResult.filters : null,
        limit: 100, // Get more for business rules to work with
        offset: 0,
      };

      searchResults = await metadataSearch(searchOptions);

      // FALLBACK: If taxonomy filters returned 0 results, retry with pure text search
      // This handles cases where facet intersection is too restrictive (e.g., "cinematic trailer")
      if (searchResults.total === 0 && taxonomyFacets.length > 0) {
        console.log(
          `Taxonomy filters returned 0 results, falling back to text search for: "${lastMessage.content}"`
        );
        searchResults = await metadataSearch({
          text: lastMessage.content,
          taxonomyFilters: null,
          limit: 100,
          offset: 0,
        });
      }

      // Enrich with genre names
      searchResults.tracks = enrichTracksWithGenreNames(searchResults.tracks);

      console.log(
        `Solr search: ${searchResults.tracks.length} tracks (total: ${searchResults.total})`
      );

      // Add score breakdown from Solr score
      searchResults.tracks = searchResults.tracks.map(track => ({
        ...track,
        _score_breakdown: {
          solr_score: track._relevance_score || 0,
          // Note: Solr score already includes combined_genre_search^4.0 for taxonomy matches
          note: 'Score includes field weights from fieldWeights.json',
        },
      }));

      console.log(
        `Search returned ${searchResults.tracks.length} tracks (total: ${searchResults.total})`
      );

      // Apply business rules to results
      const enhancedResults = await applyRules(
        searchResults.tracks,
        matchedRules,
        lastMessage.content
      );

      const elapsed = Date.now() - startTime;
      console.log(
        `Simple query completed in ${elapsed}ms with ${enhancedResults.appliedRules.length} rules applied`
      );

      // Log transparency data (for potential UI display)
      if (enhancedResults.appliedRules.length > 0) {
        console.log('Applied rules:', enhancedResults.appliedRules);
        console.log('Score adjustments:', enhancedResults.scoreAdjustments);
      }

      // Enrich tracks with full version data (replaces minimal Solr version info)
      const tracksWithVersions = enrichTracksWithFullVersions(enhancedResults.results.slice(0, 12));

      return res.json({
        type: 'track_results',
        message: buildResultsMessage(
          lastMessage.content,
          searchResults.total,
          searchResults.totalVersions
        ),
        tracks: tracksWithVersions,
        total_count: searchResults.total,
        total_versions: searchResults.totalVersions,
        showing: `1-${Math.min(12, enhancedResults.results.length)}`,
        // Include transparency metadata (optional - for future UI enhancement)
        _meta: {
          appliedRules: enhancedResults.appliedRules,
          scoreAdjustments: enhancedResults.scoreAdjustments.slice(0, 12),
        },
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
      } catch (_e) {
        // If parsing fails, use the original reply
        // This is fine - it just means it wasn't double-encoded
      }
    }

    // Try to parse as track results JSON
    let trackResults = null;
    if (typeof reply === 'string') {
      try {
        let trimmed = reply.trim();
        console.log('Raw reply length:', reply.length);
        console.log('Reply first 200 chars:', reply.substring(0, 200));

        // Strip markdown code fences if present
        if (trimmed.startsWith('```')) {
          console.log('Stripping markdown code fences');
          trimmed = trimmed.replace(/^```(?:json)?\s*\n?/, '');
          trimmed = trimmed.replace(/\n?```\s*$/, '');
          trimmed = trimmed.trim();
        }

        // Try to find JSON object if it doesn't start with {
        if (!trimmed.startsWith('{')) {
          console.log('Reply does not start with {, searching for JSON object...');
          // Find the start of a track_results JSON object
          const jsonStartMatch = trimmed.match(/\{\s*"type"\s*:\s*"track_results"/);
          if (jsonStartMatch) {
            console.log('Found track_results JSON start pattern');
            const startIdx = trimmed.indexOf(jsonStartMatch[0]);
            // Extract from the opening brace and find matching closing brace
            let braceCount = 0;
            let endIdx = startIdx;
            let inString = false;
            let escapeNext = false;

            for (let i = startIdx; i < trimmed.length; i++) {
              const char = trimmed[i];

              // Handle escape sequences inside strings
              if (escapeNext) {
                escapeNext = false;
                continue;
              }

              if (char === '\\' && inString) {
                escapeNext = true;
                continue;
              }

              // Toggle string mode on unescaped quotes
              if (char === '"') {
                inString = !inString;
                continue;
              }

              // Only count braces outside of strings
              if (!inString) {
                if (char === '{') braceCount++;
                if (char === '}') braceCount--;
                if (braceCount === 0) {
                  endIdx = i + 1;
                  break;
                }
              }
            }
            console.log(`Extracted JSON from index ${startIdx} to ${endIdx}`);
            trimmed = trimmed.substring(startIdx, endIdx);
            console.log('Extracted JSON first 200 chars:', trimmed.substring(0, 200));
          } else {
            console.log('No track_results JSON pattern found in reply');
          }
        }

        // Only try to parse if it looks like JSON
        if (trimmed.startsWith('{')) {
          console.log('Attempting to parse JSON...');

          // Try to parse directly first
          let parsed;
          try {
            parsed = JSON.parse(trimmed);
          } catch (parseError) {
            console.log('Direct JSON parse failed:', parseError.message);
            console.log('Attempting to clean up JSON...');

            // Common LLM JSON issues: trailing commas, unescaped newlines in strings
            let cleanedJson = trimmed
              // Remove trailing commas before closing brackets/braces
              .replace(/,\s*\]/g, ']')
              .replace(/,\s*\}/g, '}')
              // Fix unescaped newlines in strings (replace with \n)
              .replace(/\n(?=[^"]*"(?:[^"]*"[^"]*")*[^"]*$)/g, '\\n');

            try {
              parsed = JSON.parse(cleanedJson);
              console.log('JSON parsed successfully after cleanup');
            } catch (cleanupError) {
              console.log('JSON cleanup parse also failed:', cleanupError.message);
              // Try more aggressive cleanup - truncate at last complete track
              const lastCompleteTrack = cleanedJson.lastIndexOf('},');
              if (lastCompleteTrack > 0) {
                const truncated = cleanedJson.substring(0, lastCompleteTrack + 1) + ']}';
                try {
                  parsed = JSON.parse(truncated);
                  console.log('JSON parsed successfully after truncation');
                } catch (truncError) {
                  console.log('Truncation parse failed:', truncError.message);
                }
              }
            }
          }

          if (parsed) {
            console.log(
              'JSON parsed successfully, type:',
              parsed.type,
              'tracks count:',
              parsed.tracks?.length
            );

            // Handle pill_extraction response type (Phase 3)
            if (parsed.type === 'pill_extraction' && Array.isArray(parsed.pills)) {
              console.log(
                'Valid pill_extraction JSON found with',
                parsed.pills.length,
                'pills and',
                parsed.tracks?.length || 0,
                'tracks'
              );

              // If Claude provided tracks, use them; otherwise do a Solr search
              let finalTracks = parsed.tracks || [];
              let totalCount = parsed.total_count || 0;

              if (finalTracks.length === 0 && parsed.pills.length > 0) {
                // Build query from pills and search
                const filterPills = parsed.pills.filter(p => p.type === 'filter');
                const textPills = parsed.pills.filter(p => p.type === 'text');

                const filterString = filterPills
                  .map(p => `@${p.field}${p.operator}${p.value}`)
                  .join(' ');
                const textString = textPills.map(p => p.value).join(' ');
                const pillQuery = [filterString, textString].filter(Boolean).join(' ');

                if (pillQuery) {
                  try {
                    const solrResults = await metadataSearch({
                      text: pillQuery,
                      limit: 12,
                      offset: 0,
                    });
                    if (solrResults.tracks) {
                      finalTracks = enrichTracksWithGenreNames(solrResults.tracks);
                      finalTracks = enrichTracksWithFullVersions(finalTracks);
                      totalCount = solrResults.total;
                    }
                  } catch (searchErr) {
                    console.log('Pill search failed:', searchErr.message);
                  }
                }
              }

              return res.json({
                type: 'pill_extraction',
                message: parsed.message || 'Updated search filters',
                pills: parsed.pills,
                tracks: finalTracks,
                total_count: totalCount,
                showing: `1-${Math.min(12, finalTracks.length)}`,
              });
            }

            if (parsed.type === 'track_results' && Array.isArray(parsed.tracks)) {
              trackResults = parsed;
              console.log(
                'Valid track_results JSON found with',
                trackResults.tracks.length,
                'tracks'
              );
            }
          }
        }
      } catch (e) {
        // Not JSON or not track results, treat as regular text
        console.log('JSON parsing failed:', e.message);
        console.log('Treating as text response');
      }
    }

    // If Claude's JSON failed to parse but this looks like a music search,
    // fall back to Solr search so user gets results instead of raw text
    if (!trackResults && typeof reply === 'string' && reply.includes('"type": "track_results"')) {
      console.log('JSON parsing failed but response contains track_results - falling back to Solr');
      try {
        const solrResults = await metadataSearch({
          text: lastMessage.content,
          limit: 12,
          offset: 0,
        });
        if (solrResults.tracks && solrResults.tracks.length > 0) {
          const enrichedTracks = enrichTracksWithGenreNames(solrResults.tracks);
          const matchedRules = matchRules(lastMessage.content);
          const enhancedResults = await applyRules(
            enrichedTracks,
            matchedRules,
            lastMessage.content
          );

          const tracksWithVersions = enrichTracksWithFullVersions(enhancedResults.results);

          console.log(`Solr fallback successful: ${tracksWithVersions.length} tracks`);

          return res.json({
            type: 'track_results',
            message: buildResultsMessage(
              lastMessage.content,
              solrResults.total,
              solrResults.totalVersions
            ),
            tracks: tracksWithVersions,
            total_count: solrResults.total,
            total_versions: solrResults.totalVersions,
            showing: `1-${Math.min(12, tracksWithVersions.length)}`,
            _meta: {
              appliedRules: enhancedResults.appliedRules,
              scoreAdjustments: enhancedResults.scoreAdjustments,
              fallback: 'solr_direct',
            },
          });
        }
      } catch (fallbackError) {
        console.log('Solr fallback also failed:', fallbackError.message);
      }
    }

    // Return structured response if we found track results
    if (trackResults) {
      // Claude tends to filter/summarize tracks - do a fresh Solr search to get full results
      // but keep Claude's friendly message
      let finalTracks = trackResults.tracks;
      let totalCount = trackResults.total_count;
      let showingText = trackResults.showing;

      // If Claude returned few tracks but indicated more exist, do a direct Solr search
      if (
        trackResults.tracks.length < 12 &&
        (trackResults.total_count > 12 || !trackResults.total_count)
      ) {
        try {
          console.log(
            `Claude returned only ${trackResults.tracks.length} tracks, fetching full results from Solr`
          );
          const solrResults = await metadataSearch({
            text: lastMessage.content,
            limit: 12,
            offset: 0,
          });
          if (solrResults.tracks && solrResults.tracks.length > trackResults.tracks.length) {
            finalTracks = solrResults.tracks;
            totalCount = solrResults.total;
            showingText = `1-${Math.min(12, solrResults.tracks.length)}`;
            console.log(`Using Solr results: ${finalTracks.length} tracks (total: ${totalCount})`);
          }
        } catch (e) {
          console.log('Solr backup search failed, using Claude tracks:', e.message);
        }
      }

      // Enrich tracks with proper genre names
      const enrichedTracks = enhanceTracksMetadata(finalTracks);

      // Apply business rules
      const matchedRules = matchRules(lastMessage.content);
      const enhancedResults = await applyRules(enrichedTracks, matchedRules, lastMessage.content);

      console.log(
        `Route 3: Applied ${enhancedResults.appliedRules.length} business rules to ${finalTracks.length} tracks`
      );

      // Enrich tracks with full version data
      const tracksWithVersions = enrichTracksWithFullVersions(enhancedResults.results);

      res.json({
        type: 'track_results',
        message: `${formatNumber(totalCount)} Titles`,
        tracks: tracksWithVersions,
        total_count: totalCount,
        showing: showingText,
        _meta: {
          appliedRules: enhancedResults.appliedRules,
          scoreAdjustments: enhancedResults.scoreAdjustments,
        },
      });
    } else {
      // Check if Claude returned markdown that looks like track results
      // (numbered list with track names, libraries, genres, etc.)
      // If so, fall back to Solr search to return proper track cards
      const isMarkdownTrackListing =
        typeof reply === 'string' &&
        // Numbered list with track info patterns (multiline)
        (/^\d+\.\s+\*\*[^*]+\*\*/m.test(reply) || // "1. **Track Name**"
          /^\d+\.\s+[^(]+\([^)]+\)/m.test(reply) || // "1. Track Name (Library)"
          // Contains music metadata patterns (indicating track details)
          (/BPM:/i.test(reply) && /Mood/i.test(reply)) ||
          (/Genre:/i.test(reply) && /BPM:/i.test(reply)));

      if (isMarkdownTrackListing) {
        console.log('Claude returned markdown track listing - extracting track info');
        try {
          const db = (await import('better-sqlite3')).default;
          const dbPath = (await import('path')).join(
            (await import('path')).dirname((await import('url')).fileURLToPath(import.meta.url)),
            '../services/../apm_music.db'
          );
          const dbConn = new db(dbPath, { readonly: true });

          let tracks = [];

          // First, try to extract track IDs from the markdown
          const trackIdPattern = /(?:Track ID:?\s*)?([A-Z]{2,5}_[A-Z0-9]+_\d{4}_\d{5})/gi;
          const idMatches = reply.matchAll(trackIdPattern);
          const trackIds = [...new Set([...idMatches].map(m => m[1]))];

          if (trackIds.length > 0) {
            console.log(`Found ${trackIds.length} track IDs in markdown`);
            const placeholders = trackIds.map(() => '?').join(',');
            tracks = dbConn
              .prepare(`SELECT * FROM tracks WHERE id IN (${placeholders})`)
              .all(...trackIds);
          }

          // If no track IDs found, try to extract track titles and search by title
          if (tracks.length === 0) {
            // Pattern: "**Track Title**" or "1. **Title**" or "**\"Title\"**"
            const titlePattern = /\*\*["""]?([^*"""\n]+?)["""]?\*\*/g;
            const titleMatches = [...reply.matchAll(titlePattern)];
            const trackTitles = titleMatches
              .map(m => m[1].trim())
              .filter(t => t.length > 2 && t.length < 100 && !t.includes(':'));

            if (trackTitles.length > 0) {
              console.log(`Searching for ${trackTitles.length} track titles from markdown`);
              // Search for each title
              for (const title of trackTitles.slice(0, 12)) {
                const found = dbConn
                  .prepare(`SELECT * FROM tracks WHERE track_title LIKE ? LIMIT 1`)
                  .get(`%${title}%`);
                if (found && !tracks.some(t => t.id === found.id)) {
                  tracks.push(found);
                }
              }
            }
          }

          dbConn.close();

          if (tracks.length > 0) {
            const enrichedTracks = enrichTracksWithGenreNames(tracks);
            const matchedRules = matchRules(lastMessage.content);
            const enhancedResults = await applyRules(
              enrichedTracks,
              matchedRules,
              lastMessage.content
            );
            const tracksWithVersions = enrichTracksWithFullVersions(enhancedResults.results);

            console.log(`Markdown fallback: Retrieved ${tracksWithVersions.length} tracks`);

            return res.json({
              type: 'track_results',
              message: `${tracksWithVersions.length} Titles`,
              tracks: tracksWithVersions,
              total_count: tracksWithVersions.length,
              showing: `1-${tracksWithVersions.length}`,
              _meta: {
                appliedRules: enhancedResults.appliedRules,
                scoreAdjustments: enhancedResults.scoreAdjustments,
                fallback: 'markdown_extraction',
              },
            });
          }
        } catch (fallbackError) {
          console.log('Markdown extraction fallback failed:', fallbackError.message);
        }
      }

      // Return regular text response
      res.json({ reply });
    }
  } catch (error) {
    console.error('Chat error:', error);

    // Handle specific error cases
    if (error.message?.includes('API key')) {
      return res.status(500).json({
        error: 'Configuration error',
        details: 'API key not configured. Please check your .env file.',
      });
    }

    if (error.status === 401) {
      return res.status(500).json({
        error: 'Authentication error',
        details: 'Invalid API key. Please check your .env file.',
      });
    }

    // Generic error response
    res.status(500).json({
      error: 'Failed to process chat message',
      details:
        process.env.NODE_ENV === 'development' ? error.message : 'An internal error occurred',
    });
  }
});

// Health check endpoint
router.get('/chat/health', (req, res) => {
  res.json({
    status: 'healthy',
    model: process.env.CLAUDE_MODEL || 'claude-3-haiku-20240307',
    hasApiKey: !!process.env.ANTHROPIC_API_KEY,
  });
});

export default router;
