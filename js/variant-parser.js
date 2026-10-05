// js/variant-parser.js
/**
 * 變體音解析器 (Variant Parser)
 * 
 * 用於解析客源翠四縣與饒平腔調中含有【】區域標記的詞彙與標音。
 * 支援 6 種模式：
 * 1. 僅標音不同（phoneticOnly 模式，變體不重複漢字）
 * 2. 字與音皆不同（如【卓蘭詞／桃園詞】）
 * 3. 完全替換詞（例如 咳【嗽】/ kèb【cug】）
 * 4. 多重【】塊（四縣限定，如 康健（健康）/ 【kóng kian】【kian kóng】）
 * 5. 美濃音 【（）】（四縣限定）
 * 6. 饒平【／】內含（）同義詞
 */

/**
 * 抽出字串中的【...】區塊，並回傳主文字與所有【】內的內容。
 * @param {string} text 
 * @returns {{ main: string, brackets: string[] }}
 */
function splitBrackets(text) {
  if (!text || typeof text !== 'string') {
    return { main: '', brackets: [] };
  }
  const brackets = [];
  const bracketRegex = /【([^】]*)】/g;
  let match;
  while ((match = bracketRegex.exec(text)) !== null) {
    brackets.push(match[1].trim());
  }
  const main = text.replace(bracketRegex, '').trim();
  return { main, brackets };
}

/**
 * 清除外層括號（全形或半形）
 * @param {string} str 
 * @returns {string}
 */
function stripOuterParens(str) {
  if (!str) return '';
  str = str.trim();
  if ((str.startsWith('（') && str.endsWith('）')) || (str.startsWith('(') && str.endsWith(')'))) {
    return str.slice(1, -1).trim();
  }
  return str;
}

/**
 * 檢查字串是否為括號包圍的標記（美濃特徵）
 * @param {string} str 
 * @returns {boolean}
 */
function isParensWrapped(str) {
  if (!str) return false;
  const s = str.trim();
  return (s.startsWith('（') && s.endsWith('）')) || (s.startsWith('(') && s.endsWith(')'));
}

/**
 * 切分包含全形／或半形/的字串
 * @param {string} text 
 * @returns {string[]}
 */
function splitVariantSlash(text) {
  if (!text) return [];
  return text.split(/[/／]/).map(s => s.trim());
}

/**
 * 建構四縣腔調的變體資料
 * @param {string} wordMain 
 * @param {string[]} wordBrackets 
 * @param {string} phoneticMain 
 * @param {string[]} phoneticBrackets 
 * @returns {ParsedVariants}
 */
