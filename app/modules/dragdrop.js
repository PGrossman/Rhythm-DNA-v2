// DragDrop module - handles file/folder drop events
// Returns absolute paths using webkitGetAsEntry API

export class DragDrop {
    constructor() {
        console.log('[DragDrop] Module initialized');
        this.dropZone = null;
    }
    
    setupDropZone(element) {
        if (!element) {
            console.error('[DragDrop] No element provided');
            return;
        }
        
        this.dropZone = element;
        
        // Prevent default drag behaviors
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            this.dropZone.addEventListener(eventName, this.preventDefaults, false);
            document.body.addEventListener(eventName, this.preventDefaults, false);
        });
        
        // Highlight
        ['dragenter', 'dragover'].forEach(eventName => {
            this.dropZone.addEventListener(eventName, () => {
                this.dropZone.classList.add('drag-over');
            }, false);
        });
        ['dragleave', 'drop'].forEach(eventName => {
            this.dropZone.addEventListener(eventName, () => {
                this.dropZone.classList.remove('drag-over');
            }, false);
        });
        
        // Handle drop
        this.dropZone.addEventListener('drop', async (e) => {
            await this.handleDrop(e);
        }, false);
    }
    
    preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    async handleDrop(e) {
        const items = e.dataTransfer.items;
        const paths = [];
        console.log('[DragDrop] Processing', items?.length || 0, 'dropped items');
        if (!items) return;
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.kind === 'file') {
                const entry = item.webkitGetAsEntry?.();
                if (entry) {
                    if (entry.isFile) {
                        const filePath = await this.getFilePath(entry);
                        if (filePath) {
                            paths.push(filePath);
                            console.log('[DragDrop] Added file:', filePath);
                        }
                    } else if (entry.isDirectory) {
                        const dirPaths = await this.scanDirectory(entry);
                        paths.push(...dirPaths);
                        console.log('[DragDrop] Added', dirPaths.length, 'files from directory');
                    }
                }
            }
        }
        console.log('[DragDrop] Total paths collected:', paths.length);
        if (paths.length > 0) {
            const result = await window.api.scanDropped(paths);
            const tracks = result?.tracks || [];
            console.log('[DragDrop] Main returned:', tracks.length, 'tracks');
            this.dropZone.dispatchEvent(new CustomEvent('filesDropped', { detail: { tracks } }));
        }
    }
    
    async getFilePath(fileEntry) {
        return new Promise((resolve) => {
            fileEntry.file((file) => {
                const fullPath = file.webkitRelativePath || fileEntry.fullPath || file.name;
                resolve(fullPath);
            }, () => resolve(null));
        });
    }
    
    async scanDirectory(dirEntry) {
        const paths = [];
        const reader = dirEntry.createReader();
        return new Promise((resolve) => {
            const readEntries = () => {
                reader.readEntries(async (entries) => {
                    if (!entries || entries.length === 0) {
                        resolve(paths);
                        return;
                    }
                    for (const entry of entries) {
                        if (entry.isFile) {
                            const p = await this.getFilePath(entry);
                            if (p) paths.push(p);
                        } else if (entry.isDirectory) {
                            const sub = await this.scanDirectory(entry);
                            paths.push(...sub);
                        }
                    }
                    readEntries();
                }, () => resolve(paths));
            };
            readEntries();
        });
    }
}


