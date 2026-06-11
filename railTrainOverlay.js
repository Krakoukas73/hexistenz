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

const TRAIN_Y = (TILE_VISUAL.railY ?? 0.052) + 0.04;
const TRAIN_SPEED = 0.30;
const TRAIN_CURVE_SLOW_DISTANCE = HEX_SIZE * 0.32;
const TRAIN_TERMINUS_SLOW_DISTANCE = HEX_SIZE * 0.58;
const TRAIN_SCALE = HEX_SIZE * 0.22;
const PORT_INSET = 0.18;

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
    if (component.tileKeys.size < 2) continue;

    const path = findLongestPath(graph, component.nodes);
    if (path.length < 2) continue;

    const points = path.map(nodeId => graph.nodes.get(nodeId).position.clone());
    const distance = measurePath(points);
    if (distance < HEX_SIZE * 1.05) continue;

    const trainObject = createTrainObject();
    trainObject.position.copy(points[0]);
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
    const sample = samplePingPongMotionTrack(train.motionTrack, progress);

    train.object.position.copy(sample.position);
    train.object.position.y = TRAIN_Y;
    train.object.rotation.y = -Math.atan2(sample.tangent.z, sample.tangent.x);

    const pulse = 1 + Math.sin(timeSeconds * 8) * 0.035;
    train.object.scale.setScalar(pulse);
    updateTrainSmoke(train.object, timeSeconds + train.offset * 10);
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

