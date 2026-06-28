const API_URL = './multiplayer.php';
const PLAYER_ID_KEY = 'dorfromantik.multiplayer.tabPlayerId';

export function getOrCreatePlayerId() {
  // IMPORTANT MULTI : un joueur = un onglet/client, pas un navigateur.
  // localStorage est partagé entre deux onglets : ça faisait passer deux joueurs pour le même joueur,
  // donc même deck, même tuile courante, même enfer. sessionStorage isole correctement chaque onglet.
  const existing = sessionStorage.getItem(PLAYER_ID_KEY);
  if (existing) return existing;
  const id = `p_${Date.now().toString(16)}_${Math.random().toString(16).slice(2, 10)}`;
  sessionStorage.setItem(PLAYER_ID_KEY, id);
  return id;
}

export function generateRoomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i += 1) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

export async function listRooms() {
  return getApi(new URLSearchParams({ action: 'list' }));
}

export async function createRoom({ code, playerId, playerName, state }) {
  return postApi({ action: 'create', code, playerId, playerName, state });
}

export async function joinRoom({ code, playerId, playerName, playerState = null }) {
  return postApi({ action: 'join', code, playerId, playerName, playerState });
}

export async function updateRoomState({ code, playerId, state }) {
  return postApi({ action: 'state', code, playerId, state });
}

export async function updateCursor({ code, playerId, cursor }) {
  return postApi({ action: 'cursor', code, playerId, cursor });
}

export async function pollRoom({ code, playerId }) {
  const query = new URLSearchParams({ action: 'poll', code, playerId });
  return getApi(query);
}

async function postApi(payload) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return parseApiResponse(response);
}

async function getApi(query) {
  const response = await fetch(`${API_URL}?${query.toString()}`, { method: 'GET' });
  return parseApiResponse(response);
}

async function parseApiResponse(response) {
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (error) {
    throw new Error(`Réponse serveur illisible (${response.status}) : ${text.slice(0, 180)}`);
  }

  if (!response.ok || data?.ok === false) {
    throw new Error(data?.error || `Erreur serveur ${response.status}`);
  }

  return data;
}
