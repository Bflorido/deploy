<?php
/**
 * ARC NETWORK — IMMUTABLE FORUM API
 * Actions:
 *   POST {action:'register', user, pass}      -> create account (bcrypt)
 *   POST {action:'login', user, pass}         -> returns session token (7d)
 *   POST {action:'post', token, text}         -> append message (immutable)
 *   GET  ?action=posts                        -> last 50 posts
 * There is intentionally NO edit/delete endpoint: written is written forever.
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }

$dataDir = __DIR__ . '/../data';
if (!is_dir($dataDir)) { @mkdir($dataDir, 0777, true); }

$usersFile = $dataDir . '/forum_users.json';
$sessFile  = $dataDir . '/forum_sessions.json';
$postsFile = $dataDir . '/forum_posts.json';

$MAX_POST_LEN = 400;
$MIN_POST_GAP  = 15; // seconds between posts per user
$SESSION_TTL   = 7 * 24 * 3600;

function loadArr($f, $assoc = true) {
    if (!file_exists($f)) return [];
    $d = json_decode(@file_get_contents($f), true);
    return is_array($d) ? $d : [];
}
function saveArr($f, $d) { @file_put_contents($f, json_encode($d, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE), LOCK_EX); }
function fail($code, $msg) { http_response_code($code); echo json_encode(['error' => $msg]); exit; }
function cleanUser($u) { return strtoupper(substr(preg_replace('/[^A-Za-z0-9_-]/', '', (string)$u), 0, 12)); }

$raw = @file_get_contents('php://input');
if (strlen($raw) > 4096) fail(413, 'Payload too large');
$body = $raw ? json_decode($raw, true) : [];
$action = isset($body['action']) ? $body['action'] : (isset($_GET['action']) ? $_GET['action'] : '');

switch ($action) {

case 'register':
    $user = cleanUser(isset($body['user']) ? $body['user'] : '');
    $pass = (string)(isset($body['pass']) ? $body['pass'] : '');
    if (strlen($user) < 3) fail(400, 'Username must be at least 3 chars (A-Z, 0-9, _-)');
    if (strlen($pass) < 4) fail(400, 'Password must be at least 4 chars');
    $users = loadArr($usersFile);
    if (isset($users[$user])) fail(409, 'Username already taken');
    $users[$user] = [
        'hash' => password_hash($pass, PASSWORD_DEFAULT),
        'created' => time()
    ];
    saveArr($usersFile, $users);
    echo json_encode(['success' => true, 'user' => $user]);
    break;

case 'login':
    $user = cleanUser(isset($body['user']) ? $body['user'] : '');
    $pass = (string)(isset($body['pass']) ? $body['pass'] : '');
    $users = loadArr($usersFile);
    if (!isset($users[$user]) || !password_verify($pass, $users[$user]['hash'])) {
        fail(401, 'Invalid credentials');
    }
    $token = bin2hex(random_bytes(24));
    $sessions = loadArr($sessFile);
    $now = time();
    foreach ($sessions as $k => $s) { if ($s['exp'] < $now) unset($sessions[$k]); }
    $sessions[$token] = ['user' => $user, 'exp' => $now + $SESSION_TTL];
    saveArr($sessFile, $sessions);
    echo json_encode(['success' => true, 'token' => $token, 'user' => $user]);
    break;

case 'post':
    $token = (string)(isset($body['token']) ? $body['token'] : '');
    $text  = trim((string)(isset($body['text']) ? $body['text'] : ''));
    $sessions = loadArr($sessFile);
    if (!isset($sessions[$token]) || $sessions[$token]['exp'] < time()) fail(401, 'Session expired, log in again');
    $user = $sessions[$token]['user'];
    if ($text === '' || strlen($text) > 400) fail(400, 'Message must be 1-400 chars');
    $text = strip_tags($text);

    $posts = loadArr($postsFile);
    // rate limit: one post per user every MIN_POST_GAP seconds
    for ($i = count($posts) - 1; $i >= 0; $i--) {
        if ($posts[$i]['user'] === $user) {
            if (time() - $posts[$i]['ts'] < $MIN_POST_GAP) fail(429, 'Slow down, pilot — one message every '.$MIN_POST_GAP.'s');
            break;
        }
    }
    $posts[] = ['user' => $user, 'text' => $text, 'ts' => time()];
    if (count($posts) > 1000) $posts = array_slice($posts, -1000);
    saveArr($postsFile, $posts);
    echo json_encode(['success' => true, 'posts' => array_slice($posts, -50)]);
    break;

case 'posts':
    $posts = loadArr($postsFile);
    echo json_encode(['success' => true, 'posts' => array_slice($posts, -50)]);
    break;

default:
    fail(400, 'Unknown action');
}
