// Settings Store - uses electron-store for persistence
import Store from 'electron-store';

export class SettingsStore {
    constructor() {
        console.log('SettingsStore module initialized');
        
        // Initialize electron-store with schema and defaults
        this.store = new Store({
            schema: {
                dbFolder: {
                    type: 'string',
                    default: ''
                },
                autoUpdateDb: {
                    type: 'boolean',
                    default: true
                },
                creativeModel: {
                    type: 'string',
                    default: 'qwen3:8b',
                    enum: ['qwen3:8b', 'qwen3:30b']
                },
                concurrencyTech: {
                    type: 'number',
                    default: 4,
                    minimum: 1,
                    maximum: 16
                },
                concurrencyCreative: {
                    type: 'number',
                    default: 2,
                    minimum: 1,
                    maximum: 8
                }
            }
        });
    }
    
    getSettings() {
        return {
            dbFolder: this.store.get('dbFolder'),
            autoUpdateDb: this.store.get('autoUpdateDb'),
            creativeModel: this.store.get('creativeModel'),
            concurrencyTech: this.store.get('concurrencyTech'),
            concurrencyCreative: this.store.get('concurrencyCreative')
        };
    }
    
    updateSettings(partialSettings) {
        // Validate and update only provided settings
        const allowedKeys = ['dbFolder', 'autoUpdateDb', 'creativeModel', 'concurrencyTech', 'concurrencyCreative'];
        
        for (const [key, value] of Object.entries(partialSettings)) {
            if (allowedKeys.includes(key)) {
                this.store.set(key, value);
                console.log(`Setting updated: ${key} = ${value}`);
            }
        }
        
        return this.getSettings();
    }
    
    resetToDefaults() {
        this.store.clear();
        console.log('Settings reset to defaults');
        return this.getSettings();
    }
}
