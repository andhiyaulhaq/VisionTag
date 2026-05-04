import { state } from './state.js';
import { CanvasEngine } from './canvas.js';
import { YoloHelper } from './yolo.js';

/**
 * VisionTag Main Entry Point
 */
class App {
    constructor() {
        this.initUI();
        this.canvasEngine = new CanvasEngine('main-canvas');
        this.initEventListeners();
        this.initStateListeners();
        this.initClickLogger();
        this.initGlobalErrorHandling();

        console.log('🚀 VisionTag Initialized');
    }

    initGlobalErrorHandling() {
        window.onerror = (msg, url, line) => {
            this.updateStatus(`❌ Error: ${msg} (Line: ${line})`, true);
            return false;
        };

        window.onunhandledrejection = (event) => {
            this.updateStatus(`❌ Async Error: ${event.reason}`, true);
        };
    }

    initClickLogger() {
        window.addEventListener('click', (e) => {
            const target = e.target;
            const logEntry = {
                timestamp: new Date().toISOString(),
                element: target.tagName,
                id: target.id || 'no-id',
                classes: Array.from(target.classList).join(' '),
                mode: state.data.mode,
                currentImage: state.currentImage?.name || 'none'
            };
            console.log('🖱️ Click Log:', logEntry);
        }, true); // Use capture phase to catch all clicks
    }

    initUI() {
        // Cache DOM elements
        this.dom = {
            btnOpen: document.getElementById('btn-open'),
            btnDraw: document.getElementById('btn-draw'),
            btnSelect: document.getElementById('btn-select'),
            btnPrev: document.getElementById('btn-prev'),
            btnNext: document.getElementById('btn-next'),
            imageCounter: document.getElementById('image-counter'),
            fileCountBadge: document.getElementById('file-count'),
            imageList: document.getElementById('image-list'),
            classList: document.getElementById('class-list'),
            annotationList: document.getElementById('annotation-list'),
            boxCountBadge: document.getElementById('box-count'),
            statusMessage: document.getElementById('status-message'),
            zoomDisplay: document.getElementById('zoom-display'),
            btnAddClass: document.getElementById('btn-add-class'),
            
            // Modal Elements
            modal: document.getElementById('modal-container'),
            modalTitle: document.getElementById('modal-title'),
            modalMessage: document.getElementById('modal-message'),
            modalInput: document.getElementById('modal-input'),
            modalConfirm: document.getElementById('modal-confirm'),
            modalCancel: document.getElementById('modal-cancel')
        };
    }

    initEventListeners() {
        // Mode switching
        this.dom.btnDraw.addEventListener('click', () => state.set({ mode: 'draw' }));
        this.dom.btnSelect.addEventListener('click', () => state.set({ mode: 'select' }));

        // Folder opening
        this.dom.btnOpen.addEventListener('click', () => this.handleOpenFolder());

        // Handle empty class drawing request
        window.addEventListener('request-new-class', (e) => this.promptForFirstClass(e));

        // Class management
        // Responsive Resize
        window.addEventListener('resize', () => {
            if (state.data.currentImageBitmap) {
                this.fitImageToCanvas(state.data.currentImageBitmap);
            }
        });

        // Class management
        this.dom.btnAddClass.addEventListener('click', () => this.handleAddClass());

        // Keyboard shortcuts
        window.addEventListener('keydown', (e) => {
            // Ignore if user is typing in an input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            
            const key = e.key.toLowerCase();
            if (key === 'w') state.set({ mode: 'draw' });
            if (key === 'v') state.set({ mode: 'select' });
            if (key === 'd') this.nextImage();
            if (key === 'a') this.prevImage();
            if (key === 'delete' || key === 'backspace') this.deleteSelectedBox();

            // Quick Class Assignment (1-9)
            if (/^[1-9]$/.test(key)) {
                this.assignClassToSelected(parseInt(key) - 1);
            }
        });

        this.dom.btnNext.addEventListener('click', () => this.nextImage());
        this.dom.btnPrev.addEventListener('click', () => this.prevImage());
    }

    deleteSelectedBox() {
        const { selectedBoxId, annotations } = state.data;
        if (!selectedBoxId) return;

        state.set({
            annotations: annotations.filter(b => b.id !== selectedBoxId),
            selectedBoxId: null
        });
    }

    nextImage() {
        const nextIdx = (state.data.currentImageIndex + 1) % state.data.images.length;
        state.set({ currentImageIndex: nextIdx });
    }

    prevImage() {
        const prevIdx = (state.data.currentImageIndex - 1 + state.data.images.length) % state.data.images.length;
        state.set({ currentImageIndex: prevIdx });
    }

