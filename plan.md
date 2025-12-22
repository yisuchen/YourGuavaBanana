# YourBanaGuava - 開發計畫:

## 概念
這是蒐集或建立你的香蕉概念庫的專案。
你可以發起 issue , 將各種香蕉提示詞、圖片、影片等放在這裡，方便日後查閱和分享。

## 目標：打造一個「無後端」的 Prompts Vault 網站  
> - **資料庫**：GitHub Issues  
> - **投稿**：GitHub Issue Form（表單）  
> - **審核**：Labels（pending / accepted）  
> - **前台**：純前端靜態網站（HTML/CSS/JS）讀 GitHub API  
> - **部署**：GitHub Pages  
>
> 本文件要給 AI 作為開發指令：按里程碑逐步完成，確保每一步可運作、可驗收。

---

## 1. 成果規格（Definition of Done）

### 1.1 必要功能（MVP）
1. 靜態網站可在 GitHub Pages 上線（無任何後端服務）。
2. 網站會從 GitHub API 讀取特定 repo 的 Issues：
   - 只顯示帶有 `accepted` label 的 Issue（默認 `state=open`）。
   - 排除 Pull Requests（PR）。
3. 網站呈現每筆 prompt：
   - 顯示 title
   - 顯示 prompt 內容（從 Issue body 解析指定欄位；若解析失敗則 fallback 顯示 body）
   - 顯示 labels（除流程用 label 可選擇隱藏）
   - 提供「複製提示詞」按鈕
   - 提供「開啟 Issue」連結
4. 網站提供基本互動：
   - 關鍵字搜尋（title/body/labels）
   - 以 label 篩選（下拉選單）
5. 提供投稿入口：
   - 一個「投稿新提示詞」按鈕，導向 GitHub 的 Issue Form（new issue template URL）
6. 提供審核流程：
   - Issue Form 投稿預設加上 `pending`
   - 管理員手動改 label 為 `accepted` 後，網站就會出現該筆 prompt

### 1.2 非目標（暫不做）
- 登入、收藏、使用者個人資料
- 網站內直接新增/編輯 Issue
- 付費、權限控管
- 多 repo 聚合（可列為後續擴充）

---

## 2. 技術限制與設計原則

1. 從空 repo 開始建立所有檔案。
2. 前端技術：原生 HTML/CSS/Vanilla JS（不引入 framework）。
3. 不引入伺服器/資料庫；所有資料都從 GitHub Issues 來。
4. 預設不使用 GitHub Token（避免洩漏）；可提供「可選」Token 模式（僅本機或 Actions 使用）。
5. 需考量 GitHub API rate limit：
   - MVP 可先用無 token 公開 API（小流量可用）
   - 進階：GitHub Actions 生成 `data.json`，前端讀本地 JSON 避免 rate limit

---

## 3. 資料模型（Issue Form 欄位）

Issue Form 需要產生可解析的 body。建議欄位：

- 標題（Title / Name）✅必填
- 提示詞內容（Prompt）✅必填
- 提示詞內容（category）✅必填, 製作一份選單選項供選擇
- 標籤（Tags，逗號分隔）選填
- 使用說明（Notes）選填
- 預覽圖片 選填, 可上傳圖檔

**解析策略：**
- 以 Issue Form 產生的 Markdown heading 區塊解析：
  - `### 提示詞內容` 下面直到下一個 `### ` 為 prompt
  - 若找不到 heading，fallback 顯示整段 body

---

## 4. Repo 結構（期望產出）
index.html
bananaGuava.css
bananaGuava.js
README.md
/.github/
/ISSUE_TEMPLATE/
prompt-submission.yml(中文/英文)

---

## 5. Milestones（里程碑）與任務清單

### M0 — 初始化（Repo + Pages）
**目標：** 網站能在 Pages 開起來
- [ ] 建立 repo（空白或帶 README）
- [ ] 加入 `index.html`, `style.css`, `app.js`（先顯示靜態頁）
- [ ] 開啟 GitHub Pages（main / root）
**驗收：**
- [ ] Pages URL 可打開，顯示標題與基本 UI（搜尋框、下拉、投稿按鈕）

---

### M1 — GitHub Issues Labels & Issue Form
**目標：** 能用表單投稿，且自動進 pending
- [ ] 建立 labels：`pending`, `accepted`
- [ ] 建立 `.github/ISSUE_TEMPLATE/prompt-submission.yml`
  - `labels: ["pending"]`
  - 欄位包含：標題、提示詞內容、標籤、說明
