// tetris — server/index.js
// Fastify backend: signs scores with the PGP key held in env, stores on SQLite.
//
// Env:
//   PORT                       — default 8080
//   DB_PATH                    — default ./data/scores.db (mount a Fly volume here)
//   PGP_PRIVATE_KEY            — ASCII-armored private key (required for /sign and /submit)
//   PGP_PRIVATE_KEY_PASSPHRASE — optional, only if the key is protected
//   ALLOWED_ORIGINS            — comma-separated list (defaults to "*")
//   MAX_NAME_LEN, MAX_TAGLINE_LEN, MAX_EMAIL_LEN — sanity caps

import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Database from 'better-sqlite3';
import * as openpgp from 'openpgp';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';

const PORT = Number(process.env.PORT || 8080);
const DB_PATH = resolve(process.env.DB_PATH || './data/scores.db');
const ORIGINS = (process.env.ALLOWED_ORIGINS || '*').split(',').map(s => s.trim()).filter(Boolean);
const MAX_NAME = Number(process.env.MAX_NAME_LEN || 32);
const MAX_TAG = Number(process.env.MAX_TAGLINE_LEN || 80);
const MAX_EMAIL = Number(process.env.MAX_EMAIL_LEN || 160);

// ---- Key loading ----
const PGP_KEY = process.env.PGP_PRIVATE_KEY || (existsSync('./pgp-private.asc') ? readFileSync('./pgp-private.asc', 'utf8') : null);
const PGP_PASS = process.env.PGP_PRIVATE_KEY_PASSPHRASE || null;
let signingKey = null;
let publicKeyArmored = null;
let keyFingerprint = null;

async function loadKey() {
  if (!PGP_KEY) {
    console.warn('[tetris] no PGP key configured — /sign and /submit will fail until you provide PGP_PRIVATE_KEY.');
    return;
  }
  const priv = await openpgp.readPrivateKey({ armoredKey: PGP_KEY });
  signingKey = PGP_PASS ? await openpgp.decryptKey({ privateKey: priv, passphrase: PGP_PASS }) : priv;
  publicKeyArmored = signingKey.toPublic().armor();
  keyFingerprint = signingKey.getFingerprint().toUpperCase();
  console.log(`[tetris] signing key loaded — ${keyFingerprint}`);
}

// ---- DB ----
mkdirSync(dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    tagline TEXT,
    email TEXT,
    score INTEGER NOT NULL,
    lines INTEGER NOT NULL,
    level INTEGER NOT NULL,
    duration_ms INTEGER NOT NULL,
    pieces INTEGER,
    theme TEXT,
    client_version TEXT,
    played_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    fingerprint TEXT,
    signature_excerpt TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_scores_score ON scores (score DESC);
`);

// ---- Fastify ----
const app = Fastify({ logger: { level: 'info' } });
await app.register(cors, {
  origin: ORIGINS.includes('*') ? true : ORIGINS,
});
await app.register(rateLimit, {
  max: 60,
  timeWindow: '1 minute',
  keyGenerator: (req) => req.ip,
});

// ---- Helpers ----
function sanitize(payload) {
  const s = (v, n) => (typeof v === 'string' ? v : '').slice(0, n).replace(/[\x00-\x1f\x7f]/g, '').trim();
  const i = (v, min = 0, max = 1e12) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.max(min, Math.min(max, Math.floor(n)));
  };
  return {
    name: s(payload.name, MAX_NAME) || 'anon',
    tagline: s(payload.tagline, MAX_TAG),
    email: s(payload.email, MAX_EMAIL),
    score: i(payload.score, 0, 1e9),
    lines: i(payload.lines, 0, 1e6),
    level: i(payload.level, 1, 999),
    duration_ms: i(payload.duration_ms, 0, 1e9),
    pieces: i(payload.pieces, 0, 1e7),
    hard_drops: i(payload.hard_drops, 0, 1e7),
    soft_drops: i(payload.soft_drops, 0, 1e7),
    rotations: i(payload.rotations, 0, 1e7),
    holds: i(payload.holds, 0, 1e7),
    tetrises: i(payload.tetrises, 0, 1e6),
    max_combo: i(payload.max_combo, 0, 1e4),
    theme: s(payload.theme, 16),
    client_version: s(payload.client_version, 16),
    played_at: s(payload.played_at, 40) || new Date().toISOString(),
  };
}

function formatTime(ms) {
  const s = Math.floor((ms || 0) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function buildReceipt(p, { rank } = {}) {
  const lines = [
    '===== TETRIS SCORE — SIGNED RECEIPT =====',
    '',
    `Name:        ${p.name}`,
    p.tagline ? `Tagline:     ${p.tagline}` : null,
    p.email   ? `Email:       ${p.email}`   : null,
    '',
    `Score:       ${p.score}`,
    `Lines:       ${p.lines}`,
    `Level:       ${p.level}`,
    `Time played: ${formatTime(p.duration_ms)}`,
    `Pieces:      ${p.pieces}`,
    `Hard drops:  ${p.hard_drops}`,
    `Soft drops:  ${p.soft_drops}`,
    `Rotations:   ${p.rotations}`,
    `Holds:       ${p.holds}`,
    `Tetrises:    ${p.tetrises}`,
    `Max combo:   ${p.max_combo}`,
    '',
    `Theme:       ${p.theme}`,
    `Client:      tetris ${p.client_version}`,
    `Played at:   ${p.played_at}`,
    rank != null ? `Public rank: #${rank}` : null,
    '',
    `Issued at:   ${new Date().toISOString()}`,
    `Issuer key:  ${keyFingerprint}`,
    '',
    'This score has been cryptographically signed by the tetris scoreboard.',
    'Verify with:  gpg --verify <this file>',
    'Public key:   GET /pubkey on this server.',
    '',
  ].filter(Boolean);
  return lines.join('\n') + '\n';
}

