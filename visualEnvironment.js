import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { applyBiomeTexturePalette } from './tileTextures.js';
import { applyRealisticWaterPalette } from './realisticWater.js';
import {
  colorGradingVertexShader, colorGradingFragmentShader,
  domeCielVertexShader,     domeCielFragmentShader
} from './shaders/shaderEnvironnement.js';

export const DEFAULT_VISUAL_ENVIRONMENT_CONFIG = {
  presetName: 'hexistenz-default',
  renderer: {
    toneMappingExposure: 2.00  // ACESFilmicToneMapping — compromis : 2.40 écrasait les sombres, 1.80 rendait les pierres bleues
  },
  environment: {
    skyColor: '#02040a',
    fogColor: '#02040a',
    fogDensity: 0.004,
    fogNear: 0,    // 0 = mode exponentiel (fogDensity). > 0 = bascule en brouillard linéaire
    fogFar: 0,     // distance (unités 3D) où le brouillard linéaire est opaque. 0 = désactivé
    domeColorTop: '#2f4b67',
    domeColorBottom: '#162638',
    domeOpacity: 0.00
  },
  lights: {
    hemisphereSkyColor: '#fff4d6',
    hemisphereGroundColor: '#8aaa8e',  // claire : sol des forêts non-noir sous ACES
    hemisphereIntensity: 0.62,          // compensé ACESFilmicToneMapping toe agressif
    sunColor: '#ffe2b0',
    sunIntensity: 2.10,
    sunOrbitEnabled: true,
    sunOrbitRadius: 10.5,
    sunOrbitHeight: 8.4,
    sunOrbitSpeed: 0.06,
    sunVisualScale: 0.78,
    fillColor: '#c4d8f0',               // légèrement plus chaud
    fillIntensity: 0.30                 // débouche les ombres profondes sous ACES
  },
  grading: {
    enabled: true,
    brightness: 0.000,
    contrast: 1.025,
    saturation: 0.96,                   // désaturation très légère (−4%)
    vibrance: 0.16,
    hue: -0.006,
    gamma: 1.035,
    blackLevel: 0.000,
    whiteLevel: 0.998,
    red: 1.03,                          // warm tint sépia subtil
    green: 1.00,
    blue: 0.97,                         // retire très légèrement le froid
    redCurve: 1.00,
    greenCurve: 1.00,
    blueCurve: 1.00,
    paletteColors: [],     // [] = désactivé ; rempli = quantification vers palette rétro
    paletteDither: 0       // 0 = pas de dithering ; > 0 = Bayer 4×4 (style CGA)
  },
  palette: {
    enabled: false, // désactivé — matching par noms GLB internes trop aléatoire → incohérences visuelles entre objets du même type
    strength: 0.31,
    saturation: 1.04,
    contrast: 1.015,
    warmShift: 0.016,
    targets: {
      field: '#d9b357',
      forest: '#456c3f',
      grass: '#78a957',
      house: '#998969',
      rail: '#c0b8a5',
      water: '#4fa0bd'
    }
  }
};

export const COLOR_GRADING_SHADER = {
  name: 'HexistenzColorGradingShader',
  uniforms: {
    tDiffuse: { value: null },
    uEnabled: { value: 1 },
    uBrightness: { value: 0 },
    uContrast: { value: 1 },
    uSaturation: { value: 1 },
    uVibrance: { value: 0 },
    uHue: { value: 0 },
    uGamma: { value: 1 },
    uBlackLevel: { value: 0 },
    uWhiteLevel: { value: 1 },
    uRgb: { value: new THREE.Vector3(1, 1, 1) },
    uRgbCurve: { value: new THREE.Vector3(1, 1, 1) },
    uPaletteSize: { value: 0 },
    uPaletteColors: { value: Array.from({ length: 40 }, () => new THREE.Vector3(2, 2, 2)) },
    uPaletteDither: { value: 0.0 },
    uPixelSize: { value: 1.0 }
  },
  // Shaders externalisés dans shaders/shaderEnvironnement.js
  vertexShader:   colorGradingVertexShader,
  fragmentShader: colorGradingFragmentShader
};


