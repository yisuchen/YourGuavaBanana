import { state } from './state.js';
import { escapeHtml, copyToClipboard } from './utils.js';
import { reportNewVariable } from './api.js';
import { openAnonFormLogic, openEditForm } from './ui-form.js';

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

// Variable Popover Logic
let currentPopover = null;

export function showVariablePopover(targetSpan, rawKey, localVariables = {}) {
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

export function closePopover() {
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
