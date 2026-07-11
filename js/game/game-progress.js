// js/game/game-progress.js
// Handles reading and writing learning progress (SRS) to localStorage

const PROGRESS_KEY = 'hakkaLearningProgress';

/**
 * Get learning progress for a specific key
 * @param {string} progressKey - e.g., "c四基1-1|m"
 * @returns {Promise<object|null>} Object {ef, interval, reps, due, firstSeenDay} or null if unseen
 */
async function getProgress(progressKey) {
  try {
    const dataStr = localStorage.getItem(PROGRESS_KEY);
    if (!dataStr) return null;
    const progressData = JSON.parse(dataStr);
    const arr = progressData[progressKey];
    if (!arr || !Array.isArray(arr)) return null;

    // Map from array to object.
    // firstSeenDay (arr[4]) 為後加欄位：舊紀錄無第 5 格時回傳 null（「只加不改舊」原則，不需 migration）。
    // typeReps (arr[5]) 為「一詞一卡」制的各題型練習次數，如 {m:5, p:1}；舊紀錄無此格時回傳 null。
    return {
      ef: arr[0],
      interval: arr[1],
      reps: arr[2],
      due: arr[3],
      firstSeenDay: arr[4] ?? null,
      typeReps: arr[5] ?? null
    };
  } catch (error) {
    console.error('Error getting progress from localStorage:', error);
    return null;
  }
}

let gameSyncDebounceTimer = null;

/**
 * Save learning progress for a specific key
 * @param {string} progressKey - e.g., "c四基1-1|m"
 * @param {object} progressObj - {ef, interval, reps, due, firstSeenDay}
 */
async function putProgress(progressKey, progressObj) {
  try {
    const dataStr = localStorage.getItem(PROGRESS_KEY);
    const progressData = dataStr ? JSON.parse(dataStr) : {};

    const today = Math.floor(Date.now() / 86400000);
    // 初見日：優先用傳入值，其次沿用既有紀錄的舊值，最後才給今天（確保初見日只寫一次、之後不被覆蓋）。
    const existing = progressData[progressKey];
    const prevFirstSeen = Array.isArray(existing) ? existing[4] : undefined;
    const firstSeenDay = progressObj.firstSeenDay ?? prevFirstSeen ?? today;

    // typeReps：優先用傳入值，其次沿用既有紀錄（避免部分更新時把各題型計數洗掉）。
    const prevTypeReps = Array.isArray(existing) ? existing[5] : undefined;
    const typeReps = progressObj.typeReps ?? prevTypeReps ?? null;

    // Store as fixed length array: [ef, interval, reps, due, firstSeenDay, typeReps]
    progressData[progressKey] = [
      progressObj.ef ?? 250,
      progressObj.interval ?? 0,
      progressObj.reps ?? 0,
      progressObj.due ?? today,
      firstSeenDay,
      typeReps
    ];

    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progressData));

    // Debounce 觸發雲端同步 (避免連續答題時頻繁觸發)
    if (typeof window.triggerCloudSync === 'function') {
      if (gameSyncDebounceTimer) {
        clearTimeout(gameSyncDebounceTimer);
      }
      gameSyncDebounceTimer = setTimeout(() => {
        window.triggerCloudSync();
      }, 2000); // 2秒後無新操作則觸發同步
    }

  } catch (error) {
    console.error('Error putting progress to localStorage:', error);
  }
}

// One-time migration for old progress keys without |m
(function migrateOldProgressKeys() {
  try {
    const dataStr = localStorage.getItem(PROGRESS_KEY);
    if (!dataStr) return;
    const progressData = JSON.parse(dataStr);
    let migrated = false;
    for (const key in progressData) {
      if (!key.includes('|')) {
        const newKey = key + '|m';
        if (!progressData[newKey]) {
          progressData[newKey] = progressData[key];
        } else {
          // If both exist, keep the one with a higher due date
          const oldDue = progressData[key][3] || 0;
          const newDue = progressData[newKey][3] || 0;
          if (oldDue > newDue) {
            progressData[newKey] = progressData[key];
          }
        }
        delete progressData[key];
        migrated = true;
      }
    }
    if (migrated) {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(progressData));
      console.log('Migrated old progress keys to include |m');
    }
  } catch (e) {
    console.error('Migration failed:', e);
  }
})();

// 「一詞一卡」制遷移：把獨立排程的題型 key（|p/|l/|c）併回 |m 詞卡。
// - 詞卡＝既有 |m 紀錄（錨點）；若某詞只有 |p 紀錄，就用它升格當詞卡。
// - 各題型的 reps 折成詞卡 slot 5 的 typeReps；due 取兩者較早者（寧可多複習、不可漏）。
// ⚠️ 必須 idempotent：雲端合併（mergeProgress 是聯集）會把已刪的舊題型 key 復活，
//    這個 fold 會被重複執行——「已折過」（typeReps 已記有該題型且次數不小於舊 key）時
//    只刪 key、不再動 due 與計數，否則 due 會一再被舊 key 拉回過去、reps 雙重累計。
function foldTypeKeysIntoWordCards(progressData) {
  let changed = false;
  for (const key in progressData) {
    const match = key.match(/^(.*)\|([plc])$/);
    if (!match) continue;
    const wordKey = match[1] + '|m';
    const typeCode = match[2];
    const typeArr = progressData[key];
    if (!Array.isArray(typeArr)) { delete progressData[key]; changed = true; continue; }

    let wordArr = progressData[wordKey];
    if (!Array.isArray(wordArr)) {
      // 沒有 |m 紀錄的孤兒題型卡：升格當詞卡（保留其 SM-2 狀態）
      // typeReps.m 先標 0：這個詞的 |m 從沒練過，別把 |p 的 reps 誤記到 m 頭上
      wordArr = [...typeArr];
      wordArr[5] = { m: 0 };
      progressData[wordKey] = wordArr;
    }
    const typeReps = wordArr[5] && typeof wordArr[5] === 'object' ? wordArr[5] : {};
    if (typeReps.m == null) typeReps.m = wordArr[2] || 0; // |m 自己的歷史 reps

    const alreadyFolded = (typeReps[typeCode] || 0) >= (typeArr[2] || 0);
    if (!alreadyFolded) {
      typeReps[typeCode] = Math.max(typeReps[typeCode] || 0, typeArr[2] || 0);
      // due 取較早者（只在首次折入時做，避免復活 key 反覆重設 due）
      const wDue = wordArr[3] || 0;
      const tDue = typeArr[3] || 0;
      if (tDue && (!wDue || tDue < wDue)) wordArr[3] = tDue;
    }
    if (typeReps[typeCode] == null) typeReps[typeCode] = 0;
    wordArr[5] = typeReps;

    delete progressData[key];
    changed = true;
  }
  return changed;
}
// 給 cloud-sync.js 在合併雲端資料後呼叫，把復活的舊 key 再折掉並隨 Smart Push 清理雲端
window.foldTypeKeysIntoWordCards = foldTypeKeysIntoWordCards;

(function migrateTypeKeysToWordCard() {
  try {
    const dataStr = localStorage.getItem(PROGRESS_KEY);
    if (!dataStr) return;
    const progressData = JSON.parse(dataStr);
    if (foldTypeKeysIntoWordCards(progressData)) {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(progressData));
      console.log('Migrated per-type progress keys into |m word cards (typeReps)');
    }
  } catch (e) {
    console.error('Word-card migration failed:', e);
  }
})();
