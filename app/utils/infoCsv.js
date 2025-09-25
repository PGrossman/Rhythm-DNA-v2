'use strict';
const fs = require('fs');
const path = require('path');

/**
 * Build and write the legacy "info CSV" (2-column) alongside the source audio.
 * This is lifted directly from ffcalc.js original implementation.
 * @param {Object} ctx - merged track context { source, technical, creative, instrumentation, versions }
 * @param {string} audioPath - absolute path to source audio
 * @param {Object} db - database object with tracks array
 * @param {number} idx - track index in database
 * @param {string} dbFolder - database folder path
 */
function writeInfoCsv(ctx, audioPath, db = null, idx = null, dbFolder = null) {
  if (!audioPath) return;
  const dir = path.dirname(audioPath);
  const base = path.basename(audioPath).replace(/\.[^.]+$/, '');
  const csvPath = path.join(dir, `${base}.csv`);

  const { source, technical, creative, instrumentation, versions } = ctx || {};
  
  // 1) Pull from the fully merged DB record (richer than locals)
  const tr = (db && Array.isArray(db.tracks) && db.tracks[idx]) ? db.tracks[idx] : {};
  const trSource = tr.source || source || {};
  const trTech   = tr.technical || technical || {};
  const trCreative = tr.creative || creative || {};
  const trInstr  = tr.instrumentation || instrumentation || {};
  const trVers   = tr.versions || versions || {};

  // Use the richest merged record (post-upsert) so fields are populated
  // No need for log hydration since we're using the fully merged DB record
  const id3        = trTech.id3 || {};
  const durSec     = trTech.duration_sec ?? trTech.duration ?? '';
  const sampleRate = trTech.sample_rate ?? '';
  const channels   = trTech.channels;
  const estBpm     = (trTech.bpm ?? trTech.estimated_tempo_bpm) ?? '';
  const tempoConf  = trTech.tempo_confidence ?? '';
  const altHalf    = trTech.alt_bpm_half ?? '';
  const altDbl     = trTech.alt_bpm_double ?? '';
  const tempoSrc   = trTech.tempo_source || '';
  const bpmDiff    = trTech.bpm_diff || '';
  const hasWav     = Boolean(trVers && (trVers.hasWav || trVers.wav));
  
  const artistList = Array.isArray(trCreative.artists) ? trCreative.artists.join(', ') : (id3.artist || '');
  const genreList  = Array.isArray(trCreative.genre) ? trCreative.genre.join(', ')
                    : (Array.isArray(id3.genre) ? id3.genre.join(', ') : (id3.genre || ''));
  const moodList   = Array.isArray(trCreative.mood) ? trCreative.mood.join(', ') : '';
  const themeList  = Array.isArray(trCreative.theme) ? trCreative.theme.join(', ') : '';
  const vocalsList = Array.isArray(trCreative.vocals) ? trCreative.vocals.join(', ') : '';
  const instrumentsList =
    Array.isArray(trCreative.suggestedInstruments) ? trCreative.suggestedInstruments.join(', ')
    : (Array.isArray(trInstr.instruments)
        ? trInstr.instruments.map(i => (i && i.name) ? i.name : (typeof i === 'string' ? i : ''))
                          .filter(Boolean).join(', ')
        : '');
  const creativeSum  = trCreative.narrative || '';
  const creativeConf = (trCreative.confidence != null) ? (Math.round(trCreative.confidence * 100) + '%') : '';

  // Original 2-column CSV rows (Field, Value)
  const rows = [
    ['Title', base],
    ['', ''],
    ['--- ID3 Tags ---', ''],
    ['Track Title', id3.title || ''],
    ['Artist', artistList || ''],
    ['Album', id3.album || ''],
    ['Year', id3.year || ''],
    ['Tagged Genre', (Array.isArray(id3.genre) ? id3.genre.join(', ') : (id3.genre || ''))],
    ['Tagged BPM', id3.bpm || ''],
    ['File Path', trSource.filePath || audioPath],
    ['Has WAV Version', hasWav ? 'Yes' : 'No'],
    ['Duration (seconds)', durSec || ''],
    ['Sample Rate (Hz)', sampleRate || ''],
    ['Channels', channels === 2 ? 'Stereo' : (channels === 1 ? 'Mono' : (channels || ''))],
    ['Estimated BPM', estBpm],
    ['Tempo Confidence (0–1)', tempoConf],
    ['Alt BPM (½×)', altHalf],
    ['Alt BPM (2×)', altDbl],
    ['Tempo Source', tempoSrc],
    ['BPM Difference', bpmDiff],
    ['Audio Detection', instrumentsList || 'None'],
    ['Run ID', (trTech && trTech.__run_id) || (trCreative && trCreative.__run_id) || ''],
    ['', ''],
    ['--- Creative Analysis ---', ''],
    ['Instruments', instrumentsList],
    ['Vocals', vocalsList],
    ['Lyric Themes', Array.isArray(trCreative.lyricThemes) ? trCreative.lyricThemes.join(', ') : ''],
    ['Description', creativeSum],
    ['Confidence', creativeConf]
  ];

  const csvContent = rows
    .map(([field, value]) => `${field},"${String(value).replace(/"/g, '""')}"`)
    .join('\n');
  
  fs.writeFileSync(csvPath, csvContent, 'utf8');
  console.log('[CSV] Wrote:', csvPath);
}

module.exports = { writeInfoCsv };
