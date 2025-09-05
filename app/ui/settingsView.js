import { BaseView } from './baseView.js';

export class SettingsView extends BaseView {
    #settings = {};
    
    constructor(container) {
        super('settings', container);
        this.#loadSettings();
    }
    
    async #loadSettings() {
        try {
            this.#settings = await window.api.getSettings();
            if (this.isLocked()) return;
            this.render();
        } catch (err) {
            console.error('Failed to load settings:', err);
        }
    }
    
    getHTML() {
        return `
            <div class="settings-view">
                <h2>Settings</h2>
                
                <div style="margin:20px 0;">
                    <h3>Database Configuration</h3>
                    <div style="margin:10px 0;">
                        <label>Database Folder:</label><br>
                        <input type="text" id="db-folder" value="${this.#settings.dbFolder || ''}" 
                               style="width:300px;" readonly>
                        <button id="choose-db-folder">Choose...</button>
                    </div>
                    <div style="margin:10px 0;">
                        <label>
                            <input type="checkbox" id="auto-update-db" 
                                   ${this.#settings.autoUpdateDb ? 'checked' : ''}>
                            Auto-update database after each file
                        </label>
                    </div>
                </div>
                
                <div style="margin:20px 0;">
                    <h3>Analysis Configuration</h3>
                    <div style="margin:10px 0;">
                        <label>Technical Concurrency:</label><br>
                        <input type="number" id="tech-concurrency" min="1" max="8" 
                               value="${this.#settings.techConcurrency || 4}">
                    </div>
                    <div style="margin:10px 0;">
                        <label>Creative Concurrency:</label><br>
                        <input type="number" id="creative-concurrency" min="1" max="4" 
                               value="${this.#settings.creativeConcurrency || 2}">
                    </div>
                    <div style="margin:10px 0;">
                        <label>Ollama Model:</label><br>
                        <select id="ollama-model">
                            <option value="qwen3:8b" ${this.#settings.ollamaModel === 'qwen3:8b' ? 'selected' : ''}>
                                qwen3:8b (faster)
                            </option>
                            <option value="qwen3:30b" ${this.#settings.ollamaModel === 'qwen3:30b' ? 'selected' : ''}>
                                qwen3:30b (better)
                            </option>
                        </select>
                    </div>
                </div>
                
                <div style="margin:20px 0;">
                    <button id="save-settings-btn">Save Settings</button>
                    <button id="update-criteria-db-btn">Update Criteria DB</button>
                    <button id="run-health-check-btn">Run Health Check</button>
                </div>
                
                <div id="settings-status" style="margin:10px 0;"></div>
            </div>
        `;
    }
    
    attachEventListeners() {
        document.getElementById('choose-db-folder')?.addEventListener('click', async () => {
            if (this.isLocked()) return;
            console.log('Choose DB folder clicked');
        });
        
        document.getElementById('save-settings-btn')?.addEventListener('click', () => {
            if (this.isLocked()) return;
            this.#saveSettings();
        });
        
        document.getElementById('update-criteria-db-btn')?.addEventListener('click', async () => {
            if (this.isLocked()) return;
            try {
                await window.api.updateCriteriaDb();
                this.#showStatus('Criteria DB updated successfully', 'success');
            } catch (err) {
                this.#showStatus('Failed to update Criteria DB', 'error');
            }
        });
        
        document.getElementById('run-health-check-btn')?.addEventListener('click', async () => {
            if (this.isLocked()) return;
            try {
                const report = await window.api.runHealthCheck();
                this.#showStatus(`Health Check: ${JSON.stringify(report)}`, 'info');
            } catch (err) {
                this.#showStatus('Health check failed', 'error');
            }
        });
    }
    
    async #saveSettings() {
        const newSettings = {
            dbFolder: document.getElementById('db-folder').value,
            autoUpdateDb: document.getElementById('auto-update-db').checked,
            techConcurrency: parseInt(document.getElementById('tech-concurrency').value),
            creativeConcurrency: parseInt(document.getElementById('creative-concurrency').value),
            ollamaModel: document.getElementById('ollama-model').value
        };
        
        try {
            await window.api.updateSettings(newSettings);
            this.#settings = newSettings;
            this.#showStatus('Settings saved successfully', 'success');
            setTimeout(() => this.lock(), 1000);
        } catch (err) {
            this.#showStatus('Failed to save settings', 'error');
            console.error('Save settings error:', err);
        }
    }
    
    #showStatus(message, type) {
        const status = document.getElementById('settings-status');
        if (!status) return;
        
        const colors = {
            success: '#4caf50',
            error: '#f44336',
            info: '#2196f3'
        };
        
        status.innerHTML = `<div style="padding:8px;background:${colors[type]};color:white;">${message}</div>`;
        setTimeout(() => {
            status.innerHTML = '';
        }, 3000);
    }
}

