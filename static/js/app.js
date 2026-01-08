/**
 * Family Tree Application - Main Application Logic
 */

// Application State
const AppState = {
    tree: {
        persons: {},
        marriages: {},
        parent_child: []
    },
    selectedPersonId: null,
    selectedPersonIds: new Set(), // Support for multi-select
    layoutDirection: 'top-down',
    currentFilename: null, // Track the current file for Save functionality
    canUndo: false,
    canRedo: false
};

// API Helper
const API = {
    baseUrl: '/api',

    async request(method, endpoint, data = null) {
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        if (data) {
            options.body = JSON.stringify(data);
        }

        const response = await fetch(`${this.baseUrl}${endpoint}`, options);

        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: 'Request failed' }));
            throw new Error(error.detail || 'Request failed');
        }

        // Check if response has content
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            return response.json();
        }

        return response;
    },

    // Tree operations
    async getTree() {
        return this.request('GET', '/tree');
    },

    async saveTree(filename) {
        const url = filename ? `/tree/save?filename=${encodeURIComponent(filename)}` : '/tree/save';
        return this.request('POST', url);
    },

    async loadTree(filename) {
        return this.request('POST', `/tree/load?filename=${encodeURIComponent(filename)}`);
    },

    async getSavedFiles() {
        return this.request('GET', '/tree/files');
    },

    async newTree() {
        return this.request('POST', '/tree/new');
    },

    async undo() {
        return this.request('POST', '/tree/undo');
    },

    async redo() {
        return this.request('POST', '/tree/redo');
    },

    async autoLayout(rootPersonId, direction) {
        return this.request('POST', '/tree/layout', {
            root_person_id: rootPersonId,
            direction: direction,
            spacing_x: 200,
            spacing_y: 150
        });
    },

    async exportTree(options) {
        const response = await fetch(`${this.baseUrl}/tree/export`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(options)
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: 'Export failed' }));
            throw new Error(error.detail || 'Export failed');
        }

        return response.blob();
    },

    // Person operations
    async createPerson(data) {
        return this.request('POST', '/persons', data);
    },

    async updatePerson(id, data) {
        return this.request('PUT', `/persons/${id}`, data);
    },

    async updatePosition(id, x, y) {
        return this.request('PATCH', `/persons/${id}/position`, { x, y });
    },

    async updatePositions(positions) {
        return this.request('PATCH', '/persons/positions', positions);
    },

    async deletePerson(id) {
        return this.request('DELETE', `/persons/${id}`);
    },

    // Relationship operations
    async createMarriage(spouse1Id, spouse2Id, marriageDate) {
        return this.request('POST', '/marriages', {
            spouse1_id: spouse1Id,
            spouse2_id: spouse2Id,
            marriage_date: marriageDate || null
        });
    },

    async deleteMarriage(id) {
        return this.request('DELETE', `/marriages/${id}`);
    },

    async addChild(parentId, childId, marriageId) {
        return this.request('POST', '/children', {
            parent_id: parentId,
            child_id: childId,
            marriage_id: marriageId || null
        });
    },

    async removeChild(parentId, childId) {
        return this.request('DELETE', `/children/${parentId}/${childId}`);
    },

    // Photo upload
    async uploadPhoto(file) {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(`${this.baseUrl}/tree/upload-photo`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error('Upload failed');
        }

        return response.json();
    }
};

// Toast notifications
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// Update status bar
function updateStatus(text) {
    document.getElementById('status-text').textContent = text;
}

function updatePersonCount() {
    const count = Object.keys(AppState.tree.persons).length;
    document.getElementById('person-count').textContent = `${count} person${count !== 1 ? 's' : ''}`;
}

// Update undo/redo buttons
function updateUndoRedoButtons() {
    document.getElementById('undo-btn').disabled = !AppState.canUndo;
    document.getElementById('redo-btn').disabled = !AppState.canRedo;
}

