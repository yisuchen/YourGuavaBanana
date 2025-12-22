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

---

## 1. 成果規格（Definition of Done）

### 1.1 必要功能（MVP）
1. [x] 靜態網站可在 GitHub Pages 上線（無任何後端服務）。
2. [x] 網站會從 GitHub API 讀取特定 repo 的 Issues：
   - [x] 只顯示帶有 `accepted` label 的 Issue。
   - [x] 排除 Pull Requests（PR）。
3. [x] 網站呈現每筆 prompt：
   - [x] 顯示標題
   - [x] 顯示分類勳章 (Badge)
   - [x] 顯示 prompt 預覽（代碼區塊風格）
   - [x] 顯示標籤 (#hashtag 格式)
   - [x] 點擊卡片開啟詳細內容彈窗 (Modal)
   - [x] 提供「複製提示詞」按鈕（浮動於內容區塊）
4. [x] 網站提供基本互動：
   - [x] 關鍵字搜尋（標題、內容、標籤）
   - [x] 以標籤/分類篩選（下拉選單）
5. [x] 提供投稿入口：
   - [x] 一個「🍌 投稿新香蕉」按鈕，具備磨砂質感與發光特效。
6. [x] 提供審核流程：
   - [x] Issue Form 投稿預設加上 `pending`
   - [x] 管理員手動改 label 為 `accepted` 後，網站就會出現該筆 prompt

---

## 2. 技術限制與設計原則

1. [x] 原生 HTML/CSS/Vanilla JS（不引入 framework）。
2. [x] 不引入伺服器/資料庫；所有資料都從 GitHub Issues 來。
3. [x] 考量 GitHub API rate limit：
   - [x] 實作 GitHub Actions 自動生成 `data.json` 避免 API 限制。
   - [x] 前端優先讀取本地 `data.json`，失敗則 fallback 到 API。
4. [x] 視覺設計：深色主題、現代感、具備良好的垂直節奏與呼吸感。

---

## 3. 資料模型（Issue Form 欄位）

Issue Form 產生的 Markdown body 解析欄位：

- [x] 標題（Title）
- [x] 分類（Category）
- [x] 提示詞內容（Prompt）
- [x] 標籤（Tags）
- [x] 使用說明（Notes）
- [x] 來源（Source）
- [x] 預覽圖片（Image URL）

---

## 4. Milestones（里程碑）完成狀況

### M0 — 初始化 (Done)
- [x] 建立 repo 與基礎檔案結構
- [x] 設定 GitHub Pages 部署

### M1 — 投稿表單 (Done)
- [x] 建立 `.github/ISSUE_TEMPLATE/prompt-submission.yml`
- [x] 設定自動帶入 `pending` label

### M2 — 核心顯示功能 (Done)
- [x] 實作 GitHub API 串接與資料過濾
- [x] 實作卡片式 UI 與 響應式佈局 (Responsive Design)

### M3 — 解析與詳細視窗 (Done)
- [x] 實作 `extractSection` 邏輯解析 Issue body
- [x] 實作彈窗 (Modal) 顯示詳細資訊、使用說明與來源連結
- [x] 實作一鍵複製功能

### M4 — 搜尋與篩選 (Done)
- [x] 實作即時搜尋框
- [x] 實作動態標籤/分類篩選下拉選單

### M5 — 效能優化 (Done)
- [x] 實作 GitHub Action (`sync-issues.yml`) 自動同步 `data.json`
- [x] 實作雙軌資料載入機制

### M6 — 視覺與體感優化 (Done)
- [x] 修復分類與標籤重複顯示問題
- [x] 調整垂直間距與排版舒適度
- [x] 優化「投稿新香蕉」按鈕配色與質感

---

## 5. 後續優化建議 (Future Tasks)

- [ ] **多圖支援**：目前僅解析第一張圖片，未來可實作圖片輪播。
- [ ] **SEO 優化**：針對 Open Graph (OG) tag 進行動態優化（可能需要靜態站生成器）。
- [ ] **分享功能**：點擊複製後可產生帶有 ID 的網址，直接開啟特定彈窗。
- [ ] **深淺色切換**：雖然目前鎖定深色調，但可預留主題切換空間。
- [ ] **按讚/計數**：可串接 GitHub Reaction 作為簡單的熱度排序依據。