import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

// App single instance lock
if (!app.requestSingleInstanceLock()) {
    app.quit();
}

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
    
    // Open DevTools in development
    if (process.env.NODE_ENV === 'development') {
        win.webContents.openDevTools();
    }
};

// Basic IPC handlers (these will be expanded later)
ipcMain.handle('scanDropped', async (event, { paths }) => {
    console.log('Main: scanDropped called with:', paths);
    
    // For now, return a mock response
    // TODO: Implement actual file scanning logic
    const tracks = paths.map((filePath, index) => ({
        id: `track_${index}`,
        fileName: path.basename(filePath),
        filePath: filePath,
        techStatus: 'QUEUED',
        creativeStatus: 'QUEUED'
    }));
    
    return { tracks };
});

ipcMain.handle('startAnalysis', async (event, options) => {
    console.log('Main: startAnalysis called with:', options);
    // TODO: Implement analysis logic
    return { success: true };
});

ipcMain.handle('clearQueue', async (event) => {
    console.log('Main: clearQueue called');
    // TODO: Implement queue clearing logic
    return { success: true };
});

ipcMain.handle('getSettings', async (event) => {
    console.log('Main: getSettings called');
    // TODO: Implement settings retrieval
    return { 
        dbFolder: null,
        autoUpdateDb: true,
        creativeModel: 'qwen3:8b',
        concurrencyTech: 4,
        concurrencyCreative: 2
    };
});

ipcMain.handle('updateSettings', async (event, settings) => {
    console.log('Main: updateSettings called with:', settings);
    // TODO: Implement settings update logic
    return { success: true };
});

ipcMain.handle('updateDatabase', async (event) => {
    console.log('Main: updateDatabase called');
    // TODO: Implement database update logic
    return { success: true };
});

ipcMain.handle('updateCriteriaDb', async (event) => {
    console.log('Main: updateCriteriaDb called');
    // TODO: Implement criteria DB update logic
    return { success: true };
});

ipcMain.handle('runHealthCheck', async (event) => {
    console.log('Main: runHealthCheck called');
    // TODO: Implement health check logic
    return { 
        ffprobe: { status: 'ok', message: 'Available' },
        ffmpeg: { status: 'ok', message: 'Available' },
        ollama: { status: 'ok', message: 'Reachable' }
    };
});

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