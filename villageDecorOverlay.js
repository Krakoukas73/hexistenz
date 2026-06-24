/**
 * villageDecorOverlay.js — Props de décoration de village et bateaux côtiers.
 *
 * Contient :
 *   - createRoadsideVillageProps : bancs, panneaux, tonneaux, charrettes
 *   - createShoreBoats           : bateaux statiques sur les plages
 *   + tous les helpers de placement (isRoadDecorEdge, isShoreDecorEdge,
 *     isVillageVicinityEdge, snapPropToSafeSurface, nudgeRoadsideProp,
 *     getEdgeOutwardAngle, pickShoreBoatVariant, helpers bateaux côtiers)
 *
 * Import circulaire avec decorOverlay (createPropModel, constantes)
 * — valide en ES modules car tous les accès sont dans des corps de fonctions.
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import {
  EDGE_ORDER,
  EDGE_TYPES,
  HEX_SIZE,
  SECTOR_DEFS
} from './config.js';
import { hashUnit10k as hashUnit, hashNumber } from './stable/hashUtils.js';
import { axialToWorld, makeHexKey } from './stable/hex.js';
import { HEX_DIRECTIONS, getOppositeEdge } from './stable/placementRules.js';
import { getTileEdgeType } from './stable/tileUtils.js';
import { placeObjectOnTerrain, getTerrainSurfaceY } from './terrainHeight.js';
import { HITBOX_R } from './variables.js';
import { registerPropHitbox } from './stable/propHitboxRegistry.js';
import { tryResolve } from './stable/propHitboxRegistry.js';
import { getHexVertex, normalize2 } from './stable/hexGeometry.js';
import {
  snapPropBottomToSurface,
  isSingleTerrainFootprint,
  isSafePropGroundType,
  getEdgeFromLocalPoint,
  getTileLocalPoint,
  getSectorWorldCenter
} from './stable/propPlacement.js';
import { isInsideSpecialBuildingSafeZone } from './fieldZonesOverlay.js';
// Import circulaire résolu via live bindings ES modules — uniquement dans des corps de fonctions.
import {
  createPropModel,
  ROAD_DECOR_Y,
  BARREL_TARGET_WIDTH,
  SHORE_BOAT_Y,
  SPECIAL_BUILDING_BOAT_SAFE_RADIUS
} from './decorOverlay.js';

const SECTOR_BY_KEY     = Object.fromEntries(SECTOR_DEFS.map(s => [s.key, s]));
const DIRECTION_BY_EDGE = Object.fromEntries(HEX_DIRECTIONS.map(d => [d.edge, d]));

// ─── Bancs, panneaux, tonneaux, charrettes ────────────────────────────────────

export function createRoadsideVillageProps(placedTiles, specialBuildingSafeZones = []) {
  const group = new THREE.Group();
  group.name = 'village-roadside-glb-props';

  for (const placedTile of placedTiles.values()) {
    const tilePos    = axialToWorld(placedTile.q, placedTile.r);
    const tileCenter = new THREE.Vector3(tilePos.x, ROAD_DECOR_Y, tilePos.z);
    const roadEdges  = EDGE_ORDER.filter(edge => isRoadDecorEdge(placedTile, edge));

    // ── Bancs ──
    for (const edge of roadEdges) {
      const edgeType = getTileEdgeType(placedTile, edge);
      const seed     = `${placedTile.key}:bench:${edge}`;
      const chance   = edgeType === EDGE_TYPES.forest ? 0.24 : 0.18;
      if (hashUnit(seed) > chance) continue;

      const center = getSectorWorldCenter(placedTile, edge);
      const pos    = new THREE.Vector3(center.x, ROAD_DECOR_Y, center.z)
        .lerp(tileCenter, edgeType === EDGE_TYPES.forest ? 0.22 : 0.26);
      nudgeRoadsideProp(pos, placedTile, edge, seed, edgeType === EDGE_TYPES.forest ? 0.038 : 0.032);
      if (!snapPropToSafeSurface(pos, placedTile, edge, seed, { footprintRadius: HEX_SIZE * 0.075 })) continue;
      if (isInsideSpecialBuildingSafeZone(pos, specialBuildingSafeZones)) continue;

      const bench = createPropModel('road-bench', seed);
      if (!bench) continue;
      bench.name = edgeType === EDGE_TYPES.forest ? 'forest-pathside-bench-glb' : 'grass-roadside-bench-glb';
      bench.position.copy(pos);
      const benchYaw  = getEdgeOutwardAngle(edge) + Math.PI / 2 + (hashUnit(`${seed}:yaw`) - 0.5) * 0.55;
      const benchTopY = placeObjectOnTerrain(bench, getTileLocalPoint(pos, placedTile), edgeType, hashNumber(seed) % 97, {
        groundOffset:  0.012,
        alignToSlope:  false,
        yaw:           benchYaw,
        edgeLockStart: 0.98,
        edgeLockEnd:   1.0
      });
      if (benchTopY !== null) snapPropBottomToSurface(bench, benchTopY - 0.012, 0.004);
      group.add(bench);
      registerPropHitbox(bench.position.x, bench.position.z, HITBOX_R.bench);
    }

    // ── Panneaux de signalisation (bords de route) ──
    for (const edge of roadEdges) {
      const edgeType = getTileEdgeType(placedTile, edge);
      const seed     = `${placedTile.key}:signpost:${edge}`;
      const chance   = edgeType === EDGE_TYPES.forest ? 0.36 : 0.30;
      if (hashUnit(seed) > chance) continue;

      const center = getSectorWorldCenter(placedTile, edge);
      const pos    = new THREE.Vector3(center.x, ROAD_DECOR_Y, center.z)
        .lerp(tileCenter, edgeType === EDGE_TYPES.forest ? 0.20 : 0.24);
      nudgeRoadsideProp(pos, placedTile, edge, seed, edgeType === EDGE_TYPES.forest ? 0.046 : 0.040);
      if (!snapPropToSafeSurface(pos, placedTile, edge, seed)) continue;
      if (isInsideSpecialBuildingSafeZone(pos, specialBuildingSafeZones)) continue;

      const sign = createPropModel('road-signpost', seed);
      if (!sign) continue;
      sign.name = edgeType === EDGE_TYPES.forest ? 'forest-path-signpost-glb' : 'grass-road-signpost-glb';
      sign.position.copy(pos);
      const signYaw  = getEdgeOutwardAngle(edge) + (hashUnit(`${seed}:yaw`) - 0.5) * 0.65;
      const signTopY = placeObjectOnTerrain(sign, getTileLocalPoint(pos, placedTile), edgeType, hashNumber(seed) % 97, {
        groundOffset:  0.006,
        alignToSlope:  false,
        yaw:           signYaw,
        edgeLockStart: 0.98,
        edgeLockEnd:   1.0
      });
      if (signTopY !== null) snapPropBottomToSurface(sign, signTopY - 0.006, 0.003);
      group.add(sign);
      registerPropHitbox(sign.position.x, sign.position.z, HITBOX_R.signpost);
    }

    // ── Panneaux sur rive (shore signpost) ──
    for (const edge of EDGE_ORDER) {
      if (!isShoreDecorEdge(placedTile, edge, placedTiles)) continue;
      const edgeType = getTileEdgeType(placedTile, edge);
      const seed     = `${placedTile.key}:shore-signpost:${edge}`;
      if (hashUnit(seed) > 0.58) continue;

      const center = getSectorWorldCenter(placedTile, edge);
      const pos    = new THREE.Vector3(center.x, ROAD_DECOR_Y, center.z).lerp(tileCenter, 0.24);
      nudgeRoadsideProp(pos, placedTile, edge, seed, 0.038);
      if (!snapPropToSafeSurface(pos, placedTile, edge, seed)) continue;
      if (isInsideSpecialBuildingSafeZone(pos, specialBuildingSafeZones)) continue;

      const sign = createPropModel('road-signpost', seed);
      if (!sign) continue;
      sign.name = 'shoreline-signpost-glb';
      sign.position.copy(pos);
      const shoreSignYaw  = getEdgeOutwardAngle(edge) + (hashUnit(`${seed}:yaw`) - 0.5) * 0.80;
      const shoreSignTopY = placeObjectOnTerrain(sign, getTileLocalPoint(pos, placedTile), edgeType, hashNumber(seed) % 97, {
        groundOffset:  0.006,
        alignToSlope:  false,
        yaw:           shoreSignYaw,
        edgeLockStart: 0.98,
        edgeLockEnd:   1.0
      });
      if (shoreSignTopY !== null) snapPropBottomToSurface(sign, shoreSignTopY - 0.006, 0.003);
      group.add(sign);
      registerPropHitbox(sign.position.x, sign.position.z, HITBOX_R.signpost);
    }

    // ── Tonneaux et charrettes — abords immédiats des villages ──
    for (const edge of roadEdges) {
      if (!isVillageVicinityEdge(placedTile, edge, placedTiles)) continue;

      const edgeType = getTileEdgeType(placedTile, edge);
      const seed     = `${placedTile.key}:village-prop:${edge}`;
      if (hashUnit(seed) > 0.72) continue;

      const center  = getSectorWorldCenter(placedTile, edge);
      const basePos = new THREE.Vector3(center.x, ROAD_DECOR_Y, center.z)
        .lerp(tileCenter, edgeType === EDGE_TYPES.forest ? 0.22 : 0.26);
      nudgeRoadsideProp(basePos, placedTile, edge, seed, 0.034);

      const isCart = hashUnit(`${seed}:kind`) > 0.136; // 72 %
      // Pas de charrette sur tuile avec eau ou rail
      if (isCart && EDGE_ORDER.some(e => {
        const t = getTileEdgeType(placedTile, e);
        return t === EDGE_TYPES.water || t === EDGE_TYPES.rail;
      })) continue;
      if (isCart) {
        if (!snapPropToSafeSurface(basePos, placedTile, edge, seed, { footprintRadius: HEX_SIZE * 0.14 })) continue;
        if (isInsideSpecialBuildingSafeZone(basePos, specialBuildingSafeZones)) continue;
        const _cartR = tryResolve(basePos.x, basePos.z, HITBOX_R.cart);
        if (!_cartR) continue;
        basePos.x = _cartR.x; basePos.z = _cartR.z;

        const cart = createPropModel('cart', seed);
        if (!cart) continue;
        cart.name = 'village-cart-glb';
        cart.position.copy(basePos);
        const cartYaw  = getEdgeOutwardAngle(edge) + (hashUnit(`${seed}:yaw`) - 0.5) * 1.20;
        const cartTopY = placeObjectOnTerrain(cart, getTileLocalPoint(basePos, placedTile), edgeType, hashNumber(seed) % 97, {
          groundOffset:  0.005,
          alignToSlope:  false,
          yaw:           cartYaw,
          edgeLockStart: 0.98,
          edgeLockEnd:   1.0
        });
        if (cartTopY !== null) snapPropBottomToSurface(cart, cartTopY - 0.005, 0.003);
        group.add(cart);
        registerPropHitbox(cart.position.x, cart.position.z, HITBOX_R.cart);
      } else {
        // 1, 2 ou 3 tonneaux côte à côte
        const count  = hashUnit(`${seed}:count`) < 0.15 ? 1 : hashUnit(`${seed}:count`) < 0.55 ? 2 : 3;
        const sector = SECTOR_BY_KEY[edge];
        const vA     = getHexVertex(sector.a);
        const vB     = getHexVertex(sector.b);
        const tangent        = normalize2(vB.x - vA.x, vB.z - vA.z);
        const barrelSpacing  = BARREL_TARGET_WIDTH * 1.20;

        for (let b = 0; b < count; b += 1) {
          const offset = (b - (count - 1) * 0.5) * barrelSpacing;
          const bPos   = basePos.clone();
          bPos.x += tangent.x * offset;
          bPos.z += tangent.z * offset;

          const bSeed = `${seed}:barrel:${b}`;
          if (!snapPropToSafeSurface(bPos, placedTile, edge, bSeed, { footprintRadius: HEX_SIZE * 0.075 })) continue;
          if (isInsideSpecialBuildingSafeZone(bPos, specialBuildingSafeZones)) continue;
          const _barrelR = tryResolve(bPos.x, bPos.z, HITBOX_R.barrel);
          if (!_barrelR) continue;
          bPos.x = _barrelR.x; bPos.z = _barrelR.z;

          const barrelKey  = hashUnit(`${bSeed}:variant`) > 0.5 ? 'barrel-1' : 'barrel-2';
          const barrel     = createPropModel(barrelKey, bSeed);
          if (!barrel) continue;
          barrel.name = 'village-barrel-glb';
          barrel.position.copy(bPos);
          const barrelYaw  = hashUnit(`${bSeed}:yaw`) * Math.PI * 2;
          const barrelTopY = placeObjectOnTerrain(barrel, getTileLocalPoint(bPos, placedTile), edgeType, hashNumber(bSeed) % 97, {
            groundOffset:  0.005,
            alignToSlope:  false,
            yaw:           barrelYaw,
            edgeLockStart: 0.98,
            edgeLockEnd:   1.0
          });
          if (barrelTopY !== null) snapPropBottomToSurface(barrel, barrelTopY - 0.005, 0.003);
          group.add(barrel);
          registerPropHitbox(barrel.position.x, barrel.position.z, HITBOX_R.barrel);
        }
      }
    }

    // ── Tonneaux et charrettes à l'intérieur des villages (arêtes house) ──
    for (const edge of EDGE_ORDER) {
      if (getTileEdgeType(placedTile, edge) !== EDGE_TYPES.house) continue;

      const seedInt = `${placedTile.key}:village-interior-prop:${edge}`;
      if (hashUnit(seedInt) > 0.46) continue;

      const center = getSectorWorldCenter(placedTile, edge);
      const pos    = new THREE.Vector3(center.x, ROAD_DECOR_Y, center.z).lerp(tileCenter, 0.65);
      nudgeRoadsideProp(pos, placedTile, edge, seedInt, 0.028);
      if (isInsideSpecialBuildingSafeZone(pos, specialBuildingSafeZones)) continue;

      const isCartInt = hashUnit(`${seedInt}:kind`) > 0.34; // 55 %
      // Pas de charrette intérieure sur tuile avec eau ou rail
      if (isCartInt && EDGE_ORDER.some(e => {
        const t = getTileEdgeType(placedTile, e);
        return t === EDGE_TYPES.water || t === EDGE_TYPES.rail;
      })) continue;
      if (isCartInt) {
        const _cartIntR = tryResolve(pos.x, pos.z, HITBOX_R.cart);
        if (!_cartIntR) continue;
        pos.x = _cartIntR.x; pos.z = _cartIntR.z;

        const cart = createPropModel('cart', seedInt);
        if (!cart) continue;
        cart.name = 'village-cart-glb';
        cart.position.copy(pos);
        const cartYaw  = getEdgeOutwardAngle(edge) + (hashUnit(`${seedInt}:yaw`) - 0.5) * 1.20;
        const cartTopY = placeObjectOnTerrain(cart, getTileLocalPoint(pos, placedTile), EDGE_TYPES.house, hashNumber(seedInt) % 97, {
          groundOffset:  0.005,
          alignToSlope:  false,
          yaw:           cartYaw,
          edgeLockStart: 0.98,
          edgeLockEnd:   1.0
        });
        if (cartTopY !== null) snapPropBottomToSurface(cart, cartTopY - 0.005, 0.003);
        group.add(cart);
        registerPropHitbox(cart.position.x, cart.position.z, HITBOX_R.cart);
      } else {
        const count      = hashUnit(`${seedInt}:count`) < 0.25 ? 1 : hashUnit(`${seedInt}:count`) < 0.65 ? 2 : 3;
        const sectorInt  = SECTOR_BY_KEY[edge];
        const vAi        = getHexVertex(sectorInt.a);
        const vBi        = getHexVertex(sectorInt.b);
        const tangentInt = normalize2(vBi.x - vAi.x, vBi.z - vAi.z);
        const barrelSpacingInt = BARREL_TARGET_WIDTH * 1.20;

        for (let b = 0; b < count; b += 1) {
          const offset = (b - (count - 1) * 0.5) * barrelSpacingInt;
          const bPos   = pos.clone();
          bPos.x += tangentInt.x * offset;
          bPos.z += tangentInt.z * offset;
          if (isInsideSpecialBuildingSafeZone(bPos, specialBuildingSafeZones)) continue;

          const bSeed    = `${seedInt}:barrel:${b}`;
          const _barrelIntR = tryResolve(bPos.x, bPos.z, HITBOX_R.barrel);
          if (!_barrelIntR) continue;
          bPos.x = _barrelIntR.x; bPos.z = _barrelIntR.z;

          const barrelKey  = hashUnit(`${bSeed}:variant`) > 0.5 ? 'barrel-1' : 'barrel-2';
          const barrel     = createPropModel(barrelKey, bSeed);
          if (!barrel) continue;
          barrel.name = 'village-barrel-glb';
          barrel.position.copy(bPos);
          const barrelYaw  = hashUnit(`${bSeed}:yaw`) * Math.PI * 2;
          const barrelTopY = placeObjectOnTerrain(barrel, getTileLocalPoint(bPos, placedTile), EDGE_TYPES.house, hashNumber(bSeed) % 97, {
            groundOffset:  0.005,
            alignToSlope:  false,
            yaw:           barrelYaw,
            edgeLockStart: 0.98,
            edgeLockEnd:   1.0
          });
          if (barrelTopY !== null) snapPropBottomToSurface(barrel, barrelTopY - 0.005, 0.003);
          group.add(barrel);
          registerPropHitbox(barrel.position.x, barrel.position.z, HITBOX_R.barrel);
        }
      }
    }

    // ── Fontaines — tuiles avec maisons (44 %) ou prairie adjacente à un village (8 %) ──
    const houseEdges = EDGE_ORDER.filter(e => getTileEdgeType(placedTile, e) === EDGE_TYPES.house);
    if (houseEdges.length >= 1) {
      // Pas de fontaine sur tuile avec rail ou eau
      const tileHasRailOrWater = EDGE_ORDER.some(e => {
        const t = getTileEdgeType(placedTile, e);
        return t === EDGE_TYPES.rail || t === EDGE_TYPES.water;
      });
      const seedF = `${placedTile.key}:fountain`;
      if (!tileHasRailOrWater && hashUnit(seedF) <= 0.70) {
        // Barycentre des centres de secteurs house, tiré vers le centre de la tuile
        let fx = 0, fz = 0;
        for (const he of houseEdges) {
          const sc = getSectorWorldCenter(placedTile, he);
          fx += sc.x; fz += sc.z;
        }
        fx /= houseEdges.length;
        fz /= houseEdges.length;
        const pull = 0.50 + hashUnit(`${seedF}:pull`) * 0.25;
        fx += (tilePos.x - fx) * pull;
        fz += (tilePos.z - fz) * pull;

        // Légère variation de position
        const nudgeAngle = hashUnit(`${seedF}:angle`) * Math.PI * 2;
        const nudgeDist  = hashUnit(`${seedF}:dist`) * HEX_SIZE * 0.06;
        fx += Math.cos(nudgeAngle) * nudgeDist;
        fz += Math.sin(nudgeAngle) * nudgeDist;

        const fPos = new THREE.Vector3(fx, ROAD_DECOR_Y, fz);
        // Pas de tryResolve : la fontaine est intentionnellement au cœur du village,
        // entre les bâtiments — tryResolve échouerait systématiquement sur leurs hitbox.
        if (!isInsideSpecialBuildingSafeZone(fPos, specialBuildingSafeZones)) {
          const fountainKey = hashUnit(`${seedF}:variant`) < 0.5 ? 'fountain-1' : 'fountain-2';
          const fountain    = createPropModel(fountainKey, seedF);
          if (fountain) {
            fountain.name     = 'village-fountain-glb';
            fountain.position.copy(fPos);
            fountain.rotation.y = hashUnit(`${seedF}:rot`) * Math.PI * 2;
            group.add(fountain);
            registerPropHitbox(fountain.position.x, fountain.position.z, HITBOX_R.fountain);
          }
        }
      }
    }

    // Fontaine prairie : tuile sans maison, adjacente à un village, chance rare
    if (houseEdges.length === 0) {
      const hasGrass = EDGE_ORDER.some(e => {
        const t = getTileEdgeType(placedTile, e);
        return t === EDGE_TYPES.grass || t === EDGE_TYPES.forest;
      });
      if (hasGrass) {
        const isNearVillage = HEX_DIRECTIONS.some(dir => {
          const nb = placedTiles.get(makeHexKey(placedTile.q + dir.q, placedTile.r + dir.r));
          return nb && EDGE_ORDER.some(e => getTileEdgeType(nb, e) === EDGE_TYPES.house);
        });
        if (isNearVillage) {
          const seedFP = `${placedTile.key}:fountain-prairie`;
          if (hashUnit(seedFP) <= 0.18) {
            const angle = hashUnit(`${seedFP}:angle`) * Math.PI * 2;
            const dist  = hashUnit(`${seedFP}:dist`) * HEX_SIZE * 0.10;
            const fPos  = new THREE.Vector3(
              tilePos.x + Math.cos(angle) * dist,
              ROAD_DECOR_Y,
              tilePos.z + Math.sin(angle) * dist
            );
            const tileHasRailOrWaterP = EDGE_ORDER.some(e => {
              const t = getTileEdgeType(placedTile, e);
              return t === EDGE_TYPES.rail || t === EDGE_TYPES.water;
            });
            if (!tileHasRailOrWaterP && !isInsideSpecialBuildingSafeZone(fPos, specialBuildingSafeZones)) {
              const fountainKey = hashUnit(`${seedFP}:variant`) < 0.5 ? 'fountain-1' : 'fountain-2';
              const fountain    = createPropModel(fountainKey, seedFP);
              if (fountain) {
                fountain.name       = 'village-fountain-glb';
                fountain.position.copy(fPos);
                fountain.rotation.y = hashUnit(`${seedFP}:rot`) * Math.PI * 2;
                group.add(fountain);
                registerPropHitbox(fountain.position.x, fountain.position.z, HITBOX_R.fountain);
              }
            }
          }
        }
      }
    }
  }

  return group;
}

// ─── Bateaux côtiers ─────────────────────────────────────────────────────────

export function createShoreBoats(placedTiles, specialBuildingSafeZones = []) {
  const group = new THREE.Group();
  group.name = 'water-shore-static-boats-glb';

  for (const placedTile of placedTiles.values()) {
    const tilePos = axialToWorld(placedTile.q, placedTile.r);
    for (const edge of EDGE_ORDER) {
      if (!isShoreBoatEligibleBeachEdge(placedTile, edge, placedTiles)) continue;

      const seed = `${placedTile.key}:shore-boat:${edge}`;
      if (hashUnit(seed) > 0.72) continue;

      const sector = SECTOR_BY_KEY[edge];
      const a      = getHexVertex(sector.a);
      const b      = getHexVertex(sector.b);
      const mid    = new THREE.Vector3((a.x + b.x) / 2, SHORE_BOAT_Y, (a.z + b.z) / 2);
      const inward = getShoreBoatBeachDirection(placedTile, edge, placedTiles, mid);

      const boat = createPropModel(pickShoreBoatVariant(seed), seed);
      if (!boat) continue;
      boat.name = 'water-shore-inert-boat-glb';
      boat.position.set(
        tilePos.x + mid.x + inward.x * HEX_SIZE * 0.5,
        SHORE_BOAT_Y,
        tilePos.z + mid.z + inward.z * HEX_SIZE * 0.5
      );
      if (isInsideSpecialBuildingSafeZone(boat.position, specialBuildingSafeZones, SPECIAL_BUILDING_BOAT_SAFE_RADIUS)) continue;
      boat.rotation.y = Math.atan2(inward.x, inward.z) + Math.PI / 2 + (hashUnit(`${seed}:yaw`) - 0.5) * 0.50;
      boat.scale.multiplyScalar(0.92 + hashUnit(`${seed}:scale`) * 0.18);
      group.add(boat);
    }
  }

  return group;
}

// ─── Helpers bateaux ─────────────────────────────────────────────────────────

function isShoreBoatEligibleBeachEdge(placedTile, edge, placedTiles) {
  if (getTileEdgeType(placedTile, edge) !== EDGE_TYPES.water) return false;
  const direction    = DIRECTION_BY_EDGE[edge];
  const neighbor     = placedTiles.get(makeHexKey(placedTile.q + direction.q, placedTile.r + direction.r));
  const oppositeType = neighbor ? getTileEdgeType(neighbor, getOppositeEdge(edge)) : null;
  if (neighbor && oppositeType !== EDGE_TYPES.water && oppositeType !== EDGE_TYPES.rail) return true;
  return hasLandEdgeAdjacentToEdge(placedTile, edge);
}

function hasLandEdgeAdjacentToEdge(placedTile, edge) {
  const index    = EDGE_ORDER.indexOf(edge);
  if (index < 0) return false;
  const prevEdge = EDGE_ORDER[(index + EDGE_ORDER.length - 1) % EDGE_ORDER.length];
  const nextEdge = EDGE_ORDER[(index + 1) % EDGE_ORDER.length];
  return isBeachLandEdge(placedTile, prevEdge) || isBeachLandEdge(placedTile, nextEdge);
}

function isBeachLandEdge(placedTile, edge) {
  const type = getTileEdgeType(placedTile, edge);
  return type !== EDGE_TYPES.water && type !== EDGE_TYPES.rail;
}

function getShoreBoatBeachDirection(placedTile, edge, placedTiles, mid) {
  const direction = DIRECTION_BY_EDGE[edge];
  const neighbor  = placedTiles.get(makeHexKey(placedTile.q + direction.q, placedTile.r + direction.r));
  if (neighbor && isBeachLandEdge(neighbor, getOppositeEdge(edge))) {
    const towardNeighbor = new THREE.Vector3(direction.q, 0, direction.r);
    if (towardNeighbor.lengthSq() > 0.001) return towardNeighbor.normalize();
  }
  const adjacentLand = getAdjacentBeachLandVector(placedTile, edge);
  if (adjacentLand.lengthSq() > 0.001) return adjacentLand.normalize();
  const towardTileCenter = new THREE.Vector3(-mid.x, 0, -mid.z);
  if (towardTileCenter.lengthSq() > 0.001) return towardTileCenter.normalize();
  return new THREE.Vector3(0, 0, 1);
}

function getAdjacentBeachLandVector(placedTile, edge) {
  const index  = EDGE_ORDER.indexOf(edge);
  const vector = new THREE.Vector3();
  if (index < 0) return vector;

  const addLandEdgeVector = candidateEdge => {
    if (!isBeachLandEdge(placedTile, candidateEdge)) return;
    const sector = SECTOR_BY_KEY[candidateEdge];
    const a = getHexVertex(sector.a);
    const b = getHexVertex(sector.b);
    vector.x += (a.x + b.x) / 2;
    vector.z += (a.z + b.z) / 2;
  };

  addLandEdgeVector(EDGE_ORDER[(index + EDGE_ORDER.length - 1) % EDGE_ORDER.length]);
  addLandEdgeVector(EDGE_ORDER[(index + 1) % EDGE_ORDER.length]);
  return vector;
}

function pickShoreBoatVariant(seedKey) {
  return hashUnit(`${seedKey}:shore-boat-variant`) < 0.5 ? 'shore-boat-1' : 'shore-boat-2';
}

// ─── Helpers placement ────────────────────────────────────────────────────────

function isRoadDecorEdge(placedTile, edge) {
  const type = getTileEdgeType(placedTile, edge);
  return type === EDGE_TYPES.forest || type === EDGE_TYPES.grass;
}

function isShoreDecorEdge(placedTile, edge, placedTiles) {
  const type = getTileEdgeType(placedTile, edge);
  if (!isSafePropGroundType(type)) return false;
  const direction = DIRECTION_BY_EDGE[edge];
  const neighbor  = placedTiles.get(makeHexKey(placedTile.q + direction.q, placedTile.r + direction.r));
  return neighbor && getTileEdgeType(neighbor, getOppositeEdge(edge)) === EDGE_TYPES.water;
}

function isVillageVicinityEdge(placedTile, edge, placedTiles) {
  if (EDGE_ORDER.some(e => getTileEdgeType(placedTile, e) === EDGE_TYPES.house)) return true;
  for (const dir of HEX_DIRECTIONS) {
    const neighbor = placedTiles.get(makeHexKey(placedTile.q + dir.q, placedTile.r + dir.r));
    if (neighbor && EDGE_ORDER.some(e => getTileEdgeType(neighbor, e) === EDGE_TYPES.house)) return true;
  }
  return false;
}

function snapPropToSafeSurface(pos, placedTile, fallbackEdge, seed, options = {}) {
  const tilePos = axialToWorld(placedTile.q, placedTile.r);
  const local   = new THREE.Vector3(pos.x - tilePos.x, 0, pos.z - tilePos.z);
  const edge    = getEdgeFromLocalPoint(local) ?? fallbackEdge;
  const type    = getTileEdgeType(placedTile, edge);
  if (!isSafePropGroundType(type)) return false;

  const radius = Math.hypot(local.x, local.z) / Math.max(HEX_SIZE, 0.001);
  if (radius < 0.30 || radius > 0.86) return false;
  if (!isSingleTerrainFootprint(local, placedTile, type, options.footprintRadius ?? HEX_SIZE * 0.045)) return false;

  pos.y = getTerrainSurfaceY(local, type, hashNumber(seed) % 97, {
    edgeLockStart: 0.98,
    edgeLockEnd:   1.0
  }) + 0.010;
  return true;
}

function nudgeRoadsideProp(pos, placedTile, edge, seed, amount) {
  const sector  = SECTOR_BY_KEY[edge];
  const a       = getHexVertex(sector.a);
  const b       = getHexVertex(sector.b);
  const tangent = normalize2(b.x - a.x, b.z - a.z);
  const sideSign = hashUnit(`${seed}:side`) > 0.5 ? 1 : -1;
  const along    = (hashUnit(`${seed}:along`) - 0.5) * amount * 1.55;
  const side     = sideSign * (amount * 0.45 + hashUnit(`${seed}:offset`) * amount);
  pos.x += tangent.x * along - tangent.z * side;
  pos.z += tangent.z * along + tangent.x * side;
}

function getEdgeOutwardAngle(edge) {
  const sector = SECTOR_BY_KEY[edge];
  const a      = getHexVertex(sector.a);
  const b      = getHexVertex(sector.b);
  return Math.atan2((a.x + b.x) / 2, (a.z + b.z) / 2);
}
