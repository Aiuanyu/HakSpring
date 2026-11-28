// tests/garden_data_test.js
// 庭院資料結構：升級、推算、合併（交換／結合／冪等）、兩台裝置並行、紀元、新版本保護
const assert = require('assert');
const G = require('../js/garden/garden-data.js');

const clone = (x) => JSON.parse(JSON.stringify(x));
const D = (s) => G.derive(s);

// 1. 空狀態：起始地一塊、水缸 0
let s = G.emptyState('2026-11-28');
assert.strictEqual(D(s).bank, 0);
assert.deepStrictEqual(D(s).plots.map((p) => p.id), ['p0']);
console.log('  ✅ 空狀態 PASS');

// 2. v1 舊存檔升級：水缸、各地塊滴數、種子數量完全等值
const v1 = { bank: 17, plots: [{ k: 'common', n: 5 }, { k: 'common', n: 2 }], sel: 1, seeds: { common: 3 }, day: '2026-11-28' };
let r = G.normalize(v1, { dev: 'dev1', day: '2026-11-28' });
assert.strictEqual(r.from, 1);
assert.strictEqual(r.to, G.SCHEMA);
assert.strictEqual(r.pendingConsent, null);
let d = D(r.state);
assert.strictEqual(d.bank, 17);
assert.deepStrictEqual(d.plots.map((p) => p.n), [5, 2]);
assert.strictEqual(d.seeds.common, 3);
// 舊版淨有 poured 个更舊格式
r = G.normalize({ bank: 4, poured: 9 }, { dev: 'dev1', day: '2026-11-28' });
assert.strictEqual(D(r.state).bank, 4);
assert.strictEqual(D(r.state).plots[0].n, 9);
console.log('  ✅ v1→v2 升級等值 PASS');

// 3. 新版本（v 較大）：毋碰
r = G.normalize({ v: 99, whatever: 1 }, { dev: 'dev1', day: '2026-11-28' });
assert.strictEqual(r.newer, true);
assert.strictEqual(r.state, null);
console.log('  ✅ 新版本保護 PASS');

// 4. 壞資料清洗
r = G.normalize({ v: 2, ep: -5, earned: { '2026-11-28': 'abc', 'bad key': 3, '2026-11-27': 4 }, spent: { 'p0': { dev1: -2, 'x y': 1 } }, plots: { '../evil': { k: 'common' } }, buys: { common: { dev1: 'no' } } }, { dev: 'dev1', day: '2026-11-28' });
assert.strictEqual(r.state.ep, 0);
assert.deepStrictEqual(r.state.earned, { '2026-11-28': 0, '2026-11-27': 4 });
assert.deepStrictEqual(r.state.spent, { p0: { dev1: 0 } });
assert.ok(r.state.plots.p0 && !r.state.plots['../evil']);
assert.deepStrictEqual(r.state.buys, { common: {} });
console.log('  ✅ 壞資料清洗 PASS');

// 5. 操作：入帳、澆水、買種子、種下
s = G.emptyState('2026-11-28');
G.setEarned(s, '2026-11-28', 25);
assert.strictEqual(D(s).bank, 25);
assert.strictEqual(G.setEarned(s, '2026-11-28', 10), false, '入帳只增');
assert.ok(G.pour(s, 'p0', 'A'));
assert.ok(G.buy(s, 'common', 10, 'A'));
assert.ok(G.buy(s, 'common', 10, 'A'));
assert.strictEqual(G.buy(s, 'common', 10, 'A'), false, '水毋夠');
assert.strictEqual(D(s).bank, 25 - 1 - 20);
assert.strictEqual(D(s).seeds.common, 2);
assert.ok(G.plant(s, 'common', 'A1', 1));
assert.strictEqual(D(s).seeds.common, 1);
assert.strictEqual(G.plant(s, 'common', 'A1', 2), false, '同 id 毋准重複');
assert.strictEqual(G.pour(s, 'nope', 'A'), false, '無這塊地');
console.log('  ✅ 操作 PASS');

// 6. 兩台裝置離線各自做事，合併後兩邊都留等；合併交換律、冪等
const base = G.emptyState('2026-11-28');
G.setEarned(base, '2026-11-28', 30);
const A = clone(base), B = clone(base);
G.pour(A, 'p0', 'A'); G.pour(A, 'p0', 'A'); G.buy(A, 'common', 10, 'A'); G.plant(A, 'common', 'A1', 1);
G.pour(B, 'p0', 'B'); G.buy(B, 'common', 10, 'B'); G.plant(B, 'common', 'B1', 2);
G.addAudio(A, '2026-11-28', 'A'); G.addAudio(B, '2026-11-28', 'B');
const AB = G.merge(A, B), BA = G.merge(B, A);
assert.ok(G.equal(AB, BA), '交換律');
assert.ok(G.equal(G.merge(AB, AB), AB), '冪等');
assert.ok(G.equal(G.merge(G.merge(A, B), A), AB), '重複合併毋會變');
d = D(AB);
assert.strictEqual(d.plots.find((p) => p.id === 'p0').n, 3, '兩邊澆水加起來');
assert.deepStrictEqual(d.plots.map((p) => p.id).sort(), ['A1', 'B1', 'p0']);
assert.strictEqual(d.bank, 30 - 3 - 20);
assert.strictEqual(G.audioTotal(AB, '2026-11-28'), 2);
// 結合律
const C = clone(base); G.pour(C, 'p0', 'C');
assert.ok(G.equal(G.merge(G.merge(A, B), C), G.merge(A, G.merge(B, C))), '結合律');
console.log('  ✅ 兩台並行合併 PASS');

