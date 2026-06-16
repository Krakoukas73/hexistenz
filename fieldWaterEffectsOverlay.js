import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';
import { EDGE_ORDER, EDGE_TYPES, HEX_SIZE, TILE_VISUAL } from './config.js';
import { axialToWorld, makeHexKey } from './stable/hex.js';
import { HEX_DIRECTIONS, getOppositeEdge } from './stable/placementRules.js';
import { getEdgeType, getEdgeValue } from './tileGenerator.js';
import { getTerrainSurfaceY, placeObjectOnTerrain } from './terrainHeight.js';

const SECTOR_DEFS = [
  { key: 'n', a: 0, b: 1 },
  { key: 'ne', a: 1, b: 2 },
  { key: 'se', a: 2, b: 3 },
  { key: 's', a: 3, b: 4 },
  { key: 'sw', a: 4, b: 5 },
  { key: 'nw', a: 5, b: 0 }
];

const SECTOR_BY_KEY = Object.fromEntries(SECTOR_DEFS.map(sector => [sector.key, sector]));
const DIRECTION_BY_EDGE = Object.fromEntries(HEX_DIRECTIONS.map(direction => [direction.edge, direction]));
const WATER_SURFACE_Y = (TILE_VISUAL.waterY ?? -0.075) + 0.012;
const FIELD_SURFACE_Y = 0.070;
const FIELD_FLAG_MIN_TOTAL = 5;
const FIELD_FLAG_TARGET_HEIGHT = HEX_SIZE * 0.32;
const BENCH_TARGET_LENGTH = HEX_SIZE * 0.16;
const SIGNPOST_TARGET_HEIGHT = HEX_SIZE * 0.28;
const SHORE_BOAT_TARGET_LENGTH = HEX_SIZE * 0.56;
const ROAD_DECOR_Y = ((TILE_VISUAL.tileThickness ?? 0.12) * -0.30) + 0.010;
const SHORE_BOAT_Y = WATER_SURFACE_Y + 0.006;
const PROP_MODEL_DEFS = [
  { key: 'field-flag', url: './glb/drapeau.glb', target: FIELD_FLAG_TARGET_HEIGHT, mode: 'height' },
  { key: 'road-bench', url: './glb/banc.glb', target: BENCH_TARGET_LENGTH, mode: 'length' },
  { key: 'road-signpost', url: './glb/poteau-indicateur.glb', target: SIGNPOST_TARGET_HEIGHT, mode: 'height' },
  { key: 'shore-boat', url: './glb/barque.glb', target: SHORE_BOAT_TARGET_LENGTH, mode: 'length' }
];

const WATER_DROP_MAT = new THREE.MeshBasicMaterial({
  color: 0xBFEFFF,
  transparent: true,
  opacity: 0.82,
  depthWrite: false
});
const WATER_FOAM_MAT = new THREE.MeshBasicMaterial({
  color: 0xE8FAFF,
  transparent: true,
  opacity: 0.72,
  depthWrite: false,
  side: THREE.DoubleSide
});
const WATER_STREAK_MAT = new THREE.MeshBasicMaterial({
  color: 0xD8F8FF,
  transparent: true,
  opacity: 0.62,
  depthWrite: false
});
const WATER_MIST_MAT = new THREE.MeshBasicMaterial({
  color: 0xF3FDFF,
  transparent: true,
  opacity: 0.38,
  depthWrite: false
});
const WOOD_MAT = new THREE.MeshStandardMaterial({ color: 0x7A4A22, roughness: 0.85, metalness: 0.02 });
const STRAW_MAT = new THREE.MeshStandardMaterial({ color: 0xDAB84A, roughness: 0.9, metalness: 0.01 });
const CLOTH_MAT = new THREE.MeshStandardMaterial({ color: 0x7C3F25, roughness: 0.9, metalness: 0.01 });
const HAT_MAT = new THREE.MeshStandardMaterial({ color: 0xB48C34, roughness: 0.92, metalness: 0.01 });
const CROW_MAT = new THREE.MeshBasicMaterial({ color: 0x151515, side: THREE.DoubleSide });

export function createFieldWaterEffectsOverlay() {
  const group = new THREE.Group();
  group.name = 'field-water-edge-effects-overlay';
  ensurePropModels(group);
  return group;
}

