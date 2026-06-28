import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { createGLTFLoader } from './glbLoader.js';
import { EDGE_ORDER, EDGE_TYPES, HEX_SIZE, TILE_VISUAL, SECTOR_DEFS, LOD_TRAIN_CULL_DISTANCE } from './config.js';
import { hashUnit10k as hashUnit } from './hashUtils.js';
import { createOuterVertices } from './hexGeometry.js';
import { axialToWorld, makeHexKey } from './hex.js';
import { HEX_DIRECTIONS, getOppositeEdge } from './placementRules.js';
import { getEdgeType } from './tileGenerator.js';
import { getTrainRailY } from './terrainHeight.js';

const TRAIN_Y = (TILE_VISUAL.railY ?? -0.043) - 0.050; // centre train = sous la surface du rail
const TRAIN_SPEED = 0.18;
const TRAIN_CURVE_SLOW_DISTANCE = HEX_SIZE * 0.30;
const TRAIN_ROTATION_SMOOTHING = 0.085;
const TRAIN_TERMINUS_SLOW_DISTANCE = HEX_SIZE * 0.72;
const TRAIN_VISUAL_SCALE = 0.75;
const TRAIN_SIZE_SCALE = 0.672 * 0.88 * 1.06 * 1.13 * 0.92;           // −40% +12% −12% +6% +13% −8% taille trains/wagons
const TRAIN_SCALE = HEX_SIZE * 0.153 * TRAIN_VISUAL_SCALE * TRAIN_SIZE_SCALE;
const TRAIN_UNIT_SPACING = HEX_SIZE * 0.30 * TRAIN_VISUAL_SCALE * TRAIN_SIZE_SCALE;
// Interprétation de wagonCount dans createTrainObject :
//   0 = locomotive seule
//   1 = loco + wagon ravitaillement (wagon1)
//   2–7 = loco + ravitaillement + 1–6 wagons voyageurs (wagon2)
const TRAIN_MAX_WAGONS = 7; // 1 supply + 6 voyageurs max
const PORT_SCALE = 1.002;
const TRACK_HUB_RADIUS = HEX_SIZE * 0.185;
const TRACK_MIN_CURVE_RADIUS = HEX_SIZE * 0.34;
const MOTION_SAMPLE_SPACING = HEX_SIZE * 0.045;
const MOTION_SMOOTH_PASSES = 3;
const STATION_Y = (TILE_VISUAL.railY ?? 0.052) - 0.060;
const STATION_TARGET_LENGTH = HEX_SIZE * 0.43 * 0.80 * 0.96 * 0.93 * 0.90 * 0.94; // −20% −4% −7% −10% −6%
const STATION_TRACK_CLEARANCE = HEX_SIZE * 0.32;
const STATION_TERMINUS_BACKSET = HEX_SIZE * 0.08;
const STATION_MODEL_DEFS = [
  { key: 'gare-eglise-station', url: './glb/batiments/medieval/gare-eglise.glb', weight: 1 }
];

const materialCache = new Map();
const stationGlbLibrary = new Map();
let stationModelsLoading = false;
let stationModelsRequested = false;

// ── train.glb — loco + wagon1 (ravitaillement) + wagon2 (voyageur) ──
const WOODEN_TRAIN_URL = './glb/trains/train.glb';
let woodenTrainLib     = null;   // { loco, wagon1, wagon2 } — prototypes normalisés
let woodenTrainReady   = false;
let woodenTrainLoading = false;

// ── rails.glb — portion de rail droite à répliquer sur le chemin ──
const TRAIN_TRACK_URL = './glb/trains/rails.glb';
let trackGlbProto     = null;   // THREE.Group prototype clonable, orienté +Z
let trackGlbLength    = 0;      // longueur en world-units d'un segment de rail
let trackGlbReady     = false;
let trackGlbLoading   = false;

// ─── Position cheminée locomotive pour le pass fumée volumétrique ─────────────

/**
 * Retourne les positions monde (THREE.Vector3) des cheminées de chaque
 * locomotive active. À passer à updateSmokeVolumePass() chaque frame.
 * Appelé APRÈS updateRailTrainOverlay() pour que les positions soient à jour.
 */
export function getTrainLocoPositions(group) {
  const positions = [];
  for (const train of (group.userData.trains ?? [])) {
    if (!train.object.visible) continue;
    const units = train.object.userData.units ?? [];
    if (units.length === 0 || !units[0].object) continue;
    const loco = units[0].object;
    // Sommet de la cheminée = position loco + offset vertical (~1.16× TRAIN_SCALE)
    positions.push(new THREE.Vector3(
      loco.position.x,
      loco.position.y + TRAIN_SCALE * 1.16,
      loco.position.z
    ));
  }
  return positions;
}

