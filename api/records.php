<?php
/**
 * ARC NETWORK - GLOBAL LEADERBOARD & RECORDS API (hardened v3)
 * Hostings con PHP (Hostinger): esta es la implementación persistente.
 *
 * - v3 signature: fnv1a(name|score|round|date|ts|nonce|wallet|salt)
 * - Wallet OBLIGATORIA (0x + 40 hex, o nombre.eth)
 * - Ventana de frescura de 10 min + nonce único por IP (anti-replay)
 * - Rate limit por IP (intervalo mínimo + tope diario)
 * - Plausibilidad de la puntuación según la ronda alcanzada
 * - Escrituras atómicas con LOCK_EX y ERROR VISIBLE si el disco no es escribible
 * - ?debug=1 devuelve diagnóstico de almacenamiento (útil para saber por qué
 *   no se guardaban records: casi siempre data/ sin permiso de escritura)
 *
 * NOTA: api/records.js (serverless Node) y api/records.node.js replican estas
 * mismas reglas a través de api/_records-core.js. Si cambias una regla aquí,
 * replica el cambio allí.
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Cache-Control: no-store');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    echo json_encode(['ok' => true]);
    exit;
}

$dataDir = __DIR__ . '/../data';
if (!is_dir($dataDir)) {
    @mkdir($dataDir, 0777, true);
}

$allTimeFile = $dataDir . '/leaderboard.json';
$weeklyFile = $dataDir . '/weekly.json';
$weeklyEpochFile = $dataDir . '/weekly_epoch.txt';
$rateFile = $dataDir . '/ratelimit.json';

$WEEK_MS = 7 * 24 * 60 * 60 * 1000;
$SEC_SALT = 'ARC_VIRUS_v5_SALT_9973';

// --- Hardening knobs ---
$FRESH_WINDOW_MS = 10 * 60 * 1000;   // signature freshness window
$MIN_POST_GAP_MS = 8000;             // min ms between POSTs per IP
$MAX_POSTS_PER_DAY = 200;            // daily cap per IP
$ABS_SCORE_CAP = 2000000;            // absolute score ceiling
$PER_ROUND_BUDGET = 6000;            // plausible score per round
$ROUND_GRACE = 20000;                // base headroom added to round budget
$MAX_BODY = 8192;

/** Diagnóstico del almacenamiento: la causa #1 de "no se guardan los records". */
function storageInfo($dataDir) {
    $exists = is_dir($dataDir);
    $writable = $exists && is_writable($dataDir);
    return [
        'backend' => 'php-filesystem',
        'persistent' => true,
        'dataDir' => $dataDir,
        'exists' => $exists,
        'writable' => $writable,
        'note' => $writable
            ? 'Escritura en disco disponible.'
            : 'data/ no existe o no tiene permiso de escritura para el usuario de PHP: los records NO se pueden guardar. Da permisos 755 (o 775) a la carpeta data/.'
    ];
}

/** Multiplicación FNV-1a de 32 bits con acarreo, usando solo operaciones de
 *  16 bits. Es idéntica al Math.imul del cliente en cualquier PHP:
 *  - `$h * 0x01000193` en PHP de 64 bits sería exacto, pero en un build de 32 bits
 *    desbordaría a float y perdería precisión (el record se rechazaría con 403).
 *  - Evitamos ese riesgo troceando en mitades de 16 bits, donde todos los
 *    productos parciales son < 2^48 y no hay desbordamiento en ningún caso.
 *  Nota: (a*b) mod 2^32 = (aHi*b) * 2^16 + aLo*b, y el acarreo de aLo*b se lleva
 *  al término superior antes de volver a enmascarar. */
function fnvMul32($h, $prime) {
    $aLo = $h & 0xFFFF;
    $aHi = ($h >> 16) & 0xFFFF;
    $mid = ((($aLo * $prime) >> 16) + $aHi * $prime) & 0xFFFF;
    return (($mid << 16) | (($aLo * $prime) & 0xFFFF)) & 0xFFFFFFFF;
}

