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

  // 先在「使用者點擊」的同步脈絡下開一個空白分頁卡位。
  // 這樣才不會被彈出視窗封鎖器擋掉——若等到 await 之後才 window.open，就脫離手勢脈絡、多半會被擋。
  // 用新分頁登入是刻意的：避免主頁被 redirect 跳走，登入回來後 onboarding 才不會中斷。
  const authWindow = window.open('', '_blank');

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
        skipBrowserRedirect: true,
      },
    });

    if (error) {
      console.error('[CloudSync] 登入失敗:', error);
      if (authWindow) authWindow.close();
      alert('登入失敗：' + error.message);
      return;
    }

    if (data && data.url) {
      if (authWindow) {
        // 卡位分頁還在 → 把授權網址填進去（正常路徑，保住新分頁 + onboarding）
        authWindow.location.href = data.url;
      } else {
        // 連空白分頁都被擋（極端封鎖）→ 退回同分頁導向，至少能完成登入
        // （此情況該次 redirect 回來會跳過 onboarding，屬可接受的退路）
        window.location.href = data.url;
      }
    } else if (authWindow) {
      // 沒拿到 url 也別留空白分頁在那
      authWindow.close();
    }
  } catch (err) {
    console.error('[CloudSync] 登入錯誤:', err);
    if (authWindow) authWindow.close();
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
      .select('bookmarks, preferences, learning_progress, daily_stats, daily_stats_by_level, daily_favs, updated_at')
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
        gameLastDataVarName:
          localStorage.getItem('hakkaGameLastDataVarName') || '',
        userName: localStorage.getItem('hakkaUserName') || '',
        userLocation: localStorage.getItem('hakkaUserLocation') || '',
      };
      const cloudPrefs = data.preferences || {};

      const localProgress = JSON.parse(
        localStorage.getItem('hakkaLearningProgress') || '{}'
      );
      const cloudProgress = data.learning_progress || {};

      const localStats = JSON.parse(
        localStorage.getItem('hakkaDailyStats') || '{}'
      );
      const cloudStats = data.daily_stats || {};
      const localStatsByLevel = JSON.parse(
        localStorage.getItem('hakkaDailyStatsByLevel') || '{}'
      );
      const cloudStatsByLevel = data.daily_stats_by_level || {};
      // 已同步基準快照：用來算「本地相對上次同步的新增量」，讓相加合併冪等
      const syncedStats = JSON.parse(
        localStorage.getItem('hakkaDailyStatsSynced') || '{}'
      );
      const syncedStatsByLevel = JSON.parse(
        localStorage.getItem('hakkaDailyStatsByLevelSynced') || '{}'
      );
      // 偏好設定的已同步快照：本地值 === 快照，才代表本地沒有「尚未推上雲端」的新變更，
      // 此時才可以放心讓雲端值覆蓋本地；否則就是本地剛改過還沒同步，必須保留本地、留給下面 Smart Push 推上去。
      // 沒有這層判斷的話，本地剛寫入的新值會被下面「雲端有值就覆寫本地」的邏輯讀成舊資料而遺失。
      const syncedPrefs = JSON.parse(
        localStorage.getItem('hakkaPrefsSynced') || '{}'
      );

      const localFavs = JSON.parse(
        localStorage.getItem('hakkaDailyFavs') || '{"items":[],"tomb":{}}'
      );
      const cloudFavs = data.daily_favs || { items: [], tomb: {} };

      // 2. 合併資料
      const mergedBookmarks = mergeBookmarks(localBookmarks, cloudBookmarks);
      const mergedProgress = mergeProgress(localProgress, cloudProgress);
      const mergedStats = mergeDailyStats(localStats, cloudStats, syncedStats);
      const mergedStatsByLevel = mergeDailyStatsByLevel(localStatsByLevel, cloudStatsByLevel, syncedStatsByLevel);
      const mergedFavs = mergeDailyFavs(localFavs, cloudFavs);

      // 一詞一卡制：合併是聯集，雲端殘留的舊題型 key（|p/|l/|c）會在這裡復活，
      // 折回 |m 詞卡後再落地／比對，讓 Smart Push 順勢把雲端的舊 key 也清掉。
      if (typeof window.foldTypeKeysIntoWordCards === 'function') {
        window.foldTypeKeysIntoWordCards(mergedProgress);
      }

      // 3. 寫入本地 storage
      localStorage.setItem('hakkaBookmarks', JSON.stringify(mergedBookmarks));
      localStorage.setItem('hakkaLearningProgress', JSON.stringify(mergedProgress));
      localStorage.setItem('hakkaDailyStats', JSON.stringify(mergedStats));
      localStorage.setItem('hakkaDailyStatsByLevel', JSON.stringify(mergedStatsByLevel));
      localStorage.setItem('hakkaDailyFavs', JSON.stringify(mergedFavs));
      // 註：已同步基準快照 hakkaDailyStatsSynced 於「上傳成功後」才更新（見下方），
      // 避免 push 失敗卻把基準推進，導致該次新增量算成 0、永遠傳不上去。

      // 合併偏好設定：本地相對快照沒變 → 套用雲端值；本地相對快照有變 → 保留本地、留給 Smart Push 推上去
      // 使用 !== undefined && !== null 確保 falsy 值（如空字串）也能正確處理
      let finalRomanizerJoiningMode = localPrefs.romanizerJoiningMode;
      if (localPrefs.romanizerJoiningMode === (syncedPrefs.romanizerJoiningMode || 'none')) {
        if (cloudPrefs.romanizerJoiningMode !== undefined && cloudPrefs.romanizerJoiningMode !== null) {
          finalRomanizerJoiningMode = cloudPrefs.romanizerJoiningMode;
        }
      }
      localStorage.setItem('romanizerJoiningMode', finalRomanizerJoiningMode);

      // 空字串代表雲端「從未玩過遊戲」，此時不套用（保留本地或快照值）
      let finalGameLastDataVarName = localPrefs.gameLastDataVarName;
      if (localPrefs.gameLastDataVarName === (syncedPrefs.gameLastDataVarName || '')) {
        if (cloudPrefs.gameLastDataVarName) {
          finalGameLastDataVarName = cloudPrefs.gameLastDataVarName;
        }
      }
      localStorage.setItem('hakkaGameLastDataVarName', finalGameLastDataVarName);

      let finalUserName = localPrefs.userName;
      if (localPrefs.userName === (syncedPrefs.userName || '')) {
        if (cloudPrefs.userName !== undefined && cloudPrefs.userName !== null) {
          finalUserName = cloudPrefs.userName;
        }
      }
      localStorage.setItem('hakkaUserName', finalUserName);

      let finalUserLocation = localPrefs.userLocation;
      if (localPrefs.userLocation === (syncedPrefs.userLocation || '')) {
        if (cloudPrefs.userLocation !== undefined && cloudPrefs.userLocation !== null) {
          finalUserLocation = cloudPrefs.userLocation;
        }
      }
      localStorage.setItem('hakkaUserLocation', finalUserLocation);

      // 4. 智慧上傳 (Smart Push)：只有結果與雲端不一致時才上傳
      // 比對 merged vs cloud
      const bookmarksChanged =
        JSON.stringify(mergedBookmarks) !== JSON.stringify(cloudBookmarks);
      // 偏好設定比對用「合併後的最終值」而非同步前的 localPrefs，
      // 否則本地被雲端值覆寫後，仍拿舊的 localPrefs 去比對會誤判成「有變更」，觸發把剛拉下來的舊值原封不動又推回雲端。
      const prefsChanged =
        finalRomanizerJoiningMode !== (cloudPrefs.romanizerJoiningMode || 'none') ||
        finalGameLastDataVarName !== (cloudPrefs.gameLastDataVarName || '') ||
        finalUserName !== (cloudPrefs.userName || '') ||
        finalUserLocation !== (cloudPrefs.userLocation || '');
      const progressChanged =
        JSON.stringify(mergedProgress) !== JSON.stringify(cloudProgress);
      const statsChanged =
        JSON.stringify(mergedStats) !== JSON.stringify(cloudStats) ||
        JSON.stringify(mergedStatsByLevel) !== JSON.stringify(cloudStatsByLevel);

      if (bookmarksChanged || prefsChanged || progressChanged || statsChanged) {
        console.log('[CloudSync] 資料有變更，執行上傳 (Smart Push)');
        await syncToCloud();
      } else {
        console.log('[CloudSync] 資料一致，跳過上傳');
      }
      // 走到這裡＝雲端已與 merged 結果對齊（有變上傳成功、無變本就一致；
      // syncToCloud 失敗會 throw 到外層 catch、不會到這行）→ 安全推進基準快照。
      localStorage.setItem('hakkaDailyStatsSynced', JSON.stringify(mergedStats));
      localStorage.setItem('hakkaDailyStatsByLevelSynced', JSON.stringify(mergedStatsByLevel));
      localStorage.setItem(
        'hakkaPrefsSynced',
        JSON.stringify({
          romanizerJoiningMode: finalRomanizerJoiningMode,
          gameLastDataVarName: finalGameLastDataVarName,
          userName: finalUserName,
          userLocation: finalUserLocation,
        })
      );
    } else {
      // 雲端沒有資料，上傳本地資料
      console.log('[CloudSync] 雲端無資料，執行初始化上傳');
      await syncToCloud();
      // 初始上傳成功後，基準＝目前本地統計／偏好設定
      localStorage.setItem(
        'hakkaDailyStatsSynced',
        localStorage.getItem('hakkaDailyStats') || '{}'
      );
      localStorage.setItem(
        'hakkaDailyStatsByLevelSynced',
        localStorage.getItem('hakkaDailyStatsByLevel') || '{}'
      );
      localStorage.setItem(
        'hakkaPrefsSynced',
        JSON.stringify({
          romanizerJoiningMode: localStorage.getItem('romanizerJoiningMode') || 'none',
          gameLastDataVarName: localStorage.getItem('hakkaGameLastDataVarName') || '',
          userName: localStorage.getItem('hakkaUserName') || '',
          userLocation: localStorage.getItem('hakkaUserLocation') || '',
        })
      );
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
      gameLastDataVarName:
        localStorage.getItem('hakkaGameLastDataVarName') || '',
      userName: localStorage.getItem('hakkaUserName') || '',
      userLocation: localStorage.getItem('hakkaUserLocation') || '',
    };
    const learningProgress = JSON.parse(
      localStorage.getItem('hakkaLearningProgress') || '{}'
    );
    const dailyStats = JSON.parse(
      localStorage.getItem('hakkaDailyStats') || '{}'
    );
    const dailyStatsByLevel = JSON.parse(
      localStorage.getItem('hakkaDailyStatsByLevel') || '{}'
    );
    const dailyFavs = JSON.parse(
      localStorage.getItem('hakkaDailyFavs') || '{"items":[],"tomb":{}}'
    );

    const { error } = await client.from('user_sync_data').upsert(
      {
        user_id: cloudSyncState.user.id,
        bookmarks: bookmarks,
        preferences: preferences,
        learning_progress: learningProgress,
        daily_stats: dailyStats,
        daily_stats_by_level: dailyStatsByLevel,
        daily_favs: dailyFavs,
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
 * 合併每日答題統計（逐項「相加」，累計量型）。
 *
 * ⚠️ 相加非冪等：直接 local+cloud，push 後 local=cloud=和，下次同步又相加 → 重複膨脹。
 * 解法用「已同步基準快照」syncedSnapshot：只把「本地相對上次同步的新增量(delta)」加到雲端。
 *   delta = local - synced（逐日逐格，僅取正值）
 *   merged = cloud + delta
 * 合併後呼叫端須把 syncedSnapshot 更新成 merged（代表這份已與雲端對齊）。
 *
 * @param {Object} localObj  本地 hakkaDailyStats  { 'YYYY-MM-DD': number[] }
 * @param {Object} cloudObj  雲端 daily_stats
 * @param {Object} syncedObj 上次同步後的基準快照 hakkaDailyStatsSynced
 * @returns {Object} 合併後的統計
 */
function mergeDailyStats(localObj, cloudObj, syncedObj) {
  const local = (localObj && typeof localObj === 'object') ? localObj : {};
  const cloud = (cloudObj && typeof cloudObj === 'object') ? cloudObj : {};
  const synced = (syncedObj && typeof syncedObj === 'object') ? syncedObj : {};

  // 先以雲端為底複製（含只有雲端有的日期）
  const merged = {};
  for (const day in cloud) {
    if (Array.isArray(cloud[day])) merged[day] = [...cloud[day]];
  }

  // 逐日把本地的「新增量」加上去
  for (const day in local) {
    const lArr = Array.isArray(local[day]) ? local[day] : [];
    const sArr = Array.isArray(synced[day]) ? synced[day] : [];
    const mArr = Array.isArray(merged[day]) ? merged[day] : [];
    const len = Math.max(lArr.length, sArr.length, mArr.length);
    const out = [];
    for (let i = 0; i < len; i++) {
      const delta = Math.max(0, (lArr[i] || 0) - (sArr[i] || 0)); // 只加正向新增，防基準比本地大時倒扣
      out[i] = (mArr[i] || 0) + delta;
    }
    merged[day] = out;
  }

  return merged;
}

/**
 * 合併每日各腔級統計（巢狀逐項「相加」，累計量型）。
 *
 * @param {Object} localObj  本地 hakkaDailyStatsByLevel
 * @param {Object} cloudObj  雲端 daily_stats_by_level
 * @param {Object} syncedObj 上次同步後的基準快照 hakkaDailyStatsByLevelSynced
 * @returns {Object} 合併後的統計
 */
function mergeDailyStatsByLevel(localObj, cloudObj, syncedObj) {
  const local = (localObj && typeof localObj === 'object') ? localObj : {};
  const cloud = (cloudObj && typeof cloudObj === 'object') ? cloudObj : {};
  const synced = (syncedObj && typeof syncedObj === 'object') ? syncedObj : {};

  const merged = {};
  for (const day in cloud) {
    if (cloud[day] && typeof cloud[day] === 'object') {
      merged[day] = {};
      for (const level in cloud[day]) {
        if (Array.isArray(cloud[day][level])) {
          merged[day][level] = [...cloud[day][level]];
        }
      }
    }
  }

  for (const day in local) {
    if (!local[day] || typeof local[day] !== 'object') continue;
    
    merged[day] = merged[day] || {};
    const syncedDay = (synced[day] && typeof synced[day] === 'object') ? synced[day] : {};
    
    for (const level in local[day]) {
      const lArr = Array.isArray(local[day][level]) ? local[day][level] : [];
      const sArr = Array.isArray(syncedDay[level]) ? syncedDay[level] : [];
      const mArr = Array.isArray(merged[day][level]) ? merged[day][level] : [];
      
      const len = Math.max(lArr.length, sArr.length, mArr.length);
      const out = [];
      for (let i = 0; i < len; i++) {
        const delta = Math.max(0, (lArr[i] || 0) - (sArr[i] || 0));
        out[i] = (mArr[i] || 0) + delta;
      }
      merged[day][level] = out;
    }
  }

  return merged;
}

/**
 * 每日一詞收藏合併：逐項單調（聯集）＋ tombstone
 * items 取聯集，再剔除存在於任一邊 tomb 且 timestamp 較新的項目。
 */
function mergeDailyFavs(localObj, cloudObj) {
  const local = (localObj && typeof localObj === 'object') ? localObj : { items: [], tomb: {} };
  const cloud = (cloudObj && typeof cloudObj === 'object') ? cloudObj : { items: [], tomb: {} };

  const mergedTomb = { ...(local.tomb || {}) };
  for (const [key, ts] of Object.entries(cloud.tomb || {})) {
    if (!mergedTomb[key] || ts > mergedTomb[key]) {
      mergedTomb[key] = ts;
    }
  }

  const itemSet = new Set([...(local.items || []), ...(cloud.items || [])]);

  // 剔除任何存在於合併後 tomb 中的項目
  for (const key of Object.keys(mergedTomb)) {
    itemSet.delete(key);
  }

  return {
    items: Array.from(itemSet),
    tomb: mergedTomb
  };
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
