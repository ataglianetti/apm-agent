/**
 * Business Rules Engine
 * PM-controlled search behavior with complete transparency
 *
 * This is the core value proposition: PMs can control search results through
 * JSON configuration without code changes, with full transparency into which
 * rules fired and how they affected results.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RULES_PATH = path.join(__dirname, '..', 'config', 'businessRules.json');

let cachedRules = null;
let rulesLastModified = null;

/**
 * Load business rules from JSON configuration
 * Uses file system caching with modification time checking
 * @returns {object} - Rules configuration object
 */
export function loadRules() {
  try {
    const stats = fs.statSync(RULES_PATH);
    const currentModTime = stats.mtime.getTime();

    // Use cached rules if file hasn't changed
    if (cachedRules && rulesLastModified === currentModTime) {
      return cachedRules;
    }

    const rulesJson = fs.readFileSync(RULES_PATH, 'utf8');
    cachedRules = JSON.parse(rulesJson);
    rulesLastModified = currentModTime;

    console.log(`Loaded ${cachedRules.rules.length} business rules from configuration`);
    return cachedRules;
  } catch (error) {
    console.error('Error loading business rules:', error.message);
    return { rules: [] };
  }
}

/**
 * Match query text to applicable rules
 * @param {string} query - The user's search query
 * @returns {Array} - Array of matching rules, sorted by priority (descending)
 */
export function matchRules(query) {
  const config = loadRules();
  const matched = [];

  for (const rule of config.rules) {
    // Skip disabled rules
    if (!rule.enabled) {
      continue;
    }

    // Test pattern against query (case-insensitive)
    try {
      const regex = new RegExp(rule.pattern, 'i');
      if (regex.test(query)) {
        matched.push(rule);
      }
    } catch (error) {
      console.error(`Invalid regex pattern in rule ${rule.id}:`, error.message);
    }
  }

  // Sort by priority (higher priority first)
  matched.sort((a, b) => (b.priority || 0) - (a.priority || 0));

  console.log(`Matched ${matched.length} rules for query "${query}":`,
    matched.map(r => `${r.id} (priority: ${r.priority})`).join(', '));

  return matched;
}

/**
 * Apply business rules to search results
 * @param {Array} tracks - Array of track objects
 * @param {Array} rules - Array of rule objects (from matchRules)
 * @param {string} query - Original search query
 * @returns {object} - { results, appliedRules, scoreAdjustments, expandedFacets, autoFilters }
 */
export async function applyRules(tracks, rules, query) {
  if (!Array.isArray(tracks) || tracks.length === 0) {
    return {
      results: tracks,
      appliedRules: [],
      scoreAdjustments: [],
      expandedFacets: [],
      autoFilters: []
    };
  }

  let processedTracks = [...tracks];
  const appliedRules = [];
  const scoreAdjustments = [];
  const expandedFacets = [];
  const autoFilters = [];

  for (const rule of rules) {
    const ruleResult = await applyRule(processedTracks, rule, query);

    if (ruleResult.applied) {
      appliedRules.push({
        ruleId: rule.id,
        type: rule.type,
        description: rule.description,
        affectedTracks: ruleResult.affectedTracks || 0
      });

      if (ruleResult.scoreAdjustments) {
        scoreAdjustments.push(...ruleResult.scoreAdjustments);
      }

      if (ruleResult.expandedFacets) {
        expandedFacets.push(...ruleResult.expandedFacets);
      }

      if (ruleResult.autoFilter) {
        autoFilters.push(ruleResult.autoFilter);
      }

      if (ruleResult.tracks) {
        processedTracks = ruleResult.tracks;
      }
    }
  }

  return {
    results: processedTracks,
    appliedRules,
    scoreAdjustments,
    expandedFacets,
    autoFilters
  };
}

/**
 * Apply a single rule to tracks
 * @param {Array} tracks - Array of track objects
 * @param {object} rule - Rule object
 * @param {string} query - Original search query
 * @returns {object} - { applied, tracks, affectedTracks, scoreAdjustments, ... }
 */
async function applyRule(tracks, rule, query) {
  switch (rule.type) {
    case 'genre_simplification':
      return applyGenreSimplification(tracks, rule);

    case 'library_boost':
      return applyLibraryBoost(tracks, rule);

    case 'recency_interleaving':
      return applyRecencyInterleaving(tracks, rule);

    case 'feature_boost':
      return applyFeatureBoost(tracks, rule);

    case 'filter_optimization':
      return applyFilterOptimization(tracks, rule);

    default:
      console.warn(`Unknown rule type: ${rule.type}`);
      return { applied: false };
  }
}

