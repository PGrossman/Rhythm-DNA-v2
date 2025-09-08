'use strict';

const { spawn } = require('node:child_process');

// Dynamic import for MediaPipe (ESM module)
async function loadMediaPipe() {
	const { FilesetResolver, AudioClassifier } = await import('@mediapipe/tasks-audio');
	return { FilesetResolver, AudioClassifier };
}

function ffmpegDecodeToF32(filePath, startSec, durSec) {
	return new Promise((resolve, reject) => {
		const args = [
			'-ss', String(startSec),
			'-t', String(durSec),
			'-i', filePath,
			'-ac', '1', '-ar', '16000',
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
			resolve(new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4));
		});
	});
}

function pick(haystack, ...needles) {
	const set = new Set(haystack.map(s => String(s).toLowerCase()));
	return needles.some(n => set.has(String(n).toLowerCase()));
}

async function probeYamnet(filePath, durationSec, opts = {}) {
	try {
		const winSec = opts.winSec ?? 5;
		const centerFrac = opts.centerFrac ?? 0.35;
		const start = Math.max(0, Math.min(Math.max(0, durationSec - winSec), durationSec * centerFrac - winSec / 2));

		// Load MediaPipe dynamically
		const { FilesetResolver, AudioClassifier } = await loadMediaPipe();
		// Load WASM runtime + YAMNet model
		const fileset = await FilesetResolver.forAudioTasks(
			'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-audio/wasm'
		);
		const classifier = await AudioClassifier.createFromModelPath(
			fileset,
			'https://storage.googleapis.com/mediapipe-models/audio_classifier/yamnet/float32/1/yamnet.tflite'
		);

		const pcm = await ffmpegDecodeToF32(filePath, start, winSec);
		// Pass explicit sample rate to avoid resampling issues
		const result = await classifier.classify(pcm, 16000);
		const cats = (result?.classifications?.[0]?.categories || [])
						.filter(c => (c.score ?? 0) >= 0.12)
						.map(c => c.categoryName);

		const hints = {
			vocals:    pick(cats, 'vocal music', 'singing', 'speech', 'singer', 'choir'),
			choir:     pick(cats, 'choir'),
			brass:     pick(cats, 'brass instrument', 'horn', 'saxophone', 'trumpet', 'trombone'),
			trumpet:   pick(cats, 'trumpet'),
			trombone:  pick(cats, 'trombone'),
			saxophone: pick(cats, 'saxophone'),
			drumkit:   pick(cats, 'drum', 'drum kit', 'snare drum', 'cymbal'),
			guitar:    pick(cats, 'electric guitar', 'acoustic guitar', 'guitar'),
			piano:     pick(cats, 'piano', 'keyboard')
		};

		return { status: 'ok', hints, labels: cats, meta: { startSec: start, winSec } };
	} catch (e) {
		console.log('[YAMNET] Error:', e.message);
		return { status: 'skipped', error: e.message };
	}
}

// Probe a specific [start, start+dur] window for early/intro analysis
async function probeYamnetRange(filePath, startSec, durSec) {
    try {
        const { FilesetResolver, AudioClassifier } = await loadMediaPipe();
        const fileset = await FilesetResolver.forAudioTasks(
            'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-audio/wasm'
        );
        const classifier = await AudioClassifier.createFromModelPath(
            fileset,
            'https://storage.googleapis.com/mediapipe-models/audio_classifier/yamnet/float32/1/yamnet.tflite'
        );
        const pcm = await ffmpegDecodeToF32(filePath, startSec, durSec);
        const result = await classifier.classify(pcm, 16000);
        const cats = (result?.classifications?.[0]?.categories || [])
                        .filter(c => (c.score ?? 0) >= 0.10)
                        .map(c => c.categoryName);
        const hints = {
            vocals:    pick(cats, 'vocal music', 'singing', 'speech', 'singer', 'choir'),
            choir:     pick(cats, 'choir'),
            brass:     pick(cats, 'brass instrument', 'horn', 'saxophone', 'trumpet', 'trombone'),
            trumpet:   pick(cats, 'trumpet'),
            trombone:  pick(cats, 'trombone'),
            saxophone: pick(cats, 'saxophone'),
            drumkit:   pick(cats, 'drum', 'drum kit', 'snare drum', 'cymbal'),
            guitar:    pick(cats, 'electric guitar', 'acoustic guitar', 'guitar'),
            piano:     pick(cats, 'piano', 'keyboard')
        };
        return { status: 'ok', hints, labels: cats, meta: { startSec, winSec: durSec } };
    } catch (e) {
        console.log('[YAMNET-RANGE] Error:', e.message);
        return { status: 'skipped', error: e.message };
    }
}

module.exports = { probeYamnet, probeYamnetRange };


