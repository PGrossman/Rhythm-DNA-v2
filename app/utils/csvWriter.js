// CommonJS module that decides if CSV artifacts should be written.
// Honors environment variables first, then settings flags.
// Usage: const { shouldWriteCsv } = require('../utils/csvWriter');

function truthyEnv(name) {
  const v = process.env[name];
  if (v === undefined) return undefined;
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function shouldWriteCsv(settings) {
  // Highest priority: explicit env flags
  const envOn  = truthyEnv('RNA_WRITE_CSV') ?? truthyEnv('RHYTHMRNA_WRITE_CSV');
  const envOff = (process.env.RNA_WRITE_CSV === '0' || process.env.RHYTHMRNA_WRITE_CSV === '0');
  if (envOn === true) return true;
  if (envOff === true) return false;

  // Next: settings flags (multiple historical locations)
  if (settings) {
    // Common flags
    if (settings.writeCsv === true) return true;
    if (settings.writeCsvArtifacts === true) return true;                // ← honor current app setting
    // Nested artifact objects (legacy / alt spellings)
    if (settings?.artifacts?.csv === true) return true;
    if (settings?.artifacts?.writeCsv === true) return true;
    if (settings?.artifacts?.writeCsvArtifacts === true) return true;    // ← alternate nested key
  }

  return false;
}

module.exports = { shouldWriteCsv };