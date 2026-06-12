import { renderMiniTile } from './tileMesh.js';

export function createUI() {
  return {
    resetCamera: document.getElementById('btnResetCamera'),
    undoLastTile: document.getElementById('btnUndoLastTile'),
    abandonGame: document.getElementById('btnAbandonGame'),
    newGame: document.getElementById('btnNewGame'),
    activeTile: document.getElementById('activeTile'),
    nextTile: document.getElementById('nextTile'),
    deckRemaining: document.getElementById('deckRemaining'),
    missionList: document.getElementById('missionList'),
    rotation: document.getElementById('dbgRotation'),
    score: document.getElementById('dbgScore'),
    gridPercent: document.getElementById('dbgGridPercent'),
    lastScore: document.getElementById('dbgLastScore'),
    stats: {
      tiles: document.getElementById('statTiles'),
      grass: document.getElementById('statGrass'),
      field: document.getElementById('statField'),
      forest: document.getElementById('statForest'),
      house: document.getElementById('statHouse'),
      water: document.getElementById('statWater'),
      rail: document.getElementById('statRail'),
      trains: document.getElementById('statTrains'),
      largestGrass: document.getElementById('statLargestGrass'),
      largestField: document.getElementById('statLargestField'),
      largestForest: document.getElementById('statLargestForest'),
      largestHouse: document.getElementById('statLargestHouse'),
      largestWater: document.getElementById('statLargestWater'),
      largestRail: document.getElementById('statLargestRail')
    },
    placement: document.getElementById('dbgPlacement'),
    keys: {
      z: document.getElementById('keyZ'),
      q: document.getElementById('keyQ'),
      s: document.getElementById('keyS'),
      d: document.getElementById('keyD'),
      r: document.getElementById('keyR'),
      h: document.getElementById('keyH'),
      space: document.getElementById('keySpace')
    },
    helpOverlay: document.getElementById('helpOverlay'),
    closeHelp: document.getElementById('btnCloseHelp')
  };
}

export function setText(element, value) {
  if (element) element.textContent = value;
}

export function updateDeckUI(ui, deck) {
  if (ui.activeTile) ui.activeTile.innerHTML = renderMiniTile(deck[0]);
  if (ui.nextTile) ui.nextTile.innerHTML = renderMiniTile(deck[1]);
  setText(ui.deckRemaining, String(deck.length));
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
  setText(ui.lastScore, lastScore > 0 ? `+${lastScore}` : String(lastScore));

  if (placedTileCount !== null && totalGridTiles !== null) {
    const percentage = totalGridTiles > 0 ? (placedTileCount / totalGridTiles) * 100 : 0;
    setText(ui.gridPercent, `${percentage.toFixed(1)}%`);
  }
}


export function updateStatsUI(ui, stats) {
  if (!ui?.stats || !stats) return;

  setText(ui.stats.tiles, String(stats.tiles ?? 0));
  setText(ui.stats.grass, formatStatValue(stats.totals?.grass, 'unité', 'unités'));
  setText(ui.stats.field, formatStatValue(stats.totals?.field, 'champ de blé', 'champs de blé'));
  setText(ui.stats.forest, formatStatValue(stats.totals?.forest, 'arbre', 'arbres'));
  setText(ui.stats.house, formatStatValue(stats.totals?.house, 'maison', 'maisons'));
  setText(ui.stats.water, formatStatValue(stats.totals?.water, 'unité', 'unités'));
  setText(ui.stats.rail, formatStatValue(stats.totals?.rail, 'rail', 'rails'));
  setText(ui.stats.trains, String(stats.trainLines ?? 0));
  setText(ui.stats.largestGrass, formatStatValue(stats.largest?.grass, 'unité', 'unités'));
  setText(ui.stats.largestField, formatStatValue(stats.largest?.field, 'champ de blé', 'champs de blé'));
  setText(ui.stats.largestForest, formatStatValue(stats.largest?.forest, 'arbre', 'arbres'));
  setText(ui.stats.largestHouse, formatStatValue(stats.largest?.house, 'maison', 'maisons'));
  setText(ui.stats.largestWater, formatStatValue(stats.largest?.water, 'unité', 'unités'));
  setText(ui.stats.largestRail, formatStatValue(stats.largest?.rail, 'rail', 'rails'));
}

function formatStatValue(value, singularUnit, pluralUnit) {
  const amount = Number(value ?? 0);
  const unit = amount <= 1 ? singularUnit : pluralUnit;
  return `${amount} ${unit}`;
}

export function updateMissionUI(ui, missions, formatter, progressByType = new Map()) {
  if (!ui.missionList) return;

  if (missions.length === 0) {
    ui.missionList.innerHTML = '<li class="mission-empty">Aucune mission</li>';
    return;
  }

  ui.missionList.innerHTML = missions.map(mission => {
    const className = mission.completed ? ' class="mission-completed"' : '';
    const icon = mission.completed ? '✅' : '🎯';

    return `<li${className}><span class="mission-icon">${icon}</span><span class="mission-text">${escapeHtml(formatter(mission, progressByType))}</span></li>`;
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
