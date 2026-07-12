// ─── decorPropModels.js — chargement/normalisation des GLB props + instances ──
// Extrait de decorOverlay.js le 2026-07-11 (round 3, découpage sans risque, cf.
// CONTEXT.md §21) : chargement asynchrone du pool de props (PROP_MODEL_DEFS,
// resté dans decorOverlay.js — trop entremêlé avec les constantes de taille déjà
// exportées vers 5 fichiers externes), normalisation des prototypes GLB, et
// création des instances (createPropModel).
// Import circulaire vers decorOverlay.js (PROP_MODEL_DEFS, maybeRebuildWhenReady) —
// valide selon la convention déjà documentée dans ce fichier : tous les accès
// croisés se font dans des corps de fonctions (live bindings ES modules), jamais
// à l'évaluation du module. decorOverlay.js réexporte propGlbLibrary/createPropModel
// pour ne rien casser chez les 5 importateurs externes (characterOverlay.js,
// fieldZonesOverlay.js, houseOverlay.js, naturalPropsOverlay.js, villageDecorOverlay.js).
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { createGLTFLoader } from './glbLoader.js';
import { clone as cloneSkeleton } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/utils/SkeletonUtils.js';
import { hashUnit10k as hashUnit } from './hashUtils.js';
import { PROP_MODEL_DEFS, maybeRebuildWhenReady } from './decorOverlay.js';

// Map variantKey → prototype Group (normalisé + mis à l'échelle)
export const propGlbLibrary = new Map();
// Map variantKey → AnimationClip[] (null si GLB sans animation)
const propAnimationsLibrary = new Map();
let propModelsLoading   = false;
let propModelsRequested = false;

// Exportée : lue par decorOverlay.js::maybeRebuildWhenReady (garde-fou "tout est chargé ?").
export function isPropModelsLoading() {
  return propModelsLoading;
}

// ─── Extraction d'un asset depuis un package GLB ─────────────────────────────
// Utilisé quand def.asset est défini (package multi-objets) au lieu de def.url seul.
// Retourne un Group autonome avec les transforms parents baked, prêt pour preparePropPrototype.
// Pour un GLB simple (def.asset absent), on passe directement gltf.scene comme avant.
function extractFromPackage(scene, assetName) {
  scene.updateMatrixWorld(true);
  const found = scene.getObjectByName(assetName);
  if (!found) {
    console.warn(`[Package GLB] asset "${assetName}" introuvable — fallback scène entière`);
    return scene;
  }
  // Cloner l'objet trouvé (sous-arbre complet, skeletons inclus)
  const extracted = cloneSkeleton(found);
  // Si l'objet n'est pas enfant direct de la scène (hiérarchie intermédiaire),
  // bake la matrice monde du parent pour ne pas perdre ses transforms.
  if (found.parent && found.parent !== scene) {
    extracted.applyMatrix4(found.parent.matrixWorld);
  }
  return extracted;
}

export function ensurePropModels(overlay) {
  if (propModelsLoading || propModelsRequested) return;
  propModelsLoading   = true;
  propModelsRequested = true;

  // Grouper les defs par URL : un package GLB (N assets) ne se charge qu'une seule fois.
  // Les GLBs simples (1 def = 1 url) fonctionnent exactement comme avant.
  const urlGroups = new Map(); // url → [def, ...]
  for (const def of PROP_MODEL_DEFS) {
    if (!urlGroups.has(def.url)) urlGroups.set(def.url, []);
    urlGroups.get(def.url).push(def);
  }

  let pending = urlGroups.size;
  const finishOne = () => {
    pending -= 1;
    if (pending > 0) return;
    propModelsLoading = false;
    maybeRebuildWhenReady(overlay);
  };

  for (const [url, defs] of urlGroups) {
    createGLTFLoader().load(
      url,
      gltf => {
        for (const def of defs) {
          // GLB simple : pas de champ asset → gltf.scene entier (comportement identique à avant)
          // Package GLB : champ asset → extraire l'objet nommé avec transforms baked
          const source = def.asset ? extractFromPackage(gltf.scene, def.asset) : gltf.scene;
        propGlbLibrary.set(def.key, preparePropPrototype(source, def));
          propAnimationsLibrary.set(def.key, gltf.animations ?? []);
        }
        finishOne();
      },
      undefined,
      error => { console.warn(`GLB indisponible : ${url}`, error); finishOne(); }
    );
  }
}

