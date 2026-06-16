import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import {
  EDGE_TYPES,
  HEX_SIZE,
  TILE_VISUAL,
  TERRAIN_RELIEF,
  THIN_BIOME_DEPTH_RATIO,
  BIOME_HEIGHT_RATIO
} from './config.js';

export const RAIL_SURFACE_Y = TILE_VISUAL.railSurfaceY ?? TILE_VISUAL.waterY ?? -0.075;
export const RAIL_OVERLAY_LIFT = HEX_SIZE * 0.026;
export const TRAIN_OVERLAY_LIFT = HEX_SIZE * 0.070;

export function getBiomeLocalTopY(type) {
  if (type === EDGE_TYPES.water || type === 'water') return 0;

  const baseDepth = TILE_VISUAL.tileThickness ?? 0.16;
  const thinRatio = THIN_BIOME_DEPTH_RATIO?.[type];
  if (thinRatio) return baseDepth * (thinRatio - 1);

  return baseDepth * (BIOME_HEIGHT_RATIO?.[type] ?? 0);
}

export function getBiomeSurfaceOffsetY(type) {
  if (type === EDGE_TYPES.water || type === 'water') return TILE_VISUAL.waterY ?? -0.075;
  if (type === EDGE_TYPES.rail || type === 'rail') return RAIL_SURFACE_Y;
  return TILE_VISUAL.sectorY ?? 0;
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

export function getTerrainSurfaceY(point, type = EDGE_TYPES.rail ?? 'rail', salt = 0, options = {}) {
  const surface = getBiomeSurfaceOffsetY(type) + getTerrainLocalTopY(point, type, salt);

  // On garde uniquement les tout derniers centimètres de bord parfaitement raccords
  // entre deux tuiles ; avant, la voie doit réellement monter/descendre avec le relief.
  const lockStart = options.edgeLockStart ?? 0.965;
  const lockEnd = options.edgeLockEnd ?? 0.998;
  const radius = Math.hypot(point.x, point.z) / Math.max(HEX_SIZE, 0.001);
  const locked = getBiomeSurfaceOffsetY(type) + getBiomeLocalTopY(type);
  const edgeLock = smoothstep(lockStart, lockEnd, radius);
  return THREE.MathUtils.lerp(surface, locked, edgeLock);
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

function hash01(value) {
  let x = value >>> 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return ((x >>> 0) % 10000) / 10000;
}

function smoothstep(edge0, edge1, value) {
  const t = THREE.MathUtils.clamp((value - edge0) / Math.max(edge1 - edge0, 0.0001), 0, 1);
  return t * t * (3 - 2 * t);
}
