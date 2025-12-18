/**
 * APM Agent Client - Type Definitions
 * Types for React components and hooks
 */

// ============================================
// Track Types (mirrored from server)
// ============================================

export interface Track {
  id: string;
  track_title: string;
  track_description?: string;
  bpm?: number;
  duration?: number | string;
  apm_release_date?: string;
  album_title?: string;
  album_code?: string;
  library_name?: string;
  composer?: string;
  genre?: string;
  genre_name?: string;
  additional_genres?: string;
  moods?: string[];
  energy_level?: string;
  use_cases?: string[];
  instruments?: string[];
  music_for?: string[];
  facet_labels?: string[];
  _relevance_score?: number;
  _score_breakdown?: ScoreBreakdown;
}

export interface ScoreBreakdown {
  track_title?: number;
  combined_genre?: number;
  composer?: number;
  album_title?: number;
  track_description?: number;
  taxonomy_match?: number;
  text_score?: number;
  combined?: boolean;
}

// ============================================
// Message Types
// ============================================

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content?: string;
  type?: 'track_results';
  message?: string;
  tracks?: Track[];
  totalCount?: number;
  showing?: string;
  isError?: boolean;
  disambiguationOptions?: DisambiguationOption[];
  timings?: Record<string, number>;
  performance?: PerformanceInfo;
  architecture?: ArchitectureInfo;
}

export interface DisambiguationOption {
  name: string;
  id: string;
}

export interface PerformanceInfo {
  totalTime?: number;
  searchTime?: number;
  enrichmentTime?: number;
}

export interface ArchitectureInfo {
  route?: number;
  engine?: string;
  rulesApplied?: number;
}

// ============================================
// Chat Hook Types
// ============================================

export interface ChatState {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
}

export interface ChatSettings {
  llmProvider: string;
  demoMode: boolean;
  showTimings: boolean;
  showArchitecture: boolean;
}

export interface UseChatReturn {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  sendMessage: (content: string) => Promise<void>;
  clearChat: () => void;
  updateSettings: (settings: ChatSettings) => void;
}

// ============================================
// Component Props Types
// ============================================

export interface TrackCardProps {
  track: Track;
  index: number;
  onSoundsLike?: (track: Track) => void;
  searchQuery?: string;
}

export interface ChatContainerProps {
  messages: Message[];
  isLoading: boolean;
  onSoundsLike: (track: Track) => void;
  onSendMessage: (content: string) => void;
}

export interface MessageBubbleProps {
  message: Message;
  onSoundsLike?: (track: Track) => void;
  onShowMore?: () => void;
  searchQuery?: string;
}

export interface MessageInputProps {
  onSend: (content: string) => void;
  disabled?: boolean;
}

export interface HeaderProps {
  onClear: () => void;
}

export interface TrackResultsListProps {
  data: Message;
  onSoundsLike?: (track: Track) => void;
  onShowMore?: () => void;
  searchQuery?: string;
}

export interface TrackMetadataModalProps {
  track: Track;
  isOpen: boolean;
  onClose: () => void;
  searchQuery?: string;
}

export interface DemoControlsProps {
  onSettingsChange: (settings: ChatSettings) => void;
}

export interface ErrorBoundaryProps {
  children: React.ReactNode;
}

export interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

// ============================================
// Theme Context Types
// ============================================

export interface ThemeContextType {
  isDark: boolean;
  toggleTheme: () => void;
}

// ============================================
// Filter Types
// ============================================

export interface ActiveFilter {
  category: string;
  value: string;
  displayValue: string;
}

export interface FilterSuggestion {
  category: string;
  value: string;
  displayValue: string;
  matchScore?: number;
}

// ============================================
// API Response Types
// ============================================

export interface ApiTrackResultsResponse {
  type: 'track_results';
  message: string;
  tracks: Track[];
  total_count: number;
  showing: string;
  timings?: Record<string, number>;
  performance?: PerformanceInfo;
  architecture?: ArchitectureInfo;
  _meta?: {
    appliedRules?: AppliedRule[];
    scoreAdjustments?: ScoreAdjustment[];
  };
}

export interface ApiTextResponse {
  reply: string;
  disambiguationOptions?: DisambiguationOption[];
  timings?: Record<string, number>;
  performance?: PerformanceInfo;
  architecture?: ArchitectureInfo;
}

export interface AppliedRule {
  ruleId: string;
  type: string;
  description: string;
}

export interface ScoreAdjustment {
  trackId: string;
  adjustment: number;
  reason: string;
}

// ============================================
// Utility Types
// ============================================

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type PropsWithClassName<P = unknown> = P & { className?: string };
