/**
 * fieldZonesOverlay.js — Zones de champs, drapeaux de récompense et safe zones bâtiments.
 *
 * Contient :
 *   - collectFieldZones     : BFS des zones de type 'field'
 *   - createFieldFlags      : moulins + oiseaux au centre de chaque zone
 *   - collectSpecialBuildingSafeZones : zones d'exclusion churches / tours / moulins
 *   - isInsideSpecialBuildingSafeZone : test d'appartenance (exporté pour villageDecorOverlay)
 *
 * Import circulaire avec decorOverlay (createPropModel, createBirdFlock, constantes)
 * — valide en ES modules car tous les accès sont dans des corps de fonctions.
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import {
  EDGE_ORDER,
  EDGE_TYPES,
  SECTOR_DEFS
} from './config.js';
import { hashUnit10k as hashUnit, hashNumber } from './stable/hashUtils.js';
import { axialToWorld, makeHexKey } from './stable/hex.js';
import { HEX_DIRECTIONS, getOppositeEdge } from './stable/placementRules.js';
import { getEdgeValue } from './tileGenerator.js';
import { getTerrainSurfaceY } from './terrainHeight.js';
import { collectVillageChurchSectors, collectVillageWatchtowerSectors } from './houseOverlay.js';
import { makeNodeKey, getTileEdgeType } from './stable/tileUtils.js';
import { collectZone } from './stable/zoneUtils.js';
import { getHexVertex } from './stable/hexGeometry.js';
import { getTileLocalPoint, getSectorWorldCenter } from './stable/propPlacement.js';
// Import circulaire résolu via live bindings ES modules — uniquement dans des corps de fonctions.
import {
  FIELD_FLAG_MIN_TOTAL,
  FIELD_SURFACE_Y,
  SPECIAL_BUILDING_SAFE_RADIUS,
  createPropModel,
  createBirdFlock
} from './decorOverlay.js';

const SECTOR_BY_KEY    = Object.fromEntries(SECTOR_DEFS.map(s => [s.key, s]));
const DIRECTION_BY_EDGE = Object.fromEntries(HEX_DIRECTIONS.map(d => [d.edge, d]));

// ─── Safe zones ────────────────────────────────────────────────────────────────

export function isInsideSpecialBuildingSafeZone(pos, safeZones, fallbackRadius = SPECIAL_BUILDING_SAFE_RADIUS) {
  for (const zone of safeZones) {
    const radius = zone.radius ?? fallbackRadius;
    if (Math.hypot(pos.x - zone.x, pos.z - zone.z) < radius) return true;
  }
  return false;
}

export function collectSpecialBuildingSafeZones(placedTiles) {
  const zones = [];
  const churchSectors     = collectVillageChurchSectors(placedTiles);
  const watchtowerSectors = collectVillageWatchtowerSectors(placedTiles, churchSectors);

  for (const sectorKey of churchSectors) {
    const zone = getVillageSpecialBuildingSafeZone(placedTiles, sectorKey, 'church');
    if (zone) zones.push(zone);
  }

  for (const sectorKey of watchtowerSectors) {
    if (churchSectors.has(sectorKey)) continue;
    const zone = getVillageSpecialBuildingSafeZone(placedTiles, sectorKey, 'watchtower');
    if (zone) zones.push(zone);
  }

  for (const fieldZone of collectFieldZones(placedTiles)) {
    if (fieldZone.total < FIELD_FLAG_MIN_TOTAL) continue;
    zones.push({
      x:      fieldZone.center.x,
      z:      fieldZone.center.z,
      radius: SPECIAL_BUILDING_SAFE_RADIUS * 0.92,
      kind:   'mill'
    });
  }

  return zones;
}

function getVillageSpecialBuildingSafeZone(placedTiles, sectorKey, kind) {
  const separator = sectorKey.lastIndexOf(':');
  if (separator <= 0) return null;
  const tileKey   = sectorKey.slice(0, separator);
  const edge      = sectorKey.slice(separator + 1);
  const placedTile = placedTiles.get(tileKey);
  const sector    = SECTOR_BY_KEY[edge];
  if (!placedTile || !sector) return null;

  const tilePos = axialToWorld(placedTile.q, placedTile.r);
  const a       = getHexVertex(sector.a);
  const b       = getHexVertex(sector.b);
  const local   = kind === 'watchtower'
    ? trianglePoint(a, b, 0.18, 0.41, 0.41)
    : getChurchRewardLocalPoint(placedTile, edge, a, b);

  return {
    x:      tilePos.x + local.x,
    z:      tilePos.z + local.z,
    radius: kind === 'church' ? SPECIAL_BUILDING_SAFE_RADIUS * 1.15 : SPECIAL_BUILDING_SAFE_RADIUS,
    kind
  };
}

function getChurchRewardLocalPoint(placedTile, edge, a, b) {
  const houseCount = Math.max(1, Math.min(4, Math.round(getEdgeValue(placedTile.tile?.edges?.[edge]))));
  const anchor = getHouseColumnAnchors(houseCount)[0] ?? { centerWeight: 0.43, aWeight: 0.285, bWeight: 0.285 };
  return trianglePoint(a, b, anchor.centerWeight, anchor.aWeight, anchor.bWeight);
}

function getHouseColumnAnchors(columnCount) {
  if (columnCount >= 4) return [
    { centerWeight: 0.54, aWeight: 0.33, bWeight: 0.13 },
    { centerWeight: 0.54, aWeight: 0.13, bWeight: 0.33 },
    { centerWeight: 0.30, aWeight: 0.48, bWeight: 0.22 },
    { centerWeight: 0.30, aWeight: 0.22, bWeight: 0.48 }
  ];
  if (columnCount === 3) return [
    { centerWeight: 0.56, aWeight: 0.32, bWeight: 0.12 },
    { centerWeight: 0.56, aWeight: 0.12, bWeight: 0.32 },
    { centerWeight: 0.30, aWeight: 0.35, bWeight: 0.35 }
  ];
  if (columnCount === 2) return [
    { centerWeight: 0.52, aWeight: 0.34, bWeight: 0.14 },
    { centerWeight: 0.52, aWeight: 0.14, bWeight: 0.34 }
  ];
  return [{ centerWeight: 0.43, aWeight: 0.285, bWeight: 0.285 }];
}

function trianglePoint(a, b, centerWeight, aWeight, bWeight) {
  const total = centerWeight + aWeight + bWeight;
  return {
    x: (a.x * aWeight + b.x * bWeight) / total,
    z: (a.z * aWeight + b.z * bWeight) / total
  };
}

// ─── Zones de champs (BFS) ────────────────────────────────────────────────────

export function collectFieldZones(placedTiles) {
  const visited = new Set();
  const zones   = [];

  for (const placedTile of placedTiles.values()) {
    for (const edge of EDGE_ORDER) {
      const nodeKey = makeNodeKey(placedTile.key, edge);
      if (visited.has(nodeKey) || getTileEdgeType(placedTile, edge) !== EDGE_TYPES.field) continue;
      zones.push(collectTextureZone(placedTile, edge, EDGE_TYPES.field, placedTiles, visited));
    }
  }

  return zones;
}

function collectTextureZone(startTile, startEdge, type, placedTiles, visited) {
  const result = collectZone(startTile, startEdge, type, placedTiles, visited, getTextureNeighbors);
  const center = getZoneCenter(result.sectors);
  return { ...result, center, anchor: getNearestSectorRef(result.sectors, center) };
}

function getTextureNeighbors(placedTile, edge, type, placedTiles) {
  const neighbors = [];

  if ((placedTile.tile.center ?? null) === type) {
    for (const sameTileEdge of EDGE_ORDER) {
      if (sameTileEdge !== edge && getTileEdgeType(placedTile, sameTileEdge) === type) {
        neighbors.push({ tile: placedTile, edge: sameTileEdge });
      }
    }
  }

  const direction = DIRECTION_BY_EDGE[edge];
  const neighbor  = placedTiles.get(makeHexKey(placedTile.q + direction.q, placedTile.r + direction.r));
  if (neighbor && getTileEdgeType(neighbor, getOppositeEdge(edge)) === type) {
    neighbors.push({ tile: neighbor, edge: getOppositeEdge(edge) });
  }

  return neighbors;
}

function getZoneCenter(sectors) {
  let weight = 0, x = 0, z = 0;
  for (const sectorRef of sectors) {
    const value  = Math.max(1, getEdgeValue(sectorRef.tile.tile.edges[sectorRef.edge]));
    const center = getSectorWorldCenter(sectorRef.tile, sectorRef.edge);
    x      += center.x * value;
    z      += center.z * value;
    weight += value;
  }
  return { x: x / Math.max(1, weight), z: z / Math.max(1, weight) };
}

function getNearestSectorRef(sectors, center) {
  let best = null, bestDistance = Infinity;
  for (const sectorRef of sectors) {
    const sc = getSectorWorldCenter(sectorRef.tile, sectorRef.edge);
    const d  = Math.hypot(sc.x - center.x, sc.z - center.z);
    if (d < bestDistance) { best = sectorRef; bestDistance = d; }
  }
  return best;
}

// ─── Drapeaux de récompense (moulins + oiseaux) ───────────────────────────────

export function createFieldFlags(placedTiles) {
  const group = new THREE.Group();
  group.name  = 'field-zone-flags-and-crows';

  for (const zone of collectFieldZones(placedTiles)) {
    if (zone.total < FIELD_FLAG_MIN_TOTAL) continue;
    group.add(createFieldFlagReward(zone));
  }

  return group;
}

function createFieldFlagReward(zone) {
  const group = new THREE.Group();
  group.name  = `field-flag-zone-${zone.total}`;
  group.position.set(zone.center.x, FIELD_SURFACE_Y - 0.090, zone.center.z);

  const flagLocal  = zone.anchor ? getTileLocalPoint(group.position, zone.anchor.tile) : null;
  const flagGround = flagLocal
    ? getTerrainSurfaceY(flagLocal, EDGE_TYPES.field, hashNumber(`${zone.total}:field-flag`) % 97)
    : FIELD_SURFACE_Y;
  group.position.y = flagGround - 0.020;
  group.userData   = {
    effectKind: 'field-flag-idle',
    phase: hashUnit(`${zone.center.x}:${zone.center.z}:idle`) * Math.PI * 2
  };

  const seed = hashNumber(`${zone.total}:${zone.sectors.length}:${Math.round(zone.center.x * 100)}:${Math.round(zone.center.z * 100)}`);
  group.rotation.y = hashUnit(`${seed}:rot`) * Math.PI * 2;

  const flagVariant = hashUnit(`${seed}:moulin-variant`) < 0.5 ? 'field-flag' : 'field-flag-2';
  const flag = createPropModel(flagVariant, `${seed}:flag`);
  if (flag) group.add(flag);

  const flockCount = Math.min(3, 1 + Math.floor(zone.total / 8));
  for (let i = 0; i < flockCount; i += 1) {
    const flock = createBirdFlock(`${seed}:bird-flock:${i}`);
    if (!flock) continue;

    const heightMultiplier = 1.75 + hashUnit(`${seed}:birdheight:${i}`) * 1.65;
    const altitudeStagger  = i * 0.42 + hashUnit(`${seed}:bird-altitude-stagger:${i}`) * 0.95;
    flock.userData = {
      ...flock.userData,
      effectKind:    'bird-flock-orbit',
      cx: 0, cy: (1.02 + i * 0.16) * heightMultiplier + altitudeStagger, cz: 0,
      rx:            0.42 + hashUnit(`${seed}:birdrx:${i}`)         * 0.68,
      rz:            0.26 + hashUnit(`${seed}:birdrz:${i}`)         * 0.54,
      speed:         0.28 + hashUnit(`${seed}:birdspeed:${i}`)      * 0.72,
      direction:     hashUnit(`${seed}:birddir:${i}`) > 0.5 ? 1 : -1,
      phase:         hashUnit(`${seed}:birdphase:${i}`)             * Math.PI * 2,
      verticalSpeed: 0.38 + hashUnit(`${seed}:birdvspeed:${i}`)     * 1.20,
      verticalAmp:   0.08 + hashUnit(`${seed}:birdvamp:${i}`)       * 0.28,
      bobAmp:        0.040 + hashUnit(`${seed}:birdbob:${i}`)       * 0.115,
      wobbleSpeedA:  0.32 + hashUnit(`${seed}:birdwoba:${i}`)       * 1.10,
      wobbleSpeedB:  0.30 + hashUnit(`${seed}:birdwobb:${i}`)       * 1.20,
      wobbleSpeedC:  0.28 + hashUnit(`${seed}:birdwobc:${i}`)       * 1.30,
      rxJitter:      0.08 + hashUnit(`${seed}:birdrxj:${i}`)        * 0.16,
      rzJitter:      0.08 + hashUnit(`${seed}:birdrzj:${i}`)        * 0.18,
      sideDrift:     0.018 + hashUnit(`${seed}:birdside:${i}`)      * 0.060,
      bankSpeed:     1.8 + hashUnit(`${seed}:birdbank:${i}`)        * 2.4,
      bankAmp:       0.16 + hashUnit(`${seed}:birdbankamp:${i}`)    * 0.26
    };
    group.add(flock);
  }

  return group;
}
