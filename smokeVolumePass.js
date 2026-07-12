/**
 * smokeVolumePass.js — ShaderPass fumée volumétrique.
 *
 * Crée un ShaderPass Three.js à insérer dans l'EffectComposer
 * avant colorGradingPass. Le fragment shader ray-marche le volume
 * de fumée à partir des positions monde des cheminées (maisons + locos).
 *
 * API :
 *   createSmokeVolumePass()                          → ShaderPass
 *   updateSmokeVolumePass(pass, positions, camera)   → void (à appeler chaque frame)
 *
 * positions : tableau de THREE.Vector3 (base de chaque panache, world-space)
 * camera    : THREE.PerspectiveCamera du jeu
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { ShaderPass } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/ShaderPass.js';
import { SMOKE_VERT, SMOKE_FRAG } from './shaders/shaderSmoke.js';

export const MAX_SMOKE_SOURCES = 48;

const _smokeShader = {
  uniforms: {
    tDiffuse:    { value: null },
    tDepth:      { value: null },
    uTime:       { value: 0.0 },
    uCamPos:     { value: new THREE.Vector3() },
    uProjInv:    { value: new THREE.Matrix4() },
    uCamWorld:   { value: new THREE.Matrix4() },
    uViewMat:    { value: new THREE.Matrix4() },
    uProjMat:    { value: new THREE.Matrix4() },
    uSmokePos:   { value: Array.from({ length: 48 }, () => new THREE.Vector3()) },
    uSmokeCount: { value: 0.0 },
    uLocoCount:  { value: 0.0 },
    uHasDepth:   { value: 0.0 },
    // Slab Y dynamique (2026-07-04, bug fumée invisible/écrasée en bouliste loin du centre) —
    // recalculé chaque frame dans updateSmokeVolumePass() à partir du min/max réel des sources
    // (déjà courbées), au lieu d'une paire de constantes absolues fixes dans le shader.
    uSmokeYBase: { value: -0.4 },
    uSmokeYTop:  { value: 1.3 }
  },
  vertexShader:   SMOKE_VERT,
  fragmentShader: SMOKE_FRAG
};

/** Crée le ShaderPass. L'insérer dans le composer AVANT colorGradingPass. */
export function createSmokeVolumePass() {
  return new ShaderPass(_smokeShader);
}

// Marges relatives autour du slab Y, appliquées au min/max RÉEL des sources (déjà courbées
// par getWorldCurvatureDrop côté appelant) — remplacent les anciennes constantes absolues
// fixes du shader (-0.05 / 1.3, calibrées pour des sources toutes proches de y≈0.28 sans
// courbure). En dessous : couvre la zone de fondu de base d'une source. Au-dessus : couvre
// la hauteur max d'un panache (0.68 × 1.14 pour une loco ≈ 0.775).
const SMOKE_SLAB_MARGIN_BELOW = 0.35;
const SMOKE_SLAB_MARGIN_ABOVE = 1.1;

/**
 * Met à jour les uniforms du pass chaque frame.
 * @param {ShaderPass}            pass      — le pass créé par createSmokeVolumePass()
 * @param {THREE.Vector3[]}       positions  — positions monde des sources (locos en tête, max 48)
 * @param {THREE.PerspectiveCamera} camera   — caméra du jeu
 * @param {number}                locoCount  — nb de sources loco en tête du tableau
 * @param {THREE.DepthTexture|null} depthTex — beautyRenderTarget.depthTexture (occlusion géométrie)
 */
export function updateSmokeVolumePass(pass, positions, camera, locoCount = 0, depthTex = null) {
  const count = Math.min(positions.length, MAX_SMOKE_SOURCES);
  pass.uniforms.uSmokeCount.value = count;
  pass.uniforms.uLocoCount.value  = locoCount;

  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < count; i++) {
    pass.uniforms.uSmokePos.value[i].copy(positions[i]);
    if (positions[i].y < minY) minY = positions[i].y;
    if (positions[i].y > maxY) maxY = positions[i].y;
  }
  if (count > 0) {
    pass.uniforms.uSmokeYBase.value = minY - SMOKE_SLAB_MARGIN_BELOW;
    pass.uniforms.uSmokeYTop.value  = maxY + SMOKE_SLAB_MARGIN_ABOVE;
  }

  pass.uniforms.uCamPos.value.copy(camera.position);
  pass.uniforms.uProjInv.value.copy(camera.projectionMatrixInverse);
  pass.uniforms.uCamWorld.value.copy(camera.matrixWorld);
  pass.uniforms.uViewMat.value.copy(camera.matrixWorldInverse);
  pass.uniforms.uProjMat.value.copy(camera.projectionMatrix);
  pass.uniforms.uTime.value = performance.now() / 1000.0;

  if (depthTex) {
    pass.uniforms.tDepth.value    = depthTex;
    pass.uniforms.uHasDepth.value = 1.0;
  }
}
