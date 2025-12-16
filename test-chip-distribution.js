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

// Run tests
console.log('CHIP DISTRIBUTION TEST SUITE\n');

const results = [];
results.push(test('Case 1: 2300 stack, 16 players, 0 reentries', 2300, 16, 0));
results.push(test('Case 2: 2300 stack, 10 players, 1 reentry', 2300, 10, 1));
results.push(test('Case 3: 10000 stack, 8 players, 0 reentries', 10000, 8, 0));
results.push(test('Case 4: 5000 stack, 20 players, 0 reentries', 5000, 20, 0));

console.log(`\n${'='.repeat(60)}`);
console.log(`SUMMARY: ${results.filter(r => r).length}/${results.length} tests passed`);
console.log(`${'='.repeat(60)}\n`);