function buildSixianVariants(wordMain, wordBrackets, phoneticMain, phoneticBrackets) {
  const main = {
    label: '北',
    title: '北四縣',
    word: wordMain,
    phonetic: phoneticMain,
    phoneticOnly: false
  };

  const variants = [];

  // 1. 識別美濃音 (Meinong)
  // 美濃在四縣有 7 筆，特徵為 word 或 phonetic 的 bracket 由括號包圍，或複合在 bracket 尾端
  let meinongWord = null;
  let meinongPhonetic = null;

  const remWordBrackets = [];
  for (const wb of wordBrackets) {
    if (isParensWrapped(wb)) {
      meinongWord = stripOuterParens(wb);
    } else {
      remWordBrackets.push(wb);
    }
  }

  const remPhoneticBrackets = [];
  for (const pb of phoneticBrackets) {
    if (isParensWrapped(pb)) {
      // 四基 8-26 的 (nòn) 係南四縣「卵」音，其他括號為美濃音
      if (pb === '(nòn)' || pb === '（nòn）') {
        remPhoneticBrackets.push(stripOuterParens(pb));
      } else {
        meinongPhonetic = stripOuterParens(pb);
      }
    } else if (pb.includes('(') || pb.includes('（')) {
      // 複合標音，例如 gàb è (gua gàb è) 或 liǔng giàn fúng (jiu bó lǒ fúng)
      const m = pb.match(/^(.*?)\s*[（\(](.*?)[）\)]\s*$/);
      if (m && meinongWord) {
        remPhoneticBrackets.push(m[1].trim());
        meinongPhonetic = m[2].trim();
      } else {
        remPhoneticBrackets.push(pb);
      }
    } else {
      remPhoneticBrackets.push(pb);
    }
  }

  // 2. 南四縣 (South Sixian)
  if (remWordBrackets.length === 0) {
    // 模式 1 或模式 4：純標音變體 (phoneticOnly)
    if (remPhoneticBrackets.length === 1) {
      variants.push({
        label: '南',
        title: '南四縣',
        word: '',
        phonetic: remPhoneticBrackets[0],
        phoneticOnly: true
      });
    } else if (remPhoneticBrackets.length === 2 && (wordMain.includes('（') || wordMain.includes('('))) {
      // 多重塊配對主詞同義詞，例如 康健（健康）-> kóng kian (kian kóng)
      variants.push({
        label: '南',
        title: '南四縣',
        word: '',
        phonetic: `${remPhoneticBrackets[0]} (${remPhoneticBrackets[1]})`,
        phoneticOnly: true
      });
    } else if (remPhoneticBrackets.length > 1) {
      variants.push({
        label: '南',
        title: '南四縣',
        word: '',
        phonetic: remPhoneticBrackets.join(' '),
        phoneticOnly: true
      });
    }
  } else {
    // 模式 2、3：有字詞變體
    if (remPhoneticBrackets.length === remWordBrackets.length + 1) {
      // 例如 魚脯仔【細魚乾仔】 || ňg pù ě【ňg pù è】【se ňg gón è】
      // 第一塊為原主詞的南四縣讀音 (phoneticOnly)
      variants.push({
        label: '南',
        title: '南四縣',
        word: '',
        phonetic: remPhoneticBrackets[0],
        phoneticOnly: true
      });
      for (let i = 0; i < remWordBrackets.length; i++) {
        variants.push({
          label: '南',
          title: '南四縣',
          word: remWordBrackets[i],
          phonetic: remPhoneticBrackets[i + 1] || '',
          phoneticOnly: false
        });
      }
    } else if (remPhoneticBrackets.length === remWordBrackets.length) {
      for (let i = 0; i < remWordBrackets.length; i++) {
        variants.push({
          label: '南',
          title: '南四縣',
          word: remWordBrackets[i],
          phonetic: remPhoneticBrackets[i],
          phoneticOnly: false
        });
      }
    } else if (remPhoneticBrackets.length === 0) {
      // 標音無【】，如 肚屎【肚笥】/ dù sìi
      for (let i = 0; i < remWordBrackets.length; i++) {
        variants.push({
          label: '南',
          title: '南四縣',
          word: remWordBrackets[i],
          phonetic: phoneticMain,
          phoneticOnly: false
        });
      }
    } else {
      for (let i = 0; i < remWordBrackets.length; i++) {
        variants.push({
          label: '南',
          title: '南四縣',
          word: remWordBrackets[i],
          phonetic: remPhoneticBrackets[0] || phoneticMain,
          phoneticOnly: false
        });
      }
    }
  }

  // 3. 美濃音變體
  if (meinongWord || meinongPhonetic) {
    variants.push({
      label: '美',
      title: '美濃',
      word: meinongWord || '',
      phonetic: meinongPhonetic || '',
      phoneticOnly: !meinongWord
    });
  }

  return {
    hasVariants: variants.length > 0,
    main,
    variants
  };
}

/**
 * 建構饒平腔調的變體資料
 * @param {string} wordMain 
 * @param {string[]} wordBrackets 
 * @param {string} phoneticMain 
 * @param {string[]} phoneticBrackets 
 * @returns {ParsedVariants}
 */
