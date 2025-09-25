'use strict';
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { shouldGenerateWaveformFor } = require('../utils/audioSiblings');

// Helper to run command
function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
    let out = '', err = '';
    p.stdout.on('data', d => (out += d.toString()));
    p.stderr.on('data', d => (err += d.toString()));
    p.on('close', (code) => code === 0 ? resolve(out.trim()) : reject(new Error(err.trim() || `${cmd} failed`)));
  });
}

async function ffprobeDuration(file) {
  const out = await run('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=nw=1:nk=1',
    file,
  ]);
  const dur = parseFloat(out);
  if (!isFinite(dur) || dur <= 0) throw new Error('Could not read duration from ffprobe');
  return dur;
}

/**
 * Generate or reuse a waveform PNG for a given audio file.
 * @param {string} absPath absolute path to audio
 * @param {object} opts { dbFolder, height=180, pps=60, color='#22c55e' }
 * @returns {Promise<{pngPath:string, width:number, height:number, pps:number}>}
 */
async function ensureWaveformPng(absPath, opts = {}) {
  const dbFolder = opts.dbFolder;
  if (!dbFolder) {
    console.log('[WAVEFORM] No dbFolder provided, skipping PNG generation');
    throw new Error('ensureWaveformPng requires opts.dbFolder');
  }

  const height = opts.height ?? 180;
  const pps = opts.pps ?? 60; // pixels per second
  const color = (opts.color ?? '22c55e').replace('#',''); // green

  // Create standard filename
  const base = path.basename(absPath, path.extname(absPath));
  const outDir = path.join(dbFolder, 'waveforms');
  const outPng = path.join(outDir, `${base}.png`);

  // Legacy migration: check for old .wave.png files
  const legacy = path.join(outDir, `${base}.wave.png`);
  if (!fs.existsSync(outPng) && fs.existsSync(legacy)) {
    try {
      fs.copyFileSync(legacy, outPng);
      console.log('[WAVEFORM] Upgraded legacy waveform:', outPng);
    } catch {}
  }

  // Check if already exists
  try {
    const st = fs.statSync(outPng);
    if (st.size > 0) {
      console.log('[WAVEFORM] Reusing existing PNG:', outPng);
      return { pngPath: outPng, width: 1600, height, pps };
    }
  } catch { /* doesn't exist */ }

  // Create directory
  fs.mkdirSync(outDir, { recursive: true });

  // Calculate width based on duration
  const duration = opts.durationSec || await ffprobeDuration(absPath);
  const width = Math.max(800, Math.min(Math.round(duration * pps), 8000));

  console.log(`[WAVEFORM] Generating PNG: ${outPng} (${width}x${height})`);

  // Generate PNG using ffmpeg
  const args = [
    '-hide_banner', '-y',
    '-i', absPath,
    '-filter_complex',
    `aformat=channel_layouts=mono,showwavespic=s=${width}x${height}:colors=${color}`,
    '-frames:v', '1',
    outPng,
  ];

  try {
    await run('ffmpeg', args);
    console.log('[WAVEFORM] PNG generated:', outPng);
    return { pngPath: outPng, width, height, pps };
  } catch (err) {
    console.error('[WAVEFORM] FFmpeg failed:', err.message);
    throw err;
  }
}

/**
 * Write waveform PNG with policy enforcement (prefer MP3, skip WAV twin)
 * @param {Object} opts - Options object
 * @param {string} opts.audioPath - Path to audio file
 * @param {string} opts.dbFolder - Database folder path
 * @param {number} [opts.width=8000] - Width of waveform
 * @param {number} [opts.height=180] - Height of waveform
 * @returns {Object} - Result object with ok, skipped, reason, path properties
 */
async function writeWaveformPng({ audioPath, dbFolder, width = 8000, height = 180 }) {
  try {
    // Check MP3-twin rule: skip WAV if MP3 twin exists
    if (!shouldGenerateWaveformFor(audioPath)) {
      return { 
        ok: true, 
        skipped: true, 
        reason: 'wav-twin-skip' 
      };
    }
    
    // Generate waveform in lowercase waveforms directory (to match UI expectations)
    const dir = path.join(dbFolder, 'waveforms');  // lowercase w
    fs.mkdirSync(dir, { recursive: true });
    
    const base = path.basename(audioPath, path.extname(audioPath));
    const out = path.join(dir, base + '.png');
    
    // Legacy migration: check for old .wave.png files
    const legacy = path.join(dir, base + '.wave.png');
    if (!fs.existsSync(out) && fs.existsSync(legacy)) {
      try {
        fs.copyFileSync(legacy, out);
        console.log('[WAVEFORM] Upgraded legacy waveform:', out);
      } catch {}
    }
    
    // Check if already exists
    if (fs.existsSync(out)) {
      return {
        ok: true,
        skipped: true,
        reason: 'already exists',
        path: out
      };
    }
    
    // Generate waveform using ffmpeg
    const duration = await ffprobeDuration(audioPath);
    const pps = Math.round(width / duration);
    
    const args = [
      '-hide_banner', '-y',
      '-i', audioPath,
      '-filter_complex',
      `aformat=channel_layouts=mono,showwavespic=s=${width}x${height}:colors=22c55e`,
      '-frames:v', '1',
      out,
    ];
    
    await run('ffmpeg', args);
    
    return {
      ok: true,
      skipped: false,
      path: out
    };
    
  } catch (error) {
    return {
      ok: false,
      error: error.message,
      skipped: false,
      path: null
    };
  }
}

module.exports = { ensureWaveformPng, writeWaveformPng };