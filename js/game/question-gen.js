// js/game/question-gen.js
// Handles question generation, distractor selection, and session setup

/**
 * Selects exactly n random, unique items from an array.
 */
function getRandomItems(arr, n) {
  const result = new Array(n);
  let len = arr.length;
  const taken = new Array(len);
  if (n > len) n = len;
  while (n--) {
    const x = Math.floor(Math.random() * len);
    result[n] = arr[x in taken ? taken[x] : x];
    taken[x] = --len in taken ? taken[len] : len;
  }
  return result;
}

/**
 * Check if two strings are too similar to be used as distractors.
 */
function isTooSimilar(str1, str2) {
  if (!str1 || !str2) return false;
  return str1 === str2 || str1.includes(str2) || str2.includes(str1);
}

/**
 * Generate 3 distractors for a given target word from the pool of all words.
 * Priority: Same 分類 -> Same 詞性1 -> Random.
 */
function generateDistractors(targetWord, allWords) {
  // Filter out the target word itself, and words with similar/identical meanings
  const validPool = allWords.filter(w => 
    w.progressKey !== targetWord.progressKey && 
    !isTooSimilar(w.華語詞義, targetWord.華語詞義)
  );
  
  let candidates = validPool.filter(w => targetWord.分類 && w.分類 === targetWord.分類);
  
  if (candidates.length < 3) {
    // Fallback to same POS
    const posCandidates = validPool.filter(w => !candidates.includes(w) && targetWord.詞性1 && w.詞性1 === targetWord.詞性1);
    candidates = candidates.concat(posCandidates);
  }
  
  if (candidates.length < 3) {
    // Fallback to random
    const randomCandidates = validPool.filter(w => !candidates.includes(w));
    candidates = candidates.concat(randomCandidates);
  }
  
  // Pick exactly 3 unique distractors
  return getRandomItems(candidates, 3).map(w => w.華語詞義);
}

/**
 * Generate a game session (10 questions)
 */
async function generateGameSession(dialect, dataVarName) {
  const allWords = getWordsForDialectAndLevel(dialect, dataVarName);
  
  if (allWords.length === 0) {
    throw new Error('無法取得詞彙資料，請確定資料庫已載入。');
  }

  // Pick 10 random targets for PoC
  const targets = getRandomItems(allWords, Math.min(10, allWords.length));
  
  const session = [];
  for (const target of targets) {
    const distractors = generateDistractors(target, allWords);
    
    // Combine correct answer with distractors and shuffle
    const options = [target.華語詞義, ...distractors];
    // Fisher-Yates shuffle options
    for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [options[i], options[j]] = [options[j], options[i]];
    }

    // Check if it's new (seen status)
    const progress = await getProgress(target.progressKey);
    const isNew = !progress || !progress.seen;

    session.push({
      targetWord: target,
      options: options,
      isNew: isNew
    });
  }

  return session;
}
