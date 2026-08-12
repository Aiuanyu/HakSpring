// js/game/question-gen.js
// Handles question generation, distractor selection, and session setup

// 載入版本 banner：在 Console 看到這行＝新版 JS 有載到（cache 驗證用）
const QUESTION_GEN_VERSION = '4.6.3';
console.info(`[HakSpring Game] question-gen.js v${QUESTION_GEN_VERSION} loaded`);

/**
 * Clean Cloze Word by removing bracketed variants and parenthesized content
 */
function cleanClozeWord(wordStr) {
  if (!wordStr) return '';
  return wordStr
    .replace(/【.*?】/g, '')
    .replace(/（.*?）/g, '')
    .replace(/\(.*?\)/g, '')
    .trim();
}

/**
 * Count Chinese characters (including supplementary plane characters like 𠊎)
 */
function countHanChars(cleanStr) {
  if (!cleanStr) return 0;
  return (cleanStr.match(/\p{Script=Han}/gu) || []).length;
}

/**
 * Calculate the Chinese character count (字數) of a word, excluding bracketed/parenthesized content
 */
function getChineseCharCount(wordStr) {
  return countHanChars(cleanClozeWord(wordStr));
}

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
function generateDistractors(targetWord, allWords, returnField = '華語詞義') {
  // Filter out the target word itself, and words with similar/identical meanings
  const validPool = allWords.filter(w => 
    w.progressKey !== targetWord.progressKey && 
    !isTooSimilar(w.華語詞義, targetWord.華語詞義) &&
    (returnField === '華語詞義' || !isTooSimilar(w[returnField], targetWord[returnField]))
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
  return getRandomItems(candidates, 3).map(w => w[returnField]);
}

/**
 * 計算兩個字串的 Levenshtein Distance (編輯距離)
 */
function levenshteinDistance(a, b) {
  if (!a || !b) return (a || b || '').length;
  const matrix = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
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
/**
 * Generate Pinyin Distractors
 */
function generatePinyinDistractors(targetWord, allWords) {
  const pinyin = targetWord.客語標音_顯示 || targetWord.標音;
  if (!pinyin) return []; // Fallback to empty if no pinyin

  // Split multi-syllable pinyin by space or hyphen, keeping delimiters
  const tokens = pinyin.match(/([a-zA-Z\u00C0-\u017F\u0300-\u036F\d]+|[^a-zA-Z\u00C0-\u017F\u0300-\u036F\d]+)/g) || [pinyin];
  
  let candidates = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    // If it's just punctuation/space, skip
    if (!/^[a-zA-Z\u00C0-\u017F\u0300-\u036F\d]+$/.test(token)) continue;

    // Strip diacritics to parse syllable structure
    const strippedToken = token.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const parsed = parseSyllable(strippedToken);
    
    // Try generating by replacing parts based on CONFUSABLE
    if (parsed.onset && CONFUSABLE[parsed.onset]) {
      for (const alt of CONFUSABLE[parsed.onset]) {
        const altParsed = { ...parsed, onset: alt };
        if (isLegalSyllable(altParsed)) {
          // Replace onset in the original token
          const altToken = alt + token.substring(parsed.onset.length);
          const newTokens = [...tokens];
          newTokens[i] = altToken;
          candidates.push(newTokens.join(''));
        }
      }
    }

    // Try replacing nucleus (only if plain ASCII to avoid losing diacritics)
    if (parsed.nucleus && CONFUSABLE[parsed.nucleus] && token === strippedToken) {
      for (const alt of CONFUSABLE[parsed.nucleus]) {
        const altParsed = { ...parsed, nucleus: alt };
        if (isLegalSyllable(altParsed)) {
          const altToken = parsed.onset + alt + parsed.coda + parsed.tone;
          const newTokens = [...tokens];
          newTokens[i] = altToken;
          candidates.push(newTokens.join(''));
        }
      }
    }

    // Try replacing coda
    if (parsed.coda) {
      const codaKey = parsed.coda + '_coda';
      if (CONFUSABLE[codaKey]) {
        for (const altKey of CONFUSABLE[codaKey]) {
          const altCoda = altKey.replace('_coda', '');
          const altParsed = { ...parsed, coda: altCoda };
          if (isLegalSyllable(altParsed)) {
            // Replace coda in the original token
            const altToken = token.substring(0, token.length - parsed.coda.length - parsed.tone.length) + altCoda + parsed.tone;
            const newTokens = [...tokens];
            newTokens[i] = altToken;
            candidates.push(newTokens.join(''));
          }
        }
      }
    }
  }

  // Clean up and distinct
  candidates = [...new Set(candidates)].filter(c => c !== pinyin);

  // If we don't have enough, pad with pinyin of random real words with same syllable count
  if (candidates.length < 3) {
    const targetSyllables = tokens.filter(t => /^[a-zA-Z\u00C0-\u017F\u0300-\u036F\d]+$/.test(t)).length;
    const paddingPool = allWords.filter(w => {
      const wPinyin = w.客語標音_顯示 || w.標音;
      if (!wPinyin || wPinyin === pinyin) return false;
      const wTokens = wPinyin.match(/([a-zA-Z\u00C0-\u017F\u0300-\u036F\d]+|[^a-zA-Z\u00C0-\u017F\u0300-\u036F\d]+)/g) || [wPinyin];
      const wSyllables = wTokens.filter(t => /^[a-zA-Z\u00C0-\u017F\u0300-\u036F\d]+$/.test(t)).length;
      return wSyllables === targetSyllables;
    });

    // Pick random padding
    const paddings = getRandomItems(paddingPool, 10).map(w => w.客語標音_顯示 || w.標音);
    for (const pad of paddings) {
      if (!candidates.includes(pad)) {
        candidates.push(pad);
        if (candidates.length >= 3) break;
      }
    }
  }

  // Still not enough? pad with random
  if (candidates.length < 3) {
    const paddingPool = allWords.filter(w => {
      const wPinyin = w.客語標音_顯示 || w.標音;
      return wPinyin && wPinyin !== pinyin;
    });
    const paddings = getRandomItems(paddingPool, 10).map(w => w.客語標音_顯示 || w.標音);
    for (const pad of paddings) {
      if (!candidates.includes(pad)) {
        candidates.push(pad);
        if (candidates.length >= 3) break;
      }
    }
  }

  return getRandomItems(candidates, 3);
}

/**
 * Generate a game session (10 questions)
 */
// 依編號（單元-序）數字比較兩個詞，讓 1-2 排在 1-10 前面。
function compareByWordId(a, b) {
  const aParts = (a['編號'] || a['序號'] || '').toString().split('-');
  const bParts = (b['編號'] || b['序號'] || '').toString().split('-');
  const a0 = parseInt(aParts[0], 10) || 0;
  const b0 = parseInt(bParts[0], 10) || 0;
  if (a0 !== b0) return a0 - b0;
  const a1 = parseInt(aParts[1], 10) || 0;
  const b1 = parseInt(bParts[1], 10) || 0;
  return a1 - b1;
}

/**
 * Generate a game session (10 questions)
 *
 * 兩步式出題（B 案）：先選「詞」，再為每個詞「配題型」。
 * 這樣「順序/新舊配比」兩軸只看詞的 |m 進度，不會被題型解鎖狀態污染
 * （舊作法把 word×type 全丟同一組池，導致題型變成新舊狀態的副產品）。
 */
async function generateGameSession(dialect, dataVarName, { orderMode = 'random', mixMode = 'reviewFirst', types = ['m'], reviewOnly = false } = {}) {
  const allWords = getWordsForDialectAndLevel(dialect, dataVarName);

  if (allWords.length === 0) {
    throw new Error(`無法取得詞彙資料（${dataVarName}），請確定資料庫已載入。`);
  }

  const todayEpochDay = Math.floor(Date.now() / 86400000);

  // ── 第一步：只選「詞」──────────────────────────────
  // 每個詞的新舊狀態一律以 |m（錨點題型）的進度為準。
  const wordsWithMAll = await Promise.all(allWords.map(async w => {
    const mProgress = await getProgress(w.progressKey); // w.progressKey 尾碼即 |m
    return { word: w, mProgress };
  }));

  // 錨點規則的必然結果：未學過 |m 的詞「只能出 |m」。
  // 所以若使用者沒勾 |m（例如只勾拼音），那些未解鎖的新詞這一局根本無題可出，
  // 必須先從候選池剔除——否則第一步（尤其 newFirst）會挑一堆新詞，結果被迫全出 |m，
  // 造成「只勾拼音卻一直出詞義」。
  // 【一律保留所有詞，含未見過的新詞】——「認識新詞（|m 初見）」是不可關的地基。
  // 過去為了「不勾 m 就別出 m」而把新詞整批剔除，導致：只勾克漏字/拼音時，
  // 已解鎖的詞就那幾個、永遠出不了新詞 → 同一批詞一直重複（徐煥昇先生回報的極端案例）。
  // 修正：新詞照常進場，配題型時錨點規則自然讓它出 |m 初見（不受勾選影響）；
  // 題型勾選只作用在「已解鎖詞的複習形式」上。
  const wordsWithM = wordsWithMAll;

  if (wordsWithM.length === 0) {
    throw new Error('這個腔級目前沒有可出題的詞彙。');
  }

  // 一局題數：以「可用的詞」為上限。
  const MAX_QUESTIONS = Math.min(10, wordsWithM.length);

  const dueWords = wordsWithM.filter(x => x.mProgress && x.mProgress.due <= todayEpochDay);
  const unseenWords = wordsWithM.filter(x => !x.mProgress);
  const notDueAll = wordsWithM.filter(x => x.mProgress && x.mProgress.due > todayEpochDay);
  
  // 「今天已複習過」的詞（SM-2 反推：最後複習日 = due - interval）排到最後一池，
  // 否則「循序＋無到期詞」時 notDue 湊數池永遠從編號最小取，每一局都從 1-1 重考同一批。
  const reviewedToday = x => (x.mProgress.due - x.mProgress.interval) === todayEpochDay;
  
  // 湊數池過濾：排除 interval > 30 天的長天期熟詞，避免精熟詞被反覆抓來墊底
  const paddingCandidates = notDueAll.filter(x => x.mProgress.interval <= 30);
  const notDueWords = paddingCandidates.filter(x => !reviewedToday(x));
  const reviewedTodayWords = paddingCandidates.filter(reviewedToday);

  // orderMode 決定「每一池怎麼取」：循序=依編號取前面；隨機=亂數取。
  const takeFromPool = (pool, needed, isPadding = false) => {
    if (needed <= 0 || pool.length === 0) return [];
    if (orderMode === 'sequential') {
      if (isPadding) {
        // 湊數池即使在循序模式，也改為優先取「離到期日較近」的詞 (due 由小到大)，
        // 避免永遠抓編號最小的詞 (如 1-1) 造成惡性循環。
        return [...pool].sort((a, b) => a.mProgress.due - b.mProgress.due).slice(0, needed);
      }
      return [...pool].sort((a, b) => compareByWordId(a.word, b.word)).slice(0, needed);
    }
    return getRandomItems(pool, Math.min(pool.length, needed));
  };

  // 有沒有勾「副題型」（m 以外）？有的話，復習優先時要讓「已解鎖詞用副題型再練」贏過「灌新詞」。
  const hasSubType = (types || ['m']).some(t => t !== 'm');

  let picked = [];

  // 【新增】純複習模式：只出到期/逾期詞卡，不摻新詞、不墊未到期熟詞。
  if (reviewOnly) {
    if (dueWords.length === 0) {
      throw new Error('這個腔級目前沒有到期要複習的詞，去學新詞或換一級吧！');
    }
    // 到期債一次最多 15 題，逾期越久排越前（due 由小到大＝欠越久越先還）。
    // 20260722 R：20 太多、一般人吃不消，改 15。
    const REVIEW_CAP = 15;
    const sorted = [...dueWords].sort((a, b) => a.mProgress.due - b.mProgress.due);
    picked = sorted.slice(0, Math.min(REVIEW_CAP, sorted.length));
    // ↓ 跳過原本的 order/池組合與 padding，直接進「第二步：配題型」。
  } else {
    // mixMode 決定「抽取優先序」；今天複習過的一律墊底。
    // reviewFirst + 有勾副題型：到期詞 → 【已解鎖未到期詞（可出副題型鞏固）】→ 新詞 → 今日已複習。
    //   把 notDueWords 排在 unseenWords 前，避免「解鎖詞少、到期詞不夠」時整局被新詞 |m 灌滿、
    //   副題型（拼音/克漏字…）搶不到主格（20260714 回報：復習卻像衝新進度、拼音幾乎不出）。
    // reviewFirst + 只勾 |m：維持舊序（新詞優先於未到期），照常細水推新詞。
    let order;
    if (mixMode === 'reviewFirst') {
      order = hasSubType
        ? [dueWords, notDueWords, unseenWords, reviewedTodayWords]
        : [dueWords, unseenWords, notDueWords, reviewedTodayWords];
    } else {
      order = [unseenWords, dueWords, notDueWords, reviewedTodayWords];
    }

    for (const pool of order) {
      if (picked.length >= MAX_QUESTIONS) break;
      const isPadding = (pool === notDueWords || pool === reviewedTodayWords);
      picked = picked.concat(takeFromPool(pool, MAX_QUESTIONS - picked.length, isPadding));
    }
  }

  // Debug：每局出題的池狀態與選詞結果（含 due 反推的最後複習日），供排查排程問題
  console.info(
    `[HakSpring Game] v${QUESTION_GEN_VERSION} 池狀態｜到期:${dueWords.length} 未見:${unseenWords.length} ` +
    `未到期:${notDueWords.length} 今日已複習:${reviewedTodayWords.length}｜${orderMode}/${mixMode}/[${(types || []).join(',')}]`
  );
  console.info('[HakSpring Game] 選詞:', picked.map(x => {
    const p = x.mProgress;
    return `${x.word.編號}(${p ? `due:${p.due - todayEpochDay > 0 ? '+' : ''}${p.due - todayEpochDay}天` : '新'})`;
  }).join(' '));

  // 最終排序：循序=依編號；隨機=洗牌讓新舊交錯。
  if (orderMode === 'sequential') {
    picked.sort((a, b) => compareByWordId(a.word, b.word));
  } else {
    for (let i = picked.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [picked[i], picked[j]] = [picked[j], picked[i]];
    }
  }

  // ── 第二步：為每個詞「配呈現形式（題型）」──────────────
  // 一詞一卡制：SM-2 排程只有詞卡（|m key）一條，題型是「這次複習用哪種形式提取」。
  // 形式選擇＝「勾選題型中 typeReps 最少者」（同分隨機）——長期自動均衡，不需權重骰子。
  // 錨點規則不變：無詞卡紀錄的新詞，第一次一定出 |m（先認識它）。
  const session = [];
  for (const { word: target, mProgress } of picked) {
    const selected = (types && types.length) ? types : ['m'];
    let chosenType;
    if (!mProgress) {
      chosenType = 'm'; // 新詞：先認識
    } else {
      const eligibleTypes = selected.filter(t => isEligibleForType(target, t));
      chosenType = eligibleTypes.length > 0 ? pickLeastPracticedType(eligibleTypes, mProgress) : 'm';
    }

    let clozeSentence = null;
    let clozeTarget = null;
    if (chosenType === 'c') {
      clozeTarget = cleanClozeWord(target.客家語);
      const sentences = target.例句.split('<br>').map(s => s.trim()).filter(Boolean);
      const validSentences = sentences.filter(s => s.includes(clozeTarget));
      const chosenSent = validSentences[Math.floor(Math.random() * validSentences.length)];
      clozeSentence = chosenSent.replaceAll(clozeTarget, '____');
    }

    session.push({
      targetWord: target,
      options: buildOptionsForType(target, chosenType, allWords),
      isNew: !mProgress,
      type: chosenType,
      clozeSentence,
      clozeTarget
    });
  }

  // ── 加強版種植期：新詞同局連發 ─────────────────────
  // 模擬 Memrise planting：新詞在同一局內出現兩次——前段 |m 認識它，
  // 隔幾題後再用另一種勾選形式（如 |p）馬上提取一次，趁短期記憶還熱強化同一條 trace。
  // 連發題標 isPlanting：答對時不推進 SM-2（只記 typeReps），避免同日雙重加速排程；答錯照樣 again。
  const MAX_PLANTING = 5; // 一局最多加開 5 題，避免全新詞時局長爆到 20
  const PLANTING_GAP = 3; // 與 |m 題至少隔幾題
  const otherTypes = (types || ['m']).filter(t => t !== 'm');
  if (otherTypes.length > 0) {
    let planted = 0;
    for (let i = 0; i < session.length && planted < MAX_PLANTING; i++) {
      const q = session[i];
      if (!q.isNew || q.type !== 'm' || q.isPlanting) continue;
      const eligibleOtherTypes = otherTypes.filter(t => isEligibleForType(q.targetWord, t));
      if (eligibleOtherTypes.length === 0) continue;
      const followType = pickLeastPracticedType(eligibleOtherTypes, null);
      
      let clozeSentence = null;
      let clozeTarget = null;
      if (followType === 'c') {
        clozeTarget = cleanClozeWord(q.targetWord.客家語);
        const sentences = q.targetWord.例句.split('<br>').map(s => s.trim()).filter(Boolean);
        const validSentences = sentences.filter(s => s.includes(clozeTarget));
        const chosenSent = validSentences[Math.floor(Math.random() * validSentences.length)];
        clozeSentence = chosenSent.replaceAll(clozeTarget, '____');
      }

      const followUp = {
        targetWord: q.targetWord,
        options: buildOptionsForType(q.targetWord, followType, allWords),
        isNew: false,
        type: followType,
        isPlanting: true,
        clozeSentence,
        clozeTarget
      };
      session.splice(Math.min(i + 1 + PLANTING_GAP, session.length), 0, followUp);
      planted++;
    }
  }

  return session;
}

/**
 * 檢查該詞是否符合指定題型的出題資格
 */
function isEligibleForType(targetWord, type) {
  if (type === 'c') {
    const cleanWord = cleanClozeWord(targetWord.客家語);
    if (!cleanWord || cleanWord.includes('…')) return false;
    if (!targetWord.例句) return false;
    const sentences = targetWord.例句.split('<br>').map(s => s.trim()).filter(Boolean);
    return sentences.some(s => s.includes(cleanWord));
  }
  if (type === 'l') {
    const tableName = typeof getFullLevelName === 'function' ? getFullLevelName(targetWord.dataVarName) : `cert${targetWord.dataVarName}`;
    const missing = typeof getMissingAudioInfo === 'function' ? getMissingAudioInfo(tableName, targetWord.分類, targetWord.編號) : null;
    if (missing && missing.word === false) return false;
    return true;
  }
  return true; // 其他題型預設符合
}

/**
 * 從候選題型中挑「練最少次」的形式（typeReps 最少者，同分隨機）。
 * wordProgress 為 null（新詞或種植連發）時視所有題型皆 0 次。
 */
function pickLeastPracticedType(candidateTypes, wordProgress) {
  if (candidateTypes.length === 1) return candidateTypes[0];
  const typeReps = (wordProgress && wordProgress.typeReps) || {};
  const typeLastGrade = (wordProgress && wordProgress.typeLastGrade) || {};

  // 舊詞卡尚無 typeReps 時，|m 的歷史 reps 就是它的練習次數（遷移前的保險）
  const repsOf = t => typeReps[t] ?? (t === 'm' && wordProgress ? (wordProgress.reps ?? 0) : 0);
  const minReps = Math.min(...candidateTypes.map(repsOf));
  const leastPracticed = candidateTypes.filter(t => repsOf(t) === minReps);

  if (leastPracticed.length === 1) return leastPracticed[0];

  // 練習次數平手時，比較上次評分 (typeLastGrade)，優先挑表現最差的
  // 分數越小代表表現越差，越需要優先出題。未曾有評分視為 0（等同 again，最需練習）。
  const gradeScore = { 'again': 0, 'hard': 1, 'good': 2, 'easy': 3 };
  const scoreOf = t => {
    const grade = typeLastGrade[t];
    return grade ? gradeScore[grade] : 0;
  };

  const minGradeScore = Math.min(...leastPracticed.map(scoreOf));
  const worstGraded = leastPracticed.filter(t => scoreOf(t) === minGradeScore);

  return worstGraded[Math.floor(Math.random() * worstGraded.length)];
}

/**
 * 依題型組四個選項（含正解），並洗牌。
 */
function buildOptionsForType(target, type, allWords) {
  let options = [];
  if (type === 'm') {
    options = [target.華語詞義, ...generateDistractors(target, allWords)];
  } else if (type === 'p') {
    const targetPinyin = target.客語標音_顯示 || target.標音;
    options = [targetPinyin, ...generatePinyinDistractors(target, allWords)];
  } else if (type === 'd') {
    options = [target.客家語, ...generateDistractors(target, allWords, '客家語')];
  } else if (type === 'c') {
    const cleanTarget = cleanClozeWord(target.客家語);
    const targetLength = getChineseCharCount(target.客家語);
    let validPool = allWords.filter(w => {
      if (w.progressKey === target.progressKey) return false;
      const cleanW = cleanClozeWord(w.客家語);
      if (!cleanW || cleanW === cleanTarget) return false;
      return countHanChars(cleanW) === targetLength;
    });

    // Fallback: If we don't have at least 3 candidate words of the exact same length,
    // relax the length restriction to guarantee we can fill all 3 distractors.
    if (validPool.length < 3) {
      validPool = allWords.filter(w => {
        if (w.progressKey === target.progressKey) return false;
        const cleanW = cleanClozeWord(w.客家語);
        return cleanW && cleanW !== cleanTarget;
      });
    }

    let candidates = validPool.filter(w => target.分類 && w.分類 === target.分類);
    if (candidates.length < 3) {
      candidates = candidates.concat(validPool.filter(w => !candidates.includes(w) && target.詞性1 && w.詞性1 === target.詞性1));
    }
    if (candidates.length < 3) {
      candidates = candidates.concat(validPool.filter(w => !candidates.includes(w)));
    }
    const distractors = [];
    while (distractors.length < 3 && candidates.length > 0) {
      const idx = Math.floor(Math.random() * candidates.length);
      const chosen = candidates.splice(idx, 1)[0];
      const cleanChosen = cleanClozeWord(chosen.客家語);
      if (cleanChosen && !distractors.includes(cleanChosen)) {
        distractors.push(cleanChosen);
      }
    }
    if (distractors.length < 3) {
      console.warn(`[HakSpring Game] Not enough distractors generated for cloze target: "${cleanTarget}". Only got ${distractors.length} distractors.`);
    }
    options = [cleanTarget, ...distractors];
  } else if (type === 'l') {
    // 聽力題：傳回整個 word 物件，且干擾項要是音節相同、拼音最相似的字
    // 20260724 蒂兒：改用「客家語」（漢字）計算音節數，避開拼音欄位中
    // 「又讀」「俗音」「小稱變調讀」等資料陷阱。客語一字一音節。
    const countSyllables = (word) => {
      return getChineseCharCount(word.客家語);
    };
    const targetSyllables = countSyllables(target);
    const targetPinyin = target.客語標音_查詢 || '';
    const cleanTarget = cleanClozeWord(target.客家語);

    const validPool = allWords.filter(w => {
      if (w.progressKey === target.progressKey) return false;
      const cleanW = cleanClozeWord(w.客家語);
      if (cleanW === cleanTarget) return false;
      
      const pW = (w.客語標音_查詢 || '').replace(/[\s-]+/g, '');
      const pTarget = (targetPinyin).replace(/[\s-]+/g, '');
      if (pW === pTarget) return false;
      
      return true;
    });
    // Sort by similarity
    validPool.sort((a, b) => {
      const pA = a.客語標音_查詢 || '';
      const pB = b.客語標音_查詢 || '';
      const sylA = countSyllables(a);
      const sylB = countSyllables(b);
      
      const aSameSyl = sylA === targetSyllables;
      const bSameSyl = sylB === targetSyllables;
      if (aSameSyl && !bSameSyl) return -1;
      if (!aSameSyl && bSameSyl) return 1;
      
      return levenshteinDistance(targetPinyin, pA) - levenshteinDistance(targetPinyin, pB);
    });

    // 取前 7 名隨機抽 3 個
    const topCandidates = validPool.slice(0, 7);
    const distractors = getRandomItems(topCandidates, 3);
    options = [target, ...distractors];
  }
  // Fisher-Yates shuffle
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  return options;
}
