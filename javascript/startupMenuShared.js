// ─── startupMenuShared.js — utilitaires purs partagés (menu démarrage + multi) ──
// Extrait de multiplayerUi.js le 2026-07-11 (découpage sans risque, cf. CONTEXT.md §21) :
// module-feuille sans dépendance, pour que startupMenu.js (menu générique) et
// multiplayerRooms.js (logique multi réelle) puissent tous deux les importer sans
// import circulaire entre eux.

export function setStatus(overlay, message) {
  overlay.querySelector('.multi-status').textContent = message;
}

export function normalizeWorldShapeMode(value) {
  return value === 'platiste' ? 'platiste' : 'bouliste';
}

export function normalizeCode(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
}

export function getPlayerNameFromCookie() {
  const match = document.cookie.split(';')
    .map(c => c.trim())
    .find(c => c.startsWith('hexistenz_player_name='));
  return match ? decodeURIComponent(match.split('=')[1] ?? '') : '';
}

export function savePlayerNameCookie(name) {
  const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `hexistenz_player_name=${encodeURIComponent(name)}; expires=${expires}; path=/; SameSite=Lax`;
}
