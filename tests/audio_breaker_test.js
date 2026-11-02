// tests/audio_breaker_test.js
// 音檔失敗斷路器：連續失敗達上限就停、成功就歸零；冷卻斷路器開路期間擋請求、冷卻後放行。
const assert = require('assert');
const { createFailureBreaker, createCooldownBreaker, isOutageStatus } = require('../js/audio-breaker.js');

// 連續失敗：前兩擺毋停，第三擺停
{
  const b = createFailureBreaker({ limit: 3 });
  assert.strictEqual(b.fail(), false);
  assert.strictEqual(b.fail(), false);
  assert.strictEqual(b.fail(), true, '第 3 擺連續失敗愛停');
}

// 中間有一擺成功就歸零，毋會累計到停
{
  const b = createFailureBreaker({ limit: 3 });
  b.fail();
  b.fail();
  b.succeed();
  assert.strictEqual(b.count, 0);
  assert.strictEqual(b.fail(), false);
  assert.strictEqual(b.fail(), false);
}

// reset（使用者重新按播放）歸零
{
  const b = createFailureBreaker({ limit: 2 });
  b.fail();
  b.reset();
  assert.strictEqual(b.fail(), false);
}

// 預設上限 3
{
  const b = createFailureBreaker();
  b.fail();
  b.fail();
  assert.strictEqual(b.fail(), true);
}

// 冷卻斷路器：達上限開路，冷卻期間 isOpen，冷卻過了放行，成功關路
{
  let t = 1000;
  const b = createCooldownBreaker({ limit: 2, cooldownMs: 500, now: () => t });
  assert.strictEqual(b.isOpen(), false);
  b.fail();
  assert.strictEqual(b.isOpen(), false, '未達上限毋開路');
  b.fail();
  assert.strictEqual(b.isOpen(), true, '達上限就開路');
  t += 499;
  assert.strictEqual(b.isOpen(), true, '冷卻中');
  t += 2;
  assert.strictEqual(b.isOpen(), false, '冷卻過了放一擺試探');
  b.fail();
  assert.strictEqual(b.isOpen(), true, '試探再失敗，馬上再開路（計數猶在）');
  t += 600;
  b.succeed();
  assert.strictEqual(b.isOpen(), false, '成功就關路');
  b.fail();
  assert.strictEqual(b.isOpen(), false, '成功後計數歸零');
}

// 狀態判斷：5xx 算上游出問題；404／200／206 毋算
assert.strictEqual(isOutageStatus(530), true);
assert.strictEqual(isOutageStatus(503), true);
assert.strictEqual(isOutageStatus(404), false);
assert.strictEqual(isOutageStatus(200), false);
assert.strictEqual(isOutageStatus(206), false);

console.log('audio_breaker_test: all passed');
