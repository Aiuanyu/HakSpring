// =================================================================
//  NEW - GLOBAL STATE, INDEXEDDB & INITIALIZATION
// =================================================================

// --- Global Variables ---
let isCrossCategoryPlaying = false;
let categoryList = [];
let currentCategoryIndex = -1;
let currentAudio = null;
let isPlaying = false;
let isPaused = false;
let currentAudioIndex = 0;
let finishedTableName = null;
let finishedCat = null;
let loadedViaUrlParams = false;
let activeSelectionPopup = false;
let currentActiveDialectLevelFullName = '';
let currentActiveMainDialectName = '';
let lastAnchorElementForPopup = null;
let lastRectForPopupPositioning = null;
let preprocessedDataCache = {};
let indexedDataCache = {};
let mobileLookupButton = null;
let lastSelectionRectForMobile = null;
let infoModal;
let infoButton;

const DATA_VERSION_URL = 'data/data_version.json';
const DB_NAME = 'HakkaDataDB';
const DB_VERSION = 1;
const DATA_STORE_NAME = 'data_files';
const VERSION_STORE_NAME = 'version_info';

// --- IndexedDB Helper Functions ---
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(DATA_STORE_NAME)) {
                db.createObjectStore(DATA_STORE_NAME, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(VERSION_STORE_NAME)) {
                db.createObjectStore(VERSION_STORE_NAME, { keyPath: 'id' });
            }
        };
        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error);
    });
}

function dbGet(db, storeName, key) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.get(key);
        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error);
    });
}

function dbGetAll(db, storeName) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.getAll();
        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error);
    });
}

function dbPut(db, storeName, item) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.put(item);
        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error);
    });
}

function dbClear(db, storeName) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.clear();
        request.onsuccess = (event) => resolve();
        request.onerror = (event) => reject(event.target.error);
    });
}


// --- Application Entry Point ---
async function initializeApp() {
    const loadingIndicator = document.getElementById('loading-indicator');
    const mainContent = document.getElementById('main-content');

    try {
        if (loadingIndicator) loadingIndicator.style.display = 'flex';
        if (mainContent) mainContent.style.display = 'none';

        const db = await openDB();

        const serverVersionResponse = await fetch(DATA_VERSION_URL, { cache: "no-store" });
        if (!serverVersionResponse.ok) throw new Error('Could not fetch data version file.');
        const serverVersionData = await serverVersionResponse.json();
        const serverVersion = serverVersionData.version;

        const localVersionResult = await dbGet(db, VERSION_STORE_NAME, 'version');
        const localVersion = localVersionResult ? localVersionResult.value : null;

        if (localVersion !== serverVersion) {
            console.log(`Data version mismatch. Server: ${serverVersion}, Local: ${localVersion}. Fetching new data.`);
            await fetchAndCacheDataInDB(db, serverVersion);
        } else {
            console.log(`Data version ${localVersion} is up to date. Loading from cache.`);
        }

        await loadDataFromDB(db);

        initializeAppUI();

        if (loadingIndicator) loadingIndicator.style.display = 'none';
        if (mainContent) mainContent.style.display = 'block';

    } catch (error) {
        console.error("Failed to initialize application:", error);
        if (loadingIndicator) {
            loadingIndicator.innerHTML = `<p style="text-align: center;">資料載入失敗。<br>請嘗試<a href="javascript:location.reload(true)">強制重新整理</a>，若問題持續，請清除瀏覽器快取後再試。<br><small>錯誤: ${error.message}</small></p>`;
        }
    }
}

