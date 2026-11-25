// 客源翠企盤數據追蹤與 Dashboard API
// POST /api/kipan-stats : 公開接收匿名統計（download_click / optin_stats / dialect_survey）
// GET  /api/kipan-stats?action=dashboard : 需 X-Maintainer-Key，回傳 GitHub 下載量與 D1 統計彙整

const ALLOWED_ORIGINS = [
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
  /^https:\/\/aiuanyu\.github\.io$/,
  /^https:\/\/([a-z0-9-]+\.)?hakspring\.pages\.dev$/,
];

const VALID_EVENT_TYPES = new Set(['download_click', 'optin_stats', 'dialect_survey']);
const VALID_PLATFORMS = new Set(['android', 'macos', 'windows', 'ios', 'web', 'unknown']);
const VALID_DIALECTS = new Set(['xiien', 'namxiian', 'hoiliug', 'taibu', 'ngiaupin', 'zhioon', 'multi', '']);
const initializedDbs = new WeakSet();

function corsHeaders(request) {
  const origin = request ? request.headers.get('Origin') : '';
  const allowOrigin =
    origin && ALLOWED_ORIGINS.some((re) => re.test(origin))
      ? origin
      : 'https://hakspring.pages.dev';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Maintainer-Key',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function jsonResponse(body, status = 200, request = null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...corsHeaders(request),
    },
  });
}

async function sha256Hex(input) {
  const bytes = new TextEncoder().encode(String(input || ''));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function ensureTables(db) {
  if (!db || initializedDbs.has(db)) return;
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS kipan_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        platform TEXT NOT NULL,
        version TEXT DEFAULT '',
        dialect TEXT DEFAULT '',
        payload TEXT DEFAULT '{}',
        created_at INTEGER NOT NULL
      )`
    )
    .run();
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS maintainer_config (
        config_key TEXT PRIMARY KEY,
        config_value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )`
    )
    .run();
  initializedDbs.add(db);
}

async function verifyMaintainerKey(request, env) {
  const rawKey = (request.headers.get('X-Maintainer-Key') || '').trim();
  if (!rawKey || rawKey.length < 8 || rawKey.length > 128) {
    return {
      ok: false,
      status: 401,
      error: '缺少有效个維護者金鑰（請先輸入維護者金鑰）',
    };
  }

  const incomingHash = await sha256Hex(rawKey);
  if (env.MAINTAINER_KEY_HASH) {
    const ok = incomingHash === String(env.MAINTAINER_KEY_HASH).trim().toLowerCase();
    return ok ? { ok: true } : { ok: false, status: 403, error: '維護者金鑰驗證失敗' };
  }
  if (env.MAINTAINER_KEY) {
    const ok = rawKey === String(env.MAINTAINER_KEY).trim();
    return ok ? { ok: true } : { ok: false, status: 403, error: '維護者金鑰驗證失敗' };
  }

  if (!env.DB) {
    return { ok: false, status: 500, error: 'DB 尚未綁定' };
  }

  await ensureTables(env.DB);
  const existing = await env.DB.prepare(
    'SELECT config_value FROM maintainer_config WHERE config_key = ?'
  )
    .bind('maintainer_key_hash')
    .first();

  if (!existing) {
    return { ok: false, status: 403, error: '尚未設定維護者金鑰，請先於維護工具初始化金鑰' };
  }

  if (existing.config_value !== incomingHash) {
    return { ok: false, status: 403, error: '維護者金鑰驗證失敗' };
  }
  return { ok: true };
}

const GH_CACHE_TTL_MS = 5 * 60 * 1000;

async function fetchGitHubReleases(env) {
  const now = Date.now();
  let cachedPayload = null;
  let cachedAt = 0;

  if (env && env.DB) {
    try {
      await ensureTables(env.DB);
      const cached = await env.DB.prepare(
        'SELECT config_value, updated_at FROM maintainer_config WHERE config_key = ?'
      )
        .bind('github_releases_cache')
        .first();
      if (cached && cached.config_value) {
        cachedPayload = JSON.parse(cached.config_value);
        cachedAt = Number(cached.updated_at || 0);
        if (now - cachedAt < GH_CACHE_TTL_MS) {
          return { ...cachedPayload, cached: true, cachedAt };
        }
      }
    } catch (_e) {
      // 快取讀取失敗不影響後續抓取
    }
  }

  try {
    const headers = {
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'HakSpring-Kipan-Dashboard',
    };
    if (env && env.GITHUB_TOKEN) {
      headers['Authorization'] = `Bearer ${String(env.GITHUB_TOKEN).trim()}`;
    }

    const resp = await fetch('https://api.github.com/repos/Aiuanyu/HakSpring-Kipan/releases?per_page=15', {
      headers,
    });
    if (!resp.ok) {
      if (cachedPayload) {
        return {
          ...cachedPayload,
          cached: true,
          stale: true,
          cachedAt,
          warning: `GitHub API HTTP ${resp.status}（暫時顯示快取數據）`,
        };
      }
      return { ok: false, error: `GitHub API HTTP ${resp.status}（Cloudflare 共享 IP 限流，可設定 GITHUB_TOKEN Secret 解決）`, releases: [], totalDownloads: 0 };
    }
    const list = await resp.json();
    let totalDownloads = 0;
    const releases = (Array.isArray(list) ? list : []).map((rel) => {
      const assets = (Array.isArray(rel.assets) ? rel.assets : []).map((a) => {
        const count = Number(a.download_count || 0);
        totalDownloads += count;
        return {
          name: a.name,
          size: Number(a.size || 0),
          downloadCount: count,
          updatedAt: a.updated_at,
        };
      });
      return {
        tagName: rel.tag_name,
        name: rel.name || rel.tag_name,
        prerelease: Boolean(rel.prerelease),
        publishedAt: rel.published_at,
        assets,
      };
    });
    const fresh = { ok: true, releases, totalDownloads };
    if (env && env.DB) {
      try {
        await env.DB.prepare(
          `INSERT INTO maintainer_config (config_key, config_value, updated_at)
           VALUES ('github_releases_cache', ?, ?)
           ON CONFLICT(config_key) DO UPDATE SET config_value = excluded.config_value, updated_at = excluded.updated_at`
        )
          .bind(JSON.stringify(fresh), now)
          .run();
      } catch (_e) {
        // 忽略快取寫入失敗
      }
    }
    return fresh;
  } catch (err) {
    if (cachedPayload) {
      return {
        ...cachedPayload,
        cached: true,
        stale: true,
        cachedAt,
        warning: `${err.message || 'GitHub API 連線失敗'}（顯示快取數據）`,
      };
    }
    return { ok: false, error: err.message || 'GitHub API 連線失敗', releases: [], totalDownloads: 0 };
  }
}

