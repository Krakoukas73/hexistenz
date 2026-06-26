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

const HOUSE_SCALE = HEX_SIZE * 0.1332 * 0.93 * 0.90; // −10% −7% −10%
const HOUSE_GLB_SIZE_MULTIPLIER = 1.75;
const HOUSE_GLB_SPACING_MULTIPLIER = 1.12;

// ─── Définitions de modèles GLB ───────────────────────────────────────────────

const HOUSE_GLB_MODEL_DEFS = [
  // maison-1 retirée du pool (8 911 tris/instance — trop lourde, GLB à remplacer)
  { key: 'maison-fantasy-1', url: './glb/batiments/fantasy/maison-1.glb', size: 1.55 * 0.95 * 0.80, spawnWeight: 55 }, // −20%
  { key: 'maison-fantasy-2', url: './glb/batiments/fantasy/maison-2.glb', size: 1.60 * 0.95 * 0.90, spawnWeight: 22 }, // −10%
  { key: 'maison-fantasy-3', url: './glb/batiments/fantasy/maison-3.glb', size: 1.75 * 0.95 * 0.90, spawnWeight: 15 }, // −10% total=100
];
const CHURCH_GLB_MODEL_DEF = { key: 'eglise', url: './glb/batiments/eglise.glb', size: 4.5 * 0.93 };          // −7%
const DOLMEN_GLB_MODEL_DEF = { key: 'dolmen', url: './glb/batiments/dolmen.glb', size: 4.5 * 0.70, sinkDepth: 0.035 };
// Pack unique — les 3 tours sont des nodes dans le même fichier GLB.
// Chargement 1×, extraction par nodeName, worldMatrix bakée → filtrage COLLIDER.
const WATCHTOWER_PACK_URL = './glb/batiments/low_poly_medieval_towers_pack.glb';
const WATCHTOWER_PACK_DEFS = [
  { key: 'tower-castle004', nodeName: 'Castle.004', size: 5.5 * 0.605, spawnWeight: 33, sinkDepth: 0.05 }, // −50% +10% +10%
  { key: 'tower-castle008', nodeName: 'Castle.008', size: 5.5 * 0.88,  spawnWeight: 33, sinkDepth: 0.05 }, // −20% +10%
  { key: 'tower-castle010', nodeName: 'Castle.010', size: 5.5 * 1.242, spawnWeight: 34, sinkDepth: 0.05 }, // +35% −8% — total=100
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

  let pending = HOUSE_GLB_MODEL_DEFS.length + 2 + 1; // maisons + (église + dolmen) + 1 pack tours
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

  // Pack tours — 1 seul chargement GLB, 3 towers extraites par nodeName
  new GLTFLoader().load(
    WATCHTOWER_PACK_URL,
    gltf => {
      console.log('[watchtower pack] GLB chargé ✓');
      for (const def of WATCHTOWER_PACK_DEFS) {
        const extracted = _extractTowerFromPack(gltf.scene, def.nodeName);
        console.log(`[watchtower pack] "${def.nodeName}" → ${extracted.children.length} mesh(es) extraits`);
        const proto = prepareHouseGlbPrototype(extracted, def);
        console.log(`[watchtower pack] proto "${def.key}" → children: ${proto.children.length}`);
        watchtowerGlbLibrary.set(def.key, proto);
      }
      finishOne();
    },
    undefined,
    error => {
      console.log(`[watchtower pack] ERREUR chargement : ${WATCHTOWER_PACK_URL}`, error);
      finishOne();
    }
  );
}

/** Vrai si au moins un modèle maison GLB est disponible. */
export function isHouseGlbReady() {
  return houseGlbLibrary.size > 0;
}

// ─── Extraction pack tours ────────────────────────────────────────────────────

/**
 * Extrait une tour du pack GLB par son nodeName.
 * Bake la worldMatrix complète de chaque mesh (incluant les transforms parents
 * du pack : rotation Y-up→Z-up de Sketchfab + scale ×0.01 + scale du node).
 * Les meshes avec material.name === 'COLLIDER' sont ignorés (alpha=0, inutiles).
 * Retourne un Group "plat" avec la géométrie en espace monde, prêt pour
 * normalizeHouseGlbModel (qui recalcule bounding box + scale).
 */
function _extractTowerFromPack(packScene, nodeName) {
  // Calcule toutes les worldMatrices avec la chaîne parents complète
  packScene.updateMatrixWorld(true);

  // Three.js r160 sanitizeNodeName peut supprimer les points (Castle.004 → Castle004)
  // ou les remplacer par des underscores. On essaie les 3 variantes.
  const variants = [
    nodeName,
    nodeName.replace(/\./g, ''),   // Castle004
    nodeName.replace(/\./g, '_'),  // Castle_004
  ];
  let towerNode = null;
  for (const v of variants) {
    towerNode = packScene.getObjectByName(v);
    if (towerNode) { console.log(`[watchtower pack] "${nodeName}" → trouvé sous nom "${v}" (${towerNode.type})`); break; }
  }

  if (!towerNode) {
    console.log(`[watchtower pack] node "${nodeName}" introuvable — noms disponibles :`);
    packScene.traverse(o => { if (o.name) console.log('  node:', JSON.stringify(o.name), o.type); });
    return new THREE.Group();
  }

  const wrapper = new THREE.Group();
  wrapper.name = nodeName;

  towerNode.traverse(obj => {
    if (!obj.isMesh) return;
    // Filtrer les meshes colliders (matériau COLLIDER, baseColorFactor alpha=0)
    const matName = Array.isArray(obj.material) ? obj.material[0]?.name : obj.material?.name;
    if (matName === 'COLLIDER') return;

    const geo = obj.geometry.clone();
    geo.applyMatrix4(obj.matrixWorld); // bake scale/rotation/translation parents
    const mesh = new THREE.Mesh(geo, obj.material);
    mesh.name = obj.name;
    wrapper.add(mesh);
  });

  console.debug(`[watchtower pack] "${nodeName}" → ${wrapper.children.length} mesh(es) extraits`);
  return wrapper;
}

