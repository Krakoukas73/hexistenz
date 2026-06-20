/**
 * Fonctions de hachage déterministe partagées par les générateurs de bords
 * irréguliers (waterZoneOverlay — plages, terrainHeight — relief de terrain).
 *
 * Les fonctions createRagged* restent locales à chaque fichier car elles
 * utilisent des constantes de config différentes (BEACH.* vs RAGGED_EDGE.*).
 */

/**
 * Hash interne d'un sommet de bord intérieur — multiplication de Knuth.
 * @param {number} vertexIndex  index du sommet (entier)
 * @returns {number} entier non signé 32 bits
 */
export function hashRaggedInnerEdge(vertexIndex) {
  return ((vertexIndex + 1) * 2654435761) >>> 0;
}

/**
 * Hash FNV-1a d'une arête orientée (a → b, avec le type de biome).
 * Produit un entier non signé 32 bits déterministe sur les coordonnées x/z.
 * @param {{ x: number, z: number }} a  premier sommet
 * @param {{ x: number, z: number }} b  second sommet
 * @param {string} type  type de biome (ex. 'water', 'grass')
 * @returns {number}
 */
export function hashRaggedEdge(a, b, type) {
  const text = `${type}:${a.x.toFixed(3)},${a.z.toFixed(3)}>${b.x.toFixed(3)},${b.z.toFixed(3)}`;
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Xorshift 32 → [0, 1) avec résolution 10 000.
 * @param {number} value  entier (sera traité en uint32)
 * @returns {number} flottant dans [0, 1)
 */
export function hash01(value) {
  let x = value >>> 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return ((x >>> 0) % 10000) / 10000;
}
