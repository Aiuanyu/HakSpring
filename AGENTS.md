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
- **【鐵則】改資料愛 bump `data/data_version.json`**：凡是修改 `data/` 底下个 CSV／JSON（含重跑 `process_all_data.py` 產生个 `.json`），**必須**同步更新 `data/data_version.json` 个 `version`（格式 `YYYYMMDDHH`，例：`2026092913`）。前端係比對版本號來決定愛毋愛重抓資料，版本一樣，已經有 IndexedDB 快取个使用者（尤其手機）就**永遠看無新資料**。`process_all_data.py` 毋會自動 bump，愛人工（抑係 AI）記得改。（2026-09 詔安調符校正就係因為漏 bump，害使用者拖足久正更新著。）
- **【工作流規範】資料清洗附 Before vs. After 概況報告（Data Cleaning Summary）**（平哥 20261106 指示）：凡涉及批次資料清洗、管線規則調整或詞典大規模修補時，收工回報毋好叫平哥手動逐筆盲測；必須產出「處理前 vs. 處理後的資料概況報告」，內容包含：異動總筆數、各腔分佈、Pattern 分類統計、經典代表 Before / After 抽樣比對，以及自然語言保護詞未受破壞之陰性對照。

### 音檔 URL 規則 (Audio URL Structure)

- **URL 結構**: 音檔的 URL 是根據腔調、級別、單元等資訊動態產生的。詳細的規則定義在 `URL patterns.csv` 檔案中。
- **例外處理**: `exclusions.js` 和 `NAmedias.js` 用於記錄和處理無法取得的音檔，屬於音檔的例外管理。
- **高級（高）例句音檔（2026-11-14 查證）**: 高級認證詞的例句音檔目前**仍無**。`main.js` 刻意不產生也不播放高級句音檔（`constructSentenceAudioUrl` 內 `級 === '高'` 直接回傳 `null`；表格渲染時 `級名 === '高級'` 放隱藏的 dummy audio）。查證結果：高級詞音檔可取得（例如 `115/4/si/3si-01-001.mp3`、`112/4/si/3si-03-257.mp3`），但五腔各抽 8 筆有例句的詞，句音檔網址（`…s.mp3`）皆 404；`4/si/s/`、`4/si/w/`、`4/s/si/` 等目錄與 110–115 年度亦皆 404。基礎級句音檔（`5/si/si-01-001s.mp3`）可正常取得，作為對照。`data/cert_audio_check_results.json` 的高級句音檔狀態是 `level_na`（審計時即跳過），**不代表已檢查過**。若日後官方補上，需同步移除 `main.js` 的高級句音檔跳過條件並重新驗證。

### 標音與音節處理慣例 (Phonetics & Syllable Processing Conventions)
- **忽略括號內的註記**: 在處理音節數計算、聽力題干擾項挑選，或未來處理特定地區腔調（如南四縣音、饒平卓蘭桃園音）時，若客家語或標音欄位中出現 `【】` 括號（例如 `【南】`、`【卓】`），在計算音節或比對相似度時**必須**將括號及其內部文字濾除（例如使用 `replace(/【.*?】/g, '')`）。此邏輯在遊戲出題 (`question-gen.js`) 與主表資料處理腳本中應保持同步留意，避免資料格式更新影響出題邏輯。

## 開發工具 (Developer Utilities)

專案中包含一些實用的開發工具（位於根目錄的 `.html` 檔案），可以幫助您驗證資料的完整性：

- `invalidMediaChecker.html`: 用於檢查音檔連結是否有效。
- `table-extractor.html`: 用於從應用程式中匯出帶有附加元數據的 CSV 檔案。

