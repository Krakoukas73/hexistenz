import { EDGE_ORDER, NETWORK_EDGE_TYPES } from './config.js';
import { makeHexKey } from './hex.js';

export const HEX_DIRECTIONS = [
  { q: 1, r: 0, edge: 'n' },
  { q: 0, r: 1, edge: 'ne' },
  { q: -1, r: 1, edge: 'se' },
  { q: -1, r: 0, edge: 's' },
  { q: 0, r: -1, edge: 'sw' },
  { q: 1, r: -1, edge: 'nw' }
];

export function canPlaceTileAt(hex, placedTiles, tile = null) {
  return getPlacementValidation(hex, placedTiles, tile).valid;
}

export function getPlacementValidation(hex, placedTiles, tile = null) {
  if (!hex) return invalid('NO_HEX');

  const key = makeHexKey(hex.q, hex.r);
  if (placedTiles.has(key)) return invalid('OCCUPIED');

  if (placedTiles.size === 0) return valid();

  if (!hasAdjacentPlacedTile(hex, placedTiles)) return invalid('NO_ADJACENT_TILE');

  if (tile && !hasValidNetworkConnections(hex, placedTiles, tile)) {
    return invalid('INVALID_NETWORK_CONNECTION');
  }

  return valid();
}

export function hasAdjacentPlacedTile(hex, placedTiles) {
  return HEX_DIRECTIONS.some(direction => getNeighborTile(hex, direction, placedTiles));
}

export function hasValidNetworkConnections(hex, placedTiles, tile) {
  return HEX_DIRECTIONS.every(direction => {
    const neighbor = getNeighborTile(hex, direction, placedTiles);
    if (!neighbor) return true;

    const ownType = tile.edges[direction.edge];
    const neighborType = neighbor.tile.edges[getOppositeEdge(direction.edge)];

    return areEdgesCompatible(ownType, neighborType);
  });
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

function valid() {
  return { valid: true, reason: null };
}

function invalid(reason) {
  return { valid: false, reason };
}
