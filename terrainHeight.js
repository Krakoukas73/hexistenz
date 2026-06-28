import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import {
  EDGE_TYPES,
  EDGE_ORDER,
  SECTOR_DEFS,
  HEX_SIZE,
  TILE_VISUAL,
  TERRAIN_RELIEF,
  RAGGED_EDGE
} from './config.js';
import { createOuterVertices } from './hexGeometry.js';
import { hashRaggedInnerEdge, hashRaggedEdge, hash01 } from './raggedEdge.js';

export const RAIL_SURFACE_Y = TILE_VISUAL.railSurfaceY ?? TILE_VISUAL.waterY ?? -0.075;
export const RAIL_OVERLAY_LIFT = HEX_SIZE * 0.026;
export const TRAIN_OVERLAY_LIFT = HEX_SIZE * 0.070;

export function getBiomeLocalTopY(type) {
  // Surface plate : toutes les tuiles ont leur dessus au niveau local 0.
  // Le décalage monde est porté par getBiomeSurfaceOffsetY.
  return 0;
}

export function getBiomeSurfaceOffsetY(type) {
  // Synchronisé avec tileMesh.js::getBiomeSurfaceY — doit rester identique.
  // Eau et rail : niveaux propres à leur rendu.
  if (type === EDGE_TYPES.water || type === 'water') {
    return TILE_VISUAL.waterThickness ?? (TILE_VISUAL.tileThickness ?? 0.12) * 0.5; // fond à y=0, dessus à +0.06
  }
  if (type === EDGE_TYPES.rail || type === 'rail') return RAIL_SURFACE_Y;
  // Terre : fond ancré à y=0, dessus = depth par biome (sync getSectorDepth dans tileMesh.js).
  // Les 3 mm d'écart assurent l'anti Z-fight aux jonctions.
  const base = TILE_VISUAL.tileThickness ?? 0.12;
  if (type === EDGE_TYPES.field  || type === 'field')  return base * 0.783; // ≈ 0.094
  if (type === EDGE_TYPES.grass  || type === 'grass')  return base * 0.683; // ≈ 0.082
  if (type === EDGE_TYPES.house  || type === 'house')  return base * 0.708; // ≈ 0.085
  if (type === EDGE_TYPES.forest || type === 'forest') return base * 0.733; // ≈ 0.088
  return base; // fallback
}

export function getTerrainLocalTopY(point, type = EDGE_TYPES.grass ?? 'grass', salt = 0) {
  const baseY = getBiomeLocalTopY(type);
  if (!TERRAIN_RELIEF?.enabled) return baseY;

  const amplitude = TERRAIN_RELIEF.typeAmplitude?.[type] ?? TERRAIN_RELIEF.baseAmplitude ?? 0.04;
  const radius = Math.hypot(point.x, point.z) / Math.max(HEX_SIZE, 0.001);
  const edgeFadeStart = TERRAIN_RELIEF.edgeFadeStart ?? 0.30;
  const edgeFade = THREE.MathUtils.clamp((radius - edgeFadeStart) / (1 - edgeFadeStart), 0, 1);
  const centerFade = 0.72 + edgeFade * 0.28;
  const waveA = Math.sin(point.x * 3.10 + point.z * 1.85 + salt * 0.71);
  const waveB = Math.cos(point.x * -2.45 + point.z * 4.15 + salt * 1.13);
  const waveC = Math.sin((point.x + point.z) * 5.20 + salt * 0.37);
  const grain = (hash01(hashTerrainPoint(point, type, salt)) - 0.5) * 2;
  const relief = (waveA * 0.42 + waveB * 0.28 + waveC * 0.18 + grain * 0.12) * amplitude * centerFade;

  if (type === EDGE_TYPES.water || type === 'water') return baseY + relief * 0.35;
  return baseY + relief;
}


function getTerrainMeshLocalTopY(point, type = EDGE_TYPES.grass ?? 'grass', salt = 0) {
  if (!point) return getTerrainLocalTopY(point, type, salt);
  if (type === EDGE_TYPES.rail || type === 'rail') return getBiomeLocalTopY(type);

  const radius = Math.hypot(point.x, point.z);
  const centerRadius = HEX_SIZE * (TILE_VISUAL.centerRadiusScale ?? 0.33);

  if (radius <= centerRadius + 0.0005) {
    return interpolateTopFromPolygon(point, createCenterTopPoints(), type, 31, salt);
  }

  const sector = getSectorFromLocalPoint(point);
  if (!sector) return getTerrainLocalTopY(point, type, salt);

  const topPoints = createSectorTopPoints(sector, type);
  return interpolateTopFromPolygon(point, topPoints, type, 0, salt);
}

