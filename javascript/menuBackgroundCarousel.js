// ─── menuBackgroundCarousel.js — carrousel de fond + pixelisation hexagonale ──
// Extrait de multiplayerUi.js le 2026-07-11 (découpage sans risque, cf. CONTEXT.md §21) :
// sous-système indépendant (aucune fonction ci-dessous n'est appelée hors de ce fichier
// à part setupMenuBackgroundCarousel, le seul export utilisé par startupMenu.js).
// Le CSS (ex-ensureMenuBackgroundStyles(), ~140 lignes) est désormais statique dans
// css/startupMenu.css, chargé via @import dans css/style.css.

const MENU_BACKGROUND_ENDPOINT = './backgrounds.php';
const MENU_BACKGROUND_INTERVAL_MS = 12000;

// ─── Progressive hex-pixelization helpers ─────────────────────────────────────

const PIXEL_ANIM_PEAK = 16;                          // max hex radius (px)
const PIXEL_ANIM_MS   = MENU_BACKGROUND_INTERVAL_MS; // cycle matches slide duration
const HEX_MIN_R       = 3;                           // below this → full-res image

// Pre-computed unit vertices for a pointy-top hexagon (angles: 30°, 90°, …, 330°)
const HEX_VERTS = Array.from({ length: 6 }, (_, v) => {
  const a = Math.PI / 6 + v * Math.PI / 3;
  return [Math.cos(a), Math.sin(a)];
});

/**
 * Hex radius at elapsed ms: sin²(t·π) arc 1 → PIXEL_ANIM_PEAK → 1.
 * sin² has zero derivative at both ends → zero acceleration at start/end
 * → imperceptible entry and exit, no abrupt pop-in.
 */
function pixelSizeAt(elapsed) {
  const t = Math.min(elapsed / PIXEL_ANIM_MS, 1.0);
  const s = Math.sin(t * Math.PI);
  return 1 + (PIXEL_ANIM_PEAK - 1) * s * s;
}

/**
 * Get (or build + cache) an ImageData for `img` cover-fitted onto `canvas`.
 * Re-built only when the img src or canvas dimensions change.
 */
function getOrBuildImgData(canvas, img) {
  const w = canvas.width, h = canvas.height;
  const key = img.src + w + 'x' + h;
  if (canvas._cacheKey === key) return canvas._cacheData;

  if (!canvas._srcOff || canvas._srcOff.width !== w || canvas._srcOff.height !== h) {
    canvas._srcOff = new OffscreenCanvas(w, h);
  }
  const sc  = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const dw  = img.naturalWidth  * sc;
  const dh  = img.naturalHeight * sc;
  const offCtx = canvas._srcOff.getContext('2d', { willReadFrequently: true });
  offCtx.clearRect(0, 0, w, h);
  offCtx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  canvas._cacheData = offCtx.getImageData(0, 0, w, h);
  canvas._cacheKey  = key;
  return canvas._cacheData;
}

