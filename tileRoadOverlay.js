import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { EDGE_TYPES, HEX_SIZE, TILE_VISUAL } from './config.js';
import { getEdgeType } from './tileGenerator.js';

const roadMaterialCache = new Map();

const ROADABLE_TYPES = new Set([
  EDGE_TYPES.house
]);

export function createRoadOverlay(edge, vertexA, vertexB, edgeKey = '') {
  const type = getEdgeType(edge);
  if (!ROADABLE_TYPES.has(type)) return null;

  const density = getRoadDensity(type, edgeKey);
  if (density <= 0) return null;

  const group = new THREE.Group();
  const y = getRoadY(type);
  const outerMid = new THREE.Vector3(
    (vertexA.x + vertexB.x) / 2,
    y,
    (vertexA.z + vertexB.z) / 2
  );

  // Version moins "aéroport" : aucun raccord systématique au centre.
  // Chaque route/chemin traverse seulement une partie du triangle avec une courbe bruitée.
  const inner = outerMid.clone().multiplyScalar(getInnerRoadStart(type, edgeKey)).setY(y);
  const outer = outerMid.clone().multiplyScalar(0.93).setY(y);
  const points = makeTurbulentPath(inner, outer, edgeKey, density, type);

  if (type === EDGE_TYPES.house || density >= 3) {
    group.add(createThickPolyline(points, getRoadWidth(type), getRoadMaterial('asphalt')));
    group.add(createRoadMarkings(points, type));
  } else if (type === EDGE_TYPES.forest) {
    group.add(createThickPolyline(points, getRoadWidth(type), getRoadMaterial('forestTrail')));
    group.add(createThickPolyline(points, getRoadWidth(type) * 0.34, getRoadMaterial('forestTrailLight')));
  } else {
    group.add(createThickPolyline(points, getRoadWidth(type), getRoadMaterial('dirt')));
    group.add(createThickPolyline(points, getRoadWidth(type) * 0.30, getRoadMaterial('trailDust')));
  }

  if (type === EDGE_TYPES.forest || type === EDGE_TYPES.grass) {
    const spurSeed = hashText(`${type}:${edgeKey}:spur`);
    if (spurSeed % 3 !== 0) {
      group.add(createPathSpur(points, spurSeed % 2 === 0 ? 1 : -1, type, edgeKey));
    }
  }

  return group;
}

export function createRoadCenterOverlay() {
  // Pas de disque central, pas d'étoile de routes : ça évite l'effet rond-point/aéroport.
  return null;
}

function getRoadDensity(type, edgeKey) {
  if (type === EDGE_TYPES.house) return 3;
  if (type === EDGE_TYPES.field) return 0;
  if (type === EDGE_TYPES.forest) return edgeKey === 'n' || edgeKey === 'se' || edgeKey === 'sw' ? 2 : 1;
  if (type === EDGE_TYPES.grass) return edgeKey === 'ne' || edgeKey === 's' || edgeKey === 'nw' ? 2 : 1;
  return 0;
}

function getRoadWidth(type) {
  if (type === EDGE_TYPES.house) return HEX_SIZE * 0.112;
  if (type === EDGE_TYPES.field) return HEX_SIZE * 0.075;
  if (type === EDGE_TYPES.forest) return HEX_SIZE * 0.064;
  return HEX_SIZE * 0.058;
}

function getRoadY(type) {
  if (type === EDGE_TYPES.rail) return TILE_VISUAL.railY ?? 0.055;

  // Les routes/chemins doivent être plaqués sur le dessus réel du biome,
  // pas flotter au niveau des anciens outlines. Petit epsilon seulement
  // pour éviter le z-fighting avec le relief low-poly.
  const baseDepth = TILE_VISUAL.tileThickness ?? 0.12;
  const topYByType = {
    [EDGE_TYPES.house]: baseDepth * -0.30,
    [EDGE_TYPES.forest]: baseDepth * -0.30,
    [EDGE_TYPES.grass]: baseDepth * -0.45,
    [EDGE_TYPES.field]: baseDepth * 0.45
  };

  return (topYByType[type] ?? (TILE_VISUAL.sectorY ?? 0)) + 0.006;
}

function getInnerRoadStart(type, edgeKey) {
  const seed = hashText(`${type}:${edgeKey}:inner`);
  if (type === EDGE_TYPES.house) return 0.18 + (seed % 9) / 100;
  return 0.24 + (seed % 18) / 100;
}

