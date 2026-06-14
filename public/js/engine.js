// tetris — engine.js
// ============================================================================
// PURE GAME LOGIC. No DOM, no canvas, no audio, no setTimeout.
//
// Reading this file teaches you the rules of Tetris in code. Every modern
// Tetris ("guideline-compliant") game implements roughly the same machinery:
//
//   - a 10×20 visible playfield with 2 hidden rows above (where pieces spawn)
//   - a "7-bag" piece generator (random but fair)
//   - the Super Rotation System (SRS) for wall kicks
//   - hold, ghost piece, lock delay, soft/hard drop
//   - a scoring curve that rewards combos and Tetrises
//
// The whole module exports two things: the PIECES table and the Engine class.
// Everything else is private. The Engine is a pure object-over-time: feed it
// inputs (move/rotate/drop/...) and `tick(dt)`, read its public state to
// render and to compute score. There is no I/O.
//
// Why does this matter? Because separating game logic from rendering means:
//   - you can unit-test the engine
//   - you can swap renderers (canvas, WebGL, SVG, ASCII)
//   - "is this a render bug or a logic bug?" becomes obvious — log the board
//   - you can even run the engine in a Web Worker
// ============================================================================

// ---------------------------------------------------------------------------
// Board geometry
// ---------------------------------------------------------------------------
// The visible playfield is 10 wide × 20 tall. We keep 2 extra rows above the
// visible area where new pieces spawn — this lets a piece exist before it
// becomes visible, and is the canonical way the modern guideline handles
// "top out" (game over): if a piece cannot leave the hidden rows, you lost.
export const COLS = 10;
export const ROWS = 20;
export const HIDDEN = 2;
export const TOTAL_ROWS = ROWS + HIDDEN;

// ---------------------------------------------------------------------------
// The seven tetrominoes
// ---------------------------------------------------------------------------
// Each piece is defined by a square matrix at spawn rotation. We use a square
// matrix (not a tight bounding box) because rotation is implemented as matrix
// transposition + reversal, and square matrices rotate cleanly in place.
//
// The I-piece needs a 4×4 matrix so that its rotations stay symmetric around
// the same center. The O-piece uses 2×2 because it has no meaningful rotation.
// J, L, S, T, Z all use 3×3.
//
// We don't store color per piece — we store the piece *type* as a one-letter
// tag and look up the color from a CSS custom property (`--piece-T` etc.)
// at draw time. This is how the renderer ends up theme-aware "for free".
export const PIECES = {
  I: { color: 'I', matrix: [
    [0,0,0,0],
    [1,1,1,1],
    [0,0,0,0],
    [0,0,0,0],
  ]},
  O: { color: 'O', matrix: [
    [1,1],
    [1,1],
  ]},
  T: { color: 'T', matrix: [
    [0,1,0],
    [1,1,1],
    [0,0,0],
  ]},
  S: { color: 'S', matrix: [
    [0,1,1],
    [1,1,0],
    [0,0,0],
  ]},
  Z: { color: 'Z', matrix: [
    [1,1,0],
    [0,1,1],
    [0,0,0],
  ]},
  J: { color: 'J', matrix: [
    [1,0,0],
    [1,1,1],
    [0,0,0],
  ]},
  L: { color: 'L', matrix: [
    [0,0,1],
    [1,1,1],
    [0,0,0],
  ]},
};

const PIECE_KEYS = Object.keys(PIECES);

