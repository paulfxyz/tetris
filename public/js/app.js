// tetris — app.js
// ============================================================================
// THE GLUE.
//
// This is where everything is wired together. It owns:
//   - the boot sequence (apply settings, create modules, show title screen)
//   - the requestAnimationFrame loop (calls engine.tick + renderer.draw)
//   - the overlay state machine (title / playing / paused / game-over)
//   - the settings dialog (theme/mode/zoom/sfx/server URL)
//   - the game-over receipt flow (submit to server OR download local file)
//   - service-worker registration
//
// app.js is intentionally the "messy" file: it knows about every other
// module. That's fine — the other modules know about nothing.
// ============================================================================

import { Engine } from './engine.js';
import { Renderer } from './renderer.js';
import { Input } from './input.js';
import { Background } from './background.js';
import { Sound } from './sound.js';
import { settings } from './storage.js';
import { Scoreboard } from './scoreboard.js';

// Bump this string on every release; it ends up inside every signed receipt
// so users can prove which client version played the game. Pair it with the
// version string in index.html for consistency.
const CLIENT_VERSION = '1.2.1';

// Convenience: jQuery's $ but it's just querySelector.
const $ = (q) => document.querySelector(q);

// ---------------------------------------------------------------------------
// Apply settings → DOM
// ---------------------------------------------------------------------------
// Persisted preferences live in localStorage (via storage.js). They control:
//   - <html data-theme=…> and <html data-mode=…> (CSS themes pick this up)
//   - --zoom CSS variable on #game-wrap (zoom in/out)
//   - body.vpad-on class (show on-screen D-pad)
//   - "fit to screen" auto-zoom on small viewports
function applySettings() {
  const s = settings.state;
  document.documentElement.dataset.theme = s.theme;
  document.documentElement.dataset.mode = s.mode;
  const zoom = (s.zoom || 100) / 100;
  document.getElementById('game-wrap').style.setProperty('--zoom', zoom);

  // Virtual pad visibility: 'always', 'never', or 'auto' = show on coarse pointer
  // (i.e., touch devices). matchMedia('(pointer: coarse)') is the canonical check.
  const wantsVPad = s.vpadMode === 'always'
    || (s.vpadMode === 'auto' && matchMedia('(pointer: coarse)').matches);
  document.body.classList.toggle('vpad-on', wantsVPad);

  if (s.fit) fitToScreen();
}

