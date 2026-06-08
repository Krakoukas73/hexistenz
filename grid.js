import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const HEX_SIZE = 1;
const GRID_RADIUS = 10;

/* =========================
   AXIAL -> WORLD
========================= */
export function axialToWorld(q, r) {
  const x = HEX_SIZE * 1.5 * q;
  const z = HEX_SIZE * Math.sqrt(3) * (r + q / 2);
  return { x, y: 0, z };
}

/* =========================
   GRID FACTORY
========================= */
export function createGrid() {
  const group = new THREE.Group();

  const material = new THREE.LineBasicMaterial({
    color: 0x2a3440
  });

  const radius = GRID_RADIUS;

  for (let q = -radius; q <= radius; q++) {
    for (let r = -radius; r <= radius; r++) {

      const { x, y, z } = axialToWorld(q, r);

      const hex = createHexWire(x, y, z, HEX_SIZE, material);
      group.add(hex);
    }
  }

  return group;
}

/* =========================
   HEX WIREFRAME
========================= */
function createHexWire(x, y, z, size, material) {
  const geometry = new THREE.BufferGeometry();

  const points = [];

  for (let i = 0; i <= 6; i++) {
    const angle = (Math.PI / 3) * i;

    points.push(
      new THREE.Vector3(
        x + size * Math.cos(angle),
        y,
        z + size * Math.sin(angle)
      )
    );
  }

  geometry.setFromPoints(points);

  return new THREE.Line(geometry, material);
}

/* =========================
   LABEL (désactivé)
========================= */
/*
function createLabel(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;

  const ctx = canvas.getContext('2d');

  ctx.font = 'bold 44px Arial';
  ctx.fillStyle = 'rgba(220, 240, 255, 0.85)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.shadowColor = 'rgba(80, 160, 255, 0.8)';
  ctx.shadowBlur = 12;

  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: false
  });

  const sprite = new THREE.Sprite(material);
  sprite.renderOrder = 999;

  sprite.scale.set(1.4, 0.7, 1);

  return sprite;
}
*/