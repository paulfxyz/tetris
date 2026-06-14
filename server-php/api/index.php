<?php
// tetris — server-php/api/index.php
// Tiny scoreboard API. PHP 7.4+. No framework.
//
// Endpoints (router below):
//   GET  /api/health    → { ok, key, fingerprint }
//   GET  /api/pubkey    → ASCII-armored public key
//   GET  /api/scores    → { scores: [...], count, fingerprint }
//   POST /api/sign      → { signed_txt, accepted:false, fingerprint }
//   POST /api/submit    → { signed_txt, accepted:true, rank, fingerprint }
//
// Layout expectations (above the webroot — NOT inside public_html):
//   ../private/pgp-private.asc      (chmod 600)
//   ../private/pgp-public.asc
//   ../private/scores.jsonl         (append-only log)
//   ../private/scoreboard.json      (sorted top scores for quick reads)
//   ../private/passphrase.txt       (optional)
//
// Signing strategy:
//   1. Prefer the `gnupg` PHP extension if loaded.
//   2. Otherwise call the `gpg` binary via proc_open with a temporary GNUPGHOME.
//
// Notes:
//   - This file is dropped at /api/index.php; Apache .htaccess sends every
//     /api/* request to it.
//   - All paths are derived from __DIR__ so we don't trust user input.

declare(strict_types=1);
error_reporting(E_ALL);
ini_set('display_errors', '0');
header('content-type: application/json; charset=utf-8');
header('cache-control: no-store');

// ---------- CORS ---------- //
$allowed = getenv('ALLOWED_ORIGINS') ?: '*';
header('access-control-allow-origin: ' . $allowed);
header('access-control-allow-methods: GET, POST, OPTIONS');
header('access-control-allow-headers: content-type');
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') { http_response_code(204); exit; }

// ---------- Config ---------- //
const MAX_NAME    = 32;
const MAX_TAGLINE = 80;
const MAX_EMAIL   = 160;
const MAX_BODY    = 8192; // bytes

$privateDir   = realpath(__DIR__ . '/../../private') ?: (__DIR__ . '/../../private');
$privKeyFile  = $privateDir . '/pgp-private.asc';
$pubKeyFile   = $privateDir . '/pgp-public.asc';
$scoresJsonl  = $privateDir . '/scores.jsonl';
$boardJson    = $privateDir . '/scoreboard.json';
$passphraseFile = $privateDir . '/passphrase.txt';

if (!is_dir($privateDir)) { @mkdir($privateDir, 0700, true); }

// ---------- Helpers ---------- //
function send_json($data, int $code = 200): void {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}
function send_text(string $text, string $type = 'text/plain; charset=utf-8'): void {
    header('content-type: ' . $type);
    echo $text;
    exit;
}
function fail(string $msg, int $code = 400): void { send_json(['error' => $msg], $code); }

function read_body(): array {
    $raw = file_get_contents('php://input') ?: '';
    if (strlen($raw) > MAX_BODY) fail('body too large', 413);
    $j = json_decode($raw, true);
    return is_array($j) ? $j : [];
}

function sanitize_str($v, int $maxLen): string {
    if (!is_string($v)) return '';
    $v = preg_replace('/[\x00-\x1f\x7f]/u', '', $v) ?? '';
    return trim(mb_substr($v, 0, $maxLen));
}
function sanitize_int($v, int $min = 0, int $max = 1_000_000_000): int {
    if (!is_numeric($v)) return 0;
    $n = (int) $v;
    return max($min, min($max, $n));
}

function load_passphrase(): ?string {
    global $passphraseFile;
    if (is_file($passphraseFile)) {
        $p = trim((string) @file_get_contents($passphraseFile));
        return $p === '' ? null : $p;
    }
    $env = getenv('PGP_PRIVATE_KEY_PASSPHRASE');
    return $env ?: null;
}

function format_time_ms(int $ms): string {
    $s = intdiv($ms, 1000);
    return floor($s / 60) . ':' . str_pad((string)($s % 60), 2, '0', STR_PAD_LEFT);
}

// ---------- Signing backends ---------- //

/**
 * Compute key fingerprint from the public key file. Best-effort.
 * Uses gpg if available; otherwise returns null.
 */
