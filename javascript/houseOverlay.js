import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { EDGE_ORDER, EDGE_TYPES, HEX_SIZE, TILE_VISUAL, SECTOR_DEFS, LOD_HOUSE_CULL_DISTANCE, LOD_WATCHTOWER_CULL_DISTANCE } from './config.js';

import { hashUnit100k as hashUnit } from './hashUtils.js';
import { createOuterVertices } from './hexGeometry.js';
import { makeHexKey } from './hex.js';
import { HEX_DIRECTIONS, getOppositeEdge } from './placementRules.js';
import { getEdgeType, getEdgeValue } from './tileGenerator.js';
import { getTerrainSurfaceY } from './terrainHeight.js';
import { getCurvatureTiltQuaternion, getWorldCurvatureDrop } from './worldCurvature.js';
import { makeNodeKey as makeSectorKey, getTileEdgeType, getTileCenterType, smoothstep } from './tileUtils.js';
import {
  ensureHouseGlbModels,
  isHouseGlbReady,
  spreadVillageHouseLocalPoint,
  pickHouseInstanceParams,
  getHouseBakedSubmeshes,
  createVillageWatchtowerObject
} from './houseVillageObjects.js';
import { getPropChunkKey, computePropBoundingSphere } from './decorOverlay.js';

// Pré-alloués — évitent les allocations par maison (2026-07-04 : instancing, cf. plus bas)
const _hCurvQuat     = new THREE.Quaternion();
const _hInstanceDummy = new THREE.Object3D();
const _houseLodFrustum = new THREE.Frustum();
const _houseLodMatrix  = new THREE.Matrix4();

// ─── Constantes ───────────────────────────────────────────────────────────────

// Les maisons ont leur origine au pied du modèle. Depuis que le
// biome maison est 30% moins épais en gardant le dessous collé à la grille,
// son dessus réel est abaissé : on pose donc les bâtiments sur cette surface,
// pas sur l'ancien niveau flottant sectorY + 0.018.
const HOUSE_GROUND_Y = (TILE_VISUAL.tileThickness ?? 0.12) * -0.30;
const HOUSE_BASE_Y = HOUSE_GROUND_Y + 0.002;
const HOUSE_SCALE = HEX_SIZE * 0.1332 * 0.90 * 0.94 * 1.05; // −10% −10% −6% +5%
const HOUSE_CHIMNEY_TOP_Y = HOUSE_BASE_Y + HOUSE_SCALE * 1.62;
const HOUSE_SMOKE_Y = HOUSE_CHIMNEY_TOP_Y + HOUSE_SCALE * 0.08;
const PUFFS_PER_COLUMN = 18;

// Atténuation du tilt de courbure monde (bouliste) pour les bâtiments : l'angle
// géométrique réel de la pente (jusqu'à 45° près de l'équateur de la calotte,
// cf. worldCurvature.js) est fidèle à la sphère, mais des volumes rectilignes
// à arêtes droites (murs, toits) le rendent visuellement beaucoup plus choquant
// que sur des props organiques (arbres, rochers). On ne penche donc les maisons
// et tours qu'à moitié de l'inclinaison réelle — ajuster si besoin.
const HOUSE_TILT_STRENGTH = 0.5;

const DIRECTION_BY_EDGE = Object.fromEntries(HEX_DIRECTIONS.map(direction => [direction.edge, direction]));

// Seuils de déclenchement des bâtiments spéciaux par zone
const WATCHTOWER_MIN_HOUSES = 4;
const WATCHTOWER_HOUSES_PER_EXTRA = 8;
const WATCHTOWER_MAX_PER_ZONE = 6;

// ─── API publique — cycle de vie overlay ──────────────────────────────────────

export function createHouseOverlay() {
  const group = new THREE.Group();
  group.name = 'house-overlay';
  group.userData.columns = [];
  group.userData.watchtowerLodItems = [];
  ensureHouseGlbModelsAndRebuild(group);
  return group;
}

