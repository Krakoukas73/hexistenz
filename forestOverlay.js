import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';
import { EDGE_TYPES, HEX_SIZE, TILE_VISUAL, SECTOR_DEFS } from './config.js';
import { hashUnitFull as hashToUnit, hashNumber } from './stable/hashUtils.js';
import { createOuterVertices } from './stable/hexGeometry.js';
import { axialToWorld } from './stable/hex.js';
import { applyGlobalWindToObject } from './stable/globalWind.js';
import { getEdgeType, getEdgeValue } from './tileGenerator.js';
import { placeObjectOnTerrain } from './terrainHeight.js';
import { collectSpecialBuildingSafeZones } from './fieldZonesOverlay.js';
import {
  TREE_MODEL_DEFS,
  TREE_SIZE_MULTIPLIER,
  TREE_GROUND_OFFSET,
  TREE_CENTER_SAFE_RADIUS_EXTRA,
  MIN_TREE_DISTANCE,
  MAX_TREE_PLACEMENT_ATTEMPTS,
  TREE_WIND,
  HEX_CHUNK_SIZE,
  LOD_TREE_CULL_DISTANCE,
  HITBOX_R
} from './variables.js';
import { registerPropHitbox } from './stable/propHitboxRegistry.js';

const CENTER_SAFE_RADIUS = HEX_SIZE * (TILE_VISUAL.centerRadiusScale + TREE_CENTER_SAFE_RADIUS_EXTRA);
const SPECIAL_BUILDING_TREE_SAFE_RADIUS = HEX_SIZE * 0.38;
const treeLibrary = new Map();
let modelsLoading = false;
let modelsRequested = false;

// Dummy réutilisé pour calculer les matrices d'instance sans allocation par arbre
const _instanceDummy = new THREE.Object3D();

// Pré-alloués pour updateForestLOD() — évite GC chaque frame
const _lodFrustum = new THREE.Frustum();
const _lodProjMatrix = new THREE.Matrix4();
const _lodPos = new THREE.Vector3();

// Retourne la clé de chunk pour des coordonnées axiales (q, r)
function getChunkKey(q, r) {
  return `${Math.floor(q / HEX_CHUNK_SIZE)}:${Math.floor(r / HEX_CHUNK_SIZE)}`;
}

// Calcule une bounding sphere réelle en world-space à partir des matrices d'instances.
// heightPadding couvre la hauteur de l'objet (pivot à la base).
function computeInstancesBoundingSphere(matrices, heightPadding = 1.0) {
  const center = new THREE.Vector3();
  for (const m of matrices) {
    _lodPos.setFromMatrixPosition(m);
    center.add(_lodPos);
  }
  center.divideScalar(matrices.length);
  let radius = 0;
  for (const m of matrices) {
    _lodPos.setFromMatrixPosition(m);
    radius = Math.max(radius, center.distanceTo(_lodPos));
  }
  return new THREE.Sphere(center, radius + heightPadding);
}

export function createForestOverlay() {
  const group = new THREE.Group();
  group.name = 'forest-tree-glb-overlay';
  ensureTreeModels(group);
  return group;
}