function fingerprint_from_pubkey(string $pubKeyArmored): ?string {
    // Try gnupg ext first
    if (extension_loaded('gnupg')) {
        try {
            $g = gnupg_init();
            gnupg_seterrormode($g, GNUPG_ERROR_SILENT);
            $info = gnupg_import($g, $pubKeyArmored);
            if (is_array($info) && !empty($info['fingerprint'])) return strtoupper($info['fingerprint']);
        } catch (Throwable $e) {}
    }
    // Fallback: shell out to gpg
    $gpg = which_gpg();
    if (!$gpg) return null;
    $home = sys_get_temp_dir() . '/tetris-gpg-' . bin2hex(random_bytes(4));
    @mkdir($home, 0700, true);
    try {
        $proc = proc_open(
            [$gpg, '--homedir', $home, '--batch', '--with-colons', '--import-options', 'show-only', '--import'],
            [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
            $pipes
        );
        if (!is_resource($proc)) return null;
        fwrite($pipes[0], $pubKeyArmored);
        fclose($pipes[0]);
        $out = stream_get_contents($pipes[1]); fclose($pipes[1]);
        fclose($pipes[2]);
        proc_close($proc);
        foreach (explode("\n", (string)$out) as $line) {
            if (strpos($line, 'fpr:') === 0) {
                $parts = explode(':', $line);
                if (!empty($parts[9])) return strtoupper($parts[9]);
            }
        }
    } finally {
        rrm($home);
    }
    return null;
}

function which_gpg(): ?string {
    foreach (['gpg', 'gpg2'] as $bin) {
        $path = @shell_exec('command -v ' . escapeshellarg($bin) . ' 2>/dev/null');
        if (is_string($path) && trim($path) !== '') return trim($path);
    }
    return null;
}

function rrm(string $dir): void {
    if (!is_dir($dir)) return;
    $items = @scandir($dir) ?: [];
    foreach ($items as $i) {
        if ($i === '.' || $i === '..') continue;
        $p = $dir . '/' . $i;
        if (is_dir($p)) rrm($p); else @unlink($p);
    }
    @rmdir($dir);
}

/**
 * Cleartext-sign $text with the private key. Returns the armored signed message.
 * Throws on failure.
 */
function pgp_clearsign(string $text, string $privKeyArmored, ?string $passphrase): string {
    // Backend 1: gnupg PHP extension
    if (extension_loaded('gnupg')) {
        try {
            $g = gnupg_init();
            gnupg_seterrormode($g, GNUPG_ERROR_EXCEPTION);
            $imp = gnupg_import($g, $privKeyArmored);
            if (!is_array($imp) || empty($imp['fingerprint'])) throw new RuntimeException('import failed');
            $fp = $imp['fingerprint'];
            gnupg_addsignkey($g, $fp, $passphrase ?? '');
            gnupg_setsignmode($g, GNUPG_SIG_MODE_CLEAR);
            $signed = gnupg_sign($g, $text);
            if (is_string($signed) && $signed !== '') return $signed;
        } catch (Throwable $e) { /* fall through */ }
    }

    // Backend 2: gpg binary
    $gpg = which_gpg();
    if (!$gpg) throw new RuntimeException('no PGP backend available (need ext-gnupg or gpg binary)');

    $home = sys_get_temp_dir() . '/tetris-gpg-' . bin2hex(random_bytes(4));
    @mkdir($home, 0700, true);
    try {
        // Import key
        $proc = proc_open(
            [$gpg, '--homedir', $home, '--batch', '--yes', '--quiet', '--import'],
            [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
            $pipes
        );
        if (!is_resource($proc)) throw new RuntimeException('cannot spawn gpg');
        fwrite($pipes[0], $privKeyArmored);
        fclose($pipes[0]);
        stream_get_contents($pipes[1]); fclose($pipes[1]);
        $err = stream_get_contents($pipes[2]); fclose($pipes[2]);
        $rc = proc_close($proc);
        if ($rc !== 0) throw new RuntimeException('gpg import failed: ' . $err);

        // Sign (cleartext)
        $args = [$gpg, '--homedir', $home, '--batch', '--yes', '--quiet', '--armor', '--clearsign'];
        if ($passphrase) {
            $args[] = '--pinentry-mode'; $args[] = 'loopback';
            $args[] = '--passphrase';    $args[] = $passphrase;
        }
        $proc = proc_open($args,
            [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
            $pipes
        );
        if (!is_resource($proc)) throw new RuntimeException('cannot spawn gpg sign');
        fwrite($pipes[0], $text);
        fclose($pipes[0]);
        $signed = stream_get_contents($pipes[1]); fclose($pipes[1]);
        $err    = stream_get_contents($pipes[2]); fclose($pipes[2]);
        $rc = proc_close($proc);
        if ($rc !== 0 || !$signed) throw new RuntimeException('gpg sign failed: ' . $err);
        return $signed;
    } finally {
        rrm($home);
    }
}

// ---------- Receipt builder ---------- //
function build_receipt(array $p, ?int $rank, ?string $fingerprint): string {
    $lines = [
        '===== TETRIS SCORE — SIGNED RECEIPT =====',
        '',
        'Name:        ' . $p['name'],
    ];
    if ($p['tagline']) $lines[] = 'Tagline:     ' . $p['tagline'];
    if ($p['email'])   $lines[] = 'Email:       ' . $p['email'];
    $lines = array_merge($lines, [
        '',
        'Score:       ' . $p['score'],
        'Lines:       ' . $p['lines'],
        'Level:       ' . $p['level'],
        'Time played: ' . format_time_ms($p['duration_ms']),
        'Pieces:      ' . $p['pieces'],
        'Hard drops:  ' . $p['hard_drops'],
        'Soft drops:  ' . $p['soft_drops'],
        'Rotations:   ' . $p['rotations'],
        'Holds:       ' . $p['holds'],
        'Tetrises:    ' . $p['tetrises'],
        'Max combo:   ' . $p['max_combo'],
        '',
        'Theme:       ' . $p['theme'],
        'Client:      tetris ' . $p['client_version'],
        'Played at:   ' . $p['played_at'],
    ]);
    if ($rank !== null) $lines[] = 'Public rank: #' . $rank;
    $lines[] = '';
    $lines[] = 'Issued at:   ' . gmdate('c');
    if ($fingerprint) $lines[] = 'Issuer key:  ' . $fingerprint;
    $lines = array_merge($lines, [
        '',
        'This score has been cryptographically signed by the tetris scoreboard.',
        'Verify with:  gpg --verify <this file>',
        'Public key:   https://tetris.rocks/pubkey.asc',
        '',
    ]);
    return implode("\n", $lines) . "\n";
}

// ---------- Score store ---------- //
function store_score(array $row): int {
    global $scoresJsonl, $boardJson;
    // Append to jsonl
    $fp = @fopen($scoresJsonl, 'a');
    if (!$fp) throw new RuntimeException('cannot open scores log');
    @chmod($scoresJsonl, 0600);
    flock($fp, LOCK_EX);
    fwrite($fp, json_encode($row, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n");
    fflush($fp);
    flock($fp, LOCK_UN);
    fclose($fp);

    // Rebuild board.json (top 500)
    $all = [];
    foreach (file($scoresJsonl, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
        $j = json_decode($line, true);
        if (is_array($j) && isset($j['score'])) $all[] = $j;
    }
    usort($all, fn($a, $b) => ($b['score'] <=> $a['score']) ?: strcmp($a['played_at'] ?? '', $b['played_at'] ?? ''));
    $top = array_slice($all, 0, 500);
    @file_put_contents($boardJson, json_encode($top, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
    @chmod($boardJson, 0640);

    foreach ($top as $i => $s) {
        if (($s['score'] ?? 0) === ($row['score'] ?? -1) && ($s['played_at'] ?? '') === ($row['played_at'] ?? '')) {
            return $i + 1;
        }
    }
    return count($top);
}

function load_top(int $limit): array {
    global $boardJson;
    if (!is_file($boardJson)) return [];
    $j = json_decode((string) @file_get_contents($boardJson), true);
    if (!is_array($j)) return [];
    $public = array_map(fn($s) => [
        'name'        => $s['name']     ?? '',
        'tagline'     => $s['tagline']  ?? '',
        'score'       => $s['score']    ?? 0,
        'lines'       => $s['lines']    ?? 0,
        'level'       => $s['level']    ?? 0,
        'duration_ms' => $s['duration_ms'] ?? 0,
        'theme'       => $s['theme']    ?? '',
        'played_at'   => $s['played_at'] ?? '',
    ], array_slice($j, 0, max(1, min(100, $limit))));
    return $public;
}

// ---------- Router ---------- //
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
// Normalize: strip leading /api
$path = preg_replace('#^/api#', '', $path);
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

$pubKey  = is_file($pubKeyFile)  ? (string) file_get_contents($pubKeyFile)  : '';
$privKey = is_file($privKeyFile) ? (string) file_get_contents($privKeyFile) : '';
$fingerprint = $pubKey ? fingerprint_from_pubkey($pubKey) : null;

try {
    if ($method === 'GET' && ($path === '/health' || $path === '/health/')) {
        $backend = extension_loaded('gnupg') ? 'gnupg-ext' : (which_gpg() ? 'gpg-cli' : 'none');
        send_json([
            'ok' => true,
            'key' => $privKey !== '',
            'fingerprint' => $fingerprint,
            'backend' => $backend,
            'php' => PHP_VERSION,
        ]);
    }

    if ($method === 'GET' && ($path === '/pubkey' || $path === '/pubkey/')) {
        if (!$pubKey) fail('no public key configured', 503);
        send_text($pubKey, 'application/pgp-keys');
    }

    if ($method === 'GET' && ($path === '/scores' || $path === '/scores/')) {
        $limit = sanitize_int($_GET['limit'] ?? 25, 1, 100);
        $rows = load_top($limit);
        send_json(['scores' => $rows, 'count' => count($rows), 'fingerprint' => $fingerprint]);
    }

    if ($method === 'POST' && ($path === '/sign' || $path === '/submit' || $path === '/sign/' || $path === '/submit/')) {
        if (!$privKey) fail('no signing key configured', 503);
        $raw = read_body();
        $data = [
            'name'           => sanitize_str($raw['name'] ?? '', MAX_NAME) ?: 'anon',
            'tagline'        => sanitize_str($raw['tagline'] ?? '', MAX_TAGLINE),
            'email'          => sanitize_str($raw['email'] ?? '', MAX_EMAIL),
            'score'          => sanitize_int($raw['score'] ?? 0, 0, 999_999_999),
            'lines'          => sanitize_int($raw['lines'] ?? 0, 0, 1_000_000),
            'level'          => sanitize_int($raw['level'] ?? 1, 1, 999),
            'duration_ms'    => sanitize_int($raw['duration_ms'] ?? 0, 0, 999_999_999),
            'pieces'         => sanitize_int($raw['pieces'] ?? 0, 0, 10_000_000),
            'hard_drops'     => sanitize_int($raw['hard_drops'] ?? 0, 0, 10_000_000),
            'soft_drops'     => sanitize_int($raw['soft_drops'] ?? 0, 0, 10_000_000),
            'rotations'      => sanitize_int($raw['rotations'] ?? 0, 0, 10_000_000),
            'holds'          => sanitize_int($raw['holds'] ?? 0, 0, 10_000_000),
            'tetrises'       => sanitize_int($raw['tetrises'] ?? 0, 0, 1_000_000),
            'max_combo'      => sanitize_int($raw['max_combo'] ?? 0, 0, 10_000),
            'theme'          => sanitize_str($raw['theme'] ?? '', 16),
            'client_version' => sanitize_str($raw['client_version'] ?? '', 16),
            'played_at'      => sanitize_str($raw['played_at'] ?? '', 40) ?: gmdate('c'),
        ];

        $store = ($path === '/submit' || $path === '/submit/');

        $rank = null;
        if ($store) {
            if ($data['score'] <= 0 && $data['lines'] === 0) fail('empty score', 400);
        }

        $text = build_receipt($data, null, $fingerprint);
        $signed = pgp_clearsign($text, $privKey, load_passphrase());

        if ($store) {
            $rank = store_score($data + ['fingerprint' => $fingerprint, 'received_at' => gmdate('c')]);
            // Re-issue with the now-known rank so the user's downloaded receipt mentions it
            $text = build_receipt($data, $rank, $fingerprint);
            $signed = pgp_clearsign($text, $privKey, load_passphrase());
        }

        send_json([
            'signed_txt'  => $signed,
            'accepted'    => $store,
            'rank'        => $rank,
            'fingerprint' => $fingerprint,
        ]);
    }

    send_json(['error' => 'not found', 'path' => $path], 404);
} catch (Throwable $e) {
    error_log('[tetris] ' . $e->getMessage());
    send_json(['error' => 'server error', 'detail' => $e->getMessage()], 500);
}
