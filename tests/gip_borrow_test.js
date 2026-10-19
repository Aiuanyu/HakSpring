// tests/gip_borrow_test.js
// 驗證教典條目釋義摎例句都空時，借用別腔同詞目个邏輯（borrowMissingGipFields）
const assert = require('assert');
const fs = require('fs');
const path = require('path');

global.window = {
  reverseToneMappingData: JSON.parse(fs.readFileSync(path.join(__dirname, '../reverse_tone_mapping.json'), 'utf8')),
  sandhiRulesData: JSON.parse(fs.readFileSync(path.join(__dirname, '../sandhi_rules.json'), 'utf8')),
};
global.document = { createElement: () => ({}), createTreeWalker: () => ({ nextNode: () => null }) };
global.NodeFilter = { SHOW_TEXT: 4 };

const { borrowMissingGipFields } = require('../main.js');

console.log('🧪 Starting GIP borrow tests...');

const row = (extra) => ({ 客家語: '腍腍', 華語詞義: '', 例句: '', 翻譯: '', ...extra });
const hit = (accentKey, name, extra) => ({
  accentKey,
  itemDialectInfo: { 腔: accentKey, 腔名: name },
  foundItem: row(extra),
});

// 1. 四縣條目全空：釋義、例句優先借姊妹腔南四縣（即使別腔排在前面）
{
  const results = [
    hit('大', '大埔', { 華語詞義: '大埔釋義', 例句: '例：大埔例句', 翻譯: '大埔翻譯' }),
    hit('南', '南四縣', { 華語詞義: '南釋義', 例句: '例：南例句', 翻譯: '南翻譯' }),
  ];
  const b = borrowMissingGipFields(row(), '四', results);
  assert.strictEqual(b.meaning, '南釋義');
  assert.strictEqual(b.sentence, '例：南例句');
  assert.strictEqual(b.translation, '南翻譯');
  assert.strictEqual(b.note, '（釋義、例句借自教典南四縣）');
}
console.log('  ✅ 1. 優先借姊妹腔 PASS');

// 2. 姊妹腔也空：釋義借別腔，例句不借別腔
{
  const results = [
    hit('南', '南四縣', {}),
    hit('海', '海陸', { 華語詞義: '海陸釋義', 例句: '例：海陸例句', 翻譯: '海陸翻譯' }),
  ];
  const b = borrowMissingGipFields(row(), '四', results);
  assert.strictEqual(b.meaning, '海陸釋義');
  assert.strictEqual(b.sentence, '');
  assert.strictEqual(b.translation, '');
  assert.strictEqual(b.note, '（釋義借自教典海陸）');
}
console.log('  ✅ 2. 別腔个例句毋借 PASS');

// 3. 大埔條目（無姊妹腔）：只借釋義
{
  const results = [hit('四', '四縣', { 華語詞義: '四縣釋義', 例句: '例：四縣例句' })];
  const b = borrowMissingGipFields(row(), '大', results);
  assert.strictEqual(b.meaning, '四縣釋義');
  assert.strictEqual(b.sentence, '');
}
console.log('  ✅ 3. 無姊妹腔个腔只借釋義 PASS');

// 4. 本來就有釋義或例句：毋借
assert.strictEqual(borrowMissingGipFields(row({ 華語詞義: '有釋義' }), '四', [hit('南', '南四縣', { 華語詞義: 'x' })]), null);
assert.strictEqual(borrowMissingGipFields(row({ 例句: '例：有例句' }), '四', [hit('南', '南四縣', { 華語詞義: 'x' })]), null);
console.log('  ✅ 4. 原本有資料就毋借 PASS');

// 5. 各腔都空、或無跨腔結果、或無條目：回 null
assert.strictEqual(borrowMissingGipFields(row(), '四', [hit('南', '南四縣', {})]), null);
assert.strictEqual(borrowMissingGipFields(row(), '四', []), null);
assert.strictEqual(borrowMissingGipFields(row(), '四', undefined), null);
assert.strictEqual(borrowMissingGipFields(null, '四', []), null);
console.log('  ✅ 5. 借無著回 null PASS');

console.log('🎉 All GIP borrow tests passed successfully!');
process.exit(0);
