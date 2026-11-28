// tests/garden_3d_test.js
// 庭院類 3D 地形（js/garden/garden-3d.js 个純函式）：高度場確定性、座標轉換、鏡頭投影、射線找地面、深度順序
const assert = require('assert');
const G3 = require('../js/garden/garden-3d.js');

// 1. 高度場：同一個種子同樣个結果；山谷中央和緩、外圍成山；不同種子无共樣
const S = 20261128;
assert.strictEqual(G3.heightAt(S, 123.4, -88.8), G3.heightAt(S, 123.4, -88.8));
assert.notStrictEqual(G3.heightAt(S, 300, 200), G3.heightAt(S + 1, 300, 200));
let maxC = 0; for (let x = -300; x <= 300; x += 30) for (let y = -300; y <= 300; y += 30) maxC = Math.max(maxC, Math.abs(G3.heightAt(S, x, y)));
assert.ok(maxC < 40, '山谷中央和緩（' + maxC.toFixed(1) + '）');
let maxO = 0; for (let a = 0; a < 6.28; a += 0.2) maxO = Math.max(maxO, G3.heightAt(S, Math.cos(a) * 1400, Math.sin(a) * 1400));
assert.ok(maxO > 100, '外圍有山（' + maxO.toFixed(1) + '）');
// 無邊界：遠方也算得出（有限數字）
for (const r of [3000, 20000, 1e6]) assert.ok(Number.isFinite(G3.heightAt(S, r, -r * 0.7)));
console.log('  ✅ 高度場（確定性、山谷、外圍、無邊界）PASS');

// 2. 小溪：山谷內有水、外圍毋會有
let water = 0; for (let y = -450; y <= 450; y += 10) for (let x = -450; x <= 450; x += 10) if (G3.isWater(S, x, y)) water++;
assert.ok(water > 30, '山谷內有小溪（' + water + ' 格）');
assert.ok(!G3.isWater(S, 1500, 1500));
console.log('  ✅ 小溪 PASS');

// 3. 地塊座標 ↔ 世界座標：互為反函數；py 愈大愈靠近鏡頭（世界 y 愈小）
for (const [px, py] of [[5000, 5000], [300, 9700], [9999, 1], [1234, 8765]]) {
  const w = G3.plotToWorld(px, py), b = G3.worldToPlot(w.x, w.y);
  assert.ok(Math.abs(b.x - px) < 1e-6 && Math.abs(b.y - py) < 1e-6);
}
assert.ok(G3.plotToWorld(5000, 9000).y < G3.plotToWorld(5000, 1000).y);
console.log('  ✅ 座標轉換 PASS');

// 4. 鏡頭投影：目標點在畫面中央；後背个點毋投影；愈遠景深愈大
const base = { yaw: 0.35, pitch: 0.62, dist: 620, tx: 0, ty: 0, w: 640, h: 400, seed: S };
const cam = G3.camera(base);
const pc = G3.project(cam, 0, 0, G3.heightAt(S, 0, 0));
assert.ok(Math.abs(pc.x - 320) < 0.5 && Math.abs(pc.y - 200) < 0.5, '目標在畫面中央');
assert.strictEqual(G3.project(cam, cam.pos.x - cam.f.x * 50, cam.pos.y - cam.f.y * 50, cam.pos.z - cam.f.z * 50), null, '鏡頭後背');
const near = G3.project(G3.camera(Object.assign({}, base, { yaw: 0 })), 0, -300, 0), far = G3.project(G3.camera(Object.assign({}, base, { yaw: 0 })), 0, 300, 0);
assert.ok(near.zc < far.zc && near.k > far.k, 'yaw=0：世界 y 愈小愈近、愈大');
assert.ok(near.y > far.y, '近个在畫面下背');
console.log('  ✅ 鏡頭投影 PASS');

