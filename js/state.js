/**
 * VisionTag State Management
 * Follows the Observer pattern for reactive UI updates.
 */

export class AppState {
    constructor() {
        this.data = {
            folderHandle: null,
            images: [], // { name, handle, status: 'pending'|'labeled' }
            currentImageIndex: -1,
            currentImageBitmap: null,
            annotations: [], // { id, x, y, width, height, classId }
            selectedBoxId: null,
            hoveredBoxId: null,
            classes: [],
            selectedClassId: null,
            mode: 'select', // 'select' | 'draw'
            zoom: 1.0,
            pan: { x: 0, y: 0 },
            isPanning: false,
            loading: false
        };
        
        this.listeners = [];
    }

    /**
     * Subscribe to state changes
     * @param {Function} callback 
     */
    subscribe(callback) {
        this.listeners.push(callback);
        return () => {
            this.listeners = this.listeners.filter(l => l !== callback);
        };
    }

    /**
     * Update state and notify listeners
     * @param {Object} partialData 
     */
    set(partialData) {
        const oldState = { ...this.data };
        this.data = { ...this.data, ...partialData };
        
        // Notify if anything changed
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
