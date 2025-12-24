export default {
  async fetch(request, env) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // 1. 處理預檢請求 (CORS)
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // 2. 如果是直接開啟網址 (GET)，回傳說明訊息而非錯誤
    if (request.method === 'GET') {
      return new Response("BananaGuava API Worker is Running. Waiting for POST submissions...", {
        status: 200,
        headers: corsHeaders
      });
    }

    // 3. 處理投稿 (POST)
    try {
      const data = await request.json();

      if (!data || !data.title) {
        throw new Error("收到的資料格式不正確或內容為空");
      }

      let imageUrl = "";

      // --- 圖片上傳邏輯 ---
      if (data.image && data.image.content) {
        const date = new Date().toISOString().split('T')[0];
        const safeFilename = `${Date.now()}_submission.png`;
        const path = `uploads/${date}/${safeFilename}`;
        const uploadUrl = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}`;

        const uploadResponse = await fetch(uploadUrl, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
            'Content-Type': 'application/json',
            'User-Agent': 'BananaGuava-Worker'
          },
          body: JSON.stringify({
            message: `upload image: ${safeFilename}`,
            content: data.image.content,
            encoding: 'base64'
          })
        });

        const uploadResult = await uploadResponse.json();

        if (uploadResponse.ok) {
          imageUrl = uploadResult.content.download_url;
        } else {
          // 如果圖片存不進 GitHub，直接報錯給前端
          throw new Error(`GitHub 圖片儲存失敗: ${uploadResult.message || '請檢查 Token 權限'}`);
        }
      }

      // --- 建立 Issue ---
      const issueBody = `### 提示詞內容
${data.prompt}

### 分類
${data.category || "未分類"}

### 來源 (Source)
${data.source || "No response"}

### 標籤
${data.tags || "No response"}

### Variables (key=value)
${data.variables || ""}

### 預覽圖片
${imageUrl ? `![Preview Image](${imageUrl})` : "No response"}

---
*此 Issue 由 BananaGuava 網頁版匿名投稿*`;

      const response = await fetch(`https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/issues`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
          'Content-Type': 'application/json',
          'User-Agent': 'BananaGuava-Worker'
        },
        body: JSON.stringify({
          title: `[Prompt]: ${data.title}`,
          body: issueBody,
          labels: ['pending']
        })
      });

      const result = await response.json();
      if (!response.ok) throw new Error(`GitHub Issue 建立失敗: ${result.message}`);

      return new Response(JSON.stringify({ success: true, url: result.html_url }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (error) {
      return new Response(JSON.stringify({ success: false, error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};

