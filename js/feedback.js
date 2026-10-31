// js/feedback.js
// 意見回饋：匿名簡短問卷（3 題），存去 Supabase 个 feedback_responses（scripts/supabase/feedback_responses.sql）。
// 純邏輯（驗證、組資料、限制重複送出）放上半段，可離線測試（tests/feedback_test.js）；DOM 放下半段。
(function (root) {
  const AFFECTED = ['yes', 'no', 'unsure'];
  const DEVICES = ['phone', 'desktop', 'tablet'];
  const MESSAGE_MAX = 300;
  const MIN_INTERVAL_MS = 60 * 1000; // 兩次送出至少隔 1 分鐘
  const DAILY_MAX = 3; // 一日最多 3 擺（淨擋手殘同簡單濫用；真正防護在資料表个檢查條件）
  const DAY_MS = 24 * 60 * 60 * 1000;

  /** 驗證表單；affected、device 係選填，message 淨限長度。回傳 {ok, errors}。 */
  function validate(form) {
    const errors = [];
    if (form.affected && !AFFECTED.includes(form.affected)) errors.push('affected');
    if (form.device && !DEVICES.includes(form.device)) errors.push('device');
    const message = (form.message || '').trim();
    if (message.length > MESSAGE_MAX) errors.push('message');
    if (!form.affected && !form.device && !message) errors.push('empty');
    return { ok: errors.length === 0, errors };
  }

  /** 組送去資料庫个資料（空欄位用 null）；topic 讓資料庫預設。 */
  function buildPayload(form, appVersion) {
    const message = (form.message || '').trim();
    return {
      affected: form.affected || null,
      device: form.device || null,
      message: message || null,
      app_version: appVersion ? String(appVersion).slice(0, 40) : null,
    };
  }

  /** 看過去送出紀錄（時間戳陣列），這下做得送無：回傳 {ok, reason}。 */
  function canSubmitNow(history, now) {
    const recent = (history || []).filter((t) => now - t < DAY_MS);
    if (recent.length >= DAILY_MAX) return { ok: false, reason: 'daily' };
    if (recent.some((t) => now - t < MIN_INTERVAL_MS)) return { ok: false, reason: 'interval' };
    return { ok: true };
  }

  const logic = { AFFECTED, DEVICES, MESSAGE_MAX, validate, buildPayload, canSubmitNow };
  root.HakSpringFeedback = logic;
  if (typeof module !== 'undefined' && module.exports) module.exports = logic;

  // ---- 以下係 DOM（淨在瀏覽器執行）----
  if (typeof document === 'undefined') return;

  const HISTORY_KEY = 'feedbackSubmittedAt';

  function readHistory() {
    try {
      const value = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
      return Array.isArray(value) ? value.filter((t) => typeof t === 'number') : [];
    } catch (e) {
      return [];
    }
  }

  function writeHistory(history) {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-10)));
    } catch (e) {
      /* localStorage 毋得用就算 */
    }
  }

  function appVersion() {
    const script = document.querySelector('script[src*="main.js"]');
    const match = script && /[?&]v=([^&]+)/.exec(script.getAttribute('src'));
    return match ? match[1] : null;
  }

  function radioGroup(name, legend, options) {
    const items = options
      .map(
        ([value, label]) =>
          `<label style="display:inline-block;margin:0 14px 6px 0"><input type="radio" name="${name}" value="${value}" /> ${label}</label>`,
      )
      .join('');
    return `<fieldset style="border:0;padding:0;margin:0 0 14px"><legend style="font-weight:bold;margin-bottom:6px">${legend}</legend>${items}</fieldset>`;
  }

  function buildModal() {
    const overlay = document.createElement('div');
    overlay.id = 'feedbackModal';
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-dialog">
        <div class="modal-header">
          <h4 class="modal-title" style="margin: 0; padding: 0;">意見回饋</h4>
          <button type="button" id="feedbackCloseBtn" class="modal-close-btn" aria-label="關忒">&times;</button>
        </div>
        <div class="modal-body">
          <p style="margin-top:0">匿名填寫，毋收姓名、聯絡方式；淨用來改進客源翠。全部選填，填一題就做得送出。</p>
          <form id="feedbackForm">
            ${radioGroup('affected', '1. 這擺認證詞彙音檔放毋出來，有影響著你無？', [['yes', '有'], ['no', '無'], ['unsure', '毋確定']])}
            ${radioGroup('device', '2. 你主要用麼个裝置？', [['phone', '手機'], ['desktop', '電腦'], ['tablet', '平板']])}
            <div style="margin-bottom:14px">
              <label for="feedbackMessage" style="font-weight:bold;display:block;margin-bottom:6px">3. 想講乜个？（最多 ${MESSAGE_MAX} 字）</label>
              <textarea id="feedbackMessage" rows="4" maxlength="${MESSAGE_MAX}" style="width:100%;box-sizing:border-box"></textarea>
            </div>
            <div id="feedbackStatus" role="status" style="min-height:1.4em;margin-bottom:8px"></div>
            <button type="submit" id="feedbackSubmitBtn">送出</button>
          </form>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    return overlay;
  }

  function init() {
    const overlay = buildModal();
    const form = overlay.querySelector('#feedbackForm');
    const status = overlay.querySelector('#feedbackStatus');
    const submitBtn = overlay.querySelector('#feedbackSubmitBtn');
    const open = () => {
      status.textContent = '';
      overlay.classList.add('is-visible');
    };
    const close = () => overlay.classList.remove('is-visible');
    root.openFeedbackModal = open;

    overlay.querySelector('#feedbackCloseBtn').addEventListener('click', close);
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close();
    });
    const button = document.getElementById('feedbackBtn');
    if (button) button.addEventListener('click', open);
    if (new URLSearchParams(location.search).get('feedback') === '1') open();

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = {
        affected: (form.querySelector('input[name="affected"]:checked') || {}).value,
        device: (form.querySelector('input[name="device"]:checked') || {}).value,
        message: form.querySelector('#feedbackMessage').value,
      };
      const checked = validate(data);
      if (!checked.ok) {
        status.textContent = checked.errors.includes('empty')
          ? '至少填一題正做得送出。'
          : `想講乜个最多 ${MESSAGE_MAX} 字。`;
        return;
      }
      const allowed = canSubmitNow(readHistory(), Date.now());
      if (!allowed.ok) {
        status.textContent =
          allowed.reason === 'daily' ? '今晡日已經送出幾擺吔，多謝！明朝再來。' : '剛正送出，請隔一分鐘再送。';
        return;
      }
      const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
      if (!client) {
        status.textContent = '連毋著回饋服務，請盡後再試。';
        return;
      }
      submitBtn.disabled = true;
      status.textContent = '送出中…';
      try {
        const { error } = await client.from('feedback_responses').insert(buildPayload(data, appVersion()));
        if (error) throw error;
        writeHistory([...readHistory(), Date.now()]);
        form.reset();
        status.textContent = '多謝你！已經收著吔。';
      } catch (e) {
        console.error('意見回饋送出失敗', e);
        status.textContent = '送出失敗，請盡後再試。';
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof self !== 'undefined' ? self : this);
