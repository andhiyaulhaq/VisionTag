/**
 * <vt-tool-button>
 * Encapsulates a toolbar button with premium hover/active states.
 * Attributes:
 * - id: Button ID
 * - title: Tooltip text
 * - icon: SVG content
 * - disabled: Boolean
 */
export class ToolButton extends HTMLElement {
    static get observedAttributes() { return ['disabled', 'title', 'class']; }

    get disabled() { return this.hasAttribute('disabled'); }
    set disabled(val) {
        if (val) this.setAttribute('disabled', '');
        else this.removeAttribute('disabled');
    }

    get title() { return this.getAttribute('title'); }
    set title(val) { this.setAttribute('title', val); }

    connectedCallback() {
        if (this._initialized) return;
        this.renderInitial();
        this._initialized = true;
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (!this._initialized) return;
        this.syncState();
    }

    renderInitial() {
        const title = this.getAttribute('title') || '';
        const disabled = this.hasAttribute('disabled');
        const isActive = this.classList.contains('active');
        
        this._originalIcon = this.innerHTML;

        this.innerHTML = `
            <button class="tool-inner w-9 h-9 border-none bg-transparent text-(--text-secondary) rounded-[6px] cursor-pointer flex items-center justify-center transition-all duration-200 ease-[cubic-bezier(0.175,0.885,0.32,1.275)] hover:bg-(--bg-hover) hover:text-(--text-primary) hover:translate-y-[-2px] active:bg-(--accent) active:text-(--accent-text) active:shadow-[0_0_15px_var(--accent-glow)] active:translate-y-0 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:grayscale disabled:pointer-events-none"
                ${disabled ? 'disabled' : ''} 
                title="${title}">
                <span class="flex items-center justify-center shrink-0">
                    ${this._originalIcon}
                </span>
            </button>
        `;
        this.syncState();
    }

    syncState() {
        const btn = this.querySelector('.tool-inner');
        if (!btn) return;

        btn.disabled = this.hasAttribute('disabled');
        
        if (this.hasAttribute('title')) {
            btn.title = this.getAttribute('title');
        }
    }
}

customElements.define('st-tool-button', ToolButton);
