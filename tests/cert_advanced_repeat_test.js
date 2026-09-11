const assert = require('assert');

// Minimal DOM/localStorage mocks so `require('../main.js')` succeeds in Node.
// (main.js unconditionally touches `window` at module scope, and
// getCertAdvancedRepeatCount() reads localStorage.)
global.window = {};
global.document = {
  createElement: () => ({}),
  createTreeWalker: () => ({ nextNode: () => null }),
};
global.NodeFilter = { SHOW_TEXT: 4 };

const localStorageStore = {};
global.localStorage = {
  getItem: (key) => localStorageStore[key] || null,
  setItem: (key, value) => { localStorageStore[key] = String(value); },
  removeItem: (key) => { delete localStorageStore[key]; },
  clear: () => { Object.keys(localStorageStore).forEach(k => delete localStorageStore[k]); }
};

const { getCertAdvancedRepeatCount } = require('../main.js');

// Test 1: Default value when localStorage is empty
localStorage.clear();
assert.strictEqual(getCertAdvancedRepeatCount(), 2, 'Default repeat count should be 2');

// Test 2: Custom values 1, 2, 3
localStorage.setItem('certAdvancedRepeatCount', '1');
assert.strictEqual(getCertAdvancedRepeatCount(), 1, 'Repeat count should be 1');

localStorage.setItem('certAdvancedRepeatCount', '3');
assert.strictEqual(getCertAdvancedRepeatCount(), 3, 'Repeat count should be 3');

// Test 3: Clamping invalid / out-of-bound values
localStorage.setItem('certAdvancedRepeatCount', '0');
assert.strictEqual(getCertAdvancedRepeatCount(), 1, 'Repeat count < 1 should clamp to 1');

localStorage.setItem('certAdvancedRepeatCount', '5');
assert.strictEqual(getCertAdvancedRepeatCount(), 3, 'Repeat count > 3 should clamp to 3');

localStorage.setItem('certAdvancedRepeatCount', 'invalid');
assert.strictEqual(getCertAdvancedRepeatCount(), 1, 'NaN repeat count should fallback to 1');

console.log('🎉 All CERT Advanced repeat tests passed successfully!');

// `require('../main.js')` fires off the app's async initializeApp() bootstrap
// (guarded only by `typeof window !== 'undefined'`), which is expected to
// reject in this bare Node environment (no `history`, no real DOM). Exit
// explicitly, as tests/sandhi_fixture_test.js does, so that unrelated
// rejection is never surfaced as a test failure.
process.exit(0);
