// Functional three-tab UI controller

let currentView = 'search';
let tracks = [];
let settings = {};

// Wait for DOM ready
document.addEventListener('DOMContentLoaded', async () => {
    console.log('RhythmDNA renderer loaded');
    
    // Load settings
    try {
        settings = await window.api.getSettings();
        console.log('Settings loaded:', settings);
    } catch (error) {
        console.error('Failed to load settings:', error);
    }
    
    const panel = document.getElementById('panel');

    const views = {
        search: () => `
            <h2>Search & Import</h2>
            <div style="border: 2px dashed #ccc; padding: 40px; text-align: center; margin: 20px 0;" id="dropzone">
                <p>Drop audio files or folders here</p>
                <p style="color: #666; font-size: 14px;">Supported: MP3, WAV</p>
            </div>
            <button id="browse-btn" style="padding: 8px 16px; margin-right: 10px;">Browse Files</button>
            <div id="file-list" style="margin-top: 20px;"></div>
        `,
        analyze: () => `
            <h2>Analysis Queue</h2>
            <div style="margin: 20px 0;">
                <button id="start-analysis-btn" style="padding: 8px 16px; margin-right: 10px; background: #28a745; color: white; border: none; border-radius: 4px;">Start Analysis</button>
                <button id="clear-queue-btn" style="padding: 8px 16px; margin-right: 10px;">Clear Queue</button>
                <button id="update-db-btn" style="padding: 8px 16px;" ${settings.autoUpdateDb ? 'disabled style="opacity: 0.5;"' : ''}>Update Database</button>
            </div>
            <div id="tracks-table" style="margin-top: 20px;">
                ${renderTracksTable()}
            </div>
        `,
        settings: () => `
            <h2>Settings</h2>
            <div style="max-width: 600px;">
                <div style="margin: 20px 0;">
                    <label style="display: block; margin-bottom: 5px; font-weight: bold;">Database Folder:</label>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <input type="text" id="db-folder" value="${settings.dbFolder || ''}" style="flex: 1; padding: 8px;" readonly>
                        <button id="choose-db-folder" style="padding: 8px 16px;">Choose Folder</button>
                    </div>
                </div>
                
                <div style="margin: 20px 0;">
                    <label style="display: flex; align-items: center; gap: 8px;">
                        <input type="checkbox" id="auto-update" ${settings.autoUpdateDb ? 'checked' : ''}>
                        <span>Auto-update Database</span>
                    </label>
                </div>
                
                <div style="margin: 20px 0;">
                    <label style="display: block; margin-bottom: 5px; font-weight: bold;">Creative Model:</label>
                    <select id="creative-model" style="padding: 8px; width: 200px;">
                        <option value="qwen3:8b" ${settings.creativeModel === 'qwen3:8b' ? 'selected' : ''}>qwen3:8b</option>
                        <option value="qwen3:30b" ${settings.creativeModel === 'qwen3:30b' ? 'selected' : ''}>qwen3:30b</option>
                    </select>
                </div>
                
                <div style="margin: 20px 0;">
                    <label style="display: block; margin-bottom: 5px; font-weight: bold;">Technical Concurrency:</label>
                    <input type="number" id="tech-concurrency" value="${settings.concurrencyTech || 4}" min="1" max="8" style="padding: 8px; width: 100px;">
                </div>
                
                <div style="margin: 20px 0;">
                    <label style="display: block; margin-bottom: 5px; font-weight: bold;">Creative Concurrency:</label>
                    <input type="number" id="creative-concurrency" value="${settings.concurrencyCreative || 2}" min="1" max="4" style="padding: 8px; width: 100px;">
                </div>
                
                <div style="margin: 30px 0;">
                    <button id="run-health-check" style="padding: 8px 16px; background: #17a2b8; color: white; border: none; border-radius: 4px;">Run Health Check</button>
                    <button id="update-criteria-db" style="padding: 8px 16px; margin-left: 10px;">Update Criteria DB</button>
                </div>
                
                <div id="health-status" style="margin-top: 20px;"></div>
            </div>
        `
    };

    const setView = (name) => {
        currentView = name;
        panel.innerHTML = views[name]() || '';
        
        // Set up view-specific handlers
        if (name === 'search') setupSearchHandlers();
        if (name === 'analyze') setupAnalyzeHandlers();
        if (name === 'settings') setupSettingsHandlers();
    };

    // Tab event listeners
    const searchBtn = document.getElementById('tab-search-btn');
    const analyzeBtn = document.getElementById('tab-analyze-btn');
    const settingsBtn = document.getElementById('tab-settings-btn');

    if (searchBtn) searchBtn.addEventListener('click', () => setView('search'));
    if (analyzeBtn) analyzeBtn.addEventListener('click', () => setView('analyze'));
    if (settingsBtn) settingsBtn.addEventListener('click', () => setView('settings'));

    // Default view
    setView('search');
});

