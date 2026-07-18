<?php
// ─── snapshotThumb.php — génération de miniature JPEG, partagée entre snapshot.php ─────
// (à l'upload) et snapshots.php (backfill des captures existantes sans miniature).
// Ajouté le 2026-07-15 : la galerie servait les JPEG pleine résolution comme miniatures
// (7 captures ≈ 7 Mo chargés d'un coup) — chaque miniature est désormais limitée à
// 480px de large et recompressée à qualité 72, écrite dans /snapshots/thumbs/<même nom>.
//
// 🐛 Fix 2026-07-15 (bis) : la 1re version ne testait que function_exists('imagecreatefromjpeg'),
// ce qui suffit à passer un serveur où l'extension GD est chargée MAIS compilée sans
// libjpeg — dans ce cas précis, imagecreatefromjpeg()/imagejpeg() sont bel et bien
// indéfinies, function_exists() renvoie déjà false et on retombait silencieusement sur
// l'image pleine résolution SANS aucune trace exploitable (dossier /thumbs resté vide,
// galerie continuant d'afficher le JPEG lourd — symptôme signalé par l'utilisateur).
// Corrigé par : (1) repli sur Imagick si GD est indisponible/incomplet, (2) journalisation
// systématique de la raison d'échec dans /snapshots/thumb_debug.log (best-effort, jamais
// fatal) pour diagnostiquer sans deviner la prochaine fois qu'un souci de ce genre survient.
//
// 🐛 Fix 2026-07-15 (ter) : le log confirme sur le serveur de prod que NI GD NI Imagick
// ne sont disponibles (`GD indisponible... extension_loaded=0` puis `Imagick également
// indisponible`). Ajout d'une 3e voie : appel d'un binaire externe (ImageMagick CLI,
// GraphicsMagick, ou ffmpeg) via exec(), souvent installé sur le système même quand les
// extensions PHP correspondantes ne le sont pas. Toujours best-effort : si exec() est
// désactivé (disable_functions) ou qu'aucun des binaires n'est présent, repli final sur
// l'image pleine résolution, comme avant.

function hexistenz_thumb_log($msg) {
    $logPath = __DIR__ . DIRECTORY_SEPARATOR . 'snapshots' . DIRECTORY_SEPARATOR . 'thumb_debug.log';
    @file_put_contents($logPath, '[' . gmdate('c') . '] ' . $msg . "\n", FILE_APPEND | LOCK_EX);
}

/**
 * Tente de générer la miniature via un binaire externe (ImageMagick/GraphicsMagick/ffmpeg),
 * quand ni GD ni l'extension Imagick ne sont disponibles. Best-effort : renvoie false
 * (avec log de la raison) si exec() est indisponible/désactivé ou si aucun binaire ne
 * produit de fichier de sortie exploitable.
 */
function hexistenz_thumb_via_exec($srcPath, $destPath, $maxWidth, $quality) {
    if (!function_exists('exec')) {
        hexistenz_thumb_log('exec() indisponible (fonction absente) — impossible de tenter un binaire externe');
        return false;
    }
    $disabled = array_map('trim', explode(',', (string)ini_get('disable_functions')));
    if (in_array('exec', $disabled, true)) {
        hexistenz_thumb_log('exec() désactivé via disable_functions — impossible de tenter un binaire externe');
        return false;
    }

    $tmpPath = $destPath . '.tmp';
    @unlink($tmpPath);
    $srcEsc = escapeshellarg($srcPath);
    $tmpEsc = escapeshellarg($tmpPath);
    $w      = (int)$maxWidth;
    $q      = (int)$quality;

    // Tentatives successives : ImageMagick (convert, puis magick sur les versions
    // récentes qui renomment/dépréciassent "convert"), GraphicsMagick, ffmpeg.
    $commands = array(
        'convert' => "convert $srcEsc -auto-orient -resize {$w}x -quality $q $tmpEsc",
        'magick'  => "magick $srcEsc -auto-orient -resize {$w}x -quality $q $tmpEsc",
        'gm'      => "gm convert $srcEsc -auto-orient -resize {$w}x -quality $q $tmpEsc",
        'ffmpeg'  => "ffmpeg -y -i $srcEsc -vf \"scale='min($w,iw)':-2\" -q:v 5 $tmpEsc",
    );

    foreach ($commands as $label => $cmd) {
        @unlink($tmpPath);
        $output = array();
        $exitCode = -1; // sentinelle : si exec() est un no-op silencieux (sandbox/exec bridé),
                        // $exitCode ne sera jamais réassigné et restera visiblement anormal dans le log.
        @exec($cmd . ' 2>&1', $output, $exitCode);
        $firstLine = isset($output[0]) ? substr($output[0], 0, 200) : '(aucune sortie)';
        if ($exitCode === 0 && is_file($tmpPath) && filesize($tmpPath) > 0) {
            if (@rename($tmpPath, $destPath)) {
                hexistenz_thumb_log("binaire externe \"$label\" OK pour " . basename($srcPath));
                return true;
            }
        }
        // Preuve exploitable pour l'hébergeur : code de sortie + 1re ligne de sortie par binaire testé.
        hexistenz_thumb_log("binaire externe \"$label\" en échec (exitCode=$exitCode) : $firstLine");
    }
    @unlink($tmpPath);
    hexistenz_thumb_log('aucun binaire externe utilisable (convert/magick/gm/ffmpeg absents ou en échec) pour ' . basename($srcPath));
    return false;
}