/**
 * Apply genre simplification rule
 * Note: This returns metadata about facets to expand - actual expansion happens in search layer
 * @param {Array} tracks - Array of track objects
 * @param {object} rule - Rule object
 * @returns {object} - { applied, expandedFacets }
 */
function applyGenreSimplification(tracks, rule) {
  const facets = rule.action.auto_apply_facets || [];

  if (facets.length === 0) {
    return { applied: false };
  }

  return {
    applied: true,
    expandedFacets: facets,
    affectedTracks: 0 // Expansion happens at search time, not result time
  };
}

/**
 * Apply library boosting rule
 * Multiplies relevance scores for tracks from specified libraries
 * @param {Array} tracks - Array of track objects
 * @param {object} rule - Rule object
 * @returns {object} - { applied, tracks, affectedTracks, scoreAdjustments }
 */
function applyLibraryBoost(tracks, rule) {
  const boostConfig = rule.action.boost_libraries || [];

  if (boostConfig.length === 0) {
    return { applied: false };
  }

  // Create library name -> boost factor map (case-insensitive)
  const boostMap = {};
  for (const config of boostConfig) {
    boostMap[config.library_name.toLowerCase()] = config.boost_factor;
  }

  let affectedCount = 0;
  const adjustments = [];
  const boostedTracks = tracks.map((track, index) => {
    const libraryName = (track.library_name || '').toLowerCase();
    const boostFactor = boostMap[libraryName];

    if (boostFactor) {
      affectedCount++;

      // Calculate new score (if track doesn't have score, assign base score of 1.0)
      const originalScore = track._relevance_score || 1.0;
      const newScore = originalScore * boostFactor;

      adjustments.push({
        trackId: track.id,
        trackTitle: track.track_title,
        originalRank: index + 1,
        originalScore: originalScore,
        newScore: newScore,
        scoreMultiplier: boostFactor,
        reason: `Library boost: ${track.library_name} (${boostFactor}x)`
      });

      return {
        ...track,
        _relevance_score: newScore,
        _boost_applied: boostFactor
      };
    }

    return track;
  });

  // Re-sort tracks by new relevance scores (descending)
  boostedTracks.sort((a, b) => (b._relevance_score || 1.0) - (a._relevance_score || 1.0));

  // Update final ranks in adjustments
  adjustments.forEach(adj => {
    const finalIndex = boostedTracks.findIndex(t => t.id === adj.trackId);
    adj.finalRank = finalIndex + 1;
    adj.rankChange = adj.originalRank - adj.finalRank;
  });

  return {
    applied: true,
    tracks: boostedTracks,
    affectedTracks: affectedCount,
    scoreAdjustments: adjustments
  };
}

/**
 * Apply recency interleaving rule
 * Mixes recent and vintage tracks according to specified pattern
 * @param {Array} tracks - Array of track objects
 * @param {object} rule - Rule object
 * @returns {object} - { applied, tracks, affectedTracks }
 */
function applyRecencyInterleaving(tracks, rule) {
  const {
    recent_count,
    vintage_count,
    recent_threshold_months,
    pattern
  } = rule.action;

  if (!pattern || !recent_threshold_months) {
    return { applied: false };
  }

  // Calculate threshold date
  const thresholdDate = new Date();
  thresholdDate.setMonth(thresholdDate.getMonth() - recent_threshold_months);

  // Separate tracks into recent and vintage
  const recentTracks = [];
  const vintageTracks = [];

  for (const track of tracks) {
    const releaseDate = track.apm_release_date;

    if (releaseDate) {
      try {
        // Parse date (formats: "MM/DD/YYYY" or "YYYY-MM-DD")
        const dateParts = releaseDate.includes('/')
          ? releaseDate.split('/')  // MM/DD/YYYY
          : releaseDate.split('-');  // YYYY-MM-DD

        const trackDate = releaseDate.includes('/')
          ? new Date(dateParts[2], dateParts[0] - 1, dateParts[1])  // MM/DD/YYYY
          : new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);  // YYYY-MM-DD

        if (trackDate >= thresholdDate) {
          recentTracks.push(track);
        } else {
          vintageTracks.push(track);
        }
      } catch (error) {
        // If date parsing fails, treat as vintage
        vintageTracks.push(track);
      }
    } else {
      // No release date, treat as vintage
      vintageTracks.push(track);
    }
  }

  // If we don't have enough tracks in either category, skip interleaving
  if (recentTracks.length === 0 || vintageTracks.length === 0) {
    return { applied: false };
  }

  // Apply pattern (R = recent, V = vintage, space = ignore)
  const interleavedTracks = [];
  let recentIndex = 0;
  let vintageIndex = 0;

  for (const char of pattern) {
    if (char === 'R' && recentIndex < recentTracks.length) {
      interleavedTracks.push(recentTracks[recentIndex++]);
    } else if (char === 'V' && vintageIndex < vintageTracks.length) {
      interleavedTracks.push(vintageTracks[vintageIndex++]);
    }
  }

  // Append any remaining tracks (recent first, then vintage)
  while (recentIndex < recentTracks.length) {
    interleavedTracks.push(recentTracks[recentIndex++]);
  }
  while (vintageIndex < vintageTracks.length) {
    interleavedTracks.push(vintageTracks[vintageIndex++]);
  }

  return {
    applied: true,
    tracks: interleavedTracks,
    affectedTracks: interleavedTracks.length
  };
}

