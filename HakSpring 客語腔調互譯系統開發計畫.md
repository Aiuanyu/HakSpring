---
created: 2025-11-23
tags: [hakka, hakspring, development-plan, ai-assisted]
purpose: Claude Code Web $250 credit 密集開發計畫
---

# HakSpring 客語腔調互譯系統開發計畫

## 專案背景

### 現有資源
- **HakSpring/HakLex 專案**：已開發的客語學習與查詢系統
- **資料來源**：
  - 教育部客語辭典（2024）六大腔調資料（~36 MB CSV）
  - 客語能力認證詞彙（3000+ 條，含音檔）
  - 六大腔調：四縣、海陸、大埔、饒平、詔安、南四縣
- **技術棧**：HTML/CSS/JavaScript（前端）、Python（資料處理）

### 專案目標

**核心功能：客語六腔智慧互譯引擎**

輸入任一腔調的客語詞彙，自動輸出其他腔調的對應翻譯，包括：
- 漢字用詞
- 拼音（HagPinPlus）
- 音檔連結
- 華語釋義

**延伸目標：為 AI 準備的訓練資料**

建立標準化的客語多腔對照平行語料庫，供未來 LLM fine-tuning 使用。

---

## 為什麼適合用 Claude Code Web 密集開發？

### ✅ 高技術複雜度
- CSV/ODS 多來源資料整合
- 客拼（HagPinPlus）標調規則處理
- 五度調值 ↔ 數字調值轉換邏輯
- 音韻對應規則推導
- 變調規則處理（大埔、海陸等）

### ✅ 大量既有程式碼需要理解
- 現有的 `main.js`、`process_all_data.py` 等腳本
- 資料處理流程（ODS → CSV → JS 物件）
- 前端查詢與顯示邏輯

### ✅ 需要生成完整測試與文件
- 單元測試（詞彙互譯準確度）
- API 文件
- 資料集使用說明

### ✅ 長期社會價值
- 保存臺灣客語腔調多樣性
- 建立跨腔調學習工具
- 為客語 AI/LLM 鋪路

---

## 12 小時密集開發計畫

### 階段一：資料統一化與對齊（4 小時）

#### 目標
建立統一的六腔對照資料庫，解決現有資料的不一致問題。

#### 具體任務

**Task 1.1：資料盤點與清理（1 小時）**
- [ ] 盤點教客典六腔 CSV 資料的欄位結構
- [ ] 盤點認證詞彙資料的結構
- [ ] 列出已知問題：
  - 編號對應問題（17-1 變成 1-17）
  - 音檔版本差異（110/111/112 年）
  - 拼音標調位置不一致（oo/ee 詔安腔）
  - 空白／全形半形問題
  - 南四縣資料的特殊標記（【】）

**Task 1.2：建立統一資料模型（1 小時）**

設計 JSON Schema：
```json
{
  "詞目編號": "gip-12345",
  "華語釋義": "損害賠償",
  "腔調資料": {
    "四縣": {
      "漢字": "損害賠償",
      "拼音_HagPinPlus": "sunˋ hoiˊ puiˇ siongˊ",
      "拼音_數字調值": "sun31 hoi55 pui11 siong55",
      "音檔": "https://...",
      "例句": [...]
    },
    "海陸": {...},
    "大埔": {...},
    "饒平": {...},
    "詔安": {...},
    "南四縣": {...}
  },
  "來源": "教客典",
  "詞性": "名詞",
  "領域": "法律"
}
```

**Task 1.3：撰寫資料轉換腳本（1.5 小時）**
```python
# scripts/unify_hakka_data.py

def load_gip_data():
    """載入教客典六腔資料"""
    pass

def load_cert_data():
    """載入認證詞彙資料"""
    pass

def align_by_vocabulary():
    """基於詞目內容對齊不同來源的資料"""
    pass

def normalize_tones():
    """統一調符標註位置（處理詔安腔 oo/ee）"""
    pass

def generate_unified_json():
    """產生統一格式的 JSON 資料庫"""
    pass
```

**Task 1.4：資料品質檢查（0.5 小時）**
- [ ] 檢測缺失的腔調資料（覆蓋率統計）
- [ ] 驗證拼音格式正確性
- [ ] 標記音檔連結失效的條目

**預期成果：**
- `data/unified_hakka_lexicon.json`（統一資料庫）
- `data/data_quality_report.json`（品質報告）

---

### 階段二：腔調對應與推導引擎（3 小時）

