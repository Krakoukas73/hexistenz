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

const RAGGED_EDGE = {
  // Morcelage visuel des bords : les bords externes débordent vers
  // l'extérieur et les frontières internes entre triangles partagent
  // maintenant une même ligne turbulente déterministe. Pas de trou,
  // pas de double génération incohérente entre deux secteurs voisins.
  // Step validé : turbulence volontairement plus large et plus prononcée.
  segments: 11,
  amplitude: 0.135,
  innerSegments: 8,
  innerAmplitude: 0.075,
  lift: 0
};

const TERRAIN_RELIEF = {
  enabled: true,
  baseAmplitude: 0.064,
  typeAmplitude: {
    grass: 0.085,
    forest: 0.118,
    field: 0.075,
    house: 0.055,
    rail: 0.043,
    water: 0.017
  },
  edgeFadeStart: 0.30
};

const BIOME_HEIGHT_RATIO = {
  // Règle immuable : le volume complet reste ancré sur la grille.
  // On ne translate pas les tuiles : on change seulement la hauteur locale
  // du dessus des biomes pour casser les coplanarités aux jonctions.
  // Champ de blé : plus épais au-dessus du niveau standard.
  // Prairie : dessus nettement abaissé pour obtenir une dalle plus fine,
  // tout en gardant le dessous sur la même base de grille que les autres tuiles.
  field: 0.45,
  grass: -0.45
};

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
    const geometry = createSectorGeometry(vertices[sector.a], vertices[sector.b], type, sector.a, sector.b);
    const materials = [getBiomeMaterial(type, opacity), getBiomeSideMaterial(type, opacity)];
    const mesh = new THREE.Mesh(geometry, materials);
    mesh.position.y = getBiomeSurfaceY(type, TILE_VISUAL.sectorY);

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

function createSectorGeometry(a, b, type, aIndex, bIndex) {
  return createThickSectorGeometry(a, b, getSectorDepth(type), type, aIndex, bIndex);
}

function getSectorDepth(type) {
  if (type === 'water') {
    return TILE_VISUAL.waterThickness ?? ((TILE_VISUAL.tileThickness ?? 0.16) * 0.5);
  }

  if (type === 'rail') {
    return TILE_VISUAL.railThickness ?? TILE_VISUAL.waterThickness ?? ((TILE_VISUAL.tileThickness ?? 0.16) * 0.5);
  }

  // Tous les biomes non-eau gardent le même fond de volume sur la grille.
  // La variation se fait par le dessus : field monte, grass descend.
  const baseDepth = TILE_VISUAL.tileThickness ?? 0.16;
  return baseDepth + getBiomeLocalTopY(type);
}

function createThickSectorGeometry(a, b, depth, type = 'grass', aIndex = 0, bIndex = 1) {
  const geometry = new THREE.BufferGeometry();
  const innerRadius = HEX_SIZE * TILE_VISUAL.centerRadiusScale;
  const innerA = pointAtRadius(a, innerRadius);
  const innerB = pointAtRadius(b, innerRadius);
  const leftInnerEdge = createRaggedInnerEdge(innerA, a, aIndex);
  const outerPoints = createRaggedOuterEdge(a, b, type);
  const rightInnerEdge = createRaggedInnerEdge(innerB, b, bIndex).reverse();

  const topPoints = compactPointLoop([
    ...leftInnerEdge,
    ...outerPoints,
    ...rightInnerEdge
  ]);
  const bottomPoints = topPoints.map(point => ({ ...point }));
  const vertexData = [];
  const uvData = [];

  const topHeights = topPoints.map((point, index) => getTerrainTopY(point, type, index) + RAGGED_EDGE.lift);
  const bottomHeights = topHeights.map(() => getBiomeLocalBottomY(type, depth));

  for (let i = 0; i < topPoints.length; i += 1) {
    const point = topPoints[i];
    vertexData.push(point.x, topHeights[i], point.z);
    uvData.push(...uvForPoint(point));
  }

  for (let i = 0; i < bottomPoints.length; i += 1) {
    const point = bottomPoints[i];
    vertexData.push(point.x, bottomHeights[i], point.z);
    uvData.push(...uvForPoint(point));
  }

  const topCount = topPoints.length;
  const indices = [];
  const topTriangles = THREE.ShapeUtils.triangulateShape(
    topPoints.map(point => new THREE.Vector2(point.x, point.z)),
    []
  );

  // Dessus texturé : triangulation robuste, nécessaire depuis que les côtés
  // internes sont eux aussi morcelés et peuvent créer un contour concave.
  for (const triangle of topTriangles) {
    indices.push(triangle[0], triangle[1], triangle[2]);
  }

  const topIndexCount = indices.length;

  // Dessous.
  for (const triangle of topTriangles) {
    indices.push(topCount + triangle[2], topCount + triangle[1], topCount + triangle[0]);
  }

  // Flancs, y compris le bord extérieur dentelé.
  for (let i = 0; i < topCount; i++) {
    const next = (i + 1) % topCount;
    indices.push(i, topCount + i, topCount + next);
    indices.push(i, topCount + next, next);
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertexData), 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvData), 2));
  geometry.setIndex(indices);

  geometry.clearGroups();
  geometry.addGroup(0, topIndexCount, 0);
  geometry.addGroup(topIndexCount, indices.length - topIndexCount, 1);
  geometry.computeVertexNormals();

  return geometry;
}