// 7. 兩台同時花水花超過：內部可為負、對外毋低過 0、之後入帳補回，毋會丟東西
const X = G.emptyState('2026-11-28'); G.setEarned(X, '2026-11-28', 10);
const Y = clone(X);
G.buy(X, 'common', 10, 'X'); G.buy(Y, 'common', 10, 'Y');
const XY = G.merge(X, Y);
assert.strictEqual(D(XY).rawBank, -10);
assert.strictEqual(D(XY).bank, 0);
assert.strictEqual(D(XY).seeds.common, 2, '兩粒種子都留等');
G.setEarned(XY, '2026-11-29', 15);
assert.strictEqual(D(XY).bank, 5);
console.log('  ✅ 同時超支 PASS');

// 8. 紀元：高紀元整包取代低紀元；舊裝置合併進來會跟著新紀元
const old = clone(AB);
const reset = G.newEpoch(AB, 1000, (c) => { c.spent = {}; c.buys = {}; c.earned = {}; });
assert.ok(reset.ep >= 1000);
const m1 = G.merge(old, reset), m2 = G.merge(reset, old);
assert.ok(G.equal(m1, m2));
assert.strictEqual(m1.ep, reset.ep);
assert.strictEqual(D(m1).bank, 0);
// 紀元遞增至少加一
assert.strictEqual(G.newEpoch(reset, 0).ep, reset.ep + 1);
console.log('  ✅ 紀元 PASS');

// 9. since 合併取較晚者；earned 同日取大
const E1 = G.emptyState('2026-11-20'), E2 = G.emptyState('2026-11-28');
assert.strictEqual(G.merge(E1, E2).since, '2026-11-28');
G.setEarned(E1, '2026-11-28', 3); G.setEarned(E2, '2026-11-28', 7);
assert.strictEqual(G.merge(E1, E2).earned['2026-11-28'], 7);
console.log('  ✅ since／earned PASS');

// 10. 往後大改版：有 consent 个升級步驟，沒同意就毋執行、原資料毋動；同意後正執行（假設往後有 v3→v4）
let ran = 0;
G.MIGRATIONS.push({ from: 3, to: 4, consent: true, describe: '測試用大轉換', run: (raw) => { ran++; return Object.assign(clone(raw), { v: 4 }); } });
const v3data = clone(AB);
const before = JSON.stringify(v3data);
r = G.normalize(v3data, { dev: 'A', day: '2026-11-28' }, { target: 4 });
assert.ok(r.pendingConsent && r.pendingConsent.describe === '測試用大轉換', '要先問使用者');
assert.strictEqual(r.state, null);
assert.strictEqual(ran, 0, '沒同意毋執行');
assert.strictEqual(JSON.stringify(v3data), before, '原資料毋動');
r = G.normalize(v3data, { dev: 'A', day: '2026-11-28' }, { target: 4, consented: true });
assert.strictEqual(ran, 1);
assert.strictEqual(r.to, 4);
assert.strictEqual(JSON.stringify(v3data), before, '升級毋會改到傳入个原物件');
G.MIGRATIONS.pop();
// 舊程式讀著 v4 資料：newer，毋碰
assert.strictEqual(G.normalize({ v: G.SCHEMA + 1 }, {}, {}).newer, true);
console.log('  ✅ 大改版需同意／原資料毋動 PASS');

