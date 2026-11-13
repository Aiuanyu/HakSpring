// tests/audio_profiles_test.js
// 驗證腔級播放設定：mergeAudioProfiles（逐 key LWW＋tombstone）摎同步接線
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '../js/cloud-sync.js'), 'utf8');
const ctx = vm.createContext({ console, setInterval() {}, clearInterval() {}, setTimeout() {}, clearTimeout() {} });
ctx.window = ctx;
ctx.document = { addEventListener() {}, visibilityState: 'visible' };
ctx.localStorage = { getItem() { return null; }, setItem() {} };
ctx.navigator = {};
vm.runInContext(src, ctx);
const merge = ctx.mergeAudioProfiles;

// 時間戳較新者勝
let m = merge({ 四基: [1, 2, 100, 0] }, { 四基: [0.75, 3, 200, 0] });
assert.deepStrictEqual(Array.from(m['四基']), [0.75, 3, 200, 0]);
m = merge({ 四基: [1.5, 1, 300, 0] }, { 四基: [0.75, 3, 200, 0] });
assert.deepStrictEqual(Array.from(m['四基']), [1.5, 1, 300, 0]);
// 兩邊各有不同腔級 → 聯集
m = merge({ 四基: [1, 1, 1, 0] }, { 海中高: [1.25, 2, 2, 0] });
assert.deepStrictEqual(Object.keys(m).sort(), ['四基', '海中高'].sort());
// 刪除（tombstone）較新 → 刪除生效，毋會被舊值復活
m = merge({ 四基: [1, 1, 500, 1] }, { 四基: [1.25, 2, 400, 0] });
assert.strictEqual(m['四基'][3], 1);
// 雲端 tombstone 較新 → 本地舊設定被刪
m = merge({ 四基: [1.25, 2, 400, 0] }, { 四基: [1, 1, 500, 1] });
assert.strictEqual(m['四基'][3], 1);
// 空值／壞資料
assert.deepStrictEqual(JSON.parse(JSON.stringify(merge(null, undefined))), {});
assert.deepStrictEqual(Object.keys(merge({ 四基: 'bad' }, {})), []);
console.log('  ✅ mergeAudioProfiles PASS');

// 接線：匯出、套用、伺服器白名單、手動匯入欄位白名單
assert.ok(/audio_profiles:\s*audioProfiles/.test(src), 'exportCurrentSyncData 愛匯出 audio_profiles');
assert.ok(/localStorage\.setItem\('hakkaAudioProfiles'/.test(src), '合併後愛寫回 localStorage');
assert.ok(/'audio_profiles',\n\];/.test(src), 'SYNC_PACKAGE_OBJECT_FIELDS 愛有 audio_profiles');
const server = fs.readFileSync(path.join(__dirname, '../functions/api/sync.js'), 'utf8');
assert.ok(/OBJECT_FIELDS = \[[\s\S]*'audio_profiles'[\s\S]*\];/.test(server), '伺服器白名單愛有 audio_profiles');
console.log('  ✅ audio profiles wiring PASS');
