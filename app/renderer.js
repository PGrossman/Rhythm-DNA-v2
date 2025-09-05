import { DragDrop } from './modules/dragdrop.js';

// Enhanced Analyze-first UI controller

const panel = document.getElementById('panel');
const dragDrop = new DragDrop();

// Enhanced view HTML
// ============================================
// LOCKED SECTION START - VIEWS OBJECT
// Owner: Philip | Date: 2025-09-05
// DO NOT MODIFY WITHOUT APPROVAL
// ============================================
const views = {
    // LOCKED: analyze view - DO NOT MODIFY
    analyze: `
        <style>
            .drop-zone {
                border: 2px dashed #d2d2d7;
                border-radius: 8px;
                padding: 60px 40px;
                text-align: center;
                background: #fff;
                transition: all 0.3s ease;
                cursor: pointer;
            }
            
            .drop-zone.dragover {
                background: #f0f8ff;
                border-color: #0071e3;
            }
            
            .drop-zone-icon {
                font-size: 48px;
                color: #86868b;
                margin-bottom: 16px;
            }
            
            .drop-zone-title {
                font-size: 18px;
                color: #1d1d1f;
                margin-bottom: 8px;
            }
            
            .drop-zone-subtitle {
                font-size: 14px;
                color: #86868b;
            }
            
            .queue-list {
                margin-top: 32px;
            }
            
            .queue-empty {
                text-align: center;
                color: #86868b;
                padding: 32px;
            }
        </style>
        
        <h2>Audio Analysis Queue</h2>
        
        <div id="drop-zone" class="drop-zone">
            <div class="drop-zone-icon">📁</div>
            <div class="drop-zone-title">Drop audio folder here</div>
            <div class="drop-zone-subtitle">Supports MP3 and WAV files with recursive folder scanning</div>
        </div>
        
        <div id="queue-list" class="queue-list">
            <!-- Queue items will appear here -->
        </div>
    `,
    
    search: `
        <style>
            .search-actions { margin-top: 16px; }
            .search-actions .btn { padding: 8px 16px; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; background: #0071e3; color: #fff; }
            .search-actions .btn.secondary { background: #f5f5f7; color: #333; border: 1px solid #d2d2d7; }
            .track-table { width: 100%; border-collapse: collapse; margin-top: 16px; }
            .track-table th { background: #f4f4f4; padding: 8px; text-align: left; border-bottom: 2px solid #ddd; }
            .track-table td { padding: 8px; border-bottom: 1px solid #eee; }
            .path-cell { font-size: 12px; color: #666; max-width: 400px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        </style>
        <h2>Search</h2>
        <div id="drop-zone" class="drop-zone">
            <div class="drop-zone-icon">📁</div>
            <div class="drop-zone-title">Drop files or folders here</div>
            <div class="drop-zone-subtitle">MP3 and WAV files supported</div>
        </div>
        <div id="dropped-files" class="file-list"></div>
        <div class="search-actions">
            <button id="start-analysis" class="btn" style="display:none;">Start Analysis</button>
            <button id="clear-queue" class="btn secondary" style="display:none;">Clear Queue</button>
        </div>
    `,
    
    // LOCKED: Settings view - COMPLETE AND TESTED
    settings: `
        <style>
            .settings-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 32px; padding-right: 20px; }
            .settings-header h2 { margin: 0; font-size: 32px; font-weight: 600; }
            .settings-form { max-width: 600px; }
            .settings-group { background: #fff; border: 1px solid #d2d2d7; border-radius: 8px; padding: 20px; margin-bottom: 20px; }
            .settings-group h3 { margin: 0 0 16px 0; font-size: 16px; font-weight: 600; }
            .form-row { margin-bottom: 16px; }
            .form-row label { display: block; margin-bottom: 6px; font-size: 14px; color: #333; }
            .form-row input[type="text"], .form-row input[type="number"], .form-row select { width: 100%; padding: 8px 12px; border: 1px solid #d2d2d7; border-radius: 6px; font-size: 14px; }
            .form-row input[type="checkbox"] { margin-right: 8px; }
            .folder-input-group { display: flex; gap: 8px; }
            .folder-input-group input { flex: 1; }
            .btn { padding: 8px 16px; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; background: #0071e3; color: #fff; }
            .btn:hover { background: #0051a2; }
            .btn-secondary { background: #f5f5f7; color: #333; border: 1px solid #d2d2d7; }
            .btn-secondary:hover { background: #e8e8ed; }
            .concurrency-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
            .status-msg { padding: 12px; margin: 16px 0; border-radius: 6px; display: none; }
            .status-success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
            .status-error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
        </style>
        
        <div class="settings-header">
            <h2>Settings</h2>
            <button class="btn" id="save-settings-btn">Save Settings</button>
        </div>
        
        <div class="settings-form">
            <div class="settings-group">
                <h3>Database Configuration</h3>
                <div class="form-row">
                    <label>Database Folder</label>
                    <div class="folder-input-group">
                        <input type="text" id="db-folder" placeholder="/Users/username/RhythmDNA/DB" readonly>
                        <button class="btn btn-secondary" id="choose-folder-btn">Choose...</button>
                    </div>
                </div>
                <div class="form-row">
                    <label>
                        <input type="checkbox" id="auto-update-db" checked>
                        Auto-update database after each file
                    </label>
                </div>
                <div class="form-row" style="display: flex; gap: 8px;">
                    <button class="btn btn-secondary" id="update-db-btn">Update Database</button>
                    <button class="btn btn-secondary" id="update-criteria-btn">Update Criteria DB</button>
                </div>
            </div>
            
            <div class="settings-group">
                <h3>Analysis Configuration</h3>
                <div class="form-row">
                    <label>Creative Analysis Model</label>
                    <select id="creative-model">
                        <option value="qwen3:8b">qwen3:8b (Faster, Default)</option>
                        <option value="qwen3:30b">qwen3:30b (Better Quality)</option>
                    </select>
                </div>
                <div class="concurrency-row">
                    <div class="form-row">
                        <label>Technical Concurrency</label>
                        <input type="number" id="tech-concurrency" min="1" max="8" value="4">
                    </div>
                    <div class="form-row">
                        <label>Creative Concurrency</label>
                        <input type="number" id="creative-concurrency" min="1" max="4" value="2">
                    </div>
                </div>
            </div>
            
            <div class="settings-group">
                <h3>Health Check</h3>
                <button class="btn" id="health-check-btn">Run Health Check</button>
                <div id="health-status" class="status-msg"></div>
            </div>
            
            <div id="save-status" class="status-msg"></div>
        </div>
    `
};
// ============================================
// LOCKED SECTION END - VIEWS OBJECT
// ============================================

