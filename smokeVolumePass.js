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
import { SMOKE_VERT, SMOKE_FRAG } from './shaders/shaderFumee.js';

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
    uHasDepth:   { value: 0.0 }
  },
  vertexShader:   SMOKE_VERT,
  fragmentShader: SMOKE_FRAG
};

/** Crée le ShaderPass. L'insérer dans le composer AVANT colorGradingPass. */
export function createSmokeVolumePass() {
  return new ShaderPass(_smokeShader);
}

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

  for (let i = 0; i < count; i++) {
    pass.uniforms.uSmokePos.value[i].copy(positions[i]);
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
