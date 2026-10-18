const fs = require('fs');
const path = require('path');

const reverseToneMappingData = JSON.parse(fs.readFileSync(path.join(__dirname, '../reverse_tone_mapping.json'), 'utf8'));
global.window = {
  reverseToneMappingData: reverseToneMappingData,
  sandhiRulesData: JSON.parse(fs.readFileSync(path.join(__dirname, '../sandhi_rules.json'), 'utf8'))
};

global.document = {
  createElement: function(tag) {
    return {
      tagName: tag,
      className: '',
      textContent: '',
      innerHTML: '',
      children: [],
      appendChild: function(child) { this.children.push(child); },
      get outerHTML() {
        if (tag === 'ruby') {
          return `<ruby class="${this.className}">${this.textContent}<rt>${this.children[0].textContent}</rt></ruby>`;
        } else if (tag === 'rt') {
          return `<rt>${this.textContent}</rt>`;
        }
      }
    };
  },
  createTreeWalker: function() {
    return {
      nextNode: function() { return null; }
    };
  }
};
// PFS 顯示模式：模擬 localStorage，並掛上轉換模組
const assert = require('assert');
const pfsConverter = require('../js/pfs-converter.js');
global.window.pfsConverter = pfsConverter;
global.localStorage = {
  _v: 'pfs',
  getItem(k) { return k === 'hakfaDisplayScript' ? this._v : null; },
};

const { getSandhiHtml, getDialectCode } = require('../main.js');
const strip = (h) => h.replace(/<ruby class="sandhi-t(\d+)">(.*?)<rt>\d+<\/rt><\/ruby>/g, '[$2→$1]');

console.log('🧪 Starting PFS sandhi tests...');

// 1. 調類判斷（PFS 音節）
assert.strictEqual(pfsConverter.classifyPfsTone('sân'), '24');
assert.strictEqual(pfsConverter.classifyPfsTone('ngìn'), '11');
assert.strictEqual(pfsConverter.classifyPfsTone('súi'), '31');
assert.strictEqual(pfsConverter.classifyPfsTone('thai'), '55');
assert.strictEqual(pfsConverter.classifyPfsTone('pak'), '2');
assert.strictEqual(pfsConverter.classifyPfsTone('pha\u030dk'), '5');
assert.strictEqual(pfsConverter.classifyPfsTone('ng'), '55');
assert.strictEqual(pfsConverter.classifyPfsTone('11'), null);
assert.strictEqual(pfsConverter.classifyPfsTone('（'), null);
console.log('  ✅ 1. PFS 調類判斷 PASS');

// 2. 四縣變調（陰平後面接 24／55／5，前字變 11）在 PFS 輸入下也愛成立：先轉 PFS，再變調，結果摎 HagPinPlus 一致
const cases = [
  ['sán sán', '[sân→11]-sân'],
  ['sán tai', '[sân→11]-thai'],
  ['sán pag', '[sân→11]-pha\u030dk'],
  ['gá gá fù', '[kâ→11]-kâ-fú'],
];
for (const [hpp, expected] of cases) {
  const pfs = pfsConverter.toPFS(hpp, '四縣');
  const out = strip(getSandhiHtml(pfs, 'si')).normalize('NFC');
  assert.strictEqual(out, expected.normalize('NFC'), `${hpp} → ${pfs}`);
}
console.log('  ✅ 2. 四縣變調（PFS 輸入）PASS');

// 3. 不該變調个組合，PFS 輸入也無變調
for (const hpp of ['fù fù', 'fǔ fǔ', 'tai tai', 'sán fù', 'gá fǔ', 'bàg bàg']) {
  const pfs = pfsConverter.toPFS(hpp, '四縣');
  assert.strictEqual(getSandhiHtml(pfs, 'si'), pfs, hpp);
}
console.log('  ✅ 3. 無變調組合維持原樣 PASS');

// 4. 其他腔（大埔 da）不受 PFS 模式影響
assert.strictEqual(getDialectCode('大埔'), 'da');
console.log('  ✅ 4. 非四縣腔不受影響 PASS');

// 5. 切回 HagPinPlus 後，行為恢復成原本
global.localStorage._v = 'hagpin';
assert.strictEqual(strip(getSandhiHtml('sán sán', 'si')), '[sán→11] sán');
console.log('  ✅ 5. 切回 HPP 恢復原行為 PASS');

console.log('🎉 All PFS sandhi tests passed successfully!');
process.exit(0);