## 字詞代號與用語規範
- **【鐵律】客語音韻字詞必查真值與讀《客語大補丸》（嚴禁憑記憶推導）**：
    凡涉及客語文句撰寫、語料設計、新詞審音、跨腔音韻規則或 UI 客文化，動手前**必讀** Obsidian vault 的 `Hak/客語大補丸/00-總覽.md`（特別是 `05-AI 客語書寫指南.md`、`06-客語語法小抄.md`、`07-從四縣學他腔.md` 與 `10-常見錯誤實例.md`）。**絕對嚴禁 AI 憑空推導音韻或手打聲調**；一律執行 `python3 /Users/gjrobert/NAS/projects/HakSpring/scripts/hakfa_lookup.py <字或詞>` 查詢官方教典、認證與補字典之六腔真值。
- `Romaine` = `Romanizer`、「蘿蔓生菜」= 羅馬字轉換工具模組
- **【族名與語名規範】一律使用 `hakfa`（Hakfa）／嚴禁使用 `hakka`**：
    專案全體（包含程式碼命名、變數、檔名、路徑、文件與 UI），若涉及客語羅馬化代號或族語命名，**嚴禁使用 ❌ `hakka`，一律使用 ⭕ `hakfa`（有大寫時就大寫，如 `Hakfa`）**。原因：臺灣客人大體喊自家 Hagngin、喊族語 Hakfa。
- **【絕對原則】「復習」正字規範**：專案全體（包含 UI 介面、文案、說明文件、程式碼註解、Commit 訊息、對話筆記）統一使用正字 **「復習」**，**嚴禁**誤用「複習」（「復」為反覆溫習之意；「複」為複數、繁雜，兩字字義不同，切勿混淆）。


## Agent Coding Conventions
- **Preserve existing comments:** When modifying code, do not remove or alter existing comments unless they are clearly outdated or incorrect. If you rewrite a block of code, make sure to carry over the original comments.

## 檔案操作慣例 (File Operation Conventions)
- **確認檔案存在**: 在執行任何建立新檔案的指令（例如 `create_file`）之前，必須先用 `ls` 指令確認該檔案是否已存在。
- **理解使用者意圖**: 若目標檔案已存在，應先用 `read_file` 讀取其內容。必須理解使用者的意圖很可能是要「修改」或「新增內容」到現有檔案，而不是完全「覆寫」。除非使用者明確指示要覆寫，否則應優先考慮使用 `replace_with_git_merge_diff` 或其他非破壞性的方式進行修改。

## 與 Obsidian 筆記庫个關係 (Obsidian Vault Rules)
- 開發筆記放在 Obsidian vault：`/Users/gjrobert/NAS/Obsidian/Main/創作/程式/HakSpring/`（總覽 `HakSpring.md`，各功能一篇，如 `PFS.md`）。
- **【鐵律】有做事就要寫 Obsidian**：只要做了事（改程式、改文件、改設定、做研究、下決定），都愛在對應个筆記裡肚留下紀錄，寫清楚做了甚麼、為甚麼、動著哪兜檔案、哪兜驗證過吔、哪兜還無驗證。沿用該筆記既有个分段慣例（R／G／C 系列 h3），毋好淨在對話裡肚講煞。Commit message 係例外（見下背）。
- **【Obsidian 渲染避坑】反引號後背毋好緊接點號**：凡係反引號開頭、後背緊接 dot（例如單獨表示副檔名），兩者中間愛插 1 個全形空格，寫做 `　.md`、`　.json`。完整檔名或路徑（如 `pages/pfs.md`）毋受影響。這條適用全部軟體專案，包含文件、筆記、commit message 摎程式碼註解。

## Development board (Obsidian vault)

Work status for HakSpring (website) and Kipan lives on a kanban in the Obsidian vault, not in this repo: one note per card under `創作/程式/HakSpring/看板/` in the vault (`~/NAS/Obsidian/Main`), with frontmatter `project` / `status` (想做, 排定, 進行中, 等平哥, 完成) / `size`.
- Before starting a substantial task, read its card; if none exists, ask the coordinating session (蒂兒) or create one following `AGENTS.md` in the vault.
- When you start, finish, or get blocked, update the card's `status`. Do not edit `kanban_order`. The user's own drag-and-drop on the board wins over any other file.
- Run `python3 <vault>/創作/程式/HakSpring/看板/check.py` (read-only) before wrapping up.
- If you cannot reach the vault (e.g. a cloud session), say so in your report instead of skipping silently, so the coordinator can update the card.

