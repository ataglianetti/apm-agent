# Filter Pills Implementation Plan

## Overview
Transform the search input to support persistent filter pills that allow progressive refinement of searches, with multi-word values and better UX.

## Current State Analysis

### Current Implementation (MessageInput.jsx)
- **Auto-conversion on space**: Filters convert to chips when user hits space
- **Pills clear on submit**: All chips and text cleared after search
- **Single-word values only**: Regex `/@([a-z-]+)([:=])([^\s@]+)/gi` stops at first space
- **No progressive refinement**: Each search is independent

### Problems to Solve
1. **Multi-word values not captured**: `@composer:john williams` only captures "john"
2. **Pills disappear after search**: Can't progressively refine
3. **Pills created too early**: Auto-convert on space interrupts typing
4. **No auto re-search on removal**: Must manually search after removing pill

## Implementation Details

### Phase 1: Core Functionality

#### 1.1 Update State Management (MessageInput.jsx)
```javascript
// CURRENT STATE
const [selectedFields, setSelectedFields] = useState([]);
const [searchText, setSearchText] = useState('');

// NEW STATE
const [activeFilters, setActiveFilters] = useState([]); // Persistent pills
const [searchText, setSearchText] = useState(''); // Current input
// Each filter: {id, key, label, operator, value}
```

#### 1.2 Enhanced Filter Parsing
Add smart multi-word value extraction:

```javascript
function extractMultiWordValue(text, fieldKey, nextAtIndex) {
  const naturalBoundaries = [' for ', ' with ', ' that ', ' having ', ' featuring ',
    ' in ', ' and ', ' but ', ' or ', ' like ', ' similar to ', ' such as '];

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
  const multiWordFields = ['track-title', 'album-title', 'composer', 'artist', 'track-description'];
  const limit = multiWordFields.includes(fieldKey) ? 5 : 3;

  const words = value.trim().split(/\s+/);
  if (words.length > limit) {
    return words.slice(0, limit).join(' ');
  }

  return value.trim();
}

function parseEnhancedFilters(text) {
  const filters = [];
  let remainingText = text;

  // Enhanced regex or manual parsing for multi-word values
  const filterPattern = /@([a-z-]+)([:=])/gi;
  let match;

  while ((match = filterPattern.exec(text)) !== null) {
    const fieldKey = match[1];
    const operator = match[2];
    const startIdx = match.index + match[0].length;

    // Find next @ symbol
    const restOfText = text.slice(startIdx);
    const nextAtIndex = restOfText.search(/@[a-z-]+[:=]/);

    // Extract value intelligently
    const value = extractMultiWordValue(restOfText, fieldKey, nextAtIndex);

    filters.push({
      key: fieldKey,
      label: fieldLabels[fieldKey] || fieldKey,
      operator,
      value
    });

    // Remove this filter from remaining text
    const filterEnd = startIdx + value.length;
    remainingText = remainingText.replace(text.slice(match.index, filterEnd), '');
  }

  return {
    filters,
    remainingText: remainingText.trim()
  };
}
```

#### 1.3 Remove Auto-Conversion on Space
DELETE this useEffect (lines 145-153):
```javascript
// DELETE THIS ENTIRE BLOCK
useEffect(() => {
  if (searchText.endsWith(' ')) {
    const parsed = parseFieldsFromText(searchText);
    if (parsed.filters.length > 0) {
      setSelectedFields(prev => [...prev, ...parsed.filters]);
      setSearchText(parsed.remainingText);
    }
  }
}, [searchText]);
```

#### 1.4 Update Submit Handler (Only Create Pills on Enter)
```javascript
const handleSubmit = (e) => {
  e.preventDefault();

  // Parse any @filters still in the input
  const parsed = parseEnhancedFilters(searchText);

  // Create new pills from parsed filters
  const newPills = parsed.filters.map(f => ({
    id: `filter-${Date.now()}-${Math.random()}`,
    key: f.key,
    label: f.label,
    operator: f.operator,
    value: f.value
  }));

  // Combine with existing pills
  const updatedFilters = [...activeFilters, ...newPills];
  setActiveFilters(updatedFilters);

  // Build query from all pills + remaining text
  const filterString = updatedFilters
    .map(f => `@${f.key}${f.operator}${f.value}`)
    .join(' ');
  const fullQuery = filterString +
    (parsed.remainingText ? ' ' + parsed.remainingText : '');

  if ((updatedFilters.length > 0 || parsed.remainingText.trim()) && !disabled) {
    onSend(fullQuery.trim());
    setSearchText(''); // Only clear input, keep pills
  }
};
```

#### 1.5 Implement Pill Removal with Auto Re-search
```javascript
const removeFilter = (filterId) => {
  const updatedFilters = activeFilters.filter(f => f.id !== filterId);
  setActiveFilters(updatedFilters);

  // Auto re-search if filters or text remain
  const hasContent = updatedFilters.length > 0 || searchText.trim();

  if (hasContent && !disabled) {
    const filterString = updatedFilters
      .map(f => `@${f.key}${f.operator}${f.value}`)
      .join(' ');
    const fullQuery = filterString + (searchText ? ' ' + searchText : '');
    onSend(fullQuery.trim());
  }

  inputRef.current?.focus();
};
```

#### 1.6 Update Backspace Handler
```javascript
// In handleKeyDown
else if (e.key === 'Backspace' && searchText === '' && activeFilters.length > 0) {
  e.preventDefault();
  const lastFilter = activeFilters[activeFilters.length - 1];
  removeFilter(lastFilter.id);
}
```

