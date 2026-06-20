import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import {
  EDGE_TYPES,
  HEX_SIZE,
  TILE_VISUAL,
  TERRAIN_RELIEF,
  THIN_BIOME_DEPTH_RATIO,
  BIOME_HEIGHT_RATIO
} from './config.js';
import { getEdgeType } from './tileGenerator.js';
import { getTerrainSurfaceY, getTerrainNormalAt } from './terrainHeight.js';
import { hashUnitFull as hashUnit, hashNumber } from './stable/hashUtils.js';

const materialCache = new Map();
const geometryCache = new Map();

const RAIL_VISUAL_SCALE = 0.75;

const TRACK = {
  portScale: 1.002,
  hubRadius: HEX_SIZE * 0.185,
  minCurveRadius: HEX_SIZE * 0.34,
  sampleSpacing: HEX_SIZE * 0.045,
  railGauge: HEX_SIZE * 0.0475 * RAIL_VISUAL_SCALE,
  railRadius: HEX_SIZE * 0.009 * RAIL_VISUAL_SCALE,
  railRadialSegments: 4,
  railLift: HEX_SIZE * 0.021 * RAIL_VISUAL_SCALE,
  sleeperLength: HEX_SIZE * 0.17 * RAIL_VISUAL_SCALE,
  sleeperDepth: HEX_SIZE * 0.025 * RAIL_VISUAL_SCALE,
  sleeperHeight: HEX_SIZE * 0.018 * RAIL_VISUAL_SCALE,
  sleeperSpacing: HEX_SIZE * 0.145,
  sleeperEdgeMargin: HEX_SIZE * 0.11,
  edgeLockStart: 0.78,
  edgeLockEnd: 0.985,
  ySmoothPasses: 2,
  stoneSideOffset: HEX_SIZE * 0.185 * RAIL_VISUAL_SCALE,
  stoneSpacing: HEX_SIZE * 0.30,
  biomeStoneCount: 3
};

const RAIL_TYPE = EDGE_TYPES.rail;
const RAIL_SURFACE_Y = TILE_VISUAL.railSurfaceY ?? TILE_VISUAL.waterY ?? -0.075;

const RAIL_ZONE_BORDER = {
  // Même philosophie que les plages validées : un ruban de terrain en relief,
  // construit sur le contour turbulent réel du secteur, jamais une corde droite
  // entre deux sommets d'hexagone.
  width: HEX_SIZE * 0.082,
  outerSegments: 16,
  innerSegments: 12,
  outerAmplitude: HEX_SIZE * 0.030,
  innerAmplitude: HEX_SIZE * 0.024,
  yLift: HEX_SIZE * 0.014,
  sideDrop: HEX_SIZE * 0.040,
  jointOverlap: HEX_SIZE * 0.030
};

// Toute la voie est maintenant générée par createRailCenterOverlay().
// On garde l'export pour compatibilité avec tileMesh.js, mais on évite les anciens
// morceaux séparés par secteur : c'était la source des cassures visibles.
export function createRailOverlay() {
  return null;
}

export function createRailCenterOverlay(edges, sectorDefs, createOuterVertices) {
  const railPorts = getRailPorts(edges, sectorDefs, createOuterVertices);
  if (railPorts.length === 0) return null;

  const group = new THREE.Group();
  group.name = 'procedural-volume-rail-track';

  addRailZoneBoundaryOverlay(group, edges, sectorDefs, createOuterVertices);

  const routes = createRailRoutes(railPorts);
  for (const route of routes) {
    addTrackRoute(group, route);
  }

  addBiomeScatterStones(group, edges, sectorDefs, createOuterVertices);

  return group;
}


function addRailZoneBoundaryOverlay(group, edges, sectorDefs, createOuterVertices) {
  const railSectorKeys = new Set(sectorDefs
    .filter(sector => getEdgeType(edges[sector.key]) === RAIL_TYPE)
    .map(sector => sector.key));
  if (railSectorKeys.size === 0) return;

  const outerVertices = createOuterVertices();
  const innerRadius = HEX_SIZE * (TILE_VISUAL.centerRadiusScale ?? 0.33);
  const innerVertices = createOuterVertices(innerRadius);
  const borderGeometries = [];

  for (const sector of sectorDefs) {
    if (!railSectorKeys.has(sector.key)) continue;

    const edgeIndex = sectorDefs.findIndex(item => item.key === sector.key);
    const previousSector = sectorDefs[(edgeIndex + sectorDefs.length - 1) % sectorDefs.length];
    const nextSector = sectorDefs[(edgeIndex + 1) % sectorDefs.length];

    // Bord extérieur du secteur rail : turbulent comme le mesh de terrain.
    borderGeometries.push(createRailZoneRibbonGeometry(
      createRailRaggedOuterEdge(outerVertices[sector.a], outerVertices[sector.b], sector.key),
      true
    ));

    // Bords radiaux seulement quand le rail touche un autre biome : c'est la
    // bordure de zone, pas un quadrillage interne à la con.
    if (!railSectorKeys.has(previousSector.key)) {
      borderGeometries.push(createRailZoneRibbonGeometry(
        createRailRaggedInnerEdge(innerVertices[sector.a], outerVertices[sector.a], sector.a),
        false
      ));
    }

    if (!railSectorKeys.has(nextSector.key)) {
      borderGeometries.push(createRailZoneRibbonGeometry(
        createRailRaggedInnerEdge(innerVertices[sector.b], outerVertices[sector.b], sector.b).reverse(),
        false
      ));
    }
  }

  const geometry = mergeRailZoneGeometries(borderGeometries.filter(Boolean));
  if (!geometry) return;

  const mesh = new THREE.Mesh(geometry, [getRailMaterial('ballastTop'), getRailMaterial('ballastSide')]);
  mesh.name = 'procedural-rail-zone-turbulent-border';
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.renderOrder = 118;
  group.add(mesh);
}

