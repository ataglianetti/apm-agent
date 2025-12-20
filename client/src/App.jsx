import { Header } from './components/Header';
import { ChatContainer } from './components/ChatContainer';
import { MessageInput } from './components/MessageInput';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useChat } from './hooks/useChat';
import { ThemeProvider, useTheme } from './context/ThemeContext';

function AppContent() {
  const { messages, isLoading, sendMessage, clearChat, updateSettings } = useChat();
  const { isDark } = useTheme();

  // Handle settings change from demo controls
  const handleSettingsChange = (settings) => {
    updateSettings(settings);
  };

  // Handle "Sounds Like" audio similarity search
  const handleSoundsLike = (track) => {
    const query = `Find tracks that sound like "${track.track_title}" (${track.id})`;
    sendMessage(query);
  };

  return (
    <div className={`h-screen flex flex-col font-poppins ${isDark ? 'bg-apm-dark' : 'bg-gray-100'}`}>
      <Header onClear={clearChat} onSettingsChange={handleSettingsChange} />
      <ErrorBoundary>
        <ChatContainer
          messages={messages}
          isLoading={isLoading}
          onSoundsLike={handleSoundsLike}
          onSendMessage={sendMessage}
        />
      </ErrorBoundary>
      <MessageInput onSend={sendMessage} disabled={isLoading} />
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

export default App;