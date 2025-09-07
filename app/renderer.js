// Basic three-tab UI controller; logs module init imports

import { DragDrop } from './modules/dragdrop.js';
import { QueueManager } from './modules/queue.js';
import { TechAnalyzer } from './modules/techAnalyzer.js';
import { CreativeAnalyzer } from './modules/creativeAnalyzer.js';
import { Writers } from './modules/writers.js';
import { DBWriter } from './modules/dbWriter.js';
import { CriteriaDBBuilder } from './modules/criteriaDb.js';
import { SettingsStore } from './modules/settings.js';
import { Logger } from './modules/logger.js';

// Instantiate modules to trigger init logs
const dragDrop = new DragDrop();
const modules = [
    dragDrop,
    new QueueManager(),
    new TechAnalyzer(),
    new CreativeAnalyzer(),
    new Writers(),
    new DBWriter(),
    new CriteriaDBBuilder(),
    new SettingsStore(),
    new Logger()
];

const panel = document.getElementById('panel');
let currentQueue = [];

const views = {
    analysis: `
        <h2>Audio Analysis Queue</h2>
        <div id="drop-zone">
            <div class="folder-icon">📁</div>
            <p>Drop audio folder here</p>
            <p class="subtitle">Supports MP3 and WAV files with recursive folder scanning</p>
        </div>
        <div style="margin: 20px 0;">
            <button id="start-analysis" style="padding: 10px 20px; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer;">Start Analysis</button>
            <button id="clear-queue" style="padding: 10px 20px; background: #ef4444; color: white; border: none; border-radius: 6px; cursor: pointer; margin-left: 10px;">Clear Queue</button>
        </div>
        <div id="queue-display"></div>
    `,
    search: `
        <h2>Search</h2>
        <div class="queue-empty">
            <p>Search functionality will be available after analysis</p>
        </div>
    `,
    settings: `
        <h2>Settings</h2>
        <button id="save-settings" style="float: right; padding: 10px 20px; background: #007AFF; color: white; border: none; border-radius: 6px; cursor: pointer;">Save Settings</button>
        <div style="clear: both;"></div>
        
        <div style="margin-top: 24px; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
            <h3 style="margin: 0 0 16px 0;">Database Configuration</h3>
            <div style="margin-bottom: 16px;">
                <label style="display: block; margin-bottom: 8px;">Database Folder</label>
                <div style="display: flex; gap: 12px;">
                    <input type="text" id="db-folder" placeholder="/Users/grossph/Documents/Rhytham DNA" style="flex: 1; padding: 8px 12px; border: 1px solid #d0d0d0; border-radius: 4px;" readonly>
                    <button id="choose-folder" style="padding: 8px 16px; background: #f0f0f0; border: 1px solid #d0d0d0; border-radius: 4px; cursor: pointer;">Choose...</button>
                </div>
            </div>
            <div style="margin-bottom: 16px;">
                <label style="display: flex; align-items: center; gap: 8px;">
                    <input type="checkbox" id="auto-update-db">
                    <span>Auto-update database after each file</span>
                </label>
            </div>
            <div style="display: flex; gap: 12px;">
                <button id="update-database" style="padding: 8px 16px; background: #f0f0f0; border: 1px solid #d0d0d0; border-radius: 4px; cursor: pointer;">Update Database</button>
                <button id="update-criteria" style="padding: 8px 16px; background: #f0f0f0; border: 1px solid #d0d0d0; border-radius: 4px; cursor: pointer;">Update Criteria DB</button>
            </div>
        </div>
        
        <div style="margin-top: 20px; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
            <h3 style="margin: 0 0 16px 0;">Analysis Configuration</h3>
            <div style="margin-bottom: 16px;">
                <label style="display: block; margin-bottom: 8px;">Creative Analysis Model</label>
                <select id="ollama-model" style="width: 100%; padding: 8px 12px; border: 1px solid #d0d0d0; border-radius: 4px;">
                    <option value="qwen3:30b">qwen3:30b (Better Quality)</option>
                    <option value="qwen3:8b">qwen3:8b (Fast)</option>
                </select>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                <div>
                    <label style="display: block; margin-bottom: 8px;">Technical Concurrency</label>
                    <input type="number" id="tech-concurrency" min="1" max="8" value="4" style="width: 100%; padding: 8px 12px; border: 1px solid #d0d0d0; border-radius: 4px;">
                </div>
                <div>
                    <label style="display: block; margin-bottom: 8px;">Creative Concurrency</label>
                    <input type="number" id="creative-concurrency" min="1" max="4" value="2" style="width: 100%; padding: 8px 12px; border: 1px solid #d0d0d0; border-radius: 4px;">
                </div>
            </div>
        </div>
        
        <div style="margin-top: 20px; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
            <h3 style="margin: 0 0 16px 0;">Health Check</h3>
            <button id="health-check" style="padding: 10px 20px; background: #007AFF; color: white; border: none; border-radius: 6px; cursor: pointer;">Run Health Check</button>
            <div id="health-results" style="margin-top: 16px;"></div>
        </div>
    `
};

