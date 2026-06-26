import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { EDGE_ORDER, EDGE_TYPES, HEX_SIZE, TILE_VISUAL, SECTOR_DEFS, LOD_HOUSE_CULL_DISTANCE, LOD_WATCHTOWER_CULL_DISTANCE } from './config.js';
import { HITBOX_R } from './variables.js';
import { registerPropHitbox } from './stable/propHitboxRegistry.js';
import { hashUnit100k as hashUnit } from './stable/hashUtils.js';
import { createOuterVertices } from './stable/hexGeometry.js';
import { makeHexKey } from './stable/hex.js';
import { HEX_DIRECTIONS, getOppositeEdge } from './stable/placementRules.js';
import { getEdgeType, getEdgeValue } from './tileGenerator.js';
import { getTerrainSurfaceY } from './terrainHeight.js';
import { makeNodeKey as makeSectorKey, getTileEdgeType, getTileCenterType, clearGroup, smoothstep } from './stable/tileUtils.js';
import {
  ensureHouseGlbModels,
  isHouseGlbReady,
  spreadVillageHouseLocalPoint,
  createVillageHouseObject,
  createVillageChurchObject,
  createVillageWatchtowerObject
} from './houseVillageObjects.js';

// ─── Constantes ───────────────────────────────────────────────────────────────

// Les maisons/églises ont leur origine au pied du modèle. Depuis que le
// biome maison est 30% moins épais en gardant le dessous collé à la grille,
// son dessus réel est abaissé : on pose donc les bâtiments sur cette surface,
// pas sur l'ancien niveau flottant sectorY + 0.018.
const HOUSE_GROUND_Y = (TILE_VISUAL.tileThickness ?? 0.12) * -0.30;
const HOUSE_BASE_Y = HOUSE_GROUND_Y + 0.002;
const HOUSE_SCALE = HEX_SIZE * 0.1332 * 0.90 * 0.94; // −10% −10% −6%
const HOUSE_CHIMNEY_TOP_Y = HOUSE_BASE_Y + HOUSE_SCALE * 1.62;
const HOUSE_SMOKE_Y = HOUSE_CHIMNEY_TOP_Y + HOUSE_SCALE * 0.08;
const PUFFS_PER_COLUMN = 18;

const smokeMaterialCache = [];

const DIRECTION_BY_EDGE = Object.fromEntries(HEX_DIRECTIONS.map(direction => [direction.edge, direction]));

// Seuils de déclenchement des bâtiments spéciaux par zone
const CHURCH_MIN_HOUSES = 7;
const CHURCH_HOUSES_PER_EXTRA = 14;
const CHURCH_MAX_PER_ZONE = 5;
const WATCHTOWER_MIN_HOUSES = 4;
const WATCHTOWER_HOUSES_PER_EXTRA = 8;
const WATCHTOWER_MAX_PER_ZONE = 6;
const SPECIAL_BUILDING_HOUSE_SAFE_RADIUS = HEX_SIZE * 0.198; // −10 %

// ─── API publique — cycle de vie overlay ──────────────────────────────────────

export function createHouseOverlay() {
  const group = new THREE.Group();
  group.name = 'house-overlay';
  group.userData.columns = [];
  ensureHouseGlbModelsAndRebuild(group);
  return group;
}

