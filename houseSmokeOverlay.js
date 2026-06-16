import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';
import { EDGE_ORDER, EDGE_TYPES, HEX_SIZE, TILE_VISUAL } from './config.js';
import { makeHexKey } from './stable/hex.js';
import { HEX_DIRECTIONS, getOppositeEdge } from './stable/placementRules.js';
import { getEdgeType, getEdgeValue } from './tileGenerator.js';
import { getTerrainSurfaceY } from './terrainHeight.js';

const SECTOR_DEFS = [
  { key: 'n', a: 0, b: 1 },
  { key: 'ne', a: 1, b: 2 },
  { key: 'se', a: 2, b: 3 },
  { key: 's', a: 3, b: 4 },
  { key: 'sw', a: 4, b: 5 },
  { key: 'nw', a: 5, b: 0 }
];

// Les maisons/églises ont leur origine au pied du modèle. Depuis que le
// biome maison est 30% moins épais en gardant le dessous collé à la grille,
// son dessus réel est abaissé : on pose donc les bâtiments sur cette surface,
// pas sur l'ancien niveau flottant sectorY + 0.018.
const HOUSE_GROUND_Y = (TILE_VISUAL.tileThickness ?? 0.12) * -0.30;
const HOUSE_BASE_Y = HOUSE_GROUND_Y + 0.002;
const HOUSE_SCALE = HEX_SIZE * 0.148;
const HOUSE_GLB_SIZE_MULTIPLIER = 1.75;
const HOUSE_GLB_SPACING_MULTIPLIER = 1.12;
const HOUSE_CHIMNEY_TOP_Y = HOUSE_BASE_Y + HOUSE_SCALE * 1.62;
const HOUSE_SMOKE_Y = HOUSE_CHIMNEY_TOP_Y + HOUSE_SCALE * 0.08;
const PUFFS_PER_COLUMN = 18;
const smokeMaterialCache = [];
const houseMaterialCache = new Map();

const HOUSE_GLB_MODEL_DEFS = [
  { key: 'maison-1', url: './glb/maison-1.glb', size: 1.50, spawnWeight: 56 },
  { key: 'maison-2', url: './glb/maison-2.glb', size: 1.55, spawnWeight: 30 },
  { key: 'maison-3', url: './glb/maison-3.glb', size: 1.60, spawnWeight: 11 },
  { key: 'maison-4', url: './glb/maison-4.glb', size: 1.75, spawnWeight: 3 }
];
const houseGlbLibrary = new Map();
let houseModelsLoading = false;
let houseModelsRequested = false;
const DIRECTION_BY_EDGE = Object.fromEntries(HEX_DIRECTIONS.map(direction => [direction.edge, direction]));
const CHURCH_MIN_HOUSES = 8;
const CHURCH_HOUSES_PER_EXTRA = 18;
const CHURCH_MAX_PER_ZONE = 4;
const CEMETERY_MIN_HOUSES = 13;
const CEMETERY_HOUSES_PER_EXTRA = 24;
const CEMETERY_MAX_PER_ZONE = 3;

export function createHouseSmokeOverlay() {
  const group = new THREE.Group();
  group.name = 'house-smoke-overlay';
  group.userData.columns = [];
  ensureHouseGlbModels(group);
  return group;
}

