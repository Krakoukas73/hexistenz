import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { createGLTFLoader } from './glbLoader.js';
import { HEX_SIZE, TILE_VISUAL, SECTOR_DEFS } from './config.js';
import { hashUnit100k as hashUnit } from './hashUtils.js';
import { getGravelSvgMaterial, getHouseMaterial } from './houseVillageMaterials.js';

/**
 * Chargement GLB et création des objets 3D du village :
 * maisons, tour de garde, cimetière.
 *
 * La dépendance circulaire avec houseOverlay est cassée via le pattern
 * callback : ensureHouseGlbModels(group, onReady) appelle onReady() quand
 * tous les modèles sont prêts, sans jamais importer houseOverlay.
 */

// ─── Constantes locales ────────────────────────────────────────────────────────

const HOUSE_SCALE = HEX_SIZE * 0.1332 * 0.93 * 0.90 * 0.93 * 0.96 * 1.05 * 1.05; // −10% −7% −10% −7% −4% +5% +5%
const HOUSE_GLB_SIZE_MULTIPLIER = 1.75;
const HOUSE_GLB_SPACING_MULTIPLIER = 1.12;

// ─── Définitions de modèles GLB ───────────────────────────────────────────────

const HOUSE_GLB_MODEL_DEFS = [
  { key: 'maison-medievale-petite-1',  url: './glb/batiments/medieval/maison-petite-1.glb',  size: 1.40 * 0.90, spawnWeight: 33 }, // −10%
  { key: 'maison-medievale-petite-2',  url: './glb/batiments/medieval/maison-petite-2.glb',  size: 1.40 * 0.90, spawnWeight: 33 }, // −10%
  { key: 'maison-medievale-petite-3',  url: './glb/batiments/medieval/maison-petite-3.glb',  size: 1.40 * 0.90, spawnWeight: 34 }, // −10% total=100
];
// Pack unique — les 3 tours sont des nodes dans le même fichier GLB.
// Chargement 1× par tour — 3 GLBs individuels (remplacent l'ancien pack tours.glb).
const WATCHTOWER_DEFS = [
  { key: 'tower-1', url: './glb/batiments/medieval/tour-1.glb', size: 5.5 * 0.605 * 1.07 * 0.94 * 1.07, spawnWeight: 25, sinkDepth: 0.05 }, // −50% +10% +7% −6% +7%
  { key: 'tower-2', url: './glb/batiments/medieval/tour-2.glb', size: 5.5 * 0.88  * 1.07 * 0.94 * 1.07, spawnWeight: 25, sinkDepth: 0.05 }, // −20% +10% +7% −6% +7%
  { key: 'tower-3', url: './glb/batiments/medieval/tour-3.glb', size: 5.5 * 1.242 * 1.07 * 0.94 * 1.07, spawnWeight: 25, sinkDepth: 0.05 }, // +35% +7% −6% +7%
  { key: 'tower-4', url: './glb/batiments/medieval/tour-4.glb', size: 5.5 * 0.88  * 1.07 * 0.94 * 1.07 * 1.20, spawnWeight: 25, sinkDepth: 0.05 }, // même base que tour-2 +20%

  { key: 'tower-6', url: './glb/batiments/medieval/tour-6.glb', size: 5.5 * 0.88  * 1.07 * 0.94 * 1.07 * 1.15, spawnWeight: 25, sinkDepth: 0.05 }, // +15%
];

// ─── État GLB (module-level, partagé entre chargeur et créateurs) ─────────────

const houseGlbLibrary   = new Map();
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

  let pending = HOUSE_GLB_MODEL_DEFS.length + WATCHTOWER_DEFS.length; // maisons + tours
  const finishOne = () => {
    pending -= 1;
    if (pending > 0) return;
    houseModelsLoading = false;
    onReady?.();
  };

  for (const def of HOUSE_GLB_MODEL_DEFS) {
    createGLTFLoader().load(
      def.url,
      gltf => {
        houseGlbLibrary.set(def.key, prepareHouseGlbPrototype(gltf.scene, def, { skipPalette: true }));
        finishOne();
      },
      undefined,
      error => {
        console.warn(`Modèle maison GLB indisponible : ${def.url}`, error);
        finishOne();
      }
    );
  }

  // Tours individuelles — 3 GLBs séparés (1 tour par fichier)
  for (const def of WATCHTOWER_DEFS) {
    createGLTFLoader().load(
      def.url,
      gltf => {
        console.log(`[tours] "${def.key}" GLB chargé ✓`);
        watchtowerGlbLibrary.set(def.key, prepareHouseGlbPrototype(gltf.scene, def, { skipPalette: false }));
        finishOne();
      },
      undefined,
      error => {
        console.warn(`[tours] ERREUR chargement : ${def.url}`, error);
        finishOne();
      }
    );
  }
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
  if (best) {
    best.castShadow = true;
    best.userData.castShadowOriginal = true; // restaurable par applySceneShadowFlags après culling
  }
}

function prepareHouseGlbPrototype(model, def, { skipPalette = false } = {}) {
  const source = model.clone(true);
  const prototype = normalizeHouseGlbModel(source, def);

  prototype.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow = false;   // réinitialisé : _applySingleShadowCaster marquera le seul caster utile
    object.receiveShadow = true;
    if (object.material) object.material = cloneHouseGlbMaterial(object.material, skipPalette);
  });
  _applySingleShadowCaster(prototype); // 1 caster par prototype (hérité par tous les clones)

  return prototype;
}

function cloneHouseGlbMaterial(material, skipPalette = false) {
  if (Array.isArray(material)) return material.map(item => cloneHouseGlbMaterial(item, skipPalette));

  const cloned = material.clone();
  cloned.side = THREE.DoubleSide;
  if ('emissiveIntensity' in cloned) cloned.emissiveIntensity = 0;
  if ('toneMapped' in cloned) cloned.toneMapped = true;
  if (skipPalette) cloned.userData.skipPaletteHarmony = true; // maisons seulement — noms GLB internes hétérogènes → palette incohérente
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
  // Rotation libre 360° par index → maisons du même type jamais parallèles sur un même triangle
  const jitter = hashUnit(`${seedKey}:house-rotation:${index ?? 0}`) * Math.PI * 2;
  group.rotation.y = jitter;
  group.scale.setScalar((0.94 + hashUnit(`${seedKey}:house-scale`) * 0.18) * HOUSE_GLB_SIZE_MULTIPLIER);

  const prototype = houseGlbLibrary.get(def.key);

  if (!prototype) return group;

  const house = prototype.clone(true);
  house.name = `${def.key}-village-house-instance`;
  house.traverse(object => {
    if (!object.isMesh) return;
    // castShadow hérité du prototype (1 seul mesh par bâtiment via _applySingleShadowCaster)
    object.receiveShadow = true;
    object.userData.castShadowOriginal = object.castShadow; // hérité : true pour le caster, false pour les autres
    object.userData.shadowFlagsApplied = true;
  });

  group.add(house);
  return group;
}

function pickWatchtowerGlbDefinition(seedKey) {
  const totalWeight = WATCHTOWER_DEFS.reduce((total, def) => total + (def.spawnWeight ?? 1), 0);
  let roll = hashUnit(`${seedKey}:watchtower-variant`) * totalWeight;
  for (const def of WATCHTOWER_DEFS) {
    roll -= def.spawnWeight ?? 1;
    if (roll <= 0) return def;
  }
  return WATCHTOWER_DEFS[0];
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
      console.warn(`Tour de garde indisponible : ${def.key}`);
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
    object.userData.castShadowOriginal = object.castShadow; // hérité : true pour le caster, false pour les autres
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

