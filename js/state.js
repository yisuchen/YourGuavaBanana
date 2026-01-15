import { FIXED_CATEGORIES } from './config.js';

export const state = {
    allPrompts: [],
    previewPrompts: [],
    filteredPrompts: [],
    categories: new Set(),
    tags: new Set(),
    variables: {},
    editingPrompt: null, // Tracks the prompt currently being edited
    isConfirmingUpdate: false, // Tracks if we are waiting for password modal
    filters: {
        search: '',
        category: 'All', // 'All' or specific category name
        tag: '',
        showPreview: false
    },
    pagination: {
        currentPage: 1,
        itemsPerPage: 24
    }
};
