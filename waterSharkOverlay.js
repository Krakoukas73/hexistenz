import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';
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

const CENTER_RADIUS = HEX_SIZE * TILE_VISUAL.centerRadiusScale;
const WATER_SURFACE_Y = TILE_VISUAL.waterY ?? 0;
const MIN_ZONE_SECTORS = 2;
const BOATS_PER_WATER_COMPONENT = 1;
const BOAT_SPEED = 0.13;
const BOAT_HEADING_OFFSET = Math.PI;
const BOAT_MODEL_URL = './glb/bateau.glb';
const BOAT_TARGET_LENGTH = HEX_SIZE * 0.98;
const BOAT_Y_OFFSET = -0.018;
let boatPrototype = null;
let boatLoading = false;
let boatRequested = false;
const PORT_INSET = 0.52;
const FIN_WIDTH = HEX_SIZE * 0.058;
const FIN_HEIGHT = HEX_SIZE * 0.185;
const FIN_LENGTH = HEX_SIZE * 0.36;

export function createWaterSharkOverlay() {
  const group = new THREE.Group();
  group.name = 'waterSharkOverlay';
  group.userData.sharks = [];
  ensureBoatModel(group);
  return group;
}

export function rebuildWaterSharkOverlay(group, placedTiles) {
  group.userData.lastPlacedTiles = placedTiles;
  clearGroup(group);
  group.userData.sharks = [];

  if (!boatPrototype) {
    ensureBoatModel(group);
    return;
  }

  const visited = new Set();
  let zoneIndex = 0;

  for (const placedTile of placedTiles.values()) {
    for (const edge of EDGE_ORDER) {
      const nodeKey = makeNodeKey(placedTile.key, edge);
      if (visited.has(nodeKey) || !isWaterEdge(placedTile, edge)) continue;

      const zone = collectWaterZone(placedTile, edge, placedTiles, visited);
      if (zone.sectors.length < MIN_ZONE_SECTORS) continue;

      addZoneSharks(group, zone, zoneIndex++);
    }
  }
}


export function countWaterBoats(placedTiles) {
  const visited = new Set();
  let zoneIndex = 0;
  let boats = 0;

  for (const placedTile of placedTiles.values()) {
    for (const edge of EDGE_ORDER) {
      const nodeKey = makeNodeKey(placedTile.key, edge);
      if (visited.has(nodeKey) || !isWaterEdge(placedTile, edge)) continue;

      const zone = collectWaterZone(placedTile, edge, placedTiles, visited);
      if (zone.sectors.length < MIN_ZONE_SECTORS) continue;

      boats += countZoneBoats(zone, zoneIndex++);
    }
  }

  return boats;
}

function countZoneBoats(zone, zoneIndex = 0) {
  const graph = buildWaterGraph(zone);
  const components = findComponents(graph);
  let boats = 0;

  for (const component of components) {
    if (component.nodes.length < MIN_ZONE_SECTORS) continue;

    const path = findLongestPath(graph, component.nodes);
    if (path.length < 2) continue;

    const points = path.map(nodeId => graph.nodes.get(nodeId).position.clone());
    const distance = measurePath(points);
    if (distance < HEX_SIZE * 0.58) continue;

    boats += BOATS_PER_WATER_COMPONENT;
  }

  return boats;
}

export function updateWaterSharkOverlay(group, timeSeconds = 0) {
  const sharks = group.userData.sharks ?? [];

  for (const shark of sharks) {
    const drift = Math.sin(timeSeconds * 0.37 + shark.offset * Math.PI * 2) * 0.018;
    const progress = (timeSeconds * BOAT_SPEED / Math.max(shark.distance, 0.001) + shark.offset + drift) % 1;
    const sample = samplePingPongMotionTrack(shark.motionTrack, progress);
    const bob = Math.sin((timeSeconds * 1.15) + shark.offset * Math.PI * 2) * 0.004;

    shark.object.position.copy(sample.position);
    shark.object.position.y = WATER_SURFACE_Y + BOAT_Y_OFFSET + bob;
    shark.object.rotation.y = -Math.atan2(sample.tangent.z, sample.tangent.x) + BOAT_HEADING_OFFSET;
    shark.object.visible = true;
  }
}

