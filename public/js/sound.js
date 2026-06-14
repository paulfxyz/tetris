// tetris — sound.js
// Procedural SFX via Web Audio. No assets needed.

export class Sound {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.music = false;
    this.musicNode = null;
  }
  ensure() {
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch { this.ctx = null; }
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }
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
  move() { this.blip(220, 0.03, 'square', 0.04); }
  rotate() { this.blip(330, 0.04, 'triangle', 0.05); }
  lock() { this.blip(140, 0.07, 'sawtooth', 0.05); }
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
}
