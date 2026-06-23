import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/utils/SkeletonUtils.js';
import {
  EDGE_ORDER,
  EDGE_TYPES,
  HEX_SIZE,
  TILE_VISUAL,
  SECTOR_DEFS,
  FIELD_BIRD_FLOCK_MODEL_URL,
  FIELD_BIRD_FLOCK_TARGET_WIDTH,
  FIELD_BIRD_FLOCK_ANIMATION_SPEED
} from './config.js';
import { hashUnit10k as hashUnit, hashNumber } from './stable/hashUtils.js';
import { axialToWorld, makeHexKey } from './stable/hex.js';
import { HEX_DIRECTIONS, getOppositeEdge } from './stable/placementRules.js';
import { applyGlobalWindToObject } from './stable/globalWind.js';
import { getEdgeType, getEdgeValue } from './tileGenerator.js';
import { getTerrainSurfaceY, placeObjectOnTerrain } from './terrainHeight.js';
import { collectVillageChurchSectors, collectVillageWatchtowerSectors } from './houseOverlay.js';
import { makeNodeKey, getTileEdgeType, clearGroup } from './stable/tileUtils.js';
import { collectZone } from './stable/zoneUtils.js';
import { HEX_CHUNK_SIZE, LOD_MICRO_CULL_DISTANCE, LOD_ROCK_CULL_DISTANCE, LOD_ROAD_DECOR_CULL_DISTANCE, LOD_SIGN_CULL_DISTANCE, LOD_SHORE_BOAT_CULL_DISTANCE, ROCK_DENSITY } from './variables.js';

const SECTOR_BY_KEY = Object.fromEntries(SECTOR_DEFS.map(sector => [sector.key, sector]));
const DIRECTION_BY_EDGE = Object.fromEntries(HEX_DIRECTIONS.map(direction => [direction.edge, direction]));

// Pré-alloués pour updateNaturalPropsLOD() — évite GC chaque frame
const _propLodFrustum = new THREE.Frustum();
const _propLodMatrix = new THREE.Matrix4();
const _propLodPos = new THREE.Vector3();

function getPropChunkKey(q, r) {
  return `${Math.floor(q / HEX_CHUNK_SIZE)}:${Math.floor(r / HEX_CHUNK_SIZE)}`;
}

function computePropBoundingSphere(matrices, heightPadding = 0.3) {
  const center = new THREE.Vector3();
  for (const m of matrices) {
    _propLodPos.setFromMatrixPosition(m);
    center.add(_propLodPos);
  }
  center.divideScalar(matrices.length);
  let radius = 0;
  for (const m of matrices) {
    _propLodPos.setFromMatrixPosition(m);
    radius = Math.max(radius, center.distanceTo(_propLodPos));
  }
  return new THREE.Sphere(center, radius + heightPadding);
}
const WATER_SURFACE_Y = (TILE_VISUAL.waterY ?? -0.075) + 0.012;
const FIELD_SURFACE_Y = 0.070;
const FIELD_FLAG_MIN_TOTAL = 5;
const FIELD_FLAG_TARGET_HEIGHT = HEX_SIZE * 0.32;
const BENCH_TARGET_LENGTH = HEX_SIZE * 0.16;
const SIGNPOST_TARGET_HEIGHT = HEX_SIZE * 0.28;
const SHORE_BOAT_TARGET_LENGTH = HEX_SIZE * 0.175;
const SPECIAL_BUILDING_SAFE_RADIUS = HEX_SIZE * 0.34;
const SPECIAL_BUILDING_BOAT_SAFE_RADIUS = HEX_SIZE * 0.18;
const NATURAL_FLOWER_TARGET_WIDTH = HEX_SIZE * 0.047;   // −15 % (était 0.055)
const NATURAL_ROCK_TARGET_LENGTH = HEX_SIZE * 0.106;    // −15 % (était 0.125)
const NATURAL_REED_TARGET_HEIGHT = HEX_SIZE * 0.105;
const NATURAL_MUSHROOM_TARGET_WIDTH = HEX_SIZE * 0.043; // −15 % (était 0.051)
const ROAD_DECOR_Y = ((TILE_VISUAL.tileThickness ?? 0.12) * -0.30) + 0.010;
const SHORE_BOAT_Y = WATER_SURFACE_Y + 0.012;
const PROP_MODEL_DEFS = [
  { key: 'field-flag', url: './glb/moulin.glb', target: FIELD_FLAG_TARGET_HEIGHT * 1.70, mode: 'height' },
  { key: 'road-bench', url: './glb/banc.glb', target: BENCH_TARGET_LENGTH, mode: 'length' },
  { key: 'road-signpost', url: './glb/poteau-indicateur.glb', target: SIGNPOST_TARGET_HEIGHT, mode: 'height' },
  { key: 'shore-boat-1', url: './glb/barque-1.glb', target: SHORE_BOAT_TARGET_LENGTH, mode: 'length' },
  { key: 'shore-boat-2', url: './glb/barque-2.glb', target: SHORE_BOAT_TARGET_LENGTH * 0.65, mode: 'length' },
  { key: 'flower-1', url: './glb/flower-1.glb', target: NATURAL_FLOWER_TARGET_WIDTH, mode: 'length', kind: 'flower' },
  { key: 'flower-2', url: './glb/flower-2.glb', target: NATURAL_FLOWER_TARGET_WIDTH, mode: 'length', kind: 'flower' },
  { key: 'flower-3', url: './glb/flower-3.glb', target: NATURAL_FLOWER_TARGET_WIDTH, mode: 'length', kind: 'flower' },
  { key: 'flower-4', url: './glb/flower-4.glb', target: NATURAL_FLOWER_TARGET_WIDTH, mode: 'length', kind: 'flower' },
  { key: 'rock-1', url: './glb/rock-1.glb', target: NATURAL_ROCK_TARGET_LENGTH, mode: 'length', kind: 'rock' },
  { key: 'rock-2', url: './glb/rock-2.glb', target: NATURAL_ROCK_TARGET_LENGTH, mode: 'length', kind: 'rock' },
  { key: 'rock-3', url: './glb/rock-3.glb', target: NATURAL_ROCK_TARGET_LENGTH, mode: 'length', kind: 'rock' },
  { key: 'rock-4', url: './glb/rock-4.glb', target: NATURAL_ROCK_TARGET_LENGTH, mode: 'length', kind: 'rock' },
  { key: 'reed', url: './glb/roseau.glb', target: NATURAL_REED_TARGET_HEIGHT, mode: 'height', kind: 'reed' },
  { key: 'mushroom', url: './glb/mushroom.glb', target: NATURAL_MUSHROOM_TARGET_WIDTH, mode: 'length', kind: 'mushroom' }
];

