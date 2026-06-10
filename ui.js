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
    lastScore: document.getElementById('dbgLastScore'),
    placement: document.getElementById('dbgPlacement'),
    keys: {
      z: document.getElementById('keyZ'),
      q: document.getElementById('keyQ'),
      s: document.getElementById('keyS'),
      d: document.getElementById('keyD'),
      r: document.getElementById('keyR'),
      h: document.getElementById('keyH')
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

export function updateKeyboardUI(ui, keys, rotationKeyActive = false) {
  for (const key of ['z', 'q', 's', 'd']) {
    if (ui.keys[key]) ui.keys[key].classList.toggle('active', Boolean(keys[key]));
  }

  if (ui.keys.r) ui.keys.r.classList.toggle('active', rotationKeyActive);
}

export function setHelpVisible(ui, visible) {
  if (!ui.helpOverlay) return;

  ui.helpOverlay.classList.toggle('hidden', !visible);
  ui.helpOverlay.setAttribute('aria-hidden', visible ? 'false' : 'true');
  ui.keys.h?.classList.toggle('active', visible);
}

export function updateScoreUI(ui, totalScore, lastScore = 0) {
  setText(ui.score, String(totalScore));
  setText(ui.lastScore, lastScore > 0 ? `+${lastScore}` : String(lastScore));
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
