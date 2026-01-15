import { initUI, renderAll, renderStats } from './ui.js';
import { fetchPrompts } from './api.js';

async function init() {
    initUI();
    
    try {
        await fetchPrompts();
        renderAll();
    } catch (error) {
        console.error('Initialization failed:', error);
        renderStats(`載入失敗: ${error.message}`);
    }
}

// Start the application
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
