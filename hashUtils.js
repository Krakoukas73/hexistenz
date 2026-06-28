/**
 * hashUtils.js — Fonctions de hachage FNV-1a partagées entre overlays.
 *
 * Trois variantes de précision coexistent car chaque overlay historique
 * utilisait sa propre formule. Les changer casserait le placement
 * déterministe (arbres, maisons, trains). NE PAS unifier les précisions.
 *
 * Utilisation par overlay :
 *   forestOverlay       → hashUnitFull (as hashToUnit), hashNumber
 *   houseOverlay        → hashUnit100k (as hashUnit)
 *   railTrainOverlay    → hashUnit10k  (as hashUnit)
 *   fieldWaterEffects   → hashUnit10k  (as hashUnit), hashNumber
 */

function fnv1a(text) {
  let hash = 2166136261;
  const str = String(text);
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Raw uint32 — pour les opérations modulo (index de modèle, sélection de prop). */
export function hashNumber(value) {
  return fnv1a(value);
}

/** [0, 1) — précision maximale (diviseur 2^32 − 1). Utilisé par forestOverlay. */
export function hashUnitFull(text) {
  return fnv1a(text) / 4294967295;
}

/** [0, 1) — 5 décimales significatives (% 100 000). Utilisé par houseOverlay. */
export function hashUnit100k(text) {
  return (fnv1a(text) % 100000) / 100000;
}

/** [0, 1) — 4 décimales significatives (% 10 000). Utilisé par railTrainOverlay et fieldWaterEffectsOverlay. */
export function hashUnit10k(text) {
  return (fnv1a(text) % 10000) / 10000;
}