const setView = (name) => {
    panel.innerHTML = views[name] || '';
    
    // Update active tab
    document.querySelectorAll('.tabs button').forEach(btn => {
        btn.classList.remove('active');
    });
    const activeBtn = document.getElementById(`tab-${name}-btn`);
    if (activeBtn) activeBtn.classList.add('active');
    
    // Setup drag-drop for analyze view
    if (name === 'analyze') {
        setupDragDrop();
    }
    // Setup search when shown
    if (name === 'search') {
        setupSearchView();
    }
    // Setup settings when shown
    if (name === 'settings') {
        setupSettingsHandlers();
        loadSettings();
    }
};

// Setup drag and drop functionality
function setupDragDrop() {
    const dropZone = document.getElementById('drop-zone');
    if (!dropZone) return;
    
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
    
    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });
    
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        console.log('Files dropped:', e.dataTransfer.files);
    });
}

async function setupSearchView() {
    const dropZone = document.getElementById('drop-zone');
    const fileList = document.getElementById('dropped-files');
    const startBtn = document.getElementById('start-analysis');
    const clearBtn = document.getElementById('clear-queue');
    
    if (!dropZone) return;
    
    // Attach drag and drop
    dragDrop.attach(dropZone, async (paths) => {
        console.log(`[Renderer] Received ${paths.length} paths from DragDrop`);
        
        // Fallback display if IPC unavailable
        if (!window.api || !window.api.scanDropped) {
            console.error('[Renderer] IPC not available - showing files without scanning');
            const tracks = paths.map(p => ({
                name: (p.split('/').pop() || p.split('\\').pop() || p),
                path: p,
                extension: (p.includes('.') ? p.split('.').pop() : '')
            }));
            displayTracks(tracks);
            if (tracks.length > 0) {
                startBtn.style.display = 'inline-block';
                clearBtn.style.display = 'inline-block';
            }
            return;
        }
        
        try {
            console.log('[Renderer] Calling IPC scanDropped with paths:', paths);
            const result = await window.api.scanDropped({ paths });
            const normalized = (result?.tracks || []).map(t => ({
                name: t.name || t.fileName || t.filename || (t.absolutePath ? (t.absolutePath.split('/').pop() || t.absolutePath.split('\\').pop()) : ''),
                path: t.path || t.filePath || t.absolutePath || '',
                extension: (t.extension || (t.fileName || t.filename || '').split('.').pop() || '').toLowerCase()
            }));
            displayTracks(normalized);
            if (normalized.length > 0) {
                startBtn.style.display = 'inline-block';
                clearBtn.style.display = 'inline-block';
            }
        } catch (error) {
            console.error('[Renderer] Error scanning dropped files:', error);
        }
    });
    
    startBtn?.addEventListener('click', async () => {
        try {
            if (window.api?.startAnalysis) {
                await window.api.startAnalysis({});
            }
            setView('analyze');
        } catch (error) {
            console.error('[Renderer] Error starting analysis:', error);
        }
    });
    
    clearBtn?.addEventListener('click', async () => {
        try {
            if (window.api?.clearQueue) {
                await window.api.clearQueue();
            }
            displayTracks([]);
            startBtn.style.display = 'none';
            clearBtn.style.display = 'none';
        } catch (error) {
            console.error('[Renderer] Error clearing queue:', error);
        }
    });
}