function createRailZoneRibbonGeometry(polyline, preferOuterSide = true) {
  const clean = compactRailPolyline(polyline);
  if (clean.length < 2) return null;

  const expanded = extendRailPolyline(clean, RAIL_ZONE_BORDER.jointOverlap);
  const positions = [];
  const uvs = [];
  const indices = [];
  const topCount = expanded.length * 2;

  const cumulative = [0];
  for (let i = 1; i < expanded.length; i += 1) {
    cumulative.push(cumulative[i - 1] + distance2D(expanded[i - 1], expanded[i]));
  }
  const total = Math.max(cumulative[cumulative.length - 1], 0.001);

  for (let i = 0; i < expanded.length; i += 1) {
    const point = expanded[i];
    const tangent = getRailPolylineTangent(expanded, i);
    const normal = getRailPolylineNormal(tangent, point, preferOuterSide);
    const outer = offsetPoint2D(point, normal, RAIL_ZONE_BORDER.width * 0.58);
    const inner = offsetPoint2D(point, normal, -RAIL_ZONE_BORDER.width * 0.42);
    const v = cumulative[i] / total;
    const yOuter = getSurfaceY(new THREE.Vector3(outer.x, 0, outer.z), RAIL_TYPE) + RAIL_ZONE_BORDER.yLift * 0.76;
    const yInner = getSurfaceY(new THREE.Vector3(inner.x, 0, inner.z), RAIL_TYPE) + RAIL_ZONE_BORDER.yLift;

    positions.push(outer.x, yOuter, outer.z);
    uvs.push(v * 3.0, 0);
    positions.push(inner.x, yInner, inner.z);
    uvs.push(v * 3.0, 1);
  }

  for (let i = 0; i < expanded.length - 1; i += 1) {
    const a = i * 2;
    const b = a + 2;
    indices.push(a, a + 1, b + 1);
    indices.push(a, b + 1, b);
  }
  const topIndexCount = indices.length;

  // Sous-face et flancs fermés : on évite de voir sous la bordure en caméra basse.
  for (let i = 0; i < expanded.length; i += 1) {
    const topOuter = i * 2;
    const topInner = topOuter + 1;
    const outerY = positions[topOuter * 3 + 1] - RAIL_ZONE_BORDER.sideDrop;
    const innerY = positions[topInner * 3 + 1] - RAIL_ZONE_BORDER.sideDrop;
    const base = positions.length / 3;

    positions.push(positions[topOuter * 3], outerY, positions[topOuter * 3 + 2]);
    uvs.push(uvs[topOuter * 2], 0);
    positions.push(positions[topInner * 3], innerY, positions[topInner * 3 + 2]);
    uvs.push(uvs[topInner * 2], 1);
  }

  for (let i = 0; i < expanded.length - 1; i += 1) {
    const a = i * 2;
    const b = a + 2;
    const ba = topCount + a;
    const bb = topCount + b;

    indices.push(topCount + a + 1, topCount + b + 1, topCount + b);
    indices.push(topCount + a + 1, topCount + b, topCount + a);

    indices.push(a, b, bb);
    indices.push(a, bb, ba);
    indices.push(a + 1, topCount + a + 1, topCount + b + 1);
    indices.push(a + 1, topCount + b + 1, b + 1);
  }

  const sideIndexCount = indices.length - topIndexCount;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
  geometry.setIndex(indices);
  geometry.clearGroups();
  geometry.addGroup(0, topIndexCount, 0);
  geometry.addGroup(topIndexCount, sideIndexCount, 1);
  geometry.computeVertexNormals();
  return geometry;
}

