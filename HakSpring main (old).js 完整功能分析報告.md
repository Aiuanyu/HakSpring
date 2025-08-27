### 總覽

本文件旨在對 `main (old).js` 檔案進行全面的功能拆解與分析。檔案的核心邏輯圍繞著一個主 `DOMContentLoaded` 事件監聽器，負責初始化所有功能，包括資料載入、UI 互動、音檔播放、搜尋、書籤管理等。

### 一、全域變數 (Global Variables)

這些變數在檔案頂層宣告，用於儲存整個應用程式的狀態 (state)。

- **`BASE_TITLE` (常數)**
    
    - **用途**：儲存網頁的基礎標題 `客源翠 HakSpring`。
        
    - **說明**：`updatePageTitle` 函式會使用此變數來組合動態標題。
        
- **`isCrossCategoryPlaying`**
    
    - **用途**：布林值 (boolean) 旗標，用於標記是否正在進行「跨類別連續播放」。
        
    - **說明**：當一個類別的音檔播放完畢時，如果此旗標為 `true`，程式會自動跳到下一個類別繼續播放。
        
- **`categoryList`**
    
    - **用途**：陣列 (array)，儲存當前所選腔調與級別下的所有分類名稱。
        
    - **說明**：在 `generate` 函式中被填充，用於跨類別播放時確定下一個類別為何。
        
- **`currentCategoryIndex`**
    
    - **用途**：數字 (number)，記錄 `categoryList` 中目前正在播放的類別索引。
        
    - **說明**：用於導航至上一個或下一個類別。
        
- **`currentAudio`**
    
    - **用途**：HTML Audio 元素物件，指向目前正在播放或已暫停的音檔。
        
    - **說明**：這是播放控制（暫停、繼續、停止）的核心。
        
- **`isPlaying`**
    
    - **用途**：布林值旗標，標記目前是否有音檔正在播放流程中（包含播放與暫停狀態）。
        
    - **說明**：`true` 表示播放已開始，`false` 表示已停止。
        
- **`isPaused`**
    
    - **用途**：布林值旗標，標記 `isPlaying` 為 `true` 的情況下，音檔是否處於暫停狀態。
        
- **`currentAudioIndex`**
    
    - **用途**：數字，記錄目前播放到該類別中的第幾個音檔（一個詞彙最多有詞、句兩個音檔）。
        
- **`finishedTableName` / `finishedCat`**
    
    - **用途**：字串，暫存剛播放完畢的表格名稱（如 `四縣初級`）和類別名稱。
        
    - **說明**：用於在跨類別播放或播放結束時，從 `localStorage` 中移除對應的書籤。
        
- **`loadedViaUrlParams`**
    
    - **用途**：布林值旗標，標記頁面是否是透過 URL 參數（例如書籤連結）載入的。
        
    - **說明**：用於觸發自動播放 Modal、處理 iOS 自動播放限制，以及在儲存新書籤後清除 URL 參數。
        
- **`activeSelectionPopup`**
    
    - **用途**：布林值旗標，標記「選詞查音」的彈出視窗 (Popup) 目前是否為開啟狀態。
        
- **`currentActiveDialectLevelFullName` / `currentActiveMainDialectName`**
    
    - **用途**：字串，分別儲存目前作用中的完整腔調級別名稱（如 `四縣初級`）和主要腔調名稱（如 `四縣`）。
        
    - **說明**：供「選詞查音」功能判斷上下文腔調，以及更新 UI 顯示。
        
- **`lastAnchorElementForPopup` / `lastRectForPopupPositioning`**
    
    - **用途**：分別儲存觸發 Popup 的 HTML 元素或其位置矩形 (DOMRect)。
        
    - **說明**：用於在視窗大小改變時，能夠重新定位 Popup 的位置。
        
- **`preprocessedDataCache` / `indexedDataCache`**
    
    - **用途**：物件 (object)，應用程式的記憶體快取。
        
    - **說明**：`preprocessedDataCache` 儲存解析後的原始詞彙資料；`indexedDataCache` 儲存為了快速搜尋而建立的索引，以客語詞彙為 key。
        
