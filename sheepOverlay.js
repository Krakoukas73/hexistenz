/**
 * sheepOverlay.js — Moutons animés (SkinnedMesh) sur les zones prairies.
 *
 * Règle de peuplement : 1 mouton par TILES_PER_SHEEP tuiles prairie connexes.
 * Types (tous dans sheep-2.glb, 1 clip "Animation" à 54 canaux) :
 *   - marcheur  (Armature_14     / Object_7)  : 1 par zone, se déplace, AnimationMixer
 *   - brouteur  (Armature.001_29 / Object_25) : fixe, AnimationMixer (tête/cou uniquement)
 *   - immobile  (Armature.002_44 / Object_43) : aucune animation
 *
 * Le clip unique cible les bones par nom → joué sur un sous-arbre cloné,
 * il n'anime que les bones de ce sous-arbre (les autres channels sont ignorés).
 *
 * Intégration dans scene.js :
 *   import { createSheepOverlay, rebuildSheepOverlay, updateSheepOverlay } from './sheepOverlay.js';
 *   const sheepOverlay = createSheepOverlay();
 *   scene.add(sheepOverlay);
 *   // dans animate() :
 *   updateSheepOverlay(sheepOverlay, timeSeconds);
 *   // quand une tuile prairie change :
 *   overlayRebuildQueue.set('sheep', { rebuild: () => rebuildSheepOverlay(sheepOverlay, placedTiles) });
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { clone as cloneSkeleton } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/utils/SkeletonUtils.js';
import { EDGE_ORDER, EDGE_TYPES, HEX_SIZE, TILE_VISUAL, LOD_ANIMAL_CULL_DISTANCE } from './config.js';
import { makeNodeKey, getTileEdgeType } from './tileUtils.js';
import { collectZone, getFullTextureNeighbors } from './zoneUtils.js';
import { createGLTFLoader } from './glbLoader.js';
import { hashUnit10k as hashUnit } from './hashUtils.js';
import { getSectorWorldCenter } from './propPlacement.js';
import { registerPropHitbox, tryResolve } from './propHitboxRegistry.js';

// ─── Paramètres (calibrables) ──────────────────────────────────────────────────
const SHEEP_GLB_PATH    = './glb/animaux/sheep-2.glb';
const TILES_PER_SHEEP    = 0.292; // 1 mouton par N tuiles prairie connexes (+15 % depuis 0.336)
const SHEEP_TARGET_LEN   = 0.054; // longueur cible en unités monde (−12 % depuis 0.061)
const SHEEP_WALK_SPEED   = 0.0568; // unités monde/seconde (marcheur) — −17 % depuis 0.0684
const SHEEP_HITBOX_R     = 0.034; // rayon hitbox mouton (≈ demi-longueur + marge)
const STATIC_CLUSTER_R   = HEX_SIZE * 0.28; // rayon du troupeau de statiques par zone
const SHEEP_ARRIVE_DIST = 0.07;  // seuil d'arrivée à destination (marcheur)
// Surface prairie (tileThickness * 0.683 ≈ 0.082 pour tileThickness=0.12)
const SHEEP_SURFACE_Y   = (TILE_VISUAL.tileThickness ?? 0.12) * 0.683;

// ─── Singleton GLB ─────────────────────────────────────────────────────────────
let _glbReady   = false;
let _glbLoading = false;
let _pendingCbs = [];
let _protos     = null; // { walker, grazer, static, walkerClip, grazerClip, scale }

// ─── Helper debug : profondeur dans l'arbre ────────────────────────────────────
function _depth(obj) {
  let d = 0, cur = obj.parent;
  while (cur) { d++; cur = cur.parent; }
  return d;
}

/** Trouve le nœud ayant exactement 3 enfants (= GLTF_SceneRootNode avec les 3 armatures). */
function _findSceneRoot(root) {
  let found = null;
  root.traverse(o => { if (!found && o.children.length === 3) found = o; });
  return found;
}

