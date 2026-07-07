import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { createGLTFLoader } from './glbLoader.js';
import { RoomEnvironment } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPixelatedPass } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/RenderPixelatedPass.js';
import { ShaderPass } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/OutputPass.js';
import { GRID_RADIUS, HEX_SIZE, MAX_PIXEL_RATIO } from './config.js';
import { COLOR_GRADING_SHADER } from './visualEnvironment.js';
import { CINEMATIC_SHADER } from './cinematicPass.js';
import { WORLD_CURVATURE_SHADER, WORLD_CURVATURE_UNIFORMS, getWorldCurvatureDrop, markNoWorldCurvature } from './worldCurvature.js';
import { ensureStarUniverse, updateStarUniverse } from './starUniverse.js';
import { createGpuProfiler } from './gpuProfiler.js';
import { clamp01 } from './tileUtils.js';

export const WORLD_LAYER = 0;
export const TEXT_LAYER  = 1;

// Groupes de scène LOURDS et SANS sprite texte (TEXT_LAYER), masqués le temps de
// la passe texte (renderTextLayer) pour éviter que renderer.render() ne parcoure
// leurs sous-arbres profonds (squelettes, milliers de props) inutilement. Ne PAS
// y mettre waterZoneOverlay (contient les labels de zone) ni quoi que ce soit
// portant un sprite TEXT_LAYER. Sûr : un groupe oublié = juste moins d'optim, le
// texte s'affiche toujours. Noms = ceux posés par create*Overlay() / .name.
const TEXT_PASS_SKIP_NAMES = new Set([
  'grass-blade-overlay',
  'sheep-overlay',
  'forest-tree-glb-overlay',
  'field-wheat-overlay',
  'field-water-edge-effects-overlay',
  'house-overlay',
  'water-boat-overlay',
  'rail-train-overlay',
  'multiplayer-remote-ghosts',
  'terrain-merged-render',
  'character-overlay-glb', // instancié (2026-07-06) — sans sprite texte, safe à masquer aussi
]);

