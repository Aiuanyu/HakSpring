const assert = require('assert');

// Mock window/document if needed
global.window = global;
global.document = {
  createElement: () => ({ setAttribute: () => {}, appendChild: () => {} }),
};
global.navigator = { userAgent: 'firefox' };

// Load main.js exports
const { splitRubyByBaseBreakpoints } = require('../main.js');

console.log('🧪 Starting Firefox ruby breakpoint unit tests...\n');

let passedTests = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(err);
    process.exit(1);
  }
}

// 1. Synonym parentheses （）
runTest('Word with （） synonym items splits correctly', () => {
  const base = '發子（病子）';
  const rt = 'bòd zìi (piang zìi)';
  const res = splitRubyByBaseBreakpoints(base, rt);
  assert.notStrictEqual(res, null);
  assert.strictEqual(res.baseSegs.length, 2);
  assert.strictEqual(res.baseSegs[0], '發子');
  assert.strictEqual(res.baseSegs[1], '（病子）');
  assert.strictEqual(res.rtSegs[0], 'bòd zìi ');
  assert.strictEqual(res.rtSegs[1], '(piang zìi)');
});

// 2. Search highlight <mark> tags
runTest('Word with <mark> search highlight tags preserves tags', () => {
  const base = '<mark>發</mark>子（病子）';
  const rt = 'bòd zìi (piang zìi)';
  const res = splitRubyByBaseBreakpoints(base, rt);
  assert.notStrictEqual(res, null);
  assert.strictEqual(res.baseSegs[0], '<mark>發</mark>子');
  assert.strictEqual(res.baseSegs[1], '（病子）');
});

// 3. Sandhi <ruby> tags & <span class="phonetic-paren"> in RT
runTest('Sandhi <ruby> and <span class="phonetic-paren"> in RT split safely', () => {
  const base = '<mark>發</mark>子（病子）';
  const rt =
    '<ruby class="sandhi-t53">bòd</ruby> <ruby class="sandhi-t11">zìi</ruby> <span class="phonetic-paren">(</span><ruby class="sandhi-t53">piang</ruby> <ruby class="sandhi-t11">zìi</ruby><span class="phonetic-paren">)</span>';
  const res = splitRubyByBaseBreakpoints(base, rt);
  assert.notStrictEqual(res, null);
  assert.strictEqual(res.baseSegs[0], '<mark>發</mark>子');
  assert.strictEqual(res.baseSegs[1], '（病子）');
  assert.strictEqual(
    res.rtSegs[0],
    '<ruby class="sandhi-t53">bòd</ruby> <ruby class="sandhi-t11">zìi</ruby> ',
  );
  assert.strictEqual(
    res.rtSegs[1],
    '<span class="phonetic-paren">(</span><ruby class="sandhi-t53">piang</ruby> <ruby class="sandhi-t11">zìi</ruby><span class="phonetic-paren">)</span>',
  );
});

// 4. Slashes ／ or /
runTest('Word with slashes ／ splits at slash', () => {
  const base = '在／佇';
  const rt = 'cāi / chǔ';
  const res = splitRubyByBaseBreakpoints(base, rt);
  assert.notStrictEqual(res, null);
  assert.strictEqual(res.baseSegs.length, 2);
  assert.strictEqual(res.baseSegs[0], '在／');
  assert.strictEqual(res.baseSegs[1], '佇');
  assert.strictEqual(res.rtSegs[0], 'cāi /');
  assert.strictEqual(res.rtSegs[1], ' chǔ');
});

// 5. No breakpoints
runTest('Word without breakpoints returns null', () => {
  const base = '發燒';
  const rt = 'fàd séu';
  const res = splitRubyByBaseBreakpoints(base, rt);
  assert.strictEqual(res, null);
});

// 6. Multiple parentheses e.g. 沙壩（沙埔、沙灘）
runTest('Word with multiple items in parentheses', () => {
  const base = '沙壩（沙埔、沙灘）';
  const rt = 'sá ba (sá pú、sá tán)';
  const res = splitRubyByBaseBreakpoints(base, rt);
  assert.notStrictEqual(res, null);
  assert.strictEqual(res.baseSegs[0], '沙壩');
  assert.strictEqual(res.baseSegs[1], '（沙埔、沙灘）');
});

console.log(`🎉 All ${passedTests} ruby breakpoint unit tests passed successfully!\n`);