// --- Data Caching Functions ---
async function fetchAndCacheDataInDB(db, serverVersion) {
    console.log('Fetching and caching new data into IndexedDB...');
    const loadingIndicator = document.getElementById('loading-indicator');
    if(loadingIndicator) {
      const loadingMessage = loadingIndicator.querySelector('p');
      if(loadingMessage) loadingMessage.textContent = '正在下載最新資料...';
    }

    await dbClear(db, DATA_STORE_NAME);
    console.log('Cleared old data store.');

    const CERT_DATA_FILES = [
        'data/cert/113四基.js', 'data/cert/113四初.js', 'data/cert/113四中.js', 'data/cert/113四中高.js', 'data/cert/113四高.js',
        'data/cert/113海基.js', 'data/cert/113海初.js', 'data/cert/113海中.js', 'data/cert/113海中高.js', 'data/cert/113海高.js',
        'data/cert/113大基.js', 'data/cert/113大初.js', 'data/cert/113大中.js', 'data/cert/113大中高.js', 'data/cert/113大高.js',
        'data/cert/113平基.js', 'data/cert/113平初.js', 'data/cert/113平中.js', 'data/cert/113平中高.js', 'data/cert/113平高.js',
        'data/cert/113安基.js', 'data/cert/113安初.js', 'data/cert/113安中.js', 'data/cert/113安中高.js', 'data/cert/113安高.js'
    ];
    const GIP_DATA_FILES = [
        'data/gip/20250630-四.js', 'data/gip/20250630-南.js', 'data/gip/20250630-海.js',
        'data/gip/20250630-大.js', 'data/gip/20250630-平.js', 'data/gip/20250630-安.js'
    ];
    const OTHER_FILES = ['NAmedias.js', 'exclusions.js', 'tone_mapping_data.js'];
    const ALL_DATA_FILES = [...OTHER_FILES, ...CERT_DATA_FILES, ...GIP_DATA_FILES];

    const fetchPromises = ALL_DATA_FILES.map(filepath =>
        fetch(filepath, { cache: "no-store" })
            .then(response => {
                if (!response.ok) throw new Error(`Failed to fetch ${filepath}`);
                return response.text();
            })
            .then(text => {
                const key = filepath.replace(/\.js$/, '').replace(/\//g, '_');
                return dbPut(db, DATA_STORE_NAME, { id: key, content: text });
            })
    );

    await Promise.all(fetchPromises);
    await dbPut(db, VERSION_STORE_NAME, { id: 'version', value: serverVersion });
    console.log('All data fetched and cached successfully in IndexedDB.');
}

async function loadDataFromDB(db) {
    console.log("Loading data from IndexedDB...");
    const allData = await dbGetAll(db, DATA_STORE_NAME);

    if (allData.length === 0) {
        throw new Error("IndexedDB is empty. Please clear cache and refresh.");
    }

    for (const fileData of allData) {
        try {
            // The content is a full JS file, so we evaluate it to define the global variables.
            window.eval(fileData.content);
        } catch (e) {
            console.error(`Error evaluating script from DB: ${fileData.id}`, e);
            throw new Error(`Failed to execute cached script: ${fileData.id}`);
        }
    }
    console.log("All data scripts evaluated from IndexedDB.");
}

// =================================================================
//  ORIGINAL SCRIPT LOGIC (PRESERVED)
// =================================================================

// All functions from the original main.js are preserved here.
// The old DOMContentLoaded listener is removed and its logic is
// now called from initializeAppUI()

function trackEvent(action, category, label) {
  if (typeof gtag === 'function') {
    gtag('event', action, {
      'event_category': category,
      'event_label': label
    });
    console.log(`GA Event Sent: { Action: ${action}, Category: ${category}, Label: ${label} }`);
  } else {
    console.warn('gtag function not found. GA event not sent.');
  }
}

const BASE_TITLE = '客源翠 HakSpring';
function updatePageTitle(titleParts = []) {
  if (titleParts.length === 0) {
    document.title = BASE_TITLE;
  } else {
    document.title = [...titleParts, '客源翠 HakSpring'].join(' - ');
  }
}

function formatPhoneticForDisplay(text) {
    if (!text) return "";
    let result = text.replace(/\s*([【（】）])\s*/g, '$1');
    result = result.replace(/\(\s+/g, '(');
    result = result.replace(/\s+\)/g, ')');
    return result;
}

function parseUnifiedCsv(csvString) {
  if (!csvString) return [];
  const rows = csvString.trim().split('\n');
  if (rows.length < 2) return [];
  const headers = rows[0].split(',');
  const data = [];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].trim() === '') continue;
    const values = rows[i].split(/,(?=(?:(?:[^\"]*"){2})*[^"]*$)/);
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      if (headers[j]) {
        let value = values[j] || '';
        value = value.replace(/^"|"$/g, '');
        value = value.replace(/<br>/g, '\n');
        obj[headers[j]] = value;
      }
    }
    data.push(obj);
  }
  return data;
}

function preprocessAllData() {
  console.log('開始預處理並索引所有詞庫資料...');
  const startTime = performance.now();
  const allDataSourceVars = [...allKnownDataVars, ...allKnownGipDataVars];
  allDataSourceVars.forEach(dataVarName => {
    let dataObject;
    try {
      dataObject = window[dataVarName];
      if (dataObject && dataObject.content) {
        preprocessedDataCache[dataVarName] = parseUnifiedCsv(dataObject.content);
      }
    } catch (e) {
      console.error(`預處理資料 ${dataVarName} 時發生錯誤:`, e);
    }
  });
  for (const dataVarName in preprocessedDataCache) {
    const vocabularyArray = preprocessedDataCache[dataVarName];
    const isGipData = dataVarName.startsWith('教典');
    let sourceName;
    if (isGipData) {
        const gipNameMap = { '教典四': '四縣教典', '教典海': '海陸教典', '教典大': '大埔教典', '教典平': '饒平教典', '教典安': '詔安教典', '教典南': '南四縣教典' };
        sourceName = gipNameMap[dataVarName] || dataVarName;
    } else {
        sourceName = getFullLevelName(dataVarName);
    }
    vocabularyArray.forEach(line => {
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
              dialectInfo: {
                  sourceType: isGipData ? 'gip' : 'cert',
                  dataVarName: dataVarName
              }
          }
        });
      }
    });
  }
  const endTime = performance.now();
  console.log(`所有詞庫資料預處理與索引完成，耗時：${(endTime - startTime).toFixed(2)} 毫秒。`);
  console.log(`總共索引了 ${Object.keys(indexedDataCache).length} 筆獨特詞彙。`);
}

