// js/game/srs.js
// Pure function for computing SM-2 spaced repetition progress

// SM-2 間隔上限（天）。穩定期每日維持性複習量 ≈ 精熟詞數 ÷ 此值。
const MAX_INTERVAL_DAYS = 730;

/**
 * Computes the next SM-2 state based on the grade given.
 * 
 * @param {object} prev - Previous state { ef: number, interval: number, reps: number }
 *                        (ef is stored as int * 100, e.g., 2.5 => 250. min 130)
 * @param {string} grade - 'again' | 'hard' | 'good' | 'easy'
 * @param {number} todayEpochDay - The current date in epoch days (Math.floor(Date.now() / 86400000))
 * @returns {object} The new state { ef, interval, reps, due }
 */
function computeSM2(prev, grade, todayEpochDay) {
  // Set defaults for newly seen items
  let ef = prev.ef ?? 250;
  let interval = prev.interval ?? 0;
  let reps = prev.reps ?? 0;
  
  if (grade === 'again') {
    reps = 0;
    interval = 1;
    ef = Math.max(130, ef - 20);
  } else if (grade === 'hard') {
    reps += 1;
    interval = Math.max(1, Math.round(interval * 1.2));
    ef = Math.max(130, ef - 15);
  } else if (grade === 'good') {
    if (reps === 0) {
      interval = 1;
    } else if (reps === 1) {
      interval = 6;
    } else {
      interval = Math.round(interval * (ef / 100));
    }
    reps += 1;
    // ef remains unchanged
  } else if (grade === 'easy') {
    if (reps === 0) {
      interval = 4;
    } else {
      interval = Math.round(interval * (ef / 100) * 1.3);
    }
    reps += 1;
    ef += 15;
  }
  // 加上 Interval 上限，避免指數成長失控。
  // 20260722：認證詞庫龐大，穩定期每日底線 ≈ 精熟詞數 ÷ 上限；365 太密，改 730（兩年）減半每日負擔。
  // 抽成具名常數，日後要再調只動這裡（改完務必 bump data_version 讓瀏覽器吃新碼）。
  interval = Math.min(interval, MAX_INTERVAL_DAYS);
  
  const due = todayEpochDay + interval;
  
  return { ef, interval, reps, due };
}
