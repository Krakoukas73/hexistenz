import { EDGE_ORDER, EDGE_TYPES, MISSION_REWARD, MISSION_TILE_REWARD, MISSION_CHANCE, COMPLETED_MISSION_VISIBLE_TURNS } from './config.js';
import { HEX_DIRECTIONS, getOppositeEdge } from './placementRules.js';
import { makeHexKey } from './hex.js';
import { getEdgeType, getEdgeValue } from './tileGenerator.js';
import { makeNodeKey, getTileEdgeType, getTileCenterType } from './tileUtils.js';
import { collectZone, getFullTextureNeighbors } from './zoneUtils.js';
import { countWaterBoats } from './waterBoatOverlay.js';

export { MISSION_REWARD, MISSION_TILE_REWARD, MISSION_CHANCE, COMPLETED_MISSION_VISIBLE_TURNS };

const TRAIN_MISSION_TYPE = 'train';
const BOAT_MISSION_TYPE = 'boat';

// Paliers calibrés sur l'effort réel de zone :
// - prairie, eau et rail valent toujours 1 unité par triangle ;
// - champs de blé = 1 à 2, maisons = 1 à 4, arbres = 1 à 6.
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
    unit: 'rails',
    targets: [8, 15, 24, 35, 48, 65]
  },
  {
    type: TRAIN_MISSION_TYPE,
    matchTypes: [EDGE_TYPES.rail],
    label: 'Trains',
    unit: '',
    targets: [1, 2, 3, 4, 5, 6]
  },
  {
    type: BOAT_MISSION_TYPE,
    matchTypes: [EDGE_TYPES.water],
    label: 'Bateaux',
    unit: '',
    targets: [1, 2, 3, 4, 5, 6]
  },
  {
    type: EDGE_TYPES.water,
    label: "Voie d'eau",
    unit: "cases d'eau",
    targets: [8, 15, 24, 35, 48, 65]
  },
  {
    type: EDGE_TYPES.grass,
    label: 'Prairie',
    unit: 'champs',
    targets: [8, 15, 24, 35, 48, 65]
  },
  {
    type: EDGE_TYPES.field,
    label: 'Champs de blé',
    unit: 'champs de blé',
    targets: [12, 24, 38, 56, 78, 105]
  }
];

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
  const progress = getBestZoneTotalsByType(placedTiles);
  progress.set(TRAIN_MISSION_TYPE, countRailTrainLines(placedTiles));
  progress.set(BOAT_MISSION_TYPE, countWaterBoats(placedTiles));
  return progress;
}

