const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');

// v1.2.0: Safe window accessor
function getMainWindow() {
  const wins = BrowserWindow.getAllWindows();
  return wins && wins.length ? wins[0] : null;
}

// v1.0.0: Apple Silicon Acceleration - Enable WebGPU for TFJS/transformers.js
// Prefer WebGPU in renderer for TFJS / transformers.js
app.commandLine.appendSwitch('enable-unsafe-webgpu'); // required on some Electron builds
// Keep ANGLE default on macOS (Metal). No Vulkan on macOS.
// (No harm on other platforms; ignored if unsupported.)

const path = require('node:path');
const fs = require('node:fs');
const fsPromises = require('node:fs/promises');
const { analyzeMp3 } = require('./analysis/ffcalc.js');
const DB = require('./db/jsondb.js');
const { writeSummary, findExistingJson, targetPath, ensurePerTrackJson, writeArtifacts } = require('./utils/trackJsonWriter');
const { ensureDbScaffold } = require('./utils/dbScaffold');
const { writeWaveformPng, ensureWaveformPng } = require('./analysis/waveform-png');
const normalizeCreative = require('./utils/creativeNormalize');
const { fileSafe } = require('./utils/fileSafeName');
const { mergeFromTrackJson } = require('./db/mergeFromTrackJson');
const { shouldGenerateWaveformFor } = require('./utils/audioSiblings');


// v1.0.0: Deferred async loader for p-queue ESM import
let PQueue;
async function loadPQueue() {
  if (!PQueue) {
    const mod = await import('p-queue');
    PQueue = mod.default;
    console.log('[MAIN] p-queue loaded (ESM). Concurrency → TECH: %d CREATIVE: %d INSTR: %d', settings.techConcurrency || 4, settings.creativeConcurrency || 4, settings.instrConcurrency || 4);
  }
  return PQueue;
}

// v1.1.0: Stage module (CommonJS). We intentionally require here; the functions will be selected dynamically.
const stages = require(path.join(__dirname, 'analysis', 'ffcalc.js'));

// v1.0.0: Queue initialization and management
async function initQueues() {
  const PQ = await loadPQueue();
  const techConcurrency = settings.techConcurrency ?? 4;
  const creativeConcurrency = settings.creativeConcurrency ?? 4;
  const instrConcurrency = settings.instrConcurrency ?? 4;
  global.QUEUES = {
    tech: new PQ({ concurrency: techConcurrency }),
    creative: new PQ({ concurrency: creativeConcurrency }),
    instr: new PQ({ concurrency: instrConcurrency }),
  };
  const q = global.QUEUES;
  console.log('[MAIN] Queues ready {TECH size=%d pending=%d} {CREATIVE size=%d pending=%d} {INSTR size=%d pending=%d}', q.tech.size, q.tech.pending, q.creative.size, q.creative.pending, q.instr.size, q.instr.pending);
  
  // Also reflect pressure when queue activates/settles
  q.creative.on('active', () => emitCreativePressure(q.creative));
  q.creative.on('idle', () => emitCreativePressure(q.creative));
}

// v1.0.0: Queue snapshot helper
function snapshotQueues(prefix) {
  const q = global.QUEUES;
  console.log('[QUEUE] %s {TECH size=%d pending=%d} {CREATIVE size=%d pending=%d} {INSTR size=%d pending=%d}', prefix, q.tech.size, q.tech.pending, q.creative.size, q.creative.pending, q.instr.size, q.instr.pending);
}

// --- helper to broadcast to all windows safely ---
function _sendToAll(channel, payload) {
  try {
    BrowserWindow.getAllWindows().forEach(w => {
      if (!w?.webContents?.isDestroyed?.()) {
        w.webContents.send(channel, payload);
      }
    });
  } catch (e) {
    console.warn('[MAIN:UI-BUS] broadcast failed', e);
  }
}

// --- small wrapper to instrument task functions and emit lifecycle to UI ---
function wrapCreativeTask(taskFn, fileId, niceName) {
  return async () => {
    const startedAt = Date.now();
    _sendToAll('queue:event', {
      stage: 'CREATIVE',
      type: 'start',
      fileId,
      name: niceName,
      ts: startedAt
    });
    try {
      const res = await taskFn();
      const finishedAt = Date.now();
      _sendToAll('queue:event', {
        stage: 'CREATIVE',
        type: 'done',
        ok: true,
        fileId,
        name: niceName,
        ms: finishedAt - startedAt,
        ts: finishedAt
      });
      return res;
    } catch (err) {
      const finishedAt = Date.now();
      _sendToAll('queue:event', {
        stage: 'CREATIVE',
        type: 'done',
        ok: false,
        fileId,
        name: niceName,
        error: String(err?.message || err),
        ms: finishedAt - startedAt,
        ts: finishedAt
      });
      throw err;
    }
  };
}