export function rebuildHouseOverlay(group, placedTiles) {
  group.userData.lastPlacedTiles = placedTiles;
  if (!group.userData.tileHouseGroups) group.userData.tileHouseGroups = new Map();

  if (!isHouseGlbReady()) {
    ensureHouseGlbModelsAndRebuild(group);
    return;
  }

  const tileHouseGroups = group.userData.tileHouseGroups;
  const activeKeys = new Set();
  const churchSectors = collectVillageChurchSectors(placedTiles);
  const watchtowerSectors = collectVillageWatchtowerSectors(placedTiles, churchSectors);
  const blockedRewardSectors = new Set([...churchSectors, ...watchtowerSectors]);

  for (const placedTile of placedTiles.values()) {
    const tileKey = placedTile.key ?? makeHexKey(placedTile.q, placedTile.r);
    activeKeys.add(tileKey);

    const signature = getTileHouseOverlaySignature(placedTile, churchSectors, watchtowerSectors);
    const cached = tileHouseGroups.get(tileKey);
    if (cached && cached.userData?.houseOverlaySignature === signature) continue;

    if (cached) {
      group.remove(cached);
      clearGroup(cached);
    }

    const tileGroup = new THREE.Group();
    tileGroup.name = `house-tile-${tileKey}`;
    tileGroup.userData.houseOverlaySignature = signature;
    buildHouseTileGroup(tileGroup, placedTile, placedTiles, churchSectors, watchtowerSectors);
    tileHouseGroups.set(tileKey, tileGroup);
    group.add(tileGroup);
  }

  for (const [tileKey, tileGroup] of tileHouseGroups.entries()) {
    if (activeKeys.has(tileKey)) continue;
    group.remove(tileGroup);
    clearGroup(tileGroup);
    tileHouseGroups.delete(tileKey);
  }

  group.userData.columns = Array.from(tileHouseGroups.values()).flatMap(tileGroup => tileGroup.userData.columns ?? []);
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

export function updateHouseLOD(group, camera, lodFactor = 1.0) {
  const houseEff         = LOD_HOUSE_CULL_DISTANCE     * lodFactor;
  const watchtowerEff    = LOD_WATCHTOWER_CULL_DISTANCE * lodFactor;
  const houseDistSq      = houseEff      * houseEff;
  const watchtowerDistSq = watchtowerEff * watchtowerEff;
  const tileHouseGroups = group.userData.tileHouseGroups;
  if (!tileHouseGroups) return;
  for (const tileGroup of tileHouseGroups.values()) {
    const center = tileGroup.userData.worldCenter;
    if (!center) continue;
    const distSq = camera.position.distanceToSquared(center);
    const tileVisible = distSq < houseDistSq;
    tileGroup.visible = tileVisible;
    // Watchtowers : LOD plus sévère — masquées avant les maisons (−22 % vs −20 %)
    if (tileVisible) {
      const withinWatchtower = distSq < watchtowerDistSq;
      for (const child of tileGroup.children) {
        if (child.name === 'village-watchtower-glb-zone-reward') child.visible = withinWatchtower;
      }
    }
  }
}

// ─── Chargement GLB — wrapper sans dépendance circulaire ─────────────────────

function ensureHouseGlbModelsAndRebuild(group) {
  ensureHouseGlbModels(group, () => {
    const lastPlacedTiles = group.userData.lastPlacedTiles;
    if (lastPlacedTiles) rebuildHouseOverlay(group, lastPlacedTiles);
  });
}

// ─── Construction par tuile ───────────────────────────────────────────────────

function buildHouseTileGroup(group, placedTile, placedTiles, churchSectors, watchtowerSectors) {
  group.userData.columns = [];

  const edges = placedTile.tile?.edges;
  if (!edges) return;

  const tileX = placedTile.mesh?.position?.x ?? 0;
  const tileZ = placedTile.mesh?.position?.z ?? 0;
  group.userData.worldCenter = new THREE.Vector3(tileX, 0, tileZ);
  const tileKey = placedTile.key ?? makeHexKey(placedTile.q, placedTile.r);

  for (const sector of SECTOR_DEFS) {
    const edge = edges[sector.key];
    if (getEdgeType(edge) !== EDGE_TYPES.house) continue;

    const houseCount = Math.max(1, Math.min(4, Math.round(getEdgeValue(edge))));

    addSectorBuildings(
      group,
      tileX,
      tileZ,
      sector,
      houseCount,
      tileKey,
      churchSectors.has(makeSectorKey(tileKey, sector.key)),
      watchtowerSectors.has(makeSectorKey(tileKey, sector.key)),
      placedTile,
      placedTiles
    );
  }

}

function getTileHouseOverlaySignature(placedTile, churchSectors, watchtowerSectors) {
  const tileKey = placedTile.key ?? makeHexKey(placedTile.q, placedTile.r);
  const edges = placedTile.tile?.edges ?? {};

  return SECTOR_DEFS.map(sector => {
    const edge = edges[sector.key];
    const sectorKey = makeSectorKey(tileKey, sector.key);
    return [
      sector.key,
      getEdgeType(edge),
      Math.max(1, Math.min(4, Math.round(getEdgeValue(edge)))) || 0,
      churchSectors.has(sectorKey) ? 'church' : '',
      watchtowerSectors.has(sectorKey) ? 'watchtower' : ''
    ].join(':');
  }).join('|');
}

// ─── Placement des bâtiments par secteur ─────────────────────────────────────

function addSectorBuildings(group, tileX, tileZ, sector, columnCount, tileKey, hasChurch = false, hasWatchtower = false, placedTile = null, placedTiles = null) {
  const vertices = createOuterVertices();
  const a = vertices[sector.a];
  const b = vertices[sector.b];
  const anchors = getColumnAnchors(columnCount);

  // Tour : position fixe dans le triangle, bâtiment additionnel (hors quota maisons)
  if (hasWatchtower) {
    const towerLocal = trianglePoint(a, b, 0.18, 0.41, 0.41);
    const tower = createVillageWatchtowerObject(`${tileKey}:${sector.key}:village-watchtower`, sector);
    const towerSurfaceY = getTerrainSurfaceY(towerLocal, EDGE_TYPES.house, Math.floor(hashUnit(`${tileKey}:${sector.key}:watchtower`) * 97), { edgeLockStart: 0.98, edgeLockEnd: 1.0 });
    tower.position.set(tileX + towerLocal.x, towerSurfaceY + 0.010, tileZ + towerLocal.z);
    group.add(tower);
    registerPropHitbox(tileX + towerLocal.x, tileZ + towerLocal.z, HITBOX_R.watchtower);
  }

  // Église : position anchor[0], bâtiment additionnel (hors quota maisons).
  // Auparavant elle remplaçait le slot i=0, faisant que label ≠ maisons au sol.
  // Désormais toutes les columnCount maisons sont placées en plus de l'église.
  if (hasChurch) {
    const anchor0 = anchors[0] ?? { centerWeight: 0.43, aWeight: 0.285, bWeight: 0.285 };
    const churchLocal = trianglePoint(a, b, anchor0.centerWeight, anchor0.aWeight, anchor0.bWeight);
    const church = createVillageChurchObject(`${tileKey}:${sector.key}:village-church`, sector);
    const churchSurfaceY = getTerrainSurfaceY(churchLocal, EDGE_TYPES.house, Math.floor(hashUnit(`${tileKey}:${sector.key}:church`) * 97), { edgeLockStart: 0.98, edgeLockEnd: 1.0 });
    church.position.set(tileX + churchLocal.x, churchSurfaceY + 0.004, tileZ + churchLocal.z);
    group.add(church);
    registerPropHitbox(tileX + churchLocal.x, tileZ + churchLocal.z, HITBOX_R.church);
  }

  // Maisons : exactement columnCount maisons — le label de zone reflétera ce compte précis.
  // Aucun slot ne saute : la safe zone ne s'applique plus (tour et église sont additionnelles).
  for (let i = 0; i < columnCount; i += 1) {
    const anchor = anchors[i] ?? anchors[anchors.length - 1];
    const seed = `${tileKey}:${sector.key}:house:${i}`;
    const local = spreadVillageHouseLocalPoint(
      trianglePoint(a, b, anchor.centerWeight, anchor.aWeight, anchor.bWeight)
    );
    const house = createVillageHouseObject(seed, sector, i);
    const houseSurfaceY = getTerrainSurfaceY(local, EDGE_TYPES.house, Math.floor(hashUnit(seed) * 97), { edgeLockStart: 0.98, edgeLockEnd: 1.0 });
    house.position.set(tileX + local.x, houseSurfaceY + 0.004, tileZ + local.z);
    group.add(house);
    registerPropHitbox(tileX + local.x, tileZ + local.z, HITBOX_R.house);
  }
}

function getSectorSpecialBuildingSafeLocals(a, b, anchors, hasChurch, hasWatchtower) {
  const safeLocals = [];

  if (hasChurch) {
    const anchor = anchors[0] ?? { centerWeight: 0.43, aWeight: 0.285, bWeight: 0.285 };
    safeLocals.push({
      ...trianglePoint(a, b, anchor.centerWeight, anchor.aWeight, anchor.bWeight),
      radius: SPECIAL_BUILDING_HOUSE_SAFE_RADIUS * 1.18
    });
  }

  if (hasWatchtower) {
    safeLocals.push({
      ...trianglePoint(a, b, 0.18, 0.41, 0.41),
      radius: SPECIAL_BUILDING_HOUSE_SAFE_RADIUS
    });
  }

  return safeLocals;
}

function isLocalInsideSpecialBuildingSafeZone(local, safeLocals) {
  for (const zone of safeLocals) {
    const distance = Math.hypot(local.x - zone.x, local.z - zone.z);
    if (distance < zone.radius) return true;
  }
  return false;
}

// ─── BFS zone system — récompenses bâtiments spéciaux ────────────────────────

export function collectVillageChurchSectors(placedTiles) {
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
      if (zone.total < CHURCH_MIN_HOUSES) continue;

      const churchCount = Math.min(
        CHURCH_MAX_PER_ZONE,
        Math.max(1, 1 + Math.floor((zone.total - CHURCH_MIN_HOUSES) / CHURCH_HOUSES_PER_EXTRA))
      );

      const candidates = zone.sectors
        .filter(sectorRef => Math.round(getEdgeValue(sectorRef.tile.tile.edges[sectorRef.edge])) >= 2)
        .sort((a, b) => rankChurchCandidate(a, zone) - rankChurchCandidate(b, zone));

      const fallback = [...zone.sectors].sort((a, b) => rankChurchCandidate(a, zone) - rankChurchCandidate(b, zone));
      const ordered = candidates.length > 0 ? candidates : fallback;
      const usedTiles = new Set();

      for (const candidate of ordered) {
        if (selected.size >= 256) break;
        if (usedTiles.has(candidate.tile.key)) continue;
        selected.add(makeSectorKey(candidate.tile.key, candidate.edge));
        usedTiles.add(candidate.tile.key);
        if (usedTiles.size >= churchCount) break;
      }
    }
  }

  return selected;
}

