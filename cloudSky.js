/**
 * cloudSky.js — Sphère de ciel volumétrique avec nuages procéduraux.
 *
 * Architecture : sphère BackSide (r=500) avec ShaderMaterial.
 * - Rendue avant la scène (renderOrder = −50 000), depthTest/Write = false.
 * - La sphère suit la caméra à chaque frame (position.copy(camera.position))
 *   pour que le ciel soit toujours "à l'infini".
 * - Le fragment shader ray-marche une couche atmosphérique ~50 u au-dessus
 *   du plan caméra (sphère GLSL centrée à cameraPos.y − 450, r=500).
 *
 * API :
 *   createCloudSky(scene)         — instancie et ajoute à la scène
 *   updateCloudSky(mesh, opts)    — opts: { camera, timeSeconds, sunDir,
 *                                           skyZenith, skyHorizon, sunColor,
 *                                           coverage, enabled }
 *   disposeCloudSky(scene)        — nettoie géométrie + matériau
 *
 * Defaults visuels (modifiables via updateCloudSky) :
 *   coverage  = 0.50
 *   enabled   = true
 *   skyZenith  = #0a1a3a
 *   skyHorizon = #4a7096
 *   sunColor   = #ffe0a0
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { cloudVertexShader, cloudFragmentShader } from './shaders/shaderCiel.js';
import { markNoWorldCurvature } from './worldCurvature.js';

const CLOUD_SKY_NAME  = 'hexistenz-cloud-sky';
const CLOUD_SKY_RADIUS = 500;

// ─── Valeurs par défaut ──────────────────────────────────────────────────────
const DEFAULT_SKY_ZENITH  = new THREE.Color(0x0a1a3a);
const DEFAULT_SKY_HORIZON = new THREE.Color(0x4a7096);
const DEFAULT_SUN_COLOR   = new THREE.Color(0xffe0a0);
const DEFAULT_SUN_DIR     = new THREE.Vector3(0.0, 0.7, -0.7).normalize();

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Crée la sphère de ciel et l'ajoute à la scène.
 * Idempotent : retourne l'existant si déjà créé.
 */
export function createCloudSky(scene) {
  let existing = scene.getObjectByName(CLOUD_SKY_NAME);
  if (existing) return existing;

  const geometry = new THREE.SphereGeometry(CLOUD_SKY_RADIUS, 24, 16);

  const material = new THREE.ShaderMaterial({
    name:           'cloud-sky-material',
    vertexShader:   cloudVertexShader,
    fragmentShader: cloudFragmentShader,
    side:           THREE.BackSide,
    depthTest:      false,
    depthWrite:     false,
    fog:            false,
    transparent:    false,
    uniforms: {
      uTime:       { value: 0.0 },
      uSunDir:     { value: DEFAULT_SUN_DIR.clone() },
      uSkyZenith:  { value: new THREE.Color().copy(DEFAULT_SKY_ZENITH) },
      uSkyHorizon: { value: new THREE.Color().copy(DEFAULT_SKY_HORIZON) },
      uSunColor:   { value: new THREE.Color().copy(DEFAULT_SUN_COLOR) },
      uCoverage:   { value: 0.41 },  // −18 % densité/nombre
      uEnabled:    { value: 1.0 },
    },
  });

  const mesh = markNoWorldCurvature(new THREE.Mesh(geometry, material));
  mesh.name            = CLOUD_SKY_NAME;
  mesh.renderOrder     = -200000;  // avant étoiles (−100 000) → les étoiles peignent par-dessus en mode nuit
  mesh.frustumCulled   = false;
  mesh.userData.disableCastShadow    = true;
  mesh.userData.disableReceiveShadow = true;
  mesh.userData.disableWorldCurvature = true;
  mesh.userData.skipPaletteHarmony   = true;

  scene.add(mesh);
  return mesh;
}

/**
 * Met à jour les uniforms chaque frame.
 *
 * @param {THREE.Mesh} cloudSky   — le mesh retourné par createCloudSky
 * @param {object}     opts
 *   camera       {THREE.Camera}  — requis, positionne la sphère
 *   timeSeconds  {number}        — temps de jeu en secondes
 *   sunDir       {THREE.Vector3} — direction normalisée vers le soleil
 *   skyZenith    {THREE.Color}   — couleur ciel zénith
 *   skyHorizon   {THREE.Color}   — couleur ciel horizon
 *   sunColor     {THREE.Color}   — teinte halo/disque solaire
 *   coverage     {number}        — couverture nuageuse 0–1
 *   enabled      {boolean}       — false = ciel gradient uni (0 coût GPU nuages)
 */
export function updateCloudSky(cloudSky, {
  camera,
  timeSeconds = 0,
  sunDir      = null,
  skyZenith   = null,
  skyHorizon  = null,
  sunColor    = null,
  coverage    = null,
  enabled     = null,
} = {}) {
  if (!cloudSky?.material?.uniforms) return;
  const u = cloudSky.material.uniforms;

  // La sphère suit la caméra pour que l'horizon soit toujours centré
  if (camera) cloudSky.position.copy(camera.position);

  u.uTime.value = timeSeconds;

  if (sunDir)    u.uSunDir.value.copy(sunDir).normalize();
  if (skyZenith) u.uSkyZenith.value.copy(skyZenith);
  if (skyHorizon) u.uSkyHorizon.value.copy(skyHorizon);
  if (sunColor)  u.uSunColor.value.copy(sunColor);
  if (coverage  !== null) u.uCoverage.value  = Math.max(0, Math.min(1, coverage));
  if (enabled   !== null) u.uEnabled.value   = enabled ? 1.0 : 0.0;
}

/**
 * Supprime et libère la sphère de ciel.
 */
export function disposeCloudSky(scene) {
  const mesh = scene?.getObjectByName?.(CLOUD_SKY_NAME);
  if (!mesh) return;
  mesh.geometry?.dispose?.();
  mesh.material?.dispose?.();
  scene.remove(mesh);
}
