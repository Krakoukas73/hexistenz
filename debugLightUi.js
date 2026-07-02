// ─── debugLightUi.js — façade (2026-07-02) ──────────────────────────────────
// Ce fichier faisait ~3000 lignes et hébergeait à la fois le HUD FPS (touche F) et le
// panel EDA (touche E), sans lien réel entre les deux hormis un `root` DOM partagé et
// une synchro de visibilité croisée (`scorePanel` masqué si l'un OU l'autre est ouvert).
// Découpé en 3 : hud_fps.js (perf HUD, self-contained), hud_eda.js (panel EDA 3 onglets,
// constantes LUT/CIN/PIX/EAU/VENT/NUAGES, helpers de rendu), et cette façade qui reste le
// SEUL point d'entrée pour scene.js (import inchangé : createDebugLightUI + tickFps),
// assemble le root partagé, et conserve le CSS géant (installDebugLightCss) inchangé.
import { ensureHelpTooltip } from './help.js';
import { tickFps, initFpsHud } from './hud_fps.js';
import { EDA_BODY_HTML, wireEdaPanel } from './hud_eda.js';

export { tickFps };

export function createDebugLightUI({ visualEnvironment, postprocess, forestOverlay = null, cloudSky = null }) {
  if (!visualEnvironment) return null;

  installDebugLightCss();
  ensureHelpTooltip();

  const root = document.createElement('section');
  root.id = 'debugLightPanel';
  root.className = 'debug-light-panel collapsed';
  root.innerHTML = `
    <div class="debug-light-left-col">
      <div id="fps-counter" class="fps-counter">-- FPS</div>
      <div class="debug-light-btn-row">
        <button id="fpsHudToggle" class="debug-light-toggle debug-light-toggle--fps" type="button" tabindex="-1" title="Afficher/masquer le HUD performances avancé">DEBUG <mark class="btn-key">F</mark>PS</button>
        <button id="debugLightToggle" class="debug-light-toggle" type="button" tabindex="-1" title="Ouvrir ou fermer le panneau de rendu"><mark class="btn-key">E</mark>DA</button>
      </div>
    </div>
    ${EDA_BODY_HTML}
  `;

  document.body.appendChild(root);

  const fpsApi = initFpsHud(root);
  return wireEdaPanel(root, { visualEnvironment, postprocess, forestOverlay, cloudSky, fpsApi });
}

/* ── Tout ce qui suit (constantes LUT/CIN/PIX/EAU/VENT/NUAGES, Perf HUD, câblage du panel,
   helpers de rendu des sliders) a été déplacé dans hud_fps.js et hud_eda.js le 2026-07-02.
   Seul installDebugLightCss() reste ici, inchangé, pour limiter le risque de régression
   visuelle sur ce fichier — cf. mémoire projet-hexistenz-eda-tabs. ── */

