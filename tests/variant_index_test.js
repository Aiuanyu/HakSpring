// tests/variant_index_test.js
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
    style: {},
    children: [],
    appendChild: function(child) {
      this.children.push(child);
      return child;
    }
  };
}

global.document = {
  createElement: createMockElement,
  querySelectorAll: () => []
};

// 載入 main.js 中的相關函式
const {
  getRomanizerModeInfo,
  resolveReadingForMode,
  getVariantAudioTitle,
  getSandhiPronunciation,
  formatPhoneticForDisplay
} = require('../main.js');

let passCount = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(err);
    process.exit(1);
  }
}

console.log('--- 測試 P1-γ：Romanizer 9 模式與索引建置 ---');

// ----------------------------------------------------
// 1. getRomanizerModeInfo 模式對應測試
// ----------------------------------------------------
test('getRomanizerModeInfo：9 大模式資訊正確對應', () => {
  const m1 = getRomanizerModeInfo('北四縣');
  assert.strictEqual(m1.baseDialect, '四縣');
  assert.deepStrictEqual(m1.pickChain, [['北']]);

  const m2 = getRomanizerModeInfo('南四縣');
  assert.strictEqual(m2.baseDialect, '南四縣');
  assert.deepStrictEqual(m2.pickChain, [['南']]);

  const m3 = getRomanizerModeInfo('南四縣（美濃）');
  assert.strictEqual(m3.baseDialect, '南四縣');
  assert.deepStrictEqual(m3.pickChain, [['美'], ['南']]);

  const m4 = getRomanizerModeInfo('海陸');
  assert.strictEqual(m4.baseDialect, '海陸');
  assert.strictEqual(m4.pickChain, null);

  const m5 = getRomanizerModeInfo('大埔');
  assert.strictEqual(m5.baseDialect, '大埔');
  assert.strictEqual(m5.pickChain, null);

  const m6 = getRomanizerModeInfo('饒平（新竹）');
  assert.strictEqual(m6.baseDialect, '饒平');
  assert.deepStrictEqual(m6.pickChain, [['竹']]);

  const m7 = getRomanizerModeInfo('饒平（卓蘭）');
  assert.strictEqual(m7.baseDialect, '饒平');
  assert.deepStrictEqual(m7.pickChain, [['卓', '卓桃']]);

  const m8 = getRomanizerModeInfo('饒平（桃園）');
  assert.strictEqual(m8.baseDialect, '饒平');
  assert.deepStrictEqual(m8.pickChain, [['桃', '卓桃']]);

  const m9 = getRomanizerModeInfo('詔安');
  assert.strictEqual(m9.baseDialect, '詔安');
  assert.strictEqual(m9.pickChain, null);

  // 未知或預設
  const fallback = getRomanizerModeInfo('其他腔');
  assert.strictEqual(fallback.baseDialect, '其他腔');
  assert.strictEqual(fallback.pickChain, null);
});

// ----------------------------------------------------
// 2. 模擬 preprocessAllData 索引建置與 multi-key 測試
// ----------------------------------------------------
function mockIndexRow(line, sourceName, isGipData, dataVarName, cache) {
  const rawTerm = line.客家語 ? line.客家語.trim() : null;
  if (!rawTerm || rawTerm.length === 0) return;
  const v = typeof getLineVariants === 'function'
    ? getLineVariants({ ...line, sourceName, sourceType: isGipData ? 'gip' : 'cert' })
    : null;
  const hasV = v && v.hasVariants;
  const formattedMainPhonetic = formatPhoneticForDisplay(
    hasV ? v.main.phonetic : line['客語標音_顯示'],
    isGipData
  );
  const entry = {
    pronunciation: formattedMainPhonetic,
    source: sourceName,
    isExactMatch: true,
    originalTerm: hasV ? v.main.word : rawTerm,
    mandarinMeaning: line.華語詞義,
    audioDetails: {
      lineData: { ...line },
      fullSourceName: isGipData ? 'gip' : 'cert' + dataVarName,
    },
    variantType: hasV ? v.dialectType : null,
    mainVariant: hasV ? { ...v.main, phonetic: formattedMainPhonetic } : null,
    variants: hasV
      ? v.variants.map((x) => ({
          ...x,
          phonetic: formatPhoneticForDisplay(x.phonetic, false),
        }))
      : null,
  };
  const keys = new Set([
    entry.originalTerm,
    ...(entry.variants || []).filter((x) => x.word).map((x) => x.word),
  ]);
  keys.forEach((k) => {
    if (k && k.length > 0) {
      if (!cache[k]) cache[k] = [];
      cache[k].push(entry);
    }
  });
  return entry;
}

