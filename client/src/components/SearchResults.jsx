import { useTheme } from '../context/ThemeContext';
import { TrackResultsList } from './TrackResultsList';
import { PerformanceDisplay } from './PerformanceDisplay';
import { ArchitectureFlow } from './ArchitectureFlow';

/**
 * SearchResults - Persistent results area that updates in place
 * Unlike the chat view, results here replace rather than append
 */
export function SearchResults({
  results,
  pills,
  isLoading,
  onSoundsLike,
  onShowMore,
  showTimings = false,
  showArchitecture = false,
}) {
  const { isDark } = useTheme();

  // Empty state when no pills and no results
  if (!results && pills.length === 0) {
    return (
      <div
        className={`flex-1 flex items-center justify-center p-8 ${isDark ? 'bg-apm-dark' : 'bg-gray-50'}`}
      >
        <div className="text-center max-w-md">
          <div className={`text-6xl mb-4 ${isDark ? 'opacity-20' : 'opacity-30'}`}>🎵</div>
          <h2
            className={`text-xl font-semibold mb-2 ${isDark ? 'text-apm-light' : 'text-gray-700'}`}
          >
            Search for music
          </h2>
          <p className={`text-sm ${isDark ? 'text-apm-gray' : 'text-gray-500'}`}>
            Type keywords like "upbeat rock" or use @filters for precise searches
          </p>
          <div className={`mt-4 text-xs ${isDark ? 'text-apm-gray' : 'text-gray-400'}`}>
            <p>Try: "shoegaze" • "@mood:uplifting" • "electronic chill"</p>
          </div>
        </div>
      </div>
    );
  }

  // Loading state
  if (isLoading && !results) {
    return (
      <div
        className={`flex-1 flex items-center justify-center ${isDark ? 'bg-apm-dark' : 'bg-gray-50'}`}
      >
        <div className="flex items-center gap-3">
          <div className="flex space-x-1">
            <div
              className="w-2 h-2 bg-apm-purple rounded-full animate-bounce"
              style={{ animationDelay: '0ms' }}
            />
            <div
              className="w-2 h-2 bg-apm-purple rounded-full animate-bounce"
              style={{ animationDelay: '150ms' }}
            />
            <div
              className="w-2 h-2 bg-apm-purple rounded-full animate-bounce"
              style={{ animationDelay: '300ms' }}
            />
          </div>
          <span className={isDark ? 'text-apm-gray' : 'text-gray-500'}>Searching...</span>
        </div>
      </div>
    );
  }

  // Results view
  return (
    <div className={`flex-1 overflow-y-auto ${isDark ? 'bg-apm-dark' : 'bg-gray-50'}`}>
      <div className="max-w-4xl mx-auto p-4 space-y-4">
        {/* Results summary */}
        {results && results.message && (
          <div className={`text-sm ${isDark ? 'text-apm-gray' : 'text-gray-600'}`}>
            {results.message}
          </div>
        )}

        {/* Loading overlay when refreshing */}
        {isLoading && (
          <div
            className={`text-sm flex items-center gap-2 ${isDark ? 'text-apm-purple-light' : 'text-apm-purple'}`}
          >
            <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
            Updating results...
          </div>
        )}

        {/* Track results */}
        {results && results.tracks && (
          <TrackResultsList
            data={{
              tracks: results.tracks,
              totalCount: results.totalCount,
              showing: results.showing,
            }}
            onSoundsLike={onSoundsLike}
            onShowMore={onShowMore}
          />
        )}

        {/* Performance metrics */}
        {showTimings && results?.timings && (
          <PerformanceDisplay timings={results.timings} performance={results.performance} />
        )}

        {/* Architecture flow */}
        {showArchitecture && results?.architecture && (
          <ArchitectureFlow architecture={results.architecture} />
        )}

        {/* Applied rules info */}
        {results?._meta?.appliedRules?.length > 0 && (
          <div
            className={`text-xs mt-4 p-3 rounded-lg ${isDark ? 'bg-apm-navy/50' : 'bg-gray-100'}`}
          >
            <div className={`font-medium mb-1 ${isDark ? 'text-apm-gray-light' : 'text-gray-600'}`}>
              Applied business rules:
            </div>
            <div className={isDark ? 'text-apm-gray' : 'text-gray-500'}>
              {results._meta.appliedRules.map((rule, i) => (
                <span key={i}>
                  {i > 0 && ' • '}
                  {typeof rule === 'string'
                    ? rule
                    : rule.description || rule.type || 'Unknown rule'}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
