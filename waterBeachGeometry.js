import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { EDGE_TYPES, EDGE_ORDER, HEX_SIZE, TILE_VISUAL, SECTOR_DEFS } from './config.js';
import { axialToWorld, makeHexKey } from './stable/hex.js';
import { HEX_DIRECTIONS, getOppositeEdge } from './stable/placementRules.js';
import { createOuterVertices } from './stable/hexGeometry.js';
import { makeNodeKey, getTileCenterType } from './stable/tileUtils.js';

// ─── Constantes plage ─────────────────────────────────────────────────────────
// REWRITE v2 : plage lowpoly monobloc — 2 rangs, 0 turbulence, 1 matériau.
// La polyline suit les arêtes droites de l'hexagone (pas de turbulence).
// Le profil est une simple marche inclinée : bord terre → bord eau.

const BEACH = {
  width:            HEX_SIZE * 0.130,  // largeur totale côté eau
  landLipY:         -0.065,            // Y côté terre : sous la surface du terrain pour être invisible sous blé/forêt
  waterLipY:        (TILE_VISUAL.waterY ?? -0.075) + 0.004, // Y côté eau
  landOffset:       -HEX_SIZE * 0.085, // retrait profond côté terre : la plage mord sous la texture terrain (couvre les trous)
  jointOverlap:     HEX_SIZE * 0.030,  // chevauchement aux extrémités libres
  vertexWeldEpsilon: 0.026
};

// Hash pseudo-aléatoire déterministe 0→1 (texture sable)
function _hash01(n) {
  let x = Math.sin(n + 1) * 43758.5453123;
  return x - Math.floor(x);
}

const CENTER_RADIUS = HEX_SIZE * TILE_VISUAL.centerRadiusScale;
const SECTOR_BY_KEY = Object.fromEntries(SECTOR_DEFS.map(sector => [sector.key, sector]));
const DIRECTION_BY_EDGE = Object.fromEntries(HEX_DIRECTIONS.map(direction => [direction.edge, direction]));

let beachMaterial = null;

// ─── API publique ─────────────────────────────────────────────────────────────

export function createWaterBeachMesh(zone, placedTiles) {
  const group = new THREE.Group();
  group.name = 'water-zone-sand-beach';
  const beachPolylines = [];
  const beachGeometries = [];

  const sectorKeys = new Set(zone.sectors.map(sectorRef => makeNodeKey(sectorRef.tile.key, sectorRef.edge)));
  const centerKeys = new Set();

  for (const sectorRef of zone.sectors) {
    if (getTileCenterType(sectorRef.tile) === EDGE_TYPES.water) centerKeys.add(sectorRef.tile.key);
  }

  const zoneWaterCenter = getZoneWaterCenter(zone);

  for (const sectorRef of zone.sectors) {
    addSectorBeachPolylines(beachPolylines, sectorRef, sectorKeys, centerKeys, placedTiles);
  }

  for (const tileKey of centerKeys) {
    const placedTile = placedTiles.get(tileKey);
    if (placedTile) addCenterBeachPolylines(beachPolylines, placedTile, sectorKeys);
  }

  // Une plage continue ne se fabrique pas avec des rustines rondes de bunker.
  // On soude d'abord les segments qui partagent une extrémité, puis on génère
  // le mesh sur les chaînes obtenues. Les angles deviennent alors des vrais
  // coudes de plage continus, sans pâté ajouté par-dessus.
  const stitchedPolylines = annotateBeachPolylineCaps(stitchBeachPolylines(beachPolylines));
  for (const polyline of stitchedPolylines) {
    const geometry = createBeachStripGeometryFromWorldPolyline(polyline, zoneWaterCenter);
    if (geometry) beachGeometries.push(geometry);
  }

  const mergedGeometry = mergeBeachGeometries(beachGeometries);
  if (!mergedGeometry) return group;

  const mesh = new THREE.Mesh(mergedGeometry, getBeachMaterial());
  mesh.name = 'continuous-sand-beach-step';
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.userData.disableCastShadow = true;
  // La plage doit suivre la courbure GPU comme le terrain et l'eau.
  // Ne surtout pas la marquer en no-curvature : sinon, si on bascule en mode
  // bouliste après génération, elle reste plate et flotte au-dessus de la mer.
  group.add(mesh);

  return group;
}

// ─── Construction des polylines de plage ─────────────────────────────────────

