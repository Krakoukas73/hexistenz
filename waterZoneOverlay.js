import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { EDGE_COLOR, EDGE_ORDER, EDGE_TYPES, HEX_SIZE, TILE_VISUAL } from './config.js';
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
const HOVER_HALO_Y = 0.34;
const LABEL_Y = 0.16;
const CENTER_RADIUS = HEX_SIZE * TILE_VISUAL.centerRadiusScale;
const HOVER_HALO_RADIUS = 0.052;
const HOVER_GLOW_RADIUS = 0.15;
const HOVER_DIFFUSE_RADIUS = 0.23;

const textTextureCache = new Map();

export function createWaterZoneOverlay() {
  const group = new THREE.Group();
  group.name = 'texture-zone-overlay';
  return group;
}

export function createHoverZoneOverlay() {
  const group = new THREE.Group();
  group.name = 'hover-texture-zone-overlay';
  return group;
}

export function rebuildHoverZoneOverlay(overlay, hoverHex, worldPoint, placedTiles, zoneOverlay = null) {
  clearGroup(overlay);
  resetHoverValueLabels(placedTiles);
  resetHoverZoneLabels(zoneOverlay);
  if (!hoverHex || !worldPoint) return;

  const placedTile = placedTiles.get(makeHexKey(hoverHex.q, hoverHex.r));
  if (!placedTile) return;

  const hoveredEdge = getHoveredEdge(placedTile, worldPoint);
  const type = getTileEdgeType(placedTile, hoveredEdge);
  if (!isSupportedZoneType(type)) return;

  const zone = collectTextureZone(placedTile, hoveredEdge, type, placedTiles, new Set());

  // Un triangle isolé n'est pas une zone : pas de contour au hover, sinon ça clignote
  // partout pour rien comme un sapin de Noël sous LSD.
  if (zone.sectors.length < 2) return;

  highlightHoverZoneLabel(zoneOverlay, zone);
  overlay.add(createHoverZoneBoundary(zone, placedTiles));
}

