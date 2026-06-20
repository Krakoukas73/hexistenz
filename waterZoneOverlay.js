import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { TEXT_LAYER } from './stable/threeSetup.js';
import { EDGE_ORDER, EDGE_TYPES, HEX_SIZE, TILE_VISUAL, SECTOR_DEFS } from './config.js';
import { axialToWorld, makeHexKey } from './stable/hex.js';
import { createOuterVertices } from './stable/hexGeometry.js';
import { makeNodeKey, getTileEdgeType, clearGroup } from './stable/tileUtils.js';
import { collectZone, getFullTextureNeighbors } from './stable/zoneUtils.js';
import { createWaterBeachMesh } from './waterBeachGeometry.js';
import { createHoverZoneBoundary, getZoneColor, toWorldVector } from './waterZoneBoundary.js';

const SECTOR_BY_KEY = Object.fromEntries(SECTOR_DEFS.map(sector => [sector.key, sector]));
const LABEL_Y = 0.72;
const HOVER_LABEL_SCALE = 1.85;
const HOVER_LABEL_Y_OFFSET = 0.285;

const textTextureCache = new Map();

// ─── API publique — création overlays ────────────────────────────────────────

export function createWaterZoneOverlay() {
  const group = new THREE.Group();
  group.name = 'texture-zone-overlay';
  return group;
}

export function createHoverZoneOverlay() {
  const group = new THREE.Group();
  group.name = 'hover-texture-zone-overlay';
  return group;
}

export function rebuildHoverZoneOverlay(overlay, hoverHex, worldPoint, placedTiles, zoneOverlay = null) {
  clearGroup(overlay);
  resetHoverValueLabels(placedTiles);
  resetHoverZoneLabels(zoneOverlay);
  if (!hoverHex || !worldPoint) return;

  const placedTile = placedTiles.get(makeHexKey(hoverHex.q, hoverHex.r));
  if (!placedTile) return;

  const hoveredEdge = getHoveredEdge(placedTile, worldPoint);
  const type = getTileEdgeType(placedTile, hoveredEdge);
  if (!isSupportedZoneType(type)) return;

  const zone = collectTextureZone(placedTile, hoveredEdge, type, placedTiles, new Set());

  // Un triangle isolé n'est pas une zone : pas de contour au hover, sinon ça clignote
  // partout pour rien comme un sapin de Noël sous LSD.
  if (zone.sectors.length < 2) return;

  highlightHoverZoneLabel(zoneOverlay, zone);
  overlay.add(createHoverZoneBoundary(zone, placedTiles));
}

export function updateHoverZoneOverlayAnimation(overlay, zoneOverlay = null, elapsedSeconds = performance.now() / 1000) {
  const pulse = 1 + Math.sin(elapsedSeconds * 7) * 0.16;

  zoneOverlay?.traverse?.(object => {
    if (!object.userData?.isHoverHighlightedZoneLabel) return;
    const baseScale = object.userData.hoverBaseScale;
    const baseY = object.userData.hoverBaseY;
    if (!baseScale || baseY === undefined) return;

    object.scale.set(baseScale.x * pulse, baseScale.y * pulse, baseScale.z);
    setCurvedSpriteFlatY(object, baseY + HOVER_LABEL_Y_OFFSET + Math.sin(elapsedSeconds * 7) * 0.018);
  });
}

export function rebuildWaterZoneOverlay(overlay, placedTiles) {
  clearGroup(overlay);
  resetPlacedValueLabels(placedTiles);

  const visited = new Set();

  for (const placedTile of placedTiles.values()) {
    for (const edge of EDGE_ORDER) {
      const type = getTileEdgeType(placedTile, edge);
      const nodeKey = makeNodeKey(placedTile.key, edge);
      if (visited.has(nodeKey) || !isSupportedZoneType(type)) continue;

      const zone = collectTextureZone(placedTile, edge, type, placedTiles, visited);
      if (zone.sectors.length < 2) continue;

      hideZoneDetailLabels(zone);
      if (zone.type === EDGE_TYPES.water) overlay.add(createWaterBeachMesh(zone, placedTiles));
      overlay.add(createZoneLabel(zone));
    }
  }
}

// ─── Hover et labels — helpers internes ──────────────────────────────────────

function setCurvedSpriteFlatY(sprite, y) {
  sprite.position.y = y;
  sprite.userData.worldCurvatureFlatY = y;
}

function resetPlacedValueLabels(placedTiles) {
  for (const placedTile of placedTiles.values()) {
    setTileValueLabelsVisible(placedTile, true);
  }
}

function resetHoverValueLabels(placedTiles) {
  for (const placedTile of placedTiles.values()) {
    placedTile.mesh?.traverse?.(object => {
      if (!object.userData?.isValueLabel || !object.userData.hoverBaseScale) return;
      object.scale.copy(object.userData.hoverBaseScale);
      setCurvedSpriteFlatY(object, object.userData.hoverBaseY ?? object.position.y);
    });
  }
}

