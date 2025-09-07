const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const fsPromises = require('node:fs/promises');
const { analyzeMp3 } = require('./analysis/ffcalc.js');
const { pathToFileURL } = require('node:url');

// App single instance lock
if (!app.requestSingleInstanceLock()) {
    app.quit();
}

// Settings storage
let settings = {
    dbFolder: '',
    autoUpdateDb: false,
    ollamaModel: 'qwen3:30b',
    techConcurrency: 4,
    creativeConcurrency: 2
};

// Analysis queue and creative analyzer instance (lazy-loaded ESM)
let analysisQueue = [];
let creativeAnalyzer = null;

// Helper function for directory scanning
async function scanDirectory(dir) {
    const results = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...await scanDirectory(fullPath));
        } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (ext === '.mp3' || ext === '.wav') {
                results.push(fullPath);
            }
        }
    }
    return results;
}

// Settings file path
const getSettingsPath = () => path.join(app.getPath('userData'), 'settings.json');

// Load settings from file
const loadSettings = async () => {
    try {
        const data = await fsPromises.readFile(getSettingsPath(), 'utf8');
        const loaded = JSON.parse(data);
        settings = { ...settings, ...loaded };
        console.log('[MAIN] Settings loaded from file:', settings);
    } catch (err) {
        console.log('[MAIN] No settings file found, using defaults');
    }
};

// Save settings to file
const saveSettings = async () => {
    await fsPromises.writeFile(getSettingsPath(), JSON.stringify(settings, null, 2));
    console.log('[MAIN] Settings saved to file');
};

