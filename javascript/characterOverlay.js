/**
 * characterOverlay.js — Peuplement des villages et forêts avec des personnages GLB.
 *
 * Pool de 22 personnages (/glb/characters/), répartis en trois groupes :
 *   - VILLAGE_CHARACTER_KEYS  (15) : civils, artisans, gardes — ancrés à une arête maison
 *     réelle de la tuile, dispersés dans son secteur angulaire (voir randomPointInSector).
 *   - FOREST_CHARACTER_KEYS   (7)  : rôdeurs, aventuriers isolés — ancrés à une arête forêt
 *     réelle de la tuile, dispersés dans son secteur angulaire.
 *     Plusieurs essais indépendants par arête, proportionnels à sa densité d'arbres
 *     (getEdgeValue) — voir FOREST_CHARACTER_SLOT_CHANCE.
 *   - character-fermier, en plus de sa présence en village : apparaît aussi dans les champs
 *     de blé (EDGE_TYPES.field), ancré au secteur champ.
 *
 * 2026-07-06 — Instancing (InstancedMesh par variant × chunk), même patron que
 * houseOverlay.js (378→62 dc / 135→22 casters sur les maisons, cf. mémoire projet).
 * Avant ce changement : ~227 personnages posés = ~227 clones GLB individuels
 * (createPropModel, cloneSkeleton + hiérarchie complète), chacun 1-2 draw calls et 1
 * shadow caster propre, JAMAIS soumis à un LOD par distance (contrairement à tous les
 * autres props) — coût GPU fixe quel que soit l'éloignement caméra. Les personnages sont
 * statiques (aucune animation : createPropModel convertit les SkinnedMesh sans clip en
 * Mesh ordinaire, cf. decorOverlay.js `_convertStaticSkinnedMeshesToMesh`), donc de
 * excellents candidats à l'instancing — même géométrie/matériau partagés par variante,
 * seule la matrice (position/rotation/échelle) change par instance.
 *
 * Placement (calcul des matrices) : logique de dispersion par secteur inchangée
 * (randomPointInSector, seeds identiques) — seul le résultat change : au lieu de créer
 * un clone GLB et de l'ajouter à un Group, on calcule directement la Matrix4 finale et on
 * l'accumule dans accumulator (Map variantKey → Map chunkKey → Matrix4[]), consommée par
 * buildCharacterInstancedMeshes(). Le calage au sol (bottom-snap) qu'effectuait
 * snapPropBottomToSurface() sur un clone réel est reproduit sans instancier de modèle via
 * getCharacterBottomOffset() : le bas du modèle en espace local du prototype (wrapper
 * normalisé par preparePropPrototype, decorOverlay.js — bottom déjà proche de Y=0) est
 * mesuré UNE FOIS par variante puis mis à l'échelle du jitter d'instance (une rotation Y
 * pure et une mise à l'échelle autour de l'origine locale ne changent pas cette relation).
 *
 * Import circulaire avec decorOverlay (propGlbLibrary, getPropChunkKey,
 * computePropBoundingSphere) — valide en ES modules car tous les accès croisés se font
 * dans des corps de fonctions (même pattern que villageDecorOverlay.js/naturalPropsOverlay.js).
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { EDGE_ORDER, EDGE_TYPES, HEX_SIZE, TILE_VISUAL, LOD_CHARACTER_CULL_DISTANCE } from './config.js';
import { hashUnit10k as hashUnit, hashNumber } from './hashUtils.js';
import { axialToWorld } from './hex.js';
import { getTileEdgeType, getTileCenterType } from './tileUtils.js';
import { getEdgeValue } from './tileGenerator.js';
import { getTerrainSurfaceY } from './terrainHeight.js';
import { getTileLocalPoint, getEdgeFromLocalPoint, GROUND_CLEARANCE } from './propPlacement.js';
import { isInsideSpecialBuildingSafeZone, collectSpecialBuildingSafeZones } from './fieldZonesOverlay.js';
// Import circulaire résolu via live bindings ES modules — uniquement dans des corps de fonctions.
import { propGlbLibrary, getPropChunkKey, computePropBoundingSphere } from './decorOverlay.js';

// ─── Pools de personnages ──────────────────────────────────────────────────────

export const VILLAGE_CHARACTER_KEYS = [
  'character-femme-1', 'character-femme-2', 'character-femme-3', 'character-femme-4', 'character-femme-5',
  'character-homme-1', 'character-homme-2', 'character-homme-3',
  'character-fermier', 'character-forgeron', 'character-marchand', 'character-tavernier',
  'character-garde', 'character-soldat', 'character-chevalier'
];

export const FOREST_CHARACTER_KEYS = [
  'character-archer', 'character-guerrier-1', 'character-guerrier-2', 'character-guerrier-3',
  'character-magicien', 'character-monk', 'character-sorciere'
];

// ─── Densité (calibrable) ───────────────────────────────────────────────────────

// Roll cumulatif par tuile village : < NONE → 0, < +ONE → 1, < +TWO → 2, < +THREE → 3, sinon 4.
const VILLAGE_CHARACTER_NONE_CHANCE  = 0.05;
const VILLAGE_CHARACTER_ONE_CHANCE   = 0.20;
const VILLAGE_CHARACTER_TWO_CHANCE   = 0.35;
const VILLAGE_CHARACTER_THREE_CHANCE = 0.25;
// (reste 0.15 → 4)

// Forêt : plusieurs essais par arête, proportionnels à sa densité d'arbres réelle (même
// getEdgeValue que forestOverlay.js — 1 à 6 arbres/arête). Chance par essai indépendant.
const FOREST_CHARACTER_SLOT_CHANCE = 0.55;

// Champs de blé : roll par tuile-champ, 1 ou 2 fermiers, ancré à une arête champ réelle.
const FIELD_FARMER_CHANCE       = 0.55;
const FIELD_FARMER_TWO_FRACTION = 0.35;

// ─── Dispersion ancrée à un secteur ───────────────────────────────────────────────
// Les personnages n'ont pas de hitbox et n'ont donc pas besoin de rester dans la "cour"
// (pull vers le centre depuis un secteur) utilisée par fontaines/charrettes/tonneaux/meule.
// Variante ANCRÉE à un secteur précis (dispersion libre — angle+rayon aléatoires — mais
// restreinte au coin angulaire de 60° de ce secteur).
function randomPointInSector(tilePos, seed, edge, minRadius, maxRadius, wedgeMargin = 0.85) {
  const index       = EDGE_ORDER.indexOf(edge);
  const centerAngle = index * (Math.PI / 3);
  const angle        = centerAngle + (hashUnit(`${seed}:angle`) - 0.5) * (Math.PI / 3) * wedgeMargin;
  const radius       = (minRadius + hashUnit(`${seed}:radius`) * (maxRadius - minRadius)) * HEX_SIZE;
  return new THREE.Vector3(
    tilePos.x + Math.cos(angle) * radius,
    0,
    tilePos.z + Math.sin(angle) * radius
  );
}

// ─── Pré-alloués (évitent les allocations par instance/frame) ─────────────────────
const _charInstanceDummy = new THREE.Object3D();
const _charLodFrustum     = new THREE.Frustum();
const _charLodMatrix      = new THREE.Matrix4();

// ─── Calage au sol sans instancier de modèle réel ─────────────────────────────────
// Reproduit le résultat de snapPropBottomToSurface() (propPlacement.js) sans cloner de
// GLB : le prototype (propGlbLibrary) est déjà normalisé par preparePropPrototype
// (decorOverlay.js) avec son bas proche de Y=0 dans son espace local. Une rotation
// purement autour de Y ne change AUCUNE coordonnée Y d'un vertex, et une mise à l'échelle
// autour de l'origine locale (0,0,0) — qui EST le bas du modèle — laisse le bas au même Y
// relatif : donc offset(instance) = scaleInstance × offset(prototype), mesuré une seule
// fois par variante plutôt qu'à chaque placement.
const _characterBottomOffsetCache = new Map(); // key → number (Box3.min.y du prototype)

function getCharacterBottomOffset(key) {
  if (_characterBottomOffsetCache.has(key)) return _characterBottomOffsetCache.get(key);
  const prototype = propGlbLibrary.get(key);
  if (!prototype) return 0;
  prototype.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(prototype);
  const offset = Number.isFinite(box.min.y) ? box.min.y : 0;
  _characterBottomOffsetCache.set(key, offset);
  return offset;
}

// ─── Géométrie/matériaux cuits une seule fois par variante ────────────────────────
// Même patron que getHouseBakedSubmeshes (houseVillageObjects.js) : mis en cache,
// jamais reconstruit entre deux rebuilds (arithmétique pure ensuite, comme pour les
// maisons — plus aucun clone(true) de hiérarchie GLB par personnage posé).
const _characterBakedSubsCache = new Map(); // key → [{ geometry, material, castShadowOriginal }] | null

function getCharacterBakedSubmeshes(key) {
  if (_characterBakedSubsCache.has(key)) return _characterBakedSubsCache.get(key);

  const prototype = propGlbLibrary.get(key);
  if (!prototype) return null;

  prototype.updateMatrixWorld(true);
  const meshes = [];
  prototype.traverse(child => { if (child.isMesh) meshes.push(child); });

  // Un seul sous-mesh caste une ombre par variante — le plus gros par nombre de triangles,
  // même principe que _applySingleShadowCaster (decorOverlay.js), appliqué ici une seule
  // fois sur le prototype (silhouette identique pour toutes les instances de cette variante)
  // plutôt qu'à chaque clone individuel.
  let biggest = null, biggestTris = -1;
  for (const m of meshes) {
    const geom = m.geometry;
    const tris = geom.index ? geom.index.count / 3 : (geom.attributes?.position?.count ?? 0) / 3;
    if (tris > biggestTris) { biggestTris = tris; biggest = m; }
  }

  const subs = meshes.map(child => {
    child.updateWorldMatrix(true, false);
    const geometry = child.geometry.clone();
    geometry.applyMatrix4(child.matrixWorld);
    return {
      geometry,
      material: child.material,
      castShadowOriginal: child === biggest
    };
  });

  _characterBakedSubsCache.set(key, subs);
  return subs;
}

// ─── Accumulation des instances (remplace le placement par clone GLB) ─────────────

/**
 * Calcule la matrice finale d'un personnage et l'accumule dans `accumulator`
 * (Map variantKey → Map chunkKey → Matrix4[]). Reproduit le rejet terrain (eau/rail)
 * et le calage sol de l'ancien placeCharacterOnTerrain, sans jamais cloner de GLB.
 */
