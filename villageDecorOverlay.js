/**
 * villageDecorOverlay.js — Props de décoration de village et bateaux côtiers.
 *
 * Contient :
 *   - createRoadsideVillageProps : panneaux, tonneaux, charrettes
 *   - createShoreBoats           : bateaux statiques sur les plages
 *   + tous les helpers de placement (isRoadDecorEdge, isShoreDecorEdge,
 *     isVillageVicinityEdge, snapPropToSafeSurface, nudgeRoadsideProp,
 *     getEdgeOutwardAngle, pickShoreBoatVariant, helpers bateaux côtiers)
 *
 * Import circulaire avec decorOverlay (createPropModel, constantes)
 * — valide en ES modules car tous les accès sont dans des corps de fonctions.
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { mergeGeometries } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/utils/BufferGeometryUtils.js';
import {
  EDGE_ORDER,
  EDGE_TYPES,
  HEX_SIZE,
  SECTOR_DEFS
} from './config.js';
import { hashUnit10k as hashUnit, hashNumber } from './hashUtils.js';
import { axialToWorld, makeHexKey } from './hex.js';
import { HEX_DIRECTIONS, getOppositeEdge } from './placementRules.js';
import { getTileEdgeType, getTileCenterType } from './tileUtils.js';
import { placeObjectOnTerrain, getTerrainSurfaceY } from './terrainHeight.js';
import { HITBOX_R } from './variables.js';
import { registerPropHitbox } from './propHitboxRegistry.js';
import { tryResolve } from './propHitboxRegistry.js';
import { getHexVertex, normalize2 } from './hexGeometry.js';
import {
  snapPropBottomToSurface,
  isSingleTerrainFootprint,
  isSafePropGroundType,
  getEdgeFromLocalPoint,
  getTileLocalPoint,
  getSectorWorldCenter
} from './propPlacement.js';
import { isInsideSpecialBuildingSafeZone } from './fieldZonesOverlay.js';
// Import circulaire résolu via live bindings ES modules — uniquement dans des corps de fonctions.
import {
  createPropModel,
  propGlbLibrary,
  ROAD_DECOR_Y,
  BARREL_TARGET_WIDTH,
  SHORE_BOAT_Y,
  SPECIAL_BUILDING_BOAT_SAFE_RADIUS,
  BARREL_VARIANTS
} from './decorOverlay.js';

const SECTOR_BY_KEY     = Object.fromEntries(SECTOR_DEFS.map(s => [s.key, s]));
const DIRECTION_BY_EDGE = Object.fromEntries(HEX_DIRECTIONS.map(d => [d.edge, d]));

// ─── Bancs, panneaux, tonneaux, charrettes ────────────────────────────────────

export function createRoadsideVillageProps(placedTiles, specialBuildingSafeZones = []) {
  const group = new THREE.Group();
  group.name = 'village-roadside-glb-props';

  for (const placedTile of placedTiles.values()) {
    const tilePos    = axialToWorld(placedTile.q, placedTile.r);
    const tileCenter = new THREE.Vector3(tilePos.x, ROAD_DECOR_Y, tilePos.z);
    const roadEdges  = EDGE_ORDER.filter(edge => isRoadDecorEdge(placedTile, edge));

    // ── Panneaux de signalisation (bords de route) ──
    for (const edge of roadEdges) {
      const edgeType = getTileEdgeType(placedTile, edge);
      const seed     = `${placedTile.key}:signpost:${edge}`;
      const chance   = edgeType === EDGE_TYPES.forest ? 0.36 : 0.30;
      if (hashUnit(seed) > chance) continue;

      const center = getSectorWorldCenter(placedTile, edge);
      const pos    = new THREE.Vector3(center.x, ROAD_DECOR_Y, center.z)
        .lerp(tileCenter, edgeType === EDGE_TYPES.forest ? 0.20 : 0.24);
      nudgeRoadsideProp(pos, placedTile, edge, seed, edgeType === EDGE_TYPES.forest ? 0.046 : 0.040);
      if (!snapPropToSafeSurface(pos, placedTile, edge, seed)) continue;
      if (isInsideSpecialBuildingSafeZone(pos, specialBuildingSafeZones)) continue;

      const _signVariant = 'road-signpost-' + (Math.floor(hashUnit(`${seed}:signpost-variant`) * 3) + 1);
      const sign = createPropModel(_signVariant, seed);
      if (!sign) continue;
      sign.name = edgeType === EDGE_TYPES.forest ? 'forest-path-signpost-glb' : 'grass-road-signpost-glb';
      sign.position.copy(pos);
      const signYaw  = getEdgeOutwardAngle(edge) + (hashUnit(`${seed}:yaw`) - 0.5) * 0.65;
      const signTopY = placeObjectOnTerrain(sign, getTileLocalPoint(pos, placedTile), edgeType, hashNumber(seed) % 97, {
        groundOffset:  0.006,
        alignToSlope:  false,
        yaw:           signYaw,
        edgeLockStart: 0.98,
        edgeLockEnd:   1.0
      });
      if (signTopY !== null) snapPropBottomToSurface(sign, signTopY - 0.006, 0.003);
      group.add(sign);
      registerPropHitbox(sign.position.x, sign.position.z, HITBOX_R.signpost);
    }

    // ── Panneaux sur rive (shore signpost) ──
    for (const edge of EDGE_ORDER) {
      if (!isShoreDecorEdge(placedTile, edge, placedTiles)) continue;
      const edgeType = getTileEdgeType(placedTile, edge);
      const seed     = `${placedTile.key}:shore-signpost:${edge}`;
      if (hashUnit(seed) > 0.58) continue;

      const center = getSectorWorldCenter(placedTile, edge);
      const pos    = new THREE.Vector3(center.x, ROAD_DECOR_Y, center.z).lerp(tileCenter, 0.24);
      nudgeRoadsideProp(pos, placedTile, edge, seed, 0.038);
      if (!snapPropToSafeSurface(pos, placedTile, edge, seed)) continue;
      if (isInsideSpecialBuildingSafeZone(pos, specialBuildingSafeZones)) continue;

      const _signVariant = 'road-signpost-' + (Math.floor(hashUnit(`${seed}:signpost-variant`) * 3) + 1);
      const sign = createPropModel(_signVariant, seed);
      if (!sign) continue;
      sign.name = 'shoreline-signpost-glb';
      sign.position.copy(pos);
      const shoreSignYaw  = getEdgeOutwardAngle(edge) + (hashUnit(`${seed}:yaw`) - 0.5) * 0.80;
      const shoreSignTopY = placeObjectOnTerrain(sign, getTileLocalPoint(pos, placedTile), edgeType, hashNumber(seed) % 97, {
        groundOffset:  0.006,
        alignToSlope:  false,
        yaw:           shoreSignYaw,
        edgeLockStart: 0.98,
        edgeLockEnd:   1.0
      });
      if (shoreSignTopY !== null) snapPropBottomToSurface(sign, shoreSignTopY - 0.006, 0.003);
      group.add(sign);
      registerPropHitbox(sign.position.x, sign.position.z, HITBOX_R.signpost);
    }

    // ── Tonneaux et charrettes — abords immédiats des villages ──
    for (const edge of roadEdges) {
      if (!isVillageVicinityEdge(placedTile, edge, placedTiles)) continue;

      const edgeType = getTileEdgeType(placedTile, edge);
      const seed     = `${placedTile.key}:village-prop:${edge}`;
      if (hashUnit(seed) > 0.72) continue;

      const center  = getSectorWorldCenter(placedTile, edge);
      const basePos = new THREE.Vector3(center.x, ROAD_DECOR_Y, center.z)
        .lerp(tileCenter, edgeType === EDGE_TYPES.forest ? 0.22 : 0.26);
      nudgeRoadsideProp(basePos, placedTile, edge, seed, 0.034);

      const isCart = hashUnit(`${seed}:kind`) > 0.136; // 72 %
      // Pas de charrette sur tuile avec eau ou rail
      if (isCart && EDGE_ORDER.some(e => {
        const t = getTileEdgeType(placedTile, e);
        return t === EDGE_TYPES.water || t === EDGE_TYPES.rail;
      })) continue;
      if (isCart) {
        if (!snapPropToSafeSurface(basePos, placedTile, edge, seed, { footprintRadius: HEX_SIZE * 0.14 })) continue;
        if (isInsideSpecialBuildingSafeZone(basePos, specialBuildingSafeZones)) continue;
        const _cartR = tryResolve(basePos.x, basePos.z, HITBOX_R.cart);
        if (!_cartR) continue;
        basePos.x = _cartR.x; basePos.z = _cartR.z;

        const _cr = hashUnit(`${seed}:cart-variant`);
        const cartVariant = _cr < 0.5 ? 'cart-2' : 'cart-3'; // charrette-1 retirée du pool
        const cart = createPropModel(cartVariant, seed);
        if (!cart) continue;
        cart.name = 'village-cart-glb';
        cart.position.copy(basePos);
        const cartYaw  = getEdgeOutwardAngle(edge) + (hashUnit(`${seed}:yaw`) - 0.5) * 1.20;
        const cartTopY = placeObjectOnTerrain(cart, getTileLocalPoint(basePos, placedTile), edgeType, hashNumber(seed) % 97, {
          groundOffset:  0.005,
          alignToSlope:  false,
          yaw:           cartYaw,
          edgeLockStart: 0.98,
          edgeLockEnd:   1.0
        });
        if (cartTopY !== null) snapPropBottomToSurface(cart, cartTopY - 0.005, 0.003);
        group.add(cart);
        registerPropHitbox(cart.position.x, cart.position.z, HITBOX_R.cart);
      } else {
        // 1, 2 ou 3 tonneaux côte à côte
        const count  = hashUnit(`${seed}:count`) < 0.15 ? 1 : hashUnit(`${seed}:count`) < 0.55 ? 2 : 3;
        const sector = SECTOR_BY_KEY[edge];
        const vA     = getHexVertex(sector.a);
        const vB     = getHexVertex(sector.b);
        const tangent        = normalize2(vB.x - vA.x, vB.z - vA.z);
        const barrelSpacing  = BARREL_TARGET_WIDTH * 1.20;

        for (let b = 0; b < count; b += 1) {
          const offset = (b - (count - 1) * 0.5) * barrelSpacing;
          const bPos   = basePos.clone();
          bPos.x += tangent.x * offset;
          bPos.z += tangent.z * offset;

          const bSeed = `${seed}:barrel:${b}`;
          if (!snapPropToSafeSurface(bPos, placedTile, edge, bSeed, { footprintRadius: HEX_SIZE * 0.075 })) continue;
          if (isInsideSpecialBuildingSafeZone(bPos, specialBuildingSafeZones)) continue;
          const _barrelR = tryResolve(bPos.x, bPos.z, HITBOX_R.barrel);
          if (!_barrelR) continue;
          bPos.x = _barrelR.x; bPos.z = _barrelR.z;

          const barrelKey  = BARREL_VARIANTS[Math.floor(hashUnit(`${bSeed}:variant`) * BARREL_VARIANTS.length)];
          const barrel     = createPropModel(barrelKey, bSeed);
          if (!barrel) continue;
          barrel.name = 'village-barrel-glb';
          barrel.position.copy(bPos);
          const barrelYaw  = hashUnit(`${bSeed}:yaw`) * Math.PI * 2;
          const barrelTopY = placeObjectOnTerrain(barrel, getTileLocalPoint(bPos, placedTile), edgeType, hashNumber(bSeed) % 97, {
            groundOffset:  0.005,
            alignToSlope:  false,
            yaw:           barrelYaw,
            edgeLockStart: 0.98,
            edgeLockEnd:   1.0
          });
          if (barrelTopY !== null) snapPropBottomToSurface(barrel, barrelTopY - 0.005, 0.003);
          group.add(barrel);
          registerPropHitbox(barrel.position.x, barrel.position.z, HITBOX_R.barrel);
        }
      }
    }

    // ── Slot allocation : une arête house dédiée par catégorie d'objet ──────
    // Chaque tuile dispose de N arêtes house. On les trie par hash pour que
    // tonneaux, charrettes et animaux atterrissent sur des côtés différents.
    // slot(i) = arête assignée au slot i (wraps si la tuile a peu d'arêtes house).
    const houseEdges  = EDGE_ORDER.filter(e => getTileEdgeType(placedTile, e) === EDGE_TYPES.house);
    const sortedSlots = houseEdges.length >= 1
      ? [...houseEdges].sort((a, b) =>
          hashUnit(`${placedTile.key}:slot:${a}`) - hashUnit(`${placedTile.key}:slot:${b}`)
        )
      : [];
    const hSlot = (i) => sortedSlots[i % sortedSlots.length];

    // Helper interne : place un tonneau ou une charrette sur un slot donné
    const placeInteriorProp = (slotIdx, seedKey, chancePct, allowCart) => {
      if (sortedSlots.length < 1) return;
      if (hashUnit(`${placedTile.key}:${seedKey}`) > chancePct) return;
      const edge    = hSlot(slotIdx);
      const seedInt = `${placedTile.key}:${seedKey}:${edge}`;
      const center  = getSectorWorldCenter(placedTile, edge);
      const pos     = new THREE.Vector3(center.x, ROAD_DECOR_Y, center.z).lerp(tileCenter, 0.65);
      nudgeRoadsideProp(pos, placedTile, edge, seedInt, 0.028);
      if (isInsideSpecialBuildingSafeZone(pos, specialBuildingSafeZones)) return;

      const tileHasRailOrWater = EDGE_ORDER.some(e2 => {
        const t = getTileEdgeType(placedTile, e2);
        return t === EDGE_TYPES.water || t === EDGE_TYPES.rail;
      });
      const isCartInt = allowCart && !tileHasRailOrWater && hashUnit(`${seedInt}:kind`) > 0.34;

      if (isCartInt) {
        const _r = tryResolve(pos.x, pos.z, HITBOX_R.cart);
        if (!_r) return;
        pos.x = _r.x; pos.z = _r.z;
        const _cri = hashUnit(`${seedInt}:cart-variant`);
        const _cartKeyInt = _cri < 0.5 ? 'cart-2' : 'cart-3'; // charrette-1 retirée du pool
        const cart = createPropModel(_cartKeyInt, seedInt);
        if (!cart) return;
        cart.name = 'village-cart-glb';
        cart.position.copy(pos);
        const cartYaw  = getEdgeOutwardAngle(edge) + (hashUnit(`${seedInt}:yaw`) - 0.5) * 1.20;
        const cartTopY = placeObjectOnTerrain(cart, getTileLocalPoint(pos, placedTile), EDGE_TYPES.house, hashNumber(seedInt) % 97, {
          groundOffset: 0.005, alignToSlope: false, yaw: cartYaw,
          edgeLockStart: 0.98, edgeLockEnd: 1.0
        });
        if (cartTopY !== null) snapPropBottomToSurface(cart, cartTopY - 0.005, 0.003);
        group.add(cart);
        registerPropHitbox(cart.position.x, cart.position.z, HITBOX_R.cart);
      } else {
        const count     = hashUnit(`${seedInt}:count`) < 0.25 ? 1 : hashUnit(`${seedInt}:count`) < 0.65 ? 2 : 3;
        const sec       = SECTOR_BY_KEY[edge];
        const tangent   = normalize2(getHexVertex(sec.b).x - getHexVertex(sec.a).x,
                                     getHexVertex(sec.b).z - getHexVertex(sec.a).z);
        const spacing   = BARREL_TARGET_WIDTH * 1.20;
        for (let b = 0; b < count; b++) {
          const off  = (b - (count - 1) * 0.5) * spacing;
          const bPos = pos.clone();
          bPos.x += tangent.x * off; bPos.z += tangent.z * off;
          if (isInsideSpecialBuildingSafeZone(bPos, specialBuildingSafeZones)) continue;
          const bSeed = `${seedInt}:barrel:${b}`;
          const _r    = tryResolve(bPos.x, bPos.z, HITBOX_R.barrel);
          if (!_r) continue;
          bPos.x = _r.x; bPos.z = _r.z;
          const barrelKey  = BARREL_VARIANTS[Math.floor(hashUnit(`${bSeed}:variant`) * BARREL_VARIANTS.length)];
          const barrel     = createPropModel(barrelKey, bSeed);
          if (!barrel) continue;
          barrel.name = 'village-barrel-glb';
          barrel.position.copy(bPos);
          const barrelTopY = placeObjectOnTerrain(barrel, getTileLocalPoint(bPos, placedTile), EDGE_TYPES.house, hashNumber(bSeed) % 97, {
            groundOffset: 0.005, alignToSlope: false,
            yaw: hashUnit(`${bSeed}:yaw`) * Math.PI * 2,
            edgeLockStart: 0.98, edgeLockEnd: 1.0
          });
          if (barrelTopY !== null) snapPropBottomToSurface(barrel, barrelTopY - 0.005, 0.003);
          group.add(barrel);
          registerPropHitbox(barrel.position.x, barrel.position.z, HITBOX_R.barrel);
        }
      }
    };

    // Slot 0 : tonneau(x) ou charrette — 46 % de chance
    placeInteriorProp(0, 'vip-s0', 0.46, /*allowCart*/ true);
    // Slot 1 : tonneaux supplémentaires (seulement si ≥ 2 arêtes house) — 38 %
    if (sortedSlots.length >= 2) placeInteriorProp(1, 'vip-s1', 0.38, /*allowCart*/ false);

    // ── Fontaines — tuiles avec maisons (44 %) ou prairie adjacente à un village (8 %) ──
    if (houseEdges.length >= 1) {
      // Pas de fontaine sur tuile avec rail ou eau
      const tileHasRailOrWater = EDGE_ORDER.some(e => {
        const t = getTileEdgeType(placedTile, e);
        return t === EDGE_TYPES.rail || t === EDGE_TYPES.water;
      });
      const seedF = `${placedTile.key}:fountain`;
      if (!tileHasRailOrWater && hashUnit(seedF) <= 0.70) {
        // Barycentre des centres de secteurs house, tiré vers le centre de la tuile
        let fx = 0, fz = 0;
        for (const he of houseEdges) {
          const sc = getSectorWorldCenter(placedTile, he);
          fx += sc.x; fz += sc.z;
        }
        fx /= houseEdges.length;
        fz /= houseEdges.length;
        const pull = 0.50 + hashUnit(`${seedF}:pull`) * 0.25;
        fx += (tilePos.x - fx) * pull;
        fz += (tilePos.z - fz) * pull;

        // Légère variation de position
        const nudgeAngle = hashUnit(`${seedF}:angle`) * Math.PI * 2;
        const nudgeDist  = hashUnit(`${seedF}:dist`) * HEX_SIZE * 0.06;
        fx += Math.cos(nudgeAngle) * nudgeDist;
        fz += Math.sin(nudgeAngle) * nudgeDist;

        const fPos = new THREE.Vector3(fx, ROAD_DECOR_Y, fz);
        // Pas de tryResolve : la fontaine est intentionnellement au cœur du village,
        // entre les bâtiments — tryResolve échouerait systématiquement sur leurs hitbox.
        if (!isInsideSpecialBuildingSafeZone(fPos, specialBuildingSafeZones)) {
          const fountainKey = hashUnit(`${seedF}:variant`) < 0.5 ? 'fountain-1' : 'fountain-2';
          const fountain    = createPropModel(fountainKey, seedF);
          if (fountain) {
            fountain.name     = 'village-fountain-glb';
            fountain.position.copy(fPos);
            // Snap Y to actual terrain surface (corrige le flottement sur biome champ/blé)
            const _fLocal   = getTileLocalPoint(fountain.position, placedTile);
            const _fEdge    = getEdgeFromLocalPoint(_fLocal) ?? EDGE_ORDER[0];
            const _fTopY    = placeObjectOnTerrain(fountain, _fLocal,
              getTileEdgeType(placedTile, _fEdge), hashNumber(seedF) % 97,
              { groundOffset: 0.005, alignToSlope: false, edgeLockStart: 0.98, edgeLockEnd: 1.0 });
            if (_fTopY !== null) snapPropBottomToSurface(fountain, _fTopY - 0.005, 0.004);
            const _fGD = fountain.userData.groundOffsetDelta ?? 0;
            if (_fGD !== 0) fountain.position.y += _fGD;
            fountain.rotation.y = hashUnit(`${seedF}:rot`) * Math.PI * 2;
            group.add(fountain);
            registerPropHitbox(fountain.position.x, fountain.position.z, HITBOX_R.fountain);
          }
        }
      }
    }

    // Fontaine prairie : tuile sans maison, adjacente à un village, chance rare
    if (houseEdges.length === 0) {
      const hasGrass = EDGE_ORDER.some(e => {
        const t = getTileEdgeType(placedTile, e);
        return t === EDGE_TYPES.grass || t === EDGE_TYPES.forest;
      });
      if (hasGrass) {
        const isNearVillage = HEX_DIRECTIONS.some(dir => {
          const nb = placedTiles.get(makeHexKey(placedTile.q + dir.q, placedTile.r + dir.r));
          return nb && EDGE_ORDER.some(e => getTileEdgeType(nb, e) === EDGE_TYPES.house);
        });
        if (isNearVillage) {
          const seedFP = `${placedTile.key}:fountain-prairie`;
          if (hashUnit(seedFP) <= 0.18) {
            const angle = hashUnit(`${seedFP}:angle`) * Math.PI * 2;
            const dist  = hashUnit(`${seedFP}:dist`) * HEX_SIZE * 0.10;
            const fPos  = new THREE.Vector3(
              tilePos.x + Math.cos(angle) * dist,
              ROAD_DECOR_Y,
              tilePos.z + Math.sin(angle) * dist
            );
            const tileHasRailOrWaterP = EDGE_ORDER.some(e => {
              const t = getTileEdgeType(placedTile, e);
              return t === EDGE_TYPES.rail || t === EDGE_TYPES.water;
            });
            if (!tileHasRailOrWaterP && !isInsideSpecialBuildingSafeZone(fPos, specialBuildingSafeZones)) {
              const fountainKey = hashUnit(`${seedFP}:variant`) < 0.5 ? 'fountain-1' : 'fountain-2';
              const fountain    = createPropModel(fountainKey, seedFP);
              if (fountain) {
                fountain.name       = 'village-fountain-glb';
                fountain.position.copy(fPos);
                // Snap Y to actual terrain surface (corrige le flottement sur biome champ/blé)
                const _fpLocal  = getTileLocalPoint(fountain.position, placedTile);
                const _fpEdge   = getEdgeFromLocalPoint(_fpLocal) ?? EDGE_ORDER[0];
                const _fpTopY   = placeObjectOnTerrain(fountain, _fpLocal,
                  getTileEdgeType(placedTile, _fpEdge), hashNumber(seedFP) % 97,
                  { groundOffset: 0.005, alignToSlope: false, edgeLockStart: 0.98, edgeLockEnd: 1.0 });
                if (_fpTopY !== null) snapPropBottomToSurface(fountain, _fpTopY - 0.005, 0.004);
                const _fpGD = fountain.userData.groundOffsetDelta ?? 0;
                if (_fpGD !== 0) fountain.position.y += _fpGD;
                fountain.rotation.y = hashUnit(`${seedFP}:rot`) * Math.PI * 2;
                group.add(fountain);
                registerPropHitbox(fountain.position.x, fountain.position.z, HITBOX_R.fountain);
              }
            }
          }
        }
      }
    }

    // ── Meule — un par tuile village (80 % de chance) ────────────────────────
    if (houseEdges.length >= 1) {
      const seedMl = `${placedTile.key}:meule`;
      if (hashUnit(seedMl) <= 0.80) {
        // Positionnée dans la cour : mi-chemin centre / premier secteur maison
        const _mhe  = houseEdges[Math.floor(hashUnit(`${seedMl}:slot`) * houseEdges.length)];
        const _msc  = getSectorWorldCenter(placedTile, _mhe);
        const _pull = 0.55 + hashUnit(`${seedMl}:pull`) * 0.20;
        const mPos  = new THREE.Vector3(
          _msc.x + (tilePos.x - _msc.x) * _pull + (hashUnit(`${seedMl}:ox`) - 0.5) * HEX_SIZE * 0.10,
          ROAD_DECOR_Y,
          _msc.z + (tilePos.z - _msc.z) * _pull + (hashUnit(`${seedMl}:oz`) - 0.5) * HEX_SIZE * 0.10
        );
        if (!isInsideSpecialBuildingSafeZone(mPos, specialBuildingSafeZones)) {
          const meule = createPropModel('meule', seedMl);
          if (meule) {
            meule.name = 'village-meule-glb';
            meule.position.copy(mPos);
            const _mlLocal = getTileLocalPoint(mPos, placedTile);
            const _mlEdge  = getEdgeFromLocalPoint(_mlLocal) ?? EDGE_ORDER[0];
            const _mlTopY  = placeObjectOnTerrain(meule, _mlLocal,
              getTileEdgeType(placedTile, _mlEdge), hashNumber(seedMl) % 97,
              { groundOffset: 0.004, alignToSlope: false, yaw: hashUnit(`${seedMl}:rot`) * Math.PI * 2, edgeLockStart: 0.98, edgeLockEnd: 1.0 });
            if (_mlTopY !== null) snapPropBottomToSurface(meule, _mlTopY - 0.004, 0.003);
            group.add(meule);
            // pas de hitbox : meule = objet décoratif sans collision
          }
        }
      }
    }

    // ── Animaux de village (poules, chien, chat, cheval) ──────────────────────
    // houseEdges est déjà calculé plus haut pour les fontaines.
    if (houseEdges.length >= 1) {
      // Position dans la cour (pull 0.65–0.85, même zone que fontaine)
      const animalPos = (edge, seed, spread) => {
        const sc   = getSectorWorldCenter(placedTile, edge);
        const pull = 0.65 + hashUnit(`${seed}:pull`) * 0.20;
        return new THREE.Vector3(
          sc.x + (tilePos.x - sc.x) * pull + (hashUnit(`${seed}:ox`) - 0.5) * spread,
          ROAD_DECOR_Y,
          sc.z + (tilePos.z - sc.z) * pull + (hashUnit(`${seed}:oz`) - 0.5) * spread
        );
      };

      // Position à la cellule centrale de la tuile
      const centerPos = (seed, spread) => new THREE.Vector3(
        tilePos.x + (hashUnit(`${seed}:cx`) - 0.5) * spread,
        ROAD_DECOR_Y,
        tilePos.z + (hashUnit(`${seed}:cz`) - 0.5) * spread
      );

      // Helper commun : place un animal (même pattern que fontaine)
      const placeAnimal = (key, seed, pos, groundOff, shadowCast, snapClearance = 0.002) => {
        if (isInsideSpecialBuildingSafeZone(pos, specialBuildingSafeZones)) return null;
        const model = createPropModel(key, seed);
        if (!model) return null;
        model.position.copy(pos);
        model.castShadow = shadowCast;
        if (!shadowCast) {
          // Propager le verrouillage aux meshes enfants pour éviter que
          // applySceneShadowFlags (toutes les 20 frames) réactive les ombres.
          model.traverse(child => {
            if (!child.isMesh && !child.isSkinnedMesh) return;
            child.castShadow                   = false;
            child.userData.disableCastShadow   = true;
            child.userData.shadowFlagsApplied  = true;
          });
        }
        const local = getTileLocalPoint(pos, placedTile);
        const edge  = getEdgeFromLocalPoint(local) ?? houseEdges[0];
        const type  = getTileEdgeType(placedTile, edge);
        const topY  = placeObjectOnTerrain(model, local, type, hashNumber(seed) % 97,
          { groundOffset: groundOff, alignToSlope: false,
            yaw: hashUnit(`${seed}:yaw`) * Math.PI * 2,
            edgeLockStart: 0.98, edgeLockEnd: 1.0 });
        if (topY === null) return null;
        snapPropBottomToSurface(model, topY - groundOff, snapClearance);
        return model;
      };

      // Chien : 1–2, chance 60 % — slot 3
      const seedDog = `${placedTile.key}:animals:dog`;
      if (hashUnit(seedDog) <= 0.60) {
        const dogCount = hashUnit(`${seedDog}:count`) < 0.45 ? 1 : 2;
        for (let d = 0; d < dogCount; d++) {
          const ds  = `${seedDog}:${d}`;
          // d===0 est placé au centre : sauter si le centre est eau.
          if (d === 0 && getTileCenterType(placedTile) === EDGE_TYPES.water) continue;
          const pos = d === 0
            ? centerPos(ds, HEX_SIZE * 0.10)
            : animalPos(hSlot(3), ds, HEX_SIZE * 0.07);
          const dog = placeAnimal('animal-dog', ds, pos, 0.004, false, 0.008);
          if (!dog) continue;
          dog.name = 'village-animal-dog-glb';
          dog.scale.multiplyScalar(0.88 + hashUnit(`${ds}:scale`) * 0.25);
          group.add(dog);
        }
      }


      // Cheval : chance 35 %, placé à la cellule centrale (plus dégagé)
      // Guard centre-eau : pas de cheval si le centre de la tuile est eau.
      const seedHorse = `${placedTile.key}:animals:horse`;
      if (hashUnit(seedHorse) <= 0.35 && getTileCenterType(placedTile) !== EDGE_TYPES.water) {
        const pos   = centerPos(seedHorse, HEX_SIZE * 0.08);
        const horse = placeAnimal('animal-horse', seedHorse, pos, 0.005, true);
        if (horse) {
          horse.name = 'village-animal-horse-glb';
          horse.scale.multiplyScalar(0.88 + hashUnit(`${seedHorse}:scale`) * 0.24);
          group.add(horse);
        }
      }
    }

    // ── Animaux à la frontière village-nature ─────────────────────────────────
    // Tuile prairie/forêt adjacente à un village : animaux errants à la lisière
    if (houseEdges.length === 0) {
      const hasGrassOrForest = EDGE_ORDER.some(e => {
        const t = getTileEdgeType(placedTile, e);
        return t === EDGE_TYPES.grass || t === EDGE_TYPES.forest;
      });
      if (hasGrassOrForest) {
        const villageEdges = EDGE_ORDER.filter(e => {
          const dir = DIRECTION_BY_EDGE[e];
          if (!dir) return false;
          const nb = placedTiles.get(makeHexKey(placedTile.q + dir.q, placedTile.r + dir.r));
          return nb && EDGE_ORDER.some(ne => getTileEdgeType(nb, ne) === EDGE_TYPES.house);
        });
        if (villageEdges.length >= 1) {
          const borderEdge = villageEdges[Math.floor(hashUnit(`${placedTile.key}:bdr:edge`) * villageEdges.length)];
          const sc = getSectorWorldCenter(placedTile, borderEdge);

          const placeBorderAnimal = (key, seed, pos, groundOff, shadowCast) => {
            const model = createPropModel(key, seed);
            if (!model) return null;
            model.position.copy(pos);
            model.castShadow = shadowCast;
            if (!shadowCast) {
              model.traverse(child => {
                if (!child.isMesh && !child.isSkinnedMesh) return;
                child.castShadow                   = false;
                child.userData.disableCastShadow   = true;
                child.userData.shadowFlagsApplied  = true;
              });
            }
            const local = getTileLocalPoint(pos, placedTile);
            const edgeK = getEdgeFromLocalPoint(local) ?? borderEdge;
            const type  = getTileEdgeType(placedTile, edgeK);
            const topY  = placeObjectOnTerrain(model, local, type, hashNumber(seed) % 97,
              { groundOffset: groundOff, alignToSlope: false,
                yaw: hashUnit(`${seed}:yaw`) * Math.PI * 2,
                edgeLockStart: 0.98, edgeLockEnd: 1.0 });
            if (topY === null) return null;
            snapPropBottomToSurface(model, topY - groundOff, 0.002);
            return model;
          };

        }
      }
    }

    // ── Animaux sur tuiles rail — côté berme, jamais sur les voies ───────────
    // Condition : tuile avec au moins une arête rail, sans arêtes house (déjà géré)
    // Placement : pull FAIBLE (0.12–0.28) vers le centre = animal proche du bord
    // de tuile (la berme), loin du centre où cheminent les rails.
    if (houseEdges.length === 0) {
      const railEdges = EDGE_ORDER.filter(e => getTileEdgeType(placedTile, e) === EDGE_TYPES.rail);
      if (railEdges.length >= 1) {
        // Préférer les arêtes qui font face à un voisin non-rail non-eau
        const bermeEdges = railEdges.filter(e => {
          const dir = DIRECTION_BY_EDGE[e];
          if (!dir) return true;
          const nb = placedTiles.get(makeHexKey(placedTile.q + dir.q, placedTile.r + dir.r));
          if (!nb) return true;
          return EDGE_ORDER.some(ne => {
            const nt = getTileEdgeType(nb, ne);
            return nt !== EDGE_TYPES.rail && nt !== EDGE_TYPES.water;
          });
        });
        const candidate = bermeEdges.length >= 1 ? bermeEdges : railEdges;

        const pickRailEdge = (seed) => candidate[Math.floor(hashUnit(seed) * candidate.length)];
        // pull faible = proche bord de tuile = loin des rails au centre
        const bermePos = (edge, seed, spread) => {
          const sc   = getSectorWorldCenter(placedTile, edge);
          const pull = 0.12 + hashUnit(`${seed}:pull`) * 0.16;
          return new THREE.Vector3(
            sc.x + (tilePos.x - sc.x) * pull + (hashUnit(`${seed}:ox`) - 0.5) * spread,
            ROAD_DECOR_Y,
            sc.z + (tilePos.z - sc.z) * pull + (hashUnit(`${seed}:oz`) - 0.5) * spread
          );
        };
        const placeRailAnimal = (key, seed, pos, groundOff, shadowCast) => {
          const model = createPropModel(key, seed);
          if (!model) return null;
          model.position.copy(pos);
          model.castShadow = shadowCast;
          const local = getTileLocalPoint(pos, placedTile);
          const edgeK = getEdgeFromLocalPoint(local) ?? railEdges[0];
          const type  = getTileEdgeType(placedTile, edgeK);
          const topY  = placeObjectOnTerrain(model, local, type, hashNumber(seed) % 97,
            { groundOffset: groundOff, alignToSlope: false,
              yaw: hashUnit(`${seed}:yaw`) * Math.PI * 2,
              edgeLockStart: 0.98, edgeLockEnd: 1.0 });
          if (topY === null) return null;
          snapPropBottomToSurface(model, topY - groundOff, 0.002);
          return model;
        };

        // Chien côté voie (25 %)
        if (hashUnit(`${placedTile.key}:rail:dog`) <= 0.25) {
          const cs  = `${placedTile.key}:rail:dog:0`;
          const pos = bermePos(pickRailEdge(`${cs}:edge`), cs, HEX_SIZE * 0.05);
          const dog = placeRailAnimal('animal-dog', cs, pos, 0.004, false);
          if (dog) {
            dog.name = 'village-animal-dog-glb';
            dog.scale.multiplyScalar(0.88 + hashUnit(`${cs}:scale`) * 0.25);
            group.add(dog);
          }
        }

      }
    }
  }

  // Fusionne les chiens (statiques)
  _mergeVillageAnimalsByName(group, 'village-animal-dog-glb');

  return group;
}

