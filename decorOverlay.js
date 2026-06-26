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
  LOD_PLANT_CULL_DISTANCE,
  LOD_ROCK_CULL_DISTANCE,
  LOD_ROAD_DECOR_CULL_DISTANCE,
  LOD_SIGN_CULL_DISTANCE,
  LOD_SHORE_BOAT_CULL_DISTANCE,
  LOD_VILLAGE_PROP_CULL_DISTANCE,
  LOD_ANIMAL_CULL_DISTANCE,
  LOD_FOUNTAIN_CULL_DISTANCE,
  LOD_CROW_CULL_DISTANCE,
  LOD_MILL_CULL_DISTANCE
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
const        FIELD_FLAG_TARGET_HEIGHT        = HEX_SIZE * 0.384 * 1.06 * 0.90 * 0.85; // moulin-1: +20% +6% −10% −15%
const        FIELD_FLAG_2_TARGET_HEIGHT      = HEX_SIZE * 0.384 * 1.06 * 1.05 * 1.11; // moulin-2: +20% +6% +5% +11%
const        FOUNTAIN_TARGET_WIDTH           = HEX_SIZE * 0.18 * 0.93; // −7%
const        HAY_BALE_TARGET_WIDTH           = HEX_SIZE * 0.14 * 2.2 * 1.3 * 1.15 * 1.15 * 1.06 * 0.92; // +15% +6% −8%
const        BENCH_TARGET_LENGTH             = HEX_SIZE * 0.16 * 0.85 * 0.93; // −15% −7%
const        SIGNPOST_TARGET_HEIGHT          = HEX_SIZE * 0.28 * 0.85 * 0.93 * 0.75; // −15% −7% −25%
const        SHORE_BOAT_TARGET_LENGTH        = HEX_SIZE * 0.175 * 0.88; // −12%
export const SPECIAL_BUILDING_SAFE_RADIUS    = HEX_SIZE * 0.34;
export const SPECIAL_BUILDING_BOAT_SAFE_RADIUS = HEX_SIZE * 0.18;
export const NATURAL_FLOWER_TARGET_WIDTH     = HEX_SIZE * 0.047 * 0.85 * 0.93 * 0.85 * 0.85 * 0.90 * 0.88; // −15% −7% −15% −15% −10% −12%
export const NATURAL_GRASS_TARGET_WIDTH      = HEX_SIZE * 0.058 * 1.15 * 0.91; // herbes/touffes/jeunes pousses (plantes.glb) — +15% −9%
export const NATURAL_SHRUB_TARGET_WIDTH      = HEX_SIZE * 0.095 * 0.91; // fougères et buissons — forêts uniquement (plantes.glb) — −9%
const        NATURAL_ROCK_TARGET_LENGTH      = HEX_SIZE * 0.106 * 0.85 * 0.93 * 0.88 * 0.85; // −15% −7% −12% −15%
const        NATURAL_REED_TARGET_HEIGHT      = HEX_SIZE * 0.105 * 0.85 * 0.93 * 0.88 * 0.85; // −15% −7% −12% −15%
export const NATURAL_MUSHROOM_TARGET_WIDTH   = HEX_SIZE * 0.043 * 0.85 * 0.93 * 0.88 * 0.88 * 0.95; // −15% −7% −12% −12% −5%
export const BARREL_TARGET_WIDTH             = HEX_SIZE * 0.1031 * 0.85 * 0.88 * 0.93; // −15% −12% −7%
const        CART_TARGET_LENGTH              = HEX_SIZE * 0.291 * 0.85 * 0.85; // −15% −15%
export const NATURAL_DEER_TARGET_WIDTH       = HEX_SIZE * 0.16 * 0.88;  // cerf sauvage (forêt / prairie / champ) — −12%
const        ANIMAL_CHICKEN_TARGET_WIDTH     = HEX_SIZE * 0.055 * 0.50 * 1.12 * 1.10; // poule de village — ×0.50 +12% +10%
const        ANIMAL_DOG_TARGET_WIDTH         = HEX_SIZE * 0.085; // chien de village
const        ANIMAL_CAT_TARGET_WIDTH         = HEX_SIZE * 0.060 * 1.08 * 1.07; // chat de village +8% +7%
const        ANIMAL_HORSE_TARGET_WIDTH       = HEX_SIZE * 0.20;  // cheval de village
export const ROAD_DECOR_Y                    = ((TILE_VISUAL.tileThickness ?? 0.12) * -0.30) + 0.010;
export const SHORE_BOAT_Y                    = WATER_SURFACE_Y + 0.012;