function installDebugLightCss() {
  if (document.getElementById('debugLightCss')) return;

  const style = document.createElement('style');
  style.id = 'debugLightCss';
  style.textContent = `
    .debug-light-panel {
      position: fixed;
      bottom: 14px;
      left: 14px;
      right: 14px;
      z-index: 3000;
      display: flex;
      flex-direction: row;
      align-items: flex-end;
      justify-content: space-between;
      pointer-events: none;
      color: #f4ead6;
      font: 12px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    .debug-light-left-col {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 6px;
      pointer-events: none;
    }

    .fps-counter {
      pointer-events: auto;
      font-family: monospace;
      font-size: 12px;
      line-height: 1.4;
      color: rgba(240,250,255,0.96);
      background: rgba(0,0,0,0.68);
      border: 1px solid rgba(120,180,255,0.38);
      border-radius: 12px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.35);
      padding: 14px 16px;
      width: 360px;
      max-width: calc(100vw - 28px);
      box-sizing: border-box;
      /* Limite la hauteur totale à l'écran disponible, avec scroll interne.
         Réserve : 34px (boutons) + 6px (gap) + 14px (bas) + 14px (haut) = 68px */
      max-height: calc(100vh - 72px);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    /* Zone scrollable : tout ce qui est sous le header FPS + indices */
    .fps-hud-body {
      overflow-y: auto;
      overflow-x: hidden;
      flex: 1 1 auto;
      min-height: 0;
      /* Scrollbar discrète */
      scrollbar-width: thin;
      scrollbar-color: rgba(120,180,255,0.35) transparent;
    }
    .fps-hud-body::-webkit-scrollbar { width: 4px; }
    .fps-hud-body::-webkit-scrollbar-thumb { background: rgba(120,180,255,0.35); border-radius: 2px; }
    .fps-hud-body::-webkit-scrollbar-track { background: transparent; }

    .fps-hud-header {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      gap: 6px;
      margin-bottom: 2px;
    }

    /* Modèle bouton unifié HUD LUT + HUD FPS : même CSS que .new-game-button (HUD score) */
    .fps-hud-copy {
      background: rgba(25, 56, 82, 0.78);
      border: 1px solid rgba(145, 205, 255, 0.42);
      border-radius: 4px;
      color: rgba(230, 246, 255, 0.96);
      font-family: monospace;
      font-weight: 900;
      cursor: pointer;
      font-size: 10px;
      line-height: 1;
      padding: 2px 5px;
      flex-shrink: 0;
      margin-left: auto;
    }

    .fps-hud-copy:hover {
      background: rgba(38, 86, 124, 0.9);
      color: #ffffff;
    }

    .fps-hud-fps {
      font-size: 26px;
      font-weight: 900;
      letter-spacing: 0.04em;
      color: rgba(240,250,255,0.96);
      font-family: 'BebasNeue', system-ui, sans-serif;
      line-height: 1;
      display: flex;
      align-items: baseline;
      gap: 6px;
    }

    .fps-hud-fps > span:first-child {
      font-size: 12px;
      font-weight: 700;
      color: rgba(180,215,255,0.82);
      letter-spacing: 0.18em;
    }

    .fps-adj {
      font-size: 18px;
      font-weight: 700;
      font-style: normal;
      letter-spacing: 0.04em;
    }
    .fps-adj-red        { color: #f87171; }
    .fps-adj-orange     { color: #fb923c; }
    .fps-adj-amber      { color: #fbbf24; }
    .fps-adj-yellow     { color: #fde047; }
    .fps-adj-lightgreen { color: #86efac; }
    .fps-adj-green      { color: #4ade80; }

    .fps-hud-sep {
      border-top: 1px solid rgba(120,180,255,0.22);
      margin: 6px 0;
    }

    /* Lignes clé/valeur (Draw calls, Triangles…) — mêmes couleurs que score-title/valeurs */
    .fps-hud-row {
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: baseline;
      gap: 8px;
      font-size: 11px;
      line-height: 1.55;
      color: rgba(180,215,255,0.82);
    }

    .fps-hud-row strong {
      font-weight: 800;
      font-variant-numeric: tabular-nums;
      color: rgba(240,250,255,0.96);
      flex-shrink: 0;
      text-align: right;
    }

    /* Lignes catégories (icône + label + stats colonnes) */
    .fps-hud-row-cat {
      display: grid;
      grid-template-columns: 1fr 3.5ch 11ch 3.2ch 8.5ch;
      gap: 3px;
      align-items: baseline;
      font-size: 11px;
      font-variant-numeric: tabular-nums;
      line-height: 1.55;
      color: rgba(180,215,255,0.82);
      border-radius: 4px;
      padding: 1px 2px;
    }

    .fps-hud-row-cat--heavy {
      background: rgba(220, 40, 40, 0.20);
      border-left: 3px solid rgba(255,80,80,0.80);
      padding-left: 5px;
      border-radius: 4px;
      color: rgba(255,220,220,0.90);
    }

    .fps-hud-cat-label {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .fps-hud-cat-icon {
      font-size: 11px;
      line-height: 1;
      flex-shrink: 0;
    }

    .fps-hud-cat-count {
      font-weight: 800;
      font-variant-numeric: tabular-nums;
      color: rgba(240,250,255,0.96);
      text-align: right;
    }

    .fps-hud-cat-dc {
      font-variant-numeric: tabular-nums;
      color: rgba(255,210,100,0.90);
      text-align: right;
    }

    .fps-hud-cat-tri {
      font-variant-numeric: tabular-nums;
      color: rgba(130,195,255,0.90);
      text-align: right;
    }

    .fps-hud-cat-shadow {
      font-variant-numeric: tabular-nums;
      color: rgba(180,140,255,0.90);
      text-align: right;
    }

    /* Rangée GPU / CPU — aussi grosse que le FPS, sous le header */
    .fps-hud-eff-row {
      display: flex;
      gap: 16px;
      margin-top: 6px;
      margin-bottom: 2px;
      align-items: baseline;
    }

    .fps-hud-eff-item {
      display: flex;
      align-items: baseline;
      gap: 5px;
    }

    .fps-hud-eff-label {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.06em;
      color: rgba(180,215,255,0.70);
    }

    .fps-hud-eff-value {
      font-size: 26px;
      font-weight: 900;
      font-variant-numeric: tabular-nums;
      letter-spacing: 0.02em;
      line-height: 1;
      font-family: 'BebasNeue', system-ui, sans-serif;
    }

    .fps-hud-eff-pct {
      font-size: 12px;
      font-weight: 700;
    }

    /* En-têtes de groupe-catégorie — sous-titre, même CSS que .stats-title (HUD score) */
    .fps-hud-group-header {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      font-weight: 900;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: rgba(212,236,255,0.92);
      margin-top: 5px;
      margin-bottom: 1px;
      border-bottom: 1px solid rgba(120,180,255,0.12);
      padding-bottom: 1px;
    }

    /* En-têtes de colonnes triables */
    .fps-hud-col-header {
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-align: right;
      padding: 2px 0;
    }

    .fps-hud-col-header:hover {
      color: rgba(255,230,150,0.95) !important;
    }

    /* Ligne totaux */
    .fps-hud-row-total {
      background: rgba(120,180,255,0.08);
      border-radius: 4px;
      padding: 2px 4px;
    }

    .debug-light-btn-row {
      display: flex;
      flex-direction: row;
      gap: 6px;
      pointer-events: none;
    }

    .debug-light-toggle {
      position: relative;
      pointer-events: auto;
      flex-shrink: 0;
      min-width: 48px;
      height: 34px;
      padding: 0 10px;
      border: 1px solid rgba(255,255,255,0.18);
      border-radius: 10px;
      color: rgba(247,239,225,0.7);
      background: linear-gradient(135deg, #4a5568, #2d3748);
      font-weight: 800;
      letter-spacing: 0.08em;
      cursor: pointer;
      box-shadow: 0 8px 24px rgba(0,0,0,0.35);
    }

    .debug-light-toggle--lut-active {
      background: linear-gradient(135deg, #ffd36d, #b58239);
      color: #1c140c;
      border-color: rgba(255,255,255,0.28);
    }

    .debug-light-toggle--fps {
      background: linear-gradient(135deg, #4a5568, #2d3748);
      color: rgba(247,239,225,0.7);
      border-color: rgba(255,255,255,0.18);
    }

    .debug-light-toggle--fps.debug-light-toggle--fps-active {
      background: linear-gradient(135deg, #ffd36d, #b58239);
      color: #1c140c;
      border-color: rgba(255,255,255,0.28);
    }

    /* Lettre de raccourci clavier dans les boutons toggle */
    .debug-light-toggle .btn-key {
      background: transparent;
      color: #ffd36d;
      font-weight: 900;
      font-style: normal;
    }
    /* Sur fond doré (bouton actif) : assombrir la lettre pour qu'elle reste lisible */
    .debug-light-toggle--fps-active .btn-key,
    .debug-light-toggle--lut-active .btn-key {
      color: rgba(80, 40, 0, 0.75);
    }

    /* ─── PIX section inside CUSTOMISATION panel ─────────────────────────── */
    .debug-light-pix-sep {
      height: 1px;
      background: rgba(120,180,255,0.22);
      margin: 16px 0;
    }

    /* Sections PIX, CINEMA, EAU, VENT, NUAGES & COURBURE ÉCRAN : espacement vertical entre
       leurs sliders — élargi (8px) depuis le passage en onglets, qui laisse plus de place. */
    .debug-light-pix-section,
    .debug-light-cinema-section,
    .debug-light-water-section,
    .debug-light-wind-section,
    .debug-light-cloud-section,
    .debug-light-crt-section,
    .debug-light-worldshape-section,
    .debug-light-daynight-section,
    .debug-light-subgroup {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    /* Pas de margin-bottom ici : l'espacement avec le premier slider vient uniquement du
       gap:8px du conteneur parent (.debug-light-xxx-section) — sinon les deux s'additionnent
       (16px) alors que le reste des lignes n'a que 8px, ce qui donne un rythme incohérent. */
    .debug-light-pix-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    /* Titre de rubrique (EAU / PIXELISATION / CINÉMA) — même CSS que .score-title (HUD score) */
    .debug-light-pix-head > span {
      font-size: 12px;
      letter-spacing: 0.18em;
      color: rgba(180,215,255,0.82);
    }

    /* Emoji de rubrique/sous-rubrique : +35% par rapport au texte qui l'entoure (em = relatif
       à la taille de police du parent, donc +35% correct dans tous les contextes : 12px pour
       les rubriques principales, 11px pour les sous-rubriques LUT/EAU/VENT). */
    .rubrique-emoji {
      font-size: 1.35em;
      line-height: 1;
      display: inline-block;
      vertical-align: -0.12em;
    }

    /* Toggle switch (same style as postprocessHud) */
    .pix-switch {
      flex: 0 0 auto;
      position: relative;
      width: 36px;
      height: 20px;
      cursor: pointer;
    }
    .pix-switch input { position: absolute; opacity: 0; pointer-events: none; }
    .pix-switch span {
      position: absolute;
      inset: 0;
      border-radius: 999px;
      background: rgba(255,255,255,0.22);
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.18);
      transition: background 0.16s, box-shadow 0.16s;
    }
    .pix-switch span::after {
      content: '';
      position: absolute;
      left: 3px; top: 3px;
      width: 14px; height: 14px;
      border-radius: 50%;
      background: #f7efe1;
      box-shadow: 0 2px 7px rgba(0,0,0,0.35);
      transition: transform 0.16s;
    }
    .pix-switch input:checked + span { background: rgba(88,228,153,0.55); box-shadow: inset 0 0 0 1px rgba(175,255,213,0.45), 0 0 14px rgba(88,228,153,0.22); }
    .pix-switch input:checked + span::after { transform: translateX(16px); }

    .pix-control {
      display: block;
      margin-top: 8px;
    }
    .pix-control span {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2px;
      font-size: 9px;
      font-weight: 800;
      color: rgba(180,215,255,0.82);
      text-transform: uppercase;
      letter-spacing: 0.045em;
    }
    .pix-control strong {
      min-width: 28px;
      text-align: right;
      color: #fff;
      font-variant-numeric: tabular-nums;
    }
    .pix-control input[type="range"],
    .debug-light-row input[type="range"] {
      -webkit-appearance: none;
      appearance: none;
      width: 100%;
      height: 3px;
      border-radius: 2px;
      background: rgba(120,170,255,0.22);
      outline: none;
      cursor: pointer;
      margin: 5px 0;
    }
    .pix-control input[type="range"]::-webkit-slider-thumb,
    .debug-light-row input[type="range"]::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: rgba(200,225,255,0.92);
      box-shadow: 0 0 0 2px rgba(120,180,255,0.30), 0 1px 4px rgba(0,0,0,0.45);
      cursor: pointer;
      transition: background 0.12s, box-shadow 0.12s;
    }
    .pix-control input[type="range"]::-webkit-slider-thumb:hover,
    .debug-light-row input[type="range"]::-webkit-slider-thumb:hover {
      background: #fff;
      box-shadow: 0 0 0 3px rgba(140,200,255,0.45), 0 1px 6px rgba(0,0,0,0.50);
    }
    .pix-control input[type="range"]::-moz-range-thumb,
    .debug-light-row input[type="range"]::-moz-range-thumb {
      width: 12px;
      height: 12px;
      border: none;
      border-radius: 50%;
      background: rgba(200,225,255,0.92);
      box-shadow: 0 0 0 2px rgba(120,180,255,0.30), 0 1px 4px rgba(0,0,0,0.45);
      cursor: pointer;
    }
    .pix-control input[type="range"]::-moz-range-track,
    .debug-light-row input[type="range"]::-moz-range-track {
      height: 3px;
      border-radius: 2px;
      background: rgba(120,170,255,0.22);
    }
    .pix-select {
      width: 100%;
      margin-top: 0;
      padding: 3px 6px;
      border: 1px solid rgba(120,180,255,0.30);
      border-radius: 6px;
      background: rgba(255,255,255,0.10);
      color: rgba(220,235,255,0.90);
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
    }
    .pix-select option { color: #111827; }
    .pix-reset-btn {
      width: 100%;
      margin-top: 7px;
      padding: 5px 7px;
      border: 0;
      border-radius: 8px;
      background: rgba(255,255,255,0.10);
      color: rgba(180,215,255,0.80);
      font-size: 9px;
      font-weight: 900;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      cursor: pointer;
    }
    .pix-reset-btn:hover { background: rgba(255,255,255,0.24); }
    .pix-section--disabled .debug-light-row { opacity: 0.55; }
    .cinema-section--disabled .debug-light-row { opacity: 0.55; }
    .wind-section--disabled .debug-light-row { opacity: 0.55; }
    .cloud-section--disabled .debug-light-row { opacity: 0.55; }
    .crt-section--disabled .debug-light-row { opacity: 0.55; }
    /* Sous-groupes à case à cocher individuelle (God Rays / Tilt-shift / Bloom / Écume / Sillage) */
    .debug-light-subgroup.subgroup-disabled .debug-light-row { opacity: 0.55; }

    .debug-light-body {
      pointer-events: auto;
      /* box-sizing: border-box → width JS inclut padding + border, comme offsetWidth de #tileUI */
      box-sizing: border-box;
      /* Largeur initiale : sera écrasée par JS (×2 de la largeur #tileUI — 2 colonnes égales) */
      width: min(620px, calc(100vw - 92px));
      /* height (pas juste max-height) : avec le contenu réparti en onglets sur 2 colonnes plus
         courtes, le panel se contentait sinon de la hauteur de son contenu (flex 1 1 auto) au lieu
         de remplir l'écran. Hauteur fixe → les colonnes (flex 1 1 0, overflow-y: auto) s'étirent
         pour occuper tout l'espace vertical dispo, et ne scrollent que si leur contenu déborde. */
      height: calc(100vh - 28px);
      max-height: calc(100vh - 28px);
      /* Occupe toute la hauteur dispo — chaque colonne défile indépendamment en interne */
      display: flex;
      flex-direction: column;
      overflow: hidden;
      padding: 12px;
      font-family: monospace;
      border: 1px solid rgba(120,180,255,0.38);
      border-radius: 12px;
      /* Même charte graphique que #scorePanel : sans flou, cohérent avec les autres HUDs */
      background: rgba(0,0,0,0.68);
      box-shadow: 0 10px 30px rgba(0,0,0,0.35);
    }

    /* ── Onglets EDA (sous le header ambiances) — regroupent les rubriques par thème,
       chaque onglet affichant son contenu sur 2 colonnes (au lieu des 3 colonnes fixes
       d'origine, devenues trop chargées à l'affichage simultané). ── */
    .debug-light-tabs {
      display: flex;
      gap: 6px;
      flex-shrink: 0;
      margin-bottom: 10px;
    }
    .debug-light-tab-btn {
      flex: 1;
      padding: 8px 9px;
      border: 1px solid rgba(120,180,255,0.32);
      border-radius: 8px;
      background: rgba(18,28,52,0.80);
      color: rgba(210,230,255,0.70);
      font-family: monospace;
      font-size: 11px;
      font-weight: 900;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      text-align: center;
      cursor: pointer;
      outline: none;
      transition: background 0.12s, border-color 0.12s, color 0.12s;
    }
    .debug-light-tab-btn:hover {
      border-color: rgba(140,200,255,0.50);
      color: rgba(230,246,255,0.95);
    }
    .debug-light-tab-btn--active {
      background: rgba(90,140,255,0.30);
      border-color: rgba(145,205,255,0.65);
      color: #ffffff;
    }

    /* Conteneur des panneaux d'onglet : un seul panneau visible (.debug-light-tab-panel--active),
       les autres sont display:none — pas de layout ni de coût pour les onglets masqués. */
    .debug-light-tab-panels {
      display: flex;
      flex-direction: column;
      flex: 1 1 auto;
      min-height: 0;
    }
    .debug-light-tab-panel {
      display: none;
      flex-direction: column;
      flex: 1 1 auto;
      min-height: 0;
    }
    .debug-light-tab-panel--active {
      display: flex;
    }

    /* Contenu de chaque onglet réparti sur 2 colonnes de largeur égale */
    .debug-light-columns {
      display: flex;
      flex-direction: row;
      gap: 14px;
      flex: 1 1 auto;
      min-height: 0;
    }

    /* Colonne A (onglet LUT) : garde sa largeur d'origine (conteneur flex, pas de scroll propre) */
    .debug-light-lut-scroll {
      flex: 1 1 0;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    /* Colonne B de l'onglet LUT (Étalonnage + Palette biomes) — même rythme vertical (gap: 8px)
       que les autres colonnes ; sans cette règle, les 2 rubriques n'avaient aucun espacement
       entre elles (aucun gap défini sur ce host, contrairement à #debugLightControls). */
    #debugLightPaletteHost {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    /* Colonne A et colonne B (génériques, réutilisées dans les 3 onglets) —
       2 colonnes de largeur égale, chacune défile en bloc indépendamment. */
    .debug-light-col-right,
    .debug-light-col-third {
      flex: 1 1 0;
      min-width: 0;
      min-height: 0;
      display: flex;
      flex-direction: column;
      overflow-y: auto;
      overflow-x: hidden;
      padding-right: 4px;
      scrollbar-width: thin;
      scrollbar-color: rgba(120,180,255,0.35) transparent;
    }
    .debug-light-col-right::-webkit-scrollbar,
    .debug-light-col-third::-webkit-scrollbar { width: 4px; }
    .debug-light-col-right::-webkit-scrollbar-thumb,
    .debug-light-col-third::-webkit-scrollbar-thumb { background: rgba(120,180,255,0.35); border-radius: 2px; }
    .debug-light-col-right::-webkit-scrollbar-track,
    .debug-light-col-third::-webkit-scrollbar-track { background: transparent; }

    .debug-light-panel.collapsed .debug-light-body { display: none; }

    /* Titre principal du HUD EDA — au-dessus de tout (ambiances comprises) */
    .debug-light-main-title {
      flex-shrink: 0;
      text-align: center;
      font-size: 14px;
      font-weight: 900;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: rgba(230,246,255,0.96);
      padding-bottom: 8px;
      margin-bottom: 6px;
      border-bottom: 1px solid rgba(120,180,255,0.24);
    }

    /* Header plein largeur (ambiances) — au-dessus des 2 colonnes */
    .debug-light-header {
      flex-shrink: 0;
    }

    /* Footer plein largeur (forme du monde + jour/nuit + export) — sous les 2 colonnes */
    .debug-light-footer {
      flex-shrink: 0;
    }

    .debug-light-export {
      margin-bottom: 10px;
    }

    /* Grid (et non flex) pour que "Comparer" (ligne 2, colonne 1) fasse exactement
       la même largeur que "Copier" (ligne 1, colonne 1) : les 2 lignes partagent
       le même découpage de colonnes 1fr/1fr/1fr/1fr. */
    .debug-light-export-row {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      align-items: center;
      gap: 6px;
    }
    .debug-light-export-row + .debug-light-export-row {
      margin-top: 6px;
    }

    /* ── Modèle bouton bleu — CSS strictement identique à .new-game-button (HUD score) ──
       Copier / Redo / Comparer / bouton Fermer / ambiances. */
    .debug-light-export #debugLightCopy,
    .debug-light-export #debugLightRedo,
    .debug-light-export #debugLightCompare {
      margin-top: 0;
      padding: 8px 9px;
      border: 1px solid rgba(145, 205, 255, 0.42);
      border-radius: 8px;
      background: rgba(25, 56, 82, 0.78);
      color: rgba(230, 246, 255, 0.96);
      font-family: monospace;
      font-size: 11px;
      font-weight: 900;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      cursor: pointer;
      white-space: nowrap;
      transition: background 0.12s, border-color 0.12s;
    }
    .debug-light-export #debugLightCopy:hover:not(:disabled),
    .debug-light-export #debugLightRedo:hover:not(:disabled),
    .debug-light-export #debugLightCompare:hover:not(:disabled) {
      background: rgba(38, 86, 124, 0.9);
      color: #ffffff;
    }

    /* ── Modèle bouton rouge — CSS strictement identique à .abandon-button (HUD score) ──
       Undo / Reset : actions destructives (annulent / réinitialisent des réglages). */
    .debug-light-export #debugLightUndo,
    .debug-light-export #debugLightReset {
      margin-top: 0;
      padding: 8px 9px;
      border: 1px solid rgba(255, 120, 120, 0.46);
      border-radius: 8px;
      background: rgba(80, 16, 20, 0.78);
      color: rgba(255, 235, 235, 0.96);
      font-family: monospace;
      font-size: 11px;
      font-weight: 900;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      cursor: pointer;
      white-space: nowrap;
      transition: background 0.12s, border-color 0.12s;
    }
    .debug-light-export #debugLightUndo:hover:not(:disabled),
    .debug-light-export #debugLightReset:hover:not(:disabled) {
      background: rgba(120, 24, 30, 0.9);
      color: #ffffff;
    }

    #debugLightUndo:disabled,
    #debugLightRedo:disabled,
    #debugLightCompare:disabled {
      opacity: 0.32;
      cursor: default;
    }

    .debug-light-compare-btn--active {
      background: rgba(90,140,255,0.30) !important;
      border-color: rgba(120,180,255,0.55) !important;
      color: #b0d0ff !important;
    }

    .debug-light-last-preset {
      grid-column: 2 / -1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 11px;
      color: rgba(180,215,255,0.60);
      font-style: italic;
    }

    .debug-light-controls {
      display: grid;
      grid-template-columns: 1fr;
      /* align-content: start — sans ça, align-content:normal (≈ stretch) répartit tout
         l'espace vertical libre EN PLUS entre les rangées de la grille quand le contenu est
         plus court que le conteneur (flex:1 1 auto le rend haut), créant un immense "trou"
         entre les rubriques au lieu d'un simple gap de 8px. */
      align-content: start;
      gap: 8px;
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
      overflow-x: hidden;
      padding-right: 4px;
      scrollbar-width: thin;
      scrollbar-color: rgba(120,180,255,0.35) transparent;
    }
    .debug-light-controls::-webkit-scrollbar { width: 4px; }
    .debug-light-controls::-webkit-scrollbar-thumb { background: rgba(120,180,255,0.35); border-radius: 2px; }
    .debug-light-controls::-webkit-scrollbar-track { background: transparent; }

    /* EAU (Écume/Sillage bateau) et VENT (4.1/4.2/4.3) : plusieurs sous-rubriques empilées
       dans un même conteneur plat (pas de wrapper .lut-section par sous-groupe comme dans
       l'onglet LUT) — même rythme vertical élargi (gap: 8px) que .debug-light-controls. */
    #debugLightWaterControls,
    #debugLightWindControls {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    /* Chaque rubrique LUT (Brouillard / Astre lumineux / Étalonnage / Palette biomes) */
    .lut-section {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    /* Rubrique désactivée (switch Étalonnage / Palette biomes) — même effet que PIX/CINÉMA */
    .lut-section--disabled .debug-light-row,
    .lut-section--disabled .color-grid {
      opacity: 0.55;
    }

    /* ── Titres de rubrique "à plat" (LUT, God Rays/Tilt-shift/Bloom, Écume/Sillage bateau) —
       même style visuel que .debug-light-pix-head (rubriques Cinéma/Pixélisation/Nuages/Vent),
       puisque ce ne sont plus des sous-rubriques mais des rubriques de plein droit. Aucune
       marge/bordure propre ici : l'espacement de base vient du gap du conteneur flex parent
       (8px), et un séparateur visible (.debug-light-pix-sep) est explicitement inséré ENTRE
       deux rubriques (jamais avant la première d'une colonne) — jamais de margin/border sur
       l'en-tête lui-même, pour ne pas cumuler deux sources d'espacement différentes. */
    .lut-section-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 12px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: rgba(180,215,255,0.82);
    }
    /* Sous-titre avec switch (Étalonnage / Palette biomes / God Rays / Tilt-shift / Bloom /
       Écume / Sillage bateau) : titre + interrupteur alignés — redondant avec la base
       ci-dessus (conservé pour compat, la classe reste posée par le JS). */
    .lut-section-head--with-toggle {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    /* Sous-titre RÉELLEMENT imbriqué sous une rubrique parente (Brins de blés/d'herbes/Arbres
       sous "4. VENT") : garde l'ancien style plus discret, avec séparateur, pour marquer la
       subordination — contrairement aux rubriques ci-dessus, désormais mises à plat. */
    .lut-section-head--nested {
      font-size: 11px;
      font-weight: 900;
      letter-spacing: 0.16em;
      color: rgba(212,236,255,0.92);
      padding: 10px 0 2px;
      margin-top: 8px;
      border-top: 1px solid rgba(120,180,255,0.14);
    }
    /* Premier sous-titre imbriqué d'un groupe (Brins de blés, juste après l'en-tête "4. VENT")
       — pas de séparateur puisqu'il suit directement l'en-tête de rubrique, pas un autre
       sous-titre. */
    .lut-section-head--nested.lut-subhead-first {
      margin-top: 0;
      padding-top: 2px;
      border-top: none;
    }

    /* ── Grille 2 colonnes pour toutes les couleurs ── */
    .color-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 3px 8px;
      margin-top: 4px;
    }
    /* Chaque cellule : [swatch 20px] [label] — ordre inversé par grid-column */
    .color-grid .debug-light-row {
      grid-template-columns: 20px 1fr;
      gap: 5px;
      font-size: 11px;       /* même taille que les sliders */
      line-height: 1.55;
      color: rgba(180,215,255,0.82);
    }
    .color-grid .debug-light-row span {
      grid-column: 2;
      grid-row: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .color-grid .debug-light-row input[type="color"] {
      grid-column: 1;
      grid-row: 1;
      width: 20px;
      height: 18px;
      padding: 0;
      border: 1px solid rgba(255,255,255,0.20);
      border-radius: 4px;
      cursor: pointer;
      background: transparent;
    }
    .color-grid .debug-light-row output { display: none; }

    /* ── Tooltip custom LUT ── */
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

    .debug-light-row {
      display: grid;
      grid-template-columns: 122px 1fr 58px;
      align-items: center;
      gap: 8px;
      font-size: 11px;
      line-height: 1.55;
      color: rgba(180,215,255,0.82);
    }

    /* .debug-light-row input[type="range"] → style mutualisé avec .pix-control ci-dessus */
    .debug-light-row input[type="color"] {
      width: 100%;
      height: 24px;
      border: 0;
      background: transparent;
    }

    .debug-light-row output {
      color: rgba(240,250,255,0.96);
      text-align: right;
      font-variant-numeric: tabular-nums;
    }

    /* Titre de rubrique AMBIANCES — même CSS que .score-title (HUD score) */
    .debug-light-presets-label {
      font-size: 12px;
      letter-spacing: 0.18em;
      color: rgba(180,215,255,0.82);
      margin-bottom: 5px;
    }

    .debug-light-presets {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 8px;
    }

    /* Ambiances (presets) — même modèle bouton que .new-game-button (HUD score) */
    .debug-light-preset-btn {
      flex: 1 0 auto;
      min-width: 96px;
      max-width: calc(33.33% - 4px);
      padding: 8px 9px;
      border-radius: 8px;
      border: 1px solid rgba(145, 205, 255, 0.42);
      font-family: monospace;
      font-size: 11px;
      font-weight: 900;
      cursor: pointer;
      text-align: center;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      background: rgba(25, 56, 82, 0.78);
      color: rgba(230, 246, 255, 0.96);
      letter-spacing: 0.06em;
      text-transform: uppercase;
      transition: background 0.12s, border-color 0.12s, transform 0.10s;
      box-shadow: 0 2px 6px rgba(0,0,0,0.30);
    }

    .debug-light-preset-btn .preset-emoji {
      flex-shrink: 0;
      font-size: 14px;
      line-height: 1;
    }

    .debug-light-preset-btn .preset-label {
      font-size: 11px;
      font-weight: 900;
      line-height: 1.2;
      letter-spacing: 0.02em;
      color: rgba(230, 246, 255, 0.96);
    }

    .debug-light-preset-btn:hover {
      background: rgba(38, 86, 124, 0.9);
      border-color: rgba(145, 205, 255, 0.42);
      color: #ffffff;
      transform: translateY(-1px);
    }
    .debug-light-preset-btn:hover .preset-label { color: #ffffff; }

    .debug-light-preset-btn:active {
      background: rgba(20, 44, 66, 0.9);
      transform: translateY(0);
    }


    /* ── Mini HUD clavier (bottom-right) ── */
    #kbdHintHud {
      position: fixed;
      bottom: 14px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 2900;
      font-family: monospace;
      font-size: 11px;
      line-height: 1.4;
      color: rgba(240,250,255,0.96);
      background: rgba(0,0,0,0.68);
      border: 1px solid rgba(120,180,255,0.38);
      border-radius: 12px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.35);
      padding: 8px 14px;
      pointer-events: none;
      white-space: nowrap;
    }

    body.grid-only-mode #kbdHintHud { display: none; }
    /* EDA ouvert : masque le mini HUD clavier (redondant avec le panel, et le chevauche) */
    body.lut-panel-open #kbdHintHud { display: none; }

    /* Super-immersif (SHIFT+ESPACE) : aucun HUD — mode capture d'écran */
    body.huds-force-hidden #debugLightPanel { display: none !important; }
    body.huds-force-hidden #tileUI         { display: none !important; }
    body.huds-force-hidden #scorePanel     { display: none !important; }
    body.huds-force-hidden #arcadeScore    { display: none !important; }

    /* LUT ouvert → masquer les HUDs droits (tuile courante / suivante / restantes / missions) */
    body.lut-panel-open #tileUI { display: none !important; }

    /* FPS HUD plein hauteur — le scorePanel est masqué via JS, le fps-counter occupe toute la hauteur */
    .debug-light-panel.fps-hud-fullscreen {
      top: 14px;
      align-items: flex-start;
    }
    .debug-light-panel.fps-hud-fullscreen .debug-light-left-col {
      height: 100%;
    }
    .debug-light-panel.fps-hud-fullscreen .fps-counter {
      flex: 1 1 auto;
      max-height: none;
    }
  `;
  document.head.appendChild(style);
}
