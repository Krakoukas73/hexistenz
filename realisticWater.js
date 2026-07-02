// Eau « cute cartoon » — matériau ShaderMaterial unique partagé par la nappe.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { WORLD_CURVATURE_SHADER, WORLD_CURVATURE_UNIFORMS } from './worldCurvature.js';
import { WATER_RENDER } from './config.js';
import { waterVertexShaderTemplate, waterFragmentShader } from './shaders/shaderEau.js';

const waterMaterials = new Set();

const DEEP_HEX    = WATER_RENDER.deepColor;
const SHALLOW_HEX = WATER_RENDER.shallowColor;

export function getRealisticWaterMaterial(opacity = WATER_RENDER.opacity) {
  const material = new THREE.ShaderMaterial({
    name: 'dorfromantik-cute-water-material',
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: opacity },
      uDeepColor:    { value: new THREE.Color(DEEP_HEX) },
      uShallowColor: { value: new THREE.Color(SHALLOW_HEX) },
      uFoamColor:    { value: new THREE.Color(WATER_RENDER.foamColor) },
      uSkyColor:     { value: new THREE.Color(WATER_RENDER.skyColor) },
      uFoamWidth:    { value: WATER_RENDER.foamWidth },
      uFoamScale:    { value: WATER_RENDER.foamScale },
      uFoamDensity:  { value: WATER_RENDER.foamDensity },
      uFoamAmbient:  { value: WATER_RENDER.foamAmbient },
      uFoamSharp:    { value: WATER_RENDER.foamSharp },
      uFoamSpeed:    { value: WATER_RENDER.foamSpeed },
      uDeepDistance: { value: WATER_RENDER.deepDistance },
      uWorldCurvatureEnabled: WORLD_CURVATURE_UNIFORMS.uWorldCurvatureEnabled
    },
    vertexShader:   waterVertexShaderTemplate(WORLD_CURVATURE_SHADER),
    fragmentShader: waterFragmentShader
  });

  material.userData.isRealisticWater = true;
  waterMaterials.add(material);
  return material;
}

export function updateRealisticWater(timeSeconds = 0) {
  for (const material of waterMaterials) {
    material.uniforms.uTime.value = timeSeconds;
  }
}

// Ripple system removed — kept as no-op for backward compat with scene.js
export function triggerRealisticWaterRipple() {}

// ── Réglages live (sliders debug) ────────────────────────────────────────────
const _foamKeys = ['foamWidth', 'foamScale', 'foamDensity', 'foamAmbient', 'foamSharp', 'foamSpeed', 'deepDistance', 'opacity'];
const _uniformByKey = {
  foamWidth: 'uFoamWidth', foamScale: 'uFoamScale', foamDensity: 'uFoamDensity',
  foamAmbient: 'uFoamAmbient', foamSharp: 'uFoamSharp', foamSpeed: 'uFoamSpeed',
  deepDistance: 'uDeepDistance', opacity: 'uOpacity'
};
const _waterFoam = Object.fromEntries(_foamKeys.map(k => [k, WATER_RENDER[k]]));

export function getWaterFoamParams() { return { ..._waterFoam }; }

export function setWaterFoamParams(partial = {}) {
  for (const k of _foamKeys) {
    if (partial[k] == null) continue;
    _waterFoam[k] = Number(partial[k]);
    const u = _uniformByKey[k];
    for (const m of waterMaterials) if (m.uniforms?.[u]) m.uniforms[u].value = _waterFoam[k];
  }
}