// Load tree data from server
async function loadTreeData() {
    try {
        updateStatus('Loading...');
        const data = await API.getTree();

        AppState.tree = data.tree;
        AppState.canUndo = data.can_undo;
        AppState.canRedo = data.can_redo;

        updatePersonCount();
        updateUndoRedoButtons();
        TreeRenderer.render();

        // Show/hide empty state
        const isEmpty = Object.keys(AppState.tree.persons).length === 0;
        document.getElementById('empty-state').style.display = isEmpty ? 'flex' : 'none';

        updateStatus('Ready');
    } catch (error) {
        console.error('Failed to load tree:', error);
        showToast('Failed to load tree data', 'error');
        updateStatus('Error loading data');
    }
}

// Initialize dropdown menus
function initDropdowns() {
    document.querySelectorAll('.dropdown').forEach(dropdown => {
        const btn = dropdown.querySelector('.btn');
        const menu = dropdown.querySelector('.dropdown-menu');

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            // Close other dropdowns
            document.querySelectorAll('.dropdown-menu.active').forEach(m => {
                if (m !== menu) m.classList.remove('active');
            });
            menu.classList.toggle('active');
        });
    });

    // Close dropdowns on outside click
    document.addEventListener('click', () => {
        document.querySelectorAll('.dropdown-menu.active').forEach(m => {
            m.classList.remove('active');
        });
    });
}

// Initialize keyboard shortcuts
function initKeyboardShortcuts() {
    document.addEventListener('keydown', async (e) => {
        // Ctrl+Z - Undo
        if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
            e.preventDefault();
            if (AppState.canUndo) {
                try {
                    await API.undo();
                    await loadTreeData();
                    showToast('Undone', 'success');
                } catch (error) {
                    showToast('Undo failed', 'error');
                }
            }
        }

        // Ctrl+Shift+Z or Ctrl+Y - Redo
        if ((e.ctrlKey && e.shiftKey && e.key === 'Z') || (e.ctrlKey && e.key === 'y')) {
            e.preventDefault();
            if (AppState.canRedo) {
                try {
                    await API.redo();
                    await loadTreeData();
                    showToast('Redone', 'success');
                } catch (error) {
                    showToast('Redo failed', 'error');
                }
            }
        }

        // Ctrl+S - Save
        if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            try {
                await API.saveTree();
                showToast('Saved', 'success');
            } catch (error) {
                showToast('Save failed', 'error');
            }
        }

        // Escape - Close modals
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal-overlay.active').forEach(modal => {
                modal.classList.remove('active');
            });
            document.getElementById('context-menu').classList.remove('active');
        }

        // Delete - Delete selected person
        if (e.key === 'Delete' && AppState.selectedPersonId) {
            if (confirm('Are you sure you want to delete this person?')) {
                try {
                    await API.deletePerson(AppState.selectedPersonId);
                    AppState.selectedPersonId = null;
                    await loadTreeData();
                    showToast('Person deleted', 'success');
                } catch (error) {
                    showToast('Delete failed', 'error');
                }
            }
        }
    });
}

