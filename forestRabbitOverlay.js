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

const SECTOR_BY_KEY = Object.fromEntries(SECTOR_DEFS.map(sector => [sector.key, sector]));
const DIRECTION_BY_EDGE = Object.fromEntries(HEX_DIRECTIONS.map(direction => [direction.edge, direction]));

const FOREST_CREATURE_Y = (TILE_VISUAL.sectorY ?? 0.012) + 0.105;
const MIN_ZONE_SECTORS = 2;
const RABBITS_PER_FOREST_SECTOR = 0.20;
const RABBIT_SPEED = 0.26;

export function createForestRabbitOverlay() {
  const group = new THREE.Group();
  group.name = 'forest-rabbit-overlay';
  group.userData.rabbits = [];
  return group;
}

export function rebuildForestRabbitOverlay(group, placedTiles) {
  clearGroup(group);
  group.userData.rabbits = [];

  const visited = new Set();
  let zoneIndex = 0;

  for (const placedTile of placedTiles.values()) {
    for (const edge of EDGE_ORDER) {
      const nodeKey = makeNodeKey(placedTile.key, edge);
      if (visited.has(nodeKey) || !isForestEdge(placedTile, edge)) continue;

      const zone = collectForestZone(placedTile, edge, placedTiles, visited);
      if (zone.sectors.length < MIN_ZONE_SECTORS) continue;

      addZoneRabbits(group, zone, zoneIndex++);
    }
  }
}

export function updateForestRabbitOverlay(group, timeSeconds = 0) {
  const rabbits = group.userData.rabbits ?? [];

  for (const rabbit of rabbits) {
    const progress = (timeSeconds * rabbit.speed / Math.max(rabbit.distance, 0.001) + rabbit.offset) % 1;
    const sample = samplePingPongMotionTrack(rabbit.motionTrack, progress);
    const hopPhase = (progress * rabbit.hopRate + rabbit.hopOffset) * Math.PI * 2;
    const hop = Math.max(0, Math.sin(hopPhase));
    const lean = Math.sin(hopPhase) * 0.11;

    rabbit.object.position.copy(sample.position);
    rabbit.object.position.y = FOREST_CREATURE_Y + hop * rabbit.hopHeight;
    rabbit.object.rotation.y = -Math.atan2(sample.tangent.z, sample.tangent.x) + Math.PI / 2;
    rabbit.object.rotation.z = lean;

    const squash = 1 - hop * 0.08;
    const stretch = 1 + hop * 0.10;
    rabbit.body.scale.set(rabbit.bodyBaseScale.x * stretch, rabbit.bodyBaseScale.y * squash, rabbit.bodyBaseScale.z * squash);
    rabbit.head.position.y = rabbit.headBaseY + hop * 0.018;
    rabbit.leftEar.rotation.x = rabbit.leftEarBaseRotationX + Math.sin(hopPhase + 0.6) * 0.12;
    rabbit.rightEar.rotation.x = rabbit.rightEarBaseRotationX + Math.sin(hopPhase + 0.9) * 0.12;
  }
}

function addZoneRabbits(group, zone, zoneIndex) {
  const graph = buildForestGraph(zone);
  const components = findComponents(graph);

  for (const component of components) {
    if (component.nodes.length < MIN_ZONE_SECTORS) continue;

    const path = findLongestPath(graph, component.nodes);
    if (path.length < 2) continue;

    const points = path.map(nodeId => graph.nodes.get(nodeId).position.clone());
    const distance = measurePath(points);
    if (distance < HEX_SIZE * 0.50) continue;

    const rabbitCount = Math.max(1, Math.round(component.nodes.length * RABBITS_PER_FOREST_SECTOR));
    const motionTrack = buildMotionTrack(points);

    for (let index = 0; index < rabbitCount; index += 1) {
      const seedKey = `forest-zone:${zoneIndex}:component:${component.index}:rabbit:${index}`;
      const object = createRabbitObject(seedKey);
      object.position.copy(points[0]);
      group.add(object);

      group.userData.rabbits.push({
        object,
        body: object.userData.body,
        head: object.userData.head,
        leftEar: object.userData.leftEar,
        rightEar: object.userData.rightEar,
        bodyBaseScale: object.userData.body.scale.clone(),
        headBaseY: object.userData.head.position.y,
        leftEarBaseRotationX: object.userData.leftEar.rotation.x,
        rightEarBaseRotationX: object.userData.rightEar.rotation.x,
        motionTrack,
        distance,
        speed: RABBIT_SPEED * (0.86 + hashUnit(`${seedKey}:speed`) * 0.32),
        offset: (index / rabbitCount + hashUnit(`${seedKey}:offset`) * 0.21) % 1,
        hopOffset: hashUnit(`${seedKey}:hop-offset`),
        hopRate: 5.2 + hashUnit(`${seedKey}:hop-rate`) * 1.8,
        hopHeight: HEX_SIZE * (0.028 + hashUnit(`${seedKey}:hop-height`) * 0.018)
      });
    }
  }
}

