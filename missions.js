import { EDGE_ORDER, EDGE_TYPES } from './config.js';
import { HEX_DIRECTIONS, getOppositeEdge } from './placementRules.js';
import { makeHexKey } from './hex.js';
import { getEdgeType, getEdgeValue } from './tileGenerator.js';

export const MISSION_REWARD = 100;
export const MISSION_CHANCE = 0.10;

const MISSION_TYPES = [
  {
    type: EDGE_TYPES.forest,
    label: 'Forêt',
    unit: 'arbres',
    targets: [18, 24, 30, 36, 42, 50]
  },
  {
    type: EDGE_TYPES.house,
    label: 'Village',
    unit: 'maisons',
    targets: [10, 14, 18, 22, 26, 30]
  },
  {
    type: EDGE_TYPES.rail,
    label: 'Voie ferrée',
    unit: 'éléments',
    targets: [8, 10, 12, 15, 18, 22]
  },
  {
    type: EDGE_TYPES.water,
    label: "Voie d'eau",
    unit: 'éléments',
    targets: [8, 10, 12, 15, 18, 22]
  }
];

const DIRECTION_BY_EDGE = Object.fromEntries(HEX_DIRECTIONS.map(direction => [direction.edge, direction]));

export function createMissionManager() {
  return {
    active: [],
    generatedTileIds: new Set(),
    nextId: 1
  };
}

export function maybeGenerateMissionForTile(manager, tile) {
  if (!tile?.id || manager.generatedTileIds.has(tile.id)) return null;

  manager.generatedTileIds.add(tile.id);
  if (Math.random() >= MISSION_CHANCE) return null;

  const missionDefinition = pickMissionDefinition(tile);
  const mission = {
    id: `mission_${manager.nextId++}`,
    tileId: tile.id,
    type: missionDefinition.type,
    label: missionDefinition.label,
    unit: missionDefinition.unit,
    target: pickRandom(missionDefinition.targets)
  };

  manager.active.push(mission);
  return mission;
}

export function removeMissionById(manager, missionId) {
  const mission = manager.active.find(item => item.id === missionId);
  if (mission?.tileId) manager.generatedTileIds.delete(mission.tileId);
  manager.active = manager.active.filter(item => item.id !== missionId);
}

export function restoreMissions(manager, missions) {
  for (const mission of missions) manager.active.push(mission);
}

export function getCompletedMissions(manager, placedTiles) {
  if (manager.active.length === 0) return [];

  const zoneTotalsByType = getBestZoneTotalsByType(placedTiles);
  return manager.active.filter(mission => (zoneTotalsByType.get(mission.type) ?? 0) >= mission.target);
}

export function consumeCompletedMissions(manager, completedMissions) {
  if (completedMissions.length === 0) return;

  const completedIds = new Set(completedMissions.map(mission => mission.id));
  manager.active = manager.active.filter(mission => !completedIds.has(mission.id));
}

export function formatMissionLabel(mission) {
  return `${mission.label} de ${mission.target} ${mission.unit}`;
}

function pickMissionDefinition(tile) {
  const presentTypes = new Set(EDGE_ORDER.map(edge => getEdgeType(tile.edges[edge])));
  const matchingDefinitions = MISSION_TYPES.filter(mission => presentTypes.has(mission.type));
  return pickRandom(matchingDefinitions.length > 0 ? matchingDefinitions : MISSION_TYPES);
}

function getBestZoneTotalsByType(placedTiles) {
  const visited = new Set();
  const bestTotals = new Map();

  for (const placedTile of placedTiles.values()) {
    for (const edge of EDGE_ORDER) {
      const type = getTileEdgeType(placedTile, edge);
      const nodeKey = makeNodeKey(placedTile.key, edge);

      if (visited.has(nodeKey) || !isMissionType(type)) continue;

      const zone = collectTextureZone(placedTile, edge, type, placedTiles, visited);
      bestTotals.set(type, Math.max(bestTotals.get(type) ?? 0, zone.total));
    }
  }

  return bestTotals;
}

function collectTextureZone(startTile, startEdge, type, placedTiles, visited) {
  const stack = [{ tile: startTile, edge: startEdge }];
  let total = 0;

  while (stack.length > 0) {
    const current = stack.pop();
    const nodeKey = makeNodeKey(current.tile.key, current.edge);

    if (visited.has(nodeKey)) continue;
    if (getTileEdgeType(current.tile, current.edge) !== type) continue;

    visited.add(nodeKey);
    total += getEdgeValue(current.tile.tile.edges[current.edge]);

    for (const neighbor of getTextureNeighbors(current.tile, current.edge, type, placedTiles)) {
      if (!visited.has(makeNodeKey(neighbor.tile.key, neighbor.edge))) stack.push(neighbor);
    }
  }

  return { type, total };
}

function getTextureNeighbors(placedTile, edge, type, placedTiles) {
  const neighbors = [];

  if (getTileCenterType(placedTile) === type) {
    for (const sameTileEdge of EDGE_ORDER) {
      if (sameTileEdge !== edge && getTileEdgeType(placedTile, sameTileEdge) === type) {
        neighbors.push({ tile: placedTile, edge: sameTileEdge });
      }
    }
  }

  const edgeIndex = EDGE_ORDER.indexOf(edge);
  const internalEdges = [
    EDGE_ORDER[(edgeIndex + EDGE_ORDER.length - 1) % EDGE_ORDER.length],
    EDGE_ORDER[(edgeIndex + 1) % EDGE_ORDER.length]
  ];

  for (const internalEdge of internalEdges) {
    if (getTileEdgeType(placedTile, internalEdge) === type) {
      neighbors.push({ tile: placedTile, edge: internalEdge });
    }
  }

  const direction = DIRECTION_BY_EDGE[edge];
  if (!direction) return neighbors;

  const neighborTile = placedTiles.get(makeHexKey(placedTile.q + direction.q, placedTile.r + direction.r));
  const oppositeEdge = getOppositeEdge(edge);

  if (neighborTile && getTileEdgeType(neighborTile, oppositeEdge) === type) {
    neighbors.push({ tile: neighborTile, edge: oppositeEdge });
  }

  return neighbors;
}

function getTileEdgeType(placedTile, edge) {
  return getEdgeType(placedTile.tile.edges[edge]);
}

function getTileCenterType(placedTile) {
  return placedTile.tile.center ?? null;
}

function isMissionType(type) {
  return MISSION_TYPES.some(mission => mission.type === type);
}

function makeNodeKey(tileKey, edge) {
  return `${tileKey}:${edge}`;
}

function pickRandom(items) {
  return items[Math.floor(Math.random() * items.length)];
}