export const NATURAL_DECOR_VARIANTS = {
  flower:   ['flower-1', 'flower-2', 'flower-3', 'flower-4'],
  grass:    ['plant-misc2', 'plant-misc3', 'plant-misc4', 'plant-misc5',
             'plant-grass1', 'plant-grass2', 'plant-sapling1', 'plant-sapling2'],
  shrub:    ['shrub-fern', 'shrub-bush1', 'shrub-bush2', 'shrub-monstera1', 'shrub-monstera2', 'shrub-misc1'],
  chicken:  ['animal-chicken'],
  deer:     ['animal-deer'],
  rock:     ['rock-1', 'rock-2', 'rock-3', 'rock-4'],
  reed:     ['reed'],
  mushroom: ['mushroom-1', 'mushroom-2'],
  'hay-bale': ['hay-bale']
};

export const BARREL_VARIANTS = ['barrel-1', 'barrel-2', 'barrel-3', 'barrel-4', 'barrel-5'];

const PROP_MODEL_DEFS = [
  { key: 'field-flag',   url: './glb/batiments/moulin-1.glb', target: FIELD_FLAG_TARGET_HEIGHT   * 1.70, mode: 'height' },
  { key: 'field-flag-2', url: './glb/batiments/moulin-2.glb', target: FIELD_FLAG_2_TARGET_HEIGHT * 1.70, mode: 'height', correctionX: Math.PI / 2 },
  { key: 'hay-bale',     url: './glb/botte-foin.glb',          target: HAY_BALE_TARGET_WIDTH,                   mode: 'length', kind: 'hay-bale' },
  { key: 'fountain-1',   url: './glb/fontaine-1.glb',         target: FOUNTAIN_TARGET_WIDTH,                   mode: 'length' },
  { key: 'road-bench',   url: './glb/banc.glb',               target: BENCH_TARGET_LENGTH,             mode: 'length' },
  { key: 'road-signpost-1', url: './glb/poteau-indicateur-1.glb', target: SIGNPOST_TARGET_HEIGHT, mode: 'height' },
  { key: 'road-signpost-2', url: './glb/poteau-indicateur-2.glb', target: SIGNPOST_TARGET_HEIGHT, mode: 'height' },
  { key: 'road-signpost-3', url: './glb/poteau-indicateur-3.glb', target: SIGNPOST_TARGET_HEIGHT, mode: 'height' },
  { key: 'shore-boat-2', url: './glb/barque-2.glb',           target: SHORE_BOAT_TARGET_LENGTH * 0.65, mode: 'length' },
  { key: 'flower-1',     url: './glb/flower-1.glb',           target: NATURAL_FLOWER_TARGET_WIDTH,     mode: 'length', kind: 'flower' },
  { key: 'flower-2',     url: './glb/flower-2.glb',           target: NATURAL_FLOWER_TARGET_WIDTH,     mode: 'length', kind: 'flower' },
  { key: 'flower-3',     url: './glb/flower-3.glb',           target: NATURAL_FLOWER_TARGET_WIDTH,     mode: 'length', kind: 'flower' },
  { key: 'flower-4',     url: './glb/flower-4.glb',           target: NATURAL_FLOWER_TARGET_WIDTH,     mode: 'length', kind: 'flower' },
  // Pool d'herbes/touffes/jeunes pousses — prairies et champs (plantes.glb package)
  // Fougères et buissons — forêts uniquement (shrub-* → castShadow actif, volume significatif)
  { key: 'shrub-fern',      url: './glb/plantes.glb', asset: 'Plant_Fern',      target: NATURAL_SHRUB_TARGET_WIDTH * 1.60, mode: 'length', kind: 'shrub' }, // +60%
  { key: 'shrub-bush1',     url: './glb/plantes.glb', asset: 'Plant_Bush1',     target: NATURAL_SHRUB_TARGET_WIDTH, mode: 'length', kind: 'shrub' },
  { key: 'shrub-bush2',     url: './glb/plantes.glb', asset: 'Plant_Bush2',     target: NATURAL_SHRUB_TARGET_WIDTH, mode: 'length', kind: 'shrub' },
  { key: 'shrub-monstera1', url: './glb/plantes.glb', asset: 'Plant_Monstera1', target: NATURAL_SHRUB_TARGET_WIDTH,        mode: 'length', kind: 'shrub' },
  { key: 'shrub-monstera2', url: './glb/plantes.glb', asset: 'Plant_Monstera2', target: NATURAL_SHRUB_TARGET_WIDTH,        mode: 'length', kind: 'shrub' },
  { key: 'shrub-misc1',     url: './glb/plantes.glb', asset: 'Plant_Misc1',     target: NATURAL_SHRUB_TARGET_WIDTH * 1.45, mode: 'length', kind: 'shrub' }, // grande plante
  { key: 'plant-misc2',   url: './glb/plantes.glb', asset: 'Plant_Misc2',   target: NATURAL_GRASS_TARGET_WIDTH, mode: 'length', kind: 'grass' },
  { key: 'plant-misc3',   url: './glb/plantes.glb', asset: 'Plant_Misc3',   target: NATURAL_GRASS_TARGET_WIDTH, mode: 'length', kind: 'grass' },
  { key: 'plant-misc4',   url: './glb/plantes.glb', asset: 'Plant_Misc4',   target: NATURAL_GRASS_TARGET_WIDTH, mode: 'length', kind: 'grass' },
  { key: 'plant-misc5',   url: './glb/plantes.glb', asset: 'Plant_Misc5',   target: NATURAL_GRASS_TARGET_WIDTH, mode: 'length', kind: 'grass' },
  { key: 'plant-grass1',  url: './glb/plantes.glb', asset: 'Plant_Grass1',  target: NATURAL_GRASS_TARGET_WIDTH, mode: 'length', kind: 'grass' },
  { key: 'plant-grass2',  url: './glb/plantes.glb', asset: 'Plant_Grass2',  target: NATURAL_GRASS_TARGET_WIDTH, mode: 'length', kind: 'grass' },
  { key: 'plant-sapling1',url: './glb/plantes.glb', asset: 'Plant_Sapling1',target: NATURAL_GRASS_TARGET_WIDTH, mode: 'length', kind: 'grass' },
  { key: 'plant-sapling2',url: './glb/plantes.glb', asset: 'Plant_Sapling2',target: NATURAL_GRASS_TARGET_WIDTH, mode: 'length', kind: 'grass' },
  { key: 'rock-1',       url: './glb/rock-1.glb',             target: NATURAL_ROCK_TARGET_LENGTH,      mode: 'length', kind: 'rock' },
  { key: 'rock-2',       url: './glb/rock-2.glb',             target: NATURAL_ROCK_TARGET_LENGTH,      mode: 'length', kind: 'rock' },
  { key: 'rock-3',       url: './glb/rock-3.glb',             target: NATURAL_ROCK_TARGET_LENGTH,      mode: 'length', kind: 'rock' },
  { key: 'rock-4',       url: './glb/rock-4.glb',             target: NATURAL_ROCK_TARGET_LENGTH,      mode: 'length', kind: 'rock' },
  { key: 'reed',         url: './glb/roseau.glb',             target: NATURAL_REED_TARGET_HEIGHT,      mode: 'height', kind: 'reed' },
  { key: 'mushroom-1',   url: './glb/mushroom-1.glb',         target: NATURAL_MUSHROOM_TARGET_WIDTH,        mode: 'length', kind: 'mushroom' },
  { key: 'mushroom-2',   url: './glb/mushroom-2.glb',         target: NATURAL_MUSHROOM_TARGET_WIDTH * 1.40 * 1.15, mode: 'length', kind: 'mushroom' }, // +40% +15%
  { key: 'barrel-1',     url: './glb/tonneau-1.glb',          target: BARREL_TARGET_WIDTH * 0.87, mode: 'length' },
  { key: 'barrel-2',     url: './glb/tonneau-2.glb',          target: BARREL_TARGET_WIDTH * 0.87, mode: 'length' },
  { key: 'barrel-3',     url: './glb/tonneau-3.glb',          target: BARREL_TARGET_WIDTH * 1.18, mode: 'length' },
  { key: 'barrel-4',     url: './glb/tonneau-4.glb',          target: BARREL_TARGET_WIDTH * 0.87, mode: 'length' },
  { key: 'barrel-5',     url: './glb/tonneau-5.glb',          target: BARREL_TARGET_WIDTH * 2.25 * 0.87, mode: 'length' },
  { key: 'cart',         url: './glb/charrette.glb',          target: CART_TARGET_LENGTH,              mode: 'length' },
  // Animaux de village — GLB individuels
  { key: 'animal-chicken', url: './glb/animaux/poule.glb',  target: ANIMAL_CHICKEN_TARGET_WIDTH, mode: 'length' },
  { key: 'animal-dog',     url: './glb/animaux/chien.glb',  target: ANIMAL_DOG_TARGET_WIDTH,     mode: 'length' },
  { key: 'animal-cat',     url: './glb/animaux/chat.glb',   target: ANIMAL_CAT_TARGET_WIDTH,     mode: 'length' },
  { key: 'animal-horse',   url: './glb/animaux/cheval.glb', target: ANIMAL_HORSE_TARGET_WIDTH,   mode: 'length' },
  // Animaux sauvages (forêt / prairie / champ) — InstancedMesh via naturalPropsOverlay
  { key: 'animal-deer',    url: './glb/animaux/cerf.glb',   target: NATURAL_DEER_TARGET_WIDTH,   mode: 'length' }
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

// ─── Merge helper ─────────────────────────────────────────────────────────────
// Fusionne les InstancedMesh de sourceGroup dans targetGroup.
// Si un IM du même name existe déjà dans targetGroup, on étend son instanceMatrix
// au lieu d'en créer un nouveau — le nombre d'IMs reste O(unique variantKey×chunkKey).
// Geometry et material de l'IM existant sont réutilisés sans clone supplémentaire.
const _mergeM = new THREE.Matrix4();
function _mergeInstancedMeshGroup(targetGroup, sourceGroup) {
  // Snapshot : sourceGroup.children sera vidé lors des add/remove
  const toProcess = [...sourceGroup.children];
  for (const newIM of toProcess) {
    if (!newIM.isInstancedMesh) {
      targetGroup.add(newIM);
      continue;
    }
    const existing = targetGroup.getObjectByName(newIM.name);
    if (!existing || !existing.isInstancedMesh) {
      // Première occurrence de ce (variantKey, chunkKey) → ajouter directement
      targetGroup.add(newIM);
      continue;
    }
    // Fusionner : nouveau IM qui réutilise geometry + material de l'existant
    const oldCount = existing.count;
    const addCount = newIM.count;
    const merged = new THREE.InstancedMesh(existing.geometry, existing.material, oldCount + addCount);
    merged.name          = existing.name;
    merged.frustumCulled = existing.frustumCulled;
    merged.castShadow    = existing.castShadow;
    merged.receiveShadow = existing.receiveShadow;
    merged.userData      = { ...existing.userData };

    // Copier matrices anciennes puis nouvelles
    for (let i = 0; i < oldCount; i++) { existing.getMatrixAt(i, _mergeM); merged.setMatrixAt(i, _mergeM); }
    for (let i = 0; i < addCount; i++) { newIM.getMatrixAt(i, _mergeM);    merged.setMatrixAt(oldCount + i, _mergeM); }
    merged.instanceMatrix.needsUpdate = true;

    // Recalculer la bounding sphere LOD depuis toutes les matrices (O(count), rapide)
    const allMats = [];
    for (let i = 0; i < merged.count; i++) { merged.getMatrixAt(i, _mergeM); allMats.push(_mergeM.clone()); }
    merged.userData.worldBoundingSphere = computePropBoundingSphere(allMats, 0.25);

    // Remplacer l'ancien IM — NE PAS disposer geometry/material (réutilisés par merged)
    targetGroup.remove(existing);
    existing.instanceMatrix = null; // libère le buffer matrices de l'ancien
    targetGroup.add(merged);
  }
}

/**
 * Reconstruit la liste plate des objets soumis au LOD roadside (bancs, panneaux,
 * moulins, bateaux, etc.).  À appeler après tout ajout/suppression dans les
 * sous-groupes village / boats / flags de l'overlay.
 */
function _rebuildRoadsideDecorLOD(overlay) {
  overlay.userData.roadsideDecorObjects = [];
  const _decorDistSq     = LOD_ROAD_DECOR_CULL_DISTANCE  * LOD_ROAD_DECOR_CULL_DISTANCE;
  const _signDistSq      = LOD_SIGN_CULL_DISTANCE         * LOD_SIGN_CULL_DISTANCE;
  const _shoreBoatDistSq = LOD_SHORE_BOAT_CULL_DISTANCE   * LOD_SHORE_BOAT_CULL_DISTANCE;
  const _villageDistSq   = LOD_VILLAGE_PROP_CULL_DISTANCE * LOD_VILLAGE_PROP_CULL_DISTANCE;
  const _animalDistSq    = LOD_ANIMAL_CULL_DISTANCE       * LOD_ANIMAL_CULL_DISTANCE;
  const _fountainDistSq  = LOD_FOUNTAIN_CULL_DISTANCE     * LOD_FOUNTAIN_CULL_DISTANCE;
  const _crowDistSq      = LOD_CROW_CULL_DISTANCE         * LOD_CROW_CULL_DISTANCE;
  const _millDistSq      = LOD_MILL_CULL_DISTANCE         * LOD_MILL_CULL_DISTANCE;

  for (const subGroup of overlay.children) {
    if (subGroup.name === 'field-zone-flags-and-crows') {
      for (const child of subGroup.children) {
        if (child.userData?.effectKind === 'field-flag-idle') {
          overlay.userData.roadsideDecorObjects.push({ object: child, center: child.position.clone(), lodDistSq: _crowDistSq });
          for (const zoneChild of child.children) {
            if (zoneChild.name === 'field-zone-mill-glb') {
              overlay.userData.roadsideDecorObjects.push({ object: zoneChild, center: child.position.clone(), lodDistSq: _millDistSq });
            }
          }
        }
      }
    } else if (subGroup.name === 'village-roadside-glb-props') {
      for (const child of subGroup.children) {
        const n = child.name ?? '';
        if (n.includes('bench') || n.includes('signpost') || n.includes('barrel') || n.includes('cart') || n.includes('fountain') || n.includes('animal')) {
          const distSq = n.includes('signpost') ? _signDistSq
                       : n.includes('animal')   ? _animalDistSq
                       : (n.includes('barrel') || n.includes('cart')) ? _villageDistSq
                       : n.includes('fountain') ? _fountainDistSq
                       : _decorDistSq;
          overlay.userData.roadsideDecorObjects.push({ object: child, center: child.position.clone(), lodDistSq: distSq });
        }
      }
    } else if (subGroup.name === 'water-shore-static-boats-glb') {
      for (const child of subGroup.children) {
        // Le nom inclut désormais le variant : water-shore-inert-boat-glb-shore-boat-1/2
        if (child.name.startsWith('water-shore-inert-boat-glb')) {
          overlay.userData.roadsideDecorObjects.push({ object: child, center: child.position.clone(), lodDistSq: _shoreBoatDistSq });
        }
      }
    }
  }
}

// ── Registre des objets animés ────────────────────────────────────────────────
// Remplace le overlay.traverse() par frame dans updateDecorOverlay.
// Peuplé une seule fois par rebuild ; updateDecorOverlay itère ce Set en O(N_animés).
const _decorAnimRegistry = new Set();

function _refreshDecorAnimRegistry(overlay) {
  _decorAnimRegistry.clear();
  overlay.traverse(obj => {
    if (obj.userData.effectKind || obj.userData.mixer) _decorAnimRegistry.add(obj);
  });
  console.log(`[DECOR-ANIM] registry: ${_decorAnimRegistry.size} animated objects`);
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

  _rebuildRoadsideDecorLOD(overlay);
  _refreshDecorAnimRegistry(overlay);
}

/**
 * Mise à jour incrémentale du décor lors de la POSE d'une seule tuile.
 *
 * Évite le rebuild complet O(N_tuiles) de createNaturalGroundProps (~589ms) et
 * createRoadsideVillageProps (~293ms) en ne traitant que la tuile nouvellement
 * posée via une Map d'une entrée.  Le coût total tombe à ~30ms.
 *
 * Les groupes existants (natural, village, boats) sont enrichis en delta.
 * Les drapeaux champ sont reconstruits intégralement (< 10ms, zone-dépendant).
 * rebuildDecorOverlay (O(N)) reste réservé à undo / init / applyRemoteGameState.
 */
export function addSingleTileToDecorOverlay(overlay, newPlacedTile, placedTiles) {
  const naturalGroup = overlay.getObjectByName('natural-grass-forest-glb-props');
  if (!naturalGroup) {
    // Overlay pas encore initialisé : rebuild complet.
    rebuildDecorOverlay(overlay, placedTiles);
    return;
  }

  ensurePropModels(overlay);
  ensureBirdModel(overlay);

  const singleTileMap = new Map([[newPlacedTile.key, newPlacedTile]]);
  const specialBuildingSafeZones = collectSpecialBuildingSafeZones(placedTiles);

  // ── Props naturels : merge instances dans les IMs existants du même chunk ──
  // (évite l'accumulation de petits IMs dupliqués → draw calls stables)
  const newNatural = createNaturalGroundProps(singleTileMap);
  _mergeInstancedMeshGroup(naturalGroup, newNatural);

  // ── Props village : delta dans le groupe existant ─────────────────────────
  const villageGroup = overlay.getObjectByName('village-roadside-glb-props');
  if (villageGroup) {
    const newVillage = createRoadsideVillageProps(singleTileMap, specialBuildingSafeZones);
    while (newVillage.children.length > 0) villageGroup.add(newVillage.children[0]);
  }

  // ── Bateaux de plage : delta dans le groupe existant ─────────────────────
  const boatGroup = overlay.getObjectByName('water-shore-static-boats-glb');
  if (boatGroup) {
    const newBoats = createShoreBoats(singleTileMap, specialBuildingSafeZones);
    while (newBoats.children.length > 0) boatGroup.add(newBoats.children[0]);
  }

  // ── Drapeaux champ : rebuild complet (taille de zone, < 10ms) ────────────
  const flagsGroup = overlay.getObjectByName('field-zone-flags-and-crows');
  if (flagsGroup) overlay.remove(flagsGroup);
  overlay.add(createFieldFlags(placedTiles));

  // ── Liste LOD : reconstruite depuis tous les groupes mis à jour ───────────
  _rebuildRoadsideDecorLOD(overlay);
  // Rescan des objets animés (nouveaux props village / drapeaux peuvent avoir mixer/effectKind)
  _refreshDecorAnimRegistry(overlay);
}

// Distance max (horizontale caméra→splash) en unités monde
const WATER_EFFECT_CULL_HEIGHT  = 16;   // au-delà → masquer tout le groupe
const WATER_EFFECT_CULL_DIST_SQ = 110;  // ≈ 10.5u à hauteur rase

export function updateDecorOverlay(overlay, elapsedSeconds, camera = null) {
  // ── Culling effets eau selon hauteur + distance caméra ───────────────────
  if (camera) {
    const splashRoot = overlay.getObjectByName('water-void-edge-splashes');
    if (splashRoot) {
      const camY = camera.position.y;
      if (camY > WATER_EFFECT_CULL_HEIGHT) {
        // Caméra trop haute → effets pas visibles, on masque tout d'un coup
        splashRoot.visible = false;
      } else {
        splashRoot.visible = true;
        const camX = camera.position.x;
        const camZ = camera.position.z;
        // Rayon légèrement plus grand quand caméra basse (zoom in)
        const distSq = WATER_EFFECT_CULL_DIST_SQ * Math.max(1, 1.8 - camY * 0.05);
        for (const child of splashRoot.children) {
          const wx = child.userData.worldX;
          const wz = child.userData.worldZ;
          if (wx === undefined) { child.visible = true; continue; }
          const dx = wx - camX;
          const dz = wz - camZ;
          child.visible = (dx * dx + dz * dz) < distSq;
        }
      }
    }
  }

  // ── Animation : itère uniquement les objets animés (registre, pas traverse) ─
  // overlay.traverse() visite 2000-5000+ nœuds → 10ms/frame gaspillés.
  // _decorAnimRegistry ne contient que les objets avec effectKind ou mixer (~100-400).
  for (const object of _decorAnimRegistry) {
    // Nettoyage automatique si l'objet a été détaché lors d'un rebuild partiel
    if (!object.parent) { _decorAnimRegistry.delete(object); continue; }

    const data = object.userData;

    // Mise à jour AnimationMixer pour tout GLB animé (ex. moulin-2 avec pales).
    // Indépendant de effectKind : couvre tous les modèles clonés par createPropModel.
    if (data?.mixer) {
      const prev  = data.mixerLastTime ?? elapsedSeconds;
      const delta = Math.min(0.05, Math.max(0, elapsedSeconds - prev));
      data.mixerLastTime = elapsedSeconds;
      data.mixer.update(delta);
    }

    if (!data?.effectKind) continue;

    // Optimisation: ne pas animer les effets eau dont le groupe parent est caché (culling distance)
    if (data.effectKind === 'water-drop' || data.effectKind === 'water-streak' || data.effectKind === 'water-mist') {
      if (!object.parent?.visible || !object.parent?.parent?.visible) continue;
    }

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
      continue;
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
      continue;
    }

    if (data.effectKind === 'water-mist') {
      const t = (elapsedSeconds * data.speed + data.phase) % 1;
      object.position.set(data.x + data.nx * t * data.drift, data.y + Math.sin(t * Math.PI) * 0.018, data.z + data.nz * t * data.drift);
      object.scale.setScalar(data.scale * (0.55 + t * 1.35));
      object.material.opacity = Math.max(0, 0.34 - t * 0.34);
      continue;
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
      continue;
    }

    if (data.effectKind === 'scarecrow-idle') {
      object.rotation.z = Math.sin(elapsedSeconds * 1.2 + data.phase) * 0.025;
    }
  }
}

