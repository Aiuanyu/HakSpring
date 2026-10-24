// tests/pfs_to_hpp_test.js
// 驗證白話字（PFS）轉 HagPinPlus（HPP）、教育部客拼（GIP）个反向轉換（js/pfs-converter.js）。
// 預期值分兩種：
//  - 手核：照六調／聲母／韻母規則逐隻對過（第 1～5 節）
//  - 往返：用客委會認證四縣詞庫个真實音節，HPP → PFS → HPP 愛回到原樣（第 6 節）
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const pfs = require('../js/pfs-converter.js');
const gip = require('../js/gip-converter.js');
const join = require('../js/romaine-join.js');

console.log('🧪 Starting PFS → HPP / GIP tests...');

const { convertSyllableToHPP, convertWordPfsToHpp, convertWordPfsToGip, toHPP, toGIPFromPFS } = pfs;

// 1. 單音節：六調
assert.strictEqual(convertSyllableToHPP('kâ'), 'gá'); // 陰平 ˆ → 銳音
assert.strictEqual(convertSyllableToHPP('yèn'), 'iěn'); // 陽平 ̀ → 抑揚符 ̌
assert.strictEqual(convertSyllableToHPP('hák'), 'hàg'); // 上聲 ́ （收 k 是入聲，所以另看）
assert.strictEqual(convertSyllableToHPP('sûi'), 'súi'); // 陰平，調符落 u
assert.strictEqual(convertSyllableToHPP('thai'), 'tai'); // 去聲無符
assert.strictEqual(convertSyllableToHPP('hak'), 'hàg'); // 陰入：p／t／k 無符 → 重音符＋b／d／g
assert.strictEqual(convertSyllableToHPP('hak̍'), 'hag'); // 陽入：k̍ → 無符 g
console.log('  ✅ 1. 六調 PASS');

// 2. 聲母：送氣、細音（j q x）、零聲母 y
assert.strictEqual(convertSyllableToHPP('chho'), 'co'); // chh → c
assert.strictEqual(convertSyllableToHPP('chhiâm'), 'qiám'); // chh＋細音 → q
assert.strictEqual(convertSyllableToHPP('siên'), 'xién'); // s＋細音 → x
assert.strictEqual(convertSyllableToHPP('phiùng'), 'piǔng'); // ph → p
assert.strictEqual(convertSyllableToHPP('kiet'), 'gièd'); // k → g、t 入聲 → d
assert.strictEqual(convertSyllableToHPP('yi'), 'i'); // 零聲母 y 去掉
console.log('  ✅ 2. 聲母 PASS');

// 3. 空韻 ṳ → ii、成音節 ng̀／m̀、大小寫還原
assert.strictEqual(convertSyllableToHPP('ṳ̀'), 'ǐi');
assert.strictEqual(convertSyllableToHPP('Chhṳ̀'), 'Cǐi');
assert.strictEqual(convertSyllableToHPP('ng̀'), 'ňg'.normalize('NFC'));
assert.strictEqual(convertSyllableToHPP('m̀'), 'm̌'.normalize('NFC'));
assert.strictEqual(convertSyllableToHPP('NGÂI'), 'NGÁI');
assert.strictEqual(convertSyllableToHPP('Ngâi'), 'Ngái');
assert.strictEqual(convertSyllableToHPP(''), '');
assert.strictEqual(convertSyllableToHPP('123'), '123'); // 無字母原樣
console.log('  ✅ 3. 空韻、成音節、大小寫 PASS');

// 4. 詞（hyphen 連詞）：HPP 連寫＋撇號；GIP 有調符直連、無調符空格
assert.strictEqual(convertWordPfsToHpp('hak-ka'), 'hàgga');
assert.strictEqual(convertWordPfsToHpp('pên-yú'), "bén'iù"); // n＋母音 → 撇號
assert.strictEqual(convertWordPfsToHpp('tâi-ngìn'), "dái'ngǐn"); // 母音＋ng → 撇號
assert.strictEqual(convertWordPfsToHpp('sân-sân'), 'sánsán');
assert.strictEqual(convertWordPfsToHpp(''), '');
assert.strictEqual(convertWordPfsToGip('hak-ka', gip), 'hagˋga'); // hagˋ 有調符，直連
assert.strictEqual(convertWordPfsToGip('pên-yú', gip), 'benˊiuˋ');
assert.strictEqual(convertWordPfsToGip('tâi-ngìn', gip), 'daiˊnginˇ');
assert.strictEqual(convertWordPfsToGip('thai-ngin', gip), 'tai ngin'); // 去聲無符：空格
assert.strictEqual(convertWordPfsToGip('', gip), '');
console.log('  ✅ 4. 連詞 PASS');

