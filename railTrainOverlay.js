import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { EDGE_ORDER, EDGE_TYPES, HEX_SIZE, TILE_VISUAL } from './config.js';
import { axialToWorld, makeHexKey } from './hex.js';
import { HEX_DIRECTIONS, getOppositeEdge } from './placementRules.js';
import { getEdgeType } from './tileGenerator.js';

const SECTOR_DEFS = [
  { key: 'n', a: 0, b: 1 },
  { key: 'ne', a: 1, b: 2 },
  { key: 'se', a: 2, b: 3 },
  { key: 's', a: 3, b: 4 },
  { key: 'sw', a: 4, b: 5 },
  { key: 'nw', a: 5, b: 0 }
];

const TRAIN_Y = (TILE_VISUAL.railY ?? 0.052) + 0.025;
const TRAIN_SPEED = 0.18;
const TRAIN_CURVE_SLOW_DISTANCE = HEX_SIZE * 0.42;
const TRAIN_TERMINUS_SLOW_DISTANCE = HEX_SIZE * 0.72;
const TRAIN_SCALE = HEX_SIZE * 0.153;
const TRAIN_UNIT_SPACING = HEX_SIZE * 0.30;
const TRAIN_MIN_WAGONS = 2;
const TRAIN_MAX_WAGONS = 8;
const PORT_INSET = 0.18;
const STATION_Y = (TILE_VISUAL.railY ?? 0.052) + 0.012;
const STATION_SCALE = HEX_SIZE * 0.22;
const STATION_TRACK_CLEARANCE = HEX_SIZE * 0.25;
const STATION_TERMINUS_BACKSET = HEX_SIZE * 0.08;

const materialCache = new Map();

export function createRailTrainOverlay() {
  const group = new THREE.Group();
  group.name = 'railTrainOverlay';
  group.userData.trains = [];
  return group;
}

export function rebuildRailTrainOverlay(group, placedTiles) {
  clearGroup(group);
  group.userData.trains = [];

  const graph = buildRailGraph(placedTiles);
  const components = findComponents(graph);

  for (const component of components) {
    addRailTerminusStations(group, graph, component);

    if (component.tileKeys.size < 2) continue;

    const path = findLongestPath(graph, component.nodes);
    if (path.length < 2) continue;

    const points = path.map(nodeId => graph.nodes.get(nodeId).position.clone());
    const distance = measurePath(points);
    if (distance < HEX_SIZE * 1.05) continue;

    const wagonCount = getWagonCountForRailNetwork(component.tileKeys.size, distance);
    const trainObject = createTrainObject(wagonCount);
    trainObject.visible = true;
    group.add(trainObject);
    group.userData.trains.push({
      object: trainObject,
      points,
      distance,
      motionTrack: buildMotionTrack(points),
      offset: component.index * 0.23
    });
  }
}

export function updateRailTrainOverlay(group, timeSeconds = 0) {
  const trains = group.userData.trains ?? [];

  for (const train of trains) {
    const progress = (timeSeconds * TRAIN_SPEED / Math.max(train.distance, 0.001) + train.offset) % 1;
    updateArticulatedTrain(train.object, train.motionTrack, progress, timeSeconds + train.offset * 10);
  }
}

function buildRailGraph(placedTiles) {
  const graph = { nodes: new Map(), adjacency: new Map() };

  for (const tile of placedTiles.values()) {
    const tileKey = tile.key ?? makeHexKey(tile.q, tile.r);
    const world = axialToWorld(tile.q, tile.r);
    const centerId = getCenterNodeId(tileKey);
    const centerPosition = new THREE.Vector3(world.x, TRAIN_Y, world.z);

    addNode(graph, centerId, centerPosition, tileKey);

    for (const edge of EDGE_ORDER) {
      if (!isRailEdge(tile, edge)) continue;

      const portId = getPortNodeId(tileKey, edge);
      const portPosition = getRailPortWorldPosition(tile.q, tile.r, edge);
      addNode(graph, portId, portPosition, tileKey);
      addEdge(graph, centerId, portId);
    }
  }

  for (const tile of placedTiles.values()) {
    const tileKey = tile.key ?? makeHexKey(tile.q, tile.r);

    for (const direction of HEX_DIRECTIONS) {
      const ownEdge = direction.edge;
      if (!isRailEdge(tile, ownEdge)) continue;

      const neighborKey = makeHexKey(tile.q + direction.q, tile.r + direction.r);
      const neighbor = placedTiles.get(neighborKey);
      if (!neighbor) continue;

      const neighborEdge = getOppositeEdge(ownEdge);
      if (!isRailEdge(neighbor, neighborEdge)) continue;

      const ownPortId = getPortNodeId(tileKey, ownEdge);
      const neighborPortId = getPortNodeId(neighbor.key ?? neighborKey, neighborEdge);
      addEdge(graph, ownPortId, neighborPortId);
    }
  }

  return graph;
}

