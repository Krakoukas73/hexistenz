import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { EDGE_COLOR, EDGE_ORDER, EDGE_TYPES, HEX_SIZE, TILE_VISUAL } from './config.js';
import { getEdgeType, getEdgeValue } from './tileGenerator.js';

const SECTOR_DEFS = [
  { key: 'n', a: 0, b: 1 },
  { key: 'ne', a: 1, b: 2 },
  { key: 'se', a: 2, b: 3 },
  { key: 's', a: 3, b: 4 },
  { key: 'sw', a: 4, b: 5 },
  { key: 'nw', a: 5, b: 0 }
];

const materialCache = new Map();
const textTextureCache = new Map();

export function createTileMesh(tileOrEdges, options = {}) {
  const edges = tileOrEdges.edges ?? tileOrEdges;
  const center = tileOrEdges.center ?? pickCenterType(edges);
  const opacity = options.opacity ?? 1;
  const group = new THREE.Group();

  group.add(...createSectorMeshes(edges, opacity));
  group.add(createCenterMesh(center, opacity));
  group.add(createOutlineMesh(opacity));

  return group;
}

export function renderMiniTile(tile) {
  if (!tile) return '';

  const e = tile.edges;
  const c = tile.center ?? mostCommonEdgeType(edgesToArray(e));
  const cell = edge => `<div style="background:${edgeCssColor(getEdgeType(edge))}">${getMiniValueLabel(edge)}</div>`;
  const center = `<div class="mini-center" style="background:${edgeCssColor(c)}"></div>`;

  return `
    <div class="mini-tile">
      <div></div>${cell(e.n)}<div></div>
      ${cell(e.nw)}${center}${cell(e.ne)}
      ${cell(e.sw)}${center}${cell(e.se)}
      <div></div>${cell(e.s)}<div></div>
    </div>
  `;
}

function createSectorMeshes(edges, opacity) {
  const vertices = createOuterVertices();

  return SECTOR_DEFS.map(sector => {
    const geometry = createSectorGeometry(vertices[sector.a], vertices[sector.b]);
    const edge = edges[sector.key];
    const material = getBiomeMaterial(getEdgeType(edge), opacity);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = TILE_VISUAL.sectorY;

    const group = new THREE.Group();
    group.add(mesh);

    const label = createValueLabel(edge, sector);
    if (label) group.add(label);

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

  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
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

function getBiomeMaterial(type, opacity = 1) {
  const key = `${type}_${opacity}`;
  if (materialCache.has(key)) return materialCache.get(key);

  const material = new THREE.MeshBasicMaterial({
    color: EDGE_COLOR[type] ?? 0x222833,
    transparent: opacity < 1,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: opacity >= 1
  });

  materialCache.set(key, material);
  return material;
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

function edgeCssColor(type) {
  return `#${EDGE_COLOR[type].toString(16).padStart(6, '0')}`;
}

function createValueLabel(edge, sector) {
  const type = getEdgeType(edge);
  const value = getEdgeValue(edge);

  if (!shouldShowValue(type, value)) return null;

  const angle = ((sector.a + sector.b) / 2) * (Math.PI / 3);
  const sprite = new THREE.Sprite(getTextSpriteMaterial(String(value)));

  sprite.position.set(Math.cos(angle) * HEX_SIZE * 0.53, TILE_VISUAL.labelY ?? 0.07, Math.sin(angle) * HEX_SIZE * 0.53);
  sprite.scale.set(0.28, 0.16, 1);
  return sprite;
}

function getTextSpriteMaterial(text) {
  if (textTextureCache.has(text)) return textTextureCache.get(text);

  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.62)';
  ctx.roundRect(18, 10, 92, 44, 14);
  ctx.fill();
  ctx.font = 'bold 34px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, 64, 33);

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  textTextureCache.set(text, material);
  return material;
}

function getMiniValueLabel(edge) {
  const type = getEdgeType(edge);
  const value = getEdgeValue(edge);
  return shouldShowValue(type, value) ? `<span class="mini-value">${value}</span>` : '';
}

function shouldShowValue(type, value) {
  return value > 1 && (type === EDGE_TYPES.field || type === EDGE_TYPES.forest || type === EDGE_TYPES.house);
}
