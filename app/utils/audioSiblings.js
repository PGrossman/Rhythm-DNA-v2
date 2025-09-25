const fs = require('fs');
const path = require('path');

/**
 * Check if an audio file has an MP3 twin
 * @param {string} p - Path to audio file
 * @returns {boolean} - True if MP3 twin exists
 */
function hasMp3Twin(p) {
  const stem = path.parse(p).name;
  const mp3 = path.join(path.dirname(p), `${stem}.mp3`);
  return fs.existsSync(mp3);
}

/**
 * Determine if waveform should be generated for this audio file
 * Implements MP3-twin rule: skip WAV if MP3 twin exists
 * @param {string} p - Path to audio file
 * @returns {boolean} - True if waveform should be generated
 */
function shouldGenerateWaveformFor(p) {
  const ext = path.extname(p).toLowerCase();
  return !(ext === '.wav' && hasMp3Twin(p));
}

module.exports = { 
  shouldGenerateWaveformFor,
  hasMp3Twin
};