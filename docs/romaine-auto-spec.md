# 全自動 Romaine（`romaine-auto`）一頁簡規

> 狀態：PoC 規格（v0.1）｜目標頁面：`romaine-auto.html`（獨立副網頁，不改動主站 `index.html`）

---

## 1. PoC 目標與範圍

- **核心原則**：預設全自動產生 HagPinPlus（HPP），隨時可人工微調。
- **資料累積策略（折衷並行）**：
  - **正式句庫對零開始**：使用者打開自動開關即時產生 → 透過現有 popup／重新斷詞介面人工校正／確認 → **只將 `verified` 句子寫入正式句庫**，確保黃金語料純度。
  - **演算法參數先離線跑一次**：以 Python 離線掃描現有語料（`data/gip/`、`data/cert/`、`data/supp/`），產出輕量詞頻表（unigram／bigram）與每腔偏好讀音表，讓即時產生一開箱即具備可用基準。
- **PoC 首波範圍**：
  - 腔調：**四縣**（北四縣；其餘五腔列為後續擴充）。
  - 演算法：Trie + Lattice + Viterbi 斷詞 + 每腔偏好讀音表 + 規則消歧；連寫／撇號／大寫沿用 `js/romaine-join.js`。
  - 副網頁：`romaine-auto.html`（獨立於主站，可直接 commit 至 `main` 測試）。

---

## 2. 共用資料格式（P0 測試集 & 修正紀錄 Schema v1）

P0 標準答案測試集（`tests/romaine_p0.json`）與未來 P3 使用者修正紀錄共用同一套詞對齊結構：

```json
{
  "id": "p0-001",
  "dialect": "sixian",
  "han": "七月 天公 實在 有 熱，……",
  "tokens": [
    { "han": "七月", "hpp": "Qìd ngiad" },
    { "han": "天公", "hpp": "tién gúng" },
    { "han": "，", "punct": true }
  ],
  "joined_hpp": "Qìdngiad tién'gúng ...",
  "status": "verified",
  "source": "Tjaagraan2HagPinPlus-20250805",
  "updated_at": "2026-11-21T18:11:00+08:00"
}
```

- `dialect`：`sixian`｜`nansixian`｜`hailu`｜`dapu`｜`raoping`｜`zhaoan`（依「四南海大平安」順序）。
- `tokens`：
  - 一般詞條：`{ "han": "詞", "hpp": "音節1 音節2" }`，音節之間以半形空格分隔，首字母大小寫保留於第一個音節（或專名各音節）。
  - 標點／空白：`{ "han": "，", "punct": true }`（或依需要附 `hpp` 半形標點）。
- `status`：`verified`（人工已校對確認，可進正式句庫與 P0/P3 訓練）／`auto`（機器初稿，僅供預覽，不進黃金語料）。

---

## 3. P0 評分尺（`tests/romaine_p0_eval.js`）

每次調整斷詞演算法、詞頻表或偏好讀音表，必須執行 `node tests/romaine_p0_eval.js` 驗證：

1. **主指標：音節讀音正確率（Syllable Reading Accuracy）**
   - 將預測結果與標準答案各自展開為音節序列（轉小寫、依空格／`-`／`'` 切分，忽略標點），計算位置對齊／Levenshtein 對齊後之音節正確率：`正確音節數 / 總音節數`。
   - 理由：斷詞邊界差異（「七 月」vs「七月」）不必然影響讀音，直接量音節正確率才能對準核心品質。
2. **輔指標 1：詞級完全一致率（Token Exact Match）**
   - `(han, hpp)` 兩者皆與標準答案一致的詞比例（確保連寫、大小寫與斷詞品質）。
3. **輔指標 2：斷詞邊界 F1（Segmentation F1）**
   - 僅比對諸夏字切詞邊界，用來區分「切錯但讀音對」與「切錯導致讀音錯」。

---

## 4. 里程碑檢核

- [x] **M0**：一頁簡規、Schema v1 與 P0 測試集起手式（`tests/romaine_p0.json`、`tests/romaine_p0_eval.js`）。
- [ ] **M1**：離線語料統計腳本（產出四縣 unigram／bigram 詞頻 JSON 與高頻多音字偏好表）。
- [ ] **M2**：`romaine-auto.html` 副網頁 PoC（開關打開即時產生 + 現有手動微調 + `verified` 紀錄匯出），跑 P0 基準分數。
- [ ] **M3**：擴充 P0 測試集至 50–100 句，建立修正紀錄寫入機制。
