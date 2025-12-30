# 🍌 BananaGuava - 香蕉芭樂提示詞倉庫 🍐

> **「香蕉你個芭樂：這裡不產水果，只產讓 AI 聽懂人話的神提示。」**

**BananaGuava** 是一個向 [mukiwu/prompts-vault](https://github.com/mukiwu/prompts-vault) 致敬並進行深度功能演進的學習實作專案。它突破了傳統靜態列表的限制，透過 GitHub Issues 與 Cloudflare Workers 的巧妙結合，打造出一個具備「進階變數替換」與「資安強化投稿系統」的無後端提示詞分享平台。

---

## 🚀 核心黑科技 (Core Innovations)

### 1. 進階互動變數引擎 (Advanced Variable Engine)
本專案的核心靈魂，讓靜態文字轉化為智慧模板。
- **雙態變數語法**：
    - **基礎型 `{{變數}}`**：顯示變數名，等待點擊選擇。
    - **預設型 `{{鍵名:預設值}}`**：初始即顯示預設內容（如 `{{城市:台北}}`），拿到即可複製，同時保留點擊切換選項的彈性。
- **智慧浮動選單 (Smart Popover)**：
    - **鏡像定位技術 (Mirror-Div Tracking)**：實作複雜的 Caret 定位邏輯，確保選單精準出現在文字游標處。
    - **智慧空間翻轉**：自動偵測視窗邊界，空間不足時自動向上彈出，解決 UI 遮擋問題。
- **在地化變數優先級**：優先載入該 Issue 專屬的變數選項，並與全站共用的 `default_variables.json` 完美合併。

### 2. 智慧投稿助手 (Submission Assistant)
我們提供具備專業輸入體驗的投稿介面。
- **即時偵測與同步 (Real-time Sync)**：輸入提示詞時，系統自動解析 `{{key}}` 甚至 `{{key:value}}`，並即時在下方生成選項標籤設定區。
- **殘影清除機制 (IME Defense)**：針對中文輸入法優化，自動清除輸入過程產生的碎片標籤（ㄖ -> 日 -> 日本），確保變數區整潔。
- **即時自訂值**：選單內建「✨ 自訂輸入值」功能並置頂，讓您隨時建立清單外的新選項。
- **多媒體支援**：支援檔案選取與剪貼簿直接貼上圖片進行預覽。

### 3. 高性能影像處理與資安
- **智慧縮圖代理**：全面串接 `wsrv.nl` 服務，自動進行 GitHub 原始圖片的縮放與 WebP 轉換。
- **Worker 資安鎖定**：
    - **CORS 來源鎖定**：API 僅接受來自特定 GitHub Pages 網域的請求。
    - **流量與負載驗證**：嚴格限制投稿字數與圖片 Payload 大小，防範惡意灌水。

---

## 🏗️ 系統架構 (Architecture)

本專案採用極簡但強大的「無伺服器 (Serverless)」架構：
- **資料儲存 (Source of Truth)**：GitHub Issues。
- **靜態快取 (Cache Layer)**：透過 GitHub Actions 定時執行 `generate_vars.js`，將 Issues 內容與 `default_variables.json` 合併，生成極速載入的 `data.json` 與 `variables.json`。
- **溝通橋樑 (API Layer)**：Cloudflare Workers 作為中轉站，處理匿名投稿的 SHA-256 雜湊驗證與 GitHub Issue API 發布。
- **展示層 (Frontend)**：純原生 Vanilla JavaScript、現代 CSS3 (Glassmorphism) 與 HTML5。

---

## 🛠️ 開發者指南

### 語法範例
- **基礎型**：`創作一幅以 {{性別}} 為主角的畫。`
- **預設型**：`查找地點位於 {{台灣城市:台北}} 且取得天氣。`

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
3. 執行本地同步腳本：`./manual_sync_forLocal.sh`（需安裝 GitHub CLI）。
4. 在 GitHub Actions Secrets 中設定 `GITHUB_TOKEN` 與 `AUTH_SALT`。

--- 🤝 致敬與感謝
- 原始設計理念參考：[MUKi's Prompts Vault](https://mukiwu.github.io/prompts-vault/)
- 影像處理服務：[wsrv.nl](https://wsrv.nl/)

---
*本專案程式碼開放，僅供學習與技術交流使用。*
