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
import safeRegex from 'safe-regex';
import { getBusinessRulesEnabled } from '../routes/settings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RULES_PATH = path.join(__dirname, '..', 'config', 'businessRules.json');

let cachedRules = null;
let rulesLastModified = null;
// Cache of validated regex patterns: pattern string -> { safe: boolean, regex: RegExp | null }
const validatedPatterns = new Map();

/**
 * Validate a regex pattern for safety (ReDoS prevention)
 * Caches the result and compiled regex for performance
 * @param {string} pattern - The regex pattern to validate
 * @returns {{ safe: boolean, regex: RegExp | null, reason?: string }}
 */
function validatePattern(pattern) {
  // Check cache first
  if (validatedPatterns.has(pattern)) {
    return validatedPatterns.get(pattern);
  }

  // Validate the pattern
  try {
    // Check for ReDoS vulnerability using safe-regex
    if (!safeRegex(pattern)) {
      const result = { safe: false, regex: null, reason: 'Pattern may cause ReDoS' };
      validatedPatterns.set(pattern, result);
      return result;
    }

    // Compile the regex
    const regex = new RegExp(pattern, 'i');
    const result = { safe: true, regex };
    validatedPatterns.set(pattern, result);
    return result;
  } catch (error) {
    const result = { safe: false, regex: null, reason: error.message };
    validatedPatterns.set(pattern, result);
    return result;
  }
}

/**
 * Load business rules from JSON configuration
 * Uses file system caching with modification time checking
 * Validates regex patterns at load time for safety
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

    // Clear pattern cache when rules file changes
    validatedPatterns.clear();

    const rulesJson = fs.readFileSync(RULES_PATH, 'utf8');
    cachedRules = JSON.parse(rulesJson);
    rulesLastModified = currentModTime;

    // Pre-validate all patterns and warn about unsafe ones
    let unsafeCount = 0;
    for (const rule of cachedRules.rules || []) {
      if (rule.pattern && rule.enabled) {
        const validation = validatePattern(rule.pattern);
        if (!validation.safe) {
          unsafeCount++;
          console.warn(
            `Rule ${rule.id} has unsafe regex pattern: ${validation.reason}. Rule will be skipped.`
          );
        }
      }
    }

    console.log(
      `Loaded ${cachedRules.rules.length} business rules from configuration` +
        (unsafeCount > 0 ? ` (${unsafeCount} skipped due to unsafe patterns)` : '')
    );
    return cachedRules;
  } catch (error) {
    console.error('Error loading business rules:', error.message);
    return { rules: [] };
  }
}

/**
 * Get recency interleaving config if a matching rule exists
 * Used by chat.js to make separate Solr queries for recent/vintage tracks
 * @param {Array} matchedRules - Rules that matched the query
 * @returns {object|null} - { rule, recentThresholdDate, vintageMaxDate, pattern, repeatCount } or null
 */
export function getRecencyInterleavingConfig(matchedRules) {
  const recencyRule = matchedRules.find(r => r.type === 'recency_interleaving' && r.enabled);
  if (!recencyRule) return null;

  const {
    recent_threshold_months,
    vintage_max_months,
    pattern,
    repeat_count = 1,
  } = recencyRule.action;

  if (!pattern || !recent_threshold_months) return null;

  const now = new Date();

  // Calculate threshold dates
  const recentThresholdDate = new Date(now);
  recentThresholdDate.setMonth(recentThresholdDate.getMonth() - recent_threshold_months);

  let vintageMaxDate = null;
  if (vintage_max_months) {
    vintageMaxDate = new Date(now);
    vintageMaxDate.setMonth(vintageMaxDate.getMonth() - vintage_max_months);
  }

  return {
    rule: recencyRule,
    recentThresholdDate,
    vintageMaxDate,
    pattern,
    repeatCount: repeat_count,
  };
}

/**
 * Apply recency interleaving with pre-filtered buckets
 * Called when chat.js has already fetched recent and vintage tracks separately
 * @param {Array} recentTracks - Tracks from recent Solr query
 * @param {Array} vintageTracks - Tracks from vintage Solr query
 * @param {object} config - Config from getRecencyInterleavingConfig
 * @returns {object} - { results, appliedRules }
 */
