const fs = require('fs');
const path = require('path');

function guessJsonPathFromAudio(audioPath) {
  if (!audioPath) return null;
  const dir = path.dirname(audioPath);
  const base = path.basename(audioPath).replace(/\.[^.]+$/, '');
  return path.join(dir, `${base}.json`);
}

function readJsonSafe(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

module.exports.fromAudioPath = function fromAudioPath(audioPath) {
  const p = guessJsonPathFromAudio(audioPath);
  return readJsonSafe(p);
};
