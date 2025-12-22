// Genre ID to Name mapping utility
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { parse } from 'csv-parse/sync';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Create genre mapping from CSV
let genreMap = null;

function loadGenreMap() {
  if (genreMap) return genreMap;

  try {
    const csvPath = path.join(__dirname, '..', '..', 'data', 'genre_taxonomy.csv');
    const fileContent = fs.readFileSync(csvPath, 'utf-8');
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true
    });

    genreMap = {};
    records.forEach(record => {
      genreMap[record.genre_id] = record.genre_name;
    });

    console.log(`Loaded ${Object.keys(genreMap).length} genre mappings`);
    return genreMap;
  } catch (error) {
    console.error('Error loading genre map:', error);
    return {};
  }
}

// Map genre IDs to names for a track
export function enrichTrackWithGenreNames(track) {
  const mapping = loadGenreMap();

  // Map primary genre (try master_genre_id first, then fall back to genre)
  const genreId = track.master_genre_id || track.genre;
  if (genreId && mapping[genreId]) {
    track.genre_name = mapping[genreId];
  } else {
    track.genre_name = null; // No mapping available
  }

  // Map additional genres (try additional_genre_ids first, then fall back to additional_genres)
  const additionalGenreIds = track.additional_genre_ids || track.additional_genres;
  if (additionalGenreIds) {
    const additionalIds = (typeof additionalGenreIds === 'string'
      ? additionalGenreIds.split(/[;,]/)
      : String(additionalGenreIds).split(/[;,]/)
    ).filter(id => id && id.trim());

    const additionalNames = additionalIds.map(id => mapping[id.trim()] || null).filter(Boolean);
    track.additional_genres_names = additionalNames.join(', ');
  }

  return track;
}

// Map genre IDs to names for multiple tracks
export function enrichTracksWithGenreNames(tracks) {
  return tracks.map(track => enrichTrackWithGenreNames(track));
}

export default { enrichTrackWithGenreNames, enrichTracksWithGenreNames };