// OPTIONAL: also surface queue pressure so UI can show "x pending / y running"
function emitCreativePressure(q) {
  _sendToAll('queue:pressure', {
    stage: 'CREATIVE',
    pending: q.pending,
    size: q.size
  });
}

// wherever you enqueue creative work today, replace with the wrapped form so the UI gets events:
// NOTE: keep your existing variables in place; we're adding identifiers so the UI can key rows.
function enqueueCreative(filePath, taskFn) {
  const fileId = filePath;            // stable key for UI; change if you have an internal id
  const niceName = path.basename(filePath);
  const wrapped = wrapCreativeTask(taskFn, fileId, niceName);
  const promise = global.QUEUES.creative.add(wrapped);
  emitCreativePressure(global.QUEUES.creative);
  return promise;
}

// v1.1.0: Resolve available stage functions once. This avoids hard-coding names and "guessing".
function resolveStageFns(mod) {
  // Candidate names by convention. We check in order.
  const pick = (candidates) => candidates.find(n => typeof mod[n] === 'function') || null;

  const technicalFnName = pick(['technical', 'runTechnical', 'doTechnical', 'analyzeTechnical', 'technicalAnalysis', 'analyzeMp3']); // last fallback runs full pipeline if that's how it's exposed
  const creativeFnName   = pick(['creative', 'runCreative', 'doCreative', 'analyzeCreative', 'creativeAnalysis']);
  const instrFnName      = pick(['instrumentation', 'runInstrumentation', 'doInstrumentation', 'analyzeInstrumentation', 'instrumentationAnalysis']);

  return {
    technicalFnName,
    creativeFnName,
    instrFnName
  };
}

// v2.0.0: Prefer explicit functions and do not fall back to analyzeMp3 for Technical
const STAGE = {
  technicalFnName: (typeof stages.technicalOnly === 'function') ? 'technicalOnly' : null,
  creativeFnName: (typeof stages.runCreativeAnalysis === 'function') ? 'runCreativeAnalysis' : null,
  instrFnName: (typeof stages.runInstrumentationAnalysis === 'function') ? 'runInstrumentationAnalysis' : null
};

// v1.0.0: Per-file enqueue function with proper parallelization
function enqueueTrack(filePath, displayNameOrOpts) {
  // Handle both old signature (filePath, displayName) and new signature (filePath, opts)
  const displayName = typeof displayNameOrOpts === 'string' ? displayNameOrOpts : undefined;
  const opts = typeof displayNameOrOpts === 'object' ? displayNameOrOpts : {};
  const force = opts.force || false;
  const q = global.QUEUES;
  console.log('[QUEUE] enqueueTrack %s id= %s', displayName || path.basename(filePath), filePath);
  snapshotQueues('BEFORE-ENQUEUE');
  
  // Initialize track state for JSON summary generation
  trackState.set(filePath, { timings: { queuedAt: Date.now() } });
  
  // Add Instrumentation queue job at enqueue time (parallel with Technical)
  q.instr.add(async () => {
    console.log('[INSTR] START %s {INSTR size=%d pending=%d}', path.basename(filePath), q.instr.size, q.instr.pending + 1);
    try { 
      await runInstrumentationStage(filePath, /*techResult=*/null); 
    } catch (err) { 
      console.log('[INSTR] ERROR %s %s', path.basename(filePath), err?.stack || err); 
    }
    console.log('[INSTR] DONE %s {INSTR size=%d pending=%d}', path.basename(filePath), q.instr.size, q.instr.pending);
  });
  
  q.tech.add(async () => {
    console.log('[TECH] START %s id= %s {TECH size=%d pending=%d}', displayName || path.basename(filePath), filePath, q.tech.size, q.tech.pending + 1);
    const techResult = await runTechnicalStage(filePath);
    console.log('[TECH] DONE %s bpm= %s {TECH size=%d pending=%d}', displayName || path.basename(filePath), techResult?.bpm ?? '-', q.tech.size, q.tech.pending);
    
    // As soon as TECH finishes for THIS file, spawn CREATIVE (it needs BPM):
    enqueueCreative(filePath, () => runCreativeStage(filePath, techResult))
      .catch(err => console.log('[QUEUE] CREATIVE-ADD-ERROR %s %s', displayName || path.basename(filePath), err?.stack || err));
    
  }).catch(err => {
    console.log('[TECH] ERROR %s id= %s %s', displayName || path.basename(filePath), filePath, err?.stack || err);
  }).finally(() => {
    snapshotQueues('AFTER-TECH-TASK');
  });
  
  snapshotQueues('AFTER-ENQUEUE');
}

