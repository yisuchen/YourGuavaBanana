import { state } from './state.js';
import { reportNewVariable, submitPrompt } from './api.js';
import { fileToBase64, getCursorXY, escapeHtml } from './utils.js';
import { populateCategoryDropdown } from './ui-render.js';
import { closeModal } from './ui-details.js';

// --- Form Initialization & Listeners ---

export function setupFormListeners() {
    const anonForm = document.getElementById('anonSubmissionForm');
    if (!anonForm) return;

    // Submission
    anonForm.onsubmit = async (e) => {
        e.preventDefault();
        await handleAnonSubmission();
    };

    // Close button
    const submitFormModal = document.getElementById('submitFormModal');
    const closeSubmitForm = document.getElementById('closeSubmitForm');
    if (closeSubmitForm) {
        closeSubmitForm.onclick = () => {
            submitFormModal.style.display = 'none';
            document.body.style.overflow = 'auto';
        };
    }

    // Password Modal
    setupPasswordModal();

    // Image Handling
    setupImageHandling();

    // Tags Input
    setupTagsInput();

    // Autocomplete & Sync
    setupAutocomplete();
}

function setupPasswordModal() {
    const passwordModal = document.getElementById('passwordModal');
    const closePasswordModal = document.getElementById('closePasswordModal');
    const confirmPasswordBtn = document.getElementById('confirmPasswordBtn');
    const verifyPasswordInput = document.getElementById('verifyPasswordInput');
    const submitFormModal = document.getElementById('submitFormModal');
    const promptModal = document.getElementById('promptModal');

    if (closePasswordModal) {
        closePasswordModal.onclick = () => {
            passwordModal.style.display = 'none';
            // Only restore if this was the only modal open
            if (submitFormModal.style.display !== 'block' && promptModal.style.display !== 'block') {
                document.body.style.overflow = 'auto';
            }
        };
    }

    if (confirmPasswordBtn) {
        confirmPasswordBtn.onclick = () => {
            const pwd = verifyPasswordInput.value;
            if (!pwd) return alert('請輸入密碼');

            // Set the password into the hidden/main form field
            document.getElementById('formPassword').value = pwd;
            passwordModal.style.display = 'none';
            
            if (submitFormModal.style.display !== 'block' && promptModal.style.display !== 'block') {
                document.body.style.overflow = 'auto';
            }

            if (state.isConfirmingUpdate) {
                state.isConfirmingUpdate = false;
                handleAnonSubmission(); // Resume submission
            }
        };
    }
}

function setupImageHandling() {
    const imageFileInput = document.getElementById('formImageFile');
    const imagePreviewContainer = document.getElementById('formImagePreviewContainer');
    const imagePreview = document.getElementById('formImagePreview');
    const removeImageBtn = document.getElementById('removeImageBtn');
    const formPrompt = document.getElementById('formPrompt');

    if (imageFileInput) {
        imageFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
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
    }

    if (removeImageBtn) {
        removeImageBtn.onclick = () => {
            imageFileInput.value = '';
            imageFileInput._pastedBlob = null;
            imagePreviewContainer.style.display = 'none';
            imagePreview.src = '';
        };
    }

    // Paste Image Support
    if (formPrompt) {
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
    }
}

function setupTagsInput() {
    const tagsInput = document.getElementById('formTagsInput');
    const tagsContainer = document.getElementById('formTagsContainer');

    if (tagsInput && tagsContainer) {
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
    }
}

// --- Autocomplete Logic ---

let selectedSuggestionIndex = -1;

function setupAutocomplete() {
    const formPrompt = document.getElementById('formPrompt');
    const suggestionsEl = document.getElementById('varSuggestions');

    if (!formPrompt || !suggestionsEl) return;

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
}

function showSuggestions(mode, query, coords, contextKey = null) {
    const suggestionsEl = document.getElementById('varSuggestions');
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
    const suggestionsEl = document.getElementById('varSuggestions');
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

    list.forEach((itemText) => {
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
    const suggestionsEl = document.getElementById('varSuggestions');
    if (suggestionsEl) {
        suggestionsEl.style.display = 'none';
        selectedSuggestionIndex = -1;
    }
}

function insertVariable(textToInsert, mode) {
    const formPrompt = document.getElementById('formPrompt');
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
            replacement = `${textToInsert}}}`;

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

// --- Form Logic ---

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

export function openEditForm() {
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
            addTagPill(tagsContainer, t, tagsInput);
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

export async function handleAnonSubmission() {
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

// Internal Helper for Tags
export function addTagPill(container, text, inputElement) {
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
    if (inputElement && inputElement.parentNode === container) {
        container.insertBefore(tag, inputElement);
    } else {
        container.appendChild(tag);
    }
}

// Variables Builder Helpers

export function syncVariablesWithPrompt() {
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
    removeBtn.onclick = (e) => {
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