function createRabbitObject(seedKey) {
  const group = new THREE.Group();
  group.name = 'animated-lowpoly-forest-rabbit';
  const scale = HEX_SIZE * (0.095 + hashUnit(`${seedKey}:scale`) * 0.018);
  group.scale.setScalar(scale);
  group.rotation.y = hashUnit(`${seedKey}:rot`) * Math.PI * 2;

  // MeshBasicMaterial volontaire : la scène n'a pas d'éclairage global.
  // Avec MeshStandardMaterial, le lapin devient noir et ressemble à une ombre de raie manta.
  const fur = new THREE.Color().setHSL(0.075 + hashUnit(`${seedKey}:fur`) * 0.035, 0.58, 0.46 + hashUnit(`${seedKey}:light`) * 0.08);
  const darkFur = fur.clone().multiplyScalar(0.78);
  const bellyColor = new THREE.Color(0xd8b47e);

  const bodyMaterial = new THREE.MeshBasicMaterial({ color: fur });
  const darkMaterial = new THREE.MeshBasicMaterial({ color: darkFur });
  const bellyMaterial = new THREE.MeshBasicMaterial({ color: bellyColor });
  const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x120b06 });

  const body = new THREE.Mesh(new THREE.SphereGeometry(1.00, 8, 6), bodyMaterial);
  body.name = 'rabbit-lowpoly-body';
  body.scale.set(1.05, 0.54, 0.66);
  body.position.set(0, 0.18, 0);

  const haunch = new THREE.Mesh(new THREE.SphereGeometry(0.72, 7, 5), darkMaterial);
  haunch.name = 'rabbit-lowpoly-haunch';
  haunch.scale.set(0.78, 0.46, 0.62);
  haunch.position.set(0, 0.13, 0.34);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.54, 7, 5), bodyMaterial);
  head.name = 'rabbit-lowpoly-head';
  head.scale.set(0.72, 0.58, 0.62);
  head.position.set(0, 0.40, -0.56);

  const snout = new THREE.Mesh(new THREE.SphereGeometry(0.28, 6, 4), bellyMaterial);
  snout.name = 'rabbit-lowpoly-snout';
  snout.scale.set(0.50, 0.32, 0.36);
  snout.position.set(0, 0.36, -0.86);

  const leftEar = createEar(bodyMaterial, -0.18);
  const rightEar = createEar(bodyMaterial, 0.18);
  leftEar.name = 'rabbit-left-long-ear';
  rightEar.name = 'rabbit-right-long-ear';
  leftEar.position.set(-0.14, 0.86, -0.48);
  rightEar.position.set(0.14, 0.86, -0.48);
  leftEar.rotation.set(-0.18, 0.04, -0.16);
  rightEar.rotation.set(-0.18, -0.04, 0.16);

  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 4), bellyMaterial);
  tail.name = 'rabbit-small-tail';
  tail.scale.set(0.68, 0.58, 0.68);
  tail.position.set(0, 0.24, 0.70);

  const leftEye = createEye(eyeMaterial, -0.18);
  const rightEye = createEye(eyeMaterial, 0.18);

  const leftFrontLeg = createLeg(darkMaterial, -0.30, -0.38, 0.55);
  const rightFrontLeg = createLeg(darkMaterial, 0.30, -0.38, 0.55);
  const leftBackLeg = createLeg(darkMaterial, -0.46, 0.34, 0.80);
  const rightBackLeg = createLeg(darkMaterial, 0.46, 0.34, 0.80);

  for (const mesh of [body, haunch, head, snout, leftEar, rightEar, tail, leftEye, rightEye, leftFrontLeg, rightFrontLeg, leftBackLeg, rightBackLeg]) {
    mesh.castShadow = false;
    mesh.receiveShadow = false;
  }

  group.add(body, haunch, head, snout, leftEar, rightEar, tail, leftEye, rightEye, leftFrontLeg, rightFrontLeg, leftBackLeg, rightBackLeg);
  group.userData = { body, head, leftEar, rightEar };
  return group;
}