test('preprocessAllData：變體詞條多鍵索引（主詞 + 各變體詞）且無【】污染', () => {
  const cache = {};
  // 饒平中高 1-1: 啞仔【啞狗】 / à èr【â giêu】
  const line1 = { 客家語: '啞仔【啞狗】', 客語標音_顯示: 'à èr【â giêu】', 華語詞義: '啞巴' };
  const entry1 = mockIndexRow(line1, '饒平中高級', false, '饒中高', cache);

  assert.strictEqual(entry1.originalTerm, '啞仔');
  assert.strictEqual(entry1.pronunciation, 'à èr');
  assert.strictEqual(entry1.variantType, '饒平');
  assert.strictEqual(entry1.mainVariant.label, '竹');
  assert.strictEqual(entry1.variants.length, 1);
  assert.strictEqual(entry1.variants[0].label, '卓桃');
  assert.strictEqual(entry1.variants[0].word, '啞狗');
  assert.strictEqual(entry1.variants[0].phonetic, 'â giêu');

  // 驗證 key 包含「啞仔」與「啞狗」，但絕不包含含【】的原始字串
  assert.ok(cache['啞仔'], 'cache 應包含「啞仔」key');
  assert.ok(cache['啞狗'], 'cache 應包含「啞狗」key');
  assert.strictEqual(cache['啞仔【啞狗】'], undefined, 'cache 不應含有括號之原始 key');
  assert.strictEqual(cache['啞仔'][0], entry1);
  assert.strictEqual(cache['啞狗'][0], entry1);

  // 純標音變體：拗著 / àu dò【âu dô】
  const line2 = { 客家語: '拗著', 客語標音_顯示: 'àu dò【âu dô】', 華語詞義: '折斷' };
  const entry2 = mockIndexRow(line2, '饒平中高級', false, '饒中高', cache);
  assert.strictEqual(entry2.originalTerm, '拗著');
  assert.strictEqual(entry2.pronunciation, 'àu dò');
  assert.ok(cache['拗著']);
  assert.strictEqual(Object.keys(cache).filter(k => k.includes('【')).length, 0);
});

// ----------------------------------------------------
// 3. resolveReadingForMode 驗收案例全測
// ----------------------------------------------------
test('案例 1：饒平中高 1-1 啞仔【啞狗】 / à èr【â giêu】', () => {
  const line = { 客家語: '啞仔【啞狗】', 客語標音_顯示: 'à èr【â giêu】', 華語詞義: '啞巴' };
  const entry = mockIndexRow(line, '饒平中高級', false, '饒中高', {});

  // 1a: 新竹模式搜「啞仔」→ à èr（竹）
  const infoHsinchu = getRomanizerModeInfo('饒平（新竹）');
  const res1a = resolveReadingForMode(entry, infoHsinchu.pickChain, '啞仔');
  assert.strictEqual(res1a.length, 1);
  assert.strictEqual(res1a[0].pronunciation, 'à èr');
  assert.strictEqual(res1a[0].resolvedLabel, '竹');
  assert.strictEqual(res1a[0].originalTerm, '啞仔');
  assert.strictEqual(res1a[0].inherited, false);

  // 1b: 卓蘭模式搜「啞狗」→ â giêu（卓桃）
  const infoZhuolan = getRomanizerModeInfo('饒平（卓蘭）');
  const res1b = resolveReadingForMode(entry, infoZhuolan.pickChain, '啞狗');
  assert.strictEqual(res1b.length, 1);
  assert.strictEqual(res1b[0].pronunciation, 'â giêu');
  assert.strictEqual(res1b[0].resolvedLabel, '卓桃');
  assert.strictEqual(res1b[0].originalTerm, '啞狗');

  // 1c: 桃園模式搜「啞仔」→ 無（因為桃園變體字為「啞狗」，不含「啞仔」）
  const infoTaoyuan = getRomanizerModeInfo('饒平（桃園）');
  const res1c = resolveReadingForMode(entry, infoTaoyuan.pickChain, '啞仔');
  assert.strictEqual(res1c.length, 0);

  // 1d: 新竹模式搜「啞狗」→ 無（新竹主音為「啞仔」，不含「啞狗」）
  const res1d = resolveReadingForMode(entry, infoHsinchu.pickChain, '啞狗');
  assert.strictEqual(res1d.length, 0);
});

