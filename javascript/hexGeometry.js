/**
 * hexGeometry.js — Géométrie hexagonale partagée entre overlays.
 *
 * Utilisé par : forestOverlay, houseOverlay, railTrainOverlay,
 *               waterZoneOverlay.
 *
 * Note : waterZoneOverlay passe toujours le radius explicitement car son
 * rayon par défaut est HEX_SIZE * TILE_VISUAL.radiusScale, différent des
 * autres overlays qui utilisent HEX_SIZE brut.
 */

import { HEX_SIZE } from './config.js';

/**
 * Retourne les 6 sommets d'un hexagone régulier centré à l'origine,
 * dans le plan XZ (Y = 0), sommet plat en haut (flat-top orientation).
 *
 * @param {number} [radius=HEX_SIZE] — rayon de l'hexagone
 * @returns {{ x: number, z: number }[]}
 */
export function createOuterVertices(radius = HEX_SIZE) {
  const vertices = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i;
    vertices.push({
      x: Math.cos(angle) * radius,
      z: Math.sin(angle) * radius
    });
  }
  return vertices;
}

/**
 * Retourne le sommet d'index `index` de l'hexagone (flat-top, plan XZ).
 * Équivalent à createOuterVertices()[index] sans allouer le tableau complet.
 * @param {number} index — 0..5
 * @returns {{ x: number, z: number }}
 */
export function getHexVertex(index) {
  const angle = (Math.PI / 3) * index;
  return { x: Math.cos(angle) * HEX_SIZE, z: Math.sin(angle) * HEX_SIZE };
}

/**
 * Normalise un vecteur 2D (x, z). Retourne { x:0, z:1 } si le vecteur est nul.
 * @param {number} x
 * @param {number} z
 * @returns {{ x: number, z: number }}
 */
export function normalize2(x, z) {
  const length = Math.hypot(x, z) || 1;
  return { x: x / length, z: z / length };
}
