/**
 * <vt-sidebar-section>
 * A reusable container for sidebar modules.
 * Attributes: 
 * - title: The section heading
 * - badge-id: (Optional) ID for the counter badge
 * - badge-text: (Optional) Initial badge text
 */
export class SidebarSection extends HTMLElement {
    connectedCallback() {
        // Capture existing content
        const content = this.innerHTML;
        const title = this.getAttribute('title') || '';
        const badgeId = this.getAttribute('badge-id');
        const badgeText = this.getAttribute('badge-text') || '';

        // Apply container styles to the host element itself
        this.className = "py-3 border-b border-(--border) flex flex-col last:border-b-0";

        this.innerHTML = `
            <div class="flex items-center justify-between mb-3">
                <h3 class="text-[0.85rem] font-bold uppercase tracking-wider text-(--text-muted)">${title}</h3>
                <div class="flex items-center">
                    ${badgeId ? `
                        <span id="${badgeId}" class="bg-(--bg-card) text-(--text-secondary) px-2 py-0.5 rounded-full text-[0.7rem] border border-(--border)">
                            ${badgeText}
                        </span>
                    ` : ''}
                </div>
            </div>
            <div class="section-content">
                ${content}
            </div>
        `;
    }
}

customElements.define('st-sidebar-section', SidebarSection);