const NATURAL_DECOR_VARIANTS = {
  flower: ['flower-1', 'flower-2', 'flower-3', 'flower-4'],
  rock: ['rock-1', 'rock-2', 'rock-3', 'rock-4'],
  reed: ['reed'],
  mushroom: ['mushroom']
};

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

export function createFieldWaterEffectsOverlay() {
  const group = new THREE.Group();
  group.name = 'field-water-edge-effects-overlay';
  ensurePropModels(group);
  ensureBirdModel(group);
  return group;
}

export function rebuildFieldWaterEffectsOverlay(overlay, placedTiles) {
  overlay.userData.lastPlacedTiles = placedTiles;
  clearGroup(overlay);
  ensurePropModels(overlay);
  ensureBirdModel(overlay);
  const specialBuildingSafeZones = collectSpecialBuildingSafeZones(placedTiles);
  overlay.add(createWaterVoidSplashes(placedTiles));
  overlay.add(createFieldFlags(placedTiles));
  overlay.add(createNaturalGroundProps(placedTiles));
  overlay.add(createRoadsideVillageProps(placedTiles, specialBuildingSafeZones));
  overlay.add(createShoreBoats(placedTiles, specialBuildingSafeZones));

  // Construire la liste plate d'objets LOD pour bancs/panneaux/moulins/oiseaux.
  // Itère uniquement les enfants directs des deux sous-groupes — O(n) et pas de récursion inutile.
  overlay.userData.roadsideDecorObjects = [];
  const _decorDistSq     = LOD_ROAD_DECOR_CULL_DISTANCE * LOD_ROAD_DECOR_CULL_DISTANCE;
  const _signDistSq      = LOD_SIGN_CULL_DISTANCE        * LOD_SIGN_CULL_DISTANCE;
  const _shoreBoatDistSq = LOD_SHORE_BOAT_CULL_DISTANCE  * LOD_SHORE_BOAT_CULL_DISTANCE;
  for (const subGroup of overlay.children) {
    if (subGroup.name === 'field-zone-flags-and-crows') {
      for (const child of subGroup.children) {
        if (child.userData?.effectKind === 'field-flag-idle') {
          overlay.userData.roadsideDecorObjects.push({ object: child, center: child.position.clone(), lodDistSq: _decorDistSq });
        }
      }
    } else if (subGroup.name === 'village-roadside-glb-props') {
      for (const child of subGroup.children) {
        const n = child.name ?? '';
        if (n.includes('bench') || n.includes('signpost')) {
          // Les panneaux indicateurs ont un LOD plus sévère que les bancs
          const distSq = n.includes('signpost') ? _signDistSq : _decorDistSq;
          overlay.userData.roadsideDecorObjects.push({ object: child, center: child.position.clone(), lodDistSq: distSq });
        }
      }
    } else if (subGroup.name === 'water-shore-static-boats-glb') {
      // Barques échouées : petits objets statiques, disparaissent avant les gros décorations.
      for (const child of subGroup.children) {
        if (child.name === 'water-shore-inert-boat-glb') {
          overlay.userData.roadsideDecorObjects.push({ object: child, center: child.position.clone(), lodDistSq: _shoreBoatDistSq });
        }
      }
    }
  }
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

    if (data.effectKind === 'bird-flock-orbit') {
      if (data.mixer) {
        const previousAnimationTime = data.lastAnimationTime ?? elapsedSeconds;
        const delta = Math.min(0.05, Math.max(0, elapsedSeconds - previousAnimationTime));
        data.lastAnimationTime = elapsedSeconds;
        data.mixer.update(delta * (data.animationSpeed ?? 1));
      }

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
      const tangentX = -Math.sin(t) * localRx * dir;
      const tangentZ = Math.cos(t + wobbleC * 0.32) * localRz * dir;
      // Dans birds.glb, les becs pointent vers -Z.
      // On aligne donc l'axe local -Z du modèle sur la tangente réelle de l'orbite.
      // Important : la tangente tient compte de dir, sinon les groupes en sens inverse volent à reculons.
      object.rotation.y = Math.atan2(-tangentX, -tangentZ);
      object.rotation.z = Math.sin(t * data.bankSpeed + data.phase) * data.bankAmp * dir;
      object.rotation.x = Math.cos(t * 1.9 + data.phase * 1.4) * 0.08;
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

export function collectSpecialBuildingSafeZones(placedTiles) {
  const zones = [];
  const churchSectors = collectVillageChurchSectors(placedTiles);
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
      x: fieldZone.center.x,
      z: fieldZone.center.z,
      radius: SPECIAL_BUILDING_SAFE_RADIUS * 0.92,
      kind: 'mill'
    });
  }

  return zones;
}

