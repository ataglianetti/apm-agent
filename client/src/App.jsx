import { useState } from 'react';
import { Header } from './components/Header';
import { SearchResults } from './components/SearchResults';
import { ConversationPanel } from './components/ConversationPanel';
import { MessageInput } from './components/MessageInput';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useSearch } from './hooks/useSearch';
import { ThemeProvider, useTheme } from './context/ThemeContext';

function AppContent() {
  const {
    pills,
    currentResults,
    conversation,
    isLoading,
    addPills,
    removePill,
    clearPills,
    setPills,
    executeSearch,
    sendConversationalMessage,
    clearAll,
    updateSettings,
  } = useSearch();

  const { isDark } = useTheme();
  const [showConversation, setShowConversation] = useState(false);
  const [settings, setSettings] = useState({
    showTimings: false,
    showArchitecture: false,
  });

  // Handle settings change from demo controls
  const handleSettingsChange = newSettings => {
    setSettings(prev => ({ ...prev, ...newSettings }));
    updateSettings(newSettings);
  };

  // Handle "Sounds Like" audio similarity search
  const handleSoundsLike = track => {
    const query = `Find tracks that sound like "${track.track_title}" (${track.id})`;
    sendConversationalMessage(query);
    setShowConversation(true);
  };

  // Handle message submission from MessageInput
  const handleSend = (query, newPills) => {
    if (newPills && newPills.length > 0) {
      // Pills were extracted, add them and search
      addPills(newPills);
    } else if (query) {
      // No pills extracted, treat as conversational
      sendConversationalMessage(query);
      setShowConversation(true);
    }
  };

  // Handle "Show More" pagination
  const handleShowMore = () => {
    sendConversationalMessage('show more');
  };

  return (
    <div
      className={`h-screen flex flex-col font-poppins ${isDark ? 'bg-apm-dark' : 'bg-gray-100'}`}
    >
      <Header onClear={clearAll} onSettingsChange={handleSettingsChange} />
      <ErrorBoundary>
        {/* Main results area - updates in place */}
        <SearchResults
          results={currentResults}
          pills={pills}
          isLoading={isLoading}
          onSoundsLike={handleSoundsLike}
          onShowMore={handleShowMore}
          showTimings={settings.showTimings}
          showArchitecture={settings.showArchitecture}
        />

        {/* Collapsible conversation panel (Route 3 messages only) */}
        {conversation.length > 0 && (
          <ConversationPanel
            messages={conversation}
            isExpanded={showConversation}
            onToggle={() => setShowConversation(!showConversation)}
          />
        )}
      </ErrorBoundary>
      <MessageInput
        onSend={handleSend}
        disabled={isLoading}
        pills={pills}
        onPillsChange={setPills}
        onRemovePill={removePill}
        onClearPills={clearPills}
      />
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
