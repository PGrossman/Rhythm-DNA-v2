const { contextBridge, ipcRenderer } = require('electron');
console.log('[PRELOAD] Loading preload script');

// Expose a minimal API surface, matching the strict IPC+DOM contract
contextBridge.exposeInMainWorld('api', {
    ping: () => 'pong',
    // IPC invoke methods (Renderer → Main)
    scanDropped: (paths) => ipcRenderer.invoke('scanDropped', { paths }),
    startAnalysis: (options) => ipcRenderer.invoke('startAnalysis', options),
    clearQueue: () => ipcRenderer.invoke('clearQueue'),
    getSettings: () => ipcRenderer.invoke('getSettings'),
    updateSettings: (partialSettings) => ipcRenderer.invoke('updateSettings', partialSettings),
    updateDatabase: () => ipcRenderer.invoke('updateDatabase'),
    updateCriteriaDb: () => ipcRenderer.invoke('updateCriteriaDb'),
    runHealthCheck: () => ipcRenderer.invoke('runHealthCheck'),
    chooseFolder: () => ipcRenderer.invoke('chooseFolder'),
    analyzeFile: (path) => ipcRenderer.invoke('analyzeFile', path),

    // Event listeners (Main → Renderer)
    onQueueUpdate: (callback) => ipcRenderer.on('queueUpdate', callback),
    onJobProgress: (callback) => ipcRenderer.on('jobProgress', callback),
    onJobDone: (callback) => ipcRenderer.on('jobDone', callback),
    onJobError: (callback) => ipcRenderer.on('jobError', callback),
    onLog: (callback) => ipcRenderer.on('log', callback),
    
    // Remove listeners
    removeListener: (channel, callback) => ipcRenderer.removeListener(channel, callback),
    removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});

console.log('[PRELOAD] API exposed');