// Initialize toolbar buttons
function initToolbar() {
    // New tree
    document.getElementById('new-tree-btn').addEventListener('click', async () => {
        if (Object.keys(AppState.tree.persons).length > 0) {
            if (!confirm('Create a new tree? Unsaved changes will be lost.')) {
                return;
            }
        }
        try {
            await API.newTree();
            AppState.currentFilename = null; // Reset filename for new tree
            await loadTreeData();
            showToast('New tree created', 'success');
        } catch (error) {
            showToast('Failed to create new tree', 'error');
        }
    });

    // Save (use current file or prompt for new)
    document.getElementById('save-btn').addEventListener('click', async () => {
        try {
            let filename = AppState.currentFilename;
            if (!filename) {
                filename = prompt('Enter filename:', `family_tree_${new Date().toISOString().slice(0, 10)}`);
                if (!filename) return; // User cancelled
            }
            const result = await API.saveTree(filename);
            AppState.currentFilename = result.filename;
            showToast(`Saved: ${result.filename}`, 'success');
        } catch (error) {
            showToast('Save failed', 'error');
        }
    });

    // Save As (always prompt for new filename)
    document.getElementById('save-as-btn').addEventListener('click', async () => {
        try {
            const filename = prompt('Enter new filename:', `family_tree_${new Date().toISOString().slice(0, 10)}`);
            if (!filename) return; // User cancelled
            const result = await API.saveTree(filename);
            AppState.currentFilename = result.filename;
            showToast(`Saved as: ${result.filename}`, 'success');
        } catch (error) {
            showToast('Save failed', 'error');
        }
    });

    // Load
    document.getElementById('load-btn').addEventListener('click', async () => {
        Forms.openLoadModal();
    });

    // Clear canvas
    document.getElementById('clear-btn').addEventListener('click', async () => {
        const personCount = Object.keys(AppState.tree.persons).length;
        if (personCount === 0) {
            showToast('Canvas is already empty', 'info');
            return;
        }

        if (confirm(`Are you sure you want to clear the canvas? This will delete all ${personCount} person(s) and cannot be undone.`)) {
            try {
                await API.newTree();
                await loadTreeData();
                TreeRenderer.centerView();
                showToast('Canvas cleared', 'success');
            } catch (error) {
                showToast('Failed to clear canvas', 'error');
            }
        }
    });

    // Add person
    document.getElementById('add-person-btn').addEventListener('click', () => {
        Forms.openPersonModal();
    });

    document.getElementById('empty-add-btn').addEventListener('click', () => {
        Forms.openPersonModal();
    });

    // Undo
    document.getElementById('undo-btn').addEventListener('click', async () => {
        try {
            await API.undo();
            await loadTreeData();
            showToast('Undone', 'success');
        } catch (error) {
            showToast('Nothing to undo', 'error');
        }
    });

    // Redo
    document.getElementById('redo-btn').addEventListener('click', async () => {
        try {
            await API.redo();
            await loadTreeData();
            showToast('Redone', 'success');
        } catch (error) {
            showToast('Nothing to redo', 'error');
        }
    });

    // Layout direction
    document.querySelectorAll('#layout-menu .dropdown-item').forEach(item => {
        item.addEventListener('click', () => {
            AppState.layoutDirection = item.dataset.layout;
            document.getElementById('layout-btn').textContent =
                `Layout: ${item.dataset.layout === 'top-down' ? 'Top-Down' : 'Left-Right'}`;
        });
    });

    // Auto layout
    document.getElementById('auto-layout-btn').addEventListener('click', () => {
        if (Object.keys(AppState.tree.persons).length === 0) {
            showToast('No persons to arrange', 'error');
            return;
        }
        Forms.openLayoutModal();
    });

    // Settings
    document.getElementById('settings-btn').addEventListener('click', () => {
        openSettingsModal();
    });

    // Export
    document.getElementById('export-btn').addEventListener('click', () => {
        Forms.openExportModal();
    });

    // Close side panel
    document.getElementById('close-panel').addEventListener('click', () => {
        document.getElementById('side-panel').classList.add('collapsed');
        AppState.selectedPersonId = null;
        TreeRenderer.render();
    });
}

// Gender color palettes
const colorPalettes = {
    classic: { male: '#d0e8ff', female: '#ffd0e8', unknown: '#e8e8e8' },
    neutral: { male: '#d0d0d0', female: '#b8b8b8', unknown: '#e0e0e0' },
    earth: { male: '#c9dbb2', female: '#e8d4b8', unknown: '#d8d8c8' },
    pastel: { male: '#b8d4e8', female: '#e8b8d4', unknown: '#d4e8b8' }
};

// Apply gender colors
function applyGenderColors(male, female, unknown) {
    document.documentElement.style.setProperty('--node-male', male);
    document.documentElement.style.setProperty('--node-female', female);
    document.documentElement.style.setProperty('--node-unknown', unknown);

    // Save to localStorage
    localStorage.setItem('genderColors', JSON.stringify({ male, female, unknown }));

    // Re-render to apply new colors
    TreeRenderer.render();
}

