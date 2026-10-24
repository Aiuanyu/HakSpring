// tests/search_hotkey_test.js
// 測試尋詞框鍵盤快捷鍵（/ 鍵聚焦）
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('index.html: search-input 應包含 title 提示撳 / 快速聚焦', () => {
  const htmlPath = path.join(__dirname, '..', 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  assert.ok(
    html.includes('id="search-input"'),
    'index.html 應有 id="search-input"',
  );
  assert.ok(
    html.includes('placeholder="查語詞（撳 / 跳過來）"'),
    'index.html 應有 placeholder="查語詞（撳 / 跳過來）"',
  );
  assert.ok(
    html.includes('title="尋詞（鍵盤撳 / 快速聚焦）"'),
    'index.html 應有 title="尋詞（鍵盤撳 / 快速聚焦）"',
  );
});

test('main.js: globalKeydownHandler 應包含 / 鍵聚焦邏輯且防禦修飾鍵與輸入框', () => {
  const mainJsPath = path.join(__dirname, '..', 'main.js');
  const js = fs.readFileSync(mainJsPath, 'utf8');

  // 1. 檢查是否有 / 鍵與 Slash 的判斷
  assert.ok(
    js.includes("event.key === '/' || event.code === 'Slash'"),
    '應有 / 鍵或 Slash 判斷',
  );

  // 2. 檢查是否有防禦修飾鍵
  assert.ok(
    js.includes('!event.ctrlKey &&\n      !event.metaKey &&\n      !event.altKey') ||
      js.includes('!event.ctrlKey && !event.metaKey && !event.altKey'),
    '應防禦 Ctrl / Meta / Alt 修飾鍵',
  );

  // 3. 檢查是否有防禦一般文字輸入框焦點
  assert.ok(
    js.includes('isTextInputFocused'),
    '應有 isTextInputFocused 判斷以避免攔截正在打字的輸入框',
  );

  // 4. 檢查是否有呼叫 focus 與 select
  assert.ok(
    js.includes('searchInput.focus()') && js.includes('searchInput.select()'),
    '應對 searchInput 呼叫 focus() 與 select()',
  );
});

test('邏輯模擬驗證：/ 鍵行為與邊界條件', () => {
  function simulateKeydown({
    key,
    code,
    ctrlKey = false,
    metaKey = false,
    altKey = false,
    activeElement = { tagName: 'BODY', isContentEditable: false },
    hasOpenModal = false,
  }) {
    let prevented = false;
    let focused = false;
    let selected = false;

    const event = {
      key,
      code,
      ctrlKey,
      metaKey,
      altKey,
      preventDefault() {
        prevented = true;
      },
    };

    const searchInput = {
      focus() {
        focused = true;
      },
      select() {
        selected = true;
      },
    };

    // 模擬 main.js 內的判斷邏輯
    if (
      (event.key === '/' || event.code === 'Slash') &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      const isTextInputFocused =
        activeElement &&
        (activeElement.tagName === 'INPUT' ||
          activeElement.tagName === 'TEXTAREA' ||
          activeElement.tagName === 'SELECT' ||
          activeElement.isContentEditable);

      if (!isTextInputFocused) {
        if (!hasOpenModal && searchInput) {
          event.preventDefault();
          searchInput.focus();
          searchInput.select();
        }
      }
    }

    return { prevented, focused, selected };
  }

  // 正常情境：在一般頁面（BODY）按 /
  const r1 = simulateKeydown({ key: '/', code: 'Slash' });
  assert.equal(r1.prevented, true, '一般狀態按 / 應 preventDefault');
  assert.equal(r1.focused, true, '一般狀態按 / 應 focus');
  assert.equal(r1.selected, true, '一般狀態按 / 應 select');

  // 防禦情境 1：使用者正在 INPUT 打字時按 /
  const r2 = simulateKeydown({
    key: '/',
    code: 'Slash',
    activeElement: { tagName: 'INPUT' },
  });
  assert.equal(r2.prevented, false, '在 INPUT 內打字不應攔截');
  assert.equal(r2.focused, false, '在 INPUT 內打字不應 focus');

  // 防禦情境 2：使用者正在 TEXTAREA 打字時按 /
  const r3 = simulateKeydown({
    key: '/',
    code: 'Slash',
    activeElement: { tagName: 'TEXTAREA' },
  });
  assert.equal(r3.prevented, false, '在 TEXTAREA 內打字不應攔截');

  // 防禦情境 3：按 Ctrl+/ 或 Cmd+/ 快捷鍵
  const r4 = simulateKeydown({
    key: '/',
    code: 'Slash',
    ctrlKey: true,
  });
  assert.equal(r4.prevented, false, '按 Ctrl+/ 不應攔截');

  const r5 = simulateKeydown({
    key: '/',
    code: 'Slash',
    metaKey: true,
  });
  assert.equal(r5.prevented, false, '按 Cmd+/ 不應攔截');

  // 防禦情境 4：當有 Modal 開啟時
  const r6 = simulateKeydown({
    key: '/',
    code: 'Slash',
    hasOpenModal: true,
  });
  assert.equal(r6.prevented, false, '有 Modal 開啟時不應攔截');
});
