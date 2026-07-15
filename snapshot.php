<?php
// ─── snapshot.php — reçoit un JPEG (corps brut POST) et l'enregistre dans /snapshots ──
// Convention de réponse volontairement autonome ({success, filename} / {success:false,
// message}), distincte de multiplayer.php ({ok, error, ...}) ou highscore.php (ad-hoc) :
// endpoint neuf, appelé uniquement par snapshotCapture.js, pas de contrat partagé à
// respecter. cf. CONTEXT.md §21 (2026-07-14/15).
//
// Métadonnées de partie (2026-07-15, pour la galerie snapshots.php) : le corps POST
// reste le JPEG brut (pas de passage à multipart/form-data, pour ne pas retoucher le
// flux canvas.toBlob() existant) — tiles/mode arrivent en query string
// (?tiles=386&mode=bouliste) et sont persistés dans un sidecar .json (même basename
// que le .jpg), écrit avec le même pattern atomique tmp+rename. La galerie lit ce
// sidecar pour afficher "Partie de N tuiles · Mode bouliste" sans dépendre du nom de
// fichier ni d'une base de données.
ini_set('display_errors', 0);
error_reporting(E_ALL);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function respond_snap($success, $message = null, $status = 200, $extra = array()) {
    http_response_code($status);
    echo json_encode(array_merge(array('success' => $success, 'message' => $message), $extra), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

if (!isset($_SERVER['REQUEST_METHOD']) || $_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond_snap(false, 'Méthode interdite (POST attendu).', 405);
}

$rootDir = __DIR__;
$snapDir = $rootDir . DIRECTORY_SEPARATOR . 'snapshots';

if (!is_dir($snapDir)) {
    if (!mkdir($snapDir, 0775, true) && !is_dir($snapDir)) {
        respond_snap(false, 'Impossible de créer le dossier /snapshots.', 500);
    }
}

if (!is_writable($snapDir)) {
    respond_snap(false, 'Le dossier /snapshots existe mais n’est pas inscriptible par PHP.', 500);
}

$raw = file_get_contents('php://input');
if ($raw === false || strlen($raw) === 0) {
    respond_snap(false, 'Corps de requête vide.', 400);
}

// Cap de sécurité : 15 Mo (une capture JPEG plein écran ne devrait jamais approcher ça)
$MAX_BYTES = 15 * 1024 * 1024;
if (strlen($raw) > $MAX_BYTES) {
    respond_snap(false, 'Capture trop volumineuse.', 413);
}

// Vérification du magic number JPEG (FF D8 FF) — refuse tout ce qui n'est pas un vrai JPEG
if (substr($raw, 0, 3) !== "\xFF\xD8\xFF") {
    respond_snap(false, 'Contenu invalide (JPEG attendu).', 400);
}

// Nom de fichier généré côté serveur uniquement — jamais de nom fourni par le client
$date = new DateTime('now', new DateTimeZone('UTC'));
$filename = 'hexistenz_' . $date->format('Ymd_His') . '_' . substr(bin2hex(random_bytes(3)), 0, 6) . '.jpg';
$filePath = $snapDir . DIRECTORY_SEPARATOR . $filename;

// Écriture atomique : fichier temporaire + rename (même pattern que multiplayer.php)
$tmpPath = $filePath . '.tmp';
if (file_put_contents($tmpPath, $raw, LOCK_EX) === false) {
    respond_snap(false, 'Échec de l’écriture de la capture sur le serveur.', 500);
}
if (!rename($tmpPath, $filePath)) {
    @unlink($tmpPath);
    respond_snap(false, 'Échec de la finalisation de la capture sur le serveur.', 500);
}

// Sidecar de métadonnées — meilleur effort : une capture sans métadonnées valides reste
// affichable dans la galerie (juste sans légende "Partie de N tuiles"), donc aucune
// erreur fatale ici si tiles/mode sont absents ou invalides.
$tiles = isset($_GET['tiles']) ? (int)$_GET['tiles'] : null;
if ($tiles !== null && ($tiles < 0 || $tiles > 999999)) {
    $tiles = null;
}
$mode = isset($_GET['mode']) ? $_GET['mode'] : null;
if ($mode !== 'bouliste' && $mode !== 'platiste') {
    $mode = null;
}

$meta = array(
    'date'  => $date->format('c'),
    'tiles' => $tiles,
    'mode'  => $mode,
);
$jsonPath = $snapDir . DIRECTORY_SEPARATOR . preg_replace('/\.jpg$/', '.json', $filename);
$jsonTmpPath = $jsonPath . '.tmp';
if (file_put_contents($jsonTmpPath, json_encode($meta, JSON_UNESCAPED_UNICODE), LOCK_EX) !== false) {
    @rename($jsonTmpPath, $jsonPath);
}

respond_snap(true, null, 200, array('filename' => $filename));
