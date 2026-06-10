import { EDGE_ORDER, EDGE_TYPES } from './config.js';
import { HEX_DIRECTIONS, getOppositeEdge } from './placementRules.js';
import { makeHexKey } from './hex.js';
import { getEdgeType, getEdgeValue } from './tileGenerator.js';

export const MISSION_REWARD = 100;
export const MISSION_TILE_REWARD = 3;
export const MISSION_CHANCE = 0.20;
export const COMPLETED_MISSION_VISIBLE_TURNS = 5;

// Paliers calibrés sur l'effort réel de zone :
// - prairie, eau et rail valent toujours 1 unité par triangle ;
// - champs = 1 à 2, maisons = 1 à 4, arbres = 1 à 6.
// Les objectifs des textures à valeur variable montent donc plus haut,
// parce qu'une zone équivalente progresse plus vite qu'un réseau eau/rail.
const MISSION_TYPES = [
  {
    type: EDGE_TYPES.forest,
    label: 'Forêt',
    unit: 'arbres',
    targets: [24, 50, 80, 115, 155, 200]
  },
  {
    type: EDGE_TYPES.house,
    label: 'Village',
    unit: 'maisons',
    targets: [16, 32, 52, 78, 108, 145]
  },
  {
    type: EDGE_TYPES.rail,
    label: 'Voie ferrée',
    unit: 'éléments',
    targets: [8, 15, 24, 35, 48, 65]
  },
  {
    type: EDGE_TYPES.water,
    label: "Voie d'eau",
    unit: 'éléments',
    targets: [8, 15, 24, 35, 48, 65]
  },
  {
    type: EDGE_TYPES.grass,
    label: 'Prairie',
    unit: 'éléments',
    targets: [8, 15, 24, 35, 48, 65]
  },
  {
    type: EDGE_TYPES.field,
    label: 'Surface agricole',
    unit: 'champs',
    targets: [12, 24, 38, 56, 78, 105]
  }
];

const DIRECTION_BY_EDGE = Object.fromEntries(HEX_DIRECTIONS.map(direction => [direction.edge, direction]));

export function createMissionManager() {
  return {
    active: [],
    generatedTileIds: new Set(),
    targetLevelByType: new Map(),
    nextId: 1,
    turn: 0
  };
}

export function maybeGenerateMissionForTile(manager, tile) {
  if (!tile?.id || manager.generatedTileIds.has(tile.id)) return null;

  manager.generatedTileIds.add(tile.id);
  if (Math.random() >= MISSION_CHANCE) return null;

  const missionDefinition = pickMissionDefinition(tile, manager);
  if (!missionDefinition) return null;

  const mission = {
    id: `mission_${manager.nextId++}`,
    tileId: tile.id,
    type: missionDefinition.type,
    label: missionDefinition.label,
    unit: missionDefinition.unit,
    target: getNextMissionTarget(manager, missionDefinition)
  };

  manager.active.push(mission);
  return mission;
}

export function removeMissionById(manager, missionId) {
  const mission = manager.active.find(item => item.id === missionId);
  if (mission?.tileId) manager.generatedTileIds.delete(mission.tileId);
  if (mission?.type) decrementMissionTargetLevel(manager, mission.type);
  manager.active = manager.active.filter(item => item.id !== missionId);
}

export function restoreMissions(manager, missions) {
  for (const mission of missions) {
    const existingMission = manager.active.find(item => item.id === mission.id);

    if (existingMission) {
      existingMission.completed = false;
      delete existingMission.completedAtTurn;
    } else {
      const restoredMission = { ...mission, completed: false };
      delete restoredMission.completedAtTurn;
      manager.active.push(restoredMission);
    }
  }
}

export function restoreMissionSnapshots(manager, missions) {
  for (const mission of missions) {
    if (!manager.active.some(item => item.id === mission.id)) {
      manager.active.push({ ...mission });
    }
  }
}

export function setMissionTurn(manager, turn) {
  manager.turn = Math.max(0, Number(turn) || 0);
}

export function advanceMissionTurn(manager) {
  manager.turn += 1;
  return purgeOldCompletedMissions(manager);
}

export function getCompletedMissions(manager, placedTiles) {
  if (manager.active.length === 0) return [];

  const progressByType = getMissionProgressByType(placedTiles);
  return manager.active.filter(mission => !mission.completed && (progressByType.get(mission.type) ?? 0) >= mission.target);
}

export function getMissionProgressByType(placedTiles) {
  return getBestZoneTotalsByType(placedTiles);
}

export function consumeCompletedMissions(manager, completedMissions) {
  if (completedMissions.length === 0) return;

  const completedIds = new Set(completedMissions.map(mission => mission.id));

  for (const mission of manager.active) {
    if (completedIds.has(mission.id)) {
      mission.completed = true;
      mission.completedAtTurn = manager.turn + 1;
    }
  }
}

function purgeOldCompletedMissions(manager) {
  const purged = [];

  manager.active = manager.active.filter(mission => {
    if (!mission.completed) return true;

    const completedAtTurn = Number(mission.completedAtTurn ?? manager.turn);
    const mustKeep = manager.turn - completedAtTurn < COMPLETED_MISSION_VISIBLE_TURNS;

    if (!mustKeep) purged.push({ ...mission });
    return mustKeep;
  });

  return purged;
}

export function formatMissionLabel(mission, progressByType = new Map()) {
  const progress = Math.min(progressByType.get(mission.type) ?? 0, mission.target);
  return `${mission.label} ${progress}/${mission.target} ${mission.unit}`;
}


function getNextMissionTarget(manager, missionDefinition) {
  const level = manager.targetLevelByType.get(missionDefinition.type) ?? 0;
  manager.targetLevelByType.set(missionDefinition.type, level + 1);
  return missionDefinition.targets[level] ?? extrapolateTarget(missionDefinition.targets, level);
}

function decrementMissionTargetLevel(manager, type) {
  const level = manager.targetLevelByType.get(type) ?? 0;
  if (level <= 1) manager.targetLevelByType.delete(type);
  else manager.targetLevelByType.set(type, level - 1);
}

function extrapolateTarget(targets, level) {
  const last = targets[targets.length - 1];
  const previous = targets[targets.length - 2] ?? last;
  return last + (level - targets.length + 1) * Math.max(1, last - previous);
}

function pickMissionDefinition(tile, manager) {
  const blockedTypes = getActiveIncompleteMissionTypes(manager);
  const presentTypes = new Set(EDGE_ORDER.map(edge => getEdgeType(tile.edges[edge])));
  const availableDefinitions = MISSION_TYPES.filter(mission => !blockedTypes.has(mission.type));

  if (availableDefinitions.length === 0) return null;

  const matchingDefinitions = availableDefinitions.filter(mission => presentTypes.has(mission.type));
  return pickRandom(matchingDefinitions.length > 0 ? matchingDefinitions : availableDefinitions);
}

function getActiveIncompleteMissionTypes(manager) {
  return new Set(
    manager.active
      .filter(mission => !mission.completed)
      .map(mission => mission.type)
  );
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
