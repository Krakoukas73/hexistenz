/**
 * terrainMerge.js — Fusion des meshes terrain pour réduire les draw calls.
 *
 * Problème : chaque tuile hexagonale crée 7 meshes (6 secteurs + 1 centre),
 * chacun avec 2 material groups = ~14 GPU draw calls par tuile.
 * Sur 130 tuiles : ~1820 DCs juste pour le terrain.
 *
 * Solution : fusionner tous les meshes de même matériau en un seul Mesh.
 * Résultat : 7 biomes × 2 (top + flancs) = 14 DCs pour toute la carte.
 *
 * Design :
 *  - Les meshes hex-sector-* / hex-center-* originaux sont masqués (visible=false)
 *    dès la création de la tuile.
 *  - Un groupe "terrain-merged" contient les meshes fusionnés qui gèrent le rendu.
 *  - Rail/road sub-meshes restent dans les tile groups originaux et gardent leur LOD.
 *
 * API :
 *   createTerrainMergeGroup()                    → THREE.Group à ajouter à la scène
 *   hideTerrainMeshes(tileMeshGroup)             → à appeler juste après createTileMesh
 *   addTileToTerrainMerge(group, tileMeshGroup)  → POSE : merge incrémental O(1)
 *   rebuildTerrainMerge(group, placedTiles)      → UNDO / init : rebuild complet O(N)
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { mergeGeometries } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/utils/BufferGeometryUtils.js';
import { isRealisticWaterMaterial } from './realisticWater.js';

/** Noms des meshes terrain dans les tile groups — même convention que le HUD. */
const TERRAIN_MESH_PREFIXES = ['hex-sector-', 'hex-center-'];

/**
 * Retourne true si le mesh est un mesh terrain (à masquer).
 * Inclut l'eau : les prismes eau d'origine doivent rester masqués.
 * @param {THREE.Mesh} mesh
 */
function isTerrainMesh(mesh) {
  if (!mesh.isMesh || !mesh.name) return false;
  return TERRAIN_MESH_PREFIXES.some(p => mesh.name.startsWith(p));
}

/**
 * Retourne true si le mesh terrain doit être FUSIONNÉ (rendu par le merge).
 * L'eau est exclue du merge : elle est rendue par waterSurfaceOverlay.js
 * (nappe continue transparente + riverbed), pas ici.
 * @param {THREE.Mesh} mesh
 */
function isMergeableTerrainMesh(mesh) {
  if (!isTerrainMesh(mesh)) return false;
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return !mats.some(isRealisticWaterMaterial);
}

/**
 * Masque tous les meshes terrain d'un tile group.
 * À appeler juste après createTileMesh, avant scene.add(mesh).
 * Les meshes masqués ici sont remplacés visuellement par les merged meshes.
 *
 * @param {THREE.Group} tileMeshGroup — groupe retourné par createTileMesh()
 */
export function hideTerrainMeshes(tileMeshGroup) {
  tileMeshGroup.traverse(child => {
    if (isTerrainMesh(child)) {
      child.visible = false;
      child.userData._mergedByTerrainMerge = true;
    }
  });
}

/**
 * Crée le groupe racine pour les meshes terrain fusionnés.
 * À ajouter à la scène une seule fois.
 * @returns {THREE.Group}
 */
export function createTerrainMergeGroup() {
  const group = new THREE.Group();
  group.name = 'terrain-merged-render';
  group.frustumCulled = false; // Même comportement que le reste (shader courbure)
  return group;
}

/**
 * Merge incrémental : ajoute la géométrie d'UNE SEULE tuile aux meshes fusionnés.
 * O(1) par rapport au nombre de tuiles déjà posées — à utiliser à chaque pose.
 * Pour chaque matériau (top/side) : trouve le merged mesh existant, fusionne avec
 * la nouvelle géométrie, remplace le mesh. Si premier tile du matériau : crée direct.
 *
 * @param {THREE.Group} mergeGroup    — groupe créé par createTerrainMergeGroup()
 * @param {THREE.Group} tileMeshGroup — groupe d'une seule tuile (retourné par createTileMesh)
 */