function isRailEdge(placedTile, edge) {
  return getEdgeType(placedTile?.tile?.edges?.[edge]) === EDGE_TYPES.rail;
}

function getCenterNodeId(tileKey) {
  return `${tileKey}:center`;
}

function getPortNodeId(tileKey, edge) {
  return `${tileKey}:port:${edge}`;
}

function getRailPortWorldPosition(q, r, edge) {
  const world = axialToWorld(q, r);
  const vertices = createOuterVertices();
  const sector = SECTOR_DEFS.find(item => item.key === edge);
  const mid = new THREE.Vector3(
    (vertices[sector.a].x + vertices[sector.b].x) / 2,
    0,
    (vertices[sector.a].z + vertices[sector.b].z) / 2
  ).multiplyScalar(PORT_INSET);

  return new THREE.Vector3(world.x + mid.x, TRAIN_Y, world.z + mid.z);
}

function addNode(graph, id, position, tileKey) {
  if (!graph.nodes.has(id)) {
    graph.nodes.set(id, { id, position, tileKeys: new Set([tileKey]) });
    graph.adjacency.set(id, new Set());
    return;
  }

  graph.nodes.get(id).tileKeys.add(tileKey);
}

function addEdge(graph, a, b) {
  if (a === b || !graph.nodes.has(a) || !graph.nodes.has(b)) return;
  graph.adjacency.get(a)?.add(b);
  graph.adjacency.get(b)?.add(a);
}

function findComponents(graph) {
  const visited = new Set();
  const components = [];

  for (const nodeId of graph.nodes.keys()) {
    if (visited.has(nodeId)) continue;

    const stack = [nodeId];
    const nodes = [];
    const tileKeys = new Set();
    visited.add(nodeId);

    while (stack.length > 0) {
      const current = stack.pop();
      nodes.push(current);

      for (const key of graph.nodes.get(current).tileKeys) tileKeys.add(key);

      for (const next of graph.adjacency.get(current) ?? []) {
        if (visited.has(next)) continue;
        visited.add(next);
        stack.push(next);
      }
    }

    components.push({ index: components.length, nodes, tileKeys });
  }

  return components;
}

function findLongestPath(graph, componentNodes) {
  const endpoints = componentNodes.filter(nodeId => (graph.adjacency.get(nodeId)?.size ?? 0) <= 1);
  const starts = endpoints.length >= 2 ? endpoints : componentNodes;
  let best = [];
  let bestDistance = -1;

  for (const start of starts) {
    const result = dijkstra(graph, start, componentNodes);
    for (const end of starts) {
      if (end === start) continue;
      const distance = result.distances.get(end) ?? -1;
      if (distance > bestDistance) {
        bestDistance = distance;
        best = reconstructPath(result.previous, start, end);
      }
    }
  }

  return best;
}

function dijkstra(graph, start, allowedNodes) {
  const allowed = new Set(allowedNodes);
  const unvisited = new Set(allowedNodes);
  const distances = new Map();
  const previous = new Map();

  for (const node of allowedNodes) distances.set(node, Infinity);
  distances.set(start, 0);

  while (unvisited.size > 0) {
    let current = null;
    let currentDistance = Infinity;

    for (const node of unvisited) {
      const distance = distances.get(node) ?? Infinity;
      if (distance < currentDistance) {
        current = node;
        currentDistance = distance;
      }
    }

    if (!current || currentDistance === Infinity) break;
    unvisited.delete(current);

    for (const next of graph.adjacency.get(current) ?? []) {
      if (!allowed.has(next) || !unvisited.has(next)) continue;

      const candidate = currentDistance + graph.nodes.get(current).position.distanceTo(graph.nodes.get(next).position);
      if (candidate < (distances.get(next) ?? Infinity)) {
        distances.set(next, candidate);
        previous.set(next, current);
      }
    }
  }

  return { distances, previous };
}

function reconstructPath(previous, start, end) {
  const path = [end];
  let current = end;

  while (current !== start) {
    current = previous.get(current);
    if (!current) return [];
    path.push(current);
  }

  return path.reverse();
}


function addRailTerminusStations(group, graph, component) {
  const terminalPorts = component.nodes
    .filter(nodeId => nodeId.includes(':port:') && (graph.adjacency.get(nodeId)?.size ?? 0) <= 1)
    .slice(0, 8);

  for (const nodeId of terminalPorts) {
    const node = graph.nodes.get(nodeId);
    if (!node) continue;

    const centerId = nodeId.replace(/:port:[^:]+$/, ':center');
    const center = graph.nodes.get(centerId)?.position ?? new THREE.Vector3(0, STATION_Y, 0);
    const outward = node.position.clone().sub(center);
    if (outward.lengthSq() < 0.0001) outward.set(1, 0, 0);
    outward.y = 0;
    outward.normalize();

    const station = createRailStationObject(nodeId);
    const side = new THREE.Vector3(-outward.z, 0, outward.x).normalize();
    const sideSign = hashUnit(`${nodeId}:station-side`) > 0.5 ? 1 : -1;

    station.position.copy(node.position)
      .add(outward.clone().multiplyScalar(-STATION_TERMINUS_BACKSET))
      .add(side.multiplyScalar(STATION_TRACK_CLEARANCE * sideSign));
    station.position.y = STATION_Y;
    station.rotation.y = Math.atan2(outward.x, outward.z) + (sideSign < 0 ? Math.PI : 0);
    group.add(station);
  }
}

