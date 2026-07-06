/**
 * FlipEngine — Premium realistic page-flip animation engine
 * Canvas-based rendering with paper curl, dynamic shadows, lighting, and spring physics.
 */
(function () {
    'use strict';

    // ─── Easing helpers ───
    function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
    function easeInOutCubic(t) { return t < .5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2; }

    class FlipEngine {
        constructor(cfg) {
            this.viewport   = cfg.viewport;          // canvasViewport element
            this.getPageUrl = cfg.getPageUrl;         // (pageNum) => url
            this.totalPages = cfg.totalPages;
            this.onComplete = cfg.onComplete || function(){};
            this.onStart    = cfg.onStart    || function(){};

            // Create overlay canvas
            this.canvas = document.createElement('canvas');
            this.canvas.className = 'flip-canvas';
            this.viewport.appendChild(this.canvas);
            this.ctx = this.canvas.getContext('2d');
            this.dpr = Math.min(window.devicePixelRatio || 1, 2);

            // State
            this.state       = 'idle';     // idle | dragging | animating
            this.dir         = null;       // 'forward' | 'backward'
            this.curPage     = 1;
            this.tgtPage     = 0;
            this.progress    = 0;          // 0‥1

            // Corner being dragged (in canvas-pixel coordinates)
            this.cx = 0; this.cy = 0;

            // Page display rectangle (within viewport)
            this.pr = null;

            // Image cache
            this.imgs   = {};
            this._loading = {};

            // RAF
            this.rafId = null;

            // Animation
            this.animStart = 0;
            this.animDur   = 550;   // ms for programmatic flip

            // Drag tracking
            this._isPointerDown = false;
            this._dragActive = false;
            this._startX = 0; this._startY = 0;
            this._lastX  = 0; this._lastT  = 0;
            this._velX   = 0;

            // Spring
            this._springVel   = 0;
            this._springTgt   = 0;
            this._springK     = 0.10;
            this._springDamp  = 0.80;

            // Bind
            this._onMD = this._onMD.bind(this);
            this._onMM = this._onMM.bind(this);
            this._onMU = this._onMU.bind(this);
            this._onTS = this._onTS.bind(this);
            this._onTM = this._onTM.bind(this);
            this._onTE = this._onTE.bind(this);

            this._resize();
            this._listen();
            window.addEventListener('resize', () => this._resize());
        }

        /* ===========================================================
           PUBLIC API
           =========================================================== */

        /** Trigger a programmatic page flip. Returns Promise<boolean>. */
        flipTo(page, dir) {
            if (this.state !== 'idle') return Promise.resolve(false);
            if (page < 1 || page > this.totalPages) return Promise.resolve(false);
            this.dir     = dir;
            this.tgtPage = page;
            return new Promise(res => {
                this._resolve = res;
                Promise.all([this._load(this.curPage), this._load(page)]).then(() => {
                    this._beginProgrammatic();
                }).catch(() => res(false));
            });
        }

        setPage(p) {
            this.curPage = p;
            this._preload(p);
        }

        isFlipping() { return this.state !== 'idle'; }

        destroy() {
            window.removeEventListener('resize', this._resize);
            cancelAnimationFrame(this.rafId);
            this.canvas.remove();
        }

        /* ===========================================================
           IMAGE MANAGEMENT
           =========================================================== */

        _load(p) {
            if (this.imgs[p]) return Promise.resolve(this.imgs[p]);
            if (this._loading[p]) return this._loading[p];
            this._loading[p] = new Promise((ok, fail) => {
                const img = new Image();
                img.onload = () => { this.imgs[p] = img; delete this._loading[p]; ok(img); };
                img.onerror = () => { delete this._loading[p]; fail(); };
                img.src = this.getPageUrl(p);
            });
            return this._loading[p];
        }

        _preload(p) {
            for (let i = Math.max(1, p-1); i <= Math.min(this.totalPages, p+2); i++) this._load(i);
        }

        /* ===========================================================
           CANVAS HELPERS
           =========================================================== */

        _resize() {
            const r = this.viewport.getBoundingClientRect();
            this.vpW = r.width; this.vpH = r.height;
            this.canvas.width  = r.width  * this.dpr;
            this.canvas.height = r.height * this.dpr;
            this.canvas.style.width  = r.width  + 'px';
            this.canvas.style.height = r.height + 'px';
        }

        _show() {
            this.canvas.style.display = 'block';
            this._resize();
            // Measure page rect from active image wrapper
            const w = this.viewport.querySelector('.slide-item.active .image-wrapper');
            if (w) {
                const vp = this.viewport.getBoundingClientRect();
                const wr = w.getBoundingClientRect();
                this.pr = { x: wr.left - vp.left, y: wr.top - vp.top, w: wr.width, h: wr.height };
            } else {
                this.pr = { x: 40, y: 20, w: this.vpW - 80, h: this.vpH - 40 };
            }
            // Hide underlying slides
            this.viewport.querySelectorAll('.slide-item').forEach(s => s.style.visibility = 'hidden');
        }

        _hide() {
            this.canvas.style.display = 'none';
            this.viewport.querySelectorAll('.slide-item').forEach(s => s.style.visibility = '');
        }

        _getPageRect() {
            const w = this.viewport.querySelector('.slide-item.active .image-wrapper');
            if (!w) return null;
            const vp = this.viewport.getBoundingClientRect();
            const wr = w.getBoundingClientRect();
            return { x: wr.left - vp.left, y: wr.top - vp.top, w: wr.width, h: wr.height };
        }

        /* ===========================================================
           FOLD GEOMETRY
           =========================================================== */

        /** Returns fold descriptor from the current corner (cx, cy). */
        _fold() {
            const P = this.pr;
            // Original corner
            const ox = this.dir === 'forward' ? P.x + P.w : P.x;
            const oy = P.y + P.h;
            // Current corner (constrained)
            let cx = this.cx, cy = this.cy;
            if (this.dir === 'forward') {
                cx = Math.max(P.x - P.w * 0.15, Math.min(P.x + P.w + 2, cx));
            } else {
                cx = Math.max(P.x - 2, Math.min(P.x + P.w * 1.15, cx));
            }
            cy = Math.max(P.y - P.h * 0.05, Math.min(P.y + P.h * 1.05, cy));

            // Midpoint
            const mx = (ox + cx) / 2, my = (oy + cy) / 2;
            // Normal (toward original corner = folded side)
            const vnx = ox - cx, vny = oy - cy;
            const vl = Math.sqrt(vnx*vnx + vny*vny) || 1;
            const nx = vnx / vl, ny = vny / vl;
            // Fold direction (perpendicular)
            const dx = -ny, dy = nx;
            const angle = Math.atan2(dy, dx);
            return { mx, my, nx, ny, dx, dy, angle, cx, cy, ox, oy };
        }

        /* ===========================================================
           RENDERING
           =========================================================== */

        _render() {
            const ctx = this.ctx;
            const P   = this.pr;
            if (!P) return;

            ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
            ctx.clearRect(0, 0, this.vpW, this.vpH);

            const curImg  = this.imgs[this.curPage];
            const nextImg = this.imgs[this.tgtPage];
            if (!curImg || !nextImg) return;

            // Draw page stacks
            this._drawPageStacks(ctx, P);

            // Calculate progress t
            let t = this.progress;
            if (this.state === 'dragging') {
                if (this.dir === 'forward') {
                    t = ((P.x + P.w) - this.cx) / P.w;
                } else {
                    t = (this.cx - P.x) / P.w;
                }
            }
            t = Math.max(0.0001, Math.min(0.9999, t));

            // Cylinder parameters
            const maxR = P.w * 0.12;
            const R = maxR * Math.sin(t * Math.PI);
            const x_f = this.dir === 'forward' ? P.w * (1 - t) : P.w * t;
            const x_left = x_f - R;
            const x_right = x_f + R;

            const W = P.w;
            const H = P.h;
            const imgW = curImg.width;
            const imgH = curImg.height;

            if (this.dir === 'forward') {
                // ─── FORWARD FLIP (RIGHT TO LEFT) ───

                // 1. Draw Revealed Next Page (underneath)
                ctx.save();
                ctx.beginPath();
                ctx.rect(P.x, P.y, P.w, P.h);
                ctx.clip();
                ctx.drawImage(nextImg, P.x, P.y, P.w, P.h);
                
                // Shadow cast onto next page by the fold
                const shadowW = Math.min(P.w * 0.15, 60);
                const gReveal = ctx.createLinearGradient(P.x + x_left, 0, P.x + x_left + shadowW, 0);
                gReveal.addColorStop(0, 'rgba(0, 0, 0, 0.28)');
                gReveal.addColorStop(0.3, 'rgba(0, 0, 0, 0.10)');
                gReveal.addColorStop(1, 'rgba(0, 0, 0, 0)');
                ctx.fillStyle = gReveal;
                ctx.fillRect(P.x + x_left, P.y, shadowW, P.h);
                ctx.restore();

                // 2. Draw Flat Front Page (unturned part)
                if (x_left > 0) {
                    const srcW = x_left * (imgW / W);
                    ctx.drawImage(curImg, 0, 0, srcW, imgH, P.x, P.y, x_left, H);
                }

                // 3. Draw Flat Back Page (reflected part)
                const flatBackW = W - (x_left + R * Math.PI);
                if (flatBackW > 0.5) {
                    const x_end = P.x + x_left - flatBackW;
                    ctx.save();
                    ctx.beginPath();
                    ctx.rect(x_end, P.y, flatBackW, P.h);
                    ctx.clip();

                    // Reflect around axis: P.x + x_left + R * Math.PI / 2
                    const reflectAxis = P.x + x_left + R * Math.PI / 2;
                    ctx.translate(reflectAxis, 0);
                    ctx.scale(-1, 1);
                    ctx.translate(-reflectAxis, 0);

                    const srcX = (x_left + R * Math.PI) * (imgW / W);
                    const srcW = flatBackW * (imgW / W);
                    ctx.drawImage(curImg, srcX, 0, srcW, imgH, P.x + x_left + R * Math.PI, P.y, flatBackW, P.h);
                    
                    // Shadow cast by curl onto reflected flat back page
                    const gBackFlat = ctx.createLinearGradient(P.x + x_left + R * Math.PI, 0, P.x + x_left + R * Math.PI - shadowW, 0);
                    gBackFlat.addColorStop(0, 'rgba(0, 0, 0, 0.15)');
                    gBackFlat.addColorStop(1, 'rgba(0, 0, 0, 0)');
                    ctx.fillStyle = gBackFlat;
                    ctx.fillRect(P.x + x_left + R * Math.PI - shadowW, P.y, shadowW, P.h);

                    ctx.restore();
                }

                // 4. Draw Curl Zone (slices)
                if (R > 0.5) {
                    const sliceW = 1;
                    const startX = Math.floor(P.x + x_left);
                    const endX = Math.ceil(P.x + x_f);
                    
                    // Curve vertical bending parameters
                    const B_top = 10 * Math.sin(t * Math.PI);
                    const B_bottom = 50 * Math.sin(t * Math.PI);

                    for (let x_col = startX; x_col <= endX; x_col++) {
                        const dx = x_col - startX;
                        let pct = dx / R;
                        pct = Math.max(0, Math.min(1, pct));
                        
                        const theta_f = Math.asin(pct);
                        const theta_b = Math.PI - theta_f;

                        // Calculate vertical shift and height based on z height
                        const z_f = R * (1 - Math.cos(theta_f));
                        const z_b = R * (1 - Math.cos(theta_b));

                        // Top & Bottom vertical offsets for front and back
                        const dy_t_f = B_top * (z_f / (2 * R));
                        const dy_b_f = B_bottom * (z_f / (2 * R));
                        
                        const dy_t_b = B_top * (z_b / (2 * R));
                        const dy_b_b = B_bottom * (z_b / (2 * R));

                        // ──── DRAW BACK SIDE SLICE FIRST ────
                        const u_b = x_left + R * theta_b;
                        if (u_b >= 0 && u_b <= W) {
                            const y_t = P.y + dy_t_b;
                            const y_b = P.y + P.h - dy_b_b;
                            const h_s = y_b - y_t;
                            
                            const srcX = u_b * (imgW / W);
                            ctx.drawImage(curImg, srcX, 0, 1, imgH, x_col, y_t, sliceW, h_s);

                            // Tint back page cream
                            ctx.fillStyle = 'rgba(245, 242, 238, 0.22)';
                            ctx.fillRect(x_col, y_t, sliceW, h_s);

                            // Shadow inside curl
                            const shadow = 0.35 * (1 - Math.sin(theta_b));
                            ctx.fillStyle = 'rgba(0, 0, 0, ' + shadow + ')';
                            ctx.fillRect(x_col, y_t, sliceW, h_s);
                        }

                        // ──── DRAW FRONT SIDE SLICE SECOND ────
                        const u_f = x_left + R * theta_f;
                        if (u_f >= 0 && u_f <= W) {
                            const y_t = P.y + dy_t_f;
                            const y_b = P.y + P.h - dy_b_f;
                            const h_s = y_b - y_t;

                            const srcX = u_f * (imgW / W);
                            ctx.drawImage(curImg, srcX, 0, 1, imgH, x_col, y_t, sliceW, h_s);

                            // Shadow on outer edges of curl
                            const shadow = 0.25 * (1 - Math.sin(theta_f));
                            ctx.fillStyle = 'rgba(0, 0, 0, ' + shadow + ')';
                            ctx.fillRect(x_col, y_t, sliceW, h_s);

                            // Highlight on peak
                            const highlight = 0.12 * Math.pow(Math.sin(theta_f), 12);
                            ctx.fillStyle = 'rgba(255, 255, 255, ' + highlight + ')';
                            ctx.fillRect(x_col, y_t, sliceW, h_s);
                        }
                    }
                    
                    // Draw fold edge accent line
                    ctx.save();
                    ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(P.x + x_f, P.y + B_top * 0.5);
                    ctx.lineTo(P.x + x_f, P.y + P.h - B_bottom * 0.5);
                    ctx.stroke();
                    ctx.restore();
                }

            } else {
                // ─── BACKWARD FLIP (LEFT TO RIGHT) ───

                // 1. Draw Revealed Next Page (underneath)
                ctx.save();
                ctx.beginPath();
                ctx.rect(P.x, P.y, P.w, P.h);
                ctx.clip();
                ctx.drawImage(nextImg, P.x, P.y, P.w, P.h);

                // Shadow cast onto next page by the fold (on the left side)
                const shadowW = Math.min(P.w * 0.15, 60);
                const gReveal = ctx.createLinearGradient(P.x + x_right, 0, P.x + x_right - shadowW, 0);
                gReveal.addColorStop(0, 'rgba(0, 0, 0, 0.28)');
                gReveal.addColorStop(0.3, 'rgba(0, 0, 0, 0.10)');
                gReveal.addColorStop(1, 'rgba(0, 0, 0, 0)');
                ctx.fillStyle = gReveal;
                ctx.fillRect(P.x + x_right - shadowW, P.y, shadowW, P.h);
                ctx.restore();

                // 2. Draw Flat Front Page (unturned part on the right)
                if (x_right < W) {
                    const srcX = x_right * (imgW / W);
                    const srcW = imgW - srcX;
                    ctx.drawImage(curImg, srcX, 0, srcW, imgH, P.x + x_right, P.y, W - x_right, H);
                }

                // 3. Draw Flat Back Page (reflected part on the right)
                const flatBackW = x_right - R * Math.PI;
                if (flatBackW > 0.5) {
                    const destX = P.x + x_right;
                    ctx.save();
                    ctx.beginPath();
                    ctx.rect(destX, P.y, flatBackW, P.h);
                    ctx.clip();

                    // Reflect around axis: P.x + x_right - R * Math.PI / 2
                    const reflectAxis = P.x + x_right - R * Math.PI / 2;
                    ctx.translate(reflectAxis, 0);
                    ctx.scale(-1, 1);
                    ctx.translate(-reflectAxis, 0);

                    const srcW = flatBackW * (imgW / W);
                    ctx.drawImage(curImg, 0, 0, srcW, imgH, P.x + (x_right - flatBackW), P.y, flatBackW, P.h);
                    
                    // Shadow cast by curl onto reflected flat back page
                    const gBackFlat = ctx.createLinearGradient(P.x + x_right - R * Math.PI, 0, P.x + x_right - R * Math.PI + shadowW, 0);
                    gBackFlat.addColorStop(0, 'rgba(0, 0, 0, 0.15)');
                    gBackFlat.addColorStop(1, 'rgba(0, 0, 0, 0)');
                    ctx.fillStyle = gBackFlat;
                    ctx.fillRect(P.x + x_right - R * Math.PI, P.y, shadowW, P.h);

                    ctx.restore();
                }

                // 4. Draw Curl Zone (slices)
                if (R > 0.5) {
                    const sliceW = 1;
                    const startX = Math.floor(P.x + x_f);
                    const endX = Math.ceil(P.x + x_right);

                    // Curve vertical bending parameters
                    const B_top = 10 * Math.sin(t * Math.PI);
                    const B_bottom = 50 * Math.sin(t * Math.PI);

                    for (let x_col = startX; x_col <= endX; x_col++) {
                        const dx = endX - x_col;
                        let pct = dx / R;
                        pct = Math.max(0, Math.min(1, pct));

                        const theta_f = Math.asin(pct);
                        const theta_b = Math.PI - theta_f;

                        // Calculate vertical shift and height based on z height
                        const z_f = R * (1 - Math.cos(theta_f));
                        const z_b = R * (1 - Math.cos(theta_b));

                        // Top & Bottom vertical offsets for front and back
                        const dy_t_f = B_top * (z_f / (2 * R));
                        const dy_b_f = B_bottom * (z_f / (2 * R));

                        const dy_t_b = B_top * (z_b / (2 * R));
                        const dy_b_b = B_bottom * (z_b / (2 * R));

                        // ──── DRAW BACK SIDE SLICE FIRST ────
                        const u_b = x_right - R * theta_b;
                        if (u_b >= 0 && u_b <= W) {
                            const y_t = P.y + dy_t_b;
                            const y_b = P.y + P.h - dy_b_b;
                            const h_s = y_b - y_t;

                            const srcX = u_b * (imgW / W);
                            ctx.drawImage(curImg, srcX, 0, 1, imgH, x_col, y_t, sliceW, h_s);

                            // Tint back page cream
                            ctx.fillStyle = 'rgba(245, 242, 238, 0.22)';
                            ctx.fillRect(x_col, y_t, sliceW, h_s);

                            // Shadow inside curl
                            const shadow = 0.35 * (1 - Math.sin(theta_b));
                            ctx.fillStyle = 'rgba(0, 0, 0, ' + shadow + ')';
                            ctx.fillRect(x_col, y_t, sliceW, h_s);
                        }

                        // ──── DRAW FRONT SIDE SLICE SECOND ────
                        const u_f = x_right - R * theta_f;
                        if (u_f >= 0 && u_f <= W) {
                            const y_t = P.y + dy_t_f;
                            const y_b = P.y + P.h - dy_b_f;
                            const h_s = y_b - y_t;

                            const srcX = u_f * (imgW / W);
                            ctx.drawImage(curImg, srcX, 0, 1, imgH, x_col, y_t, sliceW, h_s);

                            // Shadow on outer edges of curl
                            const shadow = 0.25 * (1 - Math.sin(theta_f));
                            ctx.fillStyle = 'rgba(0, 0, 0, ' + shadow + ')';
                            ctx.fillRect(x_col, y_t, sliceW, h_s);

                            // Highlight on peak
                            const highlight = 0.12 * Math.pow(Math.sin(theta_f), 12);
                            ctx.fillStyle = 'rgba(255, 255, 255, ' + highlight + ')';
                            ctx.fillRect(x_col, y_t, sliceW, h_s);
                        }
                    }

                    // Draw fold edge accent line
                    ctx.save();
                    ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(P.x + x_f, P.y + B_top * 0.5);
                    ctx.lineTo(P.x + x_f, P.y + P.h - B_bottom * 0.5);
                    ctx.stroke();
                    ctx.restore();
                }
            }

            // Draw a vertical book spine shadow at the spine edge
            ctx.save();
            const spineX = this.dir === 'forward' ? P.x : P.x + P.w;
            const spineGrad = ctx.createLinearGradient(spineX, 0, spineX + (this.dir === 'forward' ? 25 : -25), 0);
            spineGrad.addColorStop(0, 'rgba(0, 0, 0, 0.18)');
            spineGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = spineGrad;
            ctx.fillRect(this.dir === 'forward' ? P.x : P.x + P.w - 25, P.y, 25, P.h);
            ctx.restore();
        }

        _drawPageStacks(ctx, P) {
            const maxT = 6;
            const cur = this.curPage;
            const tot = this.totalPages;
            const tRight = Math.round(maxT * ((tot - cur) / tot));
            const tLeft  = Math.round(maxT * ((cur - 1) / tot));

            // Draw left stack
            if (tLeft > 0) {
                ctx.save();
                ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)';
                ctx.lineWidth = 1;
                for (let i = 1; i <= tLeft; i++) {
                    ctx.beginPath();
                    ctx.moveTo(P.x - i, P.y + i * 0.5);
                    ctx.lineTo(P.x - i, P.y + P.h - i * 0.5);
                    ctx.stroke();
                }
                ctx.restore();
            }

            // Draw right stack
            if (tRight > 0) {
                ctx.save();
                ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)';
                ctx.lineWidth = 1;
                for (let i = 1; i <= tRight; i++) {
                    ctx.beginPath();
                    ctx.moveTo(P.x + P.w + i, P.y + i * 0.5);
                    ctx.lineTo(P.x + P.w + i, P.y + P.h - i * 0.5);
                    ctx.stroke();
                }
                ctx.restore();
            }
        }

        /* ===========================================================
           PROGRAMMATIC FLIP ANIMATION
           =========================================================== */

        _beginProgrammatic() {
            this._show();
            this.state     = 'animating';
            this.progress  = 0;
            this.animStart = performance.now();
            this.onStart(this.dir);
            this._tickProgrammatic();
        }

        _tickProgrammatic() {
            const elapsed = performance.now() - this.animStart;
            let t = Math.min(elapsed / this.animDur, 1);
            t = easeInOutCubic(t);
            this.progress = t;
            this._cornerFromProgress(t);
            this._render();
            if (t < 1) {
                this.rafId = requestAnimationFrame(() => this._tickProgrammatic());
            } else {
                this._finish(true);
            }
        }

        _cornerFromProgress(t) {
            const P = this.pr;
            if (this.dir === 'forward') {
                this.cx = P.x + P.w - t * (P.w * 1.06);
                this.cy = P.y + P.h - Math.sin(t * Math.PI) * P.h * 0.07;
            } else {
                this.cx = P.x + t * (P.w * 1.06);
                this.cy = P.y + P.h - Math.sin(t * Math.PI) * P.h * 0.07;
            }
        }

        /* ===========================================================
           SPRING ANIMATION (after drag release)
           =========================================================== */

        _tickSpring() {
            const dp = this._springTgt - this.progress;
            const force = dp * this._springK;
            this._springVel = (this._springVel + force) * this._springDamp;
            this.progress = Math.max(0, Math.min(1.05, this.progress + this._springVel));
            this._cornerFromProgress(Math.max(0, Math.min(1, this.progress)));
            this._render();

            if (Math.abs(dp) < 0.003 && Math.abs(this._springVel) < 0.003) {
                const completed = this._springTgt >= 0.99;
                this._finish(completed);
                return;
            }
            this.rafId = requestAnimationFrame(() => this._tickSpring());
        }

        /* ===========================================================
           FINISH / CANCEL
           =========================================================== */

        _finish(completed) {
            cancelAnimationFrame(this.rafId);
            if (completed) {
                this.curPage = this.tgtPage;
            }
            this.state = 'idle';
            this._hide();
            this.onComplete(completed ? this.tgtPage : this.curPage, completed, this.dir);
            this._preload(this.curPage);
            if (this._resolve) { this._resolve(completed); this._resolve = null; }
        }

        /* ===========================================================
           POINTER / TOUCH INTERACTION
           =========================================================== */

        _listen() {
            const vp = this.viewport;
            vp.addEventListener('mousedown',  this._onMD);
            document.addEventListener('mousemove', this._onMM);
            document.addEventListener('mouseup',   this._onMU);
            vp.addEventListener('touchstart', this._onTS, { passive: false });
            document.addEventListener('touchmove', this._onTM, { passive: false });
            document.addEventListener('touchend',  this._onTE);
        }

        _pos(cx, cy) {
            const r = this.viewport.getBoundingClientRect();
            return { x: cx - r.left, y: cy - r.top };
        }

        _zone(x, y) {
            const P = this.pr || this._getPageRect();
            if (!P) return null;
            if (y < P.y - 30 || y > P.y + P.h + 30) return null;
            if (x >= P.x + P.w * 0.65 && x <= P.x + P.w + 30) return 'forward';
            if (x <= P.x + P.w * 0.35 && x >= P.x - 30) return 'backward';
            return null;
        }

        // ── Mouse ──
        _onMD(e) { if (e.button === 0) this._ptrDown(e.clientX, e.clientY, e); }
        _onMM(e) { this._ptrMove(e.clientX, e.clientY, e); }
        _onMU(e) { this._ptrUp(e.clientX, e.clientY, e); }

        // ── Touch ──
        _onTS(e) { if (e.touches.length === 1) this._ptrDown(e.touches[0].clientX, e.touches[0].clientY, e); }
        _onTM(e) { if (e.touches.length === 1) this._ptrMove(e.touches[0].clientX, e.touches[0].clientY, e); }
        _onTE(e) { this._ptrUp(e.changedTouches[0].clientX, e.changedTouches[0].clientY, e); }

        // ── Unified pointer handlers ──
        _ptrDown(cx, cy, e) {
            if (this.state !== 'idle') return;
            const p = this._pos(cx, cy);
            // Measure page rect fresh
            this.pr = this._getPageRect();
            if (!this.pr) return;
            const zone = this._zone(p.x, p.y);
            if (!zone) return;
            if (zone === 'forward'  && this.curPage >= this.totalPages) return;
            if (zone === 'backward' && this.curPage <= 1) return;

            this.dir     = zone;
            this.tgtPage = zone === 'forward' ? this.curPage + 1 : this.curPage - 1;

            // Ensure images ready
            if (!this.imgs[this.curPage] || !this.imgs[this.tgtPage]) {
                this._load(this.tgtPage); return;
            }

            this._isPointerDown  = true;
            this._dragActive = false;
            this._startX = p.x; this._startY = p.y;
            this._lastX  = p.x; this._lastT  = performance.now();
            this._velX   = 0;
            if (e.cancelable) e.preventDefault();
        }

        _ptrMove(cx, cy, e) {
            if (!this._isPointerDown) return;
            const p = this._pos(cx, cy);
            const dx = p.x - this._startX;

            // Threshold to start drag
            if (!this._dragActive && Math.abs(dx) > 6) {
                if (!this.imgs[this.curPage] || !this.imgs[this.tgtPage]) return;
                this._dragActive = true;
                this.state = 'dragging';
                this._show();
                this.onStart(this.dir);
                // Set initial corner
                const P = this.pr;
                this.cx = this.dir === 'forward' ? P.x + P.w : P.x;
                this.cy = P.y + P.h;
            }

            if (this._dragActive) {
                this.cx = p.x;
                this.cy = p.y;
                // Velocity tracking
                const now = performance.now();
                const dt = now - this._lastT;
                if (dt > 0) this._velX = (p.x - this._lastX) / dt * 16;
                this._lastX = p.x; this._lastT = now;
                this._render();
                if (e.cancelable) e.preventDefault();
            }
        }

        _ptrUp(cx, cy, e) {
            if (!this._isPointerDown) return;
            this._isPointerDown = false;

            if (!this._dragActive) {
                // Was a click, not a drag → trigger programmatic flip
                if (this.state === 'idle' && this.dir) {
                    const tgt = this.tgtPage;
                    const d = this.dir;
                    this.flipTo(tgt, d);
                }
                this.dir = null;
                return;
            }

            this._dragActive = false;
            // Compute progress
            const P = this.pr;
            let prog;
            if (this.dir === 'forward') {
                prog = ((P.x + P.w) - this.cx) / P.w;
            } else {
                prog = (this.cx - P.x) / P.w;
            }
            prog = Math.max(0, Math.min(1, prog));

            // Decide: complete or cancel
            const velThresh = 2.5;
            const progThresh = 0.38;
            const shouldComplete =
                prog > progThresh ||
                (this.dir === 'forward'  && this._velX < -velThresh) ||
                (this.dir === 'backward' && this._velX >  velThresh);

            this.state       = 'animating';
            this.progress    = prog;
            this._springVel  = 0;
            this._springTgt  = shouldComplete ? 1.0 : 0.0;
            this._tickSpring();
        }
    }

    window.FlipEngine = FlipEngine;
})();