export function addTileToTerrainMerge(mergeGroup, tileMeshGroup) {
  // Force le calcul des matrices monde (la tuile vient d'être positionnée)
  tileMeshGroup.updateMatrixWorld(true);

  tileMeshGroup.traverse(child => {
    if (!isMergeableTerrainMesh(child)) return;

    const mats = Array.isArray(child.material) ? child.material : [child.material];
    if (mats.length < 2) return;

    const groups = child.geometry.groups;
    if (!groups || groups.length < 2) return;

    const wm = child.matrixWorld;

    // Top geometry
    const topGeo = _extractGroupGeometry(child.geometry, groups[0]);
    topGeo.applyMatrix4(wm);
    _appendToMergeGroup(mergeGroup, topGeo, mats[0]);

    // Side geometry
    const sideGeo = _extractGroupGeometry(child.geometry, groups[1]);
    sideGeo.applyMatrix4(wm);
    _appendToMergeGroup(mergeGroup, sideGeo, mats[1]);
  });
}

/**
 * Reconstruit tous les meshes terrain fusionnés depuis les tuiles actuellement posées.
 * Opération complète — O(N tuiles). À utiliser pour undo/init/applyRemoteGameState.
 *
 * @param {THREE.Group}   mergeGroup  — groupe créé par createTerrainMergeGroup()
 * @param {Map}           placedTiles — Map de la scène (même référence que scene.js)
 */
export function rebuildTerrainMerge(mergeGroup, placedTiles) {
  // 1. Libérer l'ancienne géométrie fusionnée
  _disposeMergeGroup(mergeGroup);

  // 2. Collecter les géométries par paire (topMaterial, sideMaterial)
  //    key : `topMat.uuid|sideMat.uuid`
  const byMaterial = new Map();

  for (const placedTile of placedTiles.values()) {
    const tileGroup = placedTile.mesh;
    if (!tileGroup) continue;

    // Force le calcul des matrices monde pour avoir des positions correctes
    tileGroup.updateMatrixWorld(true);

    tileGroup.traverse(child => {
      if (!isMergeableTerrainMesh(child)) return;

      const mats = Array.isArray(child.material) ? child.material : [child.material];
      if (mats.length < 2) return;

      const topMat  = mats[0];
      const sideMat = mats[1];
      const key     = `${topMat.uuid}|${sideMat.uuid}`;

      if (!byMaterial.has(key)) {
        byMaterial.set(key, { topGeos: [], sideGeos: [], topMat, sideMat });
      }

      // Extraire les géométries top et sides en espace monde
      const groups = child.geometry.groups;
      if (!groups || groups.length < 2) return;

      const wm = child.matrixWorld;
      const entry = byMaterial.get(key);

      const topGeo = _extractGroupGeometry(child.geometry, groups[0]);
      topGeo.applyMatrix4(wm);
      entry.topGeos.push(topGeo);

      const sideGeo = _extractGroupGeometry(child.geometry, groups[1]);
      sideGeo.applyMatrix4(wm);
      entry.sideGeos.push(sideGeo);
    });
  }

  // 3. Créer les meshes fusionnés
  for (const { topGeos, sideGeos, topMat, sideMat } of byMaterial.values()) {
    if (topGeos.length > 0) {
      const merged = mergeGeometries(topGeos);
      topGeos.forEach(g => g.dispose());
      if (merged) mergeGroup.add(_makeMergedMesh(merged, topMat));
    }
    if (sideGeos.length > 0) {
      const merged = mergeGeometries(sideGeos);
      sideGeos.forEach(g => g.dispose());
      if (merged) mergeGroup.add(_makeMergedMesh(merged, sideMat));
    }
  }
}

// ── Helpers privés ────────────────────────────────────────────────────────────

/**
 * Fusionne `newGeo` dans le merged mesh existant qui partage le même matériau.
 * Si aucun mesh existant → crée directement. Libère les géométries intermédiaires.
 * Les matériaux biome sont mis en cache dans tileTextures.js → comparaison par .uuid.
 */
