// Simple renderer without module imports - modules are for main process only
console.log('Renderer initialized');

const panel = document.getElementById('panel');

const views = {
    analysis: `
        <div style="padding: 24px;">
            <h2 style="margin: 0 0 24px 0; font-size: 24px; font-weight: 600;">Audio Analysis Queue</h2>
            <div id="drop-zone" style="
                border: 2px dashed #ccc;
                border-radius: 8px;
                padding: 80px 20px;
                text-align: center;
                background: #fafafa;
                cursor: pointer;
                transition: border-color 0.2s ease;
            ">
                <div style="margin-bottom: 16px; font-size: 48px; opacity: 0.6;">📁</div>
                <div style="font-size: 18px; color: #333; margin-bottom: 8px;">Drop audio folder here</div>
                <div style="font-size: 14px; color: #666;">Supports MP3 and WAV files with recursive folder scanning</div>
            </div>
            <div id="queue-section" style="display: none; margin-top: 24px;">
                <div id="file-table"></div>
                <div id="action-buttons" style="margin-top: 16px;">
                    <button id="start-analysis-btn" style="background: #4CAF50; color: white; border: none; padding: 10px 20px; border-radius: 4px; margin-right: 8px; cursor: pointer;">Start Analysis</button>
                    <button id="clear-queue-btn" style="background: #666; color: white; border: none; padding: 10px 20px; border-radius: 4px; margin-right: 8px; cursor: pointer;">Clear Queue</button>
                    <button id="update-db-btn" style="background: #2196F3; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; display: none;">Update Database</button>
                </div>
            </div>
            <div id="empty-state" style="margin-top: 40px; text-align: center; color: #666; font-size: 16px;">
                No files in queue. Drop audio folders above to add files.
            </div>
        </div>
    `,
    search: '<div style="padding: 24px;"><h2>Search</h2><p>Search functionality will be implemented here.</p></div>',
    settings: '<div style="padding: 24px;"><h2>Settings</h2><p>Settings will be implemented here.</p></div>'
};

function setView(name) {
    panel.innerHTML = views[name] || '';
    
    // Initialize Analysis page functionality
    if (name === 'analysis') {
        initializeAnalysisPage();
    }
}

function initializeAnalysisPage() {
    const dropZone = document.getElementById('drop-zone');
    const queueSection = document.getElementById('queue-section');
    const emptyState = document.getElementById('empty-state');
    
    if (!dropZone) return;
    
    // Drop zone hover effects
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = '#007AFF';
        dropZone.style.backgroundColor = '#f0f8ff';
    });
    
    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = '#ccc';
        dropZone.style.backgroundColor = '#fafafa';
    });
    
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = '#ccc';
        dropZone.style.backgroundColor = '#fafafa';
        
        // Handle dropped files/folders
        const files = Array.from(e.dataTransfer.files);
        const paths = files.map(file => file.path).filter(path => path);
        
        if (paths.length > 0) {
            console.log('Files dropped:', paths);
            handleDroppedFiles(paths);
        }
    });
    
    // Button handlers
    document.getElementById('start-analysis-btn')?.addEventListener('click', () => {
        console.log('Start Analysis clicked');
        if (window.electronAPI) {
            window.electronAPI.startAnalysis({});
        }
    });
    
    document.getElementById('clear-queue-btn')?.addEventListener('click', () => {
        console.log('Clear Queue clicked');
        if (window.electronAPI) {
            window.electronAPI.clearQueue();
        }
        showEmptyState();
    });
    
    document.getElementById('update-db-btn')?.addEventListener('click', () => {
        console.log('Update Database clicked');
        if (window.electronAPI) {
            window.electronAPI.updateDatabase();
        }
    });
}

async function handleDroppedFiles(paths) {
    try {
        if (window.electronAPI) {
            const result = await window.electronAPI.scanDropped(paths);
            console.log('Scan result:', result);
            
            if (result && result.tracks && result.tracks.length > 0) {
                showQueueWithFiles(result.tracks);
            } else {
                showEmptyState();
            }
        }
    } catch (error) {
        console.error('Error scanning dropped files:', error);
        showEmptyState();
    }
}

function showQueueWithFiles(tracks) {
    const queueSection = document.getElementById('queue-section');
    const emptyState = document.getElementById('empty-state');
    
    if (tracks.length > 0) {
        queueSection.style.display = 'block';
        emptyState.style.display = 'none';
        
        // Populate file table with tracks
        const fileTable = document.getElementById('file-table');
        fileTable.innerHTML = `
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
                <thead>
                    <tr style="background: #f5f5f5;">
                        <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">File Name</th>
                        <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Technical Analysis</th>
                        <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Creative Analysis</th>
                    </tr>
                </thead>
                <tbody>
                    ${tracks.map(track => `
                        <tr>
                            <td style="padding: 8px; border-bottom: 1px solid #eee;">${track.fileName || 'Unknown'}</td>
                            <td style="padding: 8px; border-bottom: 1px solid #eee;">QUEUED</td>
                            <td style="padding: 8px; border-bottom: 1px solid #eee;">QUEUED</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    } else {
        showEmptyState();
    }
}

function showEmptyState() {
    const queueSection = document.getElementById('queue-section');
    const emptyState = document.getElementById('empty-state');
    
    queueSection.style.display = 'none';
    emptyState.style.display = 'block';
}

// Tab navigation
document.getElementById('tab-analysis-btn')?.addEventListener('click', () => setView('analysis'));
document.getElementById('tab-search-btn')?.addEventListener('click', () => setView('search'));
document.getElementById('tab-settings-btn')?.addEventListener('click', () => setView('settings'));

// Initialize with Analysis tab
setView('analysis');