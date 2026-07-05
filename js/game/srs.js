// js/game/srs.js
// Pure function for computing SM-2 spaced repetition progress

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
  
  const due = todayEpochDay + interval;
  
  return { ef, interval, reps, due };
}
