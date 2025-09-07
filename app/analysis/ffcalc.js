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
  // Measure loudness on FULL track, original stereo, no resampling
  const args = [
    '-nostats', '-hide_banner', '-i', filePath,
    '-filter:a', 'ebur128=peak=true',
    '-f', 'null', '-'
  ];
  const stderr = await run('ffmpeg', args, { collect: 'stderr' });
  
  // Parse both old and new ffmpeg output formats
  const mI = /(?:I:|Integrated loudness:)\s*(-?\d+(?:\.\d+)?)\s*LUFS/i.exec(stderr);
  const mLRA = /(?:LRA:|Loudness range:)\s*(-?\d+(?:\.\d+)?)\s*LU/i.exec(stderr);
  const mTP = /(?:True peak:|Peak:|TP:)\s*(-?\d+(?:\.\d+)?)\s*dB(?:TP|FS)?/i.exec(stderr);
  
  console.log(`[Loudness] LUFS: ${mI?.[1]}, LRA: ${mLRA?.[1]}, True Peak: ${mTP?.[1]}`);
  
  return {
    lufs_integrated: mI ? Number(mI[1]) : null,
    loudness_range: mLRA ? Number(mLRA[1]) : null,
    true_peak_db: mTP ? Number(mTP[1]) : null
  };
}

async function estimateTempo(filePath) {
  try {
    // Extract 30 seconds of mono PCM from steady part (20-50s)
    const args = [
      '-hide_banner', '-nostats',
      '-ss', '20',
      '-t', '30',
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
          resolve(null);
          return;
        }
        const buffer = Buffer.concat(chunks);
        if (!buffer.length) {
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
          resolve(null);
          return;
        }
        
        // Autocorrelation
        const autocorrMaxLag = Math.floor(envelope.length / 2);
        const autocorr = new Float32Array(autocorrMaxLag);
        for (let lag = 1; lag < autocorrMaxLag; lag++) {
          let sum = 0;
          for (let i = 0; i < envelope.length - lag; i++) {
            sum += envelope[i] * envelope[i + lag];
          }
          autocorr[lag] = sum / (envelope.length - lag);
        }
        
        // Find best lag in 60-200 BPM
        const sampleRate = 11025;
        const hopRate = sampleRate / hopSize;
        const minLagBpm = Math.floor(hopRate * 60 / 200);
        const maxLagBpm = Math.floor(hopRate * 60 / 60);
        let bestLag = -1;
        let bestValue = -Infinity;
        for (let lag = Math.max(1, minLagBpm); lag <= maxLagBpm && lag < autocorr.length; lag++) {
          const val = autocorr[lag];
          if (val > bestValue) {
            bestValue = val;
            bestLag = lag;
          }
        }
        if (bestLag <= 0) {
          resolve(null);
          return;
        }
        let bpm = 60 * hopRate / bestLag;
        // Octave correction into 80-200 BPM
        while (bpm < 80) bpm *= 2;
        while (bpm > 200) bpm /= 2;
        const rounded = Math.round(bpm);
        console.log(`[BPM] Detected tempo: ${rounded} BPM`);
        resolve(rounded);
      });
      cp.on('error', () => resolve(null));
    });
  } catch {
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

// Simple Ollama test function
async function testOllamaCreative(baseName, bpm) {
  console.log('[CREATIVE] Testing Ollama connection...');
  const payload = JSON.stringify({
    model: 'qwen3:8b',
    messages: [
      {
        role: 'user',
        content: `Given a song titled "${baseName}" with tempo ${bpm || 'unknown'} BPM, suggest ONE music genre in a single word. Reply with only the genre word, nothing else.`
      }
    ],
    stream: false,
    options: { temperature: 0.5 }
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
          const genre = parsed.message?.content?.trim() || 'Unknown';
          console.log(`[CREATIVE] Ollama responded with genre: ${genre}`);
          resolve(genre);
        } catch {
          console.log('[CREATIVE] Failed to parse Ollama response');
          resolve('Error');
        }
      });
    });
    req.on('error', (e) => {
      console.log(`[CREATIVE] Ollama connection failed: ${e.message}`);
      resolve('Offline');
    });
    req.write(payload);
    req.end();
  });
}

async function analyzeMp3(filePath) {
  const [probe, loudness, hasWav, tempo] = await Promise.all([
    ffprobeJson(filePath),
    ffmpegLoudness(filePath),
    checkWavExists(filePath),
    estimateTempo(filePath)
  ]);
  
  const baseName = path.basename(filePath, path.extname(filePath));
  const dir = path.dirname(filePath);
  
  // Test Ollama creative analysis (simple genre guess)
  const creativeGenre = await testOllamaCreative(baseName, tempo);
  const creativeStatus = creativeGenre === 'Offline'
    ? 'Ollama offline - creative analysis skipped'
    : creativeGenre === 'Error'
    ? 'Creative analysis error'
    : `Creative analysis OK - Genre: ${creativeGenre}`;
  
  const analysis = {
    file: path.basename(filePath),
    path: filePath,
    analyzed_at: new Date().toISOString(),
    has_wav_version: hasWav,
    ...probe,
    ...loudness,
    estimated_tempo_bpm: tempo,
    creative_test: creativeStatus,
    creative_genre: creativeGenre
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
    ['Average Loudness (LUFS)', analysis.lufs_integrated || ''],
    ['Estimated Tempo (BPM)', analysis.estimated_tempo_bpm || ''],
    ['', ''],
    ['--- Creative Analysis Test ---', ''],
    ['Status', analysis.creative_test || 'Not run'],
    ['Genre (Test)', analysis.creative_genre || ''],
    ['Mood Tags', 'Coming soon'],
    ['Instruments Detected', 'Coming soon'],
    ['Narrative Description', 'Coming soon']
  ];
  
  const csvContent = csvRows
    .map(([field, value]) => `${field},"${value}"`)
    .join('\n');
  
  await fs.writeFile(csvPath, csvContent);
  
  return { analysis, jsonPath, csvPath };
}

module.exports = { analyzeMp3 };


