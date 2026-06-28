import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { TEXT_LAYER, registerCurvedSprite } from './threeSetup.js';
import { EDGE_ORDER, EDGE_TYPES, HEX_SIZE, TILE_VISUAL, SECTOR_DEFS } from './config.js';
import { axialToWorld, makeHexKey } from './hex.js';
import { createOuterVertices } from './hexGeometry.js';
import { makeNodeKey, getTileEdgeType, clearGroup } from './tileUtils.js';
import { collectZone, getFullTextureNeighbors } from './zoneUtils.js';
import { createWaterBeachMesh } from './waterBeachGeometry.js';
import { createHoverZoneBoundary, getZoneColor, toWorldVector } from './waterZoneBoundary.js';
import { HEX_FONT_FAMILY, sharedLabelCache, hexFontReady } from './hexLabelFont.js';
import { LOD_ZONE_LABEL_CULL_DISTANCE, LOD_ZONE_LABEL_NEAR_FADE_START, LOD_ZONE_LABEL_NEAR_FADE_END } from './variables.js';
import { getWorldCurvatureDrop } from './worldCurvature.js';

const SECTOR_BY_KEY = Object.fromEntries(SECTOR_DEFS.map(sector => [sector.key, sector]));
const LABEL_Y = 0.576; // −20 % (était 0.72)
const HOVER_LABEL_SCALE = 1.85;
const HOVER_LABEL_Y_OFFSET = 0.285;
// Base sprite scale (zone de valeur "1") — les grosses zones montent jusqu'à +35%.
const LABEL_BASE_W = 0.95; // +16% (était 0.82)
const LABEL_BASE_H = 0.82; // +16% (était 0.71)

// Directions axiales hexagonales — pour le rebuild ciblé (affectedHex + 6 voisins).
const _HEX_DIR = [[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];
function _computeAffectedKeys(hex) {
  const keys = new Set([makeHexKey(hex.q, hex.r)]);
  for (const [dq, dr] of _HEX_DIR) keys.add(makeHexKey(hex.q + dq, hex.r + dr));
  return keys;
}

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

export function rebuildWaterZoneOverlay(overlay, placedTiles, affectedHex = null) {
  if (affectedHex === null) {
    // ── Rebuild complet (chargement initial, undo, multiplayer sync) ────────────
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
        _addZoneObjects(overlay, zone, placedTiles);
      }
    }
    rescaleZoneLabels(overlay);
    return;
  }

  // ── Rebuild ciblé : seulement les zones touchant affectedHex + ses 6 voisins ──
  // Avantage : O(zones_locales) au lieu de O(toutes_tuiles).
  const affectedKeys = _computeAffectedKeys(affectedHex);

  // 1. Retirer les objets de zone dont au moins une tuile est dans affectedKeys ;
  //    pré-remplir visited avec les secteurs des zones entièrement hors de la zone touchée.
  const preVisited = new Set();
  const toRemove = [];
  for (const child of overlay.children) {
    const tileKeys = child.userData?.involvedTileKeys;
    if (!tileKeys) { toRemove.push(child); continue; } // objet legacy sans tracking → purge
    if (tileKeys.some(k => affectedKeys.has(k))) {
      toRemove.push(child);
    } else {
      for (const sk of child.userData.involvedSectorKeys ?? []) preVisited.add(sk);
    }
  }
  for (const obj of toRemove) overlay.remove(obj);

  // 2. Ré-afficher les labels valeur des tuiles affectées (hideZoneDetailLabels les masquera si besoin).
  for (const key of affectedKeys) {
    const tile = placedTiles.get(key);
    if (tile) setTileValueLabelsVisible(tile, true);
  }

  // 3. BFS uniquement depuis les tuiles affectées ; preVisited blinde les zones non touchées.
  const visited = new Set(preVisited);
  for (const key of affectedKeys) {
    const placedTile = placedTiles.get(key);
    if (!placedTile) continue;
    for (const edge of EDGE_ORDER) {
      const type = getTileEdgeType(placedTile, edge);
      const nodeKey = makeNodeKey(placedTile.key, edge);
      if (visited.has(nodeKey) || !isSupportedZoneType(type)) continue;
      const zone = collectTextureZone(placedTile, edge, type, placedTiles, visited);
      if (zone.sectors.length < 2) continue;
      hideZoneDetailLabels(zone);
      _addZoneObjects(overlay, zone, placedTiles);
    }
  }

  rescaleZoneLabels(overlay);
}

