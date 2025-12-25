# 🍌 BananaGuava - 香蕉芭樂提示詞倉庫 🍐

> **「香蕉你個芭樂：這裡不產水果，只產讓 AI 聽懂人話的神提示。」**

**BananaGuava** 是一個向 [mukiwu/prompts-vault](https://github.com/mukiwu/prompts-vault) 致敬並進行深度功能演進的學習實作專案。它突破了傳統靜態列表的限制，透過 GitHub Issues 與 Cloudflare Workers 的巧妙結合，打造出一個具備「互動變數替換」與「智慧投稿系統」的無後端提示詞分享平台。

---

## 🚀 核心黑科技 (Core Innovations)

### 1. 互動式變數引擎 (Interactive Variable Engine)
這是本專案與一般提示詞庫最大的不同點。
- **動態 UI 生成**：自動解析提示詞內容中的 `{{key}}` 語法，並將其渲染為可點擊的互動按鈕（Pill）。
- **智慧浮動選單 (Popover)**：點擊變數按鈕即跳出選單，使用者可從預設選項中挑選或直接輸入自訂內容。
- **在地化變數 (Localized Variables)**：
    - 支援從 GitHub Issue 正文中解析隱藏的 `Variables (key=value)` 區塊。
    - **優先級機制**：彈窗選單會優先顯示該提示詞專屬的選項（如：特定的台灣在地地標），若無則回退至全站共用的 `variables.json`。

### 2. 智慧投稿助手 (Submission Assistant)
我們提供兩套投稿路徑，兼顧管理效率與使用者隱私。
- **GitHub 原生投稿**：利用 Issue Form 結構化輸入，適合開發者參與。
- **網頁版匿名投稿**：
    - **無後端上傳**：串接 Cloudflare Workers API，實現免登入投稿並同步發布至 GitHub。
    - **變數自動偵測**：輸入提示詞時，系統會即時偵測 `{{key}}` 並動態生成下方的變數選項設定區。
    - **現代化 Pill UI**：標籤（Tags）與變數選項均採用「膠囊標籤」形式，支援 Enter 新增與一鍵刪除。
    - **圖片上傳與剪貼**：支援檔案選取與剪貼簿貼上圖片預覽。

### 3. 高性能影像處理系統
- **智慧縮圖代理**：全面串接 `wsrv.nl` 影像服務，自動將 GitHub 上的原始圖片進行縮放與 WebP 格式轉換。
- **延遲載入 (Lazy Loading)**：大幅減少首屏流量與渲染壓力。

---

## 🏗️ 系統架構 (Architecture)

本專案堅持「無伺服器 (Serverless)」原則，極大化利用現成生態系：
- **資料層 (Storage)**：GitHub Issues。
- **緩存層 (Cache)**：透過 GitHub Actions 定時抓取 Issues 並生成 `data.json` 與 `variables.json` 靜態檔案，避開 GitHub API Rate Limit。
- **通訊層 (API)**：Cloudflare Workers 作為中轉站，處理匿名投稿的驗證與發布。
- **展示層 (Frontend)**：純原生 Vanilla JavaScript、CSS3 (Glassmorphism 磨砂玻璃濾鏡) 與 HTML5。

---

## 🎨 UI/UX 特色
- **深色美學**：採用 Deep Navy 配色，搭配 Banana Yellow (#fbbf24) 與 Guava Green (#22c55e) 的品牌雙色。
- **響應式格狀佈局**：自動適應手機、平板與桌機螢幕。
- **雙軌載入機制**：優先載入本地 JSON 檔案以追求極速，失敗時自動回退 (Fallback) 請求 GitHub API。

---

## 🛠️ 開發者指南

### 建立你的專屬 Vault
1. **Fork** 本專案。
2. 修改 `bananaGuava.js` 中的 `CONFIG`：
   ```javascript
   const CONFIG = {
       owner: '你的GitHub帳號',
       repo: '你的專案名稱',
       worker_url: '你的CloudflareWorker網址'
   };
   ```
3. 設定 GitHub Actions 的 Secret 以啟用自動同步。
4. 在 GitHub Pages 設定中開啟部署。

### 文件索引
- [開發規劃藍圖 (Roadmap)](plan.md)
- [投稿模板定義](.github/ISSUE_TEMPLATE/prompt-submission.yml)
- [匿名投稿 Worker 代碼](worker.js)

---

## 🤝 致敬與感謝
- 原始設計理念參考：[MUKi's Prompts Vault](https://mukiwu.github.io/prompts-vault/)
- 圖片處理服務：[wsrv.nl](https://wsrv.nl/)
- 專案圖示與 UI 色彩：由 BananaGuava 團隊設計。

---
*本專案程式碼開放，僅供學習與技術交流使用，請尊重提示詞創作者的版權。*