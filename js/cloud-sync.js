/**
 * 雲端同步模組
 * HakSpring - Cloudflare Pages Functions + D1（/api/sync），免登入，用「同步金鑰」認身分。
 * 金鑰由本機隨機產生（32 碼 Base32），伺服器淨存金鑰个 SHA-256。Supabase 流量超額期間毋倚靠任何 Supabase 服務。
 * 並發：推送帶 base_updated_at，版本對毋著伺服器回 409，用戶端重新合併再推（合併函式在本檔下半部）。
 */

const SYNC_API_ENDPOINT = '/api/sync';
const SYNC_KEY_STORAGE = 'hakkaSyncKey';
const SYNC_REV_STORAGE = 'hakkaSyncCloudRev'; // 上次看著个雲端版本（updated_at），推送時當 base_updated_at
const BOOKMARK_LIMIT = 15;
const SYNC_DEBOUNCE_MS = 20000; // 20 秒
const SYNC_REQUEST_TIMEOUT_MS = 10000; // 10 秒
const SYNC_MAX_CONFLICT_RETRIES = 2;
const SYNC_KEY_LENGTH = 32;
const SYNC_KEY_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** 同步金鑰正規化：去掉連字號摎空白、轉大寫。 */
function normalizeSyncKey(raw) {
  return String(raw || '').replace(/[\s-]/g, '').toUpperCase();
}

function isValidSyncKey(raw) {
  return new RegExp('^[A-Z2-7]{' + SYNC_KEY_LENGTH + '}$').test(normalizeSyncKey(raw));
}

/** 顯示用：每 4 碼一組，用連字號隔開。 */
function formatSyncKey(raw) {
  return (normalizeSyncKey(raw).match(/.{1,4}/g) || []).join('-');
}

/** 產生新金鑰（160 位元亂數，Base32）。cryptoObj 預設用瀏覽器 crypto，測試可傳入。 */
function generateSyncKey(cryptoObj) {
  const c = cryptoObj || (typeof crypto !== 'undefined' ? crypto : null);
  if (!c || !c.getRandomValues) throw new Error('crypto_unavailable');
  const bytes = new Uint8Array(SYNC_KEY_LENGTH);
  // 每碼取 5 位元；用 rejection 毋需要（256 毋整除 32 係整除，無偏差）
  c.getRandomValues(bytes);
  let key = '';
  for (let i = 0; i < SYNC_KEY_LENGTH; i += 1) key += SYNC_KEY_ALPHABET[bytes[i] & 31];
  return key;
}

function getSyncKey() {
  try {
    const key = normalizeSyncKey(localStorage.getItem(SYNC_KEY_STORAGE));
    return isValidSyncKey(key) ? key : null;
  } catch (_) {
    return null;
  }
}

function hasSyncKey() {
  return !!getSyncKey();
}

function setSyncKey(raw) {
  if (!isValidSyncKey(raw)) return false;
  localStorage.setItem(SYNC_KEY_STORAGE, normalizeSyncKey(raw));
  localStorage.removeItem(SYNC_REV_STORAGE); // 換金鑰，版本重來
  return true;
}

/** 停用這台裝置个雲端同步（淨清本機金鑰，毋動雲端資料）。 */
function clearSyncKey() {
  localStorage.removeItem(SYNC_KEY_STORAGE);
  localStorage.removeItem(SYNC_REV_STORAGE);
}

function getCloudRev() {
  const rev = Number(localStorage.getItem(SYNC_REV_STORAGE));
  return Number.isSafeInteger(rev) && rev > 0 ? rev : 0;
}

/**
 * 打 /api/sync。回傳 { status, json }；網路錯誤、逾時會丟出帶 status 个 Error。
 */
async function syncRequest(method, body) {
  const key = getSyncKey();
  if (!key) {
    const err = new Error('no_sync_key');
    err.status = 0;
    throw err;
  }
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), SYNC_REQUEST_TIMEOUT_MS) : null;
  try {
    const resp = await fetch(SYNC_API_ENDPOINT, {
      method,
      headers: {
        'X-Sync-Key': key,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller ? controller.signal : undefined,
    });
    let json = null;
    try {
      json = await resp.json();
    } catch (_) {
      /* 無 JSON 就算 */
    }
    return { status: resp.status, json };
  } catch (err) {
    const wrapped = new Error(err && err.name === 'AbortError' ? 'timeout' : 'network');
    wrapped.status = 0;
    throw wrapped;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

// 顯示模式偏好值：舊版存 'hagpin'，現在統一叫 'hpp'；讀到舊值一律當 'hpp'。
// 正規化个實作只放在 js/pfs-converter.js，這裡淨轉呼叫（index.html 先載入佢）。
function normalizeDisplayScript(value) {
  return window.pfsConverter
    ? window.pfsConverter.normalizeDisplayScript(value)
    : 'hpp';
}

// 同步狀態
let cloudSyncState = {
  isLoggedIn: false,
  user: null,
  session: null,
  isSyncing: false,
  lastSyncTime: null,
  isRestricted: false,
};

/**
 * 初始化雲端同步模組
 */
async function initCloudSync() {
  // 檢查是否從網址帶入手動同步資料 (#sync=...)
  checkUrlSyncPayload();

  // 設置頁面離開時的同步機制
  setupPageUnloadSync();

  // 有同步金鑰：開啟網頁時拉一擺（事件驅動；毋做定時輪詢）
  if (hasSyncKey()) {
    await syncFromCloud();
  }

  // Supabase 登入（Google）暫時毋倚靠：Supabase 流量超額期間淨更新畫面，毋觸發同步
  const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
  if (client && client.auth) {
    client.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        cloudSyncState.isLoggedIn = true;
        cloudSyncState.user = session.user;
        cloudSyncState.session = session;
        updateSyncUI(true, session.user);
      } else {
        cloudSyncState.isLoggedIn = false;
        cloudSyncState.user = null;
        cloudSyncState.session = null;
        updateSyncUI(false, null);
      }
    });
  }
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

/** 同步失敗个通知：伺服器忙／逾時／網路／金鑰錯誤分開講。 */
function reportSyncFailure(err, action) {
  console.error(`[CloudSync] ${action}失敗:`, err);
  updateSyncStatusUI('error');
  const status = err && err.status;
  if (status === 401) showSyncError('同步金鑰毋對，請重新設定');
  else if (status === 413) showSyncError('資料忒大，無法同步');
  else if (status === 503 || status === 429) showSyncError('雲端同步暫時忙碌，稍後再試');
  else showSyncError(`${action}失敗，請稍後再試`);
}

