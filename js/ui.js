import { state } from './state.js';
import { CONFIG, FIXED_CATEGORIES } from './config.js';
import { escapeHtml, fileToBase64, copyToClipboard, getCursorXY } from './utils.js';
import { reportNewVariable, submitPrompt } from './api.js';

export function initUI() {
    setupEventListeners();
    
    // Sync dropdown with default state
    const itemsPerPageSelect = document.getElementById('itemsPerPage');
    if (itemsPerPageSelect) {
        itemsPerPageSelect.value = state.pagination.itemsPerPage;
    }

    const previewToggle = document.getElementById('previewToggle');
    if (previewToggle) {
        previewToggle.checked = state.filters.showPreview;
    }
}

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

export function openAnonFormLogic() {
    const submitFormModal = document.getElementById('submitFormModal');
    if (!submitFormModal) return;

    state.editingPrompt = null; // Clear edit state
    document.getElementById('submitAnonBtn').innerHTML = '🚀 匿名投稿';
    document.getElementById('anonSubmissionForm').reset();

    // Show password field
    const passwordField = document.getElementById('formPassword').parentElement;
    if (passwordField) passwordField.style.display = 'block';
    document.getElementById('formPassword').required = false;

    // Populate Categories
    const select = document.getElementById('formCategorySelect');
    populateCategoryDropdown(select);

    submitFormModal.style.display = 'block';
    document.body.style.overflow = 'hidden';
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

// --- Event Listeners and Modal Logic ---

function setupEventListeners() {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            state.filters.search = e.target.value;
            applyFilters();
        });
    }

    const tagFilter = document.getElementById('tagFilter');
    if (tagFilter) {
        tagFilter.addEventListener('change', (e) => {
            state.filters.tag = e.target.value;
            applyFilters();
        });
    }

    const itemsPerPage = document.getElementById('itemsPerPage');
    if (itemsPerPage) {
        itemsPerPage.addEventListener('change', (e) => {
            state.pagination.itemsPerPage = parseInt(e.target.value);
            state.pagination.currentPage = 1; // Reset to first page
            renderPage();
        });
    }

    const previewToggle = document.getElementById('previewToggle');
    if (previewToggle) {
        previewToggle.addEventListener('change', (e) => {
            state.filters.showPreview = e.target.checked;
            applyFilters();
        });
    }

    // --- Modal events ---

    // Main Prompt Detail Modal
    const modal = document.getElementById('promptModal');
    const closeBtn = modal.querySelector('.close-button');
    closeBtn.onclick = () => closeModal();

    // Submission Button
    const submitBtn = document.getElementById('submitBtn');
    submitBtn.onclick = () => {
        openAnonFormLogic();
    };

    // Anonymous Form Modal
    const submitFormModal = document.getElementById('submitFormModal');
    const closeSubmitForm = document.getElementById('closeSubmitForm');
    const anonForm = document.getElementById('anonSubmissionForm');

    closeSubmitForm.onclick = () => {
        submitFormModal.style.display = 'none';
        document.body.style.overflow = 'auto';
    };

    // Password Modal
    const passwordModal = document.getElementById('passwordModal');
    const closePasswordModal = document.getElementById('closePasswordModal');
    const confirmPasswordBtn = document.getElementById('confirmPasswordBtn');
    const verifyPasswordInput = document.getElementById('verifyPasswordInput');

    closePasswordModal.onclick = () => {
        passwordModal.style.display = 'none';
        // Only restore if this was the only modal open
        if (submitFormModal.style.display !== 'block' && modal.style.display !== 'block') {
            document.body.style.overflow = 'auto';
        }
    };

    confirmPasswordBtn.onclick = () => {
        const pwd = verifyPasswordInput.value;
        if (!pwd) return alert('請輸入密碼');

        // Set the password into the hidden/main form field
        document.getElementById('formPassword').value = pwd;
        passwordModal.style.display = 'none';
        
        if (submitFormModal.style.display !== 'block' && modal.style.display !== 'block') {
            document.body.style.overflow = 'auto';
        }

        if (state.isConfirmingUpdate) {
            state.isConfirmingUpdate = false;
            handleAnonSubmission(); // Resume submission
        }
    };

    // Global click to close modals
    window.onclick = (event) => {
        if (event.target == modal) closeModal();
        if (event.target == submitFormModal) {
            submitFormModal.style.display = 'none';
            document.body.style.overflow = 'auto';
        }
        if (event.target == passwordModal) {
            passwordModal.style.display = 'none';
            if (submitFormModal.style.display !== 'block' && modal.style.display !== 'block') {
                document.body.style.overflow = 'auto';
            }
        }
    };

    // --- Image Upload Preview Logic ---
    const imageFileInput = document.getElementById('formImageFile');
    const imagePreviewContainer = document.getElementById('formImagePreviewContainer');
    const imagePreview = document.getElementById('formImagePreview');
    const removeImageBtn = document.getElementById('removeImageBtn');

    // --- Tags Pill Logic ---
    const tagsInput = document.getElementById('formTagsInput');
    const tagsContainer = document.getElementById('formTagsContainer');

    tagsInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const val = tagsInput.value.trim();
            if (val) {
                addTagPill(tagsContainer, val, tagsInput);
                tagsInput.value = '';
            }
        }
    });

    function addTagPill(container, text, inputElement) {
        // Check duplicates (exclude the input itself)
        const existingTags = Array.from(container.querySelectorAll('.var-tag')).map(t => t.dataset.value);
        if (existingTags.includes(text)) return;

        const tag = document.createElement('span');
        tag.className = 'var-tag';
        tag.dataset.value = text;
        tag.style.display = 'inline-flex';
        tag.style.alignItems = 'center';
        tag.style.background = 'rgba(251, 191, 36, 0.2)'; // Banana yellow tint for tags
        tag.style.color = 'var(--accent-banana)';
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
        removeBtn.onclick = (e) => {
            e.stopPropagation();
            container.removeChild(tag);
        };

        tag.appendChild(textSpan);
        tag.appendChild(removeBtn);

        // Insert before the input
        container.insertBefore(tag, inputElement);
    }

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

    // Close suggestions when clicking outside
    document.addEventListener('click', (e) => {
        if (suggestionsEl.style.display === 'block') {
            if (!suggestionsEl.contains(e.target) && e.target !== formPrompt) {
                hideSuggestions();
            }
        }
    });

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
            const rawContent = text.substring(lastBraces + 2, cursorPos);
            const separatorIdx = rawContent.indexOf(':');

            if (separatorIdx !== -1) {
                // Value Mode
                const key = rawContent.substring(0, separatorIdx).trim();
                const valQuery = rawContent.substring(separatorIdx + 1).trim().toLowerCase();
                // Normalize key lookup
                const normalizedKey = Object.keys(state.variables).find(k => k.toLowerCase() === key.toLowerCase()) || key;
                showSuggestions('value', valQuery, cursorSettings, normalizedKey);
            } else {
                // Key Mode
                const keyQuery = rawContent.trim().toLowerCase();
                showSuggestions('key', keyQuery, cursorSettings);
            }
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
            } else if (e.key === 'Enter') {
                e.preventDefault();
                // If something is selected, click it. 
                // If nothing is selected, click the first item
                const indexToClick = selectedSuggestionIndex !== -1 ? selectedSuggestionIndex : 0;
                if (items[indexToClick]) {
                    items[indexToClick].click();
                }
            } else if (e.key === 'Escape') {
                hideSuggestions();
            }
        }
    });

    function showSuggestions(mode, query, coords, contextKey = null) {
        let list = [];

        if (mode === 'key') {
            const keys = Object.keys(state.variables || {});
            list = keys.filter(k => k.toLowerCase().includes(query));
            if (list.length === 0 && query.length === 0) list = keys;
        } else if (mode === 'value') {
            // Look up values for the key
            const values = state.variables[contextKey] || [];
            list = values.filter(v => v.toLowerCase().includes(query));
            if (list.length === 0 && query.length === 0) list = values;
        }

        // Always show custom option in value mode so user can choose to type manually
        let showCustom = (mode === 'value');

        if (list.length > 0 || showCustom) {
            renderSuggestions(list, mode, contextKey, query, showCustom);
            suggestionsEl.style.display = 'block';

            // Adjust position
            const offsetX = (mode === 'value') ? 10 : 0;
            suggestionsEl.style.left = `${coords.x + offsetX}px`;
            suggestionsEl.style.top = `${coords.y + 24}px`;
        } else {
            hideSuggestions();
        }
    }

    function renderSuggestions(list, mode, contextKey, query, showCustom) {
        suggestionsEl.innerHTML = '';
        selectedSuggestionIndex = -1;

        if (showCustom) {
            const customItem = document.createElement('div');
            customItem.className = 'suggestion-item custom-add';
            customItem.style.borderBottom = '1px solid rgba(255,255,255,0.1)';
            customItem.style.color = 'var(--accent-guava)';

            if (query.length > 0) {
                customItem.innerHTML = `✨ 使用自訂: <span style="color:#fff;font-weight:bold;">${escapeHtml(query)}</span>`;
            } else {
                customItem.innerHTML = `✨ 自訂輸入值...`;
            }

            customItem.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                insertVariable(query, mode);
                hideSuggestions();
            };
            suggestionsEl.appendChild(customItem);
        }

        list.forEach((itemText, index) => {
            const item = document.createElement('div');
            item.className = 'suggestion-item';
            item.textContent = itemText;
            item.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                insertVariable(itemText, mode);
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

    function insertVariable(textToInsert, mode) {
        const fullText = formPrompt.value;
        const cursorPos = formPrompt.selectionStart;
        const lastBraces = fullText.lastIndexOf('{{', cursorPos - 1);

        let before, after, replacement;

        if (mode === 'key') {
            before = fullText.substring(0, lastBraces);
            after = fullText.substring(cursorPos);

            // Healthy growth: add to state.variables if it's new
            if (!state.variables[textToInsert]) {
                state.variables[textToInsert] = [];
            }

            const hasValues = (state.variables[textToInsert] && state.variables[textToInsert].length > 0) ||
                (state.variables[textToInsert.toLowerCase()] && state.variables[textToInsert.toLowerCase()].length > 0);

            const hasClosing = after.trim().startsWith('}}');

            if (hasValues) {
                replacement = `{{${textToInsert}:`;
            } else {
                replacement = `{{${textToInsert}${hasClosing ? '' : '}}'}`;
            }

            if (!hasValues && hasClosing) {
                after = after.substring(after.indexOf('}}') + 2);
            }

            formPrompt.value = before + replacement + after;
            formPrompt.focus();
            const newPos = before.length + replacement.length;
            formPrompt.setSelectionRange(newPos, newPos);

            if (hasValues) {
                setTimeout(() => {
                    const cursorSettings = getCursorXY(formPrompt, newPos);
                    showSuggestions('value', '', cursorSettings, textToInsert);
                }, 50);
            }
        } else {
            // Inserting Value
            const rawContent = fullText.substring(lastBraces, cursorPos);
            const colonIdx = rawContent.indexOf(':');
            let contextKey = '';

            if (colonIdx === -1) {
                before = fullText.substring(0, cursorPos);
                after = fullText.substring(cursorPos);
                replacement = `:${textToInsert}}}`;
                // Try to find key
                const keyMatch = rawContent.match(/{{(.*)/);
                if (keyMatch) contextKey = keyMatch[1].trim();
            } else {
                before = fullText.substring(0, lastBraces + colonIdx + 1);
                after = fullText.substring(cursorPos);

                const hasClosing = after.trim().startsWith('}}');
                replacement = `${textToInsert}}}`; // Always include closing braces in replacement

                if (hasClosing) {
                    // Skip existing closing braces in 'after'
                    after = after.substring(after.indexOf('}}') + 2);
                }

                contextKey = rawContent.substring(2, colonIdx).trim();
            }

            // Healthy growth: add value to state.variables[contextKey]
            if (contextKey) {
                if (!state.variables[contextKey]) {
                    state.variables[contextKey] = [];
                }
                if (!state.variables[contextKey].includes(textToInsert)) {
                    state.variables[contextKey].push(textToInsert);
                    reportNewVariable(contextKey, textToInsert); // Auto-sync to GitHub
                }
            }

            formPrompt.value = before + replacement + after;
            formPrompt.focus();

            let newPos;
            if (textToInsert === '') {
                // If custom empty, place cursor inside {{Key:|}} 
                newPos = before.length;
            } else {
                // If value selected, place cursor after {{Key:Value}}| 
                newPos = before.length + replacement.length;
            }
            formPrompt.setSelectionRange(newPos, newPos);
        }

        syncVariablesWithPrompt();
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
                imageFileInput._pastedBlob = blob;
                const reader = new FileReader();
                reader.onload = (event) => {
                    imagePreview.src = event.target.result;
                    imagePreviewContainer.style.display = 'block';
                };
                reader.readAsDataURL(blob);
            }
        }
    });


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
    const isUpdate = !!state.editingPrompt;

    // Handle Category
    let category = document.getElementById('formCategorySelect').value;
    if (!category) {
        category = '未分類';
    }

    // Prepare Base Data
    let password = document.getElementById('formPassword').value;
    
    // 如果是新投稿且未填寫密碼，隨機產生一個（因後端 Worker 目前設定為必填）
    if (!isUpdate && !password) {
        password = 'anon_' + Math.random().toString(36).substring(2, 15);
    }

    const data = {
        title: document.getElementById('formTitle').value,
        prompt: document.getElementById('formPrompt').value,
        category: category,
        tags: Array.from(document.querySelectorAll('#formTagsContainer .var-tag')).map(t => t.dataset.value).join(','),
        source: document.getElementById('formSource').value,
        variables: collectVariables(),
        password: password,
        image: null
    };

    if (isUpdate && !data.password) {
        // Show password modal for confirmation
        state.isConfirmingUpdate = true;
        document.getElementById('verifyPasswordInput').value = '';
        document.getElementById('passwordModal').style.display = 'block';
        return; // Wait for password modal
    }

    if (isUpdate) {
        data.number = state.editingPrompt.number;
        data.existingImageUrl = state.editingPrompt.imageUrl;
    }

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
        try {
            const base64Content = await fileToBase64(fileToUpload);
            data.image = {
                content: base64Content.split(',')[1], // Strip data:image/png;base64,
                name: fileToUpload.name,
                type: fileToUpload.type
            };
        } catch (e) {
            console.error("圖片處理失敗:", e);
        }
    }

    // Disable button and show loading
    submitBtn.disabled = true;
    const originalBtnText = submitBtn.innerHTML;
    submitBtn.innerHTML = '⏳ 處理中...';
    statusEl.style.display = 'block';
    statusEl.style.color = 'var(--accent-banana)';
    statusEl.textContent = isUpdate ? '正在更新投稿，請稍候...' : '正在發送投稿 (包含上傳圖片)，請稍候...';

    try {
        const result = await submitPrompt(data, isUpdate);

        if (result.success) {
            statusEl.style.color = 'var(--accent-guava)';
            statusEl.textContent = isUpdate ? '✅ 更新成功！即將重新載入頁面。' : '✅ 投稿成功！請等待審核，頁面將於 3 秒後關閉。';

            if (!isUpdate) {
                document.getElementById('anonSubmissionForm').reset();

                // Manually clear dynamic variables container
                const varsContainer = document.getElementById('varsBuilderContainer');
                if (varsContainer) {
                    varsContainer.innerHTML = '';
                }

                // Manually clear tags pills
                const tagsContainer = document.getElementById('formTagsContainer');
                if (tagsContainer) {
                    const pills = tagsContainer.querySelectorAll('.var-tag');
                    pills.forEach(p => tagsContainer.removeChild(p));
                    document.getElementById('formTagsInput').value = '';
                }

                document.getElementById('formImagePreviewContainer').style.display = 'none';
            }

            setTimeout(() => {
                if (isUpdate) {
                    window.location.reload();
                } else {
                    document.getElementById('submitFormModal').style.display = 'none';
                    document.body.style.overflow = 'auto';
                    statusEl.style.display = 'none';
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = originalBtnText;
                }
            }, 3000);
        }
    } catch (error) {
        statusEl.style.color = 'var(--accent-pink)';
        statusEl.textContent = `❌ 錯誤: ${error.message}`;
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnText;
    }
}

