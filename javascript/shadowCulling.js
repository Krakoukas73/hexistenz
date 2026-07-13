/**
 * shadowCulling.js — Culling persistant des shadow casters par distance au focus.
 *
 * Problème : applySceneCurvatureFlags() pose frustumCulled=false sur tous les meshes
 * (obligatoire pour le shader de courbure monde). Three.js réutilise ce flag pour le
 * shadow pass : la passe shadow rend alors TOUS les castShadow=true de la scène entière,
 * même les objets à 80 unités du focus point. Ce module corrige ça manuellement.
 *
 * Design v2 — culling PERSISTANT (pas per-frame) :
 *   L'ancienne approche (toggle castShadow chaque frame + restore) coûtait O(N) CPU
 *   par frame pour N shadow casters. La nouvelle approche :
 *   1. rebuildShadowCasters() reconstruis le cache depuis la scène (toutes les 20 frames)
 *   2. applyShadowCulling() applique le culling UNE FOIS et le laisse en place
 *   3. Pas de restoreShadowCulling() per-frame — le prochain rebuild repart de l'état
 *      restauré par applySceneShadowFlags() qui précède toujours le rebuild.
 *   Coût par frame : 0 (le culling est dans l'état des flags, pas recalculé).
 *   Précision : mise à jour toutes les 20 frames (~0.6 s). Acceptable.
 *
 * API :
 *   rebuildShadowCasters(scene)             — appeler après applySceneShadowFlags()
 *   applyShadowCulling(focusPoint, maxDist) — appeler juste après rebuildShadowCasters()
 *   (pas de restoreShadowCulling — le restore est fait par applySceneShadowFlags au cycle suivant)
 */

/** Cache de tous les meshes potentiellement shadow-casters. Reconstruit toutes les 20 frames. */
let _casters = [];

/**
 * Reconstruit le cache en traversant la scène entière.
 * Coûteux (scene.traverse), appeler max 1×/20 frames.
 * À appeler APRÈS applySceneShadowFlags() pour capturer l'état restauré.
 */
export function rebuildShadowCasters(scene) {
  _casters = [];
  scene.traverse(obj => {
    if (obj.isMesh && obj.castShadow) _casters.push(obj);
  });
}

/**
 * Applique le culling de façon persistante : désactive castShadow sur les meshes
 * hors du rayon en XZ. L'état reste jusqu'au prochain rebuildShadowCasters().
 * Zéro coût CPU entre deux appels (contrairement à l'ancienne version per-frame).
 *
 * @param {THREE.Vector3} focusPoint  — controls.target (position au sol regardée)
 * @param {number}        maxDist     — rayon max en unités monde
 */
export function applyShadowCulling(focusPoint, maxDist) {
  const maxDistSq = maxDist * maxDist;
  const fx = focusPoint.x;
  const fz = focusPoint.z;
  for (const mesh of _casters) {
    if (!mesh.visible) {
      // Objet LOD-culled → shadow déjà inactif de fait, conserve castShadow=true
      // pour qu'il soit culled au prochain cycle si visible.
      continue;
    }
    // InstancedMesh à géométrie cuite à l'origine (ex. arbres) : leur matrixWorld
    // est (0,0,0) → applyShadowCulling calculerait la distance au focus depuis l'origine
    // plutôt que depuis les instances réelles → faux-positif qui éteint toutes les ombres.
    // Ces objets sont déjà gérés par leur LOD (visible=false quand trop loin) :
    // on les laisse toujours caster et on s'appuie sur la visibilité.
    if (mesh.userData.skipShadowCulling) continue;
    const e  = mesh.matrixWorld.elements;
    const dx = e[12] - fx;
    const dz = e[14] - fz;
    if (dx * dx + dz * dz > maxDistSq) {
      mesh.castShadow = false;
    }
  }
}

