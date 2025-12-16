import { useTheme } from '../context/ThemeContext';

export function ArchitectureFlow({ architecture }) {
  const { isDark } = useTheme();

  if (!architecture) return null;

  return (
    <div className={`
      my-4 p-4 rounded-lg border
      ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}
    `}>
      <div className="flex items-center gap-2 mb-4">
        <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
        </svg>
        <h3 className="font-semibold">Request Architecture</h3>
        {architecture.demoMode && (
          <span className="px-2 py-0.5 bg-green-500 text-white text-xs rounded-full">
            DEMO MODE
          </span>
        )}
      </div>

      {/* Three-Stage Pipeline Visualization */}
      {architecture.stages && (
        <div className="mb-4">
          <div className="flex items-center justify-between gap-2">
            {architecture.stages.map((stage, index) => (
              <div key={stage.name} className="flex-1">
                {/* Stage Box */}
                <div className={`
                  p-3 rounded-lg border-2 text-center relative
                  ${index === 0 ? 'border-blue-500 bg-blue-500/10' :
                    index === 1 ? 'border-purple-500 bg-purple-500/10' :
                    'border-green-500 bg-green-500/10'}
                `}>
                  <div className="text-xs font-bold uppercase tracking-wider mb-1">
                    {stage.name}
                  </div>
                  <div className="text-xs opacity-80">
                    {stage.service}
                  </div>
                  {stage.time && (
                    <div className="text-xs font-mono mt-1 font-semibold">
                      {stage.time}
                    </div>
                  )}
                </div>

                {/* Arrow between stages */}
                {index < architecture.stages.length - 1 && (
                  <div className="absolute top-1/2 -right-3 transform -translate-y-1/2 z-10">
                    <svg className="w-6 h-6 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search Mode Info */}
      {architecture.searchMode && (
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className={`
            p-2 rounded-md
            ${isDark ? 'bg-gray-700' : 'bg-gray-100'}
          `}>
            <div className="text-xs uppercase tracking-wider opacity-60 mb-1">
              Search Mode
            </div>
            <div className="text-sm font-medium">
              {architecture.searchMode.charAt(0).toUpperCase() + architecture.searchMode.slice(1)}
            </div>
          </div>
          <div className={`
            p-2 rounded-md
            ${isDark ? 'bg-gray-700' : 'bg-gray-100'}
          `}>
            <div className="text-xs uppercase tracking-wider opacity-60 mb-1">
              LLM Provider
            </div>
            <div className="text-sm font-medium">
              {architecture.provider.charAt(0).toUpperCase() + architecture.provider.slice(1)}
            </div>
          </div>
        </div>
      )}

      {/* Flow Diagram */}
      {architecture.flow && (
        <div className={`
          p-3 rounded-md text-xs
          ${isDark ? 'bg-gray-700' : 'bg-gray-100'}
        `}>
          <div className="font-medium mb-2">Data Flow</div>
          <div className="font-mono opacity-80">
            {architecture.flow}
          </div>
        </div>
      )}

      {/* Additional Details */}
      {architecture.stage && (
        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
          <div className="text-xs">
            <span className="opacity-60">Response Type:</span>
            <span className="ml-2 font-medium">{architecture.stage}</span>
          </div>
        </div>
      )}
    </div>
  );
}