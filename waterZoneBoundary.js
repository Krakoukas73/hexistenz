import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { EDGE_COLOR, EDGE_ORDER, HEX_SIZE, TILE_VISUAL, SECTOR_DEFS } from './config.js';
import { axialToWorld, makeHexKey } from './stable/hex.js';
import { HEX_DIRECTIONS, getOppositeEdge } from './stable/placementRules.js';
import { createOuterVertices } from './stable/hexGeometry.js';
import { makeNodeKey, getTileCenterType } from './stable/tileUtils.js';
import { getWorldCurvatureDrop, markNoWorldCurvature } from './stable/worldCurvature.js';

// ─── Constantes ───────────────────────────────────────────────────────────────

const CENTER_RADIUS = HEX_SIZE * TILE_VISUAL.centerRadiusScale;
const SECTOR_BY_KEY = Object.fromEntries(SECTOR_DEFS.map(sector => [sector.key, sector]));
const DIRECTION_BY_EDGE = Object.fromEntries(HEX_DIRECTIONS.map(direction => [direction.edge, direction]));

const HALO_Y = 0.115;
const HOVER_HALO_Y = 0.30;
const HOVER_HALO_RADIUS = 0.056;

// ─── API publique ─────────────────────────────────────────────────────────────

/** Couleur THREE hex d'une zone selon son type de biome. */
export function getZoneColor(type) {
  return EDGE_COLOR[type] ?? 0xffffff;
}

/**
 * Convertit un point local (hex) en Vector3 monde avec courbure.
 * Exporté pour que waterZoneOverlay.js puisse l'utiliser dans getSectorCentroid
 * sans créer de dépendance circulaire.
 */
export function toWorldVector(world, local, y = HALO_Y) {
  const x = world.x + local.x;
  const z = world.z + local.z;
  return new THREE.Vector3(x, y + getWorldCurvatureDrop(x, z), z);
}

/**
 * Crée le contour de hover d'une zone (trait fin de délimitation).
 * Hover volontairement sans halo : les halos empilés rendent les jonctions
 * dégueulasses et amplifient visuellement le moindre raccord.
 */
export function createHoverZoneBoundary(zone, placedTiles) {
  const group = new THREE.Group();
  group.name = `${zone.type}-hover-zone-contour`;

  group.add(createZoneBoundary(zone, placedTiles, {
    y: HOVER_HALO_Y,
    radius: HOVER_HALO_RADIUS,
    opacity: 0.98,
    additive: false,
    name: `${zone.type}-hover-zone-contour`
  }));

  return group;
}

/** Crée un contour de zone (halo ou hover) à partir d'une zone BFS. */
export function createZoneBoundary(zone, placedTiles, options = {}) {
  const segments = getZoneBoundarySegments(zone, placedTiles, options.y ?? HALO_Y);
  const material = new THREE.MeshBasicMaterial({
    color: getZoneColor(zone.type),
    transparent: true,
    opacity: options.opacity ?? 0.95,
    blending: options.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    depthWrite: false,
    side: THREE.DoubleSide
  });

  const group = new THREE.Group();
  group.name = options.name ?? `${zone.type}-zone-halo`;

  for (const segment of segments) {
    const mesh = createFlatSegmentMesh(segment, options.radius ?? 0.025, material);
    if (mesh) group.add(mesh);
  }

  return group;
}

// ─── Calcul des segments de frontière ────────────────────────────────────────

function getZoneBoundarySegments(zone, placedTiles, y = HALO_Y) {
  const sectorKeys = new Set(zone.sectors.map(sectorRef => makeNodeKey(sectorRef.tile.key, sectorRef.edge)));
  const centerKeys = new Set();

  for (const sectorRef of zone.sectors) {
    if (getTileCenterType(sectorRef.tile) === zone.type) {
      centerKeys.add(sectorRef.tile.key);
    }
  }

  const segments = [];

  for (const sectorRef of zone.sectors) {
    addSectorBoundarySegments(segments, sectorRef, sectorKeys, centerKeys, placedTiles, y);
  }

  for (const tileKey of centerKeys) {
    const placedTile = placedTiles.get(tileKey);
    if (placedTile) addCenterBoundarySegments(segments, placedTile, sectorKeys, y);
  }

  return mergeCollinearSegments(segments);
}