function createRailStationObject(seedKey = 'station') {
  const group = new THREE.Group();
  group.name = 'rail-terminus-station-svg-style';

  const baseMat = getMaterial('station-stone-platform', 0xB7A78A, 1);
  const edgeMat = getMaterial('station-platform-edge', 0x6E6254, 1);
  const wallMat = getMaterial('station-warm-walls', 0xE2C98F, 1);
  const roofMat = getMaterial('station-red-roof', 0xA9462F, 1);
  const timberMat = getMaterial('station-dark-timber', 0x4A2D1F, 1);
  const glassMat = getMaterial('station-blue-glass', 0xA8DCF0, 0.94);
  const signMat = getMaterial('station-sign-cream', 0xF7E7B2, 1);

  addStationBox(group, 'station-platform', -0.03, 0.045, 0, 1.66, 0.09, 0.96, baseMat, 34);
  addStationBox(group, 'station-platform-left-edge', -0.03, 0.102, -0.50, 1.72, 0.055, 0.055, edgeMat, 35);
  addStationBox(group, 'station-platform-right-edge', -0.03, 0.102, 0.50, 1.72, 0.055, 0.055, edgeMat, 35);

  addStationBox(group, 'station-main-hall', -0.18, 0.38, 0, 0.72, 0.56, 0.58, wallMat, 42);
  addStationBox(group, 'station-side-room', 0.36, 0.31, 0, 0.42, 0.42, 0.48, wallMat, 41);
  addStationBox(group, 'station-tower', -0.62, 0.50, 0, 0.30, 0.80, 0.34, wallMat, 43);

  addStationBox(group, 'station-main-roof', -0.18, 0.72, 0, 0.86, 0.14, 0.74, roofMat, 46);
  addStationBox(group, 'station-main-roof-ridge', -0.18, 0.82, 0, 0.64, 0.06, 0.54, timberMat, 47);
  addStationBox(group, 'station-side-roof', 0.36, 0.57, 0, 0.52, 0.12, 0.62, roofMat, 45);
  addStationBox(group, 'station-tower-roof', -0.62, 0.96, 0, 0.44, 0.16, 0.48, roofMat, 48);

  addStationBox(group, 'station-door', -0.18, 0.25, -0.302, 0.18, 0.30, 0.018, timberMat, 52);
  addStationBox(group, 'station-window-a', -0.42, 0.43, -0.304, 0.14, 0.16, 0.014, glassMat, 53);
  addStationBox(group, 'station-window-b', 0.08, 0.43, -0.304, 0.14, 0.16, 0.014, glassMat, 53);
  addStationBox(group, 'station-window-c', 0.36, 0.33, -0.254, 0.13, 0.14, 0.014, glassMat, 53);
  addStationBox(group, 'station-clock-face', -0.62, 0.72, -0.182, 0.18, 0.18, 0.014, signMat, 54);
  addStationBox(group, 'station-sign', -0.18, 0.58, -0.316, 0.44, 0.12, 0.018, signMat, 55);

  for (const x of [-0.78, -0.36, 0.04, 0.44]) {
    addStationBox(group, 'station-lamp-post', x, 0.31, -0.42, 0.035, 0.42, 0.035, timberMat, 56);
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(STATION_SCALE * 0.055, 12, 8),
      getMaterial('station-lamp-warm', 0xFFE6A0, 1)
    );
    lamp.position.set(STATION_SCALE * x, STATION_SCALE * 0.55, STATION_SCALE * -0.42);
    lamp.renderOrder = 57;
    group.add(lamp);
  }

  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(STATION_SCALE * 0.18, STATION_SCALE * 0.11),
    getMaterial('station-small-flag', hashUnit(`${seedKey}:flag`) > 0.5 ? 0xD45D45 : 0x5B8CC0, 0.96)
  );
  flag.position.set(STATION_SCALE * -0.55, STATION_SCALE * 1.10, STATION_SCALE * -0.01);
  flag.rotation.y = Math.PI / 2;
  flag.renderOrder = 58;
  group.add(flag);

  return group;
}