function makeTurbulentPath(inner, outer, edgeKey, density, type) {
  const dir = outer.clone().sub(inner).normalize();
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  const seed = hashText(`${type}:${edgeKey}:turbulence`);
  const amp = HEX_SIZE * (type === EDGE_TYPES.house ? 0.105 : 0.145) * (1 + density * 0.18);
  const points = [inner.clone()];

  for (let i = 1; i <= 4; i++) {
    const t = i / 5;
    const wobbleA = signedNoise(seed, i) * amp;
    const wobbleB = signedNoise(seed >>> 3, i + 11) * amp * 0.45;
    const point = inner.clone().lerp(outer, t);
    point.add(side.clone().multiplyScalar(wobbleA));
    point.add(dir.clone().multiplyScalar(wobbleB));
    point.y = inner.y;
    points.push(point);
  }

  points.push(outer.clone());
  return points;
}

function createPathSpur(points, sign, type, edgeKey) {
  const index = 2 + (hashText(`${type}:${edgeKey}:spur-index`) % Math.max(1, points.length - 4));
  const start = points[index].clone();
  const prev = points[Math.max(0, index - 1)];
  const next = points[Math.min(points.length - 1, index + 1)];
  const dir = next.clone().sub(prev).normalize();
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  const length = HEX_SIZE * (0.18 + (hashText(`${type}:${edgeKey}:spur-length`) % 12) / 100);
  const mid = start.clone().add(side.clone().multiplyScalar(sign * length * 0.58));
  const end = start.clone().add(side.multiplyScalar(sign * length));
  mid.add(dir.clone().multiplyScalar(signedNoise(hashText(edgeKey), 5) * HEX_SIZE * 0.08));
  return createThickPolyline([start, mid, end], getRoadWidth(type) * 0.46, getRoadMaterial(type === EDGE_TYPES.forest ? 'forestTrail' : 'dirt'));
}

function signedNoise(seed, salt) {
  const n = hashText(`${seed}:${salt}`) % 2001;
  return (n / 1000) - 1;
}

function createRoadMarkings(points, type) {
  const group = new THREE.Group();
  const material = getRoadMaterial('marking');
  const width = type === EDGE_TYPES.house ? HEX_SIZE * 0.018 : HEX_SIZE * 0.012;

  for (let i = 0.18; i <= 0.82; i += 0.22) {
    const segment = samplePathSegment(points, i, 0.07);
    if (!segment) continue;
    group.add(createThickPolyline(segment, width, material));
  }

  return group;
}

function createHubDisk(y, asphalt) {
  const geometry = new THREE.CircleGeometry(HEX_SIZE * (asphalt ? 0.135 : 0.105), 24);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, getRoadMaterial(asphalt ? 'asphalt' : 'dirt'));
  mesh.position.y = y;
  return mesh;
}

function createThickPolyline(points, width, material) {
  if (points.length < 2) return new THREE.Group();

  const group = new THREE.Group();
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dir = b.clone().sub(a);
    const length = dir.length();
    if (length <= 0.0001) continue;

    const mid = a.clone().lerp(b, 0.5);
    const geometry = new THREE.PlaneGeometry(width, length);
    geometry.rotateX(-Math.PI / 2);

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(mid);
    mesh.rotation.y = Math.atan2(dir.x, dir.z);
    group.add(mesh);
  }
  return group;
}

function samplePathSegment(points, t, lengthRatio) {
  const p = samplePath(points, t);
  const a = samplePath(points, Math.max(0, t - lengthRatio / 2));
  const b = samplePath(points, Math.min(1, t + lengthRatio / 2));
  if (!p || !a || !b) return null;
  return [a, b];
}

function samplePath(points, t) {
  if (points.length === 2) return points[0].clone().lerp(points[1], t);
  const p0 = points[0].clone().lerp(points[1], t);
  const p1 = points[1].clone().lerp(points[2], t);
  return p0.lerp(p1, t);
}

function getRoadMaterial(kind) {
  if (roadMaterialCache.has(kind)) return roadMaterialCache.get(kind);

  const color = kind === 'asphalt'
    ? 0x2F3030
    : kind === 'marking'
      ? 0xF6E7A8
      : kind === 'trailDust'
        ? 0xC49A58
        : kind === 'forestTrail'
          ? 0x5D625F
          : kind === 'forestTrailLight'
            ? 0xA3A8A2
            : 0x8B6233;
  const transparent = kind === 'trailDust' || kind === 'forestTrailLight';
  const opacity = kind === 'trailDust' ? 0.78 : kind === 'forestTrailLight' ? 0.74 : 1;

  const material = new THREE.MeshBasicMaterial({
    color,
    transparent,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3
  });

  roadMaterialCache.set(kind, material);
  return material;
}

function hashText(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
