import { BaseComponent } from './BaseComponent.js';

/**
 * VTBadge - Counter and Status Indicator
 * Attributes:
 * - variant: default, primary, success, warning, error
 */
export class VTBadge extends BaseComponent {
    static get observedAttributes() {
        return ['variant', 'value'];
    }

    connectedCallback() {
        super.connectedCallback();
    }

    render() {
        if (!this._isInitialized) return;
        const variant = this.getAttribute('variant') || 'default';
        const value = this.getAttribute('value') || this._value || this.textContent || '0';
        
        this.setHTML(`<span class="badge badge-${variant}">${value}</span>`);
    }

    set value(val) {
        this._value = val;
        this.render();
    }
}

customElements.define('vt-badge', VTBadge);
