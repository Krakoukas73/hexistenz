import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { GRID_RADIUS, HEX_SIZE } from './config.js';
import { axialToWorld, makeHexKey } from './hex.js';

export const SPECIAL_CELL_MIN = 5;
export const SPECIAL_CELL_MAX = 30;

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

export function createSpecialCells() {
  const availableHexes = getAllGridHexes();
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
    const mesh = createSpecialCellMesh();
    mesh.position.set(position.x, 0.02, position.z);
    group.add(mesh);
  }

  return group;
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
    const flicker = 0.45 + Math.sin(timeSeconds * particle.flickerSpeed + particle.phase * 12) * 0.18;

    child.position.set(
      Math.cos(angle) * radius,
      particle.y,
      Math.sin(angle) * radius
    );
    child.rotation.y = -angle + timeSeconds * particle.spinSpeed;
    child.scale.setScalar(THREE.MathUtils.lerp(particle.outerScale, particle.innerScale, progress));

    if (child.material) {
      child.material.opacity = Math.max(0.08, flicker * (1 - progress * 0.55));
    }
  });
}

export function isSpecialCellAt(hex, specialCells) {
  if (!hex || !specialCells) return false;
  return specialCells.has(makeHexKey(hex.q, hex.r));
}

function createSpecialCellMesh() {
  const group = new THREE.Group();

  const fill = new THREE.Mesh(
    new THREE.CircleGeometry(HEX_SIZE * 0.98, 6),
    new THREE.MeshBasicMaterial({
      color: 0x000000,
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
  const ringCount = 9;

  for (let i = 0; i < ringCount; i += 1) {
    const radius = HEX_SIZE * (0.12 + i * 0.085);
    const thickness = HEX_SIZE * (0.018 + i * 0.002);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(radius, radius + thickness, 64, 1, 0.05 + i * 0.38, Math.PI * 1.42),
      new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? 0xbdbdbd : 0x2b2b2b,
        transparent: true,
        opacity: 0.92 - i * 0.055,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );

    ring.geometry.rotateX(-Math.PI / 2);
    ring.rotation.y = i * 0.56;
    ring.userData.blackCellAnimation = {
      baseRotation: ring.rotation.y,
      speed: 2.45 + i * 0.32,
      direction: i % 2 === 0 ? 1 : -1
    };
    group.add(ring);
  }

  const core = new THREE.Mesh(
    new THREE.CircleGeometry(HEX_SIZE * 0.2, 40),
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 1,
      side: THREE.DoubleSide,
      depthWrite: false
    })
  );

  core.geometry.rotateX(-Math.PI / 2);
  core.userData.blackCellAnimation = {
    baseRotation: 0,
    speed: 4.4,
    direction: 1,
    pulse: true,
    pulseSpeed: 6.4,
    pulseAmount: 0.18,
    phase: Math.random() * Math.PI * 2
  };
  group.add(core);

  const glow = new THREE.Mesh(
    new THREE.RingGeometry(HEX_SIZE * 0.2, HEX_SIZE * 0.31, 48),
    new THREE.MeshBasicMaterial({
      color: 0xf2f2f2,
      transparent: true,
      opacity: 0.48,
      side: THREE.DoubleSide,
      depthWrite: false
    })
  );

  glow.geometry.rotateX(-Math.PI / 2);
  glow.userData.blackCellAnimation = {
    baseRotation: 0,
    speed: 5.2,
    direction: -1,
    pulse: true,
    pulseSpeed: 7.6,
    pulseAmount: 0.25,
    phase: Math.random() * Math.PI * 2
  };
  group.add(glow);

  addBlackCellDebris(group);

  return group;
}

function addBlackCellDebris(group) {
  const debrisCount = 18;

  for (let i = 0; i < debrisCount; i += 1) {
    const size = HEX_SIZE * (0.025 + Math.random() * 0.035);
    const geometry = i % 3 === 0
      ? new THREE.CircleGeometry(size, 5)
      : new THREE.PlaneGeometry(size * 1.8, size * 0.65);

    geometry.rotateX(-Math.PI / 2);

    const debris = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        color: i % 4 === 0 ? 0xffffff : 0x9f9f9f,
        transparent: true,
        opacity: 0.42,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );

    debris.userData.blackCellParticle = {
      baseAngle: Math.random() * Math.PI * 2,
      outerRadius: HEX_SIZE * (1.08 + Math.random() * 0.55),
      innerRadius: HEX_SIZE * (0.1 + Math.random() * 0.12),
      outerScale: 0.95 + Math.random() * 0.35,
      innerScale: 0.2 + Math.random() * 0.25,
      speed: 0.55 + Math.random() * 0.55,
      turns: 1.15 + Math.random() * 1.2,
      spinSpeed: 4 + Math.random() * 5,
      flickerSpeed: 7 + Math.random() * 7,
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

function getAllGridHexes() {
  const hexes = [];

  for (let q = -GRID_RADIUS; q <= GRID_RADIUS; q += 1) {
    for (let r = -GRID_RADIUS; r <= GRID_RADIUS; r += 1) {
      if (Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r)) <= GRID_RADIUS) {
        hexes.push({ q, r });
      }
    }
  }

  return hexes;
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