export function applyRecencyInterleavingWithBuckets(recentTracks, vintageTracks, config) {
  const { rule, pattern, repeatCount } = config;

  if (recentTracks.length === 0 && vintageTracks.length === 0) {
    return {
      results: [],
      appliedRules: [],
    };
  }

  // If one bucket is empty, just return the other
  if (recentTracks.length === 0) {
    return {
      results: vintageTracks,
      appliedRules: [],
    };
  }
  if (vintageTracks.length === 0) {
    return {
      results: recentTracks,
      appliedRules: [],
    };
  }

  // Apply pattern with repeat
  const interleavedTracks = [];
  let recentIndex = 0;
  let vintageIndex = 0;
  const patternChars = pattern.replace(/\s/g, '');

  for (let repeat = 0; repeat < repeatCount; repeat++) {
    for (const char of patternChars) {
      if (char === 'R' && recentIndex < recentTracks.length) {
        interleavedTracks.push(recentTracks[recentIndex++]);
      } else if (char === 'V' && vintageIndex < vintageTracks.length) {
        interleavedTracks.push(vintageTracks[vintageIndex++]);
      }
      // Stop if we've exhausted both buckets
      if (recentIndex >= recentTracks.length && vintageIndex >= vintageTracks.length) {
        break;
      }
    }
  }

  // Append remaining tracks (recent first, then vintage)
  while (recentIndex < recentTracks.length) {
    interleavedTracks.push(recentTracks[recentIndex++]);
  }
  while (vintageIndex < vintageTracks.length) {
    interleavedTracks.push(vintageTracks[vintageIndex++]);
  }

  console.log(
    `Recency interleaving (dual-query): ${recentTracks.length} recent + ${vintageTracks.length} vintage = ${interleavedTracks.length} interleaved`
  );

  return {
    results: interleavedTracks,
    appliedRules: [
      {
        ruleId: rule.id,
        type: rule.type,
        description: rule.description,
        affectedTracks: interleavedTracks.length,
        recentCount: recentTracks.length,
        vintageCount: vintageTracks.length,
      },
    ],
  };
}

/**
 * Match query text to applicable rules
 * Uses pre-validated regex patterns to prevent ReDoS attacks
 * @param {string} query - The user's search query
 * @returns {Array} - Array of matching rules, sorted by priority (descending)
 */
export function matchRules(query) {
  // Check global toggle first
  if (!getBusinessRulesEnabled()) {
    console.log('Business rules globally disabled - skipping rule matching');
    return [];
  }

  const config = loadRules();
  const matched = [];

  for (const rule of config.rules) {
    // Skip disabled rules
    if (!rule.enabled) {
      continue;
    }

    // Get pre-validated regex (validated at load time or cached)
    const validation = validatePattern(rule.pattern);

    // Skip unsafe patterns
    if (!validation.safe) {
      continue;
    }

    // Test pattern against query using cached regex
    if (validation.regex.test(query)) {
      matched.push(rule);
    }
  }

  // Sort by priority (higher priority first)
  matched.sort((a, b) => (b.priority || 0) - (a.priority || 0));

  console.log(
    `Matched ${matched.length} rules for query "${query}":`,
    matched.map(r => `${r.id} (priority: ${r.priority})`).join(', ')
  );

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
      autoFilters: [],
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
        affectedTracks: ruleResult.affectedTracks || 0,
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
    autoFilters,
  };
}

/**
 * Apply a single rule to tracks
 * @param {Array} tracks - Array of track objects
 * @param {object} rule - Rule object
 * @param {string} query - Original search query
 * @returns {object} - { applied, tracks, affectedTracks, scoreAdjustments, ... }
 */
