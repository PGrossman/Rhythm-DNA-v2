'use strict';

const { probeYamnet } = require('./mediapipe-yamnet.js');
// const { probeZeroShot } = require('./transformers-zero-shot.js'); // Disabled until zero-shot-audio model available

const ZS_LABELS = [
	'Brass section', 'Trumpet', 'Trombone', 'Saxophone',
	'Lead Vocals', 'Male Vocals', 'Female Vocals', 'Background Vocals',
	'Electric Guitar', 'Acoustic Guitar', 'Piano', 'Drum Kit', 'Synth Pad', 'Synth Lead'
];

async function withTimeout(promise, ms, label) {
	let t;
	const timeout = new Promise((_, rej) => {
		t = setTimeout(() => rej(new Error(label + ' timeout')), ms);
	});
	try {
		return await Promise.race([promise, timeout]);
	} finally {
		clearTimeout(t);
	}
}

function orHints(a = {}, b = {}) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    const out = {};
    for (const k of keys) out[k] = Boolean(a[k]) || Boolean(b[k]);
    return out;
}


async function runAudioProbes(filePath, durationSec, baseName = '', opts = {}) {
	// Three-window strategy: Intro (20-30s), Middle (50%), Outro (70%)
	const introLen = Math.min(30, Math.max(20, durationSec / 3));

	let intro = { status: 'skipped' };
	try {
		intro = await withTimeout(
			probeYamnet(filePath, durationSec, { winSec: 10, anchorSec: 17 }),
			15000,
			'ast-intro'
		);
		console.log('[PROBE] Intro labels:', intro.labels?.slice(0, 5));
	} catch (e) {
		intro = { status: 'skipped', error: String(e.message || e) };
	}

	let middle = { status: 'skipped' };
	try {
		middle = await withTimeout(
			probeYamnet(filePath, durationSec, { winSec: 6, centerFrac: 0.50 }),
			12000,
			'ast-middle'
		);
	} catch (e) {
		middle = { status: 'skipped', error: String(e.message || e) };
	}

	let outro = { status: 'skipped' };
	try {
		outro = await withTimeout(
			probeYamnet(filePath, durationSec, { winSec: 6, centerFrac: 0.70 }),
			12000,
			'ast-outro'
		);
	} catch (e) {
		outro = { status: 'skipped', error: String(e.message || e) };
	}

    // Zero-shot disabled - to re-enable use a zero-shot audio model, e.g. 'Xenova/clap-htsat-unfused'

	const hints = orHints(intro.hints, middle.hints, outro.hints);
    // No zero-shot post-processing

	const status = (intro.status === 'ok' || middle.status === 'ok' || outro.status === 'ok') ? 'ok' : 'skipped';
	console.log(`[AUDIO_PROBE] Status: ${status}, Hints:`, hints);
	const labels = {
		intro: (intro.labels || []).slice(0, 10),
		middle: (middle.labels || []).slice(0, 10),
		outro: (outro.labels || []).slice(0, 10)
	};
	return { status, hints, labels, meta: { introLen, windows: ['0-30s', '50%', '70%'] } };
}

module.exports = { runAudioProbes };


