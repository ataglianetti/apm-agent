import { useState, useEffect, useRef } from 'react';
import { useTheme } from '../context/ThemeContext';

export function DemoControls({ onSettingsChange }) {
  const { isDark } = useTheme();
  const [isExpanded, setIsExpanded] = useState(false);
  const dropdownRef = useRef(null);
  const [settings, setSettings] = useState({
    llmProvider: 'claude',
    llmMode: 'fallback', // 'fallback' = fast search, 'primary' = AI conversation
    demoMode: false,
    showTimings: false,
    showArchitecture: false,
    businessRulesEnabled: true,
    businessRulesCount: 0,
    activeRules: [],
    taxonomyParserEnabled: true, // Natural language → facet mapping
  });

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsExpanded(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch initial settings from server
  useEffect(() => {
    fetch('/api/settings')
      .then(res => res.json())
      .then(data => {
        setSettings(prev => ({
          ...prev,
          llmMode: data.llmMode,
          businessRulesEnabled: data.businessRules?.globalEnabled ?? true,
          businessRulesCount: data.businessRules?.activeRuleCount ?? 0,
          activeRules: data.businessRules?.activeRules ?? [],
          taxonomyParserEnabled: data.taxonomyParserEnabled ?? true,
        }));
      })
      .catch(err => console.error('Failed to fetch settings:', err));
  }, []);

  // Notify parent of settings changes
  useEffect(() => {
    onSettingsChange(settings);
  }, [settings, onSettingsChange]);

  const handleProviderChange = provider => {
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

  const toggleLLMMode = async () => {
    try {
      const response = await fetch('/api/settings/llm-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'toggle' }),
      });
      const data = await response.json();
      setSettings(prev => ({ ...prev, llmMode: data.llmMode }));
    } catch (err) {
      console.error('Failed to toggle LLM mode:', err);
    }
  };

  const toggleBusinessRules = async () => {
    try {
      const response = await fetch('/api/settings/business-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: 'toggle' }),
      });
      const data = await response.json();
      setSettings(prev => ({
        ...prev,
        businessRulesEnabled: data.globalEnabled,
        businessRulesCount: data.activeRuleCount,
        activeRules: data.activeRules || [],
      }));
    } catch (err) {
      console.error('Failed to toggle business rules:', err);
    }
  };

  const toggleTaxonomyParser = async () => {
    try {
      const response = await fetch('/api/settings/taxonomy-parser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: 'toggle' }),
      });
      const data = await response.json();
      setSettings(prev => ({
        ...prev,
        taxonomyParserEnabled: data.taxonomyParserEnabled,
      }));
    } catch (err) {
      console.error('Failed to toggle taxonomy parser:', err);
    }
  };

  return (
    <div ref={dropdownRef} className={`relative ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
      {/* Toggle Button */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`
          flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors
          ${isDark ? 'hover:bg-apm-gray/20' : 'hover:bg-gray-100'}
        `}
        title="Demo Controls"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
        {settings.llmMode === 'primary' && (
          <span className="px-2 py-0.5 bg-purple-500 text-white text-xs rounded-full">AI</span>
        )}
        {settings.businessRulesEnabled && (
          <span className="px-2 py-0.5 bg-amber-500 text-white text-xs rounded-full">RULES</span>
        )}
        {settings.taxonomyParserEnabled && (
          <span className="px-2 py-0.5 bg-cyan-500 text-white text-xs rounded-full">NLP</span>
        )}
        {settings.demoMode && (
          <span className="px-2 py-0.5 bg-green-500 text-white text-xs rounded-full">DEMO</span>
        )}
        <svg
          className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded Controls Panel */}
      {isExpanded && (
        <div
          className={`
          absolute top-full right-0 mt-2 w-80 p-4 rounded-lg shadow-xl z-50
          ${isDark ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'}
          animate-slide-down
        `}
        >
          <h3 className="font-semibold mb-4">Demo Settings</h3>

          {/* AI Mode Toggle - Primary Feature */}
          <div className="mb-4 pb-4 border-b border-gray-600">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium">AI Conversation Mode</span>
                <p className="text-xs opacity-60 mt-0.5">
                  {settings.llmMode === 'primary'
                    ? 'All queries go through Claude AI'
                    : 'Simple searches use fast database'}
                </p>
              </div>
              <button
                onClick={toggleLLMMode}
                className={`
                  relative w-12 h-6 rounded-full transition-colors cursor-pointer
                  ${
                    settings.llmMode === 'primary'
                      ? 'bg-purple-500'
                      : isDark
                        ? 'bg-gray-600'
                        : 'bg-gray-300'
                  }
                `}
              >
                <span
                  className={`
                  absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow-sm
                  ${settings.llmMode === 'primary' ? 'translate-x-6' : 'translate-x-0'}
                `}
                />
              </button>
            </div>
            {settings.llmMode === 'primary' && (
              <div
                className={`mt-2 p-2 rounded text-xs ${isDark ? 'bg-purple-900/30 text-purple-300' : 'bg-purple-50 text-purple-700'}`}
              >
                Conversational mode enabled - Claude handles all queries
              </div>
            )}
          </div>

          {/* Business Rules Toggle */}
          <div className="mb-4 pb-4 border-b border-gray-600">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium">Business Rules</span>
                <p className="text-xs opacity-60 mt-0.5">
                  {settings.businessRulesEnabled
                    ? `${settings.businessRulesCount} rule${settings.businessRulesCount !== 1 ? 's' : ''} active`
                    : 'Rules disabled - pure relevance'}
                </p>
              </div>
              <button
                onClick={toggleBusinessRules}
                className={`
                  relative w-12 h-6 rounded-full transition-colors cursor-pointer
                  ${
                    settings.businessRulesEnabled
                      ? 'bg-amber-500'
                      : isDark
                        ? 'bg-gray-600'
                        : 'bg-gray-300'
                  }
                `}
              >
                <span
                  className={`
                  absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow-sm
                  ${settings.businessRulesEnabled ? 'translate-x-6' : 'translate-x-0'}
                `}
                />
              </button>
            </div>
            {settings.businessRulesEnabled && settings.activeRules.length > 0 && (
              <div
                className={`mt-2 p-2 rounded text-xs ${isDark ? 'bg-amber-900/30 text-amber-300' : 'bg-amber-50 text-amber-700'}`}
              >
                {settings.activeRules.map(rule => (
                  <div key={rule.id} className="truncate" title={rule.description}>
                    {rule.type}: {rule.id}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Taxonomy Parser Toggle */}
          <div className="mb-4 pb-4 border-b border-gray-600">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium">Taxonomy Parser</span>
                <p className="text-xs opacity-60 mt-0.5">
                  {settings.taxonomyParserEnabled
                    ? 'Maps terms to facet filters'
                    : 'Raw text search only'}
                </p>
              </div>
              <button
                onClick={toggleTaxonomyParser}
                className={`
                  relative w-12 h-6 rounded-full transition-colors cursor-pointer
                  ${
                    settings.taxonomyParserEnabled
                      ? 'bg-cyan-500'
                      : isDark
                        ? 'bg-gray-600'
                        : 'bg-gray-300'
                  }
                `}
              >
                <span
                  className={`
                  absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow-sm
                  ${settings.taxonomyParserEnabled ? 'translate-x-6' : 'translate-x-0'}
                `}
                />
              </button>
            </div>
            {settings.taxonomyParserEnabled && (
              <div
                className={`mt-2 p-2 rounded text-xs ${isDark ? 'bg-cyan-900/30 text-cyan-300' : 'bg-cyan-50 text-cyan-700'}`}
              >
                ~1,955 term mappings across 19 categories
              </div>
            )}
          </div>

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
                    ${
                      settings.llmProvider === provider
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
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium">Demo Mode</span>
                <p className="text-xs opacity-60 mt-0.5">Instant responses, mock LLM</p>
              </div>
              <button
                onClick={toggleDemoMode}
                className={`
                  relative w-12 h-6 rounded-full transition-colors cursor-pointer
                  ${settings.demoMode ? 'bg-green-500' : isDark ? 'bg-gray-600' : 'bg-gray-300'}
                `}
              >
                <span
                  className={`
                  absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow-sm
                  ${settings.demoMode ? 'translate-x-6' : 'translate-x-0'}
                `}
                />
              </button>
            </div>
          </div>

          {/* Show Timings Toggle */}
          <div className="mb-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium">Show Timings</span>
                <p className="text-xs opacity-60 mt-0.5">Display performance metrics</p>
              </div>
              <button
                onClick={toggleTimings}
                className={`
                  relative w-12 h-6 rounded-full transition-colors cursor-pointer
                  ${settings.showTimings ? 'bg-green-500' : isDark ? 'bg-gray-600' : 'bg-gray-300'}
                `}
              >
                <span
                  className={`
                  absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow-sm
                  ${settings.showTimings ? 'translate-x-6' : 'translate-x-0'}
                `}
                />
              </button>
            </div>
          </div>

          {/* Show Architecture Toggle */}
          <div className="mb-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium">Show Architecture</span>
                <p className="text-xs opacity-60 mt-0.5">Display request flow diagram</p>
              </div>
              <button
                onClick={toggleArchitecture}
                className={`
                  relative w-12 h-6 rounded-full transition-colors cursor-pointer
                  ${
                    settings.showArchitecture
                      ? 'bg-green-500'
                      : isDark
                        ? 'bg-gray-600'
                        : 'bg-gray-300'
                  }
                `}
              >
                <span
                  className={`
                  absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow-sm
                  ${settings.showArchitecture ? 'translate-x-6' : 'translate-x-0'}
                `}
                />
              </button>
            </div>
          </div>

          {/* Performance Target */}
          {settings.showTimings && (
            <div
              className={`
              p-3 rounded-md text-xs
              ${isDark ? 'bg-gray-700' : 'bg-gray-100'}
            `}
            >
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
            <div
              className={`
              p-3 rounded-md text-xs mt-2
              ${isDark ? 'bg-gray-700' : 'bg-gray-100'}
            `}
            >
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
  @keyframes slide-down {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .animate-slide-down {
    animation: slide-down 0.2s ease-out;
  }
`;
document.head.appendChild(style);