// 5. 整串：HTML 標籤、空白、漢字、標點、數字原樣；詞內才轉
assert.strictEqual(
  toHPP('Hak-ka-ngî，<b>tâi-ngìn</b> 客家 123 chhṳ̀.'),
  "Hàgga'ngí，<b>dái'ngǐn</b> 客家 123 cǐi."
);
assert.strictEqual(
  toGIPFromPFS('Hak-ka-ngî，<b>tâi-ngìn</b> 客家 123.', gip),
  'Hagˋga ngiˊ，<b>daiˊnginˇ</b> 客家 123.'
);
assert.strictEqual(toHPP(''), '');
assert.strictEqual(toHPP(null), '');
assert.strictEqual(toHPP(undefined), '');
assert.strictEqual(toGIPFromPFS(null, gip), '');
// 省略 gipConverter 參數：自動用 gip-converter.js
assert.strictEqual(toGIPFromPFS('hak-ka'), 'hagˋga');
console.log('  ✅ 5. 整串隔離 PASS');

// 6. 往返：客委會認證四縣詞庫个真實音節 HPP → PFS → HPP
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuote) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuote = false;
      else field += c;
    } else if (c === '"') inQuote = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const certDir = path.join(__dirname, '..', 'data', 'cert');
// 認證資料裡有兩隻音節少打空格（tiéngúng），不是音節，排除；資料要另外修
const NOT_A_SYLLABLE = new Set(['tiéngúng', 'tiengúng']);
const syllables = new Set();
for (const f of fs.readdirSync(certDir).filter((n) => /^113四.*\.json$/.test(n))) {
  const { content } = JSON.parse(fs.readFileSync(path.join(certDir, f), 'utf8'));
  const rows = parseCsv(content);
  const col = rows[0].indexOf('客語標音_顯示');
  assert.ok(col >= 0, `${f} 找無「客語標音_顯示」欄`);
  for (const r of rows.slice(1)) {
    for (const s of (r[col] || '').split(/[\s【】/、]+/)) {
      // 只收純音節：拉丁字母＋調符，不含其他符號或漢字
      if (!NOT_A_SYLLABLE.has(s) && /^[A-Za-zÀ-ɏḀ-ỿ̀-ͯ]+$/.test(s) && /[aeiouimn]/i.test(s)) {
        syllables.add(s.normalize('NFC'));
      }
    }
  }
}
assert.ok(syllables.size > 1000, `音節數太少：${syllables.size}`);
const failures = [];
for (const s of syllables) {
  const back = convertSyllableToHPP(pfs.convertSyllableToPFS(s));
  if (back !== s) failures.push(`${s} → ${pfs.convertSyllableToPFS(s)} → ${back}`);
}
assert.deepStrictEqual(failures, [], `往返不一致 ${failures.length}/${syllables.size}：\n${failures.slice(0, 20).join('\n')}`);
console.log(`  ✅ 6. 往返 ${syllables.size} 隻真實音節 PASS`);

// 7. 撇號規則唯一來源：摎 Romaine 連寫（js/romaine-join.js）共一套
const pairs = ['tai', 'ngin', 'pen', 'iu', 'siid', 'fan', 'gá', 'iěn', 'm\u030c', 'a', 'o', 'i', 'u', 'e', 'n', 'g'];
for (const a of pairs) for (const b of pairs) {
  assert.strictEqual(pfs.needsApostrophe(a, b), join.needsApostrophe(a, b), `${a}+${b}`);
}
for (const [a, b, want] of [['tai', 'ngin', true], ['pen', 'iu', true], ['siid', 'fan', false], ['m̌', 'a', true]]) {
  assert.strictEqual(pfs.needsApostrophe(a, b), want, `${a}+${b}`);
}
console.log('  ✅ 7. 撇號規則唯一來源 PASS');

// 8. 瀏覽器載入方式（無 module，用全域）：pfs-converter.js 先載入、romaine-join／gip-converter 晚載入也做得
const vm = require('vm');
const ctx = vm.createContext({ console });
ctx.globalThis = ctx;
const load = (f) => vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx);
load('pfs-converter.js');
assert.throws(() => ctx.pfsConverter.toHPP('hak-ka'), /romaine-join/); // 還沒載入：講清楚缺啥
load('gip-converter.js');
load('romaine-join.js');
assert.strictEqual(ctx.pfsConverter.toHPP('hak-ka'), 'hàgga');
assert.strictEqual(ctx.pfsConverter.toGIPFromPFS('hak-ka'), 'hagˋga');
console.log('  ✅ 8. 瀏覽器全域載入 PASS');

console.log('\n✨ All PFS → HPP / GIP tests passed!');