## 測試網址回報慣例 (Cloudflare Test URL Reporting)
- **【鐵則】commit 或開 PR 時，對話裡必須直接寫出 Cloudflare 測試網域網址**，方便平哥直接點開測試，毋使另外去翻 Cloudflare Dashboard。
- **網址規則**：
    - 正式站：`https://hakspring.pages.dev/`
    - 分支預覽站：`https://<分支名>.hakspring.pages.dev/`。分支名全部轉小寫，非英數字元（如 `/`、`_`、`.`）一律換成 `-`。例：目前分支 `ccr-6491c4a6-9nmdfi` → `https://ccr-6491c4a6-9nmdfi.hakspring.pages.dev/`。
- **查詢方式（以部署結果為準，毋好只按命名推算）**：
    - 有開 PR 時：用 GitHub 工具 `pull_request_read`（`method: get_check_runs`）讀 PR head 的 check runs，找 `Cloudflare Pages` 那一條，用 `get_check_run` 讀其 `output.summary`，裡面的 `Branch Preview URL` 就是分支預覽站網址，`Preview URL`（`<8 位部署 ID>.hakspring.pages.dev`）是這次部署的網址。
    - 只限 PR head 的 commit 查得到。直接推到 `main` 或 PR 中間的 commit，這些工具查不到，要寫明「此 commit 無法查得部署網址」，毋好亂猜。
    - 命名規則（`<分支名>.hakspring.pages.dev`）只做對照用，毋好當成已確認的網址。
- **GitHub 細節**：PR 描述（body）愛寫入上述查得个測試網址；寫明部署狀態（成功／失敗／尚未完成）。
- **回報時機**：每次 commit 煞、推上去、或開 PR 之後，在回覆末尾列出「測試網址」一行（分支預覽站優先，正式站另外標註）。
- **誠實原則**：Cloudflare 部署毋一定完成，寫網址以前毋好假設部署一定好；查毋到部署狀態，愛註明「尚未確認部署」。

## 提交慣例 (Submission Conventions)
- **【鐵則】Commit Message 必須使用客語（Hakka）撰寫**：
    - 專案的所有 Git commit message 內文與說明，**必須**使用臺灣客家語（四縣／海陸等共通詞彙，如「个」、「摎」、「在」、「肚底／裡肚」、「單淨」、「無共樣」、「毋使」等）撰寫。
    - **嚴禁**誤用臺灣話／閩南語詞彙（如「干焦」、「無仝」、「佮」、「佇」、「親像」等）或純華語長篇文言。保持客源翠專案作為客語母語數位典藏工具的文化自覺與語言一致性。
- **Commit Message 審核與提交流程**：
    1. 先分析專案 Git 目前 staged 的 diff，歸納此次更新內容。
    2. 依對話記憶提及不同 AI 模型，分別列出每個 AI 模型的分工及貢獻。
    3. 先寫在專案根目錄的臨時 `commit_msg.txt` 中，供平哥審閱、直接編輯。
    4. Commit message **毋使寫來 Obsidian 筆記裡肚**（避免筆記內容過度冗長繁雜、重複堆疊已存在於 git log 或專案檔案的內容）。
    5. 平哥審核完成告知定稿後，再根據 `commit_msg.txt` 執行 commit。
        - 絕對要小心避免那種會卡住終端機狀態的指令。
        - 愛細膩莫 commit 著 `commit_msg.txt`；commit 煞後，暫存檔案愛提掉（清理）。
