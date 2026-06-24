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

import { HEX_SIZE, HITBOX_RESOLVE_MAX_ITER } from '../variables.js';

// ─── Grille ──────────────────────────────────────────────────────────────────

const CELL_SIZE = HEX_SIZE * 0.5;

/** @type {Map<string, Array<{x:number, z:number, r:number}>>} */
const _grid = new Map();

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
}

/**
 * Enregistre un obstacle circulaire en (x, z) avec rayon r.
 * @param {number} x  Position world X
 * @param {number} z  Position world Z
 * @param {number} r  Rayon du hitbox
 */
export function registerPropHitbox(x, z, r) {
  const [cx, cz] = _cellOf(x, z);
  const key = _cellKey(cx, cz);
  if (!_grid.has(key)) _grid.set(key, []);
  _grid.get(key).push({ x, z, r });
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
