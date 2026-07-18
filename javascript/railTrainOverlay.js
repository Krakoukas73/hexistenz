// ─── railTrainOverlay.js — orchestrateur du système ferroviaire ────────────
// Découpé le 2026-07-11 (refactor sans risque, cf. CONTEXT.md §21) : ce fichier faisait
// 1299 lignes sans closure partagée (fonctions indépendantes groupées par thème) — bon
// candidat de découpage. Reste ici uniquement le cycle create/rebuild/update/LOD, qui
// orchestre les 4 modules extraits :
//   railTrainConstants.js  constantes partagées (TRAIN_Y, TRACK_HUB_RADIUS, STATION_*...)
//   railGraph.js           graphe rail + pathfinding + génération de routes + lissage chemin
//   railStations.js        gares terminus (placement + GLB)
//   railTrainVehicle.js    train articulé (loco+wagons), animation, GLB train.glb
//   railTrackGlb.js        rails.glb (chargement + instanciation le long du chemin)
// API publique inchangée (mêmes 5 exports qu'avant, seul importateur externe : scene.js).
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { LOD_TRAIN_CULL_DISTANCE } from './config.js';
import { buildRailGraph, findComponents, findLongestPath, smoothRailMotionPath, measurePath } from './railGraph.js';
import { addRailTerminusStations, ensureStationGlbModels, stationModelsLoaded } from './railStations.js';
import {
  getTrainLocoPositions,
  ensureWoodenTrainGlb,
  createTrainObject,
  updateArticulatedTrain,
  buildMotionTrack,
  getWagonCountForRailNetwork
} from './railTrainVehicle.js';
import { ensureTrackGlb, addTrackGLBToGroup, isTrackGlbReady } from './railTrackGlb.js';
import { TRAIN_SPEED } from './railTrainConstants.js';
import { HEX_SIZE } from './config.js';
import { DEBUG_FLAGS } from './variables.js';

export { getTrainLocoPositions };

const materialCache = new Map();

export function createRailTrainOverlay() {
  const group = new THREE.Group();
  group.name = 'rail-train-overlay';
  group.userData.trains = [];
  ensureStationGlbModels(group);
  ensureWoodenTrainGlb(group);
  ensureTrackGlb(group);
  return group;
}

export function rebuildRailTrainOverlay(group, placedTiles) {
  group.userData.lastPlacedTiles = placedTiles;
  const _rT0 = performance.now();
  clearGroup(group);
  group.userData.trains = [];
  group.userData.stations = [];
  const _rT1 = performance.now();

  if (!stationModelsLoaded()) ensureStationGlbModels(group);

  const graph = buildRailGraph(placedTiles);
  const _rT2 = performance.now();
  const components = findComponents(graph);
  const _rT3 = performance.now();

  // Chemins lisses collectés pour les rails GLB → même chemin que les trains (alignement parfait)
  const smoothPaths = [];

  for (const component of components) {
    addRailTerminusStations(group, graph, component);

    const path = findLongestPath(graph, component.nodes);
    if (path.length < 2) continue;

    const graphPoints = path.map(nodeId => graph.nodes.get(nodeId).position.clone());
    const points = smoothRailMotionPath(graphPoints);
    const distance = measurePath(points);
    if (distance < HEX_SIZE * 0.30) continue; // seuil minimal pour rails GLB (< 1 tuile suffit)

    smoothPaths.push(points); // rails GLB pour tous les composants, y compris tuile isolée

    // Train uniquement si le réseau couvre ≥ 2 tuiles et la distance est suffisante
    if (component.tileKeys.size < 2 || distance < HEX_SIZE * 1.05) continue;

    const wagonCount = getWagonCountForRailNetwork(component.tileKeys.size, distance);
    const trainObject = createTrainObject(wagonCount);
    trainObject.visible = true;
    group.add(trainObject);
    const trackCenter = new THREE.Vector3();
    for (const p of points) trackCenter.add(p);
    trackCenter.divideScalar(Math.max(1, points.length));
    group.userData.trains.push({
      object: trainObject,
      points,
      distance,
      motionTrack: buildMotionTrack(points),
      offset: component.index * 0.23,
      trackCenter
    });
  }
  const _rT4 = performance.now();

  // Rails GLB : même chemin lisse que les trains → rails et trains parfaitement alignés
  if (isTrackGlbReady()) {
    const railGroup = new THREE.Group();
    railGroup.name = 'rail-glb-instances';
    let totalRailInstances = 0;
    for (const pts of smoothPaths) {
      totalRailInstances += addTrackGLBToGroup(railGroup, pts, false);
    }
    group.add(railGroup);
    // Gaté sous DEBUG_FLAGS.overlays (2026-07-16, phase 3) — pur diagnostic, n'affecte
    // que le rebuild (pas d'appel par frame).
    if (DEBUG_FLAGS.overlays) console.debug(`[track-glb] ${totalRailInstances} instances (smooth path)`);
  }

  const _rT5 = performance.now();
  if (DEBUG_FLAGS.overlays) console.log(`[FREEZE-DIAG rail-phases] clear=${(_rT1-_rT0).toFixed(0)}ms | graph=${(_rT2-_rT1).toFixed(0)}ms | components=${(_rT3-_rT2).toFixed(0)}ms | trains=${(_rT4-_rT3).toFixed(0)}ms | rails-glb=${(_rT5-_rT4).toFixed(0)}ms | TOTAL=${(_rT5-_rT0).toFixed(0)}ms`);
}

