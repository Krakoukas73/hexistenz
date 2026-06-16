import { initScene } from './scene.js';
import { DECK_SIZE } from './config.js';
import { createDeck } from './tileGenerator.js';
import { createSpecialCells } from './stable/specialCells.js';
import { createBonusCells } from './stable/bonusCells.js';
import { createMissionManager } from './missions.js';
import { makeHexKey } from './stable/hex.js';
import { createRoom, generateRoomCode, getOrCreatePlayerId, joinRoom, listRooms } from './stable/multiplayerClient.js';
import { getWorldShapeMode } from './stable/worldCurvature.js';

const MENU_BACKGROUND_ENDPOINT = './backgrounds.php';
const MENU_BACKGROUND_INTERVAL_MS = 6500;
const MENU_BACKGROUND_FADE_MS = 1100;

export function showStartupScreen() {
  const urlRoomCode = new URLSearchParams(window.location.search).get('multi');
  renderShell(urlRoomCode ? 'multi' : 'home', normalizeCode(urlRoomCode ?? ''));
}

function renderShell(screen = 'home', initialCode = '') {
  const overlay = document.createElement('div');
  overlay.className = 'mode-screen mode-screen--with-background';
  overlay.innerHTML = `
    <div class="mode-background-carousel" aria-hidden="true"></div>
    <section class="mode-panel">
      <h1>HEXISTENZ</h1>
      <p class="mode-copy"></p>
      <div class="mode-content"></div>
      <div class="multi-status" aria-live="polite"></div>
    </section>
  `;
  document.body.appendChild(overlay);
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
      overflow: hidden;
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
        radial-gradient(circle at center, rgba(22, 38, 56, 0.86), rgba(2, 5, 9, 0.96));
    }

    .mode-background-carousel::after {
      content: '';
      position: absolute;
      inset: 0;
      z-index: 3;
      pointer-events: none;
      background:
        radial-gradient(circle at 50% 42%, rgba(0, 0, 0, 0.10), rgba(0, 0, 0, 0.76) 76%),
        linear-gradient(180deg, rgba(2, 6, 12, 0.18), rgba(2, 6, 12, 0.72));
      backdrop-filter: blur(1px);
    }

    .mode-background-slide {
      position: absolute;
      inset: -3%;
      z-index: 1;
      opacity: 0;
      background-position: center;
      background-size: cover;
      transform: scale(1.035);
      filter: saturate(1.08) contrast(1.04) brightness(0.78);
      transition:
        opacity ${MENU_BACKGROUND_FADE_MS}ms ease,
        transform ${MENU_BACKGROUND_INTERVAL_MS}ms linear;
      will-change: opacity, transform;
    }

    .mode-background-slide.is-active {
      z-index: 2;
      opacity: 1;
      transform: scale(1.085);
    }

    .mode-screen--with-background .mode-panel {
      position: relative;
      z-index: 4;
      background:
        linear-gradient(160deg, rgba(8, 16, 26, 0.64), rgba(4, 8, 14, 0.42)),
        rgba(5, 10, 18, 0.38);
      border: 1px solid rgba(220, 240, 255, 0.28);
      box-shadow:
        0 22px 70px rgba(0, 0, 0, 0.48),
        inset 0 1px 0 rgba(255, 255, 255, 0.12),
        inset 0 0 44px rgba(120, 180, 255, 0.06);
      backdrop-filter: blur(18px) saturate(1.18);
      -webkit-backdrop-filter: blur(18px) saturate(1.18);
    }

    .mode-screen--with-background .mode-panel::before {
      content: '';
      position: absolute;
      inset: 0;
      z-index: -1;
      border-radius: inherit;
      background:
        radial-gradient(circle at 18% 0%, rgba(255, 255, 255, 0.18), transparent 34%),
        radial-gradient(circle at 100% 100%, rgba(95, 170, 255, 0.13), transparent 40%);
      pointer-events: none;
    }

    @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
      .mode-screen--with-background .mode-panel {
        background: rgba(5, 10, 18, 0.86);
      }
    }
  `;
  document.head.appendChild(style);
}

async function setupMenuBackgroundCarousel(overlay) {
  const host = overlay.querySelector('.mode-background-carousel');
  if (!host) return;

  const images = await fetchMenuBackgroundImages();
  if (!overlay.isConnected || !images.length) return;

  const slides = [document.createElement('div'), document.createElement('div')];
  for (const slide of slides) {
    slide.className = 'mode-background-slide';
    host.appendChild(slide);
  }

  let index = Math.floor(Math.random() * images.length);
  let active = 0;

  const show = () => {
    const imageUrl = images[index % images.length];
    const next = slides[active];
    const prev = slides[1 - active];

    next.style.backgroundImage = `url("${cssUrl(imageUrl)}")`;
    next.classList.add('is-active');
    prev.classList.remove('is-active');

    active = 1 - active;
    index += 1 + Math.floor(Math.random() * Math.max(1, images.length - 1));
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

function renderHome(overlay) {
  overlay.querySelector('.mode-copy').textContent = 'Choisis le mode de jeu : solo ou multijoueur.';
  overlay.querySelector('.mode-content').innerHTML = `
    <div class="mode-actions">
      <button data-action="solo">SOLO</button>
      <button data-action="multi" class="secondary">MULTI</button>
    </div>
  `;

  overlay.querySelector('[data-action="solo"]').addEventListener('click', () => {
    renderWorldShapeChoice(overlay, worldShapeMode => {
      overlay.remove();
      initScene({ mode: 'solo', worldShapeMode });
    });
  });

  overlay.querySelector('[data-action="multi"]').addEventListener('click', () => {
    renderWorldShapeChoice(overlay, () => renderMulti(overlay));
  });
}


function renderWorldShapeChoice(overlay, onSelected) {
  const storedMode = normalizeWorldShapeMode(localStorage.getItem('dorfromantik.worldShapeMode') || getWorldShapeMode());
  overlay.querySelector('.mode-copy').textContent = 'Choisis la géométrie de ton monde.';
  overlay.querySelector('.mode-content').innerHTML = `
    <div class="mode-actions world-shape-actions">
      <button data-action="bouliste" class="${storedMode === 'bouliste' ? '' : 'secondary'}">BOULISTE</button>
      <button data-action="platiste" class="${storedMode === 'platiste' ? '' : 'secondary'}">PLATISTE</button>
    </div>
	<br>
    <p class="mode-copy mode-shape-note">Tu pourras changer de faction en jeu, parce que même les planètes ont droit à une crise d’identité.</p>
  `;
  setStatus(overlay, '');

  for (const mode of ['bouliste', 'platiste']) {
    overlay.querySelector(`[data-action="${mode}"]`).addEventListener('click', () => {
      overlay.dataset.worldShapeMode = mode;
      localStorage.setItem('dorfromantik.worldShapeMode', mode);
      onSelected(mode);
    });
  }
}

function renderMulti(overlay, initialCode = '') {
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
    empty.textContent = rooms.length ? 'Sélectionner une partie existante' : 'Aucune partie trouvée dans /games';
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
    setStatus(overlay, 'Code partie manquant. Même un grille-pain alcoolique ferait mieux.');
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