// ─── Fusion des animaux village ───────────────────────────────────────────────

/**
 * Retourne true si le matériau est un "helper blanc" : aucune texture et couleur
 * très proche du blanc pur. Ces meshes sont des proxies collision/armature exportés
 * depuis Blender avec le matériau par défaut — ils ne doivent pas piloter la couleur.
 */
function _isHelperWhiteMaterial(m) {
  if (!m) return true;
  if (m.map) return false; // a une texture → pas blanc helper
  if (!m.color) return true;
  // Seuil 0.97 : blanc TRÈS pur uniquement (proxy Blender non coloré).
  // Les matériaux crème/ambrés post-teinture (preparePropPrototype) ne sont plus filtrés.
  return m.color.r > 0.97 && m.color.g > 0.97 && m.color.b > 0.97;
}

/**
 * Sélectionne le meilleur matériau parmi ceux d'un mesh fusionné.
 * Priorité : (1) matériau avec texture map, (2) matériau non-blanc, (3) n'importe lequel.
 * Évite de prendre un mesh helper/collision blanc comme unique matériau de la fusion.
 */
function _pickBestMaterial(current, obj) {
  const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
  for (const m of mats) {
    if (!m) continue;
    if (!current) { current = m; continue; }
    if (current.map) continue;                                      // déjà optimal (texture)
    if (m.map) { current = m; continue; }                          // m a texture → meilleur
    if (_isHelperWhiteMaterial(current) && !_isHelperWhiteMaterial(m)) current = m; // éviter blanc
  }
  return current;
}

