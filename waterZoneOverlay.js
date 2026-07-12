// ─── waterZoneOverlay.js — zones de texture (rebuild, hover, LOD) ───────────
// Découpé le 2026-07-11 (round 3, découpage sans risque, cf. CONTEXT.md §21) :
// le rendu/état des labels de zone (création canvas/emoji, hover, rescale) a été
// extrait vers waterZoneLabels.js (~330 lignes). Ce fichier garde le cycle de vie
// (create/rebuild/update) et le LOD. Dépendance à sens unique vers
// waterZoneLabels.js — API publique inchangée (seul importateur : scene.js).
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { registerCurvedSprite } from './threeSetup.js';
import { EDGE_ORDER, EDGE_TYPES } from './config.js';
import { axialToWorld, makeHexKey } from './hex.js';
import { makeNodeKey, getTileEdgeType, clearGroup, disposeObject3D } from './tileUtils.js';
import { createWaterBeachMesh } from './waterBeachGeometry.js';
import { buildShoreDisplacementMap } from './waterSurfaceOverlay.js';
import { createHoverZoneBoundary } from './waterZoneBoundary.js';
import { LOD_ZONE_LABEL_CULL_DISTANCE, LOD_ZONE_LABEL_NEAR_FADE_START, LOD_ZONE_LABEL_NEAR_FADE_END } from './variables.js';
import {
  setCurvedSpriteFlatY,
  HOVER_LABEL_Y_OFFSET,
  getHoveredEdge,
  isSupportedZoneType,
  collectTextureZone,
  resetHoverValueLabels,
  resetHoverZoneLabels,
  highlightHoverZoneLabel,
  resetPlacedValueLabels,
  hideZoneDetailLabels,
  setTileValueLabelsVisible,
  rescaleZoneLabels,
  createZoneLabel
} from './waterZoneLabels.js';

// ── Anti-chevauchement labels ↔ astre (soleil/lune) ─────────────────────────
// L'astre est rendu sur WORLD_LAYER, testé en profondeur contre le monde (tours,
// arbres, eau) — mais les labels (TEXT_LAYER) sont peints dans une passe séparée
// SANS test de profondeur (pour rester lisibles au-dessus de tout, y compris les
// tours), donc un label peut visuellement "recouvrir" l'astre quand leurs positions
// écran coïncident (caméra haute notamment). Plutôt que de retoucher le pipeline de
// rendu (tentative précédente = régression), on masque/atténue ici, en CPU, les
// quelques labels dont la position écran tombe près de celle de l'astre — contournement
// ciblé, sans risque pour le reste du rendu, coût négligeable (une projection par label,
// déjà dans une boucle exécutée chaque frame par ailleurs).
const ASTRE_LABEL_AVOID_RADIUS = 0.16; // rayon d'exclusion en unités NDC (écran = -1..1)
const _astreWorldPos   = new THREE.Vector3();
const _astreScreenPos  = new THREE.Vector2();
const _astreToBody      = new THREE.Vector3();
const _astreCamForward  = new THREE.Vector3();
const _labelScreenPos  = new THREE.Vector3();
let _astreScreenValid = false;

function _updateAstreScreenPosition(scene, camera) {
  _astreScreenValid = false;
  const astre = scene?.getObjectByName?.('visible-sky-sun');
  if (!astre) return;
  astre.getWorldPosition(_astreWorldPos);
  _astreToBody.copy(_astreWorldPos).sub(camera.position);
  if (_astreToBody.lengthSq() < 1e-6) return;
  _astreToBody.normalize();
  camera.getWorldDirection(_astreCamForward);
  if (_astreCamForward.dot(_astreToBody) <= 0.05) return; // astre derrière/sur le côté → pas de risque de recouvrement
  _astreWorldPos.project(camera); // NDC en place (x, y, z)
  _astreScreenPos.set(_astreWorldPos.x, _astreWorldPos.y);
  _astreScreenValid = true;
}

// Retourne 1 si le point est loin de l'astre à l'écran, 0 s'il est en plein dessus,
// avec un fondu doux (smoothstep) entre les deux — évite un pop brutal au bord de la zone.
function _astreAvoidFade(worldPosition, camera) {
  if (!_astreScreenValid) return 1;
  _labelScreenPos.copy(worldPosition).project(camera);
  const dx = _labelScreenPos.x - _astreScreenPos.x;
  const dy = _labelScreenPos.y - _astreScreenPos.y;
  const distSq = dx * dx + dy * dy;
  const r = ASTRE_LABEL_AVOID_RADIUS;
  if (distSq >= r * r) return 1;
  const t = Math.max(0, Math.min(1, Math.sqrt(distSq) / r));
  return t * t * (3 - 2 * t); // smoothstep
}

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

