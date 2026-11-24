/**
 * js/romaine-auto.js
 * 全自動 Romaine（蘿蔓生菜）PoC 核心引擎（四縣首波）：
 *   - 載入教典 + 認證詞庫 + 補字典（含拆音／沿襲／廣韻擬音信賴度分級）+ stats + prefs
 *   - 支援即時造詞控制符（兩側皆為諸夏字時生效）：
 *       `輕-井-澤`：強制連詞（合併為同一詞）
 *       `美=臺`　：強制以連字號 `-` 相接（不受連詞模式影響）
 *       `恁+早`　：強制斷詞並以空格隔開
 *   - Lattice + Viterbi 斷詞 + 偏好讀音預設 + 標點與句首大寫處理
 *   - 串接 js/romaine-join.js 產出連寫／連字號／空格結果
 */
(function (root) {
  'use strict';

  const CJK_CHAR_RE = /[\u4e00-\u9fff\u3400-\u4dbf\u{20000}-\u{2ebef}]/u;
  const PUNCT_MAP = {
    '，': ', ',
    '。': '. ',
    '！': '! ',
    '？': '? ',
    '；': '; ',
    '：': ': ',
    '、': ', ',
    '「': '"',
    '」': '"',
    '『': "'",
    '』': "'",
    '（': '(',
    '）': ')',
  };

  // 信賴度權重：official(3) > supp-derived(2, 補字典/多音字補音/沿襲) > supp-nisim(1, 廣韻擬音)
  const TRUST_RANK = {
    official: 3,
    'supp-derived': 2,
    'supp-nisim': 1,
  };

  const VERIFIED_STORAGE_KEY = 'romaineAutoVerifiedCorpus';
  const NO_SANDHI_MARKER_KEY = 'romaineNoSandhiMarker';
  const UNVERIFIED_ITALIC_KEY = 'romaineUnverifiedItalic';
  const TRUST_UNDERLINE_KEY = 'romaineTrustUnderline';
  const RAOPING_TRACKS_KEY = 'romaineRaopingTracks';
  const DEFAULT_RAOPING_TRACKS = ['zhuk', 'zhuolan', 'taoyuan'];

  if (typeof root.addEventListener === 'function') {
    if (!root.__romainePrefsStorageBound) {
      root.__romainePrefsStorageBound = true;
      root.addEventListener('storage', (e) => {
        if (!e) return;
        if (
          e.key === NO_SANDHI_MARKER_KEY ||
          e.key === UNVERIFIED_ITALIC_KEY ||
          e.key === TRUST_UNDERLINE_KEY ||
          e.key === RAOPING_TRACKS_KEY
        ) {
          root.dispatchEvent(new CustomEvent('romainePrefsChanged', { detail: { key: e.key } }));
        }
      });
    }
  }

  function getNoSandhiMarker() {
    try {
      const v = typeof localStorage !== 'undefined' ? localStorage.getItem(NO_SANDHI_MARKER_KEY) : null;
      return v === '#' ? '#' : '~';
    } catch {
      return '~';
    }
  }

  function setNoSandhiMarker(val) {
    const m = val === '#' ? '#' : '~';
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(NO_SANDHI_MARKER_KEY, m);
    } catch {}
    if (typeof root.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
      root.dispatchEvent(new CustomEvent('romainePrefsChanged', { detail: { key: NO_SANDHI_MARKER_KEY, value: m } }));
    }
    return m;
  }

  function getUnverifiedItalic() {
    try {
      const v = typeof localStorage !== 'undefined' ? localStorage.getItem(UNVERIFIED_ITALIC_KEY) : null;
      return v === null ? true : v !== 'false';
    } catch {
      return true;
    }
  }

  function setUnverifiedItalic(flag) {
    const b = Boolean(flag);
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(UNVERIFIED_ITALIC_KEY, String(b));
    } catch {}
    if (typeof root.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
      root.dispatchEvent(new CustomEvent('romainePrefsChanged', { detail: { key: UNVERIFIED_ITALIC_KEY, value: b } }));
    }
    return b;
  }

  function getTrustUnderline() {
    try {
      const v = typeof localStorage !== 'undefined' ? localStorage.getItem(TRUST_UNDERLINE_KEY) : null;
      return v === 'true';
    } catch {
      return false;
    }
  }

  function setTrustUnderline(flag) {
    const b = Boolean(flag);
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(TRUST_UNDERLINE_KEY, String(b));
    } catch {}
    if (typeof root.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
      root.dispatchEvent(new CustomEvent('romainePrefsChanged', { detail: { key: TRUST_UNDERLINE_KEY, value: b } }));
    }
    return b;
  }

  function getRaopingTracks() {
    const order = ['zhuk', 'zhuolan', 'taoyuan'];
    const valid = new Set(order);
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(RAOPING_TRACKS_KEY) : null;
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const filtered = order.filter((k) => valid.has(k) && parsed.includes(k));
          if (filtered.length > 0) return filtered;
        }
      }
    } catch {}
    return DEFAULT_RAOPING_TRACKS.slice();
  }

  function setRaopingTracks(tracks) {
    const order = ['zhuk', 'zhuolan', 'taoyuan'];
    const list = Array.isArray(tracks) ? order.filter((k) => tracks.includes(k)) : [];
    const finalTracks = list.length > 0 ? list : ['zhuk'];
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(RAOPING_TRACKS_KEY, JSON.stringify(finalTracks));
      }
    } catch {}
    if (typeof root.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
      root.dispatchEvent(new CustomEvent('romainePrefsChanged', { detail: { key: RAOPING_TRACKS_KEY, value: finalTracks } }));
    }
    return finalTracks;
  }

  /**
   * 將饒平例句中的「（卓／桃）」或「（卓桃）」括號變體，分別展開成竹、卓、桃三條純淨漢字句。
   * 語體標記如（諺）、（山）等保留不動。
   */
  function expandRaopingSentenceVariants(text) {
    if (!text || (!text.includes('（') && !text.includes('('))) {
      return { hasVariant: false, zhuk: text, zhuolan: text, taoyuan: text };
    }
    const GENRE_RE = /^(?:諺|山|歇|俗|童|謠)$/;
    const PAREN_RE = /[（(]([^（）()]+)[）)]/g;
    let hasVariant = false;
    let zhukOut = '';
    let zhuoOut = '';
    let taoOut = '';
    let lastIdx = 0;

    const findReplaceLen = (prefixStr, zPart, tPart) => {
      const pChars = Array.from(prefixStr);
      // 僅看緊接在括號前的連續諸夏字
      let cjkCount = 0;
      for (let i = pChars.length - 1; i >= 0; i--) {
        if (CJK_CHAR_RE.test(pChars[i])) cjkCount++;
        else break;
      }
      if (cjkCount === 0) return 0;
      const tailChars = pChars.slice(pChars.length - cjkCount);
      const tailStr = tailChars.join('');

      // 1. 優先比對精確後綴（最常見：發子（病子／發子）、刀仔（刀／刀仔）、斷忒（撇／忒））
      const candidates = [tPart, zPart].filter(Boolean).sort((a, b) => Array.from(b).length - Array.from(a).length);
      for (const cand of candidates) {
        if (tailStr.endsWith(cand)) {
          return Array.from(cand).length;
        }
      }

      // 2. 次之比對共用首字（如 好點點（好恬恬）、後枕額（後腦殼／腦後背））
      for (const cand of candidates) {
        const cChars = Array.from(cand);
        const firstCh = cChars[0];
        if (!firstCh) continue;
        // 往回找長度相近位置的共用首字
        const targetPos = cjkCount - cChars.length;
        if (targetPos >= 0 && tailChars[targetPos] === firstCh) {
          return cChars.length;
        }
      }

      // 3. 預設取兩邊最大長度（不超過前面連續漢字數）
      const maxLen = Math.max(Array.from(zPart).length, Array.from(tPart).length);
      return Math.min(cjkCount, maxLen);
    };

    const replaceTail = (buf, len, replacement) => {
      if (len <= 0) return buf + replacement;
      const arr = Array.from(buf);
      return arr.slice(0, arr.length - len).join('') + replacement;
    };

    let m;
    while ((m = PAREN_RE.exec(text)) !== null) {
      const between = text.slice(lastIdx, m.index);
      zhukOut += between;
      zhuoOut += between;
      taoOut += between;

      const inner = m[1].trim();
      if (GENRE_RE.test(inner) || !CJK_CHAR_RE.test(inner)) {
        zhukOut += m[0];
        zhuoOut += m[0];
        taoOut += m[0];
      } else {
        hasVariant = true;
        let zPart = inner;
        let tPart = inner;
        if (inner.includes('／')) {
          const sp = inner.split('／');
          zPart = (sp[0] || '').trim();
          tPart = sp.slice(1).join('／').trim();
        } else if (inner.includes('/')) {
          const sp = inner.split('/');
          zPart = (sp[0] || '').trim();
          tPart = sp.slice(1).join('/').trim();
        }
        const repLen = findReplaceLen(zhukOut, zPart, tPart);
        // 竹軌：直接移除括號，保留原漢字
        zhuoOut = replaceTail(zhuoOut, repLen, zPart);
        taoOut = replaceTail(taoOut, repLen, tPart);
      }
      lastIdx = m.index + m[0].length;
    }

    const rest = text.slice(lastIdx);
    zhukOut += rest;
    zhuoOut += rest;
    taoOut += rest;

    return { hasVariant, zhuk: zhukOut, zhuolan: zhuoOut, taoyuan: taoOut };
  }

  function isNoSandhiChar(ch) {
    return ch === '#' || ch === '~';
  }

  const DIALECT_ALIASES = {
    sixian: 'xiien',
    nansixian: 'namxiian',
    hailu: 'hoiliug',
    dapu: 'taibu',
    raoping: 'ngiaupin',
    zhaoan: 'zhioon',
  };

  function normalizeDialect(d) {
    return DIALECT_ALIASES[d] || d || 'xiien';
  }

  const DIALECT_CONFIG = {
    xiien: {
      label: '四縣',
      kiong: 'si',
      sandhiCode: 'si',
      gip: 'data/gip/20261020-四.json',
      cert: [
        { level: '基礎級', file: 'data/cert/115四基.json' },
        { level: '初級', file: 'data/cert/115四初.json' },
        { level: '中級', file: 'data/cert/115四中.json' },
        { level: '中高級', file: 'data/cert/115四中高.json' },
        { level: '高級', file: 'data/cert/115四高.json' },
      ],
      supp: 'data/supp/補字典-四.json',
      stats: 'data/romaine/xiien_stats.json',
      prefs: 'data/romaine/xiien_prefs.json',
    },
    namxiian: {
      label: '南四縣',
      kiong: 'na',
      sandhiCode: 'si',
      gip: 'data/gip/20261020-南.json',
      cert: [
        { level: '基礎級', file: 'data/cert/115四基.json' },
        { level: '初級', file: 'data/cert/115四初.json' },
        { level: '中級', file: 'data/cert/115四中.json' },
        { level: '中高級', file: 'data/cert/115四中高.json' },
        { level: '高級', file: 'data/cert/115四高.json' },
      ],
      extractNanBracket: true,
      supp: 'data/supp/補字典-南.json',
      stats: 'data/romaine/namxiian_stats.json',
      prefs: 'data/romaine/namxiian_prefs.json',
    },
    hoiliug: {
      label: '海陸',
      kiong: 'ha',
      sandhiCode: 'ha',
      gip: 'data/gip/20261020-海.json',
      cert: [
        { level: '基礎級', file: 'data/cert/115海基.json' },
        { level: '初級', file: 'data/cert/115海初.json' },
        { level: '中級', file: 'data/cert/115海中.json' },
        { level: '中高級', file: 'data/cert/115海中高.json' },
        { level: '高級', file: 'data/cert/115海高.json' },
      ],
      supp: 'data/supp/補字典-海.json',
      stats: 'data/romaine/hoiliug_stats.json',
      prefs: 'data/romaine/hoiliug_prefs.json',
    },
    taibu: {
      label: '大埔',
      kiong: 'da',
      sandhiCode: 'da',
      gip: 'data/gip/20261020-大.json',
      cert: [
        { level: '基礎級', file: 'data/cert/115大基.json' },
        { level: '初級', file: 'data/cert/115大初.json' },
        { level: '中級', file: 'data/cert/115大中.json' },
        { level: '中高級', file: 'data/cert/115大中高.json' },
        { level: '高級', file: 'data/cert/115大高.json' },
      ],
      supp: 'data/supp/補字典-大.json',
      stats: 'data/romaine/taibu_stats.json',
      prefs: 'data/romaine/taibu_prefs.json',
    },
    ngiaupin: {
      label: '饒平',
      kiong: 'rh',
      sandhiCode: 'rh',
      gip: 'data/gip/20261020-平.json',
      cert: [
        { level: '基礎級', file: 'data/cert/115平基.json' },
        { level: '初級', file: 'data/cert/115平初.json' },
        { level: '中級', file: 'data/cert/115平中.json' },
        { level: '中高級', file: 'data/cert/115平中高.json' },
        { level: '高級', file: 'data/cert/115平高.json' },
      ],
      supp: 'data/supp/補字典-平.json',
      stats: 'data/romaine/ngiaupin_stats.json',
      prefs: 'data/romaine/ngiaupin_prefs.json',
    },
    zhioon: {
      label: '詔安',
      kiong: 'zh',
      sandhiCode: 'zh',
      gip: 'data/gip/20261020-安.json',
      cert: [
        { level: '基礎級', file: 'data/cert/115安基.json' },
        { level: '初級', file: 'data/cert/115安初.json' },
        { level: '中級', file: 'data/cert/115安中.json' },
        { level: '中高級', file: 'data/cert/115安中高.json' },
        { level: '高級', file: 'data/cert/115安高.json' },
      ],
      supp: 'data/supp/補字典-安.json',
      stats: 'data/romaine/zhioon_stats.json',
      prefs: 'data/romaine/zhioon_prefs.json',
    },
  };

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          field += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(field);
        field = '';
      } else if (ch === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else if (ch !== '\r') {
        field += ch;
      }
    }
    if (field.length > 0 || row.length > 0) {
      row.push(field);
      rows.push(row);
    }
    if (rows.length < 2) return [];
    const header = rows[0];
    const hanIdx = header.indexOf('客家語');
    const hppIdx = header.indexOf('客語標音_顯示');
    const catIdx = header.indexOf('分類');
    const idIdx = header.indexOf('編號');
    const sentIdx = header.indexOf('例句');
    const transIdx = header.indexOf('翻譯');
    const noteIdx = header.indexOf('備註');
    if (hanIdx < 0 || hppIdx < 0) return [];
    const out = [];
    for (let i = 1; i < rows.length; i++) {
      if (rows[i].length > Math.max(hanIdx, hppIdx)) {
        out.push({
          han: rows[i][hanIdx],
          hpp: rows[i][hppIdx],
          category: catIdx >= 0 ? rows[i][catIdx] : '',
          id: idIdx >= 0 ? rows[i][idIdx] : '',
          sentence: sentIdx >= 0 ? rows[i][sentIdx] : '',
          translation: transIdx >= 0 ? rows[i][transIdx] : '',
          note: noteIdx >= 0 ? rows[i][noteIdx] : '',
        });
      }
    }
    return out;
  }

  function cleanHanVariants(raw) {
    if (!raw) return [];
    const s = raw.replace(/【.*?】/g, '').replace(/（.*?）|\(.*?\)/g, '');
    return s
      .split(/[、／/]/)
      .map((p) => p.trim())
      .filter((p) => p && CJK_CHAR_RE.test(p));
  }

  function cleanHppVariants(raw) {
    if (!raw) return [];
    // 先移除【】變體、括號、序號前綴（如 2.）與教典變調說明文字
    const DROP_NOTES_RE = /(?:小稱變調讀本調為|小稱變調讀|後字變調又讀|後字變調讀|為後字變調|後字變調為|後字變調|為新調值|之合音|合音讀|合音|本調為|詞目刪除|七層|分佢|為)/g;
    const s = raw
      .replace(/【.*?】/g, '')
      .replace(DROP_NOTES_RE, ' ')
      .replace(/[（）()]/g, ' ')
      .replace(/(?:^|\s)\d+\.\s*/g, ' ');
    const results = [];

    // 展開單音節內斜線（如 "hím/hiún sòng" -> ["hím sòng", "hiún sòng"]）
    const expandPhrase = (phrase, tag) => {
      const words = phrase
        .trim()
        .split(/\s+/)
        .filter((w) => w && !CJK_CHAR_RE.test(w));
      if (!words.length) return;
      let combos = [[]];
      for (const w of words) {
        const alts = w.split('/').filter(Boolean);
        const next = [];
        for (const base of combos) {
          for (const a of alts) {
            next.push([...base, a.normalize('NFC')]);
          }
        }
        combos = next;
        if (combos.length > 16) break;
      }
      for (const c of combos) {
        results.push({ hpp: c.join(' '), note: tag });
      }
    };

    const NOTE_SPLIT_RE = /(又俗音|又讀|又音|俗音|特殊音|特|又|文|白)/g;

    // 先依 " / " 拆開並列片語，再依教典別讀註記（又讀／俗音／文／白／特…）切出各層讀音
    for (const slashChunk of s.split(/\s+\/\s+/)) {
      const pieces = slashChunk.split(NOTE_SPLIT_RE);
      let currentNote = '';
      for (let i = 0; i < pieces.length; i++) {
        const part = pieces[i].replace(/\s+/g, ' ').trim();
        if (!part) continue;
        if (i % 2 === 1) {
          currentNote = part;
        } else {
          expandPhrase(part, currentNote);
          currentNote = '';
        }
      }
    }
    return results;
  }

  function classifySuppTrust(category) {
    if (category === '擬音') return { trust: 'supp-nisim', label: '廣韻擬音' };
    if (category === '沿襲') return { trust: 'supp-derived', label: '補字典·沿襲' };
    return { trust: 'supp-derived', label: '補字典·拆音' };
  }

  class RomaineAutoEngine {
    constructor() {
      // Map<han, Array<{hpp: string, trust: string, label: string}>>
      this.lexicon = new Map();
      this.nanLexicon = new Map();
      this.zhuolanLexicon = new Map();
      this.taoyuanLexicon = new Map();
      this.zhuolanCharMap = new Map();
      this.taoyuanCharMap = new Map();
      this.unigram = Object.create(null);
      this.bigram = Object.create(null);
      this.ctxPrev = Object.create(null);
      this.ctxNext = Object.create(null);
      this.learnedUnigram = Object.create(null);
      this.learnedBigram = Object.create(null);
      this.learnedReadingCounts = new Map();
      this.learnedCtxPrev = new Map();
      this.learnedCtxNext = new Map();
      this.learnedCount = 0;
      this.totalTokens = 0;
      this.prefs = new Map();
      this.certLevels = [];
      this.dialect = 'xiien';
      this.dialectLabel = '四縣';
      this.kiong = 'si';
      this.sandhiCode = 'si';
      this.maxWordLen = 8;
      this.sandhiRules = null;
      this.reverseToneMap = null;
      this.ready = false;
    }

    _addCandidate(han, hpp, trust, label, seen, officialSource, note) {
      const key = `${han}\t${hpp}`;
      const existing = seen.get(key);
      if (existing) {
        if (officialSource && existing.cand.trust === 'official') {
          existing.sources.add(officialSource);
          if (note) existing.notes.add(note);
          const hasGip = existing.sources.has('教典');
          const hasCert = existing.sources.has('認證');
          const srcPart = hasGip && hasCert ? '教典/認證' : hasGip ? '教典' : '認證';
          const notePart = Array.from(existing.notes).join('、');
          existing.cand.label = notePart ? `${srcPart}·${notePart}` : srcPart;
        }
        return;
      }
      const cand = { hpp, trust, label };
      const sources = new Set();
      const notes = new Set();
      if (officialSource) sources.add(officialSource);
      if (note) notes.add(note);
      seen.set(key, { cand, sources, notes });
      if (!this.lexicon.has(han)) this.lexicon.set(han, []);
      this.lexicon.get(han).push(cand);
    }

    async init(basePath = '.', dialect = 'xiien') {
      const normDialect = normalizeDialect(dialect);
      const cfg = DIALECT_CONFIG[normDialect] || DIALECT_CONFIG.xiien;
      const targetDialect = DIALECT_CONFIG[normDialect] ? normDialect : 'xiien';
      if (this.ready && this.dialect === targetDialect) return;

      this.ready = false;
      this.dialect = targetDialect;
      this.dialectLabel = cfg.label;
      this.kiong = cfg.kiong;
      this.sandhiCode = cfg.sandhiCode || cfg.kiong;
      this.lexicon = new Map();
      this.nanLexicon = new Map();
      this.zhuolanLexicon = new Map();
      this.taoyuanLexicon = new Map();
      this.zhuolanCharMap = new Map();
      this.taoyuanCharMap = new Map();
      this.prefs = new Map();
      this.certLevels = [];

      const gipFile = `${basePath}/${cfg.gip}`;
      const certFiles = cfg.cert.map((c) => `${basePath}/${c.file}`);
      const suppFile = `${basePath}/${cfg.supp}`;
      const isSixian = targetDialect === 'xiien';
      const isRaoping = targetDialect === 'ngiaupin';

      const [gipJson, certJsons, suppJson, statsJson, prefsJson, sandhiJson, rtmJson, nanGipJson, nanSuppJson] = await Promise.all([
        fetch(gipFile).then((r) => r.json()),
        Promise.all(certFiles.map((f) => fetch(f).then((r) => r.json()))),
        fetch(suppFile).then((r) => r.json()),
        fetch(`${basePath}/${cfg.stats}`).then((r) => r.json()),
        fetch(`${basePath}/${cfg.prefs}`).then((r) => r.json()),
        this.sandhiRules ? Promise.resolve(this.sandhiRules) : fetch(`${basePath}/sandhi_rules.json`).then((r) => r.json()),
        this.reverseToneMap ? Promise.resolve(this.reverseToneMap) : fetch(`${basePath}/reverse_tone_mapping.json`).then((r) => r.json()),
        isSixian ? fetch(`${basePath}/data/gip/20261020-南.json`).then((r) => (r.ok ? r.json() : null)) : Promise.resolve(null),
        isSixian ? fetch(`${basePath}/data/supp/補字典-南.json`).then((r) => (r.ok ? r.json() : null)) : Promise.resolve(null),
      ]);
      this.sandhiRules = sandhiJson;
      this.reverseToneMap = (rtmJson && rtmJson.dialect_reverse_map) || rtmJson;

      const seen = new Map();
      const zhuolanCharStats = new Map();
      const taoyuanCharStats = new Map();
      const addSubLex = (map, han, hpp, trust, label) => {
        if (!han || !hpp) return;
        if (!map.has(han)) map.set(han, []);
        const list = map.get(han);
        if (!list.some((c) => c.hpp.toLowerCase() === hpp.toLowerCase())) {
          list.push({ hpp, trust, label });
        }
      };
      const recordSubCharStats = (statsMap, mainHan, mainHpp, subHan, subHpp) => {
        if (mainHan !== subHan) return;
        const chars = Array.from(mainHan);
        const mSyls = (mainHpp || '').trim().split(/\s+/).filter(Boolean);
        const sSyls = (subHpp || '').trim().split(/\s+/).filter(Boolean);
        if (chars.length !== mSyls.length || chars.length !== sSyls.length) return;
        for (let k = 0; k < chars.length; k++) {
          const key = `${chars[k]}\t${mSyls[k].toLowerCase()}`;
          if (!statsMap.has(key)) statsMap.set(key, new Map());
          const m = statsMap.get(key);
          const sv = sSyls[k];
          m.set(sv, (m.get(sv) || 0) + 1);
        }
      };

      // 1. 先收官方詞庫（教典、認證分開標記；兩邊皆有才顯示「教典/認證」）
      const addOfficial = (obj, srcName, preferNanBracket = false) => {
        const rows = parseCsv(obj.content || '');
        for (const r of rows) {
          let rawHan = r.han;
          let rawHpp = r.hpp;
          if (preferNanBracket) {
            const hMatch = (r.han || '').match(/【([^】]+)】/);
            const pMatch = (r.hpp || '').match(/【([^】]+)】/);
            if (hMatch) rawHan = hMatch[1];
            if (pMatch) rawHpp = pMatch[1];
          }
          const hans = cleanHanVariants(rawHan);
          const hpps = cleanHppVariants(rawHpp);
          for (const h of hans) {
            const hLen = Array.from(h).length;
            for (const item of hpps) {
              if (item.hpp.split(' ').length === hLen) {
                const lbl = item.note ? `${srcName}·${item.note}` : srcName;
                this._addCandidate(h, item.hpp, 'official', lbl, seen, srcName, item.note);
              }
            }
          }
        }
        return rows;
      };
      addOfficial(gipJson, '教典');
      certJsons.forEach((obj, i) => {
        const rows = addOfficial(obj, '認證', Boolean(cfg.extractNanBracket));
        if (isSixian) {
          for (const r of rows) {
            const hMatch = (r.han || '').match(/【([^】]+)】/);
            const pMatch = (r.hpp || '').match(/【([^】]+)】/);
            const nanHans = hMatch ? cleanHanVariants(hMatch[1]) : cleanHanVariants(r.han);
            const nanHpps = pMatch ? cleanHppVariants(pMatch[1]) : [];
            for (const nh of nanHans) {
              const nLen = Array.from(nh).length;
              for (const item of nanHpps) {
                if (item.hpp.split(' ').length === nLen) {
                  if (!this.nanLexicon.has(nh)) this.nanLexicon.set(nh, []);
                  if (!this.nanLexicon.get(nh).some((c) => c.hpp === item.hpp)) {
                    this.nanLexicon.get(nh).push({ hpp: item.hpp, trust: 'official', label: '認證·南' });
                  }
                }
              }
            }
          }
        }
        if (isRaoping) {
          for (const r of rows) {
            const pMatch = (r.hpp || '').match(/【([^】]+)】/);
            if (!pMatch) continue;
            const mainHans = cleanHanVariants(r.han);
            const mainHpps = cleanHppVariants(r.hpp);
            const primaryMainHan = mainHans[0] || '';
            const primaryMainHpp = mainHpps[0] ? mainHpps[0].hpp : '';

            const hMatch = (r.han || '').match(/【([^】]+)】/);
            const hInner = hMatch ? hMatch[1].trim() : '';
            const pInner = pMatch[1].trim();

            let zHanRaw = hInner || primaryMainHan;
            let tHanRaw = hInner || primaryMainHan;
            if (hInner.includes('／')) {
              const hp = hInner.split('／');
              zHanRaw = (hp[0] || '').trim();
              tHanRaw = (hp[1] || '').trim();
            }

            let zHppRaw = pInner;
            let tHppRaw = pInner;
            if (pInner.includes('/')) {
              const parts = pInner.split('/').map((s) => s.trim()).filter(Boolean);
              const zHanLen = Array.from((cleanHanVariants(zHanRaw)[0] || primaryMainHan)).length;
              const tHanLen = Array.from((cleanHanVariants(tHanRaw)[0] || primaryMainHan)).length;
              if (
                parts.length === 2 &&
                parts[0].split(/\s+/).length === zHanLen &&
                parts[1].split(/\s+/).length === tHanLen
              ) {
                zHppRaw = parts[0];
                tHppRaw = parts[1];
              }
            }

            const zHans = cleanHanVariants(zHanRaw);
            const tHans = cleanHanVariants(tHanRaw);
            const zHpps = cleanHppVariants(zHppRaw);
            const tHpps = cleanHppVariants(tHppRaw);

            for (const zh of zHans) {
              const zLen = Array.from(zh).length;
              for (const item of zHpps) {
                if (item.hpp.split(' ').length === zLen) {
                  addSubLex(this.zhuolanLexicon, zh, item.hpp, 'official', '認證·卓蘭');
                  recordSubCharStats(zhuolanCharStats, primaryMainHan, primaryMainHpp, zh, item.hpp);
                }
              }
            }
            for (const th of tHans) {
              const tLen = Array.from(th).length;
              for (const item of tHpps) {
                if (item.hpp.split(' ').length === tLen) {
                  addSubLex(this.taoyuanLexicon, th, item.hpp, 'official', '認證·桃園');
                  recordSubCharStats(taoyuanCharStats, primaryMainHan, primaryMainHpp, th, item.hpp);
                }
              }
            }
          }
        }
        this.certLevels.push({
          level: cfg.cert[i].level,
          rows: rows.filter((r) => r.sentence && r.sentence.trim()),
        });
      });

      // 若為四縣，額外建置南四縣詞庫（教典南＋認證【南】＋補字典南）
      if (isSixian && nanGipJson) {
        const nanSeen = new Set();
        const addNanRows = (rawRows, trust, label) => {
          for (const r of rawRows) {
            const hans = cleanHanVariants(r.han);
            const hpps = cleanHppVariants(r.hpp);
            for (const h of hans) {
              const hLen = Array.from(h).length;
              for (const item of hpps) {
                if (item.hpp.split(' ').length === hLen) {
                  const key = `${h}\t${item.hpp}`;
                  if (nanSeen.has(key)) continue;
                  nanSeen.add(key);
                  if (!this.nanLexicon.has(h)) this.nanLexicon.set(h, []);
                  this.nanLexicon.get(h).push({ hpp: item.hpp, trust, label });
                }
              }
            }
          }
        };
        addNanRows(parseCsv(nanGipJson.content || ''), 'official', '教典·南');
        if (nanSuppJson) addNanRows(parseCsv(nanSuppJson.content || ''), 'supp-derived', '補字典·南');
      }

      // 2. 再收補字典（先拆音/沿襲，再廣韻擬音）
      const suppRows = parseCsv(suppJson.content || '');
      const sortedSupp = suppRows.slice().sort((a, b) => {
        const ta = classifySuppTrust(a.category).trust;
        const tb = classifySuppTrust(b.category).trust;
        return TRUST_RANK[tb] - TRUST_RANK[ta];
      });
      for (const r of sortedSupp) {
        const { trust, label } = classifySuppTrust(r.category);
        const hans = cleanHanVariants(r.han);
        const hpps = cleanHppVariants(r.hpp);
        for (const h of hans) {
          const hLen = Array.from(h).length;
          for (const item of hpps) {
            if (item.hpp.split(' ').length === hLen) {
              this._addCandidate(h, item.hpp, trust, label, seen);
              if (isRaoping && r.note) {
                const areaMatch = r.note.match(/腔內：([^；]+)/);
                if (areaMatch) {
                  const areas = areaMatch[1];
                  if (areas.includes('卓蘭')) {
                    addSubLex(this.zhuolanLexicon, h, item.hpp, 'supp-derived', '補字典·卓蘭');
                  }
                  if (areas.includes('桃園')) {
                    addSubLex(this.taoyuanLexicon, h, item.hpp, 'supp-derived', '補字典·桃園');
                  }
                }
              }
            }
          }
        }
      }

      if (isRaoping) {
        const buildBestCharMap = (statsMap, outMap) => {
          for (const [key, counts] of statsMap.entries()) {
            let bestSyl = '';
            let bestCnt = -1;
            for (const [syl, cnt] of counts.entries()) {
              if (cnt > bestCnt) {
                bestCnt = cnt;
                bestSyl = syl;
              }
            }
            if (bestSyl) outMap.set(key, bestSyl);
          }
        };
        buildBestCharMap(zhuolanCharStats, this.zhuolanCharMap);
        buildBestCharMap(taoyuanCharStats, this.taoyuanCharMap);
      }

      this.unigram = statsJson.unigram || Object.create(null);
      this.bigram = statsJson.bigram || Object.create(null);
      this.ctxPrev = statsJson.ctx_prev || Object.create(null);
      this.ctxNext = statsJson.ctx_next || Object.create(null);
      this.totalTokens = (statsJson.meta && statsJson.meta.total_tokens) || 1;
      for (const item of prefsJson.items || []) {
        this.prefs.set(item.han, item.default);
      }
      this.applyVerifiedLearning();
      this.ready = true;
    }

    /** 從 localStorage / repo 黃金語料即時學習斷詞權重、Bigram 與上下文偏好讀音（區分 verified 初校 vs confirmed 專家確認） */
    applyVerifiedLearning(itemsOverride) {
      this.learnedUnigram = Object.create(null);
      this.learnedBigram = Object.create(null);
      this.learnedReadingCounts = new Map();
      this.learnedCtxPrev = new Map();
      this.learnedCtxNext = new Map();
      this.learnedCount = 0;

      let list = itemsOverride;
      if (!list && typeof localStorage !== 'undefined') {
        try {
          list = JSON.parse(localStorage.getItem(VERIFIED_STORAGE_KEY) || '[]');
        } catch {
          list = [];
        }
      }
      if (!Array.isArray(list)) return;

      const addCtxCount = (ctxMap, key, hppLower, w) => {
        if (!ctxMap.has(key)) ctxMap.set(key, new Map());
        const m = ctxMap.get(key);
        m.set(hppLower, (m.get(hppLower) || 0) + w);
      };

      const seenEntryKeys = new Set();
      const learnFromEntry = (entry) => {
        if (!entry || normalizeDialect(entry.dialect || 'xiien') !== this.dialect) return;
        const eKey = entry.cert_ref && entry.cert_ref.id
          ? `cert:${entry.cert_ref.dialect || entry.dialect}:${entry.cert_ref.level || ''}:${entry.cert_ref.id}`
          : `id:${entry.id || entry.han}`;
        if (seenEntryKeys.has(eKey)) return;
        seenEntryKeys.add(eKey);
        this.learnedCount++;

        const tierWeight = entry.status === 'confirmed' ? 5 : 1;
        let prevHan = '';
        let prevHppLower = '';

        for (const tok of entry.tokens || []) {
          if (tok.punct || tok.nonCjk || tok.comment || tok.uncertain) {
            prevHan = '';
            prevHppLower = '';
            continue;
          }
          const han = (tok.han || '').trim();
          const hppLower = (tok.hpp || '').trim().toLowerCase();
          if (!han || !hppLower || !CJK_CHAR_RE.test(han)) {
            prevHan = '';
            prevHppLower = '';
            continue;
          }

          // 提升已校正詞條在 Viterbi 斷詞的權重
          this.learnedUnigram[han] = (this.learnedUnigram[han] || 0) + 50 * tierWeight;

          if (!this.learnedReadingCounts.has(han)) {
            this.learnedReadingCounts.set(han, new Map());
          }
          const rMap = this.learnedReadingCounts.get(han);
          rMap.set(hppLower, (rMap.get(hppLower) || 0) + tierWeight);

          if (prevHan) {
            const biKey = `${prevHan}\t${han}`;
            this.learnedBigram[biKey] = (this.learnedBigram[biKey] || 0) + 20 * tierWeight;
            addCtxCount(this.learnedCtxPrev, biKey, hppLower, tierWeight);
            addCtxCount(this.learnedCtxNext, biKey, prevHppLower, tierWeight);
          }

          // 若原詞庫無此詞或無此讀音（例如自訂讀音／強制詞組），補入詞庫候選
          const existingCands = this.lexicon.get(han) || [];
          if (!existingCands.some((c) => c.hpp.toLowerCase() === hppLower)) {
            if (!this.lexicon.has(han)) this.lexicon.set(han, []);
            this.lexicon.get(han).push({ hpp: hppLower, trust: 'official', label: '黃金語料' });
          }

          prevHan = han;
          prevHppLower = hppLower;
        }
      };

      // 先讀 localStorage（使用者最新修改優先），再讀專案內建 verified_sentences.json
      for (const entry of list) learnFromEntry(entry);
      for (const entry of this.repoVerifiedItems || []) learnFromEntry(entry);
    }

    _pickContextRule(han, prevHan, nextHan, cands) {
      const findCand = (hppTarget) => cands.find((c) => c.hpp.toLowerCase() === hppTarget.toLowerCase());
      if (this.dialect === 'xiien') {
        if (han === '著') {
          if (/^[衫褲鞋帽裙襪被]/.test(nextHan)) {
            const m = findCand('zòg');
            if (m) return m;
          }
          if (/^(毋|無|寫|講|算|聽|猜|估)$/.test(prevHan) || /^(火|獎|驚|傷|緊)$/.test(nextHan)) {
            const m = findCand('cog');
            if (m) return m;
          }
          if (/^(看|睡|想|尋|買|食|行|企|坐|拿|抓|捉|聽|問|講|寫|等|寒|冷|熱|傷|打|撞|碰|跌|落|開|關|點|燒|對|摎)$/.test(prevHan)) {
            const m = findCand('dò');
            if (m) return m;
          }
        }
      }
      return null;
    }

    _pickDefault(han, useNan = false, openBookMap = null, prevHan = '', nextHan = '') {
      if (useNan && openBookMap && openBookMap.has(han)) {
        const obHpp = openBookMap.get(han);
        return {
          hpp: obHpp,
          trust: 'official',
          label: '南四縣(本詞)',
          candidates: [{ hpp: obHpp, trust: 'official', label: '南四縣(本詞)' }],
          oov: false,
        };
      }
      const nanCands = useNan ? (this.nanLexicon.get(han) || []) : [];
      const cands = nanCands.length ? nanCands : (this.lexicon.get(han) || []);
      if (!cands.length) return { hpp: han, trust: 'oov', label: '未收錄', candidates: [], oov: true };

      if (!useNan && cands.length > 1) {
        // 1. 黃金語料／專家上下文選音（Contextual Reading Bigram）
        if (prevHan || nextHan) {
          const ctxScores = new Map();
          if (prevHan) {
            const mPrev = this.learnedCtxPrev.get(`${prevHan}\t${han}`);
            if (mPrev) {
              for (const [hLower, w] of mPrev.entries()) {
                ctxScores.set(hLower, (ctxScores.get(hLower) || 0) + w);
              }
            }
          }
          if (nextHan) {
            const mNext = this.learnedCtxNext.get(`${han}\t${nextHan}`);
            if (mNext) {
              for (const [hLower, w] of mNext.entries()) {
                ctxScores.set(hLower, (ctxScores.get(hLower) || 0) + w);
              }
            }
          }
          let bestCtxHpp = null;
          let bestCtxScore = 0;
          for (const [hLower, w] of ctxScores.entries()) {
            if (w > bestCtxScore) {
              bestCtxScore = w;
              bestCtxHpp = hLower;
            }
          }
          if (bestCtxHpp) {
            const ctxMatch = cands.find((c) => c.hpp.toLowerCase() === bestCtxHpp);
            if (ctxMatch) {
              return { hpp: ctxMatch.hpp, trust: ctxMatch.trust, label: ctxMatch.label, candidates: cands, oov: false };
            }
          }
        }

        // 2. 高頻多音字語境規則
        const ruleMatch = this._pickContextRule(han, prevHan, nextHan, cands);
        if (ruleMatch) {
          return { hpp: ruleMatch.hpp, trust: ruleMatch.trust, label: ruleMatch.label, candidates: cands, oov: false };
        }

        // 3. 詞典合成詞萃取之單字共現上下文
        if (prevHan) {
          const pChars = Array.from(prevHan);
          const pLast = pChars[pChars.length - 1];
          const dictPrevHpp = this.ctxPrev[`${pLast}\t${han}`];
          if (dictPrevHpp) {
            const m = cands.find((c) => c.hpp.toLowerCase() === dictPrevHpp.toLowerCase());
            if (m) return { hpp: m.hpp, trust: m.trust, label: m.label, candidates: cands, oov: false };
          }
        }
        if (nextHan) {
          const nFirst = Array.from(nextHan)[0];
          const dictNextHpp = this.ctxNext[`${han}\t${nFirst}`];
          if (dictNextHpp) {
            const m = cands.find((c) => c.hpp.toLowerCase() === dictNextHpp.toLowerCase());
            if (m) return { hpp: m.hpp, trust: m.trust, label: m.label, candidates: cands, oov: false };
          }
        }

        // 4. 黃金語料單詞最高頻讀音
        const learnedMap = this.learnedReadingCounts.get(han);
        if (learnedMap && learnedMap.size > 0) {
          let bestHpp = null;
          let bestCnt = -1;
          for (const [hLower, cnt] of learnedMap.entries()) {
            if (cnt > bestCnt) {
              bestCnt = cnt;
              bestHpp = hLower;
            }
          }
          if (bestHpp) {
            const learnedMatch = cands.find((c) => c.hpp.toLowerCase() === bestHpp);
            if (learnedMatch) {
              return {
                hpp: learnedMatch.hpp,
                trust: learnedMatch.trust,
                label: learnedMatch.label,
                candidates: cands,
                oov: false,
              };
            }
          }
        }
        // 5. 各腔人工／互學偏好讀音表
        const pref = this.prefs.get(han);
        if (pref) {
          const match = cands.find((c) => c.hpp === pref);
          if (match) {
            return { hpp: match.hpp, trust: match.trust, label: match.label, candidates: cands, oov: false };
          }
        }
      }
      return {
        hpp: cands[0].hpp,
        trust: cands[0].trust,
        label: cands[0].label,
        candidates: cands,
        oov: false,
      };
    }

    viterbiSegment(chunk, useNan = false, openBookMap = null) {
      const chars = Array.from(chunk);
      const n = chars.length;
      const dp = new Array(n + 1).fill(Infinity);
      const back = new Array(n + 1).fill(0);
      const bestWord = new Array(n + 1).fill('');
      dp[0] = 0;
      const vocabSize = this.lexicon.size || 1;

      for (let i = 0; i < n; i++) {
        if (!Number.isFinite(dp[i])) continue;
        let matched = false;
        const limit = Math.min(this.maxWordLen, n - i);
        const prevWord = bestWord[i];
        for (let len = 1; len <= limit; len++) {
          const w = chars.slice(i, i + len).join('');
          const hasOpenBook = useNan && openBookMap && openBookMap.has(w);
          const cands = hasOpenBook
            ? [{ trust: 'official' }]
            : (useNan && this.nanLexicon.get(w)) || this.lexicon.get(w);
          if (cands && cands.length) {
            matched = true;
            const topTrust = TRUST_RANK[cands[0].trust] || 1;
            const trustPenalty = topTrust === 3 ? 0 : topTrust === 2 ? 0.8 : 2.5;
            const freq = (this.unigram[w] || 0) + (this.learnedUnigram[w] || 0) + (hasOpenBook ? 500 : 0) + 0.5;
            const biKey = prevWord ? `${prevWord}\t${w}` : '';
            const bi = biKey ? ((this.bigram[biKey] || 0) + (this.learnedBigram[biKey] || 0)) : 0;
            const biBonus = bi > 0 ? 0.45 * mathLog(1 + bi) : 0;
            const cost =
              -mathLog(freq / (this.totalTokens + 0.5 * vocabSize)) - 1.6 * (len - 1) + trustPenalty - biBonus;
            if (dp[i] + cost < dp[i + len]) {
              dp[i + len] = dp[i] + cost;
              back[i + len] = i;
              bestWord[i + len] = w;
            }
          }
        }
        const single = chars[i];
        const hasSingle = this.lexicon.has(single) || (useNan && this.nanLexicon.has(single));
        if (!matched || !hasSingle) {
          if (dp[i] + 14 < dp[i + 1]) {
            dp[i + 1] = dp[i] + 14;
            back[i + 1] = i;
            bestWord[i + 1] = single;
          }
        }
      }

      const tokens = [];
      let pos = n;
      while (pos > 0) {
        const prev = back[pos];
        tokens.push(chars.slice(prev, pos).join(''));
        pos = prev;
      }
      tokens.reverse();
      return tokens;
    }

    /**
     * 處理一段只含諸夏字與內部 `-`/`=` 控制符的強制詞組（例如 `輕-井-澤`、`美=臺`）
     */
    _resolveForcedCompound(expr, needCap) {
      // 拆出子片段與其間的控制符（'-' 或 '='）
      const parts = [];
      const ops = [];
      let buf = '';
      for (const ch of Array.from(expr)) {
        if (ch === '-' || ch === '=') {
          parts.push(buf);
          ops.push(ch);
          buf = '';
        } else {
          buf += ch;
        }
      }
      parts.push(buf);

      const fullHan = parts.join('');
      const hasEq = ops.includes('=');
      const exactCands = this.lexicon.get(fullHan) || [];

      let hppParts = [];
      let worstTrust = 'official';
      let label = '強制連詞';
      let anyOov = false;
      const partsMeta = [];

      if (!hasEq && exactCands.length > 0) {
        const picked = this._pickDefault(fullHan);
        hppParts = picked.hpp.split(/\s+/);
        worstTrust = picked.trust;
        label = picked.label;
        partsMeta.push({
          han: fullHan,
          sylCount: Array.from(fullHan).length,
          candidates: exactCands,
        });
      } else {
        for (const p of parts) {
          for (const seg of this.viterbiSegment(p)) {
            const picked = this._pickDefault(seg);
            if (picked.oov) anyOov = true;
            if (TRUST_RANK[picked.trust] && TRUST_RANK[picked.trust] < TRUST_RANK[worstTrust]) {
              worstTrust = picked.trust;
            }
            const segSyls = picked.hpp.split(/\s+/);
            hppParts.push(...segSyls);
            partsMeta.push({
              han: seg,
              sylCount: Array.from(seg).length,
              candidates: picked.candidates,
            });
          }
        }
      }

      // 記錄每一個音節邊界是否強制為 '='（連字號）
      const sylBoundaries = [];
      for (let i = 0; i < parts.length; i++) {
        const pLen = Array.from(parts[i]).length;
        for (let k = 0; k < pLen - 1; k++) {
          sylBoundaries.push('normal');
        }
        if (i < ops.length) {
          sylBoundaries.push(ops[i] === '=' ? 'hyphen' : 'normal');
        }
      }

      let hpp = hppParts.join(' ');
      if (!anyOov && needCap && hpp) {
        hpp = hpp.charAt(0).toUpperCase() + hpp.slice(1);
      }

      const hasSubPoly = partsMeta.some((pm) => pm.candidates && pm.candidates.length > 1);

      return {
        han: fullHan,
        displayHan: expr,
        hpp,
        candidates: exactCands,
        partsMeta,
        isPolyphone: exactCands.length > 1 || hasSubPoly,
        oov: anyOov,
        trust: anyOov ? 'oov' : worstTrust,
        label: hasEq ? '強制連字號(=)' : exactCands.length ? label : '強制連詞(-)',
        sylBoundaries,
        punct: false,
      };
    }

    segmentAndConvert(text, openBookMap = null) {
      const chars = Array.from(text);
      const cpToUtf16 = new Array(chars.length + 1);
      let utf16Pos = 0;
      for (let i = 0; i < chars.length; i++) {
        cpToUtf16[i] = utf16Pos;
        utf16Pos += chars[i].length;
      }
      cpToUtf16[chars.length] = utf16Pos;

      const tokens = [];
      let cjkBuf = '';
      let cjkStartCp = -1;
      let cjkBufNoSandhi = new Set();
      let cjkBufSpaceAfter = new Set();
      let cjkBufPureCount = 0;
      let nonCjkBuf = '';
      let needCap = true;
      let inParen = false;

      const COMPOUND_RE = /([\u4e00-\u9fff\u3400-\u4dbf\u{20000}-\u{2ebef}](?:[-=][\u4e00-\u9fff\u3400-\u4dbf\u{20000}-\u{2ebef}])+)/gu;

      const flushNonCjk = () => {
        if (!nonCjkBuf) return;
        tokens.push({ han: nonCjkBuf, hpp: nonCjkBuf, punct: false, nonCjk: true });
        needCap = false;
        nonCjkBuf = '';
      };

      const applyTokenMarkers = (tok, startPureIdx) => {
        const chars = Array.from(tok.han || '').filter((c) => CJK_CHAR_RE.test(c));
        const flags = chars.map((_, k) => cjkBufNoSandhi.has(startPureIdx + k));
        if (flags.some(Boolean)) tok.noSandhi = flags;
        if (chars.length > 1) {
          const bounds = tok.sylBoundaries ? tok.sylBoundaries.slice() : new Array(chars.length - 1).fill('normal');
          let hasSpace = false;
          for (let k = 0; k < chars.length - 1; k++) {
            if (cjkBufSpaceAfter.has(startPureIdx + k)) {
              bounds[k] = 'space';
              hasSpace = true;
            }
          }
          if (hasSpace || tok.sylBoundaries) tok.sylBoundaries = bounds;
        }
        return chars.length;
      };

      const flushCjk = () => {
        if (!cjkBuf) return;
        const segments = cjkBuf.split(COMPOUND_RE).filter(Boolean);
        let segCpOffset = cjkStartCp;
        let pureIdx = 0;
        for (const seg of segments) {
          const segCpLen = Array.from(seg).length;
          if (seg.includes('-') || seg.includes('=')) {
            const tok = this._resolveForcedCompound(seg, needCap);
            tok.srcStart = cpToUtf16[segCpOffset];
            tok.srcEnd = cpToUtf16[segCpOffset + segCpLen];
            if (!tok.oov) needCap = false;
            pureIdx += applyTokenMarkers(tok, pureIdx);
            tokens.push(tok);
          } else {
            let wordCpOffset = segCpOffset;
            const useNan = inParen && this.dialect === 'xiien';
            const segWords = this.viterbiSegment(seg, useNan, openBookMap);
            for (let wi = 0; wi < segWords.length; wi++) {
              const w = segWords[wi];
              const prevHan = wi > 0 ? segWords[wi - 1] : '';
              const nextHan = wi + 1 < segWords.length ? segWords[wi + 1] : '';
              const wCpLen = Array.from(w).length;
              const picked = this._pickDefault(w, useNan, openBookMap, prevHan, nextHan);
              let hpp = picked.hpp;
              const wasCap = !picked.oov && needCap;
              if (wasCap) {
                hpp = hpp.charAt(0).toUpperCase() + hpp.slice(1);
                needCap = false;
              } else if (!picked.oov) {
                needCap = false;
              }
              let nanHpp = null;
              if (!inParen && !picked.oov && this.dialect === 'xiien' && this.nanLexicon.size > 0) {
                const nanCands = this.nanLexicon.get(w);
                if (nanCands && nanCands.length > 0) {
                  const baseLower = hpp.toLowerCase();
                  if (!nanCands.some((c) => c.hpp.toLowerCase() === baseLower)) {
                    nanHpp = nanCands[0].hpp;
                    if (wasCap) nanHpp = nanHpp.charAt(0).toUpperCase() + nanHpp.slice(1);
                  }
                }
              }
              const tok = {
                han: w,
                hpp,
                nanHpp,
                srcStart: cpToUtf16[wordCpOffset],
                srcEnd: cpToUtf16[wordCpOffset + wCpLen],
                candidates: picked.candidates,
                isPolyphone: picked.candidates.length > 1,
                oov: picked.oov,
                trust: picked.trust,
                label: picked.label,
                punct: false,
              };
              pureIdx += applyTokenMarkers(tok, pureIdx);
              tokens.push(tok);
              wordCpOffset += wCpLen;
            }
          }
          segCpOffset += segCpLen;
        }
        cjkBuf = '';
        cjkStartCp = -1;
        cjkBufNoSandhi = new Set();
        cjkBufSpaceAfter = new Set();
        cjkBufPureCount = 0;
      };

      for (let i = 0; i < chars.length; i++) {
        const ch = chars[i];
        const prev = i > 0 ? chars[i - 1] : '';
        const next = i + 1 < chars.length ? chars[i + 1] : '';

        // Obsidian 風格註解 %%...%%：不予轉換，保留為 comment token
        if (ch === '%' && next === '%') {
          let closeIdx = -1;
          for (let j = i + 2; j < chars.length - 1; j++) {
            if (chars[j] === '%' && chars[j + 1] === '%') {
              closeIdx = j;
              break;
            }
          }
          if (closeIdx !== -1) {
            flushCjk();
            flushNonCjk();
            const commentText = chars.slice(i, closeIdx + 2).join('');
            tokens.push({ han: commentText, hpp: '', punct: true, isComment: true });
            i = closeIdx + 1;
            continue;
          }
        }

        if (CJK_CHAR_RE.test(ch)) {
          flushNonCjk();
          if (cjkStartCp < 0) cjkStartCp = i;
          cjkBuf += ch;
          cjkBufPureCount++;
        } else if (isNoSandhiChar(ch) && CJK_CHAR_RE.test(prev) && cjkBufPureCount > 0) {
          // `#` 或 `~` 標記前一個音節不變調（若後面緊接漢字仍維持同詞，不拆詞）
          cjkBufNoSandhi.add(cjkBufPureCount - 1);
        } else if ((ch === '-' || ch === '=') && (CJK_CHAR_RE.test(prev) || isNoSandhiChar(prev)) && CJK_CHAR_RE.test(next)) {
          cjkBuf += ch;
        } else if (ch === '+' && (CJK_CHAR_RE.test(prev) || isNoSandhiChar(prev)) && CJK_CHAR_RE.test(next)) {
          // `+` 強制在輸出中加空格，但查讀音與斷詞單位維持不變
          if (cjkBufPureCount > 0) cjkBufSpaceAfter.add(cjkBufPureCount - 1);
        } else if (ch === '\n') {
          flushCjk();
          flushNonCjk();
          tokens.push({ han: '\n', hpp: '\n', punct: true });
          needCap = true;
        } else if (/[ \t]/.test(ch)) {
          flushCjk();
          flushNonCjk();
          tokens.push({ han: ' ', hpp: ' ', punct: true, isSpace: true });
        } else if (PUNCT_MAP[ch] !== undefined) {
          flushCjk();
          flushNonCjk();
          const mapped = PUNCT_MAP[ch];
          tokens.push({ han: ch, hpp: mapped, punct: true });
          if (ch === '（') inParen = true;
          else if (ch === '）') inParen = false;
          if (/[.!?]/.test(mapped) || ((ch === '「' || ch === '『') && prev === '：')) {
            needCap = true;
          }
        } else if (/[.,!?;:()\[\]{}"']/.test(ch)) {
          flushCjk();
          flushNonCjk();
          tokens.push({ han: ch, hpp: ch, punct: true });
          if (ch === '(') inParen = true;
          else if (ch === ')') inParen = false;
          if (/[.!?]/.test(ch)) needCap = true;
        } else {
          // 保留英數字等非諸夏字（組成連續 token，如 Hakfa、100）
          flushCjk();
          nonCjkBuf += ch;
        }
      }
      flushCjk();
      flushNonCjk();
      if (this.dialect === 'ngiaupin') {
        this.populateRaopingSubTokens(tokens);
      }
      return tokens;
    }

    _deriveRaopingSubSyl(zhukSyl, targetSub) {
      if (!zhukSyl) return zhukSyl;
      const first = zhukSyl.charAt(0);
      const isCap = first !== first.toLowerCase();
      let s = zhukSyl.toLowerCase().normalize('NFC');

      if (s === 'èr') {
        const res = 'ê';
        return isCap ? res.charAt(0).toUpperCase() + res.slice(1) : res;
      }

      // 聲母轉換
      if (s.startsWith('zh') || s.startsWith('ch') || s.startsWith('sh')) {
        s = s.charAt(0) + s.slice(2);
      } else if (targetSub === 'taoyuan') {
        if (s.startsWith('rh')) {
          s = s.slice(2);
        } else if (s.startsWith('v') && s.length > 1) {
          s = s.slice(1);
        }
      }

      // 舒聲調號轉換（非入聲尾）
      const isStop = /[bdpt]$/i.test(s) || (/[gk]$/i.test(s) && !s.endsWith('ng'));
      if (!isStop) {
        const nfd = s.normalize('NFD');
        const m = nfd.match(/[\u0301\u0300\u030C\u0302\u0304]/);
        if (!m) {
          // 55 (無符號) -> 53 (\u0300)
          const chars = Array.from(s);
          let vIdx = chars.findIndex((c) => /[aeo]/.test(c));
          if (vIdx < 0) {
            for (let i = chars.length - 1; i >= 0; i--) {
              if (/[iu]/.test(chars[i])) {
                vIdx = i;
                break;
              }
            }
          }
          if (vIdx >= 0) {
            chars[vIdx] = (chars[vIdx] + '\u0300').normalize('NFC');
            s = chars.join('');
          }
        } else if (m[0] === '\u0300') {
          // 53 (\u0300) -> 31 (\u0302)
          s = nfd.replace('\u0300', '\u0302').normalize('NFC');
        } else if (m[0] === '\u0301') {
          // 24 (\u0301) -> 55 (無符號)
          s = nfd.replace('\u0301', '').normalize('NFC');
        }
      }

      return isCap && s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
    }

    _stripToneMarks(syl) {
      return String(syl || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .normalize('NFC');
    }

    _isRaopingSylCompatible(zhukSyl, subSyl, targetSub) {
      if (!zhukSyl || !subSyl) return false;
      const derivedBase = this._stripToneMarks(this._deriveRaopingSubSyl(zhukSyl, targetSub));
      const subBase = this._stripToneMarks(subSyl);
      if (derivedBase === subBase) return true;
      // 容許部分韻母微調（如 rh->零、i->ii、er->e 等），但至少入聲屬性與主要聲母不能完全無關
      const zStop = /[bdpt]$/.test(derivedBase) || (/[gk]$/.test(derivedBase) && !derivedBase.endsWith('ng'));
      const sStop = /[bdpt]$/.test(subBase) || (/[gk]$/.test(subBase) && !subBase.endsWith('ng'));
      if (zStop !== sStop) return false;
      return derivedBase.charAt(0) === subBase.charAt(0);
    }

    _resolveRaopingSubHpp(han, zhukHpp, targetSub) {
      if (!han || !zhukHpp) return { hpp: zhukHpp, trust: 'official' };
      const first = zhukHpp.charAt(0);
      const isCap = first !== first.toLowerCase();
      const applyCap = (str) => {
        if (!str) return str;
        return isCap ? str.charAt(0).toUpperCase() + str.slice(1) : str;
      };

      const subLex = targetSub === 'zhuolan' ? this.zhuolanLexicon : this.taoyuanLexicon;
      const charMap = targetSub === 'zhuolan' ? this.zhuolanCharMap : this.taoyuanCharMap;
      const chars = Array.from(han).filter((c) => CJK_CHAR_RE.test(c));
      const syls = zhukHpp.trim().split(/\s+/).filter(Boolean);

      // 單字詞優先以 (字, 新竹音節) 精準對照，避免多音字（如 毒 tug / téu）被別音覆蓋
      if (chars.length === 1 && syls.length === 1) {
        const mapKey = `${chars[0]}\t${syls[0].toLowerCase()}`;
        const mapped = charMap && charMap.get(mapKey);
        if (mapped) {
          return { hpp: applyCap(mapped), trust: 'official' };
        }
        const cands = (subLex && subLex.get(han)) || [];
        const compat = cands.filter((c) => this._isRaopingSylCompatible(syls[0], c.hpp, targetSub));
        if (compat.length > 0) {
          const off = compat.find((c) => c.trust === 'official') || compat[0];
          return { hpp: applyCap(off.hpp), trust: off.trust };
        }
        return { hpp: applyCap(this._deriveRaopingSubSyl(syls[0], targetSub)), trust: 'supp-derived' };
      }

      const cands = subLex && subLex.get(han);
      if (cands && cands.length > 0 && syls.length > 0) {
        // 多字詞挑選與當前新竹音節最相容的候選
        let bestCand = null;
        let bestScore = 0;
        for (const c of cands) {
          const cSyls = (c.hpp || '').trim().split(/\s+/).filter(Boolean);
          if (cSyls.length !== syls.length) continue;
          let score = 0;
          for (let k = 0; k < syls.length; k++) {
            if (this._isRaopingSylCompatible(syls[k], cSyls[k], targetSub)) score++;
          }
          if (c.trust === 'official') score += 0.1;
          if (score > bestScore) {
            bestScore = score;
            bestCand = c;
          }
        }
        if (bestCand && bestScore >= 1) {
          return { hpp: applyCap(bestCand.hpp), trust: bestCand.trust };
        }
      }

      if (chars.length !== syls.length) {
        return {
          hpp: applyCap(syls.map((sy) => this._deriveRaopingSubSyl(sy, targetSub)).join(' ')),
          trust: 'supp-derived',
        };
      }

      const outSyls = [];
      for (let k = 0; k < chars.length; k++) {
        const ch = chars[k];
        const sy = syls[k];
        const mapKey = `${ch}\t${sy.toLowerCase()}`;
        let mapped = charMap && charMap.get(mapKey);
        if (!mapped) {
          const singleCands = (subLex && subLex.get(ch)) || [];
          const compat = singleCands.find((c) => this._isRaopingSylCompatible(sy, c.hpp, targetSub));
          if (compat) mapped = compat.hpp;
        }
        if (mapped) {
          const wasUpper = sy.charAt(0) !== sy.charAt(0).toLowerCase();
          outSyls.push(wasUpper ? mapped.charAt(0).toUpperCase() + mapped.slice(1) : mapped);
        } else {
          outSyls.push(this._deriveRaopingSubSyl(sy, targetSub));
        }
      }
      return { hpp: applyCap(outSyls.join(' ')), trust: 'supp-derived' };
    }

    populateRaopingSubTokens(tokens) {
      if (this.dialect !== 'ngiaupin' || !Array.isArray(tokens)) return;
      for (const tok of tokens) {
        if (!tok || tok.punct || tok.nonCjk || tok.isComment || !tok.hpp) continue;
        const z = this._resolveRaopingSubHpp(tok.han, tok.hpp, 'zhuolan');
        const t = this._resolveRaopingSubHpp(tok.han, tok.hpp, 'taoyuan');
        tok.zhuolanHpp = z.hpp;
        tok.zhuolanTrust = z.trust;
        tok.taoyuanHpp = t.hpp;
        tok.taoyuanTrust = t.trust;
      }
    }

    /** 依目前連詞模式格式化單一詞條或候選讀音 */
    formatWordHpp(hppStr, joiningMode = 'none', sylBoundaries = null) {
      const join = root.romaineJoin;
      const syls = (hppStr || '').trim().split(/\s+/).filter(Boolean);
      if (syls.length <= 1 || !join) {
        return syls.join('');
      }
      let wordOut = syls[0];
      for (let i = 1; i < syls.length; i++) {
        const forced = sylBoundaries && sylBoundaries[i - 1];
        if (forced === 'hyphen') {
          wordOut += '-';
        } else if (forced === 'space') {
          wordOut += ' ';
        } else {
          wordOut += join.getJoiningSeparator(joiningMode, false, syls[i - 1], syls[i - 1], syls[i]);
        }
        wordOut += syls[i];
      }
      return wordOut;
    }

    formatTokensToHpp(tokens, joiningMode = 'none') {
      let out = '';
      let prevWasWord = false;

      for (const tok of tokens) {
        if (tok.isComment) continue;
        if (tok.punct) {
          if (tok.han === '\n') {
            out = out.replace(/[ \t]+$/, '') + '\n';
            prevWasWord = false;
          } else if (tok.isSpace) {
            if (!out.endsWith(' ') && !out.endsWith('\n')) {
              out += ' ';
            }
            prevWasWord = false;
          } else {
            const p = tok.hpp !== undefined ? tok.hpp : tok.han;
            if (p === '(') {
              if (prevWasWord) out += ' ';
              out += '(';
              prevWasWord = false;
            } else if (p === ')') {
              out = out.replace(/[ ]+$/, '') + ')';
              prevWasWord = true;
            } else {
              out = out.replace(/[ ]+$/, '') + p;
              prevWasWord = false;
            }
          }
          continue;
        }
        if (prevWasWord) out += ' ';
        if (tok.nonCjk) {
          out += tok.hpp;
        } else {
          out += this.formatWordHpp(tok.hpp, joiningMode, tok.sylBoundaries);
          if (tok.nanHpp) {
            out += ' (' + this.formatWordHpp(tok.nanHpp, joiningMode, tok.sylBoundaries) + ')';
          }
        }
        prevWasWord = true;
      }
      return out.trim();
    }

    formatTokensToHppForVariant(tokens, joiningMode = 'none', variant = 'zhuk') {
      if (variant === 'zhuk' || this.dialect !== 'ngiaupin') {
        return this.formatTokensToHpp(tokens, joiningMode);
      }
      const field = variant === 'zhuolan' ? 'zhuolanHpp' : 'taoyuanHpp';
      const mapped = tokens.map((tok) => {
        if (!tok || tok.punct || tok.nonCjk || tok.isComment) return tok;
        return { ...tok, hpp: tok[field] || tok.hpp, nanHpp: null };
      });
      return this.formatTokensToHpp(mapped, joiningMode);
    }

    formatTokensToVariantHtml(tokens, joiningMode = 'none', variant = 'zhuk', italicUnverified = false) {
      if (variant === 'zhuk' || this.dialect !== 'ngiaupin') {
        return this.formatTokensToHpp(tokens, joiningMode);
      }
      const esc = (s) =>
        String(s)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
      const hppField = variant === 'zhuolan' ? 'zhuolanHpp' : 'taoyuanHpp';
      const trustField = variant === 'zhuolan' ? 'zhuolanTrust' : 'taoyuanTrust';
      let out = '';
      let prevWasWord = false;

      for (const tok of tokens) {
        if (tok.isComment) continue;
        if (tok.punct) {
          if (tok.han === '\n') {
            out = out.replace(/[ \t]+$/, '') + '\n';
            prevWasWord = false;
          } else if (tok.isSpace) {
            if (!out.endsWith(' ') && !out.endsWith('\n')) out += ' ';
            prevWasWord = false;
          } else {
            const p = tok.hpp !== undefined ? tok.hpp : tok.han;
            if (p === '(') {
              if (prevWasWord) out += ' ';
              out += '(';
              prevWasWord = false;
            } else if (p === ')') {
              out = out.replace(/[ ]+$/, '') + ')';
              prevWasWord = true;
            } else {
              out = out.replace(/[ ]+$/, '') + esc(p);
              prevWasWord = false;
            }
          }
          continue;
        }
        if (prevWasWord) out += ' ';
        if (tok.nonCjk) {
          out += esc(tok.hpp);
        } else {
          const wordText = this.formatWordHpp(tok[hppField] || tok.hpp, joiningMode, tok.sylBoundaries);
          const isDerived = tok[trustField] !== 'official';
          if (isDerived) {
            const cls = italicUnverified ? 'wb-derived-word is-italic' : 'wb-derived-word';
            out += `<span class="${cls}" title="字級／規則推導（尚待人工審定）">${esc(wordText)}</span>`;
          } else {
            out += esc(wordText);
          }
        }
        prevWasWord = true;
      }
      return out.trim();
    }

    _classifyHppTone(syllable, dialectCode) {
      const map = this.reverseToneMap && this.reverseToneMap[dialectCode];
      if (!map || !syllable) return null;
      const clean = syllable.replace(/^[^a-zA-Z\u00C0-\u024F\u1E00-\u1EFF]+|[^a-zA-Z\u00C0-\u024F\u1E00-\u1EFF]+$/g, '');
      if (!clean) return null;
      const hasStop = /[bdpt]$/i.test(clean) || (/[gk]$/i.test(clean) && !clean.toLowerCase().endsWith('ng'));
      const nfd = clean.normalize('NFD');
      const toneMatch = nfd.match(/[\u0301\u0300\u030C\u0302\u0304]/);
      const aForm = ('a' + (toneMatch ? toneMatch[0] : '')).normalize('NFC');
      return map[aForm + (hasStop ? 'd' : '')] || null;
    }

    _getSandhiTone(currSyl, nextSyl, dialectCode, prevSyl = '', next2Syl = '') {
      const rules = this.sandhiRules && this.sandhiRules[dialectCode];
      if (!rules) return null;
      const frontTone = this._classifyHppTone(currSyl, dialectCode);
      if (!frontTone) return null;

      const norm = (s) => String(s || '').trim().toLowerCase();
      const prevN = norm(prevSyl);
      const currN = norm(currSyl);
      const nextN = norm(nextSyl);
      const next2N = norm(next2Syl);

      if (dialectCode === 'zh') {
        const ZH_POST_SANDHI = {
          'ngài|ngìn': '33', 'hèn|ngìn': '33', 'gùi|ngìn': '33', 'ěen|ngìn': '33',
          'hôo|mò': '11', 'rhiǔ|mò': '11', 'ngìb|lòi': '11', 'loo|lòi': '11', 'lòo|lòi': '11',
        };
        if (prevN && ZH_POST_SANDHI[`${prevN}|${currN}`]) return ZH_POST_SANDHI[`${prevN}|${currN}`];
        if (nextN && ZH_POST_SANDHI[`${currN}|${nextN}`]) return null;
        if (nextN && currN === nextN && prevN !== currN && !['24', '24v', '43'].includes(frontTone)) {
          return frontTone === '55' ? null : '55';
        }
      } else if (dialectCode === 'da') {
        if (prevN !== currN && nextN && currN === nextN && nextN === next2N) {
          if (['33', '113', '31', '54'].includes(frontTone)) return '35';
        } else if (prevN === currN && nextN && currN === nextN && nextN !== next2N) {
          if (['33', '31', '54'].includes(frontTone)) return '113';
        }
      }

      if (!nextSyl) return null;
      const rule = rules[frontTone];
      if (!rule) return null;
      if (rule.always) return rule.always;
      if (rule.when) {
        const nextTone = this._classifyHppTone(nextSyl, dialectCode);
        return rule.when[nextTone] || rule.else || null;
      }
      return rule.else || null;
    }

    /** 依目前連詞模式產出整句含連讀變調 <ruby> 標記的 HTML */
    formatTokensToSandhiHtml(tokens, joiningMode = 'none', noSandhiMarkerOverride = null) {
      const esc = (s) =>
        String(s)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
      const noSandhiSym = noSandhiMarkerOverride === '#' || noSandhiMarkerOverride === '~'
        ? noSandhiMarkerOverride
        : getNoSandhiMarker();
      const join = root.romaineJoin;
      const dialectCode = this.sandhiCode || this.kiong;
      const BLOCK_PUNCT_RE = /[()（）【】、，,；;。.!?]/;

      // 攤平為音節與邊界事件流，確保連寫模式下詞內音節也能正確判斷前後音節變調
      const stream = [];
      let prevWasWord = false;
      for (const tok of tokens) {
        if (tok.isComment) continue;
        if (tok.punct) {
          if (tok.han === '\n') {
            stream.push({ type: 'newline' });
            prevWasWord = false;
          } else if (tok.isSpace) {
            stream.push({ type: 'space' });
            prevWasWord = false;
          } else {
            const p = tok.hpp !== undefined ? tok.hpp : tok.han;
            if (p === '(') {
              if (prevWasWord) stream.push({ type: 'word-space' });
              stream.push({ type: 'open-paren', text: '(' });
              prevWasWord = false;
            } else if (p === ')') {
              stream.push({ type: 'punct', text: ')' });
              prevWasWord = true;
            } else {
              stream.push({ type: 'block', text: p });
              prevWasWord = false;
            }
          }
          continue;
        }
        if (prevWasWord) stream.push({ type: 'word-space' });
        if (tok.nonCjk) {
          stream.push({ type: 'block', text: tok.hpp });
        } else {
          const syls = (tok.hpp || '').trim().split(/\s+/).filter(Boolean);
          for (let i = 0; i < syls.length; i++) {
            let sepBefore = '';
            if (i > 0) {
              const forced = tok.sylBoundaries && tok.sylBoundaries[i - 1];
              if (forced === 'hyphen') {
                sepBefore = '-';
              } else if (forced === 'space') {
                sepBefore = ' ';
              } else if (join) {
                sepBefore = join.getJoiningSeparator(joiningMode, false, syls[i - 1], syls[i - 1], syls[i]);
              }
            }
            if (sepBefore) stream.push({ type: 'sep', text: sepBefore });
            stream.push({ type: 'syl', text: syls[i], noSandhi: Boolean(tok.noSandhi && tok.noSandhi[i]) });
          }
          if (tok.nanHpp) {
            stream.push({ type: 'word-space' });
            stream.push({ type: 'open-paren', text: '(' });
            stream.push({ type: 'block', text: this.formatWordHpp(tok.nanHpp, joiningMode, tok.sylBoundaries) });
            stream.push({ type: 'punct', text: ')' });
          }
        }
        prevWasWord = true;
      }

      let out = '';
      let prevSyl = '';
      for (let i = 0; i < stream.length; i++) {
        const item = stream[i];
        if (item.type === 'newline') {
          prevSyl = '';
          out = out.replace(/[ \t]+$/, '') + '\n';
        } else if (item.type === 'space') {
          if (!out.endsWith(' ') && !out.endsWith('\n')) out += ' ';
        } else if (item.type === 'word-space') {
          out += ' ';
        } else if (item.type === 'sep') {
          out += esc(item.text);
        } else if (item.type === 'open-paren') {
          out += esc(item.text);
        } else if (item.type === 'block' || item.type === 'punct') {
          if (item.type === 'block') prevSyl = '';
          out = out.replace(/[ ]+$/, '') + esc(item.text);
        } else if (item.type === 'syl') {
          if (item.noSandhi) {
            prevSyl = '';
            out += `<ruby class="sandhi-none">${esc(item.text)}<rt>${esc(noSandhiSym)}</rt></ruby>`;
            continue;
          }
          let nextSyl = null;
          let next2Syl = null;
          for (let j = i + 1; j < stream.length; j++) {
            if (stream[j].type === 'syl') {
              if (!nextSyl) {
                nextSyl = stream[j].text;
              } else {
                next2Syl = stream[j].text;
                break;
              }
            }
            if (stream[j].type === 'block' || stream[j].type === 'newline') break;
          }
          const newTone = (nextSyl || (dialectCode === 'zh' && prevSyl))
            ? this._getSandhiTone(item.text, nextSyl || '', dialectCode, prevSyl, next2Syl || '')
            : null;
          prevSyl = item.text;
          if (newTone) {
            out += `<ruby class="sandhi-t${esc(newTone)}">${esc(item.text)}<rt>${esc(newTone)}</rt></ruby>`;
          } else {
            out += esc(item.text);
          }
        }
      }
      return out.trim();
    }
  }

  function mathLog(x) {
    return Math.log(x);
  }

  RomaineAutoEngine.normalizeDialect = normalizeDialect;
  RomaineAutoEngine.NO_SANDHI_MARKER_KEY = NO_SANDHI_MARKER_KEY;
  RomaineAutoEngine.UNVERIFIED_ITALIC_KEY = UNVERIFIED_ITALIC_KEY;
  RomaineAutoEngine.TRUST_UNDERLINE_KEY = TRUST_UNDERLINE_KEY;
  RomaineAutoEngine.RAOPING_TRACKS_KEY = RAOPING_TRACKS_KEY;
  RomaineAutoEngine.getNoSandhiMarker = getNoSandhiMarker;
  RomaineAutoEngine.setNoSandhiMarker = setNoSandhiMarker;
  RomaineAutoEngine.getUnverifiedItalic = getUnverifiedItalic;
  RomaineAutoEngine.setUnverifiedItalic = setUnverifiedItalic;
  RomaineAutoEngine.getTrustUnderline = getTrustUnderline;
  RomaineAutoEngine.setTrustUnderline = setTrustUnderline;
  RomaineAutoEngine.getRaopingTracks = getRaopingTracks;
  RomaineAutoEngine.setRaopingTracks = setRaopingTracks;
  RomaineAutoEngine.expandRaopingSentenceVariants = expandRaopingSentenceVariants;
  root.RomaineAutoEngine = RomaineAutoEngine;
})(typeof globalThis !== 'undefined' ? globalThis : this);