function accumulateCharacterInstance(accumulator, key, seed, pos, placedTile, chunkKey) {
  if (!propGlbLibrary.has(key)) return;

  const local = getTileLocalPoint(pos, placedTile);
  const localRadius  = Math.hypot(local.x, local.z) / HEX_SIZE;
  const isCenterZone = localRadius <= (TILE_VISUAL.centerRadiusScale ?? 0.33);
  const edge = isCenterZone ? null : getEdgeFromLocalPoint(local);
  const type = isCenterZone ? getTileCenterType(placedTile) : (edge ? getTileEdgeType(placedTile, edge) : null);
  if (type == null || type === EDGE_TYPES.water || type === EDGE_TYPES.rail) return;

  const yaw           = hashUnit(`${seed}:yaw`) * Math.PI * 2;
  // Reproduit le petit jitter de rotation Y ajouté par createPropModel (base-yaw) —
  // n'affecte aucune coordonnée Y (rotation pure autour de Y), donc sans effet sur le calage sol.
  const baseYawJitter  = (hashUnit(`${seed}:base-yaw`) - 0.5) * 0.16;
  const surfaceY       = getTerrainSurfaceY(local, type, hashNumber(seed) % 97, { edgeLockStart: 0.98, edgeLockEnd: 1.0 });
  const scaleJitter    = 0.90 + hashUnit(`${seed}:scale`) * 0.20;
  const bottomOffset   = getCharacterBottomOffset(key);
  const posY           = surfaceY + GROUND_CLEARANCE - scaleJitter * bottomOffset;

  _charInstanceDummy.position.set(pos.x, posY, pos.z);
  _charInstanceDummy.rotation.set(0, yaw + baseYawJitter, 0);
  _charInstanceDummy.scale.setScalar(scaleJitter);
  _charInstanceDummy.updateMatrix();

  if (!accumulator.has(key)) accumulator.set(key, new Map());
  const byChunk = accumulator.get(key);
  if (!byChunk.has(chunkKey)) byChunk.set(chunkKey, []);
  byChunk.get(chunkKey).push(_charInstanceDummy.matrix.clone());
}

