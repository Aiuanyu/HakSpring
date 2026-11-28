const assert = require('assert');
const {
  isValidGameWord,
  getWordsForDialectAndLevel
} = require('../js/game/game-data.js');

// Mock globals expected by getWordsForDialectAndLevel
global.window = global;
global.getFullLevelName = (varName) => `cert${varName}`;

// Test 1: isValidGameWord rejects placeholder and empty rows
assert.strictEqual(isValidGameWord({ 編號: '4-161', 客家語: '此腔無此詞條', 華語詞義: '' }), false);
assert.strictEqual(isValidGameWord({ 編號: '1-1', 客家語: '本腔無此詞條', 華語詞義: '無' }), false);
assert.strictEqual(isValidGameWord({ 編號: '1-2', 客家語: '日曆此腔無此詞條', 華語詞義: '日曆' }), false);
assert.strictEqual(isValidGameWord({ 編號: '此級無此單元', 客家語: '', 華語詞義: '' }), false);
assert.strictEqual(isValidGameWord({ 編號: '1-3', 客家語: '阿爸', 華語詞義: '' }), false);
assert.strictEqual(isValidGameWord({ 編號: '1-4', 客家語: '', 華語詞義: '爸爸' }), false);
assert.strictEqual(isValidGameWord(null), false);

// Test 2: isValidGameWord accepts valid rows
assert.strictEqual(
  isValidGameWord({ 編號: '1-1', 客家語: '阿爸', 客語標音_顯示: 'a24 ba24', 華語詞義: '爸爸' }),
  true
);

// Test 3: getWordsForDialectAndLevel filters out placeholder rows
global.window['四基'] = {
  content: [
    { 編號: '1-1', 客家語: '阿爸', 客語標音_顯示: 'a24 ba24', 華語詞義: '爸爸' },
    { 編號: '3-57', 客家語: '此腔無此詞條', 客語標音_顯示: '', 華語詞義: '' },
    { 編號: '3-58', 客家語: '本腔無此詞條', 客語標音_顯示: '', 華語詞義: '' },
    { 編號: '此級無此單元', 客家語: '', 客語標音_顯示: '', 華語詞義: '' },
    { 編號: '1-2', 客家語: '阿姆', 客語標音_顯示: 'a24 me24', 華語詞義: '媽媽' }
  ]
};

const words = getWordsForDialectAndLevel('四縣', '四基');
assert.strictEqual(words.length, 2);
assert.deepStrictEqual(words.map(w => w.客家語), ['阿爸', '阿姆']);

console.log('game_data_filter_test.js: all assertions passed');
