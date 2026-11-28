// tests/garden_sync_test.js
// 庭院雲端同步：兩台裝置帳本合併（互不蓋掉、答題統計不重複入帳）、紀元重設、新版本保護、伺服器保留欄位
// 用跟 cloudflare_d1_sync_test.js 同樣个假 D1 摎 vm 裝置，真个跑 garden-data.js、garden.js、cloud-sync.js。
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');

// ---------- 載入伺服器 ----------
function loadServer() {
  const source = fs.readFileSync(path.join(root, 'functions/api/sync.js'), 'utf8');
  assert.ok(/Access-Control-Allow-Origin/.test(source), '支援安全 CORS（允許 localhost / 官方網域）');
  const code = source.replace(/^export (async )?function/gm, '$1function') +
    '\nmodule.exports = { onRequestGet, onRequestPost, onRequestDelete, onRequestOptions, hasOptions: typeof onRequestOptions !== "undefined" };';
  const mod = { exports: {} };
  new Function('module', 'exports', code)(mod, mod.exports);
  return mod.exports;
}
const server = loadServer();
assert.strictEqual(server.hasOptions, true, '支援 OPTIONS 預檢請求');

// ---------- 假 D1：支援 sync.js 用著个四種敘述 ----------
class MockD1 {
  constructor() { this.rows = new Map(); this.failNext = false; }
  prepare(sql) {
    const db = this;
    return {
      bind(...p) {
        const boom = () => { if (db.failNext) { db.failNext = false; throw new Error('SECRET-INTERNAL-DETAIL'); } };
        return {
          async first() {
            boom();
            if (/^SELECT data, updated_at/.test(sql)) { const r = db.rows.get(p[0]); return r ? { data: r.data, updated_at: r.updated_at } : null; }
            return null;
          },
          async run() {
            boom();
            if (/^INSERT INTO user_sync/.test(sql)) {
              const [id, data, now] = p;
              if (db.rows.has(id)) return { meta: { changes: 0 } };
              db.rows.set(id, { data, updated_at: now });
              return { meta: { changes: 1 } };
            }
            if (/^UPDATE user_sync/.test(sql)) {
              const [data, now, id, base] = p;
              const r = db.rows.get(id);
              if (!r || r.updated_at !== base) return { meta: { changes: 0 } };
              db.rows.set(id, { data, updated_at: now });
              return { meta: { changes: 1 } };
            }
            if (/^DELETE FROM user_sync/.test(sql)) { return { meta: { changes: db.rows.delete(p[0]) ? 1 : 0 } }; }
            return { meta: { changes: 0 } };
          },
        };
      },
    };
  }
}

const KEY_A = 'ABCDEFGH23456723ABCDEFGH234567AB';
const KEY_B = 'ZZZZYYYYXXXXWWWWVVVVUUUUTTTT2222';

function call(handler, { db, key, headers = {}, body, url = 'https://x.test/api/sync' }) {
  const h = { ...headers };
  if (key !== undefined) h['X-Sync-Key'] = key;
  const init = { method: handler === server.onRequestGet ? 'GET' : handler === server.onRequestPost ? 'POST' : 'DELETE', headers: h };
  if (body !== undefined && init.method === 'POST') init.body = typeof body === 'string' ? body : JSON.stringify(body);
  return handler({ request: new Request(url, init), env: db === null ? {} : { DB: db } });
}
const readJson = async (resp) => JSON.parse(await resp.text());


const KEY = 'ABCDEFGH23456723ABCDEFGH234567AB';
const db = new MockD1();