async function applyRule(tracks, rule, _query) {
  switch (rule.type) {
    case 'genre_simplification':
      return applyGenreSimplification(tracks, rule);

    case 'library_boost':
      return applyLibraryBoost(tracks, rule);

    case 'recency_interleaving':
      return applyRecencyInterleaving(tracks, rule);

    case 'feature_boost':
      return applyFeatureBoost(tracks, rule);

    case 'recency_decay':
      return applyRecencyDecay(tracks, rule);

    case 'filter_optimization':
      return applyFilterOptimization(tracks, rule);

    case 'subgenre_interleaving':
      return applySubgenreInterleaving(tracks, rule);

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
    affectedTracks: 0, // Expansion happens at search time, not result time
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
        reason: `Library boost: ${track.library_name} (${boostFactor}x)`,
      });

      return {
        ...track,
        _relevance_score: newScore,
        _boost_applied: boostFactor,
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
    scoreAdjustments: adjustments,
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
    recent_count: _recent_count,
    vintage_count: _vintage_count,
    recent_threshold_months,
    vintage_max_months,
    pattern,
  } = rule.action;

  if (!pattern || !recent_threshold_months) {
    return { applied: false };
  }

  // Calculate threshold dates
  const now = new Date();

  // Recent threshold: tracks newer than this are "recent"
  const recentThresholdDate = new Date(now);
  recentThresholdDate.setMonth(recentThresholdDate.getMonth() - recent_threshold_months);

  // Vintage max: tracks older than this are excluded (optional)
  let vintageMaxDate = null;
  if (vintage_max_months) {
    vintageMaxDate = new Date(now);
    vintageMaxDate.setMonth(vintageMaxDate.getMonth() - vintage_max_months);
  }

  // Separate tracks into recent, vintage, and excluded
  const recentTracks = [];
  const vintageTracks = [];
  let excludedCount = 0;

  for (const track of tracks) {
    const releaseDate = track.apm_release_date;

    if (releaseDate) {
      try {
        let trackDate;

        // Handle ISO format (e.g., "1997-04-10T07:00:00Z")
        if (releaseDate.includes('T')) {
          trackDate = new Date(releaseDate);
        }
        // Handle MM/DD/YYYY format
        else if (releaseDate.includes('/')) {
          const dateParts = releaseDate.split('/');
          trackDate = new Date(dateParts[2], dateParts[0] - 1, dateParts[1]);
        }
        // Handle YYYY-MM-DD format
        else {
          const dateParts = releaseDate.split('-');
          trackDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
        }

        if (isNaN(trackDate.getTime())) {
          // Invalid date, exclude from interleaving
          excludedCount++;
        } else if (trackDate >= recentThresholdDate) {
          // Recent: within recent_threshold_months
          recentTracks.push(track);
        } else if (!vintageMaxDate || trackDate >= vintageMaxDate) {
          // Vintage: older than recent threshold but within vintage_max_months (if set)
          vintageTracks.push(track);
        } else {
          // Too old: excluded from interleaving
          excludedCount++;
        }
      } catch (_error) {
        // If date parsing fails, exclude from interleaving
        excludedCount++;
      }
    } else {
      // No release date, exclude from interleaving
      excludedCount++;
    }
  }

  if (excludedCount > 0) {
    console.log(
      `Recency interleaving: excluded ${excludedCount} tracks (no date or outside vintage range)`
    );
  }

  // If we don't have enough tracks in either category, skip interleaving
  if (recentTracks.length === 0 || vintageTracks.length === 0) {
    return { applied: false };
  }

  // Get repeat count (default 1 = no repeat, 3 = repeat for 3 pages)
  const repeatCount = rule.action.repeat_count || 1;

  // Apply pattern (R = recent, V = vintage, space = ignore)
  // Pattern repeats for repeat_count iterations
  const interleavedTracks = [];
  let recentIndex = 0;
  let vintageIndex = 0;
  const patternChars = pattern.replace(/\s/g, ''); // Remove spaces

  for (let repeat = 0; repeat < repeatCount; repeat++) {
    for (const char of patternChars) {
      if (char === 'R' && recentIndex < recentTracks.length) {
        interleavedTracks.push(recentTracks[recentIndex++]);
      } else if (char === 'V' && vintageIndex < vintageTracks.length) {
        interleavedTracks.push(vintageTracks[vintageIndex++]);
      }
      // Stop if we've exhausted both buckets
      if (recentIndex >= recentTracks.length && vintageIndex >= vintageTracks.length) {
        break;
      }
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
    affectedTracks: interleavedTracks.length,
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
        reason: `Feature boost: ${boost_field}=${boost_value} (${boost_factor}x)`,
      });

      return {
        ...track,
        _relevance_score: newScore,
        _boost_applied: boost_factor,
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
    scoreAdjustments: adjustments,
  };
}