const createWindow = () => {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(app.getAppPath(), 'app', 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    win.loadFile(path.join(app.getAppPath(), 'app', 'renderer.html'));
    
    // Register IPC handler for drag-drop
    ipcMain.handle('scanDropped', async (event, { paths }) => {
        console.log('[MAIN] scanDropped:', paths.length, 'paths');
        const tracks = [];
        const seen = new Set();
        for (const filePath of paths) {
            try {
                const stat = fs.statSync(filePath);
                if (stat.isDirectory()) {
                    const files = await scanDirectory(filePath);
                    for (const file of files) {
                        const basename = path.basename(file, path.extname(file)).toLowerCase();
                        if (!seen.has(basename)) {
                            seen.add(basename);
                            tracks.push({
                                id: `track_${tracks.length}`,
                                path: file,
                                name: path.basename(file, path.extname(file)),
                                fileName: path.basename(file),
                                techStatus: 'QUEUED',
                                creativeStatus: 'QUEUED'
                            });
                        }
                    }
                } else if (stat.isFile()) {
                    const ext = path.extname(filePath).toLowerCase();
                    if (ext === '.mp3' || ext === '.wav') {
                        const basename = path.basename(filePath, ext).toLowerCase();
                        if (!seen.has(basename)) {
                            seen.add(basename);
                            tracks.push({
                                id: `track_${tracks.length}`,
                                path: filePath,
                                name: path.basename(filePath, path.extname(filePath)),
                                fileName: path.basename(filePath),
                                techStatus: 'QUEUED',
                                creativeStatus: 'QUEUED'
                            });
                        }
                    }
                }
            } catch (err) {
                console.error('[MAIN] Error processing:', filePath, err);
            }
        }
        // Capture queue for startAnalysis
        analysisQueue = tracks.map(t => ({ ...t }));
        return { tracks };
    });
    
    // Register IPC handlers
    ipcMain.handle('getSettings', async () => {
        return settings;
    });
    
    ipcMain.handle('updateSettings', async (event, newSettings) => {
        settings = { ...settings, ...newSettings };
        console.log('[MAIN] Settings updated:', settings);
        await saveSettings();
        return { success: true };
    });
    
    ipcMain.handle('chooseFolder', async () => {
        const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
        return { folder: result.canceled ? null : result.filePaths[0] };
    });
    
    ipcMain.handle('updateDatabase', async () => {
        console.log('[MAIN] Manual database update');
        return { success: true };
    });
    
    ipcMain.handle('updateCriteriaDb', async () => {
        console.log('[MAIN] Update criteria DB');
        return { success: true };
    });
    
    ipcMain.handle('runHealthCheck', async () => {
        console.log('[MAIN] Running health check...');
        const health = {
            ffmpeg: false,
            ffprobe: false,
            ollama: false,
            ollamaModel: false,
            timestamp: new Date().toISOString()
        };
        try {
            const ffmpegPath = require('ffmpeg-static');
            const ffprobePath = require('ffprobe-static').path;
            health.ffmpeg = !!ffmpegPath;
            health.ffprobe = !!ffprobePath;
        } catch (err) {
            console.error('[MAIN] FFmpeg check failed:', err);
        }
        try {
            // Lazy load CreativeAnalyzer if not loaded yet
            if (!creativeAnalyzer) {
                try {
                    const moduleUrl = pathToFileURL(path.join(app.getAppPath(), 'app', 'modules', 'creativeAnalyzer.js')).href;
                    const mod = await import(moduleUrl);
                    creativeAnalyzer = new mod.CreativeAnalyzer({ model: settings.ollamaModel || 'qwen3:8b' });
                } catch (e) {
                    console.log('[MAIN] CreativeAnalyzer load failed:', e.message);
                }
            }
            if (creativeAnalyzer) {
                const ollamaHealth = await creativeAnalyzer.checkOllamaHealth();
                health.ollama = ollamaHealth.available;
                health.ollamaModel = ollamaHealth.hasModel;
                health.availableModels = ollamaHealth.models || [];
            }
        } catch (err) {
            console.error('[MAIN] Ollama check failed:', err);
            health.ollamaError = err.message;
        }
        console.log('[MAIN] Health check complete:', health);
        return health;
    });
    
    // Other stub handlers
    ipcMain.handle('startAnalysis', async (event, options) => {
        const {
            concurrencyTech = settings.techConcurrency || 4,
            concurrencyCreative = settings.creativeConcurrency || 2,
            model = settings.ollamaModel || 'qwen3:8b'
        } = options || {};
        console.log('[MAIN] Starting analysis with:', { concurrencyTech, concurrencyCreative, model });
        // Ensure CreativeAnalyzer is available and set model
        if (!creativeAnalyzer) {
            try {
                const moduleUrl = pathToFileURL(path.join(app.getAppPath(), 'app', 'modules', 'creativeAnalyzer.js')).href;
                const mod = await import(moduleUrl);
                creativeAnalyzer = new mod.CreativeAnalyzer({ model });
            } catch (e) {
                console.log('[MAIN] CreativeAnalyzer load failed:', e.message);
            }
        } else {
            creativeAnalyzer.model = model;
        }
        for (const track of analysisQueue) {
            try {
                // Notify processing start (technical)
                win.webContents.send('queueUpdate', { trackId: track.id, techStatus: 'PROCESSING', creativeStatus: track.creativeStatus });
                // Run technical analysis
                const technicalResults = await runTechnicalAnalysis(track.path);
                track.techStatus = 'COMPLETE';
                track.technicalData = technicalResults;
                win.webContents.send('queueUpdate', { trackId: track.id, techStatus: 'COMPLETE', creativeStatus: 'PROCESSING' });
                // Creative analysis
                let creativeResults = { success: false, data: null, error: 'Analyzer not available' };
                if (creativeAnalyzer) {
                    creativeResults = await creativeAnalyzer.analyzeTrack(technicalResults);
                }
                if (creativeResults.success) {
                    track.creativeData = creativeResults.data;
                    track.creativeStatus = 'COMPLETE';
                } else {
                    track.creativeStatus = 'ERROR';
                    track.creativeError = creativeResults.error;
                }
                const combinedAnalysis = {
                    ...technicalResults,
                    creative: track.creativeData || creativeResults.data,
                    analysis_metadata: {
                        analyzed_at: new Date().toISOString(),
                        technical_version: '1.0.0',
                        creative_model: model,
                        creative_confidence: track.creativeData?.confidence || 0
                    }
                };
                await writeAnalysisFiles(track.path, combinedAnalysis);
                win.webContents.send('queueUpdate', { trackId: track.id, techStatus: track.techStatus, creativeStatus: track.creativeStatus });
                win.webContents.send('jobDone', {
                    trackId: track.id,
                    outputs: {
                        jsonPath: track.path.replace(/\.(mp3|wav)$/i, '.json'),
                        csvPath: track.path.replace(/\.(mp3|wav)$/i, '.csv')
                    }
                });
                if (settings.autoUpdateDb) {
                    await updateDatabaseForTrack(track.path, combinedAnalysis);
                }
            } catch (error) {
                console.error(`[MAIN] Analysis failed for ${track.name}:`, error);
                track.techStatus = 'ERROR';
                track.creativeStatus = 'ERROR';
                win.webContents.send('jobError', { trackId: track.id, stage: 'analysis', error: error.message });
            }
        }
        return { started: true, queueSize: analysisQueue.length };
    });
    
    ipcMain.handle('clearQueue', async () => {
        console.log('[MAIN] clearQueue');
        return { cleared: true };
    });
    
    // FFmpeg analysis handler
    ipcMain.handle('analyzeFile', async (event, filePath) => {
        try {
            console.log('[MAIN] Analyzing:', filePath);
            const result = await analyzeMp3(filePath);
            console.log('[MAIN] Analysis complete:', result.jsonPath);
            return { success: true, ...result };
        } catch (error) {
            console.error('[MAIN] Analysis failed:', error);
            return { success: false, error: error.message };
        }
    });
};

app.whenReady().then(() => {
    loadSettings().then(() => {
        createWindow();
    });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});



