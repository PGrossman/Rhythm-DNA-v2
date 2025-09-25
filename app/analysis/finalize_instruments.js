/**
 * Finalize Instruments Helper
 * 
 * Provides canonical instrument normalization and deduplication
 * to ensure consistency between JSON and CSV outputs.
 */

const CANON_ALIASES = {
  // add common UI normalizations here (non-destructive)
  "Drum set": "Drum Kit (acoustic)",
  "Drums": "Drum Kit (acoustic)",
  "Electric organ": "Organ",
  "Hammond organ": "Organ",
  "Strings": "Strings (section)",
  "Brass": "Brass (section)",
  "Guitars": "Electric Guitar", // fallback if ever seen
};

function normalize(label) {
  const t = (label || "").trim();
  return CANON_ALIASES[t] || t;
}

export function finalizeInstruments({
  ensembleInstruments = [],
  probeRescues = [],
  additional = [],
} = {}) {
  const merged = [
    ...ensembleInstruments,
    ...probeRescues,
    ...additional,
  ].map(normalize);

  // stable, case-sensitive dedupe + stable order
  const seen = new Set();
  const out = [];
  for (const inst of merged) {
    if (!inst) continue;
    if (!seen.has(inst)) {
      seen.add(inst);
      out.push(inst);
    }
  }

  // Soft guard: drop "Strings (section)" when organ/keyboard are strong and no bowed strings present
  const S = new Set(out);
  const hasStringsSection = S.has("Strings (section)");
  const hasBowed = ["Violin", "Viola", "Cello", "Double Bass"].some(x => S.has(x));
  const hasPads = ["Organ", "Electric organ", "Hammond organ", "Keyboard", "Synth"].some(x => S.has(x));
  if (hasStringsSection && !hasBowed && hasPads) {
    S.delete("Strings (section)");
  }
  const accepted = Array.from(S);

  return accepted;
}

export function buildSourceFlags({ ensembleInstruments = [], probeRescues = [], additional = [] } = {}) {
  return {
    ensemble_count: ensembleInstruments.length,
    probe_rescues_count: probeRescues.length,
    additional_count: additional.length,
    sources: {
      ensemble: ensembleInstruments.length > 0,
      probe_rescues: probeRescues.length > 0,
      additional: additional.length > 0,
    },
  };
}