/**
 * Reconstruction complète (2026-07-04, perf) : les maisons pesaient ~21% des triangles
 * de la scène pour 378 draw calls / 145 objets — jamais batchées (1 clone(true) + sa
 * hiérarchie de sous-meshes par maison). Remplacé par un InstancedMesh par
 * (variant × sous-mesh × chunk), même principe que naturalPropsOverlay.js.
 *
 * L'ancien système gardait un THREE.Group par tuile (tileHouseGroups) avec un cache de
 * signature pour ne reconstruire que les tuiles modifiées — nécessaire quand chaque
 * maison est un Object3D coûteux à recréer. Avec l'instancing, reconstruire la totalité
 * des matrices à chaque appel est trivial (arithmétique pure, pas de clone de hiérarchie
 * GLB) : on simplifie donc en un recalcul complet à chaque rebuild. rebuildHouseOverlay
 * n'est de toute façon appelé que sur événement de placement (file overlayRebuildQueue,
 * cf. scene.js), jamais à chaque frame — même coût d'appel que createNaturalGroundProps.
 */
export function rebuildHouseOverlay(group, placedTiles) {
  group.userData.lastPlacedTiles = placedTiles;

  if (!isHouseGlbReady()) {
    ensureHouseGlbModelsAndRebuild(group);
    return;
  }

  _clearHouseOverlayChildren(group);
  group.userData.columns = [];
  group.userData.watchtowerLodItems = [];
  group.userData.houseChunkMeshes = new Map();

  const watchtowerSectors = collectVillageWatchtowerSectors(placedTiles);
  const accumulator = new Map(); // defKey → Map(chunkKey → Matrix4[])

  for (const placedTile of placedTiles.values()) {
    const edges = placedTile.tile?.edges;
    if (!edges) continue;

    const tileX = placedTile.mesh?.position?.x ?? 0;
    const tileZ = placedTile.mesh?.position?.z ?? 0;
    const tileKey = placedTile.key ?? makeHexKey(placedTile.q, placedTile.r);
    const chunkKey = getPropChunkKey(placedTile.q, placedTile.r);

    for (const sector of SECTOR_DEFS) {
      const edge = edges[sector.key];
      if (getEdgeType(edge) !== EDGE_TYPES.house) continue;

      const houseCount = Math.max(1, Math.min(4, Math.round(getEdgeValue(edge))));

      addSectorBuildings(
        group,
        accumulator,
        tileX,
        tileZ,
        sector,
        houseCount,
        tileKey,
        chunkKey,
        watchtowerSectors.has(makeSectorKey(tileKey, sector.key))
      );
    }
  }

  buildHouseInstancedMeshes(group, accumulator);
}

export function updateHouseOverlay(group, timeSeconds = 0) {
  const columns = group.userData.columns ?? [];

  for (const column of columns) {
    for (let i = 0; i < column.puffs.length; i += 1) {
      const puff = column.puffs[i];
      const t = (timeSeconds * puff.speed + puff.phase) % 1;
      const rise = smoothstep(0, 1, t);
      const sideWobble = Math.sin(timeSeconds * puff.wobbleSpeed + puff.phase * 17.0) * puff.wobble;
      const backWobble = Math.cos(timeSeconds * (puff.wobbleSpeed * 0.82) + puff.phase * 13.0) * puff.wobble;

      puff.mesh.position.set(
        column.x + sideWobble + puff.drift.x * rise,
        HOUSE_SMOKE_Y + rise * puff.rise,
        column.z + backWobble + puff.drift.z * rise
      );

      const scale = puff.baseScale * (0.76 + rise * 1.55 + Math.sin(timeSeconds * 1.45 + i) * 0.035);
      puff.mesh.scale.set(scale, scale, scale);
      puff.mesh.material.opacity = Math.max(0, Math.pow(1 - rise, 1.25) * puff.opacity);
      puff.mesh.visible = puff.mesh.material.opacity > 0.018;
    }
  }
}

/**
 * LOD (2026-07-04) : les maisons sont désormais des InstancedMesh groupés par chunk —
 * même mécanisme que updateNaturalPropsLOD (decorOverlay.js) : distance + frustum sur la
 * bounding sphere du chunk. Les tours de garde restent des objets individuels (peu
 * nombreuses, modèle multi-parties) — LOD plus sévère, par distance seule comme avant.
 */
