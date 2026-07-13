<?php
// Textes bilingues du jeu — json/languages/{french,english}.json (2026-07-12),
// clé "game.ui". Même mécanisme que index.php (dual-render data-fr/data-en +
// tr($t,$lang,$path)) : la langue affichée est purement client-side (CSS +
// script de bootstrap ci-dessous), pilotée par le même choix que la prez
// (localStorage 'hexistenz_pres_lang'). Chargement dupliqué volontairement
// (pas d'include partagé avec index.php) pour ne pas toucher un fichier déjà
// validé.
$langDir = __DIR__ . '/json/languages/';
$t = [
    'fr' => json_decode(@file_get_contents($langDir . 'french.json'), true) ?: [],
    'en' => json_decode(@file_get_contents($langDir . 'english.json'), true) ?: [],
];
function tr($t, $lang, $path) {
    $node = $t[$lang] ?? [];
    foreach (explode('.', $path) as $part) {
        if (!is_array($node) || !array_key_exists($part, $node)) return '';
        $node = $node[$part];
    }
    return $node;
}
?>
<!doctype html>
<html lang="fr" data-lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Hexistenz</title>
  <link rel="icon" type="image/svg+xml" href="favicon.svg" />
  <link rel="stylesheet" href="css/style.css" />
  <link rel="stylesheet" href="css/multiplayerUi.css" />
  <link rel="stylesheet" href="css/scorePopup.css" />
  <style>
    /* Harmonisation HUD/aide : village = nouvelles couleurs brun/gris terre battue + gravier. */
    .swatch.house {
      background: linear-gradient(135deg, #b8ad90 0%, #8b8069 42%, #706653 68%, #a99d80 100%);
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.18), inset 0 -2px 4px rgba(47,43,35,0.35);
    }
    /* Bascule bilingue FR/EN (mêmes règles que css/presentation.css pour la prez). */
    [data-lang="fr"] [data-en] { display: none !important; }
    [data-lang="en"] [data-fr] { display: none !important; }
  </style>

  <!-- Three.js local — élimine la dépendance CDN et la double-instance -->
  <link rel="modulepreload" href="./vendor/three.module.js" />
  <script type="importmap">
    {
      "imports": {
        "three": "./vendor/three.module.js",
        "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js": "./vendor/three.module.js"
      }
    }
  </script>
  <script>
    // Restaure la langue choisie dans la prez, avant le premier paint (évite tout flash FR/EN).
    (function() {
      var l = localStorage.getItem('hexistenz_pres_lang') === 'en' ? 'en' : 'fr';
      document.documentElement.dataset.lang = l;
    })();
  </script>