export function cloneVisualConfig(config = DEFAULT_VISUAL_ENVIRONMENT_CONFIG) {
  return JSON.parse(JSON.stringify(config));
}

export function createVisualEnvironment(scene, renderer, initialConfig = DEFAULT_VISUAL_ENVIRONMENT_CONFIG) {
  const config = cloneVisualConfig(initialConfig);
  const dome = createEnvironmentDome(config);
  dome.name = 'hexistenz-invisible-environment-dome';
  scene.add(dome);

  const environment = {
    config,
    dome,
    apply(nextConfig = null) {
      if (nextConfig) mergeDeep(config, nextConfig);
      applyEnvironment(scene, renderer, dome, config);
      applyBiomeTexturePalette(config.palette);
      applyRealisticWaterPalette(config.palette);
      applyScenePalette(scene, config.palette);
    },
    exportConfig() {
      return cloneVisualConfig(config);
    }
  };

  environment.apply();
  return environment;
}

export function applyColorGradingUniforms(pass, config = DEFAULT_VISUAL_ENVIRONMENT_CONFIG) {
  if (Array.isArray(pass)) {
    for (const item of pass) applyColorGradingUniforms(item, config);
    return;
  }
  if (!pass?.uniforms) return;
  const grading = config.grading ?? DEFAULT_VISUAL_ENVIRONMENT_CONFIG.grading;
  pass.enabled = grading.enabled !== false;
  pass.uniforms.uEnabled.value = grading.enabled === false ? 0 : 1;
  pass.uniforms.uBrightness.value = Number(grading.brightness ?? 0);
  pass.uniforms.uContrast.value = Number(grading.contrast ?? 1);
  pass.uniforms.uSaturation.value = Number(grading.saturation ?? 1);
  pass.uniforms.uVibrance.value = Number(grading.vibrance ?? 0);
  pass.uniforms.uHue.value = Number(grading.hue ?? 0);
  pass.uniforms.uGamma.value = Number(grading.gamma ?? 1);
  pass.uniforms.uBlackLevel.value = Number(grading.blackLevel ?? 0);
  pass.uniforms.uWhiteLevel.value = Number(grading.whiteLevel ?? 1);
  pass.uniforms.uRgb.value.set(Number(grading.red ?? 1), Number(grading.green ?? 1), Number(grading.blue ?? 1));
  pass.uniforms.uRgbCurve.value.set(Number(grading.redCurve ?? 1), Number(grading.greenCurve ?? 1), Number(grading.blueCurve ?? 1));

  // Palette quantization (retro modes)
  // IMPORTANT : les couleurs sont passées en sRGB brut (hex/255) — PAS via THREE.Color
  // qui convertirait en espace linéaire et fausserait les distances perceptuelles.
  const palColors = grading.paletteColors ?? [];
  const palSize = Math.min(40, palColors.length);
  pass.uniforms.uPaletteSize.value = palSize;
  for (let i = 0; i < 40; i++) {
    if (i < palSize) {
      const h = palColors[i].replace('#', '');
      const r = parseInt(h.slice(0, 2), 16) / 255;
      const g = parseInt(h.slice(2, 4), 16) / 255;
      const b = parseInt(h.slice(4, 6), 16) / 255;
      pass.uniforms.uPaletteColors.value[i].set(r, g, b);
    } else {
      pass.uniforms.uPaletteColors.value[i].set(2, 2, 2); // hors-gamme → jamais sélectionné
    }
  }
  pass.uniforms.uPaletteDither.value = Number(grading.paletteDither ?? 0);
}

