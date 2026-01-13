import { CONFIG, FIXED_CATEGORIES } from './config.js';
import { extractSection, extractImage, cleanContent } from './utils.js';

/**
 * Parses a raw GitHub Issue into a structured Prompt object.
 * @param {Object} issue - The raw issue object from GitHub API.
 * @param {Object} config - Configuration object (optional override).
 * @returns {Object} Structured prompt data.
 */
export function processIssue(issue) {
    // 1. Title Processing
    let displayTitle = issue.title.replace(/^[[\\]]Prompt[[\\]]:\s*/i, '').trim();
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
    const cleanPromptText = rawPromptText ? cleanContent(rawPromptText.replace(/!\\[.*?\][.*?]/g, '')).trim() : '';

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

/**
 * Extracts unique categories and tags from the loaded prompts and updates the state.
 * @param {Object} state - The global state object to update.
 */
export function extractMetadata(state) {
    state.categories = new Set(FIXED_CATEGORIES);
    state.tags = new Set();

    // Use all available prompts for metadata to keep filters consistent
    const combined = [...state.allPrompts, ...state.previewPrompts];

    // First pass: validate categories (only allow fixed ones)
    combined.forEach(p => {
        if (p.category && !state.categories.has(p.category)) {
            // If category is not in the fixed list, we just ignore adding it to the filter list
            // effectively treating it as 'Uncategorized' or maintaining original value
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
