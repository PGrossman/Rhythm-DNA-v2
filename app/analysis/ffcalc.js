// app/analysis/ffcalc.js - CommonJS module for ffmpeg analysis
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs').promises;
const http = require('http');

function run(bin, args, { collect = 'stdout' } = {}) {
  return new Promise((resolve, reject) => {
    const cp = spawn(bin, args, { windowsHide: true });
    let out = '', err = '';
    cp.stdout?.on('data', d => (out += d.toString()));
    cp.stderr?.on('data', d => (err += d.toString()));
    cp.on('error', reject);
    cp.on('close', code => {
      if (code !== 0 && collect === 'stdout') return reject(new Error(err || `Exit ${code}`));
      resolve(collect === 'stderr' ? err : out);
    });
  });
}

async function ffprobeJson(filePath) {
  const args = [
    '-v', 'error', '-hide_banner',
    '-print_format', 'json',
    '-show_entries', 'format=duration,bit_rate:stream=index,codec_type,codec_name,sample_rate,channels',
    filePath
  ];
  const out = await run('ffprobe', args);
  const j = JSON.parse(out);
  const fmt = j.format || {};
  const audio = (j.streams || []).find(s => s.codec_type === 'audio') || {};
  
  return {
    duration_sec: Number(fmt.duration || 0),
    bit_rate: Number(fmt.bit_rate || 0),
    sample_rate: Number(audio.sample_rate || 0),
    channels: Number(audio.channels || 0),
    codec: audio.codec_name || 'unknown'
  };
}

async function ffmpegLoudness(filePath) {
  // Measure EBU R128 loudness on FULL track, original stereo
  const args = [
    '-nostats', '-hide_banner', '-i', filePath,
    '-filter:a', 'ebur128=peak=true',
    '-f', 'null', '-'
  ];
  
  const stderr = await run('ffmpeg', args, { collect: 'stderr' });
  
  // Normalize Unicode minus (U+2212) to ASCII hyphen
  const s = stderr.replace(/\u2212/g, '-');
  
  // Debug: log the full stderr to see what we're getting
  console.log('[LOUDNESS] Raw stderr (first 500 chars):', s.substring(0, 500));
  
  // Parse EBU R128 output - look for both formats
  // Format 1: "I:         -14.2 LUFS"
  // Format 2: "Integrated loudness: -14.2 LUFS"
  const mI = /I:\s*(-?\d+(?:\.\d+)?)\s*LUFS/i.exec(s) || 
             /Integrated loudness:\s*(-?\d+(?:\.\d+)?)\s*LUFS/i.exec(s);
  
  const mLRA = /LRA:\s*(-?\d+(?:\.\d+)?)\s*LU\b/i.exec(s) || 
               /Loudness range:\s*(-?\d+(?:\.\d+)?)\s*LU\b/i.exec(s);
  
  // True peak is usually reported as dBTP (not dBFS). Support both, plus "TP:" variants.
  const mTP = /True peak:\s*(-?\d+(?:\.\d+)?)\s*dBTP/i.exec(s) ||
              /True peak:\s*(-?\d+(?:\.\d+)?)\s*dBFS/i.exec(s) ||
              /TP:\s*(-?\d+(?:\.\d+)?)\s*dB(?:TP|FS)/i.exec(s) ||
              /Peak:\s*(-?\d+(?:\.\d+)?)\s*dB(?:TP|FS)/i.exec(s);
  
  const parsedI = mI ? Number(mI[1]) : null;
  console.log(`[LOUDNESS] Parsed - LUFS: ${parsedI}, LRA: ${mLRA?.[1]}, True Peak: ${mTP?.[1]}`);
  
  // If LUFS is missing or out of sane range [-50, 0], fall back to loudnorm
  const lufsBad = (parsedI == null) || !Number.isFinite(parsedI) || parsedI < -50 || parsedI > 0;
  if (lufsBad) {
    console.log('[LOUDNESS] ebur128 parsing failed, trying loudnorm fallback...');
    const lnArgs = ['-hide_banner', '-nostats', '-i', filePath, '-af', 'loudnorm=print_format=json', '-f', 'null', '-'];
    const ln = await run('ffmpeg', lnArgs, { collect: 'stderr' });
    // loudnorm prints measured values as JSON-ish keys
    // e.g. "input_i" : "-14.23", "input_tp" : "-0.30", "input_lra" : "5.10"
    const iI   = /"input_i"\s*:\s*"(-?\d+(?:\.\d+)?)"/i.exec(ln);
    const iTP  = /"input_tp"\s*:\s*"(-?\d+(?:\.\d+)?)"/i.exec(ln);
    const iLRA = /"input_lra"\s*:\s*"(-?\d+(?:\.\d+)?)"/i.exec(ln);
    const lnI = iI ? Number(iI[1]) : null;
    console.log(`[LOUDNESS] loudnorm fallback - LUFS: ${lnI}, LRA: ${iLRA?.[1]}, TP: ${iTP?.[1]}`);
    return {
      lufs_integrated: (Number.isFinite(lnI) && lnI >= -50 && lnI <= 0) ? lnI : null,
      loudness_range:  iLRA ? Number(iLRA[1]) : null,
      true_peak_db:    iTP ? Number(iTP[1]) : (mTP ? Number(mTP[1]) : null)
    };
  }
  
  return {
    lufs_integrated: parsedI,
    loudness_range:  mLRA ? Number(mLRA[1]) : null,
    true_peak_db:    mTP ? Number(mTP[1]) : null
  };
}

