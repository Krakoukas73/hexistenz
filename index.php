<?php
// Version — extraite de variables.js
$version = '';
$varsFile = __DIR__ . '/javascript/variables.js';
if (file_exists($varsFile)) {
    $js = file_get_contents($varsFile);
    if (preg_match("/HEXISTENZ_VERSION\s*=\s*'([^']+)'/", $js, $m)) {
        $version = $m[1];
    }
}
$cssFile = __DIR__ . '/css/presentation.css';
$cssVersion = file_exists($cssFile) ? filemtime($cssFile) : time();

// Textes bilingues de la prez — json/languages/{french,english}.json (2026-07-12).
// $t['fr']/$t['en'] sont les 2 tableaux ; toutes les paires data-fr/data-en du
// markup ci-dessous lisent leur contenu ici plutôt que du texte codé en dur.
$langDir = __DIR__ . '/json/languages/';
$t = [
    'fr' => json_decode(@file_get_contents($langDir . 'french.json'), true) ?: [],
    'en' => json_decode(@file_get_contents($langDir . 'english.json'), true) ?: [],
];
// Accesseur sûr : $tr('fr','hero.tagline') — évite les notices sur clé manquante.
function tr($t, $lang, $path) {
    $node = $t[$lang] ?? [];
    foreach (explode('.', $path) as $part) {
        if (!is_array($node) || !array_key_exists($part, $node)) return '';
        $node = $node[$part];
    }
    return $node;
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
                        'mills'        => isset($stats['millCount'])  ? (int)$stats['millCount']  : 0,
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
  <link rel="stylesheet" href="css/presentation.css?v=<?= $cssVersion ?>" />
</head>
<body>

<div id="particles-js" aria-hidden="true"></div>
<div class="bg-layer" aria-hidden="true"></div>

<!-- ─── NAV ────────────────────────────────────────────────────── -->
<nav>
  <a class="nav-logo" href="#">⬡ HEXISTENZ<?php if ($version): ?><span class="nav-version"><?= htmlspecialchars($version) ?></span><?php endif; ?></a>
  <button class="nav-toggle" id="navToggle" type="button" aria-label="Menu" aria-controls="navLinks" aria-expanded="false">
    <span></span><span></span><span></span>
  </button>
  <ul class="nav-links" id="navLinks">
    <li><a href="#factions" data-fr><?= tr($t,'fr','nav.links.factions') ?></a>    <a href="#factions" data-en><?= tr($t,'en','nav.links.factions') ?></a></li>
    <li><a href="#biomes"   data-fr><?= tr($t,'fr','nav.links.biomes') ?></a>      <a href="#biomes"   data-en><?= tr($t,'en','nav.links.biomes') ?></a></li>
    <li><a href="#missions" data-fr><?= tr($t,'fr','nav.links.missions') ?></a>    <a href="#missions" data-en><?= tr($t,'en','nav.links.missions') ?></a></li>
    <li><a href="#gameplay" data-fr><?= tr($t,'fr','nav.links.gameplay') ?></a>    <a href="#gameplay" data-en><?= tr($t,'en','nav.links.gameplay') ?></a></li>
    <li><a href="#gallery"  data-fr><?= tr($t,'fr','nav.links.gallery') ?></a>   <a href="#gallery"  data-en><?= tr($t,'en','nav.links.gallery') ?></a></li>
    <li><a href="#creatures" data-fr><?= tr($t,'fr','nav.links.creatures') ?></a>  <a href="#creatures" data-en><?= tr($t,'en','nav.links.creatures') ?></a></li>
    <li><a href="#audio"    data-fr><?= tr($t,'fr','nav.links.audio') ?></a>       <a href="#audio"    data-en><?= tr($t,'en','nav.links.audio') ?></a></li>
    <li><a href="#daynnight" data-fr><?= tr($t,'fr','nav.links.daynnight') ?></a> <a href="#daynnight" data-en><?= tr($t,'en','nav.links.daynnight') ?></a></li>
    <li><a href="#eda"      data-fr><?= tr($t,'fr','nav.links.eda') ?></a> <a href="#eda" data-en><?= tr($t,'en','nav.links.eda') ?></a></li>
    <li><a href="#multi"    data-fr><?= tr($t,'fr','nav.links.multi') ?></a> <a href="#multi"    data-en><?= tr($t,'en','nav.links.multi') ?></a></li>
    <li><a href="#scores"   data-fr><?= tr($t,'fr','nav.links.scores') ?></a>  <a href="#scores"   data-en><?= tr($t,'en','nav.links.scores') ?></a></li>
  </ul>
  <div id="lang-toggle">
    <button onclick="setLang('fr')" id="btn-fr" class="active">FR</button>
    <button onclick="setLang('en')" id="btn-en">EN</button>
  </div>
  <a href="game.php" class="nav-cta" data-fr><?= tr($t,'fr','nav.play') ?></a>
  <a href="game.php" class="nav-cta" data-en><?= tr($t,'en','nav.play') ?></a>
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
          <span data-fr><?= tr($t,'fr','hero.subtitle') ?></span>
          <span data-en><?= tr($t,'en','hero.subtitle') ?></span>
        </p>

        <p class="hero-inspi" data-fr>
          <?= tr($t,'fr','hero.inspi_text') ?>
        </p>
        <p class="hero-inspi" data-en>
          <?= tr($t,'en','hero.inspi_text') ?>
        </p>

        <div class="hero-inspi-grid">
          <div class="hero-inspi-col">
            <div class="hero-inspi-card">
              <img src="./images/dorfromantik.jpg" alt="Dorfromantik" class="hero-inspi-img" loading="lazy">
              <div class="hero-inspi-caption">
                <div class="hero-inspi-name">Dorfromantik</div>
              </div>
            </div>
            <a class="hero-inspi-buy" href="https://store.steampowered.com/app/1455840/Dorfromantik/" target="_blank" rel="noopener">🎮 <span data-fr><?= tr($t,'fr','hero.inspi_buy.dorfromantik') ?></span><span data-en><?= tr($t,'en','hero.inspi_buy.dorfromantik') ?></span></a>
          </div>
          <div class="hero-inspi-col">
            <div class="hero-inspi-card">
              <img src="./images/settlers.jpg" alt="The Settlers" class="hero-inspi-img" loading="lazy">
              <div class="hero-inspi-caption">
                <div class="hero-inspi-name">The Settlers</div>
              </div>
            </div>
            <a class="hero-inspi-buy" href="https://www.ubisoft.com/en-gb/games/the-settlers-history-edition" target="_blank" rel="noopener">🎮 <span data-fr><?= tr($t,'fr','hero.inspi_buy.settlers') ?></span><span data-en><?= tr($t,'en','hero.inspi_buy.settlers') ?></span></a>
          </div>
          <div class="hero-inspi-col">
            <div class="hero-inspi-card">
              <img src="./images/heroes.jpg" alt="Heroes of Might and Magic" class="hero-inspi-img" loading="lazy">
              <div class="hero-inspi-caption">
                <div class="hero-inspi-name">Heroes of Might &amp; Magic</div>
              </div>
            </div>
            <a class="hero-inspi-buy" href="https://www.gog.com/en/game/heroes_of_might_and_magic_3_complete_edition" target="_blank" rel="noopener">🎮 <span data-fr><?= tr($t,'fr','hero.inspi_buy.heroes3') ?></span><span data-en><?= tr($t,'en','hero.inspi_buy.heroes3') ?></span></a>
          </div>
        </div>

        <p class="hero-tagline" data-fr>
          <?= tr($t,'fr','hero.tagline') ?>
        </p>
        <p class="hero-tagline" data-en>
          <?= tr($t,'en','hero.tagline') ?>
        </p>
        <div class="hero-buttons">
          <a href="game.php" class="btn-primary" data-fr><?= tr($t,'fr','hero.btn_play') ?></a>
          <a href="game.php" class="btn-primary" data-en><?= tr($t,'en','hero.btn_play') ?></a>
          <a href="#gameplay" class="btn-secondary" data-fr><?= tr($t,'fr','hero.btn_how') ?></a>
          <a href="#gameplay" class="btn-secondary" data-en><?= tr($t,'en','hero.btn_how') ?></a>
        </div>
        <div class="stats-bar">
          <div class="stat-item"><div class="stat-num">6</div><div class="stat-label" data-fr><?= tr($t,'fr','hero.stats.biomes_label') ?></div><div class="stat-label" data-en><?= tr($t,'en','hero.stats.biomes_label') ?></div></div>
          <div class="stat-item"><div class="stat-num">∞</div><div class="stat-label" data-fr><?= tr($t,'fr','hero.stats.games_label') ?></div><div class="stat-label" data-en><?= tr($t,'en','hero.stats.games_label') ?></div></div>
          <div class="stat-item"><div class="stat-num">2</div><div class="stat-label" data-fr><?= tr($t,'fr','hero.stats.factions_label') ?></div><div class="stat-label" data-en><?= tr($t,'en','hero.stats.factions_label') ?></div></div>
        </div>
      </div>

    </div>
  </div>
  </div><!-- /.hero-content -->
</section>

<!-- ═══════════ FACTIONS ═══════════ -->
<section id="factions">
  <div class="container">
    <p class="section-label" data-fr><?= tr($t,'fr','factions.label') ?></p>
    <p class="section-label" data-en><?= tr($t,'en','factions.label') ?></p>
    <h2 class="section-title" data-fr><?= tr($t,'fr','factions.title1') ?></h2>
    <h2 class="section-title" data-en><?= tr($t,'en','factions.title1') ?></h2>
    <h2 class="section-title" data-fr><?= tr($t,'fr','factions.title2') ?></h2>
    <h2 class="section-title" data-en><?= tr($t,'en','factions.title2') ?></h2>
    <p class="section-sub" data-fr>
      <?= tr($t,'fr','factions.sub') ?>
    </p>
    <p class="section-sub" data-en>
      <?= tr($t,'en','factions.sub') ?>
    </p>

    <div class="factions-grid">
      <div class="faction-card platiste">
        <div class="faction-img" style="display:block;padding:0;">
          <img src="images/platiste.jpg" alt="Mode Platiste" style="width:100%;height:100%;object-fit:cover;display:block;">
        </div>
        <div class="faction-body">
          <span class="faction-tag" data-fr><?= tr($t,'fr','factions.flat.tag') ?></span>
          <span class="faction-tag" data-en><?= tr($t,'en','factions.flat.tag') ?></span>
          <div class="faction-name" data-fr><?= tr($t,'fr','factions.flat.name') ?></div>
          <div class="faction-name" data-en><?= tr($t,'en','factions.flat.name') ?></div>
          <p class="faction-desc" data-fr>
            <?= tr($t,'fr','factions.flat.desc') ?>
          </p>
          <p class="faction-desc" data-en>
            <?= tr($t,'en','factions.flat.desc') ?>
          </p>
        </div>
      </div>

      <div class="faction-card bouliste">
        <div class="faction-img" style="display:block;padding:0;">
          <img src="images/bouliste-transparent.png" alt="Mode Bouliste" style="width:100%;height:100%;object-fit:cover;display:block;">
        </div>
        <div class="faction-body">
          <span class="faction-tag" data-fr><?= tr($t,'fr','factions.globe.tag') ?></span>
          <span class="faction-tag" data-en><?= tr($t,'en','factions.globe.tag') ?></span>
          <div class="faction-name" data-fr><?= tr($t,'fr','factions.globe.name') ?></div>
          <div class="faction-name" data-en><?= tr($t,'en','factions.globe.name') ?></div>
          <p class="faction-desc" data-fr>
            <?= tr($t,'fr','factions.globe.desc') ?>
          </p>
          <p class="faction-desc" data-en>
            <?= tr($t,'en','factions.globe.desc') ?>
          </p>
        </div>
      </div>
    </div>

    <div class="faction-vs" data-fr><?= tr($t,'fr','factions.vs') ?></div>
    <div class="faction-vs" data-en><?= tr($t,'en','factions.vs') ?></div>
  </div>
</section>

<!-- ═══════════ BIOMES ═══════════ -->
<section id="biomes">
  <div class="container">
    <p class="section-label" data-fr><?= tr($t,'fr','biomes.label') ?></p>
    <p class="section-label" data-en><?= tr($t,'en','biomes.label') ?></p>
    <h2 class="section-title" data-fr><?= tr($t,'fr','biomes.title') ?></h2>
    <h2 class="section-title" data-en><?= tr($t,'en','biomes.title') ?></h2>
    <p class="section-sub" data-fr><?= tr($t,'fr','biomes.sub') ?></p>
    <p class="section-sub" data-en><?= tr($t,'en','biomes.sub') ?></p>

    <div class="biomes-grid">
      <?php
      $biomeCards = [
        ['key' => 'grass',  'img' => 'images/biome-prairie.jpg', 'alt' => 'Prairie',    'cls' => 'grass'],
        ['key' => 'field',  'img' => 'images/biome-ble.jpg',     'alt' => 'Champ',      'cls' => 'field'],
        ['key' => 'forest', 'img' => 'images/biome-foret.jpg',   'alt' => 'Forêt',      'cls' => 'forest'],
        ['key' => 'house',  'img' => 'images/biome-village.jpg','alt' => 'Village',    'cls' => 'house'],
        ['key' => 'water',  'img' => 'images/biome-eau.jpg',     'alt' => 'Eau',        'cls' => 'water'],
        ['key' => 'rail',   'img' => 'images/biome-train.jpg',   'alt' => 'Voie ferrée','cls' => 'rail'],
      ];
      foreach ($biomeCards as $bc): $k = $bc['key']; ?>
      <div class="biome-card <?= $bc['cls'] ?>">
        <div class="biome-banner">
          <img src="<?= $bc['img'] ?>" alt="<?= htmlspecialchars($bc['alt']) ?>" class="biome-banner-img">
          <div class="biome-banner-overlay">
            <div class="biome-name" data-fr><?= tr($t,'fr',"biomes.$k.name") ?></div><div class="biome-name" data-en><?= tr($t,'en',"biomes.$k.name") ?></div>
          </div>
        </div>
        <div class="biome-body">
          <div class="biome-desc" data-fr><?= tr($t,'fr',"biomes.$k.desc") ?></div>
          <div class="biome-desc" data-en><?= tr($t,'en',"biomes.$k.desc") ?></div>
          <span class="biome-tag" data-fr><?= tr($t,'fr',"biomes.$k.tag") ?></span><span class="biome-tag" data-en><?= tr($t,'en',"biomes.$k.tag") ?></span>
        </div>
      </div>
      <?php endforeach; ?>
    </div>
  </div>
</section>

<!-- ═══════════ MISSIONS ═══════════ -->
<section id="missions">
  <div class="container">
    <p class="section-label" data-fr><?= tr($t,'fr','missions.label') ?></p>
    <p class="section-label" data-en><?= tr($t,'en','missions.label') ?></p>
    <h2 class="section-title" data-fr><?= tr($t,'fr','missions.title') ?></h2>
    <h2 class="section-title" data-en><?= tr($t,'en','missions.title') ?></h2>
    <p class="section-sub" data-fr><?= tr($t,'fr','missions.sub') ?></p>
    <p class="section-sub" data-en><?= tr($t,'en','missions.sub') ?></p>

    <div class="missions-grid">
      <?php
      $missionCards = [
        ['key' => 'zone',    'icon' => '🌿'],
        ['key' => 'rail',    'icon' => '🛤️'],
        ['key' => 'trains',  'icon' => '🚂'],
        ['key' => 'water',   'icon' => '💧'],
        ['key' => 'boats',   'icon' => '⛵'],
        ['key' => 'comets',  'icon' => '☄️'],
        ['key' => 'village', 'icon' => '🏠'],
        ['key' => 'fields',  'icon' => '🌾'],
        ['key' => 'mills',   'icon' => '⚙️'],
      ];
      foreach ($missionCards as $mc): $k = $mc['key']; ?>
      <div class="mission-card">
        <div class="mission-icon"><?= $mc['icon'] ?></div>
        <div>
          <div class="mission-name" data-fr><?= tr($t,'fr',"missions.$k.name") ?></div>
          <div class="mission-name" data-en><?= tr($t,'en',"missions.$k.name") ?></div>
          <div class="mission-desc" data-fr><?= tr($t,'fr',"missions.$k.desc") ?></div>
          <div class="mission-desc" data-en><?= tr($t,'en',"missions.$k.desc") ?></div>
        </div>
      </div>
      <?php endforeach; ?>
    </div>
  </div>
</section>

<!-- ═══════════ GAMEPLAY ═══════════ -->
<section id="gameplay">
  <div class="container">
    <p class="section-label" data-fr><?= tr($t,'fr','gameplay.label') ?></p>
    <p class="section-label" data-en><?= tr($t,'en','gameplay.label') ?></p>
    <h2 class="section-title" data-fr><?= tr($t,'fr','gameplay.title') ?></h2>
    <h2 class="section-title" data-en><?= tr($t,'en','gameplay.title') ?></h2>
    <p class="section-sub" data-fr><?= tr($t,'fr','gameplay.sub') ?></p>
    <p class="section-sub" data-en><?= tr($t,'en','gameplay.sub') ?></p>

    <div class="gameplay-ui-preview">
      <img src="./images/tuiles.png" alt="Interface tuiles — tuile courante, suivante et restantes" loading="lazy">
      <p class="gameplay-ui-caption" data-fr><?= tr($t,'fr','gameplay.ui_caption') ?></p>
      <p class="gameplay-ui-caption" data-en><?= tr($t,'en','gameplay.ui_caption') ?></p>
    </div>

    <div class="steps-grid">
      <?php
      $steps = [
        ['key' => 'draw',   'icon' => '🎴'],
        ['key' => 'orient', 'icon' => '🔄'],
        ['key' => 'place',  'icon' => '🗺️'],
        ['key' => 'score',  'icon' => '🏆'],
      ];
      foreach ($steps as $sc): $k = $sc['key']; ?>
      <div class="step-card">
        <div class="step-icon"><?= $sc['icon'] ?></div>
        <div class="step-title" data-fr><?= tr($t,'fr',"gameplay.steps.$k.title") ?></div><div class="step-title" data-en><?= tr($t,'en',"gameplay.steps.$k.title") ?></div>
        <div class="step-desc" data-fr><?= tr($t,'fr',"gameplay.steps.$k.desc") ?></div>
        <div class="step-desc" data-en><?= tr($t,'en',"gameplay.steps.$k.desc") ?></div>
      </div>
      <?php endforeach; ?>
    </div>

    <div style="margin-top:52px;">
      <p class="section-label" data-fr><?= tr($t,'fr','gameplay.score_label') ?></p>
      <p class="section-label" data-en><?= tr($t,'en','gameplay.score_label') ?></p>
      <div class="score-pills">
        <?php
        $pills = [
          ['key' => 'place',    'pts' => '+2'],
          ['key' => 'edge',     'pts' => '+10'],
          ['key' => 'network',  'pts' => '+25'],
          ['key' => 'surround', 'pts' => '+50'],
          ['key' => 'mission',  'pts' => '+100'],
          ['key' => 'comet',    'pts' => '+75'],
          ['key' => 'bonus',    'pts' => '+1500'],
        ];
        foreach ($pills as $pc): $k = $pc['key']; ?>
        <div class="score-pill"><div class="score-pill-pts"><?= $pc['pts'] ?></div><div class="score-pill-label" data-fr><?= tr($t,'fr',"gameplay.pills.$k") ?></div><div class="score-pill-label" data-en><?= tr($t,'en',"gameplay.pills.$k") ?></div></div>
        <?php endforeach; ?>
      </div>
    </div>

    <div class="kbd-strip">
      <div class="kbd-strip-item"><kbd>Z</kbd><kbd>Q</kbd><kbd>S</kbd><kbd>D</kbd><span data-fr><?= tr($t,'fr','gameplay.kbd.camera_label') ?></span><span data-en><?= tr($t,'en','gameplay.kbd.camera_label') ?></span></div>
      <div class="kbd-strip-item"><kbd data-fr><?= tr($t,'fr','gameplay.kbd.left_click_kbd') ?></kbd><kbd data-en><?= tr($t,'en','gameplay.kbd.left_click_kbd') ?></kbd><span data-fr><?= tr($t,'fr','gameplay.kbd.left_click_desc') ?></span><span data-en><?= tr($t,'en','gameplay.kbd.left_click_desc') ?></span></div>
      <div class="kbd-strip-item"><kbd data-fr><?= tr($t,'fr','gameplay.kbd.right_click_kbd') ?></kbd><kbd data-en><?= tr($t,'en','gameplay.kbd.right_click_kbd') ?></kbd><span data-fr><?= tr($t,'fr','gameplay.kbd.right_click_desc') ?></span><span data-en><?= tr($t,'en','gameplay.kbd.right_click_desc') ?></span></div>
      <div class="kbd-strip-item"><kbd data-fr><?= tr($t,'fr','gameplay.kbd.wheel_kbd') ?></kbd><kbd data-en><?= tr($t,'en','gameplay.kbd.wheel_kbd') ?></kbd><span data-fr><?= tr($t,'fr','gameplay.kbd.wheel_desc') ?></span><span data-en><?= tr($t,'en','gameplay.kbd.wheel_desc') ?></span></div>
      <div class="kbd-strip-item"><kbd>R</kbd><span data-fr><?= tr($t,'fr','gameplay.kbd.reset_cam') ?></span><span data-en><?= tr($t,'en','gameplay.kbd.reset_cam') ?></span></div>
      <div class="kbd-strip-item"><kbd>Ctrl</kbd><kbd>Z</kbd><span data-fr><?= tr($t,'fr','gameplay.kbd.undo') ?></span><span data-en><?= tr($t,'en','gameplay.kbd.undo') ?></span></div>
      <div class="kbd-strip-item"><kbd>E</kbd><span data-fr><?= tr($t,'fr','gameplay.kbd.customization') ?></span><span data-en><?= tr($t,'en','gameplay.kbd.customization') ?></span></div>
      <div class="kbd-strip-item"><kbd>F</kbd><span data-fr><?= tr($t,'fr','gameplay.kbd.perf_hud') ?></span><span data-en><?= tr($t,'en','gameplay.kbd.perf_hud') ?></span></div>
      <div class="kbd-strip-item"><kbd>Espace</kbd><span data-fr><?= tr($t,'fr','gameplay.kbd.immersive') ?></span><span data-en><?= tr($t,'en','gameplay.kbd.immersive') ?></span></div>
      <div class="kbd-strip-item"><kbd>M</kbd><span data-fr><?= tr($t,'fr','gameplay.kbd.mute') ?></span><span data-en><?= tr($t,'en','gameplay.kbd.mute') ?></span></div>
      <div class="kbd-strip-item"><kbd>H</kbd><span data-fr><?= tr($t,'fr','gameplay.kbd.help') ?></span><span data-en><?= tr($t,'en','gameplay.kbd.help') ?></span></div>
    </div>
  </div>
</section>

<!-- ═══════════ GALLERY ═══════════ -->
<section id="gallery">
  <div class="container">
    <p class="section-label" data-fr><?= tr($t,'fr','gallery.label') ?></p>
    <p class="section-label" data-en><?= tr($t,'en','gallery.label') ?></p>
    <h2 class="section-title" data-fr><?= tr($t,'fr','gallery.title1') ?></h2>
    <h2 class="section-title" data-fr><?= tr($t,'fr','gallery.title2') ?></h2>
    <h2 class="section-title" data-en><?= tr($t,'en','gallery.title1') ?></h2>
    <h2 class="section-title" data-en><?= tr($t,'en','gallery.title2') ?></h2>
    <p class="section-sub" data-fr><?= tr($t,'fr','gallery.sub') ?></p>
    <p class="section-sub" data-en><?= tr($t,'en','gallery.sub') ?></p>

    <div class="gallery-grid">
      <?php
      $presets = [
        ['key' => 'autumn', 'img' => 'images/automne.jpg',      'alt' => 'Preset Automne',   'span' => 2, 'contain' => false],
        ['key' => 'summer', 'img' => 'images/ete-vif.jpg',      'alt' => 'Preset Été vif',   'span' => 0, 'contain' => false],
        ['key' => 'nordic', 'img' => 'images/foret-nordique.jpg','alt' => 'Preset Nordique', 'span' => 0, 'contain' => false],
        ['key' => 'amiga',  'img' => 'images/amiga.jpg',        'alt' => 'Preset Amiga',     'span' => 2, 'contain' => false],
        ['key' => 'ega',    'img' => 'images/ega.jpg',          'alt' => 'Preset EGA',       'span' => 2, 'contain' => true],
        ['key' => 'cga',    'img' => 'images/cga.jpg',          'alt' => 'Preset CGA',       'span' => 2, 'contain' => true],
        ['key' => 'apple2', 'img' => 'images/apple2.jpg',       'alt' => 'Preset Apple II',  'span' => 2, 'contain' => true],
        ['key' => 'psyche', 'img' => 'images/pysche-lsd.jpg',   'alt' => 'Preset Psyché-LSD','span' => 0, 'contain' => false],
      ];
      foreach ($presets as $pc):
        $k = $pc['key'];
        $cls = 'gallery-card' . ($pc['contain'] ? ' gallery-card--contain' : '');
        $style = $pc['span'] ? ' style="grid-column:span ' . $pc['span'] . ';"' : '';
      ?>
      <div class="<?= $cls ?>"<?= $style ?>>
        <img src="<?= $pc['img'] ?>" alt="<?= htmlspecialchars($pc['alt']) ?>" class="gallery-img">
        <div class="gallery-overlay"><div class="gallery-label"><span data-fr><?= tr($t,'fr','gallery.preset_word') ?></span><span data-en><?= tr($t,'en','gallery.preset_word') ?></span><span data-fr><?= tr($t,'fr',"gallery.presets.$k") ?></span><span data-en><?= tr($t,'en',"gallery.presets.$k") ?></span></div></div>
      </div>
      <?php endforeach; ?>
    </div>
  </div>
</section>

<!-- ═══════════ CREATURES ═══════════ -->
<section id="creatures">
  <div class="container">
    <p class="section-label" data-fr><?= tr($t,'fr','creatures.label') ?></p>
    <p class="section-label" data-en><?= tr($t,'en','creatures.label') ?></p>
    <h2 class="section-title" data-fr><?= tr($t,'fr','creatures.title') ?></h2>
    <h2 class="section-title" data-en><?= tr($t,'en','creatures.title') ?></h2>
    <p class="section-sub" data-fr><?= tr($t,'fr','creatures.sub') ?></p>
    <p class="section-sub" data-en><?= tr($t,'en','creatures.sub') ?></p>

    <div class="creatures-grid">
      <?php
      $creatures = [
        ['key' => 'sheep',     'img' => 'images/moutons.jpg',  'alt' => 'Moutons'],
        ['key' => 'crows',     'img' => 'images/corbeaux.jpg', 'alt' => 'Corbeaux'],
        ['key' => 'farmer',    'img' => 'images/fermier.jpg',  'alt' => 'Fermier'],
        ['key' => 'druid',     'img' => 'images/monk.jpg',     'alt' => 'Druide'],
        ['key' => 'witch',     'img' => 'images/sorciere.jpg', 'alt' => 'Sorcière'],
        ['key' => 'moon',      'img' => 'images/melies.jpg',   'alt' => 'Lune de Méliès'],
        ['key' => 'seagulls',  'img' => 'images/mouettes.jpg', 'alt' => 'Mouettes'],
        ['key' => 'fireflies', 'img' => 'images/lucioles.jpg', 'alt' => 'Lucioles'],
      ];
      foreach ($creatures as $cc): $k = $cc['key']; ?>
      <div class="creature-card">
        <div class="creature-banner">
          <img src="<?= $cc['img'] ?>" alt="<?= htmlspecialchars($cc['alt']) ?>" class="creature-banner-img">
          <div class="creature-banner-overlay">
            <div class="creature-name" data-fr><?= tr($t,'fr',"creatures.$k.name") ?></div><div class="creature-name" data-en><?= tr($t,'en',"creatures.$k.name") ?></div>
          </div>
        </div>
        <div class="creature-body">
          <div class="creature-desc" data-fr><?= tr($t,'fr',"creatures.$k.desc") ?></div>
          <div class="creature-desc" data-en><?= tr($t,'en',"creatures.$k.desc") ?></div>
        </div>
      </div>
      <?php endforeach; ?>
    </div>

    <div class="population-strip">
      <div class="population-group">
        <div class="population-group-label" data-fr><?= tr($t,'fr','creatures.population.villages_label') ?></div>
        <div class="population-group-label" data-en><?= tr($t,'en','creatures.population.villages_label') ?></div>
        <div class="population-tags">
          <span class="population-tag" data-fr><?= tr($t,'fr','creatures.population.tags.village_women') ?></span><span class="population-tag" data-en><?= tr($t,'en','creatures.population.tags.village_women') ?></span>
          <span class="population-tag" data-fr><?= tr($t,'fr','creatures.population.tags.village_men') ?></span><span class="population-tag" data-en><?= tr($t,'en','creatures.population.tags.village_men') ?></span>
          <span class="population-tag" data-fr><?= tr($t,'fr','creatures.population.tags.farmer') ?></span><span class="population-tag" data-en><?= tr($t,'en','creatures.population.tags.farmer') ?></span>
          <span class="population-tag" data-fr><?= tr($t,'fr','creatures.population.tags.blacksmith') ?></span><span class="population-tag" data-en><?= tr($t,'en','creatures.population.tags.blacksmith') ?></span>
          <span class="population-tag" data-fr><?= tr($t,'fr','creatures.population.tags.merchant') ?></span><span class="population-tag" data-en><?= tr($t,'en','creatures.population.tags.merchant') ?></span>
          <span class="population-tag" data-fr><?= tr($t,'fr','creatures.population.tags.innkeeper') ?></span><span class="population-tag" data-en><?= tr($t,'en','creatures.population.tags.innkeeper') ?></span>
          <span class="population-tag" data-fr><?= tr($t,'fr','creatures.population.tags.guard') ?></span><span class="population-tag" data-en><?= tr($t,'en','creatures.population.tags.guard') ?></span>
          <span class="population-tag" data-fr><?= tr($t,'fr','creatures.population.tags.soldier') ?></span><span class="population-tag" data-en><?= tr($t,'en','creatures.population.tags.soldier') ?></span>
          <span class="population-tag" data-fr><?= tr($t,'fr','creatures.population.tags.knight') ?></span><span class="population-tag" data-en><?= tr($t,'en','creatures.population.tags.knight') ?></span>
        </div>
      </div>
      <div class="population-group">
        <div class="population-group-label" data-fr><?= tr($t,'fr','creatures.population.forests_label') ?></div>
        <div class="population-group-label" data-en><?= tr($t,'en','creatures.population.forests_label') ?></div>
        <div class="population-tags">
          <span class="population-tag" data-fr><?= tr($t,'fr','creatures.population.tags.archer') ?></span><span class="population-tag" data-en><?= tr($t,'en','creatures.population.tags.archer') ?></span>
          <span class="population-tag" data-fr><?= tr($t,'fr','creatures.population.tags.warriors') ?></span><span class="population-tag" data-en><?= tr($t,'en','creatures.population.tags.warriors') ?></span>
          <span class="population-tag" data-fr><?= tr($t,'fr','creatures.population.tags.mage') ?></span><span class="population-tag" data-en><?= tr($t,'en','creatures.population.tags.mage') ?></span>
          <span class="population-tag" data-fr><?= tr($t,'fr','creatures.population.tags.monk') ?></span><span class="population-tag" data-en><?= tr($t,'en','creatures.population.tags.monk') ?></span>
          <span class="population-tag" data-fr><?= tr($t,'fr','creatures.population.tags.witch') ?></span><span class="population-tag" data-en><?= tr($t,'en','creatures.population.tags.witch') ?></span>
        </div>
      </div>
      <div class="population-group">
        <div class="population-group-label" data-fr><?= tr($t,'fr','creatures.population.fields_label') ?></div>
        <div class="population-group-label" data-en><?= tr($t,'en','creatures.population.fields_label') ?></div>
        <div class="population-tags">
          <span class="population-tag" data-fr><?= tr($t,'fr','creatures.population.tags.crows') ?></span><span class="population-tag" data-en><?= tr($t,'en','creatures.population.tags.crows') ?></span>
          <span class="population-tag" data-fr><?= tr($t,'fr','creatures.population.tags.windmill') ?></span><span class="population-tag" data-en><?= tr($t,'en','creatures.population.tags.windmill') ?></span>
          <span class="population-tag" data-fr><?= tr($t,'fr','creatures.population.tags.scarecrow') ?></span><span class="population-tag" data-en><?= tr($t,'en','creatures.population.tags.scarecrow') ?></span>
        </div>
      </div>
      <div class="population-group">
        <div class="population-group-label" data-fr><?= tr($t,'fr','creatures.population.water_label') ?></div>
        <div class="population-group-label" data-en><?= tr($t,'en','creatures.population.water_label') ?></div>
        <div class="population-tags">
          <span class="population-tag" data-fr><?= tr($t,'fr','creatures.population.tags.boat') ?></span><span class="population-tag" data-en><?= tr($t,'en','creatures.population.tags.boat') ?></span>
          <span class="population-tag" data-fr><?= tr($t,'fr','creatures.population.tags.rowboats') ?></span><span class="population-tag" data-en><?= tr($t,'en','creatures.population.tags.rowboats') ?></span>
          <span class="population-tag" data-fr><?= tr($t,'fr','creatures.population.tags.seagulls') ?></span><span class="population-tag" data-en><?= tr($t,'en','creatures.population.tags.seagulls') ?></span>
        </div>
      </div>
      <div class="population-group">
        <div class="population-group-label" data-fr><?= tr($t,'fr','creatures.population.meadows_label') ?></div>
        <div class="population-group-label" data-en><?= tr($t,'en','creatures.population.meadows_label') ?></div>
        <div class="population-tags">
          <span class="population-tag" data-fr><?= tr($t,'fr','creatures.population.tags.deer') ?></span><span class="population-tag" data-en><?= tr($t,'en','creatures.population.tags.deer') ?></span>
          <span class="population-tag" data-fr><?= tr($t,'fr','creatures.population.tags.wildflowers') ?></span><span class="population-tag" data-en><?= tr($t,'en','creatures.population.tags.wildflowers') ?></span>
        </div>
      </div>
    </div>
    <p class="population-note" data-fr><?= tr($t,'fr','creatures.note') ?></p>
    <p class="population-note" data-en><?= tr($t,'en','creatures.note') ?></p>
  </div>
</section>

<!-- ═══════════ AUDIO ═══════════ -->
<section id="audio">
  <div class="container">
    <p class="section-label" data-fr><?= tr($t,'fr','audio.label') ?></p>
    <p class="section-label" data-en><?= tr($t,'en','audio.label') ?></p>
    <h2 class="section-title" data-fr><?= tr($t,'fr','audio.title') ?></h2>
    <h2 class="section-title" data-en><?= tr($t,'en','audio.title') ?></h2>
    <p class="section-sub" data-fr><?= tr($t,'fr','audio.sub') ?></p>
    <p class="section-sub" data-en><?= tr($t,'en','audio.sub') ?></p>

    <div class="audio-grid">
      <?php
      $audioCards = [
        ['key' => 'spatial',  'icon' => '🎧'],
        ['key' => 'chimai',   'icon' => '🎻'],
        ['key' => 'adaptive', 'icon' => '🎶'],
        ['key' => 'silence',  'icon' => '🔇'],
      ];
      foreach ($audioCards as $ac): $k = $ac['key']; ?>
      <div class="audio-card">
        <div class="audio-icon"><?= $ac['icon'] ?></div>
        <div>
          <div class="audio-name" data-fr><?= tr($t,'fr',"audio.$k.name") ?></div>
          <div class="audio-name" data-en><?= tr($t,'en',"audio.$k.name") ?></div>
          <div class="audio-desc" data-fr><?= tr($t,'fr',"audio.$k.desc") ?></div>
          <div class="audio-desc" data-en><?= tr($t,'en',"audio.$k.desc") ?></div>
        </div>
      </div>
      <?php endforeach; ?>
    </div>
  </div>
</section>

<!-- ═══════════ JOUR / NUIT ═══════════ -->
<section id="daynnight">
  <div class="container">
    <p class="section-label" data-fr><?= tr($t,'fr','daynnight.label') ?></p>
    <p class="section-label" data-en><?= tr($t,'en','daynnight.label') ?></p>
    <h2 class="section-title" data-fr><?= tr($t,'fr','daynnight.title') ?></h2>
    <h2 class="section-title" data-en><?= tr($t,'en','daynnight.title') ?></h2>
    <p class="section-sub" data-fr><?= tr($t,'fr','daynnight.sub') ?></p>
    <p class="section-sub" data-en><?= tr($t,'en','daynnight.sub') ?></p>

    <div class="daynight-grid">
      <?php
      $dnCards = [
        ['key' => 'day',     'img' => 'images/jour.jpg',     'alt' => 'Mode Jour',     'icon' => '☀️', 'cls' => 'daynight-card day',   'span' => false],
        ['key' => 'night',   'img' => 'images/nuit.jpg',     'alt' => 'Mode Nuit',     'icon' => '🌙', 'cls' => 'daynight-card night', 'span' => false],
        ['key' => 'smoke',   'img' => 'images/fumees.jpg',   'alt' => 'Fumée',         'icon' => '💨', 'cls' => 'daynight-card smoke', 'span' => true],
        ['key' => 'godrays', 'img' => 'images/godrays.jpg',  'alt' => 'God Rays',      'icon' => '🔆', 'cls' => 'daynight-card',       'span' => true],
        ['key' => 'rain',    'img' => 'images/pluie.jpg',    'alt' => 'Pluie',         'icon' => '🌧️', 'cls' => 'daynight-card rain',  'span' => true],
        ['key' => 'mist',    'img' => 'images/brume.jpg',    'alt' => 'Brume matinale','icon' => '🌫️', 'cls' => 'daynight-card mist',  'span' => true],
      ];
      foreach ($dnCards as $dc):
        $k = $dc['key'];
        $style = $dc['span'] ? ' style="grid-column:span 2;"' : '';
        $list  = tr($t,'fr',"daynnight.$k.list");
        $count = is_array($list) ? count($list) : 0;
      ?>
      <div class="<?= $dc['cls'] ?>"<?= $style ?>>
        <img src="<?= $dc['img'] ?>" alt="<?= htmlspecialchars($dc['alt']) ?>" class="daynight-img">
        <div class="daynight-body">
        <div class="daynight-head">
          <div class="daynight-icon"><?= $dc['icon'] ?></div>
          <div class="daynight-name" data-fr><?= tr($t,'fr',"daynnight.$k.name") ?></div>
          <div class="daynight-name" data-en><?= tr($t,'en',"daynnight.$k.name") ?></div>
        </div>
        <ul class="daynight-list">
          <?php for ($i = 0; $i < $count; $i++): ?>
          <li data-fr><?= tr($t,'fr',"daynnight.$k.list.$i") ?></li>
          <li data-en><?= tr($t,'en',"daynnight.$k.list.$i") ?></li>
          <?php endfor; ?>
        </ul>
        </div>
      </div>
      <?php endforeach; ?>
    </div>
  </div>
</section>

<!-- ═══════════ PERSONNALISATION EXTRÊME (EDA) ═══════════ -->
<section id="eda">
  <div class="container">
    <p class="section-label" data-fr><?= tr($t,'fr','eda.label') ?></p>
    <p class="section-label" data-en><?= tr($t,'en','eda.label') ?></p>
    <h2 class="section-title" data-fr><?= tr($t,'fr','eda.title') ?></h2>
    <h2 class="section-title" data-en><?= tr($t,'en','eda.title') ?></h2>
    <p class="section-sub" data-fr><?= tr($t,'fr','eda.sub') ?></p>
    <p class="section-sub" data-en><?= tr($t,'en','eda.sub') ?></p>

    <div class="eda-showcase-grid">
      <?php
      $edaCards = [
        ['key' => 'lut',         'img' => 'images/eda-1.png', 'alt' => 'EDA — onglet LUT'],
        ['key' => 'cinematic',   'img' => 'images/eda-2.png', 'alt' => 'EDA — onglet Cinématique'],
        ['key' => 'environment', 'img' => 'images/eda-3.png', 'alt' => 'EDA — onglet Environnement'],
      ];
      foreach ($edaCards as $ec): $k = $ec['key']; ?>
      <div class="eda-showcase-card">
        <img src="<?= $ec['img'] ?>" alt="<?= htmlspecialchars($ec['alt']) ?>" class="eda-showcase-img">
        <div class="eda-showcase-body">
          <div class="eda-showcase-label" data-fr><?= tr($t,'fr',"eda.$k.label") ?></div>
          <div class="eda-showcase-label" data-en><?= tr($t,'en',"eda.$k.label") ?></div>
          <p class="eda-showcase-desc" data-fr><?= tr($t,'fr',"eda.$k.desc") ?></p>
          <p class="eda-showcase-desc" data-en><?= tr($t,'en',"eda.$k.desc") ?></p>
        </div>
      </div>
      <?php endforeach; ?>
    </div>
  </div>
</section>

<!-- ═══════════ MULTIPLAYER ═══════════ -->
<section id="multi">
  <div class="container">
    <div class="multi-inner">
      <div>
        <h2 class="section-title" data-fr><?= tr($t,'fr','multi.title1') ?></h2>
        <h2 class="section-title" data-fr><?= tr($t,'fr','multi.title2') ?></h2>
        <h2 class="section-title" data-en><?= tr($t,'en','multi.title1') ?></h2>
        <h2 class="section-title" data-en><?= tr($t,'en','multi.title2') ?></h2>
        <p class="section-sub" data-fr><?= tr($t,'fr','multi.sub') ?></p>
        <p class="section-sub" data-en><?= tr($t,'en','multi.sub') ?></p>
        <ul class="multi-feature-list">
          <?php $features = tr($t,'fr','multi.features'); $fCount = is_array($features) ? count($features) : 0; ?>
          <?php for ($i = 0; $i < $fCount; $i++): ?>
          <li data-fr><?= tr($t,'fr',"multi.features.$i") ?></li>
          <li data-en><?= tr($t,'en',"multi.features.$i") ?></li>
          <?php endfor; ?>
        </ul>
        <div style="margin-top:28px;">
          <a href="game.php" class="btn-primary" data-fr><?= tr($t,'fr','multi.btn_create') ?></a>
          <a href="game.php" class="btn-primary" data-en><?= tr($t,'en','multi.btn_create') ?></a>
        </div>
      </div>
      <div class="room-demo">
        <div class="room-demo-title" data-fr><?= tr($t,'fr','multi.room_title') ?></div>
        <div class="room-demo-title" data-en><?= tr($t,'en','multi.room_title') ?></div>
        <div class="room-code">HEXGRP</div>
        <div style="font-size:10px;letter-spacing:0.14em;color:var(--text-dim);text-align:center;margin-top:4px;" data-fr><?= tr($t,'fr','multi.room_status') ?></div>
        <div style="font-size:10px;letter-spacing:0.14em;color:var(--text-dim);text-align:center;margin-top:4px;" data-en><?= tr($t,'en','multi.room_status') ?></div>
        <div class="room-players">
          <div class="player-dot active">🧑</div>
          <div class="player-dot active">👩</div>
          <div class="player-dot active">🧔</div>
          <div class="player-dot">…</div>
        </div>
        <div class="room-scores">
          <div style="font-size:9px;letter-spacing:0.22em;color:var(--text-dim);text-transform:uppercase;margin-bottom:8px;" data-fr><?= tr($t,'fr','multi.tiles_placed_label') ?></div>
          <div style="font-size:9px;letter-spacing:0.22em;color:var(--text-dim);text-transform:uppercase;margin-bottom:8px;" data-en><?= tr($t,'en','multi.tiles_placed_label') ?></div>
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
    <p class="section-label" data-fr><?= tr($t,'fr','scores.label') ?></p>
    <p class="section-label" data-en><?= tr($t,'en','scores.label') ?></p>
    <h2 class="section-title" data-fr><?= tr($t,'fr','scores.title') ?></h2>
    <h2 class="section-title" data-en><?= tr($t,'en','scores.title') ?></h2>

    <?php if (empty($highscores)): ?>
      <div class="hs-empty">
        <div style="font-size:32px;margin-bottom:12px;">🏆</div>
        <div data-fr><?= tr($t,'fr','scores.empty') ?></div>
        <div data-en><?= tr($t,'en','scores.empty') ?></div>
      </div>
    <?php else: ?>
    <div class="hs-list">
      <?php foreach ($highscores as $i => $hs):
        $goldClass = $i === 0 ? 'gold-1' : ($i === 1 ? 'gold-2' : ($i === 2 ? 'gold-3' : ''));
        $dateStr   = fmt_date($hs['date']);
        $biomeIcons = ['forest'=>'🌲','water'=>'💧','house'=>'🛖','field'=>'🌾','grass'=>'🌿','rail'=>'🛤️'];
      ?>
      <div class="hs-card <?= $goldClass ?>">
        <div class="hs-rank-col">
          <div class="hs-rank"><?= $i + 1 ?></div>
        </div>
        <div class="hs-main">
          <div class="hs-name"><?= htmlspecialchars($hs['name']) ?></div>
          <?php if ($dateStr): ?><div class="hs-date"><?= $dateStr ?></div><?php endif; ?>
          <?php if ($hs['tiles'] > 0): ?>
          <div class="hs-headline-stat"><span class="icon">⬡</span><?= number_format($hs['tiles']) ?> <span data-fr><?= tr($t,'fr','scores.headline_stat') ?></span><span data-en><?= tr($t,'en','scores.headline_stat') ?></span></div>
          <?php endif; ?>
          <?php
            // TOUTES les petites stats (lignes/bateaux/comètes + détail biomes) dans
            // UN SEUL flux .hs-meta — pas deux blocs séparés qui se retrouvent sur des
            // lignes différentes. Même style partout (cf. .hs-meta-item en CSS).
            // Mots FR/EN (locomotive(s), bateau(x)/boat(s)…) lus depuis json/languages/*.json.
            $smallStats = '';
            if ($hs['trains'] > 0) {
              $wFr = $hs['trains'] > 1 ? tr($t,'fr','scores.trains_p') : tr($t,'fr','scores.trains_s');
              $wEn = $hs['trains'] > 1 ? tr($t,'en','scores.trains_p') : tr($t,'en','scores.trains_s');
              $smallStats .= '<span class="hs-meta-item"><span class="icon">🚂</span><span class="hs-stat-num">' . $hs['trains'] . '</span>'
                . ' <span data-fr>' . htmlspecialchars($wFr) . '</span>'
                . '<span data-en>' . htmlspecialchars($wEn) . '</span></span>';
            }
            if ($hs['boats'] > 0) {
              $wFr = $hs['boats'] > 1 ? tr($t,'fr','scores.boats_p') : tr($t,'fr','scores.boats_s');
              $wEn = $hs['boats'] > 1 ? tr($t,'en','scores.boats_p') : tr($t,'en','scores.boats_s');
              $smallStats .= '<span class="hs-meta-item"><span class="icon">⛵</span><span class="hs-stat-num">' . $hs['boats'] . '</span>'
                . ' <span data-fr>' . htmlspecialchars($wFr) . '</span>'
                . '<span data-en>' . htmlspecialchars($wEn) . '</span></span>';
            }
            if ($hs['mills'] > 0) {
              $wFr = $hs['mills'] > 1 ? tr($t,'fr','scores.mills_p') : tr($t,'fr','scores.mills_s');
              $wEn = $hs['mills'] > 1 ? tr($t,'en','scores.mills_p') : tr($t,'en','scores.mills_s');
              $smallStats .= '<span class="hs-meta-item"><span class="icon">⚙️</span><span class="hs-stat-num">' . $hs['mills'] . '</span>'
                . ' <span data-fr>' . htmlspecialchars($wFr) . '</span>'
                . '<span data-en>' . htmlspecialchars($wEn) . '</span></span>';
            }
            if ($hs['comets'] > 0) {
              $wFr = $hs['comets'] > 1 ? tr($t,'fr','scores.comets_p') : tr($t,'fr','scores.comets_s');
              $wEn = $hs['comets'] > 1 ? tr($t,'en','scores.comets_p') : tr($t,'en','scores.comets_s');
              $smallStats .= '<span class="hs-meta-item"><span class="icon">☄️</span><span class="hs-stat-num">' . $hs['comets'] . '</span>'
                . ' <span data-fr>' . htmlspecialchars($wFr) . '</span>'
                . '<span data-en>' . htmlspecialchars($wEn) . '</span></span>';
            }
            foreach ($biomeIcons as $bt => $icon) {
              $tot = $hs['totals'][$bt] ?? 0;
              $max = $hs['largest'][$bt] ?? 0;
              if ($tot > 0 || $max > 0) {
                $lFr = $tot == 1 ? tr($t,'fr',"scores.biome_labels.$bt.s") : tr($t,'fr',"scores.biome_labels.$bt.p");
                $lEn = tr($t,'en',"scores.biome_labels.$bt.en");
                $smallStats .= '<span class="hs-meta-item hs-biome-chip">'
                  . '<span class="icon">' . $icon . '</span>'
                  . '<span class="hs-biome-total">' . number_format($tot) . '</span>'
                  . '<span class="hs-biome-label" data-fr>' . htmlspecialchars($lFr) . '</span>'
                  . '<span class="hs-biome-label" data-en>' . htmlspecialchars($lEn) . '</span>'
                  . '<span class="hs-biome-note">'
                    . '<span data-fr>' . htmlspecialchars(tr($t,'fr','scores.largest_zone')) . '</span><span data-en>' . htmlspecialchars(tr($t,'en','scores.largest_zone')) . '</span>'
                    . '&nbsp;: <span class="hs-biome-max">' . $max . '</span>'
                  . '</span>'
                  . '</span>';
              }
            }
            if ($smallStats): ?>
          <div class="hs-meta"><?= $smallStats ?></div>
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
      <a href="game.php" class="btn-primary" data-fr><?= tr($t,'fr','scores.try_luck') ?></a>
      <a href="game.php" class="btn-primary" data-en><?= tr($t,'en','scores.try_luck') ?></a>
    </div>
  </div>
</section>

<!-- ═══════════ FOOTER ═══════════ -->
<footer>
  <div class="container">
    <div class="footer-inner">
      <div class="footer-logo">⬡ HEXISTENZ</div>
      <div class="footer-copy" data-fr><?= tr($t,'fr','footer.copy') ?></div>
          <div class="footer-copy" data-en><?= tr($t,'en','footer.copy') ?></div>
      <div class="footer-links-group">
        <a href="https://krakoukas.com" class="footer-link" target="_blank" rel="noopener">Krakoukas</a>
        <span class="footer-sep">·</span>
        <a href="https://www.wildlabs.fr" class="footer-link" target="_blank" rel="noopener">Wildlabs</a>
        <span class="footer-sep">·</span>
        <a href="https://github.com/Krakoukas73/hexistenz" class="footer-link" target="_blank" rel="noopener" data-fr><?= tr($t,'fr','footer.github') ?></a>
        <a href="https://github.com/Krakoukas73/hexistenz" class="footer-link" target="_blank" rel="noopener" data-en><?= tr($t,'en','footer.github') ?></a>
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

  const navToggle = document.getElementById('navToggle');
  const navLinks  = document.getElementById('navLinks');
  function closeNav() {
    navLinks.classList.remove('open');
    navToggle.classList.remove('open');
    navToggle.setAttribute('aria-expanded', 'false');
  }
  navToggle?.addEventListener('click', () => {
    const isOpen = navLinks.classList.toggle('open');
    navToggle.classList.toggle('open', isOpen);
    navToggle.setAttribute('aria-expanded', String(isOpen));
  });
  navLinks?.addEventListener('click', (e) => {
    if (e.target.tagName === 'A') closeNav();
  });
  window.addEventListener('resize', () => {
    if (window.innerWidth > 900) closeNav();
  });

  // ── Scroll spy : souligne dans la nav la rubrique actuellement visible ──────
  // Réutilise la classe .active déjà stylée en CSS (identique au hover, cf.
  // .nav-links a.active dans presentation.css) — pas de nouveau style à écrire.
  // Chaque rubrique a DEUX <a> (data-fr/data-en, même href) : on active les deux
  // pour rester cohérent quelle que soit la langue affichée.
  (function initScrollSpy() {
    const navEl = document.querySelector('nav');
    const sections = Array.from(document.querySelectorAll('section[id]'))
      .filter(s => document.querySelector(`.nav-links a[href="#${s.id}"]`));
    if (!sections.length) return;

    function setActive(id) {
      document.querySelectorAll('.nav-links a').forEach(a => {
        a.classList.toggle('active', a.getAttribute('href') === `#${id}`);
      });
    }

    // La marge haute correspond à la hauteur de la nav fixed (+1px de marge) : une
    // section n'est considérée "active" qu'une fois passée sous la barre. La marge
    // basse (-65%) réduit la zone d'observation effective à une fine bande sous la
    // nav, pour qu'une seule rubrique soit active à la fois même sur les petites
    // sections proches les unes des autres.
    let observer;
    function build() {
      observer?.disconnect();
      const navH = navEl ? navEl.offsetHeight : 60;
      observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) setActive(entry.target.id);
        });
      }, { rootMargin: `-${navH + 1}px 0px -65% 0px`, threshold: 0 });
      sections.forEach(s => observer.observe(s));
    }
    build();
    window.addEventListener('resize', build);
  })();
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
