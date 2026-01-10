import { useState, useRef, useEffect } from 'react';

/**
 * Tooltip component with mobile support
 * - Click/tap to toggle on mobile
 * - Hover on desktop
 * - Smart positioning to avoid viewport edges
 */
export function Tooltip({ content, children, isDark, position = 'top', showIcon = false }) {
  const [isVisible, setIsVisible] = useState(false);
  const [actualPosition, setActualPosition] = useState(position);
  const tooltipRef = useRef(null);
  const triggerRef = useRef(null);

  // Close tooltip when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (
        tooltipRef.current &&
        !tooltipRef.current.contains(event.target) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target)
      ) {
        setIsVisible(false);
      }
    }

    if (isVisible) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isVisible]);

  // Adjust position if tooltip would go off screen
  useEffect(() => {
    if (isVisible && tooltipRef.current) {
      const rect = tooltipRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let newPosition = position;

      if (position === 'top' && rect.top < 0) {
        newPosition = 'bottom';
      } else if (position === 'bottom' && rect.bottom > viewportHeight) {
        newPosition = 'top';
      } else if (position === 'left' && rect.left < 0) {
        newPosition = 'right';
      } else if (position === 'right' && rect.right > viewportWidth) {
        newPosition = 'left';
      }

      if (newPosition !== actualPosition) {
        setActualPosition(newPosition);
      }
    }
  }, [isVisible, position, actualPosition]);

  // Close on escape key
  useEffect(() => {
    function handleEscape(event) {
      if (event.key === 'Escape') {
        setIsVisible(false);
      }
    }

    if (isVisible) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isVisible]);

  const handleToggle = e => {
    e.preventDefault();
    e.stopPropagation();
    setIsVisible(!isVisible);
  };

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  const arrowClasses = {
    top: 'top-full left-1/2 -translate-x-1/2 -mt-1 border-t border-l',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 -mb-1 border-b border-r',
    left: 'left-full top-1/2 -translate-y-1/2 -ml-1 border-t border-r',
    right: 'right-full top-1/2 -translate-y-1/2 -mr-1 border-b border-l',
  };

  // Render content based on type
  const renderContent = () => {
    if (typeof content === 'string') {
      return <p>{content}</p>;
    }

    if (content.description) {
      return (
        <div className="space-y-2">
          <p className={isDark ? 'text-gray-200' : 'text-gray-700'}>{content.description}</p>
          {content.tips && content.tips.length > 0 && (
            <ul className={`text-xs space-y-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              {content.tips.map((tip, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span className="text-apm-purple mt-0.5">*</span>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          )}
          {content.example && (
            <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
              Example: <code className="font-mono">{content.example}</code>
            </p>
          )}
        </div>
      );
    }

    return content;
  };

  return (
    <span className="relative inline-flex items-center">
      {children}
      {showIcon && (
        <button
          ref={triggerRef}
          type="button"
          onClick={handleToggle}
          onMouseEnter={() => setIsVisible(true)}
          onMouseLeave={() => setIsVisible(false)}
          onFocus={() => setIsVisible(true)}
          onBlur={() => setIsVisible(false)}
          className={`ml-1 p-0.5 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-apm-purple/50 ${
            isDark
              ? 'text-gray-500 hover:text-gray-300 hover:bg-apm-gray/20'
              : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
          }`}
          aria-label="Help"
          aria-expanded={isVisible}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </button>
      )}

      {isVisible && (
        <div
          ref={tooltipRef}
          role="tooltip"
          className={`absolute z-50 w-64 p-3 rounded-lg shadow-xl text-sm ${positionClasses[actualPosition]} ${
            isDark
              ? 'bg-apm-dark border border-apm-gray/30 text-gray-200'
              : 'bg-white border border-gray-200 text-gray-700 shadow-lg'
          }`}
        >
          {renderContent()}
          <div
            className={`absolute w-2 h-2 rotate-45 ${arrowClasses[actualPosition]} ${
              isDark ? 'bg-apm-dark border-apm-gray/30' : 'bg-white border-gray-200'
            }`}
          />
        </div>
      )}
    </span>
  );
}

/**
 * Standalone tooltip trigger with "?" icon
 * Convenience wrapper for common use case
 */
export function HelpTooltip({ content, isDark }) {
  return <Tooltip content={content} isDark={isDark} showIcon />;
}
