# Changelog

All notable changes to **tetris** will be documented here. Format inspired by [Keep a Changelog](https://keepachangelog.com/), versioning follows [SemVer](https://semver.org/).

## [1.5.6] — 2026-06-14

### Fixed
- **Vpad reveal-on-touch is now reliable.** Two bugs combined: (1) the touch listener was bound to `#game-canvas`, but the canvas is pinned to the bottom of `.board-frame` and is smaller than the playfield area — touches in the strip above the canvas hit the frame, not the canvas, so no reveal. (2) Touches landing in the gaps between vpad buttons hit the `.vpad` div itself (which has `pointer-events: auto` while revealed) but didn't trigger any handler, so the 3 s auto-hide timer would fire while the user was still mid-touch. Fixes: the touchstart listener is now bound to `.board-frame` (full play container), and a `pointerdown` listener on `.vpad` itself keeps the pad alive whenever any part of it is touched.
- **Start, pause, and game-over modals are now real full-screen takeovers on mobile.** The floating mobile-bar and vpad were bleeding through on top of the `.overlay` and native `<dialog>` backdrops in iOS Safari and Chrome iOS — a known WebKit quirk where `position: fixed` siblings can paint above the top-layer. A `MutationObserver` now toggles `body.dialog-open` whenever any `<dialog>` opens, and `body:has(.overlay:not([hidden]))` catches the title/pause/game-over overlay. Both selectors force `display: none` on the bar and vpad while a modal is up. Overlay backdrop also strengthened from `rgba(0,0,0,.72)` → `.85` and the native dialog backdrop from `.55` → `.78` with 8 px blur.
- **Overlay z-index bumped from 50 → 60** so it sits above the mobile-bar (30) and vpad (25) on every browser, top-layer support or not.

### Added
- **Mobile heads-up on the title screen.** A small italic line under the cheat-sheet: *"tip: this game shines on tablet or laptop"*. Only shows on viewports ≤ 760 px and only on the title screen — never during gameplay, pause, or game over.

## [1.5.5] — 2026-06-14

### Changed
- **Mobile vpad centered vertically.** After landing v1.5.4 with the vpad pinned to the bottom edge, mid-screen actually reads better: the canvas is now pinned to the bottom of the frame, so the bottom playfield rows live in the natural "action zone," and a d-pad floating at viewport center sits exactly where the thumb naturally rests. Switched from `top: calc(100dvh - h - safe-area)` to `top: 50%; transform: translate(-50%, -50%)`. Bonus: the viewport center is the viewport center on every iOS browser, so the pad no longer cares whether Safari or Chrome/Comet is doing the painting.

## [1.5.4] — 2026-06-14

### Fixed
- **Playfield now hugs the bottom of the screen on mobile.** `.board-frame` switched from `align-items: center` to `align-items: flex-end`. The canvas snaps to an integer cell size, so there's always a few px of slack between `--board-h` and the height budget — centering split that slack equally top & bottom, leaving 80–170 px of empty black under the bottom playfield row. Pinning to flex-end pushes all the slack up under the floating mobile-bar instead; the bottom row of the board now sits right above the home-indicator.
- **Vpad reveals on every touch, not just on "ambiguous" gestures.** The v1.5.0 reveal logic only fired when a touch matched no other gesture — in practice it almost never triggered, because every touch either tapped, dragged, swiped, or long-pressed. Now `touchstart` always lifts the pad to full opacity for 3 s, so the buttons are visible the moment the user touches the board.
- **Vpad bottom anchor uses `top: calc(100dvh - ...)` instead of `bottom`.** With the document locked via `position: fixed` for scroll-prevention, iOS Safari anchors `position: fixed; bottom: 0` to the layout viewport (the larger one that ignores collapsing chrome), not the visual one. Computing the top edge from `100dvh` directly sidesteps the layout-vs-visual viewport drama — the pad lands at the real bottom edge of the painted area on every device.

### Changed
- **Default vpad opacity 0.08 → 0.15** so the pad is visible as a hint at game start (still subtle enough not to compete with the board).

## [1.5.3] — 2026-06-14

### Fixed
- **Mobile: vpad now actually anchors to the bottom of the screen.** On iOS Safari with `html, body { position: fixed; height: 100% }`, the body locks to the *layout* viewport (the larger one that ignores Safari's bottom chrome) so `position: fixed; bottom: 0` was painting ~200 px above the visible bottom edge of the screen. Switched the lock to `height: 100dvh` so the body tracks the *visual* viewport, and `bottom: env(safe-area-inset-bottom) + 2px` now lands the vpad just above the home-indicator as intended.

### Changed
- **Mobile top bar tucked tighter to the status bar.** Dropped the extra `+ 6px` padding above the safe-area inset — the chip now starts at `max(4px, env(safe-area-inset-top))`, recovering ~14 px of vertical room for the board.

## [1.5.2] — 2026-06-14

### Changed
- **Vpad sits at the actual viewport bottom and reads as a near-invisible hint.** Default opacity dropped from 0.18 to 0.08 (still a hint, but no longer competing with the board), grid centered with `left: 50%; transform: translateX(-50%)`, width capped at `min(360px, 100vw - 16px)` so it doesn't span the whole row, and button heights tightened to `clamp(38px, 6dvh, 50px)`. The pad now occupies a thumb-reach footprint instead of a full-width strip.

### Fixed
- **Page no longer rubber-band-scrolls when you swipe down on the board.** Three changes work together: (1) `touch-action: none` on `.board-frame` tells iOS we handle every gesture, (2) the `touchstart`/`touchmove` listeners switched from `{ passive: true }` to `{ passive: false }` so `e.preventDefault()` actually takes effect on each move event, and (3) `html, body` get `position: fixed; overflow: hidden; touch-action: none` on mobile so the document is removed from the scroll container entirely. Pull-to-refresh and the rubber-band overscroll are both gone.

## [1.5.1] — 2026-06-14

### Fixed
- **Mobile black-screen regression (critical).** v1.5.0 added mirrored HOLD/NEXT mini-canvases to the floating mobile bar (36 × 36 CSS px). At those tiny sizes the renderer's inset math for the glass "sheen" highlight produced a negative width, which made `roundRect()`'s polyfill call `arcTo()` with a negative radius. Every Tetris frame then threw `Failed to execute 'arcTo' on 'CanvasRenderingContext2D': The radius provided (-2.66667) is negative` — the main board never painted, leaving a fully black playfield on every iPhone. Two defenses: `roundRect()` now short-circuits when width or height is non-positive and clamps the radius to `>= 0`; `drawMini()` clamps the per-cell size to a `>= 2 px` floor so the mobile chips degrade to flat tiles instead of crashing the frame.
- **Desktop regression.** v1.5.0's `.mobile-bar` HTML element fell back to its default block layout on desktop because every styling rule lived inside the `@media (max-width: 760px)` query — so HOLD/score/lvl/lines/time/NEXT and the two mini-canvases leaked into the top-left of the desktop layout. Added a default `.mobile-bar { display: none }` rule outside the media query; the mobile query re-enables it with `display: flex`. Desktop is back to its pre-v1.5.0 chrome.

## [1.5.0] — 2026-06-14

### Added
- **Mobile: complete rebuild around gestures.** The board now fills the entire viewport edge-to-edge — no chrome, no padding, no rounded frame. Five classic mobile Tetris gestures: tap = rotate, drag left/right = move (one cell per 22 px), drag down = soft drop, **swipe up** = hard drop, long-press = hold. The mapping flips v1.4.x's "swipe down = hard drop" to match the convention every modern Tetris mobile client uses.
- **Floating mobile bar.** A single horizontal chip at the top of the viewport (HOLD · score/level/lines/time · NEXT · light·dark / settings) replaces the side HUDs. Backdrop-blurred over the board so the playfield underneath is still visible — the chip floats, doesn't displace.
- **Discovery hint vpad.** The virtual D-pad is now always present at 18 % opacity so new players notice it exists. Any ambiguous touch (a release that wasn't a tap, swipe, drag, or long-press) reveals the pad at full opacity for 3 seconds. Tap a button to act — the timer resets so you can keep using it. Tap the board to dismiss early.
- **Renderer mirroring.** `Renderer` now accepts optional `holdCanvasMobile` / `nextCanvasMobile` and mirrors the HOLD and NEXT previews into them every frame. Desktop HUD canvases are unchanged.

### Changed
- `availableBoardHeight()` rewritten for mobile: budget is `100dvh − floating-mobile-bar.bottom − safe-area-bottom − breathing room`. The mobile-bar floats `position:fixed` so the old sibling-subtraction loop missed it.
- `availableBoardWidth()` on mobile is now full `window.innerWidth` — board-frame has zero padding and zero border, so the canvas can use every pixel.
- `bindTouch()` adds long-press detection (500 ms), swipe-up = hard drop, ambiguous-touch → vpad reveal, and a `touchcancel` cleanup path. Long-press fires once and consumes the trailing touchend so it doesn't also rotate.
- Vpad pointer-events default to `none` (so touches pass through to the board) and flip to `auto` only while `body.vpad-reveal` is set.
- Service worker cache bumped to `tetris-v1.5.0`.
- README badge → 1.5.0.

### Fixed
- Mobile no longer shows a black playground. The board fills the viewport at all phone sizes from iPhone SE to iPhone 16 Pro Max, and the overlay (title / pause / game-over) covers the full screen with a solid background.

## [1.4.3] — 2026-06-14

### Fixed
- **Desktop: blocks bleeding past the right edge of the board frame.** Global `box-sizing: border-box` (set on `*`) meant `.board-frame`'s 8px padding + 1px border ate 18px off its content area. The canvas was sized to the full `--board-w`, so its right column rendered ~18px outside the frame. Fix: `.board-frame { width: max-content; overflow: hidden }` so the frame shrink-wraps the canvas, and the desktop grid's middle column is now `auto` instead of `var(--board-w)`. As a safety net, `availableBoardWidth()` now also subtracts the frame's horizontal padding + border from the width budget (mirroring what `availableBoardHeight()` already did).
- **Mobile: empty playground on iPhone.** Two compounding bugs. (1) `.game-wrap` used `grid-template-columns: 1fr`, stretching the frame to full stage width while the canvas (sized from JS to the integer cell) stayed much smaller — most of the frame was empty space. (2) The overlay used `color-mix()` + `backdrop-filter: blur()`, both of which can fail silently on iOS Safari, leaving the title screen invisible. Fix: mobile grid is now `auto` + `justify-items: center` so the frame shrink-wraps the canvas, and the overlay uses a solid `rgba(0,0,0,.65)` background with `backdrop-filter` disabled on mobile.
- **Mobile: vpad too tall, eating board height.** Buttons were `clamp(52px, 9.5dvh, 72px)` with 8px gap — ~152px of two-row vpad. Trimmed to `clamp(40px, 7dvh, 56px)` with 6px gap — ~118px, giving the board ~34 extra pixels of vertical room (more cells, larger pieces).

### Changed
- Service worker cache bumped to `tetris-v1.4.3`.
- README badge → 1.4.3.

## [1.4.2] — 2026-06-14

### Added
- **HOLD ghost preview.** When the HOLD slot is empty, the panel now shows a low-opacity (18%) ghost of the CURRENT piece instead of empty space. Hints at what hitting C will store and gives the HUD a calmer, more intentional look on desktop. The on-board ghost system was already there — this just reuses `drawCell({ ghost: true })` inside the HOLD mini-canvas, no new rendering code.

### Changed
- Service worker cache bumped to `tetris-v1.4.2`.
- README badge → 1.4.2.

## [1.4.1] — 2026-06-14

### Fixed
- **Bottom-of-frame empty band on desktop and mobile.** v1.4.0 set `--board-h` from JS and derived `--board-w` via CSS `calc(--board-h / 2)`, with a 200 ms transition on the property. After a zoom or resize, the renderer (called via double-rAF) measured the canvas mid-tween: width was still catching up while the height kept growing toward its final value. The renderer locked in a cell size based on the intermediate width, so the play grid stopped short of the bottom of the frame — the empty rectangle visible in the screenshot.
- **New sizing model.** `cell` (in integer CSS pixels) is now the single source of truth. JS computes the largest integer cell that fits both the height and width budgets, then sets BOTH `--board-h = cell * 20` AND `--board-w = cell * 10` explicitly on `.game-wrap`. CSS no longer derives one dimension from the other.
- **No CSS transition on board dims.** The instant snap eliminates the mid-tween mismatch entirely. Zoom and resize still feel smooth because the per-step delta is small; what users gain is pixel-exactness at every step.
- **Mobile budget unchanged but now correct.** Same chip-strip + vpad chrome math as v1.4.0, but the board itself is now guaranteed to fill the frame to the pixel on every iPhone-class device, including SE.

### Changed
- Service worker cache bumped to `tetris-v1.4.1`.
- README badge → 1.4.1.

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
