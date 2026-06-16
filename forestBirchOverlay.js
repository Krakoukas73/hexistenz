import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';
import { EDGE_TYPES, HEX_SIZE, TILE_VISUAL } from './config.js';
import { axialToWorld } from './hex.js';
import { getEdgeType, getEdgeValue } from './tileGenerator.js';

const TREE_MODEL_DEFS = [
  { key: 'birch', url: './glb/tree_birch.glb', baseScale: 0.225 },
  { key: 'bushy_mini', url: './glb/tree_bushy_mini.glb', baseScale: 0.225 },
  { key: 'oak_round', url: './glb/tree_oak_round.glb', baseScale: 0.225 },
  { key: 'pine_soft', url: './glb/tree_pine_soft.glb', baseScale: 0.250 },
  { key: 'poplar', url: './glb/tree_poplar.glb', baseScale: 0.250 }
];

const TREE_SIZE_MULTIPLIER = 2.07;
// Alignement sol réel des forêts : les dalles forest sont abaissées de 30% d'épaisseur (0.12 * -0.30 = -0.036).
// Léger enfouissement pour éviter tout flottement visible sur le relief.
const TREE_Y = -0.042;
const CENTER_SAFE_RADIUS = HEX_SIZE * (TILE_VISUAL.centerRadiusScale + 0.08);
const MIN_TREE_DISTANCE = 0.115;
const MAX_TREE_PLACEMENT_ATTEMPTS = 36;
const SECTOR_DEFS = [
  { key: 'n', a: 0, b: 1 },
  { key: 'ne', a: 1, b: 2 },
  { key: 'se', a: 2, b: 3 },
  { key: 's', a: 3, b: 4 },
  { key: 'sw', a: 4, b: 5 },
  { key: 'nw', a: 5, b: 0 }
];

const treeLibrary = new Map();
let modelsLoading = false;
let modelsRequested = false;

export function createForestBirchOverlay() {
  const group = new THREE.Group();
  group.name = 'forest-tree-glb-overlay';
  ensureTreeModels(group);
  return group;
}

export function rebuildForestBirchOverlay(group, placedTiles) {
  group.userData.lastPlacedTiles = placedTiles;
  disposeOverlayChildren(group);

  if (treeLibrary.size === 0) {
    ensureTreeModels(group);
    return;
  }

  for (const placedTile of placedTiles.values()) {
    addTreesForTile(group, placedTile);
  }
}

function ensureTreeModels(group) {
  if (modelsLoading || modelsRequested) return;
  modelsLoading = true;
  modelsRequested = true;

  let pending = TREE_MODEL_DEFS.length;
  const finishOne = () => {
    pending -= 1;
    if (pending > 0) return;

    modelsLoading = false;
    const lastPlacedTiles = group.userData.lastPlacedTiles;
    if (lastPlacedTiles) rebuildForestBirchOverlay(group, lastPlacedTiles);
  };

  for (const def of TREE_MODEL_DEFS) {
    new GLTFLoader().load(
      def.url,
      gltf => {
        treeLibrary.set(def.key, prepareTreePrototype(gltf.scene, def));
        finishOne();
      },
      undefined,
      error => {
        // Les modèles ajoutés plus tard ne doivent jamais casser la partie si un fichier manque.
        console.warn(`Modèle arbre GLB indisponible : ${def.url}`, error);
        finishOne();
      }
    );
  }
}

function prepareTreePrototype(model, def) {
  const source = model.clone(true);
  const prototype = normalizeModel(source, def);

  prototype.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    if (object.material) {
      object.material = cloneVisibleMaterial(object.material);
    }
  });

  return prototype;
}

function cloneVisibleMaterial(material) {
  if (Array.isArray(material)) return material.map(item => cloneVisibleMaterial(item));

  const cloned = material.clone();
  cloned.side = THREE.DoubleSide;

  // Les couleurs/textures du GLB doivent rester celles du modèle.
  // Pas d'émissif forcé : sinon les arbres deviennent blancs/cramés.
  if ('emissiveIntensity' in cloned) cloned.emissiveIntensity = 0;
  if ('toneMapped' in cloned) cloned.toneMapped = true;

  cloned.needsUpdate = true;
  return cloned;
}

function normalizeModel(model, def) {
  const wrapper = new THREE.Group();
  wrapper.name = `normalized-${def.key}-tree`;

  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  model.position.set(-center.x, -box.min.y, -center.z);

  const maxDimension = Math.max(size.x, size.y, size.z) || 1;
  wrapper.scale.setScalar((def.baseScale * TREE_SIZE_MULTIPLIER) / maxDimension);
  wrapper.add(model);
  return wrapper;
}

