/**
 * domUtils.js — Petits utilitaires DOM/texte partagés entre les panneaux HUD
 * (highscore.js, edaPanelWiring.js, startupMenu.js/multiplayerRooms.js (ex-multiplayerUi.js), ui.js).
 *
 * escapeHtml existait en 4 exemplaires légèrement différents (ordre des
 * caractères, apostrophe parfois non échappée) — version canonique ici,
 * échappe les 5 caractères sensibles en toute circonstance.
 */

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[char]));
}
