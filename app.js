// Application State
let pdfDoc = null;
let currentPage = 1;
let scale = 'auto'; // 'auto' fits the page size, or a float number for explicit zoom
let sidebarOpen = false;
let isTransitioning = false;
let pdfUrl = '';

// DOM Elements
const elements = {
    app: document.getElementById('app'),
    docTitle: document.getElementById('documentTitle'),
    sidebarToggleBtn: document.getElementById('sidebarToggleBtn'),
    shareBtn: document.getElementById('shareBtn'),
    thumbnailSidebar: document.getElementById('thumbnailSidebar'),
    thumbnailContainer: document.getElementById('thumbnailContainer'),
    viewerMain: document.getElementById('viewerMain'),
    uploadContainer: document.getElementById('uploadContainer'),
    pdfFileInput: document.getElementById('pdfFileInput'),
    browseBtn: document.getElementById('browseBtn'),
    carouselWrapper: document.getElementById('carouselWrapper'),
    canvasViewport: document.getElementById('canvasViewport'),
    slideContainer: document.getElementById('slideContainer'),
    slideCurrent: document.getElementById('slideCurrent'),
    slideTransition: document.getElementById('slideTransition'),
    prevBtn: document.getElementById('prevBtn'),
    nextBtn: document.getElementById('nextBtn'),
    pageIndicator: document.getElementById('pageIndicator'),
    currentPageNum: document.getElementById('currentPageNum'),
    totalPageNum: document.getElementById('totalPageNum'),
    loadingOverlay: document.getElementById('loadingOverlay'),
    loadingMessage: document.getElementById('loadingMessage'),
    appFooter: document.getElementById('appFooter'),
    
    // Footer Controls
    firstPageBtn: document.getElementById('firstPageBtn'),
    prevPageBtn: document.getElementById('prevPageBtn'),
    pageNumberInput: document.getElementById('pageNumberInput'),
    totalPagesLabel: document.getElementById('totalPagesLabel'),
    nextPageBtn: document.getElementById('nextPageBtn'),
    lastPageBtn: document.getElementById('lastPageBtn'),
    zoomOutBtn: document.getElementById('zoomOutBtn'),
    zoomInBtn: document.getElementById('zoomInBtn'),
    zoomLevelLabel: document.getElementById('zoomLevelLabel'),
    zoomFitBtn: document.getElementById('zoomFitBtn'),
    fullscreenBtn: document.getElementById('fullscreenBtn'),
    downloadPdfBtn: document.getElementById('downloadPdfBtn'),
    toastContainer: document.getElementById('toastContainer')
};

// Canvas references
let currentCanvasLeft = document.getElementById('pdfCanvasCurrent');
let transitionCanvasLeft = document.getElementById('pdfCanvasTransition');

