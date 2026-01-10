/**
 * Help content for all 7 business rule types
 * Written for non-technical users who want to create rules without engineering help
 */
export const RULE_TYPE_HELP = {
  genre_simplification: {
    title: 'Genre Simplification',
    color: 'blue',
    summary: 'Automatically expands a genre search to include related subgenres.',
    whenToUse:
      'When users search for a broad genre like "rock" and you want results to include Classic Rock, Indie Rock, Alternative Rock, etc. without them having to know all the subgenre names.',
    example: 'User searches "jazz" and results include Bebop, Cool Jazz, Modal Jazz, and Fusion.',
    howItWorks:
      'When the pattern matches the search query, the rule automatically adds the specified subgenres to the search. This uses OR logic by default (matches any of the genres).',
    fields: {
      auto_apply_facets:
        'List of subgenres to include in the search. Each value must match exactly how it appears in the taxonomy.',
      mode: 'How to combine the genres. "expand" (default) uses OR logic to include any matching genre. "restrict" uses AND logic to require matches from the specified genres only.',
    },
  },

  library_boost: {
    title: 'Library Boost',
    color: 'green',
    summary: 'Increases relevance scores for tracks from specific music libraries.',
    whenToUse:
      'When certain libraries should rank higher for specific keyword searches. For example, MLB Music should rank higher for "sports" or "baseball" queries.',
    example:
      'When someone searches "corporate presentation", tracks from the Corporate Music library get a 1.5x boost and appear higher in results.',
    howItWorks:
      'When the pattern matches, all tracks from the specified libraries have their relevance scores multiplied by the boost factor. Higher scores mean higher ranking in results.',
    fields: {
      library_name:
        'The exact name of the library to boost. Must match the library name in the database.',
      boost_factor:
        'How much to multiply the relevance score. 1.5 = 50% boost, 2.0 = double the score. Higher values push tracks higher in results.',
    },
  },

  recency_interleaving: {
    title: 'Recency Interleaving',
    color: 'yellow',
    summary: 'Mixes recent and vintage tracks in a specific pattern for variety.',
    whenToUse:
      'When you want search results to feature fresh content prominently while still including catalog classics. Great for genres where trends matter (pop, electronic, hip-hop).',
    example:
      'For pop music, use pattern "RRRR VRRR" to show 4 recent tracks, then 1 vintage, then 3 recent, then 1 vintage, creating a 4:1 ratio favoring new content.',
    howItWorks:
      'The rule separates search results into "recent" and "vintage" buckets based on release date, then interleaves them according to your pattern. R = Recent track, V = Vintage track.',
    fields: {
      recent_threshold_months:
        'How old can a track be to count as "recent"? Default is 12 months. Tracks newer than this go in the Recent bucket.',
      vintage_max_months:
        'Maximum age for vintage tracks. Tracks older than this are excluded from interleaving entirely. Default is 60 months (5 years).',
      pattern:
        'The sequence of R (Recent) and V (Vintage) that determines result order. Spaces are ignored. Example: "RRRV RRRV" alternates 3 recent then 1 vintage.',
      repeat_count:
        'How many times to repeat the pattern across pages of results. Set to 3 for the pattern to apply to about 60 results.',
    },
  },

  feature_boost: {
    title: 'Feature Boost',
    color: 'purple',
    summary: 'Boosts tracks that have a specific attribute or feature.',
    whenToUse:
      'When searches mention special features that should prioritize tracks with those attributes. For example, boost tracks with stems when users search for "stems" or "multitrack".',
    example:
      'When someone searches "stems for remix", tracks with has_stems=true get a 2x score boost and appear at the top.',
    howItWorks:
      'When the pattern matches, the rule checks each track for the specified field/value combination and multiplies matching tracks scores by the boost factor.',
    fields: {
      boost_field:
        'The track attribute to check. Common examples: has_stems, has_instrumental, is_featured.',
      boost_value: 'The value to match. For boolean fields, use "true" or "false".',
      boost_factor:
        'Score multiplier for tracks that match. 2.0 = double their score, pushing them to the top of results.',
    },
  },

  recency_decay: {
    title: 'Recency Decay',
    color: 'orange',
    summary: 'Gradually reduces scores for older tracks using a smooth decay curve.',
    whenToUse:
      'When newer content should generally rank higher across all searches, but you do not want to completely bury catalog classics. More subtle than interleaving.',
    example:
      'A 2-year-old track keeps 90% of its score. An 8-year-old track keeps 77%. Nothing drops below 65%, protecting timeless classics.',
    howItWorks:
      'Every track gets a "recency factor" based on its age. New tracks get 100%. Older tracks are multiplied by a factor that decreases logarithmically (fast at first, then slows down). There is a floor so classics are never completely buried.',
    fields: {
      horizon_months:
        'The reference point for decay calculation. Default is 24 months. At this age, tracks get the horizon_threshold score.',
      horizon_threshold:
        'What percentage of the original score a track keeps at the horizon age. 0.9 = 90% at 24 months old.',
      min_factor:
        'The floor score. No track ever drops below this percentage. 0.65 = 65% minimum, protecting catalog classics.',
      date_field:
        'Which database field contains the release date. Usually "apm_release_date". Do not change unless you know the schema.',
    },
  },

  filter_optimization: {
    title: 'Filter Optimization',
    color: 'pink',
    summary: 'Automatically applies filters based on keywords in the search query.',
    whenToUse:
      'When certain keywords should trigger automatic filtering without users clicking filter buttons. For example, "instrumental" should automatically filter to tracks with no vocals.',
    example:
      'When someone searches "instrumental background music", the rule automatically filters to vocals="No Vocals" so only instrumental tracks appear.',
    howItWorks:
      'When the pattern matches, the rule adds a filter to the search query before it runs. This is a hard filter that excludes non-matching tracks entirely.',
    fields: {
      field: 'Which track field to filter on. Common examples: vocals, genre, library_name.',
      operator:
        'How to match the value. "contains" = field contains this text. "contains_any" = field contains any of these comma-separated values. "equals" = exact match. "not_equals" = exclude matches.',
      value:
        'The value(s) to match. For contains_any, use commas: "Female,Male,Choir". For contains, use a single value: "No Vocals".',
    },
  },

  subgenre_interleaving: {
    title: 'Subgenre Interleaving',
    color: 'cyan',
    summary: 'Alternates results between different subgenres for variety.',
    whenToUse:
      'When search results cluster too heavily in one subgenre and you want to show variety. For example, a "rock" search should rotate through Classic Rock, Indie Rock, and Alternative Rock instead of showing all Classic Rock first.',
    example:
      'Pattern "ABCD" with A=Classic Rock, B=Indie Rock, C=Alternative Rock, D=Hard Rock ensures users see one track from each subgenre in sequence.',
    howItWorks:
      'The rule groups results by the specified attribute (usually genre), assigns letters A-Z to each group, then reorders results to follow your pattern. If a group runs out of tracks, the fallback strategy kicks in.',
    fields: {
      attribute:
        'What to interleave by. Usually "genre" for subgenres, but could be "mood", "library_name", or other attributes.',
      values:
        'Map letters to specific values. A = first value, B = second, etc. Each letter represents a different subgenre or attribute value.',
      pattern:
        'The letter sequence that determines order. "ABCD ABCD" rotates through 4 subgenres twice. Spaces are ignored.',
      fallback:
        'What to do when a subgenre runs out of tracks. "relevance" fills the slot with the next best track from any subgenre. "skip" leaves the slot empty.',
    },
  },
};

/**
 * Get the color classes for a rule type badge
 */
export function getRuleTypeColor(type) {
  const colors = {
    genre_simplification: {
      bg: 'bg-blue-500',
      text: 'text-blue-500',
      light: 'bg-blue-500/10',
    },
    library_boost: {
      bg: 'bg-green-500',
      text: 'text-green-500',
      light: 'bg-green-500/10',
    },
    recency_interleaving: {
      bg: 'bg-yellow-500',
      text: 'text-yellow-500',
      light: 'bg-yellow-500/10',
    },
    feature_boost: {
      bg: 'bg-purple-500',
      text: 'text-purple-500',
      light: 'bg-purple-500/10',
    },
    recency_decay: {
      bg: 'bg-orange-500',
      text: 'text-orange-500',
      light: 'bg-orange-500/10',
    },
    filter_optimization: {
      bg: 'bg-pink-500',
      text: 'text-pink-500',
      light: 'bg-pink-500/10',
    },
    subgenre_interleaving: {
      bg: 'bg-cyan-500',
      text: 'text-cyan-500',
      light: 'bg-cyan-500/10',
    },
  };
  return colors[type] || colors.genre_simplification;
}
