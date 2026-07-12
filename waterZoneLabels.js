// ─── waterZoneLabels.js — labels de zone (création, hover, LOD-agnostique) ──
// Extrait de waterZoneOverlay.js le 2026-07-11 (round 3, découpage sans risque,
// cf. CONTEXT.md §21) : rendu canvas/emoji des sprites de valeur, état hover
// (highlight/reset), et traversée de zone (collectTextureZone). Dépendance à
// sens unique : waterZoneOverlay.js importe depuis ce fichier, jamais l'inverse.
// Seul importateur externe (via waterZoneOverlay.js) : scene.js — API publique
// de waterZoneOverlay.js inchangée.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { TEXT_LAYER, registerCurvedSprite } from './threeSetup.js';
import { EDGE_TYPES, HEX_SIZE, TILE_VISUAL, SECTOR_DEFS } from './config.js';
import { axialToWorld } from './hex.js';
import { createOuterVertices } from './hexGeometry.js';
import { makeNodeKey } from './tileUtils.js';
import { collectZone, getFullTextureNeighbors } from './zoneUtils.js';
import { getZoneColor, toWorldVector } from './waterZoneBoundary.js';
import { HEX_FONT_FAMILY, sharedLabelCache, hexFontReady } from './hexLabelFont.js';
import { getWorldCurvatureDrop } from './worldCurvature.js';

const SECTOR_BY_KEY = Object.fromEntries(SECTOR_DEFS.map(sector => [sector.key, sector]));

const LABEL_Y = 0.576; // −20 % (était 0.72)
export const HOVER_LABEL_SCALE = 1.85;
export const HOVER_LABEL_Y_OFFSET = 0.285;
// Base sprite scale (zone de valeur "1") — les grosses zones montent jusqu'à +35%.
const LABEL_BASE_W = 0.95; // +16% (était 0.82)
const LABEL_BASE_H = 0.82; // +16% (était 0.71)

export function setCurvedSpriteFlatY(sprite, y) {
  sprite.userData.worldCurvatureFlatY = y;
  sprite.position.y = y + getWorldCurvatureDrop(sprite.position.x, sprite.position.z);
}

export function resetPlacedValueLabels(placedTiles) {
  for (const placedTile of placedTiles.values()) {
    setTileValueLabelsVisible(placedTile, true);
  }
}

export function resetHoverValueLabels(placedTiles) {
  for (const placedTile of placedTiles.values()) {
    placedTile.mesh?.traverse?.(object => {
      if (!object.userData?.isValueLabel || !object.userData.hoverBaseScale) return;
      object.scale.copy(object.userData.hoverBaseScale);
      setCurvedSpriteFlatY(object, object.userData.hoverBaseY ?? object.position.y);
    });
  }
}

export function resetHoverZoneLabels(zoneOverlay) {
  zoneOverlay?.traverse?.(object => {
    if (!object.userData?.isHoverHighlightedZoneLabel) return;
    if (object.userData.hoverBaseScale) object.scale.copy(object.userData.hoverBaseScale);
    if (object.userData.hoverBaseY !== undefined) setCurvedSpriteFlatY(object, object.userData.hoverBaseY);
    object.userData.isHoverHighlightedZoneLabel = false;
  });
}

export function highlightHoverZoneLabel(zoneOverlay, zone) {
  if (!zoneOverlay) return;
  const signature = makeZoneSignature(zone);

  zoneOverlay.traverse?.(object => {
    if (!object.userData?.isZoneLabel || object.userData.zoneSignature !== signature) return;

    if (!object.userData.hoverBaseScale) object.userData.hoverBaseScale = object.scale.clone();
    if (object.userData.hoverBaseY === undefined) {
      // Stocker le Y "plat" (avant courbure) pour éviter le double-drop en mode bouliste.
      object.userData.hoverBaseY = object.userData.worldCurvatureFlatY ?? object.position.y;
    }

    object.userData.isHoverHighlightedZoneLabel = true;
    object.scale.set(
      object.userData.hoverBaseScale.x * HOVER_LABEL_SCALE,
      object.userData.hoverBaseScale.y * HOVER_LABEL_SCALE,
      object.userData.hoverBaseScale.z
    );
    setCurvedSpriteFlatY(object, object.userData.hoverBaseY + HOVER_LABEL_Y_OFFSET);
  });
}

export function hideZoneDetailLabels(zone) {
  for (const sectorRef of zone.sectors) {
    setTileValueLabelsVisible(sectorRef.tile, false, sectorRef.edge);
  }
}