function addSectorBeachPolylines(beachPolylines, sectorRef, sectorKeys, centerKeys, placedTiles) {
  const { tile: placedTile, edge } = sectorRef;
  const sector = SECTOR_BY_KEY[edge];
  const outerVertices = createOuterVertices(HEX_SIZE * TILE_VISUAL.radiusScale);
  const innerVertices = createOuterVertices(CENTER_RADIUS);
  const world = axialToWorld(placedTile.q, placedTile.r);
  const edgeIndex = EDGE_ORDER.indexOf(edge);
  const previousEdge = EDGE_ORDER[(edgeIndex + EDGE_ORDER.length - 1) % EDGE_ORDER.length];
  const nextEdge = EDGE_ORDER[(edgeIndex + 1) % EDGE_ORDER.length];
  const waterCenter = getWaterSectorLocalCentroid(sector, outerVertices, innerVertices);

  const direction = DIRECTION_BY_EDGE[edge];
  const neighborTile = direction
    ? placedTiles.get(makeHexKey(placedTile.q + direction.q, placedTile.r + direction.r))
    : null;
  const oppositeEdge = getOppositeEdge(edge);
  const hasOuterWaterNeighbor = neighborTile && sectorKeys.has(makeNodeKey(neighborTile.key, oppositeEdge));

  // Arête extérieure (entre deux sommets hex) — droite, sans turbulence
  if (!hasOuterWaterNeighbor && neighborTile) {
    addBeachPolylineFromLocalPolyline(
      beachPolylines, world,
      createStraightBeachEdge(outerVertices[sector.a], outerVertices[sector.b], 1),
      waterCenter
    );
  }

  // Arêtes latérales (bords du secteur) — droites, sans turbulence
  if (!sectorKeys.has(makeNodeKey(placedTile.key, previousEdge))) {
    addBeachPolylineFromLocalPolyline(
      beachPolylines, world,
      createStraightBeachEdge(innerVertices[sector.a], outerVertices[sector.a], 1),
      waterCenter
    );
  }

  if (!sectorKeys.has(makeNodeKey(placedTile.key, nextEdge))) {
    addBeachPolylineFromLocalPolyline(
      beachPolylines, world,
      createStraightBeachEdge(outerVertices[sector.b], innerVertices[sector.b], 1),
      waterCenter
    );
  }

  // Arête intérieure (côté centre de tuile) — droite
  if (!centerKeys.has(placedTile.key)) {
    addBeachPolylineFromLocalPolyline(
      beachPolylines, world,
      createStraightBeachEdge(innerVertices[sector.b], innerVertices[sector.a], 1),
      waterCenter
    );
  }
}

function addCenterBeachPolylines(beachPolylines, placedTile, sectorKeys) {
  const world = axialToWorld(placedTile.q, placedTile.r);
  const innerVertices = createOuterVertices(CENTER_RADIUS);
  const waterCenter = { x: 0, z: 0 };

  for (const edge of EDGE_ORDER) {
    if (sectorKeys.has(makeNodeKey(placedTile.key, edge))) continue;
    const sector = SECTOR_BY_KEY[edge];
    addBeachPolylineFromLocalPolyline(
      beachPolylines,
      world,
      createStraightBeachEdge(innerVertices[sector.a], innerVertices[sector.b], 1),
      waterCenter
    );
  }
}

function addBeachPolylineFromLocalPolyline(beachPolylines, world, localPolyline, localWaterCenter) {
  if (!localPolyline || localPolyline.length < 2) return;

  const worldPolyline = localPolyline.map(point => ({
    x: world.x + point.x,
    z: world.z + point.z
  }));

  // Le chevauchement est appliqué après soudure, uniquement aux vrais bouts
  // libres. Sinon chaque angle fabrique deux lèvres qui se croisent, le fameux
  // effet pâté infâme pointé à la flèche rouge.
  beachPolylines.push(worldPolyline);
}

function getZoneWaterCenter(zone) {
  let x = 0;
  let z = 0;
  let count = 0;

  for (const sectorRef of zone.sectors) {
    const outerVertices = createOuterVertices(HEX_SIZE * TILE_VISUAL.radiusScale);
    const innerVertices = createOuterVertices(CENTER_RADIUS);
    const sector = SECTOR_BY_KEY[sectorRef.edge];
    if (!sector) continue;

    const world = axialToWorld(sectorRef.tile.q, sectorRef.tile.r);
    const center = getWaterSectorLocalCentroid(sector, outerVertices, innerVertices);
    x += world.x + center.x;
    z += world.z + center.z;
    count++;
  }

  if (count <= 0) return { x: 0, z: 0 };
  return { x: x / count, z: z / count };
}

