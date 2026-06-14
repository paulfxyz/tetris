// tetris — background.js
// ============================================================================
// A tiny particle system: tetrominoes drift across the screen behind the
// game. Theme-aware (uses --piece-* CSS variables for color so it matches
// whatever theme is active).
//
// This is a self-contained Background class:
//   - owns its own canvas, its own RAF loop, its own resize handler
//   - never touches the engine
//   - never reads input
//   - happily runs even on the title screen
//
// Performance: count is computed from viewport area so big monitors get more
// blocks (proportional density), tiny phones get fewer (no jank). DPR is
// capped at 2 — anything above that is invisible on a falling block.
// ============================================================================

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

  // Match canvas bitmap to CSS box × DPR (same pattern as the main renderer).
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

  // Density formula: 1 block per ~36k px². At 1920×1080 that's ~57 blocks;
  // at 375×667 (iPhone SE) it's ~7. Floor of 8 to keep tiny screens lively.
  spawnInitial() {
    const count = Math.max(8, Math.floor((this.w * this.h) / 36000));
    this.blocks = [];
    for (let i = 0; i < count; i++) {
      this.blocks.push(this.makeBlock(true));
    }
  }

  // Create one tumbling block. `initial` controls Y placement:
  //   true  → place anywhere on screen (initial spawn, so we don't have a
  //           blank screen for the first 5 seconds while blocks fall in)
  //   false → place above the top, just out of view (a respawn after one
  //           drifted off-screen)
  makeBlock(initial = false) {
    const t = TYPES[Math.floor(Math.random() * TYPES.length)];
    const size = 16 + Math.random() * 28;
    return {
      type: t,
      size,
      x: Math.random() * this.w,
      y: initial ? Math.random() * this.h : -size - Math.random() * 200,
      vx: (Math.random() - 0.5) * 6,    // -3..3 px/s horizontal
      vy: 6 + Math.random() * 14,        // 6..20 px/s downward
      rot: Math.random() * Math.PI * 2,  // start at random rotation
      vr: (Math.random() - 0.5) * 0.4,   // -0.2..0.2 rad/s rotation
    };
  }

  // Main loop — runs every frame for the entire page lifetime.
  // dt is in *seconds* here (not ms like the engine), because velocities are
  // expressed in units/second which feels natural for ambient motion.
  // We clamp dt at 50 ms (0.05 s) to avoid huge jumps when the tab was
  // backgrounded — otherwise all blocks teleport across the screen on resume.
  loop(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.ctx.clearRect(0, 0, this.w, this.h);

    for (const b of this.blocks) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.rot += b.vr * dt;
      // Recycle blocks that have drifted off-screen so the field stays full.
      if (b.y > this.h + 80 || b.x < -100 || b.x > this.w + 100) {
        Object.assign(b, this.makeBlock(false));
        b.x = Math.random() * this.w;
      }
      this.draw(b);
    }
    requestAnimationFrame(this.loop);
  }

  // Draw one tetromino. Rotated around its center via translate+rotate.
  // Color is read live from CSS so theme changes apply instantly without
  // touching this code.
  draw(b) {
    const ctx = this.ctx;
    const piece = PIECES[b.type];
    const m = piece.matrix;
    const s = b.size / 4;  // cell size: divide the block's total side by 4
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.rot);
    const color = getComputedStyle(document.documentElement).getPropertyValue(`--piece-${b.type}`).trim();
    ctx.fillStyle = color;
    for (let y = 0; y < m.length; y++) {
      for (let x = 0; x < m[y].length; x++) {
        if (!m[y][x]) continue;
        // Subtract size/2 so the piece is drawn centered around (0,0),
        // which means our rotate() pivots around the geometric center.
        ctx.fillRect(x * s - b.size / 2, y * s - b.size / 2, s - 1, s - 1);
      }
    }
    ctx.restore();
  }
}
