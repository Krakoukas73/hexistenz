import { initScene } from './scene.js';
import { startMenuMusic, startIngameMusic } from './soundDesign.js';
import { DECK_SIZE } from './config.js';
import { createDeck } from './tileGenerator.js';
import { createSpecialCells } from './specialCells.js';
import { createBonusCells } from './bonusCells.js';
import { createMissionManager } from './missions.js';
import { makeHexKey } from './hex.js';
import { createRoom, generateRoomCode, getOrCreatePlayerId, joinRoom, listRooms } from './multiplayerClient.js';
import { getWorldShapeMode } from './worldCurvature.js';
import { LUT_HELP, ensureHelpTooltip, attachHelpTooltip, hideHelpTooltip } from './help.js';

const MENU_BACKGROUND_ENDPOINT = './backgrounds.php';
const MENU_BACKGROUND_INTERVAL_MS = 12000;
const MENU_BACKGROUND_FADE_MS = 1100;

export function showStartupScreen() {
  startMenuMusic();
  const urlRoomCode = new URLSearchParams(window.location.search).get('multi');
  renderShell(urlRoomCode ? 'multi' : 'home', normalizeCode(urlRoomCode ?? ''));
}

function renderShell(screen = 'home', initialCode = '') {
  const overlay = document.createElement('div');
  overlay.className = 'mode-screen mode-screen--with-background';
  overlay.innerHTML = `
    <div class="mode-background-carousel" aria-hidden="true"></div>
    <section class="mode-panel">
      <img class="mode-logo" src="images/logo2.png" alt="Hexistenz" draggable="false" />

      <p class="mode-copy"></p>
      <div class="mode-content"></div>
      <div class="multi-status" aria-live="polite"></div>
    </section>
  `;
  document.body.appendChild(overlay);
  ensureHelpTooltip();
  ensureMenuBackgroundStyles();
  setupMenuBackgroundCarousel(overlay);

  if (screen === 'multi') renderWorldShapeChoice(overlay, () => renderMulti(overlay, initialCode));
  else renderHome(overlay);
}

function ensureMenuBackgroundStyles() {
  if (document.getElementById('modeBackgroundCarouselStyles')) return;

  const style = document.createElement('style');
  style.id = 'modeBackgroundCarouselStyles';
  style.textContent = `
    .mode-screen--with-background {
      overflow: visible;
      isolation: isolate;
      background:
        radial-gradient(circle at 50% 15%, rgba(115, 190, 255, 0.16), transparent 34%),
        linear-gradient(135deg, #071019 0%, #111827 46%, #05070b 100%);
    }

    .mode-background-carousel {
      position: absolute;
      inset: 0;
      z-index: 0;
      overflow: hidden;
      background:
        radial-gradient(circle at center, rgba(22, 38, 56, 0.36), rgba(2, 5, 9, 0.44));
    }

    .mode-background-carousel::after {
      content: '';
      position: absolute;
      inset: 0;
      z-index: 3;
      pointer-events: none;
      background:
        radial-gradient(circle at 50% 42%, rgba(0, 0, 0, 0.02), rgba(0, 0, 0, 0.24) 76%),
        linear-gradient(180deg, rgba(2, 6, 12, 0.04), rgba(2, 6, 12, 0.22));
      backdrop-filter: blur(0.18px);
    }

    .mode-background-slide {
      position: absolute;
      inset: -3%;
      z-index: 1;
      opacity: 0;
      transform: scale(1.0);
      filter: saturate(1.18) contrast(1.07) brightness(1.03);
      transition:
        opacity ${MENU_BACKGROUND_FADE_MS}ms ease;
      will-change: opacity;
    }

    .mode-background-slide.is-active {
      z-index: 2;
      opacity: 1;
    }

    .mode-background-slide canvas {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      display: block;
    }

    .mode-screen--with-background .mode-panel {
      position: relative;
      overflow: visible !important;
      z-index: 4;
      margin-top: clamp(120px, 18vh, 180px);
      
	  
	  padding-top: clamp(320px, 41vh, 410px);
	  
	  
	  
      background:
        linear-gradient(160deg, rgba(8, 16, 26, 0.46), rgba(4, 8, 14, 0.28)),
        rgba(5, 10, 18, 0.24);
      border: 1px solid rgba(220, 240, 255, 0.28);
      box-shadow:
        0 22px 70px rgba(0, 0, 0, 0.34),
        inset 0 1px 0 rgba(255, 255, 255, 0.12),
        inset 0 0 44px rgba(120, 180, 255, 0.045);
      backdrop-filter: blur(10px) saturate(1.12);
      -webkit-backdrop-filter: blur(10px) saturate(1.12);
    }

    .mode-screen--with-background .mode-panel::before {
      content: '';
      position: absolute;
      inset: 0;
      z-index: -1;
      border-radius: inherit;
      background:
        radial-gradient(circle at 18% 0%, rgba(255, 255, 255, 0.11), transparent 34%),
        radial-gradient(circle at 100% 100%, rgba(95, 170, 255, 0.08), transparent 40%);
      pointer-events: none;
    }

    .mode-logo {
      display: block;
      width: min(520px, 78vw);
      max-height: none;
      margin: 0;
      position: absolute;
      top: clamp(-230px, -26vh, -150px);
      left: 50%;
      transform: translateX(-50%);
      z-index: 8;
      object-fit: contain;
      user-select: none;
      pointer-events: none;
      filter: drop-shadow(0 18px 34px rgba(0, 0, 0, 0.52));
    }

    @media (max-height: 1080px) {
      .mode-screen--with-background .mode-panel {
        padding-top: clamp(220px, 28vh, 300px);
      }
      .mode-logo {
        width: min(380px, 60vw);
        top: clamp(-190px, -20vh, -120px);
      }
    }

    @media (max-height: 760px) {
      .mode-screen--with-background .mode-panel {
        margin-top: 112px;
        padding-top: 250px;
      }

      .mode-logo {
        width: min(440px, 74vw);
        top: -150px;
      }
    }

    @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
      .mode-screen--with-background .mode-panel {
        background: rgba(5, 10, 18, 0.62);
      }
    }
  `;
  document.head.appendChild(style);
}

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