// 5. 射線找地面：投影出來个點，用該螢幕座標往回找，會回到原本个位置
for (const yaw of [0, 0.9, 2.2, -1.4, 3.5]) for (const pitch of [0.35, 0.62, 1.0, 1.3]) {
  const c = G3.camera(Object.assign({}, base, { yaw, pitch }));
  for (const [wx, wy] of [[0, 0], [150, -90], [-220, 130], [90, 260]]) {
    const z = G3.heightAt(S, wx, wy), p = G3.project(c, wx, wy, z);
    if (!p || p.x < 0 || p.x > 640 || p.y < 0 || p.y > 400) continue;
    const hit = G3.groundHit(c, S, p.x, p.y, 4000);
    assert.ok(hit, '找得著地面');
    assert.ok(Math.hypot(hit.x - wx, hit.y - wy) < 6, `yaw=${yaw} pitch=${pitch} (${wx},${wy}) → (${hit.x.toFixed(1)},${hit.y.toFixed(1)})`);
  }
}
// 往天空看：找無地面
assert.strictEqual(G3.groundHit(G3.camera(Object.assign({}, base, { pitch: 0.25 })), S, 320, 2, 4000), null);
console.log('  ✅ 射線找地面（各角度來回一致、天空回 null）PASS');

// 6. 旋轉：轉半圈（yaw+π）原本在後面个樹變前面，景深順序顛倒
const front = G3.plotToWorld(5000, 8500), back = G3.plotToWorld(5000, 1500); // py 大＝近
const zOf = (yaw, w) => G3.project(G3.camera(Object.assign({}, base, { yaw })), w.x, w.y, G3.heightAt(S, w.x, w.y)).zc;
assert.ok(zOf(0, front) < zOf(0, back), 'yaw=0：front 較近');
assert.ok(zOf(Math.PI, front) > zOf(Math.PI, back), 'yaw=π：front 變較遠，後面个樹轉出來');
console.log('  ✅ 旋轉換邊（被擋著个樹轉得出來）PASS');

// 7. 地塊平台：樹腳下攤平，毋會被起伏埋著；平台外毋受影響；過渡連續
{
  const R = 46, c = { x: 380, y: 250 }; // 山谷外緣、起伏較大
  const pad = { x: c.x, y: c.y, z: G3.heightAt(S, c.x, c.y) };
  assert.strictEqual(G3.heightWithPads(S, [pad], c.x, c.y, R), pad.z, '中心不變');
  assert.strictEqual(G3.heightWithPads(S, [pad], c.x + R + 1, c.y, R), G3.heightAt(S, c.x + R + 1, c.y), '平台外不變');
  // 平台內最大高低差 ≤ 原地形
  let rawSpan = 0, padSpan = 0, rawMin = 1e9, rawMax = -1e9, pMin = 1e9, pMax = -1e9;
  for (let a = 0; a < 6.28; a += 0.2) for (let r = 0; r <= R * 0.7; r += 6) {
    const x = c.x + Math.cos(a) * r, y = c.y + Math.sin(a) * r, h0 = G3.heightAt(S, x, y), h1 = G3.heightWithPads(S, [pad], x, y, R);
    rawMin = Math.min(rawMin, h0); rawMax = Math.max(rawMax, h0); pMin = Math.min(pMin, h1); pMax = Math.max(pMax, h1);
  }
  assert.ok(pMax - pMin <= rawMax - rawMin + 1e-9, '攤平後起伏較小');
  // 連續：相鄰點高度差有限
  let prev = G3.heightWithPads(S, [pad], c.x - R - 10, c.y, R), maxStep = 0;
  for (let x = c.x - R - 10; x <= c.x + R + 10; x += 1) { const h = G3.heightWithPads(S, [pad], x, c.y, R); maxStep = Math.max(maxStep, Math.abs(h - prev)); prev = h; }
  assert.ok(maxStep < 4, '過渡平滑（最大單步 ' + maxStep.toFixed(2) + '）');
  // 射線找地面：用平台高度函式也一致
  const hfn = (x, y) => G3.heightWithPads(S, [pad], x, y, R), cm = G3.camera(Object.assign({}, base, { yaw: 1.1, pitch: 0.4, tx: c.x, ty: c.y }));
  const p = G3.project(cm, c.x + 20, c.y - 15, hfn(c.x + 20, c.y - 15)), hit = G3.groundHit(cm, hfn, p.x, p.y, 4000);
  assert.ok(Math.hypot(hit.x - (c.x + 20), hit.y - (c.y - 15)) < 4);
  console.log('  ✅ 地塊平台（中心不變、平台外不變、攤平、平滑、射線一致）PASS');
}

console.log('✅ garden_3d_test 全部通過');
