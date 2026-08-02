/**
 * lightningOverlay.js — Éclairs de l'orage : vrai tracé zébré (déplacement récursif du point
 * milieu, pas un flash plein écran), cœur blanc + halo bleuté, frappant le sol à des positions
 * pseudo-aléatoires calquées sur la couverture nuageuse (rainCloudOverlay.js).
 *
 * Rendu : deux THREE.TubeGeometry le long de la MÊME courbe (CatmullRomCurve3 passant par les
 * points zébrés) — un tube fin et lumineux (cœur, blanc) + un tube plus large et translucide
 * (halo, bleuté), tous deux en blending additif. Pool de quelques éclairs réutilisables (pas
 * d'allocation de géométrie à chaque frappe).
 *
 * Ne se déclenche que pendant 'storm' (pas 'rain' simple) — fréquence/luminosité réglables en
 * direct (vfxSettings.js, groupe 'storm', rubrique EDA "⛈️ Orage / Éclairs").
 *
 * Hook pour le futur système d'incendie (roadmap : "les éclairs peuvent mettre le feu") :
 *   import { onLightningStrike } from './lightningOverlay.js';
 *   onLightningStrike((x, z, timeSeconds, meta) => { ... déclencher 'fire' via environmentDirector
 *     si meta.tile est inflammable (forêt/champ), cf. environmentDirector.js ... });
 *   // meta = { q, r, key, tile, intensity } — tile = placedTile frappé (ou null si case vide),
 *   //         intensity ∈ [0,1] = force de la frappe (à croiser avec la proba d'allumage en F1).
 * Ce module ne connaît PAS le système de feu — il se contente de publier les frappes (position,
 * tuile touchée, intensité). La résolution de la tuile utilise placedTiles (passé à update).
 *
 * Intégration dans scene.js :
 *   import { createLightningOverlay, updateLightningOverlay } from './lightningOverlay.js';
 *   const lightningOverlay = createLightningOverlay(scene);
 *   // dans animate() :
 *   updateLightningOverlay(lightningOverlay, environmentDirector, rainCloudOverlay, placedTiles, timeSeconds, deltaSeconds);
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { getVfxSettings } from './vfxSettings.js';
import { isEnvironmentEventActive } from './environmentDirector.js';
import { getRainCloudAnchors } from './rainCloudOverlay.js';
import { worldToAxial, makeHexKey } from './hex.js';

const BOLT_POOL_SIZE = 2;      // éclairs simultanés max (rare qu'il en faille plus)
const STRIKE_DURATION = 0.24;  // secondes — zébrure brève, pas un flash qui traîne
const BOLT_TOP_Y = 9;          // départ du tracé (proche de l'altitude des nuages)
const CORE_RADIUS = 0.045;
const HALO_RADIUS = 0.16;
const FLASH_GAIN = 1.8;        // gain de l'éclaircissement d'ambiance (× storm.luminositeEclair)

const _listeners = new Set();

/** Abonnement aux frappes (pour le futur système d'incendie). Retourne une fonction de désabonnement. */
export function onLightningStrike(listener) {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}

function _notifyStrike(x, z, timeSeconds, meta) {
  for (const listener of _listeners) listener(x, z, timeSeconds, meta);
}

/**
 * Déplacement récursif du point milieu (classique pour un tracé d'éclair) : part d'un segment
 * droit top→bottom, décale chaque milieu perpendiculairement à l'axe de chute d'un montant qui
 * décroît à chaque subdivision. Donne un zigzag irrégulier crédible sans FBM ni shader dédié.
 */
function _midpointDisplace(top, bottom, depth, jitter, out) {
  if (depth <= 0) {
    out.push(bottom);
    return;
  }
  const mid = top.clone().lerp(bottom, 0.5);
  mid.x += (Math.random() - 0.5) * jitter;
  mid.z += (Math.random() - 0.5) * jitter;
  _midpointDisplace(top, mid, depth - 1, jitter * 0.55, out);
  _midpointDisplace(mid, bottom, depth - 1, jitter * 0.55, out);
}

function _generateBoltPoints(strikeX, strikeZ) {
  const top = new THREE.Vector3(strikeX, BOLT_TOP_Y, strikeZ);
  const bottom = new THREE.Vector3(strikeX, 0, strikeZ);
  const points = [top];
  _midpointDisplace(top, bottom, 4, 1.1, points);
  return points;
}

function _makeTubeMesh(radius, color, opacity) {
  // Géométrie placeholder (segment vertical) — remplacée à chaque frappe via _restrokeBolt().
  const placeholderCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0)]);
  const geometry = new THREE.TubeGeometry(placeholderCurve, 8, radius, 5, false);
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.visible = false;
  mesh.frustumCulled = false;
  mesh.userData.skipPaletteHarmony = true;
  return mesh;
}

function _restrokeBolt(bolt, points) {
  const curve = new THREE.CatmullRomCurve3(points);
  const tubularSegments = Math.max(8, points.length * 4);
  bolt.core.geometry.dispose();
  bolt.core.geometry = new THREE.TubeGeometry(curve, tubularSegments, CORE_RADIUS, 5, false);
  bolt.halo.geometry.dispose();
  bolt.halo.geometry = new THREE.TubeGeometry(curve, tubularSegments, HALO_RADIUS, 6, false);
}

