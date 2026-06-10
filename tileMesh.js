import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { EDGE_ORDER, HEX_SIZE, TILE_VISUAL } from './config.js';
import { getEdgeType } from './tileGenerator.js';
import { getBiomeMaterial } from './tileTextures.js';
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
  const center = tileOrEdges.center ?? pickCenterType(edges);
  const opacity = options.opacity ?? 1;
  const group = new THREE.Group();

  group.add(...createSectorMeshes(edges, opacity));
  group.add(createCenterMesh(center, opacity));

  const railCenterOverlay = createRailCenterOverlay(edges, SECTOR_DEFS, createOuterVertices);
  if (railCenterOverlay) group.add(railCenterOverlay);

  group.add(createOutlineMesh(opacity));

  return group;
}

export function renderMiniTile(tile) {
  if (!tile) return '';

  const e = tile.edges;
  const c = tile.center ?? mostCommonEdgeType(edgesToArray(e));
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
    const geometry = createSectorGeometry(vertices[sector.a], vertices[sector.b]);
    const edge = edges[sector.key];
    const mesh = new THREE.Mesh(geometry, getBiomeMaterial(getEdgeType(edge), opacity));
    mesh.position.y = TILE_VISUAL.sectorY;

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

function createSectorGeometry(a, b) {
  const geometry = new THREE.BufferGeometry();

  const vertices = new Float32Array([
    0, 0, 0,
    a.x, 0, a.z,
    b.x, 0, b.z
  ]);

  const uvs = new Float32Array([
    0.5, 0.5,
    (a.x / HEX_SIZE + 1) * 0.5,
    (a.z / HEX_SIZE + 1) * 0.5,
    (b.x / HEX_SIZE + 1) * 0.5,
    (b.z / HEX_SIZE + 1) * 0.5
  ]);

  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex([0, 1, 2]);
  geometry.computeVertexNormals();

  return geometry;
}

function createCenterMesh(centerType, opacity) {
  const geometry = new THREE.CircleGeometry(
    HEX_SIZE * TILE_VISUAL.centerRadiusScale,
    6
  );

  const mesh = new THREE.Mesh(geometry, getBiomeMaterial(centerType, opacity));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = TILE_VISUAL.centerY;
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
  if (hasEdgeType(edges, 'water')) return 'water';
  if (hasEdgeType(edges, 'rail')) return 'rail';
  return mostCommonEdgeType(edgesToArray(edges));
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