function buildRaopingVariants(wordMain, wordBrackets, phoneticMain, phoneticBrackets) {
  const main = {
    label: '竹',
    title: '新竹',
    word: wordMain,
    phonetic: phoneticMain,
    phoneticOnly: false
  };

  const variants = [];
  const wb = wordBrackets[0] || null;
  const pb = phoneticBrackets[0] || null;

  if (!wb && pb) {
    // 模式 1：僅標音欄有【】 (phoneticOnly)
    const pParts = splitVariantSlash(pb);
    if (pParts.length === 2) {
      variants.push({
        label: '卓',
        title: '卓蘭',
        word: '',
        phonetic: pParts[0],
        phoneticOnly: true
      });
      variants.push({
        label: '桃',
        title: '桃園',
        word: '',
        phonetic: pParts[1],
        phoneticOnly: true
      });
    } else if (pParts.length === 1) {
      variants.push({
        label: '卓桃',
        title: '卓蘭/桃園',
        word: '',
        phonetic: pParts[0],
        phoneticOnly: true
      });
    }
  } else if (wb) {
    // 模式 2、3：字詞欄有【】
    const wParts = splitVariantSlash(wb);
    const pParts = pb ? splitVariantSlash(pb) : [];

    if (wParts.length === 2) {
      const pZhuo = pParts[0] || phoneticMain;
      const pTao = pParts[1] || pParts[0] || phoneticMain;
      variants.push({
        label: '卓',
        title: '卓蘭',
        word: wParts[0],
        phonetic: pZhuo,
        phoneticOnly: false
      });
      variants.push({
        label: '桃',
        title: '桃園',
        word: wParts[1],
        phonetic: pTao,
        phoneticOnly: false
      });
    } else if (wParts.length === 1) {
      if (pParts.length === 2) {
        // 詞同音異，卓蘭與桃園各一音
        variants.push({
          label: '卓',
          title: '卓蘭',
          word: wParts[0],
          phonetic: pParts[0],
          phoneticOnly: false
        });
        variants.push({
          label: '桃',
          title: '桃園',
          word: wParts[0],
          phonetic: pParts[1],
          phoneticOnly: false
        });
      } else {
        // 卓桃共用詞音
        const pVal = pParts[0] || phoneticMain;
        variants.push({
          label: '卓桃',
          title: '卓蘭/桃園',
          word: wParts[0],
          phonetic: pVal,
          phoneticOnly: false
        });
      }
    }
  }

  return {
    hasVariants: variants.length > 0,
    main,
    variants
  };
}

/**
 * 解析詞條與標音中的區域變體
 * @param {string} word - 客家語欄位
 * @param {string} phonetic - 客語標音_顯示欄位
 * @param {'四縣'|'饒平'|string} dialectType - 腔調類型
 * @returns {ParsedVariants}
 */
function parseVariants(word, phonetic, dialectType) {
  word = word || '';
  phonetic = phonetic || '';

  const hasBracket = word.includes('【') || phonetic.includes('【');
  const isTargetDialect = dialectType === '四縣' || dialectType === '饒平';

  if (!hasBracket || !isTargetDialect) {
    return {
      hasVariants: false,
      main: {
        label: dialectType === '四縣' ? '北' : (dialectType === '饒平' ? '竹' : ''),
        title: dialectType === '四縣' ? '北四縣' : (dialectType === '饒平' ? '新竹' : ''),
        word,
        phonetic,
        phoneticOnly: false
      },
      variants: []
    };
  }

  const { main: wordMain, brackets: wordBrackets } = splitBrackets(word);
  const { main: phoneticMain, brackets: phoneticBrackets } = splitBrackets(phonetic);

  if (dialectType === '四縣') {
    return buildSixianVariants(wordMain, wordBrackets, phoneticMain, phoneticBrackets);
  } else {
    return buildRaopingVariants(wordMain, wordBrackets, phoneticMain, phoneticBrackets);
  }
}

/**
 * 從資料列物件解析變體資訊（P1-0 共用地基）。
 * 腔別優先從資料列自己判斷（不依賴全域變數）：
 * 1. 若為教典資料（sourceType === 'gip'、isGipData、或 dataVarName/sourceName 為教典），一律當無變體（教典南四縣有獨立資料，不含【】）。
 * 2. sourceName 含「四縣」→ '四縣'；含「饒平」→ '饒平'；其餘 → 無變體。
 * 3. Fallback：若無 sourceName，檢查 dataVarName、dialect、accentKey、progressKey 或傳入的 fallbackDialect。
 * 
 * @param {object} line - 詞條資料列
 * @param {string} [fallbackDialect] - 選填腔調備援字串
 * @returns {ParsedVariants & { dialectType: '四縣'|'饒平'|null, cleanWord: string, cleanPhonetic: string }}
 */
