import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { HEX_SIZE } from './config.js';
import { axialToWorld, makeHexKey } from './hex.js';
import { getAllGridHexes } from './gridRegions.js';

export const SPECIAL_CELL_MIN = 1;
export const SPECIAL_CELL_MAX = 5;

const CLUSTER_TARGET_MIN = 4;
const CLUSTER_TARGET_MAX = 6;

const HEX_DIRECTIONS = [
  { q: 1, r: 0 },
  { q: 0, r: 1 },
  { q: -1, r: 1 },
  { q: -1, r: 0 },
  { q: 0, r: -1 },
  { q: 1, r: -1 }
];

export function createSpecialCells(gridRegions = null) {
  const availableHexes = getAllGridHexes(gridRegions ?? undefined);
  const availableKeys = new Set(availableHexes.map(hex => makeHexKey(hex.q, hex.r)));
  const count = Math.min(getRandomInt(SPECIAL_CELL_MIN, SPECIAL_CELL_MAX), availableHexes.length);
  const cells = new Map();

  const clusterCount = Math.min(
    count,
    getRandomInt(CLUSTER_TARGET_MIN, CLUSTER_TARGET_MAX)
  );

  const seeds = pickClusterSeeds(availableHexes, clusterCount);

  for (const seed of seeds) {
    addSpecialCell(cells, seed);
  }

  while (cells.size < count) {
    const frontier = getClusterFrontier(cells, availableKeys);
    const nextHex = frontier.length > 0
      ? weightedPick(frontier)
      : pickRandomFreeHex(availableHexes, cells);

    if (!nextHex) break;
    addSpecialCell(cells, nextHex);
  }

  return cells;
}

export function createSpecialCellsMesh(specialCells) {
  const group = new THREE.Group();
  group.name = 'special-black-cells';

  for (const cell of specialCells.values()) {
    const position = axialToWorld(cell.q, cell.r);
    const mesh = createSpecialCellMesh(cell);
    mesh.position.set(position.x, 0.02, position.z);
    group.add(mesh);
  }

  return group;
}

export function addSpecialCellMesh(group, cell) {
  if (!group || !cell) return;

  const position = axialToWorld(cell.q, cell.r);
  const mesh = createSpecialCellMesh(cell);
  mesh.position.set(position.x, 0.02, position.z);
  group.add(mesh);
}

export function removeSpecialCellMesh(group, key) {
  if (!group || !key) return;

  const mesh = group.children.find(child => child.userData?.specialCellKey === key);
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

export function updateSpecialCellsMeshAnimation(group, timeSeconds = 0) {
  if (!group) return;

  group.traverse(child => {
    const animation = child.userData?.blackCellAnimation;

    if (animation) {
      const direction = animation.direction ?? 1;
      child.rotation.y = animation.baseRotation + timeSeconds * animation.speed * direction;

      if (animation.pulse) {
        const pulse = 1 + Math.sin(timeSeconds * animation.pulseSpeed + animation.phase) * animation.pulseAmount;
        child.scale.setScalar(pulse);
      }
    }

    const particle = child.userData?.blackCellParticle;
    if (!particle) return;

    const progress = (timeSeconds * particle.speed + particle.phase) % 1;
    const radius = THREE.MathUtils.lerp(particle.outerRadius, particle.innerRadius, progress);
    const angle = particle.baseAngle + progress * particle.turns * Math.PI * 2;
    const flicker = 0.28 + Math.sin(timeSeconds * particle.flickerSpeed + particle.phase * 12) * 0.035;

    child.position.set(
      Math.cos(angle) * radius,
      particle.y,
      Math.sin(angle) * radius
    );
    child.rotation.y = -angle + timeSeconds * particle.spinSpeed;
    child.scale.setScalar(THREE.MathUtils.lerp(particle.outerScale, particle.innerScale, progress));

    if (child.material) {
      child.material.opacity = Math.max(0.06, flicker * (1 - progress * 0.28));
    }
  });
}

export function isSpecialCellAt(hex, specialCells) {
  if (!hex || !specialCells) return false;
  return specialCells.has(makeHexKey(hex.q, hex.r));
}

function createSpecialCellMesh(cell = null) {
  const group = new THREE.Group();
  if (cell?.key) group.userData.specialCellKey = cell.key;

  const fill = new THREE.Mesh(
    new THREE.CircleGeometry(HEX_SIZE * 0.98, 6),
    new THREE.MeshBasicMaterial({
      color: 0x10202a,
      side: THREE.DoubleSide
    })
  );

  fill.rotation.x = -Math.PI / 2;
  fill.position.y = 0;
  group.add(fill);

  const vortex = createBlackCellVortex();
  vortex.position.y = 0.006;
  group.add(vortex);

  return group;
}

function createBlackCellVortex() {
  const group = new THREE.Group();
  const ringCount = 10;

  for (let i = 0; i < ringCount; i += 1) {
    const radius = HEX_SIZE * (0.14 + i * 0.078);
    const thickness = HEX_SIZE * (0.014 + i * 0.0015);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(radius, radius + thickness, 64, 1, 0.05 + i * 0.38, Math.PI * 1.28),
      new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? 0x8ee6d1 : 0x3b6f88,
        transparent: true,
        opacity: 0.38 - i * 0.018,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );

    ring.geometry.rotateX(-Math.PI / 2);
    ring.rotation.y = i * 0.56;
    ring.userData.blackCellAnimation = {
      baseRotation: ring.rotation.y,
      speed: 0.18 + i * 0.026,
      direction: i % 2 === 0 ? 1 : -1
    };
    group.add(ring);
  }

  const core = new THREE.Mesh(
    new THREE.CircleGeometry(HEX_SIZE * 0.2, 40),
    new THREE.MeshBasicMaterial({
      color: 0x14313b,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      depthWrite: false
    })
  );

  core.geometry.rotateX(-Math.PI / 2);
  core.userData.blackCellAnimation = {
    baseRotation: 0,
    speed: 0.22,
    direction: 1,
    pulse: true,
    pulseSpeed: 0.85,
    pulseAmount: 0.035,
    phase: Math.random() * Math.PI * 2
  };
  group.add(core);

  const glow = new THREE.Mesh(
    new THREE.RingGeometry(HEX_SIZE * 0.2, HEX_SIZE * 0.31, 48),
    new THREE.MeshBasicMaterial({
      color: 0xb8ffe8,
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
      depthWrite: false
    })
  );

  glow.geometry.rotateX(-Math.PI / 2);
  glow.userData.blackCellAnimation = {
    baseRotation: 0,
    speed: 0.2,
    direction: -1,
    pulse: true,
    pulseSpeed: 0.72,
    pulseAmount: 0.045,
    phase: Math.random() * Math.PI * 2
  };
  group.add(glow);

  addBlackCellDebris(group);

  return group;
}

