import { useState, useCallback, useRef } from 'react';

// Generate unique IDs
let idCounter = 0;
function generateId(prefix) {
  return `${prefix}-${Date.now()}-${++idCounter}`;
}

/**
 * useSearch hook - Manages search state separately from conversation
 *
 * Search State (updates in place):
 * - pills: Current filter and text pills
 * - currentResults: Single result set that replaces when pills change
 *
 * Conversation (appends):
 * - conversation: Only Route 3 conversational messages
 */
export function useSearch() {
  // Persistent search state
  const [pills, setPills] = useState([]);
  const [currentResults, setCurrentResults] = useState(null);

  // Conversation history (only for Route 3 exchanges)
  const [conversation, setConversation] = useState([]);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Refs for synchronous access
  const pillsRef = useRef([]);
  const conversationRef = useRef([]);

  const settingsRef = useRef({
    llmProvider: 'claude',
    demoMode: false,
    showTimings: false,
    showArchitecture: false,
  });

  const updateSettings = useCallback(newSettings => {
    settingsRef.current = newSettings;
  }, []);

  // Build query string from pills
  const buildQueryFromPills = useCallback(pillsList => {
    const filterPills = pillsList.filter(p => (p.type || 'filter') === 'filter');
    const textPills = pillsList.filter(p => p.type === 'text');

    const filterString = filterPills.map(f => `@${f.key}${f.operator}${f.value}`).join(' ');
    const textString = textPills.map(f => f.value).join(' ');

    return [filterString, textString].filter(Boolean).join(' ');
  }, []);

  // Execute search with current pills
  const executeSearch = useCallback(
    async (additionalText = '') => {
      const query = buildQueryFromPills(pillsRef.current);
      const fullQuery = [query, additionalText].filter(Boolean).join(' ');

      if (!fullQuery.trim()) return;

      setIsLoading(true);
      setError(null);

      try {
        // Build messages array for API (include conversation for context)
        const apiMessages = [
          ...conversationRef.current.map(msg => ({
            role: msg.role,
            content: msg.content,
          })),
          { role: 'user', content: fullQuery },
        ];

        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: apiMessages,
            pills: pillsRef.current,
            options: settingsRef.current,
          }),
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();

        // Handle different response types
        if (data.type === 'pill_extraction' && data.pills) {
          // Claude extracted pills from natural language - update pills and results
          const newPills = data.pills.map(p => ({
            ...p,
            id: generateId(p.type || 'pill'),
          }));
          pillsRef.current = newPills;
          setPills(newPills);

          // Update results
          setCurrentResults({
            tracks: data.tracks,
            totalCount: data.total_count,
            showing: data.showing,
            message: data.message,
            _meta: data._meta,
            timings: data.timings,
            performance: data.performance,
            architecture: data.architecture,
          });

          // Also add Claude's message to conversation for context
          if (data.message) {
            const assistantMsg = {
              id: generateId('assistant'),
              role: 'assistant',
              content: data.message,
            };
            conversationRef.current = [...conversationRef.current, assistantMsg];
            setConversation(conversationRef.current);
          }
        } else if (data.type === 'pill_update' || data.type === 'track_results') {
          // Update results in place
          setCurrentResults({
            tracks: data.tracks,
            totalCount: data.total_count,
            showing: data.showing,
            message: data.message,
            _meta: data._meta,
            timings: data.timings,
            performance: data.performance,
            architecture: data.architecture,
          });
        } else if (data.reply) {
          // Conversational response - add to conversation
          const assistantMsg = {
            id: generateId('assistant'),
            role: 'assistant',
            content: data.reply,
            timings: data.timings,
            performance: data.performance,
            architecture: data.architecture,
          };
          conversationRef.current = [...conversationRef.current, assistantMsg];
          setConversation(conversationRef.current);
        }
      } catch (err) {
        console.error('Search error:', err);
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    },
    [buildQueryFromPills]
  );

  // Add a pill and re-search
  const addPill = useCallback(
    pill => {
      const newPill = {
        ...pill,
        id: pill.id || generateId(pill.type || 'pill'),
      };
      pillsRef.current = [...pillsRef.current, newPill];
      setPills(pillsRef.current);
      executeSearch();
    },
    [executeSearch]
  );

  // Add multiple pills and re-search
  const addPills = useCallback(
    newPills => {
      const pillsWithIds = newPills.map(p => ({
        ...p,
        id: p.id || generateId(p.type || 'pill'),
      }));
      pillsRef.current = [...pillsRef.current, ...pillsWithIds];
      setPills(pillsRef.current);
      executeSearch();
    },
    [executeSearch]
  );

  // Remove a pill and re-search
  const removePill = useCallback(
    pillId => {
      pillsRef.current = pillsRef.current.filter(p => p.id !== pillId);
      setPills(pillsRef.current);
      if (pillsRef.current.length > 0) {
        executeSearch();
      } else {
        setCurrentResults(null);
      }
    },
    [executeSearch]
  );

  // Clear all pills
  const clearPills = useCallback(() => {
    pillsRef.current = [];
    setPills([]);
    setCurrentResults(null);
  }, []);

  // Set pills directly (for external updates like from MessageInput)
  const setPillsExternal = useCallback(newPills => {
    pillsRef.current = newPills;
    setPills(newPills);
  }, []);

  // Send a conversational message (adds to conversation)
  const sendConversationalMessage = useCallback(
    async content => {
      const userMsg = {
        id: generateId('user'),
        role: 'user',
        content,
      };
      conversationRef.current = [...conversationRef.current, userMsg];
      setConversation(conversationRef.current);

      await executeSearch(content);
    },
    [executeSearch]
  );

  // Clear everything
  const clearAll = useCallback(() => {
    pillsRef.current = [];
    conversationRef.current = [];
    setPills([]);
    setConversation([]);
    setCurrentResults(null);
    setError(null);
  }, []);

  return {
    // Search state
    pills,
    currentResults,
    conversation,

    // Loading/error state
    isLoading,
    error,

    // Pill management
    addPill,
    addPills,
    removePill,
    clearPills,
    setPills: setPillsExternal,

    // Search execution
    executeSearch,
    sendConversationalMessage,

    // Utilities
    clearAll,
    updateSettings,
    buildQueryFromPills,
  };
}
