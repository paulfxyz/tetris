// tetris — renderer.js
// Draws board, current piece, ghost, hold, and next preview.
// Three render styles via --board-style: flat, glass, pixel.

import { COLS, ROWS, HIDDEN, TOTAL_ROWS, PIECES } from './engine.js';

function cssVar(name, el = document.documentElement) {
  return getComputedStyle(el).getPropertyValue(name).trim();
}

function pieceColor(type) {
  return cssVar(`--piece-${type}`);
}

function drawCell(ctx, x, y, size, color, style, opts = {}) {
  if (!color) return;
  const ghost = !!opts.ghost;
  ctx.save();
  if (ghost) {
    ctx.globalAlpha = 0.18;
  }
  if (style === 'flat') {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, size, size);
    if (!ghost) {
      ctx.strokeStyle = 'rgba(0,0,0,.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
    }
  } else if (style === 'pixel') {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, size, size);
    if (!ghost) {
      // Highlight
      ctx.fillStyle = 'rgba(255,255,255,.25)';
      ctx.fillRect(x, y, size, 2);
      ctx.fillRect(x, y, 2, size);
      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      ctx.fillRect(x, y + size - 2, size, 2);
      ctx.fillRect(x + size - 2, y, 2, size);
    }
  } else { // glass
    const grd = ctx.createLinearGradient(x, y, x, y + size);
    grd.addColorStop(0, color);
    grd.addColorStop(1, mixColor(color, '#000', 0.35));
    ctx.fillStyle = grd;
    roundRect(ctx, x + 1, y + 1, size - 2, size - 2, Math.max(2, size * 0.18));
    ctx.fill();
    if (!ghost) {
      ctx.strokeStyle = 'rgba(255,255,255,.25)';
      ctx.lineWidth = 1;
      roundRect(ctx, x + 1.5, y + 1.5, size - 3, size - 3, Math.max(2, size * 0.18));
      ctx.stroke();
      // top sheen
      const sg = ctx.createLinearGradient(x, y, x, y + size * 0.5);
      sg.addColorStop(0, 'rgba(255,255,255,.35)');
      sg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sg;
      roundRect(ctx, x + 2, y + 2, size - 4, size * 0.45, Math.max(2, size * 0.14));
      ctx.fill();
    }
  }
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function mixColor(c1, c2, t) {
  const a = hexToRgb(c1), b = hexToRgb(c2);
  if (!a || !b) return c1;
  const r = Math.round(a.r * (1 - t) + b.r * t);
  const g = Math.round(a.g * (1 - t) + b.g * t);
  const bl = Math.round(a.b * (1 - t) + b.b * t);
  return `rgb(${r},${g},${bl})`;
}
function hexToRgb(c) {
  if (!c) return null;
  c = c.trim();
  if (c.startsWith('rgb')) {
    const m = c.match(/\d+/g);
    if (!m) return null;
    return { r: +m[0], g: +m[1], b: +m[2] };
  }
  if (c.startsWith('#')) {
    let h = c.slice(1);
    if (h.length === 3) h = h.split('').map(x => x + x).join('');
    const n = parseInt(h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  return null;
}

export class Renderer {
  constructor({ canvas, holdCanvas, nextCanvas }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.holdCanvas = holdCanvas;
    this.holdCtx = holdCanvas.getContext('2d');
    this.nextCanvas = nextCanvas;
    this.nextCtx = nextCanvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (const cv of [this.canvas, this.holdCanvas, this.nextCanvas]) {
      const rect = cv.getBoundingClientRect();
      cv.width = Math.max(1, Math.round(rect.width * dpr));
      cv.height = Math.max(1, Math.round(rect.height * dpr));
      cv.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  get style() {
    return cssVar('--board-style') || 'glass';
  }

  drawBoard(engine) {
    const ctx = this.ctx;
    const rect = this.canvas.getBoundingClientRect();
    const cell = rect.width / COLS;
    ctx.clearRect(0, 0, rect.width, rect.height);

    // Grid
    ctx.strokeStyle = cssVar('--color-grid');
    ctx.lineWidth = 1;
    for (let x = 1; x < COLS; x++) {
      ctx.beginPath();
      ctx.moveTo(x * cell + .5, 0);
      ctx.lineTo(x * cell + .5, rect.height);
      ctx.stroke();
    }
    for (let y = 1; y < ROWS; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * cell + .5);
      ctx.lineTo(rect.width, y * cell + .5);
      ctx.stroke();
    }

    const style = this.style;

    // Locked cells (skip hidden rows)
    for (let y = HIDDEN; y < TOTAL_ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const v = engine.board[y][x];
        if (v) {
          drawCell(ctx, x * cell, (y - HIDDEN) * cell, cell, pieceColor(v), style);
        }
      }
    }

    // Ghost
    if (!engine.gameOver) {
      const ghostY = engine.ghostY();
      const p = engine.current;
      for (let y = 0; y < p.matrix.length; y++) {
        for (let x = 0; x < p.matrix[y].length; x++) {
          if (!p.matrix[y][x]) continue;
          const gy = ghostY + y;
          if (gy < HIDDEN) continue;
          drawCell(ctx, (p.x + x) * cell, (gy - HIDDEN) * cell, cell, pieceColor(p.type), style, { ghost: true });
        }
      }
    }

    // Current piece
    const p = engine.current;
    for (let y = 0; y < p.matrix.length; y++) {
      for (let x = 0; x < p.matrix[y].length; x++) {
        if (!p.matrix[y][x]) continue;
        const py = p.y + y;
        if (py < HIDDEN) continue;
        drawCell(ctx, (p.x + x) * cell, (py - HIDDEN) * cell, cell, pieceColor(p.type), style);
      }
    }
  }

  drawMini(ctx, canvas, types) {
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    const style = this.style;
    const slotH = rect.height / Math.max(1, types.length);
    types.forEach((t, i) => {
      if (!t) return;
      const m = PIECES[t].matrix;
      const trimmed = trim(m);
      const cell = Math.min((rect.width - 8) / trimmed[0].length, (slotH - 8) / trimmed.length);
      const w = cell * trimmed[0].length;
      const h = cell * trimmed.length;
      const ox = (rect.width - w) / 2;
      const oy = i * slotH + (slotH - h) / 2;
      for (let y = 0; y < trimmed.length; y++) {
        for (let x = 0; x < trimmed[y].length; x++) {
          if (!trimmed[y][x]) continue;
          drawCell(ctx, ox + x * cell, oy + y * cell, cell, pieceColor(t), style);
        }
      }
    });
  }

  drawHold(engine) {
    this.drawMini(this.holdCtx, this.holdCanvas, [engine.hold]);
  }

  drawNext(engine) {
    this.drawMini(this.nextCtx, this.nextCanvas, engine.queue.slice(0, 4));
  }

  draw(engine) {
    this.drawBoard(engine);
    this.drawHold(engine);
    this.drawNext(engine);
  }
}

function trim(m) {
  let top = 0, bot = m.length - 1, left = m[0].length - 1, right = 0;
  let any = false;
  for (let y = 0; y < m.length; y++) {
    for (let x = 0; x < m[y].length; x++) {
      if (m[y][x]) {
        any = true;
        if (!any) top = y;
        bot = Math.max(bot, y);
        left = Math.min(left, x);
        right = Math.max(right, x);
      }
    }
  }
  if (!any) return m;
  // First row with content
  let realTop = m.length;
  for (let y = 0; y < m.length; y++) if (m[y].some(v => v)) { realTop = y; break; }
  const out = [];
  for (let y = realTop; y <= bot; y++) {
    out.push(m[y].slice(left, right + 1));
  }
  return out;
}