export function createRailTrainOverlay() {
  const group = new THREE.Group();
  group.name = 'rail-train-overlay';
  group.userData.trains = [];
  ensureStationGlbModels(group);
  ensureWoodenTrainGlb(group);
  ensureTrackGlb(group);
  return group;
}

export function rebuildRailTrainOverlay(group, placedTiles) {
  group.userData.lastPlacedTiles = placedTiles;
  const _rT0 = performance.now();
  clearGroup(group);
  group.userData.trains = [];
  group.userData.stations = [];
  const _rT1 = performance.now();

  if (stationGlbLibrary.size < 1) ensureStationGlbModels(group);

  const graph = buildRailGraph(placedTiles);
  const _rT2 = performance.now();
  const components = findComponents(graph);
  const _rT3 = performance.now();

  // Chemins lisses collectés pour les rails GLB → même chemin que les trains (alignement parfait)
  const smoothPaths = [];

  for (const component of components) {
    addRailTerminusStations(group, graph, component);

    const path = findLongestPath(graph, component.nodes);
    if (path.length < 2) continue;

    const graphPoints = path.map(nodeId => graph.nodes.get(nodeId).position.clone());
    const points = smoothRailMotionPath(graphPoints);
    const distance = measurePath(points);
    if (distance < HEX_SIZE * 0.30) continue; // seuil minimal pour rails GLB (< 1 tuile suffit)

    smoothPaths.push(points); // rails GLB pour tous les composants, y compris tuile isolée

    // Train uniquement si le réseau couvre ≥ 2 tuiles et la distance est suffisante
    if (component.tileKeys.size < 2 || distance < HEX_SIZE * 1.05) continue;

    const wagonCount = getWagonCountForRailNetwork(component.tileKeys.size, distance);
    const trainObject = createTrainObject(wagonCount);
    trainObject.visible = true;
    group.add(trainObject);
    const trackCenter = new THREE.Vector3();
    for (const p of points) trackCenter.add(p);
    trackCenter.divideScalar(Math.max(1, points.length));
    group.userData.trains.push({
      object: trainObject,
      points,
      distance,
      motionTrack: buildMotionTrack(points),
      offset: component.index * 0.23,
      trackCenter
    });
  }
  const _rT4 = performance.now();

  // Rails GLB : même chemin lisse que les trains → rails et trains parfaitement alignés
  if (trackGlbReady && trackGlbProto && trackGlbLength > 0) {
    const railGroup = new THREE.Group();
    railGroup.name = 'rail-glb-instances';
    let totalRailInstances = 0;
    for (const pts of smoothPaths) {
      totalRailInstances += addTrackGLBToGroup(railGroup, pts, false);
    }
    group.add(railGroup);
    console.debug(`[track-glb] ${totalRailInstances} instances (smooth path)`);
  }

  const _rT5 = performance.now();
  console.log(`[FREEZE-DIAG rail-phases] clear=${(_rT1-_rT0).toFixed(0)}ms | graph=${(_rT2-_rT1).toFixed(0)}ms | components=${(_rT3-_rT2).toFixed(0)}ms | trains=${(_rT4-_rT3).toFixed(0)}ms | rails-glb=${(_rT5-_rT4).toFixed(0)}ms | TOTAL=${(_rT5-_rT0).toFixed(0)}ms`);
}

export function updateRailTrainOverlay(group, timeSeconds = 0) {
  const trains = group.userData.trains ?? [];

  for (const train of trains) {
    if (!train.object.visible) continue;
    const progress = (timeSeconds * TRAIN_SPEED / Math.max(train.distance, 0.001) + train.offset) % 1;
    updateArticulatedTrain(train.object, train.motionTrack, progress, timeSeconds + train.offset * 10);
  }
}

export function updateRailTrainLOD(group, camera, lodFactor = 1.0) {
  const eff = LOD_TRAIN_CULL_DISTANCE * lodFactor;
  const distSq = eff * eff;
  for (const train of (group.userData.trains ?? [])) {
    train.object.visible = camera.position.distanceToSquared(train.trackCenter) < distSq;
  }
  for (const station of (group.userData.stations ?? [])) {
    station.object.visible = camera.position.distanceToSquared(station.center) < distSq;
  }
}

