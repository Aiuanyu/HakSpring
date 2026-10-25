/**
 * kipan-converter.js
 * 客源翠企盤（HakSpring-Kipan）輸入法並列格式轉換器
 *
 * 將企盤輸出的「字詞 (拼音)」或「拼音 (字詞)」混排文字，
 * 自動分離轉換為整齊的兩行（諸夏字行與羅馬字行）。
 * 頂層行依第一個有效字詞自動判定（漢字在先則諸夏字在頂，羅馬字在先則羅馬字在頂）。
 */

(function (global) {
  'use strict';

  /**
   * 判斷是否包含漢字
   */
  function hasHan(str) {
    return /\p{Script=Han}/u.test(str);
  }

  /**
   * 判斷是否包含拉丁字母/羅馬字
   */
  function hasLatin(str) {
    return /[a-zA-Z\u00C0-\u024F\u1E00-\u1EFF]/u.test(str);
  }

  /**
   * 中文全形標點轉羅馬字半形標點
   * 特別處理：頓號「、」轉「,」，句號「。」轉「.」，各類括號「（）【】」轉「()[]」，刪節號轉「...」等
   */
  function convertPunctToRomance(p) {
    if (!p) return '';
    return p
      .replace(/、/g, ',')
      .replace(/，/g, ',')
      .replace(/。/g, '.')
      .replace(/！/g, '!')
      .replace(/？/g, '?')
      .replace(/；/g, ';')
      .replace(/：/g, ':')
      .replace(/……/g, '...')
      .replace(/…/g, '...')
      .replace(/（/g, '(')
      .replace(/）/g, ')')
      .replace(/[【〔［]/g, '[')
      .replace(/[】〕］]/g, ']')
      .replace(/｛/g, '{')
      .replace(/｝/g, '}')
      .replace(/[「“《]/g, '"')
      .replace(/[」”》]/g, '"')
      .replace(/[『‘〈]/g, "'")
      .replace(/[』’〉]/g, "'")
      .replace(/——/g, '--');
  }

  /**
   * 羅馬字半形標點轉中文全形標點
   * 包含逗號轉「，」、句號轉「。」、問驚號、各類半形括號轉全形括號等雙向轉換
   */
  function convertPunctToHan(p) {
    if (!p) return '';
    return p
      .replace(/\.\.\./g, '……')
      .replace(/--/g, '——')
      .replace(/,/g, '，')
      .replace(/\./g, '。')
      .replace(/!/g, '！')
      .replace(/\?/g, '？')
      .replace(/;/g, '；')
      .replace(/:/g, '：')
      .replace(/\(/g, '（')
      .replace(/\)/g, '）')
      .replace(/\[/g, '［')
      .replace(/\]/g, '］')
      .replace(/\{/g, '｛')
      .replace(/\}/g, '｝');
  }

  const OPEN_PUNCT = new Set(['「', '『', '“', '‘', '《', '〈', '（', '〔', '【', '［', '｛', '(', '[', '{']);
  const CLOSE_PUNCT = new Set(['」', '』', '”', '’', '》', '〉', '）', '〕', '】', '］', '｝', ')', ']', '}']);

  /**
   * 拆分詞與詞之間的字串（between），精細分離出：
   * 1. 前詞結尾標點（prevPunct，如句號、驚嘆號、逗號）
   * 2. 當前詞開頭標點/括號（currOpen，如「、【）
   * 3. 當前詞核心字詞（core，非標點非空白字元）
   * 4. 當前詞結尾標點/括號（currClose，如」、】）
   * 5. 尾隨空白（trailingSpace）
   */
  function splitBetween(between) {
    const punctChars = /[，。、；：？！…—～「」『』“”‘’《》〈〉（）〔〕【】［］｛｝,\.\?!;:"'\(\)\[\]\{\}]/;

    let start = 0;
    while (start < between.length && (punctChars.test(between[start]) || /\s/.test(between[start]))) {
      start++;
    }

    let end = between.length;
    while (end > start && (punctChars.test(between[end - 1]) || /\s/.test(between[end - 1]))) {
      end--;
    }

    const leading = between.slice(0, start);
    const core = between.slice(start, end);
    const trailing = between.slice(end);

    let openIdx = leading.length;
    while (openIdx > 0 && OPEN_PUNCT.has(leading[openIdx - 1])) {
      openIdx--;
    }
    const prevPunct = leading.slice(0, openIdx);
    const currOpen = leading.slice(openIdx);

    let closeIdx = 0;
    while (closeIdx < trailing.length && CLOSE_PUNCT.has(trailing[closeIdx])) {
      closeIdx++;
    }
    const currClose = trailing.slice(0, closeIdx);
    const trailingSpace = trailing.slice(closeIdx);

    return { prevPunct, currOpen, core, currClose, trailingSpace };
  }

  /**
   * 解析單行企盤格式文字
   * @param {string} line - 輸入字串
   * @param {object} options - 轉換選項
   * @param {boolean} [options.autoSpaceRomance=false] - 羅馬字詞間是否自動補空格（預設依照原文縫隙）
   * @param {string} [options.forceOrder='auto'] - 強制排版順序：'auto' | 'han-top' | 'rom-top'
   */
  function parseKipanLine(line, options = {}) {
    const autoSpaceRomance = options.autoSpaceRomance ?? false;

    // 1. 找出所有括號區塊 (支援半形與全形括號)
    const bracketRegex = /[\(（]([^\(\)（）\r\n]+?)[\)）]/g;
    const matches = [];
    let match;
    while ((match = bracketRegex.exec(line)) !== null) {
      matches.push({
        start: match.index,
        end: bracketRegex.lastIndex,
        inside: match[1],
      });
    }

    // 若無括號結構，直接原樣回傳
    if (matches.length === 0) {
      return {
        top: line,
        bottom: line,
        order: 'han-top',
        hanLine: line,
        romLine: line,
        pairs: [],
      };
    }

    // 2. 切分各個 segment
    const tokens = [];
    let lastEnd = 0;

    for (let i = 0; i < matches.length; i++) {
      const m = matches[i];
      const between = line.slice(lastEnd, m.start);
      tokens.push({
        between,
        inside: m.inside,
      });
      lastEnd = m.end;
    }
    const trailing = line.slice(lastEnd);

    // 3. 判斷輸入文字的本體結構：是漢字在括號外、羅馬字在括號內（漢外羅內），還是反之
    let isHanOutside = true;
    for (const tok of tokens) {
      if (hasHan(tok.between)) {
        isHanOutside = true;
        break;
      }
      if (hasLatin(tok.between) && hasHan(tok.inside)) {
        isHanOutside = false;
        break;
      }
    }

    let hanLine = '';
    let romLine = '';
    const pairs = [];

    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      const { prevPunct, currOpen, core, currClose } = splitBetween(tok.between);
      const inside = tok.inside;

      // 處理前詞標點 (prevPunct) 與空格
      if (prevPunct) {
        const p = prevPunct.trim();
        if (p) {
          hanLine += convertPunctToHan(p);
          const romP = convertPunctToRomance(p);
          romLine += romP;
          if (!romLine.endsWith(' ') && /[,.!?;:]/.test(romP)) {
            romLine += ' ';
          }
        } else if (i > 0 && !romLine.endsWith(' ')) {
          romLine += ' ';
        }
      } else if (i > 0 && !romLine.endsWith(' ')) {
        romLine += ' ';
      }

      // 處理本詞開頭標點/括號 (currOpen)
      if (currOpen) {
        hanLine += convertPunctToHan(currOpen);
        romLine += convertPunctToRomance(currOpen);
      }

      let hanWord = '';
      let romWord = '';

      if (isHanOutside) {
        hanWord = core;
        romWord = inside;
      } else {
        hanWord = inside;
        romWord = core;
      }

      hanLine += hanWord;
      romLine += romWord;

      // 處理本詞結尾標點/括號 (currClose)
      if (currClose) {
        hanLine += convertPunctToHan(currClose);
        romLine += convertPunctToRomance(currClose);
      }

      pairs.push({
        han: hanWord,
        rom: romWord,
      });
    }

    // 處理尾隨標點與字串
    if (trailing) {
      const tTrim = trailing.trim();
      if (tTrim) {
        hanLine += convertPunctToHan(tTrim);
        romLine += convertPunctToRomance(tTrim);
      }
    }

    // 判定最終頂層與底層的排版位置
    let finalOrder = options.forceOrder || 'auto';
    if (finalOrder === 'auto') {
      finalOrder = isHanOutside ? 'han-top' : 'rom-top';
    }

    const top = (finalOrder === 'han-top' ? hanLine : romLine).trim();
    const bottom = (finalOrder === 'han-top' ? romLine : hanLine).trim();

    return {
      order: finalOrder,
      hanLine: hanLine.trim(),
      romLine: romLine.trim(),
      top,
      bottom,
      pairs,
    };
  }

  /**
   * 轉換整段企盤文字（支援多行段落）
   * @param {string} text - 輸入完整文字
   * @param {object} options - 轉換選項
   */
  function convertKipanText(text, options = {}) {
    if (!text || typeof text !== 'string') {
      return {
        topText: '',
        bottomText: '',
        combinedText: '',
        topLines: [],
        bottomLines: [],
        pairs: [],
        detectedOrder: 'han-top',
      };
    }

    const lines = text.split(/\r?\n/);
    const topLines = [];
    const bottomLines = [];
    let detectedOrder = 'han-top';
    const allPairs = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) {
        topLines.push('');
        bottomLines.push('');
        continue;
      }

      const res = parseKipanLine(line, options);
      if (i === 0) {
        detectedOrder = res.order;
      }
      topLines.push(res.top);
      bottomLines.push(res.bottom);
      if (res.pairs) {
        allPairs.push(...res.pairs);
      }
    }

    const topText = topLines.join('\n');
    const bottomText = bottomLines.join('\n');
    const combinedText = `${topText}\n\n${bottomText}`;

    return {
      topText,
      bottomText,
      combinedText,
      topLines,
      bottomLines,
      pairs: allPairs,
      detectedOrder,
    };
  }

  // 匯出模組
  const exported = {
    hasHan,
    hasLatin,
    convertPunctToRomance,
    convertPunctToHan,
    parseKipanLine,
    convertKipanText,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  }
  if (typeof window !== 'undefined') {
    global.KipanConverter = exported;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
