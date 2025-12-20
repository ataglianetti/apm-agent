import { useTheme } from '../context/ThemeContext';
import { DemoControls } from './DemoControls';
import logoLight from '../assets/apm-logo-light.png';
import logoDark from '../assets/apm-logo-dark.png';

export function Header({ onClear, onSettingsChange }) {
  const { isDark, toggleTheme } = useTheme();

  return (
    <header className={`border-b px-6 py-4 flex items-center justify-between ${
      isDark ? 'bg-apm-navy border-apm-gray/20' : 'bg-white border-gray-200'
    }`}>
      <div className="flex items-center gap-3">
        <img
          src={isDark ? logoDark : logoLight}
          alt="APM Music"
          className="h-10 w-auto"
        />
        <p className={`text-sm ${isDark ? 'text-apm-gray-light' : 'text-gray-500'}`}>Search Assistant</p>
      </div>
      <div className="flex items-center gap-2">
        {/* Demo Controls */}
        <DemoControls onSettingsChange={onSettingsChange} />

        {/* Divider */}
        <div className={`h-6 w-px ${isDark ? 'bg-gray-600' : 'bg-gray-300'}`} />

        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className={`p-2 rounded-lg transition-colors ${
            isDark ? 'text-apm-gray-light hover:text-apm-light hover:bg-apm-gray/20' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
          }`}
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDark ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          )}
        </button>
        {/* Clear Chat */}
        <button
          onClick={onClear}
          className={`text-sm px-3 py-1.5 rounded-lg transition-colors ${
            isDark ? 'text-apm-gray-light hover:text-apm-light hover:bg-apm-gray/20' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
          }`}
        >
          Clear Chat
        </button>
      </div>
    </header>
  );
}
