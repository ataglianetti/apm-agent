/**
 * Metadata Enhancer Service
 * Adds mood, energy, use cases, and other metadata to tracks
 * This simulates the additional metadata that would typically be available
 * in a professional music licensing system
 */

import { enrichTrackWithGenreNames } from './genreMapper.js';

// Mood extraction patterns
const moodPatterns = {
  // Positive moods
  uplifting: /uplift|positive|bright|cheerful|optimistic|hopeful/i,
  happy: /happy|joy|fun|playful|celebrat/i,
  energetic: /energetic|energy|dynamic|driving|powerful|intense/i,
  inspiring: /inspir|motivat|triumphant|victorious|heroic/i,
  romantic: /romantic|love|tender|intimate|passionate/i,
  peaceful: /peaceful|calm|serene|tranquil|relaxing|gentle/i,

  // Negative/Dark moods
  dark: /dark|ominous|sinister|brooding|menacing/i,
  sad: /sad|melanchol|sorrow|tragic|mourn/i,
  tense: /tense|tension|suspense|anxious|nervous|thriller/i,
  angry: /angry|aggressive|fierce|violent|rage/i,
  mysterious: /mysterious|mystery|enigmatic|curious|strange/i,

  // Neutral moods
  reflective: /reflective|contemplative|thoughtful|introspective|pensive/i,
  ambient: /ambient|atmospheric|ethereal|floating|spacey/i,
  quirky: /quirky|whimsical|odd|peculiar|unusual/i,
  dramatic: /dramatic|cinematic|epic|grand|majestic/i,
  nostalgic: /nostalgic|retro|vintage|classic|throwback/i
};

// Energy level extraction
const energyPatterns = {
  high: /high.?energy|intense|powerful|driving|aggressive|explosive|fast/i,
  medium_high: /upbeat|lively|dynamic|active|energetic/i,
  medium: /moderate|steady|consistent|flowing/i,
  medium_low: /relaxed|mellow|laid.?back|easy/i,
  low: /calm|peaceful|quiet|soft|gentle|slow|ambient/i
};

// Use case/purpose extraction
const useCasePatterns = {
  advertising: /commercial|advertis|promo|product|brand|corporate/i,
  film_tv: /film|movie|cinema|television|tv|drama|scene/i,
  documentary: /documentary|factual|nature|history|education/i,
  sports: /sport|athletic|competition|victory|champion/i,
  news: /news|broadcast|urgent|breaking|current/i,
  gaming: /game|gaming|video.?game|arcade|electronic/i,
  trailer: /trailer|preview|teaser|promo/i,
  background: /background|underscore|bed|ambient/i,
  presentation: /presentation|corporate|business|professional/i,
  podcast: /podcast|talk|conversation|interview/i,
  social_media: /social|viral|tiktok|youtube|instagram/i,
  event: /event|celebration|party|wedding|ceremony/i
};

// Instrument extraction
const instrumentPatterns = {
  // Strings
  guitar: /guitar|acoustic.?guitar|electric.?guitar/i,
  piano: /piano|keyboard/i,
  strings: /strings|violin|viola|cello|orchestra/i,

  // Rhythm
  drums: /drums|percussion|beat/i,
  bass: /bass/i,

  // Electronic
  synth: /synth|synthesizer|electronic/i,

  // Wind
  brass: /brass|trumpet|trombone|horn/i,
  woodwind: /woodwind|flute|clarinet|sax/i,

  // Vocals
  vocals: /vocal|voice|choir|sing/i
};

// Era/Period extraction
const eraPatterns = {
  modern: /modern|contemporary|current|today|2020s|2010s/i,
  '2000s': /2000s|millennium/i,
  '90s': /90s|1990s|nineties/i,
  '80s': /80s|1980s|eighties|retro.?wave/i,
  '70s': /70s|1970s|seventies|disco/i,
  '60s': /60s|1960s|sixties/i,
  vintage: /vintage|classic|old.?school|traditional/i,
  classical: /classical|baroque|romantic.?period|renaissance/i
};

/**
 * Extract moods from track description
 */
function extractMoods(description) {
  const moods = [];
  for (const [mood, pattern] of Object.entries(moodPatterns)) {
    if (pattern.test(description)) {
      moods.push(mood);
    }
  }
  return moods.length > 0 ? moods : ['neutral'];
}

/**
 * Extract energy level from description and BPM
 */
function extractEnergy(description, bpm) {
  // First check description
  for (const [level, pattern] of Object.entries(energyPatterns)) {
    if (pattern.test(description)) {
      return level;
    }
  }

  // Fallback to BPM-based energy
  const bpmNum = parseInt(bpm);
  if (bpmNum > 140) return 'high';
  if (bpmNum > 120) return 'medium_high';
  if (bpmNum > 100) return 'medium';
  if (bpmNum > 80) return 'medium_low';
  return 'low';
}

