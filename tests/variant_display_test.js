// tests/variant_display_test.js
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

// 載入 variant-parser
const { parseVariants, getLineVariants, formatSentenceVariants } = require('../js/variant-parser.js');
global.parseVariants = parseVariants;
global.getLineVariants = getLineVariants;
global.formatSentenceVariants = formatSentenceVariants;

// 建立輕量 mock DOM
function createMockElement(tag) {
  return {
    tagName: tag.toUpperCase(),
    className: '',
    textContent: '',
    innerHTML: '',
    title: '',
    style: {},
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
          }
          if (c.children && c.children.length > 0) traverse(c);
        }
      };
      traverse(this);
      return results;
    }
  };
}

global.document = {
  createElement: createMockElement,
  querySelectorAll: () => []
};

// 載入 main.js 中的 buildVariantsElement 等函式
const {
  buildVariantsElement,
  buildVariantsCompactHTML,
  getVariantAudioTitle,
  getSandhiPronunciation
} = require('../main.js');
global.buildVariantsElement = buildVariantsElement || window.buildVariantsElement;
global.buildVariantsCompactHTML = buildVariantsCompactHTML || window.buildVariantsCompactHTML;
global.getVariantAudioTitle = getVariantAudioTitle || window.getVariantAudioTitle;
global.getSandhiPronunciation = getSandhiPronunciation || window.getSandhiPronunciation;
window.getSandhiPronunciation = global.getSandhiPronunciation;

let passCount = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

console.log('--- 測試 P1-β：展示層（遊戲回饋變體展示、日日一詞主卡片變體展示、CSS） ---');

const mockVariantWord = {
  客家語: '肚屎【肚笥】',
  客語標音_顯示: 'dù sìi',
  客語標音_查詢: 'dù sìi',
  華語詞義: '肚子',
  進階華語: '肚子',
  詞性1: '名詞',
  分類: '1人體與醫療',
  progressKey: 'c四基1-23|m',
  source: 'cert',
  sourceName: '四縣初級'
};

const mockNormalWord = {
  客家語: '學校',
  客語標音_顯示: 'hog gao',
  客語標音_查詢: 'hog gao',
  華語詞義: '學校',
  進階華語: '學校',
  詞性1: '名詞',
  分類: '13藝文與教育',
  progressKey: 'c四基13-1|m',
  source: 'cert',
  sourceName: '四縣初級'
};

// 1. 遊戲回饋區邏輯模擬測試
test('遊戲回饋：含變體詞條應生成 .vocab-variants 元素且包含主音與變體', () => {
  const qVariants = getLineVariants(mockVariantWord);
  assert.strictEqual(qVariants.hasVariants, true, '詞條應判定為有變體');

  const variantsEl = global.buildVariantsElement(mockVariantWord);
  assert.ok(variantsEl, '應成功生成變體元素');
  assert.strictEqual(variantsEl.className, 'vocab-variants');

  const html = variantsEl.outerHTML;
  assert.ok(html.includes('variant-label-北'), '應包含主音北四縣標籤');
  assert.ok(html.includes('variant-label-南'), '應包含變體南四縣標籤');
  assert.ok(html.includes('肚屎'), '應包含主詞肚屎');
  assert.ok(html.includes('肚笥'), '應包含變體肚笥');
});

test('遊戲回饋：無變體詞條 buildVariantsElement 應回傳 null', () => {
  const qVariants = getLineVariants(mockNormalWord);
  assert.strictEqual(qVariants.hasVariants, false, '普通詞條應無變體');

  const variantsEl = global.buildVariantsElement(mockNormalWord);
  assert.strictEqual(variantsEl, null, '無變體詞條應回傳 null，不在回饋區額外追加元素');
});

