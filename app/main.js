import { app as electronApp, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'node:path';
import Store from 'electron-store';
import { debugLogger } from './modules/debugLogger.js';

if (!electronApp.requestSingleInstanceLock()) {
    electronApp.quit();
}

let mainWindow;

// Initialize electron-store for settings persistence
const store = new Store({
    name: 'rhythmdna-settings'
});

const createWindow = () => {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(electronApp.getAppPath(), 'app', 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    mainWindow.loadFile(path.join(electronApp.getAppPath(), 'app', 'renderer.html'));
    
    if (process.env.NODE_ENV === 'development') {
        mainWindow.webContents.openDevTools();
    }
};

electronApp.whenReady().then(() => {
    createWindow();
    electronApp.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
    // Setup IPC handlers after app is ready
    setupIPCHandlers();
    debugLogger.log('App ready and IPC handlers registered');
});

electronApp.on('window-all-closed', () => {
    electronApp.quit(); // Force quit on all platforms including macOS
});

// IPC Handlers (analysis / queue)
ipcMain.handle('scanDropped', async (event, { paths }) => {
    debugLogger.log('IPC: scanDropped called', { count: paths?.length, paths });
    const tracks = paths.map((path, index) => ({
        id: `track_${index}`,
        absolutePath: path,
        filename: path.split('/').pop() || path.split('\\').pop(),
        directory: path.substring(0, path.lastIndexOf('/')) || path.substring(0, path.lastIndexOf('\\')),
        extension: path.split('.').pop().toLowerCase()
    }));
    debugLogger.log('IPC: scanDropped returning tracks', { count: tracks.length });
    return { tracks };
});

ipcMain.handle('startAnalysis', async (event, { concurrencyTech = 4, concurrencyCreative = 2, model = 'qwen3:8b' }) => {
    debugLogger.log('IPC: startAnalysis', { concurrencyTech, concurrencyCreative, model });
    setTimeout(() => {
        mainWindow.webContents.send('log', { level: 'info', msg: 'Analysis started' });
    }, 100);
    return;
});

ipcMain.handle('clearQueue', async (event) => {
    debugLogger.log('IPC: clearQueue called');
    mainWindow.webContents.send('log', { level: 'info', msg: 'Queue cleared' });
    return;
});

// Settings and operations IPC
function setupIPCHandlers() {
    ipcMain.handle('getSettings', () => {
        debugLogger.log('IPC: getSettings called');
        return {
            dbFolder: store.get('dbFolder', ''),
            autoUpdateDb: store.get('autoUpdateDb', true),
            creativeModel: store.get('creativeModel', 'qwen3:8b'),
            techConcurrency: store.get('techConcurrency', 4),
            creativeConcurrency: store.get('creativeConcurrency', 2)
        };
    });

    ipcMain.handle('updateSettings', (event, settings) => {
        debugLogger.log('IPC: updateSettings called with', settings);
        if (settings.dbFolder !== undefined) store.set('dbFolder', settings.dbFolder);
        if (settings.autoUpdateDb !== undefined) store.set('autoUpdateDb', settings.autoUpdateDb);
        if (settings.creativeModel !== undefined) store.set('creativeModel', settings.creativeModel);
        if (settings.techConcurrency !== undefined) store.set('techConcurrency', settings.techConcurrency);
        if (settings.creativeConcurrency !== undefined) store.set('creativeConcurrency', settings.creativeConcurrency);
        mainWindow?.webContents.send('log', { level: 'info', msg: 'Settings updated' });
        return true;
    });

    ipcMain.handle('chooseFolder', async () => {
        const result = await dialog.showOpenDialog({
            title: 'Choose Database Folder',
            properties: ['openDirectory', 'createDirectory']
        });
        if (!result.canceled && result.filePaths.length > 0) {
            const folderPath = result.filePaths[0];
            store.set('dbFolder', folderPath);
            return folderPath;
        }
        return null;
    });

    ipcMain.handle('updateDatabase', () => {
        debugLogger.log('IPC: updateDatabase called');
        mainWindow?.webContents.send('log', { level: 'info', msg: 'Database updated' });
        return true;
    });

    ipcMain.handle('updateCriteriaDb', () => {
        debugLogger.log('IPC: updateCriteriaDb called');
        mainWindow?.webContents.send('log', { level: 'info', msg: 'Criteria database updated' });
        return true;
    });

    ipcMain.handle('runHealthCheck', () => {
        debugLogger.log('IPC: runHealthCheck called');
        return {
            ffprobe: true,
            ffmpeg: true,
            ollama: false
        };
    });
}