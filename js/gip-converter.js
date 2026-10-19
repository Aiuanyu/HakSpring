/**
 * js/gip-converter.js
 * 客源翠 HagPinPlus（HPP，附加符號調）→ 教育部臺灣客家語拼音方案（GIP）轉換模組
 *
 * GIP 寫法：拼音字母不變，聲調改成貼在音節字母後面个符號，例如 `bòd` → `bodˋ`、`kǒng` → `kongˇ`。
 * 無調符个調（四縣去聲、陽入等）官方也無符號，原樣保留。
 *
 * 對應表（實證自教育部原始認證檔 data/cert_113，五腔通用、純度 100%）：
 *   銳音   ́ → ˊ  U+02CA
 *   重音   ̀ → ˋ  U+02CB
 *   抑揚   ̌ → ˇ  U+02C7
 *   折音   ̂ → ˆ  U+02C6（教育部資料多用 ASCII 的 ^ U+005E，客委會表格用 U+02C6，這裡採 U+02C6）
 *   長音   ̄ → ˖  U+02D6（教育部資料多用 ASCII 的 + U+002B，客委會表格用 U+02D6，這裡採 U+02D6）
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.gipConverter = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /** 組合調符 → 官方調符 */
  const TONE_SYMBOLS = {
    '́': 'ˊ', // ˊ
    '̀': 'ˋ', // ˋ
    '̌': 'ˇ', // ˇ
    '̂': 'ˆ', // ˆ
    '̄': '˖', // ˖
  };

  const TONE_MARK_REGEX = /[́̀̌̂̄]/;
  const TONE_MARK_REGEX_GLOBAL = /[́̀̌̂̄]/g;

  /**
   * 判斷 token 係毋係客語拼音音節（字母加組合符號）
   * @param {string} token
   * @returns {boolean}
   */
  function isHakfaSyllable(token) {
    if (!token) return false;
    return /^[a-zA-ZÀ-ɏ̀-ͯḀ-ỿ]+$/.test(token);
  }

  /**
   * 單一音節 HPP 轉 GIP：拿掉音節上个調符，換成對應个官方符號貼在字尾。
   * 無調符（去聲、陽入等）原樣返回。
   * @param {string} syllable
   * @returns {string}
   */
  function convertSyllableToGIP(syllable) {
    if (!syllable || !isHakfaSyllable(syllable)) return syllable;
    const nfd = String(syllable).normalize('NFD');
    const match = nfd.match(TONE_MARK_REGEX);
    if (!match) return syllable;
    const letters = nfd.replace(TONE_MARK_REGEX_GLOBAL, '').normalize('NFC');
    return letters + TONE_SYMBOLS[match[0]];
  }

  /**
   * 整串 HPP 轉 GIP（保留標點、註記標籤、空白、HTML 標籤）
   * token 切法同 pfs-converter.js 一致，所以漢字註記（如「特ià」）、斜線變體（só/sǒ）都做得正確轉。
   * @param {string} text
   * @returns {string}
   */
  function toGIP(text) {
    if (!text || typeof text !== 'string') return text || '';
    const tokens = text.split(
      /(<[^>]+>|\s+|[㐀-鿿]+|[【】（）()[\]「」『』，。、；：！？—─~～/／]+|[0-9.]+)/g,
    );
    return tokens
      .map((token) => {
        if (!token) return '';
        if (token.startsWith('<') && token.endsWith('>')) return token;
        return isHakfaSyllable(token) ? convertSyllableToGIP(token) : token;
      })
      .join('');
  }

  return {
    TONE_SYMBOLS,
    convertSyllableToGIP,
    toGIP,
  };
});
