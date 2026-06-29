<?php
ini_set('display_errors', 0);
error_reporting(E_ALL);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$rootDir = __DIR__;
$gamesDir = $rootDir . DIRECTORY_SEPARATOR . 'json' . DIRECTORY_SEPARATOR . 'games';

try {
    if (!is_dir($gamesDir)) {
        if (!mkdir($gamesDir, 0775, true) && !is_dir($gamesDir)) {
            respond(false, 'Impossible de créer le dossier /json/games.', 500, array('gamesDir' => $gamesDir));
        }
    }

    if (!is_writable($gamesDir)) {
        respond(false, 'Le dossier /json/games existe mais il n’est pas inscriptible par PHP.', 500, array('gamesDir' => $gamesDir));
    }

    $method = isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : 'GET';
    $payload = array();

    if ($method === 'POST') {
        $raw = file_get_contents('php://input');
        $payload = json_decode($raw ? $raw : '{}', true);
        if (!is_array($payload)) {
            respond(false, 'JSON POST invalide.', 400);
        }
    } else {
        $payload = $_GET;
    }

    $action = strtolower(trim((string)get_value($payload, 'action', '')));
    $code = normalize_code(get_value($payload, 'code', ''));
    $playerId = normalize_player_id(get_value($payload, 'playerId', ''));
    $playerName = trim((string)get_value($payload, 'playerName', 'Joueur'));
    if ($playerName === '') $playerName = 'Joueur';
    if (function_exists('mb_substr')) $playerName = mb_substr($playerName, 0, 24);
    else $playerName = substr($playerName, 0, 24);

    if ($action === '') respond(false, 'Action manquante.', 400);

    if ($action === 'list') {
        respond(true, null, 200, array('rooms' => list_room_details($gamesDir)));
    }

    if ($code === '') respond(false, 'Code partie manquant.', 400);

    if ($action === 'poll') {
        // Lecture seule, mais on verrouille quand même pour ne jamais lire un fichier en cours d’écriture.
        with_room_lock($gamesDir, $code, function () use ($gamesDir, $code) {
            $path = existing_room_path($gamesDir, $code);
            if (!$path) respond(false, "Partie $code introuvable sur le serveur PHP dans /json/games.", 404, debug_paths($gamesDir, $code));
            respond(true, null, 200, array('room' => read_room($path)));
        });
    }

    if ($playerId === '') respond(false, 'playerId manquant.', 400);

    with_room_lock($gamesDir, $code, function () use ($gamesDir, $code, $action, $playerId, $playerName, $payload) {
        if ($action === 'create') {
            $state = get_value($payload, 'state', null);
            if (!is_array($state)) respond(false, 'Snapshot initial manquant.', 400);
            create_room($gamesDir, $code, $playerId, $playerName, $state);
            return;
        }

        if ($action === 'join') {
            $playerState = get_value($payload, 'playerState', array());
            if (!is_array($playerState)) $playerState = array();
            join_room($gamesDir, $code, $playerId, $playerName, $playerState);
            return;
        }

        if ($action === 'state') {
            $state = get_value($payload, 'state', null);
            if (!is_array($state)) respond(false, 'Snapshot état manquant.', 400);
            update_state($gamesDir, $code, $playerId, $state);
            return;
        }

        if ($action === 'cursor') {
            $cursor = get_value($payload, 'cursor', array());
            if (!is_array($cursor)) $cursor = array();
            update_cursor($gamesDir, $code, $playerId, $cursor);
            return;
        }

        respond(false, 'Action inconnue.', 400);
    });
} catch (Exception $error) {
    respond(false, 'Erreur PHP multiplayer : ' . $error->getMessage(), 500, array('file' => basename(__FILE__)));
}

