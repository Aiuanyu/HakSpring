function handleDomainMigration() {
  if (
    window.location.hostname !== 'aiuanyu.github.io' &&
    window.location.hostname !==
      'fix-migration-dark-theme.hakspring.pages.dev' &&
    window.location.hostname !==
      'feat-dark-theme-loading-over.hakspring.pages.dev' &&
    window.location.hostname !== 'fix-migration-page-scroll.hakspring.pages.dev'
  ) {
    return false;
  }

  // Create the overlay
  const overlay = document.createElement('div');
  overlay.id = 'migration-overlay'; // Add ID for styling
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100vw';
  overlay.style.height = '100vh';
  overlay.style.zIndex = '999999';
  overlay.style.display = 'flex';
  overlay.style.justifyContent = 'center';
  overlay.style.padding = '1.5em';
  overlay.style.boxSizing = 'border-box';

  const newHost = 'https://hakspring.pages.dev';
  const originalPath = window.location.pathname;
  let newPath = originalPath
    .replace(/^\/HakSpring/, '')
    .replace(/^\/index\.html/, '');
  if (newPath === '') newPath = '/';
  const newBaseUrl = newHost + newPath;

  // Define the HTML content for the overlay
  overlay.innerHTML = `
    <div class="migration-container">
      <img src="img/20250918-return.png" alt="Domain Migration" class="migration-image">
      <div class="migration-text-content">
        <h1>網域徙竇 lió！</h1>
        <p>為著提供還較穩定个服務，客源翠个網址既經徙竇吔。</p>
        <p>請撳下面个撳鈕，同你个進度、設定款起來，共下運過去。</p>
        <button id="migrationBtn">知哩！同吾進度行李款好，渡𠊎(ngǎi)去新竇！</button>
      </div>
    </div>
  `;

  // Append to the body
  document.body.appendChild(overlay);

  // Add the event listener
  const migrateBtn = document.getElementById('migrationBtn');
  if (migrateBtn) {
    migrateBtn.addEventListener('click', function () {
      const keysToMigrate = [
        'hakkaBookmarks',
        'dontShowInfoModalAgain',
        'lastSearchMode',
        'lastSearchDialect',
        'hideInfoModal',
      ];
      const migrationData = {};
      keysToMigrate.forEach(function (key) {
        let value = localStorage.getItem(key);
        if (value !== null) {
          // The "hakkaBookmarks" key contains a JSON string, which should be parsed before being re-encoded.
          if (key === 'hakkaBookmarks') {
            try {
              value = JSON.parse(value);
            } catch (e) {
              console.error(
                'Could not parse hakkaBookmarks from localStorage. Sending as raw string.',
                e,
              );
            }
          }
          migrationData[key] = value;
        }
      });

      let finalUrl = newBaseUrl;
      if (Object.keys(migrationData).length > 0) {
        try {
          const encodedData = btoa(
            unescape(encodeURIComponent(JSON.stringify(migrationData))),
          );
          const searchParams = new URLSearchParams(window.location.search);
          searchParams.set('migrateData', encodedData);
          finalUrl = newBaseUrl.split('?')[0] + '?' + searchParams.toString();
        } catch (e) {
          console.error('Could not process migration data:', e);
        }
      }

      window.location.href = finalUrl;
    });
  }

  // Signal that the app should not continue initializing
  return true;
}

// Agent Jules was here.
function isIOS() {
  // Using navigator.userAgent is more robust than the deprecated navigator.platform.
  // This regex covers iPhones, iPads, iPods, and their simulators.
  const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent);

  // Also, iPad on iOS 13+ detection, which may report as a Mac.
  const isModernIPad =
    navigator.userAgent.includes('Mac') && 'ontouchend' in document;

  return isIOSDevice || isModernIPad;
}

function isFirefox() {
  return navigator.userAgent.toLowerCase().includes('firefox');
}

function adjustRubyFontSize(rubyElement) {
  if (!isFirefox()) return;
  const tdElement = rubyElement.closest('td');
  if (!tdElement) return;
  rubyElement.style.fontSize = '';
  const forcedStyle = window.getComputedStyle(rubyElement);
  const currentFontSize = parseFloat(forcedStyle.fontSize);
  const rubyWidth = rubyElement.scrollWidth;
  const computedTdStyle = window.getComputedStyle(tdElement);
  const isCardMode = computedTdStyle.display === 'block';
  let availableWidth;
  const buffer = 5;
  if (isCardMode) {
    const paddingLeftPx = parseFloat(computedTdStyle.paddingLeft);
    availableWidth = tdElement.clientWidth - paddingLeftPx - buffer * 3;
  } else {
    availableWidth = tdElement.clientWidth - buffer;
  }
  if (rubyWidth > availableWidth) {
    let newSize = Math.floor((currentFontSize * availableWidth) / rubyWidth);
    const minSize = 10;
    newSize = Math.max(newSize, minSize);
    if (newSize < currentFontSize) {
      if (rubyElement.style.fontSize !== `${newSize}px`) {
        rubyElement.style.fontSize = `${newSize}px`;
      }
    } else {
      if (rubyElement.style.fontSize) {
        rubyElement.style.fontSize = '';
      }
    }
  } else {
    if (rubyElement.style.fontSize) {
      rubyElement.style.fontSize = '';
    }
  }
}

function toggleSearchAccordion(clickedButton, line) {
  const parentRow = clickedButton.closest('tr');
  const wasOpen = parentRow.classList.contains('accordion-parent');

  // Always close any currently open accordion first
  document.querySelectorAll('.accordion-parent').forEach((row) => {
    row.classList.remove('accordion-parent');
    const button = row.querySelector('.crossDialectBtn i');
    if (button) button.className = 'fas fa-plus-circle';
  });
  document.querySelectorAll('.accordion-row').forEach((row) => row.remove());

  // If the one we clicked was already open, we just want to close it, so we're done.
  if (wasOpen) {
    return;
  }

  // Pause autoplay if it's running
  const stopButton = document.getElementById('stopBtn');
  if (isPlaying && stopButton) {
    stopButton.click();
  }

  parentRow.classList.add('accordion-parent');
  clickedButton.querySelector('i').className = 'fas fa-minus-circle';

  const lineId = line.編號;
  const { sourceName } = line; // e.g., "四中高" or "教典四"

  if (!sourceName || sourceName.length < 2) {
    console.error('Invalid sourceName for search accordion:', sourceName);
    return;
  }

  let 腔 = '';
  let 級 = '';
  let originalDialectInfo = {};
  const isGip = line.sourceType === 'gip' || sourceName.startsWith('教典');

  if (isGip) {
     腔 = sourceName.replace('教典', '');
     const accentObj = ACCENT_INFO[腔] || { 腔名: '' };
     originalDialectInfo = { 腔: 腔, 腔名: accentObj.腔名, 級: '', fullLvlName: accentObj.腔名 + '教典' };
  } else {
     腔 = sourceName.substring(0, 1);
     級 = sourceName.substring(1);
     originalDialectInfo = getDialectInfo(腔, 級);
  }

  let lastAppendedRow = parentRow;
  let createdRows = [];

  const crossDialectResults = findCrossDialectRows(line, originalDialectInfo, isGip);

  crossDialectResults.forEach(({ foundItem, itemDialectInfo }) => {
    const newRow = createComparisonRow(foundItem, itemDialectInfo, isGip);
    newRow.classList.add('accordion-row');
    lastAppendedRow.after(newRow);
    lastAppendedRow = newRow;
    createdRows.push(newRow);
  });

  if (createdRows.length > 0) {
    createdRows[createdRows.length - 1].classList.add('accordion-row-last');
  }

  g_isAccordionScrolling = true;
  try {
    if (isFirefox()) {
      const table = parentRow.closest('table');
      if (table) {
        adjustAllRubyFontSizes(table);
      }
    }
    parentRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (e) {
    console.error('Error during search accordion toggle:', e);
  } finally {
    setTimeout(() => {
      g_isAccordionScrolling = false;
    }, 500);
  }
}

function adjustAllRubyFontSizes(containerElement) {
  if (!isFirefox()) return;
  const rubyElements = containerElement.querySelectorAll(
    'td[data-label="詞彙"] ruby',
  );
  rubyElements.forEach((rubyElement) => {
    rubyElement.style.fontSize = '';
    adjustRubyFontSize(rubyElement);
  });
}
const DATA_FILES_TO_CACHE = [
  // 認證詞彙
  'data/cert/113四基.json',
  'data/cert/113四初.json',
  'data/cert/113四中.json',
  'data/cert/113四中高.json',
  'data/cert/113四高.json',
  'data/cert/113海基.json',
  'data/cert/113海初.json',
  'data/cert/113海中.json',
  'data/cert/113海中高.json',
  'data/cert/113海高.json',
  'data/cert/113大基.json',
  'data/cert/113大初.json',
  'data/cert/113大中.json',
  'data/cert/113大中高.json',
  'data/cert/113大高.json',
  'data/cert/113平基.json',
  'data/cert/113平初.json',
  'data/cert/113平中.json',
  'data/cert/113平中高.json',
  'data/cert/113平高.json',
  'data/cert/113安基.json',
  'data/cert/113安初.json',
  'data/cert/113安中.json',
  'data/cert/113安中高.json',
  'data/cert/113安高.json',
  // 教典資料
  'data/gip/20250630-四.json',
  'data/gip/20250630-南.json',
  'data/gip/20250630-海.json',
  'data/gip/20250630-大.json',
  'data/gip/20250630-平.json',
  'data/gip/20250630-安.json',
  // 其他資料
  'tone_mapping.json',
  'reverse_tone_mapping.json',
  'sandhi_rules.json',
  'NAmedias.json',
  'exclusions.json',
];

const DB_NAME = 'HakkaDataDB';
const DB_VERSION = 1;
const STORE_FILES = 'data_files';
const STORE_VERSION = 'version_info';

// --- 全域變數 ---
let isCrossCategoryPlaying = false; // 標記是否正在進行跨類別連續播放
let categoryList = []; // 儲存目前腔調級別的類別列表
let currentCategoryIndex = -1; // 儲存目前播放類別的索引
let currentAudio = null; // 將 currentAudio 移到全域，以便在 playAudio 和其他地方共享
let isPlaying = false; // 播放狀態也移到全域
let isPaused = false; // 暫停狀態也移到全域
let currentAudioIndex = 0; // 當前音檔索引也移到全域
let finishedTableName = null; // 暫存剛播放完畢的表格名稱 (用於書籤替換)
let finishedCat = null; // 暫存剛播放完畢的類別名稱 (用於書籤替換)
let loadedViaUrlParams = false; // <-- 新增：標記是否透過 URL 參數載入
let activeSelectionPopup = false; // <-- 新增：標記選詞 popup 是否開啟
let currentActiveDialectLevelFullName = ''; // <-- 修改變數名：儲存目前頁面顯示的完整腔調級別全名
let currentActiveMainDialectName = ''; // <-- 新增：儲存目前頁面顯示的主要腔調名稱 (例如：四縣)
let lastAnchorElementForPopup = null; // <-- 修改：儲存 popup 定位的錨點元素
let lastRectForPopupPositioning = null; // <-- 新增：儲存 popup 定位的 DOMRect (主要分手機版)
let preprocessedDataCache = {};
let indexedDataCache = {}; // <-- 新增此索引快取物件
let mobileLookupButton = null; // <-- 新增：手機版查詞按鈕
let lastContextualDialectForMobile = null; // <-- 新增：手機版查詞按鈕个腔調脈絡
let lastSelectionRectForMobile = null; // <-- 新增：手機版最後選取範圍 (分按鈕點擊時用)
let currentDataVarName = ''; // Keep track of the active file var name
let isNavigatingViaCode = false; // <--- 在這裡新增這一行
let activeCategoryData = [];
let firstLoadedIndex = 0;
let lastLoadedIndex = 0;
let isLoadingMoreItems = false;
let lastCenteredRow = null;
let isRepositioning = false;
let g_isAccordionScrolling = false;
const ITEMS_PER_LOAD = 20;
let g_summary_minFontSize = 10;
let g_summary_breakThreshold = 16;
let g_summary_tightLineHeight = 1.1;

// --- 【新增】循環播放相關全域變數 ---
let isCategoryLooping = false; // 用於分類循環
let isSingleWordLooping = false; // 用於單詞循環
let singleLoopingAudio = {
  word: null,
  sentence: null,
  row: null,
  button: null,
}; // 儲存單詞循環的元素
let singleLoopAbortController = new AbortController(); // 用於中斷單詞循環
let g_mainPlaybackIndexBeforeLoop = null;

let g_audioElementsList = [];
let g_bookmarkButtonsList = [];
let g_currentDialectInfo = null;
let g_currentCategory = '';
let g_currentLevelData = []; // Store the full data for the current level
let audioAbortController = new AbortController();
let playbackSessionId = null; // <-- 【新增此行】
let g_currentSearchResults = [];

// --- Auto Bookmark Mode: WeakMap to track audio event handlers ---
const audioPlayHandlers = new WeakMap();
// --- End of Auto Bookmark Mode ---

const LEVEL_TO_EXCEPTION_FILE = {
  基: '基例外音檔',
  初: '初例外音檔',
  中: '中例外音檔',
  中高: '中高例外音檔',
  高: '高例外音檔',
};

const ACCENT_INFO = {
  四: { 檔腔: 'si', 腔名: '四縣' },
  南: { 檔腔: 'na', 腔名: '南四縣' },
  海: { 檔腔: 'ha', 腔名: '海陸' },
  大: { 檔腔: 'da', 腔名: '大埔' },
  平: { 檔腔: 'rh', 腔名: '饒平' },
  安: { 檔腔: 'zh', 腔名: '詔安' },
};

const LEVEL_INFO = {
  基: { 目錄級: '5', 目錄另級: '1', 檔級: '', 級名: '基礎級' },
  初: { 目錄級: '1', 檔級: '', 級名: '初級' },
  中: { 目錄級: '2', 檔級: '1', 級名: '中級' },
  中高: { 目錄級: '3', 檔級: '2', 級名: '中高級' },
  高: { 目錄級: '4', 檔級: '3', 級名: '高級' },
};

/**
 * [新增] 針對 elearning.hakka.gov.tw 的音檔網址套用 Proxy 轉導，
 * 以解決 Cross-Origin-Resource-Policy (CORP) 封鎖問題。
 * @param {string} url - 原始音檔網址。
 * @returns {string} 套用 Proxy 後的網址，或原網址。
 */
function applyAudioProxy(url) {
  if (!url) return url;

  const isHakkaGov = url.startsWith('https://elearning.hakka.gov.tw/');
  const isLocalhost = /^https?:\/\/localhost([:/]|$)/.test(url);

  if (!isHakkaGov && !isLocalhost) {
    return url;
  }
  
  // 預設的 proxy 路徑，適用於上線環境或 wrangler 開發環境
  let proxyPath = '/audio-proxy?url=';

  // 若在本機 (localhost/127.0.0.1) 且非 wrangler 預設 port (8788)，
  // 則強制導向正式環境的 Proxy API，解決 local Apache 找不到 Endpoint 的問題。
  if ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && window.location.port !== '8788') {
    proxyPath = 'https://hakspring.pages.dev/audio-proxy?url=';
  }

  return proxyPath + encodeURIComponent(url);
}

function getDialectInfo(腔, 級) {
  const selected例外音檔 = window[LEVEL_TO_EXCEPTION_FILE[級]] || [];
  const { 檔腔, 腔名 } = ACCENT_INFO[腔] || { 檔腔: '', 腔名: '' };
  const { 目錄級, 目錄另級, 檔級, 級名 } = LEVEL_INFO[級] || {
    目錄級: '',
    目錄另級: undefined,
    檔級: '',
    級名: '',
  };

  if (!腔名 || !級名) {
    console.warn(`Could not get full dialect info for 腔: ${腔}, 級: ${級}`);
  }

  return {
    腔,
    級,
    例外音檔: selected例外音檔,
    fullLvlName: 腔名 + 級名,
    generalMediaYr: '112',
    目錄級,
    目錄另級,
    檔腔,
    檔級,
    腔名,
    級名,
  };
}

// --- Media Session API Integration ---

/**
 * Updates the Media Session API with the current track's metadata and sets up action handlers.
 * @param {object} track - The current track object from the playlist.
 * @param {object} dialectInfo - Information about the current dialect and level.
 */
