// tests/char_coverage_test.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('🧪 Starting char coverage unit tests...\n');

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

const ROOT = path.resolve(__dirname, '..');
const COVERAGE_DIR = path.join(ROOT, 'data', 'coverage');

// 讀取產出的 JSON 檔
const summaryPath = path.join(COVERAGE_DIR, 'summary.json');
const charsJfPath = path.join(COVERAGE_DIR, 'chars-jf.json');
const charsT12Path = path.join(COVERAGE_DIR, 'chars-t12.json');
const charsOutsidePath = path.join(COVERAGE_DIR, 'chars-used-outside-jf.json');

assert(fs.existsSync(summaryPath), 'summary.json 必須存在');
assert(fs.existsSync(charsJfPath), 'chars-jf.json 必須存在');
assert(fs.existsSync(charsT12Path), 'chars-t12.json 必須存在');
assert(fs.existsSync(charsOutsidePath), 'chars-used-outside-jf.json 必須存在');

const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
const charsJf = JSON.parse(fs.readFileSync(charsJfPath, 'utf8'));
const charsT12 = JSON.parse(fs.readFileSync(charsT12Path, 'utf8'));
const charsOutside = JSON.parse(fs.readFileSync(charsOutsidePath, 'utf8'));

const DIALECTS = ['四', '南', '海', '大', '平', '安'];

// 來源碼顏色分類映射函數（前端與核心通用規則）
function getCoverageColorCategory(srcCode) {
  if (srcCode === 'G' || srcCode === 'C') return 'official'; // 官方（教典、認證）
  if (srcCode === 'S' || srcCode === 'Y') return 'carved';   // 切出（補字典、沿襲）
  if (srcCode === 'N') return 'nisim';                       // 擬音
  if (srcCode === '-') return 'none';                        // 無音
  throw new Error(`未知的來源碼：${srcCode}`);
}

// --- 1. 版本欄測試 ---
it('版本資訊包含 cert, gip, unihan, jf7000, supp_date 欄位', () => {
  assert(summary.versions, 'summary 必須有 versions');
  assert.strictEqual(summary.versions.cert, '115');
  assert.strictEqual(summary.versions.gip, '20261020');
  assert.strictEqual(summary.versions.unihan, '18.0');
  assert.strictEqual(summary.versions.jf7000, 'af8f31a1');
  assert(summary.versions.supp_date, '必須有 supp_date');
});

// --- 2. 來源碼與顏色合併邏輯測試 ---
it('來源碼正確合併為四種顏色分類', () => {
  assert.strictEqual(getCoverageColorCategory('G'), 'official');
  assert.strictEqual(getCoverageColorCategory('C'), 'official');
  assert.strictEqual(getCoverageColorCategory('S'), 'carved');
  assert.strictEqual(getCoverageColorCategory('Y'), 'carved');
  assert.strictEqual(getCoverageColorCategory('N'), 'nisim');
  assert.strictEqual(getCoverageColorCategory('-'), 'none');
  assert.throws(() => getCoverageColorCategory('X'), /未知的來源碼/);
});

// --- 3. jf7000 檔案格式與字元完整性測試 ---
it('chars-jf.json 剛好包含 7,772 個字，且每字包含合規欄位', () => {
  assert.strictEqual(charsJf.length, 7772);
  const seenChars = new Set();
  const validPacks = new Set(['base', 'taiwan', 'naming']);

  for (const item of charsJf) {
    assert(item.c && [...item.c].length === 1, `字元非法: ${item.c}`);
    assert(!seenChars.has(item.c), `重複字元: ${item.c}`);
    seenChars.add(item.c);

    assert(validPacks.has(item.pack), `不合法的 pack: ${item.pack}`);
    assert(typeof item.rad === 'string', 'rad 必須為字串');
    assert(typeof item.blk === 'string', 'blk 必須為字串');
    assert.strictEqual(item.src.length, 6, `src 必須為 6 個字元: ${item.src}`);
    assert(Array.isArray(item.py) && item.py.length === 6, 'py 必須為長度 6 的陣列');

    // 每一腔來源碼必須是 G, C, S, Y, N, - 之一
    for (let i = 0; i < 6; i++) {
      const code = item.src[i];
      assert(['G', 'C', 'S', 'Y', 'N', '-'].includes(code), `不合法的來源碼: ${code}`);
      if (code === '-') {
        assert.strictEqual(item.py[i], '', '無音時 py 應為空字串');
      } else {
        assert(item.py[i].length > 0, '有音時 py 不應為空');
      }
    }
  }
});

// --- 4. chars-t12.json 格式測試 ---
it('chars-t12.json 包含 5,848 個字（不在 jf7000 的常用字）', () => {
  assert.strictEqual(charsT12.length, 5848);
  const jfSet = new Set(charsJf.map(it => it.c));
  for (const item of charsT12) {
    assert(!jfSet.has(item.c), `T12 字不應在 jf7000: ${item.c}`);
    assert.strictEqual(item.src.length, 6);
    assert.strictEqual(item.py.length, 6);
  }
});

// --- 5. 175 字不在 jf7000 清單測試 ---
it('chars-used-outside-jf.json 剛好包含 175 個詞目用字', () => {
  assert.strictEqual(charsOutside.length, 175);
  const jfSet = new Set(charsJf.map(it => it.c));

  for (const item of charsOutside) {
    assert(!jfSet.has(item.c), `175 字不應在 jf7000: ${item.c}`);
    assert(['教典', '認證', '教典＋認證'].includes(item.from), `不合法的出處: ${item.from}`);
    assert(Array.isArray(item.words) && item.words.length > 0 && item.words.length <= 5, '出處詞目數量應為 1~5');
    assert.strictEqual(item.src.length, 6);
  }
});

// --- 6. summary.json 統計加總驗證 ---
it('summary.json 的 jf7000 各腔加總嚴格等於 7,772', () => {
  const jfDialects = summary.scopes.jf7000.dialects;
  for (const d of DIALECTS) {
    const st = jfDialects[d];
    assert.strictEqual(st.total, 7772);
    const sum = st.G + st.C + st.S + st.Y + st.N + st.none;
    assert.strictEqual(sum, 7772, `${d} 腔各來源加總應等於 7,772`);
    assert.strictEqual(st.official, st.G + st.C, `${d} 官方應為 G+C`);
    assert.strictEqual(st.carved, st.S + st.Y, `${d} 切出應為 S+Y`);
    assert.strictEqual(st.with_carved, st.official + st.carved);
    assert.strictEqual(st.nisim, st.N);
  }

  // 四縣驗收硬指標（C1/C2 規劃書）
  const si = jfDialects['四'];
  assert.strictEqual(si.official, 3385, '四縣官方應為 3,385');
  assert.strictEqual(si.G, 3293, '四縣教典單字應為 3,293');
  assert.strictEqual(si.C, 92, '四縣認證單字應為 92');
  assert.strictEqual(si.S, 666, '四縣切出單字應為 666');
  assert.strictEqual(si.Y, 1, '四縣沿襲單字應為 1');
  assert.strictEqual(si.nisim, 3565, '四縣擬音應為 3,565');
  assert.strictEqual(si.none, 155, '四縣無音應為 155');
});

it('summary.json 的 T12 與全範圍數字驗證', () => {
  assert.strictEqual(summary.scopes.t12.total, 13064);
  assert.strictEqual(summary.scopes.outside_jf_t12.total, 5848);
  assert.strictEqual(summary.scopes.all.total, 102527);
  assert.strictEqual(summary.outside_jf_vocab.total, 175);
});

console.log(`\n🎉 All ${passedTests} test suites passed cleanly!\n`);