// ─── Chargement GLB ────────────────────────────────────────────────────────────
function _loadSheepGlb(onReady) {
  if (_glbReady)  { onReady(_protos); return; }
  _pendingCbs.push(onReady);
  if (_glbLoading) return;
  _glbLoading = true;

  createGLTFLoader().load(SHEEP_GLB_PATH, (gltf) => {
    const clip = gltf.animations[0]; // "Animation" — 54 channels, 3 moutons

    // Debug hiérarchie
    console.log('[sheepOverlay] GLB chargé — hiérarchie :');
    gltf.scene.traverse(o => console.log('  '.repeat(_depth(o)) + `"${o.name}" [${o.type}]`));
    console.log('[sheepOverlay] Tracks animation :', clip.tracks.map(t => t.name));

    // Récupère les 3 armatures via leur position dans la hiérarchie
    // gltf.scene > Sketchfab_model > root > GLTF_SceneRootNode > [walker, grazer, static]
    const sceneRoot = _findSceneRoot(gltf.scene);
    const [walker, grazer, stat] = sceneRoot?.children ?? [];

    console.log('[sheepOverlay] Protos trouvés :', walker?.name, '|', grazer?.name, '|', stat?.name);

    if (!walker || !grazer || !stat) {
      console.error('[sheepOverlay] Armatures manquantes — vérifie la hiérarchie ci-dessus.');
      _glbLoading = false;
      return;
    }

    // ── Clip brouteur : filtre la translation de Baze_19 ──────────────────────
    // Baze_19 est le bone racine du corps du brouteur. Ses frères sont les pattes
    // (FL1_21, BL1_23, etc.) — si Baze_19 se translate, le corps se dissocie des pattes.
    // On garde rotation et scale, on supprime uniquement le canal position.
    const grazerTracks = clip.tracks.filter(t => t.name !== 'Baze_19.position');
    const grazerClip   = new THREE.AnimationClip('grazer-anim', clip.duration, grazerTracks);
    console.log('[sheepOverlay] Tracks brouteur conservées :', grazerTracks.map(t => t.name));

    // Mesure de la longueur réelle pour calibrer l'échelle
    const box    = new THREE.Box3().setFromObject(walker);
    const rawLen = Math.max(box.max.z - box.min.z, box.max.x - box.min.x, 0.01);
    const scale  = SHEEP_TARGET_LEN / rawLen;
    console.log('[sheepOverlay] Scale calculée :', scale.toFixed(4), '(rawLen =', rawLen.toFixed(3) + ')');

    _protos     = { walker, grazer, static: stat, walkerClip: clip, grazerClip, scale };
    _glbReady   = true;
    _glbLoading = false;
    for (const cb of _pendingCbs) cb(_protos);
    _pendingCbs = [];
  }, undefined, (err) => {
    console.error('[sheepOverlay] Échec chargement GLB :', err);
    _glbLoading = false;
  });
}

// ─── Collecte des zones prairie ────────────────────────────────────────────────
// Utilise getFullTextureNeighbors (même que waterZoneOverlay) qui connecte aussi
// les secteurs adjacents (prev/next) sur la même tuile sans exiger center=grass.
// Ceci évite de fragmenter les zones sur les tuiles à centre non-prairie.
function _collectGrassZones(placedTiles) {
  const visited = new Set();
  const zones   = [];

  for (const placedTile of placedTiles.values()) {
    for (const edge of EDGE_ORDER) {
      const nodeKey = makeNodeKey(placedTile.key, edge);
      if (visited.has(nodeKey) || getTileEdgeType(placedTile, edge) !== EDGE_TYPES.grass) continue;

      const result      = collectZone(placedTile, edge, EDGE_TYPES.grass, placedTiles, visited, getFullTextureNeighbors);
      const uniqueTiles = new Set(result.sectors.map(s => s.tile.key)).size;
      const center      = _sectorSetCenter(result.sectors);
      zones.push({ ...result, uniqueTiles, center });
    }
  }
  return zones;
}

/**
 * Retourne un point aléatoire (déterministe via seed) à l'intérieur d'un secteur.
 * Le centre du secteur est le 1/3 de l'arête — on ajoute un offset radial aléatoire.
 */
function _randomPointInSector(sectorRef, seed) {
  const c     = getSectorWorldCenter(sectorRef.tile, sectorRef.edge);
  const angle = hashUnit(seed + 'a') * Math.PI * 2;
  const r     = hashUnit(seed + 'r') * HEX_SIZE * 0.48; // jusqu'au bord du secteur
  return { x: c.x + Math.cos(angle) * r, z: c.z + Math.sin(angle) * r };
}

/**
 * Retourne un point cible aléatoire (non déterministe) dans un secteur voisin de pos.
 * Limite la portée à HEX_SIZE * 1.6 pour éviter que le marcheur traverse d'autres biomes.
 */
