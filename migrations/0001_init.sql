-- 雲端同步（functions/api/sync.js）：一個同步金鑰 = 一列。
-- user_id 係同步金鑰个 SHA-256（伺服器毋存金鑰本身）；data 係同步資料包个 JSON；
-- updated_at 係伺服器時間（毫秒），兼做樂觀鎖（compare-and-swap）个版本號。
-- 套用：npx wrangler d1 migrations apply hakspring-sync --remote
CREATE TABLE IF NOT EXISTS user_sync (
  user_id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  client_version INTEGER DEFAULT 1,
  updated_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