- **貢獻者樣板 (Co-authors Template)**：commit 最尾照下背寫。
    - 只列**實際改著這個 commit 內容**个 AI，一隻一行；淨參與討論、審查个毋列（做得寫在本文）。
    - 模型名照該 session 實際用个模型；毋確定就寫工具名，毋好照抄別隻 commit 个名單。
    - 信箱照工具：Claude Code（本機、雲端）用 `noreply@anthropic.com`；Antigravity 裡肚个模型用 `<model-id>@Antigravity`；其他工具照佢自家个預設。
    - 簽名一律用 GitHub noreply 信箱，**毋好放真實 email**（repo 係公開个）。寫 commit message 个 AI 若無改著內容，做得寫在 `Signed-off-by` 後背括號 `(Commit Helper: …)`。
```
Co-authored-by: Claude Opus 5.5 <noreply@anthropic.com>
Co-authored-by: Gemini 3.8 Flash <Gemini-3-8-Flash@Antigravity>
Signed-off-by: GHSRobert Ciang <93833368+Aiuanyu@users.noreply.github.com>
```
    （例：兩隻 AI 都改著个時節。淨一隻改著就淨寫一行 `Co-authored-by`。）
- **語意化 PR 標題**: 在建立 Pull Request (PR) 時，標題應清楚、簡潔地總結該次修改的核心內容，再加上要解決的 issue 編號。一個好的標題能讓團隊成員快速理解變更的目的。例如，使用 `feat: 新增用戶認證功能（整 #79）` 或 `fix: 修正頁首跑版問題（整 #116）`，而不是模糊的 `更新檔案` 或完全看不出意圖的 `Pull request for issue #79`。

## UI 元件慣例

- **暗色主題支援 (Dark Mode Support)**：所有新个 GUI 元件（例如按鈕、彈出視窗、面板）都愛包含對應个暗色主題樣式 (`@media (prefers-color-scheme: dark)`)，來確保視覺風格一致。

### Modal 視窗

- **加新个 Modal**：若愛加上新个一般 modal，佢个結構摎行為愛同既有个 `#infoModal`、`#lookupHelpModal` 一致。
- **HTML 結構**：新 modal 愛有一个根元素，包含 `.modal-overlay` class，還有一個子元素包含 `.modal-dialog` class。Dialog 內部愛有 `.modal-header`、`.modal-body`，還做得選愛無愛加 `.modal-footer`。
- **CSS 樣式**：為著確保樣式一致，愛將新 modal 个 ID 加到 `style.css` 裡肚既有个群組選擇器。這包含基本樣式、暗色主題樣式，還有其他共享屬性。
- **JavaScript 邏輯**：顯示／隱藏 modal 个邏輯愛寫在 `main.js` 个 `initializeAppUI` 函式裡肚。用 `style.display = 'flex'` 來顯示 modal，用 `style.display = 'none'` 來隱藏。
- **全螢幕型 Modal 例外**：若新 modal 是全螢幕沉浸式體驗（如 `#dailyWordModal`），可使用獨立的 `xxx-fullscreen-modal` 結構與專屬 class，不強制套用上述共用的對話方塊規範。

### 色彩對比檢查（WCAG）

- **【鐵則】改著顏色、背景、badge、標籤等視覺樣式，愛用「網頁色彩識別度標準」(WCAG 2.x 對比度) 實算檢查，毋好淨靠目視**：
    - 一般文字（含小字 badge）對比度愛 **≥ 4.5:1**（AA）；大字（≥ 24px，抑係 ≥ 18.66px 粗體）愛 **≥ 3:1**。
    - **淺色摎暗色主題兩邊都愛驗**；而且愛對**實際會遇著个全部背景色**驗，毋單淨對白底。例如表格奇偶列个綠底（`#b7c4a5`）、暗色底（`#1c1d1f`、`#232426`）。
    - 用戶若提供 Chrome 截圖，愛從截圖取實際色（或對照 `style.css`），照截圖个畫面逐個元件檢查，毋好直接當做看過。
    - 驗證方法：用相對亮度公式（Python／JS 十幾行就做得）算前景摎背景个對比度；抑係 Chrome DevTools 个 Contrast ratio 顯示。算出來毋達標，就調整顏色（淺色主題用較深字色、暗色主題用較淺字色）再算過，**結果（色碼＋比值）寫入 PR／commit 說明抑係 Obsidian 筆記**。
    - 相對亮度公式：`c' = c/12.92`（`c ≤ 0.03928`），否則 `((c+0.055)/1.055)^2.4`；`L = 0.2126R + 0.7152G + 0.0722B`；對比度 `(L亮+0.05)/(L暗+0.05)`。

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

