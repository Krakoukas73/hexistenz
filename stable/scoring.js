import { EDGE_TYPES } from '../config.js';
import { HEX_DIRECTIONS, getOppositeEdge } from './placementRules.js';
import { makeHexKey } from './hex.js';
import { getEdgeType } from '../tileGenerator.js';

export const SCORE_VALUES = {
  tilePlacement: 2,
  matchingEdge: 10,
  networkMatchingEdge: 25,
  surroundedTileBonus: 50
};

function getMatchingEdgeScore(edgeType) {
  return edgeType === EDGE_TYPES.water || edgeType === EDGE_TYPES.rail
    ? SCORE_VALUES.networkMatchingEdge
    : SCORE_VALUES.matchingEdge;
}

export function calculatePlacementScore(hex, placedTiles, tile, specialCells = null) {
  let matchingEdges = 0;
  let checkedEdges = 0;
  let edgeScore = 0;

  for (const direction of HEX_DIRECTIONS) {
    const neighborKey = makeHexKey(hex.q + direction.q, hex.r + direction.r);
    if (specialCells?.has(neighborKey)) continue;

    const neighbor = placedTiles.get(neighborKey);
    if (!neighbor) continue;

    checkedEdges++;

    const ownType = getEdgeType(tile.edges[direction.edge]);
    const neighborType = getEdgeType(neighbor.tile.edges[getOppositeEdge(direction.edge)]);

    if (ownType === neighborType) {
      matchingEdges++;
      edgeScore += getMatchingEdgeScore(ownType);
    }
  }

  const surroundedTiles = countNewlySurroundedTiles(hex, placedTiles, specialCells);
  const surroundedTileBonus = surroundedTiles * SCORE_VALUES.surroundedTileBonus;

  return {
    total: SCORE_VALUES.tilePlacement + edgeScore + surroundedTileBonus,
    matchingEdges,
    checkedEdges,
    surroundedTiles,
    surroundedTileBonus,
    edgeScore,
    tilePlacement: SCORE_VALUES.tilePlacement
  };
}

function countNewlySurroundedTiles(hex, placedTiles, specialCells = null) {
  const candidateKeys = new Set([makeHexKey(hex.q, hex.r)]);

  for (const direction of HEX_DIRECTIONS) {
    const neighborHex = { q: hex.q + direction.q, r: hex.r + direction.r };
    const neighborKey = makeHexKey(neighborHex.q, neighborHex.r);
    if (placedTiles.has(neighborKey)) candidateKeys.add(neighborKey);
  }

  let count = 0;

  for (const key of candidateKeys) {
    const candidate = key === makeHexKey(hex.q, hex.r)
      ? hex
      : placedTiles.get(key);

    if (candidate && isSurroundedAfterPlacement(candidate, hex, placedTiles, specialCells)) count++;
  }

  return count;
}

function isSurroundedAfterPlacement(candidate, placedHex, placedTiles, specialCells = null) {
  return HEX_DIRECTIONS.every(direction => {
    const q = candidate.q + direction.q;
    const r = candidate.r + direction.r;
    const key = makeHexKey(q, r);
    return placedTiles.has(key) || specialCells?.has(key) || (q === placedHex.q && r === placedHex.r);
  });
}
