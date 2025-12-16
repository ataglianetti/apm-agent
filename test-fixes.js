#!/usr/bin/env node

/**
 * Test script to verify all 9 bug fixes
 * Runs test queries against the API and checks responses
 */

const testCases = [
  // Bug 1.3: garage rock - should return JSON with tracks after disambiguation
  {
    name: "1.3 garage rock",
    query: "garage rock",
    expectJson: true,
    expectTracks: 12,
    skipForNow: true // This requires disambiguation context
  },

  // Bug 1.4: classical - pagination test
  {
    name: "1.4 classical",
    query: "classical",
    expectJson: false, // First returns disambiguation
    expectTracks: 0,
    skipForNow: true // Requires multi-step interaction
  },

  // Bug 1.5: upbeat acoustic guitar - should now find tracks (we added it)
  {
    name: "1.5 upbeat acoustic guitar",
    query: "upbeat acoustic guitar",
    expectJson: true,
    expectTracks: 12
  },

  // Bug 2.1: dark tension suspense - should find data (it exists)
  {
    name: "2.1 dark tension suspense",
    query: "dark tension suspense",
    expectJson: true,
    expectTracks: 12
  },

  // Bug 2.2: uplifting inspiring corporate - should find data (it exists)
  {
    name: "2.2 uplifting inspiring corporate",
    query: "uplifting inspiring corporate",
    expectJson: true,
    expectTracks: 12
  },

  // Bug 2.3: music for a car chase scene - should now find tracks (we added it)
  {
    name: "2.3 music for a car chase scene",
    query: "music for a car chase scene",
    expectJson: true,
    expectTracks: 12
  },

  // Bug 2.4: rainy Sunday morning - should now find tracks (we added it)
  {
    name: "2.4 something that feels like a rainy Sunday morning",
    query: "something that feels like a rainy Sunday morning",
    expectJson: true,
    expectTracks: 12
  },

  // Bug 2.5: epic trailer drums - should find data (it exists)
  {
    name: "2.5 epic trailer drums",
    query: "epic trailer drums",
    expectJson: true,
    expectTracks: 12
  },

  // Bug 3.1: YouTube reference - should return JSON track cards
  {
    name: "3.1 YouTube reference",
    query: "Find me something like this: https://youtube.com/watch?v=dQw4w9WgXcQ",
    expectJson: true,
    expectTracks: 12
  }
];

async function runTest(testCase) {
  if (testCase.skipForNow) {
    console.log(`⏭️  Skipping: ${testCase.name} (requires multi-step interaction)`);
    return { skipped: true };
  }

  console.log(`\n📝 Testing: ${testCase.name}`);
  console.log(`   Query: "${testCase.query}"`);

  try {
    const response = await fetch('http://localhost:3001/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'user',
            content: testCase.query
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    const reply = data.reply;

    // Try to parse JSON from the reply
    let jsonData = null;
    let isJson = false;

    try {
      // Check if reply is pure JSON
      jsonData = JSON.parse(reply);
      isJson = true;
    } catch {
      // Try to extract JSON from markdown code blocks
      const jsonMatch = reply.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        try {
          jsonData = JSON.parse(jsonMatch[1]);
          isJson = true;
        } catch {}
      } else {
        // Try to find JSON object in the text
        const objectMatch = reply.match(/\{[\s\S]*"type"\s*:\s*"track_results"[\s\S]*\}/);
        if (objectMatch) {
          try {
            jsonData = JSON.parse(objectMatch[0]);
            isJson = true;
          } catch {}
        }
      }
    }

    // Check results
    const hasJson = isJson && jsonData && jsonData.type === 'track_results';
    const trackCount = hasJson ? (jsonData.tracks ? jsonData.tracks.length : 0) : 0;

    // Report results
    if (testCase.expectJson && !hasJson) {
      console.log(`   ❌ Expected JSON response but got text`);
      console.log(`   Response preview: ${reply.substring(0, 200)}...`);
      return { passed: false, reason: 'No JSON response' };
    }

    if (testCase.expectJson && trackCount !== testCase.expectTracks) {
      console.log(`   ❌ Expected ${testCase.expectTracks} tracks but got ${trackCount}`);
      return { passed: false, reason: `Wrong track count: ${trackCount}` };
    }

    if (hasJson && trackCount > 0) {
      console.log(`   ✅ Success! Got JSON with ${trackCount} tracks`);
      console.log(`   First track: ${jsonData.tracks[0].track_title} (${jsonData.tracks[0].id})`);
    } else if (!testCase.expectJson) {
      console.log(`   ✅ Got expected non-JSON response (disambiguation)`);
    }

    return { passed: true };

  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return { passed: false, reason: error.message };
  }
}

async function runAllTests() {
  console.log('🧪 APM Agent Bug Fix Test Suite');
  console.log('================================\n');

  const results = {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0
  };

  for (const testCase of testCases) {
    const result = await runTest(testCase);
    results.total++;

    if (result.skipped) {
      results.skipped++;
    } else if (result.passed) {
      results.passed++;
    } else {
      results.failed++;
    }

    // Add delay between tests to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n================================');
  console.log('📊 Test Results Summary:');
  console.log(`   Total: ${results.total}`);
  console.log(`   ✅ Passed: ${results.passed}`);
  console.log(`   ❌ Failed: ${results.failed}`);
  console.log(`   ⏭️  Skipped: ${results.skipped}`);

  if (results.failed === 0 && results.skipped === 0) {
    console.log('\n🎉 All tests passed!');
  } else if (results.failed === 0) {
    console.log('\n✨ All active tests passed! (Some tests require manual verification)');
  } else {
    console.log('\n⚠️  Some tests failed. Please review the output above.');
  }
}

// Run tests
runAllTests().catch(console.error);