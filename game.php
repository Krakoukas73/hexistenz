<?php
// Textes du HUD/aide du jeu — json/languages/french.json (2026-07-12), clé "game.ui".
// Refonte i18n scalable du 2026-07-14 (cf. CONTEXT.md §21) : remplace l'ancien
// dual-render data-fr/data-en (comme l'ancienne prez, bloqué à FR/EN) par UN SEUL
// attribut data-i18n="chemin.pointé" par élément. PHP ne rend plus que le repli FR ;
// la traduction réactive (FR/EN/ES...) est appliquée côté client par
// javascript/gameHudI18n.js, qui réutilise le mécanisme déjà en place pour les
// textes JS (gameLangReactive.js).
$langDir = __DIR__ . '/json/languages/';
$t = [
    'fr' => json_decode(@file_get_contents($langDir . 'french.json'), true) ?: [],
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
    // Restaure la langue choisie (prez ou HUD in-game) avant le premier paint.
    // Le HUD lui-même reste rendu en FR par PHP ; javascript/gameHudI18n.js
    // rattrape la traduction juste après si la langue sauvegardée n'est pas FR.
    (function() {
      var l = localStorage.getItem('hexistenz_pres_lang') || 'fr';
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
      <div class="highscore-modal-kicker" data-i18n="game.ui.modals.scoreEnd.kicker"><?= tr($t,'fr','game.ui.modals.scoreEnd.kicker') ?></div>
      <div class="highscore-modal-score"><span id="highscoreModalScoreValue">0</span></div>
      <button id="btnSaveScore" type="button" data-i18n="game.ui.modals.scoreEnd.save"><?= tr($t,'fr','game.ui.modals.scoreEnd.save') ?></button>
      <div id="highscoreStatus" class="highscore-status"></div>
    </div>
  </div>

  <!-- Modal de confirmation "ABANDONNER" — évite qu'un clic accidentel termine la partie
       (une partie abandonnée ne peut plus être reprise, cf. multiplayer.php). -->
  <div id="abandonConfirmModal" class="highscore-modal hidden">
    <div class="highscore-modal-panel">
      <div class="highscore-modal-kicker" data-i18n="game.ui.modals.abandon.kicker"><?= tr($t,'fr','game.ui.modals.abandon.kicker') ?></div>
      <div class="highscore-modal-sub" data-i18n="game.ui.modals.abandon.sub"><?= tr($t,'fr','game.ui.modals.abandon.sub') ?></div>
      <div class="game-action-row">
        <button id="btnAbandonCancel" class="new-game-button" type="button" data-i18n="game.ui.modals.abandon.cancel"><?= tr($t,'fr','game.ui.modals.abandon.cancel') ?></button>
        <button id="btnAbandonConfirm" class="abandon-button" type="button" data-i18n="game.ui.modals.abandon.confirm"><?= tr($t,'fr','game.ui.modals.abandon.confirm') ?></button>
      </div>
    </div>
  </div>

  <div id="arcadeScore"><span id="dbgScore">0</span><span class="arcade-suffix">pts <span id="dbgLastScore"></span></span></div>

  <aside id="scorePanel">
    <div id="multiplayerInfo" hidden class="multiplayer-info">
      <div class="multiplayer-info-block">
        <div class="score-title" data-i18n="game.ui.hud.player"><?= tr($t,'fr','game.ui.hud.player') ?></div>
        <div id="multiPlayerName" class="multiplayer-info-value">—</div>
      </div>
      <div class="multiplayer-info-block">
        <div class="score-title" data-i18n="game.ui.hud.room"><?= tr($t,'fr','game.ui.hud.room') ?></div>
        <div id="multiRoomCode" class="multiplayer-info-value">—</div>
      </div>
    </div>
    <div class="game-action-row">
      <button id="btnAbandonGame" class="abandon-button" type="button" data-i18n="game.ui.hud.abandon"><?= tr($t,'fr','game.ui.hud.abandon') ?></button>
      <button id="btnNewGame" class="new-game-button" type="button" data-i18n="game.ui.hud.newGame"><?= tr($t,'fr','game.ui.hud.newGame') ?></button>
    </div>

    <div id="statsPanel" class="stats-panel">
	  <div class="stats-title" data-i18n="game.ui.hud.statsTitle"><?= tr($t,'fr','game.ui.hud.statsTitle') ?></div>
      <div class="stats-summary-row">
        <div class="stats-summary-card stats-field"><span data-i18n="game.ui.hud.mills"><?= tr($t,'fr','game.ui.hud.mills') ?></span><div class="stats-num-group"><strong id="statMills">0</strong><span class="stats-emoji">⚙️</span></div></div>
        <div class="stats-summary-card stats-trains"><span data-i18n="game.ui.hud.trains"><?= tr($t,'fr','game.ui.hud.trains') ?></span><div class="stats-num-group"><strong id="statTrains">0</strong><span class="stats-emoji">🚂</span></div></div><div class="stats-summary-card stats-boats"><span data-i18n="game.ui.hud.boats"><?= tr($t,'fr','game.ui.hud.boats') ?></span><div class="stats-num-group"><strong id="statBoats">0</strong><span class="stats-emoji">⛵</span></div></div><div class="stats-summary-card stats-comets"><span data-i18n="game.ui.hud.comets"><?= tr($t,'fr','game.ui.hud.comets') ?></span><div class="stats-num-group"><strong id="statComets">0</strong><span class="stats-emoji">☄️</span></div></div>
      </div>
      <div class="stats-card-grid">
        <div class="stats-card stats-grass">
          <div class="stats-card-head"><span class="stats-icon">🌿</span><span data-i18n="game.ui.hud.biomes.grass"><?= tr($t,'fr','game.ui.hud.biomes.grass') ?></span></div>
          <div class="stats-metrics"><div><span data-i18n="game.ui.hud.total"><?= tr($t,'fr','game.ui.hud.total') ?></span><strong id="statGrass">0</strong></div><div><span data-i18n="game.ui.hud.surfaceMax"><?= tr($t,'fr','game.ui.hud.surfaceMax') ?></span><strong id="statLargestGrass">0</strong></div></div>
        </div>

        <div class="stats-card stats-field">
          <div class="stats-card-head"><span class="stats-icon">🌾</span><span data-i18n="game.ui.hud.biomes.field"><?= tr($t,'fr','game.ui.hud.biomes.field') ?></span></div>
          <div class="stats-metrics"><div><span data-i18n="game.ui.hud.total"><?= tr($t,'fr','game.ui.hud.total') ?></span><strong id="statField">0</strong></div><div><span data-i18n="game.ui.hud.surfaceMax"><?= tr($t,'fr','game.ui.hud.surfaceMax') ?></span><strong id="statLargestField">0</strong></div></div>
        </div>

        <div class="stats-card stats-forest">
          <div class="stats-card-head"><span class="stats-icon">🌲</span><span data-i18n="game.ui.hud.biomes.forest"><?= tr($t,'fr','game.ui.hud.biomes.forest') ?></span></div>
          <div class="stats-metrics"><div><span data-i18n="game.ui.hud.total"><?= tr($t,'fr','game.ui.hud.total') ?></span><strong id="statForest">0</strong></div><div><span data-i18n="game.ui.hud.surfaceMax"><?= tr($t,'fr','game.ui.hud.surfaceMax') ?></span><strong id="statLargestForest">0</strong></div></div>
        </div>

        <div class="stats-card stats-house">
          <div class="stats-card-head"><span class="stats-icon">🛖</span><span data-i18n="game.ui.hud.biomes.house"><?= tr($t,'fr','game.ui.hud.biomes.house') ?></span></div>
          <div class="stats-metrics"><div><span data-i18n="game.ui.hud.total"><?= tr($t,'fr','game.ui.hud.total') ?></span><strong id="statHouse">0</strong></div><div><span data-i18n="game.ui.hud.surfaceMax"><?= tr($t,'fr','game.ui.hud.surfaceMax') ?></span><strong id="statLargestHouse">0</strong></div></div>
        </div>

        <div class="stats-card stats-water">
          <div class="stats-card-head"><span class="stats-icon">💧</span><span data-i18n="game.ui.hud.biomes.water"><?= tr($t,'fr','game.ui.hud.biomes.water') ?></span></div>
          <div class="stats-metrics"><div><span data-i18n="game.ui.hud.total"><?= tr($t,'fr','game.ui.hud.total') ?></span><strong id="statWater">0</strong></div><div><span data-i18n="game.ui.hud.surfaceMax"><?= tr($t,'fr','game.ui.hud.surfaceMax') ?></span><strong id="statLargestWater">0</strong></div></div>
        </div>

        <div class="stats-card stats-rail">
          <div class="stats-card-head"><span class="stats-icon">🛤️</span><span data-i18n="game.ui.hud.biomes.rail"><?= tr($t,'fr','game.ui.hud.biomes.rail') ?></span></div>
          <div class="stats-metrics"><div><span data-i18n="game.ui.hud.total"><?= tr($t,'fr','game.ui.hud.total') ?></span><strong id="statRail">0</strong></div><div><span data-i18n="game.ui.hud.railMax"><?= tr($t,'fr','game.ui.hud.railMax') ?></span><strong id="statLargestRail">0</strong></div></div>
        </div>
      </div>
    </div>
  </aside>


  <aside id="tileUI">
    <div class="tilePreviewRow">
      <div class="tileBox">
        <div class="title" data-i18n="game.ui.hud.activeTileTitle"><?= tr($t,'fr','game.ui.hud.activeTileTitle') ?></div>
        <div id="activeTile"></div>
      </div>
      <div class="tileBox">
        <div class="title" data-i18n="game.ui.hud.nextTileTitle"><?= tr($t,'fr','game.ui.hud.nextTileTitle') ?></div>
        <div id="nextTile"></div>
      </div>
    </div>

    <div class="tileCountRow">
      <div class="deckRemainingBox">
        <div class="title" data-i18n="game.ui.hud.deckRemaining"><?= tr($t,'fr','game.ui.hud.deckRemaining') ?></div>
        <div id="deckRemaining">50</div>
      </div>
      <div class="deckRemainingBox">
        <div class="title" data-i18n="game.ui.hud.tilesPlaced"><?= tr($t,'fr','game.ui.hud.tilesPlaced') ?></div>
        <div id="tilesPlaced">0</div>
      </div>
    </div>

    <div class="missionsBox">
      <div class="title" data-i18n="game.ui.hud.missionsTitle"><?= tr($t,'fr','game.ui.hud.missionsTitle') ?></div>
      <ul id="missionList" class="missionList">
        <li class="mission-empty" data-i18n="game.ui.hud.noMission"><?= tr($t,'fr','game.ui.hud.noMission') ?></li>
      </ul>
    </div>
  </aside>

  <section id="helpOverlay" class="help-overlay hidden" aria-hidden="true">
    <div class="help-panel" role="dialog" aria-modal="true" aria-labelledby="helpTitle">
      <header class="help-header">
        <div>
          <h1 id="helpTitle" data-i18n="game.ui.help.title"><?= tr($t,'fr','game.ui.help.title') ?></h1>

        </div>
        <button id="btnCloseHelp" class="help-close" type="button" aria-label="<?= htmlspecialchars(tr($t,'fr','game.ui.help.closeAria')) ?>">×</button>
      </header>

      <div class="help-grid">
       <div class="help-top-row">
        <div class="help-col-main">
        <article class="help-card help-card-wide help-card-rules">
          <h2>🎯 <span data-i18n="game.ui.help.objective.title"><?= tr($t,'fr','game.ui.help.objective.title') ?></span></h2>
          <p data-i18n="game.ui.help.objective.text"><?= tr($t,'fr','game.ui.help.objective.text') ?></p>
          <div class="score-strip">
            <div><strong>+2</strong><span data-i18n="game.ui.help.objective.points.tile"><?= tr($t,'fr','game.ui.help.objective.points.tile') ?></span></div>
            <div><strong>+10</strong><span data-i18n="game.ui.help.objective.points.edge"><?= tr($t,'fr','game.ui.help.objective.points.edge') ?></span></div>
            <div><strong>+25</strong><span data-i18n="game.ui.help.objective.points.waterRail"><?= tr($t,'fr','game.ui.help.objective.points.waterRail') ?></span></div>
            <div><strong>+50</strong><span data-i18n="game.ui.help.objective.points.surround"><?= tr($t,'fr','game.ui.help.objective.points.surround') ?></span></div>
            <div><strong>+100</strong><span data-i18n="game.ui.help.objective.points.mission"><?= tr($t,'fr','game.ui.help.objective.points.mission') ?></span></div>
            <div><strong>+1500</strong><span data-i18n="game.ui.help.objective.points.bonus"><?= tr($t,'fr','game.ui.help.objective.points.bonus') ?></span></div>
          </div>
          <ul class="placement-list">
<?php foreach (tr($t,'fr','game.ui.help.placement.items') as $i => $frItem): ?>
            <li data-i18n="game.ui.help.placement.items.<?= $i ?>"><?= $frItem ?></li>
<?php endforeach; ?>
          </ul>
        </article>

        <div class="help-row-pair">
        <article class="help-card help-card-waterrail">
          <h2>🌊 <span data-i18n="game.ui.help.waterRail.title"><?= tr($t,'fr','game.ui.help.waterRail.title') ?></span></h2>
          <p data-i18n="game.ui.help.waterRail.text"><?= tr($t,'fr','game.ui.help.waterRail.text') ?></p>
          <div class="rule-line"><span class="swatch water"></span><strong>Eau</strong><span data-i18n="game.ui.help.waterRail.water"><?= tr($t,'fr','game.ui.help.waterRail.water') ?></span></div>
          <div class="rule-line"><span class="swatch rail"></span><strong>Rail</strong><span data-i18n="game.ui.help.waterRail.rail"><?= tr($t,'fr','game.ui.help.waterRail.rail') ?></span></div>
        </article>

        <article class="help-card help-card-bonus">
          <h2>⭐ <span data-i18n="game.ui.help.bonusCells.title"><?= tr($t,'fr','game.ui.help.bonusCells.title') ?></span></h2>
          <p data-i18n="game.ui.help.bonusCells.text"><?= tr($t,'fr','game.ui.help.bonusCells.text') ?></p>
          <div class="rule-line"><span class="swatch bonus-cell"></span><strong>Bonus</strong><span data-i18n="game.ui.help.bonusCells.label"><?= tr($t,'fr','game.ui.help.bonusCells.label') ?></span></div>
        </article>
        </div>

        <div class="help-row-pair">
        <article class="help-card help-card-blackcells">
          <h2>🕳️ <span data-i18n="game.ui.help.blackCells.title"><?= tr($t,'fr','game.ui.help.blackCells.title') ?></span></h2>
          <p data-i18n="game.ui.help.blackCells.text"><?= tr($t,'fr','game.ui.help.blackCells.text') ?></p>
          <div class="rule-line"><span class="swatch black-cell"></span><strong>Joker</strong><span data-i18n="game.ui.help.blackCells.label"><?= tr($t,'fr','game.ui.help.blackCells.label') ?></span></div>
        </article>

        <article class="help-card help-card-textures">
          <h2>🎨 <span data-i18n="game.ui.help.textures.title"><?= tr($t,'fr','game.ui.help.textures.title') ?></span></h2>
          <div class="legend-grid">
<?php foreach (['field','forest','grass','house','water','rail'] as $tex): ?>
            <div><span class="swatch <?= $tex ?>"></span><span data-i18n="game.ui.help.textures.<?= $tex ?>.label"><?= tr($t,'fr',"game.ui.help.textures.$tex.label") ?></span><code data-i18n="game.ui.help.textures.<?= $tex ?>.code"><?= tr($t,'fr',"game.ui.help.textures.$tex.code") ?></code></div>
<?php endforeach; ?>
          </div>
        </article>
        </div>
        </div>

        <article class="help-card help-card-controls">
          <h2>⌨️ <span data-i18n="game.ui.help.controls.title"><?= tr($t,'fr','game.ui.help.controls.title') ?></span></h2>
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
              <span data-i18n="game.ui.help.controls.moveCamera"><?= tr($t,'fr','game.ui.help.controls.moveCamera') ?></span>
            </div>
            <div><kbd>R</kbd><span data-i18n="game.ui.help.controls.resetCamera"><?= tr($t,'fr','game.ui.help.controls.resetCamera') ?></span></div>
            <div><kbd>+</kbd><kbd>-</kbd><span data-i18n="game.ui.help.controls.zoom"><?= tr($t,'fr','game.ui.help.controls.zoom') ?></span></div>
            <div><kbd>Ctrl+Z</kbd><span data-i18n="game.ui.help.controls.undo"><?= tr($t,'fr','game.ui.help.controls.undo') ?></span></div>
            <div><kbd>H</kbd><kbd>ESC</kbd><span data-i18n="game.ui.help.controls.toggleHelp"><?= tr($t,'fr','game.ui.help.controls.toggleHelp') ?></span></div>
            <div><kbd>M</kbd><span data-i18n="game.ui.help.controls.muteSound"><?= tr($t,'fr','game.ui.help.controls.muteSound') ?></span></div>
            <div><kbd data-i18n="game.ui.help.controls.spaceKbd"><?= tr($t,'fr','game.ui.help.controls.spaceKbd') ?></kbd><span data-i18n="game.ui.help.controls.immersive"><?= tr($t,'fr','game.ui.help.controls.immersive') ?></span></div>
            <div><kbd data-i18n="game.ui.help.controls.shiftSpaceKbd"><?= tr($t,'fr','game.ui.help.controls.shiftSpaceKbd') ?></kbd><span data-i18n="game.ui.help.controls.superImmersive"><?= tr($t,'fr','game.ui.help.controls.superImmersive') ?></span></div>
            <div><kbd>SHIFT</kbd><span data-i18n="game.ui.help.controls.speedUp"><?= tr($t,'fr','game.ui.help.controls.speedUp') ?></span></div>
            <div><kbd data-i18n="game.ui.help.controls.wheelKbd"><?= tr($t,'fr','game.ui.help.controls.wheelKbd') ?></kbd><span data-i18n="game.ui.help.controls.wheelZoomRotate"><?= tr($t,'fr','game.ui.help.controls.wheelZoomRotate') ?></span></div>
            <div><kbd data-i18n="game.ui.help.controls.leftClickKbd"><?= tr($t,'fr','game.ui.help.controls.leftClickKbd') ?></kbd><span data-i18n="game.ui.help.controls.moveCamera"><?= tr($t,'fr','game.ui.help.controls.moveCamera') ?></span></div>
            <div><kbd data-i18n="game.ui.help.controls.rightClickKbd"><?= tr($t,'fr','game.ui.help.controls.rightClickKbd') ?></kbd><span data-i18n="game.ui.help.controls.rightClick"><?= tr($t,'fr','game.ui.help.controls.rightClick') ?></span></div>
            <div class="control-sep" aria-hidden="true"></div>
            <div><kbd>F</kbd><span data-i18n="game.ui.help.controls.perfHud"><?= tr($t,'fr','game.ui.help.controls.perfHud') ?></span></div>
            <div><kbd>E</kbd><span data-i18n="game.ui.help.controls.eda"><?= tr($t,'fr','game.ui.help.controls.eda') ?></span></div>
            <div><kbd>C</kbd><span data-i18n="game.ui.help.controls.snapshot"><?= tr($t,'fr','game.ui.help.controls.snapshot') ?></span></div>
            <div><kbd>G</kbd><span data-i18n="game.ui.help.controls.gallery"><?= tr($t,'fr','game.ui.help.controls.gallery') ?></span></div>
          </div>
        </article>
       </div>

        <article class="help-card help-card-wide help-card-missions">
          <h2>🚩 <span data-i18n="game.ui.help.missions.title"><?= tr($t,'fr','game.ui.help.missions.title') ?></span></h2>
          <p data-i18n="game.ui.help.missions.text1"><?= tr($t,'fr','game.ui.help.missions.text1') ?></p>
          <p data-i18n="game.ui.help.missions.text2"><?= tr($t,'fr','game.ui.help.missions.text2') ?></p>
        </article>
      </div>
    </div>
  </section>

  <script type="module" src="javascript/main.js"></script>
  <script type="module" src="javascript/gameHudI18n.js"></script>
</body>
</html>