- **`mobileLookupButton` / `lastSelectionRectForMobile`**
    
    - **用途**：HTML 元素與 DOMRect，用於在行動裝置上實現「選詞查音」按鈕的功能。
        

### 二、常數與資料結構

這些是在全域範疇中定義的靜態資料。

- **`allKnownDataVars` / `allKnownGipDataVars`**
    
    - **用途**：陣列，分別儲存所有認證詞彙和教典資料的 JS 變數名稱。
        
    - **說明**：`preprocessAllData` 函式會遍歷此列表來建立搜尋索引。
        
- **`allData` / `gipData`**
    
    - **用途**：物件，將腔調名稱映射到對應的資料陣列。
        
    - **說明**：這是搜尋功能的主要資料來源，`performSearch` 會根據使用者選擇的腔調從這裡提取資料。
        
- **`DIALECT_CODE_TO_NAME` / `DIALECT_NAME_TO_CODE`**
    
    - **用途**：物件，提供腔調的中文名稱與 URL 參數所用的代碼（如 `si`, `ha`）之間的雙向映射。
        

### 三、核心功能函式

這些是驅動應用程式主要邏輯的大型函式。

- **`generate(content, initialCategory = null, targetRowId = null)`**
    
    - **用途**：**最核心的函式之一**。負責在使用者選擇一個腔調級別後，產生對應的詞彙內容。
        
    - **說明**：
        
        1. 接收一個資料物件 (`content`)，例如 `四初`。
            
        2. 解析腔調、級別等資訊，設定音檔路徑等變數。
            
        3. 清空先前的顯示內容 (`#generated`)。
            
        4. 動態地為所有「分類」選項按鈕綁定 `change` 事件監聽器。
            
        5. 當分類被選中時，呼叫 `buildTableAndSetupPlayback` 來實際建立 HTML 表格。
            
        6. 處理從書籤或 URL 載入的特殊情況，能直接跳轉到指定類別 (`initialCategory`) 和指定詞彙 (`targetRowId`)。
            
- **`buildTableAndSetupPlayback(category, vocabularyArray, dialectInfo, autoPlayTargetRowId = null)`**
    
    - **用途**：根據指定的分類，從詞彙陣列中篩選資料，並建立顯示詞彙的 HTML `<table>`。
        
    - **說明**：
        
        1. 更新頁面頂部的摘要資訊和網頁標題。
            
        2. 過濾出屬於 `category` 的詞彙。
            
        3. 處理「空類別」的特殊情況。
            
        4. 遍歷每一個詞彙項目，建立表格的每一列 (`<tr>`)，包含編號、書籤按鈕、播放按鈕、客語詞彙（含 ruby 標音）、華語詞義、例句、翻譯等。
            
        5. 動態建立 `<audio>` 元素，並根據規則（包含例外音檔、音檔缺失清單）設定正確的音檔 URL。
            
        6. 為所有書籤按鈕、播放按鈕綁定 `click` 事件。
            
        7. 建立並管理頁首的「播放/暫停/停止」控制按鈕。
            
        8. 定義內嵌的 `playAudio` 和 `handleAudioEnded` 函式來控制播放流程。
            
        9. 處理自動捲動到 `autoPlayTargetRowId` 並觸發自動播放的邏輯。
            
- **`performSearch(page = 1, itemsPerPage = 50)`**
    
    - **用途**：執行搜尋功能。
        
    - **說明**：
        
        1. 讀取搜尋框的關鍵字、選擇的腔調與搜尋模式（尋客詞/尋華語）。
            
        2. 從 `allData` 和 `gipData` 中組合對應腔調的所有詞彙資料。
            
        3. 根據搜尋模式（客語或華語）過濾資料，並支援模糊比對和正規化（忽略聲調）。
            
        4. 對搜尋結果進行排序，優先顯示完全匹配的項目。
            
        5. 更新 URL，將搜尋條件加入查詢參數，以便分享搜尋結果。
            
        6. 呼叫 `displayQueryResults` 來顯示結果。
            
