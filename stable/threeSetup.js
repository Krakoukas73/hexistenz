import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPixelatedPass } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/RenderPixelatedPass.js';
import { ShaderPass } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/OutputPass.js';
import { GRID_RADIUS, HEX_SIZE } from '../config.js';
import { COLOR_GRADING_SHADER } from '../visualEnvironment.js';
import { WORLD_CURVATURE_SHADER, WORLD_CURVATURE_UNIFORMS, getWorldCurvatureDrop, markNoWorldCurvature } from './worldCurvature.js';
import { ensureStarUniverse, updateStarUniverse } from './starUniverse.js';

export const WORLD_LAYER = 0;
export const TEXT_LAYER = 1;

// Initialisation Three.js isolée pour garder scene.js centré sur la logique de jeu.
export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.80;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.BasicShadowMap;
  renderer.shadowMap.autoUpdate = true;
  renderer.info.autoReset = false; // reset manuel dans animate() pour cumuler toutes les passes
  return renderer;
}

export function createThreeScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x02040a);
  scene.fog = new THREE.FogExp2(0x02040a, 0.004);
  ensureStarUniverse(scene);

  // Lumière hémisphérique nommée pour que applyEnvironment() la trouve et la mette à jour.
  // Sans nom elle serait invisible pour findOrCreateHemisphereLight() → double hémisphère
  // avec ground très sombre #173b52 qui crase les forêts sous ACESFilmicToneMapping.
  const hemisphereInit = new THREE.HemisphereLight(0xfff4d8, 0x8aaa8e, 0.60);
  hemisphereInit.name = 'hexistenz-environment-hemisphere';
  scene.add(hemisphereInit);

  const sun = new THREE.DirectionalLight(0xffd08a, 3.35);
  sun.name = 'main-sun-shadow-light';
  sun.userData.orbit = { radius: 10.5, height: 8.4, speed: 0.06, visualScale: 1.18 };
  sun.position.set(-7.5, 8.4, 5.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);   // 2048→1024 : −75% GPU shadow work (pixel size 3 = shadow detail indiscernable)
  sun.shadow.bias = -0.00012;
  sun.shadow.normalBias = 0.0025;
  sun.shadow.radius = 0;
  sun.shadow.camera.near = 0.1;
  sun.shadow.camera.far = 160;

  const shadowExtent = Math.max(32, GRID_RADIUS * HEX_SIZE * 4.5);
  sun.shadow.camera.left = -shadowExtent;
  sun.shadow.camera.right = shadowExtent;
  sun.shadow.camera.top = shadowExtent;
  sun.shadow.camera.bottom = -shadowExtent;

  const sunTarget = new THREE.Object3D();
  sunTarget.name = 'main-sun-shadow-target';
  sunTarget.position.set(0, 0, 0);
  sun.target = sunTarget;
  scene.add(sunTarget, sun);

  const sunVisual = markNoWorldCurvature(createVisibleSunObject());
  sunVisual.userData.followLightName = sun.name;
  sunVisual.position.copy(sun.position).multiplyScalar(sun.userData.orbit.visualScale);
  scene.add(sunVisual);

  const softFill = new THREE.DirectionalLight(0x8fd2ff, 0.03);
  softFill.position.set(5, 4, -6);
  scene.add(softFill);

  return scene;
}


// Strategy B — environnement IBL partagé pour unifier l'éclairage indirect de tous les GLBs.
// PMREMGenerator + RoomEnvironment : lumière d'ambiance douce et cohérente sur tous les matériaux.
export function applySceneEnvironment(scene, renderer) {
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();
  const roomEnv = new RoomEnvironment();
  const envTexture = pmremGenerator.fromScene(roomEnv).texture;
  roomEnv.dispose();
  pmremGenerator.dispose();
  scene.environment = envTexture;
  scene.environmentIntensity = 0.25; // subtil : complète les lumières directionnelles
}

