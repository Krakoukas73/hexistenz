/**
 * fieldWheatOverlay.js — Champs de blé animés au vent (GPU-only).
 *
 * Architecture :
 *   - Un seul ShaderMaterial partagé (singleton) pour tous les secteurs.
 *   - uTime et uWindDir référencent directement GLOBAL_WIND_UNIFORMS → 0 update CPU.
 *   - Un Mesh par secteur field (InstancedBufferGeometry, brins en per-instance attributes).
 *   - Groupés par chunk HEX_CHUNK_SIZE pour LOD/frustum culling (même pattern que forestOverlay).
 *
 * Exports : createFieldWheatOverlay, rebuildFieldWheatOverlay, updateFieldWheatLOD
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { EDGE_TYPES, HEX_SIZE, SECTOR_DEFS } from './config.js';
import { hashUnitFull as hashUnit } from './hashUtils.js';
import { createOuterVertices } from './hexGeometry.js';
import { axialToWorld } from './hex.js';
import { getEdgeType } from './tileGenerator.js';
import { getGlobalWindUniforms } from './globalWind.js';
import { WORLD_CURVATURE_UNIFORMS } from './worldCurvature.js';
import { getTerrainSurfaceY } from './terrainHeight.js';
import { wheatVertexShader, wheatFragmentShader } from './shaders/shaderChampBle.js';
import { getSectorContour, getTileCenterType, getCenterContour } from './tileMesh.js';
import {
  WHEAT_BLADE_COUNT, WHEAT_BLADE_WIDTH, WHEAT_BLADE_SEGMENTS,
  WHEAT_INNER_RATIO,
  WHEAT_HEIGHT_MIN, WHEAT_HEIGHT_MAX,
  WHEAT_WIDTH_MIN,  WHEAT_WIDTH_MAX,
  WHEAT_GLOBAL_HEIGHT, WHEAT_WIND_STRENGTH, WHEAT_WIND_SPEED,
  WHEAT_BOTTOM_COLOR, WHEAT_TOP_COLOR, WHEAT_EAR_COLOR,
  HEX_CHUNK_SIZE, LOD_WHEAT_CULL_DISTANCE
} from './variables.js';

// ─── Pré-alloués LOD (évite GC chaque frame) ─────────────────────────────────
const _lodFrustum    = new THREE.Frustum();
const _lodProjMatrix = new THREE.Matrix4();

// ─── Géométrie brin (singleton — partagée entre tous les clones) ──────────────
let _bladeBaseGeo = null;

function getBladeBaseGeo() {
  if (_bladeBaseGeo) return _bladeBaseGeo;
  _bladeBaseGeo = buildBladeGeometry();
  return _bladeBaseGeo;
}

/**
 * Construit la géométrie d'un brin : 2 strips croisés (X et Z) + 2 épis losange.
 * Y normalisé 0→1 (scalé en shader via aHeight * uGlobalHeight).
 * Pas d'attributs per-instance ici — ils sont ajoutés par clone dans rebuildFieldWheatOverlay.
 */