/**
 * Apply logarithmic recency decay to track scores
 * Formula: factor = 1 - k × ln(1 + age_months / horizon_months)
 * where k = (1 - horizon_threshold) / ln(2)
 *
 * This provides gentle decay that preserves catalog depth:
 * - Brand new: 100%
 * - 6 months: ~97%
 * - 2 years (horizon): ~90%
 * - 8 years: ~77%
 * - 20+ years: ~65% (floor)
 *
 * @param {Array} tracks - Array of track objects
 * @param {object} rule - Rule object
 * @returns {object} - { applied, tracks, affectedTracks, scoreAdjustments }
 */
function applyRecencyDecay(tracks, rule) {
  const config = rule.action || {};
  const horizonMonths = config.horizon_months || 24;
  const horizonThreshold = config.horizon_threshold || 0.9;
  const minFactor = config.min_factor || 0.65;
  const dateField = config.date_field || 'apm_release_date';

  // Derive decay rate from horizon threshold
  // At horizon_months, factor should equal horizon_threshold
  const decayRate = (1 - horizonThreshold) / Math.log(2);

  const now = Date.now();
  const msPerMonth = 30 * 24 * 60 * 60 * 1000;
  const scoreAdjustments = [];
  let affectedCount = 0;

  const adjustedTracks = tracks.map((track, index) => {
    const trackDateValue = track[dateField];
    if (!trackDateValue) {
      // No date, keep original score
      return track;
    }

    const trackDate = new Date(trackDateValue).getTime();
    if (isNaN(trackDate)) {
      // Invalid date, keep original score
      return track;
    }

    const ageMonths = Math.max(0, (now - trackDate) / msPerMonth);

    // Logarithmic decay: factor decreases slowly over time
    let factor = 1 - decayRate * Math.log(1 + ageMonths / horizonMonths);
    factor = Math.max(factor, minFactor);

    const originalScore = track._relevance_score || 1;
    const newScore = originalScore * factor;

    // Only count as affected if factor is not 1.0
    if (factor < 0.999) {
      affectedCount++;
    }

    scoreAdjustments.push({
      trackId: track.id,
      trackTitle: track.track_title,
      originalRank: index + 1,
      originalScore: parseFloat(originalScore.toFixed(4)),
      recencyFactor: parseFloat(factor.toFixed(3)),
      newScore: parseFloat(newScore.toFixed(4)),
      ageMonths: Math.round(ageMonths),
      reason: `Recency decay (${Math.round(ageMonths)}mo, ${(factor * 100).toFixed(0)}%)`,
    });

    return { ...track, _relevance_score: newScore };
  });

  // Re-sort by adjusted score (descending)
  adjustedTracks.sort((a, b) => (b._relevance_score || 0) - (a._relevance_score || 0));

  // Update final ranks in adjustments
  scoreAdjustments.forEach(adj => {
    const finalIndex = adjustedTracks.findIndex(t => t.id === adj.trackId);
    adj.finalRank = finalIndex + 1;
    adj.rankChange = adj.originalRank - adj.finalRank;
  });

  console.log(
    `Recency decay applied: ${affectedCount} tracks affected, horizon=${horizonMonths}mo, threshold=${horizonThreshold}`
  );

  return {
    applied: true,
    tracks: adjustedTracks,
    affectedTracks: affectedCount,
    scoreAdjustments,
    appliedRule: {
      ruleId: rule.id,
      type: rule.type,
      description: rule.description,
      config: {
        horizonMonths,
        horizonThreshold,
        minFactor,
        decayRate: parseFloat(decayRate.toFixed(4)),
      },
    },
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
      ruleId: rule.id,
    },
    affectedTracks: 0, // Filtering happens at search time
  };
}

/**
 * Apply subgenre interleaving rule
 * Reorders tracks to interleave different subgenres based on a pattern
 * Pattern example: "ABCD ABCD ABCD" where A=Classic Rock, B=Alternative Rock, etc.
 * @param {Array} tracks - Array of track objects
 * @param {object} rule - Rule object
 * @returns {object} - { applied, tracks, affectedTracks, interleaveDetails }
 */
