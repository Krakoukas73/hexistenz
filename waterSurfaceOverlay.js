/**
 * waterSurfaceOverlay.js — Eau unifiée « nappe continue », rivage organique.
 *
 * Trois géométries fusionnées construites depuis les secteurs eau posés :
 *   1. SURFACE  — nappe plate transparente à WATER_RENDER.surfaceY.
 *   2. RIVERBED — même empreinte à WATER_RENDER.riverbedY, opaque (vu par transparence).
 *   3. SKIRT    — quads verticaux sur le contour eau↔non-eau (ferme le volume).
 *
 * SILHOUETTE ORGANIQUE (P1) : les sommets situés sur le CONTOUR (arêtes eau↔non-eau)
 * sont déplacés le long de leur normale sortante par shoreNoise(worldXZ). Le
 * déplacement est purement fonction de la position monde (table `perim`), donc tout
 * sommet partagé reçoit le MÊME décalage où qu'il soit émis ⇒ pas de déchirure, et
 * la zone forme une seule courbe organique cohérente. Les sommets intérieurs ne
 * bougent pas → la nappe reste continue et plate.
 *
 * PROFIL DE RIVE VARIABLE (P1) : `aSteep` (= shoreSteepness) baked par sommet pilote
 * dans le shader la longueur du dégradé de profondeur et la largeur d'écume :
 * abrupt (0) = transition courte/foncée, doux (1) = longue/claire.
 *
 * CHAMP DE DISTANCE À LA RIVE : distance de chaque sommet au contour (segments de
 * skirt déplacés), légèrement domain-warpée → écume + profondeur ondulent.
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { HEX_SIZE, TILE_VISUAL, SECTOR_DEFS, EDGE_ORDER, WATER_RENDER, LOD_WATER_SHADER_DISTANCE } from './config.js';
import { axialToWorld, makeHexKey } from './hex.js';
import { createOuterVertices } from './hexGeometry.js';
import { getTileEdgeType, getTileCenterType } from './tileUtils.js';
import { HEX_DIRECTIONS, getOppositeEdge } from './placementRules.js';
import { getRealisticWaterMaterial, getFlatWaterMaterial } from './realisticWater.js';
import { shoreNoise, shoreSteepness } from './shoreField.js';

const WATER = 'water';

const OUTER_R = HEX_SIZE * TILE_VISUAL.radiusScale;
const INNER_R = HEX_SIZE * TILE_VISUAL.centerRadiusScale;
const OUTER = createOuterVertices(OUTER_R);
const INNER = createOuterVertices(INNER_R);
const DIR_BY_EDGE = Object.fromEntries(HEX_DIRECTIONS.map(d => [d.edge, d]));

const SHORE_AMP  = HEX_SIZE * 0.14;   // amplitude du déplacement organique du contour
const WARP_DIST  = 0.06;              // domain-warp du champ de distance (contours ondulés)

let _surfaceMaterial = null;
let _riverbedMaterial = null;
let _skirtMaterial = null;

function getSurfaceMaterial() {
  if (!_surfaceMaterial) {
    _surfaceMaterial = getRealisticWaterMaterial(WATER_RENDER.opacity);
    _surfaceMaterial.depthWrite = false;
  }
  return _surfaceMaterial;
}

function getRiverbedMaterial() {
  if (!_riverbedMaterial) {
    _riverbedMaterial = new THREE.MeshLambertMaterial({ color: WATER_RENDER.riverbedColor, side: THREE.DoubleSide });
    _riverbedMaterial.name = 'water-riverbed-material';
  }
  return _riverbedMaterial;
}

function getSkirtMaterial() {
  if (!_skirtMaterial) {
    _skirtMaterial = new THREE.MeshLambertMaterial({
      color: new THREE.Color(WATER_RENDER.riverbedColor).multiplyScalar(0.78),
      side: THREE.DoubleSide
    });
    _skirtMaterial.name = 'water-skirt-material';
  }
  return _skirtMaterial;
}

// ── API publique ───────────────────────────────────────────────────────────

export function createWaterSurfaceOverlay() {
  const group = new THREE.Group();
  group.name = 'water-surface-overlay';
  group.frustumCulled = false;
  return group;
}

export function rebuildWaterSurfaceOverlay(group, placedTiles) {
  for (let i = group.children.length - 1; i >= 0; i--) {
    const child = group.children[i];
    child.geometry?.dispose?.();
    group.remove(child);
  }
  group.userData.surfMesh = null;
  group.userData.waterLodRanges = null;

  // ── PASSE A : formes de tuiles + table de déplacement du contour ──────────
  const shapes = [];
  const perim = new Map();   // key "x,z" → { x, z, nx, nz, dx, dz }

  for (const pt of placedTiles.values()) {
    if (!_tileHasWater(pt)) continue;
    const shape = _collectTileShape(pt, placedTiles);
    const world = axialToWorld(pt.q, pt.r);
    shape.center = { x: world.x, z: world.z };
    shapes.push(shape);
    for (const b of shape.boundaries) {
      _accumPerim(perim, b.a.x, b.a.z, b.nx, b.nz);
      _accumPerim(perim, b.b.x, b.b.z, b.nx, b.nz);
    }
  }
  if (shapes.length === 0) return;

  for (const e of perim.values()) {
    const len = Math.hypot(e.nx, e.nz) || 1;
    const amp = shoreNoise(e.x, e.z) * SHORE_AMP;
    e.dx = (e.nx / len) * amp;
    e.dz = (e.nz / len) * amp;
  }
  const disp = (x, z) => {
    const e = perim.get(_key(x, z));
    return e ? [x + e.dx, z + e.dz] : [x, z];
  };

  // ── PASSE B : émission géométrie (contour déplacé) ────────────────────────
  const surfPos = [];
  const bedPos = [];
  const skirtPos = [];
  const shoreSegs = [];
  // Plage de sommets [start, count) par tuile dans surfPos, + centre monde de la
  // tuile → permet à updateWaterSurfaceLOD() de réassigner des groupes de matériau
  // (shader/plat) par tuile sans reconstruire les buffers de position.
  const lodRanges = [];

  for (const shape of shapes) {
    const vStart = surfPos.length / 3;
    for (const w of shape.wedges) _emitQuad(surfPos, bedPos, disp, w[0], w[1], w[2], w[3]);
    for (const t of shape.centerTris) _emitTri(surfPos, bedPos, disp, t[0], t[1], t[2]);
    for (const b of shape.boundaries) _emitSkirt(skirtPos, shoreSegs, disp, b.a, b.b);
    const vCount = surfPos.length / 3 - vStart;
    if (vCount > 0) lodRanges.push({ start: vStart, count: vCount, cx: shape.center.x, cz: shape.center.z });
  }

  // ── Champ de distance à la rive + profil (par sommet de surface) ──────────
  const nVerts = surfPos.length / 3;
  const distArr = new Float32Array(nVerts);
  const steepArr = new Float32Array(nVerts);
  const segCount = shoreSegs.length / 4;
  for (let v = 0; v < nVerts; v++) {
    const px = surfPos[v * 3];
    const pz = surfPos[v * 3 + 2];
    let best = 1e9;
    for (let s = 0; s < segCount; s++) {
      const d = _pointSegDist2(px, pz, shoreSegs[s * 4], shoreSegs[s * 4 + 1], shoreSegs[s * 4 + 2], shoreSegs[s * 4 + 3]);
      if (d < best) best = d;
    }
    let dist = segCount > 0 ? Math.sqrt(best) : 1.5;
    dist = Math.max(0, dist + shoreNoise(px * 1.3, pz * 1.3) * WARP_DIST); // contours ondulés
    distArr[v] = dist;
    steepArr[v] = shoreSteepness(px, pz);
  }

  // ── Surface (transparente, shader cute) ──────────────────────────────────
  // Deux matériaux : [0] shader complet (vagues/écume/reflets), [1] plat LOD
  // (simple surface bleue fixe). updateWaterSurfaceLOD() répartit les tuiles
  // entre les deux via geometry.groups, sans reconstruire les buffers.
  const surfGeo = new THREE.BufferGeometry();
  surfGeo.setAttribute('position', new THREE.Float32BufferAttribute(surfPos, 3));
  surfGeo.setAttribute('aShoreDist', new THREE.BufferAttribute(distArr, 1));
  surfGeo.setAttribute('aSteep', new THREE.BufferAttribute(steepArr, 1));
  surfGeo.addGroup(0, nVerts, 0);
  const surfMesh = new THREE.Mesh(surfGeo, [getSurfaceMaterial(), getFlatWaterMaterial(WATER_RENDER.opacity)]);
  surfMesh.name = 'hex-sector-water';
  surfMesh.renderOrder = 3;
  surfMesh.castShadow = false;
  surfMesh.receiveShadow = false;
  surfMesh.frustumCulled = false;
  surfMesh.userData.disableCastShadow = true;
  surfMesh.userData.shadowFlagsApplied = true;
  group.add(surfMesh);
  group.userData.surfMesh = surfMesh;
  group.userData.waterLodRanges = lodRanges;

  // ── Riverbed (fond opaque) ────────────────────────────────────────────────
  if (bedPos.length > 0) {
    const bedGeo = new THREE.BufferGeometry();
    bedGeo.setAttribute('position', new THREE.Float32BufferAttribute(bedPos, 3));
    bedGeo.computeVertexNormals();
    const bedMesh = new THREE.Mesh(bedGeo, getRiverbedMaterial());
    bedMesh.name = 'hex-center-water';
    bedMesh.receiveShadow = true;
    bedMesh.castShadow = false;
    bedMesh.frustumCulled = false;
    bedMesh.userData.disableCastShadow = true;
    bedMesh.userData.shadowFlagsApplied = true;
    group.add(bedMesh);
  }

  // ── Skirt (jupe de contour opaque) ────────────────────────────────────────
  if (skirtPos.length > 0) {
    const skirtGeo = new THREE.BufferGeometry();
    skirtGeo.setAttribute('position', new THREE.Float32BufferAttribute(skirtPos, 3));
    skirtGeo.computeVertexNormals();
    const skirtMesh = new THREE.Mesh(skirtGeo, getSkirtMaterial());
    skirtMesh.name = 'hex-sector-water';
    skirtMesh.receiveShadow = true;
    skirtMesh.castShadow = false;
    skirtMesh.frustumCulled = false;
    skirtMesh.userData.disableCastShadow = true;
    skirtMesh.userData.shadowFlagsApplied = true;
    group.add(skirtMesh);
  }
}

/**
 * LOD eau : au-delà de LOD_WATER_SHADER_DISTANCE (distance caméra→centre de tuile,
 * XZ), bascule les triangles de la nappe du matériau shader (coûteux : voronoï
 * d'écume ×2 par fragment, reflets, vagues) vers le matériau plat (simple bleu
 * fixe). Ne touche PAS aux buffers de position/attributs — seuls les groupes de
 * matériau de la géométrie sont réassignés (`geometry.groups`), donc coût CPU
 * minime (une boucle sur les tuiles d'eau, pas de re-upload GPU des sommets).
 *
 * Les tuiles d'eau adjacentes dans `lodRanges` (donc contiguës en mémoire) et
 * partageant le même bucket sont fusionnées en un seul groupe pour limiter le
 * nombre de draw calls.
 *
 * Appeler à cadence réduite (ex. 1 frame sur 9, comme les autres LOD) — inutile
 * de recalculer à 60 fps pour un effet qui ne change qu'au déplacement caméra.
 *
 * 2026-07-06 — lodFactor (cf. computeLodHeightFactor, decorOverlay.js) : contrairement à
 * TOUS les autres overlays (herbe/blé/props/maisons/trains…), cette fonction ignorait
 * jusqu'ici la hauteur caméra — le rayon shader complet restait fixe même au ras de l'eau,
 * là où le shader (foamTex = 2 voronoï 3×3/fragment, cf. shaderWater.js) coûte le plus et où
 * la nappe peut couvrir une grande partie de l'écran (vue rasante).
 *
 * @param {THREE.Group} group   — waterSurfaceOverlay (retourné par createWaterSurfaceOverlay)
 * @param {THREE.Camera} camera
 * @param {number} lodFactor    — cf. computeLodHeightFactor(camera), 1.0 = pas de réduction
 */