async function setupMenuBackgroundCarousel(overlay) {
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

function cssUrl(value) {
  return String(value).replace(/["\\\n\r\f]/g, match => `\\${match}`);
}

function getPlayerNameFromCookie() {
  const match = document.cookie.split(';')
    .map(c => c.trim())
    .find(c => c.startsWith('hexistenz_player_name='));
  return match ? decodeURIComponent(match.split('=')[1] ?? '') : '';
}

function savePlayerNameCookie(name) {
  const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `hexistenz_player_name=${encodeURIComponent(name)}; expires=${expires}; path=/; SameSite=Lax`;
}

/**
 * Pose la question du prénom avant le choix platiste/bouliste.
 * Le nom est toujours demandé (pré-rempli avec la valeur cookie).
 */
function renderNameChoice(overlay, onConfirmed) {
  hideHelpTooltip();
  const savedName = getPlayerNameFromCookie();
  overlay.querySelector('.mode-copy').textContent = 'Comment tu t\'appelles ?';
  overlay.querySelector('.mode-content').innerHTML = `
    <label class="mode-label">Ton prénom (ou pseudo)</label>
    <input data-field="player-name" maxlength="24" value="${escapeHtml(savedName)}" placeholder="Ex : Rémi" autocomplete="given-name" />
    <div class="mode-actions">
      <button data-action="confirm">CONTINUER →</button>
    </div>
  `;
  setStatus(overlay, '');

  attachHelpTooltip(overlay.querySelector('[data-action="confirm"]'), LUT_HELP['menu.confirm']);
  const input = overlay.querySelector('[data-field="player-name"]');
  requestAnimationFrame(() => { input.focus(); input.select(); });

  const confirm = () => {
    const name = input.value.trim() || 'Joueur';
    savePlayerNameCookie(name);
    onConfirmed(name);
  };

  overlay.querySelector('[data-action="confirm"]').addEventListener('click', confirm);
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); confirm(); }
  });
}

function renderHome(overlay) {
  hideHelpTooltip();
  overlay.querySelector('.mode-copy').textContent = 'Choisis le mode de jeu : solo ou multijoueur.';
  overlay.querySelector('.mode-content').innerHTML = `
    <div class="mode-actions">
      <button data-action="solo">SOLO</button>
      <button data-action="multi" class="secondary">MULTI</button>
    </div>
  `;
  attachHelpTooltip(overlay.querySelector('[data-action="solo"]'), LUT_HELP['menu.solo']);
  attachHelpTooltip(overlay.querySelector('[data-action="multi"]'), LUT_HELP['menu.multi']);

  overlay.querySelector('[data-action="solo"]').addEventListener('click', () => {
    renderNameChoice(overlay, playerName => {
      renderWorldShapeChoice(overlay, worldShapeMode => {
        startIngameMusic();
        hideHelpTooltip();
        overlay.remove();
        initScene({ mode: 'solo', worldShapeMode, playerName });
      });
    });
  });

  overlay.querySelector('[data-action="multi"]').addEventListener('click', () => {
    renderWorldShapeChoice(overlay, () => renderMulti(overlay));
  });
}


