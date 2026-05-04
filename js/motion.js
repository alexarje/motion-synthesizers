/**
 * motion.js – Webcam motion detection library
 *
 * Uses frame-differencing to compute:
 *   x        – horizontal centroid of motion (0 = left, 1 = right, mirrored)
 *   y        – vertical centroid of motion   (0 = top,  1 = bottom)
 *   magnitude – normalised motion energy     (0 = still, 1 = lots of movement)
 *
 * Falls back to mouse / touch position when camera is unavailable.
 */

class MotionDetector {
  /**
   * @param {object} opts
   * @param {number} [opts.width=320]      Processing resolution width
   * @param {number} [opts.height=240]     Processing resolution height
   * @param {number} [opts.threshold=20]   Pixel-diff threshold (0-255)
   * @param {number} [opts.smoothing=0.82] EMA smoothing factor (0-1, higher = smoother)
   * @param {function} [opts.onUpdate]     Callback({x, y, magnitude})
   */
  constructor(opts = {}) {
    this.width      = opts.width      || 320;
    this.height     = opts.height     || 240;
    this.threshold  = opts.threshold  || 20;
    this.smoothing  = opts.smoothing  !== undefined ? opts.smoothing : 0.82;
    this.onUpdate   = opts.onUpdate   || null;

    // Public smoothed outputs (0-1)
    this.x         = 0.5;
    this.y         = 0.5;
    this.magnitude = 0;

    this._prev    = null;
    this._running = false;
    this._procCanvas = null;
    this._procCtx    = null;
    this._overlayCtx = null;
    this._video      = null;
    this._usingMouse = false;
  }

  /* ── Public API ─────────────────────────────────────────────────── */

  /**
   * Start camera-based motion detection.
   * @param {HTMLVideoElement} videoEl
   * @param {HTMLCanvasElement} overlayCanvasEl  Canvas drawn on top of the video
   * @returns {Promise<boolean>}  true if camera was granted
   */
  async start(videoEl, overlayCanvasEl) {
    this._video      = videoEl;
    this._overlayCtx = overlayCanvasEl.getContext('2d');
    overlayCanvasEl.width  = this.width;
    overlayCanvasEl.height = this.height;

    // Hidden processing canvas
    this._procCanvas        = document.createElement('canvas');
    this._procCanvas.width  = this.width;
    this._procCanvas.height = this.height;
    this._procCtx = this._procCanvas.getContext('2d', { willReadFrequently: true });

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width:  { ideal: this.width },
          height: { ideal: this.height },
          facingMode: 'user'
        }
      });
      videoEl.srcObject = stream;
      await new Promise(res => {
        videoEl.onloadedmetadata = res;
        setTimeout(res, 3000); // safety timeout
      });
      await videoEl.play();
      this._running = true;
      this._loop();
      return true;
    } catch (err) {
      console.warn('MotionDetector: camera unavailable –', err.message);
      return false;
    }
  }

  /** Stop processing and release camera. */
  stop() {
    this._running = false;
    if (this._video && this._video.srcObject) {
      this._video.srcObject.getTracks().forEach(t => t.stop());
    }
  }

  /**
   * Activate mouse / touch fallback (call after start() returns false, or as default).
   * @param {HTMLElement} containerEl  The element to listen on (usually the webcam wrapper)
   */
  enableMouseFallback(containerEl) {
    this._usingMouse = true;
    let lastX = 0.5, lastY = 0.5, active = false;

    const update = (nx, ny) => {
      const s = 0.7;
      this.x         = s * this.x         + (1 - s) * nx;
      this.y         = s * this.y         + (1 - s) * ny;
      this.magnitude = s * this.magnitude + (1 - s) * 0.45;
      if (this.onUpdate) this.onUpdate({ x: this.x, y: this.y, magnitude: this.magnitude });
    };

    const toNorm = (e, el) => {
      const r = el.getBoundingClientRect();
      return [
        Math.max(0, Math.min(1, (e.clientX - r.left)  / r.width)),
        Math.max(0, Math.min(1, (e.clientY - r.top)   / r.height))
      ];
    };

    containerEl.style.cursor = 'crosshair';

    containerEl.addEventListener('mousemove', e => {
      const [nx, ny] = toNorm(e, containerEl);
      [lastX, lastY] = [nx, ny];
      update(nx, ny);
      active = true;
    });

    containerEl.addEventListener('mouseleave', () => {
      active = false;
      const decay = () => {
        this.magnitude *= 0.93;
        if (this.magnitude > 0.002) requestAnimationFrame(decay);
        else this.magnitude = 0;
      };
      decay();
    });

    containerEl.addEventListener('touchmove', e => {
      e.preventDefault();
      const t = e.touches[0];
      const [nx, ny] = toNorm(t, containerEl);
      update(nx, ny);
    }, { passive: false });
  }

  /* ── Internal ────────────────────────────────────────────────────── */

  _loop() {
    if (!this._running) return;
    this._processFrame();
    requestAnimationFrame(() => this._loop());
  }

  _processFrame() {
    const { _video: v, _procCtx: ctx, width: w, height: h } = this;
    if (!v || v.readyState < 2) return;

    // Draw mirrored frame into processing canvas
    ctx.save();
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(v, 0, 0, w, h);
    ctx.restore();

    const frame = ctx.getImageData(0, 0, w, h);

    if (this._prev) {
      const res = this._analyze(this._prev, frame.data, w, h);

      const s = this.smoothing;
      this.x         = s * this.x         + (1 - s) * res.x;
      this.y         = s * this.y         + (1 - s) * res.y;
      this.magnitude = s * this.magnitude + (1 - s) * res.magnitude;

      this._drawOverlay(res);

      if (this.onUpdate) {
        this.onUpdate({ x: this.x, y: this.y, magnitude: this.magnitude });
      }
    }

    this._prev = new Uint8ClampedArray(frame.data);
  }

  _analyze(prev, curr, w, h) {
    let total = 0, sx = 0, sy = 0;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const d = (Math.abs(curr[i]   - prev[i]) +
                   Math.abs(curr[i+1] - prev[i+1]) +
                   Math.abs(curr[i+2] - prev[i+2])) / 3;
        if (d > this.threshold) {
          total += d;
          sx    += x * d;
          sy    += y * d;
        }
      }
    }

    return {
      magnitude: Math.min(1, total / (w * h * 6)),
      x: total > 0 ? sx / total / w : 0.5,
      y: total > 0 ? sy / total / h : 0.5
    };
  }

  _drawOverlay(res) {
    const ctx  = this._overlayCtx;
    const w    = this.width;
    const h    = this.height;
    if (!ctx) return;

    ctx.clearRect(0, 0, w, h);

    // Smoothed centroid crosshair
    const smX = this.x * w;
    const smY = this.y * h;
    ctx.strokeStyle = 'rgba(255,220,50,0.45)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(smX, 0); ctx.lineTo(smX, h);
    ctx.moveTo(0, smY); ctx.lineTo(w, smY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Raw motion centroid circle
    if (res.magnitude > 0.008) {
      const rx = res.x * w;
      const ry = res.y * h;
      const r  = Math.max(8, res.magnitude * 80);
      const alpha = Math.min(1, res.magnitude * 4);

      ctx.beginPath();
      ctx.arc(rx, ry, r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(80,220,120,${alpha})`;
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(rx, ry, 4, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(80,220,120,${alpha})`;
      ctx.fill();
    }

    // Magnitude meter (bottom bar)
    const mw = this.magnitude * w;
    ctx.fillStyle = `rgba(80,180,255,0.35)`;
    ctx.fillRect(0, h - 4, mw, 4);
  }
}
