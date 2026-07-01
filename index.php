<?php
// Version — extraite de variables.js
$version = '';
$varsFile = __DIR__ . '/variables.js';
if (file_exists($varsFile)) {
    $js = file_get_contents($varsFile);
    if (preg_match("/HEXISTENZ_VERSION\s*=\s*'([^']+)'/", $js, $m)) {
        $version = $m[1];
    }
}

// Highscores — top 10, même logique que highscore.php
$highscores = [];
$hsFile = __DIR__ . '/json/highscores.json';
if (file_exists($hsFile)) {
    $content = file_get_contents($hsFile);
    if ($content !== false && trim($content) !== '') {
        $raw = json_decode($content, true);
        if (is_array($raw)) {
            $clean = [];
            foreach ($raw as $entry) {
                if (is_array($entry) && isset($entry['name']) && isset($entry['score']) && is_numeric($entry['score'])) {
                    $stats = isset($entry['stats']) && is_array($entry['stats']) ? $entry['stats'] : [];
                    $biomeTypes = ['grass', 'field', 'forest', 'house', 'water', 'rail'];
                    $totals  = isset($stats['totals'])  && is_array($stats['totals'])  ? $stats['totals']  : [];
                    $largest = isset($stats['largest']) && is_array($stats['largest']) ? $stats['largest'] : [];
                    $biomeTotals  = [];
                    $biomeLargest = [];
                    foreach ($biomeTypes as $bt) {
                        $biomeTotals[$bt]  = isset($totals[$bt])  ? (int)$totals[$bt]  : 0;
                        $biomeLargest[$bt] = isset($largest[$bt]) ? (int)$largest[$bt] : 0;
                    }
                    $clean[] = [
                        'name'         => (string)$entry['name'],
                        'score'        => (int)$entry['score'],
                        'date'         => isset($entry['date']) ? (string)$entry['date'] : '',
                        'tiles'        => isset($stats['tiles'])      ? (int)$stats['tiles']      : 0,
                        'trains'       => isset($stats['trainLines']) ? (int)$stats['trainLines'] : 0,
                        'boats'        => isset($stats['boatCount'])  ? (int)$stats['boatCount']  : 0,
                        'comets'       => isset($stats['cometHits'])  ? (int)$stats['cometHits']  : 0,
                        'totals'       => $biomeTotals,
                        'largest'      => $biomeLargest,
                    ];
                }
            }
            usort($clean, function($a, $b) { return $b['score'] - $a['score']; });
            $highscores = array_slice($clean, 0, 10);
        }
    }
}

function fmt_date($iso) {
    if (!$iso) return '';
    $ts = strtotime($iso);
    if (!$ts) return '';
    return date('d/m/Y', $ts);
}
?>
<!doctype html>
<html lang="fr" data-lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Hexistenz — Jeu de tuiles hexagonales</title>
  <link rel="icon" type="image/svg+xml" href="favicon.svg" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Space+Mono:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="css/presentation.css" />
</head>
<body>

<div id="particles-js" aria-hidden="true"></div>
<div class="bg-layer" aria-hidden="true"></div>

<!-- ─── NAV ────────────────────────────────────────────────────── -->
<nav>
  <a class="nav-logo" href="#">⬡ HEXISTENZ<?php if ($version): ?><span class="nav-version"><?= htmlspecialchars($version) ?></span><?php endif; ?></a>
  <ul class="nav-links">
    <li><a href="#factions" data-fr>Factions</a>    <a href="#factions" data-en>Factions</a></li>
    <li><a href="#biomes"   data-fr>Biomes</a>      <a href="#biomes"   data-en>Biomes</a></li>
    <li><a href="#missions" data-fr>Missions</a>    <a href="#missions" data-en>Missions</a></li>
    <li><a href="#gameplay" data-fr>Gameplay</a>    <a href="#gameplay" data-en>Gameplay</a></li>
    <li><a href="#gallery"  data-fr>Galerie</a>     <a href="#gallery"  data-en>Gallery</a></li>
    <li><a href="#daynnight" data-fr>Jour/Nuit</a>  <a href="#daynnight" data-en>Day/Night</a></li>
    <li><a href="#multi"    data-fr>Multijoueur</a> <a href="#multi"    data-en>Multiplayer</a></li>
    <li><a href="#scores"   data-fr>Classement</a>  <a href="#scores"   data-en>Leaderboard</a></li>
  </ul>
  <div id="lang-toggle">
    <button onclick="setLang('fr')" id="btn-fr" class="active">FR</button>
    <button onclick="setLang('en')" id="btn-en">EN</button>
  </div>
  <a href="game.php" class="nav-cta" data-fr>Jouer</a>
  <a href="game.php" class="nav-cta" data-en>Play Now</a>
</nav>