function buildRailGraph(placedTiles) {
  const graph = { nodes: new Map(), adjacency: new Map() };

  for (const tile of placedTiles.values()) {
    const tileKey = tile.key ?? makeHexKey(tile.q, tile.r);
    addTileRailRouteNodes(graph, tile, tileKey);
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

function addTileRailRouteNodes(graph, tile, tileKey) {
  const railPorts = getTileRailPorts(tile, tileKey);
  if (railPorts.length === 0) return;

  const world = axialToWorld(tile.q, tile.r);
  addNode(graph, getCenterNodeId(tileKey), new THREE.Vector3(world.x, TRAIN_Y, world.z), tileKey);

  for (const port of railPorts) {
    addNode(graph, getPortNodeId(tileKey, port.key), toWorldRailPoint(tile.q, tile.r, port.point), tileKey);
  }

  const routes = createTileRailRoutes(railPorts);
  for (const route of routes) {
    addRouteToGraph(graph, tile, tileKey, route);
  }
}

function addRouteToGraph(graph, tile, tileKey, route) {
  const points = route.points.map(point => toWorldRailPoint(tile.q, tile.r, point));
  if ((!route.closed && points.length < 2) || (route.closed && points.length < 4)) return;

  const nodeIds = points.map((point, index) => {
    const id = getRouteNodeId(tileKey, route.seedKey, index, route.portKeys?.[index]);
    addNode(graph, id, point, tileKey);
    return id;
  });

  const segmentCount = route.closed ? nodeIds.length : nodeIds.length - 1;
  for (let i = 0; i < segmentCount; i += 1) {
    addEdge(graph, nodeIds[i], nodeIds[(i + 1) % nodeIds.length]);
  }
}

function getTileRailPorts(tile, tileKey) {
  const vertices = createOuterVertices();

  return SECTOR_DEFS
    .map((sector, index) => {
      if (!isRailEdge(tile, sector.key)) return null;

      const vertexA = vertices[sector.a];
      const vertexB = vertices[sector.b];
      const point = new THREE.Vector3(
        ((vertexA.x + vertexB.x) / 2) * PORT_SCALE,
        0,
        ((vertexA.z + vertexB.z) / 2) * PORT_SCALE
      );
      const direction = new THREE.Vector3(point.x, 0, point.z).normalize();

      return {
        index,
        key: sector.key,
        nodeId: getPortNodeId(tileKey, sector.key),
        point,
        direction
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.index - b.index);
}

function createTileRailRoutes(ports) {
  if (ports.length === 1) return [createTileTerminusRoute(ports[0])];
  if (ports.length === 2) return [createTilePortToPortRoute(ports[0], ports[1])];
  return createTileJunctionRoutes(ports);
}

function createTileTerminusRoute(port) {
  const direction = port.direction.clone();
  const start = port.point.clone();
  const end = direction.clone().multiplyScalar(TRACK_HUB_RADIUS * 1.02);
  const distance = start.distanceTo(end);
  const controlDistance = clamp(distance * 0.44, TRACK_MIN_CURVE_RADIUS * 0.62, HEX_SIZE * 0.62);
  const c1 = start.clone().add(direction.clone().multiplyScalar(-controlDistance));
  const c2 = end.clone().add(direction.clone().multiplyScalar(controlDistance * 0.18));

  const points = sampleCubic(start, c1, c2, end, 20);
  return {
    seedKey: `rail-terminus:${port.index}`,
    points,
    closed: false,
    portKeys: { 0: port.key }
  };
}

function createTilePortToPortRoute(a, b) {
  const start = a.point.clone();
  const end = b.point.clone();
  const distance = start.distanceTo(end);
  const controlDistance = clamp(distance * 0.42, TRACK_MIN_CURVE_RADIUS, HEX_SIZE * 0.72);
  const dot = clamp(a.direction.dot(b.direction), -1, 1);
  const almostOpposite = dot < -0.92;
  const c1 = start.clone().add(a.direction.clone().multiplyScalar(-controlDistance));
  const c2 = end.clone().add(b.direction.clone().multiplyScalar(-controlDistance));

  if (almostOpposite) {
    c1.copy(start.clone().multiplyScalar(0.42));
    c2.copy(end.clone().multiplyScalar(0.42));
  }

  const points = sampleCubic(start, c1, c2, end, 34);
  return {
    seedKey: `rail-pair:${a.index}:${b.index}`,
    points,
    closed: false,
    portKeys: { 0: a.key, [points.length - 1]: b.key }
  };
}

function createTileJunctionRoutes(ports) {
  const routes = [{
    seedKey: `rail-hub:${ports.map(port => port.index).join('-')}`,
    points: createHubRingPoints(44),
    closed: true
  }];

  for (const port of ports) {
    const direction = port.direction.clone();
    const start = port.point.clone();
    const end = direction.clone().multiplyScalar(TRACK_HUB_RADIUS);
    const distance = start.distanceTo(end);
    const controlDistance = clamp(distance * 0.46, TRACK_MIN_CURVE_RADIUS * 0.58, HEX_SIZE * 0.62);
    const c1 = start.clone().add(direction.clone().multiplyScalar(-controlDistance));
    const c2 = end.clone().add(direction.clone().multiplyScalar(controlDistance * 0.28));
    const points = sampleCubic(start, c1, c2, end, 22);

    routes.push({
      seedKey: `rail-branch:${port.index}`,
      points,
      closed: false,
      portKeys: { 0: port.key }
    });
  }

  return routes;
}

function toWorldRailPoint(q, r, localPoint) {
  const world = axialToWorld(q, r);
  const salt = stableSalt(`${q}:${r}:${localPoint.x.toFixed(3)}:${localPoint.z.toFixed(3)}`);
  return new THREE.Vector3(
    world.x + localPoint.x,
    getTrainRailY(localPoint, salt),
    world.z + localPoint.z
  );
}

function smoothRailMotionPath(points) {
  const compact = compactMotionPoints(points);
  if (compact.length < 3) return compact;

  let smoothed = resampleMotionPath(compact, MOTION_SAMPLE_SPACING);
  for (let pass = 0; pass < MOTION_SMOOTH_PASSES; pass += 1) {
    smoothed = chaikinSmoothOpenPath(smoothed);
    smoothed = resampleMotionPath(smoothed, MOTION_SAMPLE_SPACING);
  }

  smoothPathY(smoothed, false, 1);
  return smoothed;
}


function stableSalt(seedKey = 'rail-train') {
  let hash = 2166136261;
  const text = String(seedKey);
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 997;
}

function smoothPathY(points, closed = false, passes = 1) {
  if (points.length < 3) return;
  for (let pass = 0; pass < passes; pass += 1) {
    const previousY = points.map(point => point.y);
    const start = closed ? 0 : 1;
    const end = closed ? points.length : points.length - 1;
    for (let i = start; i < end; i += 1) {
      const prev = (i - 1 + points.length) % points.length;
      const next = (i + 1) % points.length;
      points[i].y = previousY[i] * 0.5 + (previousY[prev] + previousY[next]) * 0.25;
    }
  }
}

function compactMotionPoints(points) {
  const compact = [];
  for (const point of points) {
    const previous = compact[compact.length - 1];
    if (!previous || previous.distanceTo(point) > HEX_SIZE * 0.006) {
      compact.push(point.clone());
    }
  }
  return compact;
}

function chaikinSmoothOpenPath(points) {
  if (points.length < 3) return points.map(point => point.clone());

  const result = [points[0].clone()];
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const q = a.clone().lerp(b, 0.25);
    const r = a.clone().lerp(b, 0.75);
    result.push(q, r);
  }
  result.push(points[points.length - 1].clone());
  return result;
}

function resampleMotionPath(points, spacing) {
  const length = measurePath(points);
  if (length <= 0) return points.map(point => point.clone());

  const count = Math.max(2, Math.ceil(length / Math.max(spacing, 0.001)));
  const samples = [];
  for (let i = 0; i <= count; i += 1) {
    samples.push(getPointAtMotionDistance(points, (i / count) * length));
  }
  return samples;
}

function getPointAtMotionDistance(points, distance) {
  if (points.length === 0) return new THREE.Vector3(0, TRAIN_Y, 0);
  if (points.length === 1) return points[0].clone();

  let remaining = Math.max(0, Math.min(distance, measurePath(points)));
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const segment = a.distanceTo(b);
    if (remaining <= segment || i === points.length - 2) {
      const t = segment <= 0 ? 0 : remaining / segment;
      return a.clone().lerp(b, t);
    }
    remaining -= segment;
  }

  return points[points.length - 1].clone();
}

function getRouteNodeId(tileKey, seedKey, index, portKey) {
  if (portKey) return getPortNodeId(tileKey, portKey);
  return `${tileKey}:route:${seedKey}:${index}`;
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
    station.position.y = node.position.y - 0.075;
    station.rotation.y = Math.atan2(outward.x, outward.z) + (sideSign < 0 ? Math.PI : 0);
    if (!Array.isArray(group.userData.stations)) group.userData.stations = [];
    group.userData.stations.push({ object: station, center: station.position.clone() });
    group.add(station);
  }
}

function createRailStationObject(seedKey = 'station') {
  const group = new THREE.Group();
  group.name = 'rail-terminus-station-glb-house';

  const prototype = pickStationPrototype(seedKey);
  if (!prototype) return group;

  const station = prototype.clone(true);
  station.name = 'rail-terminus-station-glb-instance';
  station.rotation.y = hashUnit(`${seedKey}:station-model-yaw`) * 0.22 - 0.11;
  group.add(station);

  return group;
}

function ensureStationGlbModels(group) {
  if (stationModelsLoading || stationModelsRequested) return;
  stationModelsLoading = true;
  stationModelsRequested = true;

  let pending = STATION_MODEL_DEFS.length;
  const finishOne = () => {
    pending -= 1;
    if (pending > 0) return;

    stationModelsLoading = false;
    // ⚠️ NE PAS appeler rebuildRailTrainOverlay() directement ici :
    // le callback GLB fire entre deux RAF → nouveaux objets visible=true sans LOD → FLASH.
    // On passe par pendingModelRebuild → scene.js le queue avec lod?.() immédiat.
    if (group.userData.lastPlacedTiles) group.userData.pendingModelRebuild = true;
  };

  for (const def of STATION_MODEL_DEFS) {
    createGLTFLoader().load(
      def.url,
      gltf => {
        stationGlbLibrary.set(def.key, prepareStationGlbPrototype(gltf.scene, def));
        finishOne();
      },
      undefined,
      error => {
        console.warn(`Modèle gare GLB indisponible : ${def.url}`, error);
        finishOne();
      }
    );
  }
}

function prepareStationGlbPrototype(model, def) {
  const wrapper = new THREE.Group();
  wrapper.name = `normalized-${def.key}`;

  const source = model.clone(true);
  const box = new THREE.Box3().setFromObject(source);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  source.position.set(-center.x, -box.min.y, -center.z);
  const length = Math.max(size.x, size.z) || 1;
  wrapper.scale.setScalar(STATION_TARGET_LENGTH / length);
  wrapper.add(source);

  wrapper.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    if (object.material) object.material = cloneGlbMaterial(object.material);
  });

  return wrapper;
}