function _appendToMergeGroup(mergeGroup, newGeo, mat) {
  // Cherche le merged mesh existant pour ce matériau (uuid stable car caché par getBiomeMaterial)
  const existing = mergeGroup.children.find(
    m => m.isMesh && m.material && m.material.uuid === mat.uuid
  );

  let merged;
  if (existing) {
    // Fusionne géométrie accumulée + nouvelle tuile
    merged = mergeGeometries([existing.geometry, newGeo]);
    existing.geometry.dispose();
    mergeGroup.remove(existing);
    newGeo.dispose();
  } else {
    // Première tuile avec ce matériau — utilise directement la géométrie
    merged = newGeo;
  }

  if (merged) mergeGroup.add(_makeMergedMesh(merged, mat));
}

/**
 * Met à jour l'attribut aShoreDepth sur tous les meshes terrain d'un tile group.
 * Permet de corriger la profondeur bathymétrique après ajout d'un voisin eau.
 * À appeler avant rebuildTerrainMerge pour que la géométrie source soit à jour.
 *
 * @param {THREE.Group} tileMeshGroup — groupe tuile (retourné par createTileMesh)
 * @param {number}      shoreDepth   — nouvelle valeur [0,1] (0=rive, 1=mer ouverte)
 */
export function updateTileShoreDepth(tileMeshGroup, shoreDepth) {
  tileMeshGroup.traverse(child => {
    if (!isTerrainMesh(child)) return;
    const attr = child.geometry.attributes.aShoreDepth;
    if (!attr) return;
    attr.array.fill(shoreDepth);
    attr.needsUpdate = true;
  });
}

/**
 * Vide et libère tous les enfants du mergeGroup.
 * @param {THREE.Group} group
 */
function _disposeMergeGroup(group) {
  for (let i = group.children.length - 1; i >= 0; i--) {
    const child = group.children[i];
    child.geometry?.dispose();
    group.remove(child);
  }
}

/**
 * Crée un Mesh fusionné correctement configuré (pas de shadow cast, curvature ok).
 * @param {THREE.BufferGeometry} geo
 * @param {THREE.Material}       mat
 * @returns {THREE.Mesh}
 */
function _makeMergedMesh(geo, mat) {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'terrain-merged-mesh';
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.frustumCulled = false;            // Courbure monde nécessite frustumCulled=false
  mesh.userData.disableCastShadow = true;
  mesh.userData.shadowFlagsApplied = true;
  return mesh;
}

/**
 * Extrait les triangles d'un groupe d'une géométrie indexée en une nouvelle
 * géométrie autonome avec des attributs compactés (seuls les sommets utilisés).
 *
 * @param {THREE.BufferGeometry} geometry — géométrie source
 * @param {{ start: number, count: number }} group — groupe à extraire
 * @returns {THREE.BufferGeometry}
 */
function _extractGroupGeometry(geometry, group) {
  const allIdx = geometry.index.array;
  const start  = group.start;
  const count  = group.count;

  // Mapper ancien index → nouvel index compact
  const indexMap  = new Map();
  let   nextIndex = 0;
  const newIdx    = new Uint32Array(count);

  for (let i = 0; i < count; i++) {
    const orig = allIdx[start + i];
    if (!indexMap.has(orig)) indexMap.set(orig, nextIndex++);
    newIdx[i] = indexMap.get(orig);
  }

  // Construire les attributs compactés
  const subGeo = new THREE.BufferGeometry();
  subGeo.setIndex(new THREE.BufferAttribute(newIdx, 1));

  for (const [name, attr] of Object.entries(geometry.attributes)) {
    const itemSize = attr.itemSize;
    const data     = new Float32Array(nextIndex * itemSize);
    for (const [orig, newI] of indexMap) {
      for (let k = 0; k < itemSize; k++) {
        data[newI * itemSize + k] = attr.array[orig * itemSize + k];
      }
    }
    subGeo.setAttribute(name, new THREE.BufferAttribute(data, itemSize));
  }

  return subGeo;
}
