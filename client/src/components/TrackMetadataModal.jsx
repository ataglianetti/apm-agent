import { useState, useEffect, useCallback } from 'react';
import { useTheme } from '../context/ThemeContext';

/**
 * TrackMetadataModal
 * Displays comprehensive track metadata with transparency into search relevance
 *
 * CEO's hot button feature: Shows which facets matched, score breakdown,
 * and business rules that affected the track's ranking
 */
export function TrackMetadataModal({ track, isOpen, onClose, searchQuery = '', searchMeta = null }) {
  const { isDark } = useTheme();
  const [metadata, setMetadata] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('facets'); // facets, scoring, rules

  const fetchMetadata = useCallback(async () => {
    if (!track) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        query: searchQuery,
        includeRules: 'true',
        includeFacets: 'true',
        includeScores: 'true'
      });

      const response = await fetch(`/api/tracks/${track.id}/metadata?${params}`);
      if (!response.ok) throw new Error('Failed to fetch metadata');

      const data = await response.json();

      // If the track already has score data (from search results), use it
      // Otherwise the API won't have it because scores are computed during search
      if (track._score_breakdown && !data.scoreBreakdown) {
        data.scoreBreakdown = track._score_breakdown;
        data.totalScore = track._relevance_score || 0;
      }

      setMetadata(data);
    } catch (error) {
      console.error('Error fetching metadata:', error);
    } finally {
      setLoading(false);
    }
  }, [track, searchQuery]);

  useEffect(() => {
    if (isOpen && track) {
      fetchMetadata();
    }
  }, [isOpen, track, fetchMetadata]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div
        className={`relative w-full max-w-4xl max-h-[90vh] rounded-xl shadow-2xl overflow-hidden ${
          isDark ? 'bg-apm-navy' : 'bg-white'
        }`}
      >
        {/* Header */}
        <div className={`px-6 py-4 border-b ${isDark ? 'border-apm-dark' : 'border-gray-200'}`}>
          <div className="flex items-start justify-between">
            <div className="flex-1 pr-8">
              <h2 className={`text-xl font-semibold mb-1 ${isDark ? 'text-apm-light' : 'text-gray-900'}`}>
                {track.track_title}
              </h2>
              <p className={`text-sm ${isDark ? 'text-apm-gray-light' : 'text-gray-500'}`}>
                {track.id} · {track.library_name}
              </p>
              {track.composer && (
                <p className={`text-sm mt-1 ${isDark ? 'text-apm-gray-light' : 'text-gray-600'}`}>
                  Composed by {track.composer}
                </p>
              )}
            </div>

            {/* Close Button */}
            <button
              onClick={onClose}
              className={`p-2 rounded-lg transition-colors ${
                isDark ? 'hover:bg-apm-dark text-apm-gray-light' : 'hover:bg-gray-100 text-gray-500'
              }`}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className={`flex border-b ${isDark ? 'border-apm-dark' : 'border-gray-200'}`}>
          {[
            { id: 'facets', label: 'Facets & Taxonomy' },
            { id: 'scoring', label: 'Score Breakdown' },
            { id: 'rules', label: 'Business Rules' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? isDark
                    ? 'border-b-2 border-apm-purple text-apm-light bg-apm-dark/30'
                    : 'border-b-2 border-apm-purple text-apm-purple bg-purple-50'
                  : isDark
                  ? 'text-apm-gray-light hover:text-apm-light hover:bg-apm-dark/20'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="overflow-y-auto" style={{ maxHeight: 'calc(90vh - 180px)' }}>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-apm-purple"></div>
            </div>
          ) : metadata ? (
            <>
              {/* Facets Tab */}
              {activeTab === 'facets' && (
                <div className="p-6 space-y-6">
                  {/* Track Details */}
                  <div>
                    <h3 className={`text-sm font-semibold mb-3 ${isDark ? 'text-apm-light' : 'text-gray-900'}`}>
                      Track Details
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className={`text-xs ${isDark ? 'text-apm-gray-light' : 'text-gray-500'}`}>Duration</span>
                        <p className={`text-sm ${isDark ? 'text-apm-light' : 'text-gray-900'}`}>{metadata.track.duration}</p>
                      </div>
                      <div>
                        <span className={`text-xs ${isDark ? 'text-apm-gray-light' : 'text-gray-500'}`}>BPM</span>
                        <p className={`text-sm ${isDark ? 'text-apm-light' : 'text-gray-900'}`}>{metadata.track.bpm}</p>
                      </div>
                      <div>
                        <span className={`text-xs ${isDark ? 'text-apm-gray-light' : 'text-gray-500'}`}>Release Date</span>
                        <p className={`text-sm ${isDark ? 'text-apm-light' : 'text-gray-900'}`}>
                          {metadata.track.apm_release_date || 'N/A'}
                        </p>
                      </div>
                      <div>
                        <span className={`text-xs ${isDark ? 'text-apm-gray-light' : 'text-gray-500'}`}>Stems Available</span>
                        <p className={`text-sm ${isDark ? 'text-apm-light' : 'text-gray-900'}`}>
                          {metadata.track.has_stems === 'true' ? 'Yes' : 'No'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Genre Information */}
                  {metadata.track.genre_names && metadata.track.genre_names.length > 0 && (
                    <div>
                      <h3 className={`text-sm font-semibold mb-3 ${isDark ? 'text-apm-light' : 'text-gray-900'}`}>
                        Genres
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {metadata.track.genre_names.map((genre, i) => (
                          <span
                            key={i}
                            className={`px-3 py-1 text-xs rounded-full ${
                              isDark ? 'bg-apm-purple/20 text-apm-purple' : 'bg-purple-100 text-purple-700'
                            }`}
                          >
                            {genre}
                          </span>
                        ))}
                        {metadata.track.additional_genre_names?.map((genre, i) => (
                          <span
                            key={`additional-${i}`}
                            className={`px-3 py-1 text-xs rounded-full ${
                              isDark ? 'bg-apm-dark text-apm-gray-light' : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {genre}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Facets by Category */}
                  {metadata.facetsByCategory && Object.keys(metadata.facetsByCategory).length > 0 && (
                    <div>
                      <h3 className={`text-sm font-semibold mb-3 ${isDark ? 'text-apm-light' : 'text-gray-900'}`}>
                        APM Taxonomy Facets ({metadata.facets?.length || 0} total)
                      </h3>
                      <div className="space-y-4">
                        {Object.entries(metadata.facetsByCategory).map(([category, facets]) => (
                          <div key={category}>
                            <h4 className={`text-xs font-medium mb-2 ${isDark ? 'text-apm-gray-light' : 'text-gray-600'}`}>
                              {category}
                            </h4>
                            <div className="flex flex-wrap gap-2">
                              {facets.map((facet, i) => (
                                <span
                                  key={i}
                                  className={`px-3 py-1 text-xs rounded-full ${
                                    isDark ? 'bg-apm-dark text-apm-light' : 'bg-gray-100 text-gray-700'
                                  }`}
                                >
                                  {facet.label}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Text Matches */}
                  {metadata.textMatches && metadata.textMatches.length > 0 && (
                    <div>
                      <h3 className={`text-sm font-semibold mb-3 ${isDark ? 'text-apm-light' : 'text-gray-900'}`}>
                        Search Term Matches
                      </h3>
                      <div className="space-y-2">
                        {metadata.textMatches.map((match, i) => (
                          <div
                            key={i}
                            className={`p-3 rounded-lg ${isDark ? 'bg-apm-dark/50' : 'bg-gray-50'}`}
                          >
                            <span className={`text-xs font-medium ${isDark ? 'text-apm-purple' : 'text-purple-600'}`}>
                              {match.field}
                            </span>
                            <p className={`text-sm mt-1 ${isDark ? 'text-apm-light' : 'text-gray-700'}`}>
                              {match.value}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Scoring Tab */}
              {activeTab === 'scoring' && (
                <div className="p-6 space-y-6">
                  {metadata.scoreBreakdown ? (
                    <>
                      <div>
                        <h3 className={`text-sm font-semibold mb-3 ${isDark ? 'text-apm-light' : 'text-gray-900'}`}>
                          Relevance Score: {metadata.totalScore?.toFixed(2)}
                        </h3>
                        {metadata.boostApplied && (
                          <p className={`text-sm ${isDark ? 'text-apm-purple' : 'text-purple-600'}`}>
                            Boost applied: {metadata.boostApplied}x
                          </p>
                        )}
                      </div>

                      <div>
                        <h3 className={`text-sm font-semibold mb-3 ${isDark ? 'text-apm-light' : 'text-gray-900'}`}>
                          Score Components
                        </h3>
                        <div className="space-y-2">
                          {Object.entries(metadata.scoreBreakdown).map(([field, score]) => (
                            <div
                              key={field}
                              className={`flex items-center justify-between p-3 rounded-lg ${
                                isDark ? 'bg-apm-dark/50' : 'bg-gray-50'
                              }`}
                            >
                              <span className={`text-sm ${isDark ? 'text-apm-light' : 'text-gray-700'}`}>
                                {field.replace(/_/g, ' ')}
                              </span>
                              <span className={`text-sm font-medium ${isDark ? 'text-apm-purple' : 'text-purple-600'}`}>
                                {typeof score === 'number' ? score.toFixed(2) : score}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className={`p-4 rounded-lg ${isDark ? 'bg-apm-dark/30' : 'bg-blue-50'}`}>
                        <p className={`text-xs ${isDark ? 'text-apm-gray-light' : 'text-gray-600'}`}>
                          Field weights are configured in fieldWeights.json (Solr qf/pf2 format).
                          Higher scores indicate stronger matches to your search query.
                        </p>
                      </div>
                    </>
                  ) : (
                    <div className={`p-6 text-center ${isDark ? 'text-apm-gray-light' : 'text-gray-500'}`}>
                      <p>Score breakdown not available for this track.</p>
                      <p className="text-xs mt-2">Scores are generated when tracks are returned in search results.</p>
                    </div>
                  )}
                </div>
              )}

              {/* Business Rules Tab */}
              {activeTab === 'rules' && (
                <div className="p-6 space-y-6">
                  <div className={`p-4 rounded-lg ${isDark ? 'bg-apm-dark/30' : 'bg-purple-50'}`}>
                    <h3 className={`text-sm font-semibold mb-2 ${isDark ? 'text-apm-light' : 'text-gray-900'}`}>
                      PM-Controlled Search Behavior
                    </h3>
                    <p className={`text-xs ${isDark ? 'text-apm-gray-light' : 'text-gray-600'}`}>
                      Business rules can adjust search rankings based on library preferences, recency interleaving,
                      feature boosts, and more. These rules are configured in businessRules.json without code changes.
                    </p>
                  </div>

                  {searchMeta?.appliedRules && searchMeta.appliedRules.length > 0 ? (
                    <div>
                      <h3 className={`text-sm font-semibold mb-3 ${isDark ? 'text-apm-light' : 'text-gray-900'}`}>
                        Applied Rules ({searchMeta.appliedRules.length})
                      </h3>
                      <div className="space-y-3">
                        {searchMeta.appliedRules.map((rule, i) => (
                          <div
                            key={i}
                            className={`p-4 rounded-lg ${isDark ? 'bg-apm-dark/50' : 'bg-gray-50'}`}
                          >
                            <div className="flex items-start justify-between mb-2">
                              <span className={`text-sm font-medium ${isDark ? 'text-apm-purple' : 'text-purple-600'}`}>
                                {rule.ruleId}
                              </span>
                              <span className={`text-xs px-2 py-1 rounded ${
                                isDark ? 'bg-apm-purple/20 text-apm-purple' : 'bg-purple-100 text-purple-700'
                              }`}>
                                {rule.type}
                              </span>
                            </div>
                            <p className={`text-sm ${isDark ? 'text-apm-light' : 'text-gray-700'}`}>
                              {rule.description}
                            </p>
                            {rule.affectedTracks > 0 && (
                              <p className={`text-xs mt-2 ${isDark ? 'text-apm-gray-light' : 'text-gray-500'}`}>
                                Affected {rule.affectedTracks} track{rule.affectedTracks !== 1 ? 's' : ''}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className={`p-6 text-center ${isDark ? 'text-apm-gray-light' : 'text-gray-500'}`}>
                      <p>No business rules were applied in the current search.</p>
                      <p className="text-xs mt-2">
                        Rules are matched based on search query patterns and can boost, filter, or reorder results.
                      </p>
                    </div>
                  )}

                  {searchMeta?.scoreAdjustments && searchMeta.scoreAdjustments.length > 0 && (
                    <div>
                      <h3 className={`text-sm font-semibold mb-3 ${isDark ? 'text-apm-light' : 'text-gray-900'}`}>
                        Score Adjustments for This Track
                      </h3>
                      <div className="space-y-2">
                        {searchMeta.scoreAdjustments
                          .filter(adj => adj.trackId === track.id)
                          .map((adj, i) => (
                            <div
                              key={i}
                              className={`p-3 rounded-lg ${isDark ? 'bg-apm-dark/50' : 'bg-gray-50'}`}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className={`text-sm ${isDark ? 'text-apm-light' : 'text-gray-700'}`}>
                                  {adj.reason}
                                </span>
                                <span className={`text-sm font-medium ${
                                  adj.rankChange > 0
                                    ? 'text-green-500'
                                    : adj.rankChange < 0
                                    ? 'text-red-500'
                                    : isDark ? 'text-apm-gray-light' : 'text-gray-500'
                                }`}>
                                  {adj.rankChange > 0 ? `+${adj.rankChange}` : adj.rankChange} ranks
                                </span>
                              </div>
                              <p className={`text-xs ${isDark ? 'text-apm-gray-light' : 'text-gray-500'}`}>
                                Score: {adj.originalScore?.toFixed(2)} → {adj.newScore?.toFixed(2)}
                                {adj.scoreMultiplier && ` (${adj.scoreMultiplier}x multiplier)`}
                              </p>
                            </div>
                          ))}
                        {searchMeta.scoreAdjustments.filter(adj => adj.trackId === track.id).length === 0 && (
                          <p className={`text-sm ${isDark ? 'text-apm-gray-light' : 'text-gray-500'}`}>
                            No score adjustments applied to this specific track.
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className={`p-6 text-center ${isDark ? 'text-apm-gray-light' : 'text-gray-500'}`}>
              <p>No metadata available</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