- **`displayQueryResults(...)`**
    
    - **用途**：將 `performSearch` 產生的結果渲染成 HTML 表格。
        
    - **說明**：
        
        1. 處理分頁邏輯。
            
        2. 將結果按「符合類型」（例如：詞句都有、僅詞彙、僅例句）進行分類，並加上小標題。
            
        3. 為每一個結果項目建立表格列，並用 `<mark>` 標籤高亮關鍵字。
            
        4. 動態建立分頁按鈕。
            

### 四、輔助工具函式

這些是較小、功能單一的函式，被核心函式呼叫。

- **`trackEvent(action, category, label)`**：傳送事件到 Google Analytics。
    
- **`updatePageTitle(titleParts = [])`**：根據目前狀態更新網頁 `<title>`。
    
- **`formatPhoneticForDisplay(text)`**：格式化標音字串，移除多餘空格。
    
- **`parseUnifiedCsv(csvString)`**：將 JS 物件中的 CSV 格式字串解析為物件陣列。
    
- **`preprocessAllData()`**：在頁面載入時，遍歷所有資料變數，建立 `indexedDataCache` 搜尋索引。
    
- **`updateResultsSummaryVisibility()`**：根據 `#results-summary` 是否有內容來顯示或隱藏它。
    
- **`extractDialectLevelCodes(tableName)`**：從 `四縣初級` 這樣的名稱中解析出 URL 用的代碼 `si` 和 `1`。
    
- **`countSyllables(romanizationText)`**：計算羅馬拼音的音節數，用於搜尋結果排序。
    
- **`updateSearchDialect(dialectName)`**：當學習模式切換腔調時，同步更新搜尋面板的腔調選項。
    
- **`大埔高降異化()` / `大埔中遇低升()` / `大埔低升異化()`**：三個獨立函式，用於對 `rt` 標籤內的拼音進行 DOM 操作，加上變調標示。
    
- **`updateProgressDropdown()`**：讀取 `localStorage` 中的書籤，動態更新頂部的進度下拉選單。
    
- **`mapTableNameToDataVar(tableName)`**：`updateProgressDropdown` 的輔助函式，將 `四縣初級` 映射回 JS 變數名 `四初`。
    
- **`saveBookmark(...)`**：將播放進度（書籤）儲存到 `localStorage`，並管理書籤列表（最多 10 筆，有汰換邏輯）。
    
- **`debounce(func, wait, immediate)`**：標準的 debounce 函式，用於防止事件（如 `resize`）在短時間內被過度頻繁觸發。
    
- **`handleResizeActions()`**：由 `resize` 事件觸發，負責呼叫 `scrollToNowPlayingElement` 和 `adjustAllRubyFontSizes` 等需要重新計算佈局的函式。
    
- **`scrollToNowPlayingElement()`**：捲動頁面，使正在播放的詞彙列保持在畫面中央。
    
- **`isFirefox()` / `adjustRubyFontSize(...)` / `adjustAllRubyFontSizes(...)`**：一組函式，專門處理 Firefox 瀏覽器中 ruby 標音文字可能溢出的問題，動態縮小字體。
    
- **`adjustHeaderFontSizeOnOverflow()`**：動態調整頁首 (`#header`) 內元素的字體大小，以防止在小螢幕上換行或溢出。
    
- **`isMobileDevice()`**：判斷目前是否為行動裝置。
    
- **`createMobileLookupButton(...)` / `showMobileLookupButton(...)` / `hideMobileLookupButton(...)`**：一組函式，用於在行動裝置上建立、顯示、隱藏「尋讀音」的浮動按鈕。
    
- **`getFullLevelName(dataVarNameStr)`**：`mapTableNameToDataVar` 的反向操作，將 `四初` 轉換回 `四縣初級`。
    
- **`isSourceMatchingDialect(source, dialect)`**：判斷資料來源是否符合當前腔調（特別處理南四縣）。
    