export function applyEnvironment(scene, renderer, dome, config = DEFAULT_VISUAL_ENVIRONMENT_CONFIG) {
  const env = config.environment ?? DEFAULT_VISUAL_ENVIRONMENT_CONFIG.environment;
  const lights = config.lights ?? DEFAULT_VISUAL_ENVIRONMENT_CONFIG.lights;

  scene.background = new THREE.Color(env.skyColor ?? '#02040a');
  const _fogColor = new THREE.Color(env.fogColor ?? env.skyColor ?? '#02040a');
  const _fogFar   = Number(env.fogFar  ?? 0);
  const _fogNear  = Number(env.fogNear ?? 0);
  if (_fogFar > 0) {
    // Mode brouillard linéaire : champ de vision serré avec distance début/fin
    scene.fog = new THREE.Fog(_fogColor, _fogNear, _fogFar);
  } else {
    // Mode brouillard exponentiel (défaut)
    scene.fog = new THREE.FogExp2(_fogColor, Number(env.fogDensity ?? 0.004));
  }

  if (renderer && config.renderer?.toneMappingExposure !== undefined) {
    renderer.toneMappingExposure = Number(config.renderer.toneMappingExposure);
  }

  const hemisphere = findOrCreateHemisphereLight(scene);
  hemisphere.color.set(lights.hemisphereSkyColor ?? '#fff1c4');
  hemisphere.groundColor.set(lights.hemisphereGroundColor ?? '#24465a');
  hemisphere.intensity = Number(lights.hemisphereIntensity ?? 0.34);

  const sun = findOrCreateSunLight(scene);
  sun.color.set(lights.sunColor ?? '#ffd08a');
  sun.intensity = Number(lights.sunIntensity ?? 3.15);
  sun.userData.orbit = {
    ...(sun.userData.orbit ?? {}),
    enabled: lights.sunOrbitEnabled !== false,
    radius: Number(lights.sunOrbitRadius ?? 10.5),
    height: Number(lights.sunOrbitHeight ?? 8.4),
    speed: Number(lights.sunOrbitSpeed ?? 0.06),
    visualScale: Number(lights.sunVisualScale ?? 1.18)
  };

  const target = scene.getObjectByName('main-sun-shadow-target');
  if (target) {
    // La position de la cible est tenue à jour par updateSunShadowOrbit().
    // Ne surtout pas la remettre à (0,0,0), sinon les ombres repartent du centre
    // de la grille au lieu de suivre la position courante du soleil et de la caméra.
    target.updateMatrixWorld();
    sun.target = target;
  }

  const visualSun = scene.getObjectByName('visible-sky-sun');
  if (visualSun) visualSun.visible = lights.sunOrbitEnabled !== false;

  const fill = findOrCreateFillLight(scene);
  fill.color.set(lights.fillColor ?? '#8fd2ff');
  fill.intensity = Number(lights.fillIntensity ?? 0.035);

  updateDomeMaterial(dome, env);
}

export function applyScenePalette(scene, palette = DEFAULT_VISUAL_ENVIRONMENT_CONFIG.palette) {
  if (!palette?.enabled) return;
  const strength = clamp01(Number(palette.strength ?? 0.25));
  const targets = palette.targets ?? {};

  scene.traverse(object => {
    if (!object.isMesh || !object.material || shouldSkipPaletteObject(object)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];

    for (const material of materials) {
      if (!material?.color || material.userData?.skipPaletteHarmony) continue;

      const key = inferPaletteKey(object, material);
      if (!key || !targets[key]) continue;

      if (!material.userData.hexistenzBaseColor || !(material.userData.hexistenzBaseColor instanceof THREE.Color)) {
        material.userData.hexistenzBaseColor = material.color.clone();
      }

      const base = material.userData.hexistenzBaseColor.clone();
      const target = new THREE.Color(targets[key]);
      let next = base.lerp(target, strength);

      next = adjustColor(next, palette);
      material.color.copy(next);
      material.needsUpdate = true;
    }
  });
}

function createEnvironmentDome(config) {
  const geometry = new THREE.SphereGeometry(500, 32, 16);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTopColor: { value: new THREE.Color(config.environment.domeColorTop) },
      uBottomColor: { value: new THREE.Color(config.environment.domeColorBottom) },
      uOpacity: { value: Number(config.environment.domeOpacity ?? 0) }
    },
    // Shaders externalisés dans shaders/shaderEnvironnement.js
    vertexShader:   domeCielVertexShader,
    fragmentShader: domeCielFragmentShader,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    fog: false
  });
  const dome = new THREE.Mesh(geometry, material);
  dome.renderOrder = -1000;
  dome.userData.disableCastShadow = true;
  dome.userData.disableReceiveShadow = true;
  dome.userData.disableWorldCurvature = true;
  dome.layers.set(0);
  return dome;
}

