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
        <div style="display: grid; grid-template-columns: 250px 1fr; gap: 20px; height: calc(100vh - 100px); padding: 20px;">
            <!-- Left column: Filters -->
            <div style="border-right: 1px solid #e5e5e5; padding-right: 20px; overflow-y: auto;">
                <h3 style="margin: 0 0 15px 0;">Filters</h3>
                <button id="clear-filters" style="width: 100%; padding: 8px; margin-bottom: 15px; background: #ef4444; color: white; border: none; border-radius: 6px; cursor: pointer;">
                    Clear All
                </button>
                <div id="search-filters">
                    <!-- Filters will be populated here -->
                </div>
            </div>
            
            <!-- Right column: Results -->
            <div style="overflow-y: auto;">
                <h2 style="margin: 0 0 20px 0;">Search Library</h2>
                <div id="results-container">
                    <p style="color: #666;">Loading...</p>
                </div>
            </div>
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

// Global audio element and playback state
let currentAudio = null;
let currentPlayingPath = null;
let playheadAnimationId = null;

// Helper for file URLs - fallback if not in preload
function makeFileUrl(path) {
    if (window.api.toFileUrl) {
        return window.api.toFileUrl(path);
    }
    // Fallback encoding
    return 'file://' + encodeURI(path.replace(/\\/g, '/'));
}

async function setupSearchView() {
    console.log('[SEARCH] Initializing search view');
    
    // Create shared audio element if not exists
    if (!currentAudio) {
        currentAudio = new Audio();
        currentAudio.addEventListener('ended', () => {
            stopPlayback();
        });
        currentAudio.addEventListener('error', (e) => {
            console.error('[SEARCH] Audio error:', e);
            stopPlayback();
        });
    }
    
    const resultsContainer = document.getElementById('results-container');
    const filtersContainer = document.getElementById('search-filters');
    
    if (!resultsContainer || !filtersContainer) {
        console.error('[SEARCH] Missing containers');
        return;
    }
    
    try {
        // Load database
        const dbData = await window.api.searchGetDB();
        
        // Check for error response
        if (dbData && dbData.success === false) {
            throw new Error(dbData.error || 'Database load failed');
        }
        
        // Normalize tracks from various formats to array
        let allTracks = [];
        if (Array.isArray(dbData.rhythm)) {
            allTracks = dbData.rhythm;
        } else if (dbData.rhythm?.tracks) {
            allTracks = Object.values(dbData.rhythm.tracks);
        } else if (dbData.rhythm && typeof dbData.rhythm === 'object') {
            // Handle direct object format {"id": {track}, "id2": {track}}
            allTracks = Object.values(dbData.rhythm);
        }
        
        console.log('[SEARCH] Loaded', allTracks.length, 'tracks');
        
        if (!allTracks.length) {
            resultsContainer.innerHTML = '<p style="padding: 20px; color: #666;">No analyzed tracks found. Analyze some audio files first.</p>';
            return;
        }
        
        // Store tracks globally for filtering
        window.__searchTracks = allTracks;
        window.__activeFilters = {};
        
        // Render filters (remove old listeners first)
        const oldFilters = document.getElementById('search-filters');
        const newFilters = oldFilters.cloneNode(false);
        oldFilters.parentNode.replaceChild(newFilters, oldFilters);
        
        renderFilters(dbData.criteria || {});
        
        // Generate missing waveforms for first batch
        const firstBatch = allTracks.slice(0, 20);
        await ensureWaveforms(firstBatch);
        
        // Render initial results
        renderResults(firstBatch);
        
        // Wire up filter handlers
        setupFilterHandlers();
        
    } catch (error) {
        console.error('[SEARCH] Error:', error);
        resultsContainer.innerHTML = '<p style="padding: 20px; color: red;">Error loading search data: ' + error.message + '</p>';
    }
}

async function ensureWaveforms(tracks) {
    // Generate waveforms for tracks that don't have them
    const promises = tracks.map(async (track) => {
        if (!track.waveform_png && track.path) {
            try {
                const result = await window.api.getWaveformPng(track.path);
                if (result?.ok && result.png) {
                    track.waveform_png = result.png;
                }
            } catch (e) {
                console.log('[SEARCH] Could not generate waveform for:', track.path);
            }
        }
    });
    
    await Promise.all(promises);
}

