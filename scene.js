import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { DECK_SIZE, GRID_RADIUS } from './config.js';
import { CameraControls } from './controls.js';
import { createGrid, updateGridAvailability } from './grid.js';
import { addSpecialCellMesh, createSpecialCells, createSpecialCellsMesh, removeSpecialCellMesh, updateSpecialCellsMeshAnimation } from './specialCells.js';
import { BONUS_CELL_SCORE, addBonusCellMesh, createBonusCells, createBonusCellsMesh, removeBonusCellMesh, updateBonusCellsMeshAnimation } from './bonusCells.js';
import { axialToWorld, makeHexKey } from './hex.js';
import { createTileMesh } from './tileMesh.js';
import { updateAnimatedBiomeTextures } from './tileTextures.js';
import { canPlaceTileAt, getPlacementValidation } from './placementRules.js';
import { calculatePlacementScore } from './scoring.js';
import { createDeck, rotateTile } from './tileGenerator.js';
import { createUI, setGridOnlyModeVisible, setHelpVisible, setText, updateDeckUI, updateKeyboardUI, updateMissionUI, updateScoreUI, updateStatsUI } from './ui.js';
import { createPlacementFeedbackOverlay, getPlacementLabel } from './placementOverlay.js';
import { createHoverZoneOverlay, createWaterZoneOverlay, rebuildHoverZoneOverlay, rebuildWaterZoneOverlay, updateHoverZoneOverlayAnimation } from './waterZoneOverlay.js';
import { createRailTrainOverlay, rebuildRailTrainOverlay, updateRailTrainOverlay } from './railTrainOverlay.js';
import { createWaterSharkOverlay, rebuildWaterSharkOverlay, updateWaterSharkOverlay } from './waterSharkOverlay.js';
import { createForestBirchOverlay, rebuildForestBirchOverlay } from './forestBirchOverlay.js';
import { createHouseSmokeOverlay, rebuildHouseSmokeOverlay, updateHouseSmokeOverlay } from './houseSmokeOverlay.js';
import { createFieldWaterEffectsOverlay, rebuildFieldWaterEffectsOverlay, updateFieldWaterEffectsOverlay } from './fieldWaterEffectsOverlay.js';
import { askHighscoreSubmit, createHighscoreUI } from './highscore.js';
import { createCamera, createPixelPostprocess, createRenderer, createThreeScene, resizeRenderer } from './threeSetup.js';
import { createPostprocessHud } from './postprocessHud.js';
import { getBonusTilesAwarded, normalizeRotation } from './gameRules.js';
import { MISSION_REWARD, MISSION_TILE_REWARD, advanceMissionTurn, consumeCompletedMissions, createMissionManager, formatMissionLabel, getCompletedMissions, getGameStats, getMissionProgressByType, maybeGenerateMissionForTile, removeMissionById, restoreMissionSnapshots, restoreMissions, setMissionTurn } from './missions.js';
import { pollRoom, updateCursor, updateRoomState } from './multiplayerClient.js';