test('案例 2：饒平中高 1-2 拗著 / àu dò【âu dô】（純標音變體）', () => {
  const line = { 客家語: '拗著', 客語標音_顯示: 'àu dò【âu dô】', 華語詞義: '折斷' };
  const entry = mockIndexRow(line, '饒平中高級', false, '饒中高', {});

  // 卓蘭搜「拗著」→ âu dô（卓桃，無括號）
  const infoZhuolan = getRomanizerModeInfo('饒平（卓蘭）');
  const res2a = resolveReadingForMode(entry, infoZhuolan.pickChain, '拗著');
  assert.strictEqual(res2a.length, 1);
  assert.strictEqual(res2a[0].pronunciation, 'âu dô');
  assert.strictEqual(res2a[0].resolvedLabel, '卓桃');
  assert.ok(!res2a[0].pronunciation.includes('【'));
  assert.ok(!res2a[0].pronunciation.includes('】'));

  // 新竹搜「拗著」→ àu dò（竹）
  const infoHsinchu = getRomanizerModeInfo('饒平（新竹）');
  const res2b = resolveReadingForMode(entry, infoHsinchu.pickChain, '拗著');
  assert.strictEqual(res2b.length, 1);
  assert.strictEqual(res2b[0].pronunciation, 'àu dò');
  assert.strictEqual(res2b[0].resolvedLabel, '竹');
});

test('案例 3：饒平中高 1-4 發牙包【生牙包／發牙包】', () => {
  const line = {
    客家語: '發牙包【生牙包／發牙包】',
    客語標音_顯示: 'bòd nga bǎu【sǎng ngà bǎu／bòd ngà bǎu】',
    華語詞義: '長牙'
  };
  const entry = mockIndexRow(line, '饒平中高級', false, '饒中高', {});

  // 桃園搜「發牙包」→ bòd ngà bǎu (桃)
  const infoTaoyuan = getRomanizerModeInfo('饒平（桃園）');
  const res3a = resolveReadingForMode(entry, infoTaoyuan.pickChain, '發牙包');
  assert.strictEqual(res3a.length, 1);
  assert.strictEqual(res3a[0].pronunciation, 'bòd ngà bǎu');
  assert.strictEqual(res3a[0].resolvedLabel, '桃');

  // 卓蘭搜「發牙包」→ 0 筆（卓蘭用字為「生牙包」）
  const infoZhuolan = getRomanizerModeInfo('饒平（卓蘭）');
  const res3b = resolveReadingForMode(entry, infoZhuolan.pickChain, '發牙包');
  assert.strictEqual(res3b.length, 0);

  // 卓蘭搜「生牙包」→ sǎng ngà bǎu (卓)
  const res3c = resolveReadingForMode(entry, infoZhuolan.pickChain, '生牙包');
  assert.strictEqual(res3c.length, 1);
  assert.strictEqual(res3c[0].pronunciation, 'sǎng ngà bǎu');
  assert.strictEqual(res3c[0].resolvedLabel, '卓');
});

test('案例 4：四縣中高 1-1 啞仔【啞眵】 / à ě【à zíi】', () => {
  const line = { 客家語: '啞仔【啞眵】', 客語標音_顯示: 'à ě【à zíi】', 華語詞義: '啞巴' };
  const entry = mockIndexRow(line, '四縣中高級', false, '四中高', {});

  // 南四縣搜「啞眵」→ à zíi (南)
  const infoSouth = getRomanizerModeInfo('南四縣');
  const res4a = resolveReadingForMode(entry, infoSouth.pickChain, '啞眵');
  assert.strictEqual(res4a.length, 1);
  assert.strictEqual(res4a[0].pronunciation, 'à zíi');
  assert.strictEqual(res4a[0].resolvedLabel, '南');

  // 北四縣搜「啞仔」→ à ě (北)
  const infoNorth = getRomanizerModeInfo('北四縣');
  const res4b = resolveReadingForMode(entry, infoNorth.pickChain, '啞仔');
  assert.strictEqual(res4b.length, 1);
  assert.strictEqual(res4b[0].pronunciation, 'à ě');
  assert.strictEqual(res4b[0].resolvedLabel, '北');
});