export function rebuildFieldWaterEffectsOverlay(overlay, placedTiles) {
  overlay.userData.lastPlacedTiles = placedTiles;
  clearGroup(overlay);
  ensurePropModels(overlay);
  overlay.add(createWaterVoidSplashes(placedTiles));
  overlay.add(createFieldFlags(placedTiles));
  overlay.add(createRoadsideVillageProps(placedTiles));
  overlay.add(createShoreBoats(placedTiles));
}

export function updateFieldWaterEffectsOverlay(overlay, elapsedSeconds) {
  overlay.traverse(object => {
    const data = object.userData;
    if (!data?.effectKind) return;

    if (data.effectKind === 'water-drop') {
      const t = (elapsedSeconds * data.speed + data.phase) % 1;
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

    if (data.effectKind === 'crow-orbit') {
      const dir = data.direction ?? 1;
      const t = elapsedSeconds * data.speed * dir + data.phase;
      const wobbleA = Math.sin(elapsedSeconds * data.wobbleSpeedA + data.phase * 1.37);
      const wobbleB = Math.cos(elapsedSeconds * data.wobbleSpeedB + data.phase * 2.11);
      const wobbleC = Math.sin(elapsedSeconds * data.wobbleSpeedC + data.phase * 0.61);
      const localRx = data.rx * (1 + wobbleA * data.rxJitter);
      const localRz = data.rz * (1 + wobbleB * data.rzJitter);
      const x = data.cx + Math.cos(t) * localRx + Math.sin(t * 2.17 + data.phase) * data.sideDrift;
      const z = data.cz + Math.sin(t + wobbleC * 0.32) * localRz + Math.cos(t * 1.83 + data.phase * 0.7) * data.sideDrift;
      const y = data.cy
        + Math.sin(elapsedSeconds * data.verticalSpeed + data.phase * 0.73) * data.verticalAmp
        + Math.sin(t * 1.37 + wobbleB) * data.bobAmp;
      object.position.set(x, y, z);
      const tangentAngle = Math.atan2(
        Math.cos(t + wobbleC * 0.32) * localRz,
        -Math.sin(t) * localRx
      );
      object.rotation.y = tangentAngle + (dir < 0 ? Math.PI : 0);
      object.rotation.z = Math.sin(t * data.bankSpeed + data.phase) * data.bankAmp;
      object.rotation.x = Math.cos(t * 1.9 + data.phase * 1.4) * 0.16;
      return;
    }

    if (data.effectKind === 'scarecrow-idle') {
      object.rotation.z = Math.sin(elapsedSeconds * 1.2 + data.phase) * 0.025;
    }
  });
}

function createWaterVoidSplashes(placedTiles) {
  const group = new THREE.Group();
  group.name = 'water-void-edge-splashes';

  for (const placedTile of placedTiles.values()) {
    for (const edge of EDGE_ORDER) {
      if (getTileEdgeType(placedTile, edge) !== EDGE_TYPES.water) continue;
      const direction = DIRECTION_BY_EDGE[edge];
      const neighborKey = makeHexKey(placedTile.q + direction.q, placedTile.r + direction.r);
      if (placedTiles.has(neighborKey)) continue;
      group.add(createSplashForSector(placedTile, edge));
    }
  }

  return group;
}

function createSplashForSector(placedTile, edge) {
  const group = new THREE.Group();
  group.name = `water-void-splash-${placedTile.key}-${edge}`;
  const tilePos = axialToWorld(placedTile.q, placedTile.r);
  const sector = SECTOR_BY_KEY[edge];
  const vA = getHexVertex(sector.a);
  const vB = getHexVertex(sector.b);
  const mid = { x: (vA.x + vB.x) / 2, z: (vA.z + vB.z) / 2 };
  const normalLen = Math.hypot(mid.x, mid.z) || 1;
  const nx = mid.x / normalLen;
  const nz = mid.z / normalLen;
  const tangent = normalize2(vB.x - vA.x, vB.z - vA.z);
  const seed = hashNumber(`${placedTile.key}:${edge}:splash`);

  for (let i = 0; i < 8; i += 1) {
    const lane = (i - 3.5) / 8;
    const jitter = (hashUnit(`${seed}:drop:${i}`) - 0.5) * 0.10;
    const out = 0.055 + hashUnit(`${seed}:out:${i}`) * 0.13;
    const x = tilePos.x + mid.x + tangent.x * (lane * 0.68 + jitter) + nx * out;
    const z = tilePos.z + mid.z + tangent.z * (lane * 0.68 + jitter) + nz * out;
    const drop = new THREE.Mesh(new THREE.SphereGeometry(0.010 + hashUnit(`${seed}:size:${i}`) * 0.010, 7, 5), WATER_DROP_MAT.clone());
    drop.name = 'water-drop-falling-into-empty-neighbor';
    drop.userData = {
      effectKind: 'water-drop',
      x,
      y: WATER_SURFACE_Y + 0.025 + hashUnit(`${seed}:y:${i}`) * 0.075,
      z,
      fall: 0.24 + hashUnit(`${seed}:fall:${i}`) * 0.24,
      speed: 0.82 + hashUnit(`${seed}:speed:${i}`) * 0.78,
      phase: hashUnit(`${seed}:phase:${i}`),
      sway: 0.010 + hashUnit(`${seed}:sway:${i}`) * 0.018,
      scale: 1
    };
    group.add(drop);
  }

  for (let i = 0; i < 5; i += 1) {
    const lane = (i - 2) / 5;
    const height = 0.11 + hashUnit(`${seed}:streakh:${i}`) * 0.10;
    const streak = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0018, height, 5), WATER_STREAK_MAT.clone());
    streak.name = 'water-falling-streak-beyond-edge';
    streak.userData = {
      effectKind: 'water-streak',
      x: tilePos.x + mid.x + tangent.x * (lane * 0.62) + nx * (0.12 + hashUnit(`${seed}:streakout:${i}`) * 0.08),
      y: WATER_SURFACE_Y - 0.02 + hashUnit(`${seed}:streaky:${i}`) * 0.045,
      z: tilePos.z + mid.z + tangent.z * (lane * 0.62) + nz * (0.12 + hashUnit(`${seed}:streakoutz:${i}`) * 0.08),
      fall: 0.22 + hashUnit(`${seed}:streakfall:${i}`) * 0.18,
      speed: 0.70 + hashUnit(`${seed}:streakspeed:${i}`) * 0.55,
      phase: hashUnit(`${seed}:streakphase:${i}`),
      sway: 0.006 + hashUnit(`${seed}:streaksway:${i}`) * 0.012,
      radiusScale: 0.85 + hashUnit(`${seed}:streakrx:${i}`) * 0.35,
      lengthScale: 0.85 + hashUnit(`${seed}:streakly:${i}`) * 0.45
    };
    group.add(streak);
  }

  // Les anciens petits cercles animés ont été retirés : les gouttes et la brume restent.

  for (let i = 0; i < 5; i += 1) {
    const lane = (i - 2) / 5;
    const mist = new THREE.Mesh(new THREE.SphereGeometry(0.010 + hashUnit(`${seed}:mist-size:${i}`) * 0.010, 6, 4), WATER_MIST_MAT.clone());
    mist.name = 'water-edge-fine-mist';
    mist.userData = {
      effectKind: 'water-mist',
      x: tilePos.x + mid.x + tangent.x * lane * 0.62 + nx * 0.06,
      y: WATER_SURFACE_Y + 0.010 + hashUnit(`${seed}:mist-y:${i}`) * 0.025,
      z: tilePos.z + mid.z + tangent.z * lane * 0.62 + nz * 0.06,
      nx: nx + (hashUnit(`${seed}:mistnx:${i}`) - 0.5) * 0.35,
      nz: nz + (hashUnit(`${seed}:mistnz:${i}`) - 0.5) * 0.35,
      drift: 0.035 + hashUnit(`${seed}:mistdrift:${i}`) * 0.045,
      speed: 1.0 + hashUnit(`${seed}:mistspeed:${i}`) * 0.70,
      phase: hashUnit(`${seed}:mistphase:${i}`),
      scale: 0.75 + hashUnit(`${seed}:mistscale:${i}`) * 0.55
    };
    group.add(mist);
  }

  return group;
}