function addStationBox(group, name, x, y, z, width, height, depth, material, renderOrder) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(STATION_SCALE * width, STATION_SCALE * height, STATION_SCALE * depth),
    material
  );
  mesh.name = name;
  mesh.position.set(STATION_SCALE * x, STATION_SCALE * y, STATION_SCALE * z);
  mesh.renderOrder = renderOrder;
  group.add(mesh);
  return mesh;
}

function hashUnit(text) {
  let h = 2166136261;
  for (let i = 0; i < String(text).length; i += 1) {
    h ^= String(text).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

function getWagonCountForRailNetwork(tileCount, distance) {
  const byTiles = Math.floor(Math.max(0, tileCount - 2) / 2) + TRAIN_MIN_WAGONS;
  const byDistance = Math.floor(Math.max(0, distance - HEX_SIZE * 1.5) / (HEX_SIZE * 1.25)) + TRAIN_MIN_WAGONS;
  return Math.max(TRAIN_MIN_WAGONS, Math.min(TRAIN_MAX_WAGONS, Math.max(byTiles, byDistance)));
}

function createTrainObject(wagonCount = TRAIN_MIN_WAGONS) {
  const group = new THREE.Group();
  group.name = 'animatedRailTrainArticulated';

  const units = [];
  const couplers = [];

  const loco = new THREE.Group();
  loco.name = 'train-locomotive-independent';
  addLocomotive(loco, 0);
  group.add(loco);
  units.push({ object: loco, followDistance: 0, type: 'locomotive' });

  const wagonPalettes = [
    { body: 0x4F6D7A, roof: 0xE9C46A, cargo: 'coal' },
    { body: 0x8F5E3C, roof: 0xF4A261, cargo: 'freight' },
    { body: 0x5B7C48, roof: 0xD9B56A, cargo: 'freight' },
    { body: 0x6B5B95, roof: 0xC8B6E2, cargo: 'mail' },
    { body: 0xA24936, roof: 0xE9C46A, cargo: 'freight' },
    { body: 0x386F8F, roof: 0xA8DADC, cargo: 'mail' },
    { body: 0x71543A, roof: 0xD6A541, cargo: 'coal' },
    { body: 0x495867, roof: 0xF2CC8F, cargo: 'freight' }
  ];

  for (let i = 0; i < wagonCount; i += 1) {
    const palette = wagonPalettes[i % wagonPalettes.length];
    const wagon = new THREE.Group();
    wagon.name = `train-wagon-${i + 1}-independent`;
    addWagon(wagon, 0, palette.body, palette.roof, palette.cargo);
    group.add(wagon);
    units.push({
      object: wagon,
      followDistance: TRAIN_UNIT_SPACING * (i + 1),
      type: 'wagon'
    });

    const coupler = new THREE.Group();
    coupler.name = `train-coupler-${i + 1}-articulated`;
    addCoupler(coupler, 0);
    group.add(coupler);
    couplers.push({ object: coupler, frontIndex: i, rearIndex: i + 1 });
  }

  const smokePuffs = [];
  const smokeMaterial = new THREE.MeshBasicMaterial({
    color: 0xEEF4F7,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide
  });

  for (let i = 0; i < 64; i += 1) {
    const smoke = new THREE.Mesh(
      new THREE.CircleGeometry(TRAIN_SCALE * (0.13 + (i % 5) * 0.035), 20),
      smokeMaterial.clone()
    );
    smoke.name = 'chimney-slow-animated-smoke';
    smoke.rotation.x = -Math.PI / 2;
    smoke.renderOrder = 60 + i;
    loco.add(smoke);
    smokePuffs.push({
      mesh: smoke,
      phase: i / 64,
      drift: (i % 2 === 0 ? 1 : -1) * (0.035 + (i % 5) * 0.014),
      wobble: 0.48 + (i % 5) * 0.13
    });
  }

  loco.userData.smokePuffs = smokePuffs;
  group.userData.units = units;
  group.userData.couplers = couplers;
  group.userData.loco = loco;
  return group;
}

function updateArticulatedTrain(trainObject, motionTrack, progress, timeSeconds) {
  const units = trainObject.userData.units ?? [];
  if (units.length === 0) return;

  for (const unit of units) {
    const sample = samplePingPongMotionTrack(motionTrack, progress, unit.followDistance);
    unit.object.position.copy(sample.position);
    unit.object.position.y = TRAIN_Y;
    unit.object.rotation.y = -Math.atan2(sample.tangent.z, sample.tangent.x);

    const pulse = 1 + Math.sin(timeSeconds * 2.3 + unit.followDistance * 2.1) * 0.006;
    unit.object.scale.setScalar(pulse);
  }

  for (const coupler of trainObject.userData.couplers ?? []) {
    const front = units[coupler.frontIndex]?.object;
    const rear = units[coupler.rearIndex]?.object;
    if (!front || !rear) continue;

    const middle = front.position.clone().lerp(rear.position, 0.5);
    const direction = front.position.clone().sub(rear.position);
    coupler.object.position.copy(middle);
    coupler.object.position.y = TRAIN_Y + TRAIN_SCALE * 0.22;
    coupler.object.rotation.y = -Math.atan2(direction.z, direction.x);
    coupler.object.visible = direction.length() > 0.001;
  }

  updateTrainSmoke(trainObject.userData.loco, timeSeconds);
}

function addLocomotive(group, xOffset) {
  addBox(group, 'loco-frame', xOffset + 0.12, 0.13, 0, 1.72, 0.20, 0.72, 0x232A30, 50);
  addBox(group, 'loco-side-left', xOffset + 0.10, 0.29, -0.39, 1.62, 0.22, 0.055, 0x1B2025, 55);
  addBox(group, 'loco-side-right', xOffset + 0.10, 0.29, 0.39, 1.62, 0.22, 0.055, 0x1B2025, 55);

  const boiler = new THREE.Mesh(
    new THREE.CylinderGeometry(TRAIN_SCALE * 0.27, TRAIN_SCALE * 0.27, TRAIN_SCALE * 1.02, 24),
    getMaterial('loco-boiler', 0xB8322A, 1)
  );
  boiler.rotation.z = Math.PI / 2;
  boiler.position.set(TRAIN_SCALE * (xOffset + 0.38), TRAIN_SCALE * 0.58, 0);
  boiler.renderOrder = 56;
  group.add(boiler);

  const boilerBandXs = [-0.02, 0.34, 0.70];
  for (const bandX of boilerBandXs) {
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(TRAIN_SCALE * 0.285, TRAIN_SCALE * 0.285, TRAIN_SCALE * 0.045, 24),
      getMaterial('brass-bands', 0xD6A541, 1)
    );
    band.rotation.z = Math.PI / 2;
    band.position.set(TRAIN_SCALE * (xOffset + bandX), TRAIN_SCALE * 0.58, 0);
    band.renderOrder = 57;
    group.add(band);
  }

  const boilerFront = new THREE.Mesh(
    new THREE.CylinderGeometry(TRAIN_SCALE * 0.30, TRAIN_SCALE * 0.30, TRAIN_SCALE * 0.075, 24),
    getMaterial('boiler-front', 0x2B3035, 1)
  );
  boilerFront.rotation.z = Math.PI / 2;
  boilerFront.position.set(TRAIN_SCALE * (xOffset + 0.93), TRAIN_SCALE * 0.58, 0);
  boilerFront.renderOrder = 58;
  group.add(boilerFront);

  addBox(group, 'cabin-body', xOffset - 0.62, 0.63, 0, 0.58, 0.72, 0.76, 0xC84B31, 58);
  addBox(group, 'cabin-back', xOffset - 0.92, 0.54, 0, 0.10, 0.54, 0.70, 0x7F2D2A, 59);
  addBox(group, 'cabin-roof', xOffset - 0.62, 1.05, 0, 0.74, 0.14, 0.90, 0x15191E, 60);
  addBox(group, 'cabin-roof-cap', xOffset - 0.62, 1.16, 0, 0.56, 0.08, 0.78, 0x333A40, 61);

  for (const z of [-0.405, 0.405]) {
    addSideWindow(group, xOffset - 0.62, 0.70, z, 0.26, 0.26);
    addSideWindow(group, xOffset - 0.82, 0.70, z, 0.16, 0.22);
  }

  const chimney = new THREE.Mesh(
    new THREE.CylinderGeometry(TRAIN_SCALE * 0.105, TRAIN_SCALE * 0.155, TRAIN_SCALE * 0.48, 18),
    getMaterial('chimney', 0x111419, 1)
  );
  chimney.position.set(TRAIN_SCALE * (xOffset + 0.62), TRAIN_SCALE * 0.98, 0);
  chimney.renderOrder = 62;
  group.add(chimney);

  const chimneyLip = new THREE.Mesh(
    new THREE.CylinderGeometry(TRAIN_SCALE * 0.17, TRAIN_SCALE * 0.17, TRAIN_SCALE * 0.07, 18),
    getMaterial('chimney-lip', 0x20252B, 1)
  );
  chimneyLip.position.set(TRAIN_SCALE * (xOffset + 0.62), TRAIN_SCALE * 1.24, 0);
  chimneyLip.renderOrder = 63;
  group.add(chimneyLip);

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(TRAIN_SCALE * 0.17, 18, 10),
    getMaterial('steam-dome', 0xD6A541, 1)
  );
  dome.scale.y = 0.75;
  dome.position.set(TRAIN_SCALE * (xOffset + 0.12), TRAIN_SCALE * 0.91, 0);
  dome.renderOrder = 62;
  group.add(dome);

  const headLamp = new THREE.Mesh(
    new THREE.SphereGeometry(TRAIN_SCALE * 0.105, 16, 10),
    getMaterial('head-lamp', 0xFFF1A8, 1)
  );
  headLamp.position.set(TRAIN_SCALE * (xOffset + 1.03), TRAIN_SCALE * 0.61, 0);
  headLamp.renderOrder = 64;
  group.add(headLamp);

  const cowcatcher = new THREE.Mesh(
    new THREE.ConeGeometry(TRAIN_SCALE * 0.28, TRAIN_SCALE * 0.30, 4),
    getMaterial('cowcatcher', 0x394149, 1)
  );
  cowcatcher.rotation.z = -Math.PI / 2;
  cowcatcher.rotation.y = Math.PI / 4;
  cowcatcher.position.set(TRAIN_SCALE * (xOffset + 1.20), TRAIN_SCALE * 0.19, 0);
  cowcatcher.renderOrder = 57;
  group.add(cowcatcher);

  addWheelSet(group, xOffset - 0.72, 0.17, 0.40);
  addWheelSet(group, xOffset - 0.22, 0.16, 0.40);
  addWheelSet(group, xOffset + 0.36, 0.18, 0.40);
  addWheelSet(group, xOffset + 0.76, 0.14, 0.40);
  addBox(group, 'drive-rod-left', xOffset + 0.05, 0.18, -0.47, 1.38, 0.035, 0.035, 0xC8CED3, 66);
  addBox(group, 'drive-rod-right', xOffset + 0.05, 0.18, 0.47, 1.38, 0.035, 0.035, 0xC8CED3, 66);
}