// ─── LOD ──────────────────────────────────────────────────────────────────────

// Facteur LOD dynamique : réduit les distances de cull quand la caméra est basse.
// Y >= HIGH_Y → factor 1.0 (plein champ), Y <= LOW_Y → factor MIN_FACTOR (vue rase-mottes).
const _LOD_HEIGHT_LOW_Y    = 1.5;
const _LOD_HEIGHT_HIGH_Y   = 7.0;
const _LOD_HEIGHT_MIN_FACTOR = 0.50; // réduction max 50 %
export function computeLodHeightFactor(camera) {
  const y = camera.position.y;
  if (y >= _LOD_HEIGHT_HIGH_Y) return 1.0;
  if (y <= _LOD_HEIGHT_LOW_Y)  return _LOD_HEIGHT_MIN_FACTOR;
  return _LOD_HEIGHT_MIN_FACTOR + (1.0 - _LOD_HEIGHT_MIN_FACTOR) *
    (y - _LOD_HEIGHT_LOW_Y) / (_LOD_HEIGHT_HIGH_Y - _LOD_HEIGHT_LOW_Y);
}

export function updateNaturalPropsLOD(overlay, camera, lodFactor = 1.0) {
  _propLodMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  _propLodFrustum.setFromProjectionMatrix(_propLodMatrix);

  overlay.traverse(obj => {
    if (!obj.isInstancedMesh || !obj.userData.worldBoundingSphere) return;
    const sphere   = obj.userData.worldBoundingSphere;
    const inFrustum = _propLodFrustum.intersectsSphere(sphere);
    const dist     = camera.position.distanceTo(sphere.center);
    const cat      = obj.userData.lodCategory;
    const withinDist = cat === 'micro'   ? dist < LOD_MICRO_CULL_DISTANCE  * lodFactor
                     : cat === 'plant'   ? dist < LOD_PLANT_CULL_DISTANCE  * lodFactor
                     : cat === 'rock'    ? dist < LOD_ROCK_CULL_DISTANCE   * lodFactor
                     : cat === 'animal'  ? dist < LOD_ANIMAL_CULL_DISTANCE * lodFactor
                     : true;
    obj.visible = inFrustum && withinDist;
  });
}

