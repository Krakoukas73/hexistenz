import { renderMiniTile } from './tileMesh.js';
import { LUT_HELP, ensureHelpTooltip, delegateHelpTooltip, attachHelpTooltip } from './help.js';
import { MISSION_TYPE_ICON, MISSION_HELP, HUD_TEXT } from './missionLabels.js';
import { escapeHtml } from './domUtils.js';
import { EFFICIENCY_MIN_TILES, EFFICIENCY_MIN_TILES_EXPONENT } from './variables.js';

export function createUI() {
  const ui = {
    resetCamera: document.getElementById('btnResetCamera'),
    undoLastTile: document.getElementById('btnUndoLastTile'),
    abandonGame: document.getElementById('btnAbandonGame'),
    newGame: document.getElementById('btnNewGame'),
    abandonConfirmModal: document.getElementById('abandonConfirmModal'),
    abandonConfirmBtn: document.getElementById('btnAbandonConfirm'),
    abandonCancelBtn: document.getElementById('btnAbandonCancel'),
    activeTile: document.getElementById('activeTile'),
    nextTile: document.getElementById('nextTile'),
    deckRemaining: document.getElementById('deckRemaining'),
    tilesPlaced: document.getElementById('tilesPlaced'),
    missionList: document.getElementById('missionList'),
    rotation: document.getElementById('dbgRotation'),
    score: document.getElementById('dbgScore'),
    gridPercent: document.getElementById('dbgGridPercent'),
    lastScore: document.getElementById('dbgLastScore'),
    efficiency: document.getElementById('dbgEfficiency'),
    efficiencyValue: document.getElementById('dbgEfficiencyValue'),
    stats: {
      mills: document.getElementById('statMills'),
      grass: document.getElementById('statGrass'),
      field: document.getElementById('statField'),
      forest: document.getElementById('statForest'),
      house: document.getElementById('statHouse'),
      water: document.getElementById('statWater'),
      rail: document.getElementById('statRail'),
      trains: document.getElementById('statTrains'),
      boats: document.getElementById('statBoats'),
      largestGrass: document.getElementById('statLargestGrass'),
      largestField: document.getElementById('statLargestField'),
      largestForest: document.getElementById('statLargestForest'),
      largestHouse: document.getElementById('statLargestHouse'),
      largestWater: document.getElementById('statLargestWater'),
      largestRail: document.getElementById('statLargestRail'),
      comets: document.getElementById('statComets')
    },
    placement: document.getElementById('dbgPlacement'),
    keys: {
      z: document.getElementById('keyZ'),
      q: document.getElementById('keyQ'),
      s: document.getElementById('keyS'),
      d: document.getElementById('keyD'),
      r: document.getElementById('keyR'),
      h: document.getElementById('keyH'),
      plus: document.getElementById('keyPlus'),
      minus: document.getElementById('keyMinus'),
      space: document.getElementById('keySpace')
    },
    helpOverlay: document.getElementById('helpOverlay'),
    closeHelp: document.getElementById('btnCloseHelp')
  }; // fin objet ui

  // ── Tooltips élégants sur les nombres du panneau STATISTIQUES DE LA PARTIE ──
  const _statHelpMap = {
    statMills:        'game.mills',
    statTrains:       'game.trains',
    statBoats:        'game.boats',
    statComets:       'game.comets',
    statGrass:        'game.grass',
    statLargestGrass: 'game.largestGrass',
    statField:        'game.field',
    statLargestField: 'game.largestField',
    statForest:       'game.forest',
    statLargestForest:'game.largestForest',
    statHouse:        'game.house',
    statLargestHouse: 'game.largestHouse',
    statWater:        'game.water',
    statLargestWater: 'game.largestWater',
    statRail:         'game.rail',
    statLargestRail:  'game.largestRail',
  };
  // Attaché sur la cellule entière (label + valeur), pas seulement sur le nombre —
  // sinon le survol ne se déclenche que si la souris est pile sur les chiffres.
  // .stats-summary-card (Moulins/Trains/Bateaux/Comètes) englobe le label dans un
  // <span> frère du groupe nombre+emoji : closest() le retrouve. Pour les 12 autres
  // (Total/Surface max par biome), le parentElement direct contient déjà les deux.
  for (const [id, helpKey] of Object.entries(_statHelpMap)) {
    const el = document.getElementById(id);
    if (!el) continue;
    const cell = el.closest('.stats-summary-card') ?? el.parentElement ?? el;
    cell.dataset.statHelp = helpKey;
  }
  const statsPanel = document.getElementById('statsPanel');
  if (statsPanel) {
    ensureHelpTooltip();
    delegateHelpTooltip(statsPanel, 'stat-help', LUT_HELP);
  }

  // Tooltips sur les boutons de partie (lazy : LUT_HELP[key] est une string figée
  // au moment de l'attache, donc on passe une closure pour rester à jour si la
  // langue change en cours de partie, cf. gameLangReactive.js)
  attachHelpTooltip(ui.newGame, () => LUT_HELP['game.newGame']);
  attachHelpTooltip(ui.abandonGame, () => LUT_HELP['game.abandonGame']);

  // Tooltips sur les valeurs du HUD principal (tuiles posées, dernier coup)
  // On attache sur le wrapper qui englobe titre + nombre pour une zone de hover plus large
  attachHelpTooltip(ui.gridPercent?.parentElement, () => LUT_HELP['game.gridPercent']);
  attachHelpTooltip(ui.lastScore?.parentElement, () => LUT_HELP['game.lastScore']);

  // 2026-08-01 — tooltips sur le score arcade (haut gauche) et l'efficacité en
  // cours affichée en dessous : le score attache sur .arcade-score-row (le
  // wrapper englobant #dbgScore + suffixe "pts"), l'efficacité directement sur
  // #dbgEfficiency qui EST déjà le wrapper (pas de label séparé).
  attachHelpTooltip(ui.score?.parentElement, () => LUT_HELP['game.score']);
  attachHelpTooltip(ui.efficiency, () => LUT_HELP['game.efficiency']);

  // Tooltips sur les 3 boîtes tuiles (tileUI droite)
  attachHelpTooltip(ui.activeTile?.parentElement,   () => LUT_HELP['game.activeTile']);
  attachHelpTooltip(ui.nextTile?.parentElement,     () => LUT_HELP['game.nextTile']);
  attachHelpTooltip(ui.deckRemaining?.parentElement, () => LUT_HELP['game.deckRemaining']);
  attachHelpTooltip(ui.tilesPlaced?.parentElement,  () => LUT_HELP['game.tiles']);

  // Délégation tooltip sur la liste de missions (reconstruite à chaque tour)
  if (ui.missionList) {
    ensureHelpTooltip();
    delegateHelpTooltip(ui.missionList, 'mission-tip', MISSION_HELP);
  }

  return ui;
}

