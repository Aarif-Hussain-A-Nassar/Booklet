// Application State
const TOTAL_PAGES = 16;
let currentPage = 1;
let scale = 1.0; // Zoom scale factor
let sidebarOpen = false;
let isTransitioning = false;

// DOM Elements
const elements = {
    app: document.getElementById('app'),
    sidebarToggleBtn: document.getElementById('sidebarToggleBtn'),
    shareBtn: document.getElementById('shareBtn'),
    thumbnailSidebar: document.getElementById('thumbnailSidebar'),
    thumbnailContainer: document.getElementById('thumbnailContainer'),
    viewerMain: document.getElementById('viewerMain'),
    carouselWrapper: document.getElementById('carouselWrapper'),
    canvasViewport: document.getElementById('canvasViewport'),
    slideContainer: document.getElementById('slideContainer'),
    slideCurrent: document.getElementById('slideCurrent'),
    slideTransition: document.getElementById('slideTransition'),
    pageImgCurrent: document.getElementById('pageImgCurrent'),
    pageImgTransition: document.getElementById('pageImgTransition'),
    prevBtn: document.getElementById('prevBtn'),
    nextBtn: document.getElementById('nextBtn'),
    pageIndicator: document.getElementById('pageIndicator'),
    currentPageNum: document.getElementById('currentPageNum'),
    totalPageNum: document.getElementById('totalPageNum'),
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

// Get WebP page path
function getPageImageUrl(pageNum) {
    return `pages/page-${pageNum}.webp`;
}

// -------------------------------------------------------------
// Toast Notifications
// -------------------------------------------------------------
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    const icon = document.createElement('i');
    icon.className = type === 'success' ? 'fa-solid fa-circle-check' : 'fa-solid fa-circle-exclamation';
    
    const text = document.createElement('span');
    text.textContent = message;
    
    toast.appendChild(icon);
    toast.appendChild(text);
    elements.toastContainer.appendChild(toast);
    
    // Trigger entry transition
    toast.offsetHeight;
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// -------------------------------------------------------------
// Document Initialization
// -------------------------------------------------------------
function initDocument() {
    // Set static values
    elements.totalPageNum.textContent = TOTAL_PAGES;
    elements.totalPagesLabel.textContent = TOTAL_PAGES;
    elements.pageNumberInput.max = TOTAL_PAGES;
    
    // Set download PDF button pointing to your CDN hosted PDF
    elements.downloadPdfBtn.href = 'https://xklbw4viyock6snd.public.blob.vercel-storage.com/Booklet%202026.pdf';
    
    // Build Sidebar thumbnails
    generateThumbnails();
    
    // Parse starting page from URL hash deep-link
    let startPage = 1;
    const hash = window.location.hash;
    if (hash && hash.startsWith('#page=')) {
        const pageNum = parseInt(hash.replace('#page=', ''), 10);
        if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= TOTAL_PAGES) {
            startPage = pageNum;
        }
    }
    
    currentPage = startPage;
    updateUI();
    renderCurrentPageDirectly();
}

// -------------------------------------------------------------
// Rendering Page Logic
// -------------------------------------------------------------
function renderCurrentPageDirectly() {
    elements.pageImgCurrent.src = getPageImageUrl(currentPage);
    applyZoom();
}

function applyZoom() {
    const img = elements.pageImgCurrent;
    if (scale === 1.0) {
        img.style.transform = 'none';
        elements.zoomLevelLabel.textContent = '100%';
    } else {
        img.style.transform = `scale(${scale})`;
        elements.zoomLevelLabel.textContent = `${Math.round(scale * 100)}%`;
    }
}

