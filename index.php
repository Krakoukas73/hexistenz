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

// Refonte i18n scalable du 2026-07-14 (cf. CONTEXT.md §21) : l'ancien mécanisme
// dupliquait CHAQUE texte en autant de paires data-fr/data-en qu'il y avait de
// langues (bascule via CSS [data-lang]), ce qui ne passait pas à l'échelle : ajouter
// une langue demandait de tripler (ou plus) le markup dans tout le fichier. Remplacé
// par UN SEUL attribut data-i18n="chemin.pointé" par élément (PHP rend le repli FR
// par défaut), un JSON contenant TOUTES les langues embarqué dans la page, et un
// petit moteur JS générique (applyI18n/setLang plus bas) qui réécrit tous les
// [data-i18n] à la volée. Ajouter une langue future = une ligne dans $LANG_FILES,
// rien d'autre à toucher (ni le <select>, ni le JS, ni le HTML).
$langDir = __DIR__ . '/json/languages/';
$LANG_FILES = [
    'fr' => 'french',
    'en' => 'english',
    'es' => 'spanish',
    'it' => 'italian',
    'pt' => 'portuguese',
    'fr-CA' => 'fr-CA',
];
$t = [];
foreach ($LANG_FILES as $code => $file) {
    $t[$code] = json_decode(@file_get_contents($langDir . $file . '.json'), true) ?: [];
}
$LANGS = array_keys($LANG_FILES);

// Accesseur sûr côté PHP : tr($t,'fr','hero.tagline') — évite les notices sur clé
// manquante. Sert uniquement à rendre le repli FR ; la traduction réactive passe
// par le JSON embarqué + le moteur JS (cf. <script id="i18n-data"> plus bas).
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
  <script id="i18n-data" type="application/json"><?= json_encode($t, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG) ?></script>
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
    <li><a href="#factions"  data-i18n="nav.links.factions"><?= tr($t,'fr','nav.links.factions') ?></a></li>
    <li><a href="#biomes"    data-i18n="nav.links.biomes"><?= tr($t,'fr','nav.links.biomes') ?></a></li>
    <li><a href="#missions"  data-i18n="nav.links.missions"><?= tr($t,'fr','nav.links.missions') ?></a></li>
    <li><a href="#gameplay"  data-i18n="nav.links.gameplay"><?= tr($t,'fr','nav.links.gameplay') ?></a></li>
    <li><a href="#gallery"   data-i18n="nav.links.gallery"><?= tr($t,'fr','nav.links.gallery') ?></a></li>
    <li><a href="#creatures" data-i18n="nav.links.creatures"><?= tr($t,'fr','nav.links.creatures') ?></a></li>
    <li><a href="#audio"     data-i18n="nav.links.audio"><?= tr($t,'fr','nav.links.audio') ?></a></li>
    <li><a href="#daynnight" data-i18n="nav.links.daynnight"><?= tr($t,'fr','nav.links.daynnight') ?></a></li>
    <li><a href="#eda"       data-i18n="nav.links.eda"><?= tr($t,'fr','nav.links.eda') ?></a></li>
    <li><a href="#multi"     data-i18n="nav.links.multi"><?= tr($t,'fr','nav.links.multi') ?></a></li>
    <li><a href="#scores"    data-i18n="nav.links.scores"><?= tr($t,'fr','nav.links.scores') ?></a></li>
  </ul>
  <div id="lang-toggle">
    <select id="langSelect" onchange="setLang(this.value)">
<?php foreach ($LANGS as $code): ?>
      <option value="<?= $code ?>"><?= strtoupper($code) ?></option>
<?php endforeach; ?>
    </select>
  </div>
  <a href="game.php" class="nav-cta" data-i18n="nav.play"><?= tr($t,'fr','nav.play') ?></a>
</nav>

