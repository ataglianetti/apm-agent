/**
 * Metadata Enhancer Service
 * Enriches tracks with genre names and formats display fields
 *
 * Note: All mood, instrument, tempo, and other metadata comes from
 * the facet_labels field which contains real facet data from the database.
 * We do NOT fabricate metadata from descriptions.
 */

import { enrichTrackWithGenreNames } from './genreMapper.js';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'apm_music.db');

let db = null;

function getDb() {
  if (!db) {
    db = new Database(dbPath, { readonly: true });
    db.pragma('journal_mode = WAL');
  }
  return db;
}

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
    const durationSeconds =
      typeof track.duration === 'number'
        ? track.duration
        : track.duration.includes(':')
          ? null
          : parseInt(track.duration, 10);

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
    duration_seconds:
      typeof track.duration === 'number' ? track.duration : parseInt(track.duration, 10) || null,

    // Genre display: use mapped name, or handle array format from Claude, or fallback
    genre:
      enrichedTrack.genre_name ||
      (Array.isArray(track.genre) ? track.genre[0] : track.genre) ||
      null,

    // Keep original genre ID for backward compatibility
    genre_id: track.master_genre_id || (Array.isArray(track.genre) ? null : track.genre),
  };
}

/**
 * Enhance multiple tracks
 */
export function enhanceTracksMetadata(tracks) {
  return tracks.map(track => enhanceTrackMetadata(track));
}

/**
 * Enrich tracks with full version data from SQLite
 * Replaces minimal Solr version data {id, track_title, duration, library_name}
 * with complete track records including description, bpm, genre, facets, etc.
 */
export function enrichTracksWithFullVersions(tracks) {
  // Collect all version IDs from all tracks
  const allVersionIds = [];
  const trackVersionMap = new Map(); // trackId -> [versionIds]

  for (const track of tracks) {
    if (track.versions && Array.isArray(track.versions) && track.versions.length > 0) {
      const versionIds = track.versions.map(v => v.id);
      trackVersionMap.set(track.id, versionIds);
      allVersionIds.push(...versionIds);
    }
  }

  // If no versions to enrich, return tracks as-is
  if (allVersionIds.length === 0) {
    return tracks;
  }

  // Fetch full track data for all version IDs in a single query
  const db = getDb();
  const placeholders = allVersionIds.map(() => '?').join(',');
  const fullVersions = db
    .prepare(
      `
    SELECT
      t.id, t.track_title, t.track_description, t.bpm, t.duration,
      t.album_title, t.library_name, t.composer_fullname as composer,
      t.apm_release_date, t.master_genre_id, t.facet_labels,
      g.genre_name
    FROM tracks t
    LEFT JOIN genre_taxonomy g ON t.master_genre_id = g.genre_id
    WHERE t.id IN (${placeholders})
  `
    )
    .all(...allVersionIds);

  // Create a map of version ID -> full track data
  const versionDataMap = new Map();
  for (const version of fullVersions) {
    versionDataMap.set(version.id, version);
  }

  // Replace minimal version data with full track data
  return tracks.map(track => {
    if (!trackVersionMap.has(track.id)) {
      return track;
    }

    const versionIds = trackVersionMap.get(track.id);
    const enrichedVersions = versionIds.map(id => versionDataMap.get(id)).filter(Boolean); // Remove any that weren't found

    return {
      ...track,
      versions: enrichedVersions,
    };
  });
}

export default {
  enhanceTrackMetadata,
  enhanceTracksMetadata,
  enrichTracksWithFullVersions,
};
