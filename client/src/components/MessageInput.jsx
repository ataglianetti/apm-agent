import { useState, useRef, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';

const FIELD_OPTIONS = [
  {
    key: 'text',
    label: 'Text (All Fields)',
    field: 'text',
    description: 'Search keywords across all fields',
  },
  {
    key: 'track-title',
    label: 'Track Title',
    field: 'track_title',
    description: 'Search by track name',
  },
  {
    key: 'track-description',
    label: 'Track Description',
    field: 'track_description',
    description: 'Search track descriptions',
  },
  { key: 'album-title', label: 'Album', field: 'album_title', description: 'Search by album name' },
  { key: 'composer', label: 'Composer', field: 'composer', description: 'Search by composer name' },
  {
    key: 'library',
    label: 'Library',
    field: 'library_name',
    description: 'Search by library name',
  },
  { key: 'genre', label: 'Genre', field: 'genre', description: 'Search by genre' },
  { key: 'mood', label: 'Mood', field: 'mood', description: 'Search by mood' },
  { key: 'music-for', label: 'Music For', field: 'music_for', description: 'Search by use case' },
  {
    key: 'instruments',
    label: 'Instruments',
    field: 'instruments',
    description: 'Search by instruments',
  },
  { key: 'tempo', label: 'Tempo', field: 'tempo', description: 'Search by tempo' },
  {
    key: 'movement',
    label: 'Movement',
    field: 'movement',
    description: 'Search by movement/energy',
  },
  { key: 'character', label: 'Character', field: 'character', description: 'Search by character' },
  { key: 'vocals', label: 'Vocals', field: 'vocals', description: 'Search by vocal type' },
  { key: 'time-period', label: 'Era', field: 'time_period', description: 'Search by era/period' },
  { key: 'bpm', label: 'BPM', field: 'bpm', description: 'Search by tempo (e.g., @bpm>120)' },
];

// Field labels for better display
const fieldLabels = {
  text: 'Text',
  'track-title': 'Title',
  'track-description': 'Description',
  'album-title': 'Album',
  composer: 'Composer',
  library: 'Library',
  genre: 'Genre',
  mood: 'Mood',
  'music-for': 'Music For',
  instruments: 'Instruments',
  tempo: 'Tempo',
  movement: 'Movement',
  character: 'Character',
  vocals: 'Vocals',
  'time-period': 'Era',
  bpm: 'BPM',
};

/**
 * Check if a query is a simple text search (should become a text pill)
 * Simple = 1-4 words, no special characters, no question marks
 */
function isSimpleTextQuery(text) {
  if (!text || !text.trim()) return false;
  const trimmed = text.trim();
  const words = trimmed.split(/\s+/);
  // 1-4 words, no special characters that indicate complex queries
  return words.length >= 1 && words.length <= 4 && !/[?!@#$%^&*()_+=[\]{}|\\:;"'<>,]/.test(trimmed);
}

export function MessageInput({
  onSend,
  disabled,
  pills = [],
  onPillsChange,
  onRemovePill,
  onClearPills,
}) {
  const { isDark } = useTheme();
  // Use pills from props if provided, otherwise use internal state for backward compatibility
  const [internalFilters, setInternalFilters] = useState([]);
  const activeFilters = onPillsChange ? pills : internalFilters;
  const setActiveFilters = onPillsChange || setInternalFilters;
  const [searchText, setSearchText] = useState(''); // Main search text
  const [showFieldMenu, setShowFieldMenu] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [filterText, setFilterText] = useState('');
  const inputRef = useRef(null);
  const menuRef = useRef(null);

  // Filter options based on text after @
  const filteredOptions = FIELD_OPTIONS.filter(
    opt =>
      opt.label.toLowerCase().includes(filterText.toLowerCase()) ||
      opt.key.toLowerCase().includes(filterText.toLowerCase())
  );

  // Smart value extraction for multi-word values
  const extractMultiWordValue = (text, fieldKey, nextAtIndex) => {
    const naturalBoundaries = [
      ' for ',
      ' with ',
      ' that ',
      ' having ',
      ' featuring ',
      ' in ',
      ' and ',
      ' but ',
      ' or ',
      ' like ',
      ' similar to ',
      ' such as ',
    ];

    // Extract until next @ or natural boundary
    let value = nextAtIndex > 0 ? text.slice(0, nextAtIndex) : text;

    // Check for natural language boundaries
    for (const boundary of naturalBoundaries) {
      const idx = value.toLowerCase().indexOf(boundary);
      if (idx > 0 && idx < 50) {
        value = value.slice(0, idx);
        break;
      }
    }

    // Field-specific word limits
    const multiWordFields = [
      'track-title',
      'album-title',
      'composer',
      'library',
      'track-description',
    ];
    const limit = multiWordFields.includes(fieldKey) ? 5 : 3;

    const words = value.trim().split(/\s+/);
    if (words.length > limit) {
      return words.slice(0, limit).join(' ');
    }

    return value.trim();
  };

  // Enhanced filter parsing that handles multi-word values
  const parseEnhancedFilters = text => {
    const filters = [];
    let workingText = text;

    // Enhanced regex to detect filter patterns
    const filterPattern = /@([a-z-]+)([:=])/gi;
    let match;
    const matches = [];

    // Collect all matches first
    while ((match = filterPattern.exec(text)) !== null) {
      matches.push({
        index: match.index,
        fullMatch: match[0],
        fieldKey: match[1],
        operator: match[2],
        startIdx: match.index + match[0].length,
      });
    }

    // Process matches and extract values
    matches.forEach((match, idx) => {
      const nextMatchIdx = idx < matches.length - 1 ? matches[idx + 1].index : text.length;
      const valueText = text.slice(match.startIdx, nextMatchIdx);
      const value = extractMultiWordValue(
        valueText,
        match.fieldKey,
        idx < matches.length - 1 ? nextMatchIdx - match.startIdx : -1
      );

      const field = FIELD_OPTIONS.find(opt => opt.key === match.fieldKey.toLowerCase());

      if (field && value) {
        filters.push({
          key: field.key,
          label: fieldLabels[field.key] || field.label,
          operator: match.operator,
          value: value,
        });

        // Remove this filter from working text
        const filterEnd = match.startIdx + value.length;
        const fullFilterText = text.slice(match.index, filterEnd);
        workingText = workingText.replace(fullFilterText, '').trim();
      }
    });

    return {
      filters,
      remainingText: workingText.replace(/\s+/g, ' ').trim(),
    };
  };

  // Detect @ symbol in search text and show menu
  useEffect(() => {
    const atIndex = searchText.lastIndexOf('@');
    if (atIndex !== -1) {
      const charBefore = searchText[atIndex - 1];
      if (atIndex === 0 || charBefore === ' ') {
        const textAfterAt = searchText.slice(atIndex + 1);

        // Check if we have = or : operator
        const hasOperator = textAfterAt.includes('=') || textAfterAt.includes(':');

        if (!hasOperator && !textAfterAt.includes(' ')) {
          // Still typing the field name
          setShowFieldMenu(true);
          setFilterText(textAfterAt);
          setSelectedIndex(0);
          return;
        } else if (hasOperator) {
          // User has selected a field with operator
          setShowFieldMenu(false);
          // Don't auto-add chip yet, let user finish typing the value
        }
      }
    }

    if (!searchText.includes('@')) {
      setShowFieldMenu(false);
      setFilterText('');
    }
  }, [searchText]);

  const handleSubmit = e => {
    e.preventDefault();

    // Parse any @filters still in the input
    const parsed = parseEnhancedFilters(searchText);

    // Create new pills from parsed filters with unique IDs
    const newFilterPills = parsed.filters.map(f => ({
      id: `filter-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'filter',
      key: f.key,
      label: f.label,
      operator: f.operator,
      value: f.value,
    }));

    // Check if remaining text should become a text pill
    let newTextPill = null;
    let remainingText = parsed.remainingText;

    if (remainingText && isSimpleTextQuery(remainingText)) {
      // Simple text query becomes a pill
      newTextPill = {
        id: `text-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'text',
        value: remainingText,
      };
      remainingText = ''; // Clear remaining text since it's now a pill
    }

    // Combine all new pills
    const newPills = [...newFilterPills, ...(newTextPill ? [newTextPill] : [])];

    // If using new prop-based pill management (Phase 2+)
    if (onPillsChange) {
      if (newPills.length > 0 || remainingText) {
        // Pass query and new pills to parent
        // Parent will handle adding pills and executing search
        onSend(remainingText, newPills);
        setSearchText('');
        setShowFieldMenu(false);
      }
      return;
    }

    // Legacy behavior (backward compatibility)
    // Combine with existing pills
    const updatedFilters = [...activeFilters, ...newPills];

    // Only update if we have new pills
    if (newPills.length > 0) {
      setActiveFilters(updatedFilters);
    }

    // Build query from all pills + remaining text
    // Default to 'filter' for backward compatibility
    const filterPills = updatedFilters.filter(f => (f.type || 'filter') === 'filter');
    const textPills = updatedFilters.filter(f => f.type === 'text');

    const filterString = filterPills.map(f => `@${f.key}${f.operator}${f.value}`).join(' ');
    const textString = textPills.map(f => f.value).join(' ');

    // Combine: filters first, then text pills, then any remaining text
    const parts = [filterString, textString, remainingText].filter(Boolean);
    const fullQuery = parts.join(' ');

    if (fullQuery.trim() && !disabled) {
      onSend(fullQuery.trim());
      setSearchText(''); // Only clear input, keep pills
      setShowFieldMenu(false);
    }
  };

  // Remove pill (filter or text) with auto re-search
  const handleRemovePill = pillId => {
    // If using prop-based pill management
    if (onRemovePill) {
      onRemovePill(pillId);
      inputRef.current?.focus();
      return;
    }

    // Legacy behavior
    const updatedFilters = activeFilters.filter(f => f.id !== pillId);
    setActiveFilters(updatedFilters);

    // Auto re-search with remaining pills
    const hasContent = updatedFilters.length > 0 || searchText.trim();

    if (hasContent && !disabled) {
      // Default to 'filter' for backward compatibility
      const filterPills = updatedFilters.filter(f => (f.type || 'filter') === 'filter');
      const textPills = updatedFilters.filter(f => f.type === 'text');

      const filterString = filterPills.map(f => `@${f.key}${f.operator}${f.value}`).join(' ');
      const textString = textPills.map(f => f.value).join(' ');

      const parts = [filterString, textString, searchText].filter(Boolean);
      const fullQuery = parts.join(' ');

      if (fullQuery.trim()) {
        onSend(fullQuery.trim());
      }
    }

    inputRef.current?.focus();
  };

  // Clear all filters
  const clearAllFilters = () => {
    // If using prop-based pill management
    if (onClearPills) {
      onClearPills();
      inputRef.current?.focus();
      return;
    }

    // Legacy behavior
    setActiveFilters([]);

    // If we have search text, re-search with just that
    if (searchText.trim() && !disabled) {
      onSend(searchText.trim());
    }

    inputRef.current?.focus();
  };

  // Maintain focus on the input field after sending messages
  useEffect(() => {
    // When disabled changes from true to false (message was sent and response received),
    // refocus the input
    if (!disabled && inputRef.current) {
      inputRef.current.focus();
    }
  }, [disabled]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const selectFieldOption = option => {
    // Replace the @field part with @field: in the search text
    const atIndex = searchText.lastIndexOf('@');
    const beforeAt = searchText.slice(0, atIndex);

    // Add : to the search text for the user to type the value
    setSearchText(beforeAt + `@${option.key}:`);
    setShowFieldMenu(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = e => {
    if (showFieldMenu && filteredOptions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % filteredOptions.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + filteredOptions.length) % filteredOptions.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        selectFieldOption(filteredOptions[selectedIndex]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setShowFieldMenu(false);
      }
    } else if (e.key === 'Backspace' && searchText === '' && activeFilters.length > 0) {
      // Backspace on empty input removes the last pill
      e.preventDefault();
      const lastPill = activeFilters[activeFilters.length - 1];
      handleRemovePill(lastPill.id);
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={`p-4 border-t relative ${isDark ? 'border-apm-gray/20 bg-apm-dark' : 'border-gray-200 bg-white'}`}
    >
      {/* Field Selection Menu */}
      {showFieldMenu && filteredOptions.length > 0 && (
        <div
          ref={menuRef}
          className={`absolute bottom-full left-4 right-4 mb-2 border rounded-lg shadow-lg overflow-hidden z-10 ${
            isDark ? 'bg-apm-navy border-apm-gray/30' : 'bg-white border-gray-200'
          }`}
        >
          <div
            className={`px-3 py-2 text-xs border-b ${isDark ? 'text-apm-gray border-apm-gray/20' : 'text-gray-500 border-gray-100'}`}
          >
            Search by field
          </div>
          {filteredOptions.map((option, index) => (
            <button
              key={option.key}
              type="button"
              onClick={() => selectFieldOption(option)}
              className={`w-full px-3 py-2 text-left flex items-center justify-between transition-colors ${
                index === selectedIndex
                  ? 'bg-apm-purple/20 text-apm-purple'
                  : isDark
                    ? 'text-apm-gray-light hover:bg-apm-dark/50'
                    : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <div>
                <span className="font-medium">@{option.key}</span>
                <span className={`ml-2 text-sm ${isDark ? 'text-apm-gray' : 'text-gray-400'}`}>
                  {option.label}
                </span>
              </div>
              <span className={`text-xs ${isDark ? 'text-apm-gray' : 'text-gray-400'}`}>
                {option.description}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Persistent Pills (Filter pills = purple, Text pills = blue) */}
      {activeFilters.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3 px-1">
          {activeFilters.map(pill => (
            <span
              key={pill.id}
              className={`inline-flex items-center gap-1 text-sm px-2.5 py-1.5 rounded-md flex-shrink-0 transition-colors ${
                (pill.type || 'filter') === 'text'
                  ? isDark
                    ? 'bg-blue-500/30 text-blue-300 hover:bg-blue-500/40'
                    : 'bg-blue-500/20 text-blue-700 hover:bg-blue-500/30'
                  : isDark
                    ? 'bg-apm-purple/30 text-apm-purple-light hover:bg-apm-purple/40'
                    : 'bg-apm-purple/20 text-apm-purple hover:bg-apm-purple/30'
              }`}
            >
              <span className="font-medium">
                {(pill.type || 'filter') === 'text' ? (
                  <>
                    <span className="opacity-60">text:</span>
                    {pill.value}
                  </>
                ) : (
                  <>
                    {pill.label}: {pill.value}
                  </>
                )}
              </span>
              <button
                type="button"
                onClick={() => handleRemovePill(pill.id)}
                className={`ml-1 p-0.5 rounded-full transition-colors ${
                  isDark
                    ? 'hover:bg-red-500/20 hover:text-red-300'
                    : 'hover:bg-red-500/20 hover:text-red-600'
                }`}
                aria-label={`Remove ${(pill.type || 'filter') === 'text' ? pill.value : pill.label} ${(pill.type || 'filter') === 'text' ? 'search term' : 'filter'}`}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </span>
          ))}

          {/* Clear All button when many pills */}
          {activeFilters.length > 2 && (
            <button
              type="button"
              onClick={clearAllFilters}
              className={`text-xs px-2 py-1 rounded-md transition-colors ${
                isDark
                  ? 'text-apm-gray-light hover:text-white hover:bg-apm-dark/50'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }`}
            >
              Clear all
            </button>
          )}
        </div>
      )}

      <div className="flex gap-3">
        <div
          className={`flex-1 rounded-xl px-3 py-2 border focus-within:ring-2 focus-within:ring-apm-purple focus-within:border-transparent ${
            isDark ? 'bg-apm-navy border-apm-gray/30' : 'bg-gray-50 border-gray-200'
          }`}
        >
          <input
            ref={inputRef}
            type="text"
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              activeFilters.length > 0
                ? 'Add more filters or refine search...'
                : 'Search for music... (type @ for field search)'
            }
            disabled={disabled}
            className={`w-full bg-transparent py-1 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${
              isDark
                ? 'text-apm-light placeholder:text-apm-gray'
                : 'text-gray-900 placeholder:text-gray-400'
            }`}
          />
        </div>
        <button
          type="submit"
          disabled={disabled || (!searchText.trim() && activeFilters.length === 0)}
          className="bg-apm-purple hover:bg-apm-purple-light text-white font-medium
                     rounded-xl px-6 py-3 transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-apm-purple"
        >
          {disabled ? (
            <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          ) : (
            'Send'
          )}
        </button>
      </div>
    </form>
  );
}