function addWagon(group, xOffset, bodyColor, roofColor, cargoType) {
  addBox(group, 'wagon-base', xOffset, 0.14, 0, 0.98, 0.17, 0.70, 0x22282E, 50);
  addBox(group, 'wagon-body', xOffset, 0.43, 0, 0.92, 0.48, 0.68, bodyColor, 55);
  addBox(group, 'wagon-roof', xOffset, 0.75, 0, 1.02, 0.13, 0.78, roofColor, 56);
  addBox(group, 'wagon-ridge', xOffset, 0.85, 0, 0.82, 0.06, 0.56, 0x252B31, 57);

  for (const z of [-0.36, 0.36]) {
    addSideWindow(group, xOffset - 0.24, 0.48, z, 0.18, 0.20);
    addSideWindow(group, xOffset + 0.08, 0.48, z, 0.18, 0.20);
    addSideWindow(group, xOffset + 0.36, 0.48, z, 0.14, 0.18);
  }

  if (cargoType === 'coal') {
    for (const cx of [-0.30, -0.10, 0.12, 0.32]) {
      const coal = new THREE.Mesh(
        new THREE.DodecahedronGeometry(TRAIN_SCALE * 0.10, 0),
        getMaterial('coal', 0x111111, 1)
      );
      coal.position.set(TRAIN_SCALE * (xOffset + cx), TRAIN_SCALE * 0.82, TRAIN_SCALE * (cx % 0.2));
      coal.renderOrder = 60;
      group.add(coal);
    }
  } else {
    addBox(group, 'wagon-crate-a', xOffset - 0.22, 0.83, -0.13, 0.26, 0.18, 0.22, 0xB8753B, 60);
    addBox(group, 'wagon-crate-b', xOffset + 0.15, 0.83, 0.13, 0.30, 0.18, 0.22, 0x9C6534, 60);
  }

  addWheelSet(group, xOffset - 0.32, 0.125, 0.37);
  addWheelSet(group, xOffset + 0.32, 0.125, 0.37);
}

