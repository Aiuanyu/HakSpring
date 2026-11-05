// js/sync-survey.js
// 雲端同步使用狀況問卷（Google 表單內嵌）。入口有兩個：資料說明視窗標頭的問卷鈕（#syncSurveyBtn）、
// 手動共步視窗裡的邀請連結（[data-open-sync-survey]）。
// 為何用 Google 表單：Supabase 流量超額（HTTP 402），意見回饋那套寫進 Supabase 个問卷暫時送毋出去。
// 表單毋載入 iframe 直到使用者撳開（毋會替每位使用者連去 Google）。
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
          若是看無表單，請
          <a id="syncSurveyOpenLink" href="${OPEN_URL}" target="_blank" rel="noopener noreferrer">在新分頁開啟</a>。
        </p>
        <iframe id="syncSurveyFrame" class="sync-survey-frame" title="雲端同步使用狀況問卷" loading="lazy"
          frameborder="0" marginheight="0" marginwidth="0">載入中…</iframe>
      </div>`;
  }

  const logic = { EMBED_URL, OPEN_URL, buildModalHtml };
  root.SyncSurvey = logic;
  if (typeof module !== 'undefined' && module.exports) module.exports = logic;
  if (typeof document === 'undefined') return;

  function track(label) {
    try {
      if (typeof root.trackEvent === 'function') root.trackEvent('click', 'SyncSurvey', label);
    } catch (e) {
      /* 統計失敗就算 */
    }
  }

  function ensureModal() {
    let overlay = document.getElementById('syncSurveyModal');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'syncSurveyModal';
    overlay.className = 'modal-overlay';
    overlay.innerHTML = buildModalHtml();
    document.body.appendChild(overlay);
    const close = () => overlay.classList.remove('is-visible');
    overlay.querySelector('#syncSurveyCloseBtn').addEventListener('click', close);
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && overlay.classList.contains('is-visible')) close();
    });
    overlay.querySelector('#syncSurveyOpenLink').addEventListener('click', () => track('openNewTab'));
    return overlay;
  }

  function open(source) {
    const overlay = ensureModal();
    const frame = overlay.querySelector('#syncSurveyFrame');
    if (!frame.getAttribute('src')) frame.setAttribute('src', EMBED_URL);
    overlay.classList.add('is-visible');
    track(source || 'open');
  }
  root.openSyncSurvey = open;

  document.addEventListener('click', (event) => {
    const target = event.target.closest('#syncSurveyBtn, [data-open-sync-survey]');
    if (!target) return;
    event.preventDefault();
    open(target.id === 'syncSurveyBtn' ? 'headerButton' : 'syncModalInvite');
  });
})(typeof self !== 'undefined' ? self : this);
