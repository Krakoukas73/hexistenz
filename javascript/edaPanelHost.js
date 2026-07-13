// ─── edaPanelHost.js — façade (2026-07-02, ex-debugLightUi.js renommé le 2026-07-11) ──
// Ce fichier faisait ~3000 lignes et hébergeait à la fois le HUD FPS (touche F) et le
// panel EDA (touche E), sans lien réel entre les deux hormis un `root` DOM partagé et
// une synchro de visibilité croisée (`scorePanel` masqué si l'un OU l'autre est ouvert).
// Découpé en 3 : hud_fps.js (perf HUD, self-contained), edaPanelWiring.js (ex-hud_eda.js,
// panel EDA 3 onglets, constantes LUT/CIN/PIX/EAU/VENT/NUAGES, helpers de rendu), et cette
// façade qui reste le SEUL point d'entrée pour scene.js (import inchangé : createDebugLightUI
// + tickFps), assemble le root partagé.
//
// Renommé le 2026-07-11 (ex-debugLightUi.js) pour refléter son rôle réel : héberger le DOM
// partagé du panel EDA, pas un "panneau lumière de debug" comme le suggérait l'ancien nom.
// Le CSS géant (ex-installDebugLightCss(), ~1150 lignes injectées via un template
// literal JS) a été extrait vers css/eda.css le 2026-07-11 — chargé statiquement via
// @import dans css/style.css, plus aucune injection JS au runtime. cf. CONTEXT.md §20/§21.
import { ensureHelpTooltip } from './help.js';
import { tickFps, initFpsHud } from './hud_fps.js';
import { EDA_BODY_HTML, wireEdaPanel } from './edaPanelWiring.js';
import { getGameLang, setGameLang } from './gameLangReactive.js';

export { tickFps };

export function createDebugLightUI({ visualEnvironment, postprocess, forestOverlay = null, cloudSky = null, environmentDirector = null }) {
  if (!visualEnvironment) return null;

  ensureHelpTooltip();

  const root = document.createElement('section');
  root.id = 'debugLightPanel';
  root.className = 'debug-light-panel collapsed';
  root.innerHTML = `
    <div class="debug-light-left-col">
      <div id="fps-counter" class="fps-counter">-- FPS</div>
      <div class="debug-light-btn-row">
        <button id="fpsHudToggle" class="debug-light-toggle debug-light-toggle--fps" type="button" tabindex="-1" title="Afficher/masquer le HUD performances avancé"><mark class="btn-key">F</mark>PS</button>
        <button id="debugLightToggle" class="debug-light-toggle" type="button" tabindex="-1" title="Ouvrir ou fermer le panneau de rendu"><mark class="btn-key">E</mark>DA</button>
        <select id="gameLangSelect" class="debug-light-toggle debug-light-lang-select" tabindex="-1" title="Langue">
          <option value="fr">FR</option>
          <option value="en">EN</option>
        </select>
      </div>
    </div>
    ${EDA_BODY_HTML}
  `;

  document.body.appendChild(root);

  // Sélecteur de langue en jeu (2026-07-13, v2 — v1 avec 2 boutons FR/EN rejetée :
  // pas scalable si d'autres langues arrivent un jour). Un unique <select> qui
  // grandit tout seul avec la liste d'options ; l'ajout d'une langue future ne
  // demande QUE d'ajouter une <option>, pas un nouveau bouton par langue.
  // setGameLang() (gameLangReactive.js) écrit dataset.lang + localStorage — donc
  // le texte dual-render data-fr/data-en de game.php change toujours instantanément
  // — PUIS notifie tous les modules bilingues abonnés (helpTexts.js, highscore.js,
  // hud_fps.js, missionLabels.js, multiplayerClient.js, multiplayerRooms.js,
  // placementOverlay.js, edaPanelWiring.js, scene.js) pour qu'ils retraduisent
  // leurs propres textes JS en direct. PAS de reload (essayé puis retiré : ça
  // renvoyait au menu de démarrage en pleine partie, inacceptable).
  const langSelect = root.querySelector('#gameLangSelect');
  langSelect.value = getGameLang();
  langSelect.addEventListener('change', () => setGameLang(langSelect.value));

  const fpsApi = initFpsHud(root);
  return wireEdaPanel(root, { visualEnvironment, postprocess, forestOverlay, cloudSky, environmentDirector, fpsApi });
}