// --- Modal Functions ---

export function openModal(prompt) {
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
            const contentInside = match[1].trim();
            let key = contentInside;
            let defaultValue = '';

            // Check for default value separator ':'
            const separatorIndex = contentInside.indexOf(':');
            if (separatorIndex !== -1) {
                key = contentInside.substring(0, separatorIndex).trim();
                defaultValue = contentInside.substring(separatorIndex + 1).trim();
            }

            // Create interactive span
            const span = document.createElement('span');
            span.className = 'variable-placeholder';

            if (defaultValue) {
                span.textContent = defaultValue;
                span.dataset.value = defaultValue;
                span.classList.add('filled');
            } else {
                span.textContent = key; // Initial text is the key
                span.dataset.value = ''; // Currently no value selected
            }

            span.dataset.key = key;

            // Add click handler for popover
            span.onclick = (e) => {
                e.stopPropagation(); // Prevent closing modal
                showVariablePopover(span, key, prompt.localVariables);
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
    shareLink.className = 'btn btn-outline';
    shareLink.innerHTML = '🍌 投稿你的香蕉拔辣';
    shareLink.href = '#'; // Don't follow link
    shareLink.onclick = (e) => {
        e.preventDefault();
        closeModal(); // Close detail modal
        openAnonFormLogic();
    };

    const editBtn = document.getElementById('modalEditBtn');
    editBtn.href = prompt.url;

    const anonEditBtn = document.getElementById('modalAnonEditBtn');
    const newAnonEditBtn = anonEditBtn.cloneNode(true);
    anonEditBtn.parentNode.replaceChild(newAnonEditBtn, anonEditBtn);

    newAnonEditBtn.onclick = () => {
        state.editingPrompt = prompt;
        openEditForm();
    };

    // Generate Button Logic
    const genBtn = document.getElementById('modalGenBtn');
    const newGenBtn = genBtn.cloneNode(true);
    genBtn.parentNode.replaceChild(newGenBtn, genBtn);

    newGenBtn.onclick = () => {
        let finalPrompt = '';
        modalPrompt.childNodes.forEach(node => {
            if (node.nodeType === Node.TEXT_NODE) {
                finalPrompt += node.textContent;
            } else if (node.classList && node.classList.contains('variable-placeholder')) {
                const val = node.dataset.value;
                if (val) {
                    finalPrompt += val;
                } else {
                    finalPrompt += `{{${node.dataset.key}}}`;
                }
            }
        });

        // Prepend image generation instruction as requested
        const imageGenPrompt = `Generate an image: ${finalPrompt}`;

        // ChatGPTToolkitLinkBuilder URL Construction
        const b64EncodeUnicode = (str) => {
            return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g,
                function toSolidBytes(match, p1) {
                    return String.fromCharCode('0x' + p1);
                }));
        };

        let payload = imageGenPrompt;
        if (payload.length >= 64) {
            payload = b64EncodeUnicode(payload);
        }

        const encodedPrompt = encodeURIComponent(payload);
        const toolkitUrl = `https://gemini.google.com/app#tool=image&autoSubmit=false&pasteImage=false&prompt=${encodedPrompt}`;

        // Copy to clipboard
        navigator.clipboard.writeText(imageGenPrompt).then(() => {
            window.open(toolkitUrl, '_blank');
        }).catch(err => {
            console.error('Copy failed, opening URL anyway:', err);
            window.open(toolkitUrl, '_blank');
        });
    };

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

