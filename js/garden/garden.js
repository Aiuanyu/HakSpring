// 客源翠庭院：樹、水缸、樹仁（種子）。
// 資料結構見 js/garden/garden-data.js（版本化、只增不減个帳本，跨裝置合併毋會互相蓋掉，改版有升級路徑摎備份）。
// 本檔：把帳本接到畫面、答題摎音檔入帳、雲端同步介面（mergeIncoming／exportForSync）、開發者面板。
// 水滴「推算」自既有个 hakkaDailyStats（唯讀）摎完整播完个音檔擺數；入帳無上限、淋水無日限；無肥料；幾日無來樹毋會枯。
(function () {
  'use strict';

  var GD = window.hakfaGardenData;
  if (!GD) { console.warn('[garden] 缺 garden-data.js，庭院毋啟動'); return; }

  var KEY = 'hakfaGarden';            // 帳本（v2，會同步）
  var LOCAL_KEY = 'hakfaGardenLocal'; // 這台裝置个私人狀態：{ dev, sel, seq }（毋同步）
  var BACKUP_PREFIX = 'hakfaGardenBackup-'; // 升級前个原始資料備份，留最近 3 份
  var REVIEW_PER_DROP = 3; // 到期復習：全站最有學習效果，獎勵最高
  var NEW_PER_DROP = 5;
  var AUDIO_PER_DROP = 10; // 任何音檔（主表、日日一詞）完整播完，每 10 擺 1 滴
  var RECALC_DAYS = 14;    // 每次入帳重算最近幾日（雲端同步晚到个答題統計也會補入帳，淨增毋減）
  // 種子種類：price＝幾滴水換 1 粒。往後新種類（性質／等級）加在這，價錢無共樣
  var SEEDS = { common: { name: '🌰 樹仁', price: 10 } };
  var MAX_PLOTS = GD.MAX_PLOTS; // 庭院最多幾塊地（暫定；地愛濟，排版自動變格狀）
  // 階段：落泥、生筍、樹秧、大樹、開花、打子（結出種莢，預埋往後會有產物个伏筆）。at＝累積淋幾滴到這階段（暫定）
  var STAGES = [
    { at: 0, name: '🌰 落泥' },
    { at: 1, name: '🌱 生筍' },
    { at: 4, name: '🌿 樹秧' },
    { at: 9, name: '🌳 大樹' },
    { at: 15, name: '🌸 開花' },
    { at: 22, name: '🫘 打子' }
  ];

  function dayStr(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function todayStr() { return dayStr(new Date()); }

  // ---- 這台裝置个私人狀態 ----
  function loadLocal() {
    var l = null;
    try { l = JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null'); } catch (e) { /* 壞掉就重生 */ }
    l = l || {};
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(l.dev || '')) l.dev = 'd' + Math.random().toString(36).slice(2, 8);
    l.seq = l.seq | 0;
    l.sel = typeof l.sel === 'string' ? l.sel : GD.STARTER;
    return l;
  }
  function saveLocal() { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(local)); } catch (e) { /* 無法存就算 */ } }
  var local = loadLocal();
  saveLocal();
  var view = { z: 1, x: 0, y: 0 }; // 地形畫面个縮放摎平移（淨在本機、毋同步、毋存）

  // ---- 載入帳本（含升級、備份、新版本保護） ----
  var G = null;           // 帳本
  var newerFlag = false;  // 資料來自較新个版本：毋讀、毋改、毋推
  var pending = null;     // 有愛使用者同意个升級步驟
  var rawStored = null;

  function backupRaw(raw, from) {
    try {
      localStorage.setItem(BACKUP_PREFIX + 'v' + from + '-' + Date.now(), JSON.stringify(raw));
      var keys = [];
      for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf(BACKUP_PREFIX) === 0) keys.push(k); }
      keys.sort(); // 時間戳記由小到大
      while (keys.length > 3) localStorage.removeItem(keys.shift());
    } catch (e) { /* 備份失敗毋阻擋 */ }
  }
  function randomSeed() { return Math.floor(Math.random() * 2147483646) + 1; }
  function loadLedger(consented) {
    var raw = null;
    try { raw = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { raw = null; }
    rawStored = raw;
    var res = GD.normalize(raw, { dev: local.dev, day: todayStr(), seed: randomSeed() }, { consented: !!consented });
    if (res.newer) { newerFlag = true; G = GD.emptyState(todayStr()); return; }
    if (res.pendingConsent) { pending = res.pendingConsent; G = GD.emptyState(todayStr()); return; }
    pending = null;
    G = res.state;
    var seeded = false;
    if (!G.seed) { G.seed = randomSeed(); seeded = true; } // 地圖種子：新存檔隨機一個，之後同步會收斂到同一座山
    if (res.steps.length) { backupRaw(raw, res.from); persist(false); } // 升級前先備份，再寫新格式
    else if (seeded) { persist(false); }
  }

  // 讀取模型：畫面用个唯讀推算結果（每次帳本有變就重算）
  var state = { bank: 0, plots: [], sel: 0, seeds: {}, credited: 0, audio: 0 };
  function rebuild() {
    var d = GD.derive(G), t = todayStr();
    var plots = d.plots.map(function (q) { return { id: q.id, k: q.k, n: q.n, x: q.x, y: q.y }; });
    var sel = 0;
    for (var i = 0; i < plots.length; i++) if (plots[i].id === local.sel) sel = i;
    state = { bank: d.bank, plots: plots, sel: sel, seeds: d.seeds, credited: G.earned[t] | 0, audio: GD.audioTotal(G, t) };
    Object.keys(SEEDS).forEach(function (k) { if (!(k in state.seeds)) state.seeds[k] = 0; });
    return d;
  }
  function persist(notify) {
    if (newerFlag || pending) return; // 讀毋懂个版本，毋寫
    try { localStorage.setItem(KEY, JSON.stringify(G)); } catch (e) { /* 無法存就算 */ }
    rebuild();
    if (notify !== false) {
      try { window.dispatchEvent(new CustomEvent('hakfa-garden-change')); } catch (e) { /* 舊瀏覽器就算 */ }
      if (typeof window.triggerCloudSync === 'function') { try { window.triggerCloudSync(); } catch (e) { /* 同步失敗毋影響遊戲 */ } }
    }
  }
  loadLedger(false);
  rebuild();

  // ---- 入帳：由學習統計、完整播完个音檔推算，淨增毋減 ----
  function statsCounts(day) {
    try {
      var all = JSON.parse(localStorage.getItem('hakkaDailyStats') || '{}');
      var a = all[day] || [];
      return [a[2] | 0, a[3] | 0];
    } catch (e) { return [0, 0]; }
  }
  function earnedForDay(day) {
    var c = statsCounts(day), b = G.base[day] || [0, 0];
    return Math.floor(Math.max(0, c[0] - b[0]) / REVIEW_PER_DROP) +
           Math.floor(Math.max(0, c[1] - b[1]) / NEW_PER_DROP) +
           Math.floor(GD.audioTotal(G, day) / AUDIO_PER_DROP);
  }
  // 重算入帳，回傳這次新增个滴數（冪等：重複呼叫毋會重複給）
  function sync() {
    if (newerFlag || pending) return 0;
    var t = todayStr(), before = GD.derive(G).earnedTotal, changed = false;
    if (!G.since) { G.since = t; changed = true; }
    var d = new Date();
    for (var i = RECALC_DAYS - 1; i >= 0; i--) {
      var dd = new Date(d.getFullYear(), d.getMonth(), d.getDate() - i), ds = dayStr(dd);
      if (ds < G.since) continue; // 開始日前背个毋算（舊資料升級前已經算過）
      if (GD.setEarned(G, ds, earnedForDay(ds))) changed = true;
    }
    if (changed) persist(true); else rebuild();
    return Math.max(0, GD.derive(G).earnedTotal - before);
  }

  function stageIndex(poured) {
    var idx = 0;
    for (var i = 0; i < STAGES.length; i++) if (poured >= STAGES[i].at) idx = i;
    return idx;
  }

  function selPlot() { return state.plots[state.sel] || state.plots[0]; }
  function totalPoured() { return state.plots.reduce(function (a, q) { return a + q.n; }, 0); }

  function pour() {
    if (newerFlag || pending) return null;
    sync(); // 先處理換日
    var q = selPlot();
    if (!q) return null;
    if (stageIndex(q.n) >= STAGES.length - 1) return null; // 打子矣，毋使再過淋水
    var before = stageIndex(q.n);
    if (!GD.pour(G, q.id, local.dev)) return null; // 淋水無日限：一日就看著一欉樹開花也做得
    persist(true);
    return { grew: stageIndex(selPlot().n) > before, stage: stageIndex(selPlot().n) };
  }

  // 水缸換種子：回傳 true／false（水毋夠、毋識這種種子）
  function buySeed(kind) {
    var d = SEEDS[kind];
    if (newerFlag || pending || !d || !GD.buy(G, kind, d.price, local.dev)) return false;
    persist(true);
    return true;
  }
  // 種下一粒種子：多一塊地（地滿就毋得）
  function plant(kind, pos) {
    if (newerFlag || pending || !SEEDS[kind]) return false;
    local.seq++;
    var id = local.dev + '_' + local.seq;
    if (!GD.plant(G, kind, id, Math.floor(Date.now() / 1000), MAX_PLOTS, pos)) { local.seq--; return false; }
    local.sel = id; saveLocal();
    persist(true);
    return true;
  }
  function canPlaceAt(x, y) { return !newerFlag && !pending && GD.canPlaceAt(G, x, y); }
  function selectPlot(i) {
    if (i < 0 || i >= state.plots.length) return;
    local.sel = state.plots[i].id; saveLocal();
    rebuild();
  }

  // ---- 雲端同步介面（由 js/cloud-sync.js 呼叫） ----
  // 匯出：新版本抑係待同意時毋推（回傳 null），免得蓋掉別台較新个資料
  function exportForSync() {
    if (newerFlag || pending) return null;
    return JSON.parse(JSON.stringify(G));
  }
  // 合併雲端／備份資料進來；回傳 { skipped, pushNeeded }。冪等，合併順序毋影響結果。
  function mergeIncoming(raw) {
    if (!raw || typeof raw !== 'object') return { skipped: true, pushNeeded: false };
    if (newerFlag || pending) return { skipped: true, pushNeeded: false };
    var res = GD.normalize(raw, { dev: local.dev, day: todayStr() });
    if (res.newer) { newerFlag = true; return { skipped: true, pushNeeded: false }; } // 雲端係較新版本，這台毋碰
    if (res.pendingConsent) return { skipped: true, pushNeeded: false };
    var merged = GD.merge(G, res.state);
    var localChanged = !GD.equal(merged, G);
    G = merged;
    if (!G.since) G.since = todayStr();
    sync(); // 同步下來个答題統計，馬上補入帳
    if (localChanged) persist(false);
    rebuild();
    if (dock.refresh) dock.refresh();
    return { skipped: false, pushNeeded: !GD.equal(G, res.state) };
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
  // 歸零、降階這類「減少」个操作，帳本做無到（只增不減），愛用「新紀元」：高紀元會取代所有裝置个舊紀元資料
  function rewrite(fn) {
    G = GD.newEpoch(G, Date.now(), fn);
    persist(true);
  }
  var dev = {
    addBank: function (n) { GD.adjust(G, local.dev, n, 0); persist(true); },
    clearBank: function () { GD.adjust(G, local.dev, 0, GD.derive(G).bank); persist(true); },
    // 今日入帳歸零，並以「現在」為新基準：今日已答个題數、已播个音檔毋再算，淨計往後新增个
    resetToday: function () {
      var t = todayStr(), c = statsCounts(t);
      rewrite(function (g) { delete g.earned[t]; delete g.audio[t]; g.base[t] = [c[0], c[1]]; });
    },
    setStage: function (i) {
      var q = selPlot(), target = STAGES[i].at;
      if (target > q.n) { G.spent[q.id] = G.spent[q.id] || {}; G.spent[q.id][local.dev] = (G.spent[q.id][local.dev] | 0) + (target - q.n); persist(true); }
      else rewrite(function (g) { g.spent[q.id] = {}; g.spent[q.id][local.dev] = target; });
    },
    addSeed: function (kind) { if (SEEDS[kind]) { GD.addSeed(G, kind, local.dev); persist(true); } },
    resetAll: function () {
      var t = todayStr(), c = statsCounts(t), ep = Math.max(Date.now(), G.ep + 1);
      G = GD.emptyState(t, G.seed); G.ep = ep; G.base[t] = [c[0], c[1]]; // 保留同一座山
      local.sel = GD.STARTER; saveLocal();
      persist(true);
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

  // ---- 相思樹（臺灣北部丘陵最常見个樹）手繪風 SVG：200×240 畫布，地面約 y=208 ----
  // 顏色全部用 CSS 變數（見 injectStyle），淺色／暗色自動切換；毋用濾鏡、毋做常駐動畫（省 GPU）。
  var V = function (n) { return 'var(--hg-' + n + ')'; };
  function rng(seed) { var x = seed >>> 0; return function () { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; }
  function blob(cx, cy, rx, ry, seed, n, j) { // 不規則形狀，手繪感由形狀本身來
    n = n || 9; j = j == null ? 0.13 : j;
    var r = rng(seed), pt = [], i;
    for (i = 0; i < n; i++) { var a = (i / n) * Math.PI * 2, k = 1 + (r() - 0.5) * 2 * j; pt.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]); }
    var d = 'M' + pt[0][0].toFixed(1) + ' ' + pt[0][1].toFixed(1);
    for (i = 0; i < n; i++) {
      var p0 = pt[(i - 1 + n) % n], p1 = pt[i], p2 = pt[(i + 1) % n], p3 = pt[(i + 2) % n];
      d += 'C' + (p1[0] + (p2[0] - p0[0]) / 6).toFixed(1) + ' ' + (p1[1] + (p2[1] - p0[1]) / 6).toFixed(1) + ' ' + (p2[0] - (p3[0] - p1[0]) / 6).toFixed(1) + ' ' + (p2[1] - (p3[1] - p1[1]) / 6).toFixed(1) + ' ' + p2[0].toFixed(1) + ' ' + p2[1].toFixed(1);
    }
    return d + 'Z';
  }
  function sp(d, fill, line, w, extra) {
    return '<path d="' + d + '" fill="' + fill + '"' + (line ? ' stroke="' + line + '" stroke-width="' + (w || 1.5) + '" stroke-linejoin="round" stroke-linecap="round"' : '') + (extra || '') + '/>';
  }
  function limb(d, w) { // 有輪廓个枝幹
    return '<path d="' + d + '" fill="none" stroke="' + V('line') + '" stroke-width="' + (w + 3) + '" stroke-linecap="round"/>' +
      '<path d="' + d + '" fill="none" stroke="' + V('trunk') + '" stroke-width="' + w + '" stroke-linecap="round"/>' +
      '<path d="' + d + '" fill="none" stroke="' + V('trunk-dark') + '" stroke-width="' + Math.max(1, w * 0.22) + '" stroke-linecap="round" opacity=".5" transform="translate(' + (w * 0.18) + ' 0)"/>';
  }
  function sickle(x, y, rot, sc, fill) { // 相思樹个葉：彎月形
    return '<g transform="translate(' + x + ' ' + y + ') rotate(' + rot + ') scale(' + sc + ')"><path d="M0 0C5 -9 14 -11 24 -6C15 -7 6 -4 0 0Z" fill="' + fill + '" stroke="' + V('line') + '" stroke-width="1.1" stroke-linejoin="round"/></g>';
  }
  function pom(x, y, sc) { // 金黃絨球花
    var g = '<g transform="translate(' + x + ' ' + y + ') scale(' + sc + ')"><circle r="4.4" fill="' + V('flower') + '" stroke="' + V('line') + '" stroke-width=".8"/><circle r="2.6" cx="-.8" cy="-.8" fill="' + V('flower-hi') + '"/>';
    for (var i = 0; i < 6; i++) g += '<circle cx="' + (Math.cos(i * 1.05) * 3.6).toFixed(1) + '" cy="' + (Math.sin(i * 1.05) * 3.6).toFixed(1) + '" r=".7" fill="' + V('flower-hi') + '"/>';
    return g + '</g>';
  }
  function pod(x, y, rot, sc) { // 種莢：扁長、微彎、褐色
    var d = 'M0 0C2 6 2 12 0 19';
    return '<g transform="translate(' + x + ' ' + y + ') rotate(' + rot + ') scale(' + sc + ')"><path d="' + d + '" fill="none" stroke="' + V('line') + '" stroke-width="5" stroke-linecap="round"/><path d="' + d + '" fill="none" stroke="' + V('pod') + '" stroke-width="3" stroke-linecap="round"/><path d="M-.6 3C.4 8 .4 12 -.6 16" fill="none" stroke="' + V('pod-hi') + '" stroke-width=".9" stroke-linecap="round"/></g>';
  }
  function cluster(cx, cy, rx, ry, seed, leaves) { // 一叢疏疏个樹葉
    var o = '', r = rng(seed + 7), i;
    o += sp(blob(cx, cy, rx, ry, seed, 9, 0.16), V('leaf-dark'), V('line'), 1.4, ' opacity=".92"');
    o += sp(blob(cx - rx * 0.06, cy - ry * 0.1, rx * 0.84, ry * 0.76, seed + 3, 9, 0.16), V('leaf'), null, 0, ' opacity=".95"');
    o += sp(blob(cx - rx * 0.28, cy - ry * 0.34, rx * 0.4, ry * 0.3, seed + 5, 7, 0.18), V('leaf-light'), null, 0, ' opacity=".85"');
    for (i = 0; i < leaves; i++) {
      var a = r() * Math.PI * 2, d = r() * 0.8;
      o += sickle((cx + Math.cos(a) * rx * d - 9).toFixed(1), (cy + Math.sin(a) * ry * d).toFixed(1), (r() * 360).toFixed(0), (0.5 + r() * 0.3).toFixed(2), r() > 0.5 ? V('leaf-mid') : V('leaf-light'));
    }
    return o;
  }
  function sparkle(x, y, sc) { return '<path transform="translate(' + x + ' ' + y + ') scale(' + sc + ')" d="M0 -6L1.6 -1.6L6 0L1.6 1.6L0 6L-1.6 1.6L-6 0L-1.6 -1.6Z" fill="' + V('spark') + '"/>'; }

  // stage 0~5；lod＝true（地塊多、每欉畫得小）時簡化葉片與花
  function treeSvg(idx, lod) {
    var g = '<ellipse cx="100" cy="212" rx="60" ry="10" fill="' + V('shadow') + '"/>' +
      sp(blob(100, 206, 44, 11, 7 + idx, 10, 0.07), V('soil'), V('line'), 1.4) +
      sp(blob(92, 203, 22, 4.5, 11, 8, 0.1), V('soil-dark'), null, 0, ' opacity=".35"');
    if (idx === 0) { // 落泥：種子細細粒、扁扁、深褐色
      return g + sp(blob(100, 199, 7, 5, 3, 7, 0.1), V('seed'), V('line'), 1.2) + sp(blob(98, 197, 2.6, 1.6, 5, 6, 0.1), V('seed-hi'), null, 0, ' opacity=".8"') + sparkle(120, 178, 1) + sparkle(80, 164, 0.7);
    }
    if (idx === 1) { // 生筍：幼苗是羽狀複葉（像蕨）
      g += limb('M100 204C100 192 99 180 101 168', 3);
      [-1, 1].forEach(function (sd) {
        for (var i = 0; i < 6; i++) {
          var ex = 101 + sd * (6 + i * 4.5), ey = 168 - i * 1.2;
          g += '<ellipse cx="' + ex + '" cy="' + ey + '" rx="3.2" ry="1.7" transform="rotate(' + (sd * -18) + ' ' + ex + ' ' + ey + ')" fill="' + V('leaf-mid') + '" stroke="' + V('line') + '" stroke-width=".7"/>';
        }
      });
      return g + '<ellipse cx="102" cy="162" rx="3" ry="3.2" fill="' + V('leaf-light') + '" stroke="' + V('line') + '" stroke-width=".8"/>' + sparkle(130, 150, 0.8);
    }
    if (idx === 2) { // 樹秧：細長微彎，開始有彎月形葉
      g += limb('M100 206C97 186 104 170 99 148', 6) + limb('M99 168C86 160 76 154 70 144', 3) + limb('M101 158C114 150 124 146 130 136', 2.6);
      return g + cluster(72, 136, 22, 11, 41, lod ? 2 : 5) + cluster(130, 128, 22, 11, 42, lod ? 2 : 5) + cluster(100, 124, 28, 13, 43, lod ? 2 : 6);
    }
    // 大樹／開花／打子：彎曲个主幹、三根枝、七叢疏葉
    g += limb('M100 206C94 180 108 160 96 134C92 120 98 112 100 100', 11) + limb('M99 156C84 146 70 138 56 124', 5) + limb('M101 140C118 132 132 122 146 108', 5) + limb('M97 120C90 108 86 100 82 88', 4);
    var cs = [[52, 116, 28, 14], [76, 96, 30, 15], [104, 82, 32, 15], [132, 98, 30, 15], [150, 112, 26, 13], [100, 108, 34, 15], [70, 128, 22, 11]];
    cs.forEach(function (c, i) { g += cluster(c[0], c[1], c[2], c[3], 51 + i * 5, lod ? 2 : 6); });
    var fr = rng(9), f, c, a, d;
    if (idx === 4) { // 開花：金黃絨球花滿樹
      for (f = 0; f < (lod ? 10 : 26); f++) {
        c = cs[Math.floor(fr() * cs.length)]; a = fr() * Math.PI * 2; d = 0.4 + fr() * 0.6;
        g += pom((c[0] + Math.cos(a) * c[2] * d).toFixed(1), (c[1] + Math.sin(a) * c[3] * d - 2).toFixed(1), (0.7 + fr() * 0.5).toFixed(2));
      }
      g += sparkle(160, 64, 0.9) + sparkle(44, 56, 0.7);
    }
    if (idx === 5) { // 打子：殘留幾朵花，葉叢下垂著褐色種莢
      for (f = 0; f < (lod ? 3 : 7); f++) {
        c = cs[Math.floor(fr() * cs.length)]; a = fr() * Math.PI * 2; d = 0.4 + fr() * 0.6;
        g += pom((c[0] + Math.cos(a) * c[2] * d).toFixed(1), (c[1] + Math.sin(a) * c[3] * d - 2).toFixed(1), (0.65 + fr() * 0.35).toFixed(2));
      }
      for (f = 0; f < (lod ? 8 : 16); f++) {
        c = cs[Math.floor(fr() * cs.length)]; d = (fr() - 0.5) * 1.5;
        g += pod((c[0] + d * c[2] * 0.8).toFixed(1), (c[1] + c[3] * 0.55).toFixed(1), ((fr() - 0.5) * 24).toFixed(0), (0.8 + fr() * 0.35).toFixed(2));
      }
      g += sparkle(160, 64, 0.8);
    }
    return g;
  }

  function injectStyle() {
    if (document.getElementById('hakfa-garden-style')) return;
    var st = document.createElement('style');
    st.id = 'hakfa-garden-style';
    st.textContent =
      // 色票自給：站上沒定義 --card-bg-color 等變數，毋倚靠。對比度（WCAG）實算：
      // 淺色 按鈕白字/#1f6fb5 5.25、水滴數 #1f6fb5/卡面 4.82、說明字 #3d5a47/卡面 7.00、面板字 #1e293b/#fff 14.63
      // 暗色 按鈕 #0b1b2b/#7cc4ff 9.29、水滴數 #7cc4ff/卡面 6.74、說明字 #b9d1c0/卡面 7.79、面板字 #e0e0e0/#2c2c2c 10.58
      '.hg-card,.hg-dock-pane,.hg-dock-btn{--hg-leaf-dark:#5a9a58;--hg-leaf:#7db96a;--hg-leaf-mid:#98c97a;--hg-leaf-light:#c4e39a;' +
        '--hg-trunk:#9a6e4b;--hg-trunk-dark:#6f4d33;--hg-line:#5e432c;--hg-flower:#ffd23f;--hg-flower-hi:#fff2a8;--hg-pod:#b58a52;--hg-pod-hi:#e0c08a;' +
        '--hg-seed:#4a3426;--hg-seed-hi:#8a6a50;--hg-soil:#c9a27a;--hg-soil-dark:#a98259;--hg-shadow:rgba(90,70,40,.16);--hg-spark:#fff3b0;' +
        '--hg-sky-top:#cfe6f2;--hg-sky-bot:#fbf1d9;--hg-sun:#fff3bf;--hg-cloud:#ffffff;--hg-ridge-1:#d7e6d5;--hg-ridge-2:#bfd9bf;--hg-ridge-3:#a8cfa8;--hg-ridge-4:#92c28f;\n' +
        '--hg-mist:rgba(251,241,217,.35);--hg-stream:#9fd3ea;--hg-terrace:rgba(80,120,60,.35);--hg-grass:#a9d392;--hg-ground:#8a6a4a;--hg-water:#1f6fb5;' +
        '--hg-on-water:#ffffff;--hg-soft:#3d5a47;--hg-pane-bg:#ffffff;--hg-pane-text:#1e293b;--hg-pane-border:#cbd5e1}' +
      '@media (prefers-color-scheme: dark){.hg-card,.hg-dock-pane,.hg-dock-btn{--hg-leaf-dark:#2f6f55;--hg-leaf:#46916a;--hg-leaf-mid:#5aa77b;--hg-leaf-light:#86c79a;' +
        '--hg-trunk:#7a5a3e;--hg-trunk-dark:#523a28;--hg-line:#1d2d26;--hg-flower:#f2c94c;--hg-flower-hi:#ffe9a6;--hg-pod:#a07c4c;--hg-pod-hi:#cfae7c;' +
        '--hg-seed:#9a7a5a;--hg-seed-hi:#d0b08a;--hg-soil:#6a5037;--hg-soil-dark:#4c3825;--hg-shadow:rgba(0,0,0,.28);--hg-spark:#ffe9a6;' +
        '--hg-sky-top:#14223a;--hg-sky-bot:#27425a;--hg-sun:#e9eefb;--hg-cloud:#3a526c;--hg-ridge-1:#2a4258;--hg-ridge-2:#25483f;--hg-ridge-3:#22503f;--hg-ridge-4:#1f5242;' +
        '--hg-mist:rgba(39,66,90,.12);--hg-stream:#3d6f8a;--hg-terrace:rgba(150,200,150,.18);--hg-grass:#2c5a47;--hg-ground:#5a4430;' +
        '--hg-water:#7cc4ff;--hg-on-water:#0b1b2b;--hg-soft:#b9d1c0;--hg-pane-bg:#2c2c2c;--hg-pane-text:#e0e0e0;--hg-pane-border:rgba(255,255,255,.2)}}' +
      '.hg-card{margin:0 0 20px;padding:10px;border-radius:14px;background:rgba(128,128,128,.08)}' +
      '.hg-card h6{margin:0 0 6px;padding-right:38px}' +
      '.hg-yard{border-radius:12px;overflow:hidden;background:linear-gradient(var(--hg-sky-top),var(--hg-sky-bot))}' +
      '.hg-yard svg{display:block;width:100%;height:auto;aspect-ratio:16/10;max-height:50vh}' +
      '.hg-yard{position:relative}.hg-yard svg{touch-action:none;cursor:grab}.hg-yard.hg-placing svg{cursor:crosshair}' +
      '@media (max-width:768px){.hg-yard svg{touch-action:pan-y}.hg-yard.hg-zoomed svg,.hg-yard.hg-placing svg{touch-action:none}}' +
      '.hg-yard.hg-3d{aspect-ratio:16/10;max-height:52vh;background:var(--hg-sky-bot)}' +
      '.hg-3d canvas{position:absolute;left:0;top:0;width:100%;height:100%;display:block;touch-action:none;cursor:grab}' +
      '.hg-3d canvas.hg-base{pointer-events:none}.hg-3d.hg-placing canvas.hg-ov{cursor:crosshair}' +
      '@media (max-width:768px){.hg-3d:not(.hg-placing) canvas.hg-ov{touch-action:pan-y}}' +
      '.hg-zoom{position:absolute;right:8px;bottom:8px;display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end;max-width:calc(100% - 16px)}' +
      '.hg-zoom button[data-hg=mode-toggle]{width:auto;padding:0 10px;border-radius:15px;font-size:.78rem;white-space:nowrap}' +
      '.hg-zoom button{width:30px;height:30px;border-radius:50%;border:1px solid var(--hg-pane-border);background:var(--hg-pane-bg);color:var(--hg-pane-text);font-size:1rem;line-height:1;cursor:pointer;opacity:.9}' +
      '.hg-btn.on{outline:3px solid var(--hg-soft);outline-offset:2px}' +
      '.hg-step{border:1px solid var(--hg-soft);background:transparent;color:inherit;border-radius:50%;width:24px;height:24px;line-height:1;cursor:pointer;font-size:1rem;padding:0}' +
      '.hg-night{display:none}@media (prefers-color-scheme: dark){.hg-day{display:none}.hg-night{display:block}}' +
      '.hg-row{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px;flex-wrap:wrap}' +
      '.hg-row b{color:var(--hg-water);font-size:1.15rem}' +
      '.hg-btn{border:0;border-radius:10px;padding:8px 14px;background:var(--hg-water);color:var(--hg-on-water);cursor:pointer;font:inherit}' +
      '.hg-btn:disabled{opacity:.4;cursor:default}' +
      '.hg-btn.ghost{background:transparent;color:var(--hg-soft);border:1px dashed var(--hg-soft)}' +
      '.hg-dev{margin-top:10px;padding:8px;border:1px dashed var(--hg-soft);border-radius:10px;font-size:.85rem}' +
      '.hg-dev summary{cursor:pointer}.hg-dev-row{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:6px}' +
      '.hg-dev .hg-btn{padding:5px 10px;font-size:.8rem}' +
      '.hg-dock-btn{position:fixed;right:20px;top:calc(50% + 140px);transform:translateY(calc(-50% - 120px));' +
        'width:50px;height:50px;border-radius:50%;border:1px solid var(--hg-pane-border);' +
        'background:var(--hg-water);color:var(--hg-on-water);font-size:1.4rem;cursor:pointer;' +
        'box-shadow:0 4px 10px rgba(0,0,0,.3);z-index:1000;display:flex;align-items:center;justify-content:center;' +
        'transition:transform .2s,box-shadow .2s}' +
      '.hg-dock-btn:hover{transform:translateY(calc(-50% - 120px)) scale(1.1)}' +
      '.hg-badge{position:absolute;top:-4px;right:-4px;min-width:20px;height:20px;padding:0 5px;border-radius:10px;' +
        'background:#c62828;color:#fff;font-size:.75rem;line-height:20px;text-align:center;font-weight:700}' +
      '.hg-dock-pane{position:fixed;right:80px;top:80px;width:340px;max-width:calc(100vw - 100px);max-height:calc(100vh - 100px);transition:width .8s ease;' +
        'overflow-y:auto;overscroll-behavior:contain;z-index:1100;border-radius:14px;padding:6px;' +
        'background:var(--hg-pane-bg);color:var(--hg-pane-text);border:1px solid var(--hg-pane-border);' +
        'box-shadow:0 8px 24px rgba(0,0,0,.25)}' +
      '.hg-dock-pane[hidden]{display:none}.hg-dock-pane:not([hidden]){display:flex;flex-direction:column;overflow:hidden}' +
      '.hg-dock-body{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}' +
      '.hg-dock-pane .hg-card{margin:0}' +
      // 關閉鈕釘在外框右上角（外框毋捲動，內容區捲動），永遠看得著、毋會被捲走；給够大个點擊範圍
      '.hg-dock-close{position:absolute;top:6px;right:8px;width:34px;height:34px;border:0;border-radius:50%;background:var(--hg-pane-bg);color:inherit;font-size:1.05rem;line-height:1;cursor:pointer;z-index:3;box-shadow:0 1px 4px rgba(0,0,0,.25)}' +
      '@media (max-width:768px){.hg-dock-pane{left:0;right:0;top:auto;bottom:0;width:auto;max-width:none;max-height:60vh;border-radius:14px 14px 0 0}}' +
      '@media (prefers-reduced-motion: reduce){.hg-dock-pane{transition:none}}' +
      '.hg-note{font-size:.78rem;color:var(--hg-soft);margin-top:6px}' +
      '.hg-msg{min-height:1.3em;font-size:.9rem;margin-top:4px}' +
      '.hg-tree{transform-origin:100px 208px;transition:transform .5s ease}.hg-tree.pop{transform:scale(1.06)}' +
      '.hg-drop{fill:var(--hg-water);animation:hg-fall .9s ease-in forwards}' +
      '@keyframes hg-fall{from{transform:translateY(-60px);opacity:1}to{transform:translateY(60px);opacity:0}}' +
      '@media (prefers-reduced-motion: reduce){.hg-tree{transition:none}.hg-drop{animation:none}}';
    document.head.appendChild(st);
  }

  // 把庭院卡畫進 el。opts.demo = true 時顯示「＋1 測試水滴」鈕（PoC 頁用）
  // ---- 類 3D 地形（js/garden/garden-3d.js）：模式、貼圖、色票 ----
  var GD3 = window.hakfaGarden3D;
  var allViews = [];        // 所有還活著个 3D 渲染器（面板、戰績頁各一個；每次重畫會重建，鏡頭狀態共用 saved3）
  var saved3 = null;        // 鏡頭 { yaw, pitch, dist, tx, ty }：淨在本機、毋同步、毋存
  var spriteCache = {}, spriteLoading = {}, spriteWaiters = [];
  function mode3d() {
    if (!GD3) return false;
    try { return localStorage.getItem('hakfaGardenMode') !== 'simple'; } catch (e) { return true; }
  }
  function isDark() { return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches); }
  var THEME3 = {
    light: { dark: false, skyTop: [207, 230, 242], skyBot: [251, 241, 217], grass: [138, 196, 106], grassHi: [176, 222, 128], hill: [102, 162, 96], rock: [150, 160, 150], water: [120, 190, 225], sun: [255, 243, 191], fog: [251, 241, 217], ring: [31, 111, 181] },
    dark: { dark: true, skyTop: [20, 34, 58], skyBot: [39, 66, 90], grass: [66, 146, 104], grassHi: [92, 176, 122], hill: [48, 108, 84], rock: [104, 118, 136], water: [64, 124, 168], sun: [233, 238, 251], fog: [39, 66, 90], ring: [124, 196, 255] }
  };
  // 樹个貼圖：把 treeSvg 个 CSS 變數換成實際顏色，做成獨立 SVG 圖片，快取起來（毋使每擺重畫）
  function spriteFor(stage, lod, cardEl, onReady) {
    var key = (isDark() ? 'd' : 'l') + stage + (lod ? 'l' : 'f');
    if (spriteCache[key]) return spriteCache[key];
    if (!spriteLoading[key]) {
      spriteLoading[key] = true;
      var cs = window.getComputedStyle(cardEl || document.documentElement);
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 240" width="200" height="240">' +
        treeSvg(stage, lod).replace(/var\(--hg-([a-z-]+)\)/g, function (m, n) { return cs.getPropertyValue('--hg-' + n).trim() || '#888'; }) + '</svg>';
      var img = new Image();
      img.onload = function () { spriteCache[key] = img; var w = spriteWaiters; spriteWaiters = []; w.forEach(function (f) { try { f(); } catch (e) { /* 重繪失敗毋影響 */ } }); };
      img.onerror = function () { spriteLoading[key] = false; };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    }
    return null;
  }
  if (window.matchMedia) { // 系統主題切換：貼圖重做、重繪
    try {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { spriteCache = {}; spriteLoading = {}; allViews = allViews.filter(function (v) { return v.alive(); }); allViews.forEach(function (v) { v.render(false); }); });
    } catch (e) { /* 舊瀏覽器就算 */ }
  }

  function mount(el, opts) {
    if (!el) return;
    opts = opts || {};
    var devOn = devEnabled(opts);
    injectStyle();
    sync();
    var msg = totalPoured() === 0 ? '種子在等第一滴水。' : '轉來啦，樹一直都在。';
    var placing = null;       // 種植模式：目前愛種哪一種種子（null＝無）
    var use3d = mode3d();     // 目前係類 3D 模式抑係簡易平面
    var v3 = null, ro3 = null; // 這個面板个 3D 渲染器摎 ResizeObserver
    var justDragged = false;  // 剛剛有拖曳（放手後个 click 毋當作選樹）

    function devPanelHtml() {
      var stageBtns = STAGES.map(function (st, i) {
        return '<button class="hg-btn ghost" data-hg="dev-stage" data-i="' + i + '">' + st.name + '</button>';
      }).join('');
      return '<details class="hg-dev" open><summary>🛠 開發者面板</summary>' +
        '<div class="hg-dev-row"><button class="hg-btn ghost" data-hg="dev-add" data-n="1">＋1 💧</button>' +
        '<button class="hg-btn ghost" data-hg="dev-add" data-n="5">＋5 💧</button>' +
        '<button class="hg-btn ghost" data-hg="dev-clear">水滴歸零</button>' +
        '<button class="hg-btn ghost" data-hg="dev-seed">＋1 種子</button>' +
        '<button class="hg-btn ghost" data-hg="dev-today">重設今日入帳（從現在起算）</button></div>' +
        '<div class="hg-dev-row">跳到：' + stageBtns + '</div>' +
        '<div class="hg-dev-row"><button class="hg-btn ghost" data-hg="dev-all">全部重置（樹＋水滴＋今日入帳）</button>' +
        '<button class="hg-btn ghost" data-hg="dev-off">關閉面板</button></div>' +
        '<div class="hg-note">只改 hakfaGarden，毋會動學習進度摎統計。</div></details>';
    }

    var W = 640, H = 400;
    // 一塊地个畫面位置：x（0~1）橫跨全景；y（0~1）由遠到近，沿著前景坡地个高低走
    function plotScreen(q, ridgeNear) {
      var n = state.plots.length, t = (q.y === undefined ? 5000 : q.y) / 10000, xr = (q.x === undefined ? 5000 : q.x) / 10000;
      var base = Math.max(0.34, Math.min(0.62, 0.66 - 0.03 * n));
      var sx = 30 + xr * (W - 60), gy = Math.min(H - 8, ridgeNear.f(sx) + 10 + t * 112);
      var sc = base * (0.78 + 0.5 * t);
      return { sx: sx, gy: gy, sc: sc, tf: 'translate(' + (sx - 100 * sc).toFixed(1) + ' ' + (gy - 207 * sc).toFixed(1) + ') scale(' + sc.toFixed(3) + ')' };
    }
    function ridge(base, amp, seed, freq) {
      var r = rng(seed), ph = [r() * 6, r() * 6, r() * 6];
      function f(px) { return base + Math.sin(px * freq + ph[0]) * amp + Math.sin(px * freq * 2.3 + ph[1]) * amp * 0.45 + Math.sin(px * freq * 4.1 + ph[2]) * amp * 0.18; }
      var d = 'M-10 ' + (H + 20), x;
      for (x = -10; x <= W + 10; x += 16) d += 'L' + x + ' ' + f(x).toFixed(1);
      return { d: d + 'L' + (W + 10) + ' ' + (H + 20) + 'Z', f: f };
    }
    // 臺灣北部丘陵：種子算出幾層遠山；一座山个高低起伏毋佔儲存
    function terrain() {
      var sd = G.seed || 1;
      return [ridge(128, 24, sd * 7 + 1, 0.011), ridge(166, 26, sd * 7 + 2, 0.014), ridge(206, 28, sd * 7 + 3, 0.017), ridge(238, 30, sd * 7 + 4, 0.02)];
    }
    function plotsSvg(popped) {
      var R = terrain(), sd = G.seed || 1, out = '';
      out += '<g class="hg-day"><circle cx="100" cy="62" r="44" fill="var(--hg-sun)" opacity=".5"/><circle cx="100" cy="62" r="20" fill="var(--hg-sun)" opacity=".85"/>' +
        '<ellipse cx="' + (300 + (sd % 120)) + '" cy="78" rx="44" ry="10" fill="var(--hg-cloud)" opacity=".8"/></g>';
      out += '<g class="hg-night"><circle cx="540" cy="62" r="26" fill="var(--hg-sun)" opacity=".3"/><circle cx="540" cy="62" r="12" fill="var(--hg-sun)"/>' +
        sparkle(120, 40, 1) + sparkle(300, 72, 0.7) + sparkle(430, 36, 0.9) + sparkle(60, 100, 0.6) + sparkle(220, 30, 0.8) + '</g>';
      R.forEach(function (r, i) { out += '<path d="' + r.d + '" fill="var(--hg-ridge-' + (i + 1) + ')"/>'; });
      out += '<rect x="0" y="130" width="' + W + '" height="70" fill="var(--hg-mist)"/>'; // 遠山薄霧
      var sx0 = 250 + (sd % 140); // 山谷小溪（位置隨種子）
      out += '<path d="M' + sx0 + ' 236C' + (sx0 - 12) + ' 268 ' + (sx0 + 22) + ' 280 ' + (sx0 + 6) + ' 312C' + (sx0 - 6) + ' 338 ' + (sx0 + 20) + ' 360 ' + (sx0 + 14) + ' 420" fill="none" stroke="var(--hg-stream)" stroke-width="7" stroke-linecap="round" opacity=".9"/>';
      for (var t = 0; t < 4; t++) out += '<path d="M' + (40 + (sd % 60)) + ' ' + (292 + t * 14) + 'C120 ' + (282 + t * 14) + ' 200 ' + (304 + t * 14) + ' 270 ' + (294 + t * 14) + '" fill="none" stroke="var(--hg-terrace)" stroke-width="2" stroke-linecap="round"/>'; // 茶園梯田
      var items = state.plots.map(function (q, i) { var ps = plotScreen(q, R[3]); ps.i = i; ps.q = q; return ps; });
      items.sort(function (a, b) { return a.gy - b.gy; }); // 由遠到近疊放
      var lod = state.plots.length >= 7;
      items.forEach(function (it) {
        var on = it.i === state.sel;
        out += '<g transform="' + it.tf + '">' +
          (on && state.plots.length > 1 ? '<ellipse cx="100" cy="210" rx="56" ry="10" fill="none" stroke="var(--hg-water)" stroke-width="4"/>' : '') +
          '<g class="hg-tree' + (on && popped ? ' pop' : '') + '">' + treeSvg(stageIndex(it.q.n), lod) + '</g></g>';
      });
      return out;
    }
    // 選著个地个座標變換（水滴動畫愛對得著該欉）
    function selTransform() {
      return plotScreen(selPlot(), terrain()[3]).tf;
    }

    // ---- 縮放、平移、點選位置種樹 ----
    function viewBoxAttr() {
      var vw = W / view.z, vh = H / view.z;
      return view.x.toFixed(1) + ' ' + view.y.toFixed(1) + ' ' + vw.toFixed(1) + ' ' + vh.toFixed(1);
    }
    function svgEl() { return el.querySelector('svg.hg-svg'); }
    function applyView(svg) {
      var vw = W / view.z, vh = H / view.z;
      view.x = Math.max(0, Math.min(W - vw, view.x));
      view.y = Math.max(0, Math.min(H - vh, view.y));
      svg.setAttribute('viewBox', viewBoxAttr());
      if (svg.parentNode && svg.parentNode.classList) svg.parentNode.classList.toggle('hg-zoomed', view.z > 1); // 放大中才完全接管手勢，否則窄螢幕做得上下滑
    }
    function toVB(svg, cx, cy) { // 螢幕座標 → 地形座標（含 slice 裁切、縮放）
      var m = svg.getScreenCTM();
      if (!m) return null;
      var pt = svg.createSVGPoint(); pt.x = cx; pt.y = cy;
      var q = pt.matrixTransform(m.inverse());
      return { x: q.x, y: q.y };
    }
    function zoomAt(svg, cx, cy, nz) { // 以 (cx, cy) 為中心縮放，該點愛留在手指／滑鼠下背
      nz = Math.max(1, Math.min(4, nz));
      var p = toVB(svg, cx, cy);
      view.z = nz;
      if (nz === 1) { view.x = 0; view.y = 0; }
      applyView(svg);
      var p2 = toVB(svg, cx, cy);
      if (p && p2 && nz > 1) { view.x += p.x - p2.x; view.y += p.y - p2.y; applyView(svg); }
    }
    function streamX(gy) { // 小溪个中心線（近似），種樹愛閃開
      var sx0 = 250 + ((G.seed || 1) % 140);
      var pts = [[236, sx0], [312, sx0 + 6], [420, sx0 + 14]];
      for (var i = 0; i < pts.length - 1; i++) if (gy <= pts[i + 1][0]) return pts[i][1] + (pts[i + 1][1] - pts[i][1]) * Math.max(0, (gy - pts[i][0]) / (pts[i + 1][0] - pts[i][0]));
      return pts[pts.length - 1][1];
    }
    // 地形座標 (sx, gy) → 地塊座標 { x, y }（0~10000）；毋在前景坡地、抑係在小溪裡就回 null
    function groundFromVB(vb) {
      var R3 = terrain()[3], xr = (vb.x - 30) / (W - 60), t = (vb.y - R3.f(vb.x) - 10) / 112;
      if (xr < 0.02 || xr > 0.98 || t < 0.02 || t > 0.98) return null;
      if (vb.y > 236 && Math.abs(vb.x - streamX(vb.y)) < 18) return null;
      return { x: Math.round(xr * 10000), y: Math.round(t * 10000) };
    }
    // 點選樹：毋倚靠互相蓋住个矩形，改用座標挑「最貼近樹冠中心」个一欉；疊著个時節，同一位再點一下輪流切換
    var lastPick = null;
    function pickPlots(vb) {
      var R3 = terrain()[3], c = [];
      state.plots.forEach(function (q, i) {
        var ps = plotScreen(q, R3), cx = ps.sx, cy = ps.gy - 95 * ps.sc, rx = 62 * ps.sc, ry = 100 * ps.sc;
        var d = Math.pow((vb.x - cx) / rx, 2) + Math.pow((vb.y - cy) / ry, 2);
        if (d <= 1) c.push({ i: i, d: d, gy: ps.gy });
      });
      c.sort(function (a, b) { return a.d - b.d || b.gy - a.gy; });
      return c;
    }
    function tapSelect(vb, cx, cy) {
      var c = pickPlots(vb);
      if (!c.length) { lastPick = null; return false; }
      var idx = 0;
      if (c.length > 1 && lastPick && Math.hypot(cx - lastPick.cx, cy - lastPick.cy) < 10 && lastPick.n === c.length) idx = (lastPick.idx + 1) % c.length; // 同一位再點：換下一欉
      lastPick = { cx: cx, cy: cy, idx: idx, n: c.length };
      selectPlot(c[idx].i);
      msg = '選著第 ' + (state.sel + 1) + ' 塊地' + (c.length > 1 ? '（這位疊著 ' + c.length + ' 欉，再點一下換下一欉）' : '');
      return true;
    }
    function updateGhost(svg, cx, cy) {
      var g = svg.querySelector('.hg-ghost');
      if (!g) return;
      var vb = toVB(svg, cx, cy), gr = vb && groundFromVB(vb);
      if (!placing || !vb) { g.style.display = 'none'; return; }
      var ok = !!gr && canPlaceAt(gr.x, gr.y);
      var n = state.plots.length + 1, base = Math.max(0.34, Math.min(0.62, 0.66 - 0.03 * n)), t = gr ? gr.y / 10000 : 0.5, sc = base * (0.78 + 0.5 * t);
      g.setAttribute('transform', 'translate(' + (vb.x - 100 * sc).toFixed(1) + ' ' + (vb.y - 207 * sc).toFixed(1) + ') scale(' + sc.toFixed(3) + ')');
      g.innerHTML = '<g opacity="' + (ok ? 0.8 : 0.45) + '">' + treeSvg(1, true) + '</g><ellipse cx="100" cy="210" rx="58" ry="10" fill="none" stroke="' + (ok ? 'var(--hg-water)' : '#c62828') + '" stroke-width="4" stroke-dasharray="' + (ok ? '0' : '8 6') + '"/>';
      g.style.display = '';
    }

    // 地形區：類 3D（兩層 canvas＋旋轉俯仰縮放鈕）或簡易平面（SVG）；可切換，預設類 3D
    function yardHtml(popped) {
      var tog = '<button type="button" data-hg="mode-toggle" title="切換簡易平面／類 3D" aria-label="切換簡易平面／類 3D">' + (use3d ? '簡易' : '立體') + '</button>';
      if (use3d) {
        return '<div class="hg-yard hg-3d' + (placing ? ' hg-placing' : '') + '"><canvas class="hg-base" aria-hidden="true"></canvas><canvas class="hg-ov" role="img" aria-label="' + esc(gardenTitle()) + '，立體个臺灣北部丘陵，拖曳可旋轉"></canvas>' +
          '<div class="hg-zoom"><button type="button" data-hg="rot-l" aria-label="向左轉">↺</button><button type="button" data-hg="rot-r" aria-label="向右轉">↻</button>' +
          '<button type="button" data-hg="tilt-up" aria-label="抬高視角">▲</button><button type="button" data-hg="tilt-down" aria-label="壓低視角">▼</button>' +
          '<button type="button" data-hg="zoom-in" aria-label="拉近">＋</button><button type="button" data-hg="zoom-out" aria-label="拉遠">－</button><button type="button" data-hg="view-reset" aria-label="還原視角">⌂</button>' + tog + '</div></div>';
      }
      return '<div class="hg-yard' + (placing ? ' hg-placing' : '') + (view.z > 1 ? ' hg-zoomed' : '') + '"><svg class="hg-svg" viewBox="' + viewBoxAttr() + '" preserveAspectRatio="xMidYMax slice" role="img" aria-label="' + esc(gardenTitle()) + '，臺灣北部丘陵上的相思樹">' +
        plotsSvg(popped) + '<g class="hg-drops"></g><g class="hg-ghost" style="display:none"></g></svg>' +
        '<div class="hg-zoom"><button type="button" data-hg="zoom-in" aria-label="放大">＋</button><button type="button" data-hg="zoom-out" aria-label="縮小">－</button><button type="button" data-hg="zoom-reset" aria-label="還原">⌂</button>' + tog + '</div></div>';
    }
    // 建立 3D 渲染器並馬上畫一擺
    function init3d() {
      var base = el.querySelector('canvas.hg-base'), ov = el.querySelector('canvas.hg-ov'), card = el.querySelector('.hg-card');
      if (!base || !ov) return;
      try { base.getContext('2d'); } catch (e) { return; }
      var v = GD3.create({
        base: base, overlay: ov,
        seed: function () { return G.seed || 1; },
        plots: function () { return state.plots.map(function (q) { return { id: q.id, x: q.x === undefined ? 5000 : q.x, y: q.y === undefined ? 5000 : q.y, stage: stageIndex(q.n) }; }); },
        sel: function () { return (selPlot() || {}).id; },
        theme: function () { return isDark() ? THEME3.dark : THEME3.light; },
        sprite: function (st, lod) { return spriteFor(st, lod, card); },
        onSprite: function (cb) { spriteWaiters.push(cb); }
      });
      if (saved3) { v.cam.yaw = saved3.yaw; v.cam.pitch = saved3.pitch; v.cam.dist = saved3.dist; v.cam.tx = saved3.tx; v.cam.ty = saved3.ty; }
      saved3 = v.cam; v3 = v; allViews = allViews.filter(function (x) { return x.alive(); }); allViews.push(v);
      if (ro3) { try { ro3.disconnect(); } catch (e) { /* 無 */ } ro3 = null; }
      if (window.ResizeObserver) { ro3 = new ResizeObserver(function () { if (v3 === v) v.resize(); }); ro3.observe(base); }
      v.now();
    }

    function draw(popped) {
      use3d = mode3d();
      if (!use3d) v3 = null;
      if (newerFlag) {
        el.innerHTML = '<div class="hg-card"><h6>🌱 ' + esc(gardenTitle()) + '</h6><div class="hg-note">庭院資料來自比這個網頁更新个版本，為著毋弄壞你个進度，這個版本先毋讀、毋改、毋同步。請重新整理網頁（抑係等網站更新）再試。</div></div>';
        return;
      }
      if (pending) {
        el.innerHTML = '<div class="hg-card"><h6>🌱 ' + esc(gardenTitle()) + '</h6><div class="hg-note">庭院資料愛升級：' + esc(pending.describe) + '。升級前會先備份原本个資料。</div>' +
          '<div class="hg-row"><button class="hg-btn" data-hg="consent-yes">同意升級</button><small>毋同意就維持原樣，庭院先暫停。</small></div></div>';
        return;
      }
      var q = selPlot();
      var idx = stageIndex(q.n);
      var done = idx >= STAGES.length - 1; // 打子：毋使再過淋水
      var shown = done ? (msg ? msg + '　' : '') + '毋使再過淋水 lió' : msg;
      var seedRows = Object.keys(SEEDS).map(function (k) {
        var d = SEEDS[k], full = state.plots.length >= MAX_PLOTS;
        return '<div class="hg-row"><div>' + d.name + ' ×<b>' + state.seeds[k] + '</b></div><div>' +
          '<button class="hg-btn ghost" data-hg="buy" data-k="' + k + '"' + (state.bank < d.price ? ' disabled' : '') + '>' + d.price + ' 💧 換 1 粒</button> ' +
          '<button class="hg-btn' + (placing === k ? ' on' : '') + '" data-hg="plant" data-k="' + k + '"' + ((state.seeds[k] < 1 || full) && placing !== k ? ' disabled' : '') + '>' + (placing === k ? '取消種植' : full ? '地滿矣' : '種下去') + '</button></div></div>';
      }).join('');
      el.innerHTML =
        '<div class="hg-card">' +
          '<h6>🌱 ' + esc(gardenTitle()) + '</h6>' +
          yardHtml(popped) +
          '<div class="hg-msg" aria-live="polite">' + shown + '</div>' +
          '<div class="hg-row"><div>💧 水缸 <b>' + state.bank + '</b>　<small>' + (state.plots.length > 1 ? '<button type="button" class="hg-step" data-hg="prev" aria-label="上一欉">‹</button> 第 ' + (state.sel + 1) + '／' + state.plots.length + ' 塊 <button type="button" class="hg-step" data-hg="next" aria-label="下一欉">›</button>：' : '') + STAGES[idx].name + '（已淋 ' + q.n + ' 滴）</small></div>' +
            '<button class="hg-btn" data-hg="pour"' + (state.bank < 1 || done ? ' disabled' : '') + '>' + (done ? '毋使再淋水 lió' : '淋水') + '</button></div>' +
          seedRows +
          '<div class="hg-row"><small>今晡日入帳 ' + state.credited + ' 滴（播完音檔 <span class="hg-audio">' + state.audio + '</span> 擺）</small>' +
            (opts.demo ? '<button class="hg-btn ghost" data-hg="demo">＋1 測試水滴</button>' : '') + '</div>' +
          '<div class="hg-note">每 ' + REVIEW_PER_DROP + ' 題到期復習 1 滴、每 ' + NEW_PER_DROP + ' 題新詞 1 滴、每完整播完 ' + AUDIO_PER_DROP + ' 擺音檔（遊戲裡肚毋算）1 滴。水滴存入水缸，淋水無日限。' + SEEDS.common.price + ' 💧 換 1 粒樹仁，種下去多一塊地。無肥料；幾日無來樹也毋會枯。</div>' +
          (devOn ? devPanelHtml() : '') +
        '</div>';
      if (use3d) init3d();
    }

    el.onclick = function (ev) {
      var b = ev.target.closest && ev.target.closest('[data-hg]');
      if (!b || b.disabled) return;
      if (b.getAttribute('data-hg') === 'consent-yes') {
        loadLedger(true); rebuild(); msg = '升級好矣'; draw(false);
        return;
      }
      if (b.getAttribute('data-hg') === 'pour') {
        var r = pour();
        if (!r) return;
        msg = r.grew ? '長大了！' + STAGES[r.stage].name : '咕嚕咕嚕～';
        draw(r.grew);
        if (v3) v3.playDrop((selPlot() || {}).id, r.grew); // 類 3D：一大滴水落下、濺開
        var g = el.querySelector('.hg-drops');
        if (g) {
          // 外包一層 <g> 放位置：CSS 動畫个 transform 會蓋掉元素自家个 transform 屬性
          var wrap = document.createElementNS('http://www.w3.org/2000/svg', 'g');
          wrap.setAttribute('transform', selTransform());
          var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          p.setAttribute('d', 'M100 18 q-20 34 0 42 q20 -8 0 -42z');
          p.setAttribute('class', 'hg-drop');
          wrap.appendChild(p);
          g.appendChild(wrap);
        }
      } else if (b.getAttribute('data-hg') === 'mode-toggle') {
        try { localStorage.setItem('hakfaGardenMode', use3d ? 'simple' : '3d'); } catch (e) { /* 無法存就算 */ }
        msg = use3d ? '換成簡易平面（較省電）' : '換成立體';
        draw(false);
      } else if (use3d && /^(rot-l|rot-r|tilt-up|tilt-down|zoom-in|zoom-out|view-reset)$/.test(b.getAttribute('data-hg'))) {
        var act3 = b.getAttribute('data-hg');
        if (v3) {
          if (act3 === 'rot-l') v3.rotate(0.3, 0); else if (act3 === 'rot-r') v3.rotate(-0.3, 0);
          else if (act3 === 'tilt-up') v3.rotate(0, 0.14); else if (act3 === 'tilt-down') v3.rotate(0, -0.14);
          else if (act3 === 'zoom-in') v3.zoom(1 / 1.25); else if (act3 === 'zoom-out') v3.zoom(1.25);
          else v3.reset();
        }
      } else if (b.getAttribute('data-hg') === 'zoom-in' || b.getAttribute('data-hg') === 'zoom-out' || b.getAttribute('data-hg') === 'zoom-reset') {
        var zs = svgEl();
        if (zs) {
          var zr = zs.getBoundingClientRect(), za = b.getAttribute('data-hg');
          if (za === 'zoom-reset') { view.z = 1; view.x = 0; view.y = 0; applyView(zs); }
          else zoomAt(zs, zr.left + zr.width / 2, zr.top + zr.height / 2, view.z * (za === 'zoom-in' ? 1.4 : 1 / 1.4));
        }
      } else if (b.getAttribute('data-hg') === 'prev' || b.getAttribute('data-hg') === 'next') {
        var step = b.getAttribute('data-hg') === 'next' ? 1 : -1, np = state.plots.length;
        selectPlot(((state.sel + step) % np + np) % np);
        msg = '選著第 ' + (state.sel + 1) + ' 塊地';
        draw(false);
      } else if (b.getAttribute('data-hg') === 'sel') {
        if (justDragged || placing) return; // 拖曳放手、或種植模式中，毋當作選樹
        selectPlot(parseInt(b.getAttribute('data-i'), 10) || 0);
        msg = '選著第 ' + (state.sel + 1) + ' 塊地';
        draw(false);
      } else if (b.getAttribute('data-hg') === 'buy') {
        var bk = b.getAttribute('data-k');
        msg = buySeed(bk) ? '換著 1 粒' + SEEDS[bk].name : '水滴毋夠';
        draw(false);
      } else if (b.getAttribute('data-hg') === 'plant') {
        var pk = b.getAttribute('data-k');
        if (placing === pk) { placing = null; msg = '取消矣'; }
        else { placing = pk; msg = '點地形上背，挑一位種' + SEEDS[pk].name + '（拖曳移動・滾輪或兩指縮放）'; }
        draw(false);
      } else if (b.getAttribute('data-hg') === 'demo') {
        dev.addBank(1);
        msg = '（測試）加一滴水';
        draw(false);
      } else if (b.getAttribute('data-hg').indexOf('dev-') === 0 && devOn) {
        var act = b.getAttribute('data-hg');
        if (act === 'dev-add') { dev.addBank(parseInt(b.getAttribute('data-n'), 10) || 1); msg = '（開發）加水滴'; }
        else if (act === 'dev-seed') { dev.addSeed('common'); msg = '（開發）加種子'; }
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
    // 指標事件：簡易平面（SVG）係拖曳平移、兩指縮放；類 3D 係拖曳旋轉、兩指拉遠拉近。兩種都做得點選樹、點地形種樹。
    // 用屬性指派（el.onxxx），重複 mount 毋會疊加
    var ptrs = {}, drag = null, pinch = null, lastPick3 = null;
    function hostOf(ev) { return ev.target.closest && ev.target.closest('canvas.hg-ov, svg.hg-svg'); }
    function is3(host) { return host && host.tagName && host.tagName.toLowerCase() === 'canvas'; }
    // 3D：點到个位置係毋係做得種（水裡、出界、離別欉太近）
    function plantSpot3(ev) {
      var g = v3 && v3.groundAt(ev.clientX, ev.clientY);
      if (!g) return { ok: false, why: '這位看無地面' };
      if (g.water) return { ok: false, why: '這位係小溪，毋好種' };
      if (g.px < 300 || g.px > 9700 || g.py < 300 || g.py > 9700) return { ok: false, why: '忒遠矣，先種佇家鄉山谷裡肚' };
      if (!canPlaceAt(g.px, g.py)) return { ok: false, why: '忒近別欉樹矣，挑較遠个位' };
      return { ok: true, x: g.px, y: g.py, g: g };
    }
    function tapSelect3(ev) {
      var c = v3 ? v3.pick(ev.clientX, ev.clientY) : [];
      if (!c.length) { lastPick3 = null; return false; }
      var idx = 0;
      if (c.length > 1 && lastPick3 && Math.hypot(ev.clientX - lastPick3.x, ev.clientY - lastPick3.y) < 10 && lastPick3.n === c.length) idx = (lastPick3.idx + 1) % c.length;
      lastPick3 = { x: ev.clientX, y: ev.clientY, idx: idx, n: c.length };
      selectPlot(c[idx].index);
      msg = '選著第 ' + (state.sel + 1) + ' 塊地' + (c.length > 1 ? '（這位疊著 ' + c.length + ' 欉，再點一下換下一欉）' : '');
      return true;
    }
    el.onpointerdown = function (ev) {
      var host = hostOf(ev);
      if (!host) return;
      ptrs[ev.pointerId] = { x: ev.clientX, y: ev.clientY };
      justDragged = false;
      // 毋在按下去个當下捕捉指標：捕捉會把後續个 click 改送給 svg，樹上个選取就失效（Zen／Firefox 會中）
      var ids = Object.keys(ptrs);
      if (ids.length === 1) drag = { sx: ev.clientX, sy: ev.clientY, lx: ev.clientX, ly: ev.clientY, vx: view.x, vy: view.y, moved: false };
      else if (ids.length === 2) {
        var a = ptrs[ids[0]], b = ptrs[ids[1]];
        pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: view.z, last: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
        if (drag) drag.moved = true;
      }
    };
    el.onpointermove = function (ev) {
      var host = el.querySelector('canvas.hg-ov, svg.hg-svg');
      if (!host) return;
      var three = is3(host), svg = three ? null : host;
      if (placing && !ptrs[ev.pointerId] && !(drag && drag.moved)) { // 種植預覽
        if (three) { var sp = plantSpot3(ev); if (v3) v3.setGhost(sp.g ? { wx: sp.g.wx, wy: sp.g.wy, ok: sp.ok } : null); }
        else updateGhost(svg, ev.clientX, ev.clientY);
      }
      if (!ptrs[ev.pointerId]) return;
      ptrs[ev.pointerId] = { x: ev.clientX, y: ev.clientY };
      var ids = Object.keys(ptrs);
      if (ids.length === 2 && pinch) {
        var a = ptrs[ids[0]], b = ptrs[ids[1]], dd = Math.hypot(a.x - b.x, a.y - b.y);
        if (three) { if (v3) v3.zoom(pinch.last / (dd || 1)); pinch.last = dd || 1; }
        else zoomAt(svg, (a.x + b.x) / 2, (a.y + b.y) / 2, pinch.z0 * (dd / pinch.d0));
        justDragged = true;
      } else if (ids.length === 1 && drag) {
        if (!drag.moved && Math.hypot(ev.clientX - drag.sx, ev.clientY - drag.sy) > 6) drag.moved = true;
        if (drag.moved && three && v3) { // 旋轉：左右拖＝水平轉；上下拖＝俯仰（觸控淨轉水平，上下留給捲動）
          if (!drag.captured) { drag.captured = true; try { host.setPointerCapture(ev.pointerId); } catch (e) { /* 無法捕捉就算 */ } } // 拖出畫面、在外背放手也收得著，毋會卡住
          var dx = ev.clientX - drag.lx, dy = ev.clientY - drag.ly;
          v3.rotate(-dx * 0.008, ev.pointerType === 'touch' ? 0 : dy * 0.006);
          if (v3 && placing) v3.setGhost(null);
        } else if (drag.moved && !three && view.z > 1) { // 放大後才做得平移；開始拖曳正捕捉指標，拖出畫面也繼續跟
          if (!drag.captured) { drag.captured = true; try { svg.setPointerCapture(ev.pointerId); } catch (e) { /* 無法捕捉就算 */ } }
          var m = svg.getScreenCTM();
          if (m) { view.x = drag.vx - (ev.clientX - drag.sx) / m.a; view.y = drag.vy - (ev.clientY - drag.sy) / m.d; applyView(svg); }
        }
        drag.lx = ev.clientX; drag.ly = ev.clientY;
        if (drag.moved) justDragged = true;
      }
    };
    function endPointer(ev) {
      var host = el.querySelector('canvas.hg-ov, svg.hg-svg'), three = is3(host), svg = three ? null : host;
      var wasTap = drag && !drag.moved && !pinch && ptrs[ev.pointerId];
      delete ptrs[ev.pointerId];
      if (Object.keys(ptrs).length < 2) pinch = null;
      if (Object.keys(ptrs).length === 0) {
        var d = drag; drag = null;
        if (!(wasTap && d && host && ev.type === 'pointerup')) return;
        if (three) {
          if (!placing) { if (tapSelect3(ev)) draw(false); }
          else {
            var sp = plantSpot3(ev);
            if (!sp.ok) { msg = sp.why; draw(false); }
            else if (plant(placing, { x: sp.x, y: sp.y })) { var k3 = placing; placing = null; msg = '種下去矣！第 ' + state.plots.length + ' 塊地（' + SEEDS[k3].name + '）'; draw(true); }
            else { msg = '毋做得種'; placing = null; draw(false); }
          }
        } else if (!placing && svg) { // 點一下：選樹
          var vb0 = toVB(svg, ev.clientX, ev.clientY);
          if (vb0 && tapSelect(vb0, ev.clientX, ev.clientY)) draw(false);
        } else if (placing && svg) { // 點一下：種在該位
          var vb = toVB(svg, ev.clientX, ev.clientY), gr = vb && groundFromVB(vb);
          if (!gr) { msg = '這位毋做得種（愛種佇前景个坡地，毋好種佇小溪）'; draw(false); }
          else if (!canPlaceAt(gr.x, gr.y)) { msg = '忒近別欉樹矣，挑較遠个位'; draw(false); }
          else if (plant(placing, gr)) { var kk = placing; placing = null; msg = '種下去矣！第 ' + state.plots.length + ' 塊地（' + SEEDS[kk].name + '）'; draw(true); }
          else { msg = '毋做得種'; placing = null; draw(false); }
        }
      }
    }
    el.onpointerup = endPointer;
    el.onpointercancel = endPointer;
    el.onpointerleave = function () {
      var svg = svgEl(); if (svg) { var g = svg.querySelector('.hg-ghost'); if (g) g.style.display = 'none'; }
      if (v3) v3.setGhost(null);
    };
    if (!el.__hgWheel) { // 滾輪：簡易平面縮放、類 3D 拉遠拉近（要 passive:false 才擋得住頁面捲動）
      el.__hgWheel = true;
      el.addEventListener('wheel', function (ev) {
        var host = ev.target.closest && ev.target.closest('canvas.hg-ov, svg.hg-svg');
        if (!host) return;
        ev.preventDefault();
        if (is3(host)) { if (v3) v3.zoom(Math.exp(ev.deltaY * 0.0012)); }
        else zoomAt(host, ev.clientX, ev.clientY, view.z * Math.pow(1.0018, -ev.deltaY));
      }, { passive: false });
    }
    if (!el.__hgWin) { // 保險：指標在面板外背放開、抑係被取消，也愛清掉拖曳狀態，毋會卡住後續个點選
      el.__hgWin = true;
      var winEnd = function (ev) { if (ptrs[ev.pointerId]) { delete ptrs[ev.pointerId]; if (Object.keys(ptrs).length < 2) pinch = null; if (!Object.keys(ptrs).length) drag = null; } };
      window.addEventListener('pointerup', winEnd);
      window.addEventListener('pointercancel', winEnd);
    }
    if (!el.__hgKey) { // Esc 取消種植
      el.__hgKey = true;
      document.addEventListener('keydown', function (ev) {
        if (ev.key === 'Escape' && placing) { placing = null; msg = '取消矣'; draw(false); }
      });
    }
    draw(false);
  }

  // ---- 音檔播放計滴：任何 audio（主表、日日一詞；遊戲裡肚毋算）完整播完，每 AUDIO_PER_DROP 擺 1 滴 ----
  var AUDIO_IGNORE_RE = /(^|\/)(endOfPlay|empty_category)\.mp3(\?|$)/; // 提示音效毋算
  // 遊戲視窗開等時，播个音檔毋算（愛答題正有意義，毋係淨按音檔刷擺數）
  function inGame() {
    var gm = document.getElementById('gameModal');
    return !!gm && window.getComputedStyle(gm).display !== 'none';
  }
  function onAudioPlayed() {
    if (newerFlag || pending) return;
    sync(); // 先處理換日
    var before = GD.derive(G).earnedTotal;
    GD.addAudio(G, todayStr(), local.dev);
    var gained = Math.max(0, (sync(), GD.derive(G).earnedTotal - before));
    persist(true); // 計數有變，愛落地
    var cnt = document.querySelector('.hg-audio');
    if (cnt) cnt.textContent = state.audio;
    if (gained > 0) {
      if (dock.refresh) dock.refresh();
      if (typeof window.showGardenDropHint === 'function') window.showGardenDropHint(gained);
    }
  }
  // 包一層 HTMLMediaElement.prototype.play：淨有「完整播完」（ended 事件）正算 1 擺，像皮克敏走一步。
  // 播一半就停、切走毋算；同一支音檔重複 play() 淨掛一個 ended 監聽，毋會一擺算兩擺。不設刷次數上限，愛刷个人隨佢去。
  (function patchAudioPlay() {
    if (typeof HTMLMediaElement === 'undefined' || HTMLMediaElement.prototype.__hakfaGardenPatched) return;
    var orig = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      var src = this.currentSrc || this.src || '';
      // 每擺 play 都重判：提示音效、遊戲視窗裡肚个音檔毋算
      this.__hgCountable = !AUDIO_IGNORE_RE.test(src) && !inGame();
      if (!this.__hgPending) {
        this.__hgPending = true;
        var el = this;
        el.addEventListener('ended', function () {
          el.__hgPending = false;
          if (!el.__hgCountable) return;
          try { onAudioPlayed(); } catch (e) { /* 計數失敗毋影響播放 */ }
        }, { once: true });
      }
      return orig.apply(this, arguments);
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
    buySeed: buySeed,
    plant: plant,
    canPlaceAt: canPlaceAt,
    getState: function () { return JSON.parse(JSON.stringify(state)); },
    getLedger: function () { return JSON.parse(JSON.stringify(G)); }, // 原始帳本（除錯、測試用）
    getDevice: function () { return local.dev; },
    __cam: function () { return saved3 ? JSON.parse(JSON.stringify(saved3)) : null; }, // 測試、除錯用
    __view: function () { return allViews.length ? allViews[allViews.length - 1] : null; },
    exportForSync: exportForSync, // cloud-sync.js 匯出用
    mergeIncoming: mergeIncoming, // cloud-sync.js 合併用
    // 有愛同意个版本升級：使用者按同意後呼叫（升級前自動備份原始資料）
    approveMigration: function () { loadLedger(true); rebuild(); if (dock.refresh) dock.refresh(); },
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
  var EXPAND_PLOTS = 12; // 種到這麼濟塊地，面板就占到視窗寬度个 80%（暫定）

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
    body.className = 'hg-dock-body';
    pane.appendChild(closeBtn);
    pane.appendChild(body);
    document.body.appendChild(btn);
    document.body.appendChild(pane);

    function updateBadge() {
      var b = document.getElementById('gardenDockBadge');
      if (!b) return;
      b.textContent = String(state.bank);
      b.hidden = state.bank < 1;
      btn.title = '庭院：水缸有 ' + state.bank + ' 滴水';
    }
    // 庭院愈種愈大：面板寬度由 340px 慢慢長到視窗 80%（驚喜感）；窄螢幕係底部抽屜，毋變
    function applySize() {
      var vw = window.innerWidth;
      if (vw <= 768) { pane.style.width = ''; return; }
      var t = Math.max(0, Math.min(1, (state.plots.length - 1) / (EXPAND_PLOTS - 1)));
      var max = Math.max(340, Math.floor(vw * 0.8));
      pane.style.width = Math.round(340 + t * (max - 340)) + 'px';
    }
    function setOpen(open) {
      pane.hidden = !open;
      applySize();
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) { mount(body); body.scrollTop = 0; } // 打開當下一律由頂端開始，標題摎關閉鈕看得著
      try { localStorage.setItem(DOCK_OPEN_KEY, open ? '1' : '0'); } catch (e) { /* 無法存就算 */ }
    }
    dock.refresh = function () {
      btn.setAttribute('aria-label', gardenTitle());
      pane.setAttribute('aria-label', gardenTitle());
      updateBadge();
      applySize();
      if (!pane.hidden) mount(body);
    };

    btn.addEventListener('click', function () { setOpen(pane.hidden); });
    closeBtn.addEventListener('click', function () { setOpen(false); });
    window.addEventListener('hakfa-garden-change', function () { updateBadge(); applySize(); });
    window.addEventListener('resize', applySize);

    sync();
    updateBadge();
    var wasOpen = false;
    try { wasOpen = localStorage.getItem(DOCK_OPEN_KEY) === '1'; } catch (e) { /* 無法讀就當關 */ }
    if (wasOpen) setOpen(true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initDock);
  else initDock();
})();