export function updateHouseLOD(group, camera, lodFactor = 1.0) {
  const houseEff         = LOD_HOUSE_CULL_DISTANCE     * lodFactor;
  const watchtowerEff    = LOD_WATCHTOWER_CULL_DISTANCE * lodFactor;
  const houseDistSq      = houseEff      * houseEff;
  const watchtowerDistSq = watchtowerEff * watchtowerEff;

  _houseLodMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  _houseLodFrustum.setFromProjectionMatrix(_houseLodMatrix);

  for (const child of group.children) {
    if (!child.isInstancedMesh || !child.userData.worldBoundingSphere) continue;
    const sphere = child.userData.worldBoundingSphere;
    const distSq = camera.position.distanceToSquared(sphere.center);
    child.visible = distSq < houseDistSq && _houseLodFrustum.intersectsSphere(sphere);
  }

  for (const item of (group.userData.watchtowerLodItems ?? [])) {
    item.object.visible = camera.position.distanceToSquared(item.center) < watchtowerDistSq;
  }
}

// ─── Chargement GLB — wrapper sans dépendance circulaire ─────────────────────

function ensureHouseGlbModelsAndRebuild(group) {
  ensureHouseGlbModels(group, () => {
    const lastPlacedTiles = group.userData.lastPlacedTiles;
    if (lastPlacedTiles) rebuildHouseOverlay(group, lastPlacedTiles);
  });
}

// ─── Nettoyage overlay ────────────────────────────────────────────────────────

/**
 * Retire tous les enfants sans disposer geometry/material : les InstancedMesh partagent
 * une géométrie "cuite" mise en cache (getHouseBakedSubmeshes) et un matériau partagé
 * avec le prototype GLB — les deux sont réutilisés tels quels au prochain rebuild.
 * (clearGroup de tileUtils.js disposerait ces ressources partagées à chaque appel —
 * sans danger en soi pour three.js, qui réuploaderait au GPU au prochain rendu, mais
 * inutilement coûteux vu la fréquence de placement de tuiles.)
 */
function _clearHouseOverlayChildren(group) {
  while (group.children.length > 0) {
    group.children.pop();
  }
}

// ─── Construction des InstancedMesh ──────────────────────────────────────────

function buildHouseInstancedMeshes(group, accumulator) {
  for (const [defKey, byChunk] of accumulator) {
    const bakedSubs = getHouseBakedSubmeshes(defKey);
    if (!bakedSubs) continue;

    for (const [chunkKey, matrices] of byChunk) {
      if (matrices.length === 0) continue;
      const sphere = computePropBoundingSphere(matrices, 1.2); // marge généreuse : maisons hautes, pas des props au sol

      const chunkMeshes = [];
      for (const sub of bakedSubs) {
        const mesh = new THREE.InstancedMesh(sub.geometry, sub.material, matrices.length);
        mesh.castShadow    = sub.castShadowOriginal; // 1 seul sous-mesh par variant caste (hérité du prototype)
        mesh.receiveShadow = true;
        mesh.frustumCulled = false; // géométrie cuite à l'origine — culling manuel via updateHouseLOD
        mesh.name          = `instanced-house-${defKey}-${chunkKey}`;
        mesh.userData.worldBoundingSphere = sphere;
        // Indispensable : sans ces deux flags, applySceneShadowFlags() (threeSetup.js) traite
        // ce mesh comme "jamais vu" et force castShadow=true dessus (branche générique, tout
        // matériau opaque cast par défaut) — ce qui réactiverait l'ombre sur TOUS les sous-meshes
        // (fenêtres, cheminées…) au lieu du seul caster désigné par _applySingleShadowCaster.
        mesh.userData.castShadowOriginal = sub.castShadowOriginal;
        mesh.userData.shadowFlagsApplied = true;

        for (let i = 0; i < matrices.length; i++) mesh.setMatrixAt(i, matrices[i]);
        mesh.instanceMatrix.needsUpdate = true;

        group.add(mesh);
        chunkMeshes.push(mesh);
      }

      group.userData.houseChunkMeshes.set(`${defKey}:${chunkKey}`, chunkMeshes);
    }
  }
}

// ─── Placement des bâtiments par secteur ─────────────────────────────────────

