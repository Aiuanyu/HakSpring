// tests/feedback_test.js
// 意見回饋个純邏輯：驗證、組資料、限制重複送出。
const assert = require('assert');
const { validate, buildPayload, canSubmitNow, MESSAGE_MAX } = require('../js/feedback.js');

// 驗證：全空愛擋；填一題就過；欄位值亂來愛擋；訊息過長愛擋
assert.deepStrictEqual(validate({}), { ok: false, errors: ['empty'] });
assert.strictEqual(validate({ affected: 'yes' }).ok, true);
assert.strictEqual(validate({ device: 'phone' }).ok, true);
assert.strictEqual(validate({ message: '多謝' }).ok, true);
assert.deepStrictEqual(validate({ affected: 'maybe' }).errors, ['affected']);
assert.deepStrictEqual(validate({ affected: 'yes', device: 'tv' }).errors, ['device']);
assert.deepStrictEqual(validate({ message: 'x'.repeat(MESSAGE_MAX + 1) }).errors, ['message']);
assert.strictEqual(validate({ message: 'x'.repeat(MESSAGE_MAX) }).ok, true);
assert.deepStrictEqual(validate({ message: '   ' }).errors, ['empty'], '淨有空白算空');

// 組資料：空欄位 null、訊息去頭尾空白、版本截 40 字
assert.deepStrictEqual(buildPayload({ affected: 'no', device: '', message: '  好  ' }, '4.5.82'), {
  affected: 'no',
  device: null,
  message: '好',
  app_version: '4.5.82',
});
assert.deepStrictEqual(buildPayload({}, null), { affected: null, device: null, message: null, app_version: null });
assert.strictEqual(buildPayload({}, 'v'.repeat(80)).app_version.length, 40);

// 限制：1 分鐘內毋准再送；一日最多 3 擺；一日後歸零
const now = 1_000_000_000;
const min = 60 * 1000;
const day = 24 * 60 * min;
assert.deepStrictEqual(canSubmitNow([], now), { ok: true });
assert.deepStrictEqual(canSubmitNow([now - 30 * 1000], now), { ok: false, reason: 'interval' });
assert.deepStrictEqual(canSubmitNow([now - 2 * min], now), { ok: true });
assert.deepStrictEqual(canSubmitNow([now - 2 * min, now - 3 * min, now - 4 * min], now), { ok: false, reason: 'daily' });
assert.deepStrictEqual(canSubmitNow([now - day - min, now - day - 2 * min, now - day - 3 * min], now), { ok: true });

console.log('feedback_test: all passed');