// -------------------------------------------------------------
// Carousel Slide Transitions
// -------------------------------------------------------------
function navigateToPage(targetPage, direction) {
    if (isTransitioning) return;
    if (targetPage < 1 || targetPage > TOTAL_PAGES) return;
    
    isTransitioning = true;
    
    // Pre-load the target image to prevent any blank screen flicker
    elements.pageImgTransition.src = getPageImageUrl(targetPage);
    
    const onImageLoaded = () => {
        currentPage = targetPage;
        updateUI();
        
        // Trigger sliding CSS animations
        elements.slideCurrent.className = 'slide-item active';
        elements.slideTransition.className = 'slide-item active';
        
        if (direction === 'next') {
            elements.slideCurrent.classList.add('slide-out-left');
            elements.slideTransition.classList.add('slide-in-right');
        } else if (direction === 'prev') {
            elements.slideCurrent.classList.add('slide-out-right');
            elements.slideTransition.classList.add('slide-in-left');
        }
        
        // Wait for CSS slide transition to complete (400ms)
        setTimeout(() => {
            // Commit transition changes
            elements.pageImgCurrent.src = elements.pageImgTransition.src;
            applyZoom(); // Apply current zoom level to the active image
            
            // Reset transition slide image
            elements.pageImgTransition.removeAttribute('src');
            
            // Restore classes
            elements.slideCurrent.className = 'slide-item active';
            elements.slideTransition.className = 'slide-item';
            
            isTransitioning = false;
            
            // Update URL hash deep-link without triggering hashchange listener
            window.history.pushState(null, null, `#page=${currentPage}`);
        }, 400);
    };

    if (elements.pageImgTransition.complete) {
        onImageLoaded();
    } else {
        elements.pageImgTransition.onload = onImageLoaded;
    }
}

// -------------------------------------------------------------
// Sidebar Thumbnail Generation
// -------------------------------------------------------------
function generateThumbnails() {
    elements.thumbnailContainer.innerHTML = '';
    
    for (let i = 1; i <= TOTAL_PAGES; i++) {
        const thumbItem = document.createElement('div');
        thumbItem.className = `thumbnail-item ${i === currentPage ? 'active' : ''}`;
        thumbItem.dataset.page = i;
        
        const wrapper = document.createElement('div');
        wrapper.className = 'thumbnail-wrapper';
        
        const img = document.createElement('img');
        img.src = getPageImageUrl(i);
        img.loading = 'lazy'; // Let the browser handle lazy-loading for offscreen thumbs
        img.alt = `Page ${i} Thumbnail`;
        
        const label = document.createElement('div');
        label.className = 'thumbnail-label';
        label.textContent = `Page ${i}`;
        
        wrapper.appendChild(img);
        thumbItem.appendChild(wrapper);
        thumbItem.appendChild(label);
        elements.thumbnailContainer.appendChild(thumbItem);
        
        // Jump to clicked page
        thumbItem.addEventListener('click', () => {
            if (i === currentPage) return;
            const direction = i > currentPage ? 'next' : 'prev';
            navigateToPage(i, direction);
        });
    }
}

function updateActiveThumbnail() {
    const thumbnails = elements.thumbnailContainer.querySelectorAll('.thumbnail-item');
    thumbnails.forEach((thumb) => {
        const pageNum = parseInt(thumb.dataset.page, 10);
        if (pageNum === currentPage) {
            thumb.classList.add('active');
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
    elements.currentPageNum.textContent = currentPage;
    elements.pageNumberInput.value = currentPage;
    
    // Disable navigation buttons at edges
    const isFirst = currentPage === 1;
    const isLast = currentPage === TOTAL_PAGES;
        
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
    if (isTransitioning) return;
    const target = Math.min(currentPage + 1, TOTAL_PAGES);
    if (target !== currentPage) {
        navigateToPage(target, 'next');
    }
}

function goPrev() {
    if (isTransitioning) return;
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
        if (currentPage !== TOTAL_PAGES) navigateToPage(TOTAL_PAGES, 'next');
    });
    
    // Page Input Selector
    elements.pageNumberInput.addEventListener('change', (e) => {
        let val = parseInt(e.target.value, 10);
        if (isNaN(val) || val < 1) val = 1;
        if (val > TOTAL_PAGES) val = TOTAL_PAGES;
        
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
    
    // Zoom Buttons (CSS Transform Zoom)
    elements.zoomInBtn.addEventListener('click', () => {
        scale = Math.min(scale + 0.25, 3.0);
        applyZoom();
    });
    
    elements.zoomOutBtn.addEventListener('click', () => {
        scale = Math.max(scale - 0.25, 0.5);
        applyZoom();
    });
    
    elements.zoomFitBtn.addEventListener('click', () => {
        scale = 1.0;
        applyZoom();
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
    });
    
    // Keyboard Navigation
    document.addEventListener('keydown', (e) => {
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
    
    // Deep Linking: Hash change listener
    window.addEventListener('hashchange', () => {
        const hash = window.location.hash;
        if (hash && hash.startsWith('#page=')) {
            const val = parseInt(hash.replace('#page=', ''), 10);
            if (!isNaN(val) && val >= 1 && val <= TOTAL_PAGES && val !== currentPage) {
                const dir = val > currentPage ? 'next' : 'prev';
                navigateToPage(val, dir);
            }
        }
    });
}

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    initDocument();
});