<!-- ═══════════ HERO ═══════════ -->
<section id="hero">
  <div class="hero-banner" aria-hidden="true"></div>
  <div class="hero-content">
  <div class="container">
    <div class="hero-inner">
      <div class="hero-text">
        <h1 class="hero-title">⬡ HEXISTENZ</h1>
        <p class="hero-subtitle">
          <span data-fr>Jeu hexagonal contemplatif fait avec nostalgie et amour ❤️ Three.js et beaucoup de tuiles</span>
          <span data-en>A contemplative hexagonal game made with love ❤️ Three.js and a lot of tiles</span>
        </p>

        <p class="hero-inspi" data-fr>
          Inspiré de <em>Dorfromantik</em>, de l'âme pastorale de <em>The Settlers</em> (Blue Byte, 1993)
          et des mondes merveilleux de <em>Heroes of Might and Magic</em> (3DO).
        </p>
        <p class="hero-inspi" data-en>
          Inspired by <em>Dorfromantik</em>, the pastoral soul of <em>The Settlers</em> (Blue Byte, 1993)
          and the wondrous worlds of <em>Heroes of Might and Magic</em> (3DO).
        </p>

        <div class="hero-inspi-grid">
          <div class="hero-inspi-col">
            <div class="hero-inspi-card">
              <img src="./images/dorfromantik.jpg" alt="Dorfromantik" class="hero-inspi-img" loading="lazy">
              <div class="hero-inspi-caption">
                <div class="hero-inspi-name">Dorfromantik</div>
              </div>
            </div>
            <a class="hero-inspi-buy" href="https://store.steampowered.com/app/1455840/Dorfromantik/" target="_blank" rel="noopener">🎮 <span data-fr>Dorfromantik sur Steam</span><span data-en>Dorfromantik on Steam</span></a>
          </div>
          <div class="hero-inspi-col">
            <div class="hero-inspi-card">
              <img src="./images/settlers.jpg" alt="The Settlers" class="hero-inspi-img" loading="lazy">
              <div class="hero-inspi-caption">
                <div class="hero-inspi-name">The Settlers</div>
              </div>
            </div>
            <a class="hero-inspi-buy" href="https://www.ubisoft.com/en-gb/games/the-settlers-history-edition" target="_blank" rel="noopener">🎮 <span data-fr>The Settlers sur Ubisoft</span><span data-en>The Settlers on Ubisoft</span></a>
          </div>
          <div class="hero-inspi-col">
            <div class="hero-inspi-card">
              <img src="./images/heroes.jpg" alt="Heroes of Might and Magic" class="hero-inspi-img" loading="lazy">
              <div class="hero-inspi-caption">
                <div class="hero-inspi-name">Heroes of Might &amp; Magic</div>
              </div>
            </div>
            <a class="hero-inspi-buy" href="https://www.gog.com/en/game/heroes_of_might_and_magic_3_complete_edition" target="_blank" rel="noopener">🎮 <span data-fr>Heroes III sur GOG</span><span data-en>Heroes III on GOG</span></a>
          </div>
        </div>

        <p class="hero-tagline" data-fr>
          Posez des tuiles hexagonales. Développez de vastes forêts de sapins et de bouleaux, des champs de blé
          ondoyants avec leurs moulins, des villages médiévaux aux toits fumants, des réseaux de voies ferrées
          et de larges rivières où voguent vos bateaux. Remplissez des missions, interceptez des comètes,
          entourez vos tuiles. Bâtissez un monde vivant, tuile après tuile.
        </p>
        <p class="hero-tagline" data-en>
          Place hexagonal tiles. Grow vast forests of firs and birches, swaying wheat fields with their mills,
          medieval villages with smoking rooftops, sprawling railway networks and wide rivers where your boats sail.
          Complete missions, intercept comets, surround your tiles. Build a living world, one tile at a time.
        </p>
        <div class="hero-buttons">
          <a href="game.php" class="btn-primary" data-fr>Jouer maintenant</a>
          <a href="game.php" class="btn-primary" data-en>Play Now</a>
          <a href="#gameplay" class="btn-secondary" data-fr>Comment jouer ?</a>
          <a href="#gameplay" class="btn-secondary" data-en>How to play?</a>
        </div>
        <div class="stats-bar">
          <div class="stat-item"><div class="stat-num">6</div><div class="stat-label" data-fr>Biomes</div><div class="stat-label" data-en>Biomes</div></div>
          <div class="stat-item"><div class="stat-num">∞</div><div class="stat-label" data-fr>Parties</div><div class="stat-label" data-en>Games</div></div>
          <div class="stat-item"><div class="stat-num" style="font-size:22px;line-height:1.4;" data-fr>Solo<br>& Multi</div><div class="stat-num" style="font-size:22px;line-height:1.4;" data-en>Solo<br>& Multi</div></div>
          <div class="stat-item"><div class="stat-num">16</div><div class="stat-label" data-fr>Ambiances</div><div class="stat-label" data-en>Presets</div></div>
        </div>
      </div>

    </div>
  </div>
  </div><!-- /.hero-content -->
</section>

<!-- ═══════════ FACTIONS ═══════════ -->
<section id="factions">
  <div class="container">
    <p class="section-label" data-fr>Deux façons de voir le monde</p>
    <p class="section-label" data-en>Two ways to see the world</p>
    <h2 class="section-title" data-fr>Platistes et boulistes</h2>
    <h2 class="section-title" data-en>Flat-worlders and globe-believers</h2>
    <h2 class="section-title" data-fr>Deux factions irréconciliables</h2>
    <h2 class="section-title" data-en>Two irreconcilable factions</h2>
    <p class="section-sub" data-fr>
      Hexistenz divise les bâtisseurs en deux factions irréconciliables. Une option visuelle,
      un engagement philosophique. De quel côté êtes-vous&nbsp;?
    </p>
    <p class="section-sub" data-en>
      Hexistenz splits its builders into two irreconcilable factions. A visual option,
      a philosophical commitment. Which side are you on?
    </p>

    <div class="factions-grid">
      <div class="faction-card platiste">
        <div class="faction-img" style="display:block;padding:0;">
          <img src="images/platiste.png" alt="Mode Platiste" style="width:100%;height:100%;object-fit:cover;display:block;">
        </div>
        <div class="faction-body">
          <span class="faction-tag" data-fr>Mode Platiste</span>
          <span class="faction-tag" data-en>Flat Mode</span>
          <div class="faction-name" data-fr>🪨 Le Monde Plat</div>
          <div class="faction-name" data-en>🪨 The Flat World</div>
          <p class="faction-desc" data-fr>
            La grille s'étend à l'horizontale, pure et ordonnée. Chaque tuile posée rejoint
            un plateau parfaitement plan, comme les anciens l'ont toujours su.
            Pour ceux qui font confiance à leurs yeux.
          </p>
          <p class="faction-desc" data-en>
            The grid stretches out flat and ordered. Every tile joins a perfectly level plateau,
            just as the ancients always knew.
            For those who trust their eyes.
          </p>
        </div>
      </div>

      <div class="faction-card bouliste">
        <div class="faction-img" style="display:block;padding:0;">
          <img src="images/bouliste-transparent.png" alt="Mode Bouliste" style="width:100%;height:100%;object-fit:cover;display:block;">
        </div>
        <div class="faction-body">
          <span class="faction-tag" data-fr>Mode Bouliste</span>
          <span class="faction-tag" data-en>Globe Mode</span>
          <div class="faction-name" data-fr>🌍 Le Monde Sphérique</div>
          <div class="faction-name" data-en>🌍 The Spherical World</div>
          <p class="faction-desc" data-fr>
            La courbure du monde se révèle à mesure que la grille grandit — les tuiles
            lointaines s'incurvent vers l'horizon. Un effet GPU en temps réel qui donne
            une profondeur vertigineuse à chaque partie.
          </p>
          <p class="faction-desc" data-en>
            The curvature of the world reveals itself as the grid grows — distant tiles
            arc toward the horizon. A real-time GPU effect that adds breathtaking depth
            to every game.
          </p>
        </div>
      </div>
    </div>

    <div class="faction-vs" data-fr>Le débat n'est pas clos.</div>
    <div class="faction-vs" data-en>The debate is not settled.</div>
  </div>
