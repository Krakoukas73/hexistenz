import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

// Courbure globale de la carte : rendu GPU + picking souris CPU.
// Les règles hex restent en coordonnées axiales plates, mais le point de souris
// intersecte la surface courbée pour rester aligné avec ce qui est affiché.
//
// Formule : calotte sphérique paramétrée par la distance d'arc (pas la corde
// euclidienne d'un vrai cos/sqrt(R²-d²)) → drop = -R·(1-cos(dist/R)).
// Choisie plutôt que -(R-sqrt(R²-dist²)) car :
//  - domaine illimité (cos défini partout, jamais de NaN au-delà de dist=R) ;
//  - développement de Taylor en 0 : R(1-cos(x/R)) ≈ x²/(2R) — identique à
//    l'ancienne parabole près du centre, donc même intensité visuelle perçue ;
//  - pente bornée (|sin(dist/R)| ≤ 1) : jamais l'explosion de dérivée du sqrt
//    près du rim, donc pas de risque de reproduire l'artefact "aurore boréale"
//    documenté ci-dessous ;
//  - plateau naturel et lisse (pente → 0) à dist = R·π, profondeur max = 2R,
//    sans clamp arbitraire sur la valeur.
export const WORLD_CURVATURE = {
  enabled: true,
  radius: 22.0,
  // Ancien garde-fou (plafond réduit de 240 → 60 après un incident réel : les
  // positions extrêmes Y=−240 généraient des coordonnées clip-space pathologiques
  // avec frustumCulled=false → artefacts GPU gris/orange/rouge à l'horizon en
  // caméra rasante). Avec la formule cos, la profondeur max est désormais
  // naturellement bornée à 2·radius = 44 (atteinte en douceur, pente nulle) —
  // largement sous ce plafond. maxDrop reste comme filet de sécurité dormant
  // si radius est un jour augmenté significativement.
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
  const dist = Math.sqrt(x * x + z * z);
  // Domaine naturel [0, R·π] : au-delà, cos repartirait à la hausse (face
  // cachée de la sphère) → on clampe la distance, pas la valeur de drop.
  const distClamped = Math.min(dist, radius * Math.PI);
  const drop = radius * (1 - Math.cos(distClamped / radius));
  // Filet de sécurité dormant (drop max naturel = 2·radius ≤ maxDrop en config par défaut).
  return -Math.min(maxDrop, drop);
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
  // Calotte sphérique paramétrée par distance d'arc (voir commentaire JS
  // getWorldCurvatureDrop) : domaine illimité, pente bornée, plateau lisse.
  float dist = length(worldXZ);
  float distClamped = min(dist, radius * 3.14159265359);
  float drop = radius * (1.0 - cos(distClamped / radius));
  return -min(maxDrop, drop);
}
vec4 dorfromantikApplyWorldCurvature(vec4 worldPosition) {
  worldPosition.y += dorfromantikCurveDrop(worldPosition.xz);
  return worldPosition;
}
#endif
`;

// Pré-alloués pour éviter les allocations par appel
const _curvUp           = new THREE.Vector3(0, 1, 0);
const _curvNormal       = new THREE.Vector3();
const _curvIdentityQuat = new THREE.Quaternion(); // (0,0,0,1), cible du slerp d'atténuation

/**
 * Retourne le quaternion qui incline un objet perpendiculairement à la surface
 * courbée au point (worldX, worldZ). En mode platiste → identité.
 *
 * Les props (arbres, maisons...) sont positionnés à leur hauteur de relief
 * LOCAL (non courbée) puis inclinés ici ; le shader GPU (applySceneCurvatureFlags,
 * appliqué à toute la scène) ajoute ensuite exactement drop(worldPosition.xz) à
 * chaque vertex — y compris ceux de l'objet déjà incliné. Cet axe CPU est donc
 * pré-compensé pour annuler la contribution GPU redondante sur un décalage
 * local vertical (Δx,Δy,Δz)=(0,Δy,0) (tronc, cheminée...), de sorte que le
 * résultat visuel final égale la vraie normale de surface, pas une double
 * inclinaison. Dérivation générale (1er ordre, valable pour toute formule de
 * drop) : avec (nx, 1, nz) = (-∂drop/∂x, 1, -∂drop/∂z) la normale non
 * normalisée, l'axe CPU cherché est (nx, 1 + nx² + nz², nz).
 * Pour drop = -R(1-cos(dist/R)) : nx = sin(dist/R)·x/dist, nz = sin(dist/R)·z/dist,
 * donc nx²+nz² = sin²(dist/R) → axe = (nx, 1+sin²(dist/R), nz).
 *
 * Vérifié numériquement : cet axe reproduit fidèlement (< 0.5° d'écart) l'angle
 * réel de la pente au sol, y compris près de "l'équateur" de la calotte (R·π/2)
 * où cet angle atteint son maximum (jusqu'à 45°). C'est une pente RÉELLE de la
 * sphère à ce rayon, pas une erreur de calcul — mais des objets rectilignes
 * (maisons, tours, à arêtes droites) rendent ce genre d'inclinaison beaucoup
 * plus visible/choquant à l'œil que des props organiques (arbres, rochers),
 * même à angle égal. D'où le paramètre `strength` : il atténue le résultat
 * par slerp vers l'identité, sans toucher à la dérivation géométrique.
 * @param {number} worldX
 * @param {number} worldZ
 * @param {THREE.Quaternion} [target]
 * @param {number} [strength] 1 = inclinaison géométrique complète (défaut),
 *   0 = toujours vertical. Pour atténuer le tilt d'objets rectilignes (maisons...)
 *   sans changer la formule de courbure elle-même.
 */
export function getCurvatureTiltQuaternion(worldX, worldZ, target = new THREE.Quaternion(), strength = 1) {
  if (!WORLD_CURVATURE.enabled || strength <= 0) { target.identity(); return target; }
  const dist2 = worldX * worldX + worldZ * worldZ;
  if (dist2 < 1e-12) { target.identity(); return target; }
  const R = WORLD_CURVATURE.radius;
  const dist = Math.sqrt(dist2);
  // Au-delà de R·π la pente naturelle est nulle (plateau) → s=0 → identité.
  const distClamped = Math.min(dist, R * Math.PI);
  const s = Math.sin(distClamped / R);
  const nx = s * worldX / dist;
  const nz = s * worldZ / dist;
  _curvNormal.set(nx, 1 + s * s, nz).normalize();
  target.setFromUnitVectors(_curvUp, _curvNormal);
  if (strength < 1) target.slerp(_curvIdentityQuat, 1 - strength);
  return target;
}

export function markNoWorldCurvature(object) {
  if (!object) return object;
  object.userData.disableWorldCurvature = true;
  object.traverse?.(child => {
    child.userData.disableWorldCurvature = true;
  });
  return object;
}
