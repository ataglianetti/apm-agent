import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mock fs module
jest.unstable_mockModule('fs', () => ({
  default: {
    readFileSync: jest.fn(
      () => `genre_id,genre_name
1001,Rock
1002,Jazz
1003,Classical
1004,Electronic`
    ),
  },
}));

const { enrichTrackWithGenreNames, enrichTracksWithGenreNames } = await import('./genreMapper.js');

describe('genreMapper', () => {
  describe('enrichTrackWithGenreNames', () => {
    it('maps master_genre_id to genre_name', () => {
      const track = { id: '1', track_title: 'Test', master_genre_id: '1001' };
      const enriched = enrichTrackWithGenreNames(track);
      expect(enriched.genre_name).toBe('Rock');
    });

    it('falls back to genre field if master_genre_id not present', () => {
      const track = { id: '1', track_title: 'Test', genre: '1002' };
      const enriched = enrichTrackWithGenreNames(track);
      expect(enriched.genre_name).toBe('Jazz');
    });

    it('sets genre_name to null for unknown genre ID', () => {
      const track = { id: '1', track_title: 'Test', master_genre_id: '9999' };
      const enriched = enrichTrackWithGenreNames(track);
      expect(enriched.genre_name).toBeNull();
    });

    it('maps additional_genre_ids to additional_genres_names', () => {
      const track = {
        id: '1',
        track_title: 'Test',
        master_genre_id: '1001',
        additional_genre_ids: '1002;1003',
      };
      const enriched = enrichTrackWithGenreNames(track);
      expect(enriched.additional_genres_names).toBe('Jazz, Classical');
    });

    it('handles comma-separated additional genres', () => {
      const track = {
        id: '1',
        track_title: 'Test',
        master_genre_id: '1001',
        additional_genre_ids: '1002,1004',
      };
      const enriched = enrichTrackWithGenreNames(track);
      expect(enriched.additional_genres_names).toBe('Jazz, Electronic');
    });

    it('filters out unknown genre IDs from additional genres', () => {
      const track = {
        id: '1',
        track_title: 'Test',
        master_genre_id: '1001',
        additional_genre_ids: '1002;9999;1003',
      };
      const enriched = enrichTrackWithGenreNames(track);
      expect(enriched.additional_genres_names).toBe('Jazz, Classical');
    });

    it('handles track without any genre IDs', () => {
      const track = { id: '1', track_title: 'Test' };
      const enriched = enrichTrackWithGenreNames(track);
      expect(enriched.genre_name).toBeNull();
    });
  });

  describe('enrichTracksWithGenreNames', () => {
    it('enriches multiple tracks', () => {
      const tracks = [
        { id: '1', track_title: 'Track 1', master_genre_id: '1001' },
        { id: '2', track_title: 'Track 2', master_genre_id: '1002' },
        { id: '3', track_title: 'Track 3', master_genre_id: '1003' },
      ];
      const enriched = enrichTracksWithGenreNames(tracks);

      expect(enriched).toHaveLength(3);
      expect(enriched[0].genre_name).toBe('Rock');
      expect(enriched[1].genre_name).toBe('Jazz');
      expect(enriched[2].genre_name).toBe('Classical');
    });

    it('returns empty array for empty input', () => {
      const enriched = enrichTracksWithGenreNames([]);
      expect(enriched).toEqual([]);
    });
  });
});
