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

async function writeJsonSafe(destPath, obj) {
  const tmp = destPath + '.tmp';
  await fs.promises.writeFile(tmp, JSON.stringify(obj, null, 2));
  await fs.promises.rename(tmp, destPath);
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
    'file','path','analyzed_at','title','artist','waveform_png','duration_sec','sample_rate_hz','channels',
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
  
  // Handle analysis field - preserve final_instruments and metadata
  if (newRec.analysis) {
    out.analysis = { ...oldRec.analysis, ...newRec.analysis };
    // Ensure final_instruments, __run_id, and __source_flags are preserved
    if (newRec.analysis.final_instruments) out.analysis.final_instruments = newRec.analysis.final_instruments;
    if (newRec.analysis.__run_id) out.analysis.__run_id = newRec.analysis.__run_id;
    if (newRec.analysis.__source_flags) out.analysis.__source_flags = newRec.analysis.__source_flags;
  }
  
  out.updated_at = new Date().toISOString();
  if (!out.created_at) out.created_at = out.analyzed_at || out.updated_at;
  return out;
}

function getPaths(dbFolder) {
  const path = require('path');
  const root = String(dbFolder);
  return {
    dbPath: path.join(root, 'RhythmDB.json'),
    criteriaPath: path.join(root, 'CriteriaDB.json'),
  };
}

async function loadMain(paths) {
  const parsed = await readJsonSafe(paths.main, { tracks: {} });
  
  // Normalize tracks with title fallback
  const root = (parsed && typeof parsed === 'object') ? parsed : {};
  const tracks = Array.isArray(root.tracks) ? root.tracks
                  : (root.tracks && typeof root.tracks === 'object') ? Object.values(root.tracks) : [];
  const main = { tracks: tracks.map(t => {
    const out = t || {};
    if (!out.title) {
      const src = out.source || {};
      const base = (src.title || src.fileName || '') ? String(src.title || src.fileName).replace(/\.[^.]+$/, '') : 'Unknown';
      out.title = base;
    }
    return out;
  }) };
  return { main };
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

async function rebuildCriteria(dbFolderIn) {
  // Accept either a folder string or a settings object with .dbFolder
  let dbFolder = dbFolderIn;
  if (dbFolder && typeof dbFolder === 'object' && dbFolder.dbFolder) {
    dbFolder = dbFolder.dbFolder;
  }
  if (typeof dbFolder !== 'string') {
    const settings = require('../utils/settings').loadSettings();
    dbFolder = settings.dbFolder;
  }

  const fs = require('fs');
  const { dbPath, criteriaPath } = getPaths(dbFolder);

  // Load DB safely
  let root = {};
  try { root = JSON.parse(fs.readFileSync(dbPath, 'utf8')); } catch {}

  // Normalize tracks
  const tracks = Array.isArray(root.tracks)
    ? root.tracks
    : (root.tracks && typeof root.tracks === 'object')
      ? Object.values(root.tracks)
      : [];

  // Build unique sets
  const genreSet = new Set();
  const moodSet = new Set();
  const instrSet = new Set();
  const vocalsSet = new Set();
  const themeSet = new Set();
  const keysSet = new Set();
  const artistsSet = new Set();

  for (const t of tracks) {
    const cr = (t && t.creative) || {};
    const ins = (t && t.instrumentation) || {};

    // Creative fields
    (Array.isArray(cr.genre)  ? cr.genre  : []).forEach(v => v && genreSet.add(v));
    (Array.isArray(cr.mood)   ? cr.mood   : []).forEach(v => v && moodSet.add(v));
    (Array.isArray(cr.instrument) ? cr.instrument : []).forEach(v => v && instrSet.add(v));
    (Array.isArray(cr.vocals) ? cr.vocals : []).forEach(v => v && vocalsSet.add(v));
    (Array.isArray(cr.theme)  ? cr.theme  : []).forEach(v => v && themeSet.add(v));

    // Instrumentation instruments (actual detected) — merge into instrument set
    (Array.isArray(ins.instruments) ? ins.instruments : []).forEach(v => v && instrSet.add(v));

    // Optional future fields
    const src = (t && t.source) || {};
    if (src.artist) artistsSet.add(src.artist);
    if (src.key)    keysSet.add(src.key);
  }

  // Arrays (sorted for determinism)
  const genre = Array.from(genreSet).sort();
  const mood = Array.from(moodSet).sort();
  const instrument = Array.from(instrSet).sort();
  const vocals = Array.from(vocalsSet).sort();
  const theme = Array.from(themeSet).sort();
  const tempoBands = []; // not computed yet
  const keys = Array.from(keysSet).sort();
  const artists = Array.from(artistsSet).sort();

  const counts = {
    genre: genre.length,
    mood: mood.length,
    instrument: instrument.length,
    vocals: vocals.length,
    theme: theme.length,
    tempoBands: tempoBands.length,
    keys: keys.length,
    artists: artists.length,
  };

  const criteria = { genre, mood, instrument, vocals, theme, tempoBands, keys, artists, counts };

  fs.writeFileSync(criteriaPath, JSON.stringify(criteria, null, 2));
  console.log('[MAIN] Criteria rebuilt:', counts);
  return criteriaPath;
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

async function createIfMissing(dbFolder) {
  try {
    if (!dbFolder || typeof dbFolder !== 'string') {
      throw new Error('createIfMissing requires a dbFolder string');
    }
    
    const { dbPath, criteriaPath } = getPaths(dbFolder);
    
    // Create main DB if missing
    if (!fs.existsSync(dbPath)) {
      const rhythmDb = { 
        tracks: [], 
        indices: { byPath: {} }, 
        meta: { version: 1 } 
      };
      await writeJsonSafe(dbPath, rhythmDb);
      console.log('[DB] Created RhythmDB.json');
    }
    
    // Create criteria DB if missing
    if (!fs.existsSync(criteriaPath)) {
      const criteriaDb = {
        genre: [],
        mood: [],
        instrument: [],
        vocals: [],
        theme: [],
        tempoBands: [],
        keys: [],
        artists: [],
        counts: {
          genre: 0,
          mood: 0,
          instrument: 0,
          vocals: 0,
          theme: 0,
          tempoBands: 0,
          keys: 0,
          artists: 0
        }
      };
      await writeJsonSafe(criteriaPath, criteriaDb);
      console.log('[DB] Created CriteriaDB.json');
    }
    
    return true;
  } catch (e) {
    console.error('[DB] createIfMissing failed:', e);
    return false;
  }
}

module.exports = {
  getPaths,
  upsertTrack,
  rebuildCriteria,
  getCriteria,
  getSummary,
  createIfMissing,
  mergeFromTrackJson: require('./mergeFromTrackJson').mergeFromTrackJson,
  ensureAndResolvePaths: function ensureAndResolvePaths(dbFolder) {
    // Use existing createIfMissing logic, but ensure we pass the dbFolder through.
    // Without this, createIfMissing throws: "createIfMissing requires a dbFolder string".
    return createIfMissing(dbFolder);
  }
};