function addTreesForTile(group, placedTile) {
  const tileWorld = axialToWorld(placedTile.q, placedTile.r);
  const vertices = createOuterVertices();

  for (const sector of SECTOR_DEFS) {
    const edge = placedTile.tile?.edges?.[sector.key];
    if (getEdgeType(edge) !== EDGE_TYPES.forest) continue;

    const count = Math.max(1, Math.floor(getEdgeValue(edge)));
    const avoidCenter = placedTile.tile?.center !== EDGE_TYPES.forest;
    const positions = getTreePositionsInSector(vertices[sector.a], vertices[sector.b], count, placedTile.key, sector.key, avoidCenter);

    for (let i = 0; i < positions.length; i++) {
      const tree = cloneTreeForSlot(placedTile.key, sector.key, i, positions.length);
      if (!tree) continue;

      const pos = positions[i];
      const seed = hashToUnit(`${placedTile.key}:${sector.key}:scale:${i}`);
      const scaleJitter = 0.80 + seed * 0.40;

      tree.position.set(tileWorld.x + pos.x, TREE_Y, tileWorld.z + pos.z);
      tree.rotation.y = hashToUnit(`${placedTile.key}:${sector.key}:rot:${i}`) * Math.PI * 2;
      tree.rotation.x = (hashToUnit(`${placedTile.key}:${sector.key}:tiltx:${i}`) - 0.5) * 0.18;
      tree.rotation.z = (hashToUnit(`${placedTile.key}:${sector.key}:tiltz:${i}`) - 0.5) * 0.18;
      tree.scale.multiplyScalar(scaleJitter);
      tree.userData.isForestTreeGlb = true;
      group.add(tree);
    }
  }
}

function cloneTreeForSlot(tileKey, edgeKey, index, countInSector) {
  const available = [...treeLibrary.values()];
  if (available.length === 0) return null;

  const modelIndex = pickMixedModelIndex(tileKey, edgeKey, index, countInSector, available.length);
  return available[modelIndex].clone(true);
}

function pickMixedModelIndex(tileKey, edgeKey, index, countInSector, availableCount) {
  if (availableCount <= 1) return 0;

  // On force le brassage par triangle : pas de lot de 5 bouleaux clonés comme une pépinière soviétique.
  const offset = Math.floor(hashToUnit(`${tileKey}:${edgeKey}:model-offset`) * availableCount) % availableCount;
  const step = availableCount === 2
    ? 1
    : 1 + (Math.floor(hashToUnit(`${tileKey}:${edgeKey}:model-step`) * (availableCount - 1)) % (availableCount - 1));

  let modelIndex = (offset + index * step) % availableCount;

  // Si le pas tombe sur un cycle idiot avec certains comptes de modèles, on casse l'alignement.
  if (index > 0 && countInSector > 1) {
    const previousIndex = (offset + (index - 1) * step) % availableCount;
    if (modelIndex === previousIndex) modelIndex = (modelIndex + 1) % availableCount;
  }

  return modelIndex;
}

function getTreePositionsInSector(a, b, count, tileKey, edgeKey, avoidCenter) {
  const positions = [];

  for (let i = 0; i < count; i++) {
    let picked = null;

    for (let attempt = 0; attempt < MAX_TREE_PLACEMENT_ATTEMPTS; attempt++) {
      const candidate = createRandomPointInSector(a, b, tileKey, edgeKey, i, attempt);
      if (avoidCenter && isInsideCenter(candidate)) continue;
      if (!isFarEnoughFromOtherTrees(candidate, positions)) continue;

      picked = candidate;
      break;
    }

    // Secours déterministe : mieux vaut un arbre un peu proche qu'un arbre absent.
    positions.push(picked ?? createFallbackPointInSector(a, b, tileKey, edgeKey, i, avoidCenter));
  }

  return positions;
}

function createRandomPointInSector(a, b, tileKey, edgeKey, index, attempt) {
  const t = 0.12 + hashToUnit(`${tileKey}:${edgeKey}:t:${index}:${attempt}`) * 0.76;
  const depth = 0.48 + hashToUnit(`${tileKey}:${edgeKey}:d:${index}:${attempt}`) * 0.42;
  const sideJitter = (hashToUnit(`${tileKey}:${edgeKey}:j:${index}:${attempt}`) - 0.5) * 0.08;

  const edgePoint = {
    x: a.x * (1 - t) + b.x * t,
    z: a.z * (1 - t) + b.z * t
  };

  const tangent = { x: b.x - a.x, z: b.z - a.z };
  const tangentLength = Math.hypot(tangent.x, tangent.z) || 1;

  return {
    x: edgePoint.x * depth + (tangent.x / tangentLength) * sideJitter,
    z: edgePoint.z * depth + (tangent.z / tangentLength) * sideJitter
  };
}

function createFallbackPointInSector(a, b, tileKey, edgeKey, index, avoidCenter) {
  const t = 0.18 + hashToUnit(`${tileKey}:${edgeKey}:fallback:t:${index}`) * 0.64;
  const depth = avoidCenter
    ? 0.08 + hashToUnit(`${tileKey}:${edgeKey}:fallback:d:${index}`) * 0.22
    : 0.16 + hashToUnit(`${tileKey}:${edgeKey}:fallback:d:${index}`) * 0.34;

  const edgePoint = {
    x: a.x * (1 - t) + b.x * t,
    z: a.z * (1 - t) + b.z * t
  };

  return {
    x: edgePoint.x * (1 - depth),
    z: edgePoint.z * (1 - depth)
  };
}

function isInsideCenter(position) {
  return Math.hypot(position.x, position.z) < CENTER_SAFE_RADIUS;
}

function isFarEnoughFromOtherTrees(candidate, positions) {
  return positions.every(position => Math.hypot(candidate.x - position.x, candidate.z - position.z) >= MIN_TREE_DISTANCE);
}

function createOuterVertices(radius = HEX_SIZE) {
  const vertices = [];

  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i;
    vertices.push({
      x: Math.cos(angle) * radius,
      z: Math.sin(angle) * radius
    });
  }

  return vertices;
}

function hashToUnit(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function disposeOverlayChildren(group) {
  group.clear();
}