function addZoneSharks(group, zone, zoneIndex) {
  const graph = buildWaterGraph(zone);
  const components = findComponents(graph);

  for (const component of components) {
    if (component.nodes.length < MIN_ZONE_SECTORS) continue;

    const path = findLongestPath(graph, component.nodes);
    if (path.length < 2) continue;

    const points = path.map(nodeId => graph.nodes.get(nodeId).position.clone());
    const distance = measurePath(points);
    if (distance < HEX_SIZE * 0.58) continue;

    const boatCount = BOATS_PER_WATER_COMPONENT;
    const motionTrack = buildMotionTrack(points);

    for (let index = 0; index < boatCount; index++) {
      const seedKey = `water-zone:${zoneIndex}:component:${component.index}:boat:${index}`;
      const object = createSharkObject(seedKey);
      object.position.copy(points[0]);
      group.add(object);

      group.userData.sharks.push({
        object,
        motionTrack,
        distance,
        offset: hashUnit(`${seedKey}:offset`)
      });
    }
  }
}

function createSharkObject(seedKey) {
  const group = new THREE.Group();
  group.name = 'animated-water-boat-glb';
  const scale = 0.92 + hashUnit(`${seedKey}:scale`) * 0.18;
  group.scale.setScalar(scale);

  const boat = createBoatModel(seedKey);

  group.add(boat);
  group.userData = { boat };
  return group;
}

function ensureBoatModel(group) {
  if (boatLoading || boatRequested) return;
  boatLoading = true;
  boatRequested = true;

  new GLTFLoader().load(
    BOAT_MODEL_URL,
    gltf => {
      boatPrototype = prepareBoatPrototype(gltf.scene);
      boatLoading = false;
      const lastPlacedTiles = group.userData.lastPlacedTiles;
      if (lastPlacedTiles) rebuildWaterSharkOverlay(group, lastPlacedTiles);
    },
    undefined,
    error => {
      boatLoading = false;
      console.warn(`Modèle bateau GLB indisponible : ${BOAT_MODEL_URL}`, error);
    }
  );
}

function prepareBoatPrototype(model) {
  const wrapper = new THREE.Group();
  wrapper.name = 'normalized-water-boat';

  const source = model.clone(true);
  const box = new THREE.Box3().setFromObject(source);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  source.position.set(-center.x, -box.min.y, -center.z);

  const length = Math.max(size.x, size.z) || 1;
  wrapper.scale.setScalar(BOAT_TARGET_LENGTH / length);
  wrapper.add(source);

  wrapper.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    if (object.material) object.material = cloneBoatMaterial(object.material);
  });

  return wrapper;
}

function cloneBoatMaterial(material) {
  if (Array.isArray(material)) return material.map(item => cloneBoatMaterial(item));
  const cloned = material.clone();
  cloned.side = THREE.DoubleSide;
  if ('emissiveIntensity' in cloned) cloned.emissiveIntensity = 0;
  if ('toneMapped' in cloned) cloned.toneMapped = true;
  cloned.needsUpdate = true;
  return cloned;
}

function createBoatModel(seedKey) {
  const boat = boatPrototype ? boatPrototype.clone(true) : new THREE.Group();
  boat.name = 'water-boat-glb-instance';
  boat.rotation.y = 0;
  return boat;
}

