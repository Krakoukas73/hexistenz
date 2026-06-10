import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { EDGE_TYPES, HEX_SIZE, TILE_VISUAL } from './config.js';
import { getEdgeType } from './tileGenerator.js';

const railMaterialCache = new Map();

export function createRailOverlay(edge, vertexA, vertexB) {
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

export function createRailCenterOverlay(edges, sectorDefs, createOuterVertices) {
  const railPorts = getRailPorts(edges, sectorDefs, createOuterVertices);
  if (railPorts.length === 0) return null;

  const group = new THREE.Group();
  const y = (TILE_VISUAL.railY ?? 0.055) + 0.006;
  const center = new THREE.Vector3(0, y, 0);

  if (railPorts.length === 1) {
    group.add(createRailPath([center, railPorts[0].point.clone()], true));
    return group;
  }

  if (railPorts.length === 2) {
    const a = railPorts[0].point.clone();
    const b = railPorts[1].point.clone();
    group.add(createRailPath(createCenterCurvePoints(a, b, center), true));
    return group;
  }

  for (const port of railPorts) {
    group.add(createRailPath([center.clone(), port.point.clone()], false));
  }

  return group;
}

function getRailPorts(edges, sectorDefs, createOuterVertices) {
  const vertices = createOuterVertices();

  return sectorDefs
    .map((sector, index) => {
      const edge = edges[sector.key];
      if (getEdgeType(edge) !== EDGE_TYPES.rail) return null;

      const vertexA = vertices[sector.a];
      const vertexB = vertices[sector.b];
      const y = (TILE_VISUAL.railY ?? 0.055) + 0.006;
      const mid = new THREE.Vector3(
        (vertexA.x + vertexB.x) / 2,
        y,
        (vertexA.z + vertexB.z) / 2
      );

      return {
        index,
        point: mid.multiplyScalar(0.18)
      };
    })
    .filter(Boolean);
}

function createCenterCurvePoints(a, b, center) {
  const points = [];
  const cross = Math.abs(a.clone().normalize().cross(b.clone().normalize()).y);
  const isStraight = cross < 0.08;

  if (isStraight) return [a, center.clone(), b];

  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const p1 = a.clone().lerp(center, t);
    const p2 = center.clone().lerp(b, t);
    points.push(p1.lerp(p2, t));
  }

  return points;
}

function createRailPath(points, addSleepers) {
  const group = new THREE.Group();
  if (points.length < 2) return group;

  const railGap = HEX_SIZE * 0.095;
  const sleeperHalf = HEX_SIZE * 0.14;
  const railMaterial = getRailLineMaterial('rail');
  const sleeperMaterial = getRailLineMaterial('sleeper');

  const left = [];
  const right = [];

  for (let i = 0; i < points.length; i++) {
    const tangent = getPathTangent(points, i);
    const side = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    left.push(points[i].clone().add(side.clone().multiplyScalar(-railGap)));
    right.push(points[i].clone().add(side.clone().multiplyScalar(railGap)));
  }

  group.add(createPolyline(left, railMaterial));
  group.add(createPolyline(right, railMaterial));

  if (addSleepers) {
    for (let i = 2; i < points.length - 2; i += 3) {
      const tangent = getPathTangent(points, i);
      const side = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
      group.add(createLineSegment(
        points[i].clone().add(side.clone().multiplyScalar(-sleeperHalf)),
        points[i].clone().add(side.clone().multiplyScalar(sleeperHalf)),
        sleeperMaterial
      ));
    }
  }

  return group;
}

function getPathTangent(points, index) {
  const prev = points[Math.max(0, index - 1)];
  const next = points[Math.min(points.length - 1, index + 1)];
  const tangent = next.clone().sub(prev);
  if (tangent.lengthSq() === 0) return new THREE.Vector3(1, 0, 0);
  return tangent.normalize();
}

function createPolyline(points, material) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  return new THREE.Line(geometry, material);
}

function createLineSegment(a, b, material) {
  const geometry = new THREE.BufferGeometry().setFromPoints([a, b]);
  return new THREE.Line(geometry, material);
}

function getRailLineMaterial(kind) {
  if (railMaterialCache.has(kind)) return railMaterialCache.get(kind);

  const material = new THREE.LineBasicMaterial({
    color: kind === 'rail' ? 0x262626 : 0x7A4A24,
    transparent: false,
    depthWrite: false
  });

  railMaterialCache.set(kind, material);
  return material;
}