function createTrainObject() {
  const group = new THREE.Group();
  group.name = 'animatedRailTrain';

  const base = new THREE.Mesh(
    new THREE.BoxGeometry(TRAIN_SCALE * 2.05, TRAIN_SCALE * 0.22, TRAIN_SCALE * 0.86),
    getMaterial('base', 0x2D3436, 1)
  );
  base.position.set(TRAIN_SCALE * 0.18, TRAIN_SCALE * 0.11, 0);
  base.renderOrder = 46;
  group.add(base);

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(TRAIN_SCALE * 1.32, TRAIN_SCALE * 0.52, TRAIN_SCALE * 0.78),
    getMaterial('body', 0xD83A2E, 1)
  );
  body.position.set(TRAIN_SCALE * 0.32, TRAIN_SCALE * 0.42, 0);
  body.renderOrder = 47;
  group.add(body);

  const boiler = new THREE.Mesh(
    new THREE.CylinderGeometry(TRAIN_SCALE * 0.34, TRAIN_SCALE * 0.34, TRAIN_SCALE * 1.18, 18),
    getMaterial('boiler', 0xC7362D, 1)
  );
  boiler.rotation.z = Math.PI / 2;
  boiler.position.set(TRAIN_SCALE * 0.46, TRAIN_SCALE * 0.55, 0);
  boiler.renderOrder = 48;
  group.add(boiler);

  const boilerCap = new THREE.Mesh(
    new THREE.CylinderGeometry(TRAIN_SCALE * 0.37, TRAIN_SCALE * 0.37, TRAIN_SCALE * 0.08, 18),
    getMaterial('boilerCap', 0xF2994A, 1)
  );
  boilerCap.rotation.z = Math.PI / 2;
  boilerCap.position.set(TRAIN_SCALE * 1.08, TRAIN_SCALE * 0.55, 0);
  boilerCap.renderOrder = 49;
  group.add(boilerCap);

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(TRAIN_SCALE * 0.72, TRAIN_SCALE * 0.82, TRAIN_SCALE * 0.86),
    getMaterial('cabin', 0xF2C94C, 1)
  );
  cabin.position.set(-TRAIN_SCALE * 0.58, TRAIN_SCALE * 0.64, 0);
  cabin.renderOrder = 49;
  group.add(cabin);

  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(TRAIN_SCALE * 0.88, TRAIN_SCALE * 0.16, TRAIN_SCALE * 1.0),
    getMaterial('roof', 0x222831, 1)
  );
  roof.position.set(-TRAIN_SCALE * 0.58, TRAIN_SCALE * 1.12, 0);
  roof.renderOrder = 50;
  group.add(roof);

  for (const z of [-0.46, 0.46]) {
    const window = new THREE.Mesh(
      new THREE.PlaneGeometry(TRAIN_SCALE * 0.34, TRAIN_SCALE * 0.28),
      getMaterial('window', 0x9BE7FF, 0.9)
    );
    window.rotation.y = z < 0 ? Math.PI / 2 : -Math.PI / 2;
    window.position.set(-TRAIN_SCALE * 0.58, TRAIN_SCALE * 0.74, TRAIN_SCALE * z);
    window.renderOrder = 51;
    group.add(window);
  }

  const chimney = new THREE.Mesh(
    new THREE.CylinderGeometry(TRAIN_SCALE * 0.13, TRAIN_SCALE * 0.17, TRAIN_SCALE * 0.55, 14),
    getMaterial('dark', 0x171A1F, 1)
  );
  chimney.position.set(TRAIN_SCALE * 0.78, TRAIN_SCALE * 0.95, 0);
  chimney.renderOrder = 51;
  group.add(chimney);

  const headLamp = new THREE.Mesh(
    new THREE.SphereGeometry(TRAIN_SCALE * 0.12, 12, 8),
    getMaterial('lamp', 0xFFF2A6, 1)
  );
  headLamp.position.set(TRAIN_SCALE * 1.18, TRAIN_SCALE * 0.58, 0);
  headLamp.renderOrder = 52;
  group.add(headLamp);

  const cowcatcher = new THREE.Mesh(
    new THREE.ConeGeometry(TRAIN_SCALE * 0.36, TRAIN_SCALE * 0.36, 4),
    getMaterial('cowcatcher', 0x3E464C, 1)
  );
  cowcatcher.rotation.z = -Math.PI / 2;
  cowcatcher.rotation.y = Math.PI / 4;
  cowcatcher.position.set(TRAIN_SCALE * 1.36, TRAIN_SCALE * 0.18, 0);
  cowcatcher.renderOrder = 49;
  group.add(cowcatcher);

  for (const x of [-0.72, -0.22, 0.38, 0.88]) {
    for (const z of [-0.46, 0.46]) {
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(TRAIN_SCALE * 0.17, TRAIN_SCALE * 0.17, TRAIN_SCALE * 0.12, 16),
        getMaterial('wheel', 0x101317, 1)
      );
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(TRAIN_SCALE * x, TRAIN_SCALE * 0.04, TRAIN_SCALE * z);
      wheel.renderOrder = 52;
      group.add(wheel);

      const hub = new THREE.Mesh(
        new THREE.CylinderGeometry(TRAIN_SCALE * 0.07, TRAIN_SCALE * 0.07, TRAIN_SCALE * 0.135, 12),
        getMaterial('hub', 0xD8DEE9, 1)
      );
      hub.rotation.x = Math.PI / 2;
      hub.position.copy(wheel.position);
      hub.renderOrder = 53;
      group.add(hub);
    }
  }

  const wagon = new THREE.Mesh(
    new THREE.BoxGeometry(TRAIN_SCALE * 0.98, TRAIN_SCALE * 0.44, TRAIN_SCALE * 0.78),
    getMaterial('wagon', 0x6C5CE7, 1)
  );
  wagon.position.set(-TRAIN_SCALE * 1.5, TRAIN_SCALE * 0.38, 0);
  wagon.renderOrder = 47;
  group.add(wagon);

  const wagonRoof = new THREE.Mesh(
    new THREE.BoxGeometry(TRAIN_SCALE * 1.08, TRAIN_SCALE * 0.13, TRAIN_SCALE * 0.88),
    getMaterial('wagonRoof', 0x2D3436, 1)
  );
  wagonRoof.position.set(-TRAIN_SCALE * 1.5, TRAIN_SCALE * 0.68, 0);
  wagonRoof.renderOrder = 48;
  group.add(wagonRoof);

  const coupler = new THREE.Mesh(
    new THREE.BoxGeometry(TRAIN_SCALE * 0.34, TRAIN_SCALE * 0.08, TRAIN_SCALE * 0.12),
    getMaterial('coupler', 0x1F252A, 1)
  );
  coupler.position.set(-TRAIN_SCALE * 1.02, TRAIN_SCALE * 0.22, 0);
  coupler.renderOrder = 52;
  group.add(coupler);

  for (const x of [-1.78, -1.22]) {
    for (const z of [-0.43, 0.43]) {
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(TRAIN_SCALE * 0.14, TRAIN_SCALE * 0.14, TRAIN_SCALE * 0.11, 14),
        getMaterial('wheel', 0x101317, 1)
      );
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(TRAIN_SCALE * x, TRAIN_SCALE * 0.035, TRAIN_SCALE * z);
      wheel.renderOrder = 52;
      group.add(wheel);
    }
  }

  const smokePuffs = [];
  const smokeMaterial = new THREE.MeshBasicMaterial({
    color: 0xEEF4F7,
    transparent: true,
    opacity: 0.74,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide
  });

  for (let i = 0; i < 90; i += 1) {
    const smoke = new THREE.Mesh(
      new THREE.CircleGeometry(TRAIN_SCALE * (0.16 + (i % 5) * 0.045), 22),
      smokeMaterial.clone()
    );
    smoke.name = 'chimney-heavy-animated-smoke';
    smoke.rotation.x = -Math.PI / 2;
    smoke.renderOrder = 54 + i;
    group.add(smoke);
    smokePuffs.push({
      mesh: smoke,
      phase: i / 90,
      drift: (i % 2 === 0 ? 1 : -1) * (0.045 + (i % 5) * 0.018),
      wobble: 0.65 + (i % 5) * 0.17
    });
  }

  group.userData.smokePuffs = smokePuffs;
  return group;
}

function updateTrainSmoke(trainObject, timeSeconds) {
  const smokePuffs = trainObject.userData.smokePuffs ?? [];

  for (let i = 0; i < smokePuffs.length; i += 1) {
    const puff = smokePuffs[i];
    const t = (timeSeconds * 0.78 + puff.phase) % 1;
    const rise = smoothstep(0, 1, t);
    const spread = 0.85 + rise * 5.8;
    const sideWobble = Math.sin(timeSeconds * (1.7 + puff.wobble) + i * 1.83) * TRAIN_SCALE * 0.22;

    puff.mesh.position.set(
      TRAIN_SCALE * (0.80 - rise * 1.15),
      TRAIN_SCALE * (1.16 + rise * 10.5),
      TRAIN_SCALE * (puff.drift + Math.sin(t * Math.PI * 2 + i) * 0.34) + sideWobble
    );

    const scale = spread * (0.96 + Math.sin(timeSeconds * 4.1 + i) * 0.10);
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
    depthWrite: false,
    depthTest: true
  });

  materialCache.set(key, material);
  return material;
}

function samplePingPongMotionTrack(track, progress) {
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
  if (pingPong) targetMotion = track.totalMotion - targetMotion;

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