function createLowPolyFin(seedKey) {
  const w = FIN_WIDTH * (0.84 + hashUnit(`${seedKey}:w`) * 0.18);
  const h = FIN_HEIGHT * (0.92 + hashUnit(`${seedKey}:h`) * 0.10);
  const l = FIN_LENGTH * (0.96 + hashUnit(`${seedKey}:l`) * 0.12);
  const tipZ = -l * 0.24;

  const vertices = new Float32Array([
    // left face: sharper swept dorsal fin, thin at the water line
    -w * 0.40, 0.005, -l * 0.50,
    -w * 0.15, 0.005,  l * 0.48,
     0.00,     h,       tipZ,

    // right face
     w * 0.40, 0.005, -l * 0.50,
     0.00,     h,       tipZ,
     w * 0.15, 0.005,  l * 0.48,

    // sharp leading ridge
    -w * 0.40, 0.005, -l * 0.50,
     0.00,     h,       tipZ,
     w * 0.40, 0.005, -l * 0.50,

    // fine trailing taper, less blocky than the previous polygon
    -w * 0.15, 0.005,  l * 0.48,
     w * 0.15, 0.005,  l * 0.48,
     0.00,     h,       tipZ,

    // very narrow base just kissing water surface
    -w * 0.40, 0.000, -l * 0.50,
     w * 0.40, 0.000, -l * 0.50,
     w * 0.15, 0.000,  l * 0.48,
    -w * 0.40, 0.000, -l * 0.50,
     w * 0.15, 0.000,  l * 0.48,
    -w * 0.15, 0.000,  l * 0.48
  ]);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();

  const shade = 0.055 + hashUnit(`${seedKey}:shade`) * 0.055;
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(shade, shade * 1.06, shade * 1.18),
    roughness: 0.92,
    metalness: 0.02,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    flatShading: true,
    side: THREE.DoubleSide
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'shark-dorsal-fin-faithful';
  mesh.renderOrder = 72;
  return mesh;
}

function createSubsurfaceBody(seedKey) {
  const geometry = new THREE.EllipseCurve(0, 0, HEX_SIZE * 0.10, HEX_SIZE * 0.28, 0, Math.PI * 2).getPoints(24);
  const shape = new THREE.Shape(geometry);
  const mesh = new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    new THREE.MeshBasicMaterial({
      color: 0x071015,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
      side: THREE.DoubleSide
    })
  );
  mesh.name = 'shark-subsurface-shadow';
  mesh.rotation.x = -Math.PI / 2;
  mesh.rotation.z = hashUnit(`${seedKey}:body-rot`) * 0.16 - 0.08;
  mesh.position.y = -0.006;
  mesh.renderOrder = 68;
  return mesh;
}