- **`findPronunciationsInAllData(searchText)`**：從 `indexedDataCache` 中尋找指定文字的發音，是「選詞查音」功能的核心。
    
- **`constructAudioUrlForPopup(...)`**：為「選詞查音」Popup 中的音檔產生正確的 URL。
    
- **`updatePopupPosition(...)` / `showPronunciationPopup(...)` / `hidePronunciationPopup(...)`**：一組函式，管理「選詞查音」Popup 的顯示、定位與隱藏。
    
- **`handleTextSelectionInSentence(...)`**：處理在例句中選取文字的事件，觸發 Popup。
    

### 五、事件監聽器 (Event Listeners)

所有事件監聽器都在 `document.addEventListener('DOMContentLoaded', ...)` 的回呼函式中設定。

- **`window.addEventListener('popstate', handleUrlChange)`**：監聽瀏覽器的前進/後退按鈕，呼叫 `handleUrlChange` 重新解析 URL 參數並更新頁面內容。
    
- **`searchInput.addEventListener('focus', ...)`**：當搜尋框獲得焦點時，顯示搜尋選項（腔調、模式）的 Popup。
    
- **`searchInput.addEventListener('input', ...)`**：當使用者在搜尋框輸入時，自動判斷是否為羅馬拼音，並切換搜尋模式。
    
- **`document.addEventListener('click', ...)`**：點擊頁面任何地方時，如果點擊的不是搜尋框區域，則隱藏搜尋選項 Popup。
    
- **`searchDialectRadios.forEach(...)`**：監聽搜尋腔調的變更，並將選擇儲存到 `localStorage`。
    
- **`searchInput.addEventListener('keypress', ...)`**：在搜尋框按下 Enter 鍵時，觸發 `performSearch`。
    
- **`searchDialectRadios.forEach(...)` / `searchModeRadios.forEach(...)`**：當腔調或模式改變時，如果搜尋框有內容，也觸發 `performSearch`。
    
- **`dialectLevelLinks.forEach(...)`**：監聽主控板中所有腔調級別連結的點擊，觸發 `generate` 函式。
    
- **`window.onscroll`**：監聽頁面捲動，當捲動超過一定距離時，顯示「回到頂部」按鈕。
    
- **`backToTopBtn.addEventListener('click', ...)`**：點擊「回到頂部」按鈕時，將頁面捲動到最上方。
    
- **`progressDropdown.addEventListener('change', ...)`**：當使用者從進度下拉選單選擇一個書籤時，讀取書籤資訊並呼叫 `generate` 跳轉到對應進度。
    
- **`window.addEventListener('resize', debounce(handleResizeActions, 250))`**：監聽視窗大小改變事件（使用 debounce），觸發 `handleResizeActions` 來調整佈局和字體。
    
- **`document.addEventListener('selectionchange', ...)` (行動裝置)**：在行動裝置上，監聽文字選取變化，觸發 `debouncedMobileSelectionHandler` 來顯示查詞按鈕。
    
- **`contentContainer.addEventListener('mouseup', ...)` (桌機)**：在桌機上，監聽滑鼠在內容區域的彈起事件，觸發 `handleTextSelectionInSentence` 進行選詞查音。
    
- **`selectionPopupCloseBtn.addEventListener('click', ...)` / `selectionPopupBackdrop.addEventListener('click', ...)`**：點擊關閉按鈕或背景遮罩時，隱藏「選詞查音」Popup。
    
- **`document.addEventListener('keydown', globalKeydownHandler)`**：監聽全域鍵盤事件，處理 `Esc` 鍵（關閉 Popup 或停止播放）和 `Space` 鍵（暫停/繼續播放）。
    
- **`infoButton.addEventListener('click', ...)` / `infoModalCloseBtn.addEventListener('click', ...)`**：處理「說明」按鈕的點擊，顯示/隱藏說明 Modal。
    
- **`document.addEventListener('click', ...)` (事件委派)**：一個全域的點擊監聽器，用於在點擊任何按鈕後自動移除其焦點狀態 (`blur()`)，改善鍵盤操作體驗。