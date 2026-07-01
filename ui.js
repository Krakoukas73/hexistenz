import { renderMiniTile } from './tileMesh.js';
import { LUT_HELP, ensureHelpTooltip, delegateHelpTooltip, attachHelpTooltip } from './help.js';
import { MISSION_TYPE_ICON, MISSION_HELP } from './missions.js';

export function createUI() {
  const ui = {
    resetCamera: document.getElementById('btnResetCamera'),
    undoLastTile: document.getElementById('btnUndoLastTile'),
    abandonGame: document.getElementById('btnAbandonGame'),
    newGame: document.getElementById('btnNewGame'),
    activeTile: document.getElementById('activeTile'),
    nextTile: document.getElementById('nextTile'),
    deckRemaining: document.getElementById('deckRemaining'),
    tilesPlaced: document.getElementById('tilesPlaced'),
    missionList: document.getElementById('missionList'),
    rotation: document.getElementById('dbgRotation'),
    score: document.getElementById('dbgScore'),
    gridPercent: document.getElementById('dbgGridPercent'),
    lastScore: document.getElementById('dbgLastScore'),
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
  for (const [id, helpKey] of Object.entries(_statHelpMap)) {
    const el = document.getElementById(id);
    if (el) el.dataset.statHelp = helpKey;
  }
  const statsPanel = document.getElementById('statsPanel');
  if (statsPanel) {
    ensureHelpTooltip();
    delegateHelpTooltip(statsPanel, 'stat-help', LUT_HELP);
  }

  // Tooltips sur les boutons de partie
  attachHelpTooltip(ui.newGame, LUT_HELP['game.newGame']);
  attachHelpTooltip(ui.abandonGame, LUT_HELP['game.abandonGame']);

  // Tooltips sur les valeurs du HUD principal (tuiles posées, dernier coup)
  // On attache sur le wrapper qui englobe titre + nombre pour une zone de hover plus large
  attachHelpTooltip(ui.gridPercent?.parentElement, LUT_HELP['game.gridPercent']);
  attachHelpTooltip(ui.lastScore?.parentElement, LUT_HELP['game.lastScore']);

  // Tooltips sur les 3 boîtes tuiles (tileUI droite)
  attachHelpTooltip(ui.activeTile?.parentElement,   LUT_HELP['game.activeTile']);
  attachHelpTooltip(ui.nextTile?.parentElement,     LUT_HELP['game.nextTile']);
  attachHelpTooltip(ui.deckRemaining?.parentElement, LUT_HELP['game.deckRemaining']);
  attachHelpTooltip(ui.tilesPlaced?.parentElement,  LUT_HELP['game.tiles']);

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
    ui.missionList.innerHTML = '<li class="mission-empty">Aucune mission</li>';
    return;
  }

  ui.missionList.innerHTML = missions.map(mission => {
    const completed = mission.completed;
    const baseline  = mission.baseline ?? 0;
    const current   = progressByType.get(mission.type) ?? 0;
    const gained    = Math.max(0, Math.min(current - baseline, mission.target - baseline));
    const total     = Math.max(1, mission.target - baseline);
    const ratio     = gained / total;
    const pct       = Math.round(ratio * 100);

    let fillClass = 'mission-bar-fill';
    if (ratio >= 0.9)       fillClass += ' bar-close';
    else if (ratio >= 0.75) fillClass += ' bar-near';
    else if (ratio >= 0.5)  fillClass += ' bar-mid';

    const typeIcon = MISSION_TYPE_ICON[mission.type] ?? '';
    const typeClass = `mission-type-${mission.type}`;
    const liClasses = ['mission-item', typeClass, completed ? 'mission-completed' : ''].filter(Boolean).join(' ');
    const realisedTag = '';

    return `<li class="${liClasses}" data-mission-tip="${mission.type}">` +
      `<div class="mission-bar"><div class="${fillClass}" style="width:${pct}%"></div></div>` +
      `<span class="mission-numbers"><span class="mission-cur">${current}</span><span class="mission-sep">/</span><span class="mission-goal">${mission.target}</span></span>` +
      `<span class="mission-type-icon">${typeIcon}</span>` +
      realisedTag +
      `</li>`;
  }).join('');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;'
  }[character]));
}
