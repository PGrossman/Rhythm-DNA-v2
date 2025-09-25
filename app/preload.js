const { contextBridge, ipcRenderer } = require('electron');

console.log('[PRELOAD] Loading preload script');

// v1.0.0: Apple Silicon Acceleration - Setup TFJS and transformers.js for WebGPU
// Place this near the top, before exposing APIs that might lazy-load models.
(async () => {
  try {
    // TFJS: prefer WebGPU, fallback handled later in renderer
    const tf = await import('@tensorflow/tfjs');
    await import('@tensorflow/tfjs-backend-webgpu'); // available in renderer
    // Don't set backend here; do it in renderer after feature-detect to avoid errors in headless tests.
  } catch (e) {
    // If import fails, renderer will fallback to webgl/wasm.
    // console.warn('[ACCEL] TFJS WebGPU import failed:', e?.message || e);
  }

  try {
    // transformers.js (Xenova): set env flags early
    const { env } = await import('@xenova/transformers');
    // Prefer WebGPU, fallback to wasm automatically
    env.WEBGPU = true;           // request WebGPU
    env.BACKEND = 'webgpu';      // explicit hint
    // WASM tuning fallbacks (threads) still apply if WebGPU isn't available
    env.NUM_THREADS = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) ? navigator.hardwareConcurrency : 4;
  } catch (e) {
    // console.warn('[ACCEL] transformers.js env setup failed:', e?.message || e);
  }
})();

contextBridge.exposeInMainWorld('api', {
    // File operations (needed by dragdrop.js)
    scanDropped: (paths) => ipcRenderer.invoke('scanDropped', { paths }),
    analyzeFile: (filePath) => ipcRenderer.invoke('analyzeFile', filePath),
    analyzeFiles: async (paths) => {
        try {
            return await ipcRenderer.invoke('analyzeFiles', paths);
        } catch (e) {
            console.error('[PRELOAD] analyzeFiles failed:', e);
            return { success: false, error: String(e?.message || e) };
        }
    },
    
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
    },
    
    // v4.0.0: Instrumentation orchestration - pass only payload
    onStartInstrumentation: (callback) => {
        ipcRenderer.on('analysis:instrumentation:start', (_e, payload) => callback(payload));
    },
    
    // v4.0.0: Instrumentation events - pass only payload
    instrumentation: {
        onStart: (callback) => {
            ipcRenderer.on('analysis:instrumentation:start', (_e, payload) => callback(payload));
        },
        onProgress: (callback) => {
            ipcRenderer.on('instrumentation:progress', (_e, payload) => callback(payload));
        }
    },
    
    // v1.0.0: New instrumentation event listeners
    onInstrumentationStatus: (fn) => ipcRenderer.on('instrumentation:status', (_e, payload) => fn(payload)),
    onInstrumentationProgress: (fn) => ipcRenderer.on('instrumentation:progress', (_e, payload) => fn(payload))
});

// Expose a tiny, typed event bus for queue lifecycle
contextBridge.exposeInMainWorld('rnaQueue', {
  onEvent(handler) {
    const listener = (_evt, payload) => handler(payload);
    ipcRenderer.on('queue:event', listener);
    return () => ipcRenderer.removeListener('queue:event', listener);
  },
  onPressure(handler) {
    const listener = (_evt, payload) => handler(payload);
    ipcRenderer.on('queue:pressure', listener);
    return () => ipcRenderer.removeListener('queue:pressure', listener);
  }
});

console.log('[PRELOAD] API exposed');


