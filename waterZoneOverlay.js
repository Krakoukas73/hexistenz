import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { EDGE_COLOR, EDGE_ORDER, EDGE_TYPES, HEX_SIZE } from './config.js';
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
const HALO_Y = 0.115;
const LABEL_Y = 0.16;

const textTextureCache = new Map();

export function createWaterZoneOverlay() {
  const group = new THREE.Group();
  group.name = 'texture-zone-overlay';
  return group;
}

export function rebuildWaterZoneOverlay(overlay, placedTiles) {
  clearGroup(overlay);
  resetPlacedValueLabels(placedTiles);

  const visited = new Set();

  for (const placedTile of placedTiles.values()) {
    for (const edge of EDGE_ORDER) {
      const type = getTileEdgeType(placedTile, edge);
      const nodeKey = makeNodeKey(placedTile.key, edge);
      if (visited.has(nodeKey) || !isSupportedZoneType(type)) continue;

      const zone = collectTextureZone(placedTile, edge, type, placedTiles, visited);
      if (zone.sectors.length < 2) continue;

      hideZoneDetailLabels(zone);
      overlay.add(createZoneLabel(zone));
    }
  }
}


function resetPlacedValueLabels(placedTiles) {
  for (const placedTile of placedTiles.values()) {
    setTileValueLabelsVisible(placedTile, true);
  }
}

function hideZoneDetailLabels(zone) {
  for (const sectorRef of zone.sectors) {
    setTileValueLabelsVisible(sectorRef.tile, false, sectorRef.edge);
  }
}

function setTileValueLabelsVisible(placedTile, visible, edge = null) {
  placedTile.mesh?.traverse?.(object => {
    if (!object.userData?.isValueLabel) return;
    if (edge !== null && object.userData.edgeKey !== edge) return;
    object.visible = visible;
  });
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

  return { type, sectors, total };
}

function getTextureNeighbors(placedTile, edge, type, placedTiles) {
  const neighbors = [];

  // Le centre d'une tuile relie tous les triangles de même texture qui le touchent.
  // C'est ce qui force le recalcul global : deux paquets voisins deviennent une seule zone.
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

function createZoneBoundary(zone, placedTiles) {
  const points = [];
  const sectorSet = new Set(zone.sectors.map(sector => makeNodeKey(sector.tile.key, sector.edge)));

  for (const sectorRef of zone.sectors) {
    for (const side of getBoundarySides(sectorRef.tile, sectorRef.edge, placedTiles, sectorSet)) {
      points.push(side.from, side.to);
    }
  }

  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color: getZoneColor(zone.type),
    transparent: true,
    opacity: 0.95
  });

  const lineSegments = new THREE.LineSegments(geometry, material);
  lineSegments.name = `${zone.type}-zone-halo`;
  return lineSegments;
}

function getBoundarySides(placedTile, edge, placedTiles, sectorSet) {
  const sector = SECTOR_BY_KEY[edge];
  const vertices = createOuterVertices();
  const world = axialToWorld(placedTile.q, placedTile.r);
  const center = new THREE.Vector3(world.x, HALO_Y, world.z);
  const vertexA = toWorldVector(world, vertices[sector.a]);
  const vertexB = toWorldVector(world, vertices[sector.b]);
  const sides = [];
  const edgeIndex = EDGE_ORDER.indexOf(edge);
  const previousEdge = EDGE_ORDER[(edgeIndex + EDGE_ORDER.length - 1) % EDGE_ORDER.length];
  const nextEdge = EDGE_ORDER[(edgeIndex + 1) % EDGE_ORDER.length];

  if (!sectorSet.has(makeNodeKey(placedTile.key, previousEdge))) sides.push({ from: center, to: vertexA });
  if (!sectorSet.has(makeNodeKey(placedTile.key, nextEdge))) sides.push({ from: vertexB, to: center });

  const direction = DIRECTION_BY_EDGE[edge];
  const neighborKey = direction ? makeHexKey(placedTile.q + direction.q, placedTile.r + direction.r) : null;
  const oppositeEdge = getOppositeEdge(edge);
  const touchesSameTextureAcrossTile = neighborKey && sectorSet.has(makeNodeKey(neighborKey, oppositeEdge));

  if (!touchesSameTextureAcrossTile) sides.push({ from: vertexA, to: vertexB });

  return sides;
}

function createZoneLabel(zone) {
  const center = new THREE.Vector3(0, LABEL_Y, 0);

  for (const sectorRef of zone.sectors) {
    center.add(getSectorCentroid(sectorRef.tile, sectorRef.edge));
  }

  center.divideScalar(zone.sectors.length);
  center.y = LABEL_Y;

  const sprite = new THREE.Sprite(getTextSpriteMaterial(String(zone.total), zone.type));
  sprite.name = `${zone.type}-zone-label`;
  sprite.position.copy(center);
  sprite.scale.set(0.72, 0.42, 1);
  return sprite;
}

function getSectorCentroid(placedTile, edge) {
  const sector = SECTOR_BY_KEY[edge];
  const vertices = createOuterVertices();
  const world = axialToWorld(placedTile.q, placedTile.r);
  const a = toWorldVector(world, vertices[sector.a]);
  const b = toWorldVector(world, vertices[sector.b]);

  return new THREE.Vector3(
    (world.x + a.x + b.x) / 3,
    LABEL_Y,
    (world.z + a.z + b.z) / 3
  );
}

function createOuterVertices(radius = HEX_SIZE * 0.94) {
  const vertices = [];

  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i;
    vertices.push({
      x: Math.cos(angle) * radius,
      z: Math.sin(angle) * radius
    });
  }

  return vertices;
}

function toWorldVector(world, local) {
  return new THREE.Vector3(world.x + local.x, HALO_Y, world.z + local.z);
}

function getTextSpriteMaterial(text, type) {
  const cacheKey = `${type}:${text}`;
  if (textTextureCache.has(cacheKey)) return textTextureCache.get(cacheKey);

  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = getLabelBackground(type);
  ctx.roundRect(18, 10, 92, 44, 14);
  ctx.fill();
  ctx.font = 'bold 34px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, 64, 33);

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  textTextureCache.set(cacheKey, material);
  return material;
}

function getLabelBackground(type) {
  const color = new THREE.Color(getZoneColor(type));
  return `rgba(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)}, 0.78)`;
}

function clearGroup(group) {
  while (group.children.length > 0) {
    const child = group.children.pop();
    child.traverse?.(object => {
      object.geometry?.dispose?.();
      object.material?.dispose?.();
    });
  }
}

function getTileEdgeType(placedTile, edge) {
  return getEdgeType(placedTile.tile.edges[edge]);
}

function getTileCenterType(placedTile) {
  return placedTile.tile.center ?? null;
}

function getZoneColor(type) {
  return EDGE_COLOR[type] ?? 0xffffff;
}

function isSupportedZoneType(type) {
  return Object.values(EDGE_TYPES).includes(type);
}

function makeNodeKey(tileKey, edge) {
  return `${tileKey}:${edge}`;
}
