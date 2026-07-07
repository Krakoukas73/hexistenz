/**
 * waterBirdOverlay.js — Mouettes GLB animées au-dessus des grandes surfaces d'eau.
 *
 * Contient :
 *   createWaterBirdFlocks : parcourt les zones d'eau connectées (même définition
 *   de connectivité que les bateaux, cf. waterBoatOverlay.js) et fait apparaître
 *   un petit groupe de mouettes (3 à 6) qui tournoient au-dessus de chaque
 *   surface "de dimensions respectables" (≥ WATER_SEAGULL_MIN_SECTORS secteurs
 *   connectés).
 *
 * mouette.glb ne contient qu'UNE seule mouette animée (contrairement à birds.glb
 * qui bundle déjà 5 corbeaux dans un seul modèle) : on clone donc individuellement
 * chaque oiseau via createSeagullFlock (decorOverlay.js) et on les fait orbiter
 * séparément, avec des paramètres d'orbite légèrement décalés (phase répartie sur
 * le cercle, rayon/vitesse jittés par oiseau) pour simuler un vol groupé cohérent
 * plutôt qu'un empilement synchronisé. L'effectKind 'bird-flock-orbit' (et la
 * boucle d'update associée dans decorOverlay.js) est réutilisé tel quel : la
 * logique d'orbite est générique, pas spécifique aux corbeaux.
 *
 * Import circulaire avec decorOverlay (createSeagullFlock) — valide en ES modules
 * car l'accès se fait uniquement dans un corps de fonction.
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import {
  EDGE_ORDER,
  WATER_SEAGULL_MIN_SECTORS,
  WATER_SEAGULL_MIN_COUNT,
  WATER_SEAGULL_MAX_COUNT,
  WATER_SEAGULL_SPEED_FACTOR
} from './config.js';
import { hashUnit10k as hashUnit, hashNumber } from './hashUtils.js';
import { makeNodeKey } from './tileUtils.js';
import { collectWaterZone, buildWaterGraph, findComponents, isWaterEdge } from './waterBoatOverlay.js';
// Import circulaire résolu via live bindings ES modules — uniquement dans des corps de fonctions.
import { createSeagullFlock } from './decorOverlay.js';

// ─── API publique ─────────────────────────────────────────────────────────────

export function createWaterBirdFlocks(placedTiles) {
  const group = new THREE.Group();
  group.name  = 'water-zone-seagull-flocks';

  const visited = new Set();
  let zoneIndex = 0;

  for (const placedTile of placedTiles.values()) {
    for (const edge of EDGE_ORDER) {
      const nodeKey = makeNodeKey(placedTile.key, edge);
      if (visited.has(nodeKey) || !isWaterEdge(placedTile, edge)) continue;

      const zone  = collectWaterZone(placedTile, edge, placedTiles, visited);
      const graph = buildWaterGraph(zone);

      for (const component of findComponents(graph)) {
        if (component.nodes.length < WATER_SEAGULL_MIN_SECTORS) continue;
        group.add(createSeagullFlockGroup(graph, component, zoneIndex));
        zoneIndex += 1;
      }
    }
  }

  return group;
}

// ─── Groupe de mouettes pour une zone d'eau ───────────────────────────────────

function createSeagullFlockGroup(graph, component, zoneIndex) {
  const group = new THREE.Group();
  group.name  = `water-seagull-zone-flock-${zoneIndex}`;

  // Centroïde + rayon de la surface d'eau (moyenne / écart-max des positions des secteurs).
  const centroid = new THREE.Vector3();
  for (const nodeId of component.nodes) centroid.add(graph.nodes.get(nodeId).position);
  centroid.divideScalar(component.nodes.length);

  let zoneRadius = 0;
  for (const nodeId of component.nodes) {
    zoneRadius = Math.max(zoneRadius, centroid.distanceTo(graph.nodes.get(nodeId).position));
  }
  zoneRadius = Math.max(zoneRadius, 0.20); // plancher — évite un cercle de vol trop resserré sur les petites mares

  const seed = hashNumber(`water-seagull-zone:${zoneIndex}:${component.nodes.length}:${Math.round(centroid.x * 100)}:${Math.round(centroid.z * 100)}`);
  group.position.set(
    centroid.x,
    centroid.y + 0.62 + hashUnit(`${seed}:altitude`) * 0.42,
    centroid.z
  );

  const count     = WATER_SEAGULL_MIN_COUNT + Math.floor(hashUnit(`${seed}:count`) * (WATER_SEAGULL_MAX_COUNT - WATER_SEAGULL_MIN_COUNT + 1));
  const direction = hashUnit(`${seed}:dir`) > 0.5 ? 1 : -1;
  // Formation resserrée — rayon d'orbite réduit vs version initiale (moins dispersées).
  const baseRx    = zoneRadius * (0.34 + hashUnit(`${seed}:rx`) * 0.12);
  const baseRz    = zoneRadius * (0.24 + hashUnit(`${seed}:rz`) * 0.10);
  const baseSpeed = (0.30 + hashUnit(`${seed}:speed`) * 0.55) * WATER_SEAGULL_SPEED_FACTOR;

  // ── Répartition flock serré / solitaires ──────────────────────────────────
  // Les 3 premières mouettes forment toujours un noyau groupé (garantit un vrai
  // "vol groupé" visible) ; au-delà, chaque mouette a une faible chance de partir
  // en solitaire plutôt que de rejoindre le noyau — comportement observé chez les
  // vrais goélands (rares individus qui s'écartent du gros de la troupe), mais
  // la majorité reste groupée et proche (moins dispersée).
  const CORE_GROUPED_MINIMUM = 3;
  const SOLO_CHANCE          = 0.15;

  const soloFlags = [];
  let groupedCount = 0;
  for (let i = 0; i < count; i += 1) {
    const solo = i >= CORE_GROUPED_MINIMUM && hashUnit(`${seed}:solo:${i}`) < SOLO_CHANCE;
    soloFlags.push(solo);
    if (!solo) groupedCount += 1;
  }

  let groupedIndex = 0;
  for (let i = 0; i < count; i += 1) {
    const bird = createSeagullFlock(`${seed}:seagull:${i}`);
    if (!bird) continue;

    const solo = soloFlags[i];

    let cx, cz, rx, rz, phase, birdDirection, birdSpeed, heightRange;
    if (!solo) {
      // Mouette groupée : orbite serrée partagée, phase répartie uniformément
      // sur le cercle (jitter réduit) pour que le groupe reste compact et cohérent.
      cx = 0; cz = 0;
      rx = baseRx * (0.94 + hashUnit(`${seed}:birdrx:${i}`) * 0.12);
      rz = baseRz * (0.94 + hashUnit(`${seed}:birdrz:${i}`) * 0.12);
      phase = (groupedIndex / groupedCount) * Math.PI * 2 + hashUnit(`${seed}:birdphase:${i}`) * 0.25;
      birdDirection = direction;
      birdSpeed = baseSpeed * (0.92 + hashUnit(`${seed}:birdspeed:${i}`) * 0.16);
      heightRange = 0.16;
      groupedIndex += 1;
    } else {
      // Mouette solitaire : boucle propre mais rapprochée du groupe (peu dispersée),
      // parfois dans l'autre sens et à une vitesse/altitude différente — un individu
      // qui s'écarte légèrement plutôt qu'un clone synchronisé du noyau.
      const soloOffsetAngle = hashUnit(`${seed}:soloangle:${i}`) * Math.PI * 2;
      const soloOffsetDist  = zoneRadius * (0.14 + hashUnit(`${seed}:solooffset:${i}`) * 0.16);
      cx = Math.cos(soloOffsetAngle) * soloOffsetDist;
      cz = Math.sin(soloOffsetAngle) * soloOffsetDist;
      rx = zoneRadius * (0.12 + hashUnit(`${seed}:solorx:${i}`) * 0.10);
      rz = zoneRadius * (0.09 + hashUnit(`${seed}:solorz:${i}`) * 0.08);
      phase = hashUnit(`${seed}:solophase:${i}`) * Math.PI * 2;
      birdDirection = hashUnit(`${seed}:solodir:${i}`) > 0.35 ? direction : -direction;
      birdSpeed = baseSpeed * (0.80 + hashUnit(`${seed}:solospeed:${i}`) * 0.40);
      heightRange = 0.24;
    }

    bird.userData = {
      ...bird.userData,
      effectKind:    'bird-flock-orbit',
      cx, cy: hashUnit(`${seed}:height:${i}`) * heightRange - heightRange * 0.5, cz,
      rx, rz,
      speed:         birdSpeed,
      direction:     birdDirection,
      phase,
      verticalSpeed: 0.38  + hashUnit(`${seed}:birdvspeed:${i}`) * 1.10,
      verticalAmp:   0.06  + hashUnit(`${seed}:birdvamp:${i}`)   * 0.20,
      bobAmp:        0.030 + hashUnit(`${seed}:birdbob:${i}`)    * 0.090,
      wobbleSpeedA:  0.32  + hashUnit(`${seed}:birdwoba:${i}`)   * 1.10,
      wobbleSpeedB:  0.30  + hashUnit(`${seed}:birdwobb:${i}`)   * 1.20,
      wobbleSpeedC:  0.28  + hashUnit(`${seed}:birdwobc:${i}`)   * 1.30,
      rxJitter:      0.08  + hashUnit(`${seed}:birdrxj:${i}`)    * 0.14,
      rzJitter:      0.08  + hashUnit(`${seed}:birdrzj:${i}`)    * 0.16,
      sideDrift:     0.012 + hashUnit(`${seed}:birdside:${i}`)   * 0.040,
      bankSpeed:     1.8   + hashUnit(`${seed}:birdbank:${i}`)   * 2.4,
      bankAmp:       0.16  + hashUnit(`${seed}:birdbankamp:${i}`) * 0.26
    };
    group.add(bird);
  }

  return group;
}