<!-- ═══════════ HERO ═══════════ -->
<section id="hero">
  <div class="hero-banner" aria-hidden="true"></div>
  <div class="hero-content">
  <div class="container">
    <div class="hero-inner">
      <div class="hero-text">
        <h1 class="hero-title">⬡ HEXISTENZ</h1>
        <p class="hero-subtitle" data-i18n="hero.subtitle"><?= tr($t,'fr','hero.subtitle') ?></p>

        <p class="hero-inspi" data-i18n="hero.inspi_text"><?= tr($t,'fr','hero.inspi_text') ?></p>

        <div class="hero-inspi-grid">
          <div class="hero-inspi-col">
            <div class="hero-inspi-card">
              <img src="./images/dorfromantik.jpg" alt="Dorfromantik" class="hero-inspi-img" loading="lazy">
              <div class="hero-inspi-caption">
                <div class="hero-inspi-name">Dorfromantik</div>
              </div>
            </div>
            <a class="hero-inspi-buy" href="https://store.steampowered.com/app/1455840/Dorfromantik/" target="_blank" rel="noopener">🎮 <span data-i18n="hero.inspi_buy.dorfromantik"><?= tr($t,'fr','hero.inspi_buy.dorfromantik') ?></span></a>
          </div>
          <div class="hero-inspi-col">
            <div class="hero-inspi-card">
              <img src="./images/settlers.jpg" alt="The Settlers" class="hero-inspi-img" loading="lazy">
              <div class="hero-inspi-caption">
                <div class="hero-inspi-name">The Settlers</div>
              </div>
            </div>
            <a class="hero-inspi-buy" href="https://www.ubisoft.com/en-gb/games/the-settlers-history-edition" target="_blank" rel="noopener">🎮 <span data-i18n="hero.inspi_buy.settlers"><?= tr($t,'fr','hero.inspi_buy.settlers') ?></span></a>
          </div>
          <div class="hero-inspi-col">
            <div class="hero-inspi-card">
              <img src="./images/heroes.jpg" alt="Heroes of Might and Magic" class="hero-inspi-img" loading="lazy">
              <div class="hero-inspi-caption">
                <div class="hero-inspi-name">Heroes of Might &amp; Magic</div>
              </div>
            </div>
            <a class="hero-inspi-buy" href="https://www.gog.com/en/game/heroes_of_might_and_magic_3_complete_edition" target="_blank" rel="noopener">🎮 <span data-i18n="hero.inspi_buy.heroes3"><?= tr($t,'fr','hero.inspi_buy.heroes3') ?></span></a>
          </div>
        </div>

        <p class="hero-tagline" data-i18n="hero.tagline"><?= tr($t,'fr','hero.tagline') ?></p>
        <div class="hero-buttons">
          <a href="game.php" class="btn-primary" data-i18n="hero.btn_play"><?= tr($t,'fr','hero.btn_play') ?></a>
          <a href="#gameplay" class="btn-secondary" data-i18n="hero.btn_how"><?= tr($t,'fr','hero.btn_how') ?></a>
        </div>
        <div class="stats-bar">
          <div class="stat-item"><div class="stat-num">6</div><div class="stat-label" data-i18n="hero.stats.biomes_label"><?= tr($t,'fr','hero.stats.biomes_label') ?></div></div>
          <div class="stat-item"><div class="stat-num">∞</div><div class="stat-label" data-i18n="hero.stats.games_label"><?= tr($t,'fr','hero.stats.games_label') ?></div></div>
          <div class="stat-item"><div class="stat-num">2</div><div class="stat-label" data-i18n="hero.stats.factions_label"><?= tr($t,'fr','hero.stats.factions_label') ?></div></div>
        </div>
      </div>

    </div>
  </div>
  </div><!-- /.hero-content -->
</section>

<!-- ═══════════ FACTIONS ═══════════ -->
<section id="factions">
  <div class="container">
    <p class="section-label" data-i18n="factions.label"><?= tr($t,'fr','factions.label') ?></p>
    <h2 class="section-title" data-i18n="factions.title1"><?= tr($t,'fr','factions.title1') ?></h2>
    <h2 class="section-title" data-i18n="factions.title2"><?= tr($t,'fr','factions.title2') ?></h2>
    <p class="section-sub" data-i18n="factions.sub"><?= tr($t,'fr','factions.sub') ?></p>

    <div class="factions-grid">
      <div class="faction-card platiste">
        <div class="faction-img" style="display:block;padding:0;">
          <img src="images/platiste.jpg" alt="Mode Platiste" style="width:100%;height:100%;object-fit:cover;display:block;">
        </div>
        <div class="faction-body">
          <span class="faction-tag" data-i18n="factions.flat.tag"><?= tr($t,'fr','factions.flat.tag') ?></span>
          <div class="faction-name" data-i18n="factions.flat.name"><?= tr($t,'fr','factions.flat.name') ?></div>
          <p class="faction-desc" data-i18n="factions.flat.desc"><?= tr($t,'fr','factions.flat.desc') ?></p>
        </div>
      </div>

      <div class="faction-card bouliste">
        <div class="faction-img" style="display:block;padding:0;">
          <img src="images/bouliste-transparent.png" alt="Mode Bouliste" style="width:100%;height:100%;object-fit:cover;display:block;">
        </div>
        <div class="faction-body">
          <span class="faction-tag" data-i18n="factions.globe.tag"><?= tr($t,'fr','factions.globe.tag') ?></span>
          <div class="faction-name" data-i18n="factions.globe.name"><?= tr($t,'fr','factions.globe.name') ?></div>
          <p class="faction-desc" data-i18n="factions.globe.desc"><?= tr($t,'fr','factions.globe.desc') ?></p>
        </div>
      </div>
    </div>

    <div class="faction-vs" data-i18n="factions.vs"><?= tr($t,'fr','factions.vs') ?></div>
  </div>
