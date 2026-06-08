import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { HEX_SIZE } from './config.js';

export function axialToWorld(q, r, size = HEX_SIZE) {
  return {
    x: size * 1.5 * q,
    y: 0,
    z: size * Math.sqrt(3) * (r + q / 2)
  };
}

export function worldToAxial(x, z, size = HEX_SIZE) {
  const q = (2 / 3 * x) / size;
  const r = (-1 / 3 * x + Math.sqrt(3) / 3 * z) / size;
  return roundAxial(q, r);
}

function roundAxial(q, r) {
  let x = q;
  let z = r;
  let y = -x - z;

  let rx = Math.round(x);
  let ry = Math.round(y);
  let rz = Math.round(z);

  const dx = Math.abs(rx - x);
  const dy = Math.abs(ry - y);
  const dz = Math.abs(rz - z);

  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy > dz) ry = -rx - rz;
  else rz = -rx - ry;

  return { q: rx, r: rz };
}

export function makeHexKey(q, r) {
  return `${q},${r}`;
}

export function createHexFill(color, opacity = 0.35) {
  const shape = new THREE.Shape();

  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i;
    const x = Math.cos(angle) * HEX_SIZE;
    const z = Math.sin(angle) * HEX_SIZE;
    if (i === 0) shape.moveTo(x, z);
    else shape.lineTo(x, z);
  }

  shape.closePath();

  const mesh = new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false
    })
  );

  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}