export function updateSunShadowOrbit(scene, timeSeconds, focusPoint = null, cameraY = 25) {
  const sun = scene.getObjectByName('main-sun-shadow-light');
  const sunVisual = scene.getObjectByName('visible-sky-sun');
  const sunTarget = scene.getObjectByName('main-sun-shadow-target');
  updateStarUniverse(scene, timeSeconds);
  if (!sun) return;

  sun.castShadow = true;
  if (sun.shadow) {
    sun.shadow.camera.near = Math.min(sun.shadow.camera.near ?? 0.1, 0.1);
    sun.shadow.camera.far = Math.max(sun.shadow.camera.far ?? 48, 160);
  }

  const orbit = sun.userData.orbit ?? { radius: 10.5, height: 8.4, speed: 0.42, visualScale: 1.18 };
  const angle = timeSeconds * orbit.speed;
  const x = Math.cos(angle) * orbit.radius;
  const z = Math.sin(angle) * orbit.radius;
  const focus = getSunShadowFocusPoint(focusPoint);
  const lightPosition = new THREE.Vector3(
    focus.x + x,
    focus.y + orbit.height,
    focus.z + z
  );

  sun.position.copy(lightPosition);
  if (sunTarget) {
    sunTarget.position.copy(focus);
    sunTarget.updateMatrixWorld();
    sun.target = sunTarget;
  }
  if (sunVisual) {
    sunVisual.position.set(
      focus.x + x * orbit.visualScale,
      focus.y + orbit.height * orbit.visualScale,
      focus.z + z * orbit.visualScale
    );
    // Rotation du globe sur lui-même
    const glbModel = sunVisual.getObjectByName('visible-sky-sun-glb');
    if (glbModel) glbModel.rotation.y = timeSeconds * 0.25;
  }
  keepSunShadowCameraStable(sun, cameraY);
  sun.updateMatrixWorld();
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.needsUpdate = true;
}

function getSunShadowFocusPoint(focusPoint = null) {
  const x = Number.isFinite(focusPoint?.x) ? focusPoint.x : 0;
  const z = Number.isFinite(focusPoint?.z) ? focusPoint.z : 0;
  const baseY = Number.isFinite(focusPoint?.y) ? focusPoint.y : 0;
  const curvedY = getWorldCurvatureDrop(x, z);
  return new THREE.Vector3(x, Math.min(baseY, curvedY), z);
}

function keepSunShadowCameraStable(sun, cameraY = 25) {
  if (!sun?.shadow?.camera) return;
  const camera = sun.shadow.camera;
  // Extent adaptatif selon la hauteur caméra :
  //   faible hauteur (zoom) → ombres très serrées (~8u) — peu d'objets dans la shadow cam
  //   hauteur typique 25m → ~14u — bon compromis qualité/DC
  //   hauteur max → plafonné à 18u — les ombres de loin ne sont pas critiques
  // Réduit la shadow cam de ±24u fixe → ±14u typique : ~−40% de DC shadow.
  const shadowExtent = Math.max(8, Math.min(18, cameraY * 0.58));
  camera.left = -shadowExtent;
  camera.right = shadowExtent;
  camera.top = shadowExtent;
  camera.bottom = -shadowExtent;
  camera.near = Math.min(camera.near ?? 0.1, 0.1);
  camera.far = Math.max(camera.far ?? 160, 160);
}

