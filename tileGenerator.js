import { EDGE_ORDER, EDGE_TYPES, EDGE_WEIGHTS, NETWORK_EDGE_TYPES } from './config.js';
import { pickRandom, pickWeighted } from './random.js';

const MIXED_NETWORK_TILE_CHANCE = 0.04;
const NETWORK_TERMINUS_CHANCE = 0.20;

const EDGE_VALUE_RANGES = {
  [EDGE_TYPES.field]: pickFieldValue,
  [EDGE_TYPES.grass]: () => 1,
  [EDGE_TYPES.water]: () => 1,
  [EDGE_TYPES.rail]: () => 1,
  [EDGE_TYPES.forest]: pickForestValue,
  [EDGE_TYPES.house]: pickHouseValue
};

export function createDeck(size) {
  return Array.from({ length: size }, () => generateTile());
}

export function generateTile() {
  const edges = generateWeightedEdges();

  limitMixedNetworkTiles(edges);

  for (const networkType of NETWORK_EDGE_TYPES) {
    enforceNetworkContinuity(edges, networkType);
  }

  return {
    id: createTileId(),
    edges,
    center: pickCenterFromEdges(edges),
    rotation: 0
  };
}

export function rotateTile(tile, steps) {
  return {
    ...tile,
    edges: rotateEdges(tile.edges, steps),
    rotation: normalizeRotation((tile.rotation ?? 0) + steps)
  };
}

export function rotateEdges(edges, steps) {
  const normalizedSteps = normalizeRotation(steps);
  const rotated = {};

  for (let i = 0; i < EDGE_ORDER.length; i++) {
    const from = EDGE_ORDER[i];
    const to = EDGE_ORDER[(i + normalizedSteps) % EDGE_ORDER.length];
    rotated[to] = edges[from];
  }

  return rotated;
}

export function getEdgeType(edge) {
  return typeof edge === 'string' ? edge : edge?.type;
}

export function getEdgeValue(edge) {
  return typeof edge === 'string' ? 1 : edge?.value ?? 1;
}

function generateWeightedEdges() {
  const edges = {};
  for (const edge of EDGE_ORDER) edges[edge] = createEdge(pickWeighted(EDGE_WEIGHTS));
  return edges;
}

function createEdge(type) {
  return {
    type,
    value: EDGE_VALUE_RANGES[type]?.() ?? 1
  };
}

function limitMixedNetworkTiles(edges) {
  const presentNetworkTypes = NETWORK_EDGE_TYPES.filter(type => hasEdgeType(edges, type));
  if (presentNetworkTypes.length < 2) return;

  // Les tuiles eau + rail existent encore, mais deviennent rares.
  // Sinon le tirage peut sortir des horreurs injouables en série, façon sabotage industriel.
  if (Math.random() < MIXED_NETWORK_TILE_CHANCE) return;

  const keptType = pickDominantNetworkType(edges, presentNetworkTypes);

  for (const edge of EDGE_ORDER) {
    if (NETWORK_EDGE_TYPES.includes(getEdgeType(edges[edge])) && getEdgeType(edges[edge]) !== keptType) {
      edges[edge] = createEdge(pickNonNetworkEdgeType());
    }
  }
}

function pickDominantNetworkType(edges, networkTypes) {
  const sorted = [...networkTypes].sort((a, b) => countEdgesOfType(edges, b) - countEdgesOfType(edges, a));
  const topCount = countEdgesOfType(edges, sorted[0]);
  const tied = sorted.filter(type => countEdgesOfType(edges, type) === topCount);
  return pickRandom(tied);
}

function pickNonNetworkEdgeType() {
  const nonNetworkWeights = Object.fromEntries(
    Object.entries(EDGE_WEIGHTS).filter(([type, weight]) => weight > 0 && !NETWORK_EDGE_TYPES.includes(type))
  );

  return pickWeighted(nonNetworkWeights);
}

function enforceNetworkContinuity(edges, networkType) {
  const count = countEdgesOfType(edges, networkType);
  if (count !== 1) return;

  // 1 fois sur 5 environ, un réseau peut être terminal :
  // eau = lac/barrage, rail = gare/terminus.
  // Donc on garde une seule connexion au lieu de forcer une sortie.
  if (Math.random() < NETWORK_TERMINUS_CHANCE) return;

  const candidates = EDGE_ORDER.filter(edge => !NETWORK_EDGE_TYPES.includes(getEdgeType(edges[edge])));
  const pickedEdge = pickRandom(candidates);

  if (pickedEdge) edges[pickedEdge] = createEdge(networkType);
}

function countEdgesOfType(edges, type) {
  return EDGE_ORDER.reduce((count, edge) => count + (getEdgeType(edges[edge]) === type ? 1 : 0), 0);
}

function pickCenterFromEdges(edges) {
  if (hasEdgeType(edges, EDGE_TYPES.water)) return EDGE_TYPES.water;
  if (hasEdgeType(edges, EDGE_TYPES.rail)) return EDGE_TYPES.rail;

  const counts = new Map();

  for (const edge of EDGE_ORDER) {
    const type = getEdgeType(edges[edge]);
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }

  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function hasEdgeType(edges, type) {
  return EDGE_ORDER.some(edge => getEdgeType(edges[edge]) === type);
}


function pickFieldValue() {
  return Number(pickWeighted({
    1: 14,
    2: 14,
    3: 10,
    4: 10,
    5: 10,
    6: 5,
    7: 5,
    8: 5,
    9: 2,
    10: 2,
    11: 2,
    12: 2
  }));
}

function pickForestValue() {
  return Number(pickWeighted({
    3: 12,
    4: 12,
    5: 12,
    6: 10,
    7: 10,
    8: 10,
    9: 10,
    10: 5,
    11: 5,
    12: 5,
    13: 2,
    14: 2,
    15: 2
  }));
}

function pickHouseValue() {
  return Number(pickWeighted({
    1: 14,
    2: 14,
    3: 10,
    4: 10,
    5: 10,
    6: 5,
    7: 5,
    8: 5,
    9: 2,
    10: 2,
    11: 2,
    12: 2
  }));
}

function normalizeRotation(steps) {
  return ((steps % 6) + 6) % 6;
}

function createTileId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `tile_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}
