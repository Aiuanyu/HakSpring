#!/usr/bin/env node
/**
 * 補字典前處理：用客源翠正宗 variant-parser 展開認證、教典个【】變體。
 *
 * 由 scripts/build_supp_dict.py 呼叫，毋使單獨執行。
 * 輸入：data/cert/113*.json、data/gip/*.json（process_all_data.py 產出个 JSON）
 * 輸出（stdout，一行一筆 JSON）：{ file, sourceName, word, phonetic, label }
 *   label：四縣 北／南／美，饒平 竹／卓／桃，其他腔空字串
 */

const fs = require('fs');
const path = require('path');
const { getLineVariants } = require(path.join(__dirname, '..', 'js', 'variant-parser.js'));

const DATA = path.join(__dirname, '..', 'data');

// 簡易 CSV 解析（JSON 个 content 欄係標準 CSV，有雙引號跳脫）
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function listJson(dir, re) {
  return fs.readdirSync(dir).filter(f => re.test(f)).map(f => path.join(dir, f));
}

const files = [
  ...listJson(path.join(DATA, 'cert'), /^113.*\.json$/),
  ...listJson(path.join(DATA, 'gip'), /^\d+-.\.json$/),
];

const out = [];
for (const file of files) {
  const { content } = JSON.parse(fs.readFileSync(file, 'utf8'));
  const [header, ...rows] = parseCsv(content);
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  for (const r of rows) {
    if (r.length < header.length) continue;
    const line = {
      客家語: r[idx['客家語']],
      客語標音_顯示: r[idx['客語標音_顯示']],
      sourceName: r[idx['sourceName']],
      sourceType: r[idx['sourceType']],
    };
    const parsed = getLineVariants(line);
    const emit = (word, phonetic, label) => {
      if (word && phonetic) {
        out.push(JSON.stringify({ file: path.basename(file), sourceName: line.sourceName, word, phonetic, label: label || '' }));
      }
    };
    if (parsed.main) emit(parsed.main.word, parsed.main.phonetic, parsed.main.label);
    for (const v of parsed.variants) {
      emit(v.word || (parsed.main ? parsed.main.word : ''), v.phonetic, v.label);
    }
  }
}
process.stdout.write(out.join('\n') + '\n');