// 2. 日日一詞主卡片渲染邏輯測試
test('日日一詞：有變體詞條主卡片應渲染 .daily-variants-wrapper 與 .vocab-variants', () => {
  const row = mockVariantWord;
  const dialect = '四';
  const rowVariants = getLineVariants(row, '四縣');

  const hasVariants = !!(rowVariants && rowVariants.hasVariants && typeof global.buildVariantsElement === 'function');
  assert.strictEqual(hasVariants, true);

  const vEl = global.buildVariantsElement(row, '四縣');
  assert.ok(vEl);
  const variantsHTML = vEl.outerHTML;

  // 模擬 daily.js 的模板組合
  const cardHTML = `
    <div class="daily-word-section">
      ${hasVariants && variantsHTML ? `
      <div class="daily-variants-wrapper">
        ${variantsHTML}
        <div class="daily-pinyin-controls"></div>
      </div>` : `
      <div class="daily-word">${rowVariants.cleanWord}</div>`}
    </div>
  `;

  assert.ok(cardHTML.includes('daily-variants-wrapper'), '應包含 daily-variants-wrapper');
  assert.ok(cardHTML.includes('vocab-variants'), '應包含 vocab-variants');
  assert.ok(cardHTML.includes('肚屎'), '應展示乾淨主詞');
  assert.ok(cardHTML.includes('肚笥'), '應展示變體詞');
  assert.strictEqual(cardHTML.includes('【'), false, '卡片不可洩漏【括號');
});

test('日日一詞：無變體詞條主卡片應維持經典 .daily-word 結構', () => {
  const row = mockNormalWord;
  const dialect = '四';
  const rowVariants = getLineVariants(row, '四縣');

  const hasVariants = !!(rowVariants && rowVariants.hasVariants && typeof global.buildVariantsElement === 'function');
  assert.strictEqual(hasVariants, false);

  const cardHTML = `
    <div class="daily-word-section">
      ${hasVariants ? `
      <div class="daily-variants-wrapper"></div>` : `
      <div class="daily-word">${rowVariants ? rowVariants.cleanWord : row['客家語']}</div>`}
    </div>
  `;

  assert.ok(cardHTML.includes('daily-word'), '應保持 daily-word 結構');
  assert.strictEqual(cardHTML.includes('daily-variants-wrapper'), false, '不應出現 daily-variants-wrapper');
  assert.ok(cardHTML.includes('學校'), '字頭應為「學校」');
});

// 3. CSS 驗證測試
test('CSS：style.css 應包含 #gameModal 與 #dailyWordModal 的 .vocab-variants 專屬樣式', () => {
  const css = fs.readFileSync(path.join(__dirname, '../style.css'), 'utf8');
  assert.ok(css.includes('#gameModal .vocab-variants'), '應有 #gameModal .vocab-variants 樣式');
  assert.ok(css.includes('#dailyWordModal .vocab-variants'), '應有 #dailyWordModal .vocab-variants 樣式');
  assert.ok(css.includes('#dailyWordModal .daily-variants-wrapper'), '應有 #dailyWordModal .daily-variants-wrapper 樣式');
  assert.ok(css.includes('@media screen and (max-width: 768px)'), '應有響應式 media query');
  assert.ok(css.includes('@media (prefers-color-scheme: dark)'), '應有暗色主題樣式');
  assert.ok(css.includes('.variant-compact'), '應有 .variant-compact 樣式');
  assert.ok(css.includes('.variant-compact-line'), '應有 .variant-compact-line 樣式');
});

// 4. buildVariantsCompactHTML 驗收案例測試（五筆詞條各測 word / phonetic / both 三種 part）
test('buildVariantsCompactHTML 案例 1：饒平中高 1-1 啞仔【啞狗】', () => {
  const rawWord = '啞仔【啞狗】';
  const rawPhonetic = 'à èr【â giêu】';
  const dialect = '饒平';

  // part: word
  const wordHTML = buildVariantsCompactHTML(rawWord, rawPhonetic, dialect, { part: 'word' });
  assert.ok(wordHTML, 'part: word 不應為 null');
  assert.ok(wordHTML.includes('variant-label-竹'), '應有竹標籤');
  assert.ok(wordHTML.includes('variant-label-卓桃'), '應有卓桃標籤');
  assert.ok(wordHTML.includes('啞仔'), '應有啞仔');
  assert.ok(wordHTML.includes('啞狗'), '應有啞狗');

  // part: phonetic
  const phoneticHTML = buildVariantsCompactHTML(rawWord, rawPhonetic, dialect, { part: 'phonetic' });
  assert.ok(phoneticHTML, 'part: phonetic 不應為 null');
  assert.ok(phoneticHTML.includes('à èr'), '應包含主音 à èr');
  assert.ok(phoneticHTML.includes('â giêu'), '應包含卓桃音 â giêu');

  // part: both
  const bothHTML = buildVariantsCompactHTML(rawWord, rawPhonetic, dialect, { part: 'both' });
  assert.ok(bothHTML, 'part: both 不應為 null');
  assert.ok(bothHTML.includes('啞仔') && bothHTML.includes('à èr'));
  assert.ok(bothHTML.includes('啞狗') && bothHTML.includes('â giêu'));
});

