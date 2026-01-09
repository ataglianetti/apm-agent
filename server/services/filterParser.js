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
// Uses SOLR *_search field names (these are the indexed/searchable fields)
const FIELD_MAPPING = {
  // Special all-fields text search (adds to general search text)
  text: '_text_all',

  // Primary text search fields (Solr *_search fields are indexed)
  'track-title': 'track_title_search',
  'track-description': 'track_description_search',
  'album-title': 'album_title_search',
  composer: 'composer_search',
  library: 'library_search',

  // Numeric/date fields (these don't need _search suffix)
  bpm: 'bpm',
  duration: 'duration',
  'release-date': 'apm_release_date',

  // Genre search via @tags (maps to Master Genre facet)
  tags: 'facet:Master Genre',

  // Facet category filters (mapped to special 'facet:CategoryName' format)
  mood: 'facet:Mood',
  moods: 'facet:Mood',
  instruments: 'facet:Instruments',
  instrument: 'facet:Instruments',
  vocals: 'facet:Vocals',
  vocal: 'facet:Vocals',
  tempo: 'facet:Tempo',
  tempos: 'facet:Tempo',
  genre: 'facet:Master Genre',
  genres: 'facet:Master Genre',
  'master-genre': 'facet:Master Genre',
  'additional-genre': 'facet:Additional Genre',
  'additional-genres': 'facet:Additional Genre',
  'music-for': 'facet:Music For',
  'use-case': 'facet:Music For',
  'use-cases': 'facet:Music For',
  character: 'facet:Character',
  characters: 'facet:Character',
  country: 'facet:Country & Region',
  region: 'facet:Country & Region',
  'country-region': 'facet:Country & Region',
  'instrumental-vocal': 'facet:Instrumental & Vocal Groupings',
  groupings: 'facet:Instrumental & Vocal Groupings',
  key: 'facet:Key',
  keys: 'facet:Key',
  'musical-key': 'facet:Key',
  language: 'facet:Language',
  languages: 'facet:Language',
  'lyric-subject': 'facet:Lyric Subject',
  'lyrics-subject': 'facet:Lyric Subject',
  movement: 'facet:Movement',
  movements: 'facet:Movement',
  'musical-form': 'facet:Musical Form',
  form: 'facet:Musical Form',
  'sound-effects': 'facet:Sound Effects',
  sfx: 'facet:Sound Effects',
  'time-period': 'facet:Time Period',
  period: 'facet:Time Period',
  era: 'facet:Time Period',
  'track-type': 'facet:Track Type',
  type: 'facet:Track Type',
};

// Operators and their meanings
const OPERATORS = {
  ':': 'contains', // Partial match
  '=': 'exact', // Exact match
};

// Field-specific value parsers
const VALUE_PARSERS = {
  bpm: value => {
    // Handle BPM ranges like "120-140" or comparisons like ">120"
    if (value.includes('-')) {
      const [min, max] = value.split('-').map(v => parseInt(v.trim()));
      if (isNaN(min) || isNaN(max)) {
        return { type: 'invalid', reason: 'Invalid BPM range' };
      }
      return { type: 'range', min, max };
    } else if (value.startsWith('>')) {
      const parsed = parseInt(value.slice(1).trim());
      if (isNaN(parsed)) {
        return { type: 'invalid', reason: 'Invalid BPM value' };
      }
      return { type: 'greater', value: parsed };
    } else if (value.startsWith('<')) {
      const parsed = parseInt(value.slice(1).trim());
      if (isNaN(parsed)) {
        return { type: 'invalid', reason: 'Invalid BPM value' };
      }
      return { type: 'less', value: parsed };
    }
    const parsed = parseInt(value);
    if (isNaN(parsed)) {
      return { type: 'invalid', reason: 'Invalid BPM value' };
    }
    return { type: 'exact', value: parsed };
  },

  duration: value => {
    // Handle duration in various formats: "2:30", "150", ">60"
    // Note: duration is stored in seconds in the database
    if (value.includes(':')) {
      const parts = value.split(':');
      if (parts.length !== 2) {
        return { type: 'invalid', reason: 'Invalid duration format' };
      }
      const [minutes, seconds] = parts.map(v => parseInt(v));
      if (isNaN(minutes) || isNaN(seconds) || seconds < 0 || seconds >= 60) {
        return { type: 'invalid', reason: 'Invalid duration value' };
      }
      return { type: 'exact', value: minutes * 60 + seconds };
    } else if (value.startsWith('>') || value.startsWith('<')) {
      const operator = value[0];
      const seconds = parseInt(value.slice(1).trim());
      if (isNaN(seconds)) {
        return { type: 'invalid', reason: 'Invalid duration value' };
      }
      return { type: operator === '>' ? 'greater' : 'less', value: seconds };
    }
    const parsed = parseInt(value);
    if (isNaN(parsed)) {
      return { type: 'invalid', reason: 'Invalid duration value' };
    }
    return { type: 'exact', value: parsed };
  },

  'release-date': value => {
    // Handle date formats and ranges
    // Support: "2024", "2024-01", "2024-01-15", ">2023", "2020-2024"
    if (
      value.includes('-') &&
      value.split('-').length === 2 &&
      value.split('-').every(part => part.length === 4)
    ) {
      // Year range: "2020-2024"
      const [start, end] = value.split('-');
      return { type: 'range', start, end };
    } else if (value.startsWith('>') || value.startsWith('<')) {
      const operator = value[0];
      const date = value.slice(1).trim();
      return { type: operator === '>' ? 'after' : 'before', date };
    }
    return value;
  },
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
      fullMatch: match[0],
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
      originalField: fieldKey,
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
    hasFilters: filters.length > 0,
  };
}

