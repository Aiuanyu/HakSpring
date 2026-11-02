// tests/cloud_sync_meinung_test.js
// 驗證美濃腔（showMeinungFill）个雲端同步：LWW 合併純函式 mergeBoolPref，摎 cloud-sync.js 个五處接線
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const file = path.join(__dirname, '../js/cloud-sync.js');
const src = fs.readFileSync(file, 'utf8');
const ctx = vm.createContext({ console, setInterval() {}, clearInterval() {}, setTimeout() {}, clearTimeout() {} });
ctx.window = ctx;
ctx.document = { addEventListener() {}, visibilityState: 'visible' };
ctx.localStorage = { getItem() { return null; }, setItem() {} };
ctx.navigator = {};
vm.runInContext(src, ctx);
const merge = ctx.mergeBoolPref;
assert.strictEqual(typeof merge, 'function');

// 本地相對快照無變 → 套用雲端值
assert.strictEqual(merge(false, false, true), true);   // 另一台開了，這台跟著開
assert.strictEqual(merge(true, true, false), false);   // 另一台關了，這台跟著關
assert.strictEqual(merge(true, true, true), true);
assert.strictEqual(merge(false, false, false), false);
// 本地相對快照有變 → 保留本地（留給 Smart Push 推上去）
assert.strictEqual(merge(true, false, false), true);   // 這台剛開，雲端還係關
assert.strictEqual(merge(false, true, true), false);   // 這台剛關，雲端還係開
// 雲端無這個欄位（舊資料）→ 保留本地，毋會誤開／誤關
assert.strictEqual(merge(true, false, undefined), true);
assert.strictEqual(merge(false, false, undefined), false);
assert.strictEqual(merge(true, true, null), true);
// localStorage 个字串、快照缺欄位（undefined 視為 false）
assert.strictEqual(merge('true', undefined, 'false'), true);  // 本地 true、快照無 → 有變，保留本地
assert.strictEqual(merge('false', undefined, 'true'), true);  // 本地 false＝快照未設定 false → 套用雲端
assert.strictEqual(merge(undefined, undefined, true), true);
console.log('  ✅ mergeBoolPref PASS');

// 接線：讀本地、合併、比對有無要上傳、寫基準快照（兩處）、上傳 preferences，共 6 處以上都愛有
const count = (src.match(/showMeinungFill/g) || []).length;
assert.ok(count >= 8, `cloud-sync.js 个 showMeinungFill 只有 ${count} 處，同步接線可能漏接`);
assert.ok(/localStorage\.setItem\('showMeinungFill'/.test(src), '合併後愛寫回 localStorage');
assert.ok(/applyMeinungFillSetting/.test(src), '雲端覆寫本機值愛更新畫面');
// 上傳 preferences 區塊有這個欄位
const upload = src.slice(src.indexOf('async function syncToCloud'));
assert.ok(/preferences = \{[\s\S]*?showMeinungFill[\s\S]*?\};/.test(upload), 'syncToCloud 个 preferences 愛有 showMeinungFill');
console.log('✨ 美濃腔雲端同步 全部 PASS');
