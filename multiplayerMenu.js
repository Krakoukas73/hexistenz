import { initScene } from './scene.js';
import { createMultiplayerClient } from './multiplayerClient.js';

const ROOM_CODE_RE = /^[A-Z0-9]{4,8}$/;

export function showStartMenu() {
  const params = new URLSearchParams(window.location.search);
  const directRoom = normalizeRoomCode(params.get('multi') || params.get('room') || '');

  ensureMenuMarkup();
  const overlay = document.getElementById('modeSelectOverlay');
  const soloButton = document.getElementById('btnStartSolo');
  const multiButton = document.getElementById('btnShowMulti');
  const createButton = document.getElementById('btnCreateMulti');
  const joinButton = document.getElementById('btnJoinMulti');
  const backButton = document.getElementById('btnBackMode');
  const multiPanel = document.getElementById('multiPanel');
  const roomInput = document.getElementById('multiRoomCode');
  const nameInput = document.getElementById('multiPlayerName');
  const status = document.getElementById('multiStatus');

  const savedName = localStorage.getItem('dorfPlayerName') || '';
  nameInput.value = savedName || `Joueur-${Math.floor(100 + Math.random() * 900)}`;
  roomInput.value = directRoom;

  soloButton.addEventListener('click', () => {
    overlay.classList.add('hidden');
    initScene({ mode: 'solo' });
  }, { once: true });

  multiButton.addEventListener('click', () => {
    multiPanel.classList.remove('hidden');
    roomInput.focus();
  });

  backButton.addEventListener('click', () => {
    multiPanel.classList.add('hidden');
    setStatus('');
  });

  createButton.addEventListener('click', () => startMultiplayer('create'));
  joinButton.addEventListener('click', () => startMultiplayer('join'));

  if (directRoom) {
    multiPanel.classList.remove('hidden');
    setStatus(`Lien multi détecté : ${directRoom}. Clique sur REJOINDRE.`);
  }

  async function startMultiplayer(action) {
    const playerName = sanitizePlayerName(nameInput.value);
    const requestedRoomCode = normalizeRoomCode(roomInput.value);

    if (action === 'join' && !ROOM_CODE_RE.test(requestedRoomCode)) {
      setStatus('Code invalide. Format attendu : 4 à 8 lettres/chiffres.');
      return;
    }

    localStorage.setItem('dorfPlayerName', playerName);
    setStatus(action === 'create' ? 'Création de la partie multi...' : `Connexion à ${requestedRoomCode}...`);

    try {
      const client = await createMultiplayerClient({
        action,
        requestedRoomCode,
        playerName
      });

      overlay.classList.add('hidden');
      const sceneApi = initScene({
        mode: 'multi',
        roomCode: client.roomCode,
        playerId: client.playerId,
        playerName,
        seed: `multi:${client.roomCode}:shared-grid`,
        onLocalCursor: payload => client.sendCursor(payload),
        onLocalPlacement: payload => client.sendPlacement(payload),
        onLocalDeckChanged: payload => client.sendDeckState(payload)
      });

      client.onStatus(message => sceneApi?.setMultiplayerStatus?.(message));
      client.onPlayers(players => sceneApi?.setMultiplayerPlayers?.(players));
      client.onCursor(cursor => sceneApi?.setRemoteCursor?.(cursor));
      client.onPlayerLeft(playerId => sceneApi?.removeRemoteCursor?.(playerId));
      client.onPlacementRejected(reason => sceneApi?.setMultiplayerStatus?.(`Placement refusé : ${reason}`));
      client.announceReady();

      sceneApi?.setMultiplayerStatus?.(`MULTI ${client.roomCode} — ${client.transportLabel}`);
      sceneApi?.setRoomLink?.(makeRoomLink(client.roomCode));
    } catch (error) {
      setStatus(error?.message || 'Connexion multi impossible.');
    }
  }

  function setStatus(message) {
    status.textContent = message;
  }
}

function ensureMenuMarkup() {
  if (document.getElementById('modeSelectOverlay')) return;
  const overlay = document.createElement('section');
  overlay.id = 'modeSelectOverlay';
  overlay.className = 'mode-select-overlay';
  overlay.innerHTML = `
    <div class="mode-select-panel">
      <div class="mode-title">HEXISTENZ</div>
      <div class="mode-subtitle">Choisis ton poison.</div>
      <div class="mode-buttons">
        <button id="btnStartSolo" type="button">SOLO</button>
        <button id="btnShowMulti" type="button">MULTI</button>
      </div>
      <div id="multiPanel" class="multi-panel hidden">
        <label>Pseudo <input id="multiPlayerName" type="text" maxlength="20" autocomplete="off"></label>
        <label>Code partie <input id="multiRoomCode" type="text" maxlength="8" autocomplete="off" placeholder="ABC123"></label>
        <div class="multi-actions">
          <button id="btnCreateMulti" type="button">CRÉER</button>
          <button id="btnJoinMulti" type="button">REJOINDRE</button>
          <button id="btnBackMode" type="button">RETOUR</button>
        </div>
        <div id="multiStatus" class="multi-status"></div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

function normalizeRoomCode(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

function sanitizePlayerName(value) {
  const name = String(value || '').trim().replace(/[<>]/g, '').slice(0, 20);
  return name || `Joueur-${Math.floor(100 + Math.random() * 900)}`;
}

function makeRoomLink(roomCode) {
  const url = new URL(window.location.href);
  url.search = '';
  url.searchParams.set('multi', roomCode);
  return url.toString();
}
