// js/audio-breaker.js
// 音檔失敗斷路器：音檔來源（哈客學院網站）連不上時，自動放送、單詞循環、Service Worker 毋好
// 一直衝下去（每筆都再試一擺），連續失敗幾擺就停。頁面（main.js）摎 Service Worker 共用。
(function (root) {
  /**
   * 連續失敗計數：fail() 累計，達 limit 回傳 true（愛停）；succeed()／reset() 歸零。
   * @param {{limit?: number}} [options]
   */
  function createFailureBreaker(options) {
    const limit = (options && options.limit) || 3;
    let consecutive = 0;
    return {
      fail() {
        consecutive += 1;
        return consecutive >= limit;
      },
      succeed() {
        consecutive = 0;
      },
      reset() {
        consecutive = 0;
      },
      get count() {
        return consecutive;
      },
    };
  }

  /**
   * 有冷卻時間个斷路器（Service Worker 用）：連續失敗達 limit 就「開路」cooldownMs，
   * 這段時間 isOpen() 回 true，愛直接擋掉請求（毋打上游）；冷卻過了放一擺試探，成功就關路。
   * @param {{limit?: number, cooldownMs?: number, now?: () => number}} [options]
   */
  function createCooldownBreaker(options) {
    const limit = (options && options.limit) || 3;
    const cooldownMs = (options && options.cooldownMs) || 60000;
    const now = (options && options.now) || Date.now;
    let consecutive = 0;
    let openUntil = 0;
    return {
      isOpen() {
        return now() < openUntil;
      },
      fail() {
        consecutive += 1;
        if (consecutive >= limit) openUntil = now() + cooldownMs;
      },
      succeed() {
        consecutive = 0;
        openUntil = 0;
      },
    };
  }

  const api = { createFailureBreaker, createCooldownBreaker };
  root.AudioBreaker = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