export function rebuildHouseSmokeOverlay(group, placedTiles) {
  group.userData.lastPlacedTiles = placedTiles;
  clearGroup(group);
  group.userData.columns = [];

  if (houseGlbLibrary.size === 0) {
    ensureHouseGlbModels(group);
    return;
  }

  const churchSectors = collectVillageChurchSectors(placedTiles);
  const cemeterySectors = collectVillageCemeterySectors(placedTiles, churchSectors);

  for (const placedTile of placedTiles.values()) {
    const edges = placedTile.tile?.edges;
    if (!edges) continue;

    const tileX = placedTile.mesh?.position?.x ?? 0;
    const tileZ = placedTile.mesh?.position?.z ?? 0;

    addCentralHouseConnectionBridges(group, tileX, tileZ, placedTile);

    for (const sector of SECTOR_DEFS) {
      const edge = edges[sector.key];
      if (getEdgeType(edge) !== EDGE_TYPES.house) continue;

      const houseCount = Math.max(1, Math.min(4, Math.round(getEdgeValue(edge))));

      // 1 maison du triangle = 1 maison 3D.
      // La fumée est déterministe et limitée à environ 60% des maisons.
      addSectorSmokeColumns(
        group,
        tileX,
        tileZ,
        sector,
        houseCount,
        placedTile.key,
        churchSectors.has(makeSectorKey(placedTile.key, sector.key)),
        cemeterySectors.has(makeSectorKey(placedTile.key, sector.key)),
        placedTile,
        placedTiles
      );
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

function addSectorSmokeColumns(group, tileX, tileZ, sector, columnCount, tileKey, hasChurch = false, hasCemetery = false, placedTile = null, placedTiles = null) {
  const vertices = createOuterVertices();
  const a = vertices[sector.a];
  const b = vertices[sector.b];
  const anchors = getColumnAnchors(columnCount);

  addVillageGroundNetwork(group, tileX, tileZ, sector, columnCount, tileKey, hasChurch, hasCemetery, placedTile, placedTiles);

  if (hasCemetery) {
    const cemeteryLocal = trianglePoint(a, b, 0.18, 0.41, 0.41);
    const cemetery = createVillageCemeteryObject(`${tileKey}:${sector.key}:village-cemetery`, sector);
    cemetery.position.set(tileX + cemeteryLocal.x, HOUSE_BASE_Y + HOUSE_SCALE * 0.018, tileZ + cemeteryLocal.z);
    group.add(cemetery);
  }

  for (let i = 0; i < columnCount; i += 1) {
    const anchor = anchors[i] ?? anchors[anchors.length - 1];
    const seed = `${tileKey}:${sector.key}:house-smoke:${i}`;
    const isChurch = hasChurch && i === 0;
    const baseLocal = trianglePoint(a, b, anchor.centerWeight, anchor.aWeight, anchor.bWeight);
    const local = isChurch ? baseLocal : spreadVillageHouseLocalPoint(baseLocal);
    const column = {
      x: tileX + local.x,
      z: tileZ + local.z,
      puffs: [],
      house: null
    };

    const house = isChurch
      ? createVillageChurchObject(`${tileKey}:${sector.key}:village-church`, sector)
      : createVillageHouseObject(seed, sector, i);
    const houseSurfaceY = getTerrainSurfaceY(local, EDGE_TYPES.house, Math.floor(hashUnit(seed) * 97), { edgeLockStart: 0.98, edgeLockEnd: 1.0 });
    house.position.set(column.x, houseSurfaceY + 0.004, column.z);
    group.add(house);
    column.house = house;

    // Les maisons GLB remplacent intégralement les anciennes maisons SVG/CSS et leurs cheminées.
    // La fumée est volontairement désactivée côté maisons. Les églises restent inchangées.
    if (isChurch) continue;
  }
}



function addCentralHouseConnectionBridges(group, tileX, tileZ, placedTile) {
  const edges = placedTile.tile?.edges;
  if (!edges) return;

  const houseSectors = SECTOR_DEFS.filter(sector => getEdgeType(edges[sector.key]) === EDGE_TYPES.house);
  if (houseSectors.length < 2) return;

  const centerType = getTileCenterType(placedTile);
  const needsBridge = centerType === EDGE_TYPES.water || centerType === EDGE_TYPES.rail || centerType === EDGE_TYPES.house;
  if (!needsBridge) return;

  const vertices = createOuterVertices();
  const sectorPoints = houseSectors.map(sector => {
    const a = vertices[sector.a];
    const b = vertices[sector.b];
    return {
      sector,
      point: trianglePoint(a, b, 0.46, 0.27, 0.27),
      order: EDGE_ORDER.indexOf(sector.key)
    };
  }).sort((left, right) => left.order - right.order);

  const usedPairs = new Set();
  const bridgePairs = [];

  if (sectorPoints.length === 2) {
    bridgePairs.push([sectorPoints[0], sectorPoints[1]]);
  } else {
    for (let i = 0; i < sectorPoints.length; i += 1) {
      const current = sectorPoints[i];
      const next = sectorPoints[(i + 1) % sectorPoints.length];
      const gap = (next.order - current.order + EDGE_ORDER.length) % EDGE_ORDER.length;
      const circularGap = gap === 0 ? EDGE_ORDER.length : gap;
      if (circularGap <= 3) bridgePairs.push([current, next]);
      if (bridgePairs.length >= 3) break;
    }
  }

  bridgePairs.forEach(([fromRef, toRef], index) => {
    const a = fromRef.order < toRef.order ? fromRef.sector.key : toRef.sector.key;
    const b = fromRef.order < toRef.order ? toRef.sector.key : fromRef.sector.key;
    const pairKey = `${a}:${b}`;
    if (usedPairs.has(pairKey)) return;
    usedPairs.add(pairKey);

    addDetailedCentralVillageBridge(
      group,
      tileX,
      tileZ,
      fromRef.point,
      toRef.point,
      HOUSE_SCALE * (centerType === EDGE_TYPES.water ? 0.46 : 0.40),
      placedTile.key,
      pairKey,
      centerType,
      index
    );
  });
}

function addDetailedCentralVillageBridge(group, tileX, tileZ, from, to, width, tileKey, pairKey, centerType, bridgeIndex) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz);
  if (length < HOUSE_SCALE * 0.55) return;

  const rotation = Math.atan2(dx, dz);
  const ux = dx / length;
  const uz = dz / length;
  const nx = -uz;
  const nz = ux;
  const isRailBridge = centerType === EDGE_TYPES.rail;
  const isWaterBridge = centerType === EDGE_TYPES.water;
  const bridgeMat = getVillageGroundMaterial(
    isWaterBridge ? 'village-central-stone-water-bridge-svg' : isRailBridge ? 'village-central-rail-overpass-svg' : 'village-central-road-overpass-svg',
    isWaterBridge ? 0x948B7E : isRailBridge ? 0xA49886 : 0x9A8F7D,
    'bridge'
  );
  const parapetMat = getHouseMaterial('village-central-bridge-light-parapet', 0xC8BDAA);
  const darkMat = getHouseMaterial('village-central-bridge-dark-stone-joints', 0x4A443C);
  const metalMat = getHouseMaterial('village-central-bridge-metal-ornaments', 0x2D3034);

  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(width, HOUSE_SCALE * 0.095, length * 0.94),
    bridgeMat
  );
  deck.name = 'village-central-house-link-detailed-svg-bridge-deck';
  deck.position.set(tileX + (from.x + to.x) * 0.5, HOUSE_BASE_Y + HOUSE_SCALE * 0.140, tileZ + (from.z + to.z) * 0.5);
  deck.rotation.y = rotation;
  deck.renderOrder = 132;
  group.add(deck);

  [-1, 1].forEach(side => {
    const parapet = new THREE.Mesh(
      new THREE.BoxGeometry(HOUSE_SCALE * 0.055, HOUSE_SCALE * 0.155, length * 0.88),
      parapetMat
    );
    parapet.name = 'village-central-house-link-bridge-carved-parapet';
    parapet.position.set(
      deck.position.x + nx * side * (width * 0.60),
      HOUSE_BASE_Y + HOUSE_SCALE * 0.240,
      deck.position.z + nz * side * (width * 0.60)
    );
    parapet.rotation.y = rotation;
    parapet.renderOrder = 134;
    group.add(parapet);
  });

  const archCount = Math.max(2, Math.min(4, Math.floor(length / (HOUSE_SCALE * 0.42))));
  for (let i = 0; i < archCount; i += 1) {
    const t = (i + 0.5) / archCount;
    const arch = new THREE.Mesh(
      new THREE.TorusGeometry(HOUSE_SCALE * 0.105, HOUSE_SCALE * 0.016, 6, 18, Math.PI),
      darkMat
    );
    arch.name = 'village-central-house-link-bridge-visible-arch';
    arch.position.set(
      tileX + from.x + dx * t,
      HOUSE_BASE_Y + HOUSE_SCALE * 0.105,
      tileZ + from.z + dz * t
    );
    arch.rotation.set(Math.PI / 2, 0, rotation + Math.PI / 2);
    arch.scale.x = 1.0 + hashUnit(`${tileKey}:${pairKey}:central-bridge-arch-scale:${i}`) * 0.22;
    arch.renderOrder = 133;
    group.add(arch);
  }

  const capCount = Math.max(4, Math.min(8, Math.floor(length / (HOUSE_SCALE * 0.22)) + 1));
  for (let i = 0; i < capCount; i += 1) {
    const t = capCount === 1 ? 0.5 : i / (capCount - 1);
    [-1, 1].forEach(side => {
      const cap = new THREE.Mesh(
        new THREE.BoxGeometry(HOUSE_SCALE * 0.070, HOUSE_SCALE * 0.055, HOUSE_SCALE * 0.070),
        (i + bridgeIndex) % 2 === 0 ? parapetMat : darkMat
      );
      cap.name = 'village-central-house-link-bridge-capstone';
      cap.position.set(
        tileX + from.x + dx * t + nx * side * (width * 0.60),
        HOUSE_BASE_Y + HOUSE_SCALE * 0.340,
        tileZ + from.z + dz * t + nz * side * (width * 0.60)
      );
      cap.rotation.y = rotation + (hashUnit(`${tileKey}:${pairKey}:central-bridge-cap-rot:${i}:${side}`) - 0.5) * 0.20;
      cap.renderOrder = 136;
      group.add(cap);
    });
  }

  if (isRailBridge) {
    [-1, 1].forEach(side => {
      const guard = new THREE.Mesh(
        new THREE.BoxGeometry(HOUSE_SCALE * 0.022, HOUSE_SCALE * 0.115, length * 0.80),
        metalMat
      );
      guard.name = 'village-central-house-link-rail-overpass-metal-guard';
      guard.position.set(deck.position.x + nx * side * (width * 0.35), HOUSE_BASE_Y + HOUSE_SCALE * 0.365, deck.position.z + nz * side * (width * 0.35));
      guard.rotation.y = rotation;
      guard.renderOrder = 137;
      group.add(guard);
    });
  }

  if (isWaterBridge) {
    const pierCount = Math.max(2, Math.min(4, Math.floor(length / (HOUSE_SCALE * 0.38))));
    for (let i = 0; i < pierCount; i += 1) {
      const t = (i + 0.5) / pierCount;
      const pier = new THREE.Mesh(
        new THREE.BoxGeometry(HOUSE_SCALE * 0.090, HOUSE_SCALE * 0.260, HOUSE_SCALE * 0.075),
        darkMat
      );
      pier.name = 'village-central-house-link-water-bridge-deep-pier';
      pier.position.set(tileX + from.x + dx * t, HOUSE_BASE_Y + HOUSE_SCALE * 0.005, tileZ + from.z + dz * t);
      pier.rotation.y = rotation + Math.PI / 2;
      pier.renderOrder = 131;
      group.add(pier);
    }
  }
}

function addVillageGroundNetwork(group, tileX, tileZ, sector, columnCount, tileKey, hasChurch, hasCemetery, placedTile, placedTiles) {
  const vertices = createOuterVertices();
  const a = vertices[sector.a];
  const b = vertices[sector.b];
  const anchors = getColumnAnchors(columnCount);
  const isLargeVillageSector = hasChurch || hasCemetery || columnCount >= 3;
  const roadMaterial = isLargeVillageSector
    ? getVillageGroundMaterial('village-paved-road-svg', 0x8A8174, 'paved')
    : getVillageGroundMaterial('village-dirt-path-svg', 0x8A6742, 'dirt');
  const center = { x: 0, z: 0 };
  const junction = trianglePoint(a, b, 0.42, 0.29, 0.29);
  const edgeMid = { x: (a.x + b.x) * 0.5, z: (a.z + b.z) * 0.5 };
  const width = isLargeVillageSector ? HOUSE_SCALE * 0.29 : HOUSE_SCALE * 0.13;

  const waterCrossing = hasWaterBridgeOpportunity(placedTile, sector.key, placedTiles);

  // Chemin principal depuis le cœur de la tuile vers le quartier maison.
  addVillageRoadSegment(group, tileX, tileZ, center, junction, width, roadMaterial, 'village-dynamic-main-road', tileKey, sector.key, 'main', isLargeVillageSector);

  if (waterCrossing) {
    if (isLargeVillageSector) {
      addDetailedPavedWaterBridge(group, tileX, tileZ, junction, edgeMid, width * 1.18, tileKey, sector.key);
    } else {
      addDirtPathOnStilts(group, tileX, tileZ, junction, edgeMid, width * 0.96, roadMaterial, tileKey, sector.key);
    }
  } else {
    addVillageRoadSegment(group, tileX, tileZ, junction, edgeMid, width * 0.92, roadMaterial, 'village-dynamic-edge-road', tileKey, sector.key, 'edge', isLargeVillageSector);
  }

  // Intersections dynamiques : une patte vers chaque maison générée.
  anchors.slice(0, columnCount).forEach((anchor, index) => {
    const local = trianglePoint(a, b, anchor.centerWeight, anchor.aWeight, anchor.bWeight);
    addVillageRoadSegment(
      group,
      tileX,
      tileZ,
      junction,
      local,
      width * (isLargeVillageSector ? (index === 0 && hasChurch ? 0.82 : 0.66) : (index === 0 && hasChurch ? 0.92 : 0.68)),
      roadMaterial,
      'village-dynamic-house-lane',
      tileKey,
      sector.key,
      `lane-${index}`,
      isLargeVillageSector
    );
  });

  if (columnCount >= 3 || hasChurch) {
    const plazaMaterial = getVillageGroundMaterial('village-plaza-paved-svg', 0x938879, 'paved');
    const plaza = new THREE.Mesh(
      new THREE.CylinderGeometry(width * 1.18, width * 1.18, HOUSE_SCALE * 0.030, 10),
      plazaMaterial
    );
    plaza.name = 'village-dynamic-intersection-plaza';
    plaza.position.set(tileX + junction.x, HOUSE_BASE_Y + HOUSE_SCALE * 0.012, tileZ + junction.z);
    plaza.rotation.y = hashUnit(`${tileKey}:${sector.key}:plaza-rotation`) * Math.PI;
    plaza.renderOrder = 111;
    group.add(plaza);
  }

}

