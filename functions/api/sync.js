/**
 * Cloudflare Pages Functions - 雲端同步 API (/api/sync)
 * 後端資料庫：Cloudflare D1（綁定名稱：DB；資料表見 migrations/0001_init.sql）
 *
 * 身分：免登入，用「同步金鑰」（X-Sync-Key）。金鑰由用戶端隨機產生（32 碼 Base32，160 位元），
 * 伺服器淨存金鑰个 SHA-256 當 user_id，毋存金鑰本身。金鑰毋會出現在網址、log 抑係 Referer。
 * 同源使用，毋開 CORS。
 *
 * 並發：POST 帶 base_updated_at（用戶端上次看著个版本）。伺服器照版本做 compare-and-swap，
 * 版本對毋著回 409 摎目前个資料，用戶端重新合併再推（合併函式在 js/cloud-sync.js）。
 */

const MAX_BODY_BYTES = 1_500_000; // D1 單列上限約 2 MB，留餘裕
const KEY_PATTERN = /^[A-Z2-7]{32}$/;
const HASH_PREFIX = 'hakspring-sync-v1:';

// 同步資料包个欄位白名單（見 js/cloud-sync.js exportCurrentSyncData）；別个欄位會被丟掉
const ARRAY_FIELDS = ['bookmarks'];
const OBJECT_FIELDS = [
  'preferences',
  'learning_progress',
  'daily_stats',
  'daily_stats_by_level',
  'daily_favs',
  'familiarity',
];

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** 同步金鑰正規化：去掉連字號摎空白、轉大寫。 */
function normalizeKey(raw) {
  return String(raw || '').replace(/[\s-]/g, '').toUpperCase();
}

/** 從請求拿同步金鑰，回傳 user_id（金鑰个雜湊）；格式毋對回 null。 */
async function userIdFromRequest(request) {
  const key = normalizeKey(request.headers.get('X-Sync-Key'));
  if (!KEY_PATTERN.test(key)) return null;
  return sha256Hex(HASH_PREFIX + key);
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** 只留白名單欄位，型態對毋著就回 null。 */
function sanitizeData(data) {
  if (!isPlainObject(data)) return null;
  const clean = {};
  for (const field of ARRAY_FIELDS) {
    if (data[field] === undefined) continue;
    if (!Array.isArray(data[field])) return null;
    clean[field] = data[field];
  }
  for (const field of OBJECT_FIELDS) {
    if (data[field] === undefined) continue;
    if (!isPlainObject(data[field])) return null;
    clean[field] = data[field];
  }
  if (typeof data.updated_at === 'string') clean.updated_at = data.updated_at.slice(0, 40);
  if (Number.isFinite(data.version)) clean.version = data.version;
  return clean;
}

async function currentRow(db, userId) {
  const row = await db
    .prepare('SELECT data, updated_at FROM user_sync WHERE user_id = ?')
    .bind(userId)
    .first();
  if (!row) return { exists: false, data: null, updated_at: 0 };
  try {
    return { exists: true, data: JSON.parse(row.data), updated_at: row.updated_at };
  } catch (_) {
    return null; // 資料毀損
  }
}

/** GET /api/sync：拉取雲端資料；?health=1 淨回狀態（毋含內部訊息） */
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  if (url.searchParams.get('health') === '1') {
    return env && env.DB ? jsonResponse({ status: 'ok' }) : jsonResponse({ status: 'error' }, 500);
  }
  if (!env || !env.DB) return jsonResponse({ error: 'unavailable' }, 503);

  const userId = await userIdFromRequest(request);
  if (!userId) return jsonResponse({ error: 'unauthorized' }, 401);

  try {
    const row = await currentRow(env.DB, userId);
    if (!row) return jsonResponse({ error: 'corrupted' }, 500);
    return jsonResponse(row);
  } catch (err) {
    console.error('[sync] GET failed:', err);
    return jsonResponse({ error: 'server_error' }, 500);
  }
}

/** POST /api/sync：body = { data, base_updated_at }；版本對毋著回 409 */
export async function onRequestPost({ request, env }) {
  if (!env || !env.DB) return jsonResponse({ error: 'unavailable' }, 503);

  const userId = await userIdFromRequest(request);
  if (!userId) return jsonResponse({ error: 'unauthorized' }, 401);

  // 先看 Content-Length，免得讀大 body；之後再用實際位元組數檢查（Content-Length 做得假）
  const declared = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return jsonResponse({ error: 'too_large' }, 413);
  }
  let text;
  try {
    text = await request.text();
  } catch (_) {
    return jsonResponse({ error: 'bad_request' }, 400);
  }
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) {
    return jsonResponse({ error: 'too_large' }, 413);
  }

  let body;
  try {
    body = JSON.parse(text);
  } catch (_) {
    return jsonResponse({ error: 'bad_request' }, 400);
  }
  if (!isPlainObject(body)) return jsonResponse({ error: 'bad_request' }, 400);

  const data = sanitizeData(body.data);
  const base = body.base_updated_at === undefined ? 0 : body.base_updated_at;
  if (!data || !Number.isSafeInteger(base) || base < 0) {
    return jsonResponse({ error: 'bad_request' }, 400);
  }
  const dataString = JSON.stringify(data);
  if (new TextEncoder().encode(dataString).length > MAX_BODY_BYTES) {
    return jsonResponse({ error: 'too_large' }, 413);
  }

  try {
    const now = Math.max(Date.now(), base + 1);
    let result;
    if (base === 0) {
      // 第一擺：淨在無這列个時節寫入
      result = await env.DB.prepare(
        `INSERT INTO user_sync (user_id, data, client_version, updated_at, created_at)
         VALUES (?, ?, 1, ?, ?) ON CONFLICT(user_id) DO NOTHING`,
      ).bind(userId, dataString, now, now).run();
    } else {
      result = await env.DB.prepare(
        'UPDATE user_sync SET data = ?, updated_at = ? WHERE user_id = ? AND updated_at = ?',
      ).bind(dataString, now, userId, base).run();
    }
    const changed = result && result.meta ? result.meta.changes : 0;
    if (changed === 0) {
      const row = await currentRow(env.DB, userId);
      return jsonResponse({ error: 'conflict', ...(row || {}) }, 409);
    }
    return jsonResponse({ success: true, updated_at: now });
  } catch (err) {
    console.error('[sync] POST failed:', err);
    return jsonResponse({ error: 'server_error' }, 500);
  }
}

/** DELETE /api/sync：刪掉這把金鑰个雲端資料 */
export async function onRequestDelete({ request, env }) {
  if (!env || !env.DB) return jsonResponse({ error: 'unavailable' }, 503);
  const userId = await userIdFromRequest(request);
  if (!userId) return jsonResponse({ error: 'unauthorized' }, 401);
  try {
    await env.DB.prepare('DELETE FROM user_sync WHERE user_id = ?').bind(userId).run();
    return jsonResponse({ success: true });
  } catch (err) {
    console.error('[sync] DELETE failed:', err);
    return jsonResponse({ error: 'server_error' }, 500);
  }
}