function resetHoverZoneLabels(zoneOverlay) {
  zoneOverlay?.traverse?.(object => {
    if (!object.userData?.isHoverHighlightedZoneLabel) return;
    if (object.userData.hoverBaseScale) object.scale.copy(object.userData.hoverBaseScale);
    if (object.userData.hoverBaseY !== undefined) setCurvedSpriteFlatY(object, object.userData.hoverBaseY);
    object.userData.isHoverHighlightedZoneLabel = false;
  });
}

function highlightHoverZoneLabel(zoneOverlay, zone) {
  if (!zoneOverlay) return;
  const signature = makeZoneSignature(zone);

  zoneOverlay.traverse?.(object => {
    if (!object.userData?.isZoneLabel || object.userData.zoneSignature !== signature) return;

    if (!object.userData.hoverBaseScale) object.userData.hoverBaseScale = object.scale.clone();
    if (object.userData.hoverBaseY === undefined) object.userData.hoverBaseY = object.position.y;

    object.userData.isHoverHighlightedZoneLabel = true;
    object.scale.set(
      object.userData.hoverBaseScale.x * HOVER_LABEL_SCALE,
      object.userData.hoverBaseScale.y * HOVER_LABEL_SCALE,
      object.userData.hoverBaseScale.z
    );
    setCurvedSpriteFlatY(object, object.userData.hoverBaseY + HOVER_LABEL_Y_OFFSET);
  });
}

function hideZoneDetailLabels(zone) {
  for (const sectorRef of zone.sectors) {
    setTileValueLabelsVisible(sectorRef.tile, false, sectorRef.edge);
  }
}

function setTileValueLabelsVisible(placedTile, visible, edge = null) {
  placedTile.mesh?.traverse?.(object => {
    if (!object.userData?.isValueLabel) return;
    if (edge !== null && object.userData.edgeKey !== edge) return;
    object.visible = visible;
  });
}

function collectTextureZone(startTile, startEdge, type, placedTiles, visited) {
  return collectZone(startTile, startEdge, type, placedTiles, visited, getFullTextureNeighbors);
}

// ─── Labels de zone ───────────────────────────────────────────────────────────

function createZoneLabel(zone) {
  const center = new THREE.Vector3(0, LABEL_Y, 0);

  for (const sectorRef of zone.sectors) {
    center.add(getSectorCentroid(sectorRef.tile, sectorRef.edge));
  }

  center.divideScalar(zone.sectors.length);
  center.y = LABEL_Y;

  const sprite = new THREE.Sprite(getTextSpriteMaterial(String(zone.total), zone.type));
  sprite.layers.set(TEXT_LAYER);
  sprite.name = `${zone.type}-zone-label`;
  sprite.position.copy(center);
  sprite.scale.set(0.88, 0.54, 1);
  sprite.userData.isZoneLabel = true;
  sprite.userData.zoneSignature = makeZoneSignature(zone);
  sprite.userData.worldCurvatureFlatY = sprite.position.y;
  return sprite;
}

function makeZoneSignature(zone) {
  return zone.sectors
    .map(sectorRef => makeNodeKey(sectorRef.tile.key, sectorRef.edge))
    .sort()
    .join('|');
}

function getSectorCentroid(placedTile, edge) {
  const sector = SECTOR_BY_KEY[edge];
  const vertices = createOuterVertices(HEX_SIZE * TILE_VISUAL.radiusScale);
  const world = axialToWorld(placedTile.q, placedTile.r);
  const a = toWorldVector(world, vertices[sector.a]);
  const b = toWorldVector(world, vertices[sector.b]);

  return new THREE.Vector3(
    (world.x + a.x + b.x) / 3,
    LABEL_Y,
    (world.z + a.z + b.z) / 3
  );
}

function getTextSpriteMaterial(text, type) {
  const cacheKey = `${type}:${text}`;
  if (textTextureCache.has(cacheKey)) return textTextureCache.get(cacheKey);

  const canvas = document.createElement('canvas');
  canvas.width = 192;
  canvas.height = 96;

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = getLabelBackground(type);
  ctx.roundRect(22, 12, 148, 70, 20);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.lineWidth = 5;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.roundRect(25, 15, 142, 64, 17);
  ctx.stroke();

  ctx.font = '900 52px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 8;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.62)';
  ctx.strokeText(text, 96, 50);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, 96, 50);

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  textTextureCache.set(cacheKey, material);
  return material;
}

function getLabelBackground(type) {
  const color = new THREE.Color(getZoneColor(type));
  return `rgba(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)}, 0.78)`;
}

// ─── Utilitaires ──────────────────────────────────────────────────────────────

function getHoveredEdge(placedTile, worldPoint) {
  const world = axialToWorld(placedTile.q, placedTile.r);
  const localX = worldPoint.x - world.x;
  const localZ = worldPoint.z - world.z;
  const angle = (Math.atan2(localZ, localX) + Math.PI * 2) % (Math.PI * 2);
  const sectorIndex = Math.floor(angle / (Math.PI / 3)) % SECTOR_DEFS.length;
  return SECTOR_DEFS[sectorIndex].key;
}

function isSupportedZoneType(type) {
  return Object.values(EDGE_TYPES).includes(type);
}
