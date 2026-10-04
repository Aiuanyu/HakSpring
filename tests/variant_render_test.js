// tests/variant_render_test.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');

// 設置全域 mock 環境
const reverseToneMappingData = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../reverse_tone_mapping.json'), 'utf8')
);
global.window = {
  reverseToneMappingData: reverseToneMappingData,
  sandhiRulesData: JSON.parse(
    fs.readFileSync(path.join(__dirname, '../sandhi_rules.json'), 'utf8')
  )
};
global.history = {};

// 引入 variant-parser，掛到 global
const { parseVariants, getLineVariants } = require('../js/variant-parser.js');
global.parseVariants = parseVariants;
global.getLineVariants = getLineVariants;

// 建立輕量 mock DOM
function createMockElement(tag) {
  return {
    tagName: tag.toUpperCase(),
    className: '',
    textContent: '',
    innerHTML: '',
    title: '',
    children: [],
    appendChild: function(child) {
      this.children.push(child);
      return child;
    },
    get outerHTML() {
      if (this.children.length > 0) {
        const inner = this.children.map(c => c.outerHTML || c.textContent || '').join('');
        return `<${tag.toLowerCase()} class="${this.className}">${this.textContent}${inner}</${tag.toLowerCase()}>`;
      }
      return `<${tag.toLowerCase()} class="${this.className}">${this.textContent || this.innerHTML}</${tag.toLowerCase()}>`;
    },
    querySelector: function(sel) {
      if (sel.startsWith('.')) {
        const cls = sel.slice(1);
        for (const c of this.children) {
          if (c.className && c.className.split(' ').includes(cls)) return c;
          if (c.querySelector) {
            const found = c.querySelector(sel);
            if (found) return found;
          }
        }
      }
      return null;
    },
    querySelectorAll: function(sel) {
      const results = [];
      const traverse = (node) => {
        for (const c of node.children) {
          if (sel.startsWith('.')) {
            const cls = sel.slice(1);
            if (c.className && c.className.split(' ').includes(cls)) results.push(c);
          } else if (c.tagName.toLowerCase() === sel.toLowerCase()) {
            results.push(c);
          }
          if (c.children) traverse(c);
        }
      };
      traverse(this);
      return results;
    }
  };
}

global.document = {
  createElement: function(tag) {
    return createMockElement(tag);
  },
  createTreeWalker: function() {
    return { nextNode: function() { return null; } };
  }
};
global.NodeFilter = { SHOW_TEXT: 4 };

// 載入 main.js 中的渲染函式
const {
  buildVariantsElement,
  renderVocabWithVariants,
  createVariantBlock,
  getVariantDialectType
} = require('../main.js');

console.log('🧪 Starting DOM variant rendering unit tests...\n');