</section>

<!-- ═══════════ BIOMES ═══════════ -->
<section id="biomes">
  <div class="container">
    <p class="section-label" data-fr>Les biomes</p>
    <p class="section-label" data-en>The biomes</p>
    <h2 class="section-title" data-fr>Six biomes à connecter</h2>
    <h2 class="section-title" data-en>Six biomes to connect</h2>
    <p class="section-sub" data-fr>Chaque tuile est composée de six secteurs triangulaires. Assemblez les biomes identiques pour former des zones et maximiser votre score.</p>
    <p class="section-sub" data-en>Each tile has six triangular sectors. Match identical biomes to form zones and maximize your score.</p>

    <div class="biomes-grid">
      <div class="biome-card grass">
        <div class="biome-banner">
          <img src="images/biome-prairie.png" alt="Prairie" class="biome-banner-img">
          <div class="biome-banner-overlay">
            <div class="biome-name" data-fr>Prairie</div><div class="biome-name" data-en>Grassland</div>
          </div>
        </div>
        <div class="biome-body">
          <div class="biome-desc" data-fr>Étendues herbeuses où chaque brin frémit sous le vent, parsemées de fleurs sauvages, rochers, cerfs et buissons. Terrain neutre entre les grands réseaux.</div>
          <div class="biome-desc" data-en>Grassy expanses where every blade trembles in the wind, dotted with wildflowers, rocks, deer and shrubs. Neutral ground between major networks.</div>
          <span class="biome-tag" data-fr>Biome neutre</span><span class="biome-tag" data-en>Neutral biome</span>
        </div>
      </div>
      <div class="biome-card field">
        <div class="biome-banner">
          <img src="images/biome-ble.png" alt="Champ" class="biome-banner-img">
          <div class="biome-banner-overlay">
            <div class="biome-name" data-fr>Champ</div><div class="biome-name" data-en>Field</div>
          </div>
        </div>
        <div class="biome-body">
          <div class="biome-desc" data-fr>Blé soumis au vent, moulins procéduraux et bottes de foin. Le chi-maï résonne quand la caméra effleure les épis.</div>
          <div class="biome-desc" data-en>Wind-swayed wheat, procedural mills and hay bales. The chi-mai plays when the camera grazes the ears of grain.</div>
          <span class="biome-tag" data-fr>Réseau agricole</span><span class="biome-tag" data-en>Agricultural zone</span>
        </div>
      </div>
      <div class="biome-card forest">
        <div class="biome-banner">
          <img src="images/biome-foret.png" alt="Forêt" class="biome-banner-img">
          <div class="biome-banner-overlay">
            <div class="biome-name" data-fr>Forêt</div><div class="biome-name" data-en>Forest</div>
          </div>
        </div>
        <div class="biome-body">
          <div class="biome-desc" data-fr>Sapins, bouleaux, peupliers en InstancedMesh, dont les frondaisons ondulent au vent jusque dans le sous-bois. Champignons, piles de bois, cerfs — jusqu'à 22 millions de triangles.</div>
          <div class="biome-desc" data-en>Firs, birches, poplars as InstancedMesh, their canopies swaying in the wind down to the undergrowth. Mushrooms, woodpiles, deer — up to 22 million triangles on screen.</div>
          <span class="biome-tag" data-fr>Forêt dense</span><span class="biome-tag" data-en>Dense woodland</span>
        </div>
      </div>
      <div class="biome-card house">
        <div class="biome-banner">
          <img src="images/biome-village.png" alt="Village" class="biome-banner-img">
          <div class="biome-banner-overlay">
            <div class="biome-name" data-fr>Village</div><div class="biome-name" data-en>Village</div>
          </div>
        </div>
        <div class="biome-body">
          <div class="biome-desc" data-fr>Maisons médiévales avec fumée volumétrique, tours de guet, fontaines, charrettes, chiens et chevaux animés.</div>
          <div class="biome-desc" data-en>Medieval houses with volumetric smoke, watchtowers, fountains, animated carts, dogs and horses.</div>
          <span class="biome-tag" data-fr>Habitat humain</span><span class="biome-tag" data-en>Human settlement</span>
        </div>
      </div>
      <div class="biome-card water">
        <div class="biome-banner">
          <img src="images/biome-eau.png" alt="Eau" class="biome-banner-img">
          <div class="biome-banner-overlay">
            <div class="biome-name" data-fr>Eau</div><div class="biome-name" data-en>Water</div>
          </div>
        </div>
        <div class="biome-body">
          <div class="biome-desc" data-fr>Nappe continue au rivage organique, vagues et écume animées façon aquarelle. Bateaux animés à sillage, plages procédurales et halos de zone.</div>
          <div class="biome-desc" data-en>Continuous water sheet with an organic shoreline, animated waves and watercolor-style foam. Animated boats with wake, procedural beaches and zone halos.</div>
          <span class="biome-tag" data-fr>Réseau fluvial ⛵</span><span class="biome-tag" data-en>Water network ⛵</span>
        </div>
      </div>
      <div class="biome-card rail">
        <div class="biome-banner">
          <img src="images/biome-train.png" alt="Voie ferrée" class="biome-banner-img">
          <div class="biome-banner-overlay">
            <div class="biome-name" data-fr>Voie ferrée</div><div class="biome-name" data-en>Railway</div>
          </div>
        </div>
        <div class="biome-body">
          <div class="biome-desc" data-fr>Rails procéduraux, traverses et ballast. Trains avec wagons, gares terminus et fumée des locomotives.</div>
          <div class="biome-desc" data-en>Procedural tracks, sleepers, ballast. Trains with wagons, terminus stations and locomotive smoke.</div>
          <span class="biome-tag" data-fr>Réseau ferroviaire 🚂</span><span class="biome-tag" data-en>Rail network 🚂</span>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ═══════════ MISSIONS ═══════════ -->