</head>
<body>
  <canvas id="app"></canvas>

  <div id="scorePopup" aria-hidden="true"></div>

  <!-- Modal fin de partie : enregistrement du score au classement mondial.
       Centré plein écran, indépendant du HUD #scorePanel (jamais la liste des
       highscores ici — celle-ci ne vit que dans la prez, rubrique Classement). -->
  <div id="highscoreModal" class="highscore-modal hidden">
    <div class="highscore-modal-panel">
      <div class="highscore-modal-kicker"><span data-fr><?= tr($t,'fr','game.ui.modals.scoreEnd.kicker') ?></span><span data-en><?= tr($t,'en','game.ui.modals.scoreEnd.kicker') ?></span></div>
      <div class="highscore-modal-score"><span id="highscoreModalScoreValue">0</span></div>
      <button id="btnSaveScore" type="button"><span data-fr><?= tr($t,'fr','game.ui.modals.scoreEnd.save') ?></span><span data-en><?= tr($t,'en','game.ui.modals.scoreEnd.save') ?></span></button>
      <div id="highscoreStatus" class="highscore-status"></div>
    </div>
  </div>

  <!-- Modal de confirmation "ABANDONNER" — évite qu'un clic accidentel termine la partie
       (une partie abandonnée ne peut plus être reprise, cf. multiplayer.php). -->
  <div id="abandonConfirmModal" class="highscore-modal hidden">
    <div class="highscore-modal-panel">
      <div class="highscore-modal-kicker"><span data-fr><?= tr($t,'fr','game.ui.modals.abandon.kicker') ?></span><span data-en><?= tr($t,'en','game.ui.modals.abandon.kicker') ?></span></div>
      <div class="highscore-modal-sub"><span data-fr><?= tr($t,'fr','game.ui.modals.abandon.sub') ?></span><span data-en><?= tr($t,'en','game.ui.modals.abandon.sub') ?></span></div>
      <div class="game-action-row">
        <button id="btnAbandonCancel" class="new-game-button" type="button"><span data-fr><?= tr($t,'fr','game.ui.modals.abandon.cancel') ?></span><span data-en><?= tr($t,'en','game.ui.modals.abandon.cancel') ?></span></button>
        <button id="btnAbandonConfirm" class="abandon-button" type="button"><span data-fr><?= tr($t,'fr','game.ui.modals.abandon.confirm') ?></span><span data-en><?= tr($t,'en','game.ui.modals.abandon.confirm') ?></span></button>
      </div>
    </div>
  </div>

  <div id="arcadeScore"><span id="dbgScore">0</span><span class="arcade-suffix">pts <span id="dbgLastScore"></span></span></div>

  <aside id="scorePanel">
    <div id="multiplayerInfo" hidden class="multiplayer-info">
      <div class="multiplayer-info-block">
        <div class="score-title"><span data-fr><?= tr($t,'fr','game.ui.hud.player') ?></span><span data-en><?= tr($t,'en','game.ui.hud.player') ?></span></div>
        <div id="multiPlayerName" class="multiplayer-info-value">—</div>
      </div>
      <div class="multiplayer-info-block">
        <div class="score-title"><span data-fr><?= tr($t,'fr','game.ui.hud.room') ?></span><span data-en><?= tr($t,'en','game.ui.hud.room') ?></span></div>
        <div id="multiRoomCode" class="multiplayer-info-value">—</div>
      </div>
    </div>
    <div class="game-action-row">
      <button id="btnAbandonGame" class="abandon-button" type="button"><span data-fr><?= tr($t,'fr','game.ui.hud.abandon') ?></span><span data-en><?= tr($t,'en','game.ui.hud.abandon') ?></span></button>
      <button id="btnNewGame" class="new-game-button" type="button"><span data-fr><?= tr($t,'fr','game.ui.hud.newGame') ?></span><span data-en><?= tr($t,'en','game.ui.hud.newGame') ?></span></button>
    </div>

    <div id="statsPanel" class="stats-panel">
	  <div class="stats-title"><span data-fr><?= tr($t,'fr','game.ui.hud.statsTitle') ?></span><span data-en><?= tr($t,'en','game.ui.hud.statsTitle') ?></span></div>
      <div class="stats-summary-row">
        <div class="stats-summary-card stats-field"><span><span data-fr><?= tr($t,'fr','game.ui.hud.mills') ?></span><span data-en><?= tr($t,'en','game.ui.hud.mills') ?></span></span><div class="stats-num-group"><strong id="statMills">0</strong><span class="stats-emoji">⚙️</span></div></div>
        <div class="stats-summary-card stats-trains"><span><span data-fr><?= tr($t,'fr','game.ui.hud.trains') ?></span><span data-en><?= tr($t,'en','game.ui.hud.trains') ?></span></span><div class="stats-num-group"><strong id="statTrains">0</strong><span class="stats-emoji">🚂</span></div></div><div class="stats-summary-card stats-boats"><span><span data-fr><?= tr($t,'fr','game.ui.hud.boats') ?></span><span data-en><?= tr($t,'en','game.ui.hud.boats') ?></span></span><div class="stats-num-group"><strong id="statBoats">0</strong><span class="stats-emoji">⛵</span></div></div><div class="stats-summary-card stats-comets"><span><span data-fr><?= tr($t,'fr','game.ui.hud.comets') ?></span><span data-en><?= tr($t,'en','game.ui.hud.comets') ?></span></span><div class="stats-num-group"><strong id="statComets">0</strong><span class="stats-emoji">☄️</span></div></div>
      </div>
      <div class="stats-card-grid">
        <div class="stats-card stats-grass">
          <div class="stats-card-head"><span class="stats-icon">🌿</span><span><span data-fr><?= tr($t,'fr','game.ui.hud.biomes.grass') ?></span><span data-en><?= tr($t,'en','game.ui.hud.biomes.grass') ?></span></span></div>
          <div class="stats-metrics"><div><span><span data-fr><?= tr($t,'fr','game.ui.hud.total') ?></span><span data-en><?= tr($t,'en','game.ui.hud.total') ?></span></span><strong id="statGrass">0</strong></div><div><span><span data-fr><?= tr($t,'fr','game.ui.hud.surfaceMax') ?></span><span data-en><?= tr($t,'en','game.ui.hud.surfaceMax') ?></span></span><strong id="statLargestGrass">0</strong></div></div>
        </div>

        <div class="stats-card stats-field">
          <div class="stats-card-head"><span class="stats-icon">🌾</span><span><span data-fr><?= tr($t,'fr','game.ui.hud.biomes.field') ?></span><span data-en><?= tr($t,'en','game.ui.hud.biomes.field') ?></span></span></div>
          <div class="stats-metrics"><div><span><span data-fr><?= tr($t,'fr','game.ui.hud.total') ?></span><span data-en><?= tr($t,'en','game.ui.hud.total') ?></span></span><strong id="statField">0</strong></div><div><span><span data-fr><?= tr($t,'fr','game.ui.hud.surfaceMax') ?></span><span data-en><?= tr($t,'en','game.ui.hud.surfaceMax') ?></span></span><strong id="statLargestField">0</strong></div></div>
        </div>

        <div class="stats-card stats-forest">
          <div class="stats-card-head"><span class="stats-icon">🌲</span><span><span data-fr><?= tr($t,'fr','game.ui.hud.biomes.forest') ?></span><span data-en><?= tr($t,'en','game.ui.hud.biomes.forest') ?></span></span></div>
          <div class="stats-metrics"><div><span><span data-fr><?= tr($t,'fr','game.ui.hud.total') ?></span><span data-en><?= tr($t,'en','game.ui.hud.total') ?></span></span><strong id="statForest">0</strong></div><div><span><span data-fr><?= tr($t,'fr','game.ui.hud.surfaceMax') ?></span><span data-en><?= tr($t,'en','game.ui.hud.surfaceMax') ?></span></span><strong id="statLargestForest">0</strong></div></div>
        </div>

        <div class="stats-card stats-house">
          <div class="stats-card-head"><span class="stats-icon">🛖</span><span><span data-fr><?= tr($t,'fr','game.ui.hud.biomes.house') ?></span><span data-en><?= tr($t,'en','game.ui.hud.biomes.house') ?></span></span></div>
          <div class="stats-metrics"><div><span><span data-fr><?= tr($t,'fr','game.ui.hud.total') ?></span><span data-en><?= tr($t,'en','game.ui.hud.total') ?></span></span><strong id="statHouse">0</strong></div><div><span><span data-fr><?= tr($t,'fr','game.ui.hud.surfaceMax') ?></span><span data-en><?= tr($t,'en','game.ui.hud.surfaceMax') ?></span></span><strong id="statLargestHouse">0</strong></div></div>
        </div>

        <div class="stats-card stats-water">
          <div class="stats-card-head"><span class="stats-icon">💧</span><span><span data-fr><?= tr($t,'fr','game.ui.hud.biomes.water') ?></span><span data-en><?= tr($t,'en','game.ui.hud.biomes.water') ?></span></span></div>
          <div class="stats-metrics"><div><span><span data-fr><?= tr($t,'fr','game.ui.hud.total') ?></span><span data-en><?= tr($t,'en','game.ui.hud.total') ?></span></span><strong id="statWater">0</strong></div><div><span><span data-fr><?= tr($t,'fr','game.ui.hud.surfaceMax') ?></span><span data-en><?= tr($t,'en','game.ui.hud.surfaceMax') ?></span></span><strong id="statLargestWater">0</strong></div></div>
        </div>

        <div class="stats-card stats-rail">
          <div class="stats-card-head"><span class="stats-icon">🛤️</span><span><span data-fr><?= tr($t,'fr','game.ui.hud.biomes.rail') ?></span><span data-en><?= tr($t,'en','game.ui.hud.biomes.rail') ?></span></span></div>
          <div class="stats-metrics"><div><span><span data-fr><?= tr($t,'fr','game.ui.hud.total') ?></span><span data-en><?= tr($t,'en','game.ui.hud.total') ?></span></span><strong id="statRail">0</strong></div><div><span><span data-fr><?= tr($t,'fr','game.ui.hud.railMax') ?></span><span data-en><?= tr($t,'en','game.ui.hud.railMax') ?></span></span><strong id="statLargestRail">0</strong></div></div>
        </div>
      </div>
    </div>
  </aside>


  <aside id="tileUI">
    <div class="tilePreviewRow">
      <div class="tileBox">
        <div class="title"><span data-fr><?= tr($t,'fr','game.ui.hud.activeTileTitle') ?></span><span data-en><?= tr($t,'en','game.ui.hud.activeTileTitle') ?></span></div>
        <div id="activeTile"></div>
      </div>
      <div class="tileBox">
        <div class="title"><span data-fr><?= tr($t,'fr','game.ui.hud.nextTileTitle') ?></span><span data-en><?= tr($t,'en','game.ui.hud.nextTileTitle') ?></span></div>
        <div id="nextTile"></div>
      </div>
    </div>

    <div class="tileCountRow">
      <div class="deckRemainingBox">
        <div class="title"><span data-fr><?= tr($t,'fr','game.ui.hud.deckRemaining') ?></span><span data-en><?= tr($t,'en','game.ui.hud.deckRemaining') ?></span></div>
        <div id="deckRemaining">50</div>
      </div>
      <div class="deckRemainingBox">
        <div class="title"><span data-fr><?= tr($t,'fr','game.ui.hud.tilesPlaced') ?></span><span data-en><?= tr($t,'en','game.ui.hud.tilesPlaced') ?></span></div>
        <div id="tilesPlaced">0</div>
      </div>
    </div>

    <div class="missionsBox">
      <div class="title"><span data-fr><?= tr($t,'fr','game.ui.hud.missionsTitle') ?></span><span data-en><?= tr($t,'en','game.ui.hud.missionsTitle') ?></span></div>
      <ul id="missionList" class="missionList">
        <li class="mission-empty"><span data-fr><?= tr($t,'fr','game.ui.hud.noMission') ?></span><span data-en><?= tr($t,'en','game.ui.hud.noMission') ?></span></li>
      </ul>
    </div>
  </aside>

  <section id="helpOverlay" class="help-overlay hidden" aria-hidden="true">
    <div class="help-panel" role="dialog" aria-modal="true" aria-labelledby="helpTitle">
      <header class="help-header">
        <div>
          <h1 id="helpTitle"><span data-fr><?= tr($t,'fr','game.ui.help.title') ?></span><span data-en><?= tr($t,'en','game.ui.help.title') ?></span></h1>

        </div>
        <button id="btnCloseHelp" class="help-close" type="button" aria-label="<?= htmlspecialchars(tr($t,'fr','game.ui.help.closeAria')) ?>">×</button>
      </header>

      <div class="help-grid">
       <div class="help-top-row">
        <div class="help-col-main">
        <article class="help-card help-card-wide help-card-rules">
          <h2>🎯 <span data-fr><?= tr($t,'fr','game.ui.help.objective.title') ?></span><span data-en><?= tr($t,'en','game.ui.help.objective.title') ?></span></h2>
          <p><span data-fr><?= tr($t,'fr','game.ui.help.objective.text') ?></span><span data-en><?= tr($t,'en','game.ui.help.objective.text') ?></span></p>
          <div class="score-strip">
            <div><strong>+2 points</strong><span><span data-fr><?= tr($t,'fr','game.ui.help.objective.points.tile') ?></span><span data-en><?= tr($t,'en','game.ui.help.objective.points.tile') ?></span></span></div>
            <div><strong>+10 points</strong><span><span data-fr><?= tr($t,'fr','game.ui.help.objective.points.edge') ?></span><span data-en><?= tr($t,'en','game.ui.help.objective.points.edge') ?></span></span></div>
            <div><strong>+25 points</strong><span><span data-fr><?= tr($t,'fr','game.ui.help.objective.points.waterRail') ?></span><span data-en><?= tr($t,'en','game.ui.help.objective.points.waterRail') ?></span></span></div>
            <div><strong>+50 points</strong><span><span data-fr><?= tr($t,'fr','game.ui.help.objective.points.surround') ?></span><span data-en><?= tr($t,'en','game.ui.help.objective.points.surround') ?></span></span></div>
            <div><strong>+100 points + 3 tuiles</strong><span><span data-fr><?= tr($t,'fr','game.ui.help.objective.points.mission') ?></span><span data-en><?= tr($t,'en','game.ui.help.objective.points.mission') ?></span></span></div>
            <div><strong>+1500 points</strong><span><span data-fr><?= tr($t,'fr','game.ui.help.objective.points.bonus') ?></span><span data-en><?= tr($t,'en','game.ui.help.objective.points.bonus') ?></span></span></div>
          </div>
          <ul class="placement-list">