- [ ] README 說明投稿流程與審核方式
**驗收：**
- [ ] New issue 會看到表單
- [ ] 提交後 Issue 自帶 `pending` label

---

### M2 — 前端讀取 GitHub API（只顯示 accepted）
**目標：** 從 API 抓 accepted issues 並渲染成卡片
- [ ] 在 `app.js` 建立 CONFIG：
  - owner / repo / label / per_page
- [ ] 呼叫 GitHub API：
  - `GET https://api.github.com/repos/{owner}/{repo}/issues?state=open&labels=accepted&per_page=...`
  - 分頁抓取（至少支援 1~5 頁）
  - 過濾掉 `pull_request`
- [ ] 渲染卡片：
  - title、labels、body（暫時先整段）
  - Copy 按鈕（先複製 body）
  - 開啟 issue 連結
- [ ] 顯示載入/錯誤/空狀態訊息
**驗收：**
- [ ] 手動把某個 Issue 加上 `accepted` 後，網站刷新可看到
- [ ] Copy 可用，Issue link 可用

---

### M3 — 解析 Issue Body（取出「提示詞內容」欄位）
**目標：** 卡片只顯示 prompt 欄位（更像產品）
- [ ] 新增 `extractSection(body, headingText)`：
  - 找 `### 提示詞內容` 後面內容
  - 直到下一個 `### `
  - trim 後返回
- [ ] 卡片顯示/複製皆使用解析後的 promptText
- [ ] 若解析失敗則 fallback 為 body
**驗收：**
- [ ] 用 Issue Form 投稿後，卡片只顯示 Prompt 欄位
- [ ] Copy 只複製 Prompt 欄位

---

### M4 — 搜尋與 Label 篩選（基本探索體驗）
**目標：** 能快速找 prompt
- [ ] 搜尋框：即時 filter（title/body/labels）
- [ ] Label 下拉：從所有 issues labels 收集（可排除 `accepted/pending`）
- [ ] 顯示「顯示 N 筆」的狀態列
**驗收：**
- [ ] 輸入關鍵字會即時更新清單
- [ ] 選 label 會只顯示該 label 的 prompt

---

## 6. UI/UX 規格（簡潔但可用）

- 頂部：標題、簡短說明
- 工具列：搜尋 / label filter / 投稿按鈕
- 卡片：
  - 標題（issue title）
  - 標籤 chips
  - prompt（pre-wrap 顯示）
  - actions：Copy / Open Issue
- 深色主題（可先固定），確保行動裝置可用（responsive）

---

## 7. README 必須包含

- 這專案在做什麼（GitHub Issues 當資料庫）
- 新增 prompt 的方式（Issue Form）
- 審核/發布流程（pending → accepted）
- 部署方式（GitHub Pages）
- 如何改成自己的 repo（改 CONFIG owner/repo/label）
- 常見問題：
  - 看不到資料？請確認 Issue 有 `accepted`
  - API rate limit（後續 Actions 方案）

---

## 8. 進階（可選，M5 以後）

### M5 — 避免 Rate Limit：Actions 產生 data.json（推薦）
**目標：** 前端不打 GitHub API，改讀 repo 內的 `data.json`
- [ ] 建 GitHub Actions workflow（schedule + workflow_dispatch）
- [ ] 用 script 抓 issues（可用 token）
- [ ] 輸出 `public/data.json` 或根目錄 `data.json`
- [ ] 前端改抓 `./data.json`
**驗收：**
- [ ] 斷網/限流情境下（只要 pages 可載）仍可正常讀資料

### M6 — 更完整的欄位顯示
- [ ] tags 欄位逗號分隔 → chips
- [ ] notes 以折疊顯示
- [ ] 顯示作者、更新時間

---

## 9. 開發流程（給 AI 的工作方式要求）

- 每完成一個 milestone：
  1) 先更新檔案
  2) 簡述變更重點
  3) 提供驗收步驟（如何點、如何測）
- 不要一次把所有功能塞進去；確保每一步「可運作、可驗收」。
- 所有 URL / repo owner / repo name 都集中在 `CONFIG`，避免散落。
- 錯誤處理要友善：
  - API error 要顯示 status code
  - 空資料要提示「尚無 accepted prompts」

---

## 10. 驗收清單（最終）

- [ ] Pages 正常上線
- [ ] Issue Form 可投稿，預設 pending
- [ ] 管理員把 label 改成 accepted 後，網站出現
- [ ] 卡片可複製 prompt、可開 Issue
- [ ] 搜尋、label 篩選可用
- [ ] README 說明清楚，別人照 README 能成功部署一份自己的

---
