/**
 * Logger Utility
 * Provides structured logging with environment-based log levels.
 * Replaces scattered console.log calls with a consistent logging interface.
 */

const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

// Get log level from environment, default to 'info' in production, 'debug' in development
const currentLevel =
  LOG_LEVELS[process.env.LOG_LEVEL] ??
  (process.env.NODE_ENV === 'production' ? LOG_LEVELS.info : LOG_LEVELS.debug);

/**
 * Format a log message with timestamp and level
 * @param {string} level - Log level
 * @param {string} message - Log message
 * @param {object} meta - Optional metadata
 * @returns {string} Formatted log message
 */
function formatMessage(level, message, meta) {
  const timestamp = new Date().toISOString();
  const metaStr = meta && Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
  return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`;
}

/**
 * Log an error message
 * @param {string} message - Error message
 * @param {object|Error} meta - Optional metadata or Error object
 */
function error(message, meta) {
  if (currentLevel >= LOG_LEVELS.error) {
    if (meta instanceof Error) {
      console.error(formatMessage('error', message, { error: meta.message, stack: meta.stack }));
    } else {
      console.error(formatMessage('error', message, meta));
    }
  }
}

/**
 * Log a warning message
 * @param {string} message - Warning message
 * @param {object} meta - Optional metadata
 */
function warn(message, meta) {
  if (currentLevel >= LOG_LEVELS.warn) {
    console.warn(formatMessage('warn', message, meta));
  }
}

/**
 * Log an info message
 * @param {string} message - Info message
 * @param {object} meta - Optional metadata
 */
function info(message, meta) {
  if (currentLevel >= LOG_LEVELS.info) {
    console.log(formatMessage('info', message, meta));
  }
}

/**
 * Log a debug message (only in development or when LOG_LEVEL=debug)
 * @param {string} message - Debug message
 * @param {object} meta - Optional metadata
 */
function debug(message, meta) {
  if (currentLevel >= LOG_LEVELS.debug) {
    console.log(formatMessage('debug', message, meta));
  }
}

/**
 * Create a child logger with a prefix
 * @param {string} prefix - Prefix for all log messages (e.g., module name)
 * @returns {object} Logger instance with prefixed methods
 */
function createLogger(prefix) {
  return {
    error: (message, meta) => error(`[${prefix}] ${message}`, meta),
    warn: (message, meta) => warn(`[${prefix}] ${message}`, meta),
    info: (message, meta) => info(`[${prefix}] ${message}`, meta),
    debug: (message, meta) => debug(`[${prefix}] ${message}`, meta),
  };
}

export { error, warn, info, debug, createLogger, LOG_LEVELS };

export default {
  error,
  warn,
  info,
  debug,
  createLogger,
  LOG_LEVELS,
};