// ─── Villageois ─────────────────────────────────────────────────────────────────

function accumulateVillageCharacters(accumulator, placedTiles, specialBuildingSafeZones) {
  for (const placedTile of placedTiles.values()) {
    const tilePos    = axialToWorld(placedTile.q, placedTile.r);
    const houseEdges = EDGE_ORDER.filter(e => getTileEdgeType(placedTile, e) === EDGE_TYPES.house);
    if (houseEdges.length === 0) continue;
    const chunkKey = getPropChunkKey(placedTile.q, placedTile.r);

    const seedCount = `${placedTile.key}:village-characters:count`;
    const roll  = hashUnit(seedCount);
    const t1 = VILLAGE_CHARACTER_NONE_CHANCE;
    const t2 = t1 + VILLAGE_CHARACTER_ONE_CHANCE;
    const t3 = t2 + VILLAGE_CHARACTER_TWO_CHANCE;
    const t4 = t3 + VILLAGE_CHARACTER_THREE_CHANCE;
    const count = roll < t1 ? 0 : roll < t2 ? 1 : roll < t3 ? 2 : roll < t4 ? 3 : 4;

    for (let i = 0; i < count; i++) {
      const seed = `${placedTile.key}:village-character:${i}`;
      const edge = houseEdges[Math.floor(hashUnit(`${seed}:edge`) * houseEdges.length)];
      const pos = randomPointInSector(tilePos, seed, edge, 0.15, 0.85);
      if (isInsideSpecialBuildingSafeZone(pos, specialBuildingSafeZones)) continue;

      const key = VILLAGE_CHARACTER_KEYS[Math.floor(hashUnit(`${seed}:variant`) * VILLAGE_CHARACTER_KEYS.length)];
      accumulateCharacterInstance(accumulator, key, seed, pos, placedTile, chunkKey);
    }
  }
}

