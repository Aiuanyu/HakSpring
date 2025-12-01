# Jules 強迫症分支修復指南

## 問題

Jules (google-labs-jules bot) 有個壞習慣：每次工作都會建立新分支，加上 `-1`, `-2`, `-3` 等後綴，即使你明確要求他在現有分支工作也一樣。

**範例**：
- 你要他在 `ai-collab-start-1` 工作
- 他卻建立 `ai-collab-start-1-1`, `ai-collab-start-1-2`, `ai-collab-start-1-3`...

這導致：
- PR 無法自動更新
- 分支歷史混亂
- 需要手動合併

## 解決方案

### 🚀 方案 1：自動化腳本（推薦）

使用 `auto-fix-jules.sh` 腳本自動偵測並修復：

```bash
./scripts/auto-fix-jules.sh ai-collab-start-1
```

**功能**：
- ✅ 自動偵測所有 `-1`, `-2`, `-3` 後綴分支
- ✅ 分析哪些是垃圾分支（只有空 commit）
- ✅ 自動 merge 有真實改動的分支
- ✅ 修復格式問題（如 `\n` 字面字串）
- ✅ 提供一鍵刪除垃圾分支的指令

**互動式操作**：
腳本會詢問你每個分支要不要修復，你可以選擇 `y` (修復)、`n` (跳過) 或 `s` (跳過)。

---

### 🤖 方案 2：GitHub Actions 自動偵測

已建立 `.github/workflows/detect-jules-ocd.yml`，功能：

- ✅ 自動偵測 Jules 建立的後綴分支
- ✅ 在相關 PR 自動留言通知
- ✅ 提供快速修復指令
- ✅ 區分垃圾分支與有效分支

**效果**：
- Jules 每次建立新分支，GitHub Actions 會自動在 PR 留言
- 留言包含快速修復指令
- 你可以直接複製貼上執行

**啟用方式**：
已經包含在這次 commit 中，merge 後自動啟用。

---

### 🔧 方案 3：手動快速修復

如果你知道具體的分支名稱：

```bash
# 1. 把 Jules 的改動推送到正確分支
git push origin ai-collab-start-1-3:ai-collab-start-1 --force

# 2. 刪除 Jules 的垃圾分支
git push origin --delete ai-collab-start-1-3
```

---

## 使用範例

### 情境：Jules 又建了 `ai-collab-start-1-4`

**使用自動化腳本**：

```bash
$ ./scripts/auto-fix-jules.sh ai-collab-start-1

🔍 自動偵測 Jules 的亂象...
基礎分支：ai-collab-start-1

🚨 發現以下 Jules 分支：
     1	ai-collab-start-1-1
     2	ai-collab-start-1-2
     3	ai-collab-start-1-3
     4	ai-collab-start-1-4

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 分析分支：ai-collab-start-1-1
...
```

腳本會逐一分析，詢問你是否要修復。

---

## 修復後清理

修復完成後，你可以批次刪除垃圾分支：

```bash
# 一次刪除多個垃圾分支
git push origin --delete \
  ai-collab-start-1-1 \
  ai-collab-start-1-2 \
  ai-collab-start-1-3
```

---

## 預防措施

### 1. 強化 AGENTS.md（已完成）

已經更新 `AGENTS.md` 的 **Branching and Communication** 章節，明確禁止建立後綴分支。

### 2. 每次給 Jules 任務時提醒

在 PR 或 issue 中明確指示：

> @google-labs-jules[bot]
>
> 請在 **`ai-collab-start-1`** 分支工作。
>
> ⚠️ **不要建立新分支**，也不要建立 `-1`, `-2`, `-3` 等後綴分支。

### 3. 使用 GitHub Actions 自動監控

啟用 `detect-jules-ocd.yml` workflow，每次 Jules 犯錯時自動通知。

---

## 腳本位置

- **自動化腳本**：`scripts/auto-fix-jules.sh`
- **簡易腳本**：`scripts/fix-jules-mess.sh`
- **GitHub Actions**：`.github/workflows/detect-jules-ocd.yml`
- **使用說明**：`JULES-FIX-README.md`（本檔案）

---

## 結論

Jules 的「強迫症」可能是工具的預設行為，無法完全避免。但透過自動化工具，你可以在 **5 秒內**修復問題，而不用每次都手動操作。

**推薦工作流程**：
1. ✅ GitHub Actions 會自動偵測並在 PR 留言
2. ✅ 每次 Jules 犯錯時，執行 `./scripts/auto-fix-jules.sh`
3. ✅ 定期清理垃圾分支
