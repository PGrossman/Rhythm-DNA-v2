'use strict';

// Node-friendly audio classification via @xenova/transformers (AST model)
const path = require('node:path');
const { spawn } = require('node:child_process');
let audioPipe = null;

async function ensureAudioClassifier() {
	if (audioPipe) return audioPipe;
	const { pipeline, env } = await import('@xenova/transformers');
	const cacheDir = path.resolve(process.cwd(), 'app', 'models', 'xenova');
	const repoDir = path.resolve(cacheDir, 'Xenova', 'ast-finetuned-audioset-10-10-0.4593');
	env.cacheDir = cacheDir;
	env.localModelPath = cacheDir;
	env.allowLocalModels = true;
	env.allowRemoteModels = false;
	audioPipe = await pipeline('audio-classification', repoDir);
	console.log('[AUDIO-CLS] Loaded AST from', repoDir);
	return audioPipe;
}

function ffmpegDecodeToTensor(filePath, startSec, durSec, sr = 16000) {
	return new Promise((resolve, reject) => {
		const args = [
			'-ss', String(startSec),
			'-t', String(durSec),
			'-i', filePath,
			'-ac', '1', '-ar', String(sr),
			'-f', 'f32le',
			'-hide_banner', '-loglevel', 'error',
			'pipe:1'
		];
		const p = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
		const chunks = [];
		let err = '';
		p.stdout.on('data', d => chunks.push(d));
		p.stderr.on('data', d => err += d.toString());
		p.on('close', (code) => {
			if (code !== 0) return reject(new Error(err.trim() || 'ffmpeg failed'));
			const buf = Buffer.concat(chunks);
			const f32 = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
			resolve({ array: f32, sampling_rate: sr });
		});
	});
}

function scoreOf(list, name) {
	const n = String(name).toLowerCase();
	return list.find(x => String(x.label).toLowerCase() === n)?.score ?? 0;
}

async function probeYamnet(filePath, durationSec, opts = {}) {
	const winSec = opts.winSec ?? 6;
	const centerFrac = opts.centerFrac ?? 0.35;
	const anchorSec = opts.anchorSec;
	
	const center = (anchorSec != null)
		? Math.max(0, Math.min(durationSec, anchorSec))
		: Math.max(0, Math.min(durationSec, centerFrac * durationSec));
	const start = Math.max(0, Math.min(durationSec - winSec, center - winSec / 2));
	
	try {
		const pipe = await ensureAudioClassifier();
		if (!pipe) return { status: 'skipped', error: 'Pipeline unavailable' };
		
		const input = await ffmpegDecodeToTensor(filePath, start, winSec, 16000);
		const results = await pipe(input);
		const top = results.slice(0, 25);
		
		const s = (n) => scoreOf(top, n);
		const hints = {
			vocals: Math.max(s('Vocal music'), s('Singing'), s('Speech')) >= 0.15,
			brass: Math.max(s('Brass instrument'), s('Trumpet'), s('Trombone'), s('Saxophone')) >= 0.10,
			trumpet: s('Trumpet') >= 0.08,
			trombone: s('Trombone') >= 0.06,
			saxophone: s('Saxophone') >= 0.10,
			drumkit: Math.max(s('Drum kit'), s('Drum'), s('Snare drum')) >= 0.14,
			guitar: Math.max(s('Electric guitar'), s('Acoustic guitar')) >= 0.14,
			piano: s('Piano') >= 0.14
		};
		
		return {
			status: 'ok',
			hints,
			labels: top.map(x => x.label),
			scores: top,
			meta: { startSec: start, winSec }
		};
	} catch (e) {
		console.log('[YAMNET] Error:', e.message);
		return { status: 'skipped', error: e.message };
	}
}

module.exports = { probeYamnet };