function openEditForm() {
    const prompt = state.editingPrompt;
    if (!prompt) return;

    // Close detail modal and open form modal
    closeModal();
    const submitFormModal = document.getElementById('submitFormModal');
    submitFormModal.style.display = 'block';
    document.body.style.overflow = 'hidden';

    // Set button text
    document.getElementById('submitAnonBtn').innerHTML = '💾 更新投稿';

    // Hide password field in the form during update (we'll use modal at the end)
    const passwordField = document.getElementById('formPassword').parentElement;
    if (passwordField) passwordField.style.display = 'none';
    document.getElementById('formPassword').required = false;

    // Pre-fill fields
    document.getElementById('formTitle').value = prompt.displayTitle;
    document.getElementById('formPrompt').value = prompt.promptText;
    document.getElementById('formSource').value = prompt.source === 'No response' ? '' : prompt.source;

    // Category
    const select = document.getElementById('formCategorySelect');
    populateCategoryDropdown(select, prompt.category);

    // Tags
    const tagsContainer = document.getElementById('formTagsContainer');
    const tagsInput = document.getElementById('formTagsInput');
    // Clear existing pills
    Array.from(tagsContainer.querySelectorAll('.var-tag')).forEach(p => tagsContainer.removeChild(p));

    if (prompt.customTags && prompt.customTags.length > 0) {
        prompt.customTags.forEach(t => {
            const tag = document.createElement('span');
            tag.className = 'var-tag';
            tag.dataset.value = t;
            tag.style.display = 'inline-flex';
            tag.style.alignItems = 'center';
            tag.style.background = 'rgba(251, 191, 36, 0.2)';
            tag.style.color = 'var(--accent-banana)';
            tag.style.padding = '2px 8px';
            tag.style.borderRadius = '12px';
            tag.style.fontSize = '0.85rem';
            tag.style.gap = '6px';
            tag.innerHTML = `<span>${escapeHtml(t)}</span><span style="cursor:pointer;font-weight:bold;opacity:0.7;" onclick="this.parentElement.parentNode.removeChild(this.parentElement)">×</span>`;
            tagsContainer.insertBefore(tag, tagsInput);
        });
    }

    // Variables Builder
    syncVariablesWithPrompt();
    // After sync, pre-fill the values for existing variables
    const varsContainer = document.getElementById('varsBuilderContainer');
    if (prompt.localVariables) {
        Object.keys(prompt.localVariables).forEach(key => {
            const row = Array.from(varsContainer.children).find(r => r.dataset.key.toLowerCase().replace(/\s+/g, '_') === key);
            if (row) {
                const tagsCont = row.querySelector('.tags-container');
                const values = prompt.localVariables[key];
                if (Array.isArray(values)) {
                    values.forEach(v => addTag(tagsCont, v, null));
                }
            }
        });
    }

    // Image Preview
    const imagePreviewContainer = document.getElementById('formImagePreviewContainer');
    const imagePreview = document.getElementById('formImagePreview');
    if (prompt.imageUrl) {
        imagePreview.src = prompt.imageUrl;
        imagePreviewContainer.style.display = 'block';
    } else {
        imagePreviewContainer.style.display = 'none';
    }
}