/** Crée et ajoute les objets Three.js pour une zone (beach mesh + label sprite), en les taguant
 *  avec les clés de tracking nécessaires au rebuild ciblé. */
function _addZoneObjects(overlay, zone, placedTiles) {
  const involvedTileKeys    = [...new Set(zone.sectors.map(s => s.tile.key))];
  const involvedSectorKeys  = zone.sectors.map(s => makeNodeKey(s.tile.key, s.edge));
  if (zone.type === EDGE_TYPES.water) {
    const beach = createWaterBeachMesh(zone, placedTiles);
    beach.userData.involvedTileKeys   = involvedTileKeys;
    beach.userData.involvedSectorKeys = involvedSectorKeys;
    // Centroïde monde pour LOD distance
    let cx = 0, cz = 0;
    for (const sec of zone.sectors) {
      const wp = axialToWorld(sec.tile.q, sec.tile.r);
      cx += wp.x; cz += wp.z;
    }
    beach.userData.worldCenterX = cx / zone.sectors.length;
    beach.userData.worldCenterZ = cz / zone.sectors.length;
    overlay.add(beach);
  }
  const _label = createZoneLabel(zone, involvedTileKeys, involvedSectorKeys);
  registerCurvedSprite(_label);
  overlay.add(_label);
}

/**
 * Redimensionne tous les labels de zone proportionnellement à leur valeur
 * par rapport au maximum courant : de 55 % (valeur 1) à 200 % (valeur max).
 * À rappeler après chaque rebuild pour tenir compte de la nouvelle valeur max.
 */
