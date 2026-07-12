// ─── railTrainVehicle.js — train articulé (loco+wagons), animation, GLB train.glb ────
// Extrait de railTrainOverlay.js le 2026-07-11 (découpage sans risque, cf. CONTEXT.md §21) :
// création de l'objet train (loco + wagons + attelages articulés), animation le long du
// chemin lissé (ping-pong, ralentis virages/terminus), et chargement/normalisation de
// train.glb (loco/wagon1/wagon2).
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { createGLTFLoader } from './glbLoader.js';
import { HEX_SIZE } from './config.js';
import { smoothstep, easeInOutSine } from './tileUtils.js';
import { getWorldCurvatureDrop } from './worldCurvature.js';
import { measurePath } from './railGraph.js';
import {
  TRAIN_Y,
  TRAIN_SCALE,
  TRAIN_UNIT_SPACING,
  TRAIN_MAX_WAGONS,
  TRAIN_ROTATION_SMOOTHING,
  TRAIN_CURVE_SLOW_DISTANCE,
  TRAIN_TERMINUS_SLOW_DISTANCE
} from './railTrainConstants.js';

// ── train.glb — loco + wagon1 (ravitaillement) + wagon2 (voyageur) ──
const WOODEN_TRAIN_URL = './glb/trains/train.glb';
let woodenTrainLib     = null;   // { loco, wagon1, wagon2 } — prototypes normalisés
let woodenTrainReady   = false;
let woodenTrainLoading = false;

// ─── Position cheminée locomotive pour le pass fumée volumétrique ─────────────

/**
 * Retourne les positions monde (THREE.Vector3) des cheminées de chaque
 * locomotive active. À passer à updateSmokeVolumePass() chaque frame.
 * Appelé APRÈS updateRailTrainOverlay() pour que les positions soient à jour.
 */
export function getTrainLocoPositions(group) {
  const positions = [];
  for (const train of (group.userData.trains ?? [])) {
    if (!train.object.visible) continue;
    const units = train.object.userData.units ?? [];
    if (units.length === 0 || !units[0].object) continue;
    const loco = units[0].object;
    // Sommet de la cheminée = position loco + offset vertical (~1.16× TRAIN_SCALE)
    // + courbure monde pour aligner avec la surface visuelle courbée (GPU)
    positions.push(new THREE.Vector3(
      loco.position.x,
      loco.position.y + TRAIN_SCALE * 1.16 + getWorldCurvatureDrop(loco.position.x, loco.position.z),
      loco.position.z
    ));
  }
  return positions;
}

export function ensureWoodenTrainGlb(group) {
  if (woodenTrainLoading || woodenTrainReady) return;
  woodenTrainLoading = true;

  createGLTFLoader().load(WOODEN_TRAIN_URL, gltf => {
    woodenTrainLib    = extractTrainParts(gltf.scene);
    woodenTrainReady  = true;
    woodenTrainLoading = false;
    console.debug('[wooden-train] GLB chargé :', Object.keys(woodenTrainLib).join(', '));
    if (group?.userData?.lastPlacedTiles) group.userData.pendingModelRebuild = true;
  }, undefined, err => {
    console.warn('[wooden-train] Erreur chargement GLB', err);
    woodenTrainLoading = false;
  });
}

function extractTrainParts(scene) {
  const found = { loco: null, wagon1: null, wagon2: null };

  scene.traverse(obj => {
    const n = obj.name.toLowerCase();
    if (!found.loco   && n === 'train')   found.loco   = obj;
    if (!found.wagon1 && n === 'wagon1')  found.wagon1 = obj;
    if (!found.wagon2 && n === 'wagon2')  found.wagon2 = obj;
  });

  // Fallback par enfants directs de la scène si les noms ne correspondent pas
  const topLevel = scene.children.filter(c => c.isMesh || c.isGroup || (c.children?.length > 0));
  if (!found.loco   && topLevel.length >= 1) found.loco   = topLevel[0];
  if (!found.wagon1 && topLevel.length >= 2) found.wagon1 = topLevel[1];
  if (!found.wagon2 && topLevel.length >= 3) found.wagon2 = topLevel[2];

  console.debug('[wooden-train] Parts :', Object.entries(found).map(([k, v]) => `${k}="${v?.name ?? 'null'}"`).join(' | '));

  const result = {};
  for (const [key, src] of Object.entries(found)) {
    if (src) result[key] = normalizeTrainUnit(src, key);
    else     console.warn(`[wooden-train] Part introuvable : ${key}`);
  }
  return result;
}

