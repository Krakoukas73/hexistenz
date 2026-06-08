import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { DECK_SIZE } from './config.js';
import { CameraControls } from './controls.js';
import { createGrid } from './grid.js';
import { axialToWorld, makeHexKey } from './hex.js';
import { createTileMesh } from './tileMesh.js';
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
    if (hex && isAvailable(hex)) rotateActiveTile(deltaY < 0 ? 1 : -1);
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

    if (placedTiles.has(key)) {
      ghostTile.visible = false;
      return;
    }

    rebuildGhost(position);
  }

  function placeTile(hex) {
    if (!isAvailable(hex)) return;

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
    rotationIndex = (rotationIndex + step + 6) % 6;
    setText(ui.rotation, `${rotationIndex}/6`);

    if (hoveredHex && isAvailable(hoveredHex)) {
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

    if (hoveredHex && isAvailable(hoveredHex)) {
      const position = axialToWorld(hoveredHex.q, hoveredHex.r);
      rebuildGhost(position);
    } else {
      ghostTile.visible = false;
    }
  }

  function isAvailable(hex) {
    return !placedTiles.has(makeHexKey(hex.q, hex.r));
  }
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

