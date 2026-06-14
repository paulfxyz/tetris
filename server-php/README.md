# server-php — Siteground / shared-PHP backend

This is the **simpler** scoreboard backend, written in plain PHP. It replaces the Node/Fly backend when you're hosting the game on a regular shared host like Siteground.

## What it does

- Same API as the Node backend: `/api/health`, `/api/pubkey`, `/api/scores`, `/api/sign`, `/api/submit`.
- Signs score receipts with the private key sitting **above the webroot** at `../private/pgp-private.asc`.
- Appends each submitted score to a JSON-lines log + maintains a sorted top-500 cache.
- Two PGP backends: prefers the `gnupg` PHP extension, falls back to the `gpg` binary via `proc_open`.

## Layout on disk

```
<account>/
├── private/                       ← NOT web-accessible
│   ├── pgp-private.asc            (chmod 600)
│   ├── pgp-public.asc
│   ├── scores.jsonl               (append-only log of every submission)
│   ├── scoreboard.json            (sorted top 500, regenerated on each write)
│   └── passphrase.txt             (optional, chmod 600)
└── public_html/                   ← webroot — `tetris.rocks/`
    ├── index.html
    ├── …game assets…
    ├── pubkey.asc                 (symlink or copy of ../private/pgp-public.asc)
    └── api/
        ├── .htaccess              (routes /api/* → index.php)
        └── index.php
```

The webroot's `.htaccess` rewrites every `/api/<anything>` request to `api/index.php` which then dispatches internally.

## Deploying via FTP

See [`INSTALL.md`](../INSTALL.md) — the "Siteground / FTP" section. Short version:

1. Upload the game (everything under `public/`) to `tetris.rocks/public_html/`.
2. Upload `server-php/api/` to `tetris.rocks/public_html/api/`.
3. Upload `server-php/.htaccess` to `tetris.rocks/public_html/.htaccess`.
4. Upload `pgp-private.asc` and `pgp-public.asc` to `tetris.rocks/private/` (above the webroot, not inside it). Chmod `pgp-private.asc` to `600`.
5. Copy or symlink `private/pgp-public.asc` to `public_html/pubkey.asc` so users can fetch it directly.
6. Visit `https://tetris.rocks/api/health` — should return `{ok:true, key:true, fingerprint:"…"}`.
