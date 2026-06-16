<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$backgroundDir = __DIR__ . DIRECTORY_SEPARATOR . 'backgrounds';
$publicDir = 'backgrounds';
$allowedExtensions = array('avif', 'webp', 'png', 'jpg', 'jpeg', 'gif');
$images = array();

if (is_dir($backgroundDir) && is_readable($backgroundDir)) {
    $items = scandir($backgroundDir);
    if (is_array($items)) {
        foreach ($items as $item) {
            if ($item === '.' || $item === '..') continue;
            if (strpos($item, '/') !== false || strpos($item, '\\') !== false) continue;

            $path = $backgroundDir . DIRECTORY_SEPARATOR . $item;
            if (!is_file($path)) continue;

            $extension = strtolower(pathinfo($item, PATHINFO_EXTENSION));
            if (!in_array($extension, $allowedExtensions, true)) continue;

            $images[] = $publicDir . '/' . rawurlencode($item);
        }
    }
}

shuffle($images);

echo json_encode(array(
    'ok' => true,
    'images' => array_values($images)
), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
