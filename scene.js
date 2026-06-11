import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { DECK_SIZE, GRID_RADIUS } from './config.js';
import { CameraControls } from './controls.js';
import { createGrid } from './grid.js';
import { axialToWorld, makeHexKey } from './hex.js';
import { createTileMesh } from './tileMesh.js';
import { updateAnimatedBiomeTextures } from './tileTextures.js';
import { canPlaceTileAt, getPlacementValidation } from './placementRules.js';
import { calculatePlacementScore } from './scoring.js';
import { createDeck, rotateTile } from './tileGenerator.js';
import { createUI, setHelpVisible, setText, updateDeckUI, updateKeyboardUI, updateMissionUI, updateScoreUI, updateStatsUI } from './ui.js';
import { createPlacementFeedbackOverlay, getPlacementLabel } from './placementOverlay.js';
import { createHoverZoneOverlay, createWaterZoneOverlay, rebuildHoverZoneOverlay, rebuildWaterZoneOverlay, updateHoverZoneOverlayAnimation } from './waterZoneOverlay.js';
import { createRailTrainOverlay, rebuildRailTrainOverlay, updateRailTrainOverlay } from './railTrainOverlay.js';
import { createWaterSharkOverlay, rebuildWaterSharkOverlay, updateWaterSharkOverlay } from './waterSharkOverlay.js';
import { askHighscoreSubmit, createHighscoreUI } from './highscore.js';
import { createCamera, createRenderer, createThreeScene, resizeRenderer } from './threeSetup.js';
import { getBonusTilesAwarded, normalizeRotation } from './gameRules.js';
import { MISSION_REWARD, MISSION_TILE_REWARD, advanceMissionTurn, consumeCompletedMissions, createMissionManager, formatMissionLabel, getCompletedMissions, getGameStats, getMissionProgressByType, maybeGenerateMissionForTile, removeMissionById, restoreMissionSnapshots, restoreMissions, setMissionTurn } from './missions.js';