export function updateHoverZoneOverlayAnimation(overlay, zoneOverlay = null, elapsedSeconds = performance.now() / 1000) {
  const pulse = 1 + Math.sin(elapsedSeconds * 7) * 0.10;

  zoneOverlay?.traverse?.(object => {
    if (!object.userData?.isHoverHighlightedZoneLabel) return;
    const baseScale = object.userData.hoverBaseScale;
    const baseY = object.userData.hoverBaseY;
    if (!baseScale || baseY === undefined) return;

    object.scale.set(baseScale.x * pulse, baseScale.y * pulse, baseScale.z);
    object.position.y = baseY + 0.035 + Math.sin(elapsedSeconds * 7) * 0.012;
  });
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

function resetHoverValueLabels(placedTiles) {
  for (const placedTile of placedTiles.values()) {
    placedTile.mesh?.traverse?.(object => {
      if (!object.userData?.isValueLabel || !object.userData.hoverBaseScale) return;
      object.scale.copy(object.userData.hoverBaseScale);
      object.position.y = object.userData.hoverBaseY ?? object.position.y;
    });
  }
}

function resetHoverZoneLabels(zoneOverlay) {
  zoneOverlay?.traverse?.(object => {
    if (!object.userData?.isHoverHighlightedZoneLabel) return;
    if (object.userData.hoverBaseScale) object.scale.copy(object.userData.hoverBaseScale);
    if (object.userData.hoverBaseY !== undefined) object.position.y = object.userData.hoverBaseY;
    object.userData.isHoverHighlightedZoneLabel = false;
  });
}

function highlightHoverZoneLabel(zoneOverlay, zone) {
  if (!zoneOverlay) return;
  const signature = makeZoneSignature(zone);

  zoneOverlay.traverse?.(object => {
    if (!object.userData?.isZoneLabel || object.userData.zoneSignature !== signature) return;

    if (!object.userData.hoverBaseScale) object.userData.hoverBaseScale = object.scale.clone();
    if (object.userData.hoverBaseY === undefined) object.userData.hoverBaseY = object.position.y;

    object.userData.isHoverHighlightedZoneLabel = true;
    object.scale.set(
      object.userData.hoverBaseScale.x * 1.15,
      object.userData.hoverBaseScale.y * 1.15,
      object.userData.hoverBaseScale.z
    );
    object.position.y = object.userData.hoverBaseY + 0.035;
  });
}


function highlightHoverValueLabels(zone) {
  for (const sectorRef of zone.sectors) {
    sectorRef.tile.mesh?.traverse?.(object => {
      if (!object.userData?.isValueLabel || object.userData.edgeKey !== sectorRef.edge) return;

      if (!object.userData.hoverBaseScale) object.userData.hoverBaseScale = object.scale.clone();
      if (object.userData.hoverBaseY === undefined) object.userData.hoverBaseY = object.position.y;

      object.scale.set(
        object.userData.hoverBaseScale.x * 1.35,
        object.userData.hoverBaseScale.y * 1.35,
        object.userData.hoverBaseScale.z
      );
      object.position.y = object.userData.hoverBaseY + 0.035;
    });
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

function createHoverZoneBoundary(zone, placedTiles) {
  const group = new THREE.Group();
  group.name = `${zone.type}-hover-zone-halo`;

  const diffuse = createZoneBoundary(zone, placedTiles, {
    y: HOVER_HALO_Y - 0.006,
    radius: HOVER_DIFFUSE_RADIUS,
    opacity: 0.16,
    additive: true,
    name: `${zone.type}-hover-zone-diffuse`
  });

  const glow = createZoneBoundary(zone, placedTiles, {
    y: HOVER_HALO_Y,
    radius: HOVER_GLOW_RADIUS,
    opacity: 0.34,
    additive: true,
    name: `${zone.type}-hover-zone-glow`
  });

  const halo = createZoneBoundary(zone, placedTiles, {
    y: HOVER_HALO_Y + 0.01,
    radius: HOVER_HALO_RADIUS,
    opacity: 0.98,
    additive: false,
    name: `${zone.type}-hover-zone-core`
  });

  group.add(diffuse, glow, halo);
  return group;
}

function createZoneBoundary(zone, placedTiles, options = {}) {
  const segments = getZoneBoundarySegments(zone, placedTiles, options.y ?? HALO_Y);
  const material = new THREE.MeshBasicMaterial({
    color: getZoneColor(zone.type),
    transparent: true,
    opacity: options.opacity ?? 0.95,
    blending: options.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    depthWrite: false,
    side: THREE.DoubleSide
  });

  const group = new THREE.Group();
  group.name = options.name ?? `${zone.type}-zone-halo`;

  for (const segment of segments) {
    const mesh = createFlatSegmentMesh(segment, options.radius ?? 0.025, material);
    if (mesh) group.add(mesh);
  }

  return group;
}

function createFlatSegmentMesh(segment, width, material) {
  const delta = segment.to.clone().sub(segment.from);
  const length = delta.length();
  if (length <= 0.001) return null;

  // Bande rectangulaire sans extrémité ronde : évite les gros pâtés opaques aux coins.
  const geometry = new THREE.PlaneGeometry(length, width);
  const mesh = new THREE.Mesh(geometry, material);
  const midpoint = segment.from.clone().add(segment.to).multiplyScalar(0.5);
  const angle = Math.atan2(delta.z, delta.x);

  mesh.position.copy(midpoint);
  mesh.rotation.set(-Math.PI / 2, 0, -angle);
  return mesh;
}

function getZoneBoundarySegments(zone, placedTiles, y = HALO_Y) {
  const edges = new Map();
  const tileKeysWithCenter = new Set();

  for (const sectorRef of zone.sectors) {
    addPolygonEdges(edges, getSectorVisiblePolygon(sectorRef.tile, sectorRef.edge, y));

    if (getTileCenterType(sectorRef.tile) === zone.type) {
      tileKeysWithCenter.add(sectorRef.tile.key);
    }
  }

  for (const tileKey of tileKeysWithCenter) {
    const placedTile = placedTiles.get(tileKey);
    if (placedTile) addPolygonEdges(edges, getCenterPolygon(placedTile, y));
  }

  const rawSegments = [...edges.values()]
    .filter(entry => entry.count === 1)
    .map(entry => entry.segment);

  return cleanupBoundarySegments(rawSegments);
}


function cleanupBoundarySegments(segments) {
  let cleanSegments = segments.filter(segment => getSegmentLength(segment) > 0.001);

  // Une périphérie propre est une chaîne fermée : chaque sommet doit toucher deux arêtes.
  // Quand un sommet touche 3+ arêtes, on a presque toujours une arête interne parasite.
  // On supprime d'abord les arêtes qui relient deux sommets déjà trop connectés, puis on
  // recommence jusqu'à obtenir un contour exploitable sans branches internes.
  for (let pass = 0; pass < 12; pass++) {
    const graph = buildSegmentGraph(cleanSegments);
    const overloadedKeys = new Set([...graph.entries()]
      .filter(([, links]) => links.length > 2)
      .map(([key]) => key));

    if (overloadedKeys.size === 0) break;

    const toRemove = new Set();

    for (const key of overloadedKeys) {
      const links = graph.get(key) ?? [];
      const internalCandidates = links
        .map(link => ({
          index: link.index,
          otherKey: link.otherKey,
          length: getSegmentLength(cleanSegments[link.index])
        }))
        .filter(candidate => overloadedKeys.has(candidate.otherKey));

      const pool = internalCandidates.length > 0
        ? internalCandidates
        : links.map(link => ({
            index: link.index,
            otherKey: link.otherKey,
            length: getSegmentLength(cleanSegments[link.index])
          }));

      // Les petits segments parasites naissent aux intersections internes : ils sont
      // quasiment toujours les plus courts autour du sommet surchargé.
      pool.sort((a, b) => a.length - b.length);
      toRemove.add(pool[0].index);
    }

    if (toRemove.size === 0) break;
    cleanSegments = cleanSegments.filter((_, index) => !toRemove.has(index));
  }

  return cleanSegments;
}

function buildSegmentGraph(segments) {
  const graph = new Map();

  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index];
    const fromKey = makePointKey(segment.from);
    const toKey = makePointKey(segment.to);
    addGraphLink(graph, fromKey, toKey, index);
    addGraphLink(graph, toKey, fromKey, index);
  }

  return graph;
}

function addGraphLink(graph, fromKey, otherKey, index) {
  if (!graph.has(fromKey)) graph.set(fromKey, []);
  graph.get(fromKey).push({ otherKey, index });
}

function getSegmentLength(segment) {
  return segment.to.clone().sub(segment.from).length();
}

function getSectorVisiblePolygon(placedTile, edge, y = HALO_Y) {
  const sector = SECTOR_BY_KEY[edge];
  const outerVertices = createOuterVertices();
  const innerVertices = createOuterVertices(CENTER_RADIUS);
  const world = axialToWorld(placedTile.q, placedTile.r);

  return [
    toWorldVector(world, innerVertices[sector.a], y),
    toWorldVector(world, outerVertices[sector.a], y),
    toWorldVector(world, outerVertices[sector.b], y),
    toWorldVector(world, innerVertices[sector.b], y)
  ];
}

function getCenterPolygon(placedTile, y = HALO_Y) {
  const world = axialToWorld(placedTile.q, placedTile.r);
  return createOuterVertices(CENTER_RADIUS).map(vertex => toWorldVector(world, vertex, y));
}

function addPolygonEdges(edges, polygon) {
  for (let i = 0; i < polygon.length; i++) {
    const from = polygon[i];
    const to = polygon[(i + 1) % polygon.length];
    const key = makeSegmentKey(from, to);
    const existing = edges.get(key);

    if (existing) {
      existing.count += 1;
    } else {
      edges.set(key, {
        count: 1,
        segment: { from, to }
      });
    }
  }
}

function makeSegmentKey(a, b) {
  const pa = makePointKey(a);
  const pb = makePointKey(b);
  return pa < pb ? `${pa}|${pb}` : `${pb}|${pa}`;
}

function makePointKey(point) {
  return `${point.x.toFixed(4)},${point.z.toFixed(4)}`;
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
  sprite.userData.isZoneLabel = true;
  sprite.userData.zoneSignature = makeZoneSignature(zone);
  return sprite;
}

function makeZoneSignature(zone) {
  return zone.sectors
    .map(sectorRef => makeNodeKey(sectorRef.tile.key, sectorRef.edge))
    .sort()
    .join('|');
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

function createOuterVertices(radius = HEX_SIZE * TILE_VISUAL.radiusScale) {
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

function toWorldVector(world, local, y = HALO_Y) {
  return new THREE.Vector3(world.x + local.x, y, world.z + local.z);
}

function getHoveredEdge(placedTile, worldPoint) {
  const world = axialToWorld(placedTile.q, placedTile.r);
  const localX = worldPoint.x - world.x;
  const localZ = worldPoint.z - world.z;
  const angle = (Math.atan2(localZ, localX) + Math.PI * 2) % (Math.PI * 2);
  const sectorIndex = Math.floor(angle / (Math.PI / 3)) % SECTOR_DEFS.length;
  return SECTOR_DEFS[sectorIndex].key;
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