function addVillageRoadSegment(group, tileX, tileZ, from, to, width, material, name, tileKey, sectorKey, segmentKey, isPaved) {
  if (isPaved) {
    addGroundStrip(group, tileX, tileZ, from, to, width, material, name);
    addPavedRoadEdgeMarkers(group, tileX, tileZ, from, to, width, tileKey, sectorKey, segmentKey);
    return;
  }

  addChaoticDirtPath(group, tileX, tileZ, from, to, width, material, name, tileKey, sectorKey, segmentKey);
}

function addChaoticDirtPath(group, tileX, tileZ, from, to, width, material, name, tileKey, sectorKey, segmentKey) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz);
  if (length < 0.001) return;

  const nx = -dz / length;
  const nz = dx / length;
  const segmentCount = 4;
  const points = [from];

  for (let i = 1; i < segmentCount; i += 1) {
    const t = i / segmentCount;
    const baseX = from.x + dx * t;
    const baseZ = from.z + dz * t;
    const wobble = (hashUnit(`${tileKey}:${sectorKey}:${segmentKey}:dirt-wobble:${i}`) - 0.5) * width * 2.9;
    const forwardSlip = (hashUnit(`${tileKey}:${sectorKey}:${segmentKey}:dirt-slip:${i}`) - 0.5) * width * 0.85;
    points.push({
      x: baseX + nx * wobble + (dx / length) * forwardSlip,
      z: baseZ + nz * wobble + (dz / length) * forwardSlip
    });
  }

  points.push(to);

  for (let i = 0; i < points.length - 1; i += 1) {
    const localWidth = width * (0.84 + hashUnit(`${tileKey}:${sectorKey}:${segmentKey}:dirt-width:${i}`) * 0.36);
    addGroundStrip(group, tileX, tileZ, points[i], points[i + 1], localWidth, material, `${name}-chaotic-${i}`);
  }
}

function addPavedRoadEdgeMarkers(group, tileX, tileZ, from, to, width, tileKey, sectorKey, segmentKey) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz);
  if (length < HOUSE_SCALE * 0.7) return;

  const ux = dx / length;
  const uz = dz / length;
  const nx = -uz;
  const nz = ux;
  const markerMaterial = getHouseMaterial('village-paved-road-border-stones', 0xD8D0BE);
  const darkMarkerMaterial = getHouseMaterial('village-paved-road-border-dark-stones', 0x5E584F);
  const markerCount = Math.max(2, Math.min(5, Math.floor(length / (HOUSE_SCALE * 0.42))));

  for (let i = 1; i <= markerCount; i += 1) {
    const t = i / (markerCount + 1);
    const sideJitter = (hashUnit(`${tileKey}:${sectorKey}:${segmentKey}:marker-side:${i}`) - 0.5) * HOUSE_SCALE * 0.020;
    const alongJitter = (hashUnit(`${tileKey}:${sectorKey}:${segmentKey}:marker-along:${i}`) - 0.5) * HOUSE_SCALE * 0.050;

    [-1, 1].forEach(side => {
      const stone = new THREE.Mesh(
        new THREE.BoxGeometry(HOUSE_SCALE * 0.048, HOUSE_SCALE * 0.055, HOUSE_SCALE * 0.075),
        side < 0 ? markerMaterial : darkMarkerMaterial
      );
      stone.name = 'village-paved-road-wide-border-marker';
      stone.position.set(
        tileX + from.x + dx * t + ux * alongJitter + nx * (side * (width * 0.58 + HOUSE_SCALE * 0.032 + sideJitter)),
        HOUSE_BASE_Y + HOUSE_SCALE * 0.036,
        tileZ + from.z + dz * t + uz * alongJitter + nz * (side * (width * 0.58 + HOUSE_SCALE * 0.032 + sideJitter))
      );
      stone.rotation.y = Math.atan2(dx, dz) + (hashUnit(`${tileKey}:${sectorKey}:${segmentKey}:marker-rot:${i}:${side}`) - 0.5) * 0.24;
      stone.renderOrder = 114;
      group.add(stone);
    });
  }
}

function addGroundStrip(group, tileX, tileZ, from, to, width, material, name) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz);
  if (length < 0.001) return null;

  const strip = new THREE.Mesh(
    new THREE.BoxGeometry(width, HOUSE_SCALE * 0.026, length),
    material
  );
  strip.name = name;
  strip.position.set(tileX + (from.x + to.x) * 0.5, HOUSE_BASE_Y + HOUSE_SCALE * 0.010, tileZ + (from.z + to.z) * 0.5);
  strip.rotation.y = Math.atan2(dx, dz);
  strip.renderOrder = 110;
  strip.castShadow = false;
  strip.receiveShadow = false;
  group.add(strip);
  return strip;
}


function addDirtPathOnStilts(group, tileX, tileZ, from, to, width, material, tileKey, sectorKey) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz);
  if (length < 0.001) return;

  const deck = addGroundStrip(group, tileX, tileZ, from, to, width * 1.06, material, 'village-dirt-path-on-water-stilts');
  if (deck) {
    deck.position.y = HOUSE_BASE_Y + HOUSE_SCALE * 0.070;
    deck.renderOrder = 118;
  }

  const ux = dx / length;
  const uz = dz / length;
  const nx = -uz;
  const nz = ux;
  const postMaterial = getHouseMaterial('village-dirt-stilt-dark-wood', 0x4A321E);
  const braceMaterial = getHouseMaterial('village-dirt-stilt-braces', 0x6A4A2C);
  const postCount = Math.max(2, Math.min(5, Math.floor(length / (HOUSE_SCALE * 0.34)) + 1));

  for (let i = 0; i < postCount; i += 1) {
    const t = postCount === 1 ? 0.5 : i / (postCount - 1);
    const alongJitter = (hashUnit(`${tileKey}:${sectorKey}:stilt-along:${i}`) - 0.5) * HOUSE_SCALE * 0.030;
    [-1, 1].forEach(side => {
      const lean = (hashUnit(`${tileKey}:${sectorKey}:stilt-lean:${i}:${side}`) - 0.5) * 0.20;
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(HOUSE_SCALE * 0.035, HOUSE_SCALE * 0.25, HOUSE_SCALE * 0.035),
        postMaterial
      );
      post.name = 'village-dirt-path-water-stilt-post';
      post.position.set(
        tileX + from.x + dx * t + ux * alongJitter + nx * side * width * 0.54,
        HOUSE_BASE_Y - HOUSE_SCALE * 0.030,
        tileZ + from.z + dz * t + uz * alongJitter + nz * side * width * 0.54
      );
      post.rotation.z = lean;
      post.rotation.y = Math.atan2(dx, dz) + lean * 0.35;
      post.renderOrder = 117;
      group.add(post);
    });
  }

  const railCount = 2;
  for (let i = 0; i < railCount; i += 1) {
    const side = i === 0 ? -1 : 1;
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(HOUSE_SCALE * 0.026, HOUSE_SCALE * 0.036, length * 0.90),
      braceMaterial
    );
    rail.name = 'village-dirt-path-water-stilt-side-brace';
    rail.position.set(
      tileX + (from.x + to.x) * 0.5 + nx * side * width * 0.60,
      HOUSE_BASE_Y + HOUSE_SCALE * 0.075,
      tileZ + (from.z + to.z) * 0.5 + nz * side * width * 0.60
    );
    rail.rotation.y = Math.atan2(dx, dz);
    rail.renderOrder = 119;
    group.add(rail);
  }
}

