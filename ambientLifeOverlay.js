import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { EDGE_ORDER, EDGE_TYPES, HEX_SIZE, TILE_VISUAL } from './config.js';
import { axialToWorld, makeHexKey } from './hex.js';
import { HEX_DIRECTIONS, getOppositeEdge } from './placementRules.js';
import { getEdgeType, getEdgeValue } from './tileGenerator.js';

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
const WATER_CREATURE_Y = 0.15;

export function createAmbientLifeOverlay() {
  const group = new THREE.Group();
  group.name = 'ambient-life-overlay';
  return group;
}

export function rebuildAmbientLifeOverlay(overlay, placedTiles) {
  clearGroup(overlay);
  const zones = collectWaterZones(placedTiles);

  for (const zone of zones) {
    if (zone.sectors.length < 2 || zone.total < 2) continue;
    overlay.add(createWaterCreatures(zone));
  }
}

export function updateAmbientLifeOverlay(overlay, elapsedSeconds) {
  overlay.traverse(object => {
    const data = object.userData;
    if (!data?.ambientKind) return;

    if (data.ambientKind === 'dolphin') {
      const t = elapsedSeconds * data.speed + data.phase;
      const jump = Math.max(0, Math.sin(t));
      object.position.set(
        data.baseX + Math.cos(t * 0.48) * data.range,
        WATER_CREATURE_Y + jump * data.jumpHeight,
        data.baseZ + Math.sin(t * 0.48) * data.range * 0.7
      );
      object.rotation.y = data.baseRotation + Math.cos(t * 0.48) * 0.8;
      object.rotation.z = Math.cos(t) * 0.5;
      object.visible = jump > 0.09;
      return;
    }

    if (data.ambientKind === 'whale') {
      const t = elapsedSeconds * data.speed + data.phase;
      const surface = Math.max(0, Math.sin(t));
      object.position.set(
        data.baseX + Math.cos(t * 0.28) * data.range,
        WATER_CREATURE_Y + 0.01 + surface * 0.11,
        data.baseZ + Math.sin(t * 0.28) * data.range * 0.5
      );
      object.rotation.y = data.baseRotation + Math.sin(t * 0.28) * 0.45;
      object.rotation.z = Math.sin(t) * 0.13;
      object.visible = Math.sin(t) > -0.48;
    }
  });
}

function collectWaterZones(placedTiles) {
  const visited = new Set();
  const zones = [];

  for (const placedTile of placedTiles.values()) {
    for (const edge of EDGE_ORDER) {
      const type = getTileEdgeType(placedTile, edge);
      const nodeKey = makeNodeKey(placedTile.key, edge);
      if (visited.has(nodeKey) || type !== EDGE_TYPES.water) continue;

      const zone = collectTextureZone(placedTile, edge, type, placedTiles, visited);
      if (zone.sectors.length >= 2) zones.push(zone);
    }
  }

  return zones;
}

