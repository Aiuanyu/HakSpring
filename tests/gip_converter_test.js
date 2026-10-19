// tests/gip_converter_test.js
// 驗證 HPP 轉教育部客拼（GIP）模組；本機有教育部原始認證檔時，另拿佢當標準答案全量比對
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { toGIP, convertSyllableToGIP, TONE_SYMBOLS } = require('../js/gip-converter.js');
const pfs = require('../js/pfs-converter.js');

console.log('🧪 Starting GIP converter unit tests...');

// 1. 調符對照（五個調符 + 無調符）
assert.strictEqual(convertSyllableToGIP('bán'), 'banˊ'); // 銳音
assert.strictEqual(convertSyllableToGIP('bàn'), 'banˋ'); // 重音
assert.strictEqual(convertSyllableToGIP('běn'), 'benˇ'); // 抑揚
assert.strictEqual(convertSyllableToGIP('bân'), 'ban\u02C6'); // 折音（U+02C6）
assert.strictEqual(convertSyllableToGIP('bān'), 'ban+'); // 長音（ASCII 加號）
assert.strictEqual(convertSyllableToGIP('ban'), 'ban'); // 無調符
console.log('  ✅ 1. 調符對照 PASS');

// 2. 字元碼位：折音用修飾字母 ˆ（U+02C6），長音用 ASCII 个 +（˖ U+02D6 太細，毋採用）
assert.strictEqual(TONE_SYMBOLS['́'], 'ˊ');
assert.strictEqual(TONE_SYMBOLS['̀'], 'ˋ');
assert.strictEqual(TONE_SYMBOLS['̌'], 'ˇ');
assert.strictEqual(TONE_SYMBOLS['̂'], 'ˆ');
assert.strictEqual(TONE_SYMBOLS['̄'], '+');
assert.strictEqual(convertSyllableToGIP('bân').slice(-1).codePointAt(0), 0x02c6);
assert.strictEqual(convertSyllableToGIP('bān').slice(-1).codePointAt(0), 0x2b);
console.log('  ✅ 2. 修飾字母碼位 PASS');

// 3. 實際詞句（預先組合字元與組合字元兩種輸入都要一樣）
assert.strictEqual(toGIP('bòd kǒng'), 'bodˋ kongˇ');
assert.strictEqual(toGIP('bòd kǒng'), 'bodˋ kongˇ');
assert.strictEqual(toGIP('hàg gá'), 'hagˋ gaˊ');
assert.strictEqual(toGIP('m̌'), 'mˇ'); // 毋：m + U+030C → mˇ
assert.strictEqual(toGIP('ǹg'), 'ngˋ');
assert.strictEqual(toGIP('Hàg Ngiěn'), 'Hagˋ Ngienˇ'); // 大小寫保留
console.log('  ✅ 3. 實際詞句 PASS');

// 4. 標點、括號、漢字註記、斜線變體、HTML 標籤、數字
assert.strictEqual(toGIP('bòd zìi【南】'), 'bodˋ ziiˋ【南】');
assert.strictEqual(toGIP('bòd zìi (piang zìi)'), 'bodˋ ziiˋ (piang ziiˋ)');
assert.strictEqual(toGIP('特ià【又讀】'), '特iaˋ【又讀】');
assert.strictEqual(toGIP('só/sǒ'), 'soˊ/soˇ');
assert.strictEqual(toGIP('<ruby>sán<rt>11</rt></ruby>'), '<ruby>sanˊ<rt>11</rt></ruby>');
assert.strictEqual(toGIP(''), '');
assert.strictEqual(toGIP(null), '');
console.log('  ✅ 4. 標點註記與 HTML PASS');

// 5. 冪等：轉兩次結果一樣
for (const t of ['bòd kǒng', 'hàg gá【南】', 'ban']) {
  assert.strictEqual(toGIP(toGIP(t)), toGIP(t), t);
}
console.log('  ✅ 5. 冪等 PASS');

