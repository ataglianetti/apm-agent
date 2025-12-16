/**
 * Enhanced @ Filter Parser
 * Supports all metadata fields with intelligent parsing
 * Handles multiple filters with : (contains) and = (exact match) operators
 *
 * Examples:
 * @library:MLB Music @tags:rock - MLB Music library with rock genre
 * @composer:john williams @album-title:star wars - John Williams from Star Wars albums
 * @bpm=120 @track-description:energetic - Exactly 120 BPM with energetic descriptions
 */

// Complete field mapping with all supported fields
const FIELD_MAPPING = {
  // Primary fields
  'track-title': 'track_title',
  'track-description': 'track_description',
  'album-title': 'album_title',
  'composer': 'composer',
  'library': 'library_name',
  'tags': 'genre',
  'lyrics-text': 'lyrics',
  'inspired-by': 'inspired_by',
  'bpm': 'bpm',

  // Additional metadata fields
  'artist': 'artist',
  'publisher': 'publisher',
  'release-date': 'apm_release_date',
  'duration': 'duration',
  'mood': 'mood',
  'tempo': 'tempo_description',
  'key': 'musical_key',
  'instruments': 'instruments',
  'vocals': 'vocals',
  'has-stems': 'has_stems',
  'isrc': 'isrc',
  'label': 'label',
  'catalog': 'catalog_number',
  'energy': 'energy_level',
  'use-case': 'use_case',
  'use-cases': 'use_cases',
  'era': 'era',
  'period': 'era',

  // Legacy mappings for backward compatibility
  'title': 'track_title',
  'album': 'album_title',
  'genre': 'genre',
  'description': 'track_description',
  'date': 'apm_release_date',
  'stems': 'has_stems'
};

// Operators and their meanings
const OPERATORS = {
  ':': 'contains',  // Partial match
  '=': 'exact'      // Exact match
};

// Field-specific value parsers
const VALUE_PARSERS = {
  bpm: (value) => {
    // Handle BPM ranges like "120-140" or comparisons like ">120"
    if (value.includes('-')) {
      const [min, max] = value.split('-').map(v => parseInt(v.trim()));
      return { type: 'range', min, max };
    } else if (value.startsWith('>')) {
      return { type: 'greater', value: parseInt(value.slice(1).trim()) };
    } else if (value.startsWith('<')) {
      return { type: 'less', value: parseInt(value.slice(1).trim()) };
    }
    return { type: 'exact', value: parseInt(value) };
  },

  duration: (value) => {
    // Handle duration in various formats: "2:30", "150", ">60"
    if (value.includes(':')) {
      const [minutes, seconds] = value.split(':').map(v => parseInt(v));
      return (minutes * 60) + seconds;
    } else if (value.startsWith('>') || value.startsWith('<')) {
      const operator = value[0];
      const seconds = parseInt(value.slice(1).trim());
      return { type: operator === '>' ? 'greater' : 'less', value: seconds };
    }
    return parseInt(value);
  },

  'has-stems': (value) => {
    // Convert various boolean representations
    const truthy = ['true', 'yes', '1', 'y'];
    const falsy = ['false', 'no', '0', 'n'];
    const normalized = value.toLowerCase().trim();
    if (truthy.includes(normalized)) return 'true';
    if (falsy.includes(normalized)) return 'false';
    return value;
  },

  'release-date': (value) => {
    // Handle date formats and ranges
    // Support: "2024", "2024-01", "2024-01-15", ">2023", "2020-2024"
    if (value.includes('-') && value.split('-').length === 2 &&
        value.split('-').every(part => part.length === 4)) {
      // Year range: "2020-2024"
      const [start, end] = value.split('-');
      return { type: 'range', start, end };
    } else if (value.startsWith('>') || value.startsWith('<')) {
      const operator = value[0];
      const date = value.slice(1).trim();
      return { type: operator === '>' ? 'after' : 'before', date };
    }
    return value;
  }
};