#### 目標
當某詞彙缺少特定腔調的資料時，能根據音韻規則自動推導。

#### 具體任務

**Task 2.1：音韻對應規則研究（0.5 小時）**

整理已知的音韻對應規則：
- 聲母對應（例如：四縣 f ↔ 海陸 v）
- 韻母對應（例如：四縣 er ↔ 海陸 r）
- 調值對應（例如：四縣 24 ↔ 海陸 53）

參考資料：
- 教育部《臺灣客家語常用詞辭典》編輯說明
- 羅肇錦《客語語音學》
- 現有資料的統計分析

**Task 2.2：建立音韻轉換規則庫（1 小時）**
```python
# rules/tone_mapping.json
{
  "四縣_to_海陸": {
    "聲調": {
      "24": "53",
      "11": "24",
      "31": "11",
      "55": "55",
      "5": "2",
      "2": "5"
    },
    "韻母": {
      "er": "r",
      "ii": "i"
    }
  }
}

# rules/phonetic_rules.py
class DialectConverter:
    def __init__(self):
        self.rules = load_mapping_rules()

    def convert(self, source_dialect, target_dialect, pinyin):
        """
        將某腔調的拼音轉換為另一腔調
        source_dialect: "四縣", "海陸" 等
        target_dialect: "四縣", "海陸" 等
        pinyin: "sun31 hoi55"
        返回: "sun11 hoi55" (海陸)
        """
        pass
```

**Task 2.3：智慧對應演算法（1 小時）**
```python
def find_dialect_equivalents(query_word, query_dialect):
    """
    輸入：某腔調的詞彙
    輸出：其他五個腔調的對應

    策略：
    1. 精確匹配：查詢資料庫中是否有相同編號的詞條
    2. 華語釋義匹配：透過華語釋義找到對應詞
    3. 音韻推導：當缺少資料時，根據規則推導
    """

    results = {
        "四縣": {"method": "exact", "data": {...}},
        "海陸": {"method": "inferred", "data": {...}},
        # ...
    }
    return results
```

**Task 2.4：變調規則處理（0.5 小時）**
- 大埔腔變調規則
- 其他腔調的連讀變調
- 標記變調形式與本調的對應關係

**預期成果：**
- 可運作的腔調轉換引擎
- 支援「精確匹配」與「音韻推導」兩種模式

---

### 階段三：API 與查詢介面（2.5 小時）

#### 目標
提供 Web API 與使用者介面，讓使用者可以查詢腔調對應。

#### 具體任務

**Task 3.1：RESTful API（FastAPI）（1.5 小時）**
```python
# api/main.py
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="HakSpring 客語腔調互譯 API")

@app.get("/translate")
def translate_dialect(
    word: str = Query(..., description="客語詞彙"),
    from_dialect: str = Query(..., description="來源腔調"),
    to_dialects: list[str] = Query(default=None, description="目標腔調")
):
    """
    範例：
    GET /translate?word=損害賠償&from_dialect=四縣&to_dialects=海陸,大埔

    返回：
    {
      "input": {"word": "損害賠償", "dialect": "四縣"},
      "results": {
        "海陸": {
          "漢字": "損害賠償",
          "拼音": "...",
          "method": "exact",
          "confidence": 1.0
        },
        "大埔": {...}
      }
    }
    """
    pass

@app.get("/search")
def search_by_chinese(
    chinese: str = Query(..., description="華語釋義"),
    dialects: list[str] = Query(default=["四縣"])
):
    """華語 → 客語查詢"""
    pass

@app.get("/pinyin")
def search_by_pinyin(
    pinyin: str = Query(..., description="拼音"),
    dialect: str = Query(..., description="腔調")
):
    """拼音查詢"""
    pass
```

**Task 3.2：整合到現有 HakSpring 前端（1 小時）**

新增查詢模式：「跨腔對照」
```javascript
// 在 main.js 中新增
async function queryDialectEquivalents(word, sourceDialect) {
    const response = await fetch(
        `/api/translate?word=${word}&from_dialect=${sourceDialect}`
    );
    const data = await response.json();
    displayDialectComparison(data);
}

function displayDialectComparison(data) {
    // 顯示六腔對照表格
    // 格式：
    // | 腔調 | 漢字 | 拼音 | 音檔 | 來源 |
    // | 四縣 | ... | ... | 🔊 | 教客典 |
    // | 海陸 | ... | ... | 🔊 | 推導 |
}
```

**預期成果：**
- 可運作的 API（localhost:8000）
- 整合到 HakSpring 的查詢介面

