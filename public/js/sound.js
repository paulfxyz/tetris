// tetris — sound.js
// ============================================================================
// PROCEDURAL SFX + MUSIC. No audio files shipped. Everything you hear is
// generated at runtime by oscillators + gain envelopes through the Web Audio
// API.
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

// ============================================================================
// MUSIC — Korobeiniki (a.k.a. "Tetris Theme A")
//
// Korobeiniki (Russian: Коробейники, "The Peddlers") is a Russian folk song
// composed in 1861 by Nikolay Nekrasov. The melody is firmly in the public
// domain — it has been used for 160+ years and is famously the music of the
// original Game Boy Tetris (1989). Shipping it is free of any licensing or
// attribution concern.
//
// We don't ship an audio file. Instead the tune is encoded as an array of
// [scientific-pitch-notation, beats] pairs and rendered live by oscillators,
// matching the procedural philosophy of the SFX above. Two voices play in
// parallel: a square-wave LEAD (the melody) and a triangle-wave BASS that
// alternates between root and fifth. The result is a small, chiptune-ish
// rendition of the theme that loops forever.
//
// Tempo: 144 BPM — close to the original Game Boy version's level-1 speed.
// ============================================================================

// Note name -> MIDI number, then MIDI -> Hz. A4 (MIDI 69) = 440 Hz.
const NOTE_TO_MIDI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function noteHz(name) {
  if (!name) return 0; // rest
  const m = name.match(/^([A-G])([#b]?)(\d)$/);
  if (!m) return 0;
  const [, letter, accidental, octave] = m;
  const midi = NOTE_TO_MIDI[letter]
    + (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0)
    + (Number(octave) + 1) * 12;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// Korobeiniki lead melody, transcribed for one full A-section + B-section.
// Format: [note, beats]. null = rest. Beats are in quarter-note units.
const KOROBEINIKI_LEAD = [
  ['E5', 1],   ['B4', 0.5], ['C5', 0.5], ['D5', 1],   ['C5', 0.5], ['B4', 0.5],
  ['A4', 1],   ['A4', 0.5], ['C5', 0.5], ['E5', 1],   ['D5', 0.5], ['C5', 0.5],
  ['B4', 1.5], ['C5', 0.5], ['D5', 1],   ['E5', 1],
  ['C5', 1],   ['A4', 1],   ['A4', 1],   [null, 1],
  ['D5', 1],   ['F5', 0.5], ['A5', 1],   ['G5', 0.5], ['F5', 0.5],
  ['E5', 1.5], ['C5', 0.5], ['E5', 1],   ['D5', 0.5], ['C5', 0.5],
  ['B4', 1],   ['B4', 0.5], ['C5', 0.5], ['D5', 1],   ['E5', 1],
  ['C5', 1],   ['A4', 1],   ['A4', 2],
];

// Simple alternating bass line: root–fifth pattern.
const KOROBEINIKI_BASS = [
  ['A2', 2], ['E3', 2], ['A2', 2], ['E3', 2],
  ['A2', 2], ['E3', 2], ['A2', 2], ['E3', 2],
  ['D3', 2], ['A3', 2], ['A2', 2], ['E3', 2],
  ['A2', 2], ['E3', 2], ['A2', 2], ['E3', 2],
];

export class Sound {
  constructor() {
    this.ctx = null;       // lazily created — see ensure()
    this.enabled = true;   // SFX on/off
    this.music = false;    // music on/off (set via setMusic())
    this.musicGain = null; // master gain for music bus
    this.musicTimer = null;// scheduling tick
    this.musicBpm = 144;
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
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  // The atomic SFX primitive: a one-shot oscillator with an exponential gain
  // decay. Combine with setTimeout to chain blips into arpeggios.
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
  // Start or stop the Korobeiniki loop. Idempotent: calling setMusic(true)
  // twice doesn't stack two loops.
  setMusic(on) {
    this.music = !!on;
    if (this.music) this.startMusic();
    else this.stopMusic();
  }

  // Build the loop and schedule notes ahead. We use lookahead scheduling
  // (Chris Wilson's "Tale of Two Clocks" pattern): every ~250ms, schedule
  // any notes whose start time falls in the next ~500ms window. setTimeout
  // is jittery, but the AudioContext clock is rock-steady — so as long as
  // each note is scheduled BEFORE its start time, playback is sample-accurate.
  startMusic() {
    this.ensure();
    if (!this.ctx) return;
    this.stopMusic();

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.07;
    this.musicGain.connect(this.ctx.destination);

    const secondsPerBeat = 60 / this.musicBpm;
    const buildVoice = (notes) => {
      let t = 0;
      return notes.map(([note, beats]) => {
        const entry = { note, beats, offset: t };
        t += beats * secondsPerBeat;
        return entry;
      });
    };
    const lead = buildVoice(KOROBEINIKI_LEAD);
    const bass = buildVoice(KOROBEINIKI_BASS);
    const leadLength = lead.reduce((s, n) => s + n.beats, 0) * secondsPerBeat;
    const bassLength = bass.reduce((s, n) => s + n.beats, 0) * secondsPerBeat;
    const loopLength = Math.max(leadLength, bassLength);

    let loopStart = this.ctx.currentTime + 0.1;
    const scheduleAhead = 0.5;

    const tick = () => {
      if (!this.music || !this.ctx || !this.musicGain) return;
      const now = this.ctx.currentTime;
      while (loopStart < now + scheduleAhead) {
        for (const n of lead) {
          const start = loopStart + n.offset;
          if (start < now) continue;
          if (start > now + scheduleAhead) break;
          this.playNote(n.note, start, n.beats * secondsPerBeat * 0.95, 'square', 0.55);
        }
        for (const n of bass) {
          const start = loopStart + n.offset;
          if (start < now) continue;
          if (start > now + scheduleAhead) break;
          this.playNote(n.note, start, n.beats * secondsPerBeat * 0.95, 'triangle', 0.4);
        }
        loopStart += loopLength;
      }
      this.musicTimer = setTimeout(tick, 250);
    };
    tick();
  }

  // Fade out and tear down. Linear ramp to zero (exponential can't reach 0)
  // prevents the "click" some browsers emit when a gain abruptly drops.
  stopMusic() {
    if (this.musicTimer) { clearTimeout(this.musicTimer); this.musicTimer = null; }
    if (this.musicGain && this.ctx) {
      const g = this.musicGain.gain;
      const t = this.ctx.currentTime;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(0, t + 0.05);
      const old = this.musicGain;
      setTimeout(() => { try { old.disconnect(); } catch {} }, 100);
    }
    this.musicGain = null;
  }

  // Schedule one note at an absolute AudioContext time. Per-note ADSR with
  // a 10ms attack and exponential release prevents clicks at note boundaries.
  playNote(name, when, duration, type = 'square', voiceGain = 0.5) {
    if (!this.ctx || !this.musicGain || !name) return;
    const freq = noteHz(name);
    if (!freq) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, when);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(voiceGain, when + 0.01);
    g.gain.setValueAtTime(voiceGain, when + Math.max(0.01, duration - 0.05));
    g.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    o.connect(g).connect(this.musicGain);
    o.start(when);
    o.stop(when + duration + 0.02);
  }
}
