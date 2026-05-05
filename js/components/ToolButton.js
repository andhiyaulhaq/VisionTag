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
    connectedCallback() {
        const id = this.getAttribute('id') || '';
        const title = this.getAttribute('title') || '';
        const disabled = this.hasAttribute('disabled');
        const icon = this.innerHTML;

        this.innerHTML = `
            <button id="${id}" 
                class="w-9 h-9 border-none bg-transparent text-(--text-secondary) rounded-[6px] cursor-pointer flex items-center justify-center transition-all duration-200 ease-[cubic-bezier(0.175,0.885,0.32,1.275)] hover:bg-(--bg-hover) hover:text-(--text-primary) hover:translate-y-[-2px] active:bg-(--accent) active:text-white active:shadow-[0_0_15px_var(--accent-glow)] active:translate-y-0 active:scale-95 [&.active]:bg-(--accent) [&.active]:text-white [&.active]:shadow-[0_0_15px_var(--accent-glow)] [&.active]:translate-y-0 [&.active]:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:grayscale disabled:pointer-events-none"
                ${disabled ? 'disabled' : ''} 
                title="${title}">
                <span class="flex items-center justify-center shrink-0">
                    ${icon}
                </span>
            </button>
        `;
    }
}

customElements.define('vt-tool-button', ToolButton);