let passedTests = 0;
function it(desc, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${desc}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${desc}`);
    console.error(err);
    process.exit(1);
  }
}

// ==========================================
// 1. 腔調識別測試
// ==========================================
console.log('--- 1. Dialect Detection ---');
it('getVariantDialectType identifies target dialects correctly', () => {
  assert.strictEqual(getVariantDialectType('四縣'), '四縣');
  assert.strictEqual(getVariantDialectType('四基'), '四縣');
  assert.strictEqual(getVariantDialectType('南四縣'), '四縣');
  assert.strictEqual(getVariantDialectType('饒平'), '饒平');
  assert.strictEqual(getVariantDialectType('平初'), '饒平');
  assert.strictEqual(getVariantDialectType('海陸'), null);
  assert.strictEqual(getVariantDialectType('大埔'), null);
  assert.strictEqual(getVariantDialectType('詔安'), null);
});

// ==========================================
// 2. 正常無變體詞條渲染測試
// ==========================================
console.log('\n--- 2. Normal Vocab Rendering (No Variants) ---');
it('Normal vocab renders a standard single ruby element', () => {
  const td = createMockElement('td');
  const line = { 客家語: '發燒', 客語標音_顯示: 'fàd séu' };
  renderVocabWithVariants(td, line, { 腔: '四縣' }, false);

  assert.strictEqual(td.children.length, 1);
  const ruby = td.children[0];
  assert.strictEqual(ruby.tagName, 'RUBY');
  assert.strictEqual(ruby.textContent, '發燒');
  assert.strictEqual(ruby.children.length, 1);
  assert.strictEqual(ruby.children[0].tagName, 'RT');
  assert.strictEqual(ruby.children[0].innerHTML, 'fàd séu');
});

// ==========================================
// 3. 變體渲染測試
// ==========================================
console.log('\n--- 3. Variant Vocab Rendering ---');
it('Pattern 1 (phoneticOnly): renders .vocab-variants with ruby.variant-ruby-phonetic-only and hidden base', () => {
  const td = createMockElement('td');
  const line = { 客家語: '著著', 客語標音_顯示: 'chog dò【cog dô】' };
  renderVocabWithVariants(td, line, { 腔: '四縣' }, false);

  assert.strictEqual(td.children.length, 1);
  const container = td.children[0];
  assert.strictEqual(container.className, 'vocab-variants');
  assert.strictEqual(container.children.length, 2);

  // 主音 (北)
  const mainBlock = container.children[0];
  assert.strictEqual(mainBlock.className, 'variant variant-main');
  const mainBadge = mainBlock.children[0];
  assert.strictEqual(mainBadge.className, 'variant-label variant-label-北');
  assert.strictEqual(mainBadge.textContent, '北');
  const mainRuby = mainBlock.children[1];
  assert.strictEqual(mainRuby.tagName, 'RUBY');
  assert.strictEqual(mainRuby.textContent, '著著');

  // 變體音 (南) -> phoneticOnly (ruby + hidden base + rt)
  const subBlock = container.children[1];
  assert.strictEqual(subBlock.className, 'variant variant-sub');
  // phoneticOnly 行：label 放入 rt 肚（rt.firstChild），ruby 係 block 个第一个子元素
  const subRuby = subBlock.children[0];
  assert.strictEqual(subRuby.tagName, 'RUBY');
  assert.strictEqual(subRuby.className, 'variant-ruby-phonetic-only');
  assert.strictEqual(subRuby.children[0].className, 'variant-hidden-base');
  assert.strictEqual(subRuby.children[0].textContent, '著著');
  assert.strictEqual(subRuby.children[1].tagName, 'RT');
  assert.strictEqual(
    subRuby.children[1].innerHTML,
    '<span class="variant-label variant-label-南">南</span>cog dô'
  );
});

it('Pattern 2 (word + phonetic variants): Raoping dual variants', () => {
  const td = createMockElement('td');
  const line = {
    客家語: '發病仔【破病／發病仔】',
    客語標音_顯示: 'bòd piáng èr【pô piang/bòd piang ê】'
  };
  renderVocabWithVariants(td, line, { 腔: '饒平' }, false);

  const container = td.children[0];
  assert.strictEqual(container.children.length, 3);

  // 主音 (竹)
  assert.strictEqual(container.children[0].children[0].textContent, '竹');
  assert.strictEqual(container.children[0].children[1].textContent, '發病仔');

  // 變體 1 (卓)
  assert.strictEqual(container.children[1].children[0].textContent, '卓');
  assert.strictEqual(container.children[1].children[1].textContent, '破病');

  // 變體 2 (桃)
  assert.strictEqual(container.children[2].children[0].textContent, '桃');
  assert.strictEqual(container.children[2].children[1].textContent, '發病仔');
});

it('Pattern 5 (Meinong): Sixian with Meinong variant', () => {
  const td = createMockElement('td');
  const line = {
    客家語: '阿姆【（唔媽）】',
    客語標音_顯示: 'á mé【(m mà)】'
  };
  renderVocabWithVariants(td, line, { 腔: '四縣' }, false);

  const container = td.children[0];
  assert.strictEqual(container.children.length, 2);

  // 主音 (北)
  assert.strictEqual(container.children[0].children[0].textContent, '北');
  assert.strictEqual(container.children[0].children[1].textContent, '阿姆');

  // 變體 (美)
  assert.strictEqual(container.children[1].children[0].textContent, '美');
  assert.strictEqual(container.children[1].children[1].textContent, '唔媽');
});

it('Search highlight properly replaces word inside ruby in variants', () => {
  const td = createMockElement('td');
  const line = {
    客家語: '發病仔【破病／發病仔】',
    客語標音_顯示: 'bòd piáng èr【pô piang/bòd piang ê】'
  };
  const highlightRegex = /(病)/g;
  renderVocabWithVariants(td, line, '饒平', false, {
    highlightWord: true,
    highlightRegex: highlightRegex
  });

  const container = td.children[0];
  // 主音含 mark
  assert.ok(container.children[0].children[1].innerHTML.includes('<mark>病</mark>'));
  // 卓蘭「破病」含 mark
  assert.ok(container.children[1].children[1].innerHTML.includes('<mark>病</mark>'));
  // 桃園「發病仔」含 mark
  assert.ok(container.children[2].children[1].innerHTML.includes('<mark>病</mark>'));
});

it('GIP (教典) data ignores brackets and preserves original single ruby', () => {
  const td = createMockElement('td');
  const line = { 客家語: '特殊詞【特】', 客語標音_顯示: 'teed' };
  renderVocabWithVariants(td, line, { 腔: '四縣' }, /* isGipData */ true);

  assert.strictEqual(td.children.length, 1);
  assert.strictEqual(td.children[0].tagName, 'RUBY');
  assert.strictEqual(td.children[0].textContent, '特殊詞【特】');
});

it('Raoping: main variant (新竹) has sandhi, while sub-variants (卓/桃) bypass sandhi', () => {
  const td = createMockElement('td');
  // sà sǎ 觸發饒平 53+11->33 變調
  const line = {
    客家語: '測試【測試／測試】',
    客語標音_顯示: 'sà sǎ【sà sǎ/sà sǎ】'
  };
  renderVocabWithVariants(td, line, { 腔: '饒平' }, false);

  const container = td.children[0];
  const mainRt = container.children[0].children[1].children[0]; // main rt
  const zhuoRt = container.children[1].children[1].children[0]; // zhuo rt
  const taoRt = container.children[2].children[1].children[0]; // tao rt

  // 新竹 (main) 有套用 sandhi
  assert.ok(mainRt.innerHTML.includes('sandhi-t33'), 'Main (Hsinchu) should apply sandhi');
  // 卓蘭 (sub) 未套用 sandhi
  assert.ok(!zhuoRt.innerHTML.includes('sandhi-t33'), 'Zhuolan should not apply sandhi');
  assert.strictEqual(zhuoRt.innerHTML, 'sà sǎ');
  // 桃園 (sub) 未套用 sandhi
  assert.ok(!taoRt.innerHTML.includes('sandhi-t33'), 'Taoyuan should not apply sandhi');
  assert.strictEqual(taoRt.innerHTML, 'sà sǎ');
});

// ==========================================
// 4. buildVariantsElement 測試 (P1-0)
// ==========================================
console.log('--- 4. buildVariantsElement (P1-0) ---');

it('buildVariantsElement returns .vocab-variants element when variants exist', () => {
  const line = {
    '客家語': '醫院',
    '客語標音_顯示': 'í ien【í ian】',
    sourceName: '四縣基礎級',
    sourceType: 'cert'
  };
  const el = buildVariantsElement(line, '四縣', false);
  assert.ok(el, 'Should return an element');
  assert.strictEqual(el.className, 'vocab-variants');
  assert.strictEqual(el.children.length, 2); // main + nan
  assert.strictEqual(el.children[0].className, 'variant variant-main');
  assert.strictEqual(el.children[1].className, 'variant variant-sub');
});

it('buildVariantsElement returns null when no variants exist', () => {
  const line = {
    '客家語': '發燒',
    '客語標音_顯示': 'fàd séu',
    sourceName: '四縣基礎級',
    sourceType: 'cert'
  };
  const el = buildVariantsElement(line, '四縣', false);
  assert.strictEqual(el, null);
});

it('buildVariantsElement returns null for GIP (教典) data', () => {
  const line = {
    '客家語': '包包㘝㘝【測試】',
    '客語標音_顯示': 'báu báu ngiàb ngiàb【ce sii】',
    sourceName: '教典四',
    sourceType: 'gip'
  };
  const el = buildVariantsElement(line, '四縣', true);
  assert.strictEqual(el, null);
});

it('buildVariantsElement works without explicit dialectName using line information', () => {
  const line = {
    '客家語': '啞仔【啞狗】',
    '客語標音_顯示': 'à èr【â giêu】',
    sourceName: '饒平中高級',
    sourceType: 'cert'
  };
  const el = buildVariantsElement(line);
  assert.ok(el);
  assert.strictEqual(el.className, 'vocab-variants');
  assert.strictEqual(el.children.length, 2); // main (竹) + sub (卓桃)
});

console.log(`\n🎉 All ${passedTests} DOM rendering tests passed cleanly!\n`);

