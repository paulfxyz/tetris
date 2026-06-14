// tetris — renderer.js
// ============================================================================
// Turns Engine state into pixels. Reads nothing from input; writes nothing to
// game state. The renderer is "dumb" — give it an engine, it draws what it
// sees right now.
//
// Three things make this interesting:
//
//   1. THEMING WITHOUT KNOWING ABOUT THEMES.
//      Colors come from CSS custom properties on <html data-theme=…>. We use
//      getComputedStyle() to read --piece-T, --color-grid, --board-style etc.
//      Change the theme in CSS, the renderer follows automatically. The
//      renderer never branches on theme name.
//
//   2. THREE DRAW STYLES FROM ONE FUNCTION.
//      drawCell() switches on `--board-style` (flat | pixel | glass) and
//      produces visually distinct blocks: flat for Classic, pixel for Color,
//      glass for Modern. The mode (dark/light) only changes colors.
//
//   3. HIGH-DPI WITHOUT BLUR.
//      Canvas needs a physical pixel-buffer (canvas.width) scaled by
//      devicePixelRatio, while we still draw in CSS pixels. setTransform(dpr,
//      0, 0, dpr, 0, 0) does exactly that — every draw call we make is in CSS
//      pixels, but the bitmap underneath is DPR-times sharper.
// ============================================================================

import { COLS, ROWS, HIDDEN, TOTAL_ROWS, PIECES } from './engine.js';

// Read a CSS custom property off any element (root by default).
// Note: getComputedStyle returns the *resolved* value with surrounding spaces,
// so we trim. This is how the renderer stays theme-agnostic.
function cssVar(name, el = document.documentElement) {
  return getComputedStyle(el).getPropertyValue(name).trim();
}

// Map a piece type letter ('T', 'I', …) to its theme color.
function pieceColor(type) {
  return cssVar(`--piece-${type}`);
}

