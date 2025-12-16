/**
 * Test script for the enhanced @ filter features
 */

import { parseFilterQuery } from './server/services/filterParser.js';
import { executeFileTool } from './server/services/fileTools.js';

console.log('Testing Enhanced @ Filter Features\n');
console.log('=====================================\n');

// Test 1: Single filter with colon operator
console.log('Test 1: Single filter with colon operator');
const test1 = '@library:MLB';
const result1 = parseFilterQuery(test1);
console.log('Input:', test1);
console.log('Parsed:', result1);
console.log('');

// Test 2: Single filter with equals operator
console.log('Test 2: Single filter with equals operator');
const test2 = '@library="MLB Music"';
const result2 = parseFilterQuery(test2);
console.log('Input:', test2);
console.log('Parsed:', result2);
console.log('');

// Test 3: Multiple filters
console.log('Test 3: Multiple filters');
const test3 = '@library="MLB Music" @tags:rock @bpm:120';
const result3 = parseFilterQuery(test3);
console.log('Input:', test3);
console.log('Parsed:', result3);
console.log('');

// Test 4: Filters with search text
console.log('Test 4: Filters with search text');
const test4 = '@library="MLB Music" @tags:rock "hard hitting rock music for a baseball game"';
const result4 = parseFilterQuery(test4);
console.log('Input:', test4);
console.log('Parsed:', result4);
console.log('');

// Test 5: New field types
console.log('Test 5: New field types');
const test5 = '@track-title:sunshine @track-description:upbeat @lyrics-text:love';
const result5 = parseFilterQuery(test5);
console.log('Input:', test5);
console.log('Parsed:', result5);
console.log('');

// Test 6: Complex query with all features
console.log('Test 6: Complex query with all features');
const test6 = '@library="KPM Main Series" @composer:"john williams" @tags:orchestral @bpm=120 "epic cinematic score"';
const result6 = parseFilterQuery(test6);
console.log('Input:', test6);
console.log('Parsed:', result6);
console.log('');

// Test 7: Actually execute a search (if you want to test the full stack)
console.log('Test 7: Execute actual search');
const searchFilters = [
  { field: 'library_name', value: 'NFL', operator: ':' },
  { field: 'genre', value: 'rock', operator: ':' }
];

console.log('Searching with filters:', searchFilters);
try {
  const tracks = executeFileTool('grep_tracks', {
    pattern: { filters: searchFilters },
    limit: 3
  });

  if (Array.isArray(tracks)) {
    console.log(`Found ${tracks.length} tracks:`);
    tracks.forEach(track => {
      console.log(`  - ${track.track_title} by ${track.composer} (${track.library_name})`);
    });
  } else {
    console.log('Search result:', tracks);
  }
} catch (error) {
  console.log('Search error:', error.message);
}

console.log('\n=====================================');
console.log('All tests completed!');