// v1.1.0: Utility to call a stage by name with robust logging
async function callStage(stageLabel, fnName, args) {
  if (!fnName || typeof stages[fnName] !== 'function') {
    throw new Error(`${stageLabel} function not found (looked for: ${fnName || 'none'})`);
  }
  return await stages[fnName](...args);
}

// v1.0.0: Stage functions for per-file parallelization
async function runTechnicalStage(filePath) {
  const win = getMainWindow();
  if (!STAGE.technicalFnName) throw new Error('technicalOnly not exported from ffcalc.js');
  
  const st = ensureTrackState(filePath, filePath);
  
  // Track technical start
  const state = trackState.get(filePath) || {};
  state.timings = state.timings || {};
  state.timings.techStart = Date.now();
  trackState.set(filePath, state);
  
  try {
    const result = await stages[STAGE.technicalFnName](filePath, win);
    
    // Track technical success
    const updatedState = trackState.get(filePath) || {};
    updatedState.timings.techEnd = Date.now();
    updatedState.technical = { 
      bpm: result?.bpm, 
      audioHints: result?.audioHints, 
      key: result?.key, 
      energy: result?.energy, 
      sections: result?.sections 
    };
    trackState.set(filePath, updatedState);
    
    st.techDone = true;
    
    // Generate waveform once per track (policy: prefer MP3, skip WAV twin)
    if (!st.pngDone) {
      const wf = await writeWaveformPng({ 
        audioPath: filePath, 
        dbFolder: settings.dbFolder, 
        width: 8000, 
        height: 180 
      });
      if (wf?.ok) {
        st.pngDone = true;
        if (wf.skipped) console.log(`[WAVEFORM] Skipping PNG for policy: ${wf.reason}`);
        else console.log(`[WAVEFORM] Generated: ${wf.path}`);
      }
    }
    
    // Mark tech stage complete (no finalize yet)
    const st2 = _markStage(filePath, 'tech');
    
    await finalizeIfReady(st);
    
    return result;
  } catch (error) {
    // Track technical error
    const errorState = trackState.get(filePath) || {};
    errorState.timings.techEnd = Date.now();
    trackState.set(filePath, errorState);
    throw error;
  }
}

async function runCreativeStage(filePath, techResult) {
  const win = getMainWindow();
  const model = (settings && settings.ollamaModel) || 'qwen3:8b';
  const dbFolder = settings && settings.dbFolder ? settings.dbFolder : null;
  const baseName = path.basename(filePath, path.extname(filePath));
  
  if (!STAGE.creativeFnName) {
    console.log('[CREATIVE] SKIP (no function found)');
    return;
  }
  
  // Track creative start
  const state = trackState.get(filePath) || {};
  state.timings = state.timings || {};
  state.timings.creativeStart = Date.now();
  trackState.set(filePath, state);
  
  try {
    const result = await stages[STAGE.creativeFnName](baseName, techResult?.bpm, model, techResult?.audioHints || null, dbFolder || null);
    
    // Track creative success
    const updatedState = trackState.get(filePath) || {};
    updatedState.timings.creativeEnd = Date.now();
    
    // Normalize creative result to flat arrays
    const creativeFlat = normalizeCreative(result);
    updatedState.creative = creativeFlat;
    
    updatedState.versions = {
      app: 'rhythmdna-v3',
      ensemble: 'ensemble',
      models: model
    };
    trackState.set(filePath, updatedState);
    
    const st = ensureTrackState(filePath, filePath);
    st.creativeDone = true;
    
    // Mark creative stage complete (no finalize yet)
    const st2 = _markStage(filePath, 'creative');
    
    await finalizeIfReady(st);
    
    // (state retained until finalization)
    
    return result;
  } catch (error) {
    // Track creative error
    const errorState = trackState.get(filePath) || {};
    errorState.timings.creativeEnd = Date.now();
    trackState.set(filePath, errorState);
    
    const st = ensureTrackState(filePath, filePath);
    st.creativeDone = true;
    
    await finalizeIfReady(st);
    
    // (state retained until finalization)
    
    throw error;
  }
}