// ─── Utilitaires GLB (privés) ─────────────────────────────────────────────────

/** Nombre de triangles d'une géométrie Three.js (même logique que debugLightUi). */
function _geomTriCount(geo) {
  if (!geo) return 0;
  return geo.index ? geo.index.count / 3 : Math.floor((geo.attributes?.position?.count ?? 0) / 3);
}

/**
 * Limite les shadow casters à 1 par groupe GLB : seul le mesh le plus grand
 * (silhouette principale) caste une ombre. Les sous-meshes détails (fenêtres,
 * cheminées, ornements…) ne contribuent pas visuellement aux ombres mais
 * coûtaient chacun 1 shadow draw call. Impact : ÷2 à ÷3 shadow casters bâtiments.
 */
function _applySingleShadowCaster(root) {
  let best = null, bestTris = -1;
  root.traverse(obj => {
    if (!obj.isMesh) return;
    const t = _geomTriCount(obj.geometry);
    if (t > bestTris) { bestTris = t; best = obj; }
  });
  if (best) best.castShadow = true;
}

function prepareHouseGlbPrototype(model, def) {
  const source = model.clone(true);
  const prototype = normalizeHouseGlbModel(source, def);

  prototype.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow = false;   // réinitialisé : _applySingleShadowCaster marquera le seul caster utile
    object.receiveShadow = true;
    if (object.material) object.material = cloneHouseGlbMaterial(object.material);
  });
  _applySingleShadowCaster(prototype); // 1 caster par prototype (hérité par tous les clones)

  return prototype;
}

function cloneHouseGlbMaterial(material) {
  if (Array.isArray(material)) return material.map(item => cloneHouseGlbMaterial(item));

  const cloned = material.clone();
  cloned.side = THREE.DoubleSide;
  if ('emissiveIntensity' in cloned) cloned.emissiveIntensity = 0;
  if ('toneMapped' in cloned) cloned.toneMapped = true;
  // Strategy C : teinture ambrée chaude (lerp 8%) pour unifier les GLBs hétérogènes
  if (cloned.color) cloned.color.lerp(new THREE.Color(0xC8A060), 0.08);
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
  const def = pickHouseGlbDefinition(seedKey, index);
  group.name = `village-house-glb-${def.key}`;   // ex: village-house-glb-maison-1 (HUD per-type)

  const sectorAngle = (SECTOR_DEFS.findIndex(item => item.key === sector.key) * Math.PI / 3) + Math.PI / 6;
  const jitter = (hashUnit(`${seedKey}:house-rotation`) - 0.5) * 0.42;
  group.rotation.y = -sectorAngle + jitter;
  group.scale.setScalar((0.94 + hashUnit(`${seedKey}:house-scale`) * 0.18) * HOUSE_GLB_SIZE_MULTIPLIER);

  const prototype = houseGlbLibrary.get(def.key);

  if (!prototype) return group;

  const house = prototype.clone(true);
  house.name = `${def.key}-village-house-instance`;
  house.traverse(object => {
    if (!object.isMesh) return;
    // castShadow hérité du prototype (1 seul mesh par bâtiment via _applySingleShadowCaster)
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
  if (useDolmen) {
    monument.scale.multiplyScalar(0.40);
    if (DOLMEN_GLB_MODEL_DEF.sinkDepth) monument.position.y -= DOLMEN_GLB_MODEL_DEF.sinkDepth;
  }
  monument.traverse(object => {
    if (!object.isMesh) return;
    // castShadow hérité du prototype (1 seul mesh par monument)
    object.receiveShadow = true;
    object.userData.shadowFlagsApplied = true;
  });

  group.add(monument);
  return group;
}

function pickWatchtowerGlbDefinition(seedKey) {
  const totalWeight = WATCHTOWER_PACK_DEFS.reduce((total, def) => total + (def.spawnWeight ?? 1), 0);
  let roll = hashUnit(`${seedKey}:watchtower-variant`) * totalWeight;
  for (const def of WATCHTOWER_PACK_DEFS) {
    roll -= def.spawnWeight ?? 1;
    if (roll <= 0) return def;
  }
  return WATCHTOWER_PACK_DEFS[0];
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
      console.warn(`Tour de garde indisponible : ${def.key} (pack: ${WATCHTOWER_PACK_URL})`);
      createVillageWatchtowerObject.warnedMissingModel = true;
    }
    return group;
  }

  const tower = prototype.clone(true);
  tower.name = `${def.key}-village-watchtower-instance`;
  if (def.sinkDepth) tower.position.y -= def.sinkDepth;
  tower.traverse(object => {
    if (!object.isMesh) return;
    // castShadow hérité du prototype (1 seul mesh par tour)
    object.receiveShadow = true;
    object.userData.shadowFlagsApplied = true;
  });

  group.add(tower);
  return group;
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

