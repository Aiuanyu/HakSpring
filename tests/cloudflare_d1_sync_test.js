// tests/cloudflare_d1_sync_test.js
// 測試 Cloudflare Pages Functions D1 雲端同步 API (/api/sync)
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

// 載入 API 模組
const apiModule = require('../functions/api/sync.js');

// 建立 Mock D1 資料庫
class MockD1 {
  constructor() {
    this.storage = new Map();
  }

  prepare(sql) {
    const db = this;
    return {
      bind(...params) {
        return {
          async run() {
            if (sql.includes('INSERT INTO user_sync')) {
              const [userId, data, clientVersion, now1, now2] = params;
              const existing = db.storage.get(userId);
              db.storage.set(userId, {
                user_id: userId,
                data: data,
                client_version: clientVersion,
                updated_at: now1,
                created_at: existing ? existing.created_at : now2,
              });
              return { success: true };
            }
            return { success: true };
          },
          async first() {
            if (sql.includes('SELECT data, updated_at')) {
              const [userId] = params;
              return db.storage.get(userId) || null;
            }
            if (sql.includes('COUNT(*)')) {
              return { count: db.storage.size };
            }
            return null;
          },
          async all() {
            return { results: Array.from(db.storage.values()) };
          }
        };
      },
      async run() {
        return { success: true };
      },
      async first() {
        if (sql.includes('COUNT(*)')) {
          return { count: db.storage.size };
        }
        return null;
      }
    };
  }
}

test('D1 Sync API: OPTIONS 預檢回傳 204 與 CORS header', async () => {
  const res = await apiModule.onRequestOptions();
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*');
});

test('D1 Sync API: health=1 健康檢查正常連通', async () => {
  const db = new MockD1();
  const context = {
    request: new Request('http://localhost/api/sync?health=1'),
    env: { DB: db }
  };
  const res = await apiModule.onRequestGet(context);
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.status, 'ok');
  assert.equal(json.d1_connected, true);
});

test('D1 Sync API: 未帶 Token / Key 回傳 401 Unauthorized', async () => {
  const db = new MockD1();
  const context = {
    request: new Request('http://localhost/api/sync'),
    env: { DB: db }
  };
  const res = await apiModule.onRequestGet(context);
  assert.equal(res.status, 401);
});

test('D1 Sync API: 透過 X-Sync-Key 寫入與讀取同步資料', async () => {
  const db = new MockD1();
  const syncKey = 'HS-TEST-1234-5678';
  const sampleData = {
    bookmarks: [{ rowId: 1, tableName: '四縣初級' }],
    preferences: { hakfaDisplayScript: 'hpp' },
  };

  // 1. POST 上傳
  const postContext = {
    request: new Request('http://localhost/api/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sync-Key': syncKey,
      },
      body: JSON.stringify({ data: sampleData, client_version: 1 })
    }),
    env: { DB: db }
  };
  const postRes = await apiModule.onRequestPost(postContext);
  assert.equal(postRes.status, 200);
  const postJson = await postRes.json();
  assert.equal(postJson.success, true);

  // 2. GET 拉取
  const getContext = {
    request: new Request('http://localhost/api/sync', {
      headers: { 'X-Sync-Key': syncKey }
    }),
    env: { DB: db }
  };
  const getRes = await apiModule.onRequestGet(getContext);
  assert.equal(getRes.status, 200);
  const getJson = await getRes.json();
  assert.equal(getJson.exists, true);
  assert.deepEqual(getJson.data, sampleData);
});

test('D1 Sync API: 透過 Google ID Token (Bearer) 寫入與讀取', async () => {
  const db = new MockD1();
  // 偽造一個帶有 sub 的 JWT
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
  const payload = Buffer.from(JSON.stringify({ sub: 'google_user_998877' })).toString('base64');
  const fakeJwt = `${header}.${payload}.fakesignature`;

  const sampleData = {
    bookmarks: [{ rowId: 99, tableName: '海陸中高級' }]
  };

  // POST
  const postContext = {
    request: new Request('http://localhost/api/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${fakeJwt}`,
      },
      body: JSON.stringify({ data: sampleData })
    }),
    env: { DB: db }
  };
  const postRes = await apiModule.onRequestPost(postContext);
  assert.equal(postRes.status, 200);

  // GET
  const getContext = {
    request: new Request('http://localhost/api/sync', {
      headers: { 'Authorization': `Bearer ${fakeJwt}` }
    }),
    env: { DB: db }
  };
  const getRes = await apiModule.onRequestGet(getContext);
  assert.equal(getRes.status, 200);
  const getJson = await getRes.json();
  assert.equal(getJson.exists, true);
  assert.equal(getJson.data.bookmarks[0].tableName, '海陸中高級');
});
