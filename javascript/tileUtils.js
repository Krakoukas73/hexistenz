import { getEdgeType } from './tileGenerator.js';

export function makeNodeKey(tileKey, edge) {
  return `${tileKey}:${edge}`;
}

export function getTileEdgeType(placedTile, edge) {
  return getEdgeType(placedTile.tile.edges[edge]);
}

export function getTileCenterType(placedTile) {
  return placedTile.tile.center ?? null;
}

/** Dispose récursivement géométrie/matériaux/squelette d'un objet et de ses descendants
 *  (sans le retirer de son parent — l'appelant s'en charge). Ne dispose pas les matériaux
 *  partagés avec un prototype GLB (flag glbPrototype), réutilisés par _reusePrototypeMaterials. */
export function disposeObject3D(object) {
  object.traverse?.(o => {
    o.geometry?.dispose?.();
    const disposeMat = m => { if (m && !m.userData?.glbPrototype) m.dispose?.(); };
    if (Array.isArray(o.material)) o.material.forEach(disposeMat);
    else disposeMat(o.material);
    // Dispose la DataTexture bone matrix (Three.js r145+) — chaque cloneSkeleton() crée
    // un Skeleton propre (pas partagé), dispose() est donc toujours sûr ici.
    if (o.isSkinnedMesh && o.skeleton?.dispose) o.skeleton.dispose();
  });
}

// Vide un group ET libère les ressources GPU de chaque enfant. Contrairement aux
// overlays à ressources partagées (houseOverlay/characterOverlay, qui appellent
// group.clear() sans disposer), ici les enfants possèdent leur propre geometry/material.
// 2026-07-28 — passage par `group.remove(child)` : `children.pop()` seul laissait
// `child.parent` pointant vers le group sur des objets par ailleurs disposés.
export function clearGroup(group) {
  while (group.children.length > 0) {
    const child = group.children[group.children.length - 1];
    group.remove(child);
    disposeObject3D(child);
  }
}

export function smoothstep(edge0, edge1, value) {
  const t = Math.max(0, Math.min(1, (value - edge0) / Math.max(edge1 - edge0, 0.0001)));
  return t * t * (3 - 2 * t);
}

export function clamp01(value) {
  return Math.min(1, Math.max(0, Number(value) || 0));
}

// clamp/easeInOutSine génériques — factorisés depuis railTrainOverlay.js/tileRailOverlay.js
// (clamp, identique) et cometSky.js/railTrainOverlay.js/shaders/waterBoatOverlay.js (easeInOutSine,
// formule identique). Entrée clampée dans [0,1] (comme la version cometSky.js, la plus
// prudente des 3) : sans effet sur les call sites existants qui passent déjà une valeur
// dans cette plage, mais protège contre un léger dépassement (ex. progress > 1 par arrondi).
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function easeInOutSine(value) {
  return -(Math.cos(Math.PI * clamp(value, 0, 1)) - 1) / 2;
}