export async function onRequestOptions(context) {
  return new Response(null, { status: 204, headers: corsHeaders(context.request) });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try {
    body = await request.json();
  } catch (_err) {
    return jsonResponse({ error: '無效的 JSON 格式' }, 400, request);
  }

  const eventType = String(body.event_type || '').trim();
  if (!VALID_EVENT_TYPES.has(eventType)) {
    return jsonResponse({ error: '不支援的 event_type' }, 400, request);
  }

  const rawPlatform = String(body.platform || 'unknown').trim().toLowerCase();
  const platform = VALID_PLATFORMS.has(rawPlatform) ? rawPlatform : 'unknown';

  const version = String(body.version || '').trim().slice(0, 32).replace(/[^a-zA-Z0-9._+-]/g, '');
  const rawDialect = String(body.dialect || '').trim().toLowerCase();
  const dialect = VALID_DIALECTS.has(rawDialect) ? rawDialect : '';

  let payloadStr = '{}';
  if (body.payload && typeof body.payload === 'object') {
    const serialized = JSON.stringify(body.payload);
    if (serialized.length > 1000) {
      return jsonResponse({ error: 'payload 過長（上限 1000 字元）' }, 400, request);
    }
    payloadStr = serialized;
  }

  if (!env.DB) {
    return jsonResponse({ ok: true, stored: false, note: 'DB not bound' }, 200, request);
  }

  await ensureTables(env.DB);
  await env.DB.prepare(
    `INSERT INTO kipan_events (event_type, platform, version, dialect, payload, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(eventType, platform, version, dialect, payloadStr, Date.now())
    .run();

  return jsonResponse({ ok: true, stored: true }, 200, request);
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const action = url.searchParams.get('action') || 'dashboard';

  if (action !== 'dashboard') {
    return jsonResponse({ error: '未知的 action' }, 400, request);
  }

  const auth = await verifyMaintainerKey(request, env);
  if (!auth.ok) {
    return jsonResponse({ error: auth.error }, auth.status, request);
  }

  const githubPromise = fetchGitHubReleases(env);

  let dbStats = {
    totalsByType: [],
    downloadClicksByPlatform: [],
    updateChecksByPlatformVersion: [],
    dialectBreakdown: [],
    dailyEvents: [],
    recentFeedback: [],
  };

  if (env.DB) {
    await ensureTables(env.DB);
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    const [byType, dlByPlatform, updByVer, dialects, daily, feedback] = await Promise.all([
      env.DB.prepare(
        `SELECT event_type, COUNT(*) AS cnt FROM kipan_events GROUP BY event_type`
      ).all(),
      env.DB.prepare(
        `SELECT platform, COUNT(*) AS cnt FROM kipan_events WHERE event_type = 'download_click' GROUP BY platform`
      ).all(),
      env.DB.prepare(
        `SELECT platform, version, COUNT(*) AS cnt FROM kipan_events WHERE event_type = 'update_check' GROUP BY platform, version ORDER BY cnt DESC LIMIT 20`
      ).all(),
      env.DB.prepare(
        `SELECT dialect, event_type, COUNT(*) AS cnt FROM kipan_events WHERE dialect != '' GROUP BY dialect, event_type`
      ).all(),
      env.DB.prepare(
        `SELECT strftime('%Y-%m-%d', created_at / 1000, 'unixepoch', '+8 hours') AS day, event_type, COUNT(*) AS cnt
         FROM kipan_events
         WHERE created_at >= ?
         GROUP BY day, event_type
         ORDER BY day ASC`
      )
        .bind(thirtyDaysAgo)
        .all(),
      env.DB.prepare(
        `SELECT id, event_type, platform, version, dialect, payload, created_at
         FROM kipan_events
         WHERE event_type IN ('dialect_survey', 'optin_stats')
         ORDER BY created_at DESC
         LIMIT 50`
      ).all(),
    ]);

    dbStats = {
      totalsByType: byType.results || [],
      downloadClicksByPlatform: dlByPlatform.results || [],
      updateChecksByPlatformVersion: updByVer.results || [],
      dialectBreakdown: dialects.results || [],
      dailyEvents: daily.results || [],
      recentFeedback: (feedback.results || []).map((row) => {
        let parsed = {};
        try {
          parsed = JSON.parse(row.payload || '{}');
        } catch (_e) {
          parsed = {};
        }
        return {
          id: row.id,
          eventType: row.event_type,
          platform: row.platform,
          version: row.version,
          dialect: row.dialect,
          payload: parsed,
          createdAt: row.created_at,
        };
      }),
    };
  }

  const github = await githubPromise;

  return jsonResponse(
    {
      ok: true,
      generatedAt: Date.now(),
      github,
      telemetry: dbStats,
    },
    200,
    request
  );
}
