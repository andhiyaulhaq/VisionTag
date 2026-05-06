/**
 * SharpTensor Welcome Modal
 * A premium onboarding experience with demo and repository links.
 */
export class WelcomeModal {
    constructor(callbacks) {
        this.callbacks = callbacks; // { onOpenFolder, onTryDemo, onGitHub }
        this.dom = null;
    }

    render() {
        const overlay = document.getElementById('welcome-modal');
        if (!overlay) return;

        overlay.querySelector('#welcome-github').onclick = () => this.callbacks.onGitHub();
        overlay.querySelector('#welcome-open').onclick = () => {
            this.hide();
            this.callbacks.onOpenFolder();
        };
        overlay.querySelector('#welcome-demo').onclick = () => {
            this.hide();
            this.callbacks.onTryDemo();
        };

        this.dom = overlay;

        // Trigger the entry animation in the next frame to ensure it plays reliably
        const card = overlay.querySelector('.welcome-card');
        if (card) {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => card.classList.add('visible'));
            });
        }

        // The "Release": Now that the shield is active, show the app UI as a hint
        const app = document.getElementById('app');
        if (app) {
            app.style.visibility = 'visible';
            app.style.transition = 'opacity 2.5s ease-out';
            requestAnimationFrame(() => app.style.opacity = '1');
        }
    }

    hide() {
        if (this.dom) {
            this.dom.classList.add('hiding');
            this.dom.style.pointerEvents = 'none';
            setTimeout(() => {
                if (this.dom) {
                    this.dom.remove();
                    this.dom = null;
                }
            }, 1200);
        }
    }
}
