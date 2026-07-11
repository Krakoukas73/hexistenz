/**
 * weatherVfxOverlay.js — Effets météo (lucioles, pluie) branchés sur
 * environmentDirector, construits sur la librairie wawa-vfx-vanilla
 * (vendor/wawa-vfx-vanilla.js — VFXParticles/VFXEmitter, instanced, 1 draw
 * call par système, animé côté GPU).
 *
 * Réglages en direct : voir vfxSettings.js (densité/taille/vitesse...),
 * modifiables via le panneau vfxSettingsUi.js sans recharger la page —
 * on ré-applique juste .updateSettings() sur l'émetteur concerné.
 *
 * Intégration dans scene.js :
 *   import { createWeatherVfxOverlay, updateWeatherVfxOverlay } from './weatherVfxOverlay.js';
 *   const weatherVfxOverlay = createWeatherVfxOverlay(scene);
 *   // dans animate() :
 *   updateWeatherVfxOverlay(weatherVfxOverlay, environmentDirector, timeSeconds, deltaSeconds, camera);
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { VFXEmitter, VFXParticles, AppearanceMode } from './vendor/wawa-vfx-vanilla.js';
import { getEnvironmentEventFade, isEnvironmentEventActive } from './environmentDirector.js';
import { getVfxSettings, onVfxSettingsChange } from './vfxSettings.js';
import { VFX_WORLD_RADIUS } from './variables.js';

const FIREFLY_POOL_CAPACITY = 220; // capacité max du pool (buffer figé à la création) — la "densité" pioche dedans
const RAIN_POOL_CAPACITY = 4000;

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

function _rainEmitterSettings(s) {
  return {
    loop: true,
    duration: 1.2,
    nbParticles: Math.round(400 + s.densite * 3200),
    spawnMode: 'time',
    particlesLifetime: [0.9, 1.2],
    startPositionMin: [-14, 8, -14],
    startPositionMax: [14, 14, 14],
    directionMin: [0, -1, 0],
    directionMax: [0, -1, 0],
    speed: [s.vitesse * 1.3, s.vitesse * 1.6],
    size: [s.tailleGoutte, s.tailleGoutte],
    colorStart: ['#dce8f0'],
    colorEnd: ['#aec2d0']
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

  const rainSettings = getVfxSettings('rain');
  const rainParticles = new VFXParticles('hexistenz-vfx-rain', {
    nbParticles: RAIN_POOL_CAPACITY,
    renderMode: 'stretchBillboard',
    stretchScale: 8,
    appearance: AppearanceMode.Circular,
    intensity: 1.6,
    fadeAlpha: [0.0, 0.85],
    fadeSize: [0.0, 1.0],
    blendingMode: THREE.NormalBlending
  });
  rainParticles.getMesh().name = 'hexistenz-vfx-rain';
  rainParticles.getMesh().visible = false;
  scene.add(rainParticles.getMesh());
  const rainEmitter = new VFXEmitter('hexistenz-vfx-rain', _rainEmitterSettings(rainSettings));
  rainEmitter.name = 'hexistenz-vfx-rain-emitter';
  scene.add(rainEmitter);

  const overlay = { fireflyParticles, fireflyEmitter, rainParticles, rainEmitter };

  onVfxSettingsChange((effect) => {
    if (effect === 'fireflies') fireflyEmitter.updateSettings(_fireflyEmitterSettings(getVfxSettings('fireflies')));
    if (effect === 'rain') rainEmitter.updateSettings(_rainEmitterSettings(getVfxSettings('rain')));
  });

  return overlay;
}

/** Évènement pluie : 'rain' et 'storm' partagent le même rendu (exclusiveGroup 'weather' → jamais actifs ensemble). */
function _activeRainEventId(environmentDirector) {
  if (isEnvironmentEventActive(environmentDirector, 'rain')) return 'rain';
  if (isEnvironmentEventActive(environmentDirector, 'storm')) return 'storm';
  return null;
}

export function updateWeatherVfxOverlay(overlay, environmentDirector, timeSeconds, deltaSeconds, focusPoint) {
  const fireflyFade = getEnvironmentEventFade(environmentDirector, 'fireflies', timeSeconds, { fadeIn: 6, fadeOut: 6 });
  overlay.fireflyEmitter.shouldEmit = fireflyFade > 0.001;
  overlay.fireflyParticles.getMesh().visible = fireflyFade > 0.001;
  overlay.fireflyParticles.updateSettings({ intensity: 2.4 * fireflyFade });
  overlay.fireflyEmitter.update(timeSeconds, deltaSeconds);
  overlay.fireflyParticles.update(timeSeconds);

  const rainEventId = _activeRainEventId(environmentDirector);
  const rainFade = rainEventId
    ? getEnvironmentEventFade(environmentDirector, rainEventId, timeSeconds, { fadeIn: 4, fadeOut: 5 })
    : 0;
  overlay.rainEmitter.shouldEmit = rainFade > 0.001;
  overlay.rainParticles.getMesh().visible = rainFade > 0.001;
  overlay.rainParticles.updateSettings({ intensity: 1.6 * rainFade });
  // Centré sur le point du sol regardé (controls.target), pas la position de l'œil caméra :
  // une boîte "au-dessus de camera.position" peut tomber hors du champ visible selon l'angle.
  if (focusPoint) overlay.rainEmitter.position.set(focusPoint.x, focusPoint.y, focusPoint.z);
  overlay.rainEmitter.update(timeSeconds, deltaSeconds);
  overlay.rainParticles.update(timeSeconds);
}