function createVisibleSunObject() {
  const group = new THREE.Group();
  group.name = 'visible-sky-sun';

  // ── Placeholder visible immédiatement (remplacé dès que soleil.glb est chargé) ──
  const placeholder = new THREE.Mesh(
    new THREE.SphereGeometry(0.85, 16, 8),
    new THREE.MeshBasicMaterial({
      color: 0xffd36a,
      transparent: true,
      opacity: 0.95,
      fog: false,
      depthWrite: false,
      depthTest: false
    })
  );
  placeholder.name = 'visible-sky-sun-placeholder';
  placeholder.userData.disableCastShadow = true;
  placeholder.userData.disableReceiveShadow = true;
  placeholder.renderOrder = 998;
  group.add(placeholder);

  // ── Chargement async du GLB soleil.glb ──────────────────────────────────────
  new GLTFLoader().load(
    './glb/soleil.glb',
    gltf => {
      // Supprimer le placeholder une fois le GLB disponible
      const ph = group.getObjectByName('visible-sky-sun-placeholder');
      if (ph) { ph.geometry?.dispose(); ph.material?.dispose(); group.remove(ph); }

      const model = gltf.scene;

      // Normaliser la taille : bounding box → scale pour tenir dans ~1.7u de diamètre
      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      box.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const targetSize = 1.7;
      model.scale.setScalar(targetSize / maxDim);

      // Centrer sur l'origine du groupe (après scale)
      box.setFromObject(model);
      const center = new THREE.Vector3();
      box.getCenter(center);
      model.position.sub(center);

      model.name = 'visible-sky-sun-glb';
      // renderOrder 998 → se dessine APRÈS le terrain, toujours visible (depthTest:false)
      model.renderOrder = 998;

      // Pas de fog, pas de depth-write/test, pas d'ombres
      model.traverse(child => {
        if (!child.isMesh) return;
        child.castShadow = false;
        child.receiveShadow = false;
        child.renderOrder = 998;
        child.userData.disableCastShadow = true;
        child.userData.disableReceiveShadow = true;
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (const m of mats) {
          if (!m) continue;
          m.fog = false;
          m.depthWrite = false;
          m.depthTest = false;
          m.needsUpdate = true;
        }
      });

      group.add(model);
      console.log('[soleil.glb] chargé et intégré au groupe visible-sky-sun');
    },
    undefined,
    err => {
      // Pas d'erreur fatale : le placeholder reste visible
      console.warn('[soleil.glb] introuvable ou erreur, placeholder conservé', err?.message ?? err);
    }
  );

  return group;
}

export function createCamera() {
  return new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.02, 1000);
}

