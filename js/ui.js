import { state } from './state.js';
import { renderAll, renderStats, applyFilters, renderPage } from './ui-render.js';
import { openAnonFormLogic, setupFormListeners } from './ui-form.js';
import { closeModal } from './ui-details.js';

export { renderAll, renderStats };

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

function setupEventListeners() {
    // Toolbar: Search
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            state.filters.search = e.target.value;
            applyFilters();
        });
    }

    // Toolbar: Tag Filter
    const tagFilter = document.getElementById('tagFilter');
    if (tagFilter) {
        tagFilter.addEventListener('change', (e) => {
            state.filters.tag = e.target.value;
            applyFilters();
        });
    }

    // Toolbar: Preview Toggle
    const previewToggle = document.getElementById('previewToggle');
    if (previewToggle) {
        previewToggle.addEventListener('change', (e) => {
            state.filters.showPreview = e.target.checked;
            applyFilters();
        });
    }

    // Toolbar: Submit Button
    const submitBtn = document.getElementById('submitBtn');
    if (submitBtn) {
        submitBtn.onclick = () => {
            openAnonFormLogic();
        };
    }

    // Pagination Controls
    const itemsPerPage = document.getElementById('itemsPerPage');
    if (itemsPerPage) {
        itemsPerPage.addEventListener('change', (e) => {
            state.pagination.itemsPerPage = parseInt(e.target.value);
            state.pagination.currentPage = 1; // Reset to first page
            renderPage();
        });
    }

    // Global Modal Closing
    const modal = document.getElementById('promptModal');
    const submitFormModal = document.getElementById('submitFormModal');
    const passwordModal = document.getElementById('passwordModal');

    // Close button for details modal
    if (modal) {
        const closeBtn = modal.querySelector('.close-button');
        if (closeBtn) closeBtn.onclick = () => closeModal();
    }

    window.onclick = (event) => {
        if (event.target == modal) closeModal();
        if (event.target == submitFormModal) {
            submitFormModal.style.display = 'none';
            document.body.style.overflow = 'auto';
        }
        if (event.target == passwordModal) {
            passwordModal.style.display = 'none';
            // Logic to restore overflow handled in ui-form but here as safeguard
            if (submitFormModal.style.display !== 'block' && modal.style.display !== 'block') {
                document.body.style.overflow = 'auto';
            }
        }
    };

    // Form specific listeners
    setupFormListeners();
}