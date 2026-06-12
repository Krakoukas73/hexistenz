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
const HOUSE_SCALE = HEX_SIZE * 0.148;
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

      const scale = puff.baseScale * (0.76 + rise * 1.55 + Math.sin(timeSeconds * 1.45 + i) * 0.035);
      puff.mesh.scale.set(scale, scale, scale);
      puff.mesh.material.opacity = Math.max(0, Math.pow(1 - rise, 1.25) * puff.opacity);
      puff.mesh.visible = puff.mesh.material.opacity > 0.018;
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
        speed: 0.20 + hashUnit(`${puffSeed}:speed`) * 0.09,
        rise: HEX_SIZE * (0.34 + hashUnit(`${puffSeed}:rise`) * 0.16),
        drift: new THREE.Vector3(Math.cos(windAngle) * windPower * 0.58, 0, Math.sin(windAngle) * windPower * 0.58),
        wobble: HEX_SIZE * (0.006 + hashUnit(`${puffSeed}:wobble`) * 0.010),
        wobbleSpeed: 0.38 + hashUnit(`${puffSeed}:wobble-speed`) * 0.52,
        baseScale: 0.58 + hashUnit(`${puffSeed}:scale`) * 0.18,
        opacity: 0.34 + hashUnit(`${puffSeed}:opacity`) * 0.14
      });
    }

    group.userData.columns.push(column);
  }
}


function createVillageHouseObject(seedKey, sector, index) {
  const group = new THREE.Group();
  group.name = 'village-house-3d-under-smoke';

  const sectorAngle = (SECTOR_DEFS.findIndex(item => item.key === sector.key) * Math.PI / 3) + Math.PI / 6;
  const jitter = (hashUnit(`${seedKey}:house-rotation`) - 0.5) * 0.42;
  group.rotation.y = -sectorAngle + jitter;
  group.scale.setScalar(1.08 + hashUnit(`${seedKey}:house-scale`) * 0.24);

  const variant = Math.floor(hashUnit(`${seedKey}:variant`) * 5) % 5;
  const width = HOUSE_SCALE * (0.92 + hashUnit(`${seedKey}:width`) * 0.34);
  const depth = HOUSE_SCALE * (0.76 + hashUnit(`${seedKey}:depth`) * 0.30);
  const height = HOUSE_SCALE * (0.68 + hashUnit(`${seedKey}:height`) * 0.30);

  const wallPalette = [0xD9A15F, 0xC98F5D, 0xE0B16F, 0xBC7A55, 0xD7BA82, 0xB98562];
  const roofPalette = [0xB94735, 0xD05B3F, 0x9E3A2F, 0xC9573A, 0x7E342C];
  const wallColor = wallPalette[(index + Math.floor(hashUnit(`${seedKey}:wall`) * wallPalette.length)) % wallPalette.length];
  const roofColor = roofPalette[(index + Math.floor(hashUnit(`${seedKey}:roof`) * roofPalette.length)) % roofPalette.length];

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    getHouseMaterial(`wall-${wallColor}`, wallColor)
  );
  body.name = 'village-house-body';
  body.position.set(0, height * 0.5, 0);
  body.renderOrder = 120;

  const foundation = new THREE.Mesh(
    new THREE.BoxGeometry(width * 1.08, HOUSE_SCALE * 0.10, depth * 1.08),
    getHouseMaterial('foundation-stone', 0x7F7568)
  );
  foundation.name = 'village-house-foundation';
  foundation.position.set(0, HOUSE_SCALE * 0.05, 0);
  foundation.renderOrder = 119;

  const roof = createHouseRoof(variant, width, depth, height, roofColor);

  const chimneyOffsetX = 0;
  const chimneyOffsetZ = 0;
  const chimney = new THREE.Mesh(
    new THREE.BoxGeometry(HOUSE_SCALE * 0.17, HOUSE_SCALE * 0.48, HOUSE_SCALE * 0.17),
    getHouseMaterial('chimney', 0x5B3328)
  );
  chimney.name = 'village-house-chimney-aligned-with-smoke';
  chimney.position.set(chimneyOffsetX, height + HOUSE_SCALE * 0.54, chimneyOffsetZ);
  chimney.renderOrder = 123;

  const door = new THREE.Mesh(
    new THREE.PlaneGeometry(HOUSE_SCALE * (0.20 + variant * 0.012), HOUSE_SCALE * 0.34),
    getHouseMaterial('door', variant % 2 === 0 ? 0x5A3826 : 0x3F3024)
  );
  door.name = 'village-house-door';
  door.position.set(width * (variant === 3 ? -0.22 : 0), HOUSE_SCALE * 0.31, -depth * 0.506);
  door.renderOrder = 124;

  const knob = new THREE.Mesh(
    new THREE.CircleGeometry(HOUSE_SCALE * 0.018, 10),
    getHouseMaterial('door-knob', 0xE5C15A)
  );
  knob.name = 'village-house-door-knob';
  knob.position.set(door.position.x + HOUSE_SCALE * 0.055, HOUSE_SCALE * 0.31, -depth * 0.509);
  knob.renderOrder = 126;

  const leftWindow = createHouseWindow(-width * 0.26, height * 0.62, -depth * 0.508, variant);
  const rightWindow = createHouseWindow(width * 0.26, height * 0.62, -depth * 0.508, variant + 1);
  const atticWindow = createHouseWindow(0, height + HOUSE_SCALE * 0.18, -depth * 0.512, variant + 2, 0.72);

  const sideWindow = createHouseWindow(0, height * 0.58, 0, variant + 3, 0.86);
  sideWindow.position.set(width * 0.506, height * 0.58, 0);
  sideWindow.rotation.y = Math.PI / 2;

  for (const mesh of [foundation, body, roof, chimney, door, knob, leftWindow, rightWindow, atticWindow, sideWindow]) {
    mesh.castShadow = false;
    mesh.receiveShadow = false;
  }

  group.add(foundation, body, roof, chimney, door, knob, leftWindow, rightWindow, atticWindow, sideWindow);
  return group;
}