function renderFilters(criteria) {
    const container = document.getElementById('search-filters');
    if (!container) return;
    
    container.innerHTML = '';
    
    // Define all filter sections from CriteriaDB
    const sections = [
        { key: 'genre', label: 'Genre', values: criteria.genre || {} },
        { key: 'mood', label: 'Mood', values: criteria.mood || {} },
        { key: 'instrument', label: 'Instruments', values: criteria.instrument || {} },
        { key: 'theme', label: 'Themes', values: criteria.theme || {} },
        { key: 'vocals', label: 'Vocals', values: criteria.vocals || {} },
        { key: 'tempoBands', label: 'Tempo', values: criteria.tempoBands || {} },
        { key: 'keys', label: 'Key', values: criteria.keys || {} },
        { key: 'artists', label: 'Artists', values: criteria.artists || {} }
    ];
    
    sections.forEach(section => {
        const values = Object.keys(section.values).sort();
        if (!values.length) return;
        
        const div = document.createElement('details');
        div.open = section.key === 'genre' || section.key === 'mood'; // Open first two by default
        div.style.marginBottom = '15px';
        div.innerHTML = `
            <summary style="cursor: pointer; font-weight: bold; padding: 5px 0; user-select: none;">
                ${section.label} (${values.length})
            </summary>
            <div style="padding-left: 10px; max-height: 200px; overflow-y: auto;">
                ${values.map(val => `
                    <label style="display: block; margin: 3px 0; cursor: pointer;">
                        <input type="checkbox" data-facet="${section.key}" value="${val}" style="margin-right: 5px;">
                        <span style="font-size: 14px;">${val} (${section.values[val]})</span>
                    </label>
                `).join('')}
            </div>
        `;
        container.appendChild(div);
    });
}

function setupFilterHandlers() {
    // Clear filters button
    const clearBtn = document.getElementById('clear-filters');
    if (clearBtn) {
        clearBtn.onclick = async () => {
            document.querySelectorAll('#search-filters input[type="checkbox"]').forEach(cb => {
                cb.checked = false;
            });
            window.__activeFilters = {};
            const toShow = window.__searchTracks.slice(0, 20);
            await ensureWaveforms(toShow);
            renderResults(toShow);
        };
    }
    
    // Individual filter checkboxes
    document.getElementById('search-filters').addEventListener('change', async (e) => {
        if (e.target.type !== 'checkbox') return;
        
        const facet = e.target.dataset.facet;
        const value = e.target.value;
        
        if (!window.__activeFilters[facet]) {
            window.__activeFilters[facet] = new Set();
        }
        
        if (e.target.checked) {
            window.__activeFilters[facet].add(value);
        } else {
            window.__activeFilters[facet].delete(value);
            if (window.__activeFilters[facet].size === 0) {
                delete window.__activeFilters[facet];
            }
        }
        
        // Apply filters
        const filtered = filterTracks(window.__searchTracks, window.__activeFilters);
        const toShow = filtered.slice(0, 50); // Cap at 50 for performance
        await ensureWaveforms(toShow);
        renderResults(toShow);
    });
}

function filterTracks(tracks, filters) {
    if (!filters || Object.keys(filters).length === 0) {
        return tracks;
    }
    
    return tracks.filter(track => {
        for (const [facet, values] of Object.entries(filters)) {
            if (values.size === 0) continue;
            
            let trackValues = [];
            
            // Handle different facet sources
            if (facet === 'instrument') {
                // Combine creative instruments and audio probes
                trackValues = track.creative?.instrument || [];
                if (track.audio_probes) {
                    Object.entries(track.audio_probes).forEach(([key, val]) => {
                        if (val === true) {
                            trackValues.push(key);
                        }
                    });
                }
            } else if (facet === 'vocals') {
                // Handle boolean vocals as yes/no
                const hasVocals = track.creative?.vocals || track.audio_probes?.vocals;
                trackValues = hasVocals ? ['yes'] : ['no'];
            } else if (facet === 'tempoBands') {
                // Use tempoBand field
                trackValues = track.tempoBand ? [track.tempoBand] : [];
            } else if (facet === 'artists') {
                // Use artist field
                trackValues = track.artist ? [track.artist] : [];
            } else {
                // Standard array fields from creative
                trackValues = track.creative?.[facet] || track[facet] || [];
            }
            
            // Convert to array if string
            if (typeof trackValues === 'string') {
                trackValues = [trackValues];
            }
            
            // Check if any filter value matches
            const hasMatch = Array.from(values).some(filterVal => 
                trackValues.some(trackVal => 
                    String(trackVal).toLowerCase() === String(filterVal).toLowerCase()
                )
            );
            
            if (!hasMatch) return false;
        }
        return true;
    });
}