function createRailRaggedOuterEdge(a, b, seedKey) {
  const points = [];
  const seed = hashNumber(`rail-border-outer:${seedKey}:${a.x.toFixed(3)}:${a.z.toFixed(3)}:${b.x.toFixed(3)}:${b.z.toFixed(3)}`);

  for (let i = 0; i <= RAIL_ZONE_BORDER.outerSegments; i += 1) {
    const t = i / RAIL_ZONE_BORDER.outerSegments;
    const x = THREE.MathUtils.lerp(a.x, b.x, t);
    const z = THREE.MathUtils.lerp(a.z, b.z, t);
    const endFade = Math.sin(Math.PI * t);
    const broadWave = Math.sin(Math.PI * t * 2 + hashUnit(seed + 17) * Math.PI * 2);
    const localChaos = (hashUnit(seed + i * 97) - 0.5) * 2;
    const bite = RAIL_ZONE_BORDER.outerAmplitude * endFade * (broadWave * 0.62 + localChaos * 0.38);
    const len = Math.hypot(x, z) || 1;
    points.push({ x: x + (x / len) * bite, z: z + (z / len) * bite });
  }

  return points;
}

function createRailRaggedInnerEdge(innerPoint, outerPoint, vertexIndex) {
  const points = [];
  const seed = hashNumber(`rail-border-inner:${vertexIndex}`);
  const dx = outerPoint.x - innerPoint.x;
  const dz = outerPoint.z - innerPoint.z;
  const length = Math.hypot(dx, dz) || 1;
  const normal = { x: -dz / length, z: dx / length };

  for (let i = 0; i <= RAIL_ZONE_BORDER.innerSegments; i += 1) {
    const t = i / RAIL_ZONE_BORDER.innerSegments;
    const x = THREE.MathUtils.lerp(innerPoint.x, outerPoint.x, t);
    const z = THREE.MathUtils.lerp(innerPoint.z, outerPoint.z, t);
    const endFade = Math.sin(Math.PI * t);
    const wave = Math.sin(Math.PI * t * 3 + hashUnit(seed + 23) * Math.PI * 2);
    const localChaos = (hashUnit(seed + i * 131) - 0.5) * 2;
    const bite = RAIL_ZONE_BORDER.innerAmplitude * endFade * (wave * 0.65 + localChaos * 0.35);
    points.push({ x: x + normal.x * bite, z: z + normal.z * bite });
  }

  return points;
}

function compactRailPolyline(points) {
  const compacted = [];
  for (const point of points) {
    const previous = compacted[compacted.length - 1];
    if (!previous || distance2D(previous, point) > 0.0001) compacted.push(point);
  }
  return compacted;
}

function extendRailPolyline(points, amount) {
  if (points.length < 2 || amount <= 0) return points.map(point => ({ ...point }));
  const out = points.map(point => ({ ...point }));
  const firstDir = normalize2D(sub2D(out[0], out[1]));
  const lastDir = normalize2D(sub2D(out[out.length - 1], out[out.length - 2]));
  out[0].x += firstDir.x * amount;
  out[0].z += firstDir.z * amount;
  out[out.length - 1].x += lastDir.x * amount;
  out[out.length - 1].z += lastDir.z * amount;
  return out;
}

function getRailPolylineTangent(points, index) {
  const previous = points[Math.max(0, index - 1)];
  const next = points[Math.min(points.length - 1, index + 1)];
  return normalize2D(sub2D(next, previous));
}

function getRailPolylineNormal(tangent, point, preferOuterSide) {
  const n = normalize2D({ x: tangent.z, z: -tangent.x });
  const radial = normalize2D(point);
  const dot = n.x * radial.x + n.z * radial.z;
  const sign = preferOuterSide ? (dot >= 0 ? 1 : -1) : 1;
  return { x: n.x * sign, z: n.z * sign };
}

function offsetPoint2D(point, normal, distance) {
  return { x: point.x + normal.x * distance, z: point.z + normal.z * distance };
}

function mergeRailZoneGeometries(geometries) {
  if (geometries.length === 0) return null;
  if (geometries.length === 1) return geometries[0];

  const positions = [];
  const uvs = [];
  const indices = [];
  const groups = [];
  let vertexOffset = 0;
  let indexOffset = 0;

  for (const geometry of geometries) {
    const position = geometry.getAttribute('position');
    const uv = geometry.getAttribute('uv');
    const index = geometry.getIndex();
    if (!position || !uv || !index) continue;

    for (let i = 0; i < position.count; i += 1) {
      positions.push(position.getX(i), position.getY(i), position.getZ(i));
      uvs.push(uv.getX(i), uv.getY(i));
    }
    for (let i = 0; i < index.count; i += 1) indices.push(index.getX(i) + vertexOffset);

    for (const group of geometry.groups) {
      groups.push({ start: indexOffset + group.start, count: group.count, materialIndex: group.materialIndex });
    }

    vertexOffset += position.count;
    indexOffset += index.count;
  }

  if (positions.length === 0 || indices.length === 0) return null;
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  merged.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
  merged.setIndex(indices);
  merged.clearGroups();
  for (const group of groups) merged.addGroup(group.start, group.count, group.materialIndex);
  merged.computeVertexNormals();
  return merged;
}