/**
 * Convertit les InterleavedBufferAttributes d'une géométrie GLB en BufferAttribute
 * standard, seul format accepté par mergeGeometries (Three.js r160).
 * Retourne toujours une copie indépendante (pas de mutation de l'original).
 */
function _deinterleaveGeo(src) {
  const hasInterleaved = Object.values(src.attributes)
    .some(a => a.isInterleavedBufferAttribute);
  if (!hasInterleaved) return src.clone();

  const dst = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(src.attributes)) {
    if (attr.isInterleavedBufferAttribute) {
      // Three.js r160 : pas de getComponent() — accès direct via le tableau entrelacé
      const ib     = attr.data;          // InterleavedBuffer
      const stride = ib.stride;
      const off    = attr.offset;
      const src_a  = ib.array;
      const buf    = new Float32Array(attr.count * attr.itemSize);
      for (let i = 0; i < attr.count; i++) {
        for (let c = 0; c < attr.itemSize; c++) {
          buf[i * attr.itemSize + c] = src_a[i * stride + off + c];
        }
      }
      dst.setAttribute(name, new THREE.BufferAttribute(buf, attr.itemSize, attr.normalized));
    } else {
      dst.setAttribute(name, attr.clone());
    }
  }
  if (src.index) dst.setIndex(src.index.clone());
  return dst;
}