function buildBladeGeometry() {
  const positions = [];
  const parts     = [];
  const indices   = [];
  const segs      = WHEAT_BLADE_SEGMENTS;
  const w         = WHEAT_BLADE_WIDTH;

  let vIdx = 0;
  function pushV(x, y, z, part) {
    positions.push(x, y, z);
    parts.push(part);
    return vIdx++;
  }

  // Deux strips croisés : axe X et axe Z — évite l'effet "disparaît de côté"
  for (let axis = 0; axis < 2; axis++) {
    const base = vIdx;
    for (let i = 0; i <= segs; i++) {
      const t    = i / segs;
      const half = w * (1.0 - t * 0.82);   // tige qui se rétrécit vers le haut
      const y    = t;                        // 0 (sol) → 1 (pointe), scalé en shader
      if (axis === 0) { pushV(-half, y, 0, 0); pushV(half, y, 0, 0); }
      else             { pushV(0, y, -half, 0); pushV(0, y,  half, 0); }
    }
    for (let i = 0; i < segs; i++) {
      const a = base + i * 2, b = a + 1, c = a + 2, d = a + 3;
      indices.push(a, c, b,  b, c, d);
    }
  }

  // Épi losange (2 axes pour visibilité sous toutes les orientations)
  const y0 = 0.74, y1 = 1.08, ew = w * 6.5;
  for (let axis = 0; axis < 2; axis++) {
    const ct = pushV(0, y0, 0, 1);
    const lt = axis === 0 ? pushV(-ew, (y0 + y1) * 0.5, 0, 1) : pushV(0, (y0 + y1) * 0.5, -ew, 1);
    const rt = axis === 0 ? pushV( ew, (y0 + y1) * 0.5, 0, 1) : pushV(0, (y0 + y1) * 0.5,  ew, 1);
    const tp = pushV(0, y1, 0, 1);
    indices.push(ct, lt, tp,  ct, tp, rt);
  }

  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('part',     new THREE.Float32BufferAttribute(parts, 1));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// ─── ShaderMaterial singleton ─────────────────────────────────────────────────
let _wheatMaterial = null;

function getWheatMaterial() {
  if (_wheatMaterial) return _wheatMaterial;

  // uTime et uWindDir partagent l'objet-uniform de globalWind :
  // updateGlobalWind(t) met à jour .value en place → le shader reçoit le bon temps
  // sans aucun code supplémentaire dans la boucle animate.
  const windU = getGlobalWindUniforms();

  _wheatMaterial = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      uTime:         windU.uGlobalWindTime,        // { value: float } partagé
      uWindDir:      windU.uGlobalWindDirection,   // { value: Vector2 } partagé
      uWindStrength: { value: WHEAT_WIND_STRENGTH },
      uWindSpeed:    { value: WHEAT_WIND_SPEED },
      uGlobalHeight: { value: WHEAT_GLOBAL_HEIGHT },
      uBottomColor:  { value: new THREE.Color(WHEAT_BOTTOM_COLOR) },
      uTopColor:     { value: new THREE.Color(WHEAT_TOP_COLOR) },
      uEarColor:     { value: new THREE.Color(WHEAT_EAR_COLOR) },
      uWorldCurvatureEnabled: WORLD_CURVATURE_UNIFORMS.uWorldCurvatureEnabled
    },
    // Shaders externalisés dans shaders/shaderChampBle.js
    vertexShader:   wheatVertexShader,
    fragmentShader: wheatFragmentShader
  });
  return _wheatMaterial;
}

