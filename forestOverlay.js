import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';
import { EDGE_TYPES, HEX_SIZE, TILE_VISUAL, SECTOR_DEFS } from './config.js';
import { hashUnitFull as hashToUnit, hashNumber } from './stable/hashUtils.js';
import { createOuterVertices } from './stable/hexGeometry.js';
import { axialToWorld } from './stable/hex.js';
import { applyGlobalWindToObject } from './stable/globalWind.js';
import { getEdgeType, getEdgeValue } from './tileGenerator.js';
import { placeObjectOnTerrain } from './terrainHeight.js';
import { collectSpecialBuildingSafeZones } from './fieldWaterEffectsOverlay.js';
import {
  TREE_MODEL_DEFS,
  TREE_SIZE_MULTIPLIER,
  TREE_GROUND_OFFSET,
  TREE_CENTER_SAFE_RADIUS_EXTRA,
  MIN_TREE_DISTANCE,
  MAX_TREE_PLACEMENT_ATTEMPTS
} from './variables.js';

const CENTER_SAFE_RADIUS = HEX_SIZE * (TILE_VISUAL.centerRadiusScale + TREE_CENTER_SAFE_RADIUS_EXTRA);
const SPECIAL_BUILDING_TREE_SAFE_RADIUS = HEX_SIZE * 0.38;
const treeLibrary = new Map();
let modelsLoading = false;
let modelsRequested = false;

// Dummy réutilisé pour calculer les matrices d'instance sans allocation par arbre
const _instanceDummy = new THREE.Object3D();

export function createForestOverlay() {
  const group = new THREE.Group();
  group.name = 'forest-tree-glb-overlay';
  ensureTreeModels(group);
  return group;
}

export function rebuildForestOverlay(group, placedTiles) {
  group.userData.lastPlacedTiles = placedTiles;
  disposeOverlayChildren(group);

  if (treeLibrary.size === 0) {
    ensureTreeModels(group);
    return;
  }

  const specialBuildingSafeZones = collectSpecialBuildingSafeZones(placedTiles);

  // Phase 1 : collecter toutes les matrices d'instances par variant
  const accumulator = new Map(); // variantKey → Matrix4[]
  for (const placedTile of placedTiles.values()) {
    collectTreeInstances(accumulator, placedTile, specialBuildingSafeZones);
  }

  // Phase 2 : construire les InstancedMesh
  buildTreeInstancedMeshes(group, accumulator);
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
    if (lastPlacedTiles) rebuildForestOverlay(group, lastPlacedTiles);
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

  applyGlobalWindToObject(prototype, {
    strength: 0.052,
    speed: 1.38,
    frequency: 0.78,
    turbulence: 0.30,
    heightStart: 0.030,
    heightEnd: 0.680,
    gustStrength: 0.26,
    detailStrength: 0.08
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

// Phase 1 : accumule les matrices d'instance par variant (ordonné par TREE_MODEL_DEFS pour stabilité)
function collectTreeInstances(accumulator, placedTile, specialBuildingSafeZones = []) {
  const tileWorld = axialToWorld(placedTile.q, placedTile.r);
  const vertices = createOuterVertices();

  const availableKeys = TREE_MODEL_DEFS
    .map(def => def.key)
    .filter(key => treeLibrary.has(key));
  if (availableKeys.length === 0) return;

  for (const sector of SECTOR_DEFS) {
    const edge = placedTile.tile?.edges?.[sector.key];
    if (getEdgeType(edge) !== EDGE_TYPES.forest) continue;

    const count = Math.max(1, Math.floor(getEdgeValue(edge)));
    const avoidCenter = placedTile.tile?.center !== EDGE_TYPES.forest;
    const positions = getTreePositionsInSector(vertices[sector.a], vertices[sector.b], count, placedTile.key, sector.key, avoidCenter);

    for (let i = 0; i < positions.length; i++) {
      const pos = positions[i];
      if (isTreeInsideSpecialBuildingSafeZone(tileWorld.x + pos.x, tileWorld.z + pos.z, specialBuildingSafeZones)) continue;

      const modelIndex = pickMixedModelIndex(placedTile.key, sector.key, i, positions.length, availableKeys.length);
      const variantKey = availableKeys[modelIndex];

      const scaleJitter = 0.80 + hashToUnit(`${placedTile.key}:${sector.key}:scale:${i}`) * 0.40;
      const treeYaw = hashToUnit(`${placedTile.key}:${sector.key}:rot:${i}`) * Math.PI * 2;

      _instanceDummy.position.set(tileWorld.x + pos.x, 0, tileWorld.z + pos.z);
      placeObjectOnTerrain(_instanceDummy, pos, EDGE_TYPES.forest, hashNumber(`${placedTile.key}:${sector.key}:tree:${i}`) % 97, {
        groundOffset: TREE_GROUND_OFFSET,
        alignToSlope: false,
        yaw: treeYaw,
        edgeLockStart: 0.98,
        edgeLockEnd: 1.0
      });
      _instanceDummy.rotation.x = (hashToUnit(`${placedTile.key}:${sector.key}:tiltx:${i}`) - 0.5) * 0.18;
      _instanceDummy.rotation.z = (hashToUnit(`${placedTile.key}:${sector.key}:tiltz:${i}`) - 0.5) * 0.18;
      // La scale de base est cuite dans la géo (child.matrixWorld du prototype), on applique seulement le jitter ici.
      _instanceDummy.scale.setScalar(scaleJitter);
      _instanceDummy.updateMatrix();

      if (!accumulator.has(variantKey)) accumulator.set(variantKey, []);
      accumulator.get(variantKey).push(_instanceDummy.matrix.clone());
    }
  }
}

// Phase 2 : crée un InstancedMesh par sous-mesh de chaque variant
function buildTreeInstancedMeshes(group, accumulator) {
  for (const [variantKey, matrices] of accumulator) {
    const prototype = treeLibrary.get(variantKey);
    if (!prototype || matrices.length === 0) continue;

    // Calcule les matrices monde de chaque sous-mesh du prototype (prototype non attaché à la scène)
    prototype.updateMatrixWorld(true);

    prototype.traverse(child => {
      if (!child.isMesh) return;
      child.updateWorldMatrix(true, false);

      // Cuit la transformation locale (position/scale du wrapper normalizeModel) dans la géo
      const geo = child.geometry.clone();
      geo.applyMatrix4(child.matrixWorld);

      const mat = Array.isArray(child.material)
        ? child.material.map(m => m.clone())
        : child.material.clone();

      const mesh = new THREE.InstancedMesh(geo, mat, matrices.length);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false; // bounding sphere calculée sur géo cuite à l'origine, pas sur les instances
      mesh.name = `instanced-tree-${variantKey}`;

      for (let i = 0; i < matrices.length; i++) {
        mesh.setMatrixAt(i, matrices[i]);
      }
      mesh.instanceMatrix.needsUpdate = true;
      group.add(mesh);
    });
  }
}

function isTreeInsideSpecialBuildingSafeZone(x, z, safeZones) {
  for (const zone of safeZones) {
    const radius = zone.radius ?? SPECIAL_BUILDING_TREE_SAFE_RADIUS;
    if (Math.hypot(x - zone.x, z - zone.z) < radius) return true;
  }
  return false;
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

function disposeOverlayChildren(group) {
  group.traverse(child => {
    if (child === group) return;
    if (child.geometry) child.geometry.dispose();
    if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
    else if (child.material) child.material.dispose();
  });
  group.clear();
}