function applySubgenreInterleaving(tracks, rule) {
  const { attribute, values, pattern, fallback = 'relevance' } = rule.action;

  if (!values || !pattern) {
    return { applied: false };
  }

  // Determine which field to check based on attribute
  const getAttributeValue = track => {
    switch (attribute) {
      case 'genre':
        // Check facet_labels, genre_name, or combined_genre
        return (
          (track.facet_labels || '') +
          ';' +
          (track.genre_name || '') +
          ';' +
          (track.combined_genre || '')
        );
      case 'mood':
        return track.facet_labels || '';
      case 'library':
        return track.library_name || '';
      default:
        return track[attribute] || '';
    }
  };

  // Check if a track matches a subgenre value (case-insensitive partial match)
  const trackMatchesValue = (track, targetValue) => {
    const attributeValue = getAttributeValue(track).toLowerCase();
    return attributeValue.includes(targetValue.toLowerCase());
  };

  // Group tracks by which pattern letter they match (tracks can match multiple)
  const patternLetters = Object.keys(values);
  const tracksByLetter = {};
  const usedTracks = new Set();

  for (const letter of patternLetters) {
    tracksByLetter[letter] = [];
  }

  // First pass: assign each track to its best matching letter
  for (const track of tracks) {
    for (const letter of patternLetters) {
      if (trackMatchesValue(track, values[letter])) {
        tracksByLetter[letter].push(track);
        break; // Only assign to first matching letter
      }
    }
  }

  // Parse pattern (ignore spaces)
  const patternChars = pattern.replace(/\s/g, '').split('');
  const interleavedTracks = [];
  const letterIndices = {};
  const interleaveDetails = [];

  for (const letter of patternLetters) {
    letterIndices[letter] = 0;
  }

  // Build interleaved result
  for (let i = 0; i < patternChars.length; i++) {
    const letter = patternChars[i];
    const bucket = tracksByLetter[letter];

    if (bucket && letterIndices[letter] < bucket.length) {
      const track = bucket[letterIndices[letter]];
      if (!usedTracks.has(track.id)) {
        interleavedTracks.push(track);
        usedTracks.add(track.id);
        interleaveDetails.push({
          position: interleavedTracks.length,
          letter,
          subgenre: values[letter],
          trackId: track.id,
          trackTitle: track.track_title,
        });
        letterIndices[letter]++;
      }
    } else if (fallback === 'relevance') {
      // Fallback: use next available track from any bucket or remaining tracks
      let filled = false;

      // Try other buckets first
      for (const otherLetter of patternLetters) {
        const otherBucket = tracksByLetter[otherLetter];
        while (letterIndices[otherLetter] < otherBucket.length) {
          const track = otherBucket[letterIndices[otherLetter]];
          if (!usedTracks.has(track.id)) {
            interleavedTracks.push(track);
            usedTracks.add(track.id);
            interleaveDetails.push({
              position: interleavedTracks.length,
              letter: otherLetter,
              subgenre: values[otherLetter],
              trackId: track.id,
              trackTitle: track.track_title,
              fallback: true,
              requestedSubgenre: values[letter],
            });
            letterIndices[otherLetter]++;
            filled = true;
            break;
          }
          letterIndices[otherLetter]++;
        }
        if (filled) break;
      }
    }
    // fallback === 'skip' would just not add anything
  }

  // Append remaining tracks that weren't used
  for (const track of tracks) {
    if (!usedTracks.has(track.id)) {
      interleavedTracks.push(track);
      usedTracks.add(track.id);
    }
  }

  // Calculate stats
  const subgenreCounts = {};
  for (const detail of interleaveDetails) {
    const sg = detail.subgenre;
    subgenreCounts[sg] = (subgenreCounts[sg] || 0) + 1;
  }

  console.log(
    `Subgenre interleaving applied: ${interleaveDetails.length} tracks interleaved across ${Object.keys(subgenreCounts).length} subgenres`
  );

  return {
    applied: true,
    tracks: interleavedTracks,
    affectedTracks: interleaveDetails.length,
    interleaveDetails: {
      pattern,
      subgenreCounts,
      placements: interleaveDetails.slice(0, 12), // First 12 for transparency
    },
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
    pattern: rule.pattern,
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
    byType: {},
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