// 11. v3：地圖種子、每塊地个位置
assert.strictEqual(G.SCHEMA, 3);
s = G.emptyState('2026-11-28', 777);
assert.strictEqual(s.seed, 777);
assert.deepStrictEqual({ x: s.plots.p0.x, y: s.plots.p0.y }, G.START_POS, '起始地位置固定，所有裝置一致');
// 種下去：位置在種下當下決定，之後毋變；同一組輸入結果一樣（確定性）
G.setEarned(s, '2026-11-28', 60);
for (let i = 0; i < 4; i++) { G.buy(s, 'common', 10, 'A'); assert.ok(G.plant(s, 'common', 'A' + i, 100 + i)); }
const pos1 = D(s).plots.map((p) => [p.id, p.x, p.y]);
pos1.forEach(([id, x, y]) => { assert.ok(x >= 600 && x <= 9400 && y >= 600 && y <= 9400, id + ' 位置在範圍內'); });
assert.deepStrictEqual(G.placeAt(3, 'zz'), G.placeAt(3, 'zz'));
// 多塊地兩兩有距離（毋會疊在一起）
const pts = D(s).plots;
for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) assert.ok(Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) > 800, '地塊毋疊');
// 合併：種子取較小者；同塊地位置無共樣取較小者
const S1 = G.emptyState('2026-11-28', 900), S2 = G.emptyState('2026-11-28', 300);
assert.strictEqual(G.merge(S1, S2).seed, 300);
assert.strictEqual(G.merge(S2, S1).seed, 300);
assert.strictEqual(G.merge(G.emptyState('2026-11-28', 0), S1).seed, 900, '一邊無種子就用另一邊个');
const Q1 = clone(S1), Q2 = clone(S1); Q1.plots.n1 = { k: 'common', o: 5, x: 3000, y: 4000 }; Q2.plots.n1 = { k: 'common', o: 5, x: 2000, y: 9000 };
assert.deepStrictEqual([G.merge(Q1, Q2).plots.n1.x, G.merge(Q1, Q2).plots.n1.y], [2000, 9000]);
assert.ok(G.equal(G.merge(Q1, Q2), G.merge(Q2, Q1)));
console.log('  ✅ v3 地圖種子摎地塊位置 PASS');

// 12. v2→v3 升級：樹、水缸、種子、各地塊滴數維持原樣，補上種子摎位置，原物件毋動
const v2 = { v: 2, ep: 0, since: '2026-11-28', earned: { '2026-11-28': 40 }, audio: {}, spent: { p0: { A: 3 }, q1: { A: 2 }, q2: { B: 1 } }, buys: { common: { A: [2, 20] } },
  plots: { p0: { k: 'common', o: 0, s: 1 }, q1: { k: 'common', o: 10 }, q2: { k: 'common', o: 20 } }, adj: {}, base: {} };
const v2before = JSON.stringify(v2);
r = G.normalize(v2, { dev: 'A', day: '2026-11-28', seed: 4242 });
assert.strictEqual(r.from, 2);
assert.strictEqual(r.to, 3);
assert.strictEqual(r.pendingConsent, null);
assert.strictEqual(JSON.stringify(v2), v2before, '原資料毋動');
assert.strictEqual(r.state.seed, 4242);
d = D(r.state);
assert.strictEqual(d.bank, 40 - 6 - 20);
assert.deepStrictEqual(d.plots.map((p) => [p.id, p.n]), [['p0', 3], ['q1', 2], ['q2', 1]]);
d.plots.forEach((p) => assert.ok(p.x !== undefined && p.y !== undefined, p.id + ' 有位置'));
// 兩台各自升級同一份 v2 資料，位置一致（確定性）、合併後毋變
const r2 = G.normalize(v2, { dev: 'B', day: '2026-11-28', seed: 99 });
assert.deepStrictEqual(D(r.state).plots.map((p) => [p.x, p.y]), D(r2.state).plots.map((p) => [p.x, p.y]));
assert.strictEqual(G.merge(r.state, r2.state).seed, 99);
console.log('  ✅ v2→v3 升級（等值、補種子摎位置、確定性）PASS');

// 13. 使用者點選位置種樹：檢查範圍摎距離，毋准疊在一起
{
  const T = G.emptyState('2026-11-28', 5);
  G.setEarned(T, '2026-11-28', 100);
  for (let i = 0; i < 4; i++) G.buy(T, 'common', 10, 'A');
  assert.ok(G.plant(T, 'common', 'U1', 1, 30, { x: 2000, y: 3000 }), '空位做得種');
  assert.deepStrictEqual([T.plots.U1.x, T.plots.U1.y], [2000, 3000], '位置照使用者點个');
  assert.strictEqual(G.plant(T, 'common', 'U2', 2, 30, { x: 2100, y: 3100 }), false, '忒近');
  assert.strictEqual(G.plant(T, 'common', 'U2', 2, 30, { x: 5000, y: 5200 }), false, '離起始地忒近');
  assert.strictEqual(G.plant(T, 'common', 'U2', 2, 30, { x: -1, y: 3000 }), false, '超出範圍');
  assert.strictEqual(G.plant(T, 'common', 'U2', 2, 30, { x: 3000, y: 10001 }), false, '超出範圍');
  assert.strictEqual(G.plant(T, 'common', 'U2', 2, 30, { x: NaN, y: 3000 }), false, '壞資料');
  assert.ok(G.plant(T, 'common', 'U2', 2, 30, { x: 2000, y: 4200 }), 'y 方向夠遠就做得');
  assert.ok(G.plant(T, 'common', 'U3', 3, 30, { x: 2600, y: 3000 }), 'x 方向夠遠就做得');
  assert.strictEqual(D(T).seeds.common, 1, '失敗个毋會扣種子');
  assert.ok(G.canPlaceAt(T, 8000, 8000));
  assert.ok(!G.canPlaceAt(T, 2000, 3000));
  console.log('  ✅ 點選位置種樹（範圍、距離、失敗毋扣種子）PASS');
}

console.log('✅ garden_data_test 全部通過');