<section id="missions">
  <div class="container">
    <p class="section-label" data-fr>Objectifs</p>
    <p class="section-label" data-en>Objectives</p>
    <h2 class="section-title" data-fr>Les missions</h2>
    <h2 class="section-title" data-en>Missions</h2>
    <p class="section-sub" data-fr>Chaque partie génère des objectifs automatiques liés aux biomes et aux réseaux. Les accomplir rapporte 100 points et surtout 3 nouvelles tuiles dans la pioche — ce qui garantit théoriquement des parties infinies.</p>
    <p class="section-sub" data-en>Each game generates automatic objectives tied to biomes and networks. Completing one scores 100 points and, more importantly, adds 3 new tiles to the draw pile — theoretically enabling infinite games.</p>

    <div class="missions-grid">
      <div class="mission-card">
        <div class="mission-icon">🌿</div>
        <div>
          <div class="mission-name" data-fr>Zone biome</div>
          <div class="mission-name" data-en>Biome zone</div>
          <div class="mission-desc" data-fr>Atteindre une surface minimale dans un biome donné : <em>«&nbsp;Forêt de 8 secteurs&nbsp;»</em>, <em>«&nbsp;Prairie de 12 secteurs&nbsp;»</em>…</div>
          <div class="mission-desc" data-en>Reach a minimum area in a given biome: <em>"8-sector forest"</em>, <em>"12-sector grassland"</em>…</div>
        </div>
      </div>
      <div class="mission-card">
        <div class="mission-icon">🛤️</div>
        <div>
          <div class="mission-name" data-fr>Voie ferrée</div>
          <div class="mission-name" data-en>Rail line</div>
          <div class="mission-desc" data-fr>Poser un nombre imposé de secteurs rail. Chaque triangle de voie ferrée posé fait progresser cette mission.</div>
          <div class="mission-desc" data-en>Lay a required number of rail sectors. Each placed rail triangle counts toward this mission.</div>
        </div>
      </div>
      <div class="mission-card">
        <div class="mission-icon">🚂</div>
        <div>
          <div class="mission-name" data-fr>Trains</div>
          <div class="mission-name" data-en>Trains</div>
          <div class="mission-desc" data-fr>Constituer un nombre de lignes de train actives — chaque ligne relie deux gares via des rails continus sans interruption.</div>
          <div class="mission-desc" data-en>Build a required number of active train lines — each line connects two stations via continuous, unbroken rails.</div>
        </div>
      </div>
      <div class="mission-card">
        <div class="mission-icon">💧</div>
        <div>
          <div class="mission-name" data-fr>Voie d'eau</div>
          <div class="mission-name" data-en>Waterway</div>
          <div class="mission-desc" data-fr>Former une étendue d'eau d'une surface minimale. Chaque triangle d'eau posé fait progresser cette mission.</div>
          <div class="mission-desc" data-en>Form a water zone of a minimum area. Each placed water triangle counts toward this mission.</div>
        </div>
      </div>
      <div class="mission-card">
        <div class="mission-icon">⛵</div>
        <div>
          <div class="mission-name" data-fr>Bateaux</div>
          <div class="mission-name" data-en>Boats</div>
          <div class="mission-desc" data-fr>Faire apparaître un nombre de bateaux sur la grille. Un bateau naît automatiquement sur chaque lac fermé par des tuiles terrestres.</div>
          <div class="mission-desc" data-en>Spawn a required number of boats on the grid. A boat appears automatically on each lake enclosed by land tiles.</div>
        </div>
      </div>
      <div class="mission-card">
        <div class="mission-icon">☄️</div>
        <div>
          <div class="mission-name" data-fr>Comètes</div>
          <div class="mission-name" data-en>Comets</div>
          <div class="mission-desc" data-fr>Des comètes traversent le ciel en temps réel. Cliquez dessus pour les faire exploser et engranger des points — réflexes et vigilance requis.</div>
          <div class="mission-desc" data-en>Comets streak across the sky in real time. Click on them to make them explode and rack up points — reflexes and vigilance required.</div>
        </div>
      </div>
      <div class="mission-card">
        <div class="mission-icon">🏠</div>
        <div>
          <div class="mission-name" data-fr>Village prospère</div>
          <div class="mission-name" data-en>Thriving village</div>
          <div class="mission-desc" data-fr>Constituer un village dense : regrouper suffisamment de secteurs habitation adjacents pour atteindre le seuil fixé.</div>
          <div class="mission-desc" data-en>Build a dense village: cluster enough adjacent house sectors to reach the required threshold.</div>
        </div>
      </div>
      <div class="mission-card">
        <div class="mission-icon">🌾</div>
        <div>
          <div class="mission-name" data-fr>Terres cultivées</div>
          <div class="mission-name" data-en>Cultivated lands</div>
          <div class="mission-desc" data-fr>Étendre les champs en zones continues. Les moulins n'apparaissent que lorsque la zone est assez vaste pour les accueillir.</div>
          <div class="mission-desc" data-en>Expand fields into continuous zones. Mills only appear when the zone is large enough to host them.</div>
        </div>
      </div>
      <div class="mission-card">
        <div class="mission-icon">⚙️</div>
        <div>
          <div class="mission-name" data-fr>Moulins à vent</div>
          <div class="mission-name" data-en>Windmills</div>
          <div class="mission-desc" data-fr>Construire de grandes zones de champs de blé pour y faire apparaître des moulins. Un moulin naît automatiquement au centre de chaque vaste zone de champ.</div>
          <div class="mission-desc" data-en>Build large wheat field zones to spawn windmills. A mill appears automatically at the centre of each large enough field zone.</div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ═══════════ GAMEPLAY ═══════════ -->
