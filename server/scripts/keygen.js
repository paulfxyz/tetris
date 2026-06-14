// tetris — server/scripts/keygen.js
// Generates a fresh PGP keypair for the scoreboard.
//
// Usage:
//   node scripts/keygen.js --name "tetris scoreboard" --email scoreboard@example.com [--pass "secret"] [--out ./keys]
//
// Output files (in --out, default ./keys):
//   pgp-private.asc  — keep secret. Paste into Fly secret PGP_PRIVATE_KEY.
//   pgp-public.asc   — safe to publish. Commit to the public repo as docs/PUBKEY.asc.

import * as openpgp from 'openpgp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return def;
  return process.argv[i + 1];
}

const name = arg('name', 'tetris scoreboard');
const email = arg('email', 'scoreboard@example.com');
const passphrase = arg('pass', undefined);
const out = arg('out', './keys');

mkdirSync(out, { recursive: true });

console.log(`Generating PGP keypair for ${name} <${email}> …`);
const { privateKey, publicKey } = await openpgp.generateKey({
  type: 'ecc',
  curve: 'ed25519',
  userIDs: [{ name, email }],
  passphrase,
  format: 'armored',
});

writeFileSync(join(out, 'pgp-private.asc'), privateKey, { mode: 0o600 });
writeFileSync(join(out, 'pgp-public.asc'), publicKey, { mode: 0o644 });

const priv = await openpgp.readPrivateKey({ armoredKey: privateKey });
console.log(`✓ wrote ${out}/pgp-private.asc  (KEEP SECRET)`);
console.log(`✓ wrote ${out}/pgp-public.asc   (publish this)`);
console.log(`Fingerprint: ${priv.getFingerprint().toUpperCase()}`);
console.log('');
console.log('Next:');
console.log('  fly secrets set PGP_PRIVATE_KEY="$(cat ./keys/pgp-private.asc)"');
if (passphrase) console.log(`  fly secrets set PGP_PRIVATE_KEY_PASSPHRASE="${passphrase}"`);
console.log('  cp ./keys/pgp-public.asc ../docs/PUBKEY.asc');
