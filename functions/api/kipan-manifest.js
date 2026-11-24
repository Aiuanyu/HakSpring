// 桌面版檢查更新 Manifest 端點（macOS / Windows 共用）
// GET /api/kipan-manifest?platform=macos&v=0.0.5
// 回傳符合 UpdateChecker.swift / taigi-desktop-update 的 JSON，並匿名記錄 update_check 次數（不存 IP）。

const MANIFESTS = {
  macos: {
    version: '0.0.6',
    downloadPageURL: 'https://hakspring.pages.dev/kipan/',
    // macOS 封測版目前為免簽章 .zip，省略 packageURL 讓使用者點通知後前往官網下載頁面
  },
  windows: {
    version: '0.0.6',
    downloadPageURL: 'https://hakspring.pages.dev/kipan/',
  },
};

function sanitizeToken(val, maxLen = 32) {
  return String(val || '')
    .trim()
    .slice(0, maxLen)
    .replace(/[^a-zA-Z0-9._+-]/g, '');
}

async function ensureTelemetryTable(db) {
  if (!db) return;
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
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const rawPlatform = (url.searchParams.get('platform') || 'macos').toLowerCase();
  const platform = rawPlatform === 'windows' ? 'windows' : 'macos';
  const clientVersion = sanitizeToken(url.searchParams.get('v') || '', 32);
  const dialect = sanitizeToken(url.searchParams.get('dialect') || '', 24);

  // 非阻塞寫入匿名檢查更新計數（不存 IP、不存識別碼）
  if (env && env.DB) {
    const writePromise = (async () => {
      try {
        await ensureTelemetryTable(env.DB);
        await env.DB.prepare(
          `INSERT INTO kipan_events (event_type, platform, version, dialect, payload, created_at)
           VALUES ('update_check', ?, ?, ?, '{}', ?)`
        )
          .bind(platform, clientVersion, dialect, Date.now())
          .run();
      } catch (_err) {
        // 紀錄失敗不影響正常回傳 manifest
      }
    })();
    if (typeof context.waitUntil === 'function') {
      context.waitUntil(writePromise);
    } else {
      await writePromise;
    }
  }

  const manifest = MANIFESTS[platform] || MANIFESTS.macos;
  return new Response(JSON.stringify(manifest), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
