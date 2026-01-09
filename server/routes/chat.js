import express from 'express';
import { chat as claudeChat } from '../services/claude.js';
import { parseFilterQuery, hasFilters } from '../services/filterParser.js';
import { search as metadataSearch } from '../services/metadataSearch.js';
import {
  matchRules,
  applyRules,
  getRecencyInterleavingConfig,
  applyRecencyInterleavingWithBuckets,
} from '../services/businessRulesEngine.js';
// searchFacets available from '../services/taxonomySearch.js' if needed
import { enrichTracksWithGenreNames } from '../services/genreMapper.js';
import { getLLMMode, getTaxonomyParserEnabled } from './settings.js';
import {
  enhanceTracksMetadata,
  enrichTracksWithFullVersions,
} from '../services/metadataEnhancer.js';
import { parseQueryLocal } from '../services/queryToTaxonomy.js';
import {
  isAimsAvailable,
  search as aimsSearch,
  pillsToConstraints,
} from '../services/aimsService.js';

const router = express.Router();

/**
 * Cache for re-ranked results when business rules (like recency_decay) are applied
 * This allows proper pagination across the re-ranked result set
 */
const rerankedResultsCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const CACHE_FETCH_SIZE = 500; // Fetch this many tracks for re-ranking

/**
 * Get cache key for a query + rules combination
 */
function getCacheKey(query, ruleIds) {
  return `${query.toLowerCase().trim()}:${ruleIds.sort().join(',')}`;
}

/**
 * Get or create cached re-ranked results
 */
