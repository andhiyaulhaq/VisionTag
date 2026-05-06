/**
 * <vt-modal>
 * Handles the double-wrapper logic and basic modal structure.
 * Attributes:
 * - id: Modal ID
 * - title: Modal title text
 */
export class AppModal extends HTMLElement {
    static get observedAttributes() { return ['title', 'hidden', 'class']; }

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
        const title = this.getAttribute('title') || 'Alert';
        // Default to hidden if neither attribute nor class is present
        const isHidden = this.hasAttribute('hidden') || this.classList.contains('hidden') || !this._initialized;

        this.innerHTML = `
            <div class="modal-root absolute inset-0 z-[1000] ${isHidden ? 'hidden' : ''}">
                <div class="w-full h-full bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
                    <div class="modal-card bg-(--bg-sidebar) border-t border-white/20 rounded-[20px] w-full max-w-[440px] shadow-[0_20px_50px_rgba(0,0,0,0.5),inset_0_0_0_1px_rgba(255,255,255,0.05)] p-8 animate-[modal-in_0.3s_cubic-bezier(0.34,1.56,0.64,1)]">
                        <h2 class="modal-title font-(--font-heading) text-[1.5rem] mb-3 text-(--text-primary)">${title}</h2>
                        <div class="mb-6">
                            <p class="modal-message text-(--text-secondary) leading-[1.6] text-[1rem]">Modal message goes here.</p>
                            <input type="text" class="modal-input w-full bg-[#242C2E]/50 border border-(--border) px-4 py-3 rounded-[8px] text-white text-[1rem] mt-4 mb-6 outline-none transition-all duration-200 shadow-[inset_0_2px_4px_rgba(0,0,0,0.1)] focus:border-(--accent) focus:bg-[#242C2E]/80 focus:ring-4 focus:ring-(--accent-glow) hidden" placeholder="">
                            
                            <div class="modal-progress-container hidden mt-6">
                                <div class="w-full bg-black/30 h-2 rounded-full overflow-hidden border border-white/5">
                                    <div class="modal-progress-fill h-full bg-(--accent) shadow-[0_0_8px_var(--accent-glow)] transition-all duration-75" style="width: 0%"></div>
                                </div>
                                <p class="modal-progress-text text-[0.75rem] text-(--text-muted) mt-3 font-mono text-center">0 / 0 images</p>
                            </div>
                        </div>
                        <div class="modal-actions flex justify-end gap-3">
                            <button class="modal-cancel inline-flex items-center justify-center px-4 py-2 rounded-lg font-semibold bg-(--bg-card) border border-(--border) hover:bg-(--bg-hover) transition-all">Cancel</button>
                            <button class="modal-confirm inline-flex items-center justify-center px-4 py-2 rounded-lg font-semibold bg-(--accent) text-(--accent-text) hover:bg-(--accent-light) shadow-[0_4px_12px_var(--accent-glow)] transition-all">Confirm</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    syncState() {
        const root = this.querySelector('.modal-root');
        if (!root) return;
        
        const isHidden = this.hasAttribute('hidden') || this.classList.contains('hidden');
        root.classList.toggle('hidden', isHidden);
        
        const titleEl = this.querySelector('.modal-title');
        if (titleEl && this.hasAttribute('title')) {
            titleEl.textContent = this.getAttribute('title');
        }
    }
}

customElements.define('st-modal', AppModal);
