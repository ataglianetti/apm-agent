#!/usr/bin/env node

/**
 * Test script to verify enhanced metadata
 */

import { executeFileTool } from './services/fileToolsDb.js';

async function testMetadata() {
  console.log('Testing Enhanced Metadata System\n');
  console.log('='.repeat(50));

  try {
    // Test 1: Get a track and check if it has enhanced metadata
    console.log('\n1. Testing single track metadata:');
    const track = await executeFileTool('get_track_by_id', {
      track_id: '2FM_2FM_0002_00301',
    });

    if (track) {
      console.log('Track title:', track.track_title);
      console.log('Genre ID:', track.genre);
      console.log('Genre Name:', track.genre_name);
      console.log('Mood:', track.mood);
      console.log('Energy:', track.energy);
      console.log('Use Cases:', track.use_case);
      console.log('Instruments:', track.instrumentation);
      console.log('Era:', track.era);
      console.log('Keywords:', track.keywords?.slice(0, 5).join(', '));
    }

    // Test 2: Search by mood
    console.log('\n2. Testing mood search:');
    const moodResults = await executeFileTool('grep_tracks', {
      pattern: 'uplifting',
      field: 'mood',
      limit: 3,
    });
    console.log(`Found ${moodResults.length} tracks with uplifting mood`);
    moodResults.forEach(t => {
      console.log(`- ${t.track_title}: ${t.mood}`);
    });

    // Test 3: Search by energy level
    console.log('\n3. Testing energy search:');
    const energyResults = await executeFileTool('grep_tracks', {
      pattern: 'high',
      field: 'energy_level',
      limit: 3,
    });
    console.log(`Found ${energyResults.length} tracks with high energy`);
    energyResults.forEach(t => {
      console.log(`- ${t.track_title}: ${t.energy}`);
    });

    // Test 4: Regular genre search with name mapping
    console.log('\n4. Testing genre name mapping:');
    const genreResults = await executeFileTool('grep_tracks', {
      pattern: '1322',
      field: 'genre',
      limit: 3,
    });
    console.log(`Found ${genreResults.length} tracks in genre 1322`);
    genreResults.forEach(t => {
      console.log(`- ${t.track_title}: ${t.genre} → ${t.genre_name}`);
    });

    console.log('\n' + '='.repeat(50));
    console.log('✅ All tests completed successfully!');
  } catch (error) {
    console.error('❌ Test failed:', error);
  }

  process.exit(0);
}

testMetadata();