// -------------------------------------------------------------
// Toast Notifications
// -------------------------------------------------------------
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    const icon = document.createElement('i');
    if (type === 'success') {
        icon.className = 'fa-solid fa-circle-check';
    } else {
        icon.className = 'fa-solid fa-circle-exclamation';
    }
    
    const text = document.createElement('span');
    text.textContent = message;
    
    toast.appendChild(icon);
    toast.appendChild(text);
    elements.toastContainer.appendChild(toast);
    
    // Force reflow for entry animation
    toast.offsetHeight;
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// -------------------------------------------------------------
// Document Loading
// -------------------------------------------------------------
async function loadPDF(source, name = 'Booklet') {
    elements.loadingOverlay.classList.remove('hidden');
    elements.loadingMessage.textContent = 'Parsing PDF Document...';
    
    try {
        let loadingTask;
        if (typeof source === 'string') {
            loadingTask = pdfjsLib.getDocument(source);
            pdfUrl = source;
        } else {
            loadingTask = pdfjsLib.getDocument({ data: source });
            pdfUrl = ''; // Blob/ArrayBuffer cannot be referenced by a standard URL directly
        }
        
        pdfDoc = await loadingTask.promise;
        
        const docBaseName = name.replace(/\.[^/.]+$/, "");
        if (elements.docTitle) {
            elements.docTitle.textContent = docBaseName;
        }
        document.title = `${docBaseName} - Thirunaal August 5`;
        
        // Update total pages UI
        elements.totalPageNum.textContent = pdfDoc.numPages;
        elements.totalPagesLabel.textContent = pdfDoc.numPages;
        elements.pageNumberInput.max = pdfDoc.numPages;
        
        // Set download PDF button
        if (typeof source === 'string') {
            elements.downloadPdfBtn.href = source;
            elements.downloadPdfBtn.classList.remove('hidden');
        } else {
            // Create a blob URL to allow downloading uploaded local PDF
            const blob = new Blob([source], { type: 'application/pdf' });
            elements.downloadPdfBtn.href = URL.createObjectURL(blob);
            elements.downloadPdfBtn.classList.remove('hidden');
        }
        
        // Hide upload container and show viewer
        elements.uploadContainer.classList.add('hidden');
        elements.carouselWrapper.classList.remove('hidden');
        elements.pageIndicator.classList.remove('hidden');
        elements.appFooter.classList.remove('hidden');
        
        // Build Sidebar thumbnails
        await generateThumbnails();
        
        // Handle deep-linking page navigation
        let startPage = 1;
        const hash = window.location.hash;
        if (hash && hash.startsWith('#page=')) {
            const pageNum = parseInt(hash.replace('#page=', ''), 10);
            if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= pdfDoc.numPages) {
                startPage = pageNum;
            }
        }
        
        // First render
        currentPage = startPage;
        updateUI();
        await renderCurrentPageDirectly();
        
        showToast('PDF loaded successfully!');
    } catch (error) {
        console.error('Error loading PDF: ', error);
        showToast('Failed to load PDF file. Please try another one.', 'error');
        
        // Only show upload container if we don't have a loaded document
        if (!pdfDoc) {
            elements.uploadContainer.classList.remove('hidden');
            elements.carouselWrapper.classList.add('hidden');
            elements.pageIndicator.classList.add('hidden');
            elements.appFooter.classList.add('hidden');
        }
    } finally {
        elements.loadingOverlay.classList.add('hidden');
    }
}

// Check for default booklet.pdf on startup
async function checkDefaultPdf() {
    try {
        const response = await fetch('booklet.pdf', { method: 'HEAD' });
        if (response.ok) {
            loadPDF('booklet.pdf', 'booklet.pdf');
        } else {
            // Default file not present, keep dropzone active
            elements.loadingOverlay.classList.add('hidden');
        }
    } catch (e) {
        elements.loadingOverlay.classList.add('hidden');
    }
}

// -------------------------------------------------------------
// Rendering Page Logic
// -------------------------------------------------------------
// Calculate viewport scales dynamically
function getScaleForViewport(pageWidth, pageHeight, containerWidth, containerHeight) {
    if (scale !== 'auto') return scale;
    
    // Fit margin
    const margin = 32;
    const availWidth = containerWidth - margin * 2;
    const availHeight = containerHeight - margin * 2;
    
    const wScale = availWidth / pageWidth;
    const hScale = availHeight / pageHeight;
    
    // Choose the limiting factor to fit page completely
    return Math.min(wScale, hScale);
}

// Main rendering engine onto target canvas elements
async function renderPageToCanvas(pageNum, canvas) {
    if (!pdfDoc || pageNum < 1 || pageNum > pdfDoc.numPages) return false;
    
    const containerWidth = elements.canvasViewport.clientWidth;
    const containerHeight = elements.canvasViewport.clientHeight;
    
    return renderSingleCanvas(pageNum, canvas, containerWidth, containerHeight);
}

async function renderSingleCanvas(pageNum, canvas, containerWidth, containerHeight) {
    const page = await pdfDoc.getPage(pageNum);
    const viewportDefault = page.getViewport({ scale: 1.0 });
    const computedScale = getScaleForViewport(viewportDefault.width, viewportDefault.height, containerWidth, containerHeight);
    
    const viewport = page.getViewport({ scale: computedScale });
    renderCanvasContext(page, viewport, canvas);
    
    // Update zoom label
    elements.zoomLevelLabel.textContent = `${Math.round(computedScale * 100)}%`;
    
    return true;
}