test('案例 5：四縣中高 1-6 跛腳仔 / bái giòg ě【bái giòg è】', () => {
  const line = { 客家語: '跛腳仔', 客語標音_顯示: 'bái giòg ě【bái giòg è】', 華語詞義: '跛子' };
  const entry = mockIndexRow(line, '四縣中高級', false, '四中高', {});

  // 南四縣搜「跛腳仔」→ bái giòg è
  const infoSouth = getRomanizerModeInfo('南四縣');
  const res5a = resolveReadingForMode(entry, infoSouth.pickChain, '跛腳仔');
  assert.strictEqual(res5a.length, 1);
  assert.strictEqual(res5a[0].pronunciation, 'bái giòg è');
  assert.strictEqual(res5a[0].resolvedLabel, '南');

  // 北四縣搜「跛腳仔」→ bái giòg ě
  const infoNorth = getRomanizerModeInfo('北四縣');
  const res5b = resolveReadingForMode(entry, infoNorth.pickChain, '跛腳仔');
  assert.strictEqual(res5b.length, 1);
  assert.strictEqual(res5b[0].pronunciation, 'bái giòg ě');
  assert.strictEqual(res5b[0].resolvedLabel, '北');
});

test('案例 6：四縣初 13-41 籃球 / lǎm kiǔ【(nǎm kiǔ)】（美濃雙層繼承）', () => {
  const line = { 客家語: '籃球', 客語標音_顯示: 'lǎm kiǔ【(nǎm kiǔ)】', 華語詞義: '籃球' };
  const entry = mockIndexRow(line, '四縣初級', false, '四初', {});

  // 南四縣模式（pickChain: [['南']]）：無南變體，繼承主音 (北)，標記 inherited: true
  const infoSouth = getRomanizerModeInfo('南四縣');
  const res6a = resolveReadingForMode(entry, infoSouth.pickChain, '籃球');
  assert.strictEqual(res6a.length, 1);
  assert.strictEqual(res6a[0].pronunciation, 'lǎm kiǔ');
  assert.strictEqual(res6a[0].resolvedLabel, '北');
  assert.strictEqual(res6a[0].inherited, true);

  // 南四縣（美濃）模式（pickChain: [['美'], ['南']]）：美濃命中，取 nǎm kiǔ，inherited: false
  const infoMeinong = getRomanizerModeInfo('南四縣（美濃）');
  const res6b = resolveReadingForMode(entry, infoMeinong.pickChain, '籃球');
  assert.strictEqual(res6b.length, 1);
  assert.strictEqual(res6b[0].pronunciation, 'nǎm kiǔ');
  assert.strictEqual(res6b[0].resolvedLabel, '美');
  assert.strictEqual(res6b[0].inherited, false);
});

test('案例 7：四縣中 8-28 裌仔【（掛裌仔）】 / gàb ě【gàb è (gua gàb è)】', () => {
  const line = {
    客家語: '裌仔【（掛裌仔）】',
    客語標音_顯示: 'gàb ě【gàb è (gua gàb è)】',
    華語詞義: '背心'
  };
  const entry = mockIndexRow(line, '四縣中級', false, '四中', {});

  // 南四縣搜「裌仔」→ gàb è (南)
  const infoSouth = getRomanizerModeInfo('南四縣');
  const res7a = resolveReadingForMode(entry, infoSouth.pickChain, '裌仔');
  assert.strictEqual(res7a.length, 1);
  assert.strictEqual(res7a[0].pronunciation, 'gàb è');
  assert.strictEqual(res7a[0].resolvedLabel, '南');

  // 美濃搜「裌仔」→ gua gàb è (美，美群組先命中，不再列南)
  const infoMeinong = getRomanizerModeInfo('南四縣（美濃）');
  const res7b = resolveReadingForMode(entry, infoMeinong.pickChain, '裌仔');
  assert.strictEqual(res7b.length, 1);
  assert.strictEqual(res7b[0].pronunciation, 'gua gàb è');
  assert.strictEqual(res7b[0].resolvedLabel, '美');
  assert.strictEqual(res7b[0].originalTerm, '掛裌仔');
});

