import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

// Courbure globale de la carte : rendu GPU + picking souris CPU.
// Les règles hex restent en coordonnées axiales plates, mais le point de souris
// intersecte la surface courbée pour rester aligné avec ce qui est affiché.
export const WORLD_CURVATURE = {
  enabled: true,
  radius: 22.0,
  // Domaine volontairement large : avec l'extension douce de grille,
  // les cellules peuvent sortir très loin du rayon initial. Un plafond bas
  // crée une demi-sphère puis un plateau plat, ce qui casse le mode bouliste.
  maxDrop: 240.0
};

export const WORLD_CURVATURE_UNIFORMS = {
  uWorldCurvatureEnabled: { value: WORLD_CURVATURE.enabled ? 1.0 : 0.0 }
};

export function setWorldCurvatureEnabled(enabled) {
  WORLD_CURVATURE.enabled = Boolean(enabled);
  WORLD_CURVATURE_UNIFORMS.uWorldCurvatureEnabled.value = WORLD_CURVATURE.enabled ? 1.0 : 0.0;
  window.dispatchEvent(new CustomEvent('dorfromantik:world-curvature-changed', {
    detail: { enabled: WORLD_CURVATURE.enabled }
  }));
}

export function getWorldCurvatureEnabled() {
  return WORLD_CURVATURE.enabled;
}

export function getWorldShapeMode() {
  return WORLD_CURVATURE.enabled ? 'bouliste' : 'platiste';
}

export function setWorldShapeMode(mode) {
  setWorldCurvatureEnabled(mode !== 'platiste');
}

export function getWorldCurvatureDrop(x, z) {
  if (!WORLD_CURVATURE.enabled) return 0;
  const radius = Math.max(0.001, WORLD_CURVATURE.radius);
  const maxDrop = Math.max(0, WORLD_CURVATURE.maxDrop);
  const dist2 = x * x + z * z;
  return -Math.min(maxDrop, dist2 / (2 * radius));
}

export function intersectWorldCurvature(ray, target = null) {
  if (!ray) return null;

  const out = target ?? new THREE.Vector3();
  const sample = new THREE.Vector3();
  const heightDelta = t => {
    ray.at(t, sample);
    return sample.y - getWorldCurvatureDrop(sample.x, sample.z);
  };

  let low = 0;
  let high = 1;
  let lowValue = heightDelta(low);
  let highValue = heightDelta(high);

  for (let i = 0; i < 80 && Math.sign(lowValue) === Math.sign(highValue); i++) {
    low = high;
    lowValue = highValue;
    high *= 1.35;
    highValue = heightDelta(high);
    if (high > 2000) return null;
  }

  for (let i = 0; i < 36; i++) {
    const mid = (low + high) * 0.5;
    const midValue = heightDelta(mid);
    if (Math.sign(lowValue) === Math.sign(midValue)) {
      low = mid;
      lowValue = midValue;
    } else {
      high = mid;
      highValue = midValue;
    }
  }

  ray.at((low + high) * 0.5, out);
  return out;
}

export const WORLD_CURVATURE_SHADER = `
#ifndef DORFROMANTIK_WORLD_CURVATURE
#define DORFROMANTIK_WORLD_CURVATURE
uniform float uWorldCurvatureEnabled;
float dorfromantikCurveDrop(vec2 worldXZ) {
  if (uWorldCurvatureEnabled < 0.5) return 0.0;
  float radius = ${WORLD_CURVATURE.radius.toFixed(6)};
  float maxDrop = ${WORLD_CURVATURE.maxDrop.toFixed(6)};
  float dist2 = dot(worldXZ, worldXZ);
  return -min(maxDrop, dist2 / (2.0 * radius));
}
vec4 dorfromantikApplyWorldCurvature(vec4 worldPosition) {
  worldPosition.y += dorfromantikCurveDrop(worldPosition.xz);
  return worldPosition;
}
#endif
`;

export function markNoWorldCurvature(object) {
  if (!object) return object;
  object.userData.disableWorldCurvature = true;
  object.traverse?.(child => {
    child.userData.disableWorldCurvature = true;
  });
  return object;
}
