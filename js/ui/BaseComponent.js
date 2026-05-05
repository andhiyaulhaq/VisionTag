/**
 * BaseComponent - A lightweight base class for Native Web Components
 */
export class BaseComponent extends HTMLElement {
    constructor() {
        super();
        this._props = {};
        this._isRendering = false;
        this._isInitialized = false;
    }

    /**
     * Define component properties that should trigger a re-render on change
     */
    static get observedAttributes() {
        return [];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue !== newValue && this._isInitialized && !this._isRendering) {
            this.render();
        }
    }

    connectedCallback() {
        this._isInitialized = true;
        this._setupObserver();
        this.render();
    }

    _setupObserver() {
        if (this._observer) return;
        this._observer = new MutationObserver(() => {
            if (!this._isRendering && this._isInitialized) {
                this.render();
            }
        });
        this._observer.observe(this, { childList: true, subtree: false });
    }

    disconnectedCallback() {
        if (this._observer) {
            this._observer.disconnect();
            this._observer = null;
        }
    }

    /**
     * Helper to dispatch custom events
     */
    emit(eventName, detail = {}) {
        this.dispatchEvent(new CustomEvent(eventName, {
            detail,
            bubbles: true,
            composed: true
        }));
    }

    /**
     * Abstract render method to be implemented by child classes
     */
    render() {
        // To be implemented by children
    }

    /**
     * Safely perform DOM manipulations without triggering the mutation observer
     */
    withPausedObserver(fn) {
        const wasRendering = this._isRendering;
        this._isRendering = true;
        
        if (this._observer) this._observer.disconnect();
        
        try {
            fn();
        } finally {
            if (this._observer) {
                this._observer.observe(this, { childList: true, subtree: false });
            }
            this._isRendering = wasRendering;
        }
    }

    /**
     * Utility to clear and set HTML content safely without triggering loops
     */
    setHTML(html) {
        this.withPausedObserver(() => {
            this.innerHTML = html;
        });
    }
}