/** Firma FNV-1a v3: name|score|round|date|ts|nonce|wallet|salt */
function computeSig($entry, $salt) {
    $name = isset($entry['name']) ? (string)$entry['name'] : '';
    $score = isset($entry['score']) ? (int)$entry['score'] : 0;
    $round = isset($entry['round']) ? (int)$entry['round'] : 0;
    $date = isset($entry['date']) ? (string)$entry['date'] : '';
    $ts = isset($entry['_ts']) ? (string)$entry['_ts'] : '0';
    $nonce = isset($entry['_n']) ? (string)$entry['_n'] : '';
    $wallet = isset($entry['wallet']) ? (string)$entry['wallet'] : '';
    $str = $name . '|' . $score . '|' . $round . '|' . $date . '|' . $ts . '|' . $nonce . '|' . $wallet . '|' . $salt;

    $h = 0x811c9dc5;
    $len = strlen($str);
    for ($i = 0; $i < $len; $i++) {
        $h ^= ord($str[$i]);
        $h = fnvMul32($h, 0x01000193);
    }
    return dechex($h);
}

/** Acepta 0x + 40 hex (EVM) o un ENS tipo nombre.eth. Devuelve '' si no es válida. */
function cleanWallet($w) {
    $s = trim((string)$w);
    if (preg_match('/^0x[0-9a-fA-F]{40}$/', $s)) return strtolower($s);
    if (preg_match('/^[a-z0-9][a-z0-9-]{1,61}\.eth$/i', $s)) return strtolower($s);
    return '';
}

function cleanName($n) {
    $s = strtoupper(substr(preg_replace('/[^A-Za-z0-9 _-]/', '', trim((string)$n)), 0, 10));
    $s = trim($s);
    return $s === '' ? 'PILOT' : $s;
}

function loadJson($file) {
    if (!file_exists($file)) return [];
    $content = @file_get_contents($file);
    if (!$content) return [];
    $data = json_decode($content, true);
    return is_array($data) ? $data : [];
}

/** Devuelve true/false para poder reportar fallos de escritura al cliente. */
function saveJson($file, $data) {
    $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    $bytes = @file_put_contents($file, $json, LOCK_EX);
    return $bytes !== false;
}

function checkWeeklyEpoch($weeklyEpochFile, $weeklyFile, $WEEK_MS) {
    $now = round(microtime(true) * 1000);
    $epoch = file_exists($weeklyEpochFile) ? (float)@file_get_contents($weeklyEpochFile) : 0;
    if ($epoch <= 0 || ($now - $epoch) >= $WEEK_MS) {
        $epoch = $now;
        @file_put_contents($weeklyEpochFile, (string)$epoch, LOCK_EX);
        saveJson($weeklyFile, []);
    }
    return $epoch;
}

function deduplicateAndRank($list) {
    $clean = is_array($list) ? $list : [];
    $map = [];
    foreach ($clean as $item) {
        if (!isset($item['name']) || !isset($item['score'])) continue;
        $name = cleanName($item['name']);
        $norm = [
            'name' => $name,
            'score' => (int)$item['score'],
            'round' => isset($item['round']) ? (int)$item['round'] : 1,
            'date' => isset($item['date']) ? (string)$item['date'] : date('m/d/Y'),
            'wallet' => isset($item['wallet']) ? cleanWallet($item['wallet']) : '',
            '_ts' => isset($item['_ts']) ? $item['_ts'] : 0,
            '_n' => isset($item['_n']) ? (string)$item['_n'] : '',
            '_sig' => isset($item['_sig']) ? (string)$item['_sig'] : ''
        ];
        if (!isset($map[$name])) {
            $map[$name] = $norm;
        } else {
            $cur = $map[$name];
            $better = $norm['score'] > $cur['score']
                || ($norm['score'] === $cur['score'] && $norm['round'] > $cur['round'])
                || ($norm['score'] === $cur['score'] && $norm['round'] === $cur['round'] && $cur['wallet'] === '' && $norm['wallet'] !== '');
            if ($better) $map[$name] = $norm;
        }
    }
    $unique = array_values($map);
    usort($unique, function($a, $b) {
        if ($b['score'] !== $a['score']) return $b['score'] - $a['score'];
        return $b['round'] - $a['round'];
    });
    return array_slice($unique, 0, 10);
}

