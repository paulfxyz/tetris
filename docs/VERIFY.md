# Verifying a signed receipt

Every score downloaded from a configured tetris server is wrapped in a PGP **cleartext signature** using the server's private key. You can verify it with any PGP/GPG client.

## With GnuPG

```bash
# Import the public key (once)
gpg --import docs/PUBKEY.asc

# Verify
gpg --verify tetris-Paul-42360.txt
```

Expected output:

```
gpg: Good signature from "tetris scoreboard <scoreboard@example.com>"
```

If you see `BAD signature` — someone tampered with the file. If you see `Can't check signature: No public key` — make sure you imported the right `PUBKEY.asc`.

## With openpgp.js (in a browser)

```js
import * as openpgp from 'https://esm.sh/openpgp@5';

const pubArmored = await fetch('https://your-server/pubkey').then(r => r.text());
const signedText = await fetch('tetris-Paul-42360.txt').then(r => r.text());

const publicKey = await openpgp.readKey({ armoredKey: pubArmored });
const message = await openpgp.readCleartextMessage({ cleartextMessage: signedText });
const verification = await openpgp.verify({ message, verificationKeys: publicKey });
const { verified, keyID } = verification.signatures[0];
try {
  await verified;
  console.log('signed by', keyID.toHex());
} catch (e) {
  console.error('bad signature', e);
}
```

## What's actually signed

The cleartext message inside the receipt — everything between `-----BEGIN PGP SIGNED MESSAGE-----` and `-----BEGIN PGP SIGNATURE-----`. That includes your name, tagline, score, line count, time played, the issuer key fingerprint, and the issued-at timestamp.

The signature does **not** prove you actually played the game honestly — anyone could `POST /sign` arbitrary numbers. It proves that **a specific tetris server attested to those numbers at a specific time**. That's still useful for sharing on a leaderboard, and trivially detects tampering with the file after the fact.