async function runInstrumentationStage(filePath, techResult) {
  const win = getMainWindow();
  
  if (!STAGE.instrFnName) {
    console.log('[INSTR] SKIP (no function found)');
    return;
  }
  
  const st = ensureTrackState(filePath, filePath);
  st.ts.instrStart = Date.now();
  
  // Track instrumentation start
  const state = trackState.get(filePath) || {};
  state.timings = state.timings || {};
  state.timings.instrStart = Date.now();
  trackState.set(filePath, state);
  
  try {
    const result = await stages[STAGE.instrFnName](filePath, win, techResult?.audioHints || {});
    
    // Track instrumentation success
    const updatedState = trackState.get(filePath) || {};
    updatedState.timings = updatedState.timings || {};
    updatedState.timings.instrEnd = Date.now();
    updatedState.instrumentation = { 
      instruments: result?.instruments, 
      decision_trace: result?.decision_trace, 
      version: result?.version || 'ensemble'
    };
    trackState.set(filePath, updatedState);
    
    st.ts.instrEnd = Date.now();
    st.instrDone = true;
    
    // Mark instr stage complete and finalize
    const st2 = _markStage(filePath, 'instr');
    // Gather context for finalization
    const ctx = {
      source: {
        dir: path.dirname(filePath),
        fileName: path.basename(filePath),
        filePath: filePath
      },
      technical: trackState.get(filePath)?.technical || null,
      instrumentation: trackState.get(filePath)?.instrumentation || null,
      creative: trackState.get(filePath)?.creative || null,
      timings: trackState.get(filePath)?.timings || null,
      versions: trackState.get(filePath)?.versions || null
    };
    await _finalizeIfReady(filePath, ctx);
    
    await finalizeIfReady(st);
    
    return result;
  } catch (error) {
    // Track instrumentation error
    const errorState = trackState.get(filePath) || {};
    errorState.timings = errorState.timings || {};
    errorState.timings.instrEnd = Date.now();
    trackState.set(filePath, errorState);
    
    st.ts.instrEnd = Date.now();
    st.instrDone = true;
    await finalizeIfReady(st);
    
    throw error;
  }
}

// v1.8.3: True per-file pipelining with PQueue-based concurrency

// v1.0.0: Feature flags
const RNA_DISABLE_CSV = true; // keep CSV code, skip writes

// App single instance lock
if (!app.requestSingleInstanceLock()) {
    app.quit();
}

// Settings storage
let settings = {
    dbFolder: '',
    autoUpdateDb: false,
    ollamaModel: 'qwen3:8b',
    techConcurrency: 4,
    creativeConcurrency: 2,
    writePerTrackJsonToSourceDir: true,
    writeCsvArtifacts: false,
    writeWaveformPng: true,
    smbShares: {
        // Add your SMB share mappings here
        // Example: "MediaShare": "smb://nas.local/MediaShare"
    }
};

// Per-track state tracking for JSON summary generation
const trackState = new Map(); // key = filePath, value = {technical, instrumentation, creative, timings, versions}

// v1.2.0: Per-track lifecycle map to hold partial stage outputs until all required stages finish
const lifecycle = new Map(); // key=filePath -> { tech, instr, creative, timings, versions }

// v1.2.0: Track state map for finalization control
const trackStateMap = new Map();
function ensureTrackState(trackId, audioPath) {
  if (!trackStateMap.has(trackId)) {
    trackStateMap.set(trackId, {
      id: trackId,
      audioPath,
      techDone: false,
      creativeDone: false,
      instrDone: false,
      pngDone: false,
      finalized: false,
      jsonWritten: false,   // NEW: prevents double JSON writes
      ts: {}
    });
  }
  return trackStateMap.get(trackId);
}

// Minimal stage tracker for finalization control
const _stages = new Map(); // trackId -> { tech:false, creative:false, instr:false, json:false }

function _markStage(trackId, k, v = true) {
  const s = _stages.get(trackId) || { tech: false, creative: false, instr: false, json: false };
  s[k] = v;
  _stages.set(trackId, s);
  return s;
}

