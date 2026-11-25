/**
 * js/romaine-workbench.js
 * 主頁右側「蘿蔓生菜工作台」：
 *   - 取代舊版 #romanizerContainer 彈窗，由 #header #showRomanizerBtn 開關
 *   - 寬螢幕為右側 sticky 分欄；窄螢幕（手機）為底部可展開抽屜
 *   - 支援自由輸入詞句轉換，也支援直接點選主表例句 ✎ 即時編輯並回存 localStorage
 *   - 回存後即時重繪左側對應列，不須重整頁面
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'romaineAutoVerifiedCorpus';
  const RAOPING_TRACKS_KEY = 'romaineRaopingTracks';
  const CJK_CHAR_TEST_RE = /[\u4e00-\u9fff\u3400-\u4dbf\u{20000}-\u{2ebef}]/u;

  function loadRaopingTracks() {
    if (window.RomaineAutoEngine && typeof window.RomaineAutoEngine.getRaopingTracks === 'function') {
      return window.RomaineAutoEngine.getRaopingTracks();
    }
    const order = ['zhuk', 'zhuolan', 'taoyuan'];
    try {
      const raw = JSON.parse(localStorage.getItem(RAOPING_TRACKS_KEY) || '["zhuk","zhuolan","taoyuan"]');
      if (Array.isArray(raw)) {
        const filtered = order.filter((k) => raw.includes(k));
        if (filtered.length > 0) return filtered;
      }
    } catch {}
    return order.slice();
  }

  function saveRaopingTracks(tracks) {
    if (window.RomaineAutoEngine && typeof window.RomaineAutoEngine.setRaopingTracks === 'function') {
      return window.RomaineAutoEngine.setRaopingTracks(tracks);
    }
    try {
      localStorage.setItem(RAOPING_TRACKS_KEY, JSON.stringify(tracks));
    } catch {}
    return tracks;
  }

  const DIALECT_OPTIONS = [
    { key: 'xiien', label: '四縣' },
    { key: 'namxiian', label: '南四縣' },
    { key: 'hoiliug', label: '海陸' },
    { key: 'taibu', label: '大埔' },
    { key: 'ngiaupin', label: '饒平' },
    { key: 'zhioon', label: '詔安' },
  ];

  const DIALECT_NAME_TO_KEY = {
    四縣: 'xiien',
    北四縣: 'xiien',
    南四縣: 'namxiian',
    '南四縣（美濃）': 'namxiian',
    海陸: 'hoiliug',
    大埔: 'taibu',
    饒平: 'ngiaupin',
    '饒平（新竹）': 'ngiaupin',
    '饒平（卓蘭）': 'ngiaupin',
    '饒平（桃園）': 'ngiaupin',
    詔安: 'zhioon',
  };

  let isOpen = false;
  let isExpandedMobile = false;
  let engine = null;
  let engineDialect = null;
  let currentTokens = [];
  let prevPureCjk = [];
  let manualCharOverrides = new Map();
  let activeCertRef = null;
  let activeRowEl = null;
  let activeOpenBookMap = null;
  let inputDebounceTimer = null;

  // DOM refs (created lazily on init)
  let paneEl = null;
  let candPopupEl = null;
  let dialectSel = null;
  let autoChk = null;
  let sandhiChk = null;
  let joinSel = null;
  let inputEl = null;
  let tokensEl = null;
  let outputEl = null;
  let noteEl = null;
  let certBadgeEl = null;
  let statusEl = null;
  let localCountEl = null;
  let importFileEl = null;
  let raopingBarEl = null;
  let raopingTracks = loadRaopingTracks();

  function normDialect(d) {
    if (DIALECT_NAME_TO_KEY[d]) return DIALECT_NAME_TO_KEY[d];
    if (window.RomaineAutoEngine && typeof window.RomaineAutoEngine.normalizeDialect === 'function') {
      return window.RomaineAutoEngine.normalizeDialect(d);
    }
    return d || 'xiien';
  }

  function loadVerifiedList() {
    try {
      const list = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  function saveVerifiedList(list) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      console.warn('[romaine-workbench] localStorage save failed:', e);
    }
    updateLocalCount(list.length);
  }

  function updateLocalCount(count) {
    if (!localCountEl) return;
    const n = typeof count === 'number' ? count : loadVerifiedList().length;
    localCountEl.textContent = n > 0 ? `未整合 ${n} 筆` : '無本機暫存';
    localCountEl.classList.toggle('has-pending', n > 0);
  }

  function buildDom() {
    paneEl = document.getElementById('romaineWorkbenchPane');
    if (!paneEl) return false;

    paneEl.innerHTML = `
      <div class="wb-header">
        <div class="wb-title-row">
          <span class="wb-title">🌿 蘿蔓生菜工作台</span>
          <span class="wb-cert-badge" id="wbCertBadge">自由輸入</span>
        </div>
        <div class="wb-header-actions">
          <button type="button" class="wb-icon-btn wb-expand-btn" id="wbExpandBtn" title="展開／收合高度" aria-label="展開或收合工作台">⇕</button>
          <button type="button" class="wb-icon-btn" id="wbCloseBtn" title="關閉工作台" aria-label="關閉工作台">&times;</button>
        </div>
      </div>

      <div class="wb-toolbar">
        <select id="wbDialectSelect" aria-label="選擇腔調">
          ${DIALECT_OPTIONS.map((d) => `<option value="${d.key}">${d.label}</option>`).join('')}
        </select>
        <select id="wbJoiningMode" aria-label="連寫模式">
          <option value="none">連寫（無空格）</option>
          <option value="hyphen">連字號（-）</option>
          <option value="space">分音節（空格）</option>
        </select>
        <label class="wb-check"><input type="checkbox" id="wbAutoToggle" checked /> 自動斷詞</label>
        <label class="wb-check"><input type="checkbox" id="wbSandhiToggle" checked /> 變調色</label>
      </div>

      <div class="wb-raoping-bar" id="wbRaopingBar" style="display:none;">
        <span class="wb-raoping-title">饒平地區：</span>
        <label class="wb-raoping-chip"><input type="checkbox" value="zhuk" /><span class="variant-label variant-label-竹">竹</span>新竹</label>
        <label class="wb-raoping-chip"><input type="checkbox" value="zhuolan" /><span class="variant-label variant-label-卓">卓</span>卓蘭</label>
        <label class="wb-raoping-chip"><input type="checkbox" value="taoyuan" /><span class="variant-label variant-label-桃">桃</span>桃園</label>
      </div>

      <div class="wb-section">
        <textarea id="wbInputHan" rows="3" placeholder="輸入客話漢字，或點左側例句「✎」載入校對…&#10;控制符：- 強制連詞 / = 加連字號 / + 斷開 / ~ 或 # 不變調 / %%註解%%"></textarea>
        <div class="wb-input-actions">
          <button type="button" id="wbConvertBtn" class="wb-btn">重新斷詞</button>
          <span class="wb-status" id="wbStatusLine">準備就緒</span>
        </div>
      </div>

      <div class="wb-section">
        <div class="wb-label">詞彙切分與讀音微調（點詞片換音、右上 U/l 切換大小寫）</div>
        <div class="wb-tokens-wrap" id="wbTokensWrap"></div>
      </div>

      <div class="wb-section">
        <div class="wb-output-head">
          <span class="wb-label">羅馬字輸出（HPP）</span>
          <button type="button" id="wbCopyBtn" class="wb-btn wb-btn-sm">複製</button>
        </div>
        <div class="wb-output-box" id="wbOutputHpp"></div>
      </div>

      <div class="wb-section">
        <input type="text" id="wbNoteInput" class="wb-note-input" placeholder="校對備註（選填，將附於例句「？」按鈕）" />
      </div>

      <div class="wb-footer">
        <button type="button" id="wbSaveBtn" class="wb-btn wb-btn-primary">儲存／核可</button>
        <button type="button" id="wbExportBtn" class="wb-btn">匯出 JSON</button>
        <button type="button" id="wbImportBtn" class="wb-btn">匯入 JSON</button>
        <input type="file" id="wbImportFile" accept=".json,application/json" style="display:none" />
        <span class="wb-local-badge" id="wbLocalCountBadge">無本機暫存</span>
      </div>
    `;

    candPopupEl = document.createElement('div');
    candPopupEl.id = 'wbCandPopup';
    candPopupEl.className = 'wb-cand-popup';
    document.body.appendChild(candPopupEl);

    dialectSel = document.getElementById('wbDialectSelect');
    autoChk = document.getElementById('wbAutoToggle');
    sandhiChk = document.getElementById('wbSandhiToggle');
    joinSel = document.getElementById('wbJoiningMode');
    inputEl = document.getElementById('wbInputHan');
    tokensEl = document.getElementById('wbTokensWrap');
    outputEl = document.getElementById('wbOutputHpp');
    noteEl = document.getElementById('wbNoteInput');
    certBadgeEl = document.getElementById('wbCertBadge');
    statusEl = document.getElementById('wbStatusLine');
    localCountEl = document.getElementById('wbLocalCountBadge');
    importFileEl = document.getElementById('wbImportFile');
    raopingBarEl = document.getElementById('wbRaopingBar');

    if (tokensEl) {
      tokensEl.addEventListener('pointerover', (e) => {
        const chip = e.target.closest('.wb-tok-chip:not(.punct):not(.comment)');
        for (const el of tokensEl.querySelectorAll('.wb-tok-chip.is-hovered')) {
          if (el !== chip) el.classList.remove('is-hovered');
        }
        if (chip) chip.classList.add('is-hovered');
      });
      tokensEl.addEventListener('pointerout', (e) => {
        const chip = e.target.closest('.wb-tok-chip');
        if (chip && (!e.relatedTarget || !chip.contains(e.relatedTarget))) {
          chip.classList.remove('is-hovered');
        }
      });
    }

    if (raopingBarEl) {
      const chks = Array.from(raopingBarEl.querySelectorAll('input[type="checkbox"]'));
      const syncChks = () => {
        chks.forEach((c) => {
          c.checked = raopingTracks.includes(c.value);
        });
      };
      syncChks();
      chks.forEach((c) => {
        c.addEventListener('change', () => {
          const order = ['zhuk', 'zhuolan', 'taoyuan'];
          const checked = chks.filter((x) => x.checked).map((x) => x.value);
          if (!checked.length) {
            c.checked = true;
            return;
          }
          raopingTracks = order.filter((k) => checked.includes(k));
          saveRaopingTracks(raopingTracks);
          render();
        });
      });
    }

    const savedJoin = localStorage.getItem('romanizerJoiningMode');
    if (savedJoin && ['none', 'hyphen', 'space'].includes(savedJoin)) {
      joinSel.value = savedJoin;
    }

    document.getElementById('wbCloseBtn').addEventListener('click', close);
    document.getElementById('wbExpandBtn').addEventListener('click', () => {
      isExpandedMobile = !isExpandedMobile;
      paneEl.classList.toggle('is-expanded', isExpandedMobile);
    });

    dialectSel.addEventListener('change', async () => {
      await ensureEngine(dialectSel.value);
      manualCharOverrides.clear();
      runConvert();
    });

    joinSel.addEventListener('change', () => {
      localStorage.setItem('romanizerJoiningMode', joinSel.value);
      render();
    });

    sandhiChk.addEventListener('change', render);

    document.getElementById('wbConvertBtn').addEventListener('click', () => {
      manualCharOverrides.clear();
      runConvert();
    });

    inputEl.addEventListener('input', () => {
      clearTimeout(inputDebounceTimer);
      inputDebounceTimer = setTimeout(() => {
        if (autoChk.checked) runConvert();
      }, 150);
    });

    document.getElementById('wbCopyBtn').addEventListener('click', async () => {
      const txt = getPlainJoinedOutput();
      if (!txt) return;
      try {
        await navigator.clipboard.writeText(txt);
        setStatus('已複製 HPP 結果');
      } catch {
        setStatus('複製失敗，請手動選取');
      }
    });

    document.getElementById('wbSaveBtn').addEventListener('click', saveCurrentItem);
    document.getElementById('wbExportBtn').addEventListener('click', exportJson);
    document.getElementById('wbImportBtn').addEventListener('click', () => importFileEl.click());
    importFileEl.addEventListener('change', handleImportFile);

    document.addEventListener('click', (e) => {
      if (candPopupEl && candPopupEl.style.display === 'block') {
        if (!candPopupEl.contains(e.target) && !e.target.closest('.wb-tok-chip')) {
          candPopupEl.style.display = 'none';
        }
      }
    });

    window.addEventListener('romainePrefsChanged', () => {
      raopingTracks = loadRaopingTracks();
      if (raopingBarEl) {
        raopingBarEl.querySelectorAll('input[type="checkbox"]').forEach((c) => {
          c.checked = raopingTracks.includes(c.value);
        });
      }
      if (isOpen) render();
    });

    updateLocalCount();
    return true;
  }

  function setStatus(msg) {
    if (statusEl) statusEl.textContent = msg;
  }

  async function ensureEngine(dialectKey) {
    const dk = normDialect(dialectKey);
    if (engine && engineDialect === dk) return engine;
    if (typeof window.RomaineAutoEngine !== 'function') return null;
    setStatus(`載入 ${dk} 語料中…`);
    const eng = new window.RomaineAutoEngine();
    await eng.init('.', dk);
    engine = eng;
    engineDialect = dk;
    if (dialectSel && dialectSel.value !== dk) dialectSel.value = dk;
    if (raopingBarEl) raopingBarEl.style.display = dk === 'ngiaupin' ? 'flex' : 'none';
    setStatus(`${eng.dialectLabel || dk} 就緒`);
    return engine;
  }

  function extractPureCjkChars(tokens) {
    const list = [];
    for (const tok of tokens) {
      if (tok.punct || tok.nonCjk || tok.comment) continue;
      for (const ch of Array.from(tok.han || '')) {
        if (CJK_CHAR_TEST_RE.test(ch)) list.push(ch);
      }
    }
    return list;
  }

  function remapOverrides(oldChars, oldMap, newChars) {
    const remapped = new Map();
    if (!oldMap.size || !oldChars.length || !newChars.length) return remapped;
    const m = oldChars.length;
    const n = newChars.length;
    const dp = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1));
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = oldChars[i - 1] === newChars[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
    let i = m;
    let j = n;
    while (i > 0 && j > 0) {
      if (oldChars[i - 1] === newChars[j - 1]) {
        const ov = oldMap.get(i - 1);
        if (ov) remapped.set(j - 1, ov);
        i--;
        j--;
      } else if (dp[i - 1][j] >= dp[i][j - 1]) {
        i--;
      } else {
        j--;
      }
    }
    return remapped;
  }

  function applyOverridesToTokens(tokens, ovMap) {
    let cjkIdx = 0;
    for (const tok of tokens) {
      if (tok.punct || tok.nonCjk || tok.comment) continue;
      const chars = Array.from(tok.han || '').filter((c) => CJK_CHAR_TEST_RE.test(c));
      const syls = (tok.hpp || '').trim().split(/\s+/).filter(Boolean);
      let changed = false;
      let anyUncertain = false;
      for (let k = 0; k < chars.length; k++) {
        const ov = ovMap.get(cjkIdx + k);
        if (ov && ov.ch === chars[k]) {
          if (ov.syl && syls[k]) {
            syls[k] = ov.syl;
            changed = true;
          }
          if (typeof ov.isUpper === 'boolean' && syls[k]) {
            syls[k] = ov.isUpper
              ? syls[k].charAt(0).toUpperCase() + syls[k].slice(1)
              : syls[k].charAt(0).toLowerCase() + syls[k].slice(1);
            changed = true;
          }
          if (ov.uncertain) anyUncertain = true;
        }
      }
      if (anyUncertain) tok.uncertain = true;
      if (changed) tok.hpp = syls.join(' ');
      cjkIdx += chars.length;
    }
  }

  function recordTokenManualOverride(tokIdx, saveSyl, saveCase, saveUncertain) {
    let cjkIdx = 0;
    for (let t = 0; t < currentTokens.length; t++) {
      const tok = currentTokens[t];
      if (tok.punct || tok.nonCjk || tok.comment) continue;
      const chars = Array.from(tok.han || '').filter((c) => CJK_CHAR_TEST_RE.test(c));
      const syls = (tok.hpp || '').trim().split(/\s+/).filter(Boolean);
      if (t === tokIdx) {
        for (let k = 0; k < chars.length; k++) {
          const prev = manualCharOverrides.get(cjkIdx + k) || { ch: chars[k] };
          if (saveSyl && syls[k]) prev.syl = syls[k];
          if (saveCase && syls[k]) {
            const first = syls[k].charAt(0);
            prev.isUpper = Boolean(first && first !== first.toLowerCase());
          }
          if (saveUncertain) prev.uncertain = Boolean(tok.uncertain);
          manualCharOverrides.set(cjkIdx + k, prev);
        }
        break;
      }
      cjkIdx += chars.length;
    }
  }

  function seedOverridesFromTokens(tokens) {
    manualCharOverrides.clear();
    let cjkIdx = 0;
    for (const tok of tokens) {
      if (tok.punct || tok.nonCjk || tok.comment) continue;
      const chars = Array.from(tok.han || '').filter((c) => CJK_CHAR_TEST_RE.test(c));
      const syls = (tok.hpp || '').trim().split(/\s+/).filter(Boolean);
      for (let k = 0; k < chars.length; k++) {
        if (syls[k]) {
          const first = syls[k].charAt(0);
          manualCharOverrides.set(cjkIdx + k, {
            ch: chars[k],
            syl: syls[k],
            isUpper: Boolean(first && first !== first.toLowerCase()),
            uncertain: Boolean(tok.uncertain),
          });
        }
      }
      cjkIdx += chars.length;
    }
    prevPureCjk = extractPureCjkChars(tokens);
  }

  function runConvert() {
    if (!engine || !inputEl) return;
    const text = inputEl.value;
    if (!text.trim()) {
      currentTokens = [];
      prevPureCjk = [];
      render();
      return;
    }
    const newTokens = engine.segmentAndConvert(text, activeOpenBookMap);
    const newPureCjk = extractPureCjkChars(newTokens);
    if (manualCharOverrides.size > 0 && prevPureCjk.length > 0) {
      manualCharOverrides = remapOverrides(prevPureCjk, manualCharOverrides, newPureCjk);
      applyOverridesToTokens(newTokens, manualCharOverrides);
      if (engineDialect === 'ngiaupin' && typeof engine.populateRaopingSubTokens === 'function') {
        engine.populateRaopingSubTokens(newTokens);
      }
    }
    currentTokens = newTokens;
    prevPureCjk = newPureCjk;
    render();
  }

  function getPlainJoinedOutput() {
    if (!engine || !currentTokens.length) return '';
    const mode = joinSel ? joinSel.value : 'none';
    if (engineDialect === 'ngiaupin') {
      const tracks = raopingTracks.length ? raopingTracks : ['zhuk'];
      if (tracks.length === 1) {
        return engine.formatTokensToHppForVariant(currentTokens, mode, tracks[0]);
      }
      const lbl = { zhuk: '竹', zhuolan: '卓', taoyuan: '桃' };
      return tracks
        .map((t) => `[${lbl[t]}] ${engine.formatTokensToHppForVariant(currentTokens, mode, t)}`)
        .join('\n');
    }
    return engine.formatTokensToHpp(currentTokens, mode);
  }

  function toggleTokenCase(tokIdx) {
    const tok = currentTokens[tokIdx];
    if (!tok || !tok.hpp) return;
    const first = tok.hpp.charAt(0);
    const isUpper = first !== first.toLowerCase();
    tok.hpp = isUpper
      ? first.toLowerCase() + tok.hpp.slice(1)
      : first.toUpperCase() + tok.hpp.slice(1);
    recordTokenManualOverride(tokIdx, false, true);
    if (engineDialect === 'ngiaupin' && typeof engine.populateRaopingSubTokens === 'function') {
      engine.populateRaopingSubTokens([tok]);
    }
    render();
  }

  function lookupCandidateMeaning(han, hpp) {
    if (typeof window.getRomaineCandidateMeaning !== 'function') return '';
    return window.getRomaineCandidateMeaning(han, hpp, engineDialect) || '';
  }

  function makeCandidateButton(han, c, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';

    const hppSpan = document.createElement('span');
    hppSpan.className = 'wb-cand-hpp';
    hppSpan.textContent = c.hpp;
    btn.appendChild(hppSpan);

    const gloss = lookupCandidateMeaning(han, c.hpp);
    if (gloss) {
      const glossSpan = document.createElement('span');
      glossSpan.className = 'wb-cand-gloss';
      glossSpan.textContent = gloss;
      glossSpan.title = gloss;
      btn.appendChild(glossSpan);
    }

    const tagSpan = document.createElement('span');
    tagSpan.className = 'wb-cand-tag';
    tagSpan.textContent = c.label || '';
    btn.appendChild(tagSpan);

    btn.addEventListener('click', onClick);
    return btn;
  }

  function openCandidatePopup(tokIdx, anchorEl) {
    const tok = currentTokens[tokIdx];
    if (!tok || tok.punct || tok.nonCjk || tok.comment || !candPopupEl) return;
    candPopupEl.innerHTML = '';

    const head = document.createElement('div');
    head.className = 'wb-cand-head';
    const title = document.createElement('strong');
    title.textContent = tok.displayHan || tok.han;
    head.appendChild(title);

    const ext = document.createElement('a');
    ext.className = 'wb-cand-ext';
    ext.href = `?musiid=hak&ca=${encodeURIComponent(tok.han)}&kiong=${engine ? engine.kiong : 'si'}`;
    ext.target = '_blank';
    ext.rel = 'noopener';
    ext.title = '在新分頁查詞典';
    ext.textContent = '↗';
    head.appendChild(ext);
    candPopupEl.appendChild(head);

    if (tok.candidates && tok.candidates.length > 0) {
      for (const c of tok.candidates) {
        const btn = makeCandidateButton(tok.han, c, () => {
          const oldFirst = (tok.hpp || '').trim().charAt(0);
          const wasUpper = oldFirst && oldFirst !== oldFirst.toLowerCase();
          tok.hpp = wasUpper ? c.hpp.charAt(0).toUpperCase() + c.hpp.slice(1) : c.hpp;
          tok.trust = c.trust;
          tok.label = c.label;
          tok.oov = false;
          recordTokenManualOverride(tokIdx, true, false);
          if (engineDialect === 'ngiaupin' && typeof engine.populateRaopingSubTokens === 'function') {
            engine.populateRaopingSubTokens([tok]);
          }
          candPopupEl.style.display = 'none';
          render();
        });
        candPopupEl.appendChild(btn);
      }
    }

    if (tok.partsMeta && tok.partsMeta.length > 0) {
      for (const pm of tok.partsMeta) {
        if (!pm.candidates || !pm.candidates.length) continue;
        const subLbl = document.createElement('div');
        subLbl.className = 'wb-cand-sub';
        subLbl.textContent = pm.han;
        candPopupEl.appendChild(subLbl);
        for (const c of pm.candidates) {
          const btn = makeCandidateButton(pm.han, c, () => {
            const offset = tok.partsMeta
              .slice(0, tok.partsMeta.indexOf(pm))
              .reduce((s, item) => s + item.sylCount, 0);
            const curSyls = (tok.hpp || '').trim().split(/\s+/).filter(Boolean);
            const repSyls = c.hpp.trim().split(/\s+/).filter(Boolean);
            for (let k = 0; k < pm.sylCount && k < repSyls.length; k++) {
              const oldSyl = curSyls[offset + k] || '';
              const wasUpper = oldSyl && oldSyl.charAt(0) !== oldSyl.charAt(0).toLowerCase();
              curSyls[offset + k] = wasUpper
                ? repSyls[k].charAt(0).toUpperCase() + repSyls[k].slice(1)
                : repSyls[k];
            }
            tok.hpp = curSyls.join(' ');
            recordTokenManualOverride(tokIdx, true, false);
            if (engineDialect === 'ngiaupin' && typeof engine.populateRaopingSubTokens === 'function') {
              engine.populateRaopingSubTokens([tok]);
            }
            candPopupEl.style.display = 'none';
            render();
          });
          candPopupEl.appendChild(btn);
        }
      }
    }

    if ((!tok.candidates || !tok.candidates.length) && (!tok.partsMeta || !tok.partsMeta.length)) {
      const empty = document.createElement('div');
      empty.className = 'wb-cand-sub';
      empty.textContent = '無其他候選讀音';
      candPopupEl.appendChild(empty);
    }

    const capBtn = document.createElement('button');
    capBtn.type = 'button';
    capBtn.textContent = '切換首字母大寫 (Aa)';
    capBtn.addEventListener('click', () => {
      toggleTokenCase(tokIdx);
      candPopupEl.style.display = 'none';
    });
    candPopupEl.appendChild(capBtn);

    const uncertainBtn = document.createElement('button');
    uncertainBtn.type = 'button';
    uncertainBtn.textContent = tok.uncertain ? '✓ 取消「不確定」標記' : '？ 標記為「不確定」';
    uncertainBtn.addEventListener('click', () => {
      tok.uncertain = !tok.uncertain;
      recordTokenManualOverride(tokIdx, false, false, true);
      candPopupEl.style.display = 'none';
      render();
    });
    candPopupEl.appendChild(uncertainBtn);

    const customBtn = document.createElement('button');
    customBtn.type = 'button';
    customBtn.textContent = '自訂讀音…';
    customBtn.addEventListener('click', () => {
      const curSyls = (tok.hpp || '').trim().split(/\s+/).filter(Boolean);
      let defaultInput = curSyls[0] || '';
      for (let i = 1; i < curSyls.length; i++) {
        const isEq = tok.sylBoundaries && tok.sylBoundaries[i - 1] === 'hyphen';
        defaultInput += (isEq ? '=' : ' ') + curSyls[i];
      }

      const val = prompt(
        `輸入「${tok.displayHan || tok.han}」的 HPP 讀音（空格/-/' 分隔音節；= 強制 hyphen；+ 強制空格拆詞）：`,
        defaultInput
      );
      if (val !== null && val.trim()) {
        const rawParts = val.trim().split(/(\s*=\s*|\s*\+\s*|[\s'-]+)/).filter((p) => p && !/^\s+$/.test(p));
        const newSyls = [];
        const newOps = [];
        for (const part of rawParts) {
          if (/^[\s'-]+$/.test(part)) continue;
          if (part.includes('=')) {
            newOps.push('=');
          } else if (part.includes('+')) {
            newOps.push('+');
          } else {
            if (newSyls.length > newOps.length) newOps.push('normal');
            newSyls.push(part.normalize('NFC'));
          }
        }

        const chars = Array.from(tok.han || '');
        const hadEq = tok.sylBoundaries && tok.sylBoundaries.includes('hyphen');
        const hasNewStruct = newOps.includes('=') || newOps.includes('+') || hadEq;

        if (newSyls.length > 0) {
          tok.hpp = newSyls.join(' ');
          tok.oov = false;
          tok.trust = 'official';
          tok.label = '人工自訂';
          recordTokenManualOverride(tokIdx, true, true);
          if (engineDialect === 'ngiaupin' && typeof engine.populateRaopingSubTokens === 'function') {
            engine.populateRaopingSubTokens([tok]);
          }

          if (
            hasNewStruct &&
            inputEl &&
            newSyls.length === chars.length &&
            tok.srcStart !== undefined &&
            tok.srcEnd !== undefined
          ) {
            const oldDisp = tok.displayHan || tok.han;
            let rebuilt = chars[0];
            for (let k = 1; k < chars.length; k++) {
              const op = newOps[k - 1];
              if (op === '=' || op === '+') {
                rebuilt += op;
              } else if (oldDisp.includes('-')) {
                rebuilt += '-';
              }
              rebuilt += chars[k];
            }
            if (rebuilt !== oldDisp) {
              const txt = inputEl.value;
              inputEl.value = txt.slice(0, tok.srcStart) + rebuilt + txt.slice(tok.srcEnd);
              candPopupEl.style.display = 'none';
              runConvert();
              return;
            }
          }
          render();
        }
      }
      candPopupEl.style.display = 'none';
    });
    candPopupEl.appendChild(customBtn);

    candPopupEl.style.display = 'block';
    const rect = anchorEl.getBoundingClientRect();
    const popRect = candPopupEl.getBoundingClientRect();
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - popRect.width - 8));
    let top = rect.bottom + 6;
    if (top + popRect.height > window.innerHeight - 8) {
      top = Math.max(8, rect.top - popRect.height - 6);
    }
    candPopupEl.style.left = `${Math.round(left)}px`;
    candPopupEl.style.top = `${Math.round(top)}px`;
  }

  function render() {
    if (!tokensEl || !outputEl || !engine) return;
    tokensEl.innerHTML = '';

    currentTokens.forEach((tok, idx) => {
      const chip = document.createElement('div');
      chip.className = 'wb-tok-chip';
      if (tok.punct) chip.classList.add('punct');
      else if (tok.comment) chip.classList.add('comment');
      else if (tok.oov) chip.classList.add('oov');
      else if (tok.trust === 'supp-nisim') chip.classList.add('supp-nisim');
      else if (tok.trust === 'supp-derived') chip.classList.add('supp-derived');
      else if (tok.candidates && tok.candidates.length > 1) chip.classList.add('poly');
      if (tok.uncertain) chip.classList.add('uncertain');

      if (tok.comment) {
        chip.textContent = tok.han;
      } else if (tok.punct || tok.nonCjk) {
        chip.textContent = tok.han === '\n' ? '↵' : tok.han;
      } else {
        const hanSpan = document.createElement('span');
        hanSpan.className = 'wb-tok-han';
        hanSpan.textContent = tok.han;
        chip.appendChild(hanSpan);

        const hppSpan = document.createElement('span');
        hppSpan.className = 'wb-tok-hpp';
        hppSpan.textContent = engine.formatWordHpp(tok.hpp, joinSel ? joinSel.value : 'none', tok.sylBoundaries);
        chip.appendChild(hppSpan);

        const caseBtn = document.createElement('button');
        caseBtn.type = 'button';
        caseBtn.className = 'wb-tok-case';
        const first = (tok.hpp || '').charAt(0);
        caseBtn.textContent = first && first !== first.toLowerCase() ? 'l' : 'U';
        caseBtn.title = '切換首字母大小寫';
        caseBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          toggleTokenCase(idx);
        });
        chip.appendChild(caseBtn);

        chip.addEventListener('click', (e) => {
          e.stopPropagation();
          openCandidatePopup(idx, chip);
        });
      }
      tokensEl.appendChild(chip);
    });

    const mode = joinSel ? joinSel.value : 'none';
    const useSandhi = Boolean(sandhiChk && sandhiChk.checked);
    if (engineDialect === 'ngiaupin' && (raopingTracks.length > 1 || raopingTracks[0] !== 'zhuk')) {
      const tracks = raopingTracks.length ? raopingTracks : ['zhuk'];
      const meta = {
        zhuk: { badge: '竹', cls: 'variant-label-竹', title: '新竹饒平（含 6 條連讀變調）' },
        zhuolan: { badge: '卓', cls: 'variant-label-卓', title: '卓蘭饒平（本調，尚無官方變調規則）' },
        taoyuan: { badge: '桃', cls: 'variant-label-桃', title: '桃園饒平（本調，尚無官方變調規則）' },
      };
      const italicUnverified =
        window.RomaineAutoEngine && typeof window.RomaineAutoEngine.getUnverifiedItalic === 'function'
          ? window.RomaineAutoEngine.getUnverifiedItalic()
          : true;
      const rowsHtml = tracks
        .map((t) => {
          const m = meta[t];
          let bodyHtml = '';
          let noteHtml = '';
          if (t === 'zhuk') {
            bodyHtml = useSandhi
              ? engine.formatTokensToSandhiHtml(currentTokens, mode)
              : engine.formatTokensToHpp(currentTokens, mode);
          } else {
            bodyHtml = engine.formatTokensToVariantHtml(currentTokens, mode, t, italicUnverified);
            if (useSandhi) {
              noteHtml = '<span class="wb-no-sandhi-note" title="尚無官方卓蘭／桃園連讀變調規則">本調</span>';
            }
          }
          return `<div class="wb-track-row"><span class="wb-track-badge"><span class="variant-label ${m.cls}" title="${m.title}">${m.badge}</span>${noteHtml}</span><span class="wb-track-text">${bodyHtml}</span></div>`;
        })
        .join('');
      outputEl.innerHTML = `<div class="wb-track-list">${rowsHtml}</div>`;
    } else if (useSandhi) {
      outputEl.innerHTML = engine.formatTokensToSandhiHtml(currentTokens, mode);
    } else {
      outputEl.textContent = engine.formatTokensToHpp(currentTokens, mode);
    }
  }

  function buildItemIdentity(it) {
    const d = normDialect((it.cert_ref && it.cert_ref.dialect) || it.dialect || 'xiien');
    const lvl = (it.cert_ref && it.cert_ref.level) || '';
    const id = (it.cert_ref && it.cert_ref.id) || '';
    if (id) return `id:${d}|${lvl}|${id}`;
    return `han:${d}|${(it.han || '').trim()}`;
  }

  function saveCurrentItem() {
    if (!engine || !inputEl) return;
    const han = inputEl.value.trim();
    if (!han) {
      setStatus('請先輸入或載入例句');
      return;
    }
    const dialect = dialectSel ? dialectSel.value : 'xiien';
    const cleanTokens = currentTokens.map((t) => {
      const out = { han: t.han, hpp: t.hpp || '' };
      if (t.punct) out.punct = true;
      if (t.nonCjk) out.nonCjk = true;
      if (t.comment) out.comment = true;
      if (t.noSandhi) out.noSandhi = t.noSandhi;
      if (t.sylBoundaries) out.sylBoundaries = t.sylBoundaries;
      return out;
    });
    const item = {
      dialect,
      han,
      tokens: cleanTokens,
      joined_hpp: engine.formatTokensToHpp(currentTokens, 'none'),
      note: noteEl ? noteEl.value.trim() : '',
      updated_at: new Date().toISOString(),
    };
    if (activeCertRef && activeCertRef.id) {
      item.cert_ref = { ...activeCertRef, dialect };
    }

    const list = loadVerifiedList();
    const key = buildItemIdentity(item);
    const idx = list.findIndex((existing) => buildItemIdentity(existing) === key);
    if (idx >= 0) list[idx] = item;
    else list.push(item);
    saveVerifiedList(list);

    if (window.romaineTableOverlay && typeof window.romaineTableOverlay.upsertVerifiedItem === 'function') {
      window.romaineTableOverlay.upsertVerifiedItem(item, activeRowEl);
    }
    setStatus('已儲存至本機並更新左表 ✓');
  }

  function exportJson() {
    const list = loadVerifiedList();
    if (!list.length) {
      setStatus('目前無本機待匯出資料');
      return;
    }
    const payload = {
      schema: 'hakspring-romaine-verified-v1',
      exported_at: new Date().toISOString(),
      count: list.length,
      items: list,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `romaine-verified-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setStatus(`已匯出 ${list.length} 筆 JSON`);
  }

  function handleImportFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || '{}'));
        const incoming = Array.isArray(parsed) ? parsed : (parsed.items || []);
        const list = loadVerifiedList();
        const byKey = new Map(list.map((it) => [buildItemIdentity(it), it]));
        let added = 0;
        let updated = 0;
        for (const it of incoming) {
          if (!it || !it.han) continue;
          const k = buildItemIdentity(it);
          const prev = byKey.get(k);
          const inTs = Date.parse(it.updated_at || 0) || 0;
          const prevTs = prev ? (Date.parse(prev.updated_at || 0) || 0) : -1;
          if (!prev) {
            byKey.set(k, it);
            added++;
          } else if (inTs >= prevTs) {
            byKey.set(k, it);
            updated++;
          }
        }
        const merged = Array.from(byKey.values());
        saveVerifiedList(merged);
        if (window.romaineTableOverlay && typeof window.romaineTableOverlay.refreshFromStorage === 'function') {
          window.romaineTableOverlay.refreshFromStorage();
        }
        setStatus(`匯入完成：新增 ${added}、更新 ${updated}`);
      } catch {
        setStatus('JSON 格式錯誤，匯入失敗');
      } finally {
        e.target.value = '';
      }
    };
    reader.readAsText(file, 'utf-8');
  }

  function updateHeaderToggleBtn() {
    const btn = document.getElementById('showRomanizerBtn');
    if (!btn) return;
    btn.classList.toggle('is-active', isOpen);
    btn.setAttribute('aria-pressed', String(isOpen));
  }

  function updateStickyTop() {
    if (!paneEl || !isOpen) return;
    const headerEl = document.getElementById('header');
    const summaryEl = document.getElementById('results-summary');
    let bottom = 12;
    if (headerEl) {
      const hStyle = getComputedStyle(headerEl);
      const hTop = parseFloat(hStyle.top) || 10;
      bottom = Math.max(bottom, hTop + headerEl.offsetHeight);
    }
    if (summaryEl && summaryEl.offsetParent !== null && getComputedStyle(summaryEl).display !== 'none') {
      const sStyle = getComputedStyle(summaryEl);
      const sTop = parseFloat(sStyle.top) || 80;
      bottom = Math.max(bottom, sTop + summaryEl.offsetHeight);
    }
    paneEl.style.setProperty('--wb-sticky-top', `${Math.max(12, Math.ceil(bottom + 8))}px`);
  }

  function open() {
    if (!paneEl && !buildDom()) return;
    isOpen = true;
    paneEl.hidden = false;
    document.body.classList.add('romaine-workbench-open');
    updateHeaderToggleBtn();
    updateStickyTop();
    const d = dialectSel ? dialectSel.value : 'xiien';
    ensureEngine(d).then(() => {
      if (inputEl && inputEl.value.trim() && currentTokens.length === 0) {
        runConvert();
      }
    });
  }

  function close() {
    isOpen = false;
    if (paneEl) paneEl.hidden = true;
    if (candPopupEl) candPopupEl.style.display = 'none';
    document.body.classList.remove('romaine-workbench-open');
    if (activeRowEl) {
      activeRowEl.classList.remove('romaine-row-editing');
      activeRowEl = null;
    }
    updateHeaderToggleBtn();
  }

  function toggle() {
    if (isOpen) close();
    else open();
  }

  async function openWithText(text, dialectNameOrKey) {
    open();
    const dk = normDialect(dialectNameOrKey || (dialectSel ? dialectSel.value : 'xiien'));
    activeCertRef = null;
    activeOpenBookMap = null;
    if (activeRowEl) {
      activeRowEl.classList.remove('romaine-row-editing');
      activeRowEl = null;
    }
    if (certBadgeEl) certBadgeEl.textContent = '自由輸入';
    if (noteEl) noteEl.value = '';
    if (dialectSel) dialectSel.value = dk;
    await ensureEngine(dk);
    if (inputEl) inputEl.value = text || '';
    manualCharOverrides.clear();
    runConvert();
  }

  async function loadRow(meta) {
    open();
    const dk = normDialect(meta.dialect || 'xiien');
    if (activeRowEl && activeRowEl !== meta.rowEl) {
      activeRowEl.classList.remove('romaine-row-editing');
    }
    activeRowEl = meta.rowEl || null;
    if (activeRowEl) activeRowEl.classList.add('romaine-row-editing');

    activeOpenBookMap = meta.openBookMap || null;
    activeCertRef = meta.rowId
      ? { dialect: dk, level: meta.level || '', id: meta.rowId, word: meta.word || '' }
      : null;

    if (certBadgeEl) {
      const parts = [DIALECT_OPTIONS.find((x) => x.key === dk)?.label || dk, meta.level, meta.rowId].filter(Boolean);
      certBadgeEl.textContent = parts.length ? parts.join(' ') : '例句校對';
    }

    if (dialectSel) dialectSel.value = dk;
    await ensureEngine(dk);

    const existing =
      window.romaineTableOverlay && typeof window.romaineTableOverlay.getVerifiedItem === 'function'
        ? window.romaineTableOverlay.getVerifiedItem(dk, meta.level, meta.rowId, meta.han)
        : null;

    if (existing && existing.tokens && existing.tokens.length) {
      if (inputEl) inputEl.value = existing.han || meta.han || '';
      if (noteEl) noteEl.value = existing.note || '';
      const freshTokens = engine.segmentAndConvert(inputEl.value, activeOpenBookMap);
      // 將已校對 token 讀音與邊界套回 freshTokens（保留 candidates 供點選微調）
      seedOverridesFromTokens(existing.tokens);
      const newPure = extractPureCjkChars(freshTokens);
      const remapped = remapOverrides(prevPureCjk, manualCharOverrides, newPure);
      manualCharOverrides = remapped;
      applyOverridesToTokens(freshTokens, manualCharOverrides);
      currentTokens = freshTokens;
      prevPureCjk = newPure;
      render();
      setStatus('已載入既有校對版本');
    } else {
      if (inputEl) inputEl.value = meta.han || '';
      if (noteEl) noteEl.value = '';
      manualCharOverrides.clear();
      runConvert();
    }
  }

  function init() {
    buildDom();
    const btn = document.getElementById('showRomanizerBtn');
    if (btn) {
      btn.addEventListener('click', toggle);
      updateHeaderToggleBtn();
    }
    window.addEventListener('resize', updateStickyTop, { passive: true });
    window.addEventListener('scroll', updateStickyTop, { passive: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.romaineWorkbench = {
    open,
    close,
    toggle,
    openWithText,
    loadRow,
    updateLocalCount,
  };
})();
