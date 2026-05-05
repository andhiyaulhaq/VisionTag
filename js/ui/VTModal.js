import { BaseComponent } from './BaseComponent.js';

/**
 * VTModal - Standardized Modal Component
 */
export class VTModal extends BaseComponent {
    constructor() {
        super();
        this._onConfirm = null;
        this._onCancel = null;
    }

    show({ title, message, inputPlaceholder = '', confirmText = 'Confirm', cancelText = 'Cancel', onConfirm, onCancel }) {
        this.setAttribute('title', title);
        this.setAttribute('message', message);
        this.setAttribute('placeholder', inputPlaceholder);
        this.setAttribute('confirm-text', confirmText);
        this.setAttribute('cancel-text', cancelText);
        
        this._onConfirm = onConfirm;
        this._onCancel = onCancel;
        
        this.render();
        this.classList.remove('hidden');
        
        const input = this.querySelector('.modal-input');
        if (inputPlaceholder) {
            input.classList.remove('hidden');
            input.value = '';
            setTimeout(() => input.focus(), 100);
        } else {
            input.classList.add('hidden');
        }
    }

    hide() {
        this.classList.add('hidden');
    }

    connectedCallback() {
        super.connectedCallback();
        this.classList.add('modal-overlay');
        if (!this.getAttribute('title')) this.classList.add('hidden');
    }

    render() {
        const title = this.getAttribute('title') || 'Modal';
        const message = this.getAttribute('message') || '';
        const placeholder = this.getAttribute('placeholder') || '';
        const confirmText = this.getAttribute('confirm-text') || 'Confirm';
        const cancelText = this.getAttribute('cancel-text') || 'Cancel';

        // Elite logic: Auto-detect danger mode
        const isDanger = /delete|purge|irreversible|critical|nuclear|🚨|☢️/i.test(title + message);

        this.setHTML(`
            <div class="modal-card ${isDanger ? 'danger' : ''}">
                <h2 class="modal-title">${title}</h2>
                <div class="modal-body">
                    <p class="modal-message">${message}</p>
                    <input type="text" class="modal-input hidden" placeholder="${placeholder}">
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary modal-cancel">${cancelText}</button>
                    <button class="btn ${isDanger ? 'btn-danger' : 'btn-primary'} modal-confirm">${confirmText}</button>
                </div>
            </div>
        `);

        this.querySelector('.modal-confirm').onclick = () => {
            const val = this.querySelector('.modal-input').value.trim();
            this.hide();
            if (this._onConfirm) this._onConfirm(val);
        };

        this.querySelector('.modal-cancel').onclick = () => {
            this.hide();
            if (this._onCancel) this._onCancel();
        };
    }
}

customElements.define('vt-modal', VTModal);
