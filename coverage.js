// coverage.js - 字表涵蓋度總表前端核心邏輯
(function () {
  'use strict';

  // 六腔標準定義（順序：四南海大平安）
  const DIALECT_CHARS = ['四', '南', '海', '大', '平', '安'];
  const DIALECT_CODES = ['si', 'nsi', 'ha', 'da', 'rh', 'zh'];
  const DIALECT_NAMES = {
    si: '四縣',
    nsi: '南四縣',
    ha: '海陸',
    da: '大埔',
    rh: '饒平',
    zh: '詔安',
    all: '六腔總覽'
  };
  const CODE_TO_INDEX = { si: 0, nsi: 1, ha: 2, da: 3, rh: 4, zh: 5 };

  // 康熙 214 部首清單
  const KANGXI_RADICALS = [
    '', '一', '丨', '丶', '丿', '乙', '亅', '二', '亠', '人', '儿', '入', '八', '冂', '冖', '冫',
    '几', '凵', '刀', '力', '勹', '匕', '匚', '匸', '十', '卜', '卩', '厂', '厶', '又', '口',
    '囗', '土', '士', '夂', '夊', '夕', '大', '女', '子', '宀', '寸', '小', '尢', '尸', '屮',
    '山', '巛', '工', '己', '巾', '干', '幺', '广', '廴', '廾', '弋', '弓', '彐', '彡', '彳',
    '心', '戈', '戶', '手', '支', '攴', '文', '斗', '斤', '方', '无', '日', '曰', '月', '木',
    '欠', '止', '歹', '殳', '毋', '比', '毛', '氏', '气', '水', '火', '爪', '父', '爻', '爿',
    '片', '牙', '牛', '犬', '玄', '玉', '瓜', '瓦', '甘', '生', '用', '田', '疋', '疒', '癶',
    '白', '皮', '皿', '目', '矛', '矢', '石', '示', '禸', '禾', '穴', '立', '竹', '米', '糸',
    '缶', '网', '羊', '羽', '老', '而', '耒', '耳', '聿', '肉', '臣', '自', '至', '臼', '舌',
    '舛', '舟', '艮', '色', '艸', '虍', '虫', '血', '行', '衣', '襾', '見', '角', '言', '谷',
    '豆', '豕', '豸', '貝', '赤', '走', '足', '身', '車', '辛', '辰', '辵', '邑', '酉', '釆',
    '里', '金', '長', '門', '阜', '隶', '隹', '雨', '靑', '非', '面', '革', '韋', '韭', '音',
    '頁', '風', '飛', '食', '首', '香', '馬', '骨', '高', '髟', '鬥', '鬯', '鬲', '鬼', '魚',
    '鳥', '鹵', '鹿', '麥', '麻', '黃', '黍', '黑', '黹', '黽', '鼎', '鼓', '鼠', '鼻', '齊',
    '齒', '龍', '龜', '龠'
  ];

  // 色弱標記符號
  const CB_SYMBOLS = {
    official: '●',
    carved: '▲',
    nisim: '◆',
    none: '○'
  };

  // 全域狀態
  const state = {
    scope: 'jf7000',     // jf7000 | t12 | all
    kiong: 'si',         // si | nsi | ha | da | rh | zh | all
    tab: 'bushou',       // bushou | phonetic | unicode | outside
    showPy: false,
    colorblind: false,
    onlyMissing: false,
    search: '',
    summary: null,
    charsJf: null,
    charsT12: null,
    charsOutside: null,
    currentList: []      // 當前作用的字表項目清單
  };

  // DOM 元素快取
  const dom = {};

  // 初始化入口
  async function init() {
    cacheDom();
    bindEvents();
    readUrlParams();
    updateControlsUI();

    try {
      await loadSummaryData();
      renderSummaryBadges();
      renderStackedBars();
      await switchScope(state.scope, false);
      renderActiveTab();
    } catch (err) {
      console.error('初始化字表失敗:', err);
      if (dom.loadingIndicator) {
        dom.loadingIndicator.innerHTML = `<span style="color:#e63946;">載入資料失敗，請重新整理頁面。</span>`;
      }
    }
  }

  function cacheDom() {
    dom.versionBadges = document.getElementById('versionBadges');
    dom.scopeGroup = document.getElementById('scopeGroup');
    dom.kiongGroup = document.getElementById('kiongGroup');
    dom.searchInput = document.getElementById('searchInput');
    dom.toggleShowPy = document.getElementById('toggleShowPy');
    dom.toggleColorblind = document.getElementById('toggleColorblind');
    dom.toggleOnlyMissing = document.getElementById('toggleOnlyMissing');
    dom.summaryCardTitle = document.getElementById('summaryCardTitle');
    dom.stackedBarsContainer = document.getElementById('stackedBarsContainer');
    dom.tabsNav = document.getElementById('tabsNav');
    dom.tabContentArea = document.getElementById('tabContentArea');
    dom.loadingIndicator = document.getElementById('loadingIndicator');

    dom.panes = {
      bushou: document.getElementById('pane-bushou'),
      phonetic: document.getElementById('pane-phonetic'),
      unicode: document.getElementById('pane-unicode'),
      outside: document.getElementById('pane-outside')
    };

    dom.modal = {
      backdrop: document.getElementById('charModalBackdrop'),
      closeBtn: document.getElementById('modalCloseBtn'),
      heroChar: document.getElementById('modalHeroChar'),
      unicode: document.getElementById('modalUnicode'),
      radical: document.getElementById('modalRadical'),
      pack: document.getElementById('modalPack'),
      block: document.getElementById('modalBlock'),
      readingsList: document.getElementById('modalReadingsList'),
      queryBtn: document.getElementById('modalQueryBtn')
    };
  }

  function bindEvents() {
    // 範圍切換按鈕組
    dom.scopeGroup.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-pill');
      if (!btn) return;
      const scope = btn.dataset.scope;
      if (scope === state.scope) return;
      switchScope(scope, true);
    });

    // 腔調切換按鈕組
    dom.kiongGroup.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-pill');
      if (!btn) return;
      const kiong = btn.dataset.kiong;
      if (kiong === state.kiong) return;
      state.kiong = kiong;
      updateControlsUI();
      syncUrlParams();
      renderActiveTab();
    });

    // 搜尋輸入
    let searchTimeout;
    dom.searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        state.search = e.target.value.trim();
        syncUrlParams();
        renderActiveTab();
      }, 250);
    });

    // 開關切換
    dom.toggleShowPy.addEventListener('change', (e) => {
      state.showPy = e.target.checked;
      syncUrlParams();
      renderActiveTab();
    });

    dom.toggleColorblind.addEventListener('change', (e) => {
      state.colorblind = e.target.checked;
      document.body.classList.toggle('colorblind-friendly', state.colorblind);
      syncUrlParams();
    });

    dom.toggleOnlyMissing.addEventListener('change', (e) => {
      state.onlyMissing = e.target.checked;
      syncUrlParams();
      renderActiveTab();
    });

    // 分頁標籤切換
    dom.tabsNav.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab-btn');
      if (!btn) return;
      const tab = btn.dataset.tab;
      if (tab === state.tab) return;
      state.tab = tab;
      updateControlsUI();
      syncUrlParams();
      renderActiveTab();
    });

    // 彈窗關閉
    dom.modal.closeBtn.addEventListener('click', closeModal);
    dom.modal.backdrop.addEventListener('click', (e) => {
      if (e.target === dom.modal.backdrop) closeModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && dom.modal.backdrop.classList.contains('open')) {
        closeModal();
      }
    });
  }

  // URL 參數讀取與同步
  function readUrlParams() {
    const params = new URLSearchParams(window.location.search);
    if (params.has('tab')) state.tab = params.get('tab');
    if (params.has('scope')) state.scope = params.get('scope');
    if (params.has('kiong')) state.kiong = params.get('kiong');
    if (params.has('showpy')) state.showPy = params.get('showpy') === '1';
    if (params.has('cb')) state.colorblind = params.get('cb') === '1';
    if (params.has('missing')) state.onlyMissing = params.get('missing') === '1';
    if (params.has('q')) state.search = params.get('q');
  }

  function syncUrlParams() {
    const params = new URLSearchParams();
    if (state.tab !== 'bushou') params.set('tab', state.tab);
    if (state.scope !== 'jf7000') params.set('scope', state.scope);
    if (state.kiong !== 'si') params.set('kiong', state.kiong);
    if (state.showPy) params.set('showpy', '1');
    if (state.colorblind) params.set('cb', '1');
    if (state.onlyMissing) params.set('missing', '1');
    if (state.search) params.set('q', state.search);

    const newUrl = window.location.pathname + (params.toString() ? '?' + params.toString() : '');
    window.history.replaceState(null, '', newUrl);
  }

  function updateControlsUI() {
    // 範圍按鈕
    dom.scopeGroup.querySelectorAll('.btn-pill').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.scope === state.scope);
    });

    // 腔調按鈕
    dom.kiongGroup.querySelectorAll('.btn-pill').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.kiong === state.kiong);
    });

    // 分頁按鈕
    dom.tabsNav.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === state.tab);
    });

    // 開關
    dom.toggleShowPy.checked = state.showPy;
    dom.toggleColorblind.checked = state.colorblind;
    dom.toggleOnlyMissing.checked = state.onlyMissing;
    dom.searchInput.value = state.search;
    document.body.classList.toggle('colorblind-friendly', state.colorblind);

    // 切換分頁容器顯示
    Object.keys(dom.panes).forEach((key) => {
      dom.panes[key].classList.toggle('active', key === state.tab);
    });
  }

  // 載入 summary.json
  async function loadSummaryData() {
    const res = await fetch('data/coverage/summary.json');
    if (!res.ok) throw new Error(`載入 summary.json 失敗: ${res.status}`);
    state.summary = await res.json();
  }

  // 渲染頁首版本 badges
  function renderSummaryBadges() {
    if (!state.summary || !state.summary.versions) return;
    const v = state.summary.versions;
    dom.versionBadges.innerHTML = `
      <span class="v-badge" title="認證詞彙版本">認證 ${v.cert}</span>
      <span class="v-badge" title="教典資料版本">教典 ${v.gip}</span>
      <span class="v-badge" title="補字典資料日期">補字典 ${v.supp_date}</span>
      <span class="v-badge" title="Unihan 資料版本">Unihan ${v.unihan}</span>
      <span class="v-badge" title="jf7000 commit">jf7000 ${v.jf7000}</span>
    `;
  }

  // 渲染整體涵蓋度堆疊長條圖
  function renderStackedBars() {
    if (!state.summary || !state.summary.scopes) return;

    let scopeInfo = state.summary.scopes[state.scope];
    if (state.scope === 'all') {
      scopeInfo = state.summary.scopes.all;
    }
    const total = scopeInfo.total;

    dom.summaryCardTitle.textContent = `${
      state.scope === 'jf7000'
        ? 'jf7000 (7,772 字)'
        : state.scope === 't12'
          ? '臺灣常用 T1+T2 (13,064 字)'
          : '全部 Unihan (102,527 字)'
    } 六腔讀音涵蓋度`;

    if (state.scope === 'all') {
      dom.stackedBarsContainer.innerHTML = `
        <div style="padding: 16px; font-size: 14px; color: var(--sub-text); line-height: 1.8;">
          全部 Unihan 包含 102,527 個漢字（CJK 統一表意文字），其中絕大多數為極罕用歷史異體字或擴充區字元。第一階段客源翠六腔讀音在此層絕大部分為無音（灰色），此處僅呈現總數供宏觀比對，不逐字渲染格子。
        </div>
      `;
      return;
    }

    const dialectsStats = scopeInfo.dialects;
    let html = '';

    DIALECT_CODES.forEach((kCode) => {
      const dName = DIALECT_NAMES[kCode];
      const dChar = DIALECT_CHARS[CODE_TO_INDEX[kCode]];
      const st = dialectsStats[dChar];
      if (!st) return;

      const pctOfficial = ((st.official / total) * 100).toFixed(1);
      const pctCarved = ((st.carved / total) * 100).toFixed(1);
      const pctNisim = ((st.nisim / total) * 100).toFixed(1);
      const pctNone = ((st.none / total) * 100).toFixed(1);
      const pctTotalSound = (((total - st.none) / total) * 100).toFixed(1);

      html += `
        <div class="bar-row">
          <div class="bar-kiong-name" data-kiong="${kCode}" title="切換至 ${dName}">
            ${dName}
          </div>
          <div class="stacked-bar" title="${dName}：官方 ${st.official} (${pctOfficial}%)，切出 ${st.carved} (${pctCarved}%)，擬音 ${st.nisim} (${pctNisim}%)，無音 ${st.none} (${pctNone}%)">
            <div class="bar-segment seg-official" style="width: ${pctOfficial}%;"></div>
            <div class="bar-segment seg-carved" style="width: ${pctCarved}%;"></div>
            <div class="bar-segment seg-nisim" style="width: ${pctNisim}%;"></div>
            <div class="bar-segment seg-none" style="width: ${pctNone}%;"></div>
          </div>
          <div class="bar-meta">
            <strong>${pctTotalSound}%</strong>
            <span style="font-size:11px;">(${total - st.none}/${total})</span>
          </div>
        </div>
      `;
    });

    dom.stackedBarsContainer.innerHTML = html;

    // 點擊長條腔名直接切換腔調
    dom.stackedBarsContainer.querySelectorAll('.bar-kiong-name').forEach((el) => {
      el.addEventListener('click', () => {
        state.kiong = el.dataset.kiong;
        updateControlsUI();
        syncUrlParams();
        renderActiveTab();
      });
    });
  }

  // 切換範圍並動態載入對應字表
  async function switchScope(newScope, needRender = true) {
    state.scope = newScope;
    updateControlsUI();
    syncUrlParams();
    renderStackedBars();

    if (newScope === 'all') {
      dom.loadingIndicator.style.display = 'none';
      if (needRender) renderActiveTab();
      return;
    }

    dom.loadingIndicator.style.display = 'flex';

    if (!state.charsJf) {
      const res = await fetch('data/coverage/chars-jf.json');
      state.charsJf = await res.json();
    }

    if (newScope === 't12') {
      if (!state.charsT12) {
        const res = await fetch('data/coverage/chars-t12.json');
        state.charsT12 = await res.json();
      }
      // 合併 jf 裡的 T1+T2 與 charsT12
      // 根據 Unihan 規則，T1+T2 總共 13,064 字
      // charsT12 (5,848 字) + charsJf 中屬於 T1/T2 的字 (7,216 字)
      // 在 chars-jf.json 裡，可透過 charsT12 與 summary 比對
      state.currentList = state.charsJf.concat(state.charsT12);
    } else {
      state.currentList = state.charsJf;
    }

    if (!state.charsOutside) {
      const res = await fetch('data/coverage/chars-used-outside-jf.json');
      state.charsOutside = await res.json();
    }

    dom.loadingIndicator.style.display = 'none';
    if (needRender) renderActiveTab();
  }

  // 取得單字在目前腔調的來源狀態
  function getCharStatus(item) {
    if (state.kiong === 'all') {
      // 六腔總覽模式：若有官方取官方，否則切出，否則擬音，否則無音
      if (item.src.includes('G') || item.src.includes('C')) return 'official';
      if (item.src.includes('S') || item.src.includes('Y')) return 'carved';
      if (item.src.includes('N')) return 'nisim';
      return 'none';
    }
    const idx = CODE_TO_INDEX[state.kiong] ?? 0;
    const code = item.src[idx];
    if (code === 'G' || code === 'C') return 'official';
    if (code === 'S' || code === 'Y') return 'carved';
    if (code === 'N') return 'nisim';
    return 'none';
  }

  function getCharPy(item) {
    if (state.kiong === 'all') {
      // 取第一個有音的
      for (let i = 0; i < 6; i++) {
        if (item.py[i]) return item.py[i];
      }
      return '';
    }
    const idx = CODE_TO_INDEX[state.kiong] ?? 0;
    return item.py[idx] || '';
  }

  // 篩選字表
  function filterItems(items) {
    return items.filter((item) => {
      const status = getCharStatus(item);
      if (state.onlyMissing && status !== 'none') {
        return false;
      }
      if (state.search) {
        const q = state.search.toLowerCase();
        const matchChar = item.c.toLowerCase().includes(q);
        const matchPy = item.py.some((p) => p.toLowerCase().includes(q));
        const matchRad = item.rad.toLowerCase().includes(q);
        if (!matchChar && !matchPy && !matchRad) {
          return false;
        }
      }
      return true;
    });
  }

  // 渲染當前作用的分頁
  function renderActiveTab() {
    if (state.scope === 'all') {
      Object.values(dom.panes).forEach((p) => (p.innerHTML = ''));
      const activePane = dom.panes[state.tab];
      activePane.innerHTML = `
        <div class="card" style="text-align: center; padding: 40px 20px; color: var(--sub-text);">
          <i class="fas fa-database fa-3x" style="margin-bottom: 16px; opacity: 0.5;"></i>
          <h3>全部 Unihan 模式僅提供六腔總數統計</h3>
          <p style="margin-top: 8px;">102,527 個漢字絕大多數為無客語資料之罕用字，請切換至「jf7000」或「臺灣常用」字集檢視逐字格子。</p>
        </div>
      `;
      return;
    }

    if (state.tab === 'bushou') {
      renderBushouTab();
    } else if (state.tab === 'phonetic') {
      renderPhoneticTab();
    } else if (state.tab === 'unicode') {
      renderUnicodeTab();
    } else if (state.tab === 'outside') {
      renderOutsideTab();
    }
  }

  // 建立單字格子 DOM
  function createCharCell(item) {
    const status = getCharStatus(item);
    const py = getCharPy(item);
    const cell = document.createElement('div');
    cell.className = `char-cell cell-${status}`;
    cell.dataset.char = item.c;

    const charSpan = document.createElement('span');
    charSpan.className = 'cell-char';
    charSpan.textContent = item.c;
    cell.appendChild(charSpan);

    if (state.showPy && py) {
      const pySpan = document.createElement('span');
      pySpan.className = 'cell-py';
      pySpan.textContent = py;
      pySpan.title = py;
      cell.appendChild(pySpan);
    }

    // 色弱標記
    const cbSpan = document.createElement('span');
    cbSpan.className = 'cb-symbol';
    cbSpan.textContent = CB_SYMBOLS[status];
    cell.appendChild(cbSpan);

    cell.addEventListener('click', () => openModal(item));
    return cell;
  }

  // Tab 1: 康熙部首分頁
  function renderBushouTab() {
    const pane = dom.panes.bushou;
    pane.innerHTML = '';

    const filtered = filterItems(state.currentList);
    if (filtered.length === 0) {
      pane.innerHTML = `<div class="card" style="text-align:center;color:var(--sub-text);">無符合篩選條件的漢字</div>`;
      return;
    }

    // 依部首編號分組 (1..214)
    const groups = {};
    for (let i = 1; i <= 214; i++) {
      groups[i] = [];
    }
    const otherGroup = [];

    filtered.forEach((it) => {
      const radNum = parseInt(it.rad.split('.')[0], 10);
      if (groups[radNum]) {
        groups[radNum].push(it);
      } else {
        otherGroup.push(it);
      }
    });

    // 繪製手風琴群組
    const fragment = document.createDocumentFragment();
    let hasRenderedFirst = false;

    for (let radNum = 1; radNum <= 214; radNum++) {
      const items = groups[radNum];
      if (items.length === 0) continue;

      // 排序：餘筆數升序 -> Unicode
      items.sort((a, b) => {
        const strkA = parseFloat(a.rad.split('.')[1] || 0);
        const strkB = parseFloat(b.rad.split('.')[1] || 0);
        if (strkA !== strkB) return strkA - strkB;
        return a.c.localeCompare(b.c);
      });

      const radChar = KANGXI_RADICALS[radNum] || `第${radNum}部`;
      const soundCount = items.filter((it) => getCharStatus(it) !== 'none').length;
      const pct = ((soundCount / items.length) * 100).toFixed(0);

      const groupDiv = document.createElement('div');
      groupDiv.className = 'accordion-group';

      const head = document.createElement('div');
      head.className = 'accordion-head';
      head.innerHTML = `
        <div class="acc-title">
          <span>${radChar}部 (${radNum})</span>
          <span class="acc-badge">${items.length} 字，有音 ${soundCount} (${pct}%)</span>
        </div>
        <div class="acc-bar-mini" title="有音率 ${pct}%">
          <div style="background:var(--c-official-bar); width:${pct}%;"></div>
        </div>
      `;

      const body = document.createElement('div');
      body.className = 'accordion-body';
      // 預設展開第一個非空部首，其餘延遲點擊渲染
      const shouldOpen = !hasRenderedFirst;
      if (shouldOpen) {
        hasRenderedFirst = true;
        body.style.display = 'block';
        renderGridInto(body, items);
      } else {
        body.style.display = 'none';
        body.dataset.rendered = '0';
      }

      head.addEventListener('click', () => {
        const isHidden = body.style.display === 'none';
        body.style.display = isHidden ? 'block' : 'none';
        if (isHidden && body.dataset.rendered === '0') {
          renderGridInto(body, items);
          body.dataset.rendered = '1';
        }
      });

      groupDiv.appendChild(head);
      groupDiv.appendChild(body);
      fragment.appendChild(groupDiv);
    }

    pane.appendChild(fragment);
  }

  function renderGridInto(container, items) {
    const grid = document.createElement('div');
    grid.className = `char-grid ${state.showPy ? 'with-py' : ''}`;
    items.forEach((it) => {
      grid.appendChild(createCharCell(it));
    });
    container.appendChild(grid);
  }

  // Tab 2: 客拼分頁
  function renderPhoneticTab() {
    const pane = dom.panes.phonetic;
    pane.innerHTML = '';

    // 六腔總覽時客拼分頁提示
    const kiongCode = state.kiong === 'all' ? 'si' : state.kiong;
    const kiongName = DIALECT_NAMES[kiongCode];

    const filtered = filterItems(state.currentList).filter((it) => {
      const idx = CODE_TO_INDEX[kiongCode] ?? 0;
      return it.src[idx] !== '-'; // 客拼分頁只列有音的字
    });

    if (filtered.length === 0) {
      pane.innerHTML = `<div class="card" style="text-align:center;color:var(--sub-text);">在 ${kiongName} 下無符合條件的有音漢字</div>`;
      return;
    }

    // 依音節聚合（去掉聲調符號的底層音節）
    const sylMap = {};
    const kIdx = CODE_TO_INDEX[kiongCode] ?? 0;

    filtered.forEach((it) => {
      const pyStr = it.py[kIdx] || '';
      const syllables = pyStr.split(' ').filter(Boolean);
      syllables.forEach((s) => {
        // 去聲調符號以做聚合
        const base = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        if (!sylMap[base]) sylMap[base] = [];
        sylMap[base].push(it);
      });
    });

    // 拼音順序排序
    const sortedBases = Object.keys(sylMap).sort((a, b) => {
      // ng 排在 n 後面
      const normA = a.startsWith('ng') ? 'nz' + a.slice(2) : a;
      const normB = b.startsWith('ng') ? 'nz' + b.slice(2) : b;
      return normA.localeCompare(normB);
    });

    const infoBar = document.createElement('div');
    infoBar.style.cssText = 'font-size:13px; color:var(--sub-text); margin-bottom:12px;';
    infoBar.textContent = `當前腔調：${kiongName}，共 ${sortedBases.length} 個音節、${filtered.length} 個有音字（無音字不在此列出）。`;
    pane.appendChild(infoBar);

    const fragment = document.createDocumentFragment();
    sortedBases.forEach((base) => {
      const items = sylMap[base];
      // 依調符音節次序排序
      items.sort((a, b) => {
        const pyA = a.py[kIdx] || '';
        const pyB = b.py[kIdx] || '';
        return pyA.localeCompare(pyB);
      });

      const rowDiv = document.createElement('div');
      rowDiv.className = 'phonetic-row';

      const header = document.createElement('div');
      header.className = 'phonetic-header';
      header.innerHTML = `<span>${base}</span> <span style="font-size:12px;font-weight:normal;color:var(--sub-text);">(${items.length} 字)</span>`;
      rowDiv.appendChild(header);

      const grid = document.createElement('div');
      grid.className = `char-grid ${state.showPy ? 'with-py' : ''}`;
      // 避免同一字因多音在此音節重複出現
      const seen = new Set();
      items.forEach((it) => {
        if (!seen.has(it.c)) {
          seen.add(it.c);
          grid.appendChild(createCharCell(it));
        }
      });
      rowDiv.appendChild(grid);
      fragment.appendChild(rowDiv);
    });

    pane.appendChild(fragment);
  }

  // Tab 3: Unicode 區塊分頁
  function renderUnicodeTab() {
    const pane = dom.panes.unicode;
    pane.innerHTML = '';

    const filtered = filterItems(state.currentList);
    if (filtered.length === 0) {
      pane.innerHTML = `<div class="card" style="text-align:center;color:var(--sub-text);">無符合篩選條件的漢字</div>`;
      return;
    }

    // 依 blk 分組
    const blocksOrder = [
      '基本區', '擴充A', '擴充B', '擴充C', '擴充D',
      '擴充E', '擴充F', '擴充G', '擴充H', '擴充I', '相容', '其他'
    ];
    const blockGroups = {};
    blocksOrder.forEach((b) => (blockGroups[b] = []));

    filtered.forEach((it) => {
      if (blockGroups[it.blk]) {
        blockGroups[it.blk].push(it);
      } else {
        blockGroups['其他'].push(it);
      }
    });

    const fragment = document.createDocumentFragment();
    let hasRenderedFirst = false;

    blocksOrder.forEach((blkName) => {
      const items = blockGroups[blkName];
      if (items.length === 0) return;

      // 碼位排序
      items.sort((a, b) => a.c.codePointAt(0) - b.c.codePointAt(0));

      const soundCount = items.filter((it) => getCharStatus(it) !== 'none').length;
      const pct = ((soundCount / items.length) * 100).toFixed(0);

      const groupDiv = document.createElement('div');
      groupDiv.className = 'accordion-group';

      const head = document.createElement('div');
      head.className = 'accordion-head';
      head.innerHTML = `
        <div class="acc-title">
          <span>${blkName}</span>
          <span class="acc-badge">${items.length} 字，有音 ${soundCount} (${pct}%)</span>
        </div>
        <div class="acc-bar-mini" title="有音率 ${pct}%">
          <div style="background:var(--c-official-bar); width:${pct}%;"></div>
        </div>
      `;

      const body = document.createElement('div');
      body.className = 'accordion-body';

      const shouldOpen = !hasRenderedFirst;
      if (shouldOpen) {
        hasRenderedFirst = true;
        body.style.display = 'block';
        renderGridInto(body, items);
      } else {
        body.style.display = 'none';
        body.dataset.rendered = '0';
      }

      head.addEventListener('click', () => {
        const isHidden = body.style.display === 'none';
        body.style.display = isHidden ? 'block' : 'none';
        if (isHidden && body.dataset.rendered === '0') {
          renderGridInto(body, items);
          body.dataset.rendered = '1';
        }
      });

      groupDiv.appendChild(head);
      groupDiv.appendChild(body);
      fragment.appendChild(groupDiv);
    });

    pane.appendChild(fragment);
  }

  // Tab 4: 175 字清單（不在 jf7000）
  function renderOutsideTab() {
    const pane = dom.panes.outside;
    pane.innerHTML = '';

    if (!state.charsOutside) {
      pane.innerHTML = `<div class="card" style="text-align:center;">載入中...</div>`;
      return;
    }

    const items = state.charsOutside;
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <h3 style="margin-bottom: 8px;">客源翠詞目用到、但未收於 jf7000 的 175 個漢字</h3>
      <p style="font-size: 13px; color: var(--sub-text); margin-bottom: 16px;">
        這些字源於教典與認證詞彙條目，其中 124 字位在臺灣常用 CNS 11643 第一、二字面（T1/T2），另 51 字為較深層之擴充字（如 㞇、㧗、㨖、㾸、㾽、䁅、䈪 等）。點擊漢字可檢視六腔讀音與客源翠詞目查詢。
      </p>
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th style="width: 50px;">字</th>
              <th style="width: 90px;">碼位</th>
              <th style="width: 70px;">部首</th>
              <th style="width: 80px;">區塊</th>
              <th style="width: 100px;">出處</th>
              <th>出處詞目範例</th>
            </tr>
          </thead>
          <tbody id="outsideTbody"></tbody>
        </table>
      </div>
    `;

    const tbody = card.querySelector('#outsideTbody');
    items.forEach((it) => {
      const tr = document.createElement('tr');
      const uCode = 'U+' + it.c.codePointAt(0).toString(16).toUpperCase();
      const wordsHtml = (it.words || []).map((w) => `<span class="tag-word">${w}</span>`).join('');

      tr.innerHTML = `
        <td style="font-size: 20px; font-weight: bold; cursor: pointer; color: var(--primary-color);">${it.c}</td>
        <td><code>${uCode}</code></td>
        <td>${it.rad || '-'}</td>
        <td>${it.blk || '-'}</td>
        <td><span class="v-badge">${it.from}</span></td>
        <td>${wordsHtml}</td>
      `;

      tr.querySelector('td').addEventListener('click', () => openModal(it));
      tbody.appendChild(tr);
    });

    pane.appendChild(card);
  }

  // 開啟單字詳細 Modal
  function openModal(item) {
    const status = getCharStatus(item);
    dom.modal.heroChar.textContent = item.c;
    dom.modal.heroChar.className = `hero-char cell-${status}`;

    const uCode = 'U+' + item.c.codePointAt(0).toString(16).toUpperCase();
    dom.modal.unicode.textContent = `Unicode: ${uCode}`;

    const radNum = parseInt(item.rad.split('.')[0], 10);
    const radName = KANGXI_RADICALS[radNum] || '';
    dom.modal.radical.textContent = `部首：${radName ? radName + '部 ' : ''}(${item.rad || '-'})`;

    const packName = item.pack === 'base' ? '基本包' : item.pack === 'taiwan' ? '本土語言包' : item.pack === 'naming' ? '臺灣命名包' : '字集外';
    dom.modal.pack.textContent = `字集：${packName}`;
    dom.modal.block.textContent = `區塊：${item.blk || '-'}`;

    // 六腔讀音清單
    dom.modal.readingsList.innerHTML = '';
    DIALECT_CODES.forEach((kCode) => {
      const idx = CODE_TO_INDEX[kCode];
      const dName = DIALECT_NAMES[kCode];
      const code = item.src[idx];
      const py = item.py[idx] || '（無讀音）';

      let srcLabel = '無音';
      let badgeClass = 'cell-none';
      if (code === 'G') { srcLabel = '教典單字'; badgeClass = 'cell-official'; }
      else if (code === 'C') { srcLabel = '認證單字'; badgeClass = 'cell-official'; }
      else if (code === 'S') { srcLabel = '補字典切出'; badgeClass = 'cell-carved'; }
      else if (code === 'Y') { srcLabel = '人工沿襲'; badgeClass = 'cell-carved'; }
      else if (code === 'N') { srcLabel = '自動擬音'; badgeClass = 'cell-nisim'; }

      const row = document.createElement('div');
      row.className = 'reading-item';
      row.innerHTML = `
        <div><strong>${dName}</strong>：<span style="font-family:monospace;font-size:15px;">${py}</span></div>
        <span class="v-badge ${badgeClass}">${srcLabel}</span>
      `;
      dom.modal.readingsList.appendChild(row);
    });

    dom.modal.queryBtn.href = `/?musiid=all&ca=${encodeURIComponent(item.c)}`;
    dom.modal.backdrop.classList.add('open');
  }

  function closeModal() {
    dom.modal.backdrop.classList.remove('open');
  }

  // DOM 載入後啟動
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
