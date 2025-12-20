import { useState, useCallback } from 'react';
import { TrackCard, TrackCardComponent } from './TrackCard';
import { useTheme } from '../context/ThemeContext';

export function TrackResultsList({ data, onShowMore, onSoundsLike, searchQuery = '' }) {
  const { isDark } = useTheme();

  // State for version expansion - versions are pre-loaded, just track which is expanded
  const [expandedTrackId, setExpandedTrackId] = useState(null);

  // Defensive: ensure data exists
  if (!data) {
    console.error('TrackResultsList: no data provided');
    return null;
  }

  const { tracks, message, total_count, showing, _meta } = data;

  // Defensive: ensure tracks is an array
  if (!tracks || !Array.isArray(tracks)) {
    console.error('TrackResultsList: tracks is not an array:', tracks);
    return (
      <div className={`p-4 ${isDark ? 'text-apm-light' : 'text-gray-800'}`}>
        <p>Error: No tracks data received</p>
      </div>
    );
  }

  // Parse showing string like "1-12" to get current range
  const [start, end] = showing ? showing.split('-').map(Number) : [1, tracks.length];
  const hasMore = total_count && end < total_count;

  // Toggle versions - versions are pre-loaded, just toggle expansion state
  const handleShowVersions = useCallback((track) => {
    setExpandedTrackId(prev => prev === track.id ? null : track.id);
  }, []);

  // Collapse versions
  const handleCollapseVersions = useCallback(() => {
    setExpandedTrackId(null);
  }, []);

  // Build the render list with versions inserted after expanded track
  const renderList = [];
  let displayIndex = start - 1;

  tracks.forEach((track) => {
    // Versions are pre-loaded from the API response
    const versions = track.versions || [];
    const hasVersions = versions.length > 0;
    const isExpanded = expandedTrackId === track.id;

    // Add the main track
    renderList.push({
      type: 'track',
      track,
      index: displayIndex++,
      hasVersions,
      isExpanded
    });

    // If this track is expanded and has versions, show them
    if (isExpanded && hasVersions) {
      renderList.push({
        type: 'versions-header',
        trackId: track.id,
        count: versions.length
      });
      versions.forEach((version, vIndex) => {
        renderList.push({
          type: 'version',
          track: version,
          index: vIndex,
          parentTrackId: track.id
        });
      });
      renderList.push({ type: 'versions-footer', trackId: track.id });
    } else if (isExpanded && !hasVersions) {
      renderList.push({ type: 'no-versions', trackId: track.id });
    }
  });

  return (
    <div className="w-full">
      {/* Optional message above results */}
      {message && (
        <p className={`mb-4 ${isDark ? 'text-apm-light' : 'text-gray-800'}`}>{message}</p>
      )}

      {/* Track Cards with inline versions */}
      <div className="space-y-3">
        {renderList.map((item, idx) => {
          if (item.type === 'track') {
            return (
              <TrackCard
                key={item.track.id}
                track={item.track}
                index={item.index}
                onSoundsLike={onSoundsLike}
                searchQuery={searchQuery}
                onShowVersions={handleShowVersions}
                hasVersions={item.hasVersions}
                isVersion={false}
                searchMeta={_meta}
              />
            );
          }

          if (item.type === 'versions-header') {
            return (
              <div
                key={`header-${item.trackId}`}
                className={`ml-8 flex items-center justify-between py-2 px-4 rounded-t-lg ${
                  isDark ? 'bg-apm-purple/10' : 'bg-purple-50'
                }`}
              >
                <span className={`text-sm font-medium ${isDark ? 'text-apm-purple' : 'text-purple-700'}`}>
                  {item.count} Version{item.count !== 1 ? 's' : ''}
                </span>
                <button
                  onClick={handleCollapseVersions}
                  className={`text-xs px-2 py-1 rounded hover:bg-apm-purple/20 transition-colors ${
                    isDark ? 'text-apm-gray-light' : 'text-gray-600'
                  }`}
                >
                  Collapse
                </button>
              </div>
            );
          }

          if (item.type === 'version') {
            return (
              <TrackCardComponent
                key={item.track.id}
                track={item.track}
                index={item.index}
                onSoundsLike={onSoundsLike}
                searchQuery={searchQuery}
                isVersion={true}
                hasVersions={false}
              />
            );
          }

          if (item.type === 'versions-footer') {
            return (
              <div
                key={`footer-${item.trackId}`}
                className={`ml-8 py-2 px-4 rounded-b-lg border-t ${
                  isDark ? 'bg-apm-purple/5 border-apm-dark' : 'bg-purple-50/50 border-purple-100'
                }`}
              >
                <button
                  onClick={handleCollapseVersions}
                  className={`text-xs ${isDark ? 'text-apm-gray-light hover:text-apm-light' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  Hide versions
                </button>
              </div>
            );
          }

          if (item.type === 'no-versions') {
            return (
              <div
                key={`no-versions-${item.trackId}`}
                className={`ml-8 p-4 rounded-lg ${isDark ? 'bg-apm-dark/30' : 'bg-gray-50'}`}
              >
                <span className={`text-sm ${isDark ? 'text-apm-gray-light' : 'text-gray-500'}`}>
                  No other versions found for this track.
                </span>
              </div>
            );
          }

          return null;
        })}
      </div>

      {/* Pagination Footer */}
      <div className="mt-4 flex items-center justify-between">
        <span className={`text-sm ${isDark ? 'text-apm-gray-light' : 'text-gray-500'}`}>
          Showing {showing || `1-${tracks.length}`} of {total_count || tracks.length} results
        </span>

        {hasMore && onShowMore && (
          <button
            onClick={onShowMore}
            className="px-4 py-2 bg-apm-purple/20 text-apm-purple text-sm rounded-lg hover:bg-apm-purple/30 transition-colors"
          >
            Show More
          </button>
        )}
      </div>
    </div>
  );
}
