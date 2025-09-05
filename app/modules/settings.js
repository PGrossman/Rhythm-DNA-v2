import Store from 'electron-store';
import { app } from 'electron';

export class SettingsStore {
    constructor() {
        console.log('SettingsStore module initialized');
        
        this.store = new Store({
            defaults: {
                databaseFolder: null,
                autoUpdateDB: true,
                creativeModel: 'qwen3:8b',
                technicalConcurrency: 4,
                creativeConcurrency: 2
            }
        });
    }
    
    get(key) {
        return this.store.get(key);
    }
    
    set(key, value) {
        this.store.set(key, value);
    }
    
    getAll() {
        return this.store.store;
    }
    
    update(settings) {
        Object.keys(settings).forEach(key => {
            this.store.set(key, settings[key]);
        });
    }
    
    getDatabaseFolder() {
        return this.store.get('databaseFolder');
    }
    
    setDatabaseFolder(path) {
        this.store.set('databaseFolder', path);
    }
}


