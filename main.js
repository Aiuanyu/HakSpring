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
let mobileLookupButton = null; // <-- 新增：手機版查詞按鈕
let lastSelectionRectForMobile = null; // <-- 新增：手機版最後選取範圍 (分按鈕點擊時用)

// --- 新增：所有已知的資料變數名稱 (用於「共腔尋詞」) ---
const allKnownDataVars = [
  '四基', '四初', '四中', '四中高', '四高',
  '海基', '海初', '海中', '海中高', '海高',
  '大基', '大初', '大中', '大中高', '大高',
  '平基', '平初', '平中', '平中高', '平高',
  '安基', '安初', '安中', '安中高', '安高'
];

// All data variables from the included JS files
const allData = {
    '四縣': [四基, 四初, 四中, 四中高, 四高],
    '海陸': [海基, 海初, 海中, 海中高, 海高],
    '大埔': [大基, 大初, 大中, 大中高, 大高],
    '饒平': [平基, 平初, 平中, 平中高, 平高],
    '詔安': [安基, 安初, 安中, 安中高, 安高]
};

/* Gemini 老師。這種方式還是會因為 CORS 被擋下，無法偵測
function checkAudioStatus(url) {
  return fetch(url, { method: 'HEAD' })
    .then(response => {
      if (response.ok) {
        return Promise.resolve(true); // 音訊存在且可存取
      } else {
        return Promise.resolve(false); // 音訊不存在或無法存取
      }
    })
    .catch(error => {
      console.error('檢查音訊狀態時發生錯誤：', error);
      if (error instanceof TypeError && error.message.includes('CORS')) {
        console.error('偵測到 CORS 錯誤，ORB 封鎖。');
        return Promise.resolve(false); // 發生 CORS 錯誤，認為音訊無法存取
      }
      return Promise.resolve(false); // 其他錯誤
    });
}*/
/* 這也會被 CORS 擋，氣人 
function checkAudioStatus(url) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('HEAD', url, true);
    xhr.onload = function() {
      if (xhr.status === 200) {
        resolve(true); // 音訊存在
      } else if (xhr.status === 404) {
        resolve(false); // 音訊不存在 (404)
      } else {
        resolve(false); // 其他錯誤
      }
    };
    xhr.onerror = function() {
      resolve(false); // 發生錯誤
    };
    xhr.send();
  });
}*/

function csvToArray(str, delimiter = ',') {
  // https://github.com/codewithnathan97/javascript-csv-array-example/blob/master/index.html

  /*  //str = str.replace(/\r/g,""); // GHSRobert 自己加的，原本弄的會在行尾跑出 \r；好像是 CSV 檔才要？
  
    // slice from start of text to the first \n index
    // use split to create an array from string by delimiter
    const headers = str.slice(0, str.indexOf("\n")).split(delimiter);
  
    // slice from \n index + 1 to the end of the text
    // use split to create an array of each csv value row
    const rows = str.slice(str.indexOf("\n") + 1).split("\n"); // GHSRobert：這樣多行 cell 也會被切開
  
    // Map the rows
    // split values from each row into an array
    // use headers.reduce to create an object
    // object properties derived from headers:values
    // the object passed as an element of the array
    const arr = rows.map(function (row) {
      const values = row.split(delimiter);
      const el = headers.reduce(function (object, header, index) {
        object[header] = values[index];
        return object;
      }, {});
      return el;
    });
  
    // return the array
    return arr;*/

  /* GHSRobert + Gemini */
  const rows = str.split('\n');
  const headers = rows[0].replace(/(四縣|海陸|大埔|饒平|詔安)/g, '').split(',');
  const data = [];

  // 將每一列轉換成 JavaScript 物件
  for (let i = 1; i < rows.length; i++) {
    const values = rows[i].split(',');
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = values[j];
    }
    data.push(obj);
  }
  return data;
}

//cat = "2心理活動與感覺";
//console.log(cat);

