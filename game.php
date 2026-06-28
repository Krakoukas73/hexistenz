<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Hexistenz</title>
  <link rel="icon" type="image/svg+xml" href="favicon.svg" />
  <link rel="stylesheet" href="css/style.css" />
  <link rel="stylesheet" href="css/multiplayerUi.css" />
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
</head>
<body>
  <canvas id="app"></canvas>

  <aside id="scorePanel">
    <div class="score-main-row">
      <div>
        <div class="score-title">SCORE</div>
        <div id="dbgScore" class="score-value">0</div>
      </div>
      <div>
        <div class="score-title">TUILES POSÉES</div>
        <div id="dbgGridPercent" class="score-value">0</div>
      </div>
    </div>
    <div class="last-score-line">Dernier coup <span id="dbgLastScore">0</span></div>
    <div id="multiplayerInfo" hidden class="multiplayer-info">
      <div class="multiplayer-info-block">
        <div class="score-title">PARTIE</div>
        <div id="multiRoomCode" class="multiplayer-info-value">—</div>
      </div>
      <div class="multiplayer-info-block">
        <div class="score-title">JOUEUR</div>
        <div id="multiPlayerName" class="multiplayer-info-value">—</div>
      </div>
    </div>
    <div class="game-action-row">
      <button id="btnAbandonGame" class="abandon-button" type="button">ABANDONNER</button>
      <button id="btnNewGame" class="new-game-button" type="button">NOUVELLE PARTIE</button>
    </div>
    <div id="highscorePanel" class="highscore-panel">
      <div class="highscore-title">HIGHSCORES</div>
      <ol id="highscoreList" class="highscore-list">
        <li>Chargement...</li>
      </ol>
      <div id="highscoreSubmit" class="highscore-submit hidden">
        <input id="highscoreName" type="text" maxlength="20" placeholder="Pseudo" autocomplete="off" />
        <button id="btnSaveScore" type="button">OK</button>
      </div>
      <div id="highscoreStatus" class="highscore-status"></div>
    </div>
	
    <div id="statsPanel" class="stats-panel">
	  <div class="stats-title">STATISTIQUES DE LA PARTIE</div>
      <div class="stats-summary-row">
        <div class="stats-summary-card stats-tiles"><span>Tuiles posées</span><strong id="statTiles">0</strong></div>
        <div class="stats-summary-card stats-trains"><span>Trains</span><div class="stats-num-group"><strong id="statTrains">0</strong><span class="stats-emoji">🚂</span></div></div><div class="stats-summary-card stats-boats"><span>Bateaux</span><div class="stats-num-group"><strong id="statBoats">0</strong><span class="stats-emoji">⛵</span></div></div><div class="stats-summary-card stats-comets"><span>Comètes</span><div class="stats-num-group"><strong id="statComets">0</strong><span class="stats-emoji">☄️</span></div></div>
      </div>
      <div class="stats-card-grid">
        <div class="stats-card stats-grass">
          <div class="stats-card-head"><span class="stats-icon">🌿</span><span>Prairie</span></div>
          <div class="stats-metrics"><div><span>Total</span><strong id="statGrass">0</strong></div><div><span>Surface max</span><strong id="statLargestGrass">0</strong></div></div>
        </div>

        <div class="stats-card stats-field">
          <div class="stats-card-head"><span class="stats-icon">🌾</span><span>Champ de blé</span></div>
          <div class="stats-metrics"><div><span>Total</span><strong id="statField">0</strong></div><div><span>Surface max</span><strong id="statLargestField">0</strong></div></div>
        </div>

        <div class="stats-card stats-forest">
          <div class="stats-card-head"><span class="stats-icon">🌲</span><span>Forêt</span></div>
          <div class="stats-metrics"><div><span>Total</span><strong id="statForest">0</strong></div><div><span>Surface max</span><strong id="statLargestForest">0</strong></div></div>
        </div>

        <div class="stats-card stats-house">
          <div class="stats-card-head"><span class="stats-icon">🛖</span><span>Village</span></div>
          <div class="stats-metrics"><div><span>Total</span><strong id="statHouse">0</strong></div><div><span>Surface max</span><strong id="statLargestHouse">0</strong></div></div>
        </div>

        <div class="stats-card stats-water">
          <div class="stats-card-head"><span class="stats-icon">💧</span><span>Eau</span></div>
          <div class="stats-metrics"><div><span>Total</span><strong id="statWater">0</strong></div><div><span>Surface max</span><strong id="statLargestWater">0</strong></div></div>
        </div>

        <div class="stats-card stats-rail">
          <div class="stats-card-head"><span class="stats-icon">🛤️</span><span>Voie ferrée</span></div>
          <div class="stats-metrics"><div><span>Total</span><strong id="statRail">0</strong></div><div><span>Voie max</span><strong id="statLargestRail">0</strong></div></div>
        </div>
      </div>
    </div>
  </aside>


  <aside id="tileUI">
    <div class="tilePreviewRow">
      <div class="tileBox">
        <div class="title">TUILE COURANTE</div>
        <div id="activeTile"></div>
      </div>

      <div class="tileBox">
        <div class="title">TUILE SUIVANTE</div>
        <div id="nextTile"></div>
      </div>

      <div class="deckRemainingBox">
        <div class="title">TUILES RESTANTES</div>
        <div id="deckRemaining">50</div>
      </div>
    </div>

    <div class="missionsBox">
      <div class="title">MISSIONS EN COURS</div>
      <ul id="missionList" class="missionList">
        <li class="mission-empty">Aucune mission</li>
      </ul>
    </div>
  </aside>

  <section id="helpOverlay" class="help-overlay hidden" aria-hidden="true">
    <div class="help-panel" role="dialog" aria-modal="true" aria-labelledby="helpTitle">
      <header class="help-header">
        <div>
          <h1 id="helpTitle">Aide</h1>
          
        </div>
        <button id="btnCloseHelp" class="help-close" type="button" aria-label="Fermer l'aide">×</button>
      </header>

      <div class="help-grid">
        <article class="help-card help-card-wide">
          <h2>🎯 Objectif du jeu</h2>
          <p>Pose les tuiles hexagonales, connecte les textures identiques et termine les missions. Chaque bord bien aligné paie ; eau et rails paient davantage.</p>
          <div class="score-strip">
            <div><strong>+2 points</strong><span>par tuile posée</span></div>
            <div><strong>+10 points</strong><span>par bord identique contre une tuile voisine</span></div>
            <div><strong>+25 points</strong><span>par connexion eau/eau ou rail/rail</span></div>
            <div><strong>+50 points</strong><span>bonus quand une tuile est entourée sur ses 6 côtés</span></div>
            <div><strong>+100 points + 3 tuiles</strong><span>par mission terminée</span></div>
            <div><strong>+1500 points</strong><span>si tu poses une tuile sur une case bonus</span></div>
          </div>
        </article>

        <article class="help-card">
          <h2>🧩 Placement</h2>
          <ul>
            <li>Départ : 50 tuiles. La première est libre, les suivantes touchent une tuile posée.</li>
            <li>Case occupée interdite. Pioche vide = fin.</li>
            <li>2 côtés compatibles : +1 tuile ; 3 côtés compatibles : +2 tuiles.</li>
            <li>Tuile encerclée sur 6 côtés : +50 points.</li>
            <li>La tuile fantôme indique l’emplacement possible.</li>
            <li>À chaque pose, la zone jouable s’étend doucement : les cases jusqu’à 3 hexagones autour de la tuile deviennent disponibles.</li>
            <li>Les cases bonus dorées apparaissent à la génération : occupe-les pour gagner +1500 points.</li>
          </ul>
        </article>

        <article class="help-card">
          <h2>🌊 Eaux et rails</h2>
          <p>L’eau et le rail sont des réseaux stricts et plus difficiles à placer. En échange, chaque connexion correcte rapporte plus de points.</p>
          <div class="rule-line"><span class="swatch water"></span><strong>Eau</strong><span>se connecte uniquement à eau : +25</span></div>
          <div class="rule-line"><span class="swatch rail"></span><strong>Rail</strong><span>se connecte uniquement à rail : +25</span></div>
        </article>

        <article class="help-card">
          <h2>⭐ Cases bonus</h2>
          <p>Entre 1 et 4 cases bonus sont générées sur la grille. Elles ne changent aucune règle de placement : si tu arrives à poser une tuile dessus, elles disparaissent et rapportent immédiatement +1500 points.</p>
          <div class="rule-line"><span class="swatch bonus-cell"></span><strong>Bonus</strong><span>objectif optionnel, pur score, zéro piège</span></div>
        </article>

        <article class="help-card">
          <h2>🕳️ Cellules noires</h2>
          <p>Les cellules noires sont des tuiles spéciales déjà présentes sur la grille. Elles agissent comme des jokers : elles remplacent ce qui manque autour d’elles et acceptent les connexions avec toutes les textures adjacentes.</p>
          <div class="rule-line"><span class="swatch black-cell"></span><strong>Joker</strong><span>compte comme compatible avec tout bord voisin</span></div>
        </article>

        <article class="help-card help-card-textures">
          <h2>🎨 Textures & valeurs</h2>
          <div class="legend-grid">
            <div><span class="swatch field"></span><span>Champ de blé</span><code>1-2 blés</code></div>
            <div><span class="swatch forest"></span><span>Forêt</span><code>1-6 arbres</code></div>
            <div><span class="swatch grass"></span><span>Prairie</span><code>1</code></div>
            <div><span class="swatch house"></span><span>Village</span><code>1-4 maisons</code></div>
            <div><span class="swatch water"></span><span>Eau</span><code>1</code></div>
            <div><span class="swatch rail"></span><span>Rail</span><code>1</code></div>
          </div>
        </article>



        <article class="help-card help-card-wide">
          <h2>🚩 Missions</h2>
          <p>À chaque nouvelle tuile courante, 20% de chance d’ajouter une mission. Elle peut demander forêt, village, voie ferrée, voie d’eau, prairie, champ de blé ou trains visibles.</p>
          <p>Récompense : +100 points et +3 tuiles. Les objectifs progressent par type, une mission terminée reste visible 5 tours. Les valeurs réelles comptent : prairie/eau/rail = 1 ; champ de blé = 1-2 ; maison = 1-4 ; forêt = 1-6 arbres.</p>
        </article>

        <article class="help-card help-card-controls">
          <h2>⌨️ Contrôles</h2>
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
              <span>Déplacer la caméra</span>
            </div>
            <div><kbd>R</kbd><span>Réinitialiser la caméra</span></div>
            <div><kbd>+</kbd><kbd>-</kbd><span>Zoomer / dézoomer la caméra</span></div>
            <div><kbd>Ctrl+Z</kbd><span>Annuler le dernier mouvement</span></div>
            <div><kbd>H</kbd><kbd>ESC</kbd><span>Afficher / masquer cette aide</span></div>
            <div><kbd>M</kbd><span>Couper / activer tous les sons</span></div>
            <div><kbd>ESPACE</kbd><span>Mode immersif</span></div>
            <div><kbd>SHIFT+ESPACE</kbd><span>Mode super-immersif</span></div>
            <div><kbd>SHIFT</kbd><span>Accélère les déplacements et le zoom</span></div>
            <div><kbd>Molette</kbd><span>Zoom ou rotation si disponible</span></div>
            <div><kbd>Clic gauche</kbd><span>Déplacer la caméra</span></div>
            <div><kbd>Clic droit</kbd><span>Rotation de la caméra</span></div>
            <div class="control-sep" aria-hidden="true"></div>
            <div><kbd>F</kbd><span>Afficher / masquer le HUD performances avancé</span></div>
            <div><kbd>L</kbd><span>Panneau des LUT</span></div>
            <div><kbd>C</kbd><span>Effets cinématiques</span></div>
          </div>
        </article>
      </div>
    </div>
  </section>

  <script type="module" src="main.js"></script>
</body>
</html>
