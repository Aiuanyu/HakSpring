// tests/sync_survey_test.js
// 驗證雲端同步問卷（js/sync-survey.js）：網址、內嵌彈窗 HTML、入口接線
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { EMBED_URL, OPEN_URL, buildModalHtml } = require('../js/sync-survey.js');

console.log('🧪 Starting sync survey tests...');

// 1. 網址：Google 表單、內嵌版有 embedded=true、新分頁版無
assert.ok(/^https:\/\/docs\.google\.com\/forms\/d\/e\/[\w-]+\/viewform$/.test(OPEN_URL), OPEN_URL);
assert.strictEqual(EMBED_URL, `${OPEN_URL}?embedded=true`);

// 2. 彈窗 HTML：有 iframe（src 先空，開窗時才載）、備用新分頁連結帶 noopener、有關閉鈕
const html = buildModalHtml();
assert.ok(/<iframe id="syncSurveyFrame"/.test(html));
assert.ok(!/<iframe[^>]*\ssrc=/.test(html), 'iframe 毋好預先載入，等開窗正設 src');
assert.ok(/title="[^"]+"/.test(html.match(/<iframe[^>]*>/)[0]), 'iframe 愛有 title（無障礙）');
assert.ok(new RegExp(`href="${OPEN_URL}"[^>]*target="_blank"[^>]*rel="noopener noreferrer"`).test(html));
assert.ok(/id="syncSurveyCloseBtn"/.test(html));
assert.ok(/role="dialog"/.test(html));
console.log('  ✅ 網址摎彈窗 PASS');

// 3. 入口接線：header 按鈕、手動共步視窗連結、script 有載入、樣式有蓋過手動共步視窗
const root = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const cloud = fs.readFileSync(path.join(root, 'js/cloud-sync.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
assert.ok(/id="syncSurveyBtn"/.test(index), 'index.html 缺問卷鈕');
assert.ok(/js\/sync-survey\.js\?v=/.test(index), 'index.html 毋曾載入 sync-survey.js');
assert.ok(/data-open-sync-survey/.test(cloud), '手動共步視窗缺邀請連結');
const z = css.match(/#syncSurveyModal \{\s*z-index:\s*(\d+)/);
assert.ok(z && Number(z[1]) > 10002, '問卷彈窗个層級愛高過手動共步視窗 (10002)');
for (const sel of ['#syncSurveyBtn,', '#syncSurveyBtn i,', '#syncSurveyBtn:hover i,']) {
  assert.ok(css.includes(sel), `style.css 缺 ${sel}`);
}
console.log('  ✅ 入口接線 PASS');
console.log('✨ All sync survey tests passed!');
