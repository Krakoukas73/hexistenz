import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { registerLangRefresh, getLangFile, getLangVersion } from './gameLangReactive.js';
import { DECK_SIZE, GRID_RADIUS, COMET_HIT_SCORE, LOD_RAIL_TRACK_CULL_DISTANCE, LOD_PAVED_ROAD_CULL_DISTANCE } from './config.js';
import { EDGE_TYPES, DEBUG_FLAGS, HEXISTENZ_VERSION } from './variables.js';
import { WORLD_CURVATURE, setWorldCurvatureEnabled, getWorldCurvatureEnabled } from './worldCurvature.js';
import { CameraControls } from './controls.js';
import { createGrid, ensureGridCellsAroundHex, getGridCellCount, getGridKeys, updateGridAvailability } from './grid.js';
import { addSpecialCellMesh, createSpecialCells, createSpecialCellsMesh, removeSpecialCellMesh, updateSpecialCellsMeshAnimation } from './specialCells.js';
import { BONUS_CELL_SCORE, addBonusCellMesh, createBonusCells, createBonusCellsMesh, removeBonusCellMesh, updateBonusCellsMeshAnimation } from './bonusCells.js';
import { axialToWorld, makeHexKey } from './hex.js';
import { clearGroup } from './tileUtils.js';
import { createTileMesh } from './tileMesh.js';
import { updateAnimatedBiomeTextures, debugBiomeMaterialSnapshot } from './tileTextures.js';
import { isRealisticWaterMaterial, triggerRealisticWaterRipple, updateRealisticWater } from './realisticWater.js';
import { canPlaceTileAt, getPlacementValidation, setPlacementGridKeys } from './placementRules.js';
import { calculatePlacementScore } from './scoring.js';
import { createDeck, getEdgeType, rotateTile } from './tileGenerator.js';
import { createUI, setGridOnlyModeVisible, setHelpVisible, setText, updateDeckUI, updateKeyboardUI, updateMissionUI, updateScoreUI, updateStatsUI } from './ui.js';
import { createPlacementFeedbackOverlay, getPlacementLabel } from './placementOverlay.js';
import { createHoverZoneOverlay, createWaterZoneOverlay, rebuildHoverZoneOverlay, rebuildWaterZoneOverlay, updateHoverZoneOverlayAnimation, updateZoneLabelLOD, updateBeachLOD, getHoverRebuildStats, resetHoverRebuildStats } from './waterZoneOverlay.js';
import { createRailTrainOverlay, rebuildRailTrainOverlay, updateRailTrainOverlay, updateRailTrainLOD, getTrainLocoPositions } from './railTrainOverlay.js';
import { createWaterBoatOverlay, rebuildWaterBoatOverlay, updateWaterBoatOverlay, updateWaterBoatLOD } from '../shaders/waterBoatOverlay.js';
import { createForestOverlay, rebuildForestOverlay, updateForestLOD } from './forestOverlay.js';
import { createFieldWheatOverlay, rebuildFieldWheatOverlay, updateFieldWheatLOD } from './fieldWheatOverlay.js';
import { createGrassBladeOverlay, rebuildGrassBladeOverlay, updateGrassBladeLOD } from './grassBladeOverlay.js';
import { createHouseOverlay, rebuildHouseOverlay, updateHouseOverlay, updateHouseLOD, getHouseChimneyPositions } from './houseOverlay.js';
import { createCharacterOverlay, rebuildCharacterOverlay, updateCharacterLOD } from './characterOverlay.js';
import { createSmokeVolumePass, updateSmokeVolumePass, MAX_SMOKE_SOURCES } from './smokeVolumePass.js';
import { addSingleTileToDecorOverlay, createDecorOverlay, rebuildDecorOverlay, updateDecorOverlay, updateNaturalPropsLOD, updateFieldDecorLOD, computeLodHeightFactor } from './decorOverlay.js';
import { addBonusCellChest, createBonusCellChestOverlay, rebuildBonusCellChestOverlay, removeBonusCellChest, updateBonusCellChestOverlay, updateBonusCellChestLOD } from './bonusCellChestOverlay.js';
import { createSheepOverlay, rebuildSheepOverlay, updateSheepOverlay, updateSheepLOD } from './sheepOverlay.js';
import { createAmbientSoundDesign, startEndingMusic, startIngameMusic, toggleMute, registerAmbientSoundDesign } from './soundDesign.js';
import { createVisualEnvironment } from './visualEnvironment.js';
import { createCometSky, updateCometSky, tryCometHit, removeCometFromSky, spawnCometExplosion } from './cometSky.js';
import { createCloudSky, updateCloudSky, getCloudUserEnabled, getCloudSkyParams } from './cloudSky.js';
import { updateGlobalWind } from './globalWind.js';
import { resetPropHitboxRegistry } from './propHitboxRegistry.js';
import { createDebugLightUI, tickFps, syncMuteButtons } from './edaPanelHost.js';
import { captureSnapshot } from './snapshotCapture.js';
import { openSnapshotGallery, closeSnapshotGallery, isSnapshotGalleryOpen } from './snapshotGallery.js';
import { createEnvironmentDirector, updateEnvironmentDirector, isEnvironmentEventActive } from './environmentDirector.js';
import { createMorningMistOverlay, updateMorningMist } from '../shaders/morningMistOverlay.js';
import { createWeatherVfxOverlay, updateWeatherVfxOverlay } from './weatherVfxOverlay.js';
import { createRainCloudOverlay, rebuildRainCloudOverlay, updateRainCloudOverlay } from './rainCloudOverlay.js';
import { createLightningOverlay, updateLightningOverlay } from './lightningOverlay.js';
import { createFireOverlay, updateFireOverlay } from './fireOverlay.js';
import { askHighscoreSubmit, createHighscoreUI } from './highscore.js';
import { applySceneCurvatureFlags, applySceneEnvironment, applySceneShadowFlags, createCamera, createPixelPostprocess, createRenderer, createThreeScene, setAstreMode, resizeRenderer, updateSunShadowOrbit, updateWorldCurvedSprites } from './threeSetup.js';
import { applyShadowCulling, rebuildShadowCasters } from './shadowCulling.js';
import { addTileToTerrainMerge, createTerrainMergeGroup, hideTerrainMeshes, rebuildTerrainMerge } from './terrainMerge.js';
import { createWaterSurfaceOverlay, rebuildWaterSurfaceOverlay, updateWaterSurfaceLOD } from './waterSurfaceOverlay.js';
import { initReplayEngine } from './replayEngine.js';
// createPostprocessHud supprimé : PIX HUD fusionné dans le panel EDA (edaPanelHost.js/edaPanelWiring.js, ex-debugLightUi.js/hud_eda.js, panel CUSTOMISATION)
// createWaterDebugPanel supprimé : HUD EAU (Cyril) fusionné dans le panel EDA (panel CUSTOMISATION, avant PIXELISATION)
import { getBonusTilesAwarded, normalizeRotation } from './gameRules.js';
import { MISSION_REWARD, MISSION_TILE_REWARD, advanceMissionTurn, clonePlain, consumeCompletedMissions, createMissionManager, getCompletedMissions, getGameStats, getMissionProgressByType, maybeGenerateMissionForTile, removeMissionById, restoreMissionSnapshots, restoreMissions, serializeMissionManager, setMissionTurn } from './missions.js';
import { formatMissionTitle } from './missionLabels.js';
import { pollRoom, updateCursor, updateRoomState } from './multiplayerClient.js';
import { showScorePopup, showCenterMessage } from './scorePopup.js';
import { announcePoints, toggleTtsMute, resetTtsQueue, announceNewMission, announceMissionCompleted, announceHelpOpened, announceStatsIfChanged, announceVoiceOn, announceSoundOn } from './ttsAnnouncer.js';
import { applyTheme } from './themeManager.js';

// 2026-07-17 — reconfirme le thème graphique (data-theme) au chargement du module jeu.
// Redondant avec le <script> inline de game.php (qui évite le flash avant paint) mais
// câble themeManager.js dans le graphe de modules du jeu : point d'entrée prêt pour un
// futur sélecteur in-game / logique HUD dépendant du thème. Plomberie seulement — le
// thème "ancien" n'a encore aucun effet visuel.
applyTheme();

// 2026-07-16 — toute première ligne de la console F12 : version du jeu (HEXISTENZ_VERSION,
// variables.js), toujours affichée (non gatée), pour identifier immédiatement le build en cours.
console.log(`%cHexistenz ${HEXISTENZ_VERSION}`, 'font-weight:bold;color:#4ade80;');

// 2026-07-05 — marqueur de chargement, au niveau module (s'exécute à l'évaluation du fichier,
// AVANT tout appel de fonction) : preuve absolue que CE scene.js (avec le fix shader précompile)
// est bien celui exécuté par le navigateur. Si ce log n'apparaît jamais dans une session, le
// fichier chargé n'est pas celui-ci, point final — ce n'est pas un bug dans le code qui suit.
console.warn('[SCENE-JS-BUILD] scene.js chargé — build shader-precompile 2026-07-05-23h40');

// Passage bilingue FR/EN le 2026-07-12 : hint temporaire "sortir du super-immersif",
// texte sous json/languages/{french,english}.json (clé game.superImmersifExitHint),
// même mécanisme que les autres modules (top-level await + localStorage
// 'hexistenz_pres_lang').
const _sceneLangFile = getLangFile();
// `let` (pas `const`) : réassigné par le callback ci-dessous quand la langue change
// en jeu. Contrairement au kbdHint (edaPanelWiring.js), pas besoin de repousser dans
// un DOM déjà créé : _showSuperImmersifExitHint() recrée l'élément à chaque appel
// (retire l'existant, en crée un neuf), donc relire la variable suffit.
let _superImmersifExitHintText = await fetch(`./json/languages/${_sceneLangFile}.json?v=${getLangVersion()}`)
  .then(r => r.json())
  .then(data => data?.game?.superImmersifExitHint ?? '')
  .catch(err => {
    console.error(`[scene] Impossible de charger ${_sceneLangFile}.json`, err);
    return '';
  });

registerLangRefresh((data) => {
  _superImmersifExitHintText = data?.game?.superImmersifExitHint ?? '';
});

// Texte du popup central "Capture faite !" après un clic réussi sur 📷 (2026-07-15,
// même mécanisme réactif que le hint ci-dessus). Clé game.gallery.captured — regroupée
// avec les autres textes liés aux captures/galerie plutôt qu'une section dédiée.
let _snapshotCapturedText = await fetch(`./json/languages/${_sceneLangFile}.json?v=${getLangVersion()}`)
  .then(r => r.json())
  .then(data => data?.game?.gallery?.captured ?? '')
  .catch(err => {
    console.error(`[scene] Impossible de charger ${_sceneLangFile}.json`, err);
    return '';
  });

registerLangRefresh((data) => {
  _snapshotCapturedText = data?.game?.gallery?.captured ?? '';
});

// Textes du popup central "Sons activés"/"Sons désactivés" sur la touche M
// (2026-07-20, demande explicite : même mécanisme que le popup de thème/langue —
// gros popup central via showCenterMessage). Clé game.sound.{on,off}, même
// mécanisme réactif top-level await + registerLangRefresh que ci-dessus.
let _soundOnText = await fetch(`./json/languages/${_sceneLangFile}.json?v=${getLangVersion()}`)
  .then(r => r.json())
  .then(data => data?.game?.sound?.on ?? '')
  .catch(err => {
    console.error(`[scene] Impossible de charger ${_sceneLangFile}.json`, err);
    return '';
  });
let _soundOffText = await fetch(`./json/languages/${_sceneLangFile}.json?v=${getLangVersion()}`)
  .then(r => r.json())
  .then(data => data?.game?.sound?.off ?? '')
  .catch(() => '');

// Textes du popup central "Voix activée"/"Voix coupée" sur la touche T (2026-07-29,
// demande explicite : T coupe/réactive UNIQUEMENT le TTS, indépendamment de M
// ci-dessus). Clé game.tts.{voiceOn,voiceOff}, même mécanisme réactif.
let _voiceOnText = await fetch(`./json/languages/${_sceneLangFile}.json?v=${getLangVersion()}`)
  .then(r => r.json())
  .then(data => data?.game?.tts?.voiceOn ?? '')
  .catch(() => '');
let _voiceOffText = await fetch(`./json/languages/${_sceneLangFile}.json?v=${getLangVersion()}`)
  .then(r => r.json())
  .then(data => data?.game?.tts?.voiceOff ?? '')
  .catch(() => '');

registerLangRefresh((data) => {
  _soundOnText = data?.game?.sound?.on ?? '';
  _soundOffText = data?.game?.sound?.off ?? '';
  _voiceOnText = data?.game?.tts?.voiceOn ?? '';
  _voiceOffText = data?.game?.tts?.voiceOff ?? '';
});

// Ambiance orage (2026-07-12, arrivé via le merge du paquet Cyril le 2026-07-30) : assombrit
// soleil/hémisphérique/fill et masque le disque du soleil pendant l'évènement 'storm', rampe
// réversible ~1 s (suit jour/nuit + réglages EDA via les intensités de base mémorisées hors orage).
const _stormAmbience = { dim: 0, baseSun: null, baseHemi: null, baseFill: null };

function updateStormAmbience(scene, environmentDirector, deltaSeconds) {
  const target = isEnvironmentEventActive(environmentDirector, 'storm') ? 1 : 0;
  _stormAmbience.dim += (target - _stormAmbience.dim) * Math.min(1, deltaSeconds / 1.0);
  const d = _stormAmbience.dim;

  const sun   = scene.getObjectByName('main-sun-shadow-light');
  const hemi  = scene.getObjectByName('hexistenz-environment-hemisphere');
  const fill  = scene.getObjectByName('hexistenz-environment-fill-light');
  const astre = scene.getObjectByName('visible-sky-sun');

  // Hors orage : mémorise les intensités courantes comme base (jour/nuit, sliders EDA…).
  if (d < 0.002) {
    if (sun)  _stormAmbience.baseSun  = sun.intensity;
    if (hemi) _stormAmbience.baseHemi = hemi.intensity;
    if (fill) _stormAmbience.baseFill = fill.intensity;
  }
  if (sun  && _stormAmbience.baseSun  != null) sun.intensity  = _stormAmbience.baseSun  * (1 - 0.92 * d); // soleil quasi coupé
  if (hemi && _stormAmbience.baseHemi != null) hemi.intensity = _stormAmbience.baseHemi * (1 - 0.60 * d); // ambiant bien assombri
  if (fill && _stormAmbience.baseFill != null) fill.intensity = _stormAmbience.baseFill * (1 - 0.50 * d);
  if (astre) astre.visible = d < 0.5;   // l'astre (soleil) dégage en orage (repensé plus tard)
}

