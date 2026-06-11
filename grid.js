import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { GRID_RADIUS, HEX_SIZE } from './config.js';
import { axialToWorld } from './hex.js';

export function createGrid() {
  const group = new THREE.Group();
  const material = new THREE.LineBasicMaterial({ color: 0x2a3440 });

  for (let q = -GRID_RADIUS; q <= GRID_RADIUS; q++) {
    for (let r = -GRID_RADIUS; r <= GRID_RADIUS; r++) {
      if (!isGridHex(q, r)) continue;
      const { x, y, z } = axialToWorld(q, r);
      group.add(createHexWire(x, y, z, material));
    }
  }

  return group;
}

function isGridHex(q, r) {
  return Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r)) <= GRID_RADIUS;
}

function createHexWire(x, y, z, material) {
  const points = [];

  for (let i = 0; i <= 6; i++) {
    const angle = (Math.PI / 3) * i;
    points.push(new THREE.Vector3(
      x + HEX_SIZE * Math.cos(angle),
      y,
      z + HEX_SIZE * Math.sin(angle)
    ));
  }

  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  return new THREE.Line(geometry, material);
}
