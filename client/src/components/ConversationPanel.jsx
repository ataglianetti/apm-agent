import { useTheme } from '../context/ThemeContext';

/**
 * ConversationPanel - Collapsible panel for Route 3 conversational messages
 * Shows only when there are conversational exchanges (questions, context-dependent queries)
 */
export function ConversationPanel({ messages, isExpanded, onToggle }) {
  const { isDark } = useTheme();

  if (messages.length === 0) return null;

  return (
    <div
      className={`border-t ${isDark ? 'border-apm-gray/20 bg-apm-navy/30' : 'border-gray-200 bg-gray-100/50'}`}
    >
      {/* Toggle header */}
      <button
        onClick={onToggle}
        className={`w-full px-4 py-2 flex items-center justify-between text-sm transition-colors ${
          isDark ? 'text-apm-gray-light hover:bg-apm-navy/50' : 'text-gray-600 hover:bg-gray-200/50'
        }`}
      >
        <span className="flex items-center gap-2">
          <svg
            className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
          Conversation ({messages.length} {messages.length === 1 ? 'message' : 'messages'})
        </span>
        <span className={`text-xs ${isDark ? 'text-apm-gray' : 'text-gray-400'}`}>
          {isExpanded ? 'Click to collapse' : 'Click to expand'}
        </span>
      </button>

      {/* Expandable content */}
      {isExpanded && (
        <div className="max-h-64 overflow-y-auto px-4 pb-4">
          <div className="space-y-3 max-w-2xl mx-auto">
            {messages.map(msg => (
              <div
                key={msg.id}
                className={`p-3 rounded-lg text-sm ${
                  msg.role === 'user'
                    ? isDark
                      ? 'bg-apm-purple/20 text-apm-purple-light ml-8'
                      : 'bg-apm-purple/10 text-apm-purple ml-8'
                    : isDark
                      ? 'bg-apm-dark/50 text-apm-gray-light mr-8'
                      : 'bg-white text-gray-700 mr-8 shadow-sm'
                }`}
              >
                <div className={`text-xs mb-1 ${isDark ? 'text-apm-gray' : 'text-gray-400'}`}>
                  {msg.role === 'user' ? 'You' : 'Assistant'}
                </div>
                <div className="whitespace-pre-wrap">{msg.content}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
