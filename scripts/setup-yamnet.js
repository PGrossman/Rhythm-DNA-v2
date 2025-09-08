#!/usr/bin/env node

const https = require('https');
const fs = require('fs');
const path = require('path');

const YAMNET_MODEL_URL = 'https://storage.googleapis.com/tfjs-models/tfjs/yamnet/tfjs/1.0.0/';
const MODEL_FILES = [
  'model.json',
  'group1-shard1of1.bin'
];

const MODELS_DIR = path.join(__dirname, '..', 'app', 'models', 'yamnet');

console.log('YAMNet Model Setup');
console.log('==================\n');

// Create models directory
if (!fs.existsSync(MODELS_DIR)) {
  fs.mkdirSync(MODELS_DIR, { recursive: true });
  console.log(`✓ Created directory: ${MODELS_DIR}`);
}

// Download file helper
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }
      const totalSize = parseInt(response.headers['content-length'] || '0', 10);
      let downloadedSize = 0;
      response.on('data', (chunk) => {
        downloadedSize += chunk.length;
        if (totalSize > 0) {
          const percent = Math.round((downloadedSize / totalSize) * 100);
          process.stdout.write(`\rDownloading ${path.basename(dest)}: ${percent}%`);
        } else {
          process.stdout.write(`\rDownloading ${path.basename(dest)}: ${Math.round(downloadedSize / 1024)}KB`);
        }
      });
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        console.log(' ✓');
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

// Download YAMNet class names
async function downloadClassNames() {
  const classNamesUrl = 'https://raw.githubusercontent.com/tensorflow/models/master/research/audioset/yamnet/yamnet_class_map.csv';
  const dest = path.join(MODELS_DIR, 'yamnet_classes.csv');
  console.log('\nDownloading YAMNet class names...');
  await downloadFile(classNamesUrl, dest);
  console.log('✓ Class names downloaded');
}

async function setupYamnet() {
  try {
    const modelJsonPath = path.join(MODELS_DIR, 'model.json');
    if (fs.existsSync(modelJsonPath)) {
      console.log('YAMNet model already exists. Checking integrity...');
      let allFilesExist = true;
      for (const file of MODEL_FILES) {
        if (!fs.existsSync(path.join(MODELS_DIR, file))) {
          allFilesExist = false;
          console.log(`✗ Missing: ${file}`);
        }
      }
      if (allFilesExist) {
        console.log('✓ All model files present');
      } else {
        console.log('\nDownloading missing model files...');
        for (const file of MODEL_FILES) {
          const url = YAMNET_MODEL_URL + file;
          const dest = path.join(MODELS_DIR, file);
          if (!fs.existsSync(dest)) await downloadFile(url, dest);
        }
      }
    } else {
      console.log('\nDownloading YAMNet model files...');
      console.log('This may take a few minutes.');
      for (const file of MODEL_FILES) {
        const url = YAMNET_MODEL_URL + file;
        const dest = path.join(MODELS_DIR, file);
        await downloadFile(url, dest);
      }
    }

    await downloadClassNames();

    console.log('\n✓ YAMNet model setup complete!');
    console.log(`Model location: ${MODELS_DIR}`);

    console.log('\nVerifying TensorFlow.js installation...');
    try {
      const tf = require('@tensorflow/tfjs-node');
      console.log(`✓ TensorFlow.js ${tf.version.tfjs} is installed`);

      const modelUri = `file://${path.join(MODELS_DIR, 'model.json')}`;
      console.log('\nTesting model load...');
      const model = await tf.loadGraphModel(modelUri);
      console.log('✓ Model loads successfully');
      console.log(`  Input shape: ${JSON.stringify(model.inputs[0].shape)}`);
      console.log(`  Output shape: ${JSON.stringify(model.outputs[0].shape)}`);
    } catch (tfError) {
      console.error('✗ TensorFlow test failed:', tfError.message);
      console.log('\nThis might be due to Node version incompatibility. Use Node.js v20 or lower.');
    }
  } catch (error) {
    console.error('\n✗ Setup failed:', error.message);
    process.exit(1);
  }
}

setupYamnet()
  .then(() => console.log('\nYAMNet is ready for integration into RhythmDNA!'))
  .catch((e) => { console.error(e); process.exit(1); });
