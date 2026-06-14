# Changelog

All notable changes to **tetris** will be documented here. Format inspired by [Keep a Changelog](https://keepachangelog.com/), versioning follows [SemVer](https://semver.org/).

## [1.1.2] — 2026-06-14

### Added
- **Music!** Procedural *Korobeiniki* (the classic Game Boy Tetris theme — public-domain Russian folk song from 1861) rendered live via Web Audio. Two-voice arrangement: square-wave lead + triangle-wave bass. Toggle in Settings → Music. Zero KB shipped — generated entirely from a note-array at runtime.
- **New Modern-theme animations**, all strictly in-place (no horizontal drift):
  - `cta-heartbeat` on the Press Start button: cardiac two-beat pulse (scale + glow).
  - `brand-breathe` on the logo: gentle breathing replaces the previous full 360° rotation.
  - `aurora-breathe` wash behind the board.
  - `stats-glow` staggered pulse on score/lines/level/time values.
  - `hud-underline-pulse` animated accent under each HUD label.
  - `overlay-glow` subtle vignette pulse on the Press Start / Pause / Game Over card.

### Fixed
- **Name input swallowed letters**: typing “p”, “c”, “x”, “z”, etc. in the score-submit form was triggering pause / hold / rotate because the global keyboard handler intercepted every keydown. Input now bails out when focus is on a text field.
- **Press-Start animation slid off to the right** (`translateX` shimmer). Replaced with a contained heartbeat scale; nothing leaves the button bounds anymore.
- **“Server unreachable” on score submit**: Siteground’s `sgcaptcha` bot-protection layer was serving HTML CAPTCHA pages in response to JSON POSTs from new IPs. Added explicit `Accept: application/json` + `X-Requested-With: XMLHttpRequest` headers, a content-type check that throws clean on HTML responses, and an `.htaccess` directive to mark `/api/*` as already-challenged.

### Changed
- README version badge now links to the matching GitHub release.

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
