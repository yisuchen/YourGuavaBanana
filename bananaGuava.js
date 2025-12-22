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
        // Try local data.json first (Milestone 5)
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
                const tagsFromSection = extractSection(issue.body, '標籤');
                const customTags = (tagsFromSection && tagsFromSection !== issue.body)
                    ? tagsFromSection.split(/[,，]/).map(t => t.trim()).filter(t => t)
                    : [];

                return {
                    ...issue,
                    promptText: extractSection(issue.body, '提示詞內容'),
                    notes: extractSection(issue.body, '使用說明'),
                    customTags: customTags
                };
            });

        updateLabelFilter(allPrompts);
        renderCards(allPrompts);
    } catch (error) {
        console.error('Error fetching prompts:', error);
        renderStats(`載入失敗: ${error.message}`);
    }
}

function extractSection(body, headingText) {
    if (!body) return "";
    const lines = body.split('\n');
    let content = [];
    let found = false;

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().startsWith('### ' + headingText)) {
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

    if (!found) return body;
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

        // Combine GitHub labels and custom tags
        const githubLabels = prompt.labels.map(l => typeof l === 'string' ? l : l.name);
        const allLabels = [
            ...githubLabels.filter(l => l !== CONFIG.label && l !== 'pending'),
            ...(prompt.customTags || [])
        ];

        const tagsHtml = [...new Set(allLabels)]
            .map(tag => `<span class="tag">${escapeHtml(tag)}</span>`)
            .join('');

        const notesHtml = (prompt.notes && prompt.notes !== prompt.body)
            ? `<details class="card-notes"><summary>使用說明</summary><div class="notes-content">${escapeHtml(prompt.notes)}</div></details>`
            : '';

        const author = prompt.user ? prompt.user.login : 'unknown';
        const date = new Date(prompt.updated_at || Date.now()).toLocaleDateString();
        const contentToCopy = prompt.promptText || prompt.body;

        card.innerHTML = `
            <div class="card-header">
                <h3 class="card-title">${escapeHtml(prompt.title)}</h3>
                <div class="card-meta">by ${escapeHtml(author)} on ${date}</div>
            </div>
            <div class="card-tags">${tagsHtml}</div>
            <div class="card-content">${escapeHtml(contentToCopy)}</div>
            ${notesHtml}
            <div class="card-actions">
                <button class="btn btn-outline btn-sm copy-btn">複製提示詞</button>
                <a href="${prompt.html_url}" target="_blank" class="btn btn-outline btn-sm">開啟 Issue</a>
            </div>
        `;

        // Add event listener for copy button to avoid escaping issues in onclick
        card.querySelector('.copy-btn').addEventListener('click', function () {
            copyToClipboard(this, contentToCopy);
        });

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