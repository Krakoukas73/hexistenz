
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { EDGE_ORDER, EDGE_TYPES, HEX_SIZE } from './config.js';
import { axialToWorld } from './hex.js';

const HOUSE_SMOKE_COUNT = 5;
const RABBIT_CHANCE = 0.42;

export function createBiomeLifeOverlay() {
  const group = new THREE.Group();
  group.name = 'biomeLifeOverlay';
  group.userData.entities = [];
  return group;
}

export function rebuildBiomeLifeOverlay(group, placedTiles) {
  clearGroup(group);
  group.userData.entities = [];

  for (const placedTile of placedTiles.values()) {
    EDGE_ORDER.forEach((edge, index) => {
      const type = placedTile.tile.edges[index];

      if (type === EDGE_TYPES.house) {
        const smoke = createHouseSmoke(placedTile.q, placedTile.r, index);
        group.add(smoke.group);
        group.userData.entities.push(smoke);
      }

      if (type === EDGE_TYPES.forest && Math.random() < RABBIT_CHANCE) {
        const rabbit = createRabbit(placedTile.q, placedTile.r, index);
        group.add(rabbit.group);
        group.userData.entities.push(rabbit);
      }
    });
  }
}

export function updateBiomeLifeOverlay(group, timeSeconds) {
  for (const entity of group.userData.entities ?? []) {
    if (entity.type === 'smoke') updateSmoke(entity, timeSeconds);
    if (entity.type === 'rabbit') updateRabbit(entity, timeSeconds);
  }
}

function createHouseSmoke(q, r, sectorIndex) {
  const world = getSectorWorld(q, r, sectorIndex);
  const group = new THREE.Group();
  group.position.set(world.x, 0.18, world.z);

  const puffs = [];

  for (let i = 0; i < HOUSE_SMOKE_COUNT; i++) {
    const geo = new THREE.SphereGeometry(0.045 + Math.random() * 0.03, 6, 6);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xd8d8d8,
      transparent: true,
      opacity: 0.55,
      depthWrite: false
    });

    const mesh = new THREE.Mesh(geo, mat);
    group.add(mesh);

    puffs.push({
      mesh,
      phase: i / HOUSE_SMOKE_COUNT
    });
  }

  return { type: 'smoke', group, puffs };
}

function updateSmoke(entity, timeSeconds) {
  entity.puffs.forEach((puff, i) => {
    const t = (timeSeconds * 0.22 + puff.phase) % 1;
    const rise = t * 0.42;

    puff.mesh.position.set(
      Math.sin(t * 8 + i) * 0.03,
      rise,
      Math.cos(t * 6 + i) * 0.03
    );

    const scale = 0.7 + t * 1.4;
    puff.mesh.scale.setScalar(scale);
    puff.mesh.material.opacity = (1 - t) * 0.5;
  });
}

function createRabbit(q, r, sectorIndex) {
  const world = getSectorWorld(q, r, sectorIndex);

  const group = new THREE.Group();
  group.position.set(world.x, 0.035, world.z);

  const brown = new THREE.MeshLambertMaterial({ color: 0x7a4a24 });
  const light = new THREE.MeshLambertMaterial({ color: 0xb8875a });

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), brown);
  body.scale.set(1.4, 1, 1.8);
  group.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), brown);
  head.position.set(0.08, 0.02, 0);
  group.add(head);

  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), light);
  belly.position.set(0.03, -0.01, 0.045);
  group.add(belly);

  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.08, 0.015), brown);
    ear.position.set(0.1, 0.09, side * 0.018);
    ear.rotation.z = side * 0.1;
    group.add(ear);
  }

  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 6), light);
  tail.position.set(-0.09, 0.01, 0);
  group.add(tail);

  return {
    type: 'rabbit',
    group,
    baseX: world.x,
    baseZ: world.z,
    offset: Math.random() * 10
  };
}

function updateRabbit(entity, timeSeconds) {
  const t = timeSeconds * 0.9 + entity.offset;

  entity.group.position.x = entity.baseX + Math.sin(t) * 0.08;
  entity.group.position.z = entity.baseZ + Math.cos(t * 0.8) * 0.08;
  entity.group.position.y = 0.04 + Math.abs(Math.sin(t * 4)) * 0.015;
  entity.group.rotation.y = Math.sin(t) * Math.PI;
}

function getSectorWorld(q, r, sectorIndex) {
  const center = axialToWorld(q, r);
  const angle = ((sectorIndex / 6) * Math.PI * 2) - Math.PI / 2;

  return {
    x: center.x + Math.cos(angle) * HEX_SIZE * 0.36,
    z: center.z + Math.sin(angle) * HEX_SIZE * 0.36
  };
}

function clearGroup(group) {
  while (group.children.length) {
    const child = group.children.pop();
    group.remove(child);
  }
}
