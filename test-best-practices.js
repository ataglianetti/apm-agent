/**
 * Best practices for using the intuitive @ filter system
 */

import { parseFilterQuery } from './server/services/filterParser.js';

console.log('✨ @ FILTER BEST PRACTICES ✨\n');
console.log('=====================================\n');

console.log('🎯 NO QUOTES NEEDED for most queries:\n');

// Example 1
console.log('✅ SIMPLE: @library:NFL Music');
const ex1 = parseFilterQuery('@library:NFL Music');
console.log('   Result:', `Library="${ex1.filters[0].value}"`);
console.log('');

// Example 2
console.log('✅ MULTIPLE: @library:MLB Music @tags:rock @bpm:120');
const ex2 = parseFilterQuery('@library:MLB Music @tags:rock @bpm:120');
console.log('   Filters:', ex2.filters.map(f => `${f.field}="${f.value}"`).join(', '));
console.log('');

// Example 3
console.log('✅ WITH SEARCH: @library:MLB Music @tags:rock for baseball game');
const ex3 = parseFilterQuery('@library:MLB Music @tags:rock for baseball game');
console.log('   Filters:', ex3.filters.map(f => `${f.field}="${f.value}"`).join(', '));
console.log('   Search:', `"${ex3.searchText}"`);
console.log('');

console.log('=====================================\n');
console.log('📝 WHEN TO USE QUOTES (optional but clearer):\n');

// Example 4
console.log('1️⃣ When you want to be explicit about boundaries:');
console.log('   @library:"MLB Music" @tags:rock "epic home run music"');
const ex4 = parseFilterQuery('@library:"MLB Music" @tags:rock "epic home run music"');
console.log('   Filters:', ex4.filters.map(f => `${f.field}="${f.value}"`).join(', '));
console.log('   Search:', `"${ex4.searchText}"`);
console.log('');

// Example 5
console.log('2️⃣ When the value contains special characters or punctuation:');
console.log('   @composer:"Williams, John" @album-title:"Star Wars: Episode IV"');
const ex5 = parseFilterQuery('@composer:"Williams, John" @album-title:"Star Wars: Episode IV"');
console.log('   Filters:', ex5.filters.map(f => `${f.field}="${f.value}"`).join(', '));
console.log('');

console.log('=====================================\n');
console.log('🔍 SMART PARSING EXAMPLES:\n');

// Example 6
console.log('The parser intelligently detects when search text begins:');
console.log('');
console.log('Input: @tags:rock with driving guitars');
const ex6 = parseFilterQuery('@tags:rock with driving guitars');
console.log('   → Filter: tags="rock"');
console.log('   → Search: "with driving guitars"');
console.log('');

console.log('Input: @composer:john williams for star wars');
const ex7 = parseFilterQuery('@composer:john williams for star wars');
console.log('   → Filter: composer="john williams"');
console.log('   → Search: "for star wars"');
console.log('');

console.log('=====================================\n');
console.log('⚡ OPERATOR USAGE:\n');

console.log('Use : for CONTAINS (partial match):');
console.log('   @library:MLB    → Matches "MLB Music", "MLB Sounds", etc.');
console.log('');

console.log('Use = for EXACT match:');
console.log('   @library=MLB Music    → Only matches exactly "MLB Music"');
console.log('');

console.log('=====================================\n');
console.log('💡 PRO TIPS:\n');
console.log('');
console.log('1. Type naturally - no quotes needed for most queries');
console.log('2. The parser understands context (words like "for", "with", "that")');
console.log('3. Combine multiple filters easily: @library:NFL @tags:rock @bpm:120');
console.log('4. Add AI search at the end: @tags:rock energetic and powerful');
console.log('5. Use quotes only when you need precise control');
console.log('');