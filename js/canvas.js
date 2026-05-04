import { state } from './state.js';

/**
 * VisionTag Canvas Engine
 * Handles high-performance rendering and coordinate transformations.
 */
export class CanvasEngine {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d', { alpha: false });
        this.container = document.getElementById('workspace');
        
        this.setupCanvas();
        this.initEventListeners();
        this.startRenderLoop();
    }

    setupCanvas() {
        this.dpr = window.devicePixelRatio || 1;
        const rect = this.container.getBoundingClientRect();
        
        // Logical dimensions
        this.logicalWidth = rect.width;
        this.logicalHeight = rect.height;

        this.canvas.width = this.logicalWidth * this.dpr;
        this.canvas.height = this.logicalHeight * this.dpr;
        this.canvas.style.width = `${this.logicalWidth}px`;
        this.canvas.style.height = `${this.logicalHeight}px`;
        
        // Use setTransform to avoid cumulative scaling from multiple resize events
        this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

        // Immediate redraw to prevent flickering during resize
        this.draw();
    }

    initEventListeners() {
        // Elite Layout Tracking
        const resizeObserver = new ResizeObserver(() => this.setupCanvas());
        resizeObserver.observe(this.container);

        // Zoom (Ctrl + Scroll)
        this.canvas.addEventListener('wheel', (e) => {
            if (e.ctrlKey) {
                e.preventDefault();
                this.handleZoom(e);
            }
        }, { passive: false });

        // Input Handling
        this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        window.addEventListener('mousemove', (e) => this.onMouseMove(e));
        window.addEventListener('mouseup', (e) => this.onMouseUp(e));
        
        // Deselect on click outside
        this.container.addEventListener('click', (e) => {
            if (e.target === this.container) state.set({ selectedBoxId: null });
        });
    }

    onMouseDown(e) {
        const { x, y } = this.getMousePos(e);
        const imgPos = this.screenToImage(x, y);

        console.log(`🎨 Canvas Click at Image Coords: [${Math.round(imgPos.x)}, ${Math.round(imgPos.y)}]`);

        // 1. Panning (Middle Click or Alt+Left)
        if (e.button === 1 || (e.button === 0 && e.altKey)) {
            state.set({ isPanning: true });
            this.lastMousePos = { x: e.clientX, y: e.clientY };
            return;
        }

        if (e.button !== 0) return;

        // 2. Interaction with existing boxes (Select / Move / Resize)
        const hit = this.hitTest(imgPos.x, imgPos.y);
        
        if (hit) {
            state.set({ selectedBoxId: hit.boxId });
            this.interaction = {
                type: hit.handle ? 'resize' : 'move',
                handle: hit.handle,
                boxId: hit.boxId,
                startImgPos: imgPos,
                startBox: { ...state.data.annotations.find(b => b.id === hit.boxId) }
            };
            return;
        }

        // Draw mode - Create new box
        if (state.data.mode === 'draw' && !state.data.isPanning && state.data.currentImageBitmap) {
            const imgWidth = state.data.currentImageBitmap.width;
            const imgHeight = state.data.currentImageBitmap.height;

            // Constrain start position
            const startX = Math.max(0, Math.min(imgPos.x, imgWidth));
            const startY = Math.max(0, Math.min(imgPos.y, imgHeight));

            const newId = Date.now();
            const newBox = {
                id: newId,
                x: startX,
                y: startY,
                width: 0,
                height: 0,
                classId: state.data.selectedClassId !== null ? state.data.selectedClassId : -1
            };
            
            state.set({
                annotations: [...state.data.annotations, newBox],
                selectedBoxId: newId
            });
            
            this.interaction = {
                type: 'draw',
                boxId: newId,
                startImgPos: { x: startX, y: startY }
            };
        } else {
            state.set({ selectedBoxId: null });
        }
    }

    onMouseMove(e) {
        const { x, y } = this.getMousePos(e);
        const imgPos = this.screenToImage(x, y);

        // Panning
        if (state.data.isPanning) {
            const dx = e.clientX - this.lastMousePos.x;
            const dy = e.clientY - this.lastMousePos.y;
            state.set({ pan: { x: state.data.pan.x + dx, y: state.data.pan.y + dy } });
            this.lastMousePos = { x: e.clientX, y: e.clientY };
        }

        // Box Interaction
        if (this.interaction) {
            this.handleInteraction(imgPos);
        } else {
            // Hover check
            const hit = this.hitTest(imgPos.x, imgPos.y);
            state.set({ hoveredBoxId: hit ? hit.boxId : null });
            this.canvas.style.cursor = hit ? (hit.handle ? 'nwse-resize' : 'move') : (state.data.mode === 'draw' ? 'crosshair' : 'default');
        }

        this.updateCrosshair(e);
    }

    onMouseUp() {
        if (this.interaction && this.interaction.type === 'draw') {
            const { boxId } = this.interaction;
            const box = state.data.annotations.find(b => b.id === boxId);
            if (box && box.classId === -1) {
                window.dispatchEvent(new CustomEvent('request-new-class', { detail: { boxId } }));
            }
        }

        state.set({ isPanning: false });
        this.interaction = null;
    }

    handleInteraction(imgPos) {
        if (!state.data.currentImageBitmap) return;

        const { type, boxId, startImgPos, startBox, handle } = this.interaction;
        const imgWidth = state.data.currentImageBitmap.width;
        const imgHeight = state.data.currentImageBitmap.height;

        const dx = imgPos.x - startImgPos.x;
        const dy = imgPos.y - startImgPos.y;

        const annotations = state.data.annotations.map(box => {
            if (box.id !== boxId) return box;

            if (type === 'draw') {
                const curX = Math.max(0, Math.min(imgPos.x, imgWidth));
                const curY = Math.max(0, Math.min(imgPos.y, imgHeight));
                
                return {
                    ...box,
                    x: Math.min(startImgPos.x, curX),
                    y: Math.min(startImgPos.y, curY),
                    width: Math.abs(startImgPos.x - curX),
                    height: Math.abs(startImgPos.y - curY)
                };
            }

            if (type === 'move') {
                let newX = startBox.x + dx;
                let newY = startBox.y + dy;

                // Constrain position
                newX = Math.max(0, Math.min(newX, imgWidth - startBox.width));
                newY = Math.max(0, Math.min(newY, imgHeight - startBox.height));

                return { ...box, x: newX, y: newY };
            }

            if (type === 'resize') {
                const b = { ...box };
                if (handle.includes('e')) {
                    b.width = Math.max(5, Math.min(startBox.width + dx, imgWidth - startBox.x));
                }
                if (handle.includes('s')) {
                    b.height = Math.max(5, Math.min(startBox.height + dy, imgHeight - startBox.y));
                }
                if (handle.includes('w')) {
                    const maxAllowedDx = startBox.x;
                    const constrainedDx = Math.max(-maxAllowedDx, dx);
                    const newWidth = Math.max(5, startBox.width - constrainedDx);
                    b.x = startBox.x + (startBox.width - newWidth);
                    b.width = newWidth;
                }
                if (handle.includes('n')) {
                    const maxAllowedDy = startBox.y;
                    const constrainedDy = Math.max(-maxAllowedDy, dy);
                    const newHeight = Math.max(5, startBox.height - constrainedDy);
                    b.y = startBox.y + (startBox.height - newHeight);
                    b.height = newHeight;
                }
                return b;
            }
            return box;
        });

        state.set({ annotations });
    }

    hitTest(x, y) {
        const handleSize = 8 / state.data.zoom;
        
        // Check in reverse order (top boxes first)
        for (let i = state.data.annotations.length - 1; i >= 0; i--) {
            const box = state.data.annotations[i];
            
            // Check handles if selected
            if (box.id === state.data.selectedBoxId) {
                if (Math.abs(x - (box.x + box.width)) < handleSize && Math.abs(y - (box.y + box.height)) < handleSize) return { boxId: box.id, handle: 'se' };
                // Add more handles later for full 8-point resizing
            }

            // Check body
            if (x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height) {
                return { boxId: box.id, handle: null };
            }
        }
        return null;
    }

    getMousePos(e) {
        const rect = this.canvas.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    handleZoom(e) {
        const zoomSpeed = 0.001;
        const delta = -e.deltaY;
        const factor = Math.pow(1.1, delta / 100); // Smooth exponential zoom
        
        const newZoom = Math.min(Math.max(state.data.zoom * factor, 0.1), 20);
        
        // Zoom towards mouse position
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        // Calculate the mouse position in "Image Space" before zoom
        const worldX = (mouseX - state.data.pan.x) / state.data.zoom;
        const worldY = (mouseY - state.data.pan.y) / state.data.zoom;
        
        // Update pan to keep the mouse point stable
        const newPanX = mouseX - worldX * newZoom;
        const newPanY = mouseY - worldY * newZoom;
        
        state.set({ 
            zoom: newZoom,
            pan: { x: newPanX, y: newPanY }
        });
    }

    updateCrosshair(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const vLine = document.getElementById('crosshair-v');
        const hLine = document.getElementById('crosshair-h');
        
        if (x >= 0 && x <= rect.width && y >= 0 && y <= rect.height) {
            vLine.classList.remove('hidden');
            hLine.classList.remove('hidden');
            vLine.style.left = `${x}px`;
            hLine.style.top = `${y}px`;
            
            // Update coordinate display
            const imgCoord = this.screenToImage(x, y);
            document.getElementById('coord-display').textContent = `X: ${Math.round(imgCoord.x)}, Y: ${Math.round(imgCoord.y)}`;
        } else {
            vLine.classList.add('hidden');
            hLine.classList.add('hidden');
        }
    }

    /**
     * Convert Screen coordinates to Image pixels
     */
    screenToImage(screenX, screenY) {
        return {
            x: (screenX - state.data.pan.x) / state.data.zoom,
            y: (screenY - state.data.pan.y) / state.data.zoom
        };
    }

    startRenderLoop() {
        const render = () => {
            this.draw();
            requestAnimationFrame(render);
        };
        requestAnimationFrame(render);
    }

    draw() {
        const { zoom, pan, currentImageBitmap, annotations } = state.data;
        
        // 1. Clear with Theme Background (using logical dimensions)
        this.ctx.fillStyle = '#0f1115';
        this.ctx.fillRect(0, 0, this.logicalWidth, this.logicalHeight);
        
        // 2. Draw Subtle Grid
        this.drawGrid(zoom, pan);
        
        this.ctx.save();
        this.ctx.translate(pan.x, pan.y);
        this.ctx.scale(zoom, zoom);
        
        // 3. Draw Image
        if (currentImageBitmap) {
            this.ctx.drawImage(currentImageBitmap, 0, 0);
        }
        
        // 4. Draw Annotations
        this.drawAnnotations(annotations);
        
        this.ctx.restore();
    }

    drawGrid(zoom, pan) {
        const gridSize = 32 * zoom;
        const offsetX = pan.x % gridSize;
        const offsetY = pan.y % gridSize;
        
        this.ctx.beginPath();
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
        this.ctx.lineWidth = 1;
        
        for (let x = offsetX; x < this.logicalWidth; x += gridSize) {
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.logicalHeight);
        }
        for (let y = offsetY; y < this.logicalHeight; y += gridSize) {
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.logicalWidth, y);
        }
        this.ctx.stroke();
    }

    drawAnnotations(annotations) {
        const { selectedBoxId, hoveredBoxId, zoom, classes } = state.data;
        
        annotations.forEach(box => {
            const isSelected = box.id === selectedBoxId;
            const isHovered = box.id === hoveredBoxId;
            const cls = classes.find(c => c.id === box.classId);
            const color = cls ? cls.color : '#ffffff';

            this.ctx.save();
            
            // 1. Draw Box Body (Subtle fill)
            this.ctx.fillStyle = isSelected ? `${color}33` : (isHovered ? `${color}11` : 'transparent');
            this.ctx.fillRect(box.x, box.y, box.width, box.height);

            // 2. Draw Border
            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = (isSelected ? 3 : (isHovered ? 2 : 1)) / zoom;
            
            if (isSelected) {
                this.ctx.shadowBlur = 10 / zoom;
                this.ctx.shadowColor = color;
            }
            
            this.ctx.strokeRect(box.x, box.y, box.width, box.height);

            // 3. Draw Handles (only for selected)
            if (isSelected) {
                this.drawHandles(box, color);
            }

            // 4. Draw Label
            const label = cls ? cls.name : 'Pending...';
            this.drawLabel(box, label, color);

            this.ctx.restore();
        });
    }

    drawHandles(box, color) {
        const size = 8 / state.data.zoom;
        this.ctx.fillStyle = '#fff';
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 1 / state.data.zoom;

        // Bottom-Right handle
        this.ctx.fillRect(box.x + box.width - size/2, box.y + box.height - size/2, size, size);
        this.ctx.strokeRect(box.x + box.width - size/2, box.y + box.height - size/2, size, size);
    }

    drawLabel(box, name, color) {
        const fontSize = 12 / state.data.zoom;
        this.ctx.font = `600 ${fontSize}px var(--font-main)`;
        
        const padding = 4 / state.data.zoom;
        const textWidth = this.ctx.measureText(name).width;
        const bgWidth = textWidth + padding * 2;
        const bgHeight = fontSize + padding * 2;

        this.ctx.fillStyle = color;
        this.ctx.fillRect(box.x, box.y - bgHeight, bgWidth, bgHeight);

        this.ctx.fillStyle = '#fff';
        this.ctx.fillText(name, box.x + padding, box.y - padding);
    }
}
