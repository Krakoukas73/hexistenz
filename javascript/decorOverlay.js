/**
 * decorOverlay.js — Orchestrateur principal du rendu décor / props / effets eau.
 *
 * Responsabilités :
 *   - Cycle de vie : createDecorOverlay / rebuildDecorOverlay / updateDecorOverlay
 *   - Définitions du pool de props (PROP_MODEL_DEFS) et constantes de taille
 *   - Splashes eau (createWaterVoidSplashes)
 *   - LOD mises à jour (updateNaturalPropsLOD, updateFieldDecorLOD)
 *   - Toutes les constantes et l'état singleton partagés avec les sous-fichiers
 *
 * Découpé le 2026-07-11 (round 3, découpage sans risque, cf. CONTEXT.md §21) :
 * le chargement/normalisation/instanciation des GLB props a été extrait vers
 * decorPropModels.js, et les flocks oiseaux/mouettes vers decorBirdModels.js.
 * Ce fichier réexporte propGlbLibrary/createPropModel/createBirdFlock/
 * createSeagullFlock pour ne rien casser chez les 6 importateurs externes
 * (characterOverlay.js, fieldZonesOverlay.js, houseOverlay.js,
 * naturalPropsOverlay.js, villageDecorOverlay.js, waterBirdOverlay.js).
 *
 * Exports publics (scène) :
 *   createDecorOverlay, rebuildDecorOverlay, updateDecorOverlay,
 *   updateNaturalPropsLOD, updateFieldDecorLOD
 *
 * Exports partagés (sous-fichiers) :
 *   propGlbLibrary, _propInstanceDummy, _snapNormal,
 *   getPropChunkKey, computePropBoundingSphere,
 *   createPropModel, createBirdFlock, createSeagullFlock,
 *   FIELD_FLAG_MIN_TOTAL, FIELD_SURFACE_Y, SPECIAL_BUILDING_SAFE_RADIUS,
 *   SPECIAL_BUILDING_BOAT_SAFE_RADIUS, ROAD_DECOR_Y, BARREL_TARGET_WIDTH,
 *   SHORE_BOAT_Y, NATURAL_FLOWER_TARGET_WIDTH, NATURAL_MUSHROOM_TARGET_WIDTH,
 *   NATURAL_DECOR_VARIANTS
 *
 * Les imports circulaires (sous-fichiers ↔ decorOverlay, y compris les deux
 * nouveaux decorPropModels.js/decorBirdModels.js) sont valides car tous les
 * accès croisés se font dans des corps de fonctions (live bindings ES modules).
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import {
  EDGE_ORDER,
  EDGE_TYPES,
  HEX_SIZE,
  TILE_VISUAL,
  SECTOR_DEFS,
  FIELD_BIRD_FLOCK_MODEL_URL,
  FIELD_BIRD_FLOCK_TARGET_WIDTH,
  FIELD_BIRD_FLOCK_ANIMATION_SPEED,
  WATER_SEAGULL_MODEL_URL,
  WATER_SEAGULL_TARGET_WIDTH,
  WATER_SEAGULL_ANIMATION_SPEED
} from './config.js';
import { hashUnit10k as hashUnit, hashNumber } from './hashUtils.js';
import { axialToWorld, makeHexKey } from './hex.js';
import { HEX_DIRECTIONS } from './placementRules.js';
import {
  HEX_CHUNK_SIZE,
  LOD_MICRO_CULL_DISTANCE,
  LOD_PLANT_CULL_DISTANCE,
  LOD_ROCK_CULL_DISTANCE,
  LOD_ROAD_DECOR_CULL_DISTANCE,
  LOD_SIGN_CULL_DISTANCE,
  LOD_SHORE_BOAT_CULL_DISTANCE,
  LOD_VILLAGE_PROP_CULL_DISTANCE,
  LOD_ANIMAL_CULL_DISTANCE,
  LOD_FOUNTAIN_CULL_DISTANCE,
  LOD_CROW_CULL_DISTANCE,
  LOD_SEAGULL_CULL_DISTANCE,
  LOD_MILL_CULL_DISTANCE,
  DEBUG_FLAGS
} from './variables.js';
import { getTileEdgeType, clearGroup } from './tileUtils.js';
import { getHexVertex, normalize2 } from './hexGeometry.js';
// Sous-fichiers — imports circulaires valides (accès dans des corps de fonctions uniquement)
import { createFieldFlags, collectSpecialBuildingSafeZones } from './fieldZonesOverlay.js';
import { createWaterBirdFlocks } from './waterBirdOverlay.js';
import { createNaturalGroundProps } from './naturalPropsOverlay.js';
import { createRoadsideVillageProps, createShoreBoats } from './villageDecorOverlay.js';
// Sous-fichiers extraits le 2026-07-11 (round 3) — import circulaire valide (cf. header).
import { propGlbLibrary, createPropModel, ensurePropModels, isPropModelsLoading } from './decorPropModels.js';
import { createBirdFlock, createSeagullFlock, ensureBirdModel, ensureSeagullModel, isBirdModelLoading, isSeagullModelLoading } from './decorBirdModels.js';

// Réexports pour compat externe (characterOverlay.js, fieldZonesOverlay.js, houseOverlay.js,
// naturalPropsOverlay.js, villageDecorOverlay.js, waterBirdOverlay.js) — API inchangée.
export { propGlbLibrary, createPropModel, createBirdFlock, createSeagullFlock };
// 2026-07-06 : les personnages ont leur propre overlay instancié (characterOverlay.js,
// createCharacterOverlay/rebuildCharacterOverlay/updateCharacterLOD, piloté par scene.js) —
// ils ne sont plus créés ni suivis en LOD ici. Cf. mémoire projet gpu-throttle-investigation.

const SECTOR_BY_KEY     = Object.fromEntries(SECTOR_DEFS.map(s => [s.key, s]));
const DIRECTION_BY_EDGE = Object.fromEntries(HEX_DIRECTIONS.map(d => [d.edge, d]));

// ─── Constantes exportées (partagées avec sous-fichiers) ──────────────────────

const WATER_SURFACE_Y = TILE_VISUAL.waterThickness ?? 0.06; // fond eau à y=0, surface à +waterThickness
export const FIELD_SURFACE_Y = (TILE_VISUAL.tileThickness ?? 0.12) * 0.783; // surface champ = dessus tuile field (≈ 0.094)
export const FIELD_FLAG_MIN_TOTAL            = 5;
const        FIELD_FLAG_2_TARGET_HEIGHT      = HEX_SIZE * 0.384 * 1.06 * 1.05 * 1.11 * 0.92 * 0.88 * 0.93 * 0.88 * 0.96 * 0.93 * 0.95 * 0.94; // moulin-2: +20% +6% +5% +11% −8% −12% −7% −12% −4% −7% −5% −6%
const        FIELD_FLAG_3_TARGET_HEIGHT      = HEX_SIZE * 0.384 * 1.06 * 1.05 * 1.11 * 0.92 * 0.88 * 0.93 * 0.88 * 0.96 * 0.93 * 0.95 * 0.94; // moulin-1: même base −6%
const        FOUNTAIN_1_TARGET_WIDTH         = HEX_SIZE * 0.18 * 0.93 * 0.90 * 0.96 * 0.91 * 0.93 * 0.87 * 0.90; // −10% (2026-07-04) −7% −10% −4% −9% −7% −13%
const        FOUNTAIN_2_TARGET_WIDTH         = HEX_SIZE * 0.18 * 0.93 * 0.80 * 0.96 * 0.91 * 0.93 * 0.87 * 0.90; // −10% (2026-07-04) −7% −20% −4% −9% −7% −13%
export const HAY_BALE_TARGET_WIDTH           = HEX_SIZE * 0.14 * 2.2 * 1.3 * 1.15 * 1.15 * 1.06 * 0.92 * 0.92 * 0.93 * 0.87 * 0.90 * 0.90 * 0.94; // +15% +6% −8% −8% −7% −13% −10% −10% −6%
const        SIGNPOST_TARGET_HEIGHT          = HEX_SIZE * 0.28 * 0.85 * 0.93 * 0.75 * 0.88 * 0.83 * 0.87 * 0.82; // −15% −7% −25% −12% −17% −13% −18%
const        SHORE_BOAT_TARGET_LENGTH        = HEX_SIZE * 0.175 * 0.88 * 0.92 * 0.80 * 0.90; // −12% −8% −20% −10%
export const PILE_DE_BOIS_TARGET_LENGTH      = HEX_SIZE * 0.14 * 1.08 * 1.07 * 0.88; // piles de bois en forêt — +8% +7% −12% (2026-07-04)
export const SPECIAL_BUILDING_SAFE_RADIUS    = HEX_SIZE * 0.34;
export const SPECIAL_BUILDING_BOAT_SAFE_RADIUS = HEX_SIZE * 0.18;
export const NATURAL_FLOWER_TARGET_WIDTH     = HEX_SIZE * 0.047 * 0.85 * 0.93 * 0.85 * 0.85 * 0.90 * 0.88 * 0.94 * 0.96 * 0.92 * 0.88 * 0.93 * 0.83 * 0.92 * 0.90; // −15% −7% −15% −15% −10% −12% −6% −4% −8% −12% −7% −17% −8% −10% (2026-07-04)
export const NATURAL_GRASS_TARGET_WIDTH      = HEX_SIZE * 0.058 * 1.15 * 0.91 * 0.87 * 0.94 * 0.96 * 0.90 * 0.88 * 0.90 * 0.85 * 0.87 * 0.92 * 0.88 * 0.90; // herbes/touffes/jeunes pousses (plantes.glb) — +15% −9% −13% −6% −4% −10% −12% −10% −15% −13% −8% −12% −10% (2026-07-04)
export const NATURAL_BRINDILLE_TARGET_WIDTH  = NATURAL_GRASS_TARGET_WIDTH * 0.525 * 0.92 * 1.30;     // fougere.glb — +30% (hérite −8% de grass)
export const NATURAL_SHRUB_TARGET_WIDTH      = HEX_SIZE * 0.095 * 0.91 * 0.87 * 0.94 * 0.96 * 0.90 * 0.92; // fougères et buissons — forêts uniquement (plantes.glb) — −9% −13% −6% −4% −10% −8%
const        NATURAL_ROCK_TARGET_LENGTH      = HEX_SIZE * 0.106 * 0.85 * 0.93 * 0.88 * 0.85 * 0.96 * 0.88 * 0.87 * 0.90; // −10% (2026-07-04) −15% −7% −12% −15% −4% −12% −13% (2026-07-04)
const        NATURAL_REED_TARGET_HEIGHT      = HEX_SIZE * 0.105 * 0.85 * 0.93 * 0.88 * 0.85 * 0.92 * 0.94 * 0.90 * 0.93 * 0.88 * 0.90 * 0.86 * 0.83 * 0.92 * 0.88 * 0.90; // −15% −7% −12% −15% −8% −6% −10% −7% −12% −10% −14% −17% −8% −12% −10% (2026-07-04)
export const NATURAL_MUSHROOM_TARGET_WIDTH   = HEX_SIZE * 0.043 * 0.85 * 0.93 * 0.88 * 0.88 * 0.95 * 0.96 * 0.90 * 0.88 * 0.88 * 0.90 * 0.93 * 0.83 * 0.88 * 0.92 * 1.08 * 0.88; // +8% −12%
export const BARREL_TARGET_WIDTH             = HEX_SIZE * 0.1031 * 0.85 * 0.88 * 0.93 * 0.88 * 0.92 * 0.92 * 0.90 * 0.91 * 0.90; // −15% −12% −7% −12% −8% −8% −10% −9% −10%
const        CART_TARGET_LENGTH              = HEX_SIZE * 0.291 * 0.85 * 0.85 * 0.88 * 0.96 * 0.94 * 0.91 * 0.93 * 0.90; // −15% −15% −12% −4% −6% −9% −7% −10%
const        MEULE_TARGET_WIDTH             = HEX_SIZE * 0.095 * 0.90; // meule de moulin — petite, décorative — −10% (2026-07-04)
export const NATURAL_DEER_TARGET_WIDTH       = HEX_SIZE * 0.16 * 0.88 * 0.92 * 0.92 * 0.92 * 0.89 * 0.80;  // cerf sauvage (forêt / prairie / champ) — −12% −8% −8% −8% −11% −20%
const        ANIMAL_DOG_TARGET_WIDTH         = HEX_SIZE * 0.085 * 0.92 * 0.80 * 0.75; // chien de village −8% −20% −25%
const        ANIMAL_HORSE_TARGET_WIDTH       = HEX_SIZE * 0.20 * 0.88 * 0.92 * 0.92 * 0.94 * 0.80 * 0.90;  // cheval de village −12% −8% −8% −6% −20% −10%
// Silhouette humaine debout (villageois + rôdeurs de forêt) — mode 'height' (bbox verticale).
// Ordre de grandeur calibré entre le chien (0.063 de long) et le cheval (0.112 de long) : à ajuster
// au premier rendu si les personnages paraissent trop grands/petits à côté des maisons.
// Exporté (2026-07-04) : characterOverlay.js en a besoin pour calibrer son clearance sol
// (groundOff/snap) en PROPORTION de cette hauteur plutôt qu'en valeur absolue fixe — cf.
// bug "NPC flottants" (une clearance absolue calibrée avant les −35%/−13%/−10% ci-dessous
// représente un décollement du sol de plus en plus visible à mesure que le perso rétrécit).
export const CHARACTER_TARGET_HEIGHT         = HEX_SIZE * 0.095 * 0.65 * 0.87 * 0.90; // −35% (2026-07-04, trop grands au rendu) −13% (2026-07-04, NPC réduits) −10% (2026-07-04)
export const ROAD_DECOR_Y                    = ((TILE_VISUAL.tileThickness ?? 0.12) * -0.30) + 0.010;
export const SHORE_BOAT_Y                    = WATER_SURFACE_Y + 0.022; // barques échouées légèrement au-dessus de la surface

export const NATURAL_DECOR_VARIANTS = {
  flower:    ['flower-1', 'flower-2', 'flower-3', 'flower-4'],
  brindille: ['brindille'],
  grass:     ['berry-1', 'berry-1', 'berry-1', 'berry-1', 'berry-1',
              'berry-2', 'berry-2', 'berry-2', 'berry-2', 'berry-2',  // 2026-07-06 : ×6→×5 chacun
              'berry-3', 'berry-3', 'berry-3', 'berry-3', 'berry-3',  // (perf GPU — "Plantes à baies"
              'berry-4', 'berry-4', 'berry-4', 'berry-4', 'berry-4',  // = 27.6% des triangles scène,
              'berry-5', 'berry-5', 'berry-5', 'berry-5', 'berry-5',  // 1er poste), 30/45 = 67% du pool
              'berry-6', 'berry-6', 'berry-6', 'berry-6', 'berry-6',  // (était 36/51 = 71%)
              'plant-misc2', 'plant-misc3', 'plant-misc4', 'plant-misc5',        // ×1 chacun
              'plant-grass1', 'plant-grass2', 'plant-sapling1', 'plant-sapling2',
              'plante-1', 'plante-2', 'plante-3', 'plante-4', 'plante-5', 'plante-6', 'plante-7'],
  shrub:     ['shrub-fern', 'shrub-monstera1', 'shrub-monstera2', 'shrub-misc1', 'plante-haute'],
  'pile-de-bois': ['pile-de-bois-1', 'pile-de-bois-2', 'pile-de-bois-3', 'pile-de-bois-4'],
  deer:     ['animal-deer'],
  rock:     ['rock-1', 'rock-2', 'rock-3', 'rock-4'],
  reed:     ['reed'],
  mushroom: ['mushroom-1', 'mushroom-2'],
  'hay-bale': ['hay-bale']
};

export const BARREL_VARIANTS = ['barrel-1', 'barrel-2', 'barrel-3', 'barrel-4', 'barrel-5'];

// Exportée : consommée par decorPropModels.js::ensurePropModels (import circulaire, cf. header).
export const PROP_MODEL_DEFS = [
  { key: 'field-flag-2', url: './glb/batiments/medieval/moulin-2.glb', target: FIELD_FLAG_2_TARGET_HEIGHT * 1.70, mode: 'height', noSkeletonPose: true },
  { key: 'field-flag-3', url: './glb/batiments/medieval/moulin-1.glb', target: FIELD_FLAG_3_TARGET_HEIGHT * 1.70, mode: 'height', noSkeletonPose: true },
  { key: 'hay-bale',       url: './glb/decor/botte-foin.glb',        target: HAY_BALE_TARGET_WIDTH,          mode: 'length', kind: 'hay-bale' },
  { key: 'pile-de-bois-1', url: './glb/decor/pile-de-bois-1.glb',  target: PILE_DE_BOIS_TARGET_LENGTH * 1.23 * 0.90, mode: 'length', kind: 'pile-de-bois' }, // +23% −10%
  { key: 'pile-de-bois-2', url: './glb/decor/pile-de-bois-2.glb',  target: PILE_DE_BOIS_TARGET_LENGTH * 1.13 * 0.88 * 0.90, mode: 'length', kind: 'pile-de-bois' }, // +13% −12% −10%
  { key: 'pile-de-bois-3', url: './glb/decor/pile-de-bois-3.glb',  target: PILE_DE_BOIS_TARGET_LENGTH * 0.83 * 0.85,        mode: 'length', kind: 'pile-de-bois' }, // −17% −15%
  { key: 'pile-de-bois-4', url: './glb/decor/pile-de-bois-4.glb',  target: PILE_DE_BOIS_TARGET_LENGTH * 0.83 * 0.85,        mode: 'length', kind: 'pile-de-bois' }, // −17% −15%
  { key: 'fountain-1',   url: './glb/decor/fontaine-1.glb',  target: FOUNTAIN_1_TARGET_WIDTH, mode: 'length', bypassBboxCheck: true, groundOffsetDelta: -0.017 },
  { key: 'fountain-2',   url: './glb/decor/fontaine-2.glb',  target: FOUNTAIN_2_TARGET_WIDTH, mode: 'length', groundOffsetDelta: -0.004 },
  { key: 'fountain-3',   url: './glb/decor/fontaine-3.glb',  target: FOUNTAIN_1_TARGET_WIDTH, mode: 'length', bypassBboxCheck: true, groundOffsetDelta: 0 }, // corrigé : −0.017 (copié de fountain-1) l'enfonçait sous le sol — retiré
  { key: 'road-signpost-1', url: './glb/decor/poteau-indicateur-1.glb', target: SIGNPOST_TARGET_HEIGHT, mode: 'height' },
  { key: 'road-signpost-2', url: './glb/decor/poteau-indicateur-2.glb', target: SIGNPOST_TARGET_HEIGHT, mode: 'height' },
  { key: 'road-signpost-3', url: './glb/decor/poteau-indicateur-3.glb', target: SIGNPOST_TARGET_HEIGHT, mode: 'height' },
  { key: 'shore-boat-1', url: './glb/decor/barque-1.glb',    target: SHORE_BOAT_TARGET_LENGTH * 0.65, mode: 'length', bypassBboxCheck: true, noShadow: true }, // 2026-07-04 perf : petite barque échouée, ombre peu visible
  { key: 'shore-boat-2', url: './glb/decor/barque-2.glb',    target: SHORE_BOAT_TARGET_LENGTH * 0.65, mode: 'length', noShadow: true }, // 2026-07-04 perf
  { key: 'shore-boat-3', url: './glb/decor/barque-3.glb',    target: SHORE_BOAT_TARGET_LENGTH * 0.65 * 1.14, mode: 'length', bypassBboxCheck: true, noShadow: true }, // +14% — 2026-07-04 perf
  { key: 'flower-1',     url: './glb/plantes/flower-1.glb',  target: NATURAL_FLOWER_TARGET_WIDTH,     mode: 'length', kind: 'flower' },
  { key: 'flower-2',     url: './glb/plantes/flower-2.glb',  target: NATURAL_FLOWER_TARGET_WIDTH,     mode: 'length', kind: 'flower' },
  { key: 'flower-3',     url: './glb/plantes/flower-3.glb',  target: NATURAL_FLOWER_TARGET_WIDTH,     mode: 'length', kind: 'flower' },
  { key: 'flower-4',     url: './glb/plantes/flower-4.glb',  target: NATURAL_FLOWER_TARGET_WIDTH,     mode: 'length', kind: 'flower' },
  // Pool d'herbes/touffes/jeunes pousses — prairies et champs (plantes.glb package)
  // Fougères et buissons — forêts uniquement (shrub-* → castShadow actif, volume significatif)
  { key: 'brindille',       url: './glb/plantes/fougere.glb',                           target: NATURAL_BRINDILLE_TARGET_WIDTH,            mode: 'length', kind: 'brindille' }, // +35% count — kind séparé pour densité indépendante
  { key: 'shrub-fern',      url: './glb/plantes/plantes.glb', asset: 'Plant_Fern',      target: NATURAL_SHRUB_TARGET_WIDTH * 1.60 * 0.63 * 0.83, mode: 'length', kind: 'shrub' }, // +60% −37% −17%
  { key: 'shrub-monstera1', url: './glb/plantes/plantes.glb', asset: 'Plant_Monstera1', target: NATURAL_SHRUB_TARGET_WIDTH * 0.63 * 0.83 * 0.90 * 0.89, mode: 'length', kind: 'shrub' }, // −11%
  { key: 'shrub-monstera2', url: './glb/plantes/plantes.glb', asset: 'Plant_Monstera2', target: NATURAL_SHRUB_TARGET_WIDTH * 0.63 * 0.83 * 0.90 * 0.89, mode: 'length', kind: 'shrub' }, // −11%
  { key: 'shrub-misc1',     url: './glb/plantes/plantes.glb', asset: 'Plant_Misc1',     target: NATURAL_SHRUB_TARGET_WIDTH * 1.45 * 0.63, mode: 'length', kind: 'shrub' }, // grande plante — −37%
  { key: 'plant-misc2',   url: './glb/plantes/plantes.glb', asset: 'Plant_Misc2',   target: NATURAL_GRASS_TARGET_WIDTH, mode: 'length', kind: 'grass' },
  { key: 'plant-misc3',   url: './glb/plantes/plantes.glb', asset: 'Plant_Misc3',   target: NATURAL_GRASS_TARGET_WIDTH * 0.30 * 1.12, mode: 'length', kind: 'grass' }, // −70% +12%
  { key: 'plant-misc4',   url: './glb/plantes/plantes.glb', asset: 'Plant_Misc4',   target: NATURAL_GRASS_TARGET_WIDTH, mode: 'length', kind: 'grass' },
  { key: 'plant-misc5',   url: './glb/plantes/plantes.glb', asset: 'Plant_Misc5',   target: NATURAL_GRASS_TARGET_WIDTH, mode: 'length', kind: 'grass' },
  { key: 'plant-grass1',  url: './glb/plantes/plantes.glb', asset: 'Plant_Grass1',  target: NATURAL_GRASS_TARGET_WIDTH, mode: 'length', kind: 'grass' },
  { key: 'plant-grass2',  url: './glb/plantes/plantes.glb', asset: 'Plant_Grass2',  target: NATURAL_GRASS_TARGET_WIDTH, mode: 'length', kind: 'grass' },
  { key: 'plant-sapling1',url: './glb/plantes/plantes.glb', asset: 'Plant_Sapling1',target: NATURAL_GRASS_TARGET_WIDTH * 0.45 * 1.12, mode: 'length', kind: 'grass' }, // −55% +12%
  { key: 'plant-sapling2',url: './glb/plantes/plantes.glb', asset: 'Plant_Sapling2',target: NATURAL_GRASS_TARGET_WIDTH * 0.45 * 1.12, mode: 'length', kind: 'grass' }, // −55% +12%
  { key: 'berry-1', url: './glb/plantes/berry/berry-1.glb', target: NATURAL_GRASS_TARGET_WIDTH * 1.15 * 1.17, mode: 'length', kind: 'grass' }, // +17%
  { key: 'berry-2', url: './glb/plantes/berry/berry-2.glb', target: NATURAL_GRASS_TARGET_WIDTH * 1.15 * 1.17, mode: 'length', kind: 'grass' }, // +17%
  { key: 'berry-3', url: './glb/plantes/berry/berry-3.glb', target: NATURAL_GRASS_TARGET_WIDTH * 1.15 * 1.17, mode: 'length', kind: 'grass' }, // +17%
  { key: 'berry-4', url: './glb/plantes/berry/berry-4.glb', target: NATURAL_GRASS_TARGET_WIDTH * 1.15 * 1.17, mode: 'length', kind: 'grass' }, // +17%
  { key: 'berry-5', url: './glb/plantes/berry/berry-5.glb', target: NATURAL_GRASS_TARGET_WIDTH * 1.15 * 1.17, mode: 'length', kind: 'grass' }, // +17%
  { key: 'berry-6', url: './glb/plantes/berry/berry-6.glb', target: NATURAL_GRASS_TARGET_WIDTH * 1.15 * 1.17, mode: 'length', kind: 'grass' }, // +17%
  { key: 'plante-1', url: './glb/plantes/plante-1.glb', target: NATURAL_GRASS_TARGET_WIDTH, mode: 'length', kind: 'grass' },
  { key: 'plante-2', url: './glb/plantes/plante-2.glb', target: NATURAL_GRASS_TARGET_WIDTH, mode: 'length', kind: 'grass' },
  { key: 'plante-3', url: './glb/plantes/plante-3.glb', target: NATURAL_GRASS_TARGET_WIDTH, mode: 'length', kind: 'grass' },
  { key: 'plante-4', url: './glb/plantes/plante-4.glb', target: NATURAL_GRASS_TARGET_WIDTH, mode: 'length', kind: 'grass' },
  { key: 'plante-5', url: './glb/plantes/plante-5.glb', target: NATURAL_GRASS_TARGET_WIDTH, mode: 'length', kind: 'grass' },
  { key: 'plante-6', url: './glb/plantes/plante-6.glb', target: NATURAL_GRASS_TARGET_WIDTH, mode: 'length', kind: 'grass' },
  { key: 'plante-7',    url: './glb/plantes/plante-7.glb',    target: NATURAL_GRASS_TARGET_WIDTH,          mode: 'length', kind: 'grass' },
  { key: 'plante-haute', url: './glb/plantes/plante-haute.glb', target: NATURAL_SHRUB_TARGET_WIDTH * 1.30 * 0.33 * 0.87, mode: 'length', kind: 'shrub', bypassBboxCheck: true },
  { key: 'rock-1',       url: './glb/decor/rock-1.glb',     target: NATURAL_ROCK_TARGET_LENGTH,      mode: 'length', kind: 'rock' },
  { key: 'rock-2',       url: './glb/decor/rock-2.glb',     target: NATURAL_ROCK_TARGET_LENGTH,      mode: 'length', kind: 'rock' },
  { key: 'rock-3',       url: './glb/decor/rock-3.glb',     target: NATURAL_ROCK_TARGET_LENGTH,      mode: 'length', kind: 'rock' },
  { key: 'rock-4',       url: './glb/decor/rock-4.glb',     target: NATURAL_ROCK_TARGET_LENGTH,      mode: 'length', kind: 'rock' },
  { key: 'reed',         url: './glb/plantes/roseau.glb',   target: NATURAL_REED_TARGET_HEIGHT,      mode: 'height', kind: 'reed' },
  { key: 'mushroom-1',   url: './glb/plantes/mushroom-1.glb', target: NATURAL_MUSHROOM_TARGET_WIDTH,        mode: 'length', kind: 'mushroom' },
  { key: 'mushroom-2',   url: './glb/plantes/mushroom-2.glb', target: NATURAL_MUSHROOM_TARGET_WIDTH * 1.40 * 1.15, mode: 'length', kind: 'mushroom', groundOffsetDelta: 0 }, // corrigé (2026-07-04) : +0.008 le faisait flotter au-dessus des surfaces — retiré, réajuster si trop enfoncé
  { key: 'barrel-1',     url: './glb/decor/tonneau-1.glb',  target: BARREL_TARGET_WIDTH * 0.87, mode: 'length' },
  { key: 'barrel-2',     url: './glb/decor/tonneau-2.glb',  target: BARREL_TARGET_WIDTH * 0.87, mode: 'length' },
  { key: 'barrel-3',     url: './glb/decor/tonneau-3.glb',  target: BARREL_TARGET_WIDTH * 1.18, mode: 'length' },
  { key: 'barrel-4',     url: './glb/decor/tonneau-4.glb',  target: BARREL_TARGET_WIDTH * 0.87, mode: 'length' },
  { key: 'barrel-5',     url: './glb/decor/tonneau-5.glb',  target: BARREL_TARGET_WIDTH * 2.25 * 0.87 * 0.80, mode: 'length' }, // −20%
  { key: 'cart-1',       url: './glb/decor/charrette-1.glb',      target: CART_TARGET_LENGTH, mode: 'length' }, // ré-ajoutée au pool (2026-07-04)
  { key: 'cart-2',       url: './glb/decor/charrette-2.glb',      target: CART_TARGET_LENGTH, mode: 'length' },
  { key: 'cart-3',       url: './glb/decor/charrette-pleine.glb', target: CART_TARGET_LENGTH * 1.10, mode: 'length', bypassBboxCheck: true, groundOffsetDelta: -0.020 }, // +10%
  { key: 'cart-4',       url: './glb/decor/charrette-3.glb',      target: CART_TARGET_LENGTH, mode: 'length' }, // clé "cart-4" pour éviter la collision avec la clé "cart-3" (déjà prise par charrette-pleine.glb)
  { key: 'meule',        url: './glb/decor/meule.glb',            target: MEULE_TARGET_WIDTH * 0.78 * 0.87 * 0.93 * 0.75, mode: 'length', bypassBboxCheck: true, groundOffsetDelta: 0.008 }, // −13% −7% −25%
  // Animaux de village — GLB individuels
  { key: 'animal-dog',     url: './glb/animaux/chien.glb',  target: ANIMAL_DOG_TARGET_WIDTH,     mode: 'length' },
  { key: 'animal-horse',   url: './glb/animaux/cheval.glb', target: ANIMAL_HORSE_TARGET_WIDTH,   mode: 'length', noShadow: true }, // 2026-07-04 perf : chevaux statiques, ombre peu visible
  // Animaux sauvages (forêt / prairie / champ) — InstancedMesh via naturalPropsOverlay
  { key: 'animal-deer',    url: './glb/animaux/cerf.glb',   target: NATURAL_DEER_TARGET_WIDTH,   mode: 'length' },
  // Personnages — villageois et rôdeurs de forêt (/glb/characters/). Statiques (aucun
  // clip d'animation) → instanciés via characterOverlay.js (InstancedMesh par variant ×
  // chunk, overlay dédié piloté par scene.js), pas via un Group individuel comme avant.
  { key: 'character-archer',     url: './glb/characters/archer.glb',     target: CHARACTER_TARGET_HEIGHT * 0.86, mode: 'height' }, // −14% (2026-07-04)
  { key: 'character-chevalier',  url: './glb/characters/chevalier.glb',  target: CHARACTER_TARGET_HEIGHT * 1.30, mode: 'height' }, // +30%
  { key: 'character-femme-1',    url: './glb/characters/femme-1.glb',    target: CHARACTER_TARGET_HEIGHT, mode: 'height' },
  { key: 'character-femme-2',    url: './glb/characters/femme-2.glb',    target: CHARACTER_TARGET_HEIGHT * 0.85, mode: 'height' }, // −15%
  { key: 'character-femme-3',    url: './glb/characters/femme-3.glb',    target: CHARACTER_TARGET_HEIGHT * 0.85, mode: 'height' }, // −15%
  { key: 'character-femme-4',    url: './glb/characters/femme-4.glb',    target: CHARACTER_TARGET_HEIGHT * 0.85, mode: 'height' }, // −15%
  { key: 'character-femme-5',    url: './glb/characters/femme-5.glb',    target: CHARACTER_TARGET_HEIGHT * 0.85, mode: 'height' }, // −15%
  { key: 'character-fermier',    url: './glb/characters/fermier.glb',    target: CHARACTER_TARGET_HEIGHT, mode: 'height' },
  { key: 'character-forgeron',   url: './glb/characters/forgeron.glb',   target: CHARACTER_TARGET_HEIGHT, mode: 'height' },
  { key: 'character-garde',      url: './glb/characters/garde.glb',      target: CHARACTER_TARGET_HEIGHT * 1.11, mode: 'height' }, // +11% (2026-07-04)
  { key: 'character-guerrier-1', url: './glb/characters/guerrier-1.glb', target: CHARACTER_TARGET_HEIGHT * 0.92, mode: 'height' }, // −8%
  { key: 'character-guerrier-2', url: './glb/characters/guerrier-2.glb', target: CHARACTER_TARGET_HEIGHT * 0.92, mode: 'height' }, // −8%
  { key: 'character-guerrier-3', url: './glb/characters/guerrier-3.glb', target: CHARACTER_TARGET_HEIGHT * 1.12 * 1.20, mode: 'height' }, // +12% +20% (2026-07-04)
  { key: 'character-homme-1',    url: './glb/characters/homme-1.glb',    target: CHARACTER_TARGET_HEIGHT, mode: 'height' },
  { key: 'character-homme-2',    url: './glb/characters/homme-2.glb',    target: CHARACTER_TARGET_HEIGHT, mode: 'height' },
  { key: 'character-homme-3',    url: './glb/characters/homme-3.glb',    target: CHARACTER_TARGET_HEIGHT, mode: 'height' },
  { key: 'character-magicien',   url: './glb/characters/magicien.glb',   target: CHARACTER_TARGET_HEIGHT, mode: 'height' },
  { key: 'character-marchand',   url: './glb/characters/marchand.glb',   target: CHARACTER_TARGET_HEIGHT, mode: 'height' },
  { key: 'character-monk',       url: './glb/characters/monk.glb',       target: CHARACTER_TARGET_HEIGHT, mode: 'height' },
  { key: 'character-soldat',     url: './glb/characters/soldat.glb',     target: CHARACTER_TARGET_HEIGHT, mode: 'height' },
  { key: 'character-sorciere',   url: './glb/characters/sorciere.glb',   target: CHARACTER_TARGET_HEIGHT, mode: 'height' },
  { key: 'character-tavernier',  url: './glb/characters/tavernier.glb',  target: CHARACTER_TARGET_HEIGHT, mode: 'height' }
];

// ─── Matériaux eau (splash effets) ───────────────────────────────────────────

const WATER_DROP_MAT = new THREE.MeshBasicMaterial({
  color: 0xBFEFFF, transparent: true, opacity: 0.82, depthWrite: false
});
const WATER_STREAK_MAT = new THREE.MeshBasicMaterial({
  color: 0xD8F8FF, transparent: true, opacity: 0.62, depthWrite: false
});
const WATER_MIST_MAT = new THREE.MeshBasicMaterial({
  color: 0xF3FDFF, transparent: true, opacity: 0.38, depthWrite: false
});

// ─── État singleton partagé ───────────────────────────────────────────────────
// propGlbLibrary/propAnimationsLibrary/propModelsLoading/propModelsRequested
// déplacées vers decorPropModels.js le 2026-07-11 (round 3) — propGlbLibrary est
// importée plus haut depuis decorPropModels.js et réexportée pour compat externe.

// Dummy réutilisé pour calculer les matrices d'instance sans allocation par prop
export const _propInstanceDummy = new THREE.Object3D();
// Réutilisable pour le snap pente dans collectNaturalPropInstances
export const _snapNormal = new THREE.Vector3();

// ─── Pré-alloués pour LOD (pas de GC chaque frame) ───────────────────────────

const _propLodFrustum = new THREE.Frustum();
const _propLodMatrix  = new THREE.Matrix4();
const _propLodPos     = new THREE.Vector3();

// ─── Helpers partagés ─────────────────────────────────────────────────────────

export function getPropChunkKey(q, r) {
  return `${Math.floor(q / HEX_CHUNK_SIZE)}:${Math.floor(r / HEX_CHUNK_SIZE)}`;
}

export function computePropBoundingSphere(matrices, heightPadding = 0.3) {
  const center = new THREE.Vector3();
  for (const m of matrices) {
    _propLodPos.setFromMatrixPosition(m);
    center.add(_propLodPos);
  }
  center.divideScalar(matrices.length);
  let radius = 0;
  for (const m of matrices) {
    _propLodPos.setFromMatrixPosition(m);
    radius = Math.max(radius, center.distanceTo(_propLodPos));
  }
  return new THREE.Sphere(center, radius + heightPadding);
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

export function createDecorOverlay() {
  const group = new THREE.Group();
  group.name  = 'field-water-edge-effects-overlay';
  ensurePropModels(group);
  ensureBirdModel(group);
  ensureSeagullModel(group);
  return group;
}

// ─── Merge helper ─────────────────────────────────────────────────────────────
// Fusionne les InstancedMesh de sourceGroup dans targetGroup.
// Si un IM du même name existe déjà dans targetGroup, on étend son instanceMatrix
// au lieu d'en créer un nouveau — le nombre d'IMs reste O(unique variantKey×chunkKey).
// Geometry et material de l'IM existant sont réutilisés sans clone supplémentaire.
const _mergeM = new THREE.Matrix4();
function _mergeInstancedMeshGroup(targetGroup, sourceGroup) {
  // Snapshot : sourceGroup.children sera vidé lors des add/remove
  const toProcess = [...sourceGroup.children];
  for (const newIM of toProcess) {
    if (!newIM.isInstancedMesh) {
      targetGroup.add(newIM);
      continue;
    }
    const existing = targetGroup.getObjectByName(newIM.name);
    if (!existing || !existing.isInstancedMesh) {
      // Première occurrence de ce (variantKey, chunkKey) → ajouter directement
      targetGroup.add(newIM);
      continue;
    }
    // Fusionner : nouveau IM qui réutilise geometry + material de l'existant
    const oldCount = existing.count;
    const addCount = newIM.count;
    const merged = new THREE.InstancedMesh(existing.geometry, existing.material, oldCount + addCount);
    merged.name          = existing.name;
    merged.frustumCulled = existing.frustumCulled;
    merged.castShadow    = existing.castShadow;
    merged.receiveShadow = existing.receiveShadow;
    merged.userData      = { ...existing.userData };

    // Copier matrices anciennes puis nouvelles
    for (let i = 0; i < oldCount; i++) { existing.getMatrixAt(i, _mergeM); merged.setMatrixAt(i, _mergeM); }
    for (let i = 0; i < addCount; i++) { newIM.getMatrixAt(i, _mergeM);    merged.setMatrixAt(oldCount + i, _mergeM); }
    merged.instanceMatrix.needsUpdate = true;

    // Recalculer la bounding sphere LOD depuis toutes les matrices (O(count), rapide)
    const allMats = [];
    for (let i = 0; i < merged.count; i++) { merged.getMatrixAt(i, _mergeM); allMats.push(_mergeM.clone()); }
    merged.userData.worldBoundingSphere = computePropBoundingSphere(allMats, 0.25);

    // Remplacer l'ancien IM — NE PAS disposer geometry/material (réutilisés par merged)
    targetGroup.remove(existing);
    existing.instanceMatrix = null; // libère le buffer matrices de l'ancien
    targetGroup.add(merged);
  }
}

/**
 * Reconstruit la liste plate des objets soumis au LOD roadside (bancs, panneaux,
 * moulins, bateaux, etc.).  À appeler après tout ajout/suppression dans les
 * sous-groupes village / boats / flags de l'overlay.
 */
