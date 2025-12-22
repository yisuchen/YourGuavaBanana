const CONFIG = {
    owner: 'yisuchen',
    repo: 'YourGuavaBanana',
    label: 'accepted',
    per_page: 100
};

let allPrompts = [];

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

        // Filter and process
        allPrompts = data
            .filter(issue => !issue.pull_request)
            .map(issue => {
                // ✅ 這裡是重點：從 issue body 的「### 標題」欄位抓顯示標題
                const titleFromSection = extractSection(issue.body, '標題');

                const tagsFromSection = extractSection(issue.body, '標籤');
                const categoryFromSection = extractSection(issue.body, '分類');

                let customTags = [];

                // Add category to tags if it exists
                if (categoryFromSection) {
                    customTags.push(categoryFromSection.trim());
                }

                // Add tags from section if exists
                if (tagsFromSection) {
                    const tags = tagsFromSection
                        .split(/[,，]/)
                        .map(t => t.trim())
                        .filter(t => t);
                    customTags = [...customTags, ...tags];
                }

                return {
                    ...issue,

                    // ✅ 卡片要顯示的標題：優先用表單欄位「標題」，找不到才 fallback 用 issue.title
                    displayTitle: titleFromSection ? titleFromSection.trim() : issue.title,

                    promptText: extractSection(issue.body, '提示詞內容'),
                    notes: extractSection(issue.body, '使用說明'),
                    source: extractSection(issue.body, '來源 (Source)'),
                    category: categoryFromSection ? categoryFromSection.trim() : '未分類',
                    imageUrl: extractImage(issue.body),
                    customTags
                };
            });

        updateLabelFilter(allPrompts);
        renderCards(allPrompts);
    } catch (error) {
        console.error('Error fetching prompts:', error);
        renderStats(`載入失敗: ${error.message}`);
    }
}

