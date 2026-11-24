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
  let repoVerifiedByKey = new Map();
  let repoVerifiedByCjk = new Map();
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

  function normDialect(d) {
    if (window.RomaineAutoEngine && typeof window.RomaineAutoEngine.normalizeDialect === 'function') {
      return window.RomaineAutoEngine.normalizeDialect(d);
    }
    const ALIAS = {
      sixian: 'xiien',
      nansixian: 'namxiian',
      hailu: 'hoiliug',
      dapu: 'taibu',
      raoping: 'ngiaupin',
      zhaoan: 'zhioon',
    };
    return ALIAS[d] || d || 'xiien';
  }

  function registerVerifiedItem(it, isRepo) {
    if (!it || !it.han) return;
    const d = normDialect((it.cert_ref && it.cert_ref.dialect) || it.dialect || 'xiien');
    const lvl = (it.cert_ref && it.cert_ref.level) || '';
    const id = (it.cert_ref && it.cert_ref.id) || '';
    const cjk = pureCjk(it.han);
    if (id) {
      verifiedByKey.set(`${d}|${lvl}|${id}`, it);
      if (isRepo) repoVerifiedByKey.set(`${d}|${lvl}|${id}`, it);
    }
    if (cjk) {
      verifiedByCjk.set(`${d}|${cjk}`, it);
      if (isRepo) repoVerifiedByCjk.set(`${d}|${cjk}`, it);
    }
  }

  function mergeLocalVerifiedCorpus() {
    let keptCount = 0;
    try {
      const localList = JSON.parse(localStorage.getItem('romaineAutoVerifiedCorpus') || '[]');
      if (Array.isArray(localList)) {
        const kept = [];
        for (const it of localList) {
          if (!it || !it.han) continue;
          const d = normDialect((it.cert_ref && it.cert_ref.dialect) || it.dialect || 'xiien');
          const lvl = (it.cert_ref && it.cert_ref.level) || '';
          const id = (it.cert_ref && it.cert_ref.id) || '';
          const cjk = pureCjk(it.han);
          const repoItem = (id && repoVerifiedByKey.get(`${d}|${lvl}|${id}`)) || (cjk && repoVerifiedByCjk.get(`${d}|${cjk}`));
          const repoTs = repoItem ? (Date.parse(repoItem.updated_at || 0) || 0) : -1;
          const localTs = Date.parse(it.updated_at || 0) || 0;
          if (repoItem && repoTs >= localTs) {
            // Auto-GC：repo 已整合較新或同時間版本，清除本機舊暫存
            continue;
          }
          kept.push(it);
          registerVerifiedItem(it, false);
        }
        keptCount = kept.length;
        if (kept.length !== localList.length) {
          localStorage.setItem('romaineAutoVerifiedCorpus', JSON.stringify(kept));
        }
      }
    } catch {}
    if (window.romaineWorkbench && typeof window.romaineWorkbench.updateLocalCount === 'function') {
      window.romaineWorkbench.updateLocalCount(keptCount);
    }
  }

  async function ensureVerifiedLoaded() {
    if (!verifiedPromise) {
      verifiedPromise = fetch('data/romaine/verified_sentences.json?v=20261123')
        .then((r) => (r.ok ? r.json() : { items: [] }))
        .then((data) => {
          for (const it of data.items || []) registerVerifiedItem(it, true);
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

  function detectDialectFromText(text) {
    if (!text) return null;
    if (text.includes('南四縣')) return 'namxiian';
    if (text.includes('四縣')) return 'xiien';
    if (text.includes('海陸')) return 'hoiliug';
    if (text.includes('大埔')) return 'taibu';
    if (text.includes('饒平')) return 'ngiaupin';
    if (text.includes('詔安')) return 'zhioon';
    return null;
  }

  function detectContextInfo(row) {
    const isComparisonRow = row.classList.contains('accordion-row');
    const dialectCell = row.querySelector('td[data-label="腔調"]');
    const srcTag = row.querySelector('.source-tag');
    const srcText = srcTag ? srcTag.textContent : '';

    let dialect = null;
    if (isComparisonRow || dialectCell) {
      // 跨腔對照展開列（或有明確腔調欄）：只依該列自身腔調判定，絕不回退抓主表腔別
      dialect = detectDialectFromText(dialectCell ? dialectCell.textContent : '') || detectDialectFromText(srcText);
    } else {
      const summaryEl = document.getElementById('summary-text-content');
      const hintText = srcText + ' ' + (summaryEl ? summaryEl.textContent : '');
      dialect = detectDialectFromText(hintText);
      if (!dialect) {
        const params = new URLSearchParams(window.location.search);
        const d = params.get('dialect') || params.get('kiong');
        const CODE_MAP = {
          si: 'xiien',
          na: 'namxiian',
          ha: 'hoiliug',
          da: 'taibu',
          rh: 'ngiaupin',
          zh: 'zhioon',
        };
        if (d && CODE_MAP[d]) dialect = CODE_MAP[d];
      }
    }

    let level = '';
    const levelHint = isComparisonRow
      ? srcText
      : srcText + ' ' + (document.getElementById('summary-text-content')?.textContent || '');
    for (const lvl of ['基礎級', '初級', '中級', '中高級', '高級']) {
      if (levelHint.includes(lvl)) {
        level = lvl;
        break;
      }
    }

    let rowId = '';
    if (!isComparisonRow) {
      const anchor = row.querySelector('td[data-label="編號"] a[name]');
      if (anchor) {
        rowId = anchor.getAttribute('name') || '';
      }
    }
    if (!rowId) {
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
    const dKey = normDialect(dialectKey);
    if (!html || (dKey !== 'xiien' && dKey !== 'ngiaupin')) return html;
    const GENRE_RE = /^\((?:諺|山|歇|俗|童|謠)\)$/;
    return html.replace(/\(([^()]+)\)/g, (match, content) => {
      if (GENRE_RE.test(match)) return match;
      if (dKey === 'xiien') {
        return `<span class="sentence-variant sentence-variant-南">(${content})</span>`;
      }
      if (dKey === 'ngiaupin') {
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

  async function renderRowOverlay(row) {
    const td3 = row.querySelector('td[data-label="例句"]');
    if (!td3) return;
    if (td3.querySelector('.romaine-interleaved')) return;
    const sentSpan = td3.querySelector('.sentence');
    if (!sentSpan) return;

    const { dialect, level, rowId } = detectContextInfo(row);
    if (!dialect) return;

    const hanLines = splitSentenceHtmlLines(sentSpan.innerHTML);
    const tmpDiv = document.createElement('div');
    const sentText = hanLines
      .map((h) => {
        tmpDiv.innerHTML = h;
        return (tmpDiv.textContent || '').trim();
      })
      .join('\n')
      .trim();
    if (!sentText) return;

    const cjkKey = `${dialect}|${pureCjk(sentText)}`;
    const fullKey = rowId && level ? `${dialect}|${level}|${rowId}` : '';
    const verifiedItem = (fullKey && verifiedByKey.get(fullKey)) || verifiedByCjk.get(cjkKey);

    const eng = await getEngine(dialect);
    if (!eng || !enabled) return;
    if (td3.querySelector('.romaine-interleaved')) return;

    const openBookMap = dialect === 'xiien' ? extractRowNanOpenBook(row) : null;
    let rawHppHtml = '';
    let isVerified = false;
    if (verifiedItem) {
      isVerified = true;
      rawHppHtml = renderVerifiedHtml(verifiedItem, eng);
    } else {
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

      if (i === 0) {
        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'romaine-edit-btn';
        editBtn.textContent = '✎';
        editBtn.title = '在工作台校對這句';
        editBtn.setAttribute('aria-label', '在工作台校對這句');
        editBtn.addEventListener('mousedown', stopIconEvent);
        editBtn.addEventListener('mouseup', stopIconEvent);
        editBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (window.romaineWorkbench && typeof window.romaineWorkbench.loadRow === 'function') {
            const td2 = row.querySelector('td[data-label="詞彙"]');
            const wordEl = td2 ? td2.querySelector('.word-text, strong, b') : null;
            window.romaineWorkbench.loadRow({
              han: sentText,
              dialect,
              level,
              rowId,
              word: wordEl ? wordEl.textContent.trim() : '',
              rowEl: row,
              openBookMap,
            });
          }
        });
        hppDiv.appendChild(editBtn);
      }

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
      await renderRowOverlay(row);
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

  function resetRowOverlay(row) {
    if (!row) return;
    for (const el of row.querySelectorAll('.romaine-interleaved')) {
      if (el.nextElementSibling && el.nextElementSibling.dataset.romaineHiddenBr === '1') {
        el.nextElementSibling.style.display = '';
        delete el.nextElementSibling.dataset.romaineHiddenBr;
      }
      el.remove();
    }
    for (const s of row.querySelectorAll('td[data-label="例句"] .sentence')) {
      s.style.display = '';
    }
  }

  async function upsertVerifiedItem(item, rowEl) {
    if (!item || !item.han) return;
    registerVerifiedItem(item, false);
    if (rowEl && enabled) {
      resetRowOverlay(rowEl);
      await renderRowOverlay(rowEl);
    } else if (enabled) {
      refreshFromStorage();
    }
  }

  function refreshFromStorage() {
    verifiedByKey = new Map(repoVerifiedByKey);
    verifiedByCjk = new Map(repoVerifiedByCjk);
    mergeLocalVerifiedCorpus();
    const generated = document.getElementById('generated');
    if (generated) {
      for (const row of generated.querySelectorAll('tr')) {
        resetRowOverlay(row);
      }
      scheduleApply();
    }
  }

  function getVerifiedItem(dialect, level, rowId, han) {
    const d = normDialect(dialect || 'xiien');
    if (rowId && level) {
      const byKey = verifiedByKey.get(`${d}|${level}|${rowId}`);
      if (byKey) return byKey;
    }
    const cjk = pureCjk(han);
    return cjk ? verifiedByCjk.get(`${d}|${cjk}`) || null : null;
  }

  window.romaineTableOverlay = {
    upsertVerifiedItem,
    refreshFromStorage,
    getVerifiedItem,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
