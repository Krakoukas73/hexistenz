// v0.1

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { createGrid, axialToWorld } from './grid.js';
import { CameraControls } from './controls.js';

export function initScene() {

  // 💥 WAIT DOM READY
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initScene);
    return;
  }

  const canvas = document.getElementById('app');

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0f14);

  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );

  const controls = new CameraControls(camera, canvas);

  scene.add(createGrid());

  const hoverMesh = createFillHex(0x33ff66);
  const selectedMesh = createFillHex(0xff3333);

  hoverMesh.visible = false;
  selectedMesh.visible = false;

  scene.add(hoverMesh);
  scene.add(selectedMesh);

  let selectedHex = null;

  // 💥 HUD SAFE BIND
  const dbgHover = document.getElementById("dbgHover");
  // const dbgLastHover = document.getElementById("dbgLastHover");
  const dbgSelected = document.getElementById("dbgSelected");

  function safeSet(el, value) {
    if (el) el.textContent = value;
  }

  controls.onHover = (hex) => {
    const pos = axialToWorld(hex.q, hex.r);

    hoverMesh.position.set(pos.x, 0.01, pos.z);
    hoverMesh.visible = true;

    safeSet(dbgHover, `${hex.q},${hex.r}`);
    // safeSet(dbgLastHover, `${hex.q},${hex.r}`);

    if (!selectedHex ||
        selectedHex.q !== hex.q ||
        selectedHex.r !== hex.r) {
      hoverMesh.material.color.setHex(0x33ff66);
    } else {
      hoverMesh.material.color.setHex(0xff3333);
    }
  };

  controls.onClick = (hex) => {
    selectedHex = hex;

    const pos = axialToWorld(hex.q, hex.r);

    selectedMesh.position.set(pos.x, 0.02, pos.z);
    selectedMesh.visible = true;

    safeSet(dbgSelected, `${hex.q},${hex.r}`);
  };

  function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
  }

  animate();

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  function createFillHex(color) {
    const shape = new THREE.Shape();
    const size = 1;

    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i;
      const x = size * Math.cos(angle);
      const z = size * Math.sin(angle);

      if (i === 0) shape.moveTo(x, z);
      else shape.lineTo(x, z);
    }

    shape.closePath();

    const geometry = new THREE.ShapeGeometry(shape);

    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.35,
      depthWrite: false
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;

    return mesh;
  }
}