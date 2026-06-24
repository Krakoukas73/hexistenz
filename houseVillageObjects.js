import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';
import { HEX_SIZE, TILE_VISUAL, SECTOR_DEFS } from './config.js';
import { hashUnit100k as hashUnit } from './stable/hashUtils.js';
import { getGravelSvgMaterial, getHouseMaterial } from './houseVillageMaterials.js';

/**
 * Chargement GLB et création des objets 3D du village :
 * maisons, église/dolmen, tour de garde, cimetière.
 *
 * La dépendance circulaire avec houseOverlay est cassée via le pattern
 * callback : ensureHouseGlbModels(group, onReady) appelle onReady() quand
 * tous les modèles sont prêts, sans jamais importer houseOverlay.
 */

// ─── Constantes locales ────────────────────────────────────────────────────────

const HOUSE_SCALE = HEX_SIZE * 0.1332; // −10 %
const HOUSE_GLB_SIZE_MULTIPLIER = 1.75;
const HOUSE_GLB_SPACING_MULTIPLIER = 1.12;

// ─── Définitions de modèles GLB ───────────────────────────────────────────────

const HOUSE_GLB_MODEL_DEFS = [
  { key: 'maison-1', url: './glb/maison-1.glb', size: 1.50, spawnWeight: 45 },
  { key: 'maison-2', url: './glb/maison-2.glb', size: 1.55, spawnWeight: 30 },
  { key: 'maison-3', url: './glb/maison-3.glb', size: 1.60, spawnWeight: 15 },
  { key: 'maison-4', url: './glb/maison-4.glb', size: 1.75, spawnWeight: 5 }
];
const CHURCH_GLB_MODEL_DEF = { key: 'eglise', url: './glb/eglise.glb', size: 4.5 };
const DOLMEN_GLB_MODEL_DEF = { key: 'dolmen', url: './glb/dolmen.glb', size: 4.5 };
const WATCHTOWER_GLB_MODEL_DEFS = [
  { key: 'watchtower-1', url: './glb/watchtower-1.glb', size: 3.65, spawnWeight: 20 },
  { key: 'watchtower-2', url: './glb/watchtower-2.glb', size: 3.65, spawnWeight: 20 },
  { key: 'watchtower-3', url: './glb/watchtower-3.glb', size: 3.65, spawnWeight: 20 },
  { key: 'watchtower-4', url: './glb/watchtower-4.glb', size: 3.65, spawnWeight: 20 },
  { key: 'watchtower-5', url: './glb/watchtower-5.glb', size: 3.65, spawnWeight: 20, sinkDepth: 0.07 }
];

// ─── État GLB (module-level, partagé entre chargeur et créateurs) ─────────────

const houseGlbLibrary = new Map();
let churchGlbPrototype = null;
let dolmenGlbPrototype = null;
const watchtowerGlbLibrary = new Map();
let houseModelsLoading = false;
let houseModelsRequested = false;

// ─── API publique — chargement ────────────────────────────────────────────────

/**
 * Lance le chargement asynchrone de tous les modèles maison GLB.
 * Appelle onReady() (sans argument) quand tous sont prêts.
 * Idempotent : un deuxième appel pendant le chargement est ignoré.
 */
export function ensureHouseGlbModels(group, onReady) {
  if (houseModelsLoading || houseModelsRequested) return;
  houseModelsLoading = true;
  houseModelsRequested = true;

  let pending = HOUSE_GLB_MODEL_DEFS.length + 2 + WATCHTOWER_GLB_MODEL_DEFS.length;
  const finishOne = () => {
    pending -= 1;
    if (pending > 0) return;
    houseModelsLoading = false;
    onReady?.();
  };

  for (const def of HOUSE_GLB_MODEL_DEFS) {
    new GLTFLoader().load(
      def.url,
      gltf => {
        houseGlbLibrary.set(def.key, prepareHouseGlbPrototype(gltf.scene, def));
        finishOne();
      },
      undefined,
      error => {
        console.warn(`Modèle maison GLB indisponible : ${def.url}`, error);
        finishOne();
      }
    );
  }

  new GLTFLoader().load(
    CHURCH_GLB_MODEL_DEF.url,
    gltf => {
      churchGlbPrototype = prepareHouseGlbPrototype(gltf.scene, CHURCH_GLB_MODEL_DEF);
      finishOne();
    },
    undefined,
    error => {
      console.warn(`Modèle église GLB indisponible : ${CHURCH_GLB_MODEL_DEF.url}`, error);
      finishOne();
    }
  );

  new GLTFLoader().load(
    DOLMEN_GLB_MODEL_DEF.url,
    gltf => {
      dolmenGlbPrototype = prepareHouseGlbPrototype(gltf.scene, DOLMEN_GLB_MODEL_DEF);
      finishOne();
    },
    undefined,
    error => {
      console.warn(`Modèle dolmen GLB indisponible : ${DOLMEN_GLB_MODEL_DEF.url}`, error);
      finishOne();
    }
  );

  for (const def of WATCHTOWER_GLB_MODEL_DEFS) {
    new GLTFLoader().load(
      def.url,
      gltf => {
        watchtowerGlbLibrary.set(def.key, prepareHouseGlbPrototype(gltf.scene, def));
        finishOne();
      },
      undefined,
      error => {
        console.warn(`Modèle tour de garde GLB indisponible : ${def.url}`, error);
        finishOne();
      }
    );
  }
}

