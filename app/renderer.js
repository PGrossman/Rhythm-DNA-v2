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
        <div id="search-container" style="height: calc(100vh - 120px); display: flex; gap: 16px;">
            <aside id="search-filters" style="width: 34%; max-width: 440px; border-right: 1px solid #ddd; padding-right: 12px; overflow-y: auto;"></aside>
            <main id="search-results" style="flex: 1; min-width: 0; overflow-y: auto;"></main>
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
                    <option value="qwen2.5:32b-instruct">Qwen2.5 32B Instruct (Most Accurate)</option>
                    <option value="gemma2:27b-instruct">Gemma 2 27B Instruct (Very Accurate)</option>
                    <option value="mixtral:8x7b">Mixtral 8x7B (Accurate)</option>
                    <option value="qwen3:30b">Qwen3 30B (Better Quality)</option>
                    <option value="qwen3:8b">Qwen3 8B (Fast, Default)</option>
                </select>
                <div style="margin-top: 8px; font-size: 12px; color: #666;">
                    Note: Larger models require more RAM and take longer but provide better accuracy. Install models with: <code>ollama pull [model-name]</code>
                </div>
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
        const settings = await window.api.getSettings();
        if (settings.dbFolder) document.getElementById('db-folder').value = settings.dbFolder;
        document.getElementById('auto-update-db').checked = settings.autoUpdateDb || false;
        document.getElementById('ollama-model').value = settings.ollamaModel || 'qwen3:8b';
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
    } else if (name === 'search') {
        setupSearchView();
    } else if (name === 'settings') {
        setupSettingsView();
    }
};

