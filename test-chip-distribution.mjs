// Test suite for calculateChipDistribution function
// Run with: node test-chip-distribution.js

import { calculateChipDistribution } from './server/utils/chipDistribution.js';

// Test cases
function test(name, startingStack, numPlayers, maxReentries = 0) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`TEST: ${name}`);
  console.log(`Starting Stack: ${startingStack}, Players: ${numPlayers}, Reentries: ${maxReentries}`);
  console.log(`${'='.repeat(60)}`);
  
  const result = calculateChipDistribution(startingStack, numPlayers, null, maxReentries);
  const total = Object.entries(result).reduce((sum, [denom, count]) => {
    return sum + (parseInt(denom) * count);
  }, 0);
  
  console.log('\nFinal Distribution:');
  const sorted = Object.entries(result)
    .map(([d, c]) => [parseInt(d), c])
    .sort((a, b) => b[0] - a[0]);
  
  for (const [denom, count] of sorted) {
    console.log(`  ${denom}: ${count}`);
  }
  
  console.log(`\nTotal: ${total}`);
  console.log(`Target: ${startingStack}`);
  console.log(`Difference: ${total - startingStack}`);
  const passed = total === startingStack;
  console.log(passed ? `✅ PASS` : `❌ FAIL`);
  
  return passed;
}

// Create a blind structure that requires 5s
const blindStructureWith5s = {
  levels: [
    { sb: 10, bb: 20, ante: 0 },
    { sb: 10, bb: 25, ante: 0 },
    { sb: 15, bb: 30, ante: 30 },
    { sb: 20, bb: 40, ante: 40 },
    { sb: 25, bb: 50, ante: 50 }
  ]
};

// Run tests
console.log('CHIP DISTRIBUTION TEST SUITE\n');

const results = [];
results.push(test('Case 1: 2300 stack, 16 players, 0 reentries', 2300, 16, 0));
results.push(test('Case 2: 2300 stack, 10 players, 1 reentry', 2300, 10, 1));
results.push(test('Case 3: 10000 stack, 8 players, 0 reentries', 10000, 8, 0));
results.push(test('Case 4: 5000 stack, 20 players, 0 reentries', 5000, 20, 0));

// Test with blind structure that requires 5s
function testWithBlinds(name, startingStack, numPlayers, blindStructure, maxReentries = 0) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`TEST: ${name}`);
  console.log(`Starting Stack: ${startingStack}, Players: ${numPlayers}, Reentries: ${maxReentries}`);
  console.log(`Blind Structure: ${JSON.stringify(blindStructure.levels.slice(0, 3))}...`);
  console.log(`${'='.repeat(60)}`);
  
  const result = calculateChipDistribution(startingStack, numPlayers, blindStructure, maxReentries);
  const total = Object.entries(result).reduce((sum, [denom, count]) => {
    return sum + (parseInt(denom) * count);
  }, 0);
  
  console.log('\nFinal Distribution:');
  const sorted = Object.entries(result)
    .map(([d, c]) => [parseInt(d), c])
    .sort((a, b) => b[0] - a[0]);
  
  for (const [denom, count] of sorted) {
    console.log(`  ${denom}: ${count}`);
  }
  
  console.log(`\nTotal: ${total}`);
  console.log(`Target: ${startingStack}`);
  console.log(`Difference: ${total - startingStack}`);
  const passed = total === startingStack;
  const has5s = (result[5] || 0) > 0;
  console.log(passed ? `✅ PASS` : `❌ FAIL`);
  console.log(has5s ? `✅ Has 5s: ${result[5]}` : `❌ Missing 5s!`);
  
  return passed && has5s;
}

results.push(testWithBlinds('Case 5: 2300 stack, 16 players, with blind structure requiring 5s', 2300, 16, blindStructureWith5s, 0));

console.log(`\n${'='.repeat(60)}`);
console.log(`SUMMARY: ${results.filter(r => r).length}/${results.length} tests passed`);
console.log(`${'='.repeat(60)}\n`);
