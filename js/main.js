import { state } from './core/state.js';
import { CanvasEngine } from './engine/canvas.js';
import { YoloHelper } from './utils/yolo.js';
import { ai } from './core/ai.js';
import './components/index.js';

// No longer using custom Web Components - reverting to raw HTML for Tailwind migration


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
        
        // Load default model
        ai.loadModel('/assets/model/yolov8n.onnx');

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
        }, true);
    }

    initUI() {
        this.dom = {
            btnOpen: document.getElementById('btn-open'),
            btnDraw: document.getElementById('btn-draw'),
            btnSelect: document.getElementById('btn-select'),
            btnPrev: document.getElementById('btn-prev'),
            btnNext: document.getElementById('btn-next'),
            btnExport: document.getElementById('btn-export'),
            imageCounter: document.getElementById('image-counter'),
            fileCountBadge: document.getElementById('file-count'),
            imageList: document.getElementById('image-list'),
            classList: document.getElementById('class-list'),
            annotationList: document.getElementById('annotation-list'),
            boxCountBadge: document.getElementById('box-count'),
            statusMessage: document.getElementById('status-message'),
            zoomDisplay: document.getElementById('zoom-display'),
            btnAddClass: document.getElementById('btn-add-class'),
            
            modal: document.getElementById('app-modal'),

            btnLoadModel: document.getElementById('btn-load-model'),
            btnAutoLabelAll: document.getElementById('btn-auto-label-all'),
            btnClearAll: document.getElementById('btn-clear-all'),
            modelStatusBadge: document.getElementById('model-status-badge'),
            aiModelName: document.getElementById('ai-model-name'),
            workspace: document.getElementById('workspace')
        };
    }

    initEventListeners() {
        this.dom.btnDraw.addEventListener('click', () => state.set({ mode: 'draw' }));
        this.dom.btnSelect.addEventListener('click', () => state.set({ mode: 'select' }));
        this.dom.btnOpen.addEventListener('click', () => this.handleOpenFolder());

        window.addEventListener('request-new-class', (e) => this.promptForFirstClass(e));

        window.addEventListener('resize', () => {
            if (state.data.currentImageBitmap) {
                this.fitImageToCanvas(state.data.currentImageBitmap);
            }
        });

        this.dom.btnAddClass.addEventListener('click', () => this.handleAddClass());
        this.dom.btnLoadModel.addEventListener('click', () => this.handleLoadCustomModel());
        this.dom.btnAutoLabelAll.addEventListener('click', () => this.handleAutoLabelDataset());
        this.dom.btnClearAll.addEventListener('click', () => this.handleClearAllAnnotations());

        window.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            const key = e.key.toLowerCase();
            
            if (e.ctrlKey && key === 'z') {
                e.preventDefault();
                if (e.shiftKey) state.redo();
                else state.undo();
                return;
            }
            if (e.ctrlKey && key === 'y') {
                e.preventDefault();
                state.redo();
                return;
            }

            if (key === 'w') state.set({ mode: 'draw' });
            if (key === 'v') state.set({ mode: 'select' });
            if (key === 'd') this.nextImage();
            if (key === 'a') this.prevImage();
            if (key === 'delete' || key === 'backspace') this.deleteSelectedBox();

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

        state.saveHistory();
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
            if (data.mode !== oldData.mode) {
                this.dom.btnDraw.classList.toggle('active', data.mode === 'draw');
                this.dom.btnSelect.classList.toggle('active', data.mode === 'select');
                if (data.mode) {
                    this.updateStatus(`Mode: ${data.mode.toUpperCase()}`);
                }
            }

            if (data.images.length !== oldData.images.length || data.currentImageIndex !== oldData.currentImageIndex) {
                this.dom.imageCounter.textContent = `${data.currentImageIndex + 1} / ${data.images.length}`;
                this.dom.fileCountBadge.textContent = `${data.images.length} items`;

                if (data.currentImageIndex !== oldData.currentImageIndex) {
                    if (oldData.currentImageIndex !== -1) {
                        this.saveAnnotations(oldData.currentImageIndex, oldData.annotations);
                    }
                    this.loadImage(data.currentImageIndex);
                    this.updateImageSelection(data.currentImageIndex);
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

            // Always update model status badge
            if (this.dom.modelStatusBadge) {
                const badge = this.dom.modelStatusBadge;
                badge.className = "px-2 py-0.5 rounded-full text-[0.7rem] border transition-all";
                
                if (data.modelStatus === 'idle') {
                    badge.classList.add("bg-gray-500/20", "text-gray-400", "border-gray-500/30");
                    badge.textContent = "Idle";
                } else if (data.modelStatus === 'loading') {
                    badge.classList.add("bg-yellow-500/20", "text-yellow-500", "border-yellow-500/30", "animate-pulse");
                    badge.textContent = "Loading...";
                } else if (data.modelStatus === 'ready') {
                    badge.classList.add("bg-green-500/20", "text-green-500", "border-green-500/30");
                    badge.textContent = "Ready";
                } else if (data.modelStatus === 'error') {
                    badge.classList.add("bg-red-500/20", "text-red-500", "border-red-500/30");
                    badge.textContent = "Error";
                }
            }
            
            // Always update button states based on folder presence
            const isFolderLoaded = !!data.folderHandle;
            if (this.dom.btnSelect) this.dom.btnSelect.disabled = !isFolderLoaded;
            if (this.dom.btnDraw) this.dom.btnDraw.disabled = !isFolderLoaded;
            if (this.dom.btnPrev) this.dom.btnPrev.disabled = !isFolderLoaded;
            if (this.dom.btnNext) this.dom.btnNext.disabled = !isFolderLoaded;
            if (this.dom.btnExport) this.dom.btnExport.disabled = !isFolderLoaded;
            if (this.dom.btnAddClass) this.dom.btnAddClass.disabled = !isFolderLoaded;
            if (this.dom.btnLoadModel) this.dom.btnLoadModel.disabled = !isFolderLoaded;
            if (this.dom.btnClearAll) this.dom.btnClearAll.disabled = !isFolderLoaded;

            // Model status still controls auto-label, but only if folder is loaded
            if (this.dom.btnAutoLabelAll) {
                this.dom.btnAutoLabelAll.disabled = data.modelStatus !== 'ready' || !isFolderLoaded;
            }
            if (data.aiModel?.name !== oldData.aiModel?.name) {
                this.dom.aiModelName.textContent = data.aiModel ? `Using: ${data.aiModel.name}` : 'No model loaded';
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
            const annotations = await this.loadAnnotations(imageInfo.name, bitmap);
            this.fitImageToCanvas(bitmap);

            state.undoStack = [];
            state.redoStack = [];
            state.saveHistory();

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
        const zoom = Math.min(availableWidth / bitmap.width, availableHeight / bitmap.height);
        const panX = (container.width - bitmap.width * zoom) / 2;
        const panY = (container.height - bitmap.height * zoom) / 2;
        state.set({ zoom, pan: { x: panX, y: panY } });
    }

    async handleOpenFolder() {
        try {
            const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
            state.set({ loading: true, statusMessage: 'Reading folder...' });
            await this.loadClasses(handle);
            const labelHandle = await handle.getDirectoryHandle('label', { create: true });
            const images = [];
            for await (const entry of handle.values()) {
                if (entry.kind === 'file' && /\.(jpe?g|png|webp)$/i.test(entry.name)) {
                    const txtName = entry.name.replace(/\.[^/.]+$/, "") + ".txt";
                    let isLabeled = false;
                    try { await labelHandle.getFileHandle(txtName); isLabeled = true; } catch (e) { }
                    images.push({ name: entry.name, handle: entry, status: isLabeled ? 'labeled' : 'pending' });
                }
            }
            images.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
            state.set({ 
                folderHandle: handle, 
                labelFolderHandle: labelHandle, 
                images, 
                currentImageIndex: images.length > 0 ? 0 : -1, 
                loading: false,
                mode: 'select'
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
            if (classes.length > 0) state.set({ classes, selectedClassId: classes[0].id });
            else state.set({ classes: [], selectedClassId: null });
        } catch (e) {
            state.set({ classes: [], selectedClassId: null });
        }
    }

    async loadAnnotations(imgName, bitmap) {
        const txtName = imgName.replace(/\.[^/.]+$/, "") + ".txt";
        try {
            const fileHandle = await state.data.labelFolderHandle.getFileHandle(txtName);
            const file = await fileHandle.getFile();
            const content = await file.text();
            return content.split('\n').map(line => YoloHelper.fromYolo(line, bitmap.width, bitmap.height)).filter(b => b !== null);
        } catch (e) { return []; }
    }

    async saveAnnotations(index, annotations, bitmap = state.data.currentImageBitmap, skipUI = false) {
        if (!state.data.labelFolderHandle || annotations.length === 0 || !bitmap) return;
        const imgInfo = state.data.images[index];
        const txtName = imgInfo.name.replace(/\.[^/.]+$/, "") + ".txt";
        try {
            const content = annotations.map(box => YoloHelper.toYolo(box, bitmap.width, bitmap.height)).join('\n');
            const fileHandle = await state.data.labelFolderHandle.getFileHandle(txtName, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(content);
            await writable.close();
            
            const newImages = [...state.data.images];
            newImages[index].status = 'labeled';
            state.set({ images: newImages });

            if (!skipUI) {
                this.renderImageList(newImages);
                this.updateStatus(`Saved: label/${txtName}`);
            }
        } catch (err) { console.error('Failed to save:', err); }
    }

    renderImageList(images) {
        if (images.length === 0) {
            this.dom.imageList.innerHTML = '<div class="empty-state">No images found</div>';
            return;
        }
        this.dom.imageList.innerHTML = images.map((img, idx) => `
            <div class="image-item group flex items-center justify-between p-2 rounded-lg text-[0.8rem] cursor-pointer transition-all gap-2.5 ${idx === state.data.currentImageIndex ? 'bg-(--accent)/15 text-(--accent-light) font-semibold shadow-sm' : 'text-(--text-secondary) hover:bg-(--bg-hover) hover:text-(--text-primary)'}" data-index="${idx}">
                <span class="truncate flex-1">${img.name}</span>
                ${img.status === 'labeled' ? '<span class="w-1.5 h-1.5 rounded-full bg-(--success) shadow-[0_0_8px_var(--success)]"></span>' : ''}
            </div>
        `).join('');
        this.dom.imageList.querySelectorAll('.image-item').forEach(item => {
            item.addEventListener('click', () => state.set({ currentImageIndex: parseInt(item.dataset.index) }));
        });
    }

    renderClassList(classes, selectedId) {
        this.dom.classList.innerHTML = classes.map(cls => `
            <div class="class-item group flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-all border ${cls.id === selectedId ? 'bg-(--accent)/15 border-(--accent) text-(--text-primary) shadow-sm' : 'border-transparent text-(--text-secondary) hover:bg-(--bg-hover)'}" data-id="${cls.id}">
                <span class="w-3.5 h-3.5 rounded-md shadow-sm shrink-0" style="background-color: ${cls.color}"></span>
                <span class="class-name flex-1 font-semibold text-[0.85rem] truncate" title="Double-click to rename">${cls.name}</span>
                <span class="text-[0.7rem] bg-(--bg-card) px-1.5 py-0.5 rounded border border-(--border) text-(--text-muted) font-mono">${cls.id}</span>
                <button class="btn-delete-class opacity-0 group-hover:opacity-100 hover:text-red-500 hover:scale-125 transition-all text-[1.2rem] leading-none px-1" title="Delete Class">&times;</button>
            </div>
        `).join('');
        this.dom.classList.querySelectorAll('.class-item').forEach(item => {
            const nameSpan = item.querySelector('.class-name');
            const id = parseInt(item.dataset.id);
            item.addEventListener('click', (e) => {
                if (e.target.tagName !== 'INPUT' && !e.target.classList.contains('btn-delete-class')) {
                    if (state.data.selectedBoxId !== null) this.reassignSelectedBox(id);
                    else state.set({ selectedClassId: id });
                }
            });
            item.querySelector('.btn-delete-class').addEventListener('click', (e) => {
                e.stopPropagation();
                this.handleDeleteClass(id);
            });
            nameSpan.addEventListener('dblclick', () => {
                const input = document.createElement('input');
                input.value = nameSpan.textContent;
                input.className = 'w-full bg-(--bg-main) text-(--text-primary) border border-(--accent) rounded px-2 py-0.5 text-[0.85rem] outline-none';
                nameSpan.replaceWith(input);
                input.focus();
                const finishRename = () => {
                    const newName = input.value.trim() || nameSpan.textContent;
                    const newClasses = state.data.classes.map(c => c.id === id ? { ...c, name: newName } : c);
                    state.set({ classes: newClasses });
                    this.saveClasses(newClasses);
                };
                input.addEventListener('blur', finishRename);
                input.addEventListener('keydown', (e) => { if (e.key === 'Enter') finishRename(); });
            });
        });
    }

    assignClassToSelected(classIndex) {
        const cls = state.data.classes[classIndex];
        if (cls && state.data.selectedBoxId !== null) this.reassignSelectedBox(cls.id);
        else if (cls) state.set({ selectedClassId: cls.id });
    }

    reassignSelectedBox(newClassId) {
        const { selectedBoxId, annotations } = state.data;
        const newAnnotations = annotations.map(box => box.id === selectedBoxId ? { ...box, classId: newClassId } : box);
        state.set({ annotations: newAnnotations });
        this.saveClasses(state.data.classes);
    }

    async handleDeleteClass(id) {
        const cls = state.data.classes.find(c => c.id === id);
        if (!cls) return;
        this.showModal({
            title: 'Delete Class Definition',
            message: `⚠️ DATA INTEGRITY ALERT: Deleting the "${cls.name}" class will permanently remove all associated bounding boxes across your entire dataset. This operation also triggers a class ID re-index. Are you certain?`,
            confirmText: 'Delete & Re-index',
            cancelText: 'Keep Class',
            onConfirm: () => this.performDeleteClassMigration(id, cls.name)
        });
    }

    async performDeleteClassMigration(id, name) {
        state.set({ loading: true, statusMessage: '🔄 Migrating dataset...' });
        try {
            const newAnnotations = state.data.annotations.filter(box => box.classId !== id);
            const newClasses = state.data.classes.filter(c => c.id !== id).map((c, idx) => ({ ...c, id: idx }));
            await this.migrateDatasetOnDelete(id);
            state.set({ classes: newClasses, annotations: newAnnotations, selectedClassId: newClasses[0]?.id || null, loading: false });
            await this.saveClasses(newClasses);
            this.updateStatus(`✅ Removed class: ${name}`);
        } catch (err) {
            console.error('Migration failed:', err);
            state.set({ loading: false });
        }
    }

    async migrateDatasetOnDelete(deletedId) {
        const { labelFolderHandle, images } = state.data;
        for (const imgInfo of images) {
            const txtName = imgInfo.name.replace(/\.[^/.]+$/, "") + ".txt";
            try {
                const fileHandle = await labelFolderHandle.getFileHandle(txtName);
                const file = await fileHandle.getFile();
                const content = await file.text();
                const newLines = content.split('\n').map(line => {
                    const parts = line.split(' ');
                    const classId = parseInt(parts[0]);
                    if (classId === deletedId) return null;
                    if (classId > deletedId) parts[0] = (classId - 1).toString();
                    return parts.join(' ');
                }).filter(l => l !== null);
                const writable = await fileHandle.createWritable();
                await writable.write(newLines.join('\n'));
                await writable.close();
            } catch (e) { }
        }
    }

    showModal({ title, message, inputPlaceholder = '', confirmText = 'Confirm', cancelText = 'Cancel', onConfirm, onCancel }) {
        const modal = this.dom.modal;
        modal.querySelector('.modal-title').textContent = title;
        modal.querySelector('.modal-message').textContent = message;
        
        const input = modal.querySelector('.modal-input');
        if (inputPlaceholder) {
            input.classList.remove('hidden');
            input.placeholder = inputPlaceholder;
            input.value = '';
            setTimeout(() => input.focus(), 100);
        } else {
            input.classList.add('hidden');
        }

        const confirmBtn = modal.querySelector('.modal-confirm');
        const cancelBtn = modal.querySelector('.modal-cancel');

        confirmBtn.textContent = confirmText;
        cancelBtn.textContent = cancelText;

        // Danger mode detection
        const isDanger = /delete|purge|irreversible|critical|nuclear|🚨|☢️/i.test(title + message);
        
        // Use toggle to avoid wiping out Tailwind utilities
        confirmBtn.classList.toggle('bg-red-600', isDanger);
        confirmBtn.classList.toggle('hover:bg-red-500', isDanger);
        confirmBtn.classList.toggle('shadow-[0_4px_12px_rgba(220,38,38,0.3)]', isDanger);
        confirmBtn.classList.toggle('bg-(--accent)', !isDanger);
        
        const card = modal.querySelector('.modal-card');
        card.classList.toggle('border-t-red-500', isDanger);
        card.classList.toggle('border-t-2', isDanger);
        card.classList.toggle('border-t-white/20', !isDanger);
        card.classList.toggle('border-t', !isDanger);

        modal.classList.remove('hidden');

        confirmBtn.onclick = () => {
            const val = input.value.trim();
            modal.classList.add('hidden');
            if (onConfirm) onConfirm(val);
        };

        cancelBtn.onclick = () => {
            modal.classList.add('hidden');
            if (onCancel) onCancel();
        };
    }

    handleAddClass() {
        this.showModal({
            title: 'Define New Class',
            message: 'Please specify a unique identifier for your new object category. This will be added to your classes.txt schema:',
            inputPlaceholder: 'e.g. Building, Tree, Pedestrian...',
            confirmText: 'Add to Schema',
            onConfirm: (name) => {
                if (!name) return;
                const newId = state.data.classes.length > 0 ? Math.max(...state.data.classes.map(c => c.id)) + 1 : 0;
                const newClasses = [...state.data.classes, { id: newId, name, color: YoloHelper.generateColor(newId) }];
                state.set({ classes: newClasses, selectedClassId: newId });
                this.saveClasses(newClasses);
            }
        });
    }

    promptForFirstClass(e) {
        const boxId = e.detail?.boxId;
        this.showModal({
            title: 'Initialize Workspace',
            message: 'Welcome to VisionTag. To begin labeling, please define your primary object class. This will serve as the initial category for your dataset.',
            inputPlaceholder: 'e.g. Car, Dog, License Plate...',
            confirmText: 'Initialize Class',
            onConfirm: (name) => {
                if (!name) return;
                const newClasses = [{ id: 0, name, color: YoloHelper.generateColor(0) }];
                let annotations = state.data.annotations;
                if (boxId) annotations = annotations.map(b => b.id === boxId ? { ...b, classId: 0 } : b);
                state.set({ classes: newClasses, selectedClassId: 0, annotations });
                this.saveClasses(newClasses);
            }
        });
    }

    async saveClasses(classes) {
        if (!state.data.folderHandle) return;
        try {
            const content = classes.map(c => c.name).join('\n');
            const fileHandle = await state.data.folderHandle.getFileHandle('classes.txt', { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(content);
            await writable.close();
        } catch (err) { console.error('Failed to save classes:', err); }
    }

    updateImageSelection(index) {
        this.dom.imageList.querySelectorAll('.image-item').forEach((item, idx) => {
            const isActive = idx === index;
            item.classList.toggle('bg-(--accent)/15', isActive);
            item.classList.toggle('text-(--accent-light)', isActive);
            item.classList.toggle('font-semibold', isActive);
            item.classList.toggle('shadow-sm', isActive);
            item.classList.toggle('text-(--text-secondary)', !isActive);
            if (isActive) item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
    }

    updateClassSelection(selectedId) {
        this.dom.classList.querySelectorAll('.class-item').forEach(item => {
            const isActive = parseInt(item.dataset.id) === selectedId;
            item.classList.toggle('bg-(--accent)/15', isActive);
            item.classList.toggle('border-(--accent)', isActive);
            item.classList.toggle('text-(--text-primary)', isActive);
            item.classList.toggle('shadow-sm', isActive);
        });
    }

    updateAnnotationSelection(selectedId) {
        this.dom.annotationList.querySelectorAll('.anno-item').forEach(item => {
            const isActive = parseInt(item.dataset.id) === selectedId;
            item.classList.toggle('bg-(--bg-card)', isActive);
            item.classList.toggle('border-(--border)', isActive);
            item.classList.toggle('text-(--text-primary)', isActive);
            item.classList.toggle('shadow-sm', isActive);
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
            return `
                <div class="anno-item group flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-all border ${box.id === selectedId ? 'bg-(--bg-card) border-(--border) text-(--text-primary) shadow-sm' : 'border-transparent text-(--text-secondary) hover:bg-(--bg-hover)'}" data-id="${box.id}">
                    <span class="w-3.5 h-3.5 rounded-md shadow-sm shrink-0" style="background-color: ${currentCls?.color || '#ffffff'}"></span>
                    <select class="anno-class-select flex-1 bg-transparent border-none text-(--text-primary) text-[0.85rem] outline-none cursor-pointer p-1 rounded hover:bg-(--bg-main) hover:ring-1 hover:ring-(--border)" data-box-id="${box.id}">
                        ${classes.map(cls => `<option value="${cls.id}" ${cls.id === box.classId ? 'selected' : ''}>${cls.name}</option>`).join('')}
                        ${!currentCls ? '<option value="-1" selected disabled>Pending...</option>' : ''}
                    </select>
                    <span class="text-[0.7rem] bg-(--bg-main) px-1.5 py-0.5 rounded text-(--text-muted) font-mono">${Math.round(box.x)}, ${Math.round(box.y)}</span>
                </div>
            `;
        }).join('');
        this.dom.annotationList.querySelectorAll('.anno-item').forEach(item => {
            const boxId = parseInt(item.dataset.id);
            item.addEventListener('click', (e) => { if (e.target.tagName !== 'SELECT') state.set({ selectedBoxId: boxId }); });
            item.querySelector('.anno-class-select').addEventListener('change', (e) => {
                const newAnnotations = state.data.annotations.map(box => box.id === boxId ? { ...box, classId: parseInt(e.target.value) } : box);
                state.set({ annotations: newAnnotations, selectedBoxId: boxId });
            });
        });
    }

    async handleClearAllAnnotations() {
        this.showModal({
            title: 'System Alert: Irreversible Deletion',
            message: '🚨 CRITICAL: You are about to purge ALL annotation data from the current directory. Every label file will be deleted. This action is final and CANNOT be recovered. Proceed?',
            confirmText: 'Purge All Data',
            cancelText: 'Abort',
            onConfirm: async () => {
                try {
                    state.set({ loading: true, statusMessage: '🗑️ Clearing annotations...' });
                    const { labelFolderHandle, images } = state.data;
                    
                    // Iterate through all images and delete their corresponding .txt files
                    for (const img of images) {
                        const txtName = img.name.replace(/\.[^/.]+$/, "") + ".txt";
                        try {
                            await labelFolderHandle.removeEntry(txtName);
                        } catch (e) {
                            // File might not exist, ignore
                        }
                        img.status = 'pending';
                    }

                    // Reset current view
                    state.set({ 
                        annotations: [], 
                        selectedBoxId: null,
                        loading: false 
                    });

                    this.renderImageList(images);
                    if (this.canvasEngine) this.canvasEngine.draw();
                    this.updateStatus('✅ All annotations cleared');
                } catch (err) {
                    console.error('Failed to clear annotations:', err);
                    state.set({ loading: false });
                    this.updateStatus('❌ Error clearing annotations', true);
                }
            }
        });
    }

    handleLoadCustomModel() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.onnx';
        input.onchange = (e) => { if (e.target.files[0]) ai.loadModel(e.target.files[0]); };
        input.click();
    }

    async handleAutoLabelDataset() {
        if (!state.data.folderHandle) {
            this.updateStatus('❌ Open a folder first', true);
            return;
        }
        this.showModal({
            title: 'AI Batch Inference Confirmation',
            message: '🤖 VISIONTAG AI: You are initiating a batch processing task. The current model will scan every image to automatically generate bounding boxes. Continue?',
            confirmText: 'Start AI Task',
            onConfirm: () => this.startAutoLabelBatch()
        });
    }

    async startAutoLabelBatch() {
        const overlay = document.createElement('div');
        overlay.className = 'progress-overlay';
        overlay.innerHTML = `
            <div class="progress-container">
                <h3>AI is labeling your dataset...</h3>
                <div class="progress-bar"><div id="ai-progress-fill" class="progress-fill"></div></div>
                <p id="ai-progress-text">0 / ${state.data.images.length} images</p>
                <button id="btn-cancel-ai" class="btn btn-secondary" style="margin-top: 20px;">Cancel Task</button>
            </div>
        `;
        this.dom.workspace.appendChild(overlay);
        let cancelled = false;
        overlay.querySelector('#btn-cancel-ai').onclick = () => { cancelled = true; };
        const images = state.data.images;
        const fill = overlay.querySelector('#ai-progress-fill');
        const text = overlay.querySelector('#ai-progress-text');
        state.set({ isAutoLabeling: true });
        
        let completedCount = 0;
        const totalImages = images.length;
        let batchClasses = [...state.data.classes]; // Local sync for parallel tasks
        
        const updateUI = (imgName) => {
            requestAnimationFrame(() => {
                text.textContent = `⚡ AI Processing: ${completedCount} / ${totalImages}`;
                fill.style.width = `${(completedCount / totalImages) * 100}%`;
                const progressText = document.getElementById('ai-progress-text');
                if (progressText) progressText.textContent = `Processing: ${imgName} (${completedCount}/${totalImages})`;
            });
        };

        const CONCURRENCY = 4;
        for (let i = 0; i < totalImages; i += CONCURRENCY) {
            if (cancelled) break;

            const chunk = images.slice(i, i + CONCURRENCY);
            await Promise.all(chunk.map(async (img, chunkOffset) => {
                const idx = i + chunkOffset;
                if (idx >= totalImages || cancelled) return;

                try {
                    const file = await img.handle.getFile();
                    const bitmap = await createImageBitmap(file);
                    const existingAnnotations = await this.loadAnnotations(img.name, bitmap);
                    const predictions = await ai.predict(bitmap);

                    if (predictions.length > 0) {
                        let classesChanged = false;
                        const mapped = predictions.map(p => {
                            const aiName = ai.cocoClasses[p.classId] || `class_${p.classId}`;
                            let projectClass = batchClasses.find(c => c.name.toLowerCase() === aiName.toLowerCase());
                            
                            if (!projectClass) {
                                const newId = batchClasses.length > 0 ? Math.max(...batchClasses.map(c => c.id)) + 1 : 0;
                                projectClass = { id: newId, name: aiName, color: YoloHelper.generateColor(newId) };
                                batchClasses.push(projectClass);
                                classesChanged = true;
                            }
                            return { ...p, classId: projectClass.id };
                        });
                        
                        if (classesChanged) {
                            state.set({ classes: [...batchClasses] });
                            await this.saveClasses(batchClasses);
                        }

                        const merged = [...existingAnnotations, ...mapped];
                        // Save without re-rendering sidebar (pass true to skip UI)
                        await this.saveAnnotations(idx, merged, bitmap, true);
                        
                        if (idx === state.data.currentImageIndex) {
                            state.set({ annotations: merged });
                            if (this.canvasEngine) this.canvasEngine.draw();
                        }
                        img.status = 'labeled';
                    }
                } catch (err) { 
                    console.error(`Failed to auto-label ${img.name}:`, err); 
                } finally {
                    completedCount++;
                    updateUI(img.name);
                }
            }));
        }
        overlay.remove();
        state.set({ isAutoLabeling: false });
        this.renderImageList(images); // Final single refresh
        if (state.data.currentImageIndex !== -1) this.loadImage(state.data.currentImageIndex);
        this.updateStatus(cancelled ? '⚠️ AI Batch Cancelled' : '✅ AI Batch Complete');
    }

    updateStatus(msg, isError = false) {
        this.dom.statusMessage.textContent = msg;
        this.dom.statusMessage.style.color = isError ? 'var(--error)' : 'var(--text-muted)';
    }
}

new App();