</section>

<!-- ═══════════ BIOMES ═══════════ -->
<section id="biomes">
  <div class="container">
    <p class="section-label" data-i18n="biomes.label"><?= tr($t,'fr','biomes.label') ?></p>
    <h2 class="section-title" data-i18n="biomes.title"><?= tr($t,'fr','biomes.title') ?></h2>
    <p class="section-sub" data-i18n="biomes.sub"><?= tr($t,'fr','biomes.sub') ?></p>

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
            <div class="biome-name" data-i18n="biomes.<?= $k ?>.name"><?= tr($t,'fr',"biomes.$k.name") ?></div>
          </div>
        </div>
        <div class="biome-body">
          <div class="biome-desc" data-i18n="biomes.<?= $k ?>.desc"><?= tr($t,'fr',"biomes.$k.desc") ?></div>
          <span class="biome-tag" data-i18n="biomes.<?= $k ?>.tag"><?= tr($t,'fr',"biomes.$k.tag") ?></span>
        </div>
      </div>
      <?php endforeach; ?>
    </div>
  </div>
</section>

<!-- ═══════════ MISSIONS ═══════════ -->
<section id="missions">
  <div class="container">
    <p class="section-label" data-i18n="missions.label"><?= tr($t,'fr','missions.label') ?></p>
    <h2 class="section-title" data-i18n="missions.title"><?= tr($t,'fr','missions.title') ?></h2>
    <p class="section-sub" data-i18n="missions.sub"><?= tr($t,'fr','missions.sub') ?></p>

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
          <div class="mission-name" data-i18n="missions.<?= $k ?>.name"><?= tr($t,'fr',"missions.$k.name") ?></div>
          <div class="mission-desc" data-i18n="missions.<?= $k ?>.desc"><?= tr($t,'fr',"missions.$k.desc") ?></div>
        </div>
      </div>
      <?php endforeach; ?>
    </div>
  </div>
</section>