// Measure the game wrapper against its parent and pick a uniform scale that
// makes it fit. We have to do the measurement on the next frame because
// changing --zoom and reading dimensions in the same frame returns stale values.
function fitToScreen() {
  const wrap = document.getElementById('game-wrap');
  wrap.style.setProperty('--zoom', 1);
  requestAnimationFrame(() => {
    const wrapRect = wrap.getBoundingClientRect();
    const stage = wrap.parentElement.getBoundingClientRect();
    const padded = stage.height - 40;                         // 40 px headroom
    const scale = Math.min(1.6, Math.max(0.5, padded / wrapRect.height));
    wrap.style.setProperty('--zoom', scale);
    settings.set('zoom', Math.round(scale * 100));
  });
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
applySettings();

// One Engine, one Sound, one Renderer, one Background, one Scoreboard. These
// live for the entire page lifetime — switching themes / modes / restarting
// the game does NOT re-create them.
const engine = new Engine();
const sound = new Sound();
const renderer = new Renderer({
  canvas: $('#game-canvas'),
  holdCanvas: $('#hold-canvas'),
  nextCanvas: $('#next-canvas'),
});
const bg = new Background($('#bg-canvas'));
const scoreboard = new Scoreboard();

// Game-session stats — fed into the PGP-signed receipt at game over.
// `pieces` starts at 1 because the first piece is spawned by the engine
// before the player makes any move (so it never gets counted via trackPiece).
const stats = { pieces: 0, holds: 0, hardDrops: 0, softDrops: 0, rotates: 0, maxCombo: 0, tetrises: 0 };
let started = false;
let lastTickActedOnPiece = engine.current;

// Called every frame from the game loop. Detects when the current piece
// reference changes (a new piece spawned) and increments the piece counter.
// Also tracks max combo and total Tetrises for the receipt.
const trackPiece = () => {
  if (engine.current !== lastTickActedOnPiece) {
    lastTickActedOnPiece = engine.current;
    stats.pieces++;
  }
  if (engine.combo > stats.maxCombo) stats.maxCombo = engine.combo;
  if (engine.lastClear?.n === 4) stats.tetrises++;
};

// ---------------------------------------------------------------------------
// Overlay state machine
// ---------------------------------------------------------------------------
// One <div id="overlay"> hosts three screens: title, paused, game-over. We
// just swap innerHTML and re-bind buttons. Tiny, no framework, no router.
const overlayEl = $('#overlay');
const overlayCard = $('#overlay-card');

function showOverlay(html) {
  overlayCard.innerHTML = html;
  overlayEl.hidden = false;
}
function hideOverlay() { overlayEl.hidden = true; }

function titleScreen() {
  showOverlay(`
    <h1>tetris</h1>
    <p>drop, line, repeat.</p>
    <button class="cta" id="overlay-start">Press Start</button>
    <small>↑ rotate · ← → move · ↓ soft · space drop · C hold · P pause</small>
  `);
  $('#overlay-start').addEventListener('click', startGame);
}
function pausedScreen() {
  showOverlay(`
    <h1>paused</h1>
    <p>take a breath.</p>
    <button class="cta" id="overlay-resume">Resume</button>
    <small>P or Esc to resume</small>
  `);
  $('#overlay-resume').addEventListener('click', () => action('pause'));
}
function gameOverScreen() {
  showOverlay(`
    <h1>game over</h1>
    <p><strong>${engine.score.toLocaleString()}</strong> pts · ${engine.lines} lines · lvl ${engine.level}</p>
    <button class="cta" id="overlay-submit">Save score</button>
    <button class="cta" id="overlay-again" style="background:transparent;color:var(--color-text);border:1px solid var(--color-border)">Play again</button>
  `);
  $('#overlay-submit').addEventListener('click', openGameOver);
  $('#overlay-again').addEventListener('click', startGame);
}

function startGame() {
  engine.reset();
  Object.assign(stats, { pieces: 1, holds: 0, hardDrops: 0, softDrops: 0, rotates: 0, maxCombo: 0, tetrises: 0 });
  lastTickActedOnPiece = engine.current;
  started = true;
  hideOverlay();
  // Audio contexts on iOS/Safari only unlock after a user gesture — this
  // click is that gesture, so we call sound.ensure() here, not on boot.
  // The same gesture also starts music if the user has it enabled.
  sound.ensure();
  if (settings.get('music')) sound.setMusic(true);
}

titleScreen();

// ---------------------------------------------------------------------------
// Action handler — the Input module emits these strings.
// ---------------------------------------------------------------------------
// If a game hasn't started (title or game-over), only 'drop' (Space) and
// 'rotate' (Up/X/tap) act as "press any key to start". Other actions are
// ignored. Once a game is running, we route into the engine and play SFX.
function action(a) {
  if (!started || engine.gameOver) {
    if (a === 'drop' || a === 'rotate') startGame();
    return;
  }
  if (engine.paused && a !== 'pause') return;
  switch (a) {
    case 'left':       if (engine.move(-1)) sound.move(); break;
    case 'right':      if (engine.move(1))  sound.move(); break;
    case 'soft':       if (engine.softDrop()) { sound.move(); stats.softDrops++; } break;
    case 'rotate':     if (engine.rotate(1)) { sound.rotate(); stats.rotates++; } break;
    case 'rotateCCW':  if (engine.rotate(-1)) { sound.rotate(); stats.rotates++; } break;
    case 'hold':       if (engine.holdPiece()) { sound.hold(); stats.holds++; } break;
    case 'drop': {
      const cells = engine.hardDrop();
      if (cells > 0) { sound.drop(); stats.hardDrops++; }
      break;
    }
    case 'pause': engine.togglePause(); if (engine.paused) pausedScreen(); else hideOverlay(); break;
  }
}

const input = new Input({
  boardEl: $('#game-canvas'),
  vpadEl: $('#vpad'),
  onAction: action,
});

// ---------------------------------------------------------------------------
// Settings dialog — <dialog> element + a normal <form>, no React.
// ---------------------------------------------------------------------------
const settingsDialog = $('#settings-dialog');
$('#btn-settings').addEventListener('click', () => {
  // Sync form values to current settings (so the dialog reflects the truth).
  const f = settingsDialog.querySelector('form');
  f.querySelectorAll('input[name=theme]').forEach(i => i.checked = i.value === settings.get('theme'));
  f.querySelectorAll('input[name=mode]').forEach(i => i.checked = i.value === settings.get('mode'));
  f.querySelector('input[name=zoom]').value = settings.get('zoom');
  f.querySelector('output[name=zoom-out]').value = settings.get('zoom') + '%';
  f.querySelector('input[name=fit]').checked = !!settings.get('fit');
  f.querySelector('select[name=vpad-mode]').value = settings.get('vpadMode');
  f.querySelector('input[name=sfx]').checked = !!settings.get('sfx');
  f.querySelector('input[name=music]').checked = !!settings.get('music');
  f.querySelector('input[name=server]').value = settings.get('server') || '';
  settingsDialog.showModal();
});
// Live-update the zoom output label as the range slider moves.
settingsDialog.querySelector('input[name=zoom]').addEventListener('input', (e) => {
  settingsDialog.querySelector('output[name=zoom-out]').value = e.target.value + '%';
});
// Live-toggle music the moment the checkbox changes (without waiting for
// Save). Clicking the checkbox is a valid user gesture, which is what the
// AudioContext needs to unlock on iOS/Safari — so the music can actually
// start playing here even if the player hasn't yet hit Press Start.
settingsDialog.querySelector('input[name=music]').addEventListener('change', (e) => {
  sound.ensure();
  sound.setMusic(e.target.checked);
});
// Same for SFX — toggle live so the player hears the effect on rotate/move.
settingsDialog.querySelector('input[name=sfx]').addEventListener('change', (e) => {
  sound.enabled = e.target.checked;
});
// On close, if the user clicked "Save", harvest form values and persist.
// <dialog>'s returnValue is set by the <button value="save"> that closed it.
settingsDialog.addEventListener('close', () => {
  if (settingsDialog.returnValue !== 'save') return;
  const f = settingsDialog.querySelector('form');
  const fd = new FormData(f);
  settings.patch({
    theme: fd.get('theme'),
    mode: fd.get('mode'),
    zoom: Number(fd.get('zoom')),
    fit: fd.get('fit') === 'on',
    vpadMode: fd.get('vpad-mode'),
    sfx: fd.get('sfx') === 'on',
    music: fd.get('music') === 'on',
    server: (fd.get('server') || '').toString().trim(),
  });
  sound.enabled = settings.get('sfx');
  sound.setMusic(settings.get('music'));
  scoreboard.setServer(settings.get('server'));
  applySettings();
});

// Quick-access buttons in the header bar (skip the dialog).
$('#btn-mode').addEventListener('click', () => {
  settings.set('mode', settings.get('mode') === 'dark' ? 'light' : 'dark');
  applySettings();
});
// Manual zoom buttons disable the auto-fit flag so the user's choice sticks.
// Otherwise applySettings() would immediately overwrite the zoom via fitToScreen().
// We also re-resize the renderer's canvas bitmaps on the next frame so they match
// the new CSS-scaled dimensions (sharper output, no stale-bitmap trails).
function refreshRendererSize() { requestAnimationFrame(() => renderer.resize()); }
$('#btn-zoom-in').addEventListener('click', () => {
  settings.patch({ fit: false, zoom: Math.min(160, settings.get('zoom') + 10) });
  applySettings();
  refreshRendererSize();
});
$('#btn-zoom-out').addEventListener('click', () => {
  settings.patch({ fit: false, zoom: Math.max(60, settings.get('zoom') - 10) });
  applySettings();
  refreshRendererSize();
});
$('#btn-zoom-reset').addEventListener('click', () => {
  settings.set('fit', true);
  fitToScreen();
  refreshRendererSize();
});

// Sync sound + scoreboard with persisted settings at boot. Music is wired
// up but only actually starts after the first user gesture ("Press Start"
// click) because the AudioContext can't be unlocked before that on iOS/Safari.
sound.enabled = settings.get('sfx');
scoreboard.setServer(settings.get('server'));

// ---------------------------------------------------------------------------
// Game-over dialog — collect identity, submit to server (or download local).
// ---------------------------------------------------------------------------
const goDialog = $('#gameover-dialog');
const goForm = $('#gameover-form');

function openGameOver() {
  // Prefill from last-known identity (saved on previous submit).
  const id = settings.get('identity') || {};
  goForm.elements.name.value = id.name || '';
  goForm.elements.tagline.value = id.tagline || '';
  goForm.elements.email.value = id.email || '';
  $('#go-score').textContent = engine.score.toLocaleString();
  $('#go-lines').textContent = engine.lines;
  $('#go-level').textContent = engine.level;
  $('#go-time').textContent = formatTime(engine.elapsedMs());
  // Tell the user whether they're getting a signed or unsigned receipt.
  // Tell the user what's about to happen + current connectivity status.
  const available = scoreboard.serverAvailable();
  $('#go-status').textContent = available
    ? "Your score will be PGP signed upon download or submission. — Server reachable."
    : "Your score will be PGP signed upon download or submission. — Server unreachable: local unsigned receipt only.";
  goDialog.showModal();
}

// Submit handler — receives one of three intents from the form buttons:
//   submit  = sign + persist to server's public scoreboard
//   sign    = sign only (no public listing) and download
//   cancel  = close without action
goForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const intent = e.submitter?.value || 'cancel';
  if (intent === 'cancel') { goDialog.close('cancel'); return; }

  const fd = new FormData(goForm);
  const payload = {
    name: (fd.get('name') || '').toString().trim(),
    tagline: (fd.get('tagline') || '').toString().trim(),
    email: (fd.get('email') || '').toString().trim(),
    score: engine.score,
    lines: engine.lines,
    level: engine.level,
    duration_ms: Math.round(engine.elapsedMs()),
    pieces: stats.pieces,
    hard_drops: stats.hardDrops,
    soft_drops: stats.softDrops,
    rotations: stats.rotates,
    holds: stats.holds,
    tetrises: stats.tetrises,
    max_combo: stats.maxCombo,
    theme: settings.get('theme'),
    client_version: CLIENT_VERSION,
    played_at: new Date().toISOString(),
  };

  // Remember identity for next time so the player doesn't retype their name.
  settings.patch({ identity: { name: payload.name, tagline: payload.tagline, email: payload.email } });

  $('#go-status').textContent = 'Working…';
  try {
    const result = await scoreboard.submit(payload, { store: intent === 'submit' });
    downloadText(`tetris-${payload.name || 'anon'}-${payload.score}.txt`, result.signed_txt);
    if (result.offline) {
      $('#go-status').textContent = 'Offline receipt downloaded. No server submission.';
    } else if (result.accepted) {
      $('#go-status').textContent = `Submitted! Rank #${result.rank ?? '?'} on the public board.`;
    } else {
      $('#go-status').textContent = 'Receipt signed and downloaded.';
    }
    setTimeout(() => goDialog.close('done'), 1200);
  } catch (err) {
    // Network failure — gracefully degrade to an unsigned local receipt so the
    // player still gets something to show for their game.
    $('#go-status').textContent = 'Server unreachable — saved locally instead.';
    scoreboard.saveLocal(payload);
    downloadText(`tetris-${payload.name || 'anon'}-${payload.score}.txt`, localReceiptInline(payload));
  }
});