/**
 * Fusionne tous les enfants du groupe dont le name === animalName en un seul Mesh (1 DC).
 * Utilisé pour les animaux statiques (chien, cheval…).
 */
function _mergeVillageAnimalsByName(group, animalName) {
  group.updateMatrixWorld(true);

  const animals = group.children.filter(c => c.name === animalName);
  if (animals.length === 0) return;

  const geoList = [];
  let mat = null;

  for (const animal of animals) {
    animal.traverse(obj => {
      if (!obj.isMesh && !obj.isSkinnedMesh) return;
      // Ignorer les meshes helpers/collision (matériau blanc sans texture)
      const firstMat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
      if (_isHelperWhiteMaterial(firstMat)) return;
      const geo = _deinterleaveGeo(obj.geometry);
      geo.applyMatrix4(obj.matrixWorld);
      geoList.push(geo);
      mat = _pickBestMaterial(mat, obj);
    });
    group.remove(animal);
  }

  if (geoList.length === 0 || !mat) return;

  const merged = mergeGeometries(geoList);
  geoList.forEach(g => g.dispose());
  if (!merged) return;

  merged.computeBoundingSphere();
  const centroid = merged.boundingSphere.center.clone();
  merged.translate(-centroid.x, -centroid.y, -centroid.z);

  const mesh = new THREE.Mesh(merged, mat);
  mesh.position.copy(centroid);
  mesh.name              = animalName;
  mesh.receiveShadow     = true;
  mesh.castShadow        = false;
  mesh.userData.disableCastShadow  = true;
  mesh.userData.shadowFlagsApplied = true;

  group.add(mesh);
  console.debug(`[animals] ${animals.length} ${animalName} fusionnés → 1 DC`);
}

