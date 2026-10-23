/**
 * js/gip-superscript.js
 * GIP（教育部客拼）模式下，把畫面上貼在音節字母後面个聲調符號（ˊ ˋ ˇ ˆ +）包成上標 <span class="gip-t">，
 * 由 style.css 縮細摎抬高，讓調符一致出現在字母右上角。
 *
 * 為什麼毋直接用字型：這幾个符號个字形在各字型內底是「置中在寬格子裡」，高度摎位置每个字型都無共樣
 * （+ 个字形甚至在 x 字高中間），換字型解決毋著，所以改用標記包裝。
 *
 * 做法：資料摎文字維持純文字（變調判斷、複製、搜尋都毋受影響），這支淨做「畫面後處理」：
 *   - GIP 模式下，用 MutationObserver 處理新出現个文字節點；
 *   - 切換模式時，GIP 就全頁掃一擺，離開 GIP 就把上標還原成純文字。
 * Romaine 結果區（#romanizer-output）有自家个處理（romanizer.js 个 setSyllableDisplay），這裡跳過。
 *
 * 調符字元集引用 gip-converter.js 匯出个 TONE_SYMBOL_CHARS，毋自家再寫一份。
 * 純文字切分邏輯 splitToneSymbols 獨立出來，Node 內底做得單元測試（tests/gip_superscript_test.js）。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./gip-converter.js'), null);
  } else {
    // 瀏覽器：gip-converter.js 在 index.html 先載入
    root.gipSuperscript = factory(root.gipConverter, root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (gip, root) {
  'use strict';

  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION', 'NOSCRIPT']);
  // 說明文件、新消息、設定說明這類散文區（可能有 A+、C+ 這種一般文字）毋處理；
  // 其他毋愛處理个地方，加 data-no-gip 屬性就會跳過
  const PROSE_SELECTOR = '#info-content, #whats-new-content, #data-management-content, .setting-description, [data-no-gip]';
  const LETTER = 'A-Za-z\\u00C0-\\u024F\\u1E00-\\u1EFF';

  /** 「字母 + 調符」个正規式（字母後面緊接調符才算；+ 係 ASCII，所以愛前頭有字母） */
  function buildPattern(flags) {
    const symbols = gip.TONE_SYMBOL_CHARS.map((c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')).join('');
    return new RegExp('([' + LETTER + '])([' + symbols + '])', flags);
  }

  /**
   * 將文字切成「一般文字」摎「調符」兩種片段。
   * @param {string} text
   * @returns {{text: string, tone: boolean}[]} 無調符就回傳空陣列
   */
  function splitToneSymbols(text) {
    if (!text) return [];
    const re = buildPattern('g');
    const parts = [];
    let last = 0;
    let match;
    while ((match = re.exec(text))) {
      const symbolStart = match.index + match[1].length;
      parts.push({ text: text.slice(last, symbolStart), tone: false });
      parts.push({ text: match[2], tone: true });
      last = symbolStart + match[2].length;
    }
    if (!parts.length) return [];
    parts.push({ text: text.slice(last), tone: false });
    return parts.filter((p) => p.text !== '');
  }

  // ---------- 以下係瀏覽器个 DOM 處理 ----------

  function isGipMode() {
    const pfs = root && root.pfsConverter;
    if (!pfs) return false;
    try {
      return pfs.normalizeDisplayScript(localStorage.getItem('hakfaDisplayScript')) === 'gip';
    } catch (e) {
      return false;
    }
  }

  /** 這个節點係毋係在毋愛處理个地方（已經係上標、表單欄位、Romaine 結果區…） */
  function shouldSkip(node) {
    for (let p = node.parentNode; p; p = p.parentNode) {
      if (p.nodeType !== 1) continue;
      if (SKIP_TAGS.has(p.tagName)) return true;
      if (p.classList.contains('gip-t') || p.id === 'romanizer-output') return true;
      if (p.matches(PROSE_SELECTOR)) return true;
      if (p === document.body) break;
    }
    return false;
  }

  function decorateTextNode(node) {
    const parts = splitToneSymbols(node.nodeValue);
    if (!parts.length) return;
    const frag = document.createDocumentFragment();
    parts.forEach((part) => {
      if (part.tone) {
        const span = document.createElement('span');
        span.className = 'gip-t';
        span.textContent = part.text;
        frag.appendChild(span);
      } else {
        frag.appendChild(document.createTextNode(part.text));
      }
    });
    node.parentNode.replaceChild(frag, node);
  }

  function decorateTree(rootNode) {
    if (!rootNode) return;
    if (rootNode.nodeType === 3) {
      if (rootNode.parentNode && !shouldSkip(rootNode)) decorateTextNode(rootNode);
      return;
    }
    if (rootNode.nodeType !== 1 || SKIP_TAGS.has(rootNode.tagName)) return;
    const walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((n) => {
      if (n.parentNode && !shouldSkip(n)) decorateTextNode(n);
    });
  }

  /**
   * 離開 GIP 模式：把上標還原成純文字（Romaine 自家處理，跳過）。
   * 還原後要將相鄰个文字節點併轉去（normalize），毋然「字母」摎「調符」會分屬無共个文字節點，
   * 下擺再切轉 GIP 時，切分邏輯逐節點處理就會比對毋著，上標會漏忒。
   */
  function undecorateAll() {
    const parents = new Set();
    document.querySelectorAll('.gip-t').forEach((span) => {
      if (span.closest('#romanizer-output')) return;
      if (span.parentNode) parents.add(span.parentNode);
      span.replaceWith(document.createTextNode(span.textContent));
    });
    parents.forEach((parent) => parent.normalize());
  }

  let pending = new Set();
  let scheduled = false;
  let observer = null;
  const OBSERVE_OPTIONS = { childList: true, subtree: true, characterData: true };

  function flush() {
    scheduled = false;
    if (!isGipMode()) {
      pending = new Set();
      return;
    }
    const batch = pending;
    pending = new Set();
    // 處理期間暫停觀察，免得自家个改動又觸發自家；try/finally 確保出錯也會恢復觀察
    if (observer) observer.disconnect();
    try {
      batch.forEach((node) => {
        if (node.isConnected) decorateTree(node);
      });
    } finally {
      if (observer) observer.observe(document.body, OBSERVE_OPTIONS);
    }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(flush);
  }

  function init() {
    observer = new MutationObserver((mutations) => {
      if (!isGipMode()) return;
      mutations.forEach((m) => {
        if (m.type === 'childList') {
          m.addedNodes.forEach((n) => pending.add(n));
        } else if (m.type === 'characterData') {
          pending.add(m.target);
        }
      });
      if (pending.size) schedule();
    });
    observer.observe(document.body, OBSERVE_OPTIONS);

    let rescanTimer = null;
    window.addEventListener('hakfaDisplayScriptChanged', () => {
      // 快速連續切換時，取消前一擺排好但還毋曾執行个全頁掃描
      if (rescanTimer) {
        clearTimeout(rescanTimer);
        rescanTimer = null;
      }
      if (isGipMode()) {
        // 等主表、日日一詞等就地更新完，再全頁掃一擺（掃漏个也補著）
        rescanTimer = setTimeout(() => {
          rescanTimer = null;
          if (!isGipMode()) return; // 等个時節模式又切走吔
          if (observer) observer.disconnect();
          try {
            decorateTree(document.body);
          } finally {
            if (observer) observer.observe(document.body, OBSERVE_OPTIONS);
          }
        }, 80);
      } else {
        if (observer) observer.disconnect();
        try {
          undecorateAll();
        } finally {
          if (observer) observer.observe(document.body, OBSERVE_OPTIONS);
        }
      }
    });

    if (isGipMode()) decorateTree(document.body);
  }

  if (root && typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }

  return { splitToneSymbols, decorateTree, undecorateAll };
});