export function setTileValueLabelsVisible(placedTile, visible, edge = null) {
  placedTile.mesh?.traverse?.(object => {
    if (!object.userData?.isValueLabel) return;
    if (edge !== null && object.userData.edgeKey !== edge) return;
    object.visible = visible;
  });
}

export function collectTextureZone(startTile, startEdge, type, placedTiles, visited) {
  return collectZone(startTile, startEdge, type, placedTiles, visited, getFullTextureNeighbors);
}

/**
 * Redimensionne tous les labels de zone proportionnellement à leur valeur
 * par rapport au maximum courant : de 55 % (valeur 1) à 200 % (valeur max).
 * À rappeler après chaque rebuild pour tenir compte de la nouvelle valeur max.
 */
export function rescaleZoneLabels(overlay) {
  const maxPerType = {};
  overlay.traverse(obj => {
    if (!obj.userData?.isZoneLabel) return;
    const { zoneValue, zoneLabelType } = obj.userData;
    if (zoneValue > (maxPerType[zoneLabelType] ?? 0)) maxPerType[zoneLabelType] = zoneValue;
  });

  overlay.traverse(obj => {
    if (!obj.userData?.isZoneLabel) return;
    const max = maxPerType[obj.userData.zoneLabelType] ?? 1;
    const ratio = obj.userData.zoneValue / max;
    const factor = 0.55 + 1.00 * ratio; // [0.55, 1.55]
    const bx = LABEL_BASE_W * factor;
    const by = LABEL_BASE_H * factor;
    obj.scale.set(bx, by, 1);
    obj.userData._baseScale = { x: bx, y: by };
  });
}

// ─── Labels de zone ───────────────────────────────────────────────────────────

export function createZoneLabel(zone, involvedTileKeys = null, involvedSectorKeys = null) {
  const center = new THREE.Vector3(0, LABEL_Y, 0);

  for (const sectorRef of zone.sectors) {
    center.add(getSectorCentroid(sectorRef.tile, sectorRef.edge));
  }

  center.divideScalar(zone.sectors.length);
  center.y = LABEL_Y;

  // Clone du material : chaque sprite a sa propre instance pour permettre
  // un contrôle d'opacité individuel (fade LOD). La texture est partagée.
  const sprite = new THREE.Sprite(getTextSpriteMaterial(String(zone.total), zone.type).clone());
  sprite.layers.set(TEXT_LAYER);
  sprite.name = `${zone.type}-zone-label`;
  sprite.position.copy(center);
  sprite.scale.set(LABEL_BASE_W, LABEL_BASE_H, 1);
  sprite.visible = true;
  sprite.userData.createdAt           = performance.now(); // pour pulse d'apparition
  sprite.userData.isZoneLabel         = true;
  sprite.userData.zoneValue           = zone.total;
  sprite.userData.zoneLabelType       = zone.type;
  sprite.userData.zoneSignature       = makeZoneSignature(zone);
  sprite.userData.worldCurvatureFlatY = sprite.position.y;
  // Tracking pour rebuild ciblé
  sprite.userData.involvedTileKeys   = involvedTileKeys   ?? [...new Set(zone.sectors.map(s => s.tile.key))];
  sprite.userData.involvedSectorKeys = involvedSectorKeys ?? zone.sectors.map(s => makeNodeKey(s.tile.key, s.edge));
  return sprite;
}