function distance2D(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function sub2D(a, b) {
  return { x: a.x - b.x, z: a.z - b.z };
}

function normalize2D(v) {
  const length = Math.hypot(v.x, v.z);
  if (length <= 0.000001) return { x: 1, z: 0 };
  return { x: v.x / length, z: v.z / length };
}

function getRailPorts(edges, sectorDefs, createOuterVertices) {
  const vertices = createOuterVertices();

  return sectorDefs
    .map((sector, index) => {
      const edge = edges[sector.key];
      if (getEdgeType(edge) !== RAIL_TYPE) return null;

      const vertexA = vertices[sector.a];
      const vertexB = vertices[sector.b];
      const point = new THREE.Vector3(
        ((vertexA.x + vertexB.x) / 2) * TRACK.portScale,
        0,
        ((vertexA.z + vertexB.z) / 2) * TRACK.portScale
      );
      const direction = new THREE.Vector3(point.x, 0, point.z).normalize();

      return {
        index,
        key: sector.key,
        point,
        direction
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.index - b.index);
}

function createRailRoutes(ports) {
  if (ports.length === 1) {
    return [createTerminusRoute(ports[0])];
  }

  if (ports.length === 2) {
    return [createPortToPortRoute(ports[0], ports[1])];
  }

  return createJunctionRoutes(ports);
}

function createTerminusRoute(port) {
  const direction = port.direction.clone();
  const start = port.point.clone();
  const end = direction.clone().multiplyScalar(TRACK.hubRadius * 1.02);
  const distance = start.distanceTo(end);
  const controlDistance = clamp(distance * 0.44, TRACK.minCurveRadius * 0.62, HEX_SIZE * 0.62);
  const c1 = start.clone().add(direction.clone().multiplyScalar(-controlDistance));
  const c2 = end.clone().add(direction.clone().multiplyScalar(controlDistance * 0.18));

  return {
    seedKey: `rail-terminus:${port.index}`,
    points: sampleCubic(start, c1, c2, end, 20),
    closed: false,
    sleepers: true,
    stones: true,
    bumper: true
  };
}

function createPortToPortRoute(a, b) {
  const start = a.point.clone();
  const end = b.point.clone();
  const distance = start.distanceTo(end);
  const controlDistance = clamp(distance * 0.42, TRACK.minCurveRadius, HEX_SIZE * 0.72);
  const dot = clamp(a.direction.dot(b.direction), -1, 1);
  const almostOpposite = dot < -0.92;

  // Cubique explicite plutôt que Catmull brut : pas d'overshoot, donc pas de nœud.
  const c1 = start.clone().add(a.direction.clone().multiplyScalar(-controlDistance));
  const c2 = end.clone().add(b.direction.clone().multiplyScalar(-controlDistance));

  if (almostOpposite) {
    c1.copy(start.clone().multiplyScalar(0.42));
    c2.copy(end.clone().multiplyScalar(0.42));
  }

  return {
    seedKey: `rail-pair:${a.index}:${b.index}`,
    points: sampleCubic(start, c1, c2, end, 34),
    closed: false,
    sleepers: true,
    stones: true
  };
}

function createJunctionRoutes(ports) {
  const routes = [];

  routes.push({
    seedKey: `rail-hub:${ports.map(port => port.index).join('-')}`,
    points: createHubRingPoints(44),
    closed: true,
    sleepers: true,
    sleeperSpacing: TRACK.sleeperSpacing * 1.35,
    stones: false
  });

  for (const port of ports) {
    const direction = port.direction.clone();
    const start = port.point.clone();
    const end = direction.clone().multiplyScalar(TRACK.hubRadius);
    const distance = start.distanceTo(end);
    const controlDistance = clamp(distance * 0.46, TRACK.minCurveRadius * 0.58, HEX_SIZE * 0.62);
    const c1 = start.clone().add(direction.clone().multiplyScalar(-controlDistance));
    const c2 = end.clone().add(direction.clone().multiplyScalar(controlDistance * 0.28));

    routes.push({
      seedKey: `rail-branch:${port.index}`,
      points: sampleCubic(start, c1, c2, end, 22),
      closed: false,
      sleepers: true,
      stones: true
    });
  }

  return routes;
}

function addTrackRoute(group, route) {
  const centerline = build3DPath(route.points, route.closed, route.seedKey);
  const length = getPathLength(centerline, route.closed);
  if (length <= HEX_SIZE * 0.04) return;

  const leftRail = buildOffsetRail(centerline, -1, route.closed, route.seedKey);
  const rightRail = buildOffsetRail(centerline, 1, route.closed, route.seedKey);

  const railMaterial = getRailMaterial('metal');
  const leftMesh = createRailTube(leftRail, railMaterial, route.closed, `${route.seedKey}:left-rail`);
  const rightMesh = createRailTube(rightRail, railMaterial, route.closed, `${route.seedKey}:right-rail`);

  if (leftMesh) group.add(leftMesh);
  if (rightMesh) group.add(rightMesh);

  if (route.sleepers !== false) {
    addSleepers(group, centerline, route);
  }

  if (route.bumper) {
    addTerminusBumper(group, centerline, route.seedKey);
  }

  if (route.stones !== false) {
    addRailsideStones(group, centerline, route.seedKey, route.closed);
  }
}

function build3DPath(points2D, closed = false, seedKey = 'rail') {
  const resampled = resamplePath(points2D, TRACK.sampleSpacing, closed);
  const points = resampled.map((point, index) => new THREE.Vector3(
    point.x,
    getRailCenterY(point, `${seedKey}:${index}`),
    point.z
  ));

  smoothPathY(points, closed, TRACK.ySmoothPasses);
  return points;
}

function buildOffsetRail(centerline, sideSign, closed = false, seedKey = 'rail') {
  const points = centerline.map((point, index) => {
    const tangent = getPathTangent(centerline, index, closed);
    const side = getHorizontalSide(tangent).multiplyScalar(TRACK.railGauge * sideSign);
    const offset = point.clone().add(side);
    offset.y = getRailCenterY(offset, `${seedKey}:rail:${sideSign}:${index}`);
    return offset;
  });

  smoothPathY(points, closed, TRACK.ySmoothPasses);
  return points;
}

function createRailTube(points, material, closed = false, name = 'rail-tube') {
  if ((!closed && points.length < 2) || (closed && points.length < 4)) return null;

  const curve = new THREE.CatmullRomCurve3(points, closed, 'centripetal', 0.35);
  const length = getPathLength(points, closed);
  const tubularSegments = Math.max(8, Math.min(64, Math.ceil(length / (HEX_SIZE * 0.035))));
  const geometry = new THREE.TubeGeometry(
    curve,
    tubularSegments,
    TRACK.railRadius,
    TRACK.railRadialSegments,
    closed
  );

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.renderOrder = 126;
  return mesh;
}

function addSleepers(group, centerline, route) {
  const length = getPathLength(centerline, route.closed);
  if (length <= TRACK.sleeperSpacing) return;

  const material = getRailMaterial('wood');
  const geometry = getSleeperGeometry();
  const spacing = route.sleeperSpacing ?? TRACK.sleeperSpacing;
  const start = route.closed ? 0 : TRACK.sleeperEdgeMargin;
  const end = route.closed ? length : Math.max(start, length - TRACK.sleeperEdgeMargin);

  for (let distance = start; distance <= end; distance += spacing) {
    const center = getPointAtDistance(centerline, distance, route.closed);
    const tangent = getTangentAtDistance(centerline, distance, route.closed);
    const side = getHorizontalSide(tangent);
    const up = new THREE.Vector3().crossVectors(tangent, side).normalize();
    const basis = new THREE.Matrix4().makeBasis(side, up, tangent.clone().normalize());

    const sleeper = new THREE.Mesh(geometry, material);
    sleeper.name = `${route.seedKey}:wood-sleeper`;
    sleeper.position.copy(center);
    sleeper.position.y -= TRACK.railRadius * 1.05 + TRACK.sleeperHeight * 0.18;
    sleeper.quaternion.setFromRotationMatrix(basis);
    sleeper.castShadow = true;
    sleeper.receiveShadow = true;
    sleeper.renderOrder = 124;
    group.add(sleeper);
  }
}

function addTerminusBumper(group, centerline, seedKey) {
  if (centerline.length < 2) return;

  const end = centerline[centerline.length - 1];
  const tangent = getPathTangent(centerline, centerline.length - 1, false).multiplyScalar(-1).normalize();
  const side = getHorizontalSide(tangent);
  const up = new THREE.Vector3().crossVectors(tangent, side).normalize();
  const basis = new THREE.Matrix4().makeBasis(side, up, tangent);

  const bumper = new THREE.Mesh(getBumperGeometry(), getRailMaterial('woodDark'));
  bumper.name = `${seedKey}:wood-terminus-bumper`;
  bumper.position.copy(end).add(tangent.clone().multiplyScalar(HEX_SIZE * 0.035));
  bumper.position.y -= TRACK.railRadius * 0.35;
  bumper.quaternion.setFromRotationMatrix(basis);
  bumper.castShadow = true;
  bumper.receiveShadow = true;
  bumper.renderOrder = 127;
  group.add(bumper);
}

function addRailsideStones(group, centerline, seedKey, closed = false) {
  const length = getPathLength(centerline, closed);
  if (length <= HEX_SIZE * 0.10) return;

  const stoneCount = Math.max(2, Math.min(7, Math.round(length / TRACK.stoneSpacing)));
  for (let i = 0; i < stoneCount; i += 1) {
    const t = (i + 0.7 + hashUnit(`${seedKey}:stone-t:${i}`) * 0.6) / (stoneCount + 0.4);
    const distance = (t % 1) * length;
    const base = getPointAtDistance(centerline, distance, closed);
    const tangent = getTangentAtDistance(centerline, distance, closed);
    const side = getHorizontalSide(tangent);
    const sideSign = hashUnit(`${seedKey}:stone-side:${i}`) < 0.5 ? -1 : 1;
    const lateral = TRACK.stoneSideOffset * (0.76 + hashUnit(`${seedKey}:stone-lateral:${i}`) * 0.48);
    const longitudinal = (hashUnit(`${seedKey}:stone-longitudinal:${i}`) - 0.5) * HEX_SIZE * 0.09;

    const position = base.clone()
      .add(side.clone().multiplyScalar(sideSign * lateral))
      .add(tangent.clone().multiplyScalar(longitudinal));
    position.y = getSurfaceY(position, RAIL_TYPE) + HEX_SIZE * 0.002;

    const stone = createStoneMesh(`${seedKey}:stone:${i}`);
    stone.position.copy(position);
    alignScatterStoneToTerrain(stone, position, RAIL_TYPE, hashUnit(`${seedKey}:stone-ry:${i}`) * Math.PI * 2, `${seedKey}:stone:${i}`);
    const scale = 0.74 + hashUnit(`${seedKey}:stone-scale:${i}`) * 0.52;
    stone.scale.set(
      scale * (0.78 + hashUnit(`${seedKey}:stone-sx:${i}`) * 0.45),
      scale * (0.54 + hashUnit(`${seedKey}:stone-sy:${i}`) * 0.32),
      scale * (0.80 + hashUnit(`${seedKey}:stone-sz:${i}`) * 0.42)
    );
    snapStoneBottomToSurface(stone, getSurfaceY(position, RAIL_TYPE), HEX_SIZE * 0.001);
    group.add(stone);
  }
}


function addBiomeScatterStones(group, edges, sectorDefs, createOuterVertices) {
  const vertices = createOuterVertices();

  for (const sector of sectorDefs) {
    const type = getEdgeType(edges[sector.key]);
    if (type !== EDGE_TYPES.grass && type !== EDGE_TYPES.house) continue;

    const a = vertices[sector.a];
    const b = vertices[sector.b];
    const innerRadius = HEX_SIZE * (TILE_VISUAL.centerRadiusScale ?? 0.33);
    const innerA = pointAtRadius(a, innerRadius);
    const innerB = pointAtRadius(b, innerRadius);
    const seed = `biome-stones:${sector.key}:${type}`;
    const count = type === EDGE_TYPES.house ? Math.max(2, TRACK.biomeStoneCount - 1) : TRACK.biomeStoneCount;

    for (let i = 0; i < count; i += 1) {
      const position = randomPointInQuad(innerA, innerB, b, a, `${seed}:${i}`);
      position.y = getSurfaceY(position, type) + HEX_SIZE * 0.001;

      const stone = createStoneMesh(`${seed}:stone:${i}`);
      stone.name = `procedural-${type}-decorative-stone`;
      stone.position.copy(position);
      alignScatterStoneToTerrain(stone, position, type, hashUnit(`${seed}:ry:${i}`) * Math.PI * 2, `${seed}:stone:${i}`);
      const scale = 0.54 + hashUnit(`${seed}:scale:${i}`) * 0.42;
      stone.scale.set(
        scale * (0.72 + hashUnit(`${seed}:sx:${i}`) * 0.38),
        scale * (0.42 + hashUnit(`${seed}:sy:${i}`) * 0.24),
        scale * (0.72 + hashUnit(`${seed}:sz:${i}`) * 0.38)
      );
      snapStoneBottomToSurface(stone, getSurfaceY(position, type), HEX_SIZE * 0.001);
      group.add(stone);
    }
  }
}


function snapStoneBottomToSurface(stone, surfaceY, clearance = HEX_SIZE * 0.001) {
  if (!stone || !Number.isFinite(surfaceY)) return;

  stone.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(stone);
  if (!Number.isFinite(box.min.y)) return;

  const targetBottomY = surfaceY + clearance;
  const deltaY = targetBottomY - box.min.y;
  if (Math.abs(deltaY) > 0.0005) {
    stone.position.y += deltaY;
    stone.updateMatrixWorld(true);
  }
}

function pointAtRadius(point, radius) {
  const length = Math.hypot(point.x, point.z) || 1;
  return { x: (point.x / length) * radius, z: (point.z / length) * radius };
}

function randomPointInQuad(p0, p1, p2, p3, seedKey) {
  const u = 0.14 + hashUnit(`${seedKey}:u`) * 0.72;
  const v = 0.16 + hashUnit(`${seedKey}:v`) * 0.68;
  const left = new THREE.Vector3(
    THREE.MathUtils.lerp(p0.x, p3.x, v),
    0,
    THREE.MathUtils.lerp(p0.z, p3.z, v)
  );
  const right = new THREE.Vector3(
    THREE.MathUtils.lerp(p1.x, p2.x, v),
    0,
    THREE.MathUtils.lerp(p1.z, p2.z, v)
  );
  return left.lerp(right, u);
}


function alignScatterStoneToTerrain(stone, position, type, yaw, seedKey) {
  const normal = type === RAIL_TYPE
    ? new THREE.Vector3(0, 1, 0)
    : getTerrainNormalAt(position, type, hashNumber(seedKey) % 97, {
      edgeLockStart: TRACK.edgeLockStart,
      edgeLockEnd: TRACK.edgeLockEnd,
      normalSampleStep: HEX_SIZE * 0.012
    });
  const slopeQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
  const yawQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  stone.quaternion.copy(slopeQuat.multiply(yawQuat));
  stone.rotateX((hashUnit(`${seedKey}:rx`) - 0.5) * 0.18);
  stone.rotateZ((hashUnit(`${seedKey}:rz`) - 0.5) * 0.18);
}

function createStoneMesh(seedKey) {
  const mesh = new THREE.Mesh(getStoneGeometry(seedKey), getRailMaterial('stone'));
  mesh.name = 'procedural-rail-side-stone';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.renderOrder = 122;
  return mesh;
}

function getRailCenterY(point, seedKey = 'rail') {
  return getSurfaceY(point, RAIL_TYPE) + TRACK.railLift;
}

function getSurfaceY(point, type = RAIL_TYPE) {
  if (type !== RAIL_TYPE) {
    return getTerrainSurfaceY(point, type, 0, {
      edgeLockStart: TRACK.edgeLockStart,
      edgeLockEnd: TRACK.edgeLockEnd
    });
  }

  const baseSurfaceY = RAIL_SURFACE_Y;
  const terrainY = baseSurfaceY + getSmoothTerrainTopY(point, type);
  const connectionY = baseSurfaceY + getBiomeLocalTopY(type);
  const radius = Math.hypot(point.x, point.z) / Math.max(HEX_SIZE, 0.001);
  const edgeLock = smoothstep(TRACK.edgeLockStart, TRACK.edgeLockEnd, radius);
  return THREE.MathUtils.lerp(terrainY, connectionY, edgeLock);
}

function getSmoothTerrainTopY(point, type = RAIL_TYPE) {
  const baseY = getBiomeLocalTopY(type);

  // Même règle que dans tileMesh.js : le biome rail est un lit parfaitement plat.
  // On conserve les courbes horizontales de Cyril, mais aucune variation Y locale
  // ne doit être appliquée aux rails, traverses, butoirs ou pierres de ballast.
  if (type === RAIL_TYPE) return baseY;

  if (!TERRAIN_RELIEF?.enabled) return baseY;

  const amplitude = TERRAIN_RELIEF.typeAmplitude?.[type] ?? TERRAIN_RELIEF.baseAmplitude ?? 0.04;
  const radius = Math.hypot(point.x, point.z) / Math.max(HEX_SIZE, 0.001);
  const edgeFadeStart = TERRAIN_RELIEF.edgeFadeStart ?? 0.30;
  const edgeFade = THREE.MathUtils.clamp((radius - edgeFadeStart) / (1 - edgeFadeStart), 0, 1);
  const centerFade = 0.72 + edgeFade * 0.28;
  const waveA = Math.sin(point.x * 3.10 + point.z * 1.85);
  const waveB = Math.cos(point.x * -2.45 + point.z * 4.15);
  const waveC = Math.sin((point.x + point.z) * 5.20);
  const relief = (waveA * 0.47 + waveB * 0.33 + waveC * 0.20) * amplitude * centerFade;

  return baseY + relief * 0.68;
}

function getBiomeLocalTopY(type) {
  if (type === EDGE_TYPES.water) return 0;

  const baseDepth = TILE_VISUAL.tileThickness ?? 0.16;
  const thinRatio = THIN_BIOME_DEPTH_RATIO?.[type];
  if (thinRatio) return baseDepth * (thinRatio - 1);

  return baseDepth * (BIOME_HEIGHT_RATIO?.[type] ?? 0);
}

function sampleCubic(p0, p1, p2, p3, segments = 24) {
  const points = [];
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const mt = 1 - t;
    points.push(new THREE.Vector3(
      mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x,
      0,
      mt * mt * mt * p0.z + 3 * mt * mt * t * p1.z + 3 * mt * t * t * p2.z + t * t * t * p3.z
    ));
  }
  return points;
}

function createHubRingPoints(segments = 40) {
  const points = [];
  for (let i = 0; i < segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    points.push(new THREE.Vector3(
      Math.cos(angle) * TRACK.hubRadius,
      0,
      Math.sin(angle) * TRACK.hubRadius
    ));
  }
  return points;
}

function resamplePath(points, spacing, closed = false) {
  const length = getPathLength(points, closed);
  if (length <= 0) return points.map(point => point.clone());

  const count = Math.max(closed ? 8 : 2, Math.ceil(length / spacing));
  const resampled = [];
  const steps = closed ? count : count;

  for (let i = 0; i <= steps; i += 1) {
    if (closed && i === steps) break;
    const distance = (i / steps) * length;
    resampled.push(getPointAtDistance(points, distance, closed));
  }

  return resampled;
}

function smoothPathY(points, closed = false, passes = 1) {
  if (points.length < 3) return;

  for (let pass = 0; pass < passes; pass += 1) {
    const nextY = points.map(point => point.y);
    const start = closed ? 0 : 1;
    const end = closed ? points.length : points.length - 1;

    for (let i = start; i < end; i += 1) {
      const prev = points[(i - 1 + points.length) % points.length];
      const current = points[i];
      const next = points[(i + 1) % points.length];
      nextY[i] = prev.y * 0.25 + current.y * 0.50 + next.y * 0.25;
    }

    for (let i = start; i < end; i += 1) {
      points[i].y = nextY[i];
    }
  }
}

function getPathLength(points, closed = false) {
  if (points.length < 2) return 0;

  let length = 0;
  const segmentCount = closed ? points.length : points.length - 1;
  for (let i = 0; i < segmentCount; i += 1) {
    length += points[(i + 1) % points.length].distanceTo(points[i]);
  }
  return length;
}

function getPointAtDistance(points, distance, closed = false) {
  if (points.length === 0) return new THREE.Vector3();
  if (points.length === 1) return points[0].clone();

  const length = getPathLength(points, closed);
  if (length <= 0) return points[0].clone();

  let target = closed ? positiveModulo(distance, length) : THREE.MathUtils.clamp(distance, 0, length);
  const segmentCount = closed ? points.length : points.length - 1;

  for (let i = 0; i < segmentCount; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const segmentLength = a.distanceTo(b);
    if (target <= segmentLength || i === segmentCount - 1) {
      const localT = segmentLength <= 0 ? 0 : target / segmentLength;
      return a.clone().lerp(b, localT);
    }
    target -= segmentLength;
  }

  return points[points.length - 1].clone();
}

function getTangentAtDistance(points, distance, closed = false) {
  const delta = HEX_SIZE * 0.018;
  const before = getPointAtDistance(points, distance - delta, closed);
  const after = getPointAtDistance(points, distance + delta, closed);
  const tangent = after.sub(before);
  if (tangent.lengthSq() <= 0.0000001) return new THREE.Vector3(0, 0, 1);
  return tangent.normalize();
}

function getPathTangent(points, index, closed = false) {
  if (points.length < 2) return new THREE.Vector3(0, 0, 1);

  const prevIndex = closed ? (index - 1 + points.length) % points.length : Math.max(0, index - 1);
  const nextIndex = closed ? (index + 1) % points.length : Math.min(points.length - 1, index + 1);
  const tangent = points[nextIndex].clone().sub(points[prevIndex]);
  if (tangent.lengthSq() <= 0.0000001) return new THREE.Vector3(0, 0, 1);
  return tangent.normalize();
}

function getHorizontalSide(tangent) {
  const side = new THREE.Vector3(tangent.z, 0, -tangent.x);
  if (side.lengthSq() <= 0.0000001) return new THREE.Vector3(1, 0, 0);
  return side.normalize();
}

function getRailMaterial(kind) {
  if (materialCache.has(kind)) return materialCache.get(kind);

  const params = {
    metal: { color: 0x5B5F5B, roughness: 0.58, metalness: 0.45 },
    wood: { color: 0x7A4425, roughness: 0.88, metalness: 0.02 },
    woodDark: { color: 0x4D2D1A, roughness: 0.90, metalness: 0.02 },
    stone: { color: 0x8B8172, roughness: 0.96, metalness: 0.0 },
    ballastTop: { color: 0x9A8A68, roughness: 0.98, metalness: 0.0 },
    ballastSide: { color: 0x6F624D, roughness: 0.99, metalness: 0.0 }
  }[kind] ?? { color: 0xffffff, roughness: 0.8, metalness: 0.0 };

  const material = new THREE.MeshStandardMaterial({
    ...params,
    flatShading: true
  });
  materialCache.set(kind, material);
  return material;
}

function getSleeperGeometry() {
  const key = 'sleeper';
  if (!geometryCache.has(key)) {
    geometryCache.set(key, new THREE.BoxGeometry(
      TRACK.sleeperLength,
      TRACK.sleeperHeight,
      TRACK.sleeperDepth
    ));
  }
  return geometryCache.get(key);
}

function getBumperGeometry() {
  const key = 'bumper';
  if (!geometryCache.has(key)) {
    geometryCache.set(key, new THREE.BoxGeometry(
      TRACK.sleeperLength * 0.95,
      TRACK.sleeperHeight * 1.7,
      TRACK.sleeperDepth * 1.55
    ));
  }
  return geometryCache.get(key);
}

function getStoneGeometry(seedKey) {
  const variant = Math.floor(hashUnit(seedKey) * 3);
  const key = `stone:${variant}`;
  if (!geometryCache.has(key)) {
    const radius = HEX_SIZE * (variant === 0 ? 0.032 : variant === 1 ? 0.040 : 0.050) * RAIL_VISUAL_SCALE;
    const geometry = variant === 1
      ? new THREE.IcosahedronGeometry(radius, 0)
      : new THREE.DodecahedronGeometry(radius, 0);
    geometry.computeVertexNormals();
    geometryCache.set(key, geometry);
  }
  return geometryCache.get(key);
}

function positiveModulo(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

function smoothstep(edge0, edge1, x) {
  const t = THREE.MathUtils.clamp((x - edge0) / Math.max(edge1 - edge0, 0.0001), 0, 1);
  return t * t * (3 - 2 * t);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

