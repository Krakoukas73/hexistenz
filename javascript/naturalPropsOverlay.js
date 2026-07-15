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
import { scaledCount } from './contentDensity.js';
import { registerPropHitbox } from './propHitboxRegistry.js';
import { getHexVertex, normalize2 } from './hexGeometry.js';
import {
  snapPropBottomToSurface,
  isSingleTerrainFootprint,
  isSafePropGroundType,
  getEdgeFromLocalPoint,
  GROUND_CLEARANCE
} from './propPlacement.js';
// Import circulaire résolu via live bindings ES modules — uniquement dans des corps de fonctions.
import {
  propGlbLibrary,
  _propInstanceDummy,
  getPropChunkKey,
  computePropBoundingSphere,
  createPropModel,
  NATURAL_DECOR_VARIANTS,
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
    // Roseaux : pas de snap → groundOffset direct = GROUND_CLEARANCE (formule unique, cf. plus bas).
    const groundOffset = kind === 'reed' ? GROUND_CLEARANCE : 0.000;

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

    // Formule unique (2026-07-04) : biomes strictement plats → pas de pente à compenser
    // (l'ancien terme slopeSin × rayon était déjà mathématiquement nul en pratique, juste de
    // la complexité inutile qui a fini par introduire des bugs). Un seul clearance fixe,
    // identique pour tous les kinds et tous les biomes — cf. GROUND_CLEARANCE (propPlacement.js).
    if (kind === 'flower' || kind === 'brindille' || kind === 'grass' || kind === 'shrub' || kind === 'mushroom' || kind === 'deer') {
      const snapLift = GROUND_CLEARANCE - groundOffset;
      if (snapLift > 0.00001) _propInstanceDummy.position.y += snapLift;
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
      const groundOffset = 0.000; // snap amène à surfaceY + GROUND_CLEARANCE (formule unique)

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

      // Snap sol — formule unique (cf. commentaire collectNaturalPropInstances) : biome plat,
      // pas de pente, un seul clearance fixe (GROUND_CLEARANCE).
      if (kind === 'flower' || kind === 'brindille' || kind === 'grass' || kind === 'shrub' || kind === 'mushroom') {
        const snapLift = GROUND_CLEARANCE - groundOffset;
        if (snapLift > 0.00001) _propInstanceDummy.position.y += snapLift;
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
    // 'plant'  : plantes.glb (plant-*, shrub-*), roseaux, baies — LOD_PLANT_CULL_DISTANCE
    // 'rock'   : rochers, bottes de foin       — cachés au-delà de LOD_ROCK_CULL_DISTANCE
    // 'animal' : animaux sauvages (cerf, poule InstancedMesh) — LOD_ANIMAL_CULL_DISTANCE
    //
    // 2026-07-06 — 'berry-*' tombait par défaut dans 'micro' (LOD_MICRO_CULL_DISTANCE=5.9u),
    // alors que LOD_PLANT_CULL_DISTANCE=4.3u est PLUS SERRÉ (4.3 < 5.9 < 6.5 rock) — les baies
    // gardaient donc un rayon de visibilité plus généreux que les autres plantes/buissons, alors
    // que le profil GPU (2026-07-06) montre "Plantes à baies" = 27.6% des triangles scène, de
    // très loin le premier poste (pool 'grass' dominé à 71% par les 6 variantes berry-*, cf.
    // decorOverlay.js NATURAL_DECOR_VARIANTS). Reclassées ici en 'plant' : rayon de cull
    // −27% (aire visible ≈ −47%) sans changer la densité proche caméra ni le pool de spawn.
    const lodCategory = variantKey.startsWith('animal-')
                      ? 'animal'
                      : (variantKey.startsWith('rock') || variantKey === 'hay-bale' || variantKey.startsWith('pile-de-bois')) ? 'rock'
                      : (variantKey.startsWith('plant-') || variantKey.startsWith('plante-') || variantKey.startsWith('shrub-') || variantKey === 'reed' || variantKey.startsWith('berry-')) ? 'plant'
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
        // 'berry-' oublié ici (2026-07-04, bug HUD FPS) : lodCategory='micro' pour les baies
        // (pas 'plant', cf. buildNaturalPropInstancedMeshes) et le nom ne matche aucun des
        // préfixes ci-dessous → castShadow=true par défaut, sans jamais être visible en jeu
        // (silhouette trop fine/alpha-testée pour la shadow map) — coût GPU pur pour rien.
        const noReceiveShadow = variantKey.startsWith('flower') || variantKey.startsWith('plant-') || variantKey.startsWith('plante-') || variantKey.startsWith('berry-');
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
// addNaturalPropCluster supprimée le 2026-07-11 (code mort confirmé par grep sur
// tout le dépôt, cf. CONTEXT.md §21) : plus aucun appelant. Les helpers ci-dessous
// (getNaturalPropChance, etc.) restent utilisés par d'autres fonctions du fichier.

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
  // scaledCount(...) : réduit par le réglage de densité de contenu (qualité/FPS).
  // Les singletons (cerf, botte) restent à 1 (non scalés).
  if (kind === 'flower') {
    return scaledCount(type === EDGE_TYPES.grass
      ? 83 + Math.floor(hashUnit(`${seed}:count`) * 76) // −15% (2026-07-04) −35% (2026-07-04 perf, était +15% moy 190→218, désormais moy ~142)
      : 22 + Math.floor(hashUnit(`${seed}:count`) * 22)); // −15% (2026-07-04) −35% (2026-07-04 perf, était +15% moy 52→60, désormais moy ~39)
  }
  // Brindilles — kind séparé pour densité indépendante
  if (kind === 'brindille') return scaledCount(42 + Math.floor(hashUnit(`${seed}:count`) * 31)); // +28% (moy 45→57.5)
  // Prairie et forêt : plantes.glb uniquement — différencier ici sur type quand besoin.
  if (kind === 'grass') return scaledCount(132 + Math.floor(hashUnit(`${seed}:count`) * 54)); // −12% (2026-07-04, perf triangles "plantes à baies" — était 150+61, moy ~180→~159) −12% (était 170+69, moy ~205→~180) −20% (était 213+86, moy ~256→~205) −15% (2026-07-04, "autres plantes") −35% (2026-07-04 perf : pool "grass" dominé à 70% par les baies, gros poste triangles GPU) — était +17% (moy 396→463), désormais moy ~300
  if (kind === 'shrub') return scaledCount(16 + Math.floor(hashUnit(`${seed}:count`) * 19));   // −15% (2026-07-04, "autres plantes") +16% (moy 25.5→30)
  if (kind === 'deer')    return 1; // toujours 1 seul cerf par cluster
  if (kind === 'rock') {
    return scaledCount((nearWater || type === EDGE_TYPES.grass)
      ? 5 + Math.floor(hashUnit(`${seed}:count`) * 11)  // +15% (moy 9→10.5)
      : 4 + Math.floor(hashUnit(`${seed}:count`) *  8)); // +15% (moy 7→8)
  }
  if (kind === 'reed') {
    return scaledCount(nearWater
      ? 10 + Math.floor(hashUnit(`${seed}:count`) * 8)  // +10% (moy 12.5→14)
      :  4 + Math.floor(hashUnit(`${seed}:count`) * 6)); // +10% (moy 6.5→7)
  }
  if (kind === 'mushroom') return scaledCount(16 + Math.floor(hashUnit(`${seed}:count`) * 26)); // −15% (2026-07-04) −35% (2026-07-04 perf, était +14% moy 46.5→53, désormais moy ~34.5)
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
  // Formule unique (2026-07-04) : un seul clearance fixe pour tout le monde (GROUND_CLEARANCE,
  // propPlacement.js). Rochers : 0, ras du sol (inchangé, volontaire).
  return kind === 'rock' ? 0.000 : GROUND_CLEARANCE;
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
  if (kind === 'deer')     return 0.68 + roll * 0.34; // −15 % depuis [0.80, 1.20] (2026-07-13)
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
