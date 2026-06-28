// ocean depth color fix
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { WORLD_CURVATURE_SHADER, WORLD_CURVATURE_UNIFORMS } from './worldCurvature.js';
import { waterVertexShaderTemplate, waterFragmentShader } from './shaders/shaderEau.js';

const waterMaterials = new Set();

export function getRealisticWaterMaterial(opacity = 1) {
  const material = new THREE.ShaderMaterial({
    name: 'dorfromantik-realistic-water-material',
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity >= 1,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: opacity },
      uDeepColor: { value: new THREE.Color(0x061828) },   // bleu marine foncé — lisible après ACES ×2.0
      uShallowColor: { value: new THREE.Color(0x1a4870) }, // bleu moyen — lisible après ACES ×2.0
      uWorldCurvatureEnabled: WORLD_CURVATURE_UNIFORMS.uWorldCurvatureEnabled
    },
    // Shaders externalisés dans shaders/shaderEau.js
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

export function applyRealisticWaterPalette(palette = null) {
  const targetHex = palette?.enabled === false ? null : palette?.targets?.water;
  const rawStrength = Math.min(1, Math.max(0, Number(palette?.strength ?? 0)));
  const strength = targetHex ? Math.min(1, 0.12 + rawStrength * 2.35) : 0;

  for (const material of waterMaterials) {
    if (!material?.uniforms) continue;

    if (!targetHex || strength <= 0) {
      material.uniforms.uDeepColor.value.set(0x061828);
      material.uniforms.uShallowColor.value.set(0x1a4870);
      material.needsUpdate = true;
      continue;
    }

    const target = new THREE.Color(targetHex);
    const saturation = Number(palette.saturation ?? 1);
    const contrast = Number(palette.contrast ?? 1);
    const warmShift = Number(palette.warmShift ?? 0);

    material.uniforms.uDeepColor.value.copy(forceWaterPaletteColor(new THREE.Color(0x061828), target, strength, saturation, contrast, warmShift, 0.80));
    material.uniforms.uShallowColor.value.copy(forceWaterPaletteColor(new THREE.Color(0x1a4870), target, strength, saturation, contrast, warmShift, 0.54));
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
