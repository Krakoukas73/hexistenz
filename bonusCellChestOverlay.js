/**
 * bonusCellChestOverlay.js — Coffre animé posé sur chaque cellule bonus.
 *
 * Le coffre (coffre.glb) est chargé une seule fois et cloné pour chaque
 * cellule bonus active. Il est placé au centre de la cellule, snappé à la
 * surface de la grille (Y = grid plane), à +60% de la taille cible.
 *
 * API publique :
 *   createBonusCellChestOverlay()                — crée le group vide + lance le chargement
 *   rebuildBonusCellChestOverlay(group, bonusCells) — reconstruit depuis une Map de bonus cells
 *   addBonusCellChest(group, cell)               — ajoute un coffre (undo)
 *   removeBonusCellChest(group, key)             — supprime un coffre (placement)
 *   updateBonusCellChestOverlay(group, elapsed)  — anime les mixers
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { createGLTFLoader } from './glbLoader.js';
import { clone as cloneSkeleton } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/utils/SkeletonUtils.js';
import { HEX_SIZE, TILE_VISUAL } from './config.js';
import { axialToWorld } from './hex.js';

// ─── Constantes ───────────────────────────────────────────────────────────────

const CHEST_GLB_URL    = './glb/decor/coffre.glb';
// Taille cible du coffre : ~20% de HEX_SIZE, puis ×1.6 (+60%)
const CHEST_TARGET_WIDTH = HEX_SIZE * 0.20 * 1.6 * 1.5 * 1.35 * 0.70; // +50% +35% −30%

// Le coffre flotte légèrement au-dessus de la grille (star / halo)
const CHEST_Y_OFFSET = 0.018;

// ─── État singleton ───────────────────────────────────────────────────────────

let chestPrototype  = null;
let chestClips      = [];
let chestLoading    = false;
let chestRequested  = false;

// ─── API publique ─────────────────────────────────────────────────────────────

export function createBonusCellChestOverlay() {
  const group = new THREE.Group();
  group.name  = 'bonus-cell-chest-overlay';
  ensureChestModel(group);
  return group;
}

export function rebuildBonusCellChestOverlay(group, bonusCells) {
  group.userData.pendingBonusCells = bonusCells;

  // Si le modèle n'est pas encore prêt, on stocke les cells et on attend le callback.
  if (!chestPrototype) return;

  clearChestGroup(group);
  for (const cell of bonusCells.values()) {
    _addChestForCell(group, cell);
  }
}

export function addBonusCellChest(group, cell) {
  if (!group || !cell) return;
  if (!chestPrototype) return; // le modèle n'est pas encore prêt, sera recréé au rebuild
  _addChestForCell(group, cell);
}

export function removeBonusCellChest(group, key) {
  if (!group || !key) return;

  const index = group.children.findIndex(child => child.userData?.bonusCellChestKey === key);
  if (index === -1) return;

  const child = group.children[index];
  group.remove(child);
  disposeChestObject(child);
}

export function updateBonusCellChestOverlay(group, elapsedSeconds) {
  if (!group) return;

  group.traverse(child => {
    const data = child.userData;
    if (!data?.mixer) return;

    const prev  = data.mixerLastTime ?? elapsedSeconds;
    const delta = Math.min(0.05, Math.max(0, elapsedSeconds - prev));
    data.mixerLastTime = elapsedSeconds;
    data.mixer.update(delta);
  });
}

// ─── LOD coffres bonus ────────────────────────────────────────────────────────

const LOD_CHEST_CULL_DISTANCE = 12.9; // −8 % (était 14)

export function updateBonusCellChestLOD(group, camera, lodFactor = 1.0) {
  if (!group) return;
  const distSq = (LOD_CHEST_CULL_DISTANCE * lodFactor) ** 2;
  for (const chest of group.children) {
    const pos = chest.position;
    const dx = pos.x - camera.position.x;
    const dz = pos.z - camera.position.z;
    chest.visible = (dx * dx + dz * dz) < distSq;
  }
}

// ─── Chargement GLB ───────────────────────────────────────────────────────────

function ensureChestModel(group) {
  if (chestLoading || chestRequested) return;
  chestLoading   = true;
  chestRequested = true;

  createGLTFLoader().load(
    CHEST_GLB_URL,
    gltf => {
      chestPrototype = prepareChestPrototype(gltf.scene);
      chestClips     = gltf.animations ?? [];
      chestLoading   = false;

      // Rebuild différé : si des cells étaient en attente
      const pending = group.userData.pendingBonusCells;
      if (pending) rebuildBonusCellChestOverlay(group, pending);
    },
    undefined,
    error => {
      console.warn(`Modèle coffre GLB indisponible : ${CHEST_GLB_URL}`, error);
      chestLoading = false;
    }
  );
}

function prepareChestPrototype(model) {
  const wrapper = new THREE.Group();
  wrapper.name  = 'normalized-coffre-bonus-chest';

  const source = cloneSkeleton(model);

  // Forcer visible + reset scale pour GLBs animés
  source.traverse(o => {
    o.visible = true;
    if (o.scale.x === 0 && o.scale.y === 0 && o.scale.z === 0) o.scale.set(1, 1, 1);
    if (o.isSkinnedMesh && o.skeleton) o.skeleton.pose();
    if (o.isMesh && o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m) continue;
        m.visible = true;
        m.side    = THREE.DoubleSide;
        if ('emissiveIntensity' in m) m.emissiveIntensity = 0;
        if ('toneMapped' in m) m.toneMapped = true;
        m.needsUpdate = true;
      }
    }
  });

  source.updateMatrixWorld(true);

  const box  = new THREE.Box3().setFromObject(source);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  source.position.set(-center.x, -box.min.y, -center.z);
  const maxFootprint = Math.max(size.x, size.z) || 1;
  wrapper.scale.setScalar(CHEST_TARGET_WIDTH / maxFootprint);
  wrapper.add(source);

  wrapper.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow    = true;
    o.receiveShadow = true;
  });

  return wrapper;
}

// ─── Helpers privés ───────────────────────────────────────────────────────────

function getGridPlaneY() {
  // Même Y que les bonus cells (légèrement au-dessus de la grille)
  return (TILE_VISUAL.waterY ?? -0.075) - (TILE_VISUAL.waterThickness ?? 0.08) - 0.010;
}

function _addChestForCell(group, cell) {
  const proto = chestPrototype;
  if (!proto) return;

  const chest = cloneSkeleton(proto);
  chest.name  = `bonus-cell-chest-${cell.key}`;
  chest.userData.bonusCellChestKey = cell.key;

  // Animation
  if (chestClips.length > 0) {
    const mixer = new THREE.AnimationMixer(chest);
    for (const clip of chestClips) mixer.clipAction(clip).play();
    chest.userData.mixer         = mixer;
    chest.userData.mixerLastTime = null;
  }

  const pos = axialToWorld(cell.q, cell.r);
  chest.position.set(pos.x, getGridPlaneY() + CHEST_Y_OFFSET, pos.z);

  group.add(chest);
}

function clearChestGroup(group) {
  for (const child of [...group.children]) {
    group.remove(child);
    disposeChestObject(child);
  }
}

function disposeChestObject(obj) {
  obj.traverse(child => {
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) {
      child.material.forEach(m => m?.dispose?.());
    } else {
      child.material?.dispose?.();
    }
  });
}