async function estimateTempo(filePath) {
  try {
    // Get file duration to choose appropriate analysis window
    const meta = await ffprobeJson(filePath);
    const dur = Number(meta?.duration_sec ?? 0) || 0;
    
    let start = 0, len = 0;
    if (dur >= 32) {
      // Long tracks: use stable middle section
      start = 20; 
      len = 30;
    } else if (dur >= 12) {
      // Medium tracks: centered window, 80% of duration (max 30s)
      len = Math.min(30, Math.max(8, Math.floor(dur * 0.8)));
      start = Math.max(0, Math.floor((dur - len) / 2));
    } else if (dur >= 6) {
      // Short tracks: analyze entire track
      start = 0; 
      len = Math.floor(dur);
    } else {
      // Too short for reliable BPM
      console.log('[TEMPO] Track too short for BPM analysis:', dur, 'seconds');
      return null;
    }
    
    console.log(`[TEMPO] Analyzing window: ${start}s-${start+len}s of ${dur.toFixed(1)}s track`);
    
    // Extract mono PCM for the chosen window
    const args = [
      '-hide_banner', '-nostats',
      '-ss', String(start),
      '-t', String(len),
      '-i', filePath,
      '-vn', '-ac', '1', '-ar', '11025',
      '-f', 's16le', '-'
    ];
    
    const cp = spawn('ffmpeg', args);
    const chunks = [];
    
    return new Promise((resolve) => {
      cp.stdout.on('data', chunk => chunks.push(chunk));
      cp.on('close', (code) => {
        if (code !== 0) {
          console.log('[TEMPO] FFmpeg extraction failed');
          resolve(null);
          return;
        }
        const buffer = Buffer.concat(chunks);
        if (!buffer.length) {
          console.log('[TEMPO] No audio data extracted');
          resolve(null);
          return;
        }
        const samples = new Int16Array(buffer.buffer, buffer.byteOffset, buffer.length / 2);
        
        // Convert to float32
        const float32 = new Float32Array(samples.length);
        for (let i = 0; i < samples.length; i++) {
          float32[i] = samples[i] / 32768;
        }
        
        // Onset envelope (energy flux)
        const frameSize = 512;
        const hopSize = 256;
        const envelope = [];
        let prevEnergy = 0;
        for (let i = 0; i < float32.length - frameSize; i += hopSize) {
          let energy = 0;
          for (let j = 0; j < frameSize; j++) {
            const v = float32[i + j];
            energy += v * v;
          }
          const flux = Math.max(0, energy - prevEnergy);
          envelope.push(flux);
          prevEnergy = energy;
        }
        if (envelope.length < 4) {
          console.log('[TEMPO] Envelope too short');
          resolve(null);
          return;
        }
        
        // Autocorrelation across candidate BPM ranges
        const autocorr = new Array(envelope.length).fill(0);
        for (let lag = 1; lag < envelope.length - 1; lag++) {
          let sum = 0;
          for (let i = 0; i < envelope.length - lag; i++) {
            sum += envelope[i] * envelope[i + lag];
          }
          autocorr[lag] = sum / (envelope.length - lag);
        }
        
        // Candidate BPM bands
        const bpmRanges = [
          { min: 80,  max: 120 }, // Medium
          { min: 120, max: 160 }, // Fast
          { min: 160, max: 200 }  // Very fast
        ];
        
        const sampleRate = 11025;
        const hopRate = sampleRate / hopSize;
        
        let bestBpm = null;
        let bestScore = -Infinity;
        for (const range of bpmRanges) {
          const minLag = Math.floor(hopRate * 60 / range.max);
          const maxLag = Math.floor(hopRate * 60 / range.min);
          for (let lag = minLag; lag <= maxLag && lag < autocorr.length; lag++) {
            const bpm = 60 * hopRate / lag;
            const score = autocorr[lag];
            // Light preference for common range
            const commonBonus = (bpm >= 80 && bpm <= 160) ? 1.1 : 1.0;
            const adjustedScore = score * commonBonus;
            if (adjustedScore > bestScore) {
              bestScore = adjustedScore;
              bestBpm = bpm;
            }
          }
        }
        
        // Resolve half/double-time by grid alignment on the envelope
        function resolveOctave(envelope, hopRate, bpm) {
          if (!bpm || !Number.isFinite(bpm)) return null;
          // Generate candidates within [80,200]
          const raw = [bpm / 2, bpm, bpm * 2]
            .filter(x => x >= 80 && x <= 200);
          // De-duplicate rounded candidates
          const seen = new Set(); 
          const candidates = [];
          for (const x of raw) {
            const r = Math.round(x);
            if (!seen.has(r)) { 
              seen.add(r); 
              candidates.push(x); 
            }
          }
          let best = bpm, bestSum = -Infinity;
          for (const cand of candidates) {
            const interval = hopRate * (60 / cand); // frames between beats
            if (!Number.isFinite(interval) || interval < 2) continue;
            const beatsToCheck = Math.min(32, Math.floor(envelope.length / interval));
            let localBest = -Infinity;
            // Try a few phase offsets across one interval (8 steps)
            for (let phaseStep = 0; phaseStep < 8; phaseStep++) {
              const phase = (interval * phaseStep) / 8;
              let sum = 0;
              for (let k = 0; k < beatsToCheck; k++) {
                const idx = Math.round(phase + k * interval);
                if (idx >= 0 && idx < envelope.length) sum += envelope[idx];
              }
              if (sum > localBest) localBest = sum;
            }
            // Slight preference for 140–170 where many rock tracks sit
            const preference = (cand >= 140 && cand <= 170) ? 1.05 : 1.0;
            const score = localBest * preference;
            if (score > bestSum) { 
              bestSum = score; 
              best = cand; 
            }
          }
          return best;
        }
        
        const resolved = resolveOctave(envelope, hopRate, bestBpm) ?? bestBpm ?? 120;
        const rounded = Math.round(resolved);
        console.log(`[TEMPO] Window ${start}-${start+len}s, Raw BPM: ${bestBpm?.toFixed(1)}, Resolved: ${resolved?.toFixed(1)}, Final: ${rounded}`);
        resolve(rounded);
      });
      cp.on('error', () => resolve(null));
    });
  } catch (e) {
    console.error('[TEMPO] estimateTempo failed:', e);
    return null;
  }
}