// Search tab handlers
function setupSearchHandlers() {
    const dropzone = document.getElementById('dropzone');
    const browseBtn = document.getElementById('browse-btn');
    
    if (dropzone) {
        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropzone.style.background = '#e8f4fd';
        });
        
        dropzone.addEventListener('dragleave', () => {
            dropzone.style.background = '';
        });
        
        dropzone.addEventListener('drop', async (e) => {
            e.preventDefault();
            dropzone.style.background = '';
            
            const files = Array.from(e.dataTransfer.files);
            const paths = files.map(file => file.path);
            
            try {
                const result = await window.api.scanDropped(paths);
                tracks = result.tracks;
                
                const fileList = document.getElementById('file-list');
                if (fileList) {
                    fileList.innerHTML = `
                        <h3>Files Found: ${tracks.length}</h3>
                        <ul>
                            ${tracks.map(track => `<li>${track.filename}</li>`).join('')}
                        </ul>
                    `;
                }
                
                console.log('Processed files:', tracks);
            } catch (error) {
                console.error('Error processing dropped files:', error);
            }
        });
    }
    
    if (browseBtn) {
        browseBtn.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.multiple = true;
            input.accept = '.mp3,.wav';
            
            input.addEventListener('change', async (e) => {
                const files = Array.from(e.target.files);
                const paths = files.map(file => file.path);
                
                try {
                    const result = await window.api.scanDropped(paths);
                    tracks = result.tracks;
                    
                    const fileList = document.getElementById('file-list');
                    if (fileList) {
                        fileList.innerHTML = `
                            <h3>Files Found: ${tracks.length}</h3>
                            <ul>
                                ${tracks.map(track => `<li>${track.filename}</li>`).join('')}
                            </ul>
                        `;
                    }
                } catch (error) {
                    console.error('Error processing files:', error);
                }
            });
            
            input.click();
        });
    }
}

// Analysis tab handlers
function setupAnalyzeHandlers() {
    const startBtn = document.getElementById('start-analysis-btn');
    const clearBtn = document.getElementById('clear-queue-btn');
    const updateDbBtn = document.getElementById('update-db-btn');
    
    if (startBtn) {
        startBtn.addEventListener('click', async () => {
            try {
                const options = {
                    concurrencyTech: settings.concurrencyTech,
                    concurrencyCreative: settings.concurrencyCreative,
                    model: settings.creativeModel
                };
                
                await window.api.startAnalysis(options);
                console.log('Analysis started');
            } catch (error) {
                console.error('Error starting analysis:', error);
            }
        });
    }
    
    if (clearBtn) {
        clearBtn.addEventListener('click', async () => {
            try {
                await window.api.clearQueue();
                tracks = [];
                console.log('Queue cleared');
                
                // Refresh the view
                const tracksTable = document.getElementById('tracks-table');
                if (tracksTable) {
                    tracksTable.innerHTML = renderTracksTable();
                }
            } catch (error) {
                console.error('Error clearing queue:', error);
            }
        });
    }
    
    if (updateDbBtn && !settings.autoUpdateDb) {
        updateDbBtn.addEventListener('click', async () => {
            try {
                await window.api.updateDatabase();
                console.log('Database updated');
            } catch (error) {
                console.error('Error updating database:', error);
            }
        });
    }
}

