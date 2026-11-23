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

  function extractInlineNoSandhiSet(rawHan) {
    const set = new Set();
    const cleaned = (rawHan || '').replace(/%%[\s\S]*?%%/g, '');
    const chars = Array.from(cleaned);
    let cjkIdx = -1;
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      if (CJK_RE.test(ch)) {
        cjkIdx++;
      } else if ((ch === '#' || ch === '~') && cjkIdx >= 0) {
        set.add(cjkIdx);
      }
    }
    return set;
  }

  function registerVerifiedItem(it) {
    if (!it || !it.cert_ref || !it.cert_ref.id) return;
    const d = it.cert_ref.dialect || it.dialect || 'sixian';
    const lvl = it.cert_ref.level || '';
    const id = it.cert_ref.id;
    verifiedByKey.set(`${d}|${lvl}|${id}`, it);
    const cjk = pureCjk(it.han);
    if (cjk) verifiedByCjk.set(`${d}|${cjk}`, it);
  }

  function mergeLocalVerifiedCorpus() {
    try {
      const localList = JSON.parse(localStorage.getItem('romaineAutoVerifiedCorpus') || '[]');
      if (Array.isArray(localList)) {
        for (const it of localList) registerVerifiedItem(it);
      }
    } catch {}
  }

  async function ensureVerifiedLoaded() {
    if (!verifiedPromise) {
      verifiedPromise = fetch('data/romaine/verified_sentences.json?v=20261123')
        .then((r) => (r.ok ? r.json() : { items: [] }))
        .then((data) => {
          for (const it of data.items || []) registerVerifiedItem(it);
        })
        .catch(() => {});
    }
    await verifiedPromise;
    mergeLocalVerifiedCorpus();
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
    const inlineNoSandhi = extractInlineNoSandhiSet(item.han);
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
      let ns = t.noSandhi || t.no_sandhi;
      if (!ns && inlineNoSandhi.size > 0) {
        const flags = [];
        for (let k = 0; k < cLen; k++) {
          flags.push(inlineNoSandhi.has(pureIdx + k));
        }
        if (flags.some(Boolean)) ns = flags;
      }
      pureIdx += cLen;
      return {
        ...t,
        noSandhi: ns,
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
    return (html || '')
      .split(/<br\s*\/?>/i)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  let activeTipEl = null;
  let activeTipTarget = null;
  let activeTipTimer = null;

  function closeStatusTip() {
    if (activeTipTimer) {
      clearTimeout(activeTipTimer);
      activeTipTimer = null;
    }
    if (activeTipEl) {
      activeTipEl.remove();
      activeTipEl = null;
    }
    activeTipTarget = null;
  }

  function showStatusTip(targetEl, text) {
    if (!targetEl || !text) return;
    if (activeTipTarget === targetEl && activeTipEl) {
      closeStatusTip();
      return;
    }
    closeStatusTip();
    const tip = document.createElement('div');
    tip.className = 'romaine-status-tip';
    tip.textContent = text;
    document.body.appendChild(tip);
    const rect = targetEl.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();
    let left = rect.left + rect.width / 2 - tipRect.width / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - tipRect.width - 8));
    let top = rect.top - tipRect.height - 8;
    if (top < 8) top = rect.bottom + 8;
    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(top)}px`;
    activeTipEl = tip;
    activeTipTarget = targetEl;
    activeTipTimer = setTimeout(closeStatusTip, 3800);
  }

  function getNoSandhiMarkerPref() {
    if (window.RomaineAutoEngine && typeof window.RomaineAutoEngine.getNoSandhiMarker === 'function') {
      return window.RomaineAutoEngine.getNoSandhiMarker();
    }
    try {
      return localStorage.getItem('romaineNoSandhiMarker') === '#' ? '#' : '~';
    } catch {
      return '~';
    }
  }

  function setNoSandhiMarkerPref(val) {
    if (window.RomaineAutoEngine && typeof window.RomaineAutoEngine.setNoSandhiMarker === 'function') {
      return window.RomaineAutoEngine.setNoSandhiMarker(val);
    }
    const m = val === '#' ? '#' : '~';
    try {
      localStorage.setItem('romaineNoSandhiMarker', m);
    } catch {}
    return m;
  }

  function getUnverifiedItalicPref() {
    if (window.RomaineAutoEngine && typeof window.RomaineAutoEngine.getUnverifiedItalic === 'function') {
      return window.RomaineAutoEngine.getUnverifiedItalic();
    }
    try {
      const v = localStorage.getItem('romaineUnverifiedItalic');
      return v === null ? true : v !== 'false';
    } catch {
      return true;
    }
  }

  function setUnverifiedItalicPref(flag) {
    if (window.RomaineAutoEngine && typeof window.RomaineAutoEngine.setUnverifiedItalic === 'function') {
      return window.RomaineAutoEngine.setUnverifiedItalic(flag);
    }
    const b = Boolean(flag);
    try {
      localStorage.setItem('romaineUnverifiedItalic', String(b));
    } catch {}
    return b;
  }

  function getTrustUnderlinePref() {
    if (window.RomaineAutoEngine && typeof window.RomaineAutoEngine.getTrustUnderline === 'function') {
      return window.RomaineAutoEngine.getTrustUnderline();
    }
    try {
      return localStorage.getItem('romaineTrustUnderline') === 'true';
    } catch {
      return false;
    }
  }

  function setTrustUnderlinePref(flag) {
    if (window.RomaineAutoEngine && typeof window.RomaineAutoEngine.setTrustUnderline === 'function') {
      return window.RomaineAutoEngine.setTrustUnderline(flag);
    }
    const b = Boolean(flag);
    try {
      localStorage.setItem('romaineTrustUnderline', String(b));
    } catch {}
    return b;
  }

  function applyNoSandhiMarkerToDom() {
    const sym = getNoSandhiMarkerPref();
    for (const rt of document.querySelectorAll('#generated .romaine-auto-hpp ruby.sandhi-none > rt')) {
      rt.textContent = sym;
    }
  }

  function applyUnverifiedItalicToDom() {
    const useItalic = getUnverifiedItalicPref();
    if (document.body) {
      document.body.classList.toggle('romaine-no-italic-auto', !useItalic);
    }
  }

  function applyTrustUnderlineToDom() {
    const useUnderline = getTrustUnderlinePref();
    if (document.body) {
      document.body.classList.toggle('romaine-trust-underline', useUnderline);
    }
  }

  function syncSettingsControls() {
    const sym = getNoSandhiMarkerPref();
    for (const r of document.querySelectorAll('input[name="romaineNoSandhiMarker"]')) {
      r.checked = r.value === sym;
    }
    const italicChk = document.getElementById('romaineUnverifiedItalicToggle');
    if (italicChk) {
      italicChk.checked = getUnverifiedItalicPref();
    }
    const underlineChk = document.getElementById('romaineTrustUnderlineToggle');
    if (underlineChk) {
      underlineChk.checked = getTrustUnderlinePref();
    }
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
        const statusTitle = isVerified
          ? '作者已初校（待社群回報確認）'
          : '單純程式產生，還毋曾經過人工檢驗，請細義使用！';
        hppTextSpan.title = statusTitle;
        const hppLineHtml = hppLines[i] !== undefined ? hppLines[i] : '';
        hppTextSpan.innerHTML = applyHppVariantColors(hppLineHtml, dialect);
        hppDiv.appendChild(hppTextSpan);

        const statusIcon = document.createElement('button');
        statusIcon.type = 'button';
        statusIcon.className = 'romaine-status-icon ' + (isVerified ? 'verified' : 'auto');
        statusIcon.textContent = 'i';
        statusIcon.title = statusTitle;
        statusIcon.setAttribute('aria-label', statusTitle);
        const stopIconEvent = (e) => {
          e.stopPropagation();
        };
        statusIcon.addEventListener('mousedown', stopIconEvent);
        statusIcon.addEventListener('mouseup', stopIconEvent);
        statusIcon.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          showStatusTip(statusIcon, statusTitle);
        });
        hppDiv.appendChild(statusIcon);

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
    }
  }

  function scheduleApply() {
    clearTimeout(applyTimer);
    applyTimer = setTimeout(() => {
      applyToTable().catch((err) => console.warn('[romaine-table-overlay]', err));
    }, 60);
  }

  function init() {
    document.addEventListener('click', (e) => {
      if (activeTipEl && activeTipTarget && !activeTipTarget.contains(e.target)) {
        closeStatusTip();
      }
    });
    window.addEventListener('scroll', closeStatusTip, { passive: true });
    applyUnverifiedItalicToDom();
    applyTrustUnderlineToDom();
    syncSettingsControls();

    for (const r of document.querySelectorAll('input[name="romaineNoSandhiMarker"]')) {
      r.addEventListener('change', () => {
        if (r.checked) {
          setNoSandhiMarkerPref(r.value);
          applyNoSandhiMarkerToDom();
        }
      });
    }

    const italicChk = document.getElementById('romaineUnverifiedItalicToggle');
    if (italicChk) {
      italicChk.addEventListener('change', () => {
        setUnverifiedItalicPref(italicChk.checked);
        applyUnverifiedItalicToDom();
      });
    }

    const underlineChk = document.getElementById('romaineTrustUnderlineToggle');
    if (underlineChk) {
      underlineChk.addEventListener('change', () => {
        setTrustUnderlinePref(underlineChk.checked);
        applyTrustUnderlineToDom();
      });
    }

    const settingsBtn = document.getElementById('settingsBtn');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', syncSettingsControls);
    }

    window.addEventListener('romainePrefsChanged', () => {
      syncSettingsControls();
      applyUnverifiedItalicToDom();
      applyTrustUnderlineToDom();
      applyNoSandhiMarkerToDom();
    });

    window.addEventListener('storage', (e) => {
      if (e && e.key === 'romaineAutoVerifiedCorpus') {
        for (const el of document.querySelectorAll('#generated .romaine-interleaved')) {
          if (el.nextElementSibling && el.nextElementSibling.dataset.romaineHiddenBr === '1') {
            el.nextElementSibling.style.display = '';
            delete el.nextElementSibling.dataset.romaineHiddenBr;
          }
          el.remove();
        }
        for (const s of document.querySelectorAll('#generated td[data-label="例句"] .sentence')) {
          s.style.display = '';
        }
        scheduleApply();
      }
    });

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
