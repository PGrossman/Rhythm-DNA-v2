// Basic three-tab UI controller; logs module init imports

import { DragDrop } from './modules/dragdrop.js';
import { QueueManager } from './modules/queue.js';
import { TechAnalyzer } from './modules/techAnalyzer.js';
import { CreativeAnalyzer } from './modules/creativeAnalyzer.js';
import { Writers } from './modules/writers.js';
import { DBWriter } from './modules/dbWriter.js';
import { CriteriaDBBuilder } from './modules/criteriaDb.js';
import { SettingsStore } from './modules/settings.js';
import { Logger } from './modules/logger.js';

// Instantiate modules to trigger init logs
const modules = [
    new DragDrop(),
    new QueueManager(),
    new TechAnalyzer(),
    new CreativeAnalyzer(),
    new Writers(),
    new DBWriter(),
    new CriteriaDBBuilder(),
    new SettingsStore(),
    new Logger()
];

const panel = document.getElementById('panel');

const views = {
    search: '<h2>Search</h2><p>Drop files here to analyze.</p>',
    analyze: '<h2>Analyze</h2><p>Queue and processing status will appear here.</p>',
    settings: '<h2>Settings</h2><p>Configure DB folder and options.</p>'
};

const setView = (name) => {
    panel.innerHTML = views[name] || '';
};

document.getElementById('tab-search-btn').addEventListener('click', () => setView('search'));
document.getElementById('tab-analyze-btn').addEventListener('click', () => setView('analyze'));
document.getElementById('tab-settings-btn').addEventListener('click', () => setView('settings'));

// Default view
setView('search');