function addSectorBuildings(group, accumulator, tileX, tileZ, sector, columnCount, tileKey, chunkKey, hasWatchtower = false) {
  const vertices = createOuterVertices();
  const a = vertices[sector.a];
  const b = vertices[sector.b];
  const anchors = getColumnAnchors(columnCount);

  // Tour : position fixe dans le triangle, bâtiment additionnel (hors quota maisons).
  // Reste un objet individuel (peu nombreuses, modèle multi-parties issu d'un pack GLB).
  if (hasWatchtower) {
    const towerLocal = trianglePoint(a, b, 0.18, 0.41, 0.41);
    const tower = createVillageWatchtowerObject(`${tileKey}:${sector.key}:village-watchtower`, sector);
    const towerSurfaceY = getTerrainSurfaceY(towerLocal, EDGE_TYPES.house, Math.floor(hashUnit(`${tileKey}:${sector.key}:watchtower`) * 97), { edgeLockStart: 0.98, edgeLockEnd: 1.0 });
    const towerX = tileX + towerLocal.x;
    const towerZ = tileZ + towerLocal.z;
    tower.position.set(towerX, towerSurfaceY + 0.010, towerZ);
    getCurvatureTiltQuaternion(towerX, towerZ, _hCurvQuat, HOUSE_TILT_STRENGTH);
    tower.quaternion.premultiply(_hCurvQuat);
    group.add(tower);
    group.userData.watchtowerLodItems.push({ object: tower, center: new THREE.Vector3(towerX, towerSurfaceY, towerZ) });
    // (pas d'enregistrement hitbox : la tour n'a pas besoin de bloquer d'autres objets ici)
  }

  // Maisons : exactement columnCount maisons — le label de zone reflétera ce compte précis.
  for (let i = 0; i < columnCount; i += 1) {
    const anchor = anchors[i] ?? anchors[anchors.length - 1];
    const seed = `${tileKey}:${sector.key}:house:${i}`;
    const local = spreadVillageHouseLocalPoint(
      trianglePoint(a, b, anchor.centerWeight, anchor.aWeight, anchor.bWeight)
    );
    const worldX = tileX + local.x;
    const worldZ = tileZ + local.z;
    const houseSurfaceY = getTerrainSurfaceY(local, EDGE_TYPES.house, Math.floor(hashUnit(seed) * 97), { edgeLockStart: 0.98, edgeLockEnd: 1.0 });
    const baseY = houseSurfaceY + 0.004;

    // Mêmes formules de hash que l'ancien createVillageHouseObject (aspect inchangé).
    const params = pickHouseInstanceParams(seed, i);

    getCurvatureTiltQuaternion(worldX, worldZ, _hCurvQuat, HOUSE_TILT_STRENGTH);
    _hInstanceDummy.position.set(worldX, baseY, worldZ);
    _hInstanceDummy.rotation.set(0, 0, 0);
    _hInstanceDummy.rotation.y = params.rotationY;
    _hInstanceDummy.quaternion.premultiply(_hCurvQuat); // même ordre que l'ancien house.quaternion.premultiply(_hCurvQuat)
    _hInstanceDummy.scale.setScalar(params.scale);
    _hInstanceDummy.updateMatrix();

    if (!accumulator.has(params.key)) accumulator.set(params.key, new Map());
    const byChunk = accumulator.get(params.key);
    if (!byChunk.has(chunkKey)) byChunk.set(chunkKey, []);
    byChunk.get(chunkKey).push(_hInstanceDummy.matrix.clone());

    // Enregistre la position de la cheminée pour le pass de fumée volumétrique.
    // Y réel = base house + hauteur chimney dans le modèle (HOUSE_SCALE * 1.70).
    // hasSmoke : seulement ~30 % des maisons fument (hash déterministe sur la graine).
    // chunkMeshKey : clé vers group.userData.houseChunkMeshes → visibilité LOD réelle
    // (remplace l'ancienne référence tileGroup, les maisons n'ont plus de Group propre).
    const chimneyWorldY = baseY + HOUSE_SCALE * 1.70;
    // maison-petite-3 n'a pas de cheminée visible → jamais de fumée
    const hasSmoke = !params.key.includes('maison-medievale-petite-3') && hashUnit(`${seed}:smoke`) < 0.33;
    group.userData.columns.push({
      x: worldX, y: chimneyWorldY, z: worldZ, puffs: [], hasSmoke,
      chunkMeshKey: `${params.key}:${chunkKey}`
    });
  }
}


