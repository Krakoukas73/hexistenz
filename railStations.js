// ─── railStations.js — gares terminus (GLB) ──────────────────────────────────
// Extrait de railTrainOverlay.js le 2026-07-11 (découpage sans risque, cf. CONTEXT.md §21) :
// placement d'une gare à chaque terminus du réseau rail + chargement/normalisation du GLB.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { createGLTFLoader } from './glbLoader.js';
import { hashUnit10k as hashUnit } from './hashUtils.js';
import {
  STATION_Y,
  STATION_TARGET_LENGTH,
  STATION_TRACK_CLEARANCE,
  STATION_TERMINUS_BACKSET,
  STATION_MODEL_DEFS
} from './railTrainConstants.js';

const stationGlbLibrary = new Map();
let stationModelsLoading = false;
let stationModelsRequested = false;

export function stationModelsLoaded() {
  return stationGlbLibrary.size >= 1;
}

export function addRailTerminusStations(group, graph, component) {
  const terminalPorts = component.nodes
    .filter(nodeId => nodeId.includes(':port:') && (graph.adjacency.get(nodeId)?.size ?? 0) <= 1)
    .slice(0, 8);

  for (const nodeId of terminalPorts) {
    const node = graph.nodes.get(nodeId);
    if (!node) continue;

    const centerId = nodeId.replace(/:port:[^:]+$/, ':center');
    const center = graph.nodes.get(centerId)?.position ?? new THREE.Vector3(0, STATION_Y, 0);
    const outward = node.position.clone().sub(center);
    if (outward.lengthSq() < 0.0001) outward.set(1, 0, 0);
    outward.y = 0;
    outward.normalize();

    const station = createRailStationObject(nodeId);
    const side = new THREE.Vector3(-outward.z, 0, outward.x).normalize();
    const sideSign = hashUnit(`${nodeId}:station-side`) > 0.5 ? 1 : -1;

    station.position.copy(node.position)
      .add(outward.clone().multiplyScalar(-STATION_TERMINUS_BACKSET))
      .add(side.multiplyScalar(STATION_TRACK_CLEARANCE * sideSign));
    station.position.y = node.position.y - 0.075;
    station.rotation.y = Math.atan2(outward.x, outward.z) + (sideSign < 0 ? Math.PI : 0);
    if (!Array.isArray(group.userData.stations)) group.userData.stations = [];
    group.userData.stations.push({ object: station, center: station.position.clone() });
    group.add(station);
  }
}

function createRailStationObject(seedKey = 'station') {
  const group = new THREE.Group();
  group.name = 'rail-terminus-station-glb-house';

  const prototype = pickStationPrototype(seedKey);
  if (!prototype) return group;

  const station = prototype.clone(true);
  station.name = 'rail-terminus-station-glb-instance';
  station.rotation.y = hashUnit(`${seedKey}:station-model-yaw`) * 0.22 - 0.11;
  group.add(station);

  return group;
}

export function ensureStationGlbModels(group) {
  if (stationModelsLoading || stationModelsRequested) return;
  stationModelsLoading = true;
  stationModelsRequested = true;

  let pending = STATION_MODEL_DEFS.length;
  const finishOne = () => {
    pending -= 1;
    if (pending > 0) return;

    stationModelsLoading = false;
    // ⚠️ NE PAS appeler rebuildRailTrainOverlay() directement ici :
    // le callback GLB fire entre deux RAF → nouveaux objets visible=true sans LOD → FLASH.
    // On passe par pendingModelRebuild → scene.js le queue avec lod?.() immédiat.
    if (group.userData.lastPlacedTiles) group.userData.pendingModelRebuild = true;
  };

  for (const def of STATION_MODEL_DEFS) {
    createGLTFLoader().load(
      def.url,
      gltf => {
        stationGlbLibrary.set(def.key, prepareStationGlbPrototype(gltf.scene, def));
        finishOne();
      },
      undefined,
      error => {
        console.warn(`Modèle gare GLB indisponible : ${def.url}`, error);
        finishOne();
      }
    );
  }
}

function prepareStationGlbPrototype(model, def) {
  const wrapper = new THREE.Group();
  wrapper.name = `normalized-${def.key}`;

  const source = model.clone(true);
  const box = new THREE.Box3().setFromObject(source);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  source.position.set(-center.x, -box.min.y, -center.z);
  const length = Math.max(size.x, size.z) || 1;
  wrapper.scale.setScalar(STATION_TARGET_LENGTH / length);
  wrapper.add(source);

  wrapper.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    if (object.material) object.material = cloneGlbMaterial(object.material);
  });

  return wrapper;
}

function pickStationPrototype(seedKey) {
  const loaded = STATION_MODEL_DEFS.filter(def => stationGlbLibrary.has(def.key));
  if (loaded.length === 0) return null;

  const totalWeight = loaded.reduce((total, def) => total + (def.weight ?? 1), 0);
  let roll = hashUnit(`${seedKey}:station-glb-choice`) * totalWeight;
  for (const def of loaded) {
    roll -= def.weight ?? 1;
    if (roll <= 0) return stationGlbLibrary.get(def.key);
  }

  return stationGlbLibrary.get(loaded[0].key);
}

function cloneGlbMaterial(material) {
  if (Array.isArray(material)) return material.map(item => cloneGlbMaterial(item));
  const cloned = material.clone();
  cloned.side = THREE.DoubleSide;
  if ('emissiveIntensity' in cloned) cloned.emissiveIntensity = 0;
  if ('toneMapped' in cloned) cloned.toneMapped = true;
  cloned.needsUpdate = true;
  return cloned;
}