export function setText(element, value) {
  if (element) element.textContent = value;
}

function setStatHTML(element, html) {
  if (element) element.innerHTML = html;
}

export function updateDeckUI(ui, deck, placedCount = 0) {
  if (ui.activeTile) ui.activeTile.innerHTML = renderMiniTile(deck[0]);
  if (ui.nextTile) ui.nextTile.innerHTML = renderMiniTile(deck[1]);
  setText(ui.deckRemaining, String(deck.length));
  setText(ui.tilesPlaced, String(placedCount));
}

export function updateKeyboardUI(ui, keys, rotationKeyActive = false, gridOnlyMode = false) {
  for (const key of ['z', 'q', 's', 'd']) {
    if (ui.keys[key]) ui.keys[key].classList.toggle('active', Boolean(keys[key]));
  }

  if (ui.keys.r) ui.keys.r.classList.toggle('active', rotationKeyActive);
  if (ui.keys.space) ui.keys.space.classList.toggle('active', gridOnlyMode);
}

export function setGridOnlyModeVisible(ui, visible) {
  document.body.classList.toggle('grid-only-mode', visible);
  if (ui.helpOverlay && visible) {
    ui.helpOverlay.classList.add('hidden');
    ui.helpOverlay.setAttribute('aria-hidden', 'true');
  }
}

export function setHelpVisible(ui, visible) {
  if (!ui.helpOverlay) return;

  ui.helpOverlay.classList.toggle('hidden', !visible);
  ui.helpOverlay.setAttribute('aria-hidden', visible ? 'false' : 'true');
  ui.keys.h?.classList.toggle('active', visible);
}

export function updateScoreUI(ui, totalScore, lastScore = 0, placedTileCount = null, totalGridTiles = null) {
  setText(ui.score, String(totalScore));
  setText(ui.lastScore, lastScore > 0 ? `(+${lastScore})` : lastScore < 0 ? `(${lastScore})` : '');

  if (placedTileCount !== null) {
    setText(ui.gridPercent, String(placedTileCount));
  }

  // 2026-08-01 — demande explicite : afficher, sous le score du HUD arcade
  // (#arcadeScore, en haut à gauche), l'efficacité EN COURS — même formule
  // (et mêmes constantes EFFICIENCY_MIN_TILES/_EXPONENT) que le classement de
  // la prez (index.php), qui minore l'efficacité brute quand le nombre de
  // tuiles posées est encore trop faible pour être significatif. Calculée ici
  // plutôt que dupliquée à chaque site d'appel de updateScoreUI (init, pose,
  // annulation, comète, sync multijoueur — cf. scene.js).
  if (ui.efficiency) {
    const tiles = placedTileCount ?? 0;
    let efficiency = 0;
    if (tiles > 0) {
      const confidence = EFFICIENCY_MIN_TILES > 0
        ? Math.pow(Math.min(tiles, EFFICIENCY_MIN_TILES) / EFFICIENCY_MIN_TILES, EFFICIENCY_MIN_TILES_EXPONENT)
        : 1;
      efficiency = (totalScore / tiles) * confidence;
    }
    // 2026-08-01 — le libellé "Efficacité" est un <span data-i18n="game.ui.hud.
    // efficiencyLabel"> statique dans game.php, traduit par gameHudI18n.js comme
    // tout le reste du HUD statique (réactif au changement de langue en jeu via
    // gameLangReactive.js). Erreur de la 1ère version : le libellé était injecté
    // ici via setText() sur TOUT #dbgEfficiency (HUD_TEXT.efficiencyLabel), ce qui
    // écrasait le texte à chaque pose de tuile mais ne se retraduisait qu'au
    // pose suivante — jamais immédiatement au changement de langue, puisque rien
    // ici n'écoute setGameLang(). Seule la valeur numérique est mise à jour ici.
    setText(ui.efficiencyValue, `${efficiency.toFixed(1)}%`);
  }
}


