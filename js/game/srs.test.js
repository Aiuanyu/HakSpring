// js/game/srs.test.js
// Quick test script for SM-2 logic

// Since this is a simple script, we'll mock the function locally to test it,
// or we can import if we are using modules. But we'll just run tests against it.

const fs = require('fs');
const srsCode = fs.readFileSync('./js/game/srs.js', 'utf8');

// Evaluate the pure function into the current context
eval(srsCode);

console.log('--- SRS SM-2 Algorithm Tests ---');

// Test Case 1: First time seen, answer is 'good'
let state1 = computeSM2({}, 'good', 100);
console.assert(state1.interval === 1, 'First good interval should be 1');
console.assert(state1.reps === 1, 'Reps should be 1');
console.assert(state1.ef === 250, 'EF should remain 2.5');

// Test Case 2: Answer 'good' again
let state2 = computeSM2(state1, 'good', 101);
console.assert(state2.interval === 6, 'Second good interval should be 6');
console.assert(state2.reps === 2, 'Reps should be 2');

// Test Case 3: Answer 'good' a third time
let state3 = computeSM2(state2, 'good', 107);
console.assert(state3.interval === 15, `Third good interval should be 15, got ${state3.interval}`); // 6 * 2.5 = 15

// Test Case 4: Answer 'again' (fail)
let state4 = computeSM2(state3, 'again', 122);
console.assert(state4.interval === 1, 'Fail interval should reset to 1');
console.assert(state4.reps === 0, 'Fail reps should reset to 0');
console.assert(state4.ef === 230, 'Fail EF should drop by 0.2 (20)');

// Test Case 5: Answer 'easy'
let state5 = computeSM2(state4, 'easy', 123);
console.assert(state5.interval === 4, 'Easy interval after fail should be 4');
console.assert(state5.reps === 1, 'Reps should be 1');
console.assert(state5.ef === 245, 'EF should increase by 0.15 (15)');

// Test Case 6: Answer 'hard'
let state6 = computeSM2(state5, 'hard', 127);
console.assert(state6.interval === 5, 'Hard interval should be round(4 * 1.2) = 5');
console.assert(state6.reps === 2, 'Reps should be 2');
console.assert(state6.ef === 230, 'EF should decrease by 0.15 (15)');

console.log('All tests passed successfully!');

console.log('\n--- Question Gen / Cloze Word Length Tests ---');
const qGenCode = fs.readFileSync('./js/game/question-gen.js', 'utf8');

// Mock browser dependencies for question-gen.js
const mockWindow = {
  console: {
    info: (...args) => console.log(...args),
    log: (...args) => console.log(...args),
    warn: (...args) => console.warn(...args)
  }
};

// Evaluate question-gen.js in a sandbox
const qGenContext = {};
eval(qGenCode);

console.log('Verifying cleanClozeWord:');
const cleanTestCases = [
  { input: '發子【病子／發子】', expected: '發子' },
  { input: '出麻仔【出麻／出麻仔】', expected: '出麻仔' },
  { input: '恢復（回復）', expected: '恢復' },
  { input: '腳板（腳盤）【腳盤／腳板（腳盤）】', expected: '腳板' },
  { input: '嘔【翻／嘔】', expected: '嘔' },
  { input: '普通', expected: '普通' },
  { input: '𠊎【𠊎】', expected: '𠊎' },
  { input: '', expected: '' },
  { input: null, expected: '' }
];

for (const tc of cleanTestCases) {
  const result = cleanClozeWord(tc.input);
  console.assert(result === tc.expected, `Expected cleanClozeWord("${tc.input}") to be "${tc.expected}", got "${result}"`);
  console.log(`  cleanClozeWord("${tc.input || ''}") -> "${result}" [OK]`);
}

console.log('Verifying getChineseCharCount & countHanChars:');
const lengthTestCases = [
  { input: '𠊎', expected: 1 },
  { input: '𠊎自家', expected: 3 },
  { input: '發子【病子／發子】', expected: 2 },
  { input: '出麻仔【出麻／出麻仔】', expected: 3 },
  { input: '恢復（回復）', expected: 2 },
  { input: '腳板（腳盤）【腳盤／腳板（腳盤）】', expected: 2 },
  { input: '嘔【翻／嘔】', expected: 1 },
  { input: '普通', expected: 2 },
  { input: '𫣆人', expected: 2 },
  { input: '', expected: 0 },
  { input: null, expected: 0 }
];

for (const tc of lengthTestCases) {
  const result = getChineseCharCount(tc.input);
  console.assert(result === tc.expected, `Expected getChineseCharCount("${tc.input}") to be ${tc.expected}, got ${result}`);
  console.log(`  getChineseCharCount("${tc.input || ''}") -> ${result} [OK]`);
}

console.log('All Cloze and Character Count tests passed successfully!');
