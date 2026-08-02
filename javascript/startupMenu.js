// ─── startupMenu.js — écran de démarrage (menu générique) ───────────────────
// Renommé le 2026-07-11 (ex-multiplayerUi.js, découpage sans risque, cf. CONTEXT.md §21) :
// ~550 de ses 700 lignes géraient le menu solo+multi générique, pas la logique
// multijoueur elle-même — "multiplayerUi" était trompeur. Découpé en 3 sous-systèmes :
//   startupMenu.js (ce fichier)   menu générique (accueil, prénom, forme du monde) + orchestration
//   menuBackgroundCarousel.js     carrousel de fond + pixelisation hexagonale
//   multiplayerRooms.js           logique multijoueur réelle (créer/rejoindre une salle)
//   startupMenuShared.js          utilitaires purs partagés par les deux (évite import circulaire)
// Le CSS du carrousel (ex-ensureMenuBackgroundStyles(), ~140 lignes) est désormais
// statique dans css/startupMenu.css. Seul importateur externe : main.js (showStartupScreen).
import { startMenuMusic } from './soundDesign.js';
import { getWorldShapeMode } from './worldCurvature.js';
import { ensureHelpTooltip, attachHelpTooltip, hideHelpTooltip } from './help.js';
import { setupMenuBackgroundCarousel } from './menuBackgroundCarousel.js';
import { renderMulti } from './multiplayerRooms.js';
import { setStatus, normalizeWorldShapeMode, normalizeCode } from './startupMenuShared.js';
import { LUT_HELP } from './help.js';

// Passage bilingue FR/EN le 2026-07-12 : textes sous json/languages/{french,english}.json
// (clé game.startupMenu), même mécanisme que les autres modules (top-level
// await + localStorage 'hexistenz_pres_lang'). Repli FR en dur à chaque site
// d'appel : ce sont les tout premiers écrans vus par le joueur.
import { getLangFile, getLangVersion } from './gameLangReactive.js';

const _langFile = getLangFile();

const _menuData = await fetch(`./json/languages/${_langFile}.json?v=${getLangVersion()}`)
  .then(r => r.json())
  .catch(err => {
    console.error(`[startupMenu] Impossible de charger ${_langFile}.json`, err);
    return {};
  });
const _menuText = _menuData?.game?.startupMenu ?? {};

export function showStartupScreen() {
  startMenuMusic();
  const urlRoomCode = new URLSearchParams(window.location.search).get('multi');
  // Menu solo/multi retiré au démarrage (2026-07-11) : on saute directement à
  // l'écran suivant (choix platiste/bouliste) comme si "MULTI" avait été cliqué.
  // 2026-07-16 : renderHome()/renderNameChoice() (écran solo/multi + saisie prénom
  // solo) supprimés — code mort, plus jamais atteignable depuis ce point d'entrée.
  // Toute partie passe désormais par renderMulti() (multiplayerRooms.js), donc
  // toute partie crée une room_*.json persistée dès le départ, y compris ce que
  // le joueur perçoit comme une partie "solo".
  renderShell(normalizeCode(urlRoomCode ?? ''));
}

function renderShell(initialCode = '') {
  const overlay = document.createElement('div');
  overlay.className = 'mode-screen mode-screen--with-background';
  overlay.innerHTML = `
    <div class="mode-background-carousel" aria-hidden="true"></div>
    <section class="mode-panel">
      <div class="internal-parchment">
      <img class="mode-logo" src="images/logo2.png" alt="Hexistenz" draggable="false" />

      <p class="mode-copy"></p>
      <div class="mode-content"></div>
      <div class="multi-status" aria-live="polite"></div>
      </div>
    </section>
  `;
  document.body.appendChild(overlay);
  ensureHelpTooltip();
  setupMenuBackgroundCarousel(overlay);

  goToMulti(overlay, initialCode);
}

/** Enchaîne choix de la forme du monde → écran multi, avec un "Retour" qui revient ici. */
function goToMulti(overlay, initialCode = '') {
  renderWorldShapeChoice(overlay, () => {
    renderMulti(overlay, initialCode, { onBack: () => goToMulti(overlay) });
  });
}

function renderWorldShapeChoice(overlay, onSelected) {
  hideHelpTooltip();
  const storedMode = normalizeWorldShapeMode(localStorage.getItem('dorfromantik.worldShapeMode') || getWorldShapeMode());
  overlay.querySelector('.mode-copy').textContent = _menuText.worldShape?.title ?? 'Choisis la géométrie de ta planète :';
  overlay.querySelector('.mode-content').innerHTML = `
    <div class="mode-actions world-shape-actions">
      <button data-action="platiste" class="${storedMode === 'platiste' ? '' : 'secondary'}">${_menuText.worldShape?.flat ?? 'PLATISTE'}</button>
      <button data-action="bouliste" class="${storedMode === 'bouliste' ? '' : 'secondary'}">${_menuText.worldShape?.globe ?? 'BOULISTE'}</button>
    </div>
	<br>
    <p class="mode-copy mode-shape-note">${_menuText.worldShape?.note ?? 'On te conseille "<i>platiste</i>" pour débuter. Tu pourras changer de faction à n\'importe quel moment en jeu, parce que même les planètes ont droit à une crise identitaire.'}</p>
  `;
  setStatus(overlay, '');
  attachHelpTooltip(overlay.querySelector('[data-action="platiste"]'), LUT_HELP['menu.platiste']);
  attachHelpTooltip(overlay.querySelector('[data-action="bouliste"]'), LUT_HELP['menu.bouliste']);

  for (const mode of ['bouliste', 'platiste']) {
    overlay.querySelector(`[data-action="${mode}"]`).addEventListener('click', () => {
      overlay.dataset.worldShapeMode = mode;
      localStorage.setItem('dorfromantik.worldShapeMode', mode);
      onSelected(mode);
    });
  }
}
