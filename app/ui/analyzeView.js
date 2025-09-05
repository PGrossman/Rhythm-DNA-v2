import { BaseView } from './baseView.js';

export class AnalyzeView extends BaseView {
    #queueStatus = new Map();
    
    constructor(container) {
        super('analyze', container);
        this.#setupIPCListeners();
    }
    
    getHTML() {
        return `
            <div class="analyze-view">
                <h2>Analysis Queue</h2>
                <div id="queue-stats" style="padding:10px;background:#f5f5f5;margin:10px 0;">
                    <span>Queued: <strong id="stat-queued">0</strong></span> | 
                    <span>Processing: <strong id="stat-processing">0</strong></span> | 
                    <span>Complete: <strong id="stat-complete">0</strong></span> | 
                    <span>Errors: <strong id="stat-errors">0</strong></span>
                </div>
                <div id="queue-list" style="max-height:400px;overflow-y:auto;border:1px solid #ddd;padding:10px;">
                    <p style="color:#666;">Queue empty</p>
                </div>
                <div style="margin-top:20px;">
                    <button id="clear-queue-btn">Clear Queue</button>
                    <button id="pause-queue-btn">Pause</button>
                </div>
            </div>
        `;
    }
    
    attachEventListeners() {
        document.getElementById('clear-queue-btn')?.addEventListener('click', () => {
            if (this.isLocked()) return;
            window.api.clearQueue();
            this.#queueStatus.clear();
            this.#updateDisplay();
        });
        
        document.getElementById('pause-queue-btn')?.addEventListener('click', (e) => {
            if (this.isLocked()) return;
            const btn = e.target;
            if (btn.textContent === 'Pause') {
                btn.textContent = 'Resume';
            } else {
                btn.textContent = 'Pause';
            }
        });
    }
    
    #setupIPCListeners() {
        if (!window.api) return;
        window.api.onQueueUpdate((data) => {
            this.#queueStatus.set(data.trackId, {
                techStatus: data.techStatus,
                creativeStatus: data.creativeStatus,
                filename: data.filename || `Track ${data.trackId}`
            });
            this.#updateDisplay();
        });
        
        window.api.onJobProgress((data) => {
            const status = this.#queueStatus.get(data.trackId);
            if (status) {
                status.progress = data.pct;
                status.stage = data.stage;
                this.#updateDisplay();
            }
        });
        
        window.api.onJobDone((data) => {
            const status = this.#queueStatus.get(data.trackId);
            if (status) {
                status.complete = true;
                status.outputs = data.outputs;
                this.#updateDisplay();
            }
            if (this.#areAllJobsComplete()) {
                this.lock();
            }
        });
        
        window.api.onJobError((data) => {
            const status = this.#queueStatus.get(data.trackId);
            if (status) {
                status.error = data.error;
                this.#updateDisplay();
            }
        });
    }
    
    #updateDisplay() {
        const stats = {
            queued: 0,
            processing: 0,
            complete: 0,
            errors: 0
        };
        
        const list = document.getElementById('queue-list');
        if (!list) return;
        
        const items = [];
        this.#queueStatus.forEach((status, trackId) => {
            if (status.error) stats.errors++;
            else if (status.complete) stats.complete++;
            else if (status.techStatus === 'PROCESSING' || status.creativeStatus === 'PROCESSING') stats.processing++;
            else stats.queued++;
            
            items.push(`
                <div style="padding:8px;margin:4px 0;background:#fff;border:1px solid #ddd;">
                    <strong>${status.filename}</strong><br>
                    Tech: ${status.techStatus || 'QUEUED'} | 
                    Creative: ${status.creativeStatus || 'WAITING'} 
                    ${status.progress ? `(${status.progress}%)` : ''}
                    ${status.error ? `<br><span style="color:red;">Error: ${status.error}</span>` : ''}
                </div>
            `);
        });
        
        list.innerHTML = items.length ? items.join('') : '<p style="color:#666;">Queue empty</p>';
        
        Object.keys(stats).forEach(key => {
            const el = document.getElementById(`stat-${key}`);
            if (el) el.textContent = stats[key];
        });
    }
    
    #areAllJobsComplete() {
        if (this.#queueStatus.size === 0) return false;
        for (const status of this.#queueStatus.values()) {
            if (!status.complete && !status.error) return false;
        }
        return true;
    }
}

