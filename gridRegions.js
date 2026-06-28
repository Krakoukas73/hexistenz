import { GRID_RADIUS } from './config.js';
import { makeHexKey } from './hex.js';

export const GRID_EXPANSION_THRESHOLD = 0.30;
export const GRID_SIDE_DIRECTIONS = [
  { q: 1, r: 0, edge: 'east' },
  { q: 0, r: 1, edge: 'south-east' },
  { q: -1, r: 1, edge: 'south-west' },
  { q: -1, r: 0, edge: 'west' },
  { q: 0, r: -1, edge: 'north-west' },
  { q: 1, r: -1, edge: 'north-east' }
];

export function createInitialGridRegions() {
  return [createGridRegion(0, 0)];
}

export function createGridRegion(q = 0, r = 0) {
  return {
    q: Number(q) || 0,
    r: Number(r) || 0,
    key: makeHexKey(Number(q) || 0, Number(r) || 0),
    expanded: false
  };
}

export function hydrateGridRegions(regions) {
  if (!Array.isArray(regions) || regions.length === 0) return createInitialGridRegions();

  const deduped = new Map();
  for (const region of regions) {
    if (!region) continue;
    const q = Number(region.q);
    const r = Number(region.r);
    if (!Number.isFinite(q) || !Number.isFinite(r)) continue;
    const normalized = createGridRegion(q, r);
    normalized.expanded = Boolean(region.expanded);
    deduped.set(normalized.key, normalized);
  }

  if (deduped.size === 0) deduped.set('0,0', createGridRegion(0, 0));
  return [...deduped.values()];
}

export function serializeGridRegions(regions) {
  return hydrateGridRegions(regions).map(region => ({
    q: region.q,
    r: region.r,
    key: region.key,
    expanded: Boolean(region.expanded)
  }));
}

export function getAllGridHexes(regions = createInitialGridRegions()) {
  const hexes = new Map();
  for (const region of hydrateGridRegions(regions)) {
    for (let dq = -GRID_RADIUS; dq <= GRID_RADIUS; dq += 1) {
      for (let dr = -GRID_RADIUS; dr <= GRID_RADIUS; dr += 1) {
        if (!isLocalHexInRadius(dq, dr)) continue;
        const q = region.q + dq;
        const r = region.r + dr;
        hexes.set(makeHexKey(q, r), { q, r, regionKey: region.key });
      }
    }
  }
  return [...hexes.values()];
}

export function getTotalGridTiles(regions = createInitialGridRegions()) {
  return getAllGridHexes(regions).length;
}

export function isHexInsideGridRegions(hex, regions = createInitialGridRegions()) {
  if (!hex) return false;
  return hydrateGridRegions(regions).some(region => isHexInsideRegion(hex, region));
}

export function isHexInsideRegion(hex, region) {
  if (!hex || !region) return false;
  const dq = Number(hex.q) - Number(region.q);
  const dr = Number(hex.r) - Number(region.r);
  return isLocalHexInRadius(dq, dr);
}

export function maybeCreateGridExpansion(regions, placedTiles, threshold = GRID_EXPANSION_THRESHOLD) {
  const currentRegions = hydrateGridRegions(regions);
  const regionKeys = new Set(currentRegions.map(region => region.key));

  for (const region of currentRegions) {
    if (region.expanded) continue;
    const occupancy = getRegionOccupancy(region, placedTiles);
    if (occupancy < threshold) continue;

    const direction = pickFreeExpansionDirection(region, regionKeys);
    if (!direction) {
      region.expanded = true;
      return null;
    }

    const step = (GRID_RADIUS * 2) + 1;
    const next = createGridRegion(region.q + direction.q * step, region.r + direction.r * step);
    region.expanded = true;
    currentRegions.push(next);
    return next;
  }

  return null;
}

export function getRegionOccupancy(region, placedTiles) {
  if (!region || !placedTiles?.size) return 0;
  const total = getRegionTileCount();
  let placed = 0;

  for (const placedTile of placedTiles.values()) {
    if (isHexInsideRegion(placedTile, region)) placed += 1;
  }

  return total > 0 ? placed / total : 0;
}

export function getRegionTileCount() {
  return 1 + 3 * GRID_RADIUS * (GRID_RADIUS + 1);
}

function pickFreeExpansionDirection(region, regionKeys) {
  const step = (GRID_RADIUS * 2) + 1;
  for (const direction of GRID_SIDE_DIRECTIONS) {
    const key = makeHexKey(region.q + direction.q * step, region.r + direction.r * step);
    if (!regionKeys.has(key)) return direction;
  }
  return null;
}

function isLocalHexInRadius(q, r) {
  return Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r)) <= GRID_RADIUS;
}