export function initScene(options = {}) {
  const canvas = document.getElementById('app');
  const renderer = createRenderer(canvas);
  const scene = createThreeScene();
  const camera = createCamera();
  const postprocess = createPixelPostprocess(renderer, scene, camera);
  const controls = new CameraControls(camera, canvas);
  const ui = createUI();
  const highscoreUI = createHighscoreUI(ui);
  createPostprocessHud(postprocess);

  // État de partie : carte posée, historique annulable, deck et score.
  const multiplayer = options.multiplayer ?? null;
  const isMultiplayer = options.mode === 'multi' && multiplayer?.roomCode;
  const initialState = options.initialState ?? null;
  const playerId = multiplayer?.playerId ?? null;
  const playerName = multiplayer?.playerName ?? 'Joueur';
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
  let helpVisible = false;
  let gameOver = false;
  let gridOnlyMode = false;
  let hiddenSpecialCellKey = null;
  const totalGridTiles = getTotalGridTiles(GRID_RADIUS);

  // Tuile fantôme et overlays : feedback visuel, aucun impact sur les règles.
  const ghostTile = new THREE.Group();
  const remoteGhosts = new THREE.Group();
  remoteGhosts.name = 'multiplayer-remote-ghosts';
  const waterZoneOverlay = createWaterZoneOverlay();
  const hoverZoneOverlay = createHoverZoneOverlay();
  const railTrainOverlay = createRailTrainOverlay();
  const waterSharkOverlay = createWaterSharkOverlay();
  const forestBirchOverlay = createForestBirchOverlay();
  const houseSmokeOverlay = createHouseSmokeOverlay();
  const fieldWaterEffectsOverlay = createFieldWaterEffectsOverlay();
  const gridOverlay = createGrid();

  ghostTile.visible = false;

  scene.add(gridOverlay, specialCellsMesh, bonusCellsMesh, waterZoneOverlay, hoverZoneOverlay, railTrainOverlay, waterSharkOverlay, forestBirchOverlay, houseSmokeOverlay, fieldWaterEffectsOverlay, remoteGhosts, ghostTile);
  for (const placedTile of placedTiles.values()) {
    const position = axialToWorld(placedTile.q, placedTile.r);
    const mesh = createTileMesh(placedTile.tile);
    mesh.position.set(position.x, 0.003, position.z);
    placedTile.mesh = mesh;
    scene.add(mesh);
  }
  if (isMultiplayer) {
    createMultiplayerBadge(multiplayer.roomCode, playerName);
    setInterval(refreshMultiplayerRoom, 900);
  }
  refreshDeckUI();
  refreshGridAvailability();
  if (!isMultiplayer || !initialState?.missionManager) maybeAddMissionForCurrentTile();
  refreshMissionUI();
  updateScoreUI(ui, totalScore, 0, placedTiles.size, totalGridTiles);
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

  controls.onWheel = (hex, deltaY) => {
    if (hex && isPlacementTarget(hex)) rotateActiveTile(deltaY < 0 ? 1 : -1);
    else controls.zoom(deltaY);
  };

  window.addEventListener('keydown', event => {
    const key = event.key.toLowerCase();

    if (isTextInputTarget(event.target)) return;

    if (event.ctrlKey && !event.shiftKey && !event.altKey && key === 'z') {
      event.preventDefault();
      undoLastPlacement();
      return;
    }

    if ((key === ' ' || key === 'spacebar') && !event.repeat) {
      event.preventDefault();
      toggleGridOnlyMode();
      return;
    }

    if (key === 'h') {
      event.preventDefault();
      if (gridOnlyMode) toggleGridOnlyMode(false);
      toggleHelp();
      return;
    }

    if ((event.key === '+' || event.key === '=' || event.code === 'NumpadAdd') && !helpVisible) {
      event.preventDefault();
      controls.zoom(-120);
      return;
    }

    if ((event.key === '-' || event.code === 'NumpadSubtract') && !helpVisible) {
      event.preventDefault();
      controls.zoom(120);
      return;
    }

    if (key === 'escape' && helpVisible) {
      event.preventDefault();
      toggleHelp(false);
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

  animate();

  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    const timeSeconds = performance.now() * 0.001;
    updateAnimatedBiomeTextures(timeSeconds);
    updateSpecialCellsMeshAnimation(specialCellsMesh, timeSeconds);
    updateBonusCellsMeshAnimation(bonusCellsMesh, timeSeconds);
    updateKeyboardUI(ui, controls.keys, rotationKeyActive, gridOnlyMode);
    updateHoverZoneOverlayAnimation(hoverZoneOverlay, waterZoneOverlay);
    updateRailTrainOverlay(railTrainOverlay, timeSeconds);
    updateWaterSharkOverlay(waterSharkOverlay, timeSeconds);
    updateHouseSmokeOverlay(houseSmokeOverlay, timeSeconds);
    updateFieldWaterEffectsOverlay(fieldWaterEffectsOverlay, timeSeconds);
    postprocess.render();
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
    }

    const scoreResult = calculatePlacementScore(hex, placedTiles, tile, specialCells);
    const mesh = createTileMesh(tile);

    mesh.position.set(position.x, 0.003, position.z);
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
    placementHistory.push(placedTile);
    rebuildWaterZoneOverlay(waterZoneOverlay, placedTiles);
    refreshGridAvailability();
    rebuildHoverZoneOverlay(hoverZoneOverlay, hoveredHex, null, placedTiles, waterZoneOverlay);
    rebuildRailTrainOverlay(railTrainOverlay, placedTiles);
    rebuildWaterSharkOverlay(waterSharkOverlay, placedTiles);
    rebuildForestBirchOverlay(forestBirchOverlay, placedTiles);
    rebuildHouseSmokeOverlay(houseSmokeOverlay, placedTiles);
    rebuildFieldWaterEffectsOverlay(fieldWaterEffectsOverlay, placedTiles);
    if (gridOnlyMode) setGridLabelVisibility(false);

    ghostTile.visible = false;
    deck.shift();
    addBonusTiles(placedTile.bonusTilesAwarded + placedTile.missionBonusTilesAwarded);
    placedTile.purgedMissions = advanceMissionTurn(missionManager);
    rotationIndex = 0;
    refreshDeckUI();
    refreshGridAvailability();
    placedTile.generatedMission = maybeAddMissionForCurrentTile();
    refreshMissionUI();
    updateScoreUI(ui, totalScore, placedTile.score, placedTiles.size, totalGridTiles);
    refreshStatsUI();
    if (isMultiplayer) persistMultiplayerState();
    if (deck.length === 0) endGame();
  }

  function refreshMissionUI() {
    updateMissionUI(ui, missionManager.active, formatMissionLabel, getMissionProgressByType(placedTiles));
  }

  function refreshStatsUI() {
    updateStatsUI(ui, getGameStats(placedTiles));
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
    ui.abandonGame?.removeAttribute('disabled');
    scene.remove(last.mesh);
    last.mesh.traverse?.(object => {
      object.geometry?.dispose?.();
    });

    placedTiles.delete(last.key);
    if (last.consumedSpecialCell) {
      specialCells.set(last.key, last.consumedSpecialCell);
      addSpecialCellMesh(specialCellsMesh, last.consumedSpecialCell);
    }
    if (last.consumedBonusCell) {
      bonusCells.set(last.key, last.consumedBonusCell);
      addBonusCellMesh(bonusCellsMesh, last.consumedBonusCell);
    }
    rebuildWaterZoneOverlay(waterZoneOverlay, placedTiles);
    rebuildHoverZoneOverlay(hoverZoneOverlay, hoveredHex, null, placedTiles, waterZoneOverlay);
    rebuildRailTrainOverlay(railTrainOverlay, placedTiles);
    rebuildWaterSharkOverlay(waterSharkOverlay, placedTiles);
    rebuildForestBirchOverlay(forestBirchOverlay, placedTiles);
    rebuildHouseSmokeOverlay(houseSmokeOverlay, placedTiles);
    rebuildFieldWaterEffectsOverlay(fieldWaterEffectsOverlay, placedTiles);
    updateHoveredSpecialCellVisibility(hoveredHex);
    if (gridOnlyMode) setGridLabelVisibility(false);
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
    updateScoreUI(ui, totalScore, -(last.score ?? 0), placedTiles.size, totalGridTiles);
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
    refreshGridAvailability();
    updateHoveredSpecialCellVisibility(null);
    ghostTile.visible = false;
    rebuildHoverZoneOverlay(hoverZoneOverlay, hoveredHex, null, placedTiles, waterZoneOverlay);
    ui.abandonGame?.setAttribute('disabled', 'disabled');
    setText(ui.placement, label);
    askHighscoreSubmit(highscoreUI, totalScore, getGridPercent(), getGameStats(placedTiles));
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

      for (const placedTile of placedTiles.values()) {
        if (placedTile.mesh) {
          scene.remove(placedTile.mesh);
          disposeObject(placedTile.mesh);
        }
      }
      placedTiles.clear();

      const remotePlacedTiles = hydratePlacedTiles(snapshot.placedTiles);
      for (const [key, placedTile] of remotePlacedTiles.entries()) {
        const position = axialToWorld(placedTile.q, placedTile.r);
        const mesh = createTileMesh(placedTile.tile);
        mesh.position.set(position.x, 0.003, position.z);
        placedTile.mesh = mesh;
        placedTiles.set(key, placedTile);
        scene.add(mesh);
      }

      specialCells.clear();
      const remoteSpecialCells = hydrateCellMap(snapshot.specialCells) ?? new Map();
      for (const [key, cell] of remoteSpecialCells.entries()) specialCells.set(key, cell);
      rebuildCellMeshGroup(specialCellsMesh, specialCells, addSpecialCellMesh);

      bonusCells.clear();
      const remoteBonusCells = hydrateCellMap(snapshot.bonusCells) ?? new Map();
      for (const [key, cell] of remoteBonusCells.entries()) bonusCells.set(key, cell);
      rebuildCellMeshGroup(bonusCellsMesh, bonusCells, addBonusCellMesh);

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
      gameOver = Boolean(snapshot.gameOver);
      rotationIndex = Number(snapshot.players?.[playerId]?.rotationIndex ?? rotationIndex ?? 0);

      rebuildWaterZoneOverlay(waterZoneOverlay, placedTiles);
      rebuildHoverZoneOverlay(hoverZoneOverlay, hoveredHex, null, placedTiles, waterZoneOverlay);
      rebuildRailTrainOverlay(railTrainOverlay, placedTiles);
      rebuildWaterSharkOverlay(waterSharkOverlay, placedTiles);
      rebuildForestBirchOverlay(forestBirchOverlay, placedTiles);
      rebuildHouseSmokeOverlay(houseSmokeOverlay, placedTiles);
      rebuildFieldWaterEffectsOverlay(fieldWaterEffectsOverlay, placedTiles);
      refreshDeckUI();
      refreshGridAvailability();
      refreshMissionUI();
      updateScoreUI(ui, totalScore, 0, placedTiles.size, totalGridTiles);
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
      rotationIndex,
      gameOver,
      placedTiles: [...placedTiles.values()].map(serializePlacedTile),
      placementHistory: placementHistory.map(serializePlacedTile),
      specialCells: [...specialCells.values()].map(clonePlain),
      bonusCells: [...bonusCells.values()].map(clonePlain),
      missionManager: serializeMissionManager(missionManager),
      players,
      stats: getGameStats(placedTiles)
    };
  }

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
  roomTitle.textContent = 'partie en ligne';

  const roomValue = document.createElement('div');
  roomValue.className = 'score-value multiplayer-badge-value';
  roomValue.textContent = roomCode;

  const playerBlock = document.createElement('div');
  playerBlock.className = 'multiplayer-badge-block';

  const playerTitle = document.createElement('div');
  playerTitle.className = 'score-title';
  playerTitle.textContent = 'joueur';

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
