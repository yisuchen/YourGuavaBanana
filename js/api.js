import { CONFIG } from './config.js';
import { state } from './state.js';
import { processIssue, extractMetadata } from './prompt-parser.js';

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
        await loadVariables();

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
        extractMetadata(state);

    } catch (error) {
        console.error('Error fetching prompts:', error);
        throw error;
    }
}

async function loadVariables() {
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