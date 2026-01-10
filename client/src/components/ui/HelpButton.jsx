/**
 * HelpButton - Consistent "?" icon button for triggering help
 */
export function HelpButton({ onClick, isDark, size = 'md', title = 'Help' }) {
  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
  };

  const iconSizes = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${sizeClasses[size]} flex items-center justify-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-apm-purple/50 ${
        isDark
          ? 'text-gray-400 hover:text-gray-200 hover:bg-apm-gray/20'
          : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
      }`}
      title={title}
      aria-label={title}
    >
      <svg className={iconSizes[size]} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    </button>
  );
}
