import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mock the settings module
jest.unstable_mockModule('../routes/settings.js', () => ({
  getBusinessRulesEnabled: jest.fn(() => true),
}));

// Mock fs module
jest.unstable_mockModule('fs', () => ({
  default: {
    statSync: jest.fn(() => ({ mtime: { getTime: () => Date.now() } })),
    readFileSync: jest.fn(() =>
      JSON.stringify({
        rules: [
          {
            id: 'test_library_boost',
            type: 'library_boost',
            enabled: true,
            priority: 90,
            pattern: '\\brock\\b',
            description: 'Boost rock library',
            action: {
              boost_libraries: [{ library_name: 'Rock Library', boost_factor: 1.5 }],
            },
          },
          {
            id: 'test_disabled_rule',
            type: 'library_boost',
            enabled: false,
            priority: 80,
            pattern: '\\bjazz\\b',
            description: 'Disabled jazz rule',
            action: {},
          },
        ],
      })
    ),
  },
}));

const { applyRules, matchRules, getRuleStats } = await import('./businessRulesEngine.js');

describe('businessRulesEngine', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('matchRules', () => {
    it('matches rules based on query pattern', () => {
      const matched = matchRules('upbeat rock music');
      expect(matched.length).toBe(1);
      expect(matched[0].id).toBe('test_library_boost');
    });

    it('does not match disabled rules', () => {
      const matched = matchRules('smooth jazz');
      expect(matched.length).toBe(0);
    });

    it('returns empty array for non-matching queries', () => {
      const matched = matchRules('classical piano');
      expect(matched.length).toBe(0);
    });
  });

  describe('applyRules', () => {
    it('returns empty results for empty tracks array', async () => {
      const result = await applyRules([], [], 'test');
      expect(result.results).toEqual([]);
      expect(result.appliedRules).toEqual([]);
    });

    it('applies library boost rule correctly', async () => {
      const tracks = [
        { id: '1', track_title: 'Track 1', library_name: 'Rock Library', _relevance_score: 1.0 },
        { id: '2', track_title: 'Track 2', library_name: 'Other Library', _relevance_score: 1.2 },
        { id: '3', track_title: 'Track 3', library_name: 'Rock Library', _relevance_score: 0.8 },
      ];

      const rules = [
        {
          id: 'test_library_boost',
          type: 'library_boost',
          description: 'Boost rock library',
          action: {
            boost_libraries: [{ library_name: 'Rock Library', boost_factor: 1.5 }],
          },
        },
      ];

      const result = await applyRules(tracks, rules, 'rock');

      expect(result.appliedRules.length).toBe(1);
      expect(result.appliedRules[0].ruleId).toBe('test_library_boost');
      expect(result.scoreAdjustments.length).toBe(2); // Two tracks boosted

      // Check that Rock Library tracks were boosted
      const boostedTrack = result.results.find(t => t.id === '1');
      expect(boostedTrack._relevance_score).toBe(1.5); // 1.0 * 1.5
    });

    it('applies feature boost rule correctly', async () => {
      const tracks = [
        { id: '1', track_title: 'Track 1', has_stems: 'true', _relevance_score: 1.0 },
        { id: '2', track_title: 'Track 2', has_stems: 'false', _relevance_score: 1.2 },
      ];

      const rules = [
        {
          id: 'test_feature_boost',
          type: 'feature_boost',
          description: 'Boost tracks with stems',
          action: {
            boost_field: 'has_stems',
            boost_value: 'true',
            boost_factor: 1.3,
          },
        },
      ];

      const result = await applyRules(tracks, rules, 'stems');

      expect(result.appliedRules.length).toBe(1);
      expect(result.scoreAdjustments.length).toBe(1);

      const boostedTrack = result.results.find(t => t.id === '1');
      expect(boostedTrack._relevance_score).toBe(1.3); // 1.0 * 1.3
    });

    it('applies genre simplification rule correctly', async () => {
      const tracks = [{ id: '1', track_title: 'Track 1' }];

      const rules = [
        {
          id: 'test_genre_simplification',
          type: 'genre_simplification',
          description: 'Expand rock genres',
          action: {
            auto_apply_facets: ['Classic Rock', 'Alternative Rock'],
          },
        },
      ];

      const result = await applyRules(tracks, rules, 'rock');

      expect(result.appliedRules.length).toBe(1);
      expect(result.expandedFacets).toEqual(['Classic Rock', 'Alternative Rock']);
    });

    it('applies filter optimization rule correctly', async () => {
      const tracks = [{ id: '1', track_title: 'Track 1' }];

      const rules = [
        {
          id: 'test_filter_optimization',
          type: 'filter_optimization',
          description: 'Auto-apply instrumental filter',
          action: {
            auto_apply_filter: {
              field: 'vocal_type',
              value: 'instrumental',
              operator: 'equals',
            },
          },
        },
      ];

      const result = await applyRules(tracks, rules, 'instrumental');

      expect(result.appliedRules.length).toBe(1);
      expect(result.autoFilters.length).toBe(1);
      expect(result.autoFilters[0].field).toBe('vocal_type');
      expect(result.autoFilters[0].value).toBe('instrumental');
    });

    it('applies recency interleaving rule correctly', async () => {
      const now = new Date();
      const recentDate = new Date(now);
      recentDate.setMonth(recentDate.getMonth() - 1);
      const vintageDate = new Date(now);
      vintageDate.setMonth(vintageDate.getMonth() - 24);

      const formatDate = d => `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;

      const tracks = [
        { id: 'r1', track_title: 'Recent 1', apm_release_date: formatDate(recentDate) },
        { id: 'r2', track_title: 'Recent 2', apm_release_date: formatDate(recentDate) },
        { id: 'v1', track_title: 'Vintage 1', apm_release_date: formatDate(vintageDate) },
        { id: 'v2', track_title: 'Vintage 2', apm_release_date: formatDate(vintageDate) },
      ];

      const rules = [
        {
          id: 'test_recency',
          type: 'recency_interleaving',
          description: 'Mix recent and vintage',
          action: {
            recent_threshold_months: 12,
            pattern: 'RVRV',
          },
        },
      ];

      const result = await applyRules(tracks, rules, 'test');

      expect(result.appliedRules.length).toBe(1);
      // Pattern RVRV should interleave recent and vintage
      expect(result.results[0].id).toBe('r1'); // Recent
      expect(result.results[1].id).toBe('v1'); // Vintage
      expect(result.results[2].id).toBe('r2'); // Recent
      expect(result.results[3].id).toBe('v2'); // Vintage
    });
  });

  describe('getRuleStats', () => {
    it('returns correct statistics', () => {
      const stats = getRuleStats();

      expect(stats.total).toBe(2);
      expect(stats.enabled).toBe(1);
      expect(stats.disabled).toBe(1);
      expect(stats.byType.library_boost.total).toBe(2);
      expect(stats.byType.library_boost.enabled).toBe(1);
    });
  });
});