function _rebuildRoadsideDecorLOD(overlay) {
  overlay.userData.roadsideDecorObjects = [];
  const _decorDistSq     = LOD_ROAD_DECOR_CULL_DISTANCE  * LOD_ROAD_DECOR_CULL_DISTANCE;
  const _signDistSq      = LOD_SIGN_CULL_DISTANCE         * LOD_SIGN_CULL_DISTANCE;
  const _shoreBoatDistSq = LOD_SHORE_BOAT_CULL_DISTANCE   * LOD_SHORE_BOAT_CULL_DISTANCE;
  const _villageDistSq   = LOD_VILLAGE_PROP_CULL_DISTANCE * LOD_VILLAGE_PROP_CULL_DISTANCE;
  const _animalDistSq    = LOD_ANIMAL_CULL_DISTANCE       * LOD_ANIMAL_CULL_DISTANCE;
  const _fountainDistSq  = LOD_FOUNTAIN_CULL_DISTANCE     * LOD_FOUNTAIN_CULL_DISTANCE;
  const _crowDistSq      = LOD_CROW_CULL_DISTANCE         * LOD_CROW_CULL_DISTANCE;
  const _seagullDistSq   = LOD_SEAGULL_CULL_DISTANCE      * LOD_SEAGULL_CULL_DISTANCE;
  const _millDistSq      = LOD_MILL_CULL_DISTANCE         * LOD_MILL_CULL_DISTANCE;

  for (const subGroup of overlay.children) {
    if (subGroup.name === 'field-zone-flags-and-crows') {
      for (const child of subGroup.children) {
        if (child.userData?.effectKind === 'field-flag-idle') {
          overlay.userData.roadsideDecorObjects.push({ object: child, center: child.position.clone(), lodDistSq: _crowDistSq });
          for (const zoneChild of child.children) {
            if (zoneChild.name === 'field-zone-mill-glb') {
              overlay.userData.roadsideDecorObjects.push({ object: zoneChild, center: child.position.clone(), lodDistSq: _millDistSq });
            }
          }
        }
      }
    } else if (subGroup.name === 'village-roadside-glb-props') {
      for (const child of subGroup.children) {
        const n = child.name ?? '';
        if (n.includes('bench') || n.includes('signpost') || n.includes('barrel') || n.includes('cart') || n.includes('fountain') || n.includes('animal') || n.includes('meule')) {
          const distSq = n.includes('signpost') ? _signDistSq
                       : n.includes('animal')   ? _animalDistSq
                       : (n.includes('barrel') || n.includes('cart')) ? _villageDistSq
                       : n.includes('fountain') ? _fountainDistSq
                       : n.includes('meule')    ? _millDistSq
                       : _decorDistSq;
          overlay.userData.roadsideDecorObjects.push({ object: child, center: child.position.clone(), lodDistSq: distSq });
        }
      }
    } else if (subGroup.name === 'water-zone-seagull-flocks') {
      for (const child of subGroup.children) {
        overlay.userData.roadsideDecorObjects.push({ object: child, center: child.position.clone(), lodDistSq: _seagullDistSq });
      }
    } else if (subGroup.name === 'water-shore-static-boats-glb') {
      for (const child of subGroup.children) {
        // Le nom inclut désormais le variant : water-shore-inert-boat-glb-shore-boat-1/2
        if (child.name.startsWith('water-shore-inert-boat-glb')) {
          overlay.userData.roadsideDecorObjects.push({ object: child, center: child.position.clone(), lodDistSq: _shoreBoatDistSq });
        }
      }
    }
    // Personnages (village/forêt/fermiers) : gérés par leur propre overlay instancié
    // (characterOverlay.js) depuis 2026-07-06 — plus de sous-groupe ici à suivre.
  }
}