function getLineVariants(line, fallbackDialect) {
  if (!line || typeof line !== 'object') {
    return {
      hasVariants: false,
      main: {
        label: '',
        title: '',
        word: '',
        phonetic: '',
        phoneticOnly: false
      },
      variants: [],
      dialectType: null,
      cleanWord: '',
      cleanPhonetic: ''
    };
  }

  // 1. 判斷是否為教典 (gip)
  const isGip = line.sourceType === 'gip' || 
                line.source === 'gip' || 
                line.isGipData === true || 
                (typeof line.dataVarName === 'string' && line.dataVarName.startsWith('教典')) ||
                (typeof line.sourceName === 'string' && line.sourceName.includes('教典')) ||
                (typeof line.progressKey === 'string' && line.progressKey.startsWith('g'));

  let dialectType = null;

  if (!isGip) {
    // 2. 優先由 sourceName 判斷
    const sName = String(line.sourceName || (typeof line.source === 'string' && line.source !== 'cert' ? line.source : '') || '');
    if (sName.includes('四縣')) {
      dialectType = '四縣';
    } else if (sName.includes('饒平')) {
      dialectType = '饒平';
    } else {
      // 3. Fallback: 檢查 dataVarName, dialect, accentKey, progressKey, 或傳入的 fallbackDialect
      const dataVar = String(line.dataVarName || line.tableName || '');
      const dialect = String(line.dialect || line.accentKey || line.dialectName || fallbackDialect || '');
      const progKey = String(line.progressKey || '');
      const combined = `${dataVar} ${dialect} ${progKey}`;
      if (combined.includes('四')) {
        dialectType = '四縣';
      } else if (combined.includes('平') || combined.includes('饒')) {
        dialectType = '饒平';
      }
    }
  }

  const rawWord = line['客家語'] || line.word || '';
  const rawPhonetic = line['客語標音_顯示'] || line.phonetic || line['標音'] || '';

  const parsed = parseVariants(rawWord, rawPhonetic, dialectType);

  return {
    ...parsed,
    dialectType,
    cleanWord: (parsed.main && parsed.main.word !== undefined) ? parsed.main.word : rawWord,
    cleanPhonetic: (parsed.main && parsed.main.phonetic !== undefined) ? parsed.main.phonetic : rawPhonetic
  };
}

/**
 * 處理例句中的區域變體詞彩繪標註
 * 將四縣與饒平認證例句中的（變體詞）加上專屬半透明底色（南四縣橘／卓蘭色／桃園色／卓桃漸層色）
 *
/**
 * 清除例句句首的贅詞與引號（如「例如：」、「例：」、「例句：」、「例「……」」、「如「……」」）
 * 並將詞組並列（例如「A」、「B」。）轉化為分行獨立子句（A。<br>B。）
 * 
 * @param {string} text - 原始例句文字
 * @returns {string} 清洗後的例句文字
 */
function cleanExampleSentence(text) {
  if (!text || typeof text !== 'string') return text || '';

  // 依 <br> 或換行符切分子句
  const lines = text.split(/<br\s*\/?>|\n/i);
  const cleanedLines = [];

  for (let line of lines) {
    let s = line.trim();
    if (!s) {
      cleanedLines.push('');
      continue;
    }

    // 1. 去除句首引導詞（例如、例句、例、如）＋ 冒號/空格
    s = s.replace(/^(?:例如|例句|例|如)[：:\s]+/g, '');
    // 去除開頭無冒號之直述「例如」（後緊接漢字，如「例如觀看出殯...」）
    s = s.replace(/^例如(?=[\u4e00-\u9fa5])/g, '');

    // 2. 檢測是否為 G 類「多組引號並列片語」：如 例如「A」、「B」。 或 如「A」、「B」、「C」
    const allQuotes = [];
    const quoteRegex = /「([^」]+)」/g;
    let m;
    while ((m = quoteRegex.exec(s)) !== null) {
      allQuotes.push(m[1]);
    }

    // 檢驗扣除前綴與所有「...」引號塊之後，是否僅剩分隔標點（頓號、逗號、空格、句尾標點）
    const stripped = s.replace(/^(?:例如|例|如)\s*/, '')
      .replace(/「[^」]+」/g, '')
      .replace(/[、，\s。！？]/g, '');

    if (allQuotes.length >= 2 && stripped === '') {
      // G 類：將各引號片語轉為獨立句子，補齊句號，並以 <br> 連接
      const subSents = allQuotes.map(q => {
        let trimmed = q.trim();
        if (!/[。！？]$/.test(trimmed)) trimmed += '。';
        return trimmed;
      });
      cleanedLines.push(subSents.join('<br>'));
      continue;
    }

    // 3. 去除引導詞後緊接「 的情況（例如「...」 或 例「...」 或 如「...」）
    s = s.replace(/^(?:例如|例|如)\s*「/g, '「');

    // 4. 單一整句被「...」包裹：剝除外層引號
    if (allQuotes.length === 1) {
      const singleMatch = s.match(/^「([^」]+)」([。！？]?)$/);
      if (singleMatch) {
        s = singleMatch[1] + (singleMatch[2] || '。');
      }
    }

    cleanedLines.push(s);
  }

  return cleanedLines.join('<br>');
}