    initStateListeners() {
        state.subscribe((data, oldData) => {
            // Update UI based on mode
            if (data.mode !== oldData.mode) {
                this.dom.btnDraw.classList.toggle('active', data.mode === 'draw');
                this.dom.btnSelect.classList.toggle('active', data.mode === 'select');
                this.updateStatus(`Mode: ${data.mode.toUpperCase()}`);
            }

            // Update image counter
            if (data.images.length !== oldData.images.length || data.currentImageIndex !== oldData.currentImageIndex) {
                this.dom.imageCounter.textContent = `${data.currentImageIndex + 1} / ${data.images.length}`;
                this.dom.fileCountBadge.textContent = `${data.images.length} items`;

                if (data.currentImageIndex !== oldData.currentImageIndex) {
                    if (oldData.currentImageIndex !== -1) {
                        this.saveAnnotations(oldData.currentImageIndex, oldData.annotations);
                    }
                    this.loadImage(data.currentImageIndex);
                }
            }

            if (data.zoom !== oldData.zoom) {
                this.dom.zoomDisplay.textContent = `${Math.round(data.zoom * 100)}%`;
            }

            if (data.classes !== oldData.classes) {
                this.renderClassList(data.classes, data.selectedClassId);
            } else if (data.selectedClassId !== oldData.selectedClassId) {
                this.updateClassSelection(data.selectedClassId);
            }

            if (data.annotations !== oldData.annotations) {
                this.renderAnnotationList(data.annotations, data.selectedBoxId);
                this.dom.boxCountBadge.textContent = data.annotations.length;
            } else if (data.selectedBoxId !== oldData.selectedBoxId) {
                this.updateAnnotationSelection(data.selectedBoxId);
            }

            if (data.loading !== oldData.loading) {
                document.getElementById('loading-overlay').classList.toggle('hidden', !data.loading);
            }
        });
    }

    async loadImage(index) {
        const imageInfo = state.data.images[index];
        if (!imageInfo) return;

        try {
            state.set({ loading: true, statusMessage: `Loading ${imageInfo.name}...` });

            const file = await imageInfo.handle.getFile();
            const bitmap = await createImageBitmap(file);

            // 1. Load existing annotations
            const annotations = await this.loadAnnotations(imageInfo.name);

            // 2. Auto-center and fit image on first load
            this.fitImageToCanvas(bitmap);

            state.set({
                currentImageBitmap: bitmap,
                annotations: annotations || [],
                loading: false,
                statusMessage: `Loaded: ${imageInfo.name}`
            });
        } catch (err) {
            console.error('Failed to load image:', err);
            this.updateStatus('Error loading image', true);
        }
    }

    fitImageToCanvas(bitmap) {
        const container = document.getElementById('workspace').getBoundingClientRect();
        const padding = 40;

        const availableWidth = container.width - padding * 2;
        const availableHeight = container.height - padding * 2;

        const scaleX = availableWidth / bitmap.width;
        const scaleY = availableHeight / bitmap.height;
        const zoom = Math.min(scaleX, scaleY); // Allow upscaling

        const panX = (container.width - bitmap.width * zoom) / 2;
        const panY = (container.height - bitmap.height * zoom) / 2;

        state.set({ zoom, pan: { x: panX, y: panY } });
    }

    async handleOpenFolder() {
        try {
            const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
            state.set({ loading: true, statusMessage: 'Reading folder...' });

            // Try to load classes.txt from root
            await this.loadClasses(handle);

            // Get or create label folder
            const labelHandle = await handle.getDirectoryHandle('label', { create: true });

            const images = [];
            for await (const entry of handle.values()) {
                if (entry.kind === 'file' && /\.(jpe?g|png|webp)$/i.test(entry.name)) {
                    // Check if labeled (looking inside label folder)
                    const txtName = entry.name.replace(/\.[^/.]+$/, "") + ".txt";
                    let isLabeled = false;
                    try { await labelHandle.getFileHandle(txtName); isLabeled = true; } catch (e) { }

                    images.push({
                        name: entry.name,
                        handle: entry,
                        status: isLabeled ? 'labeled' : 'pending'
                    });
                }
            }

            images.sort((a, b) => a.name.localeCompare(b.name));

            state.set({
                folderHandle: handle,
                labelFolderHandle: labelHandle,
                images,
                currentImageIndex: images.length > 0 ? 0 : -1,
                loading: false
            });

            this.updateStatus(`Loaded ${images.length} images`);
            this.renderImageList(images);

        } catch (err) {
            console.error('Failed to open folder:', err);
            this.updateStatus('Access denied or folder empty', true);
        }
    }