// Initialisation Three.js isolée pour garder scene.js centré sur la logique de jeu.
export function createRenderer(canvas) {
  // antialias: false — tout le rendu passe par l'EffectComposer dont les render
  // targets sont en samples:0 (aucun MSAA). Le MSAA du framebuffer par défaut ne
  // s'appliquerait qu'au quad plein écran final de l'OutputPass (bords hors-écran)
  // → aucun effet visuel, seulement un coût mémoire + resolve à chaque présentation.
  // Vérifié : composer.renderTarget1/2.samples === 0. Rendu strictement identique.
  // powerPreference 'high-performance' (2026-07-05) : sans ce flag, le navigateur/OS/driver
  // choisit lui-même le GPU et l'état d'alimentation (souvent un mode économe par défaut sur
  // laptop hybride ou sous throttling thermique/DVFS) — cf. diagnostic oscillation GPU : le
  // temps CPU de soumission (~19-22ms, stable) ne bouge pas alors que le temps GPU réel mesuré
  // (EXT_disjoint_timer_query) oscille de ~15ms à 45+ms sur une scène quasi statique (nuages
  // désactivés, ombre recalculée ou non — les deux cas oscillent pareil, cf. gpuProfiler.js
  // split "ombre recalculée"/"ombre réutilisée" qui montrent la même amplitude interne). Ça
  // pointe vers du scaling de fréquence GPU pilote/OS plutôt qu'un vrai surcoût de rendu.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.80;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.BasicShadowMap;
  renderer.shadowMap.autoUpdate = true;
  renderer.info.autoReset = false; // reset manuel dans animate() pour cumuler toutes les passes
  // 2026-07-05 — CORRECTIF RÉEL du throttle GPU périodique (~0.9s, ~48-52ms/coup) : analyse de
  // la trace Performance (Trace-20260705T225903) montre 52%+ du temps de CHAQUE stall dans
  // WebGLProgram.onFirstUse → gl.getProgramInfoLog/getShaderInfoLog/getProgramParameter. Ce bloc
  // entier (three.module.js ~L20271) n'existe QUE si renderer.debug.checkShaderErrors === true
  // (valeur par défaut de Three.js) — ce sont des appels de VALIDATION synchrones qui forcent le
  // driver GPU à attendre la fin du link du shader, à chaque toute première utilisation réelle
  // d'un matériau (mesure exacte, pas une supposition). renderer.compile() (tenté avant) ne
  // suffit PAS : il déclenche la compilation mais PAS cet appel de validation, qui reste
  // paresseux et n'arrive que lors du premier rendu réel — d'où l'absence d'effet du fix
  // précédent. Désactiver ce flag (recommandation officielle Three.js une fois les shaders du
  // projet validés) supprime entièrement ce coût, quel que soit le moment où un matériau est
  // utilisé pour la première fois.
  renderer.debug.checkShaderErrors = false;
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
  sun.userData.orbit = { radius: 10.5, height: 3.40, speed: 0.06, visualScale: 1.18 };
  sun.position.set(-7.5, 3.40, 5.5);
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

  const orbit = sun.userData.orbit ?? { radius: 10.5, height: 3.40, speed: 0.42, visualScale: 1.18 };
  // Garde-fou : si orbit.speed n'est pas un nombre fini (config pas encore appliquée, valeur
  // corrompue en localStorage…), on retombe sur la vitesse par défaut plutôt que de propager
  // un NaN dans position/rotation — un NaN une fois écrit dans une matrice de transformation
  // ne se corrige jamais tout seul (NaN * x = NaN pour toujours) et fait disparaître l'objet
  // (le frustum culling rejette les bounding spheres NaN).
  const safeOrbitSpeed = Number.isFinite(orbit.speed) ? orbit.speed : 0.06;
  const angle = timeSeconds * safeOrbitSpeed;
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
    // Rotation des astres sur eux-mêmes — proportionnelle à la vitesse d'orbite réglée
    // dans l'EDA (sunOrbitSpeed) : à vitesse orbite = 0, la rotation propre s'arrête aussi.
    // Avant : rotation.y = timeSeconds * cste, indépendante de orbit.speed → la lune (dont
    // les cratères rendent la rotation bien visible) continuait de tourner sur elle-même
    // même à vitesse 0 (bug peu visible sur le soleil, uni, mais flagrant sur la lune).
    // 0.06 = vitesse d'orbite par défaut (cf. createThreeScene) → facteur 1 à la valeur nominale.
    const spinFactor = safeOrbitSpeed / 0.06;
    const glbSun  = sunVisual.getObjectByName('visible-sky-sun-glb');
    const glbMoon = sunVisual.getObjectByName('visible-sky-moon-glb');
    if (glbSun)  glbSun.rotation.y  = timeSeconds * 0.25 * spinFactor;
    if (glbMoon) glbMoon.rotation.y = timeSeconds * 0.55 * spinFactor;
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
  // Rendu dans la passe monde normale (WORLD_LAYER) avec depth test/write activés :
  // l'astre orbite à une distance modérée du point focal caméra (cf. updateSunShadowOrbit,
  // rayon ~10-12u — pas "à l'infini") et DOIT donc pouvoir passer derrière un arbre ou une
  // tour quand il se trouve géométriquement derrière, comme n'importe quel autre objet 3D.
  // NOTE : ceci laisse l'astre occasionnellement recouvert par un label hexagonal quand
  // la caméra est haute (les labels sont rendus dans une passe ultérieure, indépendante
  // du depth buffer réel du monde) — problème connu, pas encore résolu, à reprendre
  // séparément (tentative précédente ayant causé une régression : astre invisible).
  group.layers.set(WORLD_LAYER);

  // ── Placeholder soleil (visible en mode jour, masqué jusqu'à setAstreMode) ──
  const placeholder = new THREE.Mesh(
    new THREE.SphereGeometry(0.85, 16, 8),
    new THREE.MeshBasicMaterial({
      color: 0xffd36a,
      transparent: true,
      opacity: 0.95,
      fog: false,
      depthWrite: false, // transparent → ne bloque pas ce qu'il y a derrière
      depthTest: true    // mais reste occulté par la géométrie opaque devant lui
    })
  );
  placeholder.name = 'visible-sky-sun-placeholder';
  placeholder.layers.set(WORLD_LAYER);
  placeholder.userData.disableCastShadow = true;
  placeholder.userData.disableReceiveShadow = true;
  placeholder.visible = false; // setAstreMode() décidera
  group.add(placeholder);

  // ── Chargement des DEUX astres — visibilité contrôlée par setAstreMode() ──
  const _loadAstre = (url, glbName) => {
    createGLTFLoader().load(
      url,
      gltf => {
        // Retirer le placeholder dès que le premier GLB arrive
        const ph = group.getObjectByName('visible-sky-sun-placeholder');
        if (ph) { ph.geometry?.dispose(); ph.material?.dispose(); group.remove(ph); }

        const model = gltf.scene;

        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const isMoon = glbName === 'visible-sky-moon-glb';
        model.scale.setScalar((1.7 / maxDim) * (isMoon ? 1.15 : 1.0));

        box.setFromObject(model);
        const center = new THREE.Vector3();
        box.getCenter(center);
        model.position.sub(center);

        model.name = glbName;
        model.visible = false; // setAstreMode() activera le bon

        model.traverse(child => {
          child.layers.set(WORLD_LAYER);
          if (child.isMesh) {
            child.castShadow = false;
            child.receiveShadow = false;
            child.userData.disableCastShadow = true;
            child.userData.disableReceiveShadow = true;

            if (glbName === 'visible-sky-sun-glb') {
              // Le GLB soleil a doubleSided:true → les faces back peuvent s'afficher dans
              // un ordre incohérent avec les faces front (effet "boule de sapin cassée").
              // Un soleil n'est pas un récepteur de lumière : on remplace le
              // MeshStandardMaterial PBR par un MeshBasicMaterial + FrontSide (mesh fermé,
              // FrontSide suffit à éliminer l'overdraw) — depth test/write normaux (opaque),
              // pour une occlusion correcte par le reste de la scène (arbres, tours…).
              const oldMat = Array.isArray(child.material) ? child.material[0] : child.material;
              const emissiveMap = oldMat?.emissiveMap ?? oldMat?.map ?? null;
              const basicMat = new THREE.MeshBasicMaterial({
                map:        emissiveMap,
                color:      0xffffff,
                fog:        false,
                depthWrite: true,
                depthTest:  true,
                side:       THREE.FrontSide, // mesh fermé, FrontSide suffit
                transparent: false,
              });
              // Libérer l'ancien matériau
              if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
              else child.material?.dispose();
              child.material = basicMat;
            } else {
              // Lune et autres astres : on garde le matériau GLB, on ajuste juste le rendu.
              // Corps céleste solide → forcé opaque comme le soleil : si le GLB exportait
              // transparent:true (fréquent même sans vraie zone alpha), depthWrite passait à
              // false et la lune se faisait trier par distance comme un objet transparent
              // (painter's algorithm) au lieu d'un vrai z-test — elle pouvait apparaître
              // "sous" les surfaces d'eau (elles aussi transparentes) alors que géométriquement
              // plus proche de la caméra.
              const mats = Array.isArray(child.material) ? child.material : [child.material];
              for (const m of mats) {
                if (!m) continue;
                m.fog = false;
                m.transparent = false;
                m.depthTest  = true;
                m.depthWrite = true;
                m.needsUpdate = true;
              }
            }
          }
        });

        group.add(model);

        // Appliquer le mode courant dès que le GLB est disponible
        const isSoleil = group.userData.isSoleil ?? true;
        _applyAstreVisibility(group, isSoleil);
        console.log('[astre] GLB chargé :', glbName, '| isSoleil=', isSoleil);
      },
      undefined,
      err => console.warn('[astre] GLB introuvable ou erreur :', url, err?.message ?? err)
    );
  };

  _loadAstre('./glb/astres/soleil.glb', 'visible-sky-sun-glb');
  _loadAstre('./glb/astres/lune_melies.glb', 'visible-sky-moon-glb');

  return group;
}