function renderCanvasContext(page, viewport, canvas) {
    const context = canvas.getContext('2d');
    const pixelRatio = window.devicePixelRatio || 1;
    
    canvas.width = viewport.width * pixelRatio;
    canvas.height = viewport.height * pixelRatio;
    
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    
    const renderContext = {
        canvasContext: context,
        viewport: viewport,
        transform: [pixelRatio, 0, 0, pixelRatio, 0, 0]
    };
    
    page.render(renderContext);
}

// Directly render on current canvas (no animation - e.g. resizing/zooming)
async function renderCurrentPageDirectly() {
    if (!pdfDoc) return;
    await renderPageToCanvas(currentPage, currentCanvasLeft);
}

// -------------------------------------------------------------
// Carousel Slide Transitions
// -------------------------------------------------------------
async function navigateToPage(targetPage, direction) {
    if (!pdfDoc || isTransitioning) return;
    if (targetPage < 1 || targetPage > pdfDoc.numPages) return;
    
    // Prevent double clicking navigation
    isTransitioning = true;
    
    // Setup target page rendering in the transition slide
    const loadSuccess = await renderPageToCanvas(targetPage, transitionCanvasLeft);
    
    if (!loadSuccess) {
        isTransitioning = false;
        return;
    }
    
    currentPage = targetPage;
    updateUI();
    
    // Setup animations
    elements.slideCurrent.className = 'slide-item active';
    elements.slideTransition.className = 'slide-item active';
    
    if (direction === 'next') {
        elements.slideCurrent.classList.add('slide-out-left');
        elements.slideTransition.classList.add('slide-in-right');
    } else if (direction === 'prev') {
        elements.slideCurrent.classList.add('slide-out-right');
        elements.slideTransition.classList.add('slide-in-left');
    }
    
    // Wait for animation to finish (matching CSS transition 400ms)
    setTimeout(() => {
        // Swap Canvas Nodes contents to avoid complete redraws
        currentCanvasLeft.width = transitionCanvasLeft.width;
        currentCanvasLeft.height = transitionCanvasLeft.height;
        currentCanvasLeft.style.width = transitionCanvasLeft.style.width;
        currentCanvasLeft.style.height = transitionCanvasLeft.style.height;
        
        const currentCtxLeft = currentCanvasLeft.getContext('2d');
        currentCtxLeft.clearRect(0, 0, currentCanvasLeft.width, currentCanvasLeft.height);
        currentCtxLeft.drawImage(transitionCanvasLeft, 0, 0);
        
        // Clear transition canvas
        transitionCanvasLeft.getContext('2d').clearRect(0, 0, transitionCanvasLeft.width, transitionCanvasLeft.height);
        
        // Reset classes
        elements.slideCurrent.className = 'slide-item active';
        elements.slideTransition.className = 'slide-item';
        
        isTransitioning = false;
        
        // Update URL hash without jumping page listener
        window.history.pushState(null, null, `#page=${currentPage}`);
    }, 400);
}

// -------------------------------------------------------------
// Sidebar Thumbnail Generation
// -------------------------------------------------------------
async function generateThumbnails() {
    elements.thumbnailContainer.innerHTML = '';
    
    // Render sequentially to prevent UI freezing
    for (let i = 1; i <= pdfDoc.numPages; i++) {
        const thumbItem = document.createElement('div');
        thumbItem.className = `thumbnail-item ${i === currentPage ? 'active' : ''}`;
        thumbItem.dataset.page = i;
        
        const wrapper = document.createElement('div');
        wrapper.className = 'thumbnail-wrapper';
        
        const canvas = document.createElement('canvas');
        wrapper.appendChild(canvas);
        
        const label = document.createElement('div');
        label.className = 'thumbnail-label';
        label.textContent = `Page ${i}`;
        
        thumbItem.appendChild(wrapper);
        thumbItem.appendChild(label);
        elements.thumbnailContainer.appendChild(thumbItem);
        
        // Event listener for thumbnail clicks
        thumbItem.addEventListener('click', () => {
            if (i === currentPage) return;
            const direction = i > currentPage ? 'next' : 'prev';
            navigateToPage(i, direction);
        });
        
        // Render thumbnail canvas asynchronously
        (async () => {
            try {
                const page = await pdfDoc.getPage(i);
                const viewport = page.getViewport({ scale: 0.15 }); // Small scale for thumbnail
                const context = canvas.getContext('2d');
                
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                
                await page.render({
                    canvasContext: context,
                    viewport: viewport
                }).promise;
            } catch (err) {
                console.error(`Error rendering thumbnail page ${i}: `, err);
            }
        })();
    }
}