function addDetailedPavedWaterBridge(group, tileX, tileZ, from, to, width, tileKey, sectorKey) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz);
  if (length < 0.001) return;

  const rotation = Math.atan2(dx, dz);
  const ux = dx / length;
  const uz = dz / length;
  const nx = -uz;
  const nz = ux;
  const bridgeMat = getVillageGroundMaterial('village-detailed-paved-bridge-svg', 0x8C8578, 'bridge');
  const parapetMat = getHouseMaterial('village-paved-bridge-parapet-stone', 0xB8B0A2);
  const darkStoneMat = getHouseMaterial('village-paved-bridge-dark-joints', 0x514B43);

  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(width, HOUSE_SCALE * 0.082, length * 0.98),
    bridgeMat
  );
  deck.name = 'village-detailed-paved-bridge-over-water-svg-deck';
  deck.position.set(tileX + (from.x + to.x) * 0.5, HOUSE_BASE_Y + HOUSE_SCALE * 0.083, tileZ + (from.z + to.z) * 0.5);
  deck.rotation.y = rotation;
  deck.renderOrder = 122;
  group.add(deck);

  [-1, 1].forEach(side => {
    const parapet = new THREE.Mesh(
      new THREE.BoxGeometry(HOUSE_SCALE * 0.060, HOUSE_SCALE * 0.155, length * 0.96),
      parapetMat
    );
    parapet.name = 'village-detailed-paved-bridge-stone-parapet';
    parapet.position.set(
      deck.position.x + nx * side * (width * 0.56),
      HOUSE_BASE_Y + HOUSE_SCALE * 0.170,
      deck.position.z + nz * side * (width * 0.56)
    );
    parapet.rotation.y = rotation;
    parapet.renderOrder = 124;
    group.add(parapet);
  });

  const pierCount = Math.max(2, Math.min(4, Math.floor(length / (HOUSE_SCALE * 0.42)) + 1));
  for (let i = 0; i < pierCount; i += 1) {
    const t = (i + 0.5) / pierCount;
    [-1, 1].forEach(side => {
      const pier = new THREE.Mesh(
        new THREE.BoxGeometry(HOUSE_SCALE * 0.075, HOUSE_SCALE * 0.24, HOUSE_SCALE * 0.095),
        darkStoneMat
      );
      pier.name = 'village-detailed-paved-bridge-visible-pier';
      pier.position.set(
        tileX + from.x + dx * t + nx * side * (width * 0.45),
        HOUSE_BASE_Y - HOUSE_SCALE * 0.010,
        tileZ + from.z + dz * t + nz * side * (width * 0.45)
      );
      pier.rotation.y = rotation + (hashUnit(`${tileKey}:${sectorKey}:bridge-pier-rot:${i}:${side}`) - 0.5) * 0.08;
      pier.renderOrder = 121;
      group.add(pier);
    });
  }

  const capCount = Math.max(3, Math.min(6, Math.floor(length / (HOUSE_SCALE * 0.28)) + 1));
  for (let i = 0; i < capCount; i += 1) {
    const t = i / Math.max(1, capCount - 1);
    [-1, 1].forEach(side => {
      const cap = new THREE.Mesh(
        new THREE.BoxGeometry(HOUSE_SCALE * 0.090, HOUSE_SCALE * 0.060, HOUSE_SCALE * 0.090),
        i % 2 === 0 ? parapetMat : darkStoneMat
      );
      cap.name = 'village-detailed-paved-bridge-parapet-capstone';
      cap.position.set(
        tileX + from.x + dx * t + nx * side * (width * 0.56),
        HOUSE_BASE_Y + HOUSE_SCALE * 0.265,
        tileZ + from.z + dz * t + nz * side * (width * 0.56)
      );
      cap.rotation.y = rotation + (hashUnit(`${tileKey}:${sectorKey}:bridge-cap-rot:${i}:${side}`) - 0.5) * 0.18;
      cap.renderOrder = 126;
      group.add(cap);
    });
  }
}

function addVillageBridge(group, tileX, tileZ, from, to, tileKey, edgeKey) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz);
  if (length < 0.001) return;

  const bridgeMat = getVillageGroundMaterial('village-wooden-bridge-svg', 0x7A5738, 'bridge');
  const bridge = new THREE.Mesh(
    new THREE.BoxGeometry(HOUSE_SCALE * 0.32, HOUSE_SCALE * 0.060, length * 0.92),
    bridgeMat
  );
  bridge.name = 'village-opportunity-small-bridge-over-water';
  bridge.position.set(tileX + (from.x + to.x) * 0.5, HOUSE_BASE_Y + HOUSE_SCALE * 0.055, tileZ + (from.z + to.z) * 0.5);
  bridge.rotation.y = Math.atan2(dx, dz);
  bridge.renderOrder = 116;
  group.add(bridge);

  const railMat = getHouseMaterial('village-bridge-dark-rails', 0x3B2A20);
  [-1, 1].forEach(side => {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(HOUSE_SCALE * 0.035, HOUSE_SCALE * 0.095, length * 0.86), railMat);
    rail.name = 'village-opportunity-bridge-side-rail';
    rail.position.set(bridge.position.x + Math.cos(bridge.rotation.y) * HOUSE_SCALE * 0.17 * side, bridge.position.y + HOUSE_SCALE * 0.055, bridge.position.z - Math.sin(bridge.rotation.y) * HOUSE_SCALE * 0.17 * side);
    rail.rotation.y = bridge.rotation.y;
    rail.renderOrder = 117;
    group.add(rail);
  });
}

function hasWaterBridgeOpportunity(placedTile, edgeKey, placedTiles) {
  if (!placedTile || !placedTiles) return false;
  const edgeIndex = EDGE_ORDER.indexOf(edgeKey);
  const nearbyEdges = [edgeKey, EDGE_ORDER[(edgeIndex + 1) % EDGE_ORDER.length], EDGE_ORDER[(edgeIndex + EDGE_ORDER.length - 1) % EDGE_ORDER.length]];

  for (const nearbyEdge of nearbyEdges) {
    const direction = DIRECTION_BY_EDGE[nearbyEdge];
    if (!direction) continue;
    const neighbor = placedTiles.get(makeHexKey(placedTile.q + direction.q, placedTile.r + direction.r));
    if (neighbor && getTileEdgeType(neighbor, getOppositeEdge(nearbyEdge)) === EDGE_TYPES.water) return true;
  }

  return nearbyEdges.some(edge => getTileEdgeType(placedTile, edge) === EDGE_TYPES.water);
}

function getVillageGroundMaterial(key, color, style) {
  if (houseMaterialCache.has(key)) return houseMaterialCache.get(key);

  const base = hexColor(color);
  const dark = shiftHexColor(color, style === 'paved' ? -52 : -38);
  const light = shiftHexColor(color, style === 'bridge' ? 46 : 34);
  const svg = style === 'paved'
    ? createPavedRoadSvg(base, dark, light)
    : style === 'bridge'
      ? createBridgePlankSvg(base, dark, light)
      : createDirtPathSvg(base, dark, light);
  const texture = new THREE.TextureLoader().load(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(style === 'paved' ? 2.7 : 3.1, style === 'bridge' ? 3.4 : 2.0);
  texture.anisotropy = 4;
  texture.colorSpace = THREE.SRGBColorSpace;

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: THREE.DoubleSide
  });

  houseMaterialCache.set(key, material);
  return material;
}

function createDirtPathSvg(base, dark, light) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
    <rect width="96" height="96" fill="${base}"/>
    <path d="M0 18C12 7 24 35 39 20S64 5 96 27M-8 57C12 80 31 39 50 61S78 49 104 70M0 88C18 76 29 96 49 83S75 74 96 90" stroke="${dark}" stroke-width="5.4" opacity=".40" fill="none" stroke-linecap="round"/>
    <path d="M4 28C23 19 36 39 55 27S80 23 96 34" stroke="${light}" stroke-width="2.8" opacity=".34" fill="none" stroke-linecap="round"/>
    <circle cx="12" cy="17" r="3.4" fill="${light}" opacity=".42"/><circle cx="29" cy="39" r="2.2" fill="${dark}" opacity=".42"/>
    <circle cx="58" cy="18" r="2.6" fill="${dark}" opacity=".34"/><circle cx="76" cy="55" r="3.8" fill="${light}" opacity=".30"/><circle cx="87" cy="82" r="2.8" fill="${dark}" opacity=".40"/>
  </svg>`;
}

function createPavedRoadSvg(base, dark, light) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
    <rect width="96" height="96" fill="${base}"/>
    <path d="M0 12H96M0 30H96M0 48H96M0 66H96M0 84H96" stroke="${dark}" stroke-width="3.4" opacity=".64"/>
    <path d="M14 0V12M46 0V12M78 0V12M0 12V30M30 12V30M62 12V30M94 12V30M14 30V48M46 30V48M78 30V48M0 48V66M30 48V66M62 48V66M94 48V66M14 66V84M46 66V84M78 66V84M0 84V96M30 84V96M62 84V96M94 84V96" stroke="${dark}" stroke-width="2.8" opacity=".56"/>
    <path d="M4 8h18M34 24h22M66 42h20M8 60h24M44 78h26" stroke="${light}" stroke-width="2.4" opacity=".52"/>
    <path d="M2 2V94M94 2V94" stroke="${light}" stroke-width="3.2" opacity=".42"/>
  </svg>`;
}