/** Draw one frame of hexagonal pixelization onto `canvas`. */
function drawFrame(canvas, img) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  if (!w || !h || !img.complete || !img.naturalWidth) return;

  const elapsed = performance.now() - canvas._pixStartTime;
  const R = pixelSizeAt(elapsed);

  ctx.clearRect(0, 0, w, h);

  if (R < HEX_MIN_R) {
    // Below threshold: sharp full-res image
    const sc = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    const dw = img.naturalWidth * sc, dh = img.naturalHeight * sc;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  } else {
    // Hex-pixelized phase: tessellate canvas with hex cells, each filled with
    // the source color sampled at the cell centre.
    const { data } = getOrBuildImgData(canvas, img);
    const hexW = Math.sqrt(3) * R; // centre-to-centre horizontal distance
    const rowH = R * 1.5;          // centre-to-centre vertical distance
    const cols = Math.ceil(w / hexW) + 2;
    const rows = Math.ceil(h / rowH) + 2;

    for (let row = -1; row < rows; row++) {
      const cy   = row * rowH;
      const xOff = (row & 1) ? hexW * 0.5 : 0;
      for (let col = -1; col < cols; col++) {
        const cx = col * hexW + xOff;
        // Sample source colour at hex centre (clamped to canvas bounds)
        const px = Math.max(0, Math.min(w - 1, Math.round(cx))) | 0;
        const py = Math.max(0, Math.min(h - 1, Math.round(cy))) | 0;
        const i  = (py * w + px) << 2;
        ctx.fillStyle = `rgb(${data[i]},${data[i + 1]},${data[i + 2]})`;
        // Draw pointy-top hexagon
        ctx.beginPath();
        for (let v = 0; v < 6; v++) {
          const vx = cx + R * HEX_VERTS[v][0];
          const vy = cy + R * HEX_VERTS[v][1];
          v === 0 ? ctx.moveTo(vx, vy) : ctx.lineTo(vx, vy);
        }
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  if (elapsed < PIXEL_ANIM_MS) {
    canvas._rafId = requestAnimationFrame(() => drawFrame(canvas, img));
  }
}

/** Start (or restart) the hex-pixelization animation on `canvas` with `img`. */
function startPixelAnim(canvas, img) {
  cancelAnimationFrame(canvas._rafId);
  const parent = canvas.parentElement;
  if (parent) {
    const pw = parent.offsetWidth  || 1920;
    const ph = parent.offsetHeight || 1080;
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width    = pw;
      canvas.height   = ph;
      canvas._cacheKey = null; // invalidate colour cache on resize
    }
  }
  canvas._pixStartTime = performance.now();
  drawFrame(canvas, img);
}

// ─── Carousel ────────────────────────────────────────────────────────────────

export async function setupMenuBackgroundCarousel(overlay) {
  const host = overlay.querySelector('.mode-background-carousel');
  if (!host) return;

  const images = await fetchMenuBackgroundImages();
  if (!overlay.isConnected || !images.length) return;

  // Two slide divs, each with a canvas for pixelized drawing
  const slides   = [document.createElement('div'),    document.createElement('div')];
  const canvases = [document.createElement('canvas'), document.createElement('canvas')];
  const imgObjs  = [new Image(),                       new Image()];

  for (let i = 0; i < 2; i++) {
    slides[i].className = 'mode-background-slide';
    slides[i].appendChild(canvases[i]);
    host.appendChild(slides[i]);
  }

  let index  = Math.floor(Math.random() * images.length);
  let active = 0;

  const show = () => {
    const imageUrl  = images[index % images.length];
    const nextSlide = slides[active];
    const prevSlide = slides[1 - active];
    const canvas    = canvases[active];
    const imgObj    = imgObjs[active];

    prevSlide.classList.remove('is-active');

    const onReady = () => {
      if (!overlay.isConnected) return;
      startPixelAnim(canvas, imgObj);
      nextSlide.classList.add('is-active');
    };

    if (imgObj.complete && imgObj.naturalWidth && imgObj.src.endsWith(imageUrl.replace(/^.*\//, ''))) {
      onReady();
    } else {
      imgObj.onload = onReady;
      imgObj.onerror = () => nextSlide.classList.add('is-active');
      imgObj.src = imageUrl;
    }

    active  = 1 - active;
    index  += 1 + Math.floor(Math.random() * Math.max(1, images.length - 1));
  };

  show();

  if (images.length <= 1) return;
  const timer = window.setInterval(() => {
    if (!overlay.isConnected) {
      window.clearInterval(timer);
      return;
    }
    show();
  }, MENU_BACKGROUND_INTERVAL_MS);
}

async function fetchMenuBackgroundImages() {
  try {
    const response = await fetch(MENU_BACKGROUND_ENDPOINT, { cache: 'no-store' });
    if (!response.ok) return [];
    const data = await response.json();
    const images = Array.isArray(data.images) ? data.images : [];
    return shuffle(images.filter(isSafeBackgroundPath));
  } catch (_) {
    return [];
  }
}

function isSafeBackgroundPath(path) {
  return typeof path === 'string'
    && /^backgrounds\/[^?#]+\.(?:avif|webp|png|jpe?g|gif)$/i.test(path);
}

function shuffle(values) {
  const copy = values.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
