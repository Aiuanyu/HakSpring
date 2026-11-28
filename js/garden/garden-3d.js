// 客源翠庭院：類 3D 地形（Canvas 2D，毋用 WebGL）
//
// 一座由「地圖種子」算出來个無邊界大地：高低起伏、山谷、小溪；地面一格一格投影到畫面，由遠到近畫，
// 樹係直立个手繪貼圖，站在地面上、永遠面向鏡頭。鏡頭可水平旋轉（yaw）、垂直俯仰（pitch）、拉遠拉近（dist）。
// 只在操作時重繪，平常靜止、毋跑動畫（Zen／Firefox 吃 GPU）。
//
// 本檔分兩部份：
//   1. 純函式（高度、座標轉換、鏡頭投影、射線找地面）：無 DOM，Node 也做得測試。
//   2. create(...)：Canvas 渲染器。
//
// 世界座標：x 向東、y 向北、z 向上，單位約略「步」。庭院个地塊座標（0~10000）對應「家鄉山谷」边長 VALLEY 个正方形：
//   wx = (px - 5000) / 10000 * VALLEY ，wy = (5000 - py) / 10000 * VALLEY（py 愈大愈靠近鏡頭，同以前平面个習慣）
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.hakfaGarden3D = api;
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var VALLEY = 1000;       // 家鄉山谷邊長
  var TREE_H = 95;         // 一欉樹个世界高度（貼圖 207 個單位高）
  var FOV = 46 * Math.PI / 180;
  var NEAR = 20;

  // ---------- 1. 高度場：種子決定一座山，毋佔儲存 ----------
  function hash2(ix, iy, seed) { // 確定性雜湊 → 0~1
    var h = (ix * 374761393 + iy * 668265263 + seed * 2246822519) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h = h ^ (h >>> 16);
    return ((h >>> 0) % 100000) / 100000;
  }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function vnoise(x, y, seed) {
    var ix = Math.floor(x), iy = Math.floor(y), fx = smooth(x - ix), fy = smooth(y - iy);
    var a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed), c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }
  function fbm(x, y, seed) {
    return (vnoise(x, y, seed) * 0.55 + vnoise(x * 2.03, y * 2.03, seed + 7) * 0.28 + vnoise(x * 4.1, y * 4.1, seed + 13) * 0.17);
  }
  function sstep(a, b, x) { var t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

  // 小溪：穿過山谷个一條曲線，到山區就消失
  function streamD(seed, wx, wy) {
    var ph = (seed % 628) / 100, cx = 70 * Math.sin(wy / 190 + ph) + 30 * Math.sin(wy / 77 + ph * 2) + ((seed >> 3) % 120) - 60;
    return Math.abs(wx - cx);
  }
  function valleyMask(wx, wy) { return sstep(430, 950, Math.sqrt(wx * wx + wy * wy)); } // 0＝山谷中央，1＝外圍山區
  function heightAt(seed, wx, wy) {
    var m = valleyMask(wx, wy);
    var gentle = (fbm(wx / 210, wy / 210, seed) - 0.5) * 26;                    // 山谷內：和緩起伏
    var mount = fbm(wx / 330 + 20, wy / 330 + 20, seed + 91) * 260 + 60;        // 外圍：山
    var h = gentle * (0.35 + 0.65 * (1 - m)) + m * m * mount * 0.9;
    var d = streamD(seed, wx, wy);
    if (d < 34) h -= 11 * (1 - m) * Math.exp(-Math.pow(d / 17, 2));              // 溪床
    return h;
  }
  function isWater(seed, wx, wy) { return valleyMask(wx, wy) < 0.7 && streamD(seed, wx, wy) < 15; }


  // ---------- 時間光影：太陽（或月亮）位置、光色、天色，隨一天个時間變化 ----------
  // hours：當地時間 0~24（小數）。dark＝暗色主題（永遠係夜晚，月亮隨時間走過天空）。
  // 回傳 { dir:[x,y,z]（光來个方向，單位向量）, elev（-1~1，高度）, warm（0~1，晨昏暖色程度）, light（0~1，光強度）, night, sky: 'day'|'golden'|'night' }
  function sunState(hours, dark) {
    var h = ((hours % 24) + 24) % 24, theta, elev, night = false, dir;
    if (dark) { // 暗色主題：月亮一整天由東往西走
      theta = (h / 24) * Math.PI * 2;
      dir = [Math.cos(theta) * 0.9, 0.3, 0.38 + 0.5 * Math.sin(theta * 0.5 + 0.8)];
      night = true; elev = 0.3;
    } else if (h >= 6 && h <= 18) { // 白天：東升西落，偏南
      theta = (h - 6) / 12 * Math.PI;
      dir = [Math.cos(theta), -0.35, Math.sin(theta)];
      elev = Math.sin(theta);
    } else { // 夜裡：月亮
      var hh = h < 6 ? h + 6 : h - 18;
      theta = hh / 12 * Math.PI;
      dir = [Math.cos(theta), 0.3, Math.sin(theta) * 0.8 + 0.05];
      elev = -Math.sin(theta) * 0.6; night = true;
    }
    var l = Math.sqrt(dir[0] * dir[0] + dir[1] * dir[1] + dir[2] * dir[2]); dir = [dir[0] / l, dir[1] / l, dir[2] / l];
    var warm = night ? 0 : Math.max(0, Math.min(1, 1 - elev * 2.6)); // 太陽低个時節偏暖色
    var light = night ? 0.62 : 0.72 + 0.4 * Math.max(0, elev);
    return { dir: dir, elev: elev, warm: warm, light: light, night: night, sky: night ? 'night' : (warm > 0.25 ? 'golden' : 'day') };
  }

  // 茶園梯田：丘陵坡地上一塊一塊个茶園，等高線方向一排一排
  function teaPatch(seed, cx, cy, m) { // 0~1：這一格係茶園个程度
    var p = fbm(cx / 240 + 5, cy / 240 + 5, seed + 17);
    var a = Math.max(0, Math.min(1, (p - 0.5) / 0.1)); a = a * a * (3 - 2 * a);
    return a * sstep(0.18, 0.34, m) * (1 - sstep(0.8, 0.95, m));
  }
  function terraceBand(h) { // 1＝茶欉那一排，0＝田埂；每 5.5 個高度單位一階
    var f = h / 5.5 - Math.floor(h / 5.5);
    return sstep(0, 0.18, f) * (1 - sstep(0.5, 0.68, f));
  }

  // 地面裝飾：石頭、草叢、野花、小溪邊个水草。用固定个世界格線（間距 L）確定性擺放，旋轉縮放毋會閃爍。
  // 回傳 null 或 { type:'rock'|'tuft'|'flower'|'reed', x, y, size, v（0~1 變化） }
  function decorAt(seed, i, j, L) {
    var r = hash2(i, j, seed + 500), x = (i + 0.5 + (hash2(i, j, seed + 501) - 0.5) * 0.9) * L, y = (j + 0.5 + (hash2(i, j, seed + 502) - 0.5) * 0.9) * L;
    if (isWater(seed, x, y)) return null;
    var m = valleyMask(x, y), sd = streamD(seed, x, y), v = hash2(i, j, seed + 503);
    if (m < 0.75 && sd > 13 && sd < 42 && r < 0.6) return { type: 'reed', x: x, y: y, size: 14 + v * 10, v: v };
    if (r < 0.05 + 0.2 * m) return { type: 'rock', x: x, y: y, size: 5 + v * 13 * (0.6 + m), v: v };
    if (m < 0.55 && r < 0.2) return { type: 'flower', x: x, y: y, size: 6 + v * 4, v: v };
    if (r < 0.5) return { type: 'tuft', x: x, y: y, size: 8 + v * 7, v: v };
    return null;
  }

  // 加上「地塊平台」个高度：每塊地腳下半徑 R 內，高度逐漸攤平到該地塊中心个高度（平滑過渡），樹毋會被起伏埋著
  function heightWithPads(seed, pads, wx, wy, R) {
    var h = heightAt(seed, wx, wy);
    for (var i = 0; i < pads.length; i++) {
      var p = pads[i], dx = wx - p.x, dy = wy - p.y;
      if (dx > R || dx < -R || dy > R || dy < -R) continue;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < R) { var k = 1 - d / R; k = k * k * (3 - 2 * k); h = h * (1 - k) + p.z * k; }
    }
    return h;
  }

  // ---------- 地塊座標 ↔ 世界座標 ----------
  function plotToWorld(px, py) { return { x: (px - 5000) / 10000 * VALLEY, y: (5000 - py) / 10000 * VALLEY }; }
  function worldToPlot(wx, wy) { return { x: 5000 + wx / VALLEY * 10000, y: 5000 - wy / VALLEY * 10000 }; }

  // ---------- 鏡頭 ----------
  // cam: { yaw, pitch, dist, tx, ty, w, h, seed }（yaw=0 由南往北看；pitch 係仰角，0＝平視、π/2＝垂直往下看）
  function camera(c) {
    var tz = heightAt(c.seed, c.tx, c.ty);
    var cp = Math.cos(c.pitch), sp = Math.sin(c.pitch), sy = Math.sin(c.yaw), cy = Math.cos(c.yaw);
    var pos = { x: c.tx - c.dist * cp * sy, y: c.ty - c.dist * cp * cy, z: tz + c.dist * sp };
    var f = { x: c.tx - pos.x, y: c.ty - pos.y, z: tz - pos.z };
    var fl = Math.sqrt(f.x * f.x + f.y * f.y + f.z * f.z); f.x /= fl; f.y /= fl; f.z /= fl;
    // 右 = F × 上(0,0,1)
    var r = { x: f.y, y: -f.x, z: 0 }, rl = Math.sqrt(r.x * r.x + r.y * r.y) || 1; r.x /= rl; r.y /= rl;
    var u = { x: r.y * f.z - r.z * f.y, y: r.z * f.x - r.x * f.z, z: r.x * f.y - r.y * f.x };
    var fpx = (c.h / 2) / Math.tan(FOV / 2);
    return { pos: pos, f: f, r: r, u: u, fpx: fpx, w: c.w, h: c.h, tz: tz };
  }
  function project(cam, x, y, z) { // 世界點 → 螢幕；zc＝景深（愈大愈遠）
    var vx = x - cam.pos.x, vy = y - cam.pos.y, vz = z - cam.pos.z;
    var zc = vx * cam.f.x + vy * cam.f.y + vz * cam.f.z;
    if (zc < NEAR) return null;
    var xc = vx * cam.r.x + vy * cam.r.y + vz * cam.r.z, yc = vx * cam.u.x + vy * cam.u.y + vz * cam.u.z;
    return { x: cam.w / 2 + xc / zc * cam.fpx, y: cam.h / 2 - yc / zc * cam.fpx, zc: zc, k: cam.fpx / zc };
  }
  // 螢幕點 → 射線 → 地面交點（逐步前進，再二分逼近）
  function groundHit(cam, seedOrFn, sx, sy, maxDist) {
    var hf = typeof seedOrFn === 'function' ? seedOrFn : function (x, y) { return heightAt(seedOrFn, x, y); };
    var dx = (sx - cam.w / 2) / cam.fpx, dy = (sy - cam.h / 2) / cam.fpx;
    var d = { x: cam.f.x + dx * cam.r.x - dy * cam.u.x, y: cam.f.y + dx * cam.r.y - dy * cam.u.y, z: cam.f.z + dx * cam.r.z - dy * cam.u.z };
    var dl = Math.sqrt(d.x * d.x + d.y * d.y + d.z * d.z); d.x /= dl; d.y /= dl; d.z /= dl;
    var far = maxDist || 4000, step = Math.max(6, far / 360), t = NEAR, prev = t, hit = false;
    for (; t < far; t += step) {
      var px = cam.pos.x + d.x * t, py = cam.pos.y + d.y * t, pz = cam.pos.z + d.z * t;
      if (pz <= hf(px, py)) { hit = true; break; }
      prev = t;
    }
    if (!hit) return null;
    var lo = prev, hi = t;
    for (var i = 0; i < 12; i++) {
      var mid = (lo + hi) / 2, mx = cam.pos.x + d.x * mid, my = cam.pos.y + d.y * mid, mz = cam.pos.z + d.z * mid;
      if (mz <= hf(mx, my)) hi = mid; else lo = mid;
    }
    var gx = cam.pos.x + d.x * hi, gy = cam.pos.y + d.y * hi;
    return { x: gx, y: gy, z: hf(gx, gy), t: hi };
  }

  // ---------- 2. 渲染器（瀏覽器） ----------
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function rgb(c) { return 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')'; }

  // opts: { base, overlay（兩張 canvas）, seed(): 數字, plots(): [{id,x,y,n,stage}], sel(): 目前選著个 id,
  //         theme(): { dark, skyTop, skyBot, grass, grassHi, hill, rock, water, sun, fog }（皆 [r,g,b]）,
  //         sprite(stage, lod): Image|null, onSprite: 貼圖載入好後愛重繪 }
  function create(opts) {
    var cam3 = { yaw: 0.35, pitch: 0.5, dist: 780, tx: 0, ty: 0 };
    var HOME = { yaw: 0.35, pitch: 0.5, dist: 780, tx: 0, ty: 0 };
    var dpr = 1, W = 0, H = 0, raf = 0, idle = 0, lastCam = null, cache = null, stars = [];
    var ctx = opts.base.getContext('2d'), octx = opts.overlay.getContext('2d');
    for (var s = 0; s < 46; s++) stars.push([hash2(s, 1, 5), hash2(s, 2, 5) * 0.55, 0.6 + hash2(s, 3, 5) * 1.2]);

    function resize() {
      var r = opts.base.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = Math.max(50, Math.round(r.width)); H = Math.max(50, Math.round(r.height));
      [opts.base, opts.overlay].forEach(function (c) { c.width = W * dpr; c.height = H * dpr; });
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); octx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cache = null;
    }
    // 地塊个高度場：基礎地形，加上每塊地腳下一小塊攤平个平台（半徑 PAD_R），樹毋會被地形埋著、剛落泥个土堆也看得完整
    var PAD_R = 46, pads = [], padSig = '';
    function refreshPads() {
      var seed = opts.seed(), list = opts.plots(), sig = seed + ':';
      pads = list.map(function (q) { var w = plotToWorld(q.x, q.y); sig += q.x + ',' + q.y + ';'; return { x: w.x, y: w.y, z: heightAt(seed, w.x, w.y) }; });
      if (sig !== padSig) { padSig = sig; cache = null; }
    }
    function hf(wx, wy) { return heightWithPads(opts.seed(), pads, wx, wy, PAD_R); }
    function curCam() { refreshPads(); return camera({ yaw: cam3.yaw, pitch: cam3.pitch, dist: cam3.dist, tx: cam3.tx, ty: cam3.ty, w: W, h: H, seed: opts.seed() }); }

    // 地面格點：以目標為中心、對齊格線（平移時毋會閃爍）；旋轉毋影響，故做得快取
    function grid(N, E, seed) {
      var cs = E * 2 / N, ox = Math.round((cam3.tx - E) / cs) * cs, oy = Math.round((cam3.ty - E) / cs) * cs;
      var key = N + '|' + seed + '|' + cs.toFixed(2) + '|' + ox + '|' + oy;
      if (cache && cache.key === key) return cache;
      var hs = new Float32Array((N + 1) * (N + 1));
      for (var j = 0; j <= N; j++) for (var i = 0; i <= N; i++) hs[j * (N + 1) + i] = hf(ox + i * cs, oy + j * cs);
      cache = { key: key, N: N, cs: cs, ox: ox, oy: oy, hs: hs };
      return cache;
    }

    // 石頭、草叢、野花、水草：幾筆向量，大小隨遠近
    function drawDecor(dr, th, fogS, fogE, tint, light) {
      var dc = dr.dc, p = dr.p, k = p.k, fg = Math.max(0, Math.min(1, (p.zc - fogS) / (fogE - fogS))), a = 1 - fg * 0.85, v = dc.v;
      ctx.globalAlpha = a;
      var sh = Math.min(1.1, 0.5 + light * 0.55);
      if (dc.type === 'rock') {
        var w = dc.size * k, h = w * 0.62, base = mix(th.rock, [90, 90, 90], 0.25);
        ctx.fillStyle = rgb([base[0] * sh * tint[0], base[1] * sh * tint[1], base[2] * sh * tint[2]]); ctx.strokeStyle = 'rgba(40,40,40,.45)'; ctx.lineWidth = Math.max(0.6, w * 0.05);
        ctx.beginPath(); ctx.moveTo(p.x - w * 0.6, p.y); ctx.lineTo(p.x - w * 0.4, p.y - h * 0.8); ctx.lineTo(p.x + w * (0.05 + v * 0.1), p.y - h); ctx.lineTo(p.x + w * 0.55, p.y - h * 0.5); ctx.lineTo(p.x + w * 0.62, p.y); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.beginPath(); ctx.moveTo(p.x - w * 0.4, p.y - h * 0.8); ctx.lineTo(p.x + w * (0.05 + v * 0.1), p.y - h); ctx.lineTo(p.x + w * 0.1, p.y - h * 0.55); ctx.closePath(); ctx.fill();
      } else if (dc.type === 'tuft') {
        var hh = dc.size * k, gcol = mix(th.grass, [20, 60, 20], 0.35);
        ctx.strokeStyle = rgb([gcol[0] * sh * tint[0], gcol[1] * sh * tint[1], gcol[2] * sh * tint[2]]); ctx.lineWidth = Math.max(0.9, hh * 0.16); ctx.lineCap = 'round';
        for (var b = -2; b <= 2; b++) { ctx.beginPath(); ctx.moveTo(p.x + b * hh * 0.12, p.y); ctx.quadraticCurveTo(p.x + b * hh * 0.2, p.y - hh * 0.6, p.x + b * hh * 0.34 + (v - 0.5) * hh * 0.2, p.y - hh * (0.8 + 0.1 * Math.abs(b))); ctx.stroke(); }
      } else if (dc.type === 'flower') {
        var fs = dc.size * k, pal = [[255, 255, 255], [255, 214, 64], [255, 158, 188], [196, 176, 255]], fc = pal[Math.floor(v * 4) % 4];
        ctx.strokeStyle = rgb(mix(th.grass, [20, 70, 20], 0.4)); ctx.lineWidth = Math.max(0.8, fs * 0.12);
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y - fs * 0.9); ctx.stroke();
        ctx.fillStyle = rgb(fc); ctx.beginPath(); ctx.arc(p.x, p.y - fs, Math.max(1.3, fs * 0.28), 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255,200,60,.9)'; ctx.beginPath(); ctx.arc(p.x, p.y - fs, Math.max(0.6, fs * 0.1), 0, 7); ctx.fill();
      } else { // reed 水草
        var rh = dc.size * k;
        ctx.lineCap = 'round';
        for (var r = 0; r < 4; r++) {
          var ox = (r - 1.5) * rh * 0.12, lean = (v - 0.5) * rh * 0.3 + (r - 1.5) * rh * 0.05;
          ctx.strokeStyle = rgb(mix(th.grass, [50, 90, 40], 0.5)); ctx.lineWidth = Math.max(0.9, rh * 0.07);
          ctx.beginPath(); ctx.moveTo(p.x + ox, p.y); ctx.quadraticCurveTo(p.x + ox + lean * 0.3, p.y - rh * 0.6, p.x + ox + lean, p.y - rh); ctx.stroke();
          if (r === 1 || r === 2) { ctx.strokeStyle = '#7a5230'; ctx.lineWidth = Math.max(1.4, rh * 0.12); ctx.beginPath(); ctx.moveTo(p.x + ox + lean, p.y - rh); ctx.lineTo(p.x + ox + lean + lean * 0.05, p.y - rh * 1.18); ctx.stroke(); }
        }
      }
      ctx.globalAlpha = 1;
    }
    // 紙紋：小塊隨機雜點，鋪滿整張圖，像手繪水彩紙（靜態，毋用濾鏡）
    var grain = null;
    function grainPattern() {
      if (grain) return grain;
      try {
        var c = document.createElement('canvas'); c.width = c.height = 96;
        var g2 = c.getContext('2d'), im = g2.createImageData(96, 96);
        for (var k = 0; k < 96 * 96; k++) { var v = 128 + (hash2(k, 7, 11) - 0.5) * 70; im.data[k * 4] = im.data[k * 4 + 1] = im.data[k * 4 + 2] = v; im.data[k * 4 + 3] = 20; }
        g2.putImageData(im, 0, 0); grain = ctx.createPattern(c, 'repeat');
      } catch (e) { grain = null; }
      return grain;
    }
    var SKY_GOLD = { top: [140, 160, 205], bot: [255, 190, 135] };
    function nowHours() { var d = opts.now ? opts.now() : new Date(); return d.getHours() + d.getMinutes() / 60; }
    // 遠山剪影：好幾層越遠越淡，填補地平線，讓大地看起來真个無邊
    function farRidges(cam, th, seed, fogMix, coarse) {
      var step = coarse ? 14 : 6, horizon = H / 2 - cam.fpx * Math.tan(cam3.pitch);
      var layers = [{ D: 4200, amp: 1500, c: 0.5 }, { D: 6800, amp: 2200, c: 0.68 }, { D: 10500, amp: 3200, c: 0.82 }];
      layers.forEach(function (ly, li) {
        ctx.beginPath(); ctx.moveTo(-10, H + 10);
        for (var x = -10; x <= W + 10; x += step) {
          var bearing = cam3.yaw + Math.atan((x - W / 2) / cam.fpx), n = fbm(bearing * 1.6 + li * 9.3, li * 3.1, seed + 41);
          var e = Math.atan((120 + n * ly.amp) / ly.D), y = H / 2 - cam.fpx * Math.tan(cam3.pitch + e);
          ctx.lineTo(x, y);
        }
        ctx.lineTo(W + 10, H + 10); ctx.closePath();
        ctx.fillStyle = rgb(mix(mix(th.hill, th.rock, 0.5), fogMix, ly.c)); ctx.fill();
      });
      return horizon;
    }
    function render(coarse) {
      if (!W) resize();
      var th = opts.theme(), seed = opts.seed(), cam = curCam(), ss = sunState(nowHours(), th.dark);
      // ---- 天空：隨時間變色（白晝／晨昏金黃／夜）。晨昏天色混入暖色 ----
      var top = th.skyTop, bot = th.skyBot;
      if (!th.dark) { if (ss.sky === 'golden') { top = mix(th.skyTop, SKY_GOLD.top, ss.warm); bot = mix(th.skyBot, SKY_GOLD.bot, ss.warm); } else if (ss.sky === 'night') { top = mix(th.skyTop, [60, 74, 125], 0.85); bot = mix(th.skyBot, [196, 150, 150], 0.7); } }
      var g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, rgb(top)); g.addColorStop(1, rgb(bot));
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      var fogC = bot;
      var night = th.dark || ss.sky === 'night';
      if (night) { ctx.fillStyle = 'rgba(255,244,214,.85)'; stars.forEach(function (s) { ctx.fillRect(s[0] * W, s[1] * H, s[2], s[2]); }); }
      // 日／月：由光來个方向投影到畫面，旋轉鏡頭就會移動、轉到後背就看無
      var sp = project(cam, cam.pos.x + ss.dir[0] * 9000, cam.pos.y + ss.dir[1] * 9000, cam.pos.z + ss.dir[2] * 9000);
      if (sp && sp.x > -80 && sp.x < W + 80 && sp.y > -80 && sp.y < H * 0.9) {
        var sc2 = night ? [233, 238, 251] : mix([255, 243, 191], [255, 190, 110], ss.warm);
        var rg = ctx.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, night ? 70 : 120);
        rg.addColorStop(0, 'rgba(' + (sc2[0] | 0) + ',' + (sc2[1] | 0) + ',' + (sc2[2] | 0) + ',' + (night ? 0.45 : 0.6) + ')'); rg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = rg; ctx.fillRect(sp.x - 130, sp.y - 130, 260, 260);
        ctx.fillStyle = rgb(sc2); ctx.beginPath(); ctx.arc(sp.x, sp.y, night ? 13 : 17, 0, 7); ctx.fill();
      }
      farRidges(cam, th, seed, fogC, coarse);

      var N = coarse ? 40 : 90, E = Math.max(480, Math.min(2200, cam3.dist * 1.55));
      var gr = grid(N, E, seed), cs = gr.cs, N1 = N + 1, hs = gr.hs;
      // 頂點投影
      var vx = new Float32Array(N1 * N1), vy = new Float32Array(N1 * N1), vz = new Float32Array(N1 * N1);
      for (var j = 0; j < N1; j++) for (var i = 0; i < N1; i++) {
        var p = project(cam, gr.ox + i * cs, gr.oy + j * cs, hs[j * N1 + i]), id = j * N1 + i;
        if (p) { vx[id] = p.x; vy[id] = p.y; vz[id] = p.zc; } else vz[id] = -1;
      }
      // 頂點法向量（相鄰格平均）→ 明暗柔和，毋會一格一格亮暗跳
      var nxv = new Float32Array(N1 * N1), nyv = new Float32Array(N1 * N1);
      for (j = 0; j < N1; j++) for (i = 0; i < N1; i++) {
        var i0 = Math.max(0, i - 1), i1 = Math.min(N, i + 1), j0 = Math.max(0, j - 1), j1 = Math.min(N, j + 1);
        nxv[j * N1 + i] = -(hs[j * N1 + i1] - hs[j * N1 + i0]) / ((i1 - i0) * cs);
        nyv[j * N1 + i] = -(hs[j1 * N1 + i] - hs[j0 * N1 + i]) / ((j1 - j0) * cs);
      }
      var fogS = E * 0.5, fogE = E * 1.2, drawables = [];
      var L = ss.dir, lightTint = ss.warm > 0 ? [1, 1 - 0.18 * ss.warm, 1 - 0.38 * ss.warm] : [1, 1, 1], amb = night ? 0.5 : 0.46;
      for (j = 0; j < N; j++) for (i = 0; i < N; i++) {
        var a = j * N1 + i, b = a + 1, c = a + N1, d = c + 1;
        if (vz[a] < 0 || vz[b] < 0 || vz[c] < 0 || vz[d] < 0) continue;
        var minX = Math.min(vx[a], vx[b], vx[c], vx[d]), maxX = Math.max(vx[a], vx[b], vx[c], vx[d]);
        var minY = Math.min(vy[a], vy[b], vy[c], vy[d]), maxY = Math.max(vy[a], vy[b], vy[c], vy[d]);
        if (maxX < -4 || minX > W + 4 || maxY < -4 || minY > H + 4) continue;
        drawables.push({ z: (vz[a] + vz[b] + vz[c] + vz[d]) / 4, t: 0, i: i, j: j });
      }
      // 地面裝飾：石頭、草叢、野花、水草（固定世界格線擺放；拖曳中略過）
      var plots = opts.plots(), lod = plots.length >= 8, selId = opts.sel();
      if (!coarse) {
        var DL = 60, Rd = Math.min(E * 0.8, 820), i0d = Math.floor((cam3.tx - Rd) / DL), i1d = Math.ceil((cam3.tx + Rd) / DL), j0d = Math.floor((cam3.ty - Rd) / DL), j1d = Math.ceil((cam3.ty + Rd) / DL);
        for (var jj = j0d; jj <= j1d; jj++) for (var ii = i0d; ii <= i1d; ii++) {
          var dc = decorAt(seed, ii, jj, DL);
          if (!dc) continue;
          var near = false;
          for (var pk = 0; pk < pads.length; pk++) { var ddx = dc.x - pads[pk].x, ddy = dc.y - pads[pk].y; if (ddx * ddx + ddy * ddy < PAD_R * PAD_R * 0.8) { near = true; break; } }
          if (near) continue;
          var dz = hf(dc.x, dc.y), dp = project(cam, dc.x, dc.y, dz);
          if (dp && dp.zc < E * 0.85 && (dp.zc < E * 0.5 || dc.v < 0.6) && dp.x > -20 && dp.x < W + 20 && dp.y > -20 && dp.y < H + 40) drawables.push({ z: dp.zc - cs * 0.3, t: 2, dc: dc, p: dp });
        }
      }
      // 樹
      plots.forEach(function (q) {
        var w = plotToWorld(q.x, q.y), z = hf(w.x, w.y) + 1.2, p = project(cam, w.x, w.y, z);
        if (p) drawables.push({ z: p.zc - cs * 1.6, t: 1, q: q, w: w, gz: z, p: p }); // 往鏡頭偏一點：正前方个格子毋會蓋著腳下个土堆
      });
      drawables.sort(function (u, v) { return v.z - u.z; });
      var sprites = {}, pending = false, teaCol = th.tea || mix(th.hill, [70, 120, 60], 0.4), soilCol = th.soil || [188, 160, 110];
      var waterCol = mix(th.water, fogC, 0.18);
      drawables.forEach(function (dr) {
        if (dr.t === 0) {
          var i2 = dr.i, j2 = dr.j, a2 = j2 * N1 + i2, b2 = a2 + 1, c2 = a2 + N1, d2 = c2 + 1;
          // 柔和明暗：四個頂點法向量平均
          var nx = (nxv[a2] + nxv[b2] + nxv[c2] + nxv[d2]) / 4, ny = (nyv[a2] + nyv[b2] + nyv[c2] + nyv[d2]) / 4, nl = Math.sqrt(nx * nx + ny * ny + 1);
          var ndl = (nx * L[0] + ny * L[1] + L[2]) / nl, lam = Math.max(0.45, Math.min(1.12, ss.light * 0.95 * (1 + 0.8 * (ndl - L[2])))), hm = (hs[a2] + hs[b2] + hs[c2] + hs[d2]) / 4;
          var cx = gr.ox + (i2 + 0.5) * cs, cyy = gr.oy + (j2 + 0.5) * cs, m = valleyMask(cx, cyy), col;
          if (isWater(seed, cx, cyy)) {
            col = mix(waterCol, [255, 255, 255], 0.05 * Math.sin(cx * 0.05 + cyy * 0.04) + 0.05);
          } else {
            col = mix(th.grass, th.hill, Math.min(1, m * 1.3));
            col = mix(col, th.grassHi, Math.max(0, 0.5 - Math.abs(fbm(cx / 90, cyy / 90, seed + 3) - 0.5) * 3) * (1 - m) * 0.45);
            var tp = teaPatch(seed, cx, cyy, m); // 茶園梯田
            if (tp > 0.02) {
              var slope = Math.sqrt(nx * nx + ny * ny), band = slope > 0.03 ? terraceBand(hm) : 1;
              col = mix(col, mix(soilCol, teaCol, 0.35 + 0.65 * band), tp * 0.6);
            }
            if (hm > 150) col = mix(col, th.rock, Math.min(1, (hm - 150) / 120));
            col = mix(col, [col[0] + 6 * (hash2(i2, j2, seed) - 0.5) * 2, col[1] + 6 * (hash2(i2, j2, seed + 1) - 0.5) * 2, col[2]], 0.6); // 一點點手繪色塊个變化
          }
          col = [col[0] * lam * lightTint[0], col[1] * lam * lightTint[1], col[2] * lam * lightTint[2]];
          var fg = Math.max(0, Math.min(1, (dr.z - fogS) / (fogE - fogS)));
          if (fg > 0) col = mix(col, fogC, fg);
          var s2 = rgb(col);
          ctx.fillStyle = s2; ctx.strokeStyle = s2; ctx.lineWidth = 0.9;
          ctx.beginPath(); ctx.moveTo(vx[a2], vy[a2]); ctx.lineTo(vx[b2], vy[b2]); ctx.lineTo(vx[d2], vy[d2]); ctx.lineTo(vx[c2], vy[c2]); ctx.closePath(); ctx.fill(); ctx.stroke();
          if (!coarse && isWater(seed, cx, cyy) && hash2(i2, j2, seed + 9) < 0.22) { // 水面波光
            var mxp = (vx[a2] + vx[d2]) / 2, myp = (vy[a2] + vy[d2]) / 2, wl = Math.abs(vx[b2] - vx[a2]) * 0.4;
            ctx.strokeStyle = 'rgba(255,255,255,' + (0.5 * (1 - fg)) + ')'; ctx.lineWidth = 1.2;
            ctx.beginPath(); ctx.moveTo(mxp - wl, myp); ctx.lineTo(mxp + wl, myp - 0.6); ctx.stroke();
          }
        } else if (dr.t === 2) {
          drawDecor(dr, th, fogS, fogE, lightTint, ss.light);
        } else {
          var key = dr.q.stage + (lod ? 'l' : 'f'), img = sprites[key] || (sprites[key] = opts.sprite(dr.q.stage, lod));
          if (!img) { pending = true; return; }
          var sc = TREE_H * dr.p.k / 207, fgt = Math.max(0, Math.min(1, (dr.p.zc - fogS) / (fogE - fogS)));
          ctx.globalAlpha = 1 - fgt * 0.8;
          ctx.drawImage(img, dr.p.x - 100 * sc, dr.p.y - 207 * sc, 200 * sc, 240 * sc);
          ctx.globalAlpha = 1;
        }
      });
      var gp = grainPattern();
      if (gp) { ctx.fillStyle = gp; ctx.fillRect(0, 0, W, H); } // 紙紋
      lastCam = cam;
      overlay();
      return pending;
    }
    // 疊層：選著个樹个底環、種植預覽。毋使重畫整個地形
    var ghost = null;
    function ring(cam, wx, wy, r, color, dashed, lw) {
      var seed = opts.seed(), pts = [], i;
      for (i = 0; i < 28; i++) {
        var a = i / 28 * 6.2832, x = wx + Math.cos(a) * r, y = wy + Math.sin(a) * r, p = project(cam, x, y, hf(x, y) + 1.8);
        if (!p) return;
        pts.push(p);
      }
      octx.beginPath(); octx.moveTo(pts[0].x, pts[0].y);
      for (i = 1; i < pts.length; i++) octx.lineTo(pts[i].x, pts[i].y);
      octx.closePath(); octx.lineWidth = lw || 3; octx.strokeStyle = color; octx.setLineDash(dashed ? [7, 5] : []); octx.stroke(); octx.setLineDash([]);
    }
    // ---- 淋水特效：一大滴水從樹冠上方落下，落到樹冠濺開，腳下盪出水波；長大个時節多幾顆星光。淨動 1.1 秒，結束就停 ----
    var fx = null, fxRaf = 0;
    function easeIn(u) { return u * u; }
    function drawDrop(x, y, r, th, squash) { // 水滴形狀（尖頭向上）
      octx.save(); octx.translate(x, y); octx.scale(1 - squash, 1 + squash);
      octx.beginPath(); octx.moveTo(0, -r * 1.9);
      octx.bezierCurveTo(r * 0.2, -r * 1.2, r * 1.0, -r * 0.5, r * 1.0, r * 0.15);
      octx.arc(0, r * 0.15, r * 1.0, 0, Math.PI, false);
      octx.bezierCurveTo(-r * 1.0, -r * 0.5, -r * 0.2, -r * 1.2, 0, -r * 1.9);
      octx.closePath();
      octx.fillStyle = rgb(th.ring); octx.fill();
      octx.lineWidth = Math.max(1.5, r * 0.18); octx.strokeStyle = 'rgba(255,255,255,.9)'; octx.stroke();
      octx.beginPath(); octx.ellipse(-r * 0.38, -r * 0.05, r * 0.2, r * 0.38, 0.3, 0, 7); octx.fillStyle = 'rgba(255,255,255,.75)'; octx.fill();
      octx.restore();
    }
    function drawFx() {
      if (!fx || !lastCam) return;
      var th = opts.theme(), seed = opts.seed(), plot = null;
      opts.plots().forEach(function (q) { if (q.id === fx.id) plot = q; });
      if (!plot) return;
      var w = plotToWorld(plot.x, plot.y), p = project(lastCam, w.x, w.y, hf(w.x, w.y) + 1.2);
      if (!p) return;
      var sc = TREE_H * p.k / 207, u = (performance.now() - fx.t0) / 1000, cxp = p.x, cyp = p.y - 100 * sc, topY = p.y - 215 * sc;
      var R = Math.max(17, 36 * sc); // 一大滴：隨遠近縮放，最小也有 17px（毋會遠遠看無）
      if (fx.still) { // 「減少動態」：不動，淨閃一圈水波
        ring(lastCam, w.x, w.y, 46, rgb(th.ring), false, 5); drawDrop(cxp, cyp - R * 2, R, th, 0); return;
      }
      if (u < 0.55) { // 落下
        var k = easeIn(u / 0.55), y = topY + (cyp - topY) * k;
        drawDrop(cxp, y, R * (0.9 + 0.2 * k), th, 0.1 * Math.sin(u * 30));
      } else if (u < 1.1) { // 濺開
        var s = (u - 0.55) / 0.55;
        octx.globalAlpha = Math.max(0, 0.45 * (1 - s)); // 樹冠被淋著，閃一下水光
        var gl = octx.createRadialGradient(cxp, cyp, 0, cxp, cyp, R * 5);
        gl.addColorStop(0, rgb(th.ring)); gl.addColorStop(1, 'rgba(255,255,255,0)');
        octx.fillStyle = gl; octx.beginPath(); octx.arc(cxp, cyp, R * 5, 0, 7); octx.fill();
        octx.globalAlpha = Math.max(0, 1 - s);
        ring(lastCam, w.x, w.y, 20 + 46 * s, rgb(th.ring), false, 4.5 * (1 - s) + 1);
        ring(lastCam, w.x, w.y, 10 + 30 * s, rgb(th.ring), false, 3 * (1 - s) + 1);
        for (var i = 0; i < 9; i++) { // 水珠
          var a = i / 9 * 6.2832, d = R * (0.8 + 2.6 * s), px = cxp + Math.cos(a) * d * 1.3, py = cyp + Math.sin(a) * d * 0.6 - Math.sin(s * 3.14) * R * 1.8 + s * s * R * 2.2;
          octx.beginPath(); octx.arc(px, py, Math.max(1.5, R * 0.22 * (1 - s * 0.5)), 0, 7); octx.fillStyle = rgb(th.ring); octx.fill();
        }
        if (fx.grew) { // 長大：星光往上飄
          for (var j = 0; j < 6; j++) {
            var sa = j / 6 * 6.2832 + 0.4, sd = R * (1.2 + 2.4 * s), sx = cxp + Math.cos(sa) * sd, sy = cyp - 10 * sc - s * R * 3 + Math.sin(sa) * sd * 0.4;
            octx.fillStyle = '#ffd23f'; octx.beginPath();
            octx.moveTo(sx, sy - R * 0.7); octx.lineTo(sx + R * 0.2, sy - R * 0.2); octx.lineTo(sx + R * 0.7, sy); octx.lineTo(sx + R * 0.2, sy + R * 0.2);
            octx.lineTo(sx, sy + R * 0.7); octx.lineTo(sx - R * 0.2, sy + R * 0.2); octx.lineTo(sx - R * 0.7, sy); octx.lineTo(sx - R * 0.2, sy - R * 0.2); octx.closePath(); octx.fill();
          }
        }
        octx.globalAlpha = 1;
      }
    }
    function tickFx() {
      fxRaf = 0;
      if (!fx) return;
      overlay();
      if (fx.still ? performance.now() - fx.t0 < 700 : performance.now() - fx.t0 < 1100) fxRaf = requestAnimationFrame(tickFx);
      else { fx = null; overlay(); }
    }
    function playDrop(id, grew) {
      fx = { id: id, t0: performance.now(), grew: !!grew, still: !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) };
      if (fxRaf) cancelAnimationFrame(fxRaf);
      tickFx();
    }
    function overlay() {
      octx.clearRect(0, 0, W, H);
      if (!lastCam) return;
      var th = opts.theme(), selId = opts.sel(), plots = opts.plots();
      if (plots.length > 1) plots.forEach(function (q) { if (q.id === selId) { var w = plotToWorld(q.x, q.y); ring(lastCam, w.x, w.y, 34, rgb(th.ring), false, 3.5); } });
      if (ghost) {
        var img = opts.sprite(1, true), z = hf(ghost.wx, ghost.wy), p = project(lastCam, ghost.wx, ghost.wy, z);
        if (p) {
          if (img) { var sc = TREE_H * p.k / 207; octx.globalAlpha = ghost.ok ? 0.8 : 0.4; octx.drawImage(img, p.x - 100 * sc, p.y - 207 * sc, 200 * sc, 240 * sc); octx.globalAlpha = 1; }
          ring(lastCam, ghost.wx, ghost.wy, 34, ghost.ok ? rgb(th.ring) : '#c62828', !ghost.ok, 3.5);
        }
      }
      drawFx();
    }
    function schedule(coarse) {
      if (!raf) raf = requestAnimationFrame(function () {
        raf = 0;
        var pend = render(coarse);
        if (pend && opts.onSprite) opts.onSprite(function () { schedule(false); });
      });
      clearTimeout(idle);
      if (coarse) idle = setTimeout(function () { schedule(false); }, 140); // 停手後補畫細緻版
    }

    // 世界 → 地塊座標，及可種性判斷
    function groundAt(clientX, clientY) {
      var r = opts.base.getBoundingClientRect(), cam = lastCam || curCam();
      var hit = groundHit(cam, hf, clientX - r.left, clientY - r.top, Math.max(2500, cam3.dist * 5));
      if (!hit) return null;
      var pp = worldToPlot(hit.x, hit.y);
      return { wx: hit.x, wy: hit.y, px: Math.round(pp.x), py: Math.round(pp.y), water: isWater(opts.seed(), hit.x, hit.y) || streamD(opts.seed(), hit.x, hit.y) < 24 };
    }
    // 點選：挑「樹冠中心離點擊最近」个樹（疊著个會全部回傳，由近到遠排）
    function pick(clientX, clientY) {
      var r = opts.base.getBoundingClientRect(), x = clientX - r.left, y = clientY - r.top, cam = lastCam || curCam(), seed = opts.seed(), out = [];
      opts.plots().forEach(function (q, i) {
        var w = plotToWorld(q.x, q.y), p = project(cam, w.x, w.y, hf(w.x, w.y) + 1.2);
        if (!p) return;
        var sc = TREE_H * p.k / 207, cx = p.x, cy = p.y - 95 * sc, rx = 62 * sc, ry = 100 * sc;
        var d = Math.pow((x - cx) / rx, 2) + Math.pow((y - cy) / ry, 2);
        if (d <= 1) out.push({ id: q.id, index: i, d: d, zc: p.zc });
      });
      out.sort(function (a, b) { return a.d - b.d || a.zc - b.zc; });
      return out;
    }

    return {
      cam: cam3, HOME: HOME,
      resize: function () { resize(); schedule(false); },
      render: function (coarse) { schedule(!!coarse); },
      rotate: function (dyaw, dpitch) { cam3.yaw += dyaw; cam3.pitch = Math.max(0.22, Math.min(1.38, cam3.pitch + dpitch)); schedule(true); },
      zoom: function (f) { cam3.dist = Math.max(220, Math.min(1700, cam3.dist * f)); schedule(true); },
      reset: function () { cam3.yaw = HOME.yaw; cam3.pitch = HOME.pitch; cam3.dist = HOME.dist; cam3.tx = 0; cam3.ty = 0; schedule(false); },
      focus: function (wx, wy) { cam3.tx = wx; cam3.ty = wy; schedule(false); },
      setGhost: function (gh) { ghost = gh; overlay(); },
      playDrop: playDrop,
      overlay: overlay, groundAt: groundAt, pick: pick,
      // 測試用：某塊地樹冠中心个螢幕座標（clientX/Y），看無（鏡頭後背）回 null
      screenOf: function (plot) {
        var r = opts.base.getBoundingClientRect(), cam = lastCam || curCam(), w = plotToWorld(plot.x, plot.y), p = project(cam, w.x, w.y, hf(w.x, w.y) + 1.2);
        if (!p) return null;
        var sc = TREE_H * p.k / 207;
        return { x: r.left + p.x, y: r.top + p.y - 95 * sc, zc: p.zc };
      },
      renderSync: function (coarse) { return render(!!coarse); }, // 測試用：同步重畫、回傳是否還有貼圖未好
      now: function () { resize(); var pend = render(false); if (pend && opts.onSprite) opts.onSprite(function () { schedule(false); }); },
      alive: function () { return !!opts.base.isConnected; },
      isVisible: function () { return !!lastCam; }
    };
  }

  return {
    VALLEY: VALLEY, TREE_H: TREE_H, FOV: FOV,
    heightAt: heightAt, heightWithPads: heightWithPads, isWater: isWater, sunState: sunState, teaPatch: teaPatch, terraceBand: terraceBand, decorAt: decorAt, streamD: streamD, valleyMask: valleyMask,
    plotToWorld: plotToWorld, worldToPlot: worldToPlot,
    camera: camera, project: project, groundHit: groundHit, create: create
  };
});
