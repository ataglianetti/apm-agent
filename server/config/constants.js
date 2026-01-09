/**
 * Application Constants
 * Centralized configuration values to avoid magic numbers throughout the codebase.
 */

// Cache settings
export const CACHE = {
  /** Maximum number of items in the reranked results cache */
  MAX_SIZE: 100,
  /** Time-to-live for taxonomy cache in milliseconds (1 hour) */
  TAXONOMY_TTL_MS: 60 * 60 * 1000,
  /** Time-to-live for cache entries in milliseconds (5 minutes) */
  DEFAULT_TTL_MS: 5 * 60 * 1000,
};

// Search settings
export const SEARCH = {
  /** Default number of results per page */
  DEFAULT_LIMIT: 12,
  /** Maximum number of results that can be requested */
  MAX_LIMIT: 1000,
  /** Maximum offset for pagination */
  MAX_OFFSET: 100000,
  /** Default offset for first page */
  DEFAULT_OFFSET: 0,
};

// JSON parsing settings
export const JSON_PARSING = {
  /** Maximum length to scan for JSON extraction */
  MAX_SCAN_LENGTH: 500000,
  /** Maximum depth for nested JSON parsing */
  MAX_DEPTH: 100,
  /** Maximum iterations for JSON cleanup loop */
  MAX_ITERATIONS: 50,
};

// Time constants
export const TIME = {
  /** Milliseconds per second */
  MS_PER_SECOND: 1000,
  /** Milliseconds per minute */
  MS_PER_MINUTE: 60 * 1000,
  /** Milliseconds per hour */
  MS_PER_HOUR: 60 * 60 * 1000,
  /** Milliseconds per day */
  MS_PER_DAY: 24 * 60 * 60 * 1000,
  /** Approximate milliseconds per month (30 days) */
  MS_PER_MONTH: 30 * 24 * 60 * 60 * 1000,
};

// UI/Display settings
export const DISPLAY = {
  /** Number of waveform bars to render */
  WAVEFORM_BARS: 200,
  /** Default track duration in seconds for fallback */
  DEFAULT_DURATION_SECONDS: 60,
  /** Maximum visible metadata tags */
  MAX_VISIBLE_TAGS: 10,
  /** Months threshold for "recent" tracks */
  RECENT_THRESHOLD_MONTHS: 12,
};

// Rate limiting settings
export const RATE_LIMIT = {
  /** Window duration in milliseconds */
  WINDOW_MS: 15 * 60 * 1000,
  /** Maximum requests per window (general) */
  MAX_REQUESTS_GENERAL: 200,
  /** Maximum requests per window (chat endpoint) */
  MAX_REQUESTS_CHAT: 50,
};