export function rebuildForestOverlay(group, placedTiles) {
  group.userData.lastPlacedTiles = placedTiles;
  const _rfT0 = performance.now();
  disposeOverlayChildren(group);
  const _rfT1 = performance.now();

  if (treeLibrary.size === 0) {
    ensureTreeModels(group);
    return;
  }

  const specialBuildingSafeZones = collectSpecialBuildingSafeZones(placedTiles);
  const _rfT2 = performance.now();

  // Phase 1 : collecter toutes les matrices d'instances par variant + chunk
  const accumulator = new Map(); // variantKey → Map<chunkKey, Matrix4[]>
  for (const placedTile of placedTiles.values()) {
    collectTreeInstances(accumulator, placedTile, specialBuildingSafeZones);
  }
  const _rfT3 = performance.now();

  // Phase 2 : construire les InstancedMesh
  buildTreeInstancedMeshes(group, accumulator);
  const _rfT4 = performance.now();
  console.log(`[FREEZE-DIAG forest-phases] dispose=${(_rfT1-_rfT0).toFixed(0)}ms | safeZones=${(_rfT2-_rfT1).toFixed(0)}ms | collect=${(_rfT3-_rfT2).toFixed(0)}ms | build=${(_rfT4-_rfT3).toFixed(0)}ms | TOTAL=${(_rfT4-_rfT0).toFixed(0)}ms`);
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
    // Flag RAF (comme maybeRebuildWhenReady dans decorOverlay) → LOD immédiat, pas de flash
    if (lastPlacedTiles) group.userData.pendingModelRebuild = true;
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

  applyGlobalWindToObject(prototype, TREE_WIND);

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
  // Strategy C : teinture ambrée chaude (lerp 8%) pour unifier les GLBs hétérogènes
  if (cloned.color) cloned.color.lerp(new THREE.Color(0xC8A060), 0.08);

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

  // Pool pondéré : les arbres rares (spawnWeight bas) apparaissent moins souvent.
  // Les arbres sans spawnWeight ont un poids par défaut de 10.
  const weightedKeys = [];
  for (const def of TREE_MODEL_DEFS) {
    if (!treeLibrary.has(def.key)) continue;
    const w = def.spawnWeight ?? 10;
    for (let j = 0; j < w; j++) weightedKeys.push(def.key);
  }
  if (weightedKeys.length === 0) return;

  for (const sector of SECTOR_DEFS) {
    const edge = placedTile.tile?.edges?.[sector.key];
    if (getEdgeType(edge) !== EDGE_TYPES.forest) continue;

    const count = Math.max(1, Math.floor(getEdgeValue(edge)));
    const avoidCenter = placedTile.tile?.center !== EDGE_TYPES.forest;
    const positions = getTreePositionsInSector(vertices[sector.a], vertices[sector.b], count, placedTile.key, sector.key, avoidCenter);

    for (let i = 0; i < positions.length; i++) {
      const pos = positions[i];
      if (isTreeInsideSpecialBuildingSafeZone(tileWorld.x + pos.x, tileWorld.z + pos.z, specialBuildingSafeZones)) continue;

      const modelIndex = pickMixedModelIndex(placedTile.key, sector.key, i, positions.length, weightedKeys.length);
      const variantKey = weightedKeys[modelIndex];

      // Sinkdepth par variant : certains arbres s'enfoncent légèrement dans le sol.
      const treeDef = TREE_MODEL_DEFS.find(d => d.key === variantKey);
      const treeGroundOffset = TREE_GROUND_OFFSET - (treeDef?.sinkDepth ?? 0);

      const scaleJitter = 0.80 + hashToUnit(`${placedTile.key}:${sector.key}:scale:${i}`) * 0.40;
      const treeYaw = hashToUnit(`${placedTile.key}:${sector.key}:rot:${i}`) * Math.PI * 2;

      _instanceDummy.position.set(tileWorld.x + pos.x, 0, tileWorld.z + pos.z);
      placeObjectOnTerrain(_instanceDummy, pos, EDGE_TYPES.forest, hashNumber(`${placedTile.key}:${sector.key}:tree:${i}`) % 97, {
        groundOffset: treeGroundOffset,
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
      registerPropHitbox(_instanceDummy.position.x, _instanceDummy.position.z, HITBOX_R.treeTrunk);

      if (!accumulator.has(variantKey)) accumulator.set(variantKey, new Map());
      const byChunk = accumulator.get(variantKey);
      const chunkKey = getChunkKey(placedTile.q, placedTile.r);
      if (!byChunk.has(chunkKey)) byChunk.set(chunkKey, []);
      byChunk.get(chunkKey).push(_instanceDummy.matrix.clone());
    }
  }
}

// Phase 2 : crée un InstancedMesh par (chunk × sous-mesh) de chaque variant.
// Chaque mesh reçoit une bounding sphere réelle pour le frustum culling manuel (updateForestLOD).
function buildTreeInstancedMeshes(group, accumulator) {
  const _t2a = performance.now();
  let _subCount = 0, _imCount = 0;

  for (const [variantKey, byChunk] of accumulator) {
    const prototype = treeLibrary.get(variantKey);
    if (!prototype) continue;

    // ── Pré-cuire les géométries UNE SEULE FOIS par variant (hors boucle chunks) ──
    // Avant : geo.clone() + applyMatrix4() répétés N fois (une fois par chunk).
    // Après : calculé 1×, puis cloné (copie rapide sans applyMatrix4) par chunk.
    prototype.updateMatrixWorld(true);
    const _bakedSubMeshes = [];
    prototype.traverse(child => {
      if (!child.isMesh) return;
      child.updateWorldMatrix(true, false);
      const bakedGeo = child.geometry.clone();
      bakedGeo.applyMatrix4(child.matrixWorld); // 1 seul applyMatrix4 par sous-mesh
      _bakedSubMeshes.push({ bakedGeo, child });
      _subCount++;
    });

    for (const [chunkKey, matrices] of byChunk) {
      if (matrices.length === 0) continue;
      const sphere = computeInstancesBoundingSphere(matrices, 0.6);

      for (const { bakedGeo, child } of _bakedSubMeshes) {
        // Clone la géo pré-cuite (sans applyMatrix4) — rapide
        const geo = bakedGeo.clone();

        const mat = Array.isArray(child.material)
          ? child.material.map(m => m.clone())
          : child.material.clone();

        const mesh = new THREE.InstancedMesh(geo, mat, matrices.length);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        // frustumCulled = false : la géo cuite est à l'origine. Le culling est géré manuellement
        // via mesh.visible dans updateForestLOD() en utilisant worldBoundingSphere.
        mesh.frustumCulled = false;
        mesh.name = `instanced-tree-${variantKey}-${chunkKey}`;
        mesh.userData.worldBoundingSphere = sphere;
        mesh.userData.lodCategory = 'tree';

        for (let i = 0; i < matrices.length; i++) {
          mesh.setMatrixAt(i, matrices[i]);
        }
        mesh.instanceMatrix.needsUpdate = true;
        group.add(mesh);
        _imCount++;
      }
    }

    // Dispose les géos pré-cuites (chaque chunk a sa propre copie, celles-ci sont des templates)
    for (const { bakedGeo } of _bakedSubMeshes) bakedGeo.dispose();
  }

  console.log(`[FREEZE-DIAG forest-build] ${_imCount} IMs | ${_subCount} sous-mesh pré-cuits | ${(performance.now()-_t2a).toFixed(0)}ms`);
}

// Met à jour la visibilité de chaque InstancedMesh d'arbres selon le frustum caméra.
// À appeler depuis scene.js dans la boucle animate (tous les 3 frames suffisent).
export function updateForestLOD(group, camera, lodFactor = 1.0) {
  _lodProjMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  _lodFrustum.setFromProjectionMatrix(_lodProjMatrix);
  const effectiveDist = LOD_TREE_CULL_DISTANCE * lodFactor;

  group.traverse(obj => {
    if (!obj.isInstancedMesh || !obj.userData.worldBoundingSphere) return;
    const sphere = obj.userData.worldBoundingSphere;
    const inFrustum = _lodFrustum.intersectsSphere(sphere);
    const dist = camera.position.distanceTo(sphere.center);
    obj.visible = inFrustum && dist < effectiveDist;
  });
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