function today() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function makeDevice(label) {
  const store = new Map();
  const ctx = vm.createContext({ console: { log() {}, warn() {}, error() {} }, setInterval() {}, clearInterval() {}, setTimeout() {}, clearTimeout() {}, URL, URLSearchParams, TextEncoder, crypto, Date, JSON, AbortController, Math });
  ctx.window = ctx;
  ctx.document = { addEventListener() {}, getElementById() { return null; }, visibilityState: 'visible', readyState: 'complete' };
  ctx.navigator = {};
  ctx.location = { search: '' };
  ctx.CustomEvent = function () {};
  ctx.window.dispatchEvent = () => {};
  ctx.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    key: (i) => [...store.keys()][i] || null,
    get length() { return store.size; },
  };
  ctx.fetch = async (url, init) => {
    const key = init.headers['X-Sync-Key'];
    const handler = { GET: server.onRequestGet, POST: server.onRequestPost, DELETE: server.onRequestDelete }[init.method];
    const resp = await handler({ request: new Request('https://x.test' + url, { method: init.method, headers: init.headers, body: init.body }), env: { DB: db } });
    return { status: resp.status, ok: resp.ok, json: () => resp.json() };
  };
  for (const f of ['js/garden/garden-data.js', 'js/garden/garden.js', 'js/cloud-sync.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx);
  }
  ctx.window.triggerCloudSync = () => {}; // 測試自己控制何時同步
  ctx.store = store; ctx.label = label;
  ctx.setStats = (review, neu) => {
    const o = JSON.parse(store.get('hakkaDailyStats') || '{}');
    o[today()] = [review + neu, review + neu, review, neu, 0, 0, 0, 0, 0];
    store.set('hakkaDailyStats', JSON.stringify(o));
  };
  ctx.G = () => ctx.hakfaGarden;
  return ctx;
}