export function createLightningOverlay(scene) {
  const group = new THREE.Group();
  group.name = 'hexistenz-vfx-lightning';
  scene.add(group);

  const bolts = [];
  for (let i = 0; i < BOLT_POOL_SIZE; i += 1) {
    const halo = _makeTubeMesh(HALO_RADIUS, '#8fb8ff', 0); // bleuté — dessiné en premier (derrière le cœur)
    const core = _makeTubeMesh(CORE_RADIUS, '#ffffff', 0); // blanc — cœur lumineux
    halo.name = 'hexistenz-vfx-lightning-halo'; // cf. sceneProfiler.js (_classifyMesh) pour le HUD FPS
    core.name = 'hexistenz-vfx-lightning-core';
    group.add(halo, core);
    const light = new THREE.PointLight(0xbfd4ff, 0, 16, 2);
    light.visible = false;
    scene.add(light);
    bolts.push({ core, halo, light, active: false, timer: 0 });
  }

  // Flash d'ambiance : éclaircissement bref de TOUTE la scène (pas un flash plein écran ni une
  // simple lumière ponctuelle). HemisphereLight dédiée, normalement éteinte (intensity 0),
  // pulsée par la zébrure la plus vive — ciel bleu-blanc froid, sol à peine relevé.
  const flashLight = new THREE.HemisphereLight(0xdce8ff, 0x2a3550, 0);
  flashLight.name = 'hexistenz-vfx-lightning-flash';
  scene.add(flashLight);

  return { group, bolts, flashLight, nextStrikeAt: null };
}

function _pickStrikePoint(rainCloudOverlay) {
  const anchors = rainCloudOverlay ? getRainCloudAnchors(rainCloudOverlay) : [];
  if (anchors.length === 0) return null;
  const anchor = anchors[Math.floor(Math.random() * anchors.length)];
  return { x: anchor.x + (Math.random() - 0.5) * 1.5, z: anchor.z + (Math.random() - 0.5) * 1.5 };
}

function _fireStrike(overlay, rainCloudOverlay, placedTiles, timeSeconds) {
  const strike = _pickStrikePoint(rainCloudOverlay);
  if (!strike) return;

  const bolt = overlay.bolts.find(b => !b.active) ?? overlay.bolts[0];
  const points = _generateBoltPoints(strike.x, strike.z);
  _restrokeBolt(bolt, points);
  bolt.active = true;
  bolt.timer = 0;
  bolt.core.visible = true;
  bolt.halo.visible = true;
  bolt.light.visible = true;
  bolt.light.position.set(strike.x, 1.5, strike.z);

  // Tuile touchée : world → axial → clé "q,r" → placedTile (null si la frappe tombe sur une case vide).
  const { q, r } = worldToAxial(strike.x, strike.z);
  const key = makeHexKey(q, r);
  const tile = placedTiles?.get?.(key) ?? null;
  // Intensité ∈ [0,1] : force de la frappe (à croiser avec la proba d'allumage du feu en F1).
  const intensity = 0.6 + Math.random() * 0.4;

  _notifyStrike(strike.x, strike.z, timeSeconds, { q, r, key, tile, intensity });
}

/** Intervalle entre deux éclairs (secondes), dérivé de vfxSettings.storm.frequenceEclairs (0..1). */
function _nextStrikeDelay(s) {
  const minDelay = 2.5;
  const maxDelay = 18;
  return maxDelay - s.frequenceEclairs * (maxDelay - minDelay) + Math.random() * 2;
}

export function updateLightningOverlay(overlay, environmentDirector, rainCloudOverlay, placedTiles, timeSeconds, deltaSeconds) {
  const stormActive = isEnvironmentEventActive(environmentDirector, 'storm');
  const s = getVfxSettings('storm');

  if (stormActive) {
    if (overlay.nextStrikeAt == null) overlay.nextStrikeAt = timeSeconds + _nextStrikeDelay(s);
    if (timeSeconds >= overlay.nextStrikeAt) {
      _fireStrike(overlay, rainCloudOverlay, placedTiles, timeSeconds);
      overlay.nextStrikeAt = timeSeconds + _nextStrikeDelay(s);
    }
  } else {
    overlay.nextStrikeAt = null; // le prochain orage repart sur un tirage frais
  }

  const brightness = s.luminositeEclair;
  let flashFlicker = 0; // éclaircissement d'ambiance = zébrure la plus vive de la frame

  for (const bolt of overlay.bolts) {
    if (!bolt.active) continue;
    bolt.timer += deltaSeconds;
    const t = bolt.timer / STRIKE_DURATION;
    if (t >= 1) {
      bolt.active = false;
      bolt.core.visible = false;
      bolt.halo.visible = false;
      bolt.light.visible = false;
      continue;
    }
    // Double zébrure qui décroît (pas un fondu linéaire — un éclair clignote).
    const flicker = Math.max(0, Math.sin(t * Math.PI * 5.5)) * (1 - t);
    bolt.core.material.opacity = flicker * brightness;
    bolt.halo.material.opacity = flicker * brightness * 0.55;
    bolt.light.intensity = flicker * brightness * 35;
    if (flicker > flashFlicker) flashFlicker = flicker;
  }

  // Flash d'ambiance : suit la zébrure la plus vive (0 quand aucun éclair n'est actif).
  if (overlay.flashLight) overlay.flashLight.intensity = flashFlicker * brightness * FLASH_GAIN;
}
