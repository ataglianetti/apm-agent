import { describe, it, expect, jest } from '@jest/globals';

// Mock the genreMapper
jest.unstable_mockModule('./genreMapper.js', () => ({
  enrichTrackWithGenreNames: jest.fn(track => ({
    ...track,
    genre_name: track.master_genre_id === '1001' ? 'Rock' : null,
  })),
}));

// Mock better-sqlite3
jest.unstable_mockModule('better-sqlite3', () => ({
  default: jest.fn(() => ({
    pragma: jest.fn(),
    prepare: jest.fn(() => ({
      all: jest.fn(() => []),
    })),
  })),
}));

const { enhanceTrackMetadata, enhanceTracksMetadata } = await import('./metadataEnhancer.js');

describe('metadataEnhancer', () => {
  describe('enhanceTrackMetadata', () => {
    it('formats duration from seconds to MM:SS', () => {
      const track = { id: '1', track_title: 'Test', duration: 185 };
      const enhanced = enhanceTrackMetadata(track);
      expect(enhanced.duration).toBe('3:05');
      expect(enhanced.duration_seconds).toBe(185);
    });

    it('handles duration as string of seconds', () => {
      const track = { id: '1', track_title: 'Test', duration: '240' };
      const enhanced = enhanceTrackMetadata(track);
      expect(enhanced.duration).toBe('4:00');
      expect(enhanced.duration_seconds).toBe(240);
    });

    it('preserves already formatted duration (MM:SS)', () => {
      const track = { id: '1', track_title: 'Test', duration: '3:45' };
      const enhanced = enhanceTrackMetadata(track);
      expect(enhanced.duration).toBe('3:45');
    });

    it('handles zero duration', () => {
      const track = { id: '1', track_title: 'Test', duration: 0 };
      const enhanced = enhanceTrackMetadata(track);
      expect(enhanced.duration).toBe(0);
    });

    it('handles missing duration', () => {
      const track = { id: '1', track_title: 'Test' };
      const enhanced = enhanceTrackMetadata(track);
      expect(enhanced.duration).toBeUndefined();
    });

    it('adds genre name from genreMapper', () => {
      const track = { id: '1', track_title: 'Test', master_genre_id: '1001' };
      const enhanced = enhanceTrackMetadata(track);
      expect(enhanced.genre).toBe('Rock');
    });

    it('handles track with genre as array', () => {
      const track = { id: '1', track_title: 'Test', genre: ['Rock', 'Alternative'] };
      const enhanced = enhanceTrackMetadata(track);
      expect(enhanced.genre).toBe('Rock');
    });

    it('keeps genre_id for backward compatibility', () => {
      const track = { id: '1', track_title: 'Test', master_genre_id: '1001' };
      const enhanced = enhanceTrackMetadata(track);
      expect(enhanced.genre_id).toBe('1001');
    });

    it('formats duration of exactly one minute', () => {
      const track = { id: '1', track_title: 'Test', duration: 60 };
      const enhanced = enhanceTrackMetadata(track);
      expect(enhanced.duration).toBe('1:00');
    });

    it('formats duration less than one minute', () => {
      const track = { id: '1', track_title: 'Test', duration: 45 };
      const enhanced = enhanceTrackMetadata(track);
      expect(enhanced.duration).toBe('0:45');
    });

    it('pads seconds with leading zero', () => {
      const track = { id: '1', track_title: 'Test', duration: 65 };
      const enhanced = enhanceTrackMetadata(track);
      expect(enhanced.duration).toBe('1:05');
    });
  });

  describe('enhanceTracksMetadata', () => {
    it('enhances multiple tracks', () => {
      const tracks = [
        { id: '1', track_title: 'Track 1', duration: 120 },
        { id: '2', track_title: 'Track 2', duration: 180 },
      ];
      const enhanced = enhanceTracksMetadata(tracks);

      expect(enhanced).toHaveLength(2);
      expect(enhanced[0].duration).toBe('2:00');
      expect(enhanced[1].duration).toBe('3:00');
    });

    it('returns empty array for empty input', () => {
      const enhanced = enhanceTracksMetadata([]);
      expect(enhanced).toEqual([]);
    });
  });
});
