const CONFIG = {
    owner: 'yisuchen',
    repo: 'YourGuavaBanana',
    label: 'accepted',
    per_page: 100,
    worker_url: 'https://banana-guava-api.skyyisu.workers.dev'
};

// Application State
let state = {
    allPrompts: [],
    filteredPrompts: [],
    categories: new Set(),
    tags: new Set(),
    variables: {},
    filters: {
        search: '',
        category: 'All', // 'All' or specific category name
        tag: ''
    },
    pagination: {
        currentPage: 1,
        itemsPerPage: 24
    }
};

async function init() {
    setupEventListeners();
    // Sync dropdown with default state
    const itemsPerPageSelect = document.getElementById('itemsPerPage');
    if (itemsPerPageSelect) {
        itemsPerPageSelect.value = state.pagination.itemsPerPage;
    }
    await fetchPrompts();
}

async function fetchPrompts() {
    const { owner, repo, label, per_page } = CONFIG;
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/issues?state=open&labels=${label}&per_page=${per_page}`;

    try {
        let data;

        // Try local data.json first
        try {
            const localResponse = await fetch('data.json');
            if (localResponse.ok) {
                data = await localResponse.json();
                console.log('Loaded from data.json');
            }
        } catch (e) {
            console.log('data.json not found, falling back to API');
        }

        // Try local variables.json
        try {
            const varsResponse = await fetch('variables.json');
            if (varsResponse.ok) {
                state.variables = await varsResponse.json();
                console.log('Loaded from variables.json');
            }
        } catch (e) {
            console.log('variables.json not found or failed to load');
        }

        // Fallback to API if data not loaded
        if (!data) {
            const response = await fetch(apiUrl);
            if (!response.ok) {
                throw new Error(`GitHub API error: ${response.status}`);
            }
            data = await response.json();
        }

        // Process Data
        state.allPrompts = data
            .filter(issue => !issue.pull_request)
            .map(issue => processIssue(issue));
        
        // Extract unique Categories and Tags
        extractMetadata();

        // Initial Render
        renderCategoryFilters();
        updateTagFilterDropdown();
        applyFilters();

    } catch (error) {
        console.error('Error fetching prompts:', error);
        renderStats(`載入失敗: ${error.message}`);
    }
}

function processIssue(issue) {
    // 1. Title Processing
    let displayTitle = issue.title.replace(/^[\[]Prompt[\]]:\s*/i, '').trim();
    if (!displayTitle || displayTitle === '請在此輸入標題') {
        displayTitle = '未命名提示詞';
    }

    // 2. Body Parsing
    const tagsFromSection = extractSection(issue.body, '標籤');
    const categoryFromSection = extractSection(issue.body, '分類');

    let customTags = [];
    if (tagsFromSection) {
        customTags = tagsFromSection
            .split(/[,，]/)
            .map(t => t.trim())
            .filter(t => t);
    }

    // 3. GitHub Labels (exclude config label and 'pending')
    const githubLabels = issue.labels
        .map(l => typeof l === 'string' ? l : l.name)
        .filter(l => l !== CONFIG.label && l !== 'pending');

    const rawPromptText = extractSection(issue.body, '提示詞內容');
    // Remove Markdown images from prompt text to keep it clean
    const cleanPromptText = rawPromptText ? rawPromptText.replace(/!\[.*?\]\(.*?\)/g, '').trim() : '';

    return {
        ...issue,
        displayTitle: displayTitle,
        promptText: cleanPromptText,
        notes: extractSection(issue.body, '使用說明'),
        source: extractSection(issue.body, '來源 (Source)'),
        category: categoryFromSection ? categoryFromSection.trim() : '未分類',
        imageUrl: extractImage(issue.body),
        customTags,
        computedTags: [...new Set([...githubLabels, ...customTags])]
    };
}

function extractMetadata() {
    state.categories = new Set();
    state.tags = new Set();

    // First pass: collect all categories
    state.allPrompts.forEach(p => {
        if (p.category) {
            state.categories.add(p.category);
        }
    });

    // Second pass: collect tags that are not categories to keep them distinct
    state.allPrompts.forEach(p => {
        p.computedTags.forEach(t => {
            if (!state.categories.has(t)) {
                state.tags.add(t);
            }
        });
    });
}

function applyFilters() {
    const { search, category, tag } = state.filters;
    const term = search.toLowerCase();

    state.filteredPrompts = state.allPrompts.filter(p => {
        // 1. Category Filter
        if (category !== 'All' && p.category !== category) {
            return false;
        }

        // 2. Tag Filter
        if (tag && !p.computedTags.includes(tag)) {
            return false;
        }

        // 3. Search Filter
        if (term) {
            const matchesTitle = (p.displayTitle && p.displayTitle.toLowerCase().includes(term)) || p.title.toLowerCase().includes(term);
            const matchesPrompt = (p.promptText && p.promptText.toLowerCase().includes(term)) || p.body.toLowerCase().includes(term);
            const matchesTags = p.computedTags.some(t => t.toLowerCase().includes(term));
            
            if (!matchesTitle && !matchesPrompt && !matchesTags) {
                return false;
            }
        }

        return true;
    });

    // Reset to page 1 when filters change
    state.pagination.currentPage = 1;
    
    renderPage();
}

function renderStats(start, end, total) {
    const statsEl = document.getElementById('statsText');
    if (!statsEl) return;
    
    // Check if first argument is a string (error message)
    if (typeof start === 'string') {
        statsEl.textContent = start;
        return;
    }
    
    if (total === 0) {
        statsEl.textContent = '找不到符合條件的提示詞';
    } else {
        statsEl.textContent = `顯示第 ${start} - ${end} 筆，共 ${total} 筆`;
    }
}

function renderPage() {
    const { currentPage, itemsPerPage } = state.pagination;
    const totalItems = state.filteredPrompts.length;
    
    if (totalItems === 0) {
        renderCards([]);
        renderPagination(0);
        renderStats(0, 0, 0);
        return;
    }

    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
    
    const promptsToShow = state.filteredPrompts.slice(startIndex, endIndex);
    
    renderCards(promptsToShow);
    renderPagination(totalItems);
    renderStats(startIndex + 1, endIndex, totalItems);
}

function renderCategoryFilters() {
    const container = document.getElementById('categoryFilters');
    container.innerHTML = '';

    // "All" Badge
    const allBadge = createCategoryBadge('全部', 'All');
    container.appendChild(allBadge);

    // Sort categories
    const sortedCategories = Array.from(state.categories).sort();

    sortedCategories.forEach(cat => {
        container.appendChild(createCategoryBadge(cat, cat));
    });
}

function createCategoryBadge(label, value) {
    const badge = document.createElement('div');
    badge.className = `category-badge ${state.filters.category === value ? 'active' : ''}`;
    badge.textContent = label;
    badge.onclick = () => {
        // Update active state visually
        document.querySelectorAll('.category-badge').forEach(b => b.classList.remove('active'));
        badge.classList.add('active');

        // Update state and filter
        state.filters.category = value;
        applyFilters();
    };
    return badge;
}

function updateTagFilterDropdown() {
    const select = document.getElementById('tagFilter');
    select.innerHTML = '<option value="">所有標籤</option>';

    Array.from(state.tags).sort().forEach(tag => {
        const option = document.createElement('option');
        option.value = tag;
        option.textContent = tag;
        select.appendChild(option);
    });
}

function renderPagination(totalItems) {
    const container = document.getElementById('pagination');
    container.innerHTML = '';
    
    const totalPages = Math.ceil(totalItems / state.pagination.itemsPerPage);
    
    if (totalPages <= 1) return;

    // Previous Button
    const prevBtn = document.createElement('button');
    prevBtn.className = 'page-btn';
    prevBtn.innerHTML = '<span>&lsaquo;</span> 上一頁';
    prevBtn.disabled = state.pagination.currentPage === 1;
    prevBtn.onclick = () => changePage(state.pagination.currentPage - 1);
    container.appendChild(prevBtn);

    // Page Numbers logic
    let startPage = Math.max(1, state.pagination.currentPage - 2);
    let endPage = Math.min(totalPages, startPage + 4);
    
    if (endPage - startPage < 4) {
        startPage = Math.max(1, endPage - 4);
    }

    if (startPage > 1) {
        container.appendChild(createPageBtn(1));
        if (startPage > 2) {
            const dots = document.createElement('span');
            dots.className = 'page-dots';
            dots.textContent = '...';
            container.appendChild(dots);
        }
    }

    for (let i = startPage; i <= endPage; i++) {
        container.appendChild(createPageBtn(i));
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            const dots = document.createElement('span');
            dots.className = 'page-dots';
            dots.textContent = '...';
            container.appendChild(dots);
        }
        container.appendChild(createPageBtn(totalPages));
    }

    // Next Button
    const nextBtn = document.createElement('button');
    nextBtn.className = 'page-btn';
    nextBtn.innerHTML = '下一頁 <span>&rsaquo;</span>';
    nextBtn.disabled = state.pagination.currentPage === totalPages;
    nextBtn.onclick = () => changePage(state.pagination.currentPage + 1);
    container.appendChild(nextBtn);
}

function createPageBtn(pageNum) {
    const btn = document.createElement('button');
    btn.className = `page-btn ${state.pagination.currentPage === pageNum ? 'active' : ''}`;
    btn.textContent = pageNum;
    btn.onclick = () => changePage(pageNum);
    return btn;
}

function changePage(pageNum) {
    state.pagination.currentPage = pageNum;
    renderPage();
    // Scroll to top of filters or container
    document.getElementById('categoryFilters').scrollIntoView({ behavior: 'smooth' });
}

function renderCards(prompts) {
    const container = document.getElementById('promptContainer');
    container.innerHTML = '';

    if (prompts.length === 0) {
        // Message handled in renderStats usually, but good to have fallback
        return;
    }

    const fragment = document.createDocumentFragment();

    prompts.forEach(prompt => {
        const card = document.createElement('div');
        card.className = 'card';

        // Tags to show on card (exclude all categories)
        const displayTags = prompt.computedTags
            .filter(tag => !state.categories.has(tag))
            .slice(0, 3); // Max 3 tags

        const tagsHtml = displayTags
            .map(tag => `<span class="hashtag">#${escapeHtml(tag)}</span>`)
            .join(' ');

        const rawContent = prompt.promptText !== null ? prompt.promptText : prompt.body;
        const contentToDisplay = rawContent.length > 100 ? rawContent.substring(0, 100) + '...' : rawContent;

        // Image optimization: Use wsrv.nl for on-the-fly resizing and webp conversion
        let imageHtml = '<div class="placeholder">No Preview</div>';
        
        if (prompt.imageUrl) {
            // Encode the original URL for the proxy service
            // w=400: Resize width to 400px (sufficient for cards)
            // q=80: Quality 80%
            // output=webp: Convert to WebP for better compression
            const optimizedUrl = `https://wsrv.nl/?url=${encodeURIComponent(prompt.imageUrl)}&w=400&q=80&output=webp`;
            imageHtml = `<img src="${optimizedUrl}" alt="${escapeHtml(prompt.displayTitle)}" loading="lazy" decoding="async">`;
        }

        card.innerHTML = `
            <div class="card-image">${imageHtml}</div>
            <div class="card-body">
                <div class="card-category-tag">${escapeHtml(prompt.category)}</div>
                <h3 class="card-title">${escapeHtml(prompt.displayTitle)}</h3>
                <div class="card-content">${escapeHtml(contentToDisplay)}</div>
                <div class="card-tags">${tagsHtml}</div>
            </div>
        `;

        card.addEventListener('click', () => openModal(prompt));
        fragment.appendChild(card);
    });

    container.appendChild(fragment);
}

