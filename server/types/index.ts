/**
 * APM Agent - Type Definitions
 * Core types used across the server application
 */

// ============================================
// Track Types
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
  has_stems?: string;
  song_id?: string;
  master_genre_id?: string;

  // Enhanced metadata (extracted from descriptions)
  moods?: string[];
  energy_level?: string;
  use_cases?: string[];
  instruments?: string[];
  era?: string;
  music_for?: string[];
  facet_labels?: string[];

  // Scoring metadata
  _relevance_score?: number;
  _text_score?: number;
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
  fts_rank?: number;
}

// ============================================
// Search Types
// ============================================

export interface SearchOptions {
  facets?: FacetFilter[];
  text?: string;
  filters?: MetadataFilter[];
  limit?: number;
  offset?: number;
  sort?: SortMode;
  groupBy?: string;
}

export interface FacetFilter {
  category: string;
  value: string;
}

export interface MetadataFilter {
  field: string;
  operator: 'exact' | 'contains' | 'greater' | 'less' | 'range';
  value: string | number | { min?: number; max?: number };
}

export type SortMode = 'relevance' | 'featured' | 'explore' | 'rdate' | 'alpha' | 'bpm';

export interface SearchResult {
  tracks: Track[];
  total: number;
  matchExplanations?: MatchExplanation[];
  _meta?: SearchMeta;
}

export interface SearchMeta {
  engine: 'solr' | 'fts5';
  qTime?: number;
  appliedRules?: AppliedRule[];
  scoreAdjustments?: ScoreAdjustment[];
}

export interface MatchExplanation {
  trackId: string;
  matchedFacets: string[];
  matchedTextFields: string[];
  scoreBreakdown: ScoreBreakdown;
  totalScore: number;
}

// ============================================
// Business Rules Types
// ============================================

export type RuleType =
  | 'genre_simplification'
  | 'library_boost'
  | 'recency_interleaving'
  | 'feature_boost'
  | 'filter_optimization';

export interface BusinessRule {
  id: string;
  type: RuleType;
  enabled: boolean;
  priority: number;
  pattern: string;
  description: string;
  action: RuleAction;
}

export interface RuleAction {
  auto_apply_facets?: string[];
  boost_libraries?: LibraryBoost[];
  interleave_pattern?: string;
  boost_factor?: number;
  prefer_feature?: string;
}

export interface LibraryBoost {
  library_name: string;
  boost_factor: number;
}

export interface AppliedRule {
  ruleId: string;
  type: RuleType;
  description: string;
}

export interface ScoreAdjustment {
  trackId: string;
  adjustment: number;
  reason: string;
}

// ============================================
// Facet/Taxonomy Types
// ============================================

export interface Facet {
  facet_id: number;
  category_name: string;
  facet_name: string;
  parent_id?: number;
}

export interface FacetCategory {
  name: string;
  facets: Facet[];
}

export interface GenreTaxonomy {
  genre_id: string;
  genre_name: string;
  parent_genre?: string;
}

// ============================================
// API Types
// ============================================

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  options?: ChatOptions;
}

export interface ChatOptions {
  llmProvider?: string;
  demoMode?: boolean;
  showTimings?: boolean;
  showArchitecture?: boolean;
}

export interface TrackResultsResponse {
  type: 'track_results';
  message: string;
  tracks: Track[];
  total_count: number;
  showing: string;
  _meta?: SearchMeta;
}

export interface TextResponse {
  reply: string;
  disambiguationOptions?: DisambiguationOption[];
}

export interface DisambiguationOption {
  name: string;
  id: string;
}

export interface ErrorResponse {
  error: string;
  details?: string;
  statusCode?: number;
}

export interface HealthResponse {
  status: 'healthy' | 'degraded';
  timestamp: string;
  uptime: number;
  version: string;
  solr: SolrHealth;
  sqlite: SqliteHealth;
  anthropic_api: { configured: boolean };
}

export interface SolrHealth {
  status: 'connected' | 'disconnected' | 'error' | 'unknown';
  url?: string;
  core?: string;
  numDocs?: number;
  message?: string;
}

export interface SqliteHealth {
  status: 'connected' | 'error' | 'unknown';
  track_count?: number;
  facet_count?: number;
  message?: string;
}

// ============================================
// Solr Types
// ============================================

export interface SolrConfig {
  host: string;
  port: number;
  core: string;
  timeout: number;
}

export interface SolrResponse {
  responseHeader: {
    status: number;
    QTime: number;
    params: Record<string, string>;
  };
  response?: {
    numFound: number;
    start: number;
    docs: SolrDocument[];
  };
  grouped?: {
    [field: string]: {
      matches: number;
      ngroups: number;
      groups: SolrGroup[];
    };
  };
}

export interface SolrDocument {
  id: string;
  track_title?: string;
  track_description?: string;
  bpm?: number;
  duration?: number;
  apm_release_date?: string;
  album_title?: string;
  album_code?: string;
  library_name?: string;
  composer?: string;
  genre?: string[];
  mood?: string;
  instruments?: string[];
  music_for?: string[];
  facet_labels?: string[];
  score?: number;
}

export interface SolrGroup {
  groupValue: string;
  doclist: {
    numFound: number;
    start: number;
    docs: SolrDocument[];
  };
}

// ============================================
// Claude/LLM Types
// ============================================

export interface ClaudeToolCall {
  name: string;
  input: Record<string, unknown>;
}

export interface ClaudeToolResult {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
}

// ============================================
// Utility Types
// ============================================

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type Nullable<T> = T | null;

export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
