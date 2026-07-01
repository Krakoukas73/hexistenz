import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { EDGE_ORDER, HEX_SIZE, TILE_VISUAL, SECTOR_DEFS, FIELD_THICKNESS_RATIO } from './config.js';
import { WORLD_CURVATURE } from './worldCurvature.js';
import { createOuterVertices } from './hexGeometry.js';
import { getEdgeType } from './tileGenerator.js';
import { getBiomeMaterial, getBiomeSideMaterial } from './tileTextures.js';
import { createRailCenterOverlay } from './tileRailOverlay.js';
import { createRoadCenterOverlay } from './tileRoadOverlay.js';
import { createValueLabel, getMiniValueLabel } from './tileLabels.js';
import { registerCurvedSprite } from './threeSetup.js';

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
    forest: 0.083,
    field: 0.075,
    house: 0.039,
    rail: 0.043,
    water: 0.017
  },
  edgeFadeStart: 0.30
};

// NB : constantes ci-dessous conservées pour référence — la géométrie réelle
// est contrôlée par getSectorDepth() et TILE_VISUAL dans variables.js.
const THIN_BIOME_DEPTH_RATIO = {
  house:  0.708, // sync variables.js
  forest: 0.733,
  grass:  0.683,
};

const BIOME_HEIGHT_RATIO = {
  field: 0.0462, // sync variables.js
};

export function createTileMesh(tileOrEdges, options = {}) {
  const edges = tileOrEdges.edges ?? tileOrEdges;
  const center = countEdgesOfType(edges, 'water') >= 2 ? 'water' : (tileOrEdges.center ?? pickCenterType(edges));
  const opacity = options.opacity ?? 1;
  const worldX  = options.worldX ?? 0;
  const worldZ  = options.worldZ ?? 0;
  const group = new THREE.Group();

  group.add(...createSectorMeshes(edges, opacity, worldX, worldZ));
  const centerMesh = createCenterMesh(center, opacity, worldX, worldZ);
  if (centerMesh) group.add(centerMesh);

  const roadCenterOverlay = createRoadCenterOverlay(edges, SECTOR_DEFS, createOuterVertices);
  if (roadCenterOverlay) group.add(roadCenterOverlay);

  const railCenterOverlay = createRailCenterOverlay(edges, SECTOR_DEFS, createOuterVertices);
  if (railCenterOverlay) group.add(railCenterOverlay);

  return group;
}