// Open settings modal
function openSettingsModal() {
    const modal = document.getElementById('settings-modal');

    // Load saved colors or defaults
    const savedColors = JSON.parse(localStorage.getItem('genderColors')) || colorPalettes.classic;
    document.getElementById('color-male').value = savedColors.male;
    document.getElementById('color-female').value = savedColors.female;
    document.getElementById('color-unknown').value = savedColors.unknown;

    // Load saved node size or default
    const savedNodeSize = localStorage.getItem('nodeSize') || '140';
    document.getElementById('node-size').value = savedNodeSize;
    document.getElementById('node-size-value').textContent = savedNodeSize;

    // Load saved font size or default
    const savedFontSize = localStorage.getItem('nodeFontSize') || '12';
    document.getElementById('font-size').value = savedFontSize;
    document.getElementById('font-size-value').textContent = savedFontSize;

    // Load saved font family or default
    const savedFontFamily = localStorage.getItem('nodeFontFamily') || 'system-ui, -apple-system, sans-serif';
    document.getElementById('font-family').value = savedFontFamily;

    // Load saved photo size or default
    const savedPhotoSize = localStorage.getItem('photoSize') || '40';
    document.getElementById('photo-size').value = savedPhotoSize;
    document.getElementById('photo-size-value').textContent = savedPhotoSize;

    modal.classList.add('active');
}

// Initialize settings modal
function initSettings() {
    const modal = document.getElementById('settings-modal');

    document.getElementById('settings-modal-close').addEventListener('click', () => {
        modal.classList.remove('active');
    });

    document.getElementById('settings-cancel-btn').addEventListener('click', () => {
        modal.classList.remove('active');
    });

    document.getElementById('settings-save-btn').addEventListener('click', () => {
        const male = document.getElementById('color-male').value;
        const female = document.getElementById('color-female').value;
        const unknown = document.getElementById('color-unknown').value;

        applyGenderColors(male, female, unknown);

        // Apply node size
        const nodeSize = parseInt(document.getElementById('node-size').value);
        applyNodeSize(nodeSize);

        // Apply font size
        const fontSize = parseInt(document.getElementById('font-size').value);
        applyFontSize(fontSize);

        // Apply font family
        const fontFamily = document.getElementById('font-family').value;
        applyFontFamily(fontFamily);

        // Apply photo size
        const photoSize = parseInt(document.getElementById('photo-size').value);
        applyPhotoSize(photoSize);

        modal.classList.remove('active');
        showToast('Settings applied', 'success');
    });

    // Preset palette buttons
    document.querySelectorAll('[data-palette]').forEach(btn => {
        btn.addEventListener('click', () => {
            const palette = colorPalettes[btn.dataset.palette];
            document.getElementById('color-male').value = palette.male;
            document.getElementById('color-female').value = palette.female;
            document.getElementById('color-unknown').value = palette.unknown;
        });
    });

    // Node size slider
    const nodeSizeSlider = document.getElementById('node-size');
    nodeSizeSlider.addEventListener('input', (e) => {
        document.getElementById('node-size-value').textContent = e.target.value;
    });

    // Font size slider
    const fontSizeSlider = document.getElementById('font-size');
    fontSizeSlider.addEventListener('input', (e) => {
        document.getElementById('font-size-value').textContent = e.target.value;
    });

    // Photo size slider
    const photoSizeSlider = document.getElementById('photo-size');
    photoSizeSlider.addEventListener('input', (e) => {
        document.getElementById('photo-size-value').textContent = e.target.value;
    });

    // Load saved colors on init
    const savedColors = JSON.parse(localStorage.getItem('genderColors'));
    if (savedColors) {
        applyGenderColors(savedColors.male, savedColors.female, savedColors.unknown);
    }

    // Load saved node size on init
    const savedNodeSize = localStorage.getItem('nodeSize');
    if (savedNodeSize) {
        applyNodeSize(parseInt(savedNodeSize));
        document.getElementById('node-size').value = savedNodeSize;
        document.getElementById('node-size-value').textContent = savedNodeSize;
    }

    // Load saved font size on init
    const savedFontSize = localStorage.getItem('nodeFontSize');
    if (savedFontSize) {
        applyFontSize(parseInt(savedFontSize));
        document.getElementById('font-size').value = savedFontSize;
        document.getElementById('font-size-value').textContent = savedFontSize;
    }

    // Load saved font family on init
    const savedFontFamily = localStorage.getItem('nodeFontFamily');
    if (savedFontFamily) {
        applyFontFamily(savedFontFamily);
        document.getElementById('font-family').value = savedFontFamily;
    }

    // Load saved photo size on init
    const savedPhotoSize = localStorage.getItem('photoSize');
    if (savedPhotoSize) {
        applyPhotoSize(parseInt(savedPhotoSize));
        document.getElementById('photo-size').value = savedPhotoSize;
        document.getElementById('photo-size-value').textContent = savedPhotoSize;
    }
}

