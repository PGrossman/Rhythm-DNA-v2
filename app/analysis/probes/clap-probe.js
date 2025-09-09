'use strict';
const path = require('node:path');
const { spawn } = require('node:child_process');

let clapPipe = null;

function ffmpegToF32(filePath, startSec, durSec, sr = 48000) {
	return new Promise((resolve, reject) => {
		const args = [
			'-ss', String(startSec),
			'-t', String(durSec),
			'-i', filePath,
			'-ac', '1',
			'-ar', String(sr),
			'-f', 'f32le',
			'-hide_banner', '-loglevel', 'error',
			'pipe:1'
		];
		const p = spawn('ffmpeg', args, { stdio: ['ignore','pipe','pipe'] });
		const chunks = [];
		let err = '';
		p.stdout.on('data', d => chunks.push(d));
		p.stderr.on('data', d => err += d.toString());
		p.on('close', (code) => {
			if (code !== 0) return reject(new Error(err.trim() || 'ffmpeg failed'));
			const buf = Buffer.concat(chunks);
			const array = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
			resolve({ array, sampling_rate: sr });
		});
	});
}

async function ensureCLAP() {
	if (clapPipe) return clapPipe;
	const { env, pipeline } = await import('@xenova/transformers');

	const modelsDir = path.resolve(process.cwd(), 'app', 'models', 'xenova');
	env.cacheDir = modelsDir;
	env.localModelPath = modelsDir;
	env.allowLocalModels = true;
	env.allowRemoteModels = false;

	try {
		clapPipe = await pipeline(
			'zero-shot-audio-classification',
			'Xenova/clap-htsat-unfused',
			{ quantized: false, dtype: 'fp32' }
		);
		console.log('[CLAP] Loaded from local cache');
		return clapPipe;
	} catch (e) {
		console.log('[CLAP] Load failed:', e.message);
		console.log('[CLAP] Run: npm run warm-clap');
		return null;
	}
}

const LABELS = [
	'brass section','trumpet','trombone','saxophone',
	'violin','cello','double bass','string section',
	'piano','organ','keyboard','accordion',
	'electric guitar','acoustic guitar','bass guitar','banjo','ukulele',
	'drums','drum kit','percussion',
	'flute','clarinet','harmonica',
	'bells','harp','synthesizer','vocals'
];

function toHints(scores) {
	const get = (k) => (scores[k] ?? 0);
	return {
		brass: Math.max(get('brass section'), get('trumpet'), get('trombone')) >= 0.15,
		trumpet: get('trumpet') >= 0.15,
		trombone: get('trombone') >= 0.15,
		saxophone: get('saxophone') >= 0.15,
		strings: Math.max(get('violin'), get('cello'), get('string section')) >= 0.15,
		violin: get('violin') >= 0.15,
		cello: get('cello') >= 0.15,
		piano: get('piano') >= 0.15,
		organ: get('organ') >= 0.15,
		keyboard: get('keyboard') >= 0.15,
		accordion: get('accordion') >= 0.15,
		guitar: Math.max(get('electric guitar'), get('acoustic guitar')) >= 0.15,
		bass: Math.max(get('bass guitar'), get('double bass')) >= 0.15,
		banjo: get('banjo') >= 0.15,
		ukulele: get('ukulele') >= 0.15,
		drumkit: Math.max(get('drums'), get('drum kit')) >= 0.15,
		percussion: get('percussion') >= 0.15,
		flute: get('flute') >= 0.15,
		clarinet: get('clarinet') >= 0.15,
		harmonica: get('harmonica') >= 0.15,
		bells: get('bells') >= 0.15,
		harp: get('harp') >= 0.15,
		synth: get('synthesizer') >= 0.15,
		vocals: get('vocals') >= 0.15
	};
}

async function probeCLAP(filePath, durationSec, opts = {}) {
	try {
		const pipe = await ensureCLAP();
		if (!pipe) return { status: 'skipped', error: 'no CLAP' };

		const winSec = opts.winSec ?? 8;
		const centerFrac = opts.centerFrac ?? 0.5;
		const center = Math.max(0, Math.min(durationSec, centerFrac * durationSec));
		const start = Math.max(0, Math.min(durationSec - winSec, center - winSec / 2));

		const { array, sampling_rate } = await ffmpegToF32(filePath, start, winSec, 48000);

		// Pass audio and labels as separate params
		const out = await pipe(
			array,
			LABELS,
			{ hypothesis_template: 'This is a sound of {}.' }
		);

		const scores = Object.fromEntries(out.map(x => [String(x.label).toLowerCase(), Number(x.score)]));
		const topLabels = out.slice(0, 10).map(x => `${x.label}:${x.score.toFixed(3)}`);
		console.log('[CLAP] Top scores:', topLabels.join(', '));
		const hints = toHints(scores);
		return { status: 'ok', hints, labels: out.map(x => x.label), scores, meta: { startSec: start, winSec } };
	} catch (e) {
		console.log('[CLAP] Error:', e.message);
		return { status: 'skipped', error: e.message };
	}
}

module.exports = { probeCLAP };


