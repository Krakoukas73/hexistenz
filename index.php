<?php
// Version — extraite de variables.js
$version = '';
$varsFile = __DIR__ . '/javascript/variables.js';
// 2026-07-29 — date de dernière modification de variables.js, affichée à côté
// (hors) de la pastille de version, en italique, dans la langue en cours. La
// pastille garde SA géométrie/pastille propre ; cette date est un span frère,
// simple texte. Rendu PHP initial en français (même convention que tout le
// reste du fichier, cf. tr($t,'fr',...) partout ailleurs) — reformatée côté
// JS via Intl.DateTimeFormat dans setLang() ci-dessous dès que la langue
// préférée diffère du français (même pattern que applyI18n pour le texte).
$versionDate = '';
$varsMtime = null;
// 2026-07-31 — seuil/exposant de la minoration d'efficacité (rubrique Classement,
// cf. bloc $highscores plus bas) : valeurs par défaut ici, écrasées par la lecture
// regex de variables.js juste après si le fichier est trouvable — même mécanisme
// que $version ci-dessus. Garder ces défauts synchronisés avec variables.js.
$efficiencyMinTiles = 20;
$efficiencyMinTilesExponent = 2;
if (file_exists($varsFile)) {
    $js = file_get_contents($varsFile);
    if (preg_match("/HEXISTENZ_VERSION\s*=\s*'([^']+)'/", $js, $m)) {
        $version = $m[1];
    }
    if (preg_match('/EFFICIENCY_MIN_TILES\s*=\s*(\d+)/', $js, $m)) {
        $efficiencyMinTiles = (int)$m[1];
    }
    if (preg_match('/EFFICIENCY_MIN_TILES_EXPONENT\s*=\s*(\d+)/', $js, $m)) {
        $efficiencyMinTilesExponent = (int)$m[1];
    }
    $varsMtime = filemtime($varsFile);
    $frMonths = [1 => 'janvier', 2 => 'février', 3 => 'mars', 4 => 'avril', 5 => 'mai', 6 => 'juin',
                 7 => 'juillet', 8 => 'août', 9 => 'septembre', 10 => 'octobre', 11 => 'novembre', 12 => 'décembre'];
    $versionDate = (int)date('j', $varsMtime) . ' ' . $frMonths[(int)date('n', $varsMtime)] . ' ' . date('Y', $varsMtime);
}
// Cache-busting CSS — 2026-07-18 : auparavant basé UNIQUEMENT sur le mtime de
// presentation.css, ce qui laissait les navigateurs servir une version en cache
// de css/themes/bleu.css ou medieval.css dès que SEULS ces fichiers changeaient
// (le ?v= restait identique). Corrigé en prenant le mtime le PLUS RÉCENT parmi
// les 3 fichiers CSS liés avec ?v= plus bas, pour que toute édition d'un thème
// invalide bien le cache navigateur.
$cssFiles = [
    __DIR__ . '/css/presentation.css',
    __DIR__ . '/css/themes/bleu.css',
    __DIR__ . '/css/themes/medieval.css',
];
$cssVersion = time();
$mtimes = array_filter(array_map(function ($f) { return file_exists($f) ? filemtime($f) : 0; }, $cssFiles));
if ($mtimes) { $cssVersion = max($mtimes); }

// 2026-08-01 — demande explicite : sur mobile (Android/iOS/autre), préférer le
// thème "bleu" (léger) plutôt que "ancien"/Médiéval (cadre décoratif 4 côtés +
// parchemins 9-slice, lourd et gourmand en pixels sur petit écran) — MAIS
// uniquement quand le visiteur n'a jamais choisi lui-même de thème (repris
// intégralement côté JS, cf. javascript/themeManager.js::getTheme() pour le
// jeu et le bloc setTheme ci-dessous pour cette page — un choix stocké dans
// localStorage prévaut toujours, PHP ne peut de toute façon pas le lire).
// Détection ici UNIQUEMENT pour éviter le flash visuel "médiéval" avant que
// le JS ne corrige l'attribut data-theme au chargement (valeur de repli du
// tout premier rendu serveur) — même regex UA que côté JS, gardée simple et
// cohérente avec le reste du projet (pas de lib de détection dédiée).
$isMobileUA = false;
if (!empty($_SERVER['HTTP_USER_AGENT'])) {
    $isMobileUA = (bool)preg_match('/Android|iPhone|iPad|iPod|Mobile|Windows Phone/i', $_SERVER['HTTP_USER_AGENT']);
}
$defaultTheme = $isMobileUA ? 'bleu' : 'ancien';

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
    'de' => 'german',
    'ru' => 'russian',
    'fr-MED' => 'french-medieval',
];
$LANGS = array_keys($LANG_FILES);

// ── 2026-07-28 — on n'embarque plus QUE la langue utile ──────────────────────
// Avant : les 6 fichiers de langue (≈408 Ko) étaient lus puis sérialisés dans le
// <head> de CHAQUE chargement de page, dont ~340 Ko que le visiteur ne verrait
// jamais. Désormais on embarque le français (repli obligatoire de resolveI18n +
// langue du rendu PHP) et, s'il diffère, la langue préférée du visiteur.
//
// Cette préférence arrive par un cookie posé par setLang() côté JS. Elle ne sert
// qu'à choisir quoi pré-charger : si le cookie est absent ou inconnu, on tombe sur
// le français et le moteur JS ira chercher la langue manquante en fetch() (cf.
// ensureLang plus bas). Le premier affichage reste donc toujours correct, sans
// clignotement pour un visiteur qui revient dans sa langue.
// 2026-07-31 — repli "fr-CA" (au lieu de "fr") quand aucune préférence n'est
// encore connue (pas de cookie), sur demande explicite. Le français reste de
// toute façon toujours embarqué ci-dessous (array_unique(['fr', $prefLang])) :
// c'est le rendu PHP statique (tr($t,'fr',...) partout dans ce fichier) qui
// reste en français le temps que setLang() bascule vers fr-CA côté JS.
$prefLang = isset($_COOKIE['hexistenz_pres_lang']) ? (string)$_COOKIE['hexistenz_pres_lang'] : 'fr-CA';
if (!isset($LANG_FILES[$prefLang])) $prefLang = 'fr-CA';

$t = [];
foreach (array_unique(['fr', $prefLang]) as $code) {
    $t[$code] = json_decode(@file_get_contents($langDir . $LANG_FILES[$code] . '.json'), true) ?: [];
}

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