function pickStationPrototype(seedKey) {
  const loaded = STATION_MODEL_DEFS.filter(def => stationGlbLibrary.has(def.key));
  if (loaded.length === 0) return null;

  const totalWeight = loaded.reduce((total, def) => total + (def.weight ?? 1), 0);
  let roll = hashUnit(`${seedKey}:station-glb-choice`) * totalWeight;
  for (const def of loaded) {
    roll -= def.weight ?? 1;
    if (roll <= 0) return stationGlbLibrary.get(def.key);
  }

  return stationGlbLibrary.get(loaded[0].key);
}

function cloneGlbMaterial(material) {
  if (Array.isArray(material)) return material.map(item => cloneGlbMaterial(item));
  const cloned = material.clone();
  cloned.side = THREE.DoubleSide;
  if ('emissiveIntensity' in cloned) cloned.emissiveIntensity = 0;
  if ('toneMapped' in cloned) cloned.toneMapped = true;
  cloned.needsUpdate = true;
  return cloned;
}

function getWagonCountForRailNetwork(tileCount, distance) {
  // 0 = loco seule          (voie courte : < ~2 hexs)
  // 1 = loco + ravitaillement (voie moyenne : 2–3 hexs)
  // 2–7 = + wagons voyageurs progressifs jusqu'à 6 voyageurs (voie longue)
  if (distance < HEX_SIZE * 2.0) return 0;
  if (distance < HEX_SIZE * 3.5) return 1;
  const passengers = Math.min(6, Math.floor((distance - HEX_SIZE * 3.5) / (HEX_SIZE * 1.2)) + 1);
  return Math.min(TRAIN_MAX_WAGONS, 1 + passengers);
}

