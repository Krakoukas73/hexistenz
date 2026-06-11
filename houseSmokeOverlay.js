import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { EDGE_TYPES, HEX_SIZE, TILE_VISUAL } from './config.js';
import { getEdgeType, getEdgeValue } from './tileGenerator.js';

const SECTOR_DEFS = [
  { key: 'n', a: 0, b: 1 },
  { key: 'ne', a: 1, b: 2 },
  { key: 'se', a: 2, b: 3 },
  { key: 's', a: 3, b: 4 },
  { key: 'sw', a: 4, b: 5 },
  { key: 'nw', a: 5, b: 0 }
];

const HOUSE_BASE_Y = (TILE_VISUAL.sectorY ?? 0.012) + 0.018;
const HOUSE_SCALE = HEX_SIZE * 0.112;
const HOUSE_CHIMNEY_TOP_Y = HOUSE_BASE_Y + HOUSE_SCALE * 1.62;
const HOUSE_SMOKE_Y = HOUSE_CHIMNEY_TOP_Y + HOUSE_SCALE * 0.08;
const PUFFS_PER_COLUMN = 18;
const smokeMaterialCache = [];
const houseMaterialCache = new Map();

export function createHouseSmokeOverlay() {
  const group = new THREE.Group();
  group.name = 'house-smoke-overlay';
  group.userData.columns = [];
  return group;
}

export function rebuildHouseSmokeOverlay(group, placedTiles) {
  clearGroup(group);
  group.userData.columns = [];

  for (const placedTile of placedTiles.values()) {
    const edges = placedTile.tile?.edges;
    if (!edges) continue;

    const tileX = placedTile.mesh?.position?.x ?? 0;
    const tileZ = placedTile.mesh?.position?.z ?? 0;

    for (const sector of SECTOR_DEFS) {
      const edge = edges[sector.key];
      if (getEdgeType(edge) !== EDGE_TYPES.house) continue;

      const houseCount = Math.max(1, Math.min(4, Math.round(getEdgeValue(edge))));

      // Règle volontairement bête et fiable : 1 maison du triangle = 1 panache.
      // Aucune mutualisation par zone contiguë, aucun regroupement central.
      addSectorSmokeColumns(group, tileX, tileZ, sector, houseCount, placedTile.key);
    }
  }
}

export function updateHouseSmokeOverlay(group, timeSeconds = 0) {
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

      const scale = puff.baseScale * (0.72 + rise * 2.55 + Math.sin(timeSeconds * 3.3 + i) * 0.075);
      puff.mesh.scale.set(scale, scale, scale);
      puff.mesh.material.opacity = Math.max(0, (1 - rise) * puff.opacity);
      puff.mesh.visible = puff.mesh.material.opacity > 0.025;
    }
  }
}

function addSectorSmokeColumns(group, tileX, tileZ, sector, columnCount, tileKey) {
  const vertices = createOuterVertices();
  const a = vertices[sector.a];
  const b = vertices[sector.b];
  const anchors = getColumnAnchors(columnCount);

  for (let i = 0; i < columnCount; i += 1) {
    const anchor = anchors[i] ?? anchors[anchors.length - 1];
    const seed = `${tileKey}:${sector.key}:house-smoke:${i}`;
    const local = trianglePoint(a, b, anchor.centerWeight, anchor.aWeight, anchor.bWeight);
    const column = {
      x: tileX + local.x,
      z: tileZ + local.z,
      puffs: [],
      house: null
    };

    const house = createVillageHouseObject(seed, sector, i);
    house.position.set(column.x, HOUSE_BASE_Y, column.z);
    group.add(house);
    column.house = house;

    for (let puffIndex = 0; puffIndex < PUFFS_PER_COLUMN; puffIndex += 1) {
      const puffSeed = `${seed}:puff:${puffIndex}`;
      const mesh = new THREE.Mesh(
        new THREE.CircleGeometry(HEX_SIZE * (0.034 + hashUnit(`${puffSeed}:radius`) * 0.018), 18),
        getSmokeMaterial(puffIndex).clone()
      );

      mesh.name = 'village-house-animated-smoke-puff';
      mesh.rotation.x = -Math.PI / 2;
      mesh.renderOrder = 170 + puffIndex;
      mesh.position.set(column.x, HOUSE_SMOKE_Y, column.z);
      group.add(mesh);

      const windAngle = -0.82 + hashUnit(`${puffSeed}:wind-angle`) * 0.38;
      const windPower = HEX_SIZE * (0.080 + hashUnit(`${puffSeed}:wind-power`) * 0.075);

      column.puffs.push({
        mesh,
        phase: (puffIndex / PUFFS_PER_COLUMN + hashUnit(`${puffSeed}:phase`) * 0.20) % 1,
        speed: 0.43 + hashUnit(`${puffSeed}:speed`) * 0.17,
        rise: HEX_SIZE * (0.48 + hashUnit(`${puffSeed}:rise`) * 0.22),
        drift: new THREE.Vector3(Math.cos(windAngle) * windPower, 0, Math.sin(windAngle) * windPower),
        wobble: HEX_SIZE * (0.014 + hashUnit(`${puffSeed}:wobble`) * 0.018),
        wobbleSpeed: 1.05 + hashUnit(`${puffSeed}:wobble-speed`) * 1.20,
        baseScale: 0.72 + hashUnit(`${puffSeed}:scale`) * 0.26,
        opacity: 0.58 + hashUnit(`${puffSeed}:opacity`) * 0.20
      });
    }

    group.userData.columns.push(column);
  }
}


