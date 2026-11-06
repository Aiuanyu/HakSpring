// tests/sync_survey_test.js
// 驗證雲端同步問卷（js/sync-survey.js）：網址、彈窗 HTML、入口接線，摎實際行為
// （開窗才設 src、重複開毋重複建、Esc／背景關閉、只留一層、焦點、Tab 圈住）。用簡易假 DOM，毋裝套件。
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { EMBED_URL, OPEN_URL, buildModalHtml, createController } = require('../js/sync-survey.js');

console.log('🧪 Starting sync survey tests...');
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---- 1. 網址摎彈窗 HTML ----
assert.ok(/^https:\/\/docs\.google\.com\/forms\/d\/e\/[\w-]+\/viewform$/.test(OPEN_URL), OPEN_URL);
assert.strictEqual(EMBED_URL, `${OPEN_URL}?embedded=true`);
const html = buildModalHtml();
assert.ok(/<iframe id="syncSurveyFrame"/.test(html));
assert.ok(!/<iframe[^>]*\ssrc=/.test(html), 'iframe 毋好預先載入，等開窗正設 src');
assert.ok(/title="[^"]+"/.test(html.match(/<iframe[^>]*>/)[0]), 'iframe 愛有 title（無障礙）');
assert.ok(new RegExp(`href="${escapeRegExp(OPEN_URL)}"[^>]*target="_blank"[^>]*rel="noopener noreferrer"`).test(html));
assert.ok(/id="syncSurveyCloseBtn"/.test(html) && /role="dialog"/.test(html));
assert.ok(/<iframe[^>]*referrerpolicy="no-referrer"/.test(html), 'iframe 毋送 referrer');
assert.ok(!/frameborder|marginheight|marginwidth/.test(html), '毋用過時屬性，樣式放 CSS');
assert.ok(/id="syncSurveyBackBtn"[^>]*hidden/.test(html), '「回手動共步」預設收起');
assert.ok(html.includes('撿採看毋著表單'), '備用連結个說明用字');
console.log('  ✅ 網址摎彈窗 PASS');

