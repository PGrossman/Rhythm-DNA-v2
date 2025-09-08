const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const fsPromises = require('node:fs/promises');
const { analyzeMp3 } = require('./analysis/ffcalc.js');
const DB = require('./db/jsondb.js');

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

// DB paths helper
let dbPaths = null;
async function resolveDbPaths() {
    dbPaths = await DB.getPaths({ 
        dbFolder: settings.dbFolder, 
        userData: app.getPath('userData') 
    });
}

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

// Check if analysis files exist for a given file
function hasExistingAnalysis(filePath) {
    const dir = path.dirname(filePath);
    const ext = path.extname(filePath);
    const baseName = path.basename(filePath, ext);
    const jsonPath = path.join(dir, `${baseName}.json`);
    const csvPath = path.join(dir, `${baseName}.csv`);
    // Return true if either JSON or CSV exists
    return fs.existsSync(jsonPath) || fs.existsSync(csvPath);
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
                            const hasAnalysis = hasExistingAnalysis(file);
                            tracks.push({
                                path: file,
                                fileName: path.basename(file),
                                status: hasAnalysis ? 'RE-ANALYZE' : 'QUEUED',
                                hasExistingAnalysis: hasAnalysis
                            });
                        }
                    }
                } else if (stat.isFile()) {
                    const ext = path.extname(filePath).toLowerCase();
                    if (ext === '.mp3' || ext === '.wav') {
                        const basename = path.basename(filePath, ext).toLowerCase();
                        if (!seen.has(basename)) {
                            seen.add(basename);
                            const hasAnalysis = hasExistingAnalysis(filePath);
                            tracks.push({
                                path: filePath,
                                fileName: path.basename(filePath),
                                status: hasAnalysis ? 'RE-ANALYZE' : 'QUEUED',
                                hasExistingAnalysis: hasAnalysis
                            });
                        }
                    }
                }
            } catch (err) {
                console.error('[MAIN] Error processing:', filePath, err);
            }
        }
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
        await resolveDbPaths();
        return { success: true };
    });
    
    ipcMain.handle('chooseFolder', async () => {
        const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
        return { folder: result.canceled ? null : result.filePaths[0] };
    });
    
    ipcMain.handle('updateDatabase', async () => {
        try {
            if (!dbPaths) await resolveDbPaths();
            const summary = await DB.getSummary(dbPaths);
            console.log('[MAIN] DB summary:', summary);
            return { success: true, summary };
        } catch (e) {
            console.error('[MAIN] updateDatabase error:', e);
            return { success: false, error: String(e) };
        }
    });
    
    ipcMain.handle('updateCriteriaDb', async () => {
        try {
            if (!dbPaths) await resolveDbPaths();
            const result = await DB.rebuildCriteria(dbPaths);
            console.log('[MAIN] Criteria rebuilt:', result);
            return { success: true, ...result };
        } catch (e) {
            console.error('[MAIN] updateCriteriaDb error:', e);
            return { success: false, error: String(e) };
        }
    });
    
    ipcMain.handle('runHealthCheck', async () => {
        return { ffprobe: true, ffmpeg: true, ollama: false };
    });
    
    // Other stub handlers
    ipcMain.handle('startAnalysis', async (event, options) => {
        console.log('[MAIN] startAnalysis:', options);
        return { started: true };
    });
    
    ipcMain.handle('clearQueue', async () => {
        console.log('[MAIN] clearQueue');
        return { cleared: true };
    });
    
    // FFmpeg analysis handler
    ipcMain.handle('analyzeFile', async (event, filePath) => {
        try {
            console.log('[MAIN] Analyzing:', filePath);
            // Pass the window to send progress events
            const { analyzeMp3 } = require('./analysis/ffcalc.js');
            const result = await analyzeMp3(filePath, win);
            console.log('[MAIN] Analysis complete:', result.jsonPath);
            
            // Upsert into Main DB and optionally update criteria
            try {
                if (!dbPaths) await resolveDbPaths();
                const dbResult = await DB.upsertTrack(dbPaths, result.analysis);
                console.log('[MAIN] DB updated:', dbResult.key, 'Total tracks:', dbResult.total);
                if (settings.autoUpdateDb) {
                    const criteriaResult = await DB.rebuildCriteria(dbPaths);
                    console.log('[MAIN] Criteria auto-updated:', criteriaResult.counts);
                }
            } catch (e) {
                console.error('[MAIN] DB upsert failed:', e);
            }
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
        resolveDbPaths();
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



