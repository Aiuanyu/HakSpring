// tests/romaine_join_test.js
// 驗證 Romaine 結果區个音節連寫純邏輯（js/romaine-join.js）：撇號規則、分隔符判斷、首字大小寫
const assert = require('assert');
const join = require('../js/romaine-join.js');
const gip = require('../js/gip-converter.js');

console.log('🧪 Starting Romaine join tests...');

const { isFirstCharUpper, needsApostrophe, applyApostropheRules, getJoiningSeparator } = join;

// 1. 首字大小寫判斷（U 鈕摎切換顯示模式共用）
assert.strictEqual(isFirstCharUpper('Hàg'), true);
assert.strictEqual(isFirstCharUpper('hàg'), false);
assert.strictEqual(isFirstCharUpper('Hagˋ'), true); // GIP 字尾調符
assert.strictEqual(isFirstCharUpper(''), false);
assert.strictEqual(isFirstCharUpper(undefined), false);
assert.strictEqual(isFirstCharUpper('1ab'), false); // 無字母毋算大寫
console.log('  ✅ 1. 首字大小寫 PASS');

// 2. HPP 撇號規則（八條，摎企盤 engine 同一套）
assert.strictEqual(needsApostrophe('gá', 'iěn'), true); // 母音＋母音（a＋i）
assert.strictEqual(needsApostrophe('tai', 'ngǐn'), true); // 母音＋ng
assert.strictEqual(needsApostrophe('pěn', 'iú'), true); // 子音韻尾＋母音
assert.strictEqual(needsApostrophe('siid', 'fan'), false);
assert.strictEqual(needsApostrophe('hàg', 'gá'), false);
assert.strictEqual(needsApostrophe('m̌', 'ǎ'), true); // 成音節 m̌（結合符號）也愛正確判斷
assert.strictEqual(applyApostropheRules("pěn iú"), "pěn'iú");
assert.strictEqual(applyApostropheRules('hàg gá siid fan'), 'hàggásiidfan');
console.log('  ✅ 2. HPP 撇號規則 PASS');

// 3. 連詞模式：連字號、空格
assert.strictEqual(getJoiningSeparator('hyphen', false, 'hàg', 'hàg', 'gá'), '-');
assert.strictEqual(getJoiningSeparator('space', false, 'hàg', 'hàg', 'gá'), ' ');
assert.strictEqual(getJoiningSeparator('hyphen', true, 'hagˋ', 'hàg', 'gá'), '-'); // GIP 照樣
assert.strictEqual(getJoiningSeparator('其他', false, 'a', 'a', 'b'), '');
console.log('  ✅ 3. 連字號與空格模式 PASS');

// 4. 連寫（none）、HPP：愛撇號就插撇號，無就連起來；兩隻音節都大寫時必須以連字號 - 相接（嚴禁 CamelCase）
assert.strictEqual(getJoiningSeparator('none', false, 'pěn', 'pěn', 'iú'), "'");
assert.strictEqual(getJoiningSeparator('none', false, 'tai', 'tai', 'ngǐn'), "'");
assert.strictEqual(getJoiningSeparator('none', false, 'siid', 'siid', 'fan'), '');
assert.strictEqual(getJoiningSeparator('none', false, 'Siin', 'Siin', 'Lǐn'), '-'); // 嚴禁 CamelCase
assert.strictEqual(applyApostropheRules('Siin Lǐn'), 'Siin-Lǐn'); // 聖靈
assert.strictEqual(applyApostropheRules('Mí Tǒi'), 'Mí-Tǒi');     // 美臺
assert.strictEqual(applyApostropheRules('Siin lǐn'), 'Siinlǐn');   // 僅首字大寫時正常連寫
console.log('  ✅ 4. 連寫（HPP，含嚴禁 CamelCase 連字號）PASS');

// 5. 連寫（none）、GIP：有調符直接連，無調符一律空格；毋再用撇號
assert.strictEqual(getJoiningSeparator('none', true, 'penˇ', 'pěn', 'iú'), ''); // ˇ
assert.strictEqual(getJoiningSeparator('none', true, 'hagˋ', 'hàg', 'gá'), ''); // ˋ
assert.strictEqual(getJoiningSeparator('none', true, 'gaˊ', 'gá', 'iěn'), ''); // ˊ
assert.strictEqual(getJoiningSeparator('none', true, 'sanˆ', 'sân', 'sân'), ''); // ˆ（U+02C6）
assert.strictEqual(getJoiningSeparator('none', true, 'ban+', 'bān', 'ban'), ''); // +
assert.strictEqual(getJoiningSeparator('none', true, 'tai', 'tai', 'ngǐn'), ' '); // 無調符（HPP 愛撇號个位）
assert.strictEqual(getJoiningSeparator('none', true, 'siid', 'siid', 'fan'), ' '); // 無調符（HPP 毋使撇號个位）
assert.strictEqual(getJoiningSeparator('none', true, 'Hag', 'hag', 'gá'), ' ');
console.log('  ✅ 5. 連寫（GIP）PASS');

// 6. 調符字元集：gip-converter 匯出个每一隻調符，romaine-join 都認得，免得兩邊各自維護走鐘
for (const ch of gip.TONE_SYMBOL_CHARS) {
  assert.strictEqual(getJoiningSeparator('none', true, 'ba' + ch, 'bá', 'gá'), '', `調符 U+${ch.codePointAt(0).toString(16)}`);
}
assert.strictEqual(gip.TONE_SYMBOL_CHARS.length, 5);
// 實際轉換出來个 GIP 音節，有調符个都以調符結尾
for (const hpp of ['bán', 'bàn', 'běn', 'bân', 'bān']) {
  assert.strictEqual(gip.endsWithToneSymbol(gip.convertSyllableToGIP(hpp)), true, hpp);
}
assert.strictEqual(gip.endsWithToneSymbol(gip.convertSyllableToGIP('ban')), false);
assert.strictEqual(gip.endsWithToneSymbol(''), false);
console.log('  ✅ 6. 調符字元集一致 PASS');

console.log('🎉 All Romaine join tests passed successfully!');
process.exit(0);