async function checkWavExists(mp3Path) {
  const wavPath = mp3Path.replace(/\.mp3$/i, '.wav');
  try {
    await fs.access(wavPath);
    return true;
  } catch {
    return false;
  }
}

// Full creative analysis with Envato taxonomy
async function runCreativeAnalysis(baseName, bpm, loudness) {
  console.log('[CREATIVE] Running full creative analysis...');
  
  // Envato taxonomy for validation
  const ENVATO_TAXONOMY = {
    mood: ["Upbeat/Energetic", "Happy/Cheerful", "Inspiring/Uplifting", "Epic/Powerful", 
           "Dramatic/Emotional", "Chill/Mellow", "Funny/Quirky", "Angry/Aggressive"],
    genre: ["Cinematic", "Corporate", "Hip hop/Rap", "Rock", "Electronic", "Ambient", "Funk", "Classical"],
    theme: ["Corporate", "Documentary", "Action", "Lifestyle", "Sports", "Drama", "Nature", "Technology"],
    instrument: ["Piano", "Acoustic Guitar", "Violin", "Bass", "Cello", "Drums", "Percussion", "Electric Guitar"],
    vocals: ["No Vocals", "Background Vocals", "Female Vocals", "Lead Vocals", "Vocal Samples", "Male Vocals"]
  };
  
  // Build comprehensive prompt
  const systemPrompt = `You are an expert music analyst. Analyze the track based on its metadata and categorize it using ONLY these specific values:

MOOD options: ${ENVATO_TAXONOMY.mood.join(', ')}
GENRE options: ${ENVATO_TAXONOMY.genre.join(', ')}
THEME options: ${ENVATO_TAXONOMY.theme.join(', ')}
INSTRUMENT options: ${ENVATO_TAXONOMY.instrument.join(', ')}
VOCALS options: ${ENVATO_TAXONOMY.vocals.join(', ')}

Return ONLY a JSON object with this exact structure:
{
  "mood": ["1-3 moods from the list above"],
  "genre": ["1-2 genres from the list above"],
  "theme": ["1-2 themes from the list above"],
  "instrument": ["detected instruments from the list above"],
  "vocals": ["vocal characteristics from the list above"],
  "narrative": "A 40-60 word description of the track's musical character and emotional impact",
  "confidence": 0.0-1.0
}

CRITICAL: Use ONLY the exact values from the lists provided. Return ONLY valid JSON, no other text.`;

  const userPrompt = `Analyze this track:
Title: "${baseName}"
Tempo: ${bpm || 'Unknown'} BPM
Loudness: ${loudness || 'Unknown'} LUFS

Based on the title and technical characteristics, provide your creative analysis.`;

  const payload = JSON.stringify({
    model: 'qwen3:8b',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    stream: false,
    format: 'json',
    options: { 
      temperature: 0.7,
      top_p: 0.9
    }
  });

  return new Promise((resolve) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: 11434,
      path: '/api/chat',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const content = parsed.message?.content;
          
          if (!content) {
            console.log('[CREATIVE] No content in response');
            resolve({ error: true, data: getDefaultCreative() });
            return;
          }
          
          // Parse the JSON response
          const creative = JSON.parse(content);
          
          // Validate against taxonomy
          const validated = {
            mood: (creative.mood || []).filter(m => ENVATO_TAXONOMY.mood.includes(m)),
            genre: (creative.genre || []).filter(g => ENVATO_TAXONOMY.genre.includes(g)),
            theme: (creative.theme || []).filter(t => ENVATO_TAXONOMY.theme.includes(t)),
            instrument: (creative.instrument || []).filter(i => ENVATO_TAXONOMY.instrument.includes(i)),
            vocals: (creative.vocals || []).filter(v => ENVATO_TAXONOMY.vocals.includes(v)),
            narrative: String(creative.narrative || 'No description available').slice(0, 200),
            confidence: Math.min(1, Math.max(0, Number(creative.confidence) || 0.5))
          };
          
          console.log(`[CREATIVE] Analysis complete - Genre: ${validated.genre.join(', ')}, Mood: ${validated.mood.join(', ')}`);
          resolve({ error: false, data: validated });
          
        } catch (e) {
          console.log('[CREATIVE] Failed to parse response:', e.message);
          resolve({ error: true, data: getDefaultCreative() });
        }
      });
    });
    req.on('error', (e) => {
      console.log(`[CREATIVE] Ollama connection failed: ${e.message}`);
      resolve({ error: true, offline: true, data: getDefaultCreative() });
    });
    req.write(payload);
    req.end();
  });
}

