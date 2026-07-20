// ─── multiplayerRooms.js — logique multijoueur réelle (salles, join/create) ──
// Extrait de multiplayerUi.js le 2026-07-11 (découpage sans risque, cf. CONTEXT.md §21) :
// écran "rejoindre/créer une partie" + toute la logique réseau associée. Sous-système
// indépendant du menu générique solo/multi (startupMenu.js) et du carrousel de fond
// (menuBackgroundCarousel.js). Seul export utilisé en externe : renderMulti.
import { initScene } from './scene.js';
import { startIngameMusic } from './soundDesign.js';
import { DECK_SIZE } from './config.js';
import { createDeck } from './tileGenerator.js';
import { createSpecialCells } from './specialCells.js';
import { createBonusCells } from './bonusCells.js';
import { createMissionManager, serializeMissionManager, clonePlain } from './missions.js';
import { createRoom, generateRoomCode, getOrCreatePlayerId, joinRoom, listRooms } from './multiplayerClient.js';
import { LUT_HELP, attachHelpTooltip, hideHelpTooltip } from './help.js';
import { escapeHtml } from './domUtils.js';
import { setStatus, normalizeWorldShapeMode, normalizeCode } from './startupMenuShared.js';
import { registerLangRefresh, getLangFile } from './gameLangReactive.js';

const _langFile = getLangFile();

const _mpText = await fetch(`./json/languages/${_langFile}.json`)
  .then(r => r.json())
  .then(data => data?.game?.multiplayerRooms ?? {})
  .catch(err => {
    console.error(`[multiplayerRooms] Impossible de charger ${_langFile}.json`, err);
    return {};
  });

registerLangRefresh((data) => {
  const fresh = data?.game?.multiplayerRooms ?? {};
  for (const k of Object.keys(_mpText)) delete _mpText[k];
  Object.assign(_mpText, fresh);
});

// Pluriel {one, other} + substitution {count} — même convention que missionLabels.js.
function plural(entry, count, fallbackOne, fallbackOther) {
  const one = entry?.one ?? fallbackOne;
  const other = entry?.other ?? fallbackOther;
  return (count === 1 ? one : other).replace('{count}', count);
}

export function renderMulti(overlay, initialCode = '', { onBack } = {}) {
  hideHelpTooltip();
  overlay.querySelector('.mode-copy').textContent = _mpText.modeCopy ?? 'Créer une partie ou rejoindre une partie existante avec un code.';
  overlay.querySelector('.mode-content').innerHTML = `
    <label>${_mpText.nameLabel ?? 'Pseudo'}</label>
    <input data-field="name" maxlength="24" value="${escapeHtml(localStorage.getItem('dorfromantik.multiplayer.name') || '')}" placeholder="${escapeHtml(_mpText.namePlaceholder ?? 'Ton pseudo')}" />
    <label>${_mpText.codeLabel ?? 'Code partie'}</label>
    <input data-field="code" maxlength="12" value="${escapeHtml(initialCode)}" placeholder="${escapeHtml(_mpText.codePlaceholder ?? 'Ex : 377EA7')}" />
    <label data-role="availableRoomsLabel">${_mpText.availableRoomsLabel ?? 'Parties disponibles / backups'}</label>
    <select data-field="availableRooms">
      <option value="">${_mpText.loadingRooms ?? 'Chargement des parties...'}</option>
    </select>
    <div class="multi-actions">
      <button data-action="create">${_mpText.btnCreate ?? 'Créer'}</button>
      <button data-action="join" class="secondary">${_mpText.btnJoin ?? 'Rejoindre'}</button>
      <button data-action="back" class="secondary">${_mpText.btnBack ?? 'Retour'}</button>
    </div>
  `;
  setStatus(overlay, '');

  attachHelpTooltip(overlay.querySelector('[data-action="create"]'), LUT_HELP['menu.create']);
  attachHelpTooltip(overlay.querySelector('[data-action="join"]'), LUT_HELP['menu.join']);
  attachHelpTooltip(overlay.querySelector('[data-action="back"]'), LUT_HELP['menu.back']);
  // Menu solo/multi retiré : "Retour" revient à l'écran précédent (platiste/bouliste)
  // plutôt qu'au home désormais sauté au démarrage. Callback injecté par startupMenu.js
  // (évite un import circulaire vers renderWorldShapeChoice).
  overlay.querySelector('[data-action="back"]').addEventListener('click', () => onBack?.());
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
    empty.textContent = rooms.length
      ? (_mpText.selectExisting ?? 'Sélectionner une partie existante')
      : (_mpText.noRoomsFound ?? 'Aucune partie trouvée dans /json/games');
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
    select.innerHTML = `<option value="">${escapeHtml(_mpText.listUnavailable ?? 'Liste indisponible - serveur PHP muet')}</option>`;
  }
}

function updateAvailableRoomsLabel(overlay, count) {
  const label = overlay.querySelector('[data-role="availableRoomsLabel"]');
  if (!label) return;
  if (typeof count !== 'number') {
    label.textContent = _mpText.availableRoomsLabel ?? 'Parties disponibles / backups';
    return;
  }
  label.textContent = plural(
    _mpText.roomsCount, count,
    '{count} partie disponible / backups', '{count} parties disponibles / backups'
  );
}

function formatRoomOption(room) {
  const code = normalizeCode(room.code);
  const tiles = Number(room.tiles || 0);
  const tileWord = plural(_mpText.tileWord, tiles, 'tuile', 'tuiles');
  const updatedAt = Number(room.updatedAt || 0);
  // 2026-07-19 — nombre de joueurs retiré du libellé sur demande explicite (bruit
  // visuel jugé inutile), date remise juste après en format européen abrégé JJ/MM/AA
  // (au lieu de toLocaleString() complet précédent).
  const date = updatedAt > 0
    ? new Date(updatedAt * 1000).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })
    : (_mpText.unknownDate ?? 'date inconnue');
  return `${code} — ${tiles} ${tileWord}, ${date}`;
}

async function handleCreate(overlay) {
  const playerName = readPlayerName(overlay);
  const playerId = getOrCreatePlayerId();
  const typedCode = normalizeCode(overlay.querySelector('[data-field="code"]')?.value);
  const roomCode = typedCode || generateRoomCode();
  const initialState = createInitialMultiplayerState({ roomCode, playerId, playerName });
  setStatus(overlay, (_mpText.creatingRoom ?? 'Création de la partie {code}...').replace('{code}', roomCode));

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
    setStatus(overlay, _mpText.missingCode ?? 'Code partie manquant.');
    return;
  }

  setStatus(overlay, (_mpText.joiningRoom ?? 'Connexion à la partie {code}...').replace('{code}', roomCode));

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
    if (!state) throw new Error((_mpText.roomNotFound ?? 'Partie {code} trouvée, mais snapshot absent. JSON moisi refusé.').replace('{code}', roomCode));
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

function readPlayerName(overlay) {
  const value = overlay.querySelector('[data-field="name"]').value.trim().slice(0, 24);
  return value || `${_mpText.defaultNamePrefix ?? 'Joueur'}-${Math.floor(Math.random() * 900 + 100)}`;
}
