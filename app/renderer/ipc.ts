import { ipcRenderer } from 'electron';

// Minimal state hook-up example; adapt to your store/framework
const publish = (type: string, data: any) => {
  // e.g., window.store.dispatch({ type, payload: data })
  // or an event bus your UI already uses
  window.dispatchEvent(new CustomEvent(type, { detail: data }));
};

// Existing channel the main process uses
ipcRenderer.on('jobProgress', (_e, msg) => {
  // msg = { trackId, stage: 'technical'|'creative'|'instrumentation', status, note }
  publish('ui:jobProgress', msg);
});

// Alias channels added in ffcalc.js to make UI hookup obvious
ipcRenderer.on('creative:kickoff', (_e, msg) => publish('ui:jobProgress', msg));
ipcRenderer.on('creative:done', (_e, msg) => publish('ui:jobProgress', msg));
ipcRenderer.on('queue:progress', (_e, msg) => publish('ui:jobProgress', msg));

