# INSTALL — tetris

You only need this if you want the **scoreboard / PGP signing backend**. The game itself is fully playable offline — open `public/index.html` and go.

## Pick a backend

There are two interchangeable backends — both expose the same `/api/*` HTTP surface:

| Backend            | Where it lives  | Best for                                                        |
| ------------------ | --------------- | --------------------------------------------------------------- |
| **PHP**            | `server-php/`   | Shared hosting (Siteground, DreamHost, Hostinger), single FTP upload. Powers [tetris.rocks](https://tetris.rocks/). |
| **Node + Fastify** | `server-node/`  | Fly.io, Render, Docker, anything that runs Node.                |

Pick **one** and follow the matching section below. The frontend talks to whichever one you deploy at `/api` on the same domain.

---

## Option A — PHP on a shared host (recommended)

This is what powers [tetris.rocks](https://tetris.rocks/). PHP 7.4+ with either the `gnupg` extension or the `gpg` binary available via `proc_open`.

### A.1. Generate a PGP key (locally, once)

```bash
cd server-node
npm install
npm run keygen -- --name "tetris scoreboard" --email scoreboard@your-domain.com
```

(We still use `server-node/scripts/keygen.js` to generate keys — it's just a one-off Node helper; you don't need to deploy the Node server.)

This produces `server-node/keys/pgp-private.asc` (keep secret) and `server-node/keys/pgp-public.asc` (publish).

Copy the public key into the repo:

```bash
cp server-node/keys/pgp-public.asc docs/PUBKEY.asc
```

### A.2. Upload the files

Assuming a Siteground-style layout where `public_html/` is the webroot for your domain:

```
<account-root>/
  public_html/                  ← webroot
    index.html, css/, js/, ... (everything from public/)
    pubkey.asc                  (a copy of pgp-public.asc, so /pubkey.asc works)
    .htaccess                   (from server-php/.htaccess)
    api/
      index.php                 (from server-php/api/index.php)
      .htaccess                 (from server-php/api/.htaccess)
  private/                      ← above the webroot, NOT web-accessible
    pgp-private.asc             (chmod 600)
    pgp-public.asc
```

Upload via FTP, SFTP, or your host's File Manager. The PHP backend reads keys from `../../private/` relative to `api/index.php`, which lands above the webroot.

### A.3. Verify

```bash
curl https://yourdomain.example/api/health
# → { "ok": true, "key": "loaded", "fingerprint": "..." }

curl https://yourdomain.example/api/scores
# → { "scores": [], "count": 0, "fingerprint": "..." }
```

That's it. The frontend at `https://yourdomain.example/` will auto-detect `/api` on the same origin.

See [`server-php/README.md`](server-php/README.md) for tuning options (CORS, passphrase file, gnupg vs. gpg-binary signing).

---

## Option B — Node + Fastify on Fly.io

### B.1. Generate a PGP key

```bash
cd server-node
npm install
npm run keygen -- --name "tetris scoreboard" --email scoreboard@your-domain.com
```

This produces `server-node/keys/pgp-private.asc` (keep secret) and `server-node/keys/pgp-public.asc` (publish).

> Optional: protect the private key with a passphrase by adding `--pass "your-secret"`.

Copy the public key into the repo so users can verify their receipts:

```bash
cp server-node/keys/pgp-public.asc docs/PUBKEY.asc
```

⚠️ **Never** commit `server-node/keys/pgp-private.asc`. It's already in `.gitignore`. If you ever leak it, generate a new key and rotate.

### B.2. Run locally

```bash
cd server-node
PGP_PRIVATE_KEY="$(cat ./keys/pgp-private.asc)" \
PGP_PRIVATE_KEY_PASSPHRASE="" \
DB_PATH="./data/scores.db" \
PORT=8080 \
npm start
```

Then in `public/index.html` open the in-game settings ⚙ → **Scoreboard server** → `http://localhost:8080` → Save.

### B.3. Deploy to Fly.io

```bash
cd server-node
fly launch --no-deploy --name tetris-scoreboard --region cdg
fly volumes create tetris_data --size 1 --region cdg

fly secrets set PGP_PRIVATE_KEY="$(cat ./keys/pgp-private.asc)"
# only if your key has a passphrase:
fly secrets set PGP_PRIVATE_KEY_PASSPHRASE="your-secret"

# Optional: restrict the CORS origin
fly secrets set ALLOWED_ORIGINS="https://tetris.your-domain.com"

fly deploy
```

Then point the game at the deployed URL (in Settings → Scoreboard server). For domain-co-located deployments (Option A above), this happens automatically.

---

## 3. Verify a signed receipt

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