// ── Registre des objets animés ────────────────────────────────────────────────
// Remplace le overlay.traverse() par frame dans updateDecorOverlay.
// Peuplé une seule fois par rebuild ; updateDecorOverlay itère ce Set en O(N_animés).
const _decorAnimRegistry = new Set();

function _refreshDecorAnimRegistry(overlay) {
  _decorAnimRegistry.clear();
  overlay.traverse(obj => {
    if (obj.userData.effectKind || obj.userData.mixer) _decorAnimRegistry.add(obj);
  });
  if (DEBUG_FLAGS.overlays) console.log(`[DECOR-ANIM] registry: ${_decorAnimRegistry.size} animated objects`);
}

export function rebuildDecorOverlay(overlay, placedTiles) {
  overlay.userData.lastPlacedTiles = placedTiles;
  clearGroup(overlay);
  ensurePropModels(overlay);
  ensureBirdModel(overlay);
  ensureSeagullModel(overlay);

  const specialBuildingSafeZones = collectSpecialBuildingSafeZones(placedTiles);
  overlay.add(createWaterVoidSplashes(placedTiles));
  overlay.add(createFieldFlags(placedTiles));
  overlay.add(createWaterBirdFlocks(placedTiles));
  overlay.add(createNaturalGroundProps(placedTiles));
  overlay.add(createRoadsideVillageProps(placedTiles, specialBuildingSafeZones));
  overlay.add(createShoreBoats(placedTiles, specialBuildingSafeZones));
  // Personnages : cf. characterOverlay.js (overlay dédié, instancié, piloté par scene.js).

  _rebuildRoadsideDecorLOD(overlay);
  _refreshDecorAnimRegistry(overlay);
}

