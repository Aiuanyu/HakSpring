# AGENTS.md：AI 開發指南

本檔案為協助 AI（人工智慧）開發者了解並貢獻「客源翠 HakSpring」專案而設。

## 專案目標

「客源翠 HakSpring」是一個線上的客語詞典與分類學習網站。本專案提供多種客語腔調的詞彙查詢，以及分類詞彙的學習功能。

## 技術棧 (Tech Stack)

- **前端 (Frontend)**: 本專案使用 **Vanilla JavaScript**，並無使用任何主要的前端框架（如 React, Vue, Angular）。所有 DOM 操作與狀態管理皆透過原生瀏覽器 API 處理。
- **資料處理 (Data Processing)**: 使用 Python 腳本 (`process_all_data.py`) 進行資料轉換。
- **相依套件 (Dependencies)**: 外部函式庫（如 FontAwesome）是透過 CDN 載入，專案沒有使用 npm 或其他套件管理器。

## 核心架構與流程 (Core Architecture & Workflow)

### 架構原則 (Architectural Principles)

- **客戶端為主、離線優先 (Client-heavy, Offline-First)**: 大部分的應用程式邏輯都在瀏覽器中執行，並透過 IndexedDB 進行全面的本地資料快取。
- **事件驅動 (Event-Driven)**: 透過全域的鍵盤事件監聽和 UI 事件綁定來進行組件間的通訊。
- **主要進入點 (Main Entry Point)**: 應用程式的初始化由 `main.js` 中的 `initializeApp()` 函式協調。

### 資料處理流程 (Data Processing Pipeline)

1.  **原始資料 (Source)**: 位於 `data/cert/*.csv` 和 `data/gip/*.csv`。若要修改詞彙，請編輯這些檔案。
2.  **處理腳本 (Processing)**: 執行 `python process_all_data.py`。此腳本會將 CSV 轉換、統一格式，並產生 JSON 檔案。
3.  **產出檔案 (Output)**: 腳本會在原始檔旁產生對應的 `.json` 檔案。**請勿直接編輯 .json 檔**。

### 客戶端資料管理 (Client-Side Data Management)

- **資料庫 (Database)**: 前端會將處理過的 `.json` 檔案載入並儲存到瀏覽器的 **IndexedDB** (`HakkaDataDB`) 中。
- **資料區塊 (Chunking)**: 大型資料集會被自動切割成 500 筆記錄的區塊 (chunks) 儲存。
- **搜尋索引 (Search Index)**: 應用程式會在記憶體中建立一個搜尋索引 (`indexedDataCache`) 以加速查詢。
- **版本控制 (Versioning)**: 應用程式透過 `data/data_version.json` 檔案來追蹤資料版本。開發時可使用 `?force-refresh=true` URL 參數來強制清除快取。

### 音檔 URL 規則 (Audio URL Structure)

- **URL 結構**: 音檔的 URL 是根據腔調、級別、單元等資訊動態產生的。詳細的規則定義在 `URL patterns.csv` 檔案中。
- **例外處理**: `exclusions.js` 和 `NAmedias.js` 用於記錄和處理無法取得的音檔，屬於音檔的例外管理。

### 標音與音節處理慣例 (Phonetics & Syllable Processing Conventions)
- **忽略括號內的註記**: 在處理音節數計算、聽力題干擾項挑選，或未來處理特定地區腔調（如南四縣音、饒平卓蘭桃園音）時，若客家語或標音欄位中出現 `【】` 括號（例如 `【南】`、`【卓】`），在計算音節或比對相似度時**必須**將括號及其內部文字濾除（例如使用 `replace(/【.*?】/g, '')`）。此邏輯在遊戲出題 (`question-gen.js`) 與主表資料處理腳本中應保持同步留意，避免資料格式更新影響出題邏輯。

## 開發工具 (Developer Utilities)

專案中包含一些實用的開發工具（位於根目錄的 `.html` 檔案），可以幫助您驗證資料的完整性：