雲端同步是「客源翠」的核心功能。

> **後端（20261108 起）**：Cloudflare Pages Functions `functions/api/sync.js` ＋ D1（綁定 `DB`，資料表 `user_sync` 見 `migrations/0001_init.sql`；套用：`npx wrangler d1 migrations apply hakspring-sync --remote`）。**免登入，用「同步金鑰」認身分**：用戶端產生 32 碼 Base32 金鑰存 `localStorage.hakkaSyncKey`，請求帶 `X-Sync-Key`，伺服器淨存金鑰个 SHA-256 當 `user_id`。一把金鑰一列，整包同步資料是一個 JSON。**樂觀鎖**：推送帶 `base_updated_at`（本機 `hakkaSyncCloudRev`），版本對毋著回 409 摎目前資料，用戶端重新合併再推。Supabase（Google 登入）因流量超額暫停，同步毋倚靠佢；**毋好**加回「信任未驗證个 JWT／裸 user id」「`?key=`」「CORS `*`」。CORS 淨開**白名單**（同源、`*.hakspring.pages.dev`、`aiuanyu.github.io`、localhost／127.0.0.1，供本機開發打正式站 API），回應有 `Vary: Origin`；要加新來源愛改 `corsHeaders` 个白名單並補測試。伺服器對資料包有欄位白名單。

**每一種要落地的使用者資料，都必須先回答兩個問題**，再決定實作：

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

| 資料 | localStorage key | 同步資料包欄位 | 同步 | 合併法 |
|---|---|---|---|---|
| 書籤 | `hakkaBookmarks` | `bookmarks` | ✅ | 逐項單調（同表取較新） |
| 偏好 | `romanizerJoiningMode` | `preferences` | ✅ | LWW |
| 遊戲上次腔調/級別 | `hakkaGameLastDataVarName` | `preferences` | ✅ | LWW（空字串視為未設定，不覆蓋本地） |
| 標音顯示模式（HPP／PFS） | `hakfaDisplayScript` | `preferences` | ✅ | LWW（值為 `hpp`／`pfs`／`gip`；舊值 `hagpin` 讀取時視為 `hpp`；雲端拉下新值時會即時更新畫面） |
| 學習進度 | `hakkaLearningProgress` | `learning_progress` | ✅ | 逐項單調不回退 |
| 每日統計 | `hakkaDailyStats` | `daily_stats` | ✅ | 逐項相加（delta 基準） |
| 每日各腔級統計 | `hakkaDailyStatsByLevel` | `daily_stats_by_level` | ✅ | 逐項相加（delta 基準） |
| 日日一詞收藏 | `hakkaDailyFavs` | `daily_favs` | ✅ | 逐項單調（聯集）＋ tombstone |
| 熟悉度 | `hakkaFamiliarity` | `familiarity` | ✅ | LWW per-key |
| 日日一詞抽籤狀態 | `hakkaDailyCycle` | — | ❌ | 不同步（可重建） |
| 字典快取 | （`HakkaDataDB`） | — | ❌ | 不同步（可重建） |
| 美濃腔 | `showMeinungFill` | `preferences` | ✅ | LWW（`mergeBoolPref`；值為布林，未設定視為 `false`；雲端拉下新值時會即時更新開關摎畫面） |
| 雲端同步金鑰 | `hakkaSyncKey` | —（伺服器淨存雜湊） | ❌ | 不同步、毋進備份檔／手動共步網址（等於帳號密碼，淨存本機，使用者自家抄去別台輸入） |
| 雲端版本號 | `hakkaSyncCloudRev` | — | ❌ | 不同步（本機看著个雲端 `updated_at`，樂觀鎖用；換金鑰會清掉） |
| 腔級播放設定 | `hakkaAudioProfiles` | `audio_profiles` | ✅ | 逐 key LWW（`mergeAudioProfiles`；值 `[速度, 擺數, 時間戳ms, 刪除旗標]`，刪除用 tombstone；有設定个腔級優先於全域播放速度／擺數；使用者在播放面板改速度／擺數，摎基準無共樣就自動記入該腔級，共樣就移掉） |
| 播放速度 | `playbackSpeed` | — | ❌ | 不同步（跟裝置／使用情境有關，本機偏好） |
| 播放重複次數 | `globalRepeatCount`、`certAdvancedRepeatCount` | — | ❌ | 不同步（本機偏好） |