function updateActiveThumbnail() {
    const thumbnails = elements.thumbnailContainer.querySelectorAll('.thumbnail-item');
    thumbnails.forEach((thumb) => {
        const pageNum = parseInt(thumb.dataset.page, 10);
        
        if (pageNum === currentPage) {
            thumb.classList.add('active');
            // Scroll thumbnail into view smoothly
            thumb.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else {
            thumb.classList.remove('active');
        }
    });
}

// -------------------------------------------------------------
// UI State Updates
// -------------------------------------------------------------
function updateUI() {
    if (!pdfDoc) return;
    
    elements.currentPageNum.textContent = currentPage;
    elements.pageNumberInput.value = currentPage;
    
    // Disable navigation buttons at edges
    const isFirst = currentPage === 1;
    const isLast = currentPage === pdfDoc.numPages;
        
    elements.prevBtn.disabled = isFirst;
    elements.prevPageBtn.disabled = isFirst;
    elements.firstPageBtn.disabled = isFirst;
    
    elements.nextBtn.disabled = isLast;
    elements.nextPageBtn.disabled = isLast;
    elements.lastPageBtn.disabled = isLast;
    
    updateActiveThumbnail();
}

// -------------------------------------------------------------
// Navigation Trigger Handlers
// -------------------------------------------------------------
function goNext() {
    if (!pdfDoc || isTransitioning) return;
    const target = Math.min(currentPage + 1, pdfDoc.numPages);
    if (target !== currentPage) {
        navigateToPage(target, 'next');
    }
}

// -------------------------------------------------------------
function goPrev() {
    if (!pdfDoc || isTransitioning) return;
    const target = Math.max(currentPage - 1, 1);
    if (target !== currentPage) {
        navigateToPage(target, 'prev');
    }
}

// -------------------------------------------------------------
// Event Listeners Setup
// -------------------------------------------------------------
function setupEventListeners() {
    // Navigation Buttons
    elements.prevBtn.addEventListener('click', goPrev);
    elements.nextBtn.addEventListener('click', goNext);
    elements.prevPageBtn.addEventListener('click', goPrev);
    elements.nextPageBtn.addEventListener('click', goNext);
    
    elements.firstPageBtn.addEventListener('click', () => {
        if (currentPage !== 1) navigateToPage(1, 'prev');
    });
    
    elements.lastPageBtn.addEventListener('click', () => {
        if (currentPage !== pdfDoc.numPages) navigateToPage(pdfDoc.numPages, 'next');
    });
    
    // Page Input Selector
    elements.pageNumberInput.addEventListener('change', (e) => {
        let val = parseInt(e.target.value, 10);
        if (isNaN(val) || val < 1) val = 1;
        if (val > pdfDoc.numPages) val = pdfDoc.numPages;
        
        if (val !== currentPage) {
            const dir = val > currentPage ? 'next' : 'prev';
            navigateToPage(val, dir);
        }
    });
    
    // Sidebar toggle
    elements.sidebarToggleBtn.addEventListener('click', () => {
        sidebarOpen = !sidebarOpen;
        elements.thumbnailSidebar.classList.toggle('collapsed', !sidebarOpen);
        elements.sidebarToggleBtn.classList.toggle('active', sidebarOpen);
        
        // Re-render currently visible page because container dimensions changed
        setTimeout(renderCurrentPageDirectly, 300);
    });
    
    // Share page button
    elements.shareBtn.addEventListener('click', () => {
        const shareUrl = `${window.location.origin}${window.location.pathname}#page=${currentPage}`;
        navigator.clipboard.writeText(shareUrl).then(() => {
            showToast('Shareable link copied to clipboard!');
        }).catch(err => {
            console.error('Failed to copy: ', err);
            showToast('Failed to copy link automatically.', 'error');
        });
    });
    
    // Zoom Buttons
    elements.zoomInBtn.addEventListener('click', () => {
        if (scale === 'auto') scale = 1.0;
        scale = Math.min(scale + 0.2, 3.0);
        renderCurrentPageDirectly();
    });
    
    elements.zoomOutBtn.addEventListener('click', () => {
        if (scale === 'auto') scale = 1.0;
        scale = Math.max(scale - 0.2, 0.4);
        renderCurrentPageDirectly();
    });
    
    elements.zoomFitBtn.addEventListener('click', () => {
        scale = 'auto';
        renderCurrentPageDirectly();
    });
    

    
    // Fullscreen Mode
    elements.fullscreenBtn.addEventListener('click', () => {
        if (!document.fullscreenElement) {
            elements.viewerMain.requestFullscreen().then(() => {
                elements.fullscreenBtn.querySelector('i').className = 'fa-solid fa-minimize';
            }).catch(err => {
                showToast('Fullscreen mode not supported or allowed', 'error');
            });
        } else {
            document.exitFullscreen();
            elements.fullscreenBtn.querySelector('i').className = 'fa-solid fa-maximize';
        }
    });
    
    document.addEventListener('fullscreenchange', () => {
        if (!document.fullscreenElement) {
            elements.fullscreenBtn.querySelector('i').className = 'fa-solid fa-maximize';
        }
        setTimeout(renderCurrentPageDirectly, 100);
    });
    
    // Keyboard Navigation
    document.addEventListener('keydown', (e) => {
        if (elements.uploadContainer.classList.contains('hidden') === false) return;
        if (document.activeElement === elements.pageNumberInput) return;
        
        if (e.key === 'ArrowRight' || e.key === ' ') {
            goNext();
        } else if (e.key === 'ArrowLeft') {
            goPrev();
        } else if (e.key === '=' || (e.key === '+' && e.ctrlKey)) {
            elements.zoomInBtn.click();
            e.preventDefault();
        } else if (e.key === '-' || (e.key === '-' && e.ctrlKey)) {
            elements.zoomOutBtn.click();
            e.preventDefault();
        } else if (e.key === '0' && e.ctrlKey) {
            elements.zoomFitBtn.click();
            e.preventDefault();
        } else if (e.key === 'f' || e.key === 'F') {
            elements.fullscreenBtn.click();
        }
    });
    
    // Window Resize Handler (Debounced)
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            if (pdfDoc) renderCurrentPageDirectly();
        }, 150);
    });
    
    // Deep Linking: Hash change listener
    window.addEventListener('hashchange', () => {
        const hash = window.location.hash;
        if (hash && hash.startsWith('#page=')) {
            const val = parseInt(hash.replace('#page=', ''), 10);
            if (!isNaN(val) && val >= 1 && val <= pdfDoc.numPages && val !== currentPage) {
                const dir = val > currentPage ? 'next' : 'prev';
                navigateToPage(val, dir);
            }
        }
    });
    
    // Drag and Drop PDF upload fallback
    elements.browseBtn.addEventListener('click', () => elements.pdfFileInput.click());
    
    elements.pdfFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file && file.type === 'application/pdf') {
            const reader = new FileReader();
            reader.onload = function(evt) {
                loadPDF(evt.target.result, file.name);
            };
            reader.readAsArrayBuffer(file);
        } else {
            showToast('Please select a valid PDF file.', 'error');
        }
    });
    
    // Drag & Drop event bindings
    ['dragenter', 'dragover'].forEach(eventName => {
        elements.viewerMain.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!pdfDoc) {
                elements.uploadContainer.classList.add('drag-over');
            }
        }, false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        elements.viewerMain.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            elements.uploadContainer.classList.remove('drag-over');
        }, false);
    });
    
    elements.viewerMain.addEventListener('drop', (e) => {
        if (pdfDoc) return; // Prevent uploading while document is active
        const dt = e.dataTransfer;
        const file = dt.files[0];
        
        if (file && file.type === 'application/pdf') {
            const reader = new FileReader();
            reader.onload = function(evt) {
                loadPDF(evt.target.result, file.name);
            };
            reader.readAsArrayBuffer(file);
        } else {
            showToast('Please drop a valid PDF file.', 'error');
        }
    });
}

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    checkDefaultPdf();
});
