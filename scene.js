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

  ghostTile.visible = false;

  scene.add(createGrid(), ghostTile);
  updateDeckUI(ui, deck);
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

    ghostTile.visible = false;
    setText(ui.selected, key);

    deck.shift();
    deck.push(generateTile());
    rotationIndex = 0;
    updateDeckUI(ui, deck);
    updateScoreUI(ui, totalScore, scoreResult.total);
  }

  function rotateActiveTile(step) {
    const hasTarget = hoveredHex && isPlacementTarget(hoveredHex);

    rotationIndex = normalizeRotation(rotationIndex + step);
    setText(ui.rotation, `${rotationIndex}/6`);

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


  function createPlacementFeedbackOverlay(validation) {
    const group = new THREE.Group();
    const color = validation.valid ? 0x35ff70 : 0xff3030;
    const radius = 1.02;
    const points = [];

    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i;
      points.push(new THREE.Vector3(Math.cos(angle) * radius, 0.055, Math.sin(angle) * radius));
    }

    points.push(points[0].clone());
    group.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 })
    ));

    for (const conflict of validation.conflicts ?? []) {
      const marker = createConflictMarker(conflict.edge);
      group.add(marker);
    }

    return group;
  }

  function createConflictMarker(edge) {
    const angle = getEdgeAngle(edge);
    const geometry = new THREE.BoxGeometry(0.42, 0.035, 0.12);
    const material = new THREE.MeshBasicMaterial({ color: 0xff3030 });
    const marker = new THREE.Mesh(geometry, material);

    marker.position.set(Math.cos(angle) * 0.82, 0.075, Math.sin(angle) * 0.82);
    marker.rotation.y = -angle;
    return marker;
  }

  function getEdgeAngle(edge) {
    return {
      n: Math.PI / 6,
      ne: Math.PI / 2,
      se: Math.PI * 5 / 6,
      s: Math.PI * 7 / 6,
      sw: Math.PI * 3 / 2,
      nw: Math.PI * 11 / 6
    }[edge] ?? 0;
  }

  function getPlacementLabel(validation) {
    if (validation.valid) return 'OK';
    if (validation.reason !== 'INVALID_NETWORK_CONNECTION') return validation.reason ?? 'INTERDIT';

    return validation.conflicts
      ?.map(conflict => `${formatEdgeType(conflict.ownType)} ≠ ${formatEdgeType(conflict.neighborType)}`)
      .join(', ') || 'RÉSEAU INCOMPATIBLE';
  }

  function formatEdgeType(type) {
    return {
      field: 'champ',
      forest: 'forêt',
      water: 'eau',
      rail: 'rail',
      house: 'maison',
      grass: 'prairie'
    }[type] ?? type;
  }

  function undoLastPlacement() {
    const last = placementHistory.pop();
    if (!last) return;

    scene.remove(last.mesh);
    last.mesh.traverse?.(object => {
      object.geometry?.dispose?.();
    });

    placedTiles.delete(last.key);
    totalScore = Math.max(0, totalScore - (last.score ?? 0));

    deck.pop();
    deck.unshift(last.tile);
    rotationIndex = 0;

    setText(ui.selected, '-');
    setText(ui.rotation, '0/6');
    updateDeckUI(ui, deck);
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

