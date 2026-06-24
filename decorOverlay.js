/**
 * decorOverlay.js — Orchestrateur principal du rendu décor / props / effets eau.
 *
 * Responsabilités :
 *   - Cycle de vie : createDecorOverlay / rebuildDecorOverlay / updateDecorOverlay
 *   - Chargement asynchrone des modèles GLB (propGlbLibrary, ensurePropModels, ensureBirdModel)
 *   - Splashes eau (createWaterVoidSplashes)
 *   - LOD mises à jour (updateNaturalPropsLOD, updateFieldDecorLOD)
 *   - Toutes les constantes et l'état singleton partagés avec les sous-fichiers
 *
 * Exports publics (scène) :
 *   createDecorOverlay, rebuildDecorOverlay, updateDecorOverlay,
 *   updateNaturalPropsLOD, updateFieldDecorLOD
 *
 * Exports partagés (sous-fichiers) :
 *   propGlbLibrary, _propInstanceDummy, _snapNormal,
 *   getPropChunkKey, computePropBoundingSphere,
 *   createPropModel, createBirdFlock,
 *   FIELD_FLAG_MIN_TOTAL, FIELD_SURFACE_Y, SPECIAL_BUILDING_SAFE_RADIUS,
 *   SPECIAL_BUILDING_BOAT_SAFE_RADIUS, ROAD_DECOR_Y, BARREL_TARGET_WIDTH,
 *   SHORE_BOAT_Y, NATURAL_FLOWER_TARGET_WIDTH, NATURAL_MUSHROOM_TARGET_WIDTH,
 *   NATURAL_DECOR_VARIANTS
 *
 * Les imports circulaires (sous-fichiers ↔ decorOverlay) sont valides car tous
 * les accès croisés se font dans des corps de fonctions (live bindings ES modules).
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/utils/SkeletonUtils.js';
import {
  EDGE_ORDER,
  EDGE_TYPES,
  HEX_SIZE,
  TILE_VISUAL,
  SECTOR_DEFS,
  FIELD_BIRD_FLOCK_MODEL_URL,
  FIELD_BIRD_FLOCK_TARGET_WIDTH,
  FIELD_BIRD_FLOCK_ANIMATION_SPEED
} from './config.js';
import { hashUnit10k as hashUnit, hashNumber } from './stable/hashUtils.js';
import { axialToWorld, makeHexKey } from './stable/hex.js';
import { HEX_DIRECTIONS } from './stable/placementRules.js';
import {
  HEX_CHUNK_SIZE,
  LOD_MICRO_CULL_DISTANCE,
  LOD_ROCK_CULL_DISTANCE,
  LOD_ROAD_DECOR_CULL_DISTANCE,
  LOD_SIGN_CULL_DISTANCE,
  LOD_SHORE_BOAT_CULL_DISTANCE,
  LOD_VILLAGE_PROP_CULL_DISTANCE
} from './variables.js';
import { getTileEdgeType, clearGroup } from './stable/tileUtils.js';
import { getHexVertex, normalize2 } from './stable/hexGeometry.js';
// Sous-fichiers — imports circulaires valides (accès dans des corps de fonctions uniquement)
import { createFieldFlags, collectSpecialBuildingSafeZones } from './fieldZonesOverlay.js';
import { createNaturalGroundProps } from './naturalPropsOverlay.js';
import { createRoadsideVillageProps, createShoreBoats } from './villageDecorOverlay.js';

const SECTOR_BY_KEY     = Object.fromEntries(SECTOR_DEFS.map(s => [s.key, s]));
const DIRECTION_BY_EDGE = Object.fromEntries(HEX_DIRECTIONS.map(d => [d.edge, d]));

// ─── Constantes exportées (partagées avec sous-fichiers) ──────────────────────

const WATER_SURFACE_Y = (TILE_VISUAL.waterY ?? -0.075) + 0.012;
export const FIELD_SURFACE_Y                 = 0.070;
export const FIELD_FLAG_MIN_TOTAL            = 5;
const        FIELD_FLAG_TARGET_HEIGHT        = HEX_SIZE * 0.384; // +20%
const        FIELD_FLAG_2_TARGET_HEIGHT      = HEX_SIZE * 0.384; // +20%
const        FOUNTAIN_TARGET_WIDTH           = HEX_SIZE * 0.18;
const        HAY_BALE_TARGET_WIDTH           = HEX_SIZE * 0.14 * 2.2 * 1.3 * 1.15 * 1.15; // +15%
const        BENCH_TARGET_LENGTH             = HEX_SIZE * 0.16;
const        SIGNPOST_TARGET_HEIGHT          = HEX_SIZE * 0.28;
const        SHORE_BOAT_TARGET_LENGTH        = HEX_SIZE * 0.175;
export const SPECIAL_BUILDING_SAFE_RADIUS    = HEX_SIZE * 0.34;
export const SPECIAL_BUILDING_BOAT_SAFE_RADIUS = HEX_SIZE * 0.18;
export const NATURAL_FLOWER_TARGET_WIDTH     = HEX_SIZE * 0.047;
const        NATURAL_ROCK_TARGET_LENGTH      = HEX_SIZE * 0.106;
const        NATURAL_REED_TARGET_HEIGHT      = HEX_SIZE * 0.105;
export const NATURAL_MUSHROOM_TARGET_WIDTH   = HEX_SIZE * 0.043;
export const BARREL_TARGET_WIDTH             = HEX_SIZE * 0.1031;
const        CART_TARGET_LENGTH              = HEX_SIZE * 0.291;
export const ROAD_DECOR_Y                    = ((TILE_VISUAL.tileThickness ?? 0.12) * -0.30) + 0.010;
export const SHORE_BOAT_Y                    = WATER_SURFACE_Y + 0.012;

export const NATURAL_DECOR_VARIANTS = {
  flower:   ['flower-1', 'flower-2', 'flower-3', 'flower-4'],
  rock:     ['rock-1', 'rock-2', 'rock-3', 'rock-4'],
  reed:     ['reed'],
  mushroom: ['mushroom'],
  'hay-bale': ['hay-bale']
};

const PROP_MODEL_DEFS = [
  { key: 'field-flag',   url: './glb/moulin-1.glb',           target: FIELD_FLAG_TARGET_HEIGHT   * 1.70, mode: 'height' },
  { key: 'field-flag-2', url: './glb/moulin-2.glb',          target: FIELD_FLAG_2_TARGET_HEIGHT * 1.70, mode: 'height', correctionX: Math.PI / 2 },
  { key: 'hay-bale',     url: './glb/botte-foin.glb',          target: HAY_BALE_TARGET_WIDTH,                   mode: 'length', kind: 'hay-bale' },
  { key: 'fountain-1',   url: './glb/fontaine-1.glb',         target: FOUNTAIN_TARGET_WIDTH,                   mode: 'length' },
  { key: 'fountain-2',   url: './glb/fontaine-2.glb',         target: FOUNTAIN_TARGET_WIDTH,                   mode: 'length' },
  { key: 'road-bench',   url: './glb/banc.glb',               target: BENCH_TARGET_LENGTH,             mode: 'length' },
  { key: 'road-signpost',url: './glb/poteau-indicateur.glb',  target: SIGNPOST_TARGET_HEIGHT,          mode: 'height' },
  { key: 'shore-boat-1', url: './glb/barque-1.glb',           target: SHORE_BOAT_TARGET_LENGTH,        mode: 'length' },
  { key: 'shore-boat-2', url: './glb/barque-2.glb',           target: SHORE_BOAT_TARGET_LENGTH * 0.65, mode: 'length' },
  { key: 'flower-1',     url: './glb/flower-1.glb',           target: NATURAL_FLOWER_TARGET_WIDTH,     mode: 'length', kind: 'flower' },
  { key: 'flower-2',     url: './glb/flower-2.glb',           target: NATURAL_FLOWER_TARGET_WIDTH,     mode: 'length', kind: 'flower' },
  { key: 'flower-3',     url: './glb/flower-3.glb',           target: NATURAL_FLOWER_TARGET_WIDTH,     mode: 'length', kind: 'flower' },
  { key: 'flower-4',     url: './glb/flower-4.glb',           target: NATURAL_FLOWER_TARGET_WIDTH,     mode: 'length', kind: 'flower' },
  { key: 'rock-1',       url: './glb/rock-1.glb',             target: NATURAL_ROCK_TARGET_LENGTH,      mode: 'length', kind: 'rock' },
  { key: 'rock-2',       url: './glb/rock-2.glb',             target: NATURAL_ROCK_TARGET_LENGTH,      mode: 'length', kind: 'rock' },
  { key: 'rock-3',       url: './glb/rock-3.glb',             target: NATURAL_ROCK_TARGET_LENGTH,      mode: 'length', kind: 'rock' },
  { key: 'rock-4',       url: './glb/rock-4.glb',             target: NATURAL_ROCK_TARGET_LENGTH,      mode: 'length', kind: 'rock' },
  { key: 'reed',         url: './glb/roseau.glb',             target: NATURAL_REED_TARGET_HEIGHT,      mode: 'height', kind: 'reed' },
  { key: 'mushroom',     url: './glb/mushroom.glb',           target: NATURAL_MUSHROOM_TARGET_WIDTH,   mode: 'length', kind: 'mushroom' },
  { key: 'barrel-1',     url: './glb/tonneau-1.glb',          target: BARREL_TARGET_WIDTH,             mode: 'length' },
  { key: 'barrel-2',     url: './glb/tonneau-2.glb',          target: BARREL_TARGET_WIDTH,             mode: 'length' },
  { key: 'cart',         url: './glb/charrette.glb',          target: CART_TARGET_LENGTH,              mode: 'length' }
];

// ─── Matériaux eau (splash effets) ───────────────────────────────────────────

const WATER_DROP_MAT = new THREE.MeshBasicMaterial({
  color: 0xBFEFFF, transparent: true, opacity: 0.82, depthWrite: false
});
const WATER_STREAK_MAT = new THREE.MeshBasicMaterial({
  color: 0xD8F8FF, transparent: true, opacity: 0.62, depthWrite: false
});
const WATER_MIST_MAT = new THREE.MeshBasicMaterial({
  color: 0xF3FDFF, transparent: true, opacity: 0.38, depthWrite: false
});

// ─── État singleton partagé ───────────────────────────────────────────────────

// Map variantKey → prototype Group (normalisé + mis à l'échelle)
export const propGlbLibrary = new Map();
// Map variantKey → AnimationClip[] (null si GLB sans animation)
const propAnimationsLibrary = new Map();
let propModelsLoading   = false;
let propModelsRequested = false;

// Dummy réutilisé pour calculer les matrices d'instance sans allocation par prop
export const _propInstanceDummy = new THREE.Object3D();
// Réutilisable pour le snap pente dans collectNaturalPropInstances
export const _snapNormal = new THREE.Vector3();

// ─── Pré-alloués pour LOD (pas de GC chaque frame) ───────────────────────────

const _propLodFrustum = new THREE.Frustum();
const _propLodMatrix  = new THREE.Matrix4();
const _propLodPos     = new THREE.Vector3();

// ─── Helpers partagés ─────────────────────────────────────────────────────────

export function getPropChunkKey(q, r) {
  return `${Math.floor(q / HEX_CHUNK_SIZE)}:${Math.floor(r / HEX_CHUNK_SIZE)}`;
}

export function computePropBoundingSphere(matrices, heightPadding = 0.3) {
  const center = new THREE.Vector3();
  for (const m of matrices) {
    _propLodPos.setFromMatrixPosition(m);
    center.add(_propLodPos);
  }
  center.divideScalar(matrices.length);
  let radius = 0;
  for (const m of matrices) {
    _propLodPos.setFromMatrixPosition(m);
    radius = Math.max(radius, center.distanceTo(_propLodPos));
  }
  return new THREE.Sphere(center, radius + heightPadding);
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

export function createDecorOverlay() {
  const group = new THREE.Group();
  group.name  = 'field-water-edge-effects-overlay';
  ensurePropModels(group);
  ensureBirdModel(group);
  return group;
}

export function rebuildDecorOverlay(overlay, placedTiles) {
  overlay.userData.lastPlacedTiles = placedTiles;
  clearGroup(overlay);
  ensurePropModels(overlay);
  ensureBirdModel(overlay);

  const specialBuildingSafeZones = collectSpecialBuildingSafeZones(placedTiles);
  overlay.add(createWaterVoidSplashes(placedTiles));
  overlay.add(createFieldFlags(placedTiles));
  overlay.add(createNaturalGroundProps(placedTiles));
  overlay.add(createRoadsideVillageProps(placedTiles, specialBuildingSafeZones));
  overlay.add(createShoreBoats(placedTiles, specialBuildingSafeZones));

  // Construire la liste plate d'objets LOD pour bancs/panneaux/moulins/oiseaux.
  overlay.userData.roadsideDecorObjects = [];
  const _decorDistSq     = LOD_ROAD_DECOR_CULL_DISTANCE  * LOD_ROAD_DECOR_CULL_DISTANCE;
  const _signDistSq      = LOD_SIGN_CULL_DISTANCE         * LOD_SIGN_CULL_DISTANCE;
  const _shoreBoatDistSq = LOD_SHORE_BOAT_CULL_DISTANCE   * LOD_SHORE_BOAT_CULL_DISTANCE;
  const _villageDistSq   = LOD_VILLAGE_PROP_CULL_DISTANCE * LOD_VILLAGE_PROP_CULL_DISTANCE;

  for (const subGroup of overlay.children) {
    if (subGroup.name === 'field-zone-flags-and-crows') {
      for (const child of subGroup.children) {
        if (child.userData?.effectKind === 'field-flag-idle') {
          overlay.userData.roadsideDecorObjects.push({ object: child, center: child.position.clone(), lodDistSq: _decorDistSq });
        }
      }
    } else if (subGroup.name === 'village-roadside-glb-props') {
      for (const child of subGroup.children) {
        const n = child.name ?? '';
        if (n.includes('bench') || n.includes('signpost') || n.includes('barrel') || n.includes('cart') || n.includes('fountain')) {
          const distSq = n.includes('signpost') ? _signDistSq
                       : (n.includes('barrel') || n.includes('cart')) ? _villageDistSq
                       : _decorDistSq;
          overlay.userData.roadsideDecorObjects.push({ object: child, center: child.position.clone(), lodDistSq: distSq });
        }
      }
    } else if (subGroup.name === 'water-shore-static-boats-glb') {
      for (const child of subGroup.children) {
        if (child.name === 'water-shore-inert-boat-glb') {
          overlay.userData.roadsideDecorObjects.push({ object: child, center: child.position.clone(), lodDistSq: _shoreBoatDistSq });
        }
      }
    }
  }
}

export function updateDecorOverlay(overlay, elapsedSeconds) {
  overlay.traverse(object => {
    const data = object.userData;

    // Mise à jour AnimationMixer pour tout GLB animé (ex. moulin-2 avec pales).
    // Indépendant de effectKind : couvre tous les modèles clonés par createPropModel.
    if (data?.mixer) {
      const prev  = data.mixerLastTime ?? elapsedSeconds;
      const delta = Math.min(0.05, Math.max(0, elapsedSeconds - prev));
      data.mixerLastTime = elapsedSeconds;
      data.mixer.update(delta);
    }

    if (!data?.effectKind) return;

    if (data.effectKind === 'water-drop') {
      const t    = (elapsedSeconds * data.speed + data.phase) % 1;
      const fall = t * t;
      object.position.set(
        data.x + Math.sin(elapsedSeconds * 2.8 + data.phase * 9) * data.sway,
        data.y - fall * data.fall,
        data.z + Math.cos(elapsedSeconds * 2.1 + data.phase * 7) * data.sway
      );
      object.scale.setScalar(data.scale * (1 - t * 0.38));
      object.material.opacity = Math.max(0, 0.85 - t * 0.85);
      return;
    }

    if (data.effectKind === 'water-streak') {
      const t = (elapsedSeconds * data.speed + data.phase) % 1;
      object.position.set(
        data.x + Math.sin(elapsedSeconds * 2.4 + data.phase * 11) * data.sway,
        data.y - t * data.fall,
        data.z + Math.cos(elapsedSeconds * 1.9 + data.phase * 13) * data.sway
      );
      object.scale.set(data.radiusScale, data.lengthScale * (0.72 + t * 0.48), data.radiusScale);
      object.material.opacity = Math.max(0, 0.68 - t * 0.68);
      return;
    }

    if (data.effectKind === 'water-mist') {
      const t = (elapsedSeconds * data.speed + data.phase) % 1;
      object.position.set(data.x + data.nx * t * data.drift, data.y + Math.sin(t * Math.PI) * 0.018, data.z + data.nz * t * data.drift);
      object.scale.setScalar(data.scale * (0.55 + t * 1.35));
      object.material.opacity = Math.max(0, 0.34 - t * 0.34);
      return;
    }

    if (data.effectKind === 'bird-flock-orbit') {
      if (data.mixer) {
        const previousAnimationTime = data.lastAnimationTime ?? elapsedSeconds;
        const delta = Math.min(0.05, Math.max(0, elapsedSeconds - previousAnimationTime));
        data.lastAnimationTime = elapsedSeconds;
        data.mixer.update(delta * (data.animationSpeed ?? 1));
      }
      const dir      = data.direction ?? 1;
      const t        = elapsedSeconds * data.speed * dir + data.phase;
      const wobbleA  = Math.sin(elapsedSeconds * data.wobbleSpeedA + data.phase * 1.37);
      const wobbleB  = Math.cos(elapsedSeconds * data.wobbleSpeedB + data.phase * 2.11);
      const wobbleC  = Math.sin(elapsedSeconds * data.wobbleSpeedC + data.phase * 0.61);
      const localRx  = data.rx * (1 + wobbleA * data.rxJitter);
      const localRz  = data.rz * (1 + wobbleB * data.rzJitter);
      const x        = data.cx + Math.cos(t) * localRx + Math.sin(t * 2.17 + data.phase) * data.sideDrift;
      const z        = data.cz + Math.sin(t + wobbleC * 0.32) * localRz + Math.cos(t * 1.83 + data.phase * 0.7) * data.sideDrift;
      const y        = data.cy
        + Math.sin(elapsedSeconds * data.verticalSpeed + data.phase * 0.73) * data.verticalAmp
        + Math.sin(t * 1.37 + wobbleB) * data.bobAmp;
      object.position.set(x, y, z);
      const tangentX = -Math.sin(t) * localRx * dir;
      const tangentZ =  Math.cos(t + wobbleC * 0.32) * localRz * dir;
      // Dans birds.glb, les becs pointent vers -Z.
      object.rotation.y = Math.atan2(-tangentX, -tangentZ);
      object.rotation.z = Math.sin(t * data.bankSpeed + data.phase) * data.bankAmp * dir;
      object.rotation.x = Math.cos(t * 1.9 + data.phase * 1.4) * 0.08;
      return;
    }

    if (data.effectKind === 'scarecrow-idle') {
      object.rotation.z = Math.sin(elapsedSeconds * 1.2 + data.phase) * 0.025;
    }
  });
}

// ─── LOD ──────────────────────────────────────────────────────────────────────

export function updateNaturalPropsLOD(overlay, camera) {
  _propLodMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  _propLodFrustum.setFromProjectionMatrix(_propLodMatrix);

  overlay.traverse(obj => {
    if (!obj.isInstancedMesh || !obj.userData.worldBoundingSphere) return;
    const sphere   = obj.userData.worldBoundingSphere;
    const inFrustum = _propLodFrustum.intersectsSphere(sphere);
    const dist     = camera.position.distanceTo(sphere.center);
    const cat      = obj.userData.lodCategory;
    const withinDist = cat === 'micro' ? dist < LOD_MICRO_CULL_DISTANCE
                     : cat === 'rock'  ? dist < LOD_ROCK_CULL_DISTANCE
                     : true;
    obj.visible = inFrustum && withinDist;
  });
}

export function updateFieldDecorLOD(overlay, camera) {
  for (const item of (overlay.userData.roadsideDecorObjects ?? [])) {
    item.object.visible = camera.position.distanceToSquared(item.center) < item.lodDistSq;
  }
}

// ─── Splashes eau ─────────────────────────────────────────────────────────────

function createWaterVoidSplashes(placedTiles) {
  const group = new THREE.Group();
  group.name  = 'water-void-edge-splashes';

  for (const placedTile of placedTiles.values()) {
    for (const edge of EDGE_ORDER) {
      if (getTileEdgeType(placedTile, edge) !== EDGE_TYPES.water) continue;
      const direction   = DIRECTION_BY_EDGE[edge];
      const neighborKey = makeHexKey(placedTile.q + direction.q, placedTile.r + direction.r);
      if (placedTiles.has(neighborKey)) continue;
      group.add(createSplashForSector(placedTile, edge));
    }
  }

  return group;
}

function createSplashForSector(placedTile, edge) {
  const group   = new THREE.Group();
  group.name    = `water-void-splash-${placedTile.key}-${edge}`;
  const tilePos = axialToWorld(placedTile.q, placedTile.r);
  const sector  = SECTOR_BY_KEY[edge];
  const vA      = getHexVertex(sector.a);
  const vB      = getHexVertex(sector.b);
  const mid     = { x: (vA.x + vB.x) / 2, z: (vA.z + vB.z) / 2 };
  const normalLen = Math.hypot(mid.x, mid.z) || 1;
  const nx      = mid.x / normalLen;
  const nz      = mid.z / normalLen;
  const tangent = normalize2(vB.x - vA.x, vB.z - vA.z);
  const seed    = hashNumber(`${placedTile.key}:${edge}:splash`);

  for (let i = 0; i < 8; i += 1) {
    const lane   = (i - 3.5) / 8;
    const jitter = (hashUnit(`${seed}:drop:${i}`) - 0.5) * 0.10;
    const out    = 0.055 + hashUnit(`${seed}:out:${i}`) * 0.13;
    const x      = tilePos.x + mid.x + tangent.x * (lane * 0.68 + jitter) + nx * out;
    const z      = tilePos.z + mid.z + tangent.z * (lane * 0.68 + jitter) + nz * out;
    const drop   = new THREE.Mesh(new THREE.SphereGeometry(0.010 + hashUnit(`${seed}:size:${i}`) * 0.010, 7, 5), WATER_DROP_MAT.clone());
    drop.name    = 'water-drop-falling-into-empty-neighbor';
    drop.userData = {
      effectKind: 'water-drop',
      x,
      y:     WATER_SURFACE_Y + 0.025 + hashUnit(`${seed}:y:${i}`) * 0.075,
      z,
      fall:  0.24 + hashUnit(`${seed}:fall:${i}`) * 0.24,
      speed: 0.82 + hashUnit(`${seed}:speed:${i}`) * 0.78,
      phase: hashUnit(`${seed}:phase:${i}`),
      sway:  0.010 + hashUnit(`${seed}:sway:${i}`) * 0.018,
      scale: 1
    };
    group.add(drop);
  }

  for (let i = 0; i < 5; i += 1) {
    const lane   = (i - 2) / 5;
    const height = 0.11 + hashUnit(`${seed}:streakh:${i}`) * 0.10;
    const streak = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0018, height, 5), WATER_STREAK_MAT.clone());
    streak.name  = 'water-falling-streak-beyond-edge';
    streak.userData = {
      effectKind: 'water-streak',
      x:           tilePos.x + mid.x + tangent.x * (lane * 0.62) + nx * (0.12 + hashUnit(`${seed}:streakout:${i}`) * 0.08),
      y:           WATER_SURFACE_Y - 0.02 + hashUnit(`${seed}:streaky:${i}`) * 0.045,
      z:           tilePos.z + mid.z + tangent.z * (lane * 0.62) + nz * (0.12 + hashUnit(`${seed}:streakoutz:${i}`) * 0.08),
      fall:        0.22 + hashUnit(`${seed}:streakfall:${i}`) * 0.18,
      speed:       0.70 + hashUnit(`${seed}:streakspeed:${i}`) * 0.55,
      phase:       hashUnit(`${seed}:streakphase:${i}`),
      sway:        0.006 + hashUnit(`${seed}:streaksway:${i}`) * 0.012,
      radiusScale: 0.85 + hashUnit(`${seed}:streakrx:${i}`) * 0.35,
      lengthScale: 0.85 + hashUnit(`${seed}:streakly:${i}`) * 0.45
    };
    group.add(streak);
  }

  for (let i = 0; i < 5; i += 1) {
    const lane = (i - 2) / 5;
    const mist = new THREE.Mesh(new THREE.SphereGeometry(0.010 + hashUnit(`${seed}:mist-size:${i}`) * 0.010, 6, 4), WATER_MIST_MAT.clone());
    mist.name  = 'water-edge-fine-mist';
    mist.userData = {
      effectKind: 'water-mist',
      x:     tilePos.x + mid.x + tangent.x * lane * 0.62 + nx * 0.06,
      y:     WATER_SURFACE_Y + 0.010 + hashUnit(`${seed}:mist-y:${i}`) * 0.025,
      z:     tilePos.z + mid.z + tangent.z * lane * 0.62 + nz * 0.06,
      nx:    nx + (hashUnit(`${seed}:mistnx:${i}`) - 0.5) * 0.35,
      nz:    nz + (hashUnit(`${seed}:mistnz:${i}`) - 0.5) * 0.35,
      drift: 0.035 + hashUnit(`${seed}:mistdrift:${i}`) * 0.045,
      speed: 1.0   + hashUnit(`${seed}:mistspeed:${i}`) * 0.70,
      phase: hashUnit(`${seed}:mistphase:${i}`),
      scale: 0.75  + hashUnit(`${seed}:mistscale:${i}`) * 0.55
    };
    group.add(mist);
  }

  return group;
}

// ─── Gestion des modèles GLB ──────────────────────────────────────────────────

// Un seul rebuild au retour asynchrone : attend que props ET oiseaux soient tous chargés.
function maybeRebuildWhenReady(overlay) {
  if (propModelsLoading)       return; // props encore en cours
  if (birdGlbLibrary.loading)  return; // oiseau encore en cours
  const lastPlacedTiles = overlay.userData.lastPlacedTiles;
  if (lastPlacedTiles) rebuildDecorOverlay(overlay, lastPlacedTiles);
}

function ensurePropModels(overlay) {
  if (propModelsLoading || propModelsRequested) return;
  propModelsLoading   = true;
  propModelsRequested = true;

  let pending = PROP_MODEL_DEFS.length;
  const finishOne = () => {
    pending -= 1;
    if (pending > 0) return;
    propModelsLoading = false;
    maybeRebuildWhenReady(overlay);
  };

  for (const def of PROP_MODEL_DEFS) {
    new GLTFLoader().load(
      def.url,
      gltf => {
        propGlbLibrary.set(def.key, preparePropPrototype(gltf.scene, def));
        propAnimationsLibrary.set(def.key, gltf.animations ?? []);
        finishOne();
      },
      undefined,
      error => { console.warn(`Modèle décor GLB indisponible : ${def.url}`, error); finishOne(); }
    );
  }
}

function preparePropPrototype(model, def) {
  const wrapper = new THREE.Group();
  wrapper.name  = `normalized-${def.key}`;

  // cloneSkeleton (SkeletonUtils) au lieu de model.clone(true) :
  // model.clone(true) casse les références skeleton sur les SkinnedMesh animés,
  // ce qui laisse les parties mobiles en pose dégénérée ou invisibles.
  const source = cloneSkeleton(model);

  // Normalisation complète pour GLBs animés.
  // Causes possibles d'invisibilité en pose statique :
  //   1. visible=false (état initial avant AnimationMixer)
  //   2. scale=(0,0,0) (rig démarre à zéro, animé vers 1,1,1)
  //   3. SkinnedMesh hors bind pose → géométrie dégénérée
  //   4. material.visible=false exporté depuis certains DCC
  source.traverse(o => {
    o.visible = true;
    if (o.scale.x === 0 && o.scale.y === 0 && o.scale.z === 0) o.scale.set(1, 1, 1);
    if (o.isSkinnedMesh && o.skeleton) o.skeleton.pose();
    if (o.isMesh && o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) { if (m) m.visible = true; }
    }
  });
  // Correction d'orientation pour les GLBs exportés avec un axe différent (ex. Z-up → Y-up manqué).
  // S'applique avant Box3 pour que la bounding box soit mesurée dans la bonne orientation.
  if (def.correctionX) source.rotation.x += def.correctionX;
  source.updateMatrixWorld(true);

  const box    = new THREE.Box3().setFromObject(source);
  const size   = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  source.position.set(-center.x, -box.min.y, -center.z);
  const dimension = def.mode === 'height' ? (size.y || 1) : (Math.max(size.x, size.z) || 1);
  wrapper.scale.setScalar(def.target / dimension);
  wrapper.add(source);

  wrapper.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow    = true;
    object.receiveShadow = true;
    if (object.material) object.material = clonePropMaterial(object.material);
  });

  return wrapper;
}

export function createPropModel(key, seedKey = key) {
  const prototype = propGlbLibrary.get(key);
  if (!prototype) return null;
  // cloneSkeleton pour conserver les références skeleton intactes sur les animés.
  const object = cloneSkeleton(prototype);
  object.traverse(child => {
    child.visible = true;
    if (!child.isMesh) return;
    child.castShadow    = true;
    child.receiveShadow = true;
  });
  object.rotation.y += (hashUnit(`${seedKey}:base-yaw`) - 0.5) * 0.16;

  // AnimationMixer pour les GLBs avec animations intégrées (ex. moulin-2 avec pales animées).
  const clips = propAnimationsLibrary.get(key);
  if (clips && clips.length > 0) {
    const mixer = new THREE.AnimationMixer(object);
    for (const clip of clips) mixer.clipAction(clip).play();
    object.userData.mixer        = mixer;
    object.userData.mixerLastTime = null; // initialisé au premier update
  }

  return object;
}

function clonePropMaterial(material) {
  if (Array.isArray(material)) return material.map(item => clonePropMaterial(item));
  const cloned = material.clone();
  cloned.side = THREE.DoubleSide;
  if ('emissiveIntensity' in cloned) cloned.emissiveIntensity = 0;
  if ('toneMapped' in cloned) cloned.toneMapped = true;
  cloned.needsUpdate = true;
  return cloned;
}

// ─── Modèle oiseaux ───────────────────────────────────────────────────────────

const birdGlbLibrary = {
  prototype:  null,
  animations: [],
  loading:    false,
  requested:  false
};

function ensureBirdModel(overlay) {
  if (birdGlbLibrary.loading || birdGlbLibrary.requested) return;
  birdGlbLibrary.loading   = true;
  birdGlbLibrary.requested = true;

  new GLTFLoader().load(
    FIELD_BIRD_FLOCK_MODEL_URL,
    gltf => {
      birdGlbLibrary.prototype   = prepareBirdPrototype(gltf.scene);
      birdGlbLibrary.animations  = gltf.animations ?? [];
      birdGlbLibrary.loading     = false;
      maybeRebuildWhenReady(overlay);
    },
    undefined,
    error => {
      birdGlbLibrary.loading = false;
      console.warn(`Modèle oiseaux GLB indisponible : ${FIELD_BIRD_FLOCK_MODEL_URL}`, error);
      maybeRebuildWhenReady(overlay);
    }
  );
}

function prepareBirdPrototype(model) {
  const wrapper = new THREE.Group();
  wrapper.name  = 'normalized-field-bird-flock-glb';

  const source = cloneSkeleton(model);
  const box    = new THREE.Box3().setFromObject(source);
  const size   = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  source.position.set(-center.x, -center.y, -center.z);
  const dimension = Math.max(size.x, size.z) || 1;
  wrapper.scale.setScalar(FIELD_BIRD_FLOCK_TARGET_WIDTH / dimension);
  wrapper.add(source);

  wrapper.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow    = false;
    object.receiveShadow = false;
    if (object.material) object.material = clonePropMaterial(object.material);
  });

  return wrapper;
}

export function createBirdFlock(seedKey) {
  if (!birdGlbLibrary.prototype) return null;

  const object  = cloneSkeleton(birdGlbLibrary.prototype);
  object.name   = 'field-birds-glb-animated-flock';
  object.rotation.y += (hashUnit(`${seedKey}:base-yaw`) - 0.5) * 0.35;
  object.scale.multiplyScalar(0.92 + hashUnit(`${seedKey}:scale`) * 0.22);

  const mixer = birdGlbLibrary.animations.length > 0 ? new THREE.AnimationMixer(object) : null;
  if (mixer) {
    for (const clip of birdGlbLibrary.animations) {
      mixer.clipAction(clip).play();
    }
  }

  object.userData = {
    mixer,
    animationSpeed:    FIELD_BIRD_FLOCK_ANIMATION_SPEED * (0.88 + hashUnit(`${seedKey}:anim`) * 0.24),
    lastAnimationTime: null
  };

  return object;
}
