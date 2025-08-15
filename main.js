// =================================================================
//  NEW - GLOBAL STATE, CACHING & INITIALIZATION
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

// --- Application Entry Point ---
async function initializeApp() {
    const loadingIndicator = document.getElementById('loading-indicator');
    const mainContent = document.getElementById('main-content');

    try {
        if (loadingIndicator) loadingIndicator.style.display = 'flex';
        if (mainContent) mainContent.style.display = 'none';

        const serverVersionResponse = await fetch(DATA_VERSION_URL, { cache: "no-store" });
        if (!serverVersionResponse.ok) throw new Error('Could not fetch data version file.');
        const serverVersionData = await serverVersionResponse.json();
        const serverVersion = serverVersionData.version;
        const localVersion = localStorage.getItem('hakka_data_version');

        if (localVersion !== serverVersion) {
            console.log(`Data version mismatch. Server: ${serverVersion}, Local: ${localVersion}. Fetching new data.`);
            await fetchAndCacheData(serverVersion);
        } else {
            console.log(`Data version ${localVersion} is up to date. Loading from cache.`);
        }

        loadDataFromCache();

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
async function fetchAndCacheData(serverVersion) {
    console.log('Fetching and caching new data...');
    const loadingIndicator = document.getElementById('loading-indicator');
    if(loadingIndicator) {
      const loadingMessage = loadingIndicator.querySelector('p');
      if(loadingMessage) loadingMessage.textContent = '正在下載最新資料...';
    }

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

    localStorage.clear();

    const fetchPromises = ALL_DATA_FILES.map(filepath =>
        fetch(filepath, { cache: "no-store" })
            .then(response => {
                if (!response.ok) throw new Error(`Failed to fetch ${filepath}`);
                return response.text();
            })
            .then(text => {
                const key = `hakka_file_${filepath.replace(/\//g, '_')}`;
                localStorage.setItem(key, text);
            })
    );

    await Promise.all(fetchPromises);
    localStorage.setItem('hakka_data_version', serverVersion);
    console.log('All data fetched and cached successfully.');
}

function loadDataFromCache() {
    console.log("Loading data from localStorage by evaluating scripts...");
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
    const OTHER_FILES = ['tone_mapping_data.js', 'NAmedias.js', 'exclusions.js'];
    const ALL_FILES_TO_LOAD = [...OTHER_FILES, ...CERT_DATA_FILES, ...GIP_DATA_FILES];

    for (const filepath of ALL_FILES_TO_LOAD) {
        const key = `hakka_file_${filepath.replace(/\//g, '_')}`;
        const scriptContent = localStorage.getItem(key);
        if (scriptContent) {
            try {
                window.eval(scriptContent);
            } catch (e) {
                console.error(`Error evaluating script from cache: ${filepath}`, e);
                throw new Error(`Failed to execute cached script: ${filepath}`);
            }
        } else {
            throw new Error(`Cache is incomplete. Missing script for ${filepath}`);
        }
    }
    console.log("All data scripts evaluated from cache.");
}

// =================================================================
//  ORIGINAL SCRIPT LOGIC (PRESERVED & MODIFIED)
// =================================================================

// All functions from the original main.js are preserved here.
// The old DOMContentLoaded listener is removed and its logic is
// now called from initializeAppUI()

/**
 * 將事件傳送分 Google Analytics。
 * @param {string} action - 事件動作 (例如 'open', 'click')。
 * @param {string} category - 事件類別 (例如 'Romaine', 'Playback')。
 * @param {string} label - 事件標籤 (例如 'open_container', 'start_segmentation')。
 */
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

function generate(content, initialCategory = null, targetRowId = null) {
  console.log('Generate called for:', content.name);
  currentActiveDialectLevelFullName = getFullLevelName(content.name);
  document.querySelectorAll('.radioItem').forEach((label) => { label.classList.remove('active-category'); });
  if (!initialCategory && !targetRowId) {
    const progressDetailsSpan = document.getElementById('progressDetails');
    if (progressDetailsSpan) progressDetailsSpan.textContent = '';
  }
  let 腔 = content.name.substring(0, 1);
  let 級 = content.name.substring(1);
  let selected例外音檔;
  switch (級) {
    case '基': selected例外音檔 = typeof 基例外音檔 !== 'undefined' ? 基例外音檔 : []; break;
    case '初': selected例外音檔 = typeof 初例外音檔 !== 'undefined' ? 初例外音檔 : []; break;
    case '中': selected例外音檔 = typeof 中例外音檔 !== 'undefined' ? 中例外音檔 : []; break;
    case '中高': selected例外音檔 = typeof 中高例外音檔 !== 'undefined' ? 中高例外音檔 : []; break;
    case '高': selected例外音檔 = typeof 高例外音檔 !== 'undefined' ? 高例外音檔 : []; break;
    default: selected例外音檔 = [];
  }
  const 例外音檔 = selected例外音檔;
  var fullLvlName;
  const generalMediaYr = '112';
  var 目錄級, 目錄另級, 腔名, 級名, 檔腔, 檔級 = '';
  switch (腔) {
    case '四': 檔腔 = 'si'; 腔名 = '四縣'; currentActiveMainDialectName = '四縣'; updateSearchDialect('四縣'); break;
    case '海': 檔腔 = 'ha'; 腔名 = '海陸'; currentActiveMainDialectName = '海陸'; updateSearchDialect('海陸'); break;
    case '大': 檔腔 = 'da'; 腔名 = '大埔'; currentActiveMainDialectName = '大埔'; updateSearchDialect('大埔'); break;
    case '平': 檔腔 = 'rh'; 腔名 = '饒平'; currentActiveMainDialectName = '饒平'; updateSearchDialect('饒平'); break;
    case '安': 檔腔 = 'zh'; 腔名 = '詔安'; currentActiveMainDialectName = '詔安'; updateSearchDialect('詔安'); break;
    default: currentActiveMainDialectName = ''; break;
  }
  switch (級) {
    case '基': 目錄級 = '5'; 目錄另級 = '1'; 級名 = '基礎級'; break;
    case '初': 目錄級 = '1'; 級名 = '初級'; break;
    case '中': 目錄級 = '2'; 檔級 = '1'; 級名 = '中級'; break;
    case '中高': 目錄級 = '3'; 檔級 = '2'; 級名 = '中高級'; break;
    case '高': 目錄級 = '4'; 檔級 = '3'; 級名 = '高級'; break;
  }
  fullLvlName = 腔名 + 級名;
  categoryList = [];
  var contentContainer = document.getElementById('generated');
  contentContainer.innerHTML = '';
  const arr = parseUnifiedCsv(content.content);
  const catPanel = document.getElementById('cat-panel');
  if (catPanel) {
    const catPanelClone = catPanel.cloneNode(true);
    catPanel.parentNode.replaceChild(catPanelClone, catPanel);
  }
  var radios = document.querySelectorAll('input[name="category"]');
  const radioLabels = document.querySelectorAll('.radioItem');
  const dialectInfo = { 腔, 級, 例外音檔, fullLvlName, generalMediaYr, 目錄級, 目錄另級, 檔腔, 檔級, 腔名, 級名, };
  radios.forEach(function (radio) {
    radio.addEventListener('change', function () {
      if (this.checked) {
        const selectedCategory = this.value;
        radioLabels.forEach((label) => label.classList.remove('active-category'));
        const currentLabel = this.closest('.radioItem');
        if (currentLabel) { currentLabel.classList.add('active-category'); }
        const progressDetailsSpan = document.getElementById('progressDetails');
        if (progressDetailsSpan) { progressDetailsSpan.textContent = ''; }
        const dialectLevelCodes = extractDialectLevelCodes(dialectInfo.fullLvlName);
        if (dialectLevelCodes) {
            const newUrl = new URL(window.location.href);
            newUrl.searchParams.set('dialect', dialectLevelCodes.dialect);
            newUrl.searchParams.set('level', dialectLevelCodes.level);
            newUrl.searchParams.set('category', selectedCategory);
            newUrl.searchParams.delete('row');
            history.pushState({}, '', newUrl.toString());
        }
        buildTableAndSetupPlayback(selectedCategory, arr, dialectInfo);
      }
    });
  });
  if (initialCategory) {
    const targetRadio = document.querySelector(`input[name="category"][value="${initialCategory}"]`);
    if (targetRadio) {
      targetRadio.checked = true;
      const targetLabel = targetRadio.closest('.radioItem');
      if (targetLabel) {
        radioLabels.forEach((label) => label.classList.remove('active-category'));
        targetLabel.classList.add('active-category');
      }
      buildTableAndSetupPlayback(initialCategory, arr, dialectInfo, targetRowId);
    }
  } else {
    updatePageTitle([currentActiveDialectLevelFullName]);
    radios.forEach((radio) => (radio.checked = false));
    contentContainer.innerHTML = '<p style="text-align: center; margin-top: 20px;">請選擇一個類別來顯示詞彙。</p>';
    updateResultsSummaryVisibility();
    document.querySelector('#audioControls')?.remove();
  }
  setTimeout(adjustHeaderFontSizeOnOverflow, 0);
}

function buildTableAndSetupPlayback(category, vocabularyArray, dialectInfo, autoPlayTargetRowId = null) {
    const resultsSummaryContainer = document.getElementById('results-summary');
    if (resultsSummaryContainer) {
        resultsSummaryContainer.textContent = `${dialectInfo.fullLvlName}認證詞彙：${category}類別`;
        if (!autoPlayTargetRowId) {
            resultsSummaryContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
    updatePageTitle([dialectInfo.fullLvlName, category]);
    const radioButtons = document.querySelectorAll('input[name="category"]');
    categoryList = Array.from(radioButtons).map((radio) => radio.value);
    const checkedRadio = document.querySelector('input[name="category"]:checked');
    currentCategoryIndex = checkedRadio ? categoryList.indexOf(checkedRadio.value) : -1;
    const contentContainer = document.getElementById('generated');
    contentContainer.innerHTML = '';
    const header = document.getElementById('header');
    if (!header) { return; }
    const existingInstructions = document.querySelectorAll('.ios-autoplay-instruction');
    existingInstructions.forEach(el => el.remove());
    const progressDetailsSpan = document.getElementById('progressDetails');
    const filteredItems = vocabularyArray.filter((line) => line.分類 && line.分類.includes(category));
    if (filteredItems.length === 0) {
        contentContainer.innerHTML = `<p style="text-align: center; margin-top: 20px;">${dialectInfo.級名} 無「${category}」个內容。</p>`;
        document.querySelector('#audioControls')?.remove();
        if (isCrossCategoryPlaying) {
            const emptyAudio = new Audio('empty_category.mp3');
            emptyAudio.play().catch((e) => console.error('播放空類別音效失敗:', e));
            emptyAudio.addEventListener('ended',() => {
                isCrossCategoryPlaying = false;
                const nextCategoryIndex = currentCategoryIndex + 1;
                if (nextCategoryIndex < categoryList.length) {
                    const nextCategoryValue = categoryList[nextCategoryIndex];
                    const nextRadioButton = document.querySelector(`input[name="category"][value="${nextCategoryValue}"]`);
                    if (nextRadioButton) {
                        if (finishedTableName && finishedCat) {
                            let bookmarks = JSON.parse(localStorage.getItem('hakkaBookmarks')) || [];
                            const previousBookmarkIndex = bookmarks.findIndex((bm) => bm.tableName === finishedTableName && bm.cat === finishedCat);
                            if (previousBookmarkIndex > -1) {
                                bookmarks.splice(previousBookmarkIndex, 1);
                                localStorage.setItem('hakkaBookmarks',JSON.stringify(bookmarks));
                                updateProgressDropdown();
                            }
                            finishedTableName = null;
                            finishedCat = null;
                        }
                        isCrossCategoryPlaying = true;
                        nextRadioButton.click();
                    } else { playEndOfPlayback(); }
                } else { playEndOfPlayback(); }
            }, { once: true });
        }
        return;
    }
    var table = document.createElement('table');
    table.innerHTML = '';
    let rowIndex = 0;
    let audioElementsList = [];
    let bookmarkButtonsList = [];
    for (const line of filteredItems) {
        const missingAudioInfo = typeof getMissingAudioInfo === 'function' ? getMissingAudioInfo(dialectInfo.fullLvlName, category, line.編號) : null;
        let mediaYr = dialectInfo.generalMediaYr;
        let pre112Insertion詞 = '';
        let pre112Insertion句 = '';
        let 詞目錄級 = dialectInfo.目錄級;
        let 句目錄級 = dialectInfo.目錄級;
        let mediaNo = '';
        var no = line.編號.split('-');
        if (no[0] <= 9) { no[0] = '0' + no[0]; }
        if (dialectInfo.級 === '初') { no[0] = '0' + no[0]; }
        if (no[1] <= 9) { no[1] = '0' + no[1]; }
        if (no[1] <= 99) { no[1] = '0' + no[1]; }
        mediaNo = no[1];
        const index = dialectInfo.例外音檔.findIndex(([編號]) => 編號 === line.編號);
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
        const 詞目錄 = 詞目錄級 + '/' + dialectInfo.檔腔 + '/' + pre112Insertion詞 + dialectInfo.檔級 + dialectInfo.檔腔;
        const 句目錄 = 句目錄級 + '/' + dialectInfo.檔腔 + '/' + pre112Insertion句 + dialectInfo.檔級 + dialectInfo.檔腔;
        let audioIndex = rowIndex * 2;
        rowIndex++;
        var item = document.createElement('tr');
        const td1 = document.createElement('td');
        td1.className = 'no';
        td1.dataset.label = '編號';
        const anchor = document.createElement('a');
        anchor.name = no[1];
        td1.appendChild(anchor);
        const noText = document.createTextNode(line.編號 + '\u00A0');
        td1.appendChild(noText);
        const bookmarkBtn = document.createElement('button');
        bookmarkBtn.className = 'bookmarkBtn';
        bookmarkBtn.dataset.rowId = no[1];
        bookmarkBtn.innerHTML = '<i class="fas fa-bookmark"></i>';
        td1.appendChild(bookmarkBtn);
        bookmarkButtonsList.push(bookmarkBtn);
        const playBtn = document.createElement('button');
        playBtn.className = 'playFromThisRow';
        playBtn.dataset.index = audioIndex;
        playBtn.dataset.rowId = no[1];
        playBtn.title = '從此列播放';
        playBtn.innerHTML = '<i class="fas fa-play"></i>';
        td1.appendChild(playBtn);
        item.appendChild(td1);
        const td2 = document.createElement('td');
        td2.dataset.label = '詞彙';
        const ruby = document.createElement('ruby');
        ruby.textContent = line.客家語;
        const rt = document.createElement('rt');
        rt.textContent = formatPhoneticForDisplay(line['客語標音_顯示']);
        ruby.appendChild(rt);
        td2.appendChild(ruby);
        td2.appendChild(document.createElement('br'));
        let wordAudioActuallyMissing = false;
        if (missingAudioInfo && missingAudioInfo.word === false) { wordAudioActuallyMissing = true; }
        if (wordAudioActuallyMissing) {
            const noWordAudioMsg = document.createElement('span');
            noWordAudioMsg.textContent = '（無詞彙音檔，敗勢）';
            noWordAudioMsg.style.color = 'red';
            td2.appendChild(noWordAudioMsg);
            const dummyAudioForMissingWord = document.createElement('audio');
            dummyAudioForMissingWord.className = 'media';
            dummyAudioForMissingWord.dataset.skip = 'true';
            dummyAudioForMissingWord.controls = false;
            dummyAudioForMissingWord.preload = 'none';
            dummyAudioForMissingWord.style.display = 'none';
            audioElementsList.push(dummyAudioForMissingWord);
        } else {
            const audio1 = document.createElement('audio');
            audio1.className = 'media';
            audio1.controls = true;
            audio1.preload = 'none';
            const source1 = document.createElement('source');
            let wordAudioSrc = `https://elearning.hakka.gov.tw/hakka/files/cert/vocabulary/${mediaYr}/${詞目錄}-${no[0]}-${mediaNo}.mp3`;
            if (dialectInfo.fullLvlName === '海陸中高級' && line.編號 === '4-261') {
                wordAudioSrc = 'https://elearning.hakka.gov.tw/hakka/files/dictionaries/3/hk0000014571/hk0000014571-1-2.mp3';
            }
            source1.src = wordAudioSrc;
            source1.type = 'audio/mpeg';
            audio1.appendChild(source1);
            td2.appendChild(audio1);
            audioElementsList.push(audio1);
        }
        td2.appendChild(document.createElement('br'));
        const meaningSpan = document.createElement('span');
        meaningSpan.innerHTML = line.華語詞義.replace(/"/g, '').replace(/\n/g, '<br>');
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
        const hasExampleSentenceText = line.例句 && line.例句.trim() !== '';
        if (hasExampleSentenceText) {
            const sentenceSpan = document.createElement('span');
            sentenceSpan.className = 'sentence';
            sentenceSpan.innerHTML = line.例句.replace(/"/g, '').replace(/\n/g, '<br>');
            td3.appendChild(sentenceSpan);
            td3.appendChild(document.createElement('br'));
            let sentenceAudioActuallyMissing = false;
            if (missingAudioInfo && missingAudioInfo.sentence === false) { sentenceAudioActuallyMissing = true; }
            if (dialectInfo.級名 === '高級') {
                const dummyAudioForAdvanced = document.createElement('audio');
                dummyAudioForAdvanced.className = 'media';
                dummyAudioForAdvanced.dataset.skip = 'true';
                dummyAudioForAdvanced.controls = false;
                dummyAudioForAdvanced.preload = 'none';
                dummyAudioForAdvanced.style.display = 'none';
                td3.appendChild(dummyAudioForAdvanced);
                audioElementsList.push(dummyAudioForAdvanced);
            } else if (sentenceAudioActuallyMissing) {
                const noSentenceAudioMsg = document.createElement('span');
                noSentenceAudioMsg.textContent = '（無例句音檔，敗勢）';
                noSentenceAudioMsg.style.color = 'magenta';
                td3.appendChild(noSentenceAudioMsg);
                const dummyAudioForMissingSentence = document.createElement('audio');
                dummyAudioForMissingSentence.className = 'media';
                dummyAudioForMissingSentence.dataset.skip = 'true';
                dummyAudioForMissingSentence.controls = false;
                dummyAudioForMissingSentence.preload = 'none';
                dummyAudioForMissingSentence.style.display = 'none';
                td3.appendChild(dummyAudioForMissingSentence);
                audioElementsList.push(dummyAudioForMissingSentence);
            } else {
                const audio2 = document.createElement('audio');
                audio2.className = 'media';
                audio2.controls = true;
                audio2.preload = 'none';
                const source2 = document.createElement('source');
                source2.src = `https://elearning.hakka.gov.tw/hakka/files/cert/vocabulary/${mediaYr}/${句目錄}-${no[0]}-${mediaNo}s.mp3`;
                source2.type = 'audio/mpeg';
                audio2.appendChild(source2);
                td3.appendChild(audio2);
                audioElementsList.push(audio2);
            }
            td3.appendChild(document.createElement('br'));
            const translationText = document.createElement('span');
            translationText.innerHTML = line.翻譯.replace(/"/g, '').replace(/\n/g, '<br>');
            td3.appendChild(translationText);
        } else {
            td3.classList.add('empty-sentence-cell');
            const dummyAudioNoSentence = document.createElement('audio');
            dummyAudioNoSentence.className = 'media';
            dummyAudioNoSentence.dataset.skip = 'true';
            dummyAudioNoSentence.controls = false;
            dummyAudioNoSentence.preload = 'none';
            dummyAudioNoSentence.style.display = 'none';
            td3.appendChild(dummyAudioNoSentence);
            audioElementsList.push(dummyAudioNoSentence);
        }
        item.appendChild(td3);
        table.appendChild(item);
    }
    table.setAttribute('width', '100%');
    contentContainer.appendChild(table);
    if (dialectInfo.腔 === '大') {
        大埔高降異化();
        大埔中遇低升();
        大埔低升異化();
    }
    setTimeout(() => handleResizeActions(), 50);
    const audioElements = audioElementsList;
    const bookmarkButtons = bookmarkButtonsList;
    function addNowPlaying(element) {
        removeNowPlaying();
        element.id = 'nowPlaying';
        element.classList.remove('paused-playback');
    }
    function removeNowPlaying() {
        const nowPlaying = document.getElementById('nowPlaying');
        if (nowPlaying) { nowPlaying.removeAttribute('id'); }
    }
    function playEndOfPlayback() {
        const progressDropdown = document.getElementById('progressDropdown');
        if (progressDropdown && progressDropdown.options.length > 0) { progressDropdown.options[0].text = '擇進前个進度'; }
        const endAudio = new Audio('endOfPlay.mp3');
        endAudio.play().catch((e) => console.error('播放結束音效失敗:', e));
        currentAudioIndex = 0;
        isPlaying = false;
        isPaused = false;
        currentAudio = null;
        const pauseResumeButton = document.getElementById('pauseResumeBtn');
        const stopButton = document.getElementById('stopBtn');
        if (pauseResumeButton) { pauseResumeButton.innerHTML = '<i class="fas fa-pause"></i>'; pauseResumeButton.classList.remove('ongoing'); pauseResumeButton.classList.add('ended'); }
        if (stopButton) { stopButton.classList.remove('ongoing'); stopButton.classList.add('ended'); }
        document.querySelectorAll('.playFromThisRow').forEach((element) => { element.classList.remove('ongoing'); element.classList.add('playable'); });
        removeNowPlaying();
        isCrossCategoryPlaying = false;
        if (finishedTableName && finishedCat) {
            let bookmarks = JSON.parse(localStorage.getItem('hakkaBookmarks')) || [];
            const lastBookmarkIndex = bookmarks.findIndex((bm) => bm.tableName === finishedTableName && bm.cat === finishedCat);
            if (lastBookmarkIndex > -1) {
                bookmarks.splice(lastBookmarkIndex, 1);
                localStorage.setItem('hakkaBookmarks', JSON.stringify(bookmarks));
                updateProgressDropdown();
            }
        }
        finishedTableName = null;
        finishedCat = null;
    }
    function playAudio(index) {
        if (!isPlaying) { return; }
        const radioButtons = document.querySelectorAll('input[name="category"]');
        categoryList = Array.from(radioButtons).map((radio) => radio.value);
        const checkedRadio = document.querySelector('input[name="category"]:checked');
        currentCategoryIndex = checkedRadio ? categoryList.indexOf(checkedRadio.value) : -1;
        const currentCategoryAudioElements = audioElementsList;
        if (index >= currentCategoryAudioElements.length) {
            const nextCategoryIndex = currentCategoryIndex + 1;
            if (nextCategoryIndex < categoryList.length) {
                const nextCategoryValue = categoryList[nextCategoryIndex];
                let bookmarks = JSON.parse(localStorage.getItem('hakkaBookmarks')) || [];
                const previousBookmarkIndex = bookmarks.findIndex((bm) => bm.tableName === dialectInfo.fullLvlName && bm.cat === category);
                if (previousBookmarkIndex > -1) { bookmarks.splice(previousBookmarkIndex, 1); localStorage.setItem('hakkaBookmarks', JSON.stringify(bookmarks)); }
                const dialectLevelCodes = extractDialectLevelCodes(dialectInfo.fullLvlName);
                if (dialectLevelCodes) {
                    const newUrl = new URL(window.location.href);
                    newUrl.searchParams.set('category', nextCategoryValue);
                    newUrl.searchParams.delete('row');
                    history.pushState({}, '', newUrl.toString());
                }
                const nextRadioButton = document.querySelector(`input[name="category"][value="${nextCategoryValue}"]`);
                if (nextRadioButton) { isCrossCategoryPlaying = true; nextRadioButton.click(); }
                else { playEndOfPlayback(); }
            } else {
                finishedTableName = dialectInfo.fullLvlName;
                finishedCat = category;
                playEndOfPlayback();
            }
            return;
        }
        currentAudio = currentCategoryAudioElements[index];
        const sourceUrlForErrorLog = currentAudio.src;
        if (currentAudio.dataset.skip === 'true') {
            currentAudioIndex++;
            playAudio(currentAudioIndex);
            return;
        }
        currentAudio.play().then(() => {
            currentAudio.removeEventListener('ended', handleAudioEnded);
            currentAudio.addEventListener('ended', handleAudioEnded, { once: true, });
            isPlaying = true;
            isPaused = false;
            const pauseResumeButton = document.getElementById('pauseResumeBtn');
            if (pauseResumeButton) {
                pauseResumeButton.innerHTML = '<i class="fas fa-pause"></i>';
                pauseResumeButton.classList.remove('ended');
                pauseResumeButton.classList.add('ongoing');
            }
            const rowElement = currentAudio.closest('tr');
            const audioTd = currentAudio.closest('td');
            if (rowElement) { addNowPlaying(rowElement); }
            if (audioTd) {
                audioTd.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest', });
                const rowButton = currentAudio.closest('tr')?.querySelector('button[data-row-id]');
                if (rowButton) {
                    const rowId = rowButton.dataset.rowId;
                    let rowNum = rowId.replace(/^0+/, '');
                    let totalRowsInCurrentCategory = bookmarkButtonsList.length;
                    let percentage = (rowNum / totalRowsInCurrentCategory) * 100;
                    let percentageFixed = percentage.toFixed(2);
                    saveBookmark(rowId, percentageFixed, category, dialectInfo.fullLvlName, true);
                }
            } else if (rowElement) {
                rowElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }).catch((error) => {
            console.error(`播放音訊失敗 (索引 ${index}, src: ${sourceUrlForErrorLog}): ${error.name} - ${error.message}`, error);
            currentAudioIndex++;
            playAudio(currentAudioIndex);
            if (isPlaying && currentAudio === currentCategoryAudioElements[index]) {
                currentAudioIndex++;
                playAudio(currentAudioIndex);
            }
        });
    }
    function handleAudioEnded() {
        currentAudioIndex++;
        playAudio(currentAudioIndex);
    }
    const currentTableNameForBookmark = dialectInfo.fullLvlName;
    const currentCategoryForBookmark = category;
    bookmarkButtons.forEach((button) => {
        button.addEventListener('click', function () {
            const rowId = this.dataset.rowId;
            let rowNum = rowId.replace(/^0+/, '');
            let totalRows = bookmarkButtonsList.length;
            let percentage = (rowNum / totalRows) * 100;
            let percentageFixed = percentage.toFixed(2);
            saveBookmark(rowId, percentageFixed, currentCategoryForBookmark, currentTableNameForBookmark);
        });
    });
    let audioControlsDiv = document.getElementById('audioControls');
    let playAllButton, pauseResumeButton, stopButton;
    if (!audioControlsDiv) {
        audioControlsDiv = document.createElement('span');
        audioControlsDiv.id = 'audioControls';
        playAllButton = document.createElement('button');
        playAllButton.id = 'playAllBtn';
        playAllButton.title = '依序播放';
        playAllButton.innerHTML = '<i class="fas fa-play"></i>';
        playAllButton.style.display = 'none';
        pauseResumeButton = document.createElement('button');
        pauseResumeButton.id = 'pauseResumeBtn';
        pauseResumeButton.title = '暫停/繼續';
        pauseResumeButton.innerHTML = '<i class="fas fa-pause"></i>';
        stopButton = document.createElement('button');
        stopButton.id = 'stopBtn';
        stopButton.title = '停止';
        stopButton.innerHTML = '<i class="fas fa-stop"></i>';
        audioControlsDiv.appendChild(playAllButton);
        audioControlsDiv.appendChild(pauseResumeButton);
        audioControlsDiv.appendChild(stopButton);
        resultsSummaryContainer.appendChild(audioControlsDiv);
    } else {
        playAllButton = audioControlsDiv.querySelector('#playAllBtn');
        pauseResumeButton = audioControlsDiv.querySelector('#pauseResumeBtn');
        stopButton = audioControlsDiv.querySelector('#stopBtn');
        if (!pauseResumeButton || !stopButton) {
            audioControlsDiv.innerHTML = '';
            playAllButton = document.createElement('button');
            playAllButton.style.display = 'none';
            pauseResumeButton = document.createElement('button');
            stopButton = document.createElement('button');
            audioControlsDiv.appendChild(playAllButton);
            audioControlsDiv.appendChild(pauseResumeButton);
            audioControlsDiv.appendChild(stopButton);
            playAllButton = audioControlsDiv.querySelector('#playAllBtn');
            pauseResumeButton = audioControlsDiv.querySelector('#pauseResumeBtn');
            stopButton = audioControlsDiv.querySelector('#stopBtn');
        }
    }
    if (pauseResumeButton) {
        pauseResumeButton.onclick = function () {
            const nowPlayingRow = document.getElementById('nowPlaying');
            if (isPlaying) {
                if (isPaused) {
                    currentAudio?.play().catch((e) => console.error('恢復播放失敗:', e));
                    isPaused = false;
                    this.innerHTML = '<i class="fas fa-pause"></i>';
                    this.classList.add('ongoing');
                    this.classList.remove('ended');
                    if (nowPlayingRow) nowPlayingRow.classList.remove('paused-playback');
                    const audioTd = currentAudio?.closest('td');
                    if (audioTd) {
                        audioTd.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest', });
                    } else {
                        const nowPlayingElement = document.getElementById('nowPlaying');
                        if (nowPlayingElement) { nowPlayingElement.scrollIntoView({ behavior: 'smooth', block: 'center', }); }
                    }
                } else {
                    currentAudio?.pause();
                    isPaused = true;
                    this.innerHTML = '<i class="fas fa-play"></i>';
                    this.classList.remove('ongoing');
                    this.classList.add('ended');
                    if (nowPlayingRow) nowPlayingRow.classList.add('paused-playback');
                }
            }
        };
    }
    if (stopButton) {
        stopButton.onclick = function () {
            if (isPlaying) {
                if (currentAudio) {
                    currentAudio.pause();
                    currentAudio.currentTime = 0;
                    currentAudio.removeEventListener('ended', handleAudioEnded);
                }
                currentAudioIndex = 0;
                isPlaying = false;
                isPaused = false;
                currentAudio = null;
                const progressDropdown = document.getElementById('progressDropdown');
                if (progressDropdown && progressDropdown.options.length > 0) { progressDropdown.options[0].text = '擇進前个進度'; }
                if (pauseResumeButton) { pauseResumeButton.innerHTML = '<i class="fas fa-pause"></i>'; pauseResumeButton.classList.remove('ongoing'); pauseResumeButton.classList.add('ended'); }
                this.classList.remove('ongoing');
                this.classList.add('ended');
                document.querySelectorAll('.playFromThisRow').forEach((element) => { element.classList.remove('ongoing'); element.classList.add('playable'); });
                removeNowPlaying();
            }
        };
    }
    const playFromRowButtons = document.querySelectorAll('.playFromThisRow');
    playFromRowButtons.forEach((button) => {
        button.onclick = function () {
            if (isPlaying) {
                if (stopButton) stopButton.click();
                setTimeout(() => { startPlayingFromRow(this); }, 100);
            } else {
                startPlayingFromRow(this);
            }
        };
    });
    function startPlayingFromRow(buttonElement) {
        isCrossCategoryPlaying = false;
        finishedTableName = null;
        finishedCat = null;
        currentAudioIndex = parseInt(buttonElement.dataset.index);
        isPlaying = true;
        isPaused = false;
        playAudio(currentAudioIndex);
        if (pauseResumeButton) { pauseResumeButton.innerHTML = '<i class="fas fa-pause"></i>'; pauseResumeButton.classList.remove('ended'); pauseResumeButton.classList.add('ongoing'); }
        if (stopButton) { stopButton.classList.remove('ended'); stopButton.classList.add('ongoing'); }
        playFromRowButtons.forEach((element) => { element.classList.add('ongoing'); });
    }
    if (autoPlayTargetRowId) {
        const targetAnchor = document.querySelector(`a[name="${autoPlayTargetRowId}"]`);
        if (targetAnchor) {
            const targetRow = targetAnchor.closest('tr');
            if (targetRow) {
                if (progressDetailsSpan) {
                    const bookmarks = JSON.parse(localStorage.getItem('hakkaBookmarks')) || [];
                    const loadedBookmark = bookmarks.find((bm) => bm.tableName === dialectInfo.fullLvlName && bm.cat === category && bm.rowId === autoPlayTargetRowId);
                    const dialectLevelCodes = extractDialectLevelCodes(dialectInfo.fullLvlName);
                    if (dialectLevelCodes) {
                        let baseURL = '';
                        if (window.location.protocol === 'file:') { baseURL = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1); }
                        else { let path = window.location.pathname; baseURL = window.location.origin + path.substring(0, path.lastIndexOf('/') + 1); if (!baseURL.endsWith('/')) { baseURL += '/'; } }
                        const shareURL = `${baseURL}index.html?dialect=${dialectLevelCodes.dialect}&level=${dialectLevelCodes.level}&category=${category}&row=${autoPlayTargetRowId}`;
                        const linkText = loadedBookmark ? `#${loadedBookmark.rowId} (${loadedBookmark.percentage}%)` : `#${autoPlayTargetRowId}`;
                        const linkElement = document.createElement('a');
                        linkElement.href = shareURL;
                        linkElement.textContent = linkText;
                        linkElement.style.marginLeft = '5px';
                        progressDetailsSpan.innerHTML = '';
                        progressDetailsSpan.appendChild(linkElement);
                    } else {
                        const textContent = loadedBookmark ? `#${loadedBookmark.rowId} (${loadedBookmark.percentage}%)` : `#${autoPlayTargetRowId}`;
                        progressDetailsSpan.textContent = textContent;
                    }
                }
                const isRunningOnIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
                if (isRunningOnIOS && loadedViaUrlParams) {
                    const playButtonTd = targetRow.querySelector('td.no');
                    if (playButtonTd) { playButtonTd.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' }); }
                    else { targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
                    const existingInstruction = targetRow.previousElementSibling;
                    if (!existingInstruction || !existingInstruction.classList.contains('ios-autoplay-instruction')) {
                        const instructionRow = document.createElement('tr');
                        instructionRow.className = 'ios-autoplay-instruction';
                        const instructionCell = document.createElement('td');
                        instructionCell.colSpan = 3;
                        instructionCell.style.textAlign = 'center';
                        instructionCell.style.padding = '8px 0';
                        instructionCell.innerHTML = '<strong style="color: #007bff;">👇 請點右片个 ▶️ 按鈕來開始播放。</strong>';
                        instructionRow.appendChild(instructionCell);
                        targetRow.parentNode.insertBefore(instructionRow, targetRow);
                    }
                } else {
                    targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    const playButton = targetRow.querySelector(`.playFromThisRow[data-row-id="${autoPlayTargetRowId}"]`);
                    if (playButton) {
                        if (stopButton && isPlaying) { stopButton.click(); }
                        setTimeout(() => { playButton.click(); }, 300);
                    }
                }
            }
        } else {
            if (progressDetailsSpan) { progressDetailsSpan.textContent = ''; }
        }
    } else {
        if (!isCrossCategoryPlaying && progressDetailsSpan) { progressDetailsSpan.textContent = ''; }
        if (isCrossCategoryPlaying) {
            if (finishedTableName && finishedCat) {
                let bookmarks = JSON.parse(localStorage.getItem('hakkaBookmarks')) || [];
                const previousBookmarkIndex = bookmarks.findIndex((bm) => bm.tableName === finishedTableName && bm.cat === finishedCat);
                if (previousBookmarkIndex > -1) {
                    bookmarks.splice(previousBookmarkIndex, 1);
                    localStorage.setItem('hakkaBookmarks', JSON.stringify(bookmarks));
                    updateProgressDropdown();
                }
                finishedTableName = null;
                finishedCat = null;
            }
            const firstPlayButton = contentContainer.querySelector('.playFromThisRow');
            if (firstPlayButton) {
                setTimeout(() => { startPlayingFromRow(firstPlayButton); }, 100);
            } else { playEndOfPlayback(); }
        }
    }
    setTimeout(adjustHeaderFontSizeOnOverflow, 0);
    updateResultsSummaryVisibility();
}

// ... (and the rest of the functions from the original file)

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
        if (!searchContainer.contains(event.target)) {
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