<!-- ═══════════ GAMEPLAY ═══════════ -->
<section id="gameplay">
  <div class="container">
    <p class="section-label" data-i18n="gameplay.label"><?= tr($t,'fr','gameplay.label') ?></p>
    <h2 class="section-title" data-i18n="gameplay.title"><?= tr($t,'fr','gameplay.title') ?></h2>
    <p class="section-sub" data-i18n="gameplay.sub"><?= tr($t,'fr','gameplay.sub') ?></p>

    <div class="gameplay-ui-preview">
      <img src="./images/tuiles.png" alt="Interface tuiles — tuile courante, suivante et restantes" loading="lazy">
      <p class="gameplay-ui-caption" data-i18n="gameplay.ui_caption"><?= tr($t,'fr','gameplay.ui_caption') ?></p>
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
        <div class="step-title" data-i18n="gameplay.steps.<?= $k ?>.title"><?= tr($t,'fr',"gameplay.steps.$k.title") ?></div>
        <div class="step-desc" data-i18n="gameplay.steps.<?= $k ?>.desc"><?= tr($t,'fr',"gameplay.steps.$k.desc") ?></div>
      </div>
      <?php endforeach; ?>
    </div>

    <div style="margin-top:52px;">
      <p class="section-label" data-i18n="gameplay.score_label"><?= tr($t,'fr','gameplay.score_label') ?></p>
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
        <div class="score-pill"><div class="score-pill-pts"><?= $pc['pts'] ?></div><div class="score-pill-label" data-i18n="gameplay.pills.<?= $k ?>"><?= tr($t,'fr',"gameplay.pills.$k") ?></div></div>
        <?php endforeach; ?>
      </div>
    </div>

    <h2 class="section-title" style="margin-top:40px;padding-top:26px;border-top:1px solid var(--border);" data-i18n="gameplay.kbd_title"><?= tr($t,'fr','gameplay.kbd_title') ?></h2>

    <div class="kbd-strip">
      <div class="kbd-strip-item"><span class="kbd-group kbd-group--stacked"><span class="kbd-row"><kbd>Z</kbd><kbd>Q</kbd><kbd>S</kbd><kbd>D</kbd></span><span class="kbd-row"><kbd>↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd></span></span><span data-i18n="gameplay.kbd.camera_label"><?= tr($t,'fr','gameplay.kbd.camera_label') ?></span></div>
      <div class="kbd-strip-item"><kbd data-i18n="gameplay.kbd.left_click_kbd"><?= tr($t,'fr','gameplay.kbd.left_click_kbd') ?></kbd><span data-i18n="gameplay.kbd.left_click_desc"><?= tr($t,'fr','gameplay.kbd.left_click_desc') ?></span></div>
      <div class="kbd-strip-item"><kbd data-i18n="gameplay.kbd.right_click_kbd"><?= tr($t,'fr','gameplay.kbd.right_click_kbd') ?></kbd><span data-i18n="gameplay.kbd.right_click_desc"><?= tr($t,'fr','gameplay.kbd.right_click_desc') ?></span></div>
      <div class="kbd-strip-item"><kbd data-i18n="gameplay.kbd.wheel_kbd"><?= tr($t,'fr','gameplay.kbd.wheel_kbd') ?></kbd><span data-i18n="gameplay.kbd.wheel_desc"><?= tr($t,'fr','gameplay.kbd.wheel_desc') ?></span></div>
      <div class="kbd-strip-item"><kbd>R</kbd><span data-i18n="gameplay.kbd.reset_cam"><?= tr($t,'fr','gameplay.kbd.reset_cam') ?></span></div>
      <div class="kbd-strip-item"><kbd>+</kbd><kbd>-</kbd><span data-i18n="gameplay.kbd.zoom"><?= tr($t,'fr','gameplay.kbd.zoom') ?></span></div>
      <div class="kbd-strip-item"><kbd>Ctrl</kbd><kbd>Z</kbd><span data-i18n="gameplay.kbd.undo"><?= tr($t,'fr','gameplay.kbd.undo') ?></span></div>
      <div class="kbd-strip-item"><kbd data-i18n="gameplay.kbd.shift_kbd"><?= tr($t,'fr','gameplay.kbd.shift_kbd') ?></kbd><span data-i18n="gameplay.kbd.speed_up"><?= tr($t,'fr','gameplay.kbd.speed_up') ?></span></div>
      <div class="kbd-strip-item"><kbd>E</kbd><span data-i18n="gameplay.kbd.customization"><?= tr($t,'fr','gameplay.kbd.customization') ?></span></div>
      <div class="kbd-strip-item"><kbd>F</kbd><span data-i18n="gameplay.kbd.perf_hud"><?= tr($t,'fr','gameplay.kbd.perf_hud') ?></span></div>
      <div class="kbd-strip-item"><kbd>C</kbd><span data-i18n="gameplay.kbd.snapshot"><?= tr($t,'fr','gameplay.kbd.snapshot') ?></span></div>
      <div class="kbd-strip-item"><kbd>G</kbd><span data-i18n="gameplay.kbd.gallery"><?= tr($t,'fr','gameplay.kbd.gallery') ?></span></div>
      <div class="kbd-strip-item"><kbd data-i18n="gameplay.kbd.space_kbd"><?= tr($t,'fr','gameplay.kbd.space_kbd') ?></kbd><span data-i18n="gameplay.kbd.immersive"><?= tr($t,'fr','gameplay.kbd.immersive') ?></span></div>
      <div class="kbd-strip-item"><kbd data-i18n="gameplay.kbd.shift_kbd"><?= tr($t,'fr','gameplay.kbd.shift_kbd') ?></kbd><kbd data-i18n="gameplay.kbd.space_kbd"><?= tr($t,'fr','gameplay.kbd.space_kbd') ?></kbd><span data-i18n="gameplay.kbd.super_immersive"><?= tr($t,'fr','gameplay.kbd.super_immersive') ?></span></div>
      <div class="kbd-strip-item"><kbd>M</kbd><span data-i18n="gameplay.kbd.mute"><?= tr($t,'fr','gameplay.kbd.mute') ?></span></div>
      <div class="kbd-strip-item"><kbd>H</kbd><kbd>ESC</kbd><span data-i18n="gameplay.kbd.help"><?= tr($t,'fr','gameplay.kbd.help') ?></span></div>
    </div>
  </div>