// 加入新的可選參數：initialCategory, targetRowId
function generate(content, initialCategory = null, targetRowId = null) {
  // --- 保留 generate 開頭的變數定義和分析腔別級別的邏輯 ---
  console.log('Generate called for:', content.name); // 增加日誌
  currentActiveDialectLevelFullName = getFullLevelName(content.name); // <-- 設定目前作用中的完整腔調級別全名
  // currentActiveMainDialectName 會在下面 switch(腔) 後設定

  // --- 新增：在 generate 開始時，確保清除舊的類別選中狀態 ---
  document.querySelectorAll('.radioItem').forEach((label) => {
    label.classList.remove('active-category');
  });
  // --- 新增：如果不是從下拉選單觸發，就清除進度詳情 ---
  if (!initialCategory && !targetRowId) {
    const progressDetailsSpan = document.getElementById('progressDetails');
    if (progressDetailsSpan) progressDetailsSpan.textContent = '';
  }
  // --- 新增結束 ---

  let 腔 = '';
  let 級 = '';
  腔 = content.name.substring(0, 1);
  級 = content.name.substring(1);
  // const 例外音檔 = eval(級 + '例外音檔'); // 原本使用 eval 的方式

  let selected例外音檔;
  switch (級) {
    case '基':
      selected例外音檔 = typeof 基例外音檔 !== 'undefined' ? 基例外音檔 : [];
      break;
    case '初':
      selected例外音檔 = typeof 初例外音檔 !== 'undefined' ? 初例外音檔 : [];
      break;
    case '中':
      selected例外音檔 = typeof 中例外音檔 !== 'undefined' ? 中例外音檔 : [];
      break;
    case '中高':
      selected例外音檔 = typeof 中高例外音檔 !== 'undefined' ? 中高例外音檔 : [];
      break;
    case '高':
      selected例外音檔 = typeof 高例外音檔 !== 'undefined' ? 高例外音檔 : [];
      break;
    default:
      console.error(`未知的級別簡稱: ${級}，無法載入例外音檔。`);
      selected例外音檔 = []; // 若無對應，預設為空陣列
  }
  const 例外音檔 = selected例外音檔;

  var fullLvlName;
  const generalMediaYr = '112';
  var 目錄級;
  var 目錄另級;
  var 腔名;
  var 級名;
  var 檔腔;
  var 檔級 = ''; // 初始化檔級

  // ... (保留 switch(腔) 和 switch(級) 的邏輯) ...
  switch (腔) {
    case '四':
      檔腔 = 'si';
      腔名 = '四縣';
      currentActiveMainDialectName = '四縣'; // <-- 設定主要腔調名
      break;
    case '海':
      檔腔 = 'ha';
      腔名 = '海陸';
      currentActiveMainDialectName = '海陸'; // <-- 設定主要腔調名
      break;
    case '大':
      檔腔 = 'da';
      腔名 = '大埔';
      currentActiveMainDialectName = '大埔'; // <-- 設定主要腔調名
      break;
    case '平':
      檔腔 = 'rh';
      腔名 = '饒平';
      currentActiveMainDialectName = '饒平'; // <-- 設定主要腔調名
      break;
    case '安':
      檔腔 = 'zh';
      腔名 = '詔安';
      currentActiveMainDialectName = '詔安'; // <-- 設定主要腔調名
      break;
    default:
      currentActiveMainDialectName = ''; // 未知腔調
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
  // --- 保留結束 ---

  categoryList = []; // 在 generate() 裡面清空類別列表，恁仔做得確保每擺切換腔調級別个時節，都會用全新个類別列表。

  var contentContainer = document.getElementById('generated');
  contentContainer.innerHTML = ''; // 清空顯示區域

  var title = document.getElementById('header');
  // title.innerHTML = ''; // <-- 刪除這行，這樣才不會在每次呼叫 generate 時清空 header 裡面的下拉選單。

  // 解析詞彙資料
  const arr = csvToArray(content.content);

  // --- 將建立表格和設定播放的邏輯移到新函式 ---
  // (這部分程式碼將從 generate 移到下面的 buildTableAndSetupPlayback)

  // --- *** 新增修改：克隆 cat-panel 以移除舊監聽器 *** ---
  const catPanel = document.getElementById('cat-panel');
  if (catPanel) {
    const catPanelClone = catPanel.cloneNode(true); // true 表示深層複製
    catPanel.parentNode.replaceChild(catPanelClone, catPanel);
    console.log('Cloned cat-panel to remove old listeners.');
  } else {
    console.error('Could not find #cat-panel to clone.');
    // 如果找不到 cat-panel，後續可能會出錯，但至少記錄下來
  }

  // --- 修改 radio button 的處理邏輯 ---
  // *** 注意：因為 cat-panel 被替換了，需要重新獲取 radios 和 radioLabels ***
  var radios = document.querySelectorAll('input[name="category"]');
  const radioLabels = document.querySelectorAll('.radioItem'); // 重新獲取

  // 將需要傳遞給 buildTableAndSetupPlayback 的資訊包裝起來
  const dialectInfo = {
    腔,
    級,
    例外音檔,
    fullLvlName,
    generalMediaYr,
    目錄級,
    目錄另級,
    檔腔,
    檔級,
    腔名,
    級名,
  };

  // 設定 radio button 的 change 事件監聽
  radios.forEach(function (radio) {
    radio.addEventListener('change', function () {
      if (this.checked) {
        const selectedCategory = this.value;
        console.log('Category changed to:', selectedCategory); // 增加日誌

        // --- 修改：處理類別選中樣式 ---
        // 1. 移除所有 radio label 的 active class
        radioLabels.forEach((label) =>
          label.classList.remove('active-category')
        );
        // 2. 為當前選中的 radio button 對應的 label 加上 active class
        const currentLabel = this.closest('.radioItem');
        if (currentLabel) {
          currentLabel.classList.add('active-category');
        }
        // --- 修改結束 ---

        // --- 新增：手動切換分類時清除進度詳情 ---
        const progressDetailsSpan = document.getElementById('progressDetails');
        if (progressDetailsSpan) progressDetailsSpan.textContent = '';
        // --- 新增結束 ---
        // 當 radio button 改變時，呼叫新函式來建立表格並設定功能
        buildTableAndSetupPlayback(selectedCategory, arr, dialectInfo);
      }
    });
  });

  // --- 新增：處理從下拉選單跳轉過來的情況 ---
  if (initialCategory) {
    console.log('Initial category specified:', initialCategory); // 增加日誌
    const targetRadio = document.querySelector(
      `input[name="category"][value="${initialCategory}"]`
    );
    if (targetRadio) {
      console.log('Found target radio for:', initialCategory); // 增加日誌
      targetRadio.checked = true;

      // --- 新增：為自動選中的類別加上樣式 ---
      const targetLabel = targetRadio.closest('.radioItem');
      if (targetLabel) {
        // 先清除所有，再添加目標的 (以防萬一)
        radioLabels.forEach((label) =>
          label.classList.remove('active-category')
        );
        targetLabel.classList.add('active-category');
      }

      // 直接呼叫新函式來建立表格，並傳遞 targetRowId
      buildTableAndSetupPlayback(
        initialCategory,
        arr,
        dialectInfo,
        targetRowId
      );
    } else {
      console.warn('找不到要自動選擇的類別按鈕:', initialCategory);
      // 如果找不到指定的類別，可以選擇顯示第一個類別或不顯示任何內容
      // 這裡選擇不顯示 (因為 contentContainer 已清空)
    }
  } else {
    // 如果沒有指定初始分類 (例如使用者是手動點擊腔調級別連結)，
    // 可以選擇預設顯示第一個分類，或者讓使用者自行點選。
    // 目前行為：不預選，讓使用者點選。
    console.log('No initial category specified.'); // 增加日誌
    // 清除舊表格內容和 radio button 選擇
    radios.forEach((radio) => (radio.checked = false));
    contentContainer.innerHTML =
      '<p style="text-align: center; margin-top: 20px;">請選擇一個類別來顯示詞彙。</p>';
    // **新增這行**：移除 header 中的播放控制鈕
    header?.querySelector('#audioControls')?.remove(); // 使用 Optional Chaining 避免錯誤
  }

  // --- 在函式最尾項 ---
  setTimeout(adjustHeaderFontSizeOnOverflow, 0);
} // --- generate 函式結束 ---

// --- 新增：建立表格和設定播放/書籤功能的主體函式 ---
// 加入新的可選參數：autoPlayTargetRowId
function buildTableAndSetupPlayback(
  category,
  vocabularyArray,
  dialectInfo,
  autoPlayTargetRowId = null
) {
  // 獲取類別列表和目前索引
  const radioButtons = document.querySelectorAll('input[name="category"]');
  categoryList = Array.from(radioButtons).map((radio) => radio.value);
  const checkedRadio = document.querySelector('input[name="category"]:checked');
  currentCategoryIndex = checkedRadio
    ? categoryList.indexOf(checkedRadio.value)
    : -1;
  console.log(
    'Current categories:',
    categoryList,
    'Current index:',
    currentCategoryIndex
  ); // Debug log

  const contentContainer = document.getElementById('generated');
  contentContainer.innerHTML = ''; // 清空，確保只顯示當前分類的內容

  const header = document.getElementById('header'); // 改用 header 變數
  if (!header) {
    console.error('找不到 #header 元素');
    return; // 如果 header 不存在，後續操作無意義
  }

  // --- 新增：在建立表格前，先移除可能殘留的 iOS 提示訊息 ---
  const existingInstructions = document.querySelectorAll('.ios-autoplay-instruction');
  existingInstructions.forEach(el => el.remove());
  console.log('Removed existing iOS instruction messages.');

  const progressDetailsSpan = document.getElementById('progressDetails');

  console.log(
    `Building table for category: ${category}, autoPlayRow: ${autoPlayTargetRowId}`
  ); // 增加日誌

  // --- *** 新增：先過濾出目前類別个詞彙 *** ---
  const filteredItems = vocabularyArray.filter(
    (line) => line.分類 && line.分類.includes(category)
  );
  console.log(`Category "${category}" has ${filteredItems.length} items.`); // 增加日誌

  // --- *** 新增：處理空類別个情況 *** ---
  if (filteredItems.length === 0) {
    // 顯示空類別訊息
    contentContainer.innerHTML = `<p style="text-align: center; margin-top: 20px;">${dialectInfo.級名} 無「${category}」个內容。</p>`;
    // **移除** header 中的播放控制鈕 (因為這類別無東西好播)
    header?.querySelector('#audioControls')?.remove(); // 使用 Optional Chaining 避免錯誤

    // 檢查係無係在跨類別播放模式
    if (isCrossCategoryPlaying) {
      console.log(
        `Empty category "${category}" encountered during cross-category playback.`
      );
      // 播放特殊音檔
      const emptyAudio = new Audio('empty_category.mp3'); // <--- 請確定這隻檔案存在

      emptyAudio.play().catch((e) => console.error('播放空類別音效失敗:', e));

      // 監聽音檔結束事件
      emptyAudio.addEventListener(
        'ended',
        () => {
          isCrossCategoryPlaying = false; // <--- 在處理完空類別後重設旗標
          console.log('Empty category audio finished.');
          const nextCategoryIndex = currentCategoryIndex + 1;

          // 檢查係無係還有下一隻類別
          if (nextCategoryIndex < categoryList.length) {
            const nextCategoryValue = categoryList[nextCategoryIndex];
            const nextRadioButton = document.querySelector(
              `input[name="category"][value="${nextCategoryValue}"]`
            );
            if (nextRadioButton) {
              console.log(`Switching to next category: ${nextCategoryValue}`);
              // --- 新增：在點擊前，先處理書籤替換 ---
              if (finishedTableName && finishedCat) {
                console.log(
                  `Attempting to replace bookmark for finished (empty) category: ${finishedTableName} - ${finishedCat}`
                );
                let bookmarks =
                  JSON.parse(localStorage.getItem('hakkaBookmarks')) || [];
                const previousBookmarkIndex = bookmarks.findIndex(
                  (bm) =>
                    bm.tableName === finishedTableName && bm.cat === finishedCat
                );
                if (previousBookmarkIndex > -1) {
                  console.log(
                    `Found finished bookmark at index ${previousBookmarkIndex}. Removing it.`
                  );
                  bookmarks.splice(previousBookmarkIndex, 1);
                  localStorage.setItem(
                    'hakkaBookmarks',
                    JSON.stringify(bookmarks)
                  );
                  updateProgressDropdown(); // 更新下拉選單
                } else {
                  console.log(
                    `Could not find bookmark for finished (empty) category: ${finishedTableName} - ${finishedCat}`
                  );
                }
                // 清除暫存變數
                finishedTableName = null;
                finishedCat = null;
              }
              // --- 書籤替換結束 ---
              isCrossCategoryPlaying = true; // <--- 在點擊下一隻 *前* 重新設定旗標
              nextRadioButton.click(); // 觸發切換
            } else {
              console.error(
                `Could not find radio button for next category after empty: ${nextCategoryValue}`
              );
              playEndOfPlayback(); // 尋毋著下一隻按鈕，結束播放
            }
          } else {
            // 這係最尾一隻類別
            console.log('Empty category was the last one.');
            playEndOfPlayback(); // 結束播放
          }
        },
        { once: true }
      ); // 事件只觸發一次
    } else {
      // 非跨類別播放模式下選到空類別，單淨顯示訊息
      console.log(`Empty category "${category}" selected manually.`);
    }
    return; // 結束 buildTableAndSetupPlayback 函式，毋使建立表格
  }
  // --- *** 空類別處理結束 *** ---

  // --- 如果類別毋係空个，繼續執行原本个邏輯 ---
  var table = document.createElement('table');
  table.innerHTML = '';
  let rowIndex = 0; // 音檔索引計數器
  let audioElementsList = []; // 收集此分類的 audio 元素
  let bookmarkButtonsList = []; // 收集此分類的書籤按鈕

  // *** 修改：用 filteredItems 來建立表格 ***
  for (const line of filteredItems) {
    // --- 內部建立 tr, td, audio, button 的邏輯基本不變 ---
    // --- 但需要使用傳入的 dialectInfo 物件來獲取變數 ---

    // --- 新增：在處理每一行詞彙前，先取得音檔缺失資訊 ---
    const missingAudioInfo = typeof getMissingAudioInfo === 'function' ?
                           getMissingAudioInfo(dialectInfo.fullLvlName, category, line.編號) :
                           null;
    // if (missingAudioInfo) { // Debug log
    //   console.log(`音檔缺失資訊 for ${dialectInfo.fullLvlName} - ${category} - ${line.編號}:`, missingAudioInfo);
    // }

    // --- 但需要使用傳入的 dialectInfo 物件來獲取變數 ---
    let mediaYr = dialectInfo.generalMediaYr;
    let pre112Insertion詞 = '';
    let pre112Insertion句 = '';
    let 詞目錄級 = dialectInfo.目錄級;
    let 句目錄級 = dialectInfo.目錄級;
    let mediaNo = ''; // 在迴圈內計算

    // 編號處理
    var no = line.編號.split('-');
    if (no[0] <= 9) {
      no[0] = '0' + no[0];
    }
    if (dialectInfo.級 === '初') {
      no[0] = '0' + no[0];
    } // 初級特殊處理
    if (no[1] <= 9) {
      no[1] = '0' + no[1];
    }
    if (no[1] <= 99) {
      no[1] = '0' + no[1];
    }
    mediaNo = no[1]; // mediaNo 在此賦值

    // 例外音檔處理
    const index = dialectInfo.例外音檔.findIndex(
      ([編號]) => 編號 === line.編號
    );
    if (index !== -1) {
      const matchedElement = dialectInfo.例外音檔[index];
      console.log(`編號 ${line.編號} 符合例外音檔`);
      mediaYr = matchedElement[1];
      mediaNo = matchedElement[2]; // 例外 mediaNo 在此賦值
      pre112Insertion詞 = 'w/';
      pre112Insertion句 = 's/';
      if (dialectInfo.目錄另級 !== undefined) { // 只在目錄另級有定義時才更新句目錄級
        詞目錄級 = dialectInfo.目錄另級; // GHSRobert：自家加个
        句目錄級 = dialectInfo.目錄另級;
      }
    }

    const 詞目錄 =
      詞目錄級 +
      '/' +
      dialectInfo.檔腔 +
      '/' +
      pre112Insertion詞 +
      dialectInfo.檔級 +
      dialectInfo.檔腔;
    const 句目錄 =
      句目錄級 +
      '/' +
      dialectInfo.檔腔 +
      '/' +
      pre112Insertion句 +
      dialectInfo.檔級 +
      dialectInfo.檔腔;

    let audioIndex = rowIndex * 2;
    rowIndex++;
    var item = document.createElement('tr');

    // TD1: 編號 & 控制按鈕
    const td1 = document.createElement('td');
    td1.className = 'no';
    td1.dataset.label = '編號'; // <-- 加入 data-label
    const anchor = document.createElement('a');
    anchor.name = no[1]; // 使用 '001', '002' 等格式
    td1.appendChild(anchor);
    const noText = document.createTextNode(line.編號 + '\u00A0');
    td1.appendChild(noText);

    const bookmarkBtn = document.createElement('button');
    bookmarkBtn.className = 'bookmarkBtn';
    bookmarkBtn.dataset.rowId = no[1]; // data-row-id 仍用 '001'
    bookmarkBtn.innerHTML = '<i class="fas fa-bookmark"></i>';
    td1.appendChild(bookmarkBtn);
    bookmarkButtonsList.push(bookmarkBtn); // 收集按鈕

    const playBtn = document.createElement('button');
    playBtn.className = 'playFromThisRow';
    playBtn.dataset.index = audioIndex; // 播放索引
    playBtn.dataset.rowId = no[1]; // 加入 rowId 方便查找
    playBtn.title = '從此列播放';
    playBtn.innerHTML = '<i class="fas fa-play"></i>';
    td1.appendChild(playBtn);
    item.appendChild(td1);

    // TD2: 詞彙、標音、音檔、意義、備註
    const td2 = document.createElement('td');
    td2.dataset.label = '詞彙'; // <-- 加入 data-label
    const ruby = document.createElement('ruby');
    ruby.textContent = line.客家語;
    const rt = document.createElement('rt');
    rt.textContent = line.客語標音;
    ruby.appendChild(rt);
    td2.appendChild(ruby);
    td2.appendChild(document.createElement('br'));

    // --- 修改：處理詞彙音檔 (audio1) ---
    let wordAudioActuallyMissing = false;
    if (missingAudioInfo && missingAudioInfo.word === false) {
      wordAudioActuallyMissing = true;
    }

    if (wordAudioActuallyMissing) {
      const noWordAudioMsg = document.createElement('span');
      noWordAudioMsg.textContent = '（無詞彙音檔，敗勢）';
      noWordAudioMsg.style.color = 'red'; // 用紅色標示詞彙音檔缺失
      td2.appendChild(noWordAudioMsg);

      const dummyAudioForMissingWord = document.createElement('audio');
      dummyAudioForMissingWord.className = 'media';
      dummyAudioForMissingWord.dataset.skip = 'true';
      dummyAudioForMissingWord.controls = false;
      dummyAudioForMissingWord.preload = 'none';
      dummyAudioForMissingWord.style.display = 'none'; // 隱藏假音檔
      audioElementsList.push(dummyAudioForMissingWord); // 收集假音檔
    } else {
      // 詞彙音檔存在或無特定缺失資訊，照常建立
      const audio1 = document.createElement('audio');
      audio1.className = 'media';
      audio1.controls = true;
      audio1.preload = 'none';
      const source1 = document.createElement('source');
      let wordAudioSrc = `https://elearning.hakka.gov.tw/hakka/files/cert/vocabulary/${mediaYr}/${詞目錄}-${no[0]}-${mediaNo}.mp3`;
      // 特定 URL 覆蓋 (例如 海陸中高級 4-261 的詞彙音檔有替代來源)
      if (dialectInfo.fullLvlName === '海陸中高級' && line.編號 === '4-261') {
        wordAudioSrc =
          'https://elearning.hakka.gov.tw/hakka/files/dictionaries/3/hk0000014571/hk0000014571-1-2.mp3';
        console.log(
          `[main.js OVERRIDE] Using special URL for 海陸中高級 4-261 詞彙: ${wordAudioSrc}`
        );
      }
      source1.src = wordAudioSrc;
      source1.type = 'audio/mpeg';
      audio1.appendChild(source1);
      td2.appendChild(audio1);
      audioElementsList.push(audio1); // 收集音檔
    }
    // --- 詞彙音檔處理結束 ---

    td2.appendChild(document.createElement('br'));
    const meaningText = document.createTextNode(
      line.華語詞義.replace(/"/g, '')
    );
    td2.appendChild(meaningText);
    if (line.備註 && line.備註.trim() !== '') {
      const notesP = document.createElement('p');
      notesP.className = 'notes';
      notesP.textContent = `（${line.備註}）`;
      td2.appendChild(notesP);
    } // 不需要 else 隱藏的 p
    item.appendChild(td2);

    // TD3: 例句、音檔、翻譯
    const td3 = document.createElement('td');
    td3.dataset.label = '例句'; // <-- 加入 data-label

    const hasExampleSentenceText = line.例句 && line.例句.trim() !== '';

    if (hasExampleSentenceText) {
      const sentenceSpan = document.createElement('span');
      sentenceSpan.className = 'sentence';
      sentenceSpan.innerHTML = line.例句
        .replace(/"/g, '')
        .replace(/\n/g, '<br>');
      td3.appendChild(sentenceSpan);
      td3.appendChild(document.createElement('br'));

      // --- 修改：處理例句音檔 (audio2) ---
      let sentenceAudioActuallyMissing = false;
      // 檢查 NAmedias.js 是否標記例句音檔缺失 (且非 'na')
      if (missingAudioInfo && missingAudioInfo.sentence === false) {
        sentenceAudioActuallyMissing = true;
      }

      if (dialectInfo.級名 === '高級') {
        // 「高級」級別：就算有例句文字，也加入一個跳過的假音檔
        const dummyAudioForAdvanced = document.createElement('audio');
        dummyAudioForAdvanced.className = 'media';
        dummyAudioForAdvanced.dataset.skip = 'true';
        dummyAudioForAdvanced.controls = false;
        dummyAudioForAdvanced.preload = 'none';
        dummyAudioForAdvanced.style.display = 'none';
        td3.appendChild(dummyAudioForAdvanced);
        audioElementsList.push(dummyAudioForAdvanced); // 收集假音檔
      } else if (sentenceAudioActuallyMissing) {
        // 非「高級」，但 NAmedias.js 指出例句音檔缺失
        const noSentenceAudioMsg = document.createElement('span');
        noSentenceAudioMsg.textContent = '（無例句音檔，敗勢）';
        noSentenceAudioMsg.style.color = 'magenta'; // 用洋紅色標示例句音檔缺失
        td3.appendChild(noSentenceAudioMsg);

        const dummyAudioForMissingSentence = document.createElement('audio');
        dummyAudioForMissingSentence.className = 'media';
        dummyAudioForMissingSentence.dataset.skip = 'true';
        dummyAudioForMissingSentence.controls = false;
        dummyAudioForMissingSentence.preload = 'none';
        dummyAudioForMissingSentence.style.display = 'none';
        td3.appendChild(dummyAudioForMissingSentence);
        audioElementsList.push(dummyAudioForMissingSentence); // 收集假音檔
      } else {
        // 非「高級」級別，且音檔應存在 (或無特定缺失資訊)：加入實際个 audio2
        const audio2 = document.createElement('audio');
        audio2.className = 'media';
        audio2.controls = true;
        audio2.preload = 'none';
        const source2 = document.createElement('source');
        source2.src = `https://elearning.hakka.gov.tw/hakka/files/cert/vocabulary/${mediaYr}/${句目錄}-${no[0]}-${mediaNo}s.mp3`;
        source2.type = 'audio/mpeg';
        audio2.appendChild(source2);
        td3.appendChild(audio2);
        audioElementsList.push(audio2); // 收集音檔
      }
      // --- 例句音檔處理結束 ---

      td3.appendChild(document.createElement('br'));
      const translationText = document.createElement('span');
      translationText.innerHTML = line.翻譯
        .replace(/"/g, '')
        .replace(/\n/g, '<br>');
      td3.appendChild(translationText);
    } else {
      // 無例句文本：加入一個跳過的假音檔
      const dummyAudioNoSentence = document.createElement('audio');
      dummyAudioNoSentence.className = 'media';
      dummyAudioNoSentence.dataset.skip = 'true';
      dummyAudioNoSentence.controls = false;
      dummyAudioNoSentence.preload = 'none';
      dummyAudioNoSentence.style.display = 'none'; // 確保隱藏
      td3.appendChild(dummyAudioNoSentence);
      audioElementsList.push(dummyAudioNoSentence); // 收集假音檔，保持索引一致
    }
    item.appendChild(td3);

    table.appendChild(item);
  } // --- for loop 結束 ---

  table.setAttribute('width', '100%');
  contentContainer.appendChild(table);

  // 執行標示大埔變調 (如果需要)
  if (dialectInfo.腔 === '大') {
    大埔高降異化();
    大埔中遇低升();
    大埔低升異化();
  }

  console.log('Table generated, calling handleResizeActions initially.'); // 加一條 log
  // 產生表格後黏時先做一擺調整 ruby 字體大細
  // 使用 setTimeout 確保 DOM 渲染完成後再執行，以便獲取正確的元素尺寸
  setTimeout(() => handleResizeActions(), 50); // 延遲 50 毫秒，分瀏覽器時間處理版面

  // --- 並將其包裝以便重複使用和觸發 ---

  const audioElements = audioElementsList; // 使用收集到的元素 (保持局部，因為每個類別不同)
  const bookmarkButtons = bookmarkButtonsList; // 使用收集到的按鈕 (保持局部)

  // --- 播放控制相關函式 (playAudio, handleAudioEnded, addNowPlaying, removeNowPlaying) ---
  // --- 這些函式現在定義在 buildTableAndSetupPlayback 內部或可以訪問其變數 ---
  function addNowPlaying(element) {
    removeNowPlaying();
    element.id = 'nowPlaying';
    element.classList.remove('paused-playback'); // <--- 在這搭加這行，確保開始播放時毋會有暫停樣式
  }
  function removeNowPlaying() {
    const nowPlaying = document.getElementById('nowPlaying');
    if (nowPlaying) {
      nowPlaying.removeAttribute('id');
    }
  }
  // --- 抽離出播放結束音效和重置狀態的邏輯 ---
  function playEndOfPlayback() {
    const endAudio = new Audio('endOfPlay.mp3');
    endAudio.play().catch((e) => console.error('播放結束音效失敗:', e));
    currentAudioIndex = 0;
    isPlaying = false;
    isPaused = false;
    currentAudio = null;
    const pauseResumeButton = document.getElementById('pauseResumeBtn'); // 需要重新獲取按鈕引用
    const stopButton = document.getElementById('stopBtn'); // 需要重新獲取按鈕引用
    if (pauseResumeButton)
      pauseResumeButton.innerHTML = '<i class="fas fa-pause"></i>';
    if (pauseResumeButton) pauseResumeButton.classList.remove('ongoing');
    if (pauseResumeButton) pauseResumeButton.classList.add('ended');
    if (stopButton) stopButton.classList.remove('ongoing');
    if (stopButton) stopButton.classList.add('ended');
    document.querySelectorAll('.playFromThisRow').forEach((element) => {
      element.classList.remove('ongoing');
      element.classList.add('playable');
    });
    removeNowPlaying();
    isCrossCategoryPlaying = false; // 確保標記被重設
    // --- 新增：播放結束時也清除書籤暫存 ---
    finishedTableName = null;
    finishedCat = null;
    // --- 新增結束 ---
  }
  // --- 抽離結束 ---

  function playAudio(index) {
    // --- 新增：播放狀態保護 ---
    // 若 isPlaying 係 false (例如使用者已經按下停止鈕)，就直接結束函式，毋使做任何播放動作。
    // 這做得防止在狀態快速變化時 (例如連續跳過音檔時按下停止)，意外重新開始播放。
    if (!isPlaying) {
      console.warn(
        `playAudio(${index}) 被呼叫，但 isPlaying 係 false。中止播放程序。`
      );
      return;
    }
    // --- 新增結束 ---

    // 獲取類別列表和目前索引，並將其設為 currentCategoryIndex
    const radioButtons = document.querySelectorAll('input[name="category"]');
    categoryList = Array.from(radioButtons).map((radio) => radio.value);
    const checkedRadio = document.querySelector(
      'input[name="category"]:checked'
    );
    currentCategoryIndex = checkedRadio
      ? categoryList.indexOf(checkedRadio.value)
      : -1;
    console.log(
      'Current categories (inside playAudio):',
      categoryList,
      'Current index:',
      currentCategoryIndex
    );

    // 獲取當前類別的 audioElements (因為 audioElements 是 buildTableAndSetupPlayback 的局部變數)
    const currentCategoryAudioElements = audioElementsList; // 使用 buildTableAndSetupPlayback 內部的 audioElementsList

    if (index >= currentCategoryAudioElements.length) {
      console.log(
        'Reached end of category. Current index:',
        currentCategoryIndex,
        'Total categories:',
        categoryList.length
      );
      const nextCategoryIndex = currentCategoryIndex + 1;
      if (nextCategoryIndex < categoryList.length) {
        const nextCategoryValue = categoryList[nextCategoryIndex];
        const nextRadioButton = document.querySelector(
          `input[name="category"][value="${nextCategoryValue}"]`
        );
        if (nextRadioButton) {
          console.log(`Switching to next category: ${nextCategoryValue}`);
          console.log(
            `Storing finished category: ${dialectInfo.fullLvlName} - ${category}`
          ); // Debug
          finishedTableName = dialectInfo.fullLvlName; // 儲存剛完成的表格名稱
          finishedCat = category; // 儲存剛完成的類別
          isCrossCategoryPlaying = true; // 設定標記
          // 確保停止目前的播放狀態視覺效果
          const stopButton = document.getElementById('stopBtn'); // 獲取停止按鈕
          if (stopButton && isPlaying) {
            // 只有在播放中才需要點擊停止
            console.log(
              'Stopping current playback before switching category...'
            );
            stopButton.click(); // 模擬點擊停止按鈕來清理狀態
          }
          // 使用 setTimeout 確保狀態清理完成
          setTimeout(() => {
            console.log('Clicking next radio button...');
            nextRadioButton.click(); // 觸發切換類別
          }, 50); // 短暫延遲
        } else {
          console.error(
            `Could not find radio button for next category: ${nextCategoryValue}`
          );
          // 找不到下一個類別按鈕，執行停止邏輯
          playEndOfPlayback();
        }
      } else {
        console.log('Reached end of all categories.');
        // 已經是最後一個類別，執行停止邏輯
        playEndOfPlayback();
      }
      return; // 無論如何都返回，避免執行後續的播放邏輯
    }

    // 使用當前類別的音檔列表
    currentAudio = currentCategoryAudioElements[index];
    const sourceUrlForErrorLog = currentAudio.src; // 在 play 前擷取 src，避免 currentAudio 之後變 null

    if (currentAudio.dataset.skip === 'true') {
      console.log('Skipping audio index:', index);
      currentAudioIndex++;
      playAudio(currentAudioIndex);
      return;
    }

    currentAudio
      .play()
      .then(() => {
        // 播放成功
        console.log('Playing audio index:', index, currentAudio.src);
        currentAudio.removeEventListener('ended', handleAudioEnded); // Ensure no duplicates
        currentAudio.addEventListener('ended', handleAudioEnded, {
          once: true,
        });

        isPlaying = true; // 確保成功播放時設定狀態
        isPaused = false;
        const pauseResumeButton = document.getElementById('pauseResumeBtn');
        if (pauseResumeButton) {
          pauseResumeButton.innerHTML = '<i class="fas fa-pause"></i>';
          pauseResumeButton.classList.remove('ended');
          pauseResumeButton.classList.add('ongoing');
        }

        // 尋找 audio 元素个父層 tr 同 td
        const rowElement = currentAudio.closest('tr');
        const audioTd = currentAudio.closest('td'); // <--- 尋包含 audio 个 td

        if (rowElement) {
          addNowPlaying(rowElement); // 樣式還係加在 tr 項
        }

        if (audioTd) {
          // <--- 改成檢查 audioTd
          console.log('Scrolling to audio TD:', audioTd); // 加 log 方便除錯
          // 對尋著个 td 執行 scrollIntoView
          audioTd.scrollIntoView({
            behavior: 'smooth',
            block: 'center', // 試看啊用 'center' 或者 'nearest'
            inline: 'nearest', // 確保水平方向也盡量滾入畫面
          });

          // --- *** 新增：播放成功後，在這裡儲存書籤 *** ---
          // Roo: 這邊个 category 變數來自 buildTableAndSetupPlayback 个參數
          // Roo: 這邊个 dialectInfo 變數也來自 buildTableAndSetupPlayback 个參數
          // Roo: 這邊个 bookmarkButtonsList 變數也來自 buildTableAndSetupPlayback 內部个宣告
          const rowButton = currentAudio.closest('tr')?.querySelector('button[data-row-id]');
          if (rowButton) {
            const rowId = rowButton.dataset.rowId;
            let rowNum = rowId.replace(/^0+/, '');
            let totalRowsInCurrentCategory = bookmarkButtonsList.length;
            let percentage = (rowNum / totalRowsInCurrentCategory) * 100;
            let percentageFixed = percentage.toFixed(2);

            saveBookmark(
              rowId,
              percentageFixed,
              category, // 這就係 currentCategoryForBookmark
              dialectInfo.fullLvlName // 這就係 currentTableNameForBookmark
            );
            console.log(`播放成功，儲存書籤至列表：${rowId} (來自 playAudio)`);
          } else {
            console.warn('無法找到對應的 rowButton 來儲存書籤 (來自 playAudio)');
          }
          // --- *** 書籤儲存結束 *** ---

        } else if (rowElement) {
          // 萬一尋無 td (理論上毋會)，退回捲動 tr
          console.warn('Could not find audio TD, falling back to scroll TR.');
          rowElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      })
      .catch((error) => {
        // 使用先前儲存的 sourceUrlForErrorLog，避免 currentAudio 變 null 時出錯
        console.error(
          `播放音訊失敗 (索引 ${index}, src: ${sourceUrlForErrorLog}): ${error.name} - ${error.message}`,
          error
        );
        // 播放失敗，自動跳到下一個
        currentAudioIndex++;
        playAudio(currentAudioIndex);

        // 只有在 isPlaying 係 true，而且出錯个音檔確實係目前个 currentAudio 時，正繼續播放下一個
        // 這樣做得避免在使用者按下停止鈕後，舊个錯誤訊息又意外觸發新个播放
        if (isPlaying && currentAudio === currentCategoryAudioElements[index]) {
          console.log(`[main.js DEBUG] Error playing ${sourceUrlForErrorLog}. Advancing to next audio.`);
          currentAudioIndex++;
          playAudio(currentAudioIndex);
        } else {
          console.log(`[main.js DEBUG] Error playing ${sourceUrlForErrorLog}, but playback state is no longer active for this audio (isPlaying: ${isPlaying}, currentAudio.src: ${currentAudio ? currentAudio.src : 'null'}, expected index: ${index}). Not advancing from this catch.`);
        }
      });
  }
  function handleAudioEnded() {
    console.log('Audio ended index:', currentAudioIndex);
    currentAudioIndex++;
    playAudio(currentAudioIndex);
  }

  // --- 設定書籤按鈕和音檔播放的進度儲存邏輯 ---
  const currentTableNameForBookmark = dialectInfo.fullLvlName;
  const currentCategoryForBookmark = category;

  bookmarkButtons.forEach((button) => {
    button.addEventListener('click', function () {
      const rowId = this.dataset.rowId;
      let rowNum = rowId.replace(/^0+/, '');
      // 確保 bookmarkButtonsList 在這裡可用，或者傳遞總行數
      let totalRows = bookmarkButtonsList.length; // 假設 bookmarkButtonsList 包含所有按鈕
      let percentage = (rowNum / totalRows) * 100;
      let percentageFixed = percentage.toFixed(2);

      // --- 修改開始 ---
      // 呼叫新的儲存函式
      saveBookmark(
        rowId,
        percentageFixed,
        currentCategoryForBookmark,
        currentTableNameForBookmark
      );
      // --- 修改結束 ---

      console.log(`書籤 ${rowId} 已儲存至列表`); // 可以保留這個 log
    });
  });

  // --- Roo: 拿忒對 audioElements 加个 'play' 事件監聽器，該隻監聽器會呼叫 saveBookmark ---
  // --- 改由 playAudio 函式內部，在音檔成功播放後正儲存書籤 ---

  // --- 修改：尋找或建立 Header 內的播放控制按鈕 ---
  let audioControlsDiv = header.querySelector('#audioControls');
  let playAllButton, pauseResumeButton, stopButton;

  if (!audioControlsDiv) {
    console.log('Creating #audioControls span inside #header');
    // 如果 #audioControls 不在 header 內，則建立它
    audioControlsDiv = document.createElement('span');
    audioControlsDiv.id = 'audioControls';

    // 建立按鈕
    playAllButton = document.createElement('button');
    playAllButton.id = 'playAllBtn';
    playAllButton.title = '依序播放';
    playAllButton.innerHTML = '<i class="fas fa-play"></i>';
    playAllButton.style.display = 'none'; // 保持隱藏 playAll

    pauseResumeButton = document.createElement('button');
    pauseResumeButton.id = 'pauseResumeBtn';
    pauseResumeButton.title = '暫停/繼續';
    pauseResumeButton.innerHTML = '<i class="fas fa-pause"></i>'; // 初始狀態

    stopButton = document.createElement('button');
    stopButton.id = 'stopBtn';
    stopButton.title = '停止';
    stopButton.innerHTML = '<i class="fas fa-stop"></i>'; // 初始狀態

    // 將按鈕加入 #audioControls span
    audioControlsDiv.appendChild(playAllButton);
    audioControlsDiv.appendChild(pauseResumeButton);
    audioControlsDiv.appendChild(stopButton);

    // 將 #audioControls span 加入 header
    header.appendChild(audioControlsDiv);
  } else {
    console.log('Found existing #audioControls span inside #header');
    // 如果 #audioControls 已存在，直接找到裡面的按鈕
    playAllButton = audioControlsDiv.querySelector('#playAllBtn');
    pauseResumeButton = audioControlsDiv.querySelector('#pauseResumeBtn');
    stopButton = audioControlsDiv.querySelector('#stopBtn');

    // 可選的健壯性檢查：如果 span 存在但按鈕丟失了，重新創建它們
    if (!pauseResumeButton || !stopButton /* || !playAllButton */) {
      console.warn(
        '#audioControls span exists, but buttons missing. Recreating buttons.'
      );
      audioControlsDiv.innerHTML = ''; // 清空舊內容
      // 重新創建按鈕 (程式碼同上 if 區塊)
      playAllButton = document.createElement('button'); /*...*/
      pauseResumeButton = document.createElement('button'); /*...*/
      stopButton = document.createElement('button'); /*...*/
      playAllButton.style.display = 'none';
      audioControlsDiv.appendChild(playAllButton);
      audioControlsDiv.appendChild(pauseResumeButton);
      audioControlsDiv.appendChild(stopButton);
      // 重新獲取按鈕引用
      playAllButton = audioControlsDiv.querySelector('#playAllBtn');
      pauseResumeButton = audioControlsDiv.querySelector('#pauseResumeBtn');
      stopButton = audioControlsDiv.querySelector('#stopBtn');
    }
  }
  // --- 修改結束 ---

  // --- 綁定事件到按鈕 (使用 onclick 覆蓋舊監聽器) ---
  // 確保按鈕變數在此處是有效的
  if (pauseResumeButton) {
    pauseResumeButton.onclick = function () {
      // 使用 onclick 覆蓋舊監聽器
      const nowPlayingRow = document.getElementById('nowPlaying'); // <--- 取得目前播放列

      if (isPlaying) {
        if (isPaused) {
          currentAudio?.play().catch((e) => console.error('恢復播放失敗:', e));
          isPaused = false;
          this.innerHTML = '<i class="fas fa-pause"></i>';
          this.classList.add('ongoing');
          this.classList.remove('ended');
          if (nowPlayingRow) nowPlayingRow.classList.remove('paused-playback'); // <--- 拿掉暫停 class

          // **** ↓↓↓ 在這搭仔加入捲動程式碼 ↓↓↓ ****
          console.log(
            'Resuming playback, attempting to scroll to current audio TD.'
          );
          // 直接對 currentAudio 尋佢个 td
          const audioTd = currentAudio?.closest('td');
          if (audioTd) {
            console.log('Resuming playback, scrolling to current audio TD.');
            audioTd.scrollIntoView({
              behavior: 'smooth',
              block: 'center', // 或者 'nearest'
              inline: 'nearest',
            });
          } else {
            // 萬一尋無 audioTd，試看啊捲動 tr 做備用
            const nowPlayingElement = document.getElementById('nowPlaying');
            if (nowPlayingElement) {
              console.warn(
                'Resume scroll: Could not find audio TD, falling back to scroll TR (#nowPlaying).'
              );
              nowPlayingElement.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
              });
            } else {
              console.warn(
                'Resume scroll: Could not find parent TD for current audio or #nowPlaying TR.'
              );
            }
          }
          // **** ↑↑↑ 加入煞 ↑↑↑ ****
        } else {
          currentAudio?.pause();
          isPaused = true;
          this.innerHTML = '<i class="fas fa-play"></i>';
          this.classList.remove('ongoing');
          this.classList.add('ended'); // Or a specific paused style
          if (nowPlayingRow) nowPlayingRow.classList.add('paused-playback'); // <--- 加入暫停 class
        }
      }
    };
  } else {
    console.error('pauseResumeButton not found for binding');
  }

  if (stopButton) {
    stopButton.onclick = function () {
      // 使用 onclick 覆蓋舊監聽器
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
        if (pauseResumeButton)
          pauseResumeButton.innerHTML = '<i class="fas fa-pause"></i>';
        if (pauseResumeButton) pauseResumeButton.classList.remove('ongoing');
        pauseResumeButton.classList.add('ended');
        this.classList.remove('ongoing');
        this.classList.add('ended');
        document.querySelectorAll('.playFromThisRow').forEach((element) => {
          element.classList.remove('ongoing');
          element.classList.add('playable');
        });
        removeNowPlaying();
        // --- 新增：手動停止時也清除書籤暫存 ---
        // --- 新增結束 ---
        // Roo: 拿掉這兩行，因為跨類別播放時，stopButton.click() 會意外清除掉要傳遞給下一個 buildTableAndSetupPlayback 的資訊。
        //      這些變數會在 buildTableAndSetupPlayback 內部使用後清除，或在 playEndOfPlayback/startPlayingFromRow 時清除。
      }
    };
  } else {
    console.error('stopButton not found for binding');
  }

  // 設定 "Play From Row" 按鈕的事件
  const playFromRowButtons = document.querySelectorAll('.playFromThisRow');
  playFromRowButtons.forEach((button) => {
    button.onclick = function () {
      // 使用 onclick 覆蓋舊監聽器
      if (isPlaying) {
        // 如果正在播放，先停止
        if (stopButton) stopButton.click();
        // 使用 timeout 確保停止完成後再開始新的播放
        setTimeout(() => {
          startPlayingFromRow(this);
        }, 100);
      } else {
        startPlayingFromRow(this);
      }
    };
  });

  // 抽離出的啟動播放邏輯
  function startPlayingFromRow(buttonElement) {
    isCrossCategoryPlaying = false; // User initiated playback, disable cross-category mode
    // --- 新增：手動開始播放時清除書籤暫存 ---
    finishedTableName = null;
    finishedCat = null;
    // --- 新增結束 ---
    currentAudioIndex = parseInt(buttonElement.dataset.index);
    console.log('Starting playback from index:', currentAudioIndex); // 增加日誌
    isPlaying = true;
    isPaused = false;
    playAudio(currentAudioIndex); // 開始播放
    // 更新按鈕狀態
    if (pauseResumeButton)
      pauseResumeButton.innerHTML = '<i class="fas fa-pause"></i>';
    if (pauseResumeButton) {
      pauseResumeButton.classList.remove('ended');
      pauseResumeButton.classList.add('ongoing');
    }
    if (stopButton) {
      stopButton.classList.remove('ended');
      stopButton.classList.add('ongoing');
    }
    playFromRowButtons.forEach((element) => {
      element.classList.add('ongoing');
    }); // 所有播放按鈕變色
  }

  // --- 新增：處理自動捲動和自動播放 ---
  if (autoPlayTargetRowId) {
    console.log('Attempting to auto-scroll and play row:', autoPlayTargetRowId); // 增加日誌
    const targetAnchor = document.querySelector(
      `a[name="${autoPlayTargetRowId}"]`
    );
    if (targetAnchor) {
      const targetRow = targetAnchor.closest('tr');
      if (targetRow) {
        console.log('Found target row for auto-play'); // 增加日誌

        // --- 修改：無論如何都嘗試產生連結 ---
        if (progressDetailsSpan) {
          // 嘗試從 localStorage 找對應的書籤以取得百分比
          const bookmarks =
            JSON.parse(localStorage.getItem('hakkaBookmarks')) || [];
          const loadedBookmark = bookmarks.find(
            (bm) =>
              bm.tableName === dialectInfo.fullLvlName &&
              bm.cat === category &&
              bm.rowId === autoPlayTargetRowId
          );

          // 產生分享連結
          const dialectLevelCodes = extractDialectLevelCodes(
            dialectInfo.fullLvlName
          ); // 使用 dialectInfo
          if (dialectLevelCodes) {
            // --- 修改 baseURL 計算方式 ---
            let baseURL = '';
            if (window.location.protocol === 'file:') {
              baseURL = window.location.href.substring(
                0,
                window.location.href.lastIndexOf('/') + 1
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
            console.log('Calculated baseURL (on load):', baseURL); // 增加日誌檢查 baseURL
            // --- 修改結束 ---
            const encodedCategory = encodeURIComponent(category);
            const shareURL = `${baseURL}index.html?dialect=${dialectLevelCodes.dialect}&level=${dialectLevelCodes.level}&category=${encodedCategory}&row=${autoPlayTargetRowId}`;

            // 決定連結文字
            const linkText = loadedBookmark
              ? `#${loadedBookmark.rowId} (${loadedBookmark.percentage}%)`
              : `#${autoPlayTargetRowId}`;

            // 建立連結元素
            const linkElement = document.createElement('a');
            linkElement.href = shareURL;
            linkElement.textContent = linkText;
            // linkElement.target = '_blank'; // 可選：在新分頁開啟
            // linkElement.rel = 'noopener noreferrer'; // 安全性考量
            linkElement.style.marginLeft = '5px'; // 加點間距

            // 清空 span 並加入連結
            progressDetailsSpan.innerHTML = '';
            progressDetailsSpan.appendChild(linkElement);
            console.log(
              'Progress details updated with shareable link on load.'
            );
          } else {
            // 如果無法產生連結，只顯示文字 (備用情況)
            const textContent = loadedBookmark
              ? `#${loadedBookmark.rowId} (${loadedBookmark.percentage}%)`
              : `#${autoPlayTargetRowId}`;
            progressDetailsSpan.textContent = textContent;
            console.error(
              '無法從 tableName 解析腔調和級別代碼:',
              dialectInfo.fullLvlName
            );
          }
        }
        // --- 修改結束 ---
        
        // --- *** iOS 自動播放處理修改 *** ---
        const isRunningOnIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

        if (isRunningOnIOS && loadedViaUrlParams) { // 只在透過 URL 載入時才觸發 iOS 特殊處理
          console.log('iOS detected (via URL): Scrolling to target row and adding instruction, NO autoplay.');

          // 1. 捲動到目標行
          //   (可以考慮捲動到包含播放按鈕的 TD，讓按鈕更顯眼)
          const playButtonTd = targetRow.querySelector('td.no'); // 假設播放按鈕在第一格
          if (playButtonTd) {
              playButtonTd.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
          } else {
              targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' }); // 備用
          }

          // 2. 插入提示訊息
          //    先檢查係無係既經有提示訊息在該列頭前，避免重複插入
          const existingInstruction = targetRow.previousElementSibling;
          if (!existingInstruction || !existingInstruction.classList.contains('ios-autoplay-instruction')) {
              const instructionRow = document.createElement('tr');
              instructionRow.className = 'ios-autoplay-instruction'; // 加 class 好用 CSS 控制樣式
              const instructionCell = document.createElement('td');
              instructionCell.colSpan = 3; // 跨越所有欄位
              instructionCell.style.textAlign = 'center';
              instructionCell.style.padding = '8px 0';
              // 改用客家話个提示
              instructionCell.innerHTML = '<strong style="color: #007bff;">👇 請點右片个 ▶️ 按鈕來開始播放。</strong>';
              instructionRow.appendChild(instructionCell);
              targetRow.parentNode.insertBefore(instructionRow, targetRow); // 插入在目標列頭前
          } else {
               console.log('Instruction message already exists for this row.');
          }

          // 3. **毋執行**自動播放个 click()

        } else {
          console.log('Not iOS or not loaded via URL: Proceeding with standard autoplay attempt.');
          // 非 iOS 或非 URL 載入：維持原本个邏輯，捲動並觸發播放
          // 捲動到目標行 (playAudio 內部會做，但係為著視覺效果，先捲一次)
          targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });

          // 找到該行的播放按鈕
          const playButton = targetRow.querySelector(
            `.playFromThisRow[data-row-id="${autoPlayTargetRowId}"]`
          );
          if (playButton) {
            console.log('Found play button for auto-play'); // 增加日誌
            // 先停止當前可能正在播放的內容
            if (stopButton && isPlaying) {
              console.log('Stopping existing playback before auto-play...'); // 增加日誌
              stopButton.click();
            }
            // 使用 setTimeout 確保停止動作完成，以及捲動動畫有時間開始
            setTimeout(() => {
              console.log('Triggering click on play button for auto-play'); // 增加日誌
              playButton.click(); // 觸發點擊事件，開始播放
            }, 300); // 稍微加長延遲，確保捲動和停止完成
          } else {
            console.warn('找不到目標行的播放按鈕:', autoPlayTargetRowId);
          }
        }
        // --- *** iOS 處理修改結束 *** ---

      }
    } else {
      console.warn('找不到要滾動到的目標行錨點:', autoPlayTargetRowId);
      // --- 新增：如果找不到目標行，也清除進度詳情 ---
      if (progressDetailsSpan) {
        progressDetailsSpan.textContent = ''; // 清除文字
      }
      // --- 新增結束 ---
    }
  } else {
    // --- 如果不是自動播放 (例如只是切換分類)，清除進度詳情 ---
    // --- *** 修改：只有在非跨類別播放時才清除詳情 *** ---
    if (!isCrossCategoryPlaying && progressDetailsSpan) {
      progressDetailsSpan.textContent = ''; // 清除文字
    }
    // --- *** 修改結束 *** ---

    // --- 新增：處理跨類別連續播放 ---
    if (isCrossCategoryPlaying) {
      console.log('Cross-category playback flag is true.');
      // --- 書籤替換邏輯 ---
      if (finishedTableName && finishedCat) {
        console.log(
          `Attempting to replace bookmark for finished category: ${finishedTableName} - ${finishedCat}`
        );
        let bookmarks =
          JSON.parse(localStorage.getItem('hakkaBookmarks')) || [];
        // --- Debugging Log Start (Moved Before findIndex) ---
        console.log('Bookmarks currently in localStorage:', JSON.stringify(bookmarks, null, 2)); // 印出所有書籤
        console.log(`Searching for: tableName=[${finishedTableName}], cat=[${finishedCat}]`); // 印出搜尋目標
        // --- Debugging Log End ---
        const previousBookmarkIndex = bookmarks.findIndex(
          (bm) => bm.tableName === finishedTableName && bm.cat === finishedCat
        );
        if (previousBookmarkIndex > -1) {
          console.log(
            `Found finished bookmark at index ${previousBookmarkIndex}. Removing it.`
          );
          bookmarks.splice(previousBookmarkIndex, 1);
          localStorage.setItem('hakkaBookmarks', JSON.stringify(bookmarks));
          // 更新下拉選單以反映移除 (雖然 saveBookmark 等下會再更新一次)
          updateProgressDropdown();
        } else {
          console.log(
            `Could not find bookmark for finished category: ${finishedTableName} - ${finishedCat}`
          );
        }
        // 清除暫存變數
        finishedTableName = null;
        finishedCat = null;
      } else {
        console.log(
          'No finished category info found for bookmark replacement.'
        );
      }
      // --- 書籤替換邏輯結束 ---

      console.log('Starting playback from beginning of the new category.');
      const firstPlayButton =
        contentContainer.querySelector('.playFromThisRow'); // 找新建立表格的第一個播放按鈕
      if (firstPlayButton) {
        // 使用 setTimeout 確保 DOM 更新完成
        setTimeout(() => {
          console.log(
            'Triggering playback for the first item of the new category.'
          );
          startPlayingFromRow(firstPlayButton); // 自動播放第一個
        }, 100); // 短暫延遲
      } else {
        console.warn(
          'Could not find the first play button for cross-category playback.'
        );
        // 如果找不到第一個按鈕（理論上不該發生，因為已檢查 filteredItems.length > 0），停止播放
        playEndOfPlayback();
      }
      // isCrossCategoryPlaying = false; // 不在這裡重設，在 playEndOfPlayback 或 startPlayingFromRow 重設
    }
    // --- 新增結束 ---

    // Firefox 中 Ruby 字體大小的調整已由上方延遲呼叫的 handleResizeActions() 處理，
    // 這邊毋使再重複呼叫，避免用著無準个尺寸。
  } // --- autoPlayTargetRowId 處理結束 ---

  // --- 在函式最尾項，確保 DOM 都更新後 ---
  setTimeout(adjustHeaderFontSizeOnOverflow, 0); // 使用 setTimeout
} // --- buildTableAndSetupPlayback 函式結束 ---

/* 最頂端一開始讀取進度 */
document.addEventListener('DOMContentLoaded', function () {
  const resultsSummaryContainer = document.getElementById('results-summary');

  // --- 查詢功能 ---
  const searchContainer = document.getElementById('search-container');
  const searchInput = document.getElementById('search-input');
  const searchPopup = document.getElementById('search-popup');
  const searchDialectRadios = document.querySelectorAll('#search-popup input[name="dialect"]');
  const searchModeRadios = document.querySelectorAll('#search-popup input[name="search-mode"]');

  // 顯示查詢設定 popup
  searchInput.addEventListener('focus', () => {
    searchContainer.classList.add('active');
  });

  // 點擊頁面其他地方時隱藏 popup
  document.addEventListener('click', (event) => {
    if (!searchContainer.contains(event.target)) {
      searchContainer.classList.remove('active');
    }
  });

  function performSearch() {
    // 確保 radio button 是從 popup 內讀取
    const selectedDialect = document.querySelector('#search-popup input[name="dialect"]:checked').value;
    const searchMode = document.querySelector('#search-popup input[name="search-mode"]:checked').value;
    const keyword = searchInput.value.trim();

    if (!keyword) {
        resultsSummaryContainer.textContent = '';
        contentContainer.innerHTML = '<p style="text-align: center;">請輸入關鍵字</p>';
        return;
    }

    // 執行查詢時，隱藏 popup
    searchContainer.classList.remove('active');
    searchInput.blur(); // 讓輸入框失去焦點

    const dialectData = allData[selectedDialect];
    let combinedData = [];
    dialectData.forEach(level => {
        if (level && level.content) {
            const levelData = csvToArray(level.content);
            levelData.forEach(item => {
                item.sourceName = level.name; // e.g., '四基'
            });
            combinedData = combinedData.concat(levelData);
        }
    });

    const results = combinedData.filter(item => {
        if (item && item[searchMode]) {
            return item[searchMode].toLowerCase().includes(keyword.toLowerCase());
        }
        return false;
    });
    
    resultsSummaryContainer.textContent = `尋著 ${results.length} 筆結果`;
    displayQueryResults(results, keyword, searchMode);
  }

  function displayQueryResults(results, keyword, searchMode) {
      const contentContainer = document.getElementById('generated');
      contentContainer.innerHTML = ''; // Clear previous content
      header?.querySelector('#audioControls')?.remove(); // 顯示查詢結果前，先移除播放控制

      if (results.length === 0) {
          return; // Summary is already set
      }

      const table = document.createElement('table');
      table.setAttribute('width', '100%');

      const highlightRegex = new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig');

      results.forEach(line => {
          if (!line || !line.編號) return;

          const sourceName = line.sourceName;
          let 腔 = sourceName.substring(0, 1);
          let 級 = sourceName.substring(1);

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

          const generalMediaYr = '112';
          var 目錄級, 目錄另級, 檔腔, 檔級 = '';

          switch (腔) {
              case '四': 檔腔 = 'si'; break;
              case '海': 檔腔 = 'ha'; break;
              case '大': 檔腔 = 'da'; break;
              case '平': 檔腔 = 'rh'; break;
              case '安': 檔腔 = 'zh'; break;
          }
          switch (級) {
              case '基': 目錄級 = '5'; 目錄另級 = '1'; break;
              case '初': 目錄級 = '1'; break;
              case '中': 目錄級 = '2'; 檔級 = '1'; break;
              case '中高': 目錄級 = '3'; 檔級 = '2'; break;
              case '高': 目錄級 = '4'; 檔級 = '3'; break;
          }
          const fullLvlName = getFullLevelName(sourceName);
          const category = line.分類;

          const missingAudioInfo = typeof getMissingAudioInfo === 'function' ?
              getMissingAudioInfo(fullLvlName, category, line.編號) : null;

          let mediaYr = generalMediaYr;
          let pre112Insertion詞 = '';
          let pre112Insertion句 = '';
          let 詞目錄級 = 目錄級;
          let 句目錄級 = 目錄級;
          let mediaNo = '';

          var no = line.編號.split('-');
          if (no[0] <= 9) no[0] = '0' + no[0];
          if (級 === '初') no[0] = '0' + no[0];
          if (no[1] <= 9) no[1] = '0' + no[1];
          if (no[1] <= 99) no[1] = '0' + no[1];
          mediaNo = no[1];

          const index = 例外音檔.findIndex(([編號]) => 編號 === line.編號);
          if (index !== -1) {
              const matchedElement = 例外音檔[index];
              mediaYr = matchedElement[1];
              mediaNo = matchedElement[2];
              pre112Insertion詞 = 'w/';
              pre112Insertion句 = 's/';
              if (目錄另級 !== undefined) {
                  詞目錄級 = 目錄另級;
                  句目錄級 = 目錄另級;
              }
          }

          const 詞目錄 = `${詞目錄級}/${檔腔}/${pre112Insertion詞}${檔級}${檔腔}`;
          const 句目錄 = `${句目錄級}/${檔腔}/${pre112Insertion句}${檔級}${檔腔}`;

          var item = document.createElement('tr');
          item.dataset.source = fullLvlName;

          const td1 = document.createElement('td');
          td1.className = 'no';
          td1.dataset.label = '編號';
          const noText = document.createTextNode(line.編號 + '\u00A0');
          td1.appendChild(noText);
          const sourceSpan = document.createElement('span');
          sourceSpan.className = 'source-tag';
          sourceSpan.textContent = `(${fullLvlName})`;
          td1.appendChild(document.createElement('br'));
          td1.appendChild(sourceSpan);
          item.appendChild(td1);

          const td2 = document.createElement('td');
          td2.dataset.label = '詞彙';
          const ruby = document.createElement('ruby');
          ruby.innerHTML = searchMode === '客家語' ? line.客家語.replace(highlightRegex, '<mark>$1</mark>') : line.客家語;
          const rt = document.createElement('rt');
          rt.textContent = line.客語標音;
          ruby.appendChild(rt);
          td2.appendChild(ruby);
          td2.appendChild(document.createElement('br'));

          let wordAudioActuallyMissing = missingAudioInfo && missingAudioInfo.word === false;
          if (!wordAudioActuallyMissing) {
              const audio1 = document.createElement('audio');
              audio1.className = 'media';
              audio1.controls = true;
              audio1.preload = 'none';
              let wordAudioSrc = `https://elearning.hakka.gov.tw/hakka/files/cert/vocabulary/${mediaYr}/${詞目錄}-${no[0]}-${mediaNo}.mp3`;
              if (fullLvlName === '海陸中高級' && line.編號 === '4-261') {
                  wordAudioSrc = 'https://elearning.hakka.gov.tw/hakka/files/dictionaries/3/hk0000014571/hk0000014571-1-2.mp3';
              }
              audio1.src = wordAudioSrc;
              td2.appendChild(audio1);
          }

          td2.appendChild(document.createElement('br'));
          const meaningText = document.createElement('span');
          meaningText.innerHTML = searchMode === '華語詞義' ? line.華語詞義.replace(/"/g, '').replace(highlightRegex, '<mark>$1</mark>') : line.華語詞義.replace(/"/g, '');
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
          const hasExampleSentenceText = line.例句 && line.例句.trim() !== '';
          if (hasExampleSentenceText) {
              const sentenceSpan = document.createElement('span');
              sentenceSpan.className = 'sentence';
              sentenceSpan.innerHTML = (searchMode === '例句' ? line.例句.replace(highlightRegex, '<mark>$1</mark>') : line.例句).replace(/"/g, '').replace(/\n/g, '<br>');
              td3.appendChild(sentenceSpan);
              td3.appendChild(document.createElement('br'));

              let sentenceAudioActuallyMissing = (missingAudioInfo && missingAudioInfo.sentence === false) || 級 === '高';
              if (!sentenceAudioActuallyMissing) {
                  const audio2 = document.createElement('audio');
                  audio2.className = 'media';
                  audio2.controls = true;
                  audio2.preload = 'none';
                  audio2.src = `https://elearning.hakka.gov.tw/hakka/files/cert/vocabulary/${mediaYr}/${句目錄}-${no[0]}-${mediaNo}s.mp3`;
                  td3.appendChild(audio2);
              }

              td3.appendChild(document.createElement('br'));
              const translationText = document.createElement('span');
              translationText.innerHTML = (searchMode === '翻譯' ? line.翻譯.replace(highlightRegex, '<mark>$1</mark>') : line.翻譯).replace(/"/g, '').replace(/\n/g, '<br>');
              td3.appendChild(translationText);
          }
          item.appendChild(td3);

          table.appendChild(item);
      });

      contentContainer.appendChild(table);

      if (document.querySelector('#search-popup input[name="dialect"]:checked').value === '大埔') {
          if (typeof 大埔高降異化 === 'function') 大埔高降異化();
          if (typeof 大埔中遇低升 === 'function') 大埔中遇低升();
          if (typeof 大埔低升異化 === 'function') 大埔低升異化();
      }
  }

  // 當在輸入框按 Enter 時查詢
  searchInput.addEventListener('keypress', function (e) {
      if (e.key === 'Enter') {
          performSearch();
      }
  });

  // 當改變腔調或查詢模式時，如果輸入框有內容，也觸發查詢
  const triggerSearchOnChange = () => {
    if (searchInput.value.trim()) {
      performSearch();
    }
  };

  searchDialectRadios.forEach(radio => radio.addEventListener('change', triggerSearchOnChange));
  searchModeRadios.forEach(radio => radio.addEventListener('change', triggerSearchOnChange));


  // --- 檢查 URL 協定 ---
  let isFileProtocol = false;
  if (window.location.protocol === 'file:') {
    isFileProtocol = true;
    document.title = '💻 ' + document.title;
    console.log('偵測到 file:// 協定，已修改網頁標題。');
  }

  // --- 統一獲取常用元素 ---
  const progressDropdown = document.getElementById('progressDropdown');
  const progressDetailsSpan = document.getElementById('progressDetails');
  const contentContainer = document.getElementById('generated');
  const header = document.getElementById('header');
  const backToTopButton = document.getElementById('backToTopBtn');
  const autoplayModal = document.getElementById('autoplayModal');
  const modalContent = autoplayModal
    ? autoplayModal.querySelector('.modal-content')
    : null; // 處理 modal 可能不存在个情況
  const dialectLevelLinks = document.querySelectorAll('.dialect a');

  // --- 新增：選詞 Popup 相關元素 ---
  const selectionPopup = document.getElementById('selectionPopup');
  const selectionPopupBackdrop = document.getElementById('selectionPopupBackdrop');
  const selectionPopupContent = document.getElementById('selectionPopupContent');
  const selectionPopupCloseBtn = document.getElementById('selectionPopupCloseBtn');

  // --- 新增：資訊 Modal 相關元素 ---
  const infoButton = document.getElementById('infoButton');
  const infoModal = document.getElementById('infoModal');
  const infoModalCloseBtn = document.getElementById('infoModalCloseBtn');
  // const infoFrame = document.getElementById('infoFrame'); // 若 iframe src 固定，可能毋使特別操作
  // --- 新增：在 #progressDropdown 頭前加入 emoji ---
  if (isFileProtocol && progressDropdown && progressDropdown.parentNode) {
    const emojiNode = document.createTextNode('💻 ');
    progressDropdown.parentNode.insertBefore(emojiNode, progressDropdown);
    console.log('既經在 #progressDropdown 頭前加入 emoji。');
  } else if (isFileProtocol && !progressDropdown) {
    console.warn('尋毋著 #progressDropdown 還係厥爸元素，無法度加入 emoji。');
  }

  // --- 新增：處理腔別級別連結點擊 ---
  dialectLevelLinks.forEach((link) => {
    link.addEventListener('click', function (event) {
      event.preventDefault(); // 防止頁面跳轉

      // 找到包覆 <a> 的那個帶有 data-varname 的 span
      const targetSpan = this.parentElement;
      if (!targetSpan || !targetSpan.dataset.varname) {
        console.error('無法找到帶有 data-varname 的父層 span:', this);
        alert('處理點擊時發生錯誤。');
        return;
      }

      const dataVarName = targetSpan.dataset.varname; // 從正確的 span 讀取 data-varname

      if (dataVarName && typeof window[dataVarName] !== 'undefined') {
        // 1. 移除所有級別連結 span 的 active class
        //    (更精確地針對帶 data-varname 的 span 操作)
        document.querySelectorAll('span[data-varname]').forEach((span) => {
          span.classList.remove('active-dialect-level');
        });
        // 2. 為當前點擊的連結對應的 span 加上 active class
        targetSpan.classList.add('active-dialect-level');

        // 3. 清除類別選項的 active class (因為換了詞庫)
        document.querySelectorAll('.radioItem').forEach((label) => {
          label.classList.remove('active-category');
        });

        // 4. 呼叫 generate 函式
        console.log(
          `Dialect link clicked, calling generate for ${dataVarName}`
        );
        generate(window[dataVarName]);
      } else {
        // 在錯誤訊息中加入更多上下文
        console.error(
          '找不到對應的資料變數或 data-varname:',
          dataVarName,
          'on element:',
          targetSpan
        );
        alert('載入詞庫時發生錯誤。');
      }
    });
  });
  updateProgressDropdown();

  // --- 新增：在解析 URL 參數或設定初始狀態後，呼叫一次調整函式 ---
  // (放在處理 URL 參數邏輯的最後面，或是在 if/else 區塊確保執行到)
  setTimeout(adjustHeaderFontSizeOnOverflow, 0); // 使用 setTimeout 確保在 DOM 繪製後執行

  // 當捲動超過一定距離時顯示按鈕
  window.onscroll = function () {
    if (
      document.body.scrollTop > 20 ||
      document.documentElement.scrollTop > 20
    ) {
      if (backToTopButton) backToTopButton.style.display = 'block'; // Add null check
    } else {
      if (backToTopButton) backToTopButton.style.display = 'none'; // Add null check
    }
  };

  // 點擊按鈕時回到頂部
  if (backToTopButton) {
    // Add null check
    backToTopButton.addEventListener('click', function () {
      document.body.scrollTop = 0; // For Safari
      document.documentElement.scrollTop = 0; // For Chrome, Firefox, IE and Opera
    });
  }

  // --- 下拉選單選擇事件 ---
  if (progressDropdown) {
    progressDropdown.addEventListener('change', function (event) {
      const selectedValue = this.value;

      if (selectedValue && selectedValue !== '擇進前个進度') {
        const bookmarks =
          JSON.parse(localStorage.getItem('hakkaBookmarks')) || [];
        const selectedBookmark = bookmarks.find(
          (bm) => bm.tableName + '||' + bm.cat === selectedValue
        );

        if (selectedBookmark) {
          console.log(
            'Dropdown selected (value):',
            selectedValue,
            'Bookmark:',
            selectedBookmark
          );
          const targetTableName = selectedBookmark.tableName;
          const targetCategory = selectedBookmark.cat;
          const targetRowIdToGo = selectedBookmark.rowId;
          const dataVarName = mapTableNameToDataVar(targetTableName);

          if (dataVarName && typeof window[dataVarName] !== 'undefined') {
            const dataObject = window[dataVarName];
            console.log(
              `Calling generate from dropdown for ${dataVarName}, category: ${targetCategory}, row: ${targetRowIdToGo}`
            );
            generate(dataObject, targetCategory, targetRowIdToGo);

            // --- 更新進度詳情為連結 ---
            if (progressDetailsSpan) {
              const dialectLevelCodes =
                extractDialectLevelCodes(targetTableName);
              if (dialectLevelCodes) {
                let baseURL = '';
                if (window.location.protocol === 'file:') {
                  baseURL = window.location.href.substring(
                    0,
                    window.location.href.lastIndexOf('/') + 1
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
                const encodedCategory = encodeURIComponent(targetCategory);
                const shareURL = `${baseURL}index.html?dialect=${dialectLevelCodes.dialect}&level=${dialectLevelCodes.level}&category=${encodedCategory}&row=${targetRowIdToGo}`;

                const linkElement = document.createElement('a');
                linkElement.href = shareURL;
                linkElement.textContent = `#${selectedBookmark.rowId} (${selectedBookmark.percentage}%)`;
                // linkElement.target = '_blank';
                // linkElement.rel = 'noopener noreferrer';
                linkElement.style.marginLeft = '5px';

                progressDetailsSpan.innerHTML = '';
                progressDetailsSpan.appendChild(linkElement);
                console.log(
                  'Progress details updated with shareable link from dropdown.'
                );
              } else {
                progressDetailsSpan.textContent = `#${selectedBookmark.rowId} (${selectedBookmark.percentage}%)`; // Fallback text
                console.error(
                  '無法從 tableName 解析腔調和級別代碼:',
                  targetTableName
                );
              }
            }
            // --- 更新結束 ---
          } else {
            console.error(
              '無法找到對應的資料變數:',
              dataVarName || targetTableName
            );
            alert('載入選定進度時發生錯誤：找不到對應的資料集。');
            if (progressDetailsSpan) progressDetailsSpan.textContent = '';
            this.selectedIndex = 0;
          }
        } else {
          console.error('找不到對應 value 的書籤:', selectedValue);
          alert('載入選定進度時發生錯誤：選項與儲存資料不符。');
          if (progressDetailsSpan) progressDetailsSpan.textContent = '';
          this.selectedIndex = 0;
        }
      } else {
        if (progressDetailsSpan) progressDetailsSpan.textContent = '';
      }
    });
  } else {
    console.error('找不到 #progressDropdown 元素');
  }

  // --- 新增：頁面載入時解析 URL 參數 ---
  const urlParams = new URLSearchParams(window.location.search);
  const dialectParam = urlParams.get('dialect');
  const levelParam = urlParams.get('level');
  const categoryParam = urlParams.get('category'); // 這是編碼過的
  const rowParam = urlParams.get('row');
  let successfullyLoadedFromUrl = false; // <--- 用這隻新變數來追蹤

  if (dialectParam && levelParam && categoryParam && rowParam) {
    console.log(
      'URL parameters detected on load:',
      dialectParam,
      levelParam,
      categoryParam,
      rowParam
    );
    loadedViaUrlParams = true; // <-- 在這裡設定旗標

    // 將 URL 參數映射回表格名稱 (例如 "da", "2" -> "大埔中級")
    let dialectName = '';
    let levelName = '';
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
      const dataVarName = mapTableNameToDataVar(targetTableName); // 取得對應的資料變數名稱，例如 '大中'

      if (dataVarName && typeof window[dataVarName] !== 'undefined') {
        const dataObject = window[dataVarName]; // 取得對應的詞彙資料物件
        const decodedCategory = decodeURIComponent(categoryParam); // **解碼 category**

        // --- 修改：顯示 Modal 而不是直接呼叫 generate ---
        const autoplayModal = document.getElementById('autoplayModal');
        // const modalBackdrop = autoplayModal.querySelector('.modal-backdrop'); // 背景現在是 #autoplayModal 本身
        const modalContent = autoplayModal.querySelector('.modal-content');

        if (autoplayModal && modalContent) {
          // 儲存需要傳遞的資訊 (或者在監聽器內重新獲取)
          // 這裡選擇在監聽器內重新獲取，避免閉包問題

          // 隱藏 Modal 並執行 generate 的函式
          const startPlayback = () => {
            console.log('Modal clicked, starting playback...');
            autoplayModal.style.display = 'none';
            // 在使用者互動後呼叫 generate
            generate(dataObject, decodedCategory, rowParam); // generate 會處理內容顯示摎播放
            successfullyLoadedFromUrl = true; // <--- 在成功呼叫 generate 後設定

            // --- (可選) 更新下拉選單狀態 ---
            if (progressDropdown) {
              const targetValue = targetTableName + '||' + decodedCategory;
              const optionToSelect = progressDropdown.querySelector(
                `option[value="${targetValue}"]`
              );
              if (optionToSelect) {
                optionToSelect.selected = true;
                console.log(
                  'Selected corresponding option in dropdown based on URL params.'
                );
              } else {
                progressDropdown.selectedIndex = 0;
                console.log(
                  'URL params specified a bookmark not currently in the top 10 dropdown options.'
                );
              }
            }
            // --- 更新結束 ---
          };

          // 點擊 Modal 內容區域時觸發播放
          modalContent.addEventListener('click', startPlayback, { once: true });

          // 點擊 Modal 背景 (外部陰暗處) 時僅關閉 Modal
          autoplayModal.addEventListener(
            'click',
            (event) => {
              // 檢查點擊的是否是背景本身，而不是內容區域
              if (event.target === autoplayModal) {
                console.log('Modal backdrop clicked, cancelling autoplay.');
                autoplayModal.style.display = 'none';
                // 清理 modalContent 的監聽器，避免下次 modal 顯示時重複觸發
                modalContent.removeEventListener('click', startPlayback);
                // 可選：顯示預設提示
                const contentContainer = document.getElementById('generated');
                if (
                  contentContainer &&
                  contentContainer.innerHTML.trim() === ''
                ) {
                  contentContainer.innerHTML =
                    '<p style="text-align: center; margin-top: 20px;">請點擊上方連結選擇腔調與級別。</p>';
                }
              }
            },
            { once: true }
          ); // 背景的監聽器也設為 once，點擊一次後移除

          // 顯示 Modal
          autoplayModal.style.display = 'flex'; // 使用 flex 來置中
          console.log('Autoplay modal displayed.');
        } else {
          console.error('Modal elements not found!');
          // 備用方案：如果找不到 Modal，直接呼叫 generate (可能無法自動播放)
          console.warn(
            'Modal not found, attempting direct generation (autoplay might fail).'
          );
          generate(dataObject, decodedCategory, rowParam);
          successfullyLoadedFromUrl = true; // <--- 在成功呼叫 generate 後設定
          // ... (對應的下拉選單更新邏輯) ...
        }
        // --- 修改結束 ---
      } else {
        console.error(
          '無法找到對應的資料變數:',
          dataVarName || targetTableName
        );
        loadedViaUrlParams = false; // <-- 失敗時重設旗標 (可選，但較安全)
        // 可以在這裡顯示錯誤訊息或預設內容
        const contentContainer = document.getElementById('generated');
        if (contentContainer)
          contentContainer.innerHTML = '<p>載入資料个時節搣毋著。</p>';
        if (progressDetailsSpan) progressDetailsSpan.textContent = ''; // 清除文字
      }
    } else {
      console.error(
        '無法從 URL 參數映射腔調或級別名稱:',
        dialectParam,
        levelParam
      );
      loadedViaUrlParams = false; // <-- 失敗時重設旗標 (可選，但較安全)
      if (progressDetailsSpan) progressDetailsSpan.textContent = ''; // 清除文字
    }
  } else {
    console.log('No valid URL parameters found for auto-generation on load.');
  }

  // --- 新增：使用 ResizeObserver 監聽表格容器大小變化 ---
  if (contentContainer && window.ResizeObserver) {
    console.log('Setting up ResizeObserver for #generated container.');

    // --- 修改：ResizeObserver 直接呼叫 debounced handleResizeActions ---
    const debouncedResizeObserverActions = debounce(() => {
      console.log('ResizeObserver triggered (debounced). Calling handleResizeActions.'); // DEBUG_MSG
      handleResizeActions();
    }, 250); // Use the same debounce delay as window resize

    const resizeObserver = new ResizeObserver((entries) => {
      // We don't need to inspect entries in detail, just trigger the debounced actions
      debouncedResizeObserverActions();
    });

    // Start observing the container
    resizeObserver.observe(contentContainer);

    // Optional: Consider disconnecting the observer if the app structure changes significantly
    // window.addEventListener('beforeunload', () => {
    //     resizeObserver.disconnect();
    // });
  } else if (!window.ResizeObserver) {
    console.warn(
      'ResizeObserver API not supported in this browser. Font size change scrolling might be less reliable.'
    );
  } else if (!contentContainer) {
    console.error('Could not find #generated container to observe.');
  }

  // --- 最後个清理邏輯 (根據 successfullyLoadedFromUrl 判斷) ---
  if (!successfullyLoadedFromUrl) {
    console.log(
      'Page was not successfully loaded via URL params, ensuring clean initial state.'
    );
    // 清除 active 狀態
    document
      .querySelectorAll('span[data-varname]')
      .forEach((span) => span.classList.remove('active-dialect-level'));
    document.querySelectorAll('.radioItem').forEach((label) => {
      label.classList.remove('active-category');
    });
    // 移除播放控制按鈕
    header?.querySelector('#audioControls')?.remove();
    // 清除進度詳情
    if (progressDetailsSpan) progressDetailsSpan.textContent = '';
    // 顯示預設提示 (如果內容為空)
    if (contentContainer && contentContainer.innerHTML.trim() === '') {
      contentContainer.innerHTML =
        '<p style="text-align: center; margin-top: 20px;">請點頂項連結擇腔調同級別。</p>';
    }
    // 確保下拉選單選在預設值
    if (progressDropdown) progressDropdown.selectedIndex = 0;
  }

  // --- 新增：設定選詞 Popup 功能 ---
  if (selectionPopup && selectionPopupBackdrop && selectionPopupContent && selectionPopupCloseBtn && contentContainer) { // *** MODIFIED: Use contentContainer ***
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

    // 點擊 popup 內容區域時，不要觸發 backdrop 的關閉事件
    selectionPopup.addEventListener('click', (event) => {
        event.stopPropagation();
    });

  } else {
    console.error('一個或多個選詞 Popup 相關元素尋無。');
  }
  // --- 新增結束 ---

  // --- 新增：監聽鍵盤事件 (全域，包含 Esc 關閉 popup) ---
  // 這會取代下面舊的 keydown 監聽器，並加入 popup 處理
  document.removeEventListener('keydown', globalKeydownHandler); // 先移除舊的，避免重複
  document.addEventListener('keydown', globalKeydownHandler);
  console.log('全域鍵盤監聽器已設定 (包含 Popup 關閉)。');
  // --- 新增結束 ---

  // --- 新增：資訊 Modal 事件處理 ---
  const dontShowInfoModalAgainCheckbox = document.getElementById('dontShowInfoModalAgain');

  if (infoButton && infoModal && infoModalCloseBtn && dontShowInfoModalAgainCheckbox) {
    const showInfoModal = () => {
      // 只有在 modal 目前係隱藏个時節正顯示
      if (infoModal.style.display === 'none' || infoModal.style.display === '') {
        infoModal.style.display = 'flex'; // 用 flex 做垂直置中
        infoModalCloseBtn.focus(); // 將焦點移到關閉按鈕，方便鍵盤操作
      }
    };

    const hideInfoModal = () => {
      infoModal.style.display = 'none';
    };

    infoButton.addEventListener('click', showInfoModal);
    infoModalCloseBtn.addEventListener('click', hideInfoModal);

    // Checkbox 儲存邏輯
    dontShowInfoModalAgainCheckbox.addEventListener('change', function () {
      localStorage.setItem('hideInfoModal', this.checked);
    });

    // 頁面載入時檢查係無係愛自動顯示
    const shouldHideModal = localStorage.getItem('hideInfoModal') === 'true';
    dontShowInfoModalAgainCheckbox.checked = shouldHideModal;

    if (!shouldHideModal) {
      // 延遲一息仔再顯示，避免頁面一載入就跳出來當嚇人
      setTimeout(showInfoModal, 500);
    }
  } else {
    console.warn('一個或多個資訊 Modal 相關元素尋無。');
  }



  // --- 再加一次確保，特別是如果 URL 參數處理是異步的 ---
  // 或者直接放在最尾項
  setTimeout(adjustHeaderFontSizeOnOverflow, 50); // 稍微延遲
});

// --- 新增：判斷是否為手機裝置 ---
function isMobileDevice() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// --- 新增：手機版查詞按鈕相關函式 ---
function createMobileLookupButton(popupEl, contentEl, backdropEl) {
  if (mobileLookupButton) return;

  mobileLookupButton = document.createElement('button');
  mobileLookupButton.id = 'mobileLookupBtn';
  mobileLookupButton.innerHTML = '尋讀音 <i class="fas fa-search"></i>';
  mobileLookupButton.style.display = 'none'; // 初始隱藏
  document.body.appendChild(mobileLookupButton);

  mobileLookupButton.addEventListener('click', () => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 0 && lastSelectionRectForMobile) {
      const selectedText = selection.toString().trim();
      if (selectedText.length > 0 && selectedText.length <= 15) {
        console.log('手機查詞按鈕點擊:', selectedText);
        const readings = findPronunciationsInAllData(selectedText);
        // 使用儲存的 lastSelectionRectForMobile 來定位 popup
        showPronunciationPopup(selectedText, readings, popupEl, contentEl, backdropEl, lastSelectionRectForMobile);
        hideMobileLookupButton(); // 顯示 popup 後隱藏按鈕
      }
    } else {
      hideMobileLookupButton(); // 若無效選取或 rect，也隱藏按鈕
    }
  });
}

function showMobileLookupButton(selectionRect) {
  if (!mobileLookupButton) return;

  lastSelectionRectForMobile = selectionRect; // 儲存 rect 供點擊時使用

  // 先暫時顯示以取得尺寸
  mobileLookupButton.style.visibility = 'hidden';
  mobileLookupButton.style.display = 'block';
  const btnWidth = mobileLookupButton.offsetWidth;
  const btnHeight = mobileLookupButton.offsetHeight;

  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  const margin = 3; // 按鈕與選取範圍邊緣的間距

  // 預設位置：選取範圍右下角外一點
  let btnTop = scrollY + selectionRect.bottom + margin;
  let btnLeft = scrollX + selectionRect.right - btnWidth; // 按鈕右邊緣對齊選取範圍右邊緣
  // 如果選取範圍太窄，按鈕左邊緣對齊選取範圍左邊緣
  if (selectionRect.width < btnWidth) {
    btnLeft = scrollX + selectionRect.left;
  }


  // 檢查是否超出視窗範圍
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const edgeMargin = 5; // 按鈕與視窗邊緣的最小間距

  // 調整左邊位置
  if (btnLeft + btnWidth > scrollX + viewportWidth - edgeMargin) {
    btnLeft = scrollX + viewportWidth - btnWidth - edgeMargin;
  }
  if (btnLeft < scrollX + edgeMargin) {
    btnLeft = scrollX + edgeMargin;
  }

  // 調整上方位置
  if (btnTop + btnHeight > scrollY + viewportHeight - edgeMargin) {
    let topAbove = scrollY + selectionRect.top - btnHeight - margin; // 嘗試移到選取範圍上方
    if (topAbove > scrollY + edgeMargin) {
      btnTop = topAbove;
    } // 若上方空間不足，維持在下方但避免超出底部 (這部分會在下面被btnTop < scrollY + edgeMargin處理)
  }
   if (btnTop < scrollY + edgeMargin) { // 避免超出頂部
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
  lastSelectionRectForMobile = null; // 清除儲存的 rect
}

// 手機版選取事件的 debounced 處理器
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

    // 檢查選取範圍是否在 .sentence span 內，且該 span 在 #generated 內
    if (sentenceSpan && contentContainer && contentContainer.contains(sentenceSpan) && selectedText.length > 0 && selectedText.length <= 15) {
      // 只有在 popup 未開啟時才顯示按鈕
      if (!activeSelectionPopup) {
        const rect = range.getBoundingClientRect();
        showMobileLookupButton(rect);
      } else {
        hideMobileLookupButton(); // 若 popup 已開啟，則隱藏按鈕
      }
    } else {
      hideMobileLookupButton(); // 選取無效或不在目標區，隱藏按鈕
    }
  } else {
    hideMobileLookupButton(); // 無選取內容，隱藏按鈕
  }
}, 250); // 250 毫秒 debounce

// --- 新增：全域鍵盤事件處理 (取代舊的) ---
function globalKeydownHandler(event) {
  const activeElement = document.activeElement; // Can be null

  // 判斷一般个互動元素 (輸入框、按鈕等) 係無係 focus 狀態
  // 這隻判斷毋包含 popup 本身个 focus 狀態 (分 !activeSelectionPopup 時節用)
  const isGeneralInputLikeFocused = activeElement && (
    activeElement.tagName === 'INPUT' ||
    activeElement.tagName === 'TEXTAREA' ||
    activeElement.tagName === 'SELECT' ||
    activeElement.tagName === 'BUTTON' || // 這包含頁面上一般个按鈕
    activeElement.isContentEditable
  );

  // --- Esc 鍵：優先關閉 Popup，然後才停止播放 ---
  if (event.key === 'Escape' || event.code === 'Escape') {
    if (activeSelectionPopup) {
      event.preventDefault(); // 避免其他 Esc 行為
      const popupEl = document.getElementById('selectionPopup');
      const backdropEl = document.getElementById('selectionPopupBackdrop');
      hidePronunciationPopup(popupEl, backdropEl);
      console.log('Global hotkey: Escape pressed, closing selection popup.');
    } else if (infoModal && (infoModal.style.display === 'flex' || infoModal.style.display === 'block')) { // 檢查 infoModal 係無係顯示中
        event.preventDefault();
        infoModal.style.display = 'none';
        if (infoButton) infoButton.focus(); // 將焦點還分打開 modal 个按鈕
        console.log('Global hotkey: Escape pressed, closing info modal.');
    } else if (isGeneralInputLikeFocused && activeElement && activeElement.tagName !== 'BODY') {
      // 若 popup 未開啟，但係有一般互動元素 focus 中 (且非 body)，就 blur 該元素
      // 這確保毋會 blur 到 (已隱藏) popup 內部个元素
      if (activeElement) { // 再次確認 activeElement 存在
        activeElement.blur();
        event.preventDefault();
        console.log('Global hotkey: Escape pressed, blurred active element:', activeElement);
      }
    } else if (isPlaying) {
      // 如果無互動元素係 focus 狀態，而且音樂在播放中，就停止播放
      const stopButton = document.getElementById('stopBtn');
      if (stopButton) {
        stopButton.click();
        console.log('Global hotkey: Escape pressed (no interactive focus/popup closed), stopping playback.');
      }
    }
    return; // Esc 鍵處理完畢
  }

  // --- 空白鍵：暫停/繼續播放 (僅在 Popup 未開啟且非互動元素 focus 時) ---
  if (!activeSelectionPopup && (event.key === ' ' || event.code === 'Space')) { // 檢查 popup 係無係開啟
    // 若 popup 未開啟，而且無一般互動元素 focus 中，正處理播放/暫停
    if (!isGeneralInputLikeFocused) {
      if (isPlaying) {
        event.preventDefault(); // 避免頁面捲動
        const pauseResumeButton = document.getElementById('pauseResumeBtn');
        if (pauseResumeButton) {
          pauseResumeButton.click();
          console.log('Global hotkey: Spacebar pressed (isPlaying), toggling pause/resume.');
        }
      } else { // !isPlaying: 載入並播放第一筆書籤
        const progressDropdown = document.getElementById('progressDropdown');
        if (progressDropdown && progressDropdown.options.length > 1) {
          event.preventDefault(); // 處理了事件，避免頁面捲動
          const selectedValue = progressDropdown.options[1].value;
          const bookmarks = JSON.parse(localStorage.getItem('hakkaBookmarks')) || [];
          const firstBookmark = bookmarks.find(bm => bm.tableName + '||' + bm.cat === selectedValue);

          if (firstBookmark) {
            const targetTableName = firstBookmark.tableName;
            const targetCategory = firstBookmark.cat;
            const targetRowIdToGo = firstBookmark.rowId;
            const dataVarName = mapTableNameToDataVar(targetTableName);

            if (dataVarName && typeof window[dataVarName] !== 'undefined') {
              const dataObject = window[dataVarName];
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
// --- 全域鍵盤事件處理結束 ---











/* 標示大埔變調 */
function 大埔高降異化() {
  const specialChars = ['à', 'è', 'ì', 'ò', 'ù'];
  const rtElements = document.querySelectorAll('rt');

  rtElements.forEach((rt) => {
    let htmlContent = rt.innerHTML;
    const sandhiRubyRegex = /<ruby class="sandhi-(?:高降變|中平變|低升變)"[^>]*>.*?<\/ruby>/g;
    // Split by the sandhiRubyRegex and then re-split the non-matching parts
    let preliminaryTokens = [];
    let lastIndex = 0;
    htmlContent.replace(sandhiRubyRegex, (match, offset) => {
      if (offset > lastIndex) {
        preliminaryTokens.push(htmlContent.substring(lastIndex, offset));
      }
      preliminaryTokens.push(match);
      lastIndex = offset + match.length;
      return match; // Required by replace, but we don't use its return value here
    });
    if (lastIndex < htmlContent.length) {
      preliminaryTokens.push(htmlContent.substring(lastIndex));
    }

    const tokens = preliminaryTokens.flatMap(token => {
      if (token.startsWith("<ruby class=\"sandhi-")) {
        return [token]; // This is already a complete sandhi ruby token
      }
      // Otherwise, it's a segment that needs further splitting into words and spaces
      return token.match(/[^<>\s、]+|[\s、]+/g) || []; // 將頓號「、」視為分隔符
    }).filter(t => t && t.length > 0); // Filter out empty strings

    let modifiedTokens = [];
    let hasActualModification = false;

    for (let i = 0; i < tokens.length; i++) {
      let currentToken = tokens[i];

      if (currentToken.startsWith("<ruby class=\"sandhi-") || currentToken.match(/^\s+$/)) {
        modifiedTokens.push(currentToken);
      } else {
        let nextWordToken = "";
        for (let j = i + 1; j < tokens.length; j++) {
          // Skip if it's an existing sandhi ruby or a space/punctuation (including '、')
          if (tokens[j].startsWith("<ruby class=\"sandhi-") || tokens[j].match(/^[\s、]+$/)) {
            continue;
          }
          // If we encounter an opening parenthesis, stop looking for next word for sandhi
          if (tokens[j] === '(' || tokens[j] === '（') {
            nextWordToken = ""; // No valid next word for sandhi across parenthesis
            break;
          }
          // Otherwise, this is our next word token
          nextWordToken = tokens[j];
          break;
        }

        if (
          currentToken.length > 0 &&
          currentToken.match(/[\u00E0\u00E8\u00EC\u00F2\u00F9]/) // à è ì ò ù
        ) {
          if (
            nextWordToken &&
            nextWordToken.match(
              /[\u00E0\u00E8\u00EC\u00F2\u00F9\u00E2\u00EA\u00EE\u00F4\u00FB]/ // à è ì ò ù or â ê î ô û
            )
          ) {
            if (currentToken.includes(')') || currentToken.includes('）') || nextWordToken.includes('(') || nextWordToken.includes('（')) {
              modifiedTokens.push(currentToken);
            } else {
              let rubyElement = document.createElement('ruby');
              rubyElement.className = 'sandhi-高降變';
              rubyElement.textContent = currentToken;
              let rtInnerElement = document.createElement('rt'); // Renamed to avoid conflict
              rtInnerElement.textContent = '55';
              rubyElement.appendChild(rtInnerElement);
              modifiedTokens.push(rubyElement.outerHTML);
              hasActualModification = true;
            }
          } else {
            modifiedTokens.push(currentToken);
          }
        } else {
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
  const specialChars = ['à', 'è', 'ì', 'ò', 'ù'];
  const rtElements = document.querySelectorAll('rt');

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
      return token.match(/[^<>\s、]+|[\s、]+/g) || []; // 將頓號「、」視為分隔符
    }).filter(t => t && t.length > 0);

    let modifiedTokens = [];
    let hasActualModification = false;

    for (let i = 0; i < tokens.length; i++) {
      let currentToken = tokens[i];

      if (currentToken.startsWith("<ruby class=\"sandhi-") || currentToken.match(/^\s+$/)) {
        modifiedTokens.push(currentToken);
      } else {
        let nextWordToken = "";
        for (let j = i + 1; j < tokens.length; j++) {
          // Skip if it's an existing sandhi ruby or a space/punctuation (including '、')
          if (tokens[j].startsWith("<ruby class=\"sandhi-") || tokens[j].match(/^[\s、]+$/)) {
            continue;
          }
          // If we encounter an opening parenthesis, stop looking for next word for sandhi
          if (tokens[j] === '(' || tokens[j] === '（') {
            nextWordToken = ""; // No valid next word for sandhi across parenthesis
            break;
          }
          // Otherwise, this is our next word token
          nextWordToken = tokens[j];
          break;
        }

        if ( // Restore the correct if condition here
          currentToken.length > 0 &&
          currentToken.match(/[\u0101\u0113\u012B\u014D\u016B]/) // ā ē ī ō ū
        ) {
          if (
            nextWordToken &&
            nextWordToken.match(
              /[\u01CE\u011B\u01D0\u01D2\u01D4\u00E2\u00EA\u00EE\u00F4\u00FB]/ // ǎ ě ǐ ǒ ǔ or â ê î ô û
            )
          ) {
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
        } else {
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
  const specialChars = ['à', 'è', 'ì', 'ò', 'ù'];
  const rtElements = document.querySelectorAll('rt');

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
      return token.match(/[^<>\s、]+|[\s、]+/g) || []; // 將頓號「、」視為分隔符
    }).filter(t => t && t.length > 0);

    let modifiedTokens = [];
    let hasActualModification = false;

    for (let i = 0; i < tokens.length; i++) {
      let currentToken = tokens[i];

      if (currentToken.startsWith("<ruby class=\"sandhi-") || currentToken.match(/^\s+$/)) {
        modifiedTokens.push(currentToken);
      } else {
        let nextWordToken = "";
        for (let j = i + 1; j < tokens.length; j++) {
          // Skip if it's an existing sandhi ruby or a space/punctuation
          if (tokens[j].startsWith("<ruby class=\"sandhi-") || tokens[j].match(/^[\s、]+$/)) {
            continue;
          }
          // If we encounter an opening parenthesis, stop looking for next word for sandhi
          if (tokens[j] === '(' || tokens[j] === '（') {
            nextWordToken = ""; // No valid next word for sandhi across parenthesis
            break;
          }
          // Otherwise, this is our next word token
          nextWordToken = tokens[j];
          break;
        }

        if (
          currentToken.length > 0 &&
          currentToken.match(/[\u01CE\u011B\u01D0\u01D2\u01D4]/) // ǎ ě ǐ ǒ ǔ
        ) {
          if (
            nextWordToken &&
            nextWordToken.match(/[\u01CE\u011B\u01D0\u01D2\u01D4]/) // ǎ ě ǐ ǒ ǔ
          ) {
            if (currentToken.includes(')') || currentToken.includes('）') || nextWordToken.includes('(') || nextWordToken.includes('（')) {
              modifiedTokens.push(currentToken);
            } else {
              let rubyElement = document.createElement('ruby');
              rubyElement.className = 'sandhi-低升變'; // 使用單一 class 名稱
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
        } else {
          modifiedTokens.push(currentToken);
        }
      }
    }

    if (hasActualModification) {
      rt.innerHTML = modifiedTokens.join('');
    }
  });
}

/* --- 新增開始：更新進度下拉選單 --- */
function updateProgressDropdown() {
  const progressDropdown = document.getElementById('progressDropdown');
  const progressDetailsSpan = document.getElementById('progressDetails'); // <--- 取得 span

  if (!progressDropdown) return; // 如果找不到元素就返回

  // --- 修改：只在需要時清除文字，例如在重建選項前 ---
  // if (progressDetailsSpan) progressDetailsSpan.textContent = ''; // <-- 暫時先不要在這裡清除

  const previousValue = progressDropdown.value; // <-- 新增：記住舊的 value

  // 讀取儲存的進度，若無則初始化為空陣列
  const bookmarks = JSON.parse(localStorage.getItem('hakkaBookmarks')) || [];

  // 清空現有選項 (保留第一個預設選項)
  progressDropdown.innerHTML = '<option selected disabled>擇進前个進度</option>';
  // --- 新增：如果沒有書籤，確保 details 是空的 ---
  if (bookmarks.length === 0 && progressDetailsSpan) {
    progressDetailsSpan.textContent = '';
  }
  // --- 新增結束 ---

  // 遍歷進度陣列，為每個進度產生一個選項
  bookmarks.forEach((bookmark, index) => {
    const option = document.createElement('option');
    // 格式化顯示文字
    option.textContent = `${bookmark.tableName} - ${
      bookmark.cat
    } - #${bookmark.rowId} (${bookmark.percentage}%)`;
    // 可以設定 value 屬性，方便未來擴充點選跳轉功能
    // option.value = JSON.stringify(bookmark);
    option.value = bookmark.tableName + '||' + bookmark.cat; // 用 tableName 和 cat 組合，' || ' 當分隔符
    progressDropdown.appendChild(option);
  });

  // --- 新增：嘗試恢復之前的選中狀態 ---
  if (previousValue && previousValue !== '擇進前个進度') {
    // 尋找具有相同 value 的新選項
    const newOptionToSelect = progressDropdown.querySelector(
      `option[value="${previousValue}"]`
    );
    if (newOptionToSelect) {
      // 如果找到了，就選中它
      newOptionToSelect.selected = true;
      console.log('恢復下拉選單選擇:', previousValue);
      restoredSelection = true; // 標記成功恢復

      // --- 修改：如果恢復了選項，在這裡更新 details 文字 ---
      const selectedBookmark = bookmarks.find(
        (bm) => bm.tableName + '||' + bm.cat === previousValue
      );
      if (selectedBookmark && progressDetailsSpan) {
        progressDetailsSpan.textContent = `#${selectedBookmark.rowId} (${selectedBookmark.percentage}%)`;
      }
      // --- 修改結束 ---
    } else {
      // 如果找不到了 (可能該進度被擠出前10名)，就顯示預設的 "學習進度"
      progressDropdown.selectedIndex = 0;
      console.log('先前選擇的項目已不在列表中，重設下拉選單');
    }
  } else {
    // 如果之前沒有選擇，或是選的是預設值，保持預設值被選中
    progressDropdown.selectedIndex = 0;
  }

  // --- 在所有 option 都加入，並且可能恢復選中狀態後 ---
  // 使用 setTimeout 確保 DOM 更新完成
  setTimeout(adjustHeaderFontSizeOnOverflow, 0);
}

/* --- 新增開始：將表格名稱映射回資料變數名稱 --- */
function mapTableNameToDataVar(tableName) {
  const mapping = {
    四縣基礎級: '四基',
    四縣初級: '四初',
    四縣中級: '四中',
    四縣中高級: '四中高',
    四縣高級: '四高',
    海陸基礎級: '海基',
    海陸初級: '海初',
    海陸中級: '海中',
    海陸中高級: '海中高',
    海陸高級: '海高',
    大埔基礎級: '大基',
    大埔初級: '大初',
    大埔中級: '大中',
    大埔中高級: '大中高',
    大埔高級: '大高',
    饒平基礎級: '平基',
    饒平初級: '平初',
    饒平中級: '平中',
    饒平中高級: '平中高',
    饒平高級: '平高',
    詔安基礎級: '安基',
    詔安初級: '安初',
    詔安中級: '安中',
    詔安中高級: '安中高',
    詔安高級: '安高',
    // 如果未來有更多級別或腔調，需要在此處更新
  };
  // 特殊處理：如果傳入的已經是變數名，直接返回
  if (typeof window[tableName] !== 'undefined') {
    return tableName;
  }
  return mapping[tableName];
}
/* --- 新增結束 --- */

/**
 * 儲存學習進度書籤，並根據規則刪除舊紀錄。
 * @param {string} rowId - 當前行的 ID (例如 '001')
 * @param {string} percentage - 學習進度百分比 (字串)
 * @param {string} category - 當前類別名稱
 * @param {string} tableName - 當前表格名稱 (腔調級別)
 */
function saveBookmark(rowId, percentage, category, tableName) {
  let bookmarks = JSON.parse(localStorage.getItem('hakkaBookmarks')) || [];
  const newBookmark = {
    rowId: rowId,
    percentage: percentage,
    cat: category,
    tableName: tableName,
    timestamp: Date.now(),
  };

  // --- (保留現有的移除、新增、刪除舊紀錄邏輯) ---
  // 1. 移除已存在的完全相同的紀錄 (同表格同類別)
  const existingIndex = bookmarks.findIndex(
    (bm) => bm.tableName === newBookmark.tableName && bm.cat === newBookmark.cat
  );
  if (existingIndex > -1) {
    bookmarks.splice(existingIndex, 1);
    console.log(`移除已存在的紀錄: ${tableName} - ${category}`);
  }
  // 2. 將新紀錄加到最前面
  bookmarks.unshift(newBookmark);
  console.log(`新增紀錄: ${tableName} - ${category} 在行 ${rowId}`);
  // 3. 如果紀錄超過 10 筆，執行刪除邏輯
  if (bookmarks.length > 10) {
    console.log(
      `紀錄超過 10 筆 (${bookmarks.length})，執行刪除邏輯。新紀錄: ${newBookmark.tableName} - ${newBookmark.cat}`
    );
    let indexToDelete = -1;
    let foundMatch = false; // 用一個 flag 追蹤是否找到匹配

    console.log('開始檢查索引從', bookmarks.length - 1, '到 1');
    // 修改迴圈條件，更簡潔，避免檢查索引 0
    for (let i = bookmarks.length - 1; i >= 1; i--) {
      const currentBookmark = bookmarks[i];
      console.log(
        `  檢查索引 ${i}: ${currentBookmark.tableName} - ${currentBookmark.cat}`
      );

      // 檢查是否同表格且不同類別
      if (
        currentBookmark.tableName === newBookmark.tableName &&
        currentBookmark.cat !== newBookmark.cat
      ) {
        indexToDelete = i;
        foundMatch = true; // 設定 flag
        console.log(
          `  找到符合條件的紀錄於索引 ${i} (同表格，不同類別)。將刪除此筆。`
        );
        break; // 找到目標，停止搜尋
      }
      // (可選) 增加其他情況的 log，幫助判斷為何沒匹配
      else if (currentBookmark.tableName === newBookmark.tableName) {
        console.log(
          `  索引 ${i} 表格名稱相符，但類別相同 (${currentBookmark.cat})。跳過。`
        );
        // 理論上不該發生，但 log 有助於確認
      } else {
        console.log(
          `  索引 ${i} 表格名稱不符 (${currentBookmark.tableName})。跳過。`
        );
      }
    }

    // 根據 flag 判斷如何刪除
    if (foundMatch) {
      console.log(`執行刪除特定紀錄於索引 ${indexToDelete}`);
      bookmarks.splice(indexToDelete, 1);
    } else {
      console.log(
        '未找到符合條件的紀錄 (同表格，不同類別)。將刪除最舊的一筆 (索引 10)。'
      );
      // 確保索引 10 存在 (雖然 length > 10 應該保證了)
      if (bookmarks.length > 10) {
        bookmarks.splice(10, 1);
      } else {
        // 理論上不該發生
        console.warn('嘗試刪除索引 10，但書籤數量不足。');
      }
    }
  }

  // 4. 儲存更新後的紀錄 (最多 10 筆)
  localStorage.setItem('hakkaBookmarks', JSON.stringify(bookmarks));
  updateProgressDropdown(); // 更新下拉選單顯示

  // --- 新增：如果頁面是透過 URL 參數載入的，則在第一次儲存書籤後清除參數 ---
  if (loadedViaUrlParams) {
    console.log('首次儲存書籤 (來自 URL 參數載入)，清除 URL 參數...');
    // 取得目前的 URL 路徑部分 (不含查詢字串和 hash)
    const newUrl = window.location.pathname;
    try {
      // 使用 replaceState 修改 URL 而不重新載入頁面，也不會留下舊的 URL 在歷史紀錄中
      history.replaceState(null, '', newUrl);
      console.log('URL 參數已清除。');
      loadedViaUrlParams = false; // 將旗標設回 false，表示參數已處理完畢，避免後續重複清除
    } catch (e) {
      console.error('清除 URL 參數時發生錯誤:', e);
      // 即使清除失敗，也將標記設為 false，避免無限嘗試
      loadedViaUrlParams = false;
    }
  }

  // --- 修改：強制選中剛儲存的進度並更新詳情為連結 ---
  const progressDropdown = document.getElementById('progressDropdown');
  const progressDetailsSpan = document.getElementById('progressDetails');

  if (progressDropdown && progressDetailsSpan) {
    if (bookmarks.length > 0) {
      // 確保有書籤
      progressDropdown.selectedIndex = 1; // 選中第一個實際進度 (索引為 1)
      console.log('Dropdown selection forced to index 1 (newest).');

      // --- 修改 baseURL 計算方式 ---
      let baseURL = '';
      if (window.location.protocol === 'file:') {
        // For local files, get the directory path from href
        baseURL = window.location.href.substring(
          0,
          window.location.href.lastIndexOf('/') + 1
        );
      } else {
        // For http/https, combine origin and directory path (removing filename)
        let path = window.location.pathname;
        baseURL =
          window.location.origin + path.substring(0, path.lastIndexOf('/') + 1);
        // Ensure baseURL ends with a slash if pathname was just '/'
        if (!baseURL.endsWith('/')) {
          baseURL += '/';
        }
      }
      console.log('Calculated baseURL:', baseURL); // 增加日誌檢查 baseURL
      // --- 修改結束 ---

      // 產生分享連結
      const dialectLevelCodes = extractDialectLevelCodes(tableName);
      if (dialectLevelCodes) {
        // const baseURL = window.location.origin + window.location.pathname;
        const encodedCategory = encodeURIComponent(category);
        const shareURL = `${baseURL}index.html?dialect=${dialectLevelCodes.dialect}&level=${dialectLevelCodes.level}&category=${encodedCategory}&row=${rowId}`;

        // 建立連結元素
        const linkElement = document.createElement('a');
        linkElement.href = shareURL;
        linkElement.textContent = `#${newBookmark.rowId} (${newBookmark.percentage}%)`;
        // linkElement.target = '_blank'; // 可選：在新分頁開啟
        // linkElement.rel = 'noopener noreferrer'; // 安全性考量
        linkElement.style.marginLeft = '5px'; // 加點間距

        // 清空 span 並加入連結
        progressDetailsSpan.innerHTML = '';
        progressDetailsSpan.appendChild(linkElement);
        console.log('Progress details updated with shareable link.');
      } else {
        // 如果無法產生連結，只顯示文字
        progressDetailsSpan.textContent = `#${newBookmark.rowId} (${newBookmark.percentage}%)`;
        console.error('無法從 tableName 解析腔調和級別代碼:', tableName);
      }
    } else {
      // 如果沒有書籤了，清空詳情
      progressDetailsSpan.textContent = '';
      progressDropdown.selectedIndex = 0; // 確保選回預設
    }
  }
  // --- 修改結束 ---
}

/**
 * Debounce Function: 延遲執行函式，直到事件停止觸發後的一段時間。
 * (如果你的 main.js 或其他地方已經有 debounce 函式，可以不用重複定義)
 * @param {Function} func 要執行的函式
 * @param {number} wait 等待的毫秒數
 * @param {boolean} immediate 是否在事件一開始就觸發一次
 * @returns {Function} Debounced function
 */
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

/**
 * 捲動到目前具有 'nowPlaying' ID 的元素 (正在播放或暫停的列)
 * 並在 Firefox 中重新調整 Ruby 字體大小。
 */
function handleResizeActions() {
  console.log('handleResizeActions CALLED. Performing adjustments.'); // DEBUG_MSG

  scrollToNowPlayingElement();
  // 取得表格容器，如果不存在就返回
  const contentContainer = document.getElementById('generated');
  if (contentContainer) {
    adjustAllRubyFontSizes(contentContainer);
  } else {
    console.warn(
      'Resize handler: Could not find #generated container for font adjustment.'
    );
  }

  // *** 在這裡加入呼叫 ***
  adjustHeaderFontSizeOnOverflow();

  // --- 修改：Popup 更新邏輯，加入 lastRectForPopupPositioning ---
  if (activeSelectionPopup) { // 檢查 popup 是否開啟
    const popupEl = document.getElementById('selectionPopup');
    if (popupEl && popupEl.style.display === 'block') {
      let rectToUse = null;
      if (lastAnchorElementForPopup && document.body.contains(lastAnchorElementForPopup)) {
        rectToUse = lastAnchorElementForPopup.getBoundingClientRect();
      } else if (lastRectForPopupPositioning) {
        // 若使用儲存的 rect，它應當是 popup 開啟時的有效位置
        rectToUse = lastRectForPopupPositioning;
      }

      if (rectToUse) {
        requestAnimationFrame(() => { // 等待下一次瀏覽器重繪
          // 在重繪後，再用 setTimeout 延遲執行，分瀏覽器有較多時間穩定版面
          setTimeout(() => {
            // 再次檢查錨點元素係無係還在 DOM 裡肚
            if (lastAnchorElementForPopup && !document.body.contains(lastAnchorElementForPopup)) {
              console.warn("handleResizeActions (rAF + setTimeout 700ms): 錨點元素在最終更新前消失了。"); // DEBUG_MSG
              return;
            }
            let currentRect = rectToUse;
            if (lastAnchorElementForPopup && document.body.contains(lastAnchorElementForPopup)) { // 如果錨點元素還在，就用佢最新个位置
                 currentRect = lastAnchorElementForPopup.getBoundingClientRect();
            }
              console.log('handleResizeActions (rAF + setTimeout 100ms): Popup is active, updating position.'); // DEBUG_MSG
            updatePopupPosition(popupEl, currentRect);
          }, 700); // 改做延遲 700 毫秒
          });
      } else {
        console.warn("handleResizeActions: Popup 開啟，但尋無有效个錨點元素或 rect 來重新定位。"); // DEBUG_MSG
      }
    }
  }
}
/**
 * 捲動到目前具有 'nowPlaying' ID 的列中，包含 currentAudio 的 TD 元素。
 */
function scrollToNowPlayingElement() {
  // 先尋著有 'nowPlaying' ID 个 tr
  const activeRow = document.getElementById('nowPlaying');
  console.log(
    'scrollToNowPlayingElement called. Found #nowPlaying TR:',
    activeRow
  );

  // 確定 activeRow 同 currentAudio (目前播放或暫停个音檔) 都存在
  if (activeRow && currentAudio) {
    // 對 currentAudio 尋佢所在个 td
    const audioTd = currentAudio.closest('td');

    // 確定尋著 td，而且該 td 確實在 activeRow 裡肚
    if (audioTd && activeRow.contains(audioTd)) {
      console.log('Scrolling to audio TD within #nowPlaying TR:', audioTd);
      audioTd.scrollIntoView({
        behavior: 'smooth', // 在 resize 時節用 smooth 可能較好
        block: 'center', // 'nearest' 在 resize 時較毋會跳恁大力
        inline: 'nearest',
      });
    } else {
      console.warn(
        'scrollToNowPlayingElement: Could not find audio TD or it is not within #nowPlaying TR. Falling back to scroll TR.'
      );
      // 萬一尋無正確个 td，退回捲動歸列 tr
      activeRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  } else {
    console.log(
      'scrollToNowPlayingElement: #nowPlaying TR or currentAudio reference not found. Skipping scroll.'
    );
  }

  // --- 移除這裡个 popup 更新邏輯 ---
}

// 監聽 window 的 resize 事件，並使用 debounce 處理
// 這裡設定 250 毫秒，表示停止調整大小 250ms 後才執行捲動和字體調整
window.addEventListener('resize', debounce(handleResizeActions, 250)); // <-- 改為呼叫新的處理函式

/**
 * 檢查目前瀏覽器係無係 Firefox。
 * @returns {boolean} 如果係 Firefox 回傳 true，否則回傳 false。
 */
function isFirefox() {
  return navigator.userAgent.toLowerCase().includes('firefox');
}

/**
 * 調整單一 ruby 元素个字體大小，避免在 Firefox 中溢出。
 * @param {HTMLElement} rubyElement - 要調整个 ruby 元素。
 */
function adjustRubyFontSize(rubyElement) {
  if (!isFirefox()) return; // 只在 Firefox 執行

  const tdElement = rubyElement.closest('td');
  if (!tdElement) return;

  // 先重設字體大小，以便取得正確个 scrollWidth
  rubyElement.style.fontSize = ''; // 重設為 CSS 預設值
  // 需要強制瀏覽器重新計算樣式
      const forcedStyle = window.getComputedStyle(rubyElement); // 強制重新計算並取得樣式
      const currentFontSize = parseFloat(forcedStyle.fontSize); // 取得重設後个字體大小
      const rubyWidth = rubyElement.scrollWidth; // 取得重設後个捲動闊度

    // --- 新增：判斷模式並計算可用寬度 ---
        const computedTdStyle = window.getComputedStyle(tdElement); // td 樣式
    const isCardMode = computedTdStyle.display === 'block';
    let availableWidth;
    const buffer = 5; // 緩衝空間

    if (isCardMode) {
      // 卡片模式：clientWidth 減去 paddingLeft (像素) 再減 buffer
      const paddingLeftPx = parseFloat(computedTdStyle.paddingLeft);
      // 考慮到 ::before 佔用个空間，再減去 buffer
      availableWidth = tdElement.clientWidth - paddingLeftPx - buffer * 3; // 稍微多減一點 buffer
      // console.log(`Card Mode: clientW=${tdElement.clientWidth}, padL=${paddingLeftPx}, availW=${availableWidth}`);
    } else {
      // 寬螢幕模式：直接用 clientWidth 減 buffer
      availableWidth = tdElement.clientWidth - buffer;
      // console.log(`Wide Mode: clientW=${tdElement.clientWidth}, availW=${availableWidth}`);
    }
    // --- 新增結束 ---
    
    if (rubyWidth > availableWidth) {
      // <-- 用 availableWidth 比較
          // 按比例計算新字體大小，但設定下限 (用 Math.floor 避免小數造成循環)
      let newSize = Math.floor((currentFontSize * availableWidth) / rubyWidth);
      const minSize = 10; // 最小字體大小 (px)
      newSize = Math.max(newSize, minSize);

      if (newSize < currentFontSize) {
        // 只有在需要縮小時才應用
        // console.log(`Firefox: Adjusting ruby font size: ${rubyElement.textContent.substring(0,10)}... from ${currentFontSize}px to ${newSize}px`);
            // 檢查係無係同目前設定个 style.fontSize 無共樣，避免重複設定
            if (rubyElement.style.fontSize !== `${newSize}px`) {
              rubyElement.style.fontSize = `${newSize}px`;
            }
      } else {
        // 如果計算出个 newSize 無比 currentFontSize 細，愛確定拿忒 style.fontSize
            // 這表示預設字體較好，或者已經在最小值但還係溢出。
            // 若先前有縮小過 (style.fontSize 有值)，就重設佢。
            if (rubyElement.style.fontSize) {
          // console.log(`Firefox: Ruby fits or newSize >= currentSize, removing inline style.`);
          rubyElement.style.fontSize = '';
        }
      }
    } else {
      // 如果 ruby 元素闊度細過可用闊度，愛確定拿忒 style.fontSize
          if (rubyElement.style.fontSize) { // 若先前有設定 style.fontSize，就清掉
        // console.log(`Firefox: Ruby fits, removing inline style.`);
        rubyElement.style.fontSize = '';
      }
    }
      // 同步套用，拿掉 setTimeout(0)
}

/**
 * 調整指定容器內所有相關 ruby 元素个字體大小。
 * @param {HTMLElement} containerElement - 包含表格个容器元素。
 */
function adjustAllRubyFontSizes(containerElement) {
  if (!isFirefox()) return;
  console.log('Firefox: Adjusting ruby font sizes...');
  // 只針對包含客家語个 td 裡背个 ruby 做調整
  const rubyElements = containerElement.querySelectorAll(
    'td[data-label="詞彙"] ruby'
  );
  rubyElements.forEach((rubyElement) => {
    // 在調整前先重設，確保 resize 時能從原始大小開始計算
    rubyElement.style.fontSize = '';
    adjustRubyFontSize(rubyElement);
  });
}

/**
 * 動態調整 #header 內主要元素 (#progressDropdown, #progressDetails) 的字體大小，
 * 檢查 #header 是否發生橫向溢出 (overflow)，如果是，則縮小字體。
 */
function adjustHeaderFontSizeOnOverflow() { // <--- 改名仔
    console.log('--- adjustHeaderFontSizeOnOverflow function CALLED ---');
    const header = document.getElementById('header');
    const dropdown = document.getElementById('progressDropdown');
    const detailsContainer = document.getElementById('progressDetails'); // <span>
    // 注意：linkElement 還是需要，因為 detailsContainer 本身可能沒有文字
    const linkElement = detailsContainer?.querySelector('a'); // <a>

    // 確保主要元素都存在
    if (!header || !dropdown || !detailsContainer || !linkElement) {
        console.warn('adjustHeaderFontSizeOnOverflow: Missing required elements (header, dropdown, detailsContainer, or linkElement).');
        // 如果缺少元素，嘗試重設可能存在的行內樣式
        [dropdown, linkElement].forEach(el => {
            if (el && el.style.fontSize !== '') {
                el.style.fontSize = '';
            }
        });
        return;
    }

    // --- 記錄目標元素的初始字體大小 ---
    const elementsToResize = [
        { element: dropdown, minSize: 10 }, // 下拉選單最小字體 (可調整)
        { element: linkElement, minSize: 8 }   // 連結最小字體 (可調整)
    ];
    const initialStyles = elementsToResize.map(item => ({
        element: item.element,
        initialSize: parseFloat(window.getComputedStyle(item.element).fontSize),
        minSize: item.minSize
    }));

    // --- 重設行內樣式，以便計算自然寬度 ---
    initialStyles.forEach(item => {
        item.element.style.fontSize = '';
    });
    // 強制瀏覽器重繪
    header.offsetHeight;

    // --- 計算 Header 可用寬度與初始需求寬度 ---
    const headerWidth = header.clientWidth;
    let totalRequiredWidth = calculateTotalRequiredWidth(header); // 使用輔助函式
    const gapValue = parseFloat(window.getComputedStyle(header).gap) || 0; // 讀取 gap

    console.log(`Header Width: ${headerWidth}, Initial Required Width: ${totalRequiredWidth}, Gap: ${gapValue}`);

    // --- 檢查是否溢出 ---
    const isOverflowing = totalRequiredWidth > headerWidth;
    const buffer = 1; // 允許一點點誤差

    if (isOverflowing && totalRequiredWidth - headerWidth > buffer) {
        console.log(`#header is overflowing by ${totalRequiredWidth - headerWidth}px. Shrinking fonts.`);
        // --- 已溢出，執行縮小字體邏輯 ---

        // 確保連結文字不換行 (CSS 應該已處理，但 JS 加強)
        linkElement.style.whiteSpace = 'nowrap';

        // --- 逐步縮小字體 ---
        let canShrinkMore = true; // 標記是否還能繼續縮小
        for (let i = 0; i < 50 && totalRequiredWidth > headerWidth && canShrinkMore; i++) {
            canShrinkMore = false; // 假設這次不能再縮了
            let currentTotalWidthBeforeShrink = totalRequiredWidth; // 記錄縮小前的寬度

            // 對每個目標元素縮小 1px (如果還沒到最小值)
            initialStyles.forEach(item => {
                let currentElementSize = parseFloat(item.element.style.fontSize || item.initialSize);
                if (currentElementSize > item.minSize) {
                    currentElementSize -= 1;
                    item.element.style.fontSize = `${currentElementSize}px`;
                    canShrinkMore = true; // 只要有一個能縮，就標記為 true
                } else {
                    // 確保最小值被應用
                    item.element.style.fontSize = `${item.minSize}px`;
                }
            });

            // 如果沒有任何元素可以再縮小了，就跳出循環
            if (!canShrinkMore) {
                 console.log('All elements reached minimum font size.');
                 break;
            }

            // 強制重繪
            header.offsetHeight;

            // *** 重新計算 totalRequiredWidth ***
            totalRequiredWidth = calculateTotalRequiredWidth(header);
            console.log(`  Shrunk step ${i+1}, new required width: ${totalRequiredWidth}`);

            // *** 增加檢查：如果寬度沒有變小，可能卡住了，跳出 ***
            if (totalRequiredWidth >= currentTotalWidthBeforeShrink && canShrinkMore) {
                console.warn('  Width did not decrease after shrinking, breaking loop to prevent infinite loop.');
                break;
            }
        } // --- 縮小循環結束 ---

        // 循環結束後最後檢查
        if (totalRequiredWidth > headerWidth) {
             console.warn(`Fonts shrunk to minimum, but header might still overflow by ${totalRequiredWidth - headerWidth}px.`);
        } else {
             console.log(`Font sizes adjusted. Final required width: ${totalRequiredWidth}`);
        }

    } else {
        // --- 未溢出或溢出在 buffer 內 ---
        // console.log('#header is not overflowing significantly. Resetting fonts if needed.');
        let stylesReset = false;
        initialStyles.forEach(item => {
            if (item.element.style.fontSize !== '') {
                item.element.style.fontSize = '';
                stylesReset = true;
            }
        });
         // 恢復連結的 white-space (如果之前被 JS 修改過)
        if (linkElement.style.whiteSpace !== '') {
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
        if (child.offsetParent !== null && window.getComputedStyle(child).display !== 'none') {
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

// --- 修改：自動 blur 觸發元素的程式碼，改用事件委派 ---
document.addEventListener('click', function(event) {
  const targetElement = event.target;
  // 尋找被點擊的元素或其最近的 button 父元素
  const button = targetElement.closest('button');

  // 如果找到 button 元素
  if (button) {
    // 這裡可以加入排除特定 dropdown 按鈕的條件
    // 例如，如果你的 dropdown 按鈕有一個特定的 class 'dropdown-trigger'，可以取消註解下面這段：
    // if (!button.classList.contains('dropdown-trigger')) {
    //   button.blur();
    //   console.log('Blurred element after click (delegated):', button);
    // } else {
    //   console.log('Button with class "dropdown-trigger" was clicked, not blurring:', button);
    // }
    button.blur(); // 目前對所有按鈕都 blur
    console.log('Blurred element after click (delegated):', button);
  }
});
console.log('Automatic blur event listener added to document for all buttons (using delegation).');
// --- 修改結束 ---

// --- 新增：選詞發音 Popup 相關函式 ---

/**
 * 將資料變數名（如 "四基"）轉換為完整的腔調級別名稱（如 "四縣基礎級"）。
 * @param {string} dataVarNameStr - 資料變數名。
 * @returns {string} 完整的腔調級別名稱。
 */
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

/**
 * 在所有已知的客語資料中搜尋指定文字的發音。
 * @param {string} searchText - 要搜尋的文字。
 * @returns {Array<object>} 包含發音和來源的物件陣列。每個物件格式：{ pronunciation: string, source: string }
 */
function findPronunciationsInAllData(searchText) {
  let foundReadings = []; // 改用 let
  const uniqueEntries = new Set();

  if (!searchText || searchText.trim().length === 0) {
    console.log('Search text is empty, returning empty array.');
    return [];
  }
  const normalizedSearchText = searchText.trim();

  allKnownDataVars.forEach(dataVarName => {
    // dataVarName is like '四基', '海初'
    const dataObject = window[dataVarName];
    if (dataObject && dataObject.content && dataObject.name) {
      try {
        // 1. Construct dialectInfoForLevel for this dataVarName
        const 腔 = dataObject.name.substring(0, 1);
        const 級 = dataObject.name.substring(1);
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
        // Simplified from generate()
        if (腔 === '四') { 檔腔 = 'si'; } else if (腔 === '海') { 檔腔 = 'ha'; } else if (腔 === '大') { 檔腔 = 'da'; } else if (腔 === '平') { 檔腔 = 'rh'; } else if (腔 === '安') { 檔腔 = 'zh'; }
        if (級 === '基') { 目錄級 = '5'; 目錄另級 = '1'; } else if (級 === '初') { 目錄級 = '1'; } else if (級 === '中') { 目錄級 = '2'; 檔級 = '1'; } else if (級 === '中高') { 目錄級 = '3'; 檔級 = '2'; } else if (級 === '高') { 目錄級 = '4'; 檔級 = '3'; }

        const dialectInfoForLevel = {
          腔, 級, selected例外音檔,
          generalMediaYr: '112', // Assuming constant
          目錄級, 目錄另級, 檔腔, 檔級,
          fullLvlName: getFullLevelName(dataObject.name)
        };

        const vocabularyArray = csvToArray(dataObject.content);
        const sourceName = getFullLevelName(dataObject.name);
        vocabularyArray.forEach(line => {
          if (line.客家語 && line.客語標音) { // 確保客家語和標音都存在
            const isExact = line.客家語 === normalizedSearchText;
            const isPartial = !isExact && line.客家語.includes(normalizedSearchText);

            if (isExact) {
              const entryKey = `${line.客語標音}|${sourceName}|exact|${line.客家語}`;
              if (!uniqueEntries.has(entryKey)) {
                foundReadings.push({
                  pronunciation: line.客語標音,
                  source: sourceName,
                  isExactMatch: true,
                  originalTerm: line.客家語,
                  mandarinMeaning: line.華語詞義,
                  audioDetails: { lineData: { ...line }, dialectInfo: dialectInfoForLevel } // Store line data and dialect info
                });
                uniqueEntries.add(entryKey);
              }
            } else if (isPartial) {
              const entryKey = `${line.客語標音}|${sourceName}|partial|${line.客家語}`;
              // 增加結果數量限制，避免過多部分符合的結果
              if (!uniqueEntries.has(entryKey) && foundReadings.length < 50) {
                foundReadings.push({
                  pronunciation: line.客語標音,
                  source: sourceName,
                  isExactMatch: false,
                  originalTerm: line.客家語,
                  mandarinMeaning: line.華語詞義,
                  audioDetails: { lineData: { ...line }, dialectInfo: dialectInfoForLevel } // Store line data and dialect info
                });
                uniqueEntries.add(entryKey);
              }
            }
          }
        });
      } catch (e) {
        console.error(`處理資料 ${dataVarName} 時發生錯誤:`, e);
      }
    }
  });
  console.log(`Found ${foundReadings.length} readings for "${searchText}" before sorting/filtering in popup.`);
  return foundReadings;
}

/**
 * Helper function to construct audio URL for a term in the popup.
 * @param {object} lineData - The specific line data for the term (must include '編號').
 * @param {object} dialectInfo - Dialect and level specific info (腔, 級, selected例外音檔, etc.).
 * @returns {string|null} The audio URL or null if not constructible.
 */
function constructAudioUrlForPopup(lineData, dialectInfo) {
  if (!lineData || !lineData.編號 || !dialectInfo) return null;

  let mediaYr = dialectInfo.generalMediaYr || '112';
  let pre112Insertion詞 = '';
  let current目錄級 = dialectInfo.目錄級;
  // no[0] and no[1] from lineData.編號
  const noParts = lineData.編號.split('-');
  if (noParts.length < 2) return null;

  let no_0 = noParts[0]; // Original first part from CSV, e.g., "1", "12"

  // Step 1: General padding for single digit (applies to all before specific '初' logic)
  // This ensures "X" becomes "0X". "XX" remains "XX".
  if (no_0.length === 1 && !isNaN(parseInt(no_0))) {
    no_0 = '0' + no_0;
  }
  // Now no_0 is "0X" if original was "X", or "XX" if original was "XX".

  // Step 2: Specific padding for '初級' to make it three digits if it's two (e.g., "0X" -> "00X", "XX" -> "0XX")
  if (dialectInfo.級 === '初') {
    no_0 = '0' + no_0; // "01" -> "001", "12" -> "012"
  }

  let mediaNo = noParts[1]; // Default mediaNo from 編號
  if (mediaNo.length < 2 && !isNaN(parseInt(mediaNo))) mediaNo = '0' + mediaNo; // Add leading zero if single digit
  if (mediaNo.length < 3 && !isNaN(parseInt(mediaNo))) mediaNo = '0' + mediaNo; // Add second leading zero if two digits


  // Exception handling (simplified from buildTableAndSetupPlayback)
  const exceptionList = dialectInfo.selected例外音檔 || [];
  const exceptionIndex = exceptionList.findIndex(([編號]) => 編號 === lineData.編號);

  if (exceptionIndex !== -1) {
    const matchedElement = exceptionList[exceptionIndex];
    mediaYr = matchedElement[1] || mediaYr;
    mediaNo = matchedElement[2] || mediaNo;
    pre112Insertion詞 = 'w/'; // Assuming 'w/' for word exceptions
    if (dialectInfo.目錄另級 !== undefined) {
      current目錄級 = dialectInfo.目錄另級;
    }
  }

  const 詞目錄 = `${current目錄級}/${dialectInfo.檔腔}/${pre112Insertion詞}${dialectInfo.檔級}${dialectInfo.檔腔}`;
  
  let audioSrc = `https://elearning.hakka.gov.tw/hakka/files/cert/vocabulary/${mediaYr}/${詞目錄}-${no_0}-${mediaNo}.mp3`;

  // Specific override for 海陸中高級 4-261 (word audio)
  if (dialectInfo.fullLvlName === '海陸中高級' && lineData.編號 === '4-261') {
    audioSrc = 'https://elearning.hakka.gov.tw/hakka/files/dictionaries/3/hk0000014571/hk0000014571-1-2.mp3';
  }

  return audioSrc;
}

/**
 * 更新 Popup 的位置。
 * @param {HTMLElement} popupEl - Popup 元素。
 * @param {DOMRect} selectionRect - 文字選取範圍的邊界矩形。
 */
function updatePopupPosition(popupEl, selectionRect) {
  if (!popupEl || !selectionRect) return;

  // 先隱藏 popup (如果還沒顯示)，設定 display:block 來取得尺寸，然後再定位
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

  let popupTop = scrollY + selectionRect.bottom + 5; // 預設在選取區下方 5px
  let popupLeft = scrollX + selectionRect.left;

  // 檢查右邊界
  if (popupLeft + popupWidth > scrollX + viewportWidth - 10) {
    popupLeft = scrollX + viewportWidth - popupWidth - 10;
  }
  // 檢查左邊界
  if (popupLeft < scrollX + 10) {
    popupLeft = scrollX + 10;
  }
  // 檢查下邊界，若超出，嘗試移到選取區上方
  if (popupTop + popupHeight > scrollY + viewportHeight - 10) {
    let topAbove = scrollY + selectionRect.top - popupHeight - 5;
    if (topAbove > scrollY + 10) { // 檢查上方是否有足夠空間
      popupTop = topAbove;
    }
  }
  // 檢查上邊界 (主要用在移到上方後)
  if (popupTop < scrollY + 10) {
    popupTop = scrollY + 10;
  }

  popupEl.style.left = `${popupLeft}px`;
  popupEl.style.top = `${popupTop}px`;
  popupEl.style.visibility = 'visible'; // 定位完成後再顯示
  if (initialDisplay !== 'block' && popupEl.style.display === 'block' && !activeSelectionPopup) {
     // 如果是初次定位且 popup 應為隱藏，則恢復隱藏 (這主要給 showPronunciationPopup 控制)
  }
}

/**
 * 顯示選詞發音 Popup。
 * @param {string} selectedText - 被選取的文字。
 * @param {Array<object>} readings - 搜尋到的發音陣列。
 * @param {HTMLElement} popupEl - Popup 元素。
 * @param {HTMLElement} contentEl - Popup 內容區域元素。
 * @param {HTMLElement} backdropEl - Popup 背景元素。
 */
function showPronunciationPopup(selectedText, readings, popupEl, contentEl, backdropEl, anchorElementOrRect) {
  const showOtherAccentsToggle = document.getElementById('showOtherAccentsToggle');
  const popupTitleElement = document.getElementById('selectionPopupTitle');
  
  // 清除舊的錨點資訊
  lastAnchorElementForPopup = null;
  lastRectForPopupPositioning = null;
  let initialRect;

  if (anchorElementOrRect instanceof HTMLElement) {
    lastAnchorElementForPopup = anchorElementOrRect; // 儲存錨點元素
    initialRect = lastAnchorElementForPopup.getBoundingClientRect();
  } else if (anchorElementOrRect instanceof DOMRect) { // 若傳入的是 DOMRect
    lastRectForPopupPositioning = anchorElementOrRect; // 儲存錨點 DOMRect
    initialRect = anchorElementOrRect;
  } else {
    console.warn("傳入 showPronunciationPopup 的 anchorElementOrRect 無效:", anchorElementOrRect);
    // 若無有效錨點/rect，退回置中顯示
    popupEl.style.left = '50%';
    popupEl.style.top = '50%';
    popupEl.style.transform = 'translate(-50%, -50%)';
    popupEl.style.display = 'block';
    backdropEl.style.display = 'block';
    popupEl.focus();
    activeSelectionPopup = true;
    return;
  }

  // 1. 設定 Popup 標題
  if (popupTitleElement) {
    popupTitleElement.textContent = `尋「${selectedText}」个讀音`;
  }

  // --- 新增：預設關閉「顯示其他腔頭」開關 ---
  if (showOtherAccentsToggle) {
    showOtherAccentsToggle.checked = false;
    console.log('Reset "Show other accents" toggle to unchecked.'); // DEBUG_MSG
  }

  // 內部函式，用來實際產生列表
  function renderPronunciationList() {
    contentEl.innerHTML = ''; // 清空舊內容
    const showAllAccents = showOtherAccentsToggle ? showOtherAccentsToggle.checked : false;
    console.log(`Rendering list. Show all accents: ${showAllAccents}. Current active main dialect: ${currentActiveMainDialectName}, full level: ${currentActiveDialectLevelFullName}`); // DEBUG_MSG

    let displayReadings = [...readings]; // 複製一份來操作

    if (!showAllAccents) {
      // 若開關關閉，只顯示目前主要腔調的結果 (所有級別)
      displayReadings = displayReadings.filter(r => r.source.startsWith(currentActiveMainDialectName));
    }

    // 排序：1. 完全符合優先, 2. 目前腔調優先
    displayReadings.sort((a, b) => {
      // 優先顯示完全符合的
      if (a.isExactMatch && !b.isExactMatch) return -1;
      if (!a.isExactMatch && b.isExactMatch) return 1;

      // 2. 目前主要腔調優先 (所有級別)
      const aIsCurrentMainDialect = a.source.startsWith(currentActiveMainDialectName);
      const bIsCurrentMainDialect = b.source.startsWith(currentActiveMainDialectName);
      if (aIsCurrentMainDialect && !bIsCurrentMainDialect) return -1;
      if (!aIsCurrentMainDialect && bIsCurrentMainDialect) return 1;
      
      // 3. 若符合類型和主要腔調都相同，按原詞目字母排序
      if (a.originalTerm < b.originalTerm) return -1;
      if (a.originalTerm > b.originalTerm) return 1;

      // 4. 若原詞目也相同，按完整來源名稱排序 (例如 四縣初級 會在 四縣基礎級 後面)
      if (a.source < b.source) return -1;
      if (a.source > b.source) return 1;

      return 0; // 都相同
    });

    if (displayReadings.length > 0) {
      const accordionContainer = document.createElement('div');
      accordionContainer.className = 'accordion-container'; // You might want to style this container

      displayReadings.forEach(reading => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'accordion-item';

        const headerBtn = document.createElement('button');
        headerBtn.className = 'accordion-header';
        let headerText = `<span class="pronunciation-text">${reading.pronunciation}</span>`;
        if (!reading.isExactMatch) {
          // If not an exact match, show the original term it was found in
          headerText = `<span class="pronunciation-text">${reading.pronunciation} (詞目: ${reading.originalTerm})</span>`;
        }

        // Construct audio URL using the new helper function
        const audioUrl = constructAudioUrlForPopup(reading.audioDetails.lineData, reading.audioDetails.dialectInfo);
        let audioElementHTML = '';
        if (audioUrl) {
          // 改成播放按鈕，節省空間
          audioElementHTML = `
            <button class="popup-audio-play-btn" data-audio-src="${audioUrl}" title="播放讀音" 
                    style="background:none; border:none; color:inherit; font-size:1.1em; padding:0 5px; margin-left:8px; vertical-align:middle; cursor:pointer;">
              <i class="fas fa-volume-up"></i>
            </button>`;
        }

        headerBtn.innerHTML = `
          ${headerText}
          <span class="pronunciation-source">(${reading.source})</span>
          ${audioElementHTML}
          <span class="indicator">+</span>`;

        const panelDiv = document.createElement('div');
        panelDiv.className = 'accordion-panel';
        
        let panelContent = `<p><strong>華語詞義：</strong> ${(reading.mandarinMeaning || '無資料').replace(/"/g, '')}</p>`;
        if (!audioUrl) { // If audio was moved to header and there's no URL, show message in panel
          panelContent += `<p><em>(無音檔資訊)</em></p>`;
        }
        panelDiv.innerHTML = panelContent;

        itemDiv.appendChild(headerBtn);
        itemDiv.appendChild(panelDiv);
        accordionContainer.appendChild(itemDiv);

        // --- 新增：為播放按鈕加上事件處理 ---
        const playButton = headerBtn.querySelector('.popup-audio-play-btn');
        if (playButton) {
            playButton.addEventListener('click', (e) => {
                // e.stopPropagation(); // 拿掉這行，讓點擊播放時也會觸發 accordion 開合
                const audioSrc = playButton.dataset.audioSrc;
                if (audioSrc) {
                    // 若有其他 popup 音檔在播放，先停止
                    if (window.currentPopupAudio && typeof window.currentPopupAudio.pause === 'function') {
                        window.currentPopupAudio.pause();
                        window.currentPopupAudio.currentTime = 0;
                    }
                    window.currentPopupAudio = new Audio(audioSrc);
                    const iconElement = playButton.querySelector('i');
                    const originalIconClasses = iconElement ? iconElement.className : '';

                    if (iconElement) iconElement.className = 'fas fa-spinner fa-spin'; // 播放前顯示讀取中

                    window.currentPopupAudio.play().catch(err => {
                        console.error("播放 popup 音檔失敗:", err);
                        if (iconElement) iconElement.className = originalIconClasses; // 播放失敗恢復圖示
                    });

                    window.currentPopupAudio.onended = () => {
                        if (iconElement) iconElement.className = originalIconClasses; // 播放完畢恢復圖示
                        window.currentPopupAudio = null;
                    };
                    window.currentPopupAudio.onerror = () => { // 錯誤時也恢復圖示
                        if (iconElement) iconElement.className = originalIconClasses;
                        window.currentPopupAudio = null;
                    };
                }
            });
        }

        // Add click event listener to the header button
        headerBtn.addEventListener('click', () => {
          headerBtn.classList.toggle('active');
          const indicator = headerBtn.querySelector('.indicator');
          if (panelDiv.style.maxHeight) {
            panelDiv.style.maxHeight = null;
            if (indicator) indicator.textContent = '+';
          } else {
            panelDiv.style.maxHeight = panelDiv.scrollHeight + "px";
            if (indicator) indicator.textContent = '−';
          }
        });
      });
      contentEl.appendChild(accordionContainer);
    } else {
      // 根據開關狀態和原始搜尋結果來決定提示訊息
      if (showAllAccents) { // 開關打開，但所有腔調都尋無
        contentEl.innerHTML = '<p class="popup-not-found">在所有腔頭中都尋無讀音。還係縮短尋个字詞？</p>';
      } else { // 開關關閉
        if (readings.some(r => !r.source.startsWith(currentActiveMainDialectName))) { // 目前主要腔調尋無，但其他主要腔調有結果
          contentEl.innerHTML = `<p class="popup-not-found">在${currentActiveMainDialectName}腔頭尋無讀音。試看啊縮短尋个字詞？</p>`;
        } else { // 所有腔調都尋無，或者其他腔調也尋無
          contentEl.innerHTML = '<p class="popup-not-found">尋無讀音。還係縮短尋个字詞？</p>';
        }
      }
    }
  }

  // 設定開關事件監聽 (如果開關存在)
  if (showOtherAccentsToggle) {
    // 為確保監聽器不重複添加，可以先移除再添加，或用 cloneNode 技巧 (如先前範例)
    // 簡單起見，這裡直接添加，假設 popup 每次顯示都會重新執行這段
    showOtherAccentsToggle.onchange = renderPronunciationList; // 用 onchange 確保覆蓋
  }

  renderPronunciationList(); // 第一次顯示時呼叫

  // --- 定位邏輯 ---
  if (initialRect) {
    popupEl.style.display = 'block'; // 確保 popup 是 block 狀態分 updatePopupPosition 計算
    updatePopupPosition(popupEl, initialRect);
  } else {
    // 若無 selectionRect (理論上不應發生)，退回原本置中方式
    popupEl.style.left = '50%';
    popupEl.style.top = '50%';
    popupEl.style.transform = 'translate(-50%, -50%)';
    popupEl.style.display = 'block';
    console.warn("Selection rect not provided to showPronunciationPopup, centering as fallback.");
  }

  backdropEl.style.display = 'block';
  popupEl.focus(); // 將焦點移到 popup，方便鍵盤操作 (例如 Esc 關閉)
  activeSelectionPopup = true;
}

/**
 * 隱藏選詞發音 Popup。
 * @param {HTMLElement} popupEl - Popup 元素。
 * @param {HTMLElement} backdropEl - Popup 背景元素。
 */
function hidePronunciationPopup(popupEl, backdropEl) {
  if (popupEl) popupEl.style.transform = ''; // 清除可能存在的 transform
  if (popupEl) popupEl.style.display = 'none';
  if (backdropEl) backdropEl.style.display = 'none';
  lastAnchorElementForPopup = null; // 清除儲存的錨點 HTML 元素
  lastRectForPopupPositioning = null; // 清除儲存的 DOMRect
  activeSelectionPopup = false;
  if (isMobileDevice()) { // 若是手機，也隱藏查詞按鈕
    hideMobileLookupButton();
  }
}

// *** MODIFIED: Added generatedArea parameter ***
function handleTextSelectionInSentence(event, popupEl, contentEl, backdropEl, generatedArea) {
  let target = event.target;
  let sentenceSpan = target.closest('span.sentence');

  if (!sentenceSpan || !generatedArea.contains(sentenceSpan)) return; // *** MODIFIED: Use generatedArea ***

  const selection = window.getSelection();
  if (selection.rangeCount > 0) {
    const selectedText = selection.toString().trim();
    if (selectedText.length > 0 && selectedText.length <= 15) {
      console.log('選中例句文字:', selectedText); // DEBUG_MSG
      const readings = findPronunciationsInAllData(selectedText);

      let anchorElement = null;
      const trElement = sentenceSpan.closest('tr');

      if (trElement) {
        const exampleTd = trElement.cells[2]; // 第三大格係例句欄
        if (exampleTd) {
          // 優先尋例句个 audio 元素 (毋係 data-skip='true' 个)
          anchorElement = exampleTd.querySelector('audio.media:not([data-skip="true"])');
        }
      }
      // 如果尋無 audio，或者尋無 tr/td，就用 sentenceSpan 本身做錨點
      if (!anchorElement) {
        anchorElement = sentenceSpan;
      }

      if (anchorElement) {
        showPronunciationPopup(selectedText, readings, popupEl, contentEl, backdropEl, anchorElement);
      } else {
        // 極端个 fallback，理論上 sentenceSpan 一定會在
        const rect = selection.getRangeAt(0).getBoundingClientRect();
        showPronunciationPopup(selectedText, readings, popupEl, contentEl, backdropEl, rect);
      }
    }
  }
}

// --- 選詞發音 Popup 相關函式結束 ---