// ─── PRNG léger (déterministe, seedé depuis FNV-1a) ──────────────────────────
function mulberry32(seed) {
  let t = (seed * 999983) >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Sampler polygone (contour réel après turbulence) ────────────────────────
// Remplace randomPointInTrapezoid : utilise le polygone retourné par getSectorContour
// plutôt qu'un trapèze idéal, pour aligner le semis sur la géométrie réellement rendue.
//
// Convention : getSectorContour renvoie {x, z}. On mappe z → y (= Z tile-local)
// pour rester compatible avec l'attribut aOffset {x, y→z} du shader blé.

function buildPolygonSampler(contour) {
  const pts  = contour.map(p => ({ x: p.x, y: p.z }));
  const tris = THREE.ShapeUtils.triangulateShape(
    pts.map(p => new THREE.Vector2(p.x, p.y)), []
  );
  let total = 0;
  const areas = tris.map(([ai, bi, ci]) => {
    const pa = pts[ai], pb = pts[bi], pc = pts[ci];
    const a = Math.abs((pb.x - pa.x) * (pc.y - pa.y) - (pc.x - pa.x) * (pb.y - pa.y)) * 0.5;
    total += a;
    return a;
  });
  total = total || 1;
  const cdf = [];
  let cum = 0;
  for (const a of areas) { cum += a / total; cdf.push(cum); }
  return { pts, tris, cdf };
}

function randomPointInPolygon(rng, sampler) {
  // Consomme 3 appels rng() — identique à l'ancienne randomPointInTrapezoid.
  const r = rng();
  let idx = sampler.cdf.findIndex(w => r <= w);
  if (idx < 0) idx = sampler.tris.length - 1;
  const [ai, bi, ci] = sampler.tris[idx];
  const pa = sampler.pts[ai], pb = sampler.pts[bi], pc = sampler.pts[ci];
  let u = rng(), v = rng();
  if (u + v > 1) { u = 1 - u; v = 1 - v; }
  return {
    x: pa.x + u * (pb.x - pa.x) + v * (pc.x - pa.x),
    y: pa.y + u * (pb.y - pa.y) + v * (pc.y - pa.y)  // y = Z tile-local
  };
}

// ─── Chunk helpers ─────────────────────────────────────────────────────────────
function getChunkKey(q, r) {
  return `${Math.floor(q / HEX_CHUNK_SIZE)}:${Math.floor(r / HEX_CHUNK_SIZE)}`;
}

function computeChunkSphere(centers) {
  const c = new THREE.Vector3();
  for (const p of centers) c.add(p);
  c.divideScalar(centers.length);
  let rad = 0;
  for (const p of centers) rad = Math.max(rad, c.distanceTo(p));
  return new THREE.Sphere(c, rad + HEX_SIZE * 2.0);
}

// ─── API publique ─────────────────────────────────────────────────────────────

export function createFieldWheatOverlay() {
  const group = new THREE.Group();
  group.name  = 'field-wheat-overlay';
  return group;
}

export function rebuildFieldWheatOverlay(group, placedTiles) {
  disposeWheatOverlay(group);

  const material = getWheatMaterial();
  const baseGeo  = getBladeBaseGeo();

  // byChunk : chunkKey → { meshes[], centers[] }
  const byChunk = new Map();

  // Centre hexagonal : hexagone régulier sans turbulence, identique pour toutes les tuiles.
  // Pré-calculé une seule fois avant la boucle pour éviter N reconstructions inutiles.
  const _centerSampler = buildPolygonSampler(getCenterContour());

  for (const placedTile of placedTiles.values()) {
    const tileWorld = axialToWorld(placedTile.q, placedTile.r);
    const vertices  = createOuterVertices();  // tile-local, rayon HEX_SIZE
    const chunkKey  = getChunkKey(placedTile.q, placedTile.r);

    for (const sector of SECTOR_DEFS) {
      const edge = placedTile.tile?.edges?.[sector.key];
      if (getEdgeType(edge) !== EDGE_TYPES.field) continue;

      // Trapèze en XZ tile-local. Convention quad : [inner0, outer0, outer1, inner1]
      // On stocke {x, y} où y = coordonnée Z locale (→ aOffset.y → p.z dans le shader)
      const vA = vertices[sector.a];
      const vB = vertices[sector.b];

      // Surface réelle du champ au centre du secteur (terrain relief inclus)
      const depth = (WHEAT_INNER_RATIO + 1.0) * 0.5;
      const sectorCenterLocal = {
        x: (vA.x + vB.x) * 0.5 * depth,
        z: (vA.z + vB.z) * 0.5 * depth
      };
      const surfaceY = getTerrainSurfaceY(sectorCenterLocal, EDGE_TYPES.field, 0);

      // Contour réel du secteur après turbulence (bords grignotés, identique au rendu)
      const contour = getSectorContour(sector, placedTile.tile.edges, EDGE_TYPES.field);
      const sampler = buildPolygonSampler(contour);

      // Génération per-instance (PRNG seedé depuis FNV-1a, déterministe)
      const count   = WHEAT_BLADE_COUNT;
      const offsets = new Float32Array(count * 2);
      const yaws    = new Float32Array(count);
      const heights = new Float32Array(count);
      const widths  = new Float32Array(count);
      const phases  = new Float32Array(count);
      const colors  = new Float32Array(count);

      const seed = hashUnit(`${placedTile.key}:${sector.key}:wheat`);
      const rng  = mulberry32(seed);

      for (let i = 0; i < count; i++) {
        const p         = randomPointInPolygon(rng, sampler);
        offsets[i * 2]     = p.x;
        offsets[i * 2 + 1] = p.y;
        yaws[i]    = rng() * Math.PI * 2;
        heights[i] = WHEAT_HEIGHT_MIN + rng() * (WHEAT_HEIGHT_MAX - WHEAT_HEIGHT_MIN);
        widths[i]  = WHEAT_WIDTH_MIN  + rng() * (WHEAT_WIDTH_MAX  - WHEAT_WIDTH_MIN);
        phases[i]  = rng() * Math.PI * 2;
        colors[i]  = rng();
      }

      // Clone la géo de base et injecte les attributs per-instance
      const geo = baseGeo.clone();
      // Bounding sphere réaliste : vertices bruts Y=0→1.08 non scalés par le shader.
      // Sans correction Three.js croit que le mesh monte à ~Y+1 world → frustum shadow
      // déréglé → "ombre poteau" projetée au centre de chaque tuile field.
      const _bsHeight = WHEAT_HEIGHT_MAX * WHEAT_GLOBAL_HEIGHT * 1.08;
      geo.boundingSphere = new THREE.Sphere(
        new THREE.Vector3(0, _bsHeight * 0.5, 0),
        HEX_SIZE * 0.95 + _bsHeight
      );
      geo.setAttribute('aOffset',   new THREE.InstancedBufferAttribute(offsets,  2));
      geo.setAttribute('aYaw',      new THREE.InstancedBufferAttribute(yaws,     1));
      geo.setAttribute('aHeight',   new THREE.InstancedBufferAttribute(heights,  1));
      geo.setAttribute('aWidth',    new THREE.InstancedBufferAttribute(widths,   1));
      geo.setAttribute('aPhase',    new THREE.InstancedBufferAttribute(phases,   1));
      geo.setAttribute('aColorMix', new THREE.InstancedBufferAttribute(colors,   1));
      geo.instanceCount = count;

      const mesh = new THREE.Mesh(geo, material);
      mesh.name           = `wheat-${placedTile.key}-${sector.key}`;
      mesh.frustumCulled  = false;   // culling manuel via chunk bounding sphere
      mesh.castShadow     = false;
      mesh.receiveShadow  = false;
      mesh.userData.disableCastShadow = true;  // protège contre la traversée de threeSetup.js
      // Positionné à la vraie surface du champ (terrain relief inclus)
      mesh.position.set(tileWorld.x, surfaceY + 0.004, tileWorld.z); // +4 mm : base des brins au-dessus de la surface visuelle

      if (!byChunk.has(chunkKey)) byChunk.set(chunkKey, { meshes: [], centers: [] });
      const chunk = byChunk.get(chunkKey);
      chunk.meshes.push(mesh);
      chunk.centers.push(new THREE.Vector3(tileWorld.x, surfaceY, tileWorld.z));
    }

    // ─── Centre de la tuile (field) ───────────────────────────────────────────
    // createCenterMesh() utilise le même hexagone régulier (centerRadiusScale, sans turbulence).
    // On génère ici le mesh brins de blé correspondant pour couvrir le centre.
    const _cType = getTileCenterType(placedTile.tile);
    if (_cType === EDGE_TYPES.field) {
      const _cSurfaceY  = getTerrainSurfaceY({ x: 0, z: 0 }, EDGE_TYPES.field, 0);
      const _cCount     = WHEAT_BLADE_COUNT;
      const _cOffsets   = new Float32Array(_cCount * 2);
      const _cYaws      = new Float32Array(_cCount);
      const _cHeights   = new Float32Array(_cCount);
      const _cWidths    = new Float32Array(_cCount);
      const _cPhases    = new Float32Array(_cCount);
      const _cColors    = new Float32Array(_cCount);

      const _cSeed = hashUnit(`${placedTile.key}:center:wheat`);
      const _cRng  = mulberry32(_cSeed);

      for (let i = 0; i < _cCount; i++) {
        const p = randomPointInPolygon(_cRng, _centerSampler);
        _cOffsets[i * 2]     = p.x;
        _cOffsets[i * 2 + 1] = p.y;
        _cYaws[i]    = _cRng() * Math.PI * 2;
        _cHeights[i] = WHEAT_HEIGHT_MIN + _cRng() * (WHEAT_HEIGHT_MAX - WHEAT_HEIGHT_MIN);
        _cWidths[i]  = WHEAT_WIDTH_MIN  + _cRng() * (WHEAT_WIDTH_MAX  - WHEAT_WIDTH_MIN);
        _cPhases[i]  = _cRng() * Math.PI * 2;
        _cColors[i]  = _cRng();
      }

      const _cGeo = baseGeo.clone();
      const _cBsH = WHEAT_HEIGHT_MAX * WHEAT_GLOBAL_HEIGHT * 1.08;
      // centerRadiusScale = 0.33 → rayon bounding sphere légèrement supérieur
      _cGeo.boundingSphere = new THREE.Sphere(
        new THREE.Vector3(0, _cBsH * 0.5, 0),
        HEX_SIZE * 0.40 + _cBsH
      );
      _cGeo.setAttribute('aOffset',   new THREE.InstancedBufferAttribute(_cOffsets,  2));
      _cGeo.setAttribute('aYaw',      new THREE.InstancedBufferAttribute(_cYaws,     1));
      _cGeo.setAttribute('aHeight',   new THREE.InstancedBufferAttribute(_cHeights,  1));
      _cGeo.setAttribute('aWidth',    new THREE.InstancedBufferAttribute(_cWidths,   1));
      _cGeo.setAttribute('aPhase',    new THREE.InstancedBufferAttribute(_cPhases,   1));
      _cGeo.setAttribute('aColorMix', new THREE.InstancedBufferAttribute(_cColors,   1));
      _cGeo.instanceCount = _cCount;

      const _cMesh = new THREE.Mesh(_cGeo, material);
      _cMesh.name           = `wheat-${placedTile.key}-center`;
      _cMesh.frustumCulled  = false;
      _cMesh.castShadow     = false;
      _cMesh.receiveShadow  = false;
      _cMesh.userData.disableCastShadow = true;
      _cMesh.position.set(tileWorld.x, _cSurfaceY + 0.004, tileWorld.z); // +4 mm cohérent avec les secteurs

      if (!byChunk.has(chunkKey)) byChunk.set(chunkKey, { meshes: [], centers: [] });
      const _cChunk = byChunk.get(chunkKey);
      _cChunk.meshes.push(_cMesh);
      _cChunk.centers.push(new THREE.Vector3(tileWorld.x, _cSurfaceY, tileWorld.z));
    }
  }

  // Un Group par chunk avec bounding sphere pour LOD
  for (const [chunkKey, { meshes, centers }] of byChunk) {
    if (meshes.length === 0) continue;
    const chunkGroup = new THREE.Group();
    chunkGroup.name  = `wheat-chunk-${chunkKey}`;
    for (const m of meshes) chunkGroup.add(m);
    chunkGroup.userData.worldBoundingSphere = computeChunkSphere(centers);
    group.add(chunkGroup);
  }
}

/**
 * Met à jour la visibilité des chunks de blé selon frustum + distance caméra.
 * À appeler dans le bloc LOD de scene.js (tous les N frames).
 */
export function updateFieldWheatLOD(group, camera, lodFactor = 1.0) {
  _lodProjMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  _lodFrustum.setFromProjectionMatrix(_lodProjMatrix);
  const effectiveDist = LOD_WHEAT_CULL_DISTANCE * lodFactor;

  for (const chunkGroup of group.children) {
    const sphere = chunkGroup.userData.worldBoundingSphere;
    if (!sphere) continue;
    const dist = camera.position.distanceTo(sphere.center);
    chunkGroup.visible = _lodFrustum.intersectsSphere(sphere) && dist < effectiveDist;
  }
}

// ─── Dispose ──────────────────────────────────────────────────────────────────
function disposeWheatOverlay(group) {
  group.traverse(child => {
    if (child === group) return;
    // Ne pas disposer du ShaderMaterial partagé — seulement la géo per-secteur
    if (child.geometry) child.geometry.dispose();
  });
  group.clear();
}