// Apply node size
function applyNodeSize(size) {
    window.nodeSize = { width: size, height: Math.round(size * 0.43) }; // Maintain aspect ratio
    localStorage.setItem('nodeSize', size);

    if (TreeRenderer.nodeWidth) {
        TreeRenderer.nodeWidth = size;
        TreeRenderer.nodeHeight = Math.round(size * 0.43);
        TreeRenderer.render();
    }
}

// Apply font size
function applyFontSize(size) {
    document.documentElement.style.setProperty('--node-font-size', `${size}px`);
    localStorage.setItem('nodeFontSize', size);
    if (TreeRenderer.render) TreeRenderer.render();
}

// Apply font family
function applyFontFamily(fontFamily) {
    document.documentElement.style.setProperty('--node-font-family', fontFamily);
    localStorage.setItem('nodeFontFamily', fontFamily);
    if (TreeRenderer.render) TreeRenderer.render();
}

// Apply photo size
function applyPhotoSize(size) {
    window.photoSize = size;
    localStorage.setItem('photoSize', size);
    if (TreeRenderer.render) TreeRenderer.render();
}

// Initialize context menu
function initContextMenu() {
    const menu = document.getElementById('context-menu');

    // Hide menu on click elsewhere
    document.addEventListener('click', () => {
        menu.classList.remove('active');
    });

    // Context menu items
    document.getElementById('ctx-add-spouse').addEventListener('click', () => {
        if (AppState.selectedPersonId) {
            Forms.openSpouseModal(AppState.selectedPersonId);
        }
    });

    document.getElementById('ctx-add-child').addEventListener('click', () => {
        if (AppState.selectedPersonId) {
            Forms.openChildModal(AppState.selectedPersonId);
        }
    });

    document.getElementById('ctx-edit').addEventListener('click', () => {
        if (AppState.selectedPersonId) {
            Forms.openPersonModal(AppState.selectedPersonId);
        }
    });

    document.getElementById('ctx-select-branch').addEventListener('click', () => {
        if (AppState.selectedPersonId) {
            const branchIds = new Set();
            const queue = [AppState.selectedPersonId];

            // Collect descendants and their spouses
            while (queue.length > 0) {
                const pid = queue.shift();
                if (branchIds.has(pid)) continue;
                branchIds.add(pid);

                // Add spouses of this person (to keep couples together)
                Object.values(AppState.tree.marriages).forEach(m => {
                    if (m.spouse1_id === pid && !branchIds.has(m.spouse2_id)) branchIds.add(m.spouse2_id);
                    if (m.spouse2_id === pid && !branchIds.has(m.spouse1_id)) branchIds.add(m.spouse1_id);
                });

                // Add children
                AppState.tree.parent_child.forEach(pc => {
                    if (pc.parent_id === pid) queue.push(pc.child_id);
                });
            }

            AppState.selectedPersonIds = branchIds;
            TreeRenderer.render();
        }
    });

    document.getElementById('ctx-delete').addEventListener('click', async () => {
        if (AppState.selectedPersonId && confirm('Are you sure you want to delete this person?')) {
            try {
                await API.deletePerson(AppState.selectedPersonId);
                AppState.selectedPersonId = null;
                document.getElementById('side-panel').classList.add('collapsed');
                await loadTreeData();
                showToast('Person deleted', 'success');
            } catch (error) {
                showToast('Delete failed', 'error');
            }
        }
    });
}

