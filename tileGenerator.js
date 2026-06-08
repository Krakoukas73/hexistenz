import { EDGE_ORDER, EDGE_WEIGHTS, NETWORK_EDGE_TYPES } from './config.js';
import { pickRandom, pickWeighted } from './random.js';

export function createDeck(size) {
  return Array.from({ length: size }, () => generateTile());
}

export function generateTile() {
  const edges = generateWeightedEdges();

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

function generateWeightedEdges() {
  const edges = {};
  for (const edge of EDGE_ORDER) edges[edge] = pickWeighted(EDGE_WEIGHTS);
  return edges;
}

function enforceNetworkContinuity(edges, networkType) {
  const count = countEdgesOfType(edges, networkType);
  if (count !== 1) return;

  const candidates = EDGE_ORDER.filter(edge => !NETWORK_EDGE_TYPES.includes(edges[edge]));
  const pickedEdge = pickRandom(candidates);

  if (pickedEdge) edges[pickedEdge] = networkType;
}

function countEdgesOfType(edges, type) {
  return EDGE_ORDER.reduce((count, edge) => count + (edges[edge] === type ? 1 : 0), 0);
}

function pickCenterFromEdges(edges) {
  if (hasEdgeType(edges, 'water')) return 'water';
  if (hasEdgeType(edges, 'rail')) return 'rail';

  const counts = new Map();

  for (const edge of EDGE_ORDER) {
    const type = edges[edge];
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }

  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function hasEdgeType(edges, type) {
  return EDGE_ORDER.some(edge => edges[edge] === type);
}

function normalizeRotation(steps) {
  return ((steps % 6) + 6) % 6;
}

function createTileId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `tile_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}
