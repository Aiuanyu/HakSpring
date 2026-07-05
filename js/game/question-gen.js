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
 * Helper to sort words by their ID (e.g. "1-2" before "1-10")
 */
function sortWordsById(words) {
  return [...words].sort((a, b) => {
    const aParts = (a['編號'] || a['序號'] || '').toString().split('-');
    const bParts = (b['編號'] || b['序號'] || '').toString().split('-');
    if (aParts.length > 1 && bParts.length > 1) {
      const a0 = parseInt(aParts[0], 10) || 0;
      const b0 = parseInt(bParts[0], 10) || 0;
      if (a0 !== b0) return a0 - b0;
      const a1 = parseInt(aParts[1], 10) || 0;
      const b1 = parseInt(bParts[1], 10) || 0;
      return a1 - b1;
    }
    const aVal = parseInt(aParts[0], 10) || 0;
    const bVal = parseInt(bParts[0], 10) || 0;
    return aVal - bVal;
  });
}

/**
 * Generate a game session (10 questions)
 */
async function generateGameSession(dialect, dataVarName, mode = 'review') {
  const allWords = getWordsForDialectAndLevel(dialect, dataVarName);
  
  if (allWords.length === 0) {
    throw new Error('無法取得詞彙資料，請確定資料庫已載入。');
  }

  // Pre-fetch all progress to avoid awaiting in loop if possible, 
  // but getProgress is async (localStorage is sync, but wrapped in Promise).
  // Actually, we can just await Promise.all
  const wordsWithProgress = await Promise.all(allWords.map(async w => {
    const p = await getProgress(w.progressKey);
    return { word: w, progress: p };
  }));

  let targets = [];
  const MAX_QUESTIONS = Math.min(10, allWords.length);

  if (mode === 'sequential') {
    // 1. Filter unseen words
    const unseen = wordsWithProgress.filter(wp => !wp.progress).map(wp => wp.word);
    
    // 2. Sort by ID
    const sortedUnseen = sortWordsById(unseen);
    
    // 3. Take up to 10
    targets = sortedUnseen.slice(0, MAX_QUESTIONS);
    
    // 4. If less than 10, fill with random unseen (though sequential implies we just take them)
    // If still less than 10, fill with anything just to make it 10
    if (targets.length < MAX_QUESTIONS) {
      const remaining = allWords.filter(w => !targets.includes(w));
      targets = targets.concat(getRandomItems(remaining, MAX_QUESTIONS - targets.length));
    }
  } else {
    // Review Mode
    const todayEpochDay = Math.floor(Date.now() / 86400000);
    
    // 1. Due words (progress exists and due <= today)
    const dueWords = wordsWithProgress.filter(wp => wp.progress && wp.progress.due <= todayEpochDay).map(wp => wp.word);
    
    // 2. Unseen words
    const unseenWords = wordsWithProgress.filter(wp => !wp.progress).map(wp => wp.word);
    
    // 3. Seen but not due words
    const notDueWords = wordsWithProgress.filter(wp => wp.progress && wp.progress.due > todayEpochDay).map(wp => wp.word);

    // Pick due words first
    targets = getRandomItems(dueWords, Math.min(dueWords.length, MAX_QUESTIONS));
    
    // Fill with unseen
    if (targets.length < MAX_QUESTIONS) {
      const needed = MAX_QUESTIONS - targets.length;
      targets = targets.concat(getRandomItems(unseenWords, Math.min(unseenWords.length, needed)));
    }
    
    // Fill with random not due if STILL needed
    if (targets.length < MAX_QUESTIONS) {
      const needed = MAX_QUESTIONS - targets.length;
      targets = targets.concat(getRandomItems(notDueWords, Math.min(notDueWords.length, needed)));
    }
  }

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

    // Check if it's new (seen status) - now purely based on existence of progress
    const progress = await getProgress(target.progressKey);
    const isNew = !progress;

    session.push({
      targetWord: target,
      options: options,
      isNew: isNew
    });
  }

  return session;
}
