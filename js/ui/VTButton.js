import { BaseComponent } from './BaseComponent.js';

/**
 * VTButton - Reusable button component
 * Attributes: 
 * - variant: primary, secondary, outline, danger
 * - icon: (optional) svg name or html
 * - size: sm, md, lg
 * - disabled: boolean
 */
export class VTButton extends BaseComponent {
    static get observedAttributes() {
        return ['variant', 'icon', 'size', 'disabled', 'title', 'class'];
    }

    connectedCallback() {
        super.connectedCallback();
    }

    render() {
        if (!this._isInitialized) return;

        const variant = this.getAttribute('variant') || 'secondary';
        const size = this.getAttribute('size') || 'md';
        const icon = this.getAttribute('icon');
        const title = this.getAttribute('title');
        const isDisabled = this.hasAttribute('disabled');
        const extraClass = this.getAttribute('class') || '';

        // Only create the initial structure if it doesn't exist
        if (!this.querySelector('button')) {
            this.setHTML(`
                <button>
                    <span class="btn-icon"></span>
                    <span class="btn-label">${this.textContent}</span>
                </button>
            `);
        }

        const btn = this.querySelector('button');
        const iconContainer = this.querySelector('.btn-icon');
        const labelContainer = this.querySelector('.btn-label');

        btn.className = [`btn`, `btn-${variant}`, `btn-${size}`, extraClass].filter(Boolean).join(' ');
        if (title) btn.title = title;
        else btn.removeAttribute('title');
        
        btn.disabled = isDisabled;

        this.withPausedObserver(() => {
            if (icon) {
                iconContainer.innerHTML = icon;
                iconContainer.style.display = '';
            } else {
                iconContainer.style.display = 'none';
            }

            const label = this.getAttribute('label');
            if (label && !this.textContent.trim()) {
                labelContainer.textContent = label;
            }
        });
    }

    get disabled() {
        return this.hasAttribute('disabled');
    }

    set disabled(val) {
        if (val) this.setAttribute('disabled', '');
        else this.removeAttribute('disabled');
    }
}

customElements.define('vt-button', VTButton);