function _pickWalkerTarget(pos, sectors) {
  const near = sectors.filter(s => {
    const c = getSectorWorldCenter(s.tile, s.edge);
    return Math.hypot(c.x - pos.x, c.z - pos.z) < HEX_SIZE * 1.6;
  });
  const pool = near.length > 0 ? near : sectors;
  const s    = pool[Math.floor(Math.random() * pool.length)];
  const c    = getSectorWorldCenter(s.tile, s.edge);
  // Offset aléatoire dans le secteur pour éviter les allers-retours mécaniques
  const angle = Math.random() * Math.PI * 2;
  const r     = Math.random() * HEX_SIZE * 0.4;
  return new THREE.Vector3(c.x + Math.cos(angle) * r, SHEEP_SURFACE_Y, c.z + Math.sin(angle) * r);
}

function _sectorSetCenter(sectors) {
  let x = 0, z = 0;
  for (const s of sectors) { const c = getSectorWorldCenter(s.tile, s.edge); x += c.x; z += c.z; }
  return { x: x / sectors.length, z: z / sectors.length };
}

function _zoneKey(center) {
  return `${Math.round(center.x * 10)}_${Math.round(center.z * 10)}`;
}

// ─── Clonage d'un mouton ───────────────────────────────────────────────────────
function _cloneSheep(proto, scale, clip) {
  const obj = cloneSkeleton(proto);
  obj.scale.setScalar(scale);

  obj.traverse(o => {
    if (o.isSkinnedMesh && o.skeleton) o.skeleton.pose();
    if (o.isSkinnedMesh || o.isMesh) {
      o.castShadow    = true;
      o.receiveShadow = true;
    }
  });

  let mixer = null;
  if (clip) {
    mixer = new THREE.AnimationMixer(obj);
    mixer.clipAction(clip).play();
  }

  return { object: obj, mixer };
}

// ─── Peuplement d'une zone ─────────────────────────────────────────────────────
// Distribution par tirage déterministe pour chaque mouton :
//   r < 0.30 → marcheur  (30 %)
//   r < 0.80 → brouteur  (50 %)
//   r ≥ 0.80 → immobile  (20 %)
function _populateZone(group, zone, protos, prevWalkersByZone, nextWalkersByZone) {
  const { sectors, uniqueTiles, center } = zone;
  const sheepCount = Math.max(1, Math.floor(uniqueTiles / TILES_PER_SHEEP));

  const zKey = _zoneKey(center);
  const { walker: protoWalker, grazer: protoGrazer, static: protoStatic,
          walkerClip, grazerClip, scale } = protos;

  // Centre du cluster pour les immobiles (grégaires)
  const ci       = Math.floor(hashUnit(zKey + 'sc') * sectors.length);
  const clusterC = getSectorWorldCenter(sectors[ci].tile, sectors[ci].edge);

  const prevStates = prevWalkersByZone.get(zKey) ?? []; // états marcheurs sauvegardés
  const nextStates = [];
  let walkerIdx    = 0; // pour réutiliser les positions des marcheurs précédents
  let staticIdx    = 0; // pour les seeds cluster

  for (let i = 0; i < sheepCount; i++) {
    const r = hashUnit(zKey + `type${i}`);

    if (r < 0.30) {
      // ── Marcheur ────────────────────────────────────────────────────────────
      const { object: walkerObj, mixer: walkerMixer } = _cloneSheep(protoWalker, scale, walkerClip);
      const prevState = prevStates[walkerIdx];
      const startPos  = prevState?.pos
        ? prevState.pos.clone()
        : new THREE.Vector3(center.x, SHEEP_SURFACE_Y, center.z);
      walkerObj.position.copy(startPos);
      group.add(walkerObj);
      nextStates.push({
        object:    walkerObj,
        mixer:     walkerMixer,
        pos:       startPos,
        targetPos: _pickWalkerTarget(startPos, sectors),
        sectors,
        lastTime:  null,
      });
      walkerIdx++;

    } else if (r < 0.80) {
      // ── Brouteur ─────────────────────────────────────────────────────────────
      const si  = Math.floor(hashUnit(zKey + `gi${i}`) * sectors.length);
      const pt  = _randomPointInSector(sectors[si], zKey + `gp${i}`);
      const { object, mixer } = _cloneSheep(protoGrazer, scale, grazerClip);
      object.position.set(pt.x, SHEEP_SURFACE_Y, pt.z);
      object.rotation.y             = hashUnit(zKey + `gr${i}`) * Math.PI * 2;
      object.userData.mixer          = mixer;
      object.userData.mixerLastTime  = null;
      group.add(object);

    } else {
      // ── Immobile : instinct grégaire — cluster autour du centre commun ──────
      const clusterR = STATIC_CLUSTER_R * (1 + staticIdx * 0.06);
      const angle    = hashUnit(zKey + `sa${staticIdx}`) * Math.PI * 2;
      const rr       = Math.sqrt(hashUnit(zKey + `sr${staticIdx}`)) * clusterR;
      let cx = clusterC.x + Math.cos(angle) * rr;
      let cz = clusterC.z + Math.sin(angle) * rr;
      const resolved = tryResolve(cx, cz, SHEEP_HITBOX_R);
      if (resolved) { cx = resolved.x; cz = resolved.z; }
      registerPropHitbox(cx, cz, SHEEP_HITBOX_R);
      const { object } = _cloneSheep(protoStatic, scale, null);
      object.position.set(cx, SHEEP_SURFACE_Y, cz);
      object.rotation.y = hashUnit(zKey + `st${staticIdx}`) * Math.PI * 2;
      group.add(object);
      staticIdx++;
    }
  }

  nextWalkersByZone.set(zKey, nextStates);
}

