// ─── decorBirdModels.js — modèles GLB oiseaux (corbeaux) et mouettes ─────────
// Extrait de decorOverlay.js le 2026-07-11 (round 3, découpage sans risque, cf.
// CONTEXT.md §21) : chargement/normalisation/instanciation des deux flocks
// (birds.glb pour les champs, mouette.glb pour les surfaces d'eau).
// Import circulaire vers decorOverlay.js (maybeRebuildWhenReady) — valide selon
// la convention déjà documentée dans ce fichier (accès uniquement en corps de
// fonction). createSeagullFlock est réexportée par decorOverlay.js pour ne rien
// casser chez waterBirdOverlay.js ; createBirdFlock idem pour fieldZonesOverlay.js.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { createGLTFLoader } from './glbLoader.js';
import { clone as cloneSkeleton } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/utils/SkeletonUtils.js';
import {
  FIELD_BIRD_FLOCK_MODEL_URL,
  FIELD_BIRD_FLOCK_TARGET_WIDTH,
  FIELD_BIRD_FLOCK_ANIMATION_SPEED,
  WATER_SEAGULL_MODEL_URL,
  WATER_SEAGULL_TARGET_WIDTH,
  WATER_SEAGULL_ANIMATION_SPEED
} from './config.js';
import { hashUnit10k as hashUnit } from './hashUtils.js';
import { clonePropMaterial } from './decorPropModels.js';
import { maybeRebuildWhenReady } from './decorOverlay.js';

// ─── Modèle oiseaux ───────────────────────────────────────────────────────────

const birdGlbLibrary = {
  prototype:  null,
  animations: [],
  loading:    false,
  requested:  false
};

// Exportée : lue par decorOverlay.js::maybeRebuildWhenReady (garde-fou "tout est chargé ?").
export function isBirdModelLoading() {
  return birdGlbLibrary.loading;
}

export function ensureBirdModel(overlay) {
  if (birdGlbLibrary.loading || birdGlbLibrary.requested) return;
  birdGlbLibrary.loading   = true;
  birdGlbLibrary.requested = true;

  createGLTFLoader().load(
    FIELD_BIRD_FLOCK_MODEL_URL,
    gltf => {
      birdGlbLibrary.prototype   = prepareBirdPrototype(gltf.scene);
      birdGlbLibrary.animations  = gltf.animations ?? [];
      birdGlbLibrary.loading     = false;
      maybeRebuildWhenReady(overlay);
    },
    undefined,
    error => {
      birdGlbLibrary.loading = false;
      console.warn(`Modèle oiseaux GLB indisponible : ${FIELD_BIRD_FLOCK_MODEL_URL}`, error);
      maybeRebuildWhenReady(overlay);
    }
  );
}

function prepareBirdPrototype(model) {
  const wrapper = new THREE.Group();
  wrapper.name  = 'normalized-field-bird-flock-glb';

  const source = cloneSkeleton(model);
  const box    = new THREE.Box3().setFromObject(source);
  const size   = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  source.position.set(-center.x, -center.y, -center.z);
  const dimension = Math.max(size.x, size.z) || 1;
  wrapper.scale.setScalar(FIELD_BIRD_FLOCK_TARGET_WIDTH / dimension);
  wrapper.add(source);

  wrapper.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow    = false;
    object.receiveShadow = false;
    // Verrouiller : applySceneShadowFlags ne doit pas réactiver les ombres sur les oiseaux
    object.userData.disableCastShadow  = true;
    object.userData.shadowFlagsApplied = true;
    if (object.material) {
      object.material = clonePropMaterial(object.material);
      // Ce matériau est PARTAGÉ par tous les clones (cloneSkeleton ne clone pas les
      // matériaux) : sans ce flag, un clearGroup(overlay) — rebuildDecorOverlay complet —
      // dispose() ce matériau via un enfant quelconque et casse la texture (map perdu)
      // pour TOUS les corbeaux existants et futurs, révélant le colorFactor brut du GLB
      // (rendu plat, souvent teinté) à la place du noir/blanc texturé. Même protection
      // que _reusePrototypeMaterials / clearGroup (tileUtils.js) pour les props classiques.
      const mats = Array.isArray(object.material) ? object.material : [object.material];
      mats.forEach(m => { if (m) m.userData.glbPrototype = true; });
    }
  });

  return wrapper;
}

export function createBirdFlock(seedKey) {
  if (!birdGlbLibrary.prototype) return null;

  const object  = cloneSkeleton(birdGlbLibrary.prototype);
  object.name   = 'field-birds-glb-animated-flock';
  object.rotation.y += (hashUnit(`${seedKey}:base-yaw`) - 0.5) * 0.35;
  object.scale.multiplyScalar(0.92 + hashUnit(`${seedKey}:scale`) * 0.22);

  const mixer = birdGlbLibrary.animations.length > 0 ? new THREE.AnimationMixer(object) : null;
  if (mixer) {
    for (const clip of birdGlbLibrary.animations) {
      mixer.clipAction(clip).play();
    }
  }

  object.userData = {
    mixer,
    animationSpeed:    FIELD_BIRD_FLOCK_ANIMATION_SPEED * (0.88 + hashUnit(`${seedKey}:anim`) * 0.24),
    lastAnimationTime: null
  };

  return object;
}

