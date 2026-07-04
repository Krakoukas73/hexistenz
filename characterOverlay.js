/**
 * characterOverlay.js — Peuplement des villages et forêts avec des personnages GLB individuels.
 *
 * Pool de 22 personnages (/glb/characters/), répartis en trois groupes :
 *   - VILLAGE_CHARACTER_KEYS  (15) : civils, artisans, gardes — ancrés à une arête maison
 *     réelle de la tuile, dispersés dans son secteur angulaire (voir randomPointInSector).
 *     createVillageCharacters(). Corrigé le 2026-07-04 : utilisait auparavant
 *     randomPointInTile (dispersion sur toute la tuile, décorrélée des arêtes maison) —
 *     même bug que celui déjà identifié et corrigé sur la forêt (voir ci-dessous), jamais
 *     reporté ici. Les villageois n'atterrissaient quasiment jamais sur le sol "village".
 *   - FOREST_CHARACTER_KEYS   (7)  : rôdeurs, aventuriers isolés — ancrés à une arête forêt
 *     réelle de la tuile, dispersés dans son secteur angulaire (voir randomPointInSector —
 *     évite qu'ils atterrissent sur un autre biome de la même tuile, cf. bug 2026-07-04).
 *     Plusieurs essais indépendants par arête, proportionnels à sa densité d'arbres
 *     (getEdgeValue) — voir FOREST_CHARACTER_SLOT_CHANCE. createForestCharacters().
 *   - character-fermier, en plus de sa présence en village : apparaît aussi dans les champs
 *     de blé (EDGE_TYPES.field), ancré au secteur champ. createFieldFarmers().
 *
 * Aucune registerPropHitbox, et position volontairement DÉCORRÉLÉE de getSectorWorldCenter :
 * fontaines/charrettes/tonneaux/meule utilisent tous un pull vers le centre depuis un secteur,
 * ce qui les fait converger vers la même "cour" — les personnages, eux, tirent un point
 * aléatoire (angle + rayon) dans le secteur ancré, donc pas de collision systématique avec
 * ces props. Léger risque de chevauchement visuel résiduel accepté (comme pour
 * animal-dog/animal-horse, qui n'ont pas non plus de hitbox).
 *
 * Import circulaire avec decorOverlay (createPropModel, ROAD_DECOR_Y) — valide en ES modules
 * car tous les accès croisés se font dans des corps de fonctions (même pattern que
 * villageDecorOverlay.js).
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { EDGE_ORDER, EDGE_TYPES, HEX_SIZE, TILE_VISUAL } from './config.js';
import { hashUnit10k as hashUnit, hashNumber } from './hashUtils.js';
import { axialToWorld } from './hex.js';
import { getTileEdgeType, getTileCenterType } from './tileUtils.js';
import { getEdgeValue } from './tileGenerator.js';
import { placeObjectOnTerrain } from './terrainHeight.js';
import {
  snapPropBottomToSurface,
  getEdgeFromLocalPoint,
  getTileLocalPoint,
  GROUND_CLEARANCE
} from './propPlacement.js';
import { isInsideSpecialBuildingSafeZone } from './fieldZonesOverlay.js';
// Import circulaire résolu via live bindings ES modules — uniquement dans des corps de fonctions.
import { createPropModel, ROAD_DECOR_Y } from './decorOverlay.js';

// ─── Pools de personnages ──────────────────────────────────────────────────────

export const VILLAGE_CHARACTER_KEYS = [
  'character-femme-1', 'character-femme-2', 'character-femme-3', 'character-femme-4', 'character-femme-5',
  'character-homme-1', 'character-homme-2', 'character-homme-3',
  'character-fermier', 'character-forgeron', 'character-marchand', 'character-tavernier',
  'character-garde', 'character-soldat', 'character-chevalier'
];

export const FOREST_CHARACTER_KEYS = [
  'character-archer', 'character-guerrier-1', 'character-guerrier-2', 'character-guerrier-3',
  'character-magicien', 'character-monk', 'character-sorciere'
];

// ─── Densité (calibrable) ───────────────────────────────────────────────────────
// Revue à la hausse une 2e fois (2026-07-04) : +35% d'espérance de nombre par tuile
// (village : 1.65 → ~2.25 perso/tuile-village en moyenne ; forêt : 0.22 → 0.30 chance/tuile).

// Roll cumulatif par tuile village : < NONE → 0, < +ONE → 1, < +TWO → 2, < +THREE → 3, sinon 4.
const VILLAGE_CHARACTER_NONE_CHANCE  = 0.05;
const VILLAGE_CHARACTER_ONE_CHANCE   = 0.20;
const VILLAGE_CHARACTER_TWO_CHANCE   = 0.35;
const VILLAGE_CHARACTER_THREE_CHANCE = 0.25;
// (reste 0.15 → 4)

// Forêt (2026-07-04, 3e correctif) : le 2e correctif limitait encore à 1 rôdeur MAX par
// arête (roll indépendant, mais 1 seul essai). Toujours perçu comme trop rare — remplacé
// par plusieurs essais par arête, proportionnels à sa densité d'arbres réelle (même
// getEdgeValue que forestOverlay.js — 1 à 6 arbres/arête). Chance par essai relevée
// (0.40 → 0.55). Une arête dense (valeur 5-6) obtient jusqu'à 3 essais indépendants,
// donc jusqu'à 3 rôdeurs sur cette seule arête. Aucun hitbox, toujours aucun plafond par tuile.
const FOREST_CHARACTER_SLOT_CHANCE = 0.55; // par essai (slot), indépendant

// Champs de blé : "souvent" un ou deux fermiers (2026-07-04). Roll par tuile-champ, 1 ou 2
// (jamais 0 dans FIELD_FARMER_CHANCE des cas), ancré à une arête champ réelle.
const FIELD_FARMER_CHANCE       = 0.55; // proportion de tuiles-champ avec ≥1 fermier
const FIELD_FARMER_TWO_FRACTION = 0.35; // proportion (du roll qualifiant) qui donne 2 fermiers au lieu d'1

// ─── Dispersion ancrée à un secteur ───────────────────────────────────────────────
// Les personnages n'ont pas de hitbox et n'ont donc pas besoin de rester dans la "cour"
// (pull vers le centre depuis un secteur) utilisée par fontaines/charrettes/tonneaux/meule —
// cette formule partagée les faisait systématiquement atterrir au même endroit que ces props.
//
// randomPointInTile (dispersion 0-360° sur TOUTE la tuile, décorrélée du secteur biome
// recherché) a existé ici et causait un bug identique pour village/forêt : les personnages
// atterrissaient majoritairement sur un AUTRE biome de la même tuile plutôt que sur celui
// visé. Supprimée le 2026-07-04 une fois createVillageCharacters basculé sur
// randomPointInSector (dernier appelant restant) — cf. bug ci-dessous, déjà corrigé pour
// la forêt et les fermiers, et désormais aussi pour les villageois.
//
// Variante ANCRÉE à un secteur précis (même dispersion libre — angle+rayon aléatoires —
// mais restreinte au coin angulaire de 60° de ce secteur, cf. getEdgeFromLocalPoint /
// getSectorFromLocalPoint : secteur d'index i couvert par l'angle [i·60°−30°, i·60°+30°]).
//
// Bug corrigé (2026-07-04) : createForestCharacters utilisait randomPointInTile (angle
// 0–360° sur TOUTE la tuile), totalement décorrélé de forestEdges. Sur une tuile n'ayant
// qu'1 ou 2 arêtes forêt sur 6, le point tombait 4 à 5 fois sur 6 sur un tout autre secteur
// (prairie/maison/champ) de cette même tuile → les rôdeurs de forêt n'apparaissaient
// presque jamais parmi les arbres. randomPointInSector garantit que le point reste dans
// le secteur forêt choisi, tout en gardant une dispersion large (pas de hitbox à éviter).
function randomPointInSector(tilePos, seed, edge, minRadius, maxRadius, wedgeMargin = 0.85) {
  const index       = EDGE_ORDER.indexOf(edge);
  const centerAngle = index * (Math.PI / 3);
  const angle        = centerAngle + (hashUnit(`${seed}:angle`) - 0.5) * (Math.PI / 3) * wedgeMargin;
  const radius       = (minRadius + hashUnit(`${seed}:radius`) * (maxRadius - minRadius)) * HEX_SIZE;
  return new THREE.Vector3(
    tilePos.x + Math.cos(angle) * radius,
    ROAD_DECOR_Y,
    tilePos.z + Math.sin(angle) * radius
  );
}

// ─── Placement partagé ──────────────────────────────────────────────────────────

/**
 * Place un personnage sur le terrain à `pos`, snap Y sur la surface réelle
 * (même logique que placeAnimal dans villageDecorOverlay.js — gère la zone centrale
 * via getTileCenterType plutôt qu'un type d'arête deviné à l'angle près de l'origine).
 * Refuse l'eau et le rail (pas de personnage debout dans l'eau ou sur les voies).
 */
