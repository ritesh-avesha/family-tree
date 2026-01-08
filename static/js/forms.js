/**
 * Family Tree Application - Form Handlers
 */

const Forms = {
    init() {
        this.initPersonModal();
        this.initSpouseModal();
        this.initChildModal();
        this.initExportModal();
        this.initLoadModal();
        this.initLayoutModal();
    },

    // ==================== Person Modal ====================

    initPersonModal() {
        const modal = document.getElementById('person-modal');
        const closeBtn = document.getElementById('person-modal-close');
        const cancelBtn = document.getElementById('person-cancel-btn');
        const saveBtn = document.getElementById('person-save-btn');
        const photoInput = document.getElementById('person-photo');

        closeBtn.addEventListener('click', () => this.closeModal(modal));
        cancelBtn.addEventListener('click', () => this.closeModal(modal));

        saveBtn.addEventListener('click', async () => {
            await this.savePerson();
        });

        // Photo preview
        photoInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    document.getElementById('photo-preview').innerHTML =
                        `<img src="${e.target.result}" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover;">`;
                };
                reader.readAsDataURL(file);
            }
        });
    },

    openPersonModal(personId = null) {
        const modal = document.getElementById('person-modal');
        const title = document.getElementById('person-modal-title');
        const form = document.getElementById('person-form');

        form.reset();
        document.getElementById('person-id').value = '';
        document.getElementById('photo-preview').innerHTML = '';

        if (personId) {
            const person = AppState.tree.persons[personId];
            if (person) {
                title.textContent = 'Edit Person';
                document.getElementById('person-id').value = person.id;
                document.getElementById('person-name').value = person.name;
                document.getElementById('person-dob').value = person.date_of_birth || '';
                document.getElementById('person-dod').value = person.date_of_death || '';
                document.getElementById('person-notes').value = person.notes || '';

                // Set gender
                const genderRadio = form.querySelector(`input[name="gender"][value="${person.gender}"]`);
                if (genderRadio) genderRadio.checked = true;

                // Show photo preview if exists
                if (person.photo_path) {
                    document.getElementById('photo-preview').innerHTML =
                        `<img src="/uploads/${person.photo_path.split('/').pop()}" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover;">`;
                }
            }
        } else {
            title.textContent = 'Add Person';

            // Set default position near center or offset from existing nodes
            const existingPersons = Object.values(AppState.tree.persons);
            if (existingPersons.length > 0) {
                const lastPerson = existingPersons[existingPersons.length - 1];
                // Place new person near the last added one
            }
        }

        modal.classList.add('active');
        document.getElementById('person-name').focus();
    },

    async savePerson() {
        const form = document.getElementById('person-form');
        const personId = document.getElementById('person-id').value;
        const name = document.getElementById('person-name').value.trim();

        if (!name) {
            showToast('Name is required', 'error');
            return;
        }

        const gender = form.querySelector('input[name="gender"]:checked')?.value || 'unknown';
        const dob = document.getElementById('person-dob').value.trim() || null;
        const dod = document.getElementById('person-dod').value.trim() || null;
        const notes = document.getElementById('person-notes').value.trim() || null;

        // Handle photo upload
        let photoPath = null;
        const photoInput = document.getElementById('person-photo');

        if (photoInput.files?.length > 0) {
            try {
                const result = await API.uploadPhoto(photoInput.files[0]);
                photoPath = result.path;
            } catch (error) {
                showToast('Photo upload failed', 'error');
            }
        } else if (personId) {
            // Keep existing photo
            photoPath = AppState.tree.persons[personId]?.photo_path || null;
        }

        const data = {
            name,
            gender,
            date_of_birth: dob,
            date_of_death: dod,
            photo_path: photoPath,
            notes
        };

        try {
            if (personId) {
                await API.updatePerson(personId, data);
                showToast('Person updated', 'success');
            } else {
                // Set initial position
                const existingPersons = Object.values(AppState.tree.persons);
                if (existingPersons.length > 0) {
                    const maxX = Math.max(...existingPersons.map(p => p.x));
                    data.x = maxX + 200;
                    data.y = 100;
                } else {
                    data.x = 0;
                    data.y = 0;
                }

                await API.createPerson(data);
                showToast('Person added', 'success');
            }

            this.closeModal(document.getElementById('person-modal'));
            await loadTreeData();

        } catch (error) {
            showToast(error.message || 'Failed to save', 'error');
        }
    },

    // ==================== Spouse Modal ====================

    initSpouseModal() {
        const modal = document.getElementById('spouse-modal');
        const closeBtn = document.getElementById('spouse-modal-close');
        const cancelBtn = document.getElementById('spouse-cancel-btn');
        const saveBtn = document.getElementById('spouse-save-btn');

        closeBtn.addEventListener('click', () => this.closeModal(modal));
        cancelBtn.addEventListener('click', () => this.closeModal(modal));
        saveBtn.addEventListener('click', async () => await this.saveSpouse());
    },

    openSpouseModal(personId) {
        const modal = document.getElementById('spouse-modal');
        const person = AppState.tree.persons[personId];

        if (!person) return;

        document.getElementById('spouse-for-name').textContent = person.name;
        modal.dataset.personId = personId;

        // Reset form
        document.getElementById('marriage-date').value = '';
        document.getElementById('new-spouse-name').value = '';
        document.getElementById('new-spouse-name').disabled = false;
        document.getElementById('spouse-dob').value = '';
        document.getElementById('spouse-dod').value = '';
        document.getElementById('spouse-notes').value = '';

        // Pre-select opposite gender
        const oppositeGender = person.gender === 'male' ? 'female' : (person.gender === 'female' ? 'male' : 'unknown');
        const genderRadio = modal.querySelector(`input[name="spouse-gender"][value="${oppositeGender}"]`);
        if (genderRadio) genderRadio.checked = true;

        modal.classList.add('active');
    },

    async saveSpouse() {
        const modal = document.getElementById('spouse-modal');
        const saveBtn = document.getElementById('spouse-save-btn');
        if (saveBtn.disabled) return;
        saveBtn.disabled = true;

        const personId = modal.dataset.personId;
        const person = AppState.tree.persons[personId];
        const newName = document.getElementById('new-spouse-name').value.trim();
        const marriageDate = document.getElementById('marriage-date').value.trim();

        if (!newName) {
            showToast('Please enter spouse name', 'error');
            saveBtn.disabled = false;
            return;
        }

        try {
            // Determine gender
            const gender = modal.querySelector('input[name="spouse-gender"]:checked').value;

            // Smart positioning: "Insert and Shift"
            // Place right next to the person (or rightmost existing spouse)
            // Shift ALL nodes to the right of the insertion point to make space

            const nodeWidth = window.nodeSize?.width || 160;
            const spacing = nodeWidth + 40;

            // Find rightmost existing spouse
            let baseX = person.x;
            Object.values(AppState.tree.marriages).forEach(m => {
                if (m.spouse1_id === personId) {
                    const s = AppState.tree.persons[m.spouse2_id];
                    if (s && s.x > baseX) baseX = s.x;
                }
                if (m.spouse2_id === personId) {
                    const s = AppState.tree.persons[m.spouse1_id];
                    if (s && s.x > baseX) baseX = s.x;
                }
            });

            const spouseX = baseX + spacing;
            const spouseY = person.y;

            // Shift nodes to make space (shift nodes at or to the right of target, in this generation or below)
            const updates = [];
            const thresholdY = person.y - 50;

            Object.values(AppState.tree.persons).forEach(p => {
                if (p.x >= spouseX - 10 && p.y >= thresholdY) {
                    p.x += spacing;
                    updates.push({ id: p.id, x: p.x, y: p.y });
                }
            });

            if (updates.length > 0) {
                await API.updatePositions(updates);
            }

            const dob = document.getElementById('spouse-dob').value.trim();
            const dod = document.getElementById('spouse-dod').value.trim();
            const notes = document.getElementById('spouse-notes').value.trim();

            const result = await API.createPerson({
                name: newName,
                gender: gender,
                x: spouseX,
                y: spouseY,
                date_of_birth: dob || null,
                date_of_death: dod || null,
                notes: notes || null
            });
            spouseId = result.id;
        } catch (error) {
            showToast('Failed to create spouse', 'error');
            saveBtn.disabled = false;
            return;
        }

        try {
            await API.createMarriage(personId, spouseId, marriageDate);
            showToast('Spouse added', 'success');
            this.closeModal(modal);
            await loadTreeData();
            TreeRenderer.centerView();
        } catch (error) {
            showToast(error.message || 'Failed to add spouse', 'error');
            saveBtn.disabled = false;
        } finally {
            saveBtn.disabled = false;
        }
    },

    // ==================== Child Modal ====================

    initChildModal() {
        const modal = document.getElementById('child-modal');
        const closeBtn = document.getElementById('child-modal-close');
        const cancelBtn = document.getElementById('child-cancel-btn');
        const saveBtn = document.getElementById('child-save-btn');

        closeBtn.addEventListener('click', () => this.closeModal(modal));
        cancelBtn.addEventListener('click', () => this.closeModal(modal));
        saveBtn.addEventListener('click', async () => await this.saveChild());

        saveBtn.addEventListener('click', async () => await this.saveChild());
    },

    openChildModal(personId) {
        const modal = document.getElementById('child-modal');
        const person = AppState.tree.persons[personId];

        if (!person) return;

        document.getElementById('child-for-name').textContent = person.name;
        modal.dataset.personId = personId;

        // Reset form
        document.getElementById('new-child-name').value = '';
        document.getElementById('new-child-name').disabled = false;
        document.getElementById('child-dob').value = '';
        document.getElementById('child-dod').value = '';
        document.getElementById('child-notes').value = '';
        modal.querySelector('input[name="child-gender"][value="unknown"]').checked = true;

        // Populate marriages dropdown
        const marriageSelect = document.getElementById('child-marriage');
        marriageSelect.innerHTML = '<option value="">-- No specific marriage --</option>';

        const personMarriages = [];
        Object.values(AppState.tree.marriages).forEach(m => {
            if (m.spouse1_id === personId || m.spouse2_id === personId) {
                const spouseId = m.spouse1_id === personId ? m.spouse2_id : m.spouse1_id;
                const spouse = AppState.tree.persons[spouseId];
                if (spouse) {
                    personMarriages.push({ marriage: m, spouse: spouse });
                    const option = document.createElement('option');
                    option.value = m.id;
                    option.textContent = `With ${spouse.name}`;
                    marriageSelect.appendChild(option);
                }
            }
        });

        // Auto-select if exactly one marriage
        if (personMarriages.length === 1) {
            marriageSelect.value = personMarriages[0].marriage.id;
        }

        modal.classList.add('active');
    },

    async saveChild() {
        const modal = document.getElementById('child-modal');
        const saveBtn = document.getElementById('child-save-btn');
        if (saveBtn.disabled) return;
        saveBtn.disabled = true;

        const parentId = modal.dataset.personId;
        const parent = AppState.tree.persons[parentId];
        const marriageId = document.getElementById('child-marriage').value || null;
        const newName = document.getElementById('new-child-name').value.trim();
        if (!newName) {
            showToast('Please enter child name', 'error');
            saveBtn.disabled = false;
            return;
        }

        try {
            // Calculate child position below parent, avoiding overlaps with siblings
            const nodeSpacing = window.nodeSize?.width || 160; // Default spacing

            // Find the parent(s) for positioning
            let parentX = parent.x;
            let parentY = parent.y;
            let parentIds = [parentId];

            // If marriage selected, use marriage center and include both parents
            if (marriageId) {
                const marriage = AppState.tree.marriages[marriageId];
                if (marriage) {
                    const spouse1 = AppState.tree.persons[marriage.spouse1_id];
                    const spouse2 = AppState.tree.persons[marriage.spouse2_id];
                    if (spouse1 && spouse2) {
                        parentX = (spouse1.x + spouse2.x) / 2;
                        parentY = Math.max(spouse1.y, spouse2.y);
                        parentIds = [marriage.spouse1_id, marriage.spouse2_id];
                    }
                }
            }

            // Find existing children of these parent(s)
            const existingChildrenIds = new Set();
            AppState.tree.parent_child.forEach(pc => {
                if (parentIds.includes(pc.parent_id)) {
                    existingChildrenIds.add(pc.child_id);
                }
            });

            // Get positions of existing children
            const siblingPositions = [];
            existingChildrenIds.forEach(childId => {
                const child = AppState.tree.persons[childId];
                if (child) {
                    siblingPositions.push({ x: child.x, y: child.y });
                }
            });

            let childX, childY;
            childY = parentY + 150;

            if (siblingPositions.length === 0) {
                // No existing children, place below parent center
                childX = parentX;
            } else {
                // Find the rightmost sibling and place to the right
                const maxX = Math.max(...siblingPositions.map(p => p.x));
                childX = maxX + nodeSpacing + 40; // Add spacing

                // Use same Y as siblings for consistency
                childY = siblingPositions[0].y;
            }

            // Ensure coordinates are finite numbers
            if (!Number.isFinite(childX)) childX = parentX;
            if (!Number.isFinite(childY)) childY = parentY + 150;

            const gender = modal.querySelector('input[name="child-gender"]:checked').value;
            const dob = document.getElementById('child-dob').value.trim();
            const dod = document.getElementById('child-dod').value.trim();
            const notes = document.getElementById('child-notes').value.trim();

            const result = await API.createPerson({
                name: newName,
                gender: gender,
                x: childX,
                y: childY,
                date_of_birth: dob || null,
                date_of_death: dod || null,
                notes: notes || null
            });
            childId = result.id;
        } catch (error) {
            console.error('Create person error:', error);
            showToast(error.message || 'Failed to create child', 'error');
            saveBtn.disabled = false;
            return;
        }

        try {
            await API.addChild(parentId, childId, marriageId);

            // If marriage is selected, also add child to other spouse
            if (marriageId) {
                const marriage = AppState.tree.marriages[marriageId];
                if (marriage) {
                    const otherParentId = marriage.spouse1_id === parentId ? marriage.spouse2_id : marriage.spouse1_id;
                    try {
                        await API.addChild(otherParentId, childId, marriageId);
                    } catch (error) {
                        // May already exist, ignore
                    }
                }
            }

            showToast('Child added', 'success');
            this.closeModal(modal);
            await loadTreeData();
            TreeRenderer.centerView();
        } catch (error) {
            console.error('Add child relationship error:', error);
            showToast(error.message || 'Failed to add child relationship', 'error');
        } finally {
            saveBtn.disabled = false;
        }
    },

    // ==================== Export Modal ====================

    initExportModal() {
        const modal = document.getElementById('export-modal');
        const closeBtn = document.getElementById('export-modal-close');
        const cancelBtn = document.getElementById('export-cancel-btn');
        const saveBtn = document.getElementById('export-save-btn');
        const qualitySlider = document.getElementById('export-quality');

        closeBtn.addEventListener('click', () => this.closeModal(modal));
        cancelBtn.addEventListener('click', () => this.closeModal(modal));
        saveBtn.addEventListener('click', async () => await this.doExport());

        // Update quality display
        qualitySlider.addEventListener('input', (e) => {
            document.getElementById('quality-value').textContent = e.target.value;
        });

        // Toggle image/PDF options
        modal.querySelectorAll('input[name="export-format"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                const isPdf = e.target.value === 'pdf';
                document.getElementById('image-options').style.display = isPdf ? 'none' : 'block';
                document.getElementById('pdf-options').style.display = isPdf ? 'block' : 'none';
                document.getElementById('quality-group').style.display = e.target.value === 'jpg' ? 'block' : 'none';
            });
        });

        // Image preset handler
        document.getElementById('image-preset').addEventListener('change', (e) => {
            const presets = {
                'custom': null,
                'hd': { width: 1280, height: 720 },
                'fullhd': { width: 1920, height: 1080 },
                '2k': { width: 2560, height: 1440 },
                '4k': { width: 3840, height: 2160 },
                '5k': { width: 5120, height: 2880 },
                '8k': { width: 7680, height: 4320 },
                'poster': { width: 4000, height: 3000 },
                'banner': { width: 6000, height: 2000 }
            };

            const preset = presets[e.target.value];
            if (preset) {
                document.getElementById('export-width').value = preset.width;
                document.getElementById('export-height').value = preset.height;
            }
        });
    },

    openExportModal() {
        const modal = document.getElementById('export-modal');
        modal.classList.add('active');
    },

    async doExport() {
        const modal = document.getElementById('export-modal');
        const format = modal.querySelector('input[name="export-format"]:checked').value;

        let options = { format };

        if (format === 'pdf') {
            options.page_size = document.getElementById('pdf-size').value;
            options.orientation = modal.querySelector('input[name="pdf-orientation"]:checked').value;
        } else {
            options.width = parseInt(document.getElementById('export-width').value);
            options.height = parseInt(document.getElementById('export-height').value);
            options.quality = parseInt(document.getElementById('export-quality').value);
        }

        try {
            showToast('Exporting...', 'info');
            const blob = await API.exportTree(options);

            // Trigger download
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `family_tree.${format}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            showToast('Export complete', 'success');
            this.closeModal(modal);
        } catch (error) {
            showToast(error.message || 'Export failed', 'error');
        }
    },

    // ==================== Load Modal ====================

    initLoadModal() {
        const modal = document.getElementById('load-modal');
        const closeBtn = document.getElementById('load-modal-close');
        const cancelBtn = document.getElementById('load-cancel-btn');
        const confirmBtn = document.getElementById('load-confirm-btn');

        closeBtn.addEventListener('click', () => this.closeModal(modal));
        cancelBtn.addEventListener('click', () => this.closeModal(modal));
        confirmBtn.addEventListener('click', async () => await this.doLoad());
    },

    async openLoadModal() {
        const modal = document.getElementById('load-modal');
        const list = document.getElementById('saved-files-list');
        const confirmBtn = document.getElementById('load-confirm-btn');

        list.innerHTML = '<div style="padding: 20px; text-align: center;">Loading...</div>';
        confirmBtn.disabled = true;
        modal.classList.add('active');

        try {
            const files = await API.getSavedFiles();

            if (files.length === 0) {
                list.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted);">No saved trees found</div>';
                return;
            }

            list.innerHTML = '';
            files.forEach(file => {
                const item = document.createElement('div');
                item.className = 'file-item';
                item.dataset.filename = file.filename;
                item.innerHTML = `
                    <span>${file.filename}</span>
                    <span class="file-date">${new Date(file.modified).toLocaleDateString()}</span>
                `;
                item.addEventListener('click', () => {
                    list.querySelectorAll('.file-item').forEach(i => i.classList.remove('selected'));
                    item.classList.add('selected');
                    confirmBtn.disabled = false;
                });
                list.appendChild(item);
            });
        } catch (error) {
            list.innerHTML = '<div style="padding: 20px; color: var(--text-muted);">Failed to load files</div>';
        }
    },

    async doLoad() {
        const modal = document.getElementById('load-modal');
        const selected = document.querySelector('#saved-files-list .file-item.selected');

        if (!selected) return;

        try {
            const filename = selected.dataset.filename;
            await API.loadTree(filename);
            AppState.currentFilename = filename; // Track the loaded file
            showToast('Tree loaded', 'success');
            this.closeModal(modal);
            await loadTreeData();
            TreeRenderer.centerView();
        } catch (error) {
            showToast(error.message || 'Load failed', 'error');
        }
    },

    // ==================== Layout Modal ====================

    initLayoutModal() {
        const modal = document.getElementById('layout-modal');
        const closeBtn = document.getElementById('layout-modal-close');
        const cancelBtn = document.getElementById('layout-cancel-btn');
        const applyBtn = document.getElementById('layout-apply-btn');

        closeBtn.addEventListener('click', () => this.closeModal(modal));
        cancelBtn.addEventListener('click', () => this.closeModal(modal));
        applyBtn.addEventListener('click', async () => await this.applyLayout());
    },

    openLayoutModal() {
        const modal = document.getElementById('layout-modal');
        const list = document.getElementById('layout-person-list');
        const applyBtn = document.getElementById('layout-apply-btn');

        applyBtn.disabled = true;
        list.innerHTML = '';

        Object.values(AppState.tree.persons).forEach(p => {
            const item = document.createElement('div');
            item.className = 'person-item';
            item.textContent = p.name;
            item.dataset.personId = p.id;
            item.addEventListener('click', () => {
                list.querySelectorAll('.person-item').forEach(i => i.classList.remove('selected'));
                item.classList.add('selected');
                applyBtn.disabled = false;
            });
            list.appendChild(item);
        });

        modal.classList.add('active');
    },

    async applyLayout() {
        const modal = document.getElementById('layout-modal');
        const selected = document.querySelector('#layout-person-list .person-item.selected');

        if (!selected) return;

        try {
            await API.autoLayout(selected.dataset.personId, AppState.layoutDirection);
            showToast('Layout applied', 'success');
            this.closeModal(modal);
            await loadTreeData();
            TreeRenderer.centerView();
        } catch (error) {
            showToast(error.message || 'Layout failed', 'error');
        }
    },

    // ==================== Utility ====================

    closeModal(modal) {
        modal.classList.remove('active');
    }
};

// Export
window.Forms = Forms;
