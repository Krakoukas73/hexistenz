<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Dorfromantik prototype</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <canvas id="app"></canvas>

  <aside id="scorePanel">
    <div class="score-title">SCORE</div>
    <div id="dbgScore" class="score-value">0</div>
    <div class="last-score-line">Dernier coup <span id="dbgLastScore">0</span></div>
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
      <button id="btnAbandonGame" class="abandon-button" type="button">ABANDONNER LA PARTIE</button>
      <button id="btnNewGame" class="new-game-button" type="button">NOUVELLE PARTIE</button>
    </div>
  </aside>

  <aside id="debugHud" class="panel">
    <div class="debug-texture-title">Textures</div>
    <div class="debug-texture-grid">
      <div><span class="swatch field"></span><span>Champ</span></div>
      <div><span class="swatch forest"></span><span>Forêt</span></div>
      <div><span class="swatch grass"></span><span>Herbe</span></div>
      <div><span class="swatch house"></span><span>Maison</span></div>
      <div><span class="swatch water"></span><span>Eau</span></div>
      <div><span class="swatch rail"></span><span>Rail</span></div>
    </div>

    <button id="btnResetCamera" class="key-button" type="button">RESET CAMERA</button>
    <button id="btnUndoLastTile" class="key-button" type="button">ANNULER</button>

    <div class="debug-keyboard-title">Raccourcis clavier</div>
    <div id="keyboard">
      <div class="key-row">
        <div class="key empty"></div>
        <div class="key" id="keyZ">Z</div>
        <div class="key empty"></div>
      </div>

      <div class="key-row">
        <div class="key" id="keyQ">Q</div>
        <div class="key" id="keyS">S</div>
        <div class="key" id="keyD">D</div>
      </div>

      <div class="key-row command-row">
        <div class="key" id="keyR">R</div>
        <div class="key-label">Rotate tile</div>
      </div>

      <div class="key-row command-row">
        <div class="key" id="keyH">H</div>
        <div class="key-label">Aide</div>
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
    </div>

    <div class="deckRemainingBox">
      <div class="title">TUILES RESTANTES</div>
      <div id="deckRemaining">50</div>
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
          <div class="help-kicker">Guide joueur</div>
          <h1 id="helpTitle">Aide</h1>
        </div>
        <button id="btnCloseHelp" class="help-close" type="button" aria-label="Fermer l'aide">×</button>
      </header>

      <div class="help-grid">
        <article class="help-card help-card-wide">
          <h2>🎯 Objectif</h2>
          <p>Pose les tuiles hexagonales pour agrandir la carte et marquer un maximum de points. Chaque tuile possède 6 bords colorés : les aligner correctement augmente le score.</p>
          <div class="score-strip">
            <div><strong>+2</strong><span>par tuile posée</span></div>
            <div><strong>+10</strong><span>par bord identique classique contre une tuile voisine</span></div>
            <div><strong>+25</strong><span>par connexion eau/eau ou rail/rail</span></div>
            <div><strong>+50</strong><span>bonus quand une tuile est entourée sur ses 6 côtés</span></div>
            <div><strong>+100 +3 tuiles</strong><span>par mission terminée</span></div>
          </div>
        </article>

        <article class="help-card">
          <h2>🧩 Placement</h2>
          <ul>
            <li>La pioche contient initialement 50 tuiles.</li>
            <li>La première tuile peut être posée librement dans la grille.</li>
            <li>Les suivantes doivent toucher au moins une tuile déjà placée.</li>
            <li>Une case déjà occupée est interdite.</li>
            <li>Quand la pioche est vide, le jeu s’arrête.</li>
            <li>Si la tuile courante correspond sur au moins 2 côtés, tu gagnes 1 tuile dans la pioche.</li>
            <li>Si la tuile courante correspond sur au moins 3 côtés, tu gagnes 2 tuiles dans la pioche.</li>
            <li>Entourer une tuile par 6 autres tuiles sur ses 6 côtés rapporte 50 points.</li>
            <li>La tuile fantôme indique l’emplacement possible.</li>
          </ul>
        </article>

        <article class="help-card">
          <h2>🌊 Eaux et rails</h2>
          <p>L’eau et le rail sont des réseaux stricts et plus difficiles à placer. En échange, chaque connexion correcte rapporte plus de points.</p>
          <div class="rule-line"><span class="swatch water"></span><strong>Eau</strong><span>se connecte uniquement à eau : +25</span></div>
          <div class="rule-line"><span class="swatch rail"></span><strong>Rail</strong><span>se connecte uniquement à rail : +25</span></div>
        </article>

        <article class="help-card help-card-textures">
          <h2>🎨 Textures & valeurs</h2>
          <div class="legend-grid">
            <div><span class="swatch field"></span><span>Champ</span><code>1-2 blés</code></div>
            <div><span class="swatch forest"></span><span>Forêt</span><code>1-6 arbres</code></div>
            <div><span class="swatch grass"></span><span>Herbe</span><code>1</code></div>
            <div><span class="swatch house"></span><span>Maison</span><code>1-4 maisons</code></div>
            <div><span class="swatch water"></span><span>Eau</span><code>1</code></div>
            <div><span class="swatch rail"></span><span>Rail</span><code>1</code></div>
          </div>
        </article>



        <article class="help-card help-card-wide">
          <h2>🚩 Missions</h2>
          <p>Chaque nouvelle tuile courante a 20% de chance d’ajouter une mission dans l’encart Missions en cours.</p>
          <p>Les missions actuelles demandent de créer une forêt, un village, une voie ferrée, une voie d’eau, une prairie ou une surface agricole d’une taille précise. Terminer une mission rapporte 100 points et ajoute 3 cartes supplémentaires dans la pioche. Les objectifs commencent simples puis augmentent progressivement quand le même type de mission réapparaît. Une mission réalisée reste visible 5 tours, puis disparaît automatiquement.</p>
          <p>La difficulté tient compte de la valeur réelle des triangles : prairie, eau et rail valent toujours 1 élément ; les champs valent 1 à 2, les maisons 1 à 4 et les forêts 1 à 6 arbres. Les objectifs forêt, village et surface agricole demandent donc plus d’unités que les réseaux à 1 élément, parce que ces zones montent mécaniquement plus vite. La progression est affichée directement dans la liste, par exemple Forêt 22/50 arbres ou Surface agricole 12/24 champs.</p>
        </article>

        <article class="help-card help-card-controls">
          <h2>⌨️ Contrôles</h2>
          <div class="control-map">
            <div><kbd>Z</kbd><span>Avancer caméra</span></div>
            <div><kbd>Q</kbd><span>Déplacer à gauche</span></div>
            <div><kbd>S</kbd><span>Reculer caméra</span></div>
            <div><kbd>D</kbd><span>Déplacer à droite</span></div>
            <div><kbd>R</kbd><span>Tourner la tuile active</span></div>
            <div><kbd>H</kbd><span>Afficher / masquer cette aide</span></div>
            <div><kbd>Molette</kbd><span>Zoom sur une tuile posée, rotation sur une case disponible</span></div>
            <div><kbd>Clic gauche</kbd><span>Poser ou déplacer la caméra en glissant</span></div>
            <div><kbd>Clic droit</kbd><span>Rotation de la caméra</span></div>
          </div>
        </article>
      </div>
    </div>
  </section>

  <script type="module" src="main.js"></script>
</body>
</html>