function createHouseRoof(variant, width, depth, height, roofColor) {
  let roof;
  if (variant === 1 || variant === 4) {
    roof = new THREE.Mesh(
      new THREE.BoxGeometry(width * 1.16, HOUSE_SCALE * 0.36, depth * 1.02),
      getHouseMaterial(`roof-${roofColor}`, roofColor)
    );
    roof.rotation.z = variant === 1 ? 0.18 : -0.18;
    roof.position.set(0, height + HOUSE_SCALE * 0.30, 0);
  } else {
    roof = new THREE.Mesh(
      new THREE.ConeGeometry(Math.max(width, depth) * 0.60, HOUSE_SCALE * (0.52 + variant * 0.035), 4),
      getHouseMaterial(`roof-${roofColor}`, roofColor)
    );
    roof.position.set(0, height + HOUSE_SCALE * 0.30, 0);
    roof.rotation.y = Math.PI / 4;
    roof.scale.z = depth / Math.max(width, 0.001);
  }
  roof.name = 'village-house-roof';
  roof.renderOrder = 122;
  return roof;
}

function createHouseWindow(x, y, z, variant = 0, sizeMultiplier = 1) {
  const w = HOUSE_SCALE * (0.14 + (variant % 3) * 0.018) * sizeMultiplier;
  const h = HOUSE_SCALE * (0.13 + (variant % 2) * 0.020) * sizeMultiplier;
  const window = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    getHouseMaterial(`window-${variant % 4}`, [0xF6E7A6, 0xFFE4A0, 0xDFF0FF, 0xF1D38D][variant % 4])
  );
  window.name = 'village-house-window';
  window.position.set(x, y, z);
  window.renderOrder = 125;
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
