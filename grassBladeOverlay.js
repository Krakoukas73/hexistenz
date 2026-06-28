/**
 * grassBladeOverlay.js — Brins de prairie animés (Cubic Bezier Grass).
 *
 * Inspiré du shader ShaderToy "Cubic Bezier Grass" (altunenes, 2026, MIT)
 * https://www.shadertoy.com/view/lslGR8
 *
 * Architecture identique à fieldWheatOverlay.js :
 *   - Un seul ShaderMaterial partagé (singleton).
 *   - uTime / uWindDir partagent GLOBAL_WIND_UNIFORMS → 0 update CPU.
 *   - Un Mesh par secteur grass (InstancedBufferGeometry).
 *   - Groupés par chunk HEX_CHUNK_SIZE pour LOD/frustum culling.
 *
 * Traduction ShaderToy → Three.js :
 *   - Raymarcher remplacé par vertex shader sur géométrie brin (cross-strip).
 *   - Spine Bezier cubique évaluée par vertex (identique à eB() du shader).
 *   - Vent via value-noise Dave Hoskins (même hash h12/vn que l'original).
 *   - Coloring / shading traduit depuis la fonction render() du shader.
 *
 * Exports : createGrassBladeOverlay, rebuildGrassBladeOverlay, updateGrassBladeLOD
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
import { grassBladeVertexShader, grassBladeFragmentShader } from './shaders/shaderBrinsHerbe.js';
import { getSectorContour, getTileCenterType, getCenterContour } from './tileMesh.js';
import {
  GRASS_BLADE_COUNT,
  GRASS_BLADE_WIDTH,
  GRASS_BLADE_SEGMENTS,
  GRASS_INNER_RATIO,
  GRASS_HEIGHT_MIN, GRASS_HEIGHT_MAX,
  GRASS_WIDTH_MIN,  GRASS_WIDTH_MAX,
  GRASS_GLOBAL_HEIGHT,
  GRASS_TILT_MIN,   GRASS_TILT_MAX,
  GRASS_BEND_MIN,   GRASS_BEND_MAX,
  GRASS_WIND_STRENGTH, GRASS_WIND_SPEED, GRASS_WIND_SWAY,
  GRASS_BOTTOM_COLOR, GRASS_MID_COLOR, GRASS_TIP_COLOR,
  HEX_CHUNK_SIZE, LOD_GRASS_CULL_DISTANCE
} from './variables.js';

// ─── Pré-alloués LOD ─────────────────────────────────────────────────────────
const _lodFrustum    = new THREE.Frustum();
const _lodProjMatrix = new THREE.Matrix4();

// ─── Géométrie brin (singleton) ───────────────────────────────────────────────
let _bladeBaseGeo = null;

function getBladeBaseGeo() {
  if (_bladeBaseGeo) return _bladeBaseGeo;
  _bladeBaseGeo = buildBladeGeometry();
  return _bladeBaseGeo;
}

/**
 * Brin de prairie : 2 strips croisés (axe X et axe Z) pour visibilité sous tous
 * les angles. Y normalisé 0→1, scalé en shader. Pas de "part" épi (contrairement
 * au blé) : le shading gradient suffit pour la pointe de la lame d'herbe.
 *
 * Encoding position :
 *   position.x = ±half_width  (strip 0, axe X)
 *   position.z = ±half_width  (strip 1, axe Z)
 *   position.y = t ∈ [0, 1]   (position normalisée le long du brin)
 */
