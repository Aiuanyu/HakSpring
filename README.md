# 客源翠 HakSpring：客話詞典、分類學習放送
（HakCertLexicon 擴充詞典功能後改名哦）

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/Aiuanyu/HakSpring)

## Firebase 設定（開發人員用）

本專案使用 Firebase Realtime Database 來同步使用者資料。若您需要在本地端開發或自行部署，請依照以下步驟設定：

1.  **建立 Firebase 專案**：前往 [Firebase Console](https://console.firebase.google.com/) 建立一個新專案。
2.  **設定 Realtime Database**：在您个專案中，建立一個 Realtime Database。
3.  **啟用匿名登入**：在 Authentication > Sign-in method 分頁，啟用「匿名」登入。
4.  **取得設定資訊**：在專案設定中，尋到您个 Web App 个 Firebase 設定物件。
5.  **建立設定檔**：
    *   在 `js/` 資料夾內，將 `firebase-config.js.example` 複製一份並改名做 `firebase-config.js`。
    *   用您在步驟 4 取得个真實設定，取代 `firebase-config.js` 內个 placeholder 值。

`firebase-config.js` 已被加入 `.gitignore`，做毋會提交到版本控制中。

## 鍵盤控制

- 空白鍵
  - 毋曾開始放送个時節，做得直接開始放進度紀錄最新一隻
  - 有開始放送个時節：控制暫停／繼續
- `Esc`
  - 無 focus 在網頁互動元件个時節：停止放送
  - 有 focus 在網頁互動元件个時節：退出 focus

## 專案歷史
- 20250917 Aiuanyu GitHub 帳戶被停權，深夜復權，網頁回得來嗎