function preparePropPrototype(model, def) {
  const wrapper = new THREE.Group();
  wrapper.name  = `normalized-${def.key}`;

  // cloneSkeleton (SkeletonUtils) au lieu de model.clone(true) :
  // model.clone(true) casse les références skeleton sur les SkinnedMesh animés,
  // ce qui laisse les parties mobiles en pose dégénérée ou invisibles.
  const source = cloneSkeleton(model);

  // Normalisation complète pour GLBs animés.
  // Causes possibles d'invisibilité en pose statique :
  //   1. visible=false (état initial avant AnimationMixer)
  //   2. scale=(0,0,0) (rig démarre à zéro, animé vers 1,1,1)
  //   3. SkinnedMesh hors bind pose → géométrie dégénérée
  //   4. material.visible=false exporté depuis certains DCC
  source.traverse(o => {
    o.visible = true;
    if (o.scale.x === 0 && o.scale.y === 0 && o.scale.z === 0) o.scale.set(1, 1, 1);
    if (o.isSkinnedMesh && o.skeleton && !def.noSkeletonPose) o.skeleton.pose();
    if (o.isMesh && o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m) continue;
        m.visible = true;
        if (m.color) {
          // Compensation surexposition : toneMappingExposure=2.0 + sunIntensity=2.1 + hémisphère=0.62
          // → radiance linéaire ~×2.6 avant ACES.
          //
          // Cas 1 — bypassBboxCheck + sans texture (fontaine-1) :
          //   Couleurs brutes correctes mais sans AO baked → surexposition uniforme.
          //   ×0.45 compense l'absence d'AO tout en restant fidèle à la teinte GLB.
          //
          // Cas 2 — base quasi-blanche (r,g,b > 0.85) + texturée (animaux Blender default=1,1,1) :
          //   ×0.28 : assez sombre pour éviter le blanc ACES, assez clair pour rester lisible.
          //
          // Cas 3 — matériau normal (couleur correcte) : aucune altération, fidèle au GLB.
          if (!m.map && def.bypassBboxCheck) {
            m.color.multiplyScalar(0.45);
          } else if (m.color.r > 0.85 && m.color.g > 0.85 && m.color.b > 0.85) {
            if (m.map) {
              m.color.multiplyScalar(0.28);
            } else {
              m.color.setHex(0x322415);
            }
          }
          // Cas normal : couleur GLB conservée telle quelle
        }
      }
    }
  });
  // Correction d'orientation pour les GLBs exportés avec un axe différent.
  // resetRotation : remet la rotation du clone à (0,0,0) avant d'appliquer les corrections.
  //   → indispensable quand le GLB a une rotation GLTF initiale qui fausse les += .
  // correctionX/Z : delta ajouté APRÈS reset (ou à la rotation existante si pas de reset).
  // absoluteX/Z  : valeur absolue directement appliquée (après reset si combiné).
  console.log(`[prop] "${def.key}" rotation initiale — x:${source.rotation.x.toFixed(4)} y:${source.rotation.y.toFixed(4)} z:${source.rotation.z.toFixed(4)}`);
  if (def.resetRotation) source.rotation.set(0, 0, 0);
  if (def.correctionX)   source.rotation.x += def.correctionX;
  if (def.correctionZ)   source.rotation.z += def.correctionZ;
  if (def.absoluteX != null) source.rotation.x = def.absoluteX;
  if (def.absoluteZ != null) source.rotation.z = def.absoluteZ;
  console.log(`[prop] "${def.key}" rotation finale  — x:${source.rotation.x.toFixed(4)} y:${source.rotation.y.toFixed(4)} z:${source.rotation.z.toFixed(4)}`);
  source.updateMatrixWorld(true);

  const box    = new THREE.Box3().setFromObject(source);
  const size   = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  // ── Garde-fou GLB corrompu ─────────────────────────────────────────────────
  // Un GLB avec des vertices à des positions aberrantes (scale non appliqué dans Blender,
  // pivot déplacé, etc.) produit une bounding box de milliers d'unités.
  // Ces méga-triangles passent dans le GPU (frustumCulled=false) et créent les artefacts
  // "auras" dans le ciel — indépendamment de la courbure monde.
  // Fix permanent : Apply All Transforms dans Blender avant export GLTF.
  const MAX_BBOX_UNITS = 20; // les plus gros props (tours, moulins) font < 10 u
  if (def.bypassBboxCheck) {
    console.warn(
      `[prop] ⚠️ "${def.key}" — bbox forcée (bypassBboxCheck) : ${size.x.toFixed(1)}×${size.y.toFixed(1)}×${size.z.toFixed(1)} u. ` +
      `scale wrapper = ${(def.target / (Math.max(size.x, size.z) || 1)).toExponential(3)}.`
    );
  } else if (size.x > MAX_BBOX_UNITS || size.y > MAX_BBOX_UNITS || size.z > MAX_BBOX_UNITS) {
    console.error(
      `[prop] ⛔ "${def.key}" — bounding box ANORMALE : ${size.x.toFixed(1)}×${size.y.toFixed(1)}×${size.z.toFixed(1)} u.\n` +
      `  Ce GLB a des vertices à des positions extrêmes (probablement un Apply Transforms manquant dans Blender).\n` +
      `  → Le modèle est masqué pour éviter les artefacts visuels. Re-exporter depuis Blender avec Apply All Transforms.`
    );
    wrapper.visible = false;
    wrapper.userData.glbCorrupted = true;
    return wrapper; // groupe vide/invisible — pas de crash, pas de GPU pollution
  }

  source.position.set(-center.x, -box.min.y, -center.z);
  const dimension = def.mode === 'height' ? (size.y || 1) : (Math.max(size.x, size.z) || 1);
  wrapper.scale.setScalar(def.target / dimension);
  // Correction Y post-snap par modèle (ex. mushroom-2 a de la géo sous le chapeau visible)
  if (def.groundOffsetDelta) wrapper.userData.groundOffsetDelta = def.groundOffsetDelta;
  // 2026-07-04 perf : props à faible impact visuel — jamais de shadow caster (cf. createPropModel).
  wrapper.userData.noShadow = !!def.noShadow;
  wrapper.add(source);

  wrapper.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow    = true;
    object.receiveShadow = true;
    if (object.material) {
      object.material = clonePropMaterial(object.material);
      // Marquer les matériaux prototype pour que clearGroup (tileUtils) ne les dispose pas.
      // _reusePrototypeMaterials() partage ces objets matériaux avec toutes les instances :
      // sans ce flag, dispose() sur une instance détruit le prototype → animaux blancs.
      const mats = Array.isArray(object.material) ? object.material : [object.material];
      mats.forEach(m => { if (m) m.userData.glbPrototype = true; });
    }
  });

  // ── Diagnostic matériaux blancs ────────────────────────────────────────────
  // Affiché uniquement pour les props à risque (bypassBboxCheck ou animaux).
  // À supprimer une fois le bug blanc résolu.
  const DEBUG_KEYS = new Set(['fountain-1', 'animal-dog']);
  if (DEBUG_KEYS.has(def.key)) {
    let mi = 0;
    wrapper.traverse(o => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m, j) => {
        if (!m) { console.warn(`[mat-debug] "${def.key}" mesh${mi} slot${j}: NULL MATERIAL`); return; }
        console.log(
          `[mat-debug] "${def.key}" mesh${mi} slot${j}: ` +
          `type=${m.type} ` +
          `color=(${m.color?.r?.toFixed(3)},${m.color?.g?.toFixed(3)},${m.color?.b?.toFixed(3)}) ` +
          `map=${!!m.map} transparent=${m.transparent} opacity=${m.opacity?.toFixed(2)} ` +
          `metalness=${m.metalness?.toFixed(2)} roughness=${m.roughness?.toFixed(2)} ` +
          `glbProto=${m.userData?.glbPrototype}`
        );
      });
      mi++;
    });
  }

  return wrapper;
}