function snapshotAfterPush() {
  localStorage.setItem('hakkaDailyStatsSynced', localStorage.getItem('hakkaDailyStats') || '{}');
  localStorage.setItem('hakkaDailyStatsByLevelSynced', localStorage.getItem('hakkaDailyStatsByLevel') || '{}');
  localStorage.setItem(
    'hakkaPrefsSynced',
    JSON.stringify({
      romanizerJoiningMode: localStorage.getItem('romanizerJoiningMode') || 'none',
      hakfaDisplayScript: normalizeDisplayScript(localStorage.getItem('hakfaDisplayScript')),
      showMeinungFill: localStorage.getItem('showMeinungFill') === 'true',
      gameLastDataVarName: localStorage.getItem('hakkaGameLastDataVarName') || '',
      userName: localStorage.getItem('hakkaUserName') || '',
      userLocation: localStorage.getItem('hakkaUserLocation') || '',
    }),
  );
}

/**
 * 從雲端拉取資料並合併（Pull-Merge-Push）。
 */
async function syncFromCloud() {
  if (!hasSyncKey()) return;

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
    const { status, json } = await syncRequest('GET');
    if (status !== 200) {
      const err = new Error(`sync_get_${status}`);
      err.status = status;
      throw err;
    }
    if (json && json.exists && json.data) {
      localStorage.setItem(SYNC_REV_STORAGE, String(json.updated_at));
      await applyIncomingSyncData(json.data, false);
    } else {
      // 雲端無資料：上傳本地資料（base_updated_at = 0）
      localStorage.removeItem(SYNC_REV_STORAGE);
      if (await syncToCloud()) snapshotAfterPush();
    }
    cloudSyncState.lastSyncTime = new Date();
    updateSyncStatusUI('success');
  } catch (err) {
    reportSyncFailure(err, '同步');
  } finally {
    cloudSyncState.isSyncing = false;
  }
}

/**
 * 上傳本地資料到雲端。版本衝突（409）就合併伺服器上个資料再推，最多重試 SYNC_MAX_CONFLICT_RETRIES 擺。
 * @returns {Promise<boolean>} 有無成功
 */
async function syncToCloud(retriesLeft = SYNC_MAX_CONFLICT_RETRIES) {
  if (!hasSyncKey()) return false;
  try {
    const payloadData = exportCurrentSyncData();
    const { status, json } = await syncRequest('POST', {
      data: payloadData,
      base_updated_at: getCloudRev(),
    });
    if (status === 200 && json && json.success) {
      localStorage.setItem(SYNC_REV_STORAGE, String(json.updated_at));
      return true;
    }
    if (status === 409 && retriesLeft > 0) {
      // 別台裝置較早推上去：記下新版本，合併它个資料（毋重複觸發推送），再推一擺
      localStorage.setItem(SYNC_REV_STORAGE, String(json && json.updated_at ? json.updated_at : 0));
      if (json && json.data) await applyIncomingSyncData(json.data, false, { skipPush: true });
      return syncToCloud(retriesLeft - 1);
    }
    const err = new Error(`sync_post_${status}`);
    err.status = status;
    throw err;
  } catch (err) {
    reportSyncFailure(err, '上傳');
    return false;
  }
}

/**
 * 刪掉雲端資料（這把金鑰个）。本機資料毋動；成功後做得再 clearSyncKey()。
 */
async function deleteCloudData() {
  const { status } = await syncRequest('DELETE');
  if (status !== 200) {
    const err = new Error(`sync_delete_${status}`);
    err.status = status;
    throw err;
  }
  localStorage.removeItem(SYNC_REV_STORAGE);
  return true;
}

/**
 * 核心合併邏輯：雲端拉取 (syncFromCloud) 與手動匯入 (Import) 100% 共用
 * @param {object} data - 外部傳入之同步資料包
 * @param {boolean} isFromManual - 是否為手動匯入
 */
