import { initScene } from './scene.js';
import { DECK_SIZE } from './config.js';
import { createDeck } from './tileGenerator.js';
import { createSpecialCells } from './specialCells.js';
import { createBonusCells } from './bonusCells.js';
import { createMissionManager } from './missions.js';
import { makeHexKey } from './hex.js';
import { createRoom, generateRoomCode, getOrCreatePlayerId, joinRoom, listRooms } from './multiplayerClient.js';
import { getWorldShapeMode } from './worldCurvature.js';

export function showStartupScreen() {
  const urlRoomCode = new URLSearchParams(window.location.search).get('multi');
  renderShell(urlRoomCode ? 'multi' : 'home', normalizeCode(urlRoomCode ?? ''));
}

function renderShell(screen = 'home', initialCode = '') {
  const overlay = document.createElement('div');
  overlay.className = 'mode-screen';
  overlay.innerHTML = `
    <section class="mode-panel">
      <h1>HEXISTENZ</h1>
      <p class="mode-copy"></p>
      <div class="mode-content"></div>
      <div class="multi-status" aria-live="polite"></div>
    </section>
  `;
  document.body.appendChild(overlay);

  if (screen === 'multi') renderWorldShapeChoice(overlay, () => renderMulti(overlay, initialCode));
  else renderHome(overlay);
}

function renderHome(overlay) {
  overlay.querySelector('.mode-copy').textContent = 'Choisis ton poison : solo stable ou multi expérimental.';
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
  overlay.querySelector('.mode-copy').textContent = 'Choisis la géométrie du monde. Bouliste pour une planète courbée, platiste pour une planète plate.';
  overlay.querySelector('.mode-content').innerHTML = `
    <div class="mode-actions world-shape-actions">
      <button data-action="bouliste" class="${storedMode === 'bouliste' ? '' : 'secondary'}">BOULISTE</button>
      <button data-action="platiste" class="${storedMode === 'platiste' ? '' : 'secondary'}">PLATISTE</button>
    </div>
	<br>
    <p class="mode-copy mode-shape-note">Réglable en jeu, parce que même les planètes ont droit à une crise d’identité.</p>
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
