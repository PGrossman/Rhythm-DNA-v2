'use strict';

const { probeYamnet } = require('./mediapipe-yamnet.js');
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

async function runAudioProbes(filePath, durationSec, baseName = '', opts = {}) {
	const winSec = opts.winSec ?? 5;
	const centerFrac = opts.centerFrac ?? 0.35;
	const timeouts = { yamnet: 3000, zshot: 2000 };

	let yam = { status: 'skipped' };
	try {
		yam = await withTimeout(
			probeYamnet(filePath, durationSec, { winSec, centerFrac }),
			timeouts.yamnet,
			'yamnet'
		);
	} catch (e) {
		yam = { status: 'skipped', error: String(e.message || e) };
	}

	let zsa = { status: 'skipped' };
	if (baseName) {
		try {
			const description = `A music track titled "${baseName}"`;
			zsa = await withTimeout(
				probeZeroShot(description, ZS_LABELS),
				timeouts.zshot,
				'zero-shot'
			);
		} catch (e) {
			zsa = { status: 'skipped', error: String(e.message || e) };
		}
	}

	const hints = Object.assign({}, yam.hints || {});
	if (zsa.scores) {
		const s = zsa.scores;
		const gt = (k, thr) => (s[k] && s[k] >= thr);
		if (!hints.brass && (gt('Brass section', 0.6) || gt('Trumpet', 0.6) || gt('Trombone', 0.6))) hints.brass = true;
		if (!hints.vocals && (gt('Lead Vocals', 0.5) || gt('Male Vocals', 0.5) || gt('Female Vocals', 0.5))) hints.vocals = true;
	}

	const status = (yam.status === 'ok' || zsa.status === 'ok') ? 'ok' : 'skipped';
	console.log(`[AUDIO_PROBE] Status: ${status}, Hints:`, hints);
	return { status, hints, yamnet: yam, zeroshot: zsa, meta: { winSec, centerFrac } };
}

module.exports = { runAudioProbes };


