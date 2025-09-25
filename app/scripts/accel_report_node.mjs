import fs from "fs";
import os from "os";
import path from "path";

const FIXED_LOG_DIR = "/Volumes/ATOM RAID/Dropbox/_Personal Files/12 - AI Vibe Coding/02 - Cursor Projects/02 - RhythmRNA V3/Logs";

function ensureDirWritable(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
  const probe = path.join(dir, ".write_test");
  fs.writeFileSync(probe, "ok");
  fs.unlinkSync(probe);
}

ensureDirWritable(FIXED_LOG_DIR);

const outJson = path.join(FIXED_LOG_DIR, "accel-report-node.json");
const outTxt  = path.join(FIXED_LOG_DIR, "accel-report-node.txt");
console.log(`[ACCEL] Node report dir: ${FIXED_LOG_DIR}`);

const report = {
  timestamp: new Date().toISOString(),
  host: { platform: os.platform(), arch: os.arch(), node: process.version, electron: process.versions?.electron || null },
  tfjs: {},
  xenova: {}
};

async function run() {
  try {
    const tf = await import('@tensorflow/tfjs');
    report.tfjs.available_backends = tf.engine().registryFactory ? Object.keys(tf.engine().registryFactory) : [];
    report.tfjs.active_backend = tf.getBackend();
  } catch (e) {
    report.tfjs.error = String(e);
  }

  try {
    const { env } = await import('@xenova/transformers');
    report.xenova = {
      backend: env.BACKEND || null,
      WEBGPU: !!env.WEBGPU,
      NUM_THREADS: env.NUM_THREADS || null
    };
  } catch (e) {
    report.xenova.error = String(e);
  }

  fs.writeFileSync(outJson, JSON.stringify(report, null, 2));
  fs.writeFileSync(outTxt, [
    `[ACCEL REPORT - NODE] ${report.timestamp}`,
    `Host: ${report.host.platform}/${report.host.arch} Node ${report.host.node} Electron ${report.host.electron || 'n/a'}`,
    '',
    '[TFJS]',
    JSON.stringify(report.tfjs, null, 2),
    '',
    '[Xenova/transformers]',
    JSON.stringify(report.xenova, null, 2),
    ''
  ].join('\n'));
  console.log(outJson);
}

run();