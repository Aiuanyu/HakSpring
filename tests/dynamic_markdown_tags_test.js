// tests/dynamic_markdown_tags_test.js
// 測試 Markdown 動態佔位標籤填值（計算開發日數）
const assert = require('assert');

// 模擬基本 DOM 環境
global.window = {};
global.document = {
  addEventListener() {},
  getElementById() { return null; },
  querySelector() { return null; },
  querySelectorAll() { return []; }
};
global.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };

const { calculateDayCount, renderDynamicMarkdownTags } = require('../main.js');

// 1. 測試 calculateDayCount 基本邏輯
// 同一天為 Day 1
assert.strictEqual(calculateDayCount('2025-03-01', new Date(2025, 2, 1)), 1);
// 隔天為 Day 2
assert.strictEqual(calculateDayCount('2025-03-01', new Date(2025, 2, 2)), 2);

// 2026/10/11 驗算：客源翠從 2025/3/1 起算為 Day 590
const testDate20261011 = new Date(2026, 9, 11);
assert.strictEqual(calculateDayCount('2025-03-01', testDate20261011), 590);

// 輸入法 Day 1 = 2026/10/6，至 2026/10/11 為 Day 6
assert.strictEqual(calculateDayCount('2026-10-06', testDate20261011), 6);

// 支援斜線格式 YYYY/MM/DD
assert.strictEqual(calculateDayCount('2025/03/01', testDate20261011), 590);

// 無效格式防禦
assert.strictEqual(calculateDayCount(''), null);
assert.strictEqual(calculateDayCount(null), null);
assert.strictEqual(calculateDayCount('invalid-date'), null);

// 2. 測試 renderDynamicMarkdownTags DOM 填值
class MockElement {
  constructor(dayCountAttr) {
    this.attrs = { 'data-day-count': dayCountAttr };
    this.textContent = '';
  }
  getAttribute(name) {
    return this.attrs[name] || null;
  }
}

class MockContainer {
  constructor(elements) {
    this.elements = elements;
  }
  querySelectorAll(selector) {
    if (selector === '[data-day-count]') {
      return this.elements;
    }
    return [];
  }
}

const el1 = new MockElement('2025-03-01');
const el2 = new MockElement('2026-10-06');
const mockContainer = new MockContainer([el1, el2]);

renderDynamicMarkdownTags(mockContainer, testDate20261011);

assert.strictEqual(el1.textContent, '590');
assert.strictEqual(el2.textContent, '6');

console.log('dynamic_markdown_tags_test: ok');
process.exit(0);
