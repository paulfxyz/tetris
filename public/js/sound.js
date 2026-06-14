// tetris — sound.js
// ============================================================================
// AUDIO LAYER. Two cleanly separated systems:
//
//   1. SFX — procedural blips generated at runtime via Web Audio API
//      oscillators. No samples shipped. Cheap, tiny, instantly reactive.
//
//   2. MUSIC — a single bundled CC0 chiptune MP3 played via a plain
//      <audio> element, looped forever. Until v1.1.x we generated the
//      Korobeiniki theme procedurally with two Web Audio voices, but a
//      surprising number of browsers throttled the lookahead scheduler
//      (especially under autoplay restrictions on iOS/Safari and Chrome's
//      tab-throttling), so nothing audible came out. A real audio file
//      sidesteps all that — modern browsers handle <audio> reliably the
//      moment a user gesture has unlocked playback.
//
// The MP3 we ship — assets/music.mp3 — is "Happy Adventure (Loop)" by
// Bart Kelsey (https://opengameart.org/content/happy-adventure-loop),
// released under CC0 (Public Domain). 8-bit / chiptune vibe, ~620 KB,
// loops seamlessly.
// ============================================================================

export class Sound {
  constructor() {
    this.ctx = null;       // Web Audio context — lazy (see ensure())
    this.enabled = true;   // SFX on/off
    this.music = false;    // music on/off
    this.audio = null;     // HTMLAudioElement for background music
    this.musicVolume = 0.35;
  }

  // CRITICAL on iOS / Safari: AudioContext is created in 'suspended' state
  // and MUST be unlocked by a user gesture (tap, click, keydown handler) for
  // any sound to play. We create the context lazily on the first call from
  // a user-initiated handler (e.g. clicking "Press Start"). Same gesture
  // also lets the <audio> element call .play() without an autoplay rejection.
  ensure() {
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch { this.ctx = null; }
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  // ------- SFX primitive -------
  // One-shot oscillator with exponential gain decay. Combine with setTimeout
  // to chain blips into arpeggios.
  blip(freq = 440, duration = 0.06, type = 'square', gain = 0.06) {
    if (!this.enabled) return;
    this.ensure();
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(gain, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);
    o.connect(g).connect(this.ctx.destination);
    o.start();
    o.stop(this.ctx.currentTime + duration);
  }

  // Per-action SFX. Pitches chosen by ear.
  move()   { this.blip(220, 0.03, 'square', 0.04); }
  rotate() { this.blip(330, 0.04, 'triangle', 0.05); }
  lock()   { this.blip(140, 0.07, 'sawtooth', 0.05); }

  clear(n = 1) {
    const base = 440 + n * 120;
    this.blip(base, 0.08, 'square', 0.07);
    setTimeout(() => this.blip(base * 1.25, 0.1, 'square', 0.06), 60);
    if (n >= 4) setTimeout(() => this.blip(base * 1.5, 0.12, 'square', 0.07), 130);
  }

  drop() { this.blip(110, 0.1, 'square', 0.07); }
  hold() { this.blip(520, 0.05, 'sine', 0.05); }

  over() {
    [440, 330, 247, 165].forEach((f, i) => setTimeout(() => this.blip(f, 0.18, 'triangle', 0.08), i * 120));
  }

  // ------- MUSIC -------
  // Lazily build the <audio> element. We create it on first toggle, not on
  // construction, so that browsers that block AudioContext / autoplay don't
  // pre-create resources we may never use.
  ensureAudio() {
    if (this.audio) return this.audio;
    const a = new Audio('assets/music.mp3');
    a.loop = true;
    a.preload = 'auto';
    a.volume = this.musicVolume;
    // Some browsers (Safari) emit an 'error' event when the source can't
    // load. We swallow it silently — the game continues without music.
    a.addEventListener('error', () => { /* music unavailable; game continues */ });
    this.audio = a;
    return a;
  }

  // setMusic(true)  → play (idempotent, unlocked by the caller's user gesture)
  // setMusic(false) → pause
  setMusic(on) {
    this.music = !!on;
    const a = this.ensureAudio();
    if (this.music) {
      // play() returns a Promise that rejects if autoplay is blocked. We
      // catch silently — the player just has to toggle music again from a
      // gesture. In practice this only happens before the first click.
      const p = a.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } else {
      try { a.pause(); } catch { /* no-op */ }
    }
  }
}
