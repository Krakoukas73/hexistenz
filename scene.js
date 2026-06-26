import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { DECK_SIZE, GRID_RADIUS, COMET_HIT_SCORE, LOD_RAIL_TRACK_CULL_DISTANCE, LOD_PAVED_ROAD_CULL_DISTANCE } from './config.js';
import { EDGE_TYPES } from './variables.js';
import { WORLD_CURVATURE } from './stable/worldCurvature.js';
import { CameraControls } from './stable/controls.js';
import { createGrid, ensureGridCellsAroundHex, getGridCellCount, getGridKeys, updateGridAvailability } from './stable/grid.js';
import { addSpecialCellMesh, createSpecialCells, createSpecialCellsMesh, removeSpecialCellMesh, updateSpecialCellsMeshAnimation } from './stable/specialCells.js';
import { BONUS_CELL_SCORE, addBonusCellMesh, createBonusCells, createBonusCellsMesh, removeBonusCellMesh, updateBonusCellsMeshAnimation } from './stable/bonusCells.js';
import { axialToWorld, makeHexKey } from './stable/hex.js';
import { createTileMesh } from './tileMesh.js';
import { updateAnimatedBiomeTextures } from './tileTextures.js';
import { isRealisticWaterMaterial, triggerRealisticWaterRipple, updateRealisticWater } from './realisticWater.js';
import { canPlaceTileAt, getPlacementValidation, setPlacementGridKeys } from './stable/placementRules.js';
import { calculatePlacementScore } from './stable/scoring.js';
import { createDeck, getEdgeType, rotateTile } from './tileGenerator.js';
import { createUI, setGridOnlyModeVisible, setHelpVisible, setText, updateDeckUI, updateKeyboardUI, updateMissionUI, updateScoreUI, updateStatsUI } from './ui.js';
import { createPlacementFeedbackOverlay, getPlacementLabel } from './stable/placementOverlay.js';
import { createHoverZoneOverlay, createWaterZoneOverlay, rebuildHoverZoneOverlay, rebuildWaterZoneOverlay, updateHoverZoneOverlayAnimation, updateZoneLabelLOD, updateBeachLOD } from './waterZoneOverlay.js';
import { createRailTrainOverlay, rebuildRailTrainOverlay, updateRailTrainOverlay, updateRailTrainLOD } from './railTrainOverlay.js';
import { createWaterBoatOverlay, rebuildWaterBoatOverlay, updateWaterBoatOverlay, updateWaterBoatLOD } from './waterBoatOverlay.js';
import { createForestOverlay, rebuildForestOverlay, updateForestLOD } from './forestOverlay.js';
import { createFieldWheatOverlay, rebuildFieldWheatOverlay, updateFieldWheatLOD } from './fieldWheatOverlay.js';
import { createHouseOverlay, rebuildHouseOverlay, updateHouseOverlay, updateHouseLOD } from './houseOverlay.js';
import { addSingleTileToDecorOverlay, createDecorOverlay, rebuildDecorOverlay, updateDecorOverlay, updateNaturalPropsLOD, updateFieldDecorLOD, computeLodHeightFactor } from './decorOverlay.js';
import { addBonusCellChest, createBonusCellChestOverlay, rebuildBonusCellChestOverlay, removeBonusCellChest, updateBonusCellChestOverlay, updateBonusCellChestLOD } from './bonusCellChestOverlay.js';
import { createAmbientSoundDesign, startEndingMusic, startIngameMusic, toggleMute } from './soundDesign.js';
import { createVisualEnvironment } from './visualEnvironment.js';
import { createCometSky, updateCometSky, tryCometHit, removeCometFromSky, spawnCometExplosion } from './stable/cometSky.js';
import { updateGlobalWind } from './stable/globalWind.js';
import { resetPropHitboxRegistry } from './stable/propHitboxRegistry.js';
import { createDebugLightUI, tickFps } from './debugLightUi.js';
import { askHighscoreSubmit, createHighscoreUI } from './stable/highscore.js';
import { applySceneCurvatureFlags, applySceneEnvironment, applySceneShadowFlags, createCamera, createPixelPostprocess, createRenderer, createThreeScene, resizeRenderer, updateSunShadowOrbit, updateWorldCurvedSprites } from './stable/threeSetup.js';
import { applyShadowCulling, rebuildShadowCasters } from './stable/shadowCulling.js';
import { addTileToTerrainMerge, createTerrainMergeGroup, hideTerrainMeshes, rebuildTerrainMerge } from './stable/terrainMerge.js';
import { createPostprocessHud } from './stable/postprocessHud.js';
import { getBonusTilesAwarded, normalizeRotation } from './stable/gameRules.js';
import { MISSION_REWARD, MISSION_TILE_REWARD, advanceMissionTurn, consumeCompletedMissions, createMissionManager, formatMissionLabel, getCompletedMissions, getGameStats, getMissionProgressByType, maybeGenerateMissionForTile, removeMissionById, restoreMissionSnapshots, restoreMissions, setMissionTurn } from './missions.js';
import { pollRoom, updateCursor, updateRoomState } from './stable/multiplayerClient.js';