<?php foreach (tr($t,'fr','game.ui.help.placement.items') as $i => $frItem): $enItem = tr($t,'en','game.ui.help.placement.items')[$i] ?? ''; ?>
            <li><span data-fr><?= $frItem ?></span><span data-en><?= $enItem ?></span></li>
<?php endforeach; ?>
          </ul>
        </article>

        <div class="help-row-pair">
        <article class="help-card help-card-waterrail">
          <h2>🌊 <span data-fr><?= tr($t,'fr','game.ui.help.waterRail.title') ?></span><span data-en><?= tr($t,'en','game.ui.help.waterRail.title') ?></span></h2>
          <p><span data-fr><?= tr($t,'fr','game.ui.help.waterRail.text') ?></span><span data-en><?= tr($t,'en','game.ui.help.waterRail.text') ?></span></p>
          <div class="rule-line"><span class="swatch water"></span><strong>Eau</strong><span><span data-fr><?= tr($t,'fr','game.ui.help.waterRail.water') ?></span><span data-en><?= tr($t,'en','game.ui.help.waterRail.water') ?></span></span></div>
          <div class="rule-line"><span class="swatch rail"></span><strong>Rail</strong><span><span data-fr><?= tr($t,'fr','game.ui.help.waterRail.rail') ?></span><span data-en><?= tr($t,'en','game.ui.help.waterRail.rail') ?></span></span></div>
        </article>

        <article class="help-card help-card-bonus">
          <h2>⭐ <span data-fr><?= tr($t,'fr','game.ui.help.bonusCells.title') ?></span><span data-en><?= tr($t,'en','game.ui.help.bonusCells.title') ?></span></h2>
          <p><span data-fr><?= tr($t,'fr','game.ui.help.bonusCells.text') ?></span><span data-en><?= tr($t,'en','game.ui.help.bonusCells.text') ?></span></p>
          <div class="rule-line"><span class="swatch bonus-cell"></span><strong>Bonus</strong><span><span data-fr><?= tr($t,'fr','game.ui.help.bonusCells.label') ?></span><span data-en><?= tr($t,'en','game.ui.help.bonusCells.label') ?></span></span></div>
        </article>
        </div>

        <div class="help-row-pair">
        <article class="help-card help-card-blackcells">
          <h2>🕳️ <span data-fr><?= tr($t,'fr','game.ui.help.blackCells.title') ?></span><span data-en><?= tr($t,'en','game.ui.help.blackCells.title') ?></span></h2>
          <p><span data-fr><?= tr($t,'fr','game.ui.help.blackCells.text') ?></span><span data-en><?= tr($t,'en','game.ui.help.blackCells.text') ?></span></p>
          <div class="rule-line"><span class="swatch black-cell"></span><strong>Joker</strong><span><span data-fr><?= tr($t,'fr','game.ui.help.blackCells.label') ?></span><span data-en><?= tr($t,'en','game.ui.help.blackCells.label') ?></span></span></div>
        </article>

        <article class="help-card help-card-textures">
          <h2>🎨 <span data-fr><?= tr($t,'fr','game.ui.help.textures.title') ?></span><span data-en><?= tr($t,'en','game.ui.help.textures.title') ?></span></h2>
          <div class="legend-grid">
