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
