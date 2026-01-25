/**
 * 雲端同步模組
 * HakSpring - 使用 Supabase 進行書籤同步
 */

const BOOKMARK_LIMIT = 10;

// 同步狀態
let cloudSyncState = {
  isLoggedIn: false,
  user: null,
  isSyncing: false,
  lastSyncTime: null,
};

/**
 * 初始化雲端同步模組
 */
async function initCloudSync() {
  const client = getSupabaseClient();
  if (!client) {
    console.error('[CloudSync] Supabase Client 未初始化');
    return;
  }

  // 設置頁面離開時的同步機制
  setupPageUnloadSync();

  // 監聽認證狀態變化
  client.auth.onAuthStateChange(async (event, session) => {
    console.log('[CloudSync] Auth state changed:', event);

    if (session?.user) {
      cloudSyncState.isLoggedIn = true;
      cloudSyncState.user = session.user;
      updateSyncUI(true, session.user);

      // 登入後自動從雲端拉取資料
      if (event === 'SIGNED_IN') {
        console.log('[CloudSync] 觸發 SIGNED_IN 同步');
        await syncFromCloud();
      }
    } else {
      cloudSyncState.isLoggedIn = false;
      cloudSyncState.user = null;
      updateSyncUI(false, null);
    }
  });

  // 檢查現有 session
  const {
    data: { session },
  } = await client.auth.getSession();
  if (session?.user) {
    cloudSyncState.isLoggedIn = true;
    cloudSyncState.user = session.user;
    updateSyncUI(true, session.user);

    // 【修正】頁面載入時如果已登入，也要同步
    console.log('[CloudSync] 觸發 INITIAL_SESSION 同步');
    await syncFromCloud();
  }
}

/**
 * Google 登入
 */
async function signInWithGoogle() {
  const client = getSupabaseClient();
  if (!client) return;

  try {
    const { data, error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + window.location.pathname,
      },
    });

    if (error) {
      console.error('[CloudSync] 登入失敗:', error);
      alert('登入失敗：' + error.message);
    }
  } catch (err) {
    console.error('[CloudSync] 登入錯誤:', err);
    alert('登入時發生錯誤');
  }
}

/**
 * 登出
 */
async function signOut() {
  const client = getSupabaseClient();
  if (!client) return;

  try {
    const { error } = await client.auth.signOut();
    if (error) {
      console.error('[CloudSync] 登出失敗:', error);
    } else {
      console.log('[CloudSync] 已登出');
    }
  } catch (err) {
    console.error('[CloudSync] 登出錯誤:', err);
  }
}

/**
 * 從雲端拉取資料並合併
 */
async function syncFromCloud() {
  const client = getSupabaseClient();
  if (!client || !cloudSyncState.isLoggedIn) return;

  cloudSyncState.isSyncing = true;
  updateSyncStatusUI('syncing');

  try {
    // 加入 timeout 機制
    const queryPromise = client
      .from('user_sync_data')
      .select('bookmarks, preferences, updated_at')
      .eq('user_id', cloudSyncState.user.id)
      .maybeSingle();

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Supabase 查詢超時')), 10000),
    );

    const { data, error } = await Promise.race([queryPromise, timeoutPromise]);

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows found
      console.error('[CloudSync] Supabase 查詢錯誤:', error);
      throw error;
    }

    if (data) {
      // 合併書籤
      const localBookmarks = JSON.parse(
        localStorage.getItem('hakkaBookmarks') || '[]',
      );
      const cloudBookmarks = data.bookmarks || [];
      const mergedBookmarks = mergeBookmarks(localBookmarks, cloudBookmarks);

      localStorage.setItem('hakkaBookmarks', JSON.stringify(mergedBookmarks));

      // 合併偏好設定
      if (data.preferences) {
        if (data.preferences.romanizerJoiningMode) {
          localStorage.setItem(
            'romanizerJoiningMode',
            data.preferences.romanizerJoiningMode,
          );
        }
      }

      // 上傳合併後的資料
      await syncToCloud();

      // 更新 UI
      setTimeout(() => {
        if (typeof window.updateProgressDropdown === 'function') {
          window.updateProgressDropdown();
        }
      }, 100);
    } else {
      // 雲端沒有資料，上傳本地資料
      await syncToCloud();

      // 更新 UI
      setTimeout(() => {
        if (typeof window.updateProgressDropdown === 'function') {
          window.updateProgressDropdown();
        }
      }, 100);
    }

    cloudSyncState.lastSyncTime = new Date();
    updateSyncStatusUI('success');
  } catch (err) {
    console.error('[CloudSync] 同步失敗:', err);
    updateSyncStatusUI('error');
  } finally {
    cloudSyncState.isSyncing = false;
  }
}

/**
 * 上傳本地資料到雲端
 */
async function syncToCloud() {
  const client = getSupabaseClient();
  if (!client || !cloudSyncState.isLoggedIn) return;

  try {
    const bookmarks = JSON.parse(
      localStorage.getItem('hakkaBookmarks') || '[]',
    );
    const preferences = {
      romanizerJoiningMode:
        localStorage.getItem('romanizerJoiningMode') || 'none',
    };

    const { error } = await client.from('user_sync_data').upsert(
      {
        user_id: cloudSyncState.user.id,
        bookmarks: bookmarks,
        preferences: preferences,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'user_id',
      },
    );

    if (error) {
      throw error;
    }

    console.log('[CloudSync] 已上傳到雲端');
  } catch (err) {
    console.error('[CloudSync] 上傳失敗:', err);
  }
}

