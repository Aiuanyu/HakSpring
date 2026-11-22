const assert = require('assert');

// Mock window/document if needed
global.window = global;
global.document = {
  createElement: () => ({ setAttribute: () => {}, appendChild: () => {} }),
};
global.navigator = { userAgent: 'firefox' };

// Load main.js exports
const { splitRubyByBaseBreakpoints, expandSlashReadings, expandNoteReadings, sandhiRubyToSup } = require('../main.js');

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
  assert.strictEqual(res.rtSegs[1], 'chǔ');
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
  // 20261120 起：括號裡肚个頓號（異體詞分隔）也斷行，原本係成串 '（沙埔、沙灘）'
  assert.strictEqual(res.baseSegs[1], '（沙埔、');
  assert.strictEqual(res.baseSegs[2], '沙灘）');
});

console.log(`🎉 All ${passedTests} ruby breakpoint unit tests passed successfully!\n`);

// 7. RT mismatch falls back
runTest('Mismatched segments fallback to null', () => {
  const base = '沙壩（沙埔、沙灘）';
  const rt = 'sá ba'; // Missing the second part
  const res = splitRubyByBaseBreakpoints(base, rt);
  assert.strictEqual(res, null);
});

// 8. 整詞並列斜線（音節數與漢字字數相同）→ 斷行，漢字兩行都顯示
runTest('Whole-word slash alternatives (equal syllables) split into lines', () => {
  const res = splitRubyByBaseBreakpoints('溜走', 'tiu zèu/liu zèu');
  assert.notStrictEqual(res, null);
  assert.deepStrictEqual(res.baseSegs, ['溜走', '溜走']);
  assert.deepStrictEqual(res.rtSegs, ['tiu zèu/', 'liu zèu']);
});

runTest('Whole-word slash with 4 syllables and sandhi ruby tags', () => {
  const res = splitRubyByBaseBreakpoints('咚咚咚咚', 'dǔng dǔng <ruby class="x">dung<rt>33</rt></ruby> dung/dǔng dúng dùng dùng');
  assert.notStrictEqual(res, null);
  assert.strictEqual(res.rtSegs.length, 2);
  assert.strictEqual(res.rtSegs[1], 'dǔng dúng dùng dùng');
});

// 9. 單一音節異讀 → 跳過
runTest('Single-syllable alternatives are skipped', () => {
  assert.strictEqual(splitRubyByBaseBreakpoints('欣賞', 'hím/hiún sòng'), null);
  assert.strictEqual(splitRubyByBaseBreakpoints('拔', 'bad/pad'), null);
  assert.strictEqual(splitRubyByBaseBreakpoints('起懶根', 'hì lán/nán gín'), null);
  assert.strictEqual(splitRubyByBaseBreakpoints('食自家', 'siid qi/cii/qìd gá'), null);
});

// 10. rtc 多層展開：整詞並列、單音節異讀都展開成完整讀音
runTest('expandSlashReadings: whole-word and single-syllable alternatives', () => {
  assert.deepStrictEqual(expandSlashReadings('溜走', 'tiu zèu/liu zèu'), ['tiu zèu', 'liu zèu']);
  assert.deepStrictEqual(expandSlashReadings('欣賞', 'hím/hiún sòng'), ['hím sòng', 'hiún sòng']);
  assert.deepStrictEqual(expandSlashReadings('拔', 'bad/pad'), ['bad', 'pad']);
  assert.deepStrictEqual(expandSlashReadings('起懶根', 'hì lán/nán gín'), ['hì lán gín', 'hì nán gín']);
  assert.deepStrictEqual(expandSlashReadings('外背', 'ngoi/ngo/no/lo boi'),
    ['ngoi boi', 'ngo boi', 'no boi', 'lo boi']);
});

runTest('expandSlashReadings: skips parentheses / notes / no slash / syllable mismatch', () => {
  assert.strictEqual(expandSlashReadings('懶頭（懶懶）', 'lán/nán těu (lán lán/nán nán)'), null);
  assert.strictEqual(expandSlashReadings('掀', 'ién/hién【ián/hián】'), null);
  assert.strictEqual(expandSlashReadings('發燒', 'fàd séu'), null);
  assert.strictEqual(expandSlashReadings('試看', 'cii/sii kon kon'), null);
});

runTest('sandhiRubyToSup converts nested sandhi ruby to sup', () => {
  assert.strictEqual(
    sandhiRubyToSup('<ruby class="sandhi-t53">tiu<rt>53</rt></ruby> zèu'),
    '<span class="sandhi-sup sandhi-t53">tiu<sup data-tone="53"></sup></span> zèu',
  );
});

