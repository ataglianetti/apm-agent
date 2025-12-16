import { useState, useRef, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';

const FIELD_OPTIONS = [
  { key: 'track-title', label: 'Track Title', field: 'track_title', description: 'Search by track name' },
  { key: 'track-description', label: 'Track Description', field: 'track_description', description: 'Search track descriptions' },
  { key: 'album-title', label: 'Album', field: 'album_title', description: 'Search by album name' },
  { key: 'composer', label: 'Composer', field: 'composer', description: 'Search by composer name' },
  { key: 'library', label: 'Library', field: 'library_name', description: 'Search by library name' },
  { key: 'tags', label: 'Tags/Genre', field: 'genre', description: 'Search by genre tags' },
  { key: 'lyrics-text', label: 'Lyrics', field: 'lyrics', description: 'Search lyrics content' },
  { key: 'inspired-by', label: 'Inspired By', field: 'inspired_by', description: 'Search by inspiration references' },
  { key: 'bpm', label: 'BPM', field: 'bpm', description: 'Search by tempo' },
];

export function MessageInput({ onSend, disabled }) {
  const { isDark } = useTheme();
  const [selectedFields, setSelectedFields] = useState([]); // Multiple selected @fields as chips
  const [searchText, setSearchText] = useState(''); // Main search text
  const [showFieldMenu, setShowFieldMenu] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [filterText, setFilterText] = useState('');
  const [currentFieldValue, setCurrentFieldValue] = useState(''); // Value being typed for current field
  const [currentFieldOperator, setCurrentFieldOperator] = useState(':'); // : or =
  const inputRef = useRef(null);
  const menuRef = useRef(null);

  // Filter options based on text after @
  const filteredOptions = FIELD_OPTIONS.filter(opt =>
    opt.label.toLowerCase().includes(filterText.toLowerCase()) ||
    opt.key.toLowerCase().includes(filterText.toLowerCase())
  );

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

  const handleSubmit = (e) => {
    e.preventDefault();

    // Parse any remaining @ filters in the search text
    const finalFilters = parseFieldsFromText(searchText);
    const allFilters = [...selectedFields, ...finalFilters.filters];

    if ((allFilters.length > 0 || finalFilters.remainingText.trim()) && !disabled) {
      // Build the full query with all filters and remaining text
      const filterString = allFilters.map(f => `@${f.key}${f.operator}${f.value}`).join(' ');
      const fullQuery = filterString + (finalFilters.remainingText ? ' ' + finalFilters.remainingText : '');

      onSend(fullQuery.trim());
      setSearchText('');
      setSelectedFields([]);
      setShowFieldMenu(false);
    }
  };

  // Parse @ filters from text and return filters + remaining text
  const parseFieldsFromText = (text) => {
    const filters = [];
    let remainingText = text;

    // Match @field:value or @field=value patterns
    const regex = /@([a-z-]+)([:=])([^\s@]+)/gi;
    let match;

    while ((match = regex.exec(text)) !== null) {
      const [fullMatch, fieldKey, operator, value] = match;
      const field = FIELD_OPTIONS.find(opt => opt.key === fieldKey.toLowerCase());

      if (field) {
        filters.push({
          key: field.key,
          label: field.label,
          operator: operator,
          value: value
        });

        // Remove this filter from the remaining text
        remainingText = remainingText.replace(fullMatch, '').trim();
      }
    }

    return { filters, remainingText };
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

  const selectFieldOption = (option) => {
    // Replace the @field part with @field: in the search text
    const atIndex = searchText.lastIndexOf('@');
    const beforeAt = searchText.slice(0, atIndex);

    // Add : to the search text for the user to type the value
    setSearchText(beforeAt + `@${option.key}:`);
    setShowFieldMenu(false);
    inputRef.current?.focus();
  };

  const removeFieldChip = (index) => {
    const newFields = selectedFields.filter((_, i) => i !== index);
    setSelectedFields(newFields);
    inputRef.current?.focus();
  };

  // Convert completed filters in text to chips when user hits space
  useEffect(() => {
    if (searchText.endsWith(' ')) {
      const parsed = parseFieldsFromText(searchText);
      if (parsed.filters.length > 0) {
        setSelectedFields(prev => [...prev, ...parsed.filters]);
        setSearchText(parsed.remainingText);
      }
    }
  }, [searchText]);

  const handleKeyDown = (e) => {
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
    } else if (e.key === 'Backspace' && searchText === '' && selectedFields.length > 0) {
      // Backspace on empty input removes the last chip
      e.preventDefault();
      removeFieldChip(selectedFields.length - 1);
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={`p-4 border-t relative ${isDark ? 'border-apm-gray/20 bg-apm-dark' : 'border-gray-200 bg-white'}`}>
      {/* Field Selection Menu */}
      {showFieldMenu && filteredOptions.length > 0 && (
        <div
          ref={menuRef}
          className={`absolute bottom-full left-4 right-4 mb-2 border rounded-lg shadow-lg overflow-hidden z-10 ${
            isDark ? 'bg-apm-navy border-apm-gray/30' : 'bg-white border-gray-200'
          }`}
        >
          <div className={`px-3 py-2 text-xs border-b ${isDark ? 'text-apm-gray border-apm-gray/20' : 'text-gray-500 border-gray-100'}`}>
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
                  : isDark ? 'text-apm-gray-light hover:bg-apm-dark/50' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <div>
                <span className="font-medium">@{option.key}</span>
                <span className={`ml-2 text-sm ${isDark ? 'text-apm-gray' : 'text-gray-400'}`}>{option.label}</span>
              </div>
              <span className={`text-xs ${isDark ? 'text-apm-gray' : 'text-gray-400'}`}>{option.description}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-3">
        <div className={`flex-1 rounded-xl px-3 py-2 border focus-within:ring-2 focus-within:ring-apm-purple focus-within:border-transparent ${
          isDark ? 'bg-apm-navy border-apm-gray/30' : 'bg-gray-50 border-gray-200'
        }`}>
          <div className="flex items-center flex-wrap gap-2">
            {/* Multiple Field Chips */}
            {selectedFields.map((field, index) => (
              <span
                key={index}
                className={`inline-flex items-center gap-1 text-sm px-2 py-1 rounded-md flex-shrink-0 ${
                  isDark ? 'bg-apm-purple/30 text-apm-purple-light' : 'bg-apm-purple/20 text-apm-purple'
                }`}
              >
                <span className="font-medium">
                  @{field.key}{field.operator}{field.value}
                </span>
                <button
                  type="button"
                  onClick={() => removeFieldChip(index)}
                  className={`transition-colors ${isDark ? 'hover:text-white' : 'hover:text-apm-purple-dark'}`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            ))}
            <input
              ref={inputRef}
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={selectedFields.length > 0 ? "Add more filters or search text..." : "Search for music... (type @ for field search)"}
              disabled={disabled}
              className={`flex-1 min-w-[200px] bg-transparent py-1 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${
                isDark ? 'text-apm-light placeholder:text-apm-gray' : 'text-gray-900 placeholder:text-gray-400'
              }`}
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={disabled || !searchText.trim()}
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