function getVillageSpecialBuildingSafeZone(placedTiles, sectorKey, kind) {
  const separator = sectorKey.lastIndexOf(':');
  if (separator <= 0) return null;

  const tileKey = sectorKey.slice(0, separator);
  const edge = sectorKey.slice(separator + 1);
  const placedTile = placedTiles.get(tileKey);
  const sector = SECTOR_BY_KEY[edge];
  if (!placedTile || !sector) return null;

  const tilePos = axialToWorld(placedTile.q, placedTile.r);
  const a = getHexVertex(sector.a);
  const b = getHexVertex(sector.b);
  const local = kind === 'watchtower'
    ? trianglePoint(a, b, 0.18, 0.41, 0.41)
    : getChurchRewardLocalPoint(placedTile, edge, a, b);

  return {
    x: tilePos.x + local.x,
    z: tilePos.z + local.z,
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
  if (columnCount >= 4) {
    return [
      { centerWeight: 0.54, aWeight: 0.33, bWeight: 0.13 },
      { centerWeight: 0.54, aWeight: 0.13, bWeight: 0.33 },
      { centerWeight: 0.30, aWeight: 0.48, bWeight: 0.22 },
      { centerWeight: 0.30, aWeight: 0.22, bWeight: 0.48 }
    ];
  }
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

function isInsideSpecialBuildingSafeZone(pos, safeZones, fallbackRadius = SPECIAL_BUILDING_SAFE_RADIUS) {
  for (const zone of safeZones) {
    const radius = zone.radius ?? fallbackRadius;
    if (Math.hypot(pos.x - zone.x, pos.z - zone.z) < radius) return true;
  }
  return false;
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

  const flockCount = Math.min(3, 1 + Math.floor(zone.total / 8));
  for (let i = 0; i < flockCount; i += 1) {
    const flock = createBirdFlock(`${seed}:bird-flock:${i}`);
    if (!flock) continue;

    const heightMultiplier = 1.75 + hashUnit(`${seed}:birdheight:${i}`) * 1.65;
    const altitudeStagger = i * 0.42 + hashUnit(`${seed}:bird-altitude-stagger:${i}`) * 0.95;
    flock.userData = {
      ...flock.userData,
      effectKind: 'bird-flock-orbit',
      cx: 0,
      cy: (1.02 + i * 0.16) * heightMultiplier + altitudeStagger,
      cz: 0,
      rx: 0.42 + hashUnit(`${seed}:birdrx:${i}`) * 0.68,
      rz: 0.26 + hashUnit(`${seed}:birdrz:${i}`) * 0.54,
      speed: 0.28 + hashUnit(`${seed}:birdspeed:${i}`) * 0.72,
      direction: hashUnit(`${seed}:birddir:${i}`) > 0.5 ? 1 : -1,
      phase: hashUnit(`${seed}:birdphase:${i}`) * Math.PI * 2,
      verticalSpeed: 0.38 + hashUnit(`${seed}:birdvspeed:${i}`) * 1.20,
      verticalAmp: 0.08 + hashUnit(`${seed}:birdvamp:${i}`) * 0.28,
      bobAmp: 0.040 + hashUnit(`${seed}:birdbob:${i}`) * 0.115,
      wobbleSpeedA: 0.32 + hashUnit(`${seed}:birdwoba:${i}`) * 1.10,
      wobbleSpeedB: 0.30 + hashUnit(`${seed}:birdwobb:${i}`) * 1.20,
      wobbleSpeedC: 0.28 + hashUnit(`${seed}:birdwobc:${i}`) * 1.30,
      rxJitter: 0.08 + hashUnit(`${seed}:birdrxj:${i}`) * 0.16,
      rzJitter: 0.08 + hashUnit(`${seed}:birdrzj:${i}`) * 0.18,
      sideDrift: 0.018 + hashUnit(`${seed}:birdside:${i}`) * 0.060,
      bankSpeed: 1.8 + hashUnit(`${seed}:birdbank:${i}`) * 2.4,
      bankAmp: 0.16 + hashUnit(`${seed}:birdbankamp:${i}`) * 0.26
    };
    group.add(flock);
  }

  return group;
}


// Met à jour la visibilité de chaque InstancedMesh de props naturels selon frustum + LOD distance.
// À appeler depuis scene.js dans la boucle animate (tous les 3 frames suffisent).
export function updateNaturalPropsLOD(overlay, camera) {
  _propLodMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  _propLodFrustum.setFromProjectionMatrix(_propLodMatrix);

  overlay.traverse(obj => {
    if (!obj.isInstancedMesh || !obj.userData.worldBoundingSphere) return;
    const sphere = obj.userData.worldBoundingSphere;
    const inFrustum = _propLodFrustum.intersectsSphere(sphere);
    const dist = camera.position.distanceTo(sphere.center);
    const cat = obj.userData.lodCategory;
    const withinDist = cat === 'micro'   ? dist < LOD_MICRO_CULL_DISTANCE
                     : cat === 'rock'    ? dist < LOD_ROCK_CULL_DISTANCE
                     : true;
    obj.visible = inFrustum && withinDist;
  });
}

export function updateFieldDecorLOD(overlay, camera) {
  for (const item of (overlay.userData.roadsideDecorObjects ?? [])) {
    item.object.visible = camera.position.distanceToSquared(item.center) < item.lodDistSq;
  }
}

function createNaturalGroundProps(placedTiles) {
  const group = new THREE.Group();
  group.name = 'natural-grass-forest-glb-props';

  // Phase 1 : collecter les instances pour les props haute-fréquence (flower, reed, mushroom)
  // Les rochers gardent le chemin clone (variantes de taille côtière, peu nombreux)
  const accumulator = new Map(); // variantKey → Matrix4[]

  for (const placedTile of placedTiles.values()) {
    for (const edge of EDGE_ORDER) {
      const type = getTileEdgeType(placedTile, edge);
      if (!isSafePropGroundType(type)) continue;

      collectNaturalPropInstances(accumulator, placedTile, edge, type, 'flower', placedTiles);
      collectNaturalPropInstances(accumulator, placedTile, edge, type, 'rock', placedTiles);
      collectNaturalPropInstances(accumulator, placedTile, edge, type, 'reed', placedTiles);
      collectNaturalPropInstances(accumulator, placedTile, edge, type, 'mushroom', placedTiles);
    }
  }

  // Phase 2 : construire les InstancedMesh pour flower/reed/mushroom
  buildNaturalPropInstancedMeshes(group, accumulator);

  return group;
}

function addNaturalPropCluster(group, placedTile, edge, type, kind, placedTiles) {
  const seed = `${placedTile.key}:natural:${kind}:${edge}`;
  const chance = getNaturalPropChance(kind, type, placedTile, edge, placedTiles);
  if (hashUnit(seed) > chance) return;

  const count = getNaturalPropCount(kind, type, seed, placedTile, edge, placedTiles);
  const centerLocal = getNaturalSectorPoint(edge, `${seed}:cluster-center`);
  const clusterRadius = getNaturalClusterRadius(kind);

  for (let i = 0; i < count; i += 1) {
    const local = getNaturalClusterPoint(edge, centerLocal, `${seed}:point:${i}`, clusterRadius);
    const footprintRadius = getNaturalPropFootprint(kind);
    if (!isSingleTerrainFootprint(local, placedTile, type, footprintRadius)) continue;

    const key = pickNaturalPropVariant(kind, `${seed}:variant:${i}`);
    const prop = createPropModel(key, `${seed}:model:${i}`);
    if (!prop) continue;const tilePos = axialToWorld(placedTile.q, placedTile.r);
    prop.name = `${type}-${kind}-ambient-glb`;
    prop.position.set(tilePos.x + local.x, 0, tilePos.z + local.z);
    const yaw = hashUnit(`${seed}:yaw:${i}`) * Math.PI * 2;
    const groundOffset = kind === 'flower' ? 0.006 : (kind === 'reed' ? 0.010 : (kind === 'mushroom' ? 0.004 : 0.000));
    const surfaceY = placeObjectOnTerrain(prop, local, type, hashNumber(`${seed}:terrain:${i}`) % 97, {
      groundOffset,
      alignToSlope: kind !== 'reed',
      yaw,
      edgeLockStart: 0.98,
      edgeLockEnd: 1.0,
      normalSampleStep: HEX_SIZE * 0.012
    }) - groundOffset;

    const jitter = getNaturalPropScaleJitter(kind, seed, i);
    prop.scale.multiplyScalar(jitter);
    if (kind === 'rock' && isNearWaterDecorArea(placedTile, edge, placedTiles)) {
      prop.scale.multiplyScalar(1.22 + hashUnit(`${seed}:shore-rock-scale:${i}`) * 0.36);
    }
    if (kind === 'reed') {
      prop.rotation.x += (hashUnit(`${seed}:leanx:${i}`) - 0.5) * 0.10;
      prop.rotation.z += (hashUnit(`${seed}:leanz:${i}`) - 0.5) * 0.10;
    }
    if (kind === 'mushroom') {
      prop.rotation.x += (hashUnit(`${seed}:mushleanx:${i}`) - 0.5) * 0.035;
      prop.rotation.z += (hashUnit(`${seed}:mushleanz:${i}`) - 0.5) * 0.035;
    }

    // Dernière sécurité après scale + rotations/lean : certains petits GLB ont un pivot
    // ou une base imparfaite. On cale la boîte réelle sur la surface calculée, dans les
    // deux sens : ni enfoui, ni flottant au-dessus du relief.
    snapPropBottomToSurface(prop, surfaceY, getNaturalPropGroundClearance(kind));
    group.add(prop);
  }
}

// Collecte les matrices d'instance pour flower/reed/mushroom (sans clone).
// La scale de base est cuite dans la géo du prototype via buildNaturalPropInstancedMeshes.
function collectNaturalPropInstances(accumulator, placedTile, edge, type, kind, placedTiles) {
  const seed = `${placedTile.key}:natural:${kind}:${edge}`;
  const chance = getNaturalPropChance(kind, type, placedTile, edge, placedTiles);
  if (hashUnit(seed) > chance) return;

  const count = getNaturalPropCount(kind, type, seed, placedTile, edge, placedTiles);
  const centerLocal = getNaturalSectorPoint(edge, `${seed}:cluster-center`);
  const clusterRadius = getNaturalClusterRadius(kind);
  const tilePos = axialToWorld(placedTile.q, placedTile.r);

  for (let i = 0; i < count; i += 1) {
    const local = getNaturalClusterPoint(edge, centerLocal, `${seed}:point:${i}`, clusterRadius);
    const footprintRadius = getNaturalPropFootprint(kind);
    if (!isSingleTerrainFootprint(local, placedTile, type, footprintRadius)) continue;

    const variantKey = pickNaturalPropVariant(kind, `${seed}:variant:${i}`);
    if (!variantKey || !propGlbLibrary.has(variantKey)) continue;

    const yaw = hashUnit(`${seed}:yaw:${i}`) * Math.PI * 2;
    const groundOffset = kind === 'flower' ? 0.006 : (kind === 'reed' ? 0.010 : (kind === 'mushroom' ? 0.004 : 0.000));

    // Réinitialiser la rotation pour éviter les accumulations entre itérations
    _propInstanceDummy.rotation.set(0, 0, 0);
    _propInstanceDummy.position.set(tilePos.x + local.x, 0, tilePos.z + local.z);
    placeObjectOnTerrain(_propInstanceDummy, local, type, hashNumber(`${seed}:terrain:${i}`) % 97, {
      groundOffset,
      alignToSlope: kind !== 'reed',
      yaw,
      edgeLockStart: 0.98,
      edgeLockEnd: 1.0,
      normalSampleStep: HEX_SIZE * 0.012
    });
    // Lean appliqué après placeObjectOnTerrain (même logique que le chemin clone)
    if (kind === 'reed') {
      _propInstanceDummy.rotation.x += (hashUnit(`${seed}:leanx:${i}`) - 0.5) * 0.10;
      _propInstanceDummy.rotation.z += (hashUnit(`${seed}:leanz:${i}`) - 0.5) * 0.10;
    }
    if (kind === 'mushroom') {
      _propInstanceDummy.rotation.x += (hashUnit(`${seed}:mushleanx:${i}`) - 0.5) * 0.035;
      _propInstanceDummy.rotation.z += (hashUnit(`${seed}:mushleanz:${i}`) - 0.5) * 0.035;
    }

    let jitter = getNaturalPropScaleJitter(kind, seed, i);
    // Rochers côtiers : plus gros (parité avec l'ancien chemin clone)
    if (kind === 'rock' && isNearWaterDecorArea(placedTile, edge, placedTiles)) {
      jitter *= 1.22 + hashUnit(`${seed}:shore-rock-scale:${i}`) * 0.36;
    }
    // Scale de base cuite dans la géo : on applique seulement le jitter dans la matrice d'instance
    _propInstanceDummy.scale.setScalar(jitter);
    _propInstanceDummy.updateMatrix();

    if (!accumulator.has(variantKey)) accumulator.set(variantKey, new Map());
    const byChunk = accumulator.get(variantKey);
    const chunkKey = getPropChunkKey(placedTile.q, placedTile.r);
    if (!byChunk.has(chunkKey)) byChunk.set(chunkKey, []);
    byChunk.get(chunkKey).push(_propInstanceDummy.matrix.clone());
  }
}

// Construit un InstancedMesh par (chunk × sous-mesh) de chaque variant de prop.
// Chaque mesh reçoit une bounding sphere réelle pour le LOD culling dans updateNaturalPropsLOD().
function buildNaturalPropInstancedMeshes(group, accumulator) {
  for (const [variantKey, byChunk] of accumulator) {
    const prototype = propGlbLibrary.get(variantKey);
    if (!prototype) continue;

    // 'micro' : fleurs, roseaux, champignons — cachés au-delà de LOD_MICRO_CULL_DISTANCE
    // 'rock'  : rochers — cachés au-delà de LOD_ROCK_CULL_DISTANCE (22 u, entre micro et arbres)
    const lodCategory = variantKey.startsWith('rock') ? 'rock' : 'micro';

    prototype.updateMatrixWorld(true);

    for (const [chunkKey, matrices] of byChunk) {
      if (matrices.length === 0) continue;
      const sphere = computePropBoundingSphere(matrices, 0.25);

      prototype.traverse(child => {
        if (!child.isMesh) return;
        child.updateWorldMatrix(true, false);

        const geo = child.geometry.clone();
        geo.applyMatrix4(child.matrixWorld);

        const mat = Array.isArray(child.material)
          ? child.material.map(m => m.clone())
          : child.material.clone();

        const mesh = new THREE.InstancedMesh(geo, mat, matrices.length);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        // frustumCulled = false : géo cuite à l'origine. Culling manuel via updateNaturalPropsLOD().
        mesh.frustumCulled = false;
        mesh.name = `instanced-prop-${variantKey}-${chunkKey}`;
        mesh.userData.worldBoundingSphere = sphere;
        mesh.userData.lodCategory = lodCategory;

        for (let i = 0; i < matrices.length; i++) {
          mesh.setMatrixAt(i, matrices[i]);
        }
        mesh.instanceMatrix.needsUpdate = true;
        group.add(mesh);
      });
    }
  }
}

function getNaturalPropChance(kind, type, placedTile, edge, placedTiles) {
  const nearWater = placedTile && edge && placedTiles && isNearWaterDecorArea(placedTile, edge, placedTiles);
  if (kind === 'flower') return type === EDGE_TYPES.grass ? 1.0 : 0.96;   // ×2 (était 0.92/0.48)
  if (kind === 'rock') return nearWater ? ROCK_DENSITY.chanceNearWater : (type === EDGE_TYPES.grass ? ROCK_DENSITY.chanceGrass : ROCK_DENSITY.chanceForest);
  if (kind === 'reed') return nearWater ? 1.0 : (type === EDGE_TYPES.grass ? 0.12 : 0.08);
  if (kind === 'mushroom') return type === EDGE_TYPES.forest ? 1.0 : 0.51; // ×1.5 (était 0.70/0.34)
  return 0;
}

function getNaturalPropCount(kind, type, seed, placedTile = null, edge = null, placedTiles = null) {
  const nearWater = placedTile && edge && placedTiles && isNearWaterDecorArea(placedTile, edge, placedTiles);
  if (kind === 'flower') {
    if (type === EDGE_TYPES.grass) {
      return 20 + Math.floor(hashUnit(`${seed}:count`) * 20); // −10 % : nappes de 20 à 39 sur prairie (était 22–43)
    }
    return 5 + Math.floor(hashUnit(`${seed}:count`) * 7); // −10 % : bouquets de 5 à 11 hors prairie (était 6–13)
  }
  if (kind === 'rock') {
    // +20 % : 2–5 près de l'eau et en prairie, 1–4 en forêt (était 2–4 / 1–3).
    if (nearWater || type === EDGE_TYPES.grass) return 2 + Math.floor(hashUnit(`${seed}:count`) * 4);
    return 1 + Math.floor(hashUnit(`${seed}:count`) * 4);
  }
  if (kind === 'reed') {
    return nearWater
      ? 9 + Math.floor(hashUnit(`${seed}:count`) * 8)   // ×1.8 : 9–16 au bord de l'eau (était 5–9)
      : 4 + Math.floor(hashUnit(`${seed}:count`) * 5);  // 4–8 hors eau
  }
  if (kind === 'mushroom') {
    return 6 + Math.floor(hashUnit(`${seed}:count`) * 8); // ×1.5 : grappes de 6 à 13 (était 4–9)
  }
  return 1;
}

function getNaturalPropFootprint(kind) {
  if (kind === 'flower') return HEX_SIZE * 0.036; // espacement inter-fleur (était 0.030)
  if (kind === 'rock') return HEX_SIZE * ROCK_DENSITY.footprint;
  if (kind === 'mushroom') return HEX_SIZE * 0.024;
  if (kind === 'reed') return HEX_SIZE * 0.026;
  return HEX_SIZE * 0.042;
}

function getNaturalPropGroundClearance(kind) {
  if (kind === 'flower') return 0.007;
  if (kind === 'reed') return 0.012;
  if (kind === 'mushroom') return 0.006;
  if (kind === 'rock') return 0.0015;
  return 0.003;
}

function snapPropBottomToSurface(object, surfaceY, clearance = 0.004) {
  if (!object || !Number.isFinite(surfaceY)) return;

  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  if (!Number.isFinite(box.min.y)) return;

  const targetBottomY = surfaceY + clearance;
  const deltaY = targetBottomY - box.min.y;
  if (Math.abs(deltaY) > 0.0005) {
    object.position.y += deltaY;
    object.updateMatrixWorld(true);
  }
}

function getNaturalPropScaleJitter(kind, seed, index) {
  const roll = hashUnit(`${seed}:scale:${index}`);
  if (kind === 'flower') return 0.66 + roll * 0.62;
  if (kind === 'rock') {
    // ~15 % de gros rochers jusqu'à 250 % de la taille standard (hash séparé pour indépendance).
    const bigRoll = hashUnit(`${seed}:bigrock:${index}`);
    if (bigRoll > ROCK_DENSITY.bigRockThreshold) {
      return ROCK_DENSITY.bigRockScaleMin + roll * ROCK_DENSITY.bigRockScaleRange; // [1.50, 2.50]
    }
    return ROCK_DENSITY.normalScaleMin + roll * ROCK_DENSITY.normalScaleRange; // [0.76, 1.20]
  }
  if (kind === 'mushroom') return 0.72 + roll * 0.58;
  return 0.86 + roll * 0.26;
}

function getNaturalClusterRadius(kind) {
  if (kind === 'flower') return HEX_SIZE * 0.54;   // nappe plus dispersée (était 0.46)
  if (kind === 'mushroom') return HEX_SIZE * 0.095;
  if (kind === 'reed') return HEX_SIZE * 0.16;     // ×1.4 : roseaux plus dispersés (était 0.115)
  return HEX_SIZE * 0.150;
}

function pickNaturalPropVariant(kind, seed) {
  const variants = NATURAL_DECOR_VARIANTS[kind] ?? [];
  if (variants.length === 0) return null;
  return variants[Math.floor(hashUnit(seed) * variants.length) % variants.length];
}

function getNaturalSectorPoint(edge, seed) {
  const sector = SECTOR_BY_KEY[edge];
  const a = getHexVertex(sector.a);
  const b = getHexVertex(sector.b);
  const edgeBias = 0.46 + hashUnit(`${seed}:edge-bias`) * 0.34;
  const side = (hashUnit(`${seed}:side`) - 0.5) * 0.42;

  const mid = { x: (a.x + b.x) * 0.5, z: (a.z + b.z) * 0.5 };
  const tangent = normalize2(b.x - a.x, b.z - a.z);
  return {
    x: mid.x * edgeBias + tangent.x * side * HEX_SIZE,
    z: mid.z * edgeBias + tangent.z * side * HEX_SIZE
  };
}

function getNaturalClusterPoint(edge, center, seed, radius) {
  if (!radius || radius <= 0) return center;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const angle = hashUnit(`${seed}:cluster-angle:${attempt}`) * Math.PI * 2;
    const distance = Math.sqrt(hashUnit(`${seed}:cluster-distance:${attempt}`)) * radius;
    const local = {
      x: center.x + Math.cos(angle) * distance,
      z: center.z + Math.sin(angle) * distance
    };

    const resolvedEdge = getEdgeFromLocalPoint(local);
    if (resolvedEdge === edge) return local;
  }

  return center;
}

function isNearWaterDecorArea(placedTile, edge, placedTiles) {
  if (isShoreDecorEdge(placedTile, edge, placedTiles)) return true;

  for (const candidateEdge of EDGE_ORDER) {
    if (getTileEdgeType(placedTile, candidateEdge) === EDGE_TYPES.water) return true;

    const direction = DIRECTION_BY_EDGE[candidateEdge];
    const neighbor = placedTiles.get(makeHexKey(placedTile.q + direction.q, placedTile.r + direction.r));
    if (!neighbor) continue;
    if (getTileEdgeType(neighbor, getOppositeEdge(candidateEdge)) === EDGE_TYPES.water) return true;
    if ((neighbor.tile.center ?? null) === EDGE_TYPES.water) return true;
    if (EDGE_ORDER.some(neighborEdge => getTileEdgeType(neighbor, neighborEdge) === EDGE_TYPES.water)) return true;
  }

  return false;
}

function createRoadsideVillageProps(placedTiles, specialBuildingSafeZones = []) {
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
      if (isInsideSpecialBuildingSafeZone(pos, specialBuildingSafeZones)) continue;

      const bench = createPropModel('road-bench', seed);
      if (!bench) continue;
      bench.name = edgeType === EDGE_TYPES.forest ? 'forest-pathside-bench-glb' : 'grass-roadside-bench-glb';
      bench.position.copy(pos);
      const benchYaw = getEdgeOutwardAngle(edge) + Math.PI / 2 + (hashUnit(`${seed}:yaw`) - 0.5) * 0.55;
      const benchTopY = placeObjectOnTerrain(bench, getTileLocalPoint(pos, placedTile), edgeType, hashNumber(seed) % 97, {
        groundOffset: 0.012,
        alignToSlope: false,
        yaw: benchYaw,
        edgeLockStart: 0.98,
        edgeLockEnd: 1.0
      });
      if (benchTopY !== null) snapPropBottomToSurface(bench, benchTopY - 0.012, 0.004);
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
      if (isInsideSpecialBuildingSafeZone(pos, specialBuildingSafeZones)) continue;

      const sign = createPropModel('road-signpost', seed);
      if (!sign) continue;
      sign.name = edgeType === EDGE_TYPES.forest ? 'forest-path-signpost-glb' : 'grass-road-signpost-glb';
      sign.position.copy(pos);
      const signYaw = getEdgeOutwardAngle(edge) + (hashUnit(`${seed}:yaw`) - 0.5) * 0.65;
      const signTopY = placeObjectOnTerrain(sign, getTileLocalPoint(pos, placedTile), edgeType, hashNumber(seed) % 97, {
        groundOffset: 0.006,
        alignToSlope: false,
        yaw: signYaw,
        edgeLockStart: 0.98,
        edgeLockEnd: 1.0
      });
      if (signTopY !== null) snapPropBottomToSurface(sign, signTopY - 0.006, 0.003);
      group.add(sign);
    }

    for (const edge of EDGE_ORDER) {
      if (!isShoreDecorEdge(placedTile, edge, placedTiles)) continue;
      const edgeType = getTileEdgeType(placedTile, edge);
      const seed = `${placedTile.key}:shore-signpost:${edge}`;
      if (hashUnit(seed) > 0.58) continue;

      const center = getSectorWorldCenter(placedTile, edge);
      const pos = new THREE.Vector3(center.x, ROAD_DECOR_Y, center.z).lerp(tileCenter, 0.24);
      nudgeRoadsideProp(pos, placedTile, edge, seed, 0.038);
      if (!snapPropToSafeSurface(pos, placedTile, edge, seed)) continue;
      if (isInsideSpecialBuildingSafeZone(pos, specialBuildingSafeZones)) continue;

      const sign = createPropModel('road-signpost', seed);
      if (!sign) continue;
      sign.name = 'shoreline-signpost-glb';
      sign.position.copy(pos);
      const shoreSignYaw = getEdgeOutwardAngle(edge) + (hashUnit(`${seed}:yaw`) - 0.5) * 0.80;
      const shoreSignTopY = placeObjectOnTerrain(sign, getTileLocalPoint(pos, placedTile), edgeType, hashNumber(seed) % 97, {
        groundOffset: 0.006,
        alignToSlope: false,
        yaw: shoreSignYaw,
        edgeLockStart: 0.98,
        edgeLockEnd: 1.0
      });
      if (shoreSignTopY !== null) snapPropBottomToSurface(sign, shoreSignTopY - 0.006, 0.003);
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

function createShoreBoats(placedTiles, specialBuildingSafeZones = []) {
  const group = new THREE.Group();
  group.name = 'water-shore-static-boats-glb';

  for (const placedTile of placedTiles.values()) {
    const tilePos = axialToWorld(placedTile.q, placedTile.r);
    for (const edge of EDGE_ORDER) {
      if (!isShoreBoatEligibleBeachEdge(placedTile, edge, placedTiles)) continue;

      const seed = `${placedTile.key}:shore-boat:${edge}`;
      if (hashUnit(seed) > 0.72) continue;

      const sector = SECTOR_BY_KEY[edge];
      const a = getHexVertex(sector.a);
      const b = getHexVertex(sector.b);
      const mid = new THREE.Vector3((a.x + b.x) / 2, SHORE_BOAT_Y, (a.z + b.z) / 2);
      const inward = getShoreBoatBeachDirection(placedTile, edge, placedTiles, mid);

      const boat = createPropModel(pickShoreBoatVariant(seed), seed);
      if (!boat) continue;
      boat.name = 'water-shore-inert-boat-glb';
      boat.position.set(tilePos.x + mid.x + inward.x * HEX_SIZE * 0.5, SHORE_BOAT_Y, tilePos.z + mid.z + inward.z * HEX_SIZE * 0.5);
      if (isInsideSpecialBuildingSafeZone(boat.position, specialBuildingSafeZones, SPECIAL_BUILDING_BOAT_SAFE_RADIUS)) continue;
      boat.rotation.y = Math.atan2(inward.x, inward.z) + Math.PI / 2 + (hashUnit(`${seed}:yaw`) - 0.5) * 0.50;
      boat.scale.multiplyScalar(0.92 + hashUnit(`${seed}:scale`) * 0.18);
      group.add(boat);
    }
  }

  return group;
}

function isShoreBoatEligibleBeachEdge(placedTile, edge, placedTiles) {
  if (getTileEdgeType(placedTile, edge) !== EDGE_TYPES.water) return false;

  const direction = DIRECTION_BY_EDGE[edge];
  const neighbor = placedTiles.get(makeHexKey(placedTile.q + direction.q, placedTile.r + direction.r));
  const oppositeType = neighbor ? getTileEdgeType(neighbor, getOppositeEdge(edge)) : null;

  // Jamais sur une frontière eau -> vide : il faut soit une vraie terre en face,
  // soit une plage interne de tuile mixte eau/terre juste à côté du secteur eau.
  if (neighbor && oppositeType !== EDGE_TYPES.water && oppositeType !== EDGE_TYPES.rail) return true;

  return hasLandEdgeAdjacentToEdge(placedTile, edge);
}

function hasLandEdgeAdjacentToEdge(placedTile, edge) {
  const index = EDGE_ORDER.indexOf(edge);
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
  const neighbor = placedTiles.get(makeHexKey(placedTile.q + direction.q, placedTile.r + direction.r));
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
  const index = EDGE_ORDER.indexOf(edge);
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



const birdGlbLibrary = {
  prototype: null,
  animations: [],
  loading: false,
  requested: false
};

function ensureBirdModel(overlay) {
  if (birdGlbLibrary.loading || birdGlbLibrary.requested) return;
  birdGlbLibrary.loading = true;
  birdGlbLibrary.requested = true;

  new GLTFLoader().load(
    FIELD_BIRD_FLOCK_MODEL_URL,
    gltf => {
      birdGlbLibrary.prototype = prepareBirdPrototype(gltf.scene);
      birdGlbLibrary.animations = gltf.animations ?? [];
      birdGlbLibrary.loading = false;

      maybeRebuildWhenReady(overlay);
    },
    undefined,
    error => {
      birdGlbLibrary.loading = false;
      console.warn(`Modèle oiseaux GLB indisponible : ${FIELD_BIRD_FLOCK_MODEL_URL}`, error);
      maybeRebuildWhenReady(overlay); // rebuild sans oiseaux si le modèle échoue
    }
  );
}

function prepareBirdPrototype(model) {
  const wrapper = new THREE.Group();
  wrapper.name = 'normalized-field-bird-flock-glb';

  const source = cloneSkeleton(model);
  const box = new THREE.Box3().setFromObject(source);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  source.position.set(-center.x, -center.y, -center.z);
  const dimension = Math.max(size.x, size.z) || 1;
  wrapper.scale.setScalar(FIELD_BIRD_FLOCK_TARGET_WIDTH / dimension);
  wrapper.add(source);

  wrapper.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow = false;
    object.receiveShadow = false;
    if (object.material) object.material = clonePropMaterial(object.material);
  });

  return wrapper;
}

function createBirdFlock(seedKey) {
  if (!birdGlbLibrary.prototype) return null;

  const object = cloneSkeleton(birdGlbLibrary.prototype);
  object.name = 'field-birds-glb-animated-flock';
  object.rotation.y += (hashUnit(`${seedKey}:base-yaw`) - 0.5) * 0.35;
  object.scale.multiplyScalar(0.92 + hashUnit(`${seedKey}:scale`) * 0.22);

  const mixer = birdGlbLibrary.animations.length > 0 ? new THREE.AnimationMixer(object) : null;
  if (mixer) {
    for (const clip of birdGlbLibrary.animations) {
      const action = mixer.clipAction(clip);
      action.play();
    }
  }

  object.userData = {
    mixer,
    animationSpeed: FIELD_BIRD_FLOCK_ANIMATION_SPEED * (0.88 + hashUnit(`${seedKey}:anim`) * 0.24),
    lastAnimationTime: null
  };

  return object;
}


const propGlbLibrary = new Map();
let propModelsLoading = false;
let propModelsRequested = false;

// Dummy réutilisé pour calculer les matrices d'instance sans allocation par prop
const _propInstanceDummy = new THREE.Object3D();

// Un seul rebuild : attend que props ET oiseaux soient tous chargés.
// Sans cette garde, l'oiseau déclenche un 2e clearGroup qui efface les InstancedMesh du 1er rebuild.
function maybeRebuildWhenReady(overlay) {
  if (propModelsLoading) return;          // props encore en cours
  if (birdGlbLibrary.loading) return;     // oiseau encore en cours
  const lastPlacedTiles = overlay.userData.lastPlacedTiles;
  if (lastPlacedTiles) rebuildFieldWaterEffectsOverlay(overlay, lastPlacedTiles);
}

function ensurePropModels(overlay) {
  if (propModelsLoading || propModelsRequested) return;
  propModelsLoading = true;
  propModelsRequested = true;

  let pending = PROP_MODEL_DEFS.length;
  const finishOne = () => {
    pending -= 1;
    if (pending > 0) return;

    propModelsLoading = false;
    maybeRebuildWhenReady(overlay);
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


function pickShoreBoatVariant(seedKey) {
  return hashUnit(`${seedKey}:shore-boat-variant`) < 0.5 ? 'shore-boat-1' : 'shore-boat-2';
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