// Highscores — top 10, même logique que highscore.php.
// 2026-07-31 — demande explicite : classement de LA PREZ (uniquement — la modale
// in-game reste sur highscore.php::sort_scores(), inchangée, toujours par score
// brut) reclassé par EFFICACITÉ = score / tuiles posées, exprimée en % (ex :
// 11243 pts / 159 tuiles = 70.7%), affichée en petit sous le score de CHAQUE
// entrée (pas seulement les détaillées). tiles=0 (edge case, partie quasi
// vide) → efficacité 0 plutôt qu'une division par zéro.
// Formule + constantes ($efficiencyMinTiles / $efficiencyMinTilesExponent) :
// cf. javascript/variables.js §"CLASSEMENT — EFFICACITÉ" (source canonique,
// mirorée en tête de ce fichier par regex) — minore l'efficacité brute quand
// le nombre de tuiles est trop faible pour être significatif (rampe
// quadratique, confiance 1 à partir de $efficiencyMinTiles tuiles).
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
                    $tiles = isset($stats['tiles']) ? (int)$stats['tiles'] : 0;
                    $score = (int)$entry['score'];
                    $confidence = $efficiencyMinTiles > 0
                        ? pow(min($tiles, $efficiencyMinTiles) / $efficiencyMinTiles, $efficiencyMinTilesExponent)
                        : 1.0;
                    $clean[] = [
                        'name'         => (string)$entry['name'],
                        'score'        => $score,
                        'date'         => isset($entry['date']) ? (string)$entry['date'] : '',
                        'tiles'        => $tiles,
                        'efficiency'   => $tiles > 0 ? round(($score / $tiles) * $confidence, 1) : 0.0,
                        'trains'       => isset($stats['trainLines']) ? (int)$stats['trainLines'] : 0,
                        'boats'        => isset($stats['boatCount'])  ? (int)$stats['boatCount']  : 0,
                        'mills'        => isset($stats['millCount'])  ? (int)$stats['millCount']  : 0,
                        'comets'       => isset($stats['cometHits'])  ? (int)$stats['cometHits']  : 0,
                        'totals'       => $biomeTotals,
                        'largest'      => $biomeLargest,
                    ];
                }
            }
            usort($clean, function($a, $b) { return $b['efficiency'] <=> $a['efficiency']; });
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
<html lang="fr" data-lang="fr" data-theme="<?= htmlspecialchars($defaultTheme) ?>">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Hexistenz — Jeu de tuiles hexagonales</title>
  <link rel="icon" type="image/svg+xml" href="favicon.svg" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Space+Mono:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="css/presentation.css?v=<?= $cssVersion ?>" />
  <!-- 2026-07-17 — CSS de thèmes, cf. CONTEXT.md §32. presentation.css ne garde que
       le layout partagé ; tout ce qui est intrinsèque à un thème (fond, bordure,
       coins, couleurs) vit dans l'un de ces 2 fichiers, chacun scopé sous son
       [data-theme="..."] — chargés tous les deux, sans effet si le thème
       correspondant n'est pas sélectionné. -->
  <link rel="stylesheet" href="css/themes/bleu.css?v=<?= $cssVersion ?>" />
  <link rel="stylesheet" href="css/themes/medieval.css?v=<?= $cssVersion ?>" />
  <script id="i18n-data" type="application/json"><?= json_encode($t, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG) ?></script>
</head>
<body>

<div id="particles-js" aria-hidden="true"></div>
<div class="bg-layer" aria-hidden="true"></div>

<!-- 2026-08-01 — cadre décoratif médiéval, repris tel quel du jeu (game.php,
     cf. CONTEXT.md §39) : même image (cadre.png), même technique CSS (4
     divs posées par-dessus tout via z-index, gauche/droite en rotation
     90°/-90°). Demande explicite : "par dessus tout le reste, simplement".
     Masqué par défaut (thème bleu), affiché uniquement en [data-theme="ancien"]
     via css/themes/medieval.css. -->
<div id="prezFooterBanner" aria-hidden="true"></div>
<div id="prezHeaderBanner" aria-hidden="true"></div>
<div id="prezLeftBanner" aria-hidden="true"></div>
<div id="prezRightBanner" aria-hidden="true"></div>