function addCoupler(group, x) {
  addBox(group, 'coupler', x, 0.22, 0, 0.38, 0.055, 0.10, 0x15191E, 64);
}

function addWheelSet(group, x, radius, z) {
  for (const side of [-1, 1]) {
    const wheel = new THREE.Mesh(
      new THREE.CylinderGeometry(TRAIN_SCALE * radius, TRAIN_SCALE * radius, TRAIN_SCALE * 0.095, 20),
      getMaterial('wheel', 0x0C0E11, 1)
    );
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(TRAIN_SCALE * x, TRAIN_SCALE * 0.055, TRAIN_SCALE * z * side);
    wheel.renderOrder = 67;
    group.add(wheel);

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(TRAIN_SCALE * radius * 0.82, TRAIN_SCALE * radius * 0.12, 8, 20),
      getMaterial('wheel-rim', 0x5E6872, 1)
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.copy(wheel.position);
    rim.renderOrder = 68;
    group.add(rim);

    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(TRAIN_SCALE * radius * 0.34, TRAIN_SCALE * radius * 0.34, TRAIN_SCALE * 0.105, 14),
      getMaterial('wheel-hub', 0xD8DEE9, 1)
    );
    hub.rotation.x = Math.PI / 2;
    hub.position.copy(wheel.position);
    hub.renderOrder = 69;
    group.add(hub);
  }
}

