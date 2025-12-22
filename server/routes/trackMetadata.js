/**
 * Track Metadata API
 * Provides transparency into search relevance and business rules
 *
 * This endpoint returns detailed metadata about how a track matched a search query,
 * including:
 * - Facet matches with weights
 * - Text field matches with scores
 * - Applied business rules
 * - Score breakdown and adjustments
 * - Rank changes
 */

import express from 'express';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'apm_music.db');

const router = express.Router();

let db = null;

function getDb() {
  if (!db) {
    db = new Database(dbPath, { readonly: true });
    db.pragma('journal_mode = WAL');
  }
  return db;
}

/**
 * GET /api/tracks/:id/metadata
 * Returns comprehensive metadata about a track and its search relevance
 *
 * Query parameters:
 * - query: Original search query (optional, for relevance context)
 * - includeRules: Include applied business rules (default: true)
 * - includeFacets: Include facet matches (default: true)
 * - includeScores: Include score breakdown (default: true)
 */
router.get('/tracks/:id/metadata', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      query = '',
      includeRules = 'true',
      includeFacets = 'true',
      includeScores = 'true'
    } = req.query;

    const db = getDb();

    // Get basic track information
    const track = db.prepare(`
      SELECT * FROM tracks WHERE id = ?
    `).get(id);

    if (!track) {
      return res.status(404).json({
        error: 'Track not found',
        details: `No track found with ID: ${id}`
      });
    }

    // Build response object
    const metadata = {
      track: {
        id: track.id,
        track_title: track.track_title,
        track_description: track.track_description,
        album_title: track.album_title,
        library_name: track.library_name,
        composer: track.composer,
        bpm: track.bpm,
        duration: track.duration,
        apm_release_date: track.apm_release_date,
        has_stems: track.has_stems
      }
    };

    // Include facet matches if requested
    if (includeFacets === 'true') {
      const facets = db.prepare(`
        SELECT
          ft.facet_id,
          ft.facet_label,
          ft.facet_name,
          ft.category_name,
          ft.category_id
        FROM track_facets tf
        INNER JOIN facet_taxonomy ft ON tf.facet_id = ft.facet_id
        WHERE tf.track_id = ?
        ORDER BY ft.category_name, ft.facet_label
      `).all(id);

      metadata.facets = facets.map(f => ({
        category: f.category_name,
        label: f.facet_label,
        name: f.facet_name,
        facet_id: f.facet_id
      }));

      // Group facets by category for easier display
      metadata.facetsByCategory = facets.reduce((acc, f) => {
        if (!acc[f.category_name]) {
          acc[f.category_name] = [];
        }
        acc[f.category_name].push({
          label: f.facet_label,
          name: f.facet_name,
          facet_id: f.facet_id
        });
        return acc;
      }, {});
    }

    // Include genre information (enhanced metadata)
    if (track.genre) {
      const genreIds = track.genre.split(';').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
      const genreNames = [];

      for (const genreId of genreIds) {
        const genre = db.prepare(`
          SELECT genre_name FROM genre_taxonomy WHERE genre_id = ?
        `).get(genreId);

        if (genre) {
          genreNames.push(genre.genre_name);
        }
      }

      metadata.track.genre_names = genreNames;
    }

    // Include additional genres
    if (track.additional_genres) {
      const additionalIds = track.additional_genres.split(';').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
      const additionalNames = [];

      for (const genreId of additionalIds) {
        const genre = db.prepare(`
          SELECT genre_name FROM genre_taxonomy WHERE genre_id = ?
        `).get(genreId);

        if (genre) {
          additionalNames.push(genre.genre_name);
        }
      }

      metadata.track.additional_genre_names = additionalNames;
    }

    // Include score breakdown if requested and _score_breakdown exists
    if (includeScores === 'true' && track._score_breakdown) {
      try {
        metadata.scoreBreakdown = JSON.parse(track._score_breakdown);
        metadata.totalScore = track._relevance_score || 0;
        metadata.boostApplied = track._boost_applied || null;
      } catch (_e) {
        // Score breakdown not available or malformed
        metadata.scoreBreakdown = null;
      }
    }

    // Include query context if provided
    if (query) {
      metadata.query = query;

      // Highlight matches in track fields
      const queryLower = query.toLowerCase();
      const matches = [];

      if (track.track_title && track.track_title.toLowerCase().includes(queryLower)) {
        matches.push({ field: 'track_title', value: track.track_title });
      }

      if (track.track_description && track.track_description.toLowerCase().includes(queryLower)) {
        matches.push({ field: 'track_description', value: track.track_description });
      }

      if (track.album_title && track.album_title.toLowerCase().includes(queryLower)) {
        matches.push({ field: 'album_title', value: track.album_title });
      }

      if (track.composer && track.composer.toLowerCase().includes(queryLower)) {
        matches.push({ field: 'composer', value: track.composer });
      }

      metadata.textMatches = matches;
    }

    // Include business rules context (placeholder - would be populated from search context)
    if (includeRules === 'true') {
      metadata.appliedRules = [];

      // Note: In a real implementation, this would be passed from the search context
      // For now, we return an empty array, but the structure is ready
      // This would be populated when the track is returned as part of search results

      metadata.ruleTransparency = {
        note: 'Business rule transparency is available in search result context',
        supported: true
      };
    }

    res.json(metadata);

  } catch (error) {
    console.error('Track metadata error:', error);
    res.status(500).json({
      error: 'Failed to fetch track metadata',
      details: process.env.NODE_ENV === 'development' ? error.message : 'An internal error occurred'
    });
  }
});

