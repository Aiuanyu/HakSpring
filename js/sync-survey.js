// js/sync-survey.js
// 雲端同步使用狀況問卷（Google 表單內嵌）。入口有兩個：資料說明視窗標頭的問卷鈕（#syncSurveyBtn）、
// 手動共步視窗裡的邀請連結（[data-open-sync-survey]）。
// 為何用 Google 表單：Supabase 流量超額（HTTP 402），意見回饋那套寫進 Supabase 个問卷暫時送毋出去。
// 表單毋載入 iframe 直到使用者撳開（毋會替每位使用者連去 Google）。
// 同時間淨有一層視窗：從手動共步視窗開，會先收起手動共步視窗，問卷視窗有「回手動共步」鈕。
// 依賴：「回手動共步」呼叫 window.showManualSyncModal（js/cloud-sync.js，載入較晚）；淨在點擊時正呼叫，所以載入順序毋會出問題。
(function (root) {
  const FORM_ID = '1FAIpQLSey0-7bZRvRqHbLs0oguOoqHVMgiyKorTg62yG58WglIGc7ZA';
  const FORM_BASE = `https://docs.google.com/forms/d/e/${FORM_ID}/viewform`;
  const EMBED_URL = `${FORM_BASE}?embedded=true`;
  const OPEN_URL = FORM_BASE;

  /** 彈窗 HTML（純字串，好測試）。iframe 个 src 先毋填，開窗時正設。 */
  function buildModalHtml() {
    return `
      <div class="modal-dialog sync-survey-dialog" role="dialog" aria-modal="true" aria-labelledby="syncSurveyTitle">
        <div class="sync-survey-header">
          <h4 id="syncSurveyTitle">雲端同步使用狀況問卷</h4>
          <button type="button" id="syncSurveyCloseBtn" class="sync-survey-close" aria-label="關忒">&times;</button>
        </div>
        <p class="sync-survey-note">
          匿名、約 1 分鐘、全部選填，毋收姓名摎聯絡方式。回答由 Google 表單收集。
          撿採看毋著表單，請
          <a id="syncSurveyOpenLink" href="${OPEN_URL}" target="_blank" rel="noopener noreferrer">在新分頁開啟</a>。
        </p>
        <button type="button" id="syncSurveyBackBtn" class="sync-survey-back" hidden>← 回手動共步</button>
        <iframe id="syncSurveyFrame" class="sync-survey-frame" title="雲端同步使用狀況問卷" loading="lazy"
          referrerpolicy="no-referrer"></iframe>
      </div>`;
  }

  /**
   * 問卷視窗行為（開／關、焦點、Esc、只留一層）。doc、win 由外面傳入，好用假 DOM 測試。
   * @returns {{open: Function, close: Function, isOpen: Function}}
   */
  function createController(doc, win) {
    let overlay = null;
    let lastFocus = null;
    let cameFromManual = false;

    const track = (label) => {
      try {
        if (typeof win.trackEvent === 'function') win.trackEvent('click', 'SyncSurvey', label);
      } catch (e) {
        /* 統計失敗就算 */
      }
    };
    const isOpen = () => !!overlay && overlay.classList.contains('is-visible');

    function focusables() {
      return ['#syncSurveyBackBtn', '#syncSurveyOpenLink', '#syncSurveyCloseBtn', '#syncSurveyFrame']
        .map((selector) => overlay.querySelector(selector))
        .filter((element) => element && !element.hidden);
    }

    function close() {
      if (!isOpen()) return;
      overlay.classList.remove('is-visible');
      const target = lastFocus;
      lastFocus = null;
      if (target && typeof target.focus === 'function') target.focus();
    }

    function backToManual() {
      close();
      if (typeof win.showManualSyncModal === 'function') win.showManualSyncModal();
    }

    function ensureModal() {
      if (overlay) return overlay;
      overlay = doc.createElement('div');
      overlay.id = 'syncSurveyModal';
      overlay.className = 'modal-overlay';
      overlay.innerHTML = buildModalHtml();
      doc.body.appendChild(overlay);
      overlay.querySelector('#syncSurveyCloseBtn').addEventListener('click', close);
      overlay.querySelector('#syncSurveyBackBtn').addEventListener('click', backToManual);
      overlay.querySelector('#syncSurveyOpenLink').addEventListener('click', () => track('openNewTab'));
      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) close();
      });
      // capture 階段：問卷開等時，Esc 淨關這一層，毋傳去別个視窗
      doc.addEventListener(
        'keydown',
        (event) => {
          if (!isOpen()) return;
          if (event.key === 'Escape') {
            event.stopPropagation();
            event.preventDefault();
            close();
          } else if (event.key === 'Tab') {
            const items = focusables();
            if (!items.length) return;
            const index = items.indexOf(doc.activeElement);
            const next = event.shiftKey ? (index <= 0 ? items.length - 1 : index - 1) : index === items.length - 1 ? 0 : index + 1;
            event.preventDefault();
            items[next].focus();
          }
        },
        true,
      );
      return overlay;
    }

    function open(source, trigger) {
      const modal = ensureModal();
      cameFromManual = source === 'syncModalInvite';
      modal.querySelector('#syncSurveyBackBtn').hidden = !cameFromManual;
      if (cameFromManual) {
        // 只留一層：收起手動共步視窗（用 display 收起，毋清內容；「回手動共步」會重新開）
        const manual = doc.getElementById('manualSyncModal');
        if (manual && manual.style) manual.style.display = 'none';
      }
      const frame = modal.querySelector('#syncSurveyFrame');
      if (!frame.getAttribute('src')) frame.setAttribute('src', EMBED_URL);
      lastFocus = cameFromManual ? null : trigger || doc.activeElement || null;
      modal.classList.add('is-visible');
      modal.querySelector('#syncSurveyCloseBtn').focus();
      track(source || 'open');
    }

    return { open, close, isOpen };
  }

  const logic = { EMBED_URL, OPEN_URL, buildModalHtml, createController };
  root.SyncSurvey = logic;
  if (typeof module !== 'undefined' && module.exports) module.exports = logic;
  if (typeof document === 'undefined') return;

  const controller = createController(document, root);
  root.openSyncSurvey = (source) => controller.open(source);
  document.addEventListener('click', (event) => {
    const target = event.target.closest('#syncSurveyBtn, [data-open-sync-survey]');
    if (!target) return;
    event.preventDefault();
    controller.open(target.id === 'syncSurveyBtn' ? 'headerButton' : 'syncModalInvite', target);
  });
})(typeof self !== 'undefined' ? self : this);
