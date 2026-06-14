// tetris — app.js
// Entry point. Wires engine, renderer, input, background and overlays.

import { Engine } from './engine.js';
import { Renderer } from './renderer.js';
import { Input } from './input.js';
import { Background } from './background.js';
import { Sound } from './sound.js';
import { settings } from './storage.js';
import { Scoreboard } from './scoreboard.js';

const CLIENT_VERSION = '1.0.0';

const $ = (q) => document.querySelector(q);

// ---------- Apply settings to DOM ---------- //
function applySettings() {
  const s = settings.state;
  document.documentElement.dataset.theme = s.theme;
  document.documentElement.dataset.mode = s.mode;
  const zoom = (s.zoom || 100) / 100;
  document.getElementById('game-wrap').style.setProperty('--zoom', zoom);

  // Virtual pad visibility
  const wantsVPad = s.vpadMode === 'always'
    || (s.vpadMode === 'auto' && matchMedia('(pointer: coarse)').matches);
  document.body.classList.toggle('vpad-on', wantsVPad);

  if (s.fit) fitToScreen();
}

function fitToScreen() {
  const wrap = document.getElementById('game-wrap');
  wrap.style.setProperty('--zoom', 1);
  // Defer a frame so layout settles, then measure
  requestAnimationFrame(() => {
    const wrapRect = wrap.getBoundingClientRect();
    const stage = wrap.parentElement.getBoundingClientRect();
    const padded = stage.height - 40;
    const scale = Math.min(1.6, Math.max(0.5, padded / wrapRect.height));
    wrap.style.setProperty('--zoom', scale);
    settings.set('zoom', Math.round(scale * 100));
  });
}

// ---------- Boot ---------- //
applySettings();

const engine = new Engine();
const sound = new Sound();
const renderer = new Renderer({
  canvas: $('#game-canvas'),
  holdCanvas: $('#hold-canvas'),
  nextCanvas: $('#next-canvas'),
});
const bg = new Background($('#bg-canvas'));
const scoreboard = new Scoreboard();

// Stats counter for receipt
const stats = { pieces: 0, holds: 0, hardDrops: 0, softDrops: 0, rotates: 0, maxCombo: 0, tetrises: 0 };
let started = false;
let lastTickActedOnPiece = engine.current;
const trackPiece = () => {
  if (engine.current !== lastTickActedOnPiece) {
    lastTickActedOnPiece = engine.current;
    stats.pieces++;
  }
  if (engine.combo > stats.maxCombo) stats.maxCombo = engine.combo;
  if (engine.lastClear?.n === 4) stats.tetrises++;
};

// ---------- Overlay ---------- //
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
  sound.ensure();
}

titleScreen();

// ---------- Action handler ---------- //
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
    case 'drop':       {
      const cells = engine.hardDrop();
      if (cells > 0) { sound.drop(); stats.hardDrops++; }
      break;
    }
    case 'pause':      engine.togglePause(); if (engine.paused) pausedScreen(); else hideOverlay(); break;
  }
}

const input = new Input({
  boardEl: $('#game-canvas'),
  vpadEl: $('#vpad'),
  onAction: action,
});

// ---------- Settings dialog ---------- //
const settingsDialog = $('#settings-dialog');
$('#btn-settings').addEventListener('click', () => {
  // Sync form to current settings
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
settingsDialog.querySelector('input[name=zoom]').addEventListener('input', (e) => {
  settingsDialog.querySelector('output[name=zoom-out]').value = e.target.value + '%';
});
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
  scoreboard.setServer(settings.get('server'));
  applySettings();
});

$('#btn-mode').addEventListener('click', () => {
  settings.set('mode', settings.get('mode') === 'dark' ? 'light' : 'dark');
  applySettings();
});
$('#btn-zoom-in').addEventListener('click', () => { settings.set('zoom', Math.min(160, settings.get('zoom') + 10)); applySettings(); });
$('#btn-zoom-out').addEventListener('click', () => { settings.set('zoom', Math.max(60, settings.get('zoom') - 10)); applySettings(); });
$('#btn-zoom-reset').addEventListener('click', () => { settings.set('fit', true); fitToScreen(); });

// Sync sound prefs
sound.enabled = settings.get('sfx');
scoreboard.setServer(settings.get('server'));

// ---------- Game-over dialog ---------- //
const goDialog = $('#gameover-dialog');
const goForm = $('#gameover-form');

function openGameOver() {
  const id = settings.get('identity') || {};
  goForm.elements.name.value = id.name || '';
  goForm.elements.tagline.value = id.tagline || '';
  goForm.elements.email.value = id.email || '';
  $('#go-score').textContent = engine.score.toLocaleString();
  $('#go-lines').textContent = engine.lines;
  $('#go-level').textContent = engine.level;
  $('#go-time').textContent = formatTime(engine.elapsedMs());
  $('#go-status').textContent = scoreboard.serverAvailable()
    ? `Server: ${settings.get('server')} — your score will be signed.`
    : 'No server set — you can still download an unsigned local receipt.';
  goDialog.showModal();
}

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

  // Remember identity
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

function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function formatTime(ms) {
  const s = Math.floor((ms || 0) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ---------- Game loop ---------- //
let last = performance.now();
function loop(now) {
  const dt = Math.min(100, now - last);
  last = now;
  if (started) {
    engine.tick(dt);
    if (engine.gameOver && !overlayEl.dataset.over) {
      overlayEl.dataset.over = '1';
      sound.over();
      gameOverScreen();
    } else if (!engine.gameOver) {
      delete overlayEl.dataset.over;
    }
    if (engine.lastClear) { sound.clear(engine.lastClear.n); engine.lastClear = null; }
  }
  trackPiece();
  renderer.draw(engine);
  // Update HUD
  $('#stat-score').textContent = engine.score.toLocaleString();
  $('#stat-lines').textContent = engine.lines;
  $('#stat-level').textContent = engine.level;
  $('#stat-time').textContent = formatTime(engine.elapsedMs());
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// ---------- Service worker (offline) ---------- //
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
