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
  if (dataVarName === 'ALL_OVERDUE') {
    const data = JSON.parse(localStorage.getItem('hakkaLearningProgress') || '{}');
    const todayEpochDay = Math.floor(Date.now() / 86400000);
    const varNames = new Set();
    for (const key in data) {
      if (!key.endsWith('|m')) continue;
      const arr = data[key];
      if (!Array.isArray(arr)) continue;
      const due = arr[3];
      const interval = arr[1] || 0;
      // 收集：今日到期/逾期詞，以及未來待復習（interval <= 30 保護熟詞）的詞所屬腔級
      if (due != null && (due <= todayEpochDay || (due > todayEpochDay && interval <= 30))) {
        const match = key.match(/^[cg]([^0-9]+)/);
        if (match) varNames.add(match[1]);
      }
    }
    
    let allWords = [];
    for (const varName of varNames) {
      const dCode = varName.substring(0, 1);
      const dName = (typeof getDialectInfo === 'function' && getDialectInfo(dCode, varName.substring(1))) ? getDialectInfo(dCode, varName.substring(1)).腔名 : '四縣';
      allWords = allWords.concat(getWordsForDialectAndLevel(dName, varName));
    }
    if (allWords.length === 0) {
      throw new Error('目前沒有到期或即將到期要復習的詞，去學新詞或換一級吧！');
    }
    return allWords;
  }

  const fullLevelName = getFullLevelName(dataVarName);

  // Use window[dataVarName] directly to avoid reading from g_currentLevelData,
  // which is shared with the main UI and can be mutated independently, causing
  // a mismatch where question text comes from one level but audio from another.
  const varData = window[dataVarName];
  const levelData = (varData && Array.isArray(varData.content)) ? varData.content : [];

  if (levelData.length === 0) {
    console.warn(`No data found for level: ${dataVarName}`);
    return [];
  }

  return levelData.map(item => {
    const newItem = { ...item, dataVarName: dataVarName };
    return normalizeGameData(newItem, dialect, fullLevelName, 'cert');
  });
}
