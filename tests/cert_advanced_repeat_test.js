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

const { getCertAdvancedRepeatCount, shouldRepeatWord } = require('../main.js');

// Test 1: Default value when localStorage is empty
localStorage.clear();
assert.strictEqual(getCertAdvancedRepeatCount(), 2, 'Default repeat count should be 2');

// Test 2: Custom values 1, 2, 3
localStorage.setItem('certAdvancedRepeatCount', '1');
assert.strictEqual(getCertAdvancedRepeatCount(), 1, 'Repeat count should be 1');

localStorage.setItem('certAdvancedRepeatCount', '3');
assert.strictEqual(getCertAdvancedRepeatCount(), 3, 'Repeat count should be 3');

// Test 3: Clamping invalid / out-of-bound values.
// Corrupted/invalid values fall back to the same documented default (2) as
// an unset key, rather than a separate "1" fallback.
localStorage.setItem('certAdvancedRepeatCount', '0');
assert.strictEqual(getCertAdvancedRepeatCount(), 2, 'Repeat count < 1 should fall back to default (2)');

localStorage.setItem('certAdvancedRepeatCount', '5');
assert.strictEqual(getCertAdvancedRepeatCount(), 3, 'Repeat count > 3 should clamp to 3');

localStorage.setItem('certAdvancedRepeatCount', 'invalid');
assert.strictEqual(getCertAdvancedRepeatCount(), 2, 'NaN repeat count should fall back to default (2)');

console.log('🎉 All CERT Advanced repeat count tests passed successfully!');

// Test 4: shouldRepeatWord() — the decision logic behind onWordEnded in playAudio.
// Last two args are (itemIndex, currentAudioIndex): they must match, or the
// `ended` event is stale (e.g. a hardware/media-key skip moved on to a
// different item without aborting the outgoing word audio).
assert.strictEqual(
  shouldRepeatWord(1, 3, true, false, 's1', 's1', 0, 0),
  true,
  'Should repeat while under target count and session/item are still current',
);
assert.strictEqual(
  shouldRepeatWord(3, 3, true, false, 's1', 's1', 0, 0),
  false,
  'Should stop once target repeat count is reached',
);
assert.strictEqual(
  shouldRepeatWord(1, 3, false, false, 's1', 's1', 0, 0),
  false,
  'Should stop when playback is no longer active',
);
assert.strictEqual(
  shouldRepeatWord(1, 3, true, true, 's1', 's1', 0, 0),
  false,
  'Should stop when playback is paused',
);
assert.strictEqual(
  shouldRepeatWord(1, 3, true, false, 's1', 's2', 0, 0),
  false,
  'Should stop when the session has moved on (stale ended event)',
);
assert.strictEqual(
  shouldRepeatWord(1, 3, true, false, 's1', 's1', 0, 1),
  false,
  'Should stop when a media-key skip advanced to a different item without a new session',
);

console.log('🎉 All CERT Advanced repeat-decision tests passed successfully!');

// `require('../main.js')` fires off the app's async initializeApp() bootstrap
// (guarded only by `typeof window !== 'undefined'`), which is expected to
// reject in this bare Node environment (no `history`, no real DOM). Exit
// explicitly, as tests/sandhi_fixture_test.js does, so that unrelated
// rejection is never surfaced as a test failure.
process.exit(0);
