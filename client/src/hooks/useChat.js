import { useState, useCallback, useRef } from 'react';

export function useChat() {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const settingsRef = useRef({
    llmProvider: 'claude',
    demoMode: false,
    showTimings: false,
    showArchitecture: false
  });

  // Update settings without re-rendering
  const updateSettings = useCallback((newSettings) => {
    settingsRef.current = newSettings;
  }, []);

  const sendMessage = useCallback(async (content) => {
    const userMessage = { role: 'user', content };

    // Add user message immediately and capture the updated messages
    let allMessages;
    setMessages(prev => {
      const updated = [...prev, userMessage];
      // Build messages array for API (all previous messages + new one)
      allMessages = updated.map(msg => ({
        role: msg.role,
        content: msg.content
      }));
      return updated;
    });

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: allMessages,
          options: settingsRef.current
        })
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();

      // Handle different response types
      if (data.type === 'track_results') {
        // Track results with metadata
        setMessages(prev => [...prev, {
          role: 'assistant',
          type: 'track_results',
          message: data.message,
          tracks: data.tracks,
          totalCount: data.total_count,
          showing: data.showing,
          timings: data.timings,
          performance: data.performance,
          architecture: data.architecture
        }]);
      } else if (data.disambiguationOptions) {
        // Disambiguation response with options
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: data.reply,
          disambiguationOptions: data.disambiguationOptions,
          timings: data.timings,
          performance: data.performance,
          architecture: data.architecture
        }]);
      } else {
        // Regular text response
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: data.reply,
          timings: data.timings,
          performance: data.performance,
          architecture: data.architecture
        }]);
      }
    } catch (err) {
      console.error('Chat error:', err);
      setError(err.message);

      // Add error message to chat
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, something went wrong. Please try again.',
        isError: true
      }]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearChat = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    clearChat,
    updateSettings
  };
}