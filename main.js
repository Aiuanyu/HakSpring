const DATA_FILES_TO_CACHE = [
  // 認證詞彙
  'data/cert/113四基.json', 'data/cert/113四初.json', 'data/cert/113四中.json', 'data/cert/113四中高.json', 'data/cert/113四高.json',
  'data/cert/113海基.json', 'data/cert/113海初.json', 'data/cert/113海中.json', 'data/cert/113海中高.json', 'data/cert/113海高.json',
  'data/cert/113大基.json', 'data/cert/113大初.json', 'data/cert/113大中.json', 'data/cert/113大中高.json', 'data/cert/113大高.json',
  'data/cert/113平基.json', 'data/cert/113平初.json', 'data/cert/113平中.json', 'data/cert/113平中高.json', 'data/cert/113平高.json',
  'data/cert/113安基.json', 'data/cert/113安初.json', 'data/cert/113安中.json', 'data/cert/113安中高.json', 'data/cert/113安高.json',
  // 教典資料
  'data/gip/20250630-四.json', 'data/gip/20250630-南.json', 'data/gip/20250630-海.json', 'data/gip/20250630-大.json', 'data/gip/20250630-平.json', 'data/gip/20250630-安.json',
  // 其他資料
  'tone_mapping.json',
  'NAmedias.json',
  'exclusions.json'
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
let lastSelectionRectForMobile = null; // <-- 新增：手機版最後選取範圍 (分按鈕點擊時用)

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
      'event_category': category,
      'event_label': label
    });
    console.log(`GA Event Sent: { Action: ${action}, Category: ${category}, Label: ${label} }`);
  } else {
    console.warn('gtag function not found. GA event not sent.');
  }
}

// --- IndexedDB Helper Functions (Improved Error Handling) ---

function formatPhoneticForDisplay(text) {
    if (!text) return "";
    let result = text.replace(/\s*([【（】）])\s*/g, '$1');
    result = result.replace(/\(\s+/g, '(');
    result = result.replace(/\s+\)/g, ')');
    return result;
}

function countSyllables(romanizationText) {
    if (!romanizationText) return 0;
    const tokens = romanizationText.match(/[【】（）()\/]|[^【】（）()\/\s]+/g) || [];
    const syllables = tokens.filter(token => !/^[【】（）()\/]$/.test(token));
    return syllables.length;
}

function getFullLevelName(dataVarNameStr) {
  if (!dataVarNameStr || dataVarNameStr.length < 2) return dataVarNameStr;
  let dialectChar = dataVarNameStr.substring(0, 1);
  let levelAbbr = dataVarNameStr.substring(1);
  let dialectName = '';
  let levelName = '';
  switch (dialectChar) {
    case '四': dialectName = '四縣'; break;
    case '海': dialectName = '海陸'; break;
    case '大': dialectName = '大埔'; break;
    case '平': dialectName = '饒平'; break;
    case '安': dialectName = '詔安'; break;
    default: dialectName = dialectChar;
  }
  switch (levelAbbr) {
    case '基': levelName = '基礎級'; break;
    case '初': levelName = '初級'; break;
    case '中': levelName = '中級'; break;
    case '中高': levelName = '中高級'; break;
    case '高': levelName = '高級'; break;
    default: levelName = levelAbbr;
  }
  return dialectName + levelName;
}

function isSourceMatchingDialect(source, dialect) {
  if (!source || !dialect) return false;
  if (dialect === '南四縣') {
    return source.startsWith('南四縣') || (source.startsWith('四縣') && !source.endsWith('教典'));
  }
  return source.startsWith(dialect);
}

