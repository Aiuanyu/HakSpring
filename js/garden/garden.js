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
    return { bank: s.bank | 0, poured: s.poured | 0, day: s.day || '', credited: s.credited | 0, demo: s.demo | 0 };
  }
  function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* 無法存就算 */ } }

  var state = load();

  // 今日由學習換來个滴數（hakkaDailyStats 格式：[總題數, 答對, 復習, 新詞, ...]）
  function earnedFromStats() {
    try {
      var all = JSON.parse(localStorage.getItem('hakkaDailyStats') || '{}');
      var a = all[todayStr()] || [];
      return Math.floor((a[2] | 0) / REVIEW_PER_DROP) + Math.floor((a[3] | 0) / NEW_PER_DROP);
    } catch (e) { return 0; }
  }

  // 重算今日入帳，回傳這次新增个滴數（冪等：重複呼叫毋會重複給）
  function sync() {
    var t = todayStr();
    if (state.day !== t) { state.day = t; state.credited = 0; state.demo = 0; }
    var earned = Math.min(DAILY_CAP, earnedFromStats() + state.demo);
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
    injectStyle();
    sync();
    var msg = state.poured === 0 ? '種子在等第一滴水。' : '轉來啦，樹一直都在。';

    function draw(popped) {
      var idx = stageIndex(state.poured);
      el.innerHTML =
        '<div class="hg-card">' +
          '<h6>🌱 客源翠庭院</h6>' +
          '<div class="hg-yard"><svg viewBox="0 0 320 280" role="img" aria-label="庭院裡的一欉樹">' +
            '<rect x="0" y="238" width="320" height="42" fill="var(--hg-grass)"/>' +
            '<ellipse cx="160" cy="250" rx="70" ry="12" fill="var(--hg-ground)"/>' +
            '<g class="hg-tree' + (popped ? ' pop' : '') + '">' + treeSvg(idx) + '</g>' +
            '<g class="hg-drops"></g></svg></div>' +
          '<div class="hg-msg" aria-live="polite">' + msg + '</div>' +
          '<div class="hg-row"><div>💧 <b>' + state.bank + '</b>　<small>' + STAGES[idx].name + '（已澆 ' + state.poured + ' 滴）</small></div>' +
            '<button class="hg-btn" data-hg="pour"' + (state.bank < 1 ? ' disabled' : '') + '>澆水</button></div>' +
          '<div class="hg-row"><small>今晡日入帳 ' + state.credited + '／' + DAILY_CAP + ' 滴</small>' +
            (opts.demo ? '<button class="hg-btn ghost" data-hg="demo"' + (state.credited >= DAILY_CAP ? ' disabled' : '') + '>＋1 測試水滴</button>' : '') + '</div>' +
          '<div class="hg-note">每 ' + REVIEW_PER_DROP + ' 題到期復習 1 滴、每 ' + NEW_PER_DROP + ' 題新詞 1 滴，一日上濟 ' + DAILY_CAP + ' 滴。無肥料；幾日無來樹也毋會枯。</div>' +
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
      }
    };
    draw(false);
  }

  window.hakfaGarden = {
    mount: mount,
    sync: sync,
    pour: pour,
    getState: function () { return JSON.parse(JSON.stringify(state)); },
    // 答題後呼叫：入帳新水滴，有新增就回傳滴數，供畫面提示
    onStatsChanged: function () { return sync(); }
  };
})();