// 11. 教典別讀註記（又讀、俗音…）展開成多層
runTest('expandNoteReadings: alternate readings with labels', () => {
  assert.deepStrictEqual(expandNoteReadings('山楂', 'sán zá【俗音】xién zá'),
    [{ label: null, text: 'sán zá' }, { label: '俗音', text: 'xién zá' }]);
  assert.deepStrictEqual(expandNoteReadings('牙确仔', '【特】ngǎ gog è【又俗音】ngǎ kog è'),
    [{ label: '特', text: 'ngǎ gog è' }, { label: '又俗音', text: 'ngǎ kog è' }]);
  assert.deepStrictEqual(expandNoteReadings('墳堂', '【文】fǔn tǒng【白】pǔn tǒng').map((l) => l.label), ['文', '白']);
});

runTest('expandNoteReadings: skips 合音 / syllable mismatch / single layer', () => {
  assert.strictEqual(expandNoteReadings('來去', 'lǒi hi【合音】lí【合音】lói'), null);
  assert.strictEqual(expandNoteReadings('幾久', 'gì giù【俗音】gìd gìd gìd giù'), null);
  assert.strictEqual(expandNoteReadings('若係', '【特殊音】na he'), null);
  assert.strictEqual(expandNoteReadings('下手', 'ha sù'), null);
});

// 12. 括號裡肚个頓號（異體詞分隔）也斷行
runTest('Dun-separated variants inside parentheses split after each 、', () => {
  const res = splitRubyByBaseBreakpoints('沙壩（沙埔、沙灘）', 'sá ba (sá pú、sá tán)');
  assert.notStrictEqual(res, null);
  assert.deepStrictEqual(res.baseSegs, ['沙壩', '（沙埔、', '沙灘）']);
  assert.deepStrictEqual(res.rtSegs, ['sá ba ', '(sá pú、', 'sá tán)']);
});

runTest('Dun outside parentheses is not a break point', () => {
  assert.strictEqual(splitRubyByBaseBreakpoints('七坐、八爬', 'qìd có 、 bàd pǎ'), null);
});

runTest('Dun split falls back to paren-only split when phonetic lacks matching 、', () => {
  const res = splitRubyByBaseBreakpoints('上擺（上到、上回）', 'shòng bâi (shòng dò / shòng fǔi)');
  assert.notStrictEqual(res, null);
  assert.deepStrictEqual(res.baseSegs, ['上擺', '（上到、上回）']);
});

// 14. 斜線兩爿共樣个異讀合併，真个異讀毋動
runTest('collapseIdenticalSlashAlternatives merges only identical alternatives', () => {
  const { collapseIdenticalSlashAlternatives: c } = require('../main.js');
  assert.strictEqual(c('qiǔng (dui/dui、cii)'), 'qiǔng (dui、cii)');
  assert.strictEqual(c('hì lán/lán gín'), 'hì lán gín');
  assert.strictEqual(c('qiǔng (di/dui、cii)'), 'qiǔng (di/dui、cii)');
  assert.strictEqual(c('ngoi/ngo/no/lo boi'), 'ngoi/ngo/no/lo boi');
  assert.strictEqual(c('a/a/a b'), 'a b');
});

runTest('collapseIdenticalSlashAlternatives handles adjacent duplicates and 、 boundaries', () => {
  const { collapseIdenticalSlashAlternatives: c } = require('../main.js');
  assert.strictEqual(c('a/a b/b'), 'a b');
  assert.strictEqual(c('(a/a、b/b)'), '(a、b)');
  assert.strictEqual(c('ab/b'), 'ab/b'); // 非完整音節相同，毋合併
});

runTest('expandSlashReadings returns null when combinations exceed the limit (>8)', () => {
  assert.strictEqual(expandSlashReadings('四個字詞', 'a/b c/d e/f g/h'), null);
});

runTest('splitRubyByWholeWordSlash counts hyphen-joined syllables like expandSlashReadings', () => {
  const res = splitRubyByBaseBreakpoints('溜走', 'tiu-zèu/liu-zèu');
  assert.notStrictEqual(res, null);
  assert.deepStrictEqual(res.rtSegs, ['tiu-zèu/', 'liu-zèu']);
  assert.deepStrictEqual(res.breakKinds, ['primary']);
});

// 15. 頓號漸進斷行（空間毋夠正對最尾一個 segment 斷行，空間夠就毋斷）
runTest('breakKinds distinguishes primary and dun breakpoints', () => {
  const res = splitRubyByBaseBreakpoints('沙壩（沙埔、沙灘、沙洲）', 'sá ba (sá pú、sá tán、sá zíu)');
  assert.notStrictEqual(res, null);
  assert.deepStrictEqual(res.breakKinds, ['primary', 'dun', 'dun']);

  const fallback = splitRubyByBaseBreakpoints('上擺（上到、上回）', 'shòng bâi (shòng dò / shòng fǔi)');
  assert.notStrictEqual(fallback, null);
  assert.deepStrictEqual(fallback.breakKinds, ['primary']);
});