// ─── Soudure et lissage des polylines ────────────────────────────────────────

function stitchBeachPolylines(polylines) {
  const chains = polylines
    .filter(polyline => polyline && polyline.length >= 2)
    .map(polyline => polyline.map(point => ({ x: point.x, z: point.z })));

  const snapDistance = Math.max(BEACH.vertexWeldEpsilon * 5.0, HEX_SIZE * 0.055);
  let changed = true;

  while (changed) {
    changed = false;

    outer:
    for (let i = 0; i < chains.length; i++) {
      for (let j = i + 1; j < chains.length; j++) {
        const merged = tryMergeBeachChains(chains[i], chains[j], snapDistance);
        if (!merged) continue;

        chains[i] = cleanBeachPolyline(merged);
        chains.splice(j, 1);
        changed = true;
        break outer;
      }
    }
  }

  return chains
    .map(chain => closeOrExtendBeachChain(cleanBeachPolyline(chain), snapDistance))
    .filter(chain => chain.length >= 2);
}

function tryMergeBeachChains(a, b, maxDistance) {
  const aFirst = a[0];
  const aLast = a[a.length - 1];
  const bFirst = b[0];
  const bLast = b[b.length - 1];

  if (pointDistance(aLast, bFirst) <= maxDistance) return mergeBeachChainEnds(a, b);
  if (pointDistance(aLast, bLast) <= maxDistance) return mergeBeachChainEnds(a, b.slice().reverse());
  if (pointDistance(aFirst, bLast) <= maxDistance) return mergeBeachChainEnds(b, a);
  if (pointDistance(aFirst, bFirst) <= maxDistance) return mergeBeachChainEnds(b.slice().reverse(), a);

  return null;
}

function mergeBeachChainEnds(left, right) {
  const merged = left.slice();
  const jointA = merged[merged.length - 1];
  const jointB = right[0];
  const joint = {
    x: (jointA.x + jointB.x) * 0.5,
    z: (jointA.z + jointB.z) * 0.5
  };

  merged[merged.length - 1] = joint;
  for (let i = 1; i < right.length; i++) merged.push({ x: right[i].x, z: right[i].z });
  return merged;
}

function closeOrExtendBeachChain(chain, snapDistance) {
  if (chain.length < 2) return chain;

  const first = chain[0];
  const last = chain[chain.length - 1];
  if (pointDistance(first, last) <= snapDistance) {
    const joint = { x: (first.x + last.x) * 0.5, z: (first.z + last.z) * 0.5 };
    chain[0] = joint;
    chain[chain.length - 1] = { ...joint };
    chain.isClosedBeachChain = true;
    return chain;
  }

  return extendBeachWorldPolylineForJointOverlap(chain);
}

function extendBeachWorldPolylineForJointOverlap(points) {
  if (!points || points.length < 2) return points;

  const extended = points.map(point => ({ x: point.x, z: point.z }));
  const firstTangent = getPolylineTangent(points, 0);
  const lastTangent = getPolylineTangent(points, points.length - 1);

  extended[0] = {
    x: extended[0].x - firstTangent.x * BEACH.jointOverlap,
    z: extended[0].z - firstTangent.z * BEACH.jointOverlap
  };

  const last = extended.length - 1;
  extended[last] = {
    x: extended[last].x + lastTangent.x * BEACH.jointOverlap,
    z: extended[last].z + lastTangent.z * BEACH.jointOverlap
  };

  return extended;
}

function cleanBeachPolyline(points) {
  const cleaned = [];
  const minDistance = Math.max(BEACH.vertexWeldEpsilon * 0.9, 0.006);

  for (const point of points) {
    const previous = cleaned[cleaned.length - 1];
    if (previous && pointDistance(previous, point) <= minDistance) continue;
    cleaned.push({ x: point.x, z: point.z });
  }

  return smoothBeachCornerPolyline(cleaned);
}

