import ReactMarkdown from 'react-markdown';
import { TrackResultsList } from './TrackResultsList';
import { PerformanceDisplay } from './PerformanceDisplay';
import { ArchitectureFlow } from './ArchitectureFlow';
import { useTheme } from '../context/ThemeContext';

// Try to parse JSON track results from message content
function parseTrackResults(content) {
  if (!content) return null;

  try {
    let trimmed = content.trim();

    // Strip markdown code fences if present
    // Handles ```json ... ``` or ``` ... ```
    if (trimmed.startsWith('```')) {
      // Remove opening fence (with optional language identifier)
      trimmed = trimmed.replace(/^```(?:json)?\s*\n?/, '');
      // Remove closing fence
      trimmed = trimmed.replace(/\n?```\s*$/, '');
      trimmed = trimmed.trim();
    }

    // Try to find JSON object in the content if it doesn't start with {
    // This handles cases where there's text before the JSON
    if (!trimmed.startsWith('{')) {
      const jsonMatch = trimmed.match(/\{[\s\S]*"type"\s*:\s*"track_results"[\s\S]*\}/);
      if (jsonMatch) {
        trimmed = jsonMatch[0];
      } else {
        return null;
      }
    }

    const parsed = JSON.parse(trimmed);

    // Verify it's track results format
    if (parsed.type === 'track_results' && Array.isArray(parsed.tracks)) {
      return parsed;
    }
    return null;
  } catch (e) {
    console.error('JSON parse error:', e.message, '\nContent preview:', content?.substring(0, 200));
    return null;
  }
}

export function MessageBubble({ message, onShowMore, onSoundsLike, searchQuery = '' }) {
  const { isDark } = useTheme();
  const isUser = message.role === 'user';
  const isError = message.isError;

  // User messages: purple bubble on right
  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl px-4 py-3 bg-apm-purple text-white rounded-br-md">
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    );
  }

  // Assistant messages with track results (new structure)
  if (message.type === 'track_results') {
    return (
      <div className="flex justify-start w-full">
        <div className="w-full max-w-4xl space-y-4">
          {/* Track results */}
          <TrackResultsList
            data={{
              type: 'track_results',
              message: message.message,
              tracks: message.tracks,
              total_count: message.totalCount,
              showing: message.showing,
              _meta: message._meta,
            }}
            onShowMore={onShowMore}
            onSoundsLike={onSoundsLike}
            searchQuery={searchQuery}
          />

          {/* Performance metrics if available */}
          {message.timings && message.performance && (
            <PerformanceDisplay timings={message.timings} performance={message.performance} />
          )}

          {/* Architecture flow if available */}
          {message.architecture && <ArchitectureFlow architecture={message.architecture} />}
        </div>
      </div>
    );
  }

  // For assistant messages with content, try to parse as track results (legacy format)
  const trackResults = !isUser && message.content ? parseTrackResults(message.content) : null;

  // Legacy track results format
  if (trackResults) {
    return (
      <div className="flex justify-start w-full">
        <div className="w-full max-w-4xl">
          <TrackResultsList
            data={trackResults}
            onShowMore={onShowMore}
            onSoundsLike={onSoundsLike}
            searchQuery={searchQuery}
          />
        </div>
      </div>
    );
  }

  // Assistant text/markdown with optional performance/architecture
  return (
    <div className="flex justify-start w-full">
      <div className="max-w-[85%] space-y-4">
        {/* Main message content */}
        <div
          className={`
            rounded-2xl px-4 py-3 rounded-bl-md
            ${
              isError
                ? 'bg-red-900/50 text-red-200'
                : isDark
                  ? 'bg-apm-navy text-apm-light'
                  : 'bg-white text-gray-800 border border-gray-200 shadow-sm'
            }
          `}
        >
          <div className={`markdown-content ${!isDark && !isError ? 'light-mode' : ''}`}>
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
        </div>

        {/* Performance metrics if available */}
        {message.timings && message.performance && (
          <PerformanceDisplay timings={message.timings} performance={message.performance} />
        )}

        {/* Architecture flow if available */}
        {message.architecture && <ArchitectureFlow architecture={message.architecture} />}
      </div>
    </div>
  );
}