<!-- ─── NAV ────────────────────────────────────────────────────── -->
<nav>
  <!-- 2026-07-20 — sur demande explicite : ne garde que le glyphe hexagone
       (agrandi, cf. .nav-logo dans presentation.css) comme lien "retour en
       haut de page" ; "HEXISTENZ" et le numéro de version (jadis .nav-version)
       ont été déplacés à la suite du titre .hero-title ci-dessous. -->
  <a class="nav-logo" href="#">⬡</a>
  <button class="nav-toggle" id="navToggle" type="button" aria-label="Menu" aria-controls="navLinks" aria-expanded="false">
    <span></span><span></span><span></span>
  </button>
  <ul class="nav-links" id="navLinks">
    <li><a href="#factions"  data-i18n="nav.links.factions"><?= tr($t,'fr','nav.links.factions') ?></a></li>
    <li><a href="#biomes"    data-i18n="nav.links.biomes"><?= tr($t,'fr','nav.links.biomes') ?></a></li>
    <li><a href="#gameplay"  data-i18n="nav.links.gameplay"><?= tr($t,'fr','nav.links.gameplay') ?></a></li>
    <li><a href="#missions"  data-i18n="nav.links.missions"><?= tr($t,'fr','nav.links.missions') ?></a></li>
    <li><a href="#gallery"   data-i18n="nav.links.gallery"><?= tr($t,'fr','nav.links.gallery') ?></a></li>
    <li><a href="#creatures" data-i18n="nav.links.creatures"><?= tr($t,'fr','nav.links.creatures') ?></a></li>
    <li><a href="#audio"     data-i18n="nav.links.audio"><?= tr($t,'fr','nav.links.audio') ?></a></li>
    <li><a href="#daynnight" data-i18n="nav.links.daynnight"><?= tr($t,'fr','nav.links.daynnight') ?></a></li>
    <li><a href="#multi"     data-i18n="nav.links.multi"><?= tr($t,'fr','nav.links.multi') ?></a></li>
    <li><a href="#eda"       data-i18n="nav.links.eda"><?= tr($t,'fr','nav.links.eda') ?></a></li>
    <li><a href="#scores"    data-i18n="nav.links.scores"><?= tr($t,'fr','nav.links.scores') ?></a></li>
  </ul>
  <!-- 2026-07-17 — sélecteur de thème graphique (Bleu / Médiéval), demande explicite
       utilisateur : placé juste avant le sélecteur de langue. "ancien" (parchemin,
       9-slice, cf. CONTEXT.md §32) est le thème PAR DÉFAUT depuis 2026-07-17,
       persisté via localStorage hexistenz_theme (même clé que javascript/themeManager.js). -->
  <div id="theme-toggle">
    <select id="themeSelect" onchange="setTheme(this.value)">
      <option value="bleu" data-i18n="theme.bleu"><?= tr($t,'fr','theme.bleu') ?></option>
      <option value="ancien" data-i18n="theme.ancien"><?= tr($t,'fr','theme.ancien') ?></option>
    </select>
  </div>
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
        <h1 class="hero-title">⬡ HEXISTENZ<?php if ($version): ?><span class="hero-version"><?= htmlspecialchars($version) ?></span><?php endif; ?><?php if ($versionDate): ?><span class="hero-version-date" id="heroVersionDate"><?= htmlspecialchars($versionDate) ?></span><?php endif; ?></h1>
        <p class="hero-subtitle" data-i18n="hero.subtitle"><?= tr($t,'fr','hero.subtitle') ?></p>

        <p class="hero-inspi" data-i18n="hero.inspi_text"><?= tr($t,'fr','hero.inspi_text') ?></p>

        <div class="hero-inspi-grid">
          <div class="hero-inspi-col">
            <div class="hero-inspi-card"><div class="internal-parchment">
              <div class="parchment-picture parchment-picture--fill parchment-picture--v3">
              <img src="./images/dorfromantik.jpg" alt="Dorfromantik" class="hero-inspi-img" loading="lazy">
              </div>
              <div class="hero-inspi-caption">
                <div class="hero-inspi-name">Dorfromantik</div>
              </div>
            </div></div>
            <a class="hero-inspi-buy" href="https://store.steampowered.com/app/1455840/Dorfromantik/" target="_blank" rel="noopener">🎮 <span data-i18n="hero.inspi_buy.dorfromantik"><?= tr($t,'fr','hero.inspi_buy.dorfromantik') ?></span></a>
          </div>
          <div class="hero-inspi-col">
            <div class="hero-inspi-card"><div class="internal-parchment">
              <div class="parchment-picture parchment-picture--fill parchment-picture--v4">
              <img src="./images/settlers.jpg" alt="The Settlers" class="hero-inspi-img" loading="lazy">
              </div>
              <div class="hero-inspi-caption">
                <div class="hero-inspi-name">The Settlers</div>
              </div>
            </div></div>
            <a class="hero-inspi-buy" href="https://www.ubisoft.com/en-gb/games/the-settlers-history-edition" target="_blank" rel="noopener">🎮 <span data-i18n="hero.inspi_buy.settlers"><?= tr($t,'fr','hero.inspi_buy.settlers') ?></span></a>
          </div>
          <div class="hero-inspi-col">
            <div class="hero-inspi-card"><div class="internal-parchment">
              <div class="parchment-picture parchment-picture--fill parchment-picture--v5">
              <img src="./images/heroes.jpg" alt="Heroes of Might and Magic" class="hero-inspi-img" loading="lazy">
              </div>
              <div class="hero-inspi-caption">
                <div class="hero-inspi-name">Heroes of Might &amp; Magic</div>
              </div>
            </div></div>
            <a class="hero-inspi-buy" href="https://www.gog.com/en/game/heroes_of_might_and_magic_3_complete_edition" target="_blank" rel="noopener">🎮 <span data-i18n="hero.inspi_buy.heroes3"><?= tr($t,'fr','hero.inspi_buy.heroes3') ?></span></a>
          </div>
        </div>

        <p class="hero-tagline" data-i18n="hero.tagline"><?= tr($t,'fr','hero.tagline') ?></p>
        <div class="hero-buttons">
          <a href="game.php" class="btn-primary" data-i18n="hero.btn_play"><?= tr($t,'fr','hero.btn_play') ?></a>
          <a href="#gameplay" class="btn-secondary" data-i18n="hero.btn_how"><?= tr($t,'fr','hero.btn_how') ?></a>
        </div>
        <div class="stats-bar"><div class="internal-parchment">
          <div class="stat-item"><div class="stat-num">6</div><div class="stat-label" data-i18n="hero.stats.biomes_label"><?= tr($t,'fr','hero.stats.biomes_label') ?></div></div>
          <div class="stat-item"><div class="stat-num">∞</div><div class="stat-label" data-i18n="hero.stats.games_label"><?= tr($t,'fr','hero.stats.games_label') ?></div></div>
          <div class="stat-item"><div class="stat-num">2</div><div class="stat-label" data-i18n="hero.stats.factions_label"><?= tr($t,'fr','hero.stats.factions_label') ?></div></div>
          <div class="stat-item"><div class="stat-num">9</div><div class="stat-label" data-i18n="hero.stats.langs_label"><?= tr($t,'fr','hero.stats.langs_label') ?></div></div>
          <div class="stat-item"><div class="stat-num">2</div><div class="stat-label" data-i18n="hero.stats.themes_label"><?= tr($t,'fr','hero.stats.themes_label') ?></div></div>
        </div></div>
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
      <div class="faction-card platiste"><div class="internal-parchment">
        <div class="faction-img parchment-picture parchment-picture--v1" style="display:block;padding:0;">
          <img src="images/platiste.jpg" alt="Mode Platiste" style="width:100%;height:100%;object-fit:cover;display:block;">
        </div>
        <div class="faction-body">
          <span class="faction-tag" data-i18n="factions.flat.tag"><?= tr($t,'fr','factions.flat.tag') ?></span>
          <div class="faction-name" data-i18n="factions.flat.name"><?= tr($t,'fr','factions.flat.name') ?></div>
          <p class="faction-desc" data-i18n="factions.flat.desc"><?= tr($t,'fr','factions.flat.desc') ?></p>
        </div>
      </div></div>

      <div class="faction-card bouliste"><div class="internal-parchment">
        <div class="faction-img parchment-picture parchment-picture--v2" style="display:block;padding:0;">
          <img src="images/bouliste-transparent.png" alt="Mode Bouliste" style="width:100%;height:100%;object-fit:cover;display:block;">
        </div>
        <div class="faction-body">
          <span class="faction-tag" data-i18n="factions.globe.tag"><?= tr($t,'fr','factions.globe.tag') ?></span>
          <div class="faction-name" data-i18n="factions.globe.name"><?= tr($t,'fr','factions.globe.name') ?></div>
          <p class="faction-desc" data-i18n="factions.globe.desc"><?= tr($t,'fr','factions.globe.desc') ?></p>
        </div>
      </div></div>
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
      foreach ($biomeCards as $bi => $bc): $k = $bc['key']; $bv = ['v1','v2','v3','v4','v5'][$bi % 5]; ?>
      <div class="biome-card <?= $bc['cls'] ?>"><div class="internal-parchment">
        <div class="biome-banner parchment-picture parchment-picture--<?= $bv ?>">
          <div class="parchment-picture--absolute">
          <img src="<?= $bc['img'] ?>" alt="<?= htmlspecialchars($bc['alt']) ?>" class="biome-banner-img">
          </div>
          <div class="biome-banner-overlay">
            <div class="biome-name" data-i18n="biomes.<?= $k ?>.name"><?= tr($t,'fr',"biomes.$k.name") ?></div>
          </div>
        </div>
        <div class="biome-body">
          <div class="biome-desc" data-i18n="biomes.<?= $k ?>.desc"><?= tr($t,'fr',"biomes.$k.desc") ?></div>
          <span class="biome-tag" data-i18n="biomes.<?= $k ?>.tag"><?= tr($t,'fr',"biomes.$k.tag") ?></span>
        </div>
      </div></div>
      <?php endforeach; ?>
    </div>
  </div>
</section>

<!-- ═══════════ MISSIONS ═══════════ -->
<!-- ═══════════ GAMEPLAY ═══════════ -->
<!-- 2026-07-19 — déplacée AVANT "missions" (demande explicite), cf. nav header
     réordonnée en conséquence plus haut dans ce fichier. -->
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
      <div class="step-card"><div class="internal-parchment">
        <div class="step-icon"><?= $sc['icon'] ?></div>
        <div class="step-title" data-i18n="gameplay.steps.<?= $k ?>.title"><?= tr($t,'fr',"gameplay.steps.$k.title") ?></div>
        <div class="step-desc" data-i18n="gameplay.steps.<?= $k ?>.desc"><?= tr($t,'fr',"gameplay.steps.$k.desc") ?></div>
      </div></div>
      <?php endforeach; ?>
    </div>

    <div style="margin-top:52px;">
      <p class="section-label" data-i18n="gameplay.score_label"><?= tr($t,'fr','gameplay.score_label') ?></p>
      <div class="score-pills"><div class="internal-parchment">
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
      </div></div>
    </div>

    <h2 class="section-title" style="margin-top:40px;padding-top:26px;border-top:1px solid var(--border);" data-i18n="gameplay.kbd_title"><?= tr($t,'fr','gameplay.kbd_title') ?></h2>

    <div class="kbd-strip">
      <div class="internal-parchment">
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
      <div class="kbd-strip-item"><kbd>V</kbd><span data-i18n="gameplay.kbd.replay"><?= tr($t,'fr','gameplay.kbd.replay') ?></span></div>
      <div class="kbd-strip-item"><kbd data-i18n="gameplay.kbd.space_kbd"><?= tr($t,'fr','gameplay.kbd.space_kbd') ?></kbd><span data-i18n="gameplay.kbd.immersive"><?= tr($t,'fr','gameplay.kbd.immersive') ?></span></div>
      <div class="kbd-strip-item"><kbd data-i18n="gameplay.kbd.shift_kbd"><?= tr($t,'fr','gameplay.kbd.shift_kbd') ?></kbd><kbd data-i18n="gameplay.kbd.space_kbd"><?= tr($t,'fr','gameplay.kbd.space_kbd') ?></kbd><span data-i18n="gameplay.kbd.super_immersive"><?= tr($t,'fr','gameplay.kbd.super_immersive') ?></span></div>
      <div class="kbd-strip-item"><kbd>M</kbd><span data-i18n="gameplay.kbd.mute"><?= tr($t,'fr','gameplay.kbd.mute') ?></span></div>
      <div class="kbd-strip-item"><kbd>T</kbd><span data-i18n="gameplay.kbd.mute_tts"><?= tr($t,'fr','gameplay.kbd.mute_tts') ?></span></div>
      <div class="kbd-strip-item"><kbd>H</kbd><kbd>ESC</kbd><span data-i18n="gameplay.kbd.help"><?= tr($t,'fr','gameplay.kbd.help') ?></span></div>
      </div>
    </div>
  </div>
