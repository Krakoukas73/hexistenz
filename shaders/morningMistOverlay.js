/**
 * morningMistOverlay.js — Brume matinale : nappe de bruit procédural (FBM)
 * qui dérive ET ondule doucement au ras du sol (un peu comme l'eau —
 * shaderWater.js), PAS des particules/sprites individuels.
 *
 * Historique (2026-07-08) : la 1ère version (VFXParticles, sphères
 * translucides) ne donnait jamais un aspect vapeur/brume convaincant quel
 * que soit le réglage taille/nombre — ça reste des "boules" visibles. Passage
 * à un plan à bruit continu. La 2e version (deux plans empilés, réglage
 * "hauteur" pour l'écart entre eux) a été jugée inutile — retirée : un seul
 * plan, dont la hauteur ondule dans le vertex shader (bruit + temps, comme
 * le clapot de shaderWater.js) pour un aspect irrégulier et animé en XYZ
 * (dérive horizontale du bruit + ondulation verticale), au lieu d'une
 * altitude parfaitement plate.
 *
 * Coût : 1 draw call, pas de raymarch (cf. smokeVolumePass.js, désactivé
 * car 94% du GPU à lui seul — cf. mémoire perf du projet — on NE reproduit
 * PAS cette erreur ici).
 *
 * Courbure du monde (mode "bouliste", worldCurvature.js) : gérée à la main
 * dans le vertex shader, sur le même modèle que applyWorldCurvatureToMaterial
 * (threeSetup.js) — ce système auto ignore les ShaderMaterial custom, donc il
 * faut le faire soi-même ici. uWorldCurvatureEnabled partage la RÉFÉRENCE de
 * WORLD_CURVATURE_UNIFORMS (pas une copie) pour rester synchronisé avec le
 * reste du jeu si le mode plat/bouliste change en cours de partie.
 *
 * Réglages en direct (vfxSettings.js, groupe 'groundMist') :
 *   densite   — couverture du voile. Au minimum : quasi rien. Au milieu : la
 *               valeur "moyenne" d'avant. Au maximum : nappe presque pleine.
 *   compacite — netteté/opacité (0 = voile fin et diffus, 1 = nappe dense et découpée)
 *   elevation — hauteur moyenne de la nappe par rapport au sol (le relief
 *               réel ondule autour de cette valeur, ce n'est pas un plafond plat)
 *
 * Intégration dans scene.js :
 *   import { createMorningMistOverlay, updateMorningMist } from './shaders/morningMistOverlay.js';
 *   const morningMistOverlay = createMorningMistOverlay(scene);
 *   // dans animate() :
 *   updateMorningMist(morningMistOverlay, environmentDirector, timeSeconds, deltaSeconds);
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { getEnvironmentEventFade, isEnvironmentEventActive } from '../environmentDirector.js';
import { getVfxSettings, onVfxSettingsChange } from '../vfxSettings.js';
import { VFX_WORLD_RADIUS } from '../variables.js';
import { WORLD_CURVATURE_SHADER, WORLD_CURVATURE_UNIFORMS } from '../worldCurvature.js';

const MIST_EVENT_ID = 'morningMist';
const MIST_NAME = 'hexistenz-vfx-ground-mist';
const PLANE_SIZE = (VFX_WORLD_RADIUS + 6) * 2;
const PLANE_SEGMENTS = 40; // assez fin pour l'ondulation ET la courbure du monde sans facettage visible

// Bruit de valeur partagé vertex+fragment (GLSL n'a pas d'include entre étages
// sans passer par des chunks THREE — on le colle tel quel dans les deux shaders).
const NOISE_GLSL = `
  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float valueNoise2D(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash12(i);
    float b = hash12(i + vec2(1.0, 0.0));
    float c = hash12(i + vec2(0.0, 1.0));
    float d = hash12(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 4; i++) {
      v += amp * valueNoise2D(p);
      p *= 2.03;
      amp *= 0.5;
    }
    return v;
  }
`;

const VERTEX_SHADER = /* glsl */ `
  ${WORLD_CURVATURE_SHADER}
  ${NOISE_GLSL}
  uniform float uTime;
  uniform float uSeed;
  varying vec2 vWorldXZ;
  void main() {
    // Ondulation verticale irrégulière (pas un plafond plat) — même principe que
    // le clapot de l'eau (shaderWater.js) : bruit + temps, pas une simple sinusoïde.
    float n1 = valueNoise2D(position.xz * 0.12 + uSeed + uTime * 0.035);
    float n2 = valueNoise2D(position.xz * 0.29 - uSeed * 1.7 - uTime * 0.021);
    float bob = (n1 - 0.5) * 0.5 + (n2 - 0.5) * 0.22;

    vec3 displaced = position + vec3(0.0, bob, 0.0);
    vec4 worldPosition = modelMatrix * vec4(displaced, 1.0);
    vWorldXZ = worldPosition.xz;
    worldPosition = dorfromantikApplyWorldCurvature(worldPosition);
    vec4 mvPosition = viewMatrix * worldPosition;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  ${NOISE_GLSL}
  uniform float uTime;
  uniform float uOpacity;
  uniform float uDensite;
  uniform float uCompacite;
  uniform float uWorldRadius;
  uniform float uSeed;
  uniform vec3 uColor;

  varying vec2 vWorldXZ;

  void main() {
    vec2 p = vWorldXZ * 0.22 + uSeed;
    vec2 driftA = p + vec2(uTime * 0.018, uTime * 0.012);
    vec2 driftB = p * 1.7 - vec2(uTime * 0.011, uTime * -0.016);
    float n = fbm(driftA) * 0.6 + fbm(driftB) * 0.4;

    // Variation à grande échelle et lente : sans ça, le seuil est constant partout
    // et la nappe a un aspect uniforme (même "texture" répétée partout). Avec, des
    // zones entières sont plus ou moins couvertes, comme une vraie brume inégale.
    float macro = valueNoise2D(vWorldXZ * 0.045 + uSeed * 4.1 + uTime * 0.004);

    // densite=0 → quasi aucune couverture (seuil hors de portée du bruit) ;
    // densite=0.5 → couverture moyenne ; densite=1 → nappe presque pleine.
    float coverage = mix(1.05, -0.30, uDensite) + (macro - 0.5) * 0.55;
    float softness = mix(0.22, 0.05, uCompacite); // transitions plus nettes = nappe qui se sent plus "pleine/vide"
    float shape = smoothstep(coverage - softness, coverage + softness, n);

    float dist = length(vWorldXZ) / uWorldRadius;
    float edgeFade = smoothstep(1.0, 0.55, dist);

    float alpha = shape * edgeFade * uOpacity * (0.16 + uCompacite * 0.34);
    if (alpha <= 0.003) discard;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

export function createMorningMistOverlay(scene) {
  let mesh = scene.getObjectByName(MIST_NAME);
  if (mesh) return { mesh };

  const geometry = new THREE.PlaneGeometry(PLANE_SIZE, PLANE_SIZE, PLANE_SEGMENTS, PLANE_SEGMENTS);
  geometry.rotateX(-Math.PI / 2);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uDensite: { value: 0.5 },
      uCompacite: { value: 0.5 },
      uWorldRadius: { value: VFX_WORLD_RADIUS },
      uSeed: { value: 0 },
      uColor: { value: new THREE.Color('#d7dfe3') },
      uWorldCurvatureEnabled: WORLD_CURVATURE_UNIFORMS.uWorldCurvatureEnabled
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
    fog: false
  });

  mesh = new THREE.Mesh(geometry, material);
  mesh.name = MIST_NAME;
  mesh.visible = false;
  mesh.frustumCulled = false; // courbure + ondulation calculées dans le shader, comme les autres meshes courbés (threeSetup.js)
  mesh.userData.skipPaletteHarmony = true;
  scene.add(mesh);

  const overlay = { mesh };
  _applySettings(overlay, getVfxSettings('groundMist'));

  onVfxSettingsChange((effect) => {
    if (effect === 'groundMist') _applySettings(overlay, getVfxSettings('groundMist'));
  });

  return overlay;
}

function _applySettings(overlay, s) {
  overlay.mesh.position.y = s.elevation;
  overlay.mesh.material.uniforms.uDensite.value = s.densite;
  overlay.mesh.material.uniforms.uCompacite.value = s.compacite;
}

export function updateMorningMist(overlay, environmentDirector, timeSeconds, deltaSeconds) {
  const active = isEnvironmentEventActive(environmentDirector, MIST_EVENT_ID);
  const fade = active
    ? getEnvironmentEventFade(environmentDirector, MIST_EVENT_ID, timeSeconds, { fadeIn: 8, fadeOut: 10 })
    : 0;

  overlay.mesh.visible = fade > 0.001;
  overlay.mesh.material.uniforms.uTime.value = timeSeconds;
  overlay.mesh.material.uniforms.uOpacity.value = fade;
}
