import { state } from './core/state.js';
import { CanvasEngine } from './engine/canvas.js';
import { YoloHelper } from './utils/yolo.js';
import { ai } from './core/ai.js';
import { ContourTracer } from './core/sam_utils.js';
import './components/index.js';

/**
 * SharpTensor Main Entry Point
 */
class App {
    constructor() {
        this.initUI();
        this.canvasEngine = new CanvasEngine('main-canvas');
        this.initEventListeners();
        this.initStateListeners();
        this.initClickLogger();
        this.initGlobalErrorHandling();

        // Load models on startup
        ai.loadModels();

        this._saving = false;
        this._savePending = false;
        this._saveTimer = null;
        this.imageCache = new Map();

        console.log('🚀 SharpTensor Initialized (RT-DETR + MobileSAM)');
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
            workspace: document.getElementById('workspace'),
            btnTaskDet: document.getElementById('task-det'),
            btnTaskSeg: document.getElementById('task-seg')
        };
    }

    initEventListeners() {
        this.dom.btnDraw.addEventListener('click', () => {
            const isDet = state.data.currentTask === 'detection';
            state.set({ mode: isDet ? 'draw' : 'magic' });
        });
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

        this.dom.btnTaskDet.addEventListener('click', () => state.set({ currentTask: 'detection' }));
        this.dom.btnTaskSeg.addEventListener('click', () => state.set({ currentTask: 'segmentation' }));

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

            if (key === 'w') {
                const isDet = state.data.currentTask === 'detection';
                state.set({ mode: isDet ? 'draw' : 'magic' });
            }
            if (key === 'v') state.set({ mode: 'select' });
            if (key === 'm') {
                // If user presses M, we just activate the unified tool logic for the task
                const isDet = state.data.currentTask === 'detection';
                state.set({ mode: isDet ? 'draw' : 'magic' });
            }
            if (key === 'd') this.nextImage();
            if (key === 'a') this.prevImage();
            if (key === 's') this.confirmMagicMask();
            if (key === 'escape') this.resetMagicInteraction();
            if (key === 'delete' || key === 'backspace') this.deleteSelectedBox();
            if (key === 't') state.set({ currentTask: state.data.currentTask === 'detection' ? 'segmentation' : 'detection' });

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
                const isDrawOrMagic = data.mode === 'draw' || data.mode === 'magic';
                this.dom.btnDraw.classList.toggle('active', isDrawOrMagic);
                this.dom.btnSelect.classList.toggle('active', data.mode === 'select');

                if (data.mode) {
                    this.updateStatus(`Mode: ${data.mode.toUpperCase()}`);
                }

                if (data.mode === 'magic') {
                    this.resetMagicInteraction();
                    // Lazy-load SAM embeddings when entering magic mode
                    if (data.currentImageBitmap) {
                        const imgName = data.images[data.currentImageIndex]?.name;
                        // Use setTimeout to ensure UI updates before heavy AI starts
                        setTimeout(() => ai.setSAMImage(data.currentImageBitmap, imgName), 50);
                    }
                }
            }

            if (data.images.length !== oldData.images.length || data.currentImageIndex !== oldData.currentImageIndex) {
                this.dom.imageCounter.textContent = `${data.currentImageIndex + 1} / ${data.images.length}`;
                this.dom.fileCountBadge.textContent = `${data.images.length} items`;

                if (data.currentImageIndex !== oldData.currentImageIndex) {
                    this.loadImage(data.currentImageIndex);
                    this.renderImageList(data.images);
                }
            }

            if (data.currentTask !== oldData.currentTask) {
                this.updateTaskUI(data.currentTask);
                // Reload classes and annotations for the new isolated task
                this.loadClasses();
                this.syncTaskAnnotations();
            }

            if (data.annotations !== oldData.annotations && !data.isAutoLabeling) {
                this.renderAnnotationList(data.annotations, data.selectedBoxId);
                this.dom.boxCountBadge.textContent = data.annotations.length;

                // Immediate status update for UI feedback
                const newImages = [...data.images];
                if (newImages[data.currentImageIndex]) {
                    const hasAnnos = data.annotations.length > 0;
                    if (newImages[data.currentImageIndex].status !== (hasAnnos ? 'labeled' : 'pending')) {
                        newImages[data.currentImageIndex].status = hasAnnos ? 'labeled' : 'pending';
                        state.set({ images: newImages });
                        this.renderImageList(newImages);
                    }
                }

                // Debounced save to prevent File System Access API conflicts
                this.debouncedSave();
            } else if (data.selectedBoxId !== oldData.selectedBoxId) {
                this.updateAnnotationSelection(data.selectedBoxId);

                // If in magic mode and a box is selected, use it as a box prompt
                if (data.mode === 'magic' && data.selectedBoxId !== null) {
                    const box = data.annotations.find(b => b.id === data.selectedBoxId);
                    if (box && !box.polygon) {
                        this.canvasEngine.handleMagicBox(box.x, box.y, box.x + box.width, box.y + box.height);
                    }
                } else if (data.selectedBoxId === null) {
                    this.resetMagicInteraction();
                }
            }

            if (data.loading !== oldData.loading) {
                document.getElementById('loading-overlay').classList.toggle('hidden', !data.loading);
            }

            // Always update button states based on folder presence
            const isFolderLoaded = !!data.folderHandle;
            if (this.dom.btnSelect) this.dom.btnSelect.disabled = !isFolderLoaded;
            if (this.dom.btnDraw) this.dom.btnDraw.disabled = !isFolderLoaded;
            if (this.dom.btnPrev) this.dom.btnPrev.disabled = !isFolderLoaded;
            if (this.dom.btnNext) this.dom.btnNext.disabled = !isFolderLoaded;
            if (this.dom.btnExport) this.dom.btnExport.disabled = !isFolderLoaded;
            if (this.dom.btnAddClass) this.dom.btnAddClass.disabled = !isFolderLoaded;
            if (this.dom.btnLoadModel) this.dom.btnLoadModel.disabled = true; // Always disabled for now
            if (this.dom.btnClearAll) this.dom.btnClearAll.disabled = !isFolderLoaded;
            if (this.dom.btnTaskDet) this.dom.btnTaskDet.disabled = !isFolderLoaded;
            if (this.dom.btnTaskSeg) this.dom.btnTaskSeg.disabled = !isFolderLoaded;

            if (this.dom.btnAutoLabelAll) {
                this.dom.btnAutoLabelAll.disabled = data.modelStatus !== 'ready' || !isFolderLoaded;
            }

            // Update model status badge with task-aware naming
            if (this.dom.modelStatusBadge) {
                const badge = this.dom.modelStatusBadge;
                badge.className = "px-2 py-0.5 rounded-full text-[0.7rem] border transition-all";

                let modelName = "Idle";
                if (data.modelStatus === 'loading') modelName = "Loading...";
                else if (data.modelStatus === 'processing') modelName = "Thinking...";
                else if (data.modelStatus === 'error') modelName = "Error";
                else if (data.modelStatus === 'ready') {
                    const isCustom = data.aiModel?.name?.startsWith('Custom:');
                    if (isCustom) {
                        modelName = data.aiModel.name;
                    } else {
                        modelName = data.currentTask === 'detection' ? 'RT-DETR' : 'RT-DETR + MobileSAM';
                    }
                }

                badge.textContent = modelName;

                if (data.modelStatus === 'idle') {
                    badge.classList.add("bg-gray-500/20", "text-gray-400", "border-gray-500/30");
                } else if (data.modelStatus === 'loading') {
                    badge.classList.add("bg-yellow-500/20", "text-yellow-500", "border-yellow-500/30", "animate-pulse");
                } else if (data.modelStatus === 'processing') {
                    badge.classList.add("bg-blue-500/20", "text-blue-400", "border-blue-500/30", "animate-pulse");
                } else if (data.modelStatus === 'ready') {
                    badge.classList.add("bg-green-500/20", "text-green-500", "border-green-500/30");
                } else if (data.modelStatus === 'error') {
                    badge.classList.add("bg-red-500/20", "text-red-500", "border-red-500/30");
                }
            }

            if (data.classes !== oldData.classes || data.selectedClassId !== oldData.selectedClassId) {
                this.renderClassList(data.classes, data.selectedClassId);
            }

            this.initLogListener();
        });
    }

    initLogListener() {
        if (this._logInit) return;
        this._logInit = true;

        const logContainer = document.getElementById('ai-logs');
        if (!logContainer) return;

        window.addEventListener('ai-log', (e) => {
            const { message, type, time } = e.detail;

            const placeholder = logContainer.querySelector('.italic');
            if (placeholder) placeholder.remove();

            const logEntry = document.createElement('div');
            logEntry.className = `flex gap-2 leading-tight py-0.5 border-b border-white/5 last:border-0`;

            const timeSpan = document.createElement('span');
            timeSpan.className = 'text-white/30 shrink-0 font-mono';
            timeSpan.textContent = time;

            const msgSpan = document.createElement('span');
            msgSpan.className = type === 'error' ? 'text-red-400' : 'text-(--text-primary)';
            msgSpan.textContent = message;

            logEntry.appendChild(timeSpan);
            logEntry.appendChild(msgSpan);
            logContainer.appendChild(logEntry);

            logContainer.scrollTop = logContainer.scrollHeight;

            while (logContainer.children.length > 50) {
                logContainer.removeChild(logContainer.firstChild);
            }
        });
    }

    async loadImage(index) {
        if (index < 0 || index >= state.data.images.length) return;
        const imageInfo = state.data.images[index];
        if (!imageInfo) return;

        // 1. Check Cache for Instant Render
        if (this.imageCache.has(index)) {
            const cached = this.imageCache.get(index);
            const taskAnnos = state.data.currentTask === 'detection' ? cached.detAnnos : cached.segAnnos;
            
            state.set({
                currentImageIndex: index,
                currentImageBitmap: cached.bitmap,
                annotations: taskAnnos || [],
                loading: false,
                activeMask: null,
                promptPoints: [],
                activePromptBox: null
            });

            this.fitImageToCanvas(cached.bitmap);
            this.canvasEngine.draw();
            
            // Background SAM Warmup (with cache key)
            if (state.data.currentTask === 'segmentation') {
                setTimeout(() => ai.setSAMImage(cached.bitmap, imageInfo.name), 50);
            }
            
            // Extend pre-loading to current neighborhood
            this.preloadNeighborhood(index);
            return;
        }

        // 2. Fallback to Slow Load (Flicker path)
        try {
            state.set({ loading: true, statusMessage: `Loading ${imageInfo.name}...` });
            const file = await imageInfo.handle.getFile();
            const bitmap = await createImageBitmap(file);
            const annotations = await this.loadAnnotations(imageInfo.name, bitmap);
            this.fitImageToCanvas(bitmap);

            // Store in Cache (Multi-task aware)
            const cacheEntry = { bitmap };
            if (state.data.currentTask === 'detection') cacheEntry.detAnnos = annotations;
            else cacheEntry.segAnnos = annotations;
            
            this.imageCache.set(index, cacheEntry);
            if (this.imageCache.size > 15) {
                const oldestIndex = this.imageCache.keys().next().value;
                this.imageCache.delete(oldestIndex);
            }

            state.undoStack = [];
            state.redoStack = [];
            state.saveHistory();

            state.set({
                currentImageBitmap: bitmap,
                annotations: annotations || [],
                loading: false,
                statusMessage: `Loaded: ${imageInfo.name}`,
                activeMask: null,
                promptPoints: [],
                activePromptBox: null
            });

            // Warm up SAM Encoder only if needed (Segmentation task)
            if (state.data.currentTask === 'segmentation') {
                setTimeout(() => ai.setSAMImage(bitmap, imageInfo.name), 50);
            }

            this.preloadNeighborhood(index);
        } catch (err) {
            console.error('Failed to load image:', err);
            this.updateStatus('Error loading image', true);
        }
    }

    async preloadNeighborhood(currentIndex) {
        const range = 7; // Preload 7 images before and after (Total focus: 15)
        const { images } = state.data;
        console.log(`🔍 Explorer: Triggering neighborhood warmup for index ${currentIndex} (range: ${range})`);
        
        for (let i = 1; i <= range; i++) {
            const nextIdx = currentIndex + i;
            const prevIdx = currentIndex - i;
            
            if (nextIdx < images.length) this.preloadImage(nextIdx);
            if (prevIdx >= 0) this.preloadImage(prevIdx);
        }
    }

    async preloadImage(index) {
        if (this.imageCache.has(index)) {
            // Even if image is in cache, check if AI needs warmup
            if (state.data.currentTask === 'segmentation') {
                const imageInfo = state.data.images[index];
                const cached = this.imageCache.get(index);
                if (imageInfo && cached) ai.setSAMImage(cached.bitmap, imageInfo.name);
            }
            return;
        }
        
        try {
            const imageInfo = state.data.images[index];
            const file = await imageInfo.handle.getFile();
            const bitmap = await createImageBitmap(file);
            const annotations = await this.loadAnnotations(imageInfo.name, bitmap);
            
            // Multi-task aware pre-load (default to current task)
            const cacheEntry = { bitmap };
            if (state.data.currentTask === 'detection') cacheEntry.detAnnos = annotations;
            else cacheEntry.segAnnos = annotations;

            this.imageCache.set(index, cacheEntry);
            
            // Limit cache to 15 images to balance memory and speed
            if (this.imageCache.size > 15) {
                const oldestIndex = this.imageCache.keys().next().value;
                this.imageCache.delete(oldestIndex);
            }

            // AI Warmup: If in segmentation mode, trigger encoding in background
            if (state.data.currentTask === 'segmentation') {
                console.log(`🧠 Explorer: Warming up AI for neighbor: ${imageInfo.name}`);
                ai.setSAMImage(bitmap, imageInfo.name);
            }
        } catch (err) {
            console.warn(`⚠️ Explorer: Preload failed for index ${index}:`, err);
        }
    }

    async syncTaskAnnotations() {
        const { currentImageIndex, images, currentImageBitmap, currentTask } = state.data;
        if (currentImageIndex === -1 || !currentImageBitmap) return;

        const imageInfo = images[currentImageIndex];
        const cacheEntry = this.imageCache.get(currentImageIndex);

        // 1. Instant Cache Switch
        if (cacheEntry) {
            const taskAnnos = currentTask === 'detection' ? cacheEntry.detAnnos : cacheEntry.segAnnos;
            if (taskAnnos) {
                state.set({
                    annotations: taskAnnos,
                    activeMask: null,
                    promptPoints: [],
                    activePromptBox: null
                });
                
                if (currentTask === 'segmentation') {
                    setTimeout(() => ai.setSAMImage(currentImageBitmap, imageInfo.name), 50);
                }
                return;
            }
        }

        // 2. Optimistic Clear for Responsiveness
        state.set({ annotations: [], activeMask: null, promptPoints: [], activePromptBox: null });
        this.updateStatus(`Syncing ${currentTask.toUpperCase()}...`);

        try {
            const annotations = await this.loadAnnotations(imageInfo.name, currentImageBitmap);
            
            // Update cache
            if (cacheEntry) {
                if (currentTask === 'detection') cacheEntry.detAnnos = annotations;
                else cacheEntry.segAnnos = annotations;
            }

            state.set({ annotations: annotations || [] });

            if (currentTask === 'segmentation') {
                ai.setSAMImage(currentImageBitmap, imageInfo.name);
                this.preloadNeighborhood(currentImageIndex); // Trigger neighborhood warmup immediately on task switch
            }
        } catch (err) {
            console.error('Failed to sync task annotations:', err);
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
            const labelSegHandle = await handle.getDirectoryHandle('label-seg', { create: true });

            const images = [];
            for await (const entry of handle.values()) {
                if (entry.kind === 'file' && /\.(jpe?g|png|webp)$/i.test(entry.name)) {
                    images.push({ name: entry.name, handle: entry, status: 'pending' });
                }
            }
            images.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

            this.imageCache.clear();
            state.set({
                folderHandle: handle,
                labelFolderHandle: labelHandle,
                labelSegFolderHandle: labelSegHandle,
                images,
                currentImageIndex: images.length > 0 ? 0 : -1,
                loading: false,
                mode: 'select'
            });
            this.renderImageList(images);
            
            // Initial class load
            this.loadClasses();
        } catch (err) {
            console.error('Failed to open folder:', err);
            this.updateStatus('Access denied or folder empty', true);
        }
    }

    async loadClasses() {
        const { folderHandle, labelFolderHandle, labelSegFolderHandle, currentTask } = state.data;
        if (!folderHandle) return;

        const targetFolder = currentTask === 'segmentation' ? labelSegFolderHandle : labelFolderHandle;
        
        try {
            let fileHandle;
            try {
                // 1. Try Isolated Class List (Task-Specific)
                fileHandle = await targetFolder.getFileHandle('classes.txt');
            } catch (e) {
                // 2. Fallback to Root Class List (Legacy)
                fileHandle = await folderHandle.getFileHandle('classes.txt');
            }

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
        const isSeg = state.data.currentTask === 'segmentation';
        const folder = isSeg ? state.data.labelSegFolderHandle : state.data.labelFolderHandle;

        try {
            const fileHandle = await folder.getFileHandle(txtName);
            const file = await fileHandle.getFile();
            const content = await file.text();
            return content.split('\n')
                .filter(l => l.trim())
                .map(line => YoloHelper.fromYolo(line, bitmap.width, bitmap.height))
                .filter(b => b !== null);
        } catch (e) { return []; }
    }

    debouncedSave() {
        if (this._saveTimer) clearTimeout(this._saveTimer);
        this._saveTimer = setTimeout(() => {
            if (state.data.currentImageIndex !== -1) {
                this.saveAnnotations(state.data.currentImageIndex, state.data.annotations, state.data.currentImageBitmap, true);
            }
        }, 1000); // 1s debounce is safe for manual work
    }

    async saveAnnotations(index, annotations, bitmap = state.data.currentImageBitmap, skipUI = false) {
        if (!state.data.folderHandle || !bitmap) return;

        if (!this._saveQueue) this._saveQueue = Promise.resolve();

        return this._saveQueue = this._saveQueue.then(async () => {
            const imgInfo = state.data.images[index];
            if (!imgInfo) return;
            const txtName = imgInfo.name.replace(/\.[^/.]+$/, "") + ".txt";
            const isSeg = state.data.currentTask === 'segmentation';
            const folder = isSeg ? state.data.labelSegFolderHandle : state.data.labelFolderHandle;

            try {
                const content = annotations.map(box =>
                    isSeg ? YoloHelper.toYoloSeg(box, bitmap.width, bitmap.height) : YoloHelper.toYolo(box, bitmap.width, bitmap.height)
                ).join('\n');

                const fileHandle = await folder.getFileHandle(txtName, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(content);
                await writable.close();

                if (!skipUI) this.updateStatus(`Saved ${isSeg ? 'Seg' : 'Det'}: ${txtName}`);
            } catch (err) { console.error('Failed to save:', err); }
        });
    }

    renderImageList(images) {
        if (images.length === 0) {
            this.dom.imageList.innerHTML = '<div class="empty-state">No images found</div>';
            return;
        }
        this.dom.imageList.innerHTML = images.map((img, idx) => {
            const isActive = idx === state.data.currentImageIndex;
            const itemClasses = isActive 
                ? 'bg-(--accent)/10 text-(--accent-light) font-semibold ring-1 ring-(--accent)/30 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)] hover:bg-(--accent)/20' 
                : 'text-(--text-muted) hover:bg-(--bg-hover) hover:text-(--text-primary)';
            
            return `
                <div class="image-item group flex items-center justify-between px-3 py-2 rounded-lg text-[0.8rem] cursor-pointer transition-all gap-2.5 ${itemClasses}" data-index="${idx}">
                    <span class="truncate flex-1">${img.name}</span>
                    ${img.status === 'labeled' ? '<span class="w-1.5 h-1.5 rounded-full bg-(--success) shadow-[0_0_8px_var(--success)]"></span>' : ''}
                </div>
            `;
        }).join('');
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

    async saveClasses() {
        const { labelFolderHandle, labelSegFolderHandle, currentTask, classes } = state.data;
        const targetFolder = currentTask === 'segmentation' ? labelSegFolderHandle : labelFolderHandle;

        if (targetFolder && classes.length > 0) {
            try {
                const fileHandle = await targetFolder.getFileHandle('classes.txt', { create: true });
                const writable = await fileHandle.createWritable();
                const content = classes.map(c => `${c.name} ${c.color}`).join('\n');
                await writable.write(content);
                await writable.close();
            } catch (e) {
                console.error('Failed to save classes:', e);
            }
        }
    }

    showModal({ title, message, inputPlaceholder = '', confirmText = 'Confirm', cancelText = 'Cancel', checkboxLabel = '', onConfirm, onCancel }) {
        const modal = this.dom.modal;
        modal.querySelector('.modal-title').textContent = title;
        modal.querySelector('.modal-message').textContent = message;
        
        const input = modal.querySelector('.modal-input');
        const progressContainer = modal.querySelector('.modal-progress-container');
        const checkboxContainer = modal.querySelector('.modal-checkbox-container');
        const checkbox = modal.querySelector('.modal-checkbox');
        const checkboxLabelEl = modal.querySelector('.modal-checkbox-label');

        if (inputPlaceholder) {
            input.classList.remove('hidden');
            input.placeholder = inputPlaceholder;
            input.value = '';
            setTimeout(() => input.focus(), 100);
        } else {
            input.classList.add('hidden');
        }

        if (checkboxLabel) {
            checkboxContainer.classList.remove('hidden');
            checkboxLabelEl.textContent = checkboxLabel;
            checkbox.checked = false;
            // Allow clicking the container to toggle the checkbox
            checkboxContainer.onclick = () => checkbox.click();
        } else {
            checkboxContainer.classList.add('hidden');
        }

        if (progressContainer) progressContainer.classList.add('hidden');

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
        confirmBtn.classList.toggle('text-white', isDanger);

        confirmBtn.classList.toggle('bg-(--accent)', !isDanger);
        confirmBtn.classList.toggle('text-(--accent-text)', !isDanger);

        const card = modal.querySelector('.modal-card');
        card.classList.toggle('border-t-red-500', isDanger);
        card.classList.toggle('border-t-2', isDanger);
        card.classList.toggle('border-t-white/20', !isDanger);
        card.classList.toggle('border-t', !isDanger);

        modal.classList.remove('hidden');

        confirmBtn.onclick = () => {
            const val = input.value.trim();
            const checked = checkbox.checked;
            modal.classList.add('hidden');
            if (onConfirm) onConfirm(val, checked);
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
            message: 'Welcome to SharpTensor. To begin labeling, please define your primary object class. This will serve as the initial category for your dataset.',
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
            title: '☢️ NUCLEAR OPTION: Purge Dataset',
            message: '🚨 CRITICAL: You are about to initiate a final purge of the current dataset. This will delete all annotation files. You can optionally reset your class definitions as well.',
            confirmText: 'Execute Purge',
            cancelText: 'Abort',
            checkboxLabel: 'Also reset class definitions (classes.txt)',
            onConfirm: async (val, clearClasses) => {
                try {
                    state.set({ loading: true, statusMessage: '🗑️ Purging data...' });
                    const { labelFolderHandle, labelSegFolderHandle, images, currentTask } = state.data;
                    
                    // Select the correct folder based on active task
                    const targetFolder = currentTask === 'segmentation' ? labelSegFolderHandle : labelFolderHandle;

                    // Iterate through all images and delete their corresponding .txt files in the target folder
                    for (const img of images) {
                        const txtName = img.name.replace(/\.[^/.]+$/, "") + ".txt";
                        try {
                            await targetFolder.removeEntry(txtName);
                        } catch (e) { }
                        img.status = 'pending'; // Reset sidebar status icon
                    }

                    // Deep Purge: Clear the RAM cache to prevent "ghost" annotations from appearing
                    this.imageCache.clear();

                    // Reset current view
                    const resetState = {
                        annotations: [],
                        selectedBoxId: null,
                        loading: false
                    };

                    if (clearClasses) {
                        resetState.classes = [];
                        resetState.selectedClassId = null;
                        try {
                            const classesFile = await targetFolder.getFileHandle('classes.txt', { create: true });
                            const writable = await classesFile.createWritable();
                            await writable.write('');
                            await writable.close();
                        } catch (e) { }
                    }

                    state.set(resetState);

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
        this.updateStatus('⚠️ Custom model loading disabled for RT-DETR pipeline', true);
    }

    async handleAutoLabelDataset() {
        if (!state.data.folderHandle) {
            this.updateStatus('❌ Open a folder first', true);
            return;
        }
        this.showModal({
            title: 'AI Batch Inference Confirmation',
            message: '🤖 SHARPTENSOR AI: You are initiating a batch processing task. The current model will scan every image to automatically generate bounding boxes. Continue?',
            confirmText: 'Start AI Task',
            onConfirm: () => this.startAutoLabelBatch()
        });
    }

    async startAutoLabelBatch() {
        const modal = this.dom.modal;
        const progressContainer = modal.querySelector('.modal-progress-container');
        const fill = modal.querySelector('.modal-progress-fill');
        const text = modal.querySelector('.modal-progress-text');
        const confirmBtn = modal.querySelector('.modal-confirm');
        const cancelBtn = modal.querySelector('.modal-cancel');

        this.showModal({
            title: 'AI Batch Processing',
            message: 'Initializing AI models and scanning dataset...',
            confirmText: 'Processing...',
            cancelText: 'Stop Task'
        });

        if (progressContainer) progressContainer.classList.remove('hidden');
        confirmBtn.disabled = true;
        confirmBtn.classList.add('opacity-50');

        let cancelled = false;
        cancelBtn.onclick = () => {
            cancelled = true;
            modal.classList.add('hidden');
        };

        const images = state.data.images;
        state.set({ isAutoLabeling: true });

        let completedCount = 0;
        const totalImages = images.length;
        
        // Pre-initialize UI with total count
        requestAnimationFrame(() => {
            text.textContent = `⚡ Preparing: Scanning ${totalImages} images...`;
            fill.style.width = `0%`;
        });

        let batchClasses = [...state.data.classes]; // Local sync for parallel tasks

        const updateUI = (imgName) => {
            requestAnimationFrame(() => {
                text.textContent = `⚡ Processing: ${imgName} (${completedCount} / ${totalImages})`;
                fill.style.width = `${(completedCount / totalImages) * 100}%`;
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
                    const predictions = await ai.detect(bitmap);

                    if (predictions.length > 0) {
                        let classesChanged = false;
                        // Standard COCO 80 classes for model mapping
                        const cocoNames = ["person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck", "boat", "traffic light", "fire hydrant", "stop sign", "parking meter", "bench", "bird", "cat", "dog", "horse", "sheep", "cow", "elephant", "bear", "zebra", "giraffe", "backpack", "umbrella", "handbag", "tie", "suitcase", "frisbee", "skis", "snowboard", "sports ball", "kite", "baseball bat", "baseball glove", "skateboard", "surfboard", "tennis racket", "bottle", "wine glass", "cup", "fork", "knife", "spoon", "bowl", "banana", "apple", "sandwich", "orange", "broccoli", "carrot", "hot dog", "pizza", "donut", "cake", "chair", "couch", "potted plant", "bed", "dining table", "toilet", "tv", "laptop", "mouse", "remote", "keyboard", "cell phone", "microwave", "oven", "toaster", "sink", "refrigerator", "book", "clock", "vase", "scissors", "teddy bear", "hair drier", "toothbrush"];

                        const mapped = predictions.map(p => {
                            const aiName = cocoNames[p.classId] || `class_${p.classId}`;
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

        modal.classList.add('hidden');
        confirmBtn.disabled = false;
        confirmBtn.classList.remove('opacity-50');
        state.set({ isAutoLabeling: false });
        
        // Final deep refresh: update sidebar icons AND reload the active image annotations
        this.renderImageList(state.data.images); 
        if (state.data.currentImageIndex !== -1) {
            await this.loadImage(state.data.currentImageIndex);
        }
        this.updateStatus(cancelled ? '⚠️ AI Batch Cancelled' : '✅ AI Batch Complete');
    }

    updateStatus(msg, isError = false) {
        this.dom.statusMessage.textContent = msg;
        this.dom.statusMessage.style.color = isError ? '#ef4444' : 'var(--text-muted)';
    }

    // --- Magic Select (SAM) Helpers ---

    resetMagicInteraction() {
        state.set({ promptPoints: [], activeMask: null, activePromptBox: null });
        this.canvasEngine.draw();
    }

    async confirmMagicMask() {
        const { activeMask, classes, selectedClassId, currentTask } = state.data;
        if (!activeMask) return;

        const isSegTask = currentTask === 'segmentation';
        let polygon = null;
        let x1, y1, width, height;

        if (isSegTask) {
            // Precise contour tracing for segmentation
            polygon = ContourTracer.trace(activeMask, state.data.currentImageBitmap.width, state.data.currentImageBitmap.height);
            if (!polygon || polygon.length < 3) {
                this.updateStatus('❌ Segment too small', true);
                return;
            }
            const xs = polygon.map(p => p[0]);
            const ys = polygon.map(p => p[1]);
            x1 = Math.min(...xs);
            y1 = Math.min(...ys);
            width = Math.max(...xs) - x1;
            height = Math.max(...ys) - y1;
        } else {
            // Tight bounding box for detection
            const bounds = this.getMaskBounds(activeMask, state.data.currentImageBitmap.width);
            if (!bounds) return;
            ({ x: x1, y: y1, width, height } = bounds);
        }

        const newAnnotation = {
            id: Date.now(),
            classId: selectedClassId !== null ? selectedClassId : 0,
            x: x1,
            y: y1,
            width: width,
            height: height,
            polygon: polygon,
            score: 1.0
        };

        state.saveHistory();
        const newAnnos = [...state.data.annotations, newAnnotation];
        state.set({
            annotations: newAnnos,
            activeMask: null,
            promptPoints: [],
            activePromptBox: null
        });

        // saveAnnotations is now handled by the state subscriber for consistency
        this.updateStatus(`✅ ${isSegTask ? 'Polygon' : 'Box'} confirmed`);
    }

    getMaskBounds(mask, imgWidth) {
        let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
        let found = false;
        for (let i = 0; i < mask.length; i++) {
            if (mask[i] === 1) {
                const x = i % imgWidth;
                const y = Math.floor(i / imgWidth);
                x1 = Math.min(x1, x);
                y1 = Math.min(y1, y);
                x2 = Math.max(x2, x);
                y2 = Math.max(y2, y);
                found = true;
            }
        }
        return found ? { x: x1, y: y1, width: x2 - x1, height: y2 - y1 } : null;
    }

    updateTaskUI(task) {
        const isDet = task === 'detection';
        this.dom.btnTaskDet.classList.toggle('active-task-btn', isDet);
        this.dom.btnTaskDet.classList.toggle('text-(--text-muted)', !isDet);
        this.dom.btnTaskSeg.classList.toggle('active-task-btn', !isDet);
        this.dom.btnTaskSeg.classList.toggle('text-(--text-muted)', isDet);

        // Enable draw tool for both tasks (it will act as a box prompt in segmentation)
        this.dom.btnDraw.disabled = false;
        
        // Auto-switch mode based on task for elite UX
        if (isDet) {
            state.set({ mode: 'draw' });
        } else {
            state.set({ mode: 'magic' });
        }

        this.updateStatus(`Task Switched: ${task.toUpperCase()}`);
    }

    maskToPolygon(mask, width, height) {
        // Simplified Marching Squares or Contour tracing
        // For simplicity, we'll use a crude version:
        // Actually, we can use a small canvas trick to get contours via browser's path API if possible, 
        // but better to just do a simple boundary trace.
        // Given the time, I'll use a simple bounding box to polygon for now, 
        // or a slightly better "hull" approach.
        // RE-EVALUATION: The user wants "elite", let's do a basic but functional contour.

        // Find a starting pixel
        let startPixel = -1;
        for (let i = 0; i < mask.length; i++) {
            if (mask[i] === 1) {
                startPixel = i;
                break;
            }
        }
        if (startPixel === -1) return null;

        // For now, let's return a simple rectangle polygon to ensure the workflow is solid.
        // Real contour tracing can be added in sam_utils.
        const xs = [];
        const ys = [];
        for (let i = 0; i < mask.length; i++) {
            if (mask[i] === 1) {
                xs.push(i % width);
                ys.push(Math.floor(i / width));
            }
        }
        const x1 = Math.min(...xs);
        const y1 = Math.min(...ys);
        const x2 = Math.max(...xs);
        const y2 = Math.max(...ys);

        return [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];
    }
}

new App();
