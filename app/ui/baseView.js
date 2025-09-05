// BaseView - Abstract base for all views
export class BaseView {
    #locked = false;
    #container = null;
    #name = '';
    
    constructor(name, container) {
        if (new.target === BaseView) {
            throw new Error('BaseView is abstract - do not instantiate directly');
        }
        this.#name = name;
        this.#container = container;
        console.log(`BaseView '${name}' constructed`);
    }
    
    lock() {
        if (this.#locked) {
            console.warn(`View '${this.#name}' already locked`);
            return;
        }
        this.#locked = true;
        this.#disableInteractivity();
        this.#addLockIndicator();
    }
    
    unlock() {
        if (!this.#locked) {
            console.warn(`View '${this.#name}' not locked`);
            return;
        }
        this.#locked = false;
        this.#enableInteractivity();
        this.#removeLockIndicator();
    }
    
    isLocked() {
        return this.#locked;
    }
    
    render() {
        if (this.#locked) {
            console.warn(`Cannot render '${this.#name}' - view is locked`);
            return false;
        }
        this.#container.innerHTML = this.getHTML();
        this.attachEventListeners();
        return true;
    }
    
    show() {
        this.#container.style.display = 'block';
    }
    
    hide() {
        this.#container.style.display = 'none';
    }
    
    // Protected methods for subclasses
    getHTML() {
        throw new Error('Subclass must implement getHTML()');
    }
    
    attachEventListeners() {
        // Override in subclass if needed
    }
    
    #disableInteractivity() {
        const elements = this.#container.querySelectorAll('button, input, select, textarea');
        elements.forEach(el => {
            el.disabled = true;
            el.dataset.wasDisabled = el.dataset.wasDisabled || 'false';
        });
    }
    
    #enableInteractivity() {
        const elements = this.#container.querySelectorAll('button, input, select, textarea');
        elements.forEach(el => {
            if (el.dataset.wasDisabled !== 'true') {
                el.disabled = false;
            }
        });
    }
    
    #addLockIndicator() {
        const indicator = document.createElement('div');
        indicator.className = 'lock-indicator';
        indicator.innerHTML = '🔒 View Locked';
        indicator.style.cssText = 'position:absolute;top:8px;right:8px;padding:4px 8px;background:#ffc107;border-radius:4px;font-size:12px;';
        this.#container.style.position = 'relative';
        this.#container.appendChild(indicator);
    }
    
    #removeLockIndicator() {
        const indicator = this.#container.querySelector('.lock-indicator');
        if (indicator) {
            indicator.remove();
        }
    }
}

