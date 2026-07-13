/**
 * shoreField.js — Champs procéduraux de rivage, en coordonnées MONDE.
 *
 * Fonctions continues de (x, z) : deux points de part et d'autre d'une arête
 * partagée renvoient la même valeur ⇒ les tuiles voisines se raccordent et la
 * zone se lit comme UNE seule forme organique (principe réutilisable plus tard
 * pour harmoniser les autres biomes).
 *
 *   shoreNoise(x, z)     → signé ≈ [-1, 1] : déplacement organique du contour +
 *                          domain-warp du champ de distance (contours qui ondulent).
 *   shoreSteepness(x, z) → [0, 1] basse fréquence : profil de rive le long du
 *                          périmètre. 0 = abrupt (rive nette, fond proche),
 *                          1 = doux (plage large, bas-fond étendu).
 *
 * Pur sin layered (déterministe, sans état) — appelé au rebuild (CPU), pas/frame.
 */

export function shoreNoise(x, z) {
  let n = 0;
  n += Math.sin(x * 1.70 + z * 0.90)            * 0.50;
  n += Math.sin(x * 0.60 - z * 2.10 + 1.30)     * 0.32;
  n += Math.sin((x + z) * 2.70 + 2.00)          * 0.18;
  return n; // ≈ [-1, 1]
}

export function shoreSteepness(x, z) {
  const a = Math.sin(x * 0.45 + z * 0.32 + 0.7) * 0.5 + 0.5;
  const b = Math.sin(x * 0.21 - z * 0.50 + 2.1) * 0.5 + 0.5;
  const n = 0.55 * a + 0.45 * b;
  return Math.min(1, Math.max(0, n));
}