/** Vrai si au moins un modèle maison GLB est disponible. */
export function isHouseGlbReady() {
  return houseGlbLibrary.size > 0;
}

// ─── Utilitaires GLB (privés) ─────────────────────────────────────────────────

function prepareHouseGlbPrototype(model, def) {
  const source = model.clone(true);
  const prototype = normalizeHouseGlbModel(source, def);

  prototype.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    if (object.material) object.material = cloneHouseGlbMaterial(object.material);
  });

  return prototype;
}

function cloneHouseGlbMaterial(material) {
  if (Array.isArray(material)) return material.map(item => cloneHouseGlbMaterial(item));

  const cloned = material.clone();
  cloned.side = THREE.DoubleSide;
  if ('emissiveIntensity' in cloned) cloned.emissiveIntensity = 0;
  if ('toneMapped' in cloned) cloned.toneMapped = true;
  cloned.needsUpdate = true;
  return cloned;
}

function normalizeHouseGlbModel(model, def) {
  const wrapper = new THREE.Group();
  wrapper.name = `normalized-${def.key}-village-house-glb`;

  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  model.position.set(-center.x, -box.min.y, -center.z);

  const maxDimension = Math.max(size.x, size.y, size.z) || 1;
  wrapper.scale.setScalar((HOUSE_SCALE * def.size) / maxDimension);
  wrapper.add(model);
  return wrapper;
}

// ─── Utilitaire de placement ──────────────────────────────────────────────────

/**
 * Écarte légèrement un point local du centre de la tuile pour donner
 * de l'espace entre les maisons GLB (plus grosses que les SVG).
 */
export function spreadVillageHouseLocalPoint(local) {
  return {
    x: local.x * HOUSE_GLB_SPACING_MULTIPLIER,
    z: local.z * HOUSE_GLB_SPACING_MULTIPLIER
  };
}

// ─── Créateurs d'objets de village ────────────────────────────────────────────

export function createVillageHouseObject(seedKey, sector, index) {
  const group = new THREE.Group();
  group.name = 'village-house-glb';

  const sectorAngle = (SECTOR_DEFS.findIndex(item => item.key === sector.key) * Math.PI / 3) + Math.PI / 6;
  const jitter = (hashUnit(`${seedKey}:house-rotation`) - 0.5) * 0.42;
  group.rotation.y = -sectorAngle + jitter;
  group.scale.setScalar((0.94 + hashUnit(`${seedKey}:house-scale`) * 0.18) * HOUSE_GLB_SIZE_MULTIPLIER);

  const def = pickHouseGlbDefinition(seedKey, index);
  const prototype = houseGlbLibrary.get(def.key);

  if (!prototype) return group;

  const house = prototype.clone(true);
  house.name = `${def.key}-village-house-instance`;
  house.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    object.userData.shadowFlagsApplied = true;
  });

  group.add(house);
  return group;
}

export function createVillageChurchObject(seedKey, sector) {
  const group = new THREE.Group();
  group.name = 'village-church-or-dolmen-glb-large-zone-reward';

  const sectorAngle = (SECTOR_DEFS.findIndex(item => item.key === sector.key) * Math.PI / 3) + Math.PI / 6;
  const jitter = (hashUnit(`${seedKey}:church-rotation`) - 0.5) * 0.22;
  group.rotation.y = -sectorAngle + jitter;
  group.scale.setScalar(0.88);

  const useDolmen = hashUnit(`${seedKey}:church-or-dolmen`) >= 0.5;
  const prototype = useDolmen
    ? (dolmenGlbPrototype || churchGlbPrototype)
    : (churchGlbPrototype || dolmenGlbPrototype);
  if (!prototype) return group;

  const monument = prototype.clone(true);
  monument.name = useDolmen ? 'dolmen-glb-village-church-slot-instance' : 'eglise-glb-village-church-instance';
  if (useDolmen) monument.scale.multiplyScalar(0.40);
  monument.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    object.userData.shadowFlagsApplied = true;
  });

  group.add(monument);
  return group;
}