function updateMediaSession(track, dialectInfo, isSingleLoop = false) {
  if (!('mediaSession' in navigator)) {
    return;
  }

  // Clear metadata and handlers if playback is finished (track is null)
  if (!track) {
    navigator.mediaSession.metadata = null;
    navigator.mediaSession.setActionHandler('play', null);
    navigator.mediaSession.setActionHandler('pause', null);
    navigator.mediaSession.setActionHandler('nexttrack', null);
    navigator.mediaSession.setActionHandler('previoustrack', null);
    navigator.mediaSession.playbackState = 'none';
    return;
  }

  // --- New: Calculate overall progress ---
  const overallIndex = g_currentLevelData.findIndex(
    (item) => item.編號 === track.編號,
  );
  const overallPercentage =
    ((overallIndex + 1) / g_currentLevelData.length) * 100;

  let title = `${track.客家語} (${track.編號})`;
  if (isSingleLoop) {
    title = `[反覆] ${title}`;
  }

  let artist = `${dialectInfo.fullLvlName} - ${g_currentCategory}`;
  if (isCategoryLooping) {
    // Read global state for category loop
    artist = `[反覆] ${artist}`;
  }
  artist = `${artist} (${overallPercentage.toFixed(1)}%)`;

  navigator.mediaSession.metadata = new MediaMetadata({
    title: title,
    artist: artist,
    album: '客源翠 HakSpring',
    artwork: [
      { src: '宣傳圖.png', type: 'image/png' },
      {
        src: 'android-chrome-512x512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: 'android-chrome-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
    ],
  });

  // Action Handlers
  const playNextItem = () =>
    playAudio(currentAudioIndex + 1, playbackSessionId);
  const playPreviousItem = () =>
    playAudio(currentAudioIndex - 1, playbackSessionId);

  navigator.mediaSession.setActionHandler('play', () => {
    const pauseResumeButton = document.getElementById('pauseResumeBtn');
    if (pauseResumeButton && isPaused) {
      pauseResumeButton.click();
    }
    navigator.mediaSession.playbackState = 'playing';
  });

  navigator.mediaSession.setActionHandler('pause', () => {
    const pauseResumeButton = document.getElementById('pauseResumeBtn');
    if (pauseResumeButton && !isPaused) {
      pauseResumeButton.click();
    }
    navigator.mediaSession.playbackState = 'paused';
  });

  navigator.mediaSession.setActionHandler('nexttrack', playNextItem);
  navigator.mediaSession.setActionHandler('previoustrack', playPreviousItem);
}

// --- End of Media Session API Integration ---

/**
 * 將事件傳送分 Google Analytics。
 * @param {string} action - 事件動作 (例如 'open', 'click')。
 * @param {string} category - 事件類別 (例如 'Romaine', 'Playback')。
 * @param {string} label - 事件標籤 (例如 'open_container', 'start_segmentation')。
 */
function trackEvent(action, category, label) {
  // 檢查 gtag 函式係無係存在，避免在無載入 GA 个環境下出錯
  if (typeof gtag === 'function') {
    gtag('event', action, {
      event_category: category,
      event_label: label,
    });
    console.log(
      `GA Event Sent: { Action: ${action}, Category: ${category}, Label: ${label} }`,
    );
  } else {
    console.warn('gtag function not found. GA event not sent.');
  }
}

// --- IndexedDB Helper Functions (Improved Error Handling) ---

/**
 * 格式化愛顯示个標音字串，拿忒為著搜尋加个多餘空白。
 * @param {string} text - 從資料庫讀出來个「客語標音_顯示」欄位內容。
 * @returns {string} 格式化後个淨俐字串。
 */
function formatPhoneticForDisplay(text) {
  if (!text) return '';
  // 1. 拿忒全形括號【】（）前後个所有空白
  let result = text.replace(/\s*([【（】）])\s*/g, '$1');
  // 2. 處理半形括號 (：淨拿忒佢「後背」个空白
  result = result.replace(/\(\s+/g, '(');
  // 3. 處理半形括號 )：淨拿忒佢「頭前」个空白
  result = result.replace(/\s+\)/g, ')');
  // 4. 教典詞音開頭的「特」加上【】
  result = result.replace(/^特(?=\s*[a-zA-Z])/, '【特】');
  return result;
}

/**
 * 根據羅馬字拼音个分隔規則，準確計算音節數量。
 * @param {string} romanizationText - 包含羅馬字拼音个字串。
 * @returns {number} - 實際个音節數量。
 */
function countSyllables(romanizationText) {
  if (!romanizationText) return 0;
  // 這隻正規表示式直接對應 romanizer.js 內底个 tokenizeRomanization 函式
  const tokens =
    romanizationText.match(/[【】（）()\/]|[^【】（）()\/\s]+/g) || [];
  // 過濾掉所有淨係標點符號个 token，淨留下音節
  const syllables = tokens.filter((token) => !/^[【】（）()\/]$/.test(token));
  return syllables.length;
}

/**
 * 將可能包含補零的 rowId 標準化為無補零的字串版本，以便進行資料比對。
 * @param {string | number} rowId - 原始的 rowId 字串，例如 "60" 或 "060"。
 * @returns {string} 標準化後的字串，例如 "60"。
 */
function normalizeRowId(rowId) {
  if (rowId === null || rowId === undefined) return '';
  return String(parseInt(rowId, 10));
}

/**
 * 將 rowId 補零至三位數，以符合舊版書籤與 URL 格式。
 * @param {string|number} rowId - 原始的 rowId，例如 "60"。
 * @returns {string} 補零後的字串，例如 "060"。
 */
function padRowIdForLegacy(rowId) {
  return String(rowId).padStart(3, '0');
}

function isSourceMatchingDialect(source, dialect) {
  if (!source || !dialect) return false;
  if (dialect === '南四縣') {
    return (
      source.startsWith('南四縣') ||
      (source.startsWith('四縣') && !source.endsWith('教典'))
    );
  }
  return source.startsWith(dialect);
}

function findPronunciationsInAllDataAsync(searchText, callback) {
  console.log('findPronunciationsInAllDataAsync called with:', searchText);
  if (!searchText || searchText.trim().length === 0) {
    callback([]);
    return;
  }

  const normalizedSearchText = searchText.trim();
  let foundReadings = [];
  const uniqueEntries = new Set();
  const terms = Object.keys(indexedDataCache);
  let i = 0;
  const chunkSize = 500; // Process in chunks to avoid blocking

  function processChunk() {
    const end = Math.min(i + chunkSize, terms.length);
    for (; i < end; i++) {
      const term = terms[i];
      if (term.includes(normalizedSearchText)) {
        const isExact = term === normalizedSearchText;
        const readings = JSON.parse(JSON.stringify(indexedDataCache[term])); // 一擺 clone 好歸个陣列
        readings.forEach((reading) => {
          reading.isExactMatch = isExact;
          const entryKey = `${reading.pronunciation}|${reading.source}|${reading.originalTerm}`;
          if (!uniqueEntries.has(entryKey)) {
            foundReadings.push(reading);
            uniqueEntries.add(entryKey);
          }
        });
      }
    }

    if (i < terms.length) {
      setTimeout(processChunk, 0); // Schedule next chunk
    } else {
      console.log('findPronunciationsInAllDataAsync returned:', foundReadings);
      callback(foundReadings); // All done
    }
  }

  processChunk();
}

function findPronunciationsInAllData(searchText) {
  if (!searchText || searchText.trim().length === 0) return [];
  const normalizedSearchText = searchText.trim();
  let foundReadings = [];
  const uniqueEntries = new Set();
  if (indexedDataCache[normalizedSearchText]) {
    const exactMatches = JSON.parse(
      JSON.stringify(indexedDataCache[normalizedSearchText]),
    );
    exactMatches.forEach((reading) => {
      reading.isExactMatch = true;
      const entryKey = `${reading.pronunciation}|${reading.source}|${reading.originalTerm}`;
      if (!uniqueEntries.has(entryKey)) {
        foundReadings.push(reading);
        uniqueEntries.add(entryKey);
      }
    });
  }
  for (const term in indexedDataCache) {
    if (term.includes(normalizedSearchText) && term !== normalizedSearchText) {
      indexedDataCache[term].forEach((reading) => {
        const entryKey = `${reading.pronunciation}|${reading.source}|${reading.originalTerm}`;
        if (!uniqueEntries.has(entryKey)) {
          const partialMatchReading = {
            ...JSON.parse(JSON.stringify(reading)),
            isExactMatch: false,
          };
          foundReadings.push(partialMatchReading);
          uniqueEntries.add(entryKey);
        }
      });
    }
  }
  return foundReadings;
}

function constructWordAudioUrl(lineData, fullSourceName) {
  if (!fullSourceName) return null;
  const isGip = fullSourceName.startsWith('gip') || fullSourceName.includes('教典');
  const isCert = fullSourceName.startsWith('cert') || (!isGip && typeof getDialectInfo === 'function'); // Fallback

  if (isGip) {
    const audioFileName = lineData['詞目音檔名'];
    if (audioFileName && audioFileName.trim() !== '') {
      const finalName = audioFileName.endsWith('.mp3')
        ? audioFileName
        : `${audioFileName}.mp3`;
      return `https://hakkadict.moe.edu.tw/static/audio/${finalName}`;
    }
    return null;
  }
  
  if (isCert) {
    let sourceName = fullSourceName.replace(/^cert/, '');
    const 腔 = sourceName.substring(0, 1);
    const 級 = sourceName.substring(1);
    const dialectInfo = getDialectInfo(腔, 級);

    const missingAudioInfo =
      typeof getMissingAudioInfo === 'function'
        ? getMissingAudioInfo(fullSourceName, lineData.分類, lineData.編號)
        : null;

    let wordAudioActuallyMissing =
      missingAudioInfo && missingAudioInfo.word === false;

    if (wordAudioActuallyMissing) return null;

    let mediaYr = '112',
      pre112Insertion詞 = '',
      詞目錄級 = dialectInfo.目錄級,
      mediaNo = '';
    
    var no = lineData.編號.split('-');
    if (!no || no.length < 2) return null;
    
    let no_0 = no[0];
    if (no_0.length === 1 && !isNaN(parseInt(no_0))) no_0 = '0' + no_0;
    if (級 === '初') no_0 = '0' + no_0;
    
    let mediaNo_raw = no[1];
    if (mediaNo_raw.length < 2 && !isNaN(parseInt(mediaNo_raw)))
      mediaNo_raw = '0' + mediaNo_raw;
    if (mediaNo_raw.length < 3 && !isNaN(parseInt(mediaNo_raw)))
      mediaNo_raw = '0' + mediaNo_raw;
    mediaNo = mediaNo_raw;
    
    const index = dialectInfo.例外音檔.findIndex(
      ([編號]) => 編號 === lineData.編號,
    );
    if (index !== -1) {
      const matchedElement = dialectInfo.例外音檔[index];
      mediaYr = matchedElement[1] || mediaYr;
      mediaNo = matchedElement[2] || mediaNo;
      pre112Insertion詞 = 'w/';
      if (dialectInfo.目錄另級 !== undefined) {
        詞目錄級 = dialectInfo.目錄另級;
      }
    }
    
    const 詞目錄 = `${詞目錄級}/${dialectInfo.檔腔}/${pre112Insertion詞}${dialectInfo.檔級}${dialectInfo.檔腔}`;
    let audioSrc = `https://elearning.hakka.gov.tw/hakka/files/cert/vocabulary/${mediaYr}/${詞目錄}-${no_0}-${mediaNo}.mp3`;
    
    if (
      dialectInfo.fullLvlName === '海陸中高級' &&
      lineData.編號 === '4-261'
    ) {
      audioSrc =
        'https://elearning.hakka.gov.tw/hakka/files/dictionaries/3/hk0000014571/hk0000014571-1-2.mp3';
    }
    return audioSrc; // Do not apply proxy here, caller handles it
  }
  return null;
}

/**
 * Constructs the audio URL for the sentence audio of a specific word line.
 * @param {object} lineData - The word data object from the database.
 * @param {string} fullSourceName - The full source name (e.g. 'cert四基').
 * @returns {string|null} The audio URL, or null if missing.
 */
function constructSentenceAudioUrl(lineData, fullSourceName) {
  if (!fullSourceName || !fullSourceName.startsWith('cert')) return null;
  const sourceName = fullSourceName.replace(/^cert/, '');
  const 腔 = sourceName.substring(0, 1);
  const 級 = sourceName.substring(1);
  const dialectInfo = getDialectInfo(腔, 級);

  const missingAudioInfo =
    typeof getMissingAudioInfo === 'function'
      ? getMissingAudioInfo(fullSourceName, lineData.分類, lineData.編號)
      : null;

  let sentenceAudioActuallyMissing =
    (missingAudioInfo && missingAudioInfo.sentence === false) || 級 === '高';
  
  if (sentenceAudioActuallyMissing) return null;

  let mediaYr = '112',
    pre112Insertion句 = '',
    句目錄級 = dialectInfo.目錄級,
    mediaNo = '';
  
  var no = lineData.編號.split('-');
  if (!no || no.length < 2) return null;

  let no_0 = no[0];
  if (no_0 <= 9) no_0 = '0' + no_0;
  if (級 === '初') no_0 = '0' + no_0;
  
  let no_1 = no[1];
  if (no_1 <= 9) no_1 = '0' + no_1;
  if (no_1 <= 99) no_1 = '0' + no_1;
  mediaNo = no_1;
  
  const index = dialectInfo.例外音檔.findIndex(
    ([編號]) => 編號 === lineData.編號,
  );
  if (index !== -1) {
    const matchedElement = dialectInfo.例外音檔[index];
    mediaYr = matchedElement[1];
    mediaNo = matchedElement[2];
    pre112Insertion句 = 's/';
    if (dialectInfo.目錄另級 !== undefined) {
      句目錄級 = dialectInfo.目錄另級;
    }
  }
  const 句目錄 = `${句目錄級}/${dialectInfo.檔腔}/${pre112Insertion句}${dialectInfo.檔級}${dialectInfo.檔腔}`;
  return applyAudioProxy(`https://elearning.hakka.gov.tw/hakka/files/cert/vocabulary/${mediaYr}/${句目錄}-${no_0}-${mediaNo}s.mp3`);
}

function updatePopupPosition(popupEl, selectionRect) {
  if (!popupEl || !selectionRect) return;
  const initialDisplay = popupEl.style.display;
  popupEl.style.visibility = 'hidden';
  if (initialDisplay !== 'block') {
    popupEl.style.display = 'block';
  }
  const popupWidth = popupEl.offsetWidth;
  const popupHeight = popupEl.offsetHeight;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const scrollY = window.scrollY;
  const scrollX = window.scrollX;
  let popupTop = scrollY + selectionRect.bottom + 5;
  let popupLeft = scrollX + selectionRect.left;
  if (popupLeft + popupWidth > scrollX + viewportWidth - 10) {
    popupLeft = scrollX + viewportWidth - popupWidth - 10;
  }
  if (popupLeft < scrollX + 10) {
    popupLeft = scrollX + 10;
  }
  if (popupTop + popupHeight > scrollY + viewportHeight - 10) {
    let topAbove = scrollY + selectionRect.top - popupHeight - 5;
    if (topAbove > scrollY + 10) {
      popupTop = topAbove;
    }
  }
  if (popupTop < scrollY + 10) {
    popupTop = scrollY + 10;
  }
  popupEl.style.left = `${popupLeft}px`;
  popupEl.style.top = `${popupTop}px`;
  popupEl.style.visibility = 'visible';
}

/**
 * 統一「腔別字串 → 變調引擎腔碼」，避免各呼叫點各寫一份 if/else 而悄悄漂移
 * （曾因此漏接：海陸被寫死 'da'、遊戲忘記饒平）。
 * 接受三種輸入：完整腔名／來源字串（'大埔'、'海陸基'、'四縣教典'，用 includes 比對）、
 * 單一腔字（'大'/'海'/'四'/'南'/'平'/'安'）、遊戲資料變數前綴（含 '饒'）。
 * 註：'南四縣…' 因含子字串 '四縣' 亦歸 si。
 * @param {string} dialect
 * @returns {'da'|'ha'|'si'|'zh'|'rh'|null}
 */
function getDialectCode(dialect) {
  if (!dialect) return null;
  const s = String(dialect);
  if (s.includes('大埔') || s === '大') return 'da';
  if (s.includes('海陸') || s === '海') return 'ha';
  if (s.includes('四縣') || s === '四' || s === '南') return 'si';
  if (s.includes('詔安') || s === '安') return 'zh';
  if (s.includes('饒平') || s === '平' || s === '饒') return 'rh';
  return null;
}

function classifyTone(syllable, dialectCode) {
  // 順帶檢查 vowel_map 存在：本函式已改走 NFD 拆調號、不再直接用 vowel_map，
  // 但它與 dialect_reverse_map 同在 reverse_tone_mapping.json，故拿它當「反查表資料已載入」的存在性檢查。
  if (!window.reverseToneMappingData || !window.reverseToneMappingData.dialect_reverse_map || !window.reverseToneMappingData.vowel_map) {
    return null;
  }
  // -b/-d 結尾是入聲；-g 結尾但前面是 n（即 -ng）是鼻音韻尾，不是入聲
  const hasStop = /b$|d$/.test(syllable) || (/g$/.test(syllable) && !syllable.endsWith('ng'));
  // 捨棄逐字元 vowel_map 比對，改用 NFD 拆解提取調號
  // 支援預先組合字元（如 á）以及獨立注音符號（如 ˊ）
  // 註：下面 .replace 非全域、只換第一個調號——呼叫端一律傳「單一音節」，每音節至多一個調號故安全；
  //     若日後改成傳多音節字串，須改成 /g 全域替換。
  let nfdSyllable = syllable.normalize('NFD')
    .replace('ˊ', '\u0301')
    .replace('ˋ', '\u0300')
    .replace('ˇ', '\u030C')
    .replace('ˆ', '\u0302')
    .replace(/¯|⁺|\+/, '\u0304');

  // Hakka Pinyin 調號：\u0301 (ˊ), \u0300 (ˋ), \u030C (ˇ), \u0302 (ˆ), \u0304 (¯)
  const toneMatch = nfdSyllable.match(/[\u0301\u0300\u030C\u0302\u0304]/);
  
  let aForm = 'a';
  if (toneMatch) {
    aForm = ('a' + toneMatch[0]).normalize('NFC');
  }

  let key = aForm + (hasStop ? 'd' : '');
  const map = window.reverseToneMappingData.dialect_reverse_map[dialectCode];
  if (!map) return null;
  return map[key] || null;
}

function getSandhiHtml(htmlContent, dialectCode) {
  // 資料陷阱防護：把 GIP 資料裡个漢字標記（又讀、俗音、小稱變調讀…）
  // 包成【】，讓 tokenizer 視為阻斷邊界，sandhi 毋會跨越這兜標記。
  const PHONETIC_MARKERS = /(?:又(?:俗音|讀|音)|俗音|小稱變調讀(?:本調為)?|特殊音|合音讀?|後字變調讀?|本調為|詞目刪除)/g;
  htmlContent = htmlContent.replace(PHONETIC_MARKERS, '【$&】');

  const BLOCKING_PUNCTUATION = '()（）【】';
  const SKIPPABLE_PUNCTUATION = '\\s、';
  const ALL_PUNCTUATION_CHARS = SKIPPABLE_PUNCTUATION + BLOCKING_PUNCTUATION;

  const TOKENIZER_REGEX = new RegExp(
    `[^<>` +
      ALL_PUNCTUATION_CHARS +
      `]+|[${SKIPPABLE_PUNCTUATION}]+|[${BLOCKING_PUNCTUATION}]+`,
    'g',
  );
  const SKIPPABLE_REGEX = new RegExp(`^[${SKIPPABLE_PUNCTUATION}]+$`);
  const BLOCKING_REGEX = new RegExp(`^[${BLOCKING_PUNCTUATION}]+$`);

  const sandhiRubyRegex =
    /<ruby class="sandhi-t\d+"[^>]*>.*?<\/ruby>/g;
  let preliminaryTokens = [];
  let lastIndex = 0;

  htmlContent.replace(sandhiRubyRegex, (match, offset) => {
    if (offset > lastIndex) {
      preliminaryTokens.push(htmlContent.substring(lastIndex, offset));
    }
    preliminaryTokens.push(match);
    lastIndex = offset + match.length;
    return match;
  });
  if (lastIndex < htmlContent.length) {
    preliminaryTokens.push(htmlContent.substring(lastIndex));
  }

  const tokens = preliminaryTokens
    .flatMap((token) => {
      if (token.startsWith('<ruby class="sandhi-')) {
        return [token];
      }
      return token.match(TOKENIZER_REGEX) || [];
    })
    .filter((t) => t && t.length > 0);

  let modifiedTokens = [];
  let hasActualModification = false;

  const applySandhiRule = (variant, next) => {
    let newTone = null;

    if (window.sandhiRulesData && window.sandhiRulesData[dialectCode]) {
      const frontTone = classifyTone(variant, dialectCode);
      const rule = window.sandhiRulesData[dialectCode][frontTone];
      if (rule) {
        if (rule.always) {
          newTone = rule.always;
        } else if (rule.when) {
          const nextTone = classifyTone(next, dialectCode);
          newTone = rule.when[nextTone] || rule.else || null;
        } else {
          newTone = rule.else || null;
        }
      }
    }

    if (newTone) {
      let rubyClass = `sandhi-t${newTone}`;
      let rubyElement = document.createElement('ruby');
      rubyElement.className = rubyClass;
      rubyElement.textContent = variant;
      let rtInnerElement = document.createElement('rt');
      rtInnerElement.textContent = newTone;
      rubyElement.appendChild(rtInnerElement);
      return rubyElement.outerHTML;
    }
    return variant;
  };

  let inBracket = false;
  for (let i = 0; i < tokens.length; i++) {
    let currentToken = tokens[i];

    if (currentToken.startsWith('<ruby class="sandhi-')) {
      modifiedTokens.push(currentToken);
      continue;
    }

    if (BLOCKING_REGEX.test(currentToken)) {
      if (currentToken.includes('【')) {
        inBracket = true;
      } else if (currentToken.includes('】')) {
        inBracket = false;
      }
      modifiedTokens.push(currentToken);
      continue;
    }

    if (SKIPPABLE_REGEX.test(currentToken)) {
      modifiedTokens.push(currentToken);
      continue;
    }

    // 僅饒平（rh）跳過【】內變調：【】裡是卓蘭／桃園異腔音，聲調系統與新竹不同，
    // 官方也沒給那兩地的變調規則，套新竹規則會出錯，故整段保留本調。
    // 其他腔的【】（）內部仍照常連讀變調（20260717 裁示），不要一起擋。
    if (inBracket && dialectCode === 'rh') {
      modifiedTokens.push(currentToken);
      continue;
    }

    let nextWordToken = '';
    for (let j = i + 1; j < tokens.length; j++) {
      if (
        tokens[j].startsWith('<ruby class="sandhi-') ||
        SKIPPABLE_REGEX.test(tokens[j])
      ) {
        continue;
      }
      if (BLOCKING_REGEX.test(tokens[j])) {
        nextWordToken = '';
        break;
      }
      nextWordToken = tokens[j];
      break;
    }

    if (currentToken.length === 0 || !nextWordToken) {
      modifiedTokens.push(currentToken);
      continue;
    }

    let finalToken;
    if (currentToken.includes('/')) {
      const variants = currentToken.split('/');
      const processedVariants = variants.map((variant) =>
        applySandhiRule(variant, nextWordToken),
      );
      finalToken = processedVariants.join('/');
    } else {
      finalToken = applySandhiRule(currentToken, nextWordToken);
    }

    if (finalToken !== currentToken) {
      hasActualModification = true;
    }
    modifiedTokens.push(finalToken);
  }

  if (hasActualModification) {
    return modifiedTokens.join('');
  } else {
    return htmlContent;
  }
}

/**
 * Checks for and applies tone sandhi for a given pronunciation and dialect.
 * Currently supports Dapu and Hailu dialects.
 * @param {string} pronunciation - The original pronunciation string.
 * @param {string} dialect - The dialect name (e.g., '大埔教典', '海陸基').
 * @returns {object|null} An object with original and sandhi versions, or null if no change.
 */
function getSandhiPronunciation(pronunciation, dialect) {
  if (!dialect) return null;

  const dialectCode = getDialectCode(dialect);

  if (dialectCode) {
    const sandhiPron = getSandhiHtml(pronunciation, dialectCode);
    // Return an object only if a change was actually made.
    if (sandhiPron !== pronunciation) {
      return {
        original: pronunciation,
        sandhi: sandhiPron,
      };
    }
  }
  
  // If no sandhi applies or it's not the right dialect, return null.
  return null;
}

function applySandhiToGenerated() {
  const rtElements = document.querySelectorAll('#generated rt');
  rtElements.forEach((rt) => {
    const originalHtml = rt.innerHTML;
    // Currently hardcoded to 'da' since this function was specifically for Dapu
    const newHtml = getSandhiHtml(originalHtml, 'da');
    if (originalHtml !== newHtml) {
      rt.innerHTML = newHtml;
    }
  });
}

function showPronunciationPopup(
  selectedText,
  readings,
  anchorElementOrRect,
  callbackOnSelect,
  contextualDialect = null,
) {
  const popupEl = document.getElementById('selectionPopup');
  const contentEl = document.getElementById('selectionPopupContent');
  const backdropEl = document.getElementById('selectionPopupBackdrop');
  const showOtherAccentsToggle = document.getElementById(
    'showOtherAccentsToggle',
  );
  const popupTitleElement = document.getElementById('selectionPopupTitle');

  if (
    !popupEl ||
    !contentEl ||
    !backdropEl ||
    !showOtherAccentsToggle ||
    !popupTitleElement
  )
    return;

  lastAnchorElementForPopup = null;
  lastRectForPopupPositioning = null;
  let initialRect;

  if (anchorElementOrRect instanceof HTMLElement) {
    lastAnchorElementForPopup = anchorElementOrRect;
    initialRect = lastAnchorElementForPopup.getBoundingClientRect();
  } else if (anchorElementOrRect instanceof DOMRect) {
    lastRectForPopupPositioning = anchorElementOrRect;
    initialRect = anchorElementOrRect;
  } else {
    popupEl.style.left = '50%';
    popupEl.style.top = '50%';
    popupEl.style.transform = 'translate(-50%, -50%)';
  }

  popupTitleElement.textContent = `尋「${selectedText}」个讀音`;
  showOtherAccentsToggle.checked = false;

  // Show loading state immediately
  contentEl.innerHTML = '<p>當在尋讀音...</p>';
  popupEl.style.display = 'block';
  backdropEl.style.display = 'block';
  activeSelectionPopup = true;

  if (initialRect) {
    updatePopupPosition(popupEl, initialRect);
  }
  popupEl.focus();

  // Defer the actual data processing
  findPronunciationsInAllDataAsync(selectedText, (allReadings) => {
    console.log(
      'renderPronunciationList called with allReadings:',
      allReadings,
    );
    function renderPronunciationList() {
      contentEl.innerHTML = '';
      const showAllAccents = showOtherAccentsToggle.checked;
      let currentDialect =
        contextualDialect || currentActiveMainDialectName || '四縣';
      let displayReadings = [...allReadings];

      if (!showAllAccents) {
        displayReadings = displayReadings.filter((r) =>
          isSourceMatchingDialect(r.source, currentDialect),
        );
      }

      displayReadings.sort((a, b) => {
        if (a.isExactMatch !== b.isExactMatch) return a.isExactMatch ? -1 : 1;
        const aSyllables = countSyllables(a.pronunciation);
        const bSyllables = countSyllables(b.pronunciation);
        if (aSyllables !== bSyllables) return aSyllables - bSyllables;
        if (a.originalTerm !== b.originalTerm)
          return a.originalTerm.localeCompare(b.originalTerm);
        return a.source.localeCompare(b.source);
      });

      if (displayReadings.length > 0) {
        const accordionContainer = document.createElement('div');
        accordionContainer.className = 'accordion-container';
        displayReadings.forEach((reading) => {
          const itemDiv = document.createElement('div');
          itemDiv.className = 'accordion-item';
          const headerBtn = document.createElement('button');
          headerBtn.className = 'accordion-header';
          const sandhiResult = getSandhiPronunciation(
            reading.pronunciation,
            reading.source,
          );
          let headerText = sandhiResult
            ? `<span class="pronunciation-text">${sandhiResult.sandhi}</span>`
            : `<span class="pronunciation-text">${reading.pronunciation}</span>`;
          if (!reading.isExactMatch) {
            headerText += ` (詞目: ${reading.originalTerm})`;
          }
          let audioUrl = reading.audioDetails
            ? constructWordAudioUrl(
                reading.audioDetails.lineData,
                reading.audioDetails.fullSourceName,
              )
            : null;
          if (audioUrl) audioUrl = applyAudioProxy(audioUrl);
          let audioElementHTML = audioUrl
            ? `<button class="popup-audio-play-btn" data-audio-src="${audioUrl}" title="播放讀音" style="background:none; border:none; color:inherit; font-size:1.1em; padding:0 5px; margin-left:8px; vertical-align:middle; cursor:pointer;"><i class="fas fa-volume-up"></i></button>`
            : '';
          let substituteButtonHTML =
            typeof callbackOnSelect === 'function'
              ? `<button class="popup-substitute-btn" title="選用這个讀音"><i class="fas fa-arrow-up-from-bracket"></i></button>`
              : '';

          headerBtn.innerHTML = `<div class="accordion-header-content">${headerText}<span class="pronunciation-source">(${reading.source})</span></div><div class="accordion-header-controls">${audioElementHTML}${substituteButtonHTML}<span class="indicator">+</span></div>`;
          const panelDiv = document.createElement('div');
          panelDiv.className = 'accordion-panel';
          panelDiv.innerHTML = `<p><strong>華語詞義：</strong> ${(reading.mandarinMeaning || '無資料').replace(/"/g, '')}</p>`;

          itemDiv.appendChild(headerBtn);
          itemDiv.appendChild(panelDiv);
          accordionContainer.appendChild(itemDiv);

          const playButton = headerBtn.querySelector('.popup-audio-play-btn');
          if (playButton) {
            playButton.addEventListener('click', (e) => {
              e.stopPropagation(); // 保持 stopPropagation 以避免 headerBtn 也響應
              const header = playButton.closest('.accordion-header');
              const panel = header ? header.nextElementSibling : null;
              if (header && panel && !header.classList.contains('active')) {
                header.classList.add('active');
                const indicator = header.querySelector('.indicator');
                panel.style.maxHeight = panel.scrollHeight + 'px';
                if (indicator) indicator.textContent = '−';
              }
              const audioSrc = playButton.dataset.audioSrc;
              if (audioSrc) {
                if (window.currentPopupAudio) {
                  window.currentPopupAudio.pause();
                }

                const audio = new Audio(audioSrc);
                window.currentPopupAudio = audio;

                const icon = playButton.querySelector('i');
                const originalIconClass = icon
                  ? icon.className
                  : 'fas fa-volume-up';

                if (icon) icon.className = 'fas fa-spinner fa-spin'; // Loading spinner

                audio
                  .play()
                  .then(() => {
                    if (icon) icon.className = originalIconClass; // Reset on play
                  })
                  .catch((err) => {
                    console.error('Audio playback error:', err);
                    if (icon) icon.className = 'fas fa-exclamation-circle'; // Error icon
                    setTimeout(() => {
                      if (icon) icon.className = originalIconClass;
                    }, 2000);
                  });

                audio.addEventListener('ended', () => {
                  if (icon) icon.className = originalIconClass;
                });
              }
            });
          }
          const substituteBtn = headerBtn.querySelector(
            '.popup-substitute-btn',
          );
          if (substituteBtn) {
            substituteBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              if (typeof callbackOnSelect === 'function') {
                callbackOnSelect(anchorElementOrRect, reading.pronunciation);
                hidePronunciationPopup(popupEl, backdropEl);
              }
            });
          }
          headerBtn.addEventListener('click', () => {
            headerBtn.classList.toggle('active');
            const indicator = headerBtn.querySelector('.indicator');
            if (panelDiv.style.maxHeight) {
              panelDiv.style.maxHeight = null;
              if (indicator) indicator.textContent = '+';
            } else {
              panelDiv.style.maxHeight = panelDiv.scrollHeight + 'px';
              if (indicator) indicator.textContent = '−';
            }
          });
        });
        contentEl.appendChild(accordionContainer);
      } else {
        const dialectName =
          currentDialect === '四縣' ? '四縣或南四縣' : currentDialect;
        contentEl.innerHTML =
          allReadings.length === 0
            ? `<p class="popup-not-found">在所有腔調中都尋無「${selectedText}」个讀音。<br>請試看啊重新斷詞，或者縮短尋个字詞。</p>`
            : `<p class="popup-not-found">在「${dialectName}」腔頭尋無讀音。<br>請試看啊打開「顯示其他腔頭」。</p>`;
      }
    }

    renderPronunciationList(); // Initial render
    showOtherAccentsToggle.onchange = renderPronunciationList; // Re-render on toggle change
  });

  const romanizerBtn = document.getElementById('selectionPopupRomanizerBtn');
  if (romanizerBtn) {
    romanizerBtn.onclick = (e) => {
      e.stopPropagation();
      const mainRomanizerBtn = document.getElementById('showRomanizerBtn');
      const romanizerInput = document.getElementById('romanizer-input');
      if (mainRomanizerBtn && romanizerInput) {
        if (contextualDialect) {
          // The romanizer uses this global variable to set its initial dialect.
          currentActiveMainDialectName = contextualDialect;
          console.log(
            `Setting Romanizer dialect context to: ${contextualDialect}`,
          );
        }
        romanizerInput.value = selectedText;
        mainRomanizerBtn.click();
        hidePronunciationPopup(popupEl, backdropEl);
      }
    };
  }
}

function hidePronunciationPopup(popupEl, backdropEl) {
  if (popupEl) popupEl.style.transform = '';
  if (popupEl) popupEl.style.display = 'none';
  if (backdropEl) backdropEl.style.display = 'none';
  lastAnchorElementForPopup = null;
  lastRectForPopupPositioning = null;
  activeSelectionPopup = false;
  if (isMobileDevice()) {
    hideMobileLookupButton();
  }
}

function handleTextSelectionInSentence(
  event,
  popupEl,
  contentEl,
  backdropEl,
  generatedArea,
) {
  setTimeout(() => {
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const selectedText = selection.toString().trim();
      if (selectedText.length === 0) {
        return;
      }
      const range = selection.getRangeAt(0);
      const commonAncestor = range.commonAncestorContainer;

      const sentenceElement = (
        commonAncestor.nodeType === Node.ELEMENT_NODE
          ? commonAncestor
          : commonAncestor.parentElement
      ).closest('.sentence');
      if (!sentenceElement) {
        return;
      }

      const trElement = sentenceElement.closest('tr');
      if (!trElement || !generatedArea.contains(trElement)) {
        return;
      }
      let contextualDialect = null;
      if (trElement.classList.contains('accordion-row')) {
        const dialectClass = Array.from(trElement.classList).find((c) =>
          ['四縣', '海陸', '大埔', '饒平', '詔安'].includes(c),
        );
        if (dialectClass) {
          contextualDialect = dialectClass;
        }
      } else if (trElement.closest('#category-table')) {
        if (g_currentDialectInfo && g_currentDialectInfo.腔名) {
          contextualDialect = g_currentDialectInfo.腔名;
        }
      }
      const rect = range.getBoundingClientRect();
      showPronunciationPopup(selectedText, null, rect, null, contextualDialect);
    }
  }, 0);
}

function normalizePhonetics(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[áàăâāǎ]/g, 'a')
    .replace(/[éèĕêēě]/g, 'e')
    .replace(/[íìĭîīǐ]/g, 'i')
    .replace(/[óòŏôōǒ]/g, 'o')
    .replace(/[úùŭûūǔ]/g, 'u')
    .replace(/[ńňǹ]/g, 'n')
    .replace(/\d+/g, '');
}

function isRomanizedHakka(text) {
  const hasChinese = /[\u4e00-\u9fa5]/.test(text);
  if (hasChinese) {
    return false;
  }
  const isRoman = /^[a-zA-Z0-9áàăâāǎéèĕêēěíìĭîīǐóòŏôōǒúùŭûūǔńňǹ\s\-\']+$/.test(
    text,
  );
  if (!isRoman) {
    return false;
  }
  const hasLetters = /[a-zA-Z]/.test(text);
  if (!hasLetters) {
    return false;
  }
  return true;
}

function debounce(func, wait, immediate) {
  let timeout;
  return function () {
    const context = this,
      args = arguments;
    const later = function () {
      timeout = null;
      if (!immediate) func.apply(context, args);
    };
    const callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    if (callNow) func.apply(context, args);
  };
}

function isMobileDevice() {
  // Standard mobile user agent check
  const isLegacyMobile =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent,
    );

  // iPad on iOS 13+ may report as a Mac. We can detect it by checking for touch capabilities.
  const isModernIPad =
    navigator.userAgent.includes('Mac') && 'ontouchend' in document;

  return isLegacyMobile || isModernIPad;
}

function createMobileLookupButton(popupEl, contentEl, backdropEl) {
  if (mobileLookupButton) return;
  mobileLookupButton = document.createElement('button');
  mobileLookupButton.id = 'mobileLookupBtn';
  mobileLookupButton.innerHTML = '尋讀音 <i class="fas fa-search"></i>';
  mobileLookupButton.style.display = 'none';
  document.body.appendChild(mobileLookupButton);

  const handleLookup = () => {
    const selection = window.getSelection();
    if (
      selection &&
      selection.toString().trim().length > 0 &&
      lastSelectionRectForMobile
    ) {
      const selectedText = selection.toString().trim();
      if (selectedText.length > 0) {
        showPronunciationPopup(
          selectedText,
          null,
          lastSelectionRectForMobile,
          null,
          lastContextualDialectForMobile,
        );
        hideMobileLookupButton();
      }
    } else {
      hideMobileLookupButton();
    }
  };

  if (isIOS()) {
    // For iOS, `touchend` is more reliable than `click` for dynamically added elements.
    // We also prevent default on `touchstart` to avoid issues like double-tap-to-zoom
    // and to make the interaction feel more responsive.
    mobileLookupButton.addEventListener('touchstart', (e) => {
      e.preventDefault();
    });
    mobileLookupButton.addEventListener('touchend', handleLookup);
  } else {
    // For other devices, `click` works just fine.
    mobileLookupButton.addEventListener('click', handleLookup);
  }
}

function showMobileLookupButton(selectionRect) {
  if (!mobileLookupButton) return;
  lastSelectionRectForMobile = selectionRect;
  mobileLookupButton.style.visibility = 'hidden';
  mobileLookupButton.style.display = 'block';
  const btnWidth = mobileLookupButton.offsetWidth;
  const btnHeight = mobileLookupButton.offsetHeight;
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  const margin = 3;
  let btnTop = scrollY + selectionRect.bottom + margin;
  let btnLeft = scrollX + selectionRect.right - btnWidth;
  if (selectionRect.width < btnWidth) {
    btnLeft = scrollX + selectionRect.left;
  }
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const edgeMargin = 5;
  if (btnLeft + btnWidth > scrollX + viewportWidth - edgeMargin) {
    btnLeft = scrollX + viewportWidth - btnWidth - edgeMargin;
  }
  if (btnLeft < scrollX + edgeMargin) {
    btnLeft = scrollX + edgeMargin;
  }
  if (btnTop + btnHeight > scrollY + viewportHeight - edgeMargin) {
    let topAbove = scrollY + selectionRect.top - btnHeight - margin;
    if (topAbove > scrollY + edgeMargin) {
      btnTop = topAbove;
    }
  }
  if (btnTop < scrollY + edgeMargin) {
    btnTop = scrollY + edgeMargin;
  }
  mobileLookupButton.style.top = `${btnTop}px`;
  mobileLookupButton.style.left = `${btnLeft}px`;
  mobileLookupButton.style.visibility = 'visible';
}

function hideMobileLookupButton() {
  if (mobileLookupButton) {
    mobileLookupButton.style.display = 'none';
  }
  lastSelectionRectForMobile = null;
}

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_FILES)) {
        db.createObjectStore(STORE_FILES); // key will be the file path
      }
      if (!db.objectStoreNames.contains(STORE_VERSION)) {
        db.createObjectStore(STORE_VERSION);
      }
    };
    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) =>
      reject('IndexedDB error: ' + event.target.error);
  });
}