function normalizeTrainUnit(source, unitName) {
  const wrapper = new THREE.Group();
  wrapper.name  = `train-unit-proto-${unitName}`;

  const model = source.clone(true);

  // CRITICAL : remettre à zéro la position héritée du fichier GLTF.
  // Les modèles Blender (loco, wagon1, wagon2) sont placés à des offsets XZ différents
  // dans la scène pour les séparer visuellement. Le clone hérite ces positions.
  // Sans reset, bbox.center inclut l'offset → model.position = -center décale le visuel
  // de -offset_hérité dans le wrapper → tourne latéralement avec l'unité → train à 5m du rail.
  model.position.set(0, 0, 0);
  model.updateMatrixWorld(true);

  // Mesure initiale (position=0, sans rotation) pour déterminer l'axe long
  const box0  = new THREE.Box3().setFromObject(model);
  const size0 = new THREE.Vector3();
  box0.getSize(size0);

  // Aligner le devant sur +X (convention moteur : -atan2(tz, tx) attend un modèle +X-facing)
  const isZLonger = size0.z >= size0.x;
  model.rotation.y = isZLonger ? -Math.PI / 2 : 0;
  model.updateMatrixWorld(true);

  // Re-mesurer APRÈS rotation → centrage correct (sinon l'offset pré-rotation tourne avec l'unité)
  const box    = new THREE.Box3().setFromObject(model);
  const size   = new THREE.Vector3();
  box.getSize(size);
  const center = new THREE.Vector3();
  box.getCenter(center);

  // Centrer XZ sur l'origine du wrapper, coller le fond à y=0
  model.position.set(-center.x, -box.min.y, -center.z);

  // Longueur = X après rotation (direction de voyage dans le repère moteur)
  const rawLength    = Math.max(size.x, 0.001);
  const targetLength = TRAIN_UNIT_SPACING * 0.97;
  const scale        = targetLength / rawLength;
  wrapper.scale.setScalar(scale);
  wrapper.add(model);

  wrapper.traverse(obj => {
    if (!obj.isMesh) return;
    obj.castShadow    = true;
    obj.receiveShadow = true;
    obj.userData.shadowFlagsApplied = true;
    // Protéger les matériaux GLB : clone(true) partage les refs → ne pas les disposer dans clearGroup
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach(m => { if (m) m.userData.glbPrototype = true; });
  });

  console.log(`[wooden-train] ${unitName}: bbox(xyz)=(${size.x.toFixed(4)},${size.y.toFixed(4)},${size.z.toFixed(4)}) isZLonger=${isZLonger} rawLength=${rawLength.toFixed(4)} targetLength=${targetLength.toFixed(4)} scale=${scale.toFixed(4)}`);
  return wrapper;
}

export function getWagonCountForRailNetwork(tileCount, distance) {
  // 0 = loco seule          (voie courte : < ~2 hexs)
  // 1 = loco + ravitaillement (voie moyenne : 2–3 hexs)
  // 2–7 = + wagons voyageurs progressifs jusqu'à 6 voyageurs (voie longue)
  if (distance < HEX_SIZE * 2.0) return 0;
  if (distance < HEX_SIZE * 3.5) return 1;
  const passengers = Math.min(6, Math.floor((distance - HEX_SIZE * 3.5) / (HEX_SIZE * 1.2)) + 1);
  return Math.min(TRAIN_MAX_WAGONS, 1 + passengers);
}

export function createTrainObject(wagonCount = 0) {
  const group = new THREE.Group();
  group.name = 'animatedRailTrainArticulated';

  const units   = [];
  const couplers = [];

  // ── Locomotive (toujours présente) ──
  const loco = new THREE.Group();
  loco.name = 'train-locomotive-independent';
  if (woodenTrainLib?.loco) loco.add(woodenTrainLib.loco.clone(true));
  group.add(loco);
  units.push({ object: loco, followDistance: 0, type: 'locomotive' });

  if (wagonCount < 1) {
    // Loco seule — pas de wagons
  } else {
    // ── Wagon de ravitaillement (wagon1, juste après la loco) ──
    const supplyWagon = new THREE.Group();
    supplyWagon.name = 'train-wagon-supply-independent';
    const supplyProto = woodenTrainLib?.wagon1 ?? woodenTrainLib?.wagon2;
    if (supplyProto) supplyWagon.add(supplyProto.clone(true));
    group.add(supplyWagon);
    units.push({ object: supplyWagon, followDistance: TRAIN_UNIT_SPACING, type: 'wagon' });

    const coupler0 = new THREE.Group();
    coupler0.name = 'train-coupler-1-articulated';
    group.add(coupler0);
    couplers.push({ object: coupler0, frontIndex: 0, rearIndex: 1 });

    // ── Wagons voyageurs (wagon2) — wagonCount-1 wagons, max 6 ──
    const passengerCount = Math.min(6, wagonCount - 1);
    for (let i = 0; i < passengerCount; i += 1) {
      const wagon = new THREE.Group();
      wagon.name = `train-wagon-${i + 2}-independent`;
      if (woodenTrainLib?.wagon2) wagon.add(woodenTrainLib.wagon2.clone(true));
      group.add(wagon);
      units.push({
        object: wagon,
        followDistance: TRAIN_UNIT_SPACING * (i + 2),
        type: 'wagon'
      });

      const coupler = new THREE.Group();
      coupler.name = `train-coupler-${i + 2}-articulated`;
      group.add(coupler);
      couplers.push({ object: coupler, frontIndex: i + 1, rearIndex: i + 2 });
    }
  }

  // Fumée sprite supprimée — remplacée par le pass volumétrique (smokeVolumePass.js).
  group.userData.units   = units;
  group.userData.couplers = couplers;
  group.userData.loco    = loco;

  return group;
}

