// tests/romaine_p0_eval.js
// Romaine P0 測試集驗證摎評分腳本：
//   1. 驗證 tests/romaine_p0.json 格式、tokens 串接後摎 joined_hpp 一致
//   2. 提供 evaluatePredictions(items, predictFn) 計算「音節讀音正確率（主指標）」、「詞級一致率」摎「斷詞邊界 F1」

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const join = require('../js/romaine-join.js');

const P0_PATH = path.join(__dirname, 'romaine_p0.json');

/** 依 romaine-join.js 規則，將 tokens 陣列串接為完整 HPP 字串 */
function joinTokensToHpp(tokens) {
  let out = '';
  let prevWasWord = false;
  for (const tok of tokens) {
    if (tok.punct) {
      out += tok.hpp !== undefined ? tok.hpp : tok.han;
      prevWasWord = false;
      continue;
    }
    if (prevWasWord) {
      out += ' ';
    }
    out += join.applyApostropheRules(tok.hpp);
    prevWasWord = true;
  }
  return out;
}

/** 展開 tokens 為正規化音節陣列（轉小寫、忽略標點） */
function extractSyllables(tokens) {
  const syllables = [];
  for (const tok of tokens) {
    if (tok.punct || !tok.hpp) continue;
    const parts = tok.hpp.trim().split(/[\s'-]+/).filter(Boolean);
    for (const p of parts) {
      syllables.push(p.toLowerCase());
    }
  }
  return syllables;
}

/** 計算兩串序列的 LCS 長度（供音節序列對齊用） */
function lcsLength(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = dp[i - 1][j] >= dp[i][j - 1] ? dp[i - 1][j] : dp[i][j - 1];
      }
    }
  }
  return dp[m][n];
}

/** 萃取非標點詞條的字元區間集合（用於計算斷詞邊界 F1） */
function extractWordSpans(tokens) {
  const spans = new Set();
  let offset = 0;
  for (const tok of tokens) {
    const len = Array.from(tok.han).length;
    if (!tok.punct) {
      spans.add(`${offset}:${offset + len}`);
    }
    offset += len;
  }
  return spans;
}

/**
 * 評分入口
 * @param {Array} items - romaine_p0.json 的 items
 * @param {Function} predictFn - (item) => Array<{han, hpp, punct?}>
 */
function evaluatePredictions(items, predictFn) {
  let totalGoldSyllables = 0;
  let totalCorrectSyllables = 0;
  let totalGoldWords = 0;
  let totalExactWords = 0;
  let segTP = 0;
  let segPred = 0;
  let segGold = 0;

  for (const item of items) {
    const predTokens = predictFn(item);

    // 1. 主指標：音節讀音正確率
    const goldSyl = extractSyllables(item.tokens);
    const predSyl = extractSyllables(predTokens);
    totalGoldSyllables += goldSyl.length;
    totalCorrectSyllables += lcsLength(goldSyl, predSyl);

    // 2. 詞級完全一致（han 摎 hpp 同時對）
    const goldWords = item.tokens.filter((t) => !t.punct);
    const predWords = predTokens.filter((t) => !t.punct);
    totalGoldWords += goldWords.length;
    const predMap = new Map();
    let pOff = 0;
    for (const t of predTokens) {
      const len = Array.from(t.han).length;
      if (!t.punct) predMap.set(`${pOff}:${pOff + len}`, t);
      pOff += len;
    }
    let gOff = 0;
    for (const t of item.tokens) {
      const len = Array.from(t.han).length;
      if (!t.punct) {
        const match = predMap.get(`${gOff}:${gOff + len}`);
        if (match && match.han === t.han && match.hpp === t.hpp) {
          totalExactWords++;
        }
      }
      gOff += len;
    }

    // 3. 斷詞邊界 F1
    const goldSpans = extractWordSpans(item.tokens);
    const predSpans = extractWordSpans(predTokens);
    segGold += goldSpans.size;
    segPred += predSpans.size;
    for (const s of predSpans) {
      if (goldSpans.has(s)) segTP++;
    }
  }

  const syllableAccuracy = totalGoldSyllables ? totalCorrectSyllables / totalGoldSyllables : 0;
  const wordExactMatch = totalGoldWords ? totalExactWords / totalGoldWords : 0;
  const segP = segPred ? segTP / segPred : 0;
  const segR = segGold ? segTP / segGold : 0;
  const segF1 = segP + segR ? (2 * segP * segR) / (segP + segR) : 0;

  return {
    totalGoldSyllables,
    totalCorrectSyllables,
    syllableAccuracy,
    wordExactMatch,
    segPrecision: segP,
    segRecall: segR,
    segF1,
  };
}

if (require.main === module) {
  console.log('🧪 Validating Romaine P0 dataset and evaluator...');
  const data = JSON.parse(fs.readFileSync(P0_PATH, 'utf8'));
  assert.strictEqual(data.schema_version, 1);
  assert.ok(Array.isArray(data.items) && data.items.length >= 2);

  for (const item of data.items) {
    assert.ok(item.id && item.dialect && item.han && Array.isArray(item.tokens));
    assert.strictEqual(item.status, 'verified');
    const reconstructedHan = item.tokens.map((t) => t.han).join('');
    assert.strictEqual(reconstructedHan, item.han, `${item.id}: tokens han 不一致`);
    const joined = joinTokensToHpp(item.tokens);
    assert.strictEqual(joined, item.joined_hpp, `${item.id}: joined_hpp 不一致`);
  }

  // Self-check with oracle predictor
  const oracleMetrics = evaluatePredictions(data.items, (item) => item.tokens);
  assert.strictEqual(oracleMetrics.syllableAccuracy, 1);
  assert.strictEqual(oracleMetrics.wordExactMatch, 1);
  assert.strictEqual(oracleMetrics.segF1, 1);

  console.log(
    `  ✅ P0 dataset valid (${data.items.length} items, ${oracleMetrics.totalGoldSyllables} syllables).`
  );
  console.log('  ✅ Evaluator self-check PASS (100% on oracle).');
}

module.exports = { joinTokensToHpp, extractSyllables, evaluatePredictions };
