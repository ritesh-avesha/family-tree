/**
 * Family Tree Application - Tree Renderer
 * Handles SVG rendering, pan/zoom, and node dragging
 */

const TreeRenderer = {
    svg: null,
    canvasGroup: null,
    linesLayer: null,
    nodesLayer: null,

    // Pan/zoom state
    transform: { x: 0, y: 0, scale: 1 },
    isPanning: false,
    panStart: { x: 0, y: 0 },

    // Drag state
    isDragging: false,
    draggedNodeId: null,
    dragOffset: { x: 0, y: 0 },

    // Node dimensions
    nodeWidth: 140,
    nodeHeight: 60,

    init() {
        this.svg = document.getElementById('tree-canvas');
        this.canvasGroup = document.getElementById('canvas-group');
        this.linesLayer = document.getElementById('lines-layer');
        this.nodesLayer = document.getElementById('nodes-layer');

        this.initPanZoom();
        this.initDrag();
        this.centerView();
    },

    initPanZoom() {
        const container = document.getElementById('canvas-container');

        // Mouse wheel zoom
        container.addEventListener('wheel', (e) => {
            e.preventDefault();

            const rect = container.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            const newScale = Math.min(Math.max(this.transform.scale * delta, 0.2), 3);

            // Zoom towards mouse position
            const scaleChange = newScale / this.transform.scale;
            this.transform.x = mouseX - (mouseX - this.transform.x) * scaleChange;
            this.transform.y = mouseY - (mouseY - this.transform.y) * scaleChange;
            this.transform.scale = newScale;

            this.applyTransform();
        });

        // Pan with mouse drag on empty space
        this.svg.addEventListener('mousedown', (e) => {
            if (e.target === this.svg || e.target.id === 'canvas-group' ||
                e.target.tagName === 'line' || e.target.tagName === 'path') {

                // Clear selection on background click (unless Ctrl held)
                if (!e.ctrlKey && !e.metaKey) {
                    AppState.selectedPersonIds.clear();
                    AppState.selectedPersonId = null;
                    this.render();
                }

                this.isPanning = true;
                this.panStart = { x: e.clientX - this.transform.x, y: e.clientY - this.transform.y };
                this.svg.style.cursor = 'grabbing';
            }
        });

        document.addEventListener('mousemove', (e) => {
            if (this.isPanning) {
                this.transform.x = e.clientX - this.panStart.x;
                this.transform.y = e.clientY - this.panStart.y;
                this.applyTransform();
            }
        });

        document.addEventListener('mouseup', () => {
            if (this.isPanning) {
                this.isPanning = false;
                this.svg.style.cursor = 'grab';
            }
        });

        // ========== TOUCH EVENTS FOR MOBILE ==========

        // Touch pan on canvas
        this.svg.addEventListener('touchstart', (e) => {
            // Only handle single finger touch for panning
            if (e.touches.length === 1) {
                const touch = e.touches[0];
                const target = document.elementFromPoint(touch.clientX, touch.clientY);

                // Only pan on empty space (not on nodes)
                if (target === this.svg || target.id === 'canvas-group' ||
                    target.tagName === 'line' || target.tagName === 'path' ||
                    target.closest('#lines-layer')) {

                    e.preventDefault();
                    this.isPanning = true;
                    this.panStart = {
                        x: touch.clientX - this.transform.x,
                        y: touch.clientY - this.transform.y
                    };
                }
            }
            // Two finger touch for pinch zoom
            else if (e.touches.length === 2) {
                e.preventDefault();
                this.isPanning = false;
                this.pinchStart = this.getPinchDistance(e.touches);
                this.pinchStartScale = this.transform.scale;
            }
        }, { passive: false });

        this.svg.addEventListener('touchmove', (e) => {
            if (this.isPanning && e.touches.length === 1) {
                e.preventDefault();
                const touch = e.touches[0];
                this.transform.x = touch.clientX - this.panStart.x;
                this.transform.y = touch.clientY - this.panStart.y;
                this.applyTransform();
            }
            // Pinch zoom
            else if (e.touches.length === 2 && this.pinchStart) {
                e.preventDefault();
                const currentDistance = this.getPinchDistance(e.touches);
                const scale = (currentDistance / this.pinchStart) * this.pinchStartScale;
                this.transform.scale = Math.min(Math.max(scale, 0.2), 3);
                this.applyTransform();
            }
        }, { passive: false });

        this.svg.addEventListener('touchend', (e) => {
            if (e.touches.length === 0) {
                this.isPanning = false;
                this.pinchStart = null;
            }
        });

        this.svg.addEventListener('touchcancel', () => {
            this.isPanning = false;
            this.pinchStart = null;
        });
    },

    // Helper for pinch zoom
    getPinchDistance(touches) {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    },

    initDrag() {
        // Node dragging is handled in the render method via event listeners
    },

    applyTransform() {
        if (!this.canvasGroup) {
            console.warn('Canvas group not initialized');
            return;
        }
        this.canvasGroup.setAttribute('transform',
            `translate(${this.transform.x}, ${this.transform.y}) scale(${this.transform.scale})`
        );
    },

    centerView() {
        const container = document.getElementById('canvas-container');
        if (!container) {
            console.warn('Canvas container not found');
            return;
        }
        const rect = container.getBoundingClientRect();
        this.transform.x = rect.width / 2;
        this.transform.y = 100;
        this.transform.scale = 1;
        this.applyTransform();
    },

    render() {
        // Ensure elements are initialized
        if (!this.linesLayer || !this.nodesLayer) {
            console.warn('Tree renderer layers not initialized, attempting to initialize...');
            this.svg = document.getElementById('tree-canvas');
            this.canvasGroup = document.getElementById('canvas-group');
            this.linesLayer = document.getElementById('lines-layer');
            this.nodesLayer = document.getElementById('nodes-layer');

            if (!this.linesLayer || !this.nodesLayer) {
                console.error('Failed to initialize tree renderer layers');
                return;
            }
        }

        const persons = AppState.tree.persons;
        const marriages = AppState.tree.marriages;
        const parentChild = AppState.tree.parent_child;

        // Clear layers
        this.linesLayer.innerHTML = '';
        this.nodesLayer.innerHTML = '';

        if (Object.keys(persons).length === 0) {
            return;
        }

        // Draw marriage lines
        Object.values(marriages).forEach(marriage => {
            const p1 = persons[marriage.spouse1_id];
            const p2 = persons[marriage.spouse2_id];

            if (p1 && p2) {
                this.drawMarriageLine(p1, p2, marriage.id);
            }
        });

        // Draw parent-child lines
        parentChild.forEach(pc => {
            const parent = persons[pc.parent_id];
            const child = persons[pc.child_id];

            if (parent && child) {
                // Check if this child belongs to a marriage
                let marriageCenterX = null;
                let marriageCenterY = null;

                if (pc.marriage_id && marriages[pc.marriage_id]) {
                    const m = marriages[pc.marriage_id];
                    const spouse1 = persons[m.spouse1_id];
                    const spouse2 = persons[m.spouse2_id];

                    if (spouse1 && spouse2) {
                        marriageCenterX = (spouse1.x + spouse2.x) / 2;
                        marriageCenterY = (spouse1.y + spouse2.y) / 2;
                    }
                }

                this.drawChildLine(parent, child, marriageCenterX, marriageCenterY);
            }
        });

        // Draw nodes
        Object.values(persons).forEach(person => {
            this.drawNode(person);
        });
    },

    drawMarriageLine(p1, p2, marriageId) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');

        // Calculate photo offsets for both spouses
        const photoSize = window.photoSize || 40;
        const p1HasPhoto = p1.photo_path && p1.photo_path.trim() !== '';
        const p2HasPhoto = p2.photo_path && p2.photo_path.trim() !== '';
        const p1PhotoOffset = p1HasPhoto ? (photoSize + 5) / 2 : 0;
        const p2PhotoOffset = p2HasPhoto ? (photoSize + 5) / 2 : 0;

        const x1 = p1.x;
        const y1 = p1.y + p1PhotoOffset;
        const x2 = p2.x;
        const y2 = p2.y + p2PhotoOffset;

        // Connect to center of rectangle (which is shifted down if photo exists)
        line.setAttribute('x1', x1);
        line.setAttribute('y1', y1);
        line.setAttribute('x2', x2);
        line.setAttribute('y2', y2);
        line.setAttribute('class', 'marriage-line');
        line.setAttribute('data-marriage-id', marriageId);

        // Add double-click handler to edit marriage
        line.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            Forms.openEditMarriageModal(marriageId);
        });

        line.style.cursor = 'pointer';
        this.linesLayer.appendChild(line);

        // Add marriage date label if available
        const marriage = AppState.tree.marriages[marriageId];
        const marriageDate = marriage && (marriage.marriage_date || marriage.date);
        if (marriageDate) {
            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;

            // Background rectangle for better readability
            const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            const dateText = `⚭ ${marriageDate}`;
            const textWidth = dateText.length * 6; // Approximate width

            bg.setAttribute('x', midX - textWidth / 2 - 4);
            bg.setAttribute('y', midY - 10);
            bg.setAttribute('width', textWidth + 8);
            bg.setAttribute('height', 16);
            bg.setAttribute('fill', 'white');
            bg.setAttribute('stroke', '#999');
            bg.setAttribute('stroke-width', '1');
            bg.setAttribute('rx', '3');
            bg.style.cursor = 'pointer';

            // Add click handler to background
            bg.addEventListener('click', (e) => {
                e.stopPropagation();
                Forms.openEditMarriageModal(marriageId);
            });

            this.linesLayer.appendChild(bg);

            // Date text
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', midX);
            text.setAttribute('y', midY + 3);
            text.setAttribute('class', 'marriage-date');
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('font-size', '10px');
            text.setAttribute('fill', '#333');
            const fontFamily = getComputedStyle(document.documentElement).getPropertyValue('--node-font-family').trim() || 'system-ui, -apple-system, sans-serif';
            text.setAttribute('font-family', fontFamily);
            text.textContent = dateText;
            text.style.cursor = 'pointer';
            text.style.pointerEvents = 'none'; // Let clicks pass through to background

            this.linesLayer.appendChild(text);
        }
    },

    drawChildLine(parent, child, marriageCenterX, marriageCenterY) {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');

        // Check if parent/child have photos for offset calculation
        const parentHasPhoto = parent.photo_path && parent.photo_path.trim() !== '';
        const childHasPhoto = child.photo_path && child.photo_path.trim() !== '';
        const photoSize = window.photoSize || 40;
        const parentPhotoOffset = parentHasPhoto ? (photoSize + 5) / 2 : 0;
        const childPhotoOffset = childHasPhoto ? photoSize + 5 : 0;

        let startX, startY;

        if (marriageCenterX !== null && marriageCenterY !== null) {
            startX = marriageCenterX;
            startY = marriageCenterY + parentPhotoOffset;
        } else {
            startX = parent.x;
            startY = parent.y + this.nodeHeight / 2 + parentPhotoOffset;
        }

        const endX = child.x;
        // End at top of photo if present, otherwise top of rectangle
        const endY = child.y - this.nodeHeight / 2 - childPhotoOffset / 2;
        const midY = (startY + endY) / 2;
        const d = `M ${startX} ${startY} C ${startX} ${midY}, ${endX} ${midY}, ${endX} ${endY}`;
        path.setAttribute('d', d);
        path.setAttribute('class', 'child-line');
        path.setAttribute('fill', 'none');
        this.linesLayer.appendChild(path);
    },

    drawNode(person) {
        const isSelected = AppState.selectedPersonIds.has(person.id) || AppState.selectedPersonId === person.id;
        const hasPhoto = person.photo_path && person.photo_path.trim() !== '';
        const photoSize = window.photoSize || 40; // Use saved photo size or default
        const photoOffset = hasPhoto ? photoSize + 5 : 0; // Extra height for photo

        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('class', `node ${isSelected ? 'node-selected' : ''}`);
        g.setAttribute('data-person-id', person.id);
        g.setAttribute('transform', `translate(${person.x - this.nodeWidth / 2}, ${person.y - this.nodeHeight / 2 - photoOffset / 2})`);

        // Photo (circular, above the rectangle)
        if (hasPhoto) {
            // Get just the filename from photo_path
            const photoFilename = person.photo_path.split('/').pop();

            // Use foreignObject for better image rendering
            const foreignObj = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
            foreignObj.setAttribute('x', (this.nodeWidth - photoSize) / 2);
            foreignObj.setAttribute('y', 0);
            foreignObj.setAttribute('width', photoSize);
            foreignObj.setAttribute('height', photoSize);

            const imgContainer = document.createElement('div');
            imgContainer.style.cssText = `
                width: ${photoSize}px;
                height: ${photoSize}px;
                border-radius: 50%;
                overflow: hidden;
                border: 2px solid #999;
                background: #fff;
            `;

            const img = document.createElement('img');
            img.src = `/uploads/${photoFilename}`;
            img.style.cssText = `
                width: 100%;
                height: 100%;
                object-fit: cover;
            `;
            img.onerror = () => {
                // Hide if image fails to load
                foreignObj.style.display = 'none';
            };

            imgContainer.appendChild(img);
            foreignObj.appendChild(imgContainer);
            g.appendChild(foreignObj);
        }

        // Rectangle (shifted down if photo exists)
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('y', photoOffset);
        rect.setAttribute('width', this.nodeWidth);
        rect.setAttribute('height', this.nodeHeight);
        rect.setAttribute('rx', '4');
        rect.setAttribute('class', `node-rect ${person.gender}`);
        g.appendChild(rect);

        // Name (shifted down if photo exists)
        const name = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        name.setAttribute('x', this.nodeWidth / 2);
        name.setAttribute('y', photoOffset + 24);
        name.setAttribute('class', 'node-text');
        // Explicitly set font-family from CSS variable
        const fontFamily = getComputedStyle(document.documentElement).getPropertyValue('--node-font-family').trim() || 'system-ui, -apple-system, sans-serif';
        name.setAttribute('font-family', fontFamily);
        name.textContent = this.truncateName(person.name, 16);
        g.appendChild(name);

        // Dates (shifted down if photo exists)
        if (person.date_of_birth || person.date_of_death) {
            const dates = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            dates.setAttribute('x', this.nodeWidth / 2);
            dates.setAttribute('y', photoOffset + 42);
            dates.setAttribute('class', 'node-date');
            dates.setAttribute('font-family', fontFamily);

            let dateText = '';
            if (person.date_of_birth) dateText += `b.${person.date_of_birth}`;
            if (person.date_of_death) dateText += ` d.${person.date_of_death}`;
            dates.textContent = this.truncateName(dateText.trim(), 20);
            g.appendChild(dates);
        }

        // Event listeners - Mouse
        g.addEventListener('mousedown', (e) => {
            e.stopPropagation();

            // Handle selection
            if (e.ctrlKey || e.metaKey) {
                // Toggle selection
                if (AppState.selectedPersonIds.has(person.id)) {
                    AppState.selectedPersonIds.delete(person.id);
                } else {
                    AppState.selectedPersonIds.add(person.id);
                }
            } else {
                // If not holding Ctrl and not dragging a currently selected node, clear others
                if (!AppState.selectedPersonIds.has(person.id)) {
                    AppState.selectedPersonIds.clear();
                    AppState.selectedPersonIds.add(person.id);
                }
                // If dragging a selected node, we keep the group selection
            }

            AppState.selectedPersonId = person.id; // Keep primary selection for details
            this.render(); // Re-render to show selection

            this.startDrag(person.id, e);
        });

        // Event listeners - Touch (for mobile)
        g.addEventListener('touchstart', (e) => {
            e.stopPropagation();
            e.preventDefault(); // Prevent scrolling when touching nodes

            const touch = e.touches[0];

            // Select the node
            if (!AppState.selectedPersonIds.has(person.id)) {
                AppState.selectedPersonIds.clear();
                AppState.selectedPersonIds.add(person.id);
            }
            AppState.selectedPersonId = person.id;
            this.render();

            // Start touch drag
            this.startTouchDrag(person.id, touch);
        }, { passive: false });

        g.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            // Select if not selected
            if (!AppState.selectedPersonIds.has(person.id)) {
                AppState.selectedPersonIds.clear();
                AppState.selectedPersonIds.add(person.id);
                AppState.selectedPersonId = person.id;
                this.render();
            }
            showContextMenu(e.clientX, e.clientY, person.id);
        });

        this.nodesLayer.appendChild(g);
    },

    truncateName(name, maxLen) {
        if (name.length <= maxLen) return name;
        return name.substring(0, maxLen - 2) + '...';
    },

    startDrag(personId, e) {
        this.isDragging = false;
        this.draggedNodeId = personId;

        const rect = this.svg.getBoundingClientRect();
        const startMouseX = (e.clientX - rect.left - this.transform.x) / this.transform.scale;
        const startMouseY = (e.clientY - rect.top - this.transform.y) / this.transform.scale;

        // Store initial positions of all selected nodes
        const initialPositions = new Map();
        AppState.selectedPersonIds.forEach(id => {
            const p = AppState.tree.persons[id];
            if (p) {
                initialPositions.set(id, { x: p.x, y: p.y });
            }
        });

        const moveHandler = (e) => {
            const rect = this.svg.getBoundingClientRect();
            const currentMouseX = (e.clientX - rect.left - this.transform.x) / this.transform.scale;
            const currentMouseY = (e.clientY - rect.top - this.transform.y) / this.transform.scale;

            const dx = currentMouseX - startMouseX;
            const dy = currentMouseY - startMouseY;

            // Check if actually dragging (moved more than 5 pixels)
            if (!this.isDragging) {
                if (Math.sqrt(dx * dx + dy * dy) > 5) {
                    this.isDragging = true;
                }
            }

            if (this.isDragging) {
                // Update all selected nodes
                initialPositions.forEach((pos, id) => {
                    if (AppState.tree.persons[id]) {
                        AppState.tree.persons[id].x = pos.x + dx;
                        AppState.tree.persons[id].y = pos.y + dy;
                    }
                });
                this.render();
            }
        };

        const upHandler = async () => {
            document.removeEventListener('mousemove', moveHandler);
            document.removeEventListener('mouseup', upHandler);

            if (this.isDragging) {
                // Save positions to server
                try {
                    const updates = [];
                    AppState.selectedPersonIds.forEach(id => {
                        const p = AppState.tree.persons[id];
                        if (p) {
                            updates.push({ id: p.id, x: p.x, y: p.y });
                        }
                    });

                    if (updates.length > 0) {
                        await API.updatePositions(updates);
                    }
                } catch (error) {
                    console.error('Failed to save positions:', error);
                    showToast('Failed to save positions', 'error');
                }
            } else {
                // Click (no drag)
                // If single selection, show details
                if (AppState.selectedPersonIds.size <= 1) {
                    if (typeof showPersonDetails === 'function') {
                        showPersonDetails(personId);
                    }
                }
            }

            this.draggedNodeId = null;
            setTimeout(() => { this.isDragging = false; }, 0);
        };

        document.addEventListener('mousemove', moveHandler);
        document.addEventListener('mouseup', upHandler);
    },

    // Touch-based node dragging for mobile
    startTouchDrag(personId, touch) {
        this.isDragging = false;
        this.draggedNodeId = personId;

        const rect = this.svg.getBoundingClientRect();
        const startTouchX = (touch.clientX - rect.left - this.transform.x) / this.transform.scale;
        const startTouchY = (touch.clientY - rect.top - this.transform.y) / this.transform.scale;

        // Store initial positions of all selected nodes
        const initialPositions = new Map();
        AppState.selectedPersonIds.forEach(id => {
            const p = AppState.tree.persons[id];
            if (p) {
                initialPositions.set(id, { x: p.x, y: p.y });
            }
        });

        const touchMoveHandler = (e) => {
            if (e.touches.length !== 1) return;

            const touch = e.touches[0];
            const rect = this.svg.getBoundingClientRect();
            const currentTouchX = (touch.clientX - rect.left - this.transform.x) / this.transform.scale;
            const currentTouchY = (touch.clientY - rect.top - this.transform.y) / this.transform.scale;

            const dx = currentTouchX - startTouchX;
            const dy = currentTouchY - startTouchY;

            // Check if actually dragging (moved more than 5 pixels)
            if (!this.isDragging) {
                if (Math.sqrt(dx * dx + dy * dy) > 5) {
                    this.isDragging = true;
                }
            }

            if (this.isDragging) {
                e.preventDefault();
                // Update all selected nodes
                initialPositions.forEach((pos, id) => {
                    if (AppState.tree.persons[id]) {
                        AppState.tree.persons[id].x = pos.x + dx;
                        AppState.tree.persons[id].y = pos.y + dy;
                    }
                });
                this.render();
            }
        };

        const touchEndHandler = async () => {
            document.removeEventListener('touchmove', touchMoveHandler);
            document.removeEventListener('touchend', touchEndHandler);
            document.removeEventListener('touchcancel', touchEndHandler);

            if (this.isDragging) {
                // Save positions to server
                try {
                    const updates = [];
                    AppState.selectedPersonIds.forEach(id => {
                        const p = AppState.tree.persons[id];
                        if (p) {
                            updates.push({ id: p.id, x: p.x, y: p.y });
                        }
                    });

                    if (updates.length > 0) {
                        await API.updatePositions(updates);
                    }
                } catch (error) {
                    console.error('Failed to save positions:', error);
                    showToast('Failed to save positions', 'error');
                }
            } else {
                // Tap (no drag) - show details
                if (AppState.selectedPersonIds.size <= 1) {
                    if (typeof showPersonDetails === 'function') {
                        showPersonDetails(personId);
                    }
                }
            }

            this.draggedNodeId = null;
            setTimeout(() => { this.isDragging = false; }, 0);
        };

        document.addEventListener('touchmove', touchMoveHandler, { passive: false });
        document.addEventListener('touchend', touchEndHandler);
        document.addEventListener('touchcancel', touchEndHandler);
    }
};

// Export
window.TreeRenderer = TreeRenderer;