export function initScene() {
  const canvas = document.getElementById('app');
  const renderer = createRenderer(canvas);
  const scene = createThreeScene();
  const camera = createCamera();
  const controls = new CameraControls(camera, canvas);
  const ui = createUI();
  const highscoreUI = createHighscoreUI(ui);

  // État de partie : carte posée, historique annulable, deck et score.
  const placedTiles = new Map();
  const placementHistory = [];
  const deck = createDeck(DECK_SIZE);
  const missionManager = createMissionManager();
  let hoveredHex = null;
  let rotationIndex = 0;
  let rotationKeyActive = false;
  let totalScore = 0;
  let helpVisible = false;
  let gameOver = false;
  const totalGridTiles = getTotalGridTiles(GRID_RADIUS);

  // Tuile fantôme et overlays : feedback visuel, aucun impact sur les règles.
  const ghostTile = new THREE.Group();
  const waterZoneOverlay = createWaterZoneOverlay();
  const hoverZoneOverlay = createHoverZoneOverlay();
  const railTrainOverlay = createRailTrainOverlay();
  const waterSharkOverlay = createWaterSharkOverlay();

  ghostTile.visible = false;

  scene.add(createGrid(), waterZoneOverlay, hoverZoneOverlay, railTrainOverlay, waterSharkOverlay, ghostTile);
  refreshDeckUI();
  maybeAddMissionForCurrentTile();
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

    if (key === 'h') {
      event.preventDefault();
      toggleHelp();
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

  window.addEventListener('resize', () => resizeRenderer(renderer, camera));

  animate();

  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    updateAnimatedBiomeTextures(performance.now() * 0.001);
    updateKeyboardUI(ui, controls.keys, rotationKeyActive);
    updateHoverZoneOverlayAnimation(hoverZoneOverlay, waterZoneOverlay);
    updateRailTrainOverlay(railTrainOverlay, performance.now() * 0.001);
    updateWaterSharkOverlay(waterSharkOverlay, performance.now() * 0.001);
    renderer.render(scene, camera);
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

  function updateHover(hex, world) {
    const position = axialToWorld(hex.q, hex.r);
    rebuildHoverZoneOverlay(hoverZoneOverlay, hex, world, placedTiles, waterZoneOverlay);

    if (!isPlacementTarget(hex)) {
      ghostTile.visible = false;
      setText(ui.placement, gameOver ? 'FIN DU DECK' : '-');
      return;
    }

    const tile = rotateTile(deck[0], rotationIndex);
    const validation = getPlacementValidation(hex, placedTiles, tile);
    rebuildGhost(position, tile, validation);
  }

  function placeTile(hex) {
    if (gameOver || deck.length === 0 || !isPlacementTarget(hex)) return;

    const key = makeHexKey(hex.q, hex.r);
    const position = axialToWorld(hex.q, hex.r);
    const tile = rotateTile(deck[0], rotationIndex);
    const validation = getPlacementValidation(hex, placedTiles, tile);

    if (!validation.valid) {
      rebuildGhost(position, tile, validation);
      return;
    }
    const scoreResult = calculatePlacementScore(hex, placedTiles, tile);
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
      purgedMissions: []
    };

    const completedMissions = getCompletedMissions(missionManager, new Map([...placedTiles, [key, placedTile]]));
    const missionScore = completedMissions.length * MISSION_REWARD;
    const missionBonusTilesAwarded = completedMissions.length * MISSION_TILE_REWARD;
    placedTile.completedMissions = completedMissions;
    placedTile.missionBonusTilesAwarded = missionBonusTilesAwarded;
    placedTile.score = scoreResult.total + missionScore;
    consumeCompletedMissions(missionManager, completedMissions);
    totalScore += placedTile.score;

    placedTiles.set(key, placedTile);
    placementHistory.push(placedTile);
    rebuildWaterZoneOverlay(waterZoneOverlay, placedTiles);
    rebuildHoverZoneOverlay(hoverZoneOverlay, hoveredHex, null, placedTiles, waterZoneOverlay);
    rebuildRailTrainOverlay(railTrainOverlay, placedTiles);
    rebuildWaterSharkOverlay(waterSharkOverlay, placedTiles);

    ghostTile.visible = false;
    deck.shift();
    addBonusTiles(placedTile.bonusTilesAwarded + placedTile.missionBonusTilesAwarded);
    placedTile.purgedMissions = advanceMissionTurn(missionManager);
    rotationIndex = 0;
    refreshDeckUI();
    placedTile.generatedMission = maybeAddMissionForCurrentTile();
    refreshMissionUI();
    updateScoreUI(ui, totalScore, placedTile.score, placedTiles.size, totalGridTiles);
    refreshStatsUI();
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

    if (hasTarget) {
      const position = axialToWorld(hoveredHex.q, hoveredHex.r);
      const tile = rotateTile(deck[0], rotationIndex);
      const validation = getPlacementValidation(hoveredHex, placedTiles, tile);
      rebuildGhost(position, tile, validation);
    }
  }

  function rebuildGhost(position, tile = rotateTile(deck[0], rotationIndex), validation = null) {
    const status = validation ?? getPlacementValidation(hoveredHex, placedTiles, tile);

    ghostTile.clear();
    ghostTile.add(createTileMesh(tile, { opacity: 1 }));
    ghostTile.add(createPlacementFeedbackOverlay(status));
    ghostTile.position.set(position.x, 0.003, position.z);
    ghostTile.visible = true;

    setText(ui.placement, getPlacementLabel(status));
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
    rebuildWaterZoneOverlay(waterZoneOverlay, placedTiles);
    rebuildHoverZoneOverlay(hoverZoneOverlay, hoveredHex, null, placedTiles, waterZoneOverlay);
    rebuildRailTrainOverlay(railTrainOverlay, placedTiles);
    rebuildWaterSharkOverlay(waterSharkOverlay, placedTiles);
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
    refreshMissionUI();
    updateScoreUI(ui, totalScore, -(last.score ?? 0), placedTiles.size, totalGridTiles);
    refreshStatsUI();

    if (hoveredHex && isPlacementTarget(hoveredHex)) {
      const position = axialToWorld(hoveredHex.q, hoveredHex.r);
      const tile = rotateTile(deck[0], rotationIndex);
      const validation = getPlacementValidation(hoveredHex, placedTiles, tile);
      rebuildGhost(position, tile, validation);
    } else {
      ghostTile.visible = false;
      setText(ui.placement, '-');
    }
  }

  function isPlacementTarget(hex) {
    return !gameOver && deck.length > 0 && canPlaceTileAt(hex, placedTiles);
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
    ghostTile.visible = false;
    rebuildHoverZoneOverlay(hoverZoneOverlay, hoveredHex, null, placedTiles, waterZoneOverlay);
    ui.abandonGame?.setAttribute('disabled', 'disabled');
    setText(ui.placement, label);
    askHighscoreSubmit(highscoreUI, totalScore, getGridPercent());
  }

  function getGridPercent() {
    return totalGridTiles > 0 ? (placedTiles.size / totalGridTiles) * 100 : 0;
  }
}

function getTotalGridTiles(radius) {
  return 1 + 3 * radius * (radius + 1);
}
