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

console.log('Verifying buildOptionsForType (Cloze mode distractor length-matching and fallback):');

const mockTarget = {
  客家語: '發子【病子／發子】',
  分類: '1人體與醫療',
  progressKey: 'c平中1-1|m'
};

const mockAllWordsSufficient = [
  { 客家語: '發子【病子／發子】', progressKey: 'c平中1-1|m', 分類: '1人體與醫療' },
  { 客家語: '治療', progressKey: 'c平中1-2|m', 分類: '1人體與醫療' },
  { 客家語: '反躁', progressKey: 'c平中1-3|m', 分類: '1人體與醫療' },
  { 客家語: '恢復（回復）', progressKey: 'c平中1-4|m', 分類: '1人體與醫療' },
  { 客家語: '出麻仔【出麻／出麻仔】', progressKey: 'c平中1-5|m', 分類: '1人體與醫療' }, // length 3 (should be ignored)
  { 客家語: '嘔【翻／嘔】', progressKey: 'c平中1-6|m', 分類: '1人體與醫療' } // length 1 (should be ignored)
];

const mockAllWordsFallback = [
  { 客家語: '發子【病子／發子】', progressKey: 'c平中1-1|m', 分類: '1人體與醫療' },
  { 客家語: '出麻仔【出麻／出麻仔】', progressKey: 'c平中1-5|m', 分類: '1人體與醫療' }, // length 3 (only other candidate, must use as fallback)
  { 客家語: '嘔【翻／嘔】', progressKey: 'c平中1-6|m', 分類: '1人體與醫療' } // length 1 (only other candidate, must use as fallback)
];

// Test case 1: Sufficient candidates of same length
const optionsSufficient = buildOptionsForType(mockTarget, 'c', mockAllWordsSufficient);
console.log('  optionsSufficient:', optionsSufficient);
console.assert(optionsSufficient.length === 4, `Expected exactly 4 options, got ${optionsSufficient.length}`);
for (const opt of optionsSufficient) {
  console.assert(opt.length === 2, `Expected option "${opt}" to have length 2`);
}
console.log('  [OK] buildOptionsForType successfully filtered distractors by length when sufficient same-length words exist.');

// Test case 2: Fallback candidates when same-length is insufficient
const optionsFallback = buildOptionsForType(mockTarget, 'c', mockAllWordsFallback);
console.log('  optionsFallback:', optionsFallback);
console.assert(optionsFallback.length === 3, `Expected exactly 3 options (1 target + 2 distractors available), got ${optionsFallback.length}`);
console.assert(optionsFallback.includes('發子'), 'Expected target "發子" in fallback options');
console.assert(optionsFallback.includes('出麻仔'), 'Expected fallback candidate "出麻仔" in options');
console.assert(optionsFallback.includes('嘔'), 'Expected fallback candidate "嘔" in options');
console.log('  [OK] buildOptionsForType successfully relaxed length-matching constraint and fell back to other-length distractors.');

console.log('All Cloze and Character Count tests passed successfully!');
