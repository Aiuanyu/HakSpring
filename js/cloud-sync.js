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
    // 保留 query parameters，讓用戶登入後能回到原本的狀態（腔調、級別、類別等）
    const redirectUrl =
      window.location.origin +
      window.location.pathname +
      window.location.search;
    const { data, error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
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

  // 競合保護：避免同時執行多個同步
  if (cloudSyncState.isSyncing) return;

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
    } else {
      // 雲端沒有資料，上傳本地資料
      await syncToCloud();
    }

    // 同步完成後立即更新 UI
    if (typeof window.updateProgressDropdown === 'function') {
      window.updateProgressDropdown();
    }

    cloudSyncState.lastSyncTime = new Date();
    updateSyncStatusUI('success');
  } catch (err) {
    console.error('[CloudSync] 同步失敗:', err);
    updateSyncStatusUI('error');
    // 顯示用戶可見的錯誤通知
    showSyncError('同步失敗，請稍後再試');
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
    showSyncError('上傳失敗，請稍後再試');
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
  // 輸入驗證：確保參數是陣列
  const local = Array.isArray(localBookmarks) ? localBookmarks : [];
  const cloud = Array.isArray(cloudBookmarks) ? cloudBookmarks : [];

  // 合併所有書籤
  const allBookmarks = [...cloud, ...local];

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
 * 顯示同步錯誤通知（短暫顯示後自動消失）
 * 使用 dataset 存儲原始 title，避免快速觸發時的 race condition
 */
function showSyncError(message) {
  const cloudSyncBtn = document.getElementById('cloudSyncBtn');
  if (!cloudSyncBtn) return;

  // 清除任何現有的 timeout
  if (cloudSyncBtn.dataset.errorTimeoutId) {
    clearTimeout(Number(cloudSyncBtn.dataset.errorTimeoutId));
  }

  // 首次調用時存儲真正的原始 title
  if (!cloudSyncBtn.dataset.originalTitle) {
    cloudSyncBtn.dataset.originalTitle = cloudSyncBtn.title;
  }

  cloudSyncBtn.title = message;

  // 3 秒後恢復原本的 title
  const timeoutId = setTimeout(() => {
    cloudSyncBtn.title = cloudSyncBtn.dataset.originalTitle;
    delete cloudSyncBtn.dataset.originalTitle;
    delete cloudSyncBtn.dataset.errorTimeoutId;
  }, 3000);

  cloudSyncBtn.dataset.errorTimeoutId = timeoutId;
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
 * 觸發書籤變更後的雲端同步（節流）
 * 使用 throttle 機制確保播放期間至少每 30 秒上傳一次
 * 同時在停止操作後也會上傳最終狀態
 */
let syncThrottleTimer = null;
let syncTrailingTimer = null;
let hasPendingSync = false;
let lastSyncTime = 0;
const SYNC_INTERVAL = 30000; // 30 秒

function triggerCloudSync() {
  if (!cloudSyncState.isLoggedIn) return;

  hasPendingSync = true;
  const now = Date.now();

  // 清除尾隨計時器（因為有新的變更進來）
  if (syncTrailingTimer) {
    clearTimeout(syncTrailingTimer);
    syncTrailingTimer = null;
  }

  // 如果距離上次同步已超過 30 秒，立即同步
  if (now - lastSyncTime >= SYNC_INTERVAL) {
    // 清除節流計時器（如果有的話）
    if (syncThrottleTimer) {
      clearTimeout(syncThrottleTimer);
      syncThrottleTimer = null;
    }

    lastSyncTime = now;
    syncToCloud();
    hasPendingSync = false;
  } else if (!syncThrottleTimer) {
    // 還沒到 30 秒，且沒有計時器在跑，設置計時器
    const remainingTime = SYNC_INTERVAL - (now - lastSyncTime);
    syncThrottleTimer = setTimeout(() => {
      syncThrottleTimer = null;
      lastSyncTime = Date.now();
      syncToCloud();
      hasPendingSync = false;
    }, remainingTime);
  }

  // 設置尾隨計時器：確保最後一次變更後也會上傳
  // 這樣停止播放後的最終狀態也能被保存
  syncTrailingTimer = setTimeout(() => {
    syncTrailingTimer = null;
    if (hasPendingSync) {
      lastSyncTime = Date.now();
      syncToCloud();
      hasPendingSync = false;
    }
  }, SYNC_INTERVAL);
}

/**
 * 頁面離開時強制同步（確保資料不遺失）
 * 注意：只使用 visibilitychange，因為 beforeunload 中的非同步操作不可靠
 */
function setupPageUnloadSync() {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && hasPendingSync) {
      if (syncThrottleTimer) {
        clearTimeout(syncThrottleTimer);
        syncThrottleTimer = null;
      }
      if (syncTrailingTimer) {
        clearTimeout(syncTrailingTimer);
        syncTrailingTimer = null;
      }
      lastSyncTime = Date.now();
      syncToCloud();
      hasPendingSync = false;
    }
  });
}
