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
// GIP（教育部客拼）顯示模式下，變調標註仍要正確
const assert = require('assert');
const pfsConverter = require('../js/pfs-converter.js');
const gipConverter = require('../js/gip-converter.js');
global.window.pfsConverter = pfsConverter;
global.window.gipConverter = gipConverter;
global.localStorage = {
  _v: 'gip',
  getItem(k) { return k === 'hakfaDisplayScript' ? this._v : null; },
};

const { getSandhiHtml, classifyTone } = require('../main.js');
const strip = (h) => h.replace(/<ruby class="sandhi-t(\d+)">(.*?)<rt>\d+<\/rt><\/ruby>/g, '[$2→$1]');

console.log('🧪 Starting GIP sandhi tests...');

// 1. 調類判斷：GIP 符號貼在音節後面；入聲靠韻尾 b／d／g 判斷（四縣上聲 31 摎陰入 2 符號都係 ˋ）
assert.strictEqual(classifyTone('sanˊ', 'si'), '24');
assert.strictEqual(classifyTone('sanˋ', 'si'), '31');
assert.strictEqual(classifyTone('badˋ', 'si'), '2');
assert.strictEqual(classifyTone('badˋ'.replace('ˋ', ''), 'si'), '5');
assert.strictEqual(classifyTone('benˇ', 'si'), '11');
assert.strictEqual(classifyTone('tai', 'si'), '55');
// 大埔：^（ASCII）、ˆ（U+02C6）係折音 31，+（ASCII）、˖（U+02D6）係長音 33
assert.strictEqual(classifyTone('sam^', 'da'), classifyTone('sam\u02C6', 'da'));
assert.strictEqual(classifyTone('sam+', 'da'), classifyTone('sam\u02D6', 'da'));
console.log('  ✅ 1. GIP 調類判斷 PASS');

// 2. 四縣變調（陰平後面接 24／55／5，前字變 11）在 GIP 輸入下也成立
const cases = [
  ['sán sán', '[sanˊ→11] sanˊ'],
  ['sán tai', '[sanˊ→11] tai'],
  ['sán pag', '[sanˊ→11] pag'],
  ['gá gá fù', '[gaˊ→11] gaˊ fuˋ'],
];
for (const [hpp, expected] of cases) {
  const gip = gipConverter.toGIP(hpp);
  assert.strictEqual(strip(getSandhiHtml(gip, 'si')), expected, `${hpp} → ${gip}`);
}
console.log('  ✅ 2. 四縣變調（GIP 輸入）PASS');

// 3. 不該變調个組合，GIP 輸入也無變調
for (const hpp of ['fù fù', 'fǔ fǔ', 'tai tai', 'sán fù', 'bàg bàg']) {
  const gip = gipConverter.toGIP(hpp);
  assert.strictEqual(getSandhiHtml(gip, 'si'), gip, hpp);
}
console.log('  ✅ 3. 無變調組合維持原樣 PASS');

// 4. 結果同 HPP 模式一致：同一組詞，HPP 有變調，GIP 也有變調，且變調後个調值數字相同
global.localStorage._v = 'hpp';
const hppOut = getSandhiHtml('sán sán', 'si');
global.localStorage._v = 'gip';
const gipOut = getSandhiHtml(gipConverter.toGIP('sán sán'), 'si');
assert.strictEqual((hppOut.match(/<rt>(\d+)<\/rt>/) || [])[1], (gipOut.match(/<rt>(\d+)<\/rt>/) || [])[1]);
console.log('  ✅ 4. 與 HPP 模式調值一致 PASS');

console.log('🎉 All GIP sandhi tests passed successfully!');
process.exit(0);
