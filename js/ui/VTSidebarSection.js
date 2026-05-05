import { BaseComponent } from './BaseComponent.js';

/**
 * VTSidebarSection - Sidebar block with header
 * Attributes:
 * - title: The section title
 * - icon: (optional) section icon
 */
export class VTSidebarSection extends BaseComponent {
    static get observedAttributes() {
        return ['title', 'icon'];
    }

    render() {
        const title = this.getAttribute('title') || '';
        const icon = this.getAttribute('icon') || '';
        
        // Check if structure already exists
        let body = this.querySelector('.section-body');
        let header = this.querySelector('.section-header h3');
        let actions = this.querySelector('.section-actions');

        if (!body) {
            // Initial render: setup structure and move existing children
            this.withPausedObserver(() => {
                const children = Array.from(this.childNodes);
                
                this.innerHTML = `
                    <div class="sidebar-section">
                        <div class="section-header">
                            <h3></h3>
                            <div class="section-actions"></div>
                        </div>
                        <div class="section-body"></div>
                    </div>
                `;

                body = this.querySelector('.section-body');
                actions = this.querySelector('.section-actions');
                header = this.querySelector('.section-header h3');

                children.forEach(child => {
                    if (child.slot === 'action') {
                        actions.appendChild(child);
                    } else {
                        body.appendChild(child);
                    }
                });
            });
        }

        // Always update the header/title info
        if (header) {
            this.withPausedObserver(() => {
                header.innerHTML = `${icon ? `<span class="section-icon">${icon}</span> ` : ''}${title}`;
            });
        }
    }
}

customElements.define('vt-sidebar-section', VTSidebarSection);
