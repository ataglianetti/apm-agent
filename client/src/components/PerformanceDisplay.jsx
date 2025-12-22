import { useTheme } from '../context/ThemeContext';

export function PerformanceDisplay({ timings, performance }) {
  const { isDark } = useTheme();

  if (!timings || !performance) return null;

  const getPerformanceColor = (actual, target) => {
    const actualMs = parseInt(actual);
    const targetMs = parseInt(target);
    if (actualMs <= targetMs) return 'text-green-500';
    if (actualMs <= targetMs * 1.5) return 'text-yellow-500';
    return 'text-red-500';
  };

  return (
    <div
      className={`
      my-4 p-4 rounded-lg border
      ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}
    `}
    >
      <div className="flex items-center gap-2 mb-3">
        <svg
          className="w-5 h-5 text-blue-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 10V3L4 14h7v7l9-11h-7z"
          />
        </svg>
        <h3 className="font-semibold">Performance Metrics</h3>
      </div>

      {/* Overall Performance */}
      <div className="mb-3">
        <div className="flex justify-between items-center mb-1">
          <span className="text-sm">Total Response Time</span>
          <div className="flex items-center gap-2">
            <span
              className={`font-mono text-sm ${getPerformanceColor(performance.actual, performance.target)}`}
            >
              {performance.actual}
            </span>
            <span className="text-xs opacity-60">(target: {performance.target})</span>
          </div>
        </div>
        {/* Progress Bar */}
        <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${
              parseInt(performance.actual) <= parseInt(performance.target)
                ? 'bg-green-500'
                : parseInt(performance.actual) <= parseInt(performance.target) * 1.5
                  ? 'bg-yellow-500'
                  : 'bg-red-500'
            }`}
            style={{
              width: `${Math.min((parseInt(performance.target) / parseInt(performance.actual)) * 100, 100)}%`,
            }}
          />
        </div>
      </div>

      {/* Stage Breakdown */}
      <div className="space-y-2">
        <h4 className="text-xs uppercase tracking-wider opacity-60 mb-2">Stage Breakdown</h4>

        {Object.entries(performance.breakdown).map(([stage, time]) => {
          const stageTitle = stage.charAt(0).toUpperCase() + stage.slice(1);
          const percentage = Math.round((parseInt(time) / parseInt(performance.actual)) * 100);

          return (
            <div key={stage} className="flex items-center gap-3">
              <span className="text-sm w-20">{stageTitle}</span>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${
                        stage === 'interpret'
                          ? 'bg-blue-500'
                          : stage === 'search'
                            ? 'bg-purple-500'
                            : 'bg-green-500'
                      }`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <span className="text-xs font-mono w-12 text-right">{time}</span>
                  <span className="text-xs opacity-60">({percentage}%)</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Additional Metrics */}
      {timings.cacheHit !== undefined && (
        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 text-xs">
            {timings.cacheHit ? (
              <span className="flex items-center gap-1 text-green-500">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                Cache Hit
              </span>
            ) : (
              <span className="flex items-center gap-1 opacity-60">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                Cache Miss
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