#### 收藏／進度類 key 的年度 migration 提醒
認證詞彙每年更新（113 → 114 → …），教典亦不定期更新。**級內編號（如 `1-1`）與教典序號在改版後會位移**，凡是以編號當 key 的使用者資料（SRS `progressKey`、日日一詞收藏 `hakkaDailyFavs`）都會對不上。
- 新增這類資料時，**務必額外冗餘儲存「詞目字串」**，改版後才能用詞目回找新編號自動修復。
- 換年度資料時，必須同步檢查：受影響的 key、是否需要 migration、migration 失敗的詞如何提示使用者。
- 並在分類表補一列。

- **鐵則**：絕不把「相加型」資料套 LWW/取大（會少算），也絕不把「累積型進度」套 LWW（會弄丟一邊）。合併法選錯是同步最常見、最難察覺的資料損毀來源。

### 加新同步欄位時必查（血淚教訓）
加一個要同步的欄位，**下面四處要一起改，缺一不可**，尤其「用戶端匯出」摎「伺服器白名單」要**對稱**：
1. **匯出**（`exportCurrentSyncData`）——欄位愛放進資料包，`syncToCloud` 摎手動共步都共用這一份。
2. **合併**（`applyIncomingSyncData` 呼叫對應 `mergeXxx`，並依合併法選對）。
3. **寫回本地**（`localStorage.setItem`）＋（相加型還要）**基準快照**於「push 成功後」才更新。
4. **伺服器白名單**（`functions/api/sync.js` 个 `ARRAY_FIELDS`／`OBJECT_FIELDS`）——**最常漏這個**：白名單外个欄位會被伺服器丟掉，症狀是「本機有、別台永遠拉毋著」。物件／陣列型態也愛對。
> 2026-07-17 就栽在「upsert 有加 `daily_stats_by_level`、select 漏加」（Supabase 時代）——推上雲端了卻誰都讀不出來。改完務必**跨裝置實測**同步；`tests/cloudflare_d1_sync_test.js` 有兩台裝置對跑摎 409 重試。

## 暫存檔案清理慣例 (Temporary File Cleanup Conventions)
- **隔離暫存檔案 (Isolate Temporary Files)**: 所有用於驗證的暫存檔案、腳本或螢幕截圖，都**必須**建立在版本庫(repository)以外的獨立目錄，例如 `/home/jules/verification`。
- **使用精確的刪除指令 (Use Precise Deletion Commands)**: 清理暫存檔案時，**必須**使用明確指向該目錄的指令 (例如 `rm -rf /home/jules/verification`)，避免使用廣泛影響整個版本庫的指令 (如 `git clean`)。
- **強制執行 Dry Run (Mandatory Dry Run)**: 在使用任何具有破壞性的 `git` 指令（特別是 `git clean`）之前，**必須**先加上 `-n` 或 `--dry-run` 旗標來預覽將被影響的檔案列表。只有在確認列表內容完全符合預期後，才能執行真正的刪除指令。

## Branching and Communication

