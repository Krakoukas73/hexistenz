// ocean depth color fix
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { WORLD_CURVATURE_SHADER, WORLD_CURVATURE_UNIFORMS } from './stable/worldCurvature.js';

const waterMaterials = new Set();
const rippleCenter = new THREE.Vector2(9999, 9999);

let rippleStartTime = -1000;
let rippleStrength = 0;

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
      uRippleCenter: { value: rippleCenter.clone() },
      uRippleStartTime: { value: rippleStartTime },
      uRippleStrength: { value: rippleStrength },
      uDeepColor: { value: new THREE.Color(0x155a8a) },
      uShallowColor: { value: new THREE.Color(0x66d7ff) },
      uReflectionColor: { value: new THREE.Color(0xf8fbff) },
      uSkyColor: { value: new THREE.Color(0x8fd7ff) },
      uWorldCurvatureEnabled: WORLD_CURVATURE_UNIFORMS.uWorldCurvatureEnabled
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      varying float vWave;
      varying float vRipple;

      uniform float uTime;
      uniform vec2 uRippleCenter;
      uniform float uRippleStartTime;
      uniform float uRippleStrength;

      ${WORLD_CURVATURE_SHADER}

      float rippleWave(vec2 p) {
        float age = max(0.0, uTime - uRippleStartTime);
        float dist = distance(p, uRippleCenter);
        float front = age * 1.85;

        // Onde de clic plus large et plus douce : pas de gros cercles cartoonesques.
        float mainFront = exp(-pow((dist - front) * 2.4, 2.0));
        float wakeFront = exp(-pow((dist - front * 0.68) * 2.0, 2.0)) * 0.45;
        float fade = exp(-age * 0.92) * smoothstep(3.7, 0.0, dist);
        float oscillation = sin((dist - front) * 8.5);
        return (mainFront + wakeFront) * oscillation * fade * uRippleStrength;
      }

      void main() {
        vec3 transformed = position;
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vec2 p = worldPos.xz;

        // Vagues spontanées plus visibles, superposées à plusieurs fréquences.
        float swellA = sin(p.x * 2.35 + p.y * 0.55 + uTime * 1.15) * 0.040;
        float swellB = cos(p.y * 3.10 - p.x * 0.45 - uTime * 1.38) * 0.032;
        float chopA = sin((p.x + p.y) * 5.25 + uTime * 2.65) * 0.018;
        float chopB = cos((p.x - p.y) * 6.70 - uTime * 2.05) * 0.015;
        float ripple = rippleWave(p) * 0.045;
        float wave = swellA + swellB + chopA + chopB + ripple;

        transformed.y += wave;
        vWave = wave;
        vRipple = ripple;
        vec4 displacedWorld = modelMatrix * vec4(transformed, 1.0);
        displacedWorld = dorfromantikApplyWorldCurvature(displacedWorld);
        vWorldPosition = displacedWorld.xyz;

        gl_Position = projectionMatrix * viewMatrix * displacedWorld;
      }
    `,
    fragmentShader: `
      varying vec3 vWorldPosition;
      varying float vWave;
      varying float vRipple;

      uniform float uTime;
      uniform float uOpacity;
      uniform vec3 uDeepColor;
      uniform vec3 uShallowColor;
      uniform vec3 uReflectionColor;
      uniform vec3 uSkyColor;

      float waveLine(vec2 p, vec2 dir, float scale, float speed) {
        return 0.5 + 0.5 * sin(dot(p, normalize(dir)) * scale + uTime * speed);
      }

      void main() {
        vec2 p = vWorldPosition.xz;
        vec3 viewDir = normalize(cameraPosition - vWorldPosition);

        // Normale procédurale approximative : donne des reflets qui bougent sans ajouter de géométrie lourde.
        float hL = sin((p.x - 0.035) * 2.35 + p.y * 0.55 + uTime * 1.15) * 0.020
                 + cos(p.y * 3.10 - (p.x - 0.035) * 0.45 - uTime * 1.38) * 0.016;
        float hR = sin((p.x + 0.035) * 2.35 + p.y * 0.55 + uTime * 1.15) * 0.020
                 + cos(p.y * 3.10 - (p.x + 0.035) * 0.45 - uTime * 1.38) * 0.016;
        float hD = sin(p.x * 2.35 + (p.y - 0.035) * 0.55 + uTime * 1.15) * 0.020
                 + cos((p.y - 0.035) * 3.10 - p.x * 0.45 - uTime * 1.38) * 0.016;
        float hU = sin(p.x * 2.35 + (p.y + 0.035) * 0.55 + uTime * 1.15) * 0.020
                 + cos((p.y + 0.035) * 3.10 - p.x * 0.45 - uTime * 1.38) * 0.016;
        vec3 normal = normalize(vec3((hL - hR) * 10.0, 1.0, (hD - hU) * 10.0));

        float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 2.6);
        // sparkle removed
        float sparkle = 0.0;

        vec3 base = mix(uDeepColor, uShallowColor, 0.46 + clamp(vWave * 6.0, -0.18, 0.24));
        vec3 skyReflection = mix(uSkyColor, uReflectionColor, fresnel);
        vec3 color = mix(base, skyReflection, 0.30 + fresnel * 0.52);

        color += vec3(0.12, 0.22, 0.28) * sparkle;
        color += vec3(0.16, 0.30, 0.34) * abs(vRipple) * 5.2;
        color = pow(color, vec3(0.88)); // rendu plus lumineux sans jaunir l'eau.

        gl_FragColor = vec4(color, uOpacity);
      }
    `
  });

  material.userData.isRealisticWater = true;
  waterMaterials.add(material);
  return material;
}

export function updateRealisticWater(timeSeconds = 0) {
  for (const material of waterMaterials) {
    material.uniforms.uTime.value = timeSeconds;
    material.uniforms.uRippleCenter.value.copy(rippleCenter);
    material.uniforms.uRippleStartTime.value = rippleStartTime;
    material.uniforms.uRippleStrength.value = rippleStrength;
  }
}

export function triggerRealisticWaterRipple(worldPoint, timeSeconds = performance.now() * 0.001) {
  if (!worldPoint) return;
  rippleCenter.set(worldPoint.x, worldPoint.z);
  rippleStartTime = timeSeconds;
  rippleStrength = 1.0;
  updateRealisticWater(timeSeconds);
}

export function applyRealisticWaterPalette(palette = null) {
  const targetHex = palette?.enabled === false ? null : palette?.targets?.water;
  const rawStrength = Math.min(1, Math.max(0, Number(palette?.strength ?? 0)));
  const strength = targetHex ? Math.min(1, 0.12 + rawStrength * 2.35) : 0;

  for (const material of waterMaterials) {
    if (!material?.uniforms) continue;

    if (!targetHex || strength <= 0) {
      material.uniforms.uDeepColor.value.set(0x155a8a);
      material.uniforms.uShallowColor.value.set(0x66d7ff);
      material.uniforms.uReflectionColor.value.set(0xf8fbff);
      material.uniforms.uSkyColor.value.set(0x8fd7ff);
      material.needsUpdate = true;
      continue;
    }

    const target = new THREE.Color(targetHex);
    const saturation = Number(palette.saturation ?? 1);
    const contrast = Number(palette.contrast ?? 1);
    const warmShift = Number(palette.warmShift ?? 0);

    material.uniforms.uDeepColor.value.copy(forceWaterPaletteColor(new THREE.Color(0x155a8a), target, strength, saturation, contrast, warmShift, 0.80));
    material.uniforms.uShallowColor.value.copy(forceWaterPaletteColor(new THREE.Color(0x66d7ff), target, strength, saturation, contrast, warmShift, 0.54));
    material.uniforms.uReflectionColor.value.copy(forceWaterPaletteColor(new THREE.Color(0xf8fbff), target, strength, saturation, contrast, warmShift, 0.20));
    material.uniforms.uSkyColor.value.copy(forceWaterPaletteColor(new THREE.Color(0x8fd7ff), target, strength, saturation, contrast, warmShift, 0.38));
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