<section id="gameplay">
  <div class="container">
    <p class="section-label" data-fr>Mécanique de jeu</p>
    <p class="section-label" data-en>Game mechanics</p>
    <h2 class="section-title" data-fr>Comment jouer</h2>
    <h2 class="section-title" data-en>How to play</h2>
    <p class="section-sub" data-fr>Une boucle simple, une profondeur infinie. Chaque tuile posée transforme le monde.</p>
    <p class="section-sub" data-en>A simple loop, infinite depth. Every tile placed transforms the world.</p>

    <div class="gameplay-ui-preview">
      <img src="./images/tuiles.png" alt="Interface tuiles — tuile courante, suivante et restantes" loading="lazy">
      <p class="gameplay-ui-caption" data-fr>Tuile courante · Tuile suivante · Tuiles restantes</p>
      <p class="gameplay-ui-caption" data-en>Current tile · Next tile · Remaining tiles</p>
    </div>

    <div class="steps-grid">
      <div class="step-card">
        <div class="step-icon">🎴</div>
        <div class="step-title" data-fr>Piochez</div><div class="step-title" data-en>Draw</div>
        <div class="step-desc" data-fr>Une tuile hexagonale apparaît — six secteurs triangulaires, chacun d'un biome. Observez la suivante pour anticiper.</div>
        <div class="step-desc" data-en>A hexagonal tile appears — six triangular sectors, each a biome. Watch the next one to plan ahead.</div>
      </div>
      <div class="step-card">
        <div class="step-icon">🔄</div>
        <div class="step-title" data-fr>Orientez</div><div class="step-title" data-en>Orient</div>
        <div class="step-desc" data-fr>Pivotez la tuile pour aligner ses arêtes. Eau et rail imposent la continuité — une mauvaise pose bloque le réseau.</div>
        <div class="step-desc" data-en>Rotate the tile to align its edges. Water and rail require continuity — a bad placement can break the network.</div>
      </div>
      <div class="step-card">
        <div class="step-icon">🗺️</div>
        <div class="step-title" data-fr>Posez</div><div class="step-title" data-en>Place</div>
        <div class="step-desc" data-fr>Choisissez l'emplacement sur la grille axiale. Entourer une tuile de six voisins rapporte un gros bonus immédiat.</div>
        <div class="step-desc" data-en>Choose a spot on the axial grid. Surrounding a tile with six neighbors earns a large immediate bonus.</div>
      </div>
      <div class="step-card">
        <div class="step-icon">🏆</div>
        <div class="step-title" data-fr>Scorez</div><div class="step-title" data-en>Score</div>
        <div class="step-desc" data-fr>Complétez missions et zones, interceptez des comètes, soumettez votre meilleur score au classement mondial.</div>
        <div class="step-desc" data-en>Complete missions and zones, intercept comets, then submit your best score to the global leaderboard.</div>
      </div>
    </div>

    <div style="margin-top:52px;">
      <p class="section-label" data-fr>Système de score</p>
      <p class="section-label" data-en>Scoring system</p>
      <div class="score-pills">
        <div class="score-pill"><div class="score-pill-pts">+2</div><div class="score-pill-label" data-fr>Pose de tuile</div><div class="score-pill-label" data-en>Tile placed</div></div>
        <div class="score-pill"><div class="score-pill-pts">+10</div><div class="score-pill-label" data-fr>Arête compatible</div><div class="score-pill-label" data-en>Matching edge</div></div>
        <div class="score-pill"><div class="score-pill-pts">+25</div><div class="score-pill-label" data-fr>Réseau connecté</div><div class="score-pill-label" data-en>Network connected</div></div>
        <div class="score-pill"><div class="score-pill-pts">+50</div><div class="score-pill-label" data-fr>Tuile entourée</div><div class="score-pill-label" data-en>Tile surrounded</div></div>
        <div class="score-pill"><div class="score-pill-pts">+100</div><div class="score-pill-label" data-fr>Mission accomplie</div><div class="score-pill-label" data-en>Mission complete</div></div>
        <div class="score-pill"><div class="score-pill-pts">+1000</div><div class="score-pill-label" data-fr>Comète interceptée</div><div class="score-pill-label" data-en>Comet intercepted</div></div>
        <div class="score-pill"><div class="score-pill-pts">+1500</div><div class="score-pill-label" data-fr>Case bonus recouverte</div><div class="score-pill-label" data-en>Bonus cell covered</div></div>
      </div>
    </div>
  </div>