- `invalidMediaChecker.html`: 用於檢查音檔連結是否有效。
- `table-extractor.html`: 用於從應用程式中匯出帶有附加元數據的 CSV 檔案。

## 字詞代號
- `Romaine` = `Romanizer`、「蘿蔓生菜」= 羅馬字轉換工具模組

## Agent Coding Conventions
- **Preserve existing comments:** When modifying code, do not remove or alter existing comments unless they are clearly outdated or incorrect. If you rewrite a block of code, make sure to carry over the original comments.

## 檔案操作慣例 (File Operation Conventions)
- **確認檔案存在**: 在執行任何建立新檔案的指令（例如 `create_file`）之前，必須先用 `ls` 指令確認該檔案是否已存在。
- **理解使用者意圖**: 若目標檔案已存在，應先用 `read_file` 讀取其內容。必須理解使用者的意圖很可能是要「修改」或「新增內容」到現有檔案，而不是完全「覆寫」。除非使用者明確指示要覆寫，否則應優先考慮使用 `replace_with_git_merge_diff` 或其他非破壞性的方式進行修改。

## 提交慣例 (Submission Conventions)
- **語意化 PR 標題**: 在建立 Pull Request (PR) 時，標題應清楚、簡潔地總結該次修改的核心內容，再加上要解決的 issue 編號。一個好的標題能讓團隊成員快速理解變更的目的。例如，使用 `feat: 新增用戶認證功能（整 #79）` 或 `fix: 修正頁首跑版問題（整 #116）`，而不是模糊的 `更新檔案` 或完全看不出意圖的 `Pull request for issue #79`。

## UI 元件慣例

- **暗色主題支援 (Dark Mode Support)**：所有新个 GUI 元件（例如按鈕、彈出視窗、面板）都愛包含對應个暗色主題樣式 (`@media (prefers-color-scheme: dark)`)，來確保視覺風格一致。

### Modal 視窗

- **加新个 Modal**：若愛加上新个全螢幕 modal，佢个結構摎行為愛同既有个 `#infoModal`、`#lookupHelpModal` 一致。
- **HTML 結構**：新 modal 愛有一个根元素，包含 `.modal-overlay` class，還有一個子元素包含 `.modal-dialog` class。Dialog 內部愛有 `.modal-header`、`.modal-body`，還做得選愛無愛加 `.modal-footer`。
- **CSS 樣式**：為著確保樣式一致，愛將新 modal 个 ID 加到 `style.css` 裡肚既有个群組選擇器。這包含基本樣式、暗色主題樣式，還有其他共享屬性。
- **JavaScript 邏輯**：顯示／隱藏 modal 个邏輯愛寫在 `main.js` 个 `initializeAppUI` 函式裡肚。用 `style.display = 'flex'` 來顯示 modal，用 `style.display = 'none'` 來隱藏。

### 頁首按鈕

- **樣式**：加到主要頁首（`<h3>` id=`header`）个按鈕，樣式愛一致。愛將新按鈕个 ID 加到 `style.css` 裡肚个群組選擇器（`#infoButton, #showRomanizerBtn, ...`），來套用正確个基本摎懸停樣式。

### 協助說明內容

- **用 Markdown 做內容**：Modal 裡肚个協助說明文字或其他靜態內容，愛獨立建立 `.md` 檔案，放在專案个根目錄（例如 `info.md`, `lookup.md`）。
- **動態載入**：這兜內容愛在執行个時節，用 `fetch` API 摎 `marked.js` library（專案既經包含）來載入並渲染到 modal 裡肚。恁樣做做得將內容摎 HTML 結構分開。

## 詳細文件參考 (Detailed Documentation Reference)

本檔案是專案的快速入門指南。更詳細的設計與架構文件，請參考以下的 DeepWiki 頁面：