// Show context menu
function showContextMenu(x, y, personId) {
    AppState.selectedPersonId = personId;
    const menu = document.getElementById('context-menu');
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.classList.add('active');
}

// Show side panel with person details
function showPersonDetails(personId) {
    const person = AppState.tree.persons[personId];
    if (!person) return;

    AppState.selectedPersonId = personId;

    const panel = document.getElementById('side-panel');
    const content = document.getElementById('panel-content');

    // Get relationships
    const marriages = Object.values(AppState.tree.marriages).filter(
        m => m.spouse1_id === personId || m.spouse2_id === personId
    );

    const childRelations = AppState.tree.parent_child.filter(
        pc => pc.parent_id === personId
    );

    const parentRelations = AppState.tree.parent_child.filter(
        pc => pc.child_id === personId
    );

    let html = `
        <div style="text-align: center; margin-bottom: 20px;">
            ${person.photo_path ?
            `<img src="/uploads/${person.photo_path.split('/').pop()}" class="node-photo" style="width: 80px; height: 80px; margin-bottom: 10px;">` :
            ''
        }
            <h3 style="margin: 0;">${person.name}</h3>
            <p style="color: var(--text-muted); font-size: 13px; margin-top: 4px;">
                ${person.date_of_birth ? `b. ${person.date_of_birth}` : ''}
                ${person.date_of_death ? ` - d. ${person.date_of_death}` : ''}
            </p>
        </div>
    `;

    if (person.notes) {
        html += `
            <div class="form-group">
                <label>Notes</label>
                <p style="font-size: 13px;">${person.notes}</p>
            </div>
        `;
    }

    // Spouses
    if (marriages.length > 0) {
        html += `<div class="form-group"><label>Spouses</label>`;
        marriages.forEach(m => {
            const spouseId = m.spouse1_id === personId ? m.spouse2_id : m.spouse1_id;
            const spouse = AppState.tree.persons[spouseId];
            if (spouse) {
                html += `<div style="padding: 6px 0; font-size: 13px;">${spouse.name}</div>`;
            }
        });
        html += `</div>`;
    }

    // Children
    if (childRelations.length > 0) {
        html += `<div class="form-group"><label>Children</label>`;
        childRelations.forEach(pc => {
            const child = AppState.tree.persons[pc.child_id];
            if (child) {
                html += `<div style="padding: 6px 0; font-size: 13px;">${child.name}</div>`;
            }
        });
        html += `</div>`;
    }

    // Parents
    if (parentRelations.length > 0) {
        html += `<div class="form-group"><label>Parents</label>`;
        parentRelations.forEach(pc => {
            const parent = AppState.tree.persons[pc.parent_id];
            if (parent) {
                html += `<div style="padding: 6px 0; font-size: 13px;">${parent.name}</div>`;
            }
        });
        html += `</div>`;
    }

    html += `
        <div style="margin-top: 20px; display: flex; gap: 8px; flex-wrap: wrap;">
            <button class="btn btn-sm" onclick="Forms.openSpouseModal('${personId}')">Add Spouse</button>
            <button class="btn btn-sm" onclick="Forms.openChildModal('${personId}')">Add Child</button>
            <button class="btn btn-sm" onclick="Forms.openPersonModal('${personId}')">Edit</button>
        </div>
    `;

    content.innerHTML = html;
    panel.classList.remove('collapsed');

    TreeRenderer.render();
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    initDropdowns();
    initKeyboardShortcuts();
    initToolbar();
    initContextMenu();
    initSettings();

    // Initialize renderer and forms after DOM is ready
    TreeRenderer.init();
    Forms.init();

    // Load initial data
    loadTreeData();
});

// Export for use by other modules
window.AppState = AppState;
window.API = API;
window.showToast = showToast;
window.loadTreeData = loadTreeData;
window.showContextMenu = showContextMenu;
window.showPersonDetails = showPersonDetails;