// Variable Popover Logic
let currentPopover = null;

function showVariablePopover(targetSpan, rawKey, localVariables = {}) {
    // Close existing
    if (currentPopover) {
        document.body.removeChild(currentPopover);
        currentPopover = null;
    }

    const key = rawKey.toLowerCase().replace(/\s+/g, '_');

    // Merge options: local variables from the issue + global state variables
    const localOptions = (localVariables && (localVariables[key] || localVariables[rawKey.toLowerCase()])) || [];
    const globalOptions = state.variables[key] || state.variables[key.replace(/\s+/g, '_')] || [];
    
    // Combine and deduplicate
    let options = [...new Set([...localOptions, ...globalOptions])];

    // Fallback logic for keys like text_1, text_2 to use base key 'text'
    if (options.length === 0) {
        const parts = key.split('_');
        if (parts.length > 1) {
            const baseKey = parts.slice(0, -1).join('_');
            options = (localVariables && localVariables[baseKey]) || state.variables[baseKey] || [];
        }
    }

    const popover = document.createElement('div');
    popover.className = 'variable-popover';

    const header = document.createElement('div');
    header.className = 'popover-header';
    header.textContent = `選擇 ${rawKey}`;
    popover.appendChild(header);

    const handleSelect = (value) => {
        if (!value) return;
        targetSpan.textContent = value;
        targetSpan.dataset.value = value;
        targetSpan.classList.add('filled');

        // Healthy growth: sync custom value to global state even if not submitting a full prompt
        if (!state.variables[rawKey]) {
            state.variables[rawKey] = [];
        }
        
        const isNewValue = !state.variables[rawKey].some(v => String(v).toLowerCase() === String(value).toLowerCase());
        
        if (isNewValue) {
            // Report FIRST before adding to local state to avoid race condition in check
            reportNewVariable(rawKey, value); // Auto-sync to GitHub
            state.variables[rawKey].push(value);
        }

        closePopover();
    };

    // Always add an option to type manually at the top
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

    // Append to body but keep invisible for measurement
    popover.style.visibility = 'hidden';
    popover.style.position = 'fixed'; // Use fixed positioning
    document.body.appendChild(popover);
    currentPopover = popover;

    // Positioning Logic
    const rect = targetSpan.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    let top = rect.bottom + 5;
    let left = rect.left;

    // Vertical Adjustment: Flip to top if not enough space below
    if (top + popoverRect.height > viewportHeight - 10) {
        if (rect.top - popoverRect.height - 10 > 0) {
            top = rect.top - popoverRect.height - 5;
        } else {
            top = viewportHeight - popoverRect.height - 10;
        }
    }

    // Horizontal Adjustment
    if (left + popoverRect.width > viewportWidth - 10) {
        left = viewportWidth - popoverRect.width - 10;
    }

    if (left < 10) left = 10;

    popover.style.top = `${top}px`;
    popover.style.left = `${left}px`;

    popover.style.visibility = 'visible';
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
        closePopover();
    }
}