// ---------------------------------------------------------------------------
// Super Rotation System (SRS) — wall kicks
// ---------------------------------------------------------------------------
// When you rotate a piece, it might overlap the wall or the stack. SRS says:
// don't reject the rotation immediately — try a list of "kick offsets" that
// nudge the piece by 0/1/2 cells in x/y; if any of them clear the obstacle,
// the rotation succeeds at that offset. This is what produces "T-spins" and
// makes Tetris feel modern.
//
// The keys look like '0>1' which reads "rotating from rotation state 0 to 1".
// Rotation states cycle 0→1→2→3→0 (CW) and 0→3→2→1→0 (CCW).
//
// Each value is the list of [dx, dy] offsets to try, IN ORDER. The first one
// that produces a non-colliding placement wins. (Note: in this codebase we
// flip the sign of y when applying — see rotate() below.)
//
// The I-piece has its own kick table because its center-of-rotation differs
// from the 3×3 pieces. This is the Tetris Guideline's actual data; we're just
// transcribing it.
const KICKS_JLSTZ = {
  '0>1': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
  '1>0': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
  '1>2': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
  '2>1': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
  '2>3': [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
  '3>2': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
  '3>0': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
  '0>3': [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
};
const KICKS_I = {
  '0>1': [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
  '1>0': [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
  '1>2': [[0,0],[-1,0],[2,0],[-1,2],[2,-1]],
  '2>1': [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
  '2>3': [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
  '3>2': [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
  '3>0': [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
  '0>3': [[0,0],[-1,0],[2,0],[-1,2],[2,-1]],
};

// Rotate a square matrix 90° clockwise (dir > 0) or counter-clockwise.
// Classic transpose-then-reverse, written out explicitly so it's obvious what
// each cell ends up where. n is the matrix side length.
function rotateMatrix(m, dir = 1) {
  const n = m.length;
  const out = Array.from({length: n}, () => new Array(n).fill(0));
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (dir > 0) out[x][n - 1 - y] = m[y][x];   // CW: (y,x) -> (x, n-1-y)
      else         out[n - 1 - x][y] = m[y][x];   // CCW: (y,x) -> (n-1-x, y)
    }
  }
  return out;
}

// Create an empty board: TOTAL_ROWS rows × COLS columns, all zeros.
// A zero means "empty cell". A non-zero value is a piece-type letter
// ('I','O','T','S','Z','J','L') marking that locked cells belong to that
// type — used at draw time to color the cell.
function emptyBoard() {
  const b = [];
  for (let y = 0; y < TOTAL_ROWS; y++) b.push(new Array(COLS).fill(0));
  return b;
}

// ===========================================================================
// Engine
// ===========================================================================
// The whole game-state machine. Construct once, call reset() to start a new
// game, and call tick(dtMs) every frame from the render loop. Apply player
// input by calling move/rotate/softDrop/hardDrop/holdPiece.
//
// External code never mutates board/current/queue directly — they read them.
// ===========================================================================
export class Engine {
  constructor() {
    this.reset();
  }

  // Initialize/reinitialize all game state. Called by the constructor and
  // whenever the player picks "play again".
  reset() {
    this.board = emptyBoard();
    this.bag = [];            // current 7-bag (refilled when empty)
    this.queue = [];          // upcoming pieces shown in the "next" panel
    this.refillQueue();
    this.current = this.spawn();
    this.hold = null;         // type letter or null
    this.canHold = true;      // hold once per piece (resets when piece locks)
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.startedAt = performance.now();
    this.gameOver = false;
    this.paused = false;
    this.dropTimer = 0;       // ms accumulator for gravity
    this.lockTimer = 0;       // ms a piece has rested on the stack
    this.lockMax = 500;       // ms before a resting piece locks (lock delay)
    this.softDropping = false;
    this.lastClear = null;    // { n, pts } for the UI/audio to consume once
    this.combo = -1;          // -1 = no combo running; 0+ = current streak
    this.b2b = false;         // back-to-back Tetris flag
  }

  // ------- 7-bag random generator -------
  // The "bag" is a shuffle of all 7 piece keys. We deal from the bag, and
  // when it's empty we reshuffle. This guarantees every 7 pieces include
  // exactly one of each type — the player never goes 90 seconds without
  // seeing an I-piece. Pure Math.random() famously doesn't feel fair;
  // the bag is how every modern Tetris implementation fixes that.
  refillQueue() {
    while (this.queue.length < 5) {
      if (this.bag.length === 0) {
        this.bag = [...PIECE_KEYS];
        // Fisher–Yates shuffle (in-place, O(n), unbiased).
        for (let i = this.bag.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
        }
      }
      this.queue.push(this.bag.shift());
    }
  }

  // Spawn a new piece. If `type` is given (e.g. coming out of hold) we use it,
  // otherwise we pop from the queue and refill it. The piece is positioned
  // centered horizontally, with one row peeking into the hidden rows above
  // the visible board. If it can't even spawn without colliding, the game
  // ends (the board is full).
  spawn(type) {
    if (!type) {
      this.refillQueue();
      type = this.queue.shift();
      this.refillQueue();
    }
    const piece = PIECES[type];
    const matrix = piece.matrix.map(r => r.slice());   // defensive copy
    const w = matrix[0].length;
    const piece_obj = {
      type, matrix,
      x: Math.floor((COLS - w) / 2),
      // 4×4 pieces (I) start a bit higher than 3×3 ones so their visible row
      // appears at the top of the visible board, not 1 row below it.
      y: HIDDEN - (matrix.length > 2 ? 2 : 1),
      rot: 0,
    };
    if (this.collides(piece_obj, 0, 0)) {
      this.gameOver = true;
    }
    return piece_obj;
  }

  // ------- Collision check -------
  // Given a piece and a candidate offset (dx, dy), does the piece overlap
  // a wall, the floor, or a locked cell? Optionally pass a different matrix
  // (used during rotation to test the rotated shape before committing it).
  // Returns true on collision, false otherwise.
  //
  // We allow negative ny (above the visible area) — only the floor and walls
  // are hard limits, and the cell test is skipped above the board.
  collides(piece, dx, dy, matrix) {
    const m = matrix || piece.matrix;
    for (let y = 0; y < m.length; y++) {
      for (let x = 0; x < m[y].length; x++) {
        if (!m[y][x]) continue;                       // empty cell of piece
        const nx = piece.x + x + dx;
        const ny = piece.y + y + dy;
        if (nx < 0 || nx >= COLS) return true;        // off left/right wall
        if (ny >= TOTAL_ROWS) return true;            // through the floor
        if (ny >= 0 && this.board[ny][nx]) return true;  // hits stacked cell
      }
    }
    return false;
  }

  // ------- Movement -------
  // Translate by ±1 column. Resetting lockTimer on a successful move is what
  // gives the player the "infinity"-style grace period when sliding a piece
  // along the floor — every successful movement re-arms the lock window.
  move(dx) {
    if (this.gameOver || this.paused) return false;
    if (!this.collides(this.current, dx, 0)) {
      this.current.x += dx;
      this.lockTimer = 0;
      return true;
    }
    return false;
  }

  // Soft drop: drop one row, score +1 point per cell. Player-driven.
  softDrop() {
    if (this.gameOver || this.paused) return false;
    if (!this.collides(this.current, 0, 1)) {
      this.current.y += 1;
      this.score += 1;
      this.lockTimer = 0;
      return true;
    }
    return false;
  }

  // Hard drop: teleport piece to its ghost position, score +2 per cell, lock
  // immediately. Returns the number of cells dropped (used for analytics).
  hardDrop() {
    if (this.gameOver || this.paused) return 0;
    let cells = 0;
    while (!this.collides(this.current, 0, 1)) {
      this.current.y += 1;
      cells++;
    }
    this.score += cells * 2;
    this.lockPiece();
    return cells;
  }

  // ------- Rotation with SRS kicks -------
  // 1. Compute the rotated shape (matrix transpose + reverse).
  // 2. Look up the kick table for this (from-rotation, to-rotation).
  // 3. Try each kick offset in order; the first one that doesn't collide
  //    is committed. If none work, the rotation is rejected.
  // The O-piece is a square — rotating it changes nothing, so we just
  // short-circuit and return false to save a kick-table miss.
  rotate(dir = 1) {
    if (this.gameOver || this.paused) return false;
    if (this.current.type === 'O') return false;
    const oldRot = this.current.rot;
    const newRot = (oldRot + (dir > 0 ? 1 : 3)) % 4;
    const rotated = rotateMatrix(this.current.matrix, dir);
    const kicks = (this.current.type === 'I' ? KICKS_I : KICKS_JLSTZ)[`${oldRot}>${newRot}`] || [[0,0]];
    for (const [kx, ky] of kicks) {
      // Note: SRS table y-axis is up-positive ("kick up by 1"). Our board
      // y-axis is down-positive. We negate ky on application accordingly.
      if (!this.collides(this.current, kx, -ky, rotated)) {
        this.current.matrix = rotated;
        this.current.x += kx;
        this.current.y += -ky;
        this.current.rot = newRot;
        this.lockTimer = 0;
        return true;
      }
    }
    return false;
  }

  // ------- Hold -------
  // Swap the current piece with the hold slot. If hold is empty, deposit the
  // current piece there and spawn the next one from the queue. canHold blocks
  // hold-spamming: you only get one hold per piece, reset on lock.
  holdPiece() {
    if (this.gameOver || this.paused || !this.canHold) return false;
    if (this.hold == null) {
      this.hold = this.current.type;
      this.current = this.spawn();
    } else {
      const prevHold = this.hold;
      this.hold = this.current.type;
      this.current = this.spawn(prevHold);
    }
    this.canHold = false;
    this.lockTimer = 0;
    return true;
  }

  // Compute the ghost-piece Y: how many rows down can current drop without
  // colliding? Used by the renderer to draw the translucent landing preview.
  ghostY() {
    let y = 0;
    while (!this.collides(this.current, 0, y + 1)) y++;
    return this.current.y + y;
  }

  // ------- Locking -------
  // Stamp the current piece's cells onto the board, then check for line
  // clears and apply score. If the locked cells are all inside the hidden
  // rows, that's a "top out" — the stack reached the spawn area → game over.
  lockPiece() {
    const p = this.current;
    let topOut = true;
    for (let y = 0; y < p.matrix.length; y++) {
      for (let x = 0; x < p.matrix[y].length; x++) {
        if (!p.matrix[y][x]) continue;
        const by = p.y + y, bx = p.x + x;
        if (by >= 0 && by < TOTAL_ROWS) {
          this.board[by][bx] = p.type;
          if (by >= HIDDEN) topOut = false;
        }
      }
    }
    if (topOut) { this.gameOver = true; return; }
    const cleared = this.clearLines();
    this.applyScore(cleared);
    this.current = this.spawn();
    this.canHold = true;
    this.lockTimer = 0;
  }

  // Find full rows, remove them, prepend empty rows at the top to maintain
  // board height. Returns the count (0..4) for scoring.
  clearLines() {
    const cleared = [];
    for (let y = TOTAL_ROWS - 1; y >= 0; y--) {
      if (this.board[y].every(c => c !== 0)) cleared.push(y);
    }
    if (cleared.length) {
      for (const y of cleared) this.board.splice(y, 1);
      for (let i = 0; i < cleared.length; i++) this.board.unshift(new Array(COLS).fill(0));
    }
    return cleared.length;
  }

  // ------- Scoring -------
  // Guideline-ish curve:
  //   1 line  → 100 × level   (single)
  //   2 lines → 300 × level   (double)
  //   3 lines → 500 × level   (triple)
  //   4 lines → 800 × level   (Tetris)
  // Plus +50 × combo × level for each consecutive clear after the first.
  // A back-to-back Tetris (Tetris immediately after another Tetris with no
  // non-Tetris clear in between) gets a ×1.5 multiplier.
  applyScore(n) {
    if (n === 0) { this.combo = -1; this.lastClear = null; return; }
    const base = [0, 100, 300, 500, 800][n] || 800;
    let pts = base * this.level;
    this.combo += 1;
    if (this.combo > 0) pts += 50 * this.combo * this.level;
    if (n === 4) {
      if (this.b2b) pts = Math.floor(pts * 1.5);
      this.b2b = true;
    } else {
      this.b2b = false;
    }
    this.score += pts;
    this.lines += n;
    this.level = 1 + Math.floor(this.lines / 10);
    this.lastClear = { n, pts };
  }

  // Gravity curve: starts at 1000 ms/cell at level 1, multiplied by 0.85 per
  // level, clamped at 50 ms minimum. This produces the classic Tetris ramp:
  // playable at low levels, brutal by level 15+.
  gravityMs() {
    const lvl = Math.min(this.level, 20);
    return Math.max(50, Math.round(1000 * Math.pow(0.85, lvl - 1)));
  }

  // ------- The clock -------
  // Called every frame with dt = milliseconds since last frame. We accumulate
  // dt and drop the piece by one cell each time the accumulator reaches
  // gravityMs. If the piece can't drop (resting on the stack), we accumulate
  // into lockTimer instead — when it reaches lockMax, the piece locks.
  //
  // Using milliseconds instead of frames means the game plays the same on a
  // 30 Hz mobile screen, a 60 Hz monitor, and a 144 Hz gamer rig.
  tick(dtMs) {
    if (this.gameOver || this.paused) return;
    this.dropTimer += dtMs;
    const speed = this.softDropping ? Math.min(50, this.gravityMs()) : this.gravityMs();
    if (this.dropTimer >= speed) {
      this.dropTimer = 0;
      if (!this.collides(this.current, 0, 1)) {
        this.current.y += 1;
        if (this.softDropping) this.score += 1;
      } else {
        // The piece is resting — accrue lock delay. If we exceed lockMax, lock.
        // Any successful move/rotate elsewhere resets lockTimer to 0, giving
        // the player a chance to slide pieces along the floor.
        this.lockTimer += speed;
        if (this.lockTimer >= this.lockMax) {
          this.lockPiece();
        }
      }
    }
  }

  togglePause() {
    if (this.gameOver) return;
    this.paused = !this.paused;
  }

  elapsedMs() {
    return performance.now() - this.startedAt;
  }
}
