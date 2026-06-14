# Changelog

All notable changes to **tetris** will be documented here. Format inspired by [Keep a Changelog](https://keepachangelog.com/), versioning follows [SemVer](https://semver.org/).

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
