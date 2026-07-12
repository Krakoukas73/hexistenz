// ─── railGraph.js — graphe du réseau rail + pathfinding + génération des routes ────
// Extrait de railTrainOverlay.js le 2026-07-11 (découpage sans risque, cf. CONTEXT.md §21) :
// construction du graphe de nœuds/arêtes à partir des tuiles posées, recherche du plus long
// chemin (Dijkstra), génération des routes de rail par tuile (terminus/paire/jonction) et
// lissage générique de chemin (Chaikin + resampling) réutilisé par le train et les rails GLB.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { EDGE_TYPES, HEX_SIZE, SECTOR_DEFS } from './config.js';
import { createOuterVertices } from './hexGeometry.js';
import { axialToWorld, makeHexKey } from './hex.js';
import { HEX_DIRECTIONS, getOppositeEdge } from './placementRules.js';
import { getEdgeType } from './tileGenerator.js';
import { getTrainRailY } from './terrainHeight.js';
import { clamp } from './tileUtils.js';
import {
  TRAIN_Y,
  PORT_SCALE,
  TRACK_HUB_RADIUS,
  TRACK_MIN_CURVE_RADIUS,
  MOTION_SAMPLE_SPACING,
  MOTION_SMOOTH_PASSES
} from './railTrainConstants.js';

export function buildRailGraph(placedTiles) {
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

export function getTileRailPorts(tile, tileKey) {
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

export function createTileRailRoutes(ports) {
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

export function toWorldRailPoint(q, r, localPoint) {
  const world = axialToWorld(q, r);
  const salt = stableSalt(`${q}:${r}:${localPoint.x.toFixed(3)}:${localPoint.z.toFixed(3)}`);
  return new THREE.Vector3(
    world.x + localPoint.x,
    getTrainRailY(localPoint, salt),
    world.z + localPoint.z
  );
}

export function smoothRailMotionPath(points) {
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

export function resampleMotionPath(points, spacing) {
  const length = measurePath(points);
  if (length <= 0) return points.map(point => point.clone());

  const count = Math.max(2, Math.ceil(length / Math.max(spacing, 0.001)));
  const samples = [];
  for (let i = 0; i <= count; i += 1) {
    samples.push(getPointAtMotionDistance(points, (i / count) * length));
  }
  return samples;
}

export function getPointAtMotionDistance(points, distance) {
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

export function findComponents(graph) {
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

export function findLongestPath(graph, componentNodes) {
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

export function sampleCubic(p0, p1, p2, p3, segments = 24) {
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

export function createHubRingPoints(segments = 40) {
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

export function measurePath(points) {
  let distance = 0;
  for (let i = 0; i < points.length - 1; i++) distance += points[i].distanceTo(points[i + 1]);
  return distance;
}
