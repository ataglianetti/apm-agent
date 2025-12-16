import { useTheme } from '../context/ThemeContext';

export function WelcomeMessage() {
  const { isDark } = useTheme();

  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6">
      <div className="w-16 h-16 bg-apm-purple/20 rounded-2xl flex items-center justify-center mb-4">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="w-8 h-8 text-apm-purple"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
          />
        </svg>
      </div>
      <h2 className={`text-xl font-semibold mb-2 ${isDark ? 'text-apm-light' : 'text-gray-900'}`}>
        APM Music Search Assistant
      </h2>
      <p className={`max-w-md mb-6 ${isDark ? 'text-apm-gray-light' : 'text-gray-500'}`}>
        Search our catalog of 10,000+ tracks. Try keywords, describe a mood, or ask about your projects.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg">
        <ExamplePrompt text="rock" isDark={isDark} />
        <ExamplePrompt text="classical" isDark={isDark} />
        <ExamplePrompt text="dark tension suspense" isDark={isDark} />
        <ExamplePrompt text="What projects am I working on?" isDark={isDark} />
      </div>
    </div>
  );
}

function ExamplePrompt({ text, isDark }) {
  return (
    <div className={`rounded-lg px-4 py-2 text-sm text-left transition-colors cursor-default ${
      isDark
        ? 'bg-apm-navy/50 border border-apm-gray/20 text-apm-gray-light hover:border-apm-purple/50'
        : 'bg-white border border-gray-200 text-gray-600 hover:border-apm-purple/50 shadow-sm'
    }`}>
      "{text}"
    </div>
  );
}