function setupSearchView() {
    const filters = document.getElementById('search-filters');
    const results = document.getElementById('search-results');
    
    if (!filters || !results) {
        console.error('Search elements not found');
        return;
    }
    
    let searchDB = { tracks: [], criteria: {} };
    let selectedFilters = {};
    
    // Load database
    loadSearchDB();
    
    async function loadSearchDB() {
        try {
            const data = await window.api.loadSearchDb();
            if (data.ok) {
                searchDB.tracks = data.rhythm || [];
                searchDB.criteria = data.criteria || {};
                buildFilters();
                showRandomTracks();
            }
        } catch (e) {
            console.error('Failed to load DB:', e);
            results.innerHTML = '<p style="padding: 20px;">Failed to load database</p>';
        }
    }
    
    function buildFilters() {
        const values = {
            instrument: new Set(),
            genre: new Set(),
            mood: new Set(),
            theme: new Set(),
            vocals: new Set()
        };
        
        searchDB.tracks.forEach(track => {
            // Instruments - check multiple possible locations
            const instruments = track.creative?.instrument || track.instrument || [];
            instruments.forEach(i => values.instrument.add(i));
            
            // Also check audio_probes for detected instruments
            if (track.audio_probes) {
                Object.entries(track.audio_probes).forEach(([key, val]) => {
                    if (val === true) {
                        const mapped = key.charAt(0).toUpperCase() + key.slice(1);
                        values.instrument.add(mapped);
                    }
                });
            }
            
            // Other creative fields
            const creative = track.creative || {};
            (creative.genre || []).forEach(g => values.genre.add(g));
            (creative.mood || []).forEach(m => values.mood.add(m));
            (creative.theme || []).forEach(t => values.theme.add(t));
            (creative.vocals || []).forEach(v => values.vocals.add(v));
        });
        
        filters.innerHTML = `
            <div style="margin-bottom: 20px;">
                <button id="search-clear" style="margin-right: 10px;">Clear</button>
                <button id="search-run">Search</button>
            </div>
        `;
        
        const FACETS = [
            { key: 'instrument', label: 'Instrument' },
            { key: 'genre', label: 'Genre' },
            { key: 'mood', label: 'Mood' },
            { key: 'vocals', label: 'Vocals' },
            { key: 'theme', label: 'Theme' }
        ];
        
        FACETS.forEach(({ key, label }) => {
            const valuesList = Array.from(values[key]).sort();
            if (!valuesList.length) return;
            
            const section = document.createElement('details');
            section.style.marginBottom = '15px';
            section.open = true;
            
            section.innerHTML = `
                <summary style="cursor: pointer; font-weight: bold; padding: 5px 0;">
                    ${label} (${valuesList.length})
                </summary>
                <div id="facet-${key}" style="padding-left: 10px; max-height: 300px; overflow-y: auto;"></div>
            `;
            
            const body = section.querySelector(`#facet-${key}`);
            
            valuesList.forEach(val => {
                const opt = document.createElement('label');
                opt.style.display = 'block';
                opt.style.margin = '5px 0';
                opt.innerHTML = `
                    <input type="checkbox" value="${val}" data-facet="${key}">
                    <span>${val}</span>
                `;
                body.appendChild(opt);
            });
            
            filters.appendChild(section);
        });
        
        // Wire up buttons
        document.getElementById('search-run')?.addEventListener('click', runSearch);
        document.getElementById('search-clear')?.addEventListener('click', clearFilters);
    }
    
    function getTitle(track) {
        return track.title || 
               track.id3?.title || 
               track.file?.replace(/\.(mp3|wav)$/i, '') ||
               track.path?.split('/').pop()?.replace(/\.(mp3|wav)$/i, '') ||
               'Unknown Track';
    }
    
    function showRandomTracks() {
        const random = [...searchDB.tracks].sort(() => Math.random() - 0.5).slice(0, 5);
        renderResults(random);
    }
    
    async function renderResults(tracks) {
        results.innerHTML = '';
        
        if (!tracks.length) {
            results.innerHTML = '<p style="padding: 20px;">No matching tracks found.</p>';
            return;
        }
        
        for (const track of tracks) {
            const card = document.createElement('div');
            card.style.cssText = 'border: 1px solid #e5e5e5; border-radius: 8px; padding: 15px; margin-bottom: 15px;';
            
            const title = getTitle(track);
            const artist = track.id3?.artist || track.artist || '';
            const path = track.path || track.file || '';
            
            // Check for waveform
            let waveformHtml = '<div style="height: 100px; background: #f5f5f5; display: flex; align-items: center; justify-content: center; color: #999;">Waveform not available</div>';
            
            if (track.waveform_png) {
                try {
                    const response = await fetch(`file://${track.waveform_png}`);
                    if (response.ok) {
                        waveformHtml = `<img src="file://${track.waveform_png}" style="width: 100%; height: 100px; object-fit: cover;">`;
                    }
                } catch (e) {
                    // File doesn't exist, use placeholder
                }
            }
            
            card.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px;">
                    <div>
                        <h4 style="margin: 0 0 5px 0;">${title}</h4>
                        ${artist ? `<p style="color: #666; margin: 0;">${artist}</p>` : ''}
                    </div>
                    <button onclick="window.api.revealInFinder('${path.replace(/'/g, "\\'")}')">Show in Finder</button>
                </div>
                ${waveformHtml}
            `;
            
            results.appendChild(card);
        }
    }
    
    function trackMatches(track, filters) {
        for (const [facet, values] of Object.entries(filters)) {
            if (!values.length) continue;
            
            let trackValues = [];
            
            if (facet === 'instrument') {
                trackValues = track.creative?.instrument || track.instrument || [];
                
                if (track.audio_probes) {
                    Object.entries(track.audio_probes).forEach(([key, val]) => {
                        if (val === true) {
                            trackValues.push(key.charAt(0).toUpperCase() + key.slice(1));
                        }
                    });
                }
            } else {
                trackValues = track.creative?.[facet] || track[facet] || [];
            }
            
            const hasMatch = values.some(v => 
                trackValues.some(tv => 
                    tv === v || tv.toLowerCase() === v.toLowerCase()
                )
            );
            
            if (!hasMatch) return false;
        }
        return true;
    }
    
    function runSearch() {
        selectedFilters = {};
        
        document.querySelectorAll('#search-filters input[type="checkbox"]:checked').forEach(cb => {
            const facet = cb.dataset.facet;
            if (!selectedFilters[facet]) selectedFilters[facet] = [];
            selectedFilters[facet].push(cb.value);
        });
        
        const filtered = searchDB.tracks.filter(track => trackMatches(track, selectedFilters));
        renderResults(filtered);
    }
    
    function clearFilters() {
        document.querySelectorAll('#search-filters input[type="checkbox"]').forEach(cb => {
            cb.checked = false;
        });
        showRandomTracks();
    }
}

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