function createTrainObject(wagonCount = 0) {
  const group = new THREE.Group();
  group.name = 'animatedRailTrainArticulated';

  const units   = [];
  const couplers = [];

  // ── Locomotive (toujours présente) ──
  const loco = new THREE.Group();
  loco.name = 'train-locomotive-independent';
  if (woodenTrainLib?.loco) loco.add(woodenTrainLib.loco.clone(true));
  group.add(loco);
  units.push({ object: loco, followDistance: 0, type: 'locomotive' });

  if (wagonCount < 1) {
    // Loco seule — pas de wagons
  } else {
    // ── Wagon de ravitaillement (wagon1, juste après la loco) ──
    const supplyWagon = new THREE.Group();
    supplyWagon.name = 'train-wagon-supply-independent';
    const supplyProto = woodenTrainLib?.wagon1 ?? woodenTrainLib?.wagon2;
    if (supplyProto) supplyWagon.add(supplyProto.clone(true));
    group.add(supplyWagon);
    units.push({ object: supplyWagon, followDistance: TRAIN_UNIT_SPACING, type: 'wagon' });

    const coupler0 = new THREE.Group();
    coupler0.name = 'train-coupler-1-articulated';
    group.add(coupler0);
    couplers.push({ object: coupler0, frontIndex: 0, rearIndex: 1 });

    // ── Wagons voyageurs (wagon2) — wagonCount-1 wagons, max 6 ──
    const passengerCount = Math.min(6, wagonCount - 1);
    for (let i = 0; i < passengerCount; i += 1) {
      const wagon = new THREE.Group();
      wagon.name = `train-wagon-${i + 2}-independent`;
      if (woodenTrainLib?.wagon2) wagon.add(woodenTrainLib.wagon2.clone(true));
      group.add(wagon);
      units.push({
        object: wagon,
        followDistance: TRAIN_UNIT_SPACING * (i + 2),
        type: 'wagon'
      });

      const coupler = new THREE.Group();
      coupler.name = `train-coupler-${i + 2}-articulated`;
      group.add(coupler);
      couplers.push({ object: coupler, frontIndex: i + 1, rearIndex: i + 2 });
    }
  }

  // Fumée sprite supprimée — remplacée par le pass volumétrique (smokeVolumePass.js).
  group.userData.units   = units;
  group.userData.couplers = couplers;
  group.userData.loco    = loco;

  return group;
}