function smoothBeachCornerPolyline(points) {
  if (points.length < 3) return points;

  const result = [points[0]];
  const cornerCut = Math.min(HEX_SIZE * 0.046, BEACH.width * 0.34);

  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const current = points[i];
    const next = points[i + 1];
    const lenA = pointDistance(prev, current);
    const lenB = pointDistance(current, next);
    const cut = Math.min(cornerCut, lenA * 0.42, lenB * 0.42);

    if (cut <= 0.001) {
      result.push(current);
      continue;
    }

    const ta = { x: (prev.x - current.x) / lenA, z: (prev.z - current.z) / lenA };
    const tb = { x: (next.x - current.x) / lenB, z: (next.z - current.z) / lenB };
    const entry = { x: current.x + ta.x * cut, z: current.z + ta.z * cut };
    const exit = { x: current.x + tb.x * cut, z: current.z + tb.z * cut };

    // Ne pas repasser par le sommet exact : c'est lui qui crée les petites
    // pointes sombres et cassures aux angles. On arrondit le coude par deux
    // points intermédiaires sur une courbe quadratique, sans rustine ajoutée.
    result.push(entry);
    result.push(quadraticBezierPoint(entry, current, exit, 0.38));
    result.push(quadraticBezierPoint(entry, current, exit, 0.72));
    result.push(exit);
  }

  result.push(points[points.length - 1]);
  return result;
}

function quadraticBezierPoint(a, control, b, t) {
  const inv = 1 - t;
  return {
    x: inv * inv * a.x + 2 * inv * t * control.x + t * t * b.x,
    z: inv * inv * a.z + 2 * inv * t * control.z + t * t * b.z
  };
}

function annotateBeachPolylineCaps(polylines) {
  const capJoinDistance = Math.max(BEACH.vertexWeldEpsilon * 5.5, HEX_SIZE * 0.060);

  for (let i = 0; i < polylines.length; i++) {
    const chain = polylines[i];
    if (!chain || chain.length < 2 || chain.isClosedBeachChain) continue;

    chain.skipStartCap = isEndpointNearAnotherBeachChain(chain[0], polylines, i, capJoinDistance);
    chain.skipEndCap = isEndpointNearAnotherBeachChain(chain[chain.length - 1], polylines, i, capJoinDistance);
  }

  return polylines;
}

function isEndpointNearAnotherBeachChain(endpoint, polylines, ownIndex, maxDistance) {
  for (let i = 0; i < polylines.length; i++) {
    if (i === ownIndex) continue;
    const chain = polylines[i];
    if (!chain || chain.length < 2) continue;

    if (pointDistance(endpoint, chain[0]) <= maxDistance) return true;
    if (pointDistance(endpoint, chain[chain.length - 1]) <= maxDistance) return true;
  }

  return false;
}

function pointDistance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

// ─── Géométrie mesh de la plage ───────────────────────────────────────────────

// Fusionne toutes les géométries de bande en un mesh unique — matériau unique.
function mergeBeachGeometries(geometries) {
  if (!geometries.length) return null;

  const positions = [];
  const uvs = [];
  const indices = [];
  let indexOffset = 0;

  for (const geometry of geometries) {
    const pos = geometry.getAttribute('position');
    const uv  = geometry.getAttribute('uv');
    const idx = geometry.getIndex();
    if (!pos || !idx) continue;

    for (let i = 0; i < pos.count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      uvs.push(uv.getX(i), uv.getY(i));
    }
    for (let i = 0; i < idx.count; i++) {
      indices.push(idx.getX(i) + indexOffset);
    }
    indexOffset += pos.count;
  }

  if (!positions.length) return null;

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  merged.setAttribute('uv',       new THREE.BufferAttribute(new Float32Array(uvs),       2));
  merged.setIndex(indices);
  merged.computeVertexNormals();
  return merged;
}

