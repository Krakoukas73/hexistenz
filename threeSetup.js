import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { EffectComposer } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPixelatedPass } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/RenderPixelatedPass.js';
import { OutputPass } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/OutputPass.js';

export const WORLD_LAYER = 0;
export const TEXT_LAYER = 1;

// Initialisation Three.js isolée pour garder scene.js centré sur la logique de jeu.
export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.LinearToneMapping;
  renderer.toneMappingExposure = 1.38;
  return renderer;
}

export function createThreeScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x102033);
  scene.fog = new THREE.FogExp2(0x102033, 0.028);

  // Éclairage doux pour les modèles GLB : assez pour lire les couleurs,
  // pas assez pour transformer les arbres en néons nucléaires.
  scene.add(new THREE.HemisphereLight(0xfff4d8, 0x173b52, 1.08));

  const sun = new THREE.DirectionalLight(0xffc77f, 1.42);
  sun.position.set(5, 8, 2.5);
  scene.add(sun);

  const softFill = new THREE.DirectionalLight(0x8fd2ff, 0.36);
  softFill.position.set(-5, 3, -4);
  scene.add(softFill);

  return scene;
}

export function createCamera() {
  return new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
}

export function createPixelPostprocess(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(window.devicePixelRatio);
  composer.setSize(window.innerWidth, window.innerHeight);

  const settings = {
    enabled: true,
    pixelSize: 2,
    normalEdgeStrength: 0.20,
    depthEdgeStrength: 0.25
  };

  const pixelPass = new RenderPixelatedPass(settings.pixelSize, scene, camera);
  applyPixelPassSettings(pixelPass, settings);

  composer.addPass(pixelPass);
  composer.addPass(new OutputPass());

  function renderWorldLayer() {
    camera.layers.set(WORLD_LAYER);
    renderer.autoClear = true;

    if (settings.enabled) composer.render();
    else renderer.render(scene, camera);
  }

  function renderTextLayer() {
    // Les sprites texte restent nets : ils sont rendus après le postprocess,
    // sur un layer séparé, sans fond ni brouillard pour ne pas repeindre la scène.
    camera.layers.set(TEXT_LAYER);
    scene.background = null;
    scene.fog = null;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(scene, camera);
  }

  return {
    composer,
    pixelPass,
    getSettings() {
      return { ...settings };
    },
    applySettings(nextSettings = {}) {
      settings.enabled = Boolean(nextSettings.enabled);
      settings.pixelSize = clampPixelSize(nextSettings.pixelSize ?? settings.pixelSize);
      settings.normalEdgeStrength = clamp01(nextSettings.normalEdgeStrength ?? settings.normalEdgeStrength);
      settings.depthEdgeStrength = clamp01(nextSettings.depthEdgeStrength ?? settings.depthEdgeStrength);
      applyPixelPassSettings(pixelPass, settings);
    },
    render() {
      const previousMask = camera.layers.mask;
      const previousAutoClear = renderer.autoClear;
      const previousBackground = scene.background;
      const previousFog = scene.fog;

      renderWorldLayer();
      renderTextLayer();

      scene.background = previousBackground;
      scene.fog = previousFog;
      renderer.autoClear = previousAutoClear;
      camera.layers.mask = previousMask;
    }
  };
}

function applyPixelPassSettings(pixelPass, settings) {
  pixelPass.enabled = settings.enabled;
  pixelPass.normalEdgeStrength = settings.normalEdgeStrength;
  pixelPass.depthEdgeStrength = settings.depthEdgeStrength;

  if (typeof pixelPass.setPixelSize === 'function') pixelPass.setPixelSize(settings.pixelSize);
  else pixelPass.pixelSize = settings.pixelSize;
}

function clampPixelSize(value) {
  return Math.min(10, Math.max(1, Math.round(Number(value) || 4)));
}

function clamp01(value) {
  return Math.min(1, Math.max(0, Number(value) || 0));
}

export function resizeRenderer(renderer, camera, postprocess = null) {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  postprocess?.composer?.setPixelRatio?.(window.devicePixelRatio);
  postprocess?.composer?.setSize?.(window.innerWidth, window.innerHeight);
}
