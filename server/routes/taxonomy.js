/**
 * Taxonomy Routes
 *
 * API endpoints for taxonomy operations including:
 * - Query to taxonomy mapping (LLM-powered)
 * - Taxonomy statistics
 * - Facet lookup
 */

import express from 'express';
import {
  parseQuery,
  parseQueryLocal,
  parseQueryToTaxonomy,
  buildSolrFilters,
  getTaxonomyStats
} from '../services/queryToTaxonomy.js';

const router = express.Router();

/**
 * POST /api/taxonomy/parse
 *
 * Parse a natural language query into taxonomy filters
 *
 * Request body:
 * {
 *   "query": "uptempo solo jazz piano",
 *   "options": {
 *     "forceLLM": false,    // Force LLM parsing even for simple queries
 *     "localOnly": false    // Use only local lookup (no LLM)
 *   }
 * }
 *
 * Response:
 * {
 *   "query": "uptempo solo jazz piano",
 *   "filters": {
 *     "Tempo": ["Tempo/1046"],
 *     "is_a": ["is_a/2204"],
 *     "Master Genre": ["Master Genre/1248"],
 *     "Instruments": ["Instruments/2962"]
 *   },
 *   "solrFilters": [
 *     "combined_ids:(\"Tempo/1046\")",
 *     "combined_ids:(\"is_a/2204\")",
 *     ...
 *   ],
 *   "mappings": [...],
 *   "remainingText": "",
 *   "confidence": 0.95,
 *   "source": "local" | "llm",
 *   "latencyMs": 5
 * }
 */
router.post('/parse', async (req, res) => {
  try {
    const { query, options = {} } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        error: 'Missing or invalid query parameter'
      });
    }

    const result = await parseQuery(query.trim(), options);

    // Add Solr filter queries for convenience
    result.solrFilters = buildSolrFilters(result);

    res.json(result);
  } catch (error) {
    console.error('Error parsing query to taxonomy:', error);
    res.status(500).json({
      error: 'Failed to parse query',
      message: error.message
    });
  }
});

/**
 * POST /api/taxonomy/parse-local
 *
 * Parse query using only local lookup (no LLM, instant response)
 */
router.post('/parse-local', (req, res) => {
  try {
    const { query } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        error: 'Missing or invalid query parameter'
      });
    }

    const result = parseQueryLocal(query.trim());
    result.query = query;
    result.solrFilters = buildSolrFilters(result);
    result.source = 'local';

    res.json(result);
  } catch (error) {
    console.error('Error in local taxonomy parsing:', error);
    res.status(500).json({
      error: 'Failed to parse query locally',
      message: error.message
    });
  }
});

/**
 * POST /api/taxonomy/parse-llm
 *
 * Parse query using LLM (slower but handles complex/unusual queries)
 */
router.post('/parse-llm', async (req, res) => {
  try {
    const { query } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        error: 'Missing or invalid query parameter'
      });
    }

    const result = await parseQueryToTaxonomy(query.trim());
    result.solrFilters = buildSolrFilters(result);
    result.source = 'llm';

    res.json(result);
  } catch (error) {
    console.error('Error in LLM taxonomy parsing:', error);
    res.status(500).json({
      error: 'Failed to parse query with LLM',
      message: error.message
    });
  }
});

/**
 * GET /api/taxonomy/stats
 *
 * Get taxonomy statistics (category counts, etc.)
 */
router.get('/stats', (req, res) => {
  try {
    const stats = getTaxonomyStats();
    res.json(stats);
  } catch (error) {
    console.error('Error getting taxonomy stats:', error);
    res.status(500).json({
      error: 'Failed to get taxonomy stats',
      message: error.message
    });
  }
});

export default router;
