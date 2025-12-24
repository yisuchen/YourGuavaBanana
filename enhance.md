# YourBanaGuava - Enhance Plan (Variables Quick Replace)

## 0. 背景
既有架構：
- Database：GitHub Issues
- 審核：Labels（pending / accepted）
- 前台：純前端讀 data.json / fallback GitHub API
- 部署：GitHub Pages
- 已有 GitHub Action 產出 data.json

本次 Enhance 目標（更新後）：
- 維持「無後端、純前端、GitHub Pages」；不使用 localStorage（不保存使用者狀態）
- 支援 prompt 內的 `{{key}}` 變數
- 投稿時在 Issue Form 提供 Variables 欄位（單一 textarea，支援多組 key/value）
- GitHub Action 每次全量掃描所有 accepted prompts，重建全站共用 `variables.json`
- 前端 Modal：
  - 顯示變數填寫區（若 variables.json 有 key → 下拉選單；否則 → 文字輸入）
  - 一鍵複製「已替換」提示詞
- 新增「匿名投稿（前端 Modal）」作為投稿助手：
  - 允許動態新增任意組變數 key/value
  - 自動生成 Variables textarea 的文字格式
  - 最終導向 GitHub Issue Form 投稿（使用者需登入 GitHub 才能建立 issue）

---

## 1. 成果規格（Definition of Done）

### 1.1 MVP — Variables Aggregation + Replace
- [ ] Issue Form 新增欄位：Variables（可選填，單一 textarea）
- [ ] GitHub Action 每次全量掃描所有 accepted issues，重建 `variables.json`
- [ ] 前端載入 `variables.json`（優先讀本地，失敗可忽略不 fallback）
- [ ] Modal 開啟時：解析 prompt 內 `{{key}}`
- [ ] 若 `variables.json[key]` 存在且有 options → 顯示下拉選單（可搜尋）
- [ ] 若不存在 → 顯示文字輸入框
- [ ] 提供「複製已替換提示詞」按鈕：用使用者當次選取/輸入的值替換 `{{key}}`

### 1.2 投稿助手（匿名投稿 Modal）— Dynamic Variables Builder
- [ ] 網站提供「投稿新香蕉」入口，改為先開啟前端 Modal 表單（投稿助手）
- [ ] 投稿助手支援「+ 新增變數」動態增加 key/value 組數（不限數量）
- [ ] 投稿助手將變數組數自動組裝成 Variables textarea 內容（符合第 2 節格式）
- [ ] 投稿助手提供兩種投稿方式（至少要有 A）：
  - A) 複製 Variables / Prompt 等內容 + 開啟 GitHub Issue Form（穩定 fallback）
  - B)（可選）用 URL query 預填部分欄位；若失效則回到 A

### 1.3 互動體感
- [ ] 下拉選單支援搜尋（datalist / 自製搜尋皆可）
- [ ] 未填值時，替換規則清楚（見第 4 節）
- [ ] 變數 key 若含英文，一律轉 lower case（前端 + Action 雙保險）

---

## 2. 投稿階段：Variables 欄位格式規格（Issue Form）

### 2.1 欄位位置
在 `.github/ISSUE_TEMPLATE/prompt-submission.yml` 新增一個 textarea 欄位：
- label：Variables (key=value)
- description：提供此 prompt 相關變數候選值，會被全站彙整成選單（accepted 才會納入）
- required：false

### 2.2 格式（支援多組）
一行一組 key/value，key 與 value 以 `=` 或 `:` 分隔；value 以 `,` 分隔 options：

rea = 台北, 中和, 土城
role: 工程師, 英文老師, 建築師
lang = 中文, English, 日本語


### 2.3 Key 正規化（規範）
- 若 key 含英文：一律轉為 lower case
- 建議 key 使用英數與底線（如 `area`, `role`, `lang`）
- Action 端會做最終正規化（前端只是輔助）

### 2.4 Parsing 規則（Action 端）
- 忽略空行
- 支援分隔符：`=` 或 `:`
- key：
  - trim
  - toLowerCase（必做）
  - （建議）空白轉底線：`my key` → `my_key`
- values：
  - 以 `,` 分隔
  - trim
  - 忽略空字串
  - 去重複
- 若某行無法解析（沒有分隔符 / key 空） → 忽略該行

> MVP 不處理「value 內含逗號」；若未來需要，可改用多行 values 或支援 `\,` 逃逸。

---

## 3. GitHub Action：全量重建 variables.json（方案 A）

### 3.1 觸發條件（建議）
- issues:
  - opened
  - edited
  - labeled
  - unlabeled
- workflow_dispatch（手動）

### 3.2 掃描目標
- 同你既有 data.json 流程：
  - 只取 label=accepted 的 issues
  - 排除 Pull Requests