export function updateRailTrainOverlay(group, timeSeconds = 0) {
  const trains = group.userData.trains ?? [];

  for (const train of trains) {
    if (!train.object.visible) continue;
    const progress = (timeSeconds * TRAIN_SPEED / Math.max(train.distance, 0.001) + train.offset) % 1;
    updateArticulatedTrain(train.object, train.motionTrack, progress, timeSeconds + train.offset * 10);
  }
}

// Frustum réutilisable (évite une allocation par appel LOD).
const _railLodFrustum = new THREE.Frustum();
const _railLodMatrix  = new THREE.Matrix4();
const _railLodSphere  = new THREE.Sphere();
// Rayons de culling volontairement GÉNÉREUX : couvrent l'emprise de l'objet + le
// drop de courbure monde (le centre plat trackCenter/center est au-dessus de la
// position réellement rendue en bouliste). Conséquence : on ne culle JAMAIS à
// tort (au pire on n'élimine rien), on n'élimine que ce qui est franchement
// hors-champ. Trains longs → rayon large ; gares (bâtiments) → moyen.
const _RAIL_TRAIN_CULL_RADIUS   = 5.0;
const _RAIL_STATION_CULL_RADIUS = 3.5;

export function updateRailTrainLOD(group, camera, lodFactor = 1.0) {
  const eff = LOD_TRAIN_CULL_DISTANCE * lodFactor;
  const distSq = eff * eff;
  _railLodMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  _railLodFrustum.setFromProjectionMatrix(_railLodMatrix);
  for (const train of (group.userData.trains ?? [])) {
    _railLodSphere.set(train.trackCenter, _RAIL_TRAIN_CULL_RADIUS);
    train.object.visible = camera.position.distanceToSquared(train.trackCenter) < distSq
      && _railLodFrustum.intersectsSphere(_railLodSphere);
  }
  for (const station of (group.userData.stations ?? [])) {
    _railLodSphere.set(station.center, _RAIL_STATION_CULL_RADIUS);
    station.object.visible = camera.position.distanceToSquared(station.center) < distSq
      && _railLodFrustum.intersectsSphere(_railLodSphere);
  }
}

function clearGroup(group) {
  for (const child of [...group.children]) {
    group.remove(child);
    child.traverse?.(object => {
      object.geometry?.dispose?.();
      // Ne pas disposer les matériaux GLB : clone(true) partage les références →
      // disposer une instance détruit aussi le prototype. Les matériaux GLB sont
      // marqués userData.glbPrototype = true par normalizeTrainUnit / ensureTrackGlb.
      const mats = Array.isArray(object.material) ? object.material : [object.material];
      for (const mat of mats) {
        if (mat && !mat.userData?.glbPrototype && !materialCacheHasMaterial(mat)) {
          mat.dispose?.();
        }
      }
    });
  }
}

function materialCacheHasMaterial(material) {
  for (const cachedMaterial of materialCache.values()) {
    if (cachedMaterial === material) return true;
  }
  return false;
}
