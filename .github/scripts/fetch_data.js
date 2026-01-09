const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 設定目標路徑
const DATA_PATH = path.join(process.cwd(), 'data.json');
const PREVIEW_PATH = path.join(process.cwd(), 'data-preview.json');

function fetchIssues(label, outputPath) {
    console.log(`📥 正在抓取標籤為 [${label}] 的 Issues...`);
    try {
        // 使用 GitHub CLI 抓取資料
        // 如果在 GitHub Action 環境，會自動使用 GITHUB_TOKEN
        const cmd = `gh issue list --label "${label}" --state open --limit 100 --json title,body,labels,url,number`;
        let result = JSON.parse(execSync(cmd, { encoding: 'utf-8' }));
        
        // 如果是抓取 accepted 標籤，額外過濾掉變數池 Issue
        if (label === 'accepted') {
            const originalCount = result.length;
            result = result.filter(issue => !issue.title.includes('[Variable Growth Pool]'));
            if (result.length < originalCount) {
                console.log(`🧹 已從 ${path.basename(outputPath)} 中過濾掉變數池 Issue`);
            }
        }

        fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf-8');
        console.log(`✅ 成功更新 ${path.basename(outputPath)}`);
    } catch (error) {
        console.error(`❌ 抓取 [${label}] 失敗:`, error.message);
        process.exit(1);
    }
}

// 執行同步流程
console.log("🔍 開始同步 GitHub 資料...");

// 1. 抓取已接受的提示詞
fetchIssues('accepted', DATA_PATH);

// 2. 抓取待審核的提示詞 (預覽)
fetchIssues('pending', PREVIEW_PATH);

console.log("✨ 資料抓取完成。");