function dbGet(db, storeName, key) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = (event) =>
      reject('Error getting data from DB: ' + event.target.error);
  });
}

function dbPut(db, storeName, value, key) {
  return new Promise((resolve, reject) => {
    if (value === undefined) {
      return reject(
        new DOMException(
          `Attempted to store an undefined value with key "${key}"`,
          'DataError',
        ),
      );
    }
    const transaction = db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.put(value, key);
    request.onsuccess = () => resolve();
    request.onerror = (event) => reject(event.target.error);
  });
}

function dbClear(db, storeName) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readwrite');
    transaction.oncomplete = () => resolve();
    transaction.onerror = (event) =>
      reject('Transaction error in dbClear: ' + event.target.error);
    const store = transaction.objectStore(storeName);
    store.clear();
  });
}

/**
 * 剖析由 Python 腳本產生的統一格式 CSV 字串。
 * @param {string} csvString - 來自 JS 物件个 content 內容。
 * @returns {Array<object>} 轉換後个物件陣列。
 */
function parseUnifiedCsv(csvString) {
  if (!csvString) return [];
  const rows = csvString.trim().split('\n');
  if (rows.length < 2) return [];

  const headers = rows[0].split(',');
  const data = [];

  for (let i = 1; i < rows.length; i++) {
    if (rows[i].trim() === '') continue;
    // 這邊用正規表示式來切分，較能處理包含逗號个欄位
    const values = rows[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      if (headers[j]) {
        let value = values[j] || '';
        // 拿掉頭尾可能个引號
        value = value.replace(/^\"|\"$/g, '');
        // 將 <br> 標籤轉回換行符，再做解碼
        value = value.replace(/<br>/g, '\n');
        // --- FIX: 拿掉無必要且會造成錯誤个 decodeURIComponent ---
        obj[headers[j]] = value;
      }
    }
    data.push(obj);
  }
  return data;
}

/**
 * [新增] 從檔案路徑生成唯一的儲存索引 (key)。
 * 這個函式統一了存入和讀取快取時的 key 生成邏輯。
 * @param {string} filePath - 資料檔案的路徑。
 * @returns {string|null} - 對應的 key 名稱，或在無法匹配時返回 null。
 */
function getKeyNameFromPath(filePath) {
  // 1. 從完整路徑中取出檔名並移除 .json 副檔名
  const fileName = filePath.split('/').pop().replace('.json', '');

  // 2. 根據檔案所在的不同資料夾，套用不同的命名規則
  if (filePath.includes('/cert/')) {
    // 認證詞彙檔：從檔名中提取簡稱 (例如 '113大中' -> '大中')
    const match = fileName.match(/\d*([四海大平安])(基|初|中高|中|高)/);
    if (match) {
      const dialectChar = match[1];
      const levelChar = match[2];
      return `${dialectChar}${levelChar}`;
    } else {
      console.warn(
        `getKeyNameFromPath: 無法解析認證檔名: ${fileName}。將使用完整檔名作為鍵名。`,
      );
      return fileName;
    }
  }
  if (filePath.includes('/gip/')) {
    // 教典資料檔：將檔名 (例如 '20250630-四') 轉換為 '教典四'
    const gipMap = {
      四: '教典四',
      南: '教典南',
      海: '教典海',
      大: '教典大',
      平: '教典平',
      安: '教典安',
    };
    const gipKey = fileName.split('-')[1];
    return gipMap[gipKey];
  }

  // 3. 處理其餘的特殊檔案
  const otherMap = {
    tone_mapping: 'toneMappingData',
    reverse_tone_mapping: 'reverseToneMappingData',
    sandhi_rules: 'sandhiRulesData',
    NAmedias: 'missingAudioData',
    exclusions: '例外音檔',
  };
  return otherMap[fileName];
}

function getFullLevelName(varName) {
  if (!varName) return '未知級別';
  if (varName.startsWith('教典')) {
    const gipNameMap = {
      教典四: '四縣教典',
      教典海: '海陸教典',
      教典大: '大埔教典',
      教典平: '饒平教典',
      教典安: '詔安教典',
      教典南: '南四縣教典',
    };
    return gipNameMap[varName] || varName;
  }
  const 腔調 = varName.substring(0, 1);
  const 級別 = varName.substring(1);
  let full腔調 = '';
  let full級別 = '';
  switch (腔調) {
    case '四':
      full腔調 = '四縣';
      break;
    case '海':
      full腔調 = '海陸';
      break;
    case '大':
      full腔調 = '大埔';
      break;
    case '平':
      full腔調 = '饒平';
      break;
    case '安':
      full腔調 = '詔安';
      break;
    default:
      full腔調 = '未知';
  }
  switch (級別) {
    case '基':
      full級別 = '基礎級';
      break;
    case '初':
      full級別 = '初級';
      break;
    case '中':
      full級別 = '中級';
      break;
    case '中高':
      full級別 = '中高級';
      break;
    case '高':
      full級別 = '高級';
      break;
    default:
      full級別 = '級別';
  }
  return full腔調 + full級別;
}

// --- Data Loading Logic (Refactored) ---

async function fetchAndCacheDataInDB(db, newVersion) {
  const loadingText = document.getElementById('loading-text');
  loadingText.textContent = '有新資料，當在該下載處理...';
  const CHUNK_SIZE = 500;

  try {
    await dbClear(db, STORE_FILES);
    console.log('舊快取資料已清除。');

    // 步驟 1: 平行 fetch 所有 JSON 檔並直接解析
    const jsonDataArray = await Promise.all(
      DATA_FILES_TO_CACHE.map((filePath) =>
        fetch(`${filePath}?cachebust=${new Date().getTime()}`)
          .then((res) => {
            if (!res.ok) throw new Error(`無法取得 ${filePath}`);
            return res.json(); // 直接解析為 JSON 物件
          })
          .catch((err) => {
            console.error(err);
            return null; // 若失敗則返回 null
          }),
      ),
    );

    // 步驟 2: 建立單一交易
    const transaction = db.transaction([STORE_FILES], 'readwrite');
    const fileStore = transaction.objectStore(STORE_FILES);

    // 步驟 3: 在單一交易內，循序處理並儲存每個資料物件
    for (const [index, dataObject] of jsonDataArray.entries()) {
      if (dataObject === null) continue; // 跳過下載或解析失敗的檔案

      const filePath = DATA_FILES_TO_CACHE[index];
      // [修正] 直接呼叫統一的工具函式來生成 key
      const keyName = getKeyNameFromPath(filePath);

      if (!keyName) {
        console.warn(`無法為檔案路徑生成 key: ${filePath}`);
        continue;
      }

      let dataToStore = dataObject;

      if (dataToStore.content && typeof dataToStore.content === 'string') {
        const parsedData = parseUnifiedCsv(dataToStore.content);
        const numChunks = Math.ceil(parsedData.length / CHUNK_SIZE);
        fileStore.put({ chunkCount: numChunks, isChunked: true }, keyName);
        for (let i = 0; i < numChunks; i++) {
          const chunk = parsedData.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
          fileStore.put(chunk, `${keyName}_chunk_${i}`);
        }
      } else {
        fileStore.put(dataToStore, keyName);
      }
      const progress = Math.round(
        ((index + 1) / DATA_FILES_TO_CACHE.length) * 100,
      );
      loadingText.textContent = `當在該處理最新資料... (${progress}%)`;
    }

    // 等待交易完成
    await new Promise((resolve, reject) => {
      transaction.oncomplete = () => {
        console.log('所有資料已在單一交易中成功寫入。');
        resolve();
      };
      transaction.onerror = (event) => {
        console.error('資料庫交易失敗:', event.target.error);
        reject(event.target.error);
      };
    });

    await dbPut(db, STORE_VERSION, newVersion, 'currentVersion');
    console.log('所有新資料已處理並快取。');
  } catch (error) {
    console.error('快取資料時發生嚴重錯誤:', error);
    loadingText.textContent = '資料處理失敗，請重新整理頁面。';
    throw error;
  }
}

async function loadDataFromDB(db) {
  const loadingText = document.getElementById('loading-text');
  loadingText.textContent = '遽啊讀本機資料黏時就好...';

  try {
    // [修正] 直接遍歷檔案列表，並在迴圈內呼叫工具函式
    for (const filePath of DATA_FILES_TO_CACHE) {
      const keyName = getKeyNameFromPath(filePath);

      if (!keyName) continue;

      const metadata = await dbGet(db, STORE_FILES, keyName);
      if (metadata) {
        if (metadata.isChunked) {
          // 處理分塊資料
          let reassembledData = [];
          for (let i = 0; i < metadata.chunkCount; i++) {
            const chunk = await dbGet(db, STORE_FILES, `${keyName}_chunk_${i}`);
            if (chunk) {
              reassembledData = reassembledData.concat(chunk);
            }
          }
          window[keyName] = {
            name: keyName,
            content: reassembledData,
          };
          console.log(
            `已成功從 ${metadata.chunkCount} 個區塊重組資料並建立物件: ${keyName}`,
          );
        } else {
          // 處理非分塊資料
          if (keyName === '例外音檔') {
            Object.assign(window, metadata);
          } else {
            window[keyName] = metadata;
          }
        }
      } else {
        console.warn(`在快取中找不到資料: ${keyName}`);
      }
    }
    console.log('所有資料已從快取載入。');
  } catch (error) {
    console.error('從快取載入資料失敗:', error);
    loadingText.textContent = '對本機載入資料失敗，請重新整理頁面。';
    throw error;
  }
}

// --- Application Initialization ---

function handleDataImport() {
  // Allow import on both the final domain and the preview domain
  const allowedHostnames = [
    'hakspring.pages.dev',
    'feature-data-migration-promp.hakspring.pages.dev',
    'fix-migration-page-scroll.hakspring.pages.dev',
    '',
  ]; // Allow empty hostname for file://
  if (!allowedHostnames.includes(window.location.hostname)) {
    return;
  }

  const urlParams = new URLSearchParams(window.location.search);
  const migrateData = urlParams.get('migrateData');

  if (migrateData) {
    try {
      // The `unescape(encodeURIComponent())` trick on the sending side must be reversed on the receiving side.
      const decodedData = decodeURIComponent(escape(atob(migrateData)));
      const parsedData = JSON.parse(decodedData);

      // --- Smart Bookmark Merging Logic ---
      if (parsedData.hakkaBookmarks) {
        const migratedBookmarks = Array.isArray(parsedData.hakkaBookmarks)
          ? parsedData.hakkaBookmarks
          : [];
        const localBookmarksRaw = localStorage.getItem('hakkaBookmarks');

        if (localBookmarksRaw) {
          // If local bookmarks exist, merge them
          let localBookmarks = [];
          try {
            const parsedLocal = JSON.parse(localBookmarksRaw);
            // Ensure the parsed data is an array
            if (Array.isArray(parsedLocal)) {
              localBookmarks = parsedLocal;
            } else {
              console.warn(
                'Local bookmarks are not an array, they will be overwritten.',
              );
            }
          } catch (e) {
            console.error(
              'Failed to parse local bookmarks, they will be overwritten.',
              e,
            );
          }
          const combinedBookmarks = [...localBookmarks, ...migratedBookmarks];

          const bookmarkMap = new Map();
          combinedBookmarks.forEach((bm) => {
            const key = `${bm.tableName}||${bm.cat}`;
            const existing = bookmarkMap.get(key);
            if (!existing || bm.timestamp > existing.timestamp) {
              bookmarkMap.set(key, bm);
            }
          });

          let mergedBookmarks = Array.from(bookmarkMap.values());
          mergedBookmarks.sort((a, b) => b.timestamp - a.timestamp);

          if (mergedBookmarks.length > 10) {
            mergedBookmarks = mergedBookmarks.slice(0, 10);
          }

          localStorage.setItem(
            'hakkaBookmarks',
            JSON.stringify(mergedBookmarks),
          );
          console.log('Bookmarks merged successfully.');
        } else {
          // If no local bookmarks, just use the migrated ones
          localStorage.setItem(
            'hakkaBookmarks',
            JSON.stringify(migratedBookmarks),
          );
          console.log('No local bookmarks found, imported migrated bookmarks.');
        }

        // Remove the key from parsedData so it's not processed again
        delete parsedData.hakkaBookmarks;
      }

      // --- Smart Learning Progress Merging Logic ---
      if (parsedData.hakkaLearningProgress) {
        const migratedProgress = parsedData.hakkaLearningProgress;
        const localProgressRaw = localStorage.getItem('hakkaLearningProgress');
        let localProgress = {};
        
        if (localProgressRaw) {
          try {
            localProgress = JSON.parse(localProgressRaw);
          } catch (e) {
            console.error('Failed to parse local learning progress, it will be overwritten.', e);
          }
        }
        
        if (typeof mergeProgress === 'function') {
          const mergedProgress = mergeProgress(localProgress, migratedProgress);
          localStorage.setItem('hakkaLearningProgress', JSON.stringify(mergedProgress));
          console.log('Learning progress merged successfully.');
        } else {
          // Fallback
          localStorage.setItem('hakkaLearningProgress', JSON.stringify(migratedProgress));
          console.log('mergeProgress not found, imported migrated learning progress directly.');
        }
        
        // Remove the key from parsedData so it's not processed again
        delete parsedData.hakkaLearningProgress;
      }

      // --- Handle other settings (overwrite) ---
      for (const key in parsedData) {
        if (Object.prototype.hasOwnProperty.call(parsedData, key)) {
          let value = parsedData[key];
          // Other values are directly set
          localStorage.setItem(
            key,
            typeof value === 'object' ? JSON.stringify(value) : value,
          );
        }
      }

      // Clean the URL
      const newUrl = new URL(window.location);
      newUrl.searchParams.delete('migrateData');
      history.replaceState({}, document.title, newUrl.toString());
    } catch (e) {
      console.error('Failed to parse or import migration data:', e);
    }
  }
}

async function initializeApp() {
  // --- 【Jules 修正 iOS 捲動問題】 ---
  // 手動設定捲動位置，避免瀏覽器自動處理，這在 iOS 上常會造成問題
  if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
  }
  // --- 【修正結束】 ---

  // --- 註冊 Service Worker (iOS 除外) ---
  if ('serviceWorker' in navigator && !isIOS()) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('service-worker.js')
        .then((registration) => {
          console.log(
            'Service Worker registered successfully with scope:',
            registration.scope,
          );
        })
        .catch((error) => {
          console.error('Service Worker registration failed:', error);
        });
    });
  }

  handleDataImport();
  if (handleDomainMigration()) {
    const loadingIndicator = document.getElementById('loading-indicator');
    if (loadingIndicator) {
      loadingIndicator.style.display = 'none';
    }
    return;
  }
  const loadingIndicator = document.getElementById('loading-indicator');
  const loadingText = document.getElementById('loading-text');
  const mainContent = document.getElementById('main-content');

  if (!window.indexedDB) {
    loadingText.textContent =
      '若个瀏覽器版本忒舊，無支援這網站程式需要个快取技術。請更新若个瀏覽器。';
    return;
  }

  try {
    // [新增] 強制重新快取邏輯
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('force-refresh')) {
      console.warn('偵測到 ?force-refresh 參數，正在強制清除 IndexedDB...');
      loadingText.textContent = '當在該強制清除快取...';

      // 刪除整個資料庫以確保完全乾淨
      await new Promise((resolve, reject) => {
        const deleteRequest = indexedDB.deleteDatabase(DB_NAME);
        deleteRequest.onsuccess = () => {
          console.log('IndexedDB 已成功刪除。');
          resolve();
        };
        deleteRequest.onerror = (event) => {
          console.error('刪除 IndexedDB 失敗:', event.target.error);
          reject(event.target.error);
        };
        deleteRequest.onblocked = () => {
          console.warn('刪除 IndexedDB 被封鎖，請關閉其他分頁後再試。');
          reject(new Error('IndexedDB delete blocked.'));
        };
      });
    }
    // [新增結束]
    const serverVersionResponse = await fetch(
      'data/data_version.json?cachebust=' + new Date().getTime(),
    );

    // --- 新增的錯誤處理 START ---
    if (!serverVersionResponse.ok) {
      loadingText.textContent =
        '毋著：無法度拿著版本控制檔 (data/data_version.json)，請檢查檔案敢有在、路徑有著無。';
      throw new Error(
        'Failed to fetch server version file. Status: ' +
          serverVersionResponse.status,
      );
    }

    const serverVersionData = await serverVersionResponse.json();
    const serverVersion = serverVersionData.version;

    // 檢查版本號本身是否有效
    if (!serverVersion) {
      loadingText.textContent =
        '毋著：版本控制檔 (data/data_version.json) 內容格式毋著，欠 "version" 欄位。';
      throw new Error('Invalid version data in data_version.json.');
    }
    // --- 新增的錯誤處理 END ---

    const db = await openDB();
    const localVersion = await dbGet(db, STORE_VERSION, 'currentVersion');

    if (localVersion !== serverVersion) {
      console.log(
        `Version mismatch. Local: ${localVersion}, Server: ${serverVersion}. Fetching new data.`,
      );
      await fetchAndCacheDataInDB(db, serverVersion);
    } else {
      console.log('Versions match. Loading data from IndexedDB.');
    }

    await loadDataFromDB(db);

    initializeAppUI();

    // Hide loading indicator and show main content
    loadingIndicator.style.display = 'none';
    mainContent.style.display = 'block';
  } catch (error) {
    console.error('Application initialization failed:', error);
    // The specific error message is already set by the throwing function
    // loadingText.textContent = '應用程式載入失敗，請重新整理頁面再試一次。';
  }
}