export function renderMiniTile(tile) {
  if (!tile) return '';

  const e = tile.edges;
  const c = countEdgesOfType(e, 'water') >= 2 ? 'water' : (tile.center ?? mostCommonEdgeType(edgesToArray(e)));
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

function createSectorMeshes(edges, opacity, worldX = 0, worldZ = 0) {
  const vertices = createOuterVertices(HEX_SIZE * TILE_VISUAL.radiusScale);

  return SECTOR_DEFS.map((sector, sectorIndex) => {
    const edge = edges[sector.key];
    const type = getEdgeType(edge);
    const group = new THREE.Group();
    group.userData.edgeKey = sector.key;

    // Eau : rendue par waterSurfaceOverlay.js (nappe continue par zone, contour
    // organique). Ce mesh terrain par-secteur serait de toute façon masqué par
    // hideTerrainMeshes() et exclu du merge (isMergeableTerrainMesh) : on évite
    // de le construire (géométrie + triangulation) pour rien. Seul le label de
    // valeur reste nécessaire ici (affiché indépendamment du mesh terrain).
    if (type !== 'water') {
      const previousSector = SECTOR_DEFS[(sectorIndex + SECTOR_DEFS.length - 1) % SECTOR_DEFS.length];
      const nextSector = SECTOR_DEFS[(sectorIndex + 1) % SECTOR_DEFS.length];
      const previousType = getEdgeType(edges[previousSector.key]);
      const nextType = getEdgeType(edges[nextSector.key]);

      // Quand deux secteurs voisins ont la même matière, on supprime le
      // grignotage sur leur frontière commune : plus de micro-trous moches
      // entre deux triangles censés former une seule surface continue.
      const geometry = createSectorGeometry(
        vertices[sector.a],
        vertices[sector.b],
        type,
        sector.a,
        sector.b,
        previousType !== type,
        nextType !== type,
        worldX,
        worldZ
      );
      const materials = [getBiomeMaterial(type, opacity), getBiomeSideMaterial(type, opacity)];
      const mesh = new THREE.Mesh(geometry, materials);
      mesh.name = `hex-sector-${type}`;  // pour le HUD perf
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      mesh.userData.disableCastShadow = true;
      mesh.position.y = getBiomeSurfaceY(type);
      group.add(mesh);
    }

    const label = createValueLabel(edge, vertices[sector.a], vertices[sector.b]);
    if (label) {
      label.userData.isValueLabel = true;
      label.userData.edgeKey = sector.key;
      registerCurvedSprite(label);
      group.add(label);
    }

    return group;
  });
}

function createSectorGeometry(a, b, type, aIndex, bIndex, raggedLeft = true, raggedRight = true, worldX = 0, worldZ = 0) {
  return createThickSectorGeometry(a, b, getSectorDepth(type), type, aIndex, bIndex, raggedLeft, raggedRight, worldX, worldZ);
}

function getSectorDepth(type) {
  // Eau : minimum absolu.
  if (type === 'water') return TILE_VISUAL.waterThickness ?? ((TILE_VISUAL.tileThickness ?? 0.12) * 0.5);
  // Rail : légèrement au-dessus de l'eau.
  if (type === 'rail') return TILE_VISUAL.railThickness ?? TILE_VISUAL.waterThickness ?? ((TILE_VISUAL.tileThickness ?? 0.12) * 0.5);
  // Terre : field max (0.12), les autres regroupés à mi-chemin eau/field ≈ 0.082–0.088.
  // Écart de 3 mm par palier pour supprimer le Z-fight même caméra haute.
  const base = TILE_VISUAL.tileThickness ?? 0.12;
  if (type === 'field')  return base * 0.783; // ≈ 0.094 (forest + 1 palier de 0.050)
  if (type === 'forest') return base * 0.733; // ≈ 0.088
  if (type === 'house')  return base * 0.708; // ≈ 0.085
  if (type === 'grass')  return base * 0.683; // ≈ 0.082
  return base; // fallback
}

/**
 * Calcule le décalage XZ à appliquer au BAS des faces latérales en mode bouliste,
 * pour qu'elles paraissent perpendiculaires à la surface courbée après le drop GPU.
 *
 * Formule exacte : après le drop GPU ΔY = -(wx·Δx + wz·Δz)/R, pour que la direction
 * visuelle de la tranche soit la normale de surface (wx/R, 1, wz/R), le décalage
 * bottom XZ doit être k·depth·(wx, wz)/R avec k = R²/(R²+r²).
 *
 * @param {number} localX  X local du vertex (relatif au centre de la tuile)
 * @param {number} localZ  Z local du vertex
 * @param {number} worldX  X monde du centre de la tuile
 * @param {number} worldZ  Z monde du centre de la tuile
 * @param {number} depth   épaisseur de la tranche (profondeur de la face latérale)
 * @returns {{ dx: number, dz: number }}
 */
function _sideBottomShift(localX, localZ, worldX, worldZ, depth) {
  if (!WORLD_CURVATURE.enabled) return { dx: 0, dz: 0 };
  const R  = WORLD_CURVATURE.radius;
  const wx = worldX + localX;
  const wz = worldZ + localZ;
  const R2 = R * R;
  const k  = R2 / (R2 + wx * wx + wz * wz); // pré-compensation GPU
  return { dx: depth * k * wx / R, dz: depth * k * wz / R };
}

function createThickSectorGeometry(a, b, depth, type = 'grass', aIndex = 0, bIndex = 1, raggedLeft = true, raggedRight = true, worldX = 0, worldZ = 0) {
  const geometry = new THREE.BufferGeometry();
  const innerRadius = HEX_SIZE * TILE_VISUAL.centerRadiusScale;
  const innerA = pointAtRadius(a, innerRadius);
  const innerB = pointAtRadius(b, innerRadius);
  const leftInnerEdge = createInnerEdge(innerA, a, aIndex, raggedLeft);
  const outerPoints = createRaggedOuterEdge(a, b, type);
  const rightInnerEdge = createInnerEdge(innerB, b, bIndex, raggedRight).reverse();

  const topPoints = compactPointLoop([
    ...leftInnerEdge,
    ...outerPoints,
    ...rightInnerEdge
  ]);
  const bottomPoints = topPoints.map(point => ({ ...point }));
  const vertexData = [];
  const uvData = [];

  // Surface plate : plus de relief vertical sur la face supérieure.
  // Les bords grignotés (XZ) sont conservés via createRaggedOuterEdge / createRaggedInnerEdge.
  const topHeights = topPoints.map(() => getBiomeLocalTopY(type) + RAGGED_EDGE.lift);
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

  const bottomIndexCount = indices.length - topIndexCount;

  // Flancs, y compris le bord extérieur dentelé.
  // Les faces latérales ont leurs propres sommets/UV : indispensable pour
  // appliquer une texture verticale lisible sur les tranches de champs de blé
  // sans massacrer les UV du dessus texturé.
  const sideIndexStart = indices.length;
  const perimeterLengths = [0];
  for (let i = 0; i < topCount; i++) {
    const next = (i + 1) % topCount;
    const aPoint = topPoints[i];
    const bPoint = topPoints[next];
    const length = Math.hypot(bPoint.x - aPoint.x, bPoint.z - aPoint.z);
    perimeterLengths.push(perimeterLengths[i] + length);
  }
  const perimeter = Math.max(perimeterLengths[perimeterLengths.length - 1], 0.001);

  for (let i = 0; i < topCount; i++) {
    const next = (i + 1) % topCount;
    const aPoint = topPoints[i];
    const bPoint = topPoints[next];
    const u0 = perimeterLengths[i] / perimeter;
    const u1 = perimeterLengths[i + 1] / perimeter;
    const baseIndex = vertexData.length / 3;

    // En mode bouliste, les sommets du bas des faces latérales sont décalés vers
    // l'intérieur (vers le centre mondial) pour que les tranches semblent
    // perpendiculaires à la surface courbée après le drop GPU.
    const sa = _sideBottomShift(aPoint.x, aPoint.z, worldX, worldZ, depth);
    const sb = _sideBottomShift(bPoint.x, bPoint.z, worldX, worldZ, depth);

    vertexData.push(aPoint.x,          topHeights[i],    aPoint.z);
    uvData.push(u0, 1);
    vertexData.push(aPoint.x - sa.dx,  bottomHeights[i], aPoint.z - sa.dz);
    uvData.push(u0, 0);
    vertexData.push(bPoint.x - sb.dx,  bottomHeights[next], bPoint.z - sb.dz);
    uvData.push(u1, 0);
    vertexData.push(bPoint.x,          topHeights[next], bPoint.z);
    uvData.push(u1, 1);

    indices.push(baseIndex, baseIndex + 1, baseIndex + 2);
    indices.push(baseIndex, baseIndex + 2, baseIndex + 3);
  }

  const sideIndexCount = indices.length - sideIndexStart;

  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertexData), 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvData), 2));
  geometry.setIndex(indices);

  geometry.clearGroups();
  geometry.addGroup(0, topIndexCount, 0);
  geometry.addGroup(topIndexCount, bottomIndexCount + sideIndexCount, 1);
  geometry.computeVertexNormals();

  return geometry;
}


