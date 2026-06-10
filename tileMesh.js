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

const generatedTextureCache = new Map();

function getGeneratedTexture(type) {
  if (generatedTextureCache.has(type)) return generatedTextureCache.get(type);

  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  if (type === 'water') {
    ctx.fillStyle = '#2f6fa3';
    ctx.fillRect(0, 0, 128, 128);

    for (let y = 0; y < 128; y += 16) {
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 3;
      ctx.beginPath();

      for (let x = -16; x <= 144; x += 8) {
        ctx.lineTo(x, y + Math.sin((x + y) * 0.08) * 4);
      }

      ctx.stroke();
    }

    for (let i = 0; i < 40; i++) {
      const x = (i * 47) % 128;
      const y = (i * 29) % 128;
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.beginPath();
      ctx.arc(x, y, (i % 3) + 1, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (type === 'field') {
    ctx.fillStyle = '#d9b94e';
    ctx.fillRect(0, 0, 128, 128);

    for (let x = -128; x < 256; x += 16) {
      ctx.strokeStyle = 'rgba(255, 245, 170, 0.52)';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(x, -8);
      ctx.lineTo(x + 128, 136);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(125, 92, 25, 0.22)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + 8, -8);
      ctx.lineTo(x + 136, 136);
      ctx.stroke();
    }
  } else if (type === 'forest') {
    ctx.fillStyle = '#23652b';
    ctx.fillRect(0, 0, 128, 128);

    const trees = [
      [14, 18], [40, 10], [70, 22], [102, 14],
      [24, 50], [56, 42], [92, 54], [120, 42],
      [10, 86], [44, 84], [76, 94], [108, 82],
      [30, 118], [64, 116], [98, 120]
    ];

    for (const [x, y] of trees) {
      ctx.fillStyle = 'rgba(16, 54, 20, 0.28)';
      ctx.beginPath();
      ctx.arc(x + 3, y + 4, 11, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#164d22';
      ctx.beginPath();
      ctx.moveTo(x, y - 12);
      ctx.lineTo(x - 11, y + 10);
      ctx.lineTo(x + 11, y + 10);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#2f8a3a';
      ctx.beginPath();
      ctx.moveTo(x, y - 15);
      ctx.lineTo(x - 8, y + 6);
      ctx.lineTo(x + 8, y + 6);
      ctx.closePath();
      ctx.fill();
    }
  } else if (type === 'grass') {
    ctx.fillStyle = '#2ebf62';
    ctx.fillRect(0, 0, 128, 128);

    for (let y = 8; y < 128; y += 16) {
      for (let x = 6; x < 128; x += 18) {
        const ox = ((x * 13 + y * 7) % 9) - 4;
        ctx.strokeStyle = 'rgba(190, 255, 195, 0.34)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x + ox, y + 5);
        ctx.lineTo(x + ox + 3, y - 5);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(15, 105, 45, 0.24)';
        ctx.beginPath();
        ctx.moveTo(x + ox + 5, y + 5);
        ctx.lineTo(x + ox + 1, y - 3);
        ctx.stroke();
      }
    }
  } else if (type === 'house') {
    ctx.fillStyle = '#b94141';
    ctx.fillRect(0, 0, 128, 128);

    const houses = [
      [18, 24], [54, 16], [92, 30],
      [34, 64], [78, 70], [114, 58],
      [18, 104], [58, 110], [100, 100]
    ];

    for (const [x, y] of houses) {
      ctx.fillStyle = 'rgba(65, 20, 18, 0.24)';
      ctx.fillRect(x - 9, y - 1, 20, 16);

      ctx.fillStyle = '#f1c56f';
      ctx.fillRect(x - 8, y, 16, 14);

      ctx.fillStyle = '#5e2731';
      ctx.beginPath();
      ctx.moveTo(x - 10, y);
      ctx.lineTo(x, y - 10);
      ctx.lineTo(x + 10, y);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = 'rgba(80, 45, 25, 0.55)';
      ctx.fillRect(x - 2, y + 5, 4, 9);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);

  generatedTextureCache.set(type, texture);
  return texture;
}


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
  const sector = edgeKey => {
    const edge = e[edgeKey];
    return `
      <div class="mini-sector mini-sector-${edgeKey}" style="background:${edgeCssColor(getEdgeType(edge))}">
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
      <div class="mini-hex-center" style="background:${edgeCssColor(c)}"></div>
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

    const railOverlay = createRailOverlay(edge, vertices[sector.a], vertices[sector.b]);
    if (railOverlay) group.add(railOverlay);

    const label = createValueLabel(edge, vertices[sector.a], vertices[sector.b]);
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

function createRailOverlay(edge, vertexA, vertexB) {
  if (getEdgeType(edge) !== EDGE_TYPES.rail) return null;

  const group = new THREE.Group();
  const y = (TILE_VISUAL.railY ?? 0.055);

  const mid = new THREE.Vector3(
    (vertexA.x + vertexB.x) / 2,
    y,
    (vertexA.z + vertexB.z) / 2
  );
  const start = mid.clone().multiplyScalar(0.18);
  const end = mid.clone().multiplyScalar(0.92);

  const dir = end.clone().sub(start);
  const len = dir.length();
  if (len === 0) return null;
  dir.normalize();

  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  const railGap = HEX_SIZE * 0.095;
  const sleeperHalf = HEX_SIZE * 0.16;

  const sleeperMaterial = getRailLineMaterial('sleeper');
  const railMaterial = getRailLineMaterial('rail');

  for (let i = 0.22; i <= 0.86; i += 0.16) {
    const p = start.clone().lerp(end, i);
    group.add(createLineSegment(
      p.clone().add(side.clone().multiplyScalar(-sleeperHalf)),
      p.clone().add(side.clone().multiplyScalar(sleeperHalf)),
      sleeperMaterial
    ));
  }

  group.add(createLineSegment(
    start.clone().add(side.clone().multiplyScalar(-railGap)),
    end.clone().add(side.clone().multiplyScalar(-railGap)),
    railMaterial
  ));
  group.add(createLineSegment(
    start.clone().add(side.clone().multiplyScalar(railGap)),
    end.clone().add(side.clone().multiplyScalar(railGap)),
    railMaterial
  ));

  return group;
}

function createLineSegment(a, b, material) {
  const geometry = new THREE.BufferGeometry().setFromPoints([a, b]);
  return new THREE.Line(geometry, material);
}

function getRailLineMaterial(kind) {
  const key = `rail_overlay_${kind}`;
  if (materialCache.has(key)) return materialCache.get(key);

  const material = new THREE.LineBasicMaterial({
    color: kind === 'rail' ? 0x262626 : 0x7A4A24,
    transparent: false,
    depthWrite: false
  });

  materialCache.set(key, material);
  return material;
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

  const materialConfig = {
    color: EDGE_COLOR[type] ?? 0x222833,
    transparent: opacity < 1,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: opacity >= 1
  };

  if (type === 'water' || type === 'field' || type === 'forest' || type === 'grass' || type === 'house') {
    materialConfig.map = getGeneratedTexture(type);
  }

  const material = new THREE.MeshBasicMaterial(materialConfig);

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

function createValueLabel(edge, vertexA, vertexB) {
  const type = getEdgeType(edge);
  const value = getEdgeValue(edge);

  if (!shouldShowValue(type, value)) return null;

  const sprite = new THREE.Sprite(getTextSpriteMaterial(String(value)));

  // Même triangle, même source de vérité : le label est placé au centroïde
  // du secteur qui a servi à dessiner la texture. Impossible de dériver
  // vers le voisin par un calcul d'angle séparé.
  sprite.position.set(
    (vertexA.x + vertexB.x) / 3,
    TILE_VISUAL.labelY ?? 0.07,
    (vertexA.z + vertexB.z) / 3
  );
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
