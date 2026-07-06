/**
 * contentDensity.js — Multiplicateur global de densité de contenu (qualité/FPS).
 *
 * Le jeu est CPU-bound sur la soumission des draw calls + le parcours du graphe
 * (props, personnages, herbe, arbres animés). Ce multiplicateur permet de réduire
 * la densité de contenu pour viser 60 FPS sur machine faible, tout en gardant la
 * pleine richesse (densité 1.0) sur machine forte.
 *
 * Consommé par les overlays de contenu via scaledCount() au moment de la
 * génération (nombre de props/persos/brins par tuile). Un changement dispatche
 * 'dorfromantik:content-density-changed' → scene.js reconstruit tous les overlays.
 *
 * Persisté en localStorage. N'affecte PAS le terrain, l'eau, les bâtiments (gameplay).
 */

const STORAGE_KEY = 'hexistenz_content_density';
const MIN_DENSITY = 0.15; // plancher : garde un minimum de vie visuelle
const MAX_DENSITY = 1.0;  // plafond : densité de référence (réglage d'origine)

function clampDensity(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return MAX_DENSITY;
  return Math.min(MAX_DENSITY, Math.max(MIN_DENSITY, n));
}

let _density = MAX_DENSITY;
try {
  const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
  if (stored != null) _density = clampDensity(parseFloat(stored));
} catch (_) { /* localStorage indisponible → densité par défaut */ }

/** Densité courante (0.15 à 1.0). */
export function getContentDensity() {
  return _density;
}

/**
 * Échelle un compteur de contenu par la densité courante. Arrondi, jamais négatif.
 * Les overlays l'utilisent à la place de leur compteur brut (props/persos/brins).
 */
export function scaledCount(rawCount) {
  return Math.max(0, Math.round(rawCount * _density));
}

/** Comme scaledCount mais avec un plancher (garde au moins `min` items si la source en avait). */
export function scaledCountMin(rawCount, min = 1) {
  if (rawCount <= 0) return 0;
  return Math.max(min, Math.round(rawCount * _density));
}

/**
 * Change la densité, persiste, et dispatche l'évènement de rebuild.
 * @param {number} value 0.15..1.0
 */
export function setContentDensity(value) {
  const next = clampDensity(value);
  if (next === _density) return _density;
  _density = next;
  try { localStorage.setItem(STORAGE_KEY, String(_density)); } catch (_) {}
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('dorfromantik:content-density-changed', { detail: { density: _density } }));
  }
  return _density;
}

export { MIN_DENSITY, MAX_DENSITY };
