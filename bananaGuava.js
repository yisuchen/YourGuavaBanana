const CONFIG = {
    owner: 'yisuchen',
    repo: 'YourGuavaBanana',
    label: 'accepted',
    per_page: 100
};

// Application State
let state = {
    allPrompts: [],
    filteredPrompts: [],
    categories: new Set(),
    tags: new Set(),
    filters: {
        search: '',
        category: 'All', // 'All' or specific category name
        tag: ''
    },
    pagination: {
        currentPage: 1,
        itemsPerPage: 12
    }
};

async function init() {
    setupEventListeners();
    updateSubmitButton();
    await fetchPrompts();
}

function updateSubmitButton() {
    const submitBtn = document.getElementById('submitBtn');
    if (submitBtn) {
        submitBtn.href = `https://github.com/${CONFIG.owner}/${CONFIG.repo}/issues/new/choose`;
    }
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

    return {
        ...issue,
        displayTitle: displayTitle,
        promptText: extractSection(issue.body, '提示詞內容'),
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

    state.allPrompts.forEach(p => {
        // Categories
        if (p.category) {
            state.categories.add(p.category);
        }

        // Tags
        p.computedTags.forEach(t => {
            // Exclude category names from tags to keep them distinct
            if (t !== p.category) {
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
    
    renderStats();
    renderPage();
}

function renderStats() {
    const total = state.filteredPrompts.length;
    const statsEl = document.getElementById('stats');
    if (total === 0) {
        statsEl.textContent = '找不到符合條件的提示詞';
    } else {
        statsEl.textContent = `顯示 ${total} 筆提示詞`;
    }
}

function renderPage() {
    const { currentPage, itemsPerPage } = state.pagination;
    const totalItems = state.filteredPrompts.length;
    
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
    
    const promptsToShow = state.filteredPrompts.slice(startIndex, endIndex);
    
    renderCards(promptsToShow);
    renderPagination(totalItems);
    
    // Scroll to top of grid on page change if not initial load
    if (document.getElementById('promptContainer').innerHTML !== '') {
         // Optional: smooth scroll
    }
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
    prevBtn.innerHTML = '&lsaquo;'; // <
    prevBtn.disabled = state.pagination.currentPage === 1;
    prevBtn.onclick = () => changePage(state.pagination.currentPage - 1);
    container.appendChild(prevBtn);

    // Page Numbers logic (show simple range for now)
    // For better UX with many pages, we might want ellipsis, but let's keep it simple first
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
    nextBtn.innerHTML = '&rsaquo;'; // >
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

        // Tags to show on card (exclude category)
        const displayTags = prompt.computedTags
            .filter(tag => tag !== prompt.category)
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

    // Modal events
    const modal = document.getElementById('promptModal');
    const closeBtn = document.querySelector('.close-button');

    closeBtn.onclick = () => closeModal();
    window.onclick = (event) => {
        if (event.target == modal) closeModal();
    };

    document.getElementById('modalImage').onclick = function () {
        if (this.src) window.open(this.src, '_blank');
    };
}

// --- Modal Functions (Largely same as before but using state object if needed) ---

function openModal(prompt) {
    const modal = document.getElementById('promptModal');
    const contentToCopy = prompt.promptText !== null ? prompt.promptText : prompt.body;

    document.getElementById('modalImage').src = prompt.imageUrl || 'https://placehold.co/600x400/222/a0a0a0?text=No+Preview';
    document.getElementById('modalCategory').textContent = prompt.category;
    document.getElementById('modalPrompt').textContent = contentToCopy;

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
    
    // Use computed tags but exclude current category
    const displayTags = prompt.computedTags.filter(t => t !== prompt.category);

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
    editBtn.href = prompt.html_url;

    // Copy Button
    const copyBtn = document.getElementById('modalCopyBtn');
    const newCopyBtn = copyBtn.cloneNode(true);
    copyBtn.parentNode.replaceChild(newCopyBtn, copyBtn);
    newCopyBtn.onclick = () => copyToClipboard(newCopyBtn, contentToCopy);

    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    const modal = document.getElementById('promptModal');
    modal.style.display = 'none';
    document.body.style.overflow = 'auto';
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

window.onload = init;