// ─── Bateaux côtiers ─────────────────────────────────────────────────────────

export function createShoreBoats(placedTiles, specialBuildingSafeZones = []) {
  const group = new THREE.Group();
  group.name = 'water-shore-static-boats-glb';

  for (const placedTile of placedTiles.values()) {
    const tilePos = axialToWorld(placedTile.q, placedTile.r);
    for (const edge of EDGE_ORDER) {
      if (!isShoreBoatEligibleBeachEdge(placedTile, edge, placedTiles)) continue;

      const seed = `${placedTile.key}:shore-boat:${edge}`;
      if (hashUnit(seed) > 0.72) continue;

      const sector = SECTOR_BY_KEY[edge];
      const a      = getHexVertex(sector.a);
      const b      = getHexVertex(sector.b);
      const mid    = new THREE.Vector3((a.x + b.x) / 2, SHORE_BOAT_Y, (a.z + b.z) / 2);
      const inward = getShoreBoatBeachDirection(placedTile, edge, placedTiles, mid);

      // 70 % barque-1 (vide, tirée sur la rive), 30 % barque-2 (pêcheur, flottant).
      const boatVariant = hashUnit(`${seed}:boat-type`) < 0.70 ? 'shore-boat-1' : 'shore-boat-2';
      const boat = createPropModel(boatVariant, seed);
      if (!boat) continue;
      boat.name = `water-shore-inert-boat-glb-${boatVariant}`;  // ex: ...-shore-boat-1 (HUD per-type)
      // barque-1 (échouée sur la plage) : facteur minimal pour rester au bord de l'eau.
      // barque-2 (pêcheur) : position actuelle validée, en eau à mi-distance.
      const inwardPush = boatVariant === 'shore-boat-1' ? HEX_SIZE * 0.10 : HEX_SIZE * 0.50;
      boat.position.set(
        tilePos.x + mid.x + inward.x * inwardPush,
        SHORE_BOAT_Y,
        tilePos.z + mid.z + inward.z * inwardPush
      );
      if (isInsideSpecialBuildingSafeZone(boat.position, specialBuildingSafeZones, SPECIAL_BUILDING_BOAT_SAFE_RADIUS)) continue;
      boat.rotation.y = Math.atan2(inward.x, inward.z) + Math.PI / 2 + (hashUnit(`${seed}:yaw`) - 0.5) * 0.50;
      boat.scale.multiplyScalar(0.92 + hashUnit(`${seed}:scale`) * 0.18);
      group.add(boat);
    }
  }

  return group;
}

