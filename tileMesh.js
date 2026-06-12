import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { EDGE_ORDER, HEX_SIZE, TILE_VISUAL } from './config.js';
import { getEdgeType } from './tileGenerator.js';
import { getBiomeMaterial, getBiomeSideMaterial } from './tileTextures.js';
import { createRailOverlay, createRailCenterOverlay } from './tileRailOverlay.js';
import { createValueLabel, getMiniValueLabel } from './tileLabels.js';

const SECTOR_DEFS = [
  { key: 'n', a: 0, b: 1 },
  { key: 'ne', a: 1, b: 2 },
  { key: 'se', a: 2, b: 3 },
  { key: 's', a: 3, b: 4 },
  { key: 'sw', a: 4, b: 5 },
  { key: 'nw', a: 5, b: 0 }
];

export function createTileMesh(tileOrEdges, options = {}) {
  const edges = tileOrEdges.edges ?? tileOrEdges;
  const center = hasEdgeType(edges, 'water') ? 'water' : (tileOrEdges.center ?? pickCenterType(edges));
  const opacity = options.opacity ?? 1;
  const group = new THREE.Group();

  group.add(...createSectorMeshes(edges, opacity));
  group.add(createCenterMesh(center, opacity));

  const railCenterOverlay = createRailCenterOverlay(edges, SECTOR_DEFS, createOuterVertices);
  if (railCenterOverlay) group.add(railCenterOverlay);

  return group;
}

export function renderMiniTile(tile) {
  if (!tile) return '';

  const e = tile.edges;
  const c = hasEdgeType(e, 'water') ? 'water' : (tile.center ?? mostCommonEdgeType(edgesToArray(e)));
  const sector = edgeKey => {
    const edge = e[edgeKey];
    const type = getEdgeType(edge);
    return `
      <div class="mini-sector mini-sector-${edgeKey} mini-type-${type}">
        ${getMiniValueLabel(edge)}
      </div>
    `;
  };

  return `
    <div class="mini-hex-tile">
      ${sector('n')}
      ${sector('ne')}
      ${sector('se')}
      ${sector('s')}
      ${sector('sw')}
      ${sector('nw')}
      <div class="mini-hex-center mini-type-${c}"></div>
    </div>
  `;
}

function createSectorMeshes(edges, opacity) {
  const vertices = createOuterVertices();

  return SECTOR_DEFS.map(sector => {
    const edge = edges[sector.key];
    const type = getEdgeType(edge);
    const geometry = createSectorGeometry(vertices[sector.a], vertices[sector.b], type);
    const materials = [getBiomeMaterial(type, opacity), getBiomeSideMaterial(type, opacity)];
    const mesh = new THREE.Mesh(geometry, materials);
    mesh.position.y = type === 'water' ? TILE_VISUAL.waterY : TILE_VISUAL.sectorY;

    const group = new THREE.Group();
    group.userData.edgeKey = sector.key;
    group.add(mesh);

    const railOverlay = createRailOverlay(edge, vertices[sector.a], vertices[sector.b]);
    if (railOverlay) group.add(railOverlay);

    const label = createValueLabel(edge, vertices[sector.a], vertices[sector.b]);
    if (label) {
      label.userData.isValueLabel = true;
      label.userData.edgeKey = sector.key;
      group.add(label);
    }

    return group;
  });
}

function createSectorGeometry(a, b, type) {
  return createThickSectorGeometry(a, b, getSectorDepth(type));
}

function getSectorDepth(type) {
  return type === 'water'
    ? (TILE_VISUAL.waterThickness ?? ((TILE_VISUAL.tileThickness ?? 0.16) * 0.5))
    : (TILE_VISUAL.tileThickness ?? 0.16);
}