function placeCharacterOnTerrain(key, seed, pos, placedTile) {
  const local = getTileLocalPoint(pos, placedTile);
  const localRadius  = Math.hypot(local.x, local.z) / HEX_SIZE;
  const isCenterZone = localRadius <= (TILE_VISUAL.centerRadiusScale ?? 0.33);
  const edge = isCenterZone ? null : getEdgeFromLocalPoint(local);
  const type = isCenterZone ? getTileCenterType(placedTile) : (edge ? getTileEdgeType(placedTile, edge) : null);
  if (type == null || type === EDGE_TYPES.water || type === EDGE_TYPES.rail) return null;

  const model = createPropModel(key, seed);
  if (!model) return null;
  model.position.copy(pos);

  // Formule unique (2026-07-04) : sol strictement plat par biome (getBiomeSurfaceOffsetY) +
  // GROUND_CLEARANCE, la même petite constante fixe utilisée par tous les props du jeu
  // (cf. propPlacement.js) — plus de valeur calibrée spécifiquement pour les NPC.
  const groundOff = GROUND_CLEARANCE;
  const clearance = GROUND_CLEARANCE;
  const topY = placeObjectOnTerrain(model, local, type, hashNumber(seed) % 97, {
    groundOffset:  groundOff,
    alignToSlope:  false,
    yaw:           hashUnit(`${seed}:yaw`) * Math.PI * 2,
    edgeLockStart: 0.98,
    edgeLockEnd:   1.0
  });
  if (topY === null) return null;
  snapPropBottomToSurface(model, topY - groundOff, clearance);
  return model;
}