async function _finalizeIfReady(trackId, ctx) {
  const s = _stages.get(trackId);
  if (!s || s.json || !s.tech || !s.creative || !s.instr) return; // gate until INSTR done
  try {
    // Waveform: ensure exactly one PNG, standard name/location
    let wfPath = null;
    try {
      if (settings.writeWaveformPng && shouldGenerateWaveformFor(ctx.source.filePath)) {
        const wf = await ensureWaveformPng(ctx.source.filePath, { dbFolder: settings.dbFolder });
        wfPath = wf && wf.pngPath ? wf.pngPath : null;
        if (wfPath) {
          console.log('[WAVEFORM] ready:', wfPath);
          const st = trackState.get(ctx.source.filePath) || {};
          st.waveformPng = wfPath;
          st.waveform_png = wfPath; // backward compatibility
          trackState.set(ctx.source.filePath, st);
        }
      }
    } catch (e) {
      console.warn('[WAVEFORM] skipped due to error:', e && e.message ? e.message : e);
    }

    // Title fallback for UI if missing later
    try {
      const st = trackState.get(ctx.source.filePath) || {};
      if (st.source && !st.source.title && st.source.filePath) {
        const path = require('path');
        const base = path.basename(st.source.filePath).replace(/\.[^.]+$/, '');
        st.source.title = base;
        trackState.set(ctx.source.filePath, st);
      }
    } catch {}

    // Write per-track JSON once (to source dir, simple "<Song>.json")
    if (typeof ensurePerTrackJson === 'function') {
      const trackData = trackState.get(ctx.source.filePath) || {};
      await ensurePerTrackJson({ ...ctx, trackData });
    }
    
    // Merge that JSON into DBs (use existing DB API; CommonJS function name must exist)
    console.log('[DB] Finalize: merging track into DB at', settings.dbFolder);
    if (typeof DB?.mergeFromTrackJson === 'function') {
      await DB.mergeFromTrackJson({ audioPath: ctx.source.filePath, dbFolder: settings.dbFolder, settings });
    }
    
    // Write CSV + waveform artifacts if enabled
    if (typeof writeArtifacts === 'function') {
      const trackData = trackState.get(ctx.source.filePath) || {};
      await writeArtifacts({ ...ctx, trackData }, settings);
    }
    
    // Criteria rebuild (always pass dbFolder)
    console.log('[DB] Rebuilding Criteria at', settings.dbFolder);
    if (typeof DB?.rebuildCriteria === 'function') {
      await DB.rebuildCriteria(settings.dbFolder);
    }
    s.json = true;
    _stages.set(trackId, s);
    console.log('[DB] finalize ok', trackId);
  } catch (e) {
    console.log('[DB] finalize failed', e);
  }
}

// DB paths helper
let dbPaths = null;
async function resolveDbPaths() {
    dbPaths = await DB.getPaths({ 
        dbFolder: settings.dbFolder, 
        userData: app.getPath('userData') 
    });
}

// v1.2.0: Lifecycle management helpers
function getLife(filePath) {
  if (!lifecycle.has(filePath)) {
    lifecycle.set(filePath, {
      tech: null,
      instr: null,
      creative: null,
      timings: {},
      versions: null
    });
  }
  return lifecycle.get(filePath);
}

async function finalizeIfReady(st) {
  if (st.finalized || st.jsonWritten) return;
  if (!(st.techDone && st.creativeDone && st.instrDone)) return;
  
  try {
    if (settings.writePerTrackJsonToSourceDir) {
      const r = await writePerTrackJson({ audioPath: st.audioPath, settings });
      if (r?.ok) { 
        console.log('[ARTIFACT] Per-track JSON ensured:', r.path); 
        st.jsonWritten = true; 
      } else { 
        console.log('[ARTIFACT] JSON write skipped/failed:', r?.error || 'unknown'); 
      }
    }
    
    // Merge per-track JSON → DBs
    if (typeof mergeFromTrackJson === 'function') {
      await mergeFromTrackJson({ audioPath: st.audioPath, dbFolder: settings.dbFolder, settings });
    } else if (typeof DB.mergeFromTrackJson === 'function') {
      await DB.mergeFromTrackJson({ audioPath: st.audioPath, dbFolder: settings.dbFolder, settings });
    } else {
      throw new Error('mergeFromTrackJson not available');
    }
    console.log('[DB] upsert ok', require('path').basename(st.audioPath));
    // Pass the dbFolder as required by rebuildCriteria; calling without it throws and blocks criteria/tempo bands.
    await DB.rebuildCriteria(settings.dbFolder);
    st.finalized = true;
  } catch (e) {
    console.log('[DB] finalize failed', e);
  }
}

// Write per-track JSON with proper filename format
async function writePerTrackJson({ audioPath, settings }) {
  try {
    const trackData = trackState.get(audioPath);
    if (!trackData) {
      return { ok: false, error: 'No track data found' };
    }

    // Build the summary object
    const summary = {
      source: {
        filePath: audioPath,
        fileName: path.basename(audioPath),
        dir: path.dirname(audioPath)
      },
      technical: trackData.technical || null,
      instrumentation: trackData.instrumentation || null,
      creative: trackData.creative || null,
      timings: trackData.timings || null,
      versions: trackData.versions || null,
      generatedAt: new Date().toISOString()
    };

    // Write to <Song Name>.json (no .rhythmdna)
    const dir = path.dirname(audioPath);
    const base = path.parse(audioPath).name;
    const jsonPath = path.join(dir, base + '.json');
    
    fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 2), 'utf8');
    
    return { ok: true, path: jsonPath };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

