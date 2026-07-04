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
    return {
      ef: arr[0],
      interval: arr[1],
      reps: arr[2],
      due: arr[3],
      firstSeenDay: arr[4] ?? null
    };
  } catch (error) {
    console.error('Error getting progress from localStorage:', error);
    return null;
  }
}

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

    // Store as fixed length array: [ef, interval, reps, due, firstSeenDay]
    progressData[progressKey] = [
      progressObj.ef ?? 250,
      progressObj.interval ?? 0,
      progressObj.reps ?? 0,
      progressObj.due ?? today,
      firstSeenDay
    ];

    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progressData));
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