function createFieldFlags(placedTiles) {
  const group = new THREE.Group();
  group.name = 'field-zone-flags-and-crows';
  const zones = collectFieldZones(placedTiles);

  for (const zone of zones) {
    if (zone.total < FIELD_FLAG_MIN_TOTAL) continue;
    group.add(createFieldFlagReward(zone));
  }

  return group;
}

function collectFieldZones(placedTiles) {
  const visited = new Set();
  const zones = [];

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
  const stack = [{ tile: startTile, edge: startEdge }];
  const sectors = [];
  let total = 0;

  while (stack.length > 0) {
    const current = stack.pop();
    const nodeKey = makeNodeKey(current.tile.key, current.edge);
    if (visited.has(nodeKey)) continue;
    if (getTileEdgeType(current.tile, current.edge) !== type) continue;

    visited.add(nodeKey);
    sectors.push(current);
    total += getEdgeValue(current.tile.tile.edges[current.edge]);

    for (const neighbor of getTextureNeighbors(current.tile, current.edge, type, placedTiles)) {
      const neighborKey = makeNodeKey(neighbor.tile.key, neighbor.edge);
      if (!visited.has(neighborKey)) stack.push(neighbor);
    }
  }

  const center = getZoneCenter(sectors);
  return { type, sectors, total, center, anchor: getNearestSectorRef(sectors, center) };
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
  const neighbor = placedTiles.get(makeHexKey(placedTile.q + direction.q, placedTile.r + direction.r));
  if (neighbor && getTileEdgeType(neighbor, getOppositeEdge(edge)) === type) {
    neighbors.push({ tile: neighbor, edge: getOppositeEdge(edge) });
  }

  return neighbors;
}

function getZoneCenter(sectors) {
  let weight = 0;
  let x = 0;
  let z = 0;

  for (const sectorRef of sectors) {
    const value = Math.max(1, getEdgeValue(sectorRef.tile.tile.edges[sectorRef.edge]));
    const center = getSectorWorldCenter(sectorRef.tile, sectorRef.edge);
    x += center.x * value;
    z += center.z * value;
    weight += value;
  }

  return { x: x / Math.max(1, weight), z: z / Math.max(1, weight) };
}

function getNearestSectorRef(sectors, center) {
  let best = null;
  let bestDistance = Infinity;
  for (const sectorRef of sectors) {
    const sectorCenter = getSectorWorldCenter(sectorRef.tile, sectorRef.edge);
    const distance = Math.hypot(sectorCenter.x - center.x, sectorCenter.z - center.z);
    if (distance < bestDistance) {
      best = sectorRef;
      bestDistance = distance;
    }
  }
  return best;
}

function createFieldFlagReward(zone) {
  const group = new THREE.Group();
  group.name = `field-flag-zone-${zone.total}`;
  group.position.set(zone.center.x, FIELD_SURFACE_Y - 0.090, zone.center.z);
  const flagLocal = zone.anchor ? getTileLocalPoint(group.position, zone.anchor.tile) : null;
  const flagGround = flagLocal ? getTerrainSurfaceY(flagLocal, EDGE_TYPES.field, hashNumber(`${zone.total}:field-flag`) % 97) : FIELD_SURFACE_Y;
  group.position.y = flagGround - 0.020;
  group.userData = { effectKind: 'field-flag-idle', phase: hashUnit(`${zone.center.x}:${zone.center.z}:idle`) * Math.PI * 2 };

  const seed = hashNumber(`${zone.total}:${zone.sectors.length}:${Math.round(zone.center.x * 100)}:${Math.round(zone.center.z * 100)}`);
  group.rotation.y = hashUnit(`${seed}:rot`) * Math.PI * 2;

  const flag = createPropModel('field-flag', `${seed}:flag`);
  if (flag) group.add(flag);

  const crowCount = Math.min(10, 4 + Math.floor(zone.total / 3));
  for (let i = 0; i < crowCount; i += 1) {
    const crow = createCrow(`${seed}:crow:${i}`);
    const heightMultiplier = 1.0 + hashUnit(`${seed}:crowheight:${i}`) * 1.4;
    crow.userData = {
      effectKind: 'crow-orbit',
      cx: 0,
      cy: (0.82 + i * 0.04) * heightMultiplier,
      cz: 0,
      rx: 0.28 + hashUnit(`${seed}:crowrx:${i}`) * 0.55,
      rz: 0.18 + hashUnit(`${seed}:crowrz:${i}`) * 0.50,
      speed: 0.36 + hashUnit(`${seed}:crowspeed:${i}`) * 1.08,
      direction: hashUnit(`${seed}:crowdir:${i}`) > 0.5 ? 1 : -1,
      phase: hashUnit(`${seed}:crowphase:${i}`) * Math.PI * 2,
      verticalSpeed: 0.55 + hashUnit(`${seed}:crowvspeed:${i}`) * 1.20,
      verticalAmp: 0.06 + hashUnit(`${seed}:crowvamp:${i}`) * 0.22,
      bobAmp: 0.035 + hashUnit(`${seed}:crowbob:${i}`) * 0.095,
      wobbleSpeedA: 0.42 + hashUnit(`${seed}:crowwoba:${i}`) * 1.50,
      wobbleSpeedB: 0.38 + hashUnit(`${seed}:crowwobb:${i}`) * 1.65,
      wobbleSpeedC: 0.34 + hashUnit(`${seed}:crowwobc:${i}`) * 1.80,
      rxJitter: 0.10 + hashUnit(`${seed}:crowrxj:${i}`) * 0.22,
      rzJitter: 0.10 + hashUnit(`${seed}:crowrzj:${i}`) * 0.24,
      sideDrift: 0.025 + hashUnit(`${seed}:crowside:${i}`) * 0.085,
      bankSpeed: 2.4 + hashUnit(`${seed}:crowbank:${i}`) * 3.6,
      bankAmp: 0.24 + hashUnit(`${seed}:crowbankamp:${i}`) * 0.38
    };
    group.add(crow);
  }

  return group;
}

