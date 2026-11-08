/**
 * Cloudflare Pages Functions - 雲端同步 API (/api/sync)
 * 後端資料庫：Cloudflare D1 (綁定名稱：DB)
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Sync-Key, X-Client-Version',
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...CORS_HEADERS,
    },
  });
}

/**
 * 自動防禦建表（若尚未建表，自動執行初始化）
 */
async function ensureTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS user_sync (
      user_id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      client_version INTEGER DEFAULT 1,
      updated_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
  `).run();
}

/**
 * 從請求中解析並驗證使用者身分
 * 支援兩種身分來源：
 * 1. Authorization: Bearer <user_id_or_token> (Google 登入後之 user.id 或 ID Token)
 * 2. X-Sync-Key: <sync_key> (手動專屬同步金鑰)
 */
function extractUserId(request) {
  // 1. 優先檢查 X-Sync-Key
  const syncKey = request.headers.get('X-Sync-Key');
  if (syncKey && syncKey.trim().length >= 8) {
    return 'key_' + syncKey.trim();
  }

  // 2. 檢查 Authorization Header
  const auth = request.headers.get('Authorization');
  if (auth && auth.startsWith('Bearer ')) {
    const token = auth.slice(7).trim();
    if (token) {
      // 若是 JWT (三個部分以點號相隔)，嘗試解析其中的 sub
      if (token.includes('.')) {
        try {
          const parts = token.split('.');
          if (parts.length === 3) {
            const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
            if (payload && payload.sub) {
              return 'sub_' + payload.sub;
            }
          }
        } catch (_) {}
      }
      // 若為一般 UUID 或標識字串
      return 'user_' + token;
    }
  }

  // 3. 備用：Query 參數 (?key=...)
  const url = new URL(request.url);
  const qKey = url.searchParams.get('key');
  if (qKey && qKey.trim().length >= 8) {
    return 'key_' + qKey.trim();
  }

  return null;
}

/**
 * OPTIONS 預檢請求
 */
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

/**
 * GET /api/sync
 * 拉取雲端同步資料
 */
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // 健康檢查端點 (?health=1)
  if (url.searchParams.get('health') === '1') {
    if (!env || !env.DB) {
      return jsonResponse({
        status: 'error',
        message: 'D1 binding (DB) is not configured in Cloudflare Pages.',
      }, 500);
    }
    try {
      await ensureTable(env.DB);
      const test = await env.DB.prepare('SELECT COUNT(*) as count FROM user_sync').first();
      return jsonResponse({
        status: 'ok',
        d1_connected: true,
        record_count: test?.count || 0,
        timestamp: new Date().toISOString(),
      });
    } catch (e) {
      return jsonResponse({
        status: 'error',
        message: e.message || String(e),
      }, 500);
    }
  }

  if (!env || !env.DB) {
    return jsonResponse({ error: 'Database binding (DB) is not configured' }, 500);
  }

  const userId = extractUserId(request);
  if (!userId) {
    return jsonResponse({ error: 'Unauthorized: Missing Authorization or X-Sync-Key' }, 401);
  }

  try {
    await ensureTable(env.DB);
    const row = await env.DB.prepare(
      'SELECT data, updated_at, client_version FROM user_sync WHERE user_id = ?'
    ).bind(userId).first();

    if (!row) {
      return jsonResponse({
        exists: false,
        data: null,
        updated_at: 0,
      });
    }

    let parsedData = null;
    try {
      parsedData = JSON.parse(row.data);
    } catch (parseErr) {
      console.error('[D1 Sync] JSON 解析失敗:', parseErr);
      return jsonResponse({ error: 'Corrupted sync data in database' }, 500);
    }

    return jsonResponse({
      exists: true,
      data: parsedData,
      updated_at: row.updated_at,
      client_version: row.client_version,
    });
  } catch (err) {
    console.error('[D1 Sync] GET 錯誤:', err);
    return jsonResponse({ error: err.message || 'Failed to fetch sync data' }, 500);
  }
}

/**
 * POST /api/sync
 * 上傳/智慧保存同步資料
 */
export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env || !env.DB) {
    return jsonResponse({ error: 'Database binding (DB) is not configured' }, 500);
  }

  const userId = extractUserId(request);
  if (!userId) {
    return jsonResponse({ error: 'Unauthorized: Missing Authorization or X-Sync-Key' }, 401);
  }

  try {
    let body;
    try {
      body = await request.json();
    } catch (_) {
      return jsonResponse({ error: 'Invalid JSON payload' }, 400);
    }

    const payloadData = body.data || body;
    if (!payloadData || typeof payloadData !== 'object') {
      return jsonResponse({ error: 'Missing or invalid data field' }, 400);
    }

    const clientVersion = Number(body.client_version || payloadData.version || 1);
    const dataString = JSON.stringify(payloadData);

    // 防護：限制單一使用者備份大小不超過 5 MB
    if (dataString.length > 5 * 1024 * 1024) {
      return jsonResponse({ error: 'Payload exceeds 5MB limit' }, 413);
    }

    const now = Date.now();
    await ensureTable(env.DB);

    await env.DB.prepare(`
      INSERT INTO user_sync (user_id, data, client_version, updated_at, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        data = excluded.data,
        client_version = excluded.client_version,
        updated_at = excluded.updated_at;
    `).bind(userId, dataString, clientVersion, now, now).run();

    return jsonResponse({
      success: true,
      updated_at: now,
    });
  } catch (err) {
    console.error('[D1 Sync] POST 錯誤:', err);
    return jsonResponse({ error: err.message || 'Failed to save sync data' }, 500);
  }
}