// ─── Villageois ─────────────────────────────────────────────────────────────────

export function createVillageCharacters(placedTiles, specialBuildingSafeZones = []) {
  const group = new THREE.Group();
  group.name  = 'village-characters-glb';

  for (const placedTile of placedTiles.values()) {
    const tilePos    = axialToWorld(placedTile.q, placedTile.r);
    const houseEdges = EDGE_ORDER.filter(e => getTileEdgeType(placedTile, e) === EDGE_TYPES.house);
    if (houseEdges.length === 0) continue;

    const seedCount = `${placedTile.key}:village-characters:count`;
    const roll  = hashUnit(seedCount);
    const t1 = VILLAGE_CHARACTER_NONE_CHANCE;
    const t2 = t1 + VILLAGE_CHARACTER_ONE_CHANCE;
    const t3 = t2 + VILLAGE_CHARACTER_TWO_CHANCE;
    const t4 = t3 + VILLAGE_CHARACTER_THREE_CHANCE;
    const count = roll < t1 ? 0 : roll < t2 ? 1 : roll < t3 ? 2 : roll < t4 ? 3 : 4;

    for (let i = 0; i < count; i++) {
      const seed = `${placedTile.key}:village-character:${i}`;
      // Bug corrigé (2026-07-04) : randomPointInTile dispersait sur TOUTE la tuile (0-360°),
      // totalement décorrélé de houseEdges — exactement le même bug déjà identifié et corrigé
      // pour createForestCharacters (cf. commentaire randomPointInSector plus haut). Sur une
      // tuile n'ayant qu'1 ou 2 arêtes maison sur 6, les villageois atterrissaient 4 à 5 fois
      // sur 6 sur un tout autre biome (prairie/forêt/champ) de la même tuile → ils
      // n'apparaissaient quasiment jamais sur le sol "village" (brun) proprement dit.
      // randomPointInSector ancre le point à une arête maison réelle de cette tuile.
      const edge = houseEdges[Math.floor(hashUnit(`${seed}:edge`) * houseEdges.length)];
      const pos = randomPointInSector(tilePos, seed, edge, 0.15, 0.85);
      if (isInsideSpecialBuildingSafeZone(pos, specialBuildingSafeZones)) continue;

      const key = VILLAGE_CHARACTER_KEYS[Math.floor(hashUnit(`${seed}:variant`) * VILLAGE_CHARACTER_KEYS.length)];
      const character = placeCharacterOnTerrain(key, seed, pos, placedTile);
      if (!character) continue;

      // Nom = groupe + variante (ex. "village-character-glb-fermier") — permet au HUD FPS
      // (sceneProfiler.js) de ventiler le comptage par personnage individuel.
      character.name = 'village-character-glb-' + key.replace(/^character-/, '');
      character.scale.multiplyScalar(0.90 + hashUnit(`${seed}:scale`) * 0.20);
      group.add(character);
    }
  }

  return group;
}