---

### 階段四：AI 訓練資料集生成（2 小時）

#### 目標
產生標準化的平行語料庫，供 AI/NLP 研究使用。

#### 具體任務

**Task 4.1：匯出多種格式（1 小時）**

```python
# export/generate_datasets.py

def export_huggingface_format():
    """
    Hugging Face datasets 格式

    {
      "translation": {
        "zh-TW": "損害賠償",
        "hak-四縣": "損害賠償",
        "hak-海陸": "損害賠償"
      },
      "pinyin": {
        "hak-四縣": "sunˋ hoiˊ puiˇ siongˊ",
        "hak-海陸": "..."
      },
      "audio": {
        "hak-四縣": "https://...",
      },
      "domain": "法律"
    }
    """
    pass

def export_tmx_format():
    """
    TMX（Translation Memory eXchange）格式
    用於 CAT 工具（電腦輔助翻譯）
    """
    pass

def export_openai_finetuning():
    """
    OpenAI fine-tuning JSONL 格式

    {"prompt": "將「損害賠償」翻譯成客語海陸腔",
     "completion": "損害賠償 (sunˊ hoiˇ puiˋ siongˇ)"}
    """
    pass

def export_parallel_corpus():
    """
    純文字平行語料（用於統計機器翻譯）

    檔案結構：
    corpus/
    ├── zh-TW.txt
    ├── hak-si.txt (四縣)
    ├── hak-hl.txt (海陸)
    └── ...

    每行對應相同的句子/詞彙
    """
    pass
```

**Task 4.2：資料集網站與文件（1 小時）**

建立 `dataset/` 資料夾：
```
dataset/
├── README.md
├── metadata.json
├── data/
│   ├── hakka_parallel_corpus.json
│   ├── hakka_parallel_corpus.csv
│   ├── hakka_parallel_corpus.tmx
│   └── openai_finetuning.jsonl
├── scripts/
│   └── load_dataset.py
└── LICENSE
```

`README.md` 內容：
```markdown
# 臺灣客語六腔對照語料庫

## 資料集統計
- 總詞條數：X,XXX
- 腔調覆蓋：
  - 四縣：X,XXX (XX%)
  - 海陸：X,XXX (XX%)
  - ...
- 領域分布：日常 (XX%), 法律 (XX%), ...

## 資料格式
...

## 使用範例
```python
from datasets import load_dataset
dataset = load_dataset("json", data_files="hakka_parallel_corpus.json")
```

## 引用方式
...

## 授權
CC BY 4.0（或其他適當授權）

## 貢獻
...
```

**預期成果：**
- 完整的資料集（多種格式）
- 詳細的文件與使用說明
- 可直接用於 AI 訓練

---

### 階段五：測試、文件與部署（0.5 小時）

#### 具體任務

**Task 5.1：單元測試**
```python
# tests/test_dialect_conversion.py

def test_exact_match():
    """測試精確匹配功能"""
    result = find_dialect_equivalents("損害賠償", "四縣")
    assert result["海陸"]["method"] == "exact"

def test_phonetic_inference():
    """測試音韻推導功能"""
    result = convert_pinyin("四縣", "海陸", "sun31 hoi55")
    assert result == "sun11 hoi55"

def test_tone_mapping():
    """測試變調處理"""
    pass
```

**Task 5.2：API 文件**
- 使用 FastAPI 自動生成的 Swagger UI
- 補充使用範例與說明

**Task 5.3：部署**
- 本地測試環境
- （選擇性）部署到 Cloudflare Pages / Vercel

---

## 需要準備的資訊與檔案

### 開始前請提供：

1. **資料檔案路徑**
   - 教客典六腔 CSV 檔案位置
   - 認證詞彙 CSV/JS 檔案位置
   - 現有的資料處理腳本（`process_all_data.py` 等）

2. **專案結構說明**
   - 主要的 JavaScript 檔案（`main.js`）
   - 資料載入流程
   - 前端顯示邏輯

3. **已知問題清單**
   - 目前資料的不一致問題
   - 需要修復的 bug
   - 希望改進的功能

4. **技術偏好**
   - 是否整合到現有 HakSpring，還是獨立專案？
   - API 是否需要部署到線上？
   - 是否願意開源釋出資料集？

---

## 預期成果總覽

### 可交付成果

**程式碼：**
- [ ] 統一資料處理腳本（Python）
- [ ] 腔調轉換引擎（Python）
- [ ] RESTful API（FastAPI）
- [ ] 前端查詢介面（JavaScript，整合到 HakSpring）
- [ ] 完整的單元測試

