#!/usr/bin/env node

// Performance test for the disambiguation fix

const API_URL = 'http://localhost:3001/api/chat';

async function sendMessage(messages) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages })
  });
  return response.json();
}

async function testDisambiguationPerformance() {
  console.log('=== Testing Disambiguation Performance ===\n');

  // Step 1: Get disambiguation for "rock"
  console.log('1. Sending "rock" query...');
  const response1 = await sendMessage([
    { role: 'user', content: 'rock' }
  ]);

  if (!response1?.reply) {
    console.error('Failed to get disambiguation');
    return;
  }

  console.log('   ✓ Got disambiguation options\n');

  // Step 2: Test selecting "garage"
  console.log('2. Selecting "garage" from disambiguation...');
  const startTime = performance.now();

  const response2 = await sendMessage([
    { role: 'user', content: 'rock' },
    { role: 'assistant', content: response1.reply },
    { role: 'user', content: 'garage' }
  ]);

  const endTime = performance.now();
  const elapsed = Math.round(endTime - startTime);

  if (response2?.type === 'track_results') {
    console.log(`   ✓ Got ${response2.tracks?.length} tracks in ${elapsed}ms`);
    console.log(`   Message: "${response2.message}"`);

    if (elapsed < 500) {
      console.log('\n🎉 EXCELLENT PERFORMANCE!');
      console.log(`   Previous: 40,000-60,000ms`);
      console.log(`   Now: ${elapsed}ms`);
      console.log(`   Improvement: ${Math.round(50000/elapsed)}x faster!`);
    } else if (elapsed < 2000) {
      console.log('\n✅ GOOD PERFORMANCE');
      console.log(`   Response time: ${elapsed}ms (was 40-60 seconds)`);
    } else {
      console.log('\n⚠️ SLOWER THAN EXPECTED');
      console.log(`   Response time: ${elapsed}ms`);
    }
  } else {
    console.log(`   ❌ Got text response instead of tracks (falling back to Claude?)`);
    console.log(`   Response time: ${elapsed}ms`);
  }

  // Test more disambiguation selections
  console.log('\n3. Testing other selections...\n');

  const tests = [
    { selection: 'alternative', expected: 'Alternative Rock' },
    { selection: 'hard', expected: 'Hard Rock' },
    { selection: '3', expected: 'Classic Rock' },
    { selection: 'surf', expected: 'Surf Rock' }
  ];

  for (const test of tests) {
    const start = performance.now();
    const response = await sendMessage([
      { role: 'user', content: 'rock' },
      { role: 'assistant', content: response1.reply },
      { role: 'user', content: test.selection }
    ]);
    const time = Math.round(performance.now() - start);

    if (response?.type === 'track_results') {
      console.log(`   "${test.selection}" → ${test.expected}: ✓ ${time}ms (${response.tracks?.length} tracks)`);
    } else {
      console.log(`   "${test.selection}" → ${test.expected}: ❌ Failed (${time}ms)`);
    }
  }
}

// Run the test
console.log('Checking server...');
fetch('http://localhost:3001')
  .then(() => {
    console.log('✓ Server is running\n');
    return testDisambiguationPerformance();
  })
  .then(() => {
    console.log('\n=== Test Complete ===\n');
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });