import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { EDGE_ORDER, EDGE_TYPES, HEX_SIZE, TILE_VISUAL } from './config.js';
import { axialToWorld, makeHexKey } from './hex.js';
import { HEX_DIRECTIONS, getOppositeEdge } from './placementRules.js';
import { getEdgeType, getEdgeValue } from './tileGenerator.js';

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
const SCARECROW_MIN_FIELD_TOTAL = 5;
const SCARECROW_SCALE = 0.62;

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
  return group;
}

export function rebuildFieldWaterEffectsOverlay(overlay, placedTiles) {
  clearGroup(overlay);
  overlay.add(createWaterVoidSplashes(placedTiles));
  overlay.add(createFieldScarecrows(placedTiles));
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

function createFieldScarecrows(placedTiles) {
  const group = new THREE.Group();
  group.name = 'field-zone-scarecrows-and-crows';
  const zones = collectFieldZones(placedTiles);

  for (const zone of zones) {
    if (zone.total < SCARECROW_MIN_FIELD_TOTAL) continue;
    group.add(createScarecrowReward(zone));
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

  return { type, sectors, total, center: getZoneCenter(sectors) };
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

function createScarecrowReward(zone) {
  const group = new THREE.Group();
  group.name = `field-scarecrow-zone-${zone.total}`;
  group.position.set(zone.center.x, FIELD_SURFACE_Y - 0.035, zone.center.z);
  group.scale.setScalar(SCARECROW_SCALE);
  group.userData = { effectKind: 'scarecrow-idle', phase: hashUnit(`${zone.center.x}:${zone.center.z}:idle`) * Math.PI * 2 };

  const seed = hashNumber(`${zone.total}:${zone.sectors.length}:${Math.round(zone.center.x * 100)}:${Math.round(zone.center.z * 100)}`);
  group.rotation.y = hashUnit(`${seed}:rot`) * Math.PI * 2;

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, 0.42, 6), WOOD_MAT);
  pole.name = 'field-scarecrow-wooden-pole';
  pole.position.y = 0.20;
  group.add(pole);

  const arms = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.34, 6), WOOD_MAT);
  arms.name = 'field-scarecrow-crossbar';
  arms.position.y = 0.33;
  arms.rotation.z = Math.PI / 2;
  group.add(arms);

  const body = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.16, 4), CLOTH_MAT);
  body.name = 'field-scarecrow-ragged-shirt';
  body.position.y = 0.28;
  body.rotation.y = Math.PI / 4;
  group.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.054, 10, 7), STRAW_MAT);
  head.name = 'field-scarecrow-straw-head';
  head.position.y = 0.43;
  group.add(head);

  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.10, 10), HAT_MAT);
  hat.name = 'field-scarecrow-pointed-hat';
  hat.position.y = 0.51;
  group.add(hat);

  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.012, 12), HAT_MAT);
  brim.name = 'field-scarecrow-hat-brim';
  brim.position.y = 0.465;
  group.add(brim);

  for (let i = 0; i < 7; i += 1) {
    const straw = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.08 + hashUnit(`${seed}:straw:${i}`) * 0.05, 4), STRAW_MAT);
    straw.name = 'field-scarecrow-loose-straw';
    straw.position.set((hashUnit(`${seed}:strawx:${i}`) - 0.5) * 0.20, 0.22 + hashUnit(`${seed}:strawy:${i}`) * 0.20, (hashUnit(`${seed}:strawz:${i}`) - 0.5) * 0.08);
    straw.rotation.z = (hashUnit(`${seed}:strawrz:${i}`) - 0.5) * 1.1;
    straw.rotation.x = (hashUnit(`${seed}:strawrx:${i}`) - 0.5) * 0.8;
    group.add(straw);
  }

  const crowCount = Math.min(10, 4 + Math.floor(zone.total / 3));
  for (let i = 0; i < crowCount; i += 1) {
    const crow = createCrow(`${seed}:crow:${i}`);
    const heightMultiplier = 1.0 + hashUnit(`${seed}:crowheight:${i}`) * 1.4; // 1x à 2.4x plus haut
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