function getTerrainTopY(point, type, salt = 0) {
  const baseY = getBiomeLocalTopY(type);
  if (!TERRAIN_RELIEF.enabled) return baseY;

  const amplitude = TERRAIN_RELIEF.typeAmplitude[type] ?? TERRAIN_RELIEF.baseAmplitude;
  const radius = Math.hypot(point.x, point.z) / Math.max(HEX_SIZE, 0.001);
  const edgeFade = THREE.MathUtils.clamp((radius - TERRAIN_RELIEF.edgeFadeStart) / (1 - TERRAIN_RELIEF.edgeFadeStart), 0, 1);
  const centerFade = 0.72 + edgeFade * 0.28;
  const waveA = Math.sin(point.x * 3.10 + point.z * 1.85 + salt * 0.71);
  const waveB = Math.cos(point.x * -2.45 + point.z * 4.15 + salt * 1.13);
  const waveC = Math.sin((point.x + point.z) * 5.20 + salt * 0.37);
  const grain = (hash01(hashTerrainPoint(point, type, salt)) - 0.5) * 2;
  const relief = (waveA * 0.42 + waveB * 0.28 + waveC * 0.18 + grain * 0.12) * amplitude * centerFade;

  // L'eau reste presque plane : assez de frémissement pour casser le plastique,
  // pas assez pour créer une mer de Lego ivre.
  if (type === 'water') return baseY + relief * 0.35;
  return baseY + relief;
}

function hashTerrainPoint(point, type, salt) {
  const text = `${type}:${salt}:${point.x.toFixed(3)}:${point.z.toFixed(3)}`;
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function getBiomeLocalTopY(type) {
  if (type === 'water') return 0;
  const baseDepth = TILE_VISUAL.tileThickness ?? 0.16;
  return baseDepth * (BIOME_HEIGHT_RATIO[type] ?? 0);
}

function getBiomeLocalBottomY(type, depth) {
  if (type === 'water' || type === 'rail') return -depth;
  return -(TILE_VISUAL.tileThickness ?? depth);
}

function createRaggedOuterEdge(a, b, type) {
  const points = [];
  const seed = hashRaggedEdge(a, b, type);
  const segments = RAGGED_EDGE.segments;

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const x = THREE.MathUtils.lerp(a.x, b.x, t);
    const z = THREE.MathUtils.lerp(a.z, b.z, t);

    // Les deux sommets de l'hexagone restent exacts pour conserver une base propre.
    const endFade = Math.sin(Math.PI * t);
    const broadWave = 0.55 + 0.45 * Math.sin((Math.PI * t * 2) + hash01(seed + 17) * Math.PI * 2);
    const localChaos = 0.65 + 0.35 * hash01(seed + i * 97);
    const bite = RAGGED_EDGE.amplitude * endFade * (0.55 + broadWave * localChaos);
    const length = Math.hypot(x, z) || 1;

    points.push({
      x: x + (x / length) * bite,
      z: z + (z / length) * bite
    });
  }

  return points;
}


function createRaggedInnerEdge(innerPoint, outerPoint, vertexIndex) {
  const points = [];
  const seed = hashRaggedInnerEdge(vertexIndex);
  const segments = RAGGED_EDGE.innerSegments;
  const dx = outerPoint.x - innerPoint.x;
  const dz = outerPoint.z - innerPoint.z;
  const length = Math.hypot(dx, dz) || 1;
  const normal = { x: -dz / length, z: dx / length };

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const x = THREE.MathUtils.lerp(innerPoint.x, outerPoint.x, t);
    const z = THREE.MathUtils.lerp(innerPoint.z, outerPoint.z, t);

    // Les deux extrémités restent exactes : centre et sommets extérieurs
    // propres, frontière interne seulement "mangée" entre les deux.
    const endFade = Math.sin(Math.PI * t);
    const wave = Math.sin((Math.PI * t * 3) + hash01(seed + 23) * Math.PI * 2);
    const localChaos = (hash01(seed + i * 131) - 0.5) * 2;
    const bite = RAGGED_EDGE.innerAmplitude * endFade * ((wave * 0.65) + (localChaos * 0.35));

    points.push({
      x: x + normal.x * bite,
      z: z + normal.z * bite
    });
  }

  return points;
}