export function updateStatsUI(ui, stats) {
  if (!ui?.stats || !stats) return;

  setText(ui.stats.mills, String(stats.millCount ?? 0));
  setStatHTML(ui.stats.grass, formatStatValue(stats.totals?.grass));
  setStatHTML(ui.stats.field, formatStatValue(stats.totals?.field));
  setStatHTML(ui.stats.forest, formatStatValue(stats.totals?.forest));
  setStatHTML(ui.stats.house, formatStatValue(stats.totals?.house));
  setStatHTML(ui.stats.water, formatStatValue(stats.totals?.water));
  setStatHTML(ui.stats.rail, formatStatValue(stats.totals?.rail));
  setText(ui.stats.trains, String(stats.trainLines ?? 0));
  setText(ui.stats.boats, String(stats.boatCount ?? 0));
  setStatHTML(ui.stats.largestGrass, formatStatValue(stats.largest?.grass));
  setStatHTML(ui.stats.largestField, formatStatValue(stats.largest?.field));
  setStatHTML(ui.stats.largestForest, formatStatValue(stats.largest?.forest));
  setStatHTML(ui.stats.largestHouse, formatStatValue(stats.largest?.house));
  setStatHTML(ui.stats.largestWater, formatStatValue(stats.largest?.water));
  setStatHTML(ui.stats.largestRail, formatStatValue(stats.largest?.rail));
  setText(ui.stats.comets, String(stats.cometHits ?? 0));
}

function formatStatValue(value) {
  const amount = Number(value ?? 0);
  return `<span class="stat-num">${amount}</span>`;
}

export function updateMissionUI(ui, missions, formatter, progressByType = new Map()) {
  if (!ui.missionList) return;

  if (missions.length === 0) {
    ui.missionList.innerHTML = `<li class="mission-empty">${HUD_TEXT.noMission ?? 'Aucune mission'}</li>`;
    return;
  }

  ui.missionList.innerHTML = missions.map(mission => {
    const completed = mission.completed;
    const baseline  = mission.baseline ?? 0;
    const current   = progressByType.get(mission.type) ?? 0;
    const gained    = Math.max(0, Math.min(current - baseline, mission.target - baseline));
    const total     = Math.max(1, mission.target - baseline);
    const ratio     = gained / total;

    let tierClass = '';
    if (ratio >= 0.9)       tierClass = 'bar-close';
    else if (ratio >= 0.75) tierClass = 'bar-near';
    else if (ratio >= 0.5)  tierClass = 'bar-mid';

    // Barre continue glossy (2026-07-15, remplace l'ancien système à graduations
    // discrètes) : un seul fill dont la largeur suit le ratio de progression,
    // même palette par palier (bar-mid/near/close) qu'avant.
    const fillPct  = Math.round(ratio * 100);
    const fillHtml = `<div class="mission-bar-fill${tierClass ? ' ' + tierClass : ''}" style="width:${fillPct}%"></div>`;

    const typeIcon = MISSION_TYPE_ICON[mission.type] ?? '';
    const typeClass = `mission-type-${mission.type}`;
    const liClasses = ['mission-item', typeClass, completed ? 'mission-completed' : ''].filter(Boolean).join(' ');
    const realisedTag = '';
    const title = formatter ? escapeHtml(formatter(mission, progressByType)) : '';

    return `<li class="${liClasses}" data-mission-tip="${mission.type}">` +
      (title ? `<div class="mission-title">${title}</div>` : '') +
      `<div class="mission-row">` +
        `<div class="mission-bar">${fillHtml}</div>` +
        `<span class="mission-numbers"><span class="mission-cur">${current}</span><span class="mission-sep">/</span><span class="mission-goal">${mission.target}</span></span>` +
        `<span class="mission-type-icon">${typeIcon}</span>` +
      `</div>` +
      realisedTag +
      `</li>`;
  }).join('');
}

