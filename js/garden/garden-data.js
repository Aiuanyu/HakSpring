// 客源翠庭院：資料結構（純函式，無 DOM、無 localStorage，Node 摎瀏覽器都做得用）
//
// 設計目標：試玩 个人，進度毋會因為「跨裝置同步」抑係「改版」前功盡棄。
//   1. 帶版本號（v）。舊版資料用 migrations 逐版升級，升級前原始資料會備份（備份由呼叫端做）。
//   2. 資料係「只增不減」个帳本（G-Counter／grow-only set）：合併＝取聯集、同一格取大值，
//      兩台裝置各自澆水、各自答題，合併後兩邊个努力都留等，毋會互相蓋掉，合併順序也毋會影響結果。
//   3. 水缸、樹个成長、種子數量都「推算」自帳本，毋直接存；改版時改推算規則就好，毋使轉換存檔。
//   4. 「紀元（ep）」：確實愛歸零抑係大改版愛重頭來，淨准許用新紀元，高紀元整包取代低紀元，
//      而且愛經使用者同意（見 MIGRATIONS 个 consent）。
//   5. 比本機認得个版本更新（v 較大）个資料，毋讀、毋改、毋推，等使用者更新網站。
//
// 帳本欄位（v2）：
//   v      版本號（目前 3）
//   seed   地圖種子（整數）：地形（遠山、坡地）由它算出，毋佔儲存；合併取較小者，所有裝置會收斂到同一座山
//   ep     紀元（0 起；重設／大改版才增加）
//   since  開始計算學習水滴个日期（YYYY-MM-DD；合併取較晚者，避免舊資料重複計算）
//   earned { 日期: 該日入帳滴數 }                  合併：同日取大（只增）
//   audio  { 日期: { 裝置: 完整播完个音檔擺數 } }  合併：同格取大
//   spent  { 地塊: { 裝置: 澆在該地塊个滴數 } }    合併：同格取大
//   buys   { 種類: { 裝置: [買幾粒, 花幾滴] } }    合併：同格逐項取大
//   plots  { 地塊id: { k: 種子種類, o: 排序, s: 1 起始地, x, y: 位置（0~10000，種下去時決定，之後毋變） } }  合併：聯集；同一塊地位置無共樣時取較小者
//   adj    { 裝置: [加, 減] }                      開發／補償用調整，合併：逐項取大
//   base   { 日期: [復習基準, 新詞基準] }          重設當日入帳時記下，合併：逐項取大
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.hakfaGardenData = api;
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var SCHEMA = 3;
  var STARTER = 'p0';
  var MAX_PLOTS = 30;
  var MAX_KEYS = 600; // 防壞資料：任何一層 key 个上限
  var ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
  var DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
  var NUM_MAX = 10000000000000; // 1e13，夠放毫秒時間戳記

  function num(x) {
    x = Number(x);
    if (!isFinite(x) || x < 0) return 0;
    return Math.min(Math.floor(x), NUM_MAX);
  }
  function isObj(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }
  function keysOf(o) { return isObj(o) ? Object.keys(o).slice(0, MAX_KEYS) : []; }

  var START_POS = { x: 5000, y: 5000 };
  function frac(x) { return x - Math.floor(x); }
  function hash01(str) { // 確定性雜湊 → 0~1
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return ((h >>> 0) % 10000) / 10000;
  }
  // 第 k 塊地个位置：R2 低差異序列（分佈均勻、毋會擠做伙）加一點由 id 決定个抖動，看起來係隨意種个
  function placeAt(k, id) {
    var x = frac(0.5 + k * 0.7548776662466927) + (hash01('x' + id) - 0.5) * 0.06;
    var y = frac(0.5 + k * 0.5698402909980532) + (hash01('y' + id) - 0.5) * 0.06;
    x = Math.min(0.94, Math.max(0.06, x)); y = Math.min(0.94, Math.max(0.06, y));
    return { x: Math.round(x * 10000), y: Math.round(y * 10000) };
  }

  function emptyState(day, seed) {
    var plots = {};
    plots[STARTER] = { k: 'common', o: 0, s: 1, x: START_POS.x, y: START_POS.y };
    return { v: SCHEMA, ep: 0, seed: num(seed), since: DAY_RE.test(day || '') ? day : '', earned: {}, audio: {}, spent: {}, buys: {}, plots: plots, adj: {}, base: {} };
  }

  // ---- 清洗：把任何來源个 v2 資料變成合法个 v2（型態、範圍、key 格式） ----
  function clean(raw) {
    var s = emptyState('');
    s.ep = num(raw.ep);
    s.seed = num(raw.seed);
    s.since = DAY_RE.test(raw.since || '') ? raw.since : '';
    keysOf(raw.earned).forEach(function (d) { if (DAY_RE.test(d)) s.earned[d] = num(raw.earned[d]); });
    keysOf(raw.audio).forEach(function (d) {
      if (!DAY_RE.test(d) || !isObj(raw.audio[d])) return;
      s.audio[d] = {};
      keysOf(raw.audio[d]).forEach(function (dev) { if (ID_RE.test(dev)) s.audio[d][dev] = num(raw.audio[d][dev]); });
    });
    keysOf(raw.spent).forEach(function (p) {
      if (!ID_RE.test(p) || !isObj(raw.spent[p])) return;
      s.spent[p] = {};
      keysOf(raw.spent[p]).forEach(function (dev) { if (ID_RE.test(dev)) s.spent[p][dev] = num(raw.spent[p][dev]); });
    });
    keysOf(raw.buys).forEach(function (k) {
      if (!ID_RE.test(k) || !isObj(raw.buys[k])) return;
      s.buys[k] = {};
      keysOf(raw.buys[k]).forEach(function (dev) {
        var a = raw.buys[k][dev];
        if (ID_RE.test(dev) && Array.isArray(a)) s.buys[k][dev] = [num(a[0]), num(a[1])];
      });
    });
    var plotIds = keysOf(raw.plots).filter(function (id) { return ID_RE.test(id) && isObj(raw.plots[id]); });
    s.plots = {};
    plotIds.slice(0, MAX_PLOTS * 4).forEach(function (id) {
      var q = raw.plots[id];
      s.plots[id] = { k: ID_RE.test(q.k || '') ? q.k : 'common', o: num(q.o) };
      if (q.s) s.plots[id].s = 1;
      if (isFinite(Number(q.x)) && isFinite(Number(q.y)) && q.x !== null && q.y !== null) {
        s.plots[id].x = Math.min(10000, num(q.x)); s.plots[id].y = Math.min(10000, num(q.y));
      }
    });
    if (!s.plots[STARTER]) s.plots[STARTER] = { k: 'common', o: 0, s: 1, x: START_POS.x, y: START_POS.y };
    keysOf(raw.adj).forEach(function (dev) {
      var a = raw.adj[dev];
      if (ID_RE.test(dev) && Array.isArray(a)) s.adj[dev] = [num(a[0]), num(a[1])];
    });
    keysOf(raw.base).forEach(function (d) {
      var a = raw.base[d];
      if (DAY_RE.test(d) && Array.isArray(a)) s.base[d] = [num(a[0]), num(a[1])];
    });
    return s;
  }

  // ---- 版本升級 ----
  // 每一步：{ from, to, consent, describe, run(raw, ctx) }。
  //   consent:true ＝會改變使用者看得著个內容（大轉換），愛使用者同意正做；呼叫端愛先備份、再問。
  //   consent:false ＝淨補欄位／等值轉換，免問（但仍會備份）。
  // 往後改版：在這加一步，並把 SCHEMA 加一。舊資料永遠留等備份，毋會當場覆蓋。
  var MIGRATIONS = [
    {
      from: 1, to: 2, consent: false,
      describe: '改成「帳本」結構，跨裝置同步毋會互相蓋掉；水缸、樹、種子數量維持原樣',
      run: function (raw, ctx) {
        var dev = ctx.dev, day = ctx.day;
        var s = emptyState(day);
        var plots = Array.isArray(raw.plots) && raw.plots.length ? raw.plots : [{ k: 'common', n: num(raw.poured) }];
        var extra = plots.length - 1;
        var seedsOwned = num(raw.seeds && raw.seeds.common);
        var poured = 0;
        plots.forEach(function (q, i) {
          var id = i === 0 ? STARTER : 'L' + dev + '_' + i;
          var n = num(q && q.n);
          poured += n;
          if (i > 0) s.plots[id] = { k: 'common', o: i };
          s.spent[id] = {}; s.spent[id][dev] = n;
        });
        var count = seedsOwned + extra;
        if (count > 0) s.buys.common = (function () { var o = {}; o[dev] = [count, count * 10]; return o; })();
        // 等值轉換：讓推算出來个水缸 = 舊个 bank
        s.adj[dev] = [num(raw.bank) + poured + count * 10, 0];
        return s;
      }
    },
    {
      from: 2, to: 3, consent: false,
      describe: '庭院改成臺灣北部丘陵地形：加地圖種子，每塊地有位置（原本个樹、水缸、種子毋變）',
      run: function (raw, ctx) {
        var s = JSON.parse(JSON.stringify(raw));
        s.seed = num(s.seed) || num(ctx.seed) || 1;
        var ids = keysOf(s.plots).sort(function (a, b) {
          var oa = num(s.plots[a].o), ob = num(s.plots[b].o);
          return oa - ob || (a < b ? -1 : a > b ? 1 : 0);
        });
        var k = 0;
        ids.forEach(function (id) {
          var q = s.plots[id];
          if (id === STARTER) { q.x = START_POS.x; q.y = START_POS.y; return; }
          k++;
          if (q.x === undefined || q.y === undefined) { var p = placeAt(k, id); q.x = p.x; q.y = p.y; }
        });
        return s;
      }
    }
  ];

  // 回傳 { state, from, to, steps, pendingConsent, newer }
  //   newer：資料比這支程式認得个新（v > SCHEMA）→ 毋碰。
  //   pendingConsent：有愛同意个升級步驟，淨有 opts.consented 為真正會執行。
  function normalize(raw, ctx, opts) {
    ctx = ctx || {}; opts = opts || {};
    if (!isObj(raw)) return { state: emptyState(ctx.day, ctx.seed), from: SCHEMA, to: SCHEMA, steps: [], pendingConsent: null, newer: false };
    var target = opts.target || SCHEMA; // 測試用：可指定目標版本
    var v = raw.v === undefined ? 1 : num(raw.v);
    if (v > target) return { state: null, from: v, to: v, steps: [], pendingConsent: null, newer: true };
    var from = v, steps = [], cur = raw;
    while (v < target) {
      var step = null;
      for (var i = 0; i < MIGRATIONS.length; i++) if (MIGRATIONS[i].from === v) step = MIGRATIONS[i];
      if (!step) break;
      if (step.consent && !opts.consented) {
        return { state: null, from: from, to: v, steps: steps, pendingConsent: step, newer: false };
      }
      cur = step.run(cur, ctx);
      steps.push({ from: step.from, to: step.to, describe: step.describe });
      v = step.to;
    }
    return { state: clean(cur), from: from, to: v, steps: steps, pendingConsent: null, newer: false };
  }

  // ---- 推算：水缸、各地塊滴數、種子數量 ----
  function sumVals(o) { var t = 0; keysOf(o).forEach(function (k) { t += num(o[k]); }); return t; }
  function derive(s) {
    var earned = 0, adjPlus = 0, adjMinus = 0, pourTotal = 0, buyDrops = 0;
    keysOf(s.earned).forEach(function (d) { earned += num(s.earned[d]); });
    keysOf(s.adj).forEach(function (dev) { adjPlus += s.adj[dev][0]; adjMinus += s.adj[dev][1]; });
    var spentByPlot = {};
    keysOf(s.spent).forEach(function (p) { spentByPlot[p] = sumVals(s.spent[p]); pourTotal += spentByPlot[p]; });
    var bought = {};
    keysOf(s.buys).forEach(function (k) {
      bought[k] = 0;
      keysOf(s.buys[k]).forEach(function (dev) { bought[k] += s.buys[k][dev][0]; buyDrops += s.buys[k][dev][1]; });
    });
    var plots = keysOf(s.plots).map(function (id) {
      var q = s.plots[id];
      return { id: id, k: q.k, o: q.o, s: !!q.s, n: spentByPlot[id] || 0, x: q.x, y: q.y };
    }).sort(function (a, b) { return a.o - b.o || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0); });
    var planted = {};
    plots.forEach(function (q) { if (!q.s) planted[q.k] = (planted[q.k] || 0) + 1; });
    var seeds = {};
    keysOf(bought).forEach(function (k) { seeds[k] = Math.max(0, bought[k] - (planted[k] || 0)); });
    Object.keys(planted).forEach(function (k) { if (!(k in seeds)) seeds[k] = 0; });
    // 兩台同時花水可能花超過：內部可為負，之後入帳會補回；對外顯示毋會低過 0
    var rawBank = earned + adjPlus - adjMinus - pourTotal - buyDrops;
    return { bank: Math.max(0, rawBank), rawBank: rawBank, earnedTotal: earned + adjPlus - adjMinus, plots: plots, seeds: seeds };
  }

  // ---- 合併：交換律、結合律、冪等 ----
  function maxMap2(a, b) { // { x: { y: n } }
    var out = {};
    [a, b].forEach(function (m) {
      keysOf(m).forEach(function (x) {
        out[x] = out[x] || {};
        keysOf(m[x]).forEach(function (y) { out[x][y] = Math.max(out[x][y] || 0, m[x][y]); });
      });
    });
    return out;
  }
  function maxPairs(a, b) { // { x: [p, q] }
    var out = {};
    [a, b].forEach(function (m) {
      keysOf(m).forEach(function (x) {
        var cur = out[x] || [0, 0];
        out[x] = [Math.max(cur[0], m[x][0]), Math.max(cur[1], m[x][1])];
      });
    });
    return out;
  }
  function merge(a, b) {
    if (a.ep !== b.ep) return JSON.parse(JSON.stringify(a.ep > b.ep ? a : b)); // 高紀元整包取代
    var s = emptyState('');
    s.ep = a.ep;
    s.since = a.since > b.since ? a.since : b.since;
    s.seed = a.seed && b.seed ? Math.min(a.seed, b.seed) : (a.seed || b.seed); // 兩台个種子無共樣就取較小个，收斂到同一座山
    s.earned = {};
    [a.earned, b.earned].forEach(function (m) { keysOf(m).forEach(function (d) { s.earned[d] = Math.max(s.earned[d] || 0, m[d]); }); });
    s.audio = maxMap2(a.audio, b.audio);
    s.spent = maxMap2(a.spent, b.spent);
    s.buys = {};
    var kinds = {};
    keysOf(a.buys).concat(keysOf(b.buys)).forEach(function (k) { kinds[k] = 1; });
    Object.keys(kinds).forEach(function (k) { s.buys[k] = maxPairs(a.buys[k], b.buys[k]); });
    s.plots = {};
    [a.plots, b.plots].forEach(function (m) {
      keysOf(m).forEach(function (id) {
        var q = m[id], cur = s.plots[id];
        if (!cur) { cur = s.plots[id] = { k: q.k, o: q.o }; }
        if (q.s) cur.s = 1;
        if (q.x !== undefined && q.y !== undefined) { // 位置無共樣時取較小者（確定性）
          if (cur.x === undefined || q.x < cur.x || (q.x === cur.x && q.y < cur.y)) { cur.x = q.x; cur.y = q.y; }
        }
      });
    });
    s.adj = maxPairs(a.adj, b.adj);
    s.base = maxPairs(a.base, b.base);
    return s;
  }

  // ---- 操作（直接改傳入个 state，回傳是否成功） ----
  function addAudio(s, day, dev) {
    s.audio[day] = s.audio[day] || {};
    s.audio[day][dev] = num(s.audio[day][dev]) + 1;
  }
  function audioTotal(s, day) { return sumVals(s.audio[day]); }
  function setEarned(s, day, n) { // 只增
    n = num(n);
    if (n > num(s.earned[day])) { s.earned[day] = n; return true; }
    return false;
  }
  function pour(s, plotId, dev) {
    var d = derive(s);
    if (d.rawBank < 1 || !s.plots[plotId]) return false;
    s.spent[plotId] = s.spent[plotId] || {};
    s.spent[plotId][dev] = num(s.spent[plotId][dev]) + 1;
    return true;
  }
  function buy(s, kind, price, dev) {
    if (!ID_RE.test(kind) || derive(s).rawBank < price) return false;
    s.buys[kind] = s.buys[kind] || {};
    var cur = s.buys[kind][dev] || [0, 0];
    s.buys[kind][dev] = [cur[0] + 1, cur[1] + price];
    return true;
  }
  // 兩塊地至少愛隔這麼遠（x 方向、y 方向淨要一邊夠遠就好）：畫面上約一欉樹个寬度
  var TOO_CLOSE = { dx: 480, dy: 900 };
  function canPlaceAt(s, x, y) {
    x = Number(x); y = Number(y);
    if (!isFinite(x) || !isFinite(y) || x < 0 || y < 0 || x > 10000 || y > 10000) return false;
    var ids = keysOf(s.plots);
    for (var i = 0; i < ids.length; i++) {
      var q = s.plots[ids[i]];
      if (q.x !== undefined && Math.abs(q.x - x) < TOO_CLOSE.dx && Math.abs(q.y - y) < TOO_CLOSE.dy) return false;
    }
    return true;
  }
  // pos 無指定就自動分配（均勻、隨意个位置）；有指定（使用者點選）就檢查範圍摎距離
  function plant(s, kind, id, o, maxPlots, pos) {
    var d = derive(s);
    if (!ID_RE.test(id) || s.plots[id] || (d.seeds[kind] || 0) < 1 || d.plots.length >= (maxPlots || MAX_PLOTS)) return false;
    var p;
    if (pos) {
      if (!canPlaceAt(s, pos.x, pos.y)) return false;
      p = { x: Math.round(pos.x), y: Math.round(pos.y) };
    } else {
      p = placeAt(d.plots.length, id);
    }
    s.plots[id] = { k: kind, o: num(o), x: p.x, y: p.y };
    return true;
  }
  function adjust(s, dev, plus, minus) {
    var cur = s.adj[dev] || [0, 0];
    s.adj[dev] = [cur[0] + num(plus), cur[1] + num(minus)];
  }
  function addSeed(s, kind, dev) { // 開發用：白送一粒（花 0 滴）
    s.buys[kind] = s.buys[kind] || {};
    var cur = s.buys[kind][dev] || [0, 0];
    s.buys[kind][dev] = [cur[0] + 1, cur[1]];
  }
  // 新紀元：重設抑係大改版用。fn(copy) 改完後，ep 設成 max(舊 ep + 1, ep)；高紀元會取代所有裝置个舊紀元資料
  function newEpoch(s, ep, fn) {
    var c = JSON.parse(JSON.stringify(s));
    if (fn) fn(c);
    c.ep = Math.max(num(ep), s.ep + 1);
    return c;
  }
  function stableStringify(x) {
    if (Array.isArray(x)) return '[' + x.map(stableStringify).join(',') + ']';
    if (x && typeof x === 'object') return '{' + Object.keys(x).sort().map(function (k) { return JSON.stringify(k) + ':' + stableStringify(x[k]); }).join(',') + '}';
    return JSON.stringify(x);
  }
  function equal(a, b) { return stableStringify(a) === stableStringify(b); }

  return {
    SCHEMA: SCHEMA, STARTER: STARTER, MAX_PLOTS: MAX_PLOTS, MIGRATIONS: MIGRATIONS,
    placeAt: placeAt, canPlaceAt: canPlaceAt, TOO_CLOSE: TOO_CLOSE, START_POS: START_POS,
    emptyState: emptyState, normalize: normalize, clean: clean, derive: derive, merge: merge, equal: equal,
    addAudio: addAudio, audioTotal: audioTotal, setEarned: setEarned, pour: pour, buy: buy, plant: plant,
    adjust: adjust, addSeed: addSeed, newEpoch: newEpoch
  };
});