// ─── Modèle mouette (surfaces d'eau) ──────────────────────────────────────────
// mouette.glb ne contient qu'UNE seule mouette animée (contrairement à birds.glb
// qui bundle déjà 5 corbeaux) : createSeagullFlock clone donc un individu à la
// fois ; waterBirdOverlay.js assemble 3 à 6 clones par zone d'eau pour simuler
// un vol groupé.

const seagullGlbLibrary = {
  prototype:  null,
  animations: [],
  loading:    false,
  requested:  false
};

// Exportée : lue par decorOverlay.js::maybeRebuildWhenReady (garde-fou "tout est chargé ?").
export function isSeagullModelLoading() {
  return seagullGlbLibrary.loading;
}

export function ensureSeagullModel(overlay) {
  if (seagullGlbLibrary.loading || seagullGlbLibrary.requested) return;
  seagullGlbLibrary.loading   = true;
  seagullGlbLibrary.requested = true;

  createGLTFLoader().load(
    WATER_SEAGULL_MODEL_URL,
    gltf => {
      seagullGlbLibrary.prototype  = prepareSeagullPrototype(gltf.scene);
      seagullGlbLibrary.animations = gltf.animations ?? [];
      seagullGlbLibrary.loading    = false;
      maybeRebuildWhenReady(overlay);
    },
    undefined,
    error => {
      seagullGlbLibrary.loading = false;
      console.warn(`Modèle mouette GLB indisponible : ${WATER_SEAGULL_MODEL_URL}`, error);
      maybeRebuildWhenReady(overlay);
    }
  );
}

function prepareSeagullPrototype(model) {
  const wrapper = new THREE.Group();
  wrapper.name  = 'normalized-water-seagull-glb';

  const source = cloneSkeleton(model);
  const box    = new THREE.Box3().setFromObject(source);
  const size   = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  source.position.set(-center.x, -center.y, -center.z);

  // mouette.glb est orientée à l'inverse de birds.glb (bec vers +Z au lieu de -Z) :
  // sans correctif, les mouettes volaient "en marche arrière" (queue devant), la
  // formule d'orientation d'orbite (effectKind 'bird-flock-orbit', partagée avec
  // les corbeaux) supposant un bec vers -Z. On isole le flip 180° dans un
  // sous-groupe appliqué APRÈS le recentrage bbox (sinon le recentrage devient faux :
  // une rotation directe sur "source" décalerait le centre au lieu de le préserver).
  const flipGroup = new THREE.Group();
  flipGroup.name = 'water-seagull-180-flip';
  flipGroup.rotation.y = Math.PI;
  flipGroup.add(source);

  const dimension = Math.max(size.x, size.z) || 1;
  wrapper.scale.setScalar(WATER_SEAGULL_TARGET_WIDTH / dimension);
  wrapper.add(flipGroup);

  wrapper.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow    = false;
    object.receiveShadow = false;
    object.userData.disableCastShadow  = true;
    object.userData.shadowFlagsApplied = true;
    if (object.material) {
      object.material = clonePropMaterial(object.material);
      // Ce matériau est PARTAGÉ par tous les clones (cloneSkeleton ne clone pas les
      // matériaux) : sans ce flag, un clearGroup(overlay) — rebuildDecorOverlay complet,
      // déclenché par ex. après un undo ou une sync multijoueur une fois des mouettes déjà
      // en scène — dispose() ce matériau via un enfant quelconque et casse la texture (map
      // perdu) pour TOUTES les mouettes existantes et futures : le noir/blanc texturé laisse
      // place au colorFactor brut du GLB (souvent bleu clair ici) rendu à plat. Même
      // protection que _reusePrototypeMaterials / clearGroup (tileUtils.js) pour les props
      // classiques — c'est très probablement la cause de la pointe d'aile devenue bleue.
      const mats = Array.isArray(object.material) ? object.material : [object.material];
      mats.forEach(m => { if (m) m.userData.glbPrototype = true; });
    }
  });

  return wrapper;
}

export function createSeagullFlock(seedKey) {
  if (!seagullGlbLibrary.prototype) return null;

  const object  = cloneSkeleton(seagullGlbLibrary.prototype);
  object.name   = 'water-seagull-glb-instance';
  object.rotation.y += (hashUnit(`${seedKey}:base-yaw`) - 0.5) * 0.35;
  object.scale.multiplyScalar(0.92 + hashUnit(`${seedKey}:scale`) * 0.22);

  const mixer = seagullGlbLibrary.animations.length > 0 ? new THREE.AnimationMixer(object) : null;
  if (mixer) {
    for (const clip of seagullGlbLibrary.animations) {
      mixer.clipAction(clip).play();
    }
  }

  object.userData = {
    mixer,
    animationSpeed:    WATER_SEAGULL_ANIMATION_SPEED * (0.88 + hashUnit(`${seedKey}:anim`) * 0.24),
    lastAnimationTime: null
  };

  return object;
}
