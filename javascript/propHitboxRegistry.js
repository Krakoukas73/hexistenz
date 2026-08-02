/**
 * PropHitboxRegistry — Registre spatial singleton des hitbox d'objets GLB volumineux.
 *
 * Principe :
 *   1. Avant chaque rebuild de scène, appeler resetPropHitboxRegistry().
 *   2. Les objets "durs" (arbres, bâtiments, rochers) s'enregistrent via registerPropHitbox().
 *   3. Les objets "mous" (tonneaux, charrettes, bancs, panneaux) appellent tryResolve()
 *      pour obtenir une position sans conflit, puis se registrent eux-mêmes.
 *
 * Grille spatiale à cellules de côté CELL_SIZE = HEX_SIZE * 0.5.
 * Chaque hitbox est stockée dans la cellule contenant son centre.
 * Les requêtes cherchent dans un voisinage de ±span cellules.
 */

import { HEX_SIZE, HITBOX_RESOLVE_MAX_ITER } from './variables.js';

// ─── Grille ──────────────────────────────────────────────────────────────────

const CELL_SIZE = HEX_SIZE * 0.5;

/** @type {Map<string, Array<{x:number, z:number, r:number}>>} */
const _grid = new Map();

let _generation = 0;

function _cellKey(cx, cz) { return `${cx},${cz}`; }
function _cellOf(x, z)    { return [Math.floor(x / CELL_SIZE), Math.floor(z / CELL_SIZE)]; }

/**
 * Retourne tous les enregistrements potentiellement en conflit avec (x, z, r).
 * Couvre un carré de ±span cellules autour du centre de requête.
 */
function _candidates(x, z, r) {
  const [cx, cz] = _cellOf(x, z);
  // span = 2 cellules fixes suffit pour nos plus grands rayons (~0.30 × HEX_SIZE < CELL_SIZE * 2)
  const span = Math.ceil(r / CELL_SIZE) + 2;
  const result = [];
  for (let dx = -span; dx <= span; dx++) {
    for (let dz = -span; dz <= span; dz++) {
      const bucket = _grid.get(_cellKey(cx + dx, cz + dz));
      if (bucket) for (const h of bucket) result.push(h);
    }
  }
  return result;
}

// ─── API publique ─────────────────────────────────────────────────────────────

/**
 * Réinitialise le registre.
 * À appeler avant chaque rebuild complet de la scène (forest → house → fieldWater).
 */
export function resetPropHitboxRegistry() {
  _grid.clear();
  _generation += 1;
}

/**
 * Compteur incrémenté à CHAQUE reset, donc à chaque reconstruction des props (les rebuilds
 * appellent toujours resetPropHitboxRegistry() d'abord, cf. scene.js). Permet aux callbacks
 * setColor de mettre en cache l'index d'instance qu'ils ont résolu par position et de ne le
 * recalculer que lorsque les meshes ont réellement été reconstruits — sans ça, une recherche
 * O(nombre d'instances) serait refaite à chaque frame pour chaque objet en train de brûler.
 */
export function getPropRegistryGeneration() { return _generation; }

/**
 * Enregistre un obstacle circulaire en (x, z) avec rayon r.
 * @param {number} x  Position world X
 * @param {number} z  Position world Z
 * @param {number} r  Rayon du hitbox
 * @param {{setColor?: (color: import('three').Color|null) => void}|null} [meta]
 *   Optionnel (2026-07-29) — poignée fournie par l'appelant (forestOverlay.js/houseOverlay.js)
 *   permettant à un effet (ex. feu) de teinter/reset l'instance ou l'objet réel correspondant,
 *   sans que ce registre ait besoin de connaître les détails d'instancing/THREE.js.
 */
export function registerPropHitbox(x, z, r, meta = null) {
  const [cx, cz] = _cellOf(x, z);
  const key = _cellKey(cx, cz);
  if (!_grid.has(key)) _grid.set(key, []);
  _grid.get(key).push({ x, z, r, meta });
}

/**
 * Retourne les hitbox (arbres/bâtiments/rochers déjà posés) dont le CENTRE tombe dans un
 * rayon r autour de (x, z) — permet à un effet (ex. feu) de s'ancrer sur les vrais props
 * d'une tuile plutôt que sur un point générique. Lecture seule, ne modifie pas le registre.
 * @param {number} x
 * @param {number} z
 * @param {number} r
 * @returns {Array<{x:number, z:number, r:number, meta:object|null}>}
 */
export function getHitboxesNear(x, z, r) {
  const r2 = r * r;
  return _candidates(x, z, r).filter(h => (h.x - x) * (h.x - x) + (h.z - z) * (h.z - z) <= r2);
}

/**
 * Retourne true si un cercle (x, z, r) chevauche au moins un hitbox enregistré.
 * @param {number} x
 * @param {number} z
 * @param {number} r
 * @returns {boolean}
 */
export function hasConflict(x, z, r) {
  for (const h of _candidates(x, z, r)) {
    const minDist = r + h.r;
    if ((x - h.x) * (x - h.x) + (z - h.z) * (z - h.z) < minDist * minDist) return true;
  }
  return false;
}

/**
 * Tente de résoudre les conflits par répulsion itérative.
 *
 * À chaque itération, calcule un vecteur de répulsion accumulé depuis tous les
 * hitbox en conflit, puis déplace la position candidate dans cette direction
 * (amortissement 0.7 pour éviter les oscillations).
 *
 * N'enregistre PAS le résultat — l'appelant doit appeler registerPropHitbox()
 * après placement.
 *
 * @param {number} x
 * @param {number} z
 * @param {number} r       Rayon de l'objet à placer
 * @param {number} [maxIter]
 * @returns {{x:number, z:number}|null}  Position résolue, ou null si impossible
 */
export function tryResolve(x, z, r, maxIter = HITBOX_RESOLVE_MAX_ITER) {
  let cx = x, cz = z;

  for (let iter = 0; iter < maxIter; iter++) {
    const cands = _candidates(cx, cz, r);
    let repX = 0, repZ = 0;
    let hasOverlap = false;

    for (const h of cands) {
      const dx = cx - h.x;
      const dz = cz - h.z;
      const distSq = dx * dx + dz * dz;
      const minDist = r + h.r;
      if (distSq < minDist * minDist) {
        hasOverlap = true;
        const dist = Math.sqrt(distSq) || 0.001;
        const overlap = minDist - dist;
        // Pousse proportionnellement à l'overlap, normalisé
        repX += (dx / dist) * overlap;
        repZ += (dz / dist) * overlap;
      }
    }

    if (!hasOverlap) return { x: cx, z: cz };

    // Amortissement 0.7 : réduit les oscillations sur hitbox multiples
    cx += repX * 0.7;
    cz += repZ * 0.7;
  }

  // Vérification finale après la dernière itération
  return hasConflict(cx, cz, r) ? null : { x: cx, z: cz };
}