function createEar(material, side) {
  const geometry = new THREE.ConeGeometry(0.13, 0.72, 5);
  const ear = new THREE.Mesh(geometry, material);
  ear.scale.set(0.70, 1.00, 0.42);
  ear.position.x = side;
  return ear;
}

function createEye(material, side) {
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.055, 5, 4), material);
  eye.name = side < 0 ? 'rabbit-left-eye' : 'rabbit-right-eye';
  eye.position.set(side, 0.45, -0.98);
  return eye;
}

function createLeg(material, x, z, length) {
  const leg = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.14, length), material);
  leg.name = 'rabbit-lowpoly-leg';
  leg.position.set(x, -0.10, z);
  leg.rotation.x = 0.18;
  return leg;
}

function collectForestZone(startTile, startEdge, placedTiles, visited) {
  const stack = [{ tile: startTile, edge: startEdge }];
  const sectors = [];

  while (stack.length > 0) {
    const current = stack.pop();
    const nodeKey = makeNodeKey(current.tile.key, current.edge);
    if (visited.has(nodeKey) || !isForestEdge(current.tile, current.edge)) continue;

    visited.add(nodeKey);
    sectors.push(current);

    for (const neighbor of getForestNeighbors(current.tile, current.edge, placedTiles)) {
      const neighborKey = makeNodeKey(neighbor.tile.key, neighbor.edge);
      if (!visited.has(neighborKey)) stack.push(neighbor);
    }
  }

  return { sectors };
}

function buildForestGraph(zone) {
  const graph = { nodes: new Map(), adjacency: new Map() };
  const zoneNodeIds = new Set(zone.sectors.map(sector => makeNodeKey(sector.tile.key, sector.edge)));
  const zoneTiles = new Map(zone.sectors.map(sector => [sector.tile.key, sector.tile]));

  for (const sectorRef of zone.sectors) {
    const nodeId = makeNodeKey(sectorRef.tile.key, sectorRef.edge);
    addNode(graph, nodeId, getSectorForestPoint(sectorRef.tile, sectorRef.edge));
  }

  for (const sectorRef of zone.sectors) {
    const fromId = makeNodeKey(sectorRef.tile.key, sectorRef.edge);
    for (const neighbor of getForestNeighbors(sectorRef.tile, sectorRef.edge, zoneTiles)) {
      const toId = makeNodeKey(neighbor.tile.key, neighbor.edge);
      if (zoneNodeIds.has(toId)) addEdge(graph, fromId, toId);
    }
  }

  return graph;
}