function _applyAstreVisibility(group, isSoleil) {
  const ph   = group.getObjectByName('visible-sky-sun-placeholder');
  const sun  = group.getObjectByName('visible-sky-sun-glb');
  const moon = group.getObjectByName('visible-sky-moon-glb');
  if (ph)   ph.visible   = isSoleil && !sun;  // placeholder soleil seulement si GLB pas encore chargé
  if (sun)  sun.visible  = isSoleil;
  if (moon) moon.visible = !isSoleil;
}

/**
 * Affiche le soleil ou la lune selon le mode.
 * À appeler à l'init ET à chaque changement jour/nuit.
 */
export function setAstreMode(scene, isSoleil) {
  const group = scene.getObjectByName('visible-sky-sun');
  if (!group) return;
  group.userData.isSoleil = isSoleil;
  _applyAstreVisibility(group, isSoleil);
}

export function createCamera() {
  return new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.02, 1000);
}

export function createPixelPostprocess(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
  composer.setSize(window.innerWidth, window.innerHeight);

  // Mesure GPU réelle (2026-07-04, affinée 2026-07-05) — cf. gpuTimer.js : le chrono JS
  // autour de render() ne mesurait que la soumission CPU, pas l'exécution GPU réelle.
  // 2026-07-05 : un seul timer global ne dit pas QUELLE passe est responsable quand le
  // GPU oscille (cf. gpuProfiler.js) — remplacé par N timers séquentiels, un par passe.
  const gpuProfiler = createGpuProfiler(renderer);

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
    // Chronométrage GPU dédié à cette passe (monde + ciel/nuages + eau + ombres internes) —
    // appliqué APRÈS le monkey-patch ci-dessus pour englober tout son travail réel.
    // 2026-07-05 : hypothèse nuages réfutée par le test utilisateur (oscillation identique
    // nuages désactivés) — shaderCiel.js confirmé avec bypass correct (uEnabled<0.5 → return
    // avant le ray-march, donc coût nuages bien nul). Nouvelle piste : renderer.shadowMap.autoUpdate
    // n'est vrai qu'1 frame sur 3 (cf. scene.js ~L670) → la shadow map (terrain entier, 53.9%
    // des triangles) n'est recalculée que 33% des frames, à l'intérieur de CETTE passe. Split
    // conditionnel pour isoler ce coût sans ambiguïté (pas de désalignement possible : le
    // prédicat est évalué en synchrone à l'appel, pas sur l'historique async du timer GPU).
    gpuProfiler.wrapPassConditional(
      pixelPass,
      'beauty — ombre recalculée ce frame',
      'beauty — ombre réutilisée (cache)',
      (r) => r.shadowMap.autoUpdate
    );
  }

  const colorGradingPass = new ShaderPass(COLOR_GRADING_SHADER);
  gpuProfiler.wrapPass(colorGradingPass, 'colorGrading (LUT)');

  // ── Effets cinématiques (tilt-shift · vignette · grain · aberration) ──────
  const cinemaPass = new ShaderPass(CINEMATIC_SHADER);
  gpuProfiler.wrapPass(cinemaPass, 'cinématique (godrays/bloom/CRT)');
  // uResolution nécessite un THREE.Vector2 pour le .set() dans render() ;
  // on l'injecte ici car cinematicPass.js ne dépend pas de THREE.
  cinemaPass.uniforms.uResolution = { value: new THREE.Vector2(window.innerWidth, window.innerHeight) };
  // uSunScreenPos : injecté ici (pas dans shaderCinematique.js) pour ne pas dépendre de
  // THREE dans ce fichier-là — même logique que uResolution ci-dessus.
  cinemaPass.uniforms.uSunScreenPos = { value: new THREE.Vector2(0.5, 0.5) };
  const _cinemaSettings = {
    enabled: false,
    tilt: 0.60, focusCenter: 0.50, focusBand: 0.35,
    vignette: 0.55, grain: 0.30, chromatic: 0.45,
    halation: 0.0, barrel: 0.0, scanLines: 0.0,
    godRays: 0.0, godRaysLength: 0.40, godRaysDiffusion: 0.85, godRaysThreshold: 0.70,
    godRaysLayers: 0.0,
    godRaysEnabled: true, tiltShiftEnabled: true,
    bloomIntensity: 0.0, bloomThreshold: 0.75, bloomRadius: 2.0, bloomSoftness: 0.4,
    crtCurvature: 0.0, crtMask: 0.5, crtCornerDark: 0.2,
    bloomEnabled: true, crtEnabled: true,
  };
  let _cinemaListener   = null;
  const _cinemaStartTime = performance.now();

  // Cases à cocher individuelles (2.1 God Rays / 2.2 Tilt-shift / 2.3 Bloom / 4. Courbure
  // écran, EDA) : ne modifient pas les valeurs stockées des sliders, seulement l'effet
  // appliqué en live — même principe que le on/off global VENT (débranché → amplitude
  // effective nulle, réglages préservés).
  function _applyCinemaUniforms(s) {
    cinemaPass.uniforms.uEnabled.value     = s.enabled   ? 1.0 : 0.0;
    cinemaPass.uniforms.uTilt.value        = s.tiltShiftEnabled ? s.tilt : 0.0;
    cinemaPass.uniforms.uFocusCenter.value = s.focusCenter;
    cinemaPass.uniforms.uFocusBand.value   = s.focusBand;
    cinemaPass.uniforms.uVignette.value    = s.vignette;
    cinemaPass.uniforms.uGrain.value       = s.grain;
    cinemaPass.uniforms.uChromatic.value   = s.chromatic;
    cinemaPass.uniforms.uHalation.value    = s.halation;
    cinemaPass.uniforms.uBarrel.value      = s.barrel;
    cinemaPass.uniforms.uScanLines.value   = s.scanLines;
    cinemaPass.uniforms.uGodRays.value          = s.godRays;
    cinemaPass.uniforms.uGodRaysLength.value    = s.godRaysLength;
    cinemaPass.uniforms.uGodRaysDiffusion.value = s.godRaysDiffusion;
    cinemaPass.uniforms.uGodRaysThreshold.value = s.godRaysThreshold;
    cinemaPass.uniforms.uGodRaysLayers.value    = s.godRaysLayers;
    cinemaPass.uniforms.uBloomIntensity.value   = s.bloomEnabled ? s.bloomIntensity : 0.0;
    cinemaPass.uniforms.uBloomThreshold.value   = s.bloomThreshold;
    cinemaPass.uniforms.uBloomRadius.value      = s.bloomRadius;
    cinemaPass.uniforms.uBloomSoftness.value    = s.bloomSoftness;
    cinemaPass.uniforms.uCrtCurvature.value     = s.crtEnabled ? s.crtCurvature : 0.0;
    cinemaPass.uniforms.uCrtMask.value          = s.crtMask;
    cinemaPass.uniforms.uCrtCornerDark.value    = s.crtCornerDark;
  }
  _applyCinemaUniforms(_cinemaSettings);

  // ── God Rays : position écran du soleil + fade quand hors-champ/derrière la caméra ──
  // Mis à jour chaque frame (comme uTime/uResolution), indépendamment de _applyCinemaUniforms
  // qui ne s'exécute qu'au commit des réglages EDA. Coût : 1 lookup scène (mis en cache) +
  // quelques opérations vectorielles — négligeable, et totalement court-circuité (return
  // anticipé) dès que l'intensité réglée par l'utilisateur est à 0.
  const _godRayWorldPos    = new THREE.Vector3();
  const _godRayToSunDir    = new THREE.Vector3();
  const _godRayCamForward  = new THREE.Vector3();
  let _godRaySunRef = null;

  function _updateGodRaysUniform() {
    const baseIntensity = _cinemaSettings.godRaysEnabled ? _cinemaSettings.godRays : 0.0;
    if (!(baseIntensity > 0.0001)) {
      cinemaPass.uniforms.uGodRays.value = 0.0;
      return;
    }
    if (!_godRaySunRef || !_godRaySunRef.parent) {
      _godRaySunRef = scene.getObjectByName('visible-sky-sun');
    }
    if (!_godRaySunRef) {
      cinemaPass.uniforms.uGodRays.value = 0.0;
      return;
    }

    _godRaySunRef.getWorldPosition(_godRayWorldPos);
    _godRayToSunDir.copy(_godRayWorldPos).sub(camera.position).normalize();
    camera.getWorldDirection(_godRayCamForward);
    const facing = _godRayCamForward.dot(_godRayToSunDir); // 1 = pile face caméra, <0 = derrière

    // Fade doux : 0 quand le soleil est derrière/sur le côté de la caméra, 1 quand face à elle.
    const fade = THREE.MathUtils.smoothstep(facing, -0.05, 0.20);
    if (!(fade > 0.0001)) {
      cinemaPass.uniforms.uGodRays.value = 0.0;
      return;
    }

    // Position écran (NDC → uv 0..1)
    _godRayWorldPos.project(camera);
    cinemaPass.uniforms.uSunScreenPos.value.set(
      (_godRayWorldPos.x + 1.0) * 0.5,
      (_godRayWorldPos.y + 1.0) * 0.5
    );
    cinemaPass.uniforms.uGodRays.value = baseIntensity * fade;
  }

  const outputPass = new OutputPass();
  gpuProfiler.wrapPass(outputPass, 'output (tonemap/sRGB)');

  composer.addPass(pixelPass);
  composer.addPass(colorGradingPass);
  composer.addPass(cinemaPass);
  composer.addPass(outputPass);

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

    // OPTIM CPU : renderer.render() parcourt tout le graphe (projectObject) même
    // pour ne dessiner que les quelques labels texte. Les gros groupes ci-dessous
    // n'ont AUCUN sprite TEXT_LAYER (les labels de tuiles sont désactivés — cf.
    // tileLabels.shouldShowValue ; seuls les labels de zone de waterZoneOverlay
    // existent). On masque ces sous-arbres profonds (squelettes moutons/persos,
    // milliers de props) le temps de la passe texte → Three saute leur récursion.
    // Mesuré : passe texte ~6.8 ms → ~0.5 ms (CPU submission). Restauré juste après.
    const _hidden = [];
    for (const child of scene.children) {
      if (child.visible && TEXT_PASS_SKIP_NAMES.has(child.name)) {
        child.visible = false;
        _hidden.push(child);
      }
    }

    gpuProfiler.timeSync('texte (labels hex)', () => renderer.render(scene, camera));

    for (const child of _hidden) child.visible = true;
    renderer.shadowMap.autoUpdate = prevAutoUpdate;
  }

  let _settingsListener = null;

  return {
    composer,
    pixelPass,
    colorGradingPass,
    cinemaPass,
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
    getCinemaSettings() {
      return { ..._cinemaSettings };
    },
    applyCinemaSettings(partial = {}) {
      const c = _cinemaSettings;
      if ('enabled'     in partial) c.enabled     = Boolean(partial.enabled);
      if ('tilt'        in partial) c.tilt        = Math.max(0, Math.min(1, Number(partial.tilt)));
      if ('focusCenter' in partial) c.focusCenter = Math.max(0, Math.min(1, Number(partial.focusCenter)));
      if ('focusBand'   in partial) c.focusBand   = Math.max(0, Math.min(1, Number(partial.focusBand)));
      if ('vignette'    in partial) c.vignette    = Math.max(0, Math.min(2, Number(partial.vignette)));
      if ('grain'       in partial) c.grain       = Math.max(0, Math.min(1, Number(partial.grain)));
      if ('chromatic'   in partial) c.chromatic   = Math.max(0, Math.min(1, Number(partial.chromatic)));
      if ('halation'    in partial) c.halation    = Math.max(0, Math.min(1, Number(partial.halation)));
      if ('barrel'      in partial) c.barrel      = Math.max(0, Math.min(1, Number(partial.barrel)));
      if ('scanLines'   in partial) c.scanLines   = Math.max(0, Math.min(6, Number(partial.scanLines)));
      if ('godRays'          in partial) c.godRays          = Math.max(0, Math.min(1, Number(partial.godRays)));
      if ('godRaysLength'    in partial) c.godRaysLength    = Math.max(0, Math.min(1, Number(partial.godRaysLength)));
      if ('godRaysDiffusion' in partial) c.godRaysDiffusion = Math.max(0, Math.min(1, Number(partial.godRaysDiffusion)));
      if ('godRaysThreshold' in partial) c.godRaysThreshold = Math.max(0, Math.min(1, Number(partial.godRaysThreshold)));
      if ('godRaysLayers'    in partial) c.godRaysLayers    = Math.max(0, Math.min(1, Number(partial.godRaysLayers)));
      if ('godRaysEnabled'   in partial) c.godRaysEnabled   = Boolean(partial.godRaysEnabled);
      if ('tiltShiftEnabled' in partial) c.tiltShiftEnabled = Boolean(partial.tiltShiftEnabled);
      if ('bloomIntensity' in partial) c.bloomIntensity = Math.max(0, Math.min(2, Number(partial.bloomIntensity)));
      if ('bloomThreshold' in partial) c.bloomThreshold = Math.max(0, Math.min(1, Number(partial.bloomThreshold)));
      if ('bloomRadius'    in partial) c.bloomRadius    = Math.max(0, Math.min(8, Number(partial.bloomRadius)));
      if ('bloomSoftness'  in partial) c.bloomSoftness  = Math.max(0, Math.min(1, Number(partial.bloomSoftness)));
      if ('crtCurvature'  in partial) c.crtCurvature  = Math.max(0, Math.min(1, Number(partial.crtCurvature)));
      if ('crtMask'       in partial) c.crtMask       = Math.max(0, Math.min(1, Number(partial.crtMask)));
      if ('bloomEnabled'  in partial) c.bloomEnabled  = Boolean(partial.bloomEnabled);
      if ('crtEnabled'    in partial) c.crtEnabled    = Boolean(partial.crtEnabled);
      if ('crtCornerDark' in partial) c.crtCornerDark = Math.max(0, Math.min(1, Number(partial.crtCornerDark)));
      _applyCinemaUniforms(c);
      _cinemaListener?.({ ...c });
    },
    onExternalCinemaChange(cb) {
      _cinemaListener = cb;
    },
    toggleCinema() {
      _cinemaSettings.enabled = !_cinemaSettings.enabled;
      _applyCinemaUniforms(_cinemaSettings);
      _cinemaListener?.({ ..._cinemaSettings });
    },
    render() {
      const previousMask = camera.layers.mask;
      const previousAutoClear = renderer.autoClear;
      const previousBackground = scene.background;
      const previousFog = scene.fog;

      // Grain animé + résolution scan lines : mise à jour avant chaque frame
      cinemaPass.uniforms.uTime.value          = (performance.now() - _cinemaStartTime) / 1000.0;
      cinemaPass.uniforms.uResolution.value.x  = renderer.domElement.width;
      cinemaPass.uniforms.uResolution.value.y  = renderer.domElement.height;
      _updateGodRaysUniform();

      // Chaque passe (beauty/colorGrading/cinéma/output/texte) est chronométrée
      // individuellement par gpuProfiler (cf. gpuProfiler.js) — jamais de requête
      // TIME_ELAPSED imbriquée puisque les passes s'exécutent séquentiellement.
      renderWorldLayer();
      renderTextLayer();
      gpuProfiler.poll(); // récupère les résultats async disponibles (peut dater de 1-3 frames)

      scene.background = previousBackground;
      scene.fog = previousFog;
      renderer.autoClear = previousAutoClear;
      camera.layers.mask = previousMask;
    },
    gpuProfiler,
    wrapExtraPass(pass, label) {
      return gpuProfiler.wrapPass(pass, label);
    },
    gpuTimerSupported: gpuProfiler.supported,
    getGpuMs() {
      return gpuProfiler.getTotalMs();
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

export function applySceneShadowFlags(scene) {
  scene.traverse(object => {
    if (!object.isMesh) return;

    if (object.userData?.shadowFlagsApplied) {
      // Restaurer le castShadow d'origine pour les meshes dont l'état a été écrasé par applyShadowCulling.
      // castShadowOriginal est stocké lors de la création de l'instance (bâtiment, prop GLB…).
      if (typeof object.userData.castShadowOriginal === 'boolean') {
        object.castShadow = object.userData.castShadowOriginal;
      }
      return;
    }

    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const hasLightAwareOpaqueMaterial = materials.some(material => material && !material.transparent && material.type !== 'MeshBasicMaterial');
    if (!hasLightAwareOpaqueMaterial) return;

    object.castShadow = object.userData?.disableCastShadow ? false : true;
    object.receiveShadow = object.userData?.disableReceiveShadow ? false : true;
    object.userData.castShadowOriginal = object.castShadow; // mémoriser pour restauration post-culling
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
  postprocess?.composer?.setPixelRatio?.(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
  postprocess?.composer?.setSize?.(window.innerWidth, window.innerHeight);
}