/**
 * Mise à jour incrémentale du décor lors de la POSE d'une seule tuile.
 *
 * Évite le rebuild complet O(N_tuiles) de createNaturalGroundProps (~589ms) et
 * createRoadsideVillageProps (~293ms) en ne traitant que la tuile nouvellement
 * posée via une Map d'une entrée.  Le coût total tombe à ~30ms.
 *
 * Les groupes existants (natural, village, boats) sont enrichis en delta.
 * Les drapeaux champ sont reconstruits intégralement (< 10ms, zone-dépendant).
 * rebuildDecorOverlay (O(N)) reste réservé à undo / init / applyRemoteGameState.
 */
export function addSingleTileToDecorOverlay(overlay, newPlacedTile, placedTiles) {
  const naturalGroup = overlay.getObjectByName('natural-grass-forest-glb-props');
  if (!naturalGroup) {
    // Overlay pas encore initialisé : rebuild complet.
    rebuildDecorOverlay(overlay, placedTiles);
    return;
  }

  ensurePropModels(overlay);
  ensureBirdModel(overlay);
  ensureSeagullModel(overlay);

  const singleTileMap = new Map([[newPlacedTile.key, newPlacedTile]]);
  const specialBuildingSafeZones = collectSpecialBuildingSafeZones(placedTiles);

  // ── Props naturels : merge instances dans les IMs existants du même chunk ──
  // (évite l'accumulation de petits IMs dupliqués → draw calls stables)
  const newNatural = createNaturalGroundProps(singleTileMap);
  _mergeInstancedMeshGroup(naturalGroup, newNatural);

  // ── Props village : delta dans le groupe existant ─────────────────────────
  const villageGroup = overlay.getObjectByName('village-roadside-glb-props');
  if (villageGroup) {
    const newVillage = createRoadsideVillageProps(singleTileMap, specialBuildingSafeZones);
    while (newVillage.children.length > 0) villageGroup.add(newVillage.children[0]);
  }

  // ── Bateaux de plage : delta dans le groupe existant ─────────────────────
  const boatGroup = overlay.getObjectByName('water-shore-static-boats-glb');
  if (boatGroup) {
    const newBoats = createShoreBoats(singleTileMap, specialBuildingSafeZones);
    while (newBoats.children.length > 0) boatGroup.add(newBoats.children[0]);
  }

  // Personnages : cf. characterOverlay.js (overlay dédié, rebuild complet sur son propre
  // cycle scene.js — plus de delta ici, ce groupe n'existe plus dans le décor).

  // ── Drapeaux champ : rebuild complet (taille de zone, < 10ms) ────────────
  const flagsGroup = overlay.getObjectByName('field-zone-flags-and-crows');
  if (flagsGroup) overlay.remove(flagsGroup);
  overlay.add(createFieldFlags(placedTiles));

  // ── Mouettes des surfaces d'eau : rebuild complet (connectivité de zone, < 10ms) ──
  const seagullGroup = overlay.getObjectByName('water-zone-seagull-flocks');
  if (seagullGroup) overlay.remove(seagullGroup);
  overlay.add(createWaterBirdFlocks(placedTiles));

  // ── Liste LOD : reconstruite depuis tous les groupes mis à jour ───────────
  _rebuildRoadsideDecorLOD(overlay);
  // Rescan des objets animés (nouveaux props village / drapeaux peuvent avoir mixer/effectKind)
  _refreshDecorAnimRegistry(overlay);
}

