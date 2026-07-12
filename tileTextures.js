// ─── tileTextures.js — API matériaux biomes (cache, dispatch) ───────────────
// Découpé le 2026-07-11 (round 3, découpage sans risque, cf. CONTEXT.md §21) :
// les fonctions de dessin canvas (~400 lignes) ont été extraites vers
// tileTextureDrawing.js, avec l'état (cache textures générées, état animé,
// palette active) qui y vit désormais aussi (accesseurs exportés). Ce fichier
// garde l'API publique (matériaux Three.js + cache) — API inchangée pour
// scene.js/tileMesh.js/visualEnvironment.js.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { EDGE_COLOR, EDGE_TYPES } from './config.js';
import { getRealisticWaterMaterial } from './realisticWater.js';
import {
  getGeneratedTexture,
  getGeneratedFieldSideTexture,
  drawTexture,
  drawWaterTexture,
  drawFieldSideTexture,
  applyCanvasPalette,
  setActiveTexturePalette,
  getAnimatedTextureState,
  getAllAnimatedTextureStates
} from './tileTextureDrawing.js';

const materialCache = new Map();
const TEXTURED_TYPES = new Set([
  EDGE_TYPES.water,
  EDGE_TYPES.field,
  EDGE_TYPES.forest,
  EDGE_TYPES.grass,
  EDGE_TYPES.house,
  EDGE_TYPES.rail
]);

export function getBiomeMaterial(type, opacity = 1) {
  const key = `${type}_${opacity}`;
  if (materialCache.has(key)) return materialCache.get(key);

  if (type === EDGE_TYPES.water) {
    const material = getRealisticWaterMaterial(opacity);
    materialCache.set(key, material);
    return material;
  }

  const materialConfig = {
    color: EDGE_COLOR[type] ?? 0x222833,
    transparent: opacity < 1,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: opacity >= 1
  };

  if (TEXTURED_TYPES.has(type)) materialConfig.map = getGeneratedTexture(type);

  const material = new THREE.MeshLambertMaterial(materialConfig);
  material.name = `biome-${type}-top-material`;

  materialCache.set(key, material);
  return material;
}

export function getBiomeSideMaterial(type, opacity = 1) {
  const key = `side_${type}_${opacity}_clean`;
  if (materialCache.has(key)) return materialCache.get(key);

  if (type === EDGE_TYPES.water) {
    // Les flancs de l'eau sont visibles quand le shader de surface ondule.
    // Ils doivent donc rester dans la même famille de bleu que la surface,
    // sans éclairage Lambert qui les faisait virer au vert sombre.
    const material = new THREE.MeshBasicMaterial({
      color: 0x3aa6d8,
      transparent: opacity < 1,
      opacity,
      side: THREE.DoubleSide,
      depthWrite: opacity >= 1
    });
    material.name = 'dorfromantik-water-side-material';
    materialCache.set(key, material);
    return material;
  }

  const color = new THREE.Color(EDGE_COLOR[type] ?? 0x222833).multiplyScalar(0.72);
  const materialConfig = {
    color,
    transparent: opacity < 1,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: opacity >= 1
  };

  if (type === EDGE_TYPES.field) {
    materialConfig.map = getGeneratedFieldSideTexture();
  }

  const material = new THREE.MeshLambertMaterial(materialConfig);
  material.name = `biome-${type}-side-material`;

  materialCache.set(key, material);
  return material;
}

export function updateAnimatedBiomeTextures(timeSeconds = 0) {
  const waterState = getAnimatedTextureState(EDGE_TYPES.water);
  if (!waterState) return;

  drawWaterTexture(waterState.ctx, timeSeconds);
  applyCanvasPalette(EDGE_TYPES.water, waterState.ctx);

  // Très léger déplacement de la texture pour donner un courant lisible
  // sans modifier la géométrie ni les règles du jeu.
  waterState.texture.offset.x = (timeSeconds * 0.018) % 1;
  waterState.texture.offset.y = (Math.sin(timeSeconds * 0.35) * 0.015) % 1;
  waterState.texture.needsUpdate = true;
}

export function applyBiomeTexturePalette(palette = null) {
  setActiveTexturePalette(palette?.enabled === false ? null : palette);

  for (const state of getAllAnimatedTextureStates()) {
    if (!state?.ctx || !state?.texture) continue;

    if (state.side) drawFieldSideTexture(state.ctx);
    else drawTexture(state.type, state.ctx, 0);

    state.texture.needsUpdate = true;
  }
}

// 2026-07-06 — DIAG BORNÉ (remplace le watcher par setter qui a fait planter Chrome) : simple
// lecture passive de .transparent/.side sur les matériaux biome mis en cache, sans setter, sans
// stack trace. Coût = quelques lectures de propriétés, appelé depuis scene.js à cadence contrôlée.
export function debugBiomeMaterialSnapshot() {
  const out = [];
  for (const [key, material] of materialCache) {
    if (!material?.isMaterial) continue;
    out.push(`${material.name || key}:t=${material.transparent ? 1 : 0}:s=${material.side}`);
  }
  return out.join(' | ');
}