// ─── Nettoyage du groupe ───────────────────────────────────────────────────────
function _clearGroup(group) {
  for (const child of [...group.children]) {
    child.traverse(o => {
      if (o.isSkinnedMesh) o.skeleton?.dispose?.();
      // Geometry et materials partagés avec les protos → pas de dispose
    });
    group.remove(child);
  }
}

// ─── API publique ──────────────────────────────────────────────────────────────

export function createSheepOverlay() {
  const group            = new THREE.Group();
  group.name             = 'sheep-overlay';
  group.userData.walkers = new Map();
  return group;
}

export function rebuildSheepOverlay(group, placedTiles) {
  if (!_glbReady) {
    _loadSheepGlb(() => rebuildSheepOverlay(group, placedTiles));
    return;
  }

  // walkers : Map<zKey, walkerState[]> — plusieurs marcheurs possibles par zone
  const prevWalkersByZone = group.userData.walkers ?? new Map();
  const nextWalkersByZone = new Map();

  _clearGroup(group);

  for (const zone of _collectGrassZones(placedTiles)) {
    _populateZone(group, zone, _protos, prevWalkersByZone, nextWalkersByZone);
  }

  group.userData.walkers = nextWalkersByZone;
}

/**
 * LOD : frustum + distance caméra (même principe que forestOverlay).
 * À appeler depuis le bloc % 9 de animate() dans scene.js.
 */
export function updateSheepLOD(group, camera, lodFactor = 1.0) {
  const frustum = new THREE.Frustum();
  frustum.setFromProjectionMatrix(
    new THREE.Matrix4().multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    )
  );
  const lodDistSq = LOD_ANIMAL_CULL_DISTANCE * LOD_ANIMAL_CULL_DISTANCE * lodFactor * lodFactor;
  for (const child of group.children) {
    const distSq = camera.position.distanceToSquared(child.position);
    child.visible = distSq < lodDistSq && frustum.containsPoint(child.position);
  }
}

export function updateSheepOverlay(group, timeSeconds) {
  if (!_glbReady) return;

  const walkers = group.userData.walkers;

  // ── Marcheurs : mouvement + mixer (skip si caché par LOD) ─────────────────
  // walkers : Map<zKey, walkerState[]>
  if (walkers) {
    for (const [, states] of walkers) {
      for (const state of states) {
        const prev  = state.lastTime ?? timeSeconds;
        const delta = Math.min(timeSeconds - prev, 0.1);
        state.lastTime = timeSeconds; // toujours mis à jour pour éviter un saut au retour

        if (!state.object.visible) continue;

        if (state.mixer) state.mixer.update(delta);

        const dir  = new THREE.Vector3().subVectors(state.targetPos, state.pos);
        const dist = dir.length();

        if (dist < SHEEP_ARRIVE_DIST) {
          const next = _pickWalkerTarget(state.pos, state.sectors);
          state.targetPos.copy(next);
        } else {
          const step = Math.min(SHEEP_WALK_SPEED * delta, dist);
          dir.normalize();
          state.pos.addScaledVector(dir, step);
          state.object.position.copy(state.pos);
          state.object.rotation.y = Math.atan2(dir.x, dir.z);
        }
      }
    }
  }

  // ── Brouteurs : mixer stocké sur userData (skip si caché par LOD) ─────────
  group.traverse(o => {
    if (!o.userData.mixer) return;
    const prev  = o.userData.mixerLastTime ?? timeSeconds;
    const delta = Math.min(timeSeconds - prev, 0.1);
    o.userData.mixerLastTime = timeSeconds; // toujours mis à jour
    if (!o.visible) return;
    o.userData.mixer.update(delta);
  });
}