export function updateFieldDecorLOD(overlay, camera, lodFactor = 1.0) {
  const factorSq = lodFactor * lodFactor;
  for (const item of (overlay.userData.roadsideDecorObjects ?? [])) {
    item.object.visible = camera.position.distanceToSquared(item.center) < item.lodDistSq * factorSq;
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
  // Stocker la position monde pour le culling distance dans updateDecorOverlay
  group.userData.worldX = tilePos.x;
  group.userData.worldZ = tilePos.z;
  const sector  = SECTOR_BY_KEY[edge];
  const vA      = getHexVertex(sector.a);
  const vB      = getHexVertex(sector.b);
  const mid     = { x: (vA.x + vB.x) / 2, z: (vA.z + vB.z) / 2 };
  const normalLen = Math.hypot(mid.x, mid.z) || 1;
  const nx      = mid.x / normalLen;
  const nz      = mid.z / normalLen;
  const tangent = normalize2(vB.x - vA.x, vB.z - vA.z);
  const seed    = hashNumber(`${placedTile.key}:${edge}:splash`);

  for (let i = 0; i < 4; i += 1) {
    const lane   = (i - 1.5) / 4;
    const jitter = (hashUnit(`${seed}:drop:${i}`) - 0.5) * 0.10;
    const out    = 0.055 + hashUnit(`${seed}:out:${i}`) * 0.13;
    const x      = tilePos.x + mid.x + tangent.x * (lane * 0.68 + jitter) + nx * out;
    const z      = tilePos.z + mid.z + tangent.z * (lane * 0.68 + jitter) + nz * out;
    const drop   = new THREE.Mesh(new THREE.SphereGeometry(0.010 + hashUnit(`${seed}:size:${i}`) * 0.010, 4, 3), WATER_DROP_MAT.clone());
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

  for (let i = 0; i < 3; i += 1) {
    const lane   = (i - 1) / 3;
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

  for (let i = 0; i < 3; i += 1) {
    const lane = (i - 1) / 3;
    const mist = new THREE.Mesh(new THREE.SphereGeometry(0.010 + hashUnit(`${seed}:mist-size:${i}`) * 0.010, 4, 3), WATER_MIST_MAT.clone());
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
  // Ne pas rebuilder directement hors RAF — sinon tous les objets passent visible=true
  // et le LOD ne s'applique pas avant le prochain %9 (→ flash de 1+ seconde).
  // On pose un flag ; le RAF loop le détecte et passe par la queue (LOD immédiat).
  if (lastPlacedTiles) overlay.userData.pendingModelRebuild = true;
}

// ─── Extraction d'un asset depuis un package GLB ─────────────────────────────
// Utilisé quand def.asset est défini (package multi-objets) au lieu de def.url seul.
// Retourne un Group autonome avec les transforms parents baked, prêt pour preparePropPrototype.
// Pour un GLB simple (def.asset absent), on passe directement gltf.scene comme avant.
function extractFromPackage(scene, assetName) {
  scene.updateMatrixWorld(true);
  const found = scene.getObjectByName(assetName);
  if (!found) {
    console.warn(`[Package GLB] asset "${assetName}" introuvable — fallback scène entière`);
    return scene;
  }
  // Cloner l'objet trouvé (sous-arbre complet, skeletons inclus)
  const extracted = cloneSkeleton(found);
  // Si l'objet n'est pas enfant direct de la scène (hiérarchie intermédiaire),
  // bake la matrice monde du parent pour ne pas perdre ses transforms.
  if (found.parent && found.parent !== scene) {
    extracted.applyMatrix4(found.parent.matrixWorld);
  }
  return extracted;
}

function ensurePropModels(overlay) {
  if (propModelsLoading || propModelsRequested) return;
  propModelsLoading   = true;
  propModelsRequested = true;

  // Grouper les defs par URL : un package GLB (N assets) ne se charge qu'une seule fois.
  // Les GLBs simples (1 def = 1 url) fonctionnent exactement comme avant.
  const urlGroups = new Map(); // url → [def, ...]
  for (const def of PROP_MODEL_DEFS) {
    if (!urlGroups.has(def.url)) urlGroups.set(def.url, []);
    urlGroups.get(def.url).push(def);
  }

  let pending = urlGroups.size;
  const finishOne = () => {
    pending -= 1;
    if (pending > 0) return;
    propModelsLoading = false;
    maybeRebuildWhenReady(overlay);
  };

  for (const [url, defs] of urlGroups) {
    new GLTFLoader().load(
      url,
      gltf => {
        for (const def of defs) {
          // GLB simple : pas de champ asset → gltf.scene entier (comportement identique à avant)
          // Package GLB : champ asset → extraire l'objet nommé avec transforms baked
          const source = def.asset ? extractFromPackage(gltf.scene, def.asset) : gltf.scene;
          propGlbLibrary.set(def.key, preparePropPrototype(source, def));
          propAnimationsLibrary.set(def.key, gltf.animations ?? []);
        }
        finishOne();
      },
      undefined,
      error => { console.warn(`GLB indisponible : ${url}`, error); finishOne(); }
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
      for (const m of mats) {
        if (!m) continue;
        m.visible = true;
        // Strategy C : teinture ambrée chaude (lerp 8%) pour unifier les GLBs hétérogènes
        if (m.color) m.color.lerp(new THREE.Color(0xC8A060), 0.08);
      }
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

// Réutilise les matériaux du prototype plutôt que les copies créées par cloneSkeleton.
// Traversal depth-first identique entre prototype et clone → matching par position sûr.
// Résultat : zéro duplication de texture GPU entre instances du même type.
function _reusePrototypeMaterials(clone, prototype) {
  const protoMats = [];
  prototype.traverse(o => { if (o.isMesh) protoMats.push(o.material); });
  let i = 0;
  clone.traverse(o => {
    if (o.isMesh && i < protoMats.length) o.material = protoMats[i++];
  });
}

/**
 * Props statiques (sans animation) : remplace chaque SkinnedMesh par un Mesh ordinaire.
 * En bind pose, le skinning est une identité → rendu pixel-perfect identique.
 * Bénéfice : zéro DataTexture bone matrix per instance (élimine l'accumulation GPU).
 * Appelé uniquement si propAnimationsLibrary[key] est vide.
 */
function _convertStaticSkinnedMeshesToMesh(root) {
  const toReplace = [];
  root.traverse(o => { if (o.isSkinnedMesh) toReplace.push(o); });
  for (const o of toReplace) {
    const mesh = new THREE.Mesh(o.geometry, o.material);
    mesh.name           = o.name;
    mesh.visible        = o.visible;
    mesh.castShadow     = o.castShadow;
    mesh.receiveShadow  = o.receiveShadow;
    mesh.frustumCulled  = o.frustumCulled;
    mesh.userData       = { ...o.userData };
    mesh.position.copy(o.position);
    mesh.rotation.copy(o.rotation);
    mesh.scale.copy(o.scale);
    // Transfert des enfants éventuels (Object3D intermédiaires, pas des Bone).
    while (o.children.length > 0) mesh.add(o.children[0]);
    if (o.parent) { o.parent.add(mesh); o.parent.remove(o); }
    // Libère la DataTexture si elle avait déjà été créée (rendu du prototype).
    o.skeleton?.dispose?.();
  }
}

export function createPropModel(key, seedKey = key) {
  const prototype = propGlbLibrary.get(key);
  if (!prototype) {
    return null;
  }
  // cloneSkeleton est obligatoire pour TOUS les GLBs (même statiques) :
  // certains exporteurs utilisent des SkinnedMesh sans animation ; prototype.clone(true)
  // ne recâble pas les références skeleton → géométrie dégénérée / dimensions aberrantes.
  const object = cloneSkeleton(prototype);

  // Partage des matériaux du prototype après clone → élimine les duplications de textures GPU
  // sans risquer les bugs de SkinnedMesh. Les matériaux ne sont jamais modifiés par instance.
  _reusePrototypeMaterials(object, prototype);

  // Props sans animation : SkinnedMesh → Mesh (supprime la DataTexture bone matrix par instance).
  // Props animés (moulins, animaux) conservent leur SkinnedMesh + AnimationMixer.
  const animClips = propAnimationsLibrary.get(key);
  if (!animClips || animClips.length === 0) _convertStaticSkinnedMeshesToMesh(object);

  object.traverse(child => {
    child.visible = true;
    if (!child.isMesh) return;
    child.castShadow              = false;  // réinitialisé — 1 seul caster via _applySingleShadowCaster
    child.receiveShadow           = true;
    child.userData.shadowFlagsApplied = true; // empêche applySceneShadowFlags() de réinitialiser
  });
  _applySingleShadowCaster(object); // 1 shadow caster max par prop (le plus grand mesh)
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

/** Nombre de triangles d'une géométrie (indexée ou non). */
function _geomTriCount(geo) {
  if (!geo) return 0;
  return geo.index
    ? geo.index.count / 3
    : Math.floor((geo.attributes?.position?.count ?? 0) / 3);
}

/**
 * Sélectionne le mesh avec le plus de triangles dans root et lui seul
 * obtient castShadow=true. Tous les autres restent à false.
 * Réduit les shadow casters de N sous-meshes → 1 par prop.
 */
function _applySingleShadowCaster(root) {
  let best = null, bestTris = -1;
  root.traverse(obj => {
    if (!obj.isMesh) return;
    const t = _geomTriCount(obj.geometry);
    if (t > bestTris) { bestTris = t; best = obj; }
  });
  if (best) best.castShadow = true;
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
    // Verrouiller : applySceneShadowFlags ne doit pas réactiver les ombres sur les oiseaux
    object.userData.disableCastShadow  = true;
    object.userData.shadowFlagsApplied = true;
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
