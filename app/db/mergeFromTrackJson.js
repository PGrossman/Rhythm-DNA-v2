const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { shouldWriteCsv } = require('../utils/csvWriter');
const { writeInfoCsv } = require('../utils/infoCsv');

function readJsonSafe(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}
function writeJsonAtomicSync(p, obj) {
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, p);
}
function ensureDirSync(p) {
  fs.mkdirSync(p, { recursive: true });
}
function normalizeDbShape(db) {
  const out = (db && typeof db === 'object') ? db : {};
  // tracks → array
  if (Array.isArray(out.tracks)) {
    // ok
  } else if (out.tracks && typeof out.tracks === 'object') {
    // convert map → array, best-effort
    out.tracks = Object.values(out.tracks);
  } else {
    out.tracks = [];
  }
  // indices
  if (!out.indices || typeof out.indices !== 'object') {
    out.indices = { byPath: {}, byArtist: {}, byTitle: {} };
  } else {
    out.indices.byPath   = out.indices.byPath   || {};
    out.indices.byArtist = out.indices.byArtist || {};
    out.indices.byTitle  = out.indices.byTitle  || {};
  }
  // meta
  if (!out.meta || typeof out.meta !== 'object') {
    out.meta = { version: 1 };
  }
  // rebuild byPath if missing/stale
  if (Object.keys(out.indices.byPath).length !== out.tracks.length) {
    out.indices.byPath = {};
    for (let i = 0; i < out.tracks.length; i++) {
      const t = out.tracks[i] || {};
      const key = (t.source && (t.source.filePath || t.source.fileName)) || null;
      if (key) out.indices.byPath[key] = i;
    }
  }
  return out;
}

function perTrackJsonPath(audioPath) {
  if (!audioPath) return null;
  const dir = path.dirname(audioPath);
  const base = path.basename(audioPath).replace(/\.[^.]+$/, '');
  return path.join(dir, `${base}.json`);
}

async function mergeFromTrackJson({ audioPath, dbFolder, settings }) {
  if (!dbFolder || typeof dbFolder !== 'string') {
    console.error('[DB] mergeFromTrackJson: invalid dbFolder', dbFolder);
    throw new Error('mergeFromTrackJson requires a dbFolder string');
  }
  const dbPath = path.join(dbFolder, 'RhythmDB.json');
  ensureDirSync(dbFolder);

  // read current DB (or init)
  let db = normalizeDbShape(readJsonSafe(dbPath));
  if (!db) db = normalizeDbShape({});

  // read per-track JSON
  const tJsonPath = perTrackJsonPath(audioPath);
  const trackJson = readJsonSafe(tJsonPath);
  if (!trackJson) {
    console.warn('[DB] mergeFromTrackJson: per-track JSON missing:', tJsonPath);
    return { ok: false, reason: 'missing-track-json', path: tJsonPath };
  }

  const { source, technical, instrumentation, creative, timings, versions, waveformPng, waveform_png, analysis } = trackJson;
  const key = (source && (source.filePath || source.fileName)) || audioPath;
  let idx = db.indices.byPath[key];
  
  // Title fallback
  const title = (source && (source.title || source.fileName)) ? String((source.title || source.fileName)).replace(/\.[^.]+$/, '') : null;
  
  const record = { source, technical, instrumentation, creative, timings, versions };
  if (title && !record.title) record.title = title;
  if (waveformPng && !record.waveformPng) record.waveformPng = waveformPng;
  if (waveform_png && !record.waveform_png) record.waveform_png = waveform_png;
  
  // Waveform propagation from analysis
  if (analysis && analysis.waveform_png && !record.waveform_png) {
    record.waveform_png = analysis.waveform_png;
  }

  if (typeof idx === 'number' && idx >= 0 && idx < db.tracks.length) {
    db.tracks[idx] = record;
  } else {
    db.tracks.push(record);
    idx = db.tracks.length - 1;
    db.indices.byPath[key] = idx;
  }

  writeJsonAtomicSync(dbPath, db);
  console.log('[DB] upsert ok', path.basename(key || 'unknown'));
  console.log('[DB] save ok', dbPath);
  
  // --- CSV artifact (per-track, same folder as the song) ---
  try {
    if (!shouldWriteCsv(settings)) {
      console.log('[ARTIFACT] CSV writing disabled by settings/env gate');
      return { ok: true, dbPath, index: idx };
    }

    const srcPath = (source && source.filePath) || audioPath;
    writeInfoCsv({ source, technical, creative, instrumentation, versions }, srcPath, db, idx, dbFolder);
  } catch (e) {
    console.warn('[CSV] Failed to write CSV:', e.message);
  }
  
  return { ok: true, dbPath, index: idx };
}

module.exports = { mergeFromTrackJson };