// Distance max (horizontale caméra→splash) en unités monde
const WATER_EFFECT_CULL_HEIGHT  = 16;   // au-delà → masquer tout le groupe
const WATER_EFFECT_CULL_DIST_SQ = 110;  // ≈ 10.5u à hauteur rase

export function updateDecorOverlay(overlay, elapsedSeconds, camera = null) {
  // ── Culling effets eau selon hauteur + distance caméra ───────────────────
  if (camera) {
    const splashRoot = overlay.getObjectByName('water-void-edge-splashes');
    if (splashRoot) {
      const camY = camera.position.y;
      if (camY > WATER_EFFECT_CULL_HEIGHT) {
        // Caméra trop haute → effets pas visibles, on masque tout d'un coup
        splashRoot.visible = false;
      } else {
        splashRoot.visible = true;
        const camX = camera.position.x;
        const camZ = camera.position.z;
        // Rayon légèrement plus grand quand caméra basse (zoom in)
        const distSq = WATER_EFFECT_CULL_DIST_SQ * Math.max(1, 1.8 - camY * 0.05);
        for (const child of splashRoot.children) {
          const wx = child.userData.worldX;
          const wz = child.userData.worldZ;
          if (wx === undefined) { child.visible = true; continue; }
          const dx = wx - camX;
          const dz = wz - camZ;
          child.visible = (dx * dx + dz * dz) < distSq;
        }
      }
    }
  }

  // ── Animation : itère uniquement les objets animés (registre, pas traverse) ─
  // overlay.traverse() visite 2000-5000+ nœuds → 10ms/frame gaspillés.
  // _decorAnimRegistry ne contient que les objets avec effectKind ou mixer (~100-400).
  for (const object of _decorAnimRegistry) {
    // Nettoyage automatique si l'objet a été détaché lors d'un rebuild partiel
    if (!object.parent) { _decorAnimRegistry.delete(object); continue; }

    const data = object.userData;

    // Mise à jour AnimationMixer pour tout GLB animé (ex. moulin-2 avec pales).
    // Indépendant de effectKind : couvre tous les modèles clonés par createPropModel.
    if (data?.mixer) {
      const prev  = data.mixerLastTime ?? elapsedSeconds;
      const delta = Math.min(0.05, Math.max(0, elapsedSeconds - prev));
      data.mixerLastTime = elapsedSeconds;
      data.mixer.update(delta);
    }

    if (!data?.effectKind) continue;

    // Optimisation: ne pas animer les effets eau dont le groupe parent est caché (culling distance)
    if (data.effectKind === 'water-drop' || data.effectKind === 'water-streak' || data.effectKind === 'water-mist') {
      if (!object.parent?.visible || !object.parent?.parent?.visible) continue;
    }

    if (data.effectKind === 'water-drop') {
      const t    = (elapsedSeconds * data.speed + data.phase) % 1;
      const fall = t * t;
      object.position.set(
        data.x + Math.sin(elapsedSeconds * 2.8 + data.phase * 9) * data.sway,
        data.y - fall * data.fall,
        data.z + Math.cos(elapsedSeconds * 2.1 + data.phase * 7) * data.sway
      );
      object.scale.setScalar(data.scale * (1 - t * 0.38));
      object.material.opacity = Math.max(0, 0.85 - t * 0.85);
      continue;
    }

    if (data.effectKind === 'water-streak') {
      const t = (elapsedSeconds * data.speed + data.phase) % 1;
      object.position.set(
        data.x + Math.sin(elapsedSeconds * 2.4 + data.phase * 11) * data.sway,
        data.y - t * data.fall,
        data.z + Math.cos(elapsedSeconds * 1.9 + data.phase * 13) * data.sway
      );
      object.scale.set(data.radiusScale, data.lengthScale * (0.72 + t * 0.48), data.radiusScale);
      object.material.opacity = Math.max(0, 0.68 - t * 0.68);
      continue;
    }

    if (data.effectKind === 'water-mist') {
      const t = (elapsedSeconds * data.speed + data.phase) % 1;
      object.position.set(data.x + data.nx * t * data.drift, data.y + Math.sin(t * Math.PI) * 0.018, data.z + data.nz * t * data.drift);
      object.scale.setScalar(data.scale * (0.55 + t * 1.35));
      object.material.opacity = Math.max(0, 0.34 - t * 0.34);
      continue;
    }

    if (data.effectKind === 'bird-flock-orbit') {
      if (data.mixer) {
        const previousAnimationTime = data.lastAnimationTime ?? elapsedSeconds;
        const delta = Math.min(0.05, Math.max(0, elapsedSeconds - previousAnimationTime));
        data.lastAnimationTime = elapsedSeconds;
        data.mixer.update(delta * (data.animationSpeed ?? 1));
      }
      const dir      = data.direction ?? 1;
      const t        = elapsedSeconds * data.speed * dir + data.phase;
      const wobbleA  = Math.sin(elapsedSeconds * data.wobbleSpeedA + data.phase * 1.37);
      const wobbleB  = Math.cos(elapsedSeconds * data.wobbleSpeedB + data.phase * 2.11);
      const wobbleC  = Math.sin(elapsedSeconds * data.wobbleSpeedC + data.phase * 0.61);
      const localRx  = data.rx * (1 + wobbleA * data.rxJitter);
      const localRz  = data.rz * (1 + wobbleB * data.rzJitter);
      const x        = data.cx + Math.cos(t) * localRx + Math.sin(t * 2.17 + data.phase) * data.sideDrift;
      const z        = data.cz + Math.sin(t + wobbleC * 0.32) * localRz + Math.cos(t * 1.83 + data.phase * 0.7) * data.sideDrift;
      const y        = data.cy
        + Math.sin(elapsedSeconds * data.verticalSpeed + data.phase * 0.73) * data.verticalAmp
        + Math.sin(t * 1.37 + wobbleB) * data.bobAmp;
      object.position.set(x, y, z);
      const tangentX = -Math.sin(t) * localRx * dir;
      const tangentZ =  Math.cos(t + wobbleC * 0.32) * localRz * dir;
      // Dans birds.glb, les becs pointent vers -Z.
      object.rotation.y = Math.atan2(-tangentX, -tangentZ);
      object.rotation.z = Math.sin(t * data.bankSpeed + data.phase) * data.bankAmp * dir;
      object.rotation.x = Math.cos(t * 1.9 + data.phase * 1.4) * 0.08;
      continue;
    }

    if (data.effectKind === 'scarecrow-idle') {
      object.rotation.z = Math.sin(elapsedSeconds * 1.2 + data.phase) * 0.025;
    }
  }
}