function updateDomeMaterial(dome, env) {
  if (!dome?.material?.uniforms) return;
  dome.material.uniforms.uTopColor.value.set(env.domeColorTop ?? '#263d58');
  dome.material.uniforms.uBottomColor.value.set(env.domeColorBottom ?? '#0f1b2b');
  dome.material.uniforms.uOpacity.value = Number(env.domeOpacity ?? 0);
  dome.visible = Number(env.domeOpacity ?? 0) > 0.001;
}

function findOrCreateHemisphereLight(scene) {
  let light = scene.getObjectByName('hexistenz-environment-hemisphere');
  if (!light) {
    light = new THREE.HemisphereLight(0xffffff, 0x223344, 0.3);
    light.name = 'hexistenz-environment-hemisphere';
    scene.add(light);
  }
  return light;
}

function findOrCreateSunLight(scene) {
  let light = scene.getObjectByName('main-sun-shadow-light');
  if (!light) {
    light = new THREE.DirectionalLight(0xffffff, 3);
    light.name = 'main-sun-shadow-light';
    light.castShadow = true;
    scene.add(light);
  }
  return light;
}

function findOrCreateFillLight(scene) {
  let light = scene.getObjectByName('hexistenz-environment-fill-light');
  if (!light) {
    light = new THREE.DirectionalLight(0x8fd2ff, 0.035);
    light.name = 'hexistenz-environment-fill-light';
    light.position.set(5, 4, -6);
    scene.add(light);
  }
  return light;
}

function inferPaletteKey(object, material) {
  const haystack = collectPaletteHaystack(object, material);
  if (haystack.includes('water')) return 'water';
  if (haystack.includes('forest') || haystack.includes('tree') || haystack.includes('birch')) return 'forest';
  if (haystack.includes('field') || haystack.includes('wheat') || haystack.includes('bird-flock')) return 'field';
  if (haystack.includes('grass') || haystack.includes('prairie')) return 'grass';
  if (haystack.includes('house') || haystack.includes('village') || haystack.includes('smoke')) return 'house';
  if (haystack.includes('rail') || haystack.includes('train') || haystack.includes('station')) return 'rail';
  return null;
}

function collectPaletteHaystack(object, material) {
  const parts = [object.name, material.name, object.userData?.edgeKey, object.userData?.effectKind];

  let cursor = object.parent;
  while (cursor) {
    parts.push(cursor.name, cursor.userData?.edgeKey, cursor.userData?.effectKind);
    cursor = cursor.parent;
  }

  return parts.filter(Boolean).join(' ').toLowerCase();
}

function shouldSkipPaletteObject(object) {
  let cursor = object;
  while (cursor) {
    const name = `${cursor.name ?? ''}`.toLowerCase();
    if (
      name.includes('special-black-cells') ||
      name.includes('black-cell') ||
      cursor.userData?.specialCellKey ||
      cursor.userData?.blackCellAnimation ||
      cursor.userData?.blackCellParticle
    ) {
      return true;
    }
    cursor = cursor.parent;
  }
  return false;
}

function adjustColor(color, palette) {
  const hsl = {};
  color.getHSL(hsl);
  hsl.s = clamp01(hsl.s * Number(palette.saturation ?? 1));
  hsl.l = clamp01((hsl.l - 0.5) * Number(palette.contrast ?? 1) + 0.5);
  hsl.h = (hsl.h + Number(palette.warmShift ?? 0) + 1) % 1;
  return new THREE.Color().setHSL(hsl.h, hsl.s, hsl.l);
}

function mergeDeep(target, source) {
  for (const [key, value] of Object.entries(source ?? {})) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if (!target[key] || typeof target[key] !== 'object') target[key] = {};
      mergeDeep(target[key], value);
    } else {
      target[key] = value;
    }
  }
  return target;
}

function clamp01(value) {
  return Math.min(1, Math.max(0, Number(value) || 0));
}