export function initScene(options = {}) {
  const canvas = document.getElementById('app');
  const renderer = createRenderer(canvas);
  const scene = createThreeScene();
  applySceneEnvironment(scene, renderer); // Strategy B : env map IBL partagée
  const camera = createCamera();
  const postprocess = createPixelPostprocess(renderer, scene, camera);

  // ── Pass fumée volumétrique : inséré AVANT colorGradingPass ──────────────────
  const smokeVolumePass = createSmokeVolumePass();
  postprocess.wrapExtraPass(smokeVolumePass, 'fumée volumétrique'); // chronométrage GPU dédié (cf. gpuProfiler.js)
  {
    const idx = postprocess.composer.passes.indexOf(postprocess.colorGradingPass);
    postprocess.composer.passes.splice(idx, 0, smokeVolumePass);
  }

  const visualEnvironment = createVisualEnvironment(scene, renderer);
  // Appliquer le mode monde AVANT createDebugLightUI : le HUD lit getWorldShapeMode()
  // à l'init et le stockage PIX pouvait écraser le choix bouliste/platiste du joueur.
  if (options.worldShapeMode) setWorldCurvatureEnabled(options.worldShapeMode !== 'platiste');
  const controls = new CameraControls(camera, canvas);
  const ui = createUI();
  const highscoreUI = createHighscoreUI(ui);

  // État de partie : carte posée, historique annulable, deck et score.
  const multiplayer = options.multiplayer ?? null;
  const isMultiplayer = options.mode === 'multi' && multiplayer?.roomCode;
  const initialState = options.initialState ?? null;
  const playerId = multiplayer?.playerId ?? null;
  const playerName = options.playerName ?? multiplayer?.playerName ?? 'Joueur';
  let lastMultiplayerCursorSentAt = 0;
  let lastMultiplayerCursorSignature = '';
  let localMultiplayerStateVersion = Number(initialState?.stateVersion ?? 1);
  let applyingRemoteState = false;
  // 2026-07-16 — feature replay (cf. replayEngine.js) : le clic de pose reste techniquement
  // câblé pendant que le replay est ouvert (le plateau réel est juste masqué en dessous),
  // ce flag l'empêche d'agir sur la VRAIE partie par erreur. La caméra, elle, n'est jamais
  // bloquée (demande explicite de l'utilisateur).
  let replayInputBlocked = false;

  const placedTiles = hydratePlacedTiles(initialState?.placedTiles);
  const specialCells = hydrateCellMap(initialState?.specialCells) ?? createSpecialCells();
  const bonusCells = hydrateCellMap(initialState?.bonusCells) ?? createBonusCells(new Set(specialCells.keys()));
  const specialCellsMesh = createSpecialCellsMesh(specialCells);
  const bonusCellsMesh = createBonusCellsMesh(bonusCells);
  // 2026-07-16 — fix replay : `placementHistory` restait TOUJOURS vide au chargement
  // d'une partie sauvegardée (rejoindre une room existante via `initialState`), même si
  // `initialState.placementHistory` contenait tout l'historique (sérialisé par
  // serializeCurrentGameState()). Seules les poses faites APRÈS le chargement, dans LA
  // session en cours, alimentaient ce tableau (via placeTile()) — d'où : (a) cliquer sur
  // 🎬 juste après avoir rejoint une partie sans avoir encore rien posé ne déclenchait
  // aucun replay (historique vide), et (b) une fois quelques tuiles reposées, le replay ne
  // montrait QUE ces nouvelles tuiles, jamais celles déjà présentes dans la sauvegarde.
  // Fix : réhydrater dès la création de la partie, même principe que le bloc équivalent
  // dans applyRemoteGameState() (mappe chaque entrée de l'historique sérialisé vers
  // l'objet placedTile déjà hydraté dans `placedTiles`, par clé).
  const placementHistory = [];
  {
    const _initialHistory = Array.isArray(initialState?.placementHistory) ? initialState.placementHistory : [];
    for (const _historyItem of _initialHistory) {
      const _historyKey = _historyItem?.key ?? makeHexKey(_historyItem?.q, _historyItem?.r);
      const _placedTile = placedTiles.get(_historyKey);
      if (_placedTile) placementHistory.push(_placedTile);
    }
  }
  const deck = hydratePlayerDeck(initialState, playerId) ?? createDeck(DECK_SIZE);
  const missionManager = hydrateMissionManager(initialState?.missionManager) ?? createMissionManager();
  let hoveredHex = null;
  let rotationIndex = 0;
  let rotationKeyActive = false;
  let totalScore = Number(initialState?.totalScore ?? 0);
  let lastScore = Number(initialState?.lastScore ?? 0);
  let helpVisible = false;
  let gameOver = false;
  let gridOnlyMode = false;
  let hiddenSpecialCellKey = null;
  let shadowRefreshFrame = 0;
  let cometHits = 0;
  // 2026-07-05 — diagnostic pur (aucun impact sur le rendu) : corréler l'oscillation GPU
  // avec le mouvement caméra (zoom amorti via CameraControls.zoomDamping) et le nombre de
  // triangles réellement soumis. Reset toutes les 120f, aligné sur gpuProfiler.report().
  let _diagTrianglesMin = Infinity, _diagTrianglesMax = -Infinity;
  let _diagRadiusMin = Infinity, _diagRadiusMax = -Infinity;
  // 2026-07-05 — diagnostic pur : la dernière série montre le disjointRatio à 0/6734+ polls
  // (aucun changement de fréquence GPU PENDANT une requête de mesure) MAIS surtout que TOUTES
  // les passes oscillent de la même façon, y compris "texte (labels hex)" et "output" qui ne
  // font quasi aucun travail (pics à 2-3ms sur des passes normalement ~0.00-0.02ms) — signe
  // d'une contention externe au pipeline de rendu (autre appli/processus GPU, VSync/present
  // stall, composition bureau) plutôt qu'un coût de calcul propre au jeu. Ce tracker mesure
  // l'écart réel entre deux requestAnimationFrame (attendu ≈16.7ms @60fps) : si CET écart lui
  // aussi grimpe en même temps que le GPU mesuré, c'est un stall de présentation/scheduling
  // du navigateur ou de l'OS, pas un vrai surcoût de rendu du jeu.
  let _rafPrevTs = null;
  let _vfxPrevTimeSeconds = null;

  // ── Références de scène mémoïsées (2026-07-28) ─────────────────────────────
  // animate() appelait scene.getObjectByName() trois fois PAR FRAME (étoiles, lumière
  // soleil, cible du soleil). getObjectByName parcourt récursivement tout le graphe —
  // soit 3 traversées complètes 60 fois par seconde, pour des objets créés une seule
  // fois au montage de la scène et jamais remplacés ensuite.
  // Résolution paresseuse (les objets n'existent pas encore ici) puis mise en cache.
  let _starsRef = null, _sunLightRef = null, _sunTargetRef = null;
  const _sceneRef = (cached, name) => (cached && cached.parent ? cached : scene.getObjectByName(name) ?? null);
  // Vecteur de travail pour la direction du soleil — évite un THREE.Vector3 jeté par frame.
  const _sunDirScratch = new THREE.Vector3();
  let _rafDeltaMin = Infinity, _rafDeltaMax = -Infinity;
  // 2026-07-05 — diagnostic pur : rayon caméra rock-solide (54.550-54.550, aucun mouvement)
  // pendant que le GPU réel continue d'osciller fortement → hypothèse caméra définitivement
  // écartée. Nouvelle piste concrète et testable : les deux traversées périodiques de scène
  // ci-dessous (curvature+shadowFlags+culling+env tous les 120f, rebuildShadowCasters tous les
  // 180f) mutent castShadow/visible/curvature sur potentiellement des centaines d'objets — si
  // elles invalident des shadow maps ou forcent des recompilations de shader, le coût GPU réel
  // peut apparaître sur les frames JUSTE APRÈS, pas de façon aléatoire. On log ici le gpuMs BRUT
  // frame par frame (pas de min/max agrégé) sur une fenêtre courte après chaque déclenchement,
  // pour voir si le pic colle exactement au frame de la traversée.
  let _gpuSpikeWatchUntilFrame = -1;
  // 2026-07-05 — traque le delta frame-à-frame de renderer.info.memory.geometries (cf. [GEO-DELTA]).
  let _geoPrevCount = null;
  // 2026-07-05 — piste Garbage Collector JS : min/max du tas JS par fenêtre 120f (cf. [RAF-STALL]).
  let _heapMin = Infinity, _heapMax = -Infinity;
  const waterClickRaycaster = new THREE.Raycaster();
  const waterClickPointer = new THREE.Vector2();
  let totalGridTiles = getTotalGridTiles(GRID_RADIUS);

  // Tuile fantôme et overlays : feedback visuel, aucun impact sur les règles.
  const ghostTile = new THREE.Group();
  const remoteGhosts = new THREE.Group();
  remoteGhosts.name = 'multiplayer-remote-ghosts';
  const waterZoneOverlay = createWaterZoneOverlay();
  const waterSurfaceOverlay = createWaterSurfaceOverlay();
  const hoverZoneOverlay = createHoverZoneOverlay();
  const railTrainOverlay = createRailTrainOverlay();
  const waterBoatOverlay = createWaterBoatOverlay();
  const forestOverlay = createForestOverlay();
  const fieldWheatOverlay = createFieldWheatOverlay();
  const grassBladeOverlay = createGrassBladeOverlay();
  const houseOverlay = createHouseOverlay();
  const characterOverlay = createCharacterOverlay();
  const fieldWaterEffectsOverlay = createDecorOverlay();
  const bonusCellChestOverlay = createBonusCellChestOverlay();
  const sheepOverlay = createSheepOverlay();
  const cometSky  = createCometSky();
  const cloudSky  = createCloudSky(scene);

  // Phase 0 roadmap VFX : squelette du directeur d'environnement (pas d'effet
  // visuel encore, cf. environmentDirector.js). Créé AVANT createDebugLightUI :
  // le panel EDA reçoit `environmentDirector` en param pour câbler sa rubrique
  // Météo (onglet 3, rubrique 8) — fusion 2026-07-08 de l'ex-HUD flottant "🌦 ENV"
  // (environmentDebugUi.js, supprimé).
  const environmentDirector = createEnvironmentDirector();
  const weatherVfxOverlay = createWeatherVfxOverlay(scene);
  const morningMistOverlay = createMorningMistOverlay(scene);
  // Nuages « chou-fleur » (metaballs marching-cubes) + pluie qui tombe réellement de
  // chaque nuage + impacts au sol (livraison Cyril 2026-07-11) — remplace la pluie
  // VFXParticles auparavant portée par weatherVfxOverlay. Rebuild sur changement de
  // plateau ; update chaque frame ; visibilité gérée en interne via isVfxGroupExpanded
  // + isEnvironmentEventActive('rain'/'storm').
  const rainCloudOverlay = createRainCloudOverlay(scene);
  // 2026-07-30 (merge Cyril) — chaîne orage → éclair → feu. lightningOverlay tire ses points de
  // frappe sous les nuages (getRainCloudAnchors), fireOverlay s'abonne à onLightningStrike.
  const lightningOverlay = createLightningOverlay(scene);
  const fireOverlay = createFireOverlay(scene);

  // Créé ici (et non plus juste après createCamera) : le panel VENT/NUAGES a besoin
  // des références forestOverlay (arbres GPU-wind) et cloudSky (nuages horizon jour).
  createDebugLightUI({ visualEnvironment, postprocess, forestOverlay, cloudSky, environmentDirector });

  // Bouton 📷 (edaPanelHost.js, ligne du bandeau FPS/EDA/langue) — capture serveur,
  // cf. CONTEXT.md §21 (2026-07-14). Le canvas ne contient que le rendu 3D (monde +
  // sprites texte + post-processing) : le HUD DOM n'a jamais besoin d'être masqué pour
  // une capture propre (cf. snapshotCapture.js). Seul hoverZoneOverlay (contour de
  // survol) est un objet Three.js visible dans le rendu — masqué le temps de la capture.
  document.getElementById('snapshotBtn')?.addEventListener('click', async (event) => {
    const btn = event.currentTarget;
    if (btn.disabled) return;
    btn.disabled = true;
    const prevHoverVisible = hoverZoneOverlay.visible;
    hoverZoneOverlay.visible = false;
    // Laisse au moins une frame se dessiner sans le contour de survol avant de capturer.
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    try {
      const tilesText = document.getElementById('tilesPlaced')?.textContent;
      const tiles = tilesText != null ? parseInt(tilesText, 10) : null;
      const mode = getWorldCurvatureEnabled() ? 'bouliste' : 'platiste';
      await captureSnapshot(canvas, { tiles: Number.isFinite(tiles) ? tiles : null, mode });
      // innerHTML (pas textContent) : le glyphe 📷 vit dans <span class="snapshot-emoji">
      // (eda.css) pour son agrandissement + repositionnement vertical — un textContent
      // écraserait ce span et l'emoji reviendrait à sa taille par défaut (bug constaté
      // 2026-07-16 : après une capture, l'icône revenait au bon glyphe mais en trop petit).
      btn.innerHTML = '✓';
      showCenterMessage(_snapshotCapturedText);
    } catch (err) {
      console.error('[scene] Échec capture snapshot', err);
      btn.innerHTML = '✕';
    } finally {
      hoverZoneOverlay.visible = prevHoverVisible;
      setTimeout(() => { btn.innerHTML = '<span class="snapshot-emoji">📷</span>'; btn.disabled = false; }, 1200);
    }
  });

  // Bouton 🖼️ (edaPanelHost.js, même bandeau) — ouvre la galerie de captures en overlay
  // par-dessus le jeu (iframe vers snapshots.php), sans quitter la partie en cours.
  // cf. snapshotGallery.js pour la logique d'ouverture/fermeture.
  document.getElementById('galleryBtn')?.addEventListener('click', () => openSnapshotGallery());

  // Réglage de densité de contenu (qualité/FPS) : intégré au panel EDA depuis le
  // 2026-07-08 (onglet Environnement, rubrique 7) — cf. edaPanelWiring.js. Plus de bouton
  // flottant séparé (ex-qualityUi.js, supprimé).

  // isSoleil : override localStorage > tirage aléatoire si aucune préférence stockée
  const _storedDayNight = localStorage.getItem('hexistenz_daynightmode');
  let isSoleil = (_storedDayNight === 'soleil') ? true
               : (_storedDayNight === 'lune')   ? false
               : (Math.random() < 0.5);
  cloudSky.visible = true;  // toujours visible (gradient de ciel jour OU nuit)
  // Astre : soleil en jour, lune en nuit (les deux GLBs sont chargés, setAstreMode() décide)
  setAstreMode(scene, isSoleil);
  if (!isSoleil) {
    updateCloudSky(cloudSky, {
      enabled:    false,
      skyZenith:  new THREE.Color(0x01060f),
      skyHorizon: new THREE.Color(0x0c1a2e),
      sunColor:   new THREE.Color(0xd0e8ff),
    });
    const _starsEarly = scene.getObjectByName('hexistenz-distant-star-universe');
    if (_starsEarly) _starsEarly.visible = true;
  }
  // Sync case à cocher Jour/Nuit du panel EDA (onglet Environnement, rubrique 6) + localStorage
  // au mode résolu (random → valeur concrète). Le listener dans edaPanelWiring.js est déjà câblé à ce
  // stade (createDebugLightUI ci-dessus) ; celui de scene.js (plus bas) ne l'est pas encore →
  // pas de double application du rendu jour/nuit (déjà fait directement ci-dessus).
  {
    const _dnMode = isSoleil ? 'soleil' : 'lune';
    localStorage.setItem('hexistenz_daynightmode', _dnMode);
    document.dispatchEvent(new CustomEvent('hexistenz:dayNightChange', { detail: { mode: _dnMode } }));
  }
  // Comètes visibles uniquement la nuit
  cometSky.visible = !isSoleil;

  // ── TUILES NOIRES : l'occluder étoile (hexistenz-grid-star-occluder) est un
  // mesh MeshBasicMaterial opaque noir (0x060910) renderOrder=-500 qui couvre
  // tout le plateau, cellules vides comprises → source des "tuiles noires".
  // On le masque : les cellules vides montrent le ciel (cloudSky ou étoiles).
  {
    const _occ = scene.getObjectByName('hexistenz-grid-star-occluder');
    if (_occ) _occ.visible = false;
  }
  // File de rebuild différé : Map<name, {rebuild, lod}> — coalescing automatique (dernier écrase).
  // 1 overlay/frame dans animate() : rebuild() puis lod() immédiat pour éviter pop-in et flash labels.
  const overlayRebuildQueue = new Map();
  const ambientSoundDesign = createAmbientSoundDesign({ camera, canvas, placedTiles, fieldWaterEffectsOverlay, railTrainOverlay, waterBoatOverlay, houseOverlay });
  // 2026-07-29 — permet à toggleMute() d'être appelée SANS argument depuis le bouton
  // 🔊 (edaPanelHost.js, créé plus tôt dans initScene, avant que cette instance
  // n'existe) tout en mutant correctement l'ambiance THREE.Audio comme la touche M.
  registerAmbientSoundDesign(ambientSoundDesign);
  const gridOverlay = createGrid([...placedTiles.values()]);
  syncPlacementGridKeys();
  totalGridTiles = getGridCellCount(gridOverlay);

  // Terrain fusionné : 1 Mesh par matériau au lieu de 1 par tuile (912 DC → 14 DC).
  const terrainMergeGroup = createTerrainMergeGroup();

  ghostTile.visible = false;

  scene.add(gridOverlay, specialCellsMesh, bonusCellsMesh, bonusCellChestOverlay, waterZoneOverlay, waterSurfaceOverlay, hoverZoneOverlay, railTrainOverlay, waterBoatOverlay, forestOverlay, fieldWheatOverlay, grassBladeOverlay, houseOverlay, characterOverlay, fieldWaterEffectsOverlay, sheepOverlay, cometSky, remoteGhosts, ghostTile, terrainMergeGroup);

  // Bouton 🎬 (edaPanelHost.js, même bandeau que FPS/EDA/📷/🖼️) — relecture accélérée de
  // la partie en cours (2026-07-16, cf. CONTEXT.md §21 "Option A"). replayEngine.js
  // reconstruit le monde tuile par tuile dans des groupes 3D parallèles, jamais les
  // groupes réels ci-dessus — le plateau actuel est seulement masqué le temps du replay,
  // jamais modifié. `setPlacementInputEnabled` désactive juste le clic de pose de tuile
  // pendant que le replay est ouvert (via `replayInputBlocked`) ; la caméra, elle, reste
  // entièrement libre (demande explicite de l'utilisateur).
  const replayController = initReplayEngine({
    scene,
    getPlacementHistory: () => placementHistory,
    getPlacedTiles: () => placedTiles,
    liveGroups: {
      terrainMergeGroup, forestOverlay, houseOverlay, railTrainOverlay, sheepOverlay,
      waterBoatOverlay, fieldWheatOverlay, grassBladeOverlay, fieldWaterEffectsOverlay,
      characterOverlay, waterSurfaceOverlay, waterZoneOverlay, specialCellsMesh,
      bonusCellsMesh, bonusCellChestOverlay, gridOverlay, hoverZoneOverlay, ghostTile
    },
    setPlacementInputEnabled: (enabled) => { replayInputBlocked = !enabled; }
  });
  document.getElementById('replayBtn')?.addEventListener('click', () => replayController.open());

  // ── Toggle Jour/Nuit depuis le panel LUT ────────────────────────────────────
  document.addEventListener('hexistenz:dayNightChange', (e) => {
    isSoleil = (e.detail.mode === 'soleil');
    cometSky.visible = !isSoleil;
    setAstreMode(scene, isSoleil);  // soleil.glb visible le jour, lune_melies.glb la nuit
    if (isSoleil) {
      updateCloudSky(cloudSky, {
        enabled: true,
        skyZenith:  new THREE.Color(0x0a1a3a),
        skyHorizon: new THREE.Color(0x4a7096),
        sunColor:   new THREE.Color(0xffe0a0),
      });
      const _stars = scene.getObjectByName('hexistenz-distant-star-universe');
      if (_stars) _stars.visible = false;
    } else {
      updateCloudSky(cloudSky, {
        enabled: false,
        skyZenith:  new THREE.Color(0x01060f),
        skyHorizon: new THREE.Color(0x0c1a2e),
        sunColor:   new THREE.Color(0xd0e8ff),
      });
      const _stars = scene.getObjectByName('hexistenz-distant-star-universe');
      if (_stars) _stars.visible = true;
    }
  });

  applySceneCurvatureFlags(gridOverlay);
  applySceneCurvatureFlags(specialCellsMesh);
  applySceneCurvatureFlags(bonusCellsMesh);
  rebuildBonusCellChestOverlay(bonusCellChestOverlay, bonusCells);
  applySceneCurvatureFlags(bonusCellChestOverlay);
  for (const placedTile of placedTiles.values()) {
    const position = axialToWorld(placedTile.q, placedTile.r);
    const mesh = createTileMesh(placedTile.tile, { worldX: position.x, worldZ: position.z });
    mesh.position.set(position.x, 0.003, position.z);
    hideTerrainMeshes(mesh);   // Les terrain meshes sont gérés par terrainMergeGroup
    placedTile.mesh = mesh;
    scene.add(mesh);
  }
  // Fusion initiale de tous les terrains chargés depuis la sauvegarde
  rebuildTerrainMerge(terrainMergeGroup, placedTiles);
  applySceneCurvatureFlags(terrainMergeGroup);
  rebuildWaterSurfaceOverlay(waterSurfaceOverlay, placedTiles);
  applySceneCurvatureFlags(waterSurfaceOverlay);

  // Une save déjà remplie arrive avec ses tuiles, mais les overlays décoratifs
  // (maisons, bateaux, trains, effets d'eau/champs/forêt) sont des groupes dérivés.
  // Ils doivent donc être reconstruits immédiatement au chargement, pas seulement
  // après la prochaine pose de tuile. Sinon le jeu ressemble à une carte postale
  // soviétique en attente d'un coup de pied.
  rebuildInitialDerivedOverlays();

  if (isMultiplayer) {
    createMultiplayerBadge(multiplayer.roomCode, playerName);
    setInterval(refreshMultiplayerRoom, 900);
  }
  refreshDeckUI();
  refreshGridAvailability();
  if (!isMultiplayer || !initialState?.missionManager) maybeAddMissionForCurrentTile();
  refreshMissionUI();
  updateScoreUI(ui, totalScore, lastScore, placedTiles.size, totalGridTiles);
  refreshStatsUI();

  ui.resetCamera?.addEventListener('click', event => {
    event.stopPropagation();
    controls.reset();
  });

  ui.undoLastTile?.addEventListener('click', event => {
    event.stopPropagation();
    undoLastPlacement();
  });

  ui.abandonGame?.addEventListener('click', event => {
    event.stopPropagation();
    requestAbandonConfirm();
  });

  ui.abandonConfirmBtn?.addEventListener('click', event => {
    event.stopPropagation();
    abandonGame();
  });

  ui.abandonCancelBtn?.addEventListener('click', event => {
    event.stopPropagation();
    cancelAbandonConfirm();
  });

  ui.newGame?.addEventListener('click', event => {
    event.stopPropagation();
    startNewGame();
  });

  ui.closeHelp?.addEventListener('click', event => {
    event.stopPropagation();
    toggleHelp(false);
  });

  ui.helpOverlay?.addEventListener('click', event => {
    if (event.target === ui.helpOverlay) toggleHelp(false);
  });

  controls.onHover = (hex, world) => {
    hoveredHex = hex;
    updateHover(hex, world);
  };

  controls.onClick = (hex) => { if (!replayInputBlocked) placeTile(hex); };

  controls.onWheel = (hex, deltaY, boosted = false) => {
    if (hex && isPlacementTarget(hex)) rotateActiveTile(deltaY < 0 ? 1 : -1);
    else controls.zoom(deltaY, boosted);
  };

  // Interdire le menu contextuel sur tout le document
  document.addEventListener('contextmenu', e => e.preventDefault());

  window.addEventListener('keydown', event => {
    const key = event.key.toLowerCase();

    if (isTextInputTarget(event.target)) return;

    if (event.ctrlKey && !event.shiftKey && !event.altKey && key === 'z') {
      event.preventDefault();
      undoLastPlacement();
      return;
    }

    if ((key === ' ' || key === 'spacebar') && !event.repeat && !event.shiftKey) {
      event.preventDefault();
      toggleGridOnlyMode();
      return;
    }

    // SHIFT+Espace : super-immersif — immersif + masquer les boutons/HUDs FPS, PIX, LUT
    if ((key === ' ' || key === 'spacebar') && !event.repeat && event.shiftKey) {
      event.preventDefault();
      const nextHudsHidden = !document.body.classList.contains('huds-force-hidden');
      if (nextHudsHidden && !gridOnlyMode) toggleGridOnlyMode(true);
      if (nextHudsHidden) {
        // Désactiver chaque bouton HUD (→ gris) via .click() AVANT d'appliquer la classe CSS
        // (les fonctions internes utilisent getComputedStyle ; il faut que huds-force-hidden
        //  ne soit pas encore actif pour que les états visibles soient corrects)
        const fpsBtn = document.getElementById('fpsHudToggle');
        if (fpsBtn?.classList.contains('debug-light-toggle--fps-active')) fpsBtn.click();
        const pixBtn = document.getElementById('pixToggle');
        if (pixBtn?.classList.contains('debug-light-toggle--pix-active')) pixBtn.click();
        const lutRoot = document.getElementById('debugLightPanel');
        if (lutRoot && !lutRoot.classList.contains('collapsed')) {
          document.getElementById('debugLightToggle')?.click();
        }
      }
      document.body.classList.toggle('huds-force-hidden', nextHudsHidden);
      // Contours pointillés des zones survolées — masqués en super-immersif (objet Three.js, pas DOM)
      hoverZoneOverlay.visible = !nextHudsHidden;
      // Message d'aide temporaire à l'entrée du mode super-immersif
      if (nextHudsHidden) _showSuperImmersifExitHint();
      return;
    }

    if (key === 'h') {
      event.preventDefault();
      if (gridOnlyMode) toggleGridOnlyMode(false);
      toggleHelp();
      return;
    }

    // Touche C — raccourci clavier pour le bouton 📷 (2026-07-15). Simple relais vers
    // le .click() du bouton plutôt qu'une duplication de sa logique (désactivation le
    // temps de la capture, masquage hoverZoneOverlay, popup "Capture faite !"…, cf.
    // handler #snapshotBtn plus haut dans ce fichier) — no-op silencieux si le bouton
    // est absent ou déjà désactivé (capture en cours).
    if (key === 'c') {
      event.preventDefault();
      document.getElementById('snapshotBtn')?.click();
      return;
    }

    // Touche G — raccourci clavier pour le bouton 🖼️ (2026-07-15, basculé en toggle le
    // 2026-07-16 sur retour utilisateur "si la galerie est déjà ouverte, G doit la
    // fermer"). Fermeture : appel direct à closeSnapshotGallery() (pas de bouton fermer
    // dédié dans le bandeau à relayer). Ouverture : conservé en relais .click() vers
    // #galleryBtn plutôt qu'un appel direct à openSnapshotGallery() (le bouton pourrait
    // un jour porter un état désactivé, ex. capture en cours, cf. #snapshotBtn — passer
    // par .click() garde ce garde-fou gratuit).
    if (key === 'g') {
      event.preventDefault();
      if (isSnapshotGalleryOpen()) closeSnapshotGallery();
      else document.getElementById('galleryBtn')?.click();
      return;
    }

    if (key === 'm') {
      event.preventDefault();
      // 2026-07-20, demande explicite : gros popup central (même mécanisme que le
      // changement de thème/langue) confirmant l'état son après bascule.
      const muted = toggleMute(ambientSoundDesign);
      showCenterMessage(muted ? _soundOffText : _soundOnText);
      // 2026-07-29 (6e round TTS), demande explicite : "Sons activés" doit aussi
      // être PRONONCÉ (pas seulement affiché) à la réactivation — même principe
      // que announceVoiceOn() pour la touche T (voir plus bas).
      if (!muted) announceSoundOn();
      // 2026-07-29 — resynchronise l'état visuel (actif/barré) du bouton 🔊
      // (edaPanelHost.js) : la touche M peut changer cet état sans passer par le
      // bouton, qui doit rester le reflet fidèle de l'état réel dans les 2 sens.
      syncMuteButtons();
      return;
    }

    if (key === 't') {
      event.preventDefault();
      // 2026-07-29, demande explicite : T coupe/réactive UNIQUEMENT les annonces
      // vocales (TTS) — la musique/ambiance (touche M ci-dessus) n'est pas touchée.
      // Même mécanisme de confirmation (popup central) que M.
      const ttsMuted = toggleTtsMute();
      showCenterMessage(ttsMuted ? _voiceOffText : _voiceOnText);
      // 2026-07-29 (3e round), demande explicite : "voix activée" doit aussi être
      // PRONONCÉ (pas seulement affiché) à la réactivation. Appelé APRÈS
      // toggleTtsMute() : _ttsMuted vient de repasser à false, donc speak() (dans
      // announceVoiceOn) n'est plus bloqué par son propre garde-fou.
      if (!ttsMuted) announceVoiceOn();
      // 2026-07-29 — resynchronise l'état visuel (actif/barré) du bouton 🗣️
      // (edaPanelHost.js), même logique que syncMuteButtons() pour M ci-dessus.
      syncMuteButtons();
      return;
    }

    // Touche V — raccourci clavier pour le HUD replay (2026-07-16), demande explicite
    // utilisateur : "V (vidéo) active/désactive le HUD replay de la partie". Contrairement
    // à C/G ci-dessus (simple relais .click() vers un bouton toggle), #replayBtn n'ouvre
    // QUE le replay (son .click() n'a pas d'effet de fermeture) — la touche doit donc
    // vraiment basculer les deux états via replayController.open()/close().
    if (key === 'v') {
      event.preventDefault();
      if (replayController.isOpen()) replayController.close();
      else replayController.open();
      return;
    }

    if ((event.key === '+' || event.key === '=' || event.code === 'NumpadAdd') && !helpVisible) {
      event.preventDefault();
      controls.zoom(-120, event.shiftKey);
      return;
    }

    if ((event.key === '-' || event.code === 'NumpadSubtract') && !helpVisible) {
      event.preventDefault();
      controls.zoom(120, event.shiftKey);
      return;
    }

    if (key === 'escape') {
      event.preventDefault();
      // 2026-07-17 — ESC en mode (super-)immersif doit UNIQUEMENT en sortir, pas
      // aussi ouvrir l'aide dans la foulée : `return` immédiat après la sortie de
      // gridOnlyMode (toggleGridOnlyMode(false) gère aussi le retrait de
      // huds-force-hidden pour le super-immersif). Avant ce fix, toggleHelp()
      // s'exécutait toujours ensuite, ouvrant l'aide par erreur.
      if (gridOnlyMode) {
        toggleGridOnlyMode(false);
        return;
      }
      // 2026-07-29, demande explicite : si le panneau EDA est ouvert, ESC doit
      // UNIQUEMENT le réduire (pas aussi ouvrir l'aide dans la foulée) — même
      // garde-fou que gridOnlyMode ci-dessus. Relais vers la croix de fermeture
      // du panneau (edaPanelWiring.js::_setLutOpen(false)) plutôt qu'une
      // duplication de sa logique (masquage HUD score, fpsApi.syncFullscreen()…).
      const edaPanel = document.getElementById('debugLightPanel');
      if (edaPanel && !edaPanel.classList.contains('collapsed')) {
        edaPanel.querySelector('.debug-light-close')?.click();
        return;
      }
      // 2026-08-01, demande explicite : même garde-fou que l'EDA ci-dessus,
      // mais pour le HUD FPS déployé — ESC doit UNIQUEMENT le refermer (pas
      // aussi ouvrir l'aide). Relais vers .fps-hud-close (hud_fps.js::
      // _toggleFpsHud() via son handler de clic délégué), présent dans le DOM
      // uniquement quand _fpsHudExpanded est vrai (cf. hud_fps.js ~187).
      const fpsHudClose = document.querySelector('.fps-hud-close');
      if (fpsHudClose) {
        fpsHudClose.click();
        return;
      }
      toggleHelp();
      return;
    }

    if (key !== 'r' || helpVisible) return;
    controls.reset();
  });

  // Permet au LUT panel (et tout autre module) de déclencher un reset caméra
  window.addEventListener('hexistenz:resetCamera', () => controls.reset());

  // Réglage de densité de contenu (qualité/FPS) : reconstruit tout le contenu
  // scalé (props naturels, herbe, moutons — pas les personnages, instanciés
  // séparément et non concernés par ce réglage, cf. characterOverlay.js).
  window.addEventListener('dorfromantik:content-density-changed', () => {
    rebuildInitialDerivedOverlays();
    applySceneCurvatureFlags(scene);
    applySceneShadowFlags(scene);
  });

  window.addEventListener('keyup', event => {
    if (event.key.toLowerCase() === 'r') rotationKeyActive = false;
  });

  window.addEventListener('resize', () => resizeRenderer(renderer, camera, postprocess));
  canvas.addEventListener('pointerdown', handleWaterPointerDown, { passive: true });

  // ── Clic sur les comètes ────────────────────────────────────────────────────
  // Hitbox généreuse (1.2× le halo) : clic → +75 pts + disparition immédiate.
  const _cometClickRaycaster = new THREE.Raycaster();
  const _cometClickPointer   = new THREE.Vector2();
  canvas.addEventListener('pointerdown', (event) => {
    if (gameOver || event.button !== 0) return;
    const rect = canvas.getBoundingClientRect();
    _cometClickPointer.x = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1;
    _cometClickPointer.y = -(((event.clientY - rect.top)  / Math.max(rect.height, 1)) * 2 - 1);
    _cometClickRaycaster.setFromCamera(_cometClickPointer, camera);
    const hit = tryCometHit(cometSky, _cometClickRaycaster.ray, 0.466); // −10 % (était 0.518)
    if (!hit) return;
    cometHits++;
    spawnCometExplosion(cometSky, hit);
    removeCometFromSky(cometSky, hit);
    totalScore += COMET_HIT_SCORE;
    lastScore   = COMET_HIT_SCORE;
    updateScoreUI(ui, totalScore, lastScore, placedTiles.size, totalGridTiles);
    refreshStatsUI();
  }, { passive: true });

  // ── Contours de relief en mode bouliste ────────────────────────────────────
  // Le normal buffer de RenderPixelatedPass n'intègre pas la courbure monde :
  // ses arêtes normal-based créent des artefacts en mode sphère. On les désactive.
  let _savedNormalEdge = postprocess.getSettings().normalEdgeStrength;
  if (WORLD_CURVATURE.enabled) postprocess.applySettings({ normalEdgeStrength: 0.0 });
  window.addEventListener('dorfromantik:world-curvature-changed', ({ detail }) => {
    if (detail.enabled) {
      _savedNormalEdge = postprocess.getSettings().normalEdgeStrength;
      postprocess.applySettings({ normalEdgeStrength: 0.0 });
    } else {
      postprocess.applySettings({ normalEdgeStrength: _savedNormalEdge });
    }
    // Les labels ont leur Y figé par updateWorldCurvedSprites (one-shot).
    // Un rebuild corrige les positions pour le nouveau mode bouliste/platiste.
    rebuildWaterZoneOverlay(waterZoneOverlay, placedTiles);
    rebuildWaterSurfaceOverlay(waterSurfaceOverlay, placedTiles);
    applySceneCurvatureFlags(waterSurfaceOverlay);
  });

  // ── Globals de diagnostic exposés en console navigateur ────────────────────
  window.setWorldCurvatureEnabled = setWorldCurvatureEnabled;
  window.getWorldCurvatureEnabled = getWorldCurvatureEnabled;
  // Panneau sliders eau/sillage : intégré dans le HUD LUT (rubrique EAU, avant PIXELISATION).

  /**
   * window.scanSceneAura([maxNormalExtent=3])
   * Scanne la scène pour trouver les meshes suspects pouvant causer des artefacts
   * "aura" dans le ciel. Les auras viennent de vertices à position XZ extrême passant
   * dans le shader de courbure → clip-space pathologique + frustumCulled=false.
   * Avec GRID_RADIUS=6 et HEX_SIZE=1, un mesh "normal" s'étend sur max ~6 unités
   * dans chaque axe. Au-delà → suspect.
   *
   * Usage console :
   *   scanSceneAura()           → seuil par défaut 6 unités
   *   scanSceneAura(10)         → seuil personnalisé
   */
  window.scanSceneAura = function(maxNormalExtent = 6) {
    const box = new THREE.Box3();
    const size = new THREE.Vector3();
    const suspects = [];

    scene.traverse(obj => {
      if (!obj.isMesh && !obj.isSkinnedMesh) return;
      try {
        box.setFromObject(obj, true); // true = ignorer enfants (déjà traversé)
        if (box.isEmpty()) return;
        box.getSize(size);
        const maxXZ = Math.max(size.x, size.z);
        const maxY  = size.y;
        const absMaxY = Math.max(Math.abs(box.min.y), Math.abs(box.max.y));
        if (maxXZ > maxNormalExtent || absMaxY > maxNormalExtent * 3) {
          const noCurve = obj.userData?.disableWorldCurvature === true;
          suspects.push({
            name:    obj.name || '(unnamed)',
            parent:  obj.parent?.name || '—',
            maxXZ:   maxXZ.toFixed(2),
            sizeY:   maxY.toFixed(2),
            minY:    box.min.y.toFixed(2),
            maxYabs: absMaxY.toFixed(2),
            center:  `(${((box.min.x+box.max.x)/2).toFixed(1)}, ${((box.min.y+box.max.y)/2).toFixed(1)}, ${((box.min.z+box.max.z)/2).toFixed(1)})`,
            noCurve,
            renderOrder: obj.renderOrder,
          });
        }
      } catch (_) {}
    });

    if (!suspects.length) {
      console.log('[scanSceneAura] ✅ Aucun mesh suspect (seuil XZ=' + maxNormalExtent + ')');
      return;
    }
    suspects.sort((a, b) => parseFloat(b.maxXZ) - parseFloat(a.maxXZ));
    console.log(`[scanSceneAura] ⚠️  ${suspects.length} mesh(es) suspect(s) (seuil XZ>${maxNormalExtent}) :`);
    console.table(suspects);
    console.log('[scanSceneAura] Conseil : si le maxXZ ou absMaxY est très grand et noCurve=false → ce mesh cause probablement les auras.');
    return suspects;
  };

  /**
   * window.toggleMeshByName(namePart, visible)
   * Masque/affiche temporairement des meshes dont le nom contient namePart.
   * Utile pour isoler l'objet responsable des auras.
   * Exemples :
   *   toggleMeshByName('field-flag', false)  → masque tous les moulins
   *   toggleMeshByName('field-flag', true)   → réaffiche
   *   toggleMeshByName('tour', false)        → masque les tours
   */
  window.toggleMeshByName = function(namePart, visible = true) {
    let count = 0;
    scene.traverse(obj => {
      const n = (obj.name || '') + (obj.parent?.name || '');
      if (n.toLowerCase().includes(namePart.toLowerCase())) {
        obj.visible = visible;
        count++;
      }
    });
    console.log(`[toggleMeshByName] "${namePart}" → visible=${visible} sur ${count} object(s)`);
  };

  // FLASH-DIAG : déclaré AVANT animate() pour éviter la temporal dead zone
  let _flashPrevVisCount = -1;

  // 2026-07-05 — CORRECTIF v2 : renderer.compile() (tenté avant) retraverse TOUTE la scène à
  // chaque appel (~53ms fixe, même quand rien de neuf), et [MEMORY-DIAG] prouve que le nombre de
  // programmes (155) est déjà STABLE dès la 1ère fenêtre de mesure — aucun NOUVEAU shader n'est
  // compilé pendant les stalls. Le vrai coût est ailleurs : WebGLProgram n'introspecte les
  // emplacements uniform/attribut (new WebGLUniforms / fetchAttributeLocations, cf. lecture du
  // code source three.module.js:20355-20356) que lors du tout PREMIER DESSIN réel de ce
  // programme — pas à sa compilation. Des programmes déjà compilés dès le début restent "jamais
  // dessinés" tant qu'aucun objet ne les utilise réellement (LOD, distance, occlusion), ce qui
  // explique le motif étalé dans le temps même caméra fixe (bateaux/trains/moutons qui bougent
  // font apparaître nouveaux objets/LOD au fil du temps). Fix : forcer directement
  // program.getUniforms() sur chaque WebGLProgram déjà créé (renderer.info.programs) — sans
  // retraverser la scène, donc quasi gratuit pour les programmes déjà "chauds" (retour immédiat
  // sur cache), et ne paie le vrai coût que pour ceux réellement jamais utilisés.
  function warmUpAllPrograms(reasonTag) {
    const programs = renderer.info.programs;
    if (!programs || programs.length === 0) return;
    const _t0 = performance.now();
    let _warmed = 0;
    for (const program of programs) {
      try {
        // getUniforms()/getAttributes() sont idempotents (cache interne à WebGLProgram) —
        // rappeler sur un programme déjà "chaud" ne coûte quasiment rien.
        if (program.getUniforms) { program.getUniforms(); _warmed++; }
        if (program.getAttributes) program.getAttributes();
      } catch (err) {
        console.warn('[SHADER-WARMUP] échec sur un programme (non bloquant):', err);
      }
    }
    const _ms = performance.now() - _t0;
    // Gaté sous DEBUG_FLAGS.shaders (2026-07-16, phase 2) — UNIQUEMENT ce console.warn de
    // timing. La boucle getUniforms()/getAttributes() juste au-dessus reste TOUJOURS exécutée :
    // c'est un correctif anti-stall fonctionnel, pas un diagnostic (cf. commentaire ligne 678).
    if (DEBUG_FLAGS.shaders && _ms > 1) console.warn(`[SHADER-WARMUP:${reasonTag}] ${_warmed}/${programs.length} programmes: ${_ms.toFixed(1)}ms`);
  }

  // 2026-07-06 — le warmup ne trouve JAMAIS rien à chauffer (0 occurrence >1ms, même à chaque
  // frame) alors que [RAF-STALL] persiste identique et que programmes.length reste PLAT (113) :
  // ça ne prouve PAS l'absence de nouveaux programmes — juste que le COMPTE net ne bouge pas.
  // Si un programme est créé ET libéré (churn) au même rythme, le total reste stable alors que
  // CHAQUE nouveau programme paie quand même son coût onFirstUse à sa création. On compare ici
  // l'ENSEMBLE des cacheKey (pas juste leur nombre) d'une frame à l'autre pour détecter un
  // roulement caché derrière un total stable.
  let _prevProgramKeys = null;
  function checkProgramChurn() {
    const programs = renderer.info.programs;
    if (!programs) return;
    const keys = new Set(programs.map(p => p.cacheKey));
    if (_prevProgramKeys) {
      const added = [...keys].filter(k => !_prevProgramKeys.has(k));
      const removed = [...(_prevProgramKeys)].filter(k => !keys.has(k));
      if (added.length || removed.length) {
        const addedNames = added.slice(0, 3).map(k => {
          const p = programs.find(pr => pr.cacheKey === k);
          return `${p?.name ?? '?'}(used×${p?.usedTimes ?? '?'})`;
        });
        console.warn(`[PROGRAM-CHURN] frame=${shadowRefreshFrame} +${added.length}/-${removed.length} (total=${keys.size}) | ajoutés: ${addedNames.join(' || ')}`);
      }
    }
    _prevProgramKeys = keys;
  }

  // 2026-07-06 — DIAG BORNÉ, sans setter/stack-trace (l'ancien watcher a fait planter le jeu).
  // On échantillonne .transparent/.side des matériaux biome à cadence contrôlée (pas chaque frame),
  // on n'écrit QU'UNE SEULE fois un résumé compact quand le buffer est plein — impossible de spammer.
  const _matDiagLog = [];
  let _matDiagPrevSnap = null;
  let _matDiagDone = false;
  let _matDiagSamples = 0;
  function checkBiomeMaterialFlicker() {
    if (_matDiagDone) return;
    const snap = debugBiomeMaterialSnapshot();
    _matDiagSamples++;
    if (snap !== _matDiagPrevSnap) {
      _matDiagLog.push(`f${shadowRefreshFrame}:${snap}`);
      _matDiagPrevSnap = snap;
    }
    // 2026-07-06 v2 — le premier seuil (1000 échantillons ≈ 50s) supposait une capture console
    // démarrée dès frame 0. En pratique le log fourni par l'utilisateur ne commence QUE vers la
    // frame 600 (l'outil de capture met du temps à s'attacher après le reload) : tout diagnostic
    // "une seule fois, tôt" est invisible. Seuil abaissé + déclenché aussi par le temps réel
    // écoulé (pas seulement le nombre d'appels) pour sortir un résultat même sur un test court.
    if (_matDiagLog.length >= 40 || _matDiagSamples >= 300) {
      _matDiagDone = true;
      // 2026-07-06 v3 — RAF-STALL/PROGRAM-CHURN (une seule ligne) apparaissent TOUJOURS dans les
      // exports de l'utilisateur ; MAT-SNAPSHOT-LOG/TRANSPARENT-USERS (multi-lignes, "\n" +
      // join('\n')) n'apparaissent JAMAIS malgré un code confirmé exécuté (aucune exception,
      // frames couvertes) — l'outil de capture de l'utilisateur semble perdre les messages
      // multi-lignes. On repasse en UNE SEULE ligne par message, comme les diagnostics qui marchent.
      console.warn(`[MAT-SNAPSHOT-LOG] ${_matDiagLog.length} changement(s) sur ${_matDiagSamples} échantillons || ` + _matDiagLog.join(' || '));
    }
  }

  // 2026-07-06 — [MAT-SNAPSHOT-LOG] a prouvé qu'un 2e jeu de matériaux biome transparents
  // (opacity != 1) apparaît une seule fois vers la frame 15, puis reste stable pour tout le
  // reste de la session — donc le PROGRAM-CHURN qui continue ensuite (~toutes les 51f, tout
  // au long du test) ne vient PAS d'un matériau qui change, mais d'un OBJET qui utilise ce
  // matériau transparent et qui est rendu/pas rendu de façon intermittente.
  // 2026-07-06 v2 — un déclenchement unique à frame===60 s'est révélé invisible : la capture
  // console de l'utilisateur démarre tard (log fourni commençait à la frame ~601). On répète
  // ce passage (borné à 5 fois max, tous les 200f) pour couvrir toute capture qui démarre en
  // retard, plutôt que de rater la fenêtre une fois de plus.
  let _findTransparentUserCount = 0;
  function findTransparentBiomeUsers() {
    if (_findTransparentUserCount >= 5) return;
    _findTransparentUserCount++;
    const hits = [];
    scene.traverse(o => {
      if (!o.isMesh || !o.material) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (m?.name?.startsWith('biome-') && m.transparent === true) {
          hits.push(`${o.name || '(sans nom)'} | parent=${o.parent?.name || '?'} | visible=${o.visible} | mat=${m.name} | opacity=${m.opacity}`);
        }
      }
    });
    console.warn(`[TRANSPARENT-USERS] frame=${shadowRefreshFrame} ${hits.length} objet(s) trouvé(s) || ` + hits.join(' || '));
  }
  warmUpAllPrograms('init');

  animate();

  function animate() {
    requestAnimationFrame(animate);

    // Diag pur (cf. déclaration _rafDelta plus haut) — écart réel entre deux frames,
    // indépendant de tout calcul GPU/JS : révèle les stalls de présentation/scheduling.
    // Gaté sous DEBUG_FLAGS.performance (2026-07-16) : aucun consommateur en dehors de ce
    // bloc et du log SCENE-DIAG plus bas (lui-même gaté) — pur diagnostic, zéro effet de bord.
    if (DEBUG_FLAGS.performance) {
      const _now = performance.now();
      if (_rafPrevTs !== null) {
        const _d = _now - _rafPrevTs;
        if (_d < _rafDeltaMin) _rafDeltaMin = _d;
        if (_d > _rafDeltaMax) _rafDeltaMax = _d;
        // 2026-07-05 — scanScene() écarté (0 occurrence SCANSCENE-DIAG, écart rAF inchangé).
        // Log direct de CHAQUE stall réel (>35ms) avec le contexte nécessaire pour trancher
        // entre "shadow map autoUpdate coûteux 1 frame/3" et "stall navigateur/OS externe au JS" :
        // %3 = cadence shadow refresh, visibilityState = onglet au premier plan ou non.
        if (_d > 35) {
          // %3 (shadow) écarté (2026-07-05, log précédent : les 3 valeurs 0/1/2 apparaissent
          // pour le stall, aucune corrélation). Prochaine piste testée ici sans nouvelle manip :
          // Garbage Collector JS. performance.memory (Chrome/Edge only) expose le tas JS utilisé —
          // si un GC majeur cause le stall, usedJSHeapSize doit chuter nettement pile à ce frame.
          const _mem = performance.memory
            ? ` heapMB=${(performance.memory.usedJSHeapSize / 1048576).toFixed(1)}`
            : ' heapMB=n/a(pas Chrome/Edge)';
          console.warn(`[RAF-STALL] frame=${shadowRefreshFrame} delta=${_d.toFixed(1)}ms | %3=${shadowRefreshFrame % 3} shadowAutoUpdate=${renderer.shadowMap.autoUpdate} visibility=${document.visibilityState} t=${(_now / 1000).toFixed(1)}s${_mem}`);
        }
      }
      _rafPrevTs = _now;
    }

    // ── PERF-TIMING : log toutes les 120 frames ─────────────────────────────
    const _PT_ENABLE = (shadowRefreshFrame % 120 === 1);
    let _pt0, _ptFlash, _ptCtrl, _ptAnim, _ptDecor, _ptSound, _ptRest;
    if (_PT_ENABLE) _pt0 = performance.now();

    // ── FLASH-DIAG frame-start ──────────────────────────────────────────────
    // Compare le nombre de Mesh visibles au début de CETTE frame avec la fin
    // de la PRÉCÉDENTE. Un pic ici = la visibilité a changé ENTRE deux frames
    // (hors de tout code JS contrôlé → Three.js interne ou autre).
    // NOTE: scene.traverse() ici coûte ~20-40ms/frame → exécuté 1×/120f seulement.
    // Gaté sous DEBUG_FLAGS.performance (2026-07-16) : pur diagnostic (_flashPrevVisCount
    // n'a aucun autre consommateur), le traverse() lui-même est le vrai coût à économiser.
    if (DEBUG_FLAGS.performance && shadowRefreshFrame % 120 === 0) {
      let _visNow = 0;
      scene.traverse(o => { if (o.isMesh && o.visible) _visNow++; });
      const _delta = _visNow - _flashPrevVisCount;
      if (_flashPrevVisCount >= 0 && Math.abs(_delta) > 20) {
        console.warn(`[FLASH-DIAG frame-start] SPIKE: ${_flashPrevVisCount} → ${_visNow} (${_delta > 0 ? '+' : ''}${_delta}) | frame=${shadowRefreshFrame} queueSize=${overlayRebuildQueue.size}`);
      }
      _flashPrevVisCount = _visNow;
    }
    if (_PT_ENABLE) _ptFlash = performance.now();
    // ───────────────────────────────────────────────────────────────────────

    controls.update();
    if (_PT_ENABLE) _ptCtrl = performance.now();

    const timeSeconds = performance.now() * 0.001;
    const deltaSeconds = _vfxPrevTimeSeconds == null ? 0 : Math.min(0.1, timeSeconds - _vfxPrevTimeSeconds);
    _vfxPrevTimeSeconds = timeSeconds;
    updateEnvironmentDirector(environmentDirector, timeSeconds);
    updateMorningMist(morningMistOverlay, environmentDirector, timeSeconds, deltaSeconds);
    updateWeatherVfxOverlay(weatherVfxOverlay, environmentDirector, timeSeconds, deltaSeconds);
    updateRainCloudOverlay(rainCloudOverlay, environmentDirector, timeSeconds, deltaSeconds);
    updateLightningOverlay(lightningOverlay, environmentDirector, rainCloudOverlay, placedTiles, timeSeconds, deltaSeconds);
    updateFireOverlay(fireOverlay, environmentDirector, placedTiles, timeSeconds, deltaSeconds);
    updateStormAmbience(scene, environmentDirector, deltaSeconds);
    updateAnimatedBiomeTextures(timeSeconds);
    updateGlobalWind(timeSeconds);
    updateRealisticWater(timeSeconds);
    updateSpecialCellsMeshAnimation(specialCellsMesh, timeSeconds);
    updateBonusCellsMeshAnimation(bonusCellsMesh, timeSeconds);
    updateBonusCellChestOverlay(bonusCellChestOverlay, timeSeconds);
    updateKeyboardUI(ui, controls.keys, rotationKeyActive, gridOnlyMode);
    updateHoverZoneOverlayAnimation(hoverZoneOverlay, waterZoneOverlay);
    updateRailTrainOverlay(railTrainOverlay, timeSeconds);
    updateWaterBoatOverlay(waterBoatOverlay, timeSeconds);
    updateHouseOverlay(houseOverlay, timeSeconds);
    updateSheepOverlay(sheepOverlay, timeSeconds);

    // Fumée volumétrique : mise à jour différée après le LOD (voir bloc % 9 ci-dessous)
    if (_PT_ENABLE) _ptAnim = performance.now();

    updateDecorOverlay(fieldWaterEffectsOverlay, timeSeconds, camera);
    if (_PT_ENABLE) _ptDecor = performance.now();

    if (!isSoleil) updateCometSky(cometSky, camera, timeSeconds);
    // Étoiles : visibles seulement la nuit (lune)
    {
      _starsRef = _sceneRef(_starsRef, 'hexistenz-distant-star-universe');
      if (_starsRef && _starsRef.visible !== !isSoleil) _starsRef.visible = !isSoleil;
    }
    {
      // Direction soleil : position de la lumière vers son target (normalisé).
      // Références mémoïsées + vecteur de travail réutilisé (plus de .clone() par frame).
      _sunLightRef  = _sceneRef(_sunLightRef,  'main-sun-shadow-light');
      _sunTargetRef = _sceneRef(_sunTargetRef, 'main-sun-shadow-target');
      const _sunDir = _sunLightRef && _sunTargetRef
        ? _sunDirScratch.copy(_sunLightRef.position).sub(_sunTargetRef.position).normalize()
        : null;
      updateCloudSky(cloudSky, { camera, timeSeconds, sunDir: _sunDir, enabled: isSoleil && getCloudUserEnabled() });
    }
    ambientSoundDesign.update(timeSeconds);
    if (_PT_ENABLE) _ptSound = performance.now();

    updateSunShadowOrbit(scene, timeSeconds, controls.target, camera.position.y);
    updateWorldCurvedSprites(scene);
    // curvature + shadowFlags : chaque passe coûte 40-55ms → réduit à 1×/120f (~2s @ 60fps).
    // Avant : 1×/20f = freeze de 50ms toutes les 333ms. Maintenant : 1×/2s.
    if ((shadowRefreshFrame++ % 120) === 0) {
      // Chronométré réellement (2026-07-05, cf. gpuProfiler.js) : jusqu'ici ce bloc n'était
      // que COMMENTÉ comme coûtant 40-55ms — jamais mesuré en direct. Le log permet de voir
      // dans F12 si CE bloc coïncide temporellement avec un pic GPU/FPS observé par ailleurs.
      const _t120 = performance.now();
      applySceneCurvatureFlags(scene);
      applySceneShadowFlags(scene);     // restaure castShadow (écrase le culling précédent)
      // Fix scintillement ombres : re-appliquer le culling immédiatement après la restauration
      // pour éviter la fenêtre ~120f où tous les casters distants sont actifs simultanément.
      const _shadowExtent120 = Math.max(8, Math.min(18, camera.position.y * 0.58));
      applyShadowCulling(controls.target, _shadowExtent120 * 1.5);
      visualEnvironment.apply();
      // Gaté sous DEBUG_FLAGS.performance (2026-07-16) — oublié lors de la phase 1 initiale,
      // pur diagnostic de timing, ne touche à aucun effet fonctionnel ci-dessus.
      if (DEBUG_FLAGS.performance) console.warn(`[TRAVERSE-DIAG 120f] curvature+shadowFlags+culling+env: ${(performance.now() - _t120).toFixed(1)}ms | frame=${shadowRefreshFrame}`);
      _gpuSpikeWatchUntilFrame = Math.max(_gpuSpikeWatchUntilFrame, shadowRefreshFrame + 20);
    }
    // rebuildShadowCasters : coûteux (20-25ms, scene.traverse), réduit à 1×/180f (~3s @ 60fps).
    if ((shadowRefreshFrame % 180) === 0) {
      const _t180 = performance.now();
      rebuildShadowCasters(scene);
      const _shadowExtent = Math.max(8, Math.min(18, camera.position.y * 0.58));
      applyShadowCulling(controls.target, _shadowExtent * 1.5);
      // Gaté sous DEBUG_FLAGS.performance (2026-07-16) — même oubli que le bloc 120f ci-dessus.
      if (DEBUG_FLAGS.performance) console.warn(`[TRAVERSE-DIAG 180f] rebuildShadowCasters+culling: ${(performance.now() - _t180).toFixed(1)}ms | frame=${shadowRefreshFrame}`);
      _gpuSpikeWatchUntilFrame = Math.max(_gpuSpikeWatchUntilFrame, shadowRefreshFrame + 20);
    }
    if ((shadowRefreshFrame % 9) === 0) {
      const lodFactor = computeLodHeightFactor(camera);
      updateForestLOD(forestOverlay, camera, lodFactor);
      updateFieldWheatLOD(fieldWheatOverlay, camera, lodFactor);
      updateGrassBladeLOD(grassBladeOverlay, camera, lodFactor);
      updateNaturalPropsLOD(fieldWaterEffectsOverlay, camera, lodFactor);
      updateFieldDecorLOD(fieldWaterEffectsOverlay, camera, lodFactor);
      updateWaterBoatLOD(waterBoatOverlay, camera, lodFactor);
      updateWaterSurfaceLOD(waterSurfaceOverlay, camera, lodFactor);
      updateRailTrainLOD(railTrainOverlay, camera, lodFactor);
      updateHouseLOD(houseOverlay, camera, lodFactor);
      updateCharacterLOD(characterOverlay, camera, lodFactor);
      updateBonusCellChestLOD(bonusCellChestOverlay, camera, lodFactor);
      updateSheepLOD(sheepOverlay, camera, lodFactor);
      updateZoneLabelLOD(waterZoneOverlay, camera, scene);
      updateBeachLOD(waterZoneOverlay, camera);
      // Rail track LOD — inline: scan placed tiles for rail track child meshes
      const railTrackDistSq = (LOD_RAIL_TRACK_CULL_DISTANCE * lodFactor) ** 2;
      // Paved road LOD — même patron, groupe village-stone-road-glb-network
      const pavedRoadDistSq = (LOD_PAVED_ROAD_CULL_DISTANCE * lodFactor) ** 2;
      // Terrain tile LOD — le rendu terrain est géré par terrainMergeGroup (frustumCulled=false).
      // Les tile groups restent visibles (pour les sub-meshes rail/route) mais leurs meshes
      // hex-sector-* / hex-center-* sont masqués par hideTerrainMeshes().
      // LOD rail track et route pavée : distance caméra uniquement.
      for (const placedTile of placedTiles.values()) {
        const mesh = placedTile.mesh;
        if (!mesh) continue;
        const distSq = camera.position.distanceToSquared(mesh.position);
        const railTrack = mesh.getObjectByName('procedural-volume-rail-track');
        if (railTrack) railTrack.visible = distSq < railTrackDistSq;
        const roadNet = mesh.getObjectByName('village-stone-road-glb-network');
        if (roadNet) roadNet.visible = distSq < pavedRoadDistSq;
      }
    }

    // Fumée volumétrique : exécuté APRÈS updateHouseLOD + updateRailTrainLOD (même frame)
    // → tileGroup.visible et train.object.visible sont à jour → pas de lag entre fumée et modèle.
    // 2026-07-16 — fix replay : ce bloc lisait TOUJOURS houseOverlay/railTrainOverlay (les
    // groupes RÉELS), même masqués pendant un replay — la fumée des maisons/trains réels
    // continuait donc d'apparaître bien avant que le replay ne révèle les maisons/rails
    // correspondants. Pendant un replay, on lit les positions dans les groupes PARALLÈLES
    // du replay à la place (mêmes noms d'objets internes, cf. replayEngine.js).
    {
      const _smokeHouseGroup = replayController.isOpen() ? replayController.getHouseGroup() : houseOverlay;
      const _smokeRailGroup  = replayController.isOpen() ? replayController.getRailGroup()  : railTrainOverlay;
      const _smokeLocos = getTrainLocoPositions(_smokeRailGroup);
      const _smokeSrcs  = [
        ..._smokeLocos,                        // locos en priorité — jamais évincées par le cap
        ...getHouseChimneyPositions(_smokeHouseGroup)
      ].slice(0, MAX_SMOKE_SOURCES);
      updateSmokeVolumePass(smokeVolumePass, _smokeSrcs, camera, _smokeLocos.length,
        postprocess.pixelPass.beautyRenderTarget.depthTexture);
    }

    // ── Modèles chargés async → rebuild via queue (LOD immédiat, évite le flash) ──
    if (forestOverlay.userData.pendingModelRebuild) {
      forestOverlay.userData.pendingModelRebuild = false;
      overlayRebuildQueue.set('forest', { rebuild: () => rebuildForestOverlay(forestOverlay, placedTiles), lod: () => updateForestLOD(forestOverlay, camera) });
    }
    if (railTrainOverlay.userData.pendingModelRebuild) {
      railTrainOverlay.userData.pendingModelRebuild = false;
      overlayRebuildQueue.set('rail', { rebuild: () => rebuildRailTrainOverlay(railTrainOverlay, placedTiles), lod: () => updateRailTrainLOD(railTrainOverlay, camera) });
    }
    if (fieldWaterEffectsOverlay.userData.pendingModelRebuild) {
      fieldWaterEffectsOverlay.userData.pendingModelRebuild = false;
      overlayRebuildQueue.set('decor', { rebuild: () => rebuildDecorOverlay(fieldWaterEffectsOverlay, placedTiles), lod: () => { updateNaturalPropsLOD(fieldWaterEffectsOverlay, camera); updateFieldDecorLOD(fieldWaterEffectsOverlay, camera); } });
      // Personnages : partagent propGlbLibrary avec le décor (characterOverlay.js n'a pas
      // son propre chargeur GLB) — même signal de disponibilité que 'decor' ci-dessus.
      // Au tout premier appel (boot), propGlbLibrary est encore vide : rebuildCharacterOverlay
      // dans rebuildInitialDerivedOverlays() ne pose donc aucune instance — ce rebuild différé,
      // une fois les GLB chargés, est ce qui peuple réellement l'overlay (même pattern déjà
      // en place pour forest/decor, cf. pendingModelRebuild).
      overlayRebuildQueue.set('character', { rebuild: () => rebuildCharacterOverlay(characterOverlay, placedTiles), lod: () => updateCharacterLOD(characterOverlay, camera) });
    }
    // ── Rebuilds différés : 1 overlay/frame — étale le travail lourd sans bloquer le RAF ──
    if (overlayRebuildQueue.size > 0) {
      const [[name, entry]] = overlayRebuildQueue;
      overlayRebuildQueue.delete(name);
      entry.rebuild();
      entry.lod?.(); // LOD immédiat → évite le pop-in des objets lointains recréés visibles=true
      // 2026-07-05 v2 — renderer.compile() crée/lie les NOUVEAUX programmes introduits par ce
      // rebuild (nécessaire — warmUpAllPrograms ne peut pas créer de programme, seulement
      // "chauffer" ceux qui existent déjà), MAIS ne déclenche pas à lui seul l'introspection
      // uniform/attribut (cf. lecture three.module.js : compile()→prepareMaterial()→getProgram()
      // n'appelle jamais getUniforms()). D'où le enchaînement des deux : compile() fait exister
      // le programme, warmUpAllPrograms() paie tout de suite son coût d'introspection, ici plutôt
      // que plus tard pendant le jeu.
      try {
        const _compileT0 = performance.now();
        // renderer.compile()/warmUpAllPrograms() restent TOUJOURS appelés (indispensables au
        // rendu correct des nouveaux objets du rebuild) — seul le console.warn de timing juste
        // en dessous est un pur diagnostic, gaté sous DEBUG_FLAGS.shaders (2026-07-16, phase 2).
        renderer.compile(scene, camera);
        warmUpAllPrograms(`rebuild:${name}`);
        const _compileMs = performance.now() - _compileT0;
        if (DEBUG_FLAGS.shaders && _compileMs > 1) console.warn(`[SHADER-PRECOMPILE] compile+warmup après rebuild "${name}": ${_compileMs.toFixed(1)}ms`);
      } catch (err) {
        // Laissé TOUJOURS actif (pas gaté) : signale un échec réel, pas un diagnostic de perf.
        console.warn('[SHADER-PRECOMPILE] échec (non bloquant):', err);
      }
    }

    // Shadow throttle : recalcul 1 frame sur 3 — entre deux updates la shadow map
    // précédente est réutilisée. Imperceptible en mouvement, économise ~66% du shadow pass.
    // Le culling persistant (applyShadowCulling dans le bloc 20-frames) réduit le nombre
    // de casters actifs → frames shadow moins coûteuses.
    renderer.shadowMap.autoUpdate = (shadowRefreshFrame % 3 === 0);

    if (_PT_ENABLE) _ptRest = performance.now();
    // 2026-07-06 v3 — [SHADER-WARMUP] ne loguait JAMAIS (0 occurrence) alors que [RAF-STALL]
    // continuait identique : le rendu organique gagne toujours la course contre un warmup toutes
    // les 120 frames (~2s) — un objet peut être dessiné pour la 1ère fois n'importe quelle frame
    // ENTRE deux passages du warmup, qui ne trouve donc plus rien à faire (déjà payé par le rendu
    // normal juste avant). Passage à CHAQUE frame, juste avant le rendu, pour de vrai devancer le
    // rendu organique — itérer ~155 programmes déjà compilés et rappeler un getter idempotent
    // doit rester sub-milliseconde si rien de neuf, donc sans risque à cette fréquence.
    warmUpAllPrograms('perframe');
    // checkProgramChurn() : gaté sous DEBUG_FLAGS.performance (2026-07-16, phase 1) — pur
    // diagnostic (Set de cacheKey, aucun effet de bord au-delà de lui-même).
    if (DEBUG_FLAGS.performance) checkProgramChurn();
    // checkBiomeMaterialFlicker()/findTransparentBiomeUsers() : gatés sous DEBUG_FLAGS.shaders
    // (2026-07-16, phase 2) — pur diagnostic (auto-limité en interne, aucun effet de bord).
    if (DEBUG_FLAGS.shaders && (shadowRefreshFrame % 3) === 0) checkBiomeMaterialFlicker();
    if (DEBUG_FLAGS.shaders && (shadowRefreshFrame % 200) === 60) findTransparentBiomeUsers();
    renderer.info.reset();   // reset unique avant toutes les passes (autoReset=false)
    postprocess.render();
    // Diag pur (cf. déclaration _diagTrianglesMin/Max plus haut) — lu juste après render()
    // pour capturer le nombre réel de triangles soumis cette frame, et le rayon caméra
    // (variation continue si le zoom est encore en cours d'amortissement).
    // Gaté sous DEBUG_FLAGS.performance (2026-07-16) — aucun consommateur en dehors du
    // log SCENE-DIAG/HEAP-DIAG plus bas, lui-même gaté.
    if (DEBUG_FLAGS.performance) {
      const _tris = renderer.info.render.triangles;
      if (_tris < _diagTrianglesMin) _diagTrianglesMin = _tris;
      if (_tris > _diagTrianglesMax) _diagTrianglesMax = _tris;
      const _rad = controls.spherical.radius;
      if (_rad < _diagRadiusMin) _diagRadiusMin = _rad;
      if (_rad > _diagRadiusMax) _diagRadiusMax = _rad;
      if (performance.memory) {
        const _heap = performance.memory.usedJSHeapSize / 1048576;
        if (_heap < _heapMin) _heapMin = _heap;
        if (_heap > _heapMax) _heapMax = _heap;
      }
    }
    // gpuMs : temps GPU réel (EXT_disjoint_timer_query_webgl2), asynchrone — begin/end posés
    // chaque frame dans postprocess.render() (threeSetup.js), résultat lu ici quand dispo
    // (peut dater de 1-3 frames, cf. gpuTimer.js). Remplace renderMs (soumission CPU
    // seule — cf. HUD FPS, 2026-07-04 : ce chrono ne reflétait pas le vrai temps GPU).
    // NOTE : _gpuMs/_gpuTimerSupported alimentent tickFps() (fonctionnel, HUD FPS) plus bas
    // — lecture NON gatée, coût négligeable (accesseurs), à ne jamais encadrer sous un flag.
    const _gpuMs = postprocess.getGpuMs?.() ?? null;
    const _gpuTimerSupported = postprocess.gpuTimerSupported ?? false;
    // 2026-07-05 — traque FRAME PAR FRAME (coût nul : juste une lecture de compteur) le
    // delta de renderer.info.memory.geometries pour identifier la PÉRIODICITÉ exacte de la
    // fuite (verrouillée sur %9 / %120 / %180, ou vraiment sur CHAQUE frame ?). Le format
    // %9/%120/%180 permet de recouper directement avec les blocs LOD/curvature/shadowCasters.
    // Gaté sous DEBUG_FLAGS.performance (2026-07-16) — pur diagnostic, _geoPrevCount n'a
    // aucun autre consommateur.
    if (DEBUG_FLAGS.performance) {
      if (_geoPrevCount === null) _geoPrevCount = renderer.info.memory.geometries;
      else {
        const _geoNow = renderer.info.memory.geometries;
        const _geoDelta = _geoNow - _geoPrevCount;
        if (_geoDelta !== 0) {
          console.log(`[GEO-DELTA] frame=${shadowRefreshFrame} delta=${_geoDelta > 0 ? '+' : ''}${_geoDelta} total=${_geoNow} | %9=${shadowRefreshFrame % 9} %120=${shadowRefreshFrame % 120} %180=${shadowRefreshFrame % 180}`);
        }
        _geoPrevCount = _geoNow;
      }
    }
    // Fenêtre de surveillance armée juste après une traversée périodique (cf. déclaration
    // _gpuSpikeWatchUntilFrame plus haut) — log brut, frame par frame, pas d'agrégat, pour
    // voir si le pic GPU colle exactement au frame de la traversée ou est indépendant.
    // Gaté sous DEBUG_FLAGS.performance (2026-07-16) — pur diagnostic.
    if (DEBUG_FLAGS.performance && shadowRefreshFrame <= _gpuSpikeWatchUntilFrame) {
      console.log(`[GPU-SPIKE-WATCH] frame=${shadowRefreshFrame} gpuMs=${_gpuMs != null ? _gpuMs.toFixed(2) : 'n/a'}`);
    }
    if (_PT_ENABLE) {
      const _ptEnd = performance.now();
      // tickFps() est fonctionnel (alimente le HUD FPS) — reste TOUJOURS appelé, flag ou pas.
      tickFps(renderer, scene, { jsMs: _ptRest - _pt0, renderMs: _ptEnd - _ptRest, gpuMs: _gpuMs, gpuTimerSupported: _gpuTimerSupported });
      // Tout ce qui suit (PERF-TIMING/SCENE-DIAG/HEAP-DIAG/HOVER-DIAG/GEO-CENSUS) est du pur
      // diagnostic — gaté sous DEBUG_FLAGS.performance (2026-07-16, phase 1).
      if (DEBUG_FLAGS.performance) {
        console.log(
          `[PERF-TIMING 120f] flash=${(_ptFlash-_pt0).toFixed(1)}ms` +
          ` | ctrl=${(_ptCtrl-_ptFlash).toFixed(1)}ms` +
          ` | anim=${(_ptAnim-_ptCtrl).toFixed(1)}ms` +
          ` | decor=${(_ptDecor-_ptAnim).toFixed(1)}ms` +
          ` | sound=${(_ptSound-_ptDecor).toFixed(1)}ms` +
          ` | rest+LOD=${(_ptRest-_ptSound).toFixed(1)}ms` +
          ` | render=${(_ptEnd-_ptRest).toFixed(1)}ms` +
          ` | TOTAL-JS=${(_ptEnd-_pt0).toFixed(1)}ms` +
          ` | GPU réel=${_gpuMs != null ? _gpuMs.toFixed(1) + 'ms' : 'n/a'}`
        );
        // ── Détail GPU par passe (2026-07-05) — cf. gpuProfiler.js. Contexte joint pour
        // corréler une passe qui grimpe avec ciel/nuages, altitude caméra ou cadence ombre :
        // c'est le point de départ pour trouver l'origine d'une oscillation GPU inexpliquée.
        postprocess.gpuProfiler?.report({
          camY: Number(camera.position.y.toFixed(2)),
          nuagesActifs: isSoleil && getCloudUserEnabled(),
          nuagesCouverture: getCloudSkyParams(cloudSky).coverage,
          ombreAutoUpdateCetteFrame: renderer.shadowMap.autoUpdate,
          frame: shadowRefreshFrame,
          'frame%3 (cadence ombre)': shadowRefreshFrame % 3,
          'frame%120 (curvature/shadowFlags/culling)': shadowRefreshFrame % 120,
          'frame%180 (rebuildShadowCasters)': shadowRefreshFrame % 180,
        });
        // Ligne dédiée (pas noyée dans l'objet contexte tronqué "{…}" par Chrome au copier-coller,
        // même piège que pour disjoint) — triangles/rayon caméra pour la piste "mouvement caméra",
        // écart rAF pour la piste "stall de présentation/scheduling" (cf. Gestionnaire des tâches
        // Windows 2026-07-05 : 21% GPU réel constaté pendant que le timer WebGL affiche 99%, et FPS
        // stable à 60 tout du long → signe fort que le timer mesure autre chose qu'un vrai calcul).
        console.log(
          `[SCENE-DIAG 120f] triangles ${_diagTrianglesMin}–${_diagTrianglesMax} | ` +
          `rayon caméra ${_diagRadiusMin.toFixed(3)}–${_diagRadiusMax.toFixed(3)} | ` +
          `écart rAF ${_rafDeltaMin.toFixed(1)}–${_rafDeltaMax.toFixed(1)}ms (attendu≈16.7)`
        );
        // Piste Garbage Collector JS (cf. [RAF-STALL]) : un dent-de-scie net (montée continue
        // puis chute brutale) sur cette fenêtre = signature classique d'un GC majeur qui bloque
        // le thread principal — expliquerait un stall invisible dans tout le JS qu'on mesure.
        if (Number.isFinite(_heapMin)) {
          console.log(`[HEAP-DIAG 120f] tas JS ${_heapMin.toFixed(1)}–${_heapMax.toFixed(1)}MB`);
        }
        // 2026-07-05 — diagnostic pur : le GPU-SPIKE-WATCH montre qu'une seule traversée
        // périodique (frame=721, curvature+shadowFlags+culling+env) a fait grimper le GPU réel
        // de ~15ms à un plateau soutenu de ~30-34ms sur 15+ frames — pas les autres occurrences
        // de la même fonction (frame=601, 841, 961 : bruit normal, pas de plateau). Un événement
        // qui ne se reproduit pas identiquement à chaque exécution de la MÊME fonction suggère un
        // état accumulé (fuite mémoire GPU : géométries/textures/programmes shader non libérés)
        // plutôt qu'un coût de calcul fixe. On logue ici les compteurs Three.js qui détecteraient
        // exactement ça — une croissance non bornée au fil de la session pointerait vers une fuite
        // dans applySceneCurvatureFlags/applySceneShadowFlags/applyShadowCulling/rebuildShadowCasters.
        console.log(
          `[MEMORY-DIAG 120f] géométries=${renderer.info.memory.geometries} | textures=${renderer.info.memory.textures} | programmes=${renderer.info.programs?.length ?? 'n/a'}`
        );
        // 2026-07-05 — vérifie le garde anti-thrash ajouté dans rebuildHoverZoneOverlay
        // (waterZoneOverlay.js) : appels = combien de fois controls.onHover a déclenché la
        // fonction (~fréquence mousemove) ; pleins = combien ont réellement reconstruit la
        // géométrie (signature de zone changée). Si "pleins" reste élevé même souris immobile
        // sur une même zone → le garde ne fonctionne pas comme prévu. Triangles = coût RENDU
        // (pas rebuild) du contour actuellement affiché — sépare "coût de reconstruction" de
        // "coût de dessin d'un contour déjà construit, chaque frame, tant qu'il reste visible".
        {
          const _hoverStats = getHoverRebuildStats();
          let _hoverTris = 0;
          hoverZoneOverlay.traverse(o => { if (o.isMesh && o.geometry?.index) _hoverTris += o.geometry.index.count / 3; });
          console.log(
            `[HOVER-DIAG 120f] appels=${_hoverStats.calls} pleins=${_hoverStats.full} | triangles contour actuel=${_hoverTris}`
          );
          resetHoverRebuildStats();
        }
        // 2026-07-05 — le hover est disculpé (pleins reste bas, géométries montent quand même,
        // linéairement, MÊME à pleins=0) : la fuite est ailleurs, continue, indépendante du survol.
        // Recensement : combien de géométries DISTINCTES sont actuellement attachées au graphe de
        // scène (vivantes, potentiellement visibles ou non) vs. le total compté par le renderer.
        // Si "orphelines" grossit au même rythme que le total → des objets sont créés PUIS retirés
        // de la scène sans jamais disposer leur géométrie (pattern effet transitoire). Si "vivantes"
        // grossit au même rythme → des meshes s'accumulent dans le graphe sans jamais être retirés.
        {
          const _liveGeo = new Set();
          scene.traverse(o => { if (o.geometry) _liveGeo.add(o.geometry.uuid); });
          const _total = renderer.info.memory.geometries;
          console.log(
            `[GEO-CENSUS 120f] vivantes(scene graph)=${_liveGeo.size} | total(renderer.info)=${_total} | orphelines=${_total - _liveGeo.size}`
          );
        }
      }
      // Reset pour la prochaine fenêtre de 120f (aligné sur le cycle de report ci-dessus).
      // Laissé inconditionnel : ces variables ne sont écrites que sous DEBUG_FLAGS.performance
      // désormais, donc déjà à Infinity/-Infinity quand le flag est désactivé — reset sans coût.
      _heapMin = Infinity; _heapMax = -Infinity;
      _diagTrianglesMin = Infinity; _diagTrianglesMax = -Infinity;
      _diagRadiusMin = Infinity; _diagRadiusMax = -Infinity;
      _rafDeltaMin = Infinity; _rafDeltaMax = -Infinity;
    } else {
      tickFps(renderer, scene, { gpuMs: _gpuMs, gpuTimerSupported: _gpuTimerSupported }); // lu APRÈS render → stats complètes de toutes les passes
    }
  }


  function handleWaterPointerDown(event) {
    const rect = canvas.getBoundingClientRect();
    waterClickPointer.x = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1;
    waterClickPointer.y = -(((event.clientY - rect.top) / Math.max(rect.height, 1)) * 2 - 1);

    waterClickRaycaster.setFromCamera(waterClickPointer, camera);
    const hits = waterClickRaycaster.intersectObjects(scene.children, true);

    for (const hit of hits) {
      const materials = Array.isArray(hit.object.material) ? hit.object.material : [hit.object.material];
      if (!materials.some(isRealisticWaterMaterial)) continue;
      triggerRealisticWaterRipple(hit.point, performance.now() * 0.001);
      return;
    }
  }

  function rebuildInitialDerivedOverlays() {
    rebuildWaterZoneOverlay(waterZoneOverlay, placedTiles);
    rebuildWaterSurfaceOverlay(waterSurfaceOverlay, placedTiles);
    applySceneCurvatureFlags(waterSurfaceOverlay);
    rebuildHoverZoneOverlay(hoverZoneOverlay, hoveredHex, null, placedTiles, waterZoneOverlay);
    rebuildRailTrainOverlay(railTrainOverlay, placedTiles);
    rebuildWaterBoatOverlay(waterBoatOverlay, placedTiles);
    resetPropHitboxRegistry();
    rebuildForestOverlay(forestOverlay, placedTiles);
    rebuildFieldWheatOverlay(fieldWheatOverlay, placedTiles);
    rebuildGrassBladeOverlay(grassBladeOverlay, placedTiles);
    rebuildHouseOverlay(houseOverlay, placedTiles);
    rebuildCharacterOverlay(characterOverlay, placedTiles);
    rebuildDecorOverlay(fieldWaterEffectsOverlay, placedTiles);
    rebuildSheepOverlay(sheepOverlay, placedTiles);
    // Nuages de pluie (metaballs) : recalculés à partir des tuiles posées — chaque tuile
    // a une chance déterministe (hashUtils) de porter un nuage. Marching cubes mis en
    // cache par seed → seule la 1re passe est coûteuse (~30 ms), les suivantes réutilisent.
    rebuildRainCloudOverlay(rainCloudOverlay, placedTiles);
  }

  function refreshDeckUI() {
    const displayDeck = deck.slice();
    if (displayDeck[0]) displayDeck[0] = rotateTile(displayDeck[0], rotationIndex);
    updateDeckUI(ui, displayDeck, placedTiles.size);
  }

  function isTextInputTarget(target) {
    if (!target) return false;
    const tagName = target.tagName?.toLowerCase();
    return tagName === 'input' || tagName === 'textarea' || target.isContentEditable;
  }

  function toggleHelp(forceVisible = null) {
    helpVisible = forceVisible ?? !helpVisible;
    setHelpVisible(ui, helpVisible);
    // 2026-07-29 — annonce vocale (TTS) "Aide en ligne" à l'OUVERTURE uniquement —
    // même choke point pour ESC, touche H, clic sur l'overlay et bouton fermer
    // (cf. les appelants de toggleHelp ci-dessous).
    if (helpVisible) announceHelpOpened();
  }

  /** Affiche "ESPACE pour sortir du monde super immersif" 5 secondes en haut de l'écran. */
  function _showSuperImmersifExitHint() {
    const existing = document.getElementById('superImmersifExitHint');
    if (existing) { clearTimeout(existing._timer); existing.remove(); }
    const el = document.createElement('div');
    el.id = 'superImmersifExitHint';
    el.textContent = _superImmersifExitHintText || 'ESPACE pour sortir du monde super immersif';
    Object.assign(el.style, {
      position:        'fixed',
      top:             '18px',
      left:            '50%',
      transform:       'translateX(-50%)',
      zIndex:          '9999',
      pointerEvents:   'none',
      fontFamily:      'inherit',
      fontSize:        '12px',
      fontWeight:      '700',
      letterSpacing:   '0.10em',
      textTransform:   'uppercase',
      color:           'rgba(255,240,190,0.92)',
      background:      'rgba(10,8,4,0.72)',
      padding:         '7px 18px',
      borderRadius:    '8px',
      border:          '1px solid rgba(255,220,120,0.25)',
      boxShadow:       '0 4px 16px rgba(0,0,0,0.5)',
      whiteSpace:      'nowrap',
      transition:      'opacity 0.5s',
      opacity:         '1',
    });
    document.body.appendChild(el);
    el._timer = setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 520);
    }, 4500);
  }

  function toggleGridOnlyMode(forceVisible = null) {
    gridOnlyMode = forceVisible ?? !gridOnlyMode;
    if (gridOnlyMode && helpVisible) {
      helpVisible = false;
      setHelpVisible(ui, false);
    }
    // En sortie d'immersif : retire aussi le super-immersif (huds-force-hidden)
    if (!gridOnlyMode) document.body.classList.remove('huds-force-hidden');
    setGridOnlyModeVisible(ui, gridOnlyMode);
    if (gridOnlyMode) {
      const fpsBtn = document.getElementById('fpsHudToggle');
      if (fpsBtn?.classList.contains('debug-light-toggle--fps-active')) fpsBtn.click();
      const lutRoot = document.getElementById('debugLightPanel');
      if (lutRoot && !lutRoot.classList.contains('collapsed')) {
        document.getElementById('debugLightToggle')?.click();
      }
    }
  }

  function setGridLabelVisibility(visible) {
    const apply = object => {
      object.traverse?.(child => {
        if (child.userData?.isValueLabel || child.name?.includes('zone-label')) child.visible = visible;
      });
    };

    for (const placedTile of placedTiles.values()) apply(placedTile.mesh);
    apply(ghostTile);
    apply(waterZoneOverlay);
    apply(hoverZoneOverlay);
  }

  function updateHover(hex, world) {
    if (isMultiplayer) sendCursorUpdate(hex);
    if (!hex) {
      updateHoveredSpecialCellVisibility(null);
      ghostTile.visible = false;
      setText(ui.placement, gameOver ? 'FIN DU DECK' : '-');
      return;
    }

    const position = axialToWorld(hex.q, hex.r);
    rebuildHoverZoneOverlay(hoverZoneOverlay, hex, world, placedTiles, waterZoneOverlay);

    if (!isPlacementTarget(hex)) {
      updateHoveredSpecialCellVisibility(null);
      ghostTile.visible = false;
      setText(ui.placement, gameOver ? 'FIN DU DECK' : '-');
      return;
    }

    updateHoveredSpecialCellVisibility(hex);

    const tile = rotateTile(deck[0], rotationIndex);
    const validation = getPlacementValidation(hex, placedTiles, tile, specialCells);
    rebuildGhost(position, tile, validation);
  }

  function placeTile(hex) {
    if (gameOver || deck.length === 0 || !isPlacementTarget(hex)) return;

    const key = makeHexKey(hex.q, hex.r);
    const position = axialToWorld(hex.q, hex.r);
    updateHoveredSpecialCellVisibility(hex);

    const tile = rotateTile(deck[0], rotationIndex);
    const validation = getPlacementValidation(hex, placedTiles, tile, specialCells);

    if (!validation.valid) {
      rebuildGhost(position, tile, validation);
      return;
    }
    const consumedSpecialCell = specialCells.get(key) ?? null;
    if (consumedSpecialCell) {
      specialCells.delete(key);
      removeSpecialCellMesh(specialCellsMesh, key);
      if (hiddenSpecialCellKey === key) hiddenSpecialCellKey = null;
    }

    const consumedBonusCell = bonusCells.get(key) ?? null;
    if (consumedBonusCell) {
      bonusCells.delete(key);
      removeBonusCellMesh(bonusCellsMesh, key);
      removeBonusCellChest(bonusCellChestOverlay, key);
    }

    const scoreResult = calculatePlacementScore(hex, placedTiles, tile, specialCells);
    const mesh = createPlacedTileMesh(tile, position);
    scene.add(mesh);

    const placedTile = {
      q: hex.q,
      r: hex.r,
      key,
      tile,
      mesh,
      score: scoreResult.total,
      bonusTilesAwarded: getBonusTilesAwarded(scoreResult),
      completedMissions: [],
      missionBonusTilesAwarded: 0,
      generatedMission: null,
      missionTurnBefore: missionManager.turn,
      purgedMissions: [],
      consumedSpecialCell,
      consumedBonusCell,
      // 2026-07-16 — feature replay (§21 CONTEXT.md, étape 0a) : identifie qui a posé cette
      // tuile (utile en multijoueur pour l'attribution pendant la relecture). `null` en solo
      // (playerId n'existe qu'en contexte multijoueur, cf. `const playerId = multiplayer?.playerId
      // ?? null` plus haut dans ce fichier) — pas un bug, juste l'absence de multi.
      playerId
    };

    const completedMissions = getCompletedMissions(missionManager, new Map([...placedTiles, [key, placedTile]]));
    const missionScore = completedMissions.length * MISSION_REWARD;
    const missionBonusTilesAwarded = completedMissions.length * MISSION_TILE_REWARD;
    placedTile.completedMissions = completedMissions;
    placedTile.missionBonusTilesAwarded = missionBonusTilesAwarded;
    const bonusCellScore = consumedBonusCell ? BONUS_CELL_SCORE : 0;
    placedTile.score = scoreResult.total + missionScore + bonusCellScore;
    consumeCompletedMissions(missionManager, completedMissions);
    totalScore += placedTile.score;

    placedTiles.set(key, placedTile);
    // Merge incrémental O(1) — ajoute uniquement la nouvelle tuile aux meshes fusionnés.
    // L'eau n'est plus fusionnée ici (rendue par waterSurfaceOverlay.js, contour
    // organique recalculé juste après) : plus besoin d'un rebuild complet du
    // terrain quand la tuile posée contient de l'eau.
    addTileToTerrainMerge(terrainMergeGroup, mesh);
    applySceneCurvatureFlags(terrainMergeGroup);
    placementHistory.push(placedTile);
    expandGridAroundPlacedTile(hex);
    // ── Rebuilds IMMÉDIATS : synchrones, légers, nécessaires pour le feedback visuel ──
    rebuildWaterZoneOverlay(waterZoneOverlay, placedTiles, hex);
    rebuildWaterSurfaceOverlay(waterSurfaceOverlay, placedTiles);
    applySceneCurvatureFlags(waterSurfaceOverlay);
    refreshGridAvailability();
    rebuildHoverZoneOverlay(hoverZoneOverlay, hoveredHex, null, placedTiles, waterZoneOverlay);
    resetPropHitboxRegistry(); // doit précéder les rebuilds props (forest/house/decor)

    // ── Rebuilds DIFFÉRÉS : conditionnels selon le type de la tuile posée ──────────────────────
    // Skip les overlays dont le contenu ne peut PAS changer quand ce type de tuile est posé.
    // Logique : chaque overlay ne dépend que des edges/center du tile concerné.
    // Exception conservatrice : field/house triggent aussi le rebuild forest (safe zones mills/church).
    const _tEdgeTypes = new Set(Object.values(tile.edges).map(e => getEdgeType(e)));
    const _needsRail   = _tEdgeTypes.has(EDGE_TYPES.rail);
    const _needsWater  = _tEdgeTypes.has(EDGE_TYPES.water);
    const _needsField  = _tEdgeTypes.has(EDGE_TYPES.field);
    const _needsGrass  = _tEdgeTypes.has(EDGE_TYPES.grass) || _tEdgeTypes.has(EDGE_TYPES.forest);
    const _needsHouse  = _tEdgeTypes.has(EDGE_TYPES.house);
    // Forest rebuild si : edge forest direct OU field/house (peuvent créer une safe zone moulin/église)
    const _needsForest = _tEdgeTypes.has(EDGE_TYPES.forest) || _needsField || _needsHouse;


    if (_needsRail)   overlayRebuildQueue.set('rail',   { rebuild: () => rebuildRailTrainOverlay(railTrainOverlay, placedTiles),   lod: () => updateRailTrainLOD(railTrainOverlay, camera) });
    if (_needsWater)  overlayRebuildQueue.set('boat',   { rebuild: () => rebuildWaterBoatOverlay(waterBoatOverlay, placedTiles),   lod: () => updateWaterBoatLOD(waterBoatOverlay, camera) });
    if (_needsField)  overlayRebuildQueue.set('wheat',  { rebuild: () => rebuildFieldWheatOverlay(fieldWheatOverlay, placedTiles), lod: () => updateFieldWheatLOD(fieldWheatOverlay, camera) });
    if (_needsGrass)  overlayRebuildQueue.set('grass',  { rebuild: () => rebuildGrassBladeOverlay(grassBladeOverlay, placedTiles),  lod: () => updateGrassBladeLOD(grassBladeOverlay, camera) });
    if (_tEdgeTypes.has(EDGE_TYPES.grass)) overlayRebuildQueue.set('sheep', { rebuild: () => rebuildSheepOverlay(sheepOverlay, placedTiles), lod: () => updateSheepLOD(sheepOverlay, camera) });
    if (_needsForest) overlayRebuildQueue.set('forest', { rebuild: () => rebuildForestOverlay(forestOverlay, placedTiles, placedTile), lod: () => updateForestLOD(forestOverlay, camera) });
    if (_needsHouse)  overlayRebuildQueue.set('house',  { rebuild: () => rebuildHouseOverlay(houseOverlay, placedTiles),           lod: () => updateHouseLOD(houseOverlay, camera) });
    // Personnages : mêmes conditions de déclenchement que forest (house/forest/field, cf. _needsForest).
    if (_needsForest) overlayRebuildQueue.set('character', { rebuild: () => rebuildCharacterOverlay(characterOverlay, placedTiles), lod: () => updateCharacterLOD(characterOverlay, camera) });
    // Décor incrémental : toujours exécuté (O(1), 28ms, gère tous les biomes).
    // rebuildDecorOverlay complet reste utilisé pour undo/init/applyRemoteGameState.
    overlayRebuildQueue.set('decor', { rebuild: () => addSingleTileToDecorOverlay(fieldWaterEffectsOverlay, placedTile, placedTiles), lod: () => { updateNaturalPropsLOD(fieldWaterEffectsOverlay, camera); updateFieldDecorLOD(fieldWaterEffectsOverlay, camera); } });

    ghostTile.visible = false;
    deck.shift();
    addBonusTiles(placedTile.bonusTilesAwarded + placedTile.missionBonusTilesAwarded);
    placedTile.purgedMissions = advanceMissionTurn(missionManager);
    rotationIndex = 0;
    refreshDeckUI();
    refreshGridAvailability();
    placedTile.generatedMission = maybeAddMissionForCurrentTile();
    refreshMissionUI();
    lastScore = placedTile.score;
    updateScoreUI(ui, totalScore, lastScore, placedTiles.size, totalGridTiles);
    showScorePopup(placedTile.score); // pose LOCALE validée uniquement — jamais dans updateScoreUI() (init/undo/sync/grille)
    // 2026-07-29 — séquence d'annonces vocales (TTS) pour ce tour : on coupe net toute
    // annonce laissée par un tour précédent (resetTtsQueue), puis on enchaîne dans l'ordre
    // points → mission(s) terminée(s) → nouvelle mission (speak() met en file, ne coupe plus
    // entre elles — cf. ttsAnnouncer.js). Chaque fonction est un no-op si rien à annoncer.
    resetTtsQueue();
    announcePoints(placedTile.score);
    announceMissionCompleted(completedMissions);
    announceNewMission(placedTile.generatedMission);
    refreshStatsUI();
    if (isMultiplayer) persistMultiplayerState();
    if (deck.length === 0) endGame();
  }

  function expandGridAroundPlacedTile(hex) {
    const added = ensureGridCellsAroundHex(gridOverlay, hex, 3);
    if (added <= 0) return;
    syncPlacementGridKeys();
    totalGridTiles = getGridCellCount(gridOverlay);
    applySceneCurvatureFlags(gridOverlay);
    updateScoreUI(ui, totalScore, lastScore, placedTiles.size, totalGridTiles);
  }

  function syncPlacementGridKeys() {
    setPlacementGridKeys(getGridKeys(gridOverlay));
  }

  function refreshMissionUI() {
    // Une mission réalisée disparaît IMMÉDIATEMENT du tableau "missions en cours"
    // (demande explicite, 2026-07-11 — auparavant grisée et visible encore quelques
    // tours). Le retrait différé (COMPLETED_MISSION_VISIBLE_TURNS, missions.js) reste
    // inchangé côté logique/undo : missionManager.active garde encore ces missions un
    // moment pour permettre restoreMissionSnapshots()/restoreMissions() lors d'un
    // undo — seul l'affichage les masque dès la complétion, via ce filtre.
    updateMissionUI(ui, missionManager.active.filter(m => !m.completed), formatMissionTitle, getMissionProgressByType(placedTiles));
  }

  // Le HUD missions n'est reconstruit que sur événement de jeu (pose de tuile,
  // undo, etc.) — jamais à chaque frame. Sans ce hook, changer de langue en
  // cours de partie laissait les titres de mission déjà affichés figés dans
  // l'ancienne langue jusqu'à la PROCHAINE pose (signalé par l'utilisateur le
  // 2026-07-13 : "certains textes du HUD missions ne sont pas traduits à la
  // volée"). formatMissionTitle lui-même est déjà réactif (MISSION_TITLES muté
  // en place, cf. missionLabels.js) — il ne manquait qu'un forçage du re-rendu.
  registerLangRefresh(refreshMissionUI);

  function getFullGameStats() {
    const stats = getGameStats(placedTiles);
    stats.cometHits = cometHits;
    return stats;
  }

  function refreshStatsUI() {
    const stats = getFullGameStats();
    updateStatsUI(ui, stats);
    // 2026-07-29 — annonces vocales (TTS) moulins/trains/bateaux/comètes : ne
    // parle que si un des 4 compteurs a changé depuis le dernier appel (cf.
    // ttsAnnouncer.js::announceStatsIfChanged, mémorise la valeur précédente).
    announceStatsIfChanged(stats);
  }

  function maybeAddMissionForCurrentTile() {
    return maybeGenerateMissionForTile(missionManager, deck[0], getMissionProgressByType(placedTiles));
  }

  function addBonusTiles(count) {
    for (let i = 0; i < count; i++) deck.push(createDeck(1)[0]);
  }

  function removeBonusTiles(count) {
    for (let i = 0; i < count && deck.length > 0; i++) deck.pop();
  }

  function rotateActiveTile(step) {
    const hasTarget = hoveredHex && isPlacementTarget(hoveredHex);

    rotationIndex = normalizeRotation(rotationIndex + step);
    setText(ui.rotation, `${rotationIndex}/6`);
    refreshDeckUI();
    refreshGridAvailability();

    if (hasTarget) {
      const position = axialToWorld(hoveredHex.q, hoveredHex.r);
      const tile = rotateTile(deck[0], rotationIndex);
      const validation = getPlacementValidation(hoveredHex, placedTiles, tile, specialCells);
      rebuildGhost(position, tile, validation);
    }
  }

  function refreshGridAvailability() {
    const currentTile = deck.length > 0 && !gameOver ? rotateTile(deck[0], rotationIndex) : null;
    updateGridAvailability(gridOverlay, placedTiles, currentTile, specialCells, getPlacementValidation);
  }

  function rebuildGhost(position, tile = rotateTile(deck[0], rotationIndex), validation = null) {
    const status = validation ?? getPlacementValidation(hoveredHex, placedTiles, tile, specialCells);

    ghostTile.clear();
    ghostTile.add(createTileMesh(tile, { opacity: 1, worldX: position.x, worldZ: position.z, previewWater: true }));
    ghostTile.add(createPlacementFeedbackOverlay(status));
    ghostTile.position.set(position.x, 0.003, position.z);

    // Le hover est reconstruit à chaque mouvement souris. En mode bouliste, si
    // on attend le balayage global périodique de la scène, l'hexagone vert/rouge
    // apparaît d'abord plat puis se courbe quelques frames plus tard : effet
    // visuel dégueulasse façon rustine posée après coup. On applique donc la
    // courbure immédiatement au sous-arbre fantôme fraîchement créé.
    applySceneCurvatureFlags(ghostTile);
    ghostTile.visible = true;

    setText(ui.placement, getPlacementLabel(status));
  }

  function updateHoveredSpecialCellVisibility(hex) {
    const key = hex ? makeHexKey(hex.q, hex.r) : null;
    const nextHiddenKey = key && specialCells.has(key) ? key : null;

    if (hiddenSpecialCellKey && hiddenSpecialCellKey !== nextHiddenKey) {
      setSpecialCellMeshVisible(hiddenSpecialCellKey, true);
    }

    if (nextHiddenKey) setSpecialCellMeshVisible(nextHiddenKey, false);
    hiddenSpecialCellKey = nextHiddenKey;
  }

  function setSpecialCellMeshVisible(key, visible) {
    const mesh = specialCellsMesh.children.find(child => child.userData?.specialCellKey === key);
    if (mesh) mesh.visible = visible;
  }

  function undoLastPlacement() {
    const last = placementHistory.pop();
    if (!last) return;

    gameOver = false;
    startIngameMusic();
    ui.abandonGame?.removeAttribute('disabled');
    scene.remove(last.mesh);
    last.mesh.traverse?.(object => {
      object.geometry?.dispose?.();
    });

    placedTiles.delete(last.key);
    rebuildTerrainMerge(terrainMergeGroup, placedTiles);
    applySceneCurvatureFlags(terrainMergeGroup);
    if (last.consumedSpecialCell) {
      specialCells.set(last.key, last.consumedSpecialCell);
      addSpecialCellMesh(specialCellsMesh, last.consumedSpecialCell);
      applySceneCurvatureFlags(specialCellsMesh);
    }
    if (last.consumedBonusCell) {
      bonusCells.set(last.key, last.consumedBonusCell);
      addBonusCellMesh(bonusCellsMesh, last.consumedBonusCell);
      applySceneCurvatureFlags(bonusCellsMesh);
      addBonusCellChest(bonusCellChestOverlay, last.consumedBonusCell);
      applySceneCurvatureFlags(bonusCellChestOverlay);
    }
    // ── Rebuilds IMMÉDIATS (undo : rebuild complet, pas de ciblage) ──────────────
    rebuildWaterZoneOverlay(waterZoneOverlay, placedTiles);
    rebuildWaterSurfaceOverlay(waterSurfaceOverlay, placedTiles);
    applySceneCurvatureFlags(waterSurfaceOverlay);
    rebuildHoverZoneOverlay(hoverZoneOverlay, hoveredHex, null, placedTiles, waterZoneOverlay);
    resetPropHitboxRegistry();
    updateHoveredSpecialCellVisibility(hoveredHex);

    // ── Rebuilds DIFFÉRÉS : {rebuild, lod} — lod() appliqué immédiatement pour éviter pop-in ──
    overlayRebuildQueue.set('rail',   { rebuild: () => rebuildRailTrainOverlay(railTrainOverlay, placedTiles),     lod: () => updateRailTrainLOD(railTrainOverlay, camera) });
    overlayRebuildQueue.set('boat',   { rebuild: () => rebuildWaterBoatOverlay(waterBoatOverlay, placedTiles),     lod: () => updateWaterBoatLOD(waterBoatOverlay, camera) });
    overlayRebuildQueue.set('wheat',  { rebuild: () => rebuildFieldWheatOverlay(fieldWheatOverlay, placedTiles),   lod: () => updateFieldWheatLOD(fieldWheatOverlay, camera) });
    overlayRebuildQueue.set('grass',  { rebuild: () => rebuildGrassBladeOverlay(grassBladeOverlay, placedTiles),   lod: () => updateGrassBladeLOD(grassBladeOverlay, camera) });
    overlayRebuildQueue.set('forest', { rebuild: () => rebuildForestOverlay(forestOverlay, placedTiles),           lod: () => updateForestLOD(forestOverlay, camera) });
    overlayRebuildQueue.set('house',  { rebuild: () => rebuildHouseOverlay(houseOverlay, placedTiles),             lod: () => updateHouseLOD(houseOverlay, camera) });
    overlayRebuildQueue.set('character', { rebuild: () => rebuildCharacterOverlay(characterOverlay, placedTiles), lod: () => updateCharacterLOD(characterOverlay, camera) });
    overlayRebuildQueue.set('decor',  { rebuild: () => rebuildDecorOverlay(fieldWaterEffectsOverlay, placedTiles), lod: () => { updateNaturalPropsLOD(fieldWaterEffectsOverlay, camera); updateFieldDecorLOD(fieldWaterEffectsOverlay, camera); } });
    overlayRebuildQueue.set('sheep',  { rebuild: () => rebuildSheepOverlay(sheepOverlay, placedTiles),             lod: () => updateSheepLOD(sheepOverlay, camera) });
    totalScore = Math.max(0, totalScore - (last.score ?? 0));

    if (last.generatedMission) removeMissionById(missionManager, last.generatedMission.id);
    restoreMissionSnapshots(missionManager, last.purgedMissions ?? []);
    restoreMissions(missionManager, last.completedMissions ?? []);
    setMissionTurn(missionManager, last.missionTurnBefore ?? missionManager.turn);
    removeBonusTiles((last.bonusTilesAwarded ?? 0) + (last.missionBonusTilesAwarded ?? 0));
    deck.unshift(last.tile);
    rotationIndex = 0;

    setText(ui.rotation, '0/6');
    refreshDeckUI();
    refreshGridAvailability();
    refreshMissionUI();
    lastScore = -(last.score ?? 0);
    updateScoreUI(ui, totalScore, lastScore, placedTiles.size, totalGridTiles);
    refreshStatsUI();
    if (isMultiplayer) persistMultiplayerState();

    if (hoveredHex && isPlacementTarget(hoveredHex)) {
      const position = axialToWorld(hoveredHex.q, hoveredHex.r);
      const tile = rotateTile(deck[0], rotationIndex);
      const validation = getPlacementValidation(hoveredHex, placedTiles, tile, specialCells);
      rebuildGhost(position, tile, validation);
    } else {
      ghostTile.visible = false;
      setText(ui.placement, '-');
    }
  }

  function isPlacementTarget(hex) {
    return !gameOver && deck.length > 0 && canPlaceTileAt(hex, placedTiles, null, specialCells);
  }

  function requestAbandonConfirm() {
    if (gameOver) return;
    ui.abandonConfirmModal?.classList.remove('hidden');
  }

  function cancelAbandonConfirm() {
    ui.abandonConfirmModal?.classList.add('hidden');
  }

  function abandonGame() {
    ui.abandonConfirmModal?.classList.add('hidden');
    if (gameOver) return;
    endGame('PARTIE ABANDONNÉE');
  }

  function startNewGame() {
    // Sans le query ?multi=... : une partie terminée/abandonnée ne peut plus être
    // reprise (cf. multiplayer.php::join_room), inutile de laisser traîner son code.
    window.location.href = window.location.pathname;
  }

  function endGame(label = 'FIN DU DECK') {
    gameOver = true;
    startEndingMusic();
    refreshGridAvailability();
    updateHoveredSpecialCellVisibility(null);
    ghostTile.visible = false;
    rebuildHoverZoneOverlay(hoverZoneOverlay, hoveredHex, null, placedTiles, waterZoneOverlay);
    ui.abandonGame?.setAttribute('disabled', 'disabled');
    setText(ui.placement, label);
    refreshStatsUI();
    // Marque la partie terminée côté serveur : plus jamais listée/rejoignable ensuite
    // (cf. multiplayer.php::list_room_details / join_room). Sans cet appel explicite,
    // gameOver=true ne serait jamais poussé au serveur (plus aucune pose après la fin).
    if (isMultiplayer) persistMultiplayerState();
    askHighscoreSubmit(highscoreUI, totalScore, getFullGameStats(), playerName);
  }

  function getGridPercent() {
    return totalGridTiles > 0 ? (placedTiles.size / totalGridTiles) * 100 : 0;
  }



  async function refreshMultiplayerRoom() {
    if (!isMultiplayer) return;
    try {
      const response = await pollRoom({ code: multiplayer.roomCode, playerId });
      const remoteState = response.room?.state ?? null;
      if (remoteState && Number(remoteState.stateVersion ?? 0) > localMultiplayerStateVersion) {
        applyRemoteGameState(remoteState);
      }
      renderRemoteCursors(response.room?.cursors ?? remoteState?.cursors ?? {});
    } catch (error) {
      console.warn('Échec polling multi', error);
    }
  }

  function renderRemoteCursors(cursors) {
    // 2026-07-05 — FUITE TROUVÉE : remoteGhosts.clear() est Object3D.clear() natif Three.js,
    // qui vide juste le tableau children SANS disposer géométrie/matériaux. Appelé toutes les
    // 900ms (setInterval refreshMultiplayerRoom) via createTileMesh() pour chaque curseur
    // distant → un tuile-mesh complet (dizaines de géométries) jeté sans dispose, en boucle
    // indéfiniment. Preuve : [GEO-DELTA] +127 géométries toutes les ~54 frames (~900ms @60fps),
    // et [GEO-CENSUS] montrait ces géométries totalement absentes du graphe de scène
    // (orphelines) — créées, affichées un instant, puis jetées sans libération.
    clearGroup(remoteGhosts);
    // 2026-07-06 — root cause du throttle GPU périodique (~51-54 frames, présent depuis le début
    // de l'enquête) : update_cursor() côté PHP (multiplayer.php) ajoutait un curseur par playerId
    // mais n'en supprimait jamais. room_SMALL.json en avait accumulé 21, certains vieux de +24
    // jours, tous "visible" pour toujours — chacun recrée un mesh de tuile transparent DoubleSide
    // toutes les 900ms (cf. setInterval refreshMultiplayerRoom). Fix serveur ajouté (purge par TTL
    // dans multiplayer.php), + ce filtre client en défense : ignore tout curseur silencieux >20s,
    // même si un vieux fichier de room n'a pas encore été nettoyé côté serveur.
    const _cursorTtlMs = 20000;
    const _cursorNow = Date.now();
    for (const [cursorPlayerId, cursor] of Object.entries(cursors ?? {})) {
      if (cursorPlayerId === playerId || !cursor?.visible || !cursor?.tile) continue;
      const _cursorAge = _cursorNow - Number(cursor.updatedAt ?? 0);
      if (!Number.isFinite(_cursorAge) || _cursorAge > _cursorTtlMs) continue;
      if (!Number.isFinite(Number(cursor.q)) || !Number.isFinite(Number(cursor.r))) continue;
      const position = axialToWorld(Number(cursor.q), Number(cursor.r));
      const mesh = createTileMesh(stripRuntimeTile(cursor.tile), { opacity: cursor.valid ? 0.42 : 0.22, worldX: position.x, worldZ: position.z, previewWater: true });
      mesh.position.set(position.x, 0.012, position.z);
      mesh.userData.remotePlayerName = cursor.playerName ?? cursorPlayerId;
      remoteGhosts.add(mesh);
    }
  }

  function sendCursorUpdate(hex) {
    if (!isMultiplayer) return;
    const tile = deck.length > 0 ? rotateTile(deck[0], rotationIndex) : null;
    const valid = Boolean(hex && tile && getPlacementValidation(hex, placedTiles, tile, specialCells).valid);
    const cursor = {
      type: 'cursor',
      visible: Boolean(hex),
      q: hex?.q ?? null,
      r: hex?.r ?? null,
      rotation: rotationIndex,
      tile: tile ? stripRuntimeTile(tile) : null,
      valid,
      playerName,
      roomCode: multiplayer.roomCode,
      playerId,
      updatedAt: Date.now()
    };

    // Anti-mitraillette : les mouvements souris peuvent déclencher des dizaines de POST/seconde.
    // Le serveur sait verrouiller, mais éviter de le noyer reste plus civilisé qu'un banquet de zombies.
    const signature = JSON.stringify({
      visible: cursor.visible,
      q: cursor.q,
      r: cursor.r,
      rotation: cursor.rotation,
      tileId: cursor.tile?.id ?? null,
      valid: cursor.valid
    });
    const now = performance.now();
    if (signature === lastMultiplayerCursorSignature && now - lastMultiplayerCursorSentAt < 180) return;
    if (signature !== lastMultiplayerCursorSignature || now - lastMultiplayerCursorSentAt >= 120) {
      lastMultiplayerCursorSignature = signature;
      lastMultiplayerCursorSentAt = now;
      updateCursor({ code: multiplayer.roomCode, playerId, cursor }).catch(error => console.warn('Échec curseur multi', error));
    }
  }

  function persistMultiplayerState() {
    if (!isMultiplayer || applyingRemoteState) return;
    localMultiplayerStateVersion += 1;
    updateRoomState({
      code: multiplayer.roomCode,
      playerId,
      state: serializeCurrentGameState()
    }).catch(error => console.warn('Échec sauvegarde multi', error));
  }


  function applyRemoteGameState(snapshot) {
    if (!isMultiplayer || !snapshot) return;
    applyingRemoteState = true;

    try {
      localMultiplayerStateVersion = Number(snapshot.stateVersion ?? localMultiplayerStateVersion);

      // ── Sync des tuiles : delta incrémental si possible ──────────────────────
      // Recréer 170 maillages = routes/rails de toutes les tuiles existantes
      // repassent visible=true → FLASH. On ne recrée QUE les tuiles nouvelles.
      const remotePlacedTiles = hydratePlacedTiles(snapshot.placedTiles);
      const _prevPlacedKeys   = new Set(placedTiles.keys());
      const _newKeys  = [...remotePlacedTiles.keys()].filter(k => !_prevPlacedKeys.has(k));
      const _goneKeys = [..._prevPlacedKeys]         .filter(k => !remotePlacedTiles.has(k));

      if (_goneKeys.length === 0) {
        // ── Chemin rapide : seulement des ajouts (cas habituel en multi) ──────
        for (const key of _newKeys) {
          const placedTile = remotePlacedTiles.get(key);
          const position = axialToWorld(placedTile.q, placedTile.r);
          const mesh = createPlacedTileMesh(placedTile.tile, position);
          placedTile.mesh = mesh;
          placedTiles.set(key, placedTile);
          scene.add(mesh);
          addTileToTerrainMerge(terrainMergeGroup, mesh);
          applySceneCurvatureFlags(mesh);
          ensureGridCellsAroundHex(gridOverlay, placedTile, 3);
        }
      } else {
        // ── Chemin complet : tuiles retirées (undo, réinitialisation) ────────
        for (const placedTile of placedTiles.values()) {
          if (placedTile.mesh) { scene.remove(placedTile.mesh); disposeObject(placedTile.mesh); }
        }
        placedTiles.clear();
        for (const [key, placedTile] of remotePlacedTiles.entries()) {
          const position = axialToWorld(placedTile.q, placedTile.r);
          const mesh = createPlacedTileMesh(placedTile.tile, position);
          placedTile.mesh = mesh;
          placedTiles.set(key, placedTile);
          scene.add(mesh);
        }
        rebuildTerrainMerge(terrainMergeGroup, placedTiles);
        applySceneCurvatureFlags(terrainMergeGroup);
        for (const placedTile of placedTiles.values()) ensureGridCellsAroundHex(gridOverlay, placedTile, 3);
      }
      syncPlacementGridKeys();
      totalGridTiles = getGridCellCount(gridOverlay);
      applySceneCurvatureFlags(gridOverlay);

      specialCells.clear();
      const remoteSpecialCells = hydrateCellMap(snapshot.specialCells) ?? new Map();
      for (const [key, cell] of remoteSpecialCells.entries()) specialCells.set(key, cell);
      rebuildCellMeshGroup(specialCellsMesh, specialCells, addSpecialCellMesh);
      applySceneCurvatureFlags(specialCellsMesh);

      bonusCells.clear();
      const remoteBonusCells = hydrateCellMap(snapshot.bonusCells) ?? new Map();
      for (const [key, cell] of remoteBonusCells.entries()) bonusCells.set(key, cell);
      rebuildCellMeshGroup(bonusCellsMesh, bonusCells, addBonusCellMesh);
      applySceneCurvatureFlags(bonusCellsMesh);
      rebuildBonusCellChestOverlay(bonusCellChestOverlay, bonusCells);
      applySceneCurvatureFlags(bonusCellChestOverlay);

      const remoteDeck = hydratePlayerDeck(snapshot, playerId);
      if (remoteDeck) deck.splice(0, deck.length, ...remoteDeck);

      const remoteMissionManager = hydrateMissionManager(snapshot.missionManager);
      if (remoteMissionManager) {
        missionManager.active.splice(0, missionManager.active.length, ...remoteMissionManager.active);
        missionManager.generatedTileIds = remoteMissionManager.generatedTileIds;
        missionManager.targetLevelByType = remoteMissionManager.targetLevelByType;
        missionManager.nextId = remoteMissionManager.nextId;
        missionManager.turn = remoteMissionManager.turn;
      }

      placementHistory.splice(0, placementHistory.length);
      const remotePlacementHistory = Array.isArray(snapshot.placementHistory)
        ? snapshot.placementHistory
        : [];
      for (const historyItem of remotePlacementHistory) {
        const historyKey = historyItem?.key ?? makeHexKey(historyItem?.q, historyItem?.r);
        const placedTile = placedTiles.get(historyKey);
        if (placedTile) placementHistory.push(placedTile);
      }
      totalScore = Number(snapshot.totalScore ?? 0);
      lastScore = Number(snapshot.lastScore ?? getLastPlacementScore(placementHistory));
      gameOver = Boolean(snapshot.gameOver);
      if (gameOver) startEndingMusic();
      else startIngameMusic();
      rotationIndex = Number(snapshot.players?.[playerId]?.rotationIndex ?? rotationIndex ?? 0);

      // ── Calculer le delta pour choisir rebuild incrémental vs complet ──────────
      const _addedKeys = [];
      for (const key of placedTiles.keys()) { if (!_prevPlacedKeys.has(key)) _addedKeys.push(key); }
      const _removedCount = [..._prevPlacedKeys].filter(k => !placedTiles.has(k)).length;
      // Incrémental possible seulement si exactement 1 tuile ajoutée, aucune retirée
      const _singleTileSync = _addedKeys.length === 1 && _removedCount === 0;
      const _newTile = _singleTileSync ? placedTiles.get(_addedKeys[0]) : null;

      rebuildWaterZoneOverlay(waterZoneOverlay, placedTiles);
      rebuildWaterSurfaceOverlay(waterSurfaceOverlay, placedTiles);
      applySceneCurvatureFlags(waterSurfaceOverlay);
      rebuildHoverZoneOverlay(hoverZoneOverlay, hoveredHex, null, placedTiles, waterZoneOverlay);
      // ⚠️ Tous les overlays via queue → LOD immédiat, évite le flash (visible=true hors RAF)
      // Optimisation : si aucune tuile n'a changé (sync no-op — le joueur a déjà appliqué
      // la tuile localement avant que le poll retourne son propre état sauvegardé), on skip
      // tous les rebuilds d'overlays. Deck/score/missions sont déjà mis à jour ci-dessus.
      if (_addedKeys.length > 0 || _removedCount > 0) {
        // 2026-07-30 (merge Cyril) — CORRECTIF hors périmètre feu, bug préexistant : ce reset
        // était appelé à CHAQUE poll de synchro, alors que les rebuilds qui repeuplent le
        // registre sont conditionnels (ce bloc). Résultat mesuré : 0 hitbox sur 225 tuiles en
        // partie multi au repos. Conséquence au-delà du feu — tryResolve() était aveugle, les
        // props « mous » (tonneaux, charrettes, bancs, panneaux) pouvaient se placer en
        // chevauchant maisons et arbres. Doit rester DANS le bloc conditionnel, juste avant
        // les rebuilds de props (forest/house/decor) qui le repeuplent.
        resetPropHitboxRegistry();
        overlayRebuildQueue.set('boat',   { rebuild: () => rebuildWaterBoatOverlay(waterBoatOverlay, placedTiles),     lod: () => updateWaterBoatLOD(waterBoatOverlay, camera) });
        overlayRebuildQueue.set('wheat',  { rebuild: () => rebuildFieldWheatOverlay(fieldWheatOverlay, placedTiles),   lod: () => updateFieldWheatLOD(fieldWheatOverlay, camera) });
        overlayRebuildQueue.set('grass',  { rebuild: () => rebuildGrassBladeOverlay(grassBladeOverlay, placedTiles),   lod: () => updateGrassBladeLOD(grassBladeOverlay, camera) });
        overlayRebuildQueue.set('house',  { rebuild: () => rebuildHouseOverlay(houseOverlay, placedTiles),             lod: () => updateHouseLOD(houseOverlay, camera) });
        overlayRebuildQueue.set('character', { rebuild: () => rebuildCharacterOverlay(characterOverlay, placedTiles), lod: () => updateCharacterLOD(characterOverlay, camera) });
        overlayRebuildQueue.set('rail',   { rebuild: () => rebuildRailTrainOverlay(railTrainOverlay, placedTiles),     lod: () => updateRailTrainLOD(railTrainOverlay, camera) });
        overlayRebuildQueue.set('sheep',  { rebuild: () => rebuildSheepOverlay(sheepOverlay, placedTiles),             lod: () => updateSheepLOD(sheepOverlay, camera) });
        // Forest + Décor : incrémental si 1 seule tuile ajoutée, complet si multi-tuiles
        if (_singleTileSync && _newTile) {
          overlayRebuildQueue.set('forest', { rebuild: () => rebuildForestOverlay(forestOverlay, placedTiles, _newTile), lod: () => updateForestLOD(forestOverlay, camera) });
          overlayRebuildQueue.set('decor', { rebuild: () => addSingleTileToDecorOverlay(fieldWaterEffectsOverlay, _newTile, placedTiles), lod: () => { updateNaturalPropsLOD(fieldWaterEffectsOverlay, camera); updateFieldDecorLOD(fieldWaterEffectsOverlay, camera); } });
        } else {
          overlayRebuildQueue.set('forest', { rebuild: () => rebuildForestOverlay(forestOverlay, placedTiles),           lod: () => updateForestLOD(forestOverlay, camera) });
          overlayRebuildQueue.set('decor', { rebuild: () => rebuildDecorOverlay(fieldWaterEffectsOverlay, placedTiles), lod: () => { updateNaturalPropsLOD(fieldWaterEffectsOverlay, camera); updateFieldDecorLOD(fieldWaterEffectsOverlay, camera); } });
        }
      }
      refreshDeckUI();
      refreshGridAvailability();
      refreshMissionUI();
      updateScoreUI(ui, totalScore, lastScore, placedTiles.size, totalGridTiles);
      refreshStatsUI();
      setText(ui.rotation, `${rotationIndex}/6`);

      if (hoveredHex && isPlacementTarget(hoveredHex)) {
        updateHover(hoveredHex, axialToWorld(hoveredHex.q, hoveredHex.r));
      } else {
        ghostTile.visible = false;
      }
    } finally {
      applyingRemoteState = false;
    }
  }

  function rebuildCellMeshGroup(group, cells, addMesh) {
    group.clear();
    for (const cell of cells.values()) addMesh(group, cell);
  }

  function disposeObject(object) {
    object.traverse?.(child => {
      child.geometry?.dispose?.();
      if (Array.isArray(child.material)) child.material.forEach(material => material.dispose?.());
      else child.material?.dispose?.();
    });
  }

  function serializeCurrentGameState() {
    const players = { ...(initialState?.players ?? {}) };
    players[playerId] = {
      ...(players[playerId] ?? {}),
      id: playerId,
      name: playerName,
      deck: deck.map(stripRuntimeTile),
      rotationIndex,
      lastSeen: Date.now()
    };

    return {
      schemaVersion: 1,
      roomCode: multiplayer.roomCode,
      updatedAt: Date.now(),
      stateVersion: localMultiplayerStateVersion,
      totalScore,
      lastScore,
      rotationIndex,
      gameOver,
      placedTiles: [...placedTiles.values()].map(serializePlacedTile),
      placementHistory: placementHistory.map(serializePlacedTile),
      specialCells: [...specialCells.values()].map(clonePlain),
      bonusCells: [...bonusCells.values()].map(clonePlain),
      missionManager: serializeMissionManager(missionManager),
      players,
      stats: getFullGameStats()
    };
  }

}