// Settings tab handlers
function setupSettingsHandlers() {
    const autoUpdateCheck = document.getElementById('auto-update');
    const creativeModelSelect = document.getElementById('creative-model');
    const techConcurrencyInput = document.getElementById('tech-concurrency');
    const creativeConcurrencyInput = document.getElementById('creative-concurrency');
    const healthCheckBtn = document.getElementById('run-health-check');
    const updateCriteriaBtn = document.getElementById('update-criteria-db');
    
    if (autoUpdateCheck) {
        autoUpdateCheck.addEventListener('change', async (e) => {
            try {
                settings = await window.api.updateSettings({ autoUpdateDb: e.target.checked });
                console.log('Auto-update setting changed:', e.target.checked);
            } catch (error) {
                console.error('Error updating auto-update setting:', error);
            }
        });
    }
    
    if (creativeModelSelect) {
        creativeModelSelect.addEventListener('change', async (e) => {
            try {
                settings = await window.api.updateSettings({ creativeModel: e.target.value });
                console.log('Creative model changed:', e.target.value);
            } catch (error) {
                console.error('Error updating creative model:', error);
            }
        });
    }
    
    if (techConcurrencyInput) {
        techConcurrencyInput.addEventListener('change', async (e) => {
            try {
                const value = parseInt(e.target.value);
                settings = await window.api.updateSettings({ concurrencyTech: value });
                console.log('Tech concurrency changed:', value);
            } catch (error) {
                console.error('Error updating tech concurrency:', error);
            }
        });
    }
    
    if (creativeConcurrencyInput) {
        creativeConcurrencyInput.addEventListener('change', async (e) => {
            try {
                const value = parseInt(e.target.value);
                settings = await window.api.updateSettings({ concurrencyCreative: value });
                console.log('Creative concurrency changed:', value);
            } catch (error) {
                console.error('Error updating creative concurrency:', error);
            }
        });
    }
    
    if (healthCheckBtn) {
        healthCheckBtn.addEventListener('click', async () => {
            try {
                const results = await window.api.runHealthCheck();
                displayHealthResults(results);
            } catch (error) {
                console.error('Error running health check:', error);
            }
        });
    }
    
    if (updateCriteriaBtn) {
        updateCriteriaBtn.addEventListener('click', async () => {
            try {
                await window.api.updateCriteriaDb();
                console.log('Criteria database updated');
            } catch (error) {
                console.error('Error updating criteria database:', error);
            }
        });
    }
}

// Helper functions
function renderTracksTable() {
    if (tracks.length === 0) {
        return '<p style="color: #666;">No files in queue. Use the Search tab to add files.</p>';
    }
    
    return `
        <table style="width: 100%; border-collapse: collapse;">
            <thead>
                <tr style="background: #f8f9fa;">
                    <th style="padding: 12px; text-align: left; border: 1px solid #ddd;">File</th>
                    <th style="padding: 12px; text-align: center; border: 1px solid #ddd;">Technical</th>
                    <th style="padding: 12px; text-align: center; border: 1px solid #ddd;">Creative</th>
                </tr>
            </thead>
            <tbody>
                ${tracks.map(track => `
                    <tr>
                        <td style="padding: 12px; border: 1px solid #ddd;">${track.filename}</td>
                        <td style="padding: 12px; text-align: center; border: 1px solid #ddd;">
                            <span style="padding: 4px 8px; border-radius: 12px; font-size: 12px; background: ${getStatusColor(track.techStatus)}; color: white;">
                                ${track.techStatus}
                            </span>
                        </td>
                        <td style="padding: 12px; text-align: center; border: 1px solid #ddd;">
                            <span style="padding: 4px 8px; border-radius: 12px; font-size: 12px; background: ${getStatusColor(track.creativeStatus)}; color: white;">
                                ${track.creativeStatus}
                            </span>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function getStatusColor(status) {
    switch (status) {
        case 'QUEUED': return '#6c757d';
        case 'PROCESSING': return '#ffc107';
        case 'COMPLETE': return '#28a745';
        case 'ERROR': return '#dc3545';
        default: return '#6c757d';
    }
}

function displayHealthResults(results) {
    const statusDiv = document.getElementById('health-status');
    if (statusDiv) {
        statusDiv.innerHTML = `
            <h4>Health Check Results:</h4>
            <ul>
                <li>FFprobe: ${results.ffprobe ? '✅ Working' : '❌ Not Working'}</li>
                <li>FFmpeg Filters: ${results.ffmpeg ? '✅ Working' : '❌ Not Working'}</li>
                <li>Ollama: ${results.ollama ? '✅ Working' : '❌ Not Working'}</li>
            </ul>
        `;
    }
}

// Event listeners for IPC events
window.api.onQueueUpdate((event, data) => {
    console.log('Queue update:', data);
});

window.api.onJobProgress((event, data) => {
    console.log('Job progress:', data);
});

window.api.onJobDone((event, data) => {
    console.log('Job done:', data);
});

window.api.onJobError((event, data) => {
    console.error('Job error:', data);
});

window.api.onLog((event, data) => {
    console.log('App log:', data);
});