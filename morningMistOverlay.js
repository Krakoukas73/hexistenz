/**
 * morningMistOverlay.js — Phase 1 roadmap VFX : brume matinale.
 *
 * Ne crée aucun objet 3D : module léger qui module le fog existant de la
 * scène (densité + couleur) pendant que l'évènement 'morningMist' du
 * environmentDirector est actif, avec fondu entrée/sortie doux.
 *
 * Lit la config fog courante (visualEnvironment.config.environment) à chaque
 * frame plutôt que de la figer : si les sliders debugLightUi changent la
 * densité pendant la brume, l'effet reste relatif à la nouvelle base.
 * À l'arrêt, restaure explicitement via visualEnvironment.apply() pour
 * garantir qu'aucune valeur modifiée pendant la brume ne reste incrustée.
 *
 * NON câblé dans la boucle animate() de scene.js pour l'instant (cf. mémoire
 * projet — scaffolding Phase 0/1a) : déclencher "Brume matinale" depuis le
 * panneau debug (🌦 ENV) change l'état du directeur mais ne module pas encore
 * le fog tant que updateMorningMist() n'est pas appelée chaque frame. À
 * brancher explicitement quand cette phase sera validée visuellement.
 *
 * Intégration prévue dans scene.js :
 *   import { updateMorningMist } from './morningMistOverlay.js';
 *   updateMorningMist(scene, visualEnvironment, environmentDirector, timeSeconds);
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { getEnvironmentEventFade, isEnvironmentEventActive } from './environmentDirector.js';

const MIST_EVENT_ID     = 'morningMist';
const MIST_COLOR        = new THREE.Color('#cfd8dd'); // brume pâle bleu-gris
const MIST_DENSITY_MULT = 3.2;  // densité fog au pic de la brume = base × ce facteur
const MIST_LINEAR_SHRINK = 0.6; // en mode fog linéaire : réduction near/far au pic
const FADE_IN_SECONDS   = 8;
const FADE_OUT_SECONDS  = 10;

let _wasActive = false;
const _baseColor = new THREE.Color();

export function updateMorningMist(scene, visualEnvironment, environmentDirector, timeSeconds) {
  const active = isEnvironmentEventActive(environmentDirector, MIST_EVENT_ID);

  if (!active) {
    if (_wasActive) {
      visualEnvironment.apply(); // restaure proprement le fog de base
      _wasActive = false;
    }
    return;
  }
  _wasActive = true;

  if (!scene.fog) return; // défensif : rien à moduler si le fog est désactivé

  const fade = getEnvironmentEventFade(environmentDirector, MIST_EVENT_ID, timeSeconds, {
    fadeIn: FADE_IN_SECONDS,
    fadeOut: FADE_OUT_SECONDS
  });

  const env = visualEnvironment.config.environment ?? {};
  _baseColor.set(env.fogColor ?? env.skyColor ?? '#02040a');

  if (scene.fog.isFogExp2) {
    const baseDensity = Number(env.fogDensity ?? 0.004);
    scene.fog.density = baseDensity * (1 + (MIST_DENSITY_MULT - 1) * fade);
  } else if (scene.fog.isFog) {
    const baseNear = Number(env.fogNear ?? 0);
    const baseFar  = Number(env.fogFar  ?? 0);
    const shrink = 1 - MIST_LINEAR_SHRINK * fade;
    scene.fog.near = baseNear * shrink;
    scene.fog.far  = baseFar  * shrink;
  }

  scene.fog.color.copy(_baseColor).lerp(MIST_COLOR, fade * 0.85);
}
