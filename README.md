# 🟦 tetris (1.0.0)

> Drop, line, repeat. A modern, offline-capable Tetris in pure HTML/JS — keyboard, touch & virtual pad, three themes (Classic B&W, Color, Modern Glass), and a **PGP-signed** scoreboard.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![No deps](https://img.shields.io/badge/frontend-zero%20deps-brightgreen)](#)
[![Offline ready](https://img.shields.io/badge/PWA-offline%20ready-success)](#)
[![PGP signed](https://img.shields.io/badge/scores-PGP%20signed-yellow)](#)

---

## Why

Because every developer should have one Tetris in their portfolio, and because the web platform — vanilla JS, Canvas, Web Audio, service workers, the `<dialog>` element — is more than enough to ship a real game without a framework.

This one also happens to **cryptographically sign your high scores** so you can prove you actually got them.

## Features

- 🎮 **Full Tetris guideline-ish gameplay** — 7-bag random, SRS-style kicks, hold, ghost piece, lock delay, soft/hard drop, level curve, T-spin-friendly scoring.
- 🎨 **Three themes**, two modes, all switchable on the fly:
  - **Classic** — pure B&W, Game Boy DMG / terminal vibe.
  - **Color** — Game Boy Color pixel art with crunchy highlights and shadows.
  - **Modern** — glass tetrominoes with sheen, animations, neon accents.
- 📱 **Plays everywhere** — keyboard, touch (swipe to move, tap to rotate, swipe-down to hard drop), and an on-screen **virtual D-pad** that appears automatically on touch devices.
- 🔍 **Zoom in/out / fit to screen** — board scales independently for tired eyes and tiny phones.
- 🌑 **Plays offline** — PWA + service worker cache. Install it on your phone.
- 🪪 **PGP-signed scoreboard receipts** — finish a game, drop your name/tagline/email, and either download a signed `.txt` you can verify with `gpg --verify`, or submit it to the public scoreboard.
- 🛠️ **Tiny self-hostable backend** — Node + Fastify + SQLite on Fly.io. Holds the PGP private key as a secret. Public key in the repo at [`docs/PUBKEY.asc`](docs/PUBKEY.asc).
- 0️⃣ **Zero frontend dependencies** — no React, no build step, no bundler. Just open `public/index.html`.

## Quickstart

```bash
git clone https://github.com/paulfxyz/tetris.git
cd tetris/public
python3 -m http.server 8000      # or any static server
open http://localhost:8000
```

To run the scoreboard server + PGP signing, see [INSTALL.md](INSTALL.md).

## Controls

| Action            | Keyboard            | Touch                       | Virtual pad |
| ----------------- | ------------------- | --------------------------- | ----------- |
| Move left / right | `←` / `→`           | Drag left / right           | ◀ / ▶       |
| Soft drop         | `↓`                 | Drag down                   | ▼           |
| Hard drop         | `Space`             | Swipe down quickly          | ⤓           |
| Rotate CW         | `↑` or `X`          | Tap                         | ↻           |
| Rotate CCW        | `Z`                 | —                           | —           |
| Hold              | `C` or `Shift`      | —                           | H           |
| Pause             | `P` or `Esc`        | —                           | —           |

DAS (delayed auto-shift) is built in for both keyboard and the virtual pad.

## Scoring

| Lines | Base score | × Level |
| ----- | ---------- | ------- |
| 1     | 100        | × level |
| 2     | 300        | × level |
| 3     | 500        | × level |
| 4 (Tetris) | 800   | × level |
| Combo (+ each consecutive clear) | 50 × combo × level |
| Back-to-back Tetris | × 1.5 multiplier |
| Soft drop | +1 per cell |
| Hard drop | +2 per cell |

Level advances every 10 lines. Gravity is `1000 × 0.85^(level-1)` ms per cell (clamped to 50 ms minimum).

## Project layout

```
tetris/
├── public/                  # the game — static, no build needed
│   ├── index.html
│   ├── manifest.webmanifest
│   ├── sw.js                # service worker (offline cache)
│   ├── css/
│   │   ├── base.css
│   │   ├── themes.css       # classic / color / modern × dark / light
│   │   └── game.css
│   ├── js/
│   │   ├── app.js           # wires it all together
│   │   ├── engine.js        # pure game logic — no DOM
│   │   ├── renderer.js      # canvas board + hold + next
│   │   ├── input.js         # keyboard + touch + virtual pad
│   │   ├── background.js    # animated tetromino field
│   │   ├── sound.js         # procedural SFX
│   │   ├── scoreboard.js    # talks to the server, falls back to localStorage
│   │   └── storage.js       # settings persistence
│   └── assets/favicon.svg
├── server/                  # PGP signing + scoreboard API (Fly.io)
│   ├── index.js
│   ├── scripts/keygen.js    # generates a fresh PGP keypair
│   ├── Dockerfile
│   ├── fly.toml
│   └── package.json
├── docs/
│   ├── PUBKEY.asc           # YOUR public key — replace before deploying
│   └── VERIFY.md            # how to verify a signed receipt
├── INSTALL.md               # set up the server + generate the PGP key
├── CHANGELOG.md
├── CONTRIBUTING.md
├── LICENSE
└── README.md
```

## Signed receipts — what they look like

```
-----BEGIN PGP SIGNED MESSAGE-----
Hash: SHA256

===== TETRIS SCORE — SIGNED RECEIPT =====

Name:        Paul
Tagline:     just one more line…
Email:       hello@paulfleury.com

Score:       42360
Lines:       73
Level:       8
Time played: 6:42
Pieces:      214
Hard drops:  87
Soft drops:  1106
Rotations:   329
Holds:       12
Tetrises:    4
Max combo:   5

Theme:       modern
Client:      tetris 1.0.0
Played at:   2026-06-14T12:18:03.122Z
Public rank: #12

Issued at:   2026-06-14T12:18:03.401Z
Issuer key:  9C5E …  (your fingerprint)
-----BEGIN PGP SIGNATURE-----
…
-----END PGP SIGNATURE-----
```

Verify with `gpg --verify your-score.txt` after importing `docs/PUBKEY.asc`.

## Privacy

- Email is **optional** and only used to disambiguate scoreboard entries — it is never published.
- The server stores: name, tagline (public), score, lines, level, duration, pieces, theme, played-at, and email (private).
- No tracking, no cookies, no third-party scripts.

## License

[MIT](LICENSE). Fork, remix, ship.

---

Built with care by [@paulfxyz](https://github.com/paulfxyz) — part of the small-tools series alongside [`junk`](https://github.com/paulfxyz/junk), [`enki`](https://github.com/paulfxyz/enki), [`hollr`](https://github.com/paulfxyz/hollr), [`meet`](https://github.com/paulfxyz/meet) and friends.