// ─── LOD ──────────────────────────────────────────────────────────────────────

// Facteur LOD dynamique : réduit les distances de cull quand la caméra est basse.
// Y >= HIGH_Y → factor 1.0 (plein champ), Y <= LOW_Y → factor MIN_FACTOR (vue rase-mottes).
const _LOD_HEIGHT_LOW_Y    = 1.5;
const _LOD_HEIGHT_HIGH_Y   = 7.0;
// 2026-07-06 — 0.92 (réduction max 8%) s'est révélé quasi sans effet : à angle rasant le
// coût GPU par brin (overdraw écran) explose alors que le rayon de cull ne bouge presque
// pas. 0.75 avait déjà été essayé et jugé trop agressif PROCHE DU SOL (pop-in visible de
// l'herbe/fleurs avant l'horizon, cf. historique de cette constante) — valeur intermédiaire
// prudente ici (0.80, réduction max 20%) : à valider visuellement en jeu, remonter vers
// 0.85-0.90 si un pop-in gênant réapparaît, redescendre vers 0.70 si le gain GPU est encore
// insuffisant et qu'aucun pop-in n'est visible.
const _LOD_HEIGHT_MIN_FACTOR = 0.80;
export function computeLodHeightFactor(camera) {
  const y = camera.position.y;
  if (y >= _LOD_HEIGHT_HIGH_Y) return 1.0;
  if (y <= _LOD_HEIGHT_LOW_Y)  return _LOD_HEIGHT_MIN_FACTOR;
  return _LOD_HEIGHT_MIN_FACTOR + (1.0 - _LOD_HEIGHT_MIN_FACTOR) *
    (y - _LOD_HEIGHT_LOW_Y) / (_LOD_HEIGHT_HIGH_Y - _LOD_HEIGHT_LOW_Y);
}