function createRoadsideVillageProps(placedTiles) {
  const group = new THREE.Group();
  group.name = 'village-roadside-glb-props';

  for (const placedTile of placedTiles.values()) {
    const tilePos = axialToWorld(placedTile.q, placedTile.r);
    const tileCenter = new THREE.Vector3(tilePos.x, ROAD_DECOR_Y, tilePos.z);
    const roadEdges = EDGE_ORDER.filter(edge => isRoadDecorEdge(placedTile, edge));

    for (const edge of roadEdges) {
      const edgeType = getTileEdgeType(placedTile, edge);
      const seed = `${placedTile.key}:bench:${edge}`;
      const chance = edgeType === EDGE_TYPES.forest ? 0.24 : 0.18;
      if (hashUnit(seed) > chance) continue;

      const center = getSectorWorldCenter(placedTile, edge);
      const pos = new THREE.Vector3(center.x, ROAD_DECOR_Y, center.z)
        .lerp(tileCenter, edgeType === EDGE_TYPES.forest ? 0.22 : 0.26);
      nudgeRoadsideProp(pos, placedTile, edge, seed, edgeType === EDGE_TYPES.forest ? 0.038 : 0.032);
      if (!snapPropToSafeSurface(pos, placedTile, edge, seed, { footprintRadius: HEX_SIZE * 0.075 })) continue;

      const bench = createPropModel('road-bench', seed);
      if (!bench) continue;
      bench.name = edgeType === EDGE_TYPES.forest ? 'forest-pathside-bench-glb' : 'grass-roadside-bench-glb';
      bench.position.copy(pos);
      const benchYaw = getEdgeOutwardAngle(edge) + Math.PI / 2 + (hashUnit(`${seed}:yaw`) - 0.5) * 0.55;
      placeObjectOnTerrain(bench, getTileLocalPoint(pos, placedTile), edgeType, hashNumber(seed) % 97, {
        groundOffset: 0.012,
        alignToSlope: true,
        yaw: benchYaw,
        edgeLockStart: 0.98,
        edgeLockEnd: 1.0
      });
      group.add(bench);
    }

    for (const edge of roadEdges) {
      const edgeType = getTileEdgeType(placedTile, edge);
      const seed = `${placedTile.key}:signpost:${edge}`;
      const chance = edgeType === EDGE_TYPES.forest ? 0.36 : 0.30;
      if (hashUnit(seed) > chance) continue;

      const center = getSectorWorldCenter(placedTile, edge);
      const pos = new THREE.Vector3(center.x, ROAD_DECOR_Y, center.z)
        .lerp(tileCenter, edgeType === EDGE_TYPES.forest ? 0.20 : 0.24);
      nudgeRoadsideProp(pos, placedTile, edge, seed, edgeType === EDGE_TYPES.forest ? 0.046 : 0.040);
      if (!snapPropToSafeSurface(pos, placedTile, edge, seed)) continue;

      const sign = createPropModel('road-signpost', seed);
      if (!sign) continue;
      sign.name = edgeType === EDGE_TYPES.forest ? 'forest-path-signpost-glb' : 'grass-road-signpost-glb';
      sign.position.copy(pos);
      const signYaw = getEdgeOutwardAngle(edge) + (hashUnit(`${seed}:yaw`) - 0.5) * 0.65;
      placeObjectOnTerrain(sign, getTileLocalPoint(pos, placedTile), edgeType, hashNumber(seed) % 97, {
        groundOffset: 0.006,
        alignToSlope: true,
        yaw: signYaw,
        edgeLockStart: 0.98,
        edgeLockEnd: 1.0
      });
      group.add(sign);
    }

    for (const edge of EDGE_ORDER) {
      if (!isShoreDecorEdge(placedTile, edge, placedTiles)) continue;
      const edgeType = getTileEdgeType(placedTile, edge);
      const seed = `${placedTile.key}:shore-signpost:${edge}`;
      if (hashUnit(seed) > 0.22) continue;

      const center = getSectorWorldCenter(placedTile, edge);
      const pos = new THREE.Vector3(center.x, ROAD_DECOR_Y, center.z).lerp(tileCenter, 0.24);
      nudgeRoadsideProp(pos, placedTile, edge, seed, 0.038);
      if (!snapPropToSafeSurface(pos, placedTile, edge, seed)) continue;

      const sign = createPropModel('road-signpost', seed);
      if (!sign) continue;
      sign.name = 'shoreline-signpost-glb';
      sign.position.copy(pos);
      const shoreSignYaw = getEdgeOutwardAngle(edge) + (hashUnit(`${seed}:yaw`) - 0.5) * 0.80;
      placeObjectOnTerrain(sign, getTileLocalPoint(pos, placedTile), edgeType, hashNumber(seed) % 97, {
        groundOffset: 0.006,
        alignToSlope: true,
        yaw: shoreSignYaw,
        edgeLockStart: 0.98,
        edgeLockEnd: 1.0
      });
      group.add(sign);
    }
  }

  return group;
}

