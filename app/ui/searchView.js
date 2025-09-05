import { BaseView } from './baseView.js';

export class SearchView extends BaseView {
    #dropZone = null;
    #fileList = [];
    
    constructor(container) {
        super('search', container);
    }
    
    getHTML() {
        return `
            <div class="search-view">
                <h2>Search & File Selection</h2>
                <div id="drop-zone" style="border:2px dashed #ccc;padding:40px;text-align:center;margin:20px 0;">
                    <p>Drop audio files or folders here</p>
                    <p style="color:#666;font-size:14px;">Supports MP3 and WAV files</p>
                </div>
                <div id="file-list" style="margin-top:20px;">
                    <h3>Selected Files (<span id="file-count">0</span>)</h3>
                    <div id="file-table" style="max-height:300px;overflow-y:auto;"></div>
                </div>
                <div style="margin-top:20px;">
                    <button id="clear-files-btn">Clear Files</button>
                    <button id="queue-files-btn" disabled>Add to Queue</button>
                </div>
            </div>
        `;
    }
    
    attachEventListeners() {
        this.#dropZone = document.getElementById('drop-zone');
        
        // Drag and drop handlers
        this.#dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.#dropZone.style.background = '#f0f0f0';
        });
        
        this.#dropZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.#dropZone.style.background = '';
        });
        
        this.#dropZone.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.#dropZone.style.background = '';
            
            if (this.isLocked()) {
                console.warn('SearchView is locked - cannot accept drops');
                return;
            }
            
            const paths = Array.from(e.dataTransfer.files).map(f => f.path);
            console.log('Files dropped:', paths);
            
            // Call IPC to scan dropped files
            try {
                const result = await window.api.scanDropped({ paths });
                this.#fileList = result.tracks || [];
                this.#updateFileDisplay();
            } catch (err) {
                console.error('Failed to scan dropped files:', err);
            }
        });
        
        // Button handlers
        document.getElementById('clear-files-btn')?.addEventListener('click', () => {
            if (this.isLocked()) return;
            this.#fileList = [];
            this.#updateFileDisplay();
        });
        
        document.getElementById('queue-files-btn')?.addEventListener('click', () => {
            if (this.isLocked()) return;
            this.#queueFiles();
        });
    }
    
    #updateFileDisplay() {
        const count = document.getElementById('file-count');
        const table = document.getElementById('file-table');
        const queueBtn = document.getElementById('queue-files-btn');
        
        if (count) count.textContent = this.#fileList.length;
        if (queueBtn) queueBtn.disabled = this.#fileList.length === 0;
        
        if (table) {
            if (this.#fileList.length === 0) {
                table.innerHTML = '<p style="color:#666;">No files selected</p>';
            } else {
                table.innerHTML = this.#fileList.map(track => `
                    <div style="padding:4px;border-bottom:1px solid #eee;">
                        ${track.basename || track.filename || track.name || 'Track'} (${track.extension || ''})
                    </div>
                `).join('');
            }
        }
    }
    
    #queueFiles() {
        console.log('Queueing files for analysis:', this.#fileList);
        window.api.startAnalysis({ 
            concurrencyTech: 4,
            concurrencyCreative: 2 
        });
        this.lock();
    }
}

