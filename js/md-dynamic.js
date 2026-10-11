/**
 * 計算特定起算日距今（或基準日）个天數（起算日為第 1 天）
 * @param {string} startDateStr - 'YYYY-MM-DD' 格式
 * @param {Date} [now=new Date()] - 基準時間（方便單元測試）
 * @returns {number|null}
 */
function calculateDayCount(startDateStr, now = new Date()) {
  if (!startDateStr) return null;
  const parts = startDateStr.split(/[-/]/).map(Number);
  if (parts.length !== 3) return null;
  const [year, month, day] = parts;
  if (!year || !month || !day) return null;

  const startLocal = new Date(year, month - 1, day);
  const currentLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((currentLocal - startLocal) / 86400000);
  const count = diffDays + 1;
  return count > 0 ? count : 1;
}

/**
 * 填入 Markdown 渲染後个動態佔位標籤（例：計算開發日數）
 * @param {HTMLElement|Document} [container=document] 
 * @param {Date} [now=new Date()]
 */
function renderDynamicMarkdownTags(container = document, now = new Date()) {
  if (!container || typeof container.querySelectorAll !== 'function') return;
  const elements = container.querySelectorAll('[data-day-count]');
  elements.forEach((el) => {
    const startDateStr = el.getAttribute('data-day-count');
    const count = calculateDayCount(startDateStr, now);
    if (count !== null) {
      el.textContent = count.toLocaleString();
    }
  });
}

if (typeof window !== 'undefined') {
  window.calculateDayCount = calculateDayCount;
  window.renderDynamicMarkdownTags = renderDynamicMarkdownTags;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    calculateDayCount,
    renderDynamicMarkdownTags
  };
}
