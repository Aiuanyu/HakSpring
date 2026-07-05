// js/game/game-data.js
// Data fetching and normalization for the SRS game

// 題型代碼（progressKey 尾段）。PoC 只有一種題型「看漢字+拼音→選華語」= 'm'。
// 未來新題型（如聽音檔選詞）用新代碼（'a'、'b'…），各題型各自一筆進度、互不干擾。
// ⚠️ key 格式不可逆：一旦使用者累積進度就不能改，只能新增題型代碼。
const QUESTION_MODE_DEFAULT = 'm';

/**
 * Generates the progress key for a given item
 * @param {string} source - 'cert' or 'gip'
 * @param {string} dataVarName - e.g., '四基', '海中高'
 * @param {string|number} id - "1-1" for cert, or sequence number for GIP
 * @param {string} mode - 題型代碼，預設 'm'（PoC 唯一題型）
 * @returns {string} e.g., "c四基1-1|m"
 */
function generateProgressKey(source, dataVarName, id, mode = QUESTION_MODE_DEFAULT) {
  const s = source === 'gip' ? 'g' : 'c';
  return `${s}${dataVarName}${id}|${mode}`;
}

/**
 * Normalizes item data to a standard format for the game
 */
function normalizeGameData(item, dialect, level, source) {
  // item.dataVarName must be provided by the caller or attached earlier
  const progressKey = generateProgressKey(source, item.dataVarName, item['編號'] || item['序號']);
  
  return {
    ...item, // Preserve original fields for constructWordAudioUrl
    progressKey,
    客家語: item['客家語'],
    標音: item['客語標音_顯示'] || item['標音'],
    華語詞義: item['華語詞義'],
    例句: item['例句'],
    翻譯: item['翻譯'],
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