function pickWatchtowerGlbDefinition(seedKey) {
  const totalWeight = WATCHTOWER_GLB_MODEL_DEFS.reduce((total, def) => total + (def.spawnWeight ?? 1), 0);
  let roll = hashUnit(`${seedKey}:watchtower-variant`) * totalWeight;
  for (const def of WATCHTOWER_GLB_MODEL_DEFS) {
    roll -= def.spawnWeight ?? 1;
    if (roll <= 0) return def;
  }
  return WATCHTOWER_GLB_MODEL_DEFS[0];
}

export function createVillageWatchtowerObject(seedKey, sector) {
  const group = new THREE.Group();
  group.name = 'village-watchtower-glb-zone-reward';

  const sectorAngle = (SECTOR_DEFS.findIndex(item => item.key === sector.key) * Math.PI / 3) + Math.PI / 6;
  const jitter = (hashUnit(`${seedKey}:watchtower-rotation`) - 0.5) * 0.28;
  group.rotation.y = -sectorAngle + jitter;
  group.scale.setScalar(0.93 + hashUnit(`${seedKey}:watchtower-scale`) * 0.12);

  const def = pickWatchtowerGlbDefinition(seedKey);
  const prototype = watchtowerGlbLibrary.get(def.key);

  if (!prototype) {
    if (!createVillageWatchtowerObject.warnedMissingModel) {
      console.warn(`Tour de garde GLB indisponible : ${def.url}`);
      createVillageWatchtowerObject.warnedMissingModel = true;
    }
    return group;
  }

  const tower = prototype.clone(true);
  tower.name = `${def.key}-village-watchtower-instance`;
  tower.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    object.userData.shadowFlagsApplied = true;
  });
  if (def.sinkDepth) tower.position.y -= def.sinkDepth;

  group.add(tower);
  return group;
}

export function createVillageCemeteryObject(seedKey, sector) {
  const group = new THREE.Group();
  group.name = 'village-cemetery-svg-style-zone-reward';

  const sectorAngle = (SECTOR_DEFS.findIndex(item => item.key === sector.key) * Math.PI / 3) + Math.PI / 6;
  const jitter = (hashUnit(`${seedKey}:cemetery-rotation`) - 0.5) * 0.30;
  group.rotation.y = -sectorAngle + jitter;
  group.scale.setScalar(1.14 + hashUnit(`${seedKey}:cemetery-scale`) * 0.16);

  const gravelMat = getGravelSvgMaterial('cemetery-gravel-grey-svg', 0x8B8982);
  const soilMat = getHouseMaterial('cemetery-soil-dark', 0x4F4A43);
  const grassMat = getHouseMaterial('cemetery-grass-muted', 0x4E6B3E);
  const stoneMat = getHouseMaterial('cemetery-stone-pale', 0xB8B2A4);
  const darkStoneMat = getHouseMaterial('cemetery-stone-dark', 0x777064);
  const ironMat = getHouseMaterial('cemetery-iron-cross', 0x2F3030);
  const fenceMat = getHouseMaterial('cemetery-fence-wood', 0x5B4433);

  const base = new THREE.Mesh(new THREE.BoxGeometry(HOUSE_SCALE * 1.72, HOUSE_SCALE * 0.045, HOUSE_SCALE * 1.18), gravelMat);
  base.name = 'village-cemetery-grey-gravel-plot';
  base.position.set(0, HOUSE_SCALE * 0.025, 0);
  base.renderOrder = 127;

  const path = new THREE.Mesh(new THREE.BoxGeometry(HOUSE_SCALE * 0.24, HOUSE_SCALE * 0.052, HOUSE_SCALE * 1.08), soilMat);
  path.name = 'village-cemetery-central-earth-path';
  path.position.set(0, HOUSE_SCALE * 0.055, 0);
  path.renderOrder = 128;

  group.add(base, path);

  const graves = [
    [-0.62, -0.38, -0.18, 'cross'],
    [-0.34,  0.28,  0.12, 'stone'],
    [ 0.16, -0.32,  0.22, 'cross'],
    [ 0.54,  0.31, -0.14, 'stone'],
    [-0.66,  0.30,  0.20, 'stone'],
    [ 0.42, -0.46, -0.10, 'cross'],
    [-0.05,  0.48,  0.18, 'stone'],
    [ 0.70, -0.08, -0.22, 'cross']
  ];

  graves.forEach(([gx, gz, tilt, type], index) => {
    const x = HOUSE_SCALE * gx;
    const z = HOUSE_SCALE * gz;
    const graveSeed = `${seedKey}:grave:${index}`;
    const lean = tilt + (hashUnit(`${graveSeed}:lean`) - 0.5) * 0.28;
    if (type === 'cross') {
      addCemeteryCross(group, x, z, lean, index % 2 ? darkStoneMat : ironMat);
    } else {
      addTombstone(group, x, z, lean, index % 2 ? stoneMat : darkStoneMat);
    }
    addGraveSlab(group, x, z + HOUSE_SCALE * 0.045, hashUnit(`${graveSeed}:slab`) > 0.5 ? stoneMat : soilMat);
  });

  addFenceRail(group, 0, -HOUSE_SCALE * 0.64, HOUSE_SCALE * 1.78, HOUSE_SCALE * 0.045, fenceMat, 'front');
  addFenceRail(group, 0,  HOUSE_SCALE * 0.64, HOUSE_SCALE * 1.78, HOUSE_SCALE * 0.045, fenceMat, 'back');
  addFenceRail(group, -HOUSE_SCALE * 0.92, 0, HOUSE_SCALE * 0.045, HOUSE_SCALE * 1.24, fenceMat, 'left');
  addFenceRail(group,  HOUSE_SCALE * 0.92, 0, HOUSE_SCALE * 0.045, HOUSE_SCALE * 1.24, fenceMat, 'right');

  for (const child of group.children) {
    child.castShadow = false;
    child.receiveShadow = false;
  }

  return group;
}