function addBox(group, name, x, y, z, width, height, depth, color, renderOrder) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(TRAIN_SCALE * width, TRAIN_SCALE * height, TRAIN_SCALE * depth),
    getMaterial(name, color, 1)
  );
  mesh.position.set(TRAIN_SCALE * x, TRAIN_SCALE * y, TRAIN_SCALE * z);
  mesh.renderOrder = renderOrder;
  group.add(mesh);
  return mesh;
}

function addSideWindow(group, x, y, z, width, height) {
  const window = new THREE.Mesh(
    new THREE.PlaneGeometry(TRAIN_SCALE * width, TRAIN_SCALE * height),
    getMaterial('window', 0x9BE7FF, 0.94)
  );
  window.rotation.y = z < 0 ? Math.PI / 2 : -Math.PI / 2;
  window.position.set(TRAIN_SCALE * x, TRAIN_SCALE * y, TRAIN_SCALE * z);
  window.renderOrder = 70;
  group.add(window);
}

function updateTrainSmoke(trainObject, timeSeconds) {
  const smokePuffs = trainObject.userData.smokePuffs ?? [];

  for (let i = 0; i < smokePuffs.length; i += 1) {
    const puff = smokePuffs[i];
    const t = (timeSeconds * 0.34 + puff.phase) % 1;
    const rise = smoothstep(0, 1, t);
    const spread = 0.85 + rise * 5.8;
    const sideWobble = Math.sin(timeSeconds * (0.72 + puff.wobble * 0.45) + i * 1.83) * TRAIN_SCALE * 0.16;

    puff.mesh.position.set(
      TRAIN_SCALE * (0.80 - rise * 1.15),
      TRAIN_SCALE * (1.16 + rise * 10.5),
      TRAIN_SCALE * (puff.drift + Math.sin(t * Math.PI * 2 + i) * 0.34) + sideWobble
    );

    const scale = spread * (0.96 + Math.sin(timeSeconds * 1.65 + i) * 0.07);
    puff.mesh.scale.set(scale, scale, scale);
    puff.mesh.material.opacity = Math.max(0, (1 - rise) * 0.88);
    puff.mesh.visible = puff.mesh.material.opacity > 0.025;
  }
}

function getMaterial(name, color, opacity) {
  const key = `${name}:${color}:${opacity}`;
  if (materialCache.has(key)) return materialCache.get(key);

  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity >= 1,
    depthTest: true
  });

  materialCache.set(key, material);
  return material;
}

function samplePingPongMotionTrack(track, progress, followDistance = 0) {
  if (!track || track.samples.length === 0) {
    return { position: new THREE.Vector3(), tangent: new THREE.Vector3(1, 0, 0) };
  }

  if (track.samples.length === 1 || track.totalMotion <= 0) {
    return {
      position: track.samples[0].position.clone(),
      tangent: track.samples[0].tangent.clone()
    };
  }

  const pingPong = Math.floor(progress * 2) % 2 === 1;
  const halfProgress = (progress * 2) % 1;
  let targetMotion = easeInOutSine(halfProgress) * track.totalMotion;
  targetMotion = pingPong ? track.totalMotion - targetMotion + followDistance : targetMotion - followDistance;
  targetMotion = Math.max(0, Math.min(track.totalMotion, targetMotion));

  const sample = sampleMotionTrackAt(track, targetMotion);
  if (pingPong) sample.tangent.multiplyScalar(-1);
  return sample;
}

function buildMotionTrack(points) {
  const samples = [];
  const pathDistance = measurePath(points);

  if (!points || points.length === 0) {
    return { samples, totalMotion: 0, pathDistance: 0 };
  }

  if (points.length === 1 || pathDistance <= 0) {
    samples.push({
      position: points[0].clone(),
      tangent: new THREE.Vector3(1, 0, 0),
      motion: 0,
      physical: 0
    });
    return { samples, totalMotion: 0, pathDistance: 0 };
  }

  let totalMotion = 0;
  let physical = 0;

  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i];
    const to = points[i + 1];
    const segmentVector = to.clone().sub(from);
    const segmentDistance = segmentVector.length();
    if (segmentDistance <= 0) continue;

    const tangent = segmentVector.clone().normalize();
    const steps = Math.max(8, Math.ceil(segmentDistance / (HEX_SIZE * 0.07)));

    for (let step = 0; step <= steps; step++) {
      if (i > 0 && step === 0) continue;

      const t = step / steps;
      const position = from.clone().lerp(to, t);
      const previousPosition = samples[samples.length - 1]?.position;

      if (previousPosition) {
        const delta = previousPosition.distanceTo(position);
        const speedFactor = getLocalTrainSpeedFactor(points, i, t, physical + delta, pathDistance);
        totalMotion += delta / Math.max(speedFactor, 0.18);
        physical += delta;
      }

      samples.push({
        position,
        tangent: getSmoothedTangent(points, i, t, tangent),
        motion: totalMotion,
        physical
      });
    }
  }

  return { samples, totalMotion, pathDistance };
}

