import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { DECK_SIZE } from './config.js';
import { CameraControls } from './controls.js';
import { createGrid } from './grid.js';
import { axialToWorld, makeHexKey } from './hex.js';
import { createTileMesh } from './tileMesh.js';
import { canPlaceTileAt } from './placementRules.js';
import { createDeck, generateTile, rotateTile } from './tileGenerator.js';
import { createUI, setText, updateDeckUI, updateKeyboardUI } from './ui.js';

export function initScene() {
  const canvas = document.getElementById('app');
  const renderer = createRenderer(canvas);
  const scene = createThreeScene();
  const camera = createCamera();
  const controls = new CameraControls(camera, canvas);
  const ui = createUI();

  const placedTiles = new Map();
  const placementHistory = [];
  const deck = createDeck(DECK_SIZE);
  let hoveredHex = null;
  let rotationIndex = 0;
  let rotationKeyActive = false;

  const ghostTile = new THREE.Group();

  ghostTile.visible = false;

  scene.add(createGrid(), ghostTile);
  updateDeckUI(ui, deck);

  ui.resetCamera?.addEventListener('click', event => {
    event.stopPropagation();
    controls.reset();
  });

  ui.undoLastTile?.addEventListener('click', event => {
    event.stopPropagation();
    undoLastPlacement();
  });

  controls.onHover = (hex) => {
    hoveredHex = hex;
    updateHover(hex);
  };

  controls.onClick = (hex) => placeTile(hex);

  controls.onWheel = (hex, deltaY) => {
    if (hex && isPlacementTarget(hex)) rotateActiveTile(deltaY < 0 ? 1 : -1);
    else controls.zoom(deltaY);
  };

  window.addEventListener('keydown', event => {
    if (event.key.toLowerCase() !== 'r') return;
    rotationKeyActive = true;
    rotateActiveTile(1);
  });

  window.addEventListener('keyup', event => {
    if (event.key.toLowerCase() === 'r') rotationKeyActive = false;
  });

  window.addEventListener('resize', () => resizeRenderer(renderer, camera));

  animate();

  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    updateKeyboardUI(ui, controls.keys, rotationKeyActive);
    renderer.render(scene, camera);
  }

  function updateHover(hex) {
    const key = makeHexKey(hex.q, hex.r);
    const position = axialToWorld(hex.q, hex.r);

    setText(ui.hover, key);

    if (!isPlacementTarget(hex)) {
      ghostTile.visible = false;
      return;
    }

    if (!ensureCompatibleRotation(0)) {
      ghostTile.visible = false;
      return;
    }

    rebuildGhost(position);
  }

  function placeTile(hex) {
    if (!isPlacementTarget(hex)) return;
    if (!ensureCompatibleRotation(0)) return;

    const key = makeHexKey(hex.q, hex.r);
    const position = axialToWorld(hex.q, hex.r);
    const tile = rotateTile(deck[0], rotationIndex);
    const mesh = createTileMesh(tile);

    mesh.position.set(position.x, 0.003, position.z);
    scene.add(mesh);

    const placedTile = { q: hex.q, r: hex.r, key, tile, mesh };

    placedTiles.set(key, placedTile);
    placementHistory.push(placedTile);

    ghostTile.visible = false;
    setText(ui.selected, key);

    deck.shift();
    deck.push(generateTile());
    rotationIndex = 0;
    updateDeckUI(ui, deck);
  }

  function rotateActiveTile(step) {
    const hasTarget = hoveredHex && isPlacementTarget(hoveredHex);

    if (hasTarget) {
      if (!ensureCompatibleRotation(step)) {
        ghostTile.visible = false;
        return;
      }
    } else {
      rotationIndex = normalizeRotation(rotationIndex + step);
    }

    setText(ui.rotation, `${rotationIndex}/6`);

    if (hasTarget) {
      const position = axialToWorld(hoveredHex.q, hoveredHex.r);
      rebuildGhost(position);
    }
  }

  function rebuildGhost(position) {
    ghostTile.clear();
    ghostTile.add(createTileMesh(rotateTile(deck[0], rotationIndex)));
    ghostTile.position.set(position.x, 0.003, position.z);
    ghostTile.visible = true;
  }

  function undoLastPlacement() {
    const last = placementHistory.pop();
    if (!last) return;

    scene.remove(last.mesh);
    last.mesh.traverse?.(object => {
      object.geometry?.dispose?.();
    });

    placedTiles.delete(last.key);

    deck.pop();
    deck.unshift(last.tile);
    rotationIndex = 0;

    setText(ui.selected, '-');
    setText(ui.rotation, '0/6');
    updateDeckUI(ui, deck);

    if (hoveredHex && isPlacementTarget(hoveredHex) && ensureCompatibleRotation(0)) {
      const position = axialToWorld(hoveredHex.q, hoveredHex.r);
      rebuildGhost(position);
    } else {
      ghostTile.visible = false;
    }
  }

  function isPlacementTarget(hex) {
    return canPlaceTileAt(hex, placedTiles);
  }

  function isCurrentRotationValid() {
    return canPlaceTileAt(hoveredHex, placedTiles, rotateTile(deck[0], rotationIndex));
  }

  function ensureCompatibleRotation(step) {
    if (!hoveredHex || !isPlacementTarget(hoveredHex)) return false;

    const direction = Math.sign(step);

    if (direction === 0 && isCurrentRotationValid()) return true;

    const scanDirection = direction === 0 ? 1 : direction;
    const start = normalizeRotation(rotationIndex + scanDirection);

    for (let offset = 0; offset < 6; offset++) {
      const candidate = normalizeRotation(start + offset * scanDirection);
      const rotatedTile = rotateTile(deck[0], candidate);

      if (canPlaceTileAt(hoveredHex, placedTiles, rotatedTile)) {
        rotationIndex = candidate;
        setText(ui.rotation, `${rotationIndex}/6`);
        return true;
      }
    }

    return false;
  }
}

function normalizeRotation(value) {
  return ((value % 6) + 6) % 6;
}

function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  return renderer;
}

function createThreeScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0f14);
  return scene;
}

function createCamera() {
  return new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
}

function resizeRenderer(renderer, camera) {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

