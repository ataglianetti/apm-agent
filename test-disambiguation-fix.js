#!/usr/bin/env node

// Test script to verify the disambiguation fix
// Uses native fetch (available in Node 18+)

const API_URL = 'http://localhost:3001/api/chat';

async function sendMessage(messages) {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ messages })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`HTTP ${response.status}:`, error);
      return null;
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Request failed:', error.message);
    return null;
  }
}

async function testRockDisambiguation() {
  console.log('\n=== Testing Rock Disambiguation Flow ===\n');

  // Step 1: Send "rock" to trigger disambiguation
  console.log('1. Sending "rock" to trigger disambiguation...');
  const startTime1 = Date.now();

  const response1 = await sendMessage([
    { role: 'user', content: 'rock' }
  ]);

  const time1 = Date.now() - startTime1;

  if (response1?.reply) {
    console.log(`   ✓ Got disambiguation response in ${time1}ms`);
    console.log(`   Response preview: ${response1.reply.substring(0, 100)}...`);
  } else {
    console.error('   ✗ Failed to get disambiguation response');
    return;
  }

  // Step 2: Respond with "garage" to select Garage Rock
  console.log('\n2. Responding with "garage" to select Garage Rock...');
  const startTime2 = Date.now();

  const response2 = await sendMessage([
    { role: 'user', content: 'rock' },
    { role: 'assistant', content: response1.reply },
    { role: 'user', content: 'garage' }
  ]);

  const time2 = Date.now() - startTime2;

  if (response2?.type === 'track_results') {
    console.log(`   ✓ Got track results in ${time2}ms (was 40-60s before fix)`);
    console.log(`   Message: ${response2.message}`);
    console.log(`   Tracks returned: ${response2.tracks?.length}`);
    console.log(`   Showing: ${response2.showing}`);

    if (response2.tracks?.length > 0) {
      console.log(`   First track: ${response2.tracks[0].track_title} (${response2.tracks[0].id})`);
    }

    // Check performance improvement
    if (time2 < 5000) {
      console.log(`\n   🎉 SUCCESS: Response time improved from 40-60s to ${time2}ms!`);
    } else if (time2 < 10000) {
      console.log(`\n   ⚠️  WARNING: Response time is ${time2}ms (better than before but still slow)`);
    } else {
      console.log(`\n   ⚠️  WARNING: Response time is still slow at ${time2}ms`);
    }
  } else if (response2?.reply) {
    console.log(`   ⚠️  Got text response instead of tracks in ${time2}ms`);
    console.log(`   This means the fix might not be working - falling back to Claude`);
    console.log(`   Response: ${response2.reply.substring(0, 200)}...`);
  } else {
    console.error('   ✗ Failed to get response');
  }
}

async function testOtherGenres() {
  console.log('\n\n=== Testing Other Genre Disambiguations ===\n');

  const testCases = [
    { genre: 'jazz', selection: 'smooth' },
    { genre: 'classical', selection: 'neo' },
    { genre: 'electronic', selection: 'house' }
  ];

  for (const test of testCases) {
    console.log(`\nTesting ${test.genre} → ${test.selection}:`);

    // Get disambiguation
    const response1 = await sendMessage([
      { role: 'user', content: test.genre }
    ]);

    if (!response1?.reply) {
      console.log(`  ✗ Failed to get disambiguation for ${test.genre}`);
      continue;
    }

    // Select subgenre
    const startTime = Date.now();
    const response2 = await sendMessage([
      { role: 'user', content: test.genre },
      { role: 'assistant', content: response1.reply },
      { role: 'user', content: test.selection }
    ]);
    const elapsed = Date.now() - startTime;

    if (response2?.type === 'track_results') {
      console.log(`  ✓ Got ${response2.tracks?.length} tracks in ${elapsed}ms`);
    } else {
      console.log(`  ⚠️  Got text response in ${elapsed}ms (might be falling back to Claude)`);
    }
  }
}

// Check if server is running
console.log('Checking if server is running on port 3001...');
fetch('http://localhost:3001')
  .then(() => {
    console.log('✓ Server is running\n');
    // Run tests
    testRockDisambiguation()
      .then(() => testOtherGenres())
      .then(() => {
        console.log('\n=== Test Complete ===\n');
        process.exit(0);
      });
  })
  .catch(() => {
    console.error('✗ Server is not running on port 3001');
    console.error('Please start the server with: cd server && npm run dev');
    process.exit(1);
  });