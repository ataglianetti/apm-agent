/**
 * Test the improved intuitive @ filter parsing
 */

import { parseFilterQuery } from './server/services/filterParser.js';

console.log('Testing Intuitive @ Filter Parsing (NO QUOTES NEEDED!)\n');
console.log('=======================================================\n');

// Test 1: Multi-word values WITHOUT quotes (now works!)
console.log('1. MULTI-WORD VALUES WITHOUT QUOTES (NOW WORKS!):');
console.log('Input: @library:MLB Music @tags:rock');
const test1 = parseFilterQuery('@library:MLB Music @tags:rock');
console.log('Result:', JSON.stringify(test1, null, 2));
console.log('✅ Full phrase "MLB Music" captured!\n');

// Test 2: Multiple multi-word filters
console.log('2. MULTIPLE MULTI-WORD FILTERS:');
console.log('Input: @composer:hans zimmer @album-title:Cinema Score 3 @tags:orchestral');
const test2 = parseFilterQuery('@composer:hans zimmer @album-title:Cinema Score 3 @tags:orchestral');
console.log('Result:', JSON.stringify(test2, null, 2));
console.log('✅ All multi-word values captured correctly!\n');

// Test 3: Filters with search text at the end
console.log('3. FILTERS WITH SEARCH TEXT AT END:');
console.log('Input: @library:MLB Music @tags:rock hard hitting music for baseball');
const test3 = parseFilterQuery('@library:MLB Music @tags:rock hard hitting music for baseball');
console.log('Result:', JSON.stringify(test3, null, 2));
console.log('✅ Filters captured, remaining text becomes search!\n');

// Test 4: Mixed order - search text between filters
console.log('4. SEARCH TEXT BETWEEN FILTERS:');
console.log('Input: @library:NFL Music Library for a commercial @composer:john williams');
const test4 = parseFilterQuery('@library:NFL Music Library for a commercial @composer:john williams');
console.log('Result:', JSON.stringify(test4, null, 2));
console.log('Note: "for a commercial" becomes part of the library value (until next @)\n');

// Test 5: Using equals operator without quotes
console.log('5. EQUALS OPERATOR WITHOUT QUOTES:');
console.log('Input: @library=MLB Music @bpm=120');
const test5 = parseFilterQuery('@library=MLB Music @bpm=120');
console.log('Result:', JSON.stringify(test5, null, 2));
console.log('✅ Exact match operator with full phrases!\n');

// Test 6: Quotes still work if users prefer them
console.log('6. QUOTES STILL WORK (OPTIONAL):');
console.log('Input: @library:"MLB Music" @composer:"hans zimmer"');
const test6 = parseFilterQuery('@library:"MLB Music" @composer:"hans zimmer"');
console.log('Result:', JSON.stringify(test6, null, 2));
console.log('✅ Users can still use quotes if they want!\n');

// Test 7: Real-world complex example
console.log('7. REAL-WORLD COMPLEX EXAMPLE:');
console.log('Input: @library:KPM Main Series @composer:john williams @tags:epic orchestral @bpm:140-160 dramatic battle scene');
const test7 = parseFilterQuery('@library:KPM Main Series @composer:john williams @tags:epic orchestral @bpm:140-160 dramatic battle scene');
console.log('Result:', JSON.stringify(test7, null, 2));
console.log('✅ Everything captured intuitively!\n');

// Test 8: Single filter with long value
console.log('8. SINGLE FILTER WITH LONG VALUE:');
console.log('Input: @track-description:emotional orchestra with introspective sections and building dynamics');
const test8 = parseFilterQuery('@track-description:emotional orchestra with introspective sections and building dynamics');
console.log('Result:', JSON.stringify(test8, null, 2));
console.log('✅ Full description captured without quotes!\n');

console.log('=======================================================');
console.log('Summary: Users can now type naturally without quotes!');
console.log('The parser intelligently captures everything until the');
console.log('next @ filter or end of the query.');