function updateArticulatedTrain(trainObject, motionTrack, progress, timeSeconds) {
  const units = trainObject.userData.units ?? [];
  if (units.length === 0) return;

  for (const unit of units) {
    const sample = samplePingPongMotionTrack(motionTrack, progress, unit.followDistance);
    unit.object.position.copy(sample.position);
    unit.object.position.y = TRAIN_Y;

    const targetRotation = -Math.atan2(sample.tangent.z, sample.tangent.x);
    if (unit.lastRotationY === undefined) unit.lastRotationY = targetRotation;
    unit.lastRotationY = lerpAngle(unit.lastRotationY, targetRotation, TRAIN_ROTATION_SMOOTHING);
    unit.object.rotation.y = unit.lastRotationY;

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
    const targetRotation = -Math.atan2(direction.z, direction.x);
    if (coupler.lastRotationY === undefined) coupler.lastRotationY = targetRotation;
    coupler.lastRotationY = lerpAngle(coupler.lastRotationY, targetRotation, TRAIN_ROTATION_SMOOTHING);
    coupler.object.rotation.y = coupler.lastRotationY;
    coupler.object.visible = direction.length() > 0.001;
  }

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
    speed = Math.min(speed, lerp(1, 0.72, cornerInfluence * previousTurn));
  }

  const nextTurn = getTurnStrength(points, segmentIndex + 1);
  if (nextTurn > 0) {
    const distanceFromNextCorner = (1 - t) * points[segmentIndex].distanceTo(points[segmentIndex + 1]);
    const cornerInfluence = 1 - smoothstep(0, TRAIN_CURVE_SLOW_DISTANCE, distanceFromNextCorner);
    speed = Math.min(speed, lerp(1, 0.72, cornerInfluence * nextTurn));
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


function sampleCubic(p0, p1, p2, p3, segments = 24) {
  const points = [];
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const mt = 1 - t;
    points.push(new THREE.Vector3(
      mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x,
      0,
      mt * mt * mt * p0.z + 3 * mt * mt * t * p1.z + 3 * mt * t * t * p2.z + t * t * t * p3.z
    ));
  }
  return points;
}

function createHubRingPoints(segments = 40) {
  const points = [];
  for (let i = 0; i < segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    points.push(new THREE.Vector3(
      Math.cos(angle) * TRACK_HUB_RADIUS,
      0,
      Math.sin(angle) * TRACK_HUB_RADIUS
    ));
  }
  return points;
}