function isRoadDecorEdge(placedTile, edge) {
  const type = getTileEdgeType(placedTile, edge);
  // Bancs/poteaux uniquement sur surfaces naturelles praticables : jamais eau, maison,
  // rail ou champ. Ça évite les bancs dans les baraques, brillante invention de gobelin.
  return type === EDGE_TYPES.forest || type === EDGE_TYPES.grass;
}

function isShoreDecorEdge(placedTile, edge, placedTiles) {
  const type = getTileEdgeType(placedTile, edge);
  if (!isSafePropGroundType(type)) return false;
  const direction = DIRECTION_BY_EDGE[edge];
  const neighbor = placedTiles.get(makeHexKey(placedTile.q + direction.q, placedTile.r + direction.r));
  return neighbor && getTileEdgeType(neighbor, getOppositeEdge(edge)) === EDGE_TYPES.water;
}

function snapPropToSafeSurface(pos, placedTile, fallbackEdge, seed, options = {}) {
  const tilePos = axialToWorld(placedTile.q, placedTile.r);
  const local = new THREE.Vector3(pos.x - tilePos.x, 0, pos.z - tilePos.z);
  const edge = getEdgeFromLocalPoint(local) ?? fallbackEdge;
  const type = getTileEdgeType(placedTile, edge);
  if (!isSafePropGroundType(type)) return false;

  const radius = Math.hypot(local.x, local.z) / Math.max(HEX_SIZE, 0.001);
  // Pas sur les jointures ni trop au centre : ça limite les collisions visuelles avec
  // maisons, rails, eau et autres machins déjà posés par le jeu.
  if (radius < 0.30 || radius > 0.86) return false;
  if (!isSingleTerrainFootprint(local, placedTile, type, options.footprintRadius ?? HEX_SIZE * 0.045)) return false;

  pos.y = getTerrainSurfaceY(local, type, hashNumber(seed) % 97, {
    edgeLockStart: 0.98,
    edgeLockEnd: 1.0
  }) + 0.010;
  return true;
}


function isSingleTerrainFootprint(local, placedTile, expectedType, radius) {
  const samples = [
    { x: local.x, z: local.z },
    { x: local.x + radius, z: local.z },
    { x: local.x - radius, z: local.z },
    { x: local.x, z: local.z + radius },
    { x: local.x, z: local.z - radius },
    { x: local.x + radius * 0.72, z: local.z + radius * 0.72 },
    { x: local.x - radius * 0.72, z: local.z - radius * 0.72 }
  ];

  for (const sample of samples) {
    const sampleRadius = Math.hypot(sample.x, sample.z) / Math.max(HEX_SIZE, 0.001);
    if (sampleRadius < 0.28 || sampleRadius > 0.88) return false;
    const sampleEdge = getEdgeFromLocalPoint(sample);
    if (!sampleEdge) return false;
    if (getTileEdgeType(placedTile, sampleEdge) !== expectedType) return false;
  }
  return true;
}

