// Application State
const TOTAL_PAGES = 16;
let currentPage = 1;
let scale = 1.0; // Zoom scale factor
let sidebarOpen = false;
let isTransitioning = false;
let activeSlide = 'A'; // Tracks which slide is currently active ('A' or 'B')
let flipEngine = null;  // Canvas-based page flip engine

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
    slideA: document.getElementById('slideA'),
    slideB: document.getElementById('slideB'),
    pageImgA: document.getElementById('pageImgA'),
    pageImgB: document.getElementById('pageImgB'),
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

// Flip animation duration in ms (matches CSS --flip-duration)
const FLIP_DURATION = 600;

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
    if (elements.downloadPdfBtn) {
        elements.downloadPdfBtn.href = 'https://xklbw4viyock6snd.public.blob.vercel-storage.com/Booklet%202026.pdf';
    }
    
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
    
    // Preload adjacent pages for smoother flipping
    preloadAdjacentPages(currentPage);
    
    // Auto-enter fullscreen on first interaction (optional: auto-request)
    requestAutoFullscreen();
}

// -------------------------------------------------------------
// Preload images for smooth flipping
// -------------------------------------------------------------
function preloadAdjacentPages(page) {
    const toPreload = [page - 1, page + 1, page + 2];
    toPreload.forEach(p => {
        if (p >= 1 && p <= TOTAL_PAGES) {
            const img = new Image();
            img.src = getPageImageUrl(p);
        }
    });
}

// -------------------------------------------------------------
// Auto Fullscreen
// -------------------------------------------------------------
function requestAutoFullscreen() {
    // Request fullscreen on the app element for immersive experience
    const requestFS = () => {
        const el = elements.app;
        if (el.requestFullscreen) {
            el.requestFullscreen().catch(() => {});
        } else if (el.webkitRequestFullscreen) {
            el.webkitRequestFullscreen();
        }
        document.removeEventListener('click', requestFS);
        document.removeEventListener('keydown', requestFS);
        document.removeEventListener('touchstart', requestFS);
    };
    
    // Fullscreen requires a user gesture, so we attach to first interaction
    document.addEventListener('click', requestFS, { once: true });
    document.addEventListener('keydown', requestFS, { once: true });
    document.addEventListener('touchstart', requestFS, { once: true });
}

// -------------------------------------------------------------
// Rendering Page Logic
// -------------------------------------------------------------
function renderCurrentPageDirectly() {
    const activeImg = activeSlide === 'A' ? elements.pageImgA : elements.pageImgB;
    activeImg.src = getPageImageUrl(currentPage);
    applyZoom();
}

function applyZoom() {
    const activeImg = activeSlide === 'A' ? elements.pageImgA : elements.pageImgB;
    const inactiveImg = activeSlide === 'A' ? elements.pageImgB : elements.pageImgA;
    
    // Apply scale to active image
    if (scale === 1.0) {
        activeImg.style.transform = 'none';
        elements.zoomLevelLabel.textContent = '100%';
    } else {
        activeImg.style.transform = `scale(${scale})`;
        elements.zoomLevelLabel.textContent = `${Math.round(scale * 100)}%`;
    }
    
    // Reset scale on inactive image
    inactiveImg.style.transform = 'none';
}

