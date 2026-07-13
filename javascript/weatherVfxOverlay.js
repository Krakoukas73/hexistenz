/**
 * weatherVfxOverlay.js — Lucioles (fireflies) branchées sur environmentDirector.
 *
 * Construit sur wawa-vfx-vanilla (vendor/wawa-vfx-vanilla.js — VFXParticles/VFXEmitter,
 * instanced, 1 draw call, animé côté GPU).
 *
 * Historique 2026-07-11 : ce fichier gérait aussi la pluie (VFXParticles rain), retirée
 * lors de la livraison Cyril « nuages metaball + pluie + impacts ». La pluie est
 * désormais rendue par `rainCloudOverlay.js` (metaballs marching-cubes pour les nuages,
 * gouttes streak sous chaque nuage, impacts au sol). Le weatherVfxOverlay ne s'occupe
 * plus que des lucioles, seule espèce restée sur cette lib.
 *
 * Réglages en direct : voir vfxSettings.js (densité/taille…), modifiables via le HUD
 * EDA sans recharger — on ré-applique juste .updateSettings() sur l'émetteur.
 *
 * Intégration dans scene.js :
 *   import { createWeatherVfxOverlay, updateWeatherVfxOverlay } from './weatherVfxOverlay.js';
 *   const weatherVfxOverlay = createWeatherVfxOverlay(scene);
 *   // dans animate() :
 *   updateWeatherVfxOverlay(weatherVfxOverlay, environmentDirector, timeSeconds, deltaSeconds);
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { VFXEmitter, VFXParticles, AppearanceMode } from '../vendor/wawa-vfx-vanilla.js';
import { getEnvironmentEventFade } from './environmentDirector.js';
import { getVfxSettings, onVfxSettingsChange } from './vfxSettings.js';
import { VFX_WORLD_RADIUS } from './variables.js';

const FIREFLY_POOL_CAPACITY = 220; // capacité max du pool (buffer figé à la création) — la "densité" pioche dedans

function _fireflyEmitterSettings(s) {
  return {
    loop: true,
    duration: 7,
    nbParticles: Math.round(20 + s.densite * 160),
    spawnMode: 'time',
    particlesLifetime: [5, 8],
    startPositionMin: [-VFX_WORLD_RADIUS, 0.4, -VFX_WORLD_RADIUS],
    startPositionMax: [VFX_WORLD_RADIUS, 2.2, VFX_WORLD_RADIUS],
    directionMin: [-1, -0.3, -1],
    directionMax: [1, 0.3, 1],
    speed: [s.vagabondage * 0.15, s.vagabondage * 0.4],
    size: [s.taille * 0.7, s.taille * 1.3],
    colorStart: ['#d9ff7a', '#baff5a'],
    colorEnd: ['#5a7a1a', '#3a5a10']
  };
}

export function createWeatherVfxOverlay(scene) {
  const fireflySettings = getVfxSettings('fireflies');
  const fireflyParticles = new VFXParticles('hexistenz-vfx-fireflies', {
    nbParticles: FIREFLY_POOL_CAPACITY,
    renderMode: 'billboard',
    appearance: AppearanceMode.Circular,
    intensity: 2.4,
    fadeAlpha: [0.15, 0.85],
    fadeSize: [0.15, 0.85],
    blendingMode: THREE.AdditiveBlending
  });
  fireflyParticles.getMesh().name = 'hexistenz-vfx-fireflies';
  fireflyParticles.getMesh().visible = false;
  scene.add(fireflyParticles.getMesh());
  const fireflyEmitter = new VFXEmitter('hexistenz-vfx-fireflies', _fireflyEmitterSettings(fireflySettings));
  fireflyEmitter.name = 'hexistenz-vfx-fireflies-emitter';
  scene.add(fireflyEmitter);

  const overlay = { fireflyParticles, fireflyEmitter };

  onVfxSettingsChange((effect) => {
    if (effect === 'fireflies') fireflyEmitter.updateSettings(_fireflyEmitterSettings(getVfxSettings('fireflies')));
  });

  return overlay;
}

export function updateWeatherVfxOverlay(overlay, environmentDirector, timeSeconds, deltaSeconds /* focusPoint retiré : plus de pluie centrée sur controls.target ici */) {
  const fireflyFade = getEnvironmentEventFade(environmentDirector, 'fireflies', timeSeconds, { fadeIn: 6, fadeOut: 6 });
  overlay.fireflyEmitter.shouldEmit = fireflyFade > 0.001;
  overlay.fireflyParticles.getMesh().visible = fireflyFade > 0.001;
  overlay.fireflyParticles.updateSettings({ intensity: 2.4 * fireflyFade });
  overlay.fireflyEmitter.update(timeSeconds, deltaSeconds);
  overlay.fireflyParticles.update(timeSeconds);
}