function displayTracks(tracks) {
    const fileList = document.getElementById('dropped-files');
    if (!fileList) return;
    
    if (!tracks || tracks.length === 0) {
        fileList.innerHTML = '';
        return;
    }
    
    const html = `
        <h3>Files Ready for Analysis (${tracks.length})</h3>
        <table class="track-table">
            <thead>
                <tr>
                    <th>File Name</th>
                    <th>Path</th>
                    <th>Type</th>
                </tr>
            </thead>
            <tbody>
                ${tracks.map(t => `
                    <tr>
                        <td>${t.name || 'Unknown'}</td>
                        <td class="path-cell">${t.path || ''}</td>
                        <td>${t.extension || ''}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    fileList.innerHTML = html;
}
// ============================================
// LOCKED SECTION START - SETTINGS HANDLERS
// DO NOT MODIFY WITHOUT APPROVAL
// ============================================
// Settings handlers
function setupSettingsHandlers() {
    const saveBtn = document.getElementById('save-settings-btn');
    const healthBtn = document.getElementById('health-check-btn');
    const chooseBtn = document.getElementById('choose-folder-btn');
    const updateDbBtn = document.getElementById('update-db-btn');
    const updateCriteriaBtn = document.getElementById('update-criteria-btn');

    saveBtn?.addEventListener('click', saveSettings);
    healthBtn?.addEventListener('click', runHealthCheck);
    chooseBtn?.addEventListener('click', async () => {
        const folderPath = await window.api.chooseFolder();
        if (folderPath) {
            const input = document.getElementById('db-folder');
            if (input) input.value = folderPath;
            await saveSettings();
        }
    });
    updateDbBtn?.addEventListener('click', () => {
        window.api.updateDatabase().then(() => showStatus('save-status', 'Database updated', 'success'))
            .catch(() => showStatus('save-status', 'Database update failed', 'error'));
    });
    updateCriteriaBtn?.addEventListener('click', () => {
        window.api.updateCriteriaDb().then(() => showStatus('save-status', 'Criteria DB updated', 'success'))
            .catch(() => showStatus('save-status', 'Criteria DB update failed', 'error'));
    });
}

async function loadSettings() {
    try {
        const s = await window.api.getSettings();
        const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
        const setChk = (id, val) => { const el = document.getElementById(id); if (el) el.checked = !!val; };
        setVal('db-folder', s.dbFolder || '');
        setChk('auto-update-db', s.autoUpdateDb !== false);
        setVal('creative-model', s.creativeModel || 'qwen3:8b');
        setVal('tech-concurrency', s.techConcurrency || 4);
        setVal('creative-concurrency', s.creativeConcurrency || 2);
    } catch (e) {
        console.error('Failed to load settings:', e);
    }
}

async function saveSettings() {
    const getVal = (id) => { const el = document.getElementById(id); return el ? el.value : undefined; };
    const getNum = (id) => parseInt(getVal(id));
    const getChk = (id) => { const el = document.getElementById(id); return el ? el.checked : false; };
    const payload = {
        dbFolder: getVal('db-folder') || '',
        autoUpdateDb: getChk('auto-update-db'),
        creativeModel: getVal('creative-model') || 'qwen3:8b',
        techConcurrency: getNum('tech-concurrency') || 4,
        creativeConcurrency: getNum('creative-concurrency') || 2
    };
    try {
        await window.api.updateSettings(payload);
        showStatus('save-status', 'Settings saved successfully', 'success');
    } catch (e) {
        showStatus('save-status', 'Failed to save settings', 'error');
    }
}

async function runHealthCheck() {
    try {
        const r = await window.api.runHealthCheck();
        const items = [];
        items.push(r.ffprobe ? '✓ ffprobe OK' : '✗ ffprobe missing');
        items.push(r.ffmpeg ? '✓ ffmpeg OK' : '✗ ffmpeg missing');
        items.push(r.ollama ? '✓ Ollama OK' : '✗ Ollama not reachable');
        const allOk = r.ffprobe && r.ffmpeg && r.ollama;
        showStatus('health-status', items.join('<br>'), allOk ? 'success' : 'error');
    } catch (e) {
        showStatus('health-status', 'Health check failed', 'error');
    }
}

function showStatus(id, message, type) {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = message;
    el.className = `status-msg status-${type}`;
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 5000);
}
// ============================================
// LOCKED SECTION END - SETTINGS HANDLERS
// ============================================
// Tab click handlers - order: Analyze, Search, Settings
document.getElementById('tab-analyze-btn').addEventListener('click', () => setView('analyze'));
document.getElementById('tab-search-btn').addEventListener('click', () => setView('search'));
document.getElementById('tab-settings-btn').addEventListener('click', () => setView('settings'));

// Default view is Analyze
setView('analyze');



// ---- IPC quick tests (non-invasive) ----
try {
    console.log('[RENDERER] Testing IPC presence...');
    if (window.api) {
        console.log('[RENDERER] ping():', window.api.ping?.());
        window.api.onLog?.((data) => console.log('[RENDERER] log event:', data));
    } else {
        console.warn('[RENDERER] window.api is undefined');
    }
} catch (e) {
    console.error('[RENDERER] IPC quick test failed:', e);
}