// --- Helpers ---

function extractImage(body) {
    if (!body) return null;
    const mdMatch = body.match(/!\[.*?\]\((.*?)\)/);
    if (mdMatch) return mdMatch[1];
    const htmlMatch = body.match(/<img.*?src=["'](.*?)["']/);
    if (htmlMatch) return htmlMatch[1];
    return null;
}

function extractSection(body, headingText) {
    if (!body) return null;
    const lines = body.split('\n');
    let content = [];
    let found = false;

    for (let i = 0; i < lines.length; i++) {
        if (
            lines[i].trim().startsWith('### ' + headingText) ||
            (headingText.includes('(') && lines[i].trim().startsWith('### ' + headingText.split(' (')[0]))
        ) {
            found = true;
            continue;
        }
        if (found) {
            if (lines[i].trim().startsWith('### ')) {
                break;
            }
            content.push(lines[i]);
        }
    }

    if (!found) return null;
    const result = content.join('\n').trim();
    if (result.toLowerCase() === '_no response_') return "";
    return result;
}

function escapeHtml(unsafe) {
    if (!unsafe) return "";
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function setupEventListeners() {
    document.getElementById('searchInput').addEventListener('input', (e) => {
        state.filters.search = e.target.value;
        applyFilters();
    });

    document.getElementById('tagFilter').addEventListener('change', (e) => {
        state.filters.tag = e.target.value;
        applyFilters();
    });

    document.getElementById('itemsPerPage').addEventListener('change', (e) => {
        state.pagination.itemsPerPage = parseInt(e.target.value);
        state.pagination.currentPage = 1; // Reset to first page
        renderPage();
    });

    // --- Modal events ---
    
    // Main Prompt Detail Modal
    const modal = document.getElementById('promptModal');
    const closeBtn = modal.querySelector('.close-button');
    closeBtn.onclick = () => closeModal();

    // Choice Modal
    const choiceModal = document.getElementById('choiceModal');
    const submitBtn = document.getElementById('submitBtn');
    const closeChoice = document.getElementById('closeChoice');
    const openAnonForm = document.getElementById('openAnonForm');

    submitBtn.onclick = () => {
        choiceModal.style.display = 'block';
        document.body.style.overflow = 'hidden';
    };

    closeChoice.onclick = () => {
        choiceModal.style.display = 'none';
        document.body.style.overflow = 'auto';
    };

    // Anonymous Form Modal
    const submitFormModal = document.getElementById('submitFormModal');
    const closeSubmitForm = document.getElementById('closeSubmitForm');
    const anonForm = document.getElementById('anonSubmissionForm');

    openAnonForm.onclick = () => {
        // Populate Categories
        const select = document.getElementById('formCategorySelect');
        // Keep the first default option
        select.innerHTML = '<option value="">請選擇分類...</option>';
        
        const sortedCategories = Array.from(state.categories).sort();
        sortedCategories.forEach(cat => {
            if (cat !== 'All' && cat !== '全部') {
                const option = document.createElement('option');
                option.value = cat;
                option.textContent = cat;
                select.appendChild(option);
            }
        });
        
        // Add "Other" option
        const otherOption = document.createElement('option');
        otherOption.value = "其他";
        otherOption.textContent = "其他 (手動輸入)";
        select.appendChild(otherOption);

        choiceModal.style.display = 'none';
        submitFormModal.style.display = 'block';
    };

    closeSubmitForm.onclick = () => {
        submitFormModal.style.display = 'none';
        document.body.style.overflow = 'auto';
    };

    // Global click to close modals
    window.onclick = (event) => {
        if (event.target == modal) closeModal();
        if (event.target == choiceModal) {
            choiceModal.style.display = 'none';
            document.body.style.overflow = 'auto';
        }
        if (event.target == submitFormModal) {
            submitFormModal.style.display = 'none';
            document.body.style.overflow = 'auto';
        }
    };

    // --- Image Upload Preview Logic ---
    const imageFileInput = document.getElementById('formImageFile');
    const imagePreviewContainer = document.getElementById('formImagePreviewContainer');
    const imagePreview = document.getElementById('formImagePreview');
    const removeImageBtn = document.getElementById('removeImageBtn');

    imageFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            // Check file size (15MB limit)
            if (file.size > 15 * 1024 * 1024) {
                alert('圖片太大囉！請選擇小於 15MB 的圖片。');
                imageFileInput.value = '';
                return;
            }

            const reader = new FileReader();
            reader.onload = (e) => {
                imagePreview.src = e.target.result;
                imagePreviewContainer.style.display = 'block';
            };
            reader.readAsDataURL(file);
        }
    });

    removeImageBtn.onclick = () => {
        imageFileInput.value = '';
        imageFileInput._pastedBlob = null; // Clear pasted image
        imagePreviewContainer.style.display = 'none';
        imagePreview.src = '';
    };

    // Paste Image Support & Variable Auto-Sync
    const formPrompt = document.getElementById('formPrompt');
    const suggestionsEl = document.getElementById('varSuggestions');
    let selectedSuggestionIndex = -1;

    formPrompt.addEventListener('input', (e) => {
        // Auto-sync variables
        syncVariablesWithPrompt();

        const cursorSettings = getCursorXY(formPrompt, formPrompt.selectionStart);
        const text = formPrompt.value;
        const cursorPos = formPrompt.selectionStart;
        
        // Find if we are currently inside a {{ }} tag
        const lastBraces = text.lastIndexOf('{{', cursorPos - 1);
        const lastClosing = text.lastIndexOf('}}', cursorPos - 1);
        
        if (lastBraces !== -1 && lastBraces > lastClosing) {
            const query = text.substring(lastBraces + 2, cursorPos).trim().toLowerCase();
            showSuggestions(query, cursorSettings);
        } else {
            hideSuggestions();
        }
    });

    formPrompt.addEventListener('keydown', (e) => {
        if (suggestionsEl.style.display === 'block') {
            const items = suggestionsEl.querySelectorAll('.suggestion-item');
            
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                selectedSuggestionIndex = (selectedSuggestionIndex + 1) % items.length;
                updateActiveSuggestion(items);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                selectedSuggestionIndex = (selectedSuggestionIndex - 1 + items.length) % items.length;
                updateActiveSuggestion(items);
            } else if (e.key === 'Enter' && selectedSuggestionIndex !== -1) {
                e.preventDefault();
                items[selectedSuggestionIndex].click();
            } else if (e.key === 'Escape') {
                hideSuggestions();
            }
        }
    });

    function showSuggestions(query, coords) {
        const keys = Object.keys(state.variables || {});
        const filtered = keys.filter(k => k.includes(query));
        
        if (filtered.length === 0 && query.length === 0) {
            // Show all keys if query is empty
            renderSuggestions(keys);
        } else if (filtered.length > 0) {
            renderSuggestions(filtered);
        } else {
            hideSuggestions();
            return;
        }

        suggestionsEl.style.display = 'block';
        // Position it near the cursor
        suggestionsEl.style.left = `${coords.x}px`;
        suggestionsEl.style.top = `${coords.y + 20}px`;
    }

    function renderSuggestions(list) {
        suggestionsEl.innerHTML = '';
        selectedSuggestionIndex = -1;
        list.forEach((key, index) => {
            const item = document.createElement('div');
            item.className = 'suggestion-item';
            item.textContent = key;
            item.onclick = () => {
                insertVariable(key);
                hideSuggestions();
            };
            suggestionsEl.appendChild(item);
        });
    }

    function updateActiveSuggestion(items) {
        items.forEach((item, index) => {
            if (index === selectedSuggestionIndex) {
                item.classList.add('active');
                item.scrollIntoView({ block: 'nearest' });
            } else {
                item.classList.remove('active');
            }
        });
    }

    function hideSuggestions() {
        suggestionsEl.style.display = 'none';
        selectedSuggestionIndex = -1;
    }

    function insertVariable(key) {
        const text = formPrompt.value;
        const cursorPos = formPrompt.selectionStart;
        const lastBraces = text.lastIndexOf('{{', cursorPos - 1);
        
        const before = text.substring(0, lastBraces);
        const after = text.substring(cursorPos);
        
        // If the user already typed part of the closing braces or not
        const hasClosing = after.trim().startsWith('}}');
        const replacement = `{{${key}${hasClosing ? '' : '}}'}`;
        
        formPrompt.value = before + replacement + (hasClosing ? after.substring(after.indexOf('}}') + 2) : after);
        
        // Focus back and set cursor
        formPrompt.focus();
        const newPos = before.length + replacement.length;
        formPrompt.setSelectionRange(newPos, newPos);
        
        // Trigger sync
        syncVariablesWithPrompt();
    }

    // Helper to get cursor coordinates in textarea
    function getCursorXY(textarea, selectionStart) {
        const { offsetLeft, offsetTop } = textarea;
        // Simple approximation
        return { x: 10, y: textarea.offsetTop + 30 };
    }

    formPrompt.addEventListener('paste', (e) => {
        const items = (e.clipboardData || e.originalEvent.clipboardData).items;
        for (const item of items) {
            if (item.type.indexOf('image') !== -1) {
                const blob = item.getAsFile();
                
                if (blob.size > 10 * 1024 * 1024) {
                    alert('貼上的圖片太大囉！請使用較小的圖片 (10MB 以內)。');
                    return;
                }

                // Manually create a FileList-like structure or just handle the blob directly


    // Form Submission
    anonForm.onsubmit = async (e) => {
        e.preventDefault();
        await handleAnonSubmission();
    };

    document.getElementById('modalImage').onclick = function () {
        if (this.src) window.open(this.src, '_blank');
    };
}

async function handleAnonSubmission() {
    const submitBtn = document.getElementById('submitAnonBtn');
    const statusEl = document.getElementById('submitStatus');
    const imageFileInput = document.getElementById('formImageFile');
    
    // Handle Category
    let category = document.getElementById('formCategorySelect').value;
    if (!category || category === '其他') {
        if (!category) category = '未分類';
    }

    // Prepare Base Data
    const data = {
        title: document.getElementById('formTitle').value,
        prompt: document.getElementById('formPrompt').value,
        category: category,
        tags: document.getElementById('formTags').value,
        source: document.getElementById('formSource').value,
        variables: collectVariables(),
        image: null
    };

    // Process Image if exists
    let fileToUpload = null;
    
    if (imageFileInput.files && imageFileInput.files[0]) {
        fileToUpload = imageFileInput.files[0];
    } else if (imageFileInput._pastedBlob) {
        // Use the pasted blob, give it a generic name
        fileToUpload = imageFileInput._pastedBlob;
        if (!fileToUpload.name) {
            // Add extension based on type
            const ext = fileToUpload.type.split('/')[1] || 'png';
            fileToUpload.name = `pasted_image.${ext}`;
        }
    }

    if (fileToUpload) {
        console.log("偵測到圖片檔案:", fileToUpload.name, "大小:", fileToUpload.size);
        try {
            const base64Content = await fileToBase64(fileToUpload);
            data.image = {
                content: base64Content.split(',')[1], // Strip data:image/png;base64,
                name: fileToUpload.name,
                type: fileToUpload.type
            };
            console.log("圖片已成功轉為 Base64");
        } catch (e) {
            console.error("圖片處理失敗:", e);
        }
    } else {
        console.log("本次投稿沒有包含圖片");
    }

    // Disable button and show loading
    submitBtn.disabled = true;
    const originalBtnText = submitBtn.innerHTML;
    submitBtn.innerHTML = '⏳ 處理中...';
    statusEl.style.display = 'block';
    statusEl.style.color = 'var(--accent-banana)';
    statusEl.textContent = '正在發送投稿 (包含上傳圖片)，請稍候...';

    try {
        const response = await fetch(CONFIG.worker_url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (result.success) {
            statusEl.style.color = 'var(--accent-guava)';
            statusEl.textContent = '✅ 投稿成功！請等待審核，頁面將於 3 秒後關閉。';
            document.getElementById('anonSubmissionForm').reset();
            document.getElementById('formImagePreviewContainer').style.display = 'none';
            
            setTimeout(() => {
                document.getElementById('submitFormModal').style.display = 'none';
                document.body.style.overflow = 'auto';
                statusEl.style.display = 'none';
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnText;
            }, 3000);
        } else {
            throw new Error(result.error || '發送失敗');
        }
    } catch (error) {
        statusEl.style.color = 'var(--accent-pink)';
        statusEl.textContent = `❌ 錯誤: ${error.message}`;
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnText;
    }
}

// Helper to convert File to Base64
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

// --- Modal Functions (Largely same as before but using state object if needed) ---

function openModal(prompt) {
    const modal = document.getElementById('promptModal');
    // Use promptText if available, otherwise body
    const rawContent = prompt.promptText !== null ? prompt.promptText : prompt.body;
    
    // Store original content for reference
    modal.dataset.rawContent = rawContent;

    const modalImage = document.getElementById('modalImage');
    
    // 1. Reset to Loading state
    modalImage.src = 'https://placehold.co/800x600/1e293b/94a3b8?text=Loading...';
    modalImage.style.cursor = 'wait';
    modalImage.title = '載入中...';
    modalImage.onclick = null;

    if (prompt.imageUrl) {
        const optimizedUrl = `https://wsrv.nl/?url=${encodeURIComponent(prompt.imageUrl)}&w=800&q=85&output=webp`;
        
        const img = new Image();
        img.onload = () => {
            if (document.getElementById('promptModal').style.display === 'block') {
                modalImage.src = optimizedUrl;
                modalImage.style.cursor = 'zoom-in';
                modalImage.title = '點擊查看原圖';
                modalImage.onclick = () => window.open(prompt.imageUrl, '_blank');
            }
        };
        img.src = optimizedUrl;
    } else {
        modalImage.src = 'https://placehold.co/600x400/222/a0a0a0?text=No+Preview';
        modalImage.style.cursor = 'default';
        modalImage.title = '';
    }
    
    document.getElementById('modalCategory').textContent = prompt.category;

    // --- Variables Handling (Inline) ---
    const modalPrompt = document.getElementById('modalPrompt');
    modalPrompt.innerHTML = ''; // Clear previous content

    // We no longer use modalVariablesGroup separately
    const varsGroup = document.getElementById('modalVariablesGroup');
    if (varsGroup) varsGroup.style.display = 'none';

    // Parse the content and render interactive elements
    // Split by {{...}} capturing the braces and content
    const parts = rawContent.split(/({{[^{}]+}})/g);
    
    parts.forEach(part => {
        const match = part.match(/{{(.*?)}}/);
        if (match) {
            const rawKey = match[1].trim();
            // Create interactive span
            const span = document.createElement('span');
            span.className = 'variable-placeholder';
            span.textContent = rawKey; // Initial text is the key
            span.dataset.key = rawKey;
            span.dataset.value = ''; // Currently no value selected
            
            // Add click handler for popover
            span.onclick = (e) => {
                e.stopPropagation(); // Prevent closing modal
                showVariablePopover(span, rawKey);
            };
            
            modalPrompt.appendChild(span);
        } else {
            // Regular text node
            modalPrompt.appendChild(document.createTextNode(part));
        }
    });

    // Notes
    const notesGroup = document.getElementById('modalNotesGroup');
    const notesContainer = document.getElementById('modalNotes');
    if (prompt.notes && prompt.notes.trim()) {
        notesGroup.style.display = 'block';
        notesContainer.textContent = prompt.notes;
    } else {
        notesGroup.style.display = 'none';
    }

    // Source
    const sourceGroup = document.getElementById('modalSourceGroup');
    const sourceContainer = document.getElementById('modalSource');
    if (prompt.source && prompt.source.trim()) {
        sourceGroup.style.display = 'block';
        sourceContainer.textContent = prompt.source;
    } else {
        sourceGroup.style.display = 'none';
    }

    // Tags
    const tagsGroup = document.getElementById('modalTagsGroup');
    const tagsContainer = document.getElementById('modalTags');
    const displayTags = prompt.computedTags.filter(t => !state.categories.has(t));

    if (displayTags.length > 0) {
        tagsGroup.style.display = 'block';
        tagsContainer.innerHTML = displayTags.map(tag => `<span class="hashtag">#${escapeHtml(tag)}</span>`).join(' ');
    } else {
        tagsGroup.style.display = 'none';
    }

    // Buttons
    const shareLink = document.getElementById('modalShareLink');
    shareLink.className = 'btn btn-guava';
    shareLink.innerHTML = '🍐 分享你的香蕉芭樂';
    shareLink.href = `https://github.com/${CONFIG.owner}/${CONFIG.repo}/issues/new/choose`;

    const editBtn = document.getElementById('modalEditBtn');
    editBtn.href = prompt.url;

    // Copy Button Logic
    const copyBtn = document.getElementById('modalCopyBtn');
    const newCopyBtn = copyBtn.cloneNode(true);
    copyBtn.parentNode.replaceChild(newCopyBtn, copyBtn);

    newCopyBtn.innerHTML = '📋 複製';
    newCopyBtn.classList.remove('btn-primary');
    newCopyBtn.onclick = () => {
        // Construct the text from the current state of DOM
        let finalPrompt = '';
        modalPrompt.childNodes.forEach(node => {
            if (node.nodeType === Node.TEXT_NODE) {
                finalPrompt += node.textContent;
            } else if (node.classList && node.classList.contains('variable-placeholder')) {
                // If a value is selected (dataset.value), use it
                // If not, use the original {{key}} format ? 
                // User requirement: "When selection done... prompt text becomes: 'Area: taiwan'"
                // So if value is set, use value. If not, use {{key}} or maybe just key? 
                // Let's stick to: if value set -> value. Else -> {{key}} (original behavior)
                const val = node.dataset.value;
                if (val) {
                    finalPrompt += val;
                } else {
                    finalPrompt += `{{${node.dataset.key}}}`;
                }
            }
        });
        copyToClipboard(newCopyBtn, finalPrompt);
    };

    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';

    // Click outside to close popover
    document.addEventListener('click', closePopoverOnClickOutside);
}

// Variable Popover Logic
let currentPopover = null;

function showVariablePopover(targetSpan, rawKey) {
    // Close existing
    if (currentPopover) {
        document.body.removeChild(currentPopover);
        currentPopover = null;
    }

    const key = rawKey.toLowerCase().replace(/\s+/g, '_');
    
    // Find options
    let options = state.variables[key];
    if (!options) options = state.variables[rawKey.toLowerCase()];
    // Fallback logic
    if (!options) {
        const parts = key.split('_');
        if (parts.length > 1) {
            const baseKey = parts.slice(0, -1).join('_');
            options = state.variables[baseKey];
        }
    }

    const popover = document.createElement('div');
    popover.className = 'variable-popover';
    
    const header = document.createElement('div');
    header.className = 'popover-header';
    header.textContent = `選擇 ${rawKey}`;
    popover.appendChild(header);

    const handleSelect = (value) => {
        targetSpan.textContent = value;
        targetSpan.dataset.value = value;
        targetSpan.classList.add('filled');
        closePopover();
    };

    if (options && Array.isArray(options) && options.length > 0) {
        options.forEach(optVal => {
            const item = document.createElement('div');
            item.className = 'popover-option';
            item.textContent = optVal;
            item.onclick = (e) => {
                e.stopPropagation();
                handleSelect(optVal);
            };
            popover.appendChild(item);
        });
    }

    // Always add an option to type manually if needed or if no options
    const inputWrapper = document.createElement('div');
    inputWrapper.className = 'popover-input-wrapper';
    
    const input = document.createElement('input');
    input.className = 'popover-input';
    input.placeholder = '自訂...';
    input.onclick = (e) => e.stopPropagation(); // Focus input
    input.onkeydown = (e) => {
        if (e.key === 'Enter') {
            handleSelect(input.value);
        }
    };

    const btn = document.createElement('button');
    btn.className = 'popover-btn';
    btn.textContent = '確認';
    btn.onclick = (e) => {
        e.stopPropagation();
        handleSelect(input.value);
    };

    inputWrapper.appendChild(input);
    inputWrapper.appendChild(btn);
    popover.appendChild(inputWrapper);

    document.body.appendChild(popover);
    currentPopover = popover;

    // Positioning
    const rect = targetSpan.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
    
    popover.style.top = `${rect.bottom + scrollTop + 5}px`;
    popover.style.left = `${rect.left + scrollLeft}px`;
    
    // Adjust if off-screen (simple check)
    if (rect.left + 200 > window.innerWidth) {
        popover.style.left = `${window.innerWidth - 220}px`;
    }
}

function closePopover() {
    if (currentPopover) {
        if (currentPopover.parentNode) {
            currentPopover.parentNode.removeChild(currentPopover);
        }
        currentPopover = null;
    }
}

function closePopoverOnClickOutside(e) {
    if (currentPopover && !currentPopover.contains(e.target)) {
        // If clicking the placeholder itself, we handled that in onclick (stopPropagation)
        // But if clicking another placeholder, this will fire first?
        // Actually the stopPropagation on span onclick prevents this from firing when clicking the span itself.
        // So this handles clicking anywhere else.
        closePopover();
    }
}

function closeModal() {
    const modal = document.getElementById('promptModal');
    modal.style.display = 'none';
    document.body.style.overflow = 'auto';
    closePopover();
    document.removeEventListener('click', closePopoverOnClickOutside);
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function copyToClipboard(btn, text) {
    navigator.clipboard.writeText(text).then(() => {
        const originalText = btn.innerHTML;
        btn.innerHTML = '✅ 已複製';
        btn.classList.add('copied');
        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.classList.remove('copied');
        }, 2000);
    }).catch(err => {
        console.error('Copy failed:', err);
    });
}

// --- Variables Builder Helpers (Auto-Sync Mode) ---

function syncVariablesWithPrompt() {
    const promptText = document.getElementById('formPrompt').value;
    const container = document.getElementById('varsBuilderContainer');
    
    // 1. Extract Keys: {{key}}
    // Support {{ key }} with spaces
    const matches = [...promptText.matchAll(/{{(.*?)}}/g)];
    const uniqueKeys = new Set();
    matches.forEach(m => {
        const key = m[1].trim();
        if (key) uniqueKeys.add(key);
    });

    // 2. Remove rows for keys that no longer exist
    const currentRows = Array.from(container.children);
    currentRows.forEach(row => {
        const rowKey = row.dataset.key;
        if (!uniqueKeys.has(rowKey)) {
            container.removeChild(row);
        }
    });

    // 3. Add rows for new keys
    uniqueKeys.forEach(key => {
        // Check if row exists
        const exists = currentRows.find(r => r.dataset.key === key);
        if (!exists) {
            createVariableRow(container, key);
        }
    });
}

function createVariableRow(container, key) {
    const row = document.createElement('div');
    row.className = 'var-row';
    row.dataset.key = key;
    row.style.background = '#1e293b';
    row.style.border = '1px solid #334155';
    row.style.borderRadius = '8px';
    row.style.padding = '10px';
    row.style.display = 'flex';
    row.style.flexDirection = 'column';
    row.style.gap = '8px';

    // Header: Label
    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';

    const label = document.createElement('span');
    label.textContent = `{{ ${key} }}`;
    label.style.fontWeight = 'bold';
    label.style.color = '#fbbf24'; // Banana
    label.style.fontFamily = 'monospace';
    
    header.appendChild(label);
    row.appendChild(header);

    // Tags Container
    const tagsContainer = document.createElement('div');
    tagsContainer.className = 'tags-container';
    tagsContainer.style.display = 'flex';
    tagsContainer.style.flexWrap = 'wrap';
    tagsContainer.style.gap = '6px';
    
    // Input for new options
    const input = document.createElement('input');
    input.placeholder = '輸入選項按 Enter 新增 (如: 台北)';
    input.style.flex = '1';
    input.style.minWidth = '150px';
    input.style.background = 'transparent';
    input.style.border = 'none';
    input.style.borderBottom = '1px solid #475569';
    input.style.color = '#fff';
    input.style.padding = '4px 0';
    input.style.fontSize = '0.9rem';
    
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const val = input.value.trim();
            if (val) {
                addTag(tagsContainer, val, input);
                input.value = '';
            }
        }
    });

    // Blur also adds tag? Maybe optional, stick to Enter for now to avoid accidental adds.
    
    row.appendChild(tagsContainer);
    row.appendChild(input);
    
    container.appendChild(row);

    // Pre-fill if we have global suggestions? (Optional, skipping for now)
}