</section>

<!-- ═══════════ GALLERY ═══════════ -->
<section id="gallery">
  <div class="container">
    <p class="section-label" data-i18n="gallery.label"><?= tr($t,'fr','gallery.label') ?></p>
    <h2 class="section-title" data-i18n="gallery.title1"><?= tr($t,'fr','gallery.title1') ?></h2>
    <h2 class="section-title" data-i18n="gallery.title2"><?= tr($t,'fr','gallery.title2') ?></h2>
    <p class="section-sub" data-i18n="gallery.sub"><?= tr($t,'fr','gallery.sub') ?></p>

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
        <div class="gallery-overlay"><div class="gallery-label"><span data-i18n="gallery.preset_word"><?= tr($t,'fr','gallery.preset_word') ?></span> <span data-i18n="gallery.presets.<?= $k ?>"><?= tr($t,'fr',"gallery.presets.$k") ?></span></div></div>
      </div>
      <?php endforeach; ?>
    </div>
  </div>
</section>

<!-- ═══════════ CREATURES ═══════════ -->
<section id="creatures">
  <div class="container">
    <p class="section-label" data-i18n="creatures.label"><?= tr($t,'fr','creatures.label') ?></p>
    <h2 class="section-title" data-i18n="creatures.title"><?= tr($t,'fr','creatures.title') ?></h2>
    <p class="section-sub" data-i18n="creatures.sub"><?= tr($t,'fr','creatures.sub') ?></p>

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
            <div class="creature-name" data-i18n="creatures.<?= $k ?>.name"><?= tr($t,'fr',"creatures.$k.name") ?></div>
          </div>
        </div>
        <div class="creature-body">
          <div class="creature-desc" data-i18n="creatures.<?= $k ?>.desc"><?= tr($t,'fr',"creatures.$k.desc") ?></div>
        </div>
      </div>
      <?php endforeach; ?>
    </div>

    <div class="population-strip">
      <div class="population-group">
        <div class="population-group-label" data-i18n="creatures.population.villages_label"><?= tr($t,'fr','creatures.population.villages_label') ?></div>
        <div class="population-tags">
          <span class="population-tag" data-i18n="creatures.population.tags.village_women"><?= tr($t,'fr','creatures.population.tags.village_women') ?></span>
          <span class="population-tag" data-i18n="creatures.population.tags.village_men"><?= tr($t,'fr','creatures.population.tags.village_men') ?></span>
          <span class="population-tag" data-i18n="creatures.population.tags.farmer"><?= tr($t,'fr','creatures.population.tags.farmer') ?></span>
          <span class="population-tag" data-i18n="creatures.population.tags.blacksmith"><?= tr($t,'fr','creatures.population.tags.blacksmith') ?></span>
          <span class="population-tag" data-i18n="creatures.population.tags.merchant"><?= tr($t,'fr','creatures.population.tags.merchant') ?></span>
          <span class="population-tag" data-i18n="creatures.population.tags.innkeeper"><?= tr($t,'fr','creatures.population.tags.innkeeper') ?></span>
          <span class="population-tag" data-i18n="creatures.population.tags.guard"><?= tr($t,'fr','creatures.population.tags.guard') ?></span>
          <span class="population-tag" data-i18n="creatures.population.tags.soldier"><?= tr($t,'fr','creatures.population.tags.soldier') ?></span>
          <span class="population-tag" data-i18n="creatures.population.tags.knight"><?= tr($t,'fr','creatures.population.tags.knight') ?></span>
        </div>
      </div>
      <div class="population-group">
        <div class="population-group-label" data-i18n="creatures.population.forests_label"><?= tr($t,'fr','creatures.population.forests_label') ?></div>
        <div class="population-tags">
          <span class="population-tag" data-i18n="creatures.population.tags.archer"><?= tr($t,'fr','creatures.population.tags.archer') ?></span>
          <span class="population-tag" data-i18n="creatures.population.tags.warriors"><?= tr($t,'fr','creatures.population.tags.warriors') ?></span>
          <span class="population-tag" data-i18n="creatures.population.tags.mage"><?= tr($t,'fr','creatures.population.tags.mage') ?></span>
          <span class="population-tag" data-i18n="creatures.population.tags.monk"><?= tr($t,'fr','creatures.population.tags.monk') ?></span>
          <span class="population-tag" data-i18n="creatures.population.tags.witch"><?= tr($t,'fr','creatures.population.tags.witch') ?></span>
        </div>
      </div>
      <div class="population-group">
        <div class="population-group-label" data-i18n="creatures.population.fields_label"><?= tr($t,'fr','creatures.population.fields_label') ?></div>
        <div class="population-tags">
          <span class="population-tag" data-i18n="creatures.population.tags.crows"><?= tr($t,'fr','creatures.population.tags.crows') ?></span>
          <span class="population-tag" data-i18n="creatures.population.tags.windmill"><?= tr($t,'fr','creatures.population.tags.windmill') ?></span>
          <span class="population-tag" data-i18n="creatures.population.tags.scarecrow"><?= tr($t,'fr','creatures.population.tags.scarecrow') ?></span>
        </div>
      </div>
      <div class="population-group">
        <div class="population-group-label" data-i18n="creatures.population.water_label"><?= tr($t,'fr','creatures.population.water_label') ?></div>
        <div class="population-tags">
          <span class="population-tag" data-i18n="creatures.population.tags.boat"><?= tr($t,'fr','creatures.population.tags.boat') ?></span>
          <span class="population-tag" data-i18n="creatures.population.tags.rowboats"><?= tr($t,'fr','creatures.population.tags.rowboats') ?></span>
          <span class="population-tag" data-i18n="creatures.population.tags.seagulls"><?= tr($t,'fr','creatures.population.tags.seagulls') ?></span>
        </div>
      </div>
      <div class="population-group">
        <div class="population-group-label" data-i18n="creatures.population.meadows_label"><?= tr($t,'fr','creatures.population.meadows_label') ?></div>
        <div class="population-tags">
          <span class="population-tag" data-i18n="creatures.population.tags.deer"><?= tr($t,'fr','creatures.population.tags.deer') ?></span>
          <span class="population-tag" data-i18n="creatures.population.tags.wildflowers"><?= tr($t,'fr','creatures.population.tags.wildflowers') ?></span>
        </div>
      </div>
    </div>
    <p class="population-note" data-i18n="creatures.note"><?= tr($t,'fr','creatures.note') ?></p>
  </div>