function lerpAngle(from, to, t) {
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + delta * Math.max(0, Math.min(1, t));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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


// ═══════════════════════════════════════════════════════════════════════════
// Chargement GLB — train.glb
// ═══════════════════════════════════════════════════════════════════════════

function ensureWoodenTrainGlb(group) {
  if (woodenTrainLoading || woodenTrainReady) return;
  woodenTrainLoading = true;

  createGLTFLoader().load(WOODEN_TRAIN_URL, gltf => {
    woodenTrainLib    = extractTrainParts(gltf.scene);
    woodenTrainReady  = true;
    woodenTrainLoading = false;
    console.debug('[wooden-train] GLB chargé :', Object.keys(woodenTrainLib).join(', '));
    if (group?.userData?.lastPlacedTiles) group.userData.pendingModelRebuild = true;
  }, undefined, err => {
    console.warn('[wooden-train] Erreur chargement GLB', err);
    woodenTrainLoading = false;
  });
}

function extractTrainParts(scene) {
  const found = { loco: null, wagon1: null, wagon2: null };

  scene.traverse(obj => {
    const n = obj.name.toLowerCase();
    if (!found.loco   && n === 'train')   found.loco   = obj;
    if (!found.wagon1 && n === 'wagon1')  found.wagon1 = obj;
    if (!found.wagon2 && n === 'wagon2')  found.wagon2 = obj;
  });

  // Fallback par enfants directs de la scène si les noms ne correspondent pas
  const topLevel = scene.children.filter(c => c.isMesh || c.isGroup || (c.children?.length > 0));
  if (!found.loco   && topLevel.length >= 1) found.loco   = topLevel[0];
  if (!found.wagon1 && topLevel.length >= 2) found.wagon1 = topLevel[1];
  if (!found.wagon2 && topLevel.length >= 3) found.wagon2 = topLevel[2];

  console.debug('[wooden-train] Parts :', Object.entries(found).map(([k, v]) => `${k}="${v?.name ?? 'null'}"`).join(' | '));

  const result = {};
  for (const [key, src] of Object.entries(found)) {
    if (src) result[key] = normalizeTrainUnit(src, key);
    else     console.warn(`[wooden-train] Part introuvable : ${key}`);
  }
  return result;
}

function normalizeTrainUnit(source, unitName) {
  const wrapper = new THREE.Group();
  wrapper.name  = `train-unit-proto-${unitName}`;

  const model = source.clone(true);

  // CRITICAL : remettre à zéro la position héritée du fichier GLTF.
  // Les modèles Blender (loco, wagon1, wagon2) sont placés à des offsets XZ différents
  // dans la scène pour les séparer visuellement. Le clone hérite ces positions.
  // Sans reset, bbox.center inclut l'offset → model.position = -center décale le visuel
  // de -offset_hérité dans le wrapper → tourne latéralement avec l'unité → train à 5m du rail.
  model.position.set(0, 0, 0);
  model.updateMatrixWorld(true);

  // Mesure initiale (position=0, sans rotation) pour déterminer l'axe long
  const box0  = new THREE.Box3().setFromObject(model);
  const size0 = new THREE.Vector3();
  box0.getSize(size0);

  // Aligner le devant sur +X (convention moteur : -atan2(tz, tx) attend un modèle +X-facing)
  const isZLonger = size0.z >= size0.x;
  model.rotation.y = isZLonger ? -Math.PI / 2 : 0;
  model.updateMatrixWorld(true);

  // Re-mesurer APRÈS rotation → centrage correct (sinon l'offset pré-rotation tourne avec l'unité)
  const box    = new THREE.Box3().setFromObject(model);
  const size   = new THREE.Vector3();
  box.getSize(size);
  const center = new THREE.Vector3();
  box.getCenter(center);

  // Centrer XZ sur l'origine du wrapper, coller le fond à y=0
  model.position.set(-center.x, -box.min.y, -center.z);

  // Longueur = X après rotation (direction de voyage dans le repère moteur)
  const rawLength    = Math.max(size.x, 0.001);
  const targetLength = TRAIN_UNIT_SPACING * 0.97;
  const scale        = targetLength / rawLength;
  wrapper.scale.setScalar(scale);
  wrapper.add(model);

  wrapper.traverse(obj => {
    if (!obj.isMesh) return;
    obj.castShadow    = true;
    obj.receiveShadow = true;
    obj.userData.shadowFlagsApplied = true;
    // Protéger les matériaux GLB : clone(true) partage les refs → ne pas les disposer dans clearGroup
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach(m => { if (m) m.userData.glbPrototype = true; });
  });

  console.log(`[wooden-train] ${unitName}: bbox(xyz)=(${size.x.toFixed(4)},${size.y.toFixed(4)},${size.z.toFixed(4)}) isZLonger=${isZLonger} rawLength=${rawLength.toFixed(4)} targetLength=${targetLength.toFixed(4)} scale=${scale.toFixed(4)}`);
  return wrapper;
}

// ═══════════════════════════════════════════════════════════════════════════
// Chargement GLB — rails.glb
// ═══════════════════════════════════════════════════════════════════════════

function ensureTrackGlb(group) {
  if (trackGlbLoading || trackGlbReady) return;
  trackGlbLoading = true;

  createGLTFLoader().load(TRAIN_TRACK_URL, gltf => {
    const scene = gltf.scene;
    scene.updateMatrixWorld(true);

    const box  = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();
    box.getSize(size);

    // Direction principale du rail : l'axe le plus long
    const isXLonger = size.x > size.z * 1.1;

    // Rotation AVANT centrage — si on centre avant, l'offset (-cx, 0, -cz) est en coords
    // pré-rotation et se retrouve tourné par chaque instance → rails à côté du chemin
    if (isXLonger) scene.rotation.y = Math.PI / 2;

    // Re-mesurer la bbox APRÈS rotation pour un centrage correct
    scene.updateMatrixWorld(true);
    const box2    = new THREE.Box3().setFromObject(scene);
    const size2   = new THREE.Vector3();
    box2.getSize(size2);
    const center2 = new THREE.Vector3();
    box2.getCenter(center2);

    // Centrer APRÈS rotation → centre visuel à (0,0,0) du wrapper quelle que soit l'instance
    scene.position.set(-center2.x, -box2.min.y, -center2.z);

    // Longueur du segment = Z après rotation (direction de voyage +Z des instances)
    trackGlbLength = Math.max(size2.z, 0.001);

    const wrapper = new THREE.Group();
    wrapper.name = 'train-track-proto';
    wrapper.add(scene);

    wrapper.traverse(obj => {
      if (!obj.isMesh) return;
      obj.castShadow  = false;
      obj.receiveShadow = true;
      obj.userData.disableCastShadow  = true;
      obj.userData.shadowFlagsApplied = true;
      // Protéger les matériaux GLB : ne pas les disposer dans clearGroup
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach(m => { if (m) m.userData.glbPrototype = true; });
    });

    // Segments courts = courbes plus lisses (+15% taille → moins de segments, GLB plus lisible)
    const TARGET_SEGMENT = HEX_SIZE * 0.07 * 1.15 * 1.12 * 1.17 * 1.06 * 1.13; // +12% +17% rails +6% +13%
    const segScale = TARGET_SEGMENT / Math.max(trackGlbLength, 0.001);
    wrapper.scale.setScalar(segScale);
    trackGlbLength = TARGET_SEGMENT;

    trackGlbProto   = wrapper;
    trackGlbReady   = true;
    trackGlbLoading = false;
    console.debug(`[track-glb] Chargé — brut: ${(isXLonger ? size.x : size.z).toFixed(4)} → segment: ${TARGET_SEGMENT.toFixed(4)} (scale=${segScale.toFixed(4)}, axe ${isXLonger ? 'X→Z' : 'Z'})`);
    if (group?.userData?.lastPlacedTiles) group.userData.pendingModelRebuild = true;
  }, undefined, err => {
    console.warn('[track-glb] Erreur chargement GLB', err);
    trackGlbLoading = false;
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Génération des rails GLB pour tous les tiles
// ═══════════════════════════════════════════════════════════════════════════

function addAllRailGLBInstances(parentGroup, placedTiles) {
  const railGroup = new THREE.Group();
  railGroup.name  = 'rail-glb-instances';

  let totalInstances = 0;
  for (const tile of placedTiles.values()) {
    const tileKey  = tile.key ?? makeHexKey(tile.q, tile.r);
    const railPorts = getTileRailPorts(tile, tileKey);
    if (railPorts.length === 0) continue;

    const routes = createTileRailRoutes(railPorts);
    for (const route of routes) {
      const worldPoints = route.points.map(p => toWorldRailPoint(tile.q, tile.r, p));
      totalInstances += addTrackGLBToGroup(railGroup, worldPoints, route.closed);
    }
  }

  parentGroup.add(railGroup);
  console.debug(`[track-glb] ${totalInstances} instances de rail générées`);
}

function addTrackGLBToGroup(group, worldPoints, closed = false) {
  if (worldPoints.length < 2) return 0;

  const sampled = resampleMotionPath(worldPoints, MOTION_SAMPLE_SPACING * 0.5);
  const length  = measurePath(sampled);
  if (length <= HEX_SIZE * 0.04 || trackGlbLength <= 0) return 0;

  const segLen  = Math.max(trackGlbLength, HEX_SIZE * 0.02);
  const count   = Math.max(1, Math.round(length / segLen));
  const spacing = length / count;

  // Le fond du rail (y=0 du wrapper, via -box.min.y) doit être sur la surface du biome rail.
  // TILE_VISUAL.railY = surface rail = -0.043 (valeur réelle mesurée en console).
  const RAIL_SURFACE_Y = TILE_VISUAL.railY ?? -0.043;

  for (let i = 0; i < count; i++) {
    const dist    = closed ? (i / count) * length : (i + 0.5) * spacing;
    const pos     = getPointAtMotionDistance(sampled, dist);
    const tangent = getTrackTangentAt(sampled, dist, length);

    const instance = trackGlbProto.clone(true);
    instance.position.copy(pos);
    instance.position.y = TRAIN_Y; // même hauteur que les trains/wagons
    instance.rotation.y = Math.atan2(tangent.x, tangent.z);
    group.add(instance);
  }

  return count;
}

function getTrackTangentAt(points, dist, totalLength) {
  const delta  = Math.min(HEX_SIZE * 0.018, totalLength * 0.05);
  const before = getPointAtMotionDistance(points, Math.max(0, dist - delta));
  const after  = getPointAtMotionDistance(points, Math.min(totalLength, dist + delta));
  const t      = after.clone().sub(before);
  if (t.lengthSq() <= 1e-10) return new THREE.Vector3(0, 0, 1);
  return t.normalize();
}

function clearGroup(group) {
  for (const child of [...group.children]) {
    group.remove(child);
    child.traverse?.(object => {
      object.geometry?.dispose?.();
      // Ne pas disposer les matériaux GLB : clone(true) partage les références →
      // disposer une instance détruit aussi le prototype. Les matériaux GLB sont
      // marqués userData.glbPrototype = true par normalizeTrainUnit / ensureTrackGlb.
      const mats = Array.isArray(object.material) ? object.material : [object.material];
      for (const mat of mats) {
        if (mat && !mat.userData?.glbPrototype && !materialCacheHasMaterial(mat)) {
          mat.dispose?.();
        }
      }
    });
  }
}

function materialCacheHasMaterial(material) {
  for (const cachedMaterial of materialCache.values()) {
    if (cachedMaterial === material) return true;
  }
  return false;
}