function getLastPlacementScore(placementHistory) {
  const lastPlacedTile = placementHistory?.[placementHistory.length - 1];
  return Number(lastPlacedTile?.score ?? 0);
}

function hydrateCellMap(cells) {
  if (!Array.isArray(cells)) return null;
  return new Map(cells.filter(Boolean).map(cell => [cell.key ?? makeHexKey(cell.q, cell.r), { ...cell, key: cell.key ?? makeHexKey(cell.q, cell.r) }]));
}

function hydratePlacedTiles(tiles) {
  const map = new Map();
  if (!Array.isArray(tiles)) return map;
  for (const item of tiles) {
    if (!item || !item.tile) continue;
    const key = item.key ?? makeHexKey(item.q, item.r);
    map.set(key, {
      ...item,
      key,
      tile: stripRuntimeTile(item.tile),
      mesh: null,
      completedMissions: item.completedMissions ?? [],
      purgedMissions: item.purgedMissions ?? []
    });
  }
  return map;
}

function hydratePlayerDeck(state, playerId) {
  const playerDeck = playerId ? state?.players?.[playerId]?.deck : null;
  const fallbackDeck = state?.deck;
  const deck = Array.isArray(playerDeck) ? playerDeck : (Array.isArray(fallbackDeck) ? fallbackDeck : null);
  return deck ? deck.map(stripRuntimeTile) : null;
}

