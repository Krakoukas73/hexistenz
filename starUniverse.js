import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { GRID_RADIUS, HEX_SIZE, TILE_VISUAL } from './config.js';
import { axialToWorld } from './hex.js';
import { markNoWorldCurvature } from './worldCurvature.js';
import { starVertexShader, starFragmentShader } from './shaders/shaderEtoiles.js';

const STAR_UNIVERSE_NAME = 'hexistenz-distant-star-universe';
const GRID_OCCLUDER_NAME = 'hexistenz-grid-star-occluder';
const DEFAULT_RADIUS = 560;
const DEFAULT_STAR_COUNT = 2600;
const DEFAULT_SEED = 0x5eed5;

export function ensureStarUniverse(scene, options = {}) {
  let stars = scene.getObjectByName(STAR_UNIVERSE_NAME);
  if (!stars) {
    stars = createStarUniverse(options);
    scene.add(stars);
  }
  stars.visible = true;

  let occluder = scene.getObjectByName(GRID_OCCLUDER_NAME);
  if (!occluder) {
    occluder = createGridStarOccluder();
    scene.add(occluder);
  }
  occluder.visible = true;

  return stars;
}

export function updateStarUniverse(scene, timeSeconds = 0) {
  const stars = scene?.getObjectByName?.(STAR_UNIVERSE_NAME);
  if (stars?.material?.uniforms) {
    stars.material.uniforms.uTime.value = timeSeconds;
  }

  syncGridStarOccluder(scene);
}

function createStarUniverse({ radius = DEFAULT_RADIUS, starCount = DEFAULT_STAR_COUNT, seed = DEFAULT_SEED } = {}) {
  const random = mulberry32(seed);
  const positions = new Float32Array(starCount * 3);
  const colors = new Float32Array(starCount * 3);
  const sizes = new Float32Array(starCount);
  const phases = new Float32Array(starCount);
  const twinkles = new Float32Array(starCount);

  for (let i = 0; i < starCount; i += 1) {
    const theta = random() * Math.PI * 2;
    const y = (random() * 2) - 1;
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    const distance = radius * (0.985 + random() * 0.03);
    const index3 = i * 3;

    positions[index3 + 0] = Math.cos(theta) * ring * distance;
    positions[index3 + 1] = y * distance;
    positions[index3 + 2] = Math.sin(theta) * ring * distance;

    const warmth = random();
    const intensity = 0.72 + random() * 0.34;
    colors[index3 + 0] = (0.78 + warmth * 0.20) * intensity;
    colors[index3 + 1] = (0.84 + random() * 0.12) * intensity;
    colors[index3 + 2] = (0.92 + (1 - warmth) * 0.12) * intensity;

    const rareBigStar = random() > 0.965;
    sizes[i] = rareBigStar ? 3.0 + random() * 2.7 : 1.15 + random() * 1.65;
    phases[i] = random() * Math.PI * 2;
    twinkles[i] = 0.65 + random() * 1.85;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute('aTwinkle', new THREE.BufferAttribute(twinkles, 1));
  geometry.computeBoundingSphere();

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 1.25) }
    },
    // Shaders externalisés dans shaders/shaderEtoiles.js
    vertexShader:   starVertexShader,
    fragmentShader: starFragmentShader,
    transparent: false,
    depthWrite: false,
    depthTest: false,
    fog: false
  });

  const stars = markNoWorldCurvature(new THREE.Points(geometry, material));
  stars.name = STAR_UNIVERSE_NAME;
  stars.renderOrder = -100000;
  stars.frustumCulled = false;
  stars.userData.disableCastShadow = true;
  stars.userData.disableReceiveShadow = true;
  stars.userData.disableWorldCurvature = true;
  stars.userData.skipPaletteHarmony = true;
  return stars;
}

function syncGridStarOccluder(scene) {
  const gridGroup = scene?.getObjectByName?.('placement-grid');
  const occluder = scene?.getObjectByName?.(GRID_OCCLUDER_NAME);
  const gridKeys = gridGroup?.userData?.gridKeys;

  if (!occluder || !gridKeys?.size) return;

  const signature = makeGridKeySignature(gridKeys);
  if (occluder.userData.gridSignature === signature) return;

  const geometry = createGridStarOccluderGeometry(gridKeys);
  occluder.geometry.dispose();
  occluder.geometry = geometry;
  occluder.userData.gridSignature = signature;
}

function createGridStarOccluder(gridKeys = createBaseGridKeys()) {
  const material = new THREE.MeshBasicMaterial({
    color: 0x060910,
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: THREE.DoubleSide,
    fog: false
  });

  const mesh = new THREE.Mesh(createGridStarOccluderGeometry(gridKeys), material);
  mesh.name = GRID_OCCLUDER_NAME;
  mesh.renderOrder = -500;
  mesh.frustumCulled = false;
  mesh.userData.disableCastShadow = true;
  mesh.userData.disableReceiveShadow = true;
  mesh.userData.skipPaletteHarmony = true;
  mesh.userData.gridSignature = makeGridKeySignature(gridKeys);
  return mesh;
}

function createGridStarOccluderGeometry(gridKeys) {
  const y = (TILE_VISUAL.waterY ?? -0.075) - (TILE_VISUAL.waterThickness ?? 0.08) - 0.028;
  const vertices = [];
  const radius = HEX_SIZE * 0.982;

  for (const key of gridKeys) {
    const hex = parseGridKey(key);
    if (!hex) continue;

    const { x, z } = axialToWorld(hex.q, hex.r);
    for (let i = 0; i < 6; i += 1) {
      const a0 = (Math.PI / 3) * i + (Math.PI / 3);
      const a1 = (Math.PI / 3) * (i + 1) + (Math.PI / 3);
      vertices.push(
        x, y, z,
        x + radius * Math.cos(a0), y, z + radius * Math.sin(a0),
        x + radius * Math.cos(a1), y, z + radius * Math.sin(a1)
      );
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function createBaseGridKeys() {
  const keys = new Set();
  for (let q = -GRID_RADIUS; q <= GRID_RADIUS; q += 1) {
    for (let r = -GRID_RADIUS; r <= GRID_RADIUS; r += 1) {
      if (isGridHex(q, r)) keys.add(`${q},${r}`);
    }
  }
  return keys;
}

function parseGridKey(key) {
  const [q, r] = `${key}`.split(',').map(Number);
  if (!Number.isFinite(q) || !Number.isFinite(r)) return null;
  return { q, r };
}

function makeGridKeySignature(gridKeys) {
  if (!gridKeys?.size) return 'empty';
  let lastKey = '';
  for (const key of gridKeys) lastKey = key;
  return `${gridKeys.size}:${lastKey}`;
}

function isGridHex(q, r) {
  return Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r)) <= GRID_RADIUS;
}

function mulberry32(seed) {
  let value = seed >>> 0;
  return function random() {
    value += 0x6D2B79F5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