export function applyRealisticWaterPalette(palette = null) {
  const targetHex = palette?.enabled === false ? null : palette?.targets?.water;
  const rawStrength = Math.min(1, Math.max(0, Number(palette?.strength ?? 0)));
  const strength = targetHex ? Math.min(1, 0.12 + rawStrength * 2.35) : 0;

  for (const material of waterMaterials) {
    if (!material?.uniforms) continue;

    if (!targetHex || strength <= 0) {
      material.uniforms.uDeepColor.value.set(DEEP_HEX);
      material.uniforms.uShallowColor.value.set(SHALLOW_HEX);
      material.needsUpdate = true;
      continue;
    }

    const target = new THREE.Color(targetHex);
    const saturation = Number(palette.saturation ?? 1);
    const contrast = Number(palette.contrast ?? 1);
    const warmShift = Number(palette.warmShift ?? 0);

    material.uniforms.uDeepColor.value.copy(forceWaterPaletteColor(new THREE.Color(DEEP_HEX), target, strength, saturation, contrast, warmShift, 0.80));
    material.uniforms.uShallowColor.value.copy(forceWaterPaletteColor(new THREE.Color(SHALLOW_HEX), target, strength, saturation, contrast, warmShift, 0.54));
    material.needsUpdate = true;
  }
}

function forceWaterPaletteColor(base, target, strength, saturation, contrast, warmShift, mixWeight) {
  const baseHsl = {};
  const targetHsl = {};
  base.getHSL(baseHsl);
  target.getHSL(targetHsl);

  const force = Math.min(1, strength * mixWeight);
  const hue = (baseHsl.h + shortestHueDelta(baseHsl.h, targetHsl.h) * force + 1) % 1;
  const sat = Math.min(1, Math.max(0, (baseHsl.s + (Math.max(baseHsl.s, targetHsl.s) - baseHsl.s) * force) * saturation));
  const lum = Math.min(1, Math.max(0, baseHsl.l + (targetHsl.l - baseHsl.l) * force * 0.45));
  const color = new THREE.Color().setHSL(hue, sat, lum);

  color.r = (color.r - 0.5) * contrast + 0.5 + warmShift * 0.32;
  color.g = (color.g - 0.5) * contrast + 0.5 + warmShift * 0.08;
  color.b = (color.b - 0.5) * contrast + 0.5 - warmShift * 0.28;
  color.r = Math.min(1, Math.max(0, color.r));
  color.g = Math.min(1, Math.max(0, color.g));
  color.b = Math.min(1, Math.max(0, color.b));
  return color;
}

function shortestHueDelta(from, to) {
  let delta = ((to - from + 0.5) % 1) - 0.5;
  if (delta < -0.5) delta += 1;
  return delta;
}

export function isRealisticWaterMaterial(material) {
  return Boolean(material?.userData?.isRealisticWater);
}

// ── Matériau eau « plat » (LOD lointain + previews) ──────────────────────────
// Simple surface bleue fixe, sans shader (pas de vagues/écume/reflets) : utilisée
// 1) par waterSurfaceOverlay.js pour les tuiles d'eau au-delà de LOD_WATER_SHADER_DISTANCE
//    (économie GPU sur les grandes grilles — cf. updateWaterSurfaceLOD)
// 2) par tileMesh.js pour les tuiles fantômes (hover local + curseurs multijoueur
//    distants) — un aperçu n'a pas besoin du shader complet, juste d'un bleu lisible
//    (les attributs aShoreDist/aSteep du shader ne sont de toute façon pas disponibles
//    sur ces géométries).
const flatWaterMaterials = new Map();

export function getFlatWaterMaterial(opacity = WATER_RENDER.opacity) {
  const key = Math.round(THREE.MathUtils.clamp(opacity, 0, 1) * 100);
  if (flatWaterMaterials.has(key)) return flatWaterMaterials.get(key);

  const color = new THREE.Color(SHALLOW_HEX).lerp(new THREE.Color(DEEP_HEX), 0.55);
  // MeshBasicMaterial (non éclairé) et non Lambert : la nappe fusionnée
  // (waterSurfaceOverlay.js) n'a pas d'attribut 'normal' (seuls position/
  // aShoreDist/aSteep sont fournis, le shader complet n'en a pas besoin). Avec
  // un matériau Lambert, l'absence de normales produit un vecteur nul → NaN
  // après normalisation dans le vertex shader → les triangles sont clippés et
  // disparaissent purement et simplement (constaté : l'eau lointaine devenait
  // invisible au lieu de passer en bleu uni). Basic n'a besoin d'aucune normale.
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: opacity >= 1
  });
  material.name = 'water-lod-flat-material';
  flatWaterMaterials.set(key, material);
  return material;
}
