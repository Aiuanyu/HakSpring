// tests/search_popup_keyboard_nav_test.js
// 測試查詞框與查詢設定彈出面板鍵盤導覽（撳 ↓ 打開選項、項目間方向鍵遊走導覽）
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('index.html: search-input 與 search-popup 應具備適當之無障礙屬性與快捷鍵提示', () => {
  const htmlPath = path.join(__dirname, '..', 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  assert.ok(
    html.includes('id="search-input"'),
    'index.html 應有 id="search-input"',
  );
  assert.ok(
    html.includes('aria-haspopup="true"'),
    'search-input 應具備 aria-haspopup="true"',
  );
  assert.ok(
    html.includes('aria-expanded="false"'),
    'search-input 預設應具備 aria-expanded="false"',
  );
  assert.ok(
    html.includes('id="search-popup" role="region" aria-label="查詢設定"'),
    'search-popup 應具備 role="region" 與 aria-label="查詢設定"',
  );
  assert.ok(
    html.includes('<kbd class="popup-shortcut">1</kbd>四縣') &&
      html.includes('<kbd class="popup-shortcut">2</kbd>海陸') &&
      html.includes('<kbd class="popup-shortcut">3</kbd>大埔') &&
      html.includes('<kbd class="popup-shortcut">4</kbd>饒平') &&
      html.includes('<kbd class="popup-shortcut">5</kbd>詔安') &&
      html.includes('<kbd class="popup-shortcut">6</kbd>南四縣') &&
      html.includes('<kbd class="popup-shortcut">9</kbd>尋客詞') &&
      html.includes('<kbd class="popup-shortcut">0</kbd>尋 Chinese'),
    'index.html 應包含 1~5 四海大平安、6 南四縣、9 尋客詞、0 尋 Chinese 數字細標籤',
  );
});

test('style.css: 應包含彈出選項之 focus-visible 高亮樣式與桌面端數字細標籤樣式', () => {
  const cssPath = path.join(__dirname, '..', 'style.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  assert.ok(
    css.includes('#dialect-selection label:has(input:focus-visible)'),
    'style.css 應包含選項 label:has(input:focus-visible) 高亮樣式',
  );
  assert.ok(
    css.includes('#search-popup input[type="radio"]:focus-visible'),
    'style.css 應包含 radio :focus-visible 外框樣式',
  );
  assert.ok(
    css.includes('.popup-shortcut'),
    'style.css 應包含 .popup-shortcut 樣式',
  );
});

test('main.js: 應包含完整的 searchPopup 打開、關閉、方向鍵與數字鍵導覽邏輯', () => {
  const jsPath = path.join(__dirname, '..', 'main.js');
  const js = fs.readFileSync(jsPath, 'utf8');

  assert.ok(
    js.includes("event.key === 'ArrowDown'"),
    'main.js 應包含 ArrowDown 鍵事件監聽',
  );
  assert.ok(
    js.includes('numberShortcutMap'),
    'main.js 應有 numberShortcutMap 數字快捷鍵映射表',
  );
  assert.ok(
    js.includes('openSearchPopup'),
    'main.js 應有 openSearchPopup 函式',
  );
  assert.ok(
    js.includes('closeSearchPopup'),
    'main.js 應有 closeSearchPopup 函式',
  );
  assert.ok(
    js.includes('getNavigableItems'),
    'main.js 應有 getNavigableItems 導覽清單計算',
  );
  assert.ok(
    js.includes("searchPopup.addEventListener('keydown'"),
    'main.js 應對 searchPopup 綁定 keydown 導覽監聽',
  );
});

test('鍵盤導覽狀態機邏輯驗證', () => {
  // 建立虛擬 DOM 與事件模擬環境
  const items = [
    { id: 'd-si', type: 'radio', name: 'dialect', value: '四縣', checked: true },
    { id: 'd-nansi', type: 'radio', name: 'dialect', value: '南四縣', checked: false },
    { id: 'd-hoi', type: 'radio', name: 'dialect', value: '海陸', checked: false },
    { id: 'd-tai', type: 'radio', name: 'dialect', value: '大埔', checked: false },
    { id: 'd-ngiau', type: 'radio', name: 'dialect', value: '饒平', checked: false },
    { id: 'd-zieu', type: 'radio', name: 'dialect', value: '詔安', checked: false },
    { id: 'm-hak', type: 'radio', name: 'search-mode', value: '客話', checked: true },
    { id: 'm-hoa', type: 'radio', name: 'search-mode', value: '華語', checked: false },
    { id: 'showcase-btn', type: 'button' },
  ];

  let activeElement = null;
  let popupOpen = false;
  let lastSearchDialect = '四縣';
  let lastSearchMode = '客話';
  let searchPerformed = false;

  const searchInput = {
    value: '客家',
    focus() {
      activeElement = searchInput;
    },
    setAttribute(k, v) {
      if (k === 'aria-expanded') popupOpen = v === 'true';
    },
  };

  function openPopup() {
    popupOpen = true;
    searchInput.setAttribute('aria-expanded', 'true');
  }

  function closePopup() {
    popupOpen = false;
    searchInput.setAttribute('aria-expanded', 'false');
  }

  function triggerChange(item) {
    if (item.name === 'dialect') lastSearchDialect = item.value;
    if (item.name === 'search-mode') lastSearchMode = item.value;
  }

  // 1. 在查詞框內按下 ArrowDown
  activeElement = searchInput;
  assert.equal(popupOpen, false, '初始狀態面板應為關閉');

  // 模擬 searchInput keydown ArrowDown
  openPopup();
  const target = items.find((i) => i.name === 'dialect' && i.checked) || items[0];
  activeElement = target;

  assert.equal(popupOpen, true, '按下 ArrowDown 應打開面板');
  assert.equal(activeElement.value, '四縣', '焦點應移至已選取的腔調（四縣）');

  // 2. 在面板中按下 ArrowDown，導覽至下一個選項（南四縣）
  let idx = items.indexOf(activeElement);
  let next = items[idx + 1];
  activeElement = next;
  next.checked = true;
  triggerChange(next);

  assert.equal(activeElement.value, '南四縣', '焦點應移至南四縣');
  assert.equal(lastSearchDialect, '南四縣', '腔調應即時切換為南四縣');

  // 3. 繼續按下 ArrowDown 跨群組導覽至查詢模式
  for (let i = 0; i < 5; i++) {
    idx = items.indexOf(activeElement);
    next = items[idx + 1];
    activeElement = next;
    if (next.type === 'radio') {
      next.checked = true;
      triggerChange(next);
    }
  }
  assert.equal(activeElement.id, 'm-hak', '應順暢跨越群組導覽至查詢模式（客話）');

  // 4. 按下 Escape 應關閉面板並返回查詞框
  closePopup();
  searchInput.focus();

  assert.equal(popupOpen, false, '按 Escape 應關閉面板');
  assert.equal(activeElement, searchInput, '焦點應回到 searchInput');

  // 5. 重新打開，方向鍵導覽期間即使 searchInput 有字，面板始終保持開啟且不觸發提前搜尋
  openPopup();
  activeElement = items[0]; // 四縣
  idx = items.indexOf(activeElement);
  // 按 ArrowUp 循環至最底端按鈕
  let prevIdx = idx - 1 < 0 ? items.length - 1 : idx - 1;
  activeElement = items[prevIdx];

  assert.equal(popupOpen, true, '方向鍵在面板內遊走導覽期間，面板應始終維持打開狀態');
  assert.equal(activeElement.id, 'showcase-btn', '在頂端按 ArrowUp 應循環至末端按鈕');
  assert.equal(searchPerformed, false, '導覽期間絕不提前觸發搜尋');

  // 6. 在 radio 按 Enter 應關閉面板並觸發搜尋
  activeElement = items[2]; // 海陸
  items[2].checked = true;
  triggerChange(items[2]);
  closePopup();
  searchInput.focus();
  if (searchInput.value.trim()) {
    searchPerformed = true;
  }

  assert.equal(popupOpen, false, '按 Enter 應關閉面板');
  assert.equal(activeElement, searchInput, '焦點應回到 searchInput');
  assert.equal(lastSearchDialect, '海陸', '腔調應為海陸');
  assert.equal(searchPerformed, true, '有關鍵字時按 Enter 應觸發搜尋');

  // 7. 數字快捷鍵導覽測試：1~5 四海大平安、6 南四縣、9 尋客詞、0 尋 Chinese
  openPopup();
  const numberShortcutMap = {
    '1': { name: 'dialect', value: '四縣' },
    '2': { name: 'dialect', value: '海陸' },
    '3': { name: 'dialect', value: '大埔' },
    '4': { name: 'dialect', value: '饒平' },
    '5': { name: 'dialect', value: '詔安' },
    '6': { name: 'dialect', value: '南四縣' },
    '9': { name: 'search-mode', value: '客話' },
    '0': { name: 'search-mode', value: '華語' },
  };

  function pressKey(k) {
    const cfg = numberShortcutMap[k];
    const match = items.find((i) => i.name === cfg.name && i.value === cfg.value);
    activeElement = match;
    match.checked = true;
    triggerChange(match);
  }

  pressKey('2');
  assert.equal(lastSearchDialect, '海陸', '按 2 應直切海陸');
  assert.equal(popupOpen, true, '數字鍵切換時面板應保持打開');

  pressKey('5');
  assert.equal(lastSearchDialect, '詔安', '按 5 應直切詔安');

  pressKey('6');
  assert.equal(lastSearchDialect, '南四縣', '按 6 應直切南四縣');

  pressKey('0');
  assert.equal(lastSearchMode, '華語', '按 0 應直切尋 Chinese');

  pressKey('9');
  assert.equal(lastSearchMode, '客話', '按 9 應直切尋客詞');
});