function buildBladeGeometry() {
  const positions = [];
  const indices   = [];
  const segs = GRASS_BLADE_SEGMENTS;
  const w    = GRASS_BLADE_WIDTH;

  let vIdx = 0;
  function pushV(x, y, z) { positions.push(x, y, z); return vIdx++; }

  for (let axis = 0; axis < 2; axis++) {
    const base = vIdx;
    for (let i = 0; i <= segs; i++) {
      const t    = i / segs;
      const half = w * (1.0 - t * 0.88);  // amincissement vers la pointe
      const y    = t;
      if (axis === 0) { pushV(-half, y, 0); pushV(half, y, 0); }
      else             { pushV(0, y, -half); pushV(0, y,  half); }
    }
    for (let i = 0; i < segs; i++) {
      const a = base + i * 2, b = a + 1, c = a + 2, d = a + 3;
      indices.push(a, c, b,  b, c, d);
    }
  }

  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// ─── ShaderMaterial singleton ─────────────────────────────────────────────────
let _grassMaterial = null;

function getGrassMaterial() {
  if (_grassMaterial) return _grassMaterial;

  const windU = getGlobalWindUniforms();
  const sunDir = new THREE.Vector3(0.55, 0.75, -0.35).normalize();

  _grassMaterial = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      uTime:          windU.uGlobalWindTime,       // partagé globalWind
      uWindDir:       windU.uGlobalWindDirection,  // partagé globalWind
      uWindStrength:  { value: GRASS_WIND_STRENGTH },
      uWindSpeed:     { value: GRASS_WIND_SPEED    },
      uWindSway:      { value: GRASS_WIND_SWAY     },
      uGlobalHeight:  { value: GRASS_GLOBAL_HEIGHT },
      uBottomColor:   { value: new THREE.Color(GRASS_BOTTOM_COLOR) },
      uMidColor:      { value: new THREE.Color(GRASS_MID_COLOR)    },
      uTipColor:      { value: new THREE.Color(GRASS_TIP_COLOR)    },
      uSunDir:        { value: sunDir },
      uWorldCurvatureEnabled: WORLD_CURVATURE_UNIFORMS.uWorldCurvatureEnabled
    },

    // Shaders externalisés dans shadersEffects.js
    vertexShader:   grassBladeVertexShader,
    fragmentShader: grassBladeFragmentShader
  });

  return _grassMaterial;
}

// ─── PRNG déterministe ────────────────────────────────────────────────────────
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
// Convention : le polygone getSectorContour renvoie {x, z} (coords tile-local).
// On mappe z → y pour rester compatible avec l'attribut aOffset {x=local-X, y=local-Z}.

function buildPolygonSampler(contour) {
  // pts : {x, y} où y = coordonnée Z locale (convention aOffset du shader)
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
    y: pa.y + u * (pb.y - pa.y) + v * (pc.y - pa.y)
  };
}

// ─── Chunks ───────────────────────────────────────────────────────────────────
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

export function createGrassBladeOverlay() {
  const group = new THREE.Group();
  group.name  = 'grass-blade-overlay';
  return group;
}

