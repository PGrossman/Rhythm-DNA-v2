const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const fsPromises = require('node:fs/promises');
const { analyzeMp3 } = require('./analysis/ffcalc.js');

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
                                path: file,
                                fileName: path.basename(file),
                                status: 'QUEUED'
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
                                path: filePath,
                                fileName: path.basename(filePath),
                                status: 'QUEUED'
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