export function updateArticulatedTrain(trainObject, motionTrack, progress, timeSeconds) {
  const units = trainObject.userData.units ?? [];
  if (units.length === 0) return;

  for (const unit of units) {
    const sample = samplePingPongMotionTrack(motionTrack, progress, unit.followDistance);
    unit.object.position.copy(sample.position);
    unit.object.position.y = TRAIN_Y;

    const targetRotation = -Math.atan2(sample.tangent.z, sample.tangent.x);
    if (unit.lastRotationY === undefined) unit.lastRotationY = targetRotation;
    unit.lastRotationY = lerpAngle(unit.lastRotationY, targetRotation, TRAIN_ROTATION_SMOOTHING);
    unit.object.rotation.y = unit.lastRotationY;

    const pulse = 1 + Math.sin(timeSeconds * 2.3 + unit.followDistance * 2.1) * 0.006;
    unit.object.scale.setScalar(pulse);
  }

  for (const coupler of trainObject.userData.couplers ?? []) {
    const front = units[coupler.frontIndex]?.object;
    const rear = units[coupler.rearIndex]?.object;
    if (!front || !rear) continue;

    const middle = front.position.clone().lerp(rear.position, 0.5);
    const direction = front.position.clone().sub(rear.position);
    coupler.object.position.copy(middle);
    coupler.object.position.y = TRAIN_Y + TRAIN_SCALE * 0.22;
    const targetRotation = -Math.atan2(direction.z, direction.x);
    if (coupler.lastRotationY === undefined) coupler.lastRotationY = targetRotation;
    coupler.lastRotationY = lerpAngle(coupler.lastRotationY, targetRotation, TRAIN_ROTATION_SMOOTHING);
    coupler.object.rotation.y = coupler.lastRotationY;
    coupler.object.visible = direction.length() > 0.001;
  }

}

function samplePingPongMotionTrack(track, progress, followDistance = 0) {
  if (!track || track.samples.length === 0) {
    return { position: new THREE.Vector3(), tangent: new THREE.Vector3(1, 0, 0) };
  }

  if (track.samples.length === 1 || track.totalMotion <= 0) {
    return {
      position: track.samples[0].position.clone(),
      tangent: track.samples[0].tangent.clone()
    };
  }

  const pingPong = Math.floor(progress * 2) % 2 === 1;
  const halfProgress = (progress * 2) % 1;
  let targetMotion = easeInOutSine(halfProgress) * track.totalMotion;
  targetMotion = pingPong ? track.totalMotion - targetMotion + followDistance : targetMotion - followDistance;
  targetMotion = Math.max(0, Math.min(track.totalMotion, targetMotion));

  const sample = sampleMotionTrackAt(track, targetMotion);
  if (pingPong) sample.tangent.multiplyScalar(-1);
  return sample;
}

