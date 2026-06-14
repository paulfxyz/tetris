// tetris — sound.js
// ============================================================================
// PROCEDURAL SFX. No audio files shipped. Everything you hear is generated
// at runtime by oscillators + gain envelopes through the Web Audio API.
//
// Why not just ship .mp3/.ogg/.wav?
//   - no licensing / attribution / royalty questions
//   - zero KB of audio assets in the bundle
//   - no codec issues (some browsers refused to decode certain ogg files
//     for years; mp3 has its own historical landmines)
//   - no preloading concerns, no decoded-buffer cache to manage
//   - we can pick the pitch/duration of every sound at the call site
//
// The "envelope" pattern below is the entire trick: start an oscillator at
// some gain, exponentially ramp it down to near-zero over a few tens of ms,
// stop it. Result: a tiny "blip" with a natural decay. Stack 2 or 3 of them
// at related pitches and you get arpeggios for Tetrises and game-over.
// ============================================================================

export class Sound {
  constructor() {
    this.ctx = null;       // lazily created — see ensure()
    this.enabled = true;
    this.music = false;    // reserved — no music yet
    this.musicNode = null;
  }

  // CRITICAL on iOS / Safari: AudioContext is created in 'suspended' state
  // and MUST be unlocked by a user gesture (tap, click, keydown handler) for
  // any sound to play. We create the context lazily, on the first call from
  // a user-initiated handler (e.g. clicking "Press Start"). If we created it
  // on boot, the first audio command would silently produce nothing — with
  // no error to tell you why.
  ensure() {
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch { this.ctx = null; }
    }
    // Even after creation, the ctx can be re-suspended (tab backgrounded).
    // resume() is idempotent and safe to call every time.
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  // The atomic SFX primitive: a one-shot oscillator with an exponential gain
  // decay. Combine with setTimeout to chain blips into arpeggios.
  //
  //   freq     — pitch in Hz
  //   duration — seconds before the oscillator stops
  //   type     — 'square' | 'sine' | 'triangle' | 'sawtooth'
  //              (square is "8-bit blip", triangle is softer, sawtooth is harsher)
  //   gain     — peak loudness (keep low; we play many at once)
  blip(freq = 440, duration = 0.06, type = 'square', gain = 0.06) {
    if (!this.enabled) return;
    this.ensure();
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    // Envelope: full gain at start, exponential decay to near-zero over duration.
    // Using exponentialRampToValueAtTime (not linear) gives a natural-sounding tail.
    // The target can't actually reach 0 in an exponential ramp, hence 0.0001.
    g.gain.setValueAtTime(gain, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);
    o.connect(g).connect(this.ctx.destination);
    o.start();
    o.stop(this.ctx.currentTime + duration);
  }

  // Each game action gets a distinct sonic identity. Numbers were picked by
  // ear — there's no scientific tuning, just "does this feel right?"
  move()   { this.blip(220, 0.03, 'square', 0.04); }     // soft click
  rotate() { this.blip(330, 0.04, 'triangle', 0.05); }   // higher, smoother
  lock()   { this.blip(140, 0.07, 'sawtooth', 0.05); }   // a thunk

  // Line-clear scales with line count: pitch up + extra arpeggio note for Tetrises.
  // The three (or four) blips are staggered with setTimeout — that's the
  // arpeggio. 60ms gap between notes feels rhythmic without overlapping decay.
  clear(n = 1) {
    const base = 440 + n * 120;
    this.blip(base, 0.08, 'square', 0.07);
    setTimeout(() => this.blip(base * 1.25, 0.1, 'square', 0.06), 60);
    if (n >= 4) setTimeout(() => this.blip(base * 1.5, 0.12, 'square', 0.07), 130);
  }

  drop()   { this.blip(110, 0.1, 'square', 0.07); }      // low thud
  hold()   { this.blip(520, 0.05, 'sine', 0.05); }       // clean ping

  // Game over: a descending 4-note arpeggio. Each note lasts 0.18s; we space
  // them 120ms apart so they overlap slightly into a dying-fall.
  over() {
    [440, 330, 247, 165].forEach((f, i) => setTimeout(() => this.blip(f, 0.18, 'triangle', 0.08), i * 120));
  }
}
