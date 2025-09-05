// DragDrop module - handles file/folder drop events
// Returns absolute paths, no virtual/sandbox URIs

export class DragDrop {
    #dropZone = null;
    #onFilesDropped = null;
    
    constructor() {
        console.log('DragDrop module initialized');
    }
    
    /**
     * Attach drag and drop to an element
     * @param {HTMLElement} element - The drop zone element
     * @param {Function} onFilesDropped - Callback when files are dropped
     */
    attach(element, onFilesDropped) {
        if (!element) {
            console.error('[DragDrop] No element provided');
            return;
        }
        
        this.#dropZone = element;
        this.#onFilesDropped = onFilesDropped;
        
        // Prevent default drag behaviors
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            element.addEventListener(eventName, this.#preventDefaults, false);
            document.body.addEventListener(eventName, this.#preventDefaults, false);
        });
        
        // Highlight drop zone when item is dragged over it
        ['dragenter', 'dragover'].forEach(eventName => {
            element.addEventListener(eventName, () => this.#highlight(), false);
        });
        
        ['dragleave', 'drop'].forEach(eventName => {
            element.addEventListener(eventName, () => this.#unhighlight(), false);
        });
        
        // Handle dropped files
        element.addEventListener('drop', this.#handleDrop.bind(this), false);
        
        console.log('[DragDrop] Attached to element');
    }
    
    #preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    #highlight() {
        if (this.#dropZone) {
            this.#dropZone.classList.add('drag-highlight');
        }
    }
    
    #unhighlight() {
        if (this.#dropZone) {
            this.#dropZone.classList.remove('drag-highlight');
        }
    }
    
    async #handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt?.files;
        
        console.log('[DragDrop] DataTransfer:', {
            files,
            filesLength: files?.length,
            items: dt?.items,
            itemsLength: dt?.items?.length
        });
        
        if (!files || files.length === 0) {
            console.warn('[DragDrop] No files dropped');
            return;
        }
        
        const paths = [];
        
        // Extract paths from dropped files
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            console.log(`[DragDrop] File ${i}:`, {
                name: file?.name,
                path: file?.path,
                size: file?.size,
                type: file?.type,
                lastModified: file?.lastModified
            });
            
            if (file && file.path) {
                paths.push(file.path);
                console.log(`[DragDrop] Added path: ${file.path}`);
            } else if (file && file.name) {
                console.warn(`[DragDrop] File has no path property, using name: ${file.name}`);
                paths.push(file.name);
            }
        }
        
        if (paths.length > 0 && this.#onFilesDropped) {
            console.log(`[DragDrop] Processing ${paths.length} dropped items`);
            this.#onFilesDropped(paths);
        }
    }
    
    detach() {
        if (this.#dropZone) {
            ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
                this.#dropZone.removeEventListener(eventName, this.#preventDefaults);
            });
            console.log('[DragDrop] Detached from element');
        }
    }
}


