// ─── railTrackGlb.js — rails.glb : chargement + instanciation le long du chemin ────
// Extrait de railTrainOverlay.js le 2026-07-11 (découpage sans risque, cf. CONTEXT.md §21) :
// charge le segment de rail GLB, le normalise (centrage, axe +Z), puis réplique des
// instances le long d'un chemin lissé (même chemin que le train pour un alignement parfait).
// NOTE : la fonction `addAllRailGLBInstances` de l'ancien railTrainOverlay.js (placement des
// rails GLB tuile par tuile, indépendamment du chemin lissé) n'était appelée nulle part
// (confirmé par grep sur tout le dépôt) — code mort, non repris ici lors du découpage.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { createGLTFLoader } from './glbLoader.js';
import { HEX_SIZE, TILE_VISUAL } from './config.js';
import { measurePath, getPointAtMotionDistance, resampleMotionPath } from './railGraph.js';
import { TRAIN_Y, MOTION_SAMPLE_SPACING } from './railTrainConstants.js';

// ── rails.glb — portion de rail droite à répliquer sur le chemin ──
const TRAIN_TRACK_URL = './glb/trains/rails.glb';
let trackGlbProto     = null;   // THREE.Group prototype clonable, orienté +Z
let trackGlbLength    = 0;      // longueur en world-units d'un segment de rail
let trackGlbReady     = false;
let trackGlbLoading   = false;

export function isTrackGlbReady() {
  return trackGlbReady && !!trackGlbProto && trackGlbLength > 0;
}

export function ensureTrackGlb(group) {
  if (trackGlbLoading || trackGlbReady) return;
  trackGlbLoading = true;

  createGLTFLoader().load(TRAIN_TRACK_URL, gltf => {
    const scene = gltf.scene;
    scene.updateMatrixWorld(true);

    const box  = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();
    box.getSize(size);

    // Direction principale du rail : l'axe le plus long
    const isXLonger = size.x > size.z * 1.1;

    // Rotation AVANT centrage — si on centre avant, l'offset (-cx, 0, -cz) est en coords
    // pré-rotation et se retrouve tourné par chaque instance → rails à côté du chemin
    if (isXLonger) scene.rotation.y = Math.PI / 2;

    // Re-mesurer la bbox APRÈS rotation pour un centrage correct
    scene.updateMatrixWorld(true);
    const box2    = new THREE.Box3().setFromObject(scene);
    const size2   = new THREE.Vector3();
    box2.getSize(size2);
    const center2 = new THREE.Vector3();
    box2.getCenter(center2);

    // Centrer APRÈS rotation → centre visuel à (0,0,0) du wrapper quelle que soit l'instance
    scene.position.set(-center2.x, -box2.min.y, -center2.z);

    // Longueur du segment = Z après rotation (direction de voyage +Z des instances)
    trackGlbLength = Math.max(size2.z, 0.001);

    const wrapper = new THREE.Group();
    wrapper.name = 'train-track-proto';
    wrapper.add(scene);

    wrapper.traverse(obj => {
      if (!obj.isMesh) return;
      obj.castShadow  = false;
      obj.receiveShadow = true;
      obj.userData.disableCastShadow  = true;
      obj.userData.shadowFlagsApplied = true;
      // Protéger les matériaux GLB : ne pas les disposer dans clearGroup
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach(m => { if (m) m.userData.glbPrototype = true; });
    });

    // Segments courts = courbes plus lisses (+15% taille → moins de segments, GLB plus lisible)
    const TARGET_SEGMENT = HEX_SIZE * 0.07 * 1.15 * 1.12 * 1.17 * 1.06 * 1.13; // +12% +17% rails +6% +13%
    const segScale = TARGET_SEGMENT / Math.max(trackGlbLength, 0.001);
    wrapper.scale.setScalar(segScale);
    trackGlbLength = TARGET_SEGMENT;

    trackGlbProto   = wrapper;
    trackGlbReady   = true;
    trackGlbLoading = false;
    console.debug(`[track-glb] Chargé — brut: ${(isXLonger ? size.x : size.z).toFixed(4)} → segment: ${TARGET_SEGMENT.toFixed(4)} (scale=${segScale.toFixed(4)}, axe ${isXLonger ? 'X→Z' : 'Z'})`);
    if (group?.userData?.lastPlacedTiles) group.userData.pendingModelRebuild = true;
  }, undefined, err => {
    console.warn('[track-glb] Erreur chargement GLB', err);
    trackGlbLoading = false;
  });
}

export function addTrackGLBToGroup(group, worldPoints, closed = false) {
  if (worldPoints.length < 2) return 0;

  const sampled = resampleMotionPath(worldPoints, MOTION_SAMPLE_SPACING * 0.5);
  const length  = measurePath(sampled);
  if (length <= HEX_SIZE * 0.04 || trackGlbLength <= 0) return 0;

  const segLen  = Math.max(trackGlbLength, HEX_SIZE * 0.02);
  const count   = Math.max(1, Math.round(length / segLen));
  const spacing = length / count;

  // Le fond du rail (y=0 du wrapper, via -box.min.y) doit être sur la surface du biome rail.
  // TILE_VISUAL.railY = surface rail = -0.043 (valeur réelle mesurée en console).
  const RAIL_SURFACE_Y = TILE_VISUAL.railY ?? -0.043;

  for (let i = 0; i < count; i++) {
    const dist    = closed ? (i / count) * length : (i + 0.5) * spacing;
    const pos     = getPointAtMotionDistance(sampled, dist);
    const tangent = getTrackTangentAt(sampled, dist, length);

    const instance = trackGlbProto.clone(true);
    instance.position.copy(pos);
    instance.position.y = TRAIN_Y; // même hauteur que les trains/wagons
    instance.rotation.y = Math.atan2(tangent.x, tangent.z);
    group.add(instance);
  }

  return count;
}

function getTrackTangentAt(points, dist, totalLength) {
  const delta  = Math.min(HEX_SIZE * 0.018, totalLength * 0.05);
  const before = getPointAtMotionDistance(points, Math.max(0, dist - delta));
  const after  = getPointAtMotionDistance(points, Math.min(totalLength, dist + delta));
  const t      = after.clone().sub(before);
  if (t.lengthSq() <= 1e-10) return new THREE.Vector3(0, 0, 1);
  return t.normalize();
}
