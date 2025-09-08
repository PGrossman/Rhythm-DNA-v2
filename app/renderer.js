// Basic three-tab UI controller; logs module init imports

import { DragDrop } from './modules/dragdrop.js';
import { SettingsStore } from './modules/settings.js';

// Instantiate modules to trigger init logs
const dragDrop = new DragDrop();
const settingsStore = new SettingsStore();

const panel = document.getElementById('panel');
let currentQueue = [];
let allowReanalyze = false;

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
            <label style="margin-left: 20px; display: inline-flex; align-items: center; gap: 8px; font-size: 14px;">
                <input type="checkbox" id="allow-reanalyze" style="width: 16px; height: 16px;">
                <span>Re-analyze existing files</span>
            </label>
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
                    <button id="choose-folder">Choose...</button>
                </div>
            </div>
            <div style="margin-bottom: 16px;">
                <label style="display: flex; align-items: center; gap: 8px;">
                    <input type="checkbox" id="auto-update-db">
                    <span>Auto-update database after each file</span>
                </label>
            </div>
            <div style="display: flex; gap: 12px;">
                <button id="update-database">Update Database</button>
                <button id="update-criteria">Update Criteria DB</button>
            </div>
        </div>
        
        <div style="margin-top: 20px; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
            <h3 style="margin: 0 0 16px 0;">Analysis Configuration</h3>
            <div style="margin-bottom: 16px;">
                <label style="display: block; margin-bottom: 8px;">Creative Analysis Model</label>
                <select id="ollama-model" style="width: 100%; padding: 8px 12px; border: 1px solid #d0d0d0; border-radius: 4px;">
                    <option value="">Loading models...</option>
                </select>
                <div id="model-status" style="margin-top: 8px; font-size: 12px; color: #666;"></div>
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
let progressStatus = {};

