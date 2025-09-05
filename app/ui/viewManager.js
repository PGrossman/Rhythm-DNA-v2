// ViewManager - Orchestrates all views and locking
export class ViewManager {
    #views = new Map();
    #lockedViews = new Set();
    #currentView = null;
    
    constructor() {
        console.log('ViewManager initialized');
    }
    
    registerView(name, view) {
        if (this.#views.has(name)) {
            throw new Error(`View '${name}' already registered`);
        }
        this.#views.set(name, view);
        console.log(`View '${name}' registered`);
    }
    
    getView(name) {
        return this.#views.get(name);
    }
    
    lockView(name) {
        const view = this.#views.get(name);
        if (!view) {
            console.error(`Cannot lock - view '${name}' not found`);
            return false;
        }
        if (this.#lockedViews.has(name)) {
            console.warn(`View '${name}' already locked`);
            return false;
        }
        view.lock();
        this.#lockedViews.add(name);
        console.log(`View '${name}' locked`);
        return true;
    }
    
    unlockView(name) {
        const view = this.#views.get(name);
        if (!view) {
            console.error(`Cannot unlock - view '${name}' not found`);
            return false;
        }
        if (!this.#lockedViews.has(name)) {
            console.warn(`View '${name}' not locked`);
            return false;
        }
        view.unlock();
        this.#lockedViews.delete(name);
        console.log(`View '${name}' unlocked`);
        return true;
    }
    
    isLocked(name) {
        return this.#lockedViews.has(name);
    }
    
    switchToView(name) {
        const view = this.#views.get(name);
        if (!view) {
            console.error(`Cannot switch - view '${name}' not found`);
            return false;
        }
        this.#currentView = name;
        return true;
    }
    
    getCurrentView() {
        return this.#currentView;
    }
}

