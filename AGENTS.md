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
- **語意化 PR 標題**: 在建立 Pull Request (PR) 時，標題應清楚、簡潔地總結該次修改的核心內容。一個好的標題能讓團隊成員快速理解變更的目的。例如，使用 `feat: 新增用戶認證功能` 或 `fix: 修正頁首跑版問題`，而不是模糊的 `更新檔案`。

## UI 元件慣例

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

## Branching and Communication

If you need to create a new branch for your work (e.g., to recover from an error or start a clean implementation), you **must** inform the user of the new branch name. Post a comment on the relevant GitHub Pull Request or Issue with the new branch name so that testing and deployment environments can be updated accordingly. Failure to do so will cause confusion and delays. **For follow-up tasks on the same issue, you should commit to the existing branch to avoid creating unnecessary Pull Requests.**
