// tests/meinung_tone_test.js
// 驗證「美濃腔」模式：四縣／南四縣个 24 調改註 ruby 33，毋做 24 觸發个變調
const assert = require('assert');
const fs = require('fs');
const path = require('path');

global.window = {
  reverseToneMappingData: JSON.parse(fs.readFileSync(path.join(__dirname, '../reverse_tone_mapping.json'), 'utf8')),
  sandhiRulesData: JSON.parse(fs.readFileSync(path.join(__dirname, '../sandhi_rules.json'), 'utf8')),
};
let meinung = 'false';
global.localStorage = { getItem: (k) => (k === 'showMeinungFill' ? meinung : null) };
global.document = {
  createElement: (tag) => ({
    tagName: tag, className: '', textContent: '', innerHTML: '', children: [],
    appendChild(child) { this.children.push(child); },
    get outerHTML() {
      return tag === 'ruby'
        ? `<ruby class="${this.className}">${this.textContent}<rt>${this.children[0].textContent}</rt></ruby>`
        : `<rt>${this.textContent}</rt>`;
    },
  }),
  createTreeWalker: () => ({ nextNode: () => null }),
};
global.NodeFilter = { SHOW_TEXT: 4 };
const { getSandhiHtml } = require('../main.js');

const r33 = (s) => `<ruby class="sandhi-t33">${s}<rt>33</rt></ruby>`;
const r11 = (s) => `<ruby class="sandhi-t11">${s}<rt>11</rt></ruby>`;
const cases = [
  // [標音, 美濃關閉, 美濃開, 說明]
  ['sán sán', `${r11('sán')} sán`, `${r33('sán')} ${r33('sán')}`, '24+24：原本前字變 11；美濃兩字攏註 33、毋變調'],
  ['sán san', `${r11('sán')} san`, `${r33('sán')} san`, '24+55'],
  ['gié sán', null, `${r33('gié')} ${r33('sán')}`, '兩字攏 24'],
  ['gá', 'gá', r33('gá'), '單音節（無後字）24 乜愛註'],
  ['hàg gá', null, `hàg ${r33('gá')}`, '詞尾 24；入聲 hàg 毋動'],
  ['sān sǎ', 'sān sǎ', 'sān sǎ', '無 24：原樣'],
  ['bòd zìi (piang zìi)', 'bòd zìi (piang zìi)', 'bòd zìi (piang zìi)', '無 24：原樣（括號）'],
  ['nāng sùi', 'nāng sùi', 'nāng sùi', '推導个美濃音（已經 33）：毋重複註'],
  ['sán、sán', null, `${r33('sán')}、${r33('sán')}`, '頓號隔開：各自註 ruby'],
];
let failed = 0;
for (const [pair, off, on, desc] of cases) {
  meinung = 'false';
  if (off !== null && getSandhiHtml(pair, 'si') !== off) { failed++; console.error(`❌ 關：${desc}\n  ${getSandhiHtml(pair, 'si')}\n  ≠ ${off}`); }
  meinung = 'true';
  const got = getSandhiHtml(pair, 'si');
  if (got !== on) { failed++; console.error(`❌ 開：${desc}\n  ${got}\n  ≠ ${on}`); }
}
// 美濃模式只管四縣；其他腔照舊變調
meinung = 'true';
assert.strictEqual(getSandhiHtml('sán san', 'ha'), `${r33('sán')} san`); // 海陸 24+55→33 照舊
assert.strictEqual(getSandhiHtml('sān sǎ', 'da'), '<ruby class="sandhi-t35">sān<rt>35</rt></ruby> sǎ');
// 已經有變調 ruby 个，毋重複處理
meinung = 'true';
const once = getSandhiHtml('sán', 'si');
assert.strictEqual(getSandhiHtml(once, 'si'), once);
if (failed) { console.error(`\n❌ ${failed} 項失敗`); process.exit(1); }
console.log(`✨ 美濃腔 ${cases.length} 項＋其他腔、重複處理 全部 PASS`);
