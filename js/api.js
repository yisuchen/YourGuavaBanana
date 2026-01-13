import { CONFIG, FIXED_CATEGORIES } from './config.js';
import { state } from './state.js';
import { extractSection, extractImage, cleanContent } from './utils.js';

export async function fetchPrompts() {
    const { owner, repo, label, per_page } = CONFIG;
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/issues?state=open&labels=${label}&per_page=${per_page}`;
    const previewApiUrl = `https://api.github.com/repos/${owner}/${repo}/issues?state=open&labels=pending&per_page=${per_page}`;

    try {
        let data;
        let previewData;

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

        // Try local data-preview.json
        try {
            const previewResponse = await fetch('data-preview.json');
            if (previewResponse.ok) {
                previewData = await previewResponse.json();
                console.log('Loaded from data-preview.json');
            }
        } catch (e) {
            console.log('data-preview.json not found');
        }

        // Load variables from both sources
        let defaultVars = {};
        let localVars = {};

        // Try default_variables.json
        try {
            const defVarsResponse = await fetch('default_variables.json');
            if (defVarsResponse.ok) {
                defaultVars = await defVarsResponse.json();
                console.log('Loaded from default_variables.json');
            }
        } catch (e) {
            console.log('default_variables.json not found');
        }

        // Try local variables.json
        try {
            const varsResponse = await fetch('variables.json');
            if (varsResponse.ok) {
                localVars = await varsResponse.json();
                console.log('Loaded from variables.json');
            }
        } catch (e) {
            console.log('variables.json not found or failed to load');
        }

        // Merge variables: defaultVars + localVars
        state.variables = {};
        
        const mergeIntoState = (sourceObj) => {
            Object.keys(sourceObj).forEach(rawKey => {
                const key = rawKey.toLowerCase().replace(/\s+/g, '_');
                if (!state.variables[key]) {
                    state.variables[key] = [];
                }
                const values = Array.isArray(sourceObj[rawKey]) ? sourceObj[rawKey] : [];
                // Merge and deduplicate
                state.variables[key] = [...new Set([...state.variables[key], ...values])];
            });
        };

        mergeIntoState(defaultVars);
        mergeIntoState(localVars);

        // Fallback to API if data not loaded
        if (!data) {
            const response = await fetch(apiUrl);
            if (!response.ok) {
                throw new Error(`GitHub API error: ${response.status}`);
            }
            data = await response.json();
        }

        // Process Regular Data
        state.allPrompts = data
            .filter(issue => !issue.pull_request && issue.title.startsWith('[Prompt]:'))
            .map(issue => ({ ...processIssue(issue), isPreview: false }));

        // Process Preview Data
        if (previewData || !data) {
            if (!previewData) {
                try {
                    const response = await fetch(previewApiUrl);
                    if (response.ok) {
                        previewData = await response.json();
                    }
                } catch (e) {
                    console.error('Failed to fetch preview from API', e);
                }
            }

            if (previewData) {
                state.previewPrompts = previewData
                    .filter(issue => !issue.pull_request)
                    .map(issue => ({ ...processIssue(issue), isPreview: true }));
            }
        }

        // Extract unique Categories and Tags
        extractMetadata();

    } catch (error) {
        console.error('Error fetching prompts:', error);
        throw error;
    }
}

function processIssue(issue) {
    // 1. Title Processing
    let displayTitle = issue.title.replace(/^[[\]]Prompt[[\]]:\s*/i, '').trim();
    if (!displayTitle || displayTitle === '請在此輸入標題') {
        displayTitle = '未命名提示詞';
    }

    // 2. Body Parsing
    const tagsFromSection = extractSection(issue.body, '標籤');
    const categoryFromSection = extractSection(issue.body, '分類');

    // Parse Variables from body (localized variables for this prompt)
    const localVariables = {};
    const varMatch = issue.body.match(/Variables\s*\(key=value\)\s*([\s\S]*?)(?=\n\n|###|$)/i);
    if (varMatch) {
        const lines = varMatch[1].trim().split('\n');
        lines.forEach(line => {
            const parts = line.split('=');
            if (parts.length >= 2) {
                const key = parts[0].trim().toLowerCase().replace(/\s+/g, '_');
                // Split by pipe '|' to allow commas in values (e.g. descriptions)
                const values = parts.slice(1).join('=').split('|').map(v => v.trim()).filter(v => v);
                localVariables[key] = values;
                // Also store without underscore for better matching
                localVariables[parts[0].trim().toLowerCase()] = values;
            }
        });
    }

    let customTags = [];
    if (tagsFromSection) {
        customTags = cleanContent(tagsFromSection)
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
    const cleanPromptText = rawPromptText ? cleanContent(rawPromptText.replace(/!\[.*?]\[.*?\]/g, '')).trim() : '';

    return {
        ...issue,
        displayTitle: displayTitle,
        promptText: cleanPromptText,
        localVariables,
        notes: extractSection(issue.body, '使用說明'),
        source: extractSection(issue.body, '來源 (Source)'),
        category: categoryFromSection ? categoryFromSection.trim() : '未分類',
        imageUrl: extractImage(issue.body),
        customTags,
        computedTags: [...new Set([...githubLabels, ...customTags])]
    };
}

function extractMetadata() {
    state.categories = new Set(FIXED_CATEGORIES);
    state.tags = new Set();

    // Use all available prompts for metadata to keep filters consistent
    const combined = [...state.allPrompts, ...state.previewPrompts];

    // First pass: validate categories (only allow fixed ones)
    combined.forEach(p => {
        if (p.category && !state.categories.has(p.category)) {
            // If category is not in the fixed list, force it to '其他（待歸納）' or '未分類'
            // For UI consistency, we'll keep the original p.category but won't add it to filter list
        }
    });

    // Second pass: collect tags that are not categories to keep them distinct
    combined.forEach(p => {
        p.computedTags.forEach(t => {
            if (!state.categories.has(t)) {
                state.tags.add(t);
            }
        });
    });
}

export async function reportNewVariable(key, value) {
    if (!key || !value) return;

    // Don't report if it already exists in our current session state (case-insensitive check)
    const existing = state.variables[key] || state.variables[key.toLowerCase()];
    
    if (existing && Array.isArray(existing)) {
        const alreadyHasValue = existing.some(v => String(v).toLowerCase() === String(value).toLowerCase());
        if (alreadyHasValue) {
            return;
        }
    }

    console.log(`[Auto-Sync] Reporting new variable: ${key} = ${value}`);

    try {
        await fetch(CONFIG.worker_url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'sync_variables',
                key: key,
                value: value
            })
        });
    } catch (e) {
        console.error('[Auto-Sync] Failed to sync variable:', e);
    }
}

export async function submitPrompt(data, isUpdate) {
    const response = await fetch(CONFIG.worker_url, {
        method: isUpdate ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });

    const result = await response.json();
    if (!result.success) {
        throw new Error(result.error || '發送失敗');
    }
    return result;
}
