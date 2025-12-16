/**
 * Test to demonstrate quote behavior in @ filters
 */

import { parseFilterQuery } from './server/services/filterParser.js';

console.log('Testing Quote Behavior in @ Filters\n');
console.log('=====================================\n');

// Test unquoted single words
console.log('1. UNQUOTED SINGLE WORDS (works fine):');
console.log('Input: @library:NFL @tags:rock @bpm:120');
const test1 = parseFilterQuery('@library:NFL @tags:rock @bpm:120');
console.log('Result:', JSON.stringify(test1, null, 2));
console.log('');

// Test unquoted multi-word (problematic)
console.log('2. UNQUOTED MULTI-WORD (only captures first word):');
console.log('Input: @library:MLB Music @composer:hans zimmer');
const test2 = parseFilterQuery('@library:MLB Music @composer:hans zimmer');
console.log('Result:', JSON.stringify(test2, null, 2));
console.log('Notice: "Music" and "zimmer" became search text!\n');

// Test quoted multi-word (correct)
console.log('3. QUOTED MULTI-WORD (captures full phrase):');
console.log('Input: @library:"MLB Music" @composer:"hans zimmer"');
const test3 = parseFilterQuery('@library:"MLB Music" @composer:"hans zimmer"');
console.log('Result:', JSON.stringify(test3, null, 2));
console.log('');

// Test mixed quoted and unquoted
console.log('4. MIXED QUOTED AND UNQUOTED:');
console.log('Input: @library:NFL @composer:"john williams" @tags:orchestral');
const test4 = parseFilterQuery('@library:NFL @composer:"john williams" @tags:orchestral');
console.log('Result:', JSON.stringify(test4, null, 2));
console.log('');

// Test single quotes
console.log('5. SINGLE QUOTES ALSO WORK:');
console.log("Input: @library:'MLB Music' @album-title:'Cinema Score 3'");
const test5 = parseFilterQuery("@library:'MLB Music' @album-title:'Cinema Score 3'");
console.log('Result:', JSON.stringify(test5, null, 2));
console.log('');

// Test equals operator without quotes
console.log('6. EQUALS OPERATOR WITHOUT QUOTES:');
console.log('Input: @library=NFL @bpm=120');
const test6 = parseFilterQuery('@library=NFL @bpm=120');
console.log('Result:', JSON.stringify(test6, null, 2));

console.log('\n=====================================');
console.log('Summary: Quotes are OPTIONAL for single words,');
console.log('but REQUIRED for multi-word values!');