function interpolateTopFromPolygon(point, topPoints, type, saltOffset = 0, fallbackSalt = 0) {
  if (!topPoints?.length) return getTerrainLocalTopY(point, type, fallbackSalt);

  const heights = topPoints.map((topPoint, index) => (
    getTerrainLocalTopY(topPoint, type, index + saltOffset) + (saltOffset === 0 ? (RAGGED_EDGE?.lift ?? 0) : 0)
  ));
  const triangles = THREE.ShapeUtils.triangulateShape(
    topPoints.map(topPoint => new THREE.Vector2(topPoint.x, topPoint.z)),
    []
  );

  for (const triangle of triangles) {
    const a = topPoints[triangle[0]];
    const b = topPoints[triangle[1]];
    const c = topPoints[triangle[2]];
    const bary = getBarycentric2D(point, a, b, c);
    if (!bary) continue;

    return (
      heights[triangle[0]] * bary.a +
      heights[triangle[1]] * bary.b +
      heights[triangle[2]] * bary.c
    );
  }

  return getTerrainLocalTopY(point, type, fallbackSalt);
}

function getSectorFromLocalPoint(point) {
  if (!point || (Math.abs(point.x) < 0.0001 && Math.abs(point.z) < 0.0001)) return null;
  let angle = Math.atan2(point.z, point.x);
  if (angle < 0) angle += Math.PI * 2;
  const index = Math.floor(((angle + Math.PI / 6) % (Math.PI * 2)) / (Math.PI / 3));
  const key = EDGE_ORDER[index];
  return (SECTOR_DEFS ?? []).find(sector => sector.key === key) ?? null;
}

function createSectorTopPoints(sector, type) {
  const vertices = createOuterVertices(HEX_SIZE * TILE_VISUAL.radiusScale);
  const a = vertices[sector.a];
  const b = vertices[sector.b];
  const innerRadius = HEX_SIZE * (TILE_VISUAL.centerRadiusScale ?? 0.33);
  const innerA = pointAtRadius(a, innerRadius);
  const innerB = pointAtRadius(b, innerRadius);
  const leftInnerEdge = createInnerEdge(innerA, a, sector.a);
  const outerPoints = createRaggedOuterEdge(a, b, type);
  const rightInnerEdge = createInnerEdge(innerB, b, sector.b).reverse();

  return compactPointLoop([
    ...leftInnerEdge,
    ...outerPoints,
    ...rightInnerEdge
  ]);
}

function createCenterTopPoints() {
  return createOuterVertices(HEX_SIZE * (TILE_VISUAL.centerRadiusScale ?? 0.33));
}

function createInnerEdge(innerPoint, outerPoint, vertexIndex) {
  return createRaggedInnerEdge(innerPoint, outerPoint, vertexIndex);
}

function createRaggedInnerEdge(innerPoint, outerPoint, vertexIndex) {
  const points = [];
  const seed = hashRaggedInnerEdge(vertexIndex);
  const segments = RAGGED_EDGE?.innerSegments ?? 8;
  const dx = outerPoint.x - innerPoint.x;
  const dz = outerPoint.z - innerPoint.z;
  const length = Math.hypot(dx, dz) || 1;
  const normal = { x: -dz / length, z: dx / length };

  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const x = THREE.MathUtils.lerp(innerPoint.x, outerPoint.x, t);
    const z = THREE.MathUtils.lerp(innerPoint.z, outerPoint.z, t);
    const endFade = Math.sin(Math.PI * t);
    const wave = Math.sin((Math.PI * t * 3) + hash01(seed + 23) * Math.PI * 2);
    const localChaos = (hash01(seed + i * 131) - 0.5) * 2;
    const bite = (RAGGED_EDGE?.innerAmplitude ?? 0.075) * endFade * ((wave * 0.65) + (localChaos * 0.35));

    points.push({
      x: x + normal.x * bite,
      z: z + normal.z * bite
    });
  }

  return points;
}

function createRaggedOuterEdge(a, b, type) {
  const points = [];
  const seed = hashRaggedEdge(a, b, type);
  const segments = RAGGED_EDGE?.segments ?? 11;

  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const x = THREE.MathUtils.lerp(a.x, b.x, t);
    const z = THREE.MathUtils.lerp(a.z, b.z, t);
    const endFade = Math.sin(Math.PI * t);
    const broadWave = 0.55 + 0.45 * Math.sin((Math.PI * t * 2) + hash01(seed + 17) * Math.PI * 2);
    const localChaos = 0.65 + 0.35 * hash01(seed + i * 97);
    const bite = (RAGGED_EDGE?.amplitude ?? 0.135) * endFade * (0.55 + broadWave * localChaos);
    const length = Math.hypot(x, z) || 1;

    points.push({
      x: x + (x / length) * bite,
      z: z + (z / length) * bite
    });
  }

  return points;
}

function compactPointLoop(points) {
  const compacted = [];

  for (const point of points) {
    const previous = compacted[compacted.length - 1];
    if (!previous || Math.hypot(previous.x - point.x, previous.z - point.z) > 0.0001) {
      compacted.push(point);
    }
  }

  const first = compacted[0];
  const last = compacted[compacted.length - 1];
  if (first && last && Math.hypot(first.x - last.x, first.z - last.z) <= 0.0001) {
    compacted.pop();
  }

  return compacted;
}