// ─── Rôdeurs de forêt ────────────────────────────────────────────────────────────

function accumulateForestCharacters(accumulator, placedTiles, specialBuildingSafeZones) {
  for (const placedTile of placedTiles.values()) {
    const tilePos     = axialToWorld(placedTile.q, placedTile.r);
    const forestEdges = EDGE_ORDER.filter(e => getTileEdgeType(placedTile, e) === EDGE_TYPES.forest);
    if (forestEdges.length === 0) continue;
    const chunkKey = getPropChunkKey(placedTile.q, placedTile.r);

    for (const edge of forestEdges) {
      const rawEdge = placedTile.tile?.edges?.[edge];
      const density = getEdgeValue(rawEdge); // 1-6
      const slots   = Math.max(1, Math.ceil(density / 2));

      for (let s = 0; s < slots; s++) {
        const seed = `${placedTile.key}:forest-character:${edge}:${s}`;
        if (hashUnit(`${seed}:roll`) > FOREST_CHARACTER_SLOT_CHANCE) continue;

        const pos = randomPointInSector(tilePos, seed, edge, 0.36, 0.80);
        if (isInsideSpecialBuildingSafeZone(pos, specialBuildingSafeZones)) continue;

        const key = FOREST_CHARACTER_KEYS[Math.floor(hashUnit(`${seed}:variant`) * FOREST_CHARACTER_KEYS.length)];
        accumulateCharacterInstance(accumulator, key, seed, pos, placedTile, chunkKey);
      }
    }
  }
}

// ─── Fermiers des champs de blé ───────────────────────────────────────────────

function accumulateFieldFarmers(accumulator, placedTiles, specialBuildingSafeZones) {
  for (const placedTile of placedTiles.values()) {
    const tilePos    = axialToWorld(placedTile.q, placedTile.r);
    const fieldEdges = EDGE_ORDER.filter(e => getTileEdgeType(placedTile, e) === EDGE_TYPES.field);
    if (fieldEdges.length === 0) continue;
    const chunkKey = getPropChunkKey(placedTile.q, placedTile.r);

    const seedCount = `${placedTile.key}:field-farmer:count`;
    const roll = hashUnit(seedCount);
    const count = roll > FIELD_FARMER_CHANCE ? 0
                : roll < FIELD_FARMER_CHANCE * FIELD_FARMER_TWO_FRACTION ? 2
                : 1;

    for (let i = 0; i < count; i++) {
      const seed = `${placedTile.key}:field-farmer:${i}`;
      const edge = fieldEdges[Math.floor(hashUnit(`${seed}:edge`) * fieldEdges.length)];
      const pos = randomPointInSector(tilePos, seed, edge, 0.32, 0.80);
      if (isInsideSpecialBuildingSafeZone(pos, specialBuildingSafeZones)) continue;

      accumulateCharacterInstance(accumulator, 'character-fermier', seed, pos, placedTile, chunkKey);
    }
  }
}

// ─── Construction des InstancedMesh ──────────────────────────────────────────────

