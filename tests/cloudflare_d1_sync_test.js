// tests/cloudflare_d1_sync_test.js
// 雲端同步（同步金鑰版）：伺服器 functions/api/sync.js（D1，假資料庫）摎用戶端 js/cloud-sync.js，
// 含兩台裝置對跑（拉取合併、版本衝突 409 重試）。免裝套件；伺服器檔係 ESM，讀成文字轉成 CJS 再執行（Node 20 通用）。
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

(async () => {
  console.log('🧪 Starting cloud sync (sync key) tests...');

  // ===== 1. 認證：只認格式正確个同步金鑰 =====
  {
    const db = new MockD1();
    const forgedJwt = 'Bearer aaa.' + Buffer.from(JSON.stringify({ sub: 'victim-uuid' })).toString('base64url') + '.fakesignature';
    for (const handler of [server.onRequestGet, server.onRequestPost, server.onRequestDelete]) {
      assert.strictEqual((await call(handler, { db, body: { data: {} } })).status, 401, '無金鑰');
      assert.strictEqual((await call(handler, { db, key: 'SHORT', body: { data: {} } })).status, 401, '金鑰忒短');
      assert.strictEqual((await call(handler, { db, key: 'abcdefgh' + '!'.repeat(24), body: { data: {} } })).status, 401, '字元毋對');
      assert.strictEqual((await call(handler, { db, headers: { Authorization: forgedJwt }, body: { data: {} } })).status, 401, '偽造 JWT 愛拒絕');
      assert.strictEqual((await call(handler, { db, headers: { Authorization: 'Bearer some-user-id' }, body: { data: {} } })).status, 401, '裸 user id 愛拒絕');
      assert.strictEqual((await call(handler, { db, url: `https://x.test/api/sync?key=${KEY_A}`, body: { data: {} } })).status, 401, '網址 ?key= 毋接受');
    }
    assert.strictEqual(db.rows.size, 0, '拒絕之後毋會寫任何資料');
    console.log('  ✅ 1. 認證（偽造 JWT、裸 user id、?key=、短／錯格式金鑰攏拒絕）PASS');
  }

  // ===== 2. 基本讀寫、白名單、正規化、不存金鑰本身 =====
  {
    const db = new MockD1();
    let r = await call(server.onRequestGet, { db, key: KEY_A });
    assert.deepStrictEqual(await readJson(r), { exists: false, data: null, updated_at: 0 });
    r = await call(server.onRequestPost, { db, key: KEY_A, body: { data: { bookmarks: [{ tableName: 't' }], preferences: { a: 1 }, evil_field: 'x' }, base_updated_at: 0 } });
    assert.strictEqual(r.status, 200);
    const saved = await readJson(r);
    assert.ok(saved.success && saved.updated_at > 0);
    const got = await readJson(await call(server.onRequestGet, { db, key: KEY_A }));
    assert.ok(got.exists && got.updated_at === saved.updated_at);
    assert.deepStrictEqual(got.data.bookmarks, [{ tableName: 't' }]);
    assert.strictEqual(got.data.evil_field, undefined, '白名單外个欄位愛丟掉');
    // 正規化：小寫＋連字號同一把
    const lower = 'abcd-efgh-2345-6723-abcd-efgh-2345-67ab';
    assert.strictEqual((await readJson(await call(server.onRequestGet, { db, key: lower }))).exists, true);
    // 資料庫毋存金鑰本身
    for (const id of db.rows.keys()) assert.ok(/^[0-9a-f]{64}$/.test(id) && !id.includes(KEY_A));
    // 別把金鑰看毋著
    assert.strictEqual((await readJson(await call(server.onRequestGet, { db, key: KEY_B }))).exists, false, '跨金鑰隔離');
    console.log('  ✅ 2. 讀寫、白名單、正規化、只存雜湊、跨金鑰隔離 PASS');
  }

  // ===== 3. 並發保護（compare-and-swap） =====
  {
    const db = new MockD1();
    const first = await readJson(await call(server.onRequestPost, { db, key: KEY_A, body: { data: { familiarity: { a: [1, 1] } }, base_updated_at: 0 } }));
    // 版本正確 → 成功，版本遞增
    const second = await readJson(await call(server.onRequestPost, { db, key: KEY_A, body: { data: { familiarity: { a: [1, 1], b: [2, 2] } }, base_updated_at: first.updated_at } }));
    assert.ok(second.updated_at > first.updated_at);
    // 過期版本 → 409，並回目前資料
    let r = await call(server.onRequestPost, { db, key: KEY_A, body: { data: { familiarity: { stale: [9, 9] } }, base_updated_at: first.updated_at } });
    assert.strictEqual(r.status, 409);
    const conflict = await readJson(r);
    assert.strictEqual(conflict.updated_at, second.updated_at);
    assert.deepStrictEqual(conflict.data.familiarity, { a: [1, 1], b: [2, 2] }, '衝突時回目前資料，用戶端好合併');
    // 已有資料還用 base=0（以為雲端無資料）→ 409，毋會覆蓋
    r = await call(server.onRequestPost, { db, key: KEY_A, body: { data: { familiarity: {} }, base_updated_at: 0 } });
    assert.strictEqual(r.status, 409);
    assert.deepStrictEqual((await readJson(await call(server.onRequestGet, { db, key: KEY_A }))).data.familiarity, { a: [1, 1], b: [2, 2] });
    console.log('  ✅ 3. 並發保護（409，毋會互相覆蓋）PASS');
  }

  // ===== 4. 大小、格式、錯誤訊息、刪除、health =====
  {
    const db = new MockD1();
    // 宣告忒大
    let r = await call(server.onRequestPost, { db, key: KEY_A, headers: { 'Content-Length': String(2_000_000) }, body: { data: {} } });
    assert.strictEqual(r.status, 413, 'Content-Length 忒大');
    // 實際位元組忒大（中文字 3 位元組：字元數 < 1.5M 但位元組 > 1.5M）
    const big = { data: { preferences: { note: '客'.repeat(520_000) } }, base_updated_at: 0 };
    r = await call(server.onRequestPost, { db, key: KEY_A, body: big });
    assert.strictEqual(r.status, 413, '用位元組算，毋係字元數');
    assert.strictEqual((await call(server.onRequestPost, { db, key: KEY_A, body: '{壞掉' })).status, 400, '壞 JSON');
    assert.strictEqual((await call(server.onRequestPost, { db, key: KEY_A, body: { nodata: 1 } })).status, 400, '無 data 欄位毋收（毋再把整個 body 當資料）');
    assert.strictEqual((await call(server.onRequestPost, { db, key: KEY_A, body: { data: { bookmarks: 'x' } } })).status, 400, '型態毋對');
    assert.strictEqual((await call(server.onRequestPost, { db, key: KEY_A, body: { data: {}, base_updated_at: -1 } })).status, 400, '版本毋對');
    // 內部錯誤毋洩漏
    db.failNext = true;
    const realError = console.error; console.error = () => {};
    r = await call(server.onRequestGet, { db, key: KEY_A });
    console.error = realError;
    assert.strictEqual(r.status, 500);
    const text = await r.text();
    assert.ok(!text.includes('SECRET-INTERNAL-DETAIL'), '毋回傳內部錯誤訊息');
    // 無資料庫綁定
    assert.strictEqual((await call(server.onRequestGet, { db: null, key: KEY_A })).status, 503);
    // health 淨回狀態
    const health = await readJson(await call(server.onRequestGet, { db, url: 'https://x.test/api/sync?health=1' }));
    assert.deepStrictEqual(health, { status: 'ok' });
    // 刪除
    await call(server.onRequestPost, { db, key: KEY_A, body: { data: {}, base_updated_at: 0 } });
    assert.strictEqual((await call(server.onRequestDelete, { db, key: KEY_A })).status, 200);
    assert.strictEqual((await readJson(await call(server.onRequestGet, { db, key: KEY_A }))).exists, false);
    // 回應有 no-store
    assert.strictEqual((await call(server.onRequestGet, { db, key: KEY_A })).headers.get('Cache-Control'), 'no-store');
    console.log('  ✅ 4. 大小（位元組）、格式、錯誤訊息、刪除、health PASS');
  }

  // ===== 5. 用戶端：金鑰工具 =====
  const db = new MockD1();
  function makeDevice(label) {
    const store = new Map();
    const ctx = vm.createContext({ console: { log() {}, warn() {}, error() {} }, setInterval() {}, clearInterval() {}, setTimeout, clearTimeout, URL, URLSearchParams, TextEncoder, crypto, Date, JSON, AbortController });
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
    ctx.fetch = async (url, init) => {
      const key = init.headers['X-Sync-Key'];
      const handler = { GET: server.onRequestGet, POST: server.onRequestPost, DELETE: server.onRequestDelete }[init.method];
      const resp = await handler({ request: new Request('https://x.test' + url, { method: init.method, headers: init.headers, body: init.body }), env: { DB: db } });
      return { status: resp.status, ok: resp.ok, json: () => resp.json() };
    };
    vm.runInContext(fs.readFileSync(path.join(root, 'js/cloud-sync.js'), 'utf8'), ctx);
    ctx.store = store; ctx.label = label;
    return ctx;
  }
  {
    const d = makeDevice('tools');
    const a = d.generateSyncKey(), b = d.generateSyncKey();
    assert.ok(/^[A-Z2-7]{32}$/.test(a) && a !== b, '32 碼 Base32，每擺無共樣');
    assert.strictEqual(d.formatSyncKey(a).split('-').length, 8);
    assert.strictEqual(d.normalizeSyncKey(d.formatSyncKey(a).toLowerCase()), a);
    assert.ok(d.isValidSyncKey(d.formatSyncKey(a)) && !d.isValidSyncKey('短') && !d.isValidSyncKey(a.slice(1)) && !d.isValidSyncKey(a.replace(/./, '1')));
    assert.strictEqual(d.hasSyncKey(), false);
    assert.strictEqual(d.setSyncKey('壞掉'), false);
    assert.strictEqual(d.setSyncKey(d.formatSyncKey(a)), true);
    assert.strictEqual(d.getSyncKey(), a);
    d.localStorage.setItem('hakkaSyncKey', 'oldformat'); // 舊版（≥8 碼自訂）个殘留值愛當作無金鑰
    assert.strictEqual(d.hasSyncKey(), false);
    d.setSyncKey(a); d.clearSyncKey();
    assert.strictEqual(d.hasSyncKey(), false);
    console.log('  ✅ 5. 用戶端金鑰工具 PASS');
  }

  // ===== 6. 兩台裝置：推送、拉取合併、版本衝突重試 =====
  {
    const A = makeDevice('A'), B = makeDevice('B');
    assert.ok(A.setSyncKey(KEY_A) && B.setSyncKey(KEY_A));
    A.localStorage.setItem('hakkaFamiliarity', JSON.stringify({ a: [1, 100] }));
    B.localStorage.setItem('hakkaFamiliarity', JSON.stringify({ b: [2, 200] }));

    // A 先同步：雲端無資料 → 上傳
    await A.syncFromCloud();
    const afterA = [...db.rows.values()].find((r) => r.data.includes('"a"'));
    assert.ok(afterA, 'A 个資料已上傳');
    const revA = A.localStorage.getItem('hakkaSyncCloudRev');
    assert.strictEqual(Number(revA), afterA.updated_at);

    // B 拉取：合併兩邊，並推回
    await B.syncFromCloud();
    const famB = JSON.parse(B.localStorage.getItem('hakkaFamiliarity'));
    assert.deepStrictEqual(Object.keys(famB).sort(), ['a', 'b'], 'B 合併著 A 个資料');
    const serverFam = JSON.parse([...db.rows.values()][0].data).familiarity;
    assert.deepStrictEqual(Object.keys(serverFam).sort(), ['a', 'b'], '合併結果推回雲端');

    // 衝突：A 手上版本已過期（B 剛推過），A 又改資料後直接推送
    A.localStorage.setItem('hakkaFamiliarity', JSON.stringify({ a: [1, 100], c: [3, 300] }));
    const ok = await A.syncToCloud();
    assert.strictEqual(ok, true, '409 後合併再推，最後成功');
    const finalFam = JSON.parse([...db.rows.values()][0].data).familiarity;
    assert.deepStrictEqual(Object.keys(finalFam).sort(), ['a', 'b', 'c'], '衝突重試：B 个 b 毋會被 A 蓋掉');
    assert.deepStrictEqual(Object.keys(JSON.parse(A.localStorage.getItem('hakkaFamiliarity'))).sort(), ['a', 'b', 'c']);

    // 金鑰毋對（別把）：拿毋著資料，也毋會寫到別人
    const C = makeDevice('C'); C.setSyncKey(KEY_B);
    C.localStorage.setItem('hakkaFamiliarity', JSON.stringify({ z: [9, 9] }));
    await C.syncFromCloud();
    assert.strictEqual(db.rows.size, 2, '另一把金鑰係獨立一列');
    assert.deepStrictEqual(Object.keys(JSON.parse(C.localStorage.getItem('hakkaFamiliarity'))), ['z']);

    // 無金鑰：毋做任何網路請求
    const D = makeDevice('D'); let called = false; D.fetch = async () => { called = true; };
    await D.syncFromCloud(); assert.strictEqual(await D.syncToCloud(), false); assert.strictEqual(called, false);
    console.log('  ✅ 6. 兩台裝置對跑（拉取合併、409 重試、隔離、無金鑰毋連線）PASS');
  }

  // ===== 7. 接線：殘留个舊路徑愛清掉 =====
  {
    const src = fs.readFileSync(path.join(root, 'js/cloud-sync.js'), 'utf8');
    assert.ok(!/periodicSyncTimer|startPeriodicSync|stopPeriodicSync/.test(src), '定時輪詢殘留（會 ReferenceError）');
    assert.ok(!/SUPABASE_QUERY_TIMEOUT_MS/.test(src));
    assert.ok(!/Authorization/.test(src), '前端毋送 Authorization');
    const migration = fs.readFileSync(path.join(root, 'migrations/0001_init.sql'), 'utf8');
    assert.ok(/CREATE TABLE IF NOT EXISTS user_sync/.test(migration));
    const fn = fs.readFileSync(path.join(root, 'functions/api/sync.js'), 'utf8');
    assert.ok(!/CREATE TABLE/.test(fn), '建表放 migration，毋每擺請求跑 DDL');
    console.log('  ✅ 7. 殘留路徑、migration PASS');
  }

  // ===== 8. CORS 與本機跨域支援 =====
  {
    // localhost 來源（支援本機開發）
    const reqLocal = new Request('https://hakspring.pages.dev/api/sync', {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost' },
    });
    const resLocal = await server.onRequestOptions({ request: reqLocal });
    assert.strictEqual(resLocal.status, 204);
    assert.strictEqual(resLocal.headers.get('Access-Control-Allow-Origin'), 'http://localhost');
    assert.ok(resLocal.headers.get('Access-Control-Allow-Headers').includes('X-Sync-Key'));

    // 127.0.0.1 來源
    const reqIp = new Request('https://hakspring.pages.dev/api/sync', {
      method: 'OPTIONS',
      headers: { Origin: 'http://127.0.0.1:8080' },
    });
    const resIp = await server.onRequestOptions({ request: reqIp });
    assert.strictEqual(resIp.headers.get('Access-Control-Allow-Origin'), 'http://127.0.0.1:8080');

    // 未知惡意來源拒絕 CORS
    const reqEvil = new Request('https://hakspring.pages.dev/api/sync', {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.attacker.com' },
    });
    const resEvil = await server.onRequestOptions({ request: reqEvil });
    assert.strictEqual(resEvil.headers.get('Access-Control-Allow-Origin'), null);

    // GET 請求帶 Origin 時回傳正確 Access-Control-Allow-Origin
    const db = new MockD1();
    const getReq = new Request('https://hakspring.pages.dev/api/sync', {
      method: 'GET',
      headers: { Origin: 'http://localhost', 'X-Sync-Key': KEY_A },
    });
    const getRes = await server.onRequestGet({ request: getReq, env: { DB: db } });
    assert.strictEqual(getRes.headers.get('Access-Control-Allow-Origin'), 'http://localhost');

    console.log('  ✅ 8. CORS（支援 localhost/127.0.0.1 本機開發、阻擋惡意跨域）PASS');
  }

  console.log('✨ All cloud sync tests passed!');
})().catch((err) => { console.error(err); process.exit(1); });