<?php foreach (['field','forest','grass','house','water','rail'] as $tex): ?>
            <div><span class="swatch <?= $tex ?>"></span><span><span data-fr><?= tr($t,'fr',"game.ui.help.textures.$tex.label") ?></span><span data-en><?= tr($t,'en',"game.ui.help.textures.$tex.label") ?></span></span><code><span data-fr><?= tr($t,'fr',"game.ui.help.textures.$tex.code") ?></span><span data-en><?= tr($t,'en',"game.ui.help.textures.$tex.code") ?></span></code></div>
<?php endforeach; ?>
          </div>
        </article>
        </div>
        </div>

        <article class="help-card help-card-controls">
          <h2>⌨️ <span data-fr><?= tr($t,'fr','game.ui.help.controls.title') ?></span><span data-en><?= tr($t,'en','game.ui.help.controls.title') ?></span></h2>
          <div class="control-map">
            <div style="flex-direction:column; align-items:flex-start; gap:4px;">
              <div class="kbd-cross-pair">
                <div class="kbd-cross">
                  <kbd class="kbd-ph" aria-hidden="true">·</kbd><kbd>Z</kbd><kbd class="kbd-ph" aria-hidden="true">·</kbd>
                  <kbd>Q</kbd><kbd>S</kbd><kbd>D</kbd>
                </div>
                <div class="kbd-cross">
                  <kbd class="kbd-ph" aria-hidden="true">·</kbd><kbd>↑</kbd><kbd class="kbd-ph" aria-hidden="true">·</kbd>
                  <kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd>
                </div>
              </div>
              <span><span data-fr><?= tr($t,'fr','game.ui.help.controls.moveCamera') ?></span><span data-en><?= tr($t,'en','game.ui.help.controls.moveCamera') ?></span></span>
            </div>
            <div><kbd>R</kbd><span><span data-fr><?= tr($t,'fr','game.ui.help.controls.resetCamera') ?></span><span data-en><?= tr($t,'en','game.ui.help.controls.resetCamera') ?></span></span></div>
            <div><kbd>+</kbd><kbd>-</kbd><span><span data-fr><?= tr($t,'fr','game.ui.help.controls.zoom') ?></span><span data-en><?= tr($t,'en','game.ui.help.controls.zoom') ?></span></span></div>
            <div><kbd>Ctrl+Z</kbd><span><span data-fr><?= tr($t,'fr','game.ui.help.controls.undo') ?></span><span data-en><?= tr($t,'en','game.ui.help.controls.undo') ?></span></span></div>
            <div><kbd>H</kbd><kbd>ESC</kbd><span><span data-fr><?= tr($t,'fr','game.ui.help.controls.toggleHelp') ?></span><span data-en><?= tr($t,'en','game.ui.help.controls.toggleHelp') ?></span></span></div>
            <div><kbd>M</kbd><span><span data-fr><?= tr($t,'fr','game.ui.help.controls.muteSound') ?></span><span data-en><?= tr($t,'en','game.ui.help.controls.muteSound') ?></span></span></div>
            <div><kbd>ESPACE</kbd><span><span data-fr><?= tr($t,'fr','game.ui.help.controls.immersive') ?></span><span data-en><?= tr($t,'en','game.ui.help.controls.immersive') ?></span></span></div>
            <div><kbd>SHIFT+ESPACE</kbd><span><span data-fr><?= tr($t,'fr','game.ui.help.controls.superImmersive') ?></span><span data-en><?= tr($t,'en','game.ui.help.controls.superImmersive') ?></span></span></div>
            <div><kbd>SHIFT</kbd><span><span data-fr><?= tr($t,'fr','game.ui.help.controls.speedUp') ?></span><span data-en><?= tr($t,'en','game.ui.help.controls.speedUp') ?></span></span></div>
            <div><kbd>Molette</kbd><span><span data-fr><?= tr($t,'fr','game.ui.help.controls.wheelZoomRotate') ?></span><span data-en><?= tr($t,'en','game.ui.help.controls.wheelZoomRotate') ?></span></span></div>
            <div><kbd>Clic gauche</kbd><span><span data-fr><?= tr($t,'fr','game.ui.help.controls.moveCamera') ?></span><span data-en><?= tr($t,'en','game.ui.help.controls.moveCamera') ?></span></span></div>
            <div><kbd>Clic droit</kbd><span><span data-fr><?= tr($t,'fr','game.ui.help.controls.rightClick') ?></span><span data-en><?= tr($t,'en','game.ui.help.controls.rightClick') ?></span></span></div>
            <div class="control-sep" aria-hidden="true"></div>
            <div><kbd>F</kbd><span><span data-fr><?= tr($t,'fr','game.ui.help.controls.perfHud') ?></span><span data-en><?= tr($t,'en','game.ui.help.controls.perfHud') ?></span></span></div>
            <div><kbd>E</kbd><span><span data-fr><?= tr($t,'fr','game.ui.help.controls.eda') ?></span><span data-en><?= tr($t,'en','game.ui.help.controls.eda') ?></span></span></div>
          </div>
        </article>
       </div>

        <article class="help-card help-card-wide help-card-missions">
          <h2>🚩 <span data-fr><?= tr($t,'fr','game.ui.help.missions.title') ?></span><span data-en><?= tr($t,'en','game.ui.help.missions.title') ?></span></h2>
          <p><span data-fr><?= tr($t,'fr','game.ui.help.missions.text1') ?></span><span data-en><?= tr($t,'en','game.ui.help.missions.text1') ?></span></p>
          <p><span data-fr><?= tr($t,'fr','game.ui.help.missions.text2') ?></span><span data-en><?= tr($t,'en','game.ui.help.missions.text2') ?></span></p>
        </article>
      </div>
    </div>
  </section>

  <script type="module" src="javascript/main.js"></script>
</body>
</html>
