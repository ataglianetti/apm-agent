/**
 * Date Parsing Utilities
 * Shared date parsing logic for consistent handling across the application
 */

/**
 * Parse a release date string into a Date object
 * Handles multiple formats: ISO, MM/DD/YYYY, YYYY-MM-DD
 *
 * @param {string} dateStr - The date string to parse
 * @returns {Date|null} - Parsed Date object or null if invalid
 */
export function parseReleaseDate(dateStr) {
  if (!dateStr) return null;

  try {
    let trackDate;

    // Handle ISO format (e.g., "1997-04-10T07:00:00Z")
    if (dateStr.includes('T')) {
      trackDate = new Date(dateStr);
    }
    // Handle MM/DD/YYYY format
    else if (dateStr.includes('/')) {
      const dateParts = dateStr.split('/');
      if (dateParts.length === 3) {
        trackDate = new Date(dateParts[2], dateParts[0] - 1, dateParts[1]);
      }
    }
    // Handle YYYY-MM-DD format
    else if (dateStr.includes('-')) {
      const dateParts = dateStr.split('-');
      if (dateParts.length === 3) {
        trackDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
      }
    }

    // Validate the parsed date
    if (trackDate && !isNaN(trackDate.getTime())) {
      return trackDate;
    }
  } catch {
    // Fall through to return null
  }

  return null;
}

/**
 * Check if a date is within a certain number of months from now
 *
 * @param {Date} date - The date to check
 * @param {number} months - Number of months threshold
 * @returns {boolean} - True if date is within the threshold
 */
export function isWithinMonths(date, months) {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
    return false;
  }

  const threshold = new Date();
  threshold.setMonth(threshold.getMonth() - months);
  return date >= threshold;
}
