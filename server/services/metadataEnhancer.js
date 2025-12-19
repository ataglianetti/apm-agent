/**
 * Metadata Enhancer Service
 * Enriches tracks with genre names and formats display fields
 *
 * Note: All mood, instrument, tempo, and other metadata comes from
 * the facet_labels field which contains real facet data from the database.
 * We do NOT fabricate metadata from descriptions.
 */

import { enrichTrackWithGenreNames } from './genreMapper.js';

/**
 * Main function to enhance a track with additional metadata
 * - Adds human-readable genre names from genre_taxonomy
 * - Formats duration from seconds to MM:SS
 * - Preserves all real facet data from facet_labels
 */
export function enhanceTrackMetadata(track) {
  // Add genre names from taxonomy
  const enrichedTrack = enrichTrackWithGenreNames(track);

  // Format duration from seconds to MM:SS for display
  let formattedDuration = track.duration;
  if (track.duration) {
    // Handle both integer (new schema) and string (old schema)
    const durationSeconds = typeof track.duration === 'number'
      ? track.duration
      : (track.duration.includes(':') ? null : parseInt(track.duration, 10));

    if (durationSeconds !== null && !isNaN(durationSeconds) && durationSeconds > 0) {
      const minutes = Math.floor(durationSeconds / 60);
      const seconds = durationSeconds % 60;
      formattedDuration = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
  }

  return {
    ...enrichedTrack,

    // Replace duration with formatted MM:SS
    duration: formattedDuration,

    // Keep original duration in seconds for sorting/filtering
    duration_seconds: typeof track.duration === 'number' ? track.duration : parseInt(track.duration, 10) || null,

    // Genre display: use mapped name, or handle array format from Claude, or fallback
    genre: enrichedTrack.genre_name
      || (Array.isArray(track.genre) ? track.genre[0] : track.genre)
      || null,

    // Keep original genre ID for backward compatibility
    genre_id: track.master_genre_id || (Array.isArray(track.genre) ? null : track.genre)
  };
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