let currentView = 'analysis';
let currentSettings = {};

async function setupSettingsView() {
    try {
        const settings = await window.api.getSettings();
        if (settings.dbFolder) document.getElementById('db-folder').value = settings.dbFolder;
        document.getElementById('auto-update-db').checked = settings.autoUpdateDb || false;
        document.getElementById('ollama-model').value = settings.ollamaModel || 'qwen3:30b';
        document.getElementById('tech-concurrency').value = settings.techConcurrency || 4;
        document.getElementById('creative-concurrency').value = settings.creativeConcurrency || 2;
    } catch (err) {
        console.error('Failed to load settings:', err);
    }
    
    document.getElementById('save-settings')?.addEventListener('click', async () => {
        await saveSettings();
        alert('Settings saved successfully');
    });
    
    document.getElementById('choose-folder')?.addEventListener('click', async () => {
        const result = await window.api.chooseFolder();
        if (result.folder) document.getElementById('db-folder').value = result.folder;
    });
    
    document.getElementById('update-database')?.addEventListener('click', async () => {
        await window.api.updateDatabase();
        alert('Database updated');
    });
    
    document.getElementById('update-criteria')?.addEventListener('click', async () => {
        await window.api.updateCriteriaDb();
        alert('Criteria DB updated');
    });
    
    document.getElementById('health-check')?.addEventListener('click', async () => {
        const results = document.getElementById('health-results');
        results.innerHTML = 'Checking...';
        const health = await window.api.runHealthCheck();
        results.innerHTML = 
            (health.ffprobe ? '✓ ffprobe OK<br>' : '✗ ffprobe missing<br>') +
            (health.ffmpeg ? '✓ ffmpeg OK<br>' : '✗ ffmpeg missing<br>') +
            (health.ollama ? '✓ Ollama connected' : '✗ Ollama not running');
    });
}

async function saveSettings() {
    const settings = {
        dbFolder: document.getElementById('db-folder').value,
        autoUpdateDb: document.getElementById('auto-update-db').checked,
        ollamaModel: document.getElementById('ollama-model').value,
        techConcurrency: parseInt(document.getElementById('tech-concurrency').value),
        creativeConcurrency: parseInt(document.getElementById('creative-concurrency').value)
    };
    
    try {
        await window.api.updateSettings(settings);
        console.log('Settings saved:', settings);
    } catch (err) {
        console.error('Failed to save settings:', err);
    }
}

const setView = (name) => {
    currentView = name;
    panel.innerHTML = views[name] || '';
    
    // Update active tab styling
    document.querySelectorAll('.tabs button').forEach(btn => {
        btn.classList.remove('active');
    });
    document.getElementById(`tab-${name}-btn`).classList.add('active');
    
    // Setup view-specific handlers
    if (name === 'analysis') {
        setupAnalysisView();
    } else if (name === 'settings') {
        setupSettingsView();
    }
};