function create_room($gamesDir, $code, $playerId, $playerName, $state) {
    $path = room_path($gamesDir, $code);
    if (file_exists($path)) respond(false, "Partie $code existe déjà.", 409, debug_paths($gamesDir, $code));

    $now = time();
    $nowMs = ms_now();

    $state['schemaVersion'] = isset($state['schemaVersion']) ? $state['schemaVersion'] : 1;
    $state['roomCode'] = $code;
    $state['createdAt'] = isset($state['createdAt']) ? $state['createdAt'] : $nowMs;
    $state['updatedAt'] = $nowMs;
    if (!isset($state['players']) || !is_array($state['players'])) $state['players'] = array();
    if (!isset($state['cursors']) || !is_array($state['cursors'])) $state['cursors'] = array();

    $state['players'][$playerId] = array_merge(
        isset($state['players'][$playerId]) && is_array($state['players'][$playerId]) ? $state['players'][$playerId] : array(),
        array(
            'id' => $playerId,
            'name' => $playerName,
            'lastSeen' => $nowMs
        )
    );

    $room = array(
        'code' => $code,
        'createdAt' => $now,
        'updatedAt' => $now,
        'players' => array(
            $playerId => array(
                'id' => $playerId,
                'name' => $playerName,
                'lastSeen' => $now
            )
        ),
        'cursors' => array(),
        'state' => $state
    );

    sync_top_level_state($room);
    write_room_unlocked($path, $room);
    respond(true, null, 200, array('room' => $room));
}

function join_room($gamesDir, $code, $playerId, $playerName, $playerState) {
    $path = existing_room_path($gamesDir, $code);
    if (!$path) {
        respond(false, "Partie $code introuvable sur le serveur PHP dans /json/games. Crée-la d'abord.", 404, debug_paths($gamesDir, $code));
    }

    $room = read_room($path);
    $now = time();
    $nowMs = ms_now();

    if (!isset($room['state']) || !is_array($room['state'])) {
        respond(false, "Partie $code trouvée, mais elle n'a pas de snapshot complet. Ancien JSON refusé.", 409);
    }

    if (!isset($room['players']) || !is_array($room['players'])) $room['players'] = array();
    if (!isset($room['cursors']) || !is_array($room['cursors'])) $room['cursors'] = array();
    if (!isset($room['state']['players']) || !is_array($room['state']['players'])) $room['state']['players'] = array();
    if (!isset($room['state']['cursors']) || !is_array($room['state']['cursors'])) $room['state']['cursors'] = array();

    $room['updatedAt'] = $now;
    $room['players'][$playerId] = array(
        'id' => $playerId,
        'name' => $playerName,
        'lastSeen' => $now
    );

    $existingPlayer = isset($room['state']['players'][$playerId]) && is_array($room['state']['players'][$playerId])
        ? $room['state']['players'][$playerId]
        : array();

    $providedDeck = isset($playerState['deck']) && is_array($playerState['deck']) ? $playerState['deck'] : null;

    $room['state']['players'][$playerId] = array_merge(
        $existingPlayer,
        $playerState,
        array(
            'id' => $playerId,
            'name' => $playerName,
            'lastSeen' => $nowMs,
            'deck' => isset($existingPlayer['deck']) && is_array($existingPlayer['deck']) ? $existingPlayer['deck'] : ($providedDeck ? $providedDeck : array()),
            'rotationIndex' => isset($existingPlayer['rotationIndex']) ? $existingPlayer['rotationIndex'] : (isset($playerState['rotationIndex']) ? $playerState['rotationIndex'] : 0)
        )
    );

    $room['state']['roomCode'] = $code;
    $room['state']['updatedAt'] = $nowMs;

    sync_top_level_state($room);
    write_room_unlocked($path, $room);
    respond(true, null, 200, array('room' => $room));
}

function update_state($gamesDir, $code, $playerId, $state) {
    $path = existing_room_path($gamesDir, $code);
    if (!$path) respond(false, "Partie $code introuvable sur le serveur PHP dans /json/games.", 404, debug_paths($gamesDir, $code));

    $room = read_room($path);
    if (!isset($room['players'][$playerId])) respond(false, 'Joueur absent de cette partie.', 403);

    // Important : on conserve la liste serveur des joueurs/cursors si le snapshot client est incomplet.
    if (!isset($state['players']) || !is_array($state['players'])) $state['players'] = isset($room['state']['players']) ? $room['state']['players'] : array();
    else $state['players'] = array_merge(isset($room['state']['players']) && is_array($room['state']['players']) ? $room['state']['players'] : array(), $state['players']);

    if (!isset($state['cursors']) || !is_array($state['cursors'])) $state['cursors'] = isset($room['state']['cursors']) ? $room['state']['cursors'] : array();

    $previousVersion = isset($room['state']['stateVersion']) ? (int)$room['state']['stateVersion'] : 0;
    $incomingVersion = isset($state['stateVersion']) ? (int)$state['stateVersion'] : 0;

    $room['state'] = $state;
    $room['state']['roomCode'] = $code;
    // Version serveur monotone : évite que deux clients écrasent l'horloge d'état avec une vieille valeur.
    $room['state']['stateVersion'] = max($previousVersion, $incomingVersion) + 1;
    $room['state']['updatedAt'] = ms_now();
    $room['updatedAt'] = time();
    $room['players'][$playerId]['lastSeen'] = time();

    sync_top_level_state($room);
    write_room_unlocked($path, $room);
    respond(true, null, 200, array('room' => $room));
}

