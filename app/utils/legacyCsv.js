'use strict';

// Escape a single CSV field with RFC4180-style quoting
function q(v) {
  if (v === null || v === undefined) return '""';
  const s = String(v).replace(/"/g, '""');
  return `"${s}"`;
}

function isNum(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

function fmt3(n) {
  return isNum(n) ? n.toFixed(3) : '';
}

function buildLegacyCsv({ instruments, tempo }) {
  // Header matches the legacy, approved schema
  const header = 'Instrument,Source,Confidence,Tempo,SpanStart,SpanEnd\n';

  const t = isNum(tempo) ? String(Math.round(tempo)) : '';

  // Stable ordering: by SpanStart asc (missing at end), then by Confidence desc, then by Instrument name
  const rows = (Array.isArray(instruments) ? instruments : [])
    .slice()
    .sort((a, b) => {
      const aStart = isNum(a?.span?.[0]) ? a.span[0] : Infinity;
      const bStart = isNum(b?.span?.[0]) ? b.span[0] : Infinity;
      if (aStart !== bStart) return aStart - bStart;
      const bc = (b?.confidence ?? 0) - (a?.confidence ?? 0);
      if (bc !== 0) return bc;
      return String(a?.name ?? '').localeCompare(String(b?.name ?? ''));
    })
    .map((inst) => {
      const name = q(inst?.name ?? '');
      const src  = q(inst?.source ?? '');
      const conf = isNum(inst?.confidence) ? (inst.confidence).toFixed(3) : '';
      const s0   = isNum(inst?.span?.[0]) ? fmt3(inst.span[0]) : '';
      const s1   = isNum(inst?.span?.[1]) ? fmt3(inst.span[1]) : '';
      // Tempo is repeated on each row per legacy files
      return [name, src, conf, t, s0, s1].join(',') + '\n';
    })
    .join('');

  return header + rows;
}

module.exports = { buildLegacyCsv };