// ─── Rôdeurs de forêt ────────────────────────────────────────────────────────────

export function createForestCharacters(placedTiles, specialBuildingSafeZones = []) {
  const group = new THREE.Group();
  group.name  = 'forest-characters-glb';

  for (const placedTile of placedTiles.values()) {
    const tilePos     = axialToWorld(placedTile.q, placedTile.r);
    const forestEdges = EDGE_ORDER.filter(e => getTileEdgeType(placedTile, e) === EDGE_TYPES.forest);
    if (forestEdges.length === 0) continue;

    // Plusieurs essais indépendants par arête forêt, proportionnels à sa densité d'arbres
    // réelle (getEdgeValue, 1-6, même source que forestOverlay.js) — pas de plafond par tuile.
    for (const edge of forestEdges) {
      const rawEdge = placedTile.tile?.edges?.[edge];
      const density = getEdgeValue(rawEdge); // 1-6
      const slots   = Math.max(1, Math.ceil(density / 2)); // 1 (val 1-2), 2 (val 3-4), 3 (val 5-6)

      for (let s = 0; s < slots; s++) {
        const seed = `${placedTile.key}:forest-character:${edge}:${s}`;
        if (hashUnit(`${seed}:roll`) > FOREST_CHARACTER_SLOT_CHANCE) continue;

        // Ancré à cette arête forêt réelle (bug 2026-07-04 : voir randomPointInSector) —
        // dispersion large mais restreinte au coin angulaire du secteur, pas de hitbox à éviter.
        const pos = randomPointInSector(tilePos, seed, edge, 0.36, 0.80);
        if (isInsideSpecialBuildingSafeZone(pos, specialBuildingSafeZones)) continue;

        const key = FOREST_CHARACTER_KEYS[Math.floor(hashUnit(`${seed}:variant`) * FOREST_CHARACTER_KEYS.length)];
        const character = placeCharacterOnTerrain(key, seed, pos, placedTile);
        if (!character) continue;

        character.name = 'forest-character-glb-' + key.replace(/^character-/, '');
        character.scale.multiplyScalar(0.90 + hashUnit(`${seed}:scale`) * 0.20);
        group.add(character);
      }
    }
  }

  return group;
}

// ─── Fermiers des champs de blé ───────────────────────────────────────────────

export function createFieldFarmers(placedTiles, specialBuildingSafeZones = []) {
  const group = new THREE.Group();
  group.name  = 'field-farmer-characters-glb';

  for (const placedTile of placedTiles.values()) {
    const tilePos    = axialToWorld(placedTile.q, placedTile.r);
    const fieldEdges = EDGE_ORDER.filter(e => getTileEdgeType(placedTile, e) === EDGE_TYPES.field);
    if (fieldEdges.length === 0) continue;

    const seedCount = `${placedTile.key}:field-farmer:count`;
    const roll = hashUnit(seedCount);
    const count = roll > FIELD_FARMER_CHANCE ? 0
                : roll < FIELD_FARMER_CHANCE * FIELD_FARMER_TWO_FRACTION ? 2
                : 1;

    for (let i = 0; i < count; i++) {
      const seed = `${placedTile.key}:field-farmer:${i}`;
      const edge = fieldEdges[Math.floor(hashUnit(`${seed}:edge`) * fieldEdges.length)];
      // Même principe d'ancrage que randomPointInSector (forêt) — reste dans le secteur champ.
      const pos = randomPointInSector(tilePos, seed, edge, 0.32, 0.80);
      if (isInsideSpecialBuildingSafeZone(pos, specialBuildingSafeZones)) continue;

      const character = placeCharacterOnTerrain('character-fermier', seed, pos, placedTile);
      if (!character) continue;

      character.name = 'field-farmer-character-glb-fermier';
      character.scale.multiplyScalar(0.90 + hashUnit(`${seed}:scale`) * 0.20);
      group.add(character);
    }
  }

  return group;
}