### Phase 2: UI Updates

#### 2.1 Update JSX Rendering
Replace current chip rendering (lines 220-240) with:

```jsx
{/* Filter Pills Container */}
{activeFilters.length > 0 && (
  <div className="flex flex-wrap gap-2 mb-2">
    {activeFilters.map((filter) => (
      <span
        key={filter.id}
        className={`inline-flex items-center gap-1 text-sm px-2 py-1 rounded-md flex-shrink-0 ${
          isDark ? 'bg-apm-purple/30 text-apm-purple-light hover:bg-apm-purple/40'
                 : 'bg-apm-purple/20 text-apm-purple hover:bg-apm-purple/30'
        } transition-colors`}
      >
        <span className="font-medium">
          @{filter.key}{filter.operator}{filter.value}
        </span>
        <button
          type="button"
          onClick={() => removeFilter(filter.id)}
          className={`p-0.5 rounded-full transition-colors ${
            isDark ? 'hover:bg-red-500/20 hover:text-red-300'
                   : 'hover:bg-red-500/20 hover:text-red-600'
          }`}
          aria-label={`Remove ${filter.label} filter`}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </span>
    ))}

    {/* Optional: Clear All button */}
    {activeFilters.length > 2 && (
      <button
        type="button"
        onClick={() => {
          setActiveFilters([]);
          inputRef.current?.focus();
        }}
        className={`text-xs px-2 py-1 rounded-md ${
          isDark ? 'text-apm-gray-light hover:text-white'
                 : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        Clear all
      </button>
    )}
  </div>
)}
```

### Phase 3: Field Labels Mapping
Add field labels for better display:

```javascript
const fieldLabels = {
  'track-title': 'Title',
  'track-description': 'Description',
  'album-title': 'Album',
  'composer': 'Composer',
  'library': 'Library',
  'tags': 'Genre',
  'mood': 'Mood',
  'energy': 'Energy',
  'use-case': 'Use Case',
  'instruments': 'Instruments',
  'era': 'Era',
  'bpm': 'BPM',
  'duration': 'Duration',
  'has-stems': 'Stems'
};
```

## User Experience Flow

### 1. Initial Search
```
User types: "@library:MLB Music for baseball"
Presses Enter
→ Pill created: [Library: MLB Music]
→ Search sent: "@library:MLB Music for baseball"
→ Input cleared, pill remains
```

### 2. Progressive Refinement
```
Pill visible: [Library: MLB Music]
User types: "@tags:rock"
Presses Enter
→ New pill created: [Genre: rock]
→ Both pills visible
→ Search sent: "@library:MLB Music @tags:rock"
```

### 3. Pill Removal
```
Pills visible: [Library: MLB Music] [Genre: rock]
User clicks X on first pill
→ First pill removed
→ Auto re-search: "@tags:rock"
→ Results updated
```

### 4. Backspace Removal
```
Pills visible: [Library: MLB Music] [Genre: rock]
Input empty, user presses Backspace
→ Last pill removed: [Genre: rock]
→ Auto re-search: "@library:MLB Music"
```

## Testing Strategy

### Unit Tests
1. **Multi-word parsing**: Test `extractMultiWordValue()` with various inputs
2. **Filter parsing**: Test `parseEnhancedFilters()` with complex queries
3. **Pill persistence**: Verify pills remain after submit
4. **Auto re-search**: Test removal triggers new search

### Integration Tests
1. **Progressive refinement flow**: Add multiple filters sequentially
2. **Mixed input**: Combine pills with free text search
3. **Removal scenarios**: Test X button and backspace
4. **Edge cases**: Empty searches, special characters

### Manual Testing Checklist
- [ ] Multi-word values work (`@composer:john williams`)
- [ ] Pills persist after search
- [ ] Pills only created on Enter (not space)
- [ ] X button removes pill and re-searches
- [ ] Backspace removes last pill when input empty
- [ ] Clear all button works (when >2 pills)
- [ ] Can combine pills with free text
- [ ] Natural language boundaries detected
- [ ] Field-specific word limits applied

## Implementation Order

1. **Core parsing logic** - Add `extractMultiWordValue()` and `parseEnhancedFilters()`
2. **State updates** - Change to `activeFilters` state
3. **Remove auto-conversion** - Delete the space-triggered useEffect
4. **Update submit handler** - Implement pill creation on Enter
5. **Add removal logic** - Implement `removeFilter()` with auto re-search
6. **Update UI** - Replace chip rendering with new pill component
7. **Add backspace handler** - Update keyboard event handling
8. **Testing** - Unit and integration tests
9. **Polish** - Animations, tooltips, accessibility

## Files to Modify

### Primary Changes
- `client/src/components/MessageInput.jsx` - All main changes

### No Backend Changes Needed
- Backend already supports multi-word values
- Filter parser on backend handles natural language boundaries

## Success Metrics
- Pills persist across searches ✓
- Multi-word values work correctly ✓
- Auto re-search on removal ✓
- Improved user experience for iterative search refinement ✓
- No regression in existing functionality ✓

## Future Enhancements (Not in MVP)
1. **Drag to reorder pills**
2. **Pill editing** (click to edit value)
3. **Saved filter sets** (bookmark common combinations)
4. **Filter history** (recently used filters)
5. **URL state** (shareable searches)
6. **Keyboard navigation** (arrow keys to select pills)
7. **Filter suggestions** (autocomplete for values)
8. **OR logic** (group filters with OR operator)

---

This plan provides a complete roadmap for implementing persistent filter pills with progressive search refinement.