(async () => {
  console.log('🧪 Starting garden sync tests...');

  // ===== 1. 接線 =====
  {
    const fn = fs.readFileSync(path.join(root, 'functions/api/sync.js'), 'utf8');
    const cs = fs.readFileSync(path.join(root, 'js/cloud-sync.js'), 'utf8');
    assert.ok(/'garden',\s*\/\/ 庭院帳本/.test(fn), '伺服器白名單愛有 garden');
    assert.ok(/\.\.\.\(gardenExport \? \{ garden: gardenExport \} : \{\}\)/.test(cs), '用戶端愛匯出 garden');
    assert.ok(/mergeIncoming\(data\.garden\)/.test(cs), '用戶端愛合併雲端 garden');
    assert.ok(/'garden',\n\];/.test(cs), '手動匯入欄位白名單愛有 garden');
    console.log('  ✅ 1. 接線（匯出、合併、伺服器白名單、手動匯入欄位）PASS');
  }

  // ===== 2. 兩台裝置：同步、並行、答題統計毋會重複入帳 =====
  const A = makeDevice('A'), B = makeDevice('B');
  assert.ok(A.setSyncKey(KEY) && B.setSyncKey(KEY));
  {
    A.setStats(60, 50);                    // 60 題復習／3 ＝ 20，50 題新詞／5 ＝ 10，共 30 滴
    A.G().sync();
    assert.strictEqual(A.G().getState().bank, 30);
    assert.ok(A.G().buySeed('common'));
    assert.ok(A.G().plant('common'));
    for (let i = 0; i < 3; i++) assert.ok(A.G().pour());
    assert.strictEqual(A.G().getState().bank, 17);
    await A.syncFromCloud();

    await B.syncFromCloud();
    const sb = B.G().getState();
    assert.strictEqual(sb.bank, 17, 'B 拉著 A 个水缸，答題統計同步過來也毋會重複入帳');
    assert.strictEqual(sb.plots.length, 2);
    assert.deepStrictEqual(sb.plots.map((p) => p.n).sort(), [0, 3]);
    console.log('  ✅ 2. 兩台裝置同步（水缸、地塊、種子；統計毋重複入帳）PASS');
  }
  {
    // 並行：各自離線澆水，再同步，兩邊个努力都留等
    // 兩台都改成澆起始地（選取地塊係各裝置自家个私人狀態），重載模組讀入
    for (const g of [A, B]) {
      const l = JSON.parse(g.store.get('hakfaGardenLocal')); l.sel = 'p0'; g.store.set('hakfaGardenLocal', JSON.stringify(l));
      vm.runInContext(fs.readFileSync(path.join(root, 'js/garden/garden.js'), 'utf8'), g);
      g.window.triggerCloudSync = () => {};
    }
    for (let i = 0; i < 2; i++) assert.ok(A.G().pour());
    for (let i = 0; i < 4; i++) assert.ok(B.G().pour());
    await A.syncToCloud(); await B.syncFromCloud(); await A.syncFromCloud();
    const a = A.G().getState(), b = B.G().getState();
    assert.deepStrictEqual(a.plots.map((p) => [p.id, p.n]), b.plots.map((p) => [p.id, p.n]), '兩台最後一模共樣');
    assert.strictEqual(a.plots.find((p) => p.id === 'p0').n, 6, 'A 澆 2 ＋ B 澆 4，毋會互相蓋掉');
    assert.strictEqual(a.bank, 17 - 6);
    assert.strictEqual(b.bank, 17 - 6);
    console.log('  ✅ 3. 並行澆水（各自離線、再同步，努力都留等）PASS');
  }

  // ===== 4. 紀元重設：新紀元取代舊裝置个舊資料 =====
  {
    A.G().dev.resetAll();
    await A.syncToCloud();
    await B.syncFromCloud();
    const b = B.G().getState();
    assert.strictEqual(b.bank, 0);
    assert.strictEqual(b.plots.length, 1);
    assert.strictEqual(b.plots[0].n, 0);
    console.log('  ✅ 4. 紀元重設（B 跟著新紀元，已答題統計毋會重新入帳）PASS');
  }

  // ===== 5. 舊版網頁推上來（無 garden 欄位）：伺服器保留雲端原本个 =====
  {
    const row = () => JSON.parse([...db.rows.values()][0].data);
    const before = row().garden;
    assert.ok(before && before.v === 2);
    const cur = await readJson(await call(server.onRequestGet, { db, key: KEY }));
    const r = await call(server.onRequestPost, { db, key: KEY, body: { data: { familiarity: { x: [1, 1] } }, base_updated_at: cur.updated_at } });
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(row().garden, before, '無送 garden 毋會洗掉雲端个');
    assert.deepStrictEqual(row().familiarity, { x: [1, 1] }, '其他欄位照舊覆寫');
    console.log('  ✅ 5. 舊版網頁推送毋會洗掉 garden PASS');
  }

  // ===== 6. 較新版本个資料：這台毋讀、毋改、毋推；雲端原樣保留 =====
  {
    const KEY2 = 'ZZZZYYYYXXXXWWWWVVVVUUUUTTTT2222';
    const seed = await call(server.onRequestPost, { db, key: KEY2, body: { data: { garden: { v: 99, future: { a: 1 } } }, base_updated_at: 0 } });
    assert.strictEqual(seed.status, 200);
    const C = makeDevice('C');
    assert.ok(C.setSyncKey(KEY2));
    C.setStats(30, 0);
    C.G().sync();
    const before = JSON.stringify(C.G().getLedger());
    await C.syncFromCloud();
    const after = JSON.parse([...db.rows.values()].map((r) => r.data).find((d) => d.includes('"future"'))).garden;
    assert.deepStrictEqual(after, { v: 99, future: { a: 1 } }, '雲端較新版本个 garden 毋會被舊版蓋掉');
    assert.strictEqual(C.G().exportForSync(), null, '這台毋推庭院資料');
    assert.strictEqual(C.G().pour(), null, '毋寫');
    console.log('  ✅ 6. 較新版本保護（毋讀、毋改、毋推，雲端原樣）PASS');
  }

  // ===== 7. 升級：舊版（v1）存檔升級成 v2，等值、有備份 =====
  {
    const D = makeDevice('D0');
    // 重做一台：先塞 v1 存檔，再載入模組
    const store = D.store;
    store.clear();
    store.set('hakfaGarden', JSON.stringify({ bank: 12, plots: [{ k: 'common', n: 5 }, { k: 'common', n: 2 }], sel: 1, seeds: { common: 1 } }));
    for (const f of ['js/garden/garden-data.js', 'js/garden/garden.js']) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), D);
    const st = D.G().getState();
    assert.strictEqual(st.bank, 12);
    assert.deepStrictEqual(st.plots.map((p) => p.n), [5, 2]);
    assert.strictEqual(st.seeds.common, 1);
    const backups = [...store.keys()].filter((k) => k.indexOf('hakfaGardenBackup-v1-') === 0);
    assert.strictEqual(backups.length, 1, '升級前原始資料有備份');
    assert.strictEqual(JSON.parse(store.get(backups[0])).bank, 12);
    assert.strictEqual(JSON.parse(store.get('hakfaGarden')).v, 2);
    console.log('  ✅ 7. v1→v2 升級（等值、備份原始資料）PASS');
  }

  console.log('✅ garden_sync_test 全部通過');
})().catch((e) => { console.error(e); process.exit(1); });
