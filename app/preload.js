const { contextBridge, ipcRenderer } = require('electron');

console.log('[PRELOAD] Loading preload script');

contextBridge.exposeInMainWorld('api', {
    // File operations (needed by dragdrop.js)
    scanDropped: (paths) => ipcRenderer.invoke('scanDropped', { paths }),
    
    // Settings (these are fine to keep)
    getSettings: () => ipcRenderer.invoke('getSettings'),
    updateSettings: (settings) => ipcRenderer.invoke('updateSettings', settings),
    chooseFolder: () => ipcRenderer.invoke('chooseFolder'),
    updateDatabase: () => ipcRenderer.invoke('updateDatabase'),
    updateCriteriaDb: () => ipcRenderer.invoke('updateCriteriaDb'),
    runHealthCheck: () => ipcRenderer.invoke('runHealthCheck'),
    
    // Search methods (needed by search functionality)
    searchGetDB: () => ipcRenderer.invoke('search:getDB'),
    searchShowFile: (path) => ipcRenderer.invoke('search:showFile', path),
    searchGetVersions: (path) => ipcRenderer.invoke('search:getVersions', path),
    searchReadJson: (path) => ipcRenderer.invoke('search:readJson', path),
    getWaveformPng: (absPath, options) => ipcRenderer.invoke('waveform:get-png', absPath, options),
    ensureMounted: (mountPoint, smbUrl) => ipcRenderer.invoke('system:ensure-mounted', mountPoint, smbUrl),
    
    // Event listeners for the REAL analysis system
    onQueueUpdate: (callback) => {
        ipcRenderer.on('queueUpdate', callback);
    },
    onJobProgress: (callback) => {
        ipcRenderer.on('jobProgress', callback);
    },
    onJobDone: (callback) => {
        ipcRenderer.on('jobDone', callback);
    },
    onJobError: (callback) => {
        ipcRenderer.on('jobError', callback);
    },
    onLog: (callback) => {
        ipcRenderer.on('log', callback);
    }
});

console.log('[PRELOAD] API exposed');