// ─── Géométrie cimetière (privé) ──────────────────────────────────────────────

function addTombstone(group, x, z, lean, material) {
  const stone = new THREE.Mesh(new THREE.BoxGeometry(HOUSE_SCALE * 0.13, HOUSE_SCALE * 0.25, HOUSE_SCALE * 0.045), material);
  stone.name = 'village-cemetery-leaning-tombstone-svg-style';
  stone.position.set(x, HOUSE_SCALE * 0.18, z);
  stone.rotation.z = lean;
  stone.renderOrder = 134;
  group.add(stone);

  const cap = new THREE.Mesh(new THREE.SphereGeometry(HOUSE_SCALE * 0.067, 10, 6), material);
  cap.name = 'village-cemetery-rounded-tombstone-cap';
  cap.position.set(x, HOUSE_SCALE * 0.31, z);
  cap.scale.y = 0.34;
  cap.rotation.z = lean;
  cap.renderOrder = 135;
  group.add(cap);
}

function addCemeteryCross(group, x, z, lean, material) {
  const vertical = new THREE.Mesh(new THREE.BoxGeometry(HOUSE_SCALE * 0.040, HOUSE_SCALE * 0.34, HOUSE_SCALE * 0.040), material);
  vertical.name = 'village-cemetery-leaning-cross-vertical';
  vertical.position.set(x, HOUSE_SCALE * 0.22, z);
  vertical.rotation.z = lean;
  vertical.renderOrder = 136;

  const horizontal = new THREE.Mesh(new THREE.BoxGeometry(HOUSE_SCALE * 0.18, HOUSE_SCALE * 0.038, HOUSE_SCALE * 0.038), material);
  horizontal.name = 'village-cemetery-leaning-cross-horizontal';
  horizontal.position.set(x, HOUSE_SCALE * 0.28, z);
  horizontal.rotation.z = lean;
  horizontal.renderOrder = 137;
  group.add(vertical, horizontal);
}

function addGraveSlab(group, x, z, material) {
  const slab = new THREE.Mesh(new THREE.BoxGeometry(HOUSE_SCALE * 0.18, HOUSE_SCALE * 0.030, HOUSE_SCALE * 0.25), material);
  slab.name = 'village-cemetery-grave-slab';
  slab.position.set(x, HOUSE_SCALE * 0.075, z);
  slab.rotation.y = (hashUnit(`${x}:${z}:slab-yaw`) - 0.5) * 0.18;
  slab.renderOrder = 129;
  group.add(slab);
}

function addFenceRail(group, x, z, width, depth, material, name) {
  const rail = new THREE.Mesh(new THREE.BoxGeometry(width, HOUSE_SCALE * 0.055, depth), material);
  rail.name = `village-cemetery-low-fence-${name}`;
  rail.position.set(x, HOUSE_SCALE * 0.13, z);
  rail.renderOrder = 132;
  group.add(rail);
}

// ─── Sélection du modèle GLB ──────────────────────────────────────────────────

function pickHouseGlbDefinition(seedKey, index) {
  const totalWeight = HOUSE_GLB_MODEL_DEFS.reduce((total, def) => total + (def.spawnWeight ?? 1), 0);
  let roll = hashUnit(`${seedKey}:weighted-glb-variant:${index}`) * totalWeight;

  for (const def of HOUSE_GLB_MODEL_DEFS) {
    roll -= def.spawnWeight ?? 1;
    if (roll <= 0) return def;
  }

  return HOUSE_GLB_MODEL_DEFS[0];
}

