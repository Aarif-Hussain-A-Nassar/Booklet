// Application State
const TOTAL_PAGES = 16;
let currentPage = 1;
let scale = 1.0; // Zoom scale factor
let sidebarOpen = false;
let isTransitioning = false;
let activeSlide = 'A'; // Tracks which slide is currently active ('A' or 'B')

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
// Carousel Slide Transitions (Flicker-free A/B Swap)
// -------------------------------------------------------------
function navigateToPage(targetPage, direction) {
    if (isTransitioning) return;
    if (targetPage < 1 || targetPage > TOTAL_PAGES) return;
    
    isTransitioning = true;
    
    const inactiveSlide = activeSlide === 'A' ? 'B' : 'A';
    const activeSlideEl = activeSlide === 'A' ? elements.slideA : elements.slideB;
    const inactiveSlideEl = inactiveSlide === 'A' ? elements.slideA : elements.slideB;
    const inactiveImg = inactiveSlide === 'A' ? elements.pageImgA : elements.pageImgB;
    
    let loaded = false;
    const onImageLoaded = () => {
        if (loaded) return;
        loaded = true;
        
        currentPage = targetPage;
        updateUI();
        
        // Mark both slides active and visible during transition
        activeSlideEl.className = 'slide-item active';
        inactiveSlideEl.className = 'slide-item active';
        
        // Trigger hardware-accelerated CSS animations
        if (direction === 'next') {
            activeSlideEl.classList.add('slide-out-left');
            inactiveSlideEl.classList.add('slide-in-right');
        } else if (direction === 'prev') {
            activeSlideEl.classList.add('slide-out-right');
            inactiveSlideEl.classList.add('slide-in-left');
        }
        
        // Wait for CSS slide animation to finish (400ms)
        setTimeout(() => {
            // Swap active slide pointer
            activeSlide = inactiveSlide;
            applyZoom(); // Apply current zoom settings to the newly active image
            
            // Set final inactive/active classes
            activeSlideEl.className = 'slide-item';
            inactiveSlideEl.className = 'slide-item active';
            
            isTransitioning = false;
            
            // Update URL hash deep-link without triggering window hashchange listener
            window.history.pushState(null, null, `#page=${currentPage}`);
        }, 400);
    };

    // Clean up old handlers to prevent memory leaks or duplicate triggers
    inactiveImg.onload = null;
    inactiveImg.onerror = null;

    // Attach handlers
    inactiveImg.onload = onImageLoaded;
    inactiveImg.onerror = onImageLoaded; // Proceed anyway on error to prevent locking
    
    // Set target image source
    inactiveImg.src = getPageImageUrl(targetPage);
    
    if (inactiveImg.complete) {
        onImageLoaded();
    } else {
        // Safe fallback timeout (150ms) to ensure transition always triggers and doesn't get stuck
        setTimeout(onImageLoaded, 150);
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
        img.loading = 'lazy'; // Browser handles lazy-loading
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

    // Touch Navigation for Mobile (Swipe Gestures)
    let touchStartX = 0;
    let touchStartY = 0;
    let touchEndX = 0;
    let touchEndY = 0;
    
    elements.viewerMain.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
    }, { passive: true });
    
    elements.viewerMain.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        touchEndY = e.changedTouches[0].screenY;
        
        const diffX = touchEndX - touchStartX;
        const diffY = touchEndY - touchStartY;
        const swipeThreshold = 50; // Minimum swipe distance in pixels
        
        // Ensure horizontal swipe is dominant and exceeds threshold
        if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > swipeThreshold) {
            if (diffX < 0) {
                goNext(); // Swipe left -> Next page
            } else {
                goPrev(); // Swipe right -> Prev page
            }
        }
    }, { passive: true });
    
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
}

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    initDocument();
});
