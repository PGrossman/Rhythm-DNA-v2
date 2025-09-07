// app/db/jsondb.js — JSON database for local storage
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function normalizeKey(pth) {
  if (!pth) return '';
  let n = path.normalize(pth);
  n = n.replace(/\\/g, '/');
  return n.toLowerCase();
}

async function readJsonSafe(file, fallback) {
  try {
    const s = await fsp.readFile(file, 'utf8');
    return JSON.parse(s);
  } catch {
    return fallback;
  }
}

async function writeJsonSafe(file, obj) {
  const tmp = file + '.tmp';
  await fsp.writeFile(tmp, JSON.stringify(obj, null, 2));
  await fsp.rename(tmp, file);
}

function defaultCriteria() {
  return {
    genre: [],
    mood: [],
    instrument: [],
    vocals: [],
    theme: [],
    tempoBands: [],
    keys: [],
    artists: []
  };
}

function toArray(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  return [v];
}

function unionInto(arr, values) {
  const seen = new Set(arr.map(x => String(x)));
  for (const v of values) {
    const s = String(v);
    if (!seen.has(s)) { arr.push(s); seen.add(s); }
  }
  return arr;
}

function tempoToBand(bpm) {
  if (!Number.isFinite(bpm)) return null;
  if (bpm < 60) return 'Very Slow (Below 60 BPM)';
  if (bpm < 90) return 'Slow (60-90 BPM)';
  if (bpm < 110) return 'Medium (90-110 BPM)';
  if (bpm < 140) return 'Upbeat (110-140 BPM)';
  if (bpm < 160) return 'Fast (140-160 BPM)';
  return 'Very Fast (160+ BPM)';
}

function mergeTrack(oldRec = {}, newRec = {}) {
  const out = { ...oldRec };
  const scalarKeys = [
    'file','path','analyzed_at','duration_sec','sample_rate_hz','channels',
    'bit_rate','lufs_integrated','loudness_range','true_peak_db','estimated_tempo_bpm','key'
  ];
  for (const k of scalarKeys) {
    const nv = newRec[k];
    if (nv !== undefined && nv !== null && nv !== '') out[k] = nv;
  }
  const cOld = oldRec.creative || {};
  const cNew = newRec.creative || {};
  const cOut = { ...cOld };
  for (const k of ['genre','mood','instrument','vocals','theme']) {
    const a = toArray(cOld[k]);
    const b = toArray(cNew[k]);
    cOut[k] = unionInto(a.slice(), b);
  }
  if (typeof cNew.narrative === 'string' && cNew.narrative.trim()) cOut.narrative = cNew.narrative;
  if (Number.isFinite(cNew.confidence)) cOut.confidence = cNew.confidence;
  out.creative = cOut;
  out.updated_at = new Date().toISOString();
  if (!out.created_at) out.created_at = out.analyzed_at || out.updated_at;
  return out;
}

async function getPaths({ dbFolder, userData }) {
  const base = dbFolder && dbFolder.trim() ? dbFolder : path.join(userData, 'rhythmdna-db');
  ensureDir(base);
  return {
    base,
    main: path.join(base, 'RhythmDB.json'),
    criteria: path.join(base, 'CriteriaDB.json')
  };
}

async function loadMain(paths) {
  return readJsonSafe(paths.main, { tracks: {} });
}

async function saveMain(paths, db) {
  return writeJsonSafe(paths.main, db);
}

async function upsertTrack(paths, analysis) {
  const key = normalizeKey(analysis?.path);
  if (!key) throw new Error('analysis.path required for DB key');
  const db = await loadMain(paths);
  const prev = db.tracks[key];
  const merged = mergeTrack(prev, analysis);
  db.tracks[key] = merged;
  await saveMain(paths, db);
  return { key, record: merged, total: Object.keys(db.tracks).length };
}

async function rebuildCriteria(paths) {
  const db = await loadMain(paths);
  const sets = {
    genre: new Set(),
    mood: new Set(),
    instrument: new Set(),
    vocals: new Set(),
    theme: new Set(),
    tempoBands: new Set(),
    keys: new Set(),
    artists: new Set()
  };
  for (const key of Object.keys(db.tracks)) {
    const t = db.tracks[key];
    const c = t.creative || {};
    for (const k of ['genre','mood','instrument','vocals','theme']) {
      for (const v of toArray(c[k])) if (v) sets[k].add(String(v));
    }
    const band = tempoToBand(Number(t.estimated_tempo_bpm));
    if (band) sets.tempoBands.add(band);
    if (t.key) sets.keys.add(String(t.key));
    if (t.artist) sets.artists.add(String(t.artist));
  }
  const crit = defaultCriteria();
  for (const k of Object.keys(crit)) {
    crit[k] = Array.from(sets[k]).sort((a,b) => a.localeCompare(b));
  }
  await writeJsonSafe(paths.criteria, crit);
  return { counts: Object.fromEntries(Object.entries(crit).map(([k,v]) => [k, v.length])) };
}

async function getCriteria(paths) {
  const crit = await readJsonSafe(paths.criteria, defaultCriteria());
  return crit;
}

async function getSummary(paths) {
  const db = await loadMain(paths);
  const crit = await getCriteria(paths);
  return {
    totalTracks: Object.keys(db.tracks).length,
    criteriaCounts: Object.fromEntries(Object.entries(crit).map(([k,v]) => [k, v.length]))
  };
}

module.exports = {
  getPaths,
  upsertTrack,
  rebuildCriteria,
  getCriteria,
  getSummary
};