export function closeModal() {
    const modal = document.getElementById('promptModal');
    modal.style.display = 'none';
    document.body.style.overflow = 'auto';
    closePopover();
    document.removeEventListener('click', closePopoverOnClickOutside);
}


// --- Variables Builder Helpers ---

function syncVariablesWithPrompt() {
    const promptText = document.getElementById('formPrompt').value;
    const container = document.getElementById('varsBuilderContainer');

    // 1. Extract Keys and optional Values: {{key}} or {{key:value}}
    const matches = [...promptText.matchAll(/{{(.*?)}}/g)];
    const foundVariables = [];

    matches.forEach(m => {
        const content = m[1].trim();
        if (!content) return;

        let key = content;
        let val = null;

        if (content.includes(':')) {
            const parts = content.split(':');
            key = parts[0].trim();
            val = parts.slice(1).join(':').trim();
        }

        if (key) {
            foundVariables.push({ key, defaultValue: val });

            // Healthy growth: sync newly typed keys and values to global state
            if (!state.variables[key]) {
                state.variables[key] = [];
            }
            if (val && !state.variables[key].includes(val)) {
                state.variables[key].push(val);
            }
        }
    });

    const uniqueKeys = new Set(foundVariables.map(v => v.key));

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
        const exists = currentRows.find(r => r.dataset.key === key);
        if (!exists) {
            createVariableRow(container, key);
        }
    });

    // 4. Update tags: Clear old auto-tags and add current ones
    uniqueKeys.forEach(key => {
        const row = Array.from(container.children).find(r => r.dataset.key === key);
        if (row) {
            const tagsContainer = row.querySelector('.tags-container');

            // Remove all tags marked as auto
            const autoTags = tagsContainer.querySelectorAll('.var-tag[data-auto="true"]');
            autoTags.forEach(t => tagsContainer.removeChild(t));

            // Add current values from prompt as auto tags
            const valuesForThisKey = foundVariables
                .filter(v => v.key === key && v.defaultValue)
                .map(v => v.defaultValue);

            // Deduplicate across this key's occurrences
            [...new Set(valuesForThisKey)].forEach(val => {
                addTag(tagsContainer, val, null, true);
            });
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
                // Healthy growth: add to state.variables
                if (!state.variables[key]) {
                    state.variables[key] = [];
                }
                if (!state.variables[key].includes(val)) {
                    state.variables[key].push(val);
                }

                addTag(tagsContainer, val, input, false); // Manually added
                input.value = '';
            }
        }
    });

    row.appendChild(tagsContainer);
    row.appendChild(input);

    container.appendChild(row);

    // Auto-populate with existing global options (Initial options are treated as manual/permanent)
    const existingOptions = state.variables[key] || state.variables[key.replace(/\s+/g, '_')];
    if (existingOptions && Array.isArray(existingOptions)) {
        existingOptions.forEach(opt => {
            addTag(tagsContainer, opt, null, false);
        });
    }
}

function addTag(container, text, inputElement, isAuto = false) {
    // Check duplicates
    const existingTags = Array.from(container.querySelectorAll('.var-tag')).map(c => c.dataset.value);
    if (existingTags.includes(text)) return;

    const tag = document.createElement('span');
    tag.className = 'var-tag';
    tag.dataset.value = text;
    if (isAuto) tag.dataset.auto = "true";

    // Styling
    tag.style.display = 'inline-flex';
    tag.style.alignItems = 'center';
    tag.style.background = isAuto ? 'rgba(34, 197, 94, 0.15)' : 'rgba(34, 197, 94, 0.3)';
    tag.style.color = '#4ade80';
    tag.style.padding = '2px 8px';
    tag.style.borderRadius = '12px';
    tag.style.fontSize = '0.85rem';
    tag.style.gap = '6px';
    tag.style.border = isAuto ? '1px dashed rgba(74, 222, 128, 0.5)' : '1px solid transparent';

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
                result.push(`${key} = ${tags.join(' | ')}`);
            }
        }
    }

    return result.join('\n');
}