export function collectVillageWatchtowerSectors(placedTiles, churchSectors = new Set()) {
  const selected = new Set(churchSectors);
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

      const churchCountInZone = zone.sectors.reduce(
        (total, sectorRef) => total + (churchSectors.has(makeSectorKey(sectorRef.tile.key, sectorRef.edge)) ? 1 : 0),
        0
      );

      const towerCount = Math.min(
        WATCHTOWER_MAX_PER_ZONE,
        Math.max(
          1,
          churchCountInZone,
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

function rankChurchCandidate(sectorRef, zone) {
  const value = getEdgeValue(sectorRef.tile.tile.edges[sectorRef.edge]);
  const centerBonus = getTileCenterType(sectorRef.tile) === EDGE_TYPES.house ? 80 : 0;
  const seed = hashUnit(`${zone.total}:${zone.sectors.length}:${sectorRef.tile.key}:${sectorRef.edge}:church-rank`);
  return -(value * 100 + centerBonus + seed);
}

function rankWatchtowerCandidate(sectorRef, zone, selectedSectors = new Set()) {
  const sectorKey = makeSectorKey(sectorRef.tile.key, sectorRef.edge);
  const value = Math.round(getEdgeValue(sectorRef.tile.tile.edges[sectorRef.edge]));
  const alreadySelectedPenalty = selectedSectors.has(sectorKey) ? -999 : 0;
  const edgeBias = EDGE_ORDER.indexOf(sectorRef.edge);
  const seed = hashUnit(`${zone.total}:${zone.sectors.length}:${sectorRef.tile.key}:${sectorRef.edge}:watchtower-rank`);
  return -(alreadySelectedPenalty + value * 90 + edgeBias * 4 + seed);
}

function getHexDistance(q1, r1, q2, r2) {
  const dq = q1 - q2;
  const dr = r1 - r2;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
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

// ─── Matériau fumée (conservé, non utilisé) ───────────────────────────────────

function getSmokeMaterial(index) {
  if (smokeMaterialCache[index]) return smokeMaterialCache[index];

  const material = new THREE.MeshBasicMaterial({
    color: 0xF4F7F8,
    transparent: true,
    opacity: 0.64,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide
  });

  smokeMaterialCache[index] = material;
  return material;
}
