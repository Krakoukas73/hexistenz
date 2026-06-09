import { HEX_DIRECTIONS, getOppositeEdge } from './placementRules.js';
import { makeHexKey } from './hex.js';

export const SCORE_VALUES = {
  matchingEdge: 10,
  perfectTileBonus: 50
};

export function calculatePlacementScore(hex, placedTiles, tile) {
  let matchingEdges = 0;
  let checkedEdges = 0;

  for (const direction of HEX_DIRECTIONS) {
    const neighbor = placedTiles.get(makeHexKey(hex.q + direction.q, hex.r + direction.r));
    if (!neighbor) continue;

    checkedEdges++;

    const ownType = tile.edges[direction.edge];
    const neighborType = neighbor.tile.edges[getOppositeEdge(direction.edge)];

    if (ownType === neighborType) matchingEdges++;
  }

  const edgeScore = matchingEdges * SCORE_VALUES.matchingEdge;
  const perfectBonus = checkedEdges === 6 && matchingEdges === 6
    ? SCORE_VALUES.perfectTileBonus
    : 0;

  return {
    total: edgeScore + perfectBonus,
    matchingEdges,
    checkedEdges,
    perfectBonus
  };
}
