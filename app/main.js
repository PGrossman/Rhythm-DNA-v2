const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

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
        for (const filePath of paths) {
            const ext = path.extname(filePath).toLowerCase();
            if (ext === '.mp3' || ext === '.wav') {
                tracks.push({ 
                    path: filePath, 
                    fileName: path.basename(filePath), 
                    status: 'QUEUED' 
                });
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
};

app.whenReady().then(() => {
    createWindow();

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



