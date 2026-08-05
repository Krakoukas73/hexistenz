<?php
// ─── snapshots.php — galerie des captures d'écran du jeu (dossier /snapshots) ─────────
// Page dédiée, utilisable seule (URL directe) OU chargée dans un <iframe> par
// snapshotGallery.js pour s'afficher en overlay par-dessus le jeu sans quitter la
// partie en cours (cf. CONTEXT.md, demande utilisateur 2026-07-15). Le rendu (grille
// mosaïque, visionneuse plein écran, i18n) est entièrement côté client
// (javascript/snapshotsPage.js) — ce fichier ne fait que scanner le dossier /snapshots
// et embarquer la liste triée en JSON, PHP n'a aucune autre logique.
ini_set('display_errors', 0);
error_reporting(E_ALL);
header('Cache-Control: no-store');

require_once __DIR__ . '/snapshotThumb.php';

$snapDir = __DIR__ . DIRECTORY_SEPARATOR . 'snapshots';
$items = array();

if (is_dir($snapDir)) {
    $allJpgs = glob($snapDir . DIRECTORY_SEPARATOR . '*.jpg');
    // Les miniatures vivent dans le même dossier, suffixées "_thumb.jpg" (simplifié
    // le 2026-07-15 : plus de sous-dossier /thumbs) — à exclure de la liste des
    // captures elles-mêmes, sous peine de les afficher comme fausses entrées galerie.
    $files = $allJpgs ? array_values(array_filter($allJpgs, function ($p) {
        return substr($p, -10) !== '_thumb.jpg';
    })) : array();

    if ($files) {
        // Tri du plus récent au plus ancien (mtime — le nom de fichier est déjà
        // chronologique mais mtime reste la source de vérité, cf. multiplayer.php).
        usort($files, function ($a, $b) { return filemtime($b) - filemtime($a); });

        foreach ($files as $filePath) {
            $basename = basename($filePath);
            $jsonPath = preg_replace('/\.jpg$/', '.json', $filePath);
            $meta = array('date' => null, 'tiles' => null, 'mode' => null);

            if (is_file($jsonPath)) {
                $decoded = json_decode(file_get_contents($jsonPath), true);
                if (is_array($decoded)) {
                    $meta['date']  = isset($decoded['date']) ? $decoded['date'] : null;
                    $meta['tiles'] = isset($decoded['tiles']) ? $decoded['tiles'] : null;
                    $meta['mode']  = isset($decoded['mode']) ? $decoded['mode'] : null;
                }
            }
            if (!$meta['date']) {
                // Sidecar absent (capture antérieure à l'ajout des métadonnées) : on
                // retombe sur la date de modification du fichier, sans tiles/mode.
                $meta['date'] = gmdate('c', filemtime($filePath));
            }

            // Miniature (2026-07-15) — backfill à la volée pour les captures antérieures
            // au système de miniatures (pas de script de migration séparé : la première
            // ouverture de la galerie régénère et met en cache sur disque). Écrite
            // directement dans /snapshots, suffixe "_thumb" avant l'extension.
            $thumbBasename = preg_replace('/\.jpg$/', '_thumb.jpg', $basename);
            $thumbPath     = $snapDir . DIRECTORY_SEPARATOR . $thumbBasename;
            if (!is_file($thumbPath)) {
                hexistenz_generate_thumbnail($filePath, $thumbPath, 480, 72);
            }
            $thumbUrl = is_file($thumbPath)
                ? 'snapshots/' . rawurlencode($thumbBasename)
                : 'snapshots/' . rawurlencode($basename); // repli GD/Imagick/binaire indisponibles

            $items[] = array(
                'url'      => 'snapshots/' . rawurlencode($basename),
                'thumbUrl' => $thumbUrl,
                'date'     => $meta['date'],
                'tiles'    => $meta['tiles'],
                'mode'     => $meta['mode'],
            );
        }
    }
}