/**
 * Parse a message containing @ filters
 * @param {string} message - The user message
 * @returns {object} - { filters: [{field, value, operator, parsed}], searchText: string }
 */
export function parseFilterQuery(message) {
  const filters = [];
  let processedMessage = message;

  // Enhanced pattern to capture field names with numbers and underscores
  const filterPattern = /@([a-z0-9-_]+)([:=])/gi;
  const filterMatches = [];
  let match;

  // Collect all filter positions
  while ((match = filterPattern.exec(message)) !== null) {
    filterMatches.push({
      start: match.index,
      end: match.index + match[0].length,
      fieldKey: match[1],
      operator: match[2],
      fullMatch: match[0]
    });
  }

  // Process each filter match
  for (let i = 0; i < filterMatches.length; i++) {
    const currentFilter = filterMatches[i];
    const valueStart = currentFilter.end;
    let valueEnd;
    let value;

    // Check if the value starts with quotes
    const quotedMatch = message.slice(valueStart).match(/^(["'])([^"']*?)\1/);

    if (quotedMatch) {
      // If quoted, use the quoted value exactly
      value = quotedMatch[2];
      valueEnd = valueStart + quotedMatch[0].length;
    } else {
      // Intelligent value extraction without quotes
      let remainingText = message.slice(valueStart);

      if (i < filterMatches.length - 1) {
        // There's another filter after this one
        valueEnd = filterMatches[i + 1].start;
        value = message.slice(valueStart, valueEnd).trim();
      } else {
        // This is the last filter - use smart boundary detection
        value = extractSmartValue(remainingText, currentFilter.fieldKey);
        valueEnd = valueStart + value.length;
      }
    }

    // Clean and normalize the value
    value = cleanValue(value);

    // Map the field key to the backend field name
    const fieldKey = currentFilter.fieldKey.toLowerCase();
    const fieldName = FIELD_MAPPING[fieldKey] || fieldKey;

    // Parse field-specific values
    const parser = VALUE_PARSERS[fieldKey];
    const parsedValue = parser ? parser(value) : value;

    filters.push({
      field: fieldName,
      value: value,
      operator: currentFilter.operator,
      operatorType: OPERATORS[currentFilter.operator],
      parsed: parsedValue,
      originalField: fieldKey
    });

    // Remove this filter from the processed message
    const filterFullText = message.slice(currentFilter.start, valueEnd);
    processedMessage = processedMessage.replace(filterFullText, ' ');
  }

  // Clean up the remaining search text
  let searchText = processedMessage.replace(/\s+/g, ' ').trim();

  // Remove quotes if the entire remaining text is quoted
  searchText = stripOuterQuotes(searchText);

  return {
    filters: filters,
    searchText: searchText,
    hasFilters: filters.length > 0
  };
}

/**
 * Extract value intelligently based on field type and context
 */
function extractSmartValue(text, fieldKey) {
  // Natural language boundaries that typically end filter values
  const searchPhraseStarters = [
    ' for ', ' with ', ' that ', ' having ', ' featuring ',
    ' in ', ' and ', ' but ', ' or ', ' like ',
    ' similar to ', ' such as ', ' including ', ' matching ',
    ' plus ', ' also ', ' alongside ', ' combined with '
  ];

  // Field-specific expected value patterns
  const fieldPatterns = {
    bpm: /^\d{2,3}(-\d{2,3})?/,  // 120 or 120-140
    duration: /^(\d{1,2}:\d{2}|\d+)/,  // 2:30 or 150
    'release-date': /^\d{4}(-\d{2})?(-\d{2})?/,  // 2024, 2024-01, 2024-01-15
    'has-stems': /^(true|false|yes|no|[01])/i
  };

  // Check for field-specific pattern
  const pattern = fieldPatterns[fieldKey];
  if (pattern) {
    const match = text.match(pattern);
    if (match) {
      return match[0];
    }
  }

  // Find natural language boundary
  let bestSplit = -1;
  for (const starter of searchPhraseStarters) {
    const index = text.toLowerCase().indexOf(starter);
    if (index > 0 && index < 100) { // Within reasonable distance
      bestSplit = index;
      break;
    }
  }

  if (bestSplit > 0) {
    return text.slice(0, bestSplit).trim();
  }

  // Fallback: Take reasonable amount of text
  const words = text.split(/\s+/);

  // For known multi-word fields, take more words
  const multiWordFields = ['track-title', 'album-title', 'composer', 'artist', 'track-description'];
  const wordLimit = multiWordFields.includes(fieldKey) ? 5 : 3;

  if (words.length > wordLimit) {
    return words.slice(0, wordLimit).join(' ');
  }

  return text.trim();
}

/**
 * Clean and normalize a filter value
 */
function cleanValue(value) {
  // Remove trailing punctuation that's likely not part of the value
  value = value.replace(/[,;.!?]+$/, '');

  // Trim whitespace
  value = value.trim();

  // Remove surrounding quotes if present
  value = stripOuterQuotes(value);

  return value;
}

/**
 * Remove outer quotes from a string if they match
 */
function stripOuterQuotes(str) {
  if ((str.startsWith('"') && str.endsWith('"')) ||
      (str.startsWith("'") && str.endsWith("'"))) {
    return str.slice(1, -1);
  }
  return str;
}

/**
 * Check if a message contains @ filters
 * @param {string} message - The user message
 * @returns {boolean} - true if the message contains @ filters
 */
export function hasFilters(message) {
  return /@[a-z0-9-_]+[:=]/i.test(message);
}

/**
 * Get list of all available filter fields for autocomplete
 * @returns {array} - Array of field objects with name, key, and description
 */
export function getAvailableFields() {
  return [
    { key: '@track-title', field: 'track_title', description: 'Search by track name' },
    { key: '@track-description', field: 'track_description', description: 'Search track descriptions' },
    { key: '@album-title', field: 'album_title', description: 'Search by album name' },
    { key: '@composer', field: 'composer', description: 'Search by composer name' },
    { key: '@artist', field: 'artist', description: 'Search by artist name' },
    { key: '@library', field: 'library_name', description: 'Search by library' },
    { key: '@tags', field: 'genre', description: 'Search by genre tags' },
    { key: '@mood', field: 'mood', description: 'Search by mood' },
    { key: '@tempo', field: 'tempo_description', description: 'Search by tempo description' },
    { key: '@bpm', field: 'bpm', description: 'Search by BPM (supports ranges: 120-140)' },
    { key: '@duration', field: 'duration', description: 'Search by duration (2:30 or seconds)' },
    { key: '@release-date', field: 'apm_release_date', description: 'Search by release date' },
    { key: '@has-stems', field: 'has_stems', description: 'Filter by stem availability (true/false)' },
    { key: '@lyrics-text', field: 'lyrics', description: 'Search lyrics content' },
    { key: '@inspired-by', field: 'inspired_by', description: 'Search inspiration references' },
    { key: '@instruments', field: 'instruments', description: 'Search by instruments' },
    { key: '@vocals', field: 'vocals', description: 'Search by vocal type' },
    { key: '@key', field: 'musical_key', description: 'Search by musical key' }
  ];
}

/**
 * Generate filter help text for users
 */
export function getFilterHelp() {
  return `
**@ Filter Syntax Help**

Use @ filters to search specific metadata fields directly:

**Basic Syntax:**
- \`@field:value\` - Contains match (partial)
- \`@field=value\` - Exact match (full string)

**Examples:**
- \`@library:MLB Music @tags:rock\` - MLB Music library with rock genre
- \`@composer=John Williams\` - Exactly "John Williams"
- \`@bpm:120-140\` - BPM between 120 and 140
- \`@has-stems:true\` - Only tracks with stems

**Pro Tips:**
- Combine multiple filters (all must match)
- No quotes needed for multi-word values
- Add regular search text after filters
- Use = for exact library/composer names
- Use : for flexible matching

Type \`@\` to see available fields while typing!
`;
}