// tests/phonetic_note_label_test.js
// 教典讀音註記（特／文／白／又讀…）→ label 轉換
const assert = require('assert');
global.window = {};
global.document = { addEventListener() {}, getElementById() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; } };
global.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
const { formatPhoneticForDisplay, renderPhoneticNoteLabels } = require('../main.js');

const L = (t) => `<span class="phonetic-note-label">${t}</span>`;

// 空值
assert.strictEqual(renderPhoneticNoteLabels(''), '');
assert.strictEqual(renderPhoneticNoteLabels(null), null);
// 已包【】个註記
assert.strictEqual(renderPhoneticNoteLabels('【特】a1'), L('特') + 'a1');
assert.strictEqual(renderPhoneticNoteLabels('a1 【又讀】b2'), 'a1 ' + L('又讀') + 'b2');
// 地區標記毋會轉
assert.strictEqual(renderPhoneticNoteLabels('【南】a1'), '【南】a1');
// 教典原始資料：開頭／分隔後背个註記加【】
assert.strictEqual(formatPhoneticForDisplay('特nga11 gog5 e31', true), '【特】nga11 gog5 e31');
assert.strictEqual(
  formatPhoneticForDisplay('文ngib5 kieu31　白ngib5 heu31', true),
  '【文】ngib5 kieu31　【白】ngib5 heu31',
);
assert.strictEqual(formatPhoneticForDisplay('a1　又讀2.ha24', true), 'a1　【又讀】2.ha24');
assert.strictEqual(formatPhoneticForDisplay('特殊音na55 he55', true), '【特殊音】na55 he55');
assert.strictEqual(formatPhoneticForDisplay('小稱變調讀本調為shong53', true), '【小稱變調讀本調為】shong53');
// 非教典毋處理
assert.strictEqual(formatPhoneticForDisplay('特nga11', false), '特nga11');
// 括號註記毋處理（後字變調）
assert.strictEqual(formatPhoneticForDisplay('sad24 （後字變調）', true), 'sad24（後字變調）');

console.log('phonetic_note_label_test: ok');
process.exit(0);
