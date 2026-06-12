import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

// Initialisation Three.js isolée pour garder scene.js centré sur la logique de jeu.
export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  return renderer;
}

export function createThreeScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0f14);

  // Éclairage doux pour les modèles GLB : assez pour lire les couleurs,
  // pas assez pour transformer les arbres en néons nucléaires.
  scene.add(new THREE.HemisphereLight(0xdfefff, 0x202815, 0.95));

  const sun = new THREE.DirectionalLight(0xffffff, 0.85);
  sun.position.set(4, 7, 3);
  scene.add(sun);

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