function setupAnalysisView() {
    const dropZone = document.getElementById('drop-zone');
    if (dropZone) {
        dragDrop.setupDropZone(dropZone);
        
        // Just add to queue on drop, don't process
        dropZone.addEventListener('filesDropped', (e) => {
            console.log('[Renderer] Files dropped:', e.detail.tracks.length);
            currentQueue = e.detail.tracks;
            updateQueueDisplay();
        });
    }
    
    // Start Analysis button
    const startBtn = document.getElementById('start-analysis');
    if (startBtn) {
        startBtn.addEventListener('click', async () => {
            console.log('[Renderer] Start Analysis clicked');
            await processQueue();
        });
    }
    
    // Clear Queue button
    const clearBtn = document.getElementById('clear-queue');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            console.log('[Renderer] Clear Queue clicked');
            currentQueue = [];
            updateQueueDisplay();
        });
    }
    
    updateQueueDisplay();
}

async function processQueue() {
    for (const track of currentQueue) {
        if (track.path && track.path.toLowerCase().endsWith('.mp3')) {
            try {
                track.status = 'PROCESSING';
                updateQueueDisplay();
                
                const result = await window.api.analyzeFile(track.path);
                
                if (result.success) {
                    track.status = 'COMPLETE';
                    track.techStatus = 'COMPLETE';
                    console.log(`[Renderer] Analyzed: ${track.fileName}`);
                } else {
                    track.status = 'ERROR';
                }
                updateQueueDisplay();
            } catch (error) {
                console.error('[Renderer] Error:', error);
                track.status = 'ERROR';
                updateQueueDisplay();
            }
        }
    }
}

function updateQueueDisplay() {
    const queueDiv = document.getElementById('queue-display');
    if (!queueDiv) return;
    
    if (currentQueue.length === 0) {
        queueDiv.innerHTML = '';
        return;
    }
    
    // Build the status display for each track
    const getStatusBadge = (status) => {
        const statusClass = status ? status.toLowerCase() : 'queued';
        return `<span class="status-badge status-${statusClass}">${status || 'QUEUED'}</span>`;
    };

    let html = `
        <h3>Files to Process (${currentQueue.length})</h3>
        <table class="queue-table">
            <thead>
                <tr>
                    <th>File</th>
                    <th>Technical</th>
                    <th>Creative</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    currentQueue.forEach(track => {
        html += `
            <tr>
                <td>${track.fileName || track.filename || 'Unknown'}</td>
                <td>${getStatusBadge(track.techStatus || track.status)}</td>
                <td>${getStatusBadge(track.creativeStatus || 'PENDING')}</td>
                <td>${getStatusBadge(track.status)}</td>
            </tr>
        `;
    });
    
    html += `
            </tbody>
        </table>
    `;
    
    queueDiv.innerHTML = html;
}

async function processTrack(track) {
    try {
        track.status = 'PROCESSING';
        updateQueueDisplay();
        const result = await window.api.analyzeFile(track.path);
        if (result.success) {
            track.status = 'COMPLETE';
            track.techStatus = 'COMPLETE';
            console.log(`[Renderer] Analysis complete: ${track.fileName || track.filename || track.path}`);
        } else {
            track.status = 'ERROR';
            console.error(`[Renderer] Analysis failed: ${result.error}`);
        }
        updateQueueDisplay();
    } catch (error) {
        console.error('[Renderer] Process error:', error);
        track.status = 'ERROR';
        updateQueueDisplay();
    }
}

// Listen for queue updates
window.api?.onQueueUpdate?.((event, data) => {
    const track = currentQueue.find(t => t.path === data.trackId);
    if (track) {
        track.techStatus = data.techStatus;
        track.creativeStatus = data.creativeStatus;
        updateQueueDisplay();
    }
});

// Tab navigation
document.getElementById('tab-analysis-btn').addEventListener('click', () => setView('analysis'));
document.getElementById('tab-search-btn').addEventListener('click', () => setView('search'));
document.getElementById('tab-settings-btn').addEventListener('click', () => setView('settings'));

// Default view
setView('analysis');