</section>

<!-- ═══════════ MISSIONS ═══════════ -->
<!-- 2026-07-19 — déplacée APRÈS "gameplay" (demande explicite, inverse de
     l'ordre d'origine), cf. nav header réordonnée en conséquence plus haut. -->
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
      <div class="mission-card"><div class="internal-parchment">
        <div class="mission-icon"><?= $mc['icon'] ?></div>
        <div>
          <div class="mission-name" data-i18n="missions.<?= $k ?>.name"><?= tr($t,'fr',"missions.$k.name") ?></div>
          <div class="mission-desc" data-i18n="missions.<?= $k ?>.desc"><?= tr($t,'fr',"missions.$k.desc") ?></div>
        </div>
      </div></div>
      <?php endforeach; ?>
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
      foreach ($presets as $pi => $pc):
        $k = $pc['key'];
        $gv = ['v1','v2','v3','v4','v5'][$pi % 5];
        $cls = 'gallery-card' . ($pc['contain'] ? ' gallery-card--contain' : '');
        $style = $pc['span'] ? ' style="grid-column:span ' . $pc['span'] . ';"' : '';
      ?>
      <div class="<?= $cls ?>"<?= $style ?>>
        <div class="internal-parchment">
        <div class="gallery-picture parchment-picture parchment-picture--<?= $gv ?>">
        <img src="<?= $pc['img'] ?>" alt="<?= htmlspecialchars($pc['alt']) ?>" class="gallery-img">
        <div class="gallery-overlay"><div class="gallery-label"><span data-i18n="gallery.preset_word"><?= tr($t,'fr','gallery.preset_word') ?></span> <span data-i18n="gallery.presets.<?= $k ?>"><?= tr($t,'fr',"gallery.presets.$k") ?></span></div></div>
        </div>
        </div>
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
      foreach ($creatures as $ci => $cc): $k = $cc['key']; $cv = ['v1','v2','v3','v4','v5'][$ci % 5]; ?>
      <div class="creature-card"><div class="internal-parchment">
        <div class="creature-banner parchment-picture parchment-picture--<?= $cv ?>">
          <div class="parchment-picture--absolute">
          <img src="<?= $cc['img'] ?>" alt="<?= htmlspecialchars($cc['alt']) ?>" class="creature-banner-img">
          </div>
          <div class="creature-banner-overlay">
            <div class="creature-name" data-i18n="creatures.<?= $k ?>.name"><?= tr($t,'fr',"creatures.$k.name") ?></div>
          </div>
        </div>
        <div class="creature-body">
          <div class="creature-desc" data-i18n="creatures.<?= $k ?>.desc"><?= tr($t,'fr',"creatures.$k.desc") ?></div>
        </div>
      </div></div>
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
        // 2026-07-31 — voix off (TTS, cf. CONTEXT.md §35) : points/missions/repères
        // d'interface annoncés à voix haute, jingle .ogg devant chaque annonce de
        // mission, dans les 9 langues du jeu.
        ['key' => 'voice',    'icon' => '🗣️'],
        ['key' => 'silence',  'icon' => '🔇'],
      ];
      foreach ($audioCards as $ac): $k = $ac['key']; ?>
      <div class="audio-card"><div class="internal-parchment">
        <div class="audio-icon"><?= $ac['icon'] ?></div>
        <div>
          <div class="audio-name" data-i18n="audio.<?= $k ?>.name"><?= tr($t,'fr',"audio.$k.name") ?></div>
          <div class="audio-desc" data-i18n="audio.<?= $k ?>.desc"><?= tr($t,'fr',"audio.$k.desc") ?></div>
        </div>
      </div></div>
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
        // 2026-07-30 — orage + incendies (cf. CONTEXT.md §36). L'illustration images/orage.jpg
        // est fournie séparément par Piregwan ; le reste de la carte (textes 9 langues sous
        // daynnight.storm) est en place et s'affichera dès que le fichier sera déposé.
        ['key' => 'storm',   'img' => 'images/orage.jpg',    'alt' => 'Orage et incendies','icon' => '⚡', 'cls' => 'daynight-card rain', 'span' => true],
      ];
      foreach ($dnCards as $di => $dc):
        $k = $dc['key'];
        $dv = ['v1','v2','v3','v4','v5'][$di % 5];
        $style = $dc['span'] ? ' style="grid-column:span 2;"' : '';
        $list  = tr($t,'fr',"daynnight.$k.list");
        $count = is_array($list) ? count($list) : 0;
      ?>
      <div class="<?= $dc['cls'] ?>"<?= $style ?>><div class="internal-parchment">
        <div class="parchment-picture parchment-picture--fill parchment-picture--<?= $dv ?>">
        <img src="<?= $dc['img'] ?>" alt="<?= htmlspecialchars($dc['alt']) ?>" class="daynight-img">
        </div>
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
      </div></div>
      <?php endforeach; ?>
    </div>
  </div>
</section>