function createThickSectorGeometry(a, b, depth) {
  const geometry = new THREE.BufferGeometry();
  const innerRadius = HEX_SIZE * TILE_VISUAL.centerRadiusScale;
  const innerA = pointAtRadius(a, innerRadius);
  const innerB = pointAtRadius(b, innerRadius);

  const vertices = new Float32Array([
    innerA.x, 0, innerA.z,
    a.x, 0, a.z,
    b.x, 0, b.z,
    innerB.x, 0, innerB.z,
    innerA.x, -depth, innerA.z,
    a.x, -depth, a.z,
    b.x, -depth, b.z,
    innerB.x, -depth, innerB.z
  ]);

  const uvs = new Float32Array([
    ...uvForPoint(innerA),
    ...uvForPoint(a),
    ...uvForPoint(b),
    ...uvForPoint(innerB),
    ...uvForPoint(innerA),
    ...uvForPoint(a),
    ...uvForPoint(b),
    ...uvForPoint(innerB)
  ]);

  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

  geometry.setIndex([
    0, 1, 2, 0, 2, 3,      // dessus texturé, avec trou central propre
    4, 6, 5, 4, 7, 6,      // dessous
    1, 5, 6, 1, 6, 2,
    2, 6, 7, 2, 7, 3,
    3, 7, 4, 3, 4, 0,
    0, 4, 5, 0, 5, 1
  ]);

  geometry.clearGroups();
  geometry.addGroup(0, 6, 0);
  geometry.addGroup(6, 30, 1);
  geometry.computeVertexNormals();

  return geometry;
}

function pointAtRadius(point, radius) {
  const length = Math.hypot(point.x, point.z) || 1;
  return {
    x: (point.x / length) * radius,
    z: (point.z / length) * radius
  };
}

function uvForPoint(point) {
  return [
    (point.x / HEX_SIZE + 1) * 0.5,
    (point.z / HEX_SIZE + 1) * 0.5
  ];
}

function createCenterMesh(centerType, opacity) {
  const depth = centerType === 'water'
    ? (TILE_VISUAL.waterThickness ?? ((TILE_VISUAL.tileThickness ?? 0.16) * 0.5))
    : (TILE_VISUAL.tileThickness ?? 0.16);

  if (centerType === 'water') {
    const geometry = new THREE.CylinderGeometry(
      HEX_SIZE * TILE_VISUAL.centerRadiusScale,
      HEX_SIZE * TILE_VISUAL.centerRadiusScale,
      depth,
      6,
      1,
      false
    );

    const mesh = new THREE.Mesh(geometry, [
      getBiomeSideMaterial(centerType, opacity),
      getBiomeMaterial(centerType, opacity),
      getBiomeSideMaterial(centerType, opacity)
    ]);
    mesh.position.y = TILE_VISUAL.waterY - depth / 2;
    return mesh;
  }

  const geometry = new THREE.CylinderGeometry(
    HEX_SIZE * TILE_VISUAL.centerRadiusScale,
    HEX_SIZE * TILE_VISUAL.centerRadiusScale,
    depth,
    6,
    1,
    false
  );

  const mesh = new THREE.Mesh(geometry, [
    getBiomeSideMaterial(centerType, opacity),
    getBiomeMaterial(centerType, opacity),
    getBiomeSideMaterial(centerType, opacity)
  ]);
  mesh.position.y = TILE_VISUAL.centerY - depth / 2;
  return mesh;
}

function createOutlineMesh(opacity) {
  const vertices = createOuterVertices(HEX_SIZE * TILE_VISUAL.radiusScale);
  const points = vertices.map(v => new THREE.Vector3(v.x, TILE_VISUAL.outlineY, v.z));
  points.push(points[0].clone());

  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color: TILE_VISUAL.outlineColor,
    transparent: opacity < 1,
    opacity: Math.min(opacity, TILE_VISUAL.outlineOpacity)
  });

  return new THREE.Line(geometry, material);
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

function edgesToArray(edges) {
  return EDGE_ORDER.map(edge => getEdgeType(edges[edge]));
}

function pickCenterType(edges) {
  const types = edgesToArray(edges);
  // Fallback visuel cohérent avec tileGenerator : toute tuile ayant de l'eau
  // garde un centre eau pour que le réseau soit continu.
  if (hasEdgeType(edges, 'water')) return 'water';
  if (hasEdgeType(edges, 'rail')) return 'rail';
  return mostCommonEdgeType(types);
}

function hasEdgeType(edges, type) {
  return EDGE_ORDER.some(edge => getEdgeType(edges[edge]) === type);
}

function mostCommonEdgeType(types) {
  const counts = new Map();

  for (const type of types) {
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }

  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}