/**
 * Extract value intelligently based on field type and context
 */
function extractSmartValue(text, fieldKey) {
  // Natural language boundaries that typically end filter values
  const searchPhraseStarters = [
    ' for ',
    ' with ',
    ' that ',
    ' having ',
    ' featuring ',
    ' in ',
    ' and ',
    ' but ',
    ' or ',
    ' like ',
    ' similar to ',
    ' such as ',
    ' including ',
    ' matching ',
    ' plus ',
    ' also ',
    ' alongside ',
    ' combined with ',
  ];

  // Field-specific expected value patterns
  const fieldPatterns = {
    bpm: /^\d{2,3}(-\d{2,3})?/, // 120 or 120-140
    duration: /^(\d{1,2}:\d{2}|\d+)/, // 2:30 or 150
    'release-date': /^\d{4}(-\d{2})?(-\d{2})?/, // 2024, 2024-01, 2024-01-15
    'has-stems': /^(true|false|yes|no|[01])/i,
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
    if (index > 0 && index < 100) {
      // Within reasonable distance
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
  if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
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
    // All-fields text search
    {
      key: '@text',
      field: '_text_all',
      description: 'Search keywords across all text fields',
    },

    // Metadata fields (Solr *_search fields are indexed)
    { key: '@track-title', field: 'track_title_search', description: 'Search by track name' },
    {
      key: '@track-description',
      field: 'track_description_search',
      description: 'Search track descriptions',
    },
    { key: '@album-title', field: 'album_title_search', description: 'Search by album name' },
    { key: '@composer', field: 'composer_search', description: 'Search by composer name' },
    { key: '@library', field: 'library_search', description: 'Search by library' },
    { key: '@bpm', field: 'bpm', description: 'Search by BPM (supports ranges: 120-140)' },
    { key: '@duration', field: 'duration', description: 'Search by duration in seconds' },
    { key: '@release-date', field: 'apm_release_date', description: 'Search by release date' },
    {
      key: '@tags',
      field: 'facet:Master Genre',
      description: 'Search by genre tags (e.g., rock, hip hop)',
    },

    // Facet category filters (all 18 categories from facet_taxonomy)
    {
      key: '@mood',
      field: 'facet:Mood',
      description: 'Search by mood (e.g., upbeat, dark, peaceful)',
    },
    {
      key: '@genre',
      field: 'facet:Master Genre',
      description: 'Search by genre (e.g., rock, classical, electronic)',
    },
    {
      key: '@additional-genre',
      field: 'facet:Additional Genre',
      description: 'Search by additional genre',
    },
    {
      key: '@instruments',
      field: 'facet:Instruments',
      description: 'Search by instruments (e.g., piano, guitar, drums)',
    },
    {
      key: '@vocals',
      field: 'facet:Vocals',
      description: 'Search by vocal type (e.g., male, female, choir)',
    },
    {
      key: '@tempo',
      field: 'facet:Tempo',
      description: 'Search by tempo (e.g., fast, slow, medium)',
    },
    {
      key: '@music-for',
      field: 'facet:Music For',
      description: 'Search by use case (e.g., chase, love scene, montage)',
    },
    { key: '@character', field: 'facet:Character', description: 'Search by character/personality' },
    {
      key: '@country',
      field: 'facet:Country & Region',
      description: 'Search by country or region',
    },
    {
      key: '@key',
      field: 'facet:Key',
      description: 'Search by musical key (e.g., C major, A minor)',
    },
    { key: '@language', field: 'facet:Language', description: 'Search by language' },
    {
      key: '@lyric-subject',
      field: 'facet:Lyric Subject',
      description: 'Search by lyric subject matter',
    },
    { key: '@movement', field: 'facet:Movement', description: 'Search by musical movement' },
    { key: '@musical-form', field: 'facet:Musical Form', description: 'Search by musical form' },
    { key: '@sfx', field: 'facet:Sound Effects', description: 'Search by sound effects type' },
    { key: '@time-period', field: 'facet:Time Period', description: 'Search by time period/era' },
    { key: '@track-type', field: 'facet:Track Type', description: 'Search by track type' },
    {
      key: '@instrumental-vocal',
      field: 'facet:Instrumental & Vocal Groupings',
      description: 'Instrumental or vocal grouping',
    },
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

**All-Fields Text Search:**
- \`@text:ambient\` - Search "ambient" across all text fields

**Metadata Field Examples:**
- \`@library:MLB Music\` - MLB Music library tracks
- \`@composer=John Williams\` - Exactly "John Williams"
- \`@bpm:120-140\` - BPM between 120 and 140
- \`@album-title:christmas\` - Albums with "christmas" in title

**Facet Category Examples (18 categories):**
- \`@mood:upbeat\` - Upbeat mood tracks
- \`@genre:rock\` - Rock genre tracks
- \`@instruments:piano\` - Tracks with piano
- \`@vocals:female\` - Female vocal tracks
- \`@tempo:fast\` - Fast tempo tracks
- \`@music-for:chase\` - Chase scene music
- \`@key:C major\` - C major key tracks
- \`@language:spanish\` - Spanish language tracks
- \`@sfx:explosion\` - Explosion sound effects
- \`@time-period:1980s\` - 1980s era tracks

**Pro Tips:**
- Combine multiple filters (all must match)
- No quotes needed for multi-word values
- Add regular search text after filters
- Use = for exact library/composer names
- Use : for flexible matching

Type \`@\` to see all 18 facet categories + metadata fields!
`;
}