// ─── BFS zone system — récompenses bâtiments spéciaux ────────────────────────

export function collectVillageWatchtowerSectors(placedTiles) {
  const selected = new Set();
  const visited = new Set();

  for (const placedTile of placedTiles.values()) {
    const edges = placedTile.tile?.edges;
    if (!edges) continue;

    for (const edge of EDGE_ORDER) {
      if (getTileEdgeType(placedTile, edge) !== EDGE_TYPES.house) continue;
      const nodeKey = makeSectorKey(placedTile.key, edge);
      if (visited.has(nodeKey)) continue;

      const zone = collectHouseZone(placedTile, edge, placedTiles, visited);
      if (zone.total < WATCHTOWER_MIN_HOUSES) continue;

      const towerCount = Math.min(
        WATCHTOWER_MAX_PER_ZONE,
        Math.max(
          1,
          1 + Math.floor((zone.total - WATCHTOWER_MIN_HOUSES) / WATCHTOWER_HOUSES_PER_EXTRA)
        )
      );

      const alreadySelectedInZone = zone.sectors.reduce(
        (total, sectorRef) => total + (selected.has(makeSectorKey(sectorRef.tile.key, sectorRef.edge)) ? 1 : 0),
        0
      );
      if (alreadySelectedInZone >= towerCount) continue;

      const candidates = [...zone.sectors]
        .sort((a, b) => rankWatchtowerCandidate(a, zone, selected) - rankWatchtowerCandidate(b, zone, selected));

      const usedTiles = new Set(
        zone.sectors
          .filter(sectorRef => selected.has(makeSectorKey(sectorRef.tile.key, sectorRef.edge)))
          .map(sectorRef => sectorRef.tile.key)
      );

      for (const candidate of candidates) {
        if (selected.size >= 256) break;
        const sectorKey = makeSectorKey(candidate.tile.key, candidate.edge);
        if (selected.has(sectorKey)) continue;
        if (usedTiles.has(candidate.tile.key)) continue;

        selected.add(sectorKey);
        usedTiles.add(candidate.tile.key);

        const selectedInZone = zone.sectors.reduce(
          (total, sectorRef) => total + (selected.has(makeSectorKey(sectorRef.tile.key, sectorRef.edge)) ? 1 : 0),
          0
        );
        if (selectedInZone >= towerCount) break;
      }
    }
  }

  return selected;
}

function collectHouseZone(startTile, startEdge, placedTiles, visited) {
  const stack = [{ tile: startTile, edge: startEdge }];
  const sectors = [];
  let total = 0;

  while (stack.length > 0) {
    const current = stack.pop();
    const nodeKey = makeSectorKey(current.tile.key, current.edge);
    if (visited.has(nodeKey)) continue;
    if (getTileEdgeType(current.tile, current.edge) !== EDGE_TYPES.house) continue;

    visited.add(nodeKey);
    sectors.push(current);
    total += getEdgeValue(current.tile.tile.edges[current.edge]);

    for (const neighbor of getHouseNeighbors(current.tile, current.edge, placedTiles)) {
      const neighborKey = makeSectorKey(neighbor.tile.key, neighbor.edge);
      if (!visited.has(neighborKey)) stack.push(neighbor);
    }
  }

  return { sectors, total };
}

