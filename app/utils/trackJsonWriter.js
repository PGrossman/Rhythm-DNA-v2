const fs = require('fs');
const path = require('path');
const { fileSafe } = require('./fileSafeName');

/**
 * Build a summary object from track analysis data
 * @param {Object} params - The analysis data
 * @param {string} params.filePath - Path to the source audio file
 * @param {Object} [params.technical] - Technical analysis results
 * @param {Object} [params.instrumentation] - Instrumentation analysis results
 * @param {Object} [params.creative] - Creative analysis results
 * @param {Object} [params.timings] - Timing information
 * @param {Object} [params.versions] - Version information
 * @returns {Object} - The assembled summary object
 */
function buildSummary({ filePath, technical, instrumentation, creative, timings, versions }) {
  return {
    source: {
      filePath,
      fileName: path.basename(filePath),
      dir: path.dirname(filePath)
    },
    technical: technical || null,      // { bpm, audioHints, key?, energy?, sections? } as available
    instrumentation: instrumentation || null, // { instruments, decision_trace?, version? } as available
    creative: creative || null,        // parsed model output already used for UI
    timings: timings || null,          // { queuedAt, techStart, techEnd, instrStart, instrEnd, creativeStart, creativeEnd } if available
    versions: versions || null,        // { app?, ensemble?, models? } if available
    generatedAt: new Date().toISOString()
  };
}

/**
 * Generate the target path for the JSON summary file
 * @param {string} filePath - Path to the source audio file
 * @returns {string} - Path where the JSON summary should be written
 */
function targetPath(filePath) {
  const dir = path.dirname(filePath);
  const base = path.parse(filePath).name;
  const safe = fileSafe(base);
  return path.join(dir, safe + '.rhythmdna.json');
}

/**
 * Write the JSON summary to the source directory
 * @param {Object} params - The analysis data (same as buildSummary)
 * @returns {string} - Path where the file was written
 */
function writeSummary({ filePath, technical, instrumentation, creative, timings, versions }) {
  const out = buildSummary({ filePath, technical, instrumentation, creative, timings, versions });
  const dest = targetPath(filePath);
  fs.writeFileSync(dest, JSON.stringify(out, null, 2), 'utf8');
  return dest;
}

/**
 * Find existing JSON file for a given audio file
 * @param {string} filePath - Path to the audio file
 * @returns {string|null} - Path to existing JSON file or null if not found
 */
function findExistingJson(filePath) {
  const dir = path.dirname(filePath);
  const base = path.parse(filePath).name;
  const safe = fileSafe(base);
  
  // Check for .rhythmdna.json first (legacy)
  const rhythmdnaPath = path.join(dir, safe + '.rhythmdna.json');
  if (fs.existsSync(rhythmdnaPath)) {
    return rhythmdnaPath;
  }
  
  // Check for .json (new format)
  const jsonPath = path.join(dir, base + '.json');
  if (fs.existsSync(jsonPath)) {
    return jsonPath;
  }
  
  return null;
}

/**
 * Write or merge JSON summary (idempotent)
 * @param {Object} params - The analysis data
 * @returns {string} - Path where the file was written
 */
function writeOrMerge({ filePath, technical, instrumentation, creative, timings, versions }) {
  const out = buildSummary({ filePath, technical, instrumentation, creative, timings, versions });
  
  // Use the new format: <Song Name>.json (no .rhythmdna)
  const dir = path.dirname(filePath);
  const base = path.parse(filePath).name;
  const dest = path.join(dir, base + '.json');
  
  // Read existing JSON if it exists and merge
  let existingData = {};
  if (fs.existsSync(dest)) {
    try {
      const existingContent = fs.readFileSync(dest, 'utf8');
      existingData = JSON.parse(existingContent);
    } catch (e) {
      // If we can't parse existing JSON, just overwrite it
      console.warn('[JSON] Failed to parse existing JSON, overwriting:', e.message);
    }
  }
  
  // Merge with existing data (preserve existing fields, update with new ones)
  const mergedData = {
    ...existingData,
    ...out,
    // Preserve existing timings if they exist
    timings: out.timings || existingData.timings || null,
    // Preserve existing versions if they exist
    versions: out.versions || existingData.versions || null,
    // Always update generatedAt
    generatedAt: out.generatedAt
  };
  
  fs.writeFileSync(dest, JSON.stringify(mergedData, null, 2), 'utf8');
  return dest;
}

/**
 * Ensure per-track JSON exists with proper filename format
 * @param {Object} params - The analysis data
 * @param {Object} params.source - Source file info {filePath, fileName, dir}
 * @param {Object} [params.technical] - Technical analysis results
 * @param {Object} [params.instrumentation] - Instrumentation analysis results
 * @param {Object} [params.creative] - Creative analysis results
 * @param {Object} [params.timings] - Timing information
 * @param {Object} [params.versions] - Version information
 * @param {Object} [params.trackData] - Additional track data including waveform paths
 * @returns {Promise<string>} - Path where the file was written
 */
async function ensurePerTrackJson({ source, technical, instrumentation, creative, timings, versions, trackData }) {
  // Build output path: exact song name (no ".rhythmdna" suffix)
  const outputPath = path.join(source.dir, source.fileName.replace(path.extname(source.fileName), '.json'));
  
  // Build the summary object
  const summary = {
    source: {
      filePath: source.filePath,
      fileName: source.fileName,
      dir: source.dir,
      title: source.title || path.basename(source.filePath).replace(/\.[^.]+$/, '')
    },
    technical: technical || null,
    instrumentation: instrumentation || null,
    creative: creative || null,
    timings: timings || null,
    versions: versions || null,
    waveformPng: (trackData && trackData.waveformPng) || undefined,
    waveform_png: (trackData && trackData.waveform_png) || undefined,
    analysis: {
      waveform_png: (trackData && (trackData.waveformPng || trackData.waveform_png)) || undefined
    },
    generatedAt: new Date().toISOString()
  };
  
  // Write atomically
  const tmpPath = outputPath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(summary, null, 2), 'utf8');
  fs.renameSync(tmpPath, outputPath);
  
  return outputPath;
}

/**
 * Write CSV and waveform artifacts for a track
 * @param {Object} trackJson - The track data object
 * @param {Object} settings - Settings object with dbFolder
 */
async function writeArtifacts(trackJson, settings) {
  try {
    // CSV writing is now handled in mergeFromTrackJson.js
    // This function is a placeholder for future artifact writing
    console.log('[ARTIFACTS] Artifacts handled by mergeFromTrackJson');
  } catch (e) {
    console.warn('[ARTIFACTS] Artifact writing failed:', e.message);
  }
}

module.exports = { 
  writeSummary, 
  targetPath, 
  buildSummary, 
  findExistingJson, 
  writeOrMerge,
  ensurePerTrackJson,
  writeArtifacts
};
