// tests/backup_import_test.js
// 驗證統一个備份匯入（js/cloud-sync.js parseBackupText／legacyToPackage／importBackupText）：
// 認得新版備份、舊版「資料管理」備份檔、舊版遷移網址（?migrateData=…），摎匯入後个合併、設定還原、排程推送。
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function makeContext() {
  const store = new Map();
  const timers = [];
  const ctx = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    setInterval() {}, clearInterval() {}, clearTimeout() {},
    setTimeout: (fn, ms) => { timers.push(ms); return timers.length; },
    URL, URLSearchParams, TextEncoder, TextDecoder, atob, btoa, Date, JSON, Uint8Array, AbortController,
  });
  ctx.window = ctx;
  ctx.document = { addEventListener() {}, getElementById() { return null; }, visibilityState: 'visible' };
  ctx.navigator = {};
  ctx.CustomEvent = function () {};
  ctx.window.dispatchEvent = () => {};
  ctx.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/cloud-sync.js'), 'utf8'), ctx);
  ctx.store = store; ctx.timers = timers;
  return ctx;
}

// vm 裡个物件摎本頁面个原型無共樣，deepStrictEqual 會誤判，改比 JSON
const same = (actual, expected, msg) => assert.strictEqual(JSON.stringify(actual), JSON.stringify(expected), msg);