function initializeAppUI() {
  // All the original code from DOMContentLoaded goes here
  console.log('Initializing UI...');

  function updateAppTitles() {
    const userNameRaw = localStorage.getItem('hakkaUserName') || '';
    const userLocationRaw = localStorage.getItem('hakkaUserLocation') || '';
    
    const userName = userNameRaw.trim();
    const userLocation = userLocationRaw.trim();
    
    let defaultSubtitle = '你个客援隊／客研隊。詞典+分類學習';
    let defaultGameTitle = '客源翠學習遊戲';
    
    if (userName) {
      const locationPrefix = userLocation ? `${userLocation}个` : '';
      
      const mainSubtitle = document.getElementById('mainSubtitle');
      if (mainSubtitle) {
        mainSubtitle.textContent = `${userName}个客援隊／客研隊。詞典+分類學習`;
      }
      
      const gameModalTitle = document.getElementById('gameModalTitle');
      if (gameModalTitle) {
        gameModalTitle.textContent = `${userName}个挑戰競技場`;
      }
      
      const statsModalTitle = document.getElementById('statsModalTitle');
      if (statsModalTitle) {
        statsModalTitle.textContent = `${locationPrefix}${userName}，客話戰績回顧`;
      }
    } else {
      const mainSubtitle = document.getElementById('mainSubtitle');
      if (mainSubtitle) mainSubtitle.textContent = defaultSubtitle;
      
      const gameModalTitle = document.getElementById('gameModalTitle');
      if (gameModalTitle) gameModalTitle.textContent = defaultGameTitle;
      
      const statsModalTitle = document.getElementById('statsModalTitle');
      if (statsModalTitle) statsModalTitle.textContent = '學習戰績面板';
    }
  }

  // 暴露給全域以便設定視窗儲存後呼叫
  window.updateAppTitles = updateAppTitles;
  updateAppTitles();

  if (isMobileDevice()) {
    document.body.classList.add('mobile-device');
  }

  /**
   * 從資料陣列中尋找與 strippedCat 匹配的完整分類名稱。
   * @param {string} strippedCat - 不含數字前綴的分類名稱 (如 "人體與醫療")
   * @param {Array} dataArray - 詞彙資料陣列
   * @returns {string} - 完整的分類名稱 (如 "01人體與醫療")
   */
  function getFullOfficialCategoryName(strippedCat, dataArray) {
    if (!dataArray || !Array.isArray(dataArray)) return strippedCat;
    const item = dataArray.find(
      (line) => line.分類 && line.分類.replace(/^\d+/, '') === strippedCat,
    );
    return item ? item.分類 : strippedCat;
  }

  function updateLastCenteredRow() {
    if (isRepositioning) return;

    const table = document.getElementById('category-table');
    if (!table || (isPlaying && !isPaused)) {
      lastCenteredRow = null;
      return;
    }
    const rows = Array.from(table.querySelectorAll('tbody tr'));
    if (rows.length === 0) {
      lastCenteredRow = null;
      return;
    }

    const viewportCenterY = window.innerHeight / 2;
    let closestRow = null;
    let smallestDistance = Infinity;

    for (const row of rows) {
      const rect = row.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight) continue;

      const rowCenterY = rect.top + rect.height / 2;
      const distance = Math.abs(viewportCenterY - rowCenterY);

      if (distance < smallestDistance) {
        smallestDistance = distance;
        closestRow = row;
      }
    }

    if (closestRow) {
      lastCenteredRow = closestRow;
    }
  }

  const DEBOUNCE_UPDATE_CENTERED_ROW_MS = 100;
  const DEBOUNCE_REPOSITION_ACTIONS_MS = 150;
  const REPOSITION_FLAG_RESET_DELAY_MS = 300;

  const debouncedUpdateLastCenteredRow = debounce(
    updateLastCenteredRow,
    DEBOUNCE_UPDATE_CENTERED_ROW_MS,
  );

  const debouncedRepositionActions = debounce(() => {
    // This contains the actual logic, which is debounced.
    // Defer the scrolling to prevent race conditions with layout reflow.
    setTimeout(() => {
      if (isPlaying && !isPaused) {
        const nowPlayingRow = document.getElementById('nowPlaying');
        if (nowPlayingRow) {
          nowPlayingRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      } else if (lastCenteredRow && document.body.contains(lastCenteredRow)) {
        lastCenteredRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 0);

    // Re-run the original layout adjustment logic
    const contentContainer = document.getElementById('generated');
    if (contentContainer) {
      adjustAllRubyFontSizes(contentContainer);
    }
    const rubies = document.querySelectorAll('ruby');
    rubies.forEach((ruby) => {
      const rt = ruby.querySelector('rt');
      if (rt) {
        if (rt.offsetWidth > ruby.offsetWidth) {
          const scale = ruby.offsetWidth / rt.offsetWidth;
          rt.style.transform = `scaleX(${scale * 0.95})`;
          rt.style.transformOrigin = 'left';
        } else {
          rt.style.transform = 'none';
        }
      }
    });
    adjustHeaderFontSizeOnOverflow();
    adjustResultsSummaryFontSize();
    if (activeSelectionPopup) {
      const popupEl = document.getElementById('selectionPopup');
      if (popupEl && popupEl.style.display === 'block') {
        let rectToUse = null;
        if (
          lastAnchorElementForPopup &&
          document.body.contains(lastAnchorElementForPopup)
        ) {
          rectToUse = lastAnchorElementForPopup.getBoundingClientRect();
        } else if (lastRectForPopupPositioning) {
          rectToUse = lastRectForPopupPositioning;
        }

        if (rectToUse) {
          requestAnimationFrame(() => {
            setTimeout(() => {
              if (
                lastAnchorElementForPopup &&
                !document.body.contains(lastAnchorElementForPopup)
              ) {
                return;
              }
              let currentRect = rectToUse;
              if (
                lastAnchorElementForPopup &&
                document.body.contains(lastAnchorElementForPopup)
              ) {
                currentRect = lastAnchorElementForPopup.getBoundingClientRect();
              }
              updatePopupPosition(popupEl, currentRect);
            }, DEBOUNCE_UPDATE_CENTERED_ROW_MS);
          });
        }
      }
    }

    // 注意：這 300 毫秒个延遲係一隻經驗值，用來等「滑溜捲動」動畫做核。假使動畫時間較長，恁樣做可能會無罅穩當。
    setTimeout(() => {
      isRepositioning = false;
    }, REPOSITION_FLAG_RESET_DELAY_MS);
  }, DEBOUNCE_REPOSITION_ACTIONS_MS);

  function repositionViewport() {
    if (g_isAccordionScrolling) return; // Don't reposition if accordion is scrolling
    // This function is called directly by the event listener.
    // It sets the flag immediately and then calls the debounced actions.
    isRepositioning = true;
    debouncedRepositionActions();
  }

  let successfullyLoadedFromUrl = false;

  const resultsSummaryContainer = document.getElementById('results-summary');
  const summaryTextContent = document.getElementById('summary-text-content');
  const searchContainer = document.getElementById('search-container');
  const searchInput = document.getElementById('search-input');
  const searchPopup = document.getElementById('search-popup');
  const searchDialectRadios = document.querySelectorAll(
    '#search-popup input[name="dialect"]',
  );
  const searchModeRadios = document.querySelectorAll(
    '#search-popup input[name="search-mode"]',
  );
  const progressDropdown = document.getElementById('progressDropdown');
  const progressDetailsSpan = document.getElementById('progressDetails');
  const contentContainer = document.getElementById('generated');
  const header = document.getElementById('header');
  const backToTopButton = document.getElementById('backToTopBtn');
  const autoplayModal = document.getElementById('autoplayModal');
  const modalContent = autoplayModal
    ? autoplayModal.querySelector('.modal-content')
    : null;
  const dialectLevelLinks = document.querySelectorAll('.dialect a');
  const selectionPopup = document.getElementById('selectionPopup');
  const selectionPopupBackdrop = document.getElementById(
    'selectionPopupBackdrop',
  );
  const selectionPopupContent = document.getElementById(
    'selectionPopupContent',
  );
  const selectionPopupCloseBtn = document.getElementById(
    'selectionPopupCloseBtn',
  );
  const infoButton = document.getElementById('infoButton');
  const infoModal = document.getElementById('infoModal');
  const infoModalCloseBtn = document.getElementById('infoModalCloseBtn');
  const statsModalBtn = document.getElementById('statsModalBtn');
  const statsModal = document.getElementById('statsModal');
  const statsModalCloseBtn = document.getElementById('statsCloseBtn'); // HTML 的 id 是 statsCloseBtn，非 statsModalCloseBtn
  const romanizerContainer = document.getElementById('romanizerContainer');
  const dailyWordBtn = document.getElementById('dailyWordBtn');
  const dailyWordModal = document.getElementById('dailyWordModal');
  const dailyCloseBtn = document.getElementById('dailyCloseBtn');
  initializeDataManagement(); // <-- 【新增】呼叫新的初始化函式
  initializeCloudSync(); // <-- 【新增】初始化雲端同步

  // All data variables from the included JS files
  const allData = {
    四縣: [
      window['四基'],
      window['四初'],
      window['四中'],
      window['四中高'],
      window['四高'],
    ],
    南四縣: [
      window['四基'],
      window['四初'],
      window['四中'],
      window['四中高'],
      window['四高'],
    ],
    海陸: [
      window['海基'],
      window['海初'],
      window['海中'],
      window['海中高'],
      window['海高'],
    ],
    大埔: [
      window['大基'],
      window['大初'],
      window['大中'],
      window['大中高'],
      window['大高'],
    ],
    饒平: [
      window['平基'],
      window['平初'],
      window['平中'],
      window['平中高'],
      window['平高'],
    ],
    詔安: [
      window['安基'],
      window['安初'],
      window['安中'],
      window['安中高'],
      window['安高'],
    ],
  };

  // --- 新增：教典資料 ---
  const gipData = {
    四縣: window['教典四'],
    海陸: window['教典海'],
    大埔: window['教典大'],
    饒平: window['教典平'],
    詔安: window['教典安'],
    南四縣: window['教典南'],
  };

  function updateProgressDropdown() {
    const progressDropdown = document.getElementById('progressDropdown');
    const progressDetailsSpan = document.getElementById('progressDetails');

    if (!progressDropdown) return;

    const previousValue = progressDropdown.value;

    const bookmarks = JSON.parse(localStorage.getItem('hakkaBookmarks')) || [];

    progressDropdown.innerHTML =
      '<option selected disabled>擇進前个進度</option>';
    if (bookmarks.length === 0 && progressDetailsSpan) {
      progressDetailsSpan.textContent = '';
    }

    bookmarks.forEach((bookmark, index) => {
      const option = document.createElement('option');
      if (bookmark.isLevelFinished) {
        option.textContent = `${bookmark.tableName}全部放送煞，重新開始？`;
      } else {
        let displayCat = bookmark.cat;
        const dataVar = mapTableNameToDataVar(bookmark.tableName);
        if (dataVar && window[dataVar] && window[dataVar].content) {
          const fullCat = getFullOfficialCategoryName(
            bookmark.cat,
            window[dataVar].content,
          );
          displayCat = formatCategoryLabel(fullCat);
        }
        option.textContent = `${bookmark.tableName} - ${displayCat} - #${bookmark.rowId} (${bookmark.percentage}%)`;
      }
      option.value = bookmark.tableName + '||' + bookmark.cat;
      progressDropdown.appendChild(option);
    });

    if (previousValue && previousValue !== '擇進前个進度') {
      const newOptionToSelect = progressDropdown.querySelector(
        `option[value="${previousValue}"]`,
      );
      if (newOptionToSelect) {
        newOptionToSelect.selected = true;
        const selectedBookmark = bookmarks.find(
          (bm) => bm.tableName + '||' + bm.cat === previousValue,
        );
        if (selectedBookmark && progressDetailsSpan) {
          // [Fix] Reconstruct the link instead of setting plain text
          let baseURL = '';
          if (window.location.protocol === 'file:') {
            baseURL = window.location.href.substring(
              0,
              window.location.href.lastIndexOf('/') + 1,
            );
          } else {
            let path = window.location.pathname;
            baseURL =
              window.location.origin +
              path.substring(0, path.lastIndexOf('/') + 1);
            if (!baseURL.endsWith('/')) {
              baseURL += '/';
            }
          }

          const dialectLevelCodes = extractDialectLevelCodes(
            selectedBookmark.tableName,
          );
          if (dialectLevelCodes) {
            const shareURL = `${baseURL}?dialect=${dialectLevelCodes.dialect}&level=${dialectLevelCodes.level}&category=${selectedBookmark.cat}&row=${selectedBookmark.rowId}`;
            const linkElement = document.createElement('a');
            linkElement.href = shareURL;
            linkElement.textContent = `#${selectedBookmark.rowId} (${selectedBookmark.percentage}%)`;
            linkElement.style.marginLeft = '5px';
            progressDetailsSpan.innerHTML = '';
            progressDetailsSpan.appendChild(linkElement);
          } else {
            progressDetailsSpan.textContent = `#${selectedBookmark.rowId} (${selectedBookmark.percentage}%)`;
          }
        }
      } else {
        progressDropdown.selectedIndex = 0;
      }
    } else {
      progressDropdown.selectedIndex = 0;
    }
    setTimeout(adjustHeaderFontSizeOnOverflow, 0);
  }

  // 【新增】將 updateProgressDropdown 暴露到全域，讓 cloud-sync.js 能存取
  window.updateProgressDropdown = updateProgressDropdown;

  function saveBookmark(
    rowId,
    percentage,
    category,
    tableName,
    isPlayingContext = false,
    isLevelFinished = false,
    restartCat = null,
  ) {
    let bookmarks = JSON.parse(localStorage.getItem('hakkaBookmarks')) || [];
    const newBookmark = {
      rowId: rowId,
      percentage: percentage,
      cat: category,
      tableName: tableName,
      timestamp: Date.now(),
      isLevelFinished: isLevelFinished,
      restartCat: restartCat,
    };

    // 1. 移除已存在的完全相同的紀錄 (同表格同類別)
    const existingIndex = bookmarks.findIndex(
      (bm) =>
        bm.tableName === newBookmark.tableName && bm.cat === newBookmark.cat,
    );
    if (existingIndex > -1) {
      bookmarks.splice(existingIndex, 1);
    }
    // 2. 將新紀錄加到最前面
    bookmarks.unshift(newBookmark);

    // 3. 如果紀錄超過 10 筆，執行您微調過的汰換邏輯
    if (bookmarks.length > 10) {
      let indexToDelete = -1;
      let foundMatch = false;

      // 從最舊的開始往前找 (但不包含最新的第0筆)
      for (let i = bookmarks.length - 1; i >= 1; i--) {
        const currentBookmark = bookmarks[i];
        // 檢查是否為「同表格，但不同類別」
        if (
          currentBookmark.tableName === newBookmark.tableName &&
          currentBookmark.cat !== newBookmark.cat
        ) {
          indexToDelete = i;
          foundMatch = true;
          break; // 找到目標，停止搜尋
        }
      }

      // 如果找到了符合條件的，就刪除它
      if (foundMatch) {
        bookmarks.splice(indexToDelete, 1);
      } else {
        // 如果沒找到，才刪除最舊的一筆 (也就是最後一筆)
        bookmarks.pop();
      }
    }

    // 4. 儲存更新後的紀錄
    localStorage.setItem('hakkaBookmarks', JSON.stringify(bookmarks));

    // 4.5 【新增】觸發雲端同步
    if (typeof triggerCloudSync === 'function') {
      triggerCloudSync();
    }

    // 5. 更新下拉選單 UI
    updateProgressDropdown();

    // 6. 更新進度詳情連結 (採用新版清晰的邏輯)
    const progressDetailsSpan = document.getElementById('progressDetails');
    if (progressDetailsSpan) {
      let baseURL = '';
      if (window.location.protocol === 'file:') {
        baseURL = window.location.href.substring(
          0,
          window.location.href.lastIndexOf('/') + 1,
        );
      } else {
        let path = window.location.pathname;
        baseURL =
          window.location.origin + path.substring(0, path.lastIndexOf('/') + 1);
        if (!baseURL.endsWith('/')) {
          baseURL += '/';
        }
      }

      const dialectLevelCodes = extractDialectLevelCodes(tableName);
      if (dialectLevelCodes) {
        const shareURL = `${baseURL}?dialect=${dialectLevelCodes.dialect}&level=${dialectLevelCodes.level}&category=${category}&row=${rowId}`;
        const linkElement = document.createElement('a');
        linkElement.href = shareURL;
        linkElement.textContent = `#${rowId} (${percentage}%)`;
        linkElement.style.marginLeft = '5px';
        progressDetailsSpan.innerHTML = '';
        progressDetailsSpan.appendChild(linkElement);
      } else {
        progressDetailsSpan.textContent = `#${rowId} (${percentage}%)`;
        console.error(
          'Could not generate share link for bookmark; tableName invalid:',
          tableName,
        );
      }
    }
  }

  function mapTableNameToDataVar(tableName) {
    if (!tableName) return null;
    let simplified = tableName.replace('級', '');
    const mapping = {
      四縣基礎: '四基',
      四縣初: '四初',
      四縣中: '四中',
      四縣中高: '四中高',
      四縣高: '四高',
      海陸基礎: '海基',
      海陸初: '海初',
      海陸中: '海中',
      海陸中高: '海中高',
      海陸高: '海高',
      大埔基礎: '大基',
      大埔初: '大初',
      大埔中: '大中',
      大埔中高: '大中高',
      大埔高: '大高',
      饒平基礎: '平基',
      饒平初: '平初',
      饒平中: '平中',
      饒平中高: '平中高',
      饒平高: '平高',
      詔安基礎: '安基',
      詔安初: '安初',
      詔安中: '安中',
      詔安中高: '安中高',
      詔安高: '安高',
    };
    return mapping[simplified] || null;
  }

  function performSearch(page = 1, itemsPerPage = 50) {
    const selectedDialect = document.querySelector(
      '#search-popup input[name="dialect"]:checked',
    ).value;
    let searchMode = document.querySelector(
      '#search-popup input[name="search-mode"]:checked',
    ).value;
    const keyword = searchInput.value.trim();

    // 拼音 regex 模式偵測：含 regex 元字元，且淨由拼音允許个字元（英數、空白、-'）＋元字元組成，
    // 無漢字、無變音符。用來對「客語標音_查詢」个數字調字串做 regex 比對，方便測變調（如 `.+53 .+53`）。
    const looksLikePhoneticRegex =
      keyword.length > 0 &&
      /[.^$*+?()[\]{}|\\]/.test(keyword) &&
      /^[a-z0-9\s.^$*+?()[\]{}|\\/'-]+$/i.test(keyword);

    if (
      keyword.length > 0 &&
      (isRomanizedHakka(keyword) || looksLikePhoneticRegex)
    ) {
      searchMode = '客話';
      const hakkaModeRadio = document.querySelector(
        'input[name="search-mode"][value="客話"]',
      );
      if (hakkaModeRadio) {
        hakkaModeRadio.checked = true;
      }
    }

    if (!keyword) {
      if (summaryTextContent) {
        summaryTextContent.textContent = '';
        summaryTextContent.dataset.originalText = '';
      }
      contentContainer.innerHTML =
        '<p style="text-align: center;">請輸入關鍵字</p>';
      updatePageTitle();
      updateResultsSummaryVisibility();
      return;
    }

    searchPopup.style.display = 'none';
    searchInput.blur();

    const learningPanel = document.getElementById('learningSelectionPanel');
    if (learningPanel) {
      learningPanel.open = false;
    }

    currentActiveMainDialectName = selectedDialect;
    currentActiveDialectLevelFullName = '';

    const dialectCertData = allData[selectedDialect] || [];
    let combinedData = [];

    dialectCertData.forEach((level) => {
      if (level && level.content && Array.isArray(level.content)) {
        const levelData = level.content;
        levelData.forEach((item) => {
          item.sourceName = level.name;
          item.sourceType = 'cert';
        });
        combinedData = combinedData.concat(levelData);
      }
    });

    const gipDialectData = gipData[selectedDialect];
    if (
      gipDialectData &&
      gipDialectData.content &&
      Array.isArray(gipDialectData.content)
    ) {
      const gipParsedData = gipDialectData.content;
      gipParsedData.forEach((item) => {
        item.sourceName = gipDialectData.name;
        item.sourceType = 'gip';
      });
      combinedData = combinedData.concat(gipParsedData);
    }

    let results;
    if (searchMode === '客話') {
      const lowerCaseKeyword = keyword.toLowerCase();
      const precisePhoneticRegex = /^([a-z]+[0-9]+(\s+|$))+$/i;

      if (precisePhoneticRegex.test(lowerCaseKeyword)) {
        results = combinedData
          .filter(
            (item) =>
              item['客語標音_查詢'] &&
              item['客語標音_查詢'].toLowerCase().includes(lowerCaseKeyword),
          )
          .map((item) => ({
            ...item,
            _match: { inPhonetics: true, isExact: true },
          }));
      } else if (looksLikePhoneticRegex) {
        // 拼音 regex 模式：對數字調字串「客語標音_查詢」做 regex 比對。
        let phoneticRegex = null;
        try {
          phoneticRegex = new RegExp(keyword, 'i');
        } catch (e) {
          phoneticRegex = null;
        }
        results = phoneticRegex
          ? combinedData
              .filter(
                (item) =>
                  item['客語標音_查詢'] &&
                  phoneticRegex.test(item['客語標音_查詢']),
              )
              .map((item) => ({
                ...item,
                _match: { inPhonetics: true, isExact: true },
              }))
          : [];
      } else {
        const normalizedKeyword = normalizePhonetics(lowerCaseKeyword);
        results = combinedData
          .map((item) => {
            const inWord =
              item['客家語'] &&
              item['客家語'].toLowerCase().includes(lowerCaseKeyword);
            const normalizedPhonetics = normalizePhonetics(
              item['客語標音_查詢'] || '',
            );
            const inPhonetics = normalizedPhonetics.includes(normalizedKeyword);
            const inSentence =
              item['例句'] &&
              item['例句'].toLowerCase().includes(lowerCaseKeyword);

            if (inWord || inPhonetics || inSentence) {
              return {
                ...item,
                _match: { inWord, inPhonetics, inSentence, isExact: false },
              };
            }
            return null;
          })
          .filter(Boolean);
      }
    } else {
      // 華語
      const lowerCaseKeyword = keyword.toLowerCase();
      results = combinedData
        .map((item) => {
          const inMeaning =
            item &&
            item['華語詞義'] &&
            item['華語詞義'].toLowerCase().includes(lowerCaseKeyword);
          const inTranslation =
            item &&
            item['翻譯'] &&
            item['翻譯'].toLowerCase().includes(lowerCaseKeyword);
          if (inMeaning || inTranslation) {
            return { ...item, _match: { inMeaning, inTranslation } };
          }
          return null;
        })
        .filter(Boolean);
    }

    const getCategoryRank = (item, mode) => {
      if (mode === '客話') {
        const { inWord, inSentence, inPhonetics } = item._match;
        if ((inWord || inPhonetics) && inSentence) return 1;
        if (inWord || inPhonetics) return 2;
        if (inSentence) return 3;
      } else {
        // 華語
        const { inMeaning, inTranslation } = item._match;
        if (inMeaning && inTranslation) return 1;
        if (inMeaning) return 2;
        if (inTranslation) return 3;
      }
      return 4;
    };

    results.sort((a, b) => {
      const rankA = getCategoryRank(a, searchMode);
      const rankB = getCategoryRank(b, searchMode);
      if (rankA !== rankB) {
        return rankA - rankB;
      }
      return 0;
    });

    let summaryText = `在${searchMode === '客話' ? '客文' : '華文'}部分尋「${keyword}」，`;

    const newUrl = getBaseUrlWithoutIndex();
    newUrl.searchParams.set('musiid', searchMode === '客話' ? 'hak' : 'zh');
    newUrl.searchParams.set('ca', keyword);
    newUrl.searchParams.set('bidsu', itemsPerPage.toString());
    newUrl.searchParams.set('iab', page.toString());
    newUrl.searchParams.set('kiong', DIALECT_NAME_TO_CODE[selectedDialect]);
    history.pushState({}, '', newUrl);

    displayQueryResults(
      results,
      keyword,
      searchMode,
      summaryText,
      selectedDialect,
      page,
      itemsPerPage,
    );
  }

  function displayQueryResults(
    results,
    keyword,
    searchMode,
    summaryText,
    selectedDialect,
    page = 1,
    itemsPerPage = 50,
  ) {
    g_currentSearchResults = results; // Store results globally
    let globalRowIndex = (page - 1) * itemsPerPage;
    const contentContainer = document.getElementById('generated');
    contentContainer.innerHTML = '';
    document.querySelector('#audioControls')?.remove();

    const totalResults = results.length;
    const totalPages = Math.ceil(totalResults / itemsPerPage);
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedResults = results.slice(startIndex, endIndex);

    const searchModeText = searchMode === '客話' ? '客文' : '華文';
    updatePageTitle([
      `${selectedDialect}尋「${keyword}」（${searchModeText}）`,
    ]);

    if (totalResults === 0) {
      summaryTextContent.textContent =
        summaryText + `尋著 0 筆結果（${selectedDialect}）`;
      summaryTextContent.dataset.originalText = summaryTextContent.textContent;
      updateResultsSummaryVisibility();
      return;
    }

    summaryTextContent.textContent =
      summaryText + `尋著 ${totalResults} 筆結果（${selectedDialect}）`;
    summaryTextContent.dataset.originalText = summaryTextContent.textContent;

    const highlightRegex = new RegExp(
      `(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`,
      'ig',
    );

    const createResultRow = (line, highlight, rowIndex) => {
      globalRowIndex++;
      if (!line || !line['客家語']) return null;

      const item = document.createElement('tr');
      item.dataset.source = line.sourceName;

      const td1 = document.createElement('td');
      td1.className = 'no';
      td1.dataset.label = '編號';
      const seqNum = document.createElement('span');
      seqNum.className = 'result-sequence-number';
      seqNum.textContent = globalRowIndex;
      td1.appendChild(seqNum);
      td1.appendChild(document.createElement('br'));

      if (line.sourceType === 'cert' && line.編號) {
        const noText = document.createTextNode(line.編號 + ' ');
        td1.appendChild(noText);
      }

      let 腔 = '';
      let 級 = '';
      let originalDialectInfo = {};
      const isGip = line.sourceType === 'gip' || line.sourceName.startsWith('教典');

      if (isGip) {
         腔 = line.sourceName.replace('教典', '');
         const accentObj = ACCENT_INFO[腔] || { 腔名: '' };
         originalDialectInfo = { 腔: 腔, 腔名: accentObj.腔名, 級: '', fullLvlName: accentObj.腔名 + '教典' };
      } else {
         腔 = line.sourceName.substring(0, 1);
         級 = line.sourceName.substring(1);
         originalDialectInfo = getDialectInfo(腔, 級);
      }

      const crossDialectResults = findCrossDialectRows(line, originalDialectInfo, isGip);

      if (crossDialectResults.length > 0) {
        const crossDialectBtn = document.createElement('button');
        crossDialectBtn.className = 'crossDialectBtn';
        crossDialectBtn.title = '跨腔調對照';
        crossDialectBtn.innerHTML = '<i class="fas fa-plus-circle"></i>';
        crossDialectBtn.dataset.rowIndex = rowIndex;
        td1.appendChild(crossDialectBtn);
      }

      const sourceSpan = document.createElement('span');
      sourceSpan.className = `source-tag ${line.sourceType}-source`;
      let fullSourceName = getFullLevelName(line.sourceName);
      sourceSpan.textContent = `(${fullSourceName})`;
      td1.appendChild(sourceSpan);
      item.appendChild(td1);

      const td2 = document.createElement('td');
      td2.dataset.label = '詞彙';
      const ruby = document.createElement('ruby');
      ruby.innerHTML = highlight.word
        ? line['客家語'].replace(highlightRegex, '<mark>$1</mark>')
        : line['客家語'];
      const rt = document.createElement('rt');
      let phoneticText = formatPhoneticForDisplay(line['客語標音_顯示']);
      const dialectCode = getDialectCode(selectedDialect);

      if (dialectCode) {
        phoneticText = getSandhiHtml(phoneticText, dialectCode);
      }
      rt.innerHTML = phoneticText;
      ruby.appendChild(rt);
      td2.appendChild(ruby);
      td2.appendChild(document.createElement('br'));

      const dataKey = line.sourceType === 'gip' ? line.sourceName : 'cert' + line.sourceName;
      let audioSrc = constructWordAudioUrl(line, dataKey);
      if (audioSrc) {
        audioSrc = applyAudioProxy(audioSrc);
      }

      if (audioSrc) {
        const audio = document.createElement('audio');
        audio.className = 'media';
        audio.controls = true;
        audio.preload = 'none';
        audio.src = audioSrc;
        td2.appendChild(audio);
      }

      if (
        line.sourceType !== 'gip' ||
        (line.sourceType === 'gip' && line['詞目音檔名'])
      ) {
        td2.appendChild(document.createElement('br'));
      }
      const meaningText = document.createElement('span');
      const processedMeaning = line['華語詞義']
        .replace(/"/g, '')
        .replace(/\n/g, '<br>');
      meaningText.innerHTML = highlight.meaning
        ? processedMeaning.replace(highlightRegex, '<mark>$1</mark>')
        : processedMeaning;
      td2.appendChild(meaningText);
      if (line.備註 && line.備註.trim() !== '') {
        const notesP = document.createElement('p');
        notesP.className = 'notes';
        notesP.textContent = `（${line.備註}）`;
        td2.appendChild(notesP);
      }
      item.appendChild(td2);

      const td3 = document.createElement('td');
      td3.dataset.label = '例句';
      if (line['例句'] && line['例句'].trim() !== '') {
        const sentenceSpan = document.createElement('span');
        sentenceSpan.className = 'sentence';
        sentenceSpan.innerHTML = (
          highlight.sentence
            ? line['例句'].replace(highlightRegex, '<mark>$1</mark>')
            : line['例句']
        ).replace(/\n/g, '<br>');
        td3.appendChild(sentenceSpan);
        td3.appendChild(document.createElement('br'));

        if (line.sourceType === 'cert') {
          const dataKey = 'cert' + line.sourceName;
          const audioUrl = constructSentenceAudioUrl(line, dataKey);
          if (audioUrl) {
            const audio2 = document.createElement('audio');
            audio2.className = 'media';
            audio2.controls = true;
            audio2.preload = 'none';
            audio2.src = audioUrl;
            td3.appendChild(audio2);
          }
        }

        td3.appendChild(document.createElement('br'));
        const translationText = document.createElement('span');
        translationText.innerHTML = (
          highlight.translation
            ? line['翻譯'].replace(highlightRegex, '<mark>$1</mark>')
            : line['翻譯']
        )
          .replace(/"/g, '')
          .replace(/\n/g, '<br>');
        td3.appendChild(translationText);
      } else {
        td3.classList.add('empty-sentence-cell');
      }
      item.appendChild(td3);
      return item;
    };

    let currentCategoryKey = null;
    let currentTable = null;

    const categoryConfig = {
      客話: {
        both: {
          title: '詞、句裡肚都有：',
          highlight: {
            word: true,
            sentence: true,
            meaning: false,
            translation: false,
          },
        },
        word_only: {
          title: '淨詞彙裡肚有：',
          highlight: {
            word: true,
            sentence: false,
            meaning: false,
            translation: false,
          },
        },
        sentence_only: {
          title: '僅例句裡肚有：',
          highlight: {
            word: false,
            sentence: true,
            meaning: false,
            translation: false,
          },
        },
      },
      華語: {
        both: {
          title: '華語詞義、翻譯裡肚都有出現：',
          highlight: {
            word: false,
            sentence: false,
            meaning: true,
            translation: true,
          },
        },
        meaning_only: {
          title: '淨出現在華語詞義裡肚：',
          highlight: {
            word: false,
            sentence: false,
            meaning: true,
            translation: false,
          },
        },
        translation_only: {
          title: '淨出現在例句翻譯裡肚：',
          highlight: {
            word: false,
            sentence: false,
            meaning: false,
            translation: true,
          },
        },
      },
    };

    const getCategoryKey = (item, mode) => {
      if (mode === '客話') {
        const { inWord, inSentence, inPhonetics } = item._match;
        if ((inWord || inPhonetics) && inSentence) return 'both';
        if (inWord || inPhonetics) return 'word_only';
        if (inSentence) return 'sentence_only';
      } else {
        // 華語
        const { inMeaning, inTranslation } = item._match;
        if (inMeaning && inTranslation) return 'both';
        if (inMeaning) return 'meaning_only';
        if (inTranslation) return 'translation_only';
      }
      return null;
    };

    paginatedResults.forEach((line, index) => {
      const categoryKey = getCategoryKey(line, searchMode);
      if (!categoryKey) return;

      if (categoryKey !== currentCategoryKey) {
        currentCategoryKey = categoryKey;
        const config = categoryConfig[searchMode][categoryKey];
        const heading = document.createElement('h4');
        heading.textContent = config.title;
        heading.className = 'results-section-heading';
        contentContainer.appendChild(heading);
        currentTable = document.createElement('table');
        currentTable.setAttribute('width', '100%');
        contentContainer.appendChild(currentTable);
      }

      const config = categoryConfig[searchMode][categoryKey];
      const row = createResultRow(line, config.highlight, startIndex + index);
      if (row && currentTable) {
        currentTable.appendChild(row);
      }
    });

    if (totalPages > 1) {
      const paginationContainer = document.createElement('div');
      paginationContainer.className = 'pagination-container';
      for (let i = 1; i <= totalPages; i++) {
        const pageButton = document.createElement('button');
        pageButton.textContent = i;
        pageButton.className = 'page-button';
        if (i === page) {
          pageButton.classList.add('active');
        }
        pageButton.addEventListener('click', () => {
          performSearch(i, itemsPerPage);
          setTimeout(() => {
            const firstResultElement = document.querySelector(
              '#generated > h4, #generated > table',
            );
            if (firstResultElement) {
              firstResultElement.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
              });
            }
          }, 100);
        });
        paginationContainer.appendChild(pageButton);
      }
      contentContainer.appendChild(paginationContainer);
    }

    updateResultsSummaryVisibility();

    setTimeout(() => repositionViewport(), 0); // Trigger font size adjustment after table is rendered

    setTimeout(() => {
      const firstResultElement = contentContainer.querySelector('h4, table');
      if (firstResultElement) {
        firstResultElement.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }
    }, 100);
  }

  /**
   * 動態調整 #header 內主要元素 (#progressDropdown, #progressDetails) 的字體大小，
   * 檢查 #header 是否發生橫向溢出 (overflow)，如果是，則縮小字體。
   */
  function adjustHeaderFontSizeOnOverflow() {
    console.log('--- adjustHeaderFontSizeOnOverflow function CALLED ---');
    const header = document.getElementById('header');
    const dropdown = document.getElementById('progressDropdown');
    const detailsContainer = document.getElementById('progressDetails');
    const searchInput = document.getElementById('search-input'); // <-- 新增

    // --- MODIFIED: Check for essential container elements first ---
    if (!header || !dropdown || !detailsContainer) {
      console.warn(
        'adjustHeaderFontSizeOnOverflow: Missing essential elements (header, dropdown, or detailsContainer). Skipping execution.',
      );
      return;
    }

    const linkElement = detailsContainer.querySelector('a'); // May be null

    // --- MODIFIED: Dynamically build the list of elements to resize ---
    const elementsToResize = [{ element: dropdown, minSize: 10 }];
    if (linkElement) {
      elementsToResize.push({ element: linkElement, minSize: 8 });
    }
    if (searchInput) {
      elementsToResize.push({ element: searchInput, minSize: 12 });
    }

    // --- 記錄目標元素的初始字體大小 ---
    const initialStyles = elementsToResize.map((item) => ({
      element: item.element,
      initialSize: parseFloat(window.getComputedStyle(item.element).fontSize),
      minSize: item.minSize,
    }));

    // --- 重設行內樣式，以便計算自然寬度 ---
    initialStyles.forEach((item) => {
      item.element.style.fontSize = '';
    });
    if (linkElement) {
      linkElement.style.whiteSpace = ''; // Also reset whitespace
    }

    // 強制瀏覽器重繪
    header.offsetHeight;

    // --- 計算 Header 可用寬度與初始需求寬度 ---
    const headerWidth = header.clientWidth;
    let totalRequiredWidth = calculateTotalRequiredWidth(header);

    console.log(
      `Header Width: ${headerWidth}, Initial Required Width: ${totalRequiredWidth}`,
    );

    // --- 檢查是否溢出 ---
    const isOverflowing = totalRequiredWidth > headerWidth;
    const buffer = 1; // 允許一點點誤差

    if (isOverflowing && totalRequiredWidth - headerWidth > buffer) {
      console.log(
        `#header is overflowing by ${totalRequiredWidth - headerWidth}px. Shrinking fonts.`,
      );

      if (linkElement) {
        linkElement.style.whiteSpace = 'nowrap';
      }

      // --- 逐步縮小字體 ---
      let canShrinkMore = true;
      for (
        let i = 0;
        i < 50 && totalRequiredWidth > headerWidth && canShrinkMore;
        i++
      ) {
        canShrinkMore = false;
        let currentTotalWidthBeforeShrink = totalRequiredWidth;

        initialStyles.forEach((item) => {
          let currentElementSize = parseFloat(
            item.element.style.fontSize || item.initialSize,
          );
          if (currentElementSize > item.minSize) {
            currentElementSize -= 1;
            item.element.style.fontSize = `${currentElementSize}px`;
            canShrinkMore = true;
          } else {
            item.element.style.fontSize = `${item.minSize}px`;
          }
        });

        if (!canShrinkMore) {
          console.log('All elements reached minimum font size.');
          break;
        }

        header.offsetHeight;
        totalRequiredWidth = calculateTotalRequiredWidth(header);
        console.log(
          `  Shrunk step ${i + 1}, new required width: ${totalRequiredWidth}`,
        );

        if (
          totalRequiredWidth >= currentTotalWidthBeforeShrink &&
          canShrinkMore
        ) {
          console.warn(
            '  Width did not decrease after shrinking, breaking loop to prevent infinite loop.',
          );
          break;
        }
      }

      if (totalRequiredWidth > headerWidth) {
        console.warn(
          `Fonts shrunk to minimum, but header might still overflow by ${totalRequiredWidth - headerWidth}px.`,
        );
      } else {
        console.log(
          `Font sizes adjusted. Final required width: ${totalRequiredWidth}`,
        );
      }
    } else {
      // --- 未溢出 ---
      let stylesReset = false;
      initialStyles.forEach((item) => {
        if (item.element.style.fontSize !== '') {
          item.element.style.fontSize = '';
          stylesReset = true;
        }
      });
      if (linkElement && linkElement.style.whiteSpace !== '') {
        linkElement.style.whiteSpace = '';
        stylesReset = true;
      }
      if (stylesReset) {
        console.log('Reset font sizes to default.');
      }
    }
  }

  /**
   * 輔助函式：計算 Header 內部可見子元素的總需求寬度 (包含 gap)
   * @param {HTMLElement} headerElement - #header 元素
   * @returns {number} 總需求寬度 (px)
   */
  function calculateTotalRequiredWidth(headerElement) {
    const children = headerElement.children;
    let totalWidth = 0;
    const computedHeaderStyle = window.getComputedStyle(headerElement);
    const gapValue = parseFloat(computedHeaderStyle.gap) || 0;
    let visibleChildrenCount = 0;

    for (const child of children) {
      // 確保只計算實際顯示的元素
      if (
        child.offsetParent !== null &&
        window.getComputedStyle(child).display !== 'none'
      ) {
        totalWidth += child.scrollWidth;
        visibleChildrenCount++;
      }
    }

    // 只有在超過一個可見元素時才加上 gap
    if (visibleChildrenCount > 1) {
      totalWidth += (visibleChildrenCount - 1) * gapValue;
    }
    return totalWidth;
  }

  function adjustResultsSummaryFontSize() {
    const summaryContainer = document.getElementById('results-summary');
    const summaryText = document.getElementById('summary-text-content');

    if (
      !summaryContainer ||
      !summaryText ||
      summaryContainer.style.display === 'none' ||
      !summaryText.dataset.originalText
    ) {
      return;
    }

    // --- 1. Create a hidden helper for reliable measurement ---
    let helper = document.createElement('span');
    helper.style.position = 'absolute';
    helper.style.left = '-9999px';
    helper.style.whiteSpace = 'nowrap';
    document.body.appendChild(helper);

    // --- 2. Reset styles and get initial state ---
    summaryText.innerHTML = summaryText.dataset.originalText;
    summaryText.style.fontSize = '';
    summaryText.style.lineHeight = '';
    summaryText.style.whiteSpace = 'nowrap';
    window.getComputedStyle(summaryText).fontSize;

    const initialFontSize = parseFloat(
      window.getComputedStyle(summaryText).fontSize,
    );
    const minFontSize = g_summary_minFontSize;
    const breakThreshold = g_summary_breakThreshold;
    const containerWidth = summaryText.clientWidth;
    let currentSize = initialFontSize;
    let needsLineBreak = false;

    // --- 3. First Pass: Use helper to find single-line font size ---
    helper.style.font = window.getComputedStyle(summaryText).font;
    helper.innerHTML = summaryText.dataset.originalText;

    for (let i = 0; i < 30; i++) {
      helper.style.fontSize = `${currentSize}px`;
      if (helper.scrollWidth <= containerWidth) {
        break;
      }
      if (currentSize <= breakThreshold) {
        needsLineBreak = true;
        break;
      }
      if (currentSize <= minFontSize) break;
      currentSize -= 0.5;
    }

    // --- 4. If line break is needed, find the best two-line font size ---
    if (needsLineBreak) {
      let text = summaryText.dataset.originalText;
      let breakPoint = -1;
      const colonIndex = text.indexOf('\uff1a');
      const commaIndex = text.indexOf('，');

      if (colonIndex > -1) breakPoint = colonIndex + 1;
      else if (commaIndex > -1) breakPoint = commaIndex + 1;

      if (breakPoint > 0) {
        const line1 = text.substring(0, breakPoint);
        const line2 = text.substring(breakPoint).trim();

        currentSize = initialFontSize; // Reset for second pass
        for (let i = 0; i < 30; i++) {
          helper.style.fontSize = `${currentSize}px`;
          helper.innerHTML = line1;
          const width1 = helper.scrollWidth;
          helper.innerHTML = line2;
          const width2 = helper.scrollWidth;

          if (Math.max(width1, width2) <= containerWidth) {
            break;
          }
          if (currentSize <= minFontSize) break;
          currentSize -= 0.5;
        }
        summaryText.innerHTML = `${line1}<br>${line2}`;
        summaryText.style.whiteSpace = 'normal';
        summaryText.style.lineHeight = g_summary_tightLineHeight.toString();
      }
    }

    // --- 5. Apply the final calculated font size and clean up ---
    summaryText.style.fontSize = `${currentSize}px`;
    document.body.removeChild(helper);
  }

  const debouncedMobileSelectionHandler = debounce(function () {
    const selection = window.getSelection();
    const contentContainer = document.getElementById('generated');
    lastContextualDialectForMobile = null;
    if (
      selection &&
      selection.rangeCount > 0 &&
      selection.toString().trim().length > 0
    ) {
      const range = selection.getRangeAt(0);
      const selectedText = selection.toString().trim();
      const commonAncestorContainer = range.commonAncestorContainer;
      const trElement =
        commonAncestorContainer.nodeType === Node.ELEMENT_NODE
          ? commonAncestorContainer.closest('tr')
          : commonAncestorContainer.parentNode.closest('tr');
      if (
        trElement &&
        contentContainer.contains(trElement) &&
        selectedText.length > 0
      ) {
        let contextualDialect = null;
        if (trElement.classList.contains('accordion-row')) {
          const dialectClass = Array.from(trElement.classList).find((c) =>
            ['四縣', '海陸', '大埔', '饒平', '詔安'].includes(c),
          );
          if (dialectClass) {
            contextualDialect = dialectClass;
          }
        } else if (trElement.closest('#category-table')) {
          if (g_currentDialectInfo && g_currentDialectInfo.腔名) {
            contextualDialect = g_currentDialectInfo.腔名;
          }
        }
        lastContextualDialectForMobile = contextualDialect;
        if (!activeSelectionPopup) {
          const rect = range.getBoundingClientRect();
          showMobileLookupButton(rect);
        } else {
          hideMobileLookupButton();
        }
      } else {
        hideMobileLookupButton();
      }
    } else {
      hideMobileLookupButton();
    }
  }, 250);

  function globalKeydownHandler(event) {
    const activeElement = document.activeElement;

    const isGeneralInputLikeFocused =
      activeElement &&
      (activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.tagName === 'SELECT' ||
        activeElement.tagName === 'BUTTON' ||
        activeElement.isContentEditable);

    if (event.key === 'Escape' || event.code === 'Escape') {
      if (activeSelectionPopup) {
        event.preventDefault();
        const popupEl = document.getElementById('selectionPopup');
        const backdropEl = document.getElementById('selectionPopupBackdrop');
        hidePronunciationPopup(popupEl, backdropEl);
        console.log('Global hotkey: Escape pressed, closing selection popup.');
      } else if (infoModal && infoModal.classList.contains('is-visible')) {
        event.preventDefault();
        infoModal.classList.remove('is-visible');
        if (infoButton) infoButton.focus();
        console.log('Global hotkey: Escape pressed, closing info modal.');
      } else if (
        romanizerContainer &&
        romanizerContainer.classList.contains('is-visible')
      ) {
        event.preventDefault();
        document.dispatchEvent(new CustomEvent('closeRomanizer'));
        const showRomanizerBtn = document.getElementById('showRomanizerBtn');
        if (showRomanizerBtn) showRomanizerBtn.focus();
        console.log(
          'Global hotkey: Escape pressed, closing romanizer modal via custom event.',
        );
      } else if (dailyWordModal && dailyWordModal.style.display === 'flex') {
        event.preventDefault();
        dailyWordModal.style.display = 'none';
        if (location.hash === '#daily') {
          history.pushState(null, '', location.pathname + location.search);
        }
        const floatingDailyBtn = document.getElementById('dailyWordBtn');
        if (floatingDailyBtn) floatingDailyBtn.focus();
        console.log('Global hotkey: Escape pressed, closing daily word modal.');
      } else if (
        isGeneralInputLikeFocused &&
        activeElement &&
        activeElement.tagName !== 'BODY'
      ) {
        if (activeElement) {
          activeElement.blur();
          event.preventDefault();
          console.log(
            'Global hotkey: Escape pressed, blurred active element:',
            activeElement,
          );
        }
      } else if (isPlaying) {
        const stopButton = document.getElementById('stopBtn');
        if (stopButton) {
          stopButton.click();
          console.log(
            'Global hotkey: Escape pressed (no interactive focus/popup closed), stopping playback.',
          );
        }
      }
      return;
    }

    if (
      !activeSelectionPopup &&
      (event.key === ' ' || event.code === 'Space')
    ) {
      if (!isGeneralInputLikeFocused) {
        if (isPlaying) {
          event.preventDefault();
          const pauseResumeButton = document.getElementById('pauseResumeBtn');
          if (pauseResumeButton) {
            pauseResumeButton.click();
            console.log(
              'Global hotkey: Spacebar pressed (isPlaying), toggling pause/resume.',
            );
          }
        } else {
          const progressDropdown = document.getElementById('progressDropdown');
          if (progressDropdown && progressDropdown.options.length > 1) {
            event.preventDefault();
            const selectedValue = progressDropdown.options[1].value;
            const bookmarks =
              JSON.parse(localStorage.getItem('hakkaBookmarks')) || [];
            const firstBookmark = bookmarks.find(
              (bm) => bm.tableName + '||' + bm.cat === selectedValue,
            );

            if (firstBookmark) {
              const targetTableName = firstBookmark.tableName;
              const targetCategory = firstBookmark.cat;
              const targetRowIdToGo = firstBookmark.rowId;
              const dataVarName = mapTableNameToDataVar(targetTableName);

              if (dataVarName) {
                let dataObject = window[dataVarName];
                if (typeof dataObject !== 'undefined') {
                  console.log(
                    'Global hotkey: Spacebar pressed (!isPlaying), loading first bookmark:',
                    firstBookmark,
                  );

                  document
                    .querySelectorAll('span[data-varname]')
                    .forEach((span) => {
                      span.classList.remove('active-dialect-level');
                    });
                  const activeDialectSpan = document.querySelector(
                    `.dialect > span[data-varname="${dataVarName}"]`,
                  );
                  if (activeDialectSpan) {
                    activeDialectSpan.classList.add('active-dialect-level');
                  }
                  generate(dataObject, targetCategory, targetRowIdToGo);
                  progressDropdown.selectedIndex = 1;
                }
              }
            }
          }
        }
      }
    }
  }

  if (isMobileDevice()) {
    createMobileLookupButton();
    document.addEventListener(
      'selectionchange',
      debouncedMobileSelectionHandler,
    );
  } else {
    contentContainer.addEventListener('mouseup', (event) => {
      handleTextSelectionInSentence(
        event,
        selectionPopup,
        selectionPopupContent,
        selectionPopupBackdrop,
        contentContainer,
      );
    });
  }

  document.addEventListener('keydown', globalKeydownHandler);

  document.addEventListener('click', (event) => {
    if (event.target.tagName === 'BUTTON' || event.target.closest('button')) {
      const button =
        event.target.tagName === 'BUTTON'
          ? event.target
          : event.target.closest('button');
      setTimeout(() => button.blur(), 300);
    }
  });

  // --- 新增：更新網頁標題函式 ---
  const BASE_TITLE = '客源翠 HakSpring';
  function updatePageTitle(titleParts = []) {
    if (titleParts.length === 0) {
      document.title = BASE_TITLE;
    } else {
      // 將各部分用分隔符號串接，並在最後加上專案名稱
      document.title = [...titleParts, '客源翠 HakSpring'].join(' - ');
    }
  }

  function preprocessAllData() {
    console.log('開始根據快取資料建立搜尋索引...');
    const startTime = performance.now();
    const allDataSourceVars = [...allKnownDataVars, ...allKnownGipDataVars];

    // 清空舊的快取，確保索引是最新的
    preprocessedDataCache = {};
    indexedDataCache = {};

    // 步驟 1: 資料已在 loadDataFromDB 中載入到 window，直接從 window 讀取
    allDataSourceVars.forEach((dataVarName) => {
      const dataObject = window[dataVarName];
      // Corrected check for the new data structure { name: '...', content: [...] }
      if (
        dataObject &&
        dataObject.content &&
        Array.isArray(dataObject.content)
      ) {
        preprocessedDataCache[dataVarName] = dataObject.content;
      } else {
        // console.warn(`建立索引時找不到或格式不符的資料變數: ${dataVarName}`);
      }
    });

    // 步驟 2: 根據已解析的資料，建立索引 (這部分邏輯與您原本的程式碼相同)
    for (const dataVarName in preprocessedDataCache) {
      const vocabularyArray = preprocessedDataCache[dataVarName];
      const isGipData = dataVarName.startsWith('教典');
      let sourceName;

      if (isGipData) {
        const gipNameMap = {
          教典四: '四縣教典',
          教典海: '海陸教典',
          教典大: '大埔教典',
          教典平: '饒平教典',
          教典安: '詔安教典',
          教典南: '南四縣教典',
        };
        sourceName = gipNameMap[dataVarName] || dataVarName;
      } else {
        sourceName = getFullLevelName(dataVarName);
      }

      vocabularyArray.forEach((line) => {
        const term = line.客家語 ? line.客家語.trim() : null;
        if (term && term.length > 0) {
          if (!indexedDataCache[term]) {
            indexedDataCache[term] = [];
          }
          indexedDataCache[term].push({
            pronunciation: formatPhoneticForDisplay(line['客語標音_顯示']),
            source: sourceName,
            isExactMatch: true,
            originalTerm: term,
            mandarinMeaning: line.華語詞義,
            audioDetails: {
              lineData: { ...line },
              fullSourceName: isGipData ? 'gip' : 'cert' + dataVarName,
            },
          });
        }
      });
    }

    const endTime = performance.now();
    console.log(
      `搜尋索引建立完成，耗時：${(endTime - startTime).toFixed(2)} 毫秒。`,
    );
    console.log(
      `總共索引了 ${Object.keys(indexedDataCache).length} 筆獨特詞彙。`,
    );
    
    // 初始化沙盒展示區的音檔
    initShowcaseAudio();
  }

  function initShowcaseAudio() {
    const rows = document.querySelectorAll('#sandhi-showcase tbody tr[data-search-word]');
    rows.forEach(row => {
      if (row.hasAttribute('data-audio-init')) return;
      
      const word = row.getAttribute('data-search-word');
      const dialectPrefix = row.getAttribute('data-dialect-prefix');
      const sentenceFilter = row.getAttribute('data-search-sentence');
      
      const matches = indexedDataCache[word];
      if (matches && matches.length > 0) {
        const match = matches.find(m => {
           const isDialect = m.audioDetails.fullSourceName.includes(dialectPrefix);
           const isSentence = sentenceFilter ? (m.audioDetails.lineData.例句 || '') === sentenceFilter : true;
           return isDialect && isSentence;
        }) || matches.find(m => m.audioDetails.fullSourceName.includes(dialectPrefix)); // 找不到完美句子就用第一個符合腔調的
        
        if (match) {
          const { lineData, fullSourceName } = match.audioDetails;
          let wordAudioSrc = typeof constructWordAudioUrl === 'function' ? constructWordAudioUrl(lineData, fullSourceName) : null;
          let sentenceAudioSrc = typeof constructSentenceAudioUrl === 'function' ? constructSentenceAudioUrl(lineData, fullSourceName) : null;
          
          // 套用 proxy 繞過 CORS
          if (wordAudioSrc && typeof applyAudioProxy === 'function') wordAudioSrc = applyAudioProxy(wordAudioSrc);
          if (sentenceAudioSrc && typeof applyAudioProxy === 'function') sentenceAudioSrc = applyAudioProxy(sentenceAudioSrc);
          
          const tdWord = row.querySelector('td[data-label="詞彙"]');
          const tdSentence = row.querySelector('td[data-label="例句"]');
          
          if (tdWord && wordAudioSrc) {
            const audio = document.createElement('audio');
            audio.className = 'media';
            audio.controls = true;
            audio.preload = 'none';
            audio.src = wordAudioSrc;
            
            const meaningSpan = tdWord.querySelector('.mandarin-meaning');
            if (meaningSpan) {
              tdWord.insertBefore(audio, meaningSpan);
              tdWord.insertBefore(document.createElement('br'), meaningSpan);
            } else {
              tdWord.appendChild(document.createElement('br'));
              tdWord.appendChild(audio);
            }
          }
          
          if (tdSentence && sentenceAudioSrc) {
            const audio = document.createElement('audio');
            audio.className = 'media';
            audio.controls = true;
            audio.preload = 'none';
            audio.src = sentenceAudioSrc;
            // 為了美觀，若有例句文字且有音檔，才換行
            if (tdSentence.textContent.trim().length > 0) {
              tdSentence.appendChild(document.createElement('br'));
            }
            tdSentence.appendChild(audio);
          }
        }
      }
      row.setAttribute('data-audio-init', 'true');
    });
  }

  // --- 新增：根據 #generated 內容，控制 #results-summary 顯示或隱藏 ---
  function updateResultsSummaryVisibility() {
    const resultsSummaryContainer = document.getElementById('results-summary');
    const summaryTextContent = document.getElementById('summary-text-content');
    if (!resultsSummaryContainer || !summaryTextContent) return;

    if (summaryTextContent.textContent.trim() !== '') {
      resultsSummaryContainer.style.display = 'flex';
    } else {
      resultsSummaryContainer.style.display = 'none';
    }
  }

  /**
   * 從表格名稱 (例如 "四縣基礎級") 解析出腔調和級別代碼。
   * @param {string} tableName - 表格名稱 (例如 "四縣基礎級")
   * @returns {object|null} 包含 dialect 和 level 代碼的物件，或在無法解析時返回 null。
   */
  function extractDialectLevelCodes(tableName) {
    if (!tableName || typeof tableName !== 'string') {
      console.error('無效的 tableName:', tableName);
      return null;
    }

    let dialectCode = '';
    let levelCode = '';

    // 提取腔調部分
    if (tableName.startsWith('四縣')) {
      dialectCode = 'si';
    } else if (tableName.startsWith('海陸')) {
      dialectCode = 'ha';
    } else if (tableName.startsWith('大埔')) {
      dialectCode = 'da';
    } else if (tableName.startsWith('饒平')) {
      dialectCode = 'rh';
    } else if (tableName.startsWith('詔安')) {
      dialectCode = 'zh';
    } else {
      console.error('無法從 tableName 解析腔調:', tableName);
      return null; // 無法識別腔調
    }

    // 提取級別部分
    if (tableName.endsWith('基礎級')) {
      levelCode = '5'; // 基礎級對應代碼 5
    } else if (tableName.endsWith('初級')) {
      levelCode = '1'; // 初級對應代碼 1
    } else if (tableName.endsWith('中級')) {
      levelCode = '2'; // 中級對應代碼 2
    } else if (tableName.endsWith('中高級')) {
      levelCode = '3'; // 中高級對應代碼 3
    } else if (tableName.endsWith('高級')) {
      levelCode = '4'; // 高級對應代碼 4
    } else {
      console.error('無法從 tableName 解析級別:', tableName);
      return null; // 無法識別級別
    }

    return { dialect: dialectCode, level: levelCode };
  }

  // --- 新增：所有已知的資料變數名稱 (用於「共腔尋詞」) ---
  const allKnownDataVars = [
    '四基',
    '四初',
    '四中',
    '四中高',
    '四高',
    '海基',
    '海初',
    '海中',
    '海中高',
    '海高',
    '大基',
    '大初',
    '大中',
    '大中高',
    '大高',
    '平基',
    '平初',
    '平中',
    '平中高',
    '平高',
    '安基',
    '安初',
    '安中',
    '安中高',
    '安高',
  ];

  // --- 新增：所有教典資料變數名稱 ---
  const allKnownGipDataVars = [
    '教典四',
    '教典海',
    '教典大',
    '教典平',
    '教典安',
    '教典南',
  ];

  // 新增：腔調代碼與腔調名稱的對應
  const DIALECT_CODE_TO_NAME = {
    si: '四縣',
    na: '南四縣',
    ha: '海陸',
    da: '大埔',
    rh: '饒平',
    zh: '詔安',
  };
  const DIALECT_NAME_TO_CODE = {
    四縣: 'si',
    南四縣: 'na',
    海陸: 'ha',
    大埔: 'da',
    饒平: 'rh',
    詔安: 'zh',
  };

  // --- 新增：當學習模式改變時，同步更新查詞腔調設定 ---
  function updateSearchDialect(dialectName) {
    if (!dialectName) return;

    // 1. 更新 localStorage
    localStorage.setItem('lastSearchDialect', dialectName);
    console.log(
      `學習模式觸發：查詞腔調已更新並儲存到 localStorage: "${dialectName}"`,
    );

    // 2. 更新查詞 popup 裡肚个 radio button
    const radioToSelect = document.querySelector(
      `#search-popup input[name="dialect"][value="${dialectName}"]`,
    );
    if (radioToSelect) {
      radioToSelect.checked = true;
      console.log(
        `學習模式觸發：查詞介面个腔調 radio button 已更新為 "${dialectName}"`,
      );
    } else {
      console.warn(`無法尋著對應个查詞腔調 radio button: "${dialectName}"`);
    }
  }

  // 加入新的可選參數：initialCategory, targetRowId
  /**
   * [新增] 取得目前頁面的基底 URL，並確保路徑中不包含 index.html。
   * @returns {URL} 一個新的 URL 物件。
   */
  function getBaseUrlWithoutIndex() {
    const url = new URL(window.location.href);
    if (url.pathname.endsWith('/index.html')) {
      url.pathname = url.pathname.slice(0, -10); // 拿掉 "index.html"
    }
    return url;
  }

  /**
   * [新增] 根據當前的腔調級別和類別，更新瀏覽器 URL 並新增一筆歷史紀錄。
   * @param {object} dialectInfo - 包含腔調級別資訊的物件。
   * @param {string} selectedCategory - 使用者選擇的類別名稱。
   */
  function updateUrlForCategory(dialectInfo, selectedCategory) {
    const dialectLevelCodes = extractDialectLevelCodes(dialectInfo.fullLvlName);
    if (dialectLevelCodes) {
      const newUrl = getBaseUrlWithoutIndex();
      newUrl.searchParams.set('dialect', dialectLevelCodes.dialect);
      newUrl.searchParams.set('level', dialectLevelCodes.level);
      newUrl.searchParams.set('category', selectedCategory);

      // 拿忒所有其他無相關个參數，確保 URL 淨俐
      newUrl.searchParams.delete('row');
      newUrl.searchParams.delete('musiid');
      newUrl.searchParams.delete('ca');
      newUrl.searchParams.delete('bidsu');
      newUrl.searchParams.delete('iab');
      newUrl.searchParams.delete('kiong');

      // 只有在產生的新 URL 和當前 URL 不同的情況下，才執行 pushState
      if (newUrl.toString() !== window.location.href) {
        history.pushState({}, '', newUrl.toString());
        console.log(`URL 已更新: ${newUrl.toString()}`);
      }
    }
  }

  /**
   * 從資料中抽取所有類別，並依官方編號排序
   * @param {Array} data - 詞彙資料陣列
   * @returns {Array} - 排序後的類別陣列（含數字前綴，如 "1人體與醫療"）
   */
  function getOfficialCategories(data) {
    const cats = new Set();
    data.forEach((item) => {
      if (item.分類) cats.add(item.分類);
    });
    return Array.from(cats).sort((a, b) => {
      const matchA = a.match(/^\d+/);  // 修正：使用錨點 ^ 確保只匹配開頭數字
      const matchB = b.match(/^\d+/);
      const numA = matchA ? parseInt(matchA[0], 10) : 0;
      const numB = matchB ? parseInt(matchB[0], 10) : 0;
      return numA - numB;
    });
  }

  /**
   * 格式化類別標籤，將 "1人體與醫療" 轉換成 "1. 人體與醫療"
   * @param {string} catStr - 原始類別字串（如 "1人體與醫療"）
   * @returns {string} - 格式化後的類別標籤（如 "1. 人體與醫療"）
   */
  function formatCategoryLabel(catStr) {
    const match = catStr.match(/^(\d+)(.*)$/);
    if (match) {
      return `${parseInt(match[1], 10)}. ${match[2]}`;
    }
    return catStr;
  }

  /**
   * 動態渲染類別面板
   * @param {Array} categories - 類別陣列（含數字前綴，如 "1人體與醫療"）
   */
  function renderCategoryPanel(categories) {
    const catPanel = document.getElementById('cat-panel');
    if (!catPanel) return;

    catPanel.innerHTML = '再擇類別：\n          ';

    // 邊界處理：如果沒有類別，顯示提示訊息
    if (!categories || categories.length === 0) {
      console.warn('renderCategoryPanel: 沒有可用的類別資料');
      return;
    }

    categories.forEach((cat) => {
      const label = document.createElement('label');
      label.className = 'radioItem';

      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'category';
      radio.className = 'radioButton';
      // 重要：radio.value 儲存不含數字前綴的類別名（如 "人體與醫療"），以確保書籤相容性
      radio.value = cat.replace(/^\d+/, '');

      // 顯示文字包含數字前綴（如 "1. 人體與醫療"）
      const labelText = formatCategoryLabel(cat);
      label.appendChild(radio);
      label.appendChild(document.createTextNode('\n            ' + labelText + '\n          '));
      catPanel.appendChild(label);
      catPanel.appendChild(document.createTextNode('\n          '));
    });
  }

  // --- generate() 函式從這裡開始 ---
  function generate(content, initialCategory = null, targetRowId = null) {
    console.log('Generate called for:', content.name);
    currentDataVarName = content.name; // Keep track of the active file var name
    currentActiveDialectLevelFullName = getFullLevelName(content.name);
    g_currentLevelData = [...content.content]; // Create a mutable copy to be sorted

    const 腔 = content.name.substring(0, 1);
    const 級 = content.name.substring(1);
    const dialectInfo = getDialectInfo(腔, 級);

    if (dialectInfo.腔名) {
      currentDialect = dialectInfo.腔名;
      currentActiveMainDialectName = dialectInfo.腔名;
      updateSearchDialect(dialectInfo.腔名);
    }
    
    const gameControls = document.getElementById('game-controls');
    if (gameControls) gameControls.style.display = 'block';

    // --- 動態渲染類別面板（使用官方類別順序） ---
    const officialCategories = getOfficialCategories(content.content);
    renderCategoryPanel(officialCategories);

    // --- BUG FIX: Sort level data according to UI category order for correct progress calculation ---
    // Moved here after panel rendering to ensure we use the current UI order.
    const categoryOrder = Array.from(
      document.querySelectorAll('#cat-panel input[name="category"]'),
    ).map((radio) => radio.value);

    const getSortIndex = (itemCategories) => {
      if (!itemCategories) return categoryOrder.length; // Put items without category at the end
      // 移除資料中類別的數字前綴以進行比對
      const cleanedItemCat = itemCategories.replace(/^\d+/, '');
      for (let i = 0; i < categoryOrder.length; i++) {
        if (cleanedItemCat === categoryOrder[i]) {
          return i;
        }
      }
      return categoryOrder.length; // If no match found, put at the end
    };

    g_currentLevelData.sort((a, b) => {
      const indexA = getSortIndex(a.分類);
      const indexB = getSortIndex(b.分類);

      if (indexA !== indexB) {
        return indexA - indexB;
      }

      // If primary categories are the same, sort by the original '編號' to maintain internal order.
      const [catPartA, numPartA] = a.編號.split('-').map(Number);
      const [catPartB, numPartB] = b.編號.split('-').map(Number);
      if (catPartA !== catPartB) {
        return catPartA - catPartB;
      }
      return numPartA - numPartB;
    });
    // --- End of BUG FIX ---

    document.querySelectorAll('.radioItem').forEach((label) => {
      label.classList.remove('active-category');
    });
    if (!initialCategory && !targetRowId) {
      const progressDetailsSpan = document.getElementById('progressDetails');
      if (progressDetailsSpan) progressDetailsSpan.textContent = '';
    }

    // --- 在底下加入這一行，確保 categoryList 總是更新的 ---
    categoryList = Array.from(
      document.querySelectorAll('input[name="category"]'),
    ).map((radio) => radio.value);

    var contentContainer = document.getElementById('generated');
    contentContainer.innerHTML = '';

    const catPanel = document.getElementById('cat-panel');
    if (catPanel) {
      const catPanelClone = catPanel.cloneNode(true);
      catPanel.parentNode.replaceChild(catPanelClone, catPanel);
    } else {
      console.error('Could not find #cat-panel to clone.');
    }

    var radios = document.querySelectorAll('input[name="category"]');
    const radioLabels = document.querySelectorAll('.radioItem');

    radios.forEach(function (radio) {
      radio.addEventListener('change', function () {
        // 【關鍵修正】只在不是由程式碼觸發導航時才執行
        if (!isNavigatingViaCode) {
          // <--- 拿掉 !isCrossCategoryPlaying 以修正 regression
          if (this.checked) {
            const selectedCategory = this.value;

            // --- 將原本一大段 pushState 邏輯，替換成底下這一行 ---
            updateUrlForCategory(dialectInfo, selectedCategory);

            // 移除舊的樣式設定和進度詳情清除，統一由 buildTableAndSetupPlayback 處理
            radioLabels.forEach((label) =>
              label.classList.remove('active-category'),
            );
            const currentLabel = this.closest('.radioItem');
            if (currentLabel) {
              currentLabel.classList.add('active-category');
            }

            buildTableAndSetupPlayback(
              selectedCategory,
              g_currentLevelData,
              dialectInfo,
            );
          }
        }
      });
    });

    if (initialCategory) {
      const targetRadio = document.querySelector(
        `input[name="category"][value="${initialCategory}"]`,
      );
      if (targetRadio) {
        targetRadio.checked = true;
        const targetLabel = targetRadio.closest('.radioItem');
        if (targetLabel) {
          radioLabels.forEach((label) =>
            label.classList.remove('active-category'),
          );
          targetLabel.classList.add('active-category');
        }
        // --- 【關鍵修正】在這裡手動呼叫 URL 更新函式 ---
        updateUrlForCategory(dialectInfo, initialCategory);

        buildTableAndSetupPlayback(
          initialCategory,
          g_currentLevelData,
          dialectInfo,
          targetRowId,
        );
      } else {
        console.warn('找不到要自動選擇的類別按鈕:', initialCategory);
      }
    } else {
      updatePageTitle([currentActiveDialectLevelFullName]);
      radios.forEach((radio) => (radio.checked = false));
      contentContainer.innerHTML =
        '<p style="text-align: center; margin-top: 20px;">請選擇一個類別來顯示詞彙。</p>';
      updateResultsSummaryVisibility();
      document.querySelector('#audioControls')?.remove();
    }
    setTimeout(adjustHeaderFontSizeOnOverflow, 0);
  }

  function buildTableAndSetupPlayback(
    category,
    vocabularyArray,
    dialectInfo,
    autoPlayTargetRowId = null,
  ) {
    const contentContainer = document.getElementById('generated');

    // 1. Reset global state for the new category
    g_currentDialectInfo = dialectInfo;
    g_currentCategory = category;
    g_audioElementsList = []; // This list is no longer pre-populated, but kept for potential future use
    g_bookmarkButtonsList = [];
    currentAudioIndex = 0;
    isPlaying = false;
    isPaused = false;
    window.removeEventListener('scroll', scrollHandler); // Remove old listener

    // 2. Filter data and handle empty category
    activeCategoryData = vocabularyArray.filter(
      (line) => line.分類 && line.分類.replace(/^\d+/, '') === category,
    );
    const totalResults = activeCategoryData.length;

    if (totalResults === 0) {
      // If in cross-category playback mode, handle advancing automatically
      if (isCrossCategoryPlaying) {
        console.log(
          `Category "${category}" is empty, playing notification and skipping.`,
        );
        contentContainer.innerHTML = `<p style="text-align: center; margin-top: 20px;">${dialectInfo.級名} 無「${category}」个內容，馬上跳到下一類...</p>`;
        updateResultsSummaryVisibility(); // Update summary to show the message

        const emptyCategoryAudio = new Audio('empty_category.mp3');

        // Play the sound, then advance. If sound fails, advance immediately.
        emptyCategoryAudio.addEventListener('ended', advanceToNextCategory);
        emptyCategoryAudio.play().catch((err) => {
          console.error(
            'Could not play empty_category.mp3, skipping directly.',
            err,
          );
          advanceToNextCategory();
        });
      } else {
        // Original behavior when not in continuous play mode
        contentContainer.innerHTML = `<p style="text-align: center; margin-top: 20px;">${dialectInfo.級名} 無「${category}」个內容。</p>`;
        document.querySelector('#audioControls')?.remove();
        updateResultsSummaryVisibility();
      }
      return; // Important to stop further execution for this empty category
    }

    // 3. Determine initial rendering range
    let start = 0;
    if (autoPlayTargetRowId) {
      const normalizedTargetId = normalizeRowId(autoPlayTargetRowId);
      const targetIndex = activeCategoryData.findIndex(
        (item) => item.編號.split('-')[1] === normalizedTargetId,
      );
      if (targetIndex !== -1) {
        start = Math.floor(targetIndex / ITEMS_PER_LOAD) * ITEMS_PER_LOAD;
      }
    }
    firstLoadedIndex = start;
    lastLoadedIndex = Math.min(start + ITEMS_PER_LOAD, totalResults);
    const initialItems = activeCategoryData.slice(
      firstLoadedIndex,
      lastLoadedIndex,
    );

    // 4. Render the initial chunk of items (no return value handled)
    renderCategoryItems(
      initialItems,
      dialectInfo,
      category,
      true,
      totalResults,
      autoPlayTargetRowId,
    );

    // 5. Setup controls and event listeners
    setupPlaybackControls(
      dialectInfo,
      category,
      totalResults,
      autoPlayTargetRowId,
    );
    setupDynamicEventListeners(dialectInfo, category);

    // 6. Setup infinite scroll
    if (totalResults > ITEMS_PER_LOAD) {
      window.addEventListener('scroll', scrollHandler);
    }

    // 7. Handle auto-play for the specific row if requested
    if (autoPlayTargetRowId) {
      handleAutoPlay(autoPlayTargetRowId, dialectInfo, category);
    }
    // --- 在此處新增 else if 區塊 ---
    else if (isCrossCategoryPlaying) {
      // 如果是跨類別播放，自動從新類別的第一筆開始
      console.log('偵測到 isCrossCategoryPlaying，自動從頭播放。');
      startPlayingFromIndex(0); // 行動裝置頂項螢幕關忒个時節，setTimeout 會中斷跨類別放送！下後都莫再過加 setTimeout！
    }

    // 8. Final UI updates
    const fullCategoryName = getFullOfficialCategoryName(
      category,
      vocabularyArray,
    );
    const formattedCategory = formatCategoryLabel(fullCategoryName);
    updatePageTitle([dialectInfo.fullLvlName, formattedCategory]);
    setTimeout(adjustHeaderFontSizeOnOverflow, 0);
    updateResultsSummaryVisibility();
    isCrossCategoryPlaying = false; // 這隻旗標應該愛放在這位，做毋得放在函式最頭前
  }

  function renderCategoryItems(
    itemsToRender,
    dialectInfo,
    category,
    isInitialLoad,
    totalResults,
    autoPlayTargetRowId = null,
    prepend = false,
  ) {
    const contentContainer = document.getElementById('generated');
    let table = document.getElementById('category-table');
    let tbody;

    if (isInitialLoad) {
      // --- Auto Bookmark Mode: Clean up audio event listeners before clearing ---
      const existingTable = document.getElementById('category-table');
      if (existingTable) {
        const audioElements = existingTable.querySelectorAll('audio.media');
        audioElements.forEach((audio) => {
          const handler = audioPlayHandlers.get(audio);
          if (handler) {
            audio.removeEventListener('play', handler);
            audioPlayHandlers.delete(audio);
          }
        });
      }
      // --- End of Auto Bookmark Mode ---

      contentContainer.innerHTML = '';
      document.querySelector('#audioControls')?.remove();

      const summaryTextContent = document.getElementById(
        'summary-text-content',
      );
      if (summaryTextContent) {
        const fullCategoryName = getFullOfficialCategoryName(
          category,
          activeCategoryData,
        );
        const formattedCategory = formatCategoryLabel(fullCategoryName);

        let summaryText = `${dialectInfo.fullLvlName}：${formattedCategory}`;
        if (totalResults > 0) {
          summaryText += ` (${totalResults})`;
        }
        summaryTextContent.textContent = summaryText;
        summaryTextContent.dataset.originalText = summaryText; // Set data attribute with the full text
        const resultsSummaryContainer =
          document.getElementById('results-summary');
        if (resultsSummaryContainer && !autoPlayTargetRowId) {
          resultsSummaryContainer.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
          });
        }
      }

      table = document.createElement('table');
      table.id = 'category-table';
      table.setAttribute('width', '100%');
      tbody = table.createTBody();
      contentContainer.appendChild(table);
    } else {
      table = document.getElementById('category-table');
      tbody = table.tBodies[0];
    }

    if (!table || !tbody) {
      console.error('renderCategoryItems: Table or tbody does not exist!');
      return;
    }

    const fragment = document.createDocumentFragment();

    for (const line of itemsToRender) {
      const originalRowId = line.編號.split('-')[1];

      const missingAudioInfo =
        typeof getMissingAudioInfo === 'function'
          ? getMissingAudioInfo(dialectInfo.fullLvlName, category, line.編號)
          : null;
      let mediaYr = dialectInfo.generalMediaYr;
      let pre112Insertion詞 = '',
        pre112Insertion句 = '';
      let 詞目錄級 = dialectInfo.目錄級,
        句目錄級 = dialectInfo.目錄級;
      let mediaNo = '';
      var no = line.編號.split('-');
      if (no[0] <= 9) no[0] = '0' + no[0];
      if (dialectInfo.級 === '初') no[0] = '0' + no[0];
      if (no[1] <= 9) no[1] = '0' + no[1];
      if (no[1] <= 99) no[1] = '0' + no[1];
      mediaNo = no[1];
      const index = dialectInfo.例外音檔.findIndex(
        ([編號]) => 編號 === line.編號,
      );
      if (index !== -1) {
        const matchedElement = dialectInfo.例外音檔[index];
        mediaYr = matchedElement[1];
        mediaNo = matchedElement[2];
        pre112Insertion詞 = 'w/';
        pre112Insertion句 = 's/';
        if (dialectInfo.目錄另級 !== undefined) {
          詞目錄級 = dialectInfo.目錄另級;
          句目錄級 = dialectInfo.目錄另級;
        }
      }
      const 詞目錄 = `${詞目錄級}/${dialectInfo.檔腔}/${pre112Insertion詞}${dialectInfo.檔級}${dialectInfo.檔腔}`;
      const 句目錄 = `${句目錄級}/${dialectInfo.檔腔}/${pre112Insertion句}${dialectInfo.檔級}${dialectInfo.檔腔}`;
      const item = document.createElement('tr');

      const td1 = document.createElement('td');
      td1.className = 'no';
      td1.dataset.label = '編號';
      const anchor = document.createElement('a');
      anchor.name = originalRowId;
      td1.appendChild(anchor);
      const bookmarkBtn = document.createElement('button');
      bookmarkBtn.className = 'bookmarkBtn number-btn';
      bookmarkBtn.dataset.rowId = originalRowId;
      bookmarkBtn.innerHTML = `${line.編號} <i class="fas fa-bookmark"></i>`;
      td1.appendChild(bookmarkBtn);

      // Add the cross-dialect comparison button only if there are matches
      const crossDialectResults = findCrossDialectRows(line, dialectInfo, false);
      if (crossDialectResults.length > 0) {
        const crossDialectBtn = document.createElement('button');
        crossDialectBtn.className = 'crossDialectBtn';
        crossDialectBtn.title = '跨腔調對照';
        crossDialectBtn.innerHTML = '<i class="fas fa-plus-circle"></i>';
        crossDialectBtn.addEventListener('click', (event) => {
          toggleAccordion(event, line, dialectInfo);
        });
        td1.appendChild(crossDialectBtn);
      }

      const playBtn = document.createElement('button');
      playBtn.className = 'playFromThisRow';
      playBtn.dataset.rowId = originalRowId;
      playBtn.title = '從此列播放';
      playBtn.innerHTML = '<i class="fas fa-play"></i>';
      td1.appendChild(playBtn);

      const loopOneBtn = document.createElement('button');
      loopOneBtn.className = 'loop-one-btn';
      loopOneBtn.dataset.rowId = originalRowId;
      loopOneBtn.title = '循環播放此行';
      loopOneBtn.innerHTML = '<i class="fas fa-repeat"></i>';
      td1.appendChild(loopOneBtn);

      item.appendChild(td1);

      const td2 = document.createElement('td');
      td2.dataset.label = '詞彙';
      const ruby = document.createElement('ruby');
      ruby.textContent = line.客家語;
      const rt = document.createElement('rt');
      let phoneticText = formatPhoneticForDisplay(line['客語標音_顯示']);
      const dialectCode = getDialectCode(dialectInfo.腔);

      if (dialectCode) {
        phoneticText = getSandhiHtml(phoneticText, dialectCode);
      }
      rt.innerHTML = phoneticText;
      ruby.appendChild(rt);
      td2.appendChild(ruby);
      td2.appendChild(document.createElement('br'));
      if (missingAudioInfo && missingAudioInfo.word === false) {
        const dummyAudio = document.createElement('audio');
        dummyAudio.className = 'media';
        dummyAudio.dataset.skip = 'true';
        dummyAudio.style.display = 'none';
        td2.appendChild(dummyAudio);
      } else {
        const audio1 = document.createElement('audio');
        audio1.className = 'media';
        audio1.controls = true;
        audio1.preload = 'none';
        let wordAudioSrc = applyAudioProxy(`https://elearning.hakka.gov.tw/hakka/files/cert/vocabulary/${mediaYr}/${詞目錄}-${no[0]}-${mediaNo}.mp3`);
        if (dialectInfo.fullLvlName === '海陸中高級' && line.編號 === '4-261') {
          wordAudioSrc = applyAudioProxy(
            'https://elearning.hakka.gov.tw/hakka/files/dictionaries/3/hk0000014571/hk0000014571-1-2.mp3',
          );
        }
        audio1.src = wordAudioSrc;

        // --- Auto Bookmark Mode: Add play event listener with proper cleanup ---
        const wordPlayHandler = () => {
          const autoBookmarkEnabled =
            localStorage.getItem('autoBookmarkMode') === 'true';
          if (autoBookmarkEnabled && dialectInfo.腔 && dialectInfo.級) {
            const itemIndex = activeCategoryData.findIndex(
              (item) => item.編號 === line.編號,
            );
            if (itemIndex !== -1) {
              const paddedRowId = padRowIdForLegacy(originalRowId);
              const totalRows = activeCategoryData.length;
              const percentage = (((itemIndex + 1) / totalRows) * 100).toFixed(
                2,
              );
              saveBookmark(
                paddedRowId,
                percentage,
                category,
                dialectInfo.fullLvlName,
                false,
              );
            }
          }
        };

        // Remove old handler if exists
        const oldHandler = audioPlayHandlers.get(audio1);
        if (oldHandler) {
          audio1.removeEventListener('play', oldHandler);
        }

        // Add new handler and store it
        audio1.addEventListener('play', wordPlayHandler);
        audioPlayHandlers.set(audio1, wordPlayHandler);
        // --- End of Auto Bookmark Mode ---

        td2.appendChild(audio1);
      }
      td2.appendChild(document.createElement('br'));
      const meaningSpan = document.createElement('span');
      meaningSpan.innerHTML = line.華語詞義
        .replace(/"/g, '')
        .replace(/\n/g, '<br>');
      td2.appendChild(meaningSpan);
      if (line.備註 && line.備註.trim() !== '') {
        const notesP = document.createElement('p');
        notesP.className = 'notes';
        notesP.textContent = `（${line.備註}）`;
        td2.appendChild(notesP);
      }
      item.appendChild(td2);

      const td3 = document.createElement('td');
      td3.dataset.label = '例句';
      if (line.例句 && line.例句.trim() !== '') {
        const sentenceSpan = document.createElement('span');
        sentenceSpan.className = 'sentence';
        sentenceSpan.innerHTML = line.例句
          .replace(/"/g, '')
          .replace(/\n/g, '<br>');
        td3.appendChild(sentenceSpan);
        td3.appendChild(document.createElement('br'));
        if (
          dialectInfo.級名 === '高級' ||
          (missingAudioInfo && missingAudioInfo.sentence === false)
        ) {
          const dummyAudio = document.createElement('audio');
          dummyAudio.className = 'media';
          dummyAudio.dataset.skip = 'true';
          dummyAudio.style.display = 'none';
          td3.appendChild(dummyAudio);
        } else {
          const audio2 = document.createElement('audio');
          audio2.className = 'media';
          audio2.controls = true;
          audio2.preload = 'none';
          audio2.src = applyAudioProxy(`https://elearning.hakka.gov.tw/hakka/files/cert/vocabulary/${mediaYr}/${句目錄}-${no[0]}-${mediaNo}s.mp3`);

          // --- Auto Bookmark Mode: Add play event listener with proper cleanup ---
          const sentencePlayHandler = () => {
            const autoBookmarkEnabled =
              localStorage.getItem('autoBookmarkMode') === 'true';
            if (autoBookmarkEnabled && dialectInfo.腔 && dialectInfo.級) {
              const itemIndex = activeCategoryData.findIndex(
                (item) => item.編號 === line.編號,
              );
              if (itemIndex !== -1) {
                const paddedRowId = padRowIdForLegacy(originalRowId);
                const totalRows = activeCategoryData.length;
                const percentage = (
                  ((itemIndex + 1) / totalRows) *
                  100
                ).toFixed(2);
                saveBookmark(
                  paddedRowId,
                  percentage,
                  category,
                  dialectInfo.fullLvlName,
                  false,
                );
              }
            }
          };

          // Remove old handler if exists
          const oldHandler = audioPlayHandlers.get(audio2);
          if (oldHandler) {
            audio2.removeEventListener('play', oldHandler);
          }

          // Add new handler and store it
          audio2.addEventListener('play', sentencePlayHandler);
          audioPlayHandlers.set(audio2, sentencePlayHandler);
          // --- End of Auto Bookmark Mode ---

          td3.appendChild(audio2);
        }
        td3.appendChild(document.createElement('br'));
        const translationText = document.createElement('span');
        translationText.innerHTML = line.翻譯
          .replace(/"/g, '')
          .replace(/\n/g, '<br>');
        td3.appendChild(translationText);
      } else {
        td3.classList.add('empty-sentence-cell');
        const dummyAudio = document.createElement('audio');
        dummyAudio.className = 'media';
        dummyAudio.dataset.skip = 'true';
        dummyAudio.style.display = 'none';
        td3.appendChild(dummyAudio);
      }
      item.appendChild(td3);
      fragment.appendChild(item);
    }

    if (prepend) {
      tbody.prepend(fragment);
    } else {
      tbody.appendChild(fragment);
    }

    setTimeout(() => repositionViewport(), 50);
  }

  function scrollHandler() {
    if (isLoadingMoreItems || !g_currentDialectInfo) {
      return;
    }

    const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
    const table = document.getElementById('category-table');
    if (!table) return;

    if (
      scrollTop + clientHeight >= scrollHeight - 250 &&
      lastLoadedIndex < activeCategoryData.length
    ) {
      isLoadingMoreItems = true;
      const start = lastLoadedIndex;
      const end = Math.min(start + ITEMS_PER_LOAD, activeCategoryData.length);

      if (start < end) {
        const itemsToRender = activeCategoryData.slice(start, end);
        renderCategoryItems(
          itemsToRender,
          g_currentDialectInfo,
          g_currentCategory,
          false,
          activeCategoryData.length,
          null,
          false,
        );
        lastLoadedIndex = end;
      }
      isLoadingMoreItems = false;
    }

    if (scrollTop <= 250 && firstLoadedIndex > 0) {
      isLoadingMoreItems = true;
      const currentHeight = table.offsetHeight;

      const end = firstLoadedIndex;
      const start = Math.max(0, end - ITEMS_PER_LOAD);

      if (start < end) {
        const itemsToRender = activeCategoryData.slice(start, end);
        renderCategoryItems(
          itemsToRender,
          g_currentDialectInfo,
          g_currentCategory,
          false,
          activeCategoryData.length,
          null,
          true,
        );
        firstLoadedIndex = start;

        const newHeight = table.offsetHeight;
        window.scrollTo({
          top: scrollTop + (newHeight - currentHeight),
          behavior: 'instant',
        });
      }
      isLoadingMoreItems = false;
    }
  }

  // --- Playback Logic (New Version) ---

  /**
   * 標記目前正在播放的列。
   * @param {HTMLElement} element - 要標記的 <tr> 元素。
   */
  function addNowPlaying(element) {
    removeNowPlaying();
    if (element) {
      element.id = 'nowPlaying';
      element.classList.remove('paused-playback');
    }
  }

  /**
   * 移除正在播放列的標記。
   */
  function removeNowPlaying() {
    const nowPlaying = document.getElementById('nowPlaying');
    if (nowPlaying) {
      nowPlaying.removeAttribute('id');
    }
  }

  /**
   * 從指定的資料索引開始播放。
   * @param {number} itemIndex - 在 activeCategoryData 中的索引。
   */
  function startPlayingFromIndex(itemIndex) {
    if (itemIndex < 0 || itemIndex >= activeCategoryData.length) {
      console.error('無效的播放起始索引:', itemIndex);
      return;
    }

    // 重設狀態
    // 【新增此行】用當前時間戳記產生一個獨一無二的 ID
    playbackSessionId = Date.now();

    isCrossCategoryPlaying = false;
    finishedTableName = null;
    finishedCat = null;
    currentAudioIndex = itemIndex;
    isPlaying = true;
    isPaused = false;

    // 更新 UI 控制按鈕
    const pauseResumeButton = document.getElementById('pauseResumeBtn');
    const stopButton = document.getElementById('stopBtn');
    if (pauseResumeButton) {
      pauseResumeButton.innerHTML = '<i class="fas fa-pause"></i>';
      pauseResumeButton.classList.remove('ended');
      pauseResumeButton.classList.add('ongoing');
    }
    if (stopButton) {
      stopButton.classList.remove('ended');
      stopButton.classList.add('ongoing');
    }

    playAudio(currentAudioIndex, playbackSessionId); // <-- 【修改此行】傳入新的 ID
  }

  /**
   * 播放指定資料索引的音檔。這是新的播放核心。
   * @param {number} itemIndex - 在 activeCategoryData 中的索引。
   */
  function playAudio(itemIndex, sessionId) {
    // 【新增此區塊】在函式最開頭驗證對談 ID
    if (sessionId !== playbackSessionId) {
      console.log(`一個過時的播放對談 (ID: ${sessionId}) 被攔截，不予執行。`);
      return;
    }

    if (!isPlaying) return;

    // --- 檢查是否已播完目前類別的所有項目 ---
    if (itemIndex >= activeCategoryData.length) {
      advanceToNextCategory();
      return;
    }

    // --- 【新增】播放器同步預載入機制 ---
    const PRELOAD_THRESHOLD = 5;
    // 檢查是否接近已載入項目的結尾，且還有更多項目未載入，且目前不在載入中
    if (
      itemIndex >= lastLoadedIndex - PRELOAD_THRESHOLD &&
      lastLoadedIndex < activeCategoryData.length &&
      !isLoadingMoreItems
    ) {
      console.log(
        `[Autoplay Preload] Index: ${itemIndex}, LastLoaded: ${lastLoadedIndex}. Triggering load.`,
      );
      isLoadingMoreItems = true; // 防止重複觸發
      const start = lastLoadedIndex;
      const end = Math.min(start + ITEMS_PER_LOAD, activeCategoryData.length);
      if (start < end) {
        const itemsToRender = activeCategoryData.slice(start, end);
        renderCategoryItems(
          itemsToRender,
          g_currentDialectInfo,
          g_currentCategory,
          false,
          activeCategoryData.length,
          null,
          false,
        );
        lastLoadedIndex = end;
      }
      isLoadingMoreItems = false; // 完成後重設旗標
    }

    currentAudioIndex = itemIndex;
    const currentItemData = activeCategoryData[itemIndex];
    const rowId = currentItemData.編號.split('-')[1];

    const targetRow = document
      .querySelector(`a[name="${rowId}"]`)
      ?.closest('tr');

    if (!targetRow) {
      console.warn(`項目 #${itemIndex} (ID: ${rowId}) 不在畫面上，播放停止。`);
      stopPlayback(); // 使用無聲的停止
      return;
    }

    // 更新 UI 並儲存書籤
    addNowPlaying(targetRow);
    targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const bookmarkButton = targetRow.querySelector('.bookmarkBtn');
    if (bookmarkButton) {
      const rowId = bookmarkButton.dataset.rowId;
      const paddedRowId = padRowIdForLegacy(rowId);
      const totalRows = activeCategoryData.length;
      const percentage = (((currentAudioIndex + 1) / totalRows) * 100).toFixed(
        2,
      );
      saveBookmark(
        paddedRowId,
        percentage,
        g_currentCategory,
        g_currentDialectInfo.fullLvlName,
        true,
      );
    }

    // --- 【整合 Media Session】 ---
    updateMediaSession(currentItemData, g_currentDialectInfo, false); // Explicitly set single loop to false
    navigator.mediaSession.playbackState = 'playing';
    // --- 【整合結束】 ---

    const audioElementsInRow = Array.from(
      targetRow.querySelectorAll('audio.media'),
    );
    const wordAudio = audioElementsInRow[0];
    const sentenceAudio = audioElementsInRow[1];
    const signal = audioAbortController.signal;

    const playNextItem = () => {
      // 【修改此行】將 sessionId 傳遞下去
      playAudio(currentAudioIndex + 1, sessionId);
    };

    const playSentence = () => {
      if (sentenceAudio && sentenceAudio.dataset.skip !== 'true' && isPlaying) {
        currentAudio = sentenceAudio;
        currentAudio.play().catch((e) => {
          console.error('播放例句音檔失敗', e);
          playNextItem();
        });
        currentAudio.addEventListener('ended', playNextItem, {
          once: true,
          signal,
        });
      } else {
        playNextItem();
      }
    };

    if (wordAudio && wordAudio.dataset.skip !== 'true' && isPlaying) {
      currentAudio = wordAudio;
      currentAudio.play().catch((e) => {
        console.error('播放詞彙音檔失敗', e);
        playSentence();
      });
      currentAudio.addEventListener('ended', playSentence, {
        once: true,
        signal,
      });
    } else {
      playSentence();
    }
  }

  /**
   * 結束播放流程並重設 UI。
   */
  function playEndOfPlayback() {
    audioAbortController.abort();
    audioAbortController = new AbortController();
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    }
    playbackSessionId = null;
    isPlaying = false;
    isPaused = false;
    currentAudio = null;
    currentAudioIndex = 0;
    removeNowPlaying();
    stopSingleWordLoop(); // 【新增】停止單詞循環
    updateMediaSession(null); // --- 【整合 Media Session】 ---

    const pauseResumeButton = document.getElementById('pauseResumeBtn');
    const stopButton = document.getElementById('stopBtn');
    if (pauseResumeButton) {
      pauseResumeButton.innerHTML = '<i class="fas fa-play"></i>';
      pauseResumeButton.classList.add('ended');
      pauseResumeButton.classList.remove('ongoing');
    }
    if (stopButton) {
      stopButton.classList.add('ended');
      stopButton.classList.remove('ongoing');
    }

    const endAudio = new Audio('endOfPlay.mp3');
    endAudio.play().catch((e) => console.error('播放結束音效失敗:', e));
  }

  /**
   * 停止播放並重設 UI (供 stop 按鈕使用)。
   */
  function stopPlayback() {
    audioAbortController.abort();
    audioAbortController = new AbortController();
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    }
    playbackSessionId = null;
    isPlaying = false;
    isPaused = false;
    currentAudio = null;
    currentAudioIndex = 0;
    removeNowPlaying();
    updateMediaSession(null); // --- 【整合 Media Session】 ---

    const pauseResumeButton = document.getElementById('pauseResumeBtn');
    const stopButton = document.getElementById('stopBtn');
    if (pauseResumeButton) {
      pauseResumeButton.innerHTML = '<i class="fas fa-play"></i>'; // 顯示播放圖示，表示可從頭播放
      pauseResumeButton.classList.add('ended');
      pauseResumeButton.classList.remove('ongoing');
    }
    if (stopButton) {
      stopButton.classList.add('ended');
      stopButton.classList.remove('ongoing');
    }
  }

  /**
   * [新增] 處理前進到下一個播放類別的共享邏輯。
   */
  function advanceToNextCategory() {
    // 取得目前類別在列表中的索引
    currentCategoryIndex = categoryList.indexOf(g_currentCategory);
    const nextCategoryIndex = currentCategoryIndex + 1;

    // --- 【新增】檢查分類循環模式 ---
    if (isCategoryLooping) {
      console.log(`分類循環模式開啟中，重新播放類別: ${g_currentCategory}`);
      const CATEGORY_LOOP_RESTART_DELAY = 100;
      setTimeout(
        () => playAudio(0, playbackSessionId),
        CATEGORY_LOOP_RESTART_DELAY,
      );
      return;
    }

    // --- 檢查是否還有下一個類別 ---
    if (nextCategoryIndex < categoryList.length) {
      const nextCategoryValue = categoryList[nextCategoryIndex];
      const nextRadioButton = document.querySelector(
        `input[name="category"][value="${nextCategoryValue}"]`,
      );
      if (nextRadioButton) {
        console.log(
          `類別 ${g_currentCategory} 播放完畢，跳至下一個類別: ${nextCategoryValue}`,
        );
        isCrossCategoryPlaying = true; // 設定跨類別播放旗標
        nextRadioButton.click(); // 透過點擊觸發 generate 和 buildTable...
      } else {
        console.error(
          'Could not find radio button for next category, stopping playback.',
        );
        playEndOfPlayback(); // 找不到按鈕，只好結束
      }
    } else {
      // --- 所有類別都已播完，真正結束 ---
      console.log('所有類別播放完畢。');
      playEndOfPlayback();
      showRestartMessage();

      // 儲存特別書籤，標記為已完成並提供重新開始的目標
      if (categoryList && categoryList.length > 0 && g_currentDialectInfo) {
        const firstCategory = categoryList[0];
        const lastCategory = g_currentCategory;
        const totalRows = activeCategoryData.length;
        if (totalRows > 0) {
          const lastRowIdRaw = activeCategoryData[totalRows - 1].編號.split('-')[1];
          // 【回饋修正】更明確的 fallback 處理，避免 編號 格式異常時報錯
          const lastRowId = (lastRowIdRaw && lastRowIdRaw.trim()) ? lastRowIdRaw : '1';
          const paddedLastRowId = padRowIdForLegacy(lastRowId);

          saveBookmark(
            paddedLastRowId,
            '100.00',
            lastCategory,
            g_currentDialectInfo.fullLvlName,
            false,
            true,
            firstCategory,
          );
        }
      }
    }
  }

  /**
   * 在級別播放結束時，顯示重新開始的訊息。
   */
  function showRestartMessage() {
    // 避免重複顯示
    if (document.getElementById('level-restart-box')) return;

    const contentContainer = document.getElementById('generated');
    if (!contentContainer || !g_currentDialectInfo) return;

    const levelName = g_currentDialectInfo.fullLvlName;

    const restartBox = document.createElement('div');
    restartBox.id = 'level-restart-box';
    restartBox.setAttribute('role', 'button');
    restartBox.setAttribute('tabindex', '0');

    // 使用文本節點避免 XSS
    const p = document.createElement('p');
    p.textContent = `${levelName}全部放送煞，重新開始？`;
    restartBox.appendChild(p);

    const restartAction = () => {
      // 【回饋修正】顯式移除 DOM 元素，避免殘留
      restartBox.remove();
      if (categoryList && categoryList.length > 0) {
        const firstCategory = categoryList[0];

        const allRadios = document.querySelectorAll('input[name="category"]');
        const firstRadio = Array.from(allRadios).find((r) => r.value === firstCategory);
        if (firstRadio) {
          // 【回饋修正】設定跨類別播放旗標，讓跳轉後能自動開始播放（找到 radio 時才設定，避免殘留狀態）
          isCrossCategoryPlaying = true;
          firstRadio.click();
        }
      }
    };

    restartBox.addEventListener('click', restartAction);
    restartBox.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        restartAction();
      }
    });

    contentContainer.appendChild(restartBox);

    // 使用 double requestAnimationFrame 確保元素已在 DOM 中並完成排版
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        restartBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });
  }

  /**
   * 【新增】開始單詞循環播放。
   * @param {HTMLAudioElement} wordAudio - 詞彙音檔元素。
   * @param {HTMLAudioElement} sentenceAudio - 例句音檔元素。
   * @param {HTMLElement} row - 對應的 <tr> 元素。
   * @param {HTMLElement} button - 被點擊的 .loop-one-btn 按鈕。
   */
  function startSingleWordLoop(
    wordAudio,
    sentenceAudio,
    row,
    button,
    trackData,
  ) {
    const LOOP_DELAY_BETWEEN_AUDIO = 500; // 詞與句之間播放的延遲
    const LOOP_DELAY_WITHOUT_AUDIO = 1000; // 當其中一個音檔不存在時的循環延遲

    // --- BUG FIX: Save main playback state before starting loop ---
    if (isPlaying) {
      g_mainPlaybackIndexBeforeLoop = currentAudioIndex;
      stopPlayback();
    }
    // --- End of BUG FIX ---

    stopSingleWordLoop();

    // --- Auto Bookmark Mode: Save bookmark when starting single word loop ---
    const autoBookmarkEnabled =
      localStorage.getItem('autoBookmarkMode') === 'true';
    const isCertVocab =
      g_currentDialectInfo &&
      g_currentDialectInfo.腔 &&
      g_currentDialectInfo.級;

    if (autoBookmarkEnabled && isCertVocab && trackData) {
      const rowId = button.dataset.rowId;
      if (rowId) {
        const paddedRowId = padRowIdForLegacy(rowId);
        const itemIndex = activeCategoryData.indexOf(trackData);
        if (itemIndex !== -1) {
          const totalRows = activeCategoryData.length;
          const percentage = (((itemIndex + 1) / totalRows) * 100).toFixed(2);
          saveBookmark(
            paddedRowId,
            percentage,
            g_currentCategory,
            g_currentDialectInfo.fullLvlName,
            false, // Not in playback context
          );
        }
      }
    }
    // --- End of Auto Bookmark Mode ---

    isSingleWordLooping = true;
    singleLoopingAudio = {
      word: wordAudio,
      sentence: sentenceAudio,
      row: row,
      button: button,
      track: trackData,
    };
    singleLoopAbortController = new AbortController();
    const signal = singleLoopAbortController.signal;

    updateMediaSession(trackData, g_currentDialectInfo, true); // Update media session for single loop
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'playing';
    }

    button.innerHTML = '<i class="fas fa-stop"></i>';
    button.classList.add('looping');
    row.classList.add('looping-row');

    const playSentence = () => {
      if (!isSingleWordLooping || signal.aborted) return;
      if (sentenceAudio && sentenceAudio.src) {
        sentenceAudio.currentTime = 0;
        sentenceAudio.play().catch((e) => {
          console.error('單詞循環播放例句失敗:', e);
          setTimeout(playWord, LOOP_DELAY_BETWEEN_AUDIO);
        });
        sentenceAudio.addEventListener(
          'ended',
          () => setTimeout(playWord, LOOP_DELAY_BETWEEN_AUDIO),
          { once: true, signal },
        );
      } else {
        setTimeout(playWord, LOOP_DELAY_WITHOUT_AUDIO);
      }
    };

    const playWord = () => {
      if (!isSingleWordLooping || signal.aborted) return;
      if (wordAudio && wordAudio.src) {
        wordAudio.currentTime = 0;
        wordAudio.play().catch((e) => {
          console.error('單詞循環播放詞彙失敗:', e);
          playSentence();
        });
        wordAudio.addEventListener('ended', playSentence, {
          once: true,
          signal,
        });
      } else {
        playSentence();
      }
    };

    playWord(); // 首次啟動
  }

  /**
   * 【新增】停止單詞循環播放。
   */
  function stopSingleWordLoop() {
    if (!isSingleWordLooping) return;

    singleLoopAbortController.abort();

    if (singleLoopingAudio.word) {
      singleLoopingAudio.word.pause();
      singleLoopingAudio.word.currentTime = 0;
    }
    if (singleLoopingAudio.sentence) {
      singleLoopingAudio.sentence.pause();
      singleLoopingAudio.sentence.currentTime = 0;
    }

    if (singleLoopingAudio.button) {
      singleLoopingAudio.button.innerHTML = '<i class="fas fa-repeat"></i>';
      singleLoopingAudio.button.classList.remove('looping');
    }
    if (singleLoopingAudio.row) {
      singleLoopingAudio.row.classList.remove('looping-row');
    }

    updateMediaSession(null); // Clear media session when stopping loop

    isSingleWordLooping = false;
    singleLoopingAudio = {
      word: null,
      sentence: null,
      row: null,
      button: null,
      track: null,
    };
  }

  function setupPlaybackControls(
    dialectInfo,
    category,
    totalRows,
    autoPlayTargetRowId,
  ) {
    const resultsSummaryContainer = document.getElementById('results-summary');
    if (!resultsSummaryContainer) return;

    let audioControlsDiv = document.getElementById('audioControls');
    if (!audioControlsDiv) {
      audioControlsDiv = document.createElement('span');
      audioControlsDiv.id = 'audioControls';
      resultsSummaryContainer.appendChild(audioControlsDiv);
    }

    audioControlsDiv.innerHTML = `
        <button id="playAllBtn" title="依序播放" style="display: none;"><i class="fas fa-play"></i></button>
        <button id="pauseResumeBtn" title="暫停/繼續"><i class="fas fa-pause"></i></button>
        <button id="stopBtn" title="停止"><i class="fas fa-stop"></i></button>
        <button id="loopCategoryBtn" title="循環播放這个類別"><i class="fas fa-sync-alt"></i></button>
    `;

    const pauseResumeButton = document.getElementById('pauseResumeBtn');
    const stopButton = document.getElementById('stopBtn');

    if (pauseResumeButton) {
      pauseResumeButton.onclick = function () {
        if (!isPlaying) {
          // If stopped, decide where to resume from.
          if (g_mainPlaybackIndexBeforeLoop !== null) {
            // If playback was interrupted by a single loop, resume from where it left off.
            const resumeIndex = g_mainPlaybackIndexBeforeLoop;
            g_mainPlaybackIndexBeforeLoop = null; // Reset the flag
            startPlayingFromIndex(resumeIndex);
          } else {
            // Otherwise, start from the beginning of the category.
            startPlayingFromIndex(0);
          }
          return;
        }
        const nowPlayingRow = document.getElementById('nowPlaying');
        if (isPaused) {
          currentAudio?.play().catch((e) => console.error('恢復播放失敗:', e));
          isPaused = false;
          this.innerHTML = '<i class="fas fa-pause"></i>';
          if (nowPlayingRow) {
            nowPlayingRow.classList.remove('paused-playback');
            nowPlayingRow.scrollIntoView({
              behavior: 'smooth',
              block: 'center',
            });
          }
          if ('mediaSession' in navigator)
            navigator.mediaSession.playbackState = 'playing';
        } else {
          currentAudio?.pause();
          isPaused = true;
          this.innerHTML = '<i class="fas fa-play"></i>';
          if (nowPlayingRow) nowPlayingRow.classList.add('paused-playback');
          if ('mediaSession' in navigator)
            navigator.mediaSession.playbackState = 'paused';
        }
      };
    }

    if (stopButton) {
      stopButton.onclick = function () {
        if (isPlaying) {
          stopPlayback();
        }
      };
    }

    const loopCategoryButton = document.getElementById('loopCategoryBtn');
    if (loopCategoryButton) {
      // Init style from global state
      if (isCategoryLooping) loopCategoryButton.classList.add('active');

      loopCategoryButton.onclick = function () {
        isCategoryLooping = !isCategoryLooping;
        this.classList.toggle('active', isCategoryLooping);
        console.log(`分類循環模式已 ${isCategoryLooping ? '開啟' : '關閉'}`);
      };
    }
  }

  function setupDynamicEventListeners(dialectInfo, category) {
    const contentContainer = document.getElementById('generated');
    if (!contentContainer) return;

    contentContainer.onclick = function (event) {
      const target = event.target;
      const playButton = target.closest('.playFromThisRow');
      const bookmarkButton = target.closest('.bookmarkBtn');
      const loopOneButton = target.closest('.loop-one-btn');

      if (loopOneButton) {
        const row = loopOneButton.closest('tr');
        if (!row) return;

        if (isSingleWordLooping && singleLoopingAudio.row === row) {
          stopSingleWordLoop();
        } else {
          const rowId = loopOneButton.dataset.rowId;
          const trackData = activeCategoryData.find(
            (item) => item.編號.split('-')[1] === rowId,
          );
          if (trackData) {
            const audioElements = row.querySelectorAll('audio.media');
            const wordAudio = audioElements[0];
            const sentenceAudio = audioElements[1];
            startSingleWordLoop(
              wordAudio,
              sentenceAudio,
              row,
              loopOneButton,
              trackData,
            );
          } else {
            console.error('Could not find track data for single word loop.');
          }
        }
        return;
      }

      if (playButton) {
        stopSingleWordLoop(); // 確保點擊單列播放時，停止單詞循環
        const rowId = playButton.dataset.rowId;
        const itemIndex = activeCategoryData.findIndex(
          (item) => item.編號.split('-')[1] === rowId,
        );

        if (itemIndex !== -1) {
          console.log(`從 row ID 播放: ${rowId}, 資料索引: ${itemIndex}`);

          const stopButton = document.getElementById('stopBtn');
          if (isPlaying) {
            if (stopButton) stopButton.click();
            setTimeout(() => startPlayingFromIndex(itemIndex), 100);
          } else {
            startPlayingFromIndex(itemIndex);
          }
        } else {
          console.error(
            `在 activeCategoryData 中找不到 rowId 為 ${rowId} 的項目`,
          );
        }
        return;
      }

      if (bookmarkButton) {
        const rowId = bookmarkButton.dataset.rowId;
        const targetIndex = activeCategoryData.findIndex(
          (item) => item.編號.split('-')[1] === rowId,
        );
        if (targetIndex !== -1) {
          const totalRows = activeCategoryData.length;
          const percentage = (((targetIndex + 1) / totalRows) * 100).toFixed(2);
          const paddedRowId = padRowIdForLegacy(rowId);
          saveBookmark(
            paddedRowId,
            percentage,
            category,
            dialectInfo.fullLvlName,
          );
        }
        return;
      }
    };
  }

  function handleAutoPlay(autoPlayTargetRowId, dialectInfo, category) {
    if (!autoPlayTargetRowId) return;

    const normalizedTargetId = normalizeRowId(autoPlayTargetRowId);
    const itemIndex = activeCategoryData.findIndex(
      (item) => item.編號.split('-')[1] === normalizedTargetId,
    );
    if (itemIndex === -1) {
      console.error(
        '無法在資料中找到 autoPlayTargetRowId:',
        autoPlayTargetRowId,
      );
      return;
    }

    const targetRow = document.querySelector(`a[name="${normalizedTargetId}"]`);
    if (targetRow) {
      targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => {
        startPlayingFromIndex(itemIndex);
      }, 500); // 延遲以等待滾動動畫
    } else {
      console.warn(
        'handleAutoPlay: 找到了資料，但在 DOM 中找不到對應的 a[name] 錨點。可能尚未渲染。',
      );
      // 理論上 buildTableAndSetupPlayback 已確保會渲染，此處為防禦性程式碼
      startPlayingFromIndex(itemIndex);
    }
  }

  preprocessAllData(); // <-- 確保這一行被執行

  if (
    selectionPopup &&
    selectionPopupBackdrop &&
    selectionPopupContent &&
    selectionPopupCloseBtn &&
    contentContainer
  ) {
    if (isMobileDevice()) {
      console.log('手機裝置，設定 selectionchange 監聽器分查詞按鈕。');
      createMobileLookupButton(
        selectionPopup,
        selectionPopupContent,
        selectionPopupBackdrop,
      );
      document.addEventListener(
        'selectionchange',
        debouncedMobileSelectionHandler,
      );
    } else {
      console.log('桌機裝置，設定 mouseup 監聽器分 popup。');
      contentContainer.addEventListener('mouseup', (event) =>
        handleTextSelectionInSentence(
          event,
          selectionPopup,
          selectionPopupContent,
          selectionPopupBackdrop,
          contentContainer,
        ),
      );
    }

    selectionPopupCloseBtn.addEventListener('click', () =>
      hidePronunciationPopup(selectionPopup, selectionPopupBackdrop),
    );
    selectionPopupBackdrop.addEventListener('click', () =>
      hidePronunciationPopup(selectionPopup, selectionPopupBackdrop),
    );

    selectionPopup.addEventListener('click', (event) => {
      event.stopPropagation();
    });
  }

  function handleUrlChange() {
    const urlParams = new URLSearchParams(window.location.search);
    const kiongParam = urlParams.get('kiong');
    const lastUsedDialect = localStorage.getItem('lastSearchDialect');
    let dialectToSelect = '';
    if (kiongParam && DIALECT_CODE_TO_NAME[kiongParam]) {
      dialectToSelect = DIALECT_CODE_TO_NAME[kiongParam];
    } else if (lastUsedDialect && DIALECT_NAME_TO_CODE[lastUsedDialect]) {
      dialectToSelect = lastUsedDialect;
    } else {
      dialectToSelect = '四縣';
    }
    const radioToSelect = document.querySelector(
      `#search-popup input[name="dialect"][value="${dialectToSelect}"]`,
    );
    if (radioToSelect) {
      radioToSelect.checked = true;
    }

    const musiidParam = urlParams.get('musiid');
    const lastMode = localStorage.getItem('lastSearchMode');
    const searchModeValue = musiidParam
      ? musiidParam === 'hak'
        ? '客話'
        : '華語'
      : lastMode || '客話';

    const modeRadio = document.querySelector(
      `#search-popup input[name="search-mode"][value="${searchModeValue}"]`,
    );
    if (modeRadio) {
      modeRadio.checked = true;
    }

    const caParam = urlParams.get('ca');
    const bidsuParam = urlParams.get('bidsu');
    const iabParam = urlParams.get('iab');
    const dialectParam = urlParams.get('dialect');
    const levelParam = urlParams.get('level');
    const categoryParam = urlParams.get('category');
    const rowParam = urlParams.get('row');
    const romParam = urlParams.get('rom');
    successfullyLoadedFromUrl = false;

    if (musiidParam && caParam) {
      const itemsPerPage = parseInt(bidsuParam) || 50;
      const page = parseInt(iabParam) || 1;
      searchInput.value = caParam;
      performSearch(page, itemsPerPage);
    } else if (dialectParam && levelParam && categoryParam) {
      loadedViaUrlParams = true; // 標記是透過 URL 載入
      const rowParam = urlParams.get('row'); // 獲取 row 參數備用

      let dialectName = '';
      let levelName = '';

      // --- 參數解析邏輯 (不變) ---
      switch (dialectParam) {
        case 'si':
          dialectName = '四縣';
          break;
        case 'ha':
          dialectName = '海陸';
          break;
        case 'da':
          dialectName = '大埔';
          break;
        case 'rh':
          dialectName = '饒平';
          break;
        case 'zh':
          dialectName = '詔安';
          break;
      }
      switch (levelParam) {
        case '5':
          levelName = '基礎級';
          break;
        case '1':
          levelName = '初級';
          break;
        case '2':
          levelName = '中級';
          break;
        case '3':
          levelName = '中高級';
          break;
        case '4':
          levelName = '高級';
          break;
      }

      if (dialectName && levelName) {
        const targetTableName = dialectName + levelName;
        const dataVarName = mapTableNameToDataVar(targetTableName);
        if (dataVarName) {
          const dataObject = window[dataVarName];
          if (typeof dataObject !== 'undefined') {
            const decodedCategory = decodeURIComponent(categoryParam);

            if (rowParam) {
              // **情境：有 row 參數，需要自動播放 -> 所有裝置都顯示 Modal**
              console.log(
                '[handleUrlChange] 偵測到 row 參數，顯示 Modal 以啟動播放。',
              );
              if (autoplayModal && modalContent) {
                // 步驟 1: 將事件處理函式定義為具名函式，以便移除
                const startPlayback = () => {
                  autoplayModal.style.display = 'none';
                  generate(dataObject, decodedCategory, rowParam);
                  successfullyLoadedFromUrl = true;
                  if (progressDropdown) {
                    const targetValue =
                      targetTableName + '||' + decodedCategory;
                    const optionToSelect = progressDropdown.querySelector(
                      `option[value="${targetValue}"]`,
                    );
                    if (optionToSelect) {
                      optionToSelect.selected = true;
                    } else {
                      progressDropdown.selectedIndex = 0;
                    }
                  }
                  // 操作完成後，移除監聽器以避免記憶體洩漏
                  modalContent.removeEventListener('click', startPlayback);
                  autoplayModal.removeEventListener(
                    'click',
                    backdropClickHandler,
                  );
                };

                const backdropClickHandler = (event) => {
                  // 如果點擊的不是背景本身 (而是內容)，則不關閉
                  if (event.target !== autoplayModal) return;

                  autoplayModal.style.display = 'none';
                  // 同樣，操作完成後移除監聽器
                  modalContent.removeEventListener('click', startPlayback);
                  autoplayModal.removeEventListener(
                    'click',
                    backdropClickHandler,
                  );
                };

                // 步驟 2: 在新增監聽器前，先明確地移除舊的，確保狀態乾淨
                modalContent.removeEventListener('click', startPlayback);
                autoplayModal.removeEventListener(
                  'click',
                  backdropClickHandler,
                );

                // 步驟 3: 新增事件監聽器
                modalContent.addEventListener('click', startPlayback, {
                  once: true,
                });
                autoplayModal.addEventListener('click', backdropClickHandler, {
                  once: false,
                });

                // 步驟 4: 直接顯示 Modal
                autoplayModal.style.display = 'flex';
              }
            } else {
              // **情境：無 row 參數，僅顯示類別列表**
              console.log('[handleUrlChange] 偵測到無 row 參數，僅載入類別。');
              generate(dataObject, decodedCategory, null); // rowId 傳 null
              successfullyLoadedFromUrl = true;
            }
          } else {
            console.error('URL 處理錯誤：找不到對應的資料變數:', dataVarName);
          }
        }
      } else {
        console.error(
          'URL 處理錯誤：無法從參數映射腔調或級別:',
          dialectParam,
          levelParam,
        );
      }
    } else if (romParam) {
      const romanizerInput = document.getElementById('romanizer-input');
      const showRomanizerBtn = document.getElementById('showRomanizerBtn');

      if (romanizerInput && showRomanizerBtn) {
        const dialectParam = urlParams.get('kiong');
        if (dialectParam && DIALECT_CODE_TO_NAME[dialectParam]) {
          currentActiveMainDialectName = DIALECT_CODE_TO_NAME[dialectParam];
        } else {
          const lastUsedDialect = localStorage.getItem('lastSearchDialect');
          currentActiveMainDialectName =
            lastUsedDialect && DIALECT_NAME_TO_CODE[lastUsedDialect]
              ? lastUsedDialect
              : '四縣';
        }

        showRomanizerBtn.click();
        romanizerInput.value = decodeURIComponent(romParam);

        const learningPanel = document.getElementById('learningSelectionPanel');
        if (learningPanel) {
          learningPanel.open = false;
        }
      }
    }
  }

  handleUrlChange();
  window.addEventListener('popstate', handleUrlChange);

  // --- Stats Modal Logic ---
  if (statsModalBtn && statsModal && statsModalCloseBtn) {
    const closeStatsModal = () => {
      statsModal.classList.remove('is-visible');
    };
    statsModalBtn.addEventListener('click', () => {
      statsModal.classList.add('is-visible');
      if (typeof window.renderStatsModal === 'function') {
        window.renderStatsModal();
      }
    });
    statsModalCloseBtn.addEventListener('click', closeStatsModal);
    statsModal.addEventListener('click', (event) => {
      if (event.target === statsModal) closeStatsModal();
    });

    // Tab switching logic
    const tabs = statsModal.querySelectorAll('.stats-tab');
    const tabContents = statsModal.querySelectorAll('.stats-tab-content');
    
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));
        
        tab.classList.add('active');
        const targetId = tab.getAttribute('data-target');
        const targetContent = document.getElementById(targetId);
        if (targetContent) targetContent.classList.add('active');
      });
    });
  }

  if (infoButton && infoModal && infoModalCloseBtn) {
    fetch('info.md')
      .then((response) => response.text())
      .then((markdown) => {
        document.getElementById('info-content').innerHTML =
          marked.parse(markdown);
      })
      .catch((error) => {
        document.getElementById('info-content').innerHTML =
          '<p>說明文件載入失敗。</p>';
      });
    const dontShowAgain = localStorage.getItem('dontShowInfoModalAgain');
    if (!dontShowAgain) {
      infoModal.classList.add('is-visible');
    }
    infoButton.addEventListener('click', () => {
      infoModal.classList.add('is-visible');
      trackEvent('open', 'InfoModal', 'click_info_button');
    });
    
    const showcaseBtn = document.getElementById('showcase-btn');
    if (showcaseBtn) {
      showcaseBtn.addEventListener('click', () => {
        document.getElementById('sandhi-showcase').style.display = 'block';
        document.getElementById('search-container').style.display = 'none';
        document.getElementById('generated').style.display = 'none';
        if (typeof window.scrollTo === 'function') {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
        if (searchPopup) {
          searchPopup.classList.remove('active');
        }
      });
    }
    const closeInfoModal = () => {
      if (document.getElementById('dontShowInfoModalAgain').checked) {
        localStorage.setItem('dontShowInfoModalAgain', 'true');
      }
      infoModal.classList.remove('is-visible');
    };
    infoModalCloseBtn.addEventListener('click', closeInfoModal);
    infoModal.addEventListener('click', (event) => {
      if (event.target === infoModal) closeInfoModal();
    });

    let originalDocTitle = document.title;

    // --- Daily Word Modal Logic ---
    const openDailyModal = () => {
      if (dailyWordModal) {
        dailyWordModal.style.display = 'flex';
        originalDocTitle = document.title;
        document.title = '日日一詞 - 客源翠 HakSpring';
        if (location.hash !== '#daily') {
          history.pushState(null, '', location.pathname + location.search + '#daily');
        }
        if (window.DailyWord) {
          window.DailyWord.init();
        }
      }
    };

    const closeDailyModal = () => {
      if (dailyWordModal) {
        dailyWordModal.style.display = 'none';
        document.title = originalDocTitle;
        if (location.hash === '#daily') {
          history.pushState(null, '', location.pathname + location.search);
        }
      }
    };

    if (dailyWordBtn) {
      dailyWordBtn.addEventListener('click', openDailyModal);
    }
    if (dailyCloseBtn) {
      dailyCloseBtn.addEventListener('click', closeDailyModal);
    }


    // Hash routing for #daily
    if (location.hash === '#daily') {
      setTimeout(openDailyModal, 100);
    }
    window.addEventListener('hashchange', () => {
      if (location.hash === '#daily') {
        openDailyModal();
      } else {
        closeDailyModal();
      }
    });

    // --- Auto Bookmark Settings Logic ---
    const autoBookmarkToggle = document.getElementById('autoBookmarkToggle');
    if (autoBookmarkToggle) {
      // Load setting from localStorage
      const autoBookmarkEnabled = localStorage.getItem('autoBookmarkMode');
      if (autoBookmarkEnabled === 'true') {
        autoBookmarkToggle.checked = true;
      }

      // Save setting when changed
      autoBookmarkToggle.addEventListener('change', (event) => {
        localStorage.setItem('autoBookmarkMode', event.target.checked);
        trackEvent(
          'toggle',
          'AutoBookmarkMode',
          event.target.checked ? 'enabled' : 'disabled',
        );
      });
    }

    // --- Settings Modal Logic ---
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsModal = document.getElementById('settingsModal');
    const settingsModalCloseBtn = document.getElementById('settingsCloseBtn');
    const userLocationInput = document.getElementById('userLocationInput');
    const userNameInput = document.getElementById('userNameInput');

    if (settingsBtn && settingsModal && settingsModalCloseBtn && userLocationInput && userNameInput) {
      settingsBtn.addEventListener('click', () => {
        // Load latest values
        userLocationInput.value = localStorage.getItem('hakkaUserLocation') || '';
        userNameInput.value = localStorage.getItem('hakkaUserName') || '';
        settingsModal.classList.add('is-visible');
        trackEvent('click', 'SettingsModal', 'opened');
      });

      const saveSettingsAndClose = () => {
        const newLocation = userLocationInput.value.trim();
        const newName = userNameInput.value.trim();
        
        localStorage.setItem('hakkaUserLocation', newLocation);
        localStorage.setItem('hakkaUserName', newName);

        if (typeof window.updateAppTitles === 'function') {
          window.updateAppTitles();
        }

        if (typeof window.triggerCloudSync === 'function') {
          window.triggerCloudSync();
        }

        settingsModal.classList.remove('is-visible');
      };

      settingsModalCloseBtn.addEventListener('click', saveSettingsAndClose);
      settingsModal.addEventListener('click', (event) => {
        if (event.target === settingsModal) saveSettingsAndClose();
      });
      
      // Load initial values for placeholders or immediate usage if needed
      userLocationInput.value = localStorage.getItem('hakkaUserLocation') || '';
      userNameInput.value = localStorage.getItem('hakkaUserName') || '';
    }
  }

  // --- What's New Modal Logic ---
  const whatsNewModal = document.getElementById('whatsNewModal');
  const whatsNewModalCloseBtn = document.getElementById(
    'whatsNewModalCloseBtn',
  );
  const whatsNewContent = document.getElementById('whats-new-content');
  let newWhatsNewVersion = null;

  // Helper function to fetch and return markdown content, following DRY principle
  async function fetchWhatsNewContent() {
    const cacheBustUrl = `whatsnew.md?t=${new Date().getTime()}`;
    const response = await fetch(cacheBustUrl);
    if (!response.ok) {
      throw new Error('Failed to fetch whatsnew.md'); // Standardized error message
    }
    return await response.text();
  }

  // Checks if the modal should be shown on initial load
  async function checkWhatsNew() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('whatsnew') === 'see') {
      showWhatsNewModal(true);
      return;
    }
    try {
      const markdownContent = await fetchWhatsNewContent();
      const versionMatch = markdownContent.match(
        /<!--\s*version:\s*(\d+)\s*-->/,
      );
      const serverVersion = versionMatch ? parseInt(versionMatch[1], 10) : 0;
      const localVersion = parseInt(
        localStorage.getItem('whatsNewVersion') || '0',
        10,
      );

      if (serverVersion > localVersion) {
        newWhatsNewVersion = serverVersion;
        whatsNewContent.innerHTML = marked.parse(markdownContent);
        whatsNewModal.classList.add('is-visible');
      } else {
        if (localStorage.getItem('seenOnboarding20260705') !== 'true') {
          localStorage.setItem('seenOnboarding20260705', 'true');
          if (typeof window.startHakSpringOnboarding === 'function') {
            setTimeout(() => {
              window.startHakSpringOnboarding();
            }, 500);
          }
        }
      }
    } catch (error) {
      console.error('Error checking for whatsnew.md update:', error);
    }
  }

  // Forces the modal to show, e.g., when clicked from a link
  const showWhatsNewModal = async (force = false) => {
    if (!force) return;
    try {
      const markdownContent = await fetchWhatsNewContent();
      const versionMatch = markdownContent.match(
        /<!--\s*version:\s*(\d+)\s*-->/,
      );
      newWhatsNewVersion = versionMatch ? parseInt(versionMatch[1], 10) : null;
      whatsNewContent.innerHTML = marked.parse(markdownContent);
      whatsNewModal.classList.add('is-visible');
    } catch (error) {
      console.error('Failed to load whatsnew.md:', error);
      whatsNewContent.innerHTML = '<p>最新消息載入失敗。</p>';
      whatsNewModal.classList.add('is-visible');
    }
  };

  const closeWhatsNewModal = () => {
    // Correctly handle version 0 by checking against null
    if (newWhatsNewVersion !== null) {
      localStorage.setItem('whatsNewVersion', newWhatsNewVersion);
    }
    whatsNewModal.classList.remove('is-visible');

    if (localStorage.getItem('seenOnboarding20260705') !== 'true') {
      localStorage.setItem('seenOnboarding20260705', 'true');
      if (typeof window.startHakSpringOnboarding === 'function') {
        setTimeout(() => {
          window.startHakSpringOnboarding();
        }, 300);
      }
    }
  };

  // Attach event listeners
  if (whatsNewModal && whatsNewModalCloseBtn && whatsNewContent) {
    whatsNewModalCloseBtn.addEventListener('click', closeWhatsNewModal);
    whatsNewModal.addEventListener('click', (event) => {
      if (event.target === whatsNewModal) closeWhatsNewModal();
    });
    const infoContent = document.getElementById('info-content');
    if (infoContent) {
      infoContent.addEventListener('click', (event) => {
        const target = event.target.closest('a');
        if (target && target.getAttribute('href') === '#show-whats-new') {
          event.preventDefault();
          infoModal.classList.remove('is-visible');
          showWhatsNewModal(true);
        }
      });
    }
    if (whatsNewContent) {
      whatsNewContent.addEventListener('click', (event) => {
        const target = event.target.closest('a');
        if (target && target.getAttribute('href') === '#show-info') {
          event.preventDefault();
          closeWhatsNewModal();
          infoModal.classList.add('is-visible');
        }
      });
    }
  }

  // Run the check on startup
  checkWhatsNew();
  // --- End of What's New Modal Logic ---

  if (selectionPopup && selectionPopupBackdrop && selectionPopupCloseBtn) {
    const closePopup = () => {
      selectionPopup.style.display = 'none';
      selectionPopupBackdrop.style.display = 'none';
      activeSelectionPopup = false;
      const highlighted = document.querySelector('.highlighted-selection');
      if (highlighted) {
        highlighted.classList.remove('highlighted-selection');
      }
    };
    selectionPopupCloseBtn.addEventListener('click', closePopup);
    selectionPopupBackdrop.addEventListener('click', closePopup);
  }

  if (searchInput) {
    searchInput.addEventListener('click', (event) => {
      event.stopPropagation();
      searchPopup.style.display = 'block';
    });
    document.addEventListener('click', (event) => {
      if (!searchContainer.contains(event.target)) {
        searchPopup.style.display = 'none';
      }
    });
    const triggerSearchOnChange = () => {
      localStorage.setItem(
        'lastSearchDialect',
        document.querySelector('#search-popup input[name="dialect"]:checked')
          .value,
      );
      localStorage.setItem(
        'lastSearchMode',
        document.querySelector(
          '#search-popup input[name="search-mode"]:checked',
        ).value,
      );
      if (searchInput.value.trim()) {
        performSearch();
      }
    };

    searchDialectRadios.forEach((radio) =>
      radio.addEventListener('change', triggerSearchOnChange),
    );
    searchModeRadios.forEach((radio) =>
      radio.addEventListener('change', triggerSearchOnChange),
    );
    searchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') performSearch();
    });
  }

  if (backToTopButton) {
    window.onscroll = function () {
      if (
        document.body.scrollTop > 20 ||
        document.documentElement.scrollTop > 20
      ) {
        backToTopButton.style.display = 'block';
      } else {
        backToTopButton.style.display = 'none';
      }
    };
    backToTopButton.addEventListener('click', () => {
      if (
        g_currentDialectInfo &&
        g_currentCategory &&
        g_currentLevelData.length > 0 &&
        firstLoadedIndex > 0
      ) {
        // 如果是在類別瀏覽模式且不是從第一筆開始（lazy loading 中間開始），則重新載入該類別以回到頂端
        buildTableAndSetupPlayback(
          g_currentCategory,
          g_currentLevelData,
          g_currentDialectInfo,
        );
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  dialectLevelLinks.forEach(function (link) {
    link.addEventListener('click', function (e) {
      e.preventDefault();

      const targetSpan = this.closest('span[data-varname]');
      if (!targetSpan) {
        console.error('Could not find parent span with data-varname:', this);
        return;
      }
      const varName = targetSpan.dataset.varname;
      const dataObject = window[varName];

      if (dataObject) {
        document.querySelectorAll('span[data-varname]').forEach((span) => {
          span.classList.remove('active-dialect-level');
        });
        targetSpan.classList.add('active-dialect-level');

        // GCA：這段程式碼 document.querySelectorAll('.radioItem').forEach(...) 是多餘的。
        // 在下面呼叫的 generate(dataObject) 函式中，其開頭已經包含了移除所有 .radioItem 元素 active-category class 的邏輯。為了避免程式碼重複並提升可維護性，依 GCA 建議將這三行刪除。

        generate(dataObject);

        const catPanel = document.getElementById('cat-panel');
        if (catPanel) {
          catPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      } else {
        console.error(`找不到資料物件: ${varName}`);
      }
    });
  });

  updateProgressDropdown();
  progressDropdown.addEventListener('change', function () {
    const selectedValue = this.value;

    if (selectedValue && selectedValue !== '擇進前个進度') {
      const bookmarks =
        JSON.parse(localStorage.getItem('hakkaBookmarks')) || [];
      // [修正] 先從 bookmarks 陣列中找到完整的書籤物件
      const selectedBookmark = bookmarks.find(
        (bm) => bm.tableName + '||' + bm.cat === selectedValue,
      );

      if (selectedBookmark) {
        // [修正] 從找到的物件中安全地取得所有資訊
        const targetTableName = selectedBookmark.tableName;
        let targetCategory = selectedBookmark.cat;
        let targetRowIdToGo = selectedBookmark.rowId; // <--- 這樣才能正確取得 rowId

        // 如果是已完成的級別，重新開始
        if (selectedBookmark.isLevelFinished) {
          const originalFinishedCat = targetCategory;
          const restartCat = selectedBookmark.restartCat || targetCategory;
          targetCategory = restartCat;
          targetRowIdToGo = '1';

          // 【使用者回饋修正】點選重新開始時，先移除原本的「已完成」書籤
          let bookmarks = JSON.parse(localStorage.getItem('hakkaBookmarks')) || [];
          const oldIndex = bookmarks.findIndex(
            (bm) => bm.tableName === targetTableName && bm.cat === originalFinishedCat && bm.isLevelFinished
          );
          if (oldIndex > -1) {
            bookmarks.splice(oldIndex, 1);
            localStorage.setItem('hakkaBookmarks', JSON.stringify(bookmarks));
          }

          // 再儲存新的開始進度，這會自動觸發下拉選單更新
          saveBookmark(
            '001',
            '0.00',
            targetCategory,
            targetTableName,
            false, // isPlayingContext: false (此處刻意省略後兩個參數 isLevelFinished, restartCat)
          );
        }

        const dataVarName = mapTableNameToDataVar(targetTableName);

        if (dataVarName) {
          const dataObject = window[dataVarName];
          if (dataObject) {
            isNavigatingViaCode = true; // <--- 在呼叫 generate() 之前，設定旗標

            generate(dataObject, targetCategory, targetRowIdToGo);

            // <--- 在操作的最後，用 setTimeout 來重設旗標
            setTimeout(() => {
              isNavigatingViaCode = false;
            }, 0);
          } else {
            console.error(
              '無法找到對應的資料變數:',
              dataVarName || targetTableName,
            );
            alert('載入選定進度時發生錯誤：找不到對應的資料集。');
          }
        }
      } else {
        console.error('找不到對應 value 的書籤:', selectedValue);
        alert('載入選定進度時發生錯誤：選項與儲存資料不符。');
      }
    }
  });

  window.addEventListener('scroll', debouncedUpdateLastCenteredRow);
  // Set up a ResizeObserver to handle font size changes and other layout shifts
  if (window.ResizeObserver) {
    const resizeObserver = new ResizeObserver(repositionViewport);
    resizeObserver.observe(document.body, { box: 'border-box' });
  }
  // Always listen to the resize event as a fallback and for window resizes
  window.addEventListener('resize', repositionViewport);

  // Initial call to set things right
  repositionViewport();

  contentContainer.addEventListener('click', function (event) {
    const button = event.target.closest('.crossDialectBtn');
    if (button) {
      const rowIndex = parseInt(button.dataset.rowIndex, 10);
      if (!isNaN(rowIndex) && g_currentSearchResults[rowIndex]) {
        toggleSearchAccordion(button, g_currentSearchResults[rowIndex]);
      }
    }
  });

  displayGitCommitInfo();
}

function findCrossDialectRows(line, dialectInfo, isGip) {
  const accents = ['四', '南', '海', '大', '平', '安'];
  const results = [];
  
  accents.forEach((accentKey) => {
    // Skip if it is the current dialect
    if (accentKey === dialectInfo.腔) {
      return;
    }

    let dataVarName = '';
    if (isGip) {
      dataVarName = '教典' + accentKey;
    } else {
      dataVarName = accentKey + dialectInfo.級;
    }
    
    const dataObject = window[dataVarName];
    if (dataObject && Array.isArray(dataObject.content)) {
      let foundItem = null;
      if (isGip) {
        // Match by 客家語 only for GIP
        foundItem = dataObject.content.find(
          (item) => item.客家語 === line.客家語
        );
      } else {
        // Match by 編號 for CERT
        foundItem = dataObject.content.find((item) => item.編號 === line.編號);
      }
      
      if (foundItem) {
        let itemDialectInfo;
        if (isGip) {
          const accentObj = ACCENT_INFO[accentKey] || { 腔名: '' };
          itemDialectInfo = { 
            腔: accentKey, 
            腔名: accentObj.腔名, 
            級: '', 
            fullLvlName: accentObj.腔名 + '教典' 
          };
        } else {
          itemDialectInfo = getDialectInfo(accentKey, dialectInfo.級);
        }
        results.push({ foundItem, itemDialectInfo, accentKey, dataVarName });
      }
    }
  });
  return results;
}

function toggleAccordion(event, line, dialectInfo) {
  const clickedButton = event.currentTarget;
  const parentRow = clickedButton.closest('tr');
  const wasOpen = parentRow.classList.contains('accordion-parent');

  // Always close any currently open accordion first
  document.querySelectorAll('.accordion-parent').forEach((row) => {
    row.classList.remove('accordion-parent');
    const button = row.querySelector('.crossDialectBtn i');
    if (button) button.className = 'fas fa-plus-circle';
  });
  document.querySelectorAll('.accordion-row').forEach((row) => row.remove());

  // If the one we clicked was already open, we just want to close it, so we're done.
  if (wasOpen) {
    return;
  }

  // Pause autoplay if it's running
  const stopButton = document.getElementById('stopBtn');
  if (isPlaying && stopButton) {
    stopButton.click();
  }

  parentRow.classList.add('accordion-parent');
  clickedButton.querySelector('i').className = 'fas fa-minus-circle';

  let lastAppendedRow = parentRow;
  let createdRows = [];

  const isGip = line.sourceType === 'gip' || (!dialectInfo.級 && dialectInfo.fullLvlName && dialectInfo.fullLvlName.includes('教典'));
  const crossDialectResults = findCrossDialectRows(line, dialectInfo, isGip);

  crossDialectResults.forEach(({ foundItem, itemDialectInfo }) => {
    const newRow = createComparisonRow(foundItem, itemDialectInfo, isGip);
    newRow.classList.add('accordion-row');
    lastAppendedRow.after(newRow);
    lastAppendedRow = newRow;
    createdRows.push(newRow);
  });

  // Add class to the last created row for styling
  if (createdRows.length > 0) {
    createdRows[createdRows.length - 1].classList.add('accordion-row-last');
  }

  g_isAccordionScrolling = true;
  try {
    if (isFirefox()) {
      const table = parentRow.closest('table');
      if (table) {
        adjustAllRubyFontSizes(table);
      }
    }
    parentRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (e) {
    console.error('Error during accordion toggle:', e);
  } finally {
    setTimeout(() => {
      g_isAccordionScrolling = false;
    }, 500); // Wait for scroll animation to finish
  }
}

function createComparisonRow(line, dialectInfo, isGip) {
  const item = document.createElement('tr');
  item.className = dialectInfo.腔名; // Add dialect class for styling

  // TD1: Dialect Name (replaces number/buttons)
  const td1 = document.createElement('td');
  td1.className = 'no';
  td1.dataset.label = '腔調';
  const sourceSpan = document.createElement('span');
  sourceSpan.className = `dialect ${dialectInfo.腔名}`;
  sourceSpan.textContent = dialectInfo.腔名;
  td1.appendChild(sourceSpan);
  item.appendChild(td1);

  // Audio setup using unified helpers
  let fullSourceName = '';
  if (isGip) {
    fullSourceName = 'gip' + dialectInfo.fullLvlName;
  } else {
    fullSourceName = 'cert' + dialectInfo.腔 + dialectInfo.級;
  }

  const wordAudioSrc = constructWordAudioUrl(line, fullSourceName);
  const sentenceAudioSrc = constructSentenceAudioUrl(line, fullSourceName);

  // TD2: Vocabulary
  const td2 = document.createElement('td');
  td2.dataset.label = '詞彙';
  const ruby = document.createElement('ruby');
  ruby.textContent = line.客家語;
  const rt = document.createElement('rt');
  let phoneticText = formatPhoneticForDisplay(line['客語標音_顯示']);
  const dialectCode = getDialectCode(dialectInfo.腔);

  if (dialectCode) {
    phoneticText = getSandhiHtml(phoneticText, dialectCode);
  }
  rt.innerHTML = phoneticText;
  ruby.appendChild(rt);
  td2.appendChild(ruby);
  td2.appendChild(document.createElement('br'));
  
  if (wordAudioSrc) {
    const audio1 = document.createElement('audio');
    audio1.className = 'media accordion-audio';
    audio1.controls = true;
    audio1.preload = 'none';
    audio1.src = wordAudioSrc;
    td2.appendChild(audio1);
  }
  td2.appendChild(document.createElement('br'));
  const meaningSpan = document.createElement('span');
  meaningSpan.innerHTML = line.華語詞義
    .replace(/"/g, '')
    .replace(/\n/g, '<br>');
  td2.appendChild(meaningSpan);
  if (line.備註 && line.備註.trim() !== '') {
    const notesP = document.createElement('p');
    notesP.className = 'notes';
    notesP.textContent = `（${line.備註}）`;
    td2.appendChild(notesP);
  }
  item.appendChild(td2);

  // TD3: Example Sentence
  const td3 = document.createElement('td');
  td3.dataset.label = '例句';
  if (line.例句 && line.例句.trim() !== '') {
    const sentenceSpan = document.createElement('span');
    sentenceSpan.className = 'sentence';
    sentenceSpan.innerHTML = line.例句.replace(/"/g, '').replace(/\n/g, '<br>');
    td3.appendChild(sentenceSpan);
    td3.appendChild(document.createElement('br'));
    
    if (sentenceAudioSrc) {
      const audio2 = document.createElement('audio');
      audio2.className = 'media accordion-audio';
      audio2.controls = true;
      audio2.preload = 'none';
      audio2.src = sentenceAudioSrc;
      td3.appendChild(audio2);
    }
    td3.appendChild(document.createElement('br'));
    
    // Some GIP entries might not have a translation field. Use empty string if missing.
    const translationStr = line.翻譯 || '';
    if (translationStr) {
      const translationText = document.createElement('span');
      translationText.innerHTML = translationStr
        .replace(/"/g, '')
        .replace(/\n/g, '<br>');
      td3.appendChild(translationText);
    }
  } else {
    td3.classList.add('empty-sentence-cell');
  }
  item.appendChild(td3);

  return item;
}

// --- 【新增】資料管理 (備份/還原) 功能 ---
function initializeDataManagement() {
  const dataManagementBtn = document.getElementById('dataManagementBtn');
  const dataManagementModal = document.getElementById('dataManagementModal');
  const dataManagementModalCloseBtn = document.getElementById(
    'dataManagementModalCloseBtn',
  );
  const exportDataBtn = document.getElementById('exportDataBtn');
  const importDataBtn = document.getElementById('importDataBtn');

  if (
    !dataManagementBtn ||
    !dataManagementModal ||
    !dataManagementModalCloseBtn ||
    !exportDataBtn ||
    !importDataBtn
  ) {
    console.error('一個或多個資料管理 UI 元件未尋著。');
    return;
  }

  // --- 事件監聽器 ---
  dataManagementBtn.addEventListener('click', () => {
    dataManagementModal.style.display = 'flex';
  });

  const closeModal = () => {
    dataManagementModal.style.display = 'none';
  };

  dataManagementModalCloseBtn.addEventListener('click', closeModal);
  dataManagementModal.addEventListener('click', (event) => {
    if (event.target === dataManagementModal) {
      closeModal();
    }
  });

  exportDataBtn.addEventListener('click', exportData);
  importDataBtn.addEventListener('click', importData);
}

// --- 【新增】雲端同步 UI 初始化 ---
function initializeCloudSync() {
  // 初始化 Supabase Client
  if (typeof initSupabase === 'function') {
    initSupabase();
  }

  // 初始化雲端同步模組
  if (typeof initCloudSync === 'function') {
    initCloudSync();
  }

  const cloudSyncBtn = document.getElementById('cloudSyncBtn');
  const cloudSyncLogoutBtn = document.getElementById('cloudSyncLogoutBtn');

  if (cloudSyncBtn) {
    cloudSyncBtn.addEventListener('click', () => {
      if (typeof cloudSyncState !== 'undefined' && cloudSyncState.isLoggedIn) {
        // 已登入，手動觸發同步
        if (typeof syncFromCloud === 'function') {
          syncFromCloud();
        }
      } else {
        // 未登入，進行登入
        if (typeof signInWithGoogle === 'function') {
          signInWithGoogle();
        }
      }
    });
  }

  if (cloudSyncLogoutBtn) {
    cloudSyncLogoutBtn.addEventListener('click', () => {
      if (confirm('確定愛登出雲端同步無？')) {
        if (typeof signOut === 'function') {
          signOut();
        }
      }
    });
  }
}

/**
 * 匯出使用者資料
 */
function exportData() {
  const exportTextArea = document.getElementById('exportDataTextArea');
  const keysToExport = [
    'hakkaBookmarks',
    'dontShowInfoModalAgain',
    'lastSearchMode',
    'lastSearchDialect',
    // 'hideInfoModal' is often redundant with 'dontShowInfoModalAgain', so we can omit it.
  ];

  const exportData = {};
  keysToExport.forEach((key) => {
    const value = localStorage.getItem(key);
    if (value !== null) {
      try {
        // Attempt to parse JSON strings to store them as objects/arrays
        exportData[key] = JSON.parse(value);
      } catch (e) {
        // If it's not a valid JSON, store as a plain string
        exportData[key] = value;
      }
    }
  });

  const jsonString = JSON.stringify(exportData, null, 2); // Pretty print JSON for the downloadable file
  const jsonStringForUrl = JSON.stringify(exportData); // No pretty print for URL

  // --- 產生並顯示 URL ---
  try {
    // GCA 建議：使用 TextEncoder 來處理 Unicode 字元，較 btoa(unescape(encodeURIComponent(...))) 可靠
    const uint8Array = new TextEncoder().encode(jsonStringForUrl);
    const binaryString = String.fromCharCode.apply(null, uint8Array);
    const encodedData = btoa(binaryString);

    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set('migrateData', encodedData);
    exportTextArea.value = newUrl.toString();
  } catch (e) {
    console.error('無法處理遷移資料:', e);
    exportTextArea.value = '產生 URL 失敗。請改用下載个檔案。';
  }
  exportTextArea.readOnly = true;

  // --- 觸發下載 ---
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;

  // 建立有日期个檔案名
  const date = new Date();
  const dateString = `${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}`;
  a.download = `hakspring-backup-${dateString}.json`;

  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  alert('備份檔已產生並開始下載。');
}

/**
 * 匯入使用者資料
 */
async function importData() {
  const fileInput = document.getElementById('importDataFile');
  const textArea = document.getElementById('importDataTextArea');
  const file = fileInput.files[0];
  const textValue = textArea.value.trim();

  if (!file && textValue === '') {
    alert('請選擇一個備份檔，或在橫框內貼上備份資料。');
    return;
  }

  // 1. 加入安全警告
  if (
    !confirm(
      '匯入資料會覆蓋現有設定，且來源不明个檔案可能帶來風險。確定愛繼續無？',
    )
  ) {
    return;
  }

  let dataString = '';

  if (file) {
    try {
      dataString = await file.text();
    } catch (error) {
      console.error('讀取檔案失敗:', error);
      alert('讀取檔案失敗，請確定檔案係無係有效。');
      return;
    }
  } else {
    dataString = textValue;
  }

  try {
    let parsedData;
    // 檢查係無係貼上了完整个 URL
    if (dataString.includes('?migrateData=')) {
      const urlParams = new URLSearchParams(dataString.split('?')[1]);
      const migrateData = urlParams.get('migrateData');
      if (migrateData) {
        // 2. 使用較穩健个 TextDecoder 來解碼
        const binaryString = atob(migrateData);
        const bytes = Uint8Array.from(binaryString, (char) =>
          char.charCodeAt(0),
        );
        const decodedData = new TextDecoder().decode(bytes);
        parsedData = JSON.parse(decodedData);
      } else {
        throw new Error('URL 裡肚尋無 migrateData 參數。');
      }
    } else {
      // 當作淨 JSON 資料來處理
      parsedData = JSON.parse(dataString);
    }

    // --- 還原資料到 localStorage ---
    const validKeys = [
      'hakkaBookmarks',
      'dontShowInfoModalAgain',
      'lastSearchMode',
      'lastSearchDialect',
    ];
    for (const key in parsedData) {
      // 3. 基本个 key 驗證
      if (
        validKeys.includes(key) &&
        Object.prototype.hasOwnProperty.call(parsedData, key)
      ) {
        let value = parsedData[key];
        // 如果值係一個物件 (例如 hakkaBookmarks)，愛將佢轉做字串再儲存
        if (typeof value === 'object' && value !== null) {
          value = JSON.stringify(value);
        }
        localStorage.setItem(key, String(value));
      }
    }

    alert('資料還原成功！網站會重新載入來套用新設定。');

    // 關閉 modal 並重新載入頁面
    document.getElementById('dataManagementModal').style.display = 'none';
    location.reload();
  } catch (error) {
    console.error('匯入資料失敗:', error);
    alert(`資料匯入失敗：\n${error.message}\n\n請檢查資料格式敢有正確。`);
  }
}

const GITHUB_COMMIT_API_URL =
  'https://api.github.com/repos/aiuanyu/HakSpring/commits?per_page=1';

async function displayGitCommitInfo() {
  const commitInfoSpan = document.getElementById('commit-info-modal');
  if (!commitInfoSpan) {
    console.error('Commit info span in modal not found.');
    return;
  }

  const displayFromCommit = (commit) => {
    const commitDate = new Date(commit.commit.committer.date);
    const commitUrl = commit.html_url;
    const commitSha = commit.sha.substring(0, 7);
    const formattedDate = `${commitDate.getFullYear()}${String(commitDate.getMonth() + 1).padStart(2, '0')}${String(commitDate.getDate()).padStart(2, '0')} ${commitDate.getHours()}:${String(commitDate.getMinutes()).padStart(2, '0')}`;
    commitInfoSpan.textContent = '網站更新：';
    const link = document.createElement('a');
    link.href = commitUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = `${formattedDate} (${commitSha})`;
    commitInfoSpan.appendChild(link);
  };

  const CACHE_KEY = 'gitCommitInfo';
  const CACHE_EXPIRATION = 5 * 60 * 1000; // 5 minutes

  try {
    const cachedItem = sessionStorage.getItem(CACHE_KEY);
    if (cachedItem) {
      const { commit, timestamp } = JSON.parse(cachedItem);
      if (Date.now() - timestamp < CACHE_EXPIRATION) {
        console.log('Displaying commit info from cache.');
        displayFromCommit(commit);
        return;
      }
    }
  } catch (e) {
    console.error('Failed to read commit info from cache', e);
  }

  try {
    const response = await fetch(GITHUB_COMMIT_API_URL);
    if (!response.ok) {
      throw new Error(`GitHub API request failed: ${response.status}`);
    }
    const commits = await response.json();
    if (commits.length > 0) {
      const lastCommit = commits[0];
      displayFromCommit(lastCommit);
      try {
        sessionStorage.setItem(
          CACHE_KEY,
          JSON.stringify({ commit: lastCommit, timestamp: Date.now() }),
        );
      } catch (e) {
        console.error('Failed to save commit info to sessionStorage', e);
      }
    }
  } catch (error) {
    console.error('Error fetching commit info:', error);
    commitInfoSpan.textContent = '無法取得更新資訊。';
  }
}

// Start the application
if (typeof window !== 'undefined') {
  initializeApp();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    classifyTone,
    getSandhiHtml,
    formatPhoneticForDisplay
  };
}