</section>

<!-- ═══════════ GALLERY ═══════════ -->
<section id="gallery">
  <div class="container">
    <p class="section-label" data-fr>Ambiances visuelles</p>
    <p class="section-label" data-en>Visual presets</p>
    <h2 class="section-title" data-fr>16 atmosphères</h2>
    <h2 class="section-title" data-fr>Une infinité de personnalisations</h2>
    <h2 class="section-title" data-en>16 atmospheres</h2>
    <h2 class="section-title" data-en>Infinite customizations</h2>
    <p class="section-sub" data-fr>16 presets visuels prêts à l'emploi — mais chacun est une base : LUT colorimétrique, effets cinématiques (aberration chromatique, grain pellicule, tilt-shift), pixelisation rétro, ambiances EGA et Amiga, fumée volumétrique, ciel procédural… Des centaines de combinaisons pour transformer le monde entier à votre goût. Chaque personnalisation s'exporte en un clic et peut être partagée avec d'autres joueurs.</p>
    <p class="section-sub" data-en>16 ready-to-use visual presets — but each is a starting point: color LUT, cinematic effects (chromatic aberration, film grain, tilt-shift), retro pixelization, EGA and Amiga aesthetics, volumetric smoke, procedural sky… Hundreds of combinations to transform the entire world to your taste. Every customization can be exported in one click and shared with other players.</p>

    <div class="gallery-grid">
      <div class="gallery-card" style="grid-column:span 2;">
        <img src="images/automne.png" alt="Preset Automne" class="gallery-img">
        <div class="gallery-overlay"><div class="gallery-label"><span data-fr>Preset</span><span data-en>Preset</span><span data-fr>Automne</span><span data-en>Autumn</span></div></div>
      </div>

      <div class="gallery-card">
        <img src="images/ete-vif.png" alt="Preset Été vif" class="gallery-img">
        <div class="gallery-overlay"><div class="gallery-label"><span data-fr>Preset</span><span data-en>Preset</span><span data-fr>Été vif</span><span data-en>Vivid Summer</span></div></div>
      </div>

      <div class="gallery-card">
        <img src="images/foret-nordique.png" alt="Preset Forêt nordique" class="gallery-img">
        <div class="gallery-overlay"><div class="gallery-label"><span data-fr>Preset</span><span data-en>Preset</span><span data-fr>Forêt nordique</span><span data-en>Nordic Forest</span></div></div>
      </div>

      <div class="gallery-card" style="grid-column:span 2;">
        <img src="images/amiga.png" alt="Preset Amiga" class="gallery-img">
        <div class="gallery-overlay"><div class="gallery-label"><span data-fr>Preset</span><span data-en>Preset</span><span data-fr>Amiga</span><span data-en>Amiga</span></div></div>
      </div>

      <div class="gallery-card" style="grid-column:span 2;">
        <img src="images/cga.png" alt="Preset CGA" class="gallery-img">
        <div class="gallery-overlay"><div class="gallery-label"><span data-fr>Preset</span><span data-en>Preset</span><span data-fr>CGA 320×200 4 couleurs</span><span data-en>CGA 320×200 4 colors</span></div></div>
      </div>

      <div class="gallery-card" style="grid-column:span 2;">
        <img src="images/apple2.png" alt="Preset Apple II" class="gallery-img">
        <div class="gallery-overlay"><div class="gallery-label"><span data-fr>Preset</span><span data-en>Preset</span><span data-fr>Apple II</span><span data-en>Apple II</span></div></div>
      </div>
    </div>
  </div>
</section>

<!-- ═══════════ JOUR / NUIT ═══════════ -->
<section id="daynnight">
  <div class="container">
    <p class="section-label" data-fr>Ambiance du monde</p>
    <p class="section-label" data-en>World atmosphere</p>
    <h2 class="section-title" data-fr>Jour & Nuit</h2>
    <h2 class="section-title" data-en>Day & Night</h2>
    <p class="section-sub" data-fr>Un seul interrupteur change tout. Le soleil, les nuages et le ciel bleu laissent place aux étoiles, à la lune et aux comètes.</p>
    <p class="section-sub" data-en>One switch changes everything. Sun, clouds and blue sky give way to stars, moon and comets.</p>

    <div class="daynight-grid">
      <div class="daynight-card day">
        <img src="images/jour.png" alt="Mode Jour" class="daynight-img">
        <div class="daynight-body">
        <div class="daynight-icon">☀️</div>
        <div class="daynight-name" data-fr>Mode Jour</div>
        <div class="daynight-name" data-en>Day Mode</div>
        <ul class="daynight-list">
          <li data-fr>🌤 Soleil orbitant sur sa propre couche de rendu</li>
          <li data-en>🌤 Sun orbiting on its own render layer</li>
          <li data-fr>⛅ Ciel volumétrique procédural avec nuages FBM animés</li>
          <li data-en>⛅ Procedural volumetric sky with animated FBM clouds</li>
          <li data-fr>🔵 Gradient zenith/horizon aux teintes bleues chaudes</li>
          <li data-en>🔵 Zenith/horizon gradient in warm blue tones</li>
          <li data-fr>🚫 Comètes masquées — trop de clarté pour elles</li>
          <li data-en>🚫 Comets hidden — too much light for them</li>
        </ul>
        </div>
      </div>
      <div class="daynight-card night">
        <img src="images/nuit.png" alt="Mode Nuit" class="daynight-img">
        <div class="daynight-body">
        <div class="daynight-icon">🌙</div>
        <div class="daynight-name" data-fr>Mode Nuit</div>
        <div class="daynight-name" data-en>Night Mode</div>
        <ul class="daynight-list">
          <li data-fr>🌙 Lune, gradient zenith/horizon nocturne profond</li>
          <li data-en>🌙 Moon, deep nocturnal zenith/horizon gradient</li>
          <li data-fr>✨ Étoiles scintillantes sur une sphère dédiée</li>
          <li data-en>✨ Twinkling stars on a dedicated sphere</li>
          <li data-fr>☄️ Comètes qui filent — cliquez pour les faire exploser</li>
          <li data-en>☄️ Streaking comets — click to make them explode</li>
          <li data-fr>🌑 Atmosphère sombre, fumée des villages plus visible</li>
          <li data-en>🌑 Dark atmosphere, village smoke more visible</li>
        </ul>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ═══════════ MULTIPLAYER ═══════════ -->
