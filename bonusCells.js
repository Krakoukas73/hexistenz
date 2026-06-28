import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { HEX_SIZE, TILE_VISUAL } from './config.js';
import { axialToWorld, makeHexKey } from './hex.js';
import { getAllGridHexes } from './gridRegions.js';

export const BONUS_CELL_MIN = 1;
export const BONUS_CELL_MAX = 4;
export const BONUS_CELL_SCORE = 1500;

export function createBonusCells(blockedKeys = new Set(), gridRegions = null) {
  const availableHexes = getAllGridHexes(gridRegions ?? undefined).filter(hex => !blockedKeys.has(makeHexKey(hex.q, hex.r)));
  const count = Math.min(getRandomInt(BONUS_CELL_MIN, BONUS_CELL_MAX), availableHexes.length);
  const cells = new Map();
  shuffleInPlace(availableHexes);

  for (const hex of availableHexes.slice(0, count)) {
    const key = makeHexKey(hex.q, hex.r);
    cells.set(key, { q: hex.q, r: hex.r, key, score: BONUS_CELL_SCORE });
  }

  return cells;
}

export function createBonusCellsMesh(bonusCells) {
  const group = new THREE.Group();
  group.name = 'bonus-cells';

  for (const cell of bonusCells.values()) {
    const position = axialToWorld(cell.q, cell.r);
    const mesh = createBonusCellMesh(cell);
    mesh.position.set(position.x, getGridPlaneY(), position.z);
    group.add(mesh);
  }

  return group;
}

export function addBonusCellMesh(group, cell) {
  if (!group || !cell) return;

  const position = axialToWorld(cell.q, cell.r);
  const mesh = createBonusCellMesh(cell);
  mesh.position.set(position.x, getGridPlaneY(), position.z);
  group.add(mesh);
}

export function removeBonusCellMesh(group, key) {
  if (!group || !key) return;

  const mesh = group.children.find(child => child.userData?.bonusCellKey === key);
  if (!mesh) return;

  group.remove(mesh);
  mesh.traverse?.(child => {
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) {
      child.material.forEach(material => material.dispose?.());
    } else {
      child.material?.dispose?.();
    }
  });
}

export function updateBonusCellsMeshAnimation(group, timeSeconds = 0) {
  if (!group) return;

  group.traverse(child => {
    const animation = child.userData?.bonusCellAnimation;
    if (!animation) return;

    const wave = Math.sin(timeSeconds * animation.pulseSpeed + animation.phase);
    child.rotation.y = animation.baseRotation + timeSeconds * animation.speed;
    child.position.y = animation.baseY + wave * animation.floatAmount;
    child.scale.setScalar(1 + wave * animation.pulseAmount);

    if (child.material && animation.opacityBase) {
      child.material.opacity = animation.opacityBase + wave * animation.opacityPulse;
    }
  });
}


function getGridPlaneY() {
  return (TILE_VISUAL.waterY ?? -0.075) - (TILE_VISUAL.waterThickness ?? 0.08) - 0.010;
}

function createBonusCellMesh(cell = null) {
  const group = new THREE.Group();
  if (cell?.key) group.userData.bonusCellKey = cell.key;

  const base = new THREE.Mesh(
    new THREE.CircleGeometry(HEX_SIZE * 0.965, 6),
    new THREE.MeshBasicMaterial({
      color: 0xf0c84f,
      transparent: true,
      opacity: 0.62,
      side: THREE.DoubleSide,
      depthWrite: false
    })
  );
  base.geometry.rotateZ(Math.PI / 3);
  base.geometry.rotateX(-Math.PI / 2);
  base.position.y = 0;
  group.add(base);

  const halo = new THREE.Mesh(
    new THREE.RingGeometry(HEX_SIZE * 0.52, HEX_SIZE * 0.68, 72),
    new THREE.MeshBasicMaterial({
      color: 0xffd75a,
      transparent: true,
      opacity: 0.84,
      side: THREE.DoubleSide,
      depthWrite: false
    })
  );
  halo.geometry.rotateX(-Math.PI / 2);
  halo.position.y = 0.004;
  halo.userData.bonusCellAnimation = {
    baseRotation: Math.random() * Math.PI * 2,
    speed: 0.12,
    pulseSpeed: 0.55,
    pulseAmount: 0.035,
    floatAmount: 0,
    baseY: halo.position.y,
    phase: Math.random() * Math.PI * 2,
    opacityBase: 0.58,
    opacityPulse: 0.10
  };
  group.add(halo);

  const star = new THREE.Mesh(
    createStarGeometry(HEX_SIZE * 0.34, HEX_SIZE * 0.16, 5),
    new THREE.MeshBasicMaterial({
      color: 0xffef9f,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
      depthWrite: false
    })
  );
  star.geometry.rotateX(-Math.PI / 2);
  star.position.y = 0.011;
  star.userData.bonusCellAnimation = {
    baseRotation: Math.random() * Math.PI * 2,
    speed: -0.07,
    pulseSpeed: 0.5,
    pulseAmount: 0.035,
    floatAmount: 0,
    baseY: star.position.y,
    phase: Math.random() * Math.PI * 2,
    opacityBase: 0.72,
    opacityPulse: 0.06
  };
  group.add(star);


  return group;
}

function createStarGeometry(outerRadius, innerRadius, points) {
  const shape = new THREE.Shape();
  for (let i = 0; i < points * 2; i += 1) {
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const angle = -Math.PI / 2 + i * Math.PI / points;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffleInPlace(items) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}