/**
 * Extract use cases from description
 */
function extractUseCases(description) {
  const useCases = [];
  for (const [useCase, pattern] of Object.entries(useCasePatterns)) {
    if (pattern.test(description)) {
      useCases.push(useCase);
    }
  }
  return useCases.length > 0 ? useCases : ['general'];
}

/**
 * Extract instruments from description
 */
function extractInstruments(description) {
  const instruments = [];
  for (const [instrument, pattern] of Object.entries(instrumentPatterns)) {
    if (pattern.test(description)) {
      instruments.push(instrument);
    }
  }
  return instruments;
}

/**
 * Extract era/period from description
 */
function extractEra(description) {
  for (const [era, pattern] of Object.entries(eraPatterns)) {
    if (pattern.test(description)) {
      return era;
    }
  }
  return 'contemporary';
}

/**
 * Generate keywords from all extracted metadata
 */
function generateKeywords(track, enhancedMetadata) {
  const keywords = new Set();

  // Add moods
  enhancedMetadata.moods.forEach(mood => keywords.add(mood));

  // Add energy
  keywords.add(enhancedMetadata.energy_level);

  // Add use cases
  enhancedMetadata.use_cases.forEach(useCase => keywords.add(useCase));

  // Add instruments
  enhancedMetadata.instruments.forEach(instrument => keywords.add(instrument));

  // Add era
  keywords.add(enhancedMetadata.era);

  // Add genre name
  if (track.genre_name) {
    keywords.add(track.genre_name.toLowerCase().replace(/[^a-z0-9]/g, ''));
  }

  // Extract additional keywords from description
  const descWords = track.track_description.toLowerCase()
    .split(/\s+/)
    .filter(word => word.length > 4 && !['with', 'from', 'that', 'this', 'have'].includes(word))
    .slice(0, 5);

  descWords.forEach(word => keywords.add(word.replace(/[^a-z0-9]/g, '')));

  return Array.from(keywords).filter(k => k);
}

/**
 * Main function to enhance a track with additional metadata
 */
export function enhanceTrackMetadata(track) {
  // First add genre names
  const enrichedTrack = enrichTrackWithGenreNames(track);

  // Extract metadata from description
  const description = track.track_description || '';

  const enhancedMetadata = {
    // Extracted metadata
    moods: extractMoods(description),
    energy_level: extractEnergy(description, track.bpm),
    use_cases: extractUseCases(description),
    instruments: extractInstruments(description),
    era: extractEra(description),

    // Formatted for display
    mood: extractMoods(description).join(', '),
    energy: extractEnergy(description, track.bpm).replace(/_/g, ' '),
    use_case: extractUseCases(description).join(', '),
    instrumentation: extractInstruments(description).join(', ') || 'Various',

    // Additional useful fields
    tempo_category: categorizeTempo(track.bpm),
    duration_category: categorizeDuration(track.duration),
  };

  // Generate keywords
  enhancedMetadata.keywords = generateKeywords(enrichedTrack, enhancedMetadata);

  // Add all enhanced metadata to the track
  return {
    ...enrichedTrack,
    ...enhancedMetadata,

    // Keep original genre ID for backward compatibility
    genre_id: track.genre,

    // Add searchable text field combining all metadata
    search_text: [
      track.track_title,
      track.track_description,
      track.composer,
      track.album_title,
      track.library_name,
      enrichedTrack.genre_name,
      enrichedTrack.additional_genres_names,
      ...enhancedMetadata.keywords
    ].filter(Boolean).join(' ').toLowerCase()
  };
}

/**
 * Categorize tempo into ranges
 */
function categorizeTempo(bpm) {
  const bpmNum = parseInt(bpm);
  if (bpmNum < 60) return 'Very Slow';
  if (bpmNum < 80) return 'Slow';
  if (bpmNum < 100) return 'Moderate';
  if (bpmNum < 120) return 'Medium';
  if (bpmNum < 140) return 'Fast';
  if (bpmNum < 160) return 'Very Fast';
  return 'Extreme';
}

/**
 * Categorize duration
 */
function categorizeDuration(duration) {
  const seconds = parseInt(duration);
  if (seconds <= 15) return 'Sting';
  if (seconds <= 30) return 'Short';
  if (seconds <= 60) return 'Standard';
  if (seconds <= 120) return 'Medium';
  if (seconds <= 180) return 'Long';
  return 'Extended';
}

/**
 * Enhance multiple tracks
 */
export function enhanceTracksMetadata(tracks) {
  return tracks.map(track => enhanceTrackMetadata(track));
}

export default {
  enhanceTrackMetadata,
  enhanceTracksMetadata
};