function compactPointLoop(points) {
  const compacted = [];

  for (const point of points) {
    const previous = compacted[compacted.length - 1];
    if (!previous || Math.hypot(previous.x - point.x, previous.z - point.z) > 0.0001) {
      compacted.push(point);
    }
  }

  const first = compacted[0];
  const last = compacted[compacted.length - 1];
  if (first && last && Math.hypot(first.x - last.x, first.z - last.z) <= 0.0001) {
    compacted.pop();
  }

  return compacted;
}

function hashRaggedInnerEdge(vertexIndex) {
  return ((vertexIndex + 1) * 2654435761) >>> 0;
}
function hashRaggedEdge(a, b, type) {
  const text = `${type}:${a.x.toFixed(3)},${a.z.toFixed(3)}>${b.x.toFixed(3)},${b.z.toFixed(3)}`;
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function hash01(value) {
  let x = value >>> 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return ((x >>> 0) % 10000) / 10000;
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
  const depth = getSectorDepth(centerType);
  const radius = HEX_SIZE * TILE_VISUAL.centerRadiusScale;
  const vertices = createOuterVertices(radius);

  // Centre construit avec exactement la même orientation que les secteurs.
  // CylinderGeometry peut avoir une orientation/triangulation différente selon
  // Three.js ; ici on ferme explicitement la zone centrale contre les 6 côtés
  // internes pour supprimer les micro-trous visuels.
  const geometry = createPrismGeometry(vertices, depth, centerType);
  const mesh = new THREE.Mesh(geometry, [
    getBiomeMaterial(centerType, opacity),
    getBiomeSideMaterial(centerType, opacity)
  ]);

  mesh.position.y = getBiomeSurfaceY(centerType, TILE_VISUAL.centerY);
  return mesh;
}

function createPrismGeometry(topPoints, depth, type = 'grass') {
  const geometry = new THREE.BufferGeometry();
  const vertexData = [];
  const uvData = [];

  const topHeights = topPoints.map((point, index) => getTerrainTopY(point, type, index + 31));
  const bottomHeights = topHeights.map(() => getBiomeLocalBottomY(type, depth));

  for (let i = 0; i < topPoints.length; i += 1) {
    const point = topPoints[i];
    vertexData.push(point.x, topHeights[i], point.z);
    uvData.push(...uvForPoint(point));
  }

  for (let i = 0; i < topPoints.length; i += 1) {
    const point = topPoints[i];
    vertexData.push(point.x, bottomHeights[i], point.z);
    uvData.push(...uvForPoint(point));
  }

  const topCount = topPoints.length;
  const indices = [];
  const topTriangles = THREE.ShapeUtils.triangulateShape(
    topPoints.map(point => new THREE.Vector2(point.x, point.z)),
    []
  );

  for (const triangle of topTriangles) {
    indices.push(triangle[0], triangle[1], triangle[2]);
  }

  const topIndexCount = indices.length;

  for (const triangle of topTriangles) {
    indices.push(topCount + triangle[2], topCount + triangle[1], topCount + triangle[0]);
  }

  for (let i = 0; i < topCount; i++) {
    const next = (i + 1) % topCount;
    indices.push(i, topCount + i, topCount + next);
    indices.push(i, topCount + next, next);
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertexData), 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvData), 2));
  geometry.setIndex(indices);

  geometry.clearGroups();
  geometry.addGroup(0, topIndexCount, 0);
  geometry.addGroup(topIndexCount, indices.length - topIndexCount, 1);
  geometry.computeVertexNormals();

  return geometry;
}

function getBiomeSurfaceY(type, baseY) {
  // Les biomes en lit bas (eau + rail) sont plus fins, donc leur dessus est
  // abaissé pour conserver un dessous plaqué sur la même base visuelle.
  // Les autres biomes ne sont pas translatés : leurs variations restent locales.
  if (type === 'water') return TILE_VISUAL.waterY;
  if (type === 'rail') return TILE_VISUAL.railSurfaceY ?? TILE_VISUAL.waterY;
  return baseY;
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