function collectTextureZone(startTile, startEdge, type, placedTiles, visited) {
  const stack = [{ tile: startTile, edge: startEdge }];
  const sectors = [];
  let total = 0;

  while (stack.length > 0) {
    const current = stack.pop();
    const nodeKey = makeNodeKey(current.tile.key, current.edge);
    if (visited.has(nodeKey)) continue;
    if (getTileEdgeType(current.tile, current.edge) !== type) continue;

    visited.add(nodeKey);
    sectors.push(current);
    total += getEdgeValue(current.tile.tile.edges[current.edge]);

    for (const neighbor of getTextureNeighbors(current.tile, current.edge, type, placedTiles)) {
      const neighborKey = makeNodeKey(neighbor.tile.key, neighbor.edge);
      if (!visited.has(neighborKey)) stack.push(neighbor);
    }
  }

  return { type, sectors, total, center: getZoneCenter(sectors) };
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

function createWaterCreatures(zone) {
  const group = new THREE.Group();
  group.name = 'water-creatures-svg-style';

  zone.sectors.forEach((sectorRef, index) => {
    const seed = hashNumber(`${sectorRef.tile.key}:${sectorRef.edge}:${zone.sectors.length}:${zone.total}`);

    // Environ 38 % par triangle d'eau, en tirage stable : dense, mais sans clignotement
    // ni recalcul aléatoire à chaque rebuild. Exemple : 25 triangles => ~9/10 animaux.
    if (seed % 100 >= 38) return;

    const center = getSectorCentroid(sectorRef.tile, sectorRef.edge);
    const localOffset = getSectorCreatureOffset(seed);
    const isWhale = zone.total >= 4 && seed % 5 === 0;
    const creature = isWhale
      ? createWhaleShape(0.22 + (seed % 4) * 0.012)
      : createDolphinShape(0.16 + (seed % 5) * 0.006);

    creature.userData = {
      ambientKind: isWhale ? 'whale' : 'dolphin',
      baseX: center.x + localOffset.x,
      baseZ: center.z + localOffset.z,
      baseRotation: (seed % 628) * 0.01,
      phase: index * 0.73 + (seed % 100) * 0.041,
      speed: isWhale ? 0.45 + (seed % 5) * 0.018 : 1.18 + (seed % 7) * 0.035,
      range: isWhale ? 0.10 + (seed % 3) * 0.018 : 0.08 + (seed % 4) * 0.018,
      jumpHeight: isWhale ? 0.10 + (seed % 3) * 0.015 : 0.18 + (seed % 4) * 0.025
    };

    group.add(creature);
  });

  return group;
}

function createDolphinShape(scale) {
  const group = new THREE.Group();
  group.name = 'animated-dolphin-svg-style';

  const bodyShape = new THREE.Shape();
  bodyShape.moveTo(-0.72, 0.00);
  bodyShape.bezierCurveTo(-0.30, 0.22, 0.30, 0.24, 0.72, 0.02);
  bodyShape.bezierCurveTo(0.32, -0.18, -0.30, -0.18, -0.72, 0.00);

  const body = new THREE.Mesh(
    new THREE.ShapeGeometry(bodyShape),
    new THREE.MeshBasicMaterial({ color: 0xD9F4FF, transparent: true, opacity: 0.92, side: THREE.DoubleSide, depthWrite: false })
  );
  body.scale.set(scale, scale, scale);
  group.add(body);

  group.add(createTriangleMesh(0xAEDFED, scale * 0.9, [[0.05, 0.04], [0.22, 0.34], [0.32, 0.04]]));
  group.add(createTriangleMesh(0xC7ECF7, scale * 0.9, [[-0.72, 0.0], [-1.03, 0.18], [-0.88, -0.02]]));
  group.add(createTriangleMesh(0xC7ECF7, scale * 0.9, [[-0.72, 0.0], [-1.03, -0.18], [-0.88, 0.02]]));

  group.rotation.x = -Math.PI / 2;
  return group;
}

function createWhaleShape(scale) {
  const group = new THREE.Group();
  group.name = 'animated-whale-svg-style';

  const shape = new THREE.Shape();
  shape.moveTo(-0.95, -0.02);
  shape.bezierCurveTo(-0.45, 0.36, 0.55, 0.34, 0.95, 0.00);
  shape.bezierCurveTo(0.45, -0.26, -0.45, -0.28, -0.95, -0.02);

  const body = new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    new THREE.MeshBasicMaterial({ color: 0x8FC9DE, transparent: true, opacity: 0.88, side: THREE.DoubleSide, depthWrite: false })
  );
  body.scale.set(scale, scale, scale);
  group.add(body);

  group.add(createTriangleMesh(0x78B3CB, scale, [[-0.96, -0.01], [-1.35, 0.24], [-1.18, -0.05]]));
  group.add(createTriangleMesh(0x78B3CB, scale, [[-0.96, -0.01], [-1.35, -0.24], [-1.18, 0.05]]));
  group.add(createTriangleMesh(0xA8D8EA, scale * 0.65, [[0.10, -0.02], [0.38, -0.26], [0.46, -0.04]]));

  group.rotation.x = -Math.PI / 2;
  return group;
}

function createTriangleMesh(color, scale, points) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  shape.lineTo(points[1][0], points[1][1]);
  shape.lineTo(points[2][0], points[2][1]);
  shape.closePath();

  const mesh = new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })
  );
  mesh.scale.set(scale, scale, scale);
  return mesh;
}

function getZoneCenter(sectors) {
  const center = new THREE.Vector3();
  for (const sectorRef of sectors) center.add(getSectorCentroid(sectorRef.tile, sectorRef.edge));
  center.divideScalar(Math.max(1, sectors.length));
  return center;
}

function getSectorCentroid(placedTile, edge) {
  const sector = SECTOR_BY_KEY[edge];
  const vertices = createOuterVertices();
  const world = axialToWorld(placedTile.q, placedTile.r);
  const a = vertices[sector.a];
  const b = vertices[sector.b];

  return new THREE.Vector3(
    world.x + (a.x + b.x) / 3,
    0,
    world.z + (a.z + b.z) / 3
  );
}


function getSectorCreatureOffset(seed) {
  const angle = (seed % 628) * 0.01;
  const radius = 0.08 + (seed % 7) * 0.012;
  return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius };
}

function getRadialOffset(index, count, radius) {
  const angle = (Math.PI * 2 * index) / Math.max(1, count);
  return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius };
}

function createOuterVertices(radius = HEX_SIZE * TILE_VISUAL.radiusScale) {
  const vertices = [];
  for (let i = 0; i < 6; i += 1) {
    const angle = (Math.PI / 3) * i;
    vertices.push({ x: Math.cos(angle) * radius, z: Math.sin(angle) * radius });
  }
  return vertices;
}

function hashNumber(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function getTileEdgeType(placedTile, edge) {
  return getEdgeType(placedTile.tile.edges[edge]);
}

function getTileCenterType(placedTile) {
  return placedTile.tile.center ?? null;
}

function makeNodeKey(tileKey, edge) {
  return `${tileKey}:${edge}`;
}

function clearGroup(group) {
  while (group.children.length > 0) {
    const child = group.children.pop();
    child.traverse?.(object => {
      object.geometry?.dispose?.();
      if (Array.isArray(object.material)) object.material.forEach(material => material.dispose?.());
      else object.material?.dispose?.();
    });
  }
}