export function updateNaturalPropsLOD(overlay, camera, lodFactor = 1.0) {
  _propLodMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  _propLodFrustum.setFromProjectionMatrix(_propLodMatrix);

  overlay.traverse(obj => {
    if (!obj.isInstancedMesh || !obj.userData.worldBoundingSphere) return;
    const sphere   = obj.userData.worldBoundingSphere;
    const inFrustum = _propLodFrustum.intersectsSphere(sphere);
    const dist     = camera.position.distanceTo(sphere.center);
    const cat      = obj.userData.lodCategory;
    const withinDist = cat === 'micro'   ? dist < LOD_MICRO_CULL_DISTANCE  * lodFactor
                     : cat === 'plant'   ? dist < LOD_PLANT_CULL_DISTANCE  * lodFactor
                     : cat === 'rock'    ? dist < LOD_ROCK_CULL_DISTANCE   * lodFactor
                     : cat === 'animal'  ? dist < LOD_ANIMAL_CULL_DISTANCE * lodFactor
                     : true;
    obj.visible = inFrustum && withinDist;
  });
}

export function updateFieldDecorLOD(overlay, camera, lodFactor = 1.0) {
  const factorSq = lodFactor * lodFactor;
  for (const item of (overlay.userData.roadsideDecorObjects ?? [])) {
    item.object.visible = camera.position.distanceToSquared(item.center) < item.lodDistSq * factorSq;
  }
}

