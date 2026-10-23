/**
 * js/romaine-join.js
 * Romaine（蘿蔓生菜）結果區个「音節連寫」純邏輯，獨立出來好做單元測試。
 *  - needsApostrophe／applyApostropheRules：HPP 連寫个撇號規則（摎企盤 engine 共一套）
 *  - getJoiningSeparator：兩隻相鄰音節之間愛插甚麼分隔符（連字號／空格／撇號／無）
 *  - isFirstCharUpper：音節首字係毋係大寫（U 鈕摎切換顯示模式共用，避免兩處判斷方式無共樣）
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./gip-converter.js'));
  } else {
    // 瀏覽器：gip-converter.js 在 index.html 先載入，等用著正去拿
    root.romaineJoin = factory(null, root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (gipModule, root) {
  'use strict';

  function getGip() {
    return gipModule || (root && root.gipConverter) || null;
  }

  /** 音節首字係毋係大寫（無字母、空字串算毋係） */
  function isFirstCharUpper(text) {
    return !!text && text.charAt(0) !== text.charAt(0).toLowerCase();
  }

    // 兩隻音節中間个撇號規則（八條），逐隻邊界判斷。
    // 以前用正規表示式全域取代，有兩隻漏隔：成音節 m̌／ň 个調符係結合符號比對毋著，
    // 連續兩隻邊界共用中央字母時後一隻會分吃忒（van sii ǐ i）。
    // 摎客源翠企盤 engine/phonetics/src/hpp.rs hpp_boundary 共一套規則，愛共樣。
    function apostropheBaseLetter(ch) {
      if (!ch) return '';
      const base = ch.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
      return /^[a-z]$/.test(base) ? base : '';
    }

    function needsApostrophe(prev, next) {
      const prevChars = Array.from(prev.normalize('NFD').replace(/\p{M}/gu, ''));
      const nextChars = Array.from(next.normalize('NFD').replace(/\p{M}/gu, ''));
      const p = apostropheBaseLetter(prevChars[prevChars.length - 1]);
      const n0 = apostropheBaseLetter(nextChars[0]);
      const n1 = apostropheBaseLetter(nextChars[1]);
      if (!p || !n0) return false;
      const isVowel = c => 'aeiou'.includes(c);
      if ('bdgmn'.includes(p) && isVowel(n0)) return true;     // 1. 子音韻尾＋母音
      if (p === 'a' && 'iu'.includes(n0)) return true;         // 2. a＋i／u
      if (p === 'e' && n0 === 'u') return true;                // 3. e＋u
      if (p === 'i' && isVowel(n0)) return true;               // 4. i＋母音
      if (p === 'o' && n0 === 'i') return true;                // 5. o＋i
      if (p === 'u' && 'aei'.includes(n0)) return true;        // 6. u＋a／e／i
      if (isVowel(p) && n0 === 'n' && n1 === 'g') return true; // 7. 母音＋ng
      if (p === 'n' && n0 === 'g') return true;                // 8. n＋g
      return false;
    }

    function applyApostropheRules(spaceSeparatedSyllables) {
      if (!spaceSeparatedSyllables) return '';
      const syllables = spaceSeparatedSyllables.split(/\s+/).filter(Boolean);
      let text = syllables[0] || '';
      for (let i = 1; i < syllables.length; i++) {
        if (needsApostrophe(syllables[i - 1], syllables[i])) text += "'";
        text += syllables[i];
      }
      return text;
    }

  /**
   * 兩隻相鄰音節之間愛插个分隔符。
   * @param {string} mode - 連詞模式：'hyphen'｜'space'｜'none'（連寫）
   * @param {boolean} isGip - 目前結果區係毋係用 GIP 顯示
   * @param {string} s1Display - 前一隻音節个畫面文字（GIP 時含調符）
   * @param {string} s1Hpp - 前一隻音節个 HPP 原文
   * @param {string} s2Hpp - 後一隻音節个 HPP 原文
   * @returns {string} 分隔符；毋使分隔就係空字串
   */
  function getJoiningSeparator(mode, isGip, s1Display, s1Hpp, s2Hpp) {
    switch (mode) {
      case 'hyphen':
        return '-';
      case 'space':
        return ' ';
      case 'none': {
        // 撇號係為著 HPP 連寫（音節之間無分隔字元）免得誤判音節界線才加个。
        // GIP 毋使撇號：前一隻音節有調符，調符就係界線，直接連起來；
        // 無調符則一律用空格隔開。
        if (isGip) {
          const gip = getGip();
          return gip && gip.endsWithToneSymbol(s1Display) ? '' : ' ';
        }
        return applyApostropheRules(`${s1Hpp} ${s2Hpp}`).includes("'") ? "'" : '';
      }
      default:
        return '';
    }
  }

  return {
    isFirstCharUpper,
    needsApostrophe,
    applyApostropheRules,
    getJoiningSeparator,
  };
});