function updateOrInsert($list, $newEntry) {
    $clean = is_array($list) ? $list : [];
    $clean[] = $newEntry;
    return deduplicateAndRank($clean);
}

function clientIp() {
    foreach (['HTTP_X_FORWARDED_FOR', 'HTTP_X_REAL_IP', 'REMOTE_ADDR'] as $k) {
        if (!empty($_SERVER[$k])) {
            $parts = explode(',', $_SERVER[$k]);
            $first = trim($parts[0]);
            if ($first !== '') return preg_replace('/[^0-9a-fA-F:\.]/', '', $first);
        }
    }
    return 'unknown';
}

function checkRateLimit($rateFile, $nonce, $MIN_POST_GAP_MS, $MAX_POSTS_PER_DAY) {
    $nowMs = round(microtime(true) * 1000);
    $ip = clientIp();
    $rl = loadJson($rateFile);
    if (!is_array($rl)) $rl = [];
    foreach ($rl as $k => $v) {
        if (!isset($v['day']) || ($nowMs - $v['day']) > 86400000) unset($rl[$k]);
    }
    $entry = isset($rl[$ip]) ? $rl[$ip] : ['last' => 0, 'count' => 0, 'day' => $nowMs, 'nonces' => []];
    if (!isset($entry['nonces']) || !is_array($entry['nonces'])) $entry['nonces'] = [];

    if (($nowMs - $entry['last']) < $MIN_POST_GAP_MS) {
        saveJson($rateFile, $rl);
        return 'Rate limited: too many submissions, wait a few seconds';
    }
    if ($entry['count'] >= $MAX_POSTS_PER_DAY) {
        return 'Rate limited: daily submission cap reached';
    }
    if (in_array($nonce, $entry['nonces'], true)) {
        return 'Replay detected: nonce already used';
    }

    $entry['last'] = $nowMs;
    $entry['count'] = (int)$entry['count'] + 1;
    $entry['nonces'][] = $nonce;
    if (count($entry['nonces']) > 64) $entry['nonces'] = array_slice($entry['nonces'], -64);
    $rl[$ip] = $entry;
    saveJson($rateFile, $rl);
    return null;
}

