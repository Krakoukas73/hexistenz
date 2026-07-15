// Passage bilingue FR/EN le 2026-07-12 : les 2 messages d'erreur réseau
// viennent de json/languages/{french,english}.json (clé game.multiplayerClient),
// même mécanisme que les autres modules (top-level await + localStorage
// 'hexistenz_pres_lang'). Repli FR en dur (chemin d'erreur réseau).
import { registerLangRefresh, getLangFile } from './gameLangReactive.js';

const _langFile = getLangFile();

const _mcText = await fetch(`./json/languages/${_langFile}.json`)
  .then(r => r.json())
  .then(data => data?.game?.multiplayerClient ?? {})
  .catch(err => {
    console.error(`[multiplayerClient] Impossible de charger ${_langFile}.json`, err);
    return {};
  });

registerLangRefresh((data) => {
  const fresh = data?.game?.multiplayerClient ?? {};
  for (const k of Object.keys(_mcText)) delete _mcText[k];
  Object.assign(_mcText, fresh);
});

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
    const tpl = _mcText.unreadableResponse ?? 'Réponse serveur illisible ({status}) : {text}';
    throw new Error(tpl.replace('{status}', response.status).replace('{text}', text.slice(0, 180)));
  }

  if (!response.ok || data?.ok === false) {
    const tpl = _mcText.serverError ?? 'Erreur serveur {status}';
    throw new Error(data?.error || tpl.replace('{status}', response.status));
  }

  return data;
}