// ─── Helpers bateaux ─────────────────────────────────────────────────────────

function isShoreBoatEligibleBeachEdge(placedTile, edge, placedTiles) {
  if (getTileEdgeType(placedTile, edge) !== EDGE_TYPES.water) return false;
  const direction    = DIRECTION_BY_EDGE[edge];
  const neighbor     = placedTiles.get(makeHexKey(placedTile.q + direction.q, placedTile.r + direction.r));
  const oppositeType = neighbor ? getTileEdgeType(neighbor, getOppositeEdge(edge)) : null;
  if (neighbor && oppositeType !== EDGE_TYPES.water && oppositeType !== EDGE_TYPES.rail) return true;
  return hasLandEdgeAdjacentToEdge(placedTile, edge);
}

function hasLandEdgeAdjacentToEdge(placedTile, edge) {
  const index    = EDGE_ORDER.indexOf(edge);
  if (index < 0) return false;
  const prevEdge = EDGE_ORDER[(index + EDGE_ORDER.length - 1) % EDGE_ORDER.length];
  const nextEdge = EDGE_ORDER[(index + 1) % EDGE_ORDER.length];
  return isBeachLandEdge(placedTile, prevEdge) || isBeachLandEdge(placedTile, nextEdge);
}

function isBeachLandEdge(placedTile, edge) {
  const type = getTileEdgeType(placedTile, edge);
  return type !== EDGE_TYPES.water && type !== EDGE_TYPES.rail;
}