function update_cursor($gamesDir, $code, $playerId, $cursor) {
    $path = existing_room_path($gamesDir, $code);
    if (!$path) respond(false, "Partie $code introuvable sur le serveur PHP dans /json/games.", 404, debug_paths($gamesDir, $code));

    $room = read_room($path);
    if (!isset($room['players'][$playerId])) respond(false, 'Joueur absent de cette partie.', 403);

    if (!isset($room['cursors']) || !is_array($room['cursors'])) $room['cursors'] = array();
    if (!isset($room['state']) || !is_array($room['state'])) $room['state'] = array();
    if (!isset($room['state']['cursors']) || !is_array($room['state']['cursors'])) $room['state']['cursors'] = array();

    $cursor['playerId'] = $playerId;
    $cursor['updatedAt'] = ms_now();

    $room['cursors'][$playerId] = $cursor;
    $room['state']['cursors'][$playerId] = $cursor;
    $room['updatedAt'] = time();
    $room['players'][$playerId]['lastSeen'] = time();
    if (isset($room['state']['players'][$playerId])) $room['state']['players'][$playerId]['lastSeen'] = ms_now();

    write_room_unlocked($path, $room);
    respond(true, null, 200, array('room' => $room));
}

function sync_top_level_state(&$room) {
    if (!isset($room['state']) || !is_array($room['state'])) return;
    $keys = array('schemaVersion', 'stateVersion', 'totalScore', 'gameOver', 'placedTiles', 'placementHistory', 'specialCells', 'bonusCells', 'missionManager', 'stats');
    foreach ($keys as $key) {
        if (array_key_exists($key, $room['state'])) $room[$key] = $room['state'][$key];
    }
}

function with_room_lock($gamesDir, $code, $callback) {
    // Un seul verrou global, supprimé même si respond() fait exit.
    // Important : les callbacks répondent directement puis quittent le script.
    $lockPath = $gamesDir . DIRECTORY_SEPARATOR . '.multiplayer.lock';
    // Mode 'a' (append) : crée si absent, ne tronque pas, universellement supporté.
    // 'c' n'est pas disponible sur toutes les configs PHP/serveur → évité.
    $handle = fopen($lockPath, 'a');
    if (!$handle) respond(false, 'Impossible de créer le verrou multiplayer dans /json/games.', 500, array('lockPath' => $lockPath));

    register_shutdown_function(function () use ($handle, $lockPath) {
        @flock($handle, LOCK_UN);
        @fclose($handle);
        @unlink($lockPath);
    });

    if (!flock($handle, LOCK_EX)) {
        respond(false, 'Impossible de verrouiller le multiplayer.', 500, array('lockPath' => $lockPath));
    }

    $callback();
}
function room_path($gamesDir, $code) {
    return $gamesDir . DIRECTORY_SEPARATOR . 'room_' . $code . '.json';
}

function existing_room_path($gamesDir, $code) {
    $path = room_path($gamesDir, $code);
    if (file_exists($path)) return $path;

    // Tolérance : anciens fichiers en minuscule/casse bizarre.
    $wanted = 'room_' . strtoupper($code) . '.json';
    $matches = glob($gamesDir . DIRECTORY_SEPARATOR . 'room_*.json', GLOB_NOSORT);
    if (is_array($matches)) {
        foreach ($matches as $candidate) {
            if (strtoupper(basename($candidate)) === $wanted) return $candidate;
        }
    }

    return null;
}

function read_room($path) {
    $json = file_get_contents($path);
    if ($json === false || trim($json) === '') respond(false, 'Fichier de partie vide ou illisible.', 500, array('path' => $path));
    $room = json_decode($json, true);
    if (!is_array($room)) respond(false, 'Fichier de partie JSON invalide.', 500, array('path' => $path, 'jsonError' => function_exists('json_last_error_msg') ? json_last_error_msg() : json_last_error()));
    return $room;
}

