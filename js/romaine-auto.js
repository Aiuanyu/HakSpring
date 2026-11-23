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

  if (typeof root.addEventListener === 'function') {
    if (!root.__romainePrefsStorageBound) {
      root.__romainePrefsStorageBound = true;
      root.addEventListener('storage', (e) => {
        if (!e) return;
        if (
          e.key === NO_SANDHI_MARKER_KEY ||
          e.key === UNVERIFIED_ITALIC_KEY ||
          e.key === TRUST_UNDERLINE_KEY
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

  function isNoSandhiChar(ch) {
    return ch === '#' || ch === '~';
  }

  const DIALECT_CONFIG = {
    sixian: {
      label: '四縣',
      kiong: 'si',
      gip: 'data/gip/20261020-四.json',
      cert: [
        { level: '基礎級', file: 'data/cert/115四基.json' },
        { level: '初級', file: 'data/cert/115四初.json' },
        { level: '中級', file: 'data/cert/115四中.json' },
        { level: '中高級', file: 'data/cert/115四中高.json' },
        { level: '高級', file: 'data/cert/115四高.json' },
      ],
      supp: 'data/supp/補字典-四.json',
      stats: 'data/romaine/sixian_stats.json',
      prefs: 'data/romaine/sixian_prefs.json',
    },
    zhaoan: {
      label: '詔安',
      kiong: 'zh',
      gip: 'data/gip/20261020-安.json',
      cert: [
        { level: '基礎級', file: 'data/cert/115安基.json' },
        { level: '初級', file: 'data/cert/115安初.json' },
        { level: '中級', file: 'data/cert/115安中.json' },
        { level: '中高級', file: 'data/cert/115安中高.json' },
        { level: '高級', file: 'data/cert/115安高.json' },
      ],
      supp: 'data/supp/補字典-安.json',
      stats: 'data/romaine/zhaoan_stats.json',
      prefs: 'data/romaine/zhaoan_prefs.json',
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
    // 先移除【】變體與括號同義詞
    const s = raw.replace(/【.*?】/g, '').replace(/[（）()]/g, '');
    const results = [];

    // 展開單音節內斜線（如 "hím/hiún sòng" -> ["hím sòng", "hiún sòng"]）
    const expandPhrase = (phrase, tag) => {
      const words = phrase.trim().split(/\s+/).filter(Boolean);
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

    const NOTE_SPLIT_RE = /(又俗音|又讀|又音|俗音|特殊音|特)/g;

    // 先依 " / " 拆開並列片語，再依教典別讀註記（又讀／俗音／特…）切出各層讀音
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
      this.unigram = Object.create(null);
      this.bigram = Object.create(null);
      this.learnedUnigram = Object.create(null);
      this.learnedReadingCounts = new Map();
      this.learnedCount = 0;
      this.totalTokens = 0;
      this.prefs = new Map();
      this.certLevels = [];
      this.dialect = 'sixian';
      this.dialectLabel = '四縣';
      this.kiong = 'si';
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

    async init(basePath = '.', dialect = 'sixian') {
      const cfg = DIALECT_CONFIG[dialect] || DIALECT_CONFIG.sixian;
      const targetDialect = DIALECT_CONFIG[dialect] ? dialect : 'sixian';
      if (this.ready && this.dialect === targetDialect) return;

      this.ready = false;
      this.dialect = targetDialect;
      this.dialectLabel = cfg.label;
      this.kiong = cfg.kiong;
      this.lexicon = new Map();
      this.prefs = new Map();
      this.certLevels = [];

      const gipFile = `${basePath}/${cfg.gip}`;
      const certFiles = cfg.cert.map((c) => `${basePath}/${c.file}`);
      const suppFile = `${basePath}/${cfg.supp}`;

      const [gipJson, certJsons, suppJson, statsJson, prefsJson, sandhiJson, rtmJson] = await Promise.all([
        fetch(gipFile).then((r) => r.json()),
        Promise.all(certFiles.map((f) => fetch(f).then((r) => r.json()))),
        fetch(suppFile).then((r) => r.json()),
        fetch(`${basePath}/${cfg.stats}`).then((r) => r.json()),
        fetch(`${basePath}/${cfg.prefs}`).then((r) => r.json()),
        this.sandhiRules ? Promise.resolve(this.sandhiRules) : fetch(`${basePath}/sandhi_rules.json`).then((r) => r.json()),
        this.reverseToneMap ? Promise.resolve(this.reverseToneMap) : fetch(`${basePath}/reverse_tone_mapping.json`).then((r) => r.json()),
      ]);
      this.sandhiRules = sandhiJson;
      this.reverseToneMap = (rtmJson && rtmJson.dialect_reverse_map) || rtmJson;

      const seen = new Map();

      // 1. 先收官方詞庫（教典、認證分開標記；兩邊皆有才顯示「教典/認證」）
      const addOfficial = (obj, srcName) => {
        const rows = parseCsv(obj.content || '');
        for (const r of rows) {
          const hans = cleanHanVariants(r.han);
          const hpps = cleanHppVariants(r.hpp);
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
        const rows = addOfficial(obj, '認證');
        this.certLevels.push({
          level: cfg.cert[i].level,
          rows: rows.filter((r) => r.sentence && r.sentence.trim()),
        });
      });

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
            }
          }
        }
      }

      this.unigram = statsJson.unigram || Object.create(null);
      this.bigram = statsJson.bigram || Object.create(null);
      this.totalTokens = (statsJson.meta && statsJson.meta.total_tokens) || 1;
      for (const item of prefsJson.items || []) {
        this.prefs.set(item.han, item.default);
      }
      this.applyVerifiedLearning();
      this.ready = true;
    }

    /** 從 localStorage 黃金語料即時學習斷詞權重、偏好讀音與自訂詞條 */
    applyVerifiedLearning(itemsOverride) {
      this.learnedUnigram = Object.create(null);
      this.learnedReadingCounts = new Map();
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

      const seenEntryKeys = new Set();
      const learnFromEntry = (entry) => {
        if (!entry || (entry.dialect || 'sixian') !== this.dialect) return;
        const eKey = entry.cert_ref && entry.cert_ref.id
          ? `cert:${entry.cert_ref.dialect || entry.dialect}:${entry.cert_ref.level || ''}:${entry.cert_ref.id}`
          : `id:${entry.id || entry.han}`;
        if (seenEntryKeys.has(eKey)) return;
        seenEntryKeys.add(eKey);
        this.learnedCount++;
        for (const tok of entry.tokens || []) {
          if (tok.punct || tok.nonCjk || tok.comment || tok.uncertain) continue;
          const han = (tok.han || '').trim();
          const hppLower = (tok.hpp || '').trim().toLowerCase();
          if (!han || !hppLower || !CJK_CHAR_RE.test(han)) continue;

          // 提升已校正詞條在 Viterbi 斷詞的權重
          this.learnedUnigram[han] = (this.learnedUnigram[han] || 0) + 50;

          if (!this.learnedReadingCounts.has(han)) {
            this.learnedReadingCounts.set(han, new Map());
          }
          const rMap = this.learnedReadingCounts.get(han);
          rMap.set(hppLower, (rMap.get(hppLower) || 0) + 1);

          // 若原詞庫無此詞或無此讀音（例如自訂讀音／強制詞組），補入詞庫候選
          const existingCands = this.lexicon.get(han) || [];
          if (!existingCands.some((c) => c.hpp.toLowerCase() === hppLower)) {
            if (!this.lexicon.has(han)) this.lexicon.set(han, []);
            this.lexicon.get(han).push({ hpp: hppLower, trust: 'official', label: '黃金語料' });
          }
        }
      };

      // 先讀 localStorage（使用者最新修改優先），再讀專案內建 verified_sentences.json
      for (const entry of list) learnFromEntry(entry);
      for (const entry of this.repoVerifiedItems || []) learnFromEntry(entry);
    }

    _pickDefault(han) {
      const cands = this.lexicon.get(han) || [];
      if (!cands.length) return { hpp: han, trust: 'oov', label: '未收錄', candidates: [], oov: true };

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

      const pref = this.prefs.get(han);
      if (pref) {
        const match = cands.find((c) => c.hpp === pref);
        if (match) {
          return { hpp: match.hpp, trust: match.trust, label: match.label, candidates: cands, oov: false };
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

    viterbiSegment(chunk) {
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
          const cands = this.lexicon.get(w);
          if (cands && cands.length) {
            matched = true;
            const topTrust = TRUST_RANK[cands[0].trust] || 1;
            const trustPenalty = topTrust === 3 ? 0 : topTrust === 2 ? 0.8 : 2.5;
            const freq = (this.unigram[w] || 0) + (this.learnedUnigram[w] || 0) + 0.5;
            const bi = prevWord ? (this.bigram[`${prevWord}\t${w}`] || 0) : 0;
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
        if (!matched || !this.lexicon.has(single)) {
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

    segmentAndConvert(text) {
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
            for (const w of this.viterbiSegment(seg)) {
              const wCpLen = Array.from(w).length;
              const picked = this._pickDefault(w);
              let hpp = picked.hpp;
              if (!picked.oov && needCap) {
                hpp = hpp.charAt(0).toUpperCase() + hpp.slice(1);
                needCap = false;
              } else if (!picked.oov) {
                needCap = false;
              }
              const tok = {
                han: w,
                hpp,
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
          if (/[.!?]/.test(mapped) || ((ch === '「' || ch === '『') && prev === '：')) {
            needCap = true;
          }
        } else if (/[.,!?;:()\[\]{}"']/.test(ch)) {
          flushCjk();
          flushNonCjk();
          tokens.push({ han: ch, hpp: ch, punct: true });
          if (/[.!?]/.test(ch)) needCap = true;
        } else {
          // 保留英數字等非諸夏字（組成連續 token，如 Hakfa、100）
          flushCjk();
          nonCjkBuf += ch;
        }
      }
      flushCjk();
      flushNonCjk();
      return tokens;
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
            out = out.replace(/[ ]+$/, '') + p;
            prevWasWord = false;
          }
          continue;
        }
        if (prevWasWord) out += ' ';
        if (tok.nonCjk) {
          out += tok.hpp;
        } else {
          out += this.formatWordHpp(tok.hpp, joiningMode, tok.sylBoundaries);
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
      const dialectCode = this.kiong;
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
            stream.push({ type: BLOCK_PUNCT_RE.test(p) ? 'block' : 'punct', text: p });
            prevWasWord = false;
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

  RomaineAutoEngine.NO_SANDHI_MARKER_KEY = NO_SANDHI_MARKER_KEY;
  RomaineAutoEngine.UNVERIFIED_ITALIC_KEY = UNVERIFIED_ITALIC_KEY;
  RomaineAutoEngine.TRUST_UNDERLINE_KEY = TRUST_UNDERLINE_KEY;
  RomaineAutoEngine.getNoSandhiMarker = getNoSandhiMarker;
  RomaineAutoEngine.setNoSandhiMarker = setNoSandhiMarker;
  RomaineAutoEngine.getUnverifiedItalic = getUnverifiedItalic;
  RomaineAutoEngine.setUnverifiedItalic = setUnverifiedItalic;
  RomaineAutoEngine.getTrustUnderline = getTrustUnderline;
  RomaineAutoEngine.setTrustUnderline = setTrustUnderline;
  root.RomaineAutoEngine = RomaineAutoEngine;
})(typeof globalThis !== 'undefined' ? globalThis : this);
