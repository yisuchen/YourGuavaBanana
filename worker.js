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

    // 3. 處理請求 (POST/PUT)
    try {
      const method = request.method;
      const data = await request.json();

      if (!data) {
        throw new Error("收到的資料格式不正確或內容為空");
      }

      // Helper: SHA-256 Hashing with SALT
      const hashPassword = async (password) => {
        const encoder = new TextEncoder();
        // 將密碼與環境變數中的 SALT 結合
        const salt = env.AUTH_SALT || "";
        const data = encoder.encode(password + salt);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      };

      // --- POST: 建立新投稿 ---
      if (method === 'POST') {
        if (!data.title || !data.password) {
          throw new Error("標題與密碼為必填項");
        }

        const passwordHash = await hashPassword(data.password);
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
            throw new Error(`GitHub 圖片儲存失敗: ${uploadResult.message}`);
          }
        }

        // --- 建立 Issue Body ---
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
*此 Issue 由 BananaGuava 網頁版匿名投稿*
<!-- auth: ${passwordHash} -->`;

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
      }

      // --- PUT: 更新現有投稿 ---
      if (method === 'PUT') {
        if (!data.number || !data.password) {
          throw new Error("Issue 編號與密碼為必填項");
        }

        // 1. 抓取現有的 Issue 內容以驗證密碼
        const getUrl = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/issues/${data.number}`;
        const getResponse = await fetch(getUrl, {
          headers: {
            'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
            'User-Agent': 'BananaGuava-Worker'
          }
        });

        if (!getResponse.ok) throw new Error("找不到指定的投稿，無法更新");
        const existingIssue = await getResponse.json();

        // 2. 驗證密碼雜湊
        const match = existingIssue.body.match(/<!-- auth: (.*?) -->/);
        if (!match) throw new Error("此投稿不支援匿名編輯或認證資訊已損毀");

        const inputHash = await hashPassword(data.password);
        if (inputHash !== match[1]) {
          return new Response(JSON.stringify({ success: false, error: "密碼錯誤" }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // 3. 處理新圖片 (如果有)
        let imageUrl = data.existingImageUrl || "";
        if (data.image && data.image.content) {
          const date = new Date().toISOString().split('T')[0];
          const safeFilename = `${Date.now()}_update.png`;
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
              message: `update image: ${safeFilename}`,
              content: data.image.content,
              encoding: 'base64'
            })
          });

          const uploadResult = await uploadResponse.json();
          if (uploadResponse.ok) imageUrl = uploadResult.content.download_url;
        }

        // 4. 更新 Issue Body
        const newIssueBody = `### 提示詞內容
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
*此 Issue 由 BananaGuava 網頁版匿名投稿*
<!-- auth: ${match[1]} -->`;

        const patchResponse = await fetch(getUrl, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
            'Content-Type': 'application/json',
            'User-Agent': 'BananaGuava-Worker'
          },
          body: JSON.stringify({
            title: `[Prompt]: ${data.title}`,
            body: newIssueBody
          })
        });

        if (!patchResponse.ok) throw new Error("GitHub 更新失敗");

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

    } catch (error) {
      return new Response(JSON.stringify({ success: false, error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};