function getTerrainTopY(point, type, salt = 0) {
  const baseY = getBiomeLocalTopY(type);

  // Les secteurs de voie ferrée sont volontairement plats : pas de pente locale,
  // pas de turbulence verticale. Les rails/traverses/cailloux posés dessus
  // héritent ainsi d'un support stable au lieu de disparaître dans le relief.
  if (type === 'rail') return baseY;

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
  // Surface plate : toutes les tuiles ont leur dessus au niveau local 0.
  // Le positionnement monde est assuré par getBiomeSurfaceY (mesh.position.y).
  return 0;
}

function getBiomeLocalBottomY(type, depth) {
  // Fond toujours à -depth (local). Eau : depth=waterThickness. Terre : depth=tileThickness.
  return -depth;
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


function createInnerEdge(innerPoint, outerPoint, vertexIndex, ragged = true) {
  return ragged
    ? createRaggedInnerEdge(innerPoint, outerPoint, vertexIndex)
    : createStraightInnerEdge(innerPoint, outerPoint);
}

function createStraightInnerEdge(innerPoint, outerPoint) {
  const points = [];
  const segments = RAGGED_EDGE.innerSegments;

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    points.push({
      x: THREE.MathUtils.lerp(innerPoint.x, outerPoint.x, t),
      z: THREE.MathUtils.lerp(innerPoint.z, outerPoint.z, t)
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

function createCenterMesh(centerType, opacity, worldX = 0, worldZ = 0) {
  // Eau : rendue par waterSurfaceOverlay.js — pas de mesh terrain ici (voir
  // note équivalente dans createSectorMeshes). Aucun label de centre n'existe
  // dans ce fichier, donc rien d'autre à préserver pour ce cas.
  if (centerType === 'water') return null;

  const depth = getSectorDepth(centerType);
  const radius = HEX_SIZE * TILE_VISUAL.centerRadiusScale;
  const vertices = createOuterVertices(radius);

  // Centre construit avec exactement la même orientation que les secteurs.
  // CylinderGeometry peut avoir une orientation/triangulation différente selon
  // Three.js ; ici on ferme explicitement la zone centrale contre les 6 côtés
  // internes pour supprimer les micro-trous visuels.
  const geometry = createPrismGeometry(vertices, depth, centerType, worldX, worldZ);
  const mesh = new THREE.Mesh(geometry, [
    getBiomeMaterial(centerType, opacity),
    getBiomeSideMaterial(centerType, opacity)
  ]);

  mesh.name = `hex-center-${centerType}`;  // pour le HUD perf
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.userData.disableCastShadow = true;
  mesh.position.y = getBiomeSurfaceY(centerType);
  return mesh;
}

function createPrismGeometry(topPoints, depth, type = 'grass', worldX = 0, worldZ = 0) {
  const geometry = new THREE.BufferGeometry();
  const vertexData = [];
  const uvData = [];

  // Surface plate : même Y pour tous les sommets du centre (cohérent avec les secteurs).
  const topHeights = topPoints.map(() => getBiomeLocalTopY(type));
  const bottomHeights = topHeights.map(() => getBiomeLocalBottomY(type, depth));

  for (let i = 0; i < topPoints.length; i += 1) {
    const point = topPoints[i];
    vertexData.push(point.x, topHeights[i], point.z);
    uvData.push(...uvForPoint(point));
  }

  for (let i = 0; i < topPoints.length; i += 1) {
    const point = topPoints[i];
    // En bouliste : décaler le bas vers le centre monde pour aligner les tranches.
    const s = _sideBottomShift(point.x, point.z, worldX, worldZ, depth);
    vertexData.push(point.x - s.dx, bottomHeights[i], point.z - s.dz);
    uvData.push(...uvForPoint(point)); // UV basés sur la position originale
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

function getBiomeSurfaceY(type) {
  // Tous les biomes : fond ancré à y=0 monde, dessus à +depth.
  // mesh.position.y = depth → local bottom (y=−depth) arrive à y=0 en monde.
  // Sync avec terrainHeight.js::getBiomeSurfaceOffsetY.
  if (type === 'water') return TILE_VISUAL.waterThickness ?? (TILE_VISUAL.tileThickness ?? 0.12) * 0.5;
  if (type === 'rail')  return TILE_VISUAL.railSurfaceY ?? (TILE_VISUAL.railThickness ?? 0.075);
  // Terre : les 3 mm d'écart dans getSectorDepth assurent l'anti Z-fight.
  return getSectorDepth(type); // grass→0.082, house→0.085, forest→0.088, field→0.094
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

function edgesToArray(edges) {
  return EDGE_ORDER.map(edge => getEdgeType(edges[edge]));
}

function pickCenterType(edges) {
  const types = edgesToArray(edges);
  // Fallback visuel cohérent avec tileGenerator : le centre eau n'est utilisé
  // que pour relier au moins deux triangles d'eau dans la tuile.
  if (countEdgesOfType(edges, 'water') >= 2) return 'water';
  if (hasEdgeType(edges, 'rail')) return 'rail';
  return mostCommonEdgeType(types);
}

function countEdgesOfType(edges, type) {
  return EDGE_ORDER.reduce((count, edge) => count + (getEdgeType(edges[edge]) === type ? 1 : 0), 0);
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

/**
 * Retourne le contour 2D final (après turbulence) d'un secteur de tuile.
 *
 * Exposé pour grassBladeOverlay et fieldWheatOverlay : aligne le semis de brins
 * sur la géométrie réellement rendue plutôt que sur un trapèze idéal.
 *
 * Déterministe : même (sector, edges, type) → même polygone, grâce aux hashs
 * FNV-1a de createRaggedOuterEdge et au hash Knuth de createRaggedInnerEdge.
 *
 * @param {Object} sector  — entrée SECTOR_DEFS : {key, a, b}
 * @param {Object} edges   — edges de la tuile {n, ne, se, s, sw, nw}
 * @param {string} type    — type du secteur ('grass', 'forest', 'field'…)
 * @returns {Array<{x: number, z: number}>} polygone 2D en coordonnées tile-local
 */
/**
 * Retourne le type de biome du centre d'une tuile, en répliquant exactement la
 * logique de createTileMesh (eau si ≥2 secteurs eau, sinon tile.center ou pickCenterType).
 * Exposé pour grassBladeOverlay et fieldWheatOverlay.
 *
 * @param {Object} tile — objet tuile {edges, center}
 * @returns {string}
 */
export function getTileCenterType(tile) {
  const edges = tile?.edges ?? tile;
  return countEdgesOfType(edges, 'water') >= 2
    ? 'water'
    : (tile?.center ?? pickCenterType(edges));
}

/**
 * Retourne le contour 2D du centre hexagonal (hexagone régulier, sans turbulence).
 * Cohérent avec createCenterMesh() qui utilise createOuterVertices(centerRadiusScale).
 * Exposé pour grassBladeOverlay et fieldWheatOverlay.
 *
 * @returns {Array<{x: number, z: number}>}
 */
export function getCenterContour() {
  return createOuterVertices(HEX_SIZE * TILE_VISUAL.centerRadiusScale);
}

export function getSectorContour(sector, edges, type) {
  const outerVertices = createOuterVertices(HEX_SIZE * TILE_VISUAL.radiusScale);
  const a = outerVertices[sector.a];
  const b = outerVertices[sector.b];

  const sectorIndex = SECTOR_DEFS.findIndex(s => s.key === sector.key);
  const prevSector = SECTOR_DEFS[(sectorIndex + SECTOR_DEFS.length - 1) % SECTOR_DEFS.length];
  const nextSector = SECTOR_DEFS[(sectorIndex + 1) % SECTOR_DEFS.length];
  const raggedLeft  = getEdgeType(edges[prevSector.key]) !== type;
  const raggedRight = getEdgeType(edges[nextSector.key]) !== type;

  const innerRadius = HEX_SIZE * TILE_VISUAL.centerRadiusScale;
  const innerA = pointAtRadius(a, innerRadius);
  const innerB = pointAtRadius(b, innerRadius);

  const leftInnerEdge  = createInnerEdge(innerA, a, sector.a, raggedLeft);
  const outerPoints    = createRaggedOuterEdge(a, b, type);
  const rightInnerEdge = createInnerEdge(innerB, b, sector.b, raggedRight).reverse();

  return compactPointLoop([...leftInnerEdge, ...outerPoints, ...rightInnerEdge]);
}