export function rebuildGrassBladeOverlay(group, placedTiles) {
  disposeGrassOverlay(group);

  const material = getGrassMaterial();
  const baseGeo  = getBladeBaseGeo();

  const byChunk = new Map();

  // Centre hexagonal : hexagone régulier sans turbulence, identique pour toutes les tuiles.
  // Pré-calculé une seule fois avant la boucle pour éviter N reconstructions inutiles.
  const _centerSampler = buildPolygonSampler(getCenterContour());

  for (const placedTile of placedTiles.values()) {
    const tileWorld = axialToWorld(placedTile.q, placedTile.r);
    const vertices  = createOuterVertices();
    const chunkKey  = getChunkKey(placedTile.q, placedTile.r);

    for (const sector of SECTOR_DEFS) {
      const edge = placedTile.tile?.edges?.[sector.key];
      const edgeType = getEdgeType(edge);
      if (edgeType !== EDGE_TYPES.grass && edgeType !== EDGE_TYPES.forest) continue;

      const vA = vertices[sector.a];
      const vB = vertices[sector.b];

      // Surface terrain au centre du secteur (prairie ou sol de forêt)
      const depth = (GRASS_INNER_RATIO + 1.0) * 0.5;
      const sectorCenterLocal = {
        x: (vA.x + vB.x) * 0.5 * depth,
        z: (vA.z + vB.z) * 0.5 * depth
      };
      // +0.005 : décalage anti-Z-fight + remontée au-dessus surface visuelle
      const surfaceY = getTerrainSurfaceY(sectorCenterLocal, edgeType, 0) + 0.005;

      // Contour réel du secteur après turbulence (bords grignotés, identique au rendu)
      const contour = getSectorContour(sector, placedTile.tile.edges, edgeType);
      const sampler = buildPolygonSampler(contour);

      const count   = GRASS_BLADE_COUNT;
      const offsets = new Float32Array(count * 2);
      const yaws    = new Float32Array(count);
      const heights = new Float32Array(count);
      const widths  = new Float32Array(count);
      const tilts   = new Float32Array(count);
      const bends   = new Float32Array(count);
      const phases  = new Float32Array(count);
      const colors  = new Float32Array(count);

      const seed = hashUnit(`${placedTile.key}:${sector.key}:grass`);
      const rng  = mulberry32(seed);

      for (let i = 0; i < count; i++) {
        const p = randomPointInPolygon(rng, sampler);
        offsets[i * 2]     = p.x;
        offsets[i * 2 + 1] = p.y;
        yaws[i]    = rng() * Math.PI * 2;
        heights[i] = GRASS_HEIGHT_MIN + rng() * (GRASS_HEIGHT_MAX - GRASS_HEIGHT_MIN);
        widths[i]  = GRASS_WIDTH_MIN  + rng() * (GRASS_WIDTH_MAX  - GRASS_WIDTH_MIN);
        tilts[i]   = GRASS_TILT_MIN   + rng() * (GRASS_TILT_MAX   - GRASS_TILT_MIN);
        bends[i]   = GRASS_BEND_MIN   + rng() * (GRASS_BEND_MAX   - GRASS_BEND_MIN);
        phases[i]  = rng();   // 0→1, multiplié par 2π dans le shader
        colors[i]  = rng();   // variation couleur cluster
      }

      const geo = baseGeo.clone();

      // Bounding sphere corrigée (évite le shadow poteau)
      const _bsH = GRASS_HEIGHT_MAX * GRASS_GLOBAL_HEIGHT;
      geo.boundingSphere = new THREE.Sphere(
        new THREE.Vector3(0, _bsH * 0.5, 0),
        HEX_SIZE * 0.95 + _bsH
      );

      geo.setAttribute('aOffset',   new THREE.InstancedBufferAttribute(offsets,  2));
      geo.setAttribute('aYaw',      new THREE.InstancedBufferAttribute(yaws,     1));
      geo.setAttribute('aHeight',   new THREE.InstancedBufferAttribute(heights,  1));
      geo.setAttribute('aWidth',    new THREE.InstancedBufferAttribute(widths,   1));
      geo.setAttribute('aTilt',     new THREE.InstancedBufferAttribute(tilts,    1));
      geo.setAttribute('aBend',     new THREE.InstancedBufferAttribute(bends,    1));
      geo.setAttribute('aPhase',    new THREE.InstancedBufferAttribute(phases,   1));
      geo.setAttribute('aColorMix', new THREE.InstancedBufferAttribute(colors,   1));
      geo.instanceCount = count;

      const mesh = new THREE.Mesh(geo, material);
      mesh.name           = `grass-${placedTile.key}-${sector.key}`;
      mesh.frustumCulled  = false;
      mesh.castShadow     = false;
      mesh.receiveShadow  = false;
      mesh.userData.disableCastShadow = true;
      mesh.position.set(tileWorld.x, surfaceY, tileWorld.z);

      if (!byChunk.has(chunkKey)) byChunk.set(chunkKey, { meshes: [], centers: [] });
      const chunk = byChunk.get(chunkKey);
      chunk.meshes.push(mesh);
      chunk.centers.push(new THREE.Vector3(tileWorld.x, surfaceY, tileWorld.z));
    }

    // ─── Centre de la tuile (grass / forest) ─────────────────────────────────
    // createCenterMesh() utilise le même hexagone régulier (centerRadiusScale, sans turbulence).
    // On génère ici le mesh brins correspondant pour couvrir le centre.
    const _cType = getTileCenterType(placedTile.tile);
    if (_cType === EDGE_TYPES.grass || _cType === EDGE_TYPES.forest) {
      const _cSurfaceY  = getTerrainSurfaceY({ x: 0, z: 0 }, _cType, 0) + 0.001;
      const _cCount     = GRASS_BLADE_COUNT;
      const _cOffsets   = new Float32Array(_cCount * 2);
      const _cYaws      = new Float32Array(_cCount);
      const _cHeights   = new Float32Array(_cCount);
      const _cWidths    = new Float32Array(_cCount);
      const _cTilts     = new Float32Array(_cCount);
      const _cBends     = new Float32Array(_cCount);
      const _cPhases    = new Float32Array(_cCount);
      const _cColors    = new Float32Array(_cCount);

      const _cSeed = hashUnit(`${placedTile.key}:center:grass`);
      const _cRng  = mulberry32(_cSeed);

      for (let i = 0; i < _cCount; i++) {
        const p = randomPointInPolygon(_cRng, _centerSampler);
        _cOffsets[i * 2]     = p.x;
        _cOffsets[i * 2 + 1] = p.y;
        _cYaws[i]    = _cRng() * Math.PI * 2;
        _cHeights[i] = GRASS_HEIGHT_MIN + _cRng() * (GRASS_HEIGHT_MAX - GRASS_HEIGHT_MIN);
        _cWidths[i]  = GRASS_WIDTH_MIN  + _cRng() * (GRASS_WIDTH_MAX  - GRASS_WIDTH_MIN);
        _cTilts[i]   = GRASS_TILT_MIN   + _cRng() * (GRASS_TILT_MAX   - GRASS_TILT_MIN);
        _cBends[i]   = GRASS_BEND_MIN   + _cRng() * (GRASS_BEND_MAX   - GRASS_BEND_MIN);
        _cPhases[i]  = _cRng();
        _cColors[i]  = _cRng();
      }

      const _cGeo = baseGeo.clone();
      const _cBsH = GRASS_HEIGHT_MAX * GRASS_GLOBAL_HEIGHT;
      // centerRadiusScale = 0.33 → rayon bounding sphere légèrement supérieur
      _cGeo.boundingSphere = new THREE.Sphere(
        new THREE.Vector3(0, _cBsH * 0.5, 0),
        HEX_SIZE * 0.40 + _cBsH
      );
      _cGeo.setAttribute('aOffset',   new THREE.InstancedBufferAttribute(_cOffsets,  2));
      _cGeo.setAttribute('aYaw',      new THREE.InstancedBufferAttribute(_cYaws,     1));
      _cGeo.setAttribute('aHeight',   new THREE.InstancedBufferAttribute(_cHeights,  1));
      _cGeo.setAttribute('aWidth',    new THREE.InstancedBufferAttribute(_cWidths,   1));
      _cGeo.setAttribute('aTilt',     new THREE.InstancedBufferAttribute(_cTilts,    1));
      _cGeo.setAttribute('aBend',     new THREE.InstancedBufferAttribute(_cBends,    1));
      _cGeo.setAttribute('aPhase',    new THREE.InstancedBufferAttribute(_cPhases,   1));
      _cGeo.setAttribute('aColorMix', new THREE.InstancedBufferAttribute(_cColors,   1));
      _cGeo.instanceCount = _cCount;

      const _cMesh = new THREE.Mesh(_cGeo, material);
      _cMesh.name           = `grass-${placedTile.key}-center`;
      _cMesh.frustumCulled  = false;
      _cMesh.castShadow     = false;
      _cMesh.receiveShadow  = false;
      _cMesh.userData.disableCastShadow = true;
      _cMesh.position.set(tileWorld.x, _cSurfaceY, tileWorld.z);

      if (!byChunk.has(chunkKey)) byChunk.set(chunkKey, { meshes: [], centers: [] });
      const _cChunk = byChunk.get(chunkKey);
      _cChunk.meshes.push(_cMesh);
      _cChunk.centers.push(new THREE.Vector3(tileWorld.x, _cSurfaceY, tileWorld.z));
    }
  }

  for (const [chunkKey, { meshes, centers }] of byChunk) {
    if (meshes.length === 0) continue;
    const chunkGroup = new THREE.Group();
    chunkGroup.name  = `grass-chunk-${chunkKey}`;
    for (const m of meshes) chunkGroup.add(m);
    chunkGroup.userData.worldBoundingSphere = computeChunkSphere(centers);
    group.add(chunkGroup);
  }
}

/**
 * LOD frustum + distance caméra.
 * À appeler dans le bloc LOD de scene.js (tous les N frames).
 */
export function updateGrassBladeLOD(group, camera, lodFactor = 1.0) {
  _lodProjMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  _lodFrustum.setFromProjectionMatrix(_lodProjMatrix);
  const effectiveDist = LOD_GRASS_CULL_DISTANCE * lodFactor;

  for (const chunkGroup of group.children) {
    const sphere = chunkGroup.userData.worldBoundingSphere;
    if (!sphere) continue;
    const dist = camera.position.distanceTo(sphere.center);
    chunkGroup.visible = _lodFrustum.intersectsSphere(sphere) && dist < effectiveDist;
  }
}

// ─── Dispose ──────────────────────────────────────────────────────────────────
function disposeGrassOverlay(group) {
  group.traverse(child => {
    if (child === group) return;
    if (child.geometry) child.geometry.dispose();
    // Ne pas disposer du ShaderMaterial partagé
  });
  group.clear();
}
