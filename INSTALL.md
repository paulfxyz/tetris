# INSTALL — tetris

You only need this if you want the **scoreboard / PGP signing backend**. The game itself is fully playable offline — open `public/index.html` and go.

## What this installs

1. A Node + Fastify backend that:
   - Signs score receipts with **your** PGP key (Ed25519 by default).
   - Stores submitted scores in SQLite on a Fly.io persistent volume.
   - Exposes `GET /pubkey`, `GET /scores`, `POST /sign`, `POST /submit`, `GET /health`.
2. A PGP keypair that **only you** hold the private half of.

## 1. Generate a PGP key

```bash
cd server
npm install
npm run keygen -- --name "tetris scoreboard" --email scoreboard@your-domain.com
```

This produces `server/keys/pgp-private.asc` (keep secret) and `server/keys/pgp-public.asc` (publish).

> Optional: protect the private key with a passphrase by adding `--pass "your-secret"`.

Copy the public key into the repo so users can verify their receipts:

```bash
cp server/keys/pgp-public.asc docs/PUBKEY.asc
```

⚠️ **Never** commit `server/keys/pgp-private.asc`. It's already in `.gitignore`. If you ever leak it, generate a new key and rotate.

## 2. Run locally

```bash
cd server
PGP_PRIVATE_KEY="$(cat ./keys/pgp-private.asc)" \
PGP_PRIVATE_KEY_PASSPHRASE="" \
DB_PATH="./data/scores.db" \
PORT=8080 \
npm start
```

Then in `public/index.html` open the in-game settings ⚙ → **Scoreboard server** → `http://localhost:8080` → Save.

## 3. Deploy to Fly.io

```bash
cd server
fly launch --no-deploy --name tetris-scoreboard --region cdg
fly volumes create tetris_data --size 1 --region cdg

fly secrets set PGP_PRIVATE_KEY="$(cat ./keys/pgp-private.asc)"
# only if your key has a passphrase:
fly secrets set PGP_PRIVATE_KEY_PASSPHRASE="your-secret"

# Optional: restrict the CORS origin
fly secrets set ALLOWED_ORIGINS="https://tetris.your-domain.com"

fly deploy
```

Then point the game at the deployed URL (in Settings → Scoreboard server).

## 4. Verify a signed receipt

After downloading a `tetris-<name>-<score>.txt`:

```bash
# Import the public key once
gpg --import docs/PUBKEY.asc

# Verify
gpg --verify tetris-Paul-42360.txt
```

Should print `Good signature from "tetris scoreboard <…>"`.

## Environment variables

| Var                          | Default                | Purpose                                       |
| ---------------------------- | ---------------------- | --------------------------------------------- |
| `PORT`                       | `8080`                 | HTTP port                                     |
| `DB_PATH`                    | `./data/scores.db`     | SQLite file. Mount a Fly volume on its dir.   |
| `PGP_PRIVATE_KEY`            | —                      | ASCII-armored private key (Fly secret).       |
| `PGP_PRIVATE_KEY_PASSPHRASE` | —                      | Optional passphrase.                          |
| `ALLOWED_ORIGINS`            | `*`                    | Comma-separated allow-list for CORS.          |
| `MAX_NAME_LEN`               | `32`                   | Sanity cap for the `name` field.              |
| `MAX_TAGLINE_LEN`            | `80`                   | Sanity cap for `tagline`.                     |
| `MAX_EMAIL_LEN`              | `160`                  | Sanity cap for `email`.                       |

## Rotating the key

If the private key ever leaks:

1. Generate a new key (`npm run keygen`).
2. `fly secrets set PGP_PRIVATE_KEY="$(cat ./keys/pgp-private.asc)"` and redeploy.
3. Commit the new `docs/PUBKEY.asc` and cut a new tetris release. Old receipts remain verifiable against the old `PUBKEY.asc` — keep it around in `docs/PUBKEY.<date>.asc` if you care.
