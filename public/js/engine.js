// tetris — engine.js
// Pure game logic. No DOM. Modern Tetris guideline-ish:
// - 10×20 visible board with 2 hidden rows above
// - 7-bag random generator
// - SRS kicks (basic), hold, ghost piece, lock delay
// - Scoring: 100/300/500/800 × level (+ soft drop 1/cell, hard drop 2/cell)

export const COLS = 10;
export const ROWS = 20;
export const HIDDEN = 2;
export const TOTAL_ROWS = ROWS + HIDDEN;

// Tetrominoes — 4×4 matrices for each piece at spawn rotation
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

// SRS-ish wall kicks (simplified). Same for J/L/S/T/Z; I has its own.
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

function rotateMatrix(m, dir = 1) {
  const n = m.length;
  const out = Array.from({length: n}, () => new Array(n).fill(0));
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (dir > 0) out[x][n - 1 - y] = m[y][x];
      else out[n - 1 - x][y] = m[y][x];
    }
  }
  return out;
}

function emptyBoard() {
  const b = [];
  for (let y = 0; y < TOTAL_ROWS; y++) b.push(new Array(COLS).fill(0));
  return b;
}

export class Engine {
  constructor() {
    this.reset();
  }

  reset() {
    this.board = emptyBoard();
    this.bag = [];
    this.queue = [];
    this.refillQueue();
    this.current = this.spawn();
    this.hold = null;
    this.canHold = true;
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.startedAt = performance.now();
    this.gameOver = false;
    this.paused = false;
    this.dropTimer = 0;
    this.lockTimer = 0;
    this.lockMax = 500;
    this.softDropping = false;
    this.lastClear = null;
    this.combo = -1;
    this.b2b = false;
  }

  refillQueue() {
    while (this.queue.length < 5) {
      if (this.bag.length === 0) {
        this.bag = [...PIECE_KEYS];
        // Fisher–Yates
        for (let i = this.bag.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
        }
      }
      this.queue.push(this.bag.shift());
    }
  }

  spawn(type) {
    if (!type) {
      this.refillQueue();
      type = this.queue.shift();
      this.refillQueue();
    }
    const piece = PIECES[type];
    const matrix = piece.matrix.map(r => r.slice());
    const w = matrix[0].length;
    const piece_obj = {
      type, matrix,
      x: Math.floor((COLS - w) / 2),
      y: HIDDEN - (matrix.length > 2 ? 2 : 1), // peek into hidden rows
      rot: 0,
    };
    if (this.collides(piece_obj, 0, 0)) {
      this.gameOver = true;
    }
    return piece_obj;
  }

  collides(piece, dx, dy, matrix) {
    const m = matrix || piece.matrix;
    for (let y = 0; y < m.length; y++) {
      for (let x = 0; x < m[y].length; x++) {
        if (!m[y][x]) continue;
        const nx = piece.x + x + dx;
        const ny = piece.y + y + dy;
        if (nx < 0 || nx >= COLS) return true;
        if (ny >= TOTAL_ROWS) return true;
        if (ny >= 0 && this.board[ny][nx]) return true;
      }
    }
    return false;
  }

  move(dx) {
    if (this.gameOver || this.paused) return false;
    if (!this.collides(this.current, dx, 0)) {
      this.current.x += dx;
      this.lockTimer = 0;
      return true;
    }
    return false;
  }

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

  rotate(dir = 1) {
    if (this.gameOver || this.paused) return false;
    if (this.current.type === 'O') return false;
    const oldRot = this.current.rot;
    const newRot = (oldRot + (dir > 0 ? 1 : 3)) % 4;
    const rotated = rotateMatrix(this.current.matrix, dir);
    const kicks = (this.current.type === 'I' ? KICKS_I : KICKS_JLSTZ)[`${oldRot}>${newRot}`] || [[0,0]];
    for (const [kx, ky] of kicks) {
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

  ghostY() {
    let y = 0;
    while (!this.collides(this.current, 0, y + 1)) y++;
    return this.current.y + y;
  }

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

  gravityMs() {
    // ms per cell drop. Tetris-ish curve: starts at 1000ms, halves every few levels.
    const lvl = Math.min(this.level, 20);
    return Math.max(50, Math.round(1000 * Math.pow(0.85, lvl - 1)));
  }

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
