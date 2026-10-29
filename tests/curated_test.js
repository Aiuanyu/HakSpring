// tests/curated_test.js
// 驗證愛灣語加詞（data/curated/）：JSON 產出摎補字典 JSON 个「人工優先過擬音」
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const DIALECTS = ['四', '海', '大', '平', '安', '南'];
const root = path.join(__dirname, '..');

function readRows(rel) {
  const { name, content } = JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
  const lines = content.replace(/\n$/, '').split('\n');
  const headers = lines[0].split(',');
  // 這幾个檔个欄位值毋會含逗號以外个特殊引號，備註含逗號時用雙引號包，這裡淨驗有引號時整列照 CSV 規則切
  const rows = lines.slice(1).map((line) => {
    const cells = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (quoted) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') quoted = false; else cur += c;
      } else if (c === '"') quoted = true;
      else if (c === ',') { cells.push(cur); cur = ''; } else cur += c;
    }
    cells.push(cur);
    return Object.fromEntries(headers.map((h, i) => [h, cells[i]]));
  });
  return { name, rows };
}

console.log('🧪 Starting curated (愛灣語加詞) tests...');

// 1. 六腔都有檔案，名稱、來源類型、分類摎固定釋義正確
const curated = {};
DIALECTS.forEach((d) => {
  const { name, rows } = readRows(`data/curated/加詞-${d}.json`);
  assert.strictEqual(name, `愛灣語加詞${d}`);
  rows.forEach((r) => {
    assert.strictEqual(r.sourceType, 'curated');
    assert.strictEqual(r.sourceName, `愛灣語加詞${d}`);
    assert.strictEqual(r['分類'], '個人加詞');
    assert.ok(!r['華語詞義'].includes('程式自動'), '加詞釋義毋好寫「程式自動」');
  });
  curated[d] = rows;
});
console.log('  ✅ 1. 六腔檔案、來源欄位 PASS');

// 2. 「喺」：四、平 --he／he0，海 he33，大「哶」me33
const find = (d, ch) => curated[d].find((r) => r['客家語'] === ch);
assert.strictEqual(find('四', '喺')['客語標音_顯示'], '--he');
assert.strictEqual(find('四', '喺')['客語標音_查詢'], 'he0');
assert.strictEqual(find('平', '喺')['客語標音_顯示'], '--he');
assert.strictEqual(find('平', '喺')['客語標音_查詢'], 'he0');
assert.strictEqual(find('海', '喺')['客語標音_查詢'], 'he33');
assert.strictEqual(find('大', '哶')['客語標音_查詢'], 'me33');
console.log('  ✅ 2. 喺／哶 讀音 PASS');

// 3. 人工優先過擬音：同腔同字有人工加詞，補字典就毋該有該字个擬音列
DIALECTS.forEach((d) => {
  const supp = readRows(`data/supp/補字典-${d}.json`).rows;
  curated[d].forEach((c) => {
    const clash = supp.filter((r) => r['客家語'] === c['客家語'] && r['分類'] === '擬音');
    assert.strictEqual(clash.length, 0, `${d}「${c['客家語']}」个擬音應該已經被人工加詞蓋掉`);
  });
});
console.log('  ✅ 3. 人工加詞優先過擬音 PASS');

console.log('🎉 All curated tests passed!');
