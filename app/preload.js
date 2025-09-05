import { contextBridge } from 'electron';

// Expose a minimal API surface, matching the strict IPC+DOM contract
contextBridge.exposeInMainWorld('api', {
    ping: () => 'pong'
});


