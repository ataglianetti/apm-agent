import { useState, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';

export function DemoControls({ onSettingsChange }) {
  const { isDark } = useTheme();
  const [isExpanded, setIsExpanded] = useState(false);
  const [settings, setSettings] = useState({
    llmProvider: 'claude',
    demoMode: false,
    showTimings: false,
    showArchitecture: false
  });

  // Notify parent of settings changes
  useEffect(() => {
    onSettingsChange(settings);
  }, [settings, onSettingsChange]);

  const handleProviderChange = (provider) => {
    setSettings(prev => ({ ...prev, llmProvider: provider }));
  };

  const toggleDemoMode = () => {
    setSettings(prev => ({ ...prev, demoMode: !prev.demoMode }));
  };

  const toggleTimings = () => {
    setSettings(prev => ({ ...prev, showTimings: !prev.showTimings }));
  };

  const toggleArchitecture = () => {
    setSettings(prev => ({ ...prev, showArchitecture: !prev.showArchitecture }));
  };

  return (
    <div className={`fixed bottom-4 right-4 z-50 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
      {/* Toggle Button */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`
          flex items-center gap-2 px-4 py-2 rounded-lg shadow-lg
          ${isDark ? 'bg-gray-800 hover:bg-gray-700' : 'bg-white hover:bg-gray-50'}
          transition-all duration-200
        `}
        title="Demo Controls"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        <span className="text-sm font-medium">Demo Controls</span>
        {settings.demoMode && (
          <span className="px-2 py-0.5 bg-green-500 text-white text-xs rounded-full">
            DEMO
          </span>
        )}
      </button>

      {/* Expanded Controls Panel */}
      {isExpanded && (
        <div className={`
          absolute bottom-14 right-0 w-80 p-4 rounded-lg shadow-xl
          ${isDark ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'}
          animate-slide-up
        `}>
          <h3 className="font-semibold mb-4">Demo Settings</h3>

          {/* LLM Provider Toggle */}
          <div className="mb-4">
            <label className="text-sm font-medium mb-2 block">LLM Provider</label>
            <div className="flex gap-2">
              {['claude', 'openai', 'mock'].map(provider => (
                <button
                  key={provider}
                  onClick={() => handleProviderChange(provider)}
                  className={`
                    flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors
                    ${settings.llmProvider === provider
                      ? isDark
                        ? 'bg-apm-orange text-white'
                        : 'bg-blue-500 text-white'
                      : isDark
                        ? 'bg-gray-700 hover:bg-gray-600'
                        : 'bg-gray-100 hover:bg-gray-200'
                    }
                  `}
                >
                  {provider.charAt(0).toUpperCase() + provider.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Demo Mode Toggle */}
          <div className="mb-4">
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <span className="text-sm font-medium">Demo Mode</span>
                <p className="text-xs opacity-60 mt-0.5">
                  Instant responses, mock LLM
                </p>
              </div>
              <button
                onClick={toggleDemoMode}
                className={`
                  relative w-12 h-6 rounded-full transition-colors
                  ${settings.demoMode
                    ? 'bg-green-500'
                    : isDark ? 'bg-gray-600' : 'bg-gray-300'
                  }
                `}
              >
                <span className={`
                  absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform
                  ${settings.demoMode ? 'translate-x-6' : 'translate-x-0.5'}
                `} />
              </button>
            </label>
          </div>

          {/* Show Timings Toggle */}
          <div className="mb-4">
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <span className="text-sm font-medium">Show Timings</span>
                <p className="text-xs opacity-60 mt-0.5">
                  Display performance metrics
                </p>
              </div>
              <button
                onClick={toggleTimings}
                className={`
                  relative w-12 h-6 rounded-full transition-colors
                  ${settings.showTimings
                    ? 'bg-green-500'
                    : isDark ? 'bg-gray-600' : 'bg-gray-300'
                  }
                `}
              >
                <span className={`
                  absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform
                  ${settings.showTimings ? 'translate-x-6' : 'translate-x-0.5'}
                `} />
              </button>
            </label>
          </div>

          {/* Show Architecture Toggle */}
          <div className="mb-4">
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <span className="text-sm font-medium">Show Architecture</span>
                <p className="text-xs opacity-60 mt-0.5">
                  Display request flow diagram
                </p>
              </div>
              <button
                onClick={toggleArchitecture}
                className={`
                  relative w-12 h-6 rounded-full transition-colors
                  ${settings.showArchitecture
                    ? 'bg-green-500'
                    : isDark ? 'bg-gray-600' : 'bg-gray-300'
                  }
                `}
              >
                <span className={`
                  absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform
                  ${settings.showArchitecture ? 'translate-x-6' : 'translate-x-0.5'}
                `} />
              </button>
            </label>
          </div>

          {/* Performance Target */}
          {settings.showTimings && (
            <div className={`
              p-3 rounded-md text-xs
              ${isDark ? 'bg-gray-700' : 'bg-gray-100'}
            `}>
              <div className="font-medium mb-1">Performance Target</div>
              <div className="opacity-80">
                <div>✓ Total Response: &lt;350ms</div>
                <div>✓ Interpret: ~50ms</div>
                <div>✓ Search: ~200ms</div>
                <div>✓ Format: ~100ms</div>
              </div>
            </div>
          )}

          {/* Architecture Info */}
          {settings.showArchitecture && (
            <div className={`
              p-3 rounded-md text-xs mt-2
              ${isDark ? 'bg-gray-700' : 'bg-gray-100'}
            `}>
              <div className="font-medium mb-1">Three-Stage Pipeline</div>
              <div className="opacity-80">
                <div>1. INTERPRET → LLM ({settings.llmProvider})</div>
                <div>2. SEARCH → Mock Solr/AIMS</div>
                <div>3. FORMAT → Context Engine</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Add CSS animation
const style = document.createElement('style');
style.textContent = `
  @keyframes slide-up {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .animate-slide-up {
    animation: slide-up 0.2s ease-out;
  }
`;
document.head.appendChild(style);