// REWRITE v2 : bande lowpoly 2 rangs — côté terre (rang 0) + côté eau (rang 1).
// Chaque segment de la polyline → 1 quad = 2 triangles.
// Aucun cap, aucune face ventrale, matériau unique.
function createBeachStripGeometryFromWorldPolyline(worldPolyline, worldWaterCenter) {
  if (!worldPolyline || worldPolyline.length < 2) return null;

  const positions = [];
  const uvs = [];
  const indices = [];

  const cumulative = [0];
  for (let i = 1; i < worldPolyline.length; i++) {
    const a = worldPolyline[i - 1], b = worldPolyline[i];
    cumulative.push(cumulative[i - 1] + Math.hypot(b.x - a.x, b.z - a.z));
  }
  const totalLength = Math.max(cumulative[cumulative.length - 1], 0.001);

  for (let i = 0; i < worldPolyline.length; i++) {
    const point = worldPolyline[i];
    const tangent = getPolylineTangent(worldPolyline, i);
    // La normale pointe vers l'eau (vérifiée par produit scalaire)
    let normal = { x: -tangent.z, z: tangent.x };
    const toWater = { x: worldWaterCenter.x - point.x, z: worldWaterCenter.z - point.z };
    if ((normal.x * toWater.x + normal.z * toWater.z) < 0) normal = { x: -normal.x, z: -normal.z };

    const u = cumulative[i] / totalLength;

    // Rang 0 : lèvre côté terre (légèrement sous la texture terrain)
    positions.push(
      point.x + normal.x * BEACH.landOffset, BEACH.landLipY,
      point.z + normal.z * BEACH.landOffset
    );
    uvs.push(u, 0);

    // Rang 1 : lèvre côté eau
    positions.push(
      point.x + normal.x * BEACH.width, BEACH.waterLipY,
      point.z + normal.z * BEACH.width
    );
    uvs.push(u, 1);
  }

  // Quad strip : 2 tris par segment (DoubleSide → pas besoin de faces inverses)
  for (let i = 0; i < worldPolyline.length - 1; i++) {
    const a0 = i * 2,       a1 = i * 2 + 1;
    const b0 = (i + 1) * 2, b1 = (i + 1) * 2 + 1;
    indices.push(a0, b0, b1, a0, b1, a1);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('uv',       new THREE.BufferAttribute(new Float32Array(uvs),       2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// ─── Utilitaires géométrie plage ─────────────────────────────────────────────

function getWaterSectorLocalCentroid(sector, outerVertices, innerVertices) {
  const a = outerVertices[sector.a];
  const b = outerVertices[sector.b];
  const ia = innerVertices[sector.a];
  const ib = innerVertices[sector.b];
  return {
    x: (a.x + b.x + ia.x + ib.x) / 4,
    z: (a.z + b.z + ia.z + ib.z) / 4
  };
}

function getPolylineTangent(points, index) {
  const previous = points[Math.max(0, index - 1)];
  const next = points[Math.min(points.length - 1, index + 1)];
  const dx = next.x - previous.x;
  const dz = next.z - previous.z;
  const length = Math.hypot(dx, dz) || 1;
  return { x: dx / length, z: dz / length };
}


function createStraightBeachEdge(a, b, segments) {
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    points.push({ x: THREE.MathUtils.lerp(a.x, b.x, t), z: THREE.MathUtils.lerp(a.z, b.z, t) });
  }
  return points;
}

// ─── Matériaux plage ──────────────────────────────────────────────────────────

function getBeachMaterial() {
  if (beachMaterial) return beachMaterial;
  const texture = createSandTexture();
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2.8, 1.2);
  beachMaterial = new THREE.MeshStandardMaterial({
    name: 'dorfromantik-sand-beach-material',
    map: texture,
    color: 0xd2b87a,
    roughness: 0.96,
    metalness: 0.0,
    side: THREE.DoubleSide   // DoubleSide = pas besoin de face ventrale
  });
  return beachMaterial;
}

function createSandTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#cdb987';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < 1400; i++) {
    const warm = 178 + Math.floor(_hash01(i * 911 + 17) * 48);
    const green = 151 + Math.floor(_hash01(i * 577 + 41) * 42);
    const blue = 102 + Math.floor(_hash01(i * 313 + 9) * 34);
    const alpha = 0.10 + _hash01(i * 389 + 5) * 0.22;
    const radius = 0.28 + _hash01(i * 271 + 3) * 0.85;
    const x = _hash01(i * 421 + 11) * canvas.width;
    const y = _hash01(i * 719 + 13) * canvas.height;
    ctx.fillStyle = `rgba(${warm}, ${green}, ${blue}, ${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = 0; i < 32; i++) {
    const y = _hash01(i * 823 + 19) * canvas.height;
    ctx.strokeStyle = `rgba(255, 239, 190, ${0.035 + _hash01(i * 337 + 23) * 0.045})`;
    ctx.lineWidth = 0.6 + _hash01(i * 643 + 29) * 1.1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= canvas.width; x += 8) {
      ctx.lineTo(x, y + Math.sin((x * 0.075) + i) * (1.2 + _hash01(i * 97 + x) * 1.8));
    }
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}