function createBridgePlankSvg(base, dark, light) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
    <rect width="96" height="96" fill="${base}"/>
    <path d="M0 10H96M0 24H96M0 38H96M0 52H96M0 66H96M0 80H96" stroke="${dark}" stroke-width="3.8" opacity=".64"/>
    <path d="M0 0V96M18 0V10M48 0V10M76 0V10M8 10V24M36 10V24M66 10V24M92 10V24M20 24V38M52 24V38M82 24V38M10 38V52M40 38V52M70 38V52M4 52V66M34 52V66M64 52V66M90 52V66M24 66V80M56 66V80M84 66V80M12 80V96M44 80V96M74 80V96" stroke="${dark}" stroke-width="2.8" opacity=".58"/>
    <path d="M5 7h20M35 19h26M66 34h22M8 47h28M42 61h34M14 76h26M54 89h32" stroke="${light}" stroke-width="2.4" opacity=".48"/>
    <circle cx="15" cy="16" r="2.2" fill="${dark}" opacity=".44"/><circle cx="58" cy="30" r="2.0" fill="${dark}" opacity=".38"/><circle cx="31" cy="58" r="2.4" fill="${dark}" opacity=".40"/><circle cx="78" cy="72" r="2.1" fill="${dark}" opacity=".42"/>
    <path d="M3 4V92M93 4V92" stroke="${light}" stroke-width="3.0" opacity=".34"/>
  </svg>`;
}

function collectVillageChurchSectors(placedTiles) {
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
        if (selected.size >= 256) break; // garde-fou, pas Notre-Dame à chaque pixel.
        if (usedTiles.has(candidate.tile.key)) continue;
        selected.add(makeSectorKey(candidate.tile.key, candidate.edge));
        usedTiles.add(candidate.tile.key);
        if (usedTiles.size >= churchCount) break;
      }
    }
  }

  return selected;
}


function collectVillageCemeterySectors(placedTiles, blockedSectors = new Set()) {
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
      if (zone.total < CEMETERY_MIN_HOUSES) continue;

      const cemeteryCount = Math.min(
        CEMETERY_MAX_PER_ZONE,
        Math.max(1, 1 + Math.floor((zone.total - CEMETERY_MIN_HOUSES) / CEMETERY_HOUSES_PER_EXTRA))
      );

      const churchRefs = zone.sectors.filter(sectorRef => blockedSectors.has(makeSectorKey(sectorRef.tile.key, sectorRef.edge)));
      const ordered = [...zone.sectors]
        .filter(sectorRef => !blockedSectors.has(makeSectorKey(sectorRef.tile.key, sectorRef.edge)))
        .sort((a, b) => rankCemeteryCandidate(a, zone, churchRefs) - rankCemeteryCandidate(b, zone, churchRefs));
      const fallback = [...zone.sectors]
        .sort((a, b) => rankCemeteryCandidate(a, zone, churchRefs) - rankCemeteryCandidate(b, zone, churchRefs));
      const candidates = ordered.length > 0 ? ordered : fallback;
      const usedTiles = new Set();

      for (const candidate of candidates) {
        if (usedTiles.has(candidate.tile.key)) continue;
        selected.add(makeSectorKey(candidate.tile.key, candidate.edge));
        usedTiles.add(candidate.tile.key);
        if (usedTiles.size >= cemeteryCount) break;
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

function rankChurchCandidate(sectorRef, zone) {
  const value = getEdgeValue(sectorRef.tile.tile.edges[sectorRef.edge]);
  const centerBonus = getTileCenterType(sectorRef.tile) === EDGE_TYPES.house ? 80 : 0;
  const seed = hashUnit(`${zone.total}:${zone.sectors.length}:${sectorRef.tile.key}:${sectorRef.edge}:church-rank`);
  return -(value * 100 + centerBonus + seed);
}

function rankCemeteryCandidate(sectorRef, zone, churchRefs = []) {
  const value = getEdgeValue(sectorRef.tile.tile.edges[sectorRef.edge]);
  const edgeIndex = EDGE_ORDER.indexOf(sectorRef.edge);
  const edgeBias = Math.abs(2.5 - edgeIndex) * 4;
  const churchProximity = getNearestChurchProximityScore(sectorRef, churchRefs);
  const seed = hashUnit(`${zone.total}:${zone.sectors.length}:${sectorRef.tile.key}:${sectorRef.edge}:cemetery-rank`);
  return -(churchProximity * 260 + value * 62 + edgeBias + seed);
}

function getNearestChurchProximityScore(sectorRef, churchRefs) {
  if (!churchRefs.length) return 0;

  let best = 0;
  const sectorEdgeIndex = EDGE_ORDER.indexOf(sectorRef.edge);

  for (const churchRef of churchRefs) {
    const tileDistance = getHexDistance(sectorRef.tile.q, sectorRef.tile.r, churchRef.tile.q, churchRef.tile.r);
    const churchEdgeIndex = EDGE_ORDER.indexOf(churchRef.edge);
    const edgeDistance = Math.abs(sectorEdgeIndex - churchEdgeIndex);
    const circularEdgeDistance = Math.min(edgeDistance, EDGE_ORDER.length - edgeDistance);
    const score = Math.max(0, 4 - tileDistance) * 1.6 + Math.max(0, 3 - circularEdgeDistance) * 0.7;
    best = Math.max(best, score);
  }

  return best;
}

function getHexDistance(q1, r1, q2, r2) {
  const dq = q1 - q2;
  const dr = r1 - r2;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

function makeSectorKey(tileKey, edge) {
  return `${tileKey}:${edge}`;
}

function getTileEdgeType(placedTile, edge) {
  return getEdgeType(placedTile.tile.edges[edge]);
}

function getTileCenterType(placedTile) {
  return placedTile.tile.center ?? null;
}


function ensureHouseGlbModels(group) {
  if (houseModelsLoading || houseModelsRequested) return;
  houseModelsLoading = true;
  houseModelsRequested = true;

  let pending = HOUSE_GLB_MODEL_DEFS.length;
  const finishOne = () => {
    pending -= 1;
    if (pending > 0) return;

    houseModelsLoading = false;
    const lastPlacedTiles = group.userData.lastPlacedTiles;
    if (lastPlacedTiles) rebuildHouseSmokeOverlay(group, lastPlacedTiles);
  };

  for (const def of HOUSE_GLB_MODEL_DEFS) {
    new GLTFLoader().load(
      def.url,
      gltf => {
        houseGlbLibrary.set(def.key, prepareHouseGlbPrototype(gltf.scene, def));
        finishOne();
      },
      undefined,
      error => {
        console.warn(`Modèle maison GLB indisponible : ${def.url}`, error);
        finishOne();
      }
    );
  }
}

function prepareHouseGlbPrototype(model, def) {
  const source = model.clone(true);
  const prototype = normalizeHouseGlbModel(source, def);

  prototype.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    if (object.material) object.material = cloneHouseGlbMaterial(object.material);
  });

  return prototype;
}

function cloneHouseGlbMaterial(material) {
  if (Array.isArray(material)) return material.map(item => cloneHouseGlbMaterial(item));

  const cloned = material.clone();
  cloned.side = THREE.DoubleSide;
  if ('emissiveIntensity' in cloned) cloned.emissiveIntensity = 0;
  if ('toneMapped' in cloned) cloned.toneMapped = true;
  cloned.needsUpdate = true;
  return cloned;
}

function normalizeHouseGlbModel(model, def) {
  const wrapper = new THREE.Group();
  wrapper.name = `normalized-${def.key}-village-house-glb`;

  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  model.position.set(-center.x, -box.min.y, -center.z);

  const maxDimension = Math.max(size.x, size.y, size.z) || 1;
  wrapper.scale.setScalar((HOUSE_SCALE * def.size) / maxDimension);
  wrapper.add(model);
  return wrapper;
}


function spreadVillageHouseLocalPoint(local) {
  return {
    x: local.x * HOUSE_GLB_SPACING_MULTIPLIER,
    z: local.z * HOUSE_GLB_SPACING_MULTIPLIER
  };
}

function createVillageHouseObject(seedKey, sector, index) {
  const group = new THREE.Group();
  group.name = 'village-house-glb';

  const sectorAngle = (SECTOR_DEFS.findIndex(item => item.key === sector.key) * Math.PI / 3) + Math.PI / 6;
  const jitter = (hashUnit(`${seedKey}:house-rotation`) - 0.5) * 0.42;
  group.rotation.y = -sectorAngle + jitter;
  group.scale.setScalar((0.94 + hashUnit(`${seedKey}:house-scale`) * 0.18) * HOUSE_GLB_SIZE_MULTIPLIER);

  const def = pickHouseGlbDefinition(seedKey, index);
  const prototype = houseGlbLibrary.get(def.key);

  if (!prototype) return group;

  const house = prototype.clone(true);
  house.name = `${def.key}-village-house-instance`;
  house.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow = false;
    object.receiveShadow = false;
  });

  group.add(house);
  return group;
}


function pickHouseGlbDefinition(seedKey, index) {
  // Pondération volontairement asymétrique : les petites maisons doivent composer
  // l'essentiel des villages. Les modèles moyens/gros restent possibles, mais
  // évitent de transformer un petit triangle en centre commercial des enfers.
  const totalWeight = HOUSE_GLB_MODEL_DEFS.reduce((total, def) => total + (def.spawnWeight ?? 1), 0);
  let roll = hashUnit(`${seedKey}:weighted-glb-variant:${index}`) * totalWeight;

  for (const def of HOUSE_GLB_MODEL_DEFS) {
    roll -= def.spawnWeight ?? 1;
    if (roll <= 0) return def;
  }

  return HOUSE_GLB_MODEL_DEFS[0];
}

function createVillageChurchObject(seedKey, sector) {
  const group = new THREE.Group();
  group.name = 'village-church-3d-large-zone-reward';

  const sectorAngle = (SECTOR_DEFS.findIndex(item => item.key === sector.key) * Math.PI / 3) + Math.PI / 6;
  const jitter = (hashUnit(`${seedKey}:church-rotation`) - 0.5) * 0.22;
  group.rotation.y = -sectorAngle + jitter;
  group.scale.setScalar(1.23);

  const naveWidth = HOUSE_SCALE * 1.24;
  const naveDepth = HOUSE_SCALE * 1.82;
  const naveHeight = HOUSE_SCALE * 1.10;
  const stone = getWallSvgMaterial('church-stone-warm-svg', 0xC9B796, 'stone');
  const darkStone = getWallSvgMaterial('church-stone-dark-svg', 0x8D806D, 'stoneDark');
  const roofMat = getRoofSvgMaterial('church-roof-slate-svg', 0x4C5662, 'slate');
  const glassMat = getHouseMaterial('church-glass-blue', 0xB9E1FF);
  const goldMat = getHouseMaterial('church-cross-gold', 0xE1C15A);

  const base = new THREE.Mesh(new THREE.BoxGeometry(naveWidth * 1.18, HOUSE_SCALE * 0.12, naveDepth * 1.12), darkStone);
  base.name = 'village-church-stone-base';
  base.position.set(0, HOUSE_SCALE * 0.06, 0);

  const nave = new THREE.Mesh(new THREE.BoxGeometry(naveWidth, naveHeight, naveDepth), stone);
  nave.name = 'village-church-nave';
  nave.position.set(0, HOUSE_SCALE * 0.12 + naveHeight * 0.5, 0);

  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(naveWidth * 0.80, HOUSE_SCALE * 0.62, 4),
    roofMat
  );
  roof.name = 'village-church-roof';
  roof.position.set(0, HOUSE_SCALE * 0.12 + naveHeight + HOUSE_SCALE * 0.28, 0);
  roof.rotation.y = Math.PI / 4;
  roof.scale.z = naveDepth / Math.max(naveWidth, 0.001);

  const towerWidth = HOUSE_SCALE * 0.70;
  const towerHeight = HOUSE_SCALE * 1.96;
  const tower = new THREE.Mesh(new THREE.BoxGeometry(towerWidth, towerHeight, towerWidth), stone);
  tower.name = 'village-church-bell-tower';
  tower.position.set(0, HOUSE_SCALE * 0.12 + towerHeight * 0.5, -naveDepth * 0.54);

  const spire = new THREE.Mesh(
    new THREE.ConeGeometry(towerWidth * 0.64, HOUSE_SCALE * 1.22, 4),
    roof.material
  );
  spire.name = 'village-church-spire';
  spire.position.set(0, HOUSE_SCALE * 0.12 + towerHeight + HOUSE_SCALE * 0.56, -naveDepth * 0.54);
  spire.rotation.y = Math.PI / 4;

  const crossVertical = new THREE.Mesh(new THREE.BoxGeometry(HOUSE_SCALE * 0.055, HOUSE_SCALE * 0.34, HOUSE_SCALE * 0.055), goldMat);
  crossVertical.name = 'village-church-cross-vertical';
  crossVertical.position.set(0, HOUSE_SCALE * 0.12 + towerHeight + HOUSE_SCALE * 1.30, -naveDepth * 0.54);

  const crossHorizontal = new THREE.Mesh(new THREE.BoxGeometry(HOUSE_SCALE * 0.24, HOUSE_SCALE * 0.050, HOUSE_SCALE * 0.050), goldMat);
  crossHorizontal.name = 'village-church-cross-horizontal';
  crossHorizontal.position.set(0, HOUSE_SCALE * 0.12 + towerHeight + HOUSE_SCALE * 1.35, -naveDepth * 0.54);

  const door = new THREE.Mesh(new THREE.PlaneGeometry(HOUSE_SCALE * 0.34, HOUSE_SCALE * 0.54), getHouseMaterial('church-door-dark-oak', 0x4C3326));
  door.name = 'village-church-front-door';
  door.position.set(0, HOUSE_SCALE * 0.42, -naveDepth * 0.54 - towerWidth * 0.505);

  const rose = new THREE.Mesh(new THREE.CircleGeometry(HOUSE_SCALE * 0.16, 18), glassMat);
  rose.name = 'village-church-rose-window';
  rose.position.set(0, HOUSE_SCALE * 1.18, -naveDepth * 0.54 - towerWidth * 0.508);

  const leftWindow = createChurchSideWindow(-naveWidth * 0.505, HOUSE_SCALE * 0.86, -naveDepth * 0.14, glassMat, true);
  const rightWindow = createChurchSideWindow(naveWidth * 0.505, HOUSE_SCALE * 0.86, naveDepth * 0.18, glassMat, false);
  const rearWindow = new THREE.Mesh(new THREE.PlaneGeometry(HOUSE_SCALE * 0.30, HOUSE_SCALE * 0.46), glassMat);
  rearWindow.name = 'village-church-rear-window';
  rearWindow.position.set(0, HOUSE_SCALE * 0.92, naveDepth * 0.506);
  rearWindow.rotation.y = Math.PI;

  for (const mesh of [base, nave, roof, tower, spire, crossVertical, crossHorizontal, door, rose, leftWindow, rightWindow, rearWindow]) {
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.renderOrder = 128;
  }

  group.add(base, nave, roof, tower, spire, crossVertical, crossHorizontal, door, rose, leftWindow, rightWindow, rearWindow);
  return group;
}


function createVillageCemeteryObject(seedKey, sector) {
  const group = new THREE.Group();
  group.name = 'village-cemetery-svg-style-zone-reward';

  const sectorAngle = (SECTOR_DEFS.findIndex(item => item.key === sector.key) * Math.PI / 3) + Math.PI / 6;
  const jitter = (hashUnit(`${seedKey}:cemetery-rotation`) - 0.5) * 0.30;
  group.rotation.y = -sectorAngle + jitter;
  group.scale.setScalar(1.14 + hashUnit(`${seedKey}:cemetery-scale`) * 0.16);

  const gravelMat = getGravelSvgMaterial('cemetery-gravel-grey-svg', 0x8B8982);
  const soilMat = getHouseMaterial('cemetery-soil-dark', 0x4F4A43);
  const grassMat = getHouseMaterial('cemetery-grass-muted', 0x4E6B3E);
  const stoneMat = getHouseMaterial('cemetery-stone-pale', 0xB8B2A4);
  const darkStoneMat = getHouseMaterial('cemetery-stone-dark', 0x777064);
  const ironMat = getHouseMaterial('cemetery-iron-cross', 0x2F3030);
  const fenceMat = getHouseMaterial('cemetery-fence-wood', 0x5B4433);

  const base = new THREE.Mesh(new THREE.BoxGeometry(HOUSE_SCALE * 1.72, HOUSE_SCALE * 0.045, HOUSE_SCALE * 1.18), gravelMat);
  base.name = 'village-cemetery-grey-gravel-plot';
  base.position.set(0, HOUSE_SCALE * 0.025, 0);
  base.renderOrder = 127;

  const path = new THREE.Mesh(new THREE.BoxGeometry(HOUSE_SCALE * 0.24, HOUSE_SCALE * 0.052, HOUSE_SCALE * 1.08), soilMat);
  path.name = 'village-cemetery-central-earth-path';
  path.position.set(0, HOUSE_SCALE * 0.055, 0);
  path.renderOrder = 128;

  group.add(base, path);

  const graves = [
    [-0.62, -0.38, -0.18, 'cross'],
    [-0.34,  0.28,  0.12, 'stone'],
    [ 0.16, -0.32,  0.22, 'cross'],
    [ 0.54,  0.31, -0.14, 'stone'],
    [-0.66,  0.30,  0.20, 'stone'],
    [ 0.42, -0.46, -0.10, 'cross'],
    [-0.05,  0.48,  0.18, 'stone'],
    [ 0.70, -0.08, -0.22, 'cross']
  ];

  graves.forEach(([gx, gz, tilt, type], index) => {
    const x = HOUSE_SCALE * gx;
    const z = HOUSE_SCALE * gz;
    const graveSeed = `${seedKey}:grave:${index}`;
    const lean = tilt + (hashUnit(`${graveSeed}:lean`) - 0.5) * 0.28;
    if (type === 'cross') {
      addCemeteryCross(group, x, z, lean, index % 2 ? darkStoneMat : ironMat);
    } else {
      addTombstone(group, x, z, lean, index % 2 ? stoneMat : darkStoneMat);
    }
    addGraveSlab(group, x, z + HOUSE_SCALE * 0.045, hashUnit(`${graveSeed}:slab`) > 0.5 ? stoneMat : soilMat);
  });

  addFenceRail(group, 0, -HOUSE_SCALE * 0.64, HOUSE_SCALE * 1.78, HOUSE_SCALE * 0.045, fenceMat, 'front');
  addFenceRail(group, 0, HOUSE_SCALE * 0.64, HOUSE_SCALE * 1.78, HOUSE_SCALE * 0.045, fenceMat, 'back');
  addFenceRail(group, -HOUSE_SCALE * 0.92, 0, HOUSE_SCALE * 0.045, HOUSE_SCALE * 1.24, fenceMat, 'left');
  addFenceRail(group, HOUSE_SCALE * 0.92, 0, HOUSE_SCALE * 0.045, HOUSE_SCALE * 1.24, fenceMat, 'right');

  for (const child of group.children) {
    child.castShadow = false;
    child.receiveShadow = false;
  }

  return group;
}

function addTombstone(group, x, z, lean, material) {
  const stone = new THREE.Mesh(new THREE.BoxGeometry(HOUSE_SCALE * 0.13, HOUSE_SCALE * 0.25, HOUSE_SCALE * 0.045), material);
  stone.name = 'village-cemetery-leaning-tombstone-svg-style';
  stone.position.set(x, HOUSE_SCALE * 0.18, z);
  stone.rotation.z = lean;
  stone.renderOrder = 134;
  group.add(stone);

  const cap = new THREE.Mesh(new THREE.SphereGeometry(HOUSE_SCALE * 0.067, 10, 6), material);
  cap.name = 'village-cemetery-rounded-tombstone-cap';
  cap.position.set(x, HOUSE_SCALE * 0.31, z);
  cap.scale.y = 0.34;
  cap.rotation.z = lean;
  cap.renderOrder = 135;
  group.add(cap);
}

function addCemeteryCross(group, x, z, lean, material) {
  const vertical = new THREE.Mesh(new THREE.BoxGeometry(HOUSE_SCALE * 0.040, HOUSE_SCALE * 0.34, HOUSE_SCALE * 0.040), material);
  vertical.name = 'village-cemetery-leaning-cross-vertical';
  vertical.position.set(x, HOUSE_SCALE * 0.22, z);
  vertical.rotation.z = lean;
  vertical.renderOrder = 136;

  const horizontal = new THREE.Mesh(new THREE.BoxGeometry(HOUSE_SCALE * 0.18, HOUSE_SCALE * 0.038, HOUSE_SCALE * 0.038), material);
  horizontal.name = 'village-cemetery-leaning-cross-horizontal';
  horizontal.position.set(x, HOUSE_SCALE * 0.28, z);
  horizontal.rotation.z = lean;
  horizontal.renderOrder = 137;
  group.add(vertical, horizontal);
}

function addGraveSlab(group, x, z, material) {
  const slab = new THREE.Mesh(new THREE.BoxGeometry(HOUSE_SCALE * 0.18, HOUSE_SCALE * 0.030, HOUSE_SCALE * 0.25), material);
  slab.name = 'village-cemetery-grave-slab';
  slab.position.set(x, HOUSE_SCALE * 0.075, z);
  slab.rotation.y = (hashUnit(`${x}:${z}:slab-yaw`) - 0.5) * 0.18;
  slab.renderOrder = 129;
  group.add(slab);
}

function addFenceRail(group, x, z, width, depth, material, name) {
  const rail = new THREE.Mesh(new THREE.BoxGeometry(width, HOUSE_SCALE * 0.055, depth), material);
  rail.name = `village-cemetery-low-fence-${name}`;
  rail.position.set(x, HOUSE_SCALE * 0.13, z);
  rail.renderOrder = 132;
  group.add(rail);
}

function createChurchSideWindow(x, y, z, material, leftSide) {
  const window = new THREE.Mesh(new THREE.PlaneGeometry(HOUSE_SCALE * 0.20, HOUSE_SCALE * 0.40), material);
  window.name = 'village-church-side-window';
  window.position.set(x, y, z);
  window.rotation.y = leftSide ? -Math.PI / 2 : Math.PI / 2;
  return window;
}


function createHouseRoof(variant, width, depth, height, roofColor) {
  const roofMaterial = getRoofSvgMaterial(`house-roof-${roofColor}-${variant}`, roofColor, 'tile');

  if (variant === 1 || variant === 4) {
    const roof = new THREE.Group();
    roof.name = 'village-house-gabled-roof-no-floating-rectangle';
    roof.position.set(0, height, 0);
    roof.renderOrder = 122;

    const mainRoof = createGabledRoofMesh(width * 1.22, depth * 1.14, HOUSE_SCALE * 0.46, roofMaterial);
    mainRoof.name = 'village-house-gabled-roof-main';
    mainRoof.rotation.y = variant === 4 ? Math.PI / 2 : 0;
    mainRoof.position.y = HOUSE_SCALE * 0.02;

    const ridge = new THREE.Mesh(
      new THREE.BoxGeometry(HOUSE_SCALE * 0.09, HOUSE_SCALE * 0.075, depth * 1.18),
      roofMaterial
    );
    ridge.name = 'village-house-gabled-roof-ridge-cap';
    ridge.position.set(0, HOUSE_SCALE * 0.49, 0);
    ridge.rotation.y = variant === 4 ? Math.PI / 2 : 0;
    ridge.renderOrder = 123;

    const eaveFront = new THREE.Mesh(
      new THREE.BoxGeometry(width * 1.28, HOUSE_SCALE * 0.075, HOUSE_SCALE * 0.10),
      roofMaterial
    );
    eaveFront.name = 'village-house-gabled-roof-front-eave';
    eaveFront.position.set(0, HOUSE_SCALE * 0.07, -depth * 0.60);
    eaveFront.renderOrder = 123;

    const eaveBack = eaveFront.clone();
    eaveBack.name = 'village-house-gabled-roof-back-eave';
    eaveBack.position.z = depth * 0.60;

    if (variant === 4) {
      eaveFront.rotation.y = Math.PI / 2;
      eaveBack.rotation.y = Math.PI / 2;
      eaveFront.position.set(-width * 0.60, HOUSE_SCALE * 0.07, 0);
      eaveBack.position.set(width * 0.60, HOUSE_SCALE * 0.07, 0);
    }

    roof.add(mainRoof, ridge, eaveFront, eaveBack);
    return roof;
  }

  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(Math.max(width, depth) * 0.60, HOUSE_SCALE * (0.52 + variant * 0.035), 4),
    roofMaterial
  );
  roof.name = 'village-house-roof';
  roof.position.set(0, height + HOUSE_SCALE * 0.30, 0);
  roof.rotation.y = Math.PI / 4;
  roof.scale.z = depth / Math.max(width, 0.001);
  roof.renderOrder = 122;
  return roof;
}

function createGabledRoofMesh(width, depth, roofHeight, material) {
  const halfWidth = width * 0.5;
  const halfDepth = depth * 0.5;
  const vertices = new Float32Array([
    -halfWidth, 0, -halfDepth,
     halfWidth, 0, -halfDepth,
     0, roofHeight, -halfDepth,
    -halfWidth, 0, halfDepth,
     halfWidth, 0, halfDepth,
     0, roofHeight, halfDepth
  ]);
  const indices = [
    0, 3, 5, 0, 5, 2,
    1, 2, 5, 1, 5, 4,
    0, 2, 1,
    3, 4, 5,
    0, 1, 4, 0, 4, 3
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const roof = new THREE.Mesh(geometry, material);
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


function getGravelSvgMaterial(key, color) {
  if (houseMaterialCache.has(key)) return houseMaterialCache.get(key);

  const base = hexColor(color);
  const dark = shiftHexColor(color, -42);
  const light = shiftHexColor(color, 38);
  const svg = createGravelSvg(base, dark, light);
  const texture = new THREE.TextureLoader().load(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3.6, 3.2);
  texture.anisotropy = 4;
  texture.colorSpace = THREE.SRGBColorSpace;

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: THREE.DoubleSide
  });

  houseMaterialCache.set(key, material);
  return material;
}

function createGravelSvg(base, dark, light) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
    <rect width="96" height="96" fill="${base}"/>
    <circle cx="10" cy="14" r="3.2" fill="${light}" opacity=".72"/>
    <circle cx="28" cy="8" r="2.4" fill="${dark}" opacity=".62"/>
    <circle cx="44" cy="20" r="3.8" fill="${light}" opacity=".54"/>
    <circle cx="70" cy="12" r="2.8" fill="${dark}" opacity=".66"/>
    <circle cx="88" cy="26" r="3.2" fill="${light}" opacity=".48"/>
    <circle cx="16" cy="38" r="4.2" fill="${dark}" opacity=".45"/>
    <circle cx="38" cy="42" r="2.6" fill="${light}" opacity=".62"/>
    <circle cx="60" cy="36" r="3.4" fill="${dark}" opacity=".58"/>
    <circle cx="82" cy="50" r="2.4" fill="${light}" opacity=".58"/>
    <circle cx="8" cy="70" r="2.8" fill="${dark}" opacity=".66"/>
    <circle cx="30" cy="66" r="3.6" fill="${light}" opacity=".52"/>
    <circle cx="52" cy="76" r="4.0" fill="${dark}" opacity=".46"/>
    <circle cx="76" cy="72" r="3.0" fill="${light}" opacity=".60"/>
    <circle cx="92" cy="88" r="2.5" fill="${dark}" opacity=".62"/>
    <path d="M0 31H96M0 63H96" stroke="${dark}" stroke-width="1.2" opacity=".18"/>
  </svg>`;
}

