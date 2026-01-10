/**
 * Help content for all form fields in the rule editor
 * Used by tooltips to explain what each field does
 */
export const FIELD_HELP = {
  // Common fields (all rule types)
  id: {
    label: 'Rule ID',
    description: 'A unique identifier for this rule. Used in logs and debugging.',
    tips: [
      'Auto-generated if left empty',
      'Format: type_context (e.g., library_boost_sports)',
      'Only lowercase letters, numbers, and underscores',
      'Cannot be changed after creation',
    ],
    example: 'genre_simplification_rock',
  },

  type: {
    label: 'Rule Type',
    description: 'What kind of rule this is. Each type affects search results differently.',
    tips: [
      'Choose based on what you want to achieve',
      'Each type has different action fields',
      'See the Help modal for detailed explanations of each type',
    ],
  },

  pattern: {
    label: 'Pattern (Regex)',
    description:
      'A regular expression that triggers this rule when matched against search queries.',
    tips: [
      'Use \\b for word boundaries: \\b(rock)\\b matches "rock" but not "rocky"',
      'Use | for OR: \\b(rock|jazz)\\b matches either word',
      'Use ? for optional letters: sports? matches "sport" and "sports"',
      'Patterns are case-insensitive',
      'Invalid patterns show an error message',
    ],
    example: '\\b(sports?|baseball|stadium)\\b',
  },

  description: {
    label: 'Description',
    description: 'A human-readable explanation of what this rule does.',
    tips: ['Helps others understand the rule purpose', 'Shown in the rules list'],
    example: 'Boost MLB Music library for sports-related queries',
  },

  priority: {
    label: 'Priority',
    description: 'Determines which rules run first when multiple rules match (0-100).',
    tips: [
      'Higher numbers run first',
      '90-100: Critical rules (genre expansion, library boost)',
      '70-80: Standard rules (interleaving)',
      '50-60: Lower priority (feature boost, filters)',
      'Default is 50',
    ],
  },

  enabled: {
    label: 'Enabled',
    description: 'Whether this rule is currently active.',
    tips: [
      'Disabled rules are ignored during search',
      'Use to temporarily turn off rules without deleting',
      'Toggle from the rules list for quick enable/disable',
    ],
  },

  // Library Boost fields
  library_name: {
    label: 'Library Name',
    description: 'The exact name of the music library to boost.',
    tips: [
      'Must match the library name exactly as stored in the database',
      'Check the library list for available names',
      'Common examples: MLB Music, NFL Music, Corporate',
    ],
    example: 'MLB Music',
  },

  boost_factor: {
    label: 'Boost Factor',
    description: 'Multiplier applied to track relevance scores.',
    tips: [
      '1.0 = no change',
      '1.5 = 50% boost (moves tracks up in results)',
      '2.0 = double the score',
      '0.5 = halve the score (demote)',
      'Must be greater than 0',
    ],
    example: '1.5',
  },

  // Genre Simplification fields
  auto_apply_facets: {
    label: 'Facets to Include',
    description: 'List of subgenres or facet values to add to the search.',
    tips: [
      'Enter one value per line',
      'Values must match taxonomy names exactly',
      'Check the facet browser for available values',
    ],
    example: 'Classic Rock\nAlternative Rock\nIndie Rock',
  },

  mode: {
    label: 'Mode',
    description: 'How to combine the facets with the search.',
    tips: [
      '"expand" (OR logic): Include tracks matching ANY of these facets',
      '"restrict" (AND logic): Only show tracks matching these facets',
      'Most rules use "expand" to broaden results',
    ],
  },

  // Recency Interleaving fields
  recent_threshold_months: {
    label: 'Recent Threshold (months)',
    description: 'Maximum age in months for a track to be considered "recent".',
    tips: [
      'Tracks newer than this go in the Recent bucket',
      'Tracks older go in the Vintage bucket',
      'Common values: 6, 12, 18, 24 months',
    ],
    example: '12',
  },

  vintage_max_months: {
    label: 'Vintage Max (months)',
    description: 'Maximum age for vintage tracks.',
    tips: [
      'Tracks older than this are excluded from interleaving',
      'Set high (60-120) to include catalog classics',
      'Set lower to focus on more recent content',
    ],
    example: '60',
  },

  interleave_pattern: {
    label: 'Interleave Pattern',
    description: 'The sequence of R (Recent) and V (Vintage) that determines result order.',
    tips: [
      'R = Recent track slot',
      'V = Vintage track slot',
      'Spaces are ignored (use for readability)',
      '"RRRR VRRR" = 4 recent, 1 vintage, 3 recent, 1 vintage',
      '"RRRV RRRV" = 3:1 ratio favoring recent',
    ],
    example: 'RRRR VRRR VRRR',
  },

  repeat_count: {
    label: 'Repeat Count',
    description: 'How many times to repeat the pattern across results.',
    tips: [
      '1 = pattern applies to first ~12 results',
      '3 = pattern applies to first ~36 results',
      'Higher values affect more pages',
    ],
    example: '3',
  },

  // Feature Boost fields
  boost_field: {
    label: 'Field to Check',
    description: 'The track attribute to check for the boost.',
    tips: [
      'Common fields: has_stems, has_instrumental, is_featured',
      'Must be a valid field in the track schema',
      'Ask engineering if unsure about field names',
    ],
    example: 'has_stems',
  },

  boost_value: {
    label: 'Value to Match',
    description: 'The value that triggers the boost.',
    tips: [
      'For boolean fields, use "true" or "false"',
      'Comparison is case-insensitive',
      'Must match the field value exactly',
    ],
    example: 'true',
  },

  // Recency Decay fields
  horizon_months: {
    label: 'Horizon (months)',
    description: 'The reference point for decay calculation.',
    tips: [
      'At this age, tracks get the horizon_threshold score',
      'Default is 24 months',
      'Shorter horizons = more aggressive decay',
    ],
    example: '24',
  },

  horizon_threshold: {
    label: 'Horizon Threshold',
    description: 'What fraction of the original score a track keeps at the horizon age.',
    tips: ['0.9 = 90% at horizon age', '0.8 = 80% at horizon age', 'Value must be between 0 and 1'],
    example: '0.9',
  },

  min_factor: {
    label: 'Minimum Factor',
    description: 'The floor score that no track drops below.',
    tips: [
      '0.65 = 65% minimum (default)',
      'Protects catalog classics from being buried',
      'Higher values = less penalty for old tracks',
    ],
    example: '0.65',
  },

  date_field: {
    label: 'Date Field',
    description: 'Which database field contains the release date.',
    tips: [
      'Default is "apm_release_date"',
      'Only change if you know the database schema',
      'Ask engineering before modifying',
    ],
    example: 'apm_release_date',
  },

  // Filter Optimization fields
  filter_field: {
    label: 'Filter Field',
    description: 'Which track field to filter on.',
    tips: [
      'Common fields: vocals, genre, library_name',
      'Must be a valid field in the track schema',
    ],
    example: 'vocals',
  },

  filter_operator: {
    label: 'Operator',
    description: 'How to match the filter value.',
    tips: [
      '"contains" = field contains this text',
      '"contains_any" = field contains any of these values',
      '"equals" = exact match only',
      '"not_equals" = exclude tracks that match',
    ],
  },

  filter_value: {
    label: 'Filter Value',
    description: 'The value(s) to match against.',
    tips: [
      'For contains_any, use commas: "Female,Male,Choir"',
      'For contains, use a single value: "No Vocals"',
      'Values are case-sensitive in some fields',
    ],
    example: 'No Vocals',
  },

  // Subgenre Interleaving fields
  attribute: {
    label: 'Attribute',
    description: 'What track attribute to interleave by.',
    tips: [
      '"genre" for subgenre variety',
      '"mood" for emotional variety',
      '"library_name" for library variety',
    ],
    example: 'genre',
  },

  subgenre_values: {
    label: 'Values (A-Z)',
    description: 'Map letters to specific attribute values.',
    tips: [
      'A = first value in rotation',
      'B = second value, etc.',
      'Only use letters you include in the pattern',
    ],
    example: 'A: Classic Rock, B: Indie Rock, C: Alternative Rock',
  },

  subgenre_pattern: {
    label: 'Interleave Pattern',
    description: 'Letter sequence determining the order of results.',
    tips: [
      'Use letters A-Z that you defined in Values',
      '"ABCD ABCD" = rotate through 4 values twice',
      'Spaces are ignored (use for readability)',
    ],
    example: 'ABCD ABCD ABCD',
  },

  fallback: {
    label: 'Fallback Strategy',
    description: 'What to do when a value runs out of tracks.',
    tips: [
      '"relevance" = fill slot with next best track from any value',
      '"skip" = leave the slot empty',
      '"relevance" usually gives better results',
    ],
  },
};
