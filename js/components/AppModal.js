/**
 * <vt-modal>
 * Handles the double-wrapper logic and basic modal structure.
 * Attributes:
 * - id: Modal ID
 * - title: Modal title text
 */
export class AppModal extends HTMLElement {
    connectedCallback() {
        const id = this.getAttribute('id') || 'app-modal';
        const title = this.getAttribute('title') || 'Modal Title';

        this.innerHTML = `
            <div id="${id}" class="absolute inset-0 z-[1000] hidden">
                <div class="w-full h-full bg-black/70 backdrop-blur-sm flex items-center justify-center">
                    <div class="modal-card bg-(--bg-sidebar) border-t border-white/20 rounded-[20px] w-[440px] shadow-[0_20px_50px_rgba(0,0,0,0.5),inset_0_0_0_1px_rgba(255,255,255,0.05)] p-8 animate-[modal-in_0.3s_cubic-bezier(0.34,1.56,0.64,1)]">
                        <h2 class="modal-title font-(--font-heading) text-[1.5rem] mb-3 text-(--text-primary)">${title}</h2>
                        <div class="mb-6">
                            <p class="modal-message text-(--text-secondary) leading-[1.6] text-[1rem]">Modal message goes here.</p>
                            <input type="text" class="modal-input w-full bg-[#0f1115]/50 border border-(--border) px-4 py-3 rounded-[8px] text-white text-[1rem] mt-4 mb-6 outline-none transition-all duration-200 shadow-[inset_0_2px_4px_rgba(0,0,0,0.1)] focus:border-(--accent) focus:bg-[#0f1115]/80 focus:ring-4 focus:ring-(--accent-glow) hidden" placeholder="">
                        </div>
                        <div class="flex justify-end gap-3">
                            <button class="modal-cancel inline-flex items-center justify-center px-4 py-2 rounded-lg font-semibold bg-(--bg-card) border border-(--border) hover:bg-(--bg-hover) transition-all">Cancel</button>
                            <button class="modal-confirm inline-flex items-center justify-center px-4 py-2 rounded-lg font-semibold bg-(--accent) text-white hover:bg-(--accent-light) shadow-[0_4px_12px_var(--accent-glow)] transition-all">Confirm</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
}

customElements.define('vt-modal', AppModal);
