const assert = require('assert');

// Mock localStorage
const localStorageStore = {};
global.localStorage = {
  getItem: (key) => localStorageStore[key] || null,
  setItem: (key, value) => { localStorageStore[key] = String(value); },
  removeItem: (key) => { delete localStorageStore[key]; },
  clear: () => { Object.keys(localStorageStore).forEach(k => delete localStorageStore[k]); }
};

function getCertAdvancedRepeatCount() {
  const val = parseInt(localStorage.getItem('certAdvancedRepeatCount') || '2', 10);
  if (isNaN(val) || val < 1) return 1;
  if (val > 3) return 3;
  return val;
}

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

// Test 4: Simulate playAudio repeat logic
function simulateWordPlayback(dialectInfoLevel, configuredRepeatCount) {
  localStorage.setItem('certAdvancedRepeatCount', configuredRepeatCount);
  const targetRepeats = (dialectInfoLevel === '高') ? getCertAdvancedRepeatCount() : 1;

  let playCount = 0;
  let wordPlayCount = 0;

  // Initial play
  playCount++;

  // End event listener loop
  const onWordEnded = () => {
    wordPlayCount++;
    if (wordPlayCount < targetRepeats) {
      playCount++;
      onWordEnded(); // recursive simulation of ended event
    }
  };

  onWordEnded();

  return playCount;
}

// Verify CERT 高級 repeats according to config
assert.strictEqual(simulateWordPlayback('高', 2), 2, 'CERT 高級 with setting 2 should play 2 times');
assert.strictEqual(simulateWordPlayback('高', 3), 3, 'CERT 高級 with setting 3 should play 3 times');
assert.strictEqual(simulateWordPlayback('高', 1), 1, 'CERT 高級 with setting 1 should play 1 time');

// Verify other levels (e.g. 基, 初, 中, 中高) only play 1 time regardless of setting
assert.strictEqual(simulateWordPlayback('基', 3), 1, 'CERT 基礎級 should play 1 time even if setting is 3');
assert.strictEqual(simulateWordPlayback('中', 2), 1, 'CERT 中級 should play 1 time even if setting is 2');

console.log('🎉 All CERT Advanced repeat tests passed successfully!');
