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
import { initScene } from './scene.js';
import { startMenuMusic, startIngameMusic } from './soundDesign.js';
import { getWorldShapeMode } from './worldCurvature.js';
import { ensureHelpTooltip, attachHelpTooltip, hideHelpTooltip } from './help.js';
import { escapeHtml } from './domUtils.js';
import { setupMenuBackgroundCarousel } from './menuBackgroundCarousel.js';
import { renderMulti } from './multiplayerRooms.js';
import { setStatus, normalizeWorldShapeMode, normalizeCode, getPlayerNameFromCookie, savePlayerNameCookie } from './startupMenuShared.js';
import { LUT_HELP } from './help.js';

// Passage bilingue FR/EN le 2026-07-12 : textes sous json/languages/{french,english}.json
// (clé game.startupMenu), même mécanisme que les autres modules (top-level
// await + localStorage 'hexistenz_pres_lang'). Repli FR en dur à chaque site
// d'appel : ce sont les tout premiers écrans vus par le joueur.
import { getLangFile } from './gameLangReactive.js';

const _langFile = getLangFile();

const _menuData = await fetch(`./json/languages/${_langFile}.json`)
  .then(r => r.json())
  .catch(err => {
    console.error(`[startupMenu] Impossible de charger ${_langFile}.json`, err);
    return {};
  });
const _menuText = _menuData?.game?.startupMenu ?? {};
const _defaultName = _menuData?.game?.highscore?.defaultName ?? 'Joueur';

export function showStartupScreen() {
  startMenuMusic();
  const urlRoomCode = new URLSearchParams(window.location.search).get('multi');
  // Menu solo/multi retiré au démarrage : on saute directement à l'écran suivant
  // (choix platiste/bouliste), comme si "MULTI" avait été cliqué.
  renderShell('multi', normalizeCode(urlRoomCode ?? ''));
}

function renderShell(screen = 'home', initialCode = '') {
  const overlay = document.createElement('div');
  overlay.className = 'mode-screen mode-screen--with-background';
  overlay.innerHTML = `
    <div class="mode-background-carousel" aria-hidden="true"></div>
    <section class="mode-panel">
      <img class="mode-logo" src="images/logo2.png" alt="Hexistenz" draggable="false" />

      <p class="mode-copy"></p>
      <div class="mode-content"></div>
      <div class="multi-status" aria-live="polite"></div>
    </section>
  `;
  document.body.appendChild(overlay);
  ensureHelpTooltip();
  setupMenuBackgroundCarousel(overlay);

  if (screen === 'multi') goToMulti(overlay, initialCode);
  else renderHome(overlay);
}

/** Enchaîne choix de la forme du monde → écran multi, avec un "Retour" qui revient ici. */
function goToMulti(overlay, initialCode = '') {
  renderWorldShapeChoice(overlay, () => {
    renderMulti(overlay, initialCode, { onBack: () => goToMulti(overlay) });
  });
}

/**
 * Pose la question du prénom avant le choix platiste/bouliste.
 * Le nom est toujours demandé (pré-rempli avec la valeur cookie).
 */
function renderNameChoice(overlay, onConfirmed) {
  hideHelpTooltip();
  const savedName = getPlayerNameFromCookie();
  overlay.querySelector('.mode-copy').textContent = _menuText.nameChoice?.title ?? 'Comment tu t\'appelles ?';
  overlay.querySelector('.mode-content').innerHTML = `
    <label class="mode-label">${_menuText.nameChoice?.label ?? 'Ton prénom (ou pseudo)'}</label>
    <input data-field="player-name" maxlength="24" value="${escapeHtml(savedName)}" placeholder="${escapeHtml(_menuText.nameChoice?.placeholder ?? 'Ex : Rémi')}" autocomplete="given-name" />
    <div class="mode-actions">
      <button data-action="confirm">${_menuText.nameChoice?.confirm ?? 'CONTINUER →'}</button>
    </div>
  `;
  setStatus(overlay, '');

  attachHelpTooltip(overlay.querySelector('[data-action="confirm"]'), LUT_HELP['menu.confirm']);
  const input = overlay.querySelector('[data-field="player-name"]');
  requestAnimationFrame(() => { input.focus(); input.select(); });

  const confirm = () => {
    const name = input.value.trim() || _defaultName;
    savePlayerNameCookie(name);
    onConfirmed(name);
  };

  overlay.querySelector('[data-action="confirm"]').addEventListener('click', confirm);
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); confirm(); }
  });
}

function renderHome(overlay) {
  hideHelpTooltip();
  overlay.querySelector('.mode-copy').textContent = _menuText.home?.title ?? 'Choisis le mode de jeu : solo ou multijoueur.';
  overlay.querySelector('.mode-content').innerHTML = `
    <div class="mode-actions">
      <button data-action="solo">${_menuText.home?.solo ?? 'SOLO'}</button>
      <button data-action="multi" class="secondary">${_menuText.home?.multi ?? 'MULTI'}</button>
    </div>
  `;
  attachHelpTooltip(overlay.querySelector('[data-action="solo"]'), LUT_HELP['menu.solo']);
  attachHelpTooltip(overlay.querySelector('[data-action="multi"]'), LUT_HELP['menu.multi']);

  overlay.querySelector('[data-action="solo"]').addEventListener('click', () => {
    renderNameChoice(overlay, playerName => {
      renderWorldShapeChoice(overlay, worldShapeMode => {
        startIngameMusic();
        hideHelpTooltip();
        overlay.remove();
        initScene({ mode: 'solo', worldShapeMode, playerName });
      });
    });
  });

  overlay.querySelector('[data-action="multi"]').addEventListener('click', () => {
    goToMulti(overlay);
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