function findPronunciationsInAllData(searchText) {
  if (!searchText || searchText.trim().length === 0) return [];
  const normalizedSearchText = searchText.trim();
  let foundReadings = [];
  const uniqueEntries = new Set();
  if (indexedDataCache[normalizedSearchText]) {
    const exactMatches = JSON.parse(JSON.stringify(indexedDataCache[normalizedSearchText]));
    exactMatches.forEach(reading => {
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
      indexedDataCache[term].forEach(reading => {
        const entryKey = `${reading.pronunciation}|${reading.source}|${reading.originalTerm}`;
        if (!uniqueEntries.has(entryKey)) {
          const partialMatchReading = { ...JSON.parse(JSON.stringify(reading)), isExactMatch: false };
          foundReadings.push(partialMatchReading);
          uniqueEntries.add(entryKey);
        }
      });
    }
  }
  return foundReadings;
}

function constructAudioUrlForPopup(lineData, dialectInfo) {
  if (!dialectInfo) return null;
  if (dialectInfo.sourceType === 'gip') {
    const audioFileName = lineData['詞目音檔名'];
    if (audioFileName && audioFileName.trim() !== '') {
      const finalName = audioFileName.endsWith('.mp3') ? audioFileName : `${audioFileName}.mp3`;
      return `https://hakkadict.moe.edu.tw/static/audio/${finalName}`;
    }
    return null;
  }
  if (dialectInfo.sourceType === 'cert') {
    if (!lineData || !lineData.編號 || !dialectInfo.dataVarName) return null;
    const dataVarName = dialectInfo.dataVarName;
    const 腔 = dataVarName.substring(0, 1);
    const 級 = dataVarName.substring(1);
    let selected例外音檔;
    switch (級) {
      case '基': selected例外音檔 = typeof 基例外音檔 !== 'undefined' ? 基例外音檔 : []; break;
      case '初': selected例外音檔 = typeof 初例外音檔 !== 'undefined' ? 初例外音檔 : []; break;
      case '中': selected例外音檔 = typeof 中例外音檔 !== 'undefined' ? 中例外音檔 : []; break;
      case '中高': selected例外音檔 = typeof 中高例外音檔 !== 'undefined' ? 中高例外音檔 : []; break;
      case '高': selected例外音檔 = typeof 高例外音檔 !== 'undefined' ? 高例外音檔 : []; break;
      default: selected例外音檔 = [];
    }
    let 檔腔 = '', 檔級 = '', 目錄級 = '', 目錄另級 = undefined;
    if (腔 === '四') { 檔腔 = 'si'; } else if (腔 === '海') { 檔腔 = 'ha'; } else if (腔 === '大') { 檔腔 = 'da'; } else if (腔 === '平') { 檔腔 = 'rh'; } else if (腔 === '安') { 檔腔 = 'zh'; }
    if (級 === '基') { 目錄級 = '5'; 目錄另級 = '1'; } else if (級 === '初') { 目錄級 = '1'; } else if (級 === '中') { 目錄級 = '2'; 檔級 = '1'; } else if (級 === '中高') { 目錄級 = '3'; 檔級 = '2'; } else if (級 === '高') { 目錄級 = '4'; 檔級 = '3'; }
    let mediaYr = '112';
    let pre112Insertion詞 = '';
    let current目錄級 = 目錄級;
    const noParts = lineData.編號.split('-');
    if (noParts.length < 2) return null;
    let no_0 = noParts[0];
    if (no_0.length === 1 && !isNaN(parseInt(no_0))) no_0 = '0' + no_0;
    if (級 === '初') no_0 = '0' + no_0;
    let mediaNo = noParts[1];
    if (mediaNo.length < 2 && !isNaN(parseInt(mediaNo))) mediaNo = '0' + mediaNo;
    if (mediaNo.length < 3 && !isNaN(parseInt(mediaNo))) mediaNo = '0' + mediaNo;
    const exceptionIndex = selected例外音檔.findIndex(([編號]) => 編號 === lineData.編號);
    if (exceptionIndex !== -1) {
      const matchedElement = selected例外音檔[exceptionIndex];
      mediaYr = matchedElement[1] || mediaYr;
      mediaNo = matchedElement[2] || mediaNo;
      pre112Insertion詞 = 'w/';
      if (目錄另級 !== undefined) current目錄級 = 目錄另級;
    }
    const 詞目錄 = `${current目錄級}/${檔腔}/${pre112Insertion詞}${檔級}${檔腔}`;
    let audioSrc = `https://elearning.hakka.gov.tw/hakka/files/cert/vocabulary/${mediaYr}/${詞目錄}-${no_0}-${mediaNo}.mp3`;
    if (getFullLevelName(dataVarName) === '海陸中高級' && lineData.編號 === '4-261') {
      audioSrc = 'https://elearning.hakka.gov.tw/hakka/files/dictionaries/3/hk0000014571/hk0000014571-1-2.mp3';
    }
    return audioSrc;
  }
  return null;
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

function showPronunciationPopup(selectedText, readings, anchorElementOrRect, callbackOnSelect, contextualDialect = null) {
  const popupEl = document.getElementById('selectionPopup');
  const contentEl = document.getElementById('selectionPopupContent');
  const backdropEl = document.getElementById('selectionPopupBackdrop');
  const showOtherAccentsToggle = document.getElementById('showOtherAccentsToggle');
  const popupTitleElement = document.getElementById('selectionPopupTitle');
  if (!popupEl || !contentEl || !backdropEl || !showOtherAccentsToggle || !popupTitleElement) return;
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
  function renderPronunciationList() {
    contentEl.innerHTML = '';
    const showAllAccents = showOtherAccentsToggle.checked;
    let currentDialect = contextualDialect || currentActiveMainDialectName || '四縣';
    let displayReadings = [...readings];
    if (!showAllAccents) {
      displayReadings = displayReadings.filter(r => isSourceMatchingDialect(r.source, currentDialect));
    }
    displayReadings.sort((a, b) => {
      if (a.isExactMatch !== b.isExactMatch) return a.isExactMatch ? -1 : 1;
      const aSyllables = countSyllables(a.pronunciation);
      const bSyllables = countSyllables(b.pronunciation);
      if (aSyllables !== bSyllables) return aSyllables - bSyllables;
      if (a.originalTerm !== b.originalTerm) return a.originalTerm.localeCompare(b.originalTerm);
      return a.source.localeCompare(b.source);
    });
    if (displayReadings.length > 0) {
      const accordionContainer = document.createElement('div');
      accordionContainer.className = 'accordion-container';
      displayReadings.forEach(reading => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'accordion-item';
        const headerBtn = document.createElement('button');
        headerBtn.className = 'accordion-header';
        let headerText = `<span class="pronunciation-text">${reading.pronunciation}</span>`;
        if (!reading.isExactMatch) {
          headerText = `<span class="pronunciation-text">${reading.pronunciation} (詞目: ${reading.originalTerm})</span>`;
        }
        const audioUrl = reading.audioDetails ? constructAudioUrlForPopup(reading.audioDetails.lineData, reading.audioDetails.dialectInfo) : null;
        let audioElementHTML = '';
        if (audioUrl) {
          audioElementHTML = `<button class="popup-audio-play-btn" data-audio-src="${audioUrl}" title="播放讀音" style="background:none; border:none; color:inherit; font-size:1.1em; padding:0 5px; margin-left:8px; vertical-align:middle; cursor:pointer;"><i class="fas fa-volume-up"></i></button>`;
        }
        let substituteButtonHTML = '';
        if (typeof callbackOnSelect === 'function') {
          substituteButtonHTML = `<button class="popup-substitute-btn" title="選用這个讀音"><i class="fas fa-arrow-up-from-bracket"></i></button>`;
        }
        headerBtn.innerHTML = `<div class="accordion-header-content">${headerText}<span class="pronunciation-source">(${reading.source})</span></div><div class="accordion-header-controls">${audioElementHTML}${substituteButtonHTML}<span class="indicator">+</span></div>`;
        const panelDiv = document.createElement('div');
        panelDiv.className = 'accordion-panel';
        panelDiv.innerHTML = `<p><strong>華語詞義：</strong> ${(reading.mandarinMeaning || '無資料').replace(/"/g, '')}</p>`;
        itemDiv.appendChild(headerBtn);
        itemDiv.appendChild(panelDiv);
        accordionContainer.appendChild(itemDiv);
        const playButton = headerBtn.querySelector('.popup-audio-play-btn');
        if (playButton) {
          playButton.addEventListener('click', (e) => { e.stopPropagation(); const header = playButton.closest('.accordion-header'); const panel = header ? header.nextElementSibling : null; if (header && panel && !header.classList.contains('active')) { header.classList.add('active'); const indicator = header.querySelector('.indicator'); panel.style.maxHeight = panel.scrollHeight + "px"; if (indicator) indicator.textContent = '−'; } const audioSrc = playButton.dataset.audioSrc; if (audioSrc) { if (window.currentPopupAudio && typeof window.currentPopupAudio.pause === 'function') { window.currentPopupAudio.pause(); window.currentPopupAudio.currentTime = 0; } window.currentPopupAudio = new Audio(audioSrc); const iconElement = playButton.querySelector('i'); const originalIconClasses = iconElement ? iconElement.className : ''; if (iconElement) iconElement.className = 'fas fa-spinner fa-spin'; window.currentPopupAudio.play().catch(err => { console.error("播放 popup 音檔失敗:", err); if (iconElement) iconElement.className = originalIconClasses; }); window.currentPopupAudio.onended = () => { if (iconElement) iconElement.className = originalIconClasses; window.currentPopupAudio = null; }; window.currentPopupAudio.onerror = () => { if (iconElement) iconElement.className = originalIconClasses; window.currentPopupAudio = null; }; } });
        }
        const substituteBtn = headerBtn.querySelector('.popup-substitute-btn');
        if (substituteBtn) {
          substituteBtn.addEventListener('click', (e) => { e.stopPropagation(); if (typeof callbackOnSelect === 'function') { const selectedPhonetic = reading.pronunciation; callbackOnSelect(anchorElementOrRect, selectedPhonetic); hidePronunciationPopup(popupEl, backdropEl); } });
        }
        headerBtn.addEventListener('click', () => { headerBtn.classList.toggle('active'); const indicator = headerBtn.querySelector('.indicator'); if (panelDiv.style.maxHeight) { panelDiv.style.maxHeight = null; if (indicator) indicator.textContent = '+'; } else { panelDiv.style.maxHeight = panelDiv.scrollHeight + "px"; if (indicator) indicator.textContent = '−'; } });
      });
      contentEl.appendChild(accordionContainer);
    } else {
      if (readings.length === 0) {
        contentEl.innerHTML = `<p class="popup-not-found">在所有腔調中都尋無「${selectedText}」个讀音。<br>請試看啊重新斷詞，或者縮短尋个字詞。</p>`;
      } else {
        const dialectName = currentDialect === '四縣' ? '四縣或南四縣' : currentDialect;
        contentEl.innerHTML = `<p class="popup-not-found">在「${dialectName}」腔頭尋無讀音。<br>請試看啊打開「顯示其他腔頭」。</p>`;
      }
    }
  }
  showOtherAccentsToggle.onchange = renderPronunciationList;
  renderPronunciationList();
  popupEl.style.display = 'block';
  backdropEl.style.display = 'block';
  activeSelectionPopup = true;
  if (initialRect) {
    updatePopupPosition(popupEl, initialRect);
  }
  popupEl.focus();
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

function handleTextSelectionInSentence(event, popupEl, contentEl, backdropEl, generatedArea) {
  let target = event.target;
  let sentenceSpan = target.closest('span.sentence');
  if (!sentenceSpan || !generatedArea.contains(sentenceSpan)) return;
  const selection = window.getSelection();
  if (selection.rangeCount > 0) {
    const selectedText = selection.toString().trim();
    if (selectedText.length > 0 && selectedText.length <= 15) {
      const readings = findPronunciationsInAllData(selectedText);
      let anchorElement = null;
      const trElement = sentenceSpan.closest('tr');
      if (trElement) {
        const exampleTd = trElement.cells[2];
        if (exampleTd) {
          anchorElement = exampleTd.querySelector('audio.media:not([data-skip="true"])');
        }
      }
      if (!anchorElement) {
        anchorElement = sentenceSpan;
      }
      if (anchorElement) {
        showPronunciationPopup(selectedText, readings, anchorElement, null);
      } else {
        const rect = selection.getRangeAt(0).getBoundingClientRect();
        showPronunciationPopup(selectedText, readings, rect, null);
      }
    }
  }
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
  const isRoman = /^[a-zA-Z0-9áàăâāǎéèĕêēěíìĭîīǐóòŏôōǒúùŭûūǔńňǹ\s\-\']+$/.test(text);
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
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

function createMobileLookupButton(popupEl, contentEl, backdropEl) {
  if (mobileLookupButton) return;
  mobileLookupButton = document.createElement('button');
  mobileLookupButton.id = 'mobileLookupBtn';
  mobileLookupButton.innerHTML = '尋讀音 <i class="fas fa-search"></i>';
  mobileLookupButton.style.display = 'none';
  document.body.appendChild(mobileLookupButton);
  mobileLookupButton.addEventListener('click', () => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 0 && lastSelectionRectForMobile) {
      const selectedText = selection.toString().trim();
      if (selectedText.length > 0 && selectedText.length <= 15) {
        const readings = findPronunciationsInAllData(selectedText);
        showPronunciationPopup(selectedText, readings, lastSelectionRectForMobile, null);
        hideMobileLookupButton();
      }
    } else {
      hideMobileLookupButton();
    }
  });
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

const debouncedMobileSelectionHandler = debounce(function() {
  const selection = window.getSelection();
  const contentContainer = document.getElementById('generated');
  if (selection && selection.rangeCount > 0 && selection.toString().trim().length > 0) {
    const range = selection.getRangeAt(0);
    const selectedText = selection.toString().trim();
    const commonAncestorContainer = range.commonAncestorContainer;
    let sentenceSpan = null;
    if (commonAncestorContainer.nodeType === Node.ELEMENT_NODE) {
      sentenceSpan = commonAncestorContainer.closest('span.sentence');
    } else if (commonAncestorContainer.parentNode) {
      sentenceSpan = commonAncestorContainer.parentNode.closest('span.sentence');
    }
    if (sentenceSpan && contentContainer && contentContainer.contains(sentenceSpan) && selectedText.length > 0 && selectedText.length <= 15) {
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

  const isGeneralInputLikeFocused = activeElement && (
    activeElement.tagName === 'INPUT' ||
    activeElement.tagName === 'TEXTAREA' ||
    activeElement.tagName === 'SELECT' ||
    activeElement.tagName === 'BUTTON' ||
    activeElement.isContentEditable
  );

  if (event.key === 'Escape' || event.code === 'Escape') {
    if (activeSelectionPopup) {
      event.preventDefault();
      const popupEl = document.getElementById('selectionPopup');
      const backdropEl = document.getElementById('selectionPopupBackdrop');
      hidePronunciationPopup(popupEl, backdropEl);
      console.log('Global hotkey: Escape pressed, closing selection popup.');
    } else if (infoModal && (infoModal.style.display === 'flex' || infoModal.style.display === 'block')) {
        event.preventDefault();
        infoModal.style.display = 'none';
        if (infoButton) infoButton.focus();
        console.log('Global hotkey: Escape pressed, closing info modal.');
    } else if (isGeneralInputLikeFocused && activeElement && activeElement.tagName !== 'BODY') {
      if (activeElement) {
        activeElement.blur();
        event.preventDefault();
        console.log('Global hotkey: Escape pressed, blurred active element:', activeElement);
      }
    } else if (isPlaying) {
      const stopButton = document.getElementById('stopBtn');
      if (stopButton) {
        stopButton.click();
        console.log('Global hotkey: Escape pressed (no interactive focus/popup closed), stopping playback.');
      }
    }
    return;
  }

  if (!activeSelectionPopup && (event.key === ' ' || event.code === 'Space')) {
    if (!isGeneralInputLikeFocused) {
      if (isPlaying) {
        event.preventDefault();
        const pauseResumeButton = document.getElementById('pauseResumeBtn');
        if (pauseResumeButton) {
          pauseResumeButton.click();
          console.log('Global hotkey: Spacebar pressed (isPlaying), toggling pause/resume.');
        }
      } else {
        const progressDropdown = document.getElementById('progressDropdown');
        if (progressDropdown && progressDropdown.options.length > 1) {
          event.preventDefault();
          const selectedValue = progressDropdown.options[1].value;
          const bookmarks = JSON.parse(localStorage.getItem('hakkaBookmarks')) || [];
          const firstBookmark = bookmarks.find(bm => bm.tableName + '||' + bm.cat === selectedValue);

          if (firstBookmark) {
            const targetTableName = firstBookmark.tableName;
            const targetCategory = firstBookmark.cat;
            const targetRowIdToGo = firstBookmark.rowId;
            const dataVarName = mapTableNameToDataVar(targetTableName);

            if (dataVarName) {
              let dataObject = window[dataVarName];
              if (typeof dataObject !== 'undefined') {
                console.log('Global hotkey: Spacebar pressed (!isPlaying), loading first bookmark:', firstBookmark);

                document.querySelectorAll('span[data-varname]').forEach(span => {
                span.classList.remove('active-dialect-level');
              });
              const activeDialectSpan = document.querySelector(`.dialect > span[data-varname="${dataVarName}"]`);
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
    request.onerror = (event) => reject('IndexedDB error: ' + event.target.error);
  });
}

function dbGet(db, storeName, key) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = (event) => reject('Error getting data from DB: ' + event.target.error);
  });
}

function dbPut(db, storeName, value, key) {
  return new Promise((resolve, reject) => {
    if (value === undefined) {
      return reject(new DOMException(`Attempted to store an undefined value with key "${key}"`, 'DataError'));
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
    transaction.onerror = (event) => reject('Transaction error in dbClear: ' + event.target.error);
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
            console.warn(`getKeyNameFromPath: 無法解析認證檔名: ${fileName}。將使用完整檔名作為鍵名。`);
            return fileName;
        }
    }
    if (filePath.includes('/gip/')) {
        // 教典資料檔：將檔名 (例如 '20250630-四') 轉換為 '教典四'
        const gipMap = {
            '四': '教典四', '南': '教典南', '海': '教典海',
            '大': '教典大', '平': '教典平', '安': '教典安'
        };
        const gipKey = fileName.split('-')[1];
        return gipMap[gipKey];
    }

    // 3. 處理其餘的特殊檔案
    const otherMap = {
        'tone_mapping': 'toneMappingData',
        'NAmedias': 'missingAudioData',
        'exclusions': '例外音檔'
    };
    return otherMap[fileName];
}

// --- Data Loading Logic (Refactored) ---

async function fetchAndCacheDataInDB(db, newVersion) {
    const loadingText = document.getElementById('loading-text');
    loadingText.textContent = '正在下載並處理最新資料...';
    const CHUNK_SIZE = 500;

    try {
        await dbClear(db, STORE_FILES);
        console.log('舊快取資料已清除。');

        // 步驟 1: 平行 fetch 所有 JSON 檔並直接解析
        const jsonDataArray = await Promise.all(
            DATA_FILES_TO_CACHE.map(filePath =>
                fetch(`${filePath}?cachebust=${new Date().getTime()}`)
                    .then(res => {
                        if (!res.ok) throw new Error(`無法取得 ${filePath}`);
                        return res.json(); // 直接解析為 JSON 物件
                    })
                    .catch(err => {
                        console.error(err);
                        return null; // 若失敗則返回 null
                    })
            )
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
            const progress = Math.round(((index + 1) / DATA_FILES_TO_CACHE.length) * 100);
            loadingText.textContent = `正在處理最新資料... (${progress}%)`;
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
    loadingText.textContent = '正在從快取載入資料...';
    
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
                        content: reassembledData
                    };
                    console.log(`已成功從 ${metadata.chunkCount} 個區塊重組資料並建立物件: ${keyName}`);
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
        loadingText.textContent = '從快取載入資料失敗，請重新整理頁面。';
        throw error;
    }
}


// --- Application Initialization ---

async function initializeApp() {
    const loadingIndicator = document.getElementById('loading-indicator');
    const loadingText = document.getElementById('loading-text');
    const mainContent = document.getElementById('main-content');

    if (!window.indexedDB) {
        loadingText.textContent = '您的瀏覽器版本過舊，不支援此應用程式所需的快取技術。請更新您的瀏覽器。';
        return;
    }

    try {
        // [新增] 強制重新快取邏輯
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('force-refresh')) {
            console.warn('偵測到 ?force-refresh 參數，正在強制清除 IndexedDB...');
            loadingText.textContent = '正在強制清除快取...';
            
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
        const serverVersionResponse = await fetch('data/data_version.json?cachebust=' + new Date().getTime());

        // --- 新增的錯誤處理 START ---
        if (!serverVersionResponse.ok) {
            loadingText.textContent = '錯誤：無法取得版本控制檔 (data/data_version.json)，請檢查檔案是否存在且路徑正確。';
            throw new Error('Failed to fetch server version file. Status: ' + serverVersionResponse.status);
        }

        const serverVersionData = await serverVersionResponse.json();
        const serverVersion = serverVersionData.version;

        // 檢查版本號本身是否有效
        if (!serverVersion) {
            loadingText.textContent = '錯誤：版本控制檔 (data/data_version.json) 內容格式不正確，缺少 "version" 欄位。';
            throw new Error('Invalid version data in data_version.json.');
        }
        // --- 新增的錯誤處理 END ---

        const db = await openDB();
        const localVersion = await dbGet(db, STORE_VERSION, 'currentVersion');

        if (localVersion !== serverVersion) {
            console.log(`Version mismatch. Local: ${localVersion}, Server: ${serverVersion}. Fetching new data.`);
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
  console.log("Initializing UI...");

  let successfullyLoadedFromUrl = false;

  const resultsSummaryContainer = document.getElementById('results-summary');
  const searchContainer = document.getElementById('search-container');
  const searchInput = document.getElementById('search-input');
  const searchPopup = document.getElementById('search-popup');
  const searchDialectRadios = document.querySelectorAll('#search-popup input[name="dialect"]');
  const searchModeRadios = document.querySelectorAll('#search-popup input[name="search-mode"]');
  const progressDropdown = document.getElementById('progressDropdown');
  const progressDetailsSpan = document.getElementById('progressDetails');
  const contentContainer = document.getElementById('generated');
  const header = document.getElementById('header');
  const backToTopButton = document.getElementById('backToTopBtn');
  const autoplayModal = document.getElementById('autoplayModal');
  const modalContent = autoplayModal ? autoplayModal.querySelector('.modal-content') : null;
  const dialectLevelLinks = document.querySelectorAll('.dialect a');
  const selectionPopup = document.getElementById('selectionPopup');
  const selectionPopupBackdrop = document.getElementById('selectionPopupBackdrop');
  const selectionPopupContent = document.getElementById('selectionPopupContent');
  const selectionPopupCloseBtn = document.getElementById('selectionPopupCloseBtn');
  const infoButton = document.getElementById('infoButton');
  const infoModal = document.getElementById('infoModal');
  const infoModalCloseBtn = document.getElementById('infoModalCloseBtn');

  // All data variables from the included JS files
  const allData = {
    '四縣': [window['四基'], window['四初'], window['四中'], window['四中高'], window['四高']],
    '南四縣': [window['四基'], window['四初'], window['四中'], window['四中高'], window['四高']],
    '海陸': [window['海基'], window['海初'], window['海中'], window['海中高'], window['海高']],
    '大埔': [window['大基'], window['大初'], window['大中'], window['大中高'], window['大高']],
    '饒平': [window['平基'], window['平初'], window['平中'], window['平中高'], window['平高']],
    '詔安': [window['安基'], window['安初'], window['安中'], window['安中高'], window['安高']]
  };

  // --- 新增：教典資料 ---
  const gipData = {
    '四縣': window['教典四'],
    '海陸': window['教典海'],
    '大埔': window['教典大'],
    '饒平': window['教典平'],
    '詔安': window['教典安'],
    '南四縣': window['教典南']
  };

  function updateProgressDropdown() {
    const progressDropdown = document.getElementById('progressDropdown');
    const progressDetailsSpan = document.getElementById('progressDetails');

    if (!progressDropdown) return;

    const previousValue = progressDropdown.value;

    const bookmarks = JSON.parse(localStorage.getItem('hakkaBookmarks')) || [];

    progressDropdown.innerHTML = '<option selected disabled>擇進前个進度</option>';
    if (bookmarks.length === 0 && progressDetailsSpan) {
      progressDetailsSpan.textContent = '';
    }

    bookmarks.forEach((bookmark, index) => {
      const option = document.createElement('option');
      option.textContent = `${bookmark.tableName} - ${
        bookmark.cat
      } - #${bookmark.rowId} (${bookmark.percentage}%)`;
      option.value = bookmark.tableName + '||' + bookmark.cat;
      progressDropdown.appendChild(option);
    });

    if (previousValue && previousValue !== '擇進前个進度') {
      const newOptionToSelect = progressDropdown.querySelector(
        `option[value="${previousValue}"]`
      );
      if (newOptionToSelect) {
        newOptionToSelect.selected = true;
        const selectedBookmark = bookmarks.find(
          (bm) => bm.tableName + '||' + bm.cat === previousValue
        );
        if (selectedBookmark && progressDetailsSpan) {
          progressDetailsSpan.textContent = `#${selectedBookmark.rowId} (${selectedBookmark.percentage}%)`;
        }
      } else {
        progressDropdown.selectedIndex = 0;
      }
    } else {
      progressDropdown.selectedIndex = 0;
    }
    setTimeout(adjustHeaderFontSizeOnOverflow, 0);
  }

  function saveBookmark(
    rowId,
    percentage,
    category,
    tableName,
    isPlayingContext = false
  ) {
    let bookmarks = JSON.parse(localStorage.getItem('hakkaBookmarks')) || [];
    const newBookmark = {
      rowId: rowId,
      percentage: percentage,
      cat: category,
      tableName: tableName,
      timestamp: Date.now(),
    };

    // 1. 移除已存在的完全相同的紀錄 (同表格同類別)
    const existingIndex = bookmarks.findIndex(
      (bm) => bm.tableName === newBookmark.tableName && bm.cat === newBookmark.cat
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

    // 5. 更新下拉選單 UI
    updateProgressDropdown();

    // 6. 更新進度詳情連結 (採用新版清晰的邏輯)
    const progressDetailsSpan = document.getElementById('progressDetails');
    if (progressDetailsSpan) {
        let baseURL = '';
        if (window.location.protocol === 'file:') {
            baseURL = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);
        } else {
            let path = window.location.pathname;
            baseURL = window.location.origin + path.substring(0, path.lastIndexOf('/') + 1);
            if (!baseURL.endsWith('/')) {
                baseURL += '/';
            }
        }

        const dialectLevelCodes = extractDialectLevelCodes(tableName);
        if (dialectLevelCodes) {
            const shareURL = `${baseURL}index.html?dialect=${dialectLevelCodes.dialect}&level=${dialectLevelCodes.level}&category=${category}&row=${rowId}`;
            const linkElement = document.createElement('a');
            linkElement.href = shareURL;
            linkElement.textContent = `#${rowId} (${percentage}%)`;
            linkElement.style.marginLeft = '5px';
            progressDetailsSpan.innerHTML = '';
            progressDetailsSpan.appendChild(linkElement);
        } else {
            progressDetailsSpan.textContent = `#${rowId} (${percentage}%)`;
            console.error('Could not generate share link for bookmark; tableName invalid:', tableName);
        }
    }
  }

  function mapTableNameToDataVar(tableName) {
    if (!tableName) return null;
    let simplified = tableName.replace('級', '');
    const mapping = {
      '四縣基礎': '四基',
      '四縣初': '四初',
      '四縣中': '四中',
      '四縣中高': '四中高',
      '四縣高': '四高',
      '海陸基礎': '海基',
      '海陸初': '海初',
      '海陸中': '海中',
      '海陸中高': '海中高',
      '海陸高': '海高',
      '大埔基礎': '大基',
      '大埔初': '大初',
      '大埔中': '大中',
      '大埔中高': '大中高',
      '大埔高': '大高',
      '饒平基礎': '平基',
      '饒平初': '平初',
      '饒平中': '平中',
      '饒平中高': '平中高',
      '饒平高': '平高',
      '詔安基礎': '安基',
      '詔安初': '安初',
      '詔安中': '安中',
      '詔安中高': '安中高',
      '詔安高': '安高',
    };
    return mapping[simplified] || null;
  }

  function getFullLevelName(varName) {
    if (!varName) return '未知級別';
    if (varName.startsWith('教典')) {
        const gipNameMap = {
            '教典四': '四縣教典', '教典海': '海陸教典', '教典大': '大埔教典',
            '教典平': '饒平教典', '教典安': '詔安教典', '教典南': '南四縣教典'
        };
        return gipNameMap[varName] || varName;
    }
    const 腔調 = varName.substring(0, 1);
    const 級別 = varName.substring(1);
    let full腔調 = '';
    let full級別 = '';
    switch (腔調) {
      case '四': full腔調 = '四縣'; break;
      case '海': full腔調 = '海陸'; break;
      case '大': full腔調 = '大埔'; break;
      case '平': full腔調 = '饒平'; break;
      case '安': full腔調 = '詔安'; break;
      default: full腔調 = '未知';
    }
    switch (級別) {
      case '基': full級別 = '基礎級'; break;
      case '初': full級別 = '初級'; break;
      case '中': full級別 = '中級'; break;
      case '中高': full級別 = '中高級'; break;
      case '高': full級別 = '高級'; break;
      default: full級別 = '級別';
    }
    return full腔調 + full級別;
  }


  function performSearch(page = 1, itemsPerPage = 50) {
    const selectedDialect = document.querySelector('#search-popup input[name="dialect"]:checked').value;
    let searchMode = document.querySelector('#search-popup input[name="search-mode"]:checked').value;
    const keyword = searchInput.value.trim();

    if (keyword.length > 0 && isRomanizedHakka(keyword)) {
        searchMode = '客家語';
        const hakkaModeRadio = document.querySelector('input[name="search-mode"][value="客家語"]');
        if (hakkaModeRadio) {
            hakkaModeRadio.checked = true;
        }
    }

    if (!keyword) {
        if (resultsSummaryContainer) resultsSummaryContainer.textContent = '';
        contentContainer.innerHTML = '<p style="text-align: center;">請輸入關鍵字</p>';
        updatePageTitle();
        updateResultsSummaryVisibility();
        return;
    }

    searchContainer.classList.remove('active');
    searchInput.blur();

    const learningPanel = document.getElementById('learningSelectionPanel');
    if (learningPanel) {
        learningPanel.open = false;
    }

    currentActiveMainDialectName = selectedDialect;
    currentActiveDialectLevelFullName = '';

    const dialectCertData = allData[selectedDialect] || [];
    let combinedData = [];

    dialectCertData.forEach(level => {
        if (level && level.content && Array.isArray(level.content)) {
            const levelData = level.content;
            levelData.forEach(item => {
                item.sourceName = level.name;
                item.sourceType = 'cert';
            });
            combinedData = combinedData.concat(levelData);
        }
    });

    const gipDialectData = gipData[selectedDialect];
    if (gipDialectData && gipDialectData.content && Array.isArray(gipDialectData.content)) {
        const gipParsedData = gipDialectData.content;
        gipParsedData.forEach(item => {
            item.sourceName = gipDialectData.name;
            item.sourceType = 'gip';
        });
        combinedData = combinedData.concat(gipParsedData);
    }


    let results;
    if (searchMode === '客家語') {
        const lowerCaseKeyword = keyword.toLowerCase();
        const precisePhoneticRegex = /^([a-z]+[0-9]+(\s+|$))+$/i;

        if (precisePhoneticRegex.test(lowerCaseKeyword)) {
            results = combinedData.filter(item =>
                item['客語標音_查詢'] && item['客語標音_查詢'].toLowerCase().includes(lowerCaseKeyword)
            ).map(item => ({ ...item, _match: { inPhonetics: true, isExact: true } }));
        } else {
            const normalizedKeyword = normalizePhonetics(lowerCaseKeyword);
            results = combinedData.map(item => {
                const inWord = item['客家語'] && item['客家語'].toLowerCase().includes(lowerCaseKeyword);
                const normalizedPhonetics = normalizePhonetics(item['客語標音_查詢'] || '');
                const inPhonetics = normalizedPhonetics.includes(normalizedKeyword);
                const inSentence = item['例句'] && item['例句'].toLowerCase().includes(lowerCaseKeyword);

                if (inWord || inPhonetics || inSentence) {
                    return { ...item, _match: { inWord, inPhonetics, inSentence, isExact: false } };
                }
                return null;
            }).filter(Boolean);
        }
    } else { // 華語
        const lowerCaseKeyword = keyword.toLowerCase();
        results = combinedData.map(item => {
            const inMeaning = item && item['華語詞義'] && item['華語詞義'].toLowerCase().includes(lowerCaseKeyword);
            const inTranslation = item && item['翻譯'] && item['翻譯'].toLowerCase().includes(lowerCaseKeyword);
            if (inMeaning || inTranslation) {
                return { ...item, _match: { inMeaning, inTranslation } };
            }
            return null;
        }).filter(Boolean);
    }

    const getCategoryRank = (item, mode) => {
        if (mode === '客家語') {
            const { inWord, inSentence, inPhonetics } = item._match;
            if ((inWord || inPhonetics) && inSentence) return 1;
            if (inWord || inPhonetics) return 2;
            if (inSentence) return 3;
        } else { // 華語
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

    let summaryText = `在${searchMode === '客家語' ? '客文' : '華文'}部分尋「${keyword}」，`;

    const newUrl = new URL(window.location);
    newUrl.searchParams.set('musiid', searchMode === '客家語' ? 'hak' : 'zh');
    newUrl.searchParams.set('ca', keyword);
    newUrl.searchParams.set('bidsu', itemsPerPage.toString());
    newUrl.searchParams.set('iab', page.toString());
    newUrl.searchParams.set('kiong', DIALECT_NAME_TO_CODE[selectedDialect]);
    history.pushState({}, '', newUrl);

    displayQueryResults(results, keyword, searchMode, summaryText, selectedDialect, page, itemsPerPage);
}

function displayQueryResults(results, keyword, searchMode, summaryText, selectedDialect, page = 1, itemsPerPage = 50) {
    let globalRowIndex = (page - 1) * itemsPerPage;
    const contentContainer = document.getElementById('generated');
    const resultsSummaryContainer = document.getElementById('results-summary');
    contentContainer.innerHTML = '';
    document.querySelector('#audioControls')?.remove();

    const totalResults = results.length;
    const totalPages = Math.ceil(totalResults / itemsPerPage);
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedResults = results.slice(startIndex, endIndex);

    const searchModeText = searchMode === '客家語' ? '客文' : '華文';
    updatePageTitle([`${selectedDialect}尋「${keyword}」（${searchModeText}）`]);

    if (totalResults === 0) {
        resultsSummaryContainer.textContent = summaryText + `尋著 0 筆結果（${selectedDialect}）`;
        updateResultsSummaryVisibility();
        return;
    }

    resultsSummaryContainer.textContent = summaryText + `尋著 ${totalResults} 筆結果（${selectedDialect}）`;

    const highlightRegex = new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig');

    const createResultRow = (line, highlight) => {
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
            const noText = document.createTextNode(line.編號 + '\u00A0');
            td1.appendChild(noText);
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
        ruby.innerHTML = highlight.word ? line['客家語'].replace(highlightRegex, '<mark>$1</mark>') : line['客家語'];
        const rt = document.createElement('rt');
        rt.textContent = formatPhoneticForDisplay(line['客語標音_顯示']);
        ruby.appendChild(rt);
        td2.appendChild(ruby);
        td2.appendChild(document.createElement('br'));

        let audioSrc = null;
        if (line.sourceType === 'gip' && line['詞目音檔名']) {
            audioSrc = "https://hakkadict.moe.edu.tw/static/audio/" + (line['詞目音檔名'].endsWith('.mp3') ? line['詞目音檔名'] : line['詞目音檔名'] + '.mp3');
        } else if (line.sourceType === 'cert') {
            const sourceName = line.sourceName;
            let 腔 = sourceName.substring(0, 1);
            let 級 = sourceName.substring(1);
            let selected例外音檔;
            switch (級) {
                case '基': selected例外音檔 = window.基例外音檔 || []; break;
                case '初': selected例外音檔 = window.初例外音檔 || []; break;
                case '中': selected例外音檔 = window.中例外音檔 || []; break;
                case '中高': selected例外音檔 = window.中高例外音檔 || []; break;
                case '高': selected例外音檔 = window.高例外音檔 || []; break;
                default: selected例外音檔 = [];
            }
            const 例外音檔 = selected例外音檔;
            var 目錄級, 目錄另級, 檔腔, 檔級 = '';
            switch (腔) { case '四': 檔腔 = 'si'; break; case '海': 檔腔 = 'ha'; break; case '大': 檔腔 = 'da'; break; case '平': 檔腔 = 'rh'; break; case '安': 檔腔 = 'zh'; break; }
            switch (級) { case '基': 目錄級 = '5'; 目錄另級 = '1'; break; case '初': 目錄級 = '1'; break; case '中': 目錄級 = '2'; 檔級 = '1'; break; case '中高': 目錄級 = '3'; 檔級 = '2'; break; case '高': 目錄級 = '4'; 檔級 = '3'; break; }
            const missingAudioInfo = typeof getMissingAudioInfo === 'function' ? getMissingAudioInfo(fullSourceName, line.分類, line.編號) : null;
            let mediaYr = '112', pre112Insertion詞 = '', 詞目錄級 = 目錄級, mediaNo = '';
            var no = line.編號.split('-');
            if (no[0] <= 9) no[0] = '0' + no[0]; if (級 === '初') no[0] = '0' + no[0]; if (no[1] <= 9) no[1] = '0' + no[1]; if (no[1] <= 99) no[1] = '0' + no[1]; mediaNo = no[1];
            const index = 例外音檔.findIndex(([編號]) => 編號 === line.編號);
            if (index !== -1) {
                const matchedElement = 例外音檔[index];
                mediaYr = matchedElement[1]; mediaNo = matchedElement[2]; pre112Insertion詞 = 'w/';
                if (目錄另級 !== undefined) { 詞目錄級 = 目錄另級; }
            }
            const 詞目錄 = `${詞目錄級}/${檔腔}/${pre112Insertion詞}${檔級}${檔腔}`;
            let wordAudioActuallyMissing = missingAudioInfo && missingAudioInfo.word === false;
            if (!wordAudioActuallyMissing) {
                audioSrc = `https://elearning.hakka.gov.tw/hakka/files/cert/vocabulary/${mediaYr}/${詞目錄}-${no[0]}-${mediaNo}.mp3`;
                if (fullSourceName === '海陸中高級' && line.編號 === '4-261') {
                    audioSrc = 'https://elearning.hakka.gov.tw/hakka/files/dictionaries/3/hk0000014571/hk0000014571-1-2.mp3';
                }
            }
        }

        if (audioSrc) {
            const audio = document.createElement('audio');
            audio.className = 'media';
            audio.controls = true;
            audio.preload = 'none';
            audio.src = audioSrc;
            td2.appendChild(audio);
        }

        if (line.sourceType !== 'gip' || (line.sourceType === 'gip' && line['詞目音檔名'])) {
            td2.appendChild(document.createElement('br'));
        }
        const meaningText = document.createElement('span');
        const processedMeaning = line['華語詞義'].replace(/"/g, '').replace(/\n/g, '<br>');
        meaningText.innerHTML = highlight.meaning ? processedMeaning.replace(highlightRegex, '<mark>$1</mark>') : processedMeaning;
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
            sentenceSpan.innerHTML = (highlight.sentence ? line['例句'].replace(highlightRegex, '<mark>$1</mark>') : line['例句']).replace(/\n/g, '<br>');
            td3.appendChild(sentenceSpan);
            td3.appendChild(document.createElement('br'));

            if (line.sourceType === 'cert') {
                const sourceName = line.sourceName;
                let 腔 = sourceName.substring(0, 1); let 級 = sourceName.substring(1);
                let selected例外音檔;
                switch (級) { case '基': selected例外音檔 = window.基例外音檔 || []; break; case '初': selected例外音檔 = window.初例外音檔 || []; break; case '中': selected例外音檔 = window.中例外音檔 || []; break; case '中高': selected例外音檔 = window.中高例外音檔 || []; break; case '高': selected例外音檔 = window.高例外音檔 || []; break; default: selected例外音檔 = []; }
                const 例外音檔 = selected例外音檔;
                var 目錄級, 目錄另級, 檔腔, 檔級 = '';
                switch (腔) { case '四': 檔腔 = 'si'; break; case '海': 檔腔 = 'ha'; break; case '大': 檔腔 = 'da'; break; case '平': 檔腔 = 'rh'; break; case '安': 檔腔 = 'zh'; break; }
                switch (級) { case '基': 目錄級 = '5'; 目錄另級 = '1'; break; case '初': 目錄級 = '1'; break; case '中': 目錄級 = '2'; 檔級 = '1'; break; case '中高': 目錄級 = '3'; 檔級 = '2'; break; case '高': 目錄級 = '4'; 檔級 = '3'; break; }
                const missingAudioInfo = typeof getMissingAudioInfo === 'function' ? getMissingAudioInfo(fullSourceName, line.分類, line.編號) : null;
                let mediaYr = '112', pre112Insertion句 = '', 句目錄級 = 目錄級, mediaNo = '';
                var no = line.編號.split('-');
                if (no[0] <= 9) no[0] = '0' + no[0]; if (級 === '初') no[0] = '0' + no[0]; if (no[1] <= 9) no[1] = '0' + no[1]; if (no[1] <= 99) no[1] = '0' + no[1]; mediaNo = no[1];
                const index = 例外音檔.findIndex(([編號]) => 編號 === line.編號);
                if (index !== -1) {
                    const matchedElement = 例外音檔[index];
                    mediaYr = matchedElement[1]; mediaNo = matchedElement[2]; pre112Insertion句 = 's/';
                    if (目錄另級 !== undefined) { 句目錄級 = 目錄另級; }
                }
                const 句目錄 = `${句目錄級}/${檔腔}/${pre112Insertion句}${檔級}${檔腔}`;
                let sentenceAudioActuallyMissing = (missingAudioInfo && missingAudioInfo.sentence === false) || 級 === '高';
                if (!sentenceAudioActuallyMissing) {
                    const audio2 = document.createElement('audio');
                    audio2.className = 'media'; audio2.controls = true; audio2.preload = 'none';
                    audio2.src = `https://elearning.hakka.gov.tw/hakka/files/cert/vocabulary/${mediaYr}/${句目錄}-${no[0]}-${mediaNo}s.mp3`;
                    td3.appendChild(audio2);
                }
            }

            td3.appendChild(document.createElement('br'));
            const translationText = document.createElement('span');
            translationText.innerHTML = (highlight.translation ? line['翻譯'].replace(highlightRegex, '<mark>$1</mark>') : line['翻譯']).replace(/"/g, '').replace(/\n/g, '<br>');
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
        '客家語': {
            'both': { title: '詞、句裡肚都有：', highlight: { word: true, sentence: true, meaning: false, translation: false } },
            'word_only': { title: '淨詞彙裡肚有：', highlight: { word: true, sentence: false, meaning: false, translation: false } },
            'sentence_only': { title: '僅例句裡肚有：', highlight: { word: false, sentence: true, meaning: false, translation: false } }
        },
        '華語': {
            'both': { title: '華語詞義、翻譯裡肚都有出現：', highlight: { word: false, sentence: false, meaning: true, translation: true } },
            'meaning_only': { title: '淨出現在華語詞義裡肚：', highlight: { word: false, sentence: false, meaning: true, translation: false } },
            'translation_only': { title: '淨出現在例句翻譯裡肚：', highlight: { word: false, sentence: false, meaning: false, translation: true } }
        }
    };

    const getCategoryKey = (item, mode) => {
        if (mode === '客家語') {
            const { inWord, inSentence, inPhonetics } = item._match;
            if ((inWord || inPhonetics) && inSentence) return 'both';
            if (inWord || inPhonetics) return 'word_only';
            if (inSentence) return 'sentence_only';
        } else { // 華語
            const { inMeaning, inTranslation } = item._match;
            if (inMeaning && inTranslation) return 'both';
            if (inMeaning) return 'meaning_only';
            if (inTranslation) return 'translation_only';
        }
        return null;
    };

    paginatedResults.forEach(line => {
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
        const row = createResultRow(line, config.highlight);
        if (row && currentTable) {
            currentTable.appendChild(row);
        }
    });

    if (document.querySelector('#search-popup input[name="dialect"]:checked').value === '大埔') {
        if (typeof 大埔高降異化 === 'function') 大埔高降異化();
        if (typeof 大埔中遇低升 === 'function') 大埔中遇低升();
        if (typeof 大埔低升異化 === 'function') 大埔低升異化();
    }

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
                 const firstResultElement = document.querySelector('#generated > h4, #generated > table');
                 if (firstResultElement) {
                   firstResultElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                 }
               }, 100);
           });
            paginationContainer.appendChild(pageButton);
        }
        contentContainer.appendChild(paginationContainer);
    }

    updateResultsSummaryVisibility();

    setTimeout(() => handleResizeActions(), 0); // Trigger font size adjustment after table is rendered

    setTimeout(() => {
      const firstResultElement = contentContainer.querySelector('h4, table');
      if (firstResultElement) {
        firstResultElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
}

  function 大埔高降異化() {
    const rtElements = document.querySelectorAll('#generated rt');
    rtElements.forEach((rt) => {
      let htmlContent = rt.innerHTML;
      const sandhiRubyRegex = /<ruby class="sandhi-(?:高降變|中平變|低升變)"[^>]*>.*?<\/ruby>/g;
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
      const tokens = preliminaryTokens.flatMap(token => {
        if (token.startsWith("<ruby class=\"sandhi-")) {
          return [token];
        }
        return token.match(/[^<>\s、]+|[\s、]+/g) || [];
      }).filter(t => t && t.length > 0);
      let modifiedTokens = [];
      let hasActualModification = false;
      for (let i = 0; i < tokens.length; i++) {
        let currentToken = tokens[i];
        if (currentToken.startsWith("<ruby class=\"sandhi-") || currentToken.match(/^[\s、]+$/)) {
          modifiedTokens.push(currentToken);
        } else {
          let nextWordToken = "";
          for (let j = i + 1; j < tokens.length; j++) {
            if (tokens[j].startsWith("<ruby class=\"sandhi-") || tokens[j].match(/^[\s、]+$/)) {
              continue;
            }
            if (tokens[j] === '(' || tokens[j] === '（') {
              nextWordToken = "";
              break;
            }
            nextWordToken = tokens[j];
            break;
          }
          if (currentToken.length > 0 && currentToken.match(/[àèìòù](?![bdg])/)) {
            if (nextWordToken && nextWordToken.match(/[\u00E0\u00E8\u00EC\u00F2\u00F9\u00E2\u00EA\u00EE\u00F4\u00FB]/)) {
              if (currentToken.includes(')') || currentToken.includes('）') || nextWordToken.includes('(') || nextWordToken.includes('（')) {
                modifiedTokens.push(currentToken);
              } else {
                let rubyElement = document.createElement('ruby');
                rubyElement.className = 'sandhi-高降變';
                rubyElement.textContent = currentToken;
                let rtInnerElement = document.createElement('rt');
                rtInnerElement.textContent = '55';
                rubyElement.appendChild(rtInnerElement);
                modifiedTokens.push(rubyElement.outerHTML);
                hasActualModification = true;
              }
            } else {
              modifiedTokens.push(currentToken);
            }
          }
          else {
            modifiedTokens.push(currentToken);
          }
        }
      }
      if (hasActualModification) {
        rt.innerHTML = modifiedTokens.join('');
      }
    });
  }

  function 大埔中遇低升() {
    const rtElements = document.querySelectorAll('#generated rt');
    rtElements.forEach((rt) => {
      let htmlContent = rt.innerHTML;
      const sandhiRubyRegex = /<ruby class="sandhi-(?:高降變|中平變|低升變)"[^>]*>.*?<\/ruby>/g;
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
      const tokens = preliminaryTokens.flatMap(token => {
        if (token.startsWith("<ruby class=\"sandhi-")) {
          return [token];
        }
        return token.match(/[^<>\s、]+|[\s、]+/g) || [];
      }).filter(t => t && t.length > 0);
      let modifiedTokens = [];
      let hasActualModification = false;
      for (let i = 0; i < tokens.length; i++) {
        let currentToken = tokens[i];
        if (currentToken.startsWith("<ruby class=\"sandhi-") || currentToken.match(/^[\s、]+$/)) {
          modifiedTokens.push(currentToken);
        }
        else {
          let nextWordToken = "";
          for (let j = i + 1; j < tokens.length; j++) {
            if (tokens[j].startsWith("<ruby class=\"sandhi-") || tokens[j].match(/^[\s、]+$/)) {
              continue;
            }
            if (tokens[j] === '(' || tokens[j] === '（') {
              nextWordToken = "";
              break;
            }
            nextWordToken = tokens[j];
            break;
          }
          if (currentToken.length > 0 && currentToken.match(/[\u0101\u0113\u012B\u014D\u016B]/)) {
            if (nextWordToken && nextWordToken.match(/[\u01CE\u011B\u01D0\u01D2\u01D4\u00E2\u00EA\u00EE\u00F4\u00FB]/)) {
              if (currentToken.includes(')') || currentToken.includes('）') || nextWordToken.includes('(') || nextWordToken.includes('（')) {
                modifiedTokens.push(currentToken);
              } else {
                let rubyElement = document.createElement('ruby');
                rubyElement.className = 'sandhi-中平變';
                rubyElement.textContent = currentToken;
                let rtInnerElement = document.createElement('rt');
                rtInnerElement.textContent = '35';
                rubyElement.appendChild(rtInnerElement);
                modifiedTokens.push(rubyElement.outerHTML);
                hasActualModification = true;
              }
            } else {
              modifiedTokens.push(currentToken);
            }
          }
          else {
            modifiedTokens.push(currentToken);
          }
        }
      }
      if (hasActualModification) {
        rt.innerHTML = modifiedTokens.join('');
      }
    });
  }

  function 大埔低升異化() {
    const rtElements = document.querySelectorAll('#generated rt');
    rtElements.forEach((rt) => {
      let htmlContent = rt.innerHTML;
      const sandhiRubyRegex = /<ruby class="sandhi-(?:高降變|中平變|低升變)"[^>]*>.*?<\/ruby>/g;
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
      const tokens = preliminaryTokens.flatMap(token => {
        if (token.startsWith("<ruby class=\"sandhi-")) {
          return [token];
        }
        return token.match(/[^<>\s、]+|[\s、]+/g) || [];
      }).filter(t => t && t.length > 0);
      let modifiedTokens = [];
      let hasActualModification = false;
      for (let i = 0; i < tokens.length; i++) {
        let currentToken = tokens[i];
        if (currentToken.startsWith("<ruby class=\"sandhi-") || currentToken.match(/^[\s、]+$/)) {
          modifiedTokens.push(currentToken);
        }
        else {
          let nextWordToken = "";
          for (let j = i + 1; j < tokens.length; j++) {
            if (tokens[j].startsWith("<ruby class=\"sandhi-") || tokens[j].match(/^[\s、]+$/)) {
              continue;
            }
            if (tokens[j] === '(' || tokens[j] === '（') {
              nextWordToken = "";
              break;
            }
            nextWordToken = tokens[j];
            break;
          }
          if (currentToken.length > 0 && currentToken.match(/[\u01CE\u011B\u01D0\u01D2\u01D4]/)) {
            if (nextWordToken && nextWordToken.match(/[\u01CE\u011B\u01D0\u01D2\u01D4]/)) {
              if (currentToken.includes(')') || currentToken.includes('）') || nextWordToken.includes('(') || nextWordToken.includes('（')) {
                modifiedTokens.push(currentToken);
              } else {
                let rubyElement = document.createElement('ruby');
                rubyElement.className = 'sandhi-低升變';
                rubyElement.textContent = currentToken;
                let rtElement = document.createElement('rt');
                rtElement.textContent = '33';
                rubyElement.appendChild(rtElement);
                modifiedTokens.push(rubyElement.outerHTML);
                hasActualModification = true;
              }
            } else {
              modifiedTokens.push(currentToken);
            }
          }
          else {
            modifiedTokens.push(currentToken);
          }
        }
      }
      if (hasActualModification) {
        rt.innerHTML = modifiedTokens.join('');
      }
    });
  }

  function adjustHeaderFontSizeOnOverflow() {
    const header = document.getElementById('header');
    if (!header) return;

    header.style.fontSize = '1em';

    const isOverflown = ({ clientWidth, scrollWidth }) => scrollWidth > clientWidth;

    if (isOverflown(header)) {
      header.style.fontSize = '0.8em';
    }
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

  function adjustAllRubyFontSizes(containerElement) {
    if (!isFirefox()) return;
    const rubyElements = containerElement.querySelectorAll('td[data-label="詞彙"] ruby');
    rubyElements.forEach((rubyElement) => {
      rubyElement.style.fontSize = '';
      adjustRubyFontSize(rubyElement);
    });
  }

  function handleResizeActions() {
    const contentContainer = document.getElementById('generated');
    if (contentContainer) {
        adjustAllRubyFontSizes(contentContainer);
    }

    const rubies = document.querySelectorAll('ruby');
    rubies.forEach(ruby => {
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

    if (activeSelectionPopup) {
      const popupEl = document.getElementById('selectionPopup');
      if (popupEl && popupEl.style.display === 'block') {
        let rectToUse = null;
        if (lastAnchorElementForPopup && document.body.contains(lastAnchorElementForPopup)) {
          rectToUse = lastAnchorElementForPopup.getBoundingClientRect();
        } else if (lastRectForPopupPositioning) {
          rectToUse = lastRectForPopupPositioning;
        }

        if (rectToUse) {
          requestAnimationFrame(() => {
            setTimeout(() => {
              if (lastAnchorElementForPopup && !document.body.contains(lastAnchorElementForPopup)) {
                return;
              }
              let currentRect = rectToUse;
              if (lastAnchorElementForPopup && document.body.contains(lastAnchorElementForPopup)) {
                   currentRect = lastAnchorElementForPopup.getBoundingClientRect();
              }
              updatePopupPosition(popupEl, currentRect);
            }, 100);
          });
        }
      }
    }
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
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }

  function isSourceMatchingDialect(source, dialect) {
    if (!source || !dialect) return false;
    if (dialect === '南四縣') {
      return source.startsWith('南四縣') || (source.startsWith('四縣') && !source.endsWith('教典'));
    }
    return source.startsWith(dialect);
  }

  const debouncedMobileSelectionHandler = debounce(function() {
    const selection = window.getSelection();
    const contentContainer = document.getElementById('generated');
    if (selection && selection.rangeCount > 0 && selection.toString().trim().length > 0) {
      const range = selection.getRangeAt(0);
      const selectedText = selection.toString().trim();
      const commonAncestorContainer = range.commonAncestorContainer;
      let sentenceSpan = null;
      if (commonAncestorContainer.nodeType === Node.ELEMENT_NODE) {
        sentenceSpan = commonAncestorContainer.closest('span.sentence');
      } else if (commonAncestorContainer.parentNode) {
        sentenceSpan = commonAncestorContainer.parentNode.closest('span.sentence');
      }
      if (sentenceSpan && contentContainer && contentContainer.contains(sentenceSpan) && selectedText.length > 0 && selectedText.length <= 15) {
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
    const isGeneralInputLikeFocused = activeElement && (
      activeElement.tagName === 'INPUT' ||
      activeElement.tagName === 'TEXTAREA' ||
      activeElement.tagName === 'SELECT' ||
      activeElement.tagName === 'BUTTON' ||
      activeElement.isContentEditable
    );

    if (event.key === 'Escape' || event.code === 'Escape') {
      if (activeSelectionPopup) {
        event.preventDefault();
        const popupEl = document.getElementById('selectionPopup');
        const backdropEl = document.getElementById('selectionPopupBackdrop');
        hidePronunciationPopup(popupEl, backdropEl);
      } else if (infoModal && (infoModal.style.display === 'flex' || infoModal.style.display === 'block')) {
          event.preventDefault();
          infoModal.style.display = 'none';
          if (infoButton) infoButton.focus();
      } else if (isGeneralInputLikeFocused && activeElement && activeElement.tagName !== 'BODY') {
        if (activeElement) {
          activeElement.blur();
          event.preventDefault();
        }
      } else if (isPlaying) {
        const stopButton = document.getElementById('stopBtn');
        if (stopButton) {
          stopButton.click();
        }
      }
      return;
    }

    if (!activeSelectionPopup && (event.key === ' ' || event.code === 'Space')) {
      if (!isGeneralInputLikeFocused) {
        if (isPlaying) {
          event.preventDefault();
          const pauseResumeButton = document.getElementById('pauseResumeBtn');
          if (pauseResumeButton) {
            pauseResumeButton.click();
          }
        } else {
          const progressDropdown = document.getElementById('progressDropdown');
          if (progressDropdown && progressDropdown.options.length > 1) {
            event.preventDefault();
            const selectedValue = progressDropdown.options[1].value;
            const bookmarks = JSON.parse(localStorage.getItem('hakkaBookmarks')) || [];
            const firstBookmark = bookmarks.find(bm => bm.tableName + '||' + bm.cat === selectedValue);

            if (firstBookmark) {
              const targetTableName = firstBookmark.tableName;
              const targetCategory = firstBookmark.cat;
              const targetRowIdToGo = firstBookmark.rowId;
              const dataVarName = mapTableNameToDataVar(targetTableName);

              if (dataVarName) {
                let dataObject = window[dataVarName];
                if (typeof dataObject !== 'undefined') {
                  document.querySelectorAll('span[data-varname]').forEach(span => {
                  span.classList.remove('active-dialect-level');
                });
                const activeDialectSpan = document.querySelector(`.dialect > span[data-varname="${dataVarName}"]`);
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
    document.addEventListener('selectionchange', debouncedMobileSelectionHandler);
  } else {
    contentContainer.addEventListener('mouseup', (event) => {
      handleTextSelectionInSentence(event, selectionPopup, selectionPopupContent, selectionPopupBackdrop, contentContainer);
    });
  }

  document.addEventListener('keydown', globalKeydownHandler);

  document.addEventListener('click', (event) => {
    if (event.target.tagName === 'BUTTON' || event.target.closest('button')) {
      const button = event.target.tagName === 'BUTTON' ? event.target : event.target.closest('button');
      setTimeout(() => button.blur(), 300);
    }
  });

  window.addEventListener('resize', debounce(handleResizeActions, 250));

  
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

/**
 * 格式化愛顯示个標音字串，拿忒為著搜尋加个多餘空白。
 * @param {string} text - 從資料庫讀出來个「客語標音_顯示」欄位內容。
 * @returns {string} 格式化後个淨俐字串。
 */
function formatPhoneticForDisplay(text) {
    if (!text) return "";
    // 1. 拿忒全形括號【】（）前後个所有空白
    let result = text.replace(/\s*([【（】）])\s*/g, '$1');
    // 2. 處理半形括號 (：淨拿忒佢「後背」个空白
    result = result.replace(/\(\s+/g, '(');
    // 3. 處理半形括號 )：淨拿忒佢「頭前」个空白
    result = result.replace(/\s+\)/g, ')');
    return result;
}



function preprocessAllData() {
      console.log('開始根據快取資料建立搜尋索引...');
      const startTime = performance.now();
      const allDataSourceVars = [...allKnownDataVars, ...allKnownGipDataVars];
    
      // 清空舊的快取，確保索引是最新的
      preprocessedDataCache = {};
      indexedDataCache = {};
    
      // 步驟 1: 資料已在 loadDataFromDB 中載入到 window，直接從 window 讀取
      allDataSourceVars.forEach(dataVarName => {
        const dataObject = window[dataVarName];
        // Corrected check for the new data structure { name: '...', content: [...] }
        if (dataObject && dataObject.content && Array.isArray(dataObject.content)) {
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
      console.log(`搜尋索引建立完成，耗時：${(endTime - startTime).toFixed(2)} 毫秒。`);
      console.log(`總共索引了 ${Object.keys(indexedDataCache).length} 筆獨特詞彙。`);
    }

// --- 新增：根據 #generated 內容，控制 #results-summary 顯示或隱藏 ---
function updateResultsSummaryVisibility() {
  const resultsSummaryContainer = document.getElementById('results-summary');
  if (!resultsSummaryContainer) return; // 確保元素存在

  // 檢查 #results-summary 自身係無係有實際个內容 (trim() 會拿忒頭尾空白)
  if (resultsSummaryContainer.textContent.trim() !== '') {
    resultsSummaryContainer.style.display = 'flex'; // 有內容就顯示，並啟用 Flexbox 佈局
  } else {
    resultsSummaryContainer.style.display = 'none'; // 無內容就隱藏
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
  '四基', '四初', '四中', '四中高', '四高',
  '海基', '海初', '海中', '海中高', '海高',
  '大基', '大初', '大中', '大中高', '大高',
  '平基', '平初', '平中', '平中高', '平高',
  '安基', '安初', '安中', '安中高', '安高'
];

// --- 新增：所有教典資料變數名稱 ---
const allKnownGipDataVars = ['教典四', '教典海', '教典大', '教典平', '教典安', '教典南'];

// 新增：腔調代碼與腔調名稱的對應
const DIALECT_CODE_TO_NAME = {
  'si': '四縣',
  'na': '南四縣',
  'ha': '海陸',
  'da': '大埔',
  'rh': '饒平',
  'zh': '詔安'
};
const DIALECT_NAME_TO_CODE = {
  '四縣': 'si',
  '南四縣': 'na',
  '海陸': 'ha',
  '大埔': 'da',
  '饒平': 'rh',
  '詔安': 'zh'
};

/**
 * 根據羅馬字拼音个分隔規則，準確計算音節數量。
 * @param {string} romanizationText - 包含羅馬字拼音个字串。
 * @returns {number} - 實際个音節數量。
 */
function countSyllables(romanizationText) {
    if (!romanizationText) return 0;
    // 這隻正規表示式直接對應 romanizer.js 內底个 tokenizeRomanization 函式
    const tokens = romanizationText.match(/[【】（）()\/]|[^【】（）()\/\s]+/g) || [];
    // 過濾掉所有淨係標點符號个 token，淨留下音節
    const syllables = tokens.filter(token => !/^[【】（）()\/]$/.test(token));
    return syllables.length;
}

// --- 新增：當學習模式改變時，同步更新查詞腔調設定 ---
function updateSearchDialect(dialectName) {
  if (!dialectName) return;

  // 1. 更新 localStorage
  localStorage.setItem('lastSearchDialect', dialectName);
  console.log(`學習模式觸發：查詞腔調已更新並儲存到 localStorage: "${dialectName}"`);

  // 2. 更新查詞 popup 裡肚个 radio button
  const radioToSelect = document.querySelector(`#search-popup input[name="dialect"][value="${dialectName}"]`);
  if (radioToSelect) {
    radioToSelect.checked = true;
    console.log(`學習模式觸發：查詞介面个腔調 radio button 已更新為 "${dialectName}"`);
  } else {
    console.warn(`無法尋著對應个查詞腔調 radio button: "${dialectName}"`);
  }
}

// 加入新的可選參數：initialCategory, targetRowId
function generate(content, initialCategory = null, targetRowId = null) {
  console.log('Generate called for:', content.name);
  currentActiveDialectLevelFullName = getFullLevelName(content.name);

  document.querySelectorAll('.radioItem').forEach((label) => {
    label.classList.remove('active-category');
  });
  if (!initialCategory && !targetRowId) {
    const progressDetailsSpan = document.getElementById('progressDetails');
    if (progressDetailsSpan) progressDetailsSpan.textContent = '';
  }

  let 腔 = content.name.substring(0, 1);
  let 級 = content.name.substring(1);

  let selected例外音檔;
  switch (級) {
    case '基': selected例外音檔 = window['基例外音檔'] || []; break;
    case '初': selected例外音檔 = window['初例外音檔'] || []; break;
    case '中': selected例外音檔 = window['中例外音檔'] || []; break;
    case '中高': selected例外音檔 = window['中高例外音檔'] || []; break;
    case '高': selected例外音檔 = window['高例外音檔'] || []; break;
    default:
      console.error(`未知的級別簡稱: ${級}，無法載入例外音檔。`);
      selected例外音檔 = [];
  }
  const 例外音檔 = selected例外音檔;

  var fullLvlName;
  const generalMediaYr = '112';
  var 目錄級;
  var 目錄另級;
  var 腔名;
  var 級名;
  var 檔腔;
  var 檔級 = '';

  switch (腔) {
    case '四':
      檔腔 = 'si';
      腔名 = '四縣';
      currentActiveMainDialectName = '四縣';
      updateSearchDialect('四縣');
      break;
    case '海':
      檔腔 = 'ha';
      腔名 = '海陸';
      currentActiveMainDialectName = '海陸';
      updateSearchDialect('海陸');
      break;
    case '大':
      檔腔 = 'da';
      腔名 = '大埔';
      currentActiveMainDialectName = '大埔';
      updateSearchDialect('大埔');
      break;
    case '平':
      檔腔 = 'rh';
      腔名 = '饒平';
      currentActiveMainDialectName = '饒平';
      updateSearchDialect('饒平');
      break;
    case '安':
      檔腔 = 'zh';
      腔名 = '詔安';
      currentActiveMainDialectName = '詔安';
      updateSearchDialect('詔安');
      break;
    default:
      currentActiveMainDialectName = '';
      break;
  }
  switch (級) {
    case '基':
      目錄級 = '5';
      目錄另級 = '1';
      級名 = '基礎級';
      break;
    case '初':
      目錄級 = '1';
      級名 = '初級';
      break;
    case '中':
      目錄級 = '2';
      檔級 = '1';
      級名 = '中級';
      break;
    case '中高':
      目錄級 = '3';
      檔級 = '2';
      級名 = '中高級';
      break;
    case '高':
      目錄級 = '4';
      檔級 = '3';
      級名 = '高級';
      break;
    default:
      break;
  }
  fullLvlName = 腔名 + 級名;

  categoryList = [];

  var contentContainer = document.getElementById('generated');
  contentContainer.innerHTML = '';

  const arr = content.content; // After the loadDataFromDB fix, content.content is always the pre-parsed array.

  const catPanel = document.getElementById('cat-panel');
  if (catPanel) {
    const catPanelClone = catPanel.cloneNode(true);
    catPanel.parentNode.replaceChild(catPanelClone, catPanel);
  } else {
    console.error('Could not find #cat-panel to clone.');
  }

  var radios = document.querySelectorAll('input[name="category"]');
  const radioLabels = document.querySelectorAll('.radioItem');

  const dialectInfo = {
    腔, 級, 例外音檔, fullLvlName, generalMediaYr, 目錄級, 目錄另級, 檔腔, 檔級, 腔名, 級名,
  };

  radios.forEach(function (radio) {
    radio.addEventListener('change', function () {
      if (this.checked) {
        const selectedCategory = this.value;
        radioLabels.forEach((label) => label.classList.remove('active-category'));
        const currentLabel = this.closest('.radioItem');
        if (currentLabel) {
          currentLabel.classList.add('active-category');
        }
        const progressDetailsSpan = document.getElementById('progressDetails');
        if (progressDetailsSpan) progressDetailsSpan.textContent = '';

        const dialectLevelCodes = extractDialectLevelCodes(dialectInfo.fullLvlName);
        if (dialectLevelCodes) {
            const newUrl = new URL(window.location.href);
            newUrl.searchParams.set('dialect', dialectLevelCodes.dialect);
            newUrl.searchParams.set('level', dialectLevelCodes.level);
            newUrl.searchParams.set('category', selectedCategory);
            newUrl.searchParams.delete('row');
            newUrl.searchParams.delete('musiid');
            newUrl.searchParams.delete('ca');
            newUrl.searchParams.delete('bidsu');
            newUrl.searchParams.delete('iab');
            newUrl.searchParams.delete('kiong');
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
    } else {
      console.warn('找不到要自動選擇的類別按鈕:', initialCategory);
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
  if (!header) {
    console.error('找不到 #header 元素');
    return;
  }

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
      emptyAudio.addEventListener('ended', () => {
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
                  localStorage.setItem('hakkaBookmarks', JSON.stringify(bookmarks));
                  updateProgressDropdown();
                }
                finishedTableName = null;
                finishedCat = null;
              }
              isCrossCategoryPlaying = true;
              nextRadioButton.click();
            } else {
              playEndOfPlayback();
            }
          } else {
            playEndOfPlayback();
          }
        }, { once: true });
    }
    return;
  }

  var table = document.createElement('table');
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
    if (no[0] <= 9) no[0] = '0' + no[0];
    if (dialectInfo.級 === '初') no[0] = '0' + no[0];
    if (no[1] <= 9) no[1] = '0' + no[1];
    if (no[1] <= 99) no[1] = '0' + no[1];
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

    if (missingAudioInfo && missingAudioInfo.word === false) {
      const noWordAudioMsg = document.createElement('span');
      noWordAudioMsg.textContent = '（無詞彙音檔，敗勢）';
      noWordAudioMsg.style.color = 'red';
      td2.appendChild(noWordAudioMsg);
      const dummyAudio = document.createElement('audio');
      dummyAudio.className = 'media';
      dummyAudio.dataset.skip = 'true';
      dummyAudio.style.display = 'none';
      audioElementsList.push(dummyAudio);
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
    if (line.例句 && line.例句.trim() !== '') {
      const sentenceSpan = document.createElement('span');
      sentenceSpan.className = 'sentence';
      sentenceSpan.innerHTML = line.例句.replace(/"/g, '').replace(/\n/g, '<br>');
      td3.appendChild(sentenceSpan);
      td3.appendChild(document.createElement('br'));

      if (dialectInfo.級名 === '高級' || (missingAudioInfo && missingAudioInfo.sentence === false)) {
        if (missingAudioInfo && missingAudioInfo.sentence === false) {
            const noSentenceAudioMsg = document.createElement('span');
            noSentenceAudioMsg.textContent = '（無例句音檔，敗勢）';
            noSentenceAudioMsg.style.color = 'magenta';
            td3.appendChild(noSentenceAudioMsg);
        }
        const dummyAudio = document.createElement('audio');
        dummyAudio.className = 'media';
        dummyAudio.dataset.skip = 'true';
        dummyAudio.style.display = 'none';
        td3.appendChild(dummyAudio);
        audioElementsList.push(dummyAudio);
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
      const dummyAudio = document.createElement('audio');
      dummyAudio.className = 'media';
      dummyAudio.dataset.skip = 'true';
      dummyAudio.style.display = 'none';
      td3.appendChild(dummyAudio);
      audioElementsList.push(dummyAudio);
    }
    item.appendChild(td3);
    table.appendChild(item);
  }

  table.setAttribute('width', '100%');
  contentContainer.appendChild(table);

  if (dialectInfo.腔 === '大') {
    setTimeout(() => {
      大埔高降異化();
      大埔中遇低升();
      大埔低升異化();
    }, 0);
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
    if (nowPlaying) {
      nowPlaying.removeAttribute('id');
    }
  }
  function playEndOfPlayback() {
    const progressDropdown = document.getElementById('progressDropdown');
    if (progressDropdown && progressDropdown.options.length > 0) {
      progressDropdown.options[0].text = '擇進前个進度';
    }
    const endAudio = new Audio('endOfPlay.mp3');
    endAudio.play().catch((e) => console.error('播放結束音效失敗:', e));
    currentAudioIndex = 0;
    isPlaying = false;
    isPaused = false;
    currentAudio = null;
    const pauseResumeButton = document.getElementById('pauseResumeBtn');
    const stopButton = document.getElementById('stopBtn');
    if (pauseResumeButton) {
      pauseResumeButton.innerHTML = '<i class="fas fa-pause"></i>';
      pauseResumeButton.classList.remove('ongoing');
      pauseResumeButton.classList.add('ended');
    }
    if (stopButton) {
      stopButton.classList.remove('ongoing');
      stopButton.classList.add('ended');
    }
    document.querySelectorAll('.playFromThisRow').forEach((element) => {
      element.classList.remove('ongoing');
      element.classList.add('playable');
    });
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
    if (!isPlaying) {
      return;
    }

    const currentCategoryAudioElements = audioElements;

    if (index >= currentCategoryAudioElements.length) {
      const nextCategoryIndex = currentCategoryIndex + 1;
      if (nextCategoryIndex < categoryList.length) {
        const nextCategoryValue = categoryList[nextCategoryIndex];
        let bookmarks = JSON.parse(localStorage.getItem('hakkaBookmarks')) || [];
        const previousBookmarkIndex = bookmarks.findIndex((bm) => bm.tableName === dialectInfo.fullLvlName && bm.cat === category);
        if (previousBookmarkIndex > -1) {
          bookmarks.splice(previousBookmarkIndex, 1);
          localStorage.setItem('hakkaBookmarks', JSON.stringify(bookmarks));
        }
        const dialectLevelCodes = extractDialectLevelCodes(dialectInfo.fullLvlName);
        if (dialectLevelCodes) {
            const newUrl = new URL(window.location.href);
            newUrl.searchParams.set('category', nextCategoryValue);
            newUrl.searchParams.delete('row');
            history.pushState({}, '', newUrl.toString());
        }
        const nextRadioButton = document.querySelector(`input[name="category"][value="${nextCategoryValue}"]`);
        if (nextRadioButton) {
            isCrossCategoryPlaying = true;
            nextRadioButton.click();
        } else {
            playEndOfPlayback();
        }
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
        currentAudio.addEventListener('ended', handleAudioEnded, { once: true });
        isPlaying = true;
        isPaused = false;
        const pauseResumeButton = document.getElementById('pauseResumeBtn');
        if (pauseResumeButton) {
          pauseResumeButton.innerHTML = '<i class="fas fa-pause"></i>';
          pauseResumeButton.classList.remove('ended');
          pauseResumeButton.classList.add('ongoing');
        }
        const rowElement = currentAudio.closest('tr');
        if (rowElement) {
          addNowPlaying(rowElement);
          const audioTd = currentAudio.closest('td');
          if (audioTd) {
            audioTd.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
            const rowButton = currentAudio.closest('tr')?.querySelector('button[data-row-id]');
            if (rowButton) {
              const rowId = rowButton.dataset.rowId;
              let rowNum = rowId.replace(/^0+/, '');
              let totalRowsInCurrentCategory = bookmarkButtons.length;
              let percentage = (rowNum / totalRowsInCurrentCategory) * 100;
              let percentageFixed = percentage.toFixed(2);
              saveBookmark(rowId, percentageFixed, category, dialectInfo.fullLvlName, true);
            }
          }
        } else if (rowElement) {
            rowElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
      }).catch((error) => {
        console.error(`播放音訊失敗 (索引 ${index}, src: ${sourceUrlForErrorLog}): ${error.name} - ${error.message}`, error);
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
      let totalRows = bookmarkButtons.length;
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
            audioTd.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
          } else {
            document.getElementById('nowPlaying')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
        if (progressDropdown && progressDropdown.options.length > 0) {
          progressDropdown.options[0].text = '擇進前个進度';
        }
        if (pauseResumeButton) {
          pauseResumeButton.innerHTML = '<i class="fas fa-pause"></i>';
          pauseResumeButton.classList.remove('ongoing');
          pauseResumeButton.classList.add('ended');
        }
        this.classList.remove('ongoing');
        this.classList.add('ended');
        document.querySelectorAll('.playFromThisRow').forEach((element) => {
          element.classList.remove('ongoing');
          element.classList.add('playable');
        });
        removeNowPlaying();
      }
    };
  }

  const playFromRowButtons = document.querySelectorAll('.playFromThisRow');
  playFromRowButtons.forEach((button) => {
    button.onclick = function () {
      if (isPlaying) {
        if (stopButton) stopButton.click();
        setTimeout(() => startPlayingFromRow(this), 100);
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
    if (pauseResumeButton) {
      pauseResumeButton.innerHTML = '<i class="fas fa-pause"></i>';
      pauseResumeButton.classList.remove('ended');
      pauseResumeButton.classList.add('ongoing');
    }
    if (stopButton) {
      stopButton.classList.remove('ended');
      stopButton.classList.add('ongoing');
    }
    playFromRowButtons.forEach((element) => element.classList.add('ongoing'));
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
            if (window.location.protocol === 'file:') {
              baseURL = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);
            } else {
              let path = window.location.pathname;
              baseURL = window.location.origin + path.substring(0, path.lastIndexOf('/') + 1);
              if (!baseURL.endsWith('/')) baseURL += '/';
            }
            const shareURL = `${baseURL}index.html?dialect=${dialectLevelCodes.dialect}&level=${dialectLevelCodes.level}&category=${category}&row=${autoPlayTargetRowId}`;
            const linkText = loadedBookmark ? `#${loadedBookmark.rowId} (${loadedBookmark.percentage}%)` : `#${autoPlayTargetRowId}`;
            const linkElement = document.createElement('a');
            linkElement.href = shareURL;
            linkElement.textContent = linkText;
            linkElement.style.marginLeft = '5px';
            progressDetailsSpan.innerHTML = '';
            progressDetailsSpan.appendChild(linkElement);
          } else {
            progressDetailsSpan.textContent = loadedBookmark ? `#${loadedBookmark.rowId} (${loadedBookmark.percentage}%)` : `#${autoPlayTargetRowId}`;
          }
        }
        
        const isRunningOnIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        if (isRunningOnIOS && loadedViaUrlParams) {
          const playButtonTd = targetRow.querySelector('td.no');
          if (playButtonTd) {
              playButtonTd.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
          } else {
              targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
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
            if (stopButton && isPlaying) {
              stopButton.click();
            }
            setTimeout(() => {
              playButton.click();
            }, 300);
          }
        }
      }
    } else {
      if (progressDetailsSpan) {
        progressDetailsSpan.textContent = '';
      }
    }
  } else {
    if (!isCrossCategoryPlaying && progressDetailsSpan) {
      progressDetailsSpan.textContent = '';
    }
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
        setTimeout(() => {
          startPlayingFromRow(firstPlayButton);
        }, 100);
      } else {
        playEndOfPlayback();
      }
    }
  }
  setTimeout(adjustHeaderFontSizeOnOverflow, 0);
  updateResultsSummaryVisibility();
}

  preprocessAllData(); // <-- 確保這一行被執行

  if (selectionPopup && selectionPopupBackdrop && selectionPopupContent && selectionPopupCloseBtn && contentContainer) {
    if (isMobileDevice()) {
      console.log('手機裝置，設定 selectionchange 監聽器分查詞按鈕。');
      createMobileLookupButton(selectionPopup, selectionPopupContent, selectionPopupBackdrop);
      document.addEventListener('selectionchange', debouncedMobileSelectionHandler);
    } else {
      console.log('桌機裝置，設定 mouseup 監聽器分 popup。');
      contentContainer.addEventListener('mouseup', (event) => handleTextSelectionInSentence(event, selectionPopup, selectionPopupContent, selectionPopupBackdrop, contentContainer));
    }

    selectionPopupCloseBtn.addEventListener('click', () => hidePronunciationPopup(selectionPopup, selectionPopupBackdrop));
    selectionPopupBackdrop.addEventListener('click', () => hidePronunciationPopup(selectionPopup, selectionPopupBackdrop));

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
    const radioToSelect = document.querySelector(`#search-popup input[name="dialect"][value="${dialectToSelect}"]`);
    if (radioToSelect) {
      radioToSelect.checked = true;
    }

    const musiidParam = urlParams.get('musiid');
    const caParam = urlParams.get('ca');
    const bidsuParam = urlParams.get('bidsu');
    const iabParam = urlParams.get('iab');
    const dialectParam = urlParams.get('dialect');
    const levelParam = urlParams.get('level');
    const categoryParam = urlParams.get('category');
    const rowParam = urlParams.get('row');
    successfullyLoadedFromUrl = false;

    if (musiidParam && caParam) {
      const searchModeValue = musiidParam === 'hak' ? '客家語' : '華語';
      const itemsPerPage = parseInt(bidsuParam) || 50;
      const page = parseInt(iabParam) || 1;
      let dialectToUseForSearch = '四縣';
      const kiongFromUrl = urlParams.get('kiong');
      if (kiongFromUrl && DIALECT_CODE_TO_NAME[kiongFromUrl]) {
        dialectToUseForSearch = DIALECT_CODE_TO_NAME[kiongFromUrl];
      } else {
        const lastUsedDialect = localStorage.getItem('lastSearchDialect');
        if (lastUsedDialect && DIALECT_NAME_TO_CODE[lastUsedDialect]) {
          dialectToUseForSearch = lastUsedDialect;
        }
      }
      const dialectRadio = document.querySelector(`#search-popup input[name="dialect"][value="${dialectToUseForSearch}"]`);
      if (dialectRadio) dialectRadio.checked = true;
      const modeRadio = document.querySelector(`#search-popup input[name="search-mode"][value="${searchModeValue}"]`);
      if (modeRadio) modeRadio.checked = true;
      searchInput.value = caParam;
      performSearch(page, itemsPerPage);
    } else if (dialectParam && levelParam && categoryParam && rowParam) {
      loadedViaUrlParams = true;
      let dialectName = '';
      let levelName = '';
      switch (dialectParam) {
        case 'si': dialectName = '四縣'; break;
        case 'ha': dialectName = '海陸'; break;
        case 'da': dialectName = '大埔'; break;
        case 'rh': dialectName = '饒平'; break;
        case 'zh': dialectName = '詔安'; break;
      }
      switch (levelParam) {
        case '5': levelName = '基礎級'; break;
        case '1': levelName = '初級'; break;
        case '2': levelName = '中級'; break;
        case '3': levelName = '中高級'; break;
        case '4': levelName = '高級'; break;
      }
      if (dialectName && levelName) {
        const targetTableName = dialectName + levelName;
        const dataVarName = mapTableNameToDataVar(targetTableName);
        if (dataVarName) {
          let dataObject = window[dataVarName]; // *** 關鍵修正 ***
          if (typeof dataObject !== 'undefined') {
            const decodedCategory = decodeURIComponent(categoryParam);
            const autoplayModal = document.getElementById('autoplayModal');
            const modalContent = autoplayModal.querySelector('.modal-content');
            if (autoplayModal && modalContent) {
              const startPlayback = () => {
                autoplayModal.style.display = 'none';
                generate(dataObject, decodedCategory, rowParam);
                successfullyLoadedFromUrl = true;
                if (progressDropdown) {
                  const targetValue = targetTableName + '||' + decodedCategory;
                  const optionToSelect = progressDropdown.querySelector(`option[value="${targetValue}"]`);
                  if (optionToSelect) {
                    optionToSelect.selected = true;
                  } else {
                    progressDropdown.selectedIndex = 0;
                  }
                }
              };
              const newModalContent = modalContent.cloneNode(true);
              modalContent.parentNode.replaceChild(newModalContent, modalContent);
              newModalContent.addEventListener('click', startPlayback, { once: true });
              const newAutoplayModal = autoplayModal.cloneNode(true);
              autoplayModal.parentNode.replaceChild(newAutoplayModal, autoplayModal);
              newAutoplayModal.addEventListener('click', (event) => {
                if (event.target.closest('.modal-content')) return;
                newAutoplayModal.style.display = 'none';
              }, { once: false });
              newAutoplayModal.style.display = 'flex';
            } else {
              generate(dataObject, decodedCategory, rowParam);
              successfullyLoadedFromUrl = true;
            }
          }
        }
      }
    }
  }

  handleUrlChange();
  window.addEventListener('popstate', handleUrlChange);

  if (infoButton && infoModal && infoModalCloseBtn) {
    fetch('info.md').then(response => response.text()).then(markdown => {
        document.getElementById('info-content').innerHTML = marked.parse(markdown);
      }).catch(error => {
        document.getElementById('info-content').innerHTML = '<p>說明文件載入失敗。</p>';
      });
    const dontShowAgain = localStorage.getItem('dontShowInfoModalAgain');
    if (!dontShowAgain) {
      infoModal.style.display = 'flex';
    }
    infoButton.addEventListener('click', () => {
      infoModal.style.display = 'flex';
      trackEvent('open', 'InfoModal', 'click_info_button');
    });
    const closeInfoModal = () => {
      if (document.getElementById('dontShowInfoModalAgain').checked) {
        localStorage.setItem('dontShowInfoModalAgain', 'true');
      }
      infoModal.style.display = 'none';
    };
    infoModalCloseBtn.addEventListener('click', closeInfoModal);
    infoModal.addEventListener('click', (event) => {
      if (event.target === infoModal) closeInfoModal();
    });
  }

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
        localStorage.setItem('lastSearchDialect', document.querySelector('#search-popup input[name="dialect"]:checked').value);
        localStorage.setItem('lastSearchMode', document.querySelector('#search-popup input[name="search-mode"]:checked').value);
        if (searchInput.value.trim()) {
            performSearch();
        }
    };

    searchDialectRadios.forEach(radio => radio.addEventListener('change', triggerSearchOnChange));
    searchModeRadios.forEach(radio => radio.addEventListener('change', triggerSearchOnChange));
    const lastDialect = localStorage.getItem('lastSearchDialect');
    if (lastDialect) {
      const radioToCheck = document.querySelector(`#search-popup input[name="dialect"][value="${lastDialect}"]`);
      if (radioToCheck) radioToCheck.checked = true;
    }
    const lastMode = localStorage.getItem('lastSearchMode');
    if (lastMode) {
      const radioToCheck = document.querySelector(`#search-popup input[name="search-mode"][value="${lastMode}"]`);
      if (radioToCheck) radioToCheck.checked = true;
    }
    searchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') performSearch();
    });
  }

  if (backToTopButton) {
    window.onscroll = function () {
      if (document.body.scrollTop > 20 || document.documentElement.scrollTop > 20) {
        backToTopButton.style.display = 'block';
      } else {
        backToTopButton.style.display = 'none';
      }
    };
    backToTopButton.addEventListener('click', () => {
      document.body.scrollTop = 0;
      document.documentElement.scrollTop = 0;
    });
  }

  dialectLevelLinks.forEach(function (link) {
    link.addEventListener('click', function (e) {
      e.preventDefault();
      var varName = this.parentNode.dataset.varname;
      var dataObject = window[varName]; // *** 關鍵修正 ***
      if (dataObject) {
        generate(dataObject);
      } else {
        console.error(`找不到資料物件: ${varName}`);
      }
    });
  });

  updateProgressDropdown();
  progressDropdown.addEventListener('change', function () {
    const selectedValue = this.value;

    if (selectedValue && selectedValue !== '擇進前个進度') {
      const bookmarks = JSON.parse(localStorage.getItem('hakkaBookmarks')) || [];
      // [修正] 先從 bookmarks 陣列中找到完整的書籤物件
      const selectedBookmark = bookmarks.find(bm => bm.tableName + '||' + bm.cat === selectedValue);

      if (selectedBookmark) {
        // [修正] 從找到的物件中安全地取得所有資訊
        const targetTableName = selectedBookmark.tableName;
        const targetCategory = selectedBookmark.cat;
        const targetRowIdToGo = selectedBookmark.rowId; // <--- 這樣才能正確取得 rowId
        const dataVarName = mapTableNameToDataVar(targetTableName);

        if (dataVarName) {
          const dataObject = window[dataVarName];
          if (dataObject) {
            generate(dataObject, targetCategory, targetRowIdToGo);
          } else {
            console.error('無法找到對應的資料變數:', dataVarName || targetTableName);
            alert('載入選定進度時發生錯誤：找不到對應的資料集。');
          }
        }
      } else {
        console.error('找不到對應 value 的書籤:', selectedValue);
        alert('載入選定進度時發生錯誤：選項與儲存資料不符。');
      }
    }
  });

  window.addEventListener('resize', handleResizeActions);
  document.addEventListener('keydown', globalKeydownHandler);
  handleResizeActions();
}

// Start the application
initializeApp();