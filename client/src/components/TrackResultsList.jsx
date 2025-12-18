import { TrackCard } from './TrackCard';
import { useTheme } from '../context/ThemeContext';

export function TrackResultsList({ data, onShowMore, onSoundsLike, searchQuery = '' }) {
  const { isDark } = useTheme();

  // Defensive: ensure data exists
  if (!data) {
    console.error('TrackResultsList: no data provided');
    return null;
  }

  const { tracks, message, total_count, showing } = data;

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

  return (
    <div className="w-full">
      {/* Optional message above results */}
      {message && (
        <p className={`mb-4 ${isDark ? 'text-apm-light' : 'text-gray-800'}`}>{message}</p>
      )}

      {/* Track Cards */}
      <div className="space-y-3">
        {tracks.map((track, index) => (
          <TrackCard
            key={track.id}
            track={track}
            index={start - 1 + index}
            onSoundsLike={onSoundsLike}
            searchQuery={searchQuery}
          />
        ))}
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