// ---------------------------------------------------------------------------
// drawCell — the single source of truth for "what does a block look like?"
// ---------------------------------------------------------------------------
// Style switch:
//   'flat'  → solid fill + 1-px dark outline. Classic B&W theme.
//   'pixel' → solid fill + bright top/left highlight + dark bottom/right
//             shadow, 2 px thick. GBC chunky pixel look. Color theme.
//   'glass' → vertical gradient fill, rounded corners, top sheen, thin white
//             border. Modern theme.
//
// The `ghost` option draws the same cell at 18% opacity with no highlight or
// outline — that's the landing-preview tetromino at the bottom of the board.
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
      // Hairline outline — half-pixel offset for crisp 1-px lines.
      ctx.strokeStyle = 'rgba(0,0,0,.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
    }
  } else if (style === 'pixel') {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, size, size);
    if (!ghost) {
      // Chunky two-pixel highlight on top + left edges.
      ctx.fillStyle = 'rgba(255,255,255,.25)';
      ctx.fillRect(x, y, size, 2);
      ctx.fillRect(x, y, 2, size);
      // Matching shadow on bottom + right.
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      ctx.fillRect(x, y + size - 2, size, 2);
      ctx.fillRect(x + size - 2, y, 2, size);
    }
  } else { // 'glass' (default for the Modern theme)
    // Vertical gradient: full color at top, blended toward black at bottom —
    // gives the block depth like a Candy Crush jelly.
    const grd = ctx.createLinearGradient(x, y, x, y + size);
    grd.addColorStop(0, color);
    grd.addColorStop(1, mixColor(color, '#000', 0.35));
    ctx.fillStyle = grd;
    roundRect(ctx, x + 1, y + 1, size - 2, size - 2, Math.max(2, size * 0.18));
    ctx.fill();
    if (!ghost) {
      // Thin highlight outline along the rounded rect.
      ctx.strokeStyle = 'rgba(255,255,255,.25)';
      ctx.lineWidth = 1;
      roundRect(ctx, x + 1.5, y + 1.5, size - 3, size - 3, Math.max(2, size * 0.18));
      ctx.stroke();
      // Top-half "sheen" — a second gradient that fades out, mimicking glass.
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

// Canvas2D has no native rounded-rect (well, it does now with roundRect(), but
// older mobile browsers don't ship it). This polyfill traces four arc corners.
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

// Linear blend two colors in RGB space. t=0 → c1, t=1 → c2.
// Used to darken the bottom of glass blocks; could be reused for highlights.
function mixColor(c1, c2, t) {
  const a = hexToRgb(c1), b = hexToRgb(c2);
  if (!a || !b) return c1;
  const r = Math.round(a.r * (1 - t) + b.r * t);
  const g = Math.round(a.g * (1 - t) + b.g * t);
  const bl = Math.round(a.b * (1 - t) + b.b * t);
  return `rgb(${r},${g},${bl})`;
}

// Accept both '#abc', '#aabbcc' and 'rgb(…)' — getComputedStyle can return
// either depending on how the CSS variable is written.
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
    if (h.length === 3) h = h.split('').map(x => x + x).join('');  // expand #abc → #aabbcc
    const n = parseInt(h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  return null;
}

// ===========================================================================
// Renderer
// ===========================================================================
export class Renderer {
  constructor({ canvas, holdCanvas, nextCanvas }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.holdCanvas = holdCanvas;
    this.holdCtx = holdCanvas.getContext('2d');
    this.nextCanvas = nextCanvas;
    this.nextCtx = nextCanvas.getContext('2d');
    this.resize();
    // Re-resize whenever the viewport changes (also catches orientation flip,
    // browser UI bars hiding, devtools opening).
    window.addEventListener('resize', () => this.resize());
  }

  // Set each canvas's physical pixel buffer = CSS size × devicePixelRatio,
  // then install a transform so our subsequent draw calls can stay in CSS px.
  // Capping DPR at 2 prevents 4× memory blow-ups on absurd Retina screens.
  //
  // Setting canvas.width/height implicitly resets the 2D context — that's why
  // we re-apply setTransform here on every resize.
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (const cv of [this.canvas, this.holdCanvas, this.nextCanvas]) {
      const rect = cv.getBoundingClientRect();
      cv.width = Math.max(1, Math.round(rect.width * dpr));
      cv.height = Math.max(1, Math.round(rect.height * dpr));
      cv.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  // Currently-selected board style (driven by CSS --board-style).
  get style() {
    return cssVar('--board-style') || 'glass';
  }

  // -------------------------------------------------------------------------
  // Main board: grid + locked cells + ghost + current piece, in that order.
  // We clear in CSS pixels (the transform handles DPR scaling).
  // -------------------------------------------------------------------------
  drawBoard(engine) {
    const ctx = this.ctx;
    const rect = this.canvas.getBoundingClientRect();
    const cell = rect.width / COLS;
    // Wipe the FULL bitmap (not the CSS rect) every frame. See drawMini's
    // EDUCATIONAL GOTCHA comment for the full explanation. When the parent is
    // scaled (CSS transform) or DPR > 1, clearRect(0, 0, rect.width, rect.height)
    // does NOT cover the whole canvas bitmap and leaves diagonal smear trails
    // after zoom-out. Reset transform -> wipe bitmap -> restore.
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.restore();

    // 1) Grid — thin lines on every internal column/row boundary.
    //    Half-pixel offset (`+ .5`) so lines hit physical pixel edges crisply.
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

    // 2) Locked cells — skip the 2 hidden rows above the visible board.
    //    Board rows [HIDDEN..TOTAL_ROWS) map to screen rows [0..ROWS).
    for (let y = HIDDEN; y < TOTAL_ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const v = engine.board[y][x];
        if (v) {
          drawCell(ctx, x * cell, (y - HIDDEN) * cell, cell, pieceColor(v), style);
        }
      }
    }

    // 3) Ghost piece — semi-transparent silhouette showing where a hard drop
    //    would land. Computed by ghostY() in the engine.
    if (!engine.gameOver) {
      const ghostY = engine.ghostY();
      const p = engine.current;
      for (let y = 0; y < p.matrix.length; y++) {
        for (let x = 0; x < p.matrix[y].length; x++) {
          if (!p.matrix[y][x]) continue;
          const gy = ghostY + y;
          if (gy < HIDDEN) continue;  // ghost cells above the visible top aren't shown
          drawCell(ctx, (p.x + x) * cell, (gy - HIDDEN) * cell, cell, pieceColor(p.type), style, { ghost: true });
        }
      }
    }

    // 4) Current piece — same loop, no ghost flag.
    const p = engine.current;
    for (let y = 0; y < p.matrix.length; y++) {
      for (let x = 0; x < p.matrix[y].length; x++) {
        if (!p.matrix[y][x]) continue;
        const py = p.y + y;
        if (py < HIDDEN) continue;  // cells still in the hidden spawn area
        drawCell(ctx, (p.x + x) * cell, (py - HIDDEN) * cell, cell, pieceColor(p.type), style);
      }
    }
  }

  // -------------------------------------------------------------------------
  // drawMini — the HOLD and NEXT panels share this code.
  // -------------------------------------------------------------------------
  // Given an array of piece types, lay them out vertically inside the panel,
  // each piece centered horizontally inside its row.
  //
  // EDUCATIONAL GOTCHA: we must wipe the FULL bitmap, not the CSS rect, every
  // frame. Why? Because the 2D context has a DPR transform applied — so
  // clearRect(0, 0, rect.width, rect.height) only clears the top-left quarter
  // of the bitmap on a 2× display. The bottom-right shows ghost frames from
  // earlier draws (this is exactly the bug that caused 4 stacked I-pieces in
  // the HOLD panel during dev). The fix:
  //   - save() current state
  //   - reset transform to identity
  //   - clearRect using canvas.width / canvas.height (BITMAP coords)
  //   - restore() to bring back the DPR transform for subsequent draws
  drawMini(ctx, canvas, types, { ghost = false } = {}) {
    const rect = canvas.getBoundingClientRect();
    const W = rect.width;
    const H = rect.height;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    const filtered = (types || []).filter(Boolean);
    if (filtered.length === 0) return;
    const style = this.style;
    // Ghost preview: drawCell already draws the cell at 18% alpha when
    // opts.ghost is true (no outline, no sheen — same look as the on-board
    // landing preview). For the HOLD chip we want it just a touch more
    // present than the on-board ghost, so we DON'T multiply alpha further
    // here — 18% reads well against the chip's slightly translucent surface.
    const slotH = H / filtered.length;
    filtered.forEach((t, i) => {
      const m = PIECES[t].matrix;
      const trimmed = trim(m);                  // shrink to tight bounding box
      // Pick a cell size that fits both width and height of the slot,
      // minus a small inset margin (~10 px) so blocks don't touch the panel edges.
      const cell = Math.min(
        (W - 10) / trimmed[0].length,
        (slotH - 10) / trimmed.length
      );
      const w = cell * trimmed[0].length;
      const h = cell * trimmed.length;
      const ox = (W - w) / 2;                    // center horizontally
      const oy = i * slotH + (slotH - h) / 2;    // center vertically in slot
      for (let y = 0; y < trimmed.length; y++) {
        for (let x = 0; x < trimmed[y].length; x++) {
          if (!trimmed[y][x]) continue;
          drawCell(ctx, ox + x * cell, oy + y * cell, cell, pieceColor(t), style, { ghost });
        }
      }
    });
  }

  drawHold(engine) {
    // `engine.hold` is a single type letter or null. The renderer accepts an
    // array, so wrap into an array if held, or pass empty array if not.
    // When the slot is empty, show a low-opacity ghost of the CURRENT piece
    // so the panel never looks empty — it hints at what hitting C will store.
    if (engine.hold) {
      this.drawMini(this.holdCtx, this.holdCanvas, [engine.hold]);
    } else if (engine.current?.type) {
      this.drawMini(this.holdCtx, this.holdCanvas, [engine.current.type], { ghost: true });
    } else {
      this.drawMini(this.holdCtx, this.holdCanvas, []);
    }
  }

  drawNext(engine) {
    // Show the next 4 upcoming pieces from the queue.
    this.drawMini(this.nextCtx, this.nextCanvas, (engine.queue || []).slice(0, 4));
  }

  // Single per-frame entry point. Call this from your animation loop.
  draw(engine) {
    this.drawBoard(engine);
    this.drawHold(engine);
    this.drawNext(engine);
  }
}

// ---------------------------------------------------------------------------
// trim — shrink a 4×4 (or 3×3) piece matrix to its tight bounding box, so
// the renderer can center it inside a preview slot without huge empty margins.
// ---------------------------------------------------------------------------
// Returns a new matrix containing only the rows from the first non-empty row
// to the last non-empty row, and columns from the leftmost to rightmost
// non-empty column.
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
  // Find the first row that actually has a filled cell — top is the entry point.
  let realTop = m.length;
  for (let y = 0; y < m.length; y++) if (m[y].some(v => v)) { realTop = y; break; }
  const out = [];
  for (let y = realTop; y <= bot; y++) {
    out.push(m[y].slice(left, right + 1));
  }
  return out;
}