    async loadClasses(folderHandle) {
        try {
            const fileHandle = await folderHandle.getFileHandle('classes.txt');
            const file = await fileHandle.getFile();
            const content = await file.text();
            const classes = YoloHelper.parseClasses(content);
            if (classes.length > 0) {
                state.set({ classes, selectedClassId: classes[0].id });
            } else {
                state.set({ classes: [], selectedClassId: null });
            }
        } catch (e) {
            state.set({ classes: [], selectedClassId: null });
            console.log('No classes.txt found, starting empty.');
        }
    }

    async loadAnnotations(imgName) {
        const txtName = imgName.replace(/\.[^/.]+$/, "") + ".txt";
        try {
            const fileHandle = await state.data.labelFolderHandle.getFileHandle(txtName);
            const file = await fileHandle.getFile();
            const content = await file.text();

            const bitmap = state.data.currentImageBitmap;
            return content.split('\n')
                .map(line => YoloHelper.fromYolo(line, bitmap.width, bitmap.height))
                .filter(b => b !== null);
        } catch (e) {
            return [];
        }
    }

    async saveAnnotations(index, annotations) {
        if (!state.data.labelFolderHandle || annotations.length === 0) return;

        const imgInfo = state.data.images[index];
        const txtName = imgInfo.name.replace(/\.[^/.]+$/, "") + ".txt";
        const bitmap = state.data.currentImageBitmap;

        try {
            const content = annotations
                .map(box => YoloHelper.toYolo(box, bitmap.width, bitmap.height))
                .join('\n');

            const fileHandle = await state.data.labelFolderHandle.getFileHandle(txtName, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(content);
            await writable.close();

            // Update status in list
            const newImages = [...state.data.images];
            newImages[index].status = 'labeled';
            state.set({ images: newImages });
            this.renderImageList(newImages);

            this.updateStatus(`Saved: label/${txtName}`);
        } catch (err) {
            console.error('Failed to save:', err);
        }
    }

    renderImageList(images) {
        if (images.length === 0) {
            this.dom.imageList.innerHTML = '<div class="empty-state">No images found</div>';
            return;
        }

        this.dom.imageList.innerHTML = images.map((img, idx) => `
            <div class="image-item ${idx === state.data.currentImageIndex ? 'active' : ''}" data-index="${idx}">
                <span class="img-name">${img.name}</span>
                <span class="status-dot ${img.status}"></span>
            </div>
        `).join('');

        // Add click listeners to items
        this.dom.imageList.querySelectorAll('.image-item').forEach(item => {
            item.addEventListener('click', () => {
                const index = parseInt(item.dataset.index);
                state.set({ currentImageIndex: index });
            });
        });
    }

    renderClassList(classes, selectedId) {
        this.dom.classList.innerHTML = classes.map(cls => `
            <div class="class-item ${cls.id === selectedId ? 'active' : ''}" data-id="${cls.id}">
                <span class="class-color" style="background-color: ${cls.color}"></span>
                <span class="class-name" title="Double-click to rename">${cls.name}</span>
                <span class="class-id">${cls.id}</span>
                <button class="btn-delete-class" title="Delete Class">&times;</button>
            </div>
        `).join('');

        this.dom.classList.querySelectorAll('.class-item').forEach(item => {
            const nameSpan = item.querySelector('.class-name');
            const deleteBtn = item.querySelector('.btn-delete-class');
            const id = parseInt(item.dataset.id);

            // Select or Reassign Class
            item.addEventListener('click', (e) => {
                if (e.target.tagName !== 'INPUT' && !e.target.classList.contains('btn-delete-class')) {
                    if (state.data.selectedBoxId !== null) {
                        this.reassignSelectedBox(id);
                    } else {
                        state.set({ selectedClassId: id });
                    }
                }
            });

            // Delete Class
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.handleDeleteClass(id);
            });

            // Double-click to rename
            nameSpan.addEventListener('dblclick', () => {
                const input = document.createElement('input');
                input.value = nameSpan.textContent;
                input.className = 'class-rename-input';
                
                nameSpan.replaceWith(input);
                input.focus();

                const finishRename = () => {
                    const newName = input.value.trim() || nameSpan.textContent;
                    const newClasses = state.data.classes.map(c => 
                        c.id === id ? { ...c, name: newName } : c
                    );
                    state.set({ classes: newClasses });
                    this.saveClasses(newClasses);
                };

                input.addEventListener('blur', finishRename);
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') finishRename();
                });
            });
        });
    }

    assignClassToSelected(classIndex) {
        const cls = state.data.classes[classIndex];
        if (cls && state.data.selectedBoxId !== null) {
            this.reassignSelectedBox(cls.id);
        } else if (cls) {
            state.set({ selectedClassId: cls.id });
            this.updateStatus(`Selected Class: ${cls.name}`);
        }
    }

    reassignSelectedBox(newClassId) {
        const { selectedBoxId, annotations } = state.data;
        const newAnnotations = annotations.map(box => 
            box.id === selectedBoxId ? { ...box, classId: newClassId } : box
        );
        state.set({ annotations: newAnnotations });
        this.updateStatus(`Reassigned to class ${newClassId}`);
        this.saveClasses(state.data.classes);
    }

    async handleDeleteClass(id) {
        const cls = state.data.classes.find(c => c.id === id);
        if (!cls) return;

        const confirmMsg = `🚨 DEEP CLEANUP WARNING: Deleting "${cls.name}" will remove ALL annotations of this type from EVERY image in your folder and re-index the rest. \n\nThis action cannot be undone. Proceed?`;
        
        if (confirm(confirmMsg)) {
            state.set({ loading: true, statusMessage: '🔄 Migrating dataset...' });

            try {
                // 1. Update UI and current state
                const newAnnotations = state.data.annotations.filter(box => box.classId !== id);
                const newClasses = state.data.classes
                    .filter(c => c.id !== id)
                    .map((c, index) => ({ ...c, id: index }));

                // 2. Perform Global Migration on Disk
                await this.migrateDatasetOnDelete(id);

                state.set({ 
                    classes: newClasses, 
                    annotations: newAnnotations,
                    selectedClassId: newClasses.length > 0 ? newClasses[0].id : null,
                    loading: false
                });

                await this.saveClasses(newClasses);
                this.updateStatus(`✅ Dataset fully migrated. Removed class: ${cls.name}`);
            } catch (err) {
                console.error('Migration failed:', err);
                state.set({ loading: false });
                this.updateStatus('❌ Migration failed. Some files may be out of sync.', true);
            }
        }
    }

    async migrateDatasetOnDelete(deletedId) {
        const { labelFolderHandle, images } = state.data;
        let processed = 0;

        for (const imgInfo of images) {
            const txtName = imgInfo.name.replace(/\.[^/.]+$/, "") + ".txt";
            try {
                const fileHandle = await labelFolderHandle.getFileHandle(txtName);
                const file = await fileHandle.getFile();
                const content = await file.text();

                const lines = content.split('\n').filter(line => line.trim().length > 0);
                const newLines = lines
                    .map(line => {
                        const parts = line.split(' ');
                        const classId = parseInt(parts[0]);
                        if (classId === deletedId) return null; // Remove
                        if (classId > deletedId) {
                            parts[0] = (classId - 1).toString(); // Shift down
                        }
                        return parts.join(' ');
                    })
                    .filter(line => line !== null);

                const writable = await fileHandle.createWritable();
                await writable.write(newLines.join('\n'));
                await writable.close();
            } catch (e) {
                // Skip files that don't exist
            }
            
            processed++;
            if (processed % 5 === 0) {
                state.set({ statusMessage: `🔄 Migrating: ${processed}/${images.length} files...` });
            }
        }
    }

    showModal({ title, message, placeholder, confirmText, onConfirm }) {
        this.dom.modalTitle.textContent = title;
        this.dom.modalMessage.textContent = message;
        this.dom.modalInput.placeholder = placeholder || '';
        this.dom.modalInput.value = '';
        this.dom.modalConfirm.textContent = confirmText || 'Confirm';
        
        this.dom.modal.classList.remove('hidden');
        this.dom.modalInput.focus();

        const close = () => {
            this.dom.modal.classList.add('hidden');
            this.dom.modalConfirm.onclick = null;
            this.dom.modalCancel.onclick = null;
        };

        this.dom.modalConfirm.onclick = () => {
            const val = this.dom.modalInput.value.trim();
            if (val) {
                onConfirm(val);
                close();
            }
        };

        this.dom.modalCancel.onclick = close;
        
        // Enter key to confirm
        this.dom.modalInput.onkeydown = (e) => {
            if (e.key === 'Enter') this.dom.modalConfirm.click();
            if (e.key === 'Escape') close();
        };
    }

    promptForFirstClass(event) {
        const boxId = event?.detail?.boxId;
        
        this.showModal({
            title: 'Define First Class',
            message: 'You just drew your first box! What class should this represent?',
            placeholder: 'e.g. Car, Dog, etc.',
            confirmText: 'Create & Assign',
            onConfirm: (name) => {
                const newClass = {
                    id: 0,
                    name: name,
                    color: YoloHelper.generateColor(0)
                };
                const newClasses = [newClass];
                
                // Update classes and reassign the pending box
                const newAnnotations = state.data.annotations.map(box => 
                    box.id === boxId ? { ...box, classId: 0 } : box
                );

                state.set({ 
                    classes: newClasses,
                    selectedClassId: 0,
                    annotations: newAnnotations
                });
                
                this.saveClasses(newClasses);
            }
        });
    }

    handleAddClass() {
        try {
            if (!state.data.folderHandle) {
                this.updateStatus('❌ Open a folder first', true);
                return;
            }

            const newId = state.data.classes.length;
            const newClass = {
                id: newId,
                name: `class_${newId}`,
                color: YoloHelper.generateColor(newId)
            };

            const newClasses = [...state.data.classes, newClass];
            
            state.set({ 
                classes: newClasses,
                selectedClassId: newId 
            });
            
            this.saveClasses(newClasses);
            
            const nameSpans = this.dom.classList.querySelectorAll('.class-name');
            const lastSpan = nameSpans[nameSpans.length - 1];
            if (lastSpan) {
                lastSpan.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
            }
        } catch (err) {
            this.updateStatus(`❌ Failed to add class: ${err.message}`, true);
        }
    }

    async saveClasses(classes) {
        if (!state.data.folderHandle) return;
        try {
            const content = classes.map(c => c.name).join('\n');
            const fileHandle = await state.data.folderHandle.getFileHandle('classes.txt', { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(content);
            await writable.close();
            this.updateStatus('Classes saved to disk');
        } catch (err) {
            console.error('Failed to save classes:', err);
        }
    }

    updateClassSelection(selectedId) {
        this.dom.classList.querySelectorAll('.class-item').forEach(item => {
            item.classList.toggle('active', parseInt(item.dataset.id) === selectedId);
        });
    }

    updateAnnotationSelection(selectedId) {
        this.dom.annotationList.querySelectorAll('.anno-item').forEach(item => {
            item.classList.toggle('active', parseInt(item.dataset.id) === selectedId);
        });
    }

    renderAnnotationList(annotations, selectedId) {
        const { classes } = state.data;
        if (annotations.length === 0) {
            this.dom.annotationList.innerHTML = '<div class="empty-state-small">No annotations yet</div>';
            return;
        }

        this.dom.annotationList.innerHTML = annotations.map(box => {
            const currentCls = classes.find(c => c.id === box.classId);
            const classColor = currentCls ? currentCls.color : '#ffffff';
            
            return `
                <div class="anno-item ${box.id === selectedId ? 'active' : ''}" data-id="${box.id}">
                    <span class="anno-color" style="background-color: ${classColor}"></span>
                    <select class="anno-class-select" data-box-id="${box.id}">
                        ${classes.map(cls => `
                            <option value="${cls.id}" ${cls.id === box.classId ? 'selected' : ''}>
                                ${cls.name}
                            </option>
                        `).join('')}
                        ${!currentCls ? '<option value="-1" selected disabled>Pending...</option>' : ''}
                    </select>
                    <span class="anno-coords">${Math.round(box.x)}, ${Math.round(box.y)}</span>
                </div>
            `;
        }).join('');

        // Handle selection and class switching
        this.dom.annotationList.querySelectorAll('.anno-item').forEach(item => {
            const boxId = parseInt(item.dataset.id);
            const select = item.querySelector('.anno-class-select');

            item.addEventListener('click', (e) => {
                if (e.target.tagName !== 'SELECT') {
                    state.set({ selectedBoxId: boxId });
                }
            });

            select.addEventListener('change', (e) => {
                e.stopPropagation(); // Prevent parent click
                const newClassId = parseInt(e.target.value);
                const newAnnotations = state.data.annotations.map(box => 
                    box.id === boxId ? { ...box, classId: newClassId } : box
                );
                state.set({ annotations: newAnnotations, selectedBoxId: boxId });
                this.updateStatus(`Updated box to ${classes.find(c => c.id === newClassId)?.name}`);
            });

            select.addEventListener('click', (e) => e.stopPropagation());
        });
    }

    updateStatus(msg, isError = false) {
        this.dom.statusMessage.textContent = msg;
        this.dom.statusMessage.style.color = isError ? 'var(--error)' : 'var(--text-muted)';
    }
}

// Start the app
new App();