/**
 * GET /api/tracks/:id/similar
 * Returns tracks similar to the specified track
 */
router.get('/tracks/:id/similar', async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 12 } = req.query;

    const db = getDb();

    // Get the source track's facets to find similar tracks
    const sourceFacets = db.prepare(`
      SELECT facet_id FROM track_facets WHERE track_id = ?
    `).all(id);

    if (sourceFacets.length === 0) {
      return res.status(404).json({
        error: 'Track not found or has no facets',
        details: `No track found with ID: ${id} or track has no facet metadata`
      });
    }

    const facetIds = sourceFacets.map(f => f.facet_id);
    const placeholders = facetIds.map(() => '?').join(',');

    // Find tracks that share the most facets with the source track
    const similarTracks = db.prepare(`
      SELECT
        t.*,
        COUNT(DISTINCT tf.facet_id) as shared_facets
      FROM tracks t
      INNER JOIN track_facets tf ON t.id = tf.track_id
      WHERE tf.facet_id IN (${placeholders})
        AND t.id != ?
      GROUP BY t.id
      ORDER BY shared_facets DESC, t.track_title
      LIMIT ?
    `).all(...facetIds, id, parseInt(limit));

    res.json({
      source_track_id: id,
      similar_tracks: similarTracks,
      total_count: similarTracks.length
    });

  } catch (error) {
    console.error('Similar tracks error:', error);
    res.status(500).json({
      error: 'Failed to fetch similar tracks',
      details: process.env.NODE_ENV === 'development' ? error.message : 'An internal error occurred'
    });
  }
});

/**
 * GET /api/tracks/:id/facets
 * Returns all facets for a specific track, grouped by category
 */
router.get('/tracks/:id/facets', async (req, res) => {
  try {
    const { id } = req.params;
    const db = getDb();

    const facets = db.prepare(`
      SELECT
        ft.facet_id,
        ft.facet_label,
        ft.facet_name,
        ft.category_name,
        ft.category_id
      FROM track_facets tf
      INNER JOIN facet_taxonomy ft ON tf.facet_id = ft.facet_id
      WHERE tf.track_id = ?
      ORDER BY ft.category_name, ft.facet_label
    `).all(id);

    if (facets.length === 0) {
      return res.status(404).json({
        error: 'Track not found or has no facets',
        details: `No facets found for track ID: ${id}`
      });
    }

    // Group by category
    const grouped = facets.reduce((acc, f) => {
      if (!acc[f.category_name]) {
        acc[f.category_name] = [];
      }
      acc[f.category_name].push({
        label: f.facet_label,
        name: f.facet_name,
        facet_id: f.facet_id
      });
      return acc;
    }, {});

    res.json({
      track_id: id,
      facets: facets,
      facetsByCategory: grouped,
      categoryCount: Object.keys(grouped).length,
      totalFacets: facets.length
    });

  } catch (error) {
    console.error('Track facets error:', error);
    res.status(500).json({
      error: 'Failed to fetch track facets',
      details: process.env.NODE_ENV === 'development' ? error.message : 'An internal error occurred'
    });
  }
});

/**
 * GET /api/tracks/:id/versions
 * Returns all versions of a track (tracks sharing the same song_id)
 * Excludes the requested track from results
 */
router.get('/tracks/:id/versions', async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 20 } = req.query;

    const db = getDb();

    // First, get the song_id for the requested track
    const sourceTrack = db.prepare(`
      SELECT song_id, song_title FROM tracks WHERE id = ?
    `).get(id);

    if (!sourceTrack) {
      return res.status(404).json({
        error: 'Track not found',
        details: `No track found with ID: ${id}`
      });
    }

    if (!sourceTrack.song_id) {
      return res.json({
        track_id: id,
        versions: [],
        version_count: 0,
        message: 'This track has no song_id - no versions available'
      });
    }

    // Get all versions with the same song_id, excluding the source track
    // Join with genre_taxonomy to get human-readable genre name
    const versions = db.prepare(`
      SELECT
        t.id, t.track_title, t.track_description, t.bpm, t.duration,
        t.album_title, t.library_name, t.composer_fullname as composer,
        t.apm_release_date, t.master_genre_id, t.facet_labels,
        g.genre_name
      FROM tracks t
      LEFT JOIN genre_taxonomy g ON t.master_genre_id = g.genre_id
      WHERE t.song_id = ? AND t.id != ?
      ORDER BY t.library_name, t.track_title
      LIMIT ?
    `).all(sourceTrack.song_id, id, parseInt(limit));

    // Get total count (including source track)
    const countResult = db.prepare(`
      SELECT COUNT(*) as total FROM tracks WHERE song_id = ?
    `).get(sourceTrack.song_id);

    res.json({
      track_id: id,
      song_id: sourceTrack.song_id,
      song_title: sourceTrack.song_title,
      versions: versions,
      version_count: versions.length,
      total_versions: countResult.total
    });

  } catch (error) {
    console.error('Track versions error:', error);
    res.status(500).json({
      error: 'Failed to fetch track versions',
      details: process.env.NODE_ENV === 'development' ? error.message : 'An internal error occurred'
    });
  }
});

export default router;