</section>

<!-- ═══════════ AUDIO ═══════════ -->
<section id="audio">
  <div class="container">
    <p class="section-label" data-i18n="audio.label"><?= tr($t,'fr','audio.label') ?></p>
    <h2 class="section-title" data-i18n="audio.title"><?= tr($t,'fr','audio.title') ?></h2>
    <p class="section-sub" data-i18n="audio.sub"><?= tr($t,'fr','audio.sub') ?></p>

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
          <div class="audio-name" data-i18n="audio.<?= $k ?>.name"><?= tr($t,'fr',"audio.$k.name") ?></div>
          <div class="audio-desc" data-i18n="audio.<?= $k ?>.desc"><?= tr($t,'fr',"audio.$k.desc") ?></div>
        </div>
      </div>
      <?php endforeach; ?>
    </div>
  </div>
</section>

<!-- ═══════════ JOUR / NUIT ═══════════ -->
<section id="daynnight">
  <div class="container">
    <p class="section-label" data-i18n="daynnight.label"><?= tr($t,'fr','daynnight.label') ?></p>
    <h2 class="section-title" data-i18n="daynnight.title"><?= tr($t,'fr','daynnight.title') ?></h2>
    <p class="section-sub" data-i18n="daynnight.sub"><?= tr($t,'fr','daynnight.sub') ?></p>

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
          <div class="daynight-name" data-i18n="daynnight.<?= $k ?>.name"><?= tr($t,'fr',"daynnight.$k.name") ?></div>
        </div>
        <ul class="daynight-list">
          <?php for ($i = 0; $i < $count; $i++): ?>
          <li data-i18n="daynnight.<?= $k ?>.list.<?= $i ?>"><?= tr($t,'fr',"daynnight.$k.list.$i") ?></li>
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
    <p class="section-label" data-i18n="eda.label"><?= tr($t,'fr','eda.label') ?></p>
    <h2 class="section-title" data-i18n="eda.title"><?= tr($t,'fr','eda.title') ?></h2>
    <p class="section-sub" data-i18n="eda.sub"><?= tr($t,'fr','eda.sub') ?></p>

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
          <div class="eda-showcase-label" data-i18n="eda.<?= $k ?>.label"><?= tr($t,'fr',"eda.$k.label") ?></div>
          <p class="eda-showcase-desc" data-i18n="eda.<?= $k ?>.desc"><?= tr($t,'fr',"eda.$k.desc") ?></p>
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
        <h2 class="section-title" data-i18n="multi.title1"><?= tr($t,'fr','multi.title1') ?></h2>
        <h2 class="section-title" data-i18n="multi.title2"><?= tr($t,'fr','multi.title2') ?></h2>
        <p class="section-sub" data-i18n="multi.sub"><?= tr($t,'fr','multi.sub') ?></p>
        <ul class="multi-feature-list">
          <?php $features = tr($t,'fr','multi.features'); $fCount = is_array($features) ? count($features) : 0; ?>
          <?php for ($i = 0; $i < $fCount; $i++): ?>
          <li data-i18n="multi.features.<?= $i ?>"><?= tr($t,'fr',"multi.features.$i") ?></li>
          <?php endfor; ?>
        </ul>
        <h2 class="section-title" style="margin-top:32px;" data-i18n="multi.gallery_title"><?= tr($t,'fr','multi.gallery_title') ?></h2>
        <p class="section-sub" data-i18n="multi.gallery_promo"><?= tr($t,'fr','multi.gallery_promo') ?></p>
        <div style="margin-top:28px;">
          <a href="game.php" class="btn-primary" data-i18n="multi.btn_create"><?= tr($t,'fr','multi.btn_create') ?></a>
        </div>
      </div>
      <div class="room-demo">
        <div class="room-demo-title" data-i18n="multi.room_title"><?= tr($t,'fr','multi.room_title') ?></div>
        <div class="room-code">HEXGRP</div>
        <div style="font-size:10px;letter-spacing:0.14em;color:var(--text-dim);text-align:center;margin-top:4px;" data-i18n="multi.room_status"><?= tr($t,'fr','multi.room_status') ?></div>
        <div class="room-players">
          <div class="player-dot active">🧑</div>
          <div class="player-dot active">👩</div>
          <div class="player-dot active">🧔</div>
          <div class="player-dot">…</div>
        </div>
        <div class="room-scores">
          <div style="font-size:9px;letter-spacing:0.22em;color:var(--text-dim);text-transform:uppercase;margin-bottom:8px;" data-i18n="multi.tiles_placed_label"><?= tr($t,'fr','multi.tiles_placed_label') ?></div>
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
    <p class="section-label" data-i18n="scores.label"><?= tr($t,'fr','scores.label') ?></p>
    <h2 class="section-title" data-i18n="scores.title"><?= tr($t,'fr','scores.title') ?></h2>

    <?php if (empty($highscores)): ?>
      <div class="hs-empty">
        <div style="font-size:32px;margin-bottom:12px;">🏆</div>
        <div data-i18n="scores.empty"><?= tr($t,'fr','scores.empty') ?></div>
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
          <div class="hs-headline-stat"><span class="icon">⬡</span><?= number_format($hs['tiles']) ?> <span data-i18n="scores.headline_stat"><?= tr($t,'fr','scores.headline_stat') ?></span></div>
          <?php endif; ?>
          <?php
            // TOUTES les petites stats (lignes/bateaux/comètes + détail biomes) dans
            // UN SEUL flux .hs-meta — pas de blocs séparés qui se retrouvent sur des
            // lignes différentes. Même style partout (cf. .hs-meta-item en CSS).
            // Un seul data-i18n par mot (singulier/pluriel choisi ici, uniforme sur
            // les 3 langues depuis la refonte du 2026-07-14 : toutes ont .s/.p).
            $smallStats = '';
            if ($hs['trains'] > 0) {
              $key = $hs['trains'] > 1 ? 'scores.trains_p' : 'scores.trains_s';
              $smallStats .= '<span class="hs-meta-item"><span class="icon">🚂</span><span class="hs-stat-num">' . $hs['trains'] . '</span>'
                . ' <span data-i18n="' . $key . '">' . htmlspecialchars(tr($t,'fr',$key)) . '</span></span>';
            }
            if ($hs['boats'] > 0) {
              $key = $hs['boats'] > 1 ? 'scores.boats_p' : 'scores.boats_s';
              $smallStats .= '<span class="hs-meta-item"><span class="icon">⛵</span><span class="hs-stat-num">' . $hs['boats'] . '</span>'
                . ' <span data-i18n="' . $key . '">' . htmlspecialchars(tr($t,'fr',$key)) . '</span></span>';
            }
            if ($hs['mills'] > 0) {
              $key = $hs['mills'] > 1 ? 'scores.mills_p' : 'scores.mills_s';
              $smallStats .= '<span class="hs-meta-item"><span class="icon">⚙️</span><span class="hs-stat-num">' . $hs['mills'] . '</span>'
                . ' <span data-i18n="' . $key . '">' . htmlspecialchars(tr($t,'fr',$key)) . '</span></span>';
            }
            if ($hs['comets'] > 0) {
              $key = $hs['comets'] > 1 ? 'scores.comets_p' : 'scores.comets_s';
              $smallStats .= '<span class="hs-meta-item"><span class="icon">☄️</span><span class="hs-stat-num">' . $hs['comets'] . '</span>'
                . ' <span data-i18n="' . $key . '">' . htmlspecialchars(tr($t,'fr',$key)) . '</span></span>';
            }
            foreach ($biomeIcons as $bt => $icon) {
              $tot = $hs['totals'][$bt] ?? 0;
              $max = $hs['largest'][$bt] ?? 0;
              if ($tot > 0 || $max > 0) {
                $key = ($tot == 1) ? "scores.biome_labels.$bt.s" : "scores.biome_labels.$bt.p";
                $smallStats .= '<span class="hs-meta-item hs-biome-chip">'
                  . '<span class="icon">' . $icon . '</span>'
                  . '<span class="hs-biome-total">' . number_format($tot) . '</span>'
                  . '<span class="hs-biome-label" data-i18n="' . $key . '">' . htmlspecialchars(tr($t,'fr',$key)) . '</span>'
                  . '<span class="hs-biome-note">'
                    . '<span data-i18n="scores.largest_zone">' . htmlspecialchars(tr($t,'fr','scores.largest_zone')) . '</span>'
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
      <a href="game.php" class="btn-primary" data-i18n="scores.try_luck"><?= tr($t,'fr','scores.try_luck') ?></a>
    </div>
  </div>
</section>

<!-- ═══════════ FOOTER ═══════════ -->
<footer>
  <div class="container">
    <div class="footer-inner">
      <div class="footer-logo">⬡ HEXISTENZ</div>
      <div class="footer-copy" data-i18n="footer.copy"><?= tr($t,'fr','footer.copy') ?></div>
      <div class="footer-links-group">
        <a href="https://krakoukas.com" class="footer-link" target="_blank" rel="noopener">Krakoukas</a>
        <span class="footer-sep">·</span>
        <a href="https://www.wildlabs.fr" class="footer-link" target="_blank" rel="noopener">Wildlabs</a>
        <span class="footer-sep">·</span>
        <a href="https://github.com/Krakoukas73/hexistenz" class="footer-link" target="_blank" rel="noopener" data-i18n="footer.github"><?= tr($t,'fr','footer.github') ?></a>
      </div>
    </div>
  </div>
  <div class="footer-screenshot">
    <img src="./images/nuit-transparent.png" alt="" aria-hidden="true">
  </div>
</footer>

<script>
  // ─── Moteur i18n générique (refonte du 2026-07-14) ─────────────────────────
  // Remplace l'ancien setLang() qui ne faisait que toggle 2 classes + une bascule
  // CSS [data-lang] sur un markup dupliqué. Ici tout le JSON (toutes les langues)
  // est déjà dans la page (cf. <script id="i18n-data"> dans le <head>) ; changer
  // de langue = relire ce JSON et réécrire le texte de chaque [data-i18n].
  const I18N = JSON.parse(document.getElementById('i18n-data').textContent);
  const LANGS = Object.keys(I18N);

  function resolveI18n(lang, path) {
    return path.split('.').reduce((node, key) => (node && typeof node === 'object') ? node[key] : undefined, I18N[lang]);
  }

  function applyI18n(lang) {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const path = el.getAttribute('data-i18n');
      const value = resolveI18n(lang, path) ?? resolveI18n('fr', path);
      if (value != null) el.innerHTML = value;
    });
  }

  function setLang(l) {
    if (!LANGS.includes(l)) l = 'fr';
    document.documentElement.lang = l;
    document.documentElement.dataset.lang = l;
    localStorage.setItem('hexistenz_pres_lang', l);
    const sel = document.getElementById('langSelect');
    if (sel) sel.value = l;
    applyI18n(l);
  }

  const saved = localStorage.getItem('hexistenz_pres_lang');
  setLang(LANGS.includes(saved) ? saved : 'fr');

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
  // Simplifié le 2026-07-14 : un seul <a> par rubrique désormais (au lieu de la
  // paire data-fr/data-en), plus besoin d'activer 2 éléments par section.
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
