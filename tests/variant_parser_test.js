// tests/variant_parser_test.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const {
  splitBrackets,
  stripOuterParens,
  isParensWrapped,
  splitVariantSlash,
  parseVariants,
  getLineVariants
} = require('../js/variant-parser.js');

console.log('🧪 Starting variant parser unit tests...\n');

let passedTests = 0;

function it(description, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${description}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${description}`);
    console.error(err);
    process.exit(1);
  }
}

// ==========================================
// 1. 基本字串切分與輔助函式測試
// ==========================================
console.log('--- 1. Helper Functions ---');

it('splitBrackets correctly extracts bracket content and main text', () => {
  const r1 = splitBrackets('發病仔【破病／發病仔】');
  assert.strictEqual(r1.main, '發病仔');
  assert.deepStrictEqual(r1.brackets, ['破病／發病仔']);

  const r2 = splitBrackets('kóng kien (kien kóng)【kóng kian】【kian kóng】');
  assert.strictEqual(r2.main, 'kóng kien (kien kóng)');
  assert.deepStrictEqual(r2.brackets, ['kóng kian', 'kian kóng']);

  const r3 = splitBrackets('無括號一般詞條');
  assert.strictEqual(r3.main, '無括號一般詞條');
  assert.deepStrictEqual(r3.brackets, []);
});

it('stripOuterParens and isParensWrapped handle full/half width parens', () => {
  assert.strictEqual(isParensWrapped('（唔媽）'), true);
  assert.strictEqual(isParensWrapped('(m mà)'), true);
  assert.strictEqual(isParensWrapped('不是括號'), false);
  assert.strictEqual(isParensWrapped('（未閉合'), false);

  assert.strictEqual(stripOuterParens('（唔媽）'), '唔媽');
  assert.strictEqual(stripOuterParens('(m mà)'), 'm mà');
  assert.strictEqual(stripOuterParens('一般'), '一般');
});

it('splitVariantSlash splits both full-width and half-width slashes', () => {
  assert.deepStrictEqual(splitVariantSlash('破病／發病仔'), ['破病', '發病仔']);
  assert.deepStrictEqual(splitVariantSlash('pô piang/bòd piang ê'), ['pô piang', 'bòd piang ê']);
  assert.deepStrictEqual(splitVariantSlash('單一無斜線'), ['單一無斜線']);
});

// ==========================================
// 2. 六種資料模式的測試
// ==========================================
console.log('\n--- 2. Six Data Patterns ---');

it('模式 0：一般無【】詞條（保持 hasVariants: false）', () => {
  const res = parseVariants('發燒', 'fàd séu', '四縣');
  assert.strictEqual(res.hasVariants, false);
  assert.strictEqual(res.main.label, '北');
  assert.strictEqual(res.main.word, '發燒');
  assert.strictEqual(res.main.phonetic, 'fàd séu');
  assert.strictEqual(res.variants.length, 0);

  // 非四縣/饒平腔調亦回傳 false
  const resHa = parseVariants('發燒【發燒】', 'fad seu', '海陸');
  assert.strictEqual(resHa.hasVariants, false);
});

it('模式 1：僅標音不同（phoneticOnly，四縣）', () => {
  const res = parseVariants('著著', 'chog dò【cog dô】', '四縣');
  assert.strictEqual(res.hasVariants, true);
  assert.strictEqual(res.main.label, '北');
  assert.strictEqual(res.main.title, '北四縣');
  assert.strictEqual(res.main.word, '著著');
  assert.strictEqual(res.main.phonetic, 'chog dò');
  assert.strictEqual(res.main.phoneticOnly, false);

  assert.strictEqual(res.variants.length, 1);
  assert.strictEqual(res.variants[0].label, '南');
  assert.strictEqual(res.variants[0].title, '南四縣');
  assert.strictEqual(res.variants[0].word, '');
  assert.strictEqual(res.variants[0].phonetic, 'cog dô');
  assert.strictEqual(res.variants[0].phoneticOnly, true);
});

it('模式 1：僅標音不同（饒平，卓桃雙音）', () => {
  const res = parseVariants('發病仔', 'bòd piáng èr【pô piang/bòd piang ê】', '饒平');
  assert.strictEqual(res.hasVariants, true);
  assert.strictEqual(res.main.label, '竹');
  assert.strictEqual(res.main.title, '新竹');
  assert.strictEqual(res.main.word, '發病仔');
  assert.strictEqual(res.main.phonetic, 'bòd piáng èr');

  assert.strictEqual(res.variants.length, 2);
  assert.strictEqual(res.variants[0].label, '卓');
  assert.strictEqual(res.variants[0].title, '卓蘭');
  assert.strictEqual(res.variants[0].word, '');
  assert.strictEqual(res.variants[0].phonetic, 'pô piang');
  assert.strictEqual(res.variants[0].phoneticOnly, true);

  assert.strictEqual(res.variants[1].label, '桃');
  assert.strictEqual(res.variants[1].title, '桃園');
  assert.strictEqual(res.variants[1].word, '');
  assert.strictEqual(res.variants[1].phonetic, 'bòd piang ê');
  assert.strictEqual(res.variants[1].phoneticOnly, true);
});

it('模式 1：僅標音不同（饒平，卓桃共用單音）', () => {
  const res = parseVariants('著著', 'chog dò【cog dô】', '饒平');
  assert.strictEqual(res.hasVariants, true);
  assert.strictEqual(res.main.label, '竹');
  assert.strictEqual(res.variants.length, 1);
  assert.strictEqual(res.variants[0].label, '卓桃');
  assert.strictEqual(res.variants[0].title, '卓蘭/桃園');
  assert.strictEqual(res.variants[0].word, '');
  assert.strictEqual(res.variants[0].phonetic, 'cog dô');
  assert.strictEqual(res.variants[0].phoneticOnly, true);
});

it('模式 2：字與音皆不同（饒平，卓蘭／桃園）', () => {
  const res = parseVariants(
    '發病仔【破病／發病仔】',
    'bòd piáng èr【pô piang/bòd piang ê】',
    '饒平'
  );
  assert.strictEqual(res.hasVariants, true);
  assert.strictEqual(res.main.label, '竹');
  assert.strictEqual(res.main.word, '發病仔');
  assert.strictEqual(res.main.phonetic, 'bòd piáng èr');

  assert.strictEqual(res.variants.length, 2);
  assert.strictEqual(res.variants[0].label, '卓');
  assert.strictEqual(res.variants[0].title, '卓蘭');
  assert.strictEqual(res.variants[0].word, '破病');
  assert.strictEqual(res.variants[0].phonetic, 'pô piang');
  assert.strictEqual(res.variants[0].phoneticOnly, false);

  assert.strictEqual(res.variants[1].label, '桃');
  assert.strictEqual(res.variants[1].title, '桃園');
  assert.strictEqual(res.variants[1].word, '發病仔');
  assert.strictEqual(res.variants[1].phonetic, 'bòd piang ê');
  assert.strictEqual(res.variants[1].phoneticOnly, false);
});

it('模式 3：完全替換詞（無斜線共用變體，平初 1-4）', () => {
  const res = parseVariants('咳【嗽】', 'kèb【cug】', '饒平');
  assert.strictEqual(res.hasVariants, true);
  assert.strictEqual(res.main.label, '竹');
  assert.strictEqual(res.main.word, '咳');
  assert.strictEqual(res.main.phonetic, 'kèb');

  assert.strictEqual(res.variants.length, 1);
  assert.strictEqual(res.variants[0].label, '卓桃');
  assert.strictEqual(res.variants[0].title, '卓蘭/桃園');
  assert.strictEqual(res.variants[0].word, '嗽');
  assert.strictEqual(res.variants[0].phonetic, 'cug');
  assert.strictEqual(res.variants[0].phoneticOnly, false);
});

it('模式 4：多重【】塊（四縣限定，同義詞對照）', () => {
  const res = parseVariants(
    '康健（健康）',
    'kóng kien (kien kóng)【kóng kian】【kian kóng】',
    '四縣'
  );
  assert.strictEqual(res.hasVariants, true);
  assert.strictEqual(res.main.label, '北');
  assert.strictEqual(res.main.word, '康健（健康）');
  assert.strictEqual(res.main.phonetic, 'kóng kien (kien kóng)');

  assert.strictEqual(res.variants.length, 1);
  assert.strictEqual(res.variants[0].label, '南');
  assert.strictEqual(res.variants[0].title, '南四縣');
  assert.strictEqual(res.variants[0].word, '');
  assert.strictEqual(res.variants[0].phonetic, 'kóng kian (kian kóng)');
  assert.strictEqual(res.variants[0].phoneticOnly, true);
});

it('模式 4：多重【】塊含有字詞變體（四中高 8-21 魚脯仔）', () => {
  const res = parseVariants(
    '魚脯仔【細魚乾仔】',
    'ňg pù ě【ňg pù è】【se ňg gón è】',
    '四縣'
  );
  assert.strictEqual(res.hasVariants, true);
  assert.strictEqual(res.main.label, '北');
  assert.strictEqual(res.main.word, '魚脯仔');
  assert.strictEqual(res.main.phonetic, 'ňg pù ě');

  assert.strictEqual(res.variants.length, 2);
  // 第一筆：主詞在南四縣的讀音
  assert.strictEqual(res.variants[0].label, '南');
  assert.strictEqual(res.variants[0].word, '');
  assert.strictEqual(res.variants[0].phonetic, 'ňg pù è');
  assert.strictEqual(res.variants[0].phoneticOnly, true);

  // 第二筆：南四縣字詞「細魚乾仔」
  assert.strictEqual(res.variants[1].label, '南');
  assert.strictEqual(res.variants[1].word, '細魚乾仔');
  assert.strictEqual(res.variants[1].phonetic, 'se ňg gón è');
  assert.strictEqual(res.variants[1].phoneticOnly, false);
});

it('模式 5：美濃音 【（）】（四基 6-2 阿姆）', () => {
  const res = parseVariants('阿姆【（唔媽）】', 'á mé【(m mà)】', '四縣');
  assert.strictEqual(res.hasVariants, true);
  assert.strictEqual(res.main.label, '北');
  assert.strictEqual(res.main.word, '阿姆');
  assert.strictEqual(res.main.phonetic, 'á mé');

  assert.strictEqual(res.variants.length, 1);
  assert.strictEqual(res.variants[0].label, '美');
  assert.strictEqual(res.variants[0].title, '美濃');
  assert.strictEqual(res.variants[0].word, '唔媽');
  assert.strictEqual(res.variants[0].phonetic, 'm mà');
  assert.strictEqual(res.variants[0].phoneticOnly, false);
});

it('模式 5：美濃音 + 南四縣雙變體（四基 8-26 卵）', () => {
  const res = parseVariants('卵【（春）】', 'lòn【(nòn)】【(cún)】', '四縣');
  assert.strictEqual(res.hasVariants, true);
  assert.strictEqual(res.main.label, '北');
  assert.strictEqual(res.main.word, '卵');
  assert.strictEqual(res.main.phonetic, 'lòn');

  assert.strictEqual(res.variants.length, 2);
  assert.strictEqual(res.variants[0].label, '南');
  assert.strictEqual(res.variants[0].title, '南四縣');
  assert.strictEqual(res.variants[0].word, '');
  assert.strictEqual(res.variants[0].phonetic, 'nòn');
  assert.strictEqual(res.variants[0].phoneticOnly, true);

  assert.strictEqual(res.variants[1].label, '美');
  assert.strictEqual(res.variants[1].title, '美濃');
  assert.strictEqual(res.variants[1].word, '春');
  assert.strictEqual(res.variants[1].phonetic, 'cún');
  assert.strictEqual(res.variants[1].phoneticOnly, false);
});

it('模式 5：美濃音複合於南四縣標音（四中 8-28 裌仔）', () => {
  const res = parseVariants(
    '裌仔【（掛裌仔）】',
    'gàb ě【gàb è (gua gàb è)】',
    '四縣'
  );
  assert.strictEqual(res.hasVariants, true);
  assert.strictEqual(res.main.label, '北');
  assert.strictEqual(res.main.word, '裌仔');
  assert.strictEqual(res.main.phonetic, 'gàb ě');

  assert.strictEqual(res.variants.length, 2);
  assert.strictEqual(res.variants[0].label, '南');
  assert.strictEqual(res.variants[0].word, '');
  assert.strictEqual(res.variants[0].phonetic, 'gàb è');
  assert.strictEqual(res.variants[0].phoneticOnly, true);

  assert.strictEqual(res.variants[1].label, '美');
  assert.strictEqual(res.variants[1].word, '掛裌仔');
  assert.strictEqual(res.variants[1].phonetic, 'gua gàb è');
  assert.strictEqual(res.variants[1].phoneticOnly, false);
});

it('模式 6：饒平【／】內含（）同義詞（平高 14-13 丙運）', () => {
  const res = parseVariants(
    '丙運【歪運（落運）】',
    'biàng vín【vǎi rhiun(vin) (log rhiun(vin))】',
    '饒平'
  );
  assert.strictEqual(res.hasVariants, true);
  assert.strictEqual(res.main.label, '竹');
  assert.strictEqual(res.main.word, '丙運');
  assert.strictEqual(res.variants.length, 1);
  assert.strictEqual(res.variants[0].label, '卓桃');
  assert.strictEqual(res.variants[0].word, '歪運（落運）');
  assert.strictEqual(res.variants[0].phonetic, 'vǎi rhiun(vin) (log rhiun(vin))');
  assert.strictEqual(res.variants[0].phoneticOnly, false);
});

// ==========================================
// 3. 全資料庫覆蓋率與計數驗證
// ==========================================
console.log('\n--- 3. Full Cert Dataset Verification ---');

it('全量資料庫四縣變體條數符合盤查結果 (1264 條)', () => {
  let sixianCount = 0;
  const files = ['113四基.json', '113四初.json', '113四中.json', '113四中高.json', '113四高.json'];
  for (const f of files) {
    const p = path.join(__dirname, '../data/cert', f);
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    const lines = data.content.split('\n').filter(Boolean);
    const header = lines[0].split(',');
    const wIdx = header.indexOf('客家語');
    const pIdx = header.indexOf('客語標音_顯示');

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',');
      const word = cols[wIdx] || '';
      const phonetic = cols[pIdx] || '';
      const res = parseVariants(word, phonetic, '四縣');
      if (res.hasVariants) {
        sixianCount++;
        assert.ok(res.variants.length > 0, `No variants for Sixian row ${cols[0]}`);
      }
    }
  }
  assert.strictEqual(sixianCount, 1264);
});

it('全量資料庫饒平變體條數符合盤查結果 (4889 條)', () => {
  let raopingCount = 0;
  const files = ['113平基.json', '113平初.json', '113平中.json', '113平中高.json', '113平高.json'];
  for (const f of files) {
    const p = path.join(__dirname, '../data/cert', f);
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    const lines = data.content.split('\n').filter(Boolean);
    const header = lines[0].split(',');
    const wIdx = header.indexOf('客家語');
    const pIdx = header.indexOf('客語標音_顯示');

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',');
      const word = cols[wIdx] || '';
      const phonetic = cols[pIdx] || '';
      const res = parseVariants(word, phonetic, '饒平');
      if (res.hasVariants) {
        raopingCount++;
        assert.ok(res.variants.length > 0, `No variants for Raoping row ${cols[0]}`);
      }
    }
  }
  assert.strictEqual(raopingCount, 4889);
});

// ==========================================
// 4. getLineVariants 共用地基函式測試 (P1-0)
// ==========================================
console.log('--- 4. getLineVariants (P1-0) ---');

it('getLineVariants correctly processes Sixian cert line with variants', () => {
  const line = {
    '客家語': '醫院',
    '客語標音_顯示': 'í ien【í ian】',
    sourceName: '四縣基礎級',
    sourceType: 'cert'
  };
  const res = getLineVariants(line);
  assert.strictEqual(res.dialectType, '四縣');
  assert.strictEqual(res.hasVariants, true);
  assert.strictEqual(res.cleanWord, '醫院');
  assert.strictEqual(res.cleanPhonetic, 'í ien');
  assert.strictEqual(res.main.label, '北');
  assert.strictEqual(res.variants.length, 1);
  assert.strictEqual(res.variants[0].label, '南');
  assert.strictEqual(res.variants[0].phonetic, 'í ian');
});

it('getLineVariants correctly processes Sixian cert line without variants', () => {
  const line = {
    '客家語': '發燒',
    '客語標音_顯示': 'fàd séu',
    sourceName: '四縣基礎級',
    sourceType: 'cert'
  };
  const res = getLineVariants(line);
  assert.strictEqual(res.dialectType, '四縣');
  assert.strictEqual(res.hasVariants, false);
  assert.strictEqual(res.cleanWord, '發燒');
  assert.strictEqual(res.cleanPhonetic, 'fàd séu');
  assert.strictEqual(res.variants.length, 0);
});

it('getLineVariants correctly processes Raoping cert line with variants', () => {
  const line = {
    '客家語': '啞仔【啞狗】',
    '客語標音_顯示': 'à èr【â giêu】',
    sourceName: '饒平中高級',
    sourceType: 'cert'
  };
  const res = getLineVariants(line);
  assert.strictEqual(res.dialectType, '饒平');
  assert.strictEqual(res.hasVariants, true);
  assert.strictEqual(res.cleanWord, '啞仔');
  assert.strictEqual(res.cleanPhonetic, 'à èr');
  assert.strictEqual(res.main.label, '竹');
  assert.strictEqual(res.variants.length, 1);
  assert.strictEqual(res.variants[0].label, '卓桃');
  assert.strictEqual(res.variants[0].word, '啞狗');
  assert.strictEqual(res.variants[0].phonetic, 'â giêu');
});

it('getLineVariants correctly ignores brackets in GIP (教典) data', () => {
  const line = {
    '客家語': '包包㘝㘝【測試】',
    '客語標音_顯示': 'báu báu ngiàb ngiàb【ce sii】',
    sourceName: '教典四',
    sourceType: 'gip'
  };
  const res = getLineVariants(line);
  assert.strictEqual(res.dialectType, null);
  assert.strictEqual(res.hasVariants, false);
  assert.strictEqual(res.cleanWord, '包包㘝㘝【測試】');
  assert.strictEqual(res.cleanPhonetic, 'báu báu ngiàb ngiàb【ce sii】');
});

it('getLineVariants treats non-target dialect cert data (e.g. 海陸) as no variants', () => {
  const line = {
    '客家語': '測試【假變體】',
    '客語標音_顯示': 'ce sii【ga bien ti】',
    sourceName: '海陸基礎級',
    sourceType: 'cert'
  };
  const res = getLineVariants(line);
  assert.strictEqual(res.dialectType, null);
  assert.strictEqual(res.hasVariants, false);
});

it('getLineVariants supports fallbacks: dataVarName and progressKey', () => {
  // Game targetWord fallback with dataVarName: '四基'
  const gameLine1 = {
    '客家語': '醫院',
    '客語標音_顯示': 'í ien【í ian】',
    dataVarName: '四基'
  };
  const res1 = getLineVariants(gameLine1);
  assert.strictEqual(res1.dialectType, '四縣');
  assert.strictEqual(res1.hasVariants, true);
  assert.strictEqual(res1.cleanWord, '醫院');
  assert.strictEqual(res1.cleanPhonetic, 'í ien');

  // Game targetWord fallback with progressKey: 'c平中1-1|m'
  const gameLine2 = {
    '客家語': '啞仔【啞狗】',
    '客語標音_顯示': 'à èr【â giêu】',
    progressKey: 'c平中1-1|m'
  };
  const res2 = getLineVariants(gameLine2);
  assert.strictEqual(res2.dialectType, '饒平');
  assert.strictEqual(res2.hasVariants, true);
  assert.strictEqual(res2.cleanWord, '啞仔');
  assert.strictEqual(res2.cleanPhonetic, 'à èr');
});

it('getLineVariants handles null/undefined/empty input safely', () => {
  const r1 = getLineVariants(null);
  assert.strictEqual(r1.hasVariants, false);
  assert.strictEqual(r1.cleanWord, '');
  assert.strictEqual(r1.cleanPhonetic, '');
  assert.strictEqual(r1.dialectType, null);

  const r2 = getLineVariants({});
  assert.strictEqual(r2.hasVariants, false);
  assert.strictEqual(r2.cleanWord, '');
  assert.strictEqual(r2.cleanPhonetic, '');
});

console.log(`\n🎉 All ${passedTests} test suites passed cleanly!\n`);