export function makeZoneSignature(zone) {
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

// Hexagone paysage centré sur (cx,cy), demi-largeur w2, demi-hauteur h2, encoche = notch.
function hexPath(ctx, cx, cy, w2, h2, notch) {
  ctx.beginPath();
  ctx.moveTo(cx - w2 + notch, cy - h2);
  ctx.lineTo(cx + w2 - notch, cy - h2);
  ctx.lineTo(cx + w2, cy);
  ctx.lineTo(cx + w2 - notch, cy + h2);
  ctx.lineTo(cx - w2 + notch, cy + h2);
  ctx.lineTo(cx - w2, cy);
  ctx.closePath();
}

const BIOME_EMOJI = {
  water:  '💧',
  field:  '🌾',
  forest: '🌲',
  house:  '🛖',
  grass:  '🌿',
  rail:   '🛤️',
};

// Tailles emoji par biome (ajustements successifs)
const BIOME_EMOJI_SIZE = {
  water:  70,  // +11%
  house:  72,  // +12%
  rail:   71,  // +13%
  field:  88,
  forest: 95,  // +8%
  grass:  88,
};

// Décalage Y dans le cercle (textBaseline='middle') — corrige le centrage visuel par emoji
// Valeur positive = descend ; réduire pour remonter dans le cercle
const BIOME_EMOJI_OFFSET_Y = {
  water:  5,
  house:  1,
  rail:   4,
  forest: 3,
  field:  12,
  grass:  12,
};

function getTextSpriteMaterial(text, type) {
  const cacheKey = `zone:${type}:${text}`;
  if (sharedLabelCache.has(cacheKey)) return sharedLabelCache.get(cacheKey);

  // Résolution doublée (384×332) pour netteté HD.
  // Ratio 384/332 ≈ 1.157 ≈ 2/√3 : hexagone régulier à sommet plat.
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 332;

  const emoji = BIOME_EMOJI[type] ?? '';

  function draw() {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Ombre portée : w2=176, h2=176×0.866=152, notch=88
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 5;
    ctx.fillStyle = getLabelBackground(type);
    hexPath(ctx, 192, 166, 176, 152, 88);
    ctx.fill();

    // Bordure blanche
    ctx.shadowBlur = 0;
    ctx.lineWidth = 11;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
    hexPath(ctx, 192, 166, 170, 147, 85);
    ctx.stroke();

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (emoji) {
      // Espacement dynamique selon le nombre de chiffres — légèrement rapprochés du centre vs original
      const digits  = text.length;
      const numX    = digits >= 3 ? 122 : digits === 2 ? 134 : 146;
      const emojiX  = digits >= 3 ? 270 : digits === 2 ? 258 : 248;
      const lineY   = 166;

      // Nombre — +12px compense la cap-height visuelle des chiffres (+17% → 150px)
      ctx.font = `900 150px ${HEX_FONT_FAMILY}`;
      ctx.letterSpacing = '0px';
      ctx.fillStyle = '#1a1008';
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#1a1008';
      ctx.strokeText(text, numX, lineY + 12);
      ctx.fillText(text, numX, lineY + 12);

      // Cercle sombre derrière l'emoji (-8% → rayon 58)
      ctx.beginPath();
      ctx.arc(emojiX, lineY, 58, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(20, 12, 4, 0.72)';
      ctx.fill();

      // Emoji — taille et offset Y par biome
      const emojiSize    = BIOME_EMOJI_SIZE[type] ?? 88;
      const emojiOffsetY = BIOME_EMOJI_OFFSET_Y[type] ?? 12;
      ctx.font = `${emojiSize}px serif`;
      ctx.letterSpacing = '0px';
      ctx.lineWidth = 0;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(emoji, emojiX, lineY + emojiOffsetY);
    } else {
      // Pas d'emoji : nombre centré
      ctx.font = `900 128px ${HEX_FONT_FAMILY}`;
      ctx.letterSpacing = '0px';
      ctx.fillStyle = '#1a1008';
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#1a1008';
      ctx.strokeText(text, 192, 166 + 12);
      ctx.fillText(text, 192, 166 + 12);
    }
  }

  draw();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace; // CanvasTexture défaut = NoColorSpace → double gamma → couleurs claires
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  material.toneMapped = false; // bypasse ACESFilmic : couleurs canvas fidèles
  sharedLabelCache.set(cacheKey, material);

  // Redessiner après chargement de DeltaBlock (corrige la race condition au 1er frame)
  hexFontReady?.then?.(() => {
    draw();
    texture.needsUpdate = true;
  });

  return material;
}

function getLabelBackground(type) {
  // Pas de THREE.Color : son constructeur convertit hex → linéaire (r160),
  // et color.r * 255 donnerait des valeurs linéaires interprétées comme sRGB par le canvas.
  const hex = getZoneColor(type);
  const r   = (hex >> 16) & 0xff;
  const g   = (hex >>  8) & 0xff;
  const b   =  hex        & 0xff;
  return `rgba(${r}, ${g}, ${b}, 0.86)`;
}

// ─── Utilitaires ──────────────────────────────────────────────────────────────

export function getHoveredEdge(placedTile, worldPoint) {
  const world = axialToWorld(placedTile.q, placedTile.r);
  const localX = worldPoint.x - world.x;
  const localZ = worldPoint.z - world.z;
  const angle = (Math.atan2(localZ, localX) + Math.PI * 2) % (Math.PI * 2);
  const sectorIndex = Math.floor(angle / (Math.PI / 3)) % SECTOR_DEFS.length;
  return SECTOR_DEFS[sectorIndex].key;
}

export function isSupportedZoneType(type) {
  return Object.values(EDGE_TYPES).includes(type);
}