export function initScene(options = {}) {
  const canvas = document.getElementById('app');
  const renderer = createRenderer(canvas);
  const scene = createThreeScene();
  applySceneEnvironment(scene, renderer); // Strategy B : env map IBL partagée
  const camera = createCamera();
  const postprocess = createPixelPostprocess(renderer, scene, camera);
  const visualEnvironment = createVisualEnvironment(scene, renderer);
  createDebugLightUI({ visualEnvironment, postprocess });
  const controls = new CameraControls(camera, canvas);
  const ui = createUI();
  const highscoreUI = createHighscoreUI(ui);
  createPostprocessHud(postprocess, { worldShapeMode: options.worldShapeMode });

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

  const placedTiles = hydratePlacedTiles(initialState?.placedTiles);
  const specialCells = hydrateCellMap(initialState?.specialCells) ?? createSpecialCells();
  const bonusCells = hydrateCellMap(initialState?.bonusCells) ?? createBonusCells(new Set(specialCells.keys()));
  const specialCellsMesh = createSpecialCellsMesh(specialCells);
  const bonusCellsMesh = createBonusCellsMesh(bonusCells);
  const placementHistory = [];
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
  const waterClickRaycaster = new THREE.Raycaster();
  const waterClickPointer = new THREE.Vector2();
  let totalGridTiles = getTotalGridTiles(GRID_RADIUS);

  // Tuile fantôme et overlays : feedback visuel, aucun impact sur les règles.
  const ghostTile = new THREE.Group();
  const remoteGhosts = new THREE.Group();
  remoteGhosts.name = 'multiplayer-remote-ghosts';
  const waterZoneOverlay = createWaterZoneOverlay();
  const hoverZoneOverlay = createHoverZoneOverlay();
  const railTrainOverlay = createRailTrainOverlay();
  const waterBoatOverlay = createWaterBoatOverlay();
  const forestOverlay = createForestOverlay();
  const fieldWheatOverlay = createFieldWheatOverlay();
  const houseOverlay = createHouseOverlay();
  const fieldWaterEffectsOverlay = createDecorOverlay();
  const bonusCellChestOverlay = createBonusCellChestOverlay();
  const cometSky = createCometSky();
  // File de rebuild différé : Map<name, {rebuild, lod}> — coalescing automatique (dernier écrase).
  // 1 overlay/frame dans animate() : rebuild() puis lod() immédiat pour éviter pop-in et flash labels.
  const overlayRebuildQueue = new Map();
  const ambientSoundDesign = createAmbientSoundDesign({ camera, canvas, placedTiles, fieldWaterEffectsOverlay, railTrainOverlay, waterBoatOverlay, houseOverlay });
  const gridOverlay = createGrid([...placedTiles.values()]);
  syncPlacementGridKeys();
  totalGridTiles = getGridCellCount(gridOverlay);

  // Terrain fusionné : 1 Mesh par matériau au lieu de 1 par tuile (912 DC → 14 DC).
  const terrainMergeGroup = createTerrainMergeGroup();

  ghostTile.visible = false;

  scene.add(gridOverlay, specialCellsMesh, bonusCellsMesh, bonusCellChestOverlay, waterZoneOverlay, hoverZoneOverlay, railTrainOverlay, waterBoatOverlay, forestOverlay, fieldWheatOverlay, houseOverlay, fieldWaterEffectsOverlay, cometSky, remoteGhosts, ghostTile, terrainMergeGroup);
  applySceneCurvatureFlags(gridOverlay);
  applySceneCurvatureFlags(specialCellsMesh);
  applySceneCurvatureFlags(bonusCellsMesh);
  rebuildBonusCellChestOverlay(bonusCellChestOverlay, bonusCells);
  applySceneCurvatureFlags(bonusCellChestOverlay);
  for (const placedTile of placedTiles.values()) {
    const position = axialToWorld(placedTile.q, placedTile.r);
    const mesh = createTileMesh(placedTile.tile);
    mesh.position.set(position.x, 0.003, position.z);
    hideTerrainMeshes(mesh);   // Les terrain meshes sont gérés par terrainMergeGroup
    placedTile.mesh = mesh;
    scene.add(mesh);
  }
  // Fusion initiale de tous les terrains chargés depuis la sauvegarde
  rebuildTerrainMerge(terrainMergeGroup, placedTiles);
  applySceneCurvatureFlags(terrainMergeGroup);

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
    abandonGame();
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

  controls.onClick = (hex) => placeTile(hex);

  controls.onWheel = (hex, deltaY, boosted = false) => {
    if (hex && isPlacementTarget(hex)) rotateActiveTile(deltaY < 0 ? 1 : -1);
    else controls.zoom(deltaY, boosted);
  };

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
      return;
    }

    if (key === 'h') {
      event.preventDefault();
      if (gridOnlyMode) toggleGridOnlyMode(false);
      toggleHelp();
      return;
    }

    if (key === 'l') {
      event.preventDefault();
      document.getElementById('debugLightPanel')?.classList.toggle('collapsed');
      return;
    }

    if (key === 'm') {
      event.preventDefault();
      toggleMute(ambientSoundDesign);
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
      if (gridOnlyMode) toggleGridOnlyMode(false);
      toggleHelp();
      return;
    }

    if (key !== 'r' || helpVisible) return;
    rotationKeyActive = true;
    rotateActiveTile(1);
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
  });

  // FLASH-DIAG : déclaré AVANT animate() pour éviter la temporal dead zone
  let _flashPrevVisCount = -1;

  animate();

  function animate() {
    requestAnimationFrame(animate);

    // ── PERF-TIMING : log toutes les 120 frames ─────────────────────────────
    const _PT_ENABLE = (shadowRefreshFrame % 120 === 1);
    let _pt0, _ptFlash, _ptCtrl, _ptAnim, _ptDecor, _ptSound, _ptRest;
    if (_PT_ENABLE) _pt0 = performance.now();

    // ── FLASH-DIAG frame-start ──────────────────────────────────────────────
    // Compare le nombre de Mesh visibles au début de CETTE frame avec la fin
    // de la PRÉCÉDENTE. Un pic ici = la visibilité a changé ENTRE deux frames
    // (hors de tout code JS contrôlé → Three.js interne ou autre).
    // NOTE: scene.traverse() ici coûte ~20-40ms/frame → exécuté 1×/120f seulement.
    if (shadowRefreshFrame % 120 === 0) {
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
    if (_PT_ENABLE) _ptAnim = performance.now();

    updateDecorOverlay(fieldWaterEffectsOverlay, timeSeconds, camera);
    if (_PT_ENABLE) _ptDecor = performance.now();

    updateCometSky(cometSky, camera, timeSeconds);
    ambientSoundDesign.update(timeSeconds);
    if (_PT_ENABLE) _ptSound = performance.now();

    updateSunShadowOrbit(scene, timeSeconds, controls.target, camera.position.y);
    updateWorldCurvedSprites(scene);
    // curvature + shadowFlags : chaque passe coûte 40-55ms → réduit à 1×/120f (~2s @ 60fps).
    // Avant : 1×/20f = freeze de 50ms toutes les 333ms. Maintenant : 1×/2s.
    if ((shadowRefreshFrame++ % 120) === 0) {
      const _d20a = performance.now();
      applySceneCurvatureFlags(scene);
      const _d20b = performance.now();
      applySceneShadowFlags(scene);     // restaure castShadow (écrase le culling précédent)
      const _d20c = performance.now();
      visualEnvironment.apply();
      console.log(
        `[FREEZE-DIAG 120f] curvature=${(_d20b-_d20a).toFixed(0)}ms` +
        ` | shadowFlags=${(_d20c-_d20b).toFixed(0)}ms` +
        ` | TOTAL=${(_d20c-_d20a).toFixed(0)}ms`
      );
    }
    // rebuildShadowCasters : coûteux (20-25ms, scene.traverse), réduit à 1×/180f (~3s @ 60fps).
    if ((shadowRefreshFrame % 180) === 0) {
      const _d60a = performance.now();
      rebuildShadowCasters(scene);
      const _d60b = performance.now();
      const _shadowExtent = Math.max(8, Math.min(18, camera.position.y * 0.58));
      applyShadowCulling(controls.target, _shadowExtent * 1.5);
      console.log(`[FREEZE-DIAG 180f] shadowCasters=${(_d60b-_d60a).toFixed(0)}ms`);
    }
    if ((shadowRefreshFrame % 9) === 0) {
      const lodFactor = computeLodHeightFactor(camera);
      updateForestLOD(forestOverlay, camera, lodFactor);
      updateFieldWheatLOD(fieldWheatOverlay, camera, lodFactor);
      updateNaturalPropsLOD(fieldWaterEffectsOverlay, camera, lodFactor);
      updateFieldDecorLOD(fieldWaterEffectsOverlay, camera, lodFactor);
      updateWaterBoatLOD(waterBoatOverlay, camera, lodFactor);
      updateRailTrainLOD(railTrainOverlay, camera, lodFactor);
      updateHouseLOD(houseOverlay, camera, lodFactor);
      updateBonusCellChestLOD(bonusCellChestOverlay, camera, lodFactor);
      updateZoneLabelLOD(waterZoneOverlay, camera, gridOnlyMode);
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
    }
    // ── Rebuilds différés : 1 overlay/frame — étale le travail lourd sans bloquer le RAF ──
    if (overlayRebuildQueue.size > 0) {
      const [[name, entry]] = overlayRebuildQueue;
      overlayRebuildQueue.delete(name);
      const _dQa = performance.now();
      entry.rebuild();
      const _dQb = performance.now();
      // Flash diagnostic : meshes visibles avant/après LOD
      let _visB = 0; scene.traverse(o => { if (o.isMesh && o.visible) _visB++; });
      entry.lod?.(); // LOD immédiat → évite le pop-in des objets lointains recréés visibles=true
      let _visA = 0; scene.traverse(o => { if (o.isMesh && o.visible) _visA++; });
      console.log(
        `[FREEZE-DIAG queue] '${name}' rebuild=${(_dQb-_dQa).toFixed(0)}ms` +
        ` | vis_before_lod=${_visB} vis_after_lod=${_visA}` +
        ` | remaining=${overlayRebuildQueue.size}`
      );
    }
    // Mode immersif : masquer labels à chaque frame — un rebuild ciblé peut en créer de nouveaux
    if (gridOnlyMode) updateZoneLabelLOD(waterZoneOverlay, camera, true);

    // Shadow throttle : recalcul 1 frame sur 3 — entre deux updates la shadow map
    // précédente est réutilisée. Imperceptible en mouvement, économise ~66% du shadow pass.
    // Le culling persistant (applyShadowCulling dans le bloc 20-frames) réduit le nombre
    // de casters actifs → frames shadow moins coûteuses.
    renderer.shadowMap.autoUpdate = (shadowRefreshFrame % 3 === 0);

    if (_PT_ENABLE) _ptRest = performance.now();
    renderer.info.reset();   // reset unique avant toutes les passes (autoReset=false)
    postprocess.render();
    if (_PT_ENABLE) {
      const _ptEnd = performance.now();
      tickFps(renderer, scene, { jsMs: _ptRest - _pt0, renderMs: _ptEnd - _ptRest });
      console.log(
        `[PERF-TIMING 120f] flash=${(_ptFlash-_pt0).toFixed(1)}ms` +
        ` | ctrl=${(_ptCtrl-_ptFlash).toFixed(1)}ms` +
        ` | anim=${(_ptAnim-_ptCtrl).toFixed(1)}ms` +
        ` | decor=${(_ptDecor-_ptAnim).toFixed(1)}ms` +
        ` | sound=${(_ptSound-_ptDecor).toFixed(1)}ms` +
        ` | rest+LOD=${(_ptRest-_ptSound).toFixed(1)}ms` +
        ` | render=${(_ptEnd-_ptRest).toFixed(1)}ms` +
        ` | TOTAL-JS=${(_ptEnd-_pt0).toFixed(1)}ms`
      );
    } else {
      tickFps(renderer, scene); // lu APRÈS render → stats complètes de toutes les passes
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
    rebuildHoverZoneOverlay(hoverZoneOverlay, hoveredHex, null, placedTiles, waterZoneOverlay);
    rebuildRailTrainOverlay(railTrainOverlay, placedTiles);
    rebuildWaterBoatOverlay(waterBoatOverlay, placedTiles);
    resetPropHitboxRegistry();
    rebuildForestOverlay(forestOverlay, placedTiles);
    rebuildFieldWheatOverlay(fieldWheatOverlay, placedTiles);
    rebuildHouseOverlay(houseOverlay, placedTiles);
    rebuildDecorOverlay(fieldWaterEffectsOverlay, placedTiles);
  }

  function refreshDeckUI() {
    const displayDeck = deck.slice();
    if (displayDeck[0]) displayDeck[0] = rotateTile(displayDeck[0], rotationIndex);
    updateDeckUI(ui, displayDeck);
  }

  function isTextInputTarget(target) {
    if (!target) return false;
    const tagName = target.tagName?.toLowerCase();
    return tagName === 'input' || tagName === 'textarea' || target.isContentEditable;
  }

  function toggleHelp(forceVisible = null) {
    helpVisible = forceVisible ?? !helpVisible;
    setHelpVisible(ui, helpVisible);
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
    setGridLabelVisibility(!gridOnlyMode);
    if (gridOnlyMode) rebuildHoverZoneOverlay(hoverZoneOverlay, null, null, placedTiles, waterZoneOverlay);
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
    if (gridOnlyMode) {
      rebuildHoverZoneOverlay(hoverZoneOverlay, null, null, placedTiles, waterZoneOverlay);
      setGridLabelVisibility(false);
    } else {
      rebuildHoverZoneOverlay(hoverZoneOverlay, hex, world, placedTiles, waterZoneOverlay);
    }

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
    const mesh = createTileMesh(tile);

    mesh.position.set(position.x, 0.003, position.z);
    hideTerrainMeshes(mesh);   // Terrain géré par terrainMergeGroup
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
      consumedBonusCell
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
    // rebuildTerrainMerge (O(N)) est réservé au undo / applyRemoteGameState.
    const _diagT0 = performance.now();
    addTileToTerrainMerge(terrainMergeGroup, mesh);
    const _diagT1 = performance.now();
    applySceneCurvatureFlags(terrainMergeGroup);
    const _diagT2 = performance.now();
    placementHistory.push(placedTile);
    expandGridAroundPlacedTile(hex);
    const _diagT3 = performance.now();
    // ── Rebuilds IMMÉDIATS : synchrones, légers, nécessaires pour le feedback visuel ──
    rebuildWaterZoneOverlay(waterZoneOverlay, placedTiles, gridOnlyMode, hex);
    const _diagT4 = performance.now();
    refreshGridAvailability();
    const _diagT5 = performance.now();
    rebuildHoverZoneOverlay(hoverZoneOverlay, hoveredHex, null, placedTiles, waterZoneOverlay);
    const _diagT6 = performance.now();
    resetPropHitboxRegistry(); // doit précéder les rebuilds props (forest/house/decor)
    console.log(
      `[FREEZE-DIAG placeTile] terrainMerge=${(_diagT1-_diagT0).toFixed(0)}ms` +
      ` | curvature(tile)=${(_diagT2-_diagT1).toFixed(0)}ms` +
      ` | expandGrid=${(_diagT3-_diagT2).toFixed(0)}ms` +
      ` | waterZone=${(_diagT4-_diagT3).toFixed(0)}ms` +
      ` | gridAvail#1=${(_diagT5-_diagT4).toFixed(0)}ms` +
      ` | hoverZone=${(_diagT6-_diagT5).toFixed(0)}ms` +
      ` | TOTAL=${(_diagT6-_diagT0).toFixed(0)}ms`
    );
    if (gridOnlyMode) setGridLabelVisibility(false);

    // ── Rebuilds DIFFÉRÉS : conditionnels selon le type de la tuile posée ──────────────────────
    // Skip les overlays dont le contenu ne peut PAS changer quand ce type de tuile est posé.
    // Logique : chaque overlay ne dépend que des edges/center du tile concerné.
    // Exception conservatrice : field/house triggent aussi le rebuild forest (safe zones mills/church).
    const _tEdgeTypes = new Set(Object.values(tile.edges).map(e => getEdgeType(e)));
    const _needsRail   = _tEdgeTypes.has(EDGE_TYPES.rail);
    const _needsWater  = _tEdgeTypes.has(EDGE_TYPES.water);
    const _needsField  = _tEdgeTypes.has(EDGE_TYPES.field);
    const _needsHouse  = _tEdgeTypes.has(EDGE_TYPES.house);
    // Forest rebuild si : edge forest direct OU field/house (peuvent créer une safe zone moulin/église)
    const _needsForest = _tEdgeTypes.has(EDGE_TYPES.forest) || _needsField || _needsHouse;

    console.log(`[FREEZE-DIAG queue-plan] rail=${_needsRail} boat=${_needsWater} wheat=${_needsField} forest=${_needsForest} house=${_needsHouse}`);

    if (_needsRail)   overlayRebuildQueue.set('rail',   { rebuild: () => rebuildRailTrainOverlay(railTrainOverlay, placedTiles),   lod: () => updateRailTrainLOD(railTrainOverlay, camera) });
    if (_needsWater)  overlayRebuildQueue.set('boat',   { rebuild: () => rebuildWaterBoatOverlay(waterBoatOverlay, placedTiles),   lod: () => updateWaterBoatLOD(waterBoatOverlay, camera) });
    if (_needsField)  overlayRebuildQueue.set('wheat',  { rebuild: () => rebuildFieldWheatOverlay(fieldWheatOverlay, placedTiles), lod: () => updateFieldWheatLOD(fieldWheatOverlay, camera) });
    if (_needsForest) overlayRebuildQueue.set('forest', { rebuild: () => rebuildForestOverlay(forestOverlay, placedTiles),         lod: () => updateForestLOD(forestOverlay, camera) });
    if (_needsHouse)  overlayRebuildQueue.set('house',  { rebuild: () => rebuildHouseOverlay(houseOverlay, placedTiles),           lod: () => updateHouseLOD(houseOverlay, camera) });
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
    updateMissionUI(ui, missionManager.active, formatMissionLabel, getMissionProgressByType(placedTiles));
  }

  function getFullGameStats() {
    const stats = getGameStats(placedTiles);
    stats.cometHits = cometHits;
    return stats;
  }

  function refreshStatsUI() {
    updateStatsUI(ui, getFullGameStats());
  }

  function maybeAddMissionForCurrentTile() {
    return maybeGenerateMissionForTile(missionManager, deck[0]);
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
    ghostTile.add(createTileMesh(tile, { opacity: 1 }));
    ghostTile.add(createPlacementFeedbackOverlay(status));
    if (gridOnlyMode) setGridLabelVisibility(false);
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
    rebuildWaterZoneOverlay(waterZoneOverlay, placedTiles, gridOnlyMode);
    rebuildHoverZoneOverlay(hoverZoneOverlay, hoveredHex, null, placedTiles, waterZoneOverlay);
    resetPropHitboxRegistry();
    updateHoveredSpecialCellVisibility(hoveredHex);
    if (gridOnlyMode) setGridLabelVisibility(false);

    // ── Rebuilds DIFFÉRÉS : {rebuild, lod} — lod() appliqué immédiatement pour éviter pop-in ──
    overlayRebuildQueue.set('rail',   { rebuild: () => rebuildRailTrainOverlay(railTrainOverlay, placedTiles),     lod: () => updateRailTrainLOD(railTrainOverlay, camera) });
    overlayRebuildQueue.set('boat',   { rebuild: () => rebuildWaterBoatOverlay(waterBoatOverlay, placedTiles),     lod: () => updateWaterBoatLOD(waterBoatOverlay, camera) });
    overlayRebuildQueue.set('wheat',  { rebuild: () => rebuildFieldWheatOverlay(fieldWheatOverlay, placedTiles),   lod: () => updateFieldWheatLOD(fieldWheatOverlay, camera) });
    overlayRebuildQueue.set('forest', { rebuild: () => rebuildForestOverlay(forestOverlay, placedTiles),           lod: () => updateForestLOD(forestOverlay, camera) });
    overlayRebuildQueue.set('house',  { rebuild: () => rebuildHouseOverlay(houseOverlay, placedTiles),             lod: () => updateHouseLOD(houseOverlay, camera) });
    overlayRebuildQueue.set('decor',  { rebuild: () => rebuildDecorOverlay(fieldWaterEffectsOverlay, placedTiles), lod: () => { updateNaturalPropsLOD(fieldWaterEffectsOverlay, camera); updateFieldDecorLOD(fieldWaterEffectsOverlay, camera); } });
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

  function abandonGame() {
    if (gameOver) return;
    endGame('PARTIE ABANDONNÉE');
  }

  function startNewGame() {
    window.location.reload();
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
    askHighscoreSubmit(highscoreUI, totalScore, getGridPercent(), getFullGameStats());
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
    remoteGhosts.clear();
    for (const [cursorPlayerId, cursor] of Object.entries(cursors ?? {})) {
      if (cursorPlayerId === playerId || !cursor?.visible || !cursor?.tile) continue;
      if (!Number.isFinite(Number(cursor.q)) || !Number.isFinite(Number(cursor.r))) continue;
      const position = axialToWorld(Number(cursor.q), Number(cursor.r));
      const mesh = createTileMesh(stripRuntimeTile(cursor.tile), { opacity: cursor.valid ? 0.42 : 0.22 });
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
          const mesh = createTileMesh(placedTile.tile);
          mesh.position.set(position.x, 0.003, position.z);
          hideTerrainMeshes(mesh);
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
          const mesh = createTileMesh(placedTile.tile);
          mesh.position.set(position.x, 0.003, position.z);
          hideTerrainMeshes(mesh);
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
      rebuildHoverZoneOverlay(hoverZoneOverlay, hoveredHex, null, placedTiles, waterZoneOverlay);
      resetPropHitboxRegistry();
      // ⚠️ Tous les overlays via queue → LOD immédiat, évite le flash (visible=true hors RAF)
      overlayRebuildQueue.set('boat',   { rebuild: () => rebuildWaterBoatOverlay(waterBoatOverlay, placedTiles),     lod: () => updateWaterBoatLOD(waterBoatOverlay, camera) });
      overlayRebuildQueue.set('wheat',  { rebuild: () => rebuildFieldWheatOverlay(fieldWheatOverlay, placedTiles),   lod: () => updateFieldWheatLOD(fieldWheatOverlay, camera) });
      overlayRebuildQueue.set('house',  { rebuild: () => rebuildHouseOverlay(houseOverlay, placedTiles),             lod: () => updateHouseLOD(houseOverlay, camera) });
      overlayRebuildQueue.set('rail',   { rebuild: () => rebuildRailTrainOverlay(railTrainOverlay, placedTiles),     lod: () => updateRailTrainLOD(railTrainOverlay, camera) });
      overlayRebuildQueue.set('forest', { rebuild: () => rebuildForestOverlay(forestOverlay, placedTiles),           lod: () => updateForestLOD(forestOverlay, camera) });
      // Décor : incrémental si 1 seule tuile ajoutée (évite le rebuild complet O(N) ~1200ms)
      if (_singleTileSync && _newTile) {
        overlayRebuildQueue.set('decor', { rebuild: () => addSingleTileToDecorOverlay(fieldWaterEffectsOverlay, _newTile, placedTiles), lod: () => { updateNaturalPropsLOD(fieldWaterEffectsOverlay, camera); updateFieldDecorLOD(fieldWaterEffectsOverlay, camera); } });
      } else {
        overlayRebuildQueue.set('decor', { rebuild: () => rebuildDecorOverlay(fieldWaterEffectsOverlay, placedTiles), lod: () => { updateNaturalPropsLOD(fieldWaterEffectsOverlay, camera); updateFieldDecorLOD(fieldWaterEffectsOverlay, camera); } });
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

function serializeMissionManager(manager) {
  return {
    active: manager.active.map(clonePlain),
    generatedTileIds: [...manager.generatedTileIds],
    targetLevelByType: Object.fromEntries(manager.targetLevelByType),
    nextId: manager.nextId,
    turn: manager.turn
  };
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
    consumedBonusCell: placedTile.consumedBonusCell ? clonePlain(placedTile.consumedBonusCell) : null
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

function clonePlain(value) {
  return JSON.parse(JSON.stringify(value));
}

function createMultiplayerBadge(roomCode, playerName) {
  const badge = document.createElement('div');
  badge.className = 'multiplayer-badge';

  const roomBlock = document.createElement('div');
  roomBlock.className = 'multiplayer-badge-block';

  const roomTitle = document.createElement('div');
  roomTitle.className = 'score-title';
  roomTitle.textContent = 'PARTIE EN COURS';

  const roomValue = document.createElement('div');
  roomValue.className = 'score-value multiplayer-badge-value';
  roomValue.textContent = roomCode;

  const playerBlock = document.createElement('div');
  playerBlock.className = 'multiplayer-badge-block';

  const playerTitle = document.createElement('div');
  playerTitle.className = 'score-title';
  playerTitle.textContent = 'JOUEUR';

  const playerValue = document.createElement('div');
  playerValue.className = 'score-value multiplayer-badge-value';
  playerValue.textContent = playerName;

  roomBlock.append(roomTitle, roomValue);
  playerBlock.append(playerTitle, playerValue);
  badge.append(roomBlock, playerBlock);
  document.body.appendChild(badge);
}

function getTotalGridTiles(radius) {
  return 1 + 3 * radius * (radius + 1);
}