function sampleMotionTrackAt(track, targetMotion) {
  const samples = track.samples;
  const clampedMotion = Math.max(0, Math.min(targetMotion, track.totalMotion));

  for (let i = 0; i < samples.length - 1; i++) {
    const current = samples[i];
    const next = samples[i + 1];
    if (clampedMotion > next.motion) continue;

    const span = next.motion - current.motion;
    const t = span <= 0 ? 0 : (clampedMotion - current.motion) / span;
    const position = current.position.clone().lerp(next.position, t);
    const tangent = current.tangent.clone().lerp(next.tangent, t).normalize();
    return { position, tangent };
  }

  const last = samples[samples.length - 1];
  return { position: last.position.clone(), tangent: last.tangent.clone() };
}

function getLocalTrainSpeedFactor(points, segmentIndex, t, physicalDistance, pathDistance) {
  let speed = 1;

  const distanceFromStart = physicalDistance;
  const distanceFromEnd = pathDistance - physicalDistance;
  speed = Math.min(speed, lerp(0.24, 1, smoothstep(0, TRAIN_TERMINUS_SLOW_DISTANCE, distanceFromStart)));
  speed = Math.min(speed, lerp(0.24, 1, smoothstep(0, TRAIN_TERMINUS_SLOW_DISTANCE, distanceFromEnd)));

  const previousTurn = getTurnStrength(points, segmentIndex);
  if (previousTurn > 0) {
    const distanceFromPreviousCorner = t * points[segmentIndex].distanceTo(points[segmentIndex + 1]);
    const cornerInfluence = 1 - smoothstep(0, TRAIN_CURVE_SLOW_DISTANCE, distanceFromPreviousCorner);
    speed = Math.min(speed, lerp(1, 0.42, cornerInfluence * previousTurn));
  }

  const nextTurn = getTurnStrength(points, segmentIndex + 1);
  if (nextTurn > 0) {
    const distanceFromNextCorner = (1 - t) * points[segmentIndex].distanceTo(points[segmentIndex + 1]);
    const cornerInfluence = 1 - smoothstep(0, TRAIN_CURVE_SLOW_DISTANCE, distanceFromNextCorner);
    speed = Math.min(speed, lerp(1, 0.42, cornerInfluence * nextTurn));
  }

  return speed;
}

function getTurnStrength(points, pointIndex) {
  if (pointIndex <= 0 || pointIndex >= points.length - 1) return 0;

  const before = points[pointIndex].clone().sub(points[pointIndex - 1]).normalize();
  const after = points[pointIndex + 1].clone().sub(points[pointIndex]).normalize();
  const dot = Math.max(-1, Math.min(1, before.dot(after)));
  const angle = Math.acos(dot);
  return smoothstep(0.18, Math.PI * 0.78, angle);
}

function getSmoothedTangent(points, segmentIndex, t, fallbackTangent) {
  const current = fallbackTangent.clone();

  if (t < 0.38 && segmentIndex > 0) {
    const previous = points[segmentIndex].clone().sub(points[segmentIndex - 1]).normalize();
    const blend = 1 - smoothstep(0, 0.38, t);
    return previous.lerp(current, 1 - blend * 0.45).normalize();
  }

  if (t > 0.62 && segmentIndex < points.length - 2) {
    const next = points[segmentIndex + 2].clone().sub(points[segmentIndex + 1]).normalize();
    const blend = smoothstep(0.62, 1, t);
    return current.lerp(next, blend * 0.45).normalize();
  }

  return current;
}

function easeInOutSine(t) {
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

function smoothstep(edge0, edge1, value) {
  const t = Math.max(0, Math.min(1, (value - edge0) / Math.max(edge1 - edge0, 0.0001)));
  return t * t * (3 - 2 * t);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function measurePath(points) {
  let distance = 0;
  for (let i = 0; i < points.length - 1; i++) distance += points[i].distanceTo(points[i + 1]);
  return distance;
}

function createOuterVertices(radius = HEX_SIZE) {
  const vertices = [];

  for (let i = 0; i < EDGE_ORDER.length; i++) {
    const angle = (Math.PI / 3) * i;
    vertices.push({
      x: Math.cos(angle) * radius,
      z: Math.sin(angle) * radius
    });
  }

  return vertices;
}

function clearGroup(group) {
  for (const child of [...group.children]) {
    group.remove(child);
    child.traverse?.(object => {
      object.geometry?.dispose?.();
      if (object.material && !materialCacheHasMaterial(object.material)) object.material.dispose?.();
    });
  }
}

function materialCacheHasMaterial(material) {
  for (const cachedMaterial of materialCache.values()) {
    if (cachedMaterial === material) return true;
  }
  return false;
}
