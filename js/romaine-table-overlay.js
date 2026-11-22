/**
 * js/romaine-table-overlay.js
 * 主站主表「例句自動羅馬字＋Sandhi」實驗開關（feat/romaine-auto-table）：
 *   - 優先顯示 data/romaine/verified_sentences.json（人工校對黃金語料：含 # + - = 與註解）
 *   - 其餘例句由 RomaineAutoEngine 即時產生 HPP + Sandhi（四縣／詔安）
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'romaineAutoSentenceEnabled';
  const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf\u{20000}-\u{2ebef}]/u;

  let enabled = localStorage.getItem(STORAGE_KEY) !== 'false';
  let verifiedPromise = null;
  let verifiedByKey = new Map();
  let verifiedByCjk = new Map();
  const engines = new Map();
  let observer = null;
  let applyTimer = null;

  function pureCjk(str) {
    return Array.from((str || '').replace(/%%[\s\S]*?%%/g, ''))
      .filter((c) => CJK_RE.test(c))
      .join('');
  }

  function extractInlineBoundaryOps(rawHan) {
    const ops = new Map();
    const cleaned = (rawHan || '').replace(/%%[\s\S]*?%%/g, '');
    const chars = Array.from(cleaned);
    let cjkIdx = -1;
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      if (CJK_RE.test(ch)) {
        cjkIdx++;
      } else if ((ch === '+' || ch === '=') && cjkIdx >= 0) {
        ops.set(cjkIdx, ch === '+' ? 'space' : 'hyphen');
      }
    }
    return ops;
  }

  async function ensureVerifiedLoaded() {
    if (verifiedPromise) return verifiedPromise;
    verifiedPromise = fetch('data/romaine/verified_sentences.json')
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((data) => {
        for (const it of data.items || []) {
          if (it.cert_ref && it.cert_ref.id) {
            const d = it.cert_ref.dialect || it.dialect || 'sixian';
            const lvl = it.cert_ref.level || '';
            const id = it.cert_ref.id;
            verifiedByKey.set(`${d}|${lvl}|${id}`, it);
            const cjk = pureCjk(it.han);
            if (cjk) verifiedByCjk.set(`${d}|${cjk}`, it);
          }
        }
      })
      .catch(() => {});
    return verifiedPromise;
  }

  async function getEngine(dialectKey) {
    if (typeof window.RomaineAutoEngine !== 'function') return null;
    if (!engines.has(dialectKey)) {
      const eng = new window.RomaineAutoEngine();
      const p = eng.init('.', dialectKey).then(() => eng);
      engines.set(dialectKey, p);
    }
    return engines.get(dialectKey);
  }

  function detectContextInfo(row) {
    const srcTag = row.querySelector('.source-tag');
    const summaryEl = document.getElementById('summary-text-content');
    const hintText = (srcTag ? srcTag.textContent : '') + ' ' + (summaryEl ? summaryEl.textContent : '');
    let dialect = null;
    if (hintText.includes('詔安')) dialect = 'zhaoan';
    else if (hintText.includes('四縣')) dialect = 'sixian';
    else {
      const params = new URLSearchParams(window.location.search);
      const d = params.get('dialect') || params.get('kiong');
      if (d === 'zh') dialect = 'zhaoan';
      else if (d === 'si') dialect = 'sixian';
    }

    let level = '';
    for (const lvl of ['基礎級', '初級', '中級', '中高級', '高級']) {
      if (hintText.includes(lvl)) {
        level = lvl;
        break;
      }
    }

    let rowId = '';
    const anchor = row.querySelector('td[data-label="編號"] a[name]');
    if (anchor) {
      rowId = anchor.getAttribute('name') || '';
    } else {
      const favBtn = row.querySelector('.fav-btn[data-fav-id]');
      if (favBtn) {
        const m = (favBtn.dataset.favId || '').match(/(\d+-\d+):/);
        if (m) rowId = m[1];
      }
    }
    return { dialect, level, rowId };
  }

  function renderVerifiedHtml(item, eng) {
    if (!item || !item.tokens || !eng) return item ? item.joined_hpp || '' : '';
    const inlineOps = extractInlineBoundaryOps(item.han);
    let pureIdx = 0;
    const toks = item.tokens.map((t) => {
      if (t.punct || t.nonCjk || t.comment) return t;
      const cLen = Array.from(t.han || '').filter((c) => CJK_RE.test(c)).length;
      let sb = t.sylBoundaries || t.syl_boundaries;
      if (!sb && cLen > 1 && inlineOps.size > 0) {
        const derived = new Array(cLen - 1).fill('normal');
        let hasOp = false;
        for (let k = 0; k < cLen - 1; k++) {
          const op = inlineOps.get(pureIdx + k);
          if (op) {
            derived[k] = op;
            hasOp = true;
          }
        }
        if (hasOp) sb = derived;
      }
      pureIdx += cLen;
      return {
        ...t,
        noSandhi: t.noSandhi || t.no_sandhi,
        sylBoundaries: sb,
      };
    });
    return eng.formatTokensToSandhiHtml(toks, 'none');
  }

  function applyHppVariantColors(html, dialectKey) {
    if (!html || (dialectKey !== 'sixian' && dialectKey !== 'raoping')) return html;
    const GENRE_RE = /^\((?:諺|山|歇|俗|童|謠)\)$/;
    return html.replace(/\(([^()]+)\)/g, (match, content) => {
      if (GENRE_RE.test(match)) return match;
      if (dialectKey === 'sixian') {
        return `<span class="sentence-variant sentence-variant-南">(${content})</span>`;
      }
      if (dialectKey === 'raoping') {
        if (content.includes('/')) {
          const parts = content.split('/');
          const zhuolan = parts[0] ? parts[0].trim() : '';
          const taoyuan = parts.slice(1).join('/').trim();
          return `<span class="sentence-variant sentence-variant-卓">(${zhuolan}</span><span class="sentence-variant sentence-variant-卓桃">/</span><span class="sentence-variant sentence-variant-桃">${taoyuan})</span>`;
        }
        return `<span class="sentence-variant sentence-variant-卓桃">(${content})</span>`;
      }
      return match;
    });
  }

  function extractRowNanOpenBook(row) {
    const map = new Map();
    const td2 = row.querySelector('td[data-label="詞彙"]');
    if (!td2) return map;
    const nanVar = td2.querySelector('.variant-label-南');
    if (nanVar) {
      const txt = nanVar.textContent.replace(/[（）()]/g, '').trim();
      const wordEl = td2.querySelector('.word-text, strong, b');
      const pronEl = td2.querySelector('.pronunciation-text');
      if (pronEl) {
        const pTxt = pronEl.textContent.replace(/【南】/g, '').trim();
        const m = txt || (wordEl ? wordEl.textContent.trim() : '');
        if (m && pTxt) map.set(m, pTxt);
      }
    }
    return map;
  }

  function splitSentenceHtmlLines(html) {
    const rawBrLines = (html || '').split(/<br\s*\/?>/i);
    const out = [];
    for (const bl of rawBrLines) {
      const parts = bl
        .split(/(?<=[。！？][」』）)]*)\s*(?=(?:<(?:span|mark)[^>]*>)?[^\s<])/)
        .filter((p) => p && p.trim());
      if (parts.length) out.push(...parts);
      else if (bl.trim()) out.push(bl.trim());
    }
    return out;
  }

  function updateToggleButton() {
    const btn = document.getElementById('autoSentenceHppBtn');
    if (!btn) return;
    btn.classList.toggle('is-active', enabled);
    btn.setAttribute('aria-pressed', String(enabled));
  }

  async function applyToTable() {
    const generated = document.getElementById('generated');
    if (!generated) return;

    if (!enabled) {
      for (const el of generated.querySelectorAll('.romaine-interleaved')) {
        if (el.nextElementSibling && el.nextElementSibling.dataset.romaineHiddenBr === '1') {
          el.nextElementSibling.style.display = '';
          delete el.nextElementSibling.dataset.romaineHiddenBr;
        }
        el.remove();
      }
      for (const s of generated.querySelectorAll('td[data-label="例句"] .sentence')) {
        s.style.display = '';
      }
      for (const ts of generated.querySelectorAll('td[data-label="例句"] > span[data-romaine-orig-html]')) {
        ts.innerHTML = ts.dataset.romaineOrigHtml;
        delete ts.dataset.romaineOrigHtml;
      }
      return;
    }

    await ensureVerifiedLoaded();

    const rows = Array.from(generated.querySelectorAll('tr'));
    for (const row of rows) {
      const td3 = row.querySelector('td[data-label="例句"]');
      if (!td3) continue;
      if (td3.querySelector('.romaine-interleaved')) continue;
      const sentSpan = td3.querySelector('.sentence');
      if (!sentSpan) continue;

      const { dialect, level, rowId } = detectContextInfo(row);
      if (!dialect) continue;

      const hanLines = splitSentenceHtmlLines(sentSpan.innerHTML);
      const tmpDiv = document.createElement('div');
      const sentText = hanLines
        .map((h) => {
          tmpDiv.innerHTML = h;
          return (tmpDiv.textContent || '').trim();
        })
        .join('\n')
        .trim();
      if (!sentText) continue;

      const cjkKey = `${dialect}|${pureCjk(sentText)}`;
      const fullKey = rowId && level ? `${dialect}|${level}|${rowId}` : '';
      const verifiedItem = (fullKey && verifiedByKey.get(fullKey)) || verifiedByCjk.get(cjkKey);

      const eng = await getEngine(dialect);
      if (!eng || !enabled) continue;
      if (td3.querySelector('.romaine-interleaved')) continue;

      let rawHppHtml = '';
      let isVerified = false;
      if (verifiedItem) {
        isVerified = true;
        rawHppHtml = renderVerifiedHtml(verifiedItem, eng);
      } else {
        const openBookMap = dialect === 'sixian' ? extractRowNanOpenBook(row) : null;
        const toks = eng.segmentAndConvert(sentText, openBookMap);
        rawHppHtml = eng.formatTokensToSandhiHtml(toks, 'none');
      }

      // 依斷行配對：每句「羅馬字在上、諸夏字在下」（配合 td2 詞音位置）
      const hppLines = rawHppHtml.split('\n');
      const pairCount = Math.max(hanLines.length, hppLines.length);

      const container = document.createElement('div');
      container.className = 'romaine-interleaved';

      for (let i = 0; i < pairCount; i++) {
        const pair = document.createElement('div');
        pair.className = 'romaine-pair ' + (isVerified ? 'is-verified' : 'is-auto');

        const hppDiv = document.createElement('div');
        hppDiv.className = 'romaine-auto-hpp';
        const hppTextSpan = document.createElement('span');
        hppTextSpan.className = 'romaine-auto-hpp-text';
        hppTextSpan.title = isVerified
          ? '作者已初校（dotted）'
          : '單純程式產生，還毋曾經過人工檢驗，請細義使用！';
        const hppLineHtml = hppLines[i] !== undefined ? hppLines[i] : '';
        hppTextSpan.innerHTML = applyHppVariantColors(hppLineHtml, dialect);
        hppDiv.appendChild(hppTextSpan);

        if (i === pairCount - 1 && isVerified && verifiedItem.note) {
          const qBtn = document.createElement('button');
          qBtn.type = 'button';
          qBtn.className = 'romaine-note-toggle';
          qBtn.textContent = '？';
          qBtn.title = '檢視校對註解';
          qBtn.setAttribute('aria-expanded', 'false');
          hppDiv.appendChild(qBtn);

          const noteEl = document.createElement('p');
          noteEl.className = 'notes romaine-auto-note';
          noteEl.style.display = 'none';
          const escNote = verifiedItem.note
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\n/g, '<br>');
          noteEl.innerHTML = `（${escNote}）`;

          const stopAll = (e) => {
            e.stopPropagation();
          };
          qBtn.addEventListener('mousedown', stopAll);
          qBtn.addEventListener('mouseup', stopAll);
          qBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const isOpen = noteEl.style.display !== 'none';
            noteEl.style.display = isOpen ? 'none' : 'block';
            qBtn.setAttribute('aria-expanded', String(!isOpen));
            qBtn.classList.toggle('is-open', !isOpen);
          });

          pair.appendChild(hppDiv);
          const hanDiv = document.createElement('div');
          hanDiv.className = 'romaine-han-line sentence';
          hanDiv.innerHTML = hanLines[i] !== undefined ? hanLines[i] : '';
          pair.appendChild(hanDiv);
          pair.appendChild(noteEl);
        } else {
          pair.appendChild(hppDiv);
          const hanDiv = document.createElement('div');
          hanDiv.className = 'romaine-han-line sentence';
          hanDiv.innerHTML = hanLines[i] !== undefined ? hanLines[i] : '';
          pair.appendChild(hanDiv);
        }
        container.appendChild(pair);
      }

      sentSpan.style.display = 'none';
      sentSpan.insertAdjacentElement('afterend', container);
      if (container.nextElementSibling && container.nextElementSibling.tagName === 'BR') {
        container.nextElementSibling.style.display = 'none';
        container.nextElementSibling.dataset.romaineHiddenBr = '1';
      }

      const transSpan = Array.from(td3.children).find(
        (el) => el.tagName === 'SPAN' && !el.classList.contains('sentence')
      );
      if (transSpan && !transSpan.dataset.romaineOrigHtml) {
        transSpan.dataset.romaineOrigHtml = transSpan.innerHTML;
        transSpan.innerHTML = splitSentenceHtmlLines(transSpan.innerHTML).join('<br>');
      }
    }
  }

  function scheduleApply() {
    clearTimeout(applyTimer);
    applyTimer = setTimeout(() => {
      applyToTable().catch((err) => console.warn('[romaine-table-overlay]', err));
    }, 60);
  }

  function init() {
    const btn = document.getElementById('autoSentenceHppBtn');
    if (btn) {
      updateToggleButton();
      btn.addEventListener('click', () => {
        enabled = !enabled;
        localStorage.setItem(STORAGE_KEY, String(enabled));
        updateToggleButton();
        scheduleApply();
      });
    }

    const generated = document.getElementById('generated');
    if (generated) {
      observer = new MutationObserver((mutations) => {
        const hasRelevant = mutations.some((m) =>
          Array.from(m.addedNodes).some(
            (n) =>
              n.nodeType === 1 &&
              !n.classList.contains('romaine-interleaved') &&
              !n.closest?.('.romaine-interleaved')
          )
        );
        if (hasRelevant) scheduleApply();
      });
      observer.observe(generated, { childList: true, subtree: true });
      scheduleApply();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