async function setupSettingsView() {
    try {
        // Load installed models first
        const models = await window.api.getInstalledModels();
        const modelSelect = document.getElementById('ollama-model');
        const modelStatus = document.getElementById('model-status');
        
        if (models.length === 0) {
            modelSelect.innerHTML = '<option value="">No models installed</option>';
            if (modelStatus) {
                modelStatus.innerHTML = 'No Ollama models found. Run <code>npm run install-models</code> to install recommended models.';
            }
        } else {
            modelSelect.innerHTML = models.map(m => {
                let label = m.name;
                if (m.name === 'qwen2.5:32b-instruct') label += ' (Most Accurate)';
                else if (m.name === 'gemma2:27b-instruct') label += ' (Very Accurate)';
                else if (m.name === 'mixtral:8x7b') label += ' (Accurate)';
                else if (m.name === 'qwen3:30b') label += ' (Better Quality)';
                else if (m.name === 'qwen3:8b') label += ' (Fast)';
                return `<option value="${m.name}">${label}</option>`;
            }).join('');
            if (modelStatus) {
                modelStatus.innerText = `${models.length} model(s) available.`;
            }
        }
        
        const settings = await window.api.getSettings();
        if (settings.dbFolder) document.getElementById('db-folder').value = settings.dbFolder;
        document.getElementById('auto-update-db').checked = settings.autoUpdateDb || false;
        if (settings.ollamaModel && models.some(m => m.name === settings.ollamaModel)) {
            modelSelect.value = settings.ollamaModel;
        } else if (models.length > 0) {
            modelSelect.value = models[0].name;
        }
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
        
        // Just add to queue on drop, don't process (additive with dedupe)
        dropZone.addEventListener('filesDropped', (e) => {
            const incoming = Array.isArray(e.detail?.tracks) ? e.detail.tracks : [];
            console.log('[Renderer] Files dropped:', incoming.length);
            
            // Merge additively by normalized absolute path; keep existing statuses
            const normPath = (p) => String(p || '').replace(/\\/g,'/').toLowerCase();
            const byPath = new Map();
            
            // Seed with existing items first (preserve their status fields)
            for (const t of currentQueue) {
                const key = normPath(t.path || t.fileName || t.filename);
                if (key) byPath.set(key, t);
            }
            
            // Add/merge incoming
            for (const t of incoming) {
                const key = normPath(t.path || t.fileName || t.filename);
                if (!key) continue;
                const existing = byPath.get(key);
                if (existing) {
                    // Augment flags; do NOT downgrade status
                    if (t.hasExistingAnalysis) existing.hasExistingAnalysis = true;
                    if (!existing.fileName && t.fileName) existing.fileName = t.fileName;
                } else {
                    byPath.set(key, t);
                }
            }
            
            currentQueue = Array.from(byPath.values());
            updateQueueDisplay();
        });
    }
    
    // Re-analyze checkbox
    const reanalyzeCheckbox = document.getElementById('allow-reanalyze');
    if (reanalyzeCheckbox) {
        reanalyzeCheckbox.addEventListener('change', (e) => {
            allowReanalyze = e.target.checked;
            console.log('[Renderer] Re-analyze mode:', allowReanalyze);
            updateQueueDisplay();
        });
        // Set initial state
        allowReanalyze = reanalyzeCheckbox.checked;
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
    // Get concurrency setting (default to 4 if not set)
    const settings = await window.api.getSettings();
    const concurrency = settings.techConcurrency || 4;
    console.log(`[Renderer] Processing queue with concurrency: ${concurrency}`);
    
    // Filter to MP3 files only
    const mp3Tracks = currentQueue.filter(track => 
        track.path && track.path.toLowerCase().endsWith('.mp3')
    );
    
    // Filter based on re-analyze checkbox
    const tracksToProcess = mp3Tracks.filter(track => {
        if (track.hasExistingAnalysis && !allowReanalyze) {
            console.log(`[Renderer] Skipping ${track.fileName} - has existing analysis`);
            return false;
        }
        return true;
    });
    
    console.log(`[Renderer] Processing ${tracksToProcess.length} of ${mp3Tracks.length} tracks`);
    
    // Worker pool: start work immediately when a worker becomes available
    let queueIndex = 0;
    
    const worker = async (workerId) => {
        while (queueIndex < tracksToProcess.length) {
            const trackIndex = queueIndex++;
            if (trackIndex >= tracksToProcess.length) break;
            const track = tracksToProcess[trackIndex];
            console.log(`[Worker ${workerId}] Starting: ${track.fileName}`);
            try {
                track.status = 'PROCESSING';
                track.techStatus = 'PROCESSING';
                updateQueueDisplay();
                
                const result = await window.api.analyzeFile(track.path);
                
                if (result.success) {
                    track.status = 'COMPLETE';
                    track.techStatus = 'COMPLETE';
                    track.creativeStatus = 'COMPLETE';
                    console.log(`[Worker ${workerId}] Complete: ${track.fileName}`);
                } else {
                    track.status = 'ERROR';
                    console.error(`[Worker ${workerId}] Failed: ${track.fileName}`);
                }
                updateQueueDisplay();
            } catch (error) {
                console.error(`[Worker ${workerId}] Error:`, error);
                track.status = 'ERROR';
                updateQueueDisplay();
            }
        }
        console.log(`[Worker ${workerId}] No more files, shutting down`);
    };
    
    const workers = [];
    for (let i = 0; i < Math.min(concurrency, tracksToProcess.length); i++) {
        workers.push(worker(i + 1));
    }
    await Promise.all(workers);
    console.log('[Renderer] All files processed');
}

function updateQueueDisplay() {
    const queueDiv = document.getElementById('queue-display');
    if (!queueDiv) return;
    
    if (currentQueue.length === 0) {
        queueDiv.innerHTML = '';
        return;
    }
    
    // Count files with existing analysis
    const existingCount = currentQueue.filter(t => t.hasExistingAnalysis).length;
    const newCount = currentQueue.length - existingCount;
    
    // Apply any progress updates received from main
    currentQueue.forEach((track) => {
        const p = progressStatus[track.path];
        if (p) {
            if (p.technical) track.techStatus = p.technical.status;
            if (p.creative) track.creativeStatus = p.creative.status;
        }
    });

    // Build the status display for each track
    const getStatusBadge = (status) => {
        const statusClass = status ? status.toLowerCase() : 'queued';
        const label = status === 'PROCESSING' ? `⏳ ${status}` : (status || 'QUEUED');
        return `<span class="status-badge status-${statusClass}">${label}</span>`;
    };

    let html = `
        <h3>Files to Process (${currentQueue.length} total${existingCount > 0 ? ` - ${newCount} new, ${existingCount} existing` : ''})</h3>
        ${existingCount > 0 && !allowReanalyze ? '<p style="color: #f59e0b; margin: 10px 0;">⚠️ Files with existing analysis will be skipped. Check "Re-analyze existing files" to process them.</p>' : ''}
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
        const isSkipped = track.hasExistingAnalysis && !allowReanalyze;
        const rowStyle = isSkipped ? 'style="opacity: 0.5;"' : '';
        const displayStatus = track.hasExistingAnalysis ? 
            (allowReanalyze ? 'RE-ANALYZE' : 'SKIP') : 
            track.status;
        html += `
            <tr ${rowStyle}>
                <td>${track.fileName || track.filename || 'Unknown'}</td>
                <td>${getStatusBadge(isSkipped ? 'SKIP' : (track.techStatus || displayStatus))}</td>
                <td>${getStatusBadge(isSkipped ? 'SKIP' : (track.creativeStatus || 'WAITING'))}</td>
                <td>${getStatusBadge(displayStatus)}</td>
            </tr>
        `;
    });
    
    html += `
            </tbody>
        </table>
    `;
    
    queueDiv.innerHTML = html;
}

// Listen for progress updates from main process
if (window.api && window.api.onJobProgress) {
    window.api.onJobProgress((event, data) => {
        console.log('[Renderer] Progress update:', data);
        if (!progressStatus[data.trackId]) progressStatus[data.trackId] = {};
        if (data.stage === 'technical') {
            progressStatus[data.trackId].technical = { status: data.status, note: data.note };
        } else if (data.stage === 'creative') {
            progressStatus[data.trackId].creative = { status: data.status, note: data.note };
        }
        updateQueueDisplay();
    });
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