<section id="multi">
  <div class="container">
    <div class="multi-inner">
      <div>
        <h2 class="section-title" data-fr>Multiplayer</h2>
        <h2 class="section-title" data-fr>Bâtissez ensemble</h2>
        <h2 class="section-title" data-en>Multiplayer</h2>
        <h2 class="section-title" data-en>Build together</h2>
        <p class="section-sub" data-fr>Rejoignez ou créez une salle avec un code à 6 lettres. La grille est partagée en temps réel — chaque joueur pose ses tuiles et voit les placements des autres au fur et à mesure.</p>
        <p class="section-sub" data-en>Join or create a room with a 6-letter code. The grid is shared in real time — each player places their tiles and sees others' moves as they happen.</p>
        <ul class="multi-feature-list">
          <li data-fr>Toutes les parties sont sauvegardées — reprenez ou rejouez à tout moment</li>
          <li data-en>All games are saved — resume or replay at any time</li>
          <li data-fr>Salles rejoignables à tout moment, même en cours de partie</li>
          <li data-en>Rooms joinable at any time, even mid-game</li>
          <li data-fr>Synchronisation temps réel · PHP + JSON</li>
          <li data-en>Real-time sync · PHP + JSON backend</li>
          <li data-fr>La carte se construit collaborativement, tuile après tuile</li>
          <li data-en>The map grows collaboratively, tile by tile</li>
        </ul>
        <div style="margin-top:28px;">
          <a href="game.php" class="btn-primary" data-fr>Créer une partie</a>
          <a href="game.php" class="btn-primary" data-en>Create a game</a>
        </div>
      </div>
      <div class="room-demo">
        <div class="room-demo-title" data-fr>Code de salle</div>
        <div class="room-demo-title" data-en>Room code</div>
        <div class="room-code">HEXGRP</div>
        <div style="font-size:10px;letter-spacing:0.14em;color:var(--text-dim);text-align:center;margin-top:4px;" data-fr>Partie en cours · 3 joueurs</div>
        <div style="font-size:10px;letter-spacing:0.14em;color:var(--text-dim);text-align:center;margin-top:4px;" data-en>Game in progress · 3 players</div>
        <div class="room-players">
          <div class="player-dot active">🧑</div>
          <div class="player-dot active">👩</div>
          <div class="player-dot active">🧔</div>
          <div class="player-dot">…</div>
        </div>
        <div class="room-scores">
          <div style="font-size:9px;letter-spacing:0.22em;color:var(--text-dim);text-transform:uppercase;margin-bottom:8px;" data-fr>Tuiles posées</div>
          <div style="font-size:9px;letter-spacing:0.22em;color:var(--text-dim);text-transform:uppercase;margin-bottom:8px;" data-en>Tiles placed</div>
          <div class="room-score-row">
            <span class="room-score-name">Piregwan</span>
            <span class="room-score-pts" style="color:var(--gold);">47</span>
          </div>
          <div class="room-score-row">
            <span class="room-score-name" style="color:var(--text-dim);">Emil</span>
            <span class="room-score-pts" style="color:var(--blue);">31</span>
          </div>
          <div class="room-score-row">
            <span class="room-score-name" style="color:var(--text-dim);">Josef</span>
            <span class="room-score-pts" style="color:var(--blue);">28</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ═══════════ HIGHSCORES ═══════════ -->
