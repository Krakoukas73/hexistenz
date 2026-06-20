import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { EDGE_TYPES, EDGE_ORDER, HEX_SIZE, TILE_VISUAL, SECTOR_DEFS } from './config.js';
import { axialToWorld, makeHexKey } from './stable/hex.js';
import { HEX_DIRECTIONS, getOppositeEdge } from './stable/placementRules.js';
import { createOuterVertices } from './stable/hexGeometry.js';
import { makeNodeKey, getTileCenterType } from './stable/tileUtils.js';
import { hashRaggedInnerEdge, hashRaggedEdge, hash01 } from './stable/raggedEdge.js';

// ─── Constantes plage ─────────────────────────────────────────────────────────

const BEACH = {
  // Plage volumique créée seulement pour les zones d'eau en contact avec
  // une texture terrestre. Elle reprend les mêmes points turbulents que les
  // tuiles : pas de segments droits entre deux sommets de l'hexagone.
  width: HEX_SIZE * 0.130,
  segmentsAlongOuterEdge: 16,
  segmentsAlongInnerEdge: 12,
  raggedOuterAmplitude: 0.090,
  raggedInnerAmplitude: 0.044,
  // Niveaux abaissés : la plage doit rester une berge, pas un barrage débile
  // construit par des castors alcooliques.
  landLipY: -0.035,
  crownY: -0.010,
  waterLipY: (TILE_VISUAL.waterY ?? -0.075) + 0.004,
  bottomY: (TILE_VISUAL.waterY ?? -0.075) - 0.070,
  seaFloorWidth: HEX_SIZE * 0.070,
  // Les bandes sont générées par tronçons, donc on les fait se chevaucher un
  // peu aux extrémités pour combler les trous dans les angles et jonctions.
  // Chevauchement réduit : il bouche les micro-fentes sans créer de doubles
  // couches visibles aux angles. Le reste est fusionné dans un mesh unique.
  // Continuité par soudure/chevauchement discret uniquement : pas de rustines
  // circulaires aux angles, elles créaient des pâtés façon bunker de plage.
  jointOverlap: HEX_SIZE * 0.070,
  vertexWeldEpsilon: 0.026
};

const CENTER_RADIUS = HEX_SIZE * TILE_VISUAL.centerRadiusScale;
const SECTOR_BY_KEY = Object.fromEntries(SECTOR_DEFS.map(sector => [sector.key, sector]));
const DIRECTION_BY_EDGE = Object.fromEntries(HEX_DIRECTIONS.map(direction => [direction.edge, direction]));

