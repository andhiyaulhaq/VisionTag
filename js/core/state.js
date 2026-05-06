/**
 * SharpTensor State Management
 * Follows the Observer pattern for reactive UI updates.
 */

export class AppState {
    constructor() {
        this.data = {
            folderHandle: null,
            labelFolderHandle: null,
            labelSegFolderHandle: null,
            currentTask: 'detection', // 'detection' | 'segmentation'
            images: [], // { name, handle, status: 'pending'|'labeled' }
            currentImageIndex: -1,
            currentImageBitmap: null,
            annotations: [], // { id, x, y, width, height, classId }
            selectedBoxId: null,
            hoveredBoxId: null,
            classes: [],
            selectedClassId: null,
            zoom: 1.0,
            pan: { x: 0, y: 0 },
            isPanning: false,
            interactionMode: 'select', // 'select' | 'draw' | 'magic'
            loading: false,

            // AI State
            aiModel: null, // { name }
            isAutoLabeling: false,
            autoLabelProgress: 0,
            modelStatus: 'idle', // 'idle' | 'loading' | 'ready' | 'error'
            
            // SAM Specific
            activeMask: null,
            promptPoints: [], // { x, y, label }
            activePromptBox: null, // [x1, y1, x2, y2]
            samLatency: { encoder: 0, decoder: 0 }
        };
        
        this.undoStack = [];
        this.redoStack = [];
        this.listeners = [];
    }

    /**
     * Snapshots current annotations for Undo/Redo
     */
    saveHistory() {
        const snapshot = JSON.stringify(this.data.annotations);
        // Only save if different from last
        if (this.undoStack.length > 0 && this.undoStack[this.undoStack.length - 1] === snapshot) return;
        
        this.undoStack.push(snapshot);
        if (this.undoStack.length > 50) this.undoStack.shift();
        this.redoStack = []; // New action clears redo stack
    }

    undo() {
        if (this.undoStack.length === 0) return;
        
        // Capture current state for redo
        const currentState = JSON.stringify(this.data.annotations);
        this.redoStack.push(currentState);
        
        const previousSnapshot = this.undoStack.pop();
        const previous = JSON.parse(previousSnapshot);
        this.set({ annotations: previous });
    }

    redo() {
        if (this.redoStack.length === 0) return;
        
        // Capture current state for undo
        const currentState = JSON.stringify(this.data.annotations);
        this.undoStack.push(currentState);
        
        const nextSnapshot = this.redoStack.pop();
        const next = JSON.parse(nextSnapshot);
        this.set({ annotations: next });
    }

    /**
     * Subscribe to state changes
     */
    subscribe(callback) {
        this.listeners.push(callback);
        return () => {
            this.listeners = this.listeners.filter(l => l !== callback);
        };
    }

    /**
     * Update state and notify listeners
     */
    set(partialData) {
        const oldState = { ...this.data };
        this.data = { ...this.data, ...partialData };
        this.notify(oldState);
    }

    notify(oldState) {
        this.listeners.forEach(callback => callback(this.data, oldState));
    }

    /**
     * Helper to get current image
     */
    get currentImage() {
        if (this.data.currentImageIndex < 0) return null;
        return this.data.images[this.data.currentImageIndex];
    }
}

// Singleton instance
export const state = new AppState();