function getRoofSvgMaterial(key, color, style = 'tile') {
  if (houseMaterialCache.has(key)) return houseMaterialCache.get(key);

  const base = hexColor(color);
  const dark = shiftHexColor(color, style === 'tile' ? -118 : -34);
  const light = shiftHexColor(color, style === 'tile' ? 82 : 28);
  const svg = style === 'slate'
    ? createSlateRoofSvg(base, dark, light)
    : createTileRoofSvg(base, dark, light);
  const texture = new THREE.TextureLoader().load(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(style === 'slate' ? 2.6 : 2.8, style === 'slate' ? 2.6 : 3.0);
  texture.anisotropy = 4;
  texture.colorSpace = THREE.SRGBColorSpace;

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: THREE.DoubleSide
  });

  houseMaterialCache.set(key, material);
  return material;
}

function createTileRoofSvg(base, dark, light) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
    <rect width="96" height="96" fill="${base}"/>
    <path d="M0 0H96V96H0Z" fill="${base}"/>
    <path d="M0 18H96M0 42H96M0 66H96M0 90H96" stroke="${dark}" stroke-width="7.2" opacity=".96"/>
    <path d="M0 28H96M0 52H96M0 76H96" stroke="${light}" stroke-width="3.4" opacity=".82"/>
    <path d="M16 0V18M48 0V18M80 0V18M0 18V42M32 18V42M64 18V42M96 18V42M16 42V66M48 42V66M80 42V66M0 66V90M32 66V90M64 66V90M96 66V90" stroke="${dark}" stroke-width="4.8" opacity=".92"/>
    <path d="M6 14H30M38 38H62M70 62H94M8 86H32" stroke="${light}" stroke-width="3.2" opacity=".78"/>
  </svg>`;
}

function createSlateRoofSvg(base, dark, light) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
    <rect width="96" height="96" fill="${base}"/>
    <path d="M0 16H96M0 32H96M0 48H96M0 64H96M0 80H96" stroke="${dark}" stroke-width="2.2" opacity=".58"/>
    <path d="M16 0V16M48 0V16M80 0V16M0 16V32M32 16V32M64 16V32M96 16V32M16 32V48M48 32V48M80 32V48M0 48V64M32 48V64M64 48V64M96 48V64M16 64V80M48 64V80M80 64V80M0 80V96M32 80V96M64 80V96M96 80V96" stroke="${dark}" stroke-width="1.8" opacity=".48"/>
    <path d="M4 14H28M36 30H60M68 46H92M4 62H28M36 78H60" stroke="${light}" stroke-width="1.2" opacity=".34"/>
  </svg>`;
}