export function updateWaterSurfaceLOD(group, camera, lodFactor = 1.0) {
  const ranges = group?.userData?.waterLodRanges;
  const surfMesh = group?.userData?.surfMesh;
  if (!ranges || !surfMesh || ranges.length === 0) return;

  const effectiveDist = LOD_WATER_SHADER_DISTANCE * lodFactor;
  const maxDistSq = effectiveDist * effectiveDist;
  const camX = camera.position.x;
  const camZ = camera.position.z;
  const geo = surfMesh.geometry;

  geo.clearGroups();
  let groupStart = 0;
  let groupMat = -1;
  let groupEnd = 0;

  for (const r of ranges) {
    const dx = r.cx - camX;
    const dz = r.cz - camZ;
    const matIndex = (dx * dx + dz * dz) > maxDistSq ? 1 : 0;

    if (matIndex !== groupMat) {
      if (groupMat !== -1) geo.addGroup(groupStart, r.start - groupStart, groupMat);
      groupStart = r.start;
      groupMat = matIndex;
    }
    groupEnd = r.start + r.count;
  }
  if (groupMat !== -1) geo.addGroup(groupStart, groupEnd - groupStart, groupMat);
}

/**
 * Reconstruit la table de déplacement organique du rivage (mêmes calculs que
 * la PASSE A de rebuildWaterSurfaceOverlay), exposée pour que d'autres overlays
 * (plages, halos) puissent faire coïncider leurs propres sommets de contour
 * avec le rivage de la nappe d'eau. Clé "x,z" (mêmes arrondis que _key) →
 * même position monde ⇒ même déplacement, quel que soit l'appelant.
 *
 * @param {Map} placedTiles
 * @returns {Map<string,{x:number,z:number,nx:number,nz:number,dx:number,dz:number}>}
 */
