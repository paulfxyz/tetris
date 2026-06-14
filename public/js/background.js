// tetris — background.js
// Slow-moving tetromino blocks behind the game. Theme-aware (uses --piece-* tokens).

import { PIECES } from './engine.js';

const TYPES = Object.keys(PIECES);

export class Background {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.blocks = [];
    this.last = performance.now();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.spawnInitial();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth, h = window.innerHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = w; this.h = h;
  }

  spawnInitial() {
    const count = Math.max(8, Math.floor((this.w * this.h) / 36000));
    this.blocks = [];
    for (let i = 0; i < count; i++) {
      this.blocks.push(this.makeBlock(true));
    }
  }

  makeBlock(initial = false) {
    const t = TYPES[Math.floor(Math.random() * TYPES.length)];
    const size = 16 + Math.random() * 28;
    return {
      type: t,
      size,
      x: Math.random() * this.w,
      y: initial ? Math.random() * this.h : -size - Math.random() * 200,
      vx: (Math.random() - 0.5) * 6,
      vy: 6 + Math.random() * 14,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.4,
    };
  }

  loop(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.ctx.clearRect(0, 0, this.w, this.h);

    for (const b of this.blocks) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.rot += b.vr * dt;
      if (b.y > this.h + 80 || b.x < -100 || b.x > this.w + 100) {
        Object.assign(b, this.makeBlock(false));
        b.x = Math.random() * this.w;
      }
      this.draw(b);
    }
    requestAnimationFrame(this.loop);
  }

  draw(b) {
    const ctx = this.ctx;
    const piece = PIECES[b.type];
    const m = piece.matrix;
    const s = b.size / 4; // cell size
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.rot);
    const color = getComputedStyle(document.documentElement).getPropertyValue(`--piece-${b.type}`).trim();
    ctx.fillStyle = color;
    for (let y = 0; y < m.length; y++) {
      for (let x = 0; x < m[y].length; x++) {
        if (!m[y][x]) continue;
        ctx.fillRect(x * s - b.size/2, y * s - b.size/2, s - 1, s - 1);
      }
    }
    ctx.restore();
  }
}
