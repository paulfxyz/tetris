# Changelog

All notable changes to **tetris** will be documented here. Format inspired by [Keep a Changelog](https://keepachangelog.com/), versioning follows [SemVer](https://semver.org/).

## [1.4.0] — 2026-06-14

### Added
- **Real mobile layout.** A dedicated single-screen design under 760 px wide: slim topbar, HOLD/STATS/NEXT chip strip above the board, board flush-centered, virtual pad pinned to the bottom with big touch targets. No more scrolling, no more wasted vertical space, no more tiny board.
- **Hero hard-drop button.** The `⤵` button in the vpad is accent-tinted and weight-bumped — the most important touch action is now the most prominent.
- **Landscape phone layout.** When the device is < 900 px wide AND < 500 px tall, the vpad moves next to the board (right side) instead of stacking below it, so the board can still use the full viewport height.
- **Extra-small breakpoint (≤ 360 px).** Tighter chip padding, smaller HOLD/NEXT icons, and shorter vpad buttons so the game fits cleanly on iPhone SE-sized screens.

### Changed
- Mobile topbar hides zoom buttons (the board auto-fits the viewport — manual zoom is a desktop windowing affordance).
- Mobile hides the footer (single-screen rule). The version badge in the topbar still links to the GitHub release.
- HOLD / NEXT canvases are now icon-sized chips on mobile, not full panels.
- Vpad: 6 buttons in a 3×2 grid (◀ ↻ ▶ / H ▼ ⤵), `clamp(52px, 9.5dvh, 72px)` tall.
- Service worker cache bumped to `tetris-v1.4.0`.
- README badge → 1.4.0.

### Fixed
- `computeFittedHeight()` now also subtracts the board-frame's own padding/border on both desktop and mobile, so the play grid lands flush against the frame inner edge.

## [1.3.0] — 2026-06-14

### Fixed
- **Pixel-perfect zoom across every device.** The play grid (10 cols × 20 rows) now stays exactly inside the board frame at every zoom level. Previous versions had two failure modes when zooming: the bottom row could either clip below the frame, or leave an empty strip under it — caused by `--board-h` taking a non-integer-times-20 value, so the renderer's cell size (`canvas.width / 10`) had a fractional residual.
- **Grid-locked sizing.** `--board-h` is now always snapped to a multiple of `ROWS` (= 20). That makes each cell an integer number of CSS pixels, so 20×cell lands precisely on the bottom edge of the canvas regardless of viewport or zoom multiplier.
- **Honest mobile reservation.** Vertical budget on mobile is measured from the actual rendered HUD + vpad heights via DOM rects, instead of guessing with a hardcoded reserve. Phones, tablets, and shrunken windows all converge on the largest grid-aligned board that fits.
- **No more independent mobile clamps.** Mobile no longer applies separate `min(width, 80vw)` and `min(height, 160vw)` to the canvas — those broke the 1:2 ratio when one axis clamped but the other didn't. JS sizes the board to fit the viewport, CSS just inherits.
- **Renderer bitmap stays in lockstep.** After every `applyBoardSize()`, the renderer re-syncs its DPR-scaled bitmap on a double `requestAnimationFrame` so layout has fully flushed before `getBoundingClientRect()` is read.

### Changed
- `BOARD_MIN_H = 280` (was 360) so very tight viewports can still show 14 px cells.
- Resize/orientationchange handlers are now debounced via rAF.
- Service worker cache bumped to `tetris-v1.3.0`.
- README badge → 1.3.0.

## [1.2.2] — 2026-06-14

### Fixed
- **Sustainable zoom/scaling rewrite.** Replaced the legacy `transform: scale()` + clamp-on-canvas combo with a single CSS variable, `--board-h`, that drives every dependent dimension (canvas size, HUD widths, gap). The canvas grows and shrinks in real CSS pixels, so the bitmap (`canvas.width × DPR`) is always in lockstep with `getBoundingClientRect()` — no smear trails on zoom-out, no empty space below the board on certain viewport heights, no aspect-ratio glitches.
- **fitToScreen is now device-aware.** It computes the available height/width budget from the actual stage rect, accounting for mobile stacking and the virtual pad, then clamps the result to `[360px, 920px]`. Manual zoom (60–160%) is a multiplier on top of the fitted base, so "Fit" then "+"/"−" composes correctly.
- **Viewport resilience.** Listens to `resize` and `orientationchange` so the board re-fits when the keyboard appears, an iOS browser bar collapses, or the user rotates the device.

### Changed
- Service worker cache bumped to `tetris-v1.2.6`.
- README badge → 1.2.2.

## [1.2.1] — 2026-06-14

### Added
- **Hold-box hint.** The HOLD panel now shows `C or Shift` on desktop and `tap H` on touch devices, so players discover the swap mechanic without reading docs.
- **Brand reload + version link.** Clicking the `tetris` logo reloads the page; the `vX.Y.Z` badge links to that exact GitHub release in a new tab.

### Fixed
- **Canvas trail / smear on zoom-out.** When the board was scaled down via CSS `transform: scale()`, `drawBoard()` cleared in CSS-rect coordinates while the bitmap kept its larger dimensions — leaving stale pixels in the un-cleared region, visible as diagonal trails below the lowest blocks. The board now wipes the FULL bitmap each frame (same pattern already used by `drawMini` for HOLD / NEXT), and manual zoom triggers `renderer.resize()` so the bitmap matches the new CSS size.
- **Zoom +/− buttons now stick.** Clicking “Fit to screen” had set a `fit: true` flag that `applySettings()` honored on every subsequent action, immediately overwriting any manual zoom. Manual zoom now clears `fit` so the user's choice persists.
- **Skip button in the score modal closes the dialog.** It was silently swallowed by HTML5 form validation on the `required` Name input; `formnovalidate` lets Skip bypass validation.

### Changed
- Score-save modal status line is friendlier and clearer: "Your score will be PGP signed upon download or submission." followed by current server reachability.
- Modal placeholders refreshed: `John Doe` (name), `I'm a Tetris fan` (tagline).
- Service worker cache bumped to `tetris-v1.2.4`.
- README badge → 1.2.1.

## [1.2.0] — 2026-06-14

### Added
- **Real music!** Ships a bundled CC0 chiptune MP3 (“Happy Adventure (Loop)” by Bart Kelsey, public-domain, ~620 KB) played via a plain `<audio loop>` element. Replaces the v1.1.x procedural Korobeiniki Web Audio synth, which silently failed on many browsers due to autoplay restrictions and tab throttling. Toggling Music in Settings now reliably plays / pauses the loop.

### Fixed
- **Signed scoreboard receipts now actually sign.** The PHP backend resolved the private-key directory to `<webroot>/../private/`, which on Siteground's per-domain layout is `~/tetris.rocks/private/` — a different directory than the FTP-account-root `~/private/` where the keys lived. PHP now probes several candidate locations and uses whichever contains the key file. The deploy script also uploads keys to **both** locations as belt-and-suspenders. As a result the downloaded `.txt` is a real PGP cleartext-signed receipt, verifiable with `gpg --verify`.
- `/api/health` now reports `private_dir` and `priv_key_present` so future key-misplacement issues are immediately visible.

### Changed
- Service worker cache bumped to `tetris-v1.2.0` and now precaches `assets/music.mp3` so the music plays offline too.
- README version badge → 1.2.0.

## [1.1.3] — 2026-06-14

### Changed
- **Press Start CTA animation** swapped from "heartbeat scale" to a **shake** — a symmetric left/right wobble (±4px) with a long rest phase. Zero net displacement; the button starts and ends at exactly the same X.
- **Music is on by default.** New users get Korobeiniki the moment they hit Press Start. Existing users whose `music` preference is already saved keep their choice.

### Fixed
- **Music wasn't actually starting** for most users. The Settings dialog now toggles music *live* the moment the checkbox changes (instead of only after pressing Save). Clicking the checkbox is itself a user gesture, which is what browsers require to unlock the AudioContext.
- Same live-toggle now applies to the SFX checkbox.

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
