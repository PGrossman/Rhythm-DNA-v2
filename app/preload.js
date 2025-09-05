// Preload script - exposes IPC API to renderer via contextBridge
import { contextBridge, ipcRenderer } from 'electron';

// Expose IPC API to renderer
contextBridge.exposeInMainWorld('electronAPI', {
    // File/folder scanning
    scanDropped: (paths) => ipcRenderer.invoke('scanDropped', { paths }),
    
    // Analysis control
    startAnalysis: (options) => ipcRenderer.invoke('startAnalysis', options),
    clearQueue: () => ipcRenderer.invoke('clearQueue'),
    
    // Settings
    getSettings: () => ipcRenderer.invoke('getSettings'),
    updateSettings: (settings) => ipcRenderer.invoke('updateSettings', settings),
    
    // Database operations
    updateDatabase: () => ipcRenderer.invoke('updateDatabase'),
    updateCriteriaDb: () => ipcRenderer.invoke('updateCriteriaDb'),
    
    // Health check
    runHealthCheck: () => ipcRenderer.invoke('runHealthCheck'),
    
    // Event listeners for updates from main process
    onQueueUpdate: (callback) => ipcRenderer.on('queueUpdate', callback),
    onJobProgress: (callback) => ipcRenderer.on('jobProgress', callback),
    onJobDone: (callback) => ipcRenderer.on('jobDone', callback),
    onJobError: (callback) => ipcRenderer.on('jobError', callback),
    onLog: (callback) => ipcRenderer.on('log', callback),
    
    // Remove listeners
    removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});