function buildCharacterInstancedMeshes(group, accumulator) {
  for (const [key, byChunk] of accumulator) {
    const bakedSubs = getCharacterBakedSubmeshes(key);
    if (!bakedSubs) continue;
    const bareKey = key.replace(/^character-/, '');

    for (const [chunkKey, matrices] of byChunk) {
      if (matrices.length === 0) continue;
      // Marge généreuse : silhouette humaine debout, plus haute que large.
      const sphere = computePropBoundingSphere(matrices, 0.9);

      for (const sub of bakedSubs) {
        const mesh = new THREE.InstancedMesh(sub.geometry, sub.material, matrices.length);
        mesh.castShadow    = sub.castShadowOriginal;
        mesh.receiveShadow = true;
        // Géométrie cuite à l'origine — culling manuel via updateCharacterLOD().
        mesh.frustumCulled = false;
        // Permet à sceneProfiler.js (_classifyInstanced) de ventiler le comptage par
        // personnage individuel, comme avant l'instancing (nom du clone GLB).
        mesh.name          = `instanced-character-${bareKey}-${chunkKey}`;
        mesh.userData.worldBoundingSphere = sphere;
        // Indispensable (même piège que houseOverlay.js) : sans ces deux flags,
        // applySceneShadowFlags() (threeSetup.js) traite ce mesh comme "jamais vu" et
        // réactive castShadow=true dessus (branche générique, tout matériau opaque cast
        // par défaut) au lieu du seul sous-mesh désigné caster.
        mesh.userData.castShadowOriginal  = sub.castShadowOriginal;
        mesh.userData.shadowFlagsApplied  = true;
        // Géométrie cuite à l'origine (comme les arbres, cf. forestOverlay.js) : la
        // matrixWorld de ce InstancedMesh reste (0,0,0), loin du focus caméra réel —
        // applyShadowCulling (shadowCulling.js) calculerait alors une distance depuis
        // l'origine plutôt que depuis les instances réelles (faux-positif, ombres
        // éteintes). On s'appuie uniquement sur la visibilité posée par updateCharacterLOD.
        mesh.userData.skipShadowCulling   = true;

        for (let i = 0; i < matrices.length; i++) mesh.setMatrixAt(i, matrices[i]);
        mesh.instanceMatrix.needsUpdate = true;

        group.add(mesh);
      }
    }
  }
}

// ─── API publique — cycle de vie overlay ──────────────────────────────────────

export function createCharacterOverlay() {
  const group = new THREE.Group();
  group.name  = 'character-overlay-glb';
  return group;
}

/**
 * Reconstruction complète (2026-07-06, perf — même raisonnement que rebuildHouseOverlay) :
 * reconstruire la totalité des matrices à chaque appel est trivial (arithmétique pure, pas
 * de clone de hiérarchie GLB) — pas besoin de rebuild incrémental par tuile.
 */
export function rebuildCharacterOverlay(group, placedTiles) {
  while (group.children.length > 0) group.children.pop(); // pas de dispose : géométrie/matériaux partagés en cache

  const specialBuildingSafeZones = collectSpecialBuildingSafeZones(placedTiles);
  const accumulator = new Map(); // variantKey → Map(chunkKey → Matrix4[])

  accumulateVillageCharacters(accumulator, placedTiles, specialBuildingSafeZones);
  accumulateForestCharacters(accumulator, placedTiles, specialBuildingSafeZones);
  accumulateFieldFarmers(accumulator, placedTiles, specialBuildingSafeZones);

  buildCharacterInstancedMeshes(group, accumulator);
}

/**
 * LOD par distance + frustum sur la bounding sphere de chaque (variante × chunk) —
 * même mécanisme que updateHouseLOD/updateNaturalPropsLOD. Auparavant : AUCUN LOD sur les
 * personnages (ils restaient individuels et toujours rendus, quelle que soit la distance
 * caméra) — l'instancing apporte donc, en plus de la baisse de draw calls/shadow casters,
 * une réduction réelle du travail GPU en caméra haute/éloignée qui n'existait pas avant.
 */
export function updateCharacterLOD(group, camera, lodFactor = 1.0) {
  const effectiveDist = LOD_CHARACTER_CULL_DISTANCE * lodFactor;
  const distSq = effectiveDist * effectiveDist;

  _charLodMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  _charLodFrustum.setFromProjectionMatrix(_charLodMatrix);

  for (const child of group.children) {
    if (!child.isInstancedMesh || !child.userData.worldBoundingSphere) continue;
    const sphere = child.userData.worldBoundingSphere;
    child.visible = camera.position.distanceToSquared(sphere.center) < distSq
      && _charLodFrustum.intersectsSphere(sphere);
  }
}
