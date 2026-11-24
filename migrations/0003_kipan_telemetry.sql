-- 客源翠企盤下載、桌面檢查更新與匿名統計／腔調調查資料表
-- 嚴格去識別化設計：不存 IP、不存裝置 ID、不存任何打字內容
-- 套用：npx wrangler d1 migrations apply hakspring-sync --remote
CREATE TABLE IF NOT EXISTS kipan_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,   -- 'download_click' | 'update_check' | 'optin_stats' | 'dialect_survey'
  platform TEXT NOT NULL,     -- 'android' | 'macos' | 'windows' | 'ios' | 'web' | 'unknown'
  version TEXT DEFAULT '',    -- e.g. '0.0.5'
  dialect TEXT DEFAULT '',    -- 'xiien' | 'namxiian' | 'hoiliug' | 'taibu' | 'ngiaupin' | 'zhioon' | 'multi'
  payload TEXT DEFAULT '{}',  -- JSON（如調查回饋文字、選用功能等，限長 1000 字元）
  created_at INTEGER NOT NULL -- Unix timestamp (ms)
);

CREATE INDEX IF NOT EXISTS idx_kipan_events_type ON kipan_events(event_type);
CREATE INDEX IF NOT EXISTS idx_kipan_events_created ON kipan_events(created_at);
CREATE INDEX IF NOT EXISTS idx_kipan_events_platform ON kipan_events(platform);