function hexColor(color) {
  return `#${Math.max(0, color).toString(16).padStart(6, '0').slice(-6)}`;
}

function shiftHexColor(color, amount) {
  const r = Math.max(0, Math.min(255, ((color >> 16) & 255) + amount));
  const g = Math.max(0, Math.min(255, ((color >> 8) & 255) + amount));
  const b = Math.max(0, Math.min(255, (color & 255) + amount));
  return hexColor((r << 16) | (g << 8) | b);
}


function getWallSvgMaterial(key, color, style = 'plaster') {
  if (houseMaterialCache.has(key)) return houseMaterialCache.get(key);

  const base = hexColor(color);
  const dark = shiftHexColor(color, style === 'stoneDark' ? -34 : -42);
  const light = shiftHexColor(color, style === 'plaster' ? 48 : 32);
  const svg = style === 'plaster'
    ? createPlasterWallSvg(base, dark, light)
    : createStoneWallSvg(base, dark, light, style === 'stoneDark');
  const texture = new THREE.TextureLoader().load(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(style === 'plaster' ? 2.2 : 2.8, style === 'plaster' ? 1.8 : 2.4);
  texture.anisotropy = 4;
  texture.colorSpace = THREE.SRGBColorSpace;

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: THREE.DoubleSide
  });

  houseMaterialCache.set(key, material);
  return material;
}

