// tests/meinung_tone_test.js
// 驗證「美濃腔」模式：四縣／南四縣个 24 調改註 ruby 33，毋做 24 觸發个變調
const assert = require('assert');
const fs = require('fs');
const path = require('path');

global.window = {
  location: { search: "" },
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
const { getSandhiHtml, getSubDialectFillKey, getSubDialectFill } = require('../main.js');

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

// 【南】變體列：括號內个 24 調乜註 ruby 33（括號內不阻斷美濃模式）
meinung = 'true';
assert.strictEqual(getSandhiHtml('láng sùi【náng sùi】', 'si'), `${r33('láng')} sùi【${r33('náng')} sùi】`);
assert.strictEqual(getSandhiHtml('í ien【í ian】', 'si'), `${r33('í')} ien【${r33('í')} ian】`);
// 南四縣、四縣（認證／教典）傳進來个腔碼攏係 si（getDialectCode）
const { getDialectCode } = require('../main.js');
for (const name of ['四縣', '北四縣', '南四縣', '南四縣（美濃）', '南四縣教典', '四', '南']) {  // 設定選單、教典顯示名實際傳進來个腔名
  assert.strictEqual(getDialectCode(name), 'si', name);
}

// 次方言補音鍵摎取值（getSubDialectFillKey／getSubDialectFill）
assert.strictEqual(getSubDialectFillKey({ sourceName: '四基', 編號: '1-3' }), '四基|1-3');
assert.strictEqual(getSubDialectFillKey({ sourceName: '四縣基礎級', 編號: '1-3' }), '四基|1-3'); // 全名也接
assert.strictEqual(getSubDialectFillKey({ sourceName: '四縣中高級', 編號: '2-1' }), '四中高|2-1');
assert.strictEqual(getSubDialectFillKey({ sourceName: '海基', 編號: '1-3' }), null);               // 非四縣
assert.strictEqual(getSubDialectFillKey({ sourceName: '四基' }), null);                              // 無編號
assert.strictEqual(getSubDialectFillKey({ sourceName: '教典四', 客家語: '冷水' }, '美'), '教典|冷水');
assert.strictEqual(getSubDialectFillKey({ sourceName: '教典南', 客家語: ' 冷水 ' }, '美'), '教典|冷水'); // 教典四、南共用鍵
assert.strictEqual(getSubDialectFillKey({ sourceName: '教典四', 客家語: '冷水' }, '南'), null);         // 教典無南附表
assert.strictEqual(getSubDialectFillKey(null), null);

window.SUB_DIALECT_FILL = { 南: { '四基|1-3': ['ngiad tién', '字級對照'] }, 美: { '四基|1-3': 'nāng sùi', '教典|冷水': 'nāng sùi' } };
const line = { sourceName: '四基', 編號: '1-3' };
meinung = 'true';
assert.deepStrictEqual(getSubDialectFill(line, '南'), { phonetic: 'ngiad tién', method: '字級對照' }); // 陣列格式
assert.deepStrictEqual(getSubDialectFill(line, '美'), { phonetic: 'nāng sùi', method: '系統規則' });   // 字串格式
assert.strictEqual(getSubDialectFill({ sourceName: '教典南', 客家語: '冷水' }, '美').phonetic, 'nāng sùi');
assert.strictEqual(getSubDialectFill({ sourceName: '四基', 編號: '9-9' }, '美'), null);               // 無這條
meinung = 'false';
assert.strictEqual(getSubDialectFill(line, '美'), null);                                             // 美濃腔關：回 null
assert.deepStrictEqual(getSubDialectFill(line, '南'), { phonetic: 'ngiad tién', method: '字級對照' }); // 南四縣不受影響
if (failed) { console.error(`\n❌ ${failed} 項失敗`); process.exit(1); }
console.log(`✨ 美濃腔 ${cases.length} 項＋其他腔、重複處理 全部 PASS`);