If you need to create a new branch for your work (e.g., to recover from an error or start a clean implementation), you **must** inform the user of the new branch name. Post a comment on the relevant GitHub Pull Request or Issue with the new branch name so that testing and deployment environments can be updated accordingly. Failure to do so will cause confusion and delays. **For follow-up work by the same Jules task/chat, you should commit to the existing branch used in the same task/chat to avoid creating unnecessary new branches.**

## 多線並行與 Worktree 開發規範 (Multi-Track Worktree Workflow)

當使用者指示「多線並行開發」、「分開進行」或目前主 repo 存在另一個分支的未完成檔案（例如稽核腳本、臨時資料）時，**必須**使用 Git Worktree 機制，嚴禁在主 repo 硬切分支或踩踏檔案。

### 1. Worktree 建立原則
- **目錄命名**：一律在 `/Users/gjrobert/NAS/projects/` 建立同層目錄，格式為 `HakSpring-<feature-name>`（例如 `HakSpring-cross-dialect`）。
- **建立指令**：
  ```bash
  git worktree add /Users/gjrobert/NAS/projects/HakSpring-<feature-name> <branch-name>
  ```
- **主 Repo 復歸**：建立 worktree 前後，確保主 repo 乾淨切回原分支（如 `main`），不阻礙其他任務進行。

### 2. 本地測試與 FreeFileSync 同步慣例
- **Web 測試對應目錄**：一律鏡像至 `/Users/gjrobert/web/plain/HakSpring-<feature-name>`。
- **FreeFileSync 雙軌設定**：
  1. **一鍵雙同步（優先）**：在主目錄的 `HakSpring → localhost.ffs_gui` 內的 `<FolderPairs>` 中新增第二對 `<Pair>`：
     ```xml
     <Pair>
         <Left>/Users/gjrobert/NAS/projects/HakSpring-<feature-name></Left>
         <Right>/Users/gjrobert/web/plain/HakSpring-<feature-name></Right>
     </Pair>
     ```
     讓使用者點一次「同步」即可同時更新主線與平行分支，零摩擦測試！
  2. **專屬獨立設定檔**：在該 worktree 根目錄建立獨立的 `HakSpring-<feature-name> → localhost.ffs_gui`，僅包含該分支之單一 `<Pair>`，方便單獨作業。
- **生命週期結束清理（由 AI agent 負責執行，毋使等使用者開口）**：
  當分支 merge 完畢（或使用者明講毋愛該 worktree 吔），AI agent 愛**自家**做完下列清理，毋可以淨留 worktree 就算：
  1. 刪掉主目錄 `HakSpring → localhost.ffs_gui` 內該分支个第二對 `<Pair>`（左邊係 `/Users/gjrobert/NAS/projects/HakSpring-<feature-name>` 該對）。
  2. 刪掉 worktree 根目錄个專屬設定檔 `HakSpring-<feature-name> → localhost.ffs_gui`。
  3. 移除 worktree 摎分支：
     ```bash
     git worktree remove /Users/gjrobert/NAS/projects/HakSpring-<feature-name>
     git branch -d <branch-name>
     ```
  4. `/Users/gjrobert/web/plain/HakSpring-<feature-name>` 這個網站鏡像目錄係刪除動作，愛先問過使用者正做。
  改設定檔前先備份，改完用 diff 確認淨有該對 `<Pair>` 無去；注意保留原檔个行尾（CRLF），毋好改成 LF。

## 快取更新慣例 (Cache Busting Conventions)
- **更新靜態資源版本**: 當修改了專案的 `.css` 或 `.js` 檔案（特別是在頻繁測試的開發階段或發布新功能時），**必須**同步至 `index.html` 更新對應檔案載入標籤的查詢字串（Query String，如 `?v=4.2.1` 改為 `?v=4.2.2`）。這可以確保使用者的瀏覽器不會因為快取 (Cache) 而載入舊版的樣式或腳本，避免產生「程式碼已修改但畫面未生效」的誤判。
