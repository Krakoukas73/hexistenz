import { EDGE_TYPES } from './config.js';
import { HEX_DIRECTIONS, getOppositeEdge } from './placementRules.js';
import { makeHexKey } from './hex.js';
import { getEdgeType } from './tileGenerator.js';

export const SCORE_VALUES = {
  matchingEdge: 10,
  networkMatchingEdge: 25,
  perfectTileBonus: 50
};

function getMatchingEdgeScore(edgeType) {
  return edgeType === EDGE_TYPES.water || edgeType === EDGE_TYPES.rail
    ? SCORE_VALUES.networkMatchingEdge
    : SCORE_VALUES.matchingEdge;
}

export function calculatePlacementScore(hex, placedTiles, tile) {
  let matchingEdges = 0;
  let checkedEdges = 0;
  let edgeScore = 0;

  for (const direction of HEX_DIRECTIONS) {
    const neighbor = placedTiles.get(makeHexKey(hex.q + direction.q, hex.r + direction.r));
    if (!neighbor) continue;

    checkedEdges++;

    const ownType = getEdgeType(tile.edges[direction.edge]);
    const neighborType = getEdgeType(neighbor.tile.edges[getOppositeEdge(direction.edge)]);

    if (ownType === neighborType) {
      matchingEdges++;
      edgeScore += getMatchingEdgeScore(ownType);
    }
  }

  const perfectBonus = checkedEdges === 6 && matchingEdges === 6
    ? SCORE_VALUES.perfectTileBonus
    : 0;

  return {
    total: edgeScore + perfectBonus,
    matchingEdges,
    checkedEdges,
    perfectBonus,
    edgeScore
  };
}