/**
 * Génère une miniature JPEG redimensionnée à $maxWidth (ratio conservé) et
 * recompressée à $quality. Écriture atomique (tmp + rename), même pattern que
 * snapshot.php/multiplayer.php. Essaie GD, puis Imagick, puis un binaire externe
 * (convert/magick/gm/ffmpeg) ; journalise la raison précise en cas d'échec de
 * chaque voie.
 *
 * @return bool true si la miniature a été créée avec succès.
 */
function hexistenz_generate_thumbnail($srcPath, $destPath, $maxWidth = 480, $quality = 72) {
    if (!is_file($srcPath)) {
        hexistenz_thumb_log("source introuvable : $srcPath");
        return false;
    }

    // ── Voie 1 : GD, avec vérification explicite du support JPEG ──────────────────
    // extension_loaded('gd') seul ne suffit pas : certains builds GD sont compilés
    // sans libjpeg, auquel cas imagecreatefromjpeg()/imagejpeg() n'existent tout
    // simplement pas (function_exists() renvoie false), même si l'extension est chargée.
    $gdJpegOk = extension_loaded('gd') && function_exists('imagecreatefromjpeg') && function_exists('imagejpeg');
    if ($gdJpegOk) {
        $info = @getimagesize($srcPath);
        if ($info && $info[0] > 0 && $info[1] > 0) {
            list($srcW, $srcH) = $info;
            $src = @imagecreatefromjpeg($srcPath);
            if ($src) {
                if ($srcW > $maxWidth) {
                    $newW = $maxWidth;
                    $newH = (int)round($srcH * ($maxWidth / $srcW));
                } else {
                    // Déjà assez petite en largeur : pas d'agrandissement, simple
                    // recompression à la qualité cible (gain non négligeable quand même).
                    $newW = $srcW;
                    $newH = $srcH;
                }
                $newW = max(1, $newW);
                $newH = max(1, $newH);

                $dst = imagecreatetruecolor($newW, $newH);
                imagecopyresampled($dst, $src, 0, 0, 0, 0, $newW, $newH, $srcW, $srcH);

                $tmpPath = $destPath . '.tmp';
                $ok = @imagejpeg($dst, $tmpPath, $quality);
                imagedestroy($src);
                imagedestroy($dst);

                if ($ok && @rename($tmpPath, $destPath)) return true;
                @unlink($tmpPath);
                hexistenz_thumb_log("GD : échec imagejpeg/rename pour $srcPath");
            } else {
                hexistenz_thumb_log("GD : imagecreatefromjpeg() a échoué pour $srcPath");
            }
        } else {
            hexistenz_thumb_log("GD : getimagesize() invalide pour $srcPath");
        }
    } else {
        hexistenz_thumb_log('GD indisponible ou sans support JPEG (extension_loaded=' . (extension_loaded('gd') ? '1' : '0') . ') — tentative Imagick');
    }

    // ── Voie 2 : Imagick, souvent présent même quand GD est absent/incomplet ─────
    if (class_exists('Imagick')) {
        try {
            $im = new Imagick($srcPath);
            $w  = $im->getImageWidth();
            $h  = $im->getImageHeight();
            if ($w > $maxWidth) {
                $newH = (int)round($h * ($maxWidth / $w));
                $im->resizeImage($maxWidth, max(1, $newH), Imagick::FILTER_LANCZOS, 1);
            }
            $im->setImageCompressionQuality($quality);
            $im->setImageFormat('jpeg');
            $tmpPath = $destPath . '.tmp';
            $im->writeImage($tmpPath);
            $im->destroy();
            if (@rename($tmpPath, $destPath)) return true;
            @unlink($tmpPath);
            hexistenz_thumb_log("Imagick : échec rename pour $srcPath");
        } catch (\Throwable $e) {
            hexistenz_thumb_log('Imagick : exception — ' . $e->getMessage());
        }
    } else {
        hexistenz_thumb_log('Imagick également indisponible — tentative binaire externe');
    }

    // ── Voie 3 : binaire externe (convert/magick/gm/ffmpeg) ───────────────────────
    if (hexistenz_thumb_via_exec($srcPath, $destPath, $maxWidth, $quality)) {
        return true;
    }

    hexistenz_thumb_log('aucune voie de génération disponible (GD/Imagick/binaire externe) pour ' . basename($srcPath) . ' — repli sur image pleine résolution');
    return false;
}