async function applyIncomingSyncData(data, isFromManual = false, options = {}) {
  if (!data) return false;

  // 1. 準備資料
  const localBookmarks = JSON.parse(
    localStorage.getItem('hakkaBookmarks') || '[]',
  );
  const incomingBookmarks = Array.isArray(data.bookmarks) ? data.bookmarks : [];

  const localPrefs = {
    romanizerJoiningMode:
      localStorage.getItem('romanizerJoiningMode') || 'none',
    hakfaDisplayScript: normalizeDisplayScript(
      localStorage.getItem('hakfaDisplayScript'),
    ),
    showMeinungFill: localStorage.getItem('showMeinungFill') === 'true',
    gameLastDataVarName:
      localStorage.getItem('hakkaGameLastDataVarName') || '',
    userName: localStorage.getItem('hakkaUserName') || '',
    userLocation: localStorage.getItem('hakkaUserLocation') || '',
  };
  const incomingPrefs = data.preferences || {};

  const localProgress = JSON.parse(
    localStorage.getItem('hakkaLearningProgress') || '{}'
  );
  const incomingProgress = data.learning_progress || {};

  const localStats = JSON.parse(
    localStorage.getItem('hakkaDailyStats') || '{}'
  );
  const incomingStats = data.daily_stats || {};
  const localStatsByLevel = JSON.parse(
    localStorage.getItem('hakkaDailyStatsByLevel') || '{}'
  );
  const incomingStatsByLevel = data.daily_stats_by_level || {};
  const syncedStats = JSON.parse(
    localStorage.getItem('hakkaDailyStatsSynced') || '{}'
  );
  const syncedStatsByLevel = JSON.parse(
    localStorage.getItem('hakkaDailyStatsByLevelSynced') || '{}'
  );
  const syncedPrefs = JSON.parse(
    localStorage.getItem('hakkaPrefsSynced') || '{}'
  );

  const localFavs = JSON.parse(
    localStorage.getItem('hakkaDailyFavs') || '{"items":[],"tomb":{}}'
  );
  const incomingFavs = data.daily_favs || { items: [], tomb: {} };

  const localFamiliarity = JSON.parse(
    localStorage.getItem('hakkaFamiliarity') || '{}'
  );
  const incomingFamiliarity = data.familiarity || {};

  // 2. 合併資料
  const mergedBookmarks = mergeBookmarks(localBookmarks, incomingBookmarks);
  const mergedProgress = mergeProgress(localProgress, incomingProgress);
  const mergedStats = mergeDailyStats(localStats, incomingStats, syncedStats);
  const mergedStatsByLevel = mergeDailyStatsByLevel(localStatsByLevel, incomingStatsByLevel, syncedStatsByLevel);
  const mergedFavs = mergeDailyFavs(localFavs, incomingFavs);
  const mergedFamiliarity = mergeFamiliarity(localFamiliarity, incomingFamiliarity);

  if (typeof window.foldTypeKeysIntoWordCards === 'function') {
    window.foldTypeKeysIntoWordCards(mergedProgress);
  }

  // 3. 寫入本地 storage
  localStorage.setItem('hakkaBookmarks', JSON.stringify(mergedBookmarks));
  localStorage.setItem('hakkaLearningProgress', JSON.stringify(mergedProgress));
  localStorage.setItem('hakkaDailyStats', JSON.stringify(mergedStats));
  localStorage.setItem('hakkaDailyStatsByLevel', JSON.stringify(mergedStatsByLevel));
  localStorage.setItem('hakkaDailyFavs', JSON.stringify(mergedFavs));
  localStorage.setItem('hakkaFamiliarity', JSON.stringify(mergedFamiliarity));

  // 合併偏好設定
  let finalRomanizerJoiningMode = localPrefs.romanizerJoiningMode;
  if (localPrefs.romanizerJoiningMode === (syncedPrefs.romanizerJoiningMode || 'none')) {
    if (incomingPrefs.romanizerJoiningMode !== undefined && incomingPrefs.romanizerJoiningMode !== null) {
      finalRomanizerJoiningMode = incomingPrefs.romanizerJoiningMode;
    }
  }
  localStorage.setItem('romanizerJoiningMode', finalRomanizerJoiningMode);

  let finalHakfaDisplayScript = localPrefs.hakfaDisplayScript;
  if (localPrefs.hakfaDisplayScript === normalizeDisplayScript(syncedPrefs.hakfaDisplayScript)) {
    if (incomingPrefs.hakfaDisplayScript !== undefined && incomingPrefs.hakfaDisplayScript !== null) {
      finalHakfaDisplayScript = normalizeDisplayScript(incomingPrefs.hakfaDisplayScript);
    }
  }
  localStorage.setItem('hakfaDisplayScript', finalHakfaDisplayScript);
  if (
    finalHakfaDisplayScript !== localPrefs.hakfaDisplayScript &&
    typeof window.applyHakfaDisplayScript === 'function'
  ) {
    window.applyHakfaDisplayScript(finalHakfaDisplayScript);
  }

  const finalShowMeinungFill = mergeBoolPref(
    localPrefs.showMeinungFill,
    syncedPrefs.showMeinungFill,
    incomingPrefs.showMeinungFill,
  );
  localStorage.setItem('showMeinungFill', String(finalShowMeinungFill));
  if (
    finalShowMeinungFill !== localPrefs.showMeinungFill &&
    typeof window.applyMeinungFillSetting === 'function'
  ) {
    window.applyMeinungFillSetting(finalShowMeinungFill);
  }

  let finalGameLastDataVarName = localPrefs.gameLastDataVarName;
  if (localPrefs.gameLastDataVarName === (syncedPrefs.gameLastDataVarName || '')) {
    if (incomingPrefs.gameLastDataVarName) {
      finalGameLastDataVarName = incomingPrefs.gameLastDataVarName;
    }
  }
  localStorage.setItem('hakkaGameLastDataVarName', finalGameLastDataVarName);

  let finalUserName = localPrefs.userName;
  if (localPrefs.userName === (syncedPrefs.userName || '')) {
    if (incomingPrefs.userName !== undefined && incomingPrefs.userName !== null) {
      finalUserName = incomingPrefs.userName;
    }
  }
  localStorage.setItem('hakkaUserName', finalUserName);

  let finalUserLocation = localPrefs.userLocation;
  if (localPrefs.userLocation === (syncedPrefs.userLocation || '')) {
    if (incomingPrefs.userLocation !== undefined && incomingPrefs.userLocation !== null) {
      finalUserLocation = incomingPrefs.userLocation;
    }
  }
  localStorage.setItem('hakkaUserLocation', finalUserLocation);

  // 4. 推進快照（手動匯入直接推進；雲端同步則在 Smart Push 後推進）
  if (isFromManual) {
    localStorage.setItem('hakkaDailyStatsSynced', JSON.stringify(mergedStats));
    localStorage.setItem('hakkaDailyStatsByLevelSynced', JSON.stringify(mergedStatsByLevel));
    localStorage.setItem(
      'hakkaPrefsSynced',
      JSON.stringify({
        romanizerJoiningMode: finalRomanizerJoiningMode,
        hakfaDisplayScript: finalHakfaDisplayScript,
        showMeinungFill: finalShowMeinungFill,
        gameLastDataVarName: finalGameLastDataVarName,
        userName: finalUserName,
        userLocation: finalUserLocation,
      })
    );
  } else {
    // 雲端 Smart Push 比對
    const bookmarksChanged =
      JSON.stringify(mergedBookmarks) !== JSON.stringify(incomingBookmarks);
    const prefsChanged =
      finalRomanizerJoiningMode !== (incomingPrefs.romanizerJoiningMode || 'none') ||
      finalHakfaDisplayScript !== normalizeDisplayScript(incomingPrefs.hakfaDisplayScript) ||
      finalShowMeinungFill !== (incomingPrefs.showMeinungFill === true) ||
      finalGameLastDataVarName !== (incomingPrefs.gameLastDataVarName || '') ||
      finalUserName !== (incomingPrefs.userName || '') ||
      finalUserLocation !== (incomingPrefs.userLocation || '');
    const progressChanged =
      JSON.stringify(mergedProgress) !== JSON.stringify(incomingProgress);
    const statsChanged =
      JSON.stringify(mergedStats) !== JSON.stringify(incomingStats) ||
      JSON.stringify(mergedStatsByLevel) !== JSON.stringify(incomingStatsByLevel);
    const favsChanged =
      JSON.stringify(mergedFavs) !== JSON.stringify(incomingFavs);
    const familiarityChanged =
      JSON.stringify(mergedFamiliarity) !== JSON.stringify(incomingFamiliarity);

    if (options.skipPush) {
      // 衝突重試：由呼叫端（syncToCloud）自家再推，這裡毋重複推
    } else if (bookmarksChanged || prefsChanged || progressChanged || statsChanged || favsChanged || familiarityChanged) {
      console.log('[CloudSync] 資料有變更，執行上傳 (Smart Push)');
      await syncToCloud();
    } else {
      console.log('[CloudSync] 資料一致，跳過上傳');
    }
    localStorage.setItem('hakkaDailyStatsSynced', JSON.stringify(mergedStats));
    localStorage.setItem('hakkaDailyStatsByLevelSynced', JSON.stringify(mergedStatsByLevel));
    localStorage.setItem(
      'hakkaPrefsSynced',
      JSON.stringify({
        romanizerJoiningMode: finalRomanizerJoiningMode,
        hakfaDisplayScript: finalHakfaDisplayScript,
        showMeinungFill: finalShowMeinungFill,
        gameLastDataVarName: finalGameLastDataVarName,
        userName: finalUserName,
        userLocation: finalUserLocation,
      })
    );
  }

  // 5. 觸發 UI 更新
  if (typeof window.updateProgressDropdown === 'function') {
    window.updateProgressDropdown();
  }
  if (window.DailyWord && typeof window.DailyWord.refreshUI === 'function') {
    window.DailyWord.refreshUI();
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('hakkaFavChanged'));
    window.dispatchEvent(new CustomEvent('hakkaFamiliarityChanged'));
  }

  return true;
}