function addBlackCellDebris(group) {
  const debrisCount = 9;

  for (let i = 0; i < debrisCount; i += 1) {
    const size = HEX_SIZE * (0.025 + Math.random() * 0.035);
    const geometry = i % 3 === 0
      ? new THREE.CircleGeometry(size, 5)
      : new THREE.PlaneGeometry(size * 1.8, size * 0.65);

    geometry.rotateX(-Math.PI / 2);

    const debris = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        color: i % 4 === 0 ? 0xd7fff2 : 0x86b7ad,
        transparent: true,
        opacity: 0.18,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );

    debris.userData.blackCellParticle = {
      baseAngle: Math.random() * Math.PI * 2,
      outerRadius: HEX_SIZE * (0.76 + Math.random() * 0.18),
      innerRadius: HEX_SIZE * (0.26 + Math.random() * 0.1),
      outerScale: 0.7 + Math.random() * 0.25,
      innerScale: 0.45 + Math.random() * 0.18,
      speed: 0.055 + Math.random() * 0.04,
      turns: 0.45 + Math.random() * 0.3,
      spinSpeed: 0.22 + Math.random() * 0.32,
      flickerSpeed: 0.55 + Math.random() * 0.7,
      phase: Math.random(),
      y: 0.012 + i * 0.00025
    };

    group.add(debris);
  }
}


function pickClusterSeeds(availableHexes, clusterCount) {
  const seeds = [];
  const shuffled = availableHexes.slice();
  shuffleInPlace(shuffled);

  for (const candidate of shuffled) {
    if (seeds.length >= clusterCount) break;

    const farEnough = seeds.every(seed => getHexDistance(seed, candidate) >= 3);
    if (farEnough || seeds.length === 0) seeds.push(candidate);
  }

  for (const candidate of shuffled) {
    if (seeds.length >= clusterCount) break;

    const key = makeHexKey(candidate.q, candidate.r);
    if (!seeds.some(seed => makeHexKey(seed.q, seed.r) === key)) {
      seeds.push(candidate);
    }
  }

  return seeds;
}

function getClusterFrontier(cells, availableKeys) {
  const weighted = [];

  for (const cell of cells.values()) {
    for (const direction of HEX_DIRECTIONS) {
      const hex = { q: cell.q + direction.q, r: cell.r + direction.r };
      const key = makeHexKey(hex.q, hex.r);

      if (!availableKeys.has(key) || cells.has(key)) continue;

      const adjacentBlackCells = countAdjacentCells(hex, cells);
      const weight = Math.max(1, adjacentBlackCells);

      for (let i = 0; i < weight; i += 1) {
        weighted.push(hex);
      }
    }
  }

  return weighted;
}

function countAdjacentCells(hex, cells) {
  let count = 0;

  for (const direction of HEX_DIRECTIONS) {
    const key = makeHexKey(hex.q + direction.q, hex.r + direction.r);
    if (cells.has(key)) count += 1;
  }

  return count;
}

function pickRandomFreeHex(availableHexes, cells) {
  const freeHexes = availableHexes.filter(hex => !cells.has(makeHexKey(hex.q, hex.r)));
  if (freeHexes.length === 0) return null;
  return freeHexes[getRandomInt(0, freeHexes.length - 1)];
}

function addSpecialCell(cells, hex) {
  const key = makeHexKey(hex.q, hex.r);
  cells.set(key, { ...hex, key, isSpecialCell: true });
}

function getHexDistance(a, b) {
  return Math.max(
    Math.abs(a.q - b.q),
    Math.abs(a.r - b.r),
    Math.abs((-a.q - a.r) - (-b.q - b.r))
  );
}

function weightedPick(items) {
  return items[getRandomInt(0, items.length - 1)];
}

function getRandomInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function shuffleInPlace(items) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
}