export function buildMotionTrack(points) {
  const samples = [];
  const pathDistance = measurePath(points);

  if (!points || points.length === 0) {
    return { samples, totalMotion: 0, pathDistance: 0 };
  }

  if (points.length === 1 || pathDistance <= 0) {
    samples.push({
      position: points[0].clone(),
      tangent: new THREE.Vector3(1, 0, 0),
      motion: 0,
      physical: 0
    });
    return { samples, totalMotion: 0, pathDistance: 0 };
  }

  let totalMotion = 0;
  let physical = 0;

  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i];
    const to = points[i + 1];
    const segmentVector = to.clone().sub(from);
    const segmentDistance = segmentVector.length();
    if (segmentDistance <= 0) continue;

    const tangent = segmentVector.clone().normalize();
    const steps = Math.max(8, Math.ceil(segmentDistance / (0.07)));

    for (let step = 0; step <= steps; step++) {
      if (i > 0 && step === 0) continue;

      const t = step / steps;
      const position = from.clone().lerp(to, t);
      const previousPosition = samples[samples.length - 1]?.position;

      if (previousPosition) {
        const delta = previousPosition.distanceTo(position);
        const speedFactor = getLocalTrainSpeedFactor(points, i, t, physical + delta, pathDistance);
        totalMotion += delta / Math.max(speedFactor, 0.18);
        physical += delta;
      }

      samples.push({
        position,
        tangent: getSmoothedTangent(points, i, t, tangent),
        motion: totalMotion,
        physical
      });
    }
  }

  return { samples, totalMotion, pathDistance };
}

function sampleMotionTrackAt(track, targetMotion) {
  const samples = track.samples;
  const clampedMotion = Math.max(0, Math.min(targetMotion, track.totalMotion));

  for (let i = 0; i < samples.length - 1; i++) {
    const current = samples[i];
    const next = samples[i + 1];
    if (clampedMotion > next.motion) continue;

    const span = next.motion - current.motion;
    const t = span <= 0 ? 0 : (clampedMotion - current.motion) / span;
    const position = current.position.clone().lerp(next.position, t);
    const tangent = current.tangent.clone().lerp(next.tangent, t).normalize();
    return { position, tangent };
  }

  const last = samples[samples.length - 1];
  return { position: last.position.clone(), tangent: last.tangent.clone() };
}

function getLocalTrainSpeedFactor(points, segmentIndex, t, physicalDistance, pathDistance) {
  let speed = 1;

  const distanceFromStart = physicalDistance;
  const distanceFromEnd = pathDistance - physicalDistance;
  speed = Math.min(speed, lerp(0.24, 1, smoothstep(0, TRAIN_TERMINUS_SLOW_DISTANCE, distanceFromStart)));
  speed = Math.min(speed, lerp(0.24, 1, smoothstep(0, TRAIN_TERMINUS_SLOW_DISTANCE, distanceFromEnd)));

  const previousTurn = getTurnStrength(points, segmentIndex);
  if (previousTurn > 0) {
    const distanceFromPreviousCorner = t * points[segmentIndex].distanceTo(points[segmentIndex + 1]);
    const cornerInfluence = 1 - smoothstep(0, TRAIN_CURVE_SLOW_DISTANCE, distanceFromPreviousCorner);
    speed = Math.min(speed, lerp(1, 0.72, cornerInfluence * previousTurn));
  }

  const nextTurn = getTurnStrength(points, segmentIndex + 1);
  if (nextTurn > 0) {
    const distanceFromNextCorner = (1 - t) * points[segmentIndex].distanceTo(points[segmentIndex + 1]);
    const cornerInfluence = 1 - smoothstep(0, TRAIN_CURVE_SLOW_DISTANCE, distanceFromNextCorner);
    speed = Math.min(speed, lerp(1, 0.72, cornerInfluence * nextTurn));
  }

  return speed;
}

function getTurnStrength(points, pointIndex) {
  if (pointIndex <= 0 || pointIndex >= points.length - 1) return 0;

  const before = points[pointIndex].clone().sub(points[pointIndex - 1]).normalize();
  const after = points[pointIndex + 1].clone().sub(points[pointIndex]).normalize();
  const dot = Math.max(-1, Math.min(1, before.dot(after)));
  const angle = Math.acos(dot);
  return smoothstep(0.18, Math.PI * 0.78, angle);
}

function getSmoothedTangent(points, segmentIndex, t, fallbackTangent) {
  const current = fallbackTangent.clone();

  if (t < 0.38 && segmentIndex > 0) {
    const previous = points[segmentIndex].clone().sub(points[segmentIndex - 1]).normalize();
    const blend = 1 - smoothstep(0, 0.38, t);
    return previous.lerp(current, 1 - blend * 0.45).normalize();
  }

  if (t > 0.62 && segmentIndex < points.length - 2) {
    const next = points[segmentIndex + 2].clone().sub(points[segmentIndex + 1]).normalize();
    const blend = smoothstep(0.62, 1, t);
    return current.lerp(next, blend * 0.45).normalize();
  }

  return current;
}

function lerpAngle(from, to, t) {
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + delta * Math.max(0, Math.min(1, t));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}