// ─── Splashes eau ─────────────────────────────────────────────────────────────

function createWaterVoidSplashes(placedTiles) {
  const group = new THREE.Group();
  group.name  = 'water-void-edge-splashes';

  for (const placedTile of placedTiles.values()) {
    for (const edge of EDGE_ORDER) {
      if (getTileEdgeType(placedTile, edge) !== EDGE_TYPES.water) continue;
      const direction   = DIRECTION_BY_EDGE[edge];
      const neighborKey = makeHexKey(placedTile.q + direction.q, placedTile.r + direction.r);
      if (placedTiles.has(neighborKey)) continue;
      group.add(createSplashForSector(placedTile, edge));
    }
  }

  return group;
}

function createSplashForSector(placedTile, edge) {
  const group   = new THREE.Group();
  group.name    = `water-void-splash-${placedTile.key}-${edge}`;
  const tilePos = axialToWorld(placedTile.q, placedTile.r);
  // Stocker la position monde pour le culling distance dans updateDecorOverlay
  group.userData.worldX = tilePos.x;
  group.userData.worldZ = tilePos.z;
  const sector  = SECTOR_BY_KEY[edge];
  const vA      = getHexVertex(sector.a);
  const vB      = getHexVertex(sector.b);
  const mid     = { x: (vA.x + vB.x) / 2, z: (vA.z + vB.z) / 2 };
  const normalLen = Math.hypot(mid.x, mid.z) || 1;
  const nx      = mid.x / normalLen;
  const nz      = mid.z / normalLen;
  const tangent = normalize2(vB.x - vA.x, vB.z - vA.z);
  const seed    = hashNumber(`${placedTile.key}:${edge}:splash`);

  for (let i = 0; i < 4; i += 1) {
    const lane   = (i - 1.5) / 4;
    const jitter = (hashUnit(`${seed}:drop:${i}`) - 0.5) * 0.10;
    const out    = 0.055 + hashUnit(`${seed}:out:${i}`) * 0.13;
    const x      = tilePos.x + mid.x + tangent.x * (lane * 0.68 + jitter) + nx * out;
    const z      = tilePos.z + mid.z + tangent.z * (lane * 0.68 + jitter) + nz * out;
    const drop   = new THREE.Mesh(new THREE.SphereGeometry(0.010 + hashUnit(`${seed}:size:${i}`) * 0.010, 4, 3), WATER_DROP_MAT.clone());
    drop.name    = 'water-drop-falling-into-empty-neighbor';
    drop.userData = {
      effectKind: 'water-drop',
      x,
      y:     WATER_SURFACE_Y + 0.025 + hashUnit(`${seed}:y:${i}`) * 0.075,
      z,
      fall:  0.24 + hashUnit(`${seed}:fall:${i}`) * 0.24,
      speed: 0.82 + hashUnit(`${seed}:speed:${i}`) * 0.78,
      phase: hashUnit(`${seed}:phase:${i}`),
      sway:  0.010 + hashUnit(`${seed}:sway:${i}`) * 0.018,
      scale: 1
    };
    group.add(drop);
  }

  for (let i = 0; i < 3; i += 1) {
    const lane   = (i - 1) / 3;
    const height = 0.11 + hashUnit(`${seed}:streakh:${i}`) * 0.10;
    const streak = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0018, height, 5), WATER_STREAK_MAT.clone());
    streak.name  = 'water-falling-streak-beyond-edge';
    streak.userData = {
      effectKind: 'water-streak',
      x:           tilePos.x + mid.x + tangent.x * (lane * 0.62) + nx * (0.12 + hashUnit(`${seed}:streakout:${i}`) * 0.08),
      y:           WATER_SURFACE_Y - 0.02 + hashUnit(`${seed}:streaky:${i}`) * 0.045,
      z:           tilePos.z + mid.z + tangent.z * (lane * 0.62) + nz * (0.12 + hashUnit(`${seed}:streakoutz:${i}`) * 0.08),
      fall:        0.22 + hashUnit(`${seed}:streakfall:${i}`) * 0.18,
      speed:       0.70 + hashUnit(`${seed}:streakspeed:${i}`) * 0.55,
      phase:       hashUnit(`${seed}:streakphase:${i}`),
      sway:        0.006 + hashUnit(`${seed}:streaksway:${i}`) * 0.012,
      radiusScale: 0.85 + hashUnit(`${seed}:streakrx:${i}`) * 0.35,
      lengthScale: 0.85 + hashUnit(`${seed}:streakly:${i}`) * 0.45
    };
    group.add(streak);
  }

  for (let i = 0; i < 3; i += 1) {
    const lane = (i - 1) / 3;
    const mist = new THREE.Mesh(new THREE.SphereGeometry(0.010 + hashUnit(`${seed}:mist-size:${i}`) * 0.010, 4, 3), WATER_MIST_MAT.clone());
    mist.name  = 'water-edge-fine-mist';
    mist.userData = {
      effectKind: 'water-mist',
      x:     tilePos.x + mid.x + tangent.x * lane * 0.62 + nx * 0.06,
      y:     WATER_SURFACE_Y + 0.010 + hashUnit(`${seed}:mist-y:${i}`) * 0.025,
      z:     tilePos.z + mid.z + tangent.z * lane * 0.62 + nz * 0.06,
      nx:    nx + (hashUnit(`${seed}:mistnx:${i}`) - 0.5) * 0.35,
      nz:    nz + (hashUnit(`${seed}:mistnz:${i}`) - 0.5) * 0.35,
      drift: 0.035 + hashUnit(`${seed}:mistdrift:${i}`) * 0.045,
      speed: 1.0   + hashUnit(`${seed}:mistspeed:${i}`) * 0.70,
      phase: hashUnit(`${seed}:mistphase:${i}`),
      scale: 0.75  + hashUnit(`${seed}:mistscale:${i}`) * 0.55
    };
    group.add(mist);
  }

  return group;
}

// ─── Gestion des modèles GLB ──────────────────────────────────────────────────

// Un seul rebuild au retour asynchrone : attend que props ET oiseaux soient tous chargés.
// Exportée : appelée par decorPropModels.js/decorBirdModels.js depuis leurs callbacks
// de chargement GLB respectifs (import circulaire valide, cf. header du fichier).
// Les 3 getters isXLoading() exposent l'état interne (module-privé) de chaque
// sous-fichier, pour que ce garde-fou "tout est chargé ?" reste centralisé ici.
export function maybeRebuildWhenReady(overlay) {
  if (isPropModelsLoading())    return; // props encore en cours
  if (isBirdModelLoading())     return; // oiseau encore en cours
  if (isSeagullModelLoading())  return; // mouette encore en cours
  const lastPlacedTiles = overlay.userData.lastPlacedTiles;
  // Ne pas rebuilder directement hors RAF — sinon tous les objets passent visible=true
  // et le LOD ne s'applique pas avant le prochain %9 (→ flash de 1+ seconde).
  // On pose un flag ; le RAF loop le détecte et passe par la queue (LOD immédiat).
  if (lastPlacedTiles) overlay.userData.pendingModelRebuild = true;
}

// Chargement/normalisation/instanciation extraits le 2026-07-11 (round 3, cf.
// CONTEXT.md §21) : props → decorPropModels.js, oiseaux/mouettes → decorBirdModels.js.
// ensurePropModels/ensureBirdModel/ensureSeagullModel sont importées ci-dessus et
// appelées telles quelles dans createDecorOverlay/rebuildDecorOverlay/
// addSingleTileToDecorOverlay ; propGlbLibrary/createPropModel/createBirdFlock/
// createSeagullFlock sont réexportées en haut de ce fichier pour compat externe.