export function createPixelPostprocess(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
  composer.setSize(window.innerWidth, window.innerHeight);

  const settings = {
    enabled: true,
    pixelSize: 2,
    normalEdgeStrength: 0,      // 0 = skip le normal render (économise ~1800+ DCs/frame)
    depthEdgeStrength: 0.25     // depth edges seuls suffisent pour les silhouettes
  };

  const pixelPass = new RenderPixelatedPass(settings.pixelSize, scene, camera);
  applyPixelPassSettings(pixelPass, settings);

  // ── Monkey-patch RenderPixelatedPass pour sauter le normal render quand inutile ──
  // Source confirmée (r160) : render() appelle renderer.render() deux fois :
  //   1. beautyRenderTarget  → couleur + depthTexture (toujours nécessaire)
  //   2. normalRenderTarget  → normales pour edge detection (seulement si normalEdgeStrength > 0)
  // tDepth est lié à beautyRenderTarget.depthTexture → les depth edges marchent sans la passe normal.
  // En skippant la passe normal quand strength ≈ 0 on économise ~N DCs (N = draw calls scène entière).
  {
    const _origRender = pixelPass.render.bind(pixelPass);
    pixelPass.render = function patchedRender(renderer, writeBuffer) {
      const uniforms = this.fsQuad.material.uniforms;
      uniforms.normalEdgeStrength.value = this.normalEdgeStrength;
      uniforms.depthEdgeStrength.value  = this.depthEdgeStrength;

      // Passe 1 : beauty (couleur + depth → toujours)
      renderer.setRenderTarget(this.beautyRenderTarget);
      renderer.render(this.scene, this.camera);

      // Passe 2 : normales (seulement si demandé — évite un render scène entier inutile)
      if (this.normalEdgeStrength >= 0.005) {
        const prevOverride = this.scene.overrideMaterial;
        renderer.setRenderTarget(this.normalRenderTarget);
        this.scene.overrideMaterial = this.normalMaterial;
        renderer.render(this.scene, this.camera);
        this.scene.overrideMaterial = prevOverride;
      }

      uniforms.tDiffuse.value = this.beautyRenderTarget.texture;
      uniforms.tDepth.value   = this.beautyRenderTarget.depthTexture;
      uniforms.tNormal.value  = this.normalRenderTarget.texture;

      if (this.renderToScreen) {
        renderer.setRenderTarget(null);
      } else {
        renderer.setRenderTarget(writeBuffer);
        if (this.clear) renderer.clear();
      }
      this.fsQuad.render(renderer);
    };
  }

  const colorGradingPass = new ShaderPass(COLOR_GRADING_SHADER);

  composer.addPass(pixelPass);
  composer.addPass(colorGradingPass);
  composer.addPass(new OutputPass());

  function renderWorldLayer() {
    camera.layers.set(WORLD_LAYER);
    renderer.autoClear = true;
    // Toujours passer par le composer : colorGradingPass doit s'appliquer
    // même quand la pixelisation est désactivée (pixelPass neutralisé dans applyPixelPassSettings).
    composer.render();
  }

  function renderTextLayer() {
    // Les sprites texte restent nets : ils sont rendus après le postprocess,
    // sur un layer séparé, sans fond ni brouillard pour ne pas repeindre la scène.
    camera.layers.set(TEXT_LAYER);
    scene.background = null;
    scene.fog = null;
    renderer.autoClear = false;
    renderer.clearDepth();
    // Les sprites texte n'ont pas de shadow → désactive le shadow pass pour cette passe.
    // On sauvegarde/restaure la valeur gérée par scene.js (throttle par frame counter)
    // plutôt que de forcer true, ce qui court-circuiterait le throttle.
    const prevAutoUpdate = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    renderer.render(scene, camera);
    renderer.shadowMap.autoUpdate = prevAutoUpdate;
  }

  let _settingsListener = null;

  return {
    composer,
    pixelPass,
    colorGradingPass,
    getSettings() {
      return { ...settings };
    },
    applySettings(nextSettings = {}) {
      settings.enabled = Boolean(nextSettings.enabled ?? settings.enabled);
      settings.pixelSize = clampPixelSize(nextSettings.pixelSize ?? settings.pixelSize);
      settings.normalEdgeStrength = clamp01(nextSettings.normalEdgeStrength ?? settings.normalEdgeStrength);
      settings.depthEdgeStrength = clamp01(nextSettings.depthEdgeStrength ?? settings.depthEdgeStrength);
      applyPixelPassSettings(pixelPass, settings);
      // Synchroniser uPixelSize dans le color grading pass pour l'alignement Bayer
      if (colorGradingPass.uniforms?.uPixelSize !== undefined) {
        colorGradingPass.uniforms.uPixelSize.value = settings.enabled ? settings.pixelSize : 1.0;
      }
      _settingsListener?.({ ...settings });
    },
    onExternalSettingsChange(cb) {
      _settingsListener = cb;
    },
    render() {
      const previousMask = camera.layers.mask;
      const previousAutoClear = renderer.autoClear;
      const previousBackground = scene.background;
      const previousFog = scene.fog;

      renderWorldLayer();
      renderTextLayer();

      scene.background = previousBackground;
      scene.fog = previousFog;
      renderer.autoClear = previousAutoClear;
      camera.layers.mask = previousMask;
    }
  };
}

function applyPixelPassSettings(pixelPass, settings) {
  // On ne désactive jamais pixelPass (enabled=false casserait le readBuffer du colorGradingPass).
  // Quand la pixelisation est "off", on neutralise l'effet : taille=1 + forces=0.
  const active = settings.enabled;
  const pixelSize = active ? settings.pixelSize : 1;
  const normalStrength = active ? settings.normalEdgeStrength : 0;
  const depthStrength  = active ? settings.depthEdgeStrength  : 0;

  pixelPass.normalEdgeStrength = normalStrength;
  pixelPass.depthEdgeStrength  = depthStrength;

  if (typeof pixelPass.setPixelSize === 'function') pixelPass.setPixelSize(pixelSize);
  else pixelPass.pixelSize = pixelSize;
}

function clampPixelSize(value) {
  return Math.min(50, Math.max(1, Math.round(Number(value) || 4)));
}

function clamp01(value) {
  return Math.min(1, Math.max(0, Number(value) || 0));
}