// Build a DB record from the per-track state
function buildDbRecord(filePath) {
    const s = trackState.get(filePath) || {};
    return {
        path: filePath,
        file: path.basename(filePath),
        analyzed_at: new Date().toISOString(),
        estimated_tempo_bpm: s.technical?.bpm,
        key: s.technical?.key,
        // prefer canonical instruments if present
        analysis: {
            instruments: Array.isArray(s.instrumentation?.instruments) ? s.instrumentation.instruments : [],
            final_instruments: Array.isArray(s.instrumentation?.instruments) ? s.instrumentation.instruments : undefined,
        },
        creative: s.creative || null,
        waveform_png: s.waveformPath || undefined
    };
}

// Upsert track to DB (auto-creates files)
async function upsertDb(filePath) {
    if (!dbPaths) await resolveDbPaths();
    const rec = buildDbRecord(filePath);
    try {
        const res = await DB.upsertTrack(dbPaths, rec);
        console.log('[DB] upsert ok', path.basename(filePath), 'total=', res.total);
    } catch (e) {
        console.error('[DB] upsert failed', e?.message || e);
    }
}

// Helper function for directory scanning
async function scanDirectory(dir) {
    const results = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...await scanDirectory(fullPath));
        } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (ext === '.mp3' || ext === '.wav') {
                results.push(fullPath);
            }
        }
    }
    return results;
}

// Check if analysis files exist for a given file
function hasExistingAnalysis(filePath) {
  const dir = path.dirname(filePath);
  const base = path.parse(filePath).name;
  const safe = fileSafe(base);

  // Prefer shared helper that already knows about new vs legacy names
  const found = findExistingJson(filePath);

  // Also check CSV (same sanitization) for backwards compatibility
  const csvPath = path.join(dir, `${safe}.csv`);

  return Boolean(found) || fs.existsSync(csvPath);
}

// Settings file path
const getSettingsPath = () => path.join(app.getPath('userData'), 'settings.json');

// Load settings from file
const loadSettings = async () => {
    try {
        const data = await fsPromises.readFile(getSettingsPath(), 'utf8');
        const loaded = JSON.parse(data);
        settings = { ...settings, ...loaded };
        console.log('[MAIN] Settings loaded from file:', settings);
    } catch (err) {
        console.log('[MAIN] No settings file found, using defaults');
    }
    
    // Ensure DB scaffold exists after settings are loaded
    ensureDbScaffold(settings.dbFolder);
    
    // DEBUG: force-enable CSV artifacts for inspection
    if (settings.writeCsvArtifacts !== true) {
      settings.writeCsvArtifacts = true;
      console.log('[MAIN] writeCsvArtifacts forced ON for debugging');
      // persist so subsequent runs keep it until you turn it off in Settings UI/file
      if (typeof saveSettings === 'function') {
        try { saveSettings(settings); } catch (e) { console.warn('[MAIN] saveSettings failed (non-fatal):', e.message); }
      }
    }

    // Make settings globally accessible to analysis modules
    global.RNA_SETTINGS = settings;
};

// v1.2.0: Bootstrap function to handle async initialization
async function bootstrap() {
    try {
        // Resolve DB paths on startup
        if (!dbPaths) {
            dbPaths = await resolveDbPaths();
        }
        // Create DB files if missing
        await DB.createIfMissing();
        console.log('[MAIN] Bootstrap completed successfully');
    } catch (e) {
        console.error('[MAIN] Bootstrap failed:', e);
    }
}

// Save settings to file
const saveSettings = async () => {
    await fsPromises.writeFile(getSettingsPath(), JSON.stringify(settings, null, 2));
    console.log('[MAIN] Settings saved to file');
    
    // Update global settings for analysis modules
    global.RNA_SETTINGS = settings;
};

// Get installed Ollama models (restricted to supported set)
const getInstalledModels = async () => {
    const SUPPORTED_MODELS = [
        'qwen2.5:32b-instruct',
        'gemma2:27b-instruct',
        'mixtral:8x7b',
        'qwen3:30b',
        'qwen3:8b'
    ];
    try {
        const res = await fetch('http://127.0.0.1:11434/api/tags');
        if (!res.ok) return [];
        const data = await res.json();
        const installedModels = (data.models || []).map(m => m.name);
        return SUPPORTED_MODELS.filter(model => installedModels.some(m => m === model || m.startsWith(model + ':')));
    } catch (e) {
        console.log('[MAIN] Failed to get Ollama models:', e.message);
        return [];
    }
};