/**
 * 匯出本機所有同步資料包（格式與 syncToCloud payload 100% 完全共樣）
 */
function exportCurrentSyncData() {
  const bookmarks = JSON.parse(
    localStorage.getItem('hakkaBookmarks') || '[]',
  );
  const preferences = {
    romanizerJoiningMode:
      localStorage.getItem('romanizerJoiningMode') || 'none',
    hakfaDisplayScript: normalizeDisplayScript(
      localStorage.getItem('hakfaDisplayScript'),
    ),
    showMeinungFill: localStorage.getItem('showMeinungFill') === 'true',
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
  const familiarity = JSON.parse(
    localStorage.getItem('hakkaFamiliarity') || '{}'
  );

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    bookmarks,
    preferences,
    learning_progress: learningProgress,
    daily_stats: dailyStats,
    daily_stats_by_level: dailyStatsByLevel,
    daily_favs: dailyFavs,
    familiarity,
  };
}

/**
 * 合併本地與雲端書籤
 * 比照 saveBookmark 的邏輯：
 * 1. 同表格同類別：保留 timestamp 較新的
 * 2. 同表格不同類別：只保留 timestamp 最新的那個類別
 * 3. 依 timestamp 排序，保留最新的 BOOKMARK_LIMIT 筆
 */
/**
 * 布林偏好（LWW，如美濃腔 showMeinungFill）个合併：
 * 本地相對「已同步基準快照」無變 → 套用雲端值（雲端有值正套）；本地有變 → 保留本地，留給 Smart Push 推上去。
 * 值可能係 boolean 抑係 'true'／'false' 字串；未設定視為 false。
 */
function mergeBoolPref(local, synced, cloud) {
  const toBool = (v) => v === true || v === 'true';
  if (toBool(local) === toBool(synced) && cloud !== undefined && cloud !== null) {
    return toBool(cloud);
  }
  return toBool(local);
}

