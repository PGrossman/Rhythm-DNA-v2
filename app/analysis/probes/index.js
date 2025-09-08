'use strict';

const { probeYamnet, probeYamnetRange } = require('./mediapipe-yamnet.js');
const { probeZeroShot } = require('./transformers-zero-shot.js');

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
	// Three-window strategy: Intro (0-30s), Middle (50%), Outro (70%)
	const introLen = Math.min(30, durationSec / 3);

	let intro = { status: 'skipped' };
	try {
		intro = await withTimeout(
			probeYamnetRange(filePath, 0, introLen),
			4000,
			'yamnet-intro'
		);
		console.log('[PROBE] Intro labels:', intro.labels?.slice(0, 5));
	} catch (e) {
		intro = { status: 'skipped', error: String(e.message || e) };
	}

	let middle = { status: 'skipped' };
	try {
		middle = await withTimeout(
			probeYamnet(filePath, durationSec, { winSec: 5, centerFrac: 0.50 }),
			3000,
			'yamnet-middle'
		);
	} catch (e) {
		middle = { status: 'skipped', error: String(e.message || e) };
	}

	let outro = { status: 'skipped' };
	try {
		outro = await withTimeout(
			probeYamnet(filePath, durationSec, { winSec: 5, centerFrac: 0.70 }),
			3000,
			'yamnet-outro'
		);
	} catch (e) {
		outro = { status: 'skipped', error: String(e.message || e) };
	}

	let zsa = { status: 'skipped' };
	if (baseName) {
		try {
			const description = `A music track titled "${baseName}"`;
			zsa = await withTimeout(
				probeZeroShot(description, ZS_LABELS),
				2000,
				'zero-shot'
			);
		} catch (e) {
			zsa = { status: 'skipped', error: String(e.message || e) };
		}
	}

	const hints = orHints(intro.hints, middle.hints, outro.hints);
	if (zsa.scores) {
		const s = zsa.scores;
		const gt = (k, thr) => (s[k] && s[k] >= thr);
		if (!hints.brass && (gt('Brass section', 0.6) || gt('Trumpet', 0.6) || gt('Trombone', 0.6))) hints.brass = true;
		if (!hints.vocals && (gt('Lead Vocals', 0.5) || gt('Male Vocals', 0.5) || gt('Female Vocals', 0.5))) hints.vocals = true;
	}

	const status = (intro.status === 'ok' || middle.status === 'ok' || outro.status === 'ok' || zsa.status === 'ok') ? 'ok' : 'skipped';
	console.log(`[AUDIO_PROBE] Status: ${status}, Hints:`, hints);
	const labels = {
		intro: (intro.labels || []).slice(0, 10),
		middle: (middle.labels || []).slice(0, 10),
		outro: (outro.labels || []).slice(0, 10)
	};
	return { status, hints, labels, meta: { introLen, windows: ['0-30s', '50%', '70%'] } };
}

module.exports = { runAudioProbes };


