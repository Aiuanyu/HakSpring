/**
 * 雲端同步模組
 * HakSpring - 使用 Supabase 進行書籤同步
 */

const BOOKMARK_LIMIT = 10;
const SYNC_DEBOUNCE_MS = 30000; // 30 秒
const PERIODIC_SYNC_INTERVAL_MS = 60000; // 60 秒
const SUPABASE_QUERY_TIMEOUT_MS = 10000; // 10 秒

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
      startPeriodicSync(); // 啟動背景同步排程

      // 登入後自動從雲端拉取資料
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        console.log(`[CloudSync] 觸發 ${event} 同步`);
        await syncFromCloud();
      }
    } else {
      cloudSyncState.isLoggedIn = false;
      cloudSyncState.user = null;
      updateSyncUI(false, null);
      stopPeriodicSync(); // 停止背景同步排程
    }
  });
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

  // 清除所有待處理的同步計時器，避免登出後仍執行同步
  if (syncDebounceTimer) {
    clearTimeout(syncDebounceTimer);
    syncDebounceTimer = null;
  }
  hasPendingSync = false;

  // 停止週期性背景同步
  stopPeriodicSync();

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
 * 實作 Pull-Merge-Push 流程
 */
async function syncFromCloud() {
  const client = getSupabaseClient();
  if (!client || !cloudSyncState.isLoggedIn) return;

  // 競合保護：避免同時執行多個同步
  if (cloudSyncState.isSyncing) return;

  // 清除待處理的 debounce timer，避免同步完成後又重複同步
  if (syncDebounceTimer) {
    clearTimeout(syncDebounceTimer);
    syncDebounceTimer = null;
  }
  hasPendingSync = false;

  cloudSyncState.isSyncing = true;
  updateSyncStatusUI('syncing');

  try {
    // 加入 timeout 機制
    const queryPromise = client
      .from('user_sync_data')
      .select('bookmarks, preferences, learning_progress, updated_at')
      .eq('user_id', cloudSyncState.user.id)
      .maybeSingle();

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('SupabaseTimeout')), SUPABASE_QUERY_TIMEOUT_MS),
    );

    // 明確捕捉並處理錯誤
    let data = null;
    try {
      const result = await Promise.race([queryPromise, timeoutPromise]);
      if (result.error && result.error.code !== 'PGRST116') {
        throw result.error;
      }
      data = result.data;
    } catch (err) {
      if (err.message === 'SupabaseTimeout') {
        console.warn('[CloudSync] 查詢超時，本次跳過');
        // 超時不視為嚴重錯誤，僅跳過
        return;
      }
      throw err;
    }

    if (data) {
      // 1. 準備資料
      const localBookmarks = JSON.parse(
        localStorage.getItem('hakkaBookmarks') || '[]',
      );
      const cloudBookmarks = data.bookmarks || [];

      const localPrefs = {
        romanizerJoiningMode:
          localStorage.getItem('romanizerJoiningMode') || 'none',
      };
      const cloudPrefs = data.preferences || {};

      const localProgress = JSON.parse(
        localStorage.getItem('hakkaLearningProgress') || '{}'
      );
      const cloudProgress = data.learning_progress || {};

      // 2. 合併資料
      const mergedBookmarks = mergeBookmarks(localBookmarks, cloudBookmarks);
      const mergedProgress = mergeProgress(localProgress, cloudProgress);

      // 3. 寫入本地 storage
      localStorage.setItem('hakkaBookmarks', JSON.stringify(mergedBookmarks));
      localStorage.setItem('hakkaLearningProgress', JSON.stringify(mergedProgress));

      // 合併偏好設定（雲端有值時優先使用，否則保留本地值供後續上傳）
      // 使用 !== undefined && !== null 確保 falsy 值（如空字串）也能正確處理
      if (cloudPrefs.romanizerJoiningMode !== undefined && cloudPrefs.romanizerJoiningMode !== null) {
        localStorage.setItem('romanizerJoiningMode', cloudPrefs.romanizerJoiningMode);
      }

      // 4. 智慧上傳 (Smart Push)：只有結果與雲端不一致時才上傳
      // 比對 merged vs cloud
      const bookmarksChanged =
        JSON.stringify(mergedBookmarks) !== JSON.stringify(cloudBookmarks);
      // 簡單比對 preferences (目前只有一個欄位)
      // [修正 Round 3] 移除 cloudPrefs.romanizerJoiningMode && 檢查，避免雲端為空時無法上傳本地變更
      const prefsChanged =
        localPrefs.romanizerJoiningMode !==
        (cloudPrefs.romanizerJoiningMode || 'none');
      const progressChanged =
        JSON.stringify(mergedProgress) !== JSON.stringify(cloudProgress);

      if (bookmarksChanged || prefsChanged || progressChanged) {
        console.log('[CloudSync] 資料有變更，執行上傳 (Smart Push)');
        await syncToCloud();
      } else {
        console.log('[CloudSync] 資料一致，跳過上傳');
      }
    } else {
      // 雲端沒有資料，上傳本地資料
      console.log('[CloudSync] 雲端無資料，執行初始化上傳');
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
    const learningProgress = JSON.parse(
      localStorage.getItem('hakkaLearningProgress') || '{}'
    );

    const { error } = await client.from('user_sync_data').upsert(
      {
        user_id: cloudSyncState.user.id,
        bookmarks: bookmarks,
        preferences: preferences,
        learning_progress: learningProgress,
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
 * 合併學習進度 (Phase 3: 逐詞單調合併)
 * 留「學得更深」的那筆，確保任何一邊的進步都不回退
 */
function mergeProgress(localObj, cloudObj) {
  const local = (localObj && typeof localObj === 'object') ? localObj : {};
  const cloud = (cloudObj && typeof cloudObj === 'object') ? cloudObj : {};
  
  const merged = { ...local };
  
  for (const key in cloud) {
    if (!cloud.hasOwnProperty(key)) continue;

    const cloudItem = cloud[key];
    const localItem = local[key];

    // 防呆：只處理合法的陣列格式。雲端/本地可能殘留舊格式（物件）或空值，
    // 直接展開會丟 "is not iterable"。非陣列時：本地非法就用雲端、雲端也非法就跳過。
    const cloudOk = Array.isArray(cloudItem);
    const localOk = Array.isArray(localItem);

    if (!localOk) {
      if (cloudOk) merged[key] = [...cloudItem];
      // 兩邊都非陣列 → 無法合併，保持 merged 現況（可能是本地的非法值，交由後續清理）
      continue;
    }
    if (!cloudOk) {
      // 雲端非法、本地合法 → 保留本地
      merged[key] = [...localItem];
      continue;
    }

    // [ef, interval, reps, due, firstSeenDay]
    const cReps = cloudItem[2] || 0;
    const lReps = localItem[2] || 0;
    const cDue = cloudItem[3] || 0;
    const lDue = localItem[3] || 0;

    let preferCloud = false;
    if (cReps > lReps) {
      preferCloud = true;
    } else if (cReps === lReps && cDue > lDue) {
      preferCloud = true;
    }

    // 一律複製勝出那筆，避免下面改 firstSeenDay 時就地 mutate 到 local/cloud 原陣列
    merged[key] = preferCloud ? [...cloudItem] : [...localItem];

    // firstSeenDay 取早 (小)
    const cSeen = cloudItem[4];
    const lSeen = localItem[4];
    const mSeen = merged[key][4];

    let earliestSeen = mSeen;
    if (cSeen !== undefined && lSeen !== undefined) {
      earliestSeen = Math.min(cSeen, lSeen);
    } else if (cSeen !== undefined) {
      earliestSeen = cSeen;
    } else if (lSeen !== undefined) {
      earliestSeen = lSeen;
    }

    if (earliestSeen !== undefined) {
      merged[key][4] = earliestSeen;
    }
  }
  
  return merged;
}

/**
 * 更新同步 UI（登入/登出按鈕狀態）
 */
function updateSyncUI(isLoggedIn, user) {
  const cloudSyncBtn = document.getElementById('cloudSyncBtn');
  const cloudSyncUserBtn = document.getElementById('cloudSyncUserBtn');
  const cloudSyncLogoutBtn = document.getElementById('cloudSyncLogoutBtn');

  if (!cloudSyncBtn) return;

  if (isLoggedIn && user) {
    cloudSyncBtn.innerHTML = '<i class="fas fa-cloud-check"></i>';
    cloudSyncBtn.title = '已登入雲端同步';
    cloudSyncBtn.classList.add('logged-in');

    if (cloudSyncUserBtn) {
      const displayName =
        user.user_metadata?.full_name || user.email || '使用者';
      cloudSyncUserBtn.dataset.tooltip = displayName;
      cloudSyncUserBtn.style.display = 'inline-block';
    }
    if (cloudSyncLogoutBtn) {
      cloudSyncLogoutBtn.style.display = 'inline-block';
    }
  } else {
    cloudSyncBtn.innerHTML = '<i class="fas fa-cloud"></i>';
    cloudSyncBtn.title = '雲端同步（Google 登入）';
    cloudSyncBtn.classList.remove('logged-in');

    if (cloudSyncUserBtn) {
      cloudSyncUserBtn.style.display = 'none';
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
 * 觸發書籤變更後的雲端同步（防抖）
 * 使用較長的 debounce 時間以減少 API 呼叫次數
 * 改為呼叫 syncFromCloud (Pull-Merge-Push) 以確保資料安全
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
    // 改為呼叫 syncFromCloud，確保先拉取最新資料再合併上傳
    // 避免直接覆蓋雲端可能存在的更新
    syncFromCloud();
    hasPendingSync = false;
  }, SYNC_DEBOUNCE_MS); // 使用常數
}

// 明確掛上 window，供跨檔呼叫（game-progress.js 寫進度後會呼叫 window.triggerCloudSync）。
// 不倚賴「頂層 function 宣告自動成為 window 屬性」的隱式行為，避免載入環境改變時靜默失效。
window.triggerCloudSync = triggerCloudSync;

/**
 * 週期性背景同步計時器
 */
let periodicSyncTimer = null;

/**
 * 啟動週期性背景同步
 * 每 PERIODIC_SYNC_INTERVAL_MS 秒執行一次 syncFromCloud
 */
function startPeriodicSync() {
  stopPeriodicSync(); // 確保不會重複啟動

  if (!cloudSyncState.isLoggedIn) return;

  console.log('[CloudSync] 啟動背景同步排程');

  periodicSyncTimer = setInterval(() => {
    // 如果頁面可見，才執行同步
    // 雖然 syncFromCloud 有競合保護，但判斷 visibility 可以更省資源
    if (document.visibilityState === 'visible') {
      // 清除待處理的 debounce timer，避免重複同步
      if (syncDebounceTimer) {
        clearTimeout(syncDebounceTimer);
        syncDebounceTimer = null;
      }
      hasPendingSync = false;
      console.log('[CloudSync] 執行背景自動同步');
      syncFromCloud();
    }
  }, PERIODIC_SYNC_INTERVAL_MS);
}

/**
 * 停止週期性背景同步
 */
function stopPeriodicSync() {
  if (periodicSyncTimer) {
    clearInterval(periodicSyncTimer);
    periodicSyncTimer = null;
    console.log('[CloudSync] 停止背景同步排程');
  }
}

/**
 * 頁面離開時強制同步（確保資料不遺失）
 * 同時管理背景排程的暫停與恢復
 * 使用 syncFromCloud 以遵循 Pull-Merge-Push 機制，避免覆蓋其他裝置的更新
 */
function setupPageUnloadSync() {
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'hidden') {
      // 頁面隱藏時
      if (hasPendingSync) {
        if (syncDebounceTimer) {
          clearTimeout(syncDebounceTimer);
          syncDebounceTimer = null;
        }
        // [修正] 改為 syncFromCloud (Pull-Merge-Push) 以確保安全
        // 雖然比直接 syncToCloud 慢，但避免覆蓋其他裝置更新
        await syncFromCloud();
        hasPendingSync = false;
      }
      // 暫停背景排程，省電
      stopPeriodicSync();
    } else {
      // 頁面恢復顯示時

      // [修正 Round 3] 先等待同步完成，再啟動排程，避免 race condition
      if (cloudSyncState.isLoggedIn) {
        console.log('[CloudSync] 頁面恢復顯示，立即同步');
        await syncFromCloud();
      }
      startPeriodicSync(); // 重啟背景排程
    }
  });
}