<!-- ═══════════ MULTIPLAYER ═══════════ -->
<!-- 2026-07-19 — déplacée AVANT "personnalisation" (eda) (demande explicite),
     cf. nav header réordonnée en conséquence plus haut. Restructurée dans la
     foulée : .room-demo était un enfant direct de .multi-inner (grid 2 col,
     align-items:center) au même niveau que TOUTE la colonne de texte — qui
     empile 3 sous-rubriques (Bâtissez ensemble / Partagez vos captures /
     Enregistrez vos parties). align-items:center centrait donc .room-demo sur
     la hauteur des 3 sous-rubriques cumulées, le faisant "flotter" entre elles
     plutôt que se caler sur la 1ère. Fix : .multi-inner ne contient plus QUE la
     1ère sous-rubrique (titre/sub/features) + .room-demo en grid 2 colonnes ;
     les 2 sous-rubriques suivantes (galerie de captures, replay vidéo) + le
     bouton "Créer une partie" sortent de .multi-inner, en pleine largeur
     en-dessous, alignées sur la colonne de texte via .multi-below. -->
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
      </div>
      <div class="room-demo">
        <div class="internal-parchment">
        <div class="room-demo-title" data-i18n="multi.room_title"><?= tr($t,'fr','multi.room_title') ?></div>
        <div class="room-code">HEXGRP</div>
        <div class="room-status" data-i18n="multi.room_status"><?= tr($t,'fr','multi.room_status') ?></div>
        <div class="room-players">
          <div class="player-dot active">🧑</div>
          <div class="player-dot active">👩</div>
          <div class="player-dot active">🧔</div>
          <div class="player-dot">…</div>
        </div>
        <div class="room-scores">
          <div class="room-scores-label" data-i18n="multi.tiles_placed_label"><?= tr($t,'fr','multi.tiles_placed_label') ?></div>
          <div class="room-score-row">
            <span class="room-score-name">Piregwan</span>
            <span class="room-score-pts gold">47</span>
          </div>
          <div class="room-score-row">
            <span class="room-score-name dim">Emil</span>
            <span class="room-score-pts">31</span>
          </div>
          <div class="room-score-row">
            <span class="room-score-name dim">Josef</span>
            <span class="room-score-pts">28</span>
          </div>
        </div>
      </div>
    </div>
    </div>

    <div class="multi-below">
      <h2 class="section-title" style="margin-top:32px;" data-i18n="multi.gallery_title"><?= tr($t,'fr','multi.gallery_title') ?></h2>
      <p class="section-sub" data-i18n="multi.gallery_promo"><?= tr($t,'fr','multi.gallery_promo') ?></p>
      <h2 class="section-title" style="margin-top:32px;" data-i18n="multi.replay_title"><?= tr($t,'fr','multi.replay_title') ?></h2>
      <p class="section-sub" data-i18n="multi.replay_promo"><?= tr($t,'fr','multi.replay_promo') ?></p>
      <div style="margin-top:28px;">
        <a href="game.php" class="btn-primary" data-i18n="multi.btn_create"><?= tr($t,'fr','multi.btn_create') ?></a>
      </div>
    </div>
  </div>
</section>