function extractImage(body) {
    if (!body) return null;

    // Match Markdown image: ![alt](url)
    const mdMatch = body.match(/!\[.*?\]\((.*?)\)/);
    if (mdMatch) return mdMatch[1];

    // Match HTML image: <img src="url">
    const htmlMatch = body.match(/<img.*?src=["'](.*?)["']/);
    if (htmlMatch) return htmlMatch[1];

    return null;
}

function extractSection(body, headingText) {
    if (!body) return "";
    const lines = body.split('\n');
    let content = [];
    let found = false;

    for (let i = 0; i < lines.length; i++) {
        // Match both "### Heading" and "### Heading (English)" patterns
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

    // ✅ 修正：找不到欄位就回空字串（不要回整篇 body）
    if (!found) return "";
    return content.join('\n').trim();
}

function updateLabelFilter(prompts) {
    const filterSelect = document.getElementById('labelFilter');
    const labels = new Set();

    prompts.forEach(p => {
        p.labels.forEach(l => {
            const name = typeof l === 'string' ? l : l.name;
            if (name !== CONFIG.label && name !== 'pending') {
                labels.add(name);
            }
        });
        if (p.customTags) {
            p.customTags.forEach(t => labels.add(t));
        }
    });

    // Clear except first option
    filterSelect.innerHTML = '<option value="">所有標籤</option>';

    Array.from(labels).sort().forEach(label => {
        const option = document.createElement('option');
        option.value = label;
        option.textContent = label;
        filterSelect.appendChild(option);
    });
}

function setupEventListeners() {
    document.getElementById('searchInput').addEventListener('input', updateDisplay);
    document.getElementById('labelFilter').addEventListener('change', updateDisplay);

    // Modal events
    const modal = document.getElementById('promptModal');
    const closeBtn = document.querySelector('.close-button');

    closeBtn.onclick = () => closeModal();
    window.onclick = (event) => {
        if (event.target == modal) closeModal();
    };

    // Modal Image click to open original
    document.getElementById('modalImage').onclick = function () {
        if (this.src) window.open(this.src, '_blank');
    };
}

function openModal(prompt) {
    const modal = document.getElementById('promptModal');
    const contentToCopy = prompt.promptText || prompt.body;

    // Set content
    document.getElementById('modalImage').src = prompt.imageUrl || 'https://placehold.co/600x400/222/a0a0a0?text=No+Preview';
    document.getElementById('modalCategory').textContent = prompt.category;
    document.getElementById('modalPrompt').textContent = contentToCopy;

    // Tags
    const tagsGroup = document.getElementById('modalTagsGroup');
    const tagsContainer = document.getElementById('modalTags');
    const githubLabels = prompt.labels.map(l => typeof l === 'string' ? l : l.name);
    const allLabels = [...new Set([
        ...githubLabels.filter(l => l !== CONFIG.label && l !== 'pending'),
        ...(prompt.customTags || [])
    ])];

    if (allLabels.length > 0) {
        tagsGroup.style.display = 'block';
        tagsContainer.innerHTML = allLabels.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('');
    } else {
        tagsGroup.style.display = 'none';
    }

    // Share Link
    const shareLink = document.getElementById('modalShareLink');
    shareLink.href = `https://github.com/${CONFIG.owner}/${CONFIG.repo}/issues/new/choose`;

    // Copy button setup
    const copyBtn = document.getElementById('modalCopyBtn');
    // Remove old listeners by cloning
    const newCopyBtn = copyBtn.cloneNode(true);
    copyBtn.parentNode.replaceChild(newCopyBtn, copyBtn);
    newCopyBtn.onclick = () => copyToClipboard(newCopyBtn, contentToCopy);

    modal.style.display = 'block';
    document.body.style.overflow = 'hidden'; // Prevent scrolling
}

function closeModal() {
    const modal = document.getElementById('promptModal');
    modal.style.display = 'none';
    document.body.style.overflow = 'auto';
}

function updateDisplay() {
    const term = document.getElementById('searchInput').value.toLowerCase();
    const label = document.getElementById('labelFilter').value;

    let filtered = allPrompts;

    if (label) {
        filtered = filtered.filter(p =>
            p.labels.some(l => (typeof l === 'string' ? l : l.name) === label) ||
            (p.customTags && p.customTags.includes(label))
        );
    }

    if (term) {
        filtered = filtered.filter(p =>
            (p.displayTitle && p.displayTitle.toLowerCase().includes(term)) ||
            p.title.toLowerCase().includes(term) ||
            (p.promptText && p.promptText.toLowerCase().includes(term)) ||
            p.body.toLowerCase().includes(term) ||
            p.labels.some(l => (typeof l === 'string' ? l : l.name).toLowerCase().includes(term))
        );
    }

    renderCards(filtered);
}

function renderStats(message) {
    document.getElementById('stats').textContent = message;
}

function renderCards(prompts) {
    const container = document.getElementById('promptContainer');
    container.innerHTML = '';

    if (prompts.length === 0) {
        container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px;">找不到符合條件的提示詞</div>';
        return;
    }

    prompts.forEach(prompt => {
        const card = document.createElement('div');
        card.className = 'card';

        // Labels processing
        const githubLabels = prompt.labels.map(l => typeof l === 'string' ? l : l.name);
        const allLabels = [
            ...githubLabels.filter(l => l !== CONFIG.label && l !== 'pending'),
            ...(prompt.customTags || [])
        ];
        const tagsHtml = [...new Set(allLabels)]
            .slice(0, 3) // Only show first 3 on card
            .map(tag => `<span class="tag">${escapeHtml(tag)}</span>`)
            .join('');

        const author = prompt.user ? prompt.user.login : 'unknown';
        const date = new Date(prompt.updated_at || Date.now()).toLocaleDateString();
        const contentToDisplay = prompt.promptText || prompt.body;

        const imageHtml = prompt.imageUrl
            ? `<img src="${prompt.imageUrl}" alt="${escapeHtml(prompt.displayTitle || prompt.title)}" loading="lazy">`
            : `<div class="placeholder">No Preview</div>`;

        card.innerHTML = `
            <div class="card-image">${imageHtml}</div>
            <div class="card-body">
                <div class="card-header">
                    <h3 class="card-title">${escapeHtml(prompt.displayTitle || prompt.title)}</h3>
                    <div class="card-meta">分類: ${escapeHtml(prompt.category)}</div>
                </div>
                <div class="card-content">${escapeHtml(contentToDisplay)}</div>
                <div class="card-tags">${tagsHtml}</div>
                <div class="card-meta">by ${escapeHtml(author)} on ${date}</div>
            </div>
        `;

        card.addEventListener('click', () => openModal(prompt));
        container.appendChild(card);
    });

    renderStats(`顯示 ${prompts.length} 筆提示詞`);
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

function copyToClipboard(btn, text) {
    navigator.clipboard.writeText(text).then(() => {
        const originalText = btn.textContent;
        btn.textContent = '已複製！';
        btn.classList.add('btn-primary');
        setTimeout(() => {
            btn.textContent = originalText;
            btn.classList.remove('btn-primary');
        }, 2000);
    }).catch(err => {
        console.error('Copy failed:', err);
    });
}

window.onload = init;