/**
 * 合併本地與雲端書籤
 * 比照 saveBookmark 的邏輯：
 * 1. 同表格同類別：保留 timestamp 較新的
 * 2. 同表格不同類別：只保留 timestamp 最新的那個類別
 * 3. 依 timestamp 排序，保留最新的 BOOKMARK_LIMIT 筆
 */
function mergeBookmarks(localBookmarks, cloudBookmarks) {
  // 合併所有書籤
  const allBookmarks = [...cloudBookmarks, ...localBookmarks];

  // 用 tableName 為 key，只保留每個表格中 timestamp 最新的書籤
  const tableMap = new Map();

  allBookmarks.forEach((bm) => {
    const tableKey = bm.tableName;
    const existing = tableMap.get(tableKey);

    if (!existing) {
      tableMap.set(tableKey, bm);
    } else {
      // 比較 timestamp，保留較新的
      const currentTime = bm.timestamp || 0;
      const existingTime = existing.timestamp || 0;
      if (currentTime > existingTime) {
        tableMap.set(tableKey, bm);
      }
    }
  });

  // 轉回陣列並依 timestamp 排序
  let merged = Array.from(tableMap.values());
  merged.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  // 限制數量
  if (merged.length > BOOKMARK_LIMIT) {
    merged = merged.slice(0, BOOKMARK_LIMIT);
  }

  return merged;
}

/**
 * 更新同步 UI（登入/登出按鈕狀態）
 */
function updateSyncUI(isLoggedIn, user) {
  const cloudSyncBtn = document.getElementById('cloudSyncBtn');
  const cloudSyncStatus = document.getElementById('cloudSyncStatus');
  const cloudSyncUserInfo = document.getElementById('cloudSyncUserInfo');
  const cloudSyncLogoutBtn = document.getElementById('cloudSyncLogoutBtn');

  if (!cloudSyncBtn) return;

  if (isLoggedIn && user) {
    cloudSyncBtn.innerHTML = '<i class="fas fa-cloud-check"></i>';
    cloudSyncBtn.title = '已登入雲端同步';
    cloudSyncBtn.classList.add('logged-in');

    if (cloudSyncUserInfo) {
      const displayName =
        user.user_metadata?.full_name || user.email || '使用者';
      cloudSyncUserInfo.textContent = displayName;
      cloudSyncUserInfo.style.display = 'inline';
    }
    if (cloudSyncLogoutBtn) {
      cloudSyncLogoutBtn.style.display = 'inline-block';
    }
  } else {
    cloudSyncBtn.innerHTML = '<i class="fas fa-cloud"></i>';
    cloudSyncBtn.title = '雲端同步（Google 登入）';
    cloudSyncBtn.classList.remove('logged-in');

    if (cloudSyncUserInfo) {
      cloudSyncUserInfo.style.display = 'none';
    }
    if (cloudSyncLogoutBtn) {
      cloudSyncLogoutBtn.style.display = 'none';
    }
  }
}

/**
 * 更新同步狀態提示
 */
function updateSyncStatusUI(status) {
  const cloudSyncBtn = document.getElementById('cloudSyncBtn');
  if (!cloudSyncBtn) return;

  cloudSyncBtn.classList.remove('syncing', 'sync-success', 'sync-error');

  switch (status) {
    case 'syncing':
      cloudSyncBtn.classList.add('syncing');
      break;
    case 'success':
      cloudSyncBtn.classList.add('sync-success');
      setTimeout(() => cloudSyncBtn.classList.remove('sync-success'), 2000);
      break;
    case 'error':
      cloudSyncBtn.classList.add('sync-error');
      setTimeout(() => cloudSyncBtn.classList.remove('sync-error'), 3000);
      break;
  }
}

/**
 * 觸發書籤變更後的雲端同步（防抖）
 * 使用較長的 debounce 時間以減少 API 呼叫次數
 */
let syncDebounceTimer = null;
let hasPendingSync = false;

function triggerCloudSync() {
  if (!cloudSyncState.isLoggedIn) return;

  hasPendingSync = true;

  if (syncDebounceTimer) {
    clearTimeout(syncDebounceTimer);
  }

  syncDebounceTimer = setTimeout(() => {
    syncToCloud();
    hasPendingSync = false;
  }, 30000); // 30 秒後同步，減少 Supabase API 呼叫次數
}

/**
 * 頁面離開時強制同步（確保資料不遺失）
 */
function setupPageUnloadSync() {
  // 頁面隱藏時同步（切換分頁、最小化等）
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && hasPendingSync) {
      if (syncDebounceTimer) {
        clearTimeout(syncDebounceTimer);
        syncDebounceTimer = null;
      }
      syncToCloud();
      hasPendingSync = false;
    }
  });

  // 頁面關閉前同步
  window.addEventListener('beforeunload', () => {
    if (hasPendingSync) {
      if (syncDebounceTimer) {
        clearTimeout(syncDebounceTimer);
        syncDebounceTimer = null;
      }
      // 使用 sendBeacon 確保請求能在頁面關閉前送出
      // 但 Supabase client 不支援，所以直接呼叫 syncToCloud
      syncToCloud();
      hasPendingSync = false;
    }
  });
}
