import { useState, useCallback, useRef } from 'react';

// Generate unique message IDs for React keys
let messageIdCounter = 0;
function generateMessageId(role) {
  return `${role}-${Date.now()}-${++messageIdCounter}`;
}

export function useChat() {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Ref to track current messages for synchronous access (fixes race condition)
  const messagesRef = useRef([]);

  const settingsRef = useRef({
    llmProvider: 'claude',
    demoMode: false,
    showTimings: false,
    showArchitecture: false,
  });

  // Update settings without re-rendering
  const updateSettings = useCallback(newSettings => {
    settingsRef.current = newSettings;
  }, []);

  const sendMessage = useCallback(async content => {
    const userMessage = { id: generateMessageId('user'), role: 'user', content };

    // Build API messages synchronously BEFORE state update (fixes race condition)
    // Use messagesRef for synchronous access to current messages
    const apiMessages = [...messagesRef.current, userMessage].map(msg => ({
      role: msg.role,
      content: msg.content,
    }));

    // Update both the ref and state
    messagesRef.current = [...messagesRef.current, userMessage];
    setMessages(messagesRef.current);

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: apiMessages,
          options: settingsRef.current,
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();

      console.log('API Response:', data);

      // Handle different response types
      let assistantMessage;
      if (data.type === 'track_results') {
        // Track results with metadata
        assistantMessage = {
          id: generateMessageId('assistant'),
          role: 'assistant',
          type: 'track_results',
          message: data.message,
          tracks: data.tracks,
          totalCount: data.total_count,
          showing: data.showing,
          _meta: data._meta, // Business rules metadata
          timings: data.timings,
          performance: data.performance,
          architecture: data.architecture,
        };
      } else if (data.disambiguationOptions) {
        // Disambiguation response with options
        assistantMessage = {
          id: generateMessageId('assistant'),
          role: 'assistant',
          content: data.reply,
          disambiguationOptions: data.disambiguationOptions,
          timings: data.timings,
          performance: data.performance,
          architecture: data.architecture,
        };
      } else {
        // Regular text response
        assistantMessage = {
          id: generateMessageId('assistant'),
          role: 'assistant',
          content: data.reply,
          timings: data.timings,
          performance: data.performance,
          architecture: data.architecture,
        };
      }

      // Update both ref and state
      messagesRef.current = [...messagesRef.current, assistantMessage];
      setMessages(messagesRef.current);
    } catch (err) {
      console.error('Chat error:', err);
      setError(err.message);

      // Add error message to chat
      const errorMessage = {
        id: generateMessageId('error'),
        role: 'assistant',
        content: 'Sorry, something went wrong. Please try again.',
        isError: true,
      };
      messagesRef.current = [...messagesRef.current, errorMessage];
      setMessages(messagesRef.current);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearChat = useCallback(() => {
    messagesRef.current = [];
    setMessages([]);
    setError(null);
  }, []);

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    clearChat,
    updateSettings,
  };
}
