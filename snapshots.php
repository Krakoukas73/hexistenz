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

$snapDir = __DIR__ . DIRECTORY_SEPARATOR . 'snapshots';
$items = array();

if (is_dir($snapDir)) {
    $files = glob($snapDir . DIRECTORY_SEPARATOR . '*.jpg');
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

            $items[] = array(
                'url'   => 'snapshots/' . rawurlencode($basename),
                'date'  => $meta['date'],
                'tiles' => $meta['tiles'],
                'mode'  => $meta['mode'],
            );
        }
    }
}
?><!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>Hexistenz — Galerie de captures</title>
<link rel="stylesheet" href="css/snapshots.css" />
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
  <script type="module" src="javascript/snapshotsPage.js"></script>
</body>
</html>