function renderWorldShapeChoice(overlay, onSelected) {
  hideHelpTooltip();
  const storedMode = normalizeWorldShapeMode(localStorage.getItem('dorfromantik.worldShapeMode') || getWorldShapeMode());
  overlay.querySelector('.mode-copy').textContent = 'Choisis la géométrie de ta planète :';
  overlay.querySelector('.mode-content').innerHTML = `
    <div class="mode-actions world-shape-actions">
      <button data-action="platiste" class="${storedMode === 'platiste' ? '' : 'secondary'}">PLATISTE</button>
      <button data-action="bouliste" class="${storedMode === 'bouliste' ? '' : 'secondary'}">BOULISTE</button>
    </div>
	<br>
    <p class="mode-copy mode-shape-note">On te conseille "<i>platiste</i>" pour débuter. Tu pourras changer de faction à n'importe quel moment en jeu, parce que même les planètes ont droit à une crise identitaire.</p>
  `;
  setStatus(overlay, '');
  attachHelpTooltip(overlay.querySelector('[data-action="platiste"]'), LUT_HELP['menu.platiste']);
  attachHelpTooltip(overlay.querySelector('[data-action="bouliste"]'), LUT_HELP['menu.bouliste']);

  for (const mode of ['bouliste', 'platiste']) {
    overlay.querySelector(`[data-action="${mode}"]`).addEventListener('click', () => {
      overlay.dataset.worldShapeMode = mode;
      localStorage.setItem('dorfromantik.worldShapeMode', mode);
      onSelected(mode);
    });
  }
}

function renderMulti(overlay, initialCode = '') {
  hideHelpTooltip();
  overlay.querySelector('.mode-copy').textContent = 'Créer une partie ou rejoindre une partie existante avec un code.';
  overlay.querySelector('.mode-content').innerHTML = `
    <label>Pseudo</label>
    <input data-field="name" maxlength="24" value="${escapeHtml(localStorage.getItem('dorfromantik.multiplayer.name') || '')}" placeholder="Ton pseudo" />
    <label>Code partie</label>
    <input data-field="code" maxlength="12" value="${escapeHtml(initialCode)}" placeholder="Ex : 377EA7" />
    <label data-role="availableRoomsLabel">Parties disponibles / backups</label>
    <select data-field="availableRooms">
      <option value="">Chargement des parties...</option>
    </select>
    <div class="multi-actions">
      <button data-action="create">Créer</button>
      <button data-action="join" class="secondary">Rejoindre</button>
      <button data-action="back" class="secondary">Retour</button>
    </div>
  `;
  setStatus(overlay, '');

  attachHelpTooltip(overlay.querySelector('[data-action="create"]'), LUT_HELP['menu.create']);
  attachHelpTooltip(overlay.querySelector('[data-action="join"]'), LUT_HELP['menu.join']);
  attachHelpTooltip(overlay.querySelector('[data-action="back"]'), LUT_HELP['menu.back']);
  overlay.querySelector('[data-action="back"]').addEventListener('click', () => renderHome(overlay));
  overlay.querySelector('[data-action="create"]').addEventListener('click', () => handleCreate(overlay));
  overlay.querySelector('[data-action="join"]').addEventListener('click', () => handleJoin(overlay));

  const roomsSelect = overlay.querySelector('[data-field="availableRooms"]');
  roomsSelect.addEventListener('change', () => {
    const selectedCode = normalizeCode(roomsSelect.value);
    if (selectedCode) overlay.querySelector('[data-field="code"]').value = selectedCode;
  });
  refreshAvailableRooms(overlay);
}

async function refreshAvailableRooms(overlay) {
  const select = overlay.querySelector('[data-field="availableRooms"]');
  if (!select) return;

  try {
    const response = await listRooms();
    const rooms = Array.isArray(response.rooms) ? response.rooms : [];
    updateAvailableRoomsLabel(overlay, rooms.length);
    select.innerHTML = '';

    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = rooms.length ? 'Sélectionner une partie existante' : 'Aucune partie trouvée dans /json/games';
    select.appendChild(empty);

    for (const room of rooms) {
      const code = normalizeCode(room.code);
      if (!code) continue;
      const option = document.createElement('option');
      option.value = code;
      option.textContent = formatRoomOption(room);
      select.appendChild(option);
    }
  } catch (error) {
    updateAvailableRoomsLabel(overlay, null);
    select.innerHTML = '<option value="">Liste indisponible - serveur PHP muet</option>';
  }
}

function updateAvailableRoomsLabel(overlay, count) {
  const label = overlay.querySelector('[data-role="availableRoomsLabel"]');
  if (!label) return;
  if (typeof count !== 'number') {
    label.textContent = 'Parties disponibles / backups';
    return;
  }
  label.textContent = `${count} partie${count > 1 ? 's' : ''} disponible${count > 1 ? 's' : ''} / backups`;
}

