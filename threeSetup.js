import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

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

export function resizeRenderer(renderer, camera) {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