function renderResults(tracks) {
    const container = document.getElementById('results-container');
    if (!container) return;
    
    if (!tracks.length) {
        container.innerHTML = '<p style="padding: 20px;">No matching tracks found.</p>';
        return;
    }
    
    container.innerHTML = '';
    
    tracks.forEach((track, index) => {
        const title = track.title || track.id3?.title || 
                     track.path?.split('/').pop()?.replace(/\.(mp3|wav)$/i, '') || 
                     'Unknown Track';
        const artist = track.artist || track.id3?.artist || '';
        
        const card = document.createElement('div');
        card.style.cssText = 'border: 1px solid #e5e5e5; border-radius: 8px; padding: 15px; margin-bottom: 15px; background: white;';
        card.dataset.trackPath = track.path;
        
        // Build waveform with click-to-seek
        let waveformHtml = '';
        if (track.waveform_png) {
            const waveformUrl = makeFileUrl(track.waveform_png);
            waveformHtml = `
                <div style="position: relative; margin: 10px 0; cursor: pointer;" class="waveform-container" data-path="${track.path}">
                    <img src="${waveformUrl}" 
                         style="width: 100%; height: 60px; object-fit: cover; border-radius: 4px; display: block;"
                         onerror="this.style.display='none'">
                    <div class="playhead" style="position: absolute; top: 0; left: 0; width: 2px; height: 60px; background: red; display: none; pointer-events: none;"></div>
                </div>
            `;
        } else {
            waveformHtml = '<div style="height: 60px; background: #f5f5f5; border-radius: 4px; margin: 10px 0; display: flex; align-items: center; justify-content: center; color: #999;">No waveform</div>';
        }
        
        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 5px;">
                <div style="flex: 1;">
                    <h4 style="margin: 0; font-size: 16px;">${title}</h4>
                    ${artist ? `<p style="color: #666; margin: 2px 0; font-size: 14px;">${artist}</p>` : ''}
                </div>
                <div style="display: flex; gap: 8px;">
                    <button class="play-btn" data-path="${track.path}" 
                            style="padding: 6px 12px; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px;">
                        Play
                    </button>
                    <button onclick="window.api.searchShowFile('${track.path.replace(/'/g, "\\'").replace(/"/g, '\\"')}')" 
                            style="padding: 6px 12px; background: #007AFF; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px;">
                        Finder
                    </button>
                </div>
            </div>
            ${waveformHtml}
        `;
        
        container.appendChild(card);
    });
    
    // Wire up play buttons
    document.querySelectorAll('.play-btn').forEach(btn => {
        btn.onclick = () => togglePlayback(btn.dataset.path);
    });
    
    // Wire up waveform click-to-seek
    document.querySelectorAll('.waveform-container').forEach(container => {
        container.onclick = (e) => {
            const rect = container.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const percent = x / rect.width;
            seekToPercent(container.dataset.path, percent);
        };
    });
}

function togglePlayback(path) {
    if (currentPlayingPath === path && !currentAudio.paused) {
        stopPlayback();
    } else {
        startPlayback(path);
    }
}

function startPlayback(path) {
    // Stop any current playback
    stopPlayback();
    
    // Set new source
    currentAudio.src = makeFileUrl(path);
    currentPlayingPath = path;
    
    // Update UI
    document.querySelectorAll('.play-btn').forEach(btn => {
        btn.textContent = btn.dataset.path === path ? 'Pause' : 'Play';
        btn.style.background = btn.dataset.path === path ? '#ef4444' : '#10b981';
    });
    
    // Show and animate playhead for this track
    const container = document.querySelector(`.waveform-container[data-path="${path}"]`);
    if (container) {
        const playhead = container.querySelector('.playhead');
        if (playhead) {
            playhead.style.display = 'block';
            
            // Use requestAnimationFrame for smooth updates
            const updatePlayhead = () => {
                if (!currentAudio || currentAudio.paused || currentPlayingPath !== path) {
                    return;
                }
                if (currentAudio.duration && isFinite(currentAudio.duration)) {
                    const percent = currentAudio.currentTime / currentAudio.duration;
                    playhead.style.left = (percent * 100) + '%';
                }
                playheadAnimationId = requestAnimationFrame(updatePlayhead);
            };
            
            // Cancel any existing animation
            if (playheadAnimationId) {
                cancelAnimationFrame(playheadAnimationId);
            }
            
            playheadAnimationId = requestAnimationFrame(updatePlayhead);
        }
    }
    
    currentAudio.play().catch(e => {
        console.error('[SEARCH] Play failed:', e);
        stopPlayback();
    });
}

function stopPlayback() {
    if (currentAudio) {
        currentAudio.pause();
    }
    
    // Cancel playhead animation
    if (playheadAnimationId) {
        cancelAnimationFrame(playheadAnimationId);
        playheadAnimationId = null;
    }
    
    // Reset all UI
    document.querySelectorAll('.play-btn').forEach(btn => {
        btn.textContent = 'Play';
        btn.style.background = '#10b981';
    });
    
    document.querySelectorAll('.playhead').forEach(playhead => {
        playhead.style.display = 'none';
        playhead.style.left = '0';
    });
    
    currentPlayingPath = null;
}

function seekToPercent(path, percent) {
    if (currentPlayingPath !== path) {
        startPlayback(path);
    }
    
    // Handle seeking before metadata loads
    if (!currentAudio.duration || !isFinite(currentAudio.duration)) {
        currentAudio.addEventListener('loadedmetadata', function onMetadata() {
            currentAudio.removeEventListener('loadedmetadata', onMetadata);
            if (currentAudio.duration && isFinite(currentAudio.duration)) {
                currentAudio.currentTime = currentAudio.duration * percent;
            }
        });
    } else {
        currentAudio.currentTime = currentAudio.duration * percent;
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