// 2026-08-01 — demande explicite : sur mobile, préférer "bleu" à "ancien"
// par défaut (cf. javascript/themeManager.js / index.php / game.php pour
// l'explication complète) — juste pour éviter le flash visuel avant que le
// script inline plus bas (qui lit localStorage) ne corrige l'attribut.
$isMobileUA = false;
if (!empty($_SERVER['HTTP_USER_AGENT'])) {
    $isMobileUA = (bool)preg_match('/Android|iPhone|iPad|iPod|Mobile|Windows Phone/i', $_SERVER['HTTP_USER_AGENT']);
}
$defaultTheme = $isMobileUA ? 'bleu' : 'ancien';
?><!DOCTYPE html>
<html lang="fr" data-theme="<?= htmlspecialchars($defaultTheme) ?>">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>Hexistenz — Galerie de captures</title>
<?php
// 2026-07-28 — cache-busting CSS, même bug/fix que game.php/index.php (cf.
// CONTEXT.md §26) : ces 3 feuilles n'avaient AUCUN ?v=, donc un navigateur
// ayant déjà ouvert la galerie une fois pouvait continuer à servir une version
// en cache indéfiniment après modification sur disque — cause très probable
// d'un retour utilisateur "toujours pareil, tu n'as rien adapté" sur un fix
// pourtant bien présent dans le fichier. $cssVersion = mtime le plus récent
// des 3 fichiers ; chacun porte quand même SON PROPRE mtime individuellement
// (comme game.php), pour qu'un futur changement d'un seul des trois n'oblige
// pas à revalider les deux autres inutilement.
$snapCssFiles = [
    __DIR__ . '/css/snapshots.css',
    __DIR__ . '/css/themes/bleu.css',
    __DIR__ . '/css/themes/medieval.css',
];
$snapCssVersion = time();
$snapCssMtimes = array_filter(array_map(function ($f) { return file_exists($f) ? filemtime($f) : 0; }, $snapCssFiles));
if ($snapCssMtimes) { $snapCssVersion = max($snapCssMtimes); }
function snapCssV($path) {
    global $snapCssVersion;
    $abs = __DIR__ . '/' . $path;
    return file_exists($abs) ? filemtime($abs) : $snapCssVersion;
}
?>
<link rel="stylesheet" href="css/snapshots.css?v=<?= snapCssV('css/snapshots.css') ?>" />
<!-- Thèmes graphiques Bleu/Médiéval (cf. CONTEXT.md §32) — page chargée soit en URL
     directe, soit dans l'<iframe> de snapshotGallery.js (game.php) : même origine,
     donc même localStorage['hexistenz_theme'] que le reste du jeu. Bug signalé
     2026-07-17 : la mosaïque restait sombre (thème bleu figé) même quand le cadre
     de l'overlay parent passait en parchemin — cette page n'avait aucune plomberie
     de thème. Même pattern précoce que game.php/index.php pour éviter le flash. -->
<link rel="stylesheet" href="css/themes/bleu.css?v=<?= snapCssV('css/themes/bleu.css') ?>" />
<link rel="stylesheet" href="css/themes/medieval.css?v=<?= snapCssV('css/themes/medieval.css') ?>" />
<script>
  (function() {
    var th = localStorage.getItem('hexistenz_theme');
    if (th !== 'bleu' && th !== 'ancien') {
      var ua = navigator.userAgent || '';
      var isMobile = (navigator.userAgentData && typeof navigator.userAgentData.mobile === 'boolean')
        ? navigator.userAgentData.mobile
        : /Android|iPhone|iPad|iPod|Mobile|Windows Phone/i.test(ua);
      th = isMobile ? 'bleu' : 'ancien';
    }
    document.documentElement.dataset.theme = th;
  })();
</script>
</head>
<body>
  <div id="galleryRoot" class="gallery-root">
    <header class="gallery-header">
      <h1 id="galleryTitle" class="gallery-title">Galerie de captures</h1>
      <span id="galleryCount" class="gallery-count"></span>
    </header>
    <div id="galleryGrid" class="gallery-grid"></div>
    <p id="galleryEmpty" class="gallery-empty" hidden></p>
    <div id="galleryScrollSentinel" class="gallery-scroll-sentinel"></div>
  </div>

  <div id="galleryViewer" class="gallery-viewer" hidden>
    <button id="galleryViewerPrev" class="gallery-viewer-nav gallery-viewer-prev" type="button" aria-label="Précédente">‹</button>
    <img id="galleryViewerImg" class="gallery-viewer-img" alt="" />
    <button id="galleryViewerNext" class="gallery-viewer-nav gallery-viewer-next" type="button" aria-label="Suivante">›</button>
    <div id="galleryViewerCaption" class="gallery-viewer-caption"></div>
  </div>

  <script type="application/json" id="snap-data"><?= json_encode($items, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?></script>
  <?php
  // 2026-07-29 — même cache-busting que les CSS ci-dessus, cette fois pour
  // json/languages/*.json (fetch côté client par snapshotsPage.js) — cf.
  // gameLangReactive.js::getLangVersion() et game.php pour le pattern jumeau.
  $snapLangFiles = glob(__DIR__ . '/json/languages/*.json') ?: [];
  $snapLangVersion = time();
  $snapLangMtimes = array_filter(array_map('filemtime', $snapLangFiles));
  if ($snapLangMtimes) { $snapLangVersion = max($snapLangMtimes); }
  ?>
  <script>window.HEXISTENZ_LANG_VERSION = <?= json_encode((string) $snapLangVersion) ?>;</script>
  <script type="module" src="javascript/snapshotsPage.js?v=<?= file_exists(__DIR__ . '/javascript/snapshotsPage.js') ? filemtime(__DIR__ . '/javascript/snapshotsPage.js') : time() ?>"></script>
</body>
</html>