function pointAtRadius(point, radius) {
  const length = Math.hypot(point.x, point.z) || 1;
  return {
    x: (point.x / length) * radius,
    z: (point.z / length) * radius
  };
}

function getBarycentric2D(point, a, b, c) {
  const v0x = b.x - a.x;
  const v0z = b.z - a.z;
  const v1x = c.x - a.x;
  const v1z = c.z - a.z;
  const v2x = point.x - a.x;
  const v2z = point.z - a.z;
  const d00 = v0x * v0x + v0z * v0z;
  const d01 = v0x * v1x + v0z * v1z;
  const d11 = v1x * v1x + v1z * v1z;
  const d20 = v2x * v0x + v2z * v0z;
  const d21 = v2x * v1x + v2z * v1z;
  const denom = d00 * d11 - d01 * d01;
  if (Math.abs(denom) < 0.0000001) return null;

  const v = (d11 * d20 - d01 * d21) / denom;
  const w = (d00 * d21 - d01 * d20) / denom;
  const u = 1 - v - w;
  const eps = -0.0005;

  if (u < eps || v < eps || w < eps) return null;
  return { a: u, b: v, c: w };
}

export function getTerrainSurfaceY(point, type = EDGE_TYPES.rail ?? 'rail', salt = 0, options = {}) {
  const localTop = options.exactMeshSurface === false
    ? getTerrainLocalTopY(point, type, salt)
    : getTerrainMeshLocalTopY(point, type, salt);
  const surface = getBiomeSurfaceOffsetY(type) + localTop;

  // On garde uniquement les tout derniers centimètres de bord parfaitement raccords
  // entre deux tuiles ; avant, la voie doit réellement monter/descendre avec le relief.
  const lockStart = options.edgeLockStart ?? 0.965;
  const lockEnd = options.edgeLockEnd ?? 0.998;
  const radius = Math.hypot(point.x, point.z) / Math.max(HEX_SIZE, 0.001);
  const locked = getBiomeSurfaceOffsetY(type) + getBiomeLocalTopY(type);
  const edgeLock = smoothstep(lockStart, lockEnd, radius);
  return THREE.MathUtils.lerp(surface, locked, edgeLock);
}


export function getTerrainNormalAt(point, type = EDGE_TYPES.grass ?? 'grass', salt = 0, options = {}) {
  const step = options.normalSampleStep ?? HEX_SIZE * 0.018;
  const left = { x: point.x - step, z: point.z };
  const right = { x: point.x + step, z: point.z };
  const back = { x: point.x, z: point.z - step };
  const front = { x: point.x, z: point.z + step };

  const hLeft = getTerrainSurfaceY(left, type, salt, options);
  const hRight = getTerrainSurfaceY(right, type, salt, options);
  const hBack = getTerrainSurfaceY(back, type, salt, options);
  const hFront = getTerrainSurfaceY(front, type, salt, options);

  const tangentX = new THREE.Vector3(step * 2, hRight - hLeft, 0);
  const tangentZ = new THREE.Vector3(0, hFront - hBack, step * 2);
  return tangentZ.cross(tangentX).normalize();
}

export function placeObjectOnTerrain(object, point, type = EDGE_TYPES.grass ?? 'grass', salt = 0, options = {}) {
  if (!object || !point) return null;

  const groundOffset = options.groundOffset ?? 0;
  const surfaceOptions = {
    edgeLockStart: options.edgeLockStart,
    edgeLockEnd: options.edgeLockEnd,
    normalSampleStep: options.normalSampleStep
  };

  object.position.y = getTerrainSurfaceY(point, type, salt, surfaceOptions) + groundOffset;

  if (options.alignToSlope) {
    const yaw = options.yaw ?? object.rotation.y ?? 0;
    const normal = getTerrainNormalAt(point, type, salt, surfaceOptions);
    const slopeQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
    const yawQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    object.quaternion.copy(slopeQuat.multiply(yawQuat));
  } else if (typeof options.yaw === 'number') {
    object.rotation.y = options.yaw;
  }

  return object.position.y;
}

export function getRailCenterY(point, salt = 0) {
  return getTerrainSurfaceY(point, EDGE_TYPES.rail ?? 'rail', salt) + RAIL_OVERLAY_LIFT;
}

export function getTrainRailY(point, salt = 0) {
  return getTerrainSurfaceY(point, EDGE_TYPES.rail ?? 'rail', salt) + TRAIN_OVERLAY_LIFT;
}

function hashTerrainPoint(point, type, salt) {
  const text = `${type}:${salt}:${point.x.toFixed(3)}:${point.z.toFixed(3)}`;
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function smoothstep(edge0, edge1, value) {
  const t = THREE.MathUtils.clamp((value - edge0) / Math.max(edge1 - edge0, 0.0001), 0, 1);
  return t * t * (3 - 2 * t);
}
