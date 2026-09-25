// js/familiarity.js
// 熟悉度（Familiarity）資料層：易(1) / 普(不存) / 難(-1)

const FAMILIARITY_KEY = 'hakkaFamiliarity';

// grade: 1（易）、-1（難）、0（普通＝tombstone 紀錄，防止雲端舊資料復活）
// itemKey: progressKey 去掉 |m 尾段，例如 "c四基1-1"
function setFamiliarity(itemKey, grade) {
  let data = {};
  try {
    data = JSON.parse(localStorage.getItem(FAMILIARITY_KEY) || '{}');
  } catch (e) {
    console.error('Failed to parse familiarity data:', e);
  }

  // 儲存 [grade, updated_at]，grade 為 0 代表 tombstone（普通/取消標記）
  data[itemKey] = [grade, Date.now()];

  try {
    localStorage.setItem(FAMILIARITY_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('Failed to save familiarity data:', e);
  }

  if (typeof window !== 'undefined' && typeof window.triggerCloudSync === 'function') {
    window.triggerCloudSync();
  } else if (typeof triggerCloudSync === 'function') {
    triggerCloudSync();
  }
}

function getFamiliarity(itemKey) {
  let data = {};
  try {
    data = JSON.parse(localStorage.getItem(FAMILIARITY_KEY) || '{}');
  } catch (e) {
    console.error('Failed to parse familiarity data:', e);
    return 0;
  }

  const entry = data[itemKey];
  if (!entry) return 0; // 普通
  const grade = Array.isArray(entry) ? entry[0] : entry;
  return grade || 0;
}

function getAllFamiliarity() {
  try {
    const raw = JSON.parse(localStorage.getItem(FAMILIARITY_KEY) || '{}');
    const result = {};
    for (const key in raw) {
      const entry = raw[key];
      const grade = Array.isArray(entry) ? entry[0] : entry;
      if (grade === 1 || grade === -1) {
        result[key] = entry;
      }
    }
    return result;
  } catch (e) {
    console.error('Failed to parse familiarity data:', e);
    return {};
  }
}

// 出題排程用的 interval 修正係數
const FAMILIARITY_MULTIPLIER = {
   1: 2.0,   // 🟢 易：間隔 ×2（看到的頻率減半）
   0: 1.0,   // 普通
  '-1': 0.5  // 🔴 難：間隔 ×0.5（復習頻率加倍）
};

function getAdjustedDue(originalDue, originalInterval, itemKey, todayEpochDay) {
  const grade = getFamiliarity(itemKey);
  if (grade === 0) return originalDue;
  const mult = FAMILIARITY_MULTIPLIER[grade] || 1.0;
  const adjustedInterval = Math.max(1, Math.round(originalInterval * mult));
  // 反推最後復習日，再加修正後的 interval
  const lastReviewDay = originalDue - originalInterval;
  return lastReviewDay + adjustedInterval;
}

// 依據 SM-2 學習進度判斷是否推薦標記或取消熟悉度
function getFamiliaritySuggestion(itemKey) {
  let progressData = {};
  try {
    progressData = JSON.parse(localStorage.getItem('hakkaLearningProgress') || '{}');
  } catch (e) {
    return null;
  }

  const p = progressData[`${itemKey}|m`];
  if (!p) return null;

  // 支援陣列 [ef, interval, reps, ...] 或物件 { ef, interval, reps }
  const ef = Array.isArray(p) ? (p[0] ?? 250) : (p.ef ?? 250);
  const interval = Array.isArray(p) ? (p[1] ?? 0) : (p.interval ?? 0);
  const reps = Array.isArray(p) ? (p[2] ?? 0) : (p.reps ?? 0);

  const currentFam = getFamiliarity(itemKey);

  // 1. 已標 🟢 但表現轉差 (EF <= 220)
  if (currentFam === 1 && ef <= 220) {
    return 'cancel-easy';
  }
  // 2. 已標 🔴 但表現轉好 (連續答對 EF >= 265 或間隔 >= 14 天)
  if (currentFam === -1 && ((ef >= 265 && reps >= 2) || interval >= 14)) {
    return 'cancel-hard';
  }
  // 3. 未標記，但表現優異 (EF >= 280 且連對 >= 2 次，或間隔已排到 30 天後)
  if (currentFam === 0 && ((ef >= 280 && reps >= 2) || interval >= 30)) {
    return 'easy';
  }
  // 4. 未標記，但感到困難 (EF <= 220 且已有作答記錄)
  if (currentFam === 0 && ef <= 220 && reps >= 1) {
    return 'hard';
  }

  return null;
}

// 掛上 window 供全域與跨模組使用
if (typeof window !== 'undefined') {
  window.FAMILIARITY_KEY = FAMILIARITY_KEY;
  window.setFamiliarity = setFamiliarity;
  window.getFamiliarity = getFamiliarity;
  window.getAllFamiliarity = getAllFamiliarity;
  window.getFamiliaritySuggestion = getFamiliaritySuggestion;
  window.FAMILIARITY_MULTIPLIER = FAMILIARITY_MULTIPLIER;
  window.getAdjustedDue = getAdjustedDue;
}
