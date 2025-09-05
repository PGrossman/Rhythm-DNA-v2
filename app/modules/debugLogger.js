import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class DebugLogger {
    constructor() {
        this.logPath = path.join(path.dirname(path.dirname(__dirname)), 'debug.log');
        this.stream = null;
        this.initLogFile();
    }

    initLogFile() {
        try {
            this.stream = fs.createWriteStream(this.logPath, { flags: 'w' });
            this.log('================================================================================');
            this.log(`RhythmDNA Debug Log - ${new Date().toISOString()}`);
            this.log('================================================================================');
            console.log(`[DEBUG] Log file: ${this.logPath}`);
        } catch (error) {
            console.error('[DEBUG] Failed to create log:', error);
        }
    }

    log(message, data = null) {
        const timestamp = new Date().toISOString();
        const line = `[${timestamp}] ${message}`;
        if (this.stream) {
            this.stream.write(line + '\n');
            if (data) this.stream.write(JSON.stringify(data, null, 2) + '\n');
        }
        console.log(line, data || '');
    }

    error(message, error) {
        const timestamp = new Date().toISOString();
        const line = `[${timestamp}] ERROR: ${message}`;
        if (this.stream) {
            this.stream.write(line + '\n');
            if (error) this.stream.write(`Stack: ${error.stack || String(error)}\n`);
        }
        console.error(line, error || '');
    }

    close() {
        try {
            this.stream?.end();
        } catch {}
    }
}

export const debugLogger = new DebugLogger();