function createVillageHouseObject(seedKey, sector, index) {
  const group = new THREE.Group();
  group.name = 'village-house-3d-under-smoke';

  const sectorAngle = (SECTOR_DEFS.findIndex(item => item.key === sector.key) * Math.PI / 3) + Math.PI / 6;
  const jitter = (hashUnit(`${seedKey}:house-rotation`) - 0.5) * 0.34;
  group.rotation.y = -sectorAngle + jitter;
  group.scale.setScalar(0.92 + hashUnit(`${seedKey}:house-scale`) * 0.16);

  const wallColor = [0xD9A15F, 0xC98F5D, 0xE0B16F, 0xBC7A55][index % 4];
  const roofColor = [0xB94735, 0xD05B3F, 0x9E3A2F, 0xC9573A][(index + Math.floor(hashUnit(`${seedKey}:roof`) * 4)) % 4];

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(HOUSE_SCALE * 0.92, HOUSE_SCALE * 0.72, HOUSE_SCALE * 0.82),
    getHouseMaterial(`wall-${wallColor}`, wallColor)
  );
  body.name = 'village-house-body';
  body.position.set(0, HOUSE_SCALE * 0.36, 0);
  body.renderOrder = 120;

  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(HOUSE_SCALE * 0.70, HOUSE_SCALE * 0.48, 4),
    getHouseMaterial(`roof-${roofColor}`, roofColor)
  );
  roof.name = 'village-house-roof';
  roof.position.set(0, HOUSE_SCALE * 0.96, 0);
  roof.rotation.y = Math.PI / 4;
  roof.scale.z = 0.82;
  roof.renderOrder = 121;

  const chimney = new THREE.Mesh(
    new THREE.BoxGeometry(HOUSE_SCALE * 0.18, HOUSE_SCALE * 0.46, HOUSE_SCALE * 0.18),
    getHouseMaterial('chimney', 0x5B3328)
  );
  chimney.name = 'village-house-chimney-aligned-with-smoke';
  chimney.position.set(0, HOUSE_SCALE * 1.36, 0);
  chimney.renderOrder = 122;

  const door = new THREE.Mesh(
    new THREE.PlaneGeometry(HOUSE_SCALE * 0.22, HOUSE_SCALE * 0.32),
    getHouseMaterial('door', 0x5A3826)
  );
  door.name = 'village-house-door';
  door.position.set(0, HOUSE_SCALE * 0.28, -HOUSE_SCALE * 0.413);
  door.rotation.x = 0;
  door.renderOrder = 123;

  const leftWindow = createHouseWindow(-HOUSE_SCALE * 0.25);
  const rightWindow = createHouseWindow(HOUSE_SCALE * 0.25);

  for (const mesh of [body, roof, chimney, door, leftWindow, rightWindow]) {
    mesh.castShadow = false;
    mesh.receiveShadow = false;
  }

  group.add(body, roof, chimney, door, leftWindow, rightWindow);
  return group;
}

function createHouseWindow(x) {
  const window = new THREE.Mesh(
    new THREE.PlaneGeometry(HOUSE_SCALE * 0.16, HOUSE_SCALE * 0.14),
    getHouseMaterial('window', 0xF6E7A6)
  );
  window.name = 'village-house-window';
  window.position.set(x, HOUSE_SCALE * 0.48, -HOUSE_SCALE * 0.414);
  window.renderOrder = 124;
  return window;
}

function getHouseMaterial(key, color) {
  if (houseMaterialCache.has(key)) return houseMaterialCache.get(key);

  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: THREE.DoubleSide
  });

  houseMaterialCache.set(key, material);
  return material;
}

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

function createOuterVertices(radius = HEX_SIZE) {
  return Array.from({ length: 6 }, (_, index) => {
    const angle = index * Math.PI / 3;
    return {
      x: Math.cos(angle) * radius,
      z: Math.sin(angle) * radius
    };
  });
}

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

function smoothstep(edge0, edge1, value) {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function hashUnit(input) {
  let hash = 2166136261;
  const text = String(input);

  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return ((hash >>> 0) % 100000) / 100000;
}

function clearGroup(group) {
  while (group.children.length > 0) {
    const child = group.children.pop();
    child.traverse?.(object => {
      object.geometry?.dispose?.();
      if (Array.isArray(object.material)) {
        for (const material of object.material) material.dispose?.();
      } else {
        object.material?.dispose?.();
      }
    });
  }
}
