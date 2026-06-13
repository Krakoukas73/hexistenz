import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

export const RAGGED_EDGE = {
  // Morcelage visuel commun à tous les rendus : tuiles posées, ghost et
  // emplacements disponibles de la grille. Une seule source de chaos,
  // sinon bonjour le copier-coller radioactif.
  segments: 11,
  amplitude: 0.135,
  innerSegments: 8,
  innerAmplitude: 0.075
};

export function createRaggedOuterEdge(a, b, type = 'grass') {
  const points = [];
  const seed = hashRaggedEdge(a, b, type);
  const segments = RAGGED_EDGE.segments;

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const x = THREE.MathUtils.lerp(a.x, b.x, t);
    const z = THREE.MathUtils.lerp(a.z, b.z, t);

    // Les deux sommets restent exacts pour conserver une jonction propre.
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

export function createRaggedInnerEdge(innerPoint, outerPoint, vertexIndex) {
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

export function compactPointLoop(points) {
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