function isSafePropGroundType(type) {
  return type === EDGE_TYPES.forest || type === EDGE_TYPES.grass;
}

function getEdgeFromLocalPoint(point) {
  if (!point || (Math.abs(point.x) < 0.0001 && Math.abs(point.z) < 0.0001)) return null;
  let angle = Math.atan2(point.z, point.x);
  if (angle < 0) angle += Math.PI * 2;
  const index = Math.floor(((angle + Math.PI / 6) % (Math.PI * 2)) / (Math.PI / 3));
  return EDGE_ORDER[index] ?? null;
}

function getTileLocalPoint(pos, placedTile) {
  const tilePos = axialToWorld(placedTile.q, placedTile.r);
  return { x: pos.x - tilePos.x, z: pos.z - tilePos.z };
}

function nudgeRoadsideProp(pos, placedTile, edge, seed, amount) {
  const sector = SECTOR_BY_KEY[edge];
  const a = getHexVertex(sector.a);
  const b = getHexVertex(sector.b);
  const tangent = normalize2(b.x - a.x, b.z - a.z);
  const sideSign = hashUnit(`${seed}:side`) > 0.5 ? 1 : -1;
  const along = (hashUnit(`${seed}:along`) - 0.5) * amount * 1.55;
  const side = sideSign * (amount * 0.45 + hashUnit(`${seed}:offset`) * amount);
  pos.x += tangent.x * along - tangent.z * side;
  pos.z += tangent.z * along + tangent.x * side;
}

function createShoreBoats(placedTiles) {
  const group = new THREE.Group();
  group.name = 'water-shore-static-boats-glb';

  for (const placedTile of placedTiles.values()) {
    const tilePos = axialToWorld(placedTile.q, placedTile.r);
    for (const edge of EDGE_ORDER) {
      if (getTileEdgeType(placedTile, edge) !== EDGE_TYPES.water) continue;
      const direction = DIRECTION_BY_EDGE[edge];
      const neighbor = placedTiles.get(makeHexKey(placedTile.q + direction.q, placedTile.r + direction.r));
      if (!neighbor || getTileEdgeType(neighbor, getOppositeEdge(edge)) === EDGE_TYPES.water) continue;

      const seed = `${placedTile.key}:shore-boat:${edge}`;
      if (hashUnit(seed) > 0.22) continue;

      const sector = SECTOR_BY_KEY[edge];
      const a = getHexVertex(sector.a);
      const b = getHexVertex(sector.b);
      const mid = new THREE.Vector3((a.x + b.x) / 2, SHORE_BOAT_Y, (a.z + b.z) / 2);
      const inward = new THREE.Vector3(-direction.q, 0, -direction.r);
      if (inward.lengthSq() < 0.001) inward.set(-mid.x, 0, -mid.z);
      inward.normalize();

      const boat = createPropModel('shore-boat', seed);
      if (!boat) continue;
      boat.name = 'water-shore-inert-boat-glb';
      boat.position.set(tilePos.x + mid.x + inward.x * HEX_SIZE * 0.08, SHORE_BOAT_Y, tilePos.z + mid.z + inward.z * HEX_SIZE * 0.08);
      boat.rotation.y = getEdgeOutwardAngle(edge) + Math.PI / 2 + (hashUnit(`${seed}:yaw`) - 0.5) * 0.55;
      boat.scale.multiplyScalar(0.86 + hashUnit(`${seed}:scale`) * 0.20);
      group.add(boat);
    }
  }

  return group;
}



const propGlbLibrary = new Map();
let propModelsLoading = false;
let propModelsRequested = false;

function ensurePropModels(overlay) {
  if (propModelsLoading || propModelsRequested) return;
  propModelsLoading = true;
  propModelsRequested = true;

  let pending = PROP_MODEL_DEFS.length;
  const finishOne = () => {
    pending -= 1;
    if (pending > 0) return;

    propModelsLoading = false;
    const lastPlacedTiles = overlay.userData.lastPlacedTiles;
    if (lastPlacedTiles) rebuildFieldWaterEffectsOverlay(overlay, lastPlacedTiles);
  };

  for (const def of PROP_MODEL_DEFS) {
    new GLTFLoader().load(
      def.url,
      gltf => {
        propGlbLibrary.set(def.key, preparePropPrototype(gltf.scene, def));
        finishOne();
      },
      undefined,
      error => {
        console.warn(`Modèle décor GLB indisponible : ${def.url}`, error);
        finishOne();
      }
    );
  }
}

