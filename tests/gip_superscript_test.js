// tests/gip_superscript_test.js
// 驗證 GIP 調符上標包裝个純文字切分邏輯（js/gip-superscript.js 个 splitToneSymbols）
const assert = require('assert');
const { splitToneSymbols } = require('../js/gip-superscript.js');
const gip = require('../js/gip-converter.js');

console.log('🧪 Starting GIP superscript tests...');

const show = (text) => splitToneSymbols(text).map((p) => (p.tone ? `[${p.text}]` : p.text)).join('');

// 1. 五種調符都認得，字母後面緊接个先算
assert.strictEqual(show('bodˋ'), 'bod[ˋ]'); // ˋ
assert.strictEqual(show('gaˊ'), 'ga[ˊ]'); // ˊ
assert.strictEqual(show('kongˇ'), 'kong[ˇ]'); // ˇ
assert.strictEqual(show('sanˆ'), 'san[ˆ]'); // ˆ
assert.strictEqual(show('ban+'), 'ban[+]'); // +
console.log('  ✅ 1. 五種調符 PASS');

// 2. 多音節、連寫、混雜標點
assert.strictEqual(show('hagˋ gaˊ'), 'hag[ˋ] ga[ˊ]');
assert.strictEqual(show('hagˋgaˊ'), 'hag[ˋ]ga[ˊ]'); // 連寫：調符後面直接接下一隻音節
assert.strictEqual(show('ban+gienˇ'), 'ban[+]gien[ˇ]');
assert.strictEqual(show('nemˇ nemˇ 又讀nemˋ nemˋ'), 'nem[ˇ] nem[ˇ] 又讀nem[ˋ] nem[ˋ]');
assert.strictEqual(show('【特】soˊ'), '【特】so[ˊ]');
console.log('  ✅ 2. 多音節與連寫 PASS');

// 3. 沒有調符、或調符前頭無字母，原樣不動（回空陣列）
assert.deepStrictEqual(splitToneSymbols('siid fan'), []);
assert.deepStrictEqual(splitToneSymbols(''), []);
assert.deepStrictEqual(splitToneSymbols(null), []);
assert.deepStrictEqual(splitToneSymbols('1+1'), []); // 數字後个 +
assert.deepStrictEqual(splitToneSymbols('+ 號'), []); // 開頭个 +
assert.deepStrictEqual(splitToneSymbols('，ˋ'), []); // 標點後个調符
console.log('  ✅ 3. 毋該轉个原樣 PASS');

// 4. 切分後接回來，文字內容完全共樣（上標只係包裝，毋改字）
for (const t of ['hagˋ gaˊ', 'ban+gienˇ', 'samˆ ban+']) {
  assert.strictEqual(splitToneSymbols(t).map((p) => p.text).join(''), t);
}
console.log('  ✅ 4. 切分後內容不變 PASS');

// 5. 調符字元集摎 gip-converter 一致：toGIP 轉出來个調符，每一隻都認得
for (const hpp of ['bán', 'bàn', 'běn', 'bân', 'bān']) {
  const g = gip.convertSyllableToGIP(hpp);
  const parts = splitToneSymbols(g);
  assert.strictEqual(parts.length, 2, hpp);
  assert.strictEqual(parts[1].tone, true, hpp);
  assert.strictEqual(parts[1].text, g.slice(-1), hpp);
}
assert.deepStrictEqual(splitToneSymbols(gip.convertSyllableToGIP('ban')), []); // 無調符
console.log('  ✅ 5. 與 gip-converter 調符字元集一致 PASS');

console.log('🎉 All GIP superscript tests passed successfully!');
process.exit(0);