function getHouseNeighbors(placedTile, edge, placedTiles) {
  const neighbors = [];

  if (getTileCenterType(placedTile) === EDGE_TYPES.house) {
    for (const sameTileEdge of EDGE_ORDER) {
      if (sameTileEdge !== edge && getTileEdgeType(placedTile, sameTileEdge) === EDGE_TYPES.house) {
        neighbors.push({ tile: placedTile, edge: sameTileEdge });
      }
    }
  }

  const edgeIndex = EDGE_ORDER.indexOf(edge);
  const internalEdges = [
    EDGE_ORDER[(edgeIndex + EDGE_ORDER.length - 1) % EDGE_ORDER.length],
    EDGE_ORDER[(edgeIndex + 1) % EDGE_ORDER.length]
  ];

  for (const internalEdge of internalEdges) {
    if (getTileEdgeType(placedTile, internalEdge) === EDGE_TYPES.house) {
      neighbors.push({ tile: placedTile, edge: internalEdge });
    }
  }

  const direction = DIRECTION_BY_EDGE[edge];
  if (!direction) return neighbors;

  const neighborTile = placedTiles.get(makeHexKey(placedTile.q + direction.q, placedTile.r + direction.r));
  const oppositeEdge = getOppositeEdge(edge);

  if (neighborTile && getTileEdgeType(neighborTile, oppositeEdge) === EDGE_TYPES.house) {
    neighbors.push({ tile: neighborTile, edge: oppositeEdge });
  }

  return neighbors;
}

// ─── Fonctions de classement des candidats ────────────────────────────────────

function rankWatchtowerCandidate(sectorRef, zone, selectedSectors = new Set()) {
  const sectorKey = makeSectorKey(sectorRef.tile.key, sectorRef.edge);
  const value = Math.round(getEdgeValue(sectorRef.tile.tile.edges[sectorRef.edge]));
  const alreadySelectedPenalty = selectedSectors.has(sectorKey) ? -999 : 0;
  const edgeBias = EDGE_ORDER.indexOf(sectorRef.edge);
  const seed = hashUnit(`${zone.total}:${zone.sectors.length}:${sectorRef.tile.key}:${sectorRef.edge}:watchtower-rank`);
  return -(alreadySelectedPenalty + value * 90 + edgeBias * 4 + seed);
}

// ─── Utilitaires de placement ─────────────────────────────────────────────────

function getColumnAnchors(columnCount) {
  if (columnCount >= 4) {
    return [
      { centerWeight: 0.54, aWeight: 0.33, bWeight: 0.13 },
      { centerWeight: 0.54, aWeight: 0.13, bWeight: 0.33 },
      { centerWeight: 0.30, aWeight: 0.48, bWeight: 0.22 },
      { centerWeight: 0.30, aWeight: 0.22, bWeight: 0.48 }
    ];
  }

  if (columnCount === 3) {
    return [
      { centerWeight: 0.56, aWeight: 0.32, bWeight: 0.12 },
      { centerWeight: 0.56, aWeight: 0.12, bWeight: 0.32 },
      { centerWeight: 0.30, aWeight: 0.35, bWeight: 0.35 }
    ];
  }

  if (columnCount === 2) {
    return [
      { centerWeight: 0.52, aWeight: 0.34, bWeight: 0.14 },
      { centerWeight: 0.52, aWeight: 0.14, bWeight: 0.34 }
    ];
  }

  return [
    { centerWeight: 0.43, aWeight: 0.285, bWeight: 0.285 }
  ];
}

function trianglePoint(a, b, centerWeight, aWeight, bWeight) {
  const total = centerWeight + aWeight + bWeight;
  return {
    x: (a.x * aWeight + b.x * bWeight) / total,
    z: (a.z * aWeight + b.z * bWeight) / total
  };
}

// ─── Positions cheminées pour le pass fumée volumétrique ─────────────────────

/**
 * Retourne les positions monde (THREE.Vector3) de toutes les cheminées actives.
 * À passer à updateSmokeVolumePass() chaque frame.
 * Visibilité (2026-07-04) : lue depuis le premier InstancedMesh du chunk concerné
 * (houseChunkMeshes) — remplace l'ancienne référence tileGroup?.visible, les maisons
 * n'ayant plus de Group individuel depuis le passage à l'instancing.
 */
export function getHouseChimneyPositions(group) {
  const chunkMeshes = group.userData.houseChunkMeshes;
  return (group.userData.columns ?? [])
    .filter(col => {
      if (!col.hasSmoke) return false;
      const meshes = chunkMeshes?.get(col.chunkMeshKey);
      return meshes ? meshes[0]?.visible !== false : true;
    })
    .map(col => {
      const flatY = col.y ?? HOUSE_SMOKE_Y;
      return new THREE.Vector3(col.x, flatY + getWorldCurvatureDrop(col.x, col.z), col.z);
    });
}

