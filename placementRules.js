import { EDGE_ORDER, GRID_RADIUS, NETWORK_EDGE_TYPES } from './config.js';
import { makeHexKey } from './hex.js';
import { getEdgeType } from './tileGenerator.js';


let dynamicPlacementGridKeys = null;

export function setPlacementGridKeys(keys) {
  dynamicPlacementGridKeys = keys instanceof Set ? keys : null;
}

export const HEX_DIRECTIONS = [
  { q: 1, r: 0, edge: 'n' },
  { q: 0, r: 1, edge: 'ne' },
  { q: -1, r: 1, edge: 'se' },
  { q: -1, r: 0, edge: 's' },
  { q: 0, r: -1, edge: 'sw' },
  { q: 1, r: -1, edge: 'nw' }
];

export function canPlaceTileAt(hex, placedTiles, tile = null, specialCells = null) {
  return getPlacementValidation(hex, placedTiles, tile, specialCells).valid;
}

export function getPlacementValidation(hex, placedTiles, tile = null, specialCells = null) {
  if (!hex) return invalid('NO_HEX');

  if (!isHexInsideGrid(hex)) return invalid('OUT_OF_GRID');

  const key = makeHexKey(hex.q, hex.r);
  if (placedTiles.has(key)) return invalid('OCCUPIED');

  if (placedTiles.size === 0) return valid();

  if (!hasAdjacentPlacedTile(hex, placedTiles, specialCells)) return invalid('NO_ADJACENT_TILE');

  if (tile) {
    const conflicts = getNetworkConnectionConflicts(hex, placedTiles, tile, specialCells);
    if (conflicts.length > 0) return invalid('INVALID_NETWORK_CONNECTION', { conflicts });
  }

  return valid();
}


export function isHexInsideGrid(hex) {
  if (!hex) return false;
  if (dynamicPlacementGridKeys?.size) return dynamicPlacementGridKeys.has(makeHexKey(hex.q, hex.r));
  return Math.max(
    Math.abs(hex.q),
    Math.abs(hex.r),
    Math.abs(-hex.q - hex.r)
  ) <= GRID_RADIUS;
}

export function hasAdjacentPlacedTile(hex, placedTiles, specialCells = null) {
  return HEX_DIRECTIONS.some(direction => getNeighborTile(hex, direction, placedTiles) || getNeighborSpecialCell(hex, direction, specialCells));
}

export function hasValidNetworkConnections(hex, placedTiles, tile, specialCells = null) {
  return getNetworkConnectionConflicts(hex, placedTiles, tile, specialCells).length === 0;
}

export function getNetworkConnectionConflicts(hex, placedTiles, tile, specialCells = null) {
  const conflicts = [];

  for (const direction of HEX_DIRECTIONS) {
    const neighbor = getNeighborTile(hex, direction, placedTiles);
    const specialNeighbor = getNeighborSpecialCell(hex, direction, specialCells);
    if (specialNeighbor) continue;
    if (!neighbor) continue;

    const ownEdge = direction.edge;
    const neighborEdge = getOppositeEdge(direction.edge);
    const ownType = getEdgeType(tile.edges[ownEdge]);
    const neighborType = getEdgeType(neighbor.tile.edges[neighborEdge]);

    if (!areEdgesCompatible(ownType, neighborType)) {
      conflicts.push({
        edge: ownEdge,
        ownType,
        neighborType,
        neighborKey: neighbor.key ?? makeHexKey(hex.q + direction.q, hex.r + direction.r)
      });
    }
  }

  return conflicts;
}

export function areEdgesCompatible(a, b) {
  if (NETWORK_EDGE_TYPES.includes(a) || NETWORK_EDGE_TYPES.includes(b)) {
    return a === b;
  }

  return true;
}

export function getOppositeEdge(edge) {
  const index = EDGE_ORDER.indexOf(edge);
  if (index === -1) throw new Error(`Unknown edge: ${edge}`);
  return EDGE_ORDER[(index + 3) % EDGE_ORDER.length];
}

function getNeighborTile(hex, direction, placedTiles) {
  return placedTiles.get(makeHexKey(hex.q + direction.q, hex.r + direction.r));
}

function getNeighborSpecialCell(hex, direction, specialCells) {
  return specialCells?.get(makeHexKey(hex.q + direction.q, hex.r + direction.r)) ?? null;
}

function valid() {
  return { valid: true, reason: null };
}

function invalid(reason, details = {}) {
  return { valid: false, reason, ...details };
}