test('buildVariantsCompactHTML 案例 2：饒平中高 1-2 拗著（純標音變體）', () => {
  const rawWord = '拗著';
  const rawPhonetic = 'àu dò【âu dô】';
  const dialect = '饒平';

  // part: word（純標音變體，全變體漢字相同，應回傳 null 走原路）
  const wordHTML = buildVariantsCompactHTML(rawWord, rawPhonetic, dialect, { part: 'word' });
  assert.strictEqual(wordHTML, null, '純標音變體在 part: word 時應回傳 null');

  // part: phonetic
  const phoneticHTML = buildVariantsCompactHTML(rawWord, rawPhonetic, dialect, { part: 'phonetic' });
  assert.ok(phoneticHTML, 'part: phonetic 不應為 null');
  assert.ok(phoneticHTML.includes('àu dò'));
  assert.ok(phoneticHTML.includes('âu dô'));

  // part: both
  const bothHTML = buildVariantsCompactHTML(rawWord, rawPhonetic, dialect, { part: 'both' });
  assert.ok(bothHTML, 'part: both 不應為 null');
  assert.ok(bothHTML.includes('拗著') && bothHTML.includes('àu dò'));
  assert.ok(bothHTML.includes('拗著') && bothHTML.includes('âu dô'));
});

test('buildVariantsCompactHTML 案例 3：饒平中高 1-4 發牙包【生牙包／發牙包】', () => {
  const rawWord = '發牙包【生牙包／發牙包】';
  const rawPhonetic = 'bòd ngà bǎu';
  const dialect = '饒平';

  // part: word
  const wordHTML = buildVariantsCompactHTML(rawWord, rawPhonetic, dialect, { part: 'word' });
  assert.ok(wordHTML, 'part: word 不應為 null');
  assert.ok(wordHTML.includes('variant-label-竹'));
  assert.ok(wordHTML.includes('variant-label-卓'));
  assert.ok(wordHTML.includes('variant-label-桃'));
  assert.ok(wordHTML.includes('生牙包'));
  assert.ok(wordHTML.includes('發牙包'));

  // part: phonetic
  const phoneticHTML = buildVariantsCompactHTML(rawWord, rawPhonetic, dialect, { part: 'phonetic' });
  assert.ok(phoneticHTML, 'part: phonetic 不應為 null');
  assert.ok(phoneticHTML.includes('bòd ngà bǎu'));

  // part: both
  const bothHTML = buildVariantsCompactHTML(rawWord, rawPhonetic, dialect, { part: 'both' });
  assert.ok(bothHTML, 'part: both 不應為 null');
  assert.ok(bothHTML.includes('生牙包') && bothHTML.includes('bòd ngà bǎu'));
});

