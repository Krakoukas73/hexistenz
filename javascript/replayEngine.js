// ─── replayEngine.js — Relecture accélérée de la partie (2026-07-16) ─────────────────
// Feature demandée explicitement par l'utilisateur : rejouer automatiquement la partie
// en cours, tuile par tuile, dans un jeu de groupes 3D PARALLÈLES à ceux du jeu réel —
// jamais les groupes réels. Le replay est donc strictement LECTURE SEULE vis-à-vis de la
// partie en cours : `placedTiles`/`placementHistory`/le score réel/les missions ne sont
// JAMAIS touchés, seulement lus. Fermer le replay = tout détruire côté replay + réafficher
// les groupes réels (jamais modifiés) → sûr par construction.
//
// "Option A" retenue après discussion (2026-07-16, cf. CONTEXT.md §21) : le monde repousse
// depuis le vide plutôt qu'une simple tournée guidée sur le plateau déjà complet — plus
// spectaculaire, plus de travail, choix explicite de l'utilisateur ("OPTION A sinon rien").
//
// Contrainte technique clé qui a dicté l'architecture : le terrain (sol hexagonal) est
// FUSIONNÉ (terrainMerge.js, ~14 draw calls pour toute la carte) dès la pose — impossible
// de cacher/révéler UNE tuile du terrain fusionné individuellement. Solution : réutiliser
// les fonctions `rebuildX(group, placedTiles)` déjà existantes (les mêmes qui servent à
// l'undo/l'init/la resync multijoueur complète) en leur donnant à chaque étape un
// sous-ensemble CROISSANT de `placementHistory` — pas de nouvelle logique de reconstruction,
// juste la même déjà éprouvée, appelée en boucle.
//
// Limitations connues de cette V1 (documentées, pas des oublis) :
//  - Pas de rejeu des cellules spéciales/bonus (coffres, étoiles) — jamais affichées en replay.
//  - Les overlays du replay (forêt, moutons, eau…) sont statiques (pas d'animation vent/vagues/
//    marche) — seuls ceux du jeu réel (masqués mais toujours dans la boucle de rendu) animent.
//  - Pas de scrubbing arrière : lecture strictement en avant (play/pause/vitesse/fermer).

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { axialToWorld } from './hex.js';
import { getEdgeType } from './tileGenerator.js';
import { EDGE_TYPES } from './variables.js';
import { createTerrainMergeGroup, rebuildTerrainMerge, hideTerrainMeshes } from './terrainMerge.js';
import { createTileMesh } from './tileMesh.js';
import { createForestOverlay, rebuildForestOverlay } from './forestOverlay.js';
import { createHouseOverlay, rebuildHouseOverlay } from './houseOverlay.js';
import { createRailTrainOverlay, rebuildRailTrainOverlay } from './railTrainOverlay.js';
import { createSheepOverlay, rebuildSheepOverlay } from './sheepOverlay.js';
import { createWaterBoatOverlay, rebuildWaterBoatOverlay } from '../shaders/waterBoatOverlay.js';
import { createFieldWheatOverlay, rebuildFieldWheatOverlay } from './fieldWheatOverlay.js';
import { createGrassBladeOverlay, rebuildGrassBladeOverlay } from './grassBladeOverlay.js';
import { createDecorOverlay, rebuildDecorOverlay } from './decorOverlay.js';
import { createCharacterOverlay, rebuildCharacterOverlay } from './characterOverlay.js';
import { createWaterSurfaceOverlay, rebuildWaterSurfaceOverlay } from './waterSurfaceOverlay.js';
import { createWaterZoneOverlay, rebuildWaterZoneOverlay } from './waterZoneOverlay.js';
import { applySceneCurvatureFlags } from './threeSetup.js';
import { attachHelpTooltip } from './help.js';
import { registerLangRefresh, getLangFile } from './gameLangReactive.js';

// Rythme artificiel à ×1 (pas de vrais timestamps, cf. décision utilisateur).
// 700ms (2026-07-16, doublé depuis 350ms) — jugé trop rapide en test réel, en particulier
// aux vitesses ×4/×8 (quasi-instantané avec 350ms de base).
const BASE_INTERVAL_MS = 700;