// Signature de la dernière zone survolée pour laquelle le contour a été construit.
// undefined = jamais construit (force le premier rebuild). null = aucune zone (contour vide).
let _lastHoverSignature = undefined;

// ── Instrumentation temporaire (diagnostic throttle GPU au survol) ──────────────
// Compte les appels totaux vs les rebuilds réellement exécutés (signature changée),
// pour vérifier depuis scene.js si le garde anti-thrash fonctionne comme prévu.
let _hoverRebuildCalls = 0;
let _hoverRebuildFullCount = 0;
export function getHoverRebuildStats() {
  return { calls: _hoverRebuildCalls, full: _hoverRebuildFullCount };
}
export function resetHoverRebuildStats() {
  _hoverRebuildCalls = 0;
  _hoverRebuildFullCount = 0;
}

export function rebuildHoverZoneOverlay(overlay, hoverHex, worldPoint, placedTiles, zoneOverlay = null) {
  _hoverRebuildCalls++;
  // Calcule la signature de la zone actuellement survolée (ou null si rien à afficher),
  // SANS toucher au groupe — permet de comparer avant de payer le coût du rebuild.
  let placedTile = null, hoveredEdge = null, type = null, signature = null;
  if (hoverHex && worldPoint) {
    placedTile = placedTiles.get(makeHexKey(hoverHex.q, hoverHex.r));
    if (placedTile) {
      hoveredEdge = getHoveredEdge(placedTile, worldPoint);
      type = getTileEdgeType(placedTile, hoveredEdge);
      if (isSupportedZoneType(type)) signature = `${placedTile.key}|${hoveredEdge}`;
    }
  }

  // Anti-thrash : ce rebuild est appelé à chaque événement natif "mousemove" (via
  // controls.onHover), qui tire bien plus vite que le framerate (jusqu'à ~1000 Hz selon
  // la souris) — sans ce garde, le moindre micro-jitter du curseur relançait un rebuild
  // complet de géométrie (segments de contour + disques de jonction, tous alloués sans
  // pooling) même en restant exactement sur la même tuile/arête. Coût GPU/CPU répété à
  // fréquence mousemove pendant tout survol d'une zone → throttle observé. On ne
  // reconstruit désormais que lorsque la zone survolée change réellement.
  if (signature === _lastHoverSignature) return;
  _lastHoverSignature = signature;
  _hoverRebuildFullCount++;

  clearGroup(overlay);
  resetHoverValueLabels(placedTiles);
  resetHoverZoneLabels(zoneOverlay);
  if (!signature) return;

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
  // Table de déplacement organique du rivage (shoreNoise) — partagée avec
  // waterSurfaceOverlay.js pour que les plages épousent exactement le même
  // contour d'eau (même clé de position monde ⇒ même déplacement).
  const shoreMap = buildShoreDisplacementMap(placedTiles);

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
        _addZoneObjects(overlay, zone, placedTiles, shoreMap);
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
  for (const obj of toRemove) {
    overlay.remove(obj);
    disposeObject3D(obj); // sans ça : géométrie/matériaux jamais libérés → fuite à chaque pose de tuile
  }

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
      _addZoneObjects(overlay, zone, placedTiles, shoreMap);
    }
  }

  rescaleZoneLabels(overlay);
}

/** Crée et ajoute les objets Three.js pour une zone (beach mesh + label sprite), en les taguant
 *  avec les clés de tracking nécessaires au rebuild ciblé. */
function _addZoneObjects(overlay, zone, placedTiles, shoreMap) {
  const involvedTileKeys    = [...new Set(zone.sectors.map(s => s.tile.key))];
  const involvedSectorKeys  = zone.sectors.map(s => makeNodeKey(s.tile.key, s.edge));
  if (zone.type === EDGE_TYPES.water) {
    const beach = createWaterBeachMesh(zone, placedTiles, shoreMap);
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

export function updateZoneLabelLOD(overlay, camera, scene = null) {
  if (!overlay) return;
  _updateAstreScreenPosition(scene, camera);

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

    // ── Opacité : fondu altitude × fondu anti-chevauchement astre (soleil/lune) ──
    const opacity = _fadedOpacity * _astreAvoidFade(object.position, camera);
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
