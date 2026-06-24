/**
 * propPlacement.js — Utilitaires de placement de props sur terrain hexagonal.
 *
 * Fonctions pures sans état, partagées par naturalPropsOverlay et villageDecorOverlay.
 * Aucune dépendance vers les fichiers overlay — aucun risque de dépendance circulaire.
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { EDGE_ORDER, EDGE_TYPES, HEX_SIZE, SECTOR_DEFS } from '../config.js';
import { axialToWorld } from './hex.js';
import { getTileEdgeType } from './tileUtils.js';
import { getHexVertex } from './hexGeometry.js';

const _SECTOR_BY_KEY = Object.fromEntries(SECTOR_DEFS.map(s => [s.key, s]));

// ─── Snap surface ─────────────────────────────────────────────────────────────

/**
 * Ajuste l'objet en Y pour que sa base repose exactement sur surfaceY + clearance.
 * À appeler après placeObjectOnTerrain pour corriger le dépassement de bounding-box.
 */
export function snapPropBottomToSurface(object, surfaceY, clearance = 0.004) {
  if (!object || !Number.isFinite(surfaceY)) return;
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  if (!Number.isFinite(box.min.y)) return;
  const targetBottomY = surfaceY + clearance;
  const deltaY = targetBottomY - box.min.y;
  if (Math.abs(deltaY) > 0.0005) {
    object.position.y += deltaY;
    object.updateMatrixWorld(true);
  }
}

// ─── Footprint / type guards ──────────────────────────────────────────────────

/**
 * Vérifie que tous les points de l'empreinte autour de `local` tombent sur le même
 * type de terrain que `expectedType`. Empêche les props de chevaucher deux biomes.
 */
export function isSingleTerrainFootprint(local, placedTile, expectedType, radius) {
  const samples = [
    { x: local.x,               z: local.z              },
    { x: local.x + radius,      z: local.z              },
    { x: local.x - radius,      z: local.z              },
    { x: local.x,               z: local.z + radius     },
    { x: local.x,               z: local.z - radius     },
    { x: local.x + radius*0.72, z: local.z + radius*0.72 },
    { x: local.x - radius*0.72, z: local.z - radius*0.72 }
  ];
  for (const sample of samples) {
    const sampleRadius = Math.hypot(sample.x, sample.z) / Math.max(HEX_SIZE, 0.001);
    if (sampleRadius < 0.28 || sampleRadius > 0.88) return false;
    const sampleEdge = getEdgeFromLocalPoint(sample);
    if (!sampleEdge) return false;
    if (getTileEdgeType(placedTile, sampleEdge) !== expectedType) return false;
  }
  return true;
}

/** Retourne true si le terrain accepte les props naturels (herbe ou forêt). */
export function isSafePropGroundType(type) {
  return type === EDGE_TYPES.forest || type === EDGE_TYPES.grass;
}

// ─── Géométrie locale ─────────────────────────────────────────────────────────

/**
 * Retourne l'arête hexagonale contenant le point local (x, z).
 * Retourne null si le point est à l'origine.
 */
export function getEdgeFromLocalPoint(point) {
  if (!point || (Math.abs(point.x) < 0.0001 && Math.abs(point.z) < 0.0001)) return null;
  let angle = Math.atan2(point.z, point.x);
  if (angle < 0) angle += Math.PI * 2;
  const index = Math.floor(((angle + Math.PI / 6) % (Math.PI * 2)) / (Math.PI / 3));
  return EDGE_ORDER[index] ?? null;
}

/** Convertit une position monde en coordonnées locales à la tuile. */
export function getTileLocalPoint(pos, placedTile) {
  const tilePos = axialToWorld(placedTile.q, placedTile.r);
  return { x: pos.x - tilePos.x, z: pos.z - tilePos.z };
}

/**
 * Retourne le centre monde (approximatif au 1/3) du secteur `edge` d'une tuile.
 * Utilisé pour positionner les bancs, panneaux et props de village.
 */
export function getSectorWorldCenter(placedTile, edge) {
  const tilePos = axialToWorld(placedTile.q, placedTile.r);
  const sector  = _SECTOR_BY_KEY[edge];
  const vA = getHexVertex(sector.a);
  const vB = getHexVertex(sector.b);
  return {
    x: tilePos.x + (vA.x + vB.x) / 3,
    z: tilePos.z + (vA.z + vB.z) / 3
  };
}
