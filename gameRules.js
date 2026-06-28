// Règles de progression du deck. Le score reste calculé dans scoring.js.
const BONUS_TILE_RULES = [
  { matchingEdges: 3, tiles: 2 },
  { matchingEdges: 2, tiles: 1 }
];

export function normalizeRotation(value) {
  return ((value % 6) + 6) % 6;
}

export function getBonusTilesAwarded(scoreResult) {
  const rule = BONUS_TILE_RULES.find(item => scoreResult.matchingEdges >= item.matchingEdges);
  return rule ? rule.tiles : 0;
}
