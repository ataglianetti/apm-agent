import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

/**
 * Tooltip component with mobile support
 * - Click/tap to toggle on mobile
 * - Hover on desktop
 * - Renders via Portal to escape overflow containers
 */
export function Tooltip({ content, children, isDark, position = 'top', showIcon = false }) {
  const [isVisible, setIsVisible] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
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

  // Calculate tooltip position based on trigger element
  useEffect(() => {
    if (isVisible && triggerRef.current) {
      const triggerRect = triggerRef.current.getBoundingClientRect();
      const tooltipWidth = 256; // w-64 = 16rem = 256px
      const tooltipHeight = tooltipRef.current?.offsetHeight || 100;
      const gap = 8;

      let top, left;

      switch (position) {
        case 'bottom':
          top = triggerRect.bottom + gap;
          left = triggerRect.left + triggerRect.width / 2 - tooltipWidth / 2;
          break;
        case 'left':
          top = triggerRect.top + triggerRect.height / 2 - tooltipHeight / 2;
          left = triggerRect.left - tooltipWidth - gap;
          break;
        case 'right':
          top = triggerRect.top + triggerRect.height / 2 - tooltipHeight / 2;
          left = triggerRect.right + gap;
          break;
        case 'top':
        default:
          top = triggerRect.top - tooltipHeight - gap;
          left = triggerRect.left + triggerRect.width / 2 - tooltipWidth / 2;
          break;
      }

      // Keep tooltip within viewport
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      if (left < 8) left = 8;
      if (left + tooltipWidth > viewportWidth - 8) left = viewportWidth - tooltipWidth - 8;
      if (top < 8) top = triggerRect.bottom + gap; // Flip to bottom
      if (top + tooltipHeight > viewportHeight - 8) top = triggerRect.top - tooltipHeight - gap; // Flip to top

      setTooltipPosition({ top, left });
    }
  }, [isVisible, position]);

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

  const tooltipContent = isVisible
    ? createPortal(
        <div
          ref={tooltipRef}
          role="tooltip"
          onMouseEnter={() => setIsVisible(true)}
          onMouseLeave={() => setIsVisible(false)}
          style={{
            position: 'fixed',
            top: tooltipPosition.top,
            left: tooltipPosition.left,
            zIndex: 9999,
          }}
          className={`w-64 p-3 rounded-lg shadow-xl text-sm ${
            isDark
              ? 'bg-apm-dark border border-apm-gray/30 text-gray-200'
              : 'bg-white border border-gray-200 text-gray-700 shadow-lg'
          }`}
        >
          {renderContent()}
        </div>,
        document.body
      )
    : null;

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
      {tooltipContent}
    </span>
  );
}

/**
 * Standalone tooltip trigger with "?" icon
 * Convenience wrapper for common use case
 */
export function HelpTooltip({ content, isDark, position = 'top' }) {
  return <Tooltip content={content} isDark={isDark} position={position} showIcon />;
}