function mergeBookmarks(localBookmarks, cloudBookmarks) {
  // 輸入驗證：確保參數是陣列
  const local = Array.isArray(localBookmarks) ? localBookmarks : [];
  const cloud = Array.isArray(cloudBookmarks) ? cloudBookmarks : [];

  // 合併所有書籤
  const allBookmarks = [...cloud, ...local];

  // 用 tableName + filter 為 key，確保同一腔級同一模式只保留最新一筆進度
  const bookmarkMap = new Map();

  allBookmarks.forEach((bm) => {
    const key = `${bm.tableName}||${bm.filter || 'all'}`;
    const existing = bookmarkMap.get(key);

    if (!existing) {
      bookmarkMap.set(key, bm);
    } else {
      // 比較 timestamp，保留較新的
      const currentTime = bm.timestamp || 0;
      const existingTime = existing.timestamp || 0;
      if (currentTime > existingTime) {
        bookmarkMap.set(key, bm);
      }
    }
  });

  // 轉回陣列並依 timestamp 排序
  let merged = Array.from(bookmarkMap.values());
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
 * items 與 tomb 皆存儲 { key: timestamp }，以最新時間為準。
 */
function mergeDailyFavs(localObj, cloudObj) {
  const local = (localObj && typeof localObj === 'object') ? localObj : { items: {}, tomb: {} };
  const cloud = (cloudObj && typeof cloudObj === 'object') ? cloudObj : { items: {}, tomb: {} };

  // 1. 舊版陣列結構升級 (Migration)
  const normalizeItems = (items) => {
    if (Array.isArray(items)) {
      const obj = {};
      const now = Date.now();
      items.forEach(key => { obj[key] = now; });
      return obj;
    }
    return items || {};
  };

  const localItems = normalizeItems(local.items);
  const cloudItems = normalizeItems(cloud.items);

  // 2. 合併 tomb (取兩邊最新時間戳)
  const mergedTomb = { ...(local.tomb || {}) };
  for (const [key, ts] of Object.entries(cloud.tomb || {})) {
    if (!mergedTomb[key] || ts > mergedTomb[key]) {
      mergedTomb[key] = ts;
    }
  }

  // 3. 合併 items (取兩邊最新時間戳)
  const mergedItems = { ...localItems };
  for (const [key, ts] of Object.entries(cloudItems)) {
    if (!mergedItems[key] || ts > mergedItems[key]) {
      mergedItems[key] = ts;
    }
  }

  // 4. Tombstone 與 Items 競合判定
  // 若項目存在於 tomb 中，且 tomb 時間較新，則將該 item 刪除；
  // 若 item 的加入時間較新 (代表取消收藏後又重加)，則保留 item，並從 tomb 中移除。
  for (const key of Object.keys(mergedTomb)) {
    if (mergedItems[key] && mergedTomb[key] > mergedItems[key]) {
      delete mergedItems[key];
    } else if (mergedItems[key]) {
      delete mergedTomb[key];
    }
  }

  // 5. 跨腔重複收藏清理 (Deduplication by word/entry)
  const dedupedItems = {};
  const seenKeys = new Set();
  const sortedItemKeys = Object.keys(mergedItems).sort((a, b) => (mergedItems[b] || 0) - (mergedItems[a] || 0));
  for (const k of sortedItemKeys) {
    const isGip = k.charAt(0) === 'g';
    const colonIdx = k.indexOf(':');
    const word = colonIdx !== -1 ? k.substring(colonIdx + 1) : k;
    let dedupKey;
    if (isGip) {
      dedupKey = `g:${word}`;
    } else {
      const idPart = k.substring(0, colonIdx);
      const m = idPart.match(/^c.(.*?)([0-9].*)$/);
      dedupKey = m ? `c:${m[1]}|${m[2]}` : `c:${word}`;
    }
    if (seenKeys.has(dedupKey)) {
      mergedTomb[k] = Date.now();
    } else {
      seenKeys.add(dedupKey);
      dedupedItems[k] = mergedItems[k];
    }
  }

  return {
    items: dedupedItems,
    tomb: mergedTomb
  };
}

/**
 * 熟悉度標記合併：LWW per-key（後蓋前，取 timestamp 較新者）
 * 結構：{ [itemKey]: [grade, updated_at] }
 */
function mergeFamiliarity(localObj, cloudObj) {
  const local = (localObj && typeof localObj === 'object') ? localObj : {};
  const cloud = (cloudObj && typeof cloudObj === 'object') ? cloudObj : {};

  const merged = { ...cloud };
  for (const key in local) {
    const localEntry = local[key];
    const cloudEntry = cloud[key];
    const localTs = Array.isArray(localEntry) ? localEntry[1] : 0;
    const cloudTs = Array.isArray(cloudEntry) ? cloudEntry[1] : 0;
    if (!cloudEntry || localTs >= cloudTs) {
      merged[key] = localEntry;
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

    if (cloudSyncBtn.style.display !== 'none') {
      if (cloudSyncUserBtn) {
        const displayName =
          user.user_metadata?.full_name || user.email || '使用者';
        cloudSyncUserBtn.dataset.tooltip = displayName;
        cloudSyncUserBtn.style.display = 'inline-block';
      }
      if (cloudSyncLogoutBtn) {
        cloudSyncLogoutBtn.style.display = 'inline-block';
      }
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

  cloudSyncBtn.classList.remove('syncing', 'sync-success', 'sync-error', 'sync-restricted');

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
    case 'restricted':
      cloudSyncState.isRestricted = true;
      cloudSyncBtn.classList.add('sync-restricted');
      cloudSyncBtn.title = '雲端自動共步受限，點擊開啟手動共步';
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
  if (!hasSyncKey()) return;

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
 * 頁面離開與恢復時的同步機制（事件驅動）
 * 1. 頁面隱藏/離開時：若有尚未防抖推送的資料，立即拉取合併並保存
 * 2. 頁面恢復顯示時：若距離上次同步大於 5 分鐘，自動執行雲端拉取
 */
function setupPageUnloadSync() {
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'hidden') {
      if (hasPendingSync) {
        if (syncDebounceTimer) {
          clearTimeout(syncDebounceTimer);
          syncDebounceTimer = null;
        }
        await syncFromCloud();
        hasPendingSync = false;
      }
    } else if (document.visibilityState === 'visible') {
      if (hasSyncKey()) {
        const now = Date.now();
        const lastTime = cloudSyncState.lastSyncTime ? cloudSyncState.lastSyncTime.getTime() : 0;
        if (now - lastTime > 5 * 60 * 1000) {
          console.log('[CloudSync] 頁面切回且距上次同步大於 5 分鐘，自動執行拉取');
          await syncFromCloud();
        }
      }
    }
  });
}

/**
 * 壓縮同步資料至 URL-safe Base64 字串
 * 優先使用瀏覽器原生 CompressionStream('deflate-raw')
 */
async function compressSyncDataToUrl(dataObj) {
  const jsonStr = JSON.stringify(dataObj);
  if (typeof CompressionStream !== 'undefined' && typeof Blob !== 'undefined' && typeof Response !== 'undefined') {
    try {
      const stream = new Blob([jsonStr]).stream();
      const compressedStream = stream.pipeThrough(new CompressionStream('deflate-raw'));
      const buffer = await new Response(compressedStream).arrayBuffer();
      let binary = '';
      const bytes = new Uint8Array(buffer);
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return btoa(binary)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
    } catch (e) {
      console.warn('[CloudSync] CompressionStream 失敗，降級為 encodeURIComponent', e);
    }
  }
  return encodeURIComponent(jsonStr);
}

/**
 * 從 URL-safe Base64 字串解壓還原同步資料
 */
async function decompressSyncDataFromUrl(base64UrlStr) {
  if (!base64UrlStr) return null;
  if (base64UrlStr.startsWith('%7B') || base64UrlStr.startsWith('{')) {
    return JSON.parse(decodeURIComponent(base64UrlStr));
  }

  if (typeof DecompressionStream !== 'undefined' && typeof Blob !== 'undefined' && typeof Response !== 'undefined') {
    try {
      let base64 = base64UrlStr.replace(/-/g, '+').replace(/_/g, '/');
      while (base64.length % 4) base64 += '=';
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const stream = new Blob([bytes]).stream();
      const decompressedStream = stream.pipeThrough(new DecompressionStream('deflate-raw'));
      const jsonStr = await new Response(decompressedStream).text();
      return JSON.parse(jsonStr);
    } catch (e) {
      console.error('[CloudSync] 解壓縮失敗:', e);
      throw e;
    }
  }
  return JSON.parse(decodeURIComponent(base64UrlStr));
}

/**
 * 檢查網址 hash 是否帶有手動同步資料 (#sync=...)
 */
async function checkUrlSyncPayload() {
  if (typeof window === 'undefined' || !window.location || !window.location.hash) return;
  const hash = window.location.hash;
  const match = hash.match(/[#&]sync=([^&]+)/);
  if (!match) return;

  const rawPayload = match[1];
  try {
    const data = await decompressSyncDataFromUrl(rawPayload);
    if (!data) return;

    const confirmMsg =
      '📥 偵測著手動共步資料（包含書籤、偏好摎學習進度），敢愛匯入這隻裝置並進行智慧合併？';
    if (confirm(confirmMsg)) {
      await applyIncomingSyncData(data, true);
      alert('✅ 手動共步成功！資料已完整合併至本機。');
    }
    // 清除 hash 中的 sync 參數
    const cleanUrl = window.location.href.replace(/[#&]sync=[^&]+/, '');
    history.replaceState(null, '', cleanUrl.endsWith('#') ? cleanUrl.slice(0, -1) : cleanUrl);
  } catch (err) {
    console.error('[CloudSync] 處理網址手動同步失敗:', err);
    alert('手動共步失敗：網址資料可能不完整或損壞。');
  }
}

/**
 * 顯示雲端自動同步受限提示文案
 */
function showSyncRestrictedNotice() {
  const noticeId = 'cloudSyncRestrictedBanner';
  let banner = document.getElementById(noticeId);
  if (!banner) {
    banner = document.createElement('div');
    banner.id = noticeId;
    banner.style.cssText =
      'background: #fff3cd; color: #856404; border-bottom: 1px solid #ffeeba; padding: 10px 16px; font-size: 14px; line-height: 1.5; text-align: center; position: sticky; top: 0; z-index: 10001; box-shadow: 0 2px 6px rgba(0,0,0,0.08);';
    document.body.prepend(banner);
  }
  banner.innerHTML =
    '⚠️ 失禮！因為後台搣毋著，雲端自動共步功能超過免費額，可能愛到 11/24 正恢復。這段時間還係做得用手動共步（<a href="#manual-sync" id="bannerManualSyncLink" style="color: #533f03; font-weight: bold; text-decoration: underline; cursor: pointer;"><i class="fas fa-arrows-rotate"></i> 請點這位</a>）';

  const link = document.getElementById('bannerManualSyncLink');
  if (link) {
    link.onclick = (e) => {
      e.preventDefault();
      showManualSyncModal();
    };
  }
}

/**
 * 顯示手動同步對話框（Modal）
 */
function cloudKeyEls() {
  const ids = ['Off', 'On', 'Input', 'Display', 'Status', 'EnableBtn', 'JoinBtn', 'ToggleBtn', 'CopyBtn', 'SyncNowBtn', 'DisableBtn', 'DeleteBtn'];
  const els = {};
  ids.forEach((id) => {
    els[id] = document.getElementById('cloudKey' + id);
  });
  return els;
}

function setCloudKeyStatus(text, isError) {
  const { Status } = cloudKeyEls();
  if (!Status) return;
  Status.textContent = text || '';
  Status.style.color = isError ? '#b71c1c' : 'inherit';
}

/** 依目前有無金鑰，切換「開啟」摎「已開啟」兩個畫面。 */
function renderCloudKeyUI() {
  const els = cloudKeyEls();
  if (!els.Off || !els.On) return;
  const key = getSyncKey();
  els.Off.hidden = !!key;
  els.On.hidden = !key;
  if (els.Display) {
    els.Display.value = key ? formatSyncKey(key) : '';
    els.Display.type = 'password';
  }
  if (els.ToggleBtn) els.ToggleBtn.textContent = '顯示金鑰';
  setCloudKeyStatus('');
}

function bindCloudKeyUI() {
  const els = cloudKeyEls();
  if (!els.EnableBtn) return;

  const runSync = async (doneText) => {
    setCloudKeyStatus('共步中…');
    await syncFromCloud();
    const failed = document.getElementById('cloudSyncBtn')?.classList.contains('sync-error');
    setCloudKeyStatus(failed ? '共步失敗，請稍後再試。' : doneText, failed);
  };

  els.EnableBtn.onclick = async () => {
    const key = generateSyncKey();
    setSyncKey(key);
    renderCloudKeyUI();
    // 顯示新金鑰，提醒備份
    const { Display, ToggleBtn } = cloudKeyEls();
    if (Display) Display.type = 'text';
    if (ToggleBtn) ToggleBtn.textContent = '隱藏金鑰';
    await runSync('已開啟。請先複製金鑰存好，另一台裝置輸入同一把就會共步。');
  };

  els.JoinBtn.onclick = async () => {
    const raw = els.Input.value;
    if (!isValidSyncKey(raw)) {
      setCloudKeyStatus('金鑰格式毋對（愛 32 碼英文字母摎數字 2～7，連字號做得有做得無）。', true);
      return;
    }
    setSyncKey(raw);
    els.Input.value = '';
    renderCloudKeyUI();
    await runSync('已連結，資料已合併。');
  };

  els.ToggleBtn.onclick = () => {
    const { Display, ToggleBtn } = cloudKeyEls();
    const show = Display.type === 'password';
    Display.type = show ? 'text' : 'password';
    ToggleBtn.textContent = show ? '隱藏金鑰' : '顯示金鑰';
  };

  els.CopyBtn.onclick = async () => {
    const key = getSyncKey();
    if (!key) return;
    try {
      await navigator.clipboard.writeText(formatSyncKey(key));
      setCloudKeyStatus('已複製金鑰。');
    } catch (_) {
      const { Display } = cloudKeyEls();
      Display.type = 'text';
      Display.select();
      setCloudKeyStatus('毋會自動複製，請手動選取複製。', true);
    }
  };

  els.SyncNowBtn.onclick = () => runSync('已共步。');

  els.DisableBtn.onclick = () => {
    if (!confirm('停用這台裝置个雲端同步？（淨清掉這台裝置个金鑰；雲端資料摎本機資料都毋會刪）\n請先確定金鑰有存好，毋然會拿毋轉。')) return;
    clearSyncKey();
    renderCloudKeyUI();
    setCloudKeyStatus('已停用這台裝置。');
  };

  els.DeleteBtn.onclick = async () => {
    if (!confirm('刪除這把金鑰个雲端資料？刪掉就拿毋轉，其他裝置也無法再共步。（本機資料毋會刪）')) return;
    try {
      await deleteCloudData();
      clearSyncKey();
      renderCloudKeyUI();
      setCloudKeyStatus('雲端資料已刪除，這台裝置已停用雲端同步。');
    } catch (err) {
      console.error('[CloudSync] 刪除雲端資料失敗:', err);
      setCloudKeyStatus('刪除失敗，請稍後再試。', true);
    }
  };
}

function showManualSyncModal() {
  const modalId = 'manualSyncModal';
  let modal = document.getElementById(modalId);
  if (!modal) {
    modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'modal-overlay';
    modal.style.cssText =
      'display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 10002; align-items: center; justify-content: center;';
    modal.innerHTML = `
      <div class="modal-dialog" style="background: var(--bg-card, #fff); color: var(--text-main, #333); padding: 24px; border-radius: 12px; max-width: 500px; width: 90%; box-shadow: 0 8px 24px rgba(0,0,0,0.2);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <h3 style="margin: 0; font-size: 18px;"><i class="fas fa-arrows-rotate"></i> 客源翠手動共步（跨裝置無痛轉移）</h3>
          <button id="closeManualSyncModalBtn" style="border: none; background: transparent; font-size: 20px; cursor: pointer; color: var(--text-muted, #888);">&times;</button>
        </div>
        <div style="font-size: 13.5px; line-height: 1.6; margin-bottom: 20px; background: rgba(255, 193, 7, 0.15); border-left: 4px solid #ffc107; padding: 10px 12px; border-radius: 4px;">
          失禮！因為後台搣毋著，Google 登入該套雲端共步超過免費額，可能愛到 11/24 正恢復。這段時間做得用下背个「雲端同步金鑰」（免登入、自動共步），抑係手動共步。
          <div style="margin-top: 8px;">
            <a href="#" data-open-sync-survey style="font-weight: bold;">📝 幫忙填 1 分鐘問卷，講你个使用狀況 →</a>
          </div>
        </div>

        <div id="cloudKeySection" style="margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid var(--border-color, #eee);">
          <h4 style="margin: 0 0 8px 0; font-size: 15px;">雲端同步金鑰（免登入，自動共步）</h4>
          <p style="margin: 0 0 10px 0; font-size: 13px; color: var(--text-muted, #666);">
            產生一把金鑰，每台裝置輸入同一把，書籤、學習進度就會自動共步。<strong>金鑰就是你个帳號，毋好分別人；弄毋見就拿毋轉雲端資料。</strong>
          </p>
          <div id="cloudKeyOff">
            <button id="cloudKeyEnableBtn" type="button" style="background: #2e7d32; color: #fff; border: none; padding: 10px 16px; border-radius: 6px; font-weight: bold; cursor: pointer; width: 100%;">開啟雲端同步（產生新金鑰）</button>
            <div style="margin-top: 10px; display: flex; gap: 8px;">
              <input id="cloudKeyInput" type="text" autocomplete="off" spellcheck="false" placeholder="已經有金鑰？貼在這" aria-label="同步金鑰" style="flex: 1; min-width: 0; padding: 8px; font-size: 13px; border: 1px solid var(--border-color, #ccc); border-radius: 6px;" />
              <button id="cloudKeyJoinBtn" type="button" style="background: #1976d2; color: #fff; border: none; padding: 8px 12px; border-radius: 6px; cursor: pointer; font-size: 13px;">連結這台裝置</button>
            </div>
          </div>
          <div id="cloudKeyOn" hidden>
            <div style="font-size: 13px; margin-bottom: 6px;">這台裝置已開啟雲端同步。你个金鑰：</div>
            <input id="cloudKeyDisplay" type="password" readonly aria-label="你个同步金鑰" style="width: 100%; box-sizing: border-box; padding: 8px; font-size: 13px; font-family: monospace; border: 1px solid var(--border-color, #ccc); border-radius: 6px;" />
            <div style="margin-top: 8px; display: flex; flex-wrap: wrap; gap: 8px;">
              <button id="cloudKeyToggleBtn" type="button" style="background: #607d8b; color: #fff; border: none; padding: 7px 10px; border-radius: 6px; cursor: pointer; font-size: 13px;">顯示金鑰</button>
              <button id="cloudKeyCopyBtn" type="button" style="background: #607d8b; color: #fff; border: none; padding: 7px 10px; border-radius: 6px; cursor: pointer; font-size: 13px;">複製</button>
              <button id="cloudKeySyncNowBtn" type="button" style="background: #2e7d32; color: #fff; border: none; padding: 7px 10px; border-radius: 6px; cursor: pointer; font-size: 13px;">立即共步</button>
              <button id="cloudKeyDisableBtn" type="button" style="background: #b26a00; color: #fff; border: none; padding: 7px 10px; border-radius: 6px; cursor: pointer; font-size: 13px;">停用這台</button>
              <button id="cloudKeyDeleteBtn" type="button" style="background: #b71c1c; color: #fff; border: none; padding: 7px 10px; border-radius: 6px; cursor: pointer; font-size: 13px;">刪除雲端資料</button>
            </div>
          </div>
          <div id="cloudKeyStatus" role="status" style="margin-top: 8px; min-height: 1.4em; font-size: 13px;"></div>
        </div>

        <div style="margin-bottom: 20px;">
          <h4 style="margin: 0 0 8px 0; font-size: 15px;">方案一：網址一鍵跨裝置共步（最推薦）</h4>
          <p style="margin: 0 0 10px 0; font-size: 13px; color: var(--text-muted, #666);">
            點擊按鈕複製當前進度短網址（約數百字元），透過 AirDrop、LINE、Email 傳送至另一台裝置打開，即可自動偵測並智慧合併！
          </p>
          <button id="copySyncUrlBtn" style="background: #2e7d32; color: #fff; border: none; padding: 10px 16px; border-radius: 6px; font-weight: bold; cursor: pointer; width: 100%;">
            📋 複製手動共步網址
          </button>
        </div>

        <div style="border-top: 1px solid var(--border-color, #eee); padding-top: 16px;">
          <h4 style="margin: 0 0 8px 0; font-size: 15px;">方案二：備份檔案（JSON 匯出／匯入）</h4>
          <p style="margin: 0 0 10px 0; font-size: 13px; color: var(--text-muted, #666);">
            下載包含書籤、偏好、日日一詞收囥摎學習進度个完整備份檔，隨時匯入還原：
          </p>
          <div style="display: flex; gap: 10px;">
            <button id="downloadSyncJsonBtn" style="flex: 1; background: #1976d2; color: #fff; border: none; padding: 8px 12px; border-radius: 6px; cursor: pointer; font-size: 13px;">
              💾 下載備份 JSON
            </button>
            <label style="flex: 1; background: #607d8b; color: #fff; border: none; padding: 8px 12px; border-radius: 6px; cursor: pointer; font-size: 13px; text-align: center;">
              📂 讀取備份 JSON
              <input type="file" id="importSyncJsonInput" accept=".json" style="display: none;" />
            </label>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    bindCloudKeyUI();

    // 綁定關閉
    const closeBtn = document.getElementById('closeManualSyncModalBtn');
    if (closeBtn) closeBtn.onclick = () => { modal.style.display = 'none'; };
    modal.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };

    // 綁定複製網址
    const copyBtn = document.getElementById('copySyncUrlBtn');
    if (copyBtn) {
      copyBtn.onclick = async () => {
        try {
          copyBtn.disabled = true;
          copyBtn.textContent = '產生網址中...';
          const exportData = exportCurrentSyncData();
          const base64Url = await compressSyncDataToUrl(exportData);
          const syncUrl = `${window.location.origin}${window.location.pathname}#sync=${base64Url}`;

          let copied = false;
          if (navigator.clipboard && navigator.clipboard.writeText) {
            try {
              await navigator.clipboard.writeText(syncUrl);
              copied = true;
            } catch (clipErr) {
              console.warn('[CloudSync] 剪貼簿寫入受阻:', clipErr);
            }
          }

          // 顯示短網址框供複製或查看
          let urlDisplay = document.getElementById('manualSyncUrlDisplay');
          if (!urlDisplay) {
            urlDisplay = document.createElement('div');
            urlDisplay.id = 'manualSyncUrlDisplay';
            urlDisplay.style.cssText = 'margin-top: 10px;';
            urlDisplay.innerHTML = `
              <div style="font-size: 12px; color: var(--text-muted, #666); margin-bottom: 4px;">手動共步短網址：</div>
              <input type="text" readonly id="manualSyncUrlInput" style="width: 100%; padding: 8px; font-size: 12px; border: 1px solid var(--border-color, #ccc); border-radius: 4px; box-sizing: border-box; background: var(--bg-input, #f9f9f9); color: var(--text-main, #333);" />
            `;
            copyBtn.parentNode.appendChild(urlDisplay);
          }
          const inputEl = document.getElementById('manualSyncUrlInput');
          if (inputEl) {
            inputEl.value = syncUrl;
            urlDisplay.style.display = 'block';
            inputEl.focus();
            inputEl.select();
          }

          if (copied) {
            copyBtn.textContent = '✅ 已複製手動共步網址！';
            copyBtn.style.background = '#1b5e20';
          } else {
            prompt('請複製以下手動共步網址：', syncUrl);
            copyBtn.textContent = '✅ 已產生短網址！';
          }

          // 產生網址過後，按鈕恢復原始狀態（2.5 秒後恢復為可再次點擊狀態）
          setTimeout(() => {
            copyBtn.disabled = false;
            copyBtn.textContent = '📋 複製手動共步網址';
            copyBtn.style.background = '#2e7d32';
          }, 2500);
        } catch (e) {
          console.error('[CloudSync] 產生同步網址失敗:', e);
          alert('產生同步網址失敗：' + e.message);
          copyBtn.disabled = false;
          copyBtn.textContent = '📋 複製手動共步網址';
          copyBtn.style.background = '#2e7d32';
        }
      };
    }

    // 綁定下載備份
    const dlBtn = document.getElementById('downloadSyncJsonBtn');
    if (dlBtn) {
      dlBtn.onclick = () => {
        const exportData = exportCurrentSyncData();
        const jsonStr = JSON.stringify(exportData, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const d = new Date();
        const dateStr = `${d.getFullYear()}${(d.getMonth() + 1).toString().padStart(2, '0')}${d.getDate().toString().padStart(2, '0')}`;
        a.href = url;
        a.download = `hakspring-sync-${dateStr}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      };
    }

    // 綁定讀取備份
    const importInput = document.getElementById('importSyncJsonInput');
    if (importInput) {
      importInput.onchange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
          const text = await file.text();
          const parsed = JSON.parse(text);
          if (confirm('📥 確定愛從此備份檔匯入資料並進行智慧合併？')) {
            await applyIncomingSyncData(parsed, true);
            alert('✅ 備份檔匯入成功！所有資料已完整合併至本機。');
            modal.style.display = 'none';
          }
        } catch (err) {
          console.error('[CloudSync] 匯入備份檔失敗:', err);
          alert('匯入失敗：檔案格式不正確或損壞。');
        } finally {
          importInput.value = '';
        }
      };
    }
  }

  // 每次打開時重置按鈕狀態
  const copyBtn = document.getElementById('copySyncUrlBtn');
  if (copyBtn) {
    copyBtn.disabled = false;
    copyBtn.textContent = '📋 複製手動共步網址';
    copyBtn.style.background = '#2e7d32';
  }

  renderCloudKeyUI();
  modal.style.display = 'flex';
}

// 支援全域掛載與測試環境匯出
if (typeof window !== 'undefined') {
  window.showManualSyncModal = showManualSyncModal;
  window.exportCurrentSyncData = exportCurrentSyncData;
  window.applyIncomingSyncData = applyIncomingSyncData;
  window.compressSyncDataToUrl = compressSyncDataToUrl;
  window.decompressSyncDataFromUrl = decompressSyncDataFromUrl;
}

// 全域監聽 manual-sync 連結與按鈕
if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    const target = e.target.closest('a, button');
    if (
      target &&
      (target.getAttribute('href') === '#manual-sync' ||
        target.id === 'manualSyncLink' ||
        target.id === 'bannerManualSyncLink' ||
        target.id === 'manualSyncBtn')
    ) {
      e.preventDefault();
      showManualSyncModal();
    }
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    exportCurrentSyncData,
    applyIncomingSyncData,
    compressSyncDataToUrl,
    decompressSyncDataFromUrl,
    mergeBookmarks,
    mergeProgress,
    mergeDailyStats,
    mergeDailyFavs,
    mergeFamiliarity,
    mergeBoolPref,
    normalizeSyncKey,
    isValidSyncKey,
    formatSyncKey,
    generateSyncKey,
    syncToCloud,
    syncFromCloud
  };
}