async function getRerankedResults(query, matchedRules, searchFn) {
  const nonInterleavingRules = matchedRules.filter(
    r => r.type !== 'recency_interleaving' && r.type !== 'subgenre_interleaving'
  );

  if (nonInterleavingRules.length === 0) {
    return null; // No re-ranking rules, use normal pagination
  }

  const ruleIds = nonInterleavingRules.map(r => r.id);
  const cacheKey = getCacheKey(query, ruleIds);

  // Check cache
  const cached = rerankedResultsCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    console.log(`Using cached re-ranked results for "${query}" (${cached.tracks.length} tracks)`);
    return cached;
  }

  // Fetch larger result set
  console.log(
    `Fetching ${CACHE_FETCH_SIZE} tracks for re-ranking with rules: ${ruleIds.join(', ')}`
  );
  const searchResults = await searchFn({
    text: query,
    limit: CACHE_FETCH_SIZE,
    offset: 0,
  });

  const enrichedTracks = enrichTracksWithGenreNames(searchResults.tracks);

  // Apply business rules to the full set
  const enhancedResults = await applyRules(enrichedTracks, nonInterleavingRules, query);

  // Cache the results
  const cacheEntry = {
    tracks: enhancedResults.results,
    total: searchResults.total,
    appliedRules: enhancedResults.appliedRules || [],
    scoreAdjustments: enhancedResults.scoreAdjustments || [],
    timestamp: Date.now(),
  };

  rerankedResultsCache.set(cacheKey, cacheEntry);
  console.log(`Cached ${cacheEntry.tracks.length} re-ranked tracks for "${query}"`);

  // Clean old entries
  for (const [key, entry] of rerankedResultsCache.entries()) {
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
      rerankedResultsCache.delete(key);
    }
  }

  return cacheEntry;
}

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
    const { messages, options = {} } = req.body;
    const { offset = 0, limit = 12 } = options;

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

    console.log(
      `Processing query: ${lastMessage.content}${offset > 0 ? ` (offset: ${offset})` : ''}`
    );

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
      const textTerms = []; // For @text filters (add to general search text)

      for (const filter of parsed.filters) {
        if (filter.field === '_text_all') {
          // @text filter → add to general search text
          textTerms.push(filter.value);
          console.log(`Text filter: "${filter.value}"`);
        } else if (filter.field.startsWith('facet:')) {
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

      // Combine @text filter values with any remaining search text
      const combinedText = [...textTerms, parsed.searchText].filter(Boolean).join(' ');

      console.log(
        `Solr search: ${facets.length} facets, ${filters.length} filters, ${textTerms.length} text terms, text="${combinedText}"`
      );

      // Execute search via Solr
      const searchResults = await metadataSearch({
        facets,
        filters,
        text: combinedText,
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

      // Handle pagination (offset > 0)
      if (offset > 0) {
        console.log(`Pagination request: offset=${offset}, limit=${limit}`);

        // Check if recency interleaving is active for this query
        const matchedRules = matchRules(lastMessage.content);
        const recencyConfig = getRecencyInterleavingConfig(matchedRules);

        if (recencyConfig) {
          // Calculate pattern metrics
          const patternChars = recencyConfig.pattern.replace(/\s/g, '');
          const patternLength = patternChars.length;
          const pagesCompleted = Math.floor(offset / patternLength);

          // Check if we've exceeded the repeat_count bounds
          // After repeat_count pages, fall back to re-ranked relevance
          if (pagesCompleted >= recencyConfig.repeatCount) {
            console.log(
              `Pagination beyond recency bounds (page ${pagesCompleted + 1} > ${recencyConfig.repeatCount}) - using cached re-ranked results`
            );

            // Use cached re-ranked results for proper cross-page ordering
            const rerankedData = await getRerankedResults(
              lastMessage.content,
              matchedRules,
              metadataSearch
            );

            if (rerankedData) {
              // Paginate from the cached re-ranked results
              // Adjust offset: subtract the interleaved pages (first 36 results)
              const interleavedCount = recencyConfig.repeatCount * patternLength;
              const rerankedOffset = offset - interleavedCount;

              const pageTrack = rerankedData.tracks.slice(rerankedOffset, rerankedOffset + limit);

              // Add score breakdown for metadata modal
              const tracksWithScores = pageTrack.map(track => ({
                ...track,
                _score_breakdown: {
                  solr_score: track._relevance_score || 0,
                  note: `Re-ranked with ${rerankedData.appliedRules.map(r => r.type).join(', ')} (cached ${rerankedData.tracks.length} tracks)`,
                },
              }));

              const tracksWithVersions = enrichTracksWithFullVersions(tracksWithScores);

              return res.json({
                type: 'track_results',
                tracks: tracksWithVersions,
                total_count: rerankedData.total,
                showing: `${offset + 1}-${offset + tracksWithVersions.length}`,
                _meta: {
                  note: `Beyond interleaving bounds - using re-ranked cache (${rerankedData.tracks.length} tracks)`,
                  appliedRules: rerankedData.appliedRules,
                  scoreAdjustments: rerankedData.scoreAdjustments.slice(
                    rerankedOffset,
                    rerankedOffset + limit
                  ),
                },
              });
            }

            // Fallback: no re-ranking rules, use normal Solr pagination
            const searchResults = await metadataSearch({
              text: lastMessage.content,
              limit: limit,
              offset: offset,
            });

            const enrichedTracks = enrichTracksWithGenreNames(searchResults.tracks);
            const tracksWithVersions = enrichTracksWithFullVersions(enrichedTracks);

            return res.json({
              type: 'track_results',
              tracks: tracksWithVersions,
              total_count: searchResults.total,
              showing: `${offset + 1}-${offset + tracksWithVersions.length}`,
              _meta: {
                note: `Beyond interleaving bounds (${recencyConfig.repeatCount} pages), pure relevance`,
              },
            });
          }

          // Use dual-query approach for pagination within bounds
          console.log(
            `Pagination with recency interleaving (page ${pagesCompleted + 1} of ${recencyConfig.repeatCount}) - using dual-query`
          );

          // Calculate how many R and V tracks we need based on the pattern
          const rCount = (patternChars.match(/R/g) || []).length;
          const vCount = (patternChars.match(/V/g) || []).length;

          // Calculate offsets for each bucket based on pattern ratio
          // For pattern RRRRVRRRVRRR (10R, 2V per 12), at offset 12:
          // - Recent offset = 10 (10 R tracks used in first page)
          // - Vintage offset = 2 (2 V tracks used in first page)
          const recentOffset = pagesCompleted * rCount;
          const vintageOffset = pagesCompleted * vCount;

          const baseSearchOptions = {
            text: lastMessage.content,
            taxonomyFilters: null,
            limit: Math.ceil((limit * rCount) / patternLength) + 5, // Extra buffer
            offset: 0,
          };

          // Query recent tracks
          const recentDateFilter = {
            field: 'releaseDate',
            operator: 'greater',
            value: recencyConfig.recentThresholdDate.toISOString(),
          };
          const recentResults = await metadataSearch({
            ...baseSearchOptions,
            filters: [recentDateFilter],
            offset: recentOffset,
          });

          // Query vintage tracks
          const vintageDateFilter = {
            field: 'releaseDate',
            operator: 'range',
            value: {
              min: recencyConfig.vintageMaxDate ? recencyConfig.vintageMaxDate.toISOString() : null,
              max: recencyConfig.recentThresholdDate.toISOString(),
            },
          };
          const vintageResults = await metadataSearch({
            ...baseSearchOptions,
            limit: Math.ceil((limit * vCount) / patternLength) + 5,
            filters: [vintageDateFilter],
            offset: vintageOffset,
          });

          const recentTracks = enrichTracksWithGenreNames(recentResults.tracks);
          const vintageTracks = enrichTracksWithGenreNames(vintageResults.tracks);

          console.log(
            `Pagination dual-query: ${recentTracks.length} recent (offset ${recentOffset}), ${vintageTracks.length} vintage (offset ${vintageOffset})`
          );

          // Interleave for this page only (repeat_count = 1)
          const pageConfig = { ...recencyConfig, repeatCount: 1 };
          const enhancedResults = applyRecencyInterleavingWithBuckets(
            recentTracks,
            vintageTracks,
            pageConfig
          );

          // Apply recency_decay for score transparency (doesn't change order, just adds score data)
          const decayRule = matchedRules.find(r => r.type === 'recency_decay');
          let finalTracks = enhancedResults.results.slice(0, limit);
          let scoreAdjustments = [];

          if (decayRule) {
            const decayResults = await applyRules(finalTracks, [decayRule], lastMessage.content);
            // Keep original interleaved order, but capture score adjustments
            scoreAdjustments = decayResults.scoreAdjustments || [];
            // Update tracks with score data but maintain interleaved order
            const scoreMap = new Map(decayResults.results.map(t => [t.id, t._relevance_score]));
            finalTracks = finalTracks.map(t => ({
              ...t,
              _relevance_score: scoreMap.get(t.id) || t._relevance_score,
            }));
          }

          const tracksWithVersions = enrichTracksWithFullVersions(finalTracks);

          return res.json({
            type: 'track_results',
            tracks: tracksWithVersions,
            total_count: recentResults.total + vintageResults.total,
            showing: `${offset + 1}-${offset + tracksWithVersions.length}`,
            _meta: {
              appliedRules: enhancedResults.appliedRules,
              scoreAdjustments: scoreAdjustments,
            },
          });
        }

        // Standard pagination (no recency interleaving)
        const searchResults = await metadataSearch({
          text: lastMessage.content,
          limit: limit,
          offset: offset,
        });

        const enrichedTracks = enrichTracksWithGenreNames(searchResults.tracks);
        const tracksWithVersions = enrichTracksWithFullVersions(enrichedTracks);

        return res.json({
          type: 'track_results',
          tracks: tracksWithVersions,
          total_count: searchResults.total,
          showing: `${offset + 1}-${offset + tracksWithVersions.length}`,
        });
      }

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

      // Check if recency interleaving rule matched (requires dual-query approach)
      const recencyConfig = getRecencyInterleavingConfig(matchedRules);

      // Extract expanded facets from genre_simplification rules
      const expandedFacets = [];
      for (const rule of matchedRules) {
        if (rule.type === 'genre_simplification' && rule.action?.auto_apply_facets) {
          expandedFacets.push(...rule.action.auto_apply_facets);
        }
      }

      let searchResults;
      let enhancedResults;

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

      // DUAL-QUERY PATH: If recency interleaving matched, fetch recent and vintage separately
      if (recencyConfig) {
        console.log('Recency interleaving detected - using dual-query approach');

        // Use original query text for dual-query (skip taxonomy filters to avoid empty results)
        // Taxonomy filters can be too restrictive when combined with date filters
        const baseSearchOptions = {
          text: lastMessage.content,
          taxonomyFilters: null, // Skip taxonomy filters for dual-query - use pure text search
          limit: 50, // 50 recent + 50 vintage = 100 total
          offset: 0,
        };

        // Query 1: Recent tracks (within threshold)
        const recentDateFilter = {
          field: 'releaseDate',
          operator: 'greater',
          value: recencyConfig.recentThresholdDate.toISOString(),
        };

        console.log(
          `Fetching recent tracks (after ${recencyConfig.recentThresholdDate.toISOString().slice(0, 10)})`
        );
        const recentResults = await metadataSearch({
          ...baseSearchOptions,
          filters: [recentDateFilter],
        });

        // Query 2: Vintage tracks (between vintage_max and recent_threshold)
        // Use range operator to pass both min and max in one filter
        const vintageDateFilter = {
          field: 'releaseDate',
          operator: 'range',
          value: {
            min: recencyConfig.vintageMaxDate ? recencyConfig.vintageMaxDate.toISOString() : null,
            max: recencyConfig.recentThresholdDate.toISOString(),
          },
        };

        console.log(
          `Fetching vintage tracks (${recencyConfig.vintageMaxDate ? recencyConfig.vintageMaxDate.toISOString().slice(0, 10) + ' to ' : 'before '}${recencyConfig.recentThresholdDate.toISOString().slice(0, 10)})`
        );
        const vintageResults = await metadataSearch({
          ...baseSearchOptions,
          filters: [vintageDateFilter],
        });

        // Enrich with genre names
        const recentTracks = enrichTracksWithGenreNames(recentResults.tracks);
        const vintageTracks = enrichTracksWithGenreNames(vintageResults.tracks);

        console.log(
          `Dual-query results: ${recentTracks.length} recent, ${vintageTracks.length} vintage`
        );

        // Interleave using the pre-filtered buckets
        enhancedResults = applyRecencyInterleavingWithBuckets(
          recentTracks,
          vintageTracks,
          recencyConfig
        );

        // Apply recency_decay for score transparency (doesn't change order, just adds score data)
        const decayRule = matchedRules.find(r => r.type === 'recency_decay');
        let scoreAdjustments = [];

        if (decayRule) {
          const decayResults = await applyRules(
            enhancedResults.results,
            [decayRule],
            lastMessage.content
          );
          // Keep original interleaved order, but capture score adjustments
          scoreAdjustments = decayResults.scoreAdjustments || [];
          // Update tracks with score data but maintain interleaved order
          const scoreMap = new Map(decayResults.results.map(t => [t.id, t._relevance_score]));
          enhancedResults.results = enhancedResults.results.map(t => ({
            ...t,
            _relevance_score: scoreMap.get(t.id) || t._relevance_score,
          }));
        }

        // Add score breakdown
        enhancedResults.results = enhancedResults.results.map(track => ({
          ...track,
          _score_breakdown: {
            solr_score: track._relevance_score || 0,
            note: 'Score includes field weights from fieldWeights.json',
          },
        }));

        // Store total for response
        searchResults = {
          total: recentResults.total + vintageResults.total,
          totalVersions: (recentResults.totalVersions || 0) + (vintageResults.totalVersions || 0),
        };

        // Add score adjustments from recency decay
        enhancedResults.scoreAdjustments = scoreAdjustments;
      } else {
        // STANDARD PATH: Single query + business rules
        const searchOptions = {
          text: textQuery,
          taxonomyFilters: taxonomyFacets.length > 0 ? taxonomyResult.filters : null,
          limit: 100, // Get more for business rules to work with
          offset: 0,
        };

        searchResults = await metadataSearch(searchOptions);

        // FALLBACK: If taxonomy filters returned 0 results, retry with pure text search
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
            note: 'Score includes field weights from fieldWeights.json',
          },
        }));

        console.log(
          `Search returned ${searchResults.tracks.length} tracks (total: ${searchResults.total})`
        );

        // Apply business rules to results
        enhancedResults = await applyRules(searchResults.tracks, matchedRules, lastMessage.content);
      }

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
      const tracksWithVersions = enrichTracksWithFullVersions(
        enhancedResults.results.slice(0, limit)
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
        showing: `1-${Math.min(limit, enhancedResults.results.length)}`,
        // Include transparency metadata (optional - for future UI enhancement)
        _meta: {
          appliedRules: enhancedResults.appliedRules,
          scoreAdjustments: enhancedResults.scoreAdjustments.slice(0, limit),
        },
      });
    }

    // Route 3: Complex queries
    // Priority: AIMS (if available) → Claude (fallback)
    const startTime = Date.now();

    // Route 3a: Try AIMS Prompt Search for natural language queries
    if (isAimsAvailable()) {
      console.log('AIMS available - routing natural language query to AIMS');
      try {
        // Get pills from request if provided (for refining AIMS results)
        const { pills = [] } = req.body;
        const constraints = pillsToConstraints(pills);

        const aimsResults = await aimsSearch(lastMessage.content, constraints, 12, 0);

        if (aimsResults && aimsResults.tracks?.length > 0) {
          const enrichedTracks = enrichTracksWithGenreNames(aimsResults.tracks);
          const matchedRules = matchRules(lastMessage.content);
          const enhancedResults = await applyRules(
            enrichedTracks,
            matchedRules,
            lastMessage.content
          );
          const tracksWithVersions = enrichTracksWithFullVersions(enhancedResults.results);

          const elapsed = Date.now() - startTime;
          console.log(
            `AIMS search completed in ${elapsed}ms with ${tracksWithVersions.length} tracks`
          );

          return res.json({
            type: 'track_results',
            message: buildResultsMessage(
              lastMessage.content,
              aimsResults.total,
              aimsResults.total // AIMS may not have separate version count
            ),
            tracks: tracksWithVersions,
            total_count: aimsResults.total,
            showing: `1-${Math.min(12, tracksWithVersions.length)}`,
            _meta: {
              appliedRules: enhancedResults.appliedRules,
              scoreAdjustments: enhancedResults.scoreAdjustments,
              engine: 'aims',
              aimsQuery: aimsResults.aimsQuery,
            },
          });
        }
      } catch (aimsError) {
        console.log('AIMS search failed, falling back to Claude:', aimsError.message);
        // Fall through to Claude
      }
    }

    // Route 3b: Claude (fallback when AIMS unavailable or fails)
    const claudeResult = await claudeChat(messages);
    const elapsed = Date.now() - startTime;

    // Extract reply and fallback search results
    let reply = claudeResult.reply || claudeResult;
    const fallbackSearchResults = claudeResult.searchResults;

    console.log(`Response generated in ${elapsed}ms`);
    if (fallbackSearchResults) {
      console.log(
        `Fallback search results available: ${fallbackSearchResults.tracks?.length} tracks`
      );
    }

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
          // Find the start of a track_results or pill_extraction JSON object
          const jsonStartMatch = trimmed.match(
            /\{\s*"type"\s*:\s*"(?:track_results|pill_extraction)"/
          );
          if (jsonStartMatch) {
            console.log('Found JSON start pattern:', jsonStartMatch[0].substring(0, 50));
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
            console.log('No track_results or pill_extraction JSON pattern found in reply');
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

      // Use fallback search results if Claude found tracks but didn't format correctly
      if (fallbackSearchResults && fallbackSearchResults.tracks?.length > 0) {
        console.log(
          `Using fallback search results: ${fallbackSearchResults.tracks.length} tracks from query "${fallbackSearchResults.query}"`
        );
        const enrichedTracks = enrichTracksWithGenreNames(fallbackSearchResults.tracks);
        const matchedRules = matchRules(lastMessage.content);
        const enhancedResults = await applyRules(enrichedTracks, matchedRules, lastMessage.content);
        const tracksWithVersions = enrichTracksWithFullVersions(enhancedResults.results);

        // Parse Claude's search query using local taxonomy lookup for validated pills
        const searchQuery = fallbackSearchResults.query || '';
        const parsed = parseQueryLocal(searchQuery);
        const generatedPills = [];

        // Add filter pills for mapped taxonomy terms
        for (const mapping of parsed.mappings) {
          generatedPills.push({
            type: 'filter',
            key: mapping.category.toLowerCase().replace(/\s+/g, '_'),
            field: mapping.category,
            label: mapping.category,
            operator: ':',
            value: mapping.facet,
          });
        }

        // Add text pill for remaining unmapped terms
        if (parsed.remainingText.trim()) {
          generatedPills.push({
            type: 'text',
            value: parsed.remainingText.trim(),
          });
        }

        // Short, clean message
        const shortMessage = `Found ${fallbackSearchResults.total.toLocaleString()} tracks`;

        return res.json({
          type: 'pill_extraction',
          message: shortMessage,
          pills: generatedPills,
          tracks: tracksWithVersions,
          total_count: fallbackSearchResults.total,
          showing: `1-${Math.min(12, tracksWithVersions.length)}`,
          _meta: {
            appliedRules: enhancedResults.appliedRules,
            scoreAdjustments: enhancedResults.scoreAdjustments,
            fallback: 'tool_results',
            taxonomyMappings: parsed.mappings,
          },
        });
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
