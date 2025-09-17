const { contextBridge, ipcRenderer } = require('electron');
console.log('[PRELOAD] Loading preload script');

// Expose a minimal API surface, matching the strict IPC+DOM contract
contextBridge.exposeInMainWorld('api', {
	ping: () => 'pong',
	toFileUrl: (path) => {
		const { pathToFileURL } = require('node:url');
		return pathToFileURL(path).href;
	},
	// IPC invoke methods (Renderer → Main)
	scanDropped: (paths) => ipcRenderer.invoke('scanDropped', { paths }),
	startAnalysis: (options) => ipcRenderer.invoke('startAnalysis', options),
	clearQueue: () => ipcRenderer.invoke('clearQueue'),
	getSettings: () => ipcRenderer.invoke('getSettings'),
    getInstalledModels: () => ipcRenderer.invoke('getInstalledModels'),
	updateSettings: (partialSettings) => ipcRenderer.invoke('updateSettings', partialSettings),
	updateDatabase: () => ipcRenderer.invoke('updateDatabase'),
	updateCriteriaDb: () => ipcRenderer.invoke('updateCriteriaDb'),
	runHealthCheck: () => ipcRenderer.invoke('runHealthCheck'),
	chooseFolder: () => ipcRenderer.invoke('chooseFolder'),
	analyzeFile: (path) => ipcRenderer.invoke('analyzeFile', path),
	
	// Search methods
	searchGetDB: () => ipcRenderer.invoke('search:getDB'),
	searchShowFile: (path) => ipcRenderer.invoke('search:showFile', path),
	searchGetVersions: (path) => ipcRenderer.invoke('search:getVersions', path),
	searchReadJson: (path) => ipcRenderer.invoke('search:readJson', path),
	getWaveformPng: (absPath, options) => ipcRenderer.invoke('waveform:get-png', absPath, options),
	ensureMounted: (mountPoint, smbUrl) => ipcRenderer.invoke('system:ensure-mounted', mountPoint, smbUrl),

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