### 3.3 產出檔案
- `data.json`（既有）
- `variables.json`（新增）
  - 結構：`{ [key: string]: string[] }`
  - options 建議排序（localeCompare）以降低 diff 噪音
- （可選）`meta.json`：
  - updatedAt
  - totalAcceptedIssues
  - totalVariableKeys

### 3.4 Commit 策略（建議）
- 僅在內容變動時 commit（避免無意義提交）
- variables.json 與 data.json 同步更新（同一個 workflow 內完成）

---

## 4. 前端：替換規則與 UI 行為

### 4.1 模板語法（Prompt 端）
- 變數 token：`{{key}}`
- key 建議用英數/底線（例如 `area`, `role`, `lang`）
- key 比對建議採 lower case（與 variables.json 對齊）

### 4.2 變數偵測
- 在 modal 打開時，從 prompt 文字掃描所有 `{{...}}`
- 去重複並保留出現順序（提升體感）
- 顯示時可保留原 key，但查找時使用正規化 key（lower case）

### 4.3 UI 渲染規則
對每個 key：
- 如果 `variables.json[key]` 有 options：
  - render `<select>`（可加搜尋）
- 否則：
  - render `<input type="text">`

### 4.4 替換行為（Copy Replaced）
- 當使用者按下「複製已替換提示詞」：
  - 對每個 key：
    - 若使用者有選/輸入值：把 `{{key}}` 全部替換成該值
    - 若沒有填：保留原樣 `{{key}}`（避免默默替換成空字串）
- 不保存任何狀態（刷新後不保留）

---

## 5. 前端：投稿助手（匿名投稿 Modal）設計

### 5.1 目標
- 讓使用者在網站內先完成內容整理（包含動態變數組數）
- 產生「可貼進 Issue Form」的內容
- 最終導向 GitHub Issues 投稿（不代發、不寫入後端）

### 5.2 主要 UI
- Prompt 基本欄位（與 Issue Form 同步）：
  - Title / Category / Prompt / Tags / Notes / Source / Image URL
- Variables Builder：
  - 變數列清單（每列：key input + value input）
  - 「+ 新增變數」按鈕（可刪除列）
  - key 自動 lower case（至少針對英文字母）
  - value 支援逗號分隔 options
- 輸出區塊：
  - 自動生成 Variables textarea 文字（第 2 節格式）
  - 一鍵複製（包含 Variables 內容）

### 5.3 投稿行為
- 必要（A）：
  - 「開啟 GitHub 投稿表單」按鈕（導向 repo 的 issues/new?template=...）
  - 同時提供「複製整包內容」/「複製 Variables」讓使用者貼上
- 可選（B）：
  - 嘗試用 URL query 預填（若失效則依然可貼上）

---

## 6. 里程碑（Milestones）

### E0 — Issue Form + variables.json 產出
- [ ] prompt-submission.yml 新增 Variables textarea（單一欄位）
- [ ] Action：在同步 data.json 同時，全量彙整並輸出 variables.json
- [ ] 前端：載入 variables.json（與 data.json 同步載入）

### E1 — Modal Variables UI（替換功能）
- [ ] 解析 prompt 的 `{{key}}`
- [ ] 生成表單（select / text）
- [ ] 實作「複製已替換提示詞」

### E2 — 投稿助手（匿名投稿 Modal）
- [ ] 新增投稿 modal 表單（可動態新增變數組數）
- [ ] 自動生成 Variables textarea 格式
- [ ] 提供複製 + 開啟 GitHub Issue Form 投稿（含 fallback）

### E3 — 體感優化
- [ ] select 加搜尋
- [ ] 顯示該 key 的 options 來源數量（可選）
- [ ] 空值策略 UX（提示使用者未填欄位）
- [ ] key 正規化一致性（前端 + Action）

---

## 7. 邊界案例與決策

- key 衝突（大小寫 / 空白差異）：
  - 一律採 key 正規化（trim + lower case +（可選）空白轉底線）後 union 合併
- options 衝突：
  - union 去重、排序
- issue 後續被改標籤（accepted -> pending）：
  - 因為全量重建，自然會被移出 variables.json（方案 A 的優點）
- 投稿助手與 Issue Form 欄位不一致：
  - 以 Issue Form 為準；投稿助手僅作為「填寫輔助」

---

## 8. Future Tasks
- [ ] Share Link：把當次填的 vars 編碼到 URL hash（不落地但可分享）
- [ ] Default 值支援：`{{key|default}}` 或從 Variables 欄位標記預設
- [ ] 類型支援：數字、multi-select、checkbox
- [ ] Variables 的更嚴謹格式：支援 `\,` 逗號逃逸或改
::contentReference[oaicite:0]{index=0}