function getDefaultCreative() {
  return {
    mood: [],
    genre: [],
    theme: [],
    instrument: [],
    vocals: [],
    narrative: 'Creative analysis unavailable',
    confidence: 0
  };
}

async function analyzeMp3(filePath, win = null) {
  const baseName = path.basename(filePath, path.extname(filePath));
  // Send technical starting event
  if (win) {
    win.webContents.send('jobProgress', {
      trackId: filePath,
      stage: 'technical',
      status: 'PROCESSING',
      note: 'Running technical analysis...'
    });
  }
  const [probe, loudness, hasWav, tempo] = await Promise.all([
    ffprobeJson(filePath),
    ffmpegLoudness(filePath),
    checkWavExists(filePath),
    estimateTempo(filePath)
  ]);
  // Send technical complete, creative starting event
  if (win) {
    win.webContents.send('jobProgress', {
      trackId: filePath,
      stage: 'technical',
      status: 'COMPLETE',
      note: 'Technical analysis complete'
    });
    win.webContents.send('jobProgress', {
      trackId: filePath,
      stage: 'creative',
      status: 'PROCESSING',
      note: 'Starting creative analysis with Ollama...'
    });
  }
  const dir = path.dirname(filePath);
  
  // Run full creative analysis
  const creativeResult = await runCreativeAnalysis(baseName, tempo, loudness?.lufs_integrated);
  const creative = creativeResult.data;
  const creativeStatus = creativeResult.offline 
    ? 'Ollama offline - creative analysis skipped'
    : creativeResult.error
    ? 'Creative analysis error - using defaults'
    : 'Creative analysis complete';
  // Send creative complete event
  if (win) {
    win.webContents.send('jobProgress', {
      trackId: filePath,
      stage: 'creative',
      status: creativeResult.error ? 'ERROR' : 'COMPLETE',
      note: creativeStatus
    });
  }
  
  const analysis = {
    file: path.basename(filePath),
    path: filePath,
    analyzed_at: new Date().toISOString(),
    has_wav_version: hasWav,
    ...probe,
    ...loudness,
    estimated_tempo_bpm: tempo,
    creative: creative,
    creative_status: creativeStatus
  };
  
  // Write JSON
  const jsonPath = path.join(dir, `${baseName}.json`);
  await fs.writeFile(jsonPath, JSON.stringify(analysis, null, 2));
  
  // Write CSV in 2-column format (field name, value)
  const csvPath = path.join(dir, `${baseName}.csv`);
  
  // Format duration as MM:SS
  const formatDuration = (seconds) => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  const csvRows = [
    ['Title', baseName],
    ['File Path', filePath],
    ['Has WAV Version', hasWav ? 'Yes' : 'No'],
    ['Duration (seconds)', analysis.duration_sec || ''],
    ['Sample Rate (Hz)', analysis.sample_rate || ''],
    ['Channels', analysis.channels === 2 ? 'Stereo' : analysis.channels === 1 ? 'Mono' : analysis.channels || ''],
    ['Average Loudness (LUFS)', analysis.lufs_integrated ?? ''],
    ['Estimated Tempo (BPM)', analysis.estimated_tempo_bpm || ''],
    ['', ''],
    ['--- Creative Analysis ---', ''],
    ['Analysis Status', analysis.creative_status || ''],
    ['Genre', (analysis.creative?.genre || []).join(', ')],
    ['Mood', (analysis.creative?.mood || []).join(', ')],
    ['Theme', (analysis.creative?.theme || []).join(', ')],
    ['Instruments', (analysis.creative?.instrument || []).join(', ')],
    ['Vocals', (analysis.creative?.vocals || []).join(', ')],
    ['Description', analysis.creative?.narrative || ''],
    ['Confidence', `${Math.round((analysis.creative?.confidence || 0) * 100)}%`]
  ];
  
  const csvContent = csvRows
    .map(([field, value]) => `${field},"${value}"`)
    .join('\n');
  
  await fs.writeFile(csvPath, csvContent);
  
  return { analysis, jsonPath, csvPath };
}

module.exports = { analyzeMp3 };