<section id="scores">
  <div class="container">
    <p class="section-label" data-fr>Classement mondial</p>
    <p class="section-label" data-en>Global leaderboard</p>
    <h2 class="section-title" data-fr>Les meilleurs bâtisseurs</h2>
    <h2 class="section-title" data-en>The greatest builders</h2>

    <?php if (empty($highscores)): ?>
      <div class="hs-empty">
        <div style="font-size:32px;margin-bottom:12px;">🏆</div>
        <div data-fr>Aucun score enregistré — soyez le premier à poser votre tuile.</div>
        <div data-en>No scores yet — be the first to place your tile.</div>
      </div>
    <?php else: ?>
    <div class="hs-list">
      <?php foreach ($highscores as $i => $hs):
        $goldClass = $i === 0 ? 'gold-1' : ($i === 1 ? 'gold-2' : ($i === 2 ? 'gold-3' : ''));
        $dateStr   = fmt_date($hs['date']);
        $biomeIcons = ['forest'=>'🌲','water'=>'💧','house'=>'🏘️','field'=>'🌾','grass'=>'🌿','rail'=>'🛤️'];
        $biomeLabels = [
          'forest' => ['fr'=>'Forêt',      'en'=>'Forest'],
          'water'  => ['fr'=>'Eau',         'en'=>'Water'],
          'house'  => ['fr'=>'Village',     'en'=>'Village'],
          'field'  => ['fr'=>'Champ de blé','en'=>'Wheat field'],
          'grass'  => ['fr'=>'Prairie',     'en'=>'Meadow'],
          'rail'   => ['fr'=>'Voie ferrée', 'en'=>'Rail'],
        ];
      ?>
      <div class="hs-card <?= $goldClass ?>">
        <div class="hs-rank"><?= $i + 1 ?></div>
        <div class="hs-main">
          <div class="hs-name"><?= htmlspecialchars($hs['name']) ?></div>
          <div class="hs-meta">
            <?php if ($hs['tiles']  > 0): ?>
            <span class="hs-meta-item"><span class="icon">🗺️</span><?= number_format($hs['tiles']) ?> <span data-fr>tuiles</span><span data-en>tiles</span></span>
            <?php endif; ?>
            <?php if ($hs['trains'] > 0): ?>
            <span class="hs-meta-item"><span class="icon">🚂</span><?= $hs['trains'] ?> <span data-fr>ligne<?= $hs['trains'] > 1 ? 's' : '' ?></span><span data-en>line<?= $hs['trains'] > 1 ? 's' : '' ?></span></span>
            <?php endif; ?>
            <?php if ($hs['boats']  > 0): ?>
            <span class="hs-meta-item"><span class="icon">⛵</span><?= $hs['boats'] ?> <span data-fr>bateau<?= $hs['boats'] > 1 ? 'x' : '' ?></span><span data-en>boat<?= $hs['boats'] > 1 ? 's' : '' ?></span></span>
            <?php endif; ?>
            <?php if ($hs['comets'] > 0): ?>
            <span class="hs-meta-item"><span class="icon">☄️</span><?= $hs['comets'] ?> <span data-fr>comète<?= $hs['comets'] > 1 ? 's' : '' ?></span><span data-en>comet<?= $hs['comets'] > 1 ? 's' : '' ?></span></span>
            <?php endif; ?>
            <?php if ($dateStr): ?>
            <span class="hs-meta-item hs-date"><?= $dateStr ?></span>
            <?php endif; ?>
          </div>
          <?php
            $biomeChips = '';
            foreach ($biomeIcons as $bt => $icon) {
              $tot = $hs['totals'][$bt] ?? 0;
              $max = $hs['largest'][$bt] ?? 0;
              if ($tot > 0 || $max > 0) {
                $lFr = $biomeLabels[$bt]['fr'];
                $lEn = $biomeLabels[$bt]['en'];
                $biomeChips .= '<span class="hs-meta-item hs-biome-chip" title="' . $lFr . '">'
                  . '<span class="icon">' . $icon . '</span>'
                  . '<span class="hs-biome-total">' . number_format($tot) . '</span>'
                  . '<span class="hs-biome-sep">/</span>'
                  . '<span class="hs-biome-max">' . $max . '</span>'
                  . '</span>';
              }
            }
            if ($biomeChips): ?>
          <div class="hs-meta hs-meta-biomes"><?= $biomeChips ?></div>
          <?php endif; ?>
        </div>
        <div class="hs-score-col">
          <div class="hs-score"><?= number_format($hs['score']) ?></div>
        </div>
      </div>
      <?php endforeach; ?>
    </div>
    <?php endif; ?>

    <div style="text-align:center;margin-top:40px;">
      <a href="game.php" class="btn-primary" data-fr>Tenter votre chance →</a>
      <a href="game.php" class="btn-primary" data-en>Try your luck →</a>
    </div>
  </div>
</section>

<!-- ═══════════ FOOTER ═══════════ -->
<footer>
  <div class="container">
    <div class="footer-inner">
      <div class="footer-logo">⬡ HEXISTENZ</div>
      <div class="footer-copy" data-fr>Jeu hexagonal contemplatif fait avec nostalgie et amour ❤️ Three.js et beaucoup de tuiles · 2025–2026</div>
          <div class="footer-copy" data-en>A contemplative hexagonal game made with love ❤️ Three.js and a lot of tiles · 2025–2026</div>
      <div class="footer-links-group">
        <a href="https://krakoukas.com" class="footer-link" target="_blank" rel="noopener">Krakoukas</a>
        <span class="footer-sep">·</span>
        <a href="https://www.wildlabs.fr" class="footer-link" target="_blank" rel="noopener">Wildlabs</a>
        <span class="footer-sep">·</span>
        <a href="https://github.com/Krakoukas73/hexistenz" class="footer-link" target="_blank" rel="noopener" data-fr>Sur GitHub</a>
        <a href="https://github.com/Krakoukas73/hexistenz" class="footer-link" target="_blank" rel="noopener" data-en>On GitHub</a>
      </div>
    </div>
  </div>
  <div class="footer-screenshot">
    <img src="./images/nuit-transparent.png" alt="" aria-hidden="true">
  </div>
</footer>

<script>
  function setLang(l) {
    document.documentElement.dataset.lang = l;
    document.getElementById('btn-fr').classList.toggle('active', l === 'fr');
    document.getElementById('btn-en').classList.toggle('active', l === 'en');
    localStorage.setItem('hexistenz_pres_lang', l);
  }
  const saved = localStorage.getItem('hexistenz_pres_lang');
  if (saved === 'en') setLang('en');
</script>

<script src="https://cdn.jsdelivr.net/npm/particles.js@2.0.0/particles.min.js"></script>
<script>
particlesJS("particles-js", {
  particles: {
    number: { value: 105, density: { enable: true, value_area: 900 } },
    color: { value: ["#4a9eff", "#a0c8ff", "#ffffff"] },
    shape: { type: "circle" },
    opacity: { value: 0.45, random: true, anim: { enable: true, speed: 0.4, opacity_min: 0.05, sync: false } },
    size: { value: 2.3, random: true, anim: { enable: false } },
    line_linked: { enable: false },
    move: {
      enable: true, speed: 1.44, direction: "none",
      random: true, straight: false, out_mode: "out", bounce: false
    }
  },
  interactivity: {
    detect_on: "window",
    events: { onhover: { enable: false }, onclick: { enable: false }, resize: true }
  },
  retina_detect: true
});
</script>
</body>
</html>