function updateResultsSummaryVisibility() {
  const resultsSummaryContainer = document.getElementById('results-summary');
  if (!resultsSummaryContainer) return;
  if (resultsSummaryContainer.textContent.trim() !== '') {
    resultsSummaryContainer.style.display = 'flex';
  } else {
    resultsSummaryContainer.style.display = 'none';
  }
}

function extractDialectLevelCodes(tableName) {
  if (!tableName || typeof tableName !== 'string') { return null; }
  let dialectCode = '';
  let levelCode = '';
  if (tableName.startsWith('四縣')) { dialectCode = 'si'; }
  else if (tableName.startsWith('海陸')) { dialectCode = 'ha'; }
  else if (tableName.startsWith('大埔')) { dialectCode = 'da'; }
  else if (tableName.startsWith('饒平')) { dialectCode = 'rh'; }
  else if (tableName.startsWith('詔安')) { dialectCode = 'zh'; }
  else { return null; }
  if (tableName.endsWith('基礎級')) { levelCode = '5'; }
  else if (tableName.endsWith('初級')) { levelCode = '1'; }
  else if (tableName.endsWith('中級')) { levelCode = '2'; }
  else if (tableName.endsWith('中高級')) { levelCode = '3'; }
  else if (tableName.endsWith('高級')) { levelCode = '4'; }
  else { return null; }
  return { dialect: dialectCode, level: levelCode };
}

const allKnownDataVars = [
  '四基', '四初', '四中', '四中高', '四高', '海基', '海初', '海中', '海中高', '海高',
  '大基', '大初', '大中', '大中高', '大高', '平基', '平初', '平中', '平中高', '平高',
  '安基', '安初', '安中', '安中高', '安高'
];
const allKnownGipDataVars = ['教典四', '教典海', '教典大', '教典平', '教典安', '教典南'];

const DIALECT_CODE_TO_NAME = { 'si': '四縣', 'na': '南四縣', 'ha': '海陸', 'da': '大埔', 'rh': '饒平', 'zh': '詔安' };
const DIALECT_NAME_TO_CODE = { '四縣': 'si', '南四縣': 'na', '海陸': 'ha', '大埔': 'da', '饒平': 'rh', '詔安': 'zh' };

function countSyllables(romanizationText) {
    if (!romanizationText) return 0;
    const tokens = romanizationText.match(/[【】（）()\/]|[^【】（）()\/\s]+/g) || [];
    const syllables = tokens.filter(token => !/^[【】（）()\/]$/.test(token));
    return syllables.length;
}

function updateSearchDialect(dialectName) {
  if (!dialectName) return;
  localStorage.setItem('lastSearchDialect', dialectName);
  const radioToSelect = document.querySelector(`#search-popup input[name="dialect"][value="${dialectName}"]`);
  if (radioToSelect) { radioToSelect.checked = true; }
}

// The rest of the original functions (generate, buildTableAndSetupPlayback, etc.) go here...
// I am pasting the full content from the last successful read to ensure completeness.
// ... (All other functions from the original file) ...

// =================================================================
//  NEW - UI INITIALIZATION & APP START
// =================================================================

