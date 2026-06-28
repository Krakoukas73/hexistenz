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

export function clearGroup(group) {
  while (group.children.length > 0) {
    const child = group.children.pop();
    child.traverse?.(object => {
      object.geometry?.dispose?.();
      // Ne pas disposer les matériaux partagés avec un prototype GLB (flag glbPrototype).
      // Ces matériaux sont réutilisés par _reusePrototypeMaterials ; les disposer ici
      // détruirait le prototype → objets blancs après rebuild.
      const disposeMat = m => { if (m && !m.userData?.glbPrototype) m.dispose?.(); };
      if (Array.isArray(object.material)) object.material.forEach(disposeMat);
      else disposeMat(object.material);
      // Dispose la DataTexture bone matrix (Three.js r145+) — chaque cloneSkeleton() crée
      // un Skeleton propre (pas partagé), dispose() est donc toujours sûr ici.
      if (object.isSkinnedMesh && object.skeleton?.dispose) object.skeleton.dispose();
    });
  }
}

export function smoothstep(edge0, edge1, value) {
  const t = Math.max(0, Math.min(1, (value - edge0) / Math.max(edge1 - edge0, 0.0001)));
  return t * t * (3 - 2 * t);
}
