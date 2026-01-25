/**
 * Supabase 設定檔
 * HakSpring 雲端同步功能
 */

const SUPABASE_URL = 'https://plgqzqlzkbwozkapjcsu.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsZ3F6cWx6a2J3b3prYXBqY3N1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkyNDkzODMsImV4cCI6MjA4NDgyNTM4M30.uRtdi-y0ar6h_S1rJKlNd-r7Wvrt3NMHF1aoTgo2efg';

// 初始化 Supabase Client（需等待 SDK 載入）
let supabaseClient = null;

function initSupabase() {
  if (typeof supabase !== 'undefined' && supabase.createClient) {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('[Supabase] Client 初始化成功');
    return supabaseClient;
  } else {
    console.error('[Supabase] SDK 尚未載入');
    return null;
  }
}

function getSupabaseClient() {
  if (!supabaseClient) {
    return initSupabase();
  }
  return supabaseClient;
}
