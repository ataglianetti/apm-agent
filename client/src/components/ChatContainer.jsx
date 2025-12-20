import { useEffect, useRef } from 'react';
import { MessageBubble } from './MessageBubble';
import { LoadingIndicator } from './LoadingIndicator';
import { WelcomeMessage } from './WelcomeMessage';

export function ChatContainer({ messages, isLoading, onSoundsLike, onSendMessage }) {
  const messagesEndRef = useRef(null);
  const lastMessageRef = useRef(null);
  const prevMessagesLengthRef = useRef(messages.length);

  // Scroll to the start of new content (not the bottom)
  // This keeps focus on the first result for track searches
  useEffect(() => {
    const messagesAdded = messages.length > prevMessagesLengthRef.current;
    prevMessagesLengthRef.current = messages.length;

    if (messagesAdded && lastMessageRef.current) {
      // Scroll to bring the new message into view at the top
      lastMessageRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (isLoading && messagesEndRef.current) {
      // When loading, scroll to show the loading indicator
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
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

        const isLastMessage = index === messages.length - 1;

        return (
          <div
            key={msg.id || `fallback-${index}`}
            ref={isLastMessage ? lastMessageRef : null}
          >
            <MessageBubble
              message={msg}
              onSoundsLike={onSoundsLike}
              onShowMore={handleShowMore}
              searchQuery={searchQuery}
            />
          </div>
        );
      })}
      {isLoading && <LoadingIndicator />}
      <div ref={messagesEndRef} />
    </div>
  );
}