checkWeeklyEpoch($weeklyEpochFile, $weeklyFile, $WEEK_MS);
$storageInfo = storageInfo($dataDir);

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $allTime = loadJson($allTimeFile);
    $weekly = loadJson($weeklyFile);
    $out = [
        'success' => true,
        'allTime' => $allTime,
        'weekly' => $weekly,
        'storage' => $storageInfo
    ];
    if (isset($_GET['debug']) && $_GET['debug'] === '1') {
        $out['diagnostics'] = [
            'api' => 'records.php',
            'storage' => $storageInfo,
            'phpVersion' => PHP_VERSION,
            'epoch' => (float)@file_get_contents($weeklyEpochFile),
            'allTimeCount' => count($allTime),
            'weeklyCount' => count($weekly)
        ];
    }
    echo json_encode($out);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // Si el disco no es escribible avisamos de inmediato: es la causa habitual
    // de que el juego "guarde" y el record no aparezca nunca.
    if (!$storageInfo['writable']) {
        http_response_code(500);
        echo json_encode(['error' => 'Server storage not writable', 'storage' => $storageInfo]);
        exit;
    }

    $raw = @file_get_contents('php://input');
    if (strlen($raw) > $MAX_BODY) {
        http_response_code(413);
        echo json_encode(['error' => 'Payload too large']);
        exit;
    }
    $body = json_decode($raw, true);
    $entry = isset($body['entry']) ? $body['entry'] : null;

    if (!$entry || !isset($entry['name']) || !isset($entry['score']) || !isset($entry['round'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid entry payload']);
        exit;
    }

    $nowMs = round(microtime(true) * 1000);

    $name = cleanName($entry['name']);
    $score = max(0, (int)$entry['score']);
    $round = max(1, min(999, (int)$entry['round']));
    $date = isset($entry['date']) ? substr(strip_tags((string)$entry['date']), 0, 20) : date('m/d/Y');
    $sig = isset($entry['_sig']) ? (string)$entry['_sig'] : '';
    $ts = isset($entry['_ts']) ? (float)$entry['_ts'] : 0;
    $nonce = isset($entry['_n']) ? substr(preg_replace('/[^a-zA-Z0-9]/', '', (string)$entry['_n']), 0, 40) : '';
    $wallet = cleanWallet(isset($entry['wallet']) ? $entry['wallet'] : '');

    // 1. Wallet obligatoria
    if ($wallet === '') {
        http_response_code(422);
        echo json_encode(['error' => 'Wallet required: a valid 0x... address or name.eth is mandatory to save a record', 'storage' => $storageInfo]);
        exit;
    }
    // 2. Frescura de la firma (anti reenvío)
    if ($ts <= 0 || abs($nowMs - $ts) > $FRESH_WINDOW_MS) {
        http_response_code(403);
        echo json_encode(['error' => 'Stale or invalid timestamp']);
        exit;
    }
    // 3. Nonce obligatorio
    if (strlen($nonce) < 8) {
        http_response_code(403);
        echo json_encode(['error' => 'Missing submission nonce']);
        exit;
    }

    $sanitized = [
        'name' => $name,
        'score' => $score,
        'round' => $round,
        'date' => $date,
        'wallet' => $wallet,
        '_ts' => $ts,
        '_n' => $nonce,
        '_sig' => $sig
    ];

    // 4. Firma v3 (incluye ts, nonce y wallet)
    $expectedSig = computeSig($sanitized, $SEC_SALT);
    if (!hash_equals($expectedSig, $sig)) {
        http_response_code(403);
        echo json_encode(['error' => 'Cryptographic signature mismatch']);
        exit;
    }

    // 5. Plausibilidad
    $maxPlausible = min($ABS_SCORE_CAP, $round * $PER_ROUND_BUDGET + $ROUND_GRACE);
    if ($score > $maxPlausible) {
        http_response_code(422);
        echo json_encode(['error' => 'Score exceeds plausible value for the round reached']);
        exit;
    }

    // 6. Rate limiting + nonce único
    $rlError = checkRateLimit($rateFile, $nonce, $MIN_POST_GAP_MS, $MAX_POSTS_PER_DAY);
    if ($rlError !== null) {
        http_response_code(429);
        echo json_encode(['error' => $rlError, 'storage' => $storageInfo]);
        exit;
    }

    $allTime = updateOrInsert(loadJson($allTimeFile), $sanitized);
    $okAll = saveJson($allTimeFile, $allTime);
    $weekly = updateOrInsert(loadJson($weeklyFile), $sanitized);
    $okWeek = saveJson($weeklyFile, $weekly);

    if (!$okAll || !$okWeek) {
        http_response_code(500);
        echo json_encode([
            'error' => 'Storage write failed on the server',
            'storage' => $storageInfo,
            'hint' => 'Revisa permisos de escritura de la carpeta data/ (chmod 755 o 775).'
        ]);
        exit;
    }

    echo json_encode([
        'success' => true,
        'message' => 'Record recorded successfully',
        'allTime' => $allTime,
        'weekly' => $weekly,
        'storage' => $storageInfo
    ]);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);