// ─── i18n minimal (textes du panneau replay) ─────────────────────────────────────────
const _langFile = getLangFile();
const _replayText = await fetch(`./json/languages/${_langFile}.json`)
  .then(r => r.json())
  .then(data => data?.game?.replay ?? {})
  .catch(err => {
    console.error(`[replayEngine] Impossible de charger ${_langFile}.json`, err);
    return {};
  });
registerLangRefresh((data) => {
  const fresh = data?.game?.replay ?? {};
  for (const k of Object.keys(_replayText)) delete _replayText[k];
  Object.assign(_replayText, fresh);
});

/**
 * @param {object} deps
 * @param {THREE.Scene} deps.scene
 * @param {() => Array} deps.getPlacementHistory - référence live (lecture seule) vers placementHistory
 * @param {() => Map} deps.getPlacedTiles - référence live (lecture seule) vers placedTiles, pour masquer les meshes réels
 * @param {object} deps.liveGroups - groupes 3D réels à masquer/réafficher pendant le replay
 * @param {(enabled: boolean) => void} deps.setPlacementInputEnabled - désactive le clic de pose pendant le replay
 * @param {() => boolean} deps.getWorldCurvatureEnabled
 */
export function initReplayEngine(deps) {
  const { scene, getPlacementHistory, getPlacedTiles, liveGroups, setPlacementInputEnabled } = deps;

  // ─── Groupes 3D parallèles (créés une seule fois, réutilisés à chaque ouverture) ────
  const replayTilesGroup = new THREE.Group();
  replayTilesGroup.name = 'replay-tiles';
  const groups = {
    terrain: createTerrainMergeGroup(),
    forest: createForestOverlay(),
    house: createHouseOverlay(),
    rail: createRailTrainOverlay(),
    sheep: createSheepOverlay(),
    boat: createWaterBoatOverlay(),
    wheat: createFieldWheatOverlay(),
    grass: createGrassBladeOverlay(),
    decor: createDecorOverlay(),
    character: createCharacterOverlay(),
    waterSurface: createWaterSurfaceOverlay(),
    waterZone: createWaterZoneOverlay()
  };
  scene.add(replayTilesGroup, groups.terrain, groups.forest, groups.house, groups.rail, groups.sheep,
    groups.boat, groups.wheat, groups.grass, groups.decor, groups.character, groups.waterSurface, groups.waterZone);
  for (const g of [replayTilesGroup, ...Object.values(groups)]) g.visible = false;

  // ─── État de lecture ──────────────────────────────────────────────────────────────
  let isOpen = false;
  let playing = false;
  let speed = 1;
  let revealedCount = 0;   // nombre de tuiles déjà révélées dans CE replay
  let lastRevealAt = 0;
  let rafHandle = null;
  // Enregistrement vidéo (2026-07-16) — cf. startRecording()/stopRecording() plus bas.
  let isRecording = false;
  let mediaRecorder = null;
  let recordedChunks = [];
  // File d'attente des rebuilds d'overlays différés — même principe que overlayRebuildQueue
  // dans scene.js (1 seul traité par tick, jamais tous d'un coup) : évite les pics CPU/GPU
  // si plusieurs types d'overlay sont concernés par une même tuile ou si la vitesse est élevée.
  const pendingOverlayRebuilds = new Map();

  // ─── DOM overlay (bandeau flottant, PAS un voile plein écran — la caméra reste libre) ──
  let panelEl = null;
  ensurePanel();

  function ensurePanel() {
    if (panelEl) return;
    panelEl = document.createElement('div');
    panelEl.id = 'replayOverlay';
    panelEl.className = 'replay-overlay hidden';
    panelEl.setAttribute('aria-hidden', 'true');
    // Boutons : classes `debug-light-toggle` (2026-07-16, retour utilisateur "le HUD replay
    // doit voir les mêmes CSS que les autres HUD") — même style que FPS/EDA/📷/🖼️/🎬
    // (css/eda.css), pas de classe custom séparée. `debug-light-toggle--lut-active` réutilisé
    // pour l'état actif du sélecteur de vitesse (même pattern que le bouton FPS actif).
    // 2026-07-16 — retour utilisateur : le score numérique sous le compteur de tours
    // (ex. "2357") retiré — inutile pendant le replay. Compteur de tours (ex. "31/31")
    // agrandi + police BebasNeue (cf. .replay-progress dans eda.css, même police que le
    // reste du HUD jeu : #arcadeScore, deck.css, etc.).
    // 2026-07-16 — retour utilisateur : emojis des boutons agrandis + centrés verticalement,
    // exactement comme #snapshotBtn/#galleryBtn (span interne `.replay-btn-emoji` + flex
    // centering côté CSS, cf. eda.css) — auparavant l'emoji était le textContent brut du
    // <button>, minuscule et mal centré par rapport aux autres boutons du bandeau.
    panelEl.innerHTML = `
      <div class="replay-panel" role="dialog" aria-label="Replay">
        <div class="internal-parchment">
        <div class="replay-hud">
          <span class="replay-progress"><span id="replayIndex">0</span>/<span id="replayTotal">0</span></span>
        </div>
        <div class="replay-controls">
          <button id="replayRestartBtn" type="button" class="debug-light-toggle"><span class="replay-btn-emoji">🔁</span></button>
          <button id="replayRecordBtn" type="button" class="debug-light-toggle"><span class="replay-btn-emoji">🔴</span></button>
          <button id="replayPlayPause" type="button" class="debug-light-toggle"><span class="replay-btn-emoji">⏸</span></button>
          <button data-speed="1" type="button" class="debug-light-toggle replay-speed debug-light-toggle--lut-active">×1</button>
          <button data-speed="2" type="button" class="debug-light-toggle replay-speed">×2</button>
          <button data-speed="4" type="button" class="debug-light-toggle replay-speed">×4</button>
          <button data-speed="8" type="button" class="debug-light-toggle replay-speed">×8</button>
          <button id="replayCloseBtn" type="button" class="debug-light-toggle"><span class="replay-btn-emoji">✕</span></button>
        </div>
        </div>
      </div>
    `;
    document.body.appendChild(panelEl);

    panelEl.querySelector('#replayRestartBtn').addEventListener('click', restartReplay);
    panelEl.querySelector('#replayRecordBtn').addEventListener('click', toggleRecording);
    panelEl.querySelector('#replayPlayPause').addEventListener('click', togglePlayPause);
    panelEl.querySelector('#replayCloseBtn').addEventListener('click', closeReplay);
    panelEl.querySelectorAll('.replay-speed').forEach(btn => {
      btn.addEventListener('click', () => setSpeed(Number(btn.dataset.speed)));
    });
    // 2026-07-16 — fix : ESC ouvrait AUSSI l'aide (handler global 'h'/Escape dans scene.js,
    // toggleHelp()) en plus de fermer le replay — les deux écoutaient 'keydown' sur le même
    // document. Capture=true + stopImmediatePropagation() : ce handler s'exécute AVANT celui
    // de scene.js (ajouté après, en phase bulle) et coupe la propagation pour ce cas précis,
    // sans toucher au comportement d'ESC hors replay.
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        e.stopImmediatePropagation();
        closeReplay();
      }
    }, true);
    attachHelpTooltip(panelEl.querySelector('#replayRestartBtn'), () => _replayText.restart ?? 'Revenir au début');
    attachHelpTooltip(panelEl.querySelector('#replayRecordBtn'), () => isRecording ? (_replayText.recordStop ?? 'Arrêter l\'enregistrement et télécharger') : (_replayText.recordStart ?? 'Enregistrer le replay en vidéo'));
    attachHelpTooltip(panelEl.querySelector('#replayPlayPause'), () => _replayText.playPause ?? 'Lecture / Pause');
    attachHelpTooltip(panelEl.querySelector('#replayCloseBtn'), () => _replayText.close ?? 'Fermer le replay');
  }

  function restartReplay() {
    if (!isOpen) return;
    revealedCount = 0;
    lastRevealAt = 0;
    playing = true;
    pendingOverlayRebuilds.clear();
    disposeGroupContents(replayTilesGroup);
    for (const g of Object.values(groups)) g.clear();
    updateHudText(0, getPlacementHistory().length);
    setPlayPauseIcon('⏸');
  }

  // ─── Ouverture / fermeture ────────────────────────────────────────────────────────
  function openReplay() {
    const history = getPlacementHistory();
    if (!history || history.length === 0) return; // rien à rejouer
    if (isOpen) return;
    isOpen = true;
    playing = true;
    revealedCount = 0;
    lastRevealAt = 0;
    pendingOverlayRebuilds.clear();

    setPlacementInputEnabled(false);

    // Masquer le plateau réel (JAMAIS modifié, juste caché le temps du replay).
    for (const key of Object.keys(liveGroups)) {
      const g = liveGroups[key];
      if (g) g.visible = false;
    }
    for (const pt of getPlacedTiles().values()) {
      if (pt.mesh) pt.mesh.visible = false;
    }

    for (const g of [replayTilesGroup, ...Object.values(groups)]) g.visible = true;

    panelEl.classList.remove('hidden');
    panelEl.setAttribute('aria-hidden', 'false');
    setPlayPauseIcon('⏸');
    updateHudText(0, history.length);

    rafHandle = requestAnimationFrame(tick);
  }

  function closeReplay() {
    if (!isOpen) return;
    isOpen = false;
    playing = false;
    // Sécurité : si un enregistrement est en cours au moment de la fermeture, on le
    // finalise (stop + téléchargement) plutôt que de laisser un MediaRecorder orphelin.
    if (isRecording) stopRecording();
    if (rafHandle) cancelAnimationFrame(rafHandle);
    rafHandle = null;

    // Détruire tout le contenu replay (jamais le plateau réel — lui n'a jamais bougé).
    disposeGroupContents(replayTilesGroup);
    for (const g of Object.values(groups)) g.clear();
    for (const g of [replayTilesGroup, ...Object.values(groups)]) g.visible = false;

    // Réafficher le plateau réel tel qu'il était (jamais modifié pendant le replay).
    for (const key of Object.keys(liveGroups)) {
      const g = liveGroups[key];
      if (g) g.visible = true;
    }
    for (const pt of getPlacedTiles().values()) {
      if (pt.mesh) pt.mesh.visible = true;
    }

    setPlacementInputEnabled(true);
    panelEl.classList.add('hidden');
    panelEl.setAttribute('aria-hidden', 'true');
  }

  function togglePlayPause() {
    playing = !playing;
    setPlayPauseIcon(playing ? '⏸' : '▶');
    if (playing && !rafHandle) rafHandle = requestAnimationFrame(tick);
  }

  function setPlayPauseIcon(text) {
    const icon = panelEl.querySelector('#replayPlayPause .replay-btn-emoji');
    if (icon) icon.textContent = text;
  }

  // ─── Enregistrement vidéo (2026-07-16, demande utilisateur : "bouton enregistrer/
  // downloader avec les boutons du HUD replay") — capture le <canvas> WebGL du jeu
  // (id="app", cf. scene.js) via canvas.captureStream() + MediaRecorder, en WebM
  // (seul format d'enregistrement natif des navigateurs, aucune dépendance serveur).
  // Le fichier se télécharge automatiquement dès l'arrêt de l'enregistrement (bouton
  // recliqué, ou replay fermé/terminé pendant qu'on enregistrait).
  function toggleRecording() {
    if (isRecording) stopRecording();
    else startRecording();
  }

  function pickRecordingMimeType() {
    const candidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    for (const type of candidates) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(type)) return type;
    }
    return 'video/webm';
  }

  function startRecording() {
    if (isRecording) return;
    const canvas = document.getElementById('app');
    if (!canvas?.captureStream || typeof MediaRecorder === 'undefined') {
      console.warn('[replayEngine] Enregistrement vidéo non supporté par ce navigateur.');
      return;
    }
    try {
      const stream = canvas.captureStream(30);
      recordedChunks = [];
      mediaRecorder = new MediaRecorder(stream, { mimeType: pickRecordingMimeType() });
      mediaRecorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) recordedChunks.push(e.data); };
      mediaRecorder.onstop = downloadRecording;
      mediaRecorder.start();
    } catch (error) {
      console.error('[replayEngine] Impossible de démarrer l\'enregistrement vidéo', error);
      mediaRecorder = null;
      return;
    }
    isRecording = true;
    updateRecordButton();
  }

  function stopRecording() {
    if (!isRecording) return;
    isRecording = false;
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
    updateRecordButton();
  }

  function downloadRecording() {
    if (!recordedChunks.length) return;
    const blob = new Blob(recordedChunks, { type: mediaRecorder?.mimeType || 'video/webm' });
    recordedChunks = [];
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hexistenz-replay-${Date.now()}.webm`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function updateRecordButton() {
    const btn = panelEl.querySelector('#replayRecordBtn');
    const icon = btn?.querySelector('.replay-btn-emoji');
    if (icon) icon.textContent = isRecording ? '⏹' : '🔴';
    btn?.classList.toggle('debug-light-toggle--lut-active', isRecording);
  }

  function setSpeed(next) {
    speed = next;
    panelEl.querySelectorAll('.replay-speed').forEach(btn => {
      btn.classList.toggle('debug-light-toggle--lut-active', Number(btn.dataset.speed) === next);
    });
  }

  // ─── Boucle de lecture (indépendante de la boucle de rendu du jeu — celle-ci ne fait
  // que décider QUAND révéler la tuile suivante ; le rendu réel des groupes replay passe
  // par le même renderer.render(scene, camera) déjà appelé en continu par scene.js) ────
  function tick(now) {
    if (!isOpen) return;
    rafHandle = requestAnimationFrame(tick);

    // Un seul rebuild d'overlay différé traité par frame — même principe que
    // overlayRebuildQueue (scene.js) : jamais tout d'un coup, même si plusieurs types
    // sont en attente à la fois (ex. une tuile rail+eau+forêt).
    if (pendingOverlayRebuilds.size > 0) {
      const [[name, fn]] = pendingOverlayRebuilds;
      pendingOverlayRebuilds.delete(name);
      fn();
    }

    if (!playing) return;
    const history = getPlacementHistory();
    if (revealedCount >= history.length) { playing = false; return; }

    const intervalMs = BASE_INTERVAL_MS / speed;
    if (now - lastRevealAt < intervalMs) return;
    lastRevealAt = now;
    revealNext(history);
  }

  function revealNext(history) {
    const placedTile = history[revealedCount];
    revealedCount++;

    // Mesh individuel de la tuile (routes/rails restent sur ce mesh, cf. terrainMerge.js —
    // seul le terrain lui-même est fusionné séparément ci-dessous).
    const position = axialToWorld(placedTile.q, placedTile.r);
    const mesh = createTileMeshForReplay(placedTile, position);
    replayTilesGroup.add(mesh);
    applySceneCurvatureFlags(replayTilesGroup);

    // Sous-ensemble croissant (clé → placedTile) pour les rebuilds "pleins" déjà
    // existants (undo/init/resync multi) — jamais de nouvelle logique de reconstruction.
    const subset = buildSubsetMap(history, revealedCount);
    rebuildTerrainMerge(groups.terrain, subset);
    applySceneCurvatureFlags(groups.terrain);

    // Overlays : uniquement ceux concernés par le type de bord de LA tuile qui vient
    // d'apparaître (même filtre que placeTile() dans scene.js), différés dans la file
    // ci-dessus plutôt que rebuild immédiat — évite les pics à vitesse ×4/×8.
    const tEdgeTypes = new Set(Object.values(placedTile.tile.edges).map(e => getEdgeType(e)));
    const queue = (name, fn) => pendingOverlayRebuilds.set(name, () => { fn(); applySceneCurvatureFlags(groups[name]); });
    if (tEdgeTypes.has(EDGE_TYPES.rail))   queue('rail',  () => rebuildRailTrainOverlay(groups.rail, subset));
    if (tEdgeTypes.has(EDGE_TYPES.water)) {
      queue('boat',  () => rebuildWaterBoatOverlay(groups.boat, subset));
      queue('waterSurface', () => rebuildWaterSurfaceOverlay(groups.waterSurface, subset));
      // 2026-07-16 — masquer les labels hexagonaux de zones contiguës (compteurs de
      // score par zone) pendant le replay : demande explicite, le replay n'a pas vocation
      // à être "jouable" (pas de placement possible), ces labels d'aide à la décision n'ont
      // donc aucune utilité et ajoutent du bruit visuel. rebuildWaterZoneOverlay() les
      // recrée en même temps que les contours d'eau (même overlay) — on les masque juste
      // après coup plutôt que de toucher waterZoneOverlay.js (userData.isZoneLabel déjà
      // posé sur chaque label, cf. waterZoneLabels.js).
      queue('waterZone', () => {
        rebuildWaterZoneOverlay(groups.waterZone, subset);
        groups.waterZone.traverse(obj => { if (obj.userData?.isZoneLabel) obj.visible = false; });
      });
    }
    if (tEdgeTypes.has(EDGE_TYPES.field))  queue('wheat', () => rebuildFieldWheatOverlay(groups.wheat, subset));
    if (tEdgeTypes.has(EDGE_TYPES.grass) || tEdgeTypes.has(EDGE_TYPES.forest)) {
      queue('grass', () => rebuildGrassBladeOverlay(groups.grass, subset));
      queue('sheep', () => rebuildSheepOverlay(groups.sheep, subset));
    }
    const needsForest = tEdgeTypes.has(EDGE_TYPES.forest) || tEdgeTypes.has(EDGE_TYPES.field) || tEdgeTypes.has(EDGE_TYPES.house);
    if (needsForest) {
      queue('forest', () => rebuildForestOverlay(groups.forest, subset, placedTile));
      queue('character', () => rebuildCharacterOverlay(groups.character, subset));
    }
    if (tEdgeTypes.has(EDGE_TYPES.house))  queue('house', () => rebuildHouseOverlay(groups.house, subset));
    queue('decor', () => rebuildDecorOverlay(groups.decor, subset));

    updateHudText(revealedCount, history.length);

    if (revealedCount >= history.length) playing = false;
  }

  function buildSubsetMap(history, count) {
    const map = new Map();
    for (let i = 0; i < count; i++) map.set(history[i].key, history[i]);
    return map;
  }

  // Score numérique retiré du HUD replay (2026-07-16, retour utilisateur) — ne reste que
  // le compteur de tours (index/total).
  function updateHudText(index, total) {
    const idxEl = panelEl.querySelector('#replayIndex');
    const totEl = panelEl.querySelector('#replayTotal');
    if (idxEl) idxEl.textContent = String(index);
    if (totEl) totEl.textContent = String(total);
  }

  function disposeGroupContents(group) {
    for (const child of [...group.children]) {
      group.remove(child);
      child.traverse?.(node => {
        node.geometry?.dispose?.();
        if (Array.isArray(node.material)) node.material.forEach(m => m?.dispose?.());
        else node.material?.dispose?.();
      });
    }
  }

  return {
    open: openReplay,
    close: closeReplay,
    isOpen: () => isOpen,
    // 2026-07-16 — exposés pour scene.js : la fumée volumétrique (cheminées/locos) lit ces
    // groupes en temps réel dans la boucle de rendu principale (cf. scene.js, bloc "Fumée
    // volumétrique") — pendant un replay, elle doit lire les groupes PARALLÈLES du replay,
    // pas les groupes réels masqués (sinon fumée des maisons/trains réels visible avant que
    // le replay ne les révèle).
    getHouseGroup: () => groups.house,
    getRailGroup: () => groups.rail
  };
}

function createTileMeshForReplay(placedTile, position) {
  const mesh = createTileMesh(placedTile.tile, { worldX: position.x, worldZ: position.z });
  mesh.position.set(position.x, 0.003, position.z);
  hideTerrainMeshes(mesh); // le terrain de cette tuile est rendu par groups.terrain (fusionné)
  return mesh;
}