function createPlasterWallSvg(base, dark, light) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
    <rect width="96" height="96" fill="${base}"/>
    <path d="M0 18C14 12 26 25 42 17S70 11 96 20M0 52C16 45 28 58 44 49S74 45 96 54M0 80C19 73 31 86 48 78S78 72 96 82" stroke="${dark}" stroke-width="2.6" opacity=".28" fill="none"/>
    <path d="M8 10h18M46 12h12M70 30h20M10 38h16M40 70h22M68 88h18" stroke="${light}" stroke-width="2.0" opacity=".42"/>
    <circle cx="20" cy="66" r="2.4" fill="${dark}" opacity=".20"/>
    <circle cx="54" cy="34" r="2.0" fill="${light}" opacity=".36"/>
    <circle cx="82" cy="62" r="2.8" fill="${dark}" opacity=".18"/>
  </svg>`;
}

function createStoneWallSvg(base, dark, light, darker = false) {
  const jointOpacity = darker ? '.42' : '.34';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
    <rect width="96" height="96" fill="${base}"/>
    <path d="M0 18H96M0 38H96M0 58H96M0 78H96" stroke="${dark}" stroke-width="2.2" opacity="${jointOpacity}"/>
    <path d="M18 0V18M52 0V18M82 0V18M0 18V38M32 18V38M66 18V38M16 38V58M50 38V58M84 38V58M0 58V78M34 58V78M68 58V78M18 78V96M52 78V96M86 78V96" stroke="${dark}" stroke-width="2.0" opacity="${jointOpacity}"/>
    <path d="M7 11h18M40 28h16M68 50h20M10 70h22M48 88h18" stroke="${light}" stroke-width="1.6" opacity=".34"/>
    <path d="M26 8h10M56 47h12M72 86h8" stroke="${dark}" stroke-width="1.4" opacity=".28"/>
  </svg>`;
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