export function applySceneShadowFlags(scene) {
  scene.traverse(object => {
    if (!object.isMesh || object.userData?.shadowFlagsApplied) return;

    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const hasLightAwareOpaqueMaterial = materials.some(material => material && !material.transparent && material.type !== 'MeshBasicMaterial');
    if (!hasLightAwareOpaqueMaterial) return;

    object.castShadow = object.userData?.disableCastShadow ? false : true;
    object.receiveShadow = object.userData?.disableReceiveShadow ? false : true;
    object.userData.shadowFlagsApplied = true;
  });
}


export function applySceneCurvatureFlags(scene) {
  scene.traverse(object => {
    const canCurve = object.isMesh || object.isLine || object.isPoints;
    if (!canCurve || object.userData?.worldCurvatureApplied || object.userData?.disableWorldCurvature) return;

    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      applyWorldCurvatureToMaterial(material);
    }

    // En mode bouliste, la géométrie est courbée dans le shader : les volumes
    // de culling CPU restent plats et peuvent découper les tuiles triangle par triangle
    // quand la caméra s'approche des cellules étendues. On le coupe seulement
    // pour les objets qui passent par cette courbure monde.
    object.frustumCulled = false;
    object.userData.worldCurvatureApplied = true;
  });
}

function applyWorldCurvatureToMaterial(material) {
  if (!material || material.userData?.worldCurvatureApplied || material.isShaderMaterial) return;

  const previousOnBeforeCompile = material.onBeforeCompile;
  material.onBeforeCompile = shader => {
    if (typeof previousOnBeforeCompile === 'function') previousOnBeforeCompile(shader);
    shader.uniforms.uWorldCurvatureEnabled = WORLD_CURVATURE_UNIFORMS.uWorldCurvatureEnabled;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>\n${WORLD_CURVATURE_SHADER}`
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      `vec4 dorfromantikLocalPosition = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
       dorfromantikLocalPosition = instanceMatrix * dorfromantikLocalPosition;
#endif
       vec4 dorfromantikWorldPosition = modelMatrix * dorfromantikLocalPosition;
       dorfromantikWorldPosition = dorfromantikApplyWorldCurvature(dorfromantikWorldPosition);
       vec4 mvPosition = viewMatrix * dorfromantikWorldPosition;
       gl_Position = projectionMatrix * mvPosition;`
    );
  };
  material.userData.worldCurvatureApplied = true;
  material.needsUpdate = true;
}

// Cache des sprites en attente de correction de courbure.
// Alimenté par registerCurvedSprite() dès qu'un sprite est ajouté à la scène.
const _pendingCurvedSprites = new Set();

/**
 * Enregistre un sprite pour correction de courbure au prochain tick.
 * Appelé par tout code qui crée un Sprite dans le monde (labels de zone, etc.).
 */
export function registerCurvedSprite(sprite) {
  _pendingCurvedSprites.add(sprite);
}

/**
 * Corrige la position Y des sprites nouvellement ajoutés uniquement.
 * Anciennement : scene.traverse() entier chaque frame = très coûteux sur 5000+ nœuds.
 * Nouveau : seuls les sprites non encore traités sont corrigés (~0 coût entre deux rebuilds).
 */
export function updateWorldCurvedSprites(scene) {
  if (_pendingCurvedSprites.size === 0) return;

  for (const object of _pendingCurvedSprites) {
    // Sprite supprimé entre-temps (rebuild de zone)
    if (!object.parent) { _pendingCurvedSprites.delete(object); continue; }

    if (object.userData.worldCurvatureFlatY === undefined) {
      object.userData.worldCurvatureFlatY = object.position.y;
    }

    const worldPosition = new THREE.Vector3();
    object.updateMatrixWorld(true);
    object.getWorldPosition(worldPosition);
    object.position.y = object.userData.worldCurvatureFlatY + getWorldCurvatureDrop(worldPosition.x, worldPosition.z);
    _pendingCurvedSprites.delete(object); // traité une fois, position XZ statique → terminé
  }
}

export function resizeRenderer(renderer, camera, postprocess = null) {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  postprocess?.composer?.setPixelRatio?.(Math.min(window.devicePixelRatio, 1.25));
  postprocess?.composer?.setSize?.(window.innerWidth, window.innerHeight);
}
