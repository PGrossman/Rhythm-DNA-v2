const { contextBridge, ipcRenderer } = require('electron');

// Expose IPC methods matching the PRD exactly
contextBridge.exposeInMainWorld('api', {
    // Simple ping for diagnostics
    ping: () => 'pong',
    // Renderer → Main (invoke)
    scanDropped: (params) => ipcRenderer.invoke('scanDropped', params),
    startAnalysis: (params) => ipcRenderer.invoke('startAnalysis', params),
    clearQueue: () => ipcRenderer.invoke('clearQueue'),
    getSettings: () => ipcRenderer.invoke('getSettings'),
    updateSettings: (params) => ipcRenderer.invoke('updateSettings', params),
    chooseFolder: () => ipcRenderer.invoke('chooseFolder'),
    updateDatabase: () => ipcRenderer.invoke('updateDatabase'),
    updateCriteriaDb: () => ipcRenderer.invoke('updateCriteriaDb'),
    runHealthCheck: () => ipcRenderer.invoke('runHealthCheck'),
    
    // Main → Renderer (events)
    onQueueUpdate: (callback) => ipcRenderer.on('queueUpdate', (event, data) => callback(data)),
    onJobProgress: (callback) => ipcRenderer.on('jobProgress', (event, data) => callback(data)),
    onJobDone: (callback) => ipcRenderer.on('jobDone', (event, data) => callback(data)),
    onJobError: (callback) => ipcRenderer.on('jobError', (event, data) => callback(data)),
    onLog: (callback) => ipcRenderer.on('log', (event, data) => callback(data))
});