**資料集：**
- [ ] 統一格式的客語六腔對照資料庫（JSON）
- [ ] AI 訓練用平行語料（多種格式）
- [ ] 資料品質報告

**文件：**
- [ ] API 使用文件
- [ ] 資料集說明文件（README）
- [ ] 音韻轉換規則文件
- [ ] 部署指南

### 長期價值

**學術研究：**
- 提供客語音韻學研究資料
- 支援客語 NLP 工具開發

**語言教育：**
- 跨腔調學習工具
- 客語教材開發資源

**AI 發展：**
- 客語 LLM fine-tuning 資料
- 客語語音辨識／合成訓練資料

**文化保存：**
- 記錄臺灣客語腔調多樣性
- 建立數位化語言資源

---

## 開發流程建議

### 第一次 Session（前 6 小時）
1. 資料盤點與清理（1 小時）
2. 統一資料模型設計與實作（2 小時）
3. 腔調對應引擎核心邏輯（3 小時）

**Checkpoint：** 能夠載入資料並進行基本的腔調對應查詢

### 第二次 Session（中間 4 小時）
1. API 開發（2 小時）
2. 前端整合（1.5 小時）
3. AI 資料集匯出（0.5 小時）

**Checkpoint：** API 可運作，前端可查詢腔調對應

### 第三次 Session（最後 2 小時）
1. 完整測試（0.5 小時）
2. 資料集文件撰寫（1 小時）
3. 程式碼整理與提交（0.5 小時）

**Final：** 完整可用的系統 + 可釋出的資料集

---

## 技術細節補充

### 音韻轉換演算法範例

```python
def convert_tone(source_dialect, target_dialect, tone_number):
    """
    調值轉換
    四縣 31 → 海陸 11
    """
    mapping = TONE_MAPPING[f"{source_dialect}_to_{target_dialect}"]
    return mapping.get(tone_number, tone_number)

def convert_syllable(source_dialect, target_dialect, syllable):
    """
    音節轉換（聲母+韻母+調號）
    四縣 sun31 → 海陸 sun11
    """
    # 1. 分離聲母、韻母、調號
    initial, final, tone = parse_syllable(syllable)

    # 2. 轉換韻母（如果有對應規則）
    final = convert_final(source_dialect, target_dialect, final)

    # 3. 轉換調值
    tone = convert_tone(source_dialect, target_dialect, tone)

    # 4. 重組
    return f"{initial}{final}{tone}"
```

### 資料庫查詢優化

```python
# 建立索引加速查詢
def build_indices(data):
    indices = {
        "by_chinese": {},     # 華語釋義 → 詞條
        "by_pinyin": {},      # 拼音 → 詞條
        "by_id": {},          # 編號 → 詞條
    }

    for entry in data:
        # 建立多種索引
        chinese = entry["華語釋義"]
        indices["by_chinese"][chinese] = entry
        # ...

    return indices
```

---

## 問題與討論

在新的 session 開始前，可以先思考：

1. **資料優先級：** 教客典 vs. 認證詞彙，哪個作為主要資料來源？
2. **音韻推導準確度：** 是否需要人工驗證推導結果？
3. **開源策略：** 資料集授權方式（教育部資料的衍生授權問題）
4. **使用者介面：** 整合到現有 HakSpring，還是另做獨立頁面？
5. **API 部署：** 本地使用，還是需要線上服務？

---

## 相關資源連結

- **教育部臺灣客家語常用詞辭典**：https://hakkadict.moe.edu.tw/
- **客語能力認證**：https://elearning.hakka.gov.tw/
- **HagPinPlus 標調規則**：（在現有專案文件中）
- **Hugging Face Datasets**：https://huggingface.co/docs/datasets/
- **TMX 格式規範**：https://www.gala-global.org/tmx-14b

---

## 開始指令範例

```
Claude，我想要開發客語六腔互譯系統。請先：

1. 盤點專案中的資料檔案（CSV, ODS, JS）
2. 檢查現有的資料處理腳本
3. 分析資料結構與品質問題
4. 根據「HakSpring 客語腔調互譯系統開發計畫.md」開始實作

專案位置：[您的 repo 路徑]
主要資料檔案：[具體路徑]
```

---

*本文件建立時間：2025-11-23*
*適用於：Claude Code Web $250 credit 密集開發*
*預估開發時間：12 小時*
*技術棧：Python (FastAPI), JavaScript, HTML/CSS*
