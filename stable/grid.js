import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { GRID_RADIUS, HEX_SIZE, TILE_VISUAL } from '../config.js';
import { axialToWorld } from './hex.js';

export function createGrid() {
  const group = new THREE.Group();
  group.name = 'placement-grid';
  const material = new THREE.LineBasicMaterial({ color: 0x141b22, transparent: true, opacity: 0.18 });
  const fillMaterial = new THREE.MeshBasicMaterial({
    color: 0x10161c,
    transparent: true,
    opacity: 0.08,
    depthWrite: false,
    side: THREE.DoubleSide
  });

  for (let q = -GRID_RADIUS; q <= GRID_RADIUS; q++) {
    for (let r = -GRID_RADIUS; r <= GRID_RADIUS; r++) {
      if (!isGridHex(q, r)) continue;
      const { x, z } = axialToWorld(q, r);
      const gridY = (TILE_VISUAL.waterY ?? -0.075) - (TILE_VISUAL.waterThickness ?? 0.08) - 0.012;
      const fill = createHexFill(x, gridY - 0.002, z, fillMaterial.clone(), q, r);
      const wire = createHexWire(x, gridY, z, material.clone(), q, r);
      group.add(fill, wire);
    }
  }

  return group;
}

function isGridHex(q, r) {
  return Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r)) <= GRID_RADIUS;
}

function createHexWire(x, y, z, material, q, r) {
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
  const line = new THREE.Line(geometry, material);
  line.userData = { gridCell: true, gridWire: true, q, r };
  return line;
}

function createHexFill(x, y, z, material, q, r) {
  const geometry = new THREE.CircleGeometry(HEX_SIZE * 0.965, 6);
  // Rotate in 2D before laying the fill flat on the grid; doing Z after X tilts the mesh.
  geometry.rotateZ(Math.PI / 3);
  geometry.rotateX(-Math.PI / 2);

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.renderOrder = -20;
  mesh.userData = { gridCell: true, gridFill: true, q, r };
  return mesh;
}

export function updateGridAvailability(gridGroup, placedTiles, currentTile, specialCells, getValidation) {
  if (!gridGroup || typeof getValidation !== 'function') return;

  gridGroup.children.forEach(child => {
    if (!child.userData?.gridCell) return;

    const q = child.userData.q;
    const r = child.userData.r;
    const key = `${q},${r}`;

    if (placedTiles.has(key)) {
      child.visible = false;
      return;
    }

    child.visible = true;
    const validation = currentTile ? getValidation({ q, r }, placedTiles, currentTile, specialCells) : { valid: false };
    const valid = Boolean(validation.valid);

    if (child.userData.gridFill) {
      child.material.color.setHex(valid ? 0x7fc7b7 : 0x070d13);
      child.material.opacity = valid ? 0.20 : 0.105;
    } else if (child.userData.gridWire) {
      child.material.color.setHex(valid ? 0xb6eee0 : 0x3a4652);
      child.material.opacity = valid ? 0.50 : 0.34;
    }
  });
}