function hydrateMissionManager(snapshot) {
  if (!snapshot) return null;
  return {
    active: Array.isArray(snapshot.active) ? snapshot.active.map(clonePlain) : [],
    generatedTileIds: new Set(snapshot.generatedTileIds ?? []),
    targetLevelByType: new Map(Object.entries(snapshot.targetLevelByType ?? {})),
    nextId: Number(snapshot.nextId ?? 1),
    turn: Number(snapshot.turn ?? 0)
  };
}

// 2026-07-16 — feature replay, étape 0b (cf. CONTEXT.md §21) : extrait le sous-ensemble
// STRICTEMENT identique entre placeTile() (pose locale) et applyRemoteGameState() (sync
// multijoueur, chemins incrémental ET complet) — création du mesh + positionnement +
// masquage du terrain natif (`hideTerrainMeshes`, le rendu réel passe par
// `terrainMergeGroup`). Volontairement PAS étendu à `addTileToTerrainMerge`/
// `applySceneCurvatureFlags`/extension de grille : ces étapes divergent légèrement entre
// les deux call sites (cible de la courbure, mécanisme d'expansion de grille) — les fusionner
// aurait été un risque de régression pour un gain de factorisation marginal. Ce helper sera
// le 3ᵉ point d'entrée (replay) une fois l'étape 3 du chantier replay implémentée.
function createPlacedTileMesh(tile, position) {
  const mesh = createTileMesh(tile, { worldX: position.x, worldZ: position.z });
  mesh.position.set(position.x, 0.003, position.z);
  hideTerrainMeshes(mesh); // Terrain géré par terrainMergeGroup
  return mesh;
}