function addSectorBoundarySegments(segments, sectorRef, sectorKeys, centerKeys, placedTiles, y) {
  const { tile: placedTile, edge } = sectorRef;
  const sector = SECTOR_BY_KEY[edge];
  const outerVertices = createOuterVertices(HEX_SIZE * TILE_VISUAL.radiusScale);
  const innerVertices = createOuterVertices(CENTER_RADIUS);
  const world = axialToWorld(placedTile.q, placedTile.r);
  const edgeIndex = EDGE_ORDER.indexOf(edge);
  const previousEdge = EDGE_ORDER[(edgeIndex + EDGE_ORDER.length - 1) % EDGE_ORDER.length];
  const nextEdge = EDGE_ORDER[(edgeIndex + 1) % EDGE_ORDER.length];

  const points = {
    innerA: toWorldVector(world, innerVertices[sector.a], y),
    outerA: toWorldVector(world, outerVertices[sector.a], y),
    outerB: toWorldVector(world, outerVertices[sector.b], y),
    innerB: toWorldVector(world, innerVertices[sector.b], y)
  };

  // Bord extérieur : uniquement si la tuile voisine opposée n'appartient pas à la zone.
  const direction = DIRECTION_BY_EDGE[edge];
  const neighborTile = direction
    ? placedTiles.get(makeHexKey(placedTile.q + direction.q, placedTile.r + direction.r))
    : null;
  const oppositeEdge = getOppositeEdge(edge);
  const hasOuterNeighbor = neighborTile && sectorKeys.has(makeNodeKey(neighborTile.key, oppositeEdge));
  if (!hasOuterNeighbor) addBoundarySegment(segments, points.outerA, points.outerB);

  // Jonctions latérales entre triangles d'une même tuile.
  if (!sectorKeys.has(makeNodeKey(placedTile.key, previousEdge))) {
    addBoundarySegment(segments, points.innerA, points.outerA);
  }

  if (!sectorKeys.has(makeNodeKey(placedTile.key, nextEdge))) {
    addBoundarySegment(segments, points.outerB, points.innerB);
  }

  // Bord côté centre : absent si le centre de la tuile fait partie de la zone.
  if (!centerKeys.has(placedTile.key)) {
    addBoundarySegment(segments, points.innerB, points.innerA);
  }
}

function addCenterBoundarySegments(segments, placedTile, sectorKeys, y) {
  const world = axialToWorld(placedTile.q, placedTile.r);
  const innerVertices = createOuterVertices(CENTER_RADIUS);

  for (const edge of EDGE_ORDER) {
    if (sectorKeys.has(makeNodeKey(placedTile.key, edge))) continue;
    const sector = SECTOR_BY_KEY[edge];
    addBoundarySegment(
      segments,
      toWorldVector(world, innerVertices[sector.a], y),
      toWorldVector(world, innerVertices[sector.b], y)
    );
  }
}

function addBoundarySegment(segments, from, to) {
  if (from.distanceToSquared(to) <= 0.000001) return;
  segments.push({ from, to });
}

// ─── Fusion des segments colinéaires ─────────────────────────────────────────

function mergeCollinearSegments(segments) {
  const byLine = new Map();

  for (const segment of segments) {
    const lineKey = makeLineKey(segment.from, segment.to);
    if (!byLine.has(lineKey)) byLine.set(lineKey, []);
    byLine.get(lineKey).push(segment);
  }

  const merged = [];

  for (const group of byLine.values()) {
    const remaining = [...group];

    while (remaining.length > 0) {
      let current = remaining.pop();
      let changed = true;

      while (changed) {
        changed = false;
        for (let i = remaining.length - 1; i >= 0; i--) {
          const candidate = remaining[i];
          const combined = tryMergeTouchingCollinearSegments(current, candidate);
          if (!combined) continue;
          current = combined;
          remaining.splice(i, 1);
          changed = true;
        }
      }

      merged.push(current);
    }
  }

  return merged;
}

function tryMergeTouchingCollinearSegments(a, b) {
  const points = [a.from, a.to, b.from, b.to];
  const keys = points.map(makePointKey);
  const shared = keys.filter((key, index) => keys.indexOf(key) !== index);
  if (shared.length === 0) return null;

  let bestFrom = points[0];
  let bestTo = points[1];
  let bestDistance = -1;

  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const distance = points[i].distanceToSquared(points[j]);
      if (distance > bestDistance) {
        bestDistance = distance;
        bestFrom = points[i];
        bestTo = points[j];
      }
    }
  }

  return { from: bestFrom.clone(), to: bestTo.clone() };
}

function makeLineKey(a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const angle = Math.atan2(dz, dx);
  const normalizedAngle = ((angle % Math.PI) + Math.PI) % Math.PI;
  const roundedAngle = Math.round(normalizedAngle / (Math.PI / 6));

  // Projection normale : même droite infinie, même clé. Suffisant ici car les
  // contours ne suivent que les axes 0/60/120 degrés des hexagones.
  const nx = -Math.sin(roundedAngle * Math.PI / 6);
  const nz = Math.cos(roundedAngle * Math.PI / 6);
  const offset = a.x * nx + a.z * nz;
  return `${roundedAngle}:${offset.toFixed(4)}`;
}

function makePointKey(point) {
  return `${point.x.toFixed(4)},${point.z.toFixed(4)}`;
}

// ─── Mesh segment plat ────────────────────────────────────────────────────────

function createFlatSegmentMesh(segment, width, material) {
  const delta = segment.to.clone().sub(segment.from);
  const length = delta.length();
  if (length <= 0.001) return null;

  // Bande rectangulaire sans extrémité ronde : évite les gros pâtés opaques aux coins.
  const geometry = new THREE.PlaneGeometry(length, width);
  const mesh = new THREE.Mesh(geometry, material);
  const midpoint = segment.from.clone().add(segment.to).multiplyScalar(0.5);
  const angle = Math.atan2(delta.z, delta.x);

  mesh.position.copy(midpoint);
  mesh.rotation.set(-Math.PI / 2, 0, -angle);
  return markNoWorldCurvature(mesh);
}