// Réutilise les matériaux du prototype plutôt que les copies créées par cloneSkeleton.
// Traversal depth-first identique entre prototype et clone → matching par position sûr.
// Résultat : zéro duplication de texture GPU entre instances du même type.
function _reusePrototypeMaterials(clone, prototype) {
  const protoMats = [];
  prototype.traverse(o => { if (o.isMesh) protoMats.push(o.material); });
  let i = 0;
  clone.traverse(o => {
    if (o.isMesh && i < protoMats.length) o.material = protoMats[i++];
  });
}

/**
 * Props statiques (sans animation) : remplace chaque SkinnedMesh par un Mesh ordinaire.
 * En bind pose, le skinning est une identité → rendu pixel-perfect identique.
 * Bénéfice : zéro DataTexture bone matrix per instance (élimine l'accumulation GPU).
 * Appelé uniquement si propAnimationsLibrary[key] est vide.
 */
function _convertStaticSkinnedMeshesToMesh(root) {
  const toReplace = [];
  root.traverse(o => { if (o.isSkinnedMesh) toReplace.push(o); });
  for (const o of toReplace) {
    const mesh = new THREE.Mesh(o.geometry, o.material);
    mesh.name           = o.name;
    mesh.visible        = o.visible;
    mesh.castShadow     = o.castShadow;
    mesh.receiveShadow  = o.receiveShadow;
    mesh.frustumCulled  = o.frustumCulled;
    mesh.userData       = { ...o.userData };
    mesh.position.copy(o.position);
    mesh.rotation.copy(o.rotation);
    mesh.scale.copy(o.scale);
    // Transfert des enfants éventuels (Object3D intermédiaires, pas des Bone).
    while (o.children.length > 0) mesh.add(o.children[0]);
    if (o.parent) { o.parent.add(mesh); o.parent.remove(o); }
    // Libère la DataTexture si elle avait déjà été créée (rendu du prototype).
    o.skeleton?.dispose?.();
  }
}

