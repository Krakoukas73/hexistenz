<?php

ini_set('display_errors', 1);
error_reporting(E_ALL);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$SCORE_FILE = __DIR__ . '/highscores.json';
$MAX_SCORES = 50;
$PUBLIC_LIMIT = 10;

if (!file_exists($SCORE_FILE)) {
    file_put_contents($SCORE_FILE, "[]", LOCK_EX);
}

if (!is_writable($SCORE_FILE)) {
    http_response_code(500);
    echo json_encode([
        'error' => 'highscores.json non inscriptible',
        'file' => $SCORE_FILE,
        'exists' => file_exists($SCORE_FILE),
        'writable_dir' => is_writable(__DIR__),
        'writable_file' => is_writable($SCORE_FILE)
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $raw = file_get_contents('php://input');
        $payload = json_decode($raw ?: '{}', true);

        if (!is_array($payload)) {
            http_response_code(400);
            echo json_encode(['error' => 'JSON invalide'], JSON_UNESCAPED_UNICODE);
            exit;
        }

        $name = sanitize_name(isset($payload['name']) ? (string)$payload['name'] : 'Joueur');

        $score = filter_var($payload['score'] ?? null, FILTER_VALIDATE_INT, [
            'options' => [
                'min_range' => 0,
                'max_range' => 999999999
            ]
        ]);

        if ($score === false) {
            http_response_code(400);
            echo json_encode(['error' => 'Score invalide'], JSON_UNESCAPED_UNICODE);
            exit;
        }

        $gridPercent = normalize_grid_percent($payload['gridPercent'] ?? 0);
        $stats = sanitize_stats($payload['stats'] ?? null);

        $scores = read_scores($SCORE_FILE);
        $scores[] = [
            'name' => $name,
            'score' => (int)$score,
            'gridPercent' => $gridPercent,
            'stats' => $stats,
            'date' => gmdate('c')
        ];

        $scores = sort_scores($scores);
        $scores = array_slice($scores, 0, $MAX_SCORES);

        write_scores($SCORE_FILE, $scores);

        echo json_encode([
            'scores' => public_scores($scores, $PUBLIC_LIMIT)
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        echo json_encode([
            'scores' => public_scores(read_scores($SCORE_FILE), $PUBLIC_LIMIT)
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    http_response_code(405);
    echo json_encode(['error' => 'Méthode interdite'], JSON_UNESCAPED_UNICODE);
    exit;

} catch (Exception $error) {
    http_response_code(500);
    echo json_encode([
        'error' => 'Erreur highscore',
        'details' => $error->getMessage()
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

function normalize_grid_percent($value)
{
    if (!is_numeric($value)) {
        return 0.0;
    }

    $number = (float)$value;
    if ($number < 0) {
        $number = 0;
    }
    if ($number > 100) {
        $number = 100;
    }

    return round($number, 1);
}


function sanitize_stats($stats)
{
    $types = ['grass', 'field', 'forest', 'house', 'water', 'rail'];

    if (!is_array($stats)) {
        return null;
    }

    $clean = [
        'tiles' => clamp_int($stats['tiles'] ?? 0),
        'trainLines' => clamp_int($stats['trainLines'] ?? 0),
        'totals' => [],
        'largest' => []
    ];

    foreach ($types as $type) {
        $clean['totals'][$type] = clamp_int($stats['totals'][$type] ?? 0);
        $clean['largest'][$type] = clamp_int($stats['largest'][$type] ?? 0);
    }

    return $clean;
}

function clamp_int($value)
{
    if (!is_numeric($value)) {
        return 0;
    }

    $number = (int)$value;
    if ($number < 0) {
        return 0;
    }
    if ($number > 999999) {
        return 999999;
    }

    return $number;
}

function sanitize_name($name)
{
    $name = trim($name);
    $name = preg_replace('/[^\p{L}\p{N}\s._-]/u', '', $name);

    if (function_exists('mb_substr')) {
        $name = mb_substr($name, 0, 20);
    } else {
        $name = substr($name, 0, 20);
    }

    return $name !== '' ? $name : 'Joueur';
}

function read_scores($file)
{
    if (!file_exists($file)) {
        return [];
    }

    $content = file_get_contents($file);

    if ($content === false || trim($content) === '') {
        return [];
    }

    $scores = json_decode($content, true);

    if (!is_array($scores)) {
        return [];
    }

    $clean = [];

    foreach ($scores as $entry) {
        if (
            is_array($entry)
            && isset($entry['name'])
            && isset($entry['score'])
            && is_numeric($entry['score'])
        ) {
            $clean[] = [
                'name' => (string)$entry['name'],
                'score' => (int)$entry['score'],
                'gridPercent' => normalize_grid_percent($entry['gridPercent'] ?? 0),
                'stats' => sanitize_stats($entry['stats'] ?? null),
                'date' => isset($entry['date']) ? (string)$entry['date'] : ''
            ];
        }
    }

    return sort_scores($clean);
}

function write_scores($file, $scores)
{
    $json = json_encode($scores, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);

    if ($json === false) {
        throw new Exception('Encodage JSON impossible');
    }

    if (file_put_contents($file, $json . PHP_EOL, LOCK_EX) === false) {
        throw new Exception('Écriture highscore impossible');
    }
}

function sort_scores($scores)
{
    usort($scores, function ($a, $b) {
        return ((int)$b['score']) - ((int)$a['score']);
    });

    return $scores;
}

function public_scores($scores, $limit)
{
    $scores = sort_scores($scores);
    $scores = array_slice($scores, 0, $limit);

    $public = [];

    foreach ($scores as $entry) {
        $public[] = [
            'name' => (string)$entry['name'],
            'score' => (int)$entry['score'],
            'gridPercent' => normalize_grid_percent($entry['gridPercent'] ?? 0),
            'stats' => sanitize_stats($entry['stats'] ?? null),
            'date' => isset($entry['date']) ? (string)$entry['date'] : ''
        ];
    }

    return $public;
}


?>