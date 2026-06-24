import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { EffectComposer } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPixelatedPass } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/RenderPixelatedPass.js';
import { OutputPass } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/OutputPass.js';
import { GRID_RADIUS, HEX_SIZE } from '../config.js';
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
  renderer.toneMapping = THREE.LinearToneMapping;
  renderer.toneMappingExposure = 1.38;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.BasicShadowMap;
  renderer.shadowMap.autoUpdate = true;
  return renderer;
}

export function createThreeScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x02040a);
  scene.fog = new THREE.FogExp2(0x02040a, 0.004);
  ensureStarUniverse(scene);

  // Éclairage global conservé, mais moins envahissant : le soleil directionnel
  // devient la source principale et génère les ombres des objets 3D.
  scene.add(new THREE.HemisphereLight(0xfff4d8, 0x173b52, 0.24));

  const sun = new THREE.DirectionalLight(0xffd08a, 3.35);
  sun.name = 'main-sun-shadow-light';
  sun.userData.orbit = { radius: 10.5, height: 8.4, speed: 0.06, visualScale: 1.18 };
  sun.position.set(-7.5, 8.4, 5.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(8192, 8192);
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


export function updateSunShadowOrbit(scene, timeSeconds, focusPoint = null) {
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
  }
  keepSunShadowCameraStable(sun);
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

function keepSunShadowCameraStable(sun) {
  if (!sun?.shadow?.camera) return;
  const camera = sun.shadow.camera;
  const shadowExtent = Math.max(72, GRID_RADIUS * HEX_SIZE * 8.0);
  camera.left = -shadowExtent;
  camera.right = shadowExtent;
  camera.top = shadowExtent;
  camera.bottom = -shadowExtent;
  camera.near = Math.min(camera.near ?? 0.1, 0.1);
  camera.far = Math.max(camera.far ?? 160, 260);
}

function createVisibleSunObject() {
  const group = new THREE.Group();
  group.name = 'visible-sky-sun';

  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.85, 32, 16),
    new THREE.MeshBasicMaterial({
      color: 0xffd36a,
      transparent: true,
      opacity: 0.98,
      fog: false,
      depthWrite: false,
      depthTest: false
    })
  );
  core.name = 'visible-sky-sun-core';
  core.userData.disableCastShadow = true;
  core.userData.disableReceiveShadow = true;
  core.renderOrder = -10;
  group.add(core);

  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(1.55, 32, 16),
    new THREE.MeshBasicMaterial({
      color: 0xffb347,
      transparent: true,
      opacity: 0.22,
      fog: false,
      depthWrite: false,
      depthTest: false
    })
  );
  glow.name = 'visible-sky-sun-glow';
  glow.userData.disableCastShadow = true;
  glow.userData.disableReceiveShadow = true;
  glow.renderOrder = -11;
  group.add(glow);

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
    normalEdgeStrength: 0.20,
    depthEdgeStrength: 0.25
  };

  const pixelPass = new RenderPixelatedPass(settings.pixelSize, scene, camera);
  applyPixelPassSettings(pixelPass, settings);

  composer.addPass(pixelPass);
  composer.addPass(new OutputPass());

  function renderWorldLayer() {
    camera.layers.set(WORLD_LAYER);
    renderer.autoClear = true;

    if (settings.enabled) composer.render();
    else renderer.render(scene, camera);
  }

  function renderTextLayer() {
    // Les sprites texte restent nets : ils sont rendus après le postprocess,
    // sur un layer séparé, sans fond ni brouillard pour ne pas repeindre la scène.
    camera.layers.set(TEXT_LAYER);
    scene.background = null;
    scene.fog = null;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(scene, camera);
  }

  return {
    composer,
    pixelPass,
    getSettings() {
      return { ...settings };
    },
    applySettings(nextSettings = {}) {
      settings.enabled = Boolean(nextSettings.enabled ?? settings.enabled);
      settings.pixelSize = clampPixelSize(nextSettings.pixelSize ?? settings.pixelSize);
      settings.normalEdgeStrength = clamp01(nextSettings.normalEdgeStrength ?? settings.normalEdgeStrength);
      settings.depthEdgeStrength = clamp01(nextSettings.depthEdgeStrength ?? settings.depthEdgeStrength);
      applyPixelPassSettings(pixelPass, settings);
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
  pixelPass.enabled = settings.enabled;
  pixelPass.normalEdgeStrength = settings.normalEdgeStrength;
  pixelPass.depthEdgeStrength = settings.depthEdgeStrength;

  if (typeof pixelPass.setPixelSize === 'function') pixelPass.setPixelSize(settings.pixelSize);
  else pixelPass.pixelSize = settings.pixelSize;
}

function clampPixelSize(value) {
  return Math.min(10, Math.max(1, Math.round(Number(value) || 4)));
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

export function updateWorldCurvedSprites(scene) {
  scene.traverse(object => {
    if (!object.isSprite || object.userData?.disableWorldCurvature) return;

    if (object.userData.worldCurvatureFlatY === undefined) {
      object.userData.worldCurvatureFlatY = object.position.y;
    }

    const worldPosition = new THREE.Vector3();
    object.updateMatrixWorld(true);
    object.getWorldPosition(worldPosition);
    object.position.y = object.userData.worldCurvatureFlatY + getWorldCurvatureDrop(worldPosition.x, worldPosition.z);
  });
}

export function resizeRenderer(renderer, camera, postprocess = null) {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  postprocess?.composer?.setPixelRatio?.(Math.min(window.devicePixelRatio, 1.25));
  postprocess?.composer?.setSize?.(window.innerWidth, window.innerHeight);
}
