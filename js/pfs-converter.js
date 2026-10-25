/**
 * js/pfs-converter.js
 * 客源翠 HagPinPlus（客拼乙式）←→ 臺灣客語白話字（PFS）核心轉換模組
 *
 * 基準：臺灣四縣腔（含南四縣）。
 * 支援純函式即時轉譯、Unicode NFC 合成、音節連接線（Hyphen）處理與大小寫保留。
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./romaine-join.js'), require('./gip-converter.js'));
  } else {
    // 瀏覽器：romaine-join.js、gip-converter.js 可能比這支晚載入，等用著正去拿
    root.pfsConverter = factory(null, null, root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (joinModule, gipModule, root) {
  'use strict';

  /** 撇號規則唯一來源：js/romaine-join.js（摎企盤 engine hpp_boundary 共一套） */
  function getJoin() {
    const join = joinModule || (root && root.romaineJoin);
    if (!join) throw new Error('pfs-converter：需要先載入 js/romaine-join.js');
    return join;
  }

  function getGip() {
    const gip = gipModule || (root && root.gipConverter);
    if (!gip) throw new Error('pfs-converter：需要先載入 js/gip-converter.js');
    return gip;
  }

  /**
   * 聲母長度優先對照表（避免如 n 搶在 ng 前比對）
   */
  const INITIAL_MAPPINGS = [
    ['ng', 'ng'],
    ['chh', 'chh'],
    ['ch', 'ch'],
    ['b', 'p'],
    ['p', 'ph'],
    ['d', 't'],
    ['t', 'th'],
    ['g', 'k'],
    ['k', 'kh'],
    ['z', 'ch'],
    ['c', 'chh'],
    ['j', 'ch'],
    ['q', 'chh'],
    ['x', 's'],
    ['s', 's'],
    ['m', 'm'],
    ['f', 'f'],
    ['v', 'v'],
    ['n', 'n'],
    ['l', 'l'],
    ['h', 'h']
  ];

  /**
   * 判斷是否為客語拼音音節文字（包含拉丁字母及常見結合/變音符號）
   * @param {string} token
   * @returns {boolean}
   */
  function isHakfaSyllable(token) {
    if (!token) return false;
    return /^[a-zA-Z\u00C0-\u024F\u0300-\u036F\u1E00-\u1EFF]+$/.test(token);
  }

  /**
   * 判斷給定腔調字串是否屬於四縣腔（含南四縣、北四縣等）
   * @param {string} dialect
   * @returns {boolean}
   */
  function isSiXianDialect(dialect) {
    if (!dialect) return false;
    const s = String(dialect);
    if (s === 'si' || s === 'na') return true;
    // 資料變數與腔名皆以「四」或「南」起頭（四縣、南四縣、北四縣、四基、教典四、教典南…），
    // 但「四海大平安」這類合稱含有其他腔名用字，絕不可當成四縣
    if (/[海陸埔饒平詔安大]/.test(s)) return false;
    return /^(教典)?(北|南)?(四|南)/.test(s);
  }

  /**
   * 判斷一個「已經轉成 PFS」的四縣音節屬於哪個調類（供變調判斷用）
   * 陰平 ˆ→24、陽平 ̀→11、上聲 ́→31、陽入 ̍→5；無調符者，-p/-t/-k 結尾是陰入 2，其餘是去聲 55
   * @param {string} syllable 單一 PFS 音節
   * @returns {string|null} 調值字串；不是音節（含數字、標點等）則回傳 null
   */
  function classifyPfsTone(syllable) {
    if (!syllable || !isHakfaSyllable(syllable)) return null;
    const nfd = String(syllable).normalize('NFD');
    const mark = nfd.match(/[\u0302\u0300\u0301\u030d]/);
    if (mark) {
      return { '\u0302': '24', '\u0300': '11', '\u0301': '31', '\u030d': '5' }[mark[0]];
    }
    const base = nfd.replace(/[\u0300-\u036f]/g, '');
    return /[ptk]$/i.test(base) ? '2' : '55';
  }

  /**
   * 判斷當前環境是否啟用了四縣 PFS 白話字顯示
   * @param {string} [dialect]
   * @returns {boolean}
   */
  function isPfsDisplayActive(dialect) {
    try {
      if (typeof localStorage !== 'undefined' && localStorage !== null) {
        if (localStorage.getItem('hakfaDisplayScript') !== 'pfs') {
          return false;
        }
      } else {
        return false;
      }
    } catch (e) {
      return false;
    }

    // 若未傳入 dialect，嘗試從全域環境推斷當前主要腔調
    if (!dialect && typeof window !== 'undefined') {
      dialect =
        window.currentActiveMainDialectName ||
        (window.g_currentDialectInfo && window.g_currentDialectInfo.腔名) ||
        '';
    }
    return isSiXianDialect(dialect);
  }

  /**
   * 正規化「顯示模式」偏好值：pfs／gip 保持原樣，其餘（含舊值 hagpin、空值）一律視為 hpp
   * @param {string|null|undefined} value
   * @returns {'hpp'|'pfs'|'gip'}
   */
  function normalizeDisplayScript(value) {
    return value === 'pfs' || value === 'gip' ? value : 'hpp';
  }

  /**
   * 下一個顯示模式（切換鈕點一下之後）：hpp → pfs → gip → hpp 三態循環。
   * 集中在這裡，主表、日日一詞个切換鈕就毋使各自寫判斷。
   * @param {string|null|undefined} current
   * @returns {'hpp'|'pfs'|'gip'}
   */
  function nextDisplayScript(current) {
    const c = normalizeDisplayScript(current);
    return c === 'hpp' ? 'pfs' : c === 'pfs' ? 'gip' : 'hpp';
  }

  /**
   * 實際生效个顯示模式：gip 作用於五腔；pfs 淨作用於四縣（含南四縣），別腔照舊顯示 hpp。
   * @param {string} [dialect]
   * @returns {'hpp'|'pfs'|'gip'}
   */
  function getEffectiveScript(dialect) {
    let stored = 'hpp';
    try {
      if (typeof localStorage !== 'undefined' && localStorage !== null) {
        stored = normalizeDisplayScript(localStorage.getItem('hakfaDisplayScript'));
      }
    } catch (e) {
      stored = 'hpp';
    }
    if (stored === 'gip') return 'gip';
    return isPfsDisplayActive(dialect) ? 'pfs' : 'hpp';
  }

  /**
   * 單一音節 HagPinPlus 轉 PFS
   * @param {string} syllable
   * @returns {string}
   */
  function convertSyllableToPFS(syllable) {
    if (!syllable || !/[a-zA-Z\u00C0-\u024F\u1E00-\u1EFF]/.test(syllable)) {
      return syllable;
    }

    // 若音節已帶有 PFS 專屬字元或調符（如 ṳ/Ṳ、ˆ、̍、Combining Diaeresis Below），直接返回避免重複轉譯
    if (/[ṳṲ\u0302\u030d\u0324]/.test(syllable)) {
      return syllable;
    }

    const isAllUpper = syllable === syllable.toUpperCase() && /[a-zA-Z]/.test(syllable);
    const isTitle = /^[A-Z]/.test(syllable);

    // 1. Unicode NFD 分解以萃取調符
    const nfd = syllable.toLowerCase().normalize('NFD');
    const marks = [];
    let base = '';
    for (let i = 0; i < nfd.length; i++) {
      const char = nfd[i];
      // \u0300-\u036F 為 Combining Diacritical Marks
      if (/[\u0300-\u036f]/.test(char)) {
        marks.push(char);
      } else {
        base += char;
      }
    }

    // 2. 判斷聲調類別（四縣腔調值：1:24, 2:11, 3:31, 5:55，入聲 2:2, 5:5）
    const isRu =
      base.endsWith('b') ||
      base.endsWith('d') ||
      (base.endsWith('g') && !base.endsWith('ng'));

    const hasAcute = marks.includes('\u0301');
    const hasCaron = marks.includes('\u030c');
    const hasGrave = marks.includes('\u0300');

    let pfsTone = '5';
    if (isRu) {
      // 陰入帶 grave (調值 2)；陽入無符 (調值 5)
      pfsTone = hasGrave ? '2' : '5';
    } else {
      if (hasAcute) {
        pfsTone = '1'; // 陰平 24 (ˆ)
      } else if (hasCaron) {
        pfsTone = '2'; // 陽平 11 (̀)
      } else if (hasGrave) {
        pfsTone = '3'; // 上聲 31 (́)
      } else {
        pfsTone = '5'; // 去聲 55 (無符)
      }
    }

    // 3. 聲母轉換
    let pfsInit = '';
    let rhyme = base;
    for (let i = 0; i < INITIAL_MAPPINGS.length; i++) {
      const [k, v] = INITIAL_MAPPINGS[i];
      if (base.startsWith(k)) {
        pfsInit = v;
        rhyme = base.slice(k.length);
        break;
      }
    }

    // 4. 零聲母開頭的 i 轉為 y
    if (!pfsInit) {
      if (rhyme === 'ii' || rhyme.startsWith('ii')) {
        // 空韻 ii
      } else if (
        rhyme === 'i' ||
        rhyme === 'ib' ||
        rhyme === 'id' ||
        rhyme === 'im' ||
        rhyme === 'in'
      ) {
        pfsInit = 'y';
      } else if (rhyme.startsWith('i') && rhyme.length > 1) {
        pfsInit = 'y';
        rhyme = rhyme.slice(1); // ia -> ya, iang -> yang
      }
    }

    // 5. 韻母轉換
    // ii 轉為 ṳ (U+1E73 Latin Small Letter U with Dot Below)
    if (rhyme.includes('ii')) {
      rhyme = rhyme.replace(/ii/g, '\u1E73');
    }

    // ue 轉為 oe（PFS 經典拼寫：guèd -> koet, guen -> koen, kue -> khoe）
    if (rhyme.includes('ue')) {
      rhyme = rhyme.replace(/ue/g, 'oe');
    }

    // ua 轉為 oa（PFS 經典拼寫：guá -> koâ, kuán -> khoán, kuai -> khoai）
    if (rhyme.includes('ua')) {
      rhyme = rhyme.replace(/ua/g, 'oa');
    }

    // 入聲韻尾轉換：-b -> -p, -d -> -t, -g -> -k
    if (rhyme.endsWith('b')) {
      rhyme = rhyme.slice(0, -1) + 'p';
    } else if (rhyme.endsWith('d')) {
      rhyme = rhyme.slice(0, -1) + 't';
    } else if (rhyme.endsWith('g') && !rhyme.endsWith('ng')) {
      rhyme = rhyme.slice(0, -1) + 'k';
    }

    let pfsStem = pfsInit + rhyme;

    // 6. PFS 調符落點配置
    let toneMark = '';
    if (isRu) {
      if (pfsTone === '5') {
        toneMark = '\u030d'; // 陽入直豎符 (U+030D combining vertical line above)
      }
      // 陰入在白話字中無調符
    } else {
      if (pfsTone === '1') {
        toneMark = '\u0302'; // 陰平 circumflex (ˆ)
      } else if (pfsTone === '2') {
        toneMark = '\u0300'; // 陽平 grave (̀)
      } else if (pfsTone === '3') {
        toneMark = '\u0301'; // 上聲 acute (́)
      }
    }

    if (toneMark) {
      const stemLower = pfsStem.toLowerCase();
      let targetIdx = -1;

      // 落點優先順序：a > e, o > iu/ui 之第二母音 > ṳ > u > i > 成音節鼻音 n, m
      if (stemLower.includes('a')) {
        targetIdx = stemLower.indexOf('a');
      } else if (stemLower.includes('e')) {
        targetIdx = stemLower.indexOf('e');
      } else if (stemLower.includes('o')) {
        targetIdx = stemLower.indexOf('o');
      } else if (stemLower.includes('iu')) {
        targetIdx = stemLower.indexOf('iu') + 1; // 落在 u
      } else if (stemLower.includes('ui')) {
        targetIdx = stemLower.indexOf('ui'); // POJ/PFS 傳統落在 u（如：súi）
      } else if (stemLower.includes('\u1e73')) {
        targetIdx = stemLower.indexOf('\u1e73');
      } else if (stemLower.includes('u')) {
        targetIdx = stemLower.indexOf('u');
      } else if (stemLower.includes('i')) {
        targetIdx = stemLower.indexOf('i');
      } else if (stemLower.includes('n')) {
        targetIdx = stemLower.indexOf('n');
      } else if (stemLower.includes('m')) {
        targetIdx = stemLower.indexOf('m');
      }

      if (targetIdx >= 0) {
        pfsStem =
          pfsStem.slice(0, targetIdx + 1) +
          toneMark +
          pfsStem.slice(targetIdx + 1);
      }
    }

    let result = pfsStem.normalize('NFC');

    // 7. 大小寫處理
    if (isAllUpper) {
      result = result.toUpperCase();
    } else if (isTitle) {
      result = result.charAt(0).toUpperCase() + result.slice(1);
    }

    return result;
  }

  /**
   * 整串 HagPinPlus 轉為 PFS（保留標點、註記標籤，詞內預設加上連字號 - ）
   * @param {string} text
   * @param {object} [options]
   * @param {boolean} [options.useHyphen=true] 是否在相鄰音節間以連字號連接
   * @returns {string}
   */
  function toPFS(text, options = {}) {
    if (!text || typeof text !== 'string') return text || '';
    const useHyphen = options.useHyphen !== false;

    // 將字串拆分為：音節、空白、標點、HTML 標籤、註記括號、漢字等
    // 依 HTML 標籤（<.*?>）、標點符號（含斜線 / ／）、空白、漢字區塊進行分割，
    // 確保附帶漢字註記（如「特ià」）或斜線變體（如「só/sǒ」）之音節能被完整分離轉譯
    const tokens = text.split(
      /(<[^>]+>|\s+|[\u3400-\u9fff]+|[【】（）()[\]「」『』，。、；：！？—─~～/／]+|[0-9.]+)/g,
    );

    // 先對所有詞素進行逐一音節轉譯
    const convertedTokens = tokens.map((token) => {
      if (!token) return '';
      if (token.startsWith('<') && token.endsWith('>')) {
        return token;
      }
      if (isHakfaSyllable(token)) {
        return convertSyllableToPFS(token);
      }
      return token;
    });

    if (!useHyphen) {
      return convertedTokens.join('');
    }

    // 處理連字號連接：若空白前後皆為客語拼音音節，將該空白替換為連字號 '-'
    const resultTokens = [];
    for (let i = 0; i < convertedTokens.length; i++) {
      const cur = convertedTokens[i];
      if (/^\s+$/.test(cur) && i > 0 && i + 1 < convertedTokens.length) {
        const prev = convertedTokens[i - 1];
        const next = convertedTokens[i + 1];
        if (isHakfaSyllable(prev) && isHakfaSyllable(next)) {
          resultTokens.push('-');
          continue;
        }
      }
      resultTokens.push(cur);
    }

    return resultTokens.join('');
  }

  /**
   * 聲母長度優先對照表（PFS -> HPP）
   */
  const PFS_TO_HPP_INITIALS = [
    ['chh', 'c'],
    ['ch', 'z'],
    ['ph', 'p'],
    ['th', 't'],
    ['kh', 'k'],
    ['p', 'b'],
    ['t', 'd'],
    ['k', 'g'],
    ['ng', 'ng'],
    ['m', 'm'],
    ['n', 'n'],
    ['l', 'l'],
    ['f', 'f'],
    ['v', 'v'],
    ['s', 's'],
    ['h', 'h']
  ];

  /**
   * 單一音節 臺灣客語白話字（PFS）轉 HagPinPlus（HPP）
   * @param {string} syllable
   * @returns {string}
   */
  function convertSyllableToHPP(syllable) {
    if (!syllable || !/[a-zA-Z\u00C0-\u024F\u1E00-\u1EFF\u0324]/.test(syllable)) {
      return syllable;
    }

    const isAllUpper = syllable === syllable.toUpperCase() && /[a-zA-Z]/.test(syllable);
    const isTitle = /^[A-Z]/.test(syllable);

    // 1. 空韻預處理：將 ṳ (U+1E73), Ṳ (U+1E72) 以及帶下兩點之 ṳ (u + \u0324) 轉為 ii
    let s = syllable.toLowerCase();
    s = s.replace(/[\u1e73\u1e72]|u\u0324/g, 'ii');
    if (s.includes('\u0324')) {
      s = s.replace(/u([^\u0324]*)\u0324/g, 'ii$1');
    }

    // 2. Unicode NFD 分解以萃取 PFS 調符
    const nfd = s.normalize('NFD');
    const marks = [];
    let base = '';
    for (let i = 0; i < nfd.length; i++) {
      const char = nfd[i];
      if (/[\u0300-\u036f]/.test(char)) {
        marks.push(char);
      } else {
        base += char;
      }
    }

    // 3. 判斷聲調 (四縣六調：陰平 24: acute, 陽平 11: caron, 上聲 31: grave, 去聲 55: 無符, 陰入 2: grave, 陽入 5: 無符)
    const isPfsRu = base.endsWith('p') || base.endsWith('t') || (base.endsWith('k') && !base.endsWith('ng'));
    let hppToneMark = '';
    let isRu = false;

    if (isPfsRu) {
      isRu = true;
      if (marks.includes('\u030d') || marks.includes('\u0304')) {
        hppToneMark = ''; // 陽入 5
      } else {
        hppToneMark = '\u0300'; // 陰入 2
      }
    } else {
      if (marks.includes('\u0302')) {
        hppToneMark = '\u0301'; // 陰平 24 (acute ́)
      } else if (marks.includes('\u0300')) {
        hppToneMark = '\u030c'; // 陽平 11 (caron ̌)
      } else if (marks.includes('\u0301')) {
        hppToneMark = '\u0300'; // 上聲 31 (grave ̀)
      } else {
        hppToneMark = ''; // 去聲 55
      }
    }

    // 4. 聲母轉換 (細音 j, q, x 與洪音 z, c, s，零聲母 y-)
    let hppInit = '';
    let rhyme = base;

    if (base.startsWith('y')) {
      const rest = base.slice(1);
      if (rest === 'i' || rest.startsWith('i')) {
        rhyme = rest;
      } else {
        rhyme = 'i' + rest;
      }
    } else {
      const PFS_INITS = [
        ['chh', 'c'],
        ['ch', 'z'],
        ['ph', 'p'],
        ['th', 't'],
        ['kh', 'k'],
        ['p', 'b'],
        ['t', 'd'],
        ['k', 'g'],
        ['ng', 'ng'],
        ['m', 'm'],
        ['n', 'n'],
        ['l', 'l'],
        ['f', 'f'],
        ['v', 'v'],
        ['s', 's'],
        ['h', 'h']
      ];

      let pMatched = '';
      for (let i = 0; i < PFS_INITS.length; i++) {
        const [p] = PFS_INITS[i];
        if (base.startsWith(p)) {
          pMatched = p;
          rhyme = base.slice(p.length);
          break;
        }
      }

      // 細音判定（接齊齒呼 i 開頭，但排除空韻 ii）
      const isXiYin = rhyme.startsWith('i') && !rhyme.startsWith('ii');

      if (pMatched === 'ch') {
        hppInit = isXiYin ? 'j' : 'z';
      } else if (pMatched === 'chh') {
        hppInit = isXiYin ? 'q' : 'c';
      } else if (pMatched === 's') {
        hppInit = isXiYin ? 'x' : 's';
      } else if (pMatched === 'ph') {
        hppInit = 'p';
      } else if (pMatched === 'p') {
        hppInit = 'b';
      } else if (pMatched === 'th') {
        hppInit = 't';
      } else if (pMatched === 't') {
        hppInit = 'd';
      } else if (pMatched === 'kh') {
        hppInit = 'k';
      } else if (pMatched === 'k') {
        hppInit = 'g';
      } else {
        hppInit = pMatched;
      }
    }

    // 5. 韻尾與韻母轉換
    if (isRu) {
      if (rhyme.endsWith('p')) {
        rhyme = rhyme.slice(0, -1) + 'b';
      } else if (rhyme.endsWith('t')) {
        rhyme = rhyme.slice(0, -1) + 'd';
      } else if (rhyme.endsWith('k') && !rhyme.endsWith('ng')) {
        rhyme = rhyme.slice(0, -1) + 'g';
      }
    }

    // oe -> ue
    if (rhyme.includes('oe')) {
      rhyme = rhyme.replace(/oe/g, 'ue');
    }

    // oa -> ua（PFS 經典合口呼轉客拼標準：koa -> gua, khoan -> kuan, khoai -> kuai）
    if (rhyme.includes('oa')) {
      rhyme = rhyme.replace(/oa/g, 'ua');
    }

    let stem = hppInit + rhyme;

    // 6. HPP 調符落點配置 (a > e, o > ui 之 u > iu 之 u > ii 第一粒 i > u > i > n, m)
    if (hppToneMark) {
      const stemLower = stem.toLowerCase();
      let targetIdx = -1;

      if (stemLower.includes('a')) {
        targetIdx = stemLower.indexOf('a');
      } else if (stemLower.includes('e')) {
        targetIdx = stemLower.indexOf('e');
      } else if (stemLower.includes('o')) {
        targetIdx = stemLower.indexOf('o');
      } else if (stemLower.includes('ui')) {
        targetIdx = stemLower.indexOf('ui'); // 標在 u
      } else if (stemLower.includes('iu')) {
        targetIdx = stemLower.indexOf('iu') + 1; // 標在 u
      } else if (stemLower.includes('ii')) {
        targetIdx = stemLower.indexOf('ii'); // 標在第一粒 i
      } else if (stemLower.includes('u')) {
        targetIdx = stemLower.indexOf('u');
      } else if (stemLower.includes('i')) {
        targetIdx = stemLower.indexOf('i');
      } else if (stemLower.includes('n')) {
        targetIdx = stemLower.indexOf('n');
      } else if (stemLower.includes('m')) {
        targetIdx = stemLower.indexOf('m');
      }

      if (targetIdx >= 0) {
        stem =
          stem.slice(0, targetIdx + 1) +
          hppToneMark +
          stem.slice(targetIdx + 1);
      }
    }

    let result = stem.normalize('NFC');

    // 7. 大小寫還原
    if (isAllUpper) {
      result = result.toUpperCase();
    } else if (isTitle) {
      result = result.charAt(0).toUpperCase() + result.slice(1);
    }

    return result;
  }

  /** 兩隻相鄰音節中間愛毋愛撇號：直接用 romaine-join.js 个規則 */
  function needsApostrophe(prev, next) {
    return getJoin().needsApostrophe(prev, next);
  }

  /**
   * 整串文字切成「原樣保留」摎「愛轉換个詞」兩種：
   * HTML 標籤、空白、漢字、全半形標點、數字原樣；其他（白話字詞）交給 convertWord。
   */
  const PFS_TOKEN_SPLIT =
    /(<[^>]+>|\s+|[\u3400-\u9fff]+|[,.;:!?"'()\[\]{}—…【】（）「」『』，。、；：！？~～/／]+|[0-9.]+)/g;
  const PFS_TOKEN_KEEP =
    /^(?:<[^>]+>|\s+|[,.;:!?"'()\[\]{}—…【】（）「」『』，。、；：！？~～/／]+|[0-9.]+)$/;

  function mapPfsWords(text, convertWord) {
    if (!text || typeof text !== 'string') return text || '';
    return text
      .split(PFS_TOKEN_SPLIT)
      .map((token) => (!token || PFS_TOKEN_KEEP.test(token) ? token || '' : convertWord(token)))
      .join('');
  }

  /**
   * 單一白話字詞（包含 hyphen 複合詞）轉 HagPinPlus（HPP）
   * HPP 一律不保留連字號（hyphen），依照 Romaine 連寫加撇號規則緊密結合。
   * @param {string} word
   * @returns {string}
   */
  function convertWordPfsToHpp(word) {
    if (!word) return '';
    const syllables = word.split('-').map((s) => convertSyllableToHPP(s));
    let result = syllables[0] || '';
    for (let i = 1; i < syllables.length; i++) {
      if (needsApostrophe(syllables[i - 1], syllables[i])) result += "'";
      result += syllables[i];
    }
    return result;
  }

  /**
   * 整串 臺灣客語白話字（PFS）轉為 HagPinPlus（HPP）
   * 標點符號（含半形 ASCII 與全形）、HTML 標籤、空格皆完整隔離保留，詞內音節連寫無 hyphen。
   * @param {string} text
   * @returns {string}
   */
  function toHPP(text) {
    return mapPfsWords(text, convertWordPfsToHpp);
  }

  /**
   * 單一白話字詞轉教育部客家語拼音方案（GIP）
   * GIP 一律不保留 hyphen；有調符用調符，沒調符加空格。
   * @param {string} word
   * @param {object} [gipConverterObj] - 省略就用 gip-converter.js
   * @returns {string}
   */
  function convertWordPfsToGip(word, gipConverterObj) {
    if (!word) return '';
    const gip = gipConverterObj || getGip();
    const syllables = word
      .split('-')
      .map((s) => gip.convertSyllableToGIP(convertSyllableToHPP(s)));
    let result = syllables[0] || '';
    for (let i = 1; i < syllables.length; i++) {
      if (!gip.endsWithToneSymbol(syllables[i - 1])) result += ' '; // 沒調符加空格
      result += syllables[i]; // 有調符直接相連
    }
    return result;
  }

  /**
   * 整串 臺灣客語白話字（PFS）直接轉為 GIP
   * @param {string} text
   * @param {object} [gipConverterObj] - 省略就用 gip-converter.js
   * @returns {string}
   */
  function toGIPFromPFS(text, gipConverterObj) {
    return mapPfsWords(text, (word) => convertWordPfsToGip(word, gipConverterObj));
  }

  return {
    convertSyllableToPFS,
    toPFS,
    convertSyllableToHPP,
    convertWordPfsToHpp,
    toHPP,
    convertWordPfsToGip,
    toGIPFromPFS,
    needsApostrophe,
    isSiXianDialect,
    isPfsDisplayActive,
    normalizeDisplayScript,
    nextDisplayScript,
    getEffectiveScript,
    classifyPfsTone
  };
});
