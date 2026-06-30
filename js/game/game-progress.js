// js/game/game-progress.js
// Handles reading and writing learning progress (SRS) to localStorage

const PROGRESS_KEY = 'hakkaLearningProgress';

/**
 * Get learning progress for a specific key
 * @param {string} progressKey - e.g., "cert|四縣|基礎級|1-1"
 * @returns {Promise<object|null>} The progress object or null if it doesn't exist
 */
async function getProgress(progressKey) {
  try {
    const dataStr = localStorage.getItem(PROGRESS_KEY);
    if (!dataStr) return null;
    const progressData = JSON.parse(dataStr);
    return progressData[progressKey] || null;
  } catch (error) {
    console.error('Error getting progress from localStorage:', error);
    return null;
  }
}

/**
 * Save learning progress for a specific key
 * @param {string} progressKey - e.g., "cert|四縣|基礎級|1-1"
 * @param {object} progressObj - The progress data to store
 */
async function putProgress(progressKey, progressObj) {
  try {
    const dataStr = localStorage.getItem(PROGRESS_KEY);
    const progressData = dataStr ? JSON.parse(dataStr) : {};
    
    // Default SM-2 placeholder schema if missing
    const existing = progressData[progressKey] || {};
    progressData[progressKey] = {
      seen: progressObj.seen ?? existing.seen ?? true,
      lastResult: progressObj.lastResult ?? existing.lastResult ?? 'again',
      easeFactor: progressObj.easeFactor ?? existing.easeFactor ?? 2.5,
      interval: progressObj.interval ?? existing.interval ?? 0,
      repetitions: progressObj.repetitions ?? existing.repetitions ?? 0,
      nextReviewDate: progressObj.nextReviewDate ?? existing.nextReviewDate ?? null,
      updatedAt: progressObj.updatedAt ?? existing.updatedAt ?? Date.now()
    };
    
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progressData));
  } catch (error) {
    console.error('Error putting progress to localStorage:', error);
  }
}