test('案例 8：無變體詞條（海陸、教典或普通詞）回傳原樣', () => {
  const line = { 客家語: '食飯', 客語標音_顯示: 'shid pon', 華語詞義: '吃飯' };
  const entry = mockIndexRow(line, '海陸高級', false, '海高', {});

  const infoHsinchu = getRomanizerModeInfo('饒平（新竹）');
  const res = resolveReadingForMode(entry, infoHsinchu.pickChain, '食飯');
  assert.strictEqual(res.length, 1);
  assert.strictEqual(res[0].pronunciation, 'shid pon');
  assert.strictEqual(res[0].originalTerm, '食飯');
});

// ----------------------------------------------------
// 4. 地區平等機制（主表選字彈窗以選取詞為主體之對稱顯示）
// ----------------------------------------------------
function renderPopupStackedLinesHelper(reading, selectedText) {
  const allWords = [
    reading.mainVariant.word || reading.originalTerm,
    ...reading.variants.map((v) => v.word || reading.mainVariant.word || reading.originalTerm),
  ];
  const trimmedSelected = (selectedText || '').trim();
  let baseWord = reading.mainVariant.word || reading.originalTerm;
  if (trimmedSelected) {
    const matchedWord = allWords.find((w) => w === trimmedSelected || w.includes(trimmedSelected));
    if (matchedWord) baseWord = matchedWord;
  }

  const mainWord = reading.mainVariant.word || reading.originalTerm;
  const mainDiff = mainWord !== baseWord ? mainWord : '';

  const subLines = reading.variants.map((v) => {
    const vWord = v.word || reading.mainVariant.word || reading.originalTerm;
    const subDiff = vWord !== baseWord ? vWord : '';
    return { label: v.label, diffWord: subDiff };
  });

  return {
    baseWord,
    mainLine: { label: reading.mainVariant.label, diffWord: mainDiff },
    subLines
  };
}

test('案例 9：地區平等機制（四縣 茶箍 vs 番鹼 二元對換）', () => {
  const line = { 客家語: '茶箍【番鹼】', 客語標音_顯示: 'cǎ gú【fān giǎn】', 華語詞義: '肥皂' };
  const entry = mockIndexRow(line, '四縣中高級', false, '四中高', {});

  // 9a: 選取「茶箍」時：以茶箍為主體，北四縣不標字，南四縣標「番鹼」
  const res9a = renderPopupStackedLinesHelper(entry, '茶箍');
  assert.strictEqual(res9a.baseWord, '茶箍');
  assert.strictEqual(res9a.mainLine.diffWord, '');
  assert.strictEqual(res9a.subLines[0].diffWord, '番鹼');

  // 9b: 選取「番鹼」時：以番鹼為主體，南四縣不標字，反而是北四縣標「茶箍」！
  const res9b = renderPopupStackedLinesHelper(entry, '番鹼');
  assert.strictEqual(res9b.baseWord, '番鹼');
  assert.strictEqual(res9b.mainLine.diffWord, '茶箍');
  assert.strictEqual(res9b.subLines[0].diffWord, '');
});

test('案例 10：地區平等機制（饒平 發牙包 vs 生牙包 三元對換）', () => {
  const line = {
    客家語: '發牙包【生牙包／發牙包】',
    客語標音_顯示: 'bòd nga bǎu【sǎng ngà bǎu／bòd ngà bǎu】',
    華語詞義: '長牙'
  };
  const entry = mockIndexRow(line, '饒平中高級', false, '饒中高', {});

  // 10a: 選取「生牙包」時：以卓蘭「生牙包」為主體，卓蘭不標字，新竹與桃園標「發牙包」！
  const res10a = renderPopupStackedLinesHelper(entry, '生牙包');
  assert.strictEqual(res10a.baseWord, '生牙包');
  assert.strictEqual(res10a.mainLine.diffWord, '發牙包'); // 竹
  assert.strictEqual(res10a.subLines[0].diffWord, ''); // 卓 (生牙包，同主體)
  assert.strictEqual(res10a.subLines[1].diffWord, '發牙包'); // 桃

  // 10b: 選取「發牙包」時：以新竹/桃園「發牙包」為主體，竹桃不標字，卓蘭標「生牙包」！
  const res10b = renderPopupStackedLinesHelper(entry, '發牙包');
  assert.strictEqual(res10b.baseWord, '發牙包');
  assert.strictEqual(res10b.mainLine.diffWord, ''); // 竹
  assert.strictEqual(res10b.subLines[0].diffWord, '生牙包'); // 卓
  assert.strictEqual(res10b.subLines[1].diffWord, ''); // 桃
});

console.log(`\n測試完成！全部 ${passCount} 項測試通過！`);