test('buildVariantsCompactHTML 案例 4：四縣初 13-41 籃球（純標音變體）', () => {
  const rawWord = '籃球';
  const rawPhonetic = 'lǎm kiǔ【(nǎm kiǔ)】';
  const dialect = '四縣';

  // part: word
  const wordHTML = buildVariantsCompactHTML(rawWord, rawPhonetic, dialect, { part: 'word' });
  assert.strictEqual(wordHTML, null, '純標音變體在 part: word 時應回傳 null');

  // part: phonetic
  const phoneticHTML = buildVariantsCompactHTML(rawWord, rawPhonetic, dialect, { part: 'phonetic' });
  assert.ok(phoneticHTML, 'part: phonetic 不應為 null');
  assert.ok(phoneticHTML.includes('variant-label-北'));
  assert.ok(phoneticHTML.includes('variant-label-美'));
  assert.ok(phoneticHTML.includes('lǎm kiǔ'));
  assert.ok(phoneticHTML.includes('nǎm kiǔ'));

  // part: both
  const bothHTML = buildVariantsCompactHTML(rawWord, rawPhonetic, dialect, { part: 'both' });
  assert.ok(bothHTML, 'part: both 不應為 null');
  assert.ok(bothHTML.includes('籃球') && bothHTML.includes('lǎm kiǔ'));
  assert.ok(bothHTML.includes('籃球') && bothHTML.includes('nǎm kiǔ'));
});

test('buildVariantsCompactHTML 案例 5：四縣中 8-28 裌仔【（掛裌仔）】', () => {
  const rawWord = '裌仔【（掛裌仔）】';
  const rawPhonetic = 'gàb ě【gàb è (gua gàb è)】';
  const dialect = '四縣';

  // part: word
  const wordHTML = buildVariantsCompactHTML(rawWord, rawPhonetic, dialect, { part: 'word' });
  assert.ok(wordHTML, 'part: word 不應為 null');
  assert.ok(wordHTML.includes('variant-label-北'));
  assert.ok(wordHTML.includes('variant-label-南'));
  assert.ok(wordHTML.includes('variant-label-美'));
  assert.ok(wordHTML.includes('裌仔'));
  assert.ok(wordHTML.includes('掛裌仔'));

  // part: phonetic
  const phoneticHTML = buildVariantsCompactHTML(rawWord, rawPhonetic, dialect, { part: 'phonetic' });
  assert.ok(phoneticHTML, 'part: phonetic 不應為 null');
  assert.ok(phoneticHTML.includes('gàb ě'));
  assert.ok(phoneticHTML.includes('gàb è'));
  assert.ok(phoneticHTML.includes('gua gàb è'));

  // part: both
  const bothHTML = buildVariantsCompactHTML(rawWord, rawPhonetic, dialect, { part: 'both' });
  assert.ok(bothHTML, 'part: both 不應為 null');
  assert.ok(bothHTML.includes('裌仔') && bothHTML.includes('gàb ě'));
  assert.ok(bothHTML.includes('裌仔') && bothHTML.includes('gàb è'));
  assert.ok(bothHTML.includes('掛裌仔') && bothHTML.includes('gua gàb è'));
});

// 5. 饒平變調隔離測試（只有竹變調，卓桃不變調）
test('buildVariantsCompactHTML：饒平 sandhi 隔離（僅竹變調，卓桃保留原音）', () => {
  const rawWord = '發牙包';
  const rawPhonetic = 'bòd piáng èr【pô piang/bòd piang ê】';
  const dialect = '饒平';

  const html = buildVariantsCompactHTML(rawWord, rawPhonetic, dialect, { part: 'phonetic', sandhi: true });
  assert.ok(html, '應成功生成 HTML');
  assert.ok(html.includes('variant-label-竹'));
  assert.ok(html.includes('variant-label-卓'));
  assert.ok(html.includes('variant-label-桃'));
  // 卓桃原音不被變調
  assert.ok(html.includes('pô piang'));
  assert.ok(html.includes('bòd piang ê'));
});

// 6. getVariantAudioTitle 提示文字測試
test('getVariantAudioTitle：正確輸出多方音涵蓋提示', () => {
  assert.strictEqual(getVariantAudioTitle('四縣'), '播放發音（含北四縣、南四縣）');
  assert.strictEqual(getVariantAudioTitle('四基'), '播放發音（含北四縣、南四縣）');
  assert.strictEqual(getVariantAudioTitle('四中高'), '播放發音（含北四縣、南四縣）');
  assert.strictEqual(getVariantAudioTitle('饒平'), '播放發音（含新竹、卓蘭、桃園）');
  assert.strictEqual(getVariantAudioTitle('饒基'), '播放發音（含新竹、卓蘭、桃園）');
  assert.strictEqual(getVariantAudioTitle('海陸'), '播放發音');
  assert.strictEqual(getVariantAudioTitle('大埔'), '播放發音');
});