export function getGameStats(placedTiles) {
  const totals = Object.fromEntries(Object.values(EDGE_TYPES).map(type => [type, 0]));

  for (const placedTile of placedTiles.values()) {
    for (const edge of EDGE_ORDER) {
      const type = getTileEdgeType(placedTile, edge);
      if (type) totals[type] = (totals[type] ?? 0) + getEdgeValue(placedTile.tile.edges[edge]);
    }
  }

  const largestByType = getBestZoneTotalsByType(placedTiles);

  return {
    tiles: placedTiles.size,
    totals,
    largest: Object.fromEntries(Object.values(EDGE_TYPES).map(type => [type, largestByType.get(type) ?? 0])),
    trainLines: countRailTrainLines(placedTiles),
    boatCount: countWaterBoats(placedTiles)
  };
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

export const MISSION_TYPE_ICON = {
  [EDGE_TYPES.forest]: '🌲',
  [EDGE_TYPES.house]:  '🛖',
  [EDGE_TYPES.rail]:   '🛤️',
  [EDGE_TYPES.water]:  '💧',
  [EDGE_TYPES.grass]:  '🌿',
  [EDGE_TYPES.field]:  '🌾',
  train:               '🚂',
  boat:                '⛵',
};

const MISSION_TYPE_LABEL = Object.fromEntries(MISSION_TYPES.map(m => [m.type, m.label]));

export const MISSION_HELP = {
  [EDGE_TYPES.forest]: `Pose des tuiles avec des secteurs forêt 🌲.
Chaque triangle de forêt placé sur le plateau fait progresser cette mission.
Les zones denses rapportent davantage de points en fin de partie.`,
  [EDGE_TYPES.house]:  `Pose des tuiles avec des secteurs village 🛖.
Chaque triangle de maison placé fait progresser cette mission.
Les villages connectés au réseau ferré sont particulièrement rentables.`,
  [EDGE_TYPES.rail]:   `Pose des tuiles avec des rails 🛤️.
Chaque triangle de voie ferrée placé fait progresser cette mission.
Les rails seuls ne rapportent rien sans gare à chaque extrémité.`,
  [EDGE_TYPES.water]:  `Pose des tuiles avec des secteurs eau 💧.
Chaque triangle d'eau placé fait progresser cette mission.
Les grandes étendues d'eau peuvent accueillir des bateaux.`,
  [EDGE_TYPES.grass]:  `Pose des tuiles avec des secteurs prairie 🌿.
Chaque triangle de prairie placé fait progresser cette mission.
Les grandes zones contiguës de prairie rapportent un bonus de surface.`,
  [EDGE_TYPES.field]:  `Pose des tuiles avec des secteurs champ de blé 🌾.
Chaque triangle de champ placé fait progresser cette mission.
Les champs proches de villages ou de rivières donnent des bonus.`,
  train: `Relie deux gares avec des rails continus 🚂.
Chaque nouvelle ligne de train complétée fait progresser cette mission.
Plus la ligne est longue, plus le score est élevé.`,
  boat:  `Crée des étendues d'eau entourées de terres ⛵.
Un bateau apparaît automatiquement sur chaque lac fermé par des tuiles terrestres.
Chaque nouveau bateau fait progresser cette mission.`,
};

export function formatMissionLabel(mission, progressByType = new Map()) {
  const progress = Math.min(progressByType.get(mission.type) ?? 0, mission.target);
  const unit = mission.unit ? ` ${mission.unit}` : '';
  const label = MISSION_TYPE_LABEL[mission.type] ?? mission.label;
  return `${label} : ${progress}/${mission.target}${unit}`;
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

  const matchingDefinitions = availableDefinitions.filter(mission => {
    const matchTypes = mission.matchTypes ?? [mission.type];
    return matchTypes.some(type => presentTypes.has(type));
  });
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
  return collectZone(startTile, startEdge, type, placedTiles, visited, getFullTextureNeighbors);
}

function isMissionType(type) {
  return MISSION_TYPES.some(mission => mission.type === type && !mission.matchTypes);
}

function countRailTrainLines(placedTiles) {
  const railNodes = new Set();
  const adjacency = new Map();

  for (const placedTile of placedTiles.values()) {
    for (const edge of EDGE_ORDER) {
      if (getTileEdgeType(placedTile, edge) !== EDGE_TYPES.rail) continue;
      const nodeKey = makeNodeKey(placedTile.key, edge);
      railNodes.add(nodeKey);
      adjacency.set(nodeKey, adjacency.get(nodeKey) ?? new Set());
    }
  }

  for (const placedTile of placedTiles.values()) {
    const railEdges = EDGE_ORDER.filter(edge => getTileEdgeType(placedTile, edge) === EDGE_TYPES.rail);

    for (let i = 0; i < railEdges.length; i += 1) {
      for (let j = i + 1; j < railEdges.length; j += 1) {
        connectRailNodes(adjacency, makeNodeKey(placedTile.key, railEdges[i]), makeNodeKey(placedTile.key, railEdges[j]));
      }
    }

    for (const direction of HEX_DIRECTIONS) {
      const ownEdge = direction.edge;
      if (getTileEdgeType(placedTile, ownEdge) !== EDGE_TYPES.rail) continue;

      const neighborKey = makeHexKey(placedTile.q + direction.q, placedTile.r + direction.r);
      const neighborTile = placedTiles.get(neighborKey);
      if (!neighborTile) continue;

      const neighborEdge = getOppositeEdge(ownEdge);
      if (getTileEdgeType(neighborTile, neighborEdge) !== EDGE_TYPES.rail) continue;

      connectRailNodes(adjacency, makeNodeKey(placedTile.key, ownEdge), makeNodeKey(neighborTile.key ?? neighborKey, neighborEdge));
    }
  }

  const visited = new Set();
  let trainLines = 0;

  for (const nodeKey of railNodes) {
    if (visited.has(nodeKey)) continue;

    const stack = [nodeKey];
    const tileKeys = new Set();
    visited.add(nodeKey);

    while (stack.length > 0) {
      const current = stack.pop();
      tileKeys.add(current.split(':')[0]);

      for (const next of adjacency.get(current) ?? []) {
        if (visited.has(next)) continue;
        visited.add(next);
        stack.push(next);
      }
    }

    if (tileKeys.size >= 2) trainLines += 1;
  }

  return trainLines;
}

function connectRailNodes(adjacency, a, b) {
  if (!adjacency.has(a) || !adjacency.has(b) || a === b) return;
  adjacency.get(a).add(b);
  adjacency.get(b).add(a);
}

function pickRandom(items) {
  return items[Math.floor(Math.random() * items.length)];
}
