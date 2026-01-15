import { state } from './state.js';
import { FIXED_CATEGORIES } from './config.js';
import { escapeHtml } from './utils.js';
import { openModal } from './ui-details.js';

export function renderAll() {
    renderCategoryFilters();
    updateTagFilterDropdown();
    applyFilters();
}

export function populateCategoryDropdown(selectElement, selectedValue = '') {
    if (!selectElement) return;

    // Keep the first default option
    selectElement.innerHTML = '<option value="">請選擇分類...</option>';

    // Use ONLY fixed categories as requested
    FIXED_CATEGORIES.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat;
        option.textContent = cat;
        if (cat === selectedValue) option.selected = true;
        selectElement.appendChild(option);
    });
}

export function applyFilters() {
    const { search, category, tag, showPreview } = state.filters;
    const term = search.toLowerCase();

    // Select data based on preview toggle
    const sourceData = showPreview
        ? state.previewPrompts
        : state.allPrompts;

    state.filteredPrompts = sourceData.filter(p => {
        // 1. Category Filter
        if (category !== 'All' && p.category !== category) {
            // Special case: if filtering for '其他（待歸納）', also show items that don't match any fixed category
            if (category === '其他（待歸納）') {
                if (FIXED_CATEGORIES.includes(p.category)) return false;
            } else {
                return false;
            }
        }

        // 2. Search Filter (Title + Prompt Text)
        if (term) {
            const inTitle = p.displayTitle.toLowerCase().includes(term);
            const inBody = p.promptText.toLowerCase().includes(term);
            if (!inTitle && !inBody) return false;
        }

        // 3. Tag Filter
        if (tag && !p.computedTags.includes(tag)) {
            return false;
        }

        return true;
    });

    // Reset to page 1 when filters change
    state.pagination.currentPage = 1;
    renderPage();
}

export function renderStats(start, end, total) {
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

export function renderPage() {
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

    // Use FIXED_CATEGORIES to maintain specific order and content
    FIXED_CATEGORIES.forEach(cat => {
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

export function changePage(pageNum) {
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
        card.className = `card ${prompt.isPreview ? 'is-preview' : ''}`;

        // Tags to show on card (exclude all categories)
        const displayTags = prompt.computedTags
            .filter(tag => !state.categories.has(tag))
            .slice(0, 3); // Max 3 tags

        const tagsHtml = displayTags
            .map(tag => `<span class="hashtag">#${escapeHtml(tag)}</span>`)
            .join(' ');

        const tagsSection = displayTags.length > 0 
            ? `<div class="card-tags">${tagsHtml}</div>` 
            : '';

        const rawContent = prompt.promptText !== null ? prompt.promptText : prompt.body;
        const contentToDisplay = rawContent.length > 100 ? rawContent.substring(0, 100) + '...' : rawContent;

        // Image optimization: Use wsrv.nl for on-the-fly resizing and webp conversion
        let imageHtml = '<div class="placeholder">No Preview</div>';

        if (prompt.imageUrl) {
            const optimizedUrl = `https://wsrv.nl/?url=${encodeURIComponent(prompt.imageUrl)}&w=400&q=80&output=webp`;
            imageHtml = `<img src="${optimizedUrl}" alt="${escapeHtml(prompt.displayTitle)}" loading="lazy" decoding="async">`;
        }

        const previewBadge = prompt.isPreview ? '<div class="preview-badge">Preview</div>' : '';

        card.innerHTML = `
            ${previewBadge}
            <div class="card-image">${imageHtml}</div>
            <div class="card-body">
                <div class="card-category-tag">${escapeHtml(prompt.category)}</div>
                <h3 class="card-title">${escapeHtml(prompt.displayTitle)}</h3>
                <div class="card-content">${escapeHtml(contentToDisplay)}</div>
                ${tagsSection}
            </div>
        `;

        card.addEventListener('click', () => openModal(prompt));
        fragment.appendChild(card);
    });

    container.appendChild(fragment);
}
