// ─── help.js — façade de compatibilité (découpé le 2026-07-11) ──────────────
// Refactor sans risque (cf. CONTEXT.md §21) : ce fichier faisait 728 lignes mêlant
// un système de tooltip DOM générique (~100 lignes) et un dictionnaire de textes
// purs LUT_HELP (~620 lignes). Découpé en :
//   helpTooltip.js   système de tooltip (CSS + create/show/move/hide/attach/delegate)
//   helpTexts.js     dictionnaire LUT_HELP (aucune logique, texte pur)
// Ce fichier ne fait plus que ré-exporter les deux pour ne rien casser chez les
// 5 importateurs externes (edaPanelHost.js, edaPanelWiring.js, hud_fps.js,
// startupMenu.js/multiplayerRooms.js (ex-multiplayerUi.js), ui.js) — API publique inchangée.
export { LUT_HELP } from './helpTexts.js';
export {
  ensureHelpTooltip,
  moveHelpTooltip,
  showHelpTooltip,
  hideHelpTooltip,
  attachHelpTooltip,
  delegateHelpTooltip
} from './helpTooltip.js';