async function sign(text) {
  if (!signingKey) throw new Error('PGP signing key not configured');
  const message = await openpgp.createCleartextMessage({ text });
  const signed = await openpgp.sign({
    message,
    signingKeys: signingKey,
    config: { preferredHashAlgorithm: openpgp.enums.hash.sha256 },
  });
  return signed;
}

// ---- Routes ----
app.get('/health', async () => ({ ok: true, key: !!signingKey, fingerprint: keyFingerprint }));

app.get('/pubkey', async (_req, reply) => {
  if (!publicKeyArmored) return reply.code(503).send({ error: 'no key configured' });
  reply.header('content-type', 'application/pgp-keys').send(publicKeyArmored);
});

app.post('/sign', async (req, reply) => {
  try {
    const data = sanitize(req.body || {});
    const text = buildReceipt(data);
    const signed = await sign(text);
    const excerpt = signed.split('\n').find((l) => l.length > 20 && !l.includes(':')) || '';
    return { signed_txt: signed, accepted: false, fingerprint: keyFingerprint, signature_excerpt: excerpt.slice(0, 40) };
  } catch (e) {
    req.log.error(e);
    return reply.code(500).send({ error: 'sign failed', detail: e.message });
  }
});

app.post('/submit', async (req, reply) => {
  try {
    const data = sanitize(req.body || {});
    if (data.score <= 0 && data.lines === 0) return reply.code(400).send({ error: 'empty score' });

    const row = db.prepare(`SELECT COUNT(*) + 1 AS rank FROM scores WHERE score > ?`).get(data.score);
    const rank = row.rank;
    const text = buildReceipt(data, { rank });
    const signed = await sign(text);
    const excerpt = signed.split('\n').slice(-3, -2)[0]?.slice(0, 40) || '';

    db.prepare(`
      INSERT INTO scores (name, tagline, email, score, lines, level, duration_ms, pieces, theme, client_version, played_at, fingerprint, signature_excerpt)
      VALUES (@name, @tagline, @email, @score, @lines, @level, @duration_ms, @pieces, @theme, @client_version, @played_at, @fingerprint, @signature_excerpt)
    `).run({ ...data, fingerprint: keyFingerprint, signature_excerpt: excerpt });

    const finalRank = db.prepare(`SELECT COUNT(*) + 1 AS rank FROM scores WHERE score > ?`).get(data.score).rank;
    return { signed_txt: signed, accepted: true, rank: finalRank, fingerprint: keyFingerprint };
  } catch (e) {
    req.log.error(e);
    return reply.code(500).send({ error: 'submit failed', detail: e.message });
  }
});

app.get('/scores', async (req) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
  const rows = db.prepare(`
    SELECT name, tagline, score, lines, level, duration_ms, theme, played_at
    FROM scores ORDER BY score DESC, played_at ASC LIMIT ?
  `).all(limit);
  return { scores: rows, count: rows.length, fingerprint: keyFingerprint };
});

// ---- Boot ----
await loadKey();
app.listen({ port: PORT, host: '0.0.0.0' }).then(() => {
  console.log(`[tetris] listening on :${PORT}`);
}).catch((e) => {
  console.error(e); process.exit(1);
});