function serializePlacedTile(placedTile) {
  return {
    q: placedTile.q,
    r: placedTile.r,
    key: placedTile.key,
    tile: stripRuntimeTile(placedTile.tile),
    score: placedTile.score ?? 0,
    bonusTilesAwarded: placedTile.bonusTilesAwarded ?? 0,
    completedMissions: (placedTile.completedMissions ?? []).map(clonePlain),
    missionBonusTilesAwarded: placedTile.missionBonusTilesAwarded ?? 0,
    generatedMission: placedTile.generatedMission ? clonePlain(placedTile.generatedMission) : null,
    missionTurnBefore: placedTile.missionTurnBefore ?? 0,
    purgedMissions: (placedTile.purgedMissions ?? []).map(clonePlain),
    consumedSpecialCell: placedTile.consumedSpecialCell ? clonePlain(placedTile.consumedSpecialCell) : null,
    consumedBonusCell: placedTile.consumedBonusCell ? clonePlain(placedTile.consumedBonusCell) : null,
    // 2026-07-16 — feature replay, étape 0a (cf. CONTEXT.md §21) : propagé tel quel dans le
    // round-trip JSON multijoueur (hydratePlacedTiles() spread déjà ...item, donc pas de
    // changement à faire côté hydratation) — et futur point d'entrée pour l'attribution
    // par joueur pendant la relecture.
    playerId: placedTile.playerId ?? null
  };
}

function stripRuntimeTile(tile) {
  return clonePlain({
    id: tile.id,
    edges: tile.edges,
    center: tile.center,
    rotation: tile.rotation ?? 0
  });
}

function createMultiplayerBadge(roomCode, playerName) {
  const info = document.getElementById('multiplayerInfo');
  if (!info) return;
  const roomEl = document.getElementById('multiRoomCode');
  const playerEl = document.getElementById('multiPlayerName');
  if (roomEl) roomEl.textContent = roomCode;
  if (playerEl) playerEl.textContent = playerName;
  info.removeAttribute('hidden');
}

function getTotalGridTiles(radius) {
  return 1 + 3 * radius * (radius + 1);
}