let beachMaterial = null;
let beachSideMaterial = null;

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

  const mesh = new THREE.Mesh(mergedGeometry, [getBeachMaterial(), getBeachSideMaterial()]);
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
  if (!hasOuterWaterNeighbor && neighborTile) {
    addBeachPolylineFromLocalPolyline(
      beachPolylines,
      world,
      createRaggedOuterBeachEdge(outerVertices[sector.a], outerVertices[sector.b], EDGE_TYPES.water),
      waterCenter
    );
  }

  if (!sectorKeys.has(makeNodeKey(placedTile.key, previousEdge))) {
    addBeachPolylineFromLocalPolyline(
      beachPolylines,
      world,
      createRaggedInnerBeachEdge(innerVertices[sector.a], outerVertices[sector.a], sector.a),
      waterCenter
    );
  }

  if (!sectorKeys.has(makeNodeKey(placedTile.key, nextEdge))) {
    addBeachPolylineFromLocalPolyline(
      beachPolylines,
      world,
      createRaggedInnerBeachEdge(innerVertices[sector.b], outerVertices[sector.b], sector.b).reverse(),
      waterCenter
    );
  }

  if (!centerKeys.has(placedTile.key)) {
    addBeachPolylineFromLocalPolyline(
      beachPolylines,
      world,
      createStraightBeachEdge(innerVertices[sector.b], innerVertices[sector.a], BEACH.segmentsAlongInnerEdge),
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
      createStraightBeachEdge(innerVertices[sector.a], innerVertices[sector.b], BEACH.segmentsAlongInnerEdge),
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

function mergeBeachGeometries(geometries) {
  if (!geometries.length) return null;

  const positions = [];
  const uvs = [];
  const topIndices = [];
  const sideIndices = [];
  const vertexMap = new Map();

  const addVertex = (x, y, z, u, v) => {
    const key = `${Math.round(x / BEACH.vertexWeldEpsilon)}:${Math.round(y / BEACH.vertexWeldEpsilon)}:${Math.round(z / BEACH.vertexWeldEpsilon)}`;
    const existing = vertexMap.get(key);
    if (existing !== undefined) return existing;

    const index = positions.length / 3;
    vertexMap.set(key, index);
    positions.push(x, y, z);
    uvs.push(u, v);
    return index;
  };

  for (const geometry of geometries) {
    const sourcePositions = geometry.getAttribute('position');
    const sourceUvs = geometry.getAttribute('uv');
    const sourceIndex = geometry.getIndex();
    const remap = [];

    for (let i = 0; i < sourcePositions.count; i++) {
      remap[i] = addVertex(
        sourcePositions.getX(i),
        sourcePositions.getY(i),
        sourcePositions.getZ(i),
        sourceUvs.getX(i),
        sourceUvs.getY(i)
      );
    }

    for (const group of geometry.groups) {
      const target = group.materialIndex === 0 ? topIndices : sideIndices;
      for (let i = group.start; i < group.start + group.count; i++) {
        target.push(remap[sourceIndex.getX(i)]);
      }
    }
  }

  const indices = topIndices.concat(sideIndices);
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  merged.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
  merged.setIndex(indices);
  merged.clearGroups();
  merged.addGroup(0, topIndices.length, 0);
  merged.addGroup(topIndices.length, sideIndices.length, 1);
  merged.computeVertexNormals();
  return merged;
}

function createBeachStripGeometryFromWorldPolyline(worldPolyline, worldWaterCenter) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const profile = createSmoothBeachProfile();
  const rowCount = profile.length;
  const cumulative = [0];

  for (let i = 1; i < worldPolyline.length; i++) {
    const a = worldPolyline[i - 1];
    const b = worldPolyline[i];
    cumulative.push(cumulative[i - 1] + Math.hypot(b.x - a.x, b.z - a.z));
  }

  const totalLength = Math.max(cumulative[cumulative.length - 1], 0.001);

  for (let i = 0; i < worldPolyline.length; i++) {
    const point = worldPolyline[i];
    const tangent = getPolylineTangent(worldPolyline, i);
    let normal = { x: -tangent.z, z: tangent.x };
    const toWater = { x: worldWaterCenter.x - point.x, z: worldWaterCenter.z - point.z };
    if ((normal.x * toWater.x + normal.z * toWater.z) < 0) {
      normal = { x: -normal.x, z: -normal.z };
    }

    const alongU = cumulative[i] / totalLength;

    for (const sample of profile) {
      const x = point.x + normal.x * sample.offset;
      const z = point.z + normal.z * sample.offset;
      const y = sample.y;
      positions.push(x, y, z);
      uvs.push(alongU * 3.4, sample.v);
    }
  }

  for (let i = 0; i < worldPolyline.length - 1; i++) {
    const base = i * rowCount;
    const next = (i + 1) * rowCount;
    for (let j = 0; j < rowCount - 1; j++) {
      indices.push(base + j, next + j, next + j + 1);
      indices.push(base + j, next + j + 1, base + j + 1);
    }
  }

  const topIndexCount = indices.length;

  // Petite tranche sous la pente : donne la lecture "marche d'escalier" au lieu
  // d'un simple tapis plat sans volume. Invisible de haut, utile en caméra basse.
  const topVertexCount = positions.length / 3;
  for (let i = 0; i < topVertexCount; i++) {
    positions.push(positions[i * 3], BEACH.bottomY, positions[i * 3 + 2]);
    uvs.push(uvs[i * 2], uvs[i * 2 + 1]);
  }

  for (let i = 0; i < worldPolyline.length - 1; i++) {
    const base = i * rowCount;
    const next = (i + 1) * rowCount;

    // On ferme uniquement le flanc côté terre. Côté mer, le profil se prolonge
    // maintenant en fond marin incliné : plus de face verticale abrupte façon
    // marche d'escalier de piscine municipale soviétique.
    const j = 0;
    const a = base + j;
    const b = next + j;
    const c = topVertexCount + next + j;
    const d = topVertexCount + base + j;
    indices.push(a, b, c);
    indices.push(a, c, d);
  }

  // Les caps ne sont gardés que sur les vrais bouts libres. Les jonctions déjà
  // soudées en chaîne continue ne reçoivent plus de faces de fermeture internes,
  // donc plus de cassure/pâté à l'angle.
  if (!worldPolyline.isClosedBeachChain) {
    if (!worldPolyline.skipStartCap) addBeachEndCapIndices(indices, 0, rowCount, topVertexCount);
    if (!worldPolyline.skipEndCap) addBeachEndCapIndices(indices, worldPolyline.length - 1, rowCount, topVertexCount);
  }

  // Sous-face discrète : sécurité caméra basse. Sans ça, certains angles en
  // bord de vide peuvent encore montrer l'intérieur du mesh, ce qui fait cheap
  // comme un décor de cinéma fauché.
  for (let i = 0; i < worldPolyline.length - 1; i++) {
    const base = topVertexCount + i * rowCount;
    const next = topVertexCount + (i + 1) * rowCount;
    for (let j = 0; j < rowCount - 1; j++) {
      indices.push(base + j, next + j + 1, next + j);
      indices.push(base + j, base + j + 1, next + j + 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
  geometry.setIndex(indices);
  geometry.clearGroups();
  geometry.addGroup(0, topIndexCount, 0);
  geometry.addGroup(topIndexCount, indices.length - topIndexCount, 1);
  geometry.computeVertexNormals();
  return geometry;
}

function addBeachEndCapIndices(indices, pointIndex, rowCount, bottomOffset) {
  const base = pointIndex * rowCount;
  for (let j = 0; j < rowCount - 1; j++) {
    const topA = base + j;
    const topB = base + j + 1;
    const bottomA = bottomOffset + topA;
    const bottomB = bottomOffset + topB;
    indices.push(topA, bottomA, bottomB);
    indices.push(topA, bottomB, topB);
  }
}

function createSmoothBeachProfile() {
  const samples = [];
  const beachSteps = 7;
  const seaSteps = 4;

  for (let i = 0; i < beachSteps; i++) {
    const t = i / (beachSteps - 1);
    const eased = smoothstep(t);

    // Petite lèvre côté terre, puis pente douce jusqu'au ras de l'eau. Le
    // premier point mord un peu sous la texture voisine pour masquer les
    // micro-vides sans remonter la plage en barrage.
    const offset = mix(-BEACH.width * 0.18, BEACH.width * 0.96, eased);
    const terrace = Math.sin(Math.PI * t) * 0.006;
    const y = mix(BEACH.landLipY, BEACH.waterLipY, eased) + terrace;
    samples.push({ offset, y, v: t * 0.74 });
  }

  const lastBeach = samples[samples.length - 1];
  for (let i = 1; i <= seaSteps; i++) {
    const t = i / seaSteps;
    const eased = smoothstep(t);

    // Fond marin progressif : on prolonge la plage SOUS l'eau au lieu de
    // terminer par une face verticale. Ça supprime l'effet palier/marche côté
    // mer tout en gardant la pente et la largeur validées côté terre.
    samples.push({
      offset: lastBeach.offset + BEACH.seaFloorWidth * eased,
      y: mix(BEACH.waterLipY, BEACH.bottomY, eased),
      v: mix(0.74, 1.0, eased)
    });
  }

  return samples;
}

// ─── Utilitaires géométrie plage ─────────────────────────────────────────────

function smoothstep(t) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

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

function createRaggedOuterBeachEdge(a, b, type) {
  const points = [];
  const seed = hashRaggedEdge(a, b, type);

  for (let i = 0; i <= BEACH.segmentsAlongOuterEdge; i++) {
    const t = i / BEACH.segmentsAlongOuterEdge;
    const x = THREE.MathUtils.lerp(a.x, b.x, t);
    const z = THREE.MathUtils.lerp(a.z, b.z, t);
    const endFade = Math.sin(Math.PI * t);
    const broadWave = 0.55 + 0.45 * Math.sin((Math.PI * t * 2) + hash01(seed + 17) * Math.PI * 2);
    const localChaos = 0.65 + 0.35 * hash01(seed + i * 97);
    const bite = BEACH.raggedOuterAmplitude * endFade * (0.55 + broadWave * localChaos);
    const length = Math.hypot(x, z) || 1;
    points.push({ x: x + (x / length) * bite, z: z + (z / length) * bite });
  }

  return points;
}

function createRaggedInnerBeachEdge(innerPoint, outerPoint, vertexIndex) {
  const points = [];
  const seed = hashRaggedInnerEdge(vertexIndex);
  const dx = outerPoint.x - innerPoint.x;
  const dz = outerPoint.z - innerPoint.z;
  const length = Math.hypot(dx, dz) || 1;
  const normal = { x: -dz / length, z: dx / length };

  for (let i = 0; i <= BEACH.segmentsAlongInnerEdge; i++) {
    const t = i / BEACH.segmentsAlongInnerEdge;
    const x = THREE.MathUtils.lerp(innerPoint.x, outerPoint.x, t);
    const z = THREE.MathUtils.lerp(innerPoint.z, outerPoint.z, t);
    const endFade = Math.sin(Math.PI * t);
    const wave = Math.sin((Math.PI * t * 3) + hash01(seed + 23) * Math.PI * 2);
    const localChaos = (hash01(seed + i * 131) - 0.5) * 2;
    const bite = BEACH.raggedInnerAmplitude * endFade * ((wave * 0.65) + (localChaos * 0.35));
    points.push({ x: x + normal.x * bite, z: z + normal.z * bite });
  }

  return points;
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
    color: 0xd6c08f,
    roughness: 0.96,
    metalness: 0.0,
    side: THREE.DoubleSide
  });
  return beachMaterial;
}

function getBeachSideMaterial() {
  if (beachSideMaterial) return beachSideMaterial;
  const texture = createSandTexture();
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1.8, 0.9);
  beachSideMaterial = new THREE.MeshStandardMaterial({
    name: 'dorfromantik-sand-beach-side-material',
    map: texture,
    color: 0xb9975e,
    roughness: 1.0,
    metalness: 0.0,
    side: THREE.DoubleSide
  });
  return beachSideMaterial;
}

function createSandTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#cdb987';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < 1400; i++) {
    const warm = 178 + Math.floor(hash01(i * 911 + 17) * 48);
    const green = 151 + Math.floor(hash01(i * 577 + 41) * 42);
    const blue = 102 + Math.floor(hash01(i * 313 + 9) * 34);
    const alpha = 0.10 + hash01(i * 389 + 5) * 0.22;
    const radius = 0.28 + hash01(i * 271 + 3) * 0.85;
    const x = hash01(i * 421 + 11) * canvas.width;
    const y = hash01(i * 719 + 13) * canvas.height;
    ctx.fillStyle = `rgba(${warm}, ${green}, ${blue}, ${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = 0; i < 32; i++) {
    const y = hash01(i * 823 + 19) * canvas.height;
    ctx.strokeStyle = `rgba(255, 239, 190, ${0.035 + hash01(i * 337 + 23) * 0.045})`;
    ctx.lineWidth = 0.6 + hash01(i * 643 + 29) * 1.1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= canvas.width; x += 8) {
      ctx.lineTo(x, y + Math.sin((x * 0.075) + i) * (1.2 + hash01(i * 97 + x) * 1.8));
    }
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}
