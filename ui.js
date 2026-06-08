import { renderMiniTile } from './tileMesh.js';

export function createUI() {
  return {
    hover: document.getElementById('dbgHover'),
    selected: document.getElementById('dbgSelected'),
    resetCamera: document.getElementById('btnResetCamera'),
    undoLastTile: document.getElementById('btnUndoLastTile'),
    activeTile: document.getElementById('activeTile'),
    nextTile: document.getElementById('nextTile'),
    rotation: document.getElementById('dbgRotation'),
    keys: {
      z: document.getElementById('keyZ'),
      q: document.getElementById('keyQ'),
      s: document.getElementById('keyS'),
      d: document.getElementById('keyD'),
      r: document.getElementById('keyR')
    }
  };
}

export function setText(element, value) {
  if (element) element.textContent = value;
}

export function updateDeckUI(ui, deck) {
  if (ui.activeTile) ui.activeTile.innerHTML = renderMiniTile(deck[0]);
  if (ui.nextTile) ui.nextTile.innerHTML = renderMiniTile(deck[1]);
}

export function updateKeyboardUI(ui, keys, rotationKeyActive = false) {
  for (const key of ['z', 'q', 's', 'd']) {
    if (ui.keys[key]) ui.keys[key].classList.toggle('active', Boolean(keys[key]));
  }

  if (ui.keys.r) ui.keys.r.classList.toggle('active', rotationKeyActive);
}