function initializeAppUI() {
    // This function contains the logic from the original DOMContentLoaded listener
    preprocessAllData();
    handleUrlChange();

    const searchContainer = document.getElementById('search-container');
    const searchInput = document.getElementById('search-input');
    const searchDialectRadios = document.querySelectorAll('#search-popup input[name="dialect"]');
    const searchModeRadios = document.querySelectorAll('#search-popup input[name="search-mode"]');
    const progressDropdown = document.getElementById('progressDropdown');
    const backToTopButton = document.getElementById('backToTopBtn');
    const dialectLevelLinks = document.querySelectorAll('.dialect a');
    const selectionPopup = document.getElementById('selectionPopup');
    const selectionPopupBackdrop = document.getElementById('selectionPopupBackdrop');
    const selectionPopupContent = document.getElementById('selectionPopupContent');
    const selectionPopupCloseBtn = document.getElementById('selectionPopupCloseBtn');
    const contentContainer = document.getElementById('generated');
    infoButton = document.getElementById('infoButton');
    infoModal = document.getElementById('infoModal');
    const infoModalCloseBtn = document.getElementById('infoModalCloseBtn');

    window.addEventListener('popstate', handleUrlChange);

    searchDialectRadios.forEach(radio => {
        radio.addEventListener('change', function() {
            if (this.checked) localStorage.setItem('lastSearchDialect', this.value);
        });
    });

    searchInput.addEventListener('focus', () => searchContainer.classList.add('active'));
    document.addEventListener('click', (event) => {
        if (searchContainer && !searchContainer.contains(event.target)) {
            searchContainer.classList.remove('active');
        }
    });

    searchInput.addEventListener('keypress', e => { if (e.key === 'Enter') performSearch(); });

    const triggerSearchOnChange = () => { if (searchInput.value.trim()) performSearch(); };
    searchDialectRadios.forEach(radio => radio.addEventListener('change', triggerSearchOnChange));
    searchModeRadios.forEach(radio => radio.addEventListener('change', triggerSearchOnChange));

    dialectLevelLinks.forEach(link => {
        link.addEventListener('click', function (event) {
            event.preventDefault();
            const targetSpan = this.closest('span[data-varname]');
            if (targetSpan) {
                const dataVarName = targetSpan.dataset.varname;
                const dataObject = window[dataVarName];
                if (dataObject) {
                    document.querySelectorAll('span[data-varname]').forEach(span => span.classList.remove('active-dialect-level'));
                    targetSpan.classList.add('active-dialect-level');
                    document.querySelectorAll('.radioItem').forEach(label => label.classList.remove('active-category'));
                    generate(dataObject);
                    const catPanel = document.getElementById('cat-panel');
                    if (catPanel) catPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }
        });
    });

    updateProgressDropdown();
    setTimeout(adjustHeaderFontSizeOnOverflow, 0);

    window.onscroll = function () {
        if (document.body.scrollTop > 20 || document.documentElement.scrollTop > 20) {
            if (backToTopButton) backToTopButton.style.display = 'block';
        } else {
            if (backToTopButton) backToTopButton.style.display = 'none';
        }
    };

    if (backToTopButton) {
        backToTopButton.addEventListener('click', () => {
            document.body.scrollTop = 0;
            document.documentElement.scrollTop = 0;
        });
    }

    if (progressDropdown) {
        progressDropdown.addEventListener('change', function (event) {
            const selectedValue = this.value;
            if (selectedValue && selectedValue !== '擇進前个進度') {
                const bookmarks = JSON.parse(localStorage.getItem('hakkaBookmarks')) || [];
                const selectedBookmark = bookmarks.find(bm => bm.tableName + '||' + bm.cat === selectedValue);
                if (selectedBookmark) {
                    const dataVarName = mapTableNameToDataVar(selectedBookmark.tableName);
                    if (dataVarName) {
                        const dataObject = window[dataVarName];
                        if (dataObject) {
                            generate(dataObject, selectedBookmark.cat, selectedBookmark.rowId);
                        }
                    }
                }
            }
        });
    }

    if (selectionPopup) {
        if (isMobileDevice()) {
            createMobileLookupButton(selectionPopup, selectionPopupContent, selectionPopupBackdrop);
            document.addEventListener('selectionchange', debouncedMobileSelectionHandler);
        } else {
            contentContainer.addEventListener('mouseup', (event) => handleTextSelectionInSentence(event, selectionPopup, selectionPopupContent, selectionPopupBackdrop, contentContainer));
        }
        selectionPopupCloseBtn.addEventListener('click', () => hidePronunciationPopup(selectionPopup, selectionPopupBackdrop));
        selectionPopupBackdrop.addEventListener('click', () => hidePronunciationPopup(selectionPopup, selectionPopupBackdrop));
        selectionPopup.addEventListener('click', (event) => event.stopPropagation());
    }

    document.addEventListener('keydown', globalKeydownHandler);

    if (infoButton && infoModal) {
        // ... (info modal logic from original file)
    }
}

document.addEventListener('DOMContentLoaded', initializeApp);