// 7. formatSentenceVariants 例句變體彩繪標記測試
test('formatSentenceVariants：四縣例句變體詞（南四縣橘）', () => {
  const input = '阿姆（覺著）天色無好。';
  const output = formatSentenceVariants(input, '四縣');
  assert.strictEqual(output, '阿姆<span class="sentence-variant sentence-variant-南">（覺著）</span>天色無好。');
});

test('formatSentenceVariants：饒平例句雙變體詞（卓蘭紫／卓桃漸層斜線／桃園綠）', () => {
  const input = '這隻細子（生牙包／發牙包）緊哀哀叫。';
  const output = formatSentenceVariants(input, '饒平');
  assert.strictEqual(output, '這隻細子<span class="sentence-variant sentence-variant-卓">（生牙包</span><span class="sentence-variant sentence-variant-卓桃">／</span><span class="sentence-variant sentence-variant-桃">發牙包）</span>緊哀哀叫。');
});

test('formatSentenceVariants：饒平例句單變體詞（卓桃共用漸層）', () => {
  const input = '厥等喊佢做（啞狗）。';
  const output = formatSentenceVariants(input, '平中高');
  assert.strictEqual(output, '厥等喊佢做<span class="sentence-variant sentence-variant-卓桃">（啞狗）</span>。');
});

test('formatSentenceVariants：過濾排除體裁標籤（諺／山／歇／俗／童／謠）', () => {
  const input = '阿公講：（諺）人情世事陪夠夠，鍋夾布袋行透透。';
  const output = formatSentenceVariants(input, '四縣');
  assert.strictEqual(output, input, '（諺）不應被上色');
});

test('formatSentenceVariants：非四縣饒平腔調不變動', () => {
  const input = '阿姆（覺著）天色無好。';
  const output = formatSentenceVariants(input, '海陸');
  assert.strictEqual(output, input, '海陸腔應維持原樣');
});

// 8. 搜尋 <mark> 標籤與例句變體著色相容測試（R4-2 Bug 修復驗證）
test('formatSentenceVariants：保護搜尋 <mark> 標籤不被破壞（避免 </mark> 變成 <／mark>）', () => {
  const input = '恁大咧！還在該爽（爽／<mark>踐</mark>）玩具。';
  const output = formatSentenceVariants(input, '饒平');
  assert.strictEqual(
    output,
    '恁大咧！還在該爽<span class="sentence-variant sentence-variant-卓">（爽</span><span class="sentence-variant sentence-variant-卓桃">／</span><span class="sentence-variant sentence-variant-桃"><mark>踐</mark>）</span>玩具。',
    '</mark> 閉合標籤的斜線不可被誤判為變體斜線'
  );
  assert.ok(!output.includes('<／mark>'), '絕對不可出現全形斜線之 <／mark>');
});

test('highlightHtmlText：例句變體著色後反白關鍵字，標籤完全對齊不外漏', () => {
  function highlightHtmlText(html, regex) {
    if (!html || !regex) return html;
    const safeRegex = new RegExp(`(<[^>]+>)|${regex.source}`, regex.flags);
    return html.replace(safeRegex, (match, tag) => tag ? tag : `<mark>${match}</mark>`);
  }

  const rawSentence = '恁大咧！還在該爽（爽／踐）玩具。';
  const colored = formatSentenceVariants(rawSentence, '饒平');
  const highlighted = highlightHtmlText(colored, /(踐)/gi);
  assert.strictEqual(
    highlighted,
    '恁大咧！還在該爽<span class="sentence-variant sentence-variant-卓">（爽</span><span class="sentence-variant sentence-variant-卓桃">／</span><span class="sentence-variant sentence-variant-桃"><mark>踐</mark>）</span>玩具。'
  );
  assert.ok(!highlighted.includes('<／mark>'), '絕對不可出現全形斜線之 <／mark>');
});

console.log(`\n測試完成！全部 ${passCount} 項測試通過！`);