const createWindow = () => {
    const win = new BrowserWindow({
        width: 1200,
        height: 980,  // Tall enough for 10 cards comfortably
        icon: path.join(app.getAppPath(), 'app', 'assets', 'icon.png'),
        webPreferences: {
            preload: path.join(app.getAppPath(), 'app', 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    win.loadFile(path.join(app.getAppPath(), 'app', 'renderer.html'));
    
    // v1.2.0: Set global mainWindow reference for queue tasks
    global.mainWindow = win;
    
    // Register IPC handler for drag-drop
    ipcMain.handle('scanDropped', async (event, { paths }) => {
        console.log('[MAIN] scanDropped:', paths.length, 'paths');
        const tracks = [];
        const seen = new Set();
        for (const filePath of paths) {
            try {
                const stat = fs.statSync(filePath);
                if (stat.isDirectory()) {
                    const files = await scanDirectory(filePath);
                    for (const file of files) {
                        const basename = path.basename(file, path.extname(file)).toLowerCase();
                        if (!seen.has(basename)) {
                            seen.add(basename);
                            const hasAnalysis = hasExistingAnalysis(file);
                            tracks.push({
                                path: file,
                                fileName: path.basename(file),
                                status: hasAnalysis ? 'RE-ANALYZE' : 'QUEUED',
                                hasExistingAnalysis: hasAnalysis
                            });
                        }
                    }
                } else if (stat.isFile()) {
                    const ext = path.extname(filePath).toLowerCase();
                    if (ext === '.mp3' || ext === '.wav') {
                        const basename = path.basename(filePath, ext).toLowerCase();
                        if (!seen.has(basename)) {
                            seen.add(basename);
                            const hasAnalysis = hasExistingAnalysis(filePath);
                            tracks.push({
                                path: filePath,
                                fileName: path.basename(filePath),
                                status: hasAnalysis ? 'RE-ANALYZE' : 'QUEUED',
                                hasExistingAnalysis: hasAnalysis
                            });
                        }
                    }
                }
            } catch (err) {
                console.error('[MAIN] Error processing:', filePath, err);
            }
        }
        return { tracks };
    });
    
    // Register IPC handlers
    ipcMain.handle('getSettings', async () => {
        return settings;
    });
    // Installed Ollama models
    ipcMain.handle('getInstalledModels', async () => {
        return getInstalledModels();
    });
    
    ipcMain.handle('updateSettings', async (event, newSettings) => {
        settings = { ...settings, ...newSettings };
        console.log('[MAIN] Settings updated:', settings);
        await saveSettings();
        await resolveDbPaths();
        return { success: true };
    });
    
    ipcMain.handle('chooseFolder', async () => {
        const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
        return { folder: result.canceled ? null : result.filePaths[0] };
    });
    
    ipcMain.handle('updateDatabase', async () => {
        try {
            if (!dbPaths) await resolveDbPaths();
            const summary = await DB.getSummary(dbPaths);
            console.log('[MAIN] DB summary:', summary);
            return { success: true, summary };
        } catch (e) {
            console.error('[MAIN] updateDatabase error:', e);
            return { success: false, error: String(e) };
        }
    });
    
    ipcMain.handle('updateCriteriaDb', async () => {
        try {
            if (!dbPaths) await resolveDbPaths();
            const result = await DB.rebuildCriteria(dbPaths);
            console.log('[MAIN] Criteria rebuilt:', result);
            return { success: true, ...result };
        } catch (e) {
            console.error('[MAIN] updateCriteriaDb error:', e);
            return { success: false, error: String(e) };
        }
    });
    
    ipcMain.handle('runHealthCheck', async () => {
        return { ffprobe: true, ffmpeg: true, ollama: false };
    });
    
    
    // FFmpeg analysis handler - now uses enqueue system
    ipcMain.handle('analyzeFile', async (_event, filePath) => {
        try {
            enqueueTrack(filePath);
            console.log('[MAIN] analyzeFile enqueued 1');
            return { success: true, enqueued: 1, trackId: filePath };
        } catch (e) {
            console.error('[MAIN] analyzeFile failed:', e);
            return { success: false, error: String(e?.message || e) };
        }
    });
    
    // v1.0.0: PQueue-based per-file pipelining batch analysis handler
    ipcMain.handle('analyzeFiles', async (_event, filePaths, force = false) => {
        try {
            console.log('[MAIN] Starting PQueue-based per-file pipelining for', filePaths.length, 'files (force:', force, ')');
            
            // Filter files based on force flag
            const toRun = force ? filePaths : filePaths.filter(f => !hasExistingAnalysis(f));
            
            if (toRun.length === 0) {
                const win = getMainWindow();
                if (win) {
                    win.webContents.send('jobProgress', { 
                        stage: 'system', 
                        status: 'IDLE', 
                        note: force ? 'Nothing selected' : 'All selected files already analyzed' 
                    });
                }
                return { success: true, enqueued: 0, skipped: filePaths.length };
            }
            
            toRun.forEach(fp => enqueueTrack(fp, { force }));
            console.log('[MAIN] analyzeFiles enqueued', toRun.length, 'files');
            return { success: true, enqueued: toRun.length, skipped: filePaths.length - toRun.length };
        } catch (e) {
            console.error('[MAIN] PQueue pipeline failed:', e);
            return { success: false, error: String(e?.message || e) };
        }
    });
    
    // Search IPC handlers
    ipcMain.handle('search:getDB', async () => {
        try {
            const dbFolder = settings.dbFolder || path.join(app.getPath('userData'), 'RhythmDNA');
            const criteriaPath = path.join(dbFolder, 'CriteriaDB.json');
            const rhythmPath = path.join(dbFolder, 'RhythmDB.json');
            
            if (!fs.existsSync(criteriaPath) || !fs.existsSync(rhythmPath)) {
                return { success: false, error: 'Database files not found' };
            }
            
            const criteria = JSON.parse(await fsPromises.readFile(criteriaPath, 'utf8'));
            const rhythm = JSON.parse(await fsPromises.readFile(rhythmPath, 'utf8'));
            
            return { success: true, criteria, rhythm };
        } catch (e) {
            console.error('[MAIN] search:getDB error:', e);
            return { success: false, error: e.message };
        }
    });
    
    ipcMain.handle('search:showFile', async (_e, filePath) => {
        shell.showItemInFolder(filePath);
        return { success: true };
    });
    
    ipcMain.handle('search:getVersions', async (_e, filePath) => {
        try {
            const dir = path.dirname(filePath);
            const base = path.basename(filePath, path.extname(filePath));
            const root = base.replace(/\s*\([^)]*\)\s*/g, '').toLowerCase();
            
            const files = await fsPromises.readdir(dir);
            const versions = files.filter(f => {
                const name = path.basename(f, path.extname(f)).toLowerCase();
                return name.includes(root);
            });
            
            const exts = versions.map(f => path.extname(f).toLowerCase());
            return {
                success: true,
                count: versions.length,
                hasWav: exts.includes('.wav'),
                hasMp3: exts.includes('.mp3')
            };
        } catch (e) {
            return { success: false, count: 1 };
        }
    });
    
    ipcMain.handle('search:readJson', async (_e, absPath) => {
        const data = await fsPromises.readFile(absPath, 'utf8');
        return JSON.parse(data);
    });
    
    // Waveform PNG generation with lazy require to avoid circular imports
    // SMB auto-mount handler for NAS shares
    ipcMain.handle('system:ensure-mounted', async (_evt, mountPoint, smbUrl) => {
        const fs = require('fs');
        const { execFile } = require('child_process');
        
        try {
            // Check if already mounted
            if (fs.existsSync(mountPoint)) {
                return { ok: true, already: true };
            }
            
            // Use AppleScript to mount SMB share (uses Keychain for auth)
            await new Promise((resolve, reject) => {
                const script = `try
                    mount volume "${smbUrl}"
                end try`;
                
                execFile('/usr/bin/osascript', ['-e', script], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
            
            // Check if mount succeeded
            const ok = fs.existsSync(mountPoint);
            return { ok };
        } catch (e) {
            console.log('[SMB] Mount failed:', e.message);
            return { ok: false, error: e.message };
        }
    });

    ipcMain.handle('waveform:get-png', async (_evt, absPath, opts = {}) => {
        try {
            const path = require('node:path');
            
            // Always place PNGs alongside the DB, under 'waveforms' folder (plural)
            const dbRoot = settings.dbFolder || path.join(app.getPath('userData'), 'RhythmDNA');
            const cacheRoot = path.join(dbRoot, 'waveforms');  // NOTE: plural 'waveforms'
            
            // Use the centralized waveform generator
            const wf = await writeWaveformPng({ 
                audioPath: absPath, 
                dbFolder: dbRoot 
            });
            if (wf?.ok && wf.path) {
                return { ok: true, png: wf.path };
            } else if (wf?.skipped) {
                return { ok: true, skipped: true, reason: wf.reason };
            } else {
                return { ok: false, error: wf?.error || 'waveform generation failed' };
            }
        } catch (e) {
            console.error('[WAVEFORM IPC] Error:', e.message);
            return { ok: false, error: e.message };
        }
    });
};

app.whenReady().then(async () => {
    try {
        // Load settings and initialize app
        await loadSettings();
        await bootstrap();
        await initQueues();
        
        // Set dock icon for macOS
        if (process.platform === 'darwin') {
            const iconPath = path.join(app.getAppPath(), 'app', 'assets', 'icon.png');
            if (fs.existsSync(iconPath)) {
                app.dock.setIcon(iconPath);
            }
        }
        
        createWindow();
        resolveDbPaths();
    } catch (e) {
        console.error('[MAIN] Failed to initialize:', e);
        // Fail fast so we don't run without queues
        app.quit();
    }

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    // Always quit when window is closed (including on macOS)
    app.quit();
});



