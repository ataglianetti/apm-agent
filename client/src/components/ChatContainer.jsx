import { useEffect, useRef } from 'react';
import { MessageBubble } from './MessageBubble';
import { LoadingIndicator } from './LoadingIndicator';
import { WelcomeMessage } from './WelcomeMessage';

export function ChatContainer({ messages, isLoading, onSoundsLike, onSendMessage }) {
  const messagesEndRef = useRef(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Handle "Show More" button click for pagination
  const handleShowMore = () => {
    if (onSendMessage) {
      onSendMessage("show more");
    }
  };

  if (messages.length === 0 && !isLoading) {
    return (
      <div className="flex-1 overflow-hidden">
        <WelcomeMessage />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto chat-scroll p-4 space-y-4">
      {messages.map((msg, index) => {
        // For assistant messages with track results, find the preceding user message as searchQuery
        let searchQuery = '';
        if (msg.role === 'assistant' && index > 0) {
          // Look backwards for the most recent user message
          for (let i = index - 1; i >= 0; i--) {
            if (messages[i].role === 'user') {
              searchQuery = messages[i].content;
              break;
            }
          }
        }

        return (
          <MessageBubble
            key={msg.id || `fallback-${index}`}
            message={msg}
            onSoundsLike={onSoundsLike}
            onShowMore={handleShowMore}
            searchQuery={searchQuery}
          />
        );
      })}
      {isLoading && <LoadingIndicator />}
      <div ref={messagesEndRef} />
    </div>
  );
}