/**
 * 格式化例句中的次方言變體標記，依腔調塗上專屬半透明底色
 * 同時自動清洗句首贅詞（例如：、例：、例「...」等）
 * 
 * @param {string} text - 原始例句文字
 * @param {string} [dialectName] - 腔調名稱或代號（如 '四縣', '饒平', '四中高', '平中高' 等）
 * @returns {string} 處理後的 HTML 字串
 */
function formatSentenceVariants(text, dialectName) {
  if (!text || typeof text !== 'string') return text || '';

  // 先進行全量例句句首贅詞與引號清洗（全腔調與教典通用）
  text = cleanExampleSentence(text);

  let dialectType = null;
  if (typeof getVariantDialectType === 'function') {
    dialectType = getVariantDialectType(dialectName);
  } else if (typeof window !== 'undefined' && typeof window.getVariantDialectType === 'function') {
    dialectType = window.getVariantDialectType(dialectName);
  }

  if (!dialectType && dialectName) {
    const s = String(dialectName);
    if (s.includes('四縣') || s.includes('四') || s.includes('南')) dialectType = '四縣';
    else if (s.includes('饒平') || s.includes('平') || s.includes('饒')) dialectType = '饒平';
  }

  // 非四縣或饒平，直接回傳已清洗文字
  if (dialectType !== '四縣' && dialectType !== '饒平') {
    return text;
  }

  // 避開體裁/非變體標記：如（諺）、（山）、（歇）、（俗）、（童）、（謠）
  const GENRE_REGEX = /^[（\(](?:諺|山|歇|俗|童|謠)[）\)]$/;

  return text.replace(/[（\(]([^）\)]+)[）\)]/g, (match, content) => {
    if (GENRE_REGEX.test(match)) {
      return match;

    }

    if (dialectType === '四縣') {
      return `<span class="sentence-variant sentence-variant-南">（${content}）</span>`;
    } else if (dialectType === '饒平') {
      if (content.includes('／') || /(?<!<)\//.test(content)) {
        const slash = content.includes('／') ? '／' : '/';
        const parts = content.split(/(?:／|(?<!<)\/)/);
        const zhuolan = parts[0] ? parts[0].trim() : '';
        const taoyuan = parts.slice(1).join(slash).trim();
        return `<span class="sentence-variant sentence-variant-卓">（${zhuolan}</span><span class="sentence-variant sentence-variant-卓桃">${slash}</span><span class="sentence-variant sentence-variant-桃">${taoyuan}）</span>`;
      } else {
        return `<span class="sentence-variant sentence-variant-卓桃">（${content}）</span>`;
      }
    }

    return match;
  });
}

// 支援 CommonJS (Node.js 測試) 與瀏覽器全域環境
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    splitBrackets,
    stripOuterParens,
    isParensWrapped,
    splitVariantSlash,
    buildSixianVariants,
    buildRaopingVariants,
    parseVariants,
    getLineVariants,
    cleanExampleSentence,
    formatSentenceVariants
  };
}
if (typeof window !== 'undefined') {
  window.parseVariants = parseVariants;
  window.splitBrackets = splitBrackets;
  window.getLineVariants = getLineVariants;
  window.cleanExampleSentence = cleanExampleSentence;
  window.formatSentenceVariants = formatSentenceVariants;
}