<!-- ═══════════ PERSONNALISATION EXTRÊME (EDA) ═══════════ -->
<!-- 2026-07-19 — déplacée APRÈS "multiplayer" (demande explicite, inverse de
     l'ordre d'origine), cf. nav header réordonnée en conséquence plus haut. -->
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
      foreach ($edaCards as $ei => $ec): $k = $ec['key']; $ev = ['v1','v2','v3','v4','v5'][$ei % 5]; ?>
      <div class="eda-showcase-card">
        <div class="internal-parchment">
        <div class="parchment-picture parchment-picture--auto parchment-picture--<?= $ev ?>">
        <img src="<?= $ec['img'] ?>" alt="<?= htmlspecialchars($ec['alt']) ?>" class="eda-showcase-img">
        </div>
        <div class="eda-showcase-body">
          <div class="eda-showcase-label" data-i18n="eda.<?= $k ?>.label"><?= tr($t,'fr',"eda.$k.label") ?></div>
          <p class="eda-showcase-desc" data-i18n="eda.<?= $k ?>.desc"><?= tr($t,'fr',"eda.$k.desc") ?></p>
        </div>
        </div>
      </div>
      <?php endforeach; ?>
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
        <div class="internal-parchment">
        <div class="hs-rank-col">
          <div class="hs-rank"><?= $i + 1 ?></div>
        </div>
        <div class="hs-main">
          <div class="hs-name"><?= htmlspecialchars($hs['name']) ?></div>
          <?php if ($dateStr): ?><div class="hs-date"><?= $dateStr ?></div><?php endif; ?>
          <?php if ($i < 6 && $hs['tiles'] > 0): ?>
          <div class="hs-headline-stat"><span class="icon">⬡</span><?= number_format($hs['tiles']) ?> <span data-i18n="scores.headline_stat"><?= tr($t,'fr','scores.headline_stat') ?></span></div>
          <?php endif; ?>
          <?php
            // 2026-07-20 — "format étendu" (détail trains/bateaux/moulins + biomes)
            // réservé aux 6 premiers rangs (2026-07-31 : élargi de 3 à 6 sur demande
            // explicite) : au-delà, la carte garde EXACTEMENT le même gabarit (rang/
            // nom/date/score) mais sans ce détail, pour rester lisible sur un
            // classement plus long (jusqu'à 10). Exception (2026-07-31, demande
            // explicite) : les COMÈTES sortent de cette règle — comptées sur CHAQUE
            // entrée (jusqu'à 10), même à 0, juste après les moulins ; cf. bloc dédié
            // plus bas, volontairement HORS du "if ($i < 6)".
            // TOUTES les petites stats (lignes/bateaux/comètes + détail biomes) dans
            // UN SEUL flux .hs-meta — pas de blocs séparés qui se retrouvent sur des
            // lignes différentes. Même style partout (cf. .hs-meta-item en CSS).
            // Un seul data-i18n par mot (singulier/pluriel choisi ici, uniforme sur
            // les 3 langues depuis la refonte du 2026-07-14 : toutes ont .s/.p).
            $smallStats = '';
            if ($i < 6) {
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
            }
            // 2026-07-31 — demande explicite : contrairement aux autres stats
            // détaillées ci-dessus (réservées aux 6 premiers rangs, ET seulement
            // si >0), le nombre de comètes cliquées doit être visible sur CHAQUE
            // entrée du classement (jusqu'à 10) — y compris à 0 — juste après les
            // moulins dans le flux .hs-meta. D'où : hors du bloc "if ($i < 6)"
            // ci-dessus, et sans garde ">0".
            $cometKey = $hs['comets'] > 1 ? 'scores.comets_p' : 'scores.comets_s';
            $smallStats .= '<span class="hs-meta-item"><span class="icon">☄️</span><span class="hs-stat-num">' . $hs['comets'] . '</span>'
              . ' <span data-i18n="' . $cometKey . '">' . htmlspecialchars(tr($t,'fr',$cometKey)) . '</span></span>';
            if ($i < 6) {
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
            } // fin if ($i < 6) — format étendu réservé aux 6 premiers rangs
            if ($smallStats): ?>
          <div class="hs-meta"><?= $smallStats ?></div>
          <?php endif; ?>
        </div>
        <div class="hs-score-col">
          <!-- 2026-07-31 — classement reclassé par efficacité (score/tuile), demande
               explicite : affichée sur TOUTES les entrées (pas seulement les 6
               détaillées) puisque c'est désormais le critère de tri du classement.
               2e demande (même jour) : devient le nombre EN AVANT (gros, en premier),
               le score brut passant en second, réduit — hiérarchie visuelle inversée
               par rapport à la 1ère version. -->
          <div class="hs-efficiency"><?= number_format($hs['efficiency'], 1) ?>%</div>
          <!-- 2026-07-31 — 3e demande (même jour) : le score, désormais discret sous
               l'efficacité, doit être suivi de son unité ("pts" + équivalents, 9
               langues) pour rester lisible une fois réduit. -->
          <div class="hs-score"><?= number_format($hs['score']) ?> <span data-i18n="scores.pts_suffix"><?= htmlspecialchars(tr($t,'fr','scores.pts_suffix')) ?></span></div>
        </div>
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
  // I18N ne contient que le français + éventuellement la langue préférée (cf. le
  // bloc PHP en tête de fichier). Les autres sont chargées à la demande par
  // ensureLang() — une seule requête, mise en cache par le navigateur.
  const I18N = JSON.parse(document.getElementById('i18n-data').textContent);
  const LANGS = <?= json_encode($LANGS, JSON_UNESCAPED_UNICODE) ?>;
  const LANG_FILES = <?= json_encode($LANG_FILES, JSON_UNESCAPED_UNICODE) ?>;
  // 2026-07-29 — mtime de javascript/variables.js (ms, pour `new Date()` côté JS),
  // utilisé par updateVersionDate() plus bas pour reformater la date affichée à
  // côté de la pastille de version selon la langue en cours.
  const HEXISTENZ_VARS_MTIME = <?= $varsMtime ? ((int)$varsMtime * 1000) : 'null' ?>;

  function resolveI18n(lang, path) {
    return path.split('.').reduce((node, key) => (node && typeof node === 'object') ? node[key] : undefined, I18N[lang]);
  }

  // Charge le JSON d'une langue si absent. Échec réseau → false, l'appelant garde
  // le français (resolveI18n retombe dessus de toute façon).
  async function ensureLang(l) {
    if (I18N[l]) return true;
    const file = LANG_FILES[l];
    if (!file) return false;
    try {
      const res = await fetch('./json/languages/' + file + '.json');
      if (!res.ok) return false;
      I18N[l] = await res.json();
      return true;
    } catch (_) {
      return false;
    }
  }

  function applyI18n(lang) {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const path = el.getAttribute('data-i18n');
      const value = resolveI18n(lang, path) ?? resolveI18n('fr', path);
      if (value != null) el.innerHTML = value;
    });
  }

  // ─── TTS prez (2026-07-29) — annonce vocale au changement de langue/thème ────
  // Page hors du graphe de modules du jeu (tout ce <script> est en JS classique,
  // pas type="module") : pas de réutilisation directe de gameLangReactive.js/
  // ttsAnnouncer.js — setLang()/setTheme() ci-dessous ne passent PAS par
  // gameLangReactive.js::setGameLang(), donc les callbacks registerLangRefresh de
  // ttsAnnouncer.js ne se déclencheraient jamais ici (désync garantie). Mécanisme
  // dédié et minimal à la place, qui lit directement I18N[lang] (déjà chargé par
  // ensureLang() ci-dessus) au moment de parler — jamais de valeur mise en cache
  // à l'avance. Même logique de sélection de voix que javascript/ttsAnnouncer.js
  // (dupliquée ici plutôt qu'importée, même pattern que snapshotsPage.js/
  // replaysPage.js qui dupliquent déjà leur propre mini-map de locales).
  const TTS_LOCALES_PREZ = { fr: 'fr-FR', en: 'en-US', es: 'es-ES', it: 'it-IT', pt: 'pt-PT', 'fr-CA': 'fr-CA', de: 'de-DE', ru: 'ru-RU', 'fr-MED': 'fr-FR' };

  // 2026-07-29 — reformate la date à côté de la pastille de version (span
  // #heroVersionDate, rendu en français par PHP par défaut) dans la langue en
  // cours, via Intl.DateTimeFormat — réutilise TTS_LOCALES_PREZ ci-dessus
  // (mêmes codes BCP47 déjà nécessaires pour le TTS, pas besoin d'une 2e map).
  function updateVersionDate(l) {
    const el = document.getElementById('heroVersionDate');
    if (!el || !HEXISTENZ_VARS_MTIME) return;
    const locale = TTS_LOCALES_PREZ[l] ?? TTS_LOCALES_PREZ.fr;
    try {
      el.textContent = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' })
        .format(new Date(HEXISTENZ_VARS_MTIME));
    } catch (_) {
      // Locale non reconnue par le moteur JS (cas limite navigateur) → on garde
      // le texte déjà affiché (rendu FR initial ou dernière langue valide) plutôt
      // que de planter le reste de setLang().
    }
  }
  // fr-CA sans voix dédiée sur la plupart des postes → repli nommé ; allemand →
  // préférence voix masculine (demande explicite, cf. ttsAnnouncer.js::FALLBACK_VOICE_HINTS).
  const PREZ_VOICE_HINTS = { 'fr-CA': ['julie', 'paul'], de: ['stefan', 'markus', 'conrad', 'yannick', 'klaus', 'male'], ru: ['pavel', 'dmitry', 'dmitri', 'yuri', 'male'] };
  let _prezVoicesCache = [];
  if ('speechSynthesis' in window) {
    const _refreshPrezVoices = () => { _prezVoicesCache = window.speechSynthesis.getVoices(); };
    _refreshPrezVoices();
    window.speechSynthesis.onvoiceschanged = _refreshPrezVoices;
  }
  function _pickPrezVoice(locale, langCode) {
    if (!_prezVoicesCache.length) return null;
    const lang = locale.toLowerCase();
    const base = lang.split('-')[0];
    const hints = PREZ_VOICE_HINTS[langCode];
    const exactMatches = _prezVoicesCache.filter(v => v.lang.toLowerCase() === lang);
    if (exactMatches.length) {
      if (hints) {
        for (const hint of hints) {
          const hinted = exactMatches.find(v => v.name.toLowerCase().includes(hint));
          if (hinted) return hinted;
        }
      }
      return exactMatches[0];
    }
    const family = _prezVoicesCache.filter(v => v.lang.toLowerCase().startsWith(base + '-'));
    if (hints) {
      for (const hint of hints) {
        const hinted = family.find(v => v.name.toLowerCase().includes(hint));
        if (hinted) return hinted;
      }
    }
    if (family.length) return family[0];
    return _prezVoicesCache.find(v => v.lang.toLowerCase() === base) || null;
  }
  // 2026-07-31 — état muet des touches M (son) / T (voix), locale à cette page
  // (session uniquement, jamais persisté — même choix que scene.js). Déclaré ICI,
  // avant speakPrez(), pour que son garde-fou _prezTtsMuted soit toujours défini.
  let _prezSoundMuted = false;
  let _prezTtsMuted = false;

  function speakPrez(text, langCode) {
    if (!text || !('speechSynthesis' in window)) return;
    if (_prezTtsMuted) return;
    const locale = TTS_LOCALES_PREZ[langCode] ?? TTS_LOCALES_PREZ.fr;
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = locale;
    const voice = _pickPrezVoice(locale, langCode);
    if (voice) utter.voice = voice;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  }

  // `announce = false` sur les 2 appels d'initialisation ci-dessous (langue/thème
  // restaurés depuis localStorage au chargement de la page) : on ne parle QUE sur
  // une action explicite de l'utilisateur via les sélecteurs, jamais au premier
  // affichage.
  async function setLang(l, announce = true) {
    if (!LANGS.includes(l)) l = 'fr-CA';
    await ensureLang(l);
    document.documentElement.lang = l;
    document.documentElement.dataset.lang = l;
    localStorage.setItem('hexistenz_pres_lang', l);
    // Cookie lu par PHP au chargement suivant pour pré-embarquer la bonne langue
    // (et donc éviter le fetch + le clignotement). 1 an, pas de donnée personnelle.
    document.cookie = 'hexistenz_pres_lang=' + encodeURIComponent(l) + '; max-age=31536000; path=/; SameSite=Lax';
    const sel = document.getElementById('langSelect');
    if (sel) sel.value = l;
    applyI18n(l);
    updateVersionDate(l);
    if (typeof updateNavCompact === 'function') updateNavCompact();
    if (announce) speakPrez(resolveI18n(l, 'game.tts.languageChanged') ?? resolveI18n('fr', 'game.tts.languageChanged'), l);
  }

  const saved = localStorage.getItem('hexistenz_pres_lang');
  // 2026-07-31 — repli "fr-CA" (au lieu de "fr") au tout premier lancement, sur
  // demande explicite. ensureLang() (setLang ci-dessus) ira chercher fr-CA.json
  // à la volée si le cookie PHP n'avait pas déjà pré-embarqué la bonne langue.
  setLang(LANGS.includes(saved) ? saved : 'fr-CA', false);

  // ─── Sélecteur de thème graphique (2026-07-17) ─────────────────────────────
  // Même clé localStorage que javascript/themeManager.js (utilisé côté jeu) :
  // le choix fait ici est partagé avec game.php. Thème par défaut "ancien"
  // (Médiéval) depuis 2026-07-17, cf. CONTEXT.md §32.
  // 2026-08-01 — demande explicite : par défaut MOBILE (Android/iOS/autre),
  // préférer "bleu" (léger) à "ancien" (cadre décoratif lourd, cf.
  // javascript/themeManager.js pour l'explication complète) — uniquement
  // quand aucun choix n'a jamais été stocké par le visiteur (cf. plus bas).
  // Détection dupliquée ici (même regex que themeManager.js) car cette page
  // n'importe pas ce module en ES module (script classique) ; $defaultTheme
  // (PHP, même regex côté serveur) évite déjà le flash visuel au tout
  // premier rendu, ce bloc JS ne fait que confirmer/persister le même choix.
  const THEMES = ['bleu', 'ancien'];
  function isMobileDevice() {
    try {
      if (navigator.userAgentData && typeof navigator.userAgentData.mobile === 'boolean') {
        return navigator.userAgentData.mobile;
      }
    } catch {}
    try {
      return /Android|iPhone|iPad|iPod|Mobile|Windows Phone/i.test(navigator.userAgent || '');
    } catch {
      return false;
    }
  }
  function defaultTheme() {
    return isMobileDevice() ? 'bleu' : 'ancien';
  }
  function setTheme(th, announce = true) {
    if (!THEMES.includes(th)) th = defaultTheme();
    document.documentElement.dataset.theme = th;
    localStorage.setItem('hexistenz_theme', th);
    const sel = document.getElementById('themeSelect');
    if (sel) sel.value = th;
    // 2026-07-19 — particles.js est chargé plus bas dans la page (après ce
    // script) : window.initParticles n'existe donc pas encore lors du tout
    // premier appel (page load). Il existera pour tous les changements de
    // thème ultérieurs via le sélecteur, d'où la garde ci-dessous.
    if (window.initParticles) window.initParticles(th);
    // 2026-07-29 — annonce vocale (TTS) du thème, dans la langue actuellement
    // affichée (pas liée au thème lui-même) — réutilise directement theme.bleu/
    // theme.ancien, déjà traduit dans les 7 langues (mêmes clés que les <option>
    // data-i18n ci-dessus).
    if (announce) {
      const currentLang = document.documentElement.dataset.lang || 'fr';
      speakPrez(resolveI18n(currentLang, 'theme.' + th) ?? resolveI18n('fr', 'theme.' + th), currentLang);
    }
  }
  const savedTheme = localStorage.getItem('hexistenz_theme');
  setTheme(THEMES.includes(savedTheme) ? savedTheme : defaultTheme(), false);

  // ─── Touches M / T sur la prez (2026-07-31, demande explicite) ─────────────
  // Déjà documentées dans le bandeau clavier de cette page (gameplay.kbd.mute/
  // .mute_tts, cf. plus haut) mais jusqu'ici sans aucun effet ICI (elles ne
  // pilotaient que le jeu, game.php) — cf. CONTEXT.md §35 pour l'équivalent
  // in-game (scene.js, key === 'm'/'t'). Même séparation stricte : M coupe/
  // rétablit UNIQUEMENT la musique de fond (initPrezMusic plus bas dans le
  // fichier, expose window.__prezMusicAudio), T coupe/rétablit UNIQUEMENT les
  // annonces vocales (speakPrez, via _prezTtsMuted ci-dessus) — jamais l'un
  // sans l'autre.
  //
  // Erratum (même jour) : la 1ère version ne montrait RIEN à la coupure (pas de
  // popup central sur cette page, contrairement au jeu) et ne parlait qu'à la
  // réactivation — repéré en test réel : la touche T (silence à la coupure,
  // PAR DESIGN) semblait donc "ne rien faire du tout" au premier appui, faute
  // de tout retour perceptible (le fonctionnement lui-même était pourtant
  // correct — vérifié en rejouant exactement la séquence de touches réelle).
  // Fix : petit toast visuel (#prez-toast, css/presentation.css) affiché sur
  // LES DEUX directions pour M et pour T, en plus de la confirmation vocale
  // qui elle reste réservée à la réactivation (mêmes clés déjà traduites en 9
  // langues, game.sound.on/off et game.tts.voiceOn/Off — game.php utilise ces
  // mêmes clés pour son propre popup central).
  let _prezToastTimer = null;
  function showPrezToast(text) {
    if (!text) return;
    let el = document.getElementById('prez-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'prez-toast';
      el.className = 'prez-toast';
      document.body.appendChild(el);
    }
    el.textContent = text;
    clearTimeout(_prezToastTimer);
    // Force un reflow avant d'ajouter la classe --visible, pour que la
    // transition CSS se rejoue même si le toast était déjà affiché (appuis
    // rapprochés sur M/T).
    el.classList.remove('prez-toast--visible');
    void el.offsetWidth;
    el.classList.add('prez-toast--visible');
    _prezToastTimer = setTimeout(() => el.classList.remove('prez-toast--visible'), 1400);
  }

  function isPrezFormTarget(target) {
    if (!target) return false;
    const tag = target.tagName?.toLowerCase();
    return tag === 'input' || tag === 'select' || tag === 'textarea' || target.isContentEditable;
  }

  window.addEventListener('keydown', (event) => {
    if (isPrezFormTarget(event.target)) return;
    const key = event.key.toLowerCase();
    const currentLang = document.documentElement.dataset.lang || 'fr';

    if (key === 'm') {
      event.preventDefault();
      _prezSoundMuted = !_prezSoundMuted;
      if (window.__prezMusicAudio) window.__prezMusicAudio.muted = _prezSoundMuted;
      const key2 = _prezSoundMuted ? 'game.sound.off' : 'game.sound.on';
      showPrezToast(resolveI18n(currentLang, key2) ?? resolveI18n('fr', key2));
      if (!_prezSoundMuted) speakPrez(resolveI18n(currentLang, key2) ?? resolveI18n('fr', key2), currentLang);
      return;
    }

    if (key === 't') {
      event.preventDefault();
      _prezTtsMuted = !_prezTtsMuted;
      if (_prezTtsMuted && 'speechSynthesis' in window) window.speechSynthesis.cancel();
      const key2 = _prezTtsMuted ? 'game.tts.voiceOff' : 'game.tts.voiceOn';
      showPrezToast(resolveI18n(currentLang, key2) ?? resolveI18n('fr', key2));
      if (!_prezTtsMuted) speakPrez(resolveI18n(currentLang, key2) ?? resolveI18n('fr', key2), currentLang);
      return;
    }
  });

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

  // ── Nav compact dynamique ───────────────────────────────────────────────
  // Le CSS "body.nav-compact" (presentation.css ~L1214) existait déjà mais
  // n'était jamais posé par du JS : seul le media query fixe (max-width:860px)
  // déclenchait le mode sandwich, laissant une zone intermédiaire où les 11
  // liens retombaient sur 3 lignes sans bascule. Ici on mesure réellement le
  // nombre de rangées de <li> (via leur top réel) et on bascule dès que ça
  // dépasse 2 lignes, quelle que soit la largeur exacte.
  function updateNavCompact() {
    if (window.innerWidth <= 860) return; // déjà géré par le media query
    const list = document.getElementById('navLinks');
    if (!list) return;
    const wasCompact = document.body.classList.contains('nav-compact');
    if (wasCompact) document.body.classList.remove('nav-compact');
    const tops = new Set();
    list.querySelectorAll('li').forEach(li => {
      tops.add(Math.round(li.getBoundingClientRect().top));
    });
    document.body.classList.toggle('nav-compact', tops.size > 2);
  }
  updateNavCompact();
  let navCompactTimer;
  window.addEventListener('resize', () => {
    clearTimeout(navCompactTimer);
    navCompactTimer = setTimeout(updateNavCompact, 120);
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
// ─── Champ de particules réactif au thème (2026-07-19) ──────────────────────
// Thème "bleu classique" : champ d'étoiles bleu/blanc (config d'origine).
// Thème "ancien" (Médiéval) : "lucioles" or/ambre/vert doux — remplace le
// masquage pur (display:none) par une vraie recoloration, pour un cachet
// mystique/magique cohérent avec le parchemin plutôt qu'un fond vide.
// window.initParticles(theme) reconstruit entièrement l'instance (pJSDom +
// canvas détruits puis reconstruits) pour supporter un changement de thème
// live via le sélecteur, sans recharger la page.
const PARTICLE_CONFIGS = {
  bleu: {
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
  },
  ancien: {
    // 2026-07-19 (v4) — v3 (palette désaturée sable/bronze/sauge) réglait le
    // "s'intègre mal" mais restait trop clairsemée/lente/grosse pour lire
    // comme des lucioles vivantes. Retour utilisateur : plus nombreuses, plus
    // rapides, plus petites, plus opaques — garder la palette désaturée v3
    // (c'est elle qui marche visuellement) mais pousser densité/vitesse/
    // opacité et réduire la taille.
    // 2026-07-19 (v5) — vitesse +25% et nombre +25% (demande explicite), palette
    // v3 conservée. Le glow lumineux par particule vit désormais dans un canvas
    // dédié dessiné en JS (#particles-glow, cf. window.startGlow() plus bas) —
    // le filter:drop-shadow CSS mentionné ici a été abandonné (v6, insignifiant
    // à l'échelle réelle) puis remplacé par ce canvas de halo.
    // 🐛 v6d (opacité 0.55/0.15 + blur sur les points) — RÉGRESSION, revert.
    // Le retour "plus diffus et moins d'opacité" du 2026-07-19 visait en réalité
    // le HALO (#particles-glow), pas les particules elles-mêmes — clarifié
    // après coup par l'utilisateur. Points redevenus 0.9/0.35 (valeurs v5,
    // inchangées), blur retiré de #particles-js (cf. themes/medieval.css).
    // Le réglage "plus diffus/moins d'opacité" vit désormais UNIQUEMENT dans
    // les stops du gradient de startGlow() (index.php, plus bas).
    particles: {
      number: { value: 113, density: { enable: true, value_area: 900 } },
      color: { value: ["#a68a5b", "#8f7a4a", "#9c8354", "#7d8f6a"] },
      shape: { type: "circle" },
      opacity: { value: 0.9, random: true, anim: { enable: true, speed: 1.2, opacity_min: 0.35, sync: false } },
      size: { value: 2.2, random: true, anim: { enable: true, speed: 2, size_min: 1, sync: false } },
      line_linked: { enable: false },
      move: {
        enable: true, speed: 2, direction: "none",
        random: true, straight: false, out_mode: "out", bounce: false
      }
    },
    interactivity: {
      detect_on: "window",
      events: { onhover: { enable: false }, onclick: { enable: false }, resize: true }
    },
    retina_detect: true
  }
};

// 2026-07-19 — glow lumineux par particule (thème ancien) : ajouté (v6, canvas
// dédié #particles-glow dessiné en JS après échec du filter:drop-shadow CSS),
// puis affiné sur 8 itérations (v6b-v6h : décalage, couleur, taille, diffusion,
// courbe du dégradé...), puis RETIRÉ intégralement sur demande explicite du
// 2026-07-19 ("retire les halos sur les particules en theme médiéval"). Les
// lucioles redeviennent de simples points (cf. PARTICLE_CONFIGS.ancien
// ci-dessus), sans second canvas ni halo. Historique conservé ici pour
// mémoire si le besoin revient.
window.initParticles = function initParticles(theme) {
  const cfg = PARTICLE_CONFIGS[theme] || PARTICLE_CONFIGS.ancien;
  // Détruit l'instance précédente (pJSDom) avant reconstruction, sinon
  // particles.js empile plusieurs animations sur le même canvas.
  if (window.pJSDom && window.pJSDom.length) {
    window.pJSDom.forEach(inst => inst.pJS?.fn?.vendors?.destroypJS?.());
    window.pJSDom = [];
  }
  const holder = document.getElementById('particles-js');
  if (holder) holder.innerHTML = '';
  particlesJS('particles-js', cfg);
};

window.initParticles(document.documentElement.dataset.theme === 'bleu' ? 'bleu' : 'ancien');
</script>

<!-- 2026-07-20 — variation aléatoire manuscrit.png/manuscrit-2.png (thème Médiéval),
     cf. javascript/parchmentVariant.js pour le détail. -->
<script type="module" src="javascript/parchmentVariant.js"></script>

<script>
// ─── 2026-07-20 — musique de fond de la prez (aléatoire parmi les 2 pistes
// ingame) ─────────────────────────────────────────────────────────────────
// Réutilise les mêmes fichiers que le jeu (sounds/music-ingame-1/2.ogg, cf.
// javascript/musicPlayer.js) mais en autonome (page statique, pas de moteur
// de jeu chargé ici) : une seule piste tirée au sort au chargement, jouée en
// boucle (`loop = true`, contrairement au jeu qui alterne les 2 pistes à
// chaque fin de lecture). Fondu d'entrée doux + contournement de la politique
// autoplay des navigateurs (lecture directe tentée, sinon armée sur le 1er
// clic/touche, même pattern que musicState.installMusicUnlock côté jeu).
(function initPrezMusic() {
  const TRACKS = ['sounds/music-ingame-1.ogg', 'sounds/music-ingame-2.ogg'];
  const TARGET_VOLUME = 0.070; // même palier que MUSIC_MAX_VOLUME (musicPlayer.js)
  const FADE_MS = 2500;

  const audio = new Audio(TRACKS[Math.floor(Math.random() * TRACKS.length)]);
  audio.loop = true;
  audio.preload = 'auto';
  audio.volume = 0;

  function fadeIn() {
    const start = performance.now();
    function step(now) {
      const t = Math.min(1, (now - start) / FADE_MS);
      audio.volume = TARGET_VOLUME * t;
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function tryPlay() {
    audio.play().then(fadeIn).catch(() => {
      // Navigateur bloquant l'autoplay tant qu'aucune interaction réelle n'a eu
      // lieu — armé une seule fois sur le 1er clic/touche.
      const unlock = () => { audio.play().then(fadeIn).catch(() => {}); };
      window.addEventListener('pointerdown', unlock, { once: true, passive: true });
      window.addEventListener('keydown', unlock, { once: true, passive: true });
    });
  }

  tryPlay();

  // 2026-07-31 — exposée pour la touche M (listener global installé plus haut
  // dans le fichier, bloc TTS/setLang) : .muted plutôt que volume à 0, pour ne
  // jamais interférer avec le fondu d'entrée (fadeIn ci-dessus) ni avec une
  // reprise après un futur ré-armement autoplay.
  window.__prezMusicAudio = audio;
})();
</script>
</body>
</html>