// -------------------------------------------------------------
// Page Flip Navigation (canvas-based via FlipEngine)
// -------------------------------------------------------------
function navigateToPage(targetPage, direction) {
    if (isTransitioning) return;
    if (targetPage < 1 || targetPage > TOTAL_PAGES) return;
    if (flipEngine && flipEngine.isFlipping()) return;
    
    isTransitioning = true;
    
    const flipDir = direction === 'next' ? 'forward' : 'backward';
    
    if (flipEngine) {
        flipEngine.flipTo(targetPage, flipDir).then(success => {
            // State is updated via onComplete callback
            isTransitioning = false;
        });
    } else {
        // Fallback: direct page change (no animation)
        currentPage = targetPage;
        renderCurrentPageDirectly();
        updateUI();
        isTransitioning = false;
        window.history.pushState(null, null, `#page=${currentPage}`);
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
        img.loading = 'lazy';
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
    
    // Add page-curl effect to Cover Page (Page 1) only
    const wrapperA = elements.slideA.querySelector('.image-wrapper');
    const wrapperB = elements.slideB.querySelector('.image-wrapper');
    
    if (currentPage === 1) {
        if (activeSlide === 'A') {
            wrapperA.classList.add('has-cover-curl');
            wrapperB.classList.remove('has-cover-curl');
        } else {
            wrapperB.classList.add('has-cover-curl');
            wrapperA.classList.remove('has-cover-curl');
        }
    } else {
        wrapperA.classList.remove('has-cover-curl');
        wrapperB.classList.remove('has-cover-curl');
    }
    
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
// Fullscreen helpers
// -------------------------------------------------------------
function enterFullscreen() {
    const el = elements.app;
    if (el.requestFullscreen) {
        el.requestFullscreen().catch(() => {});
    } else if (el.webkitRequestFullscreen) {
        el.webkitRequestFullscreen();
    } else if (el.msRequestFullscreen) {
        el.msRequestFullscreen();
    }
}

function exitFullscreen() {
    if (document.exitFullscreen) {
        document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
    } else if (document.msExitFullscreen) {
        document.msExitFullscreen();
    }
}

function isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement);
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
    
    // Fullscreen Mode – toggle on the whole app
    elements.fullscreenBtn.addEventListener('click', () => {
        if (!isFullscreen()) {
            enterFullscreen();
        } else {
            exitFullscreen();
        }
    });
    
    // Listen for fullscreen changes
    const fsEvents = ['fullscreenchange', 'webkitfullscreenchange', 'msfullscreenchange'];
    fsEvents.forEach(evt => {
        document.addEventListener(evt, () => {
            const icon = elements.fullscreenBtn.querySelector('i');
            if (isFullscreen()) {
                icon.className = 'fa-solid fa-minimize';
                elements.app.classList.add('is-fullscreen');
            } else {
                icon.className = 'fa-solid fa-maximize';
                elements.app.classList.remove('is-fullscreen');
            }
        });
    });
    
    // Keyboard Navigation
    document.addEventListener('keydown', (e) => {
        if (document.activeElement === elements.pageNumberInput) return;
        
        if (e.key === 'ArrowRight' || e.key === ' ') {
            goNext();
            e.preventDefault();
        } else if (e.key === 'ArrowLeft') {
            goPrev();
            e.preventDefault();
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
        } else if (e.key === 'Escape') {
            // Escape is handled by browser for fullscreen
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

    // Touch navigation is handled natively by the FlipEngine
    // (drag, swipe, and click-to-flip on the page area)
    
    // Close sidebar when clicking outside on mobile screens
    document.addEventListener('click', (e) => {
        if (window.innerWidth <= 768 && sidebarOpen) {
            const isClickInsideSidebar = elements.thumbnailSidebar.contains(e.target);
            const isClickOnToggleBtn = elements.sidebarToggleBtn.contains(e.target);
            
            if (!isClickInsideSidebar && !isClickOnToggleBtn) {
                sidebarOpen = false;
                elements.thumbnailSidebar.classList.add('collapsed');
                elements.sidebarToggleBtn.classList.remove('active');
            }
        }
    });
    
    // Mouse wheel page navigation (scroll to flip)
    let wheelTimeout = null;
    elements.viewerMain.addEventListener('wheel', (e) => {
        if (isTransitioning) return;
        e.preventDefault();
        
        if (wheelTimeout) return; // Throttle wheel events
        
        wheelTimeout = setTimeout(() => {
            wheelTimeout = null;
        }, 700);
        
        if (e.deltaY > 0 || e.deltaX > 0) {
            goNext();
        } else if (e.deltaY < 0 || e.deltaX < 0) {
            goPrev();
        }
    }, { passive: false });
}

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    initDocument();
    
    // Initialize the canvas-based FlipEngine
    if (typeof FlipEngine !== 'undefined') {
        flipEngine = new FlipEngine({
            viewport:   elements.canvasViewport,
            getPageUrl: getPageImageUrl,
            totalPages: TOTAL_PAGES,
            onStart: function(dir) {
                isTransitioning = true;
            },
            onComplete: function(newPage, completed, dir) {
                if (completed) {
                    currentPage = newPage;
                    // Update the underlying slide image
                    const activeImg = activeSlide === 'A' ? elements.pageImgA : elements.pageImgB;
                    activeImg.src = getPageImageUrl(currentPage);
                    updateUI();
                    window.history.pushState(null, null, `#page=${currentPage}`);
                    preloadAdjacentPages(currentPage);
                }
                isTransitioning = false;
            }
        });
        flipEngine.setPage(currentPage);
    }
});