export function createPropModel(key, seedKey = key) {
  const prototype = propGlbLibrary.get(key);
  if (!prototype) {
    return null;
  }
  // cloneSkeleton est obligatoire pour TOUS les GLBs (même statiques) :
  // certains exporteurs utilisent des SkinnedMesh sans animation ; prototype.clone(true)
  // ne recâble pas les références skeleton → géométrie dégénérée / dimensions aberrantes.
  const object = cloneSkeleton(prototype);

  // Partage des matériaux du prototype après clone → élimine les duplications de textures GPU
  // sans risquer les bugs de SkinnedMesh. Les matériaux ne sont jamais modifiés par instance.
  _reusePrototypeMaterials(object, prototype);

  // Props sans animation : SkinnedMesh → Mesh (supprime la DataTexture bone matrix par instance).
  // Props animés (moulins, animaux) conservent leur SkinnedMesh + AnimationMixer.
  const animClips = propAnimationsLibrary.get(key);
  if (!animClips || animClips.length === 0) _convertStaticSkinnedMeshesToMesh(object);

  object.traverse(child => {
    child.visible = true;
    if (!child.isMesh) return;
    child.castShadow              = false;  // réinitialisé — 1 seul caster via _applySingleShadowCaster
    child.receiveShadow           = true;
    child.userData.castShadowOriginal = false;    // sera true sur le plus grand mesh après _applySingleShadowCaster
    child.userData.shadowFlagsApplied = true;     // empêche applySceneShadowFlags() de réinitialiser
  });
  // 2026-07-04 perf : certains props (barques échouées, chevaux…) sont marqués noShadow
  // au niveau du prototype — on saute _applySingleShadowCaster, tous les meshes restent
  // castShadow=false (déjà posé ci-dessus). Aucun impact sur LOD/courbure/placement.
  if (!prototype.userData.noShadow) {
    _applySingleShadowCaster(object); // 1 shadow caster max par prop (le plus grand mesh)
  }
  object.rotation.y += (hashUnit(`${seedKey}:base-yaw`) - 0.5) * 0.16;

  // AnimationMixer pour les GLBs avec animations intégrées (ex. moulin-2 avec pales animées).
  const clips = propAnimationsLibrary.get(key);
  if (clips && clips.length > 0) {
    const mixer = new THREE.AnimationMixer(object);
    for (const clip of clips) mixer.clipAction(clip).play();
    object.userData.mixer        = mixer;
    object.userData.mixerLastTime = null; // initialisé au premier update
  }

  return object;
}

/** Nombre de triangles d'une géométrie (indexée ou non). */
function _geomTriCount(geo) {
  if (!geo) return 0;
  return geo.index
    ? geo.index.count / 3
    : Math.floor((geo.attributes?.position?.count ?? 0) / 3);
}

/**
 * Sélectionne le mesh avec le plus de triangles dans root et lui seul
 * obtient castShadow=true. Tous les autres restent à false.
 * Réduit les shadow casters de N sous-meshes → 1 par prop.
 */
function _applySingleShadowCaster(root) {
  let best = null, bestTris = -1;
  root.traverse(obj => {
    if (!obj.isMesh) return;
    const t = _geomTriCount(obj.geometry);
    if (t > bestTris) { bestTris = t; best = obj; }
  });
  if (best) {
    best.castShadow = true;
    best.userData.castShadowOriginal = true; // restaurable par applySceneShadowFlags après culling
  }
}

// Exportée : réutilisée par decorBirdModels.js (prepareBirdPrototype/prepareSeagullPrototype).
export function clonePropMaterial(material) {
  if (Array.isArray(material)) return material.map(item => clonePropMaterial(item));
  const cloned = material.clone();
  cloned.side = THREE.DoubleSide;
  if ('emissiveIntensity' in cloned) cloned.emissiveIntensity = 0;
  if ('toneMapped' in cloned) cloned.toneMapped = true;
  cloned.needsUpdate = true;
  return cloned;
}
