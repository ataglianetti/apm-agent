import { describe, it, expect } from '@jest/globals';
import { parseFilterQuery, hasFilters, getAvailableFields } from './filterParser.js';

describe('filterParser', () => {
  describe('hasFilters', () => {
    it('returns true for messages with @ filters', () => {
      expect(hasFilters('@mood:upbeat')).toBe(true);
      expect(hasFilters('@library:MLB Music')).toBe(true);
      expect(hasFilters('@bpm=120')).toBe(true);
    });

    it('returns false for messages without @ filters', () => {
      expect(hasFilters('upbeat rock music')).toBe(false);
      expect(hasFilters('email@example.com')).toBe(false);
      expect(hasFilters('@username')).toBe(false);
    });
  });

  describe('parseFilterQuery', () => {
    it('parses single filter with colon operator', () => {
      const result = parseFilterQuery('@mood:upbeat');
      expect(result.hasFilters).toBe(true);
      expect(result.filters).toHaveLength(1);
      expect(result.filters[0].originalField).toBe('mood');
      expect(result.filters[0].value).toBe('upbeat');
      expect(result.filters[0].operatorType).toBe('contains');
    });

    it('parses single filter with equals operator', () => {
      const result = parseFilterQuery('@composer=John Williams');
      expect(result.hasFilters).toBe(true);
      expect(result.filters).toHaveLength(1);
      expect(result.filters[0].originalField).toBe('composer');
      expect(result.filters[0].value).toBe('John Williams');
      expect(result.filters[0].operatorType).toBe('exact');
    });

    it('parses multiple filters', () => {
      const result = parseFilterQuery('@mood:upbeat @instruments:piano');
      expect(result.hasFilters).toBe(true);
      expect(result.filters).toHaveLength(2);
      expect(result.filters[0].originalField).toBe('mood');
      expect(result.filters[1].originalField).toBe('instruments');
    });

    it('extracts remaining search text with quoted filter value', () => {
      const result = parseFilterQuery('@mood:"upbeat" rock music');
      expect(result.searchText).toBe('rock music');
    });

    it('handles quoted values', () => {
      const result = parseFilterQuery('@library:"MLB Music"');
      expect(result.filters[0].value).toBe('MLB Music');
    });

    it('parses BPM ranges correctly', () => {
      const result = parseFilterQuery('@bpm:120-140');
      expect(result.filters[0].parsed).toEqual({ type: 'range', min: 120, max: 140 });
    });

    it('parses exact BPM correctly', () => {
      const result = parseFilterQuery('@bpm:120');
      expect(result.filters[0].parsed).toEqual({ type: 'exact', value: 120 });
    });

    it('maps field names to Solr fields', () => {
      const result = parseFilterQuery('@mood:happy');
      expect(result.filters[0].field).toBe('facet:Mood');
    });
  });

  describe('getAvailableFields', () => {
    it('returns array of available fields', () => {
      const fields = getAvailableFields();
      expect(Array.isArray(fields)).toBe(true);
      expect(fields.length).toBeGreaterThan(0);
    });

    it('includes mood field', () => {
      const fields = getAvailableFields();
      const moodField = fields.find(f => f.key === '@mood');
      expect(moodField).toBeDefined();
      expect(moodField.field).toBe('facet:Mood');
    });

    it('includes all expected field properties', () => {
      const fields = getAvailableFields();
      fields.forEach(field => {
        expect(field).toHaveProperty('key');
        expect(field).toHaveProperty('field');
        expect(field).toHaveProperty('description');
      });
    });
  });
});
