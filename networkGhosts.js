import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { HEX_SIZE } from './config.js';
import { axialToWorld } from './hex.js';

const COLORS = [0x7bdff2, 0xf7a072, 0xb8f2a1, 0xff70a6, 0xf6f930, 0xcdb4db];

export function createNetworkGhosts(scene) {
  const group = new THREE.Group();
  group.name = 'network-ghost-cursors';
  const ghosts = new Map();
  scene.add(group);

  function updateCursor(message) {
    if (!message || !message.playerId || message.q == null || message.r == null) return;
    const ghost = getGhost(message.playerId, message.playerName);
    const position = axialToWorld(Number(message.q), Number(message.r));
    ghost.position.set(position.x, 0.08, position.z);
    ghost.visible = true;
    ghost.userData.lastSeen = performance.now();
  }

  function update(timeMs = performance.now()) {
    for (const ghost of ghosts.values()) {
      const age = timeMs - (ghost.userData.lastSeen || 0);
      ghost.visible = age < 3500;
      const pulse = 1 + Math.sin(timeMs * 0.006 + ghost.userData.phase) * 0.08;
      ghost.scale.setScalar(pulse);
    }
  }

  function getGhost(playerId, playerName) {
    if (ghosts.has(playerId)) return ghosts.get(playerId);
    const index = ghosts.size % COLORS.length;
    const color = COLORS[index];
    const cursor = new THREE.Group();
    cursor.userData.phase = Math.random() * Math.PI * 2;
    cursor.userData.lastSeen = 0;

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(HEX_SIZE * 0.72, HEX_SIZE * 0.82, 6),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.72, depthWrite: false, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    cursor.add(ring);

    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(HEX_SIZE * 0.11, 12, 8),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 })
    );
    dot.position.y = 0.18;
    cursor.add(dot);
    cursor.name = `ghost-${playerName || playerId}`;
    group.add(cursor);
    ghosts.set(playerId, cursor);
    return cursor;
  }

  return { updateCursor, update };
}