/**
 * Apply feature boost rule
 * Boosts tracks that have a specific feature (e.g., stems)
 * @param {Array} tracks - Array of track objects
 * @param {object} rule - Rule object
 * @returns {object} - { applied, tracks, affectedTracks, scoreAdjustments }
 */
function applyFeatureBoost(tracks, rule) {
  const { boost_field, boost_value, boost_factor } = rule.action;

  if (!boost_field || !boost_value || !boost_factor) {
    return { applied: false };
  }

  let affectedCount = 0;
  const adjustments = [];

  const boostedTracks = tracks.map((track, index) => {
    const fieldValue = String(track[boost_field] || '').toLowerCase();
    const targetValue = String(boost_value).toLowerCase();

    if (fieldValue === targetValue) {
      affectedCount++;

      const originalScore = track._relevance_score || 1.0;
      const newScore = originalScore * boost_factor;

      adjustments.push({
        trackId: track.id,
        trackTitle: track.track_title,
        originalRank: index + 1,
        originalScore: originalScore,
        newScore: newScore,
        scoreMultiplier: boost_factor,
        reason: `Feature boost: ${boost_field}=${boost_value} (${boost_factor}x)`
      });

      return {
        ...track,
        _relevance_score: newScore,
        _boost_applied: boost_factor
      };
    }

    return track;
  });

  // Re-sort by relevance score
  boostedTracks.sort((a, b) => (b._relevance_score || 1.0) - (a._relevance_score || 1.0));

  // Update final ranks
  adjustments.forEach(adj => {
    const finalIndex = boostedTracks.findIndex(t => t.id === adj.trackId);
    adj.finalRank = finalIndex + 1;
    adj.rankChange = adj.originalRank - adj.finalRank;
  });

  return {
    applied: true,
    tracks: boostedTracks,
    affectedTracks: affectedCount,
    scoreAdjustments: adjustments
  };
}

/**
 * Apply filter optimization rule
 * Auto-applies filters based on query text
 * Note: This returns filter metadata - actual filtering happens in search layer
 * @param {Array} tracks - Array of track objects
 * @param {object} rule - Rule object
 * @returns {object} - { applied, autoFilter }
 */
function applyFilterOptimization(tracks, rule) {
  const filterConfig = rule.action.auto_apply_filter;

  if (!filterConfig) {
    return { applied: false };
  }

  return {
    applied: true,
    autoFilter: {
      field: filterConfig.field,
      value: filterConfig.value,
      operator: filterConfig.operator,
      ruleId: rule.id
    },
    affectedTracks: 0 // Filtering happens at search time
  };
}

/**
 * Get metadata about applied rules for transparency
 * @param {string} query - Search query
 * @returns {Array} - Array of rule metadata objects
 */
export function getAppliedRules(query) {
  const rules = matchRules(query);

  return rules.map(rule => ({
    id: rule.id,
    type: rule.type,
    description: rule.description,
    priority: rule.priority,
    pattern: rule.pattern
  }));
}

/**
 * Reload rules from disk (force cache refresh)
 * Useful for hot-reloading configuration during development
 */
export function reloadRules() {
  cachedRules = null;
  rulesLastModified = null;
  return loadRules();
}

/**
 * Get all available rules (enabled and disabled)
 * @returns {Array} - Array of all rules
 */
export function getAllRules() {
  const config = loadRules();
  return config.rules || [];
}

/**
 * Get statistics about rule usage
 * @returns {object} - Rule statistics
 */
export function getRuleStats() {
  const config = loadRules();
  const rules = config.rules || [];

  const stats = {
    total: rules.length,
    enabled: rules.filter(r => r.enabled).length,
    disabled: rules.filter(r => !r.enabled).length,
    byType: {}
  };

  for (const rule of rules) {
    if (!stats.byType[rule.type]) {
      stats.byType[rule.type] = { total: 0, enabled: 0 };
    }
    stats.byType[rule.type].total++;
    if (rule.enabled) {
      stats.byType[rule.type].enabled++;
    }
  }

  return stats;
}
