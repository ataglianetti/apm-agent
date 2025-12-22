import { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { useTheme } from '../context/ThemeContext';
import { TrackMetadataModal } from './TrackMetadataModal';

function TrackCardComponent({
  track,
  index,
  onSoundsLike,
  searchQuery = '',
  onShowVersions, // Callback to show/hide versions
  hasVersions = false, // Whether track has multiple versions
  isVersion = false, // Whether this is a version card (for styling)
  searchMeta = null, // Business rules metadata from search response
}) {
  const { isDark } = useTheme();
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showMetadataModal, setShowMetadataModal] = useState(false);

  // Parse duration - can be string (e.g., "2:15") or number (seconds)
  const durationSeconds = useMemo(() => {
    if (!track.duration) return 60;

    // If duration is already a number (from database), use it directly
    if (typeof track.duration === 'number') {
      return track.duration > 0 ? track.duration : 60;
    }

    // If duration is a string, parse it
    if (typeof track.duration === 'string') {
      const parts = track.duration.split(':');
      if (parts.length === 2) {
        const minutes = parseInt(parts[0], 10);
        const seconds = parseInt(parts[1], 10);
        // Validate that both parts are valid numbers
        if (!isNaN(minutes) && !isNaN(seconds) && minutes >= 0 && seconds >= 0 && seconds < 60) {
          return minutes * 60 + seconds;
        }
      }
      // Try parsing as a single number (seconds)
      const totalSeconds = parseInt(track.duration, 10);
      if (!isNaN(totalSeconds) && totalSeconds > 0) {
        return totalSeconds;
      }
    }

    return 60; // Default fallback
  }, [track.duration]);

  // Format duration for display (convert seconds to M:SS)
  const formattedDuration = useMemo(() => {
    const minutes = Math.floor(durationSeconds / 60);
    const seconds = durationSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, [durationSeconds]);

  // Generate deterministic waveform heights based on track ID (stable across re-renders)
  const barHeights = useMemo(() => {
    // Create seeded pseudo-random based on track ID
    const seed = (track.id || 'default')
      .split('')
      .reduce((acc, char, i) => acc + char.charCodeAt(0) * (i + 1), 0);
    const seededRandom = i => {
      const x = Math.sin(seed + i * 9999) * 10000;
      return x - Math.floor(x);
    };
    return Array.from({ length: 200 }).map((_, i) => 20 + seededRandom(i) * 60);
  }, [track.id]);

  // Simulate playback progress
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          setIsPlaying(false);
          return 0;
        }
        return prev + 100 / durationSeconds / 10;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [isPlaying, durationSeconds]);

  const togglePlay = useCallback(() => {
    setIsPlaying(prev => !prev);
  }, []);

  const handleSoundsLike = useCallback(() => {
    if (onSoundsLike) onSoundsLike(track);
  }, [onSoundsLike, track]);

  const openMetadataModal = useCallback(() => {
    setShowMetadataModal(true);
  }, []);

  const closeMetadataModal = useCallback(() => {
    setShowMetadataModal(false);
  }, []);

  // Parse additional genres from comma-separated string
  const additionalGenres = track.additional_genres
    ? track.additional_genres
        .split(',')
        .map(g => g.trim())
        .filter(Boolean)
    : [];

  // Helper to capitalize first letter
  const capitalize = str => (str ? str.charAt(0).toUpperCase() + str.slice(1) : '');

  // Build enhanced metadata tags from real APM taxonomy data (Solr fields only)
  // Each tag includes its category for the hover tooltip
  const enhancedTags = [];

  // Add moods (from Solr mood field - real taxonomy data)
  if (track.mood && Array.isArray(track.mood)) {
    track.mood.forEach(m => enhancedTags.push({ label: capitalize(m), category: 'Mood' }));
  }

  // Add instruments (from Solr instruments field - real taxonomy data)
  if (track.instruments && Array.isArray(track.instruments)) {
    track.instruments.forEach(i =>
      enhancedTags.push({ label: capitalize(i), category: 'Instruments' })
    );
  }

  // Add music_for / use cases (from Solr music_for field - real taxonomy data)
  if (track.music_for && Array.isArray(track.music_for)) {
    track.music_for.forEach(m =>
      enhancedTags.push({ label: capitalize(m), category: 'Music For' })
    );
  }

  // Add additional genres with category context
  const genreTags = additionalGenres.map(g => ({ label: capitalize(g), category: 'Genre' }));

  // Combine all tags
  const allTags = [...enhancedTags, ...genreTags];

  // Limit visible tags
  const maxVisibleTags = 10;
  const visibleTags = allTags.slice(0, maxVisibleTags);
  const hasMoreTags = allTags.length > maxVisibleTags;

  return (
    <div
      className={`rounded-lg p-4 transition-colors ${
        isVersion
          ? isDark
            ? 'bg-apm-navy/70 border-l-4 border-apm-purple ml-8'
            : 'bg-gray-50 border-l-4 border-apm-purple ml-8 shadow-sm'
          : isDark
            ? 'bg-apm-navy hover:bg-apm-navy/80'
            : 'bg-white border border-gray-200 shadow-sm hover:shadow-md'
      }`}
    >
      {/* Header Row: Track number, play button, title, action icons */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-3">
          {/* Track Number */}
          <span className={`text-sm w-6 ${isDark ? 'text-apm-gray-light' : 'text-gray-400'}`}>
            {index + 1}
          </span>

          {/* Play/Pause Button */}
          <button
            onClick={togglePlay}
            aria-label={isPlaying ? `Pause ${track.track_title}` : `Play ${track.track_title}`}
            className="w-10 h-10 bg-apm-purple rounded-full flex items-center justify-center hover:bg-apm-purple-light transition-colors flex-shrink-0"
          >
            {isPlaying ? (
              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          {/* Title, ID, and Library */}
          <div>
            <h3
              className={`font-semibold text-base leading-tight ${isDark ? 'text-apm-light' : 'text-gray-900'}`}
            >
              {track.track_title}
            </h3>
            <p className={`text-xs mt-0.5 ${isDark ? 'text-apm-gray-light' : 'text-gray-500'}`}>
              #{index + 1} {track.id} {track.library_name && `· ${track.library_name}`}
            </p>
          </div>
        </div>

        {/* Action Icons and Sounds Like */}
        <div className="flex items-center gap-2">
          {/* Sounds Like */}
          <button
            onClick={handleSoundsLike}
            aria-label={`Find tracks that sound like ${track.track_title}`}
            className={`px-2 py-1 hover:text-apm-purple hover:underline text-xs transition-colors ${
              isDark ? 'text-apm-gray-light' : 'text-gray-500'
            }`}
          >
            Sounds Like
          </button>
          {/* Versions - only show if track has versions and callback provided */}
          {hasVersions && onShowVersions && (
            <button
              onClick={() => onShowVersions(track)}
              aria-label={`Show versions of ${track.track_title}`}
              className={`px-2 py-1 hover:text-apm-purple hover:underline text-xs transition-colors ${
                isDark ? 'text-apm-gray-light' : 'text-gray-500'
              }`}
            >
              Versions
            </button>
          )}
          {/* Favorite */}
          <button
            aria-label={`Add ${track.track_title} to favorites`}
            className={`p-2 hover:text-apm-purple transition-colors ${isDark ? 'text-apm-gray' : 'text-gray-400'}`}
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
              />
            </svg>
          </button>
          {/* Download */}
          <button
            aria-label={`Download ${track.track_title}`}
            className={`p-2 hover:text-apm-purple transition-colors ${isDark ? 'text-apm-gray' : 'text-gray-400'}`}
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
          </button>
          {/* Add to Project */}
          <button
            aria-label={`Add ${track.track_title} to project`}
            className={`p-2 hover:text-apm-purple transition-colors ${isDark ? 'text-apm-gray' : 'text-gray-400'}`}
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 4v16m8-8H4"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Description + Metadata Grid */}
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 mb-3 ml-[52px]">
        {/* Description (left column, takes remaining space) */}
        <p
          className={`text-sm leading-relaxed pr-4 ${isDark ? 'text-apm-gray-light' : 'text-gray-600'}`}
        >
          {track.track_description}
        </p>

        {/* Metadata columns (right side): Genre, Duration, BPM */}
        <div className={`text-sm whitespace-nowrap ${isDark ? 'text-apm-light' : 'text-gray-800'}`}>
          {track.genre_name || track.genre || '—'}
        </div>
        <div
          className={`text-sm whitespace-nowrap ${isDark ? 'text-apm-gray-light' : 'text-gray-500'}`}
        >
          {formattedDuration}
        </div>
        <div
          className={`text-sm whitespace-nowrap ${isDark ? 'text-apm-gray-light' : 'text-gray-500'}`}
        >
          {track.bpm} BPM
        </div>
      </div>

      {/* Waveform with Playback Progress */}
      <div
        className={`h-10 rounded ml-[52px] mb-3 relative overflow-hidden cursor-pointer ${
          isDark ? 'bg-apm-dark/50' : 'bg-gray-100'
        }`}
        onClick={e => {
          const rect = e.currentTarget.getBoundingClientRect();
          const clickX = e.clientX - rect.left;
          const newProgress = (clickX / rect.width) * 100;
          setProgress(newProgress);
          if (!isPlaying) setIsPlaying(true);
        }}
      >
        {/* Waveform bars - fills entire container */}
        <div className="absolute inset-0 flex items-center">
          {barHeights.map((height, i) => {
            const barProgress = ((i + 1) / barHeights.length) * 100;
            const isPlayed = barProgress <= progress;
            return (
              <div
                key={i}
                className={`flex-1 rounded-sm transition-colors duration-100 ${
                  isPlayed
                    ? isDark
                      ? 'bg-white'
                      : 'bg-apm-purple'
                    : isDark
                      ? 'bg-apm-gray/40'
                      : 'bg-gray-300'
                }`}
                style={{ height: `${height}%`, marginRight: '1px' }}
              />
            );
          })}
        </div>
        {/* Playhead */}
        {(isPlaying || progress > 0) && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-apm-purple"
            style={{ left: `${progress}%` }}
          />
        )}
      </div>

      {/* Enhanced Metadata Tags & View Metadata Button */}
      <div className="flex flex-wrap gap-2 ml-[52px]">
        {/* Display enhanced metadata tags with category tooltips */}
        {visibleTags.map((tag, i) => (
          <span
            key={i}
            title={`${tag.category} > ${tag.label}`}
            className={`px-3 py-1 text-xs rounded-full transition-colors cursor-pointer ${
              isDark
                ? 'bg-apm-dark/60 text-apm-gray-light hover:bg-apm-dark'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {tag.label}
          </span>
        ))}

        {/* See More button if there are more tags */}
        {hasMoreTags && (
          <button
            onClick={openMetadataModal}
            aria-label={`View ${allTags.length - maxVisibleTags} more tags for ${track.track_title}`}
            className="px-3 py-1 bg-apm-purple/20 text-apm-purple text-xs rounded-full hover:bg-apm-purple/30 transition-colors"
          >
            +{allTags.length - maxVisibleTags} more
          </button>
        )}

        {/* View Metadata Button - Always show for transparency */}
        <button
          onClick={openMetadataModal}
          aria-label={`View full metadata for ${track.track_title}`}
          className={`px-3 py-1 text-xs rounded-full transition-colors ${
            isDark
              ? 'bg-apm-purple/20 text-apm-purple hover:bg-apm-purple/30'
              : 'bg-purple-100 text-purple-700 hover:bg-purple-200'
          }`}
        >
          View Metadata
        </button>
      </div>

      {/* Metadata Modal */}
      <TrackMetadataModal
        track={track}
        isOpen={showMetadataModal}
        onClose={closeMetadataModal}
        searchQuery={searchQuery}
        searchMeta={searchMeta}
      />
    </div>
  );
}

// Custom comparison for memo - only re-render if track data or index changes
function arePropsEqual(prevProps, nextProps) {
  return (
    prevProps.track.id === nextProps.track.id &&
    prevProps.index === nextProps.index &&
    prevProps.searchQuery === nextProps.searchQuery &&
    prevProps.hasVersions === nextProps.hasVersions &&
    prevProps.isVersion === nextProps.isVersion &&
    prevProps.searchMeta === nextProps.searchMeta
  );
}

// Memoized export to prevent unnecessary re-renders
export const TrackCard = memo(TrackCardComponent, arePropsEqual);

// Also export unmemoized version for debugging
export { TrackCardComponent };