// 6. 顯示模式三態：pfs 淨作用四縣，gip 作用五腔
{
  const store = {};
  global.localStorage = { getItem: (k) => (k in store ? store[k] : null) };
  store.hakfaDisplayScript = 'gip';
  assert.strictEqual(pfs.getEffectiveScript('海陸'), 'gip');
  assert.strictEqual(pfs.getEffectiveScript('四縣'), 'gip');
  store.hakfaDisplayScript = 'pfs';
  assert.strictEqual(pfs.getEffectiveScript('四縣'), 'pfs');
  assert.strictEqual(pfs.getEffectiveScript('南四縣'), 'pfs');
  assert.strictEqual(pfs.getEffectiveScript('海陸'), 'hpp');
  store.hakfaDisplayScript = 'hagpin'; // 舊值
  assert.strictEqual(pfs.getEffectiveScript('四縣'), 'hpp');
  store.hakfaDisplayScript = 'hpp';
  assert.strictEqual(pfs.getEffectiveScript('四縣'), 'hpp');
  delete global.localStorage;
}
// 切換鈕循環
assert.strictEqual(pfs.nextDisplayScript('hpp'), 'pfs');
assert.strictEqual(pfs.nextDisplayScript('pfs'), 'gip');
assert.strictEqual(pfs.nextDisplayScript('gip'), 'hpp');
assert.strictEqual(pfs.nextDisplayScript('hagpin'), 'pfs');
console.log('  ✅ 6. 三態分流與循環 PASS');

// 7. 標準答案：教育部原始認證檔（官方符號寫法）。這兩個資料夾被 .gitignore 排除，找無就略過。
{
  const candidates = [
    process.env.HAKSPRING_CERT_RAW,
    path.join(__dirname, '../data/cert_113'),
    path.join(__dirname, '../../HakSpring/data/cert_113'),
  ].filter(Boolean);
  const rawDir = candidates.find((d) => fs.existsSync(d));
  const procDir = path.join(__dirname, '../data/cert');
  if (!rawDir) {
    console.log('  ⏭️  7. 找無教育部原始認證檔（data/cert_113），略過標準答案比對');
  } else {
    const parseCsv = (t) => {
      const rows = []; let f = [], c = '', q = false;
      t = t.replace(/^﻿/, '');
      for (let i = 0; i < t.length; i++) {
        const ch = t[i];
        if (q) { if (ch === '"') { if (t[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; }
        else if (ch === '"') q = true;
        else if (ch === ',') { f.push(c); c = ''; }
        else if (ch === '\n') { f.push(c); rows.push(f); f = []; c = ''; }
        else if (ch !== '\r') c += ch;
      }
      if (c || f.length) { f.push(c); rows.push(f); }
      return rows;
    };
    // 官方原檔个 ASCII ^ 正規化成 ˆ（U+02C6）再比；+ 本來就係 ASCII，毋使轉
    const norm = (s) => (s || '').replace(/\^/g, 'ˆ').normalize('NFC');
    const toks = (s) => s.replace(/[【】（）()／/,，]/g, ' ').split(/\s+/).filter(Boolean);
    let aligned = 0, tokens = 0, bad = 0;
    for (const name of fs.readdirSync(rawDir).filter((n) => /^113.*\.csv$/.test(n))) {
      if (!fs.existsSync(path.join(procDir, name))) continue;
      const raw = parseCsv(fs.readFileSync(path.join(rawDir, name), 'utf8'));
      const proc = parseCsv(fs.readFileSync(path.join(procDir, name), 'utf8'));
      const cr = raw[0].findIndex((h) => h && h.endsWith('客語標音'));
      const cp = proc[0].findIndex((h) => h && h.endsWith('客語標音'));
      const byNo = new Map(proc.slice(1).map((r) => [r[0], r]));
      for (const r of raw.slice(1)) {
        const p = byNo.get(r[0]);
        if (!p || cr < 0 || cp < 0 || r[cr] === undefined || p[cp] === undefined) continue;
        const a = toks(norm(r[cr])), b = toks(norm(toGIP(p[cp])));
        if (a.length !== b.length) continue;
        aligned++;
        for (let i = 0; i < a.length; i++) { tokens++; if (a[i] !== b[i]) bad++; }
      }
    }
    // 原始檔摎處理過个資料本身有少數人工校正差異（共約 0.05%），所以容許千分之一
    assert.ok(aligned > 30000, `對得上个列太少：${aligned}`);
    assert.ok(bad / tokens < 0.001, `與官方原檔不一致太多：${bad}/${tokens}`);
    console.log(`  ✅ 7. 標準答案比對 PASS（${aligned} 列、${tokens} 音節，差異 ${bad}）`);
  }
}

console.log('🎉 All GIP converter tests passed successfully!');
process.exit(0);