function formatRoomOption(room) {
  const code = normalizeCode(room.code);
  const players = Number(room.players || 0);
  const tiles = Number(room.tiles || 0);
  const updatedAt = Number(room.updatedAt || 0);
  const date = updatedAt > 0 ? new Date(updatedAt * 1000).toLocaleString() : 'date inconnue';
  return `${code} — ${players} joueur${players > 1 ? 's' : ''}, ${tiles} tuile${tiles > 1 ? 's' : ''}, ${date}`;
}

async function handleCreate(overlay) {
  const playerName = readPlayerName(overlay);
  const playerId = getOrCreatePlayerId();
  const typedCode = normalizeCode(overlay.querySelector('[data-field="code"]')?.value);
  const roomCode = typedCode || generateRoomCode();
  const initialState = createInitialMultiplayerState({ roomCode, playerId, playerName });
  setStatus(overlay, `Création de la partie ${roomCode}...`);

  try {
    const response = await createRoom({ code: roomCode, playerId, playerName, state: initialState });
    const state = response.room?.state || initialState;
    startMultiplayerScene(overlay, { roomCode, playerId, playerName, state });
  } catch (error) {
    setStatus(overlay, error.message || String(error));
  }
}

async function handleJoin(overlay) {
  const playerName = readPlayerName(overlay);
  const playerId = getOrCreatePlayerId();
  const roomCode = normalizeCode(overlay.querySelector('[data-field="code"]').value);

  if (!roomCode) {
    setStatus(overlay, 'Code partie manquant.');
    return;
  }

  setStatus(overlay, `Connexion à la partie ${roomCode}...`);

  try {
    const response = await joinRoom({
      code: roomCode,
      playerId,
      playerName,
      playerState: {
        id: playerId,
        name: playerName,
        deck: createDeck(DECK_SIZE).map(clonePlain),
        rotationIndex: 0,
        scoreContribution: 0,
        lastSeen: Date.now()
      }
    });
    const state = response.room?.state;
    if (!state) throw new Error(`Partie ${roomCode} trouvée, mais snapshot absent. JSON moisi refusé.`);
    startMultiplayerScene(overlay, { roomCode, playerId, playerName, state });
  } catch (error) {
    setStatus(overlay, error.message || String(error));
  }
}

function startMultiplayerScene(overlay, { roomCode, playerId, playerName, state }) {
  localStorage.setItem('dorfromantik.multiplayer.name', playerName);
  history.replaceState(null, '', `${window.location.pathname}?multi=${encodeURIComponent(roomCode)}`);
  const worldShapeMode = normalizeWorldShapeMode(overlay.dataset.worldShapeMode);
  localStorage.setItem('dorfromantik.worldShapeMode', worldShapeMode);
  startIngameMusic();
  hideHelpTooltip();
  overlay.remove();
  initScene({
    mode: 'multi',
    worldShapeMode,
    initialState: state,
    multiplayer: { roomCode, playerId, playerName }
  });
}

function createInitialMultiplayerState({ roomCode, playerId, playerName }) {
  const specialCells = createSpecialCells();
  const bonusCells = createBonusCells(new Set(specialCells.keys()));
  const manager = createMissionManager();
  const playerDeck = createDeck(DECK_SIZE);

  return {
    schemaVersion: 1,
    roomCode,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    stateVersion: 1,
    totalScore: 0,
    rotationIndex: 0,
    gameOver: false,
    placedTiles: [],
    placementHistory: [],
    specialCells: [...specialCells.values()].map(clonePlain),
    bonusCells: [...bonusCells.values()].map(clonePlain),
    missionManager: serializeMissionManager(manager),
    players: {
      [playerId]: {
        id: playerId,
        name: playerName,
        deck: playerDeck.map(clonePlain),
        rotationIndex: 0,
        scoreContribution: 0,
        lastSeen: Date.now()
      }
    },
    cursors: {}
  };
}

function serializeMissionManager(manager) {
  return {
    active: manager.active.map(clonePlain),
    generatedTileIds: [...manager.generatedTileIds],
    targetLevelByType: Object.fromEntries(manager.targetLevelByType),
    nextId: manager.nextId,
    turn: manager.turn
  };
}

function clonePlain(value) {
  return JSON.parse(JSON.stringify(value));
}

function readPlayerName(overlay) {
  const value = overlay.querySelector('[data-field="name"]').value.trim().slice(0, 24);
  return value || `Joueur-${Math.floor(Math.random() * 900 + 100)}`;
}

function normalizeWorldShapeMode(value) {
  return value === 'platiste' ? 'platiste' : 'bouliste';
}

function normalizeCode(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
}

function setStatus(overlay, message) {
  overlay.querySelector('.multi-status').textContent = message;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#039;',
    '"': '&quot;'
  })[char]);
}