function getShoreBoatBeachDirection(placedTile, edge, placedTiles, mid) {
  const direction = DIRECTION_BY_EDGE[edge];
  const neighbor  = placedTiles.get(makeHexKey(placedTile.q + direction.q, placedTile.r + direction.r));
  if (neighbor && isBeachLandEdge(neighbor, getOppositeEdge(edge))) {
    const towardNeighbor = new THREE.Vector3(direction.q, 0, direction.r);
    if (towardNeighbor.lengthSq() > 0.001) return towardNeighbor.normalize();
  }
  const adjacentLand = getAdjacentBeachLandVector(placedTile, edge);
  if (adjacentLand.lengthSq() > 0.001) return adjacentLand.normalize();
  const towardTileCenter = new THREE.Vector3(-mid.x, 0, -mid.z);
  if (towardTileCenter.lengthSq() > 0.001) return towardTileCenter.normalize();
  return new THREE.Vector3(0, 0, 1);
}

function getAdjacentBeachLandVector(placedTile, edge) {
  const index  = EDGE_ORDER.indexOf(edge);
  const vector = new THREE.Vector3();
  if (index < 0) return vector;

  const addLandEdgeVector = candidateEdge => {
    if (!isBeachLandEdge(placedTile, candidateEdge)) return;
    const sector = SECTOR_BY_KEY[candidateEdge];
    const a = getHexVertex(sector.a);
    const b = getHexVertex(sector.b);
    vector.x += (a.x + b.x) / 2;
    vector.z += (a.z + b.z) / 2;
  };

  addLandEdgeVector(EDGE_ORDER[(index + EDGE_ORDER.length - 1) % EDGE_ORDER.length]);
  addLandEdgeVector(EDGE_ORDER[(index + 1) % EDGE_ORDER.length]);
  return vector;
}

