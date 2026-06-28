import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

// Courbure globale de la carte : rendu GPU + picking souris CPU.
// Les règles hex restent en coordonnées axiales plates, mais le point de souris
// intersecte la surface courbée pour rester aligné avec ce qui est affiché.
export const WORLD_CURVATURE = {
  enabled: true,
  radius: 22.0,
  // Plafond réduit de 240 → 60 : les positions extrêmes (Y=−240) généraient des
  // coordonnées clip-space pathologiques avec frustumCulled=false, provoquant des
  // artefacts GPU "aurore boréale" gris/orange/rouge à l'horizon quand la caméra
  // est rasante. maxDrop=60 : plateau à ~51 u (≈41 hex) — largement suffisant pour
  // les grilles typiques. Remonter si le jeu dépasse régulièrement 40 hex de rayon.
  maxDrop: 60.0
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

// Pré-alloués pour éviter les allocations par appel
const _curvUp     = new THREE.Vector3(0, 1, 0);
const _curvNormal = new THREE.Vector3();

/**
 * Retourne le quaternion qui incline un objet perpendiculairement à la surface
 * courbée au point (worldX, worldZ). En mode platiste → identité.
 * @param {number} worldX
 * @param {number} worldZ
 * @param {THREE.Quaternion} [target]
 */
export function getCurvatureTiltQuaternion(worldX, worldZ, target = new THREE.Quaternion()) {
  if (!WORLD_CURVATURE.enabled) { target.identity(); return target; }
  const dist2 = worldX * worldX + worldZ * worldZ;
  // Au-delà du plateau maxDrop la surface est plate → pas de tilt
  if (dist2 >= 2 * WORLD_CURVATURE.radius * WORLD_CURVATURE.maxDrop) { target.identity(); return target; }
  // Axe CPU pré-compensé : le shader GPU ajoute ΔY = -(X·Δx + Z·Δz)/R à chaque
  // vertex déplacé de (Δx,Δy,Δz). Pour que l'axe VISUEL résultant soit la
  // normale de surface (X/R, 1, Z/R), l'axe CPU doit être (X/R, 1+r²/R², Z/R).
  const R = WORLD_CURVATURE.radius;
  _curvNormal.set(worldX / R, 1 + dist2 / (R * R), worldZ / R).normalize();
  return target.setFromUnitVectors(_curvUp, _curvNormal);
}

export function markNoWorldCurvature(object) {
  if (!object) return object;
  object.userData.disableWorldCurvature = true;
  object.traverse?.(child => {
    child.userData.disableWorldCurvature = true;
  });
  return object;
}
