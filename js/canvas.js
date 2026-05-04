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

        // 2. Interaction with existing boxes (Select / Move / Resize / Label Dropdown)
        const hit = this.hitTest(imgPos.x, imgPos.y);

        if (hit) {
            if (hit.handle === 'label') {
                this.showClassDropdown(hit.boxId, e.clientX, e.clientY);
                return;
            }

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
                classId: -1
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
            
            if (hit) {
                if (hit.handle === 'label') {
                    this.canvas.style.cursor = 'pointer';
                } else if (hit.handle) {
                    const cursorMap = {
                        nw: 'nwse-resize', se: 'nwse-resize',
                        ne: 'nesw-resize', sw: 'nesw-resize',
                        n: 'ns-resize', s: 'ns-resize',
                        e: 'ew-resize', w: 'ew-resize'
                    };
                    this.canvas.style.cursor = cursorMap[hit.handle] || 'crosshair';
                } else {
                    this.canvas.style.cursor = 'move';
                }
            } else {
                this.canvas.style.cursor = (state.data.mode === 'draw' ? 'crosshair' : 'default');
            }
        }

        this.updateCrosshair(e);
    }

    onMouseUp(e) {
        if (this.interaction && this.interaction.type === 'draw') {
            const { boxId } = this.interaction;
            const box = state.data.annotations.find(b => b.id === boxId);
            
            if (box) {
                // If classes exist, show dropdown. Otherwise, show "New Class" modal.
                if (state.data.classes.length > 0) {
                    this.showClassDropdown(boxId, e.clientX, e.clientY);
                } else {
                    window.dispatchEvent(new CustomEvent('request-new-class', { detail: { boxId } }));
                }
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
        const { annotations, classes, zoom, selectedBoxId } = state.data;
        const handleSize = 8 / zoom;
        const halfSize = handleSize / 2;

        // Check in reverse order (top boxes first)
        for (let i = annotations.length - 1; i >= 0; i--) {
            const box = annotations[i];
            const cls = classes.find(c => c.id === box.classId);

            // 1. Check Label Hit (even if not selected)
            const name = cls ? cls.name : 'Pending...';
            const fontSize = 18 / zoom;
            this.ctx.font = `600 ${fontSize}px 'Inter', system-ui, sans-serif`;
            const padding = 6 / zoom;
            const chevronSize = 8 / zoom;
            const chevronGap = 8 / zoom;

            const textWidth = this.ctx.measureText(name).width;
            const bgWidth = textWidth + padding * 2 + chevronSize + chevronGap;
            const bgHeight = fontSize + padding * 2;

            if (x >= box.x && x <= box.x + bgWidth && y >= box.y - bgHeight && y <= box.y) {
                return { boxId: box.id, handle: 'label' };
            }

            // 2. Check handles if selected
            if (box.id === selectedBoxId) {
                const handles = {
                    nw: { x: box.x, y: box.y },
                    n: { x: box.x + box.width / 2, y: box.y },
                    ne: { x: box.x + box.width, y: box.y },
                    e: { x: box.x + box.width, y: box.y + box.height / 2 },
                    se: { x: box.x + box.width, y: box.y + box.height },
                    s: { x: box.x + box.width / 2, y: box.y + box.height },
                    sw: { x: box.x, y: box.y + box.height },
                    w: { x: box.x, y: box.y + box.height / 2 }
                };

                for (const [name, pos] of Object.entries(handles)) {
                    if (Math.abs(x - pos.x) < halfSize && Math.abs(y - pos.y) < halfSize) {
                        return { boxId: box.id, handle: name };
                    }
                }
            }

            // 3. Check body
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
            const color = cls ? cls.color : '#3b82f6';

            this.ctx.save();

            // 1. Draw Box Body (Subtle fill)
            this.ctx.fillStyle = isSelected ? `${color}33` : (isHovered ? `${color}11` : 'transparent');
            this.ctx.fillRect(box.x, box.y, box.width, box.height);

            // 2. Draw Border
            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = 2 / zoom;

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

        const handles = [
            { x: box.x, y: box.y }, // nw
            { x: box.x + box.width / 2, y: box.y }, // n
            { x: box.x + box.width, y: box.y }, // ne
            { x: box.x + box.width, y: box.y + box.height / 2 }, // e
            { x: box.x + box.width, y: box.y + box.height }, // se
            { x: box.x + box.width / 2, y: box.y + box.height }, // s
            { x: box.x, y: box.y + box.height }, // sw
            { x: box.x, y: box.y + box.height / 2 } // w
        ];

        handles.forEach(pos => {
            this.ctx.fillRect(pos.x - size / 2, pos.y - size / 2, size, size);
            this.ctx.strokeRect(pos.x - size / 2, pos.y - size / 2, size, size);
        });
    }

    drawLabel(box, name, color) {
        const fontSize = 18 / state.data.zoom;
        this.ctx.font = `600 ${fontSize}px 'Inter', system-ui, sans-serif`;

        const padding = 6 / state.data.zoom;
        const chevronSize = 8 / state.data.zoom;
        const chevronGap = 8 / state.data.zoom;
        
        const textWidth = this.ctx.measureText(name).width;
        const bgWidth = textWidth + padding * 2 + chevronSize + chevronGap;
        const bgHeight = fontSize + padding * 2;

        // 1. Background
        this.ctx.fillStyle = color;
        this.ctx.fillRect(box.x, box.y - bgHeight, bgWidth, bgHeight);

        // 2. Text
        this.ctx.fillStyle = '#fff';
        this.ctx.fillText(name, box.x + padding, box.y - padding);

        // 3. Chevron Hint (Small downward triangle)
        const cx = box.x + padding + textWidth + chevronGap;
        const cy = box.y - padding - (fontSize / 2.5); // Adjust for vertical alignment
        
        this.ctx.beginPath();
        this.ctx.moveTo(cx, cy);
        this.ctx.lineTo(cx + chevronSize, cy);
        this.ctx.lineTo(cx + chevronSize/2, cy + chevronSize/2);
        this.ctx.closePath();
        this.ctx.fill();
    }

    showClassDropdown(boxId, clientX, clientY) {
        // Cleanup existing dropdown
        const existing = document.getElementById('class-dropdown-overlay');
        if (existing) existing.remove();

        const dropdown = document.createElement('div');
        dropdown.id = 'class-dropdown-overlay';
        dropdown.className = 'class-dropdown';
        dropdown.style.left = `${clientX}px`;
        dropdown.style.top = `${clientY}px`;

        state.data.classes.forEach(cls => {
            const item = document.createElement('div');
            item.className = 'dropdown-item';
            item.innerHTML = `
                <span class="color-dot" style="background: ${cls.color}"></span>
                <span class="class-name">${cls.name}</span>
            `;
            item.onclick = (e) => {
                e.stopPropagation();
                const annotations = state.data.annotations.map(b => 
                    b.id === boxId ? { ...b, classId: cls.id } : b
                );
                state.set({ annotations });
                dropdown.remove();
            };
            dropdown.appendChild(item);
        });

        document.body.appendChild(dropdown);

        // Close on click outside
        const closeHandler = (e) => {
            if (!dropdown.contains(e.target)) {
                dropdown.remove();
                window.removeEventListener('mousedown', closeHandler);
            }
        };
        setTimeout(() => window.addEventListener('mousedown', closeHandler), 10);
    }
}