runTest('adjustRubyFontSize progressively splits dun segments from the end only when overflowing', () => {
  const { adjustRubyFontSize } = require('../main.js');
  const prevDoc = global.document;
  const prevGetComputedStyle = global.window.getComputedStyle;
  const prevNavDesc = Object.getOwnPropertyDescriptor(global, 'navigator');
  Object.defineProperty(global, 'navigator', {
    value: { userAgent: 'firefox' },
    configurable: true,
    writable: true,
  });

  function makeMockNode(tagName, widthLookup) {
    const node = {
      tagName: tagName.toUpperCase(),
      style: {},
      dataset: {},
      children: [],
      parentNode: null,
      _html: '',
      classList: {
        _set: new Set(),
        add(c) { this._set.add(c); },
        contains(c) { return this._set.has(c); },
      },
      set className(v) { this.classList._set = new Set(String(v).split(/\s+/).filter(Boolean)); },
      get className() { return Array.from(this.classList._set).join(' '); },
      set innerHTML(v) {
        this._html = v;
        if (this.tagName === 'RUBY') {
          const m = String(v).match(/^([\s\S]*?)<rt>([\s\S]*?)<\/rt>$/);
          if (m) {
            this._base = m[1];
            this._rt = m[2];
          } else {
            this._base = v;
            this._rt = '';
          }
        }
      },
      get innerHTML() { return this._html; },
      appendChild(child) {
        child.parentNode = this;
        this.children.push(child);
        return child;
      },
      replaceChild(newChild, oldChild) {
        const idx = this.children.indexOf(oldChild);
        if (idx !== -1) {
          this.children[idx] = newChild;
          newChild.parentNode = this;
          oldChild.parentNode = null;
        }
        return oldChild;
      },
      closest(sel) {
        if (sel === 'td') return node._td || (node.parentNode ? node.parentNode.closest(sel) : null);
        return null;
      },
      querySelector(sel) {
        if (sel === 'rt' && this.tagName === 'RUBY' && this._rt !== undefined && this._rt !== '') {
          return { innerHTML: this._rt };
        }
        return null;
      },
      querySelectorAll(sel) {
        if (sel === ':scope > ruby') {
          return this.children.filter((c) => c.tagName === 'RUBY');
        }
        return [];
      },
      cloneNode() {
        const c = makeMockNode(this.tagName, widthLookup);
        c._base = this._base;
        c._rt = '';
        c._html = this._base !== undefined ? this._base : this._html;
        return c;
      },
      get scrollWidth() {
        const key = this._base !== undefined ? this._base : this._html;
        return widthLookup(key);
      },
    };
    return node;
  }

  function runCase(tdClientWidth, widthMap) {
    const widthLookup = (k) => (k in widthMap ? widthMap[k] : 50);
    global.document = {
      createElement: (tag) => makeMockNode(tag, widthLookup),
    };
    global.window.getComputedStyle = (el) => {
      if (el.tagName === 'TD') return { display: 'table-cell', paddingLeft: '0px' };
      return { fontSize: '16px' };
    };
    const td = makeMockNode('td', widthLookup);
    td.clientWidth = tdClientWidth;
    const ruby = makeMockNode('ruby', widthLookup);
    ruby._td = td;
    ruby.innerHTML = '沙壩（沙埔、沙灘、沙洲）<rt>sá ba (sá pú、sá tán、sá zíu)</rt>';
    td.appendChild(ruby);

    adjustRubyFontSize(ruby);
    const group = td.children[0];
    return group.children.map((c) => c._base);
  }

  const widths = {
    '沙壩（沙埔、沙灘、沙洲）': 260,
    '沙壩': 60,
    '（沙埔、沙灘、沙洲）': 180,
    '（沙埔、沙灘、': 130,
    '（沙埔、': 80,
    '沙灘、': 60,
    '沙洲）': 60,
  };

  try {
    // 空間夠放整串括號：毋斷頓號（淨切括號）
    assert.deepStrictEqual(runCase(200, widths), ['沙壩', '（沙埔、沙灘、沙洲）']);
    // 空間毋夠放 3 隻，但夠放 2 隻：淨斷最尾一個 segment
    assert.deepStrictEqual(runCase(150, widths), ['沙壩', '（沙埔、沙灘、', '沙洲）']);
    // 空間連 2 隻都毋夠：再對後背斷一個 segment
    assert.deepStrictEqual(runCase(100, widths), ['沙壩', '（沙埔、', '沙灘、', '沙洲）']);
  } finally {
    global.document = prevDoc;
    global.window.getComputedStyle = prevGetComputedStyle;
    if (prevNavDesc) Object.defineProperty(global, 'navigator', prevNavDesc);
  }
});
