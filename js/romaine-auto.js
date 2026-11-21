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
    if (hanIdx < 0 || hppIdx < 0) return [];
    const out = [];
    for (let i = 1; i < rows.length; i++) {
      if (rows[i].length > Math.max(hanIdx, hppIdx)) {
        out.push({
          han: rows[i][hanIdx],
          hpp: rows[i][hppIdx],
          category: catIdx >= 0 ? rows[i][catIdx] : '',
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
      this.totalTokens = 0;
      this.prefs = new Map();
      this.maxWordLen = 8;
      this.ready = false;
    }

    _addCandidate(han, hpp, trust, label, seen) {
      const key = `${han}\t${hpp}`;
      if (seen.has(key)) return;
      seen.add(key);
      if (!this.lexicon.has(han)) this.lexicon.set(han, []);
      this.lexicon.get(han).push({ hpp, trust, label });
    }

    async init(basePath = '.') {
      if (this.ready) return;
      const officialFiles = [
        `${basePath}/data/gip/20261020-四.json`,
        `${basePath}/data/cert/115四基.json`,
        `${basePath}/data/cert/115四初.json`,
        `${basePath}/data/cert/115四中.json`,
        `${basePath}/data/cert/115四中高.json`,
        `${basePath}/data/cert/115四高.json`,
      ];
      const suppFile = `${basePath}/data/supp/補字典-四.json`;

      const [officialJsons, suppJson, statsJson, prefsJson] = await Promise.all([
        Promise.all(officialFiles.map((f) => fetch(f).then((r) => r.json()))),
        fetch(suppFile).then((r) => r.json()),
        fetch(`${basePath}/data/romaine/sixian_stats.json`).then((r) => r.json()),
        fetch(`${basePath}/data/romaine/sixian_prefs.json`).then((r) => r.json()),
      ]);

      const seen = new Set();

      // 1. 先收官方詞庫（教典＋認證，最高信賴度）
      for (const obj of officialJsons) {
        for (const r of parseCsv(obj.content || '')) {
          const hans = cleanHanVariants(r.han);
          const hpps = cleanHppVariants(r.hpp);
          for (const h of hans) {
            const hLen = Array.from(h).length;
            for (const item of hpps) {
              if (item.hpp.split(' ').length === hLen) {
                const lbl = item.note ? `教典/認證·${item.note}` : '教典/認證';
                this._addCandidate(h, item.hpp, 'official', lbl, seen);
              }
            }
          }
        }
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
            }
          }
        }
      }

      this.unigram = statsJson.unigram || Object.create(null);
      this.totalTokens = (statsJson.meta && statsJson.meta.total_tokens) || 1;
      for (const item of prefsJson.items || []) {
        this.prefs.set(item.han, item.default);
      }
      this.ready = true;
    }

    _pickDefault(han) {
      const cands = this.lexicon.get(han) || [];
      if (!cands.length) return { hpp: han, trust: 'oov', label: '未收錄', candidates: [], oov: true };
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
      dp[0] = 0;
      const vocabSize = this.lexicon.size || 1;

      for (let i = 0; i < n; i++) {
        if (!Number.isFinite(dp[i])) continue;
        let matched = false;
        const limit = Math.min(this.maxWordLen, n - i);
        for (let len = 1; len <= limit; len++) {
          const w = chars.slice(i, i + len).join('');
          const cands = this.lexicon.get(w);
          if (cands && cands.length) {
            matched = true;
            const topTrust = TRUST_RANK[cands[0].trust] || 1;
            const trustPenalty = topTrust === 3 ? 0 : topTrust === 2 ? 0.8 : 2.5;
            const freq = (this.unigram[w] || 0) + 0.5;
            const cost =
              -mathLog(freq / (this.totalTokens + 0.5 * vocabSize)) - 1.6 * (len - 1) + trustPenalty;
            if (dp[i] + cost < dp[i + len]) {
              dp[i + len] = dp[i] + cost;
              back[i + len] = i;
            }
          }
        }
        const single = chars[i];
        if (!matched || !this.lexicon.has(single)) {
          if (dp[i] + 14 < dp[i + 1]) {
            dp[i + 1] = dp[i] + 14;
            back[i + 1] = i;
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
      let nonCjkBuf = '';
      let needCap = true;

      const COMPOUND_RE = /([\u4e00-\u9fff\u3400-\u4dbf\u{20000}-\u{2ebef}](?:[-=][\u4e00-\u9fff\u3400-\u4dbf\u{20000}-\u{2ebef}])+)/gu;

      const flushNonCjk = () => {
        if (!nonCjkBuf) return;
        tokens.push({ han: nonCjkBuf, hpp: nonCjkBuf, punct: false, nonCjk: true });
        needCap = false;
        nonCjkBuf = '';
      };

      const flushCjk = () => {
        if (!cjkBuf) return;
        const segments = cjkBuf.split(COMPOUND_RE).filter(Boolean);
        let segCpOffset = cjkStartCp;
        for (const seg of segments) {
          const segCpLen = Array.from(seg).length;
          if (seg.includes('-') || seg.includes('=')) {
            const tok = this._resolveForcedCompound(seg, needCap);
            tok.srcStart = cpToUtf16[segCpOffset];
            tok.srcEnd = cpToUtf16[segCpOffset + segCpLen];
            if (!tok.oov) needCap = false;
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
              tokens.push({
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
              });
              wordCpOffset += wCpLen;
            }
          }
          segCpOffset += segCpLen;
        }
        cjkBuf = '';
        cjkStartCp = -1;
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
        } else if ((ch === '-' || ch === '=') && CJK_CHAR_RE.test(prev) && CJK_CHAR_RE.test(next)) {
          cjkBuf += ch;
        } else if (ch === '+' && CJK_CHAR_RE.test(prev) && CJK_CHAR_RE.test(next)) {
          flushCjk();
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
          if (/[.!?]/.test(mapped)) needCap = true;
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
  }

  function mathLog(x) {
    return Math.log(x);
  }

  root.RomaineAutoEngine = RomaineAutoEngine;
})(typeof globalThis !== 'undefined' ? globalThis : this);