function createWakeStroke(seedKey, side) {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(side * HEX_SIZE * 0.075, 0, HEX_SIZE * 0.04),
    new THREE.Vector3(side * HEX_SIZE * 0.13, 0, HEX_SIZE * 0.19),
    new THREE.Vector3(side * HEX_SIZE * 0.09, 0, HEX_SIZE * 0.34)
  ]);
  const geometry = new THREE.TubeGeometry(curve, 10, HEX_SIZE * 0.008, 5, false);
  const material = new THREE.MeshBasicMaterial({
    color: 0xd8f2ff,
    transparent: true,
    opacity: 0.28,
    depthWrite: false
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = side < 0 ? 'shark-left-wake' : 'shark-right-wake';
  mesh.position.y = 0.004;
  mesh.renderOrder = 69;
  return mesh;
}

function createSurfaceRipple(seedKey) {
  const geometry = new THREE.RingGeometry(HEX_SIZE * 0.08, HEX_SIZE * 0.105, 28);
  const material = new THREE.MeshBasicMaterial({
    color: 0xd8f2ff,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    side: THREE.DoubleSide
  });

  const ring = new THREE.Mesh(geometry, material);
  ring.name = 'shark-surface-ripple';
  ring.position.y = 0.002;
  ring.rotation.x = -Math.PI / 2;
  ring.rotation.z = hashUnit(`${seedKey}:ripple-rot`) * Math.PI;
  ring.renderOrder = 67;
  return ring;
}

function collectWaterZone(startTile, startEdge, placedTiles, visited) {
  const stack = [{ tile: startTile, edge: startEdge }];
  const sectors = [];

  while (stack.length > 0) {
    const current = stack.pop();
    const nodeKey = makeNodeKey(current.tile.key, current.edge);
    if (visited.has(nodeKey) || !isWaterEdge(current.tile, current.edge)) continue;

    visited.add(nodeKey);
    sectors.push(current);

    for (const neighbor of getWaterNeighbors(current.tile, current.edge, placedTiles)) {
      const neighborKey = makeNodeKey(neighbor.tile.key, neighbor.edge);
      if (!visited.has(neighborKey)) stack.push(neighbor);
    }
  }

  return { sectors };
}

function buildWaterGraph(zone) {
  const graph = { nodes: new Map(), adjacency: new Map() };
  const zoneNodeIds = new Set(zone.sectors.map(sector => makeNodeKey(sector.tile.key, sector.edge)));

  for (const sectorRef of zone.sectors) {
    const nodeId = makeNodeKey(sectorRef.tile.key, sectorRef.edge);
    addNode(graph, nodeId, getSectorWaterPoint(sectorRef.tile, sectorRef.edge), sectorRef.tile.key);
  }

  for (const sectorRef of zone.sectors) {
    const fromId = makeNodeKey(sectorRef.tile.key, sectorRef.edge);
    for (const neighbor of getWaterNeighbors(sectorRef.tile, sectorRef.edge, new Map(zone.sectors.map(item => [item.tile.key, item.tile])))) {
      const toId = makeNodeKey(neighbor.tile.key, neighbor.edge);
      if (zoneNodeIds.has(toId)) addEdge(graph, fromId, toId);
    }
  }

  return graph;
}

function getWaterNeighbors(placedTile, edge, placedTiles) {
  const neighbors = [];

  if (getTileCenterType(placedTile) === EDGE_TYPES.water) {
    for (const sameTileEdge of EDGE_ORDER) {
      if (sameTileEdge !== edge && isWaterEdge(placedTile, sameTileEdge)) {
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
    if (isWaterEdge(placedTile, internalEdge)) neighbors.push({ tile: placedTile, edge: internalEdge });
  }

  const direction = DIRECTION_BY_EDGE[edge];
  if (!direction) return neighbors;

  const neighborTile = placedTiles.get(makeHexKey(placedTile.q + direction.q, placedTile.r + direction.r));
  const oppositeEdge = getOppositeEdge(edge);

  if (neighborTile && isWaterEdge(neighborTile, oppositeEdge)) {
    neighbors.push({ tile: neighborTile, edge: oppositeEdge });
  }

  return neighbors;
}

function getSectorWaterPoint(placedTile, edge) {
  const sector = SECTOR_BY_KEY[edge];
  const outerVertices = createOuterVertices();
  const innerVertices = createOuterVertices(CENTER_RADIUS);
  const world = axialToWorld(placedTile.q, placedTile.r);

  const outerMid = midpoint(outerVertices[sector.a], outerVertices[sector.b]);
  const innerMid = midpoint(innerVertices[sector.a], innerVertices[sector.b]);
  const point = new THREE.Vector3(
    innerMid.x + (outerMid.x - innerMid.x) * PORT_INSET,
    WATER_SURFACE_Y,
    innerMid.z + (outerMid.z - innerMid.z) * PORT_INSET
  );

  return new THREE.Vector3(world.x + point.x, WATER_SURFACE_Y, world.z + point.z);
}

function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
}

function createOuterVertices(radius = HEX_SIZE * TILE_VISUAL.radiusScale) {
  const vertices = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i;
    vertices.push({ x: Math.cos(angle) * radius, z: Math.sin(angle) * radius });
  }
  return vertices;
}

function isWaterEdge(placedTile, edge) {
  return getEdgeType(placedTile?.tile?.edges?.[edge]) === EDGE_TYPES.water;
}

function getTileCenterType(placedTile) {
  return placedTile.tile.center ?? null;
}

function makeNodeKey(tileKey, edge) {
  return `${tileKey}:${edge}`;
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

  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i];
    const to = points[i + 1];
    const segmentVector = to.clone().sub(from);
    const segmentDistance = segmentVector.length();
    if (segmentDistance <= 0) continue;

    const tangent = segmentVector.clone().normalize();
    const steps = Math.max(8, Math.ceil(segmentDistance / (HEX_SIZE * 0.055)));

    for (let step = 0; step <= steps; step++) {
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
  for (let i = 1; i < samples.length; i++) {
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
  for (let i = 1; i < points.length; i++) distance += points[i - 1].distanceTo(points[i]);
  return distance;
}

function positiveModulo(value, modulo) {
  return ((value % modulo) + modulo) % modulo;
}

function smoothstep(edge0, edge1, value) {
  const x = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return x * x * (3 - 2 * x);
}

function easeInOutSine(value) {
  return -(Math.cos(Math.PI * value) - 1) / 2;
}

function hashUnit(input) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
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
