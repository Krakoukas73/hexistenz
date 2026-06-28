/**
 * naturalPropsOverlay.js — Props naturels en InstancedMesh (fleurs, roseaux, champignons, rochers).
 *
 * Stratégie deux-passes :
 *   Phase 1 — collectNaturalPropInstances accumule les Matrix4 par (variant × chunk).
 *   Phase 2 — buildNaturalPropInstancedMeshes construit un InstancedMesh par combinaison,
 *              avec bounding sphere LOD et shadow optimisée (pas de castShadow sur les fleurs).
 *
 * Import circulaire avec decorOverlay (propGlbLibrary, _propInstanceDummy, etc.)
 * — valide en ES modules car tous les accès sont dans des corps de fonctions.
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import {
  EDGE_ORDER,
  EDGE_TYPES,
  HEX_SIZE,
  SECTOR_DEFS
} from './config.js';
import { hashUnit10k as hashUnit, hashNumber } from './hashUtils.js';
import { axialToWorld, makeHexKey } from './hex.js';
import { HEX_DIRECTIONS, getOppositeEdge } from './placementRules.js';
import { getTileEdgeType, getTileCenterType } from './tileUtils.js';
import { placeObjectOnTerrain, getTerrainNormalAt } from './terrainHeight.js';
import { getCurvatureTiltQuaternion } from './worldCurvature.js';
import { ROCK_DENSITY, HITBOX_R } from './variables.js';
import { registerPropHitbox } from './propHitboxRegistry.js';
import { getHexVertex, normalize2 } from './hexGeometry.js';
import {
  snapPropBottomToSurface,
  isSingleTerrainFootprint,
  isSafePropGroundType,
  getEdgeFromLocalPoint
} from './propPlacement.js';
// Import circulaire résolu via live bindings ES modules — uniquement dans des corps de fonctions.
import {
  propGlbLibrary,
  _propInstanceDummy,
  _snapNormal,
  getPropChunkKey,
  computePropBoundingSphere,
  createPropModel,
  NATURAL_DECOR_VARIANTS,
  NATURAL_FLOWER_TARGET_WIDTH,
  NATURAL_GRASS_TARGET_WIDTH,
  NATURAL_BRINDILLE_TARGET_WIDTH,
  NATURAL_SHRUB_TARGET_WIDTH,
  NATURAL_MUSHROOM_TARGET_WIDTH,
  NATURAL_DEER_TARGET_WIDTH,
  HAY_BALE_TARGET_WIDTH,
  PILE_DE_BOIS_TARGET_LENGTH
} from './decorOverlay.js';

const SECTOR_BY_KEY    = Object.fromEntries(SECTOR_DEFS.map(s => [s.key, s]));
const DIRECTION_BY_EDGE = Object.fromEntries(HEX_DIRECTIONS.map(d => [d.edge, d]));
// Pré-alloué pour le tilt de courbure monde (bouliste)
const _npCurvQuat = new THREE.Quaternion();

// ─── Point d'entrée ────────────────────────────────────────────────────────────

export function createNaturalGroundProps(placedTiles) {
  const group = new THREE.Group();
  group.name  = 'natural-grass-forest-glb-props';

  // Phase 1 : collecter les instances pour les props haute-fréquence (flower, reed, mushroom)
  // Les rochers gardent le chemin clone (variantes de taille côtière, peu nombreux)
  const accumulator = new Map(); // variantKey → Map(chunkKey → Matrix4[])

  for (const placedTile of placedTiles.values()) {
    for (const edge of EDGE_ORDER) {
      const type = getTileEdgeType(placedTile, edge);
      if (!isSafePropGroundType(type)) continue;

      collectNaturalPropInstances(accumulator, placedTile, edge, type, 'flower',    placedTiles);
      collectNaturalPropInstances(accumulator, placedTile, edge, type, 'brindille', placedTiles);
      collectNaturalPropInstances(accumulator, placedTile, edge, type, 'grass',     placedTiles);
      collectNaturalPropInstances(accumulator, placedTile, edge, type, 'shrub',        placedTiles);
      collectNaturalPropInstances(accumulator, placedTile, edge, type, 'pile-de-bois', placedTiles);
      collectNaturalPropInstances(accumulator, placedTile, edge, type, 'deer',         placedTiles);
      collectNaturalPropInstances(accumulator, placedTile, edge, type, 'rock',     placedTiles);
      collectNaturalPropInstances(accumulator, placedTile, edge, type, 'reed',     placedTiles);
      collectNaturalPropInstances(accumulator, placedTile, edge, type, 'mushroom', placedTiles);
    }
  }

  // Bottes de foin — arêtes field ET arêtes grass directement adjacentes à un field
  for (const placedTile of placedTiles.values()) {
    for (const edge of EDGE_ORDER) {
      const type = getTileEdgeType(placedTile, edge);
      if (type === EDGE_TYPES.field) {
        collectNaturalPropInstances(accumulator, placedTile, edge, EDGE_TYPES.field, 'hay-bale', placedTiles);
      } else if (type === EDGE_TYPES.grass && isGrassAdjacentToField(placedTile, edge, placedTiles)) {
        collectNaturalPropInstances(accumulator, placedTile, edge, EDGE_TYPES.grass, 'hay-bale', placedTiles);
      }
    }
  }

  // Centre des tuiles grass/forest — sections centrales sans décor jusqu'ici
  for (const placedTile of placedTiles.values()) {
    const centerType = getTileCenterType(placedTile);
    if (centerType === EDGE_TYPES.grass || centerType === EDGE_TYPES.forest) {
      collectNaturalPropInstancesCenter(accumulator, placedTile, centerType);
    }
  }

  // Phase 2 : construire les InstancedMesh pour flower/reed/mushroom/rock
  buildNaturalPropInstancedMeshes(group, accumulator);

  return group;
}

// ─── Collecte des instances ────────────────────────────────────────────────────

function collectNaturalPropInstances(accumulator, placedTile, edge, type, kind, placedTiles) {
  const seed   = `${placedTile.key}:natural:${kind}:${edge}`;
  const chance = getNaturalPropChance(kind, type, placedTile, edge, placedTiles);
  if (hashUnit(seed) > chance) return;

  const count        = getNaturalPropCount(kind, type, seed, placedTile, edge, placedTiles);
  const centerLocal  = getNaturalSectorPoint(edge, `${seed}:cluster-center`);
  const clusterRadius = getNaturalClusterRadius(kind);
  const tilePos      = axialToWorld(placedTile.q, placedTile.r);

  for (let i = 0; i < count; i += 1) {
    const local         = getNaturalClusterPoint(edge, centerLocal, `${seed}:point:${i}`, clusterRadius);
    const footprintRadius = getNaturalPropFootprint(kind);
    if (!isSingleTerrainFootprint(local, placedTile, type, footprintRadius)) continue;

    const variantKey = pickNaturalPropVariant(kind, `${seed}:variant:${i}`, seed);
    if (!variantKey || !propGlbLibrary.has(variantKey)) continue;

    const yaw         = hashUnit(`${seed}:yaw:${i}`) * Math.PI * 2;
    // groundOffset = 0 pour les types avec snap : le résultat final est surfaceY + clearance.
    // Roseaux : 2 mm au-dessus (pas de snap pour les roseaux → groundOffset direct).
    const groundOffset = kind === 'reed' ? 0.002 : 0.000;

    _propInstanceDummy.rotation.set(0, 0, 0);
    _propInstanceDummy.position.set(tilePos.x + local.x, 0, tilePos.z + local.z);
    placeObjectOnTerrain(_propInstanceDummy, local, type, hashNumber(`${seed}:terrain:${i}`) % 97, {
      groundOffset,
      alignToSlope:    kind !== 'reed' && kind !== 'hay-bale' && kind !== 'pile-de-bois',
      yaw,
      edgeLockStart:   0.98,
      edgeLockEnd:     1.0,
      normalSampleStep: HEX_SIZE * 0.012
    });

    if (kind === 'reed') {
      _propInstanceDummy.rotation.x += (hashUnit(`${seed}:leanx:${i}`) - 0.5) * 0.10;
      _propInstanceDummy.rotation.z += (hashUnit(`${seed}:leanz:${i}`) - 0.5) * 0.10;
    }
    if (kind === 'mushroom') {
      _propInstanceDummy.rotation.x += (hashUnit(`${seed}:mushleanx:${i}`) - 0.5) * 0.035;
      _propInstanceDummy.rotation.z += (hashUnit(`${seed}:mushleanz:${i}`) - 0.5) * 0.035;
    }

    let jitter = getNaturalPropScaleJitter(kind, seed, i);
    if (kind === 'rock' && isNearWaterDecorArea(placedTile, edge, placedTiles)) {
      jitter *= 1.22 + hashUnit(`${seed}:shore-rock-scale:${i}`) * 0.36;
    }

    // Snap analogue à snapPropBottomToSurface — compense le pivot imparfait des petits GLB.
    if (kind === 'flower' || kind === 'brindille' || kind === 'grass' || kind === 'shrub' || kind === 'mushroom' || kind === 'deer') {
      _snapNormal.set(0, 1, 0).applyQuaternion(_propInstanceDummy.quaternion);
      const slopeSin   = Math.sqrt(Math.max(0, 1 - _snapNormal.y * _snapNormal.y));
      const clearance  = getNaturalPropGroundClearance(kind);
      const halfTarget = kind === 'flower'    ? NATURAL_FLOWER_TARGET_WIDTH
                       : kind === 'brindille' ? NATURAL_BRINDILLE_TARGET_WIDTH
                       : kind === 'grass'     ? NATURAL_GRASS_TARGET_WIDTH
                       : kind === 'shrub'     ? NATURAL_SHRUB_TARGET_WIDTH
                       : kind === 'deer'      ? NATURAL_DEER_TARGET_WIDTH
                       : NATURAL_MUSHROOM_TARGET_WIDTH;
      const baseRadius = halfTarget * 0.5 * jitter;
      const snapLift   = (clearance - groundOffset) + slopeSin * baseRadius;
      if (snapLift > 0.0005) _propInstanceDummy.position.y += snapLift;
    }

    // Pile de bois : même compensation que hay-bale (objet plat posé au sol, non aligné à la pente).
    if (kind === 'pile-de-bois') {
      const pileNormal = getTerrainNormalAt(local, type, hashNumber(`${seed}:terrain:${i}`) % 97, {
        edgeLockStart: 0.98,
        edgeLockEnd:   1.0
      });
      const slopeSin = Math.sqrt(Math.max(0, 1 - pileNormal.y * pileNormal.y));
      if (slopeSin > 0.02) {
        _propInstanceDummy.position.y -= slopeSin * (PILE_DE_BOIS_TARGET_LENGTH * 0.5 * jitter);
      }
    }

    // Botte de foin : upright sur terrain pentu → la face basse de la botte flotte au-dessus du sol.
    // Compensation : baisser la botte de slopeSin × radius pour qu'elle repose sur le point le plus bas
    // de son empreinte circulaire. Formule approchée valide pour les pentes douces à modérées.
    if (kind === 'hay-bale') {
      const hayNormal  = getTerrainNormalAt(local, type, hashNumber(`${seed}:terrain:${i}`) % 97, {
        edgeLockStart: 0.98,
        edgeLockEnd:   1.0
      });
      const slopeSin   = Math.sqrt(Math.max(0, 1 - hayNormal.y * hayNormal.y));
      if (slopeSin > 0.02) {
        _propInstanceDummy.position.y -= slopeSin * (HAY_BALE_TARGET_WIDTH * 0.5 * jitter);
      }
    }

    // Correction Y par modèle : certains GLBs ont de la géométrie invisible (pivot, base)
    // sous la partie visuelle. groundOffsetDelta < 0 enfonce le modèle pour compenser.
    const modelGroundDelta = propGlbLibrary.get(variantKey)?.userData?.groundOffsetDelta ?? 0;
    if (modelGroundDelta !== 0) _propInstanceDummy.position.y += modelGroundDelta;

    _propInstanceDummy.scale.setScalar(jitter);
    _propInstanceDummy.updateMatrix();

    if (kind === 'rock') {
      registerPropHitbox(_propInstanceDummy.position.x, _propInstanceDummy.position.z, HITBOX_R.rockLarge);
    }

    if (!accumulator.has(variantKey)) accumulator.set(variantKey, new Map());
    const byChunk  = accumulator.get(variantKey);
    const chunkKey = getPropChunkKey(placedTile.q, placedTile.r);
    if (!byChunk.has(chunkKey)) byChunk.set(chunkKey, []);
    byChunk.get(chunkKey).push(_propInstanceDummy.matrix.clone());
  }
}

// ─── Décor des sections centrales (grass / forest) ───────────────────────────
// isSingleTerrainFootprint rejette les points de rayon < 0.28 → les centres n'ont
// aucun décor via le chemin normal. Cette fonction place les props directement dans
// le disque central (centerRadiusScale = 0.33) avec une vérification de distance simple.

function collectNaturalPropInstancesCenter(accumulator, placedTile, type) {
  const CENTER_MAX_RADIUS = HEX_SIZE * 0.27; // légèrement en-deçà de 0.33 — marge turbulence bords
  const tilePos = axialToWorld(placedTile.q, placedTile.r);

  for (const kind of ['flower', 'grass', 'brindille', 'mushroom', 'rock', 'shrub']) {
    // Règles de biome — identiques aux secteurs (shrub forêt uniquement, mushroom aussi)
    const chance = getNaturalPropChance(kind, type, null, null, null);
    const seed   = `${placedTile.key}:center:natural:${kind}`;
    if (hashUnit(seed) > chance) continue;

    // Count proportionnel : centre ≈ 11% de la surface totale ≈ 65% d'un secteur
    const sectorCount = getNaturalPropCount(kind, type, seed);
    const count = Math.max(1, Math.round(sectorCount * 0.27)); // centre ≈ 11% de la surface totale vs secteur ≈ 15%

    for (let i = 0; i < count; i++) {
      const angle    = hashUnit(`${seed}:angle:${i}`) * Math.PI * 2;
      const distance = Math.sqrt(hashUnit(`${seed}:dist:${i}`)) * CENTER_MAX_RADIUS;
      const local    = { x: Math.cos(angle) * distance, z: Math.sin(angle) * distance };

      if (Math.hypot(local.x, local.z) > CENTER_MAX_RADIUS) continue;

      const variantKey = pickNaturalPropVariant(kind, `${seed}:variant:${i}`, seed);
      if (!variantKey || !propGlbLibrary.has(variantKey)) continue;

      const yaw          = hashUnit(`${seed}:yaw:${i}`) * Math.PI * 2;
      const groundOffset = 0.000; // snap amène à surfaceY + clearance (= surfaceY + 0.004)

      _propInstanceDummy.rotation.set(0, 0, 0);
      _propInstanceDummy.position.set(tilePos.x + local.x, 0, tilePos.z + local.z);
      placeObjectOnTerrain(_propInstanceDummy, local, type, hashNumber(`${seed}:terrain:${i}`) % 97, {
        groundOffset,
        alignToSlope:     true,
        yaw,
        edgeLockStart:    0.98,
        edgeLockEnd:      1.0,
        normalSampleStep: HEX_SIZE * 0.012
      });

      if (kind === 'mushroom') {
        _propInstanceDummy.rotation.x += (hashUnit(`${seed}:mushleanx:${i}`) - 0.5) * 0.035;
        _propInstanceDummy.rotation.z += (hashUnit(`${seed}:mushleanz:${i}`) - 0.5) * 0.035;
      }

      // Snap sol — même logique que collectNaturalPropInstances
      if (kind === 'flower' || kind === 'brindille' || kind === 'grass' || kind === 'shrub' || kind === 'mushroom') {
        _snapNormal.set(0, 1, 0).applyQuaternion(_propInstanceDummy.quaternion);
        const slopeSin   = Math.sqrt(Math.max(0, 1 - _snapNormal.y * _snapNormal.y));
        const clearance  = getNaturalPropGroundClearance(kind);
        const halfTarget = kind === 'flower'    ? NATURAL_FLOWER_TARGET_WIDTH
                         : kind === 'brindille' ? NATURAL_BRINDILLE_TARGET_WIDTH
                         : kind === 'grass'     ? NATURAL_GRASS_TARGET_WIDTH
                         : kind === 'shrub'     ? NATURAL_SHRUB_TARGET_WIDTH
                                                : NATURAL_MUSHROOM_TARGET_WIDTH;
        const snapLift = (clearance - groundOffset) + slopeSin * (halfTarget * 0.5);
        if (snapLift > 0.0005) _propInstanceDummy.position.y += snapLift;
      }

      // Correction Y par modèle (même logique que le chemin secteur)
      const modelGroundDeltaC = propGlbLibrary.get(variantKey)?.userData?.groundOffsetDelta ?? 0;
      if (modelGroundDeltaC !== 0) _propInstanceDummy.position.y += modelGroundDeltaC;

      const jitter = getNaturalPropScaleJitter(kind, seed, i);
      _propInstanceDummy.scale.setScalar(jitter);
      _propInstanceDummy.updateMatrix();

      if (kind === 'rock') {
        registerPropHitbox(_propInstanceDummy.position.x, _propInstanceDummy.position.z, HITBOX_R.rockLarge);
      }

      if (!accumulator.has(variantKey)) accumulator.set(variantKey, new Map());
      const byChunk  = accumulator.get(variantKey);
      const chunkKey = getPropChunkKey(placedTile.q, placedTile.r);
      if (!byChunk.has(chunkKey)) byChunk.set(chunkKey, []);
      byChunk.get(chunkKey).push(_propInstanceDummy.matrix.clone());
    }
  }
}

// ─── Construction des InstancedMesh ──────────────────────────────────────────

function buildNaturalPropInstancedMeshes(group, accumulator) {
  for (const [variantKey, byChunk] of accumulator) {
    const prototype = propGlbLibrary.get(variantKey);
    if (!prototype) continue;

    // 'micro'  : fleurs, champignons            — cachés au-delà de LOD_MICRO_CULL_DISTANCE
    // 'plant'  : plantes.glb (plant-*, shrub-*), roseaux — LOD_PLANT_CULL_DISTANCE
    // 'rock'   : rochers, bottes de foin       — cachés au-delà de LOD_ROCK_CULL_DISTANCE
    // 'animal' : animaux sauvages (cerf, poule InstancedMesh) — LOD_ANIMAL_CULL_DISTANCE
    const lodCategory = variantKey.startsWith('animal-')
                      ? 'animal'
                      : (variantKey.startsWith('rock') || variantKey === 'hay-bale' || variantKey.startsWith('pile-de-bois')) ? 'rock'
                      : (variantKey.startsWith('plant-') || variantKey.startsWith('plante-') || variantKey.startsWith('shrub-') || variantKey === 'reed') ? 'plant'
                      : 'micro';

    // ── Pré-cuire les géométries UNE SEULE FOIS par variant (hors boucle chunks) ──
    // Évite N applyMatrix4() (un par chunk) → réduit à 1 par sous-mesh.
    prototype.updateMatrixWorld(true);
    const _bakedSubs = [];
    prototype.traverse(child => {
      if (!child.isMesh) return;
      child.updateWorldMatrix(true, false);
      const _bg = child.geometry.clone();
      _bg.applyMatrix4(child.matrixWorld);
      _bakedSubs.push({ _bg, child });
    });

    for (const [chunkKey, matrices] of byChunk) {
      if (matrices.length === 0) continue;
      const sphere = computePropBoundingSphere(matrices, 0.25);

      for (const { _bg, child } of _bakedSubs) {
        const geo = _bg.clone(); // clone rapide (sans applyMatrix4)

        const mat = Array.isArray(child.material)
          ? child.material.map(m => m.clone())
          : child.material.clone();

        const mesh = new THREE.InstancedMesh(geo, mat, matrices.length);
        // castShadow désactivé sur fleurs, plantes, rochers, petits animaux et champignons.
        // receiveShadow conservé sur rochers/plantes pour ne pas les aplatir visuellement.
        const noReceiveShadow = variantKey.startsWith('flower') || variantKey.startsWith('plant-') || variantKey.startsWith('plante-');
        const noCastShadow    = noReceiveShadow ||
          lodCategory === 'rock' || lodCategory === 'plant' || lodCategory === 'animal' ||
          variantKey === 'mushroom' || variantKey.startsWith('mushroom') ||
          variantKey === 'brindille'; // minuscule déco — aucune ombre
        mesh.castShadow    = !noCastShadow;
        mesh.receiveShadow = !noReceiveShadow;
        if (noCastShadow) {
          // Verrouiller : applySceneShadowFlags ne doit pas réactiver ces ombres
          mesh.userData.disableCastShadow  = true;
          mesh.userData.shadowFlagsApplied = true;
        }
        // frustumCulled = false : géo cuite à l'origine. Culling manuel via updateNaturalPropsLOD().
        mesh.frustumCulled = false;
        mesh.name          = `instanced-prop-${variantKey}-${chunkKey}`;
        mesh.userData.worldBoundingSphere = sphere;
        mesh.userData.lodCategory         = lodCategory;

        for (let i = 0; i < matrices.length; i++) {
          mesh.setMatrixAt(i, matrices[i]);
        }
        mesh.instanceMatrix.needsUpdate = true;
        group.add(mesh);
      }
    }
    // Dispose les géos pré-cuites (chaque chunk a sa propre copie)
    for (const { _bg } of _bakedSubs) _bg.dispose();
  }
}

// ─── Helpers props naturels ───────────────────────────────────────────────────

function addNaturalPropCluster(group, placedTile, edge, type, kind, placedTiles) {
  const seed   = `${placedTile.key}:natural:${kind}:${edge}`;
  const chance = getNaturalPropChance(kind, type, placedTile, edge, placedTiles);
  if (hashUnit(seed) > chance) return;

  const count        = getNaturalPropCount(kind, type, seed, placedTile, edge, placedTiles);
  const centerLocal  = getNaturalSectorPoint(edge, `${seed}:cluster-center`);
  const clusterRadius = getNaturalClusterRadius(kind);

  for (let i = 0; i < count; i += 1) {
    const local         = getNaturalClusterPoint(edge, centerLocal, `${seed}:point:${i}`, clusterRadius);
    const footprintRadius = getNaturalPropFootprint(kind);
    if (!isSingleTerrainFootprint(local, placedTile, type, footprintRadius)) continue;

    const key  = pickNaturalPropVariant(kind, `${seed}:variant:${i}`, seed);
    const prop = createPropModel(key, `${seed}:model:${i}`);
    if (!prop) continue;

    const tilePos = axialToWorld(placedTile.q, placedTile.r);
    prop.name = `${type}-${kind}-ambient-glb`;
    prop.position.set(tilePos.x + local.x, 0, tilePos.z + local.z);
    const yaw         = hashUnit(`${seed}:yaw:${i}`) * Math.PI * 2;
    const groundOffset = kind === 'flower' ? 0.006 : (kind === 'reed' ? 0.010 : (kind === 'mushroom' ? 0.004 : 0.000));
    const surfaceY = placeObjectOnTerrain(prop, local, type, hashNumber(`${seed}:terrain:${i}`) % 97, {
      groundOffset,
      alignToSlope:    kind !== 'reed' && kind !== 'hay-bale' && kind !== 'pile-de-bois',
      yaw,
      edgeLockStart:   0.98,
      edgeLockEnd:     1.0,
      normalSampleStep: HEX_SIZE * 0.012
    }) - groundOffset;

    const jitter = getNaturalPropScaleJitter(kind, seed, i);
    prop.scale.multiplyScalar(jitter);
    if (kind === 'rock' && isNearWaterDecorArea(placedTile, edge, placedTiles)) {
      prop.scale.multiplyScalar(1.22 + hashUnit(`${seed}:shore-rock-scale:${i}`) * 0.36);
    }
    if (kind === 'reed') {
      prop.rotation.x += (hashUnit(`${seed}:leanx:${i}`) - 0.5) * 0.10;
      prop.rotation.z += (hashUnit(`${seed}:leanz:${i}`) - 0.5) * 0.10;
    }
    if (kind === 'mushroom') {
      prop.rotation.x += (hashUnit(`${seed}:mushleanx:${i}`) - 0.5) * 0.035;
      prop.rotation.z += (hashUnit(`${seed}:mushleanz:${i}`) - 0.5) * 0.035;
    }

    snapPropBottomToSurface(prop, surfaceY, getNaturalPropGroundClearance(kind));
    // Orientation perpendiculaire à la surface courbée (mode bouliste)
    getCurvatureTiltQuaternion(tilePos.x + local.x, tilePos.z + local.z, _npCurvQuat);
    prop.quaternion.premultiply(_npCurvQuat);
    group.add(prop);
  }
}

function getNaturalPropChance(kind, type, placedTile, edge, placedTiles) {
  const nearWater = placedTile && edge && placedTiles && isNearWaterDecorArea(placedTile, edge, placedTiles);
  if (kind === 'flower')    return type === EDGE_TYPES.grass ? 1.0 : 0.96;
  // Prairie (grass/field) et forêt partagent les mêmes règles pour l'instant.
  // Quand les règles divergent : brancher ici sur type (EDGE_TYPES.forest vs grass/field).
  if (kind === 'brindille') return (type === EDGE_TYPES.grass || type === EDGE_TYPES.field || type === EDGE_TYPES.forest) ? 0.82 : 0;
  if (kind === 'grass')     return (type === EDGE_TYPES.grass || type === EDGE_TYPES.field || type === EDGE_TYPES.forest) ? 0.82 : 0;
  if (kind === 'shrub')         return type === EDGE_TYPES.forest ? 0.93 : 0; // fougères/buissons — forêt uniquement, priorité haute
  if (kind === 'pile-de-bois') return type === EDGE_TYPES.forest ? 0.50 : 0; // piles de bois — forêt uniquement
  if (kind === 'deer') {
    // Rare — 1 cerf par ~10 secteurs forêt, ~15 prairie, ~20 champ
    if (type === EDGE_TYPES.forest) return 0.10;
    if (type === EDGE_TYPES.grass)  return 0.07;
    if (type === EDGE_TYPES.field)  return 0.05;
    return 0;
  }
  if (kind === 'rock')     return nearWater ? ROCK_DENSITY.chanceNearWater : (type === EDGE_TYPES.grass ? ROCK_DENSITY.chanceGrass : ROCK_DENSITY.chanceForest);
  if (kind === 'reed')     return nearWater ? 1.0 : (type === EDGE_TYPES.grass ? 0.12 : 0.08);
  if (kind === 'mushroom') return type === EDGE_TYPES.forest ? 1.0 : 0.82;
  if (kind === 'hay-bale') {
    if (type === EDGE_TYPES.field) return 0.315;
    if (type === EDGE_TYPES.grass && isGrassAdjacentToField(placedTile, edge, placedTiles)) return 0.200;
    return 0;
  }
  return 0;
}

function getNaturalPropCount(kind, type, seed, placedTile = null, edge = null, placedTiles = null) {
  const nearWater = placedTile && edge && placedTiles && isNearWaterDecorArea(placedTile, edge, placedTiles);
  if (kind === 'flower') {
    return type === EDGE_TYPES.grass
      ? 150 + Math.floor(hashUnit(`${seed}:count`) * 137) // +15% (moy 190→218)
      :  40 + Math.floor(hashUnit(`${seed}:count`) *  40); // +15% (moy 52→60)
  }
  // Brindilles — kind séparé pour densité indépendante
  if (kind === 'brindille') return 42 + Math.floor(hashUnit(`${seed}:count`) * 31); // +28% (moy 45→57.5)
  // Prairie et forêt : plantes.glb uniquement — différencier ici sur type quand besoin.
  if (kind === 'grass') return 385 + Math.floor(hashUnit(`${seed}:count`) * 156); // +17% (moy 396→463)
  if (kind === 'shrub') return 19 + Math.floor(hashUnit(`${seed}:count`) * 22);   // +16% (moy 25.5→30)
  if (kind === 'deer')    return 1; // toujours 1 seul cerf par cluster
  if (kind === 'rock') {
    return (nearWater || type === EDGE_TYPES.grass)
      ? 5 + Math.floor(hashUnit(`${seed}:count`) * 11)  // +15% (moy 9→10.5)
      : 4 + Math.floor(hashUnit(`${seed}:count`) *  8); // +15% (moy 7→8)
  }
  if (kind === 'reed') {
    return nearWater
      ? 10 + Math.floor(hashUnit(`${seed}:count`) * 8)  // +10% (moy 12.5→14)
      :  4 + Math.floor(hashUnit(`${seed}:count`) * 6); // +10% (moy 6.5→7)
  }
  if (kind === 'mushroom') return 29 + Math.floor(hashUnit(`${seed}:count`) * 48); // +14% (moy 46.5→53)
  if (kind === 'hay-bale')     return 1; // 1 botte par cluster
  if (kind === 'pile-de-bois') return 1 + Math.floor(hashUnit(`${seed}:count`) * 2); // moy 1.5 par cluster
  return 1;
}

function getNaturalPropFootprint(kind) {
  if (kind === 'flower')    return HEX_SIZE * 0.036;
  if (kind === 'brindille') return HEX_SIZE * 0.038;
  if (kind === 'grass')     return HEX_SIZE * 0.042;
  if (kind === 'shrub')    return HEX_SIZE * 0.060;
  if (kind === 'deer')     return HEX_SIZE * 0.10;
  if (kind === 'rock')     return HEX_SIZE * ROCK_DENSITY.footprint;
  if (kind === 'mushroom') return HEX_SIZE * 0.024;
  if (kind === 'reed')     return HEX_SIZE * 0.026;
  if (kind === 'hay-bale')     return HEX_SIZE * 0.080;
  if (kind === 'pile-de-bois') return HEX_SIZE * 0.090;
  return HEX_SIZE * 0.042;
}

function getNaturalPropGroundClearance(kind) {
  // Clearance = offset final au-dessus de la surface (résultat snap = surfaceY + clearance).
  // Rochers : 0 mm, ras du sol. Brindilles : 10 mm (fougère.glb a une base plus épaisse).
  if (kind === 'rock')      return 0.000;
  if (kind === 'brindille') return 0.010;
  return 0.004;
}

function getNaturalPropScaleJitter(kind, seed, index) {
  const roll = hashUnit(`${seed}:scale:${index}`);
  if (kind === 'flower')    return 0.66 + roll * 0.62;
  if (kind === 'brindille') return 0.68 + roll * 0.58;
  if (kind === 'grass')     return 0.70 + roll * 0.55;
  if (kind === 'shrub')    return 0.72 + roll * 0.60; // variation plus large — buissons très hétérogènes
  if (kind === 'rock') {
    const bigRoll = hashUnit(`${seed}:bigrock:${index}`);
    if (bigRoll > ROCK_DENSITY.bigRockThreshold) {
      return ROCK_DENSITY.bigRockScaleMin + roll * ROCK_DENSITY.bigRockScaleRange;
    }
    return ROCK_DENSITY.normalScaleMin + roll * ROCK_DENSITY.normalScaleRange;
  }
  if (kind === 'deer')     return 0.80 + roll * 0.40;
  if (kind === 'mushroom') return 0.72 + roll * 0.58;
  if (kind === 'hay-bale')     return 0.85 + roll * 0.30;
  if (kind === 'pile-de-bois') return 0.80 + roll * 0.35;
  return 0.86 + roll * 0.26;
}

function getNaturalClusterRadius(kind) {
  if (kind === 'deer')      return HEX_SIZE * 0.36;
  if (kind === 'flower')    return HEX_SIZE * 0.74; // +20% (plus épars et disséminés)
  if (kind === 'brindille') return HEX_SIZE * 0.56; // brindilles légèrement plus étalées
  if (kind === 'grass')     return HEX_SIZE * 0.60; // rayon viable : clusters épars sans fallback systématique
  if (kind === 'shrub')    return HEX_SIZE * 0.49; // +11%
  if (kind === 'mushroom') return HEX_SIZE * 0.19; // +46% (colonies plus dispersées)
  if (kind === 'reed')     return HEX_SIZE * 0.24; // +50% (roseaux plus dispersés)
  if (kind === 'hay-bale')     return HEX_SIZE * 0.22;
  if (kind === 'pile-de-bois') return HEX_SIZE * 0.22;
  return HEX_SIZE * 0.150;
}

function pickNaturalPropVariant(kind, seed, clusterSeed = null) {
  const variants = NATURAL_DECOR_VARIANTS[kind] ?? [];
  if (variants.length === 0) return null;

  // Champignons : clustering par type dominant (80% même couleur par colonie, 20% mélange)
  if (kind === 'mushroom' && clusterSeed && variants.length > 1) {
    const dominantIdx = Math.floor(hashUnit(`${clusterSeed}:mushroom-dominant`) * variants.length) % variants.length;
    return hashUnit(seed) < 0.80
      ? variants[dominantIdx]
      : variants[Math.floor(hashUnit(`${seed}:alt`) * variants.length) % variants.length];
  }

  // Plantes (grass) : même logique — 75% même espèce dans le paquet, 25% variante
  if (kind === 'grass' && clusterSeed && variants.length > 1) {
    const dominantIdx = Math.floor(hashUnit(`${clusterSeed}:grass-dominant`) * variants.length) % variants.length;
    return hashUnit(seed) < 0.75
      ? variants[dominantIdx]
      : variants[Math.floor(hashUnit(`${seed}:alt`) * variants.length) % variants.length];
  }

  return variants[Math.floor(hashUnit(seed) * variants.length) % variants.length];
}

function getNaturalSectorPoint(edge, seed) {
  const sector = SECTOR_BY_KEY[edge];
  const a = getHexVertex(sector.a);
  const b = getHexVertex(sector.b);
  const edgeBias = 0.46 + hashUnit(`${seed}:edge-bias`) * 0.34;
  const side     = (hashUnit(`${seed}:side`) - 0.5) * 0.42;
  const mid      = { x: (a.x + b.x) * 0.5, z: (a.z + b.z) * 0.5 };
  const tangent  = normalize2(b.x - a.x, b.z - a.z);
  return {
    x: mid.x * edgeBias + tangent.x * side * HEX_SIZE,
    z: mid.z * edgeBias + tangent.z * side * HEX_SIZE
  };
}

function getNaturalClusterPoint(edge, center, seed, radius) {
  if (!radius || radius <= 0) return center;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const angle    = hashUnit(`${seed}:cluster-angle:${attempt}`) * Math.PI * 2;
    const distance = Math.sqrt(hashUnit(`${seed}:cluster-distance:${attempt}`)) * radius;
    const local    = {
      x: center.x + Math.cos(angle) * distance,
      z: center.z + Math.sin(angle) * distance
    };
    if (getEdgeFromLocalPoint(local) === edge) return local;
  }

  return center;
}

// Retourne true si un secteur 'grass' est directement adjacent (même tuile ou voisine) à un secteur 'field'.
// Permet de placer des bottes de foin dans une prairie bordant un champ.
function isGrassAdjacentToField(placedTile, edge, placedTiles) {
  const idx = EDGE_ORDER.indexOf(edge);
  const n   = EDGE_ORDER.length;
  // Secteurs voisins sur la même tuile
  if (getTileEdgeType(placedTile, EDGE_ORDER[(idx - 1 + n) % n]) === EDGE_TYPES.field) return true;
  if (getTileEdgeType(placedTile, EDGE_ORDER[(idx + 1) % n])       === EDGE_TYPES.field) return true;
  // Tuile voisine face à ce secteur
  const direction = DIRECTION_BY_EDGE[edge];
  if (!direction) return false;
  const neighbor = placedTiles.get(makeHexKey(placedTile.q + direction.q, placedTile.r + direction.r));
  if (neighbor && getTileEdgeType(neighbor, getOppositeEdge(edge)) === EDGE_TYPES.field) return true;
  return false;
}

function isNearWaterDecorArea(placedTile, edge, placedTiles) {
  if (isShoreDecorEdge(placedTile, edge, placedTiles)) return true;

  for (const candidateEdge of EDGE_ORDER) {
    if (getTileEdgeType(placedTile, candidateEdge) === EDGE_TYPES.water) return true;

    const direction = DIRECTION_BY_EDGE[candidateEdge];
    const neighbor  = placedTiles.get(makeHexKey(placedTile.q + direction.q, placedTile.r + direction.r));
    if (!neighbor) continue;
    if (getTileEdgeType(neighbor, getOppositeEdge(candidateEdge)) === EDGE_TYPES.water) return true;
    if ((neighbor.tile.center ?? null) === EDGE_TYPES.water) return true;
    if (EDGE_ORDER.some(ne => getTileEdgeType(neighbor, ne) === EDGE_TYPES.water)) return true;
  }

  return false;
}

function isShoreDecorEdge(placedTile, edge, placedTiles) {
  const type = getTileEdgeType(placedTile, edge);
  if (!isSafePropGroundType(type)) return false;
  const direction = DIRECTION_BY_EDGE[edge];
  const neighbor  = placedTiles.get(makeHexKey(placedTile.q + direction.q, placedTile.r + direction.r));
  return neighbor && getTileEdgeType(neighbor, getOppositeEdge(edge)) === EDGE_TYPES.water;
}