function pickShoreBoatVariant(seedKey) {
  return 'shore-boat-1'; // barque-1.glb
}

// ─── Helpers placement ────────────────────────────────────────────────────────

function isRoadDecorEdge(placedTile, edge) {
  const type = getTileEdgeType(placedTile, edge);
  return type === EDGE_TYPES.forest || type === EDGE_TYPES.grass;
}

function isShoreDecorEdge(placedTile, edge, placedTiles) {
  const type = getTileEdgeType(placedTile, edge);
  if (!isSafePropGroundType(type)) return false;
  const direction = DIRECTION_BY_EDGE[edge];
  const neighbor  = placedTiles.get(makeHexKey(placedTile.q + direction.q, placedTile.r + direction.r));
  return neighbor && getTileEdgeType(neighbor, getOppositeEdge(edge)) === EDGE_TYPES.water;
}

function isVillageVicinityEdge(placedTile, edge, placedTiles) {
  if (EDGE_ORDER.some(e => getTileEdgeType(placedTile, e) === EDGE_TYPES.house)) return true;
  for (const dir of HEX_DIRECTIONS) {
    const neighbor = placedTiles.get(makeHexKey(placedTile.q + dir.q, placedTile.r + dir.r));
    if (neighbor && EDGE_ORDER.some(e => getTileEdgeType(neighbor, e) === EDGE_TYPES.house)) return true;
  }
  return false;
}

function snapPropToSafeSurface(pos, placedTile, fallbackEdge, seed, options = {}) {
  const tilePos = axialToWorld(placedTile.q, placedTile.r);
  const local   = new THREE.Vector3(pos.x - tilePos.x, 0, pos.z - tilePos.z);
  const edge    = getEdgeFromLocalPoint(local) ?? fallbackEdge;
  const type    = getTileEdgeType(placedTile, edge);
  if (!isSafePropGroundType(type)) return false;

  const radius = Math.hypot(local.x, local.z) / Math.max(HEX_SIZE, 0.001);
  if (radius < 0.30 || radius > 0.86) return false;
  if (!isSingleTerrainFootprint(local, placedTile, type, options.footprintRadius ?? HEX_SIZE * 0.045)) return false;

  pos.y = getTerrainSurfaceY(local, type, hashNumber(seed) % 97, {
    edgeLockStart: 0.98,
    edgeLockEnd:   1.0
  }) + 0.010;
  return true;
}

function nudgeRoadsideProp(pos, placedTile, edge, seed, amount) {
  const sector  = SECTOR_BY_KEY[edge];
  const a       = getHexVertex(sector.a);
  const b       = getHexVertex(sector.b);
  const tangent = normalize2(b.x - a.x, b.z - a.z);
  const sideSign = hashUnit(`${seed}:side`) > 0.5 ? 1 : -1;
  const along    = (hashUnit(`${seed}:along`) - 0.5) * amount * 1.55;
  const side     = sideSign * (amount * 0.45 + hashUnit(`${seed}:offset`) * amount);
  pos.x += tangent.x * along - tangent.z * side;
  pos.z += tangent.z * along + tangent.x * side;
}

function getEdgeOutwardAngle(edge) {
  const sector = SECTOR_BY_KEY[edge];
  const a      = getHexVertex(sector.a);
  const b      = getHexVertex(sector.b);
  return Math.atan2((a.x + b.x) / 2, (a.z + b.z) / 2);
}