function rescaleZoneLabels(overlay) {
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

// ─── Hover et labels — helpers internes ──────────────────────────────────────

function setCurvedSpriteFlatY(sprite, y) {
  sprite.userData.worldCurvatureFlatY = y;
  sprite.position.y = y + getWorldCurvatureDrop(sprite.position.x, sprite.position.z);
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

function createZoneLabel(zone, involvedTileKeys = null, involvedSectorKeys = null) {
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

// ─── LOD labels de zone ────────────────────────────────────────────────────────

/**
 * Masque/affiche les labels de zones contigüe selon la distance caméra.
 * À appeler dans le bloc LOD de scene.js (tous les N frames).
 */
// Altitude max au-delà de laquelle les plages sont cachées (vue aérienne lointaine)
const BEACH_CULL_CAM_HEIGHT     = 9.0;
// Distance horizontale max caméra→centroïde quand caméra basse (zoom in)
const BEACH_CULL_DIST_SQ_LOW    = 20 * 20;  // caméra Y ≤ 6
// Distance réduite quand caméra mi-hauteur
const BEACH_CULL_DIST_SQ_MID    = 15 * 15;  // caméra Y entre 6 et BEACH_CULL_CAM_HEIGHT

/**
 * LOD des plages : masque les beach meshes trop loin ou vus de haut.
 * Appelé dans le RAF, à côté de updateZoneLabelLOD.
 */
export function updateBeachLOD(overlay, camera) {
  if (!overlay) return;
  const camY  = camera.position.y;
  const hideAll = camY > BEACH_CULL_CAM_HEIGHT;
  const camX  = camera.position.x;
  const camZ  = camera.position.z;
  const distSq = camY <= 6 ? BEACH_CULL_DIST_SQ_LOW : BEACH_CULL_DIST_SQ_MID;
  overlay.traverse(object => {
    if (object.name !== 'water-zone-sand-beach') return;
    if (hideAll) { object.visible = false; return; }
    const cx = object.userData.worldCenterX;
    const cz = object.userData.worldCenterZ;
    if (cx === undefined) { object.visible = true; return; }
    const dx = cx - camX;
    const dz = cz - camZ;
    object.visible = (dx * dx + dz * dz) < distSq;
  });
}

export function updateZoneLabelLOD(overlay, camera) {
  if (!overlay) return;

  // Mode super-immersif : masquer tous les labels (même logique que HUDs)
  if (document.body.classList.contains('huds-force-hidden')) {
    overlay.traverse(obj => { if (obj.userData?.isZoneLabel) obj.visible = false; });
    return;
  }

  const camPos = camera.position;
  const camY   = camera.position.y; // altitude de la caméra au-dessus du sol
  const now    = performance.now();

  // ── Passe 1 : stats par catégorie ─────────────────────────────────────────
  // max par type (pour cull distance proportionnel)
  // + liste des valeurs triées pour calculer le seuil de visibilité.
  const maxPerType  = {};
  const valsByType  = {};
  overlay.traverse(obj => {
    if (!obj.userData?.isZoneLabel) return;
    const type = obj.userData.zoneLabelType;
    const v    = obj.userData.zoneValue ?? 1;
    if (v > (maxPerType[type] ?? 0)) maxPerType[type] = v;
    (valsByType[type] ??= []).push(v);
  });

  // Seuil de visibilité per-catégorie :
  //   – on retient au plus MAX_LABELS_PER_TYPE labels par type ;
  //   – parmi eux, uniquement la fraction SHOW_TOP_FRACTION la plus élevée ;
  //   – le label de valeur max par catégorie est TOUJOURS inclus (keepCount ≥ 1).
  const MAX_LABELS_PER_TYPE = 4;
  const SHOW_TOP_FRACTION   = 0.25;
  const minValToShow = {};
  for (const [type, vals] of Object.entries(valsByType)) {
    vals.sort((a, b) => b - a); // décroissant
    const keepCount = Math.max(1, Math.min(MAX_LABELS_PER_TYPE,
      Math.ceil(vals.length * SHOW_TOP_FRACTION)));
    minValToShow[type] = vals[keepCount - 1]; // seuil = plus petite valeur du top-K
  }

  // ── Passe 2 : LOD par label ────────────────────────────────────────────────
  overlay.traverse(object => {
    if (!object.userData?.isZoneLabel) return;

    // Fade altitude : courbe très abrupte — soit visible, soit caché.
    // t ∈ [0,1] : 0 = très proche sol, 1 = altitude normale.
    const _ft = camY >= LOD_ZONE_LABEL_NEAR_FADE_START ? 1.0
      : Math.max(0, Math.min(1, (camY - LOD_ZONE_LABEL_NEAR_FADE_END) /
          (LOD_ZONE_LABEL_NEAR_FADE_START - LOD_ZONE_LABEL_NEAR_FADE_END)));
    // Smoothstep concentré sur [0.12, 0.50] — en dehors : 0 ou 1 strict.
    const _ftS = Math.max(0, Math.min(1, (_ft - 0.12) / 0.38));
    const _fadedOpacity = _ftS * _ftS * (3 - 2 * _ftS);

    // Label au survol : toujours affiché (priorité absolue), même si non retenu par le filtre.
    if (object.userData.isHoverHighlightedZoneLabel) {
      if (object.material) object.material.opacity = _fadedOpacity;
      object.visible = _fadedOpacity > 0;
      return;
    }

    // Filtre per-catégorie : masquer les labels hors top-K pour ce type.
    const zv   = object.userData.zoneValue ?? 1;
    const type = object.userData.zoneLabelType;
    if (zv < (minValToShow[type] ?? 1)) {
      object.visible = false;
      return;
    }

    // Cull distance — distance XZ seulement (pas 3D) pour ne pas pénaliser
    // les labels vus depuis un angle oblique où la distance diagonale explose.
    const dx = camPos.x - object.position.x;
    const dz = camPos.z - object.position.z;
    const distXZ = Math.sqrt(dx * dx + dz * dz);

    // Cull distance proportionnelle à la valeur relative dans la catégorie
    // (le plus gros label reste visible de plus loin).
    const maxVal = maxPerType[type] ?? 1;
    const ratio = zv / maxVal;
    const cullDist = LOD_ZONE_LABEL_CULL_DISTANCE * (0.35 + 0.65 * ratio);

    if (distXZ >= cullDist) { object.visible = false; return; }
    object.visible = true;

    // ── Opacité : fondu sinusoïdal quand la caméra descend vers le sol ──
    const opacity = _fadedOpacity;
    if (object.material) object.material.opacity = opacity;
    if (opacity <= 0) { object.visible = false; return; }

    // ── Taille : stable quelle que soit l'altitude + pulse d'apparition ──
    const base = object.userData._baseScale;
    if (base) {
      // Taille fixe (pas de compensation altitude) — les labels ont la bonne taille
      // à toutes les hauteurs de caméra. La perspective naturelle fait le reste.
      let sizeFactor = 1.0;

      // Arc sin unique à la création du label (durée 0.7s, amplitude ±40 %).
      const age = (now - (object.userData.createdAt ?? 0)) / 1000;
      if (age < 0.7) {
        const t = age / 0.7;
        sizeFactor *= 1 + Math.sin(t * Math.PI) * 0.40;
      }

      object.scale.set(base.x * sizeFactor, base.y * sizeFactor, 1);
    }
  });
}
