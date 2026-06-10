import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { DECK_SIZE } from './config.js';
import { CameraControls } from './controls.js';
import { createGrid } from './grid.js';
import { axialToWorld, makeHexKey } from './hex.js';
import { createTileMesh } from './tileMesh.js';
import { canPlaceTileAt, getPlacementValidation } from './placementRules.js';
import { calculatePlacementScore } from './scoring.js';
import { createDeck, generateTile, rotateTile } from './tileGenerator.js';
import { createUI, setHelpVisible, setText, updateDeckUI, updateKeyboardUI, updateScoreUI } from './ui.js';
import { createPlacementFeedbackOverlay, getPlacementLabel } from './placementOverlay.js';
import { createWaterZoneOverlay, rebuildWaterZoneOverlay } from './waterZoneOverlay.js';

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
  let totalScore = 0;
  let helpVisible = false;

  const ghostTile = new THREE.Group();
  const waterZoneOverlay = createWaterZoneOverlay();

  ghostTile.visible = false;

  scene.add(createGrid(), waterZoneOverlay, ghostTile);
  refreshDeckUI();
  updateScoreUI(ui, totalScore, 0);

  ui.resetCamera?.addEventListener('click', event => {
    event.stopPropagation();
    controls.reset();
  });

  ui.undoLastTile?.addEventListener('click', event => {
    event.stopPropagation();
    undoLastPlacement();
  });

  ui.closeHelp?.addEventListener('click', event => {
    event.stopPropagation();
    toggleHelp(false);
  });

  ui.helpOverlay?.addEventListener('click', event => {
    if (event.target === ui.helpOverlay) toggleHelp(false);
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
    const key = event.key.toLowerCase();

    if (key === 'h') {
      event.preventDefault();
      toggleHelp();
      return;
    }

    if (key === 'escape' && helpVisible) {
      event.preventDefault();
      toggleHelp(false);
      return;
    }

    if (key !== 'r' || helpVisible) return;
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

  function refreshDeckUI() {
    updateDeckUI(ui, [rotateTile(deck[0], rotationIndex), deck[1]]);
  }

  function toggleHelp(forceVisible = null) {
    helpVisible = forceVisible ?? !helpVisible;
    setHelpVisible(ui, helpVisible);
  }

  function updateHover(hex) {
    const key = makeHexKey(hex.q, hex.r);
    const position = axialToWorld(hex.q, hex.r);

    setText(ui.hover, key);

    if (!isPlacementTarget(hex)) {
      ghostTile.visible = false;
      setText(ui.placement, '-');
      return;
    }

    const tile = rotateTile(deck[0], rotationIndex);
    const validation = getPlacementValidation(hex, placedTiles, tile);
    rebuildGhost(position, tile, validation);
  }

  function placeTile(hex) {
    if (!isPlacementTarget(hex)) return;

    const key = makeHexKey(hex.q, hex.r);
    const position = axialToWorld(hex.q, hex.r);
    const tile = rotateTile(deck[0], rotationIndex);
    const validation = getPlacementValidation(hex, placedTiles, tile);

    if (!validation.valid) {
      rebuildGhost(position, tile, validation);
      return;
    }
    const scoreResult = calculatePlacementScore(hex, placedTiles, tile);
    const mesh = createTileMesh(tile);

    mesh.position.set(position.x, 0.003, position.z);
    scene.add(mesh);

    const placedTile = { q: hex.q, r: hex.r, key, tile, mesh, score: scoreResult.total };
    totalScore += scoreResult.total;

    placedTiles.set(key, placedTile);
    placementHistory.push(placedTile);
    rebuildWaterZoneOverlay(waterZoneOverlay, placedTiles);

    ghostTile.visible = false;
    setText(ui.selected, key);

    deck.shift();
    deck.push(generateTile());
    rotationIndex = 0;
    refreshDeckUI();
    updateScoreUI(ui, totalScore, scoreResult.total);
  }

  function rotateActiveTile(step) {
    const hasTarget = hoveredHex && isPlacementTarget(hoveredHex);

    rotationIndex = normalizeRotation(rotationIndex + step);
    setText(ui.rotation, `${rotationIndex}/6`);
    refreshDeckUI();

    if (hasTarget) {
      const position = axialToWorld(hoveredHex.q, hoveredHex.r);
      const tile = rotateTile(deck[0], rotationIndex);
      const validation = getPlacementValidation(hoveredHex, placedTiles, tile);
      rebuildGhost(position, tile, validation);
    }
  }

  function rebuildGhost(position, tile = rotateTile(deck[0], rotationIndex), validation = null) {
    const status = validation ?? getPlacementValidation(hoveredHex, placedTiles, tile);

    ghostTile.clear();
    ghostTile.add(createTileMesh(tile, { opacity: 1 }));
    ghostTile.add(createPlacementFeedbackOverlay(status));
    ghostTile.position.set(position.x, 0.003, position.z);
    ghostTile.visible = true;

    setText(ui.placement, getPlacementLabel(status));
  }


  function undoLastPlacement() {
    const last = placementHistory.pop();
    if (!last) return;

    scene.remove(last.mesh);
    last.mesh.traverse?.(object => {
      object.geometry?.dispose?.();
    });

    placedTiles.delete(last.key);
    rebuildWaterZoneOverlay(waterZoneOverlay, placedTiles);
    totalScore = Math.max(0, totalScore - (last.score ?? 0));

    deck.pop();
    deck.unshift(last.tile);
    rotationIndex = 0;

    setText(ui.selected, '-');
    setText(ui.rotation, '0/6');
    refreshDeckUI();
    updateScoreUI(ui, totalScore, -(last.score ?? 0));

    if (hoveredHex && isPlacementTarget(hoveredHex)) {
      const position = axialToWorld(hoveredHex.q, hoveredHex.r);
      const tile = rotateTile(deck[0], rotationIndex);
      const validation = getPlacementValidation(hoveredHex, placedTiles, tile);
      rebuildGhost(position, tile, validation);
    } else {
      ghostTile.visible = false;
      setText(ui.placement, '-');
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

