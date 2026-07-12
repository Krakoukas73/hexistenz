// ─── helpTooltip.js — système de tooltip DOM générique ──────────────────────
// Extrait de help.js le 2026-07-11 (découpage sans risque, cf. CONTEXT.md §21) :
// tooltip partagé (CSS + create/show/move/hide/attach/delegate), indépendant du
// contenu textuel. Le dictionnaire de textes est dans helpTexts.js.
// Utilisé par edaPanelHost.js, highscore.js, ui.js, startupMenu.js/multiplayerRooms.js (ex-multiplayerUi.js), etc.
// Le CSS est injecté ici, indépendamment du démarrage du jeu, pour que les tooltips
// fonctionnent aussi dans les menus pré-partie (avant initScene / createDebugLightUI).
import { LUT_HELP } from './helpTexts.js';

const _TOOLTIP_CSS = `
#lutHelpTooltip {
  position: fixed;
  z-index: 9999;
  max-width: 240px;
  padding: 8px 11px;
  border-radius: 9px;
  background: rgba(6,12,26,0.96);
  border: 1px solid rgba(120,180,255,0.28);
  box-shadow: 0 6px 24px rgba(0,0,0,0.65), 0 0 0 1px rgba(120,180,255,0.06);
  backdrop-filter: blur(12px);
  color: rgba(205,225,255,0.94);
  font: 11px/1.55 system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
  white-space: pre-wrap;
  word-break: break-word;
  pointer-events: none;
  opacity: 0;
  transform: translateY(5px);
  transition: opacity 0.14s ease, transform 0.14s ease;
}
#lutHelpTooltip.visible {
  opacity: 1;
  transform: translateY(0);
}
`;

export function ensureHelpTooltip() {
  if (document.getElementById('lutHelpTooltip')) return;
  // Injecter le CSS si pas encore fait
  if (!document.getElementById('lutHelpTooltipCss')) {
    const s = document.createElement('style');
    s.id = 'lutHelpTooltipCss';
    s.textContent = _TOOLTIP_CSS;
    document.head.appendChild(s);
  }
  const tt = document.createElement('div');
  tt.id = 'lutHelpTooltip';
  document.body.appendChild(tt);
}

export function moveHelpTooltip(e) {
  const tt = document.getElementById('lutHelpTooltip');
  if (!tt) return;
  const w = tt.offsetWidth || 240;
  const x = Math.min(e.clientX + 16, window.innerWidth - w - 10);
  const y = Math.max(6, e.clientY - 10);
  tt.style.left = x + 'px';
  tt.style.top  = y + 'px';
}

export function showHelpTooltip(e, text) {
  if (!text) return;
  const tt = document.getElementById('lutHelpTooltip');
  if (!tt) return;
  tt.textContent = text;
  tt.classList.add('visible');
  moveHelpTooltip(e);
}

export function hideHelpTooltip() {
  const tt = document.getElementById('lutHelpTooltip');
  if (tt) tt.classList.remove('visible');
}

/** Attache les événements de tooltip sur un élément (mouseenter/move/leave). */
export function attachHelpTooltip(el, text) {
  if (!el || !text) return;
  el.addEventListener('mouseenter', e => showHelpTooltip(e, text));
  el.addEventListener('mousemove',  moveHelpTooltip);
  el.addEventListener('mouseleave', hideHelpTooltip);
}

/**
 * Délégation de tooltip sur un conteneur parent (pour les innerHTML rebuilt).
 * Chaque descendant portant data-[attr] déclenche le tooltip.
 * @param {Element} container
 * @param {string} attr  ex : 'stat-help' pour data-stat-help
 * @param {Object} helpMap  { key: text } ou null pour lire LUT_HELP[key]
 */
export function delegateHelpTooltip(container, attr, helpMap = null) {
  if (!container) return;
  const dataAttr = 'data-' + attr;
  container.addEventListener('mouseover', e => {
    const el = e.target.closest('[' + dataAttr + ']');
    const key = el?.getAttribute(dataAttr);
    if (!key) { hideHelpTooltip(); return; }
    const text = (helpMap ?? LUT_HELP)[key] ?? '';
    showHelpTooltip(e, text);
  });
  container.addEventListener('mousemove', e => {
    if (e.target.closest('[' + dataAttr + ']')) moveHelpTooltip(e);
  });
  container.addEventListener('mouseleave', hideHelpTooltip);
}
