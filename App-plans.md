# App 化規劃建議書

這位係針對「客源翠 HakSpring」網站 App 化个規劃建議，會分幾個部分來討論。

## 總體建議

考量到這隻網站目前係用 Vanilla JavaScript 開發，而且有「離線優先」个設計，這表示大部分个功能都做在前端，這對 App 化非常有幫助。

## 1. 用 Tauri 來開發?

Tauri 係一隻用 Rust 為後端、任何前端框架為介面个跨平台應用程式開發框架。

### 優點

*   **性能**: 因為後端係用 Rust，性能比用 Electron (JavaScript 後端) 个方案還較好。
*   **檔案較細**: 打包出來个應用程式比 Electron 細非常多。
*   **安全性**: Tauri 在設計上有較多个安全性考量。
*   **跨平台**: 一次開發做得打包成 Windows, macOS, Linux 应用程式。

### 缺點

*   **行動裝置支援**: Tauri 對行動裝置个支援還在實驗階段 (alpha)，可能還無恁穩定，而且需要另外設定。
*   **學習曲線**: 若然無熟悉 Rust，後端个部分會需要學習。毋過，若然 App 个主要邏輯還係在前端，就較無這隻問題。

### 結論

若然主要目標係 **桌面應用程式**，Tauri 係一隻非常好个選擇。若然主要目標係 **行動應用程式**，可能愛考慮其他方案，或者等到 Tauri 在行動裝置个支援穩定下來。

---

## 2. 開發 Android App

目前最主流个方法係用 WebView 將現有个網站包起來。

### 步驟

1.  **設定開發環境**:
    *   安裝 [Android Studio](https://developer.android.com/studio)。
    *   安裝 Java Development Kit (JDK)。
    *   設定 Android SDK 摎模擬器 (Emulator)。
2.  **建立專案**:
    *   在 Android Studio 裡肚建立一隻新專案。
    *   選擇 "Empty Activity" 模板。
3.  **加入 WebView**:
    *   在 `activity_main.xml` 版面檔案裡肚加入一隻 `WebView` 元件。
4.  **設定 WebView**:
    *   在 `MainActivity.java` (或 `MainActivity.kt`) 裡肚，設定 WebView 來載入網站个 URL。
    *   啟用 JavaScript: `webView.getSettings().setJavaScriptEnabled(true);`
    *   處理離線功能: 因為網站有離線功能，愛確定 WebView 有啟用本地儲存 (DOM Storage) 摎 IndexedDB。
        ```java
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setDatabaseEnabled(true);
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.KITKAT) {
            webView.getSettings().setDatabasePath("/data/data/" + this.getPackageName() + "/databases/");
        }
        ```
5.  **打包 App**:
    *   產生一隻簽署過个 APK (Android Package) 或 AAB (Android App Bundle)。
6.  **上架**:
    *   到 [Google Play Console](https://play.google.com/console) 註冊開發者帳號，然後上傳 App。

### 測試環境

*   **Android 模擬器**: Android Studio 內建个模擬器做得模擬無共樣个裝置摎 Android 版本。
*   **實體裝置**: 直接用 USB 連到電腦，在實體手機上測試。

---

## 3. 開發 iOS App

同 Android 相像，iOS 也係用 WebView (WKWebView) 來包裝。

### 步驟

1.  **設定開發環境**:
    *   需要一臺運行 macOS 个電腦。
    *   安裝 [Xcode](https://developer.apple.com/xcode/)。
    *   註冊 Apple Developer 帳號 (若愛上架到 App Store)。
2.  **建立專案**:
    *   在 Xcode 裡肚建立一隻新專案。
    *   選擇 "App" 模板，介面用 "Storyboard"。
3.  **加入 WKWebView**:
    *   打開 `Main.storyboard`，從元件庫拖一隻 "WebKit View" 到畫面上。
4.  **設定 WKWebView**:
    *   在 `ViewController.swift` 裡肚，用程式碼控制 WKWebView 來載入網站。
    *   確定有處理本地資料个權限。iOS 个 WKWebView 預設就會支援 IndexedDB。
        ```swift
        import UIKit
        import WebKit

        class ViewController: UIViewController, WKUIDelegate {

            var webView: WKWebView!

            override func loadView() {
                let webConfiguration = WKWebViewConfiguration()
                webView = WKWebView(frame: .zero, configuration: webConfiguration)
                webView.uiDelegate = self
                view = webView
            }

            override func viewDidLoad() {
                super.viewDidLoad()

                let myURL = URL(string:"https://gohakka.org/hak-ka-source-sui/") // 請換成網站个 URL
                let myRequest = URLRequest(url: myURL!)
                webView.load(myRequest)
            }
        }
        ```
5.  **打包 App**:
    *   用 Xcode 來建置 (Build) 摎歸檔 (Archive) 專案。
6.  **上架**:
    *   用 "Transporter" app 將建置好个檔案上傳到 [App Store Connect](https://appstoreconnect.apple.com/)。

### 測試環境

*   **iOS 模擬器**: Xcode 內建个模擬器，做得模擬無共樣个 iPhone 摎 iPad。
*   **實體裝置**: 需要 Apple Developer 帳號正做得在實體 iPhone 上安裝測試。

---

## 4. 開發桌面 PWA (Progressive Web App)

PWA 係分網站做得像原生 App 一樣安裝到電腦桌面或手機主畫面。這隻網站既經有 `service-worker.js`，表示佢有 PWA 个基礎。

### 必要性

**非常高**。因為：

*   **成本最低**: 無需要另外寫程式碼，淨愛確定 `manifest.json` (或相應个設定) 摎 `service-worker.js` 有設定好。
*   **跨平台**: 所有支援个瀏覽器 (Chrome, Edge, Safari) 都做得安裝。
*   **體驗當好**: 使用者做得直接從網站安裝，無需要透過 App 市集。安裝以後就同一般个應用程式共樣。

### 建議步驟

1.  **檢查 Service Worker**: 確定 `service-worker.js` 有正確快取所有必要个檔案，提供良好个離線體驗。
2.  **建立 Web App Manifest**: 這隻專案目前無 `manifest.json`，愛加一隻。這隻檔案會定義 App 个名稱、圖示、啟動畫面等。
    *   建立一隻 `manifest.json` 檔案。
    *   在 `index.html` 裡肚連結佢：`<link rel="manifest" href="/manifest.json">`
3.  **設定 `manifest.json`**:
    ```json
    {
      "short_name": "客源翠",
      "name": "客源翠 HakSpring",
      "icons": [
        {
          "src": "/android-chrome-192x192.png",
          "type": "image/png",
          "sizes": "192x192"
        },
        {
          "src": "/android-chrome-512x512.png",
          "type": "image/png",
          "sizes": "512x512"
        }
      ],
      "start_url": ".",
      "display": "standalone",
      "theme_color": "#ffffff",
      "background_color": "#ffffff"
    }
    ```
4.  **提供明確个安裝引導**: 在網站上加一隻按鈕或係說明，教使用者仰般安裝 PWA。

### 總結

PWA 係目前對這隻專案來講，投資報酬率最高个方案。建議優先完成 PWA 个設定，然後正來考慮用 WebView 包裝成 Android 摎 iOS App。若係未來有桌面應用程式个需求，Tauri 會係一隻當好个選擇。