function preparePropPrototype(model, def) {
  const wrapper = new THREE.Group();
  wrapper.name = `normalized-${def.key}`;

  const source = model.clone(true);
  const box = new THREE.Box3().setFromObject(source);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  source.position.set(-center.x, -box.min.y, -center.z);
  const dimension = def.mode === 'height' ? (size.y || 1) : (Math.max(size.x, size.z) || 1);
  wrapper.scale.setScalar(def.target / dimension);
  wrapper.add(source);

  wrapper.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    if (object.material) object.material = clonePropMaterial(object.material);
  });

  return wrapper;
}

function createPropModel(key, seedKey = key) {
  const prototype = propGlbLibrary.get(key);
  if (!prototype) return null;
  const object = prototype.clone(true);
  object.traverse(child => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
  });
  object.rotation.y += (hashUnit(`${seedKey}:base-yaw`) - 0.5) * 0.16;
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

function getEdgeOutwardAngle(edge) {
  const sector = SECTOR_BY_KEY[edge];
  const a = getHexVertex(sector.a);
  const b = getHexVertex(sector.b);
  const x = (a.x + b.x) / 2;
  const z = (a.z + b.z) / 2;
  return Math.atan2(x, z);
}

function createCrow(seedKey) {
  const group = new THREE.Group();
  group.name = 'field-crow-circling-scarecrow';
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 5), CROW_MAT);
  body.name = 'crow-body';
  body.scale.set(1.35, 0.72, 0.72);
  group.add(body);

  const leftWing = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.025), CROW_MAT);
  leftWing.name = 'crow-left-wing';
  leftWing.position.set(-0.052, 0, 0);
  leftWing.rotation.z = 0.25 + hashUnit(`${seedKey}:lw`) * 0.35;
  group.add(leftWing);

  const rightWing = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.025), CROW_MAT);
  rightWing.name = 'crow-right-wing';
  rightWing.position.set(0.052, 0, 0);
  rightWing.rotation.z = -0.25 - hashUnit(`${seedKey}:rw`) * 0.35;
  group.add(rightWing);

  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.026, 5), new THREE.MeshBasicMaterial({ color: 0xB07A16 }));
  beak.name = 'crow-beak';
  beak.position.set(0, 0, 0.034);
  beak.rotation.x = Math.PI / 2;
  group.add(beak);

  group.scale.setScalar(1.25 + hashUnit(`${seedKey}:scale`) * 0.55);
  return group;
}

function getSectorWorldCenter(placedTile, edge) {
  const tilePos = axialToWorld(placedTile.q, placedTile.r);
  const sector = SECTOR_BY_KEY[edge];
  const vA = getHexVertex(sector.a);
  const vB = getHexVertex(sector.b);
  return {
    x: tilePos.x + (vA.x + vB.x) / 3,
    z: tilePos.z + (vA.z + vB.z) / 3
  };
}

function getHexVertex(index) {
  const angle = (Math.PI / 3) * index;
  return { x: Math.cos(angle) * HEX_SIZE, z: Math.sin(angle) * HEX_SIZE };
}

function normalize2(x, z) {
  const length = Math.hypot(x, z) || 1;
  return { x: x / length, z: z / length };
}

function getTileEdgeType(placedTile, edge) {
  return getEdgeType(placedTile.tile.edges[edge]);
}

function makeNodeKey(tileKey, edge) {
  return `${tileKey}:${edge}`;
}

function hashNumber(value) {
  let hash = 2166136261;
  for (let i = 0; i < String(value).length; i += 1) {
    hash ^= String(value).charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function hashUnit(value) {
  return (hashNumber(value) % 10000) / 10000;
}

function clearGroup(group) {
  while (group.children.length > 0) {
    const child = group.children.pop();
    child.traverse?.(object => {
      object.geometry?.dispose?.();
      if (Array.isArray(object.material)) object.material.forEach(material => material.dispose?.());
      else object.material?.dispose?.();
    });
  }
}
