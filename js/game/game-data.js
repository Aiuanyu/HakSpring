// js/game/game-data.js
// Data fetching and normalization for the SRS game

/**
 * Generates the progress key for a given item
 * @param {string} source - e.g., "cert"
 * @param {string} dialect - e.g., "四縣"
 * @param {string} level - e.g., "基礎級"
 * @param {string|number} id - "1-1" for cert, or sequence number for GIP
 */
function generateProgressKey(source, dialect, level, id) {
  if (source === 'gip') {
    return `${source}|${dialect}|${id}`;
  }
  return `${source}|${dialect}|${level}|${id}`;
}

/**
 * Normalizes item data to a standard format for the game
 */
function normalizeGameData(item, dialect, level, source) {
  const progressKey = generateProgressKey(source, dialect, level, item['編號'] || item['序號']);
  
  return {
    ...item, // Preserve original fields for constructAudioUrlForPopup
    progressKey,
    客家語: item['客家語'],
    標音: item['客語標音_顯示'] || item['標音'],
    華語詞義: item['華語詞義'],
    例句: item['例句'],
    分類: item['分類'] || '',
    詞性1: item['詞性1'] || item['詞性'] || '',
    編號: item['編號'] || item['序號'],
    dataVarName: item.dataVarName // Keep track of original array
  };
}

/**
 * Fetch all words for a given dialect and level from cache
 * @param {string} dialect - e.g., "四縣"
 * @param {string} dataVarName - e.g., "四基"
 */
function getWordsForDialectAndLevel(dialect, dataVarName) {
  const fullLevelName = getFullLevelName(dataVarName);
  
  if (typeof g_currentLevelData === 'undefined' || !g_currentLevelData || g_currentLevelData.length === 0) {
    console.warn(`No current level data found`);
    return [];
  }

  return g_currentLevelData.map(item => {
    // We attach dataVarName in case it's not present natively on the item
    const newItem = { ...item, dataVarName: item.dataVarName || dataVarName };
    return normalizeGameData(newItem, dialect, fullLevelName, 'cert');
  });
}
