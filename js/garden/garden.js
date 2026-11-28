// 客源翠庭院：一粒種子、一欉樹、淨有水滴。
// 水滴「推算」自既有的 hakkaDailyStats（唯讀）：今日到期復習／新詞題數 → 滴數，一日有上限。
// 本模組淨存 localStorage['hakfaGarden']：{ bank, poured, day, credited, demo }。
// 無肥料；幾日無來樹毋會枯。尚未接雲端同步（Phase 2）。
(function () {
  'use strict';

  var KEY = 'hakfaGarden';
  var DAILY_CAP = 8;
  var REVIEW_PER_DROP = 3; // 到期復習：全站最有學習效果，獎勵最高
  var NEW_PER_DROP = 5;
  var AUDIO_PER_DROP = 10; // 任何音檔播放（主表、日日一詞、遊戲）每 10 次 1 滴
  var STAGES = [
    { at: 0, name: '🌰 落泥' },
    { at: 1, name: '🌱 發芽' },
    { at: 4, name: '🌿 大欉' },
    { at: 9, name: '🌳 成樹' },
    { at: 15, name: '🌸 開花' }
  ];

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function load() {
    var s = null;
    try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { /* 壞掉就當空个 */ }
    s = s || {};
    // baseR／baseN：開發者「重設今日入帳」時記下个復習／新詞題數基準，今日淨計基準後背个新增量
    return { bank: s.bank | 0, poured: s.poured | 0, day: s.day || '', credited: s.credited | 0, demo: s.demo | 0,
      audio: s.audio | 0, baseR: s.baseR | 0, baseN: s.baseN | 0 };
  }
  function save(s) {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* 無法存就算 */ }
    try { window.dispatchEvent(new CustomEvent('hakfa-garden-change')); } catch (e) { /* 舊瀏覽器就算 */ }
  }

  var state = load();

  // 今日由學習換來个滴數（hakkaDailyStats 格式：[總題數, 答對, 復習, 新詞, ...]）
  function statsCounts() {
    try {
      var all = JSON.parse(localStorage.getItem('hakkaDailyStats') || '{}');
      var a = all[todayStr()] || [];
      return [a[2] | 0, a[3] | 0];
    } catch (e) { return [0, 0]; }
  }
  function earnedFromStats() {
    var c = statsCounts();
    return Math.floor(Math.max(0, c[0] - state.baseR) / REVIEW_PER_DROP) +
           Math.floor(Math.max(0, c[1] - state.baseN) / NEW_PER_DROP);
  }

  // 重算今日入帳，回傳這次新增个滴數（冪等：重複呼叫毋會重複給）
  function sync() {
    var t = todayStr();
    if (state.day !== t) { state.day = t; state.credited = 0; state.demo = 0; state.audio = 0; state.baseR = 0; state.baseN = 0; }
    var earned = Math.min(DAILY_CAP, earnedFromStats() + Math.floor(state.audio / AUDIO_PER_DROP) + state.demo);
    var gained = 0;
    if (earned > state.credited) {
      gained = earned - state.credited;
      state.bank += gained;
      state.credited = earned;
      save(state);
    }
    return gained;
  }

  function stageIndex(poured) {
    var idx = 0;
    for (var i = 0; i < STAGES.length; i++) if (poured >= STAGES[i].at) idx = i;
    return idx;
  }

  function pour() {
    if (state.bank < 1) return null;
    var before = stageIndex(state.poured);
    state.bank--; state.poured++;
    save(state);
    var after = stageIndex(state.poured);
    return { grew: after > before, stage: after };
  }

  function addDemoDrop() {
    state.demo++;
    return sync();
  }

  // ---- 開發者面板：淨開發測試用，預設毋顯示 ----
  // 開啟：網址加 ?garden-dev=1（會記在 localStorage.hakfaGardenDev）；關閉：?garden-dev=0
  function devEnabled(opts) {
    if (opts && opts.dev) return true;
    try {
      var m = /[?&]garden-dev=([01])/.exec(location.search);
      if (m) { localStorage.setItem('hakfaGardenDev', m[1]); }
      return localStorage.getItem('hakfaGardenDev') === '1';
    } catch (e) { return false; }
  }
  var dev = {
    addBank: function (n) { state.bank += n; save(state); },
    clearBank: function () { state.bank = 0; save(state); },
    // 今日入帳歸零，並以「現在」為新基準：今日已答个題數、已播个音檔毋再算，淨計往後新增个
    resetToday: function () {
      var c = statsCounts();
      state.credited = 0; state.demo = 0; state.audio = 0; state.baseR = c[0]; state.baseN = c[1];
      state.day = todayStr();
      save(state);
    },
    setStage: function (i) { state.poured = STAGES[i].at; save(state); },
    resetAll: function () {
      var c = statsCounts();
      state = { bank: 0, poured: 0, day: todayStr(), credited: 0, demo: 0, audio: 0, baseR: c[0], baseN: c[1] };
      save(state);
    }
  };

  // 庭院標題：「<名>个客源翠丹墀坪／庭院」；無設定名仔就淨「客源翠丹墀坪／庭院」
  function userName() {
    try { return (localStorage.getItem('hakkaUserName') || '').trim(); } catch (e) { return ''; }
  }
  function gardenTitle() {
    var n = userName();
    return (n ? n + '个' : '') + '客源翠丹墀坪／庭院';
  }
  function esc(t) {
    return String(t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function treeSvg(idx) {
    var g = '';
    if (idx === 0) {
      g += '<ellipse cx="160" cy="236" rx="9" ry="6" fill="#8a5a2b"/>';
    } else if (idx === 1) {
      g += '<path d="M160 244 V218" stroke="#5a8f3e" stroke-width="4" stroke-linecap="round"/>' +
           '<ellipse cx="150" cy="214" rx="12" ry="7" fill="#6cc26a" transform="rotate(-25 150 214)"/>' +
           '<ellipse cx="171" cy="212" rx="12" ry="7" fill="#7ed07a" transform="rotate(25 171 212)"/>';
    } else {
      var h = idx === 2 ? 70 : 110;
      var r = idx === 2 ? 30 : 46;
      var top = 244 - h;
      g += '<path d="M160 246 V' + top + '" stroke="#7a5230" stroke-width="' + (idx === 2 ? 7 : 11) + '" stroke-linecap="round"/>';
      g += '<circle cx="160" cy="' + (top - 4) + '" r="' + r + '" fill="#4fae5a"/>';
      g += '<circle cx="' + (160 - r * 0.6) + '" cy="' + (top + r * 0.2) + '" r="' + (r * 0.7) + '" fill="#5fc068"/>';
      g += '<circle cx="' + (160 + r * 0.6) + '" cy="' + (top + r * 0.15) + '" r="' + (r * 0.72) + '" fill="#45a051"/>';
      if (idx === 4) {
        [[-0.7, -0.5], [0.3, -0.9], [0.75, -0.1], [-0.2, 0.1], [0.1, -0.35], [-0.8, 0.25], [0.55, 0.45]].forEach(function (p) {
          var x = 160 + p[0] * r, y = top - 4 + p[1] * r;
          g += '<circle cx="' + x + '" cy="' + y + '" r="4.5" fill="#ffd1e0"/><circle cx="' + x + '" cy="' + y + '" r="1.8" fill="#ffb02e"/>';
        });
      }
    }
    return g;
  }

  function injectStyle() {
    if (document.getElementById('hakfa-garden-style')) return;
    var st = document.createElement('style');
    st.id = 'hakfa-garden-style';
    st.textContent =
      '.hg-card{--hg-sky:#e3f4ff;--hg-grass:#7cc576;--hg-ground:#8a6a4a;--hg-water:#2f7fc4;--hg-soft:#4b6b57;' +
      'margin:0 0 20px;padding:10px;border-radius:14px;background:rgba(128,128,128,.08)}' +
      '@media (prefers-color-scheme: dark){.hg-card{--hg-sky:#14243a;--hg-grass:#3f7a46;--hg-ground:#5a4430;--hg-water:#7cc4ff;--hg-soft:#a9c4b0}}' +
      '.hg-card h6{margin:0 0 6px}' +
      '.hg-yard{border-radius:12px;overflow:hidden;background:var(--hg-sky)}' +
      '.hg-yard svg{display:block;width:100%;max-height:200px;height:auto}' +
      '.hg-row{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px;flex-wrap:wrap}' +
      '.hg-row b{color:var(--hg-water);font-size:1.15rem}' +
      '.hg-btn{border:0;border-radius:10px;padding:8px 14px;background:var(--hg-water);color:#fff;cursor:pointer;font:inherit}' +
      '.hg-btn:disabled{opacity:.4;cursor:default}' +
      '.hg-btn.ghost{background:transparent;color:var(--hg-soft);border:1px dashed var(--hg-soft)}' +
      '.hg-dev{margin-top:10px;padding:8px;border:1px dashed var(--hg-soft);border-radius:10px;font-size:.85rem}' +
      '.hg-dev summary{cursor:pointer}.hg-dev-row{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:6px}' +
      '.hg-dev .hg-btn{padding:5px 10px;font-size:.8rem}' +
      '.hg-dock-btn{position:fixed;right:20px;top:calc(50% + 140px);transform:translateY(calc(-50% - 120px));' +
        'width:50px;height:50px;border-radius:50%;border:1px solid var(--border-color,#ccc);' +
        'background:var(--primary-btn-bg,#2f7fc4);color:var(--primary-btn-text,#fff);font-size:1.4rem;cursor:pointer;' +
        'box-shadow:0 4px 10px rgba(0,0,0,.3);z-index:1000;display:flex;align-items:center;justify-content:center;' +
        'transition:transform .2s,box-shadow .2s}' +
      '.hg-dock-btn:hover{transform:translateY(calc(-50% - 120px)) scale(1.1)}' +
      '.hg-badge{position:absolute;top:-4px;right:-4px;min-width:20px;height:20px;padding:0 5px;border-radius:10px;' +
        'background:#c62828;color:#fff;font-size:.75rem;line-height:20px;text-align:center;font-weight:700}' +
      '.hg-dock-pane{position:fixed;right:80px;top:80px;width:min(340px,calc(100vw - 100px));max-height:calc(100vh - 100px);' +
        'overflow-y:auto;overscroll-behavior:contain;z-index:1100;border-radius:14px;padding:6px;' +
        'background:var(--card-bg-color,#fff);color:var(--main-text-color,#1e293b);border:1px solid var(--border-color,#cbd5e1);' +
        'box-shadow:0 8px 24px rgba(0,0,0,.25)}' +
      '.hg-dock-pane[hidden]{display:none}' +
      '.hg-dock-pane .hg-card{margin:0}' +
      '.hg-dock-close{position:absolute;top:6px;right:8px;border:0;background:transparent;color:inherit;font-size:1rem;cursor:pointer;z-index:1}' +
      '@media (max-width:768px){.hg-dock-pane{left:0;right:0;top:auto;bottom:0;width:auto;max-height:60vh;border-radius:14px 14px 0 0}}' +
      '.hg-note{font-size:.78rem;color:var(--hg-soft);margin-top:6px}' +
      '.hg-msg{min-height:1.3em;font-size:.9rem;margin-top:4px}' +
      '.hg-tree{transform-origin:160px 250px;transition:transform .5s ease}.hg-tree.pop{transform:scale(1.06)}' +
      '.hg-drop{fill:var(--hg-water);animation:hg-fall .9s ease-in forwards}' +
      '@keyframes hg-fall{from{transform:translateY(-60px);opacity:1}to{transform:translateY(60px);opacity:0}}' +
      '@media (prefers-reduced-motion: reduce){.hg-tree{transition:none}.hg-drop{animation:none}}';
    document.head.appendChild(st);
  }

  // 把庭院卡畫進 el。opts.demo = true 時顯示「＋1 測試水滴」鈕（PoC 頁用）
  function mount(el, opts) {
    if (!el) return;
    opts = opts || {};
    var devOn = devEnabled(opts);
    injectStyle();
    sync();
    var msg = state.poured === 0 ? '種子在等第一滴水。' : '轉來啦，樹一直都在。';

    function devPanelHtml() {
      var stageBtns = STAGES.map(function (st, i) {
        return '<button class="hg-btn ghost" data-hg="dev-stage" data-i="' + i + '">' + st.name + '</button>';
      }).join('');
      return '<details class="hg-dev" open><summary>🛠 開發者面板</summary>' +
        '<div class="hg-dev-row"><button class="hg-btn ghost" data-hg="dev-add" data-n="1">＋1 💧</button>' +
        '<button class="hg-btn ghost" data-hg="dev-add" data-n="5">＋5 💧</button>' +
        '<button class="hg-btn ghost" data-hg="dev-clear">水滴歸零</button>' +
        '<button class="hg-btn ghost" data-hg="dev-today">重設今日入帳（從現在起算）</button></div>' +
        '<div class="hg-dev-row">跳到：' + stageBtns + '</div>' +
        '<div class="hg-dev-row"><button class="hg-btn ghost" data-hg="dev-all">全部重置（樹＋水滴＋今日入帳）</button>' +
        '<button class="hg-btn ghost" data-hg="dev-off">關閉面板</button></div>' +
        '<div class="hg-note">只改 hakfaGarden，毋會動學習進度摎統計。</div></details>';
    }

    function draw(popped) {
      var idx = stageIndex(state.poured);
      el.innerHTML =
        '<div class="hg-card">' +
          '<h6>🌱 ' + esc(gardenTitle()) + '</h6>' +
          '<div class="hg-yard"><svg viewBox="0 0 320 280" role="img" aria-label="' + esc(gardenTitle()) + '，庭院裡的一欉樹">' +
            '<rect x="0" y="238" width="320" height="42" fill="var(--hg-grass)"/>' +
            '<ellipse cx="160" cy="250" rx="70" ry="12" fill="var(--hg-ground)"/>' +
            '<g class="hg-tree' + (popped ? ' pop' : '') + '">' + treeSvg(idx) + '</g>' +
            '<g class="hg-drops"></g></svg></div>' +
          '<div class="hg-msg" aria-live="polite">' + msg + '</div>' +
          '<div class="hg-row"><div>💧 <b>' + state.bank + '</b>　<small>' + STAGES[idx].name + '（已澆 ' + state.poured + ' 滴）</small></div>' +
            '<button class="hg-btn" data-hg="pour"' + (state.bank < 1 ? ' disabled' : '') + '>澆水</button></div>' +
          '<div class="hg-row"><small>今晡日入帳 ' + state.credited + '／' + DAILY_CAP + ' 滴（播音檔 <span class="hg-audio">' + state.audio + '</span> 擺）</small>' +
            (opts.demo ? '<button class="hg-btn ghost" data-hg="demo"' + (state.credited >= DAILY_CAP ? ' disabled' : '') + '>＋1 測試水滴</button>' : '') + '</div>' +
          '<div class="hg-note">每 ' + REVIEW_PER_DROP + ' 題到期復習 1 滴、每 ' + NEW_PER_DROP + ' 題新詞 1 滴、每播 ' + AUDIO_PER_DROP + ' 擺音檔 1 滴，一日上濟 ' + DAILY_CAP + ' 滴。無肥料；幾日無來樹也毋會枯。</div>' +
          (devOn ? devPanelHtml() : '') +
        '</div>';
    }

    el.onclick = function (ev) {
      var b = ev.target.closest && ev.target.closest('[data-hg]');
      if (!b || b.disabled) return;
      if (b.getAttribute('data-hg') === 'pour') {
        var r = pour();
        if (!r) return;
        msg = r.grew ? '長大了！' + STAGES[r.stage].name : '咕嚕咕嚕～';
        draw(r.grew);
        var g = el.querySelector('.hg-drops');
        if (g) {
          var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          p.setAttribute('d', 'M160 150 q-8 14 0 18 q8 -4 0 -18z');
          p.setAttribute('class', 'hg-drop');
          g.appendChild(p);
        }
      } else if (b.getAttribute('data-hg') === 'demo') {
        addDemoDrop();
        msg = '（測試）加一滴水';
        draw(false);
      } else if (b.getAttribute('data-hg').indexOf('dev-') === 0 && devOn) {
        var act = b.getAttribute('data-hg');
        if (act === 'dev-add') { dev.addBank(parseInt(b.getAttribute('data-n'), 10) || 1); msg = '（開發）加水滴'; }
        else if (act === 'dev-clear') { dev.clearBank(); msg = '（開發）水滴歸零'; }
        else if (act === 'dev-today') { dev.resetToday(); msg = '（開發）今日入帳已重設，從現在起算'; }
        else if (act === 'dev-stage') { dev.setStage(parseInt(b.getAttribute('data-i'), 10) || 0); msg = '（開發）跳階'; }
        else if (act === 'dev-all') { dev.resetAll(); msg = '（開發）全部重置'; }
        else if (act === 'dev-off') {
          try { localStorage.setItem('hakfaGardenDev', '0'); } catch (e) { /* 無法存就算 */ }
          devOn = false; opts.dev = false; msg = '開發者面板已關閉（網址加 ?garden-dev=1 再開）';
        }
        draw(act === 'dev-stage');
      }
    };
    draw(false);
  }

  // ---- 音檔播放計滴：任何 audio（主表、日日一詞、遊戲）每 AUDIO_PER_DROP 擺 1 滴 ----
  var AUDIO_IGNORE_RE = /(^|\/)(endOfPlay|empty_category)\.mp3(\?|$)/; // 提示音效毋算
  function onAudioPlayed() {
    var gained = sync(); // 先處理換日
    state.audio++;
    gained += sync();
    save(state); // 計數有變，愛落地
    var cnt = document.querySelector('.hg-audio');
    if (cnt) cnt.textContent = state.audio;
    if (gained > 0) {
      if (dock.refresh) dock.refresh();
      if (typeof window.showGardenDropHint === 'function') window.showGardenDropHint(gained);
    }
  }
  // 包一層 HTMLMediaElement.prototype.play：淨有真正開始播（promise 成功）正算，毋影響原本回傳值
  (function patchAudioPlay() {
    if (typeof HTMLMediaElement === 'undefined' || HTMLMediaElement.prototype.__hakfaGardenPatched) return;
    var orig = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      var src = this.currentSrc || this.src || '';
      var ret = orig.apply(this, arguments);
      if (!AUDIO_IGNORE_RE.test(src) && ret && typeof ret.then === 'function') {
        ret.then(function () { try { onAudioPlayed(); } catch (e) { /* 計數失敗毋影響播放 */ } }, function () {});
      }
      return ret;
    };
    HTMLMediaElement.prototype.__hakfaGardenPatched = true;
  })();

  window.hakfaGarden = {
    mount: mount,
    sync: sync,
    // 使用者名仔改了、抑係共步下來新名仔，重畫標題
    refresh: function () { if (dock.refresh) dock.refresh(); },
    dev: dev, // 開發者面板用，亦可在 Console 直接呼叫（例：hakfaGarden.dev.addBank(3)）
    pour: pour,
    getState: function () { return JSON.parse(JSON.stringify(state)); },
    // 答題後呼叫：入帳新水滴，有新增就回傳滴數，供畫面提示
    onStatsChanged: function () {
      var gained = sync();
      if (gained > 0 && dock.refresh) dock.refresh();
      return gained;
    }
  };

  // ---- 浮動「庭院」鈕摎面板：主站任何頁面都做得開，答題時繼續開著，看水滴累積 ----
  // 按鈕疊在「日日一詞」鈕上背；寬螢幕係右側面板，窄螢幕係底部抽屜。
  var dock = {};
  var DOCK_OPEN_KEY = 'hakfaGardenDockOpen';

  function initDock() {
    // 淨有主站（有浮動遊戲鈕）正掛；garden-poc.html 等獨立頁毋掛
    if (!document.getElementById('floatingStartGameBtn') || document.getElementById('gardenDockBtn')) return;
    injectStyle();

    var btn = document.createElement('button');
    btn.id = 'gardenDockBtn';
    btn.type = 'button';
    btn.className = 'hg-dock-btn';
    btn.setAttribute('aria-label', gardenTitle());
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = '<span aria-hidden="true">💧</span><span class="hg-badge" id="gardenDockBadge" hidden>0</span>';
    var pane = document.createElement('aside');
    pane.id = 'gardenDockPane';
    pane.className = 'hg-dock-pane';
    pane.setAttribute('aria-label', gardenTitle());
    pane.hidden = true;
    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'hg-dock-close';
    closeBtn.setAttribute('aria-label', '關閉庭院');
    closeBtn.textContent = '✕';
    var body = document.createElement('div');
    pane.appendChild(closeBtn);
    pane.appendChild(body);
    document.body.appendChild(btn);
    document.body.appendChild(pane);

    function updateBadge() {
      var b = document.getElementById('gardenDockBadge');
      if (!b) return;
      b.textContent = String(state.bank);
      b.hidden = state.bank < 1;
      btn.title = '庭院：有 ' + state.bank + ' 滴水可以澆';
    }
    function setOpen(open) {
      pane.hidden = !open;
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) mount(body);
      try { localStorage.setItem(DOCK_OPEN_KEY, open ? '1' : '0'); } catch (e) { /* 無法存就算 */ }
    }
    dock.refresh = function () {
      btn.setAttribute('aria-label', gardenTitle());
      pane.setAttribute('aria-label', gardenTitle());
      updateBadge();
      if (!pane.hidden) mount(body);
    };

    btn.addEventListener('click', function () { setOpen(pane.hidden); });
    closeBtn.addEventListener('click', function () { setOpen(false); });
    window.addEventListener('hakfa-garden-change', updateBadge);

    sync();
    updateBadge();
    var wasOpen = false;
    try { wasOpen = localStorage.getItem(DOCK_OPEN_KEY) === '1'; } catch (e) { /* 無法讀就當關 */ }
    if (wasOpen) setOpen(true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initDock);
  else initDock();
})();