function localReceiptInline(p) {
  return `----- TETRIS SCORE (OFFLINE — UNSIGNED) -----
Name:    ${p.name}
Tagline: ${p.tagline}
Email:   ${p.email}

Score:   ${p.score}
Lines:   ${p.lines}
Level:   ${p.level}
Time:    ${formatTime(p.duration_ms)}
Pieces:  ${p.pieces}
Date:    ${p.played_at}
Theme:   ${p.theme}
Client:  tetris ${p.client_version}
`;
}

// Standard "download a string as a file" recipe: Blob → object URL → <a download>.
function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  // Free the blob URL after a short delay (the browser needs a moment to start the download).
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// "153000 ms" → "2:33"
function formatTime(ms) {
  const s = Math.floor((ms || 0) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Game loop
// ---------------------------------------------------------------------------
// Standard rAF loop. We compute `dt` (ms since last frame) and clamp it at
// 100 ms to prevent huge time jumps when the tab is backgrounded — without
// the clamp, returning to the tab after 30 seconds would drop the piece all
// the way to the floor in one tick.
let last = performance.now();
function loop(now) {
  const dt = Math.min(100, now - last);
  last = now;
  if (started) {
    engine.tick(dt);
    // Game-over detection — fire once when the engine flips the flag.
    if (engine.gameOver && !overlayEl.dataset.over) {
      overlayEl.dataset.over = '1';
      sound.setMusic(false);   // silence the loop so the dying-fall arpeggio plays clean
      sound.over();
      gameOverScreen();
    } else if (!engine.gameOver) {
      delete overlayEl.dataset.over;
    }
    // Play a line-clear SFX once per clear, then consume the flag.
    if (engine.lastClear) { sound.clear(engine.lastClear.n); engine.lastClear = null; }
  }
  trackPiece();
  renderer.draw(engine);
  // HUD updates — cheap to do every frame because innerText only writes when changed.
  $('#stat-score').textContent = engine.score.toLocaleString();
  $('#stat-lines').textContent = engine.lines;
  $('#stat-level').textContent = engine.level;
  $('#stat-time').textContent = formatTime(engine.elapsedMs());
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// ---------------------------------------------------------------------------
// Service worker — offline support
// ---------------------------------------------------------------------------
// sw.js precaches the game shell. On first load (online), the SW installs
// and stocks the cache. On subsequent loads, the page works without network.
// We register on window 'load' (not DOMContentLoaded) so it doesn't compete
// with the initial render for resources.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
