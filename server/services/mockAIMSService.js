/**
 * Mock AIMS Service
 * Simulates AI Music Search for prompt-based and audio similarity search
 * Uses semantic matching on descriptions and pre-computed similarities
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { parse } from 'csv-parse/sync';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class MockAIMSService {
  constructor() {
    this.db = new Database(path.join(__dirname, '..', 'apm_music.db'), {
      readonly: false,
      fileMustExist: true
    });

    // Enable performance optimizations
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('cache_size = 10000');
    this.db.pragma('temp_store = MEMORY');

    // Load pre-computed prompt results (fallback)
    this.promptResults = this.loadPromptResults();

    // Load similarity mappings
    this.audioSimilarities = this.loadAudioSimilarities();
    this.mockReferences = this.loadMockReferences();
  }

  /**
   * Load prompt_results.csv for fallback
   */
  loadPromptResults() {
    try {
      const csvPath = path.join(__dirname, '..', '..', 'data', 'prompt_results.csv');
      if (fs.existsSync(csvPath)) {
        const fileContent = fs.readFileSync(csvPath, 'utf-8');
        const records = parse(fileContent, {
          columns: true,
          skip_empty_lines: true
        });

        // Group by prompt
        const grouped = {};
        records.forEach(record => {
          if (!grouped[record.prompt]) {
            grouped[record.prompt] = [];
          }
          grouped[record.prompt].push(record.id);
        });
        return grouped;
      }
    } catch (error) {
      console.warn('Could not load prompt_results.csv:', error.message);
    }
    return {};
  }

  /**
   * Load audio_similarities.csv
   */
  loadAudioSimilarities() {
    try {
      const csvPath = path.join(__dirname, '..', '..', 'data', 'audio_similarities.csv');
      if (fs.existsSync(csvPath)) {
        const fileContent = fs.readFileSync(csvPath, 'utf-8');
        const records = parse(fileContent, {
          columns: true,
          skip_empty_lines: true
        });

        // Group by source_id
        const grouped = {};
        records.forEach(record => {
          if (!grouped[record.source_id]) {
            grouped[record.source_id] = [];
          }
          grouped[record.source_id].push({
            id: record.similar_id,
            score: parseFloat(record.similarity_score || 0.8)
          });
        });
        return grouped;
      }
    } catch (error) {
      console.warn('Could not load audio_similarities.csv:', error.message);
    }
    return {};
  }

  /**
   * Load mock_references.csv for URL/file mappings
   */
  loadMockReferences() {
    try {
      const csvPath = path.join(__dirname, '..', '..', 'data', 'mock_references.csv');
      if (fs.existsSync(csvPath)) {
        const fileContent = fs.readFileSync(csvPath, 'utf-8');
        const records = parse(fileContent, {
          columns: true,
          skip_empty_lines: true
        });

        // Create URL to track ID mapping
        const mapping = {};
        records.forEach(record => {
          mapping[record.reference_url] = record.track_id;
        });
        return mapping;
      }
    } catch (error) {
      console.warn('Could not load mock_references.csv:', error.message);
    }
    return {};
  }

  /**
   * Main prompt search method - semantic matching on descriptions
   * @param {string} prompt - Natural language query
   * @param {number} limit - Maximum results
   * @returns {Object} Search results with timing
   */
  async promptSearch(prompt, limit = 12) {
    const startTime = Date.now();

    try {
      // First check if we have pre-computed results for this exact prompt
      const lowerPrompt = prompt.toLowerCase();
      if (this.promptResults[lowerPrompt]) {
        const trackIds = this.promptResults[lowerPrompt].slice(0, limit);
        const tracks = await this.getTracksByIds(trackIds);

        return {
          success: true,
          searchType: 'prompt-precomputed',
          prompt,
          totalResults: tracks.length,
          results: tracks,
          timing: {
            aims: Date.now() - startTime,
            unit: 'ms'
          }
        };
      }

      // Otherwise, do semantic search on descriptions
      const keywords = this.extractKeywords(prompt);
      const results = await this.semanticDescriptionSearch(keywords, limit * 3); // Get more for scoring

      // Score and rank results
      const scored = results.map(track => ({
        ...track,
        relevanceScore: this.calculateRelevance(track, keywords, prompt)
      }));

      // Sort by relevance and limit
      scored.sort((a, b) => b.relevanceScore - a.relevanceScore);
      const topResults = scored.slice(0, limit);

      return {
        success: true,
        searchType: 'prompt-semantic',
        prompt,
        keywords,
        totalResults: topResults.length,
        results: topResults,
        timing: {
          aims: Date.now() - startTime,
          unit: 'ms'
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        timing: {
          aims: Date.now() - startTime,
          unit: 'ms'
        }
      };
    }
  }

  /**
   * Extract keywords from natural language prompt
   */
  extractKeywords(prompt) {
    const lowerPrompt = prompt.toLowerCase();

    // Mood/emotion keywords
    const moodKeywords = {
      uplifting: ['uplifting', 'positive', 'happy', 'joyful', 'bright', 'cheerful'],
      dark: ['dark', 'ominous', 'brooding', 'sinister', 'mysterious'],
      tension: ['tension', 'suspense', 'thriller', 'anxious', 'nervous'],
      emotional: ['emotional', 'heartfelt', 'touching', 'moving', 'sentimental'],
      energetic: ['energetic', 'dynamic', 'powerful', 'driving', 'intense'],
      calm: ['calm', 'peaceful', 'serene', 'relaxing', 'gentle', 'soft'],
      epic: ['epic', 'cinematic', 'orchestral', 'grand', 'majestic'],
      corporate: ['corporate', 'business', 'professional', 'commercial'],
      romantic: ['romantic', 'love', 'passionate', 'intimate'],
      melancholic: ['melancholic', 'sad', 'sorrowful', 'nostalgic'],
      aggressive: ['aggressive', 'angry', 'fierce', 'violent'],
      playful: ['playful', 'fun', 'whimsical', 'lighthearted', 'quirky']
    };

    // Energy levels
    const energyKeywords = {
      high: ['high energy', 'energetic', 'intense', 'powerful', 'dynamic'],
      medium: ['moderate', 'steady', 'consistent'],
      low: ['low energy', 'calm', 'relaxed', 'gentle', 'soft']
    };

    // Extract relevant keywords
    const extracted = [];

    // Check for mood keywords
    Object.entries(moodKeywords).forEach(([mood, words]) => {
      words.forEach(word => {
        if (lowerPrompt.includes(word)) {
          extracted.push(word);
        }
      });
    });

    // Check for energy keywords
    Object.entries(energyKeywords).forEach(([energy, words]) => {
      words.forEach(word => {
        if (lowerPrompt.includes(word)) {
          extracted.push(word);
        }
      });
    });

    // Add any other significant words (excluding common ones)
    const commonWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been', 'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could', 'may', 'might', 'must', 'can', 'shall', 'need', 'something', 'like', 'want', 'track', 'music', 'song'];

    const words = lowerPrompt.split(/\s+/);
    words.forEach(word => {
      const cleaned = word.replace(/[^a-z]/g, '');
      if (cleaned.length > 3 && !commonWords.includes(cleaned) && !extracted.includes(cleaned)) {
        extracted.push(cleaned);
      }
    });

    return extracted.length > 0 ? extracted : ['music'];
  }

  /**
   * Search track descriptions semantically
   */
  async semanticDescriptionSearch(keywords, limit = 50) {
    // Build SQL query with LIKE conditions for each keyword
    const conditions = keywords.map(() => 'LOWER(track_description) LIKE LOWER(?)');
    const params = keywords.map(keyword => `%${keyword}%`);

    // Also search track titles
    const titleConditions = keywords.map(() => 'LOWER(track_title) LIKE LOWER(?)');
    params.push(...keywords.map(keyword => `%${keyword}%`));

    const sql = `
      SELECT * FROM tracks
      WHERE (${conditions.join(' OR ')})
         OR (${titleConditions.join(' OR ')})
      LIMIT ?
    `;
    params.push(limit);

    const stmt = this.db.prepare(sql);
    return stmt.all(...params);
  }

  /**
   * Calculate relevance score for a track
   */
  calculateRelevance(track, keywords, originalPrompt) {
    let score = 0;
    const description = (track.track_description || '').toLowerCase();
    const title = (track.track_title || '').toLowerCase();
    const prompt = originalPrompt.toLowerCase();

    // Check each keyword
    keywords.forEach(keyword => {
      // Higher score for title matches
      if (title.includes(keyword)) {
        score += 3;
      }

      // Score for description matches
      if (description.includes(keyword)) {
        score += 2;
      }

      // Bonus for multiple occurrences
      const descMatches = (description.match(new RegExp(keyword, 'g')) || []).length;
      if (descMatches > 1) {
        score += descMatches - 1;
      }
    });

    // Bonus for exact phrase matches
    if (keywords.length > 1) {
      const phrase = keywords.join(' ');
      if (description.includes(phrase) || title.includes(phrase)) {
        score += 5;
      }
    }

    // Normalize by description length (prefer more relevant descriptions)
    if (description.length > 0) {
      score = score / Math.log(description.length);
    }

    return score;
  }

  /**
   * Audio similarity search
   * @param {string} reference - URL, file path, or track ID
   * @param {number} limit - Maximum results
   * @returns {Object} Similar tracks with timing
   */
  async audioSimilarity(reference, limit = 12) {
    const startTime = Date.now();

    try {
      let sourceTrackId = null;

      // Check if reference is a URL
      if (reference.startsWith('http') || reference.startsWith('www')) {
        sourceTrackId = this.mockReferences[reference];
        if (!sourceTrackId) {
          // Try to extract from YouTube/Spotify/TikTok URL patterns
          if (reference.includes('youtube.com') || reference.includes('youtu.be')) {
            // Mock: return tracks that might be similar to typical YouTube content
            return await this.fallbackSimilarity('energetic uplifting', limit, startTime);
          } else if (reference.includes('spotify.com')) {
            // Mock: return tracks that might be similar to Spotify content
            return await this.fallbackSimilarity('contemporary popular', limit, startTime);
          } else if (reference.includes('tiktok.com')) {
            // Mock: return short, catchy tracks
            return await this.fallbackSimilarity('catchy short', limit, startTime);
          }
        }
      } else if (reference.includes('/') || reference.includes('\\')) {
        // File path - check mock references
        const filename = reference.split(/[/\\]/).pop();
        Object.entries(this.mockReferences).forEach(([url, id]) => {
          if (url.includes(filename)) {
            sourceTrackId = id;
          }
        });
      } else {
        // Assume it's a track ID
        sourceTrackId = reference;
      }

      // If we have a source track ID, find similar tracks
      if (sourceTrackId) {
        // Check pre-computed similarities
        if (this.audioSimilarities[sourceTrackId]) {
          const similarTracks = this.audioSimilarities[sourceTrackId];
          const trackIds = similarTracks.slice(0, limit).map(t => t.id);
          const tracks = await this.getTracksByIds(trackIds);

          // Add similarity scores
          const resultsWithScores = tracks.map((track, index) => ({
            ...track,
            similarityScore: similarTracks[index]?.score || 0.8
          }));

          return {
            success: true,
            searchType: 'audio-similarity',
            reference,
            sourceTrackId,
            totalResults: resultsWithScores.length,
            results: resultsWithScores,
            timing: {
              aims: Date.now() - startTime,
              unit: 'ms'
            }
          };
        }

        // Fallback: Find tracks with similar properties
        const sourceTrack = await this.getTrackById(sourceTrackId);
        if (sourceTrack) {
          return await this.findSimilarByProperties(sourceTrack, limit, startTime);
        }
      }

      // No match found - use fallback
      return await this.fallbackSimilarity('similar music', limit, startTime);

    } catch (error) {
      return {
        success: false,
        error: error.message,
        timing: {
          aims: Date.now() - startTime,
          unit: 'ms'
        }
      };
    }
  }

  /**
   * Find similar tracks based on track properties
   */
  async findSimilarByProperties(sourceTrack, limit = 12, startTime = Date.now()) {
    const bpm = parseInt(sourceTrack.bpm) || 120;
    const bpmRange = 10;

    // Find tracks with similar genre and BPM
    const sql = `
      SELECT * FROM tracks
      WHERE id != ?
        AND (genre = ? OR additional_genres LIKE ?)
        AND ABS(CAST(bpm AS INTEGER) - ?) <= ?
      ORDER BY ABS(CAST(bpm AS INTEGER) - ?)
      LIMIT ?
    `;

    const stmt = this.db.prepare(sql);
    const similar = stmt.all(
      sourceTrack.id,
      sourceTrack.genre,
      `%${sourceTrack.genre}%`,
      bpm,
      bpmRange,
      bpm,
      limit
    );

    // Add similarity scores based on matching properties
    const results = similar.map(track => {
      let score = 0.5; // Base score

      // Same genre gets higher score
      if (track.genre === sourceTrack.genre) score += 0.2;

      // Similar BPM
      const bpmDiff = Math.abs(parseInt(track.bpm) - bpm);
      score += (1 - bpmDiff / 20) * 0.2;

      // Same composer
      if (track.composer === sourceTrack.composer) score += 0.1;

      return {
        ...track,
        similarityScore: Math.min(score, 1.0)
      };
    });

    return {
      success: true,
      searchType: 'audio-similarity-properties',
      reference: sourceTrack.id,
      sourceTrack: {
        id: sourceTrack.id,
        title: sourceTrack.track_title,
        genre: sourceTrack.genre,
        bpm: sourceTrack.bpm
      },
      totalResults: results.length,
      results,
      timing: {
        aims: Date.now() - startTime,
        unit: 'ms'
      }
    };
  }

  /**
   * Fallback similarity search using prompt
   */
  async fallbackSimilarity(prompt, limit = 12, startTime = Date.now()) {
    const results = await this.promptSearch(prompt, limit);
    return {
      ...results,
      searchType: 'audio-similarity-fallback',
      timing: {
        aims: Date.now() - startTime,
        unit: 'ms'
      }
    };
  }

  /**
   * Get track by ID
   */
  async getTrackById(id) {
    const stmt = this.db.prepare('SELECT * FROM tracks WHERE id = ?');
    return stmt.get(id);
  }

  /**
   * Public API: Search by prompt
   */
  async searchByPrompt(prompt, limit = 12) {
    const result = await this.promptSearch(prompt, limit);
    return {
      tracks: result.results || [],
      totalCount: result.totalResults || 0,
      success: result.success
    };
  }

  /**
   * Public API: Search by similarity
   */
  async searchBySimilarity(reference, limit = 12) {
    const result = await this.audioSearch(reference, limit);
    return {
      tracks: result.results || [],
      totalCount: result.totalResults || 0,
      sourceTrack: result.sourceTrackId,
      success: result.success
    };
  }

  /**
   * Get multiple tracks by IDs
   */
  async getTracksByIds(ids) {
    if (!ids || ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(',');
    const stmt = this.db.prepare(`SELECT * FROM tracks WHERE id IN (${placeholders})`);
    return stmt.all(...ids);
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      status: 'healthy',
      database: this.dbPath,
      promptsLoaded: this.promptResults.size,
      similaritiesLoaded: this.similarities.size,
      referencesLoaded: this.references.size
    };
  }

  /**
   * Close database connection
   */
  close() {
    this.db.close();
  }
}

export default MockAIMSService;