function write_room_unlocked($path, $room) {
    $json = json_encode($room, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) respond(false, 'Impossible de sérialiser la partie.', 500, array('jsonError' => function_exists('json_last_error_msg') ? json_last_error_msg() : json_last_error()));

    $tmp = $path . '.' . getmypid() . '.' . str_replace('.', '', uniqid('', true)) . '.tmp';
    if (file_put_contents($tmp, $json . PHP_EOL, LOCK_EX) === false) {
        respond(false, 'Impossible d’écrire le fichier temporaire de partie dans /json/games.', 500, array('tmp' => $tmp, 'writableDir' => is_writable(dirname($path))));
    }

    if (!rename($tmp, $path)) {
        @unlink($tmp);
        respond(false, 'Impossible de finaliser le fichier de partie dans /json/games.', 500, array('path' => $path));
    }
}

function normalize_code($code) {
    $code = strtoupper(trim((string)$code));
    $code = preg_replace('/[^A-Z0-9]/', '', $code);
    return substr($code, 0, 12);
}

function normalize_player_id($id) {
    $id = trim((string)$id);
    $id = preg_replace('/[^a-zA-Z0-9_\-]/', '', $id);
    return substr($id, 0, 80);
}

function ms_now() {
    return (int)round(microtime(true) * 1000);
}

function get_value($array, $key, $default) {
    return is_array($array) && array_key_exists($key, $array) ? $array[$key] : $default;
}

function debug_paths($gamesDir, $code) {
    return array(
        'gamesDir' => $gamesDir,
        'roomPath' => room_path($gamesDir, $code),
        'gamesExists' => is_dir($gamesDir),
        'gamesWritable' => is_writable($gamesDir),
        'existingRooms' => list_room_codes($gamesDir)
    );
}

function list_room_codes($gamesDir) {
    $codes = array();
    $matches = glob($gamesDir . DIRECTORY_SEPARATOR . 'room_*.json', GLOB_NOSORT);
    if (is_array($matches)) {
        foreach ($matches as $path) {
            if (preg_match('/^room_([A-Z0-9]+)\.json$/i', basename($path), $m)) $codes[] = strtoupper($m[1]);
        }
    }
    sort($codes);
    return $codes;
}

function list_room_details($gamesDir) {
    $rooms = array();
    $matches = glob($gamesDir . DIRECTORY_SEPARATOR . 'room_*.json', GLOB_NOSORT);
    if (is_array($matches)) {
        foreach ($matches as $path) {
            if (!preg_match('/^room_([A-Z0-9]+)\.json$/i', basename($path), $m)) continue;
            $code = strtoupper($m[1]);
            $updatedAt = @filemtime($path);
            $players = 0;
            $tiles = 0;
            $score = 0;

            $json = @file_get_contents($path);
            $room = $json ? json_decode($json, true) : null;
            if (is_array($room)) {
                if (isset($room['updatedAt'])) $updatedAt = (int)$room['updatedAt'];
                if (isset($room['players']) && is_array($room['players'])) $players = count($room['players']);
                elseif (isset($room['state']['players']) && is_array($room['state']['players'])) $players = count($room['state']['players']);

                if (isset($room['state']['placedTiles']) && is_array($room['state']['placedTiles'])) $tiles = count($room['state']['placedTiles']);
                elseif (isset($room['placedTiles']) && is_array($room['placedTiles'])) $tiles = count($room['placedTiles']);

                if (isset($room['state']['totalScore'])) $score = (int)$room['state']['totalScore'];
                elseif (isset($room['totalScore'])) $score = (int)$room['totalScore'];
            }

            $rooms[] = array(
                'code' => $code,
                'updatedAt' => $updatedAt ? (int)$updatedAt : 0,
                'players' => $players,
                'tiles' => $tiles,
                'score' => $score
            );
        }
    }

    usort($rooms, function ($a, $b) {
        return (int)$b['updatedAt'] - (int)$a['updatedAt'];
    });
    return $rooms;
}

function respond($ok, $error = null, $status = 200, $extra = array()) {
    http_response_code($status);
    echo json_encode(array_merge(array('ok' => $ok, 'error' => $error), $extra), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
