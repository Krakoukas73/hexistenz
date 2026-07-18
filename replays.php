<?php
// ─── replays.php — galerie des parties rejouables (replay accéléré) ──────────────────
// Page dédiée, utilisable seule (URL directe) OU chargée dans un <iframe> par
// replayGallery.js pour s'afficher en overlay par-dessus le jeu sans quitter la partie
// en cours (même pattern que snapshots.php/snapshotGallery.js, 2026-07-15). Contrairement
// à snapshots.php, aucune donnée n'est scannée/embarquée côté PHP ici : la liste des
// parties vient de multiplayer.php?action=listall (javascript/replaysPage.js, fetch
// côté client) — une seule source de vérité pour le scan de /json/games.
ini_set('display_errors', 0);
error_reporting(E_ALL);
header('Cache-Control: no-store');
?><!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>Hexistenz — Galerie de replays</title>
<link rel="stylesheet" href="css/replays.css" />
</head>
<body>
  <div id="galleryRoot" class="gallery-root">
    <header class="gallery-header">
      <h1 id="galleryTitle" class="gallery-title">Galerie de replays</h1>
      <span id="galleryCount" class="gallery-count"></span>
    </header>
    <div id="galleryGrid" class="gallery-grid"></div>
    <p id="galleryEmpty" class="gallery-empty" hidden></p>
  </div>

  <script type="module" src="javascript/replaysPage.js?v=<?= file_exists(__DIR__ . '/javascript/replaysPage.js') ? filemtime(__DIR__ . '/javascript/replaysPage.js') : time() ?>"></script>
</body>
</html>