- [User Guide](https://deepwiki.com/Aiuanyu/HakSpring/2-user-guide)
- [Application Architecture](https://deepwiki.com/Aiuanyu/HakSpring/3-application-architecture)
- [Frontend Application](https://deepwiki.com/Aiuanyu/HakSpring/4-frontend-application)
	- [HTML Structure and Entry Point](https://deepwiki.com/Aiuanyu/HakSpring/4.1-html-structure-and-entry-point)
	- [User Interface Design and Styling](https://deepwiki.com/Aiuanyu/HakSpring/4.2-user-interface-design-and-styling)
	- [Core Application Logic](https://deepwiki.com/Aiuanyu/HakSpring/4.3-core-application-logic)
	- [Romanization Tool](https://deepwiki.com/Aiuanyu/HakSpring/4.4-romanization-tool)
- [Features and Functionality](https://deepwiki.com/Aiuanyu/HakSpring/5-features-and-functionality)
	- [Dictionary Search System](https://deepwiki.com/Aiuanyu/HakSpring/5.1-dictionary-search-system)
	- [Vocabulary Learning Mode](https://deepwiki.com/Aiuanyu/HakSpring/5.2-vocabulary-learning-mode)
	- [Audio Playback and Controls](https://deepwiki.com/Aiuanyu/HakSpring/5.3-audio-playback-and-controls)
- [Data Infrastructure](https://deepwiki.com/Aiuanyu/HakSpring/6-data-infrastructure)
	- [Data Processing Pipeline](https://deepwiki.com/Aiuanyu/HakSpring/6.1-data-processing-pipeline)
	- [Client-Side Data Management](https://deepwiki.com/Aiuanyu/HakSpring/6.2-client-side-data-management)
	- [Audio File Management](https://deepwiki.com/Aiuanyu/HakSpring/6.3-audio-file-management)
- [Developer Tools](https://deepwiki.com/Aiuanyu/HakSpring/7-developer-tools)
	- [Audio Validation Tool](https://deepwiki.com/Aiuanyu/HakSpring/7.1-audio-validation-tool)
	- [Data Processing Scripts](https://deepwiki.com/Aiuanyu/HakSpring/7.2-data-processing-scripts)
	- [Data Export Tool](https://deepwiki.com/Aiuanyu/HakSpring/7.3-data-export-tool)
- [Reference and Configuration](https://deepwiki.com/Aiuanyu/HakSpring/8-reference-and-configuration)
	- [URL Patterns and Data Formats](https://deepwiki.com/Aiuanyu/HakSpring/8.1-url-patterns-and-data-formats)
	- [Supporting Assets and Configuration](https://deepwiki.com/Aiuanyu/HakSpring/8.2-supporting-assets-and-configuration)

## 學習進度（SRS）資料規範

> **儲存策略**：學習進度存 `localStorage`（key `hakkaLearningProgress`），**不存 IndexedDB**。IndexedDB（`HakkaDataDB`）在本專案只是字典 JSON 快取，會被 `?force-refresh=true` 清掉；進度與書籤（`hakkaBookmarks`）一樣走 localStorage，未來一併經 Supabase 同步。

- **`progressKey` 精簡鍵**: 唯一字串鍵，**一旦使用者開始累積進度就不可更改**，否則所有進度會對不上、形同清空。
  - 格式：`${source首字}${dataVarName}${編號}|${題型}`，`source` 首字 `c`=cert、`g`=gip。
    - CERT 例：`c四基1-1|m`（`c` + `四基` + `1-1` + 題型 `m`）
    - GIP 例：`g海12345|m`（`g` + `海` + `序號` + 題型 `m`）
  - `dataVarName` 直接用既有兩字碼（`四基`、`海中高`…），不展開成完整名。
  - CERT `編號`（如 `1-1`）只在「同一個腔+級檔案內」唯一，故 `dataVarName` 段不可省。
  - **題型段（尾段 `|x`）**：`m` = 目前唯一題型「看漢字+拼音→選華語」。不同題型是不同記憶技能，各題型各自一筆進度、互不干擾。未來新題型用新代碼（`|a`、`|b`…），**key 格式本身不再變**，只是多出新紀錄。
  - 產生 key 的邏輯集中在 `js/game/game-data.js` 的 `generateProgressKey()`（含 `QUESTION_MODE_DEFAULT`），全專案只走這一處。
- **localStorage Schema**: `localStorage['hakkaLearningProgress']` 是一個 JSON 物件，以 `progressKey` 為屬性名，**值為定長陣列**（省空間，數萬詞才不會撞 localStorage ~5MB 上限）：
  ```jsonc
  {
    "c四基1-1|m": [250, 6, 3, 20128, 20122]
    // [ef, interval, reps, due, firstSeenDay]
    //  ef           容易度 ×100 存整數（2.5 → 250），下限 130
    //  interval     間隔天數（整數）
    //  reps         連續答對次數（答錯歸零）
    //  due          下次複習日，epoch「天」（Math.floor(Date.now()/86400000)）
    //  firstSeenDay 初見日，epoch「天」；只在第一次寫入時設定，之後不覆蓋
  }
  ```
  - **`seen`（是否初見）由「有無這筆紀錄」隱含**，不另存。
  - 讀寫封裝在 `js/game/game-progress.js`（`getProgress`/`putProgress`），對外可轉成物件方便使用，但**落地格式一律陣列**。
- **SM-2 評分**：4 級 `again`/`hard`/`good`/`easy`。答對顯示 `hard`/`good`/`easy` 三鈕；**答錯不給選、直接記 `again`**（`reps` 歸零、`ef` 下修）。純函式在 `js/game/srs.js`。

### Schema 演進守則（避免昂貴 migration）
> 進度資料未來一定會想加欄位。為避免「改一次 schema → 觸發整包 localStorage 重傳 Supabase」的負載，遵守兩條：
> 1. **只加不改（append-only）**：新欄位一律加在陣列**尾端**，並在 `getProgress` 用 `arr[n] ?? 預設值` 讀取。舊紀錄無此格時給預設，**不需掃全表 migration**，也不會造成大量同步異動。（`firstSeenDay` 即依此加在 arr[4]。）
> 2. **非做整表 migration 不可時**：等 Phase 3 把 Supabase 同步從「整包 upsert」改成「逐筆增量」之後再做，否則會把幾 MB 進度整包重傳。

## 雲端同步資料規範 (Cloud-Sync Data Governance)

雲端同步是「客源翠」的核心功能。**每一種要落地的使用者資料，都必須先回答兩個問題**，再決定實作：

1. **要不要跨裝置同步？**
   - 使用者自己產生、換裝置想帶著走 → **要**（進度、書籤、偏好、統計…）。
   - 純本機暫存 / 可重建的快取（如 `HakkaDataDB` 字典快取）→ **不要**。
2. **若要同步，衝突時怎麼合併？** 從下面三種**擇一**，並在 `js/cloud-sync.js` 寫對應的 `mergeXxx` 純函式：

| 合併法 | 適用 | 規則 |
|---|---|---|
| **LWW（後蓋前）** | 單一狀態、覆蓋無妨 | 取 `updated_at` 較新者；如偏好設定 |
| **逐項單調不回退** | 各裝置各自累積、不可倒退 | 逐 key 合併、取「學得更深」者（如學習進度：reps 大/due 晚勝、firstSeenDay 取早）；書籤同表取較新 |
| **逐項相加（累計量）** | 同鍵是「次數/計量」，兩邊都算數 | 同 key 數字**相加**（如每日統計：手機 10 題＋電腦 5 題＝15 題）。⚠️**相加非冪等**，必須用「已同步基準快照」記 delta，只加「上次同步後的新增量」，否則每次同步會重複累加 |

### 現有資料分類表（新增資料時往此表補一列）

| 資料 | localStorage key | Supabase 欄 | 同步 | 合併法 |
|---|---|---|---|---|
| 書籤 | `hakkaBookmarks` | `bookmarks` | ✅ | 逐項單調（同表取較新） |
| 偏好 | `romanizerJoiningMode` | `preferences` | ✅ | LWW |
| 遊戲上次腔調/級別 | `hakkaGameLastDataVarName` | `preferences` | ✅ | LWW（空字串視為未設定，不覆蓋本地） |
| 學習進度 | `hakkaLearningProgress` | `learning_progress` | ✅ | 逐項單調不回退 |
| 每日統計 | `hakkaDailyStats` | `daily_stats` | ✅ | 逐項相加（delta 基準） |
| 每日各腔級統計 | `hakkaDailyStatsByLevel` | `daily_stats_by_level` | ✅ | 逐項相加（delta 基準） |
| 字典快取 | （`HakkaDataDB`） | — | ❌ | 不同步（可重建） |

- **鐵則**：絕不把「相加型」資料套 LWW/取大（會少算），也絕不把「累積型進度」套 LWW（會弄丟一邊）。合併法選錯是同步最常見、最難察覺的資料損毀來源。

### 加新同步欄位時必查（血淚教訓）
加一個要同步的欄位，`js/cloud-sync.js` 裡有**四個地方要一起改，缺一不可**，尤其 select/upsert 要**對稱**：
1. **SELECT**（`syncFromCloud` 的 `.select('...')`）——**最常漏這個**。漏了會「推得上、拉不下」：`data.欄位` 讀成 `undefined`→雲端當空的→跨裝置永遠同步不到（症狀：本機有、別台顯示空/歸零）。
2. **合併**（呼叫對應 `mergeXxx`，並依合併法選對）。
3. **寫回本地**（`localStorage.setItem`）＋（相加型還要）**基準快照**於「push 成功後」才更新。
4. **UPSERT**（`syncToCloud` 的 upsert 物件加該欄）。
5. Supabase 先 `ALTER TABLE ... ADD COLUMN`（欄位要先於引用它的程式上線）。
> 2026-07-17 就栽在「upsert 有加 `daily_stats_by_level`、select 漏加」——推上雲端了卻誰都 SELECT 不出來。改完務必**跨裝置實測**同步。

## 暫存檔案清理慣例 (Temporary File Cleanup Conventions)
- **隔離暫存檔案 (Isolate Temporary Files)**: 所有用於驗證的暫存檔案、腳本或螢幕截圖，都**必須**建立在版本庫(repository)以外的獨立目錄，例如 `/home/jules/verification`。
- **使用精確的刪除指令 (Use Precise Deletion Commands)**: 清理暫存檔案時，**必須**使用明確指向該目錄的指令 (例如 `rm -rf /home/jules/verification`)，避免使用廣泛影響整個版本庫的指令 (如 `git clean`)。
- **強制執行 Dry Run (Mandatory Dry Run)**: 在使用任何具有破壞性的 `git` 指令（特別是 `git clean`）之前，**必須**先加上 `-n` 或 `--dry-run` 旗標來預覽將被影響的檔案列表。只有在確認列表內容完全符合預期後，才能執行真正的刪除指令。

## Branching and Communication

If you need to create a new branch for your work (e.g., to recover from an error or start a clean implementation), you **must** inform the user of the new branch name. Post a comment on the relevant GitHub Pull Request or Issue with the new branch name so that testing and deployment environments can be updated accordingly. Failure to do so will cause confusion and delays. **For follow-up work by the same Jules task/chat, you should commit to the existing branch used in the same task/chat to avoid creating unnecessary new branches.**

## 快取更新慣例 (Cache Busting Conventions)
- **更新靜態資源版本**: 當修改了專案的 `.css` 或 `.js` 檔案（特別是在頻繁測試的開發階段或發布新功能時），**必須**同步至 `index.html` 更新對應檔案載入標籤的查詢字串（Query String，如 `?v=4.2.1` 改為 `?v=4.2.2`）。這可以確保使用者的瀏覽器不會因為快取 (Cache) 而載入舊版的樣式或腳本，避免產生「程式碼已修改但畫面未生效」的誤判。
