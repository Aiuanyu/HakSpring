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

    function render(coarse) {
      if (!W) resize();
      var th = opts.theme(), seed = opts.seed(), cam = curCam();
      // 天空
      var g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, rgb(th.skyTop)); g.addColorStop(1, rgb(th.skyBot));
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      if (th.dark) { ctx.fillStyle = 'rgba(255,244,214,.85)'; stars.forEach(function (s) { ctx.fillRect(s[0] * W, s[1] * H, s[2], s[2]); }); }
      var hy = H / 2 - Math.tan(cam3.pitch) * cam.fpx * 0; // 地平線大約位置（僅供日月放置）
      var sunX = W * 0.8 - ((cam3.yaw % 6.283) / 6.283) * W * 0.6, sunY = H * 0.16;
      ctx.fillStyle = rgb(th.sun); ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.arc(sunX, sunY, 34, 0, 7); ctx.fill();
      ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(sunX, sunY, 15, 0, 7); ctx.fill();

      var N = coarse ? 36 : 76, E = Math.max(480, Math.min(2200, cam3.dist * 1.55));
      var gr = grid(N, E, seed), cs = gr.cs, N1 = N + 1;
      // 頂點投影
      var vx = new Float32Array(N1 * N1), vy = new Float32Array(N1 * N1), vz = new Float32Array(N1 * N1);
      for (var j = 0; j < N1; j++) for (var i = 0; i < N1; i++) {
        var p = project(cam, gr.ox + i * cs, gr.oy + j * cs, gr.hs[j * N1 + i]), id = j * N1 + i;
        if (p) { vx[id] = p.x; vy[id] = p.y; vz[id] = p.zc; } else vz[id] = -1;
      }
      var fogS = E * 0.5, fogE = E * 1.2, drawables = [];
      var lx = -0.45, ly = -0.35, lz = 0.82; // 光從西南偏上來
      for (j = 0; j < N; j++) for (i = 0; i < N; i++) {
        var a = j * N1 + i, b = a + 1, c = a + N1, d = c + 1;
        if (vz[a] < 0 || vz[b] < 0 || vz[c] < 0 || vz[d] < 0) continue;
        var minX = Math.min(vx[a], vx[b], vx[c], vx[d]), maxX = Math.max(vx[a], vx[b], vx[c], vx[d]);
        var minY = Math.min(vy[a], vy[b], vy[c], vy[d]), maxY = Math.max(vy[a], vy[b], vy[c], vy[d]);
        if (maxX < -4 || minX > W + 4 || maxY < -4 || minY > H + 4) continue;
        drawables.push({ z: (vz[a] + vz[b] + vz[c] + vz[d]) / 4, t: 0, i: i, j: j });
      }
      // 樹
      var plots = opts.plots(), lod = plots.length >= 8, selId = opts.sel();
      plots.forEach(function (q) {
        var w = plotToWorld(q.x, q.y), z = hf(w.x, w.y) + 1.2, p = project(cam, w.x, w.y, z);
        if (p) drawables.push({ z: p.zc - cs * 1.6, t: 1, q: q, w: w, gz: z, p: p }); // 往鏡頭偏一點：正前方个格子毋會蓋著腳下个土堆
      });
      drawables.sort(function (u, v) { return v.z - u.z; });
      var sprites = {}, pending = false;
      drawables.forEach(function (dr) {
        if (dr.t === 0) {
          var i2 = dr.i, j2 = dr.j, a2 = j2 * N1 + i2, b2 = a2 + 1, c2 = a2 + N1, d2 = c2 + 1;
          var h00 = gr.hs[a2], h10 = gr.hs[b2], h01 = gr.hs[c2], h11 = gr.hs[d2];
          var nx = -((h10 + h11) - (h00 + h01)) / (2 * cs), ny = -((h01 + h11) - (h00 + h10)) / (2 * cs), nl = Math.sqrt(nx * nx + ny * ny + 1);
          var lam = Math.max(0.5, Math.min(1.1, 0.42 + 0.7 * (nx * lx + ny * ly + lz) / nl)), hm = (h00 + h10 + h01 + h11) / 4;
          var cx = gr.ox + (i2 + 0.5) * cs, cyy = gr.oy + (j2 + 0.5) * cs, m = valleyMask(cx, cyy), col;
          if (isWater(seed, cx, cyy)) col = mix(th.water, [255, 255, 255], 0.06 * Math.sin(cx * 0.05 + cyy * 0.04) + 0.04);
          else {
            col = mix(th.grass, th.hill, Math.min(1, m * 1.3));
            col = mix(col, th.grassHi, Math.max(0, 0.5 - Math.abs(fbm(cx / 90, cyy / 90, seed + 3) - 0.5) * 3) * (1 - m) * 0.45);
            if (hm > 150) col = mix(col, th.rock, Math.min(1, (hm - 150) / 120));
          }
          col = [col[0] * lam, col[1] * lam, col[2] * lam];
          var fg = Math.max(0, Math.min(1, (dr.z - fogS) / (fogE - fogS)));
          if (fg > 0) col = mix(col, th.fog, fg);
          var s2 = rgb(col);
          ctx.fillStyle = s2; ctx.strokeStyle = s2; ctx.lineWidth = 0.8;
          ctx.beginPath(); ctx.moveTo(vx[a2], vy[a2]); ctx.lineTo(vx[b2], vy[b2]); ctx.lineTo(vx[d2], vy[d2]); ctx.lineTo(vx[c2], vy[c2]); ctx.closePath(); ctx.fill(); ctx.stroke();
        } else {
          var key = dr.q.stage + (lod ? 'l' : 'f'), img = sprites[key] || (sprites[key] = opts.sprite(dr.q.stage, lod));
          if (!img) { pending = true; return; }
          var sc = TREE_H * dr.p.k / 207, fgt = Math.max(0, Math.min(1, (dr.p.zc - fogS) / (fogE - fogS)));
          ctx.globalAlpha = 1 - fgt * 0.8;
          ctx.drawImage(img, dr.p.x - 100 * sc, dr.p.y - 207 * sc, 200 * sc, 240 * sc);
          ctx.globalAlpha = 1;
        }
      });
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
    heightAt: heightAt, heightWithPads: heightWithPads, isWater: isWater, streamD: streamD, valleyMask: valleyMask,
    plotToWorld: plotToWorld, worldToPlot: worldToPlot,
    camera: camera, project: project, groundHit: groundHit, create: create
  };
});