(async () => {
  console.log('🧪 Starting backup import tests...');
  const c = makeContext();

  const newFormat = { version: 1, bookmarks: [], preferences: { userName: '平' }, learning_progress: {}, familiarity: { a: [1, 100] } };
  const legacy = { hakkaBookmarks: [{ tableName: 'T舊', filter: 'all', timestamp: 5 }], lastSearchMode: 'cert', lastSearchDialect: '四縣', autoBookmarkMode: 'true', certAdvancedRepeatCount: 3, dontShowInfoModalAgain: true };

  // 1. 辨識格式
  assert.strictEqual(c.parseBackupText(JSON.stringify(newFormat)).kind, 'sync');
  assert.strictEqual(c.parseBackupText(JSON.stringify({ preferences: {} })).kind, 'sync', '淨有物件欄位个新版也認');
  assert.strictEqual(c.parseBackupText(JSON.stringify(legacy)).kind, 'legacy');
  assert.strictEqual(c.parseBackupText('  ' + JSON.stringify(legacy) + '\n').kind, 'legacy', '前後空白');
  for (const bad of ['', '   ', 'not json', '[]', '{"x":1}', '123', 'null']) {
    assert.throws(() => c.parseBackupText(bad), undefined, `愛拒絕：${JSON.stringify(bad)}`);
  }
  console.log('  ✅ 1. 格式辨識 PASS');

  // 2. 舊版遷移網址（含中文；btoa 的 UTF-8 位元組；有／無百分比編碼；整串網址）
  const encoded = Buffer.from(JSON.stringify({ hakkaBookmarks: [{ tableName: '客家話', timestamp: 1 }], lastSearchMode: '詞彙' }), 'utf8').toString('base64');
  for (const url of [
    `https://hakspring.pages.dev/?musiid=hak&migrateData=${encoded}`,
    `https://hakspring.pages.dev/?migrateData=${encodeURIComponent(encoded)}&x=1`,
    `migrateData=${encoded}`,
  ]) {
    const r = c.parseBackupText(url);
    assert.strictEqual(r.kind, 'legacy', url.slice(0, 50));
    assert.strictEqual(r.data.hakkaBookmarks[0].tableName, '客家話', '中文愛還原正確');
  }
  console.log('  ✅ 2. 舊版遷移網址 PASS');

  // 3. 舊版 → 同步資料包
  same(c.legacyToPackage(legacy), { bookmarks: legacy.hakkaBookmarks });
  same(c.legacyToPackage({ hakkaBookmarks: JSON.stringify(legacy.hakkaBookmarks) }).bookmarks, legacy.hakkaBookmarks, '書籤係 JSON 字串也做得');
  same(c.legacyToPackage({ hakkaBookmarks: '壞掉' }), { bookmarks: [] });
  same(c.legacyToPackage({ lastSearchMode: 'x' }), { bookmarks: [] });
  console.log('  ✅ 3. 舊版轉資料包 PASS');

  // 4. 匯入舊版：書籤合併（毋覆蓋原有）、5 項設定還原、有金鑰就排程推送
  c.localStorage.setItem('hakkaBookmarks', JSON.stringify([{ tableName: 'T現', filter: 'all', timestamp: 9 }]));
  c.localStorage.setItem('lastSearchMode', '本機原值');
  const result = await c.importBackupText(JSON.stringify(legacy));
  same(result, { kind: 'legacy', settings: 5 });
  const tables = JSON.parse(c.localStorage.getItem('hakkaBookmarks')).map((b) => b.tableName).sort();
  assert.ok(tables.includes('T舊') && tables.includes('T現'), `書籤愛合併，毋係覆蓋：${tables}`);
  assert.strictEqual(c.localStorage.getItem('lastSearchMode'), 'cert', '設定覆蓋回去');
  assert.strictEqual(c.localStorage.getItem('certAdvancedRepeatCount'), '3');
  assert.strictEqual(c.localStorage.getItem('dontShowInfoModalAgain'), 'true');
  assert.ok(!c.timers.includes(20000), '無金鑰：毋排程推送');
  console.log('  ✅ 4. 匯入舊版（書籤合併、設定還原）PASS');

  // 5. 匯入新版：智慧合併；有金鑰就排程推送
  c.setSyncKey('ABCDEFGH23456723ABCDEFGH234567AB');
  c.localStorage.setItem('hakkaFamiliarity', JSON.stringify({ b: [2, 200] }));
  const r2 = await c.importBackupText(JSON.stringify(newFormat));
  same(r2, { kind: 'sync', settings: 0 });
  same(Object.keys(JSON.parse(c.localStorage.getItem('hakkaFamiliarity'))).sort(), ['a', 'b'], '熟悉度合併');
  assert.ok(c.timers.includes(20000), '有金鑰：匯入後排程推送雲端（防抖 20 秒）');
  console.log('  ✅ 5. 匯入新版（合併、排程推送）PASS');

  // 6. 壞格式：丟錯、毋改本機
  const before = c.localStorage.getItem('hakkaBookmarks');
  await assert.rejects(() => c.importBackupText('{"x":1}'));
  assert.strictEqual(c.localStorage.getItem('hakkaBookmarks'), before);
  console.log('  ✅ 6. 壞格式毋改本機 PASS');

  // 7. 介面接線：資料管理已併入，無殘留，暗色模式樣式完整適配
  const root = path.join(__dirname, '..');
  const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
  const cloud = fs.readFileSync(path.join(root, 'js/cloud-sync.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
  assert.ok(!/dataManagement|exportDataBtn|importDataBtn/.test(index + main), '舊「資料管理」殘留');
  assert.ok(/id="importPasteArea"/.test(cloud) && /id="importPasteBtn"/.test(cloud) && /id="importSyncJsonInput"/.test(cloud));
  assert.ok(/max-height: calc\(100vh - 32px\); overflow-y: auto/.test(cloud), '共步視窗愛做得捲動');
  assert.ok(/<details id="cloudKeySection" open/.test(cloud) && /<details id="manualBackupSection"/.test(cloud), '分區收合');
  assert.ok(/class="sync-modal-link"/.test(cloud), '連結愛套用主題類別（WCAG 對比度）');
  assert.ok(!/var\(--bg-card/.test(cloud), '毋好使用未定義个 --bg-card 變數');
  assert.ok(/#manualSyncModal \.modal-dialog[\s\S]*?var\(--dark-surface-color/.test(css), '共步視窗愛有暗色模式深底適配');
  console.log('  ✅ 7. 介面接線 PASS');

  // 8. 防禦性強化：applyLegacySettings 略過 null、過濾原型屬性、壞掉 base64 轉拋 format 錯誤
  assert.throws(() => c.parseBackupText('?migrateData=***invalid-base64***'), (err) => err.message === 'format', '壞掉 base64 丟 format 錯誤');
  const taintedLegacy = {
    hakkaBookmarks: [],
    lastSearchMode: null,
    certAdvancedRepeatCount: undefined,
    autoBookmarkMode: true,
    __proto__: { polluted: true },
  };
  c.localStorage.removeItem('lastSearchMode');
  c.localStorage.removeItem('certAdvancedRepeatCount');
  const restoredCount = c.applyLegacySettings(taintedLegacy);
  assert.strictEqual(restoredCount, 1, '淨還原合法值（1 項）');
  assert.strictEqual(c.localStorage.getItem('lastSearchMode'), null, 'null 毋寫入字串 "null"');
  assert.strictEqual(c.localStorage.getItem('certAdvancedRepeatCount'), null, 'undefined 毋寫入');
  assert.strictEqual(c.localStorage.getItem('autoBookmarkMode'), 'true');
  assert.strictEqual(Object.prototype.polluted, undefined, '防範 Prototype Pollution');
  console.log('  ✅ 8. 防禦性強化（null 檢查、安全過濾、壞掉 base64）PASS');

  console.log('✨ All backup import tests passed!');
})().catch((err) => { console.error(err); process.exit(1); });
