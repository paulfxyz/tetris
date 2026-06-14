# Changelog

All notable changes to **tetris** will be documented here. Format inspired by [Keep a Changelog](https://keepachangelog.com/), versioning follows [SemVer](https://semver.org/).

## [1.1.0] — 2026-06-14

### Added
- **PHP scoreboard backend** in [`server-php/`](server-php/). A single-file API (`api/index.php`) that runs on any shared PHP host (PHP 7.4+) using either the `gnupg` extension or the `gpg` binary. Private key lives **above** the webroot. This is the backend running in production on [tetris.rocks](https://tetris.rocks/).
- **Same-origin `/api` auto-detection** in the frontend: when the game is served over HTTPS, the scoreboard client now defaults to the same origin, so deploying to a domain with the PHP backend co-located just works — no settings needed.
- Production deployment + docs for **Siteground / shared FTP** hosts.

### Changed
- Renamed `server/` → `server-node/` to reflect that there are now two interchangeable backends.
- `README.md` and `INSTALL.md` now feature `tetris.rocks` and document the PHP path as primary, with Fly.io as alternative.

## [1.0.0] — 2026-06-14

First public release.

### Added
- Pure-JS Tetris engine: 7-bag random generator, SRS-style wall kicks, hold, ghost piece, lock delay.
- Three themes — Classic (B&W, Game Boy / terminal), Color (GBC pixel art), Modern (glass with animations) — each with dark and light modes.
- Keyboard controls (arrow keys, `X` / `Z`, `C`, `Space`, `P`).
- Touch controls — drag to move, tap to rotate, fast swipe-down for hard drop.
- On-screen virtual D-pad (auto-shown on touch devices, configurable).
- Zoom in / out / fit-to-screen with localStorage persistence.
- Animated tetromino background, theme-aware.
- HUD: live score, lines, level, time, hold slot, next-4 queue.
- Procedural SFX via Web Audio API.
- Service worker for offline play (PWA, installable).
- Game-over flow with name / tagline / email form.
- Signed-`.txt` score receipt — downloadable and PGP-signed by the configured server.
- Local-only fallback: when no server is configured, the game stores scores in `localStorage` and produces an unsigned receipt.
- Public scoreboard backend (Fly.io + SQLite + Fastify + openpgp).
- `keygen` script to generate an Ed25519 PGP keypair for the server.
- Full README, INSTALL guide, verification docs, MIT license.
