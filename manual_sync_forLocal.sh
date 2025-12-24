#!/bin/bash

# BananaGuava 本地資料同步腳本
# 功能：抓取最新的 GitHub Issues 並更新本地 data.json 與 variables.json

echo "🔍 開始更新本地資料..."

# 1. 檢查 gh 指令是否存在
if ! command -v gh > /dev/null 2>&1; then
    echo "❌ 錯誤: 找不到 gh 指令，請先安裝 GitHub CLI。"
    exit 1
fi

# 2. 抓取最新的 Issues
echo "📥 正在從 GitHub 抓取資料至 data.json..."
gh issue list --label "accepted" --state open --limit 100 --json title,body,labels,url,number > data.json

if [ $? -eq 0 ]; then
    echo "✅ 成功更新 data.json"
else
    echo "❌ 抓取資料失敗。"
    exit 1
fi

# 3. 執行產出變數腳本
echo "⚙️ 正在根據新資料產生 variables.json..."
node .github/scripts/generate_vars.js

if [ $? -eq 0 ]; then
    echo "✅ 成功更新 variables.json"
    echo "✨ 本地資料已同步完成。"
else
    echo "❌ 產生變數檔案失敗。"
    exit 1
fi