function addTag(container, text, inputElement) {
    // Check duplicates
    const existingTags = Array.from(container.children).map(c => c.dataset.value);
    if (existingTags.includes(text)) return;

    const tag = document.createElement('span');
    tag.className = 'var-tag';
    tag.dataset.value = text;
    // Styling inline for simplicity
    tag.style.display = 'inline-flex';
    tag.style.alignItems = 'center';
    tag.style.background = 'rgba(34, 197, 94, 0.2)'; // Guava green
    tag.style.color = '#4ade80';
    tag.style.padding = '2px 8px';
    tag.style.borderRadius = '12px';
    tag.style.fontSize = '0.85rem';
    tag.style.gap = '6px';
    
    const textSpan = document.createElement('span');
    textSpan.textContent = text;
    
    const removeBtn = document.createElement('span');
    removeBtn.textContent = '×';
    removeBtn.style.cursor = 'pointer';
    removeBtn.style.fontWeight = 'bold';
    removeBtn.style.opacity = '0.7';
    removeBtn.onclick = () => {
        container.removeChild(tag);
    };

    tag.appendChild(textSpan);
    tag.appendChild(removeBtn);
    
    // Insert before the input? No, input is outside container in my design above.
    container.appendChild(tag);
}

function collectVariables() {
    const container = document.getElementById('varsBuilderContainer');
    if (!container) return "";
    
    const rows = container.children;
    let result = [];
    
    for (let row of rows) {
        const key = row.dataset.key;
        const tagsContainer = row.querySelector('.tags-container');
        if (tagsContainer) {
            const tags = Array.from(tagsContainer.children).map(t => t.dataset.value);
            if (tags.length > 0) {
                result.push(`${key} = ${tags.join(', ')}`);
            }
        }
    }
    
    return result.join('\n');
}

window.onload = init;