export function buildShoreDisplacementMap(placedTiles) {
  const perim = new Map();

  for (const pt of placedTiles.values()) {
    if (!_tileHasWater(pt)) continue;
    const shape = _collectTileShape(pt, placedTiles);
    for (const b of shape.boundaries) {
      _accumPerim(perim, b.a.x, b.a.z, b.nx, b.nz);
      _accumPerim(perim, b.b.x, b.b.z, b.nx, b.nz);
    }
  }

  for (const e of perim.values()) {
    const len = Math.hypot(e.nx, e.nz) || 1;
    const amp = shoreNoise(e.x, e.z) * SHORE_AMP;
    e.dx = (e.nx / len) * amp;
    e.dz = (e.nz / len) * amp;
  }

  return perim;
}

/** Applique le déplacement organique d'un point (x,z) via la table ci-dessus. */
export function displaceShorePoint(shoreMap, x, z) {
  const e = shoreMap?.get(_key(x, z));
  return e ? [x + e.dx, z + e.dz] : [x, z];
}

// ── Forme d'une tuile : wedges + tris centre + arêtes de contour ────────────

function _collectTileShape(pt, placedTiles) {
  const world = axialToWorld(pt.q, pt.r);
  const wx = world.x, wz = world.z;
  const W = c => ({ x: wx + c.x, z: wz + c.z });

  const sectorWater = EDGE_ORDER.map(edge => getTileEdgeType(pt, edge) === WATER);
  const waterEdges = sectorWater.filter(Boolean).length;
  const centerIsWater = waterEdges >= 2 || getTileCenterType(pt) === WATER;

  const wedges = [];
  const centerTris = [];
  const boundaries = [];
  const pushB = (a, b) => {
    const mx = (a.x + b.x) * 0.5, mz = (a.z + b.z) * 0.5;
    boundaries.push({ a, b, nx: mx - wx, nz: mz - wz });   // normale sortante ≈ centre→arête
  };

  for (let i = 0; i < 6; i++) {
    if (!sectorWater[i]) continue;
    const a = SECTOR_DEFS[i].a, b = SECTOR_DEFS[i].b;
    const cIa = W(INNER[a]), cOa = W(OUTER[a]), cOb = W(OUTER[b]), cIb = W(INNER[b]);
    wedges.push([cIa, cOa, cOb, cIb]);

    const prevWater = sectorWater[(i + 5) % 6];
    const nextWater = sectorWater[(i + 1) % 6];
    const dir = DIR_BY_EDGE[EDGE_ORDER[i]];
    const nb = dir ? placedTiles.get(makeHexKey(pt.q + dir.q, pt.r + dir.r)) : null;
    const neighborWater = nb && getTileEdgeType(nb, getOppositeEdge(EDGE_ORDER[i])) === WATER;

    if (!prevWater)     pushB(cOa, cIa);
    if (!neighborWater) pushB(cOb, cOa);
    if (!nextWater)     pushB(cIb, cOb);
    if (!centerIsWater) pushB(cIa, cIb);
  }

  if (centerIsWater) {
    const c0 = { x: wx, z: wz };
    for (let i = 0; i < 6; i++) {
      const p0 = W(INNER[i]), p1 = W(INNER[(i + 1) % 6]);
      centerTris.push([c0, p0, p1]);
      if (!sectorWater[i]) pushB(p1, p0);
    }
  }

  return { wedges, centerTris, boundaries };
}

// ── Émission géométrie (avec déplacement de contour) ─────────────────────────

function _emitTri(surfPos, bedPos, disp, c0, c1, c2) {
  for (const c of [c0, c1, c2]) {
    const [x, z] = disp(c.x, c.z);
    surfPos.push(x, WATER_RENDER.surfaceY, z);
    bedPos.push(x, WATER_RENDER.riverbedY, z);
  }
}

function _emitQuad(surfPos, bedPos, disp, c0, c1, c2, c3) {
  _emitTri(surfPos, bedPos, disp, c0, c1, c2);
  _emitTri(surfPos, bedPos, disp, c0, c2, c3);
}

function _emitSkirt(skirtPos, shoreSegs, disp, c0, c1) {
  const yT = WATER_RENDER.surfaceY, yB = WATER_RENDER.riverbedY;
  const [ax, az] = disp(c0.x, c0.z);
  const [bx, bz] = disp(c1.x, c1.z);
  skirtPos.push(ax, yT, az, bx, yT, bz, bx, yB, bz, ax, yT, az, bx, yB, bz, ax, yB, az);
  shoreSegs.push(ax, az, bx, bz);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function _key(x, z) { return x.toFixed(3) + ',' + z.toFixed(3); }

function _accumPerim(perim, x, z, nx, nz) {
  const k = _key(x, z);
  const e = perim.get(k);
  if (e) { e.nx += nx; e.nz += nz; }
  else perim.set(k, { x, z, nx, nz, dx: 0, dz: 0 });
}

function _pointSegDist2(px, pz, x0, z0, x1, z1) {
  const dx = x1 - x0, dz = z1 - z0;
  const len2 = dx * dx + dz * dz;
  let t = len2 > 1e-9 ? ((px - x0) * dx + (pz - z0) * dz) / len2 : 0;
  t = t < 0 ? 0 : (t > 1 ? 1 : t);
  const cx = x0 + t * dx, cz = z0 + t * dz;
  const ex = px - cx, ez = pz - cz;
  return ex * ex + ez * ez;
}

function _tileHasWater(pt) {
  if (getTileCenterType(pt) === WATER) return true;
  for (const edge of EDGE_ORDER) if (getTileEdgeType(pt, edge) === WATER) return true;
  return false;
}
