import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import Store from 'electron-store';
import os from 'node:os';

// Initialize settings store
const store = new Store({
    defaults: {
        dbFolder: null,
        autoUpdateDb: true,
        creativeModel: 'qwen3:8b',
        concurrencyTech: 4,
        concurrencyCreative: 2
    }
});

// App single instance lock
if (!app.requestSingleInstanceLock()) {
    app.quit();
}

let mainWindow;

const createWindow = () => {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(app.getAppPath(), 'app', 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    mainWindow.loadFile(path.join(app.getAppPath(), 'app', 'renderer.html'));
};

// IPC Handlers
ipcMain.handle('getSettings', () => {
    return store.store;
});

ipcMain.handle('updateSettings', (event, partial) => {
    Object.keys(partial).forEach(key => {
        store.set(key, partial[key]);
    });
    return store.store;
});

ipcMain.handle('scanDropped', async (event, { paths }) => {
    console.log('Scanning dropped paths:', paths);
    
    const tracks = paths.map((filepath, index) => ({
        id: `track_${index}`,
        filepath: filepath,
        filename: path.basename(filepath),
        techStatus: 'QUEUED',
        creativeStatus: 'QUEUED'
    }));
    
    return { tracks };
});

ipcMain.handle('startAnalysis', async (event, options = {}) => {
    console.log('Starting analysis with options:', options);
    return { success: true };
});

ipcMain.handle('clearQueue', async () => {
    console.log('Clearing queue');
    return { success: true };
});

ipcMain.handle('updateDatabase', async () => {
    console.log('Updating database');
    return { success: true };
});

ipcMain.handle('updateCriteriaDb', async () => {
    console.log('Updating criteria database');
    return { success: true };
});

ipcMain.handle('runHealthCheck', async () => {
    const results = {
        ffprobe: true,
        ffmpeg: true,
        ollama: false
    };
    
    console.log('Health check results:', results);
    return results;
});

// Database folder check
const checkDbFolder = async () => {
    const dbFolder = store.get('dbFolder');
    
    if (!dbFolder) {
        const result = await dialog.showOpenDialog(mainWindow, {
            title: 'Select Database Folder',
            message: 'Choose a folder to store RhythmDNA database files',
            properties: ['openDirectory', 'createDirectory'],
            defaultPath: path.join(os.homedir(), 'Documents', 'RhythmDNA')
        });
        
        if (!result.canceled && result.filePaths.length > 0) {
            const selectedPath = result.filePaths[0];
            store.set('dbFolder', selectedPath);
            
            if (!fs.existsSync(selectedPath)) {
                fs.mkdirSync(selectedPath, { recursive: true });
            }
            
            console.log('Database folder set to:', selectedPath);
        } else {
            app.quit();
        }
    }
};

app.whenReady().then(async () => {
    createWindow();
    
    setTimeout(checkDbFolder, 1000);

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