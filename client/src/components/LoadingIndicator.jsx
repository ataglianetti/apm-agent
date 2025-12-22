import { useTheme } from '../context/ThemeContext';

export function LoadingIndicator() {
  const { isDark } = useTheme();

  return (
    <div className="flex justify-start">
      <div
        className={`rounded-2xl rounded-bl-md px-4 py-3 ${
          isDark ? 'bg-apm-navy' : 'bg-white border border-gray-200 shadow-sm'
        }`}
      >
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            <span
              className="w-2 h-2 bg-apm-purple rounded-full animate-bounce"
              style={{ animationDelay: '0ms' }}
            />
            <span
              className="w-2 h-2 bg-apm-purple rounded-full animate-bounce"
              style={{ animationDelay: '150ms' }}
            />
            <span
              className="w-2 h-2 bg-apm-purple rounded-full animate-bounce"
              style={{ animationDelay: '300ms' }}
            />
          </div>
          <span className={`text-sm ml-2 ${isDark ? 'text-apm-gray-light' : 'text-gray-500'}`}>
            Searching...
          </span>
        </div>
      </div>
    </div>
  );
}
