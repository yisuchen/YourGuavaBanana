export default {
  async fetch(request, env) {
    // 限制僅允許您的 GitHub Pages 網域存取
    const allowedOrigin = 'https://yisuchen.github.io';
    const origin = request.headers.get('Origin');

    // 如果是開發環境 (localhost) 也可以考慮放行，否則建議僅限正式網域
    const corsHeaders = {
      'Access-Control-Allow-Origin': origin === allowedOrigin ? allowedOrigin : allowedOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // 1. 處理預檢請求 (CORS)
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // 2. 如果是直接開啟網址 (GET)，回傳說明訊息
    if (request.method === 'GET') {
      return new Response("BananaGuava API Worker is Running. Authorized for: " + allowedOrigin, {
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

      // --- 資安強化：輸入驗證 ---
      if (data.prompt && data.prompt.length > 5000) {
        throw new Error("提示詞內容過長 (上限 5000 字)");
      }

      if (data.image && data.image.content) {
        // Base64 估計大小: content.length * 0.75
        const estimatedSize = data.image.content.length * 0.75;
        if (estimatedSize > 10 * 1024 * 1024) {
          throw new Error("圖片檔案過大 (上限 10MB)");
        }
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

      // --- POST: 建立新投稿 或 同步變數 ---
      if (method === 'POST') {
        // 判斷是否為自動同步變數
        if (data.action === 'sync_variables') {
          if (!data.key || !data.value) {
            throw new Error("同步變數需要 key 與 value");
          }

          const poolTitle = "[Variable Growth Pool]";
          const searchUrl = `https://api.github.com/search/issues?q=repo:${env.GITHUB_OWNER}/${env.GITHUB_REPO}+type:issue+state:open+in:title+${encodeURIComponent(poolTitle)}`;
          
          const searchResponse = await fetch(searchUrl, {
            headers: {
              'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
              'User-Agent': 'BananaGuava-Worker'
            }
          });
          const searchResult = await searchResponse.json();
          const newEntry = `\n${data.key} = ${data.value}`;

          if (searchResponse.ok && searchResult.total_count > 0) {
            // 找到了，進行附加 (Append)
            const existingIssue = searchResult.items[0];
            const issueUrl = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/issues/${existingIssue.number}`;
            
            // 檢查是否已經存在該變數值，避免無限增長
            if (existingIssue.body.includes(newEntry.trim())) {
               return new Response(JSON.stringify({ success: true, message: "Value already in pool" }), {
                 headers: { ...corsHeaders, 'Content-Type': 'application/json' }
               });
            }

            await fetch(issueUrl, {
              method: 'PATCH',
              headers: {
                'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
                'Content-Type': 'application/json',
                'User-Agent': 'BananaGuava-Worker'
              },
              body: JSON.stringify({
                body: existingIssue.body + newEntry
              })
            });

            return new Response(JSON.stringify({ success: true, mode: 'append' }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          } else {
            // 沒找到，建立一個新的
            const issueBody = `### Variables (key=value)\n${data.key} = ${data.value}\n\n--- \n*此為變數彙整池，請勿刪除*`;
            const createResponse = await fetch(`https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/issues`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
                'Content-Type': 'application/json',
                'User-Agent': 'BananaGuava-Worker'
              },
              body: JSON.stringify({
                title: poolTitle,
                body: issueBody,
                labels: ['accepted', 'auto-sync']
              })
            });
            const result = await createResponse.json();
            return new Response(JSON.stringify({ success: createResponse.ok, id: result.number, mode: 'create' }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
        }

        // 原有的投稿邏輯...
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