// ---- 2. 簡易假 DOM ----
function makeDom() {
  const listeners = [];
  const byId = {};
  class El {
    constructor(tag) {
      this.tag = tag; this.id = ''; this.className = ''; this.attrs = {}; this.hidden = false;
      this.style = {}; this.children = []; this.handlers = {}; this.parent = null;
      const set = new Set();
      this.classList = {
        add: (c) => set.add(c), remove: (c) => set.delete(c), contains: (c) => set.has(c),
      };
    }
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
    setAttribute(k, v) { this.attrs[k] = v; }
    addEventListener(type, fn) { (this.handlers[type] = this.handlers[type] || []).push(fn); }
    appendChild(c) { c.parent = this; this.children.push(c); return c; }
    focus() { dom.document.activeElement = this; }
    querySelector(sel) { return byId[sel.replace(/^#/, '')] || null; }
    click() { fire(this, 'click', { target: this }); }
    closest() { return null; }
    set innerHTML(markup) {
      for (const m of markup.matchAll(/<(\w+)([^>]*)>/g)) {
        const idMatch = /\sid="([^"]+)"/.exec(m[2]);
        if (!idMatch) continue;
        const el = new El(m[1]); el.id = idMatch[1]; el.hidden = /\shidden(\s|$)/.test(m[2]); byId[el.id] = el;
      }
    }
  }
  function fire(el, type, event) {
    (el.handlers[type] || []).forEach((fn) => fn(event));
  }
  const dom = {
    document: {
      body: new El('body'), activeElement: null,
      createElement(tag) { const e = new El(tag); const origAppend = e.appendChild; e.appendChild = origAppend; return e; },
      getElementById(id) { return byId[id] || null; },
      addEventListener(type, fn, capture) { listeners.push({ type, fn, capture }); },
    },
    byId,
    El,
    key(key, extra = {}) {
      const event = { key, stopped: false, prevented: false, stopPropagation() { this.stopped = true; }, preventDefault() { this.prevented = true; }, ...extra };
      listeners.filter((l) => l.type === 'keydown').forEach((l) => l.fn(event));
      return event;
    },
  };
  // 建立 overlay 時要進 byId（createElement 後設 id）
  const origCreate = dom.document.createElement;
  dom.document.createElement = (tag) => {
    const e = origCreate(tag);
    Object.defineProperty(e, 'id', { set(v) { this._id = v; if (v) byId[v] = e; }, get() { return this._id || ''; } });
    return e;
  };
  dom.fire = fire;
  return dom;
}

// ---- 3. 行為 ----
{
  const dom = makeDom();
  const tracked = [];
  const win = { trackEvent: (...a) => tracked.push(a), showManualSyncModal: () => { manual.style.display = 'flex'; } };
  const manual = new dom.El('div'); manual.id = 'manualSyncModal'; dom.byId.manualSyncModal = manual; manual.style.display = 'flex';
  const headerBtn = new dom.El('button'); headerBtn.id = 'syncSurveyBtn';
  const controller = createController(dom.document, win);

  assert.strictEqual(dom.byId.syncSurveyModal, undefined, '開窗前毋建 DOM');
  assert.strictEqual(controller.isOpen(), false);

  // 從 header 鈕開
  headerBtn.focus();
  controller.open('headerButton', headerBtn);
  const modal = dom.byId.syncSurveyModal;
  const frame = dom.byId.syncSurveyFrame;
  assert.ok(controller.isOpen() && modal.classList.contains('is-visible'));
  assert.strictEqual(frame.getAttribute('src'), EMBED_URL, '開窗正設 src');
  assert.strictEqual(dom.byId.syncSurveyBackBtn.hidden, true, '從 header 開，毋顯示回手動共步');
  assert.strictEqual(manual.style.display, 'flex', '從 header 開毋動手動共步視窗');
  assert.strictEqual(dom.document.activeElement, dom.byId.syncSurveyCloseBtn, '焦點移入視窗');

  // 重複開毋重複建、毋重複設 src
  controller.close(); controller.open('headerButton', headerBtn);
  assert.strictEqual(Object.values(dom.byId).filter((e) => e === modal).length, 1);
  assert.strictEqual(dom.byId.syncSurveyModal, modal, '同一個 overlay');

  // Esc：關閉、阻止傳播、焦點還原
  const esc = dom.key('Escape');
  assert.ok(esc.stopped && esc.prevented, 'Esc 愛擋掉，毋傳去別个視窗');
  assert.strictEqual(controller.isOpen(), false);
  assert.strictEqual(dom.document.activeElement, headerBtn, '關閉後焦點還原到觸發鈕');
  // 視窗無開等，Esc 毋處理（毋阻擋別人）
  const idle = dom.key('Escape');
  assert.strictEqual(idle.stopped, false);

  // 背景點擊關閉；點內容毋關
  controller.open('headerButton', headerBtn);
  dom.fire(modal, 'click', { target: frame });
  assert.strictEqual(controller.isOpen(), true, '點內容毋關');
  dom.fire(modal, 'click', { target: modal });
  assert.strictEqual(controller.isOpen(), false, '點背景關閉');

  // 關閉鈕
  controller.open('headerButton', headerBtn); dom.byId.syncSurveyCloseBtn.click();
  assert.strictEqual(controller.isOpen(), false);

  // Tab 圈住：焦點在最後一個，Tab 回第一個；Shift+Tab 反向
  controller.open('headerButton', headerBtn);
  const order = ['syncSurveyOpenLink', 'syncSurveyCloseBtn', 'syncSurveyFrame'].map((id) => dom.byId[id]);
  order[2].focus();
  let tab = dom.key('Tab');
  assert.ok(tab.prevented);
  assert.strictEqual(dom.document.activeElement, order[0], 'Tab 圈回第一個');
  dom.key('Tab', { shiftKey: true });
  assert.strictEqual(dom.document.activeElement, order[2], 'Shift+Tab 圈到最後一個');
  controller.close();

  // 從手動共步視窗開：只留一層，有「回手動共步」，回去會重新開手動共步視窗
  controller.open('syncModalInvite', null);
  assert.strictEqual(manual.style.display, 'none', '收起手動共步視窗');
  assert.strictEqual(dom.byId.syncSurveyBackBtn.hidden, false, '顯示回手動共步');
  dom.byId.syncSurveyBackBtn.click();
  assert.strictEqual(controller.isOpen(), false);
  assert.strictEqual(manual.style.display, 'flex', '回去重新開手動共步視窗');

  // 統計：入口摎「在新分頁開啟」
  assert.deepStrictEqual(tracked.map((t) => t[2]).slice(0, 2), ['headerButton', 'headerButton']);
  assert.ok(tracked.some((t) => t[2] === 'syncModalInvite'));
  dom.fire(dom.byId.syncSurveyOpenLink, 'click', {});
  assert.ok(tracked.some((t) => t[2] === 'openNewTab'));
}
console.log('  ✅ 行為（開關、Esc、焦點、Tab、只留一層）PASS');

// ---- 4. 入口接線 ----
const root = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const cloud = fs.readFileSync(path.join(root, 'js/cloud-sync.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
assert.ok(/id="syncSurveyBtn"/.test(index), 'index.html 缺問卷鈕');
assert.ok(/js\/sync-survey\.js\?v=/.test(index), 'index.html 毋曾載入 sync-survey.js');
assert.ok(/data-open-sync-survey/.test(cloud), '手動共步視窗缺邀請連結');
assert.ok(/window\.showManualSyncModal\s*=/.test(cloud), '「回手動共步」愛 window.showManualSyncModal 做得呼叫');
const z = css.match(/#syncSurveyModal \{\s*z-index:\s*(\d+)/);
assert.ok(z && Number(z[1]) > 10002, '問卷彈窗个層級愛高過手動共步視窗 (10002)');
for (const sel of ['#syncSurveyBtn,', '#syncSurveyBtn i,', '#syncSurveyBtn:hover i,', '.sync-survey-back[hidden]']) {
  assert.ok(css.includes(sel), `style.css 缺 ${sel}`);
}
console.log('  ✅ 入口接線 PASS');
console.log('✨ All sync survey tests passed!');
