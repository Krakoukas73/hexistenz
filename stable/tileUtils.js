import { getEdgeType } from '../tileGenerator.js';

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
      if (Array.isArray(object.material)) object.material.forEach(m => m.dispose?.());
      else object.material?.dispose?.();
    });
  }
}

export function smoothstep(edge0, edge1, value) {
  const t = Math.max(0, Math.min(1, (value - edge0) / Math.max(edge1 - edge0, 0.0001)));
  return t * t * (3 - 2 * t);
}