function getForestNeighbors(placedTile, edge, placedTiles) {
  const neighbors = [];

  if (getTileCenterType(placedTile) === EDGE_TYPES.forest) {
    for (const sameTileEdge of EDGE_ORDER) {
      if (sameTileEdge !== edge && isForestEdge(placedTile, sameTileEdge)) {
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
    if (isForestEdge(placedTile, internalEdge)) neighbors.push({ tile: placedTile, edge: internalEdge });
  }

  const direction = DIRECTION_BY_EDGE[edge];
  if (!direction) return neighbors;

  const neighborTile = placedTiles.get(makeHexKey(placedTile.q + direction.q, placedTile.r + direction.r));
  const oppositeEdge = getOppositeEdge(edge);

  if (neighborTile && isForestEdge(neighborTile, oppositeEdge)) {
    neighbors.push({ tile: neighborTile, edge: oppositeEdge });
  }

  return neighbors;
}

function getSectorForestPoint(placedTile, edge) {
  const sector = SECTOR_BY_KEY[edge];
  const vertices = createOuterVertices();
  const world = axialToWorld(placedTile.q, placedTile.r);
  const a = vertices[sector.a];
  const b = vertices[sector.b];

  const centerBias = 0.18;
  return new THREE.Vector3(
    world.x + ((a.x + b.x) / 3) * (1 - centerBias),
    FOREST_CREATURE_Y,
    world.z + ((a.z + b.z) / 3) * (1 - centerBias)
  );
}

function createOuterVertices(radius = HEX_SIZE * TILE_VISUAL.radiusScale) {
  const vertices = [];
  for (let i = 0; i < 6; i += 1) {
    const angle = (Math.PI / 3) * i;
    vertices.push({ x: Math.cos(angle) * radius, z: Math.sin(angle) * radius });
  }
  return vertices;
}

function isForestEdge(placedTile, edge) {
  return getEdgeType(placedTile?.tile?.edges?.[edge]) === EDGE_TYPES.forest;
}

function getTileCenterType(placedTile) {
  return placedTile.tile.center ?? null;
}

function makeNodeKey(tileKey, edge) {
  return `${tileKey}:${edge}`;
}

function addNode(graph, id, position) {
  if (graph.nodes.has(id)) return;
  graph.nodes.set(id, { id, position });
  graph.adjacency.set(id, new Set());
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
    visited.add(nodeId);

    while (stack.length > 0) {
      const current = stack.pop();
      nodes.push(current);

      for (const next of graph.adjacency.get(current) ?? []) {
        if (visited.has(next)) continue;
        visited.add(next);
        stack.push(next);
      }
    }

    components.push({ index: components.length, nodes });
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

  if (best.length >= 2) return best;
  return componentNodes;
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

function buildMotionTrack(points) {
  const samples = [];
  const pathDistance = measurePath(points);

  if (!points || points.length === 0) return { samples, totalMotion: 0, pathDistance: 0 };
  if (points.length === 1 || pathDistance <= 0) {
    samples.push({ position: points[0].clone(), tangent: new THREE.Vector3(1, 0, 0), motion: 0 });
    return { samples, totalMotion: 0, pathDistance: 0 };
  }

  let totalMotion = 0;

  for (let i = 0; i < points.length - 1; i += 1) {
    const from = points[i];
    const to = points[i + 1];
    const segmentVector = to.clone().sub(from);
    const segmentDistance = segmentVector.length();
    if (segmentDistance <= 0) continue;

    const tangent = segmentVector.clone().normalize();
    const steps = Math.max(8, Math.ceil(segmentDistance / (HEX_SIZE * 0.055)));

    for (let step = 0; step <= steps; step += 1) {
      if (i > 0 && step === 0) continue;

      const t = step / steps;
      const position = from.clone().lerp(to, t);
      const previousPosition = samples[samples.length - 1]?.position;
      if (previousPosition) totalMotion += previousPosition.distanceTo(position);
      samples.push({ position, tangent: tangent.clone(), motion: totalMotion });
    }
  }

  return { samples, totalMotion, pathDistance };
}

function samplePingPongMotionTrack(track, progress) {
  if (!track || track.samples.length === 0) {
    return { position: new THREE.Vector3(), tangent: new THREE.Vector3(1, 0, 0) };
  }

  if (track.samples.length === 1 || track.totalMotion <= 0) {
    return { position: track.samples[0].position.clone(), tangent: track.samples[0].tangent.clone() };
  }

  const pingPong = Math.floor(progress * 2) % 2 === 1;
  const halfProgress = (progress * 2) % 1;
  let targetMotion = easeInOutSine(halfProgress) * track.totalMotion;
  if (pingPong) targetMotion = track.totalMotion - targetMotion;

  const sample = sampleMotionTrackAt(track, targetMotion);
  if (pingPong) sample.tangent.multiplyScalar(-1);
  return sample;
}

function sampleMotionTrackAt(track, targetMotion) {
  const samples = track.samples;
  for (let i = 1; i < samples.length; i += 1) {
    const previous = samples[i - 1];
    const current = samples[i];
    if (current.motion < targetMotion) continue;

    const span = Math.max(current.motion - previous.motion, 0.0001);
    const t = (targetMotion - previous.motion) / span;
    return {
      position: previous.position.clone().lerp(current.position, t),
      tangent: previous.tangent.clone().lerp(current.tangent, t).normalize()
    };
  }

  const last = samples[samples.length - 1];
  return { position: last.position.clone(), tangent: last.tangent.clone() };
}

function measurePath(points) {
  let distance = 0;
  for (let i = 1; i < points.length; i += 1) distance += points[i - 1].distanceTo(points[i]);
  return distance;
}

function easeInOutSine(value) {
  return -(Math.cos(Math.PI * value) - 1) / 2;
}

function hashUnit(input) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 100000) / 100000;
}

function clearGroup(group) {
  while (group.children.length > 0) {
    const child = group.children.pop();
    child.traverse?.(object => {
      object.geometry?.dispose?.();
      if (Array.isArray(object.material)) {
        object.material.forEach(material => material.dispose?.());
      } else {
        object.material?.dispose